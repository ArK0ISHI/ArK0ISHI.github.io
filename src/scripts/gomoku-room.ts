import {
  BLACK,
  Board,
  EMPTY,
  WHITE,
  analyzeMove,
  candidateOpeningShapeSignature,
  chooseMove,
  createOpeningState,
  evaluateMovePotential,
  evaluatePosition,
  generateCandidateMoves,
  getOpeningPhaseInstruction,
  isInCentralSquare,
  otherPlayer,
  seatForColor,
  transitionOpening,
  type Difficulty,
  type GameResult,
  type Move,
  type OpeningAction,
  type OpeningPhaseInstruction,
  type OpeningState,
  type PlayedMove,
  type Player,
  type PlayerSeat,
  type Ruleset,
  type SearchIteration,
  type SearchResult,
} from '../lib/gomoku';

type RuleMode = 'freestyle' | 'renju' | 'classic' | 'taraguchi10';
type Actor = 'human' | 'computer';

type RecordEvent =
  | { type: 'stone'; move: PlayedMove }
  | { type: 'pass'; player: Player }
  | { type: 'color-choice'; seat: PlayerSeat; color: Player; swap: boolean }
  | { type: 'branch'; seat: PlayerSeat; decision: 'continue' | 'swap' | 'offer-ten' }
  | { type: 'offer'; seat: PlayerSeat; candidates: Move[] }
  | { type: 'choose'; seat: PlayerSeat; candidate: Move };

interface EngineReadout {
  depth: number;
  nodes: number;
  elapsedMs: number;
  pv: readonly Move[];
  state: 'standby' | 'thinking' | 'complete' | 'hint';
}

interface GameSnapshot {
  ruleMode: RuleMode;
  difficulty: Difficulty;
  humanSeat: PlayerSeat;
  moves: PlayedMove[];
  openingState: OpeningState | null;
  normalTurn: Player;
  result: GameResult;
  passCount: number;
  proposals: Move[];
  events: RecordEvent[];
}

interface UndoEntry {
  actor: Actor;
  snapshot: GameSnapshot;
}

interface StoredGame extends GameSnapshot {
  version: 1;
  savedAt: number;
}

const BOARD_SIZE = 15;
const CENTER = 7;
const LETTERS = 'ABCDEFGHIJKLMNO';
const STORAGE_KEY = 'ar-gomoku-room-v1';
const PREFS_KEY = 'ar-gomoku-prefs-v1';

const RULE_LABELS: Record<RuleMode, string> = {
  freestyle: '自由规则',
  renju: '连珠禁手',
  classic: '五手两打',
  taraguchi10: '塔拉山口‑10',
};

const RULE_NOTES: Record<RuleMode, string> = {
  freestyle: '黑白双方五子或长连都获胜，黑方先行。',
  renju: '黑方长连、四四与三三判负；黑方第一手固定在天元。',
  classic: '开局席摆前三手，应手席选色；第五手提供两个不同形候选。',
  taraguchi10: '依次经过 1、3、5、7、9 路区域与换色选择，也可提出十个第五手。',
};

const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  easy: '约 0.09 秒，会在几种可行落点中留一点随意。',
  normal: '约 0.26 秒，三层迭代搜索。',
  hard: '约 1 秒，五层迭代搜索。',
  lunatic: '约 3.5 秒，七层搜索与更宽的候选集。',
};

const FORBIDDEN_LABELS = {
  overline: '长连',
  'double-four': '四四',
  'double-three': '三三',
} as const;

const CLASSIC_PHASE_MOVE_COUNTS: Readonly<Record<string, number>> = {
  'place-first': 0,
  'place-second': 1,
  'place-third': 2,
  'choose-colors': 3,
  'place-fourth': 3,
  'offer-fifth': 4,
  'choose-fifth': 4,
  'place-sixth': 5,
  complete: 6,
};

const TARAGUCHI_PHASE_MOVE_COUNTS: Readonly<Record<string, number>> = {
  'place-first': 0,
  'swap-after-first': 1,
  'place-second': 1,
  'swap-after-second': 2,
  'place-third': 2,
  'swap-after-third': 3,
  'place-fourth': 3,
  'choose-after-fourth': 4,
  'place-fifth': 4,
  'swap-after-fifth': 5,
  'offer-fifth': 4,
  'choose-fifth': 4,
  'place-sixth': 5,
  complete: 6,
};

function isRuleMode(value: string): value is RuleMode {
  return value === 'freestyle' || value === 'renju' || value === 'classic' || value === 'taraguchi10';
}

function isDifficulty(value: string): value is Difficulty {
  return value === 'easy' || value === 'normal' || value === 'hard' || value === 'lunatic';
}

function isSeat(value: string): value is PlayerSeat {
  return value === 'first' || value === 'second';
}

function cloneMove(move: Move): Move {
  return { x: move.x, y: move.y };
}

function cloneMoves(moves: readonly PlayedMove[]): PlayedMove[] {
  return moves.map((move) => ({ x: move.x, y: move.y, player: move.player }));
}

function cloneOpening(state: OpeningState | null): OpeningState | null {
  if (state === null) return null;
  return JSON.parse(JSON.stringify(state)) as OpeningState;
}

function cloneResult(result: GameResult): GameResult {
  if (result.kind === 'win') {
    return { kind: 'win', winner: result.winner, line: result.line.map(cloneMove) };
  }
  if (result.kind === 'forbidden') return { ...result };
  return { ...result };
}

function cloneRecordEvent(event: RecordEvent): RecordEvent {
  if (event.type === 'stone') return { type: 'stone', move: { ...event.move } };
  if (event.type === 'offer') return { ...event, candidates: event.candidates.map(cloneMove) };
  if (event.type === 'choose') return { ...event, candidate: cloneMove(event.candidate) };
  return { ...event };
}

function eventFromMove(move: PlayedMove): RecordEvent {
  return { type: 'stone', move: { ...move } };
}

function moveName(move: Move): string {
  return `${LETTERS[move.x] ?? '?'}${BOARD_SIZE - move.y}`;
}

function playerName(player: Player): string {
  return player === BLACK ? '黑方' : '白方';
}

function seatName(seat: PlayerSeat): string {
  return seat === 'first' ? 'A 席' : 'B 席';
}

function roleName(actor: Actor): string {
  return actor === 'human' ? '你' : '电脑';
}

function formatNodes(nodes: number): string {
  if (nodes >= 1_000_000) return `${(nodes / 1_000_000).toFixed(2)}m`;
  if (nodes >= 1_000) return `${(nodes / 1_000).toFixed(1)}k`;
  return String(nodes);
}

function isPlayedMove(value: unknown): value is PlayedMove {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Partial<PlayedMove>;
  return Number.isInteger(move.x) && Number.isInteger(move.y) &&
    (move.player === BLACK || move.player === WHITE) &&
    (move.x ?? -1) >= 0 && (move.x ?? BOARD_SIZE) < BOARD_SIZE &&
    (move.y ?? -1) >= 0 && (move.y ?? BOARD_SIZE) < BOARD_SIZE;
}

function isMove(value: unknown): value is Move {
  if (typeof value !== 'object' || value === null) return false;
  const move = value as Partial<Move>;
  return Number.isInteger(move.x) && Number.isInteger(move.y) &&
    (move.x ?? -1) >= 0 && (move.x ?? BOARD_SIZE) < BOARD_SIZE &&
    (move.y ?? -1) >= 0 && (move.y ?? BOARD_SIZE) < BOARD_SIZE;
}

function hasUniqueCoordinates(moves: readonly Move[]): boolean {
  return new Set(moves.map((move) => `${move.x},${move.y}`)).size === moves.length;
}

function isOpeningState(value: unknown): value is OpeningState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  const protocol = state.protocol;
  const phase = state.phase;
  if (protocol !== 'classic-rif' && protocol !== 'taraguchi-10') return false;
  if (typeof phase !== 'string' || state.boardSize !== BOARD_SIZE) return false;

  const phaseMoveCounts = protocol === 'classic-rif'
    ? CLASSIC_PHASE_MOVE_COUNTS
    : TARAGUCHI_PHASE_MOVE_COUNTS;
  const expectedMoveCount = phaseMoveCounts[phase];
  if (expectedMoveCount === undefined) return false;

  if (typeof state.colors !== 'object' || state.colors === null) return false;
  const colors = state.colors as Record<string, unknown>;
  if (!((colors.first === BLACK && colors.second === WHITE) ||
    (colors.first === WHITE && colors.second === BLACK))) return false;

  if (!Array.isArray(state.moves) || state.moves.length !== expectedMoveCount || !state.moves.every(isPlayedMove)) return false;
  const moves = state.moves as PlayedMove[];
  if (!hasUniqueCoordinates(moves) || moves.some((move, index) => move.player !== (index % 2 === 0 ? BLACK : WHITE))) return false;

  if (phase !== 'choose-fifth') return state.candidates === undefined;
  const expectedCandidateCount = protocol === 'classic-rif' ? 2 : 10;
  if (!Array.isArray(state.candidates) || state.candidates.length !== expectedCandidateCount || !state.candidates.every(isMove)) return false;
  const candidates = state.candidates as Move[];
  return hasUniqueCoordinates(candidates) && candidates.every((candidate) =>
    !moves.some((move) => move.x === candidate.x && move.y === candidate.y));
}

