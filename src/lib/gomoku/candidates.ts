import { Board } from "./board";
import { evaluateMovePotential, MATE_SCORE } from "./evaluation";
import { analyzeMove } from "./rules";
import {
  EMPTY,
  otherPlayer,
  type CandidateMove,
  type CandidateOptions,
  type Move,
  type Player,
} from "./types";

function centerDistance(board: Board, move: Move): number {
  const center = (board.size - 1) / 2;
  return Math.abs(move.x - center) + Math.abs(move.y - center);
}

function neighborScore(board: Board, move: Move): number {
  let score = 0;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (board.get(move.x + dx, move.y + dy) === EMPTY) continue;
      score += Math.max(1, 5 - Math.max(Math.abs(dx), Math.abs(dy)) * 2);
    }
  }
  return score;
}

function neighborhood(board: Board, radius: number): Move[] {
  if (board.moveCount === 0) {
    const center = Math.floor(board.size / 2);
    return [{ x: center, y: center }];
  }

  const marked = new Uint8Array(board.area);
  for (let index = 0; index < board.area; index += 1) {
    if (board.getAt(index) === EMPTY) continue;
    const origin = board.moveAt(index);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        const candidateIndex = board.indexOf(x, y);
        if (candidateIndex >= 0 && board.getAt(candidateIndex) === EMPTY) {
          marked[candidateIndex] = 1;
        }
      }
    }
  }

  const moves: Move[] = [];
  for (let index = 0; index < marked.length; index += 1) {
    if (marked[index] === 1) moves.push(board.moveAt(index));
  }
  return moves;
}

function allEmptyMoves(board: Board): Move[] {
  const moves: Move[] = [];
  for (let index = 0; index < board.area; index += 1) {
    if (board.getAt(index) === EMPTY) moves.push(board.moveAt(index));
  }
  return moves;
}

function rankMove(
  board: Board,
  move: Move,
  player: Player,
  ruleset: NonNullable<CandidateOptions["ruleset"]>,
): CandidateMove | null {
  const attack = analyzeMove(board, move, player, ruleset);
  if (!attack.legal) return null;

  const opponent = otherPlayer(player);
  const defense = analyzeMove(board, move, opponent, ruleset);
  const blocksWin = defense.legal && defense.wins;
  const attackPotential = evaluateMovePotential(
    board,
    move,
    player,
    ruleset,
    attack,
  );
  const defensePotential = defense.legal
    ? evaluateMovePotential(board, move, opponent, ruleset, defense)
    : 0;

  let priority =
    attackPotential +
    defensePotential * 0.88 +
    neighborScore(board, move) * 12 -
    centerDistance(board, move) * 0.5;
  if (blocksWin) priority += MATE_SCORE * 2;
  if (attack.wins) priority += MATE_SCORE * 4;

  return {
    x: move.x,
    y: move.y,
    priority,
    wins: attack.wins,
    blocksWin,
  };
}

/**
 * Generate legal, deterministic, tactically ordered nearby moves.
 * Immediate wins and mandatory blocks are always sorted ahead of heuristics.
 */
export function generateCandidateMoves(
  board: Board,
  player: Player,
  options: CandidateOptions = {},
): CandidateMove[] {
  const ruleset = options.ruleset ?? "renju";
  const radius = options.radius ?? 2;
  const candidates: CandidateMove[] = [];

  for (const move of neighborhood(board, radius)) {
    const candidate = rankMove(board, move, player, ruleset);
    if (candidate !== null) candidates.push(candidate);
  }

  // Proximity pruning is normally both faster and stronger, but it must not
  // turn an unusual legal position into a false terminal node. A full-board
  // scan is therefore reserved for the rare case where every nearby point is
  // forbidden (or the neighborhood itself is empty).
  if (candidates.length === 0 && !board.isFull) {
    for (const move of allEmptyMoves(board)) {
      const candidate = rankMove(board, move, player, ruleset);
      if (candidate !== null) candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const distanceDelta = centerDistance(board, a) - centerDistance(board, b);
    if (distanceDelta !== 0) return distanceDelta;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  if (options.limit === undefined) return candidates;
  const limit = Math.max(1, Math.floor(options.limit));
  return candidates.slice(0, limit);
}
