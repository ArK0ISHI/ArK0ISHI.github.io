import { bobPositions, hamiltonian, initialState, pendulumStep, scaledEnergyError, type PendulumMethod, type PendulumState } from '../lib/experiments/pendulum';

type TrailPoint = { time: number; x: number; y: number };
type EnergyPoint = { time: number; rk4: number; midpoint: number };
let activeRoot: HTMLElement | null = null;
let activeController: AbortController | null = null;

function setupPendulum() {
  const root = document.querySelector<HTMLElement>('[data-pendulum]');
  if (root && root === activeRoot && activeController && !activeController.signal.aborted) return;
  activeController?.abort();
  activeRoot = root;
  if (!root) return;
  const controller = new AbortController();
  activeController = controller;
  const options = { signal: controller.signal };
  const get = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = get<HTMLCanvasElement>('[data-pendulum-canvas]');
  const energyCanvas = get<HTMLCanvasElement>('[data-pendulum-energy-canvas]');
  const context = canvas.getContext('2d');
  const energyContext = energyCanvas.getContext('2d');
  if (!context || !energyContext) return;
  const ctx = context;
  const ec = energyContext;
  const angle1 = get<HTMLInputElement>('#pendulum-angle1');
  const angle2 = get<HTMLInputElement>('#pendulum-angle2');
  const perturbation = get<HTMLInputElement>('#pendulum-perturbation');
  const methodSelect = get<HTMLSelectElement>('#pendulum-method');
  const stepSelect = get<HTMLSelectElement>('#pendulum-step');
  const playButton = get<HTMLButtonElement>('[data-pendulum-play]');
  const stagePlayButton = get<HTMLButtonElement>('[data-pendulum-stage-play]');
  const forwardButton = get<HTMLButtonElement>('[data-pendulum-forward]');
  const status = get<HTMLElement>('[data-pendulum-status]');
  const timeReadout = get<HTMLOutputElement>('[data-pendulum-time]');
  const distanceReadout = get<HTMLOutputElement>('[data-pendulum-distance]');
  const energyRK = get<HTMLOutputElement>('[data-pendulum-energy-rk4]');
  const energyMidpoint = get<HTMLOutputElement>('[data-pendulum-energy-midpoint]');
  const energyMax = get<HTMLElement>('[data-pendulum-energy-max]');
  let method: PendulumMethod = 'rk4';
  let h = 1 / 120;
  let rk4: PendulumState = initialState(120, -20);
  let midpoint: PendulumState = [...rk4];
  let nearby: PendulumState = initialState(120, -19.9);
  let startingEnergy = hamiltonian(rk4);
  let ticks = 0;
  let playing = false;
  let frame = 0;
  let lastFrame = 0;
  let accumulator = 0;
  let lastReadout = 0;
  let maxRK = 0;
  let maxMidpoint = 0;
  let fault = false;
  const trails: [TrailPoint[], TrailPoint[]] = [[], []];
  const energies: EnergyPoint[] = [];
  let stageSize = { width: 600, height: 480 };
  let chartSize = { width: 1000, height: 160 };
  const colors = ['#e5ba76', '#83c9de'];
  const time = () => ticks * h;
  const baseline = () => method === 'rk4' ? rk4 : midpoint;
  const percent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(5)}%`;

  function updateReadouts() {
    const a = bobPositions(baseline());
    const b = bobPositions(nearby);
    timeReadout.innerHTML = `${time().toFixed(2)} <small>s</small>`;
    distanceReadout.innerHTML = `${Math.hypot(a.x2 - b.x2, a.y2 - b.y2).toFixed(4)} <small>m</small>`;
    energyRK.textContent = percent(scaledEnergyError(rk4, startingEnergy) * 100);
    energyMidpoint.textContent = percent(scaledEnergyError(midpoint, startingEnergy) * 100);
    energyMax.textContent = `RK4 ${(maxRK * 100).toFixed(5)}% · 隐式中点 ${(maxMidpoint * 100).toFixed(5)}%`;
  }

  function drawStage() {
    const { width, height } = stageSize;
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min(width / 4.75, (height - 68) / 4.5);
    const cx = width / 2;
    const cy = height / 2 + 17;
    ctx.strokeStyle = '#809bb218';
    ctx.lineWidth = 1;
    for (const radius of [1, 2]) {
      ctx.beginPath(); ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([2, 7]);
    ctx.beginPath(); ctx.moveTo(cx, cy - 2.15 * scale); ctx.lineTo(cx, cy + 2.15 * scale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 2.15 * scale, cy); ctx.lineTo(cx + 2.15 * scale, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '9px monospace'; ctx.fillStyle = '#92a3b266';
    ctx.fillText('1 m', cx + scale + 6, cy - 6);
    for (let i = 0; i < trails.length; i++) {
      const trail = trails[i];
      if (trail.length < 2) continue;
      ctx.lineWidth = 1.45;
      ctx.strokeStyle = colors[i];
      ctx.setLineDash(i === 1 ? [4, 5] : []);
      // Age-banded paths keep the history readable without per-point strokes.
      for (let band = 0; band < 6; band++) {
        const from = Math.max(0, Math.floor(band * trail.length / 6) - 1);
        const to = Math.floor((band + 1) * trail.length / 6);
        ctx.globalAlpha = .1 + .1 * band;
        ctx.beginPath();
        for (let j = from; j < to; j++) {
          const point = trail[j];
          if (j === from) ctx.moveTo(cx + point.x * scale, cy + point.y * scale);
          else ctx.lineTo(cx + point.x * scale, cy + point.y * scale);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // Draw the nearby copy first, keeping an identical baseline visible.
    for (const i of [1, 0]) {
      const p = bobPositions(i === 0 ? baseline() : nearby);
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = i === 0 ? 2 : 1.5;
      ctx.setLineDash(i === 1 ? [5, 6] : []);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + p.x1 * scale, cy + p.y1 * scale); ctx.lineTo(cx + p.x2 * scale, cy + p.y2 * scale); ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y, radius] of [[p.x1, p.y1, 4], [p.x2, p.y2, 6]]) {
        ctx.beginPath(); ctx.arc(cx + x * scale, cy + y * scale, radius, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? colors[i] : '#172734'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    ctx.fillStyle = '#a5b2be'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  }

  function drawEnergy() {
    const { width, height } = chartSize;
    ec.clearRect(0, 0, width, height);
    const left = 74, right = width - 13, top = 19, bottom = height - 27;
    const mid = (top + bottom) / 2;
    const extent = Math.max(.001, maxRK * 115, maxMidpoint * 115);
    const duration = Math.max(10, time());
    const x = (t: number) => left + t / duration * (right - left);
    const y = (v: number) => mid - v * 100 / extent * (bottom - top) / 2;
    ec.font = '9px monospace'; ec.fillStyle = '#a1afbd';
    ec.textAlign = 'right';
    for (const [position, label] of [[top, `+${extent.toFixed(3)}%`], [mid, '0'], [bottom, `−${extent.toFixed(3)}%`]] as [number, string][]) {
      ec.fillText(label, left - 10, position + 3);
      ec.strokeStyle = position === mid ? '#71849b66' : '#71849b26';
      ec.beginPath(); ec.moveTo(left, position); ec.lineTo(right, position); ec.stroke();
    }
    ec.textAlign = 'left'; ec.fillText('0 s', left, height - 6);
    ec.textAlign = 'right'; ec.fillText(`${duration.toFixed(0)} s`, right, height - 6);
    for (const [index, key] of (['rk4', 'midpoint'] as const).entries()) {
      ec.strokeStyle = colors[index]; ec.lineWidth = 1.5;
      ec.setLineDash(index === 1 ? [4, 4] : []);
      ec.beginPath();
      energies.forEach((point, j) => {
        if (j === 0) ec.moveTo(x(point.time), y(point[key]));
        else ec.lineTo(x(point.time), y(point[key]));
      });
      ec.stroke();
    }
    ec.setLineDash([]);
  }

  function record() {
    const a = bobPositions(baseline());
    const b = bobPositions(nearby);
    trails[0].push({ time: time(), x: a.x2, y: a.y2 });
    trails[1].push({ time: time(), x: b.x2, y: b.y2 });
    for (const trail of trails) while (trail[0] && trail[0].time < time() - 8) trail.shift();
    const stride = Math.max(1, Math.round(.1 / h));
    if (ticks % stride === 0) energies.push({ time: time(), rk4: scaledEnergyError(rk4, startingEnergy), midpoint: scaledEnergyError(midpoint, startingEnergy) });
  }

  function syncButtons() {
    for (const button of [playButton, stagePlayButton]) {
      button.innerHTML = playing ? '暂停观察 <span aria-hidden="true">Ⅱ</span>' : time() >= 120 ? '重新观察 <span aria-hidden="true">↺</span>' : '开始观察 <span aria-hidden="true">▶</span>';
      button.setAttribute('aria-pressed', String(playing));
      button.disabled = fault;
    }
    forwardButton.disabled = fault || time() >= 120;
  }

  function pause(message?: string) {
    playing = false;
    cancelAnimationFrame(frame);
    frame = 0; lastFrame = 0; accumulator = 0;
    syncButtons();
    if (message) status.textContent = message;
    updateReadouts();
    drawEnergy();
  }

  function advance(count: number) {
    try {
      for (let i = 0; i < count && time() < 120 - h / 2; i++) {
        // Compute all three candidates before committing a step.
        const nextRK = pendulumStep(rk4, h, 'rk4');
        const nextMidpoint = pendulumStep(midpoint, h, 'midpoint');
        const nextNearby = pendulumStep(nearby, h, method);
        rk4 = nextRK; midpoint = nextMidpoint; nearby = nextNearby;
        ticks++;
        maxRK = Math.max(maxRK, Math.abs(scaledEnergyError(rk4, startingEnergy)));
        maxMidpoint = Math.max(maxMidpoint, Math.abs(scaledEnergyError(midpoint, startingEnergy)));
        record();
      }
      if (time() >= 120 - h / 2) pause('已完成 120 秒观察，可以重置或更换初值');
    } catch {
      fault = true;
      pause('数值求解未收敛，请减小步长或重置初值');
    }
  }

  function animate(timestamp: number) {
    if (!playing || controller.signal.aborted) return;
    if (lastFrame) accumulator += Math.min((timestamp - lastFrame) / 1000, .08);
    lastFrame = timestamp;
    const steps = Math.floor(accumulator / h);
    if (steps > 0) { accumulator -= steps * h; advance(steps); }
    drawStage();
    if (timestamp - lastReadout > 100) { updateReadouts(); drawEnergy(); lastReadout = timestamp; }
    if (playing) frame = requestAnimationFrame(animate);
  }

  function reset(message = '起点已就绪，点击开始观察') {
    pause();
    fault = false;
    method = methodSelect.value as PendulumMethod;
    h = 1 / Number(stepSelect.value);
    rk4 = initialState(Number(angle1.value), Number(angle2.value));
    midpoint = [...rk4];
    nearby = initialState(Number(angle1.value), Number(angle2.value) + Number(perturbation.value));
    startingEnergy = hamiltonian(rk4);
    ticks = 0; maxRK = 0; maxMidpoint = 0;
    trails[0].length = 0; trails[1].length = 0; energies.length = 0;
    get<HTMLOutputElement>('[data-pendulum-angle1-value]').textContent = `${angle1.value}°`;
    get<HTMLOutputElement>('[data-pendulum-angle2-value]').textContent = `${angle2.value}°`;
    get<HTMLOutputElement>('[data-pendulum-perturbation-value]').textContent = `${Number(perturbation.value)}°`;
    get<HTMLOutputElement>('[data-pendulum-method-label]').textContent = method === 'rk4' ? 'RK4' : '隐式中点';
    status.textContent = message;
    record(); syncButtons(); updateReadouts(); drawStage(); drawEnergy();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = (target: HTMLCanvasElement, drawingContext: CanvasRenderingContext2D) => {
      const rect = target.getBoundingClientRect();
      target.width = Math.max(1, Math.round(rect.width * dpr));
      target.height = Math.max(1, Math.round(rect.height * dpr));
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width: rect.width, height: rect.height };
    };
    stageSize = size(canvas, ctx); chartSize = size(energyCanvas, ec);
    drawStage(); drawEnergy();
  }

  function togglePlay() {
    if (playing) { pause('已暂停，保留当前轨迹'); return; }
    if (time() >= 120) reset();
    playing = true; lastFrame = 0; accumulator = 0;
    status.textContent = '观察中 · 相同方程，两个起点';
    syncButtons();
    frame = requestAnimationFrame(animate);
  }
  playButton.addEventListener('click', togglePlay, options);
  stagePlayButton.addEventListener('click', togglePlay, options);
  get<HTMLButtonElement>('[data-pendulum-reset]').addEventListener('click', () => reset(), options);
  get<HTMLButtonElement>('[data-pendulum-stage-reset]').addEventListener('click', () => reset(), options);
  forwardButton.addEventListener('click', () => {
    pause();
    advance(Math.round(10 / h));
    if (!fault && time() < 120) status.textContent = `已计算至 ${time().toFixed(0)} 秒，当前暂停`;
    syncButtons(); updateReadouts(); drawStage(); drawEnergy();
  }, options);
  for (const control of [angle1, angle2, perturbation, methodSelect, stepSelect]) {
    control.addEventListener('input', () => {
      root.querySelectorAll('[data-pendulum-preset]').forEach(button => button.setAttribute('aria-pressed', 'false'));
      reset('设置已更新，从新的起点开始');
    }, options);
  }
  root.querySelectorAll<HTMLButtonElement>('[data-pendulum-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const gentle = button.dataset.pendulumPreset === 'gentle';
      angle1.value = gentle ? '20' : '120';
      angle2.value = gentle ? '30' : '-20';
      perturbation.value = button.dataset.pendulumPreset === 'identical' ? '0' : '0.1';
      root.querySelectorAll('[data-pendulum-preset]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      reset('预设已载入，点击开始观察');
    }, options);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) pause('页面已离开，实验自动暂停'); }, options);
  const intersection = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting && playing) pause('观察台已离开视野，实验自动暂停');
  }, { threshold: 0 });
  intersection.observe(get<HTMLElement>('.pendulum-workbench'));
  const observer = new ResizeObserver(resize);
  observer.observe(canvas); observer.observe(energyCanvas);
  controller.signal.addEventListener('abort', () => {
    playing = false; cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
  }, { once: true });
  reset(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? '已按减少动态效果偏好暂停，点击即可观察' : '准备就绪，点击开始观察');
  resize();
}

setupPendulum();
document.addEventListener('astro:page-load', setupPendulum);
document.addEventListener('astro:before-swap', () => activeController?.abort());
