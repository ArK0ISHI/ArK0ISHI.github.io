const SERVICE = 'ar-moon-data';
const AUDIENCE = 'ar-moon-data:v1';
const DATA_KEYS = new Map([
  ['/v1/data', 'workbench-v1'],
  ['/v1/overview', 'overview-v1'],
]);
const STEPS = 39;
const TOKEN_LIFETIMES = { progress: 30 * 60, access: 15 * 60, remember: 30 * 24 * 60 * 60 };
const MAX_TOKEN_LENGTH = 4096;
const MAX_BODY_BYTES = 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const METHODS = new Map([
  ['/health', 'GET'],
  ['/v1/start', 'POST'],
  ['/v1/step', 'POST'],
  ['/v1/renew', 'POST'],
  ['/v1/data', 'GET'],
  ['/v1/overview', 'GET'],
]);

class HttpError extends Error {
  constructor(status) {
    super('Request failed');
    this.status = status;
  }
}

function responseHeaders(origin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    Pragma: 'no-cache',
    Expires: '0',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function json(value, headers, status = 200) {
  return new Response(JSON.stringify(value), { status, headers });
}

function validOrigin(value, allowLocal = false) {
  if (typeof value !== 'string' || !value || value.length > 512) throw new HttpError(503);
  let url;
  try { url = new URL(value); } catch { throw new HttpError(503); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== value || url.username || url.password ||
      (url.protocol !== 'https:' && !(allowLocal && local && url.protocol === 'http:')) ||
      (local && !allowLocal)) throw new HttpError(503);
  return value;
}

function allowedOrigins(env) {
  const origins = new Set([validOrigin(env.PUBLIC_ORIGIN)]);
  if (env.ALLOWED_ORIGINS !== undefined && env.ALLOWED_ORIGINS !== '') {
    if (typeof env.ALLOWED_ORIGINS !== 'string' || env.ALLOWED_ORIGINS.length > 4096) {
      throw new HttpError(503);
    }
    for (const origin of env.ALLOWED_ORIGINS.split(',')) {
      origins.add(validOrigin(origin.trim(), true));
    }
  }
  return origins;
}

function encodeBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new HttpError(401);
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4));
  const result = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  // Reject alternative encodings with non-zero unused bits.
  if (encodeBase64Url(result) !== value) throw new HttpError(401);
  return result;
}

