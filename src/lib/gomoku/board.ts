import {
  BLACK,
  EMPTY,
  WHITE,
  type Cell,
  type Move,
  type PlayedMove,
  type Player,
} from "./types";

export const DEFAULT_BOARD_SIZE = 15;
export const MIN_BOARD_SIZE = 5;
export const MAX_BOARD_SIZE = 25;

interface HistoryEntry extends PlayedMove {
  readonly previousLastMove: PlayedMove | null;
}

function mix32(value: number): number {
  let result = value >>> 0;
  result = Math.imul(result ^ (result >>> 16), 0x7feb352d);
  result = Math.imul(result ^ (result >>> 15), 0x846ca68b);
  return (result ^ (result >>> 16)) >>> 0;
}

function isPlayer(value: number): value is Player {
  return value === BLACK || value === WHITE;
}

/**
 * Compact mutable board for search and browser UIs.
 *
 * `play`/`undo` are O(1), and every search path restores the caller's board.
 * Use `clone` when a UI needs an independent snapshot and `toFlatArray` when
 * crossing a worker or persistence boundary.
 */
export class Board {
  readonly size: number;

  private readonly cells: Uint8Array;
  private readonly zobrist: Uint32Array;
  private readonly history: HistoryEntry[] = [];
  private occupied = 0;
  private hashValue = 0;
  private latestMove: PlayedMove | null = null;

  constructor(size = DEFAULT_BOARD_SIZE, initialCells?: ArrayLike<number>) {
    if (!Number.isInteger(size) || size < MIN_BOARD_SIZE || size > MAX_BOARD_SIZE) {
      throw new RangeError(
        `Board size must be an integer from ${MIN_BOARD_SIZE} to ${MAX_BOARD_SIZE}.`,
      );
    }

    const area = size * size;
    if (initialCells !== undefined && initialCells.length !== area) {
      throw new RangeError(`Expected ${area} cells, received ${initialCells.length}.`);
    }

    this.size = size;
    this.cells = new Uint8Array(area);
    this.zobrist = new Uint32Array(area * 2);

    for (let index = 0; index < area; index += 1) {
      this.zobrist[index * 2] = mix32(index * 2 + 0x9e3779b9);
      this.zobrist[index * 2 + 1] = mix32(index * 2 + 1 + 0x9e3779b9);
    }

    if (initialCells !== undefined) {
      for (let index = 0; index < area; index += 1) {
        const value = initialCells[index] ?? EMPTY;
        if (value !== EMPTY && !isPlayer(value)) {
          throw new TypeError(`Invalid cell value ${value} at index ${index}.`);
        }
        if (isPlayer(value)) {
          this.cells[index] = value;
          this.occupied += 1;
          this.hashValue ^= this.zobrist[index * 2 + (value - 1)] ?? 0;
        }
      }
      this.hashValue >>>= 0;
    }
  }

  get moveCount(): number {
    return this.occupied;
  }

  get area(): number {
    return this.cells.length;
  }

  get isFull(): boolean {
    return this.occupied === this.cells.length;
  }

  /** Unsigned 32-bit incremental position hash. */
  get hash(): number {
    return this.hashValue >>> 0;
  }

  get lastMove(): PlayedMove | null {
    return this.latestMove === null ? null : { ...this.latestMove };
  }

  isInside(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.size &&
      y < this.size
    );
  }

  indexOf(x: number, y: number): number {
    return this.isInside(x, y) ? y * this.size + x : -1;
  }

  moveAt(index: number): Move {
    if (!Number.isInteger(index) || index < 0 || index >= this.cells.length) {
      throw new RangeError(`Cell index ${index} is outside the board.`);
    }
    return { x: index % this.size, y: Math.floor(index / this.size) };
  }

  get(x: number, y: number): Cell {
    const index = this.indexOf(x, y);
    return index < 0 ? EMPTY : (this.cells[index] as Cell);
  }

  getAt(index: number): Cell {
    return index >= 0 && index < this.cells.length
      ? (this.cells[index] as Cell)
      : EMPTY;
  }

  isEmpty(move: Move): boolean {
    const index = this.indexOf(move.x, move.y);
    return index >= 0 && this.cells[index] === EMPTY;
  }

  play(move: Move, player: Player): boolean {
    const index = this.indexOf(move.x, move.y);
    if (index < 0 || this.cells[index] !== EMPTY) return false;

    const played: PlayedMove = { x: move.x, y: move.y, player };
    this.history.push({ ...played, previousLastMove: this.latestMove });
    this.cells[index] = player;
    this.occupied += 1;
    this.hashValue = (
      this.hashValue ^ (this.zobrist[index * 2 + (player - 1)] ?? 0)
    ) >>> 0;
    this.latestMove = played;
    return true;
  }

  undo(): PlayedMove | null {
    const entry = this.history.pop();
    if (entry === undefined) return null;

    const index = entry.y * this.size + entry.x;
    this.cells[index] = EMPTY;
    this.occupied -= 1;
    this.hashValue = (
      this.hashValue ^ (this.zobrist[index * 2 + (entry.player - 1)] ?? 0)
    ) >>> 0;
    this.latestMove = entry.previousLastMove;
    return { x: entry.x, y: entry.y, player: entry.player };
  }

  clearHistory(): void {
    this.history.length = 0;
    this.latestMove = null;
  }

  clone(): Board {
    const copy = new Board(this.size, this.cells);
    copy.latestMove = this.latestMove === null ? null : { ...this.latestMove };
    return copy;
  }

  toFlatArray(): Uint8Array {
    return this.cells.slice();
  }

  toRows(): Cell[][] {
    const rows: Cell[][] = [];
    for (let y = 0; y < this.size; y += 1) {
      const row: Cell[] = [];
      for (let x = 0; x < this.size; x += 1) row.push(this.get(x, y));
      rows.push(row);
    }
    return rows;
  }

  static fromRows(rows: readonly (readonly number[])[]): Board {
    const size = rows.length;
    if (size === 0 || rows.some((row) => row.length !== size)) {
      throw new RangeError("Board rows must form a non-empty square.");
    }
    const flat = new Uint8Array(size * size);
    for (let y = 0; y < size; y += 1) {
      const row = rows[y];
      if (row === undefined) continue;
      for (let x = 0; x < size; x += 1) flat[y * size + x] = row[x] ?? EMPTY;
    }
    return new Board(size, flat);
  }
}
