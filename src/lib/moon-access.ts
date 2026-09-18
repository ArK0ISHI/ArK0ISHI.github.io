/** Browser transport for server-issued moon progress and access proofs. */
export type MoonAccessErrorCode = 'unavailable' | 'expired' | 'network' | 'cancelled';

export class MoonAccessError extends Error {
  readonly code: MoonAccessErrorCode;
  readonly status?: number;

  constructor(code: MoonAccessErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'MoonAccessError';
    this.code = code;
    this.status = status;
  }
}

type Proof = { token: string; expiresAt: number };
type Progress = Proof & { count: number };
type Slot<T extends Proof> = {
  key: string;
  storage: 'localStorage' | 'sessionStorage';
  value: T | null;
  usable: boolean;
};
type Waiter = { target: number; resolve: (unlocked: boolean) => void; reject: (error: MoonAccessError) => void };
type ProgressJob = { generation: number; target: number; waiters: Waiter[] };

const THRESHOLD = 39;
const REQUEST_TIMEOUT = 20_000;
const progressSlot: Slot<Progress> = { key: 'ar-moon-progress-proof-v1', storage: 'sessionStorage', value: null, usable: true };
const accessSlot: Slot<Proof> = { key: 'ar-moon-access-proof-v1', storage: 'sessionStorage', value: null, usable: true };
const rememberSlot: Slot<Proof> = { key: 'ar-moon-remember-proof-v1', storage: 'localStorage', value: null, usable: true };
const controllers = new Set<AbortController>();
let generation = 0;
let progressJob: ProgressJob | null = null;
let renewal: { generation: number; promise: Promise<string> } | null = null;
let grantedUntil = 0;

const now = () => Math.floor(Date.now() / 1000);
const cancelled = () => new MoonAccessError('cancelled', 'Moon access was cancelled.');
const unavailable = () => new MoonAccessError('unavailable', 'Moon access is unavailable.');

function assertCurrent(expected: number, signal?: AbortSignal): void {
  if (expected !== generation || signal?.aborted) throw cancelled();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 16_384 && !/\s/.test(value);
}

function isDeadline(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > now();
}

function isProof(value: unknown): value is Proof {
  return isObject(value) && isToken(value.token) && isDeadline(value.expiresAt);
}

function isProgress(value: unknown): value is Progress {
  return isProof(value) && 'count' in value && typeof value.count === 'number'
    && Number.isInteger(value.count) && value.count >= 0 && value.count < THRESHOLD;
}

function save<T extends Proof>(slot: Slot<T>, value: T | null): void {
  slot.value = value;
  if (!slot.usable || typeof window === 'undefined') return;
  try {
    if (value) window[slot.storage].setItem(slot.key, JSON.stringify(value));
    else window[slot.storage].removeItem(slot.key);
  } catch {
    slot.usable = false;
  }
}

function read<T extends Proof>(slot: Slot<T>, validate: (value: unknown) => value is T): T | null {
  if (slot.usable && typeof window !== 'undefined') {
    let raw: string | null = null;
    try {
      raw = window[slot.storage].getItem(slot.key);
    } catch {
      slot.usable = false;
    }
    if (slot.usable) {
      let parsed: unknown = null;
      try { parsed = raw === null ? null : JSON.parse(raw); } catch { /* Discard malformed browser state. */ }
      slot.value = validate(parsed) ? parsed : null;
      if (raw !== null && slot.value === null) save(slot, null);
    }
  }
  if (slot.value !== null && !validate(slot.value)) save(slot, null);
  return slot.value;
}

function apiRoot(): string {
  const configured: unknown = import.meta.env.PUBLIC_MOON_API_URL;
  if (typeof configured !== 'string' || !configured.trim()) throw unavailable();
  try {
    const url = new URL(configured.trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
      || url.username || url.password || url.search || url.hash) throw unavailable();
    return url.href.replace(/\/+$/, '');
  } catch {
    throw unavailable();
  }
}

