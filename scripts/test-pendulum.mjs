import assert from 'node:assert/strict';
import { bobPositions, hamiltonian, initialState, midpointStep, pendulumField, rk4Step, scaledEnergyError } from '../src/lib/experiments/pendulum.ts';

// Run with Node >= 22.18: node scripts/test-pendulum.mjs
const norm = vector => Math.hypot(...vector);
const distance = (a, b) => norm(a.map((value, i) => value - b[i]));
const integrate = (step, initial, h, count) => {
  let state = [...initial];
  for (let i = 0; i < count; i++) state = step(state, h);
  return state;
};
const results = [];

for (const [name, step] of [['RK4', rk4Step], ['midpoint', midpointStep]]) {
  assert.deepEqual(integrate(step, [0, 0, 0, 0], 1 / 120, 1200), [0, 0, 0, 0]);
  results.push({ check: `${name}: stationary hanging solution`, pass: true });
}

// Independently compare the Hamiltonian gradient and Newton's angular equations.
// Angular equations source: myphysicslab.com/pendulum/double-pendulum-en.html
for (const state of [[.7, -1.2, 2, -3], [2.2, .4, -.5, 4.1], [.01, -.03, .04, .07]]) {
  const field = pendulumField(state);
  const epsilon = 1e-6;
  const gradient = state.map((_, index) => {
    const plus = [...state], minus = [...state];
    plus[index] += epsilon; minus[index] -= epsilon;
    return (hamiltonian(plus) - hamiltonian(minus)) / (2 * epsilon);
  });
  assert.ok(distance(field, [gradient[2], gradient[3], -gradient[0], -gradient[1]]) < 1e-7);
  const plus = pendulumField(state.map((value, i) => value + epsilon * field[i]));
  const minus = pendulumField(state.map((value, i) => value - epsilon * field[i]));
  const acceleration = [(plus[0] - minus[0]) / (2 * epsilon), (plus[1] - minus[1]) / (2 * epsilon)];
  const [q1, q2] = state;
  const [w1, w2] = field;
  const delta = q1 - q2;
  const denominator = 3 - Math.cos(2 * delta);
  const expected = [
    (-3 * 9.81 * Math.sin(q1) - 9.81 * Math.sin(q1 - 2 * q2) - 2 * Math.sin(delta) * (w2 ** 2 + w1 ** 2 * Math.cos(delta))) / denominator,
    2 * Math.sin(delta) * (2 * w1 ** 2 + 2 * 9.81 * Math.cos(q1) + w2 ** 2 * Math.cos(delta)) / denominator,
  ];
  assert.ok(distance(acceleration, expected) < 2e-7);
}
results.push({ check: 'Hamiltonian gradient and independent Newton equations at three states', pass: true });

const initial = initialState(80, -35);
const reference = integrate(rk4Step, initial, 1 / 8192, 2048);
for (const [name, step, ratioMin, ratioMax] of [['RK4', rk4Step, 13, 19], ['midpoint', midpointStep, 3.7, 4.3]]) {
  const coarse = integrate(step, initial, 1 / 64, 16);
  const fine = integrate(step, initial, 1 / 128, 32);
  const ratio = distance(coarse, reference) / distance(fine, reference);
  assert.ok(ratio > ratioMin && ratio < ratioMax, `${name} convergence ratio ${ratio}`);
  results.push({ check: `${name}: independent fine-reference convergence`, ratio, pass: true });
}

const forward = integrate(midpointStep, initial, 1 / 120, 1200);
const reversed = integrate(midpointStep, forward, -1 / 120, 1200);
const reversalError = distance(initial, reversed);
assert.ok(reversalError < 2e-7, `midpoint reversal error ${reversalError}`);
results.push({ check: 'Midpoint: 10 seconds forward and backward', reversalError, pass: true });

// Check the canonical two-form numerically, independent of trajectory/energy tests.
const state = [1.1, -.7, 2.2, -.4];
const epsilon = 1e-5;
const jacobian = Array.from({ length: 4 }, () => Array(4).fill(0));
for (let column = 0; column < 4; column++) {
  const plus = [...state], minus = [...state];
  plus[column] += epsilon; minus[column] -= epsilon;
  const fp = midpointStep(plus, 1 / 60), fm = midpointStep(minus, 1 / 60);
  for (let row = 0; row < 4; row++) jacobian[row][column] = (fp[row] - fm[row]) / (2 * epsilon);
}
const J = [[0, 0, 1, 0], [0, 0, 0, 1], [-1, 0, 0, 0], [0, -1, 0, 0]];
let symplecticResidual = 0;
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
  let sum = 0;
  for (let k = 0; k < 4; k++) for (let l = 0; l < 4; l++) sum += jacobian[k][i] * J[k][l] * jacobian[l][j];
  symplecticResidual = Math.max(symplecticResidual, Math.abs(sum - J[i][j]));
}
assert.ok(symplecticResidual < 1e-8);
results.push({ check: 'Midpoint: canonical symplectic two-form', symplecticResidual, pass: true });

for (const [name, step, bound] of [['RK4', rk4Step, .0001], ['midpoint', midpointStep, .003]]) {
  let state = initialState(120, -20);
  const startingEnergy = hamiltonian(state);
  let maxError = 0;
  for (let i = 0; i < 7200; i++) {
    state = step(state, 1 / 120);
    maxError = Math.max(maxError, Math.abs(scaledEnergyError(state, startingEnergy)));
    const p = bobPositions(state);
    assert.ok(Math.abs(Math.hypot(p.x1, p.y1) - 1) < 1e-12);
    assert.ok(Math.abs(Math.hypot(p.x2 - p.x1, p.y2 - p.y1) - 1) < 1e-12);
  }
  assert.ok(maxError < bound, `${name} 60-second energy error ${maxError}`);
  results.push({ check: `${name}: 60-second energy envelope and rigid rod lengths`, maxScaledEnergyError: maxError, pass: true });
}

const zeroEnergy = initialState(90, 90);
assert.ok(Math.abs(hamiltonian(zeroEnergy)) < 1e-12);
assert.ok(Number.isFinite(scaledEnergyError(rk4Step(zeroEnergy, 1 / 120), hamiltonian(zeroEnergy))));
results.push({ check: 'Finite energy diagnostic when initial total energy is zero', pass: true });

// Bound the public controls: coarse step, full session, extreme initial angles,
// and maximum perturbation. All candidates must remain finite and converge.
let extremeTrajectories = 0;
for (const angles of [[175, 175], [-175, 175], [175, -175], [0, 175], [175, 0]]) {
  for (const step of [rk4Step, midpointStep]) {
    for (const perturbation of [0, 1]) {
      const result = integrate(step, initialState(angles[0], angles[1] + perturbation), 1 / 60, 7200);
      assert.ok(result.every(Number.isFinite));
      extremeTrajectories++;
    }
  }
}
results.push({ check: 'Extreme angle bounds at coarsest step for full 120-second session', extremeTrajectories, pass: true });
console.log(JSON.stringify({ passed: results.length, results }, null, 2));
