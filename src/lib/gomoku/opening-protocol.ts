import { BLACK, WHITE, type Move, type PlayedMove, type Player } from "./types";
import {
  getCentralSquareBounds,
  isInCentralSquare,
  isInsideOpeningBoard,
  isMoveCoordinate,
  validateClassicRifOffer,
  validateTaraguchi10Offer,
} from "./opening-geometry";
import type {
  CandidateOfferValidation,
  CentralSquareSize,
  ClassicRifState,
  OpeningAction,
  OpeningInstructionAction,
  OpeningPhase,
  OpeningPhaseInstruction,
  OpeningPlacementRegion,
  OpeningProtocol,
  OpeningState,
  OpeningTransitionErrorCode,
  OpeningTransitionErrorInfo,
  OpeningTransitionFailure,
  OpeningTransitionResult,
  PlayerSeat,
  SeatColors,
  Taraguchi10State,
} from "./opening-types";

export const STANDARD_OPENING_BOARD_SIZE = 15;

export const INITIAL_SEAT_COLORS: SeatColors = Object.freeze({
  first: BLACK,
  second: WHITE,
});

const WHOLE_BOARD: OpeningPlacementRegion = Object.freeze({ kind: "board" });

function centralSquare(size: CentralSquareSize): OpeningPlacementRegion {
  return { kind: "central-square", size };
}

export function otherSeat(seat: PlayerSeat): PlayerSeat {
  return seat === "first" ? "second" : "first";
}

export function colorForSeat(colors: SeatColors, seat: PlayerSeat): Player {
  return colors[seat];
}

export function seatForColor(colors: SeatColors, player: Player): PlayerSeat {
  if (colors.first === player && colors.second !== player) return "first";
  if (colors.second === player && colors.first !== player) return "second";
  throw new TypeError("Seat colors must assign black and white exactly once.");
}

export function swapSeatColors(colors: SeatColors): SeatColors {
  return { first: colors.second, second: colors.first };
}

export function isSupportedOpeningBoardSize(boardSize: number): boolean {
  return Number.isInteger(boardSize) && boardSize >= 9 && boardSize % 2 === 1;
}

function assertSupportedBoardSize(boardSize: number): void {
  if (!isSupportedOpeningBoardSize(boardSize)) {
    throw new RangeError(
      "Opening board size must be an odd integer of at least 9 intersections.",
    );
  }
  // Keep this assertion next to the state constructor if supported sizes evolve.
  getCentralSquareBounds(boardSize, 9);
}

export function createClassicRifState(
  boardSize = STANDARD_OPENING_BOARD_SIZE,
): ClassicRifState {
  assertSupportedBoardSize(boardSize);
  return {
    protocol: "classic-rif",
    phase: "place-first",
    boardSize,
    colors: { ...INITIAL_SEAT_COLORS },
    moves: [],
  };
}

export function createTaraguchi10State(
  boardSize = STANDARD_OPENING_BOARD_SIZE,
): Taraguchi10State {
  assertSupportedBoardSize(boardSize);
  return {
    protocol: "taraguchi-10",
    phase: "place-first",
    boardSize,
    colors: { ...INITIAL_SEAT_COLORS },
    moves: [],
  };
}

export function createOpeningState(
  protocol: "classic-rif",
  boardSize?: number,
): ClassicRifState;
export function createOpeningState(
  protocol: "taraguchi-10",
  boardSize?: number,
): Taraguchi10State;
export function createOpeningState(
  protocol: OpeningProtocol,
  boardSize = STANDARD_OPENING_BOARD_SIZE,
): OpeningState {
  return protocol === "classic-rif"
    ? createClassicRifState(boardSize)
    : createTaraguchi10State(boardSize);
}

function playerName(player: Player): string {
  return player === BLACK ? "Black" : "White";
}

function seatName(seat: PlayerSeat): string {
  return seat === "first" ? "First seat" : "Second seat";
}

function makeInstruction(
  state: OpeningState,
  actorSeat: PlayerSeat | null,
  action: OpeningInstructionAction,
  options: {
    readonly stone?: Player;
    readonly region?: OpeningPlacementRegion;
    readonly candidateCount?: 2 | 10;
    readonly message: string;
  },
): OpeningPhaseInstruction {
  const base = {
    protocol: state.protocol,
    phase: state.phase,
    actorSeat,
    actorColor:
      actorSeat === null ? null : colorForSeat(state.colors, actorSeat),
    action,
    stone: options.stone ?? null,
    region: options.region ?? null,
    candidateCount: options.candidateCount ?? null,
    message: options.message,
  };
  return base;
}

