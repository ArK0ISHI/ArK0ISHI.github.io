import { Board } from "./board";
import { generateCandidateMoves } from "./candidates";
import { evaluatePosition, MATE_SCORE } from "./evaluation";
import { analyzeMove } from "./rules";
import {
  BLACK,
  otherPlayer,
  type CandidateMove,
  type Difficulty,
  type DifficultyPreset,
  type Move,
  type Player,
  type Ruleset,
  type SearchIteration,
  type SearchOptions,
  type SearchResult,
} from "./types";

export const DIFFICULTY_PRESETS: Readonly<Record<Difficulty, DifficultyPreset>> = {
  easy: {
    maxDepth: 1,
    timeLimitMs: 90,
    candidateLimit: 8,
    transpositionSize: 10_000,
  },
  normal: {
    maxDepth: 3,
    timeLimitMs: 260,
    candidateLimit: 14,
    transpositionSize: 40_000,
  },
  hard: {
    maxDepth: 5,
    timeLimitMs: 1_000,
    candidateLimit: 20,
    transpositionSize: 120_000,
  },
  lunatic: {
    maxDepth: 7,
    timeLimitMs: 3_500,
    candidateLimit: 28,
    transpositionSize: 300_000,
  },
};

type TableFlag = "exact" | "lower" | "upper";

interface TableEntry {
  readonly hash: number;
  readonly boardSize: number;
  readonly player: Player;
  readonly ruleset: Ruleset;
  readonly moveCount: number;
  readonly depth: number;
  readonly score: number;
  readonly flag: TableFlag;
  readonly bestIndex: number;
}

interface ResolvedSearchOptions {
  readonly ruleset: Ruleset;
  readonly maxDepth: number;
  readonly timeLimitMs: number;
  readonly candidateLimit: number;
  readonly transpositionSize: number;
  readonly signal: AbortSignal | undefined;
  readonly onIteration: ((iteration: SearchIteration) => void) | undefined;
}

interface SearchContext {
  readonly options: ResolvedSearchOptions;
  readonly deadline: number;
  readonly table: TranspositionTable;
  nodes: number;
  stopReason: "time" | "aborted" | null;
}

interface RootResult {
  readonly complete: boolean;
  readonly move: Move | null;
  readonly score: number;
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function tableKey(hash: number, player: Player, ruleset: Ruleset): number {
  const playerSalt = player === BLACK ? 0x9e3779b9 : 0x85ebca6b;
  const rulesSalt = ruleset === "renju" ? 0xc2b2ae35 : 0x27d4eb2f;
  return (hash ^ playerSalt ^ rulesSalt) >>> 0;
}

function toStoredScore(score: number, ply: number): number {
  if (score > MATE_SCORE - 10_000) return score + ply;
  if (score < -MATE_SCORE + 10_000) return score - ply;
  return score;
}

function fromStoredScore(score: number, ply: number): number {
  if (score > MATE_SCORE - 10_000) return score - ply;
  if (score < -MATE_SCORE + 10_000) return score + ply;
  return score;
}

class TranspositionTable {
  private readonly entries = new Map<number, TableEntry>();
  private capacity = DIFFICULTY_PRESETS.normal.transpositionSize;

