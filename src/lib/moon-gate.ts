export interface MoonState {
  count: number;
  unlocked: boolean;
}

export const MOON_PROGRESS_KEY = 'ar-moon-progress-v1';
export const MOON_UNLOCKED_KEY = 'ar-moon-unlocked-v1';
export const MOON_THRESHOLD = 39;

type MoonMemory = MoonState & { localUsable: boolean; sessionUsable: boolean };
type MoonWindow = Window & { __arMoonMemory?: MoonMemory };

function memory(): MoonMemory {
  const host = window as MoonWindow;
  return host.__arMoonMemory ??= { count: 0, unlocked: false, localUsable: true, sessionUsable: true };
}

export function readMoonState(): MoonState {
  if (typeof window === 'undefined') return { count: 0, unlocked: false };
  const state = memory();
  try {
    if (state.localUsable) state.unlocked = window.localStorage.getItem(MOON_UNLOCKED_KEY) === '1';
  } catch { state.localUsable = false; }
  try {
    if (state.sessionUsable) {
      const stored = Number(window.sessionStorage.getItem(MOON_PROGRESS_KEY));
      state.count = Number.isInteger(stored) ? Math.min(MOON_THRESHOLD - 1, Math.max(0, stored)) : 0;
    }
  } catch { state.sessionUsable = false; }
  if (state.unlocked) state.count = MOON_THRESHOLD;
  return { count: state.count, unlocked: state.unlocked };
}

function saveMoonState(state: MoonState): MoonState {
  const fallback = memory();
  Object.assign(fallback, state);
  try {
    if (fallback.sessionUsable) window.sessionStorage.setItem(MOON_PROGRESS_KEY, String(state.count));
  } catch { fallback.sessionUsable = false; }
  try {
    if (fallback.localUsable) {
      if (state.unlocked) window.localStorage.setItem(MOON_UNLOCKED_KEY, '1');
      else window.localStorage.removeItem(MOON_UNLOCKED_KEY);
    }
  } catch { fallback.localUsable = false; }
  document.dispatchEvent(new CustomEvent<MoonState>('ar:moon-state', { detail: { ...state } }));
  return { ...state };
}

export function activateMoonGate(): MoonState {
  const state = readMoonState();
  if (state.unlocked) return state;
  const count = Math.min(MOON_THRESHOLD, state.count + 1);
  return saveMoonState({ count, unlocked: count === MOON_THRESHOLD });
}

export function resetMoonState(): MoonState {
  if (typeof window === 'undefined') return { count: 0, unlocked: false };
  return saveMoonState({ count: 0, unlocked: false });
}
