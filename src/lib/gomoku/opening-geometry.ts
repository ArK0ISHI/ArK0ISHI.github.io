import { BLACK, WHITE, type Move, type PlayedMove, type Player } from "./types";
import type {
  CandidateOfferIssue,
  CandidateOfferRequest,
  CandidateOfferValidation,
  CentralSquareSize,
} from "./opening-types";

export interface CentralSquareBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * A point's explicit label is included in a signature when supplied; otherwise
 * its color is used. Labels can preserve move roles such as `first` or
 * `candidate` when same-colored stones must not be interchangeable.
 */
export interface OpeningShapePoint extends Move {
  readonly player?: Player;
  readonly label?: string;
}

type CoordinateTransform = (x: number, y: number) => readonly [number, number];

const D4_TRANSFORMS: readonly CoordinateTransform[] = [
  (x, y) => [x, y],
  (x, y) => [-y, x],
  (x, y) => [-x, -y],
  (x, y) => [y, -x],
  (x, y) => [-x, y],
  (x, y) => [-y, -x],
  (x, y) => [x, -y],
  (x, y) => [y, x],
];

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function coordinateKey(move: Move): string {
  return `${move.x},${move.y}`;
}

export function isMoveCoordinate(move: Move): boolean {
  return Number.isInteger(move.x) && Number.isInteger(move.y);
}

export function isInsideOpeningBoard(move: Move, boardSize: number): boolean {
  return (
    isMoveCoordinate(move) &&
    Number.isInteger(boardSize) &&
    boardSize > 0 &&
    move.x >= 0 &&
    move.y >= 0 &&
    move.x < boardSize &&
    move.y < boardSize
  );
}

/** Returns the unique center coordinate of an odd square board. */
export function getOpeningBoardCenter(boardSize: number): Move {
  assertPositiveInteger(boardSize, "Board size");
  if (boardSize % 2 === 0) {
    throw new RangeError("Opening protocols require an odd board size.");
  }
  const coordinate = Math.floor(boardSize / 2);
  return { x: coordinate, y: coordinate };
}

export function getCentralSquareBounds(
  boardSize: number,
  squareSize: CentralSquareSize,
): CentralSquareBounds {
  const center = getOpeningBoardCenter(boardSize);
  assertPositiveInteger(squareSize, "Central square size");
  if (squareSize % 2 === 0 || squareSize > boardSize) {
    throw new RangeError(
      "Central square size must be odd and no larger than the board.",
    );
  }
  const radius = Math.floor(squareSize / 2);
  return {
    minX: center.x - radius,
    maxX: center.x + radius,
    minY: center.y - radius,
    maxY: center.y + radius,
  };
}

export function isInCentralSquare(
  move: Move,
  boardSize: number,
  squareSize: CentralSquareSize,
): boolean {
  if (!isMoveCoordinate(move)) return false;
  const bounds = getCentralSquareBounds(boardSize, squareSize);
  return (
    move.x >= bounds.minX &&
    move.x <= bounds.maxX &&
    move.y >= bounds.minY &&
    move.y <= bounds.maxY
  );
}

/**
 * Produces a canonical colored-shape signature under all eight D4 symmetries
 * and arbitrary translation. Board bounds are deliberately not an input:
 * equivalent local opening shapes stay equivalent near different board edges.
 */
export function canonicalOpeningShapeSignature(
  points: readonly OpeningShapePoint[],
): string {
  if (points.length === 0) return "[]";

  const checked = points.map((point) => {
    if (!isMoveCoordinate(point)) {
      throw new TypeError("Opening shape coordinates must be integers.");
    }
    const player = point.player ?? 0;
    if (player !== 0 && player !== BLACK && player !== WHITE) {
      throw new TypeError(`Invalid opening shape player ${String(player)}.`);
    }
    const label = point.label ?? (player === 0 ? "point" : `player:${player}`);
    return { x: point.x, y: point.y, label };
  });

  const variants: string[] = [];
  for (const transform of D4_TRANSFORMS) {
    const transformed = checked.map((point) => {
      const [x, y] = transform(point.x, point.y);
      return { x, y, label: point.label };
    });
    const minX = Math.min(...transformed.map((point) => point.x));
    const minY = Math.min(...transformed.map((point) => point.y));
    const normalized = transformed
      .map((point) => [point.x - minX, point.y - minY, point.label] as const)
      .sort((a, b) => {
        const coordinateOrder = a[0] - b[0] || a[1] - b[1];
        if (coordinateOrder !== 0) return coordinateOrder;
        return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;
      });
    variants.push(JSON.stringify(normalized));
  }

  variants.sort();
  return variants[0] ?? "[]";
}