function isGameResult(value: unknown): value is GameResult {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  if (result.kind === 'playing' || result.kind === 'draw') return true;
  if (result.kind === 'win') {
    return (result.winner === BLACK || result.winner === WHITE) &&
      Array.isArray(result.line) && result.line.length >= 5 && result.line.every(isMove);
  }
  return result.kind === 'forbidden' && result.winner === WHITE && result.loser === BLACK &&
    (result.reason === 'overline' || result.reason === 'double-four' || result.reason === 'double-three');
}

function isRecordEvent(value: unknown): value is RecordEvent {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const event = value as Partial<RecordEvent> & Record<string, unknown>;
  if (event.type === 'stone') return isPlayedMove(event.move);
  if (event.type === 'pass') return event.player === BLACK || event.player === WHITE;
  if (event.type === 'color-choice') {
    return isSeat(String(event.seat)) && (event.color === BLACK || event.color === WHITE) && typeof event.swap === 'boolean';
  }
  if (event.type === 'branch') {
    return isSeat(String(event.seat)) && (event.decision === 'continue' || event.decision === 'swap' || event.decision === 'offer-ten');
  }
  if (event.type === 'offer') {
    return isSeat(String(event.seat)) && Array.isArray(event.candidates) && event.candidates.every(isMove);
  }
  if (event.type === 'choose') return isSeat(String(event.seat)) && isMove(event.candidate);
  return false;
}

function recordEventLabel(event: Exclude<RecordEvent, { type: 'stone' }>): string {
  if (event.type === 'pass') return `${playerName(event.player)}停一手`;
  if (event.type === 'color-choice') {
    return `${seatName(event.seat)}${event.swap ? '换色为' : '保留'}${playerName(event.color)}`;
  }
  if (event.type === 'branch') {
    const decision = event.decision === 'continue'
      ? '保留黑方，单点第五手'
      : event.decision === 'swap'
        ? '交换为白方'
        : '保留黑方，十点候选';
    return `${seatName(event.seat)}：${decision}`;
  }
  if (event.type === 'offer') return `${seatName(event.seat)}提出 ${event.candidates.map(moveName).join('、')}`;
  return `${seatName(event.seat)}选择 ${moveName(event.candidate)}`;
}

class GomokuRoomElement extends HTMLElement {
  private initialized = false;
  private board = new Board(BOARD_SIZE);
  private moves: PlayedMove[] = [];
  private ruleMode: RuleMode = 'freestyle';
  private difficulty: Difficulty = 'normal';
  private humanSeat: PlayerSeat = 'first';
  private openingState: OpeningState | null = null;
  private normalTurn: Player = BLACK;
  private result: GameResult = { kind: 'playing' };
  private passCount = 0;
  private proposals: Move[] = [];
  private events: RecordEvent[] = [];
  private hint: Move | null = null;
  private thinking = false;
  private reviewIndex: number | null = null;
  private undoStack: UndoEntry[] = [];
  private engine: EngineReadout = {
    depth: 0,
    nodes: 0,
    elapsedMs: 0,
    pv: [],
    state: 'standby',
  };
  private searchAbort: AbortController | null = null;
  private computerTimer = 0;
  private toastTimer = 0;
  private forbiddenRevision = 0;
  private gameVersion = 0;
  private audioContext: AudioContext | null = null;

  private ruleSelect!: HTMLSelectElement;
  private difficultySelect!: HTMLSelectElement;
  private seatSelect!: HTMLSelectElement;
  private numbersInput!: HTMLInputElement;
  private forbiddenInput!: HTMLInputElement;
  private soundInput!: HTMLInputElement;
  private cells: HTMLButtonElement[] = [];

  connectedCallback(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.captureElements();
    this.bindEvents();
    this.loadPreferences();
    if (!this.restoreGame()) this.startNewGame(false);
    else {
      this.updateSetupCopy();
      this.render();
      this.queueComputer();
    }
  }

  disconnectedCallback(): void {
    this.cancelAsyncWork();
  }