function placementInstruction(
  state: OpeningState,
  actorSeat: PlayerSeat,
  moveNumber: number,
  stone: Player,
  region: OpeningPlacementRegion,
): OpeningPhaseInstruction {
  const regionText =
    region.kind === "board"
      ? "on any empty intersection"
      : `inside the central ${region.size}x${region.size} square`;
  return makeInstruction(state, actorSeat, "place-stone", {
    stone,
    region,
    message: `${seatName(actorSeat)} places ${playerName(stone)} move ${moveNumber} ${regionText}.`,
  });
}

function swapInstruction(
  state: OpeningState,
  actorSeat: PlayerSeat,
  afterMove: number,
): OpeningPhaseInstruction {
  return makeInstruction(state, actorSeat, "choose-swap", {
    message: `${seatName(actorSeat)} chooses whether to swap colors after move ${afterMove}.`,
  });
}

function getClassicRifInstruction(
  state: ClassicRifState,
): OpeningPhaseInstruction {
  switch (state.phase) {
    case "place-first":
      return placementInstruction(state, "first", 1, BLACK, centralSquare(1));
    case "place-second":
      return placementInstruction(state, "first", 2, WHITE, centralSquare(3));
    case "place-third":
      return placementInstruction(state, "first", 3, BLACK, centralSquare(5));
    case "choose-colors":
      return makeInstruction(state, "second", "choose-swap", {
        message: "Second seat chooses Black or White (swap to take Black).",
      });
    case "place-fourth": {
      const actor = seatForColor(state.colors, WHITE);
      return placementInstruction(state, actor, 4, WHITE, WHOLE_BOARD);
    }
    case "offer-fifth": {
      const actor = seatForColor(state.colors, BLACK);
      return makeInstruction(state, actor, "offer-candidates", {
        stone: BLACK,
        region: WHOLE_BOARD,
        candidateCount: 2,
        message: `${seatName(actor)} offers two non-equivalent Black fifth moves.`,
      });
    }
    case "choose-fifth": {
      const actor = seatForColor(state.colors, WHITE);
      return makeInstruction(state, actor, "choose-candidate", {
        stone: BLACK,
        candidateCount: 2,
        message: `${seatName(actor)} chooses which offered Black move becomes move 5.`,
      });
    }
    case "place-sixth": {
      const actor = seatForColor(state.colors, WHITE);
      return placementInstruction(state, actor, 6, WHITE, WHOLE_BOARD);
    }
    case "complete": {
      const actor = seatForColor(state.colors, BLACK);
      return makeInstruction(state, actor, "normal-play", {
        message: `Opening complete. ${seatName(actor)} has Black and plays move 7 next.`,
      });
    }
  }
}

function getTaraguchi10Instruction(
  state: Taraguchi10State,
): OpeningPhaseInstruction {
  switch (state.phase) {
    case "place-first": {
      const actor = seatForColor(state.colors, BLACK);
      return placementInstruction(state, actor, 1, BLACK, centralSquare(1));
    }
    case "swap-after-first":
      return swapInstruction(state, seatForColor(state.colors, WHITE), 1);
    case "place-second": {
      const actor = seatForColor(state.colors, WHITE);
      return placementInstruction(state, actor, 2, WHITE, centralSquare(3));
    }
    case "swap-after-second":
      return swapInstruction(state, seatForColor(state.colors, BLACK), 2);
    case "place-third": {
      const actor = seatForColor(state.colors, BLACK);
      return placementInstruction(state, actor, 3, BLACK, centralSquare(5));
    }
    case "swap-after-third":
      return swapInstruction(state, seatForColor(state.colors, WHITE), 3);
    case "place-fourth": {
      const actor = seatForColor(state.colors, WHITE);
      return placementInstruction(state, actor, 4, WHITE, centralSquare(7));
    }
    case "choose-after-fourth": {
      const actor = seatForColor(state.colors, BLACK);
      return makeInstruction(state, actor, "choose-after-fourth", {
        stone: BLACK,
        candidateCount: 10,
        message: `${seatName(actor)} continues with one fifth move, swaps before it, or offers ten alternatives.`,
      });
    }
    case "place-fifth": {
      const actor = seatForColor(state.colors, BLACK);
      return placementInstruction(state, actor, 5, BLACK, centralSquare(9));
    }
    case "swap-after-fifth":
      return swapInstruction(state, seatForColor(state.colors, WHITE), 5);
    case "offer-fifth": {
      const actor = seatForColor(state.colors, BLACK);
      return makeInstruction(state, actor, "offer-candidates", {
        stone: BLACK,
        region: WHOLE_BOARD,
        candidateCount: 10,
        message: `${seatName(actor)} offers ten pairwise non-equivalent Black fifth moves.`,
      });
    }
    case "choose-fifth": {
      const actor = seatForColor(state.colors, WHITE);
      return makeInstruction(state, actor, "choose-candidate", {
        stone: BLACK,
        candidateCount: 10,
        message: `${seatName(actor)} chooses which offered Black move becomes move 5.`,
      });
    }
    case "place-sixth": {
      const actor = seatForColor(state.colors, WHITE);
      return placementInstruction(state, actor, 6, WHITE, WHOLE_BOARD);
    }
    case "complete": {
      const actor = seatForColor(state.colors, BLACK);
      return makeInstruction(state, actor, "normal-play", {
        message: `Opening complete. ${seatName(actor)} has Black and plays move 7 next.`,
      });
    }
  }
}