async function signingKey(env) {
  if (typeof env.TOKEN_SECRET !== 'string' || env.TOKEN_SECRET.length > 4096 ||
      encoder.encode(env.TOKEN_SECRET).byteLength < 32 ||
      !env.MOON_DATA || typeof env.MOON_DATA.get !== 'function') throw new HttpError(503);
  return crypto.subtle.importKey('raw', encoder.encode(env.TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(payload, key) {
  const encoded = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encoded));
  return `${encoded}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function tokenPayload(purpose, origin, flow, count, now) {
  return { v: 1, purpose, aud: AUDIENCE, origin, iat: now, exp: now + TOKEN_LIFETIMES[purpose], flow, count };
}

async function verify(request, purpose, origin, key, now) {
  try {
    const authorization = request.headers.get('Authorization') || '';
    if (authorization.length > MAX_TOKEN_LENGTH + 7 || !authorization.startsWith('Bearer ')) {
      throw new HttpError(401);
    }
    const token = authorization.slice(7);
    if (!token || token.length > MAX_TOKEN_LENGTH) throw new HttpError(401);
    const parts = token.split('.');
    if (parts.length !== 2) throw new HttpError(401);
    const signature = decodeBase64Url(parts[1]);
    if (signature.byteLength !== 32 || !await crypto.subtle.verify('HMAC', key, signature, encoder.encode(parts[0]))) {
      throw new HttpError(401);
    }
    const payload = JSON.parse(decoder.decode(decodeBase64Url(parts[0])));
    if (!payload || Array.isArray(payload) || payload.v !== 1 || payload.purpose !== purpose ||
        payload.aud !== AUDIENCE || payload.origin !== origin ||
        !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
        payload.iat < 0 || payload.iat > now || payload.exp <= now ||
        payload.exp <= payload.iat || payload.exp - payload.iat > TOKEN_LIFETIMES[purpose] ||
        typeof payload.flow !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(payload.flow) ||
        !Number.isSafeInteger(payload.count) ||
        (purpose === 'progress' ? payload.count < 0 || payload.count >= STEPS : payload.count !== STEPS)) {
      throw new HttpError(401);
    }
    return payload;
  } catch {
    throw new HttpError(401);
  }
}

async function validateBody(request) {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new HttpError(400);
    if (Number(contentLength) > MAX_BODY_BYTES) throw new HttpError(413);
  }
  if (!request.body) return;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new HttpError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) return;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = decoder.decode(bytes).trim();
    if (!body) return;
    const parsed = JSON.parse(body);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.keys(parsed).length) {
      throw new Error('Non-empty body');
    }
  } catch {
    throw new HttpError(400);
  }
}

async function enforceRateLimit(request, env) {
  if (env.RATE_LIMITER === undefined) return;
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 64 || typeof env.RATE_LIMITER?.limit !== 'function') throw new HttpError(503);
  const result = await env.RATE_LIMITER.limit({ key: `moon-unlock:${ip}` });
  if (!result || typeof result.success !== 'boolean') throw new HttpError(503);
  if (!result.success) throw new HttpError(429);
}

function preflight(request, method, headers) {
  if (request.headers.get('Access-Control-Request-Method') !== method) throw new HttpError(405);
  const requestedHeaders = request.headers.get('Access-Control-Request-Headers');
  if (requestedHeaders && requestedHeaders.split(',').some((header) =>
    !['authorization', 'content-type'].includes(header.trim().toLowerCase()))) throw new HttpError(403);
  headers.set('Access-Control-Allow-Methods', method);
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '0');
  headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  return new Response(null, { status: 204, headers });
}

/** `now` returns Unix seconds; dependency injection is only for deterministic tests. */
export function createWorker({ now = () => Math.floor(Date.now() / 1000) } = {}) {
  return {
    async fetch(request, env) {
      let headers = responseHeaders();
      try {
        const url = new URL(request.url);
        const method = METHODS.get(url.pathname);
        if (!method) throw new HttpError(404);
        // Tokens belong in Authorization, never URLs that can appear in access logs.
        if (url.search) throw new HttpError(400);
        if (url.pathname === '/health' && request.method === 'GET') {
          return json({ service: SERVICE, version: 1, status: 'ok' }, headers);
        }
        const origin = request.headers.get('Origin');
        if (!origin || !allowedOrigins(env).has(origin)) throw new HttpError(403);
        headers = responseHeaders(origin);
        if (request.method === 'OPTIONS') return preflight(request, method, headers);
        if (request.method !== method) throw new HttpError(405);
        const key = await signingKey(env);
        if (method === 'POST') {
          await enforceRateLimit(request, env);
          await validateBody(request);
        }
        // A slow body or limiter must not preserve a token past its deadline.
        const timestamp = now();
        if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new HttpError(503);
        if (url.pathname === '/v1/start') {
          const progress = tokenPayload('progress', origin, crypto.randomUUID(), 0, timestamp);
          return json({ progressToken: await sign(progress, key), count: 0, expiresAt: progress.exp }, headers);
        }
        if (url.pathname === '/v1/step') {
          const progress = await verify(request, 'progress', origin, key, timestamp);
          const count = progress.count + 1;
          if (count < STEPS) {
            return json({ progressToken: await sign({ ...progress, count }, key), count, expiresAt: progress.exp }, headers);
          }
          const access = tokenPayload('access', origin, progress.flow, count, timestamp);
          const remember = tokenPayload('remember', origin, progress.flow, count, timestamp);
          return json({ count, accessToken: await sign(access, key), expiresAt: access.exp,
            rememberToken: await sign(remember, key), rememberExpiresAt: remember.exp }, headers);
        }
        if (url.pathname === '/v1/renew') {
          const remember = await verify(request, 'remember', origin, key, timestamp);
          const access = tokenPayload('access', origin, remember.flow, STEPS, timestamp);
          // Renewal near day 30 must not extend access beyond the remember grant.
          access.exp = Math.min(access.exp, remember.exp);
          return json({ accessToken: await sign(access, key), expiresAt: access.exp }, headers);
        }
        await verify(request, 'access', origin, key, timestamp);
        const dataKey = DATA_KEYS.get(url.pathname);
        if (!dataKey) throw new HttpError(404);
        const data = await env.MOON_DATA.get(dataKey, { type: 'stream' });
        if (data === null || data === undefined) throw new HttpError(503);
        return new Response(data, { status: 200, headers });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 503;
        const errorCode = { 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden',
          404: 'not_found', 405: 'method_not_allowed', 413: 'request_too_large',
          429: 'too_many_requests', 503: 'unavailable' }[status] || 'unavailable';
        if (status === 429) headers.set('Retry-After', '60');
        return json({ error: errorCode }, headers, status);
      }
    },
  };
}

export default createWorker();