async function request(path: string, method: 'GET' | 'POST', expected: number, token?: string, signal?: AbortSignal): Promise<unknown> {
  assertCurrent(expected, signal);
  const url = `${apiRoot()}${path}`;
  const controller = new AbortController();
  controllers.add(controller);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch(url, {
      method,
      headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    assertCurrent(expected, signal);
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'expired' : 'unavailable';
      throw new MoonAccessError(code, code === 'expired' ? 'Moon access has expired.' : 'Moon access is unavailable.', response.status);
    }
    let body: unknown;
    try { body = await response.json(); } catch {
      assertCurrent(expected, signal);
      if (controller.signal.aborted) throw new MoonAccessError('network', 'The moon service did not respond in time.');
      throw unavailable();
    }
    assertCurrent(expected, signal);
    return body;
  } catch (error) {
    assertCurrent(expected, signal);
    if (error instanceof MoonAccessError) throw error;
    throw new MoonAccessError('network', 'The moon service could not be reached.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
    controllers.delete(controller);
  }
}

async function progressRequest(path: string, expected: number, token?: string): Promise<unknown> {
  try {
    return await request(path, 'POST', expected, token);
  } catch (error) {
    // Reuse the same signed proof: a retry must never count as an extra step.
    if (!(error instanceof MoonAccessError) || error.code !== 'network') throw error;
    assertCurrent(expected);
    return request(path, 'POST', expected, token);
  }
}

function parseProgress(body: unknown, count: number): Progress {
  if (!isObject(body) || body.count !== count || !isToken(body.progressToken) || !isDeadline(body.expiresAt)) throw unavailable();
  return { token: body.progressToken, count, expiresAt: body.expiresAt };
}

function settleProgress(job: ProgressJob, count: number): void {
  const ready = job.waiters.filter((waiter) => waiter.target <= count);
  job.waiters = job.waiters.filter((waiter) => waiter.target > count);
  for (const waiter of ready) waiter.resolve(waiter.target === THRESHOLD && count === THRESHOLD);
}

async function runProgress(job: ProgressJob): Promise<void> {
  try {
    assertCurrent(job.generation);
    if (grantedUntil > now()) {
      settleProgress(job, THRESHOLD);
      return;
    }
    let progress = read(progressSlot, isProgress);
    if (!progress) {
      const body = await progressRequest('/v1/start', job.generation);
      assertCurrent(job.generation);
      progress = parseProgress(body, 0);
      save(progressSlot, progress);
    }
    settleProgress(job, progress.count);
    while (progress.count < job.target) {
      const next = progress.count + 1;
      const body = await progressRequest('/v1/step', job.generation, progress.token);
      assertCurrent(job.generation);
      if (next === THRESHOLD) {
        if (!isObject(body) || body.count !== THRESHOLD || !isToken(body.accessToken)
          || !isDeadline(body.expiresAt) || !isToken(body.rememberToken) || !isDeadline(body.rememberExpiresAt)) throw unavailable();
        save(accessSlot, { token: body.accessToken, expiresAt: body.expiresAt });
        save(rememberSlot, { token: body.rememberToken, expiresAt: body.rememberExpiresAt });
        save(progressSlot, null);
        grantedUntil = body.rememberExpiresAt;
        settleProgress(job, THRESHOLD);
        return;
      }
      progress = parseProgress(body, next);
      save(progressSlot, progress);
      settleProgress(job, progress.count);
    }
  } catch (error) {
    const failure = error instanceof MoonAccessError ? error : unavailable();
    if (job.generation === generation && failure.code === 'expired') save(progressSlot, null);
    for (const waiter of job.waiters) waiter.reject(failure);
    job.waiters = [];
  } finally {
    if (progressJob === job) progressJob = null;
  }
}

/** A remembered proof is a hint for renewal; the server still verifies it. */
export function hasRememberedMoonAccess(): boolean {
  return read(rememberSlot, isProof) !== null;
}

/** Only explicit requested counts advance the server's signed progress chain. */
export function advanceMoonAccess(targetCount: number): Promise<boolean> {
  if (!Number.isInteger(targetCount) || targetCount < 0 || targetCount > THRESHOLD) return Promise.reject(unavailable());
  if (targetCount === 0) return Promise.resolve(false);
  return new Promise<boolean>((resolve, reject) => {
    if (progressJob) {
      progressJob.target = Math.max(progressJob.target, targetCount);
      progressJob.waiters.push({ target: targetCount, resolve, reject });
      return;
    }
    const job: ProgressJob = { generation, target: targetCount, waiters: [{ target: targetCount, resolve, reject }] };
    progressJob = job;
    // Coalesce rapid clicks before beginning the serial request chain.
    void Promise.resolve().then(() => runProgress(job));
  });
}

function renew(expected: number, force: boolean): Promise<string> {
  assertCurrent(expected);
  const cached = read(accessSlot, isProof);
  if (!force && cached && cached.expiresAt > now() + 5) return Promise.resolve(cached.token);
  if (renewal?.generation === expected) return renewal.promise;
  const remembered = read(rememberSlot, isProof);
  if (!remembered) return Promise.reject(new MoonAccessError('expired', 'Moon access has expired.'));
  const flight = {
    generation: expected,
    promise: Promise.resolve().then(async () => {
      try {
        const body = await request('/v1/renew', 'POST', expected, remembered.token);
        assertCurrent(expected);
        if (!isObject(body) || !isToken(body.accessToken) || !isDeadline(body.expiresAt)) throw unavailable();
        save(accessSlot, { token: body.accessToken, expiresAt: body.expiresAt });
        return body.accessToken;
      } catch (error) {
        if (expected === generation && error instanceof MoonAccessError && error.code === 'expired') {
          if (read(rememberSlot, isProof)?.token === remembered.token) save(rememberSlot, null);
          save(accessSlot, null);
          grantedUntil = 0;
        }
        throw error;
      } finally {
        if (renewal === flight) renewal = null;
      }
    }),
  };
  renewal = flight;
  return flight.promise;
}

export async function renewMoonAccess(): Promise<string> {
  return renew(generation, false);
}

/** Abort this caller's wait without cancelling a renewal shared by another view. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function fetchPrivateData(path: '/v1/data' | '/v1/overview', signal?: AbortSignal): Promise<unknown> {
  const expected = generation;
  assertCurrent(expected, signal);
  let token = await abortable(renew(expected, false), signal);
  assertCurrent(expected, signal);
  try {
    return await request(path, 'GET', expected, token, signal);
  } catch (error) {
    if (!(error instanceof MoonAccessError) || error.status !== 401) throw error;
    assertCurrent(expected, signal);
    if (read(accessSlot, isProof)?.token === token) save(accessSlot, null);
    token = await abortable(renew(expected, true), signal);
    assertCurrent(expected, signal);
    return request(path, 'GET', expected, token, signal);
  }
}

export function fetchMoonWorkbenchData(signal?: AbortSignal): Promise<unknown> {
  return fetchPrivateData('/v1/data', signal);
}

export function fetchMoonObservatoryData(signal?: AbortSignal): Promise<unknown> {
  return fetchPrivateData('/v1/overview', signal);
}

export function clearMoonAccess(): void {
  generation += 1;
  grantedUntil = 0;
  for (const controller of controllers) controller.abort();
  controllers.clear();
  if (progressJob) {
    for (const waiter of progressJob.waiters) waiter.reject(cancelled());
    progressJob.waiters = [];
    progressJob = null;
  }
  renewal = null;
  save(progressSlot, null);
  save(accessSlot, null);
  save(rememberSlot, null);
}
