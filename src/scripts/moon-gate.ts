import { advanceMoonAccess, MoonAccessError } from '../lib/moon-access';
import { navigate } from 'astro:transitions/client';
import { activateMoonGate, completeMoonUnlock, MOON_UNLOCKED_KEY, readMoonState, resetMoonState, type MoonState } from '../lib/moon-gate';

type GateWindow = Window & { __arMoonController?: AbortController; __arMoonElement?: HTMLElement };
const host = window as GateWindow;

function setupMoonGate() {
  const gate = document.querySelector<HTMLElement>('[data-moon-gate]');
  if (!gate) return;
  if (host.__arMoonElement === gate && host.__arMoonController && !host.__arMoonController.signal.aborted) return;
  host.__arMoonController?.abort();
  const controller = new AbortController();
  host.__arMoonController = controller;
  host.__arMoonElement = gate;
  const { signal } = controller;
  const trigger = gate.querySelector<HTMLButtonElement>('[data-moon-trigger]');
  const status = gate.querySelector<HTMLElement>('[data-moon-status]');
  const hint = gate.querySelector<HTMLElement>('.moon-gate-hint');
  const dialog = document.querySelector<HTMLDialogElement>('[data-moon-dialog]');
  let pendingUnlock = false;
  let previousFocus: HTMLElement | null = null;
  let restoreFocus = true;
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;
  let unlockPointer: { x: number; y: number; at: number } | null = null;

  function paint(state: MoonState) {
    if (!gate) return;
    const phase = state.unlocked ? 3 : state.count >= 26 ? 2 : state.count >= 14 ? 1 : 0;
    gate.dataset.phase = String(phase);
    gate.dataset.unlocked = String(state.unlocked);
    document.documentElement.dataset.moonUnlocked = String(state.unlocked);
    document.querySelector<HTMLElement>('[data-header]')?.setAttribute('data-moon-unlocked', String(state.unlocked));
    document.querySelectorAll<HTMLElement>('[data-moon-nav]').forEach(link => { link.hidden = !state.unlocked; });
    trigger?.setAttribute('aria-label', state.unlocked ? '进入月之暗面' : phase > 0 ? '月亮，还有另一面' : '月面');
    if (hint) hint.textContent = state.unlocked ? '月之暗面，已为你留灯。' : phase > 0 ? '月亮，还有另一面。' : '';
    if (phase === 0) {
      clearTimeout(pulseTimer);
      gate.classList.remove('is-touched');
      if (status) status.textContent = '';
    }
    if (!state.unlocked && dialog?.open) dialog.close();
  }

  function openWelcome(event: MouseEvent) {
    if (!dialog || dialog.open) return;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
    restoreFocus = true;
    unlockPointer = event.detail > 0 ? { x: event.clientX, y: event.clientY, at: performance.now() } : null;
    dialog.showModal();
    document.body.classList.add('moon-dialog-open');
  }

  trigger?.addEventListener('keydown', event => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  }, { signal });

  trigger?.addEventListener('click', event => {
    if (dialog?.open || pendingUnlock) return;
    if (readMoonState().unlocked) {
      void navigate('/moon/workbench/');
      return;
    }
    const state = activateMoonGate();
    const progress = advanceMoonAccess(state.count);
    if (state.count < 39) void progress.catch(() => {});
    if (state.count <= 13) return;
    gate.classList.remove('is-touched');
    void gate.offsetWidth;
    gate.classList.add('is-touched');
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => gate.classList.remove('is-touched'), 700);
    if (status) {
      if (state.count === 14) status.textContent = '轨道浮现了。月亮似乎听见了你。';
      if (state.count === 26) status.textContent = '月缘亮起，另一面正慢慢显露。';
      if (state.count === 38) status.textContent = '再轻叩一下。';
      if (state.unlocked) status.textContent = '月之暗面已解锁，导航中已加入入口。';
    }
    if (state.count === 39) {
      pendingUnlock = true; trigger.setAttribute('aria-busy', 'true');
      if (hint) hint.textContent = '正在接通月面信号……';
      if (status) status.textContent = '正在接通月面信号，请稍候。';
      void progress.then(ready => {
        if (!ready) return;
        const unlocked = completeMoonUnlock();
        if (signal.aborted || !unlocked.unlocked) return;
        if (status) status.textContent = '月之暗面已解锁，导航中已加入入口。';
        openWelcome(event);
      }).catch(error => {
        if (signal.aborted || (error instanceof MoonAccessError && error.code === 'cancelled')) return;
        const message = error instanceof MoonAccessError && error.code === 'unavailable' ? '月面信号暂未接通，请稍后再来。' : '信号暂时中断，再轻叩一次重试。';
        if (hint) hint.textContent = message;
        if (status) status.textContent = message;
      }).finally(() => { pendingUnlock = false; trigger.removeAttribute('aria-busy'); });
    }
  }, { signal });

  // The next tap in a burst can land on a newly appeared dialog button.
  // Consume taps near the original point until the visitor pauses or aims elsewhere.
  dialog?.addEventListener('click', event => {
    if (!unlockPointer || event.detail === 0) return;
    const now = performance.now();
    const nearUnlock = Math.hypot(event.clientX - unlockPointer.x, event.clientY - unlockPointer.y) < 28;
    if (nearUnlock && now - unlockPointer.at < 600) {
      unlockPointer.at = now;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true, signal });
  dialog?.querySelectorAll<HTMLElement>('[data-moon-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close(), { signal });
  });
  dialog?.querySelector('[data-moon-enter]')?.addEventListener('click', () => {
    restoreFocus = false;
    dialog.close();
  }, { signal });
  dialog?.addEventListener('keydown', event => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab') return;
    const stops = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]')]
      .filter(element => element.getClientRects().length > 0);
    const first = stops[0];
    const last = stops.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }, { signal });
  // Keep backdrop taps inert: only an explicit action or Escape dismisses the welcome.
  dialog?.addEventListener('close', () => {
    document.body.classList.remove('moon-dialog-open');
    unlockPointer = null;
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }, { signal });

  document.addEventListener('ar:moon-state', event => {
    paint((event as CustomEvent<MoonState>).detail ?? readMoonState());
  }, { signal });
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const relock = event.target.closest<HTMLElement>('[data-moon-relock]');
    if (!relock) return;
    resetMoonState();
    if (document.activeElement === relock || !(document.activeElement instanceof HTMLElement) || !document.activeElement.getClientRects().length) trigger?.focus({ preventScroll: true });
  }, { signal });
  window.addEventListener('storage', event => {
    if (event.key !== MOON_UNLOCKED_KEY && event.key !== null) return;
    try { if (event.storageArea !== window.localStorage) return; } catch { return; }
    if (event.newValue === '1') {
      document.dispatchEvent(new CustomEvent<MoonState>('ar:moon-state', { detail: readMoonState() }));
    } else {
      resetMoonState();
    }
  }, { signal });
  document.addEventListener('astro:before-swap', () => controller.abort(), { once: true, signal });
  controller.signal.addEventListener('abort', () => {
    clearTimeout(pulseTimer);
    restoreFocus = false;
    if (dialog?.open) dialog.close();
    document.body.classList.remove('moon-dialog-open');
  }, { once: true });

  const initial = readMoonState();
  paint(initial);
  document.dispatchEvent(new CustomEvent<MoonState>('ar:moon-state', { detail: initial }));
}

document.addEventListener('astro:page-load', setupMoonGate);
setupMoonGate();
