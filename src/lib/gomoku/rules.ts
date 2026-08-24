import { Board } from "./board";
import {
  BLACK,
  EMPTY,
  WHITE,
  type ForbiddenReason,
  type GameResult,
  type Move,
  type MoveAnalysis,
  type Player,
  type Ruleset,
} from "./types";

export interface Direction {
  readonly dx: number;
  readonly dy: number;
}

export const DIRECTIONS: readonly Direction[] = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
];

interface FourThreat {
  readonly direction: number;
  readonly stones: readonly number[];
  readonly completions: Set<number>;
}

interface PlacedBlackAnalysis {
  readonly legal: boolean;
  readonly exactFive: boolean;
  readonly overline: boolean;
  readonly fourCount: number;
  readonly threeCount: number;
  readonly winningLine: readonly Move[];
}

interface RenjuAnalysisContext {
  /** Exact-position memoization for the recursive free-three definition. */
  readonly memo: Map<string, PlacedBlackAnalysis>;
  /** Defensive invariant guard. Recursive edges always add one black stone. */
  readonly active: Set<string>;
}

const INVALID_ANALYSIS: Omit<MoveAnalysis, "forbidden"> = {
  legal: false,
  wins: false,
  fourCount: 0,
  threeCount: 0,
  winningLine: [],
};

function point(move: Move, direction: Direction, offset: number): Move {
  return {
    x: move.x + direction.dx * offset,
    y: move.y + direction.dy * offset,
  };
}

function isEmptyPoint(board: Board, move: Move): boolean {
  return board.isInside(move.x, move.y) && board.get(move.x, move.y) === EMPTY;
}

function createRenjuAnalysisContext(): RenjuAnalysisContext {
  return {
    memo: new Map<string, PlacedBlackAnalysis>(),
    active: new Set<string>(),
  };
}

/**
 * Build a collision-free key for the mutable board plus the stone being
 * adjudicated. Eight two-bit cells fit in each UTF-16 code unit, so even a
 * 25x25 board stays compact. A Zobrist hash alone is not sufficient here:
 * one collision could turn a forbidden move into a legal one.
 */
function renjuPositionKey(board: Board, anchor: Move): string {
  const cells = board.toFlatArray();
  let packed = "";

  for (let start = 0; start < cells.length; start += 8) {
    let word = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      word |= (cells[start + offset] ?? EMPTY) << (offset * 2);
    }
    packed += String.fromCharCode(word);
  }

  return `${board.size}:${board.indexOf(anchor.x, anchor.y)}:${packed}`;
}

export function lineLength(
  board: Board,
  move: Move,
  player: Player,
  direction: Direction,
): number {
  if (board.get(move.x, move.y) !== player) return 0;

  let count = 1;
  for (const sign of [-1, 1] as const) {
    let offset = sign;
    while (
      board.get(
        move.x + direction.dx * offset,
        move.y + direction.dy * offset,
      ) === player &&
      board.isInside(
        move.x + direction.dx * offset,
        move.y + direction.dy * offset,
      )
    ) {
      count += 1;
      offset += sign;
    }
  }
  return count;
}

export function contiguousLine(
  board: Board,
  move: Move,
  player: Player,
  direction: Direction,
): Move[] {
  if (board.get(move.x, move.y) !== player) return [];

  let start = 0;
  while (
    board.isInside(
      move.x + direction.dx * (start - 1),
      move.y + direction.dy * (start - 1),
    ) &&
    board.get(
      move.x + direction.dx * (start - 1),
      move.y + direction.dy * (start - 1),
    ) === player
  ) {
    start -= 1;
  }

  const result: Move[] = [];
  for (let offset = start; ; offset += 1) {
    const current = point(move, direction, offset);
    if (!board.isInside(current.x, current.y)) break;
    if (board.get(current.x, current.y) !== player) break;
    result.push(current);
  }
  return result;
}

function firstWinningLine(
  board: Board,
  move: Move,
  player: Player,
  ruleset: Ruleset,
): Move[] {
  for (const direction of DIRECTIONS) {
    const line = contiguousLine(board, move, player, direction);
    const wins =
      ruleset === "renju" && player === BLACK
        ? line.length === 5
        : line.length >= 5;
    if (wins) return line;
  }
  return [];
}