  setCapacity(capacity: number): void {
    this.capacity = capacity;
    while (this.entries.size > capacity) {
      const oldest = this.entries.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get(board: Board, player: Player, ruleset: Ruleset): TableEntry | undefined {
    const entry = this.entries.get(tableKey(board.hash, player, ruleset));
    if (
      entry === undefined ||
      entry.hash !== board.hash ||
      entry.boardSize !== board.size ||
      entry.player !== player ||
      entry.ruleset !== ruleset ||
      entry.moveCount !== board.moveCount
    ) {
      return undefined;
    }
    return entry;
  }

  put(
    board: Board,
    player: Player,
    ruleset: Ruleset,
    entry: Omit<
      TableEntry,
      "hash" | "boardSize" | "player" | "ruleset" | "moveCount"
    >,
  ): void {
    const key = tableKey(board.hash, player, ruleset);
    const previous = this.entries.get(key);
    if (
      previous !== undefined &&
      previous.hash === board.hash &&
      previous.boardSize === board.size &&
      previous.player === player &&
      previous.ruleset === ruleset &&
      previous.moveCount === board.moveCount &&
      previous.depth > entry.depth
    ) {
      return;
    }

    if (previous === undefined && this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next().value as number | undefined;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, {
      ...entry,
      hash: board.hash,
      boardSize: board.size,
      player,
      ruleset,
      moveCount: board.moveCount,
    });
  }
}

function resolveOptions(options: SearchOptions): ResolvedSearchOptions {
  const difficulty = options.difficulty ?? "normal";
  const preset = DIFFICULTY_PRESETS[difficulty];
  const requestedTime = options.timeLimitMs ?? preset.timeLimitMs;
  return {
    ruleset: options.ruleset ?? "renju",
    maxDepth: Math.max(1, Math.min(12, Math.floor(options.maxDepth ?? preset.maxDepth))),
    timeLimitMs: Number.isFinite(requestedTime)
      ? Math.max(1, requestedTime)
      : Number.POSITIVE_INFINITY,
    candidateLimit: Math.max(
      1,
      Math.min(225, Math.floor(options.candidateLimit ?? preset.candidateLimit)),
    ),
    transpositionSize: Math.max(
      1_000,
      Math.floor(options.transpositionSize ?? preset.transpositionSize),
    ),
    signal: options.signal,
    onIteration: options.onIteration,
  };
}

function shouldStop(context: SearchContext, force = false): boolean {
  if (context.stopReason !== null) return true;
  if (!force && (context.nodes & 127) !== 0) return false;
  if (context.options.signal?.aborted === true) {
    context.stopReason = "aborted";
    return true;
  }
  if (now() >= context.deadline) {
    context.stopReason = "time";
    return true;
  }
  return false;
}

function boardMoveIndex(board: Board, move: Move): number {
  return board.indexOf(move.x, move.y);
}

function orderFromTable(board: Board, candidates: CandidateMove[], bestIndex: number): void {
  const found = candidates.findIndex((move) => boardMoveIndex(board, move) === bestIndex);
  if (found <= 0) return;
  const move = candidates[found];
  if (move === undefined) return;
  candidates.splice(found, 1);
  candidates.unshift(move);
}

function negamax(
  board: Board,
  player: Player,
  depth: number,
  alphaInput: number,
  betaInput: number,
  ply: number,
  context: SearchContext,
): number {
  context.nodes += 1;
  if (shouldStop(context)) return 0;
  if (depth <= 0 || board.isFull) {
    return evaluatePosition(board, player, context.options.ruleset);
  }

  let alpha = alphaInput;
  let beta = betaInput;
  const originalAlpha = alpha;
  const originalBeta = beta;
  const cached = context.table.get(board, player, context.options.ruleset);
  if (cached !== undefined && cached.depth >= depth) {
    const cachedScore = fromStoredScore(cached.score, ply);
    if (cached.flag === "exact") return cachedScore;
    if (cached.flag === "lower") alpha = Math.max(alpha, cachedScore);
    else beta = Math.min(beta, cachedScore);
    if (alpha >= beta) return cachedScore;
  }

  const candidates = generateCandidateMoves(board, player, {
    ruleset: context.options.ruleset,
    radius: 2,
    limit: context.options.candidateLimit,
  });
  if (cached !== undefined) orderFromTable(board, candidates, cached.bestIndex);
  if (candidates.length === 0) return 0;

  let bestScore = -MATE_SCORE;
  let bestIndex = -1;
  for (const candidate of candidates) {
    if (shouldStop(context, true)) return 0;
    if (!board.play(candidate, player)) continue;
    const score = candidate.wins
      ? MATE_SCORE - ply
      : -negamax(
          board,
          otherPlayer(player),
          depth - 1,
          -beta,
          -alpha,
          ply + 1,
          context,
        );
    board.undo();
    if (context.stopReason !== null) return 0;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = boardMoveIndex(board, candidate);
    }
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }

  if (bestIndex < 0) return 0;
  const flag: TableFlag =
    bestScore <= originalAlpha ? "upper" : bestScore >= originalBeta ? "lower" : "exact";
  context.table.put(board, player, context.options.ruleset, {
    depth,
    score: toStoredScore(bestScore, ply),
    flag,
    bestIndex,
  });
  return bestScore;
}

function searchRoot(
  board: Board,
  player: Player,
  depth: number,
  preferred: Move | null,
  context: SearchContext,
  rootCandidates?: readonly CandidateMove[],
): RootResult {
  const candidates =
    rootCandidates === undefined
      ? generateCandidateMoves(board, player, {
          ruleset: context.options.ruleset,
          radius: 2,
          limit: context.options.candidateLimit,
        })
      : [...rootCandidates];
  if (preferred !== null) orderFromTable(board, candidates, boardMoveIndex(board, preferred));
  if (candidates.length === 0) return { complete: true, move: null, score: 0 };

  let alpha = -MATE_SCORE;
  const beta = MATE_SCORE;
  let bestMove: Move | null = null;
  let bestScore = -MATE_SCORE;

  for (const candidate of candidates) {
    if (shouldStop(context, true)) {
      return { complete: false, move: bestMove, score: bestScore };
    }
    if (!board.play(candidate, player)) continue;
    const score = candidate.wins
      ? MATE_SCORE - 1
      : -negamax(
          board,
          otherPlayer(player),
          depth - 1,
          -beta,
          -alpha,
          2,
          context,
        );
    board.undo();
    if (context.stopReason !== null) {
      return { complete: false, move: bestMove, score: bestScore };
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = { x: candidate.x, y: candidate.y };
    }
    alpha = Math.max(alpha, score);
  }

  if (bestMove !== null) {
    context.table.put(board, player, context.options.ruleset, {
      depth,
      score: toStoredScore(bestScore, 0),
      flag: "exact",
      bestIndex: boardMoveIndex(board, bestMove),
    });
  }
  return { complete: true, move: bestMove, score: bestScore };
}

function extractPrincipalVariation(
  board: Board,
  player: Player,
  ruleset: Ruleset,
  depth: number,
  table: TranspositionTable,
): Move[] {
  const line: Move[] = [];
  let current = player;
  let played = 0;

  try {
    for (let ply = 0; ply < depth; ply += 1) {
      const entry = table.get(board, current, ruleset);
      if (entry === undefined || entry.bestIndex < 0) break;
      const move = board.moveAt(entry.bestIndex);
      const analysis = analyzeMove(board, move, current, ruleset);
      if (!analysis.legal || !board.play(move, current)) break;
      line.push(move);
      played += 1;
      if (analysis.wins) break;
      current = otherPlayer(current);
    }
  } finally {
    while (played > 0) {
      board.undo();
      played -= 1;
    }
  }
  return line;
}

/**
 * Reusable engine. Keeping one instance across turns preserves useful TT data.
 * Call from a Web Worker for the larger presets so the UI thread stays fluid.
 */
export class GomokuEngine {
  private readonly table = new TranspositionTable();