  private query<T extends Element>(selector: string): T {
    const element = this.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing Gomoku element: ${selector}`);
    return element;
  }

  private captureElements(): void {
    this.ruleSelect = this.query('[data-gomoku-rule]');
    this.difficultySelect = this.query('[data-gomoku-difficulty]');
    this.seatSelect = this.query('[data-gomoku-seat]');
    this.numbersInput = this.query('[data-gomoku-numbers]');
    this.forbiddenInput = this.query('[data-gomoku-forbidden]');
    this.soundInput = this.query('[data-gomoku-sound]');
    this.cells = Array.from(this.querySelectorAll<HTMLButtonElement>('[data-gomoku-board] .gomoku-cell'));
  }

  private bindEvents(): void {
    this.query<HTMLButtonElement>('[data-gomoku-new]').addEventListener('click', () => this.startNewGame(true));
    this.query<HTMLButtonElement>('[data-gomoku-undo]').addEventListener('click', () => this.undo());
    this.query<HTMLButtonElement>('[data-gomoku-hint]').addEventListener('click', () => void this.requestHint());
    this.query<HTMLButtonElement>('[data-gomoku-pass]').addEventListener('click', () => this.pass());
    this.query<HTMLButtonElement>('[data-gomoku-copy]').addEventListener('click', () => void this.copyRecord());
    this.query<HTMLButtonElement>('[data-gomoku-review-exit]').addEventListener('click', () => this.exitReview());

    this.ruleSelect.addEventListener('change', () => {
      this.updateSetupCopy();
      this.startNewGame(true);
    });
    this.difficultySelect.addEventListener('change', () => {
      if (isDifficulty(this.difficultySelect.value)) this.difficulty = this.difficultySelect.value;
      this.updateSetupCopy();
      this.savePreferences();
      this.saveGame();
    });
    this.seatSelect.addEventListener('change', () => this.savePreferences());

    for (const input of [this.numbersInput, this.forbiddenInput, this.soundInput]) {
      input.addEventListener('change', () => {
        this.savePreferences();
        this.renderBoard();
      });
    }

    for (const cell of this.cells) {
      cell.addEventListener('click', () => this.handleCell(cell));
      cell.addEventListener('focus', () => this.setRovingCell(cell));
    }
    this.query<HTMLElement>('[data-gomoku-board]').addEventListener('keydown', (event) => this.handleBoardKey(event));

    this.query<HTMLInputElement>('[data-gomoku-review-range]').addEventListener('input', (event) => {
      const target = event.currentTarget as HTMLInputElement;
      this.enterReview(Number(target.value));
    });
  }

  private enterReview(index: number): void {
    if (this.reviewIndex === null) this.cancelAsyncWork();
    this.hint = null;
    this.reviewIndex = Math.max(0, Math.min(this.moves.length, index));
    this.render();
  }

  private cancelAsyncWork(): void {
    this.gameVersion += 1;
    this.searchAbort?.abort();
    this.searchAbort = null;
    window.clearTimeout(this.computerTimer);
    window.clearTimeout(this.toastTimer);
    this.computerTimer = 0;
    this.thinking = false;
    this.forbiddenRevision += 1;
  }

  private startNewGame(announce: boolean): void {
    this.cancelAsyncWork();
    this.ruleMode = isRuleMode(this.ruleSelect.value) ? this.ruleSelect.value : 'freestyle';
    this.difficulty = isDifficulty(this.difficultySelect.value) ? this.difficultySelect.value : 'normal';
    const requestedSeat = this.seatSelect.value;
    this.humanSeat = requestedSeat === 'random'
      ? (Math.random() < 0.5 ? 'first' : 'second')
      : (isSeat(requestedSeat) ? requestedSeat : 'first');
    this.board = new Board(BOARD_SIZE);
    this.moves = [];
    this.openingState = this.ruleMode === 'classic'
      ? createOpeningState('classic-rif')
      : this.ruleMode === 'taraguchi10'
        ? createOpeningState('taraguchi-10')
        : null;
    this.normalTurn = BLACK;
    this.result = { kind: 'playing' };
    this.passCount = 0;
    this.proposals = [];
    this.events = [];
    this.hint = null;
    this.reviewIndex = null;
    this.undoStack = [];
    this.engine = { depth: 0, nodes: 0, elapsedMs: 0, pv: [], state: 'standby' };
    this.updateSetupCopy();
    this.savePreferences();
    this.saveGame();
    this.render();
    if (announce) this.toast(`新局开始：${RULE_LABELS[this.ruleMode]}，你在${seatName(this.humanSeat)}。`);
    this.queueComputer();
  }

  private snapshot(): GameSnapshot {
    return {
      ruleMode: this.ruleMode,
      difficulty: this.difficulty,
      humanSeat: this.humanSeat,
      moves: cloneMoves(this.moves),
      openingState: cloneOpening(this.openingState),
      normalTurn: this.normalTurn,
      result: cloneResult(this.result),
      passCount: this.passCount,
      proposals: this.proposals.map(cloneMove),
      events: this.events.map(cloneRecordEvent),
    };
  }

  private restoreSnapshot(snapshot: GameSnapshot): void {
    this.ruleMode = snapshot.ruleMode;
    this.difficulty = snapshot.difficulty;
    this.humanSeat = snapshot.humanSeat;
    this.moves = cloneMoves(snapshot.moves);
    this.openingState = cloneOpening(snapshot.openingState);
    this.normalTurn = snapshot.normalTurn;
    this.result = cloneResult(snapshot.result);
    this.passCount = snapshot.passCount;
    this.proposals = snapshot.proposals.map(cloneMove);
    this.events = snapshot.events.map(cloneRecordEvent);
    this.hint = null;
    this.reviewIndex = null;
    this.rebuildBoard();
    this.ruleSelect.value = this.ruleMode;
    this.difficultySelect.value = this.difficulty;
    this.updateSetupCopy();
  }

  private pushUndo(actor: Actor): void {
    this.undoStack.push({ actor, snapshot: this.snapshot() });
    if (this.undoStack.length > 80) this.undoStack.shift();
  }

  private undo(): void {
    if (this.thinking || this.reviewIndex !== null) return;
    let index = -1;
    for (let cursor = this.undoStack.length - 1; cursor >= 0; cursor -= 1) {
      if (this.undoStack[cursor]?.actor === 'human') {
        index = cursor;
        break;
      }
    }
    if (index < 0) {
      this.toast('目前还没有可以撤回的人类回合。');
      return;
    }
    this.cancelAsyncWork();
    const entry = this.undoStack[index];
    if (entry === undefined) return;
    this.undoStack.length = index;
    this.restoreSnapshot(entry.snapshot);
    this.result = { kind: 'playing' };
    this.saveGame();
    this.render();
    this.toast('已经退回到你上一次行动之前。');
    this.queueComputer();
  }

  private rebuildBoard(): void {
    const board = new Board(BOARD_SIZE);
    for (const move of this.moves) {
      if (!board.play(move, move.player)) throw new Error('Saved Gomoku record contains duplicate moves.');
    }
    this.board = board;
  }

  private ruleset(): Ruleset {
    return this.ruleMode === 'freestyle' ? 'freestyle' : 'renju';
  }

  private colors(): { first: Player; second: Player } {
    return this.openingState?.colors ?? { first: BLACK, second: WHITE };
  }

  private actorForColor(player: Player): Actor {
    return seatForColor(this.colors(), player) === this.humanSeat ? 'human' : 'computer';
  }

  private currentInstruction(): OpeningPhaseInstruction | null {
    if (this.openingState === null || this.openingState.phase === 'complete') return null;
    return getOpeningPhaseInstruction(this.openingState);
  }

  private isNormalPhase(): boolean {
    return this.openingState === null || this.openingState.phase === 'complete';
  }

  private humanCanAct(): boolean {
    if (this.result.kind !== 'playing' || this.thinking || this.reviewIndex !== null) return false;
    const instruction = this.currentInstruction();
    if (instruction !== null) return instruction.actorSeat === this.humanSeat;
    return this.actorForColor(this.normalTurn) === 'human';
  }

  private handleCell(cell: HTMLButtonElement): void {
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    const move = { x, y };
    if (cell.dataset.locked === 'true') {
      if (this.thinking) this.toast('电脑还在推演这一手。');
      return;
    }
    this.hint = null;

    const instruction = this.currentInstruction();
    if (instruction !== null) {
      if (instruction.actorSeat !== this.humanSeat) return;
      if (instruction.action === 'place-stone') this.placeOpeningStone(move, 'human');
      else if (instruction.action === 'offer-candidates') this.toggleProposal(move);
      else if (instruction.action === 'choose-candidate') this.chooseOpeningCandidate(move, 'human');
      else this.toast('请先在右侧完成当前的开局选择。');
      return;
    }
    this.placeNormalStone(move, 'human');
  }

  private placeOpeningStone(move: Move, actor: Actor): void {
    const state = this.openingState;
    const instruction = state === null ? null : getOpeningPhaseInstruction(state);
    if (state === null || instruction === null || instruction.action !== 'place-stone' || instruction.actorSeat === null || instruction.stone === null) return;
    const analysis = analyzeMove(this.board, move, instruction.stone, 'renju');
    if (analysis.forbidden === 'occupied' || analysis.forbidden === 'out-of-bounds') {
      this.toast('这个交叉点不能落子。');
      return;
    }
    const action: OpeningAction = {
      type: 'place-stone',
      seat: instruction.actorSeat,
      move,
    };
    const beforeCount = state.moves.length;
    if (!this.applyOpeningAction(action, actor)) return;
    if (this.moves.length > beforeCount && instruction.stone === BLACK && !analysis.legal) {
      this.result = {
        kind: 'forbidden',
        winner: WHITE,
        loser: BLACK,
        reason: analysis.forbidden as 'overline' | 'double-four' | 'double-three',
      };
      this.saveGame();
      this.render();
    }
  }

  private openingEventsFor(
    state: OpeningState,
    action: OpeningAction,
    nextState: OpeningState,
  ): RecordEvent[] {
    if (action.type === 'place-stone') {
      const move = nextState.moves[state.moves.length];
      return move === undefined ? [] : [eventFromMove(move)];
    }
    if (action.type === 'choose-swap') {
      const instruction = getOpeningPhaseInstruction(state);
      if (instruction.actorColor === null) return [];
      return [{
        type: 'color-choice',
        seat: action.seat,
        color: action.swap ? otherPlayer(instruction.actorColor) : instruction.actorColor,
        swap: action.swap,
      }];
    }
    if (action.type === 'choose-after-fourth') {
      return [{ type: 'branch', seat: action.seat, decision: action.decision }];
    }
    if (action.type === 'offer-candidates') {
      return [{ type: 'offer', seat: action.seat, candidates: action.candidates.map(cloneMove) }];
    }
    if (action.type === 'choose-candidate' && state.phase === 'choose-fifth') {
      const choice = action.candidate;
      const index = typeof choice === 'number'
        ? choice
        : state.candidates.findIndex((move) => move.x === choice.x && move.y === choice.y);
      const candidate = state.candidates[index];
      const events: RecordEvent[] = candidate === undefined
        ? []
        : [{ type: 'choose', seat: action.seat, candidate: cloneMove(candidate) }];
      const committed = nextState.moves[state.moves.length];
      if (committed !== undefined) events.push(eventFromMove(committed));
      return events;
    }
    return [];
  }

  private applyOpeningAction(action: OpeningAction, actor: Actor): boolean {
    const state = this.openingState;
    if (state === null) return false;
    const transition = transitionOpening(state, action);
    if (!transition.ok) {
      const issue = transition.error.candidateValidation?.issues[0]?.message;
      this.toast(issue ?? transition.error.message);
      return false;
    }
    const recordEvents = this.openingEventsFor(state, action, transition.state);
    this.pushUndo(actor);
    const before = state.moves.length;
    this.openingState = transition.state;
    this.moves = cloneMoves(transition.state.moves);
    this.rebuildBoard();
    this.proposals = [];
    this.events.push(...recordEvents);
    this.passCount = 0;
    this.hint = null;
    if (this.moves.length > before) this.playStoneSound(this.moves.at(-1)?.player ?? BLACK);
    if (transition.state.phase === 'complete') this.normalTurn = BLACK;
    this.saveGame();
    this.render();
    this.queueComputer();
    return true;
  }

  private toggleProposal(move: Move): void {
    const state = this.openingState;
    const instruction = state === null ? null : getOpeningPhaseInstruction(state);
    if (state === null || instruction === null || instruction.action !== 'offer-candidates') return;
    const existing = this.proposals.findIndex((candidate) => candidate.x === move.x && candidate.y === move.y);
    if (existing >= 0) {
      this.proposals.splice(existing, 1);
      this.saveGame();
      this.render();
      return;
    }
    if (!this.board.isEmpty(move)) {
      this.toast('候选点必须落在空位。');
      return;
    }
    const analysis = analyzeMove(this.board, move, BLACK, 'renju');
    if (!analysis.legal) {
      this.toast(`这个第五手会形成${FORBIDDEN_LABELS[analysis.forbidden as keyof typeof FORBIDDEN_LABELS] ?? '禁手'}。`);
      return;
    }
    const expected = instruction.candidateCount ?? 2;
    if (this.proposals.length >= expected) {
      this.toast(`本阶段只能提出 ${expected} 个候选点。`);
      return;
    }
    const signature = candidateOpeningShapeSignature(state.moves, move, BLACK);
    const duplicateShape = this.proposals.some((candidate) =>
      candidateOpeningShapeSignature(state.moves, candidate, BLACK) === signature);
    if (duplicateShape) {
      this.toast('这个候选与已经提出的一手旋转或镜像同形，请换一个位置。');
      return;
    }
    this.proposals.push(move);
    this.saveGame();
    this.render();
  }

  private confirmProposal(): void {
    const instruction = this.currentInstruction();
    if (instruction?.action !== 'offer-candidates' || instruction.actorSeat === null) return;
    const expected = instruction.candidateCount ?? 2;
    if (this.proposals.length !== expected) {
      this.toast(`还需要选择 ${expected - this.proposals.length} 个候选点。`);
      return;
    }
    this.applyOpeningAction({
      type: 'offer-candidates',
      seat: instruction.actorSeat,
      candidates: this.proposals.map(cloneMove),
    }, 'human');
  }

  private chooseOpeningCandidate(move: Move, actor: Actor): void {
    const state = this.openingState;
    const instruction = state === null ? null : getOpeningPhaseInstruction(state);
    if (state === null || instruction === null || state.phase !== 'choose-fifth' || instruction.actorSeat === null) return;
    const index = state.candidates.findIndex((candidate) => candidate.x === move.x && candidate.y === move.y);
    if (index < 0) {
      this.toast('请选择棋盘上以虚线标出的候选点。');
      return;
    }
    this.applyOpeningAction({
      type: 'choose-candidate',
      seat: instruction.actorSeat,
      candidate: index,
    }, actor);
  }

  private placeNormalStone(move: Move, actor: Actor): void {
    if (!this.isNormalPhase() || this.result.kind !== 'playing' || this.actorForColor(this.normalTurn) !== actor) return;
    if (!this.board.isEmpty(move)) {
      this.toast('这个交叉点已有棋子。');
      return;
    }
    if (this.ruleMode === 'renju' && this.moves.length === 0 && (move.x !== CENTER || move.y !== CENTER)) {
      this.toast('连珠规则的第一手固定在 H8 天元。');
      return;
    }
    const player = this.normalTurn;
    const analysis = analyzeMove(this.board, move, player, this.ruleset());
    this.pushUndo(actor);
    this.board.play(move, player);
    this.moves.push({ ...move, player });
    this.events.push(eventFromMove({ ...move, player }));
    this.passCount = 0;
    this.hint = null;
    this.playStoneSound(player);

    if (player === BLACK && !analysis.legal && analysis.forbidden !== null &&
      analysis.forbidden !== 'occupied' && analysis.forbidden !== 'out-of-bounds') {
      this.result = {
        kind: 'forbidden',
        winner: WHITE,
        loser: BLACK,
        reason: analysis.forbidden,
      };
    } else if (analysis.wins) {
      this.result = { kind: 'win', winner: player, line: analysis.winningLine.map(cloneMove) };
    } else if (this.board.isFull) {
      this.result = { kind: 'draw' };
    } else {
      this.normalTurn = otherPlayer(player);
    }
    this.saveGame();
    this.render();
    this.queueComputer();
  }

  private pass(): void {
    if (!this.humanCanAct() || !this.isNormalPhase() || this.ruleset() !== 'renju') return;
    const player = this.normalTurn;
    if (this.actorForColor(player) !== 'human') return;
    this.pushUndo('human');
    this.passCount += 1;
    this.events.push({ type: 'pass', player });
    this.hint = null;
    if (this.passCount >= 2) this.result = { kind: 'draw' };
    else this.normalTurn = otherPlayer(player);
    this.saveGame();
    this.render();
    this.toast(`${playerName(player)}停一手。`);
    this.queueComputer();
  }

  private queueComputer(): void {
    if (this.computerTimer !== 0 || this.thinking || this.reviewIndex !== null || this.result.kind !== 'playing') return;
    const instruction = this.currentInstruction();
    const computerActs = instruction !== null
      ? instruction.actorSeat !== null && instruction.actorSeat !== this.humanSeat
      : this.actorForColor(this.normalTurn) === 'computer';
    if (!computerActs) return;
    this.computerTimer = window.setTimeout(() => {
      this.computerTimer = 0;
      if (this.reviewIndex !== null || this.result.kind !== 'playing') return;
      if (this.currentInstruction() !== null) void this.runComputerOpening();
      else void this.runComputerTurn();
    }, 260);
  }

  private async runComputerOpening(): Promise<void> {
    const state = this.openingState;
    if (state === null || state.phase === 'complete' || this.result.kind !== 'playing' || this.reviewIndex !== null) return;
    const instruction = getOpeningPhaseInstruction(state);
    if (instruction.actorSeat === null || instruction.actorSeat === this.humanSeat) return;
    const version = this.gameVersion;
    this.setThinking(true, 'thinking');
    try {
      if (instruction.action === 'place-stone' && instruction.stone !== null) {
        const move = await this.pickComputerOpeningMove(instruction, version);
        if (move !== null && version === this.gameVersion) this.placeOpeningStone(move, 'computer');
      } else if (instruction.action === 'choose-swap') {
        const swap = this.computerSwapChoice(instruction);
        this.applyOpeningAction({ type: 'choose-swap', seat: instruction.actorSeat, swap }, 'computer');
      } else if (instruction.action === 'choose-after-fourth') {
        const decision = this.computerTaraguchiDecision(instruction);
        this.applyOpeningAction({
          type: 'choose-after-fourth',
          seat: instruction.actorSeat,
          decision,
        }, 'computer');
      } else if (instruction.action === 'offer-candidates') {
        const count = instruction.candidateCount ?? 2;
        const candidates = this.makeComputerOffer(count);
        this.applyOpeningAction({
          type: 'offer-candidates',
          seat: instruction.actorSeat,
          candidates,
        }, 'computer');
      } else if (instruction.action === 'choose-candidate' && state.phase === 'choose-fifth') {
        const index = this.computerCandidateChoice(state.candidates);
        this.applyOpeningAction({
          type: 'choose-candidate',
          seat: instruction.actorSeat,
          candidate: index,
        }, 'computer');
      }
    } catch (error) {
      if (version === this.gameVersion) this.toast(error instanceof Error ? error.message : '电脑开局失败，请重新开始。');
    } finally {
      if (version === this.gameVersion) {
        this.setThinking(false, 'complete');
        this.saveGame();
        this.render();
        this.queueComputer();
      }
    }
  }

  private allowedOpeningMoves(instruction: OpeningPhaseInstruction): Move[] {
    const player = instruction.stone;
    if (player === null) return [];
    const moves: Move[] = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const move = { x, y };
        if (!this.board.isEmpty(move)) continue;
        if (instruction.region?.kind === 'central-square' &&
          !isInCentralSquare(move, BOARD_SIZE, instruction.region.size)) continue;
        const analysis = analyzeMove(this.board, move, player, 'renju');
        if (!analysis.legal) continue;
        moves.push(move);
      }
    }
    return moves;
  }

  private scoredOpeningMoves(instruction: OpeningPhaseInstruction): Move[] {
    const player = instruction.stone;
    if (player === null) return [];
    const allowed = this.allowedOpeningMoves(instruction);
    const opponent = otherPlayer(player);
    return allowed.map((move) => {
      const attack = analyzeMove(this.board, move, player, 'renju');
      const defense = analyzeMove(this.board, move, opponent, 'renju');
      const attackScore = evaluateMovePotential(this.board, move, player, 'renju', attack);
      const defenseScore = defense.legal
        ? evaluateMovePotential(this.board, move, opponent, 'renju', defense) * 0.72
        : 0;
      const centerBias = Math.abs(move.x - CENTER) + Math.abs(move.y - CENTER);
      return { move, score: attackScore + defenseScore - centerBias * 3 };
    }).sort((a, b) => b.score - a.score || a.move.y - b.move.y || a.move.x - b.move.x)
      .map((entry) => entry.move);
  }

  private async pickComputerOpeningMove(instruction: OpeningPhaseInstruction, version: number): Promise<Move | null> {
    const player = instruction.stone;
    if (player === null) return null;
    const allowed = this.scoredOpeningMoves(instruction);
    if (allowed.length === 0) return null;
    if (instruction.region?.kind === 'central-square' || this.moves.length < 3) {
      if (this.difficulty === 'hard' || this.difficulty === 'lunatic') {
        const moveNumber = this.moves.length + 1;
        const nextRegion = moveNumber === 1 ? 3 : moveNumber === 2 ? 5 : moveNumber === 3 && instruction.protocol === 'taraguchi-10' ? 7 : null;
        const width = this.difficulty === 'lunatic' ? 34 : 18;
        const replyLimit = this.difficulty === 'lunatic' ? 24 : 12;
        const ranked = allowed.slice(0, width).map((move) => ({
          move,
          score: this.scoreOpeningPlacement(move, player, nextRegion, replyLimit),
        })).sort((a, b) => b.score - a.score || a.move.y - b.move.y || a.move.x - b.move.x);
        return ranked[0]?.move ?? allowed[0] ?? null;
      }
      const width = this.difficulty === 'easy' ? 6 : this.difficulty === 'normal' ? 3 : 1;
      return allowed[Math.floor(Math.random() * Math.min(width, allowed.length))] ?? allowed[0] ?? null;
    }
    if (this.difficulty === 'easy') return this.pickEasyMove(player, allowed);
    const result = await this.search(player, this.difficulty, version);
    if (result.move !== null && allowed.some((move) => move.x === result.move?.x && move.y === result.move?.y)) {
      return result.move;
    }
    return allowed[0] ?? null;
  }

  private scoreOpeningPlacement(
    move: Move,
    player: Player,
    nextRegion: 3 | 5 | 7 | null,
    replyLimit: number,
  ): number {
    if (!this.board.play(move, player)) return Number.NEGATIVE_INFINITY;
    const base = evaluatePosition(this.board, player, 'renju');
    let replyScore = base;
    if (nextRegion !== null) {
      const opponent = otherPlayer(player);
      const replies: Array<{ move: Move; score: number }> = [];
      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          const reply = { x, y };
          if (!isInCentralSquare(reply, BOARD_SIZE, nextRegion) || !this.board.isEmpty(reply)) continue;
          const analysis = analyzeMove(this.board, reply, opponent, 'renju');
          if (!analysis.legal) continue;
          replies.push({
            move: reply,
            score: evaluateMovePotential(this.board, reply, opponent, 'renju', analysis),
          });
        }
      }
      replies.sort((a, b) => b.score - a.score);
      for (const reply of replies.slice(0, replyLimit)) {
        if (!this.board.play(reply.move, opponent)) continue;
        replyScore = Math.min(replyScore, evaluatePosition(this.board, player, 'renju'));
        this.board.undo();
      }
    }
    this.board.undo();
    return base * 0.38 + replyScore * 0.62;
  }

  private computerSwapChoice(instruction: OpeningPhaseInstruction): boolean {
    if (instruction.actorColor === null) return false;
    const keep = evaluatePosition(this.board, instruction.actorColor, 'renju');
    const swap = evaluatePosition(this.board, otherPlayer(instruction.actorColor), 'renju');
    const noise = this.difficulty === 'easy' ? (Math.random() - 0.5) * 1_200
      : this.difficulty === 'normal' ? (Math.random() - 0.5) * 260 : 0;
    return swap + noise > keep;
  }

  private computerTaraguchiDecision(instruction: OpeningPhaseInstruction): 'continue' | 'swap' | 'offer-ten' {
    if (this.difficulty === 'hard' || this.difficulty === 'lunatic') {
      const state = this.openingState;
      if (state !== null) {
        const replyLimit = this.difficulty === 'lunatic' ? 14 : 7;
        const ten = this.makeComputerOffer(10);
        const tenFloor = Math.min(...ten.map((move) => this.scoreBlackCandidate(move, replyLimit)));
        const singleScores: number[] = [];
        for (let y = CENTER - 4; y <= CENTER + 4; y += 1) {
          for (let x = CENTER - 4; x <= CENTER + 4; x += 1) {
            const move = { x, y };
            if (!this.board.isEmpty(move) || !analyzeMove(this.board, move, BLACK, 'renju').legal) continue;
            singleScores.push(this.scoreBlackCandidate(move, replyLimit));
          }
        }
        const singleBest = Math.max(...singleScores);
        if (Number.isFinite(tenFloor) && tenFloor >= singleBest * 0.82) return 'offer-ten';
      }
      return this.computerSwapChoice(instruction) ? 'swap' : 'continue';
    }
    const offerChance: Record<Difficulty, number> = {
      easy: 0.05,
      normal: 0.24,
      hard: 0.58,
      lunatic: 0.82,
    };
    if (Math.random() < offerChance[this.difficulty]) return 'offer-ten';
    return this.computerSwapChoice(instruction) ? 'swap' : 'continue';
  }

  private makeComputerOffer(count: number): Move[] {
    const state = this.openingState;
    if (state === null) return [];
    const tactical = generateCandidateMoves(this.board, BLACK, {
      ruleset: 'renju',
      radius: 3,
      limit: 225,
    });
    const priority = new Map(tactical.map((move) => [`${move.x},${move.y}`, move.priority]));
    const pool: Array<{ move: Move; score: number }> = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const move = { x, y };
        const analysis = analyzeMove(this.board, move, BLACK, 'renju');
        if (!analysis.legal) continue;
        const potential = evaluateMovePotential(this.board, move, BLACK, 'renju', analysis);
        const center = Math.abs(x - CENTER) + Math.abs(y - CENTER);
        pool.push({ move, score: (priority.get(`${x},${y}`) ?? potential) - center * 0.2 });
      }
    }
    pool.sort((a, b) => b.score - a.score || a.move.y - b.move.y || a.move.x - b.move.x);
    if (this.difficulty === 'hard' || this.difficulty === 'lunatic') {
      const lookaheadCount = this.difficulty === 'lunatic' ? 56 : 28;
      const replyLimit = this.difficulty === 'lunatic' ? 14 : 7;
      for (const entry of pool.slice(0, lookaheadCount)) {
        entry.score = this.scoreBlackCandidate(entry.move, replyLimit) + entry.score * 0.18;
      }
      pool.sort((a, b) => b.score - a.score || a.move.y - b.move.y || a.move.x - b.move.x);
    }
    if (this.difficulty === 'easy') {
      for (let index = 0; index < Math.min(pool.length, 28); index += 1) {
        const entry = pool[index];
        if (entry !== undefined) entry.score += (Math.random() - 0.5) * 12_000;
      }
      pool.sort((a, b) => b.score - a.score);
    }
    const signatures = new Set<string>();
    const offer: Move[] = [];
    for (const entry of pool) {
      const signature = candidateOpeningShapeSignature(state.moves, entry.move, BLACK);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      offer.push(entry.move);
      if (offer.length === count) break;
    }
    if (offer.length !== count) throw new Error(`无法生成 ${count} 个互不对称的第五手。`);
    return offer;
  }

  private scoreBlackCandidate(candidate: Move, replyLimit: number): number {
    const analysis = analyzeMove(this.board, candidate, BLACK, 'renju');
    if (!analysis.legal || !this.board.play(candidate, BLACK)) return Number.NEGATIVE_INFINITY;
    const base = evaluatePosition(this.board, BLACK, 'renju');
    let afterReply = base;
    if (replyLimit > 0) {
      const replies = generateCandidateMoves(this.board, WHITE, {
        ruleset: 'renju',
        radius: 2,
        limit: replyLimit,
      });
      if (replies.length > 0) {
        afterReply = Number.POSITIVE_INFINITY;
        for (const reply of replies) {
          if (!this.board.play(reply, WHITE)) continue;
          afterReply = Math.min(afterReply, evaluatePosition(this.board, BLACK, 'renju'));
          this.board.undo();
        }
        if (!Number.isFinite(afterReply)) afterReply = base;
      }
    }
    this.board.undo();
    return base * 0.32 + afterReply * 0.68;
  }

  private computerCandidateChoice(candidates: readonly Move[]): number {
    if (candidates.length === 0) return 0;
    if (this.difficulty === 'easy') return Math.floor(Math.random() * candidates.length);
    let bestIndex = 0;
    let bestScore = -Infinity;
    candidates.forEach((candidate, index) => {
      if (!this.board.play(candidate, BLACK)) return;
      let score = evaluatePosition(this.board, WHITE, 'renju');
      if (this.difficulty === 'hard' || this.difficulty === 'lunatic') {
        const replies = generateCandidateMoves(this.board, WHITE, {
          ruleset: 'renju',
          radius: 2,
          limit: this.difficulty === 'lunatic' ? 18 : 9,
        });
        for (const reply of replies) {
          if (!this.board.play(reply, WHITE)) continue;
          score = Math.max(score, evaluatePosition(this.board, WHITE, 'renju'));
          this.board.undo();
        }
      }
      this.board.undo();
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  private async runComputerTurn(): Promise<void> {
    if (!this.isNormalPhase() || this.actorForColor(this.normalTurn) !== 'computer' || this.result.kind !== 'playing' || this.reviewIndex !== null) return;
    const version = this.gameVersion;
    const player = this.normalTurn;
    this.setThinking(true, 'thinking');
    try {
      let move: Move | null;
      if (this.ruleMode === 'renju' && this.moves.length === 0) move = { x: CENTER, y: CENTER };
      else if (this.difficulty === 'easy') move = this.pickEasyMove(player);
      else move = (await this.search(player, this.difficulty, version)).move;
      if (version !== this.gameVersion || this.reviewIndex !== null) return;
      if (move === null) {
        this.pushUndo('computer');
        if (this.ruleset() === 'renju') {
          this.events.push({ type: 'pass', player });
          this.passCount += 1;
          if (this.passCount >= 2) this.result = { kind: 'draw' };
          else this.normalTurn = otherPlayer(player);
          this.toast(`${playerName(player)}没有合法落点，停一手。`);
        } else {
          this.result = { kind: 'draw' };
          this.toast('棋盘上没有合法落点，本局和棋。');
        }
        return;
      }
      this.placeNormalStone(move, 'computer');
    } catch (error) {
      if (version === this.gameVersion) this.toast(error instanceof Error ? error.message : '电脑搜索失败，请重开一局。');
    } finally {
      if (version === this.gameVersion) {
        this.setThinking(false, 'complete');
        this.saveGame();
        this.render();
        this.queueComputer();
      }
    }
  }

  private pickEasyMove(player: Player, allowed?: readonly Move[]): Move | null {
    const candidates = generateCandidateMoves(this.board, player, {
      ruleset: this.ruleset(),
      radius: 2,
      limit: 10,
    }).filter((candidate) => allowed === undefined || allowed.some((move) => move.x === candidate.x && move.y === candidate.y));
    if (candidates.length === 0) return allowed?.[0] ?? null;
    const win = candidates.find((candidate) => candidate.wins);
    if (win !== undefined) return win;
    const blocks = candidates.filter((candidate) => candidate.blocksWin);
    if (blocks.length > 0) return blocks[Math.floor(Math.random() * blocks.length)] ?? blocks[0] ?? null;
    const width = Math.min(5, candidates.length);
    const weights = [4, 3, 2, 1, 1].slice(0, width);
    const total = weights.reduce((sum, value) => sum + value, 0);
    let roll = Math.random() * total;
    for (let index = 0; index < width; index += 1) {
      roll -= weights[index] ?? 0;
      if (roll <= 0) return candidates[index] ?? candidates[0] ?? null;
    }
    return candidates[0] ?? null;
  }

  private async search(player: Player, difficulty: Difficulty, version: number, hint = false): Promise<SearchResult> {
    this.searchAbort?.abort();
    const controller = new AbortController();
    this.searchAbort = controller;
    const options = hint
      ? { difficulty: 'hard' as const, ruleset: this.ruleset(), timeLimitMs: 850 }
      : { difficulty, ruleset: this.ruleset() };
    const result = await chooseMove(this.board.clone(), player, {
      ...options,
      signal: controller.signal,
      onIteration: (iteration) => {
        if (version === this.gameVersion) this.showIteration(iteration, hint);
      },
    });
    if (version === this.gameVersion && result.stopped !== 'aborted') this.showSearchResult(result, hint);
    return result;
  }

  private showIteration(iteration: SearchIteration, hint: boolean): void {
    this.engine = {
      depth: iteration.depth,
      nodes: iteration.nodes,
      elapsedMs: iteration.elapsedMs,
      pv: iteration.principalVariation.map(cloneMove),
      state: hint ? 'hint' : 'thinking',
    };
    this.query<HTMLElement>('[data-gomoku-depth]').textContent = String(iteration.depth).padStart(2, '0');
    this.query<HTMLElement>('[data-gomoku-nodes]').textContent = formatNodes(iteration.nodes);
    this.query<HTMLElement>('[data-gomoku-time]').textContent = `${Math.round(iteration.elapsedMs)} ms`;
    this.query<HTMLElement>('[data-gomoku-pv]').textContent = iteration.principalVariation.map(moveName).join(' · ') || '等待落子';
    this.query<HTMLElement>('[data-gomoku-thinking-depth]').textContent = `DEPTH ${String(iteration.depth).padStart(2, '0')}`;
  }

  private showSearchResult(result: SearchResult, hint: boolean): void {
    this.engine = {
      depth: result.depth,
      nodes: result.nodes,
      elapsedMs: result.elapsedMs,
      pv: result.principalVariation.map(cloneMove),
      state: hint ? 'hint' : 'complete',
    };
  }

  private async requestHint(): Promise<void> {
    if (!this.humanCanAct() || this.result.kind !== 'playing') {
      this.toast('轮到你落子时才可以求一手。');
      return;
    }
    const instruction = this.currentInstruction();
    if (instruction !== null) {
      let move: Move | null = null;
      if (instruction.action === 'place-stone') move = this.scoredOpeningMoves(instruction)[0] ?? null;
      else if (instruction.action === 'choose-candidate' && this.openingState?.phase === 'choose-fifth') {
        move = this.openingState.candidates[this.computerCandidateChoice(this.openingState.candidates)] ?? null;
      }
      if (move === null) {
        this.toast('这一阶段需要先完成右侧的开局选择。');
        return;
      }
      this.hint = move;
      this.renderBoard();
      this.toast(`可以看看 ${moveName(move)}。`);
      return;
    }
    const version = this.gameVersion;
    this.setThinking(true, 'hint');
    try {
      const result = await this.search(this.normalTurn, 'hard', version, true);
      if (version === this.gameVersion && result.move !== null) {
        this.hint = result.move;
        this.toast(`推演建议：${moveName(result.move)}。`);
      }
    } catch (error) {
      if (version === this.gameVersion) {
        this.toast(error instanceof Error ? `提示搜索失败：${error.message}` : '提示搜索失败，请稍后再试。');
      }
    } finally {
      if (version === this.gameVersion) {
        this.setThinking(false, 'hint');
        this.render();
      }
    }
  }

  private setThinking(value: boolean, state: EngineReadout['state']): void {
    this.thinking = value;
    this.engine.state = state;
    this.render();
  }

  private render(): void {
    this.updateSetupCopy();
    this.renderStatus();
    this.renderBoard();
    this.renderOpeningCard();
    this.renderEngine();
    this.renderHistory();
    const undo = this.query<HTMLButtonElement>('[data-gomoku-undo]');
    undo.disabled = this.thinking || this.reviewIndex !== null || !this.undoStack.some((entry) => entry.actor === 'human');
    const hint = this.query<HTMLButtonElement>('[data-gomoku-hint]');
    hint.disabled = !this.humanCanAct();
    const pass = this.query<HTMLButtonElement>('[data-gomoku-pass]');
    pass.hidden = this.ruleset() !== 'renju' || !this.isNormalPhase();
    pass.disabled = !this.humanCanAct();
  }

  private renderStatus(): void {
    const phase = this.query<HTMLElement>('[data-gomoku-phase]');
    const headline = this.query<HTMLElement>('[data-gomoku-headline]');
    const title = this.query<HTMLElement>('[data-gomoku-status-title]');
    const detail = this.query<HTMLElement>('[data-gomoku-status-detail]');
    const mark = this.query<HTMLElement>('[data-gomoku-turn-mark]');
    const live = this.query<HTMLElement>('[data-gomoku-live]');
    phase.textContent = RULE_LABELS[this.ruleMode];
    this.query<HTMLElement>('[data-gomoku-move-count]').textContent = String(this.moves.length).padStart(3, '0');

    if (this.reviewIndex !== null) {
      headline.textContent = '复盘中';
      title.textContent = `复盘至第 ${this.reviewIndex} 手`;
      detail.textContent = '拖动右侧进度条，或点击棋谱中的任意一手。';
      live.textContent = title.textContent;
      return;
    }
    if (this.result.kind !== 'playing') {
      let message = '和棋';
      if (this.result.kind === 'win') message = `${playerName(this.result.winner)}胜`;
      if (this.result.kind === 'forbidden') message = `黑方${FORBIDDEN_LABELS[this.result.reason]}，白方胜`;
      headline.textContent = '对局结束';
      title.textContent = message;
      detail.textContent = '可以复盘棋谱，或开始一局新棋。';
      live.textContent = message;
      return;
    }

    const instruction = this.currentInstruction();
    if (instruction !== null) {
      const actor = instruction.actorSeat === this.humanSeat ? 'human' : 'computer';
      const stone = instruction.stone ?? instruction.actorColor ?? BLACK;
      mark.dataset.stone = stone === WHITE ? 'white' : 'black';
      headline.textContent = `开局 · ${roleName(actor)}行动`;
      title.textContent = this.thinking && actor === 'computer'
        ? '电脑正在安排开局'
        : `${roleName(actor)} · ${seatName(instruction.actorSeat ?? 'first')}`;
      detail.textContent = this.openingInstructionCopy(instruction);
      live.textContent = `${title.textContent}。${detail.textContent}`;
      return;
    }

    const actor = this.actorForColor(this.normalTurn);
    mark.dataset.stone = this.normalTurn === WHITE ? 'white' : 'black';
    headline.textContent = `${playerName(this.normalTurn)}落子`;
    title.textContent = this.thinking && actor === 'computer'
      ? `电脑思考 · ${playerName(this.normalTurn)}`
      : `轮到${roleName(actor)} · ${playerName(this.normalTurn)}`;
    detail.textContent = actor === 'human' ? '请选择一个交叉点落子。' : '搜索在浏览器的独立线程中进行。';
    live.textContent = `${title.textContent}。${detail.textContent}`;
  }

  private openingInstructionCopy(instruction: OpeningPhaseInstruction): string {
    if (instruction.action === 'place-stone') {
      const region = instruction.region?.kind === 'central-square'
        ? `中央 ${instruction.region.size} × ${instruction.region.size} 区域`
        : '棋盘任意空位';
      return `第 ${this.moves.length + 1} 手放置${playerName(instruction.stone ?? BLACK)}，范围：${region}。`;
    }
    if (instruction.action === 'choose-swap') return '选择保留当前颜色，或与对方交换执色。';
    if (instruction.action === 'choose-after-fourth') return '选择保留黑方落第五手、交换为白方，或提出十个候选点。';
    if (instruction.action === 'offer-candidates') return `在棋盘上提出 ${instruction.candidateCount ?? 2} 个互不对称的第五手。`;
    if (instruction.action === 'choose-candidate') return '从虚线标出的第五手中保留一个。';
    return '开局完成。';
  }

  private displayMoves(): PlayedMove[] {
    return this.reviewIndex === null ? this.moves : this.moves.slice(0, this.reviewIndex);
  }

  private renderBoard(): void {
    const boardElement = this.query<HTMLElement>('[data-gomoku-board]');
    boardElement.dataset.showNumbers = String(this.numbersInput.checked);
    const displayMoves = this.displayMoves();
    const displayBoard = new Board(BOARD_SIZE);
    const moveNumbers = new Map<number, number>();
    displayMoves.forEach((move, index) => {
      displayBoard.play(move, move.player);
      moveNumbers.set(move.y * BOARD_SIZE + move.x, index + 1);
    });
    const last = displayMoves.at(-1) ?? null;
    const winLine = this.reviewIndex === null && this.result.kind === 'win' ? this.result.line : [];
    const instruction = this.currentInstruction();
    const offered = this.reviewIndex === null && this.openingState?.phase === 'choose-fifth'
      ? this.openingState.candidates
      : this.proposals;

    for (const cell of this.cells) {
      const x = Number(cell.dataset.x);
      const y = Number(cell.dataset.y);
      const index = y * BOARD_SIZE + x;
      const stone = displayBoard.get(x, y);
      delete cell.dataset.stone;
      delete cell.dataset.proposal;
      delete cell.dataset.last;
      delete cell.dataset.win;
      delete cell.dataset.forbidden;
      delete cell.dataset.hint;
      delete cell.dataset.outside;
      delete cell.dataset.locked;
      const number = moveNumbers.get(index);
      cell.querySelector('small')!.textContent = number === undefined ? '' : String(number);
      if (stone === BLACK) cell.dataset.stone = 'black';
      if (stone === WHITE) cell.dataset.stone = 'white';
      if (last?.x === x && last.y === y) cell.dataset.last = 'true';
      if (winLine.some((move) => move.x === x && move.y === y)) cell.dataset.win = 'true';
      const proposalIndex = offered.findIndex((move) => move.x === x && move.y === y);
      if (proposalIndex >= 0 && stone === EMPTY) {
        cell.dataset.proposal = 'true';
        cell.querySelector<HTMLElement>('.gomoku-stone b')!.textContent = String(proposalIndex + 1);
      }
      if (this.reviewIndex === null && this.hint?.x === x && this.hint.y === y && stone === EMPTY) cell.dataset.hint = 'true';

      const inRegion = instruction?.action !== 'place-stone' || instruction.region?.kind !== 'central-square' ||
        isInCentralSquare({ x, y }, BOARD_SIZE, instruction.region.size);
      if (!inRegion) cell.dataset.outside = 'true';
      const canInteract = this.canInteractAt({ x, y }, instruction, offered);
      if (!canInteract) cell.dataset.locked = 'true';
      cell.setAttribute('aria-disabled', String(!canInteract));

      const labels: string[] = [moveName({ x, y })];
      if (stone !== EMPTY) labels.push(`${stone === BLACK ? '黑子' : '白子'}，第 ${number ?? '?'} 手`);
      else if (proposalIndex >= 0) labels.push(`候选点 ${proposalIndex + 1}`);
      else labels.push('空位');
      if (cell.dataset.hint === 'true') labels.push('建议落点');
      cell.setAttribute('aria-label', labels.join('，'));
    }
    this.query<HTMLElement>('[data-gomoku-thinking-veil]').hidden = !this.thinking;
    this.scheduleForbiddenMarkers();
  }

  private canInteractAt(move: Move, instruction: OpeningPhaseInstruction | null, offered: readonly Move[]): boolean {
    if (!this.humanCanAct()) return false;
    if (instruction !== null) {
      if (instruction.action === 'place-stone') {
        if (!this.board.isEmpty(move)) return false;
        return instruction.region?.kind !== 'central-square' ||
          isInCentralSquare(move, BOARD_SIZE, instruction.region.size);
      }
      if (instruction.action === 'offer-candidates') return this.board.isEmpty(move);
      if (instruction.action === 'choose-candidate') return offered.some((candidate) => candidate.x === move.x && candidate.y === move.y);
      return false;
    }
    if (!this.board.isEmpty(move)) return false;
    return !(this.ruleMode === 'renju' && this.moves.length === 0 && (move.x !== CENTER || move.y !== CENTER));
  }

  private renderOpeningCard(): void {
    const card = this.query<HTMLElement>('[data-gomoku-opening-card]');
    const instruction = this.currentInstruction();
    if (instruction === null || this.reviewIndex !== null) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const title = this.query<HTMLElement>('[data-gomoku-opening-title]');
    const copy = this.query<HTMLElement>('[data-gomoku-opening-copy]');
    const kicker = this.query<HTMLElement>('[data-gomoku-opening-kicker]');
    const actions = this.query<HTMLElement>('[data-gomoku-opening-actions]');
    const count = this.query<HTMLElement>('[data-gomoku-proposal-count]');
    const human = instruction.actorSeat === this.humanSeat;
    kicker.textContent = `${this.openingState?.protocol === 'classic-rif' ? 'CLASSIC RIF' : 'TARAGUCHI‑10'} / ${this.openingState?.phase.toUpperCase()}`;
    actions.replaceChildren();
    count.hidden = true;

    if (instruction.action === 'place-stone') {
      title.textContent = `${human ? '请你' : '电脑'}放置第 ${this.moves.length + 1} 手`;
      copy.textContent = this.openingInstructionCopy(instruction);
    } else if (instruction.action === 'choose-swap' && instruction.actorColor !== null) {
      title.textContent = `${human ? '选择你的颜色' : '电脑选择颜色'}`;
      copy.textContent = `当前执${playerName(instruction.actorColor)}。棋子位置不变，交换只会改变双方的颜色。`;
      if (human && instruction.actorSeat !== null) {
        this.addOpeningButton(actions, `保留${playerName(instruction.actorColor)}`, () => {
          this.applyOpeningAction({ type: 'choose-swap', seat: instruction.actorSeat!, swap: false }, 'human');
        }, true);
        this.addOpeningButton(actions, `交换为${playerName(otherPlayer(instruction.actorColor!))}`, () => {
          this.applyOpeningAction({ type: 'choose-swap', seat: instruction.actorSeat!, swap: true }, 'human');
        });
      }
    } else if (instruction.action === 'choose-after-fourth') {
      title.textContent = human ? '决定第五手的方式' : '电脑选择第五手方式';
      copy.textContent = '普通分支的第五手限在中央 9 × 9；十打分支会一次提出十种不同形。';
      if (human && instruction.actorSeat !== null) {
        this.addOpeningButton(actions, '保留黑方，走一个第五手', () => {
          this.applyOpeningAction({ type: 'choose-after-fourth', seat: instruction.actorSeat!, decision: 'continue' }, 'human');
        }, true);
        this.addOpeningButton(actions, '交换为白方，由对手走第五手', () => {
          this.applyOpeningAction({ type: 'choose-after-fourth', seat: instruction.actorSeat!, decision: 'swap' }, 'human');
        });
        this.addOpeningButton(actions, '保留黑方，提出十个候选', () => {
          this.applyOpeningAction({ type: 'choose-after-fourth', seat: instruction.actorSeat!, decision: 'offer-ten' }, 'human');
        });
      }
    } else if (instruction.action === 'offer-candidates') {
      const expected = instruction.candidateCount ?? 2;
      title.textContent = human ? `提出 ${expected} 个第五手` : '电脑正在挑选候选点';
      copy.textContent = '点击空位可加入或撤下候选；旋转、镜像后同形的位置不能同时提交。';
      count.hidden = false;
      count.textContent = `SELECTED ${String(this.proposals.length).padStart(2, '0')} / ${String(expected).padStart(2, '0')}`;
      if (human) {
        const confirm = this.addOpeningButton(actions, '确认这组候选', () => this.confirmProposal(), true);
        confirm.disabled = this.proposals.length !== expected;
        this.addOpeningButton(actions, '清空候选点', () => {
          this.proposals = [];
          this.saveGame();
          this.render();
        });
      }
    } else if (instruction.action === 'choose-candidate') {
      const offered = this.openingState?.phase === 'choose-fifth' ? this.openingState.candidates.length : 0;
      title.textContent = human ? '留下一枚黑色第五手' : '电脑正在选择第五手';
      copy.textContent = '点击棋盘上的虚线候选点。未选中的位置会恢复为空位。';
      count.hidden = false;
      count.textContent = `${String(offered).padStart(2, '0')} CANDIDATES / CHOOSE 01`;
    }
  }

  private addOpeningButton(container: HTMLElement, label: string, handler: () => void, primary = false): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (primary) button.classList.add('is-primary');
    button.addEventListener('click', handler);
    container.append(button);
    return button;
  }

  private renderEngine(): void {
    this.query<HTMLElement>('[data-gomoku-depth]').textContent = this.engine.depth === 0 ? '—' : String(this.engine.depth).padStart(2, '0');
    this.query<HTMLElement>('[data-gomoku-nodes]').textContent = this.engine.nodes === 0 ? '—' : formatNodes(this.engine.nodes);
    this.query<HTMLElement>('[data-gomoku-time]').textContent = this.engine.elapsedMs === 0 ? '—' : `${Math.round(this.engine.elapsedMs)} ms`;
    this.query<HTMLElement>('[data-gomoku-pv]').textContent = this.engine.pv.length === 0 ? '等待落子' : this.engine.pv.map(moveName).join(' · ');
    const state = this.query<HTMLElement>('[data-gomoku-engine-state]');
    state.textContent = this.thinking ? (this.engine.state === 'hint' ? 'ANALYSIS' : 'SEARCHING') : this.engine.state.toUpperCase();
    this.query<HTMLElement>('[data-gomoku-engine-light]').classList.toggle('is-thinking', this.thinking);
  }

  private renderHistory(): void {
    const history = this.query<HTMLOListElement>('[data-gomoku-history]');
    history.replaceChildren();
    this.query<HTMLElement>('[data-gomoku-record-count]').textContent = `${this.moves.length} 手 · ${this.events.length} 项记录`;
    if (this.events.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'is-empty';
      empty.textContent = '新局尚未落子';
      history.append(empty);
    } else {
      let moveIndex = 0;
      this.events.forEach((event) => {
        const item = document.createElement('li');
        if (event.type !== 'stone') {
          item.className = 'is-event';
          const mark = document.createElement('b');
          mark.textContent = event.type === 'pass' ? 'PASS' : 'OPEN';
          const copy = document.createElement('span');
          copy.textContent = recordEventLabel(event);
          item.append(mark, copy);
          history.append(item);
          return;
        }
        moveIndex += 1;
        const move = event.move;
        const index = moveIndex;
        const button = document.createElement('button');
        button.type = 'button';
        button.disabled = this.thinking;
        button.setAttribute('aria-label', `复盘至第 ${index} 手，${playerName(move.player)} ${moveName(move)}`);
        const number = document.createElement('b');
        number.textContent = String(index).padStart(2, '0');
        const stone = document.createElement('i');
        if (move.player === WHITE) stone.className = 'is-white';
        const coordinate = document.createElement('span');
        coordinate.textContent = moveName(move);
        button.append(number, stone, coordinate);
        button.addEventListener('click', () => {
          if (this.thinking) return;
          this.enterReview(index);
        });
        item.append(button);
        history.append(item);
      });
    }
    const review = this.query<HTMLElement>('[data-gomoku-review]');
    review.hidden = this.reviewIndex === null;
    const range = this.query<HTMLInputElement>('[data-gomoku-review-range]');
    range.max = String(this.moves.length);
    range.value = String(this.reviewIndex ?? this.moves.length);
    this.query<HTMLElement>('[data-gomoku-review-label]').textContent = `${this.reviewIndex ?? this.moves.length} / ${this.moves.length}`;
  }

  private exitReview(): void {
    this.reviewIndex = null;
    this.render();
    this.queueComputer();
  }

  private scheduleForbiddenMarkers(): void {
    this.forbiddenRevision += 1;
    const revision = this.forbiddenRevision;
    if (!this.forbiddenInput.checked || this.reviewIndex !== null || !this.humanCanAct()) return;
    const instruction = this.currentInstruction();
    const player = instruction?.action === 'place-stone'
      ? instruction.stone
      : instruction?.action === 'offer-candidates'
        ? BLACK
        : instruction === null
          ? this.normalTurn
          : null;
    if (player !== BLACK || this.ruleset() !== 'renju') return;
    const board = this.board.clone();
    const hash = this.board.hash;
    const targets = this.cells.filter((cell) => board.isEmpty({ x: Number(cell.dataset.x), y: Number(cell.dataset.y) }));
    let cursor = 0;
    const scan = (): void => {
      if (revision !== this.forbiddenRevision || hash !== this.board.hash || !this.isConnected) return;
      const stop = Math.min(cursor + 9, targets.length);
      for (; cursor < stop; cursor += 1) {
        const cell = targets[cursor];
        if (cell === undefined) continue;
        const move = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
        const analysis = analyzeMove(board, move, BLACK, 'renju');
        if (!analysis.legal && analysis.forbidden !== 'occupied' && analysis.forbidden !== 'out-of-bounds') {
          cell.dataset.forbidden = analysis.forbidden ?? 'true';
          cell.setAttribute('aria-label', `${cell.getAttribute('aria-label') ?? moveName(move)}，黑方禁手`);
        }
      }
      if (cursor < targets.length) requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  }

  private handleBoardKey(event: KeyboardEvent): void {
    const target = event.target as HTMLButtonElement;
    if (!target.classList.contains('gomoku-cell')) return;
    const keyDelta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const delta = keyDelta[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    let x = Number(target.dataset.x) + delta[0];
    let y = Number(target.dataset.y) + delta[1];
    while (x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE) {
      const next = this.cells[y * BOARD_SIZE + x];
      if (next !== undefined) {
        this.setRovingCell(next);
        next.focus();
        return;
      }
      x += delta[0];
      y += delta[1];
    }
  }

  private setRovingCell(active: HTMLButtonElement): void {
    for (const cell of this.cells) cell.tabIndex = cell === active ? 0 : -1;
  }

  private updateSetupCopy(): void {
    const selectedRule = isRuleMode(this.ruleSelect.value) ? this.ruleSelect.value : this.ruleMode;
    const selectedDifficulty = isDifficulty(this.difficultySelect.value) ? this.difficultySelect.value : this.difficulty;
    this.query<HTMLElement>('[data-gomoku-rule-note]').textContent = RULE_NOTES[selectedRule];
    this.query<HTMLElement>('[data-gomoku-difficulty-note]').textContent = DIFFICULTY_NOTES[selectedDifficulty];
    const opening = selectedRule === 'classic' || selectedRule === 'taraguchi10';
    this.query<HTMLElement>('[data-gomoku-seat-label]').textContent = opening ? '席位' : '执子';
    const first = this.seatSelect.options[0];
    const second = this.seatSelect.options[1];
    if (first !== undefined) first.textContent = opening ? 'A 席 · 开局席' : '黑方 · 先手';
    if (second !== undefined) second.textContent = opening ? 'B 席 · 应手席' : '白方 · 后手';
    this.query<HTMLElement>('[data-gomoku-seat-note]').textContent = opening
      ? '颜色可能在开局阶段交换；席位始终不变。'
      : '新局开始时生效。';
  }

  private playStoneSound(player: Player): void {
    if (!this.soundInput.checked) return;
    try {
      const AudioContextClass = window.AudioContext;
      this.audioContext ??= new AudioContextClass();
      const context = this.audioContext;
      if (context.state === 'suspended') void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(player === BLACK ? 178 : 218, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(player === BLACK ? 94 : 116, context.currentTime + 0.055);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.085, context.currentTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.075);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
    } catch {
      // Browsers may refuse audio before the first user gesture; the game stays silent.
    }
  }

  private async copyRecord(): Promise<void> {
    const colors = this.colors();
    let moveIndex = 0;
    const record = this.events.map((event) => {
      if (event.type !== 'stone') return `     · ${recordEventLabel(event)}`;
      moveIndex += 1;
      return `${String(moveIndex).padStart(3, '0')}. ${event.move.player === BLACK ? 'B' : 'W'} ${moveName(event.move)}`;
    });
    const lines = [
      '十五路棋室｜亚略 Ar',
      `规则：${RULE_LABELS[this.ruleMode]}`,
      `棋力：${this.difficulty}`,
      `A 席：${playerName(colors.first)}${this.humanSeat === 'first' ? '（我）' : '（电脑）'}`,
      `B 席：${playerName(colors.second)}${this.humanSeat === 'second' ? '（我）' : '（电脑）'}`,
      '',
      ...record,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      this.toast('棋谱已经复制到剪贴板。');
    } catch {
      this.toast('浏览器没有开放剪贴板权限。');
    }
  }

  private toast(message: string): void {
    const toast = this.query<HTMLElement>('[data-gomoku-toast]');
    window.clearTimeout(this.toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    this.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  private savePreferences(): void {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        rule: this.ruleSelect.value,
        difficulty: this.difficultySelect.value,
        seat: this.seatSelect.value,
        numbers: this.numbersInput.checked,
        forbidden: this.forbiddenInput.checked,
        sound: this.soundInput.checked,
      }));
    } catch {
      // Private browsing can disable storage; a live game still works.
    }
  }

  private loadPreferences(): void {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw === null) return;
      const prefs = JSON.parse(raw) as Record<string, unknown>;
      if (typeof prefs.rule === 'string' && isRuleMode(prefs.rule)) this.ruleSelect.value = prefs.rule;
      if (typeof prefs.difficulty === 'string' && isDifficulty(prefs.difficulty)) this.difficultySelect.value = prefs.difficulty;
      if (prefs.seat === 'first' || prefs.seat === 'second' || prefs.seat === 'random') this.seatSelect.value = prefs.seat;
      if (typeof prefs.numbers === 'boolean') this.numbersInput.checked = prefs.numbers;
      if (typeof prefs.forbidden === 'boolean') this.forbiddenInput.checked = prefs.forbidden;
      if (typeof prefs.sound === 'boolean') this.soundInput.checked = prefs.sound;
    } catch {
      // Ignore malformed local preferences.
    }
  }

  private saveGame(): void {
    try {
      const game: StoredGame = { ...this.snapshot(), version: 1, savedAt: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    } catch {
      // A blocked or full storage area must not interrupt the match.
    }
  }

  private restoreGame(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return false;
      const game = JSON.parse(raw) as Partial<StoredGame>;
      if (game.version !== 1 || typeof game.savedAt !== 'number' || Date.now() - game.savedAt > 1000 * 60 * 60 * 24 * 30) return false;
      const ruleMode = game.ruleMode;
      const difficulty = game.difficulty;
      const humanSeat = game.humanSeat;
      if (typeof ruleMode !== 'string' || !isRuleMode(ruleMode)) return false;
      if (typeof difficulty !== 'string' || !isDifficulty(difficulty)) return false;
      if (typeof humanSeat !== 'string' || !isSeat(humanSeat)) return false;
      if (!Array.isArray(game.moves) || game.moves.length > BOARD_SIZE * BOARD_SIZE || !game.moves.every(isPlayedMove)) return false;
      const storedMoves = game.moves;
      if (game.normalTurn !== BLACK && game.normalTurn !== WHITE) return false;
      if (!isGameResult(game.result)) return false;
      const openingState = game.openingState === undefined ? null : game.openingState;
      if (openingState !== null && !isOpeningState(openingState)) return false;
      if ((ruleMode === 'classic' && openingState?.protocol !== 'classic-rif') ||
        (ruleMode === 'taraguchi10' && openingState?.protocol !== 'taraguchi-10') ||
        ((ruleMode === 'freestyle' || ruleMode === 'renju') && openingState !== null)) return false;
      if (openingState !== null) {
        if (openingState.moves.length > storedMoves.length || openingState.moves.some((move, index) => {
          const storedMove = storedMoves[index];
          return storedMove === undefined || storedMove.x !== move.x || storedMove.y !== move.y || storedMove.player !== move.player;
        })) return false;
        if (openingState.phase !== 'complete' && openingState.moves.length !== storedMoves.length) return false;
      }
      const snapshot: GameSnapshot = {
        ruleMode,
        difficulty,
        humanSeat,
        moves: cloneMoves(storedMoves),
        openingState: cloneOpening(openingState),
        normalTurn: game.normalTurn,
        result: cloneResult(game.result),
        passCount: Number.isInteger(game.passCount) && (game.passCount ?? -1) >= 0 && (game.passCount ?? 3) <= 2
          ? game.passCount as number
          : 0,
        proposals: Array.isArray(game.proposals)
          ? game.proposals.filter(isMove).map(cloneMove)
          : [],
        events: Array.isArray(game.events) && game.events.length <= 1_000 && game.events.every(isRecordEvent)
          ? game.events.map(cloneRecordEvent)
          : game.moves.map(eventFromMove),
      };
      this.restoreSnapshot(snapshot);
      this.undoStack = [];
      return true;
    } catch {
      return false;
    }
  }
}

if (!customElements.get('gomoku-room')) {
  customElements.define('gomoku-room', GomokuRoomElement);
}