function collectFourThreats(board: Board, anchor: Move): Map<string, FourThreat> {
  const threats = new Map<string, FourThreat>();

  for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
    const direction = DIRECTIONS[directionIndex];
    if (direction === undefined) continue;

    // Every five-cell window containing the newly placed anchor.
    for (let start = -4; start <= 0; start += 1) {
      const stones: number[] = [];
      let empty: Move | null = null;
      let valid = true;

      for (let offset = start; offset < start + 5; offset += 1) {
        const current = point(anchor, direction, offset);
        if (!board.isInside(current.x, current.y)) {
          valid = false;
          break;
        }
        const cell = board.get(current.x, current.y);
        if (cell === BLACK) {
          stones.push(board.indexOf(current.x, current.y));
        } else if (cell === EMPTY && empty === null) {
          empty = current;
        } else {
          valid = false;
          break;
        }
      }

      if (!valid || stones.length !== 4 || empty === null) continue;
      if (!board.play(empty, BLACK)) continue;
      const completionIsExactFive = lineLength(board, empty, BLACK, direction) === 5;
      board.undo();
      if (!completionIsExactFive) continue;

      stones.sort((a, b) => a - b);
      const key = `${directionIndex}:${stones.join(",")}`;
      const completionIndex = board.indexOf(empty.x, empty.y);
      const existing = threats.get(key);
      if (existing === undefined) {
        threats.set(key, {
          direction: directionIndex,
          stones,
          completions: new Set([completionIndex]),
        });
      } else {
        existing.completions.add(completionIndex);
      }
    }
  }

  return threats;
}

function openFourOriginalThrees(
  board: Board,
  anchor: Move,
  extension: Move,
  direction: Direction,
  directionIndex: number,
): string[] {
  const keys: string[] = [];

  for (let start = -3; start <= 0; start += 1) {
    const before = point(anchor, direction, start - 1);
    const after = point(anchor, direction, start + 4);
    if (!isEmptyPoint(board, before) || !isEmptyPoint(board, after)) continue;

    const stones: number[] = [];
    let includesExtension = false;
    let valid = true;
    for (let offset = start; offset < start + 4; offset += 1) {
      const current = point(anchor, direction, offset);
      if (board.get(current.x, current.y) !== BLACK) {
        valid = false;
        break;
      }
      if (current.x === extension.x && current.y === extension.y) {
        includesExtension = true;
      } else {
        stones.push(board.indexOf(current.x, current.y));
      }
    }

    if (!valid || !includesExtension || stones.length !== 3) continue;
    stones.sort((a, b) => a - b);
    keys.push(`${directionIndex}:${stones.join(",")}`);
  }

  return keys;
}

function collectThreeThreats(
  board: Board,
  anchor: Move,
  context: RenjuAnalysisContext,
): Set<string> {
  const threats = new Set<string>();

  for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
    const direction = DIRECTIONS[directionIndex];
    if (direction === undefined) continue;

    // A real three has at least one legal move that turns its same three
    // stones into a straight four with two open winning ends.
    for (let offset = -4; offset <= 4; offset += 1) {
      if (offset === 0) continue;
      const extension = point(anchor, direction, offset);
      if (!isEmptyPoint(board, extension)) continue;
      if (!board.play(extension, BLACK)) continue;

      try {
        const keys = openFourOriginalThrees(
          board,
          anchor,
          extension,
          direction,
          directionIndex,
        );
        if (keys.length > 0) {
          const extensionAnalysis = analyzePlacedBlack(board, extension, context);
          // A three extension must create the straight four without ending the
          // game at the same time (including a five in another direction).
          if (extensionAnalysis.legal && !extensionAnalysis.exactFive) {
            for (const key of keys) threats.add(key);
          }
        }
      } finally {
        board.undo();
      }
    }
  }

  return threats;
}

function analyzePlacedBlack(
  board: Board,
  anchor: Move,
  context: RenjuAnalysisContext,
): PlacedBlackAnalysis {
  const key = renjuPositionKey(board, anchor);
  const cached = context.memo.get(key);
  if (cached !== undefined) return cached;

  // Every recursive call is made only after placing a new black stone, hence
  // the dependency graph is acyclic and has at most `board.area` levels. Keep
  // an explicit guard so a future refactor cannot silently approximate a
  // malformed cycle as legal.
  if (context.active.has(key)) {
    throw new Error(
      "Renju free-three analysis cycle detected; recursive edges must add a stone.",
    );
  }
  context.active.add(key);

  try {
    const result = analyzePlacedBlackUncached(board, anchor, context);
    context.memo.set(key, result);
    return result;
  } finally {
    context.active.delete(key);
  }
}