export function getOpeningPhaseInstruction(
  state: OpeningState,
): OpeningPhaseInstruction {
  return state.protocol === "classic-rif"
    ? getClassicRifInstruction(state)
    : getTaraguchi10Instruction(state);
}

export function getOpeningActor(state: OpeningState): PlayerSeat | null {
  return getOpeningPhaseInstruction(state).actorSeat;
}

export function isOpeningComplete(state: OpeningState): boolean {
  return state.phase === "complete";
}

function failure(
  state: OpeningState,
  code: OpeningTransitionErrorCode,
  message: string,
  candidateValidation?: CandidateOfferValidation,
): OpeningTransitionFailure {
  const error: OpeningTransitionErrorInfo =
    candidateValidation === undefined
      ? { code, message }
      : { code, message, candidateValidation };
  return { ok: false, state, error };
}

function success(state: OpeningState): OpeningTransitionResult {
  return { ok: true, state };
}

function plainState(
  state: OpeningState,
  phase: OpeningPhase,
  colors: SeatColors = state.colors,
  moves: readonly PlayedMove[] = state.moves,
): OpeningState {
  return {
    protocol: state.protocol,
    phase,
    boardSize: state.boardSize,
    colors,
    moves,
  } as OpeningState;
}

function choiceState(
  state: OpeningState,
  candidates: readonly Move[],
): OpeningState {
  return {
    protocol: state.protocol,
    phase: "choose-fifth",
    boardSize: state.boardSize,
    colors: state.colors,
    moves: state.moves,
    candidates: candidates.map((move) => ({ x: move.x, y: move.y })),
  } as OpeningState;
}

function placementError(
  state: OpeningState,
  move: Move,
  region: OpeningPlacementRegion,
): string | null {
  if (!isMoveCoordinate(move)) return "Move coordinates must be integers.";
  if (!isInsideOpeningBoard(move, state.boardSize)) {
    return "Move is outside the board.";
  }
  if (state.moves.some((played) => played.x === move.x && played.y === move.y)) {
    return "Move is on an occupied intersection.";
  }
  if (
    region.kind === "central-square" &&
    !isInCentralSquare(move, state.boardSize, region.size)
  ) {
    return `Move must be inside the central ${region.size}x${region.size} square.`;
  }
  return null;
}

function placeAndAdvance(
  state: OpeningState,
  action: Extract<OpeningAction, { readonly type: "place-stone" }>,
  stone: Player,
  region: OpeningPlacementRegion,
  nextPhase: OpeningPhase,
): OpeningTransitionResult {
  const error = placementError(state, action.move, region);
  if (error !== null) return failure(state, "invalid-move", error);
  const moves: PlayedMove[] = [
    ...state.moves,
    { x: action.move.x, y: action.move.y, player: stone },
  ];
  return success(plainState(state, nextPhase, state.colors, moves));
}

function resolveCandidate(
  candidates: readonly Move[],
  selection: number | Move,
): Move | null {
  if (typeof selection === "number") {
    if (!Number.isInteger(selection) || selection < 0) return null;
    const selected = candidates[selection];
    return selected === undefined ? null : selected;
  }
  return (
    candidates.find(
      (candidate) => candidate.x === selection.x && candidate.y === selection.y,
    ) ?? null
  );
}