  clearCache(): void {
    this.table.clear();
  }

  search(board: Board, player: Player, options: SearchOptions = {}): SearchResult {
    const resolved = resolveOptions(options);
    this.table.setCapacity(resolved.transpositionSize);
    const startedAt = now();
    const context: SearchContext = {
      options: resolved,
      deadline: startedAt + resolved.timeLimitMs,
      table: this.table,
      nodes: 0,
      stopReason: null,
    };

    if (resolved.signal?.aborted === true) {
      return {
        move: null,
        score: 0,
        depth: 0,
        nodes: 0,
        elapsedMs: now() - startedAt,
        principalVariation: [],
        stopped: "aborted",
      };
    }

    const fallbackCandidates = generateCandidateMoves(board, player, {
      ruleset: resolved.ruleset,
      radius: 2,
      limit: resolved.candidateLimit,
    });
    const fallback = fallbackCandidates[0] ?? null;
    if (fallback === null) {
      return {
        move: null,
        score: 0,
        depth: 0,
        nodes: 0,
        elapsedMs: now() - startedAt,
        principalVariation: [],
        stopped: "complete",
      };
    }

    let bestMove: Move = { x: fallback.x, y: fallback.y };
    let bestScore = fallback.wins ? MATE_SCORE - 1 : fallback.priority;
    let completedDepth = 0;
    let principalVariation: Move[] = [bestMove];

    for (let depth = 1; depth <= resolved.maxDepth; depth += 1) {
      if (shouldStop(context, true)) break;
      const iteration = searchRoot(
        board,
        player,
        depth,
        bestMove,
        context,
        depth === 1 ? fallbackCandidates : undefined,
      );
      if (!iteration.complete || iteration.move === null) break;

      bestMove = iteration.move;
      bestScore = iteration.score;
      completedDepth = depth;
      principalVariation = extractPrincipalVariation(
        board,
        player,
        resolved.ruleset,
        depth,
        this.table,
      );
      const snapshot: SearchIteration = {
        depth,
        move: bestMove,
        score: bestScore,
        nodes: context.nodes,
        elapsedMs: now() - startedAt,
        principalVariation,
      };
      resolved.onIteration?.(snapshot);
      if (Math.abs(bestScore) >= MATE_SCORE - depth - 2) break;
    }

    return {
      move: bestMove,
      score: bestScore,
      depth: completedDepth,
      nodes: context.nodes,
      elapsedMs: now() - startedAt,
      principalVariation,
      stopped: context.stopReason ?? "complete",
    };
  }
}

/** One-shot convenience API. Reuse `GomokuEngine` when playing a full match. */
export function findBestMove(
  board: Board,
  player: Player,
  options: SearchOptions = {},
): SearchResult {
  return new GomokuEngine().search(board, player, options);
}