function analyzePlacedBlackUncached(
  board: Board,
  anchor: Move,
  context: RenjuAnalysisContext,
): PlacedBlackAnalysis {
  const winningLine = firstWinningLine(board, anchor, BLACK, "renju");
  if (winningLine.length === 5) {
    // RIF adjudication gives a proper row of five precedence over fouls made
    // by the same placement.
    return {
      legal: true,
      exactFive: true,
      overline: false,
      fourCount: 0,
      threeCount: 0,
      winningLine,
    };
  }

  const overline = DIRECTIONS.some(
    (direction) => lineLength(board, anchor, BLACK, direction) > 5,
  );
  if (overline) {
    return {
      legal: false,
      exactFive: false,
      overline: true,
      fourCount: 0,
      threeCount: 0,
      winningLine: [],
    };
  }

  const fourCount = collectFourThreats(board, anchor).size;
  if (fourCount >= 2) {
    return {
      legal: false,
      exactFive: false,
      overline: false,
      fourCount,
      threeCount: 0,
      winningLine: [],
    };
  }

  const threeCount = collectThreeThreats(board, anchor, context).size;
  return {
    legal: threeCount < 2,
    exactFive: false,
    overline: false,
    fourCount,
    threeCount,
    winningLine: [],
  };
}

export function analyzeMove(
  board: Board,
  move: Move,
  player: Player,
  ruleset: Ruleset = "renju",
): MoveAnalysis {
  if (!board.isInside(move.x, move.y)) {
    return { ...INVALID_ANALYSIS, forbidden: "out-of-bounds" };
  }
  if (!board.isEmpty(move)) {
    return { ...INVALID_ANALYSIS, forbidden: "occupied" };
  }

  board.play(move, player);
  try {
    if (ruleset === "freestyle" || player === WHITE) {
      const winningLine = firstWinningLine(board, move, player, ruleset);
      return {
        legal: true,
        wins: winningLine.length >= 5,
        forbidden: null,
        fourCount: 0,
        threeCount: 0,
        winningLine,
      };
    }

    const black = analyzePlacedBlack(board, move, createRenjuAnalysisContext());
    let forbidden: ForbiddenReason | null = null;
    if (!black.legal) {
      if (black.overline) forbidden = "overline";
      else if (black.fourCount >= 2) forbidden = "double-four";
      else forbidden = "double-three";
    }

    return {
      legal: black.legal,
      wins: black.exactFive,
      forbidden,
      fourCount: black.fourCount,
      threeCount: black.threeCount,
      winningLine: black.winningLine,
    };
  } finally {
    board.undo();
  }
}

export function isLegalMove(
  board: Board,
  move: Move,
  player: Player,
  ruleset: Ruleset = "renju",
): boolean {
  return analyzeMove(board, move, player, ruleset).legal;
}

export function isWinningMove(
  board: Board,
  move: Move,
  player: Player,
  ruleset: Ruleset = "renju",
): boolean {
  const analysis = analyzeMove(board, move, player, ruleset);
  return analysis.legal && analysis.wins;
}

/** Validate and commit a UI move in one call. Illegal moves leave the board unchanged. */
export function playLegalMove(
  board: Board,
  move: Move,
  player: Player,
  ruleset: Ruleset = "renju",
): MoveAnalysis {
  const analysis = analyzeMove(board, move, player, ruleset);
  if (analysis.legal) board.play(move, player);
  return analysis;
}

/** Adjudicate a move that is already present on the board. */
export function getGameResult(
  board: Board,
  lastMove: Move,
  player: Player,
  ruleset: Ruleset = "renju",
): GameResult {
  if (board.get(lastMove.x, lastMove.y) !== player) return { kind: "playing" };

  if (ruleset === "renju" && player === BLACK) {
    const black = analyzePlacedBlack(
      board,
      lastMove,
      createRenjuAnalysisContext(),
    );
    if (black.exactFive) {
      return { kind: "win", winner: BLACK, line: black.winningLine };
    }
    if (!black.legal) {
      const reason: "overline" | "double-four" | "double-three" = black.overline
        ? "overline"
        : black.fourCount >= 2
          ? "double-four"
          : "double-three";
      return { kind: "forbidden", winner: WHITE, loser: BLACK, reason };
    }
  } else {
    const winningLine = firstWinningLine(board, lastMove, player, ruleset);
    if (winningLine.length >= 5) {
      return { kind: "win", winner: player, line: winningLine };
    }
  }

  return board.isFull ? { kind: "draw" } : { kind: "playing" };
}
