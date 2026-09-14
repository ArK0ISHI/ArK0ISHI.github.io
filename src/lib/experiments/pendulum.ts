/** Equal point masses (1 kg), massless rigid rods (1 m), no friction.
 * Canonical state is [theta1, theta2, p1, p2], angles from downward vertical.
 * H = (p1² + 2p2² − 2cos(delta)p1p2)/(2(2 − cos²(delta)))
 *     − g(2cos(theta1) + cos(theta2)).
 * Keeping canonical momenta matters: midpoint in (theta, angular velocity)
 * would not in general preserve the canonical symplectic form.
 */
export type PendulumState = [number, number, number, number];
export type PendulumMethod = 'rk4' | 'midpoint';
export const GRAVITY = 9.81;
/** Fixed, positive physical scale; unlike E0 it cannot vanish. */
export const ENERGY_SCALE = 3 * GRAVITY;

export function initialState(angle1: number, angle2: number): PendulumState {
  return [angle1 * Math.PI / 180, angle2 * Math.PI / 180, 0, 0];
}

export function hamiltonian(y: PendulumState): number {
  const [q1, q2, p1, p2] = y;
  const c = Math.cos(q1 - q2);
  return (p1 * p1 + 2 * p2 * p2 - 2 * c * p1 * p2) / (2 * (2 - c * c))
    - GRAVITY * (2 * Math.cos(q1) + Math.cos(q2));
}

export function pendulumField(y: PendulumState): PendulumState {
  const [q1, q2, p1, p2] = y;
  const delta = q1 - q2;
  const c = Math.cos(delta);
  const denominator = 2 - c * c;
  const w1 = (p1 - c * p2) / denominator;
  const w2 = (2 * p2 - c * p1) / denominator;
  const coupling = Math.sin(delta) * w1 * w2;
  return [w1, w2, -coupling - 2 * GRAVITY * Math.sin(q1), coupling - GRAVITY * Math.sin(q2)];
}

function shifted(y: PendulumState, derivative: PendulumState, amount: number): PendulumState {
  return y.map((value, index) => value + amount * derivative[index]) as PendulumState;
}

export function rk4Step(y: PendulumState, h: number): PendulumState {
  const a = pendulumField(y);
  const b = pendulumField(shifted(y, a, h / 2));
  const c = pendulumField(shifted(y, b, h / 2));
  const d = pendulumField(shifted(y, c, h));
  return y.map((value, index) => value + h * (a[index] + 2 * b[index] + 2 * c[index] + d[index]) / 6) as PendulumState;
}

function solveLinear(matrix: number[][], right: number[]): PendulumState {
  const a = matrix.map((row, i) => [...row, right[i]]);
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    }
    if (Math.abs(a[pivot][column]) < 1e-14) throw new Error('Midpoint Jacobian is singular');
    [a[column], a[pivot]] = [a[pivot], a[column]];
    const divisor = a[column][column];
    for (let j = column; j <= 4; j++) a[column][j] /= divisor;
    for (let row = 0; row < 4; row++) {
      if (row === column) continue;
      const multiplier = a[row][column];
      for (let j = column; j <= 4; j++) a[row][j] -= multiplier * a[column][j];
    }
  }
  return a.map(row => row[4]) as PendulumState;
}

/** Newton iteration solves the implicit equation without adaptive substeps.
 * No unconverged state is returned. Residual tolerance is close to roundoff.
 */
export function midpointStep(y: PendulumState, h: number): PendulumState {
  let next = shifted(y, pendulumField(y), h);
  for (let iteration = 0; iteration < 12; iteration++) {
    const middle = y.map((value, i) => (value + next[i]) / 2) as PendulumState;
    const field = pendulumField(middle);
    const residual = next.map((value, i) => value - y[i] - h * field[i]);
    if (Math.max(...residual.map(Math.abs)) < 2e-12) return next;
    const jacobian = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    for (let column = 0; column < 4; column++) {
      const epsilon = 1e-5 * Math.max(1, Math.abs(middle[column]));
      const plus = [...middle] as PendulumState;
      const minus = [...middle] as PendulumState;
      plus[column] += epsilon;
      minus[column] -= epsilon;
      const fp = pendulumField(plus);
      const fm = pendulumField(minus);
      for (let row = 0; row < 4; row++) {
        jacobian[row][column] = (row === column ? 1 : 0) - h / 2 * (fp[row] - fm[row]) / (2 * epsilon);
      }
    }
    const correction = solveLinear(jacobian, residual);
    next = next.map((value, i) => value - correction[i]) as PendulumState;
  }
  throw new Error('Midpoint solve did not converge');
}

export function pendulumStep(y: PendulumState, h: number, method: PendulumMethod): PendulumState {
  const next = method === 'midpoint' ? midpointStep(y, h) : rk4Step(y, h);
  if (!next.every(Number.isFinite)) throw new Error('Non-finite pendulum state');
  return next;
}

export function bobPositions(y: PendulumState): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = Math.sin(y[0]);
  const y1 = Math.cos(y[0]);
  return { x1, y1, x2: x1 + Math.sin(y[1]), y2: y1 + Math.cos(y[1]) };
}

export function scaledEnergyError(y: PendulumState, startingEnergy: number): number {
  return (hamiltonian(y) - startingEnergy) / ENERGY_SCALE;
}
