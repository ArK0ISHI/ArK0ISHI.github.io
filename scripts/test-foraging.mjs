import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoodStream, createPrior, createRun, advanceRun, chooseTarget, DURATION_TICKS, STEP, manhattan } from '../src/lib/experiments/foraging.ts';

const uniform = createPrior('uniform');
const food = (id, x, y, born, expires, value = 5) => ({ id, x, y, born, expires, value });
const snapshot = run => ({ tick: run.tick, ...run.robot, consumed: [...run.robot.consumed], expired: [...run.robot.expired] });

test('a scene has reproducible arrivals, legal grid points and exactly three-second lifetimes', () => {
  const events = createFoodStream(23917, 'hotspots');
  assert.deepEqual(events, createFoodStream(23917, 'hotspots'));
  assert.notDeepEqual(events, createFoodStream(23918, 'hotspots'));
  assert.equal(events.filter(event => event.born === 0).length, 4);
  assert.equal(events.length, 123);
  for (const event of events) {
    assert.ok(Number.isInteger(event.x) && event.x >= 0 && event.x < 10);
    assert.ok(Number.isInteger(event.y) && event.y >= 0 && event.y < 10);
    assert.ok(event.value >= 1 && event.value <= 9 && Number.isInteger(event.value));
    assert.equal(event.expires - event.born, 60);
  }
  assert.ok(Math.abs(uniform.reduce((a, b) => a + b) - 1) < 1e-12);
  assert.ok(Math.abs(createPrior('hotspots').reduce((a, b) => a + b) - 1) < 1e-12);
});

test('arrival at exactly three seconds captures; one tick too late is unreachable', () => {
  for (const policy of ['nearest', 'rolling']) {
    const exact = createRun([food(0, 3, 0, 0, 60)], uniform, policy, { x: 0, y: 0 });
    advanceRun(exact, 59);
    assert.equal(exact.robot.captured, 0);
    advanceRun(exact);
    assert.equal(exact.robot.captured, 1);
    assert.equal(exact.robot.score, 5);
    assert.equal(exact.robot.expired.size, 0);
    assert.equal(exact.robot.x, 3);
    const tooLate = createRun([food(0, 3, 0, 0, 59)], uniform, policy, { x: 0, y: 0 });
    advanceRun(tooLate, 60);
    assert.equal(tooLate.robot.captured, 0);
    assert.ok(tooLate.robot.expired.has(0));
  }
});

test('food appearing during an edge crossing is observed and captured on arrival', () => {
  for (const policy of ['nearest', 'rolling']) {
    const run = createRun([food(0, 2, 0, 0, 60), food(1, 1, 0, 10, 70, 7), food(2, 1, 0, 15, 75, 3)], uniform, policy, { x: 0, y: 0 });
    advanceRun(run, 19);
    assert.equal(run.robot.captured, 0);
    advanceRun(run);
    assert.equal(run.robot.x, 1);
    assert.equal(run.robot.y, 0);
    assert.equal(run.robot.captured, 2);
    assert.equal(run.robot.score, 10);
  }
});

test('policies cannot react to unseen future arrivals', () => {
  const prefix = [food(0, 5, 4, 0, 60), food(1, 6, 4, 30, 90)];
  const streamA = [...prefix, food(2, 0, 0, 100, 160, 1)];
  const streamB = [...prefix, food(2, 9, 9, 100, 160, 9), food(3, 4, 4, 110, 170, 9)];
  for (const policy of ['nearest', 'rolling']) {
    const a = createRun(streamA, uniform, policy), b = createRun(streamB, uniform, policy);
    for (let tick = 0; tick < 99; tick++) {
      advanceRun(a); advanceRun(b);
      assert.deepEqual(snapshot(a), snapshot(b));
    }
  }
  const current = Object.freeze(prefix.map(event => Object.freeze({ ...event })));
  assert.doesNotThrow(() => chooseTarget(Object.freeze({ x: 4, y: 4 }), current, 30, 'rolling', Object.freeze([...uniform])));
});

test('both policies use independent captures over the identical immutable scene', () => {
  const stream = Object.freeze(createFoodStream(23917, 'hotspots').map(event => Object.freeze(event)));
  const prior = Object.freeze(createPrior('hotspots'));
  const a = createRun(stream, prior, 'nearest'), b = createRun(stream, prior, 'rolling');
  assert.equal(a.stream, b.stream);
  assert.notEqual(a.robot.consumed, b.robot.consumed);
  advanceRun(a, 200);
  assert.equal(b.tick, 0);
  assert.equal(b.robot.captured, 0);
  assert.deepEqual(stream, createFoodStream(23917, 'hotspots'));
});

test('every movement respects one metre per second, grid edges and arena boundaries', () => {
  for (const distribution of ['hotspots', 'uniform']) for (const policy of ['nearest', 'rolling']) {
    const run = createRun(createFoodStream(27182, distribution), createPrior(distribution), policy);
    let walked = 0;
    for (let tick = 0; tick < DURATION_TICKS; tick++) {
      const before = { x: run.robot.x, y: run.robot.y };
      advanceRun(run);
      const distance = manhattan(before, run.robot);
      walked += distance;
      assert.ok(distance <= STEP + 1e-8, `speed exceeded at tick ${tick}`);
      assert.ok(Math.abs(before.x - run.robot.x) < 1e-8 || Math.abs(before.y - run.robot.y) < 1e-8, 'diagonal movement');
      assert.ok(Math.abs(run.robot.x - Math.round(run.robot.x)) < 1e-8 || Math.abs(run.robot.y - Math.round(run.robot.y)) < 1e-8, 'off-grid movement');
      assert.ok(run.robot.x >= 0 && run.robot.x <= 9 && run.robot.y >= 0 && run.robot.y <= 9);
    }
    assert.ok(Math.abs(walked - run.robot.distance) < 1e-8);
    assert.ok(walked <= 60 + 1e-8);
    assert.equal(run.robot.captured, run.robot.consumed.size);
    assert.equal(run.robot.score, run.stream.filter(event => run.robot.consumed.has(event.id)).reduce((sum, event) => sum + event.value, 0));
    for (const id of run.robot.consumed) assert.ok(!run.robot.expired.has(id));
  }
});

test('changing playback batches does not change a completed run; simulation stops at sixty seconds', () => {
  for (const policy of ['nearest', 'rolling']) {
    const stream = createFoodStream(23917, 'hotspots'), prior = createPrior('hotspots');
    const a = createRun(stream, prior, policy), b = createRun(stream, prior, policy);
    for (let tick = 0; tick < DURATION_TICKS; tick++) advanceRun(a);
    for (const batch of [7, 51, 1, 141, 1000]) advanceRun(b, batch);
    assert.deepEqual(snapshot(a), snapshot(b));
    const completed = snapshot(b);
    advanceRun(b, 100);
    assert.deepEqual(snapshot(b), completed);
  }
});
