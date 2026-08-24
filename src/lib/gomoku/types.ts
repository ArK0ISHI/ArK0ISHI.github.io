export const EMPTY = 0 as const;
export const BLACK = 1 as const;
export const WHITE = 2 as const;

export type Empty = typeof EMPTY;
export type Player = typeof BLACK | typeof WHITE;
export type Cell = Empty | Player;

export type Ruleset = "freestyle" | "renju";
export type Difficulty = "easy" | "normal" | "hard" | "lunatic";

export interface Move {
  readonly x: number;
  readonly y: number;
}

export interface PlayedMove extends Move {
  readonly player: Player;
}

export type ForbiddenReason =
  | "out-of-bounds"
  | "occupied"
  | "overline"
  | "double-four"
  | "double-three";

export interface MoveAnalysis {
  readonly legal: boolean;
  readonly wins: boolean;
  readonly forbidden: ForbiddenReason | null;
  readonly fourCount: number;
  readonly threeCount: number;
  readonly winningLine: readonly Move[];
}

export type GameResult =
  | { readonly kind: "playing" }
  | { readonly kind: "draw" }
  | {
      readonly kind: "win";
      readonly winner: Player;
      readonly line: readonly Move[];
    }
  | {
      readonly kind: "forbidden";
      readonly winner: typeof WHITE;
      readonly loser: typeof BLACK;
      readonly reason: Extract<
        ForbiddenReason,
        "overline" | "double-four" | "double-three"
      >;
    };

export interface CandidateMove extends Move {
  /** Larger values are searched first. This is ordering data, not a minimax score. */
  readonly priority: number;
  readonly wins: boolean;
  readonly blocksWin: boolean;
}

export interface CandidateOptions {
  readonly ruleset?: Ruleset;
  readonly radius?: 1 | 2 | 3;
  readonly limit?: number;
}

export interface DifficultyPreset {
  readonly maxDepth: number;
  readonly timeLimitMs: number;
  readonly candidateLimit: number;
  readonly transpositionSize: number;
}

export interface SearchOptions {
  readonly difficulty?: Difficulty;
  readonly ruleset?: Ruleset;
  readonly maxDepth?: number;
  readonly timeLimitMs?: number;
  readonly candidateLimit?: number;
  readonly transpositionSize?: number;
  readonly signal?: AbortSignal;
  readonly onIteration?: (iteration: SearchIteration) => void;
}

export interface SearchIteration {
  readonly depth: number;
  readonly move: Move;
  readonly score: number;
  readonly nodes: number;
  readonly elapsedMs: number;
  readonly principalVariation: readonly Move[];
}

export interface SearchResult {
  readonly move: Move | null;
  readonly score: number;
  /** Last fully completed iterative-deepening depth. */
  readonly depth: number;
  readonly nodes: number;
  readonly elapsedMs: number;
  readonly principalVariation: readonly Move[];
  readonly stopped: "complete" | "time" | "aborted";
}

export function otherPlayer(player: Player): Player {
  return player === BLACK ? WHITE : BLACK;
}

export function sameMove(a: Move | null, b: Move | null): boolean {
  return a !== null && b !== null && a.x === b.x && a.y === b.y;
}
