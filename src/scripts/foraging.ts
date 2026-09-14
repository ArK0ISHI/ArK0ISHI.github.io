import { advanceRun, createFoodStream, createPrior, createRun, DURATION_TICKS, LIFETIME_TICKS, STEP, visibleFood, type Distribution, type Policy, type Run } from '../lib/experiments/foraging';

let activeRoot: HTMLElement | null = null;
let activeController: AbortController | null = null;
let cleanup: (() => void) | null = null;

function setupForaging() {
  const root = document.querySelector<HTMLElement>('[data-foraging]');
  if (root === activeRoot && activeController && !activeController.signal.aborted) return;
  cleanup?.();
  if (!root) return;
  activeRoot = root;
  const controller = new AbortController();
  activeController = controller;
  const { signal } = controller;
  const find = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const play = find<HTMLButtonElement>('[data-foraging-play]');
  const boardToggles = root.querySelectorAll<HTMLButtonElement>('[data-foraging-toggle]');
  const reset = find<HTMLButtonElement>('[data-foraging-reset]');
  const newSeed = find<HTMLButtonElement>('[data-foraging-seed]');
  const distributionInput = find<HTMLSelectElement>('[data-foraging-distribution]');
  const speedInput = find<HTMLSelectElement>('[data-foraging-speed]');
  const clock = find<HTMLOutputElement>('[data-foraging-time]');
  const phase = find('[data-foraging-phase]');
  const progress = find<HTMLProgressElement>('[data-foraging-progress]');
  const comparison = find('[data-foraging-comparison]');
  const announcement = find('[data-foraging-announcement]');
  const policies: Policy[] = ['nearest', 'rolling'];
  const canvases = policies.map(policy => find<HTMLCanvasElement>(`[data-foraging-canvas="${policy}"]`));
  const contexts = canvases.map(canvas => canvas.getContext('2d'));
  if (contexts.some(context => !context)) {
    phase.textContent = '当前浏览器无法显示画布。下方可以阅读模型说明。';
    play.disabled = true;
    return;
  }
  const readouts = policies.map(policy => ({
    score: find(`[data-foraging-score="${policy}"]`), captured: find(`[data-foraging-captured="${policy}"]`),
    distance: find(`[data-foraging-distance="${policy}"]`), expired: find(`[data-foraging-expired="${policy}"]`), reason: find(`[data-foraging-reason="${policy}"]`),
  }));
  const parameters = new URLSearchParams(location.search);
  const requestedSeed = parameters.get('seed') ?? '';
  let seed = /^\d{1,10}$/.test(requestedSeed) && Number(requestedSeed) <= 4294967295 ? Number(requestedSeed) : 23917;
  let distribution: Distribution = parameters.get('distribution') === 'uniform' ? 'uniform' : 'hotspots';
  distributionInput.value = distribution;
  speedInput.value = '1';
  let runs: Run[];
  let playing = false;
  let frame = 0;
  let previousTime = 0;
  let accumulator = 0;
  let lastReadout = 0;
  let speed = 1;
  const initialComparison = '两台机器人从 (4, 4) 出发，各自在同一组食饵的副本中运行，互不争抢。换分布会重置本轮。';
  const colors = ['#9ed9c5', '#f3c196'];
  const coordinate = (value: number) => 31 + value * (418 / 9);

  function draw(index: number) {
    const canvas = canvases[index];
    const ctx = contexts[index]!;
    const run = runs[index];
    const robot = run.robot;
    ctx.setTransform(canvas.width / 480, 0, 0, canvas.height / 480, 0, 0);
    ctx.clearRect(0, 0, 480, 480);
    const maximum = Math.max(...run.prior);
    if (distribution === 'hotspots') {
      run.prior.forEach((chance, cell) => {
        const x = coordinate(cell % 10), y = coordinate(Math.floor(cell / 10));
        const intensity = chance / maximum;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 34);
        gradient.addColorStop(0, `rgba(76, 146, 152, ${intensity * 0.24})`);
        gradient.addColorStop(1, 'rgba(76,146,152,0)');
        ctx.fillStyle = gradient; ctx.fillRect(x - 34, y - 34, 68, 68);
      });
    }
    ctx.lineWidth = 0.8; ctx.strokeStyle = '#a9c2d02c';
    for (let line = 0; line < 10; line++) {
      ctx.beginPath(); ctx.moveTo(coordinate(line), 31); ctx.lineTo(coordinate(line), 449); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(31, coordinate(line)); ctx.lineTo(449, coordinate(line)); ctx.stroke();
    }
    ctx.fillStyle = '#bdd0dc69';
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) {
      ctx.beginPath(); ctx.arc(coordinate(x), coordinate(y), 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = '10px Consolas, monospace'; ctx.fillStyle = '#a2b3bf'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let mark = 0; mark < 10; mark++) {
      ctx.fillText(String(mark), coordinate(mark), 466);
      ctx.fillText(String(mark), 12, coordinate(mark));
    }
    const trail = [...robot.trail, { x: robot.x, y: robot.y }];
    ctx.strokeStyle = colors[index]; ctx.globalAlpha = 0.28; ctx.lineWidth = 2;
    ctx.beginPath(); trail.forEach((point, item) => item ? ctx.lineTo(coordinate(point.x), coordinate(point.y)) : ctx.moveTo(coordinate(point.x), coordinate(point.y))); ctx.stroke(); ctx.globalAlpha = 1;
    if (robot.target) {
      ctx.strokeStyle = colors[index]; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(coordinate(robot.x), coordinate(robot.y));
      // Finish the current edge before showing the x-then-y intention from its endpoint.
      const origin = robot.edge ?? robot;
      if (robot.edge) ctx.lineTo(coordinate(origin.x), coordinate(origin.y));
      ctx.lineTo(coordinate(robot.target.x), coordinate(origin.y)); ctx.lineTo(coordinate(robot.target.x), coordinate(robot.target.y)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    const foods = visibleFood(run);
    const stacks = new Map<string, number>();
    for (const food of foods) {
      const key = `${food.x},${food.y}`;
      const stack = stacks.get(key) ?? 0; stacks.set(key, stack + 1);
      const x = coordinate(food.x) + (stack % 2) * 11, y = coordinate(food.y) - Math.floor((stack + 1) / 2) * 9;
      const remaining = (food.expires - run.tick) / LIFETIME_TICKS;
      const selected = food.id === robot.foodId;
      ctx.fillStyle = '#172a36'; ctx.strokeStyle = '#82939f'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = remaining <= 1 / 3 ? '#ec9d89' : selected ? colors[index] : '#b8cbd5'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining); ctx.stroke();
      ctx.fillStyle = '#f4f1e8'; ctx.font = '12px Consolas, monospace'; ctx.fillText(String(food.value), x, y + .5);
    }
    const capture = robot.lastCapture;
    if (capture && run.tick - capture.tick < 12) {
      ctx.strokeStyle = colors[index]; ctx.lineWidth = 1.2; ctx.globalAlpha = (12 - run.tick + capture.tick) / 12;
      ctx.beginPath(); ctx.arc(coordinate(capture.x), coordinate(capture.y), 18 + (run.tick - capture.tick) * 1.6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    const x = coordinate(robot.x), y = coordinate(robot.y);
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = colors[index]; ctx.strokeStyle = '#101c25'; ctx.lineWidth = 2.5;
    ctx.fillRect(-7, -7, 14, 14); ctx.strokeRect(-7, -7, 14, 14); ctx.restore();
    ctx.fillStyle = '#10222b'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
  }

  function updateReadouts() {
    runs.forEach((run, index) => {
      const output = readouts[index];
      output.score.textContent = String(run.robot.score);
      output.captured.textContent = String(run.robot.captured);
      output.distance.textContent = run.robot.distance.toFixed(1);
      output.expired.textContent = String(run.robot.expired.size);
      output.reason.textContent = run.robot.reason;
    });
    clock.textContent = (runs[0].tick * STEP).toFixed(1).padStart(4, '0');
    progress.value = runs[0].tick * STEP;
    root!.dataset.foragingTick = String(runs[0].tick);
    root!.dataset.foragingPlaying = String(playing);
  }

  function stop(message: string, speak = true) {
    playing = false; cancelAnimationFrame(frame); previousTime = 0; accumulator = 0;
    play.innerHTML = runs[0].tick >= DURATION_TICKS ? '再看一遍 <span aria-hidden="true">↻</span>' : `${runs[0].tick ? '继续观察' : '开始观察'} <span aria-hidden="true">▶</span>`;
    play.setAttribute('aria-pressed', 'false'); phase.textContent = message;
    boardToggles.forEach(button => {
      button.textContent = runs[0].tick >= DURATION_TICKS ? '再看' : runs[0].tick ? '继续' : '开始';
      button.setAttribute('aria-label', runs[0].tick >= DURATION_TICKS ? '重新观察两台机器人' : '开始观察两台机器人');
      button.setAttribute('aria-pressed', 'false');
    });
    updateReadouts();
    if (speak) announcement.textContent = message;
  }

  function complete() {
    stop('本轮结束');
    const a = runs[0].robot, b = runs[1].robot;
    const difference = b.score - a.score;
    comparison.textContent = `本轮最近可达策略 ${a.score} 分，滚动启发式 ${b.score} 分，${difference === 0 ? '两者得分相同' : `${difference > 0 ? '滚动启发式' : '最近可达策略'}多 ${Math.abs(difference)} 分`}。这是场景 ${seed} 的一次观察；换一场相遇，比较结果是否仍然相同。`;
    announcement.textContent = comparison.textContent;
  }

  function animate(timestamp: number) {
    if (!playing || signal.aborted) return;
    if (previousTime) accumulator += Math.min((timestamp - previousTime) / 1000, 0.25) * speed;
    previousTime = timestamp;
    while (accumulator + 1e-9 >= STEP && runs[0].tick < DURATION_TICKS) {
      runs.forEach(run => advanceRun(run)); accumulator -= STEP;
    }
    canvases.forEach((_, index) => draw(index));
    if (timestamp - lastReadout > 100) { updateReadouts(); lastReadout = timestamp; }
    if (runs[0].tick >= DURATION_TICKS) { complete(); return; }
    frame = requestAnimationFrame(animate);
  }

  function restart() {
    playing = false; cancelAnimationFrame(frame); previousTime = 0; accumulator = 0;
    const stream = createFoodStream(seed, distribution);
    const prior = createPrior(distribution);
    runs = policies.map(policy => createRun(stream, prior, policy));
    find('[data-foraging-seed-value]').textContent = String(seed);
    comparison.textContent = initialComparison;
    stop('准备就绪', false);
    canvases.forEach((_, index) => draw(index));
  }

  function rememberScene() {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('distribution', distribution);
    history.replaceState(history.state, '', url);
  }

  function resize() {
    canvases.forEach((canvas, index) => {
      const size = Math.round(Math.max(1, canvas.getBoundingClientRect().width) * Math.min(window.devicePixelRatio || 1, 2));
      if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
      draw(index);
    });
  }

  play.addEventListener('click', () => {
    if (playing) { stop('已暂停'); return; }
    if (runs[0].tick >= DURATION_TICKS) restart();
    playing = true; previousTime = 0;
    play.innerHTML = '暂停观察 <span aria-hidden="true">Ⅱ</span>'; play.setAttribute('aria-pressed', 'true');
    boardToggles.forEach(button => { button.textContent = '暂停'; button.setAttribute('aria-label', '暂停观察两台机器人'); button.setAttribute('aria-pressed', 'true'); });
    phase.textContent = '观察中'; announcement.textContent = '开始观察，两台机器人在同一场景中独立行动。';
    updateReadouts(); frame = requestAnimationFrame(animate);
  }, { signal });
  boardToggles.forEach(button => button.addEventListener('click', () => play.click(), { signal }));
  reset.addEventListener('click', () => { restart(); announcement.textContent = '已重置，保留本轮场景与分布。'; }, { signal });
  newSeed.addEventListener('click', () => {
    const number = new Uint32Array(1); crypto.getRandomValues(number); seed = 10000 + number[0] % 90000;
    rememberScene(); restart(); announcement.textContent = `已切换到场景 ${seed}。按开始观察播放。`;
  }, { signal });
  distributionInput.addEventListener('change', () => {
    distribution = distributionInput.value === 'uniform' ? 'uniform' : 'hotspots';
    rememberScene(); restart(); announcement.textContent = '已更换出现分布，并重置本轮。';
  }, { signal });
  speedInput.addEventListener('change', () => { speed = Number(speedInput.value); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stop('已暂停 · 页面暂不可见', false); }, { signal });
  const intersection = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting && playing) stop('已暂停 · 画面已离开视野', false);
  }, { threshold: 0 });
  const resizeObserver = new ResizeObserver(resize);
  restart(); resize();
  intersection.observe(find('.foraging-experiment'));
  canvases.forEach(canvas => resizeObserver.observe(canvas));
  cleanup = () => {
    controller.abort(); playing = false; cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect();
    activeRoot = null; activeController = null;
  };
}

setupForaging();
document.addEventListener('astro:page-load', setupForaging);
document.addEventListener('astro:before-swap', () => { cleanup?.(); cleanup = null; });
