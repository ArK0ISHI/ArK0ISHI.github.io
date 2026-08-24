import { Board } from "./board";
import { DIRECTIONS, lineLength } from "./rules";
import {
  BLACK,
  EMPTY,
  WHITE,
  otherPlayer,
  type Move,
  type MoveAnalysis,
  type Player,
  type Ruleset,
} from "./types";

export const MATE_SCORE = 10_000_000;

function openEndCount(
  board: Board,
  move: Move,
  player: Player,
  direction: (typeof DIRECTIONS)[number],
): number {
  let negative = 0;
  while (
    board.isInside(
      move.x + direction.dx * (negative - 1),
      move.y + direction.dy * (negative - 1),
    ) &&
    board.get(
      move.x + direction.dx * (negative - 1),
      move.y + direction.dy * (negative - 1),
    ) === player
  ) {
    negative -= 1;
  }

  let positive = 0;
  while (
    board.isInside(
      move.x + direction.dx * (positive + 1),
      move.y + direction.dy * (positive + 1),
    ) &&
    board.get(
      move.x + direction.dx * (positive + 1),
      move.y + direction.dy * (positive + 1),
    ) === player
  ) {
    positive += 1;
  }

  let open = 0;
  const before = {
    x: move.x + direction.dx * (negative - 1),
    y: move.y + direction.dy * (negative - 1),
  };
  const after = {
    x: move.x + direction.dx * (positive + 1),
    y: move.y + direction.dy * (positive + 1),
  };
  if (board.isInside(before.x, before.y) && board.get(before.x, before.y) === EMPTY) {
    open += 1;
  }
  if (board.isInside(after.x, after.y) && board.get(after.x, after.y) === EMPTY) {
    open += 1;
  }
  return open;
}

function runScore(length: number, openEnds: number, player: Player, ruleset: Ruleset): number {
  if (length >= 5) {
    if (ruleset === "renju" && player === BLACK && length > 5) return 0;
    return MATE_SCORE / 2;
  }
  if (openEnds === 0) return 0;
  if (length === 4) return openEnds === 2 ? 180_000 : 28_000;
  if (length === 3) return openEnds === 2 ? 8_000 : 900;
  if (length === 2) return openEnds === 2 ? 500 : 80;
  return openEnds === 2 ? 14 : 3;
}

function scoreRuns(board: Board, player: Player, ruleset: Ruleset): number {
  let score = 0;
  for (let y = 0; y < board.size; y += 1) {
    for (let x = 0; x < board.size; x += 1) {
      if (board.get(x, y) !== player) continue;
      for (const direction of DIRECTIONS) {
        const previousX = x - direction.dx;
        const previousY = y - direction.dy;
        if (
          board.isInside(previousX, previousY) &&
          board.get(previousX, previousY) === player
        ) {
          continue;
        }

        const move = { x, y };
        const length = lineLength(board, move, player, direction);
        score += runScore(
          length,
          openEndCount(board, move, player, direction),
          player,
          ruleset,
        );
      }
    }
  }
  return score;
}

function scoreFiveCellWindows(board: Board, player: Player): number {
  const opponent = otherPlayer(player);
  const weights = [0, 2, 18, 180, 3_500, 0] as const;
  let score = 0;

  for (const direction of DIRECTIONS) {
    for (let y = 0; y < board.size; y += 1) {
      for (let x = 0; x < board.size; x += 1) {
        const endX = x + direction.dx * 4;
        const endY = y + direction.dy * 4;
        if (!board.isInside(endX, endY)) continue;

        let stones = 0;
        let blocked = false;
        for (let offset = 0; offset < 5; offset += 1) {
          const cell = board.get(x + direction.dx * offset, y + direction.dy * offset);
          if (cell === opponent) {
            blocked = true;
            break;
          }
          if (cell === player) stones += 1;
        }
        if (!blocked) score += weights[stones] ?? 0;
      }
    }
  }
  return score;
}

/** Static score from `perspective`'s point of view. */
export function evaluatePosition(
  board: Board,
  perspective: Player,
  ruleset: Ruleset = "renju",
): number {
  const opponent = otherPlayer(perspective);
  const own = scoreRuns(board, perspective, ruleset) + scoreFiveCellWindows(board, perspective);
  const theirs = scoreRuns(board, opponent, ruleset) + scoreFiveCellWindows(board, opponent);
  const score = own - theirs;
  return Math.max(-MATE_SCORE / 2, Math.min(MATE_SCORE / 2, score));
}

/** Fast local ordering heuristic; the board is restored before returning. */
export function evaluateMovePotential(
  board: Board,
  move: Move,
  player: Player,
  ruleset: Ruleset,
  analysis: MoveAnalysis,
): number {
  if (!analysis.legal) return Number.NEGATIVE_INFINITY;
  if (analysis.wins) return MATE_SCORE;
  if (!board.play(move, player)) return Number.NEGATIVE_INFINITY;

  let score = analysis.fourCount * 65_000 + analysis.threeCount * 4_500;
  for (const direction of DIRECTIONS) {
    const length = lineLength(board, move, player, direction);
    score += runScore(
      length,
      openEndCount(board, move, player, direction),
      player,
      ruleset,
    );
  }
  board.undo();
  return score;
}

export function materialBalance(board: Board): number {
  let balance = 0;
  for (let index = 0; index < board.area; index += 1) {
    const cell = board.getAt(index);
    if (cell === BLACK) balance += 1;
    else if (cell === WHITE) balance -= 1;
  }
  return balance;
}