export function areOpeningShapesEquivalent(
  first: readonly OpeningShapePoint[],
  second: readonly OpeningShapePoint[],
): boolean {
  return (
    canonicalOpeningShapeSignature(first) ===
    canonicalOpeningShapeSignature(second)
  );
}

export function candidateOpeningShapeSignature(
  position: readonly PlayedMove[],
  candidate: Move,
  candidatePlayer: Player = BLACK,
): string {
  return canonicalOpeningShapeSignature([
    ...position.map((move) => ({
      x: move.x,
      y: move.y,
      label: `player:${move.player}`,
    })),
    {
      x: candidate.x,
      y: candidate.y,
      player: candidatePlayer,
      label: `candidate:${candidatePlayer}`,
    },
  ]);
}

/**
 * Checks count, coordinates, occupancy, duplicates, and symmetry-equivalent
 * alternatives. Symmetry is tested against the whole resulting position.
 */
export function validateCandidateOffer(
  request: CandidateOfferRequest,
): CandidateOfferValidation {
  const {
    boardSize,
    position,
    candidates,
    expectedCount,
    candidatePlayer = BLACK,
  } = request;
  getOpeningBoardCenter(boardSize);
  assertPositiveInteger(expectedCount, "Expected candidate count");

  const issues: CandidateOfferIssue[] = [];
  const signatures: (string | null)[] = candidates.map(() => null);
  const occupied = new Set(position.map(coordinateKey));
  const seenCoordinates = new Map<string, number>();
  const eligible = candidates.map(() => true);

  if (candidates.length !== expectedCount) {
    issues.push({
      code: "wrong-count",
      message: `Expected ${expectedCount} candidates, received ${candidates.length}.`,
    });
  }

  candidates.forEach((candidate, candidateIndex) => {
    if (!isMoveCoordinate(candidate)) {
      eligible[candidateIndex] = false;
      issues.push({
        code: "invalid-coordinate",
        candidateIndex,
        message: `Candidate ${candidateIndex + 1} must use integer coordinates.`,
      });
      return;
    }
    if (!isInsideOpeningBoard(candidate, boardSize)) {
      eligible[candidateIndex] = false;
      issues.push({
        code: "out-of-bounds",
        candidateIndex,
        message: `Candidate ${candidateIndex + 1} is outside the board.`,
      });
      return;
    }

    const key = coordinateKey(candidate);
    if (occupied.has(key)) {
      eligible[candidateIndex] = false;
      issues.push({
        code: "occupied",
        candidateIndex,
        message: `Candidate ${candidateIndex + 1} is already occupied.`,
      });
    }

    const priorIndex = seenCoordinates.get(key);
    if (priorIndex !== undefined) {
      eligible[candidateIndex] = false;
      issues.push({
        code: "duplicate",
        candidateIndex,
        relatedCandidateIndex: priorIndex,
        message: `Candidate ${candidateIndex + 1} duplicates candidate ${priorIndex + 1}.`,
      });
    } else {
      seenCoordinates.set(key, candidateIndex);
    }
  });

  const seenSignatures = new Map<string, number>();
  candidates.forEach((candidate, candidateIndex) => {
    if (eligible[candidateIndex] !== true) return;
    const signature = candidateOpeningShapeSignature(
      position,
      candidate,
      candidatePlayer,
    );
    signatures[candidateIndex] = signature;
    const priorIndex = seenSignatures.get(signature);
    if (priorIndex === undefined) {
      seenSignatures.set(signature, candidateIndex);
      return;
    }
    issues.push({
      code: "symmetry-equivalent",
      candidateIndex,
      relatedCandidateIndex: priorIndex,
      message: `Candidate ${candidateIndex + 1} is symmetry-equivalent to candidate ${priorIndex + 1}.`,
    });
  });

  return {
    valid: issues.length === 0,
    expectedCount,
    actualCount: candidates.length,
    issues,
    signatures,
  };
}

export function validateClassicRifOffer(
  request: Omit<CandidateOfferRequest, "expectedCount">,
): CandidateOfferValidation {
  return validateCandidateOffer({ ...request, expectedCount: 2 });
}

export function validateTaraguchi10Offer(
  request: Omit<CandidateOfferRequest, "expectedCount">,
): CandidateOfferValidation {
  return validateCandidateOffer({ ...request, expectedCount: 10 });
}
