import { Board } from "./board";
import { generateCandidateMoves } from "./candidates";
import { analyzeMove } from "./rules";
import { DIFFICULTY_PRESETS, findBestMove } from "./search";
import { BLACK, WHITE, type Move, type Player } from "./types";

export interface SelfTestCase {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

export interface SelfTestReport {
  readonly passed: number;
  readonly total: number;
  readonly cases: readonly SelfTestCase[];
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function place(board: Board, player: Player, moves: readonly Move[]): void {
  for (const move of moves) {
    expect(board.play(move, player), `Could not place at (${move.x}, ${move.y}).`);
  }
}

function containsMove(moves: readonly Move[], expected: Move): boolean {
  return moves.some((move) => move.x === expected.x && move.y === expected.y);
}

function runCase(name: string, test: () => void): SelfTestCase {
  try {
    test();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Dependency-free deterministic smoke suite. It can run in a browser console,
 * a worker, or any TypeScript-aware test runner.
 */
export function runGomokuSelfTests(): SelfTestReport {
  const cases: SelfTestCase[] = [];

  cases.push(
    runCase("board play/undo restores cells and hash", () => {
      const board = new Board();
      const originalHash = board.hash;
      expect(board.play({ x: 7, y: 7 }, BLACK), "Center placement should succeed.");
      expect(board.hash !== originalHash, "A placement should change the hash.");
      expect(board.moveCount === 1, "Move count should increment.");
      const undone = board.undo();
      expect(undone?.x === 7 && undone.y === 7, "Undo should return the move.");
      expect(board.hash === originalHash, "Undo should restore the original hash.");
      expect(board.moveCount === 0, "Undo should restore the move count.");
    }),
  );

  cases.push(
    runCase("freestyle five wins", () => {
      const board = new Board();
      place(
        board,
        BLACK,
        [3, 4, 5, 6].map((x) => ({ x, y: 7 })),
      );
      const result = analyzeMove(board, { x: 7, y: 7 }, BLACK, "freestyle");
      expect(result.legal && result.wins, "A freestyle row of five should win.");
      expect(result.winningLine.length === 5, "Winning line should contain five stones.");
    }),
  );

  cases.push(
    runCase("Renju black exact five wins", () => {
      const board = new Board();
      place(
        board,
        BLACK,
        [3, 4, 5, 6].map((x) => ({ x, y: 7 })),
      );
      const result = analyzeMove(board, { x: 7, y: 7 }, BLACK, "renju");
      expect(result.legal && result.wins, "Black exact five should be a legal Renju win.");
    }),
  );

  cases.push(
    runCase("Renju black overline is forbidden", () => {
      const board = new Board();
      place(
        board,
        BLACK,
        [2, 3, 4, 5, 6].map((x) => ({ x, y: 7 })),
      );
      const result = analyzeMove(board, { x: 7, y: 7 }, BLACK, "renju");
      expect(!result.legal && !result.wins, "Black overline must not win.");
      expect(result.forbidden === "overline", "Overline reason should be reported.");
    }),
  );

  cases.push(
    runCase("Renju exact five takes precedence over a simultaneous foul", () => {
      const board = new Board();
      place(
        board,
        BLACK,
        [3, 4, 5, 6].map((x) => ({ x, y: 7 })),
      );
      place(
        board,
        BLACK,
        [1, 2, 3, 4, 5, 6].map((y) => ({ x: 7, y })),
      );
      const result = analyzeMove(board, { x: 7, y: 7 }, BLACK, "renju");
      expect(result.legal && result.wins, "A proper five should be adjudicated as a win first.");
    }),
  );

  cases.push(
    runCase("Renju white overline wins", () => {
      const board = new Board();
      place(
        board,
        WHITE,
        [2, 3, 4, 5, 6].map((x) => ({ x, y: 7 })),
      );
      const result = analyzeMove(board, { x: 7, y: 7 }, WHITE, "renju");
      expect(result.legal && result.wins, "White may win with six or more in Renju.");
      expect(result.winningLine.length === 6, "The complete winning line should be returned.");
    }),
  );

  cases.push(
    runCase("Renju double-four is forbidden", () => {
      const board = new Board();
      place(board, BLACK, [
        { x: 5, y: 7 },
        { x: 6, y: 7 },
        { x: 8, y: 7 },
        { x: 7, y: 5 },
        { x: 7, y: 6 },
        { x: 7, y: 8 },
      ]);
      const result = analyzeMove(board, { x: 7, y: 7 }, BLACK, "renju");
      expect(!result.legal, "A move making two fours must be forbidden.");
      expect(result.forbidden === "double-four", "Double-four reason should be reported.");
      expect(result.fourCount >= 2, "Both distinct fours should be counted.");
    }),
  );

  cases.push(
    runCase("Renju counts two distinct fours in one direction", () => {
      const board = new Board();
      place(
        board,
        BLACK,
        [3, 5, 6, 9].map((x) => ({ x, y: 7 })),
      );
      const result = analyzeMove(board, { x: 7, y: 7 }, BLACK, "renju");
      expect(!result.legal, "Two separate horizontal fours must be forbidden.");
      expect(result.forbidden === "double-four", "Same-direction fours must be grouped separately.");
      expect(result.fourCount === 2, "The two four-stone sets should each count once.");
    }),
  );

  cases.push(
    runCase("Renju double-three is forbidden", () => {
      const board = new Board();
      place(board, BLACK, [
        { x: 6, y: 7 },
        { x: 8, y: 7 },
        { x: 7, y: 6 },
        { x: 7, y: 8 },
      ]);
      const result = analyzeMove(board, { x: 7, y: 7 }, BLACK, "renju");
      expect(!result.legal, "A move making two real open threes must be forbidden.");
      expect(result.forbidden === "double-three", "Double-three reason should be reported.");
      expect(result.threeCount >= 2, "Both distinct threes should be counted.");
    }),
  );

  cases.push(
    runCase("Renju rejects a nested pseudo-three whose extension is forbidden", () => {
      const board = new Board();
      place(board, BLACK, [
        { x: 5, y: 4 },
        { x: 7, y: 4 },
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 2, y: 6 },
        { x: 3, y: 6 },
        { x: 3, y: 7 },
        { x: 5, y: 7 },
        { x: 6, y: 7 },
        { x: 7, y: 9 },
      ]);

      const parentExtension = analyzeMove(
        board,
        { x: 5, y: 6 },
        BLACK,
        "renju",
      );
      expect(parentExtension.legal, "The parent extension should remain legal.");
      expect(
        parentExtension.threeCount === 1,
        "Its horizontal pseudo-three must be discarded after recursive validation.",
      );

      expect(board.play({ x: 5, y: 6 }, BLACK), "Could not commit the parent extension.");
      const forbiddenChild = analyzeMove(
        board,
        { x: 4, y: 6 },
        BLACK,
        "renju",
      );
      expect(!forbiddenChild.legal, "The nested extension should be forbidden.");
      expect(
        forbiddenChild.forbidden === "double-three",
        "The nested extension should be rejected as a double-three.",
      );
    }),
  );

  cases.push(
    runCase("Renju resolves nested false threes before parent adjudication", () => {
      const board = new Board();
      place(board, BLACK, [
        { x: 5, y: 4 },
        { x: 7, y: 4 },
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 2, y: 6 },
        { x: 3, y: 6 },
        { x: 3, y: 7 },
        { x: 6, y: 7 },
        { x: 7, y: 9 },
      ]);

      const result = analyzeMove(board, { x: 5, y: 7 }, BLACK, "renju");
      expect(
        !result.legal && result.forbidden === "double-three",
        "The parent move must stay forbidden after the nested pseudo-three is removed.",
      );
      expect(result.threeCount === 2, "Both real parent threes should be counted.");
    }),
  );

  cases.push(
    runCase("board edge does not act like an open end", () => {
      const board = new Board();
      place(board, BLACK, [
        { x: 0, y: 7 },
        { x: 1, y: 7 },
        { x: 7, y: 6 },
        { x: 7, y: 8 },
      ]);
      const result = analyzeMove(board, { x: 2, y: 7 }, BLACK, "renju");
      expect(result.legal, "A three pinned to the board edge is not an open three.");
      expect(result.threeCount < 2, "The edge-bound line must not count toward double-three.");
    }),
  );

  cases.push(
    runCase("empty-board candidate is the center", () => {
      const candidates = generateCandidateMoves(new Board(), BLACK, { ruleset: "renju" });
      expect(candidates.length === 1, "An empty board should have one canonical candidate.");
      expect(candidates[0]?.x === 7 && candidates[0]?.y === 7, "Candidate should be center.");
    }),
  );

  cases.push(
    runCase("candidate generation removes forbidden black moves", () => {
      const board = new Board();
      place(
        board,
        BLACK,
        [2, 3, 4, 5, 6].map((x) => ({ x, y: 7 })),
      );
      const candidates = generateCandidateMoves(board, BLACK, { ruleset: "renju" });
      expect(
        !containsMove(candidates, { x: 7, y: 7 }),
        "An overline must not enter the search candidates.",
      );
    }),
  );

  cases.push(
    runCase("candidate fallback scans beyond an all-forbidden neighborhood", () => {
      const size = 15;
      const cells = new Uint8Array(size * size);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (x < 6 || x > 8 || y < 6 || y > 8) cells[y * size + x] = WHITE;
        }
      }
      for (const x of [6, 7, 8]) {
        for (let y = 1; y <= 5; y += 1) cells[y * size + x] = BLACK;
        for (let y = 9; y <= 13; y += 1) cells[y * size + x] = BLACK;
      }
      for (const y of [6, 7, 8]) {
        for (let x = 1; x <= 5; x += 1) cells[y * size + x] = BLACK;
        for (let x = 9; x <= 13; x += 1) cells[y * size + x] = BLACK;
      }
      for (const move of [
        { x: 3, y: 9 },
        { x: 5, y: 3 },
        { x: 3, y: 5 },
        { x: 5, y: 11 },
      ]) {
        cells[move.y * size + move.x] = BLACK;
      }
      const board = new Board(size, cells);

      const nearby = [
        { x: 6, y: 6 },
        { x: 7, y: 6 },
        { x: 8, y: 6 },
        { x: 6, y: 7 },
        { x: 8, y: 7 },
        { x: 6, y: 8 },
        { x: 7, y: 8 },
        { x: 8, y: 8 },
      ];
      for (const move of nearby) {
        expect(
          !analyzeMove(board, move, BLACK, "renju").legal,
          `Expected nearby point (${move.x}, ${move.y}) to be forbidden.`,
        );
      }

      const candidates = generateCandidateMoves(board, BLACK, {
        ruleset: "renju",
        radius: 1,
        limit: 8,
      });
      expect(candidates.length > 0, "A legal distant move should still be returned.");
      expect(
        candidates.every((move) => analyzeMove(board, move, BLACK, "renju").legal),
        "Every fallback candidate must remain legal.",
      );
      expect(
        candidates.length === 1 && candidates[0]?.x === 7 && candidates[0].y === 7,
        "Fallback should find the isolated legal center point.",
      );

      const result = findBestMove(board, BLACK, {
        ruleset: "renju",
        maxDepth: 1,
        timeLimitMs: Number.POSITIVE_INFINITY,
        candidateLimit: 8,
      });
      expect(
        result.move?.x === 7 && result.move.y === 7,
        "Search must not mistake the position for having no legal move.",
      );
    }),
  );