function transitionClassicRif(
  state: ClassicRifState,
  action: OpeningAction,
): OpeningTransitionResult {
  switch (state.phase) {
    case "place-first":
      return action.type === "place-stone"
        ? placeAndAdvance(state, action, BLACK, centralSquare(1), "place-second")
        : failure(state, "wrong-action", "Place the first stone.");
    case "place-second":
      return action.type === "place-stone"
        ? placeAndAdvance(state, action, WHITE, centralSquare(3), "place-third")
        : failure(state, "wrong-action", "Place the second stone.");
    case "place-third":
      return action.type === "place-stone"
        ? placeAndAdvance(state, action, BLACK, centralSquare(5), "choose-colors")
        : failure(state, "wrong-action", "Place the third stone.");
    case "choose-colors":
      return action.type === "choose-swap"
        ? success(
            plainState(
              state,
              "place-fourth",
              action.swap ? swapSeatColors(state.colors) : state.colors,
            ),
          )
        : failure(state, "wrong-action", "Choose whether to swap colors.");
    case "place-fourth":
      return action.type === "place-stone"
        ? placeAndAdvance(state, action, WHITE, WHOLE_BOARD, "offer-fifth")
        : failure(state, "wrong-action", "Place the fourth stone.");
    case "offer-fifth": {
      if (action.type !== "offer-candidates") {
        return failure(state, "wrong-action", "Offer two fifth-move candidates.");
      }
      const validation = validateClassicRifOffer({
        boardSize: state.boardSize,
        position: state.moves,
        candidates: action.candidates,
        candidatePlayer: BLACK,
      });
      return validation.valid
        ? success(choiceState(state, action.candidates))
        : failure(
            state,
            "invalid-offer",
            "The two fifth-move candidates are not a valid Classic RIF offer.",
            validation,
          );
    }
    case "choose-fifth": {
      if (action.type !== "choose-candidate") {
        return failure(state, "wrong-action", "Choose a fifth-move candidate.");
      }
      const candidate = resolveCandidate(state.candidates, action.candidate);
      if (candidate === null) {
        return failure(state, "invalid-choice", "Candidate selection is not in the offer.");
      }
      const moves: PlayedMove[] = [
        ...state.moves,
        { x: candidate.x, y: candidate.y, player: BLACK },
      ];
      return success(plainState(state, "place-sixth", state.colors, moves));
    }
    case "place-sixth":
      return action.type === "place-stone"
        ? placeAndAdvance(state, action, WHITE, WHOLE_BOARD, "complete")
        : failure(state, "wrong-action", "Place the sixth stone.");
    case "complete":
      return failure(state, "complete", "The opening protocol is already complete.");
  }
}

