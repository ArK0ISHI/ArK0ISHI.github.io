import type { Move, PlayedMove, Player } from "./types";

export type OpeningProtocol = "classic-rif" | "taraguchi-10";

/**
 * Seats never change. Stone colors may change several times during an opening.
 * `first` is tentative Black at the beginning of either protocol.
 */
export type PlayerSeat = "first" | "second";

export interface SeatColors {
  readonly first: Player;
  readonly second: Player;
}

export type CentralSquareSize = 1 | 3 | 5 | 7 | 9;

export type OpeningPlacementRegion =
  | { readonly kind: "board" }
  | {
      readonly kind: "central-square";
      readonly size: CentralSquareSize;
    };

export type ClassicRifPhase =
  | "place-first"
  | "place-second"
  | "place-third"
  | "choose-colors"
  | "place-fourth"
  | "offer-fifth"
  | "choose-fifth"
  | "place-sixth"
  | "complete";

export type Taraguchi10Phase =
  | "place-first"
  | "swap-after-first"
  | "place-second"
  | "swap-after-second"
  | "place-third"
  | "swap-after-third"
  | "place-fourth"
  | "choose-after-fourth"
  | "place-fifth"
  | "swap-after-fifth"
  | "offer-fifth"
  | "choose-fifth"
  | "place-sixth"
  | "complete";

export type OpeningPhase = ClassicRifPhase | Taraguchi10Phase;

export interface OpeningStateBase<
  Protocol extends OpeningProtocol,
  Phase extends OpeningPhase,
> {
  readonly protocol: Protocol;
  readonly phase: Phase;
  readonly boardSize: number;
  readonly colors: SeatColors;
  /** Committed moves only, in move-number order. */
  readonly moves: readonly PlayedMove[];
}

export interface CandidateChoiceState<
  Protocol extends OpeningProtocol,
  Phase extends "choose-fifth",
> extends OpeningStateBase<Protocol, Phase> {
  /** Provisional black fifth moves. Exactly one is committed when chosen. */
  readonly candidates: readonly Move[];
}

type ClassicRifPlainPhase = Exclude<ClassicRifPhase, "choose-fifth">;
type Taraguchi10PlainPhase = Exclude<Taraguchi10Phase, "choose-fifth">;

export type ClassicRifState =
  | OpeningStateBase<"classic-rif", ClassicRifPlainPhase>
  | CandidateChoiceState<"classic-rif", "choose-fifth">;

export type Taraguchi10State =
  | OpeningStateBase<"taraguchi-10", Taraguchi10PlainPhase>
  | CandidateChoiceState<"taraguchi-10", "choose-fifth">;

export type OpeningState = ClassicRifState | Taraguchi10State;

export type TaraguchiAfterFourthDecision = "continue" | "swap" | "offer-ten";

export type OpeningAction =
  | {
      readonly type: "place-stone";
      readonly seat: PlayerSeat;
      readonly move: Move;
    }
  | {
      readonly type: "choose-swap";
      readonly seat: PlayerSeat;
      readonly swap: boolean;
    }
  | {
      readonly type: "choose-after-fourth";
      readonly seat: PlayerSeat;
      readonly decision: TaraguchiAfterFourthDecision;
    }
  | {
      readonly type: "offer-candidates";
      readonly seat: PlayerSeat;
      readonly candidates: readonly Move[];
    }
  | {
      readonly type: "choose-candidate";
      readonly seat: PlayerSeat;
      /** A zero-based candidate index or the candidate coordinate itself. */
      readonly candidate: number | Move;
    };

export type OpeningInstructionAction =
  | OpeningAction["type"]
  | "normal-play";

export interface OpeningPhaseInstruction {
  readonly protocol: OpeningProtocol;
  readonly phase: OpeningPhase;
  readonly actorSeat: PlayerSeat | null;
  /** The actor's current assigned color, which can differ from `stone`. */
  readonly actorColor: Player | null;
  readonly action: OpeningInstructionAction;
  readonly stone: Player | null;
  readonly region: OpeningPlacementRegion | null;
  readonly candidateCount: 2 | 10 | null;
  readonly message: string;
}

export type CandidateOfferIssueCode =
  | "wrong-count"
  | "invalid-coordinate"
  | "out-of-bounds"
  | "occupied"
  | "duplicate"
  | "symmetry-equivalent";

export interface CandidateOfferIssue {
  readonly code: CandidateOfferIssueCode;
  readonly message: string;
  readonly candidateIndex?: number;
  readonly relatedCandidateIndex?: number;
}

export interface CandidateOfferValidation {
  readonly valid: boolean;
  readonly expectedCount: number;
  readonly actualCount: number;
  readonly issues: readonly CandidateOfferIssue[];
  /** `null` means that candidate failed basic coordinate/occupancy checks. */
  readonly signatures: readonly (string | null)[];
}

export interface CandidateOfferRequest {
  readonly boardSize: number;
  readonly position: readonly PlayedMove[];
  readonly candidates: readonly Move[];
  readonly expectedCount: number;
  /** Candidate fifth moves are black unless explicitly overridden. */
  readonly candidatePlayer?: Player;
}

export type OpeningTransitionErrorCode =
  | "complete"
  | "wrong-action"
  | "wrong-seat"
  | "invalid-move"
  | "invalid-offer"
  | "invalid-choice";

export interface OpeningTransitionErrorInfo {
  readonly code: OpeningTransitionErrorCode;
  readonly message: string;
  readonly candidateValidation?: CandidateOfferValidation;
}

export interface OpeningTransitionSuccess {
  readonly ok: true;
  readonly state: OpeningState;
}

export interface OpeningTransitionFailure {
  readonly ok: false;
  /** The original, unmodified state. */
  readonly state: OpeningState;
  readonly error: OpeningTransitionErrorInfo;
}

export type OpeningTransitionResult =
  | OpeningTransitionSuccess
  | OpeningTransitionFailure;