  cases.push(
    runCase("search takes an immediate win without mutating the board", () => {
      const board = new Board();
      place(
        board,
        BLACK,
        [5, 6, 7, 8].map((x) => ({ x, y: 7 })),
      );
      const beforeHash = board.hash;
      const result = findBestMove(board, BLACK, {
        ruleset: "renju",
        maxDepth: 2,
        timeLimitMs: Number.POSITIVE_INFINITY,
        candidateLimit: 16,
      });
      expect(result.move !== null, "Search should return a move.");
      expect(
        result.move !== null &&
          containsMove(
          [
            { x: 4, y: 7 },
            { x: 9, y: 7 },
          ],
          result.move,
          ),
        "Search should complete the row of five.",
      );
      expect(board.hash === beforeHash, "Search must restore the caller's board.");
    }),
  );

  cases.push(
    runCase("search blocks a single forced win", () => {
      const board = new Board();
      place(board, BLACK, [{ x: 4, y: 7 }]);
      place(
        board,
        WHITE,
        [5, 6, 7, 8].map((x) => ({ x, y: 7 })),
      );
      const result = findBestMove(board, BLACK, {
        ruleset: "renju",
        maxDepth: 2,
        timeLimitMs: Number.POSITIVE_INFINITY,
        candidateLimit: 20,
      });
      expect(result.move?.x === 9 && result.move.y === 7, "Black must block at (9, 7).");
    }),
  );

  cases.push(
    runCase("all four difficulty presets are ordered", () => {
      expect(
        DIFFICULTY_PRESETS.easy.maxDepth < DIFFICULTY_PRESETS.normal.maxDepth &&
          DIFFICULTY_PRESETS.normal.maxDepth < DIFFICULTY_PRESETS.hard.maxDepth &&
          DIFFICULTY_PRESETS.hard.maxDepth < DIFFICULTY_PRESETS.lunatic.maxDepth,
        "Preset depths should increase monotonically.",
      );
      expect(
        DIFFICULTY_PRESETS.easy.timeLimitMs < DIFFICULTY_PRESETS.normal.timeLimitMs &&
          DIFFICULTY_PRESETS.normal.timeLimitMs < DIFFICULTY_PRESETS.hard.timeLimitMs &&
          DIFFICULTY_PRESETS.hard.timeLimitMs < DIFFICULTY_PRESETS.lunatic.timeLimitMs,
        "Preset time budgets should increase monotonically.",
      );
    }),
  );

  return {
    passed: cases.filter((test) => test.passed).length,
    total: cases.length,
    cases,
  };
}