function transitionTaraguchi10(
  state: Taraguchi10State,
  action: OpeningAction,
): OpeningTransitionResult {
  switch (state.phase) {
    case "place-first":
      return action.type === "place-stone"
        ? placeAndAdvance(state, action, BLACK, centralSquare(1), "swap-after-first")
        : failure(state, "wrong-action", "Place the first stone.");
    case "swap-after-first":
      return action.type === "choose-swap"
        ? success(
            plainState(
              state,
              "place-second",
              action.swap ? swapSeatColors(state.colors) : state.colors,
            ),
          )
        : failure(state, "wrong-action", "Choose whether to swap after move 1.");
    case "place-second":
      return action.type === "place-stone"
        ? placeAndAdvance(state, action, WHITE, centralSquare(3), "swap-after-second")
        : failure(state, "wrong-action", "Place the second stone.");
    case "swap-after-second":
      return action.type === "choose-swap"
        ? success(
            plainState(
              state,
              "place-third",
              action.swap ? swapSeatColors(state.colors) : state.colors,
            ),
          )
        : failure(state, "wrong-action", "Choose whether to swap after move 2.");
    case "place-third":
      return action.type === "place-stone"
        ? placeAndAdvance(state, action, BLACK, centralSquare(5), "swap-after-third")
        : failure(state, "wrong-action", "Place the third stone.");
    case "swap-after-third":
      return action.type === "choose-swap"
        ? success(
            plainState(
              state,
              "place-fourth",
              action.swap ? swapSeatColors(state.colors) : state.colors,
            ),
          )
        : failure(state, "wrong-action", "Choose whether to swap after move 3.");
    case "place-fourth":
      return action.type === "place-stone"
        ? placeAndAdvance(
            state,
            action,
            WHITE,
            centralSquare(7),
            "choose-after-fourth",
          )
        : failure(state, "wrong-action", "Place the fourth stone.");
    case "choose-after-fourth": {
      if (action.type !== "choose-after-fourth") {
        return failure(state, "wrong-action", "Choose a Taraguchi path after move 4.");
      }
      if (action.decision === "offer-ten") {
        return success(plainState(state, "offer-fifth"));
      }
      const colors =
        action.decision === "swap" ? swapSeatColors(state.colors) : state.colors;
      return success(plainState(state, "place-fifth", colors));
    }
    case "place-fifth":
      return action.type === "place-stone"
        ? placeAndAdvance(
            state,
            action,
            BLACK,
            centralSquare(9),
            "swap-after-fifth",
          )
        : failure(state, "wrong-action", "Place the fifth stone.");
    case "swap-after-fifth":
      return action.type === "choose-swap"
        ? success(
            plainState(
              state,
              "place-sixth",
              action.swap ? swapSeatColors(state.colors) : state.colors,
            ),
          )
        : failure(state, "wrong-action", "Choose whether to swap after move 5.");
    case "offer-fifth": {
      if (action.type !== "offer-candidates") {
        return failure(state, "wrong-action", "Offer ten fifth-move candidates.");
      }
      const validation = validateTaraguchi10Offer({
        boardSize: state.boardSize,
        position: state.moves,
        candidates: action.candidates,
        candidatePlayer: BLACK,
      });
      return validation.valid
        ? success(choiceState(state, action.candidates))
        : failure(
            state,
            "invalid-offer",
            "The ten fifth-move candidates are not a valid Taraguchi-10 offer.",
            validation,
          );
    }
    case "choose-fifth": {
      if (action.type !== "choose-candidate") {
        return failure(state, "wrong-action", "Choose a fifth-move candidate.");
      }
      const candidate = resolveCandidate(state.candidates, action.candidate);
      if (candidate === null) {
        return failure(state, "invalid-choice", "Candidate selection is not in the offer.");
      }
      const moves: PlayedMove[] = [
        ...state.moves,
        { x: candidate.x, y: candidate.y, player: BLACK },
      ];
      return success(plainState(state, "place-sixth", state.colors, moves));
    }
    case "place-sixth":
      return action.type === "place-stone"
        ? placeAndAdvance(state, action, WHITE, WHOLE_BOARD, "complete")
        : failure(state, "wrong-action", "Place the sixth stone.");
    case "complete":
      return failure(state, "complete", "The opening protocol is already complete.");
  }
}

/** Safe transition for UI event handlers. The input state is never mutated. */
export function transitionOpening(
  state: OpeningState,
  action: OpeningAction,
): OpeningTransitionResult {
  if (state.phase === "complete") {
    return failure(state, "complete", "The opening protocol is already complete.");
  }

  const instruction = getOpeningPhaseInstruction(state);
  if (instruction.action !== action.type) {
    return failure(
      state,
      "wrong-action",
      `Phase ${state.phase} requires action ${instruction.action}.`,
    );
  }
  if (instruction.actorSeat !== action.seat) {
    return failure(
      state,
      "wrong-seat",
      `${seatName(instruction.actorSeat ?? "first")} must act in phase ${state.phase}.`,
    );
  }

  return state.protocol === "classic-rif"
    ? transitionClassicRif(state, action)
    : transitionTaraguchi10(state, action);
}

export class OpeningProtocolError extends Error {
  readonly code: OpeningTransitionErrorCode;
  readonly candidateValidation?: CandidateOfferValidation;

  constructor(info: OpeningTransitionErrorInfo) {
    super(info.message);
    this.name = "OpeningProtocolError";
    this.code = info.code;
    if (info.candidateValidation !== undefined) {
      this.candidateValidation = info.candidateValidation;
    }
  }
}

/** Throwing transition for reducers or callers that treat invalid actions as bugs. */
export function applyOpeningAction(
  state: OpeningState,
  action: OpeningAction,
): OpeningState {
  const result = transitionOpening(state, action);
  if (!result.ok) throw new OpeningProtocolError(result.error);
  return result.state;
}
