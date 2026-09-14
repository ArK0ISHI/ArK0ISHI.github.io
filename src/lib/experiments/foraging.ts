/** A deterministic teaching model. Policies receive current observations, never the event stream. */
export const STEP = 0.05;
export const GRID_SIZE = 10;
export const LIFETIME_TICKS = 60;
export const DURATION_TICKS = 1200;
export type Distribution = 'hotspots' | 'uniform';
export type Policy = 'nearest' | 'rolling';
export interface Point { x: number; y: number }
export interface Food extends Point { id: number; born: number; expires: number; value: number }
export interface Decision { target: Point | null; foodId: number | null; reason: string }
export interface Robot extends Point {
  edge: Point | null; target: Point | null; foodId: number | null;
  score: number; captured: number; distance: number; reason: string;
  consumed: Set<number>; expired: Set<number>; trail: Point[];
  lastCapture: { tick: number; x: number; y: number; value: number } | null;
}
export interface Run { tick: number; stream: readonly Food[]; prior: readonly number[]; policy: Policy; robot: Robot }
const EPSILON = 1e-8;
export const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function createPrior(distribution: Distribution): number[] {
  const centers = [{ x: 3, y: 3, weight: 0.5 }, { x: 7, y: 6, weight: 0.35 }, { x: 2, y: 8, weight: 0.15 }];
  const weights = Array.from({ length: 100 }, (_, index) => {
    if (distribution === 'uniform') return 1;
    const x = index % 10, y = Math.floor(index / 10);
    return 0.025 + centers.reduce((sum, center) => sum + center.weight * Math.exp(-((x - center.x) ** 2 + (y - center.y) ** 2) / 2.42), 0);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(weight => weight / sum);
}

export function createFoodStream(seed: number, distribution: Distribution, duration = DURATION_TICKS): Food[] {
  let state = seed >>> 0;
  const random = () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const prior = createPrior(distribution);
  const events: Food[] = [];
  for (let born = 0; born < duration; born += 10) {
    // Four initial observations make the starting decision readable before playback.
    for (let copy = 0; copy < (born === 0 ? 4 : 1); copy++) {
      let draw = random(), cell = prior.length - 1;
      for (let index = 0; index < prior.length; index++) {
        draw -= prior[index];
        if (draw <= 0) { cell = index; break; }
      }
      events.push({ id: events.length, x: cell % 10, y: Math.floor(cell / 10), born, expires: born + LIFETIME_TICKS, value: 1 + Math.floor(random() * 9) });
    }
  }
  return events;
}

/** Expected spawn mass within three walking steps, supplied as a public distribution prior. */
export function nearbyMass(point: Point, prior: readonly number[]): number {
  return prior.reduce((sum, chance, index) => sum + (manhattan(point, { x: index % 10, y: Math.floor(index / 10) }) <= 3 ? chance : 0), 0);
}

export function chooseTarget(position: Point, visible: readonly Food[], tick: number, policy: Policy, prior: readonly number[]): Decision {
  const reachable = visible.filter(food => manhattan(position, food) * 20 <= food.expires - tick + EPSILON);
  if (reachable.length) {
    if (policy === 'nearest') {
      const target = [...reachable].sort((a, b) => manhattan(position, a) - manhattan(position, b) || a.id - b.id)[0];
      return { target: { x: target.x, y: target.y }, foodId: target.id, reason: `最近可达：走 ${manhattan(position, target)} 米，取 ${target.value} 分。` };
    }
    const ranked = reachable.map(food => {
      const distance = manhattan(position, food);
      const arrival = tick + distance * 20;
      const nextValue = visible.reduce((best, next) => {
        if (next.id === food.id || arrival + manhattan(food, next) * 20 > next.expires + EPSILON) return best;
        return Math.max(best, next.value);
      }, 0);
      const utility = food.value + 0.65 * nextValue - 1.4 * distance + 2 * nearbyMass(food, prior);
      return { food, utility, nextValue, distance };
    }).sort((a, b) => b.utility - a.utility || a.food.id - b.food.id);
    const best = ranked[0];
    return {
      target: { x: best.food.x, y: best.food.y }, foodId: best.food.id,
      reason: best.nextValue ? `取 ${best.food.value} 分后，还可衔接眼前的 ${best.nextValue} 分目标。` : `权衡 ${best.food.value} 分、${best.distance} 米路程与下一步覆盖范围。`,
    };
  }
  if (policy === 'nearest') return { target: null, foodId: null, reason: '没有能及时赶到的食饵，留在原地观察。' };
  const currentMass = nearbyMass(position, prior);
  const cells = Array.from({ length: 100 }, (_, index) => ({ x: index % 10, y: Math.floor(index / 10) }));
  const best = cells.map(point => ({ point, utility: nearbyMass(point, prior) - 0.025 * manhattan(position, point) }))
    .sort((a, b) => b.utility - a.utility)[0];
  if (best.utility <= currentMass + EPSILON) return { target: null, foodId: null, reason: '暂时没有可达食饵，在覆盖范围较好的位置等待。' };
  return { target: best.point, foodId: null, reason: '暂时没有可达食饵，向公开分布中更便于接应的位置移动。' };
}

export function visibleFood(run: Run): Food[] {
  return run.stream.filter(food => food.born <= run.tick && food.expires >= run.tick && !run.robot.consumed.has(food.id) && !run.robot.expired.has(food.id));
}

function collectAndExpire(run: Run) {
  for (const food of visibleFood(run)) {
    if (manhattan(food, run.robot) <= EPSILON) {
      run.robot.consumed.add(food.id);
      run.robot.score += food.value;
      run.robot.captured++;
      run.robot.lastCapture = { tick: run.tick, x: food.x, y: food.y, value: food.value };
    }
  }
  for (const food of run.stream) {
    if (food.expires <= run.tick && !run.robot.consumed.has(food.id)) run.robot.expired.add(food.id);
  }
}

function plan(run: Run) {
  const decision = chooseTarget(run.robot, visibleFood(run), run.tick, run.policy, run.prior);
  Object.assign(run.robot, decision);
}

export function createRun(stream: readonly Food[], prior: readonly number[], policy: Policy, start: Point = { x: 4, y: 4 }): Run {
  const run: Run = {
    tick: 0, stream, prior, policy,
    robot: { ...start, edge: null, target: null, foodId: null, score: 0, captured: 0, distance: 0, reason: '', consumed: new Set(), expired: new Set(), trail: [{ ...start }], lastCapture: null },
  };
  collectAndExpire(run);
  plan(run);
  return run;
}

export function advanceRun(run: Run, steps = 1): void {
  for (let count = 0; count < steps && run.tick < DURATION_TICKS; count++) {
    const robot = run.robot;
    if (!robot.edge) {
      plan(run);
      if (robot.target && manhattan(robot, robot.target) > EPSILON) {
        // Fixed x-then-y shortest path for both policies; turns occur only at intersections.
        robot.edge = Math.abs(robot.x - robot.target.x) > EPSILON
          ? { x: robot.x + Math.sign(robot.target.x - robot.x), y: robot.y }
          : { x: robot.x, y: robot.y + Math.sign(robot.target.y - robot.y) };
      }
    }
    if (robot.edge) {
      const remaining = manhattan(robot, robot.edge);
      const amount = Math.min(STEP, remaining);
      if (Math.abs(robot.x - robot.edge.x) > EPSILON) robot.x += Math.sign(robot.edge.x - robot.x) * amount;
      else robot.y += Math.sign(robot.edge.y - robot.y) * amount;
      robot.distance += amount;
      if (remaining <= STEP + EPSILON) {
        robot.x = robot.edge.x; robot.y = robot.edge.y; robot.edge = null;
        robot.trail.push({ x: robot.x, y: robot.y });
        if (robot.trail.length > 22) robot.trail.shift();
      }
    }
    run.tick++;
    collectAndExpire(run);
    if (!robot.edge) plan(run);
  }
}
