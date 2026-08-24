import { BLACK, WHITE, type Move, type PlayedMove } from "./types";
import {
  canonicalOpeningShapeSignature,
  candidateOpeningShapeSignature,
  getCentralSquareBounds,
  isInCentralSquare,
  validateClassicRifOffer,
} from "./opening-geometry";
import {
  colorForSeat,
  createClassicRifState,
  createTaraguchi10State,
  getOpeningPhaseInstruction,
  seatForColor,
  swapSeatColors,
  transitionOpening,
} from "./opening-protocol";
import type {
  OpeningAction,
  OpeningState,
  OpeningTransitionResult,
} from "./opening-types";

export interface OpeningSelfTestCase {
  readonly name: string;
  readonly passed: boolean;
  readonly error?: string;
}

export interface OpeningSelfTestReport {
  readonly passed: number;
  readonly total: number;
  readonly cases: readonly OpeningSelfTestCase[];
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runCase(name: string, test: () => void): OpeningSelfTestCase {
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

function advance(state: OpeningState, action: OpeningAction): OpeningState {
  const result: OpeningTransitionResult = transitionOpening(state, action);
  expect(result.ok, result.ok ? "" : result.error.message);
  return result.state;
}

function uniqueCandidates(
  position: readonly PlayedMove[],
  boardSize: number,
  count: number,
): Move[] {
  const occupied = new Set(position.map((move) => `${move.x},${move.y}`));
  const signatures = new Set<string>();
  const result: Move[] = [];
  for (let y = 0; y < boardSize && result.length < count; y += 1) {
    for (let x = 0; x < boardSize && result.length < count; x += 1) {
      if (occupied.has(`${x},${y}`)) continue;
      const move = { x, y };
      const signature = candidateOpeningShapeSignature(position, move, BLACK);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      result.push(move);
    }
  }
  expect(result.length === count, `Could only construct ${result.length} unique candidates.`);
  return result;
}

/**
 * Dependency-free deterministic coverage for geometry, ownership, and both
 * protocol branches. Safe to call from a browser console or any test runner.
 */
export function runOpeningProtocolSelfTests(): OpeningSelfTestReport {
  const cases: OpeningSelfTestCase[] = [];

  cases.push(
    runCase("seat/color mapping swaps without changing seats", () => {
      const initial = { first: BLACK, second: WHITE } as const;
      const swapped = swapSeatColors(initial);
      expect(colorForSeat(swapped, "first") === WHITE, "First seat should become White.");
      expect(seatForColor(swapped, BLACK) === "second", "Second seat should hold Black.");
      const restored = swapSeatColors(swapped);
      expect(
        restored.first === BLACK && restored.second === WHITE,
        "Two swaps should restore the assignment.",
      );
    }),
  );

  cases.push(
    runCase("central squares use the unique board center", () => {
      const bounds = getCentralSquareBounds(15, 5);
      expect(
        bounds.minX === 5 &&
          bounds.maxX === 9 &&
          bounds.minY === 5 &&
          bounds.maxY === 9,
        "Central 5x5 bounds should be 5 through 9 on a 15x15 board.",
      );
      expect(isInCentralSquare({ x: 5, y: 9 }, 15, 5), "Boundary point should be inside.");
      expect(!isInCentralSquare({ x: 4, y: 9 }, 15, 5), "Outside point should be rejected.");
    }),
  );

  cases.push(
    runCase("shape signatures ignore D4 orientation, translation, and board edge", () => {
      const shape = [
        { x: 0, y: 0, player: BLACK },
        { x: 1, y: 0, player: WHITE },
        { x: 1, y: 2, player: BLACK },
      ] as const;
      const rotatedAndTranslated = [
        { x: 10, y: -4, player: BLACK },
        { x: 10, y: -3, player: WHITE },
        { x: 8, y: -3, player: BLACK },
      ] as const;
      expect(
        canonicalOpeningShapeSignature(shape) ===
          canonicalOpeningShapeSignature(rotatedAndTranslated),
        "Equivalent shapes should share a signature.",
      );
      expect(
        canonicalOpeningShapeSignature(shape) !==
          canonicalOpeningShapeSignature([
            shape[0],
            { ...shape[1], player: BLACK },
            shape[2],
          ]),
        "Stone colors must remain significant.",
      );
    }),
  );

  cases.push(
    runCase("candidate offers reject reflected alternatives", () => {
      const position: PlayedMove[] = [
        { x: 7, y: 7, player: BLACK },
        { x: 7, y: 6, player: WHITE },
        { x: 7, y: 8, player: BLACK },
        { x: 7, y: 5, player: WHITE },
      ];
      const validation = validateClassicRifOffer({
        boardSize: 15,
        position,
        candidates: [
          { x: 6, y: 7 },
          { x: 8, y: 7 },
        ],
      });
      expect(!validation.valid, "Mirror-equivalent fifth moves must be rejected.");
      expect(
        validation.issues.some((issue) => issue.code === "symmetry-equivalent"),
        "Offer should explain its symmetry collision.",
      );
    }),
  );

  cases.push(
    runCase("Classic RIF advances through two-choice selection", () => {
      let state: OpeningState = createClassicRifState();
      const wrongSeat = transitionOpening(state, {
        type: "place-stone",
        seat: "second",
        move: { x: 7, y: 7 },
      });
      expect(!wrongSeat.ok && wrongSeat.error.code === "wrong-seat", "Actor must be enforced.");

      state = advance(state, {
        type: "place-stone",
        seat: "first",
        move: { x: 7, y: 7 },
      });
      state = advance(state, {
        type: "place-stone",
        seat: "first",
        move: { x: 7, y: 6 },
      });
      state = advance(state, {
        type: "place-stone",
        seat: "first",
        move: { x: 7, y: 8 },
      });
      state = advance(state, { type: "choose-swap", seat: "second", swap: true });
      expect(seatForColor(state.colors, WHITE) === "first", "Swap should give First White.");
      state = advance(state, {
        type: "place-stone",
        seat: "first",
        move: { x: 7, y: 5 },
      });
      state = advance(state, {
        type: "offer-candidates",
        seat: "second",
        candidates: [
          { x: 6, y: 7 },
          { x: 9, y: 7 },
        ],
      });
      state = advance(state, {
        type: "choose-candidate",
        seat: "first",
        candidate: 0,
      });
      state = advance(state, {
        type: "place-stone",
        seat: "first",
        move: { x: 5, y: 5 },
      });
      expect(state.phase === "complete", "Classic RIF should complete after move 6.");
      expect(state.moves.length === 6, "Exactly six committed moves should remain.");
      expect(state.moves[4]?.x === 6, "The chosen fifth move should be committed.");
    }),
  );

  cases.push(
    runCase("Taraguchi continue path applies all optional swaps", () => {
      let state: OpeningState = createTaraguchi10State();
      state = advance(state, {
        type: "place-stone",
        seat: "first",
        move: { x: 7, y: 7 },
      });
      state = advance(state, { type: "choose-swap", seat: "second", swap: true });
      state = advance(state, {
        type: "place-stone",
        seat: "first",
        move: { x: 7, y: 6 },
      });
      state = advance(state, { type: "choose-swap", seat: "second", swap: false });
      state = advance(state, {
        type: "place-stone",
        seat: "second",
        move: { x: 8, y: 7 },
      });
      state = advance(state, { type: "choose-swap", seat: "first", swap: true });
      state = advance(state, {
        type: "place-stone",
        seat: "second",
        move: { x: 6, y: 6 },
      });
      state = advance(state, {
        type: "choose-after-fourth",
        seat: "first",
        decision: "swap",
      });
      state = advance(state, {
        type: "place-stone",
        seat: "second",
        move: { x: 9, y: 9 },
      });
      state = advance(state, { type: "choose-swap", seat: "first", swap: true });
      state = advance(state, {
        type: "place-stone",
        seat: "second",
        move: { x: 10, y: 10 },
      });
      expect(state.phase === "complete", "Taraguchi continue path should complete.");
      expect(seatForColor(state.colors, BLACK) === "first", "Final swap should assign Black.");
    }),
  );

  cases.push(
    runCase("Taraguchi ten-offer path commits only the chosen candidate", () => {
      let state: OpeningState = createTaraguchi10State();
      state = advance(state, {
        type: "place-stone",
        seat: "first",
        move: { x: 7, y: 7 },
      });
      state = advance(state, { type: "choose-swap", seat: "second", swap: false });
      state = advance(state, {
        type: "place-stone",
        seat: "second",
        move: { x: 7, y: 6 },
      });
      state = advance(state, { type: "choose-swap", seat: "first", swap: false });
      state = advance(state, {
        type: "place-stone",
        seat: "first",
        move: { x: 8, y: 7 },
      });
      state = advance(state, { type: "choose-swap", seat: "second", swap: false });
      state = advance(state, {
        type: "place-stone",
        seat: "second",
        move: { x: 6, y: 6 },
      });
      state = advance(state, {
        type: "choose-after-fourth",
        seat: "first",
        decision: "offer-ten",
      });
      const candidates = uniqueCandidates(state.moves, state.boardSize, 10);
      state = advance(state, {
        type: "offer-candidates",
        seat: "first",
        candidates,
      });
      state = advance(state, {
        type: "choose-candidate",
        seat: "second",
        candidate: 9,
      });
      expect(state.moves.length === 5, "Only one provisional candidate should be committed.");
      expect(
        state.moves[4]?.x === candidates[9]?.x && state.moves[4]?.y === candidates[9]?.y,
        "The selected candidate should become move 5.",
      );
      state = advance(state, {
        type: "place-stone",
        seat: "second",
        move: candidates[0] ?? { x: 14, y: 14 },
      });
      expect(state.phase === "complete", "Taraguchi ten-offer path should complete.");
      expect(
        state.moves[5]?.x === candidates[0]?.x && state.moves[5]?.y === candidates[0]?.y,
        "White may reuse an unchosen provisional location for move 6.",
      );
      const instruction = getOpeningPhaseInstruction(state);
      expect(instruction.action === "normal-play", "Completion should hand off to normal play.");
    }),
  );

  return {
    passed: cases.filter((test) => test.passed).length,
    total: cases.length,
    cases,
  };
}
