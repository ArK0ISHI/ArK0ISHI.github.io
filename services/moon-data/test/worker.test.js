import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import worker, { createWorker } from '../src/worker.js';

const ORIGIN = 'https://ark0ishi.github.io';
const LOCAL_ORIGIN = 'http://localhost:4321';
const SECRET = 'synthetic-test-only-key-never-for-deployment-123456';
const FIXTURE = JSON.stringify({ schemaVersion: 1, students: [{ id: 'SYNTHETIC-001', score: 73 }] });
const START = 1_800_000_000;

function setup(overrides = {}) {
  let timestamp = START;
  const reads = [];
  const service = createWorker({ now: () => timestamp });
  const env = {
    PUBLIC_ORIGIN: ORIGIN,
    TOKEN_SECRET: SECRET,
    MOON_DATA: {
      async get(key, options) {
        reads.push({ key, options });
        return new Response(FIXTURE).body;
      },
    },
    ...overrides,
  };
  return {
    env, reads,
    advance(seconds) { timestamp += seconds; },
    async request(path, { method = ['/v1/data', '/v1/overview', '/health'].includes(path) ? 'GET' : 'POST',
      token, origin = ORIGIN, headers = {}, body, ...options } = {}) {
      const requestHeaders = new Headers(headers);
      if (origin !== null) requestHeaders.set('Origin', origin);
      if (token !== undefined) requestHeaders.set('Authorization', `Bearer ${token}`);
      const request = new Request(`https://synthetic-worker.example${path}`, {
        method, headers: requestHeaders, body, ...options,
      });
      return service.fetch(request, env);
    },
  };
}

async function unwrap(response, status = 200) {
  assert.equal(response.status, status);
  return response.json();
}

async function unlock(fixture) {
  let result = await unwrap(await fixture.request('/v1/start'));
  for (let count = 1; count <= 39; count++) {
    result = await unwrap(await fixture.request('/v1/step', { token: result.progressToken }));
    assert.equal(result.count, count);
  }
  return result;
}

function payload(token) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
}

function signed(value, secret = SECRET) {
  const encoded = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
}

function assertNoStore(response) {
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Pragma'), 'no-cache');
  assert.equal(response.headers.get('Expires'), '0');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
}

test('full 39-step flow keeps data private until access, then streams and renews', async () => {
  const fixture = setup();
  let result = await unwrap(await fixture.request('/v1/start'));
  assert.deepEqual(Object.keys(result).sort(), ['count', 'expiresAt', 'progressToken']);
  assert.equal(result.count, 0);
  assert.equal(result.expiresAt, START + 1800);
  const flow = payload(result.progressToken).flow;
  for (let count = 1; count <= 39; count++) {
    assert.equal((await fixture.request('/v1/data', { token: result.progressToken })).status, 401);
    fixture.advance(1);
    result = await unwrap(await fixture.request('/v1/step', { token: result.progressToken }));
    assert.equal(result.count, count);
    assert.equal(fixture.reads.length, 0);
    if (count < 39) {
      assert.equal(result.expiresAt, START + 1800);
      assert.equal(payload(result.progressToken).flow, flow);
      assert.equal(result.accessToken, undefined);
      assert.equal(result.rememberToken, undefined);
    }
  }
  assert.equal(result.progressToken, undefined);
  assert.equal(result.expiresAt, START + 39 + 900);
  assert.equal(result.rememberExpiresAt, START + 39 + 2_592_000);
  assert.equal(payload(result.accessToken).count, 39);
  assert.equal(payload(result.rememberToken).flow, flow);
  const response = await fixture.request('/v1/data', { token: result.accessToken });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), FIXTURE);
  assert.deepEqual(fixture.reads, [{ key: 'workbench-v1', options: { type: 'stream' } }]);
  assertNoStore(response);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  fixture.advance(901);
  assert.equal((await fixture.request('/v1/data', { token: result.accessToken })).status, 401);
  const renewed = await unwrap(await fixture.request('/v1/renew', { token: result.rememberToken }));
  assert.deepEqual(Object.keys(renewed).sort(), ['accessToken', 'expiresAt']);
  assert.equal(renewed.expiresAt, START + 39 + 901 + 900);
  assert.equal((await fixture.request('/v1/data', { token: renewed.accessToken })).status, 200);
});

test('replaying a progress token is retry safe and never skips a step', async () => {
  const fixture = setup();
  const start = await unwrap(await fixture.request('/v1/start'));
  const first = await unwrap(await fixture.request('/v1/step', { token: start.progressToken }));
  fixture.advance(10);
  const replay = await unwrap(await fixture.request('/v1/step', { token: start.progressToken }));
  assert.deepEqual(replay, first);
  assert.equal(replay.count, 1);
  let next = replay;
  for (let count = 2; count <= 38; count++) {
    next = await unwrap(await fixture.request('/v1/step', { token: next.progressToken }));
  }
  const final = await unwrap(await fixture.request('/v1/step', { token: next.progressToken }));
  const finalReplay = await unwrap(await fixture.request('/v1/step', { token: next.progressToken }));
  assert.equal(finalReplay.count, 39);
  assert.equal((await fixture.request('/v1/data', { token: final.accessToken })).status, 200);
  assert.equal((await fixture.request('/v1/data', { token: finalReplay.accessToken })).status, 200);
  const anotherStart = await unwrap(await fixture.request('/v1/start'));
  assert.notEqual(payload(start.progressToken).flow, payload(anotherStart.progressToken).flow);
});

test('forged, tampered, malformed and overlong proofs cannot reach the data', async () => {
  const fixture = setup();
  const start = await unwrap(await fixture.request('/v1/start'));
  const original = payload(start.progressToken);
  const tampered = `${Buffer.from(JSON.stringify({ ...original, count: 38 })).toString('base64url')}.${start.progressToken.split('.')[1]}`;
  const proofs = [tampered, signed({ ...original, count: 38 }, 'attacker-key'), '', 'not-a-token',
    `${start.progressToken}.extra`, 'x'.repeat(4097), `${start.progressToken.split('.')[0]}.@@`,
    `${start.progressToken.split('.')[0]}.AA`];
  for (const token of proofs) {
    const response = await fixture.request('/v1/step', { token });
    assert.deepEqual(await unwrap(response, 401), { error: 'unauthorized' });
    assertNoStore(response);
  }
  assert.equal((await fixture.request('/v1/data')).status, 401);
  assert.equal(fixture.reads.length, 0);
});

test('valid signatures still require the exact audience, purpose, origin, dates and count', async () => {
  const fixture = setup();
  const start = await unwrap(await fixture.request('/v1/start'));
  const original = payload(start.progressToken);
  const changes = [
    { v: 2 }, { aud: 'other-service' }, { purpose: 'access' }, { origin: 'https://other.example' },
    { iat: START + 1 }, { iat: -1 }, { iat: '1800000000' }, { exp: START },
    { exp: START - 1 }, { exp: START + 1801 }, { exp: '1800001800' },
    { count: -1 }, { count: 39 }, { count: 1.5 }, { count: '38' },
    { flow: '' }, { flow: 'x'.repeat(129) },
  ];
  for (const changeset of changes) {
    assert.equal((await fixture.request('/v1/step', { token: signed({ ...original, ...changeset }) })).status, 401,
      JSON.stringify(changeset));
  }
  for (const purpose of ['access', 'remember']) {
    const path = purpose === 'access' ? '/v1/data' : '/v1/renew';
    for (const count of [0, 38, 40]) {
      assert.equal((await fixture.request(path, { token: signed({ ...original, purpose, count,
        exp: START + (purpose === 'access' ? 900 : 2_592_000) }) })).status, 401);
    }
  }
  assert.equal(fixture.reads.length, 0);
});

test('progress expires at the original deadline; access and remember are not interchangeable', async () => {
  const fixture = setup();
  const start = await unwrap(await fixture.request('/v1/start'));
  fixture.advance(1799);
  const first = await unwrap(await fixture.request('/v1/step', { token: start.progressToken }));
  fixture.advance(1);
  assert.equal((await fixture.request('/v1/step', { token: first.progressToken })).status, 401);
  const unlocked = await unlock(fixture);
  assert.equal((await fixture.request('/v1/data', { token: unlocked.rememberToken })).status, 401);
  assert.equal((await fixture.request('/v1/renew', { token: unlocked.accessToken })).status, 401);
  assert.equal((await fixture.request('/v1/step', { token: unlocked.accessToken })).status, 401);
  fixture.advance(2_592_000 - 10);
  const renewed = await unwrap(await fixture.request('/v1/renew', { token: unlocked.rememberToken }));
  assert.equal(renewed.expiresAt, unlocked.rememberExpiresAt);
  fixture.advance(10);
  assert.equal((await fixture.request('/v1/renew', { token: unlocked.rememberToken })).status, 401);
  assert.equal((await fixture.request('/v1/data', { token: renewed.accessToken })).status, 401);
});

test('origin is mandatory and exact; localhost is allowed only by explicit configuration', async () => {
  const fixture = setup();
  for (const origin of [null, 'null', 'https://attacker.example', `${ORIGIN}.attacker.example`, `${ORIGIN}/`, LOCAL_ORIGIN]) {
    const response = await fixture.request('/v1/start', { origin });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assertNoStore(response);
  }
  const dev = setup({ ALLOWED_ORIGINS: LOCAL_ORIGIN });
  const start = await unwrap(await dev.request('/v1/start', { origin: LOCAL_ORIGIN }));
  assert.equal((await dev.request('/v1/step', { token: start.progressToken, origin: ORIGIN })).status, 401);
  assert.equal((await dev.request('/v1/step', { token: start.progressToken, origin: LOCAL_ORIGIN })).status, 200);
  const badConfig = setup({ ALLOWED_ORIGINS: '*' });
  assert.equal((await badConfig.request('/v1/start')).status, 503);
  assert.equal((await setup({ PUBLIC_ORIGIN: LOCAL_ORIGIN }).request('/v1/start')).status, 503);
});

test('preflight grants only the exact route method and allowed headers, without credentials', async () => {
  const fixture = setup();
  for (const [path, method] of [['/v1/start', 'POST'], ['/v1/step', 'POST'], ['/v1/renew', 'POST'], ['/v1/data', 'GET'], ['/v1/overview', 'GET']]) {
    const response = await fixture.request(path, { method: 'OPTIONS', headers: {
      'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization, Content-Type',
    } });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), method);
    assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type');
    assert.equal(response.headers.get('Access-Control-Allow-Credentials'), null);
    assertNoStore(response);
  }
  assert.equal((await fixture.request('/v1/data', { method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'POST',
  } })).status, 405);
  assert.equal((await fixture.request('/v1/data', { method: 'OPTIONS', headers: {
    'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'X-Arbitrary',
  } })).status, 403);
  assert.equal((await fixture.request('/v1/data', { method: 'OPTIONS', origin: null })).status, 403);
  assert.equal((await fixture.request('/unknown', { method: 'OPTIONS' })).status, 404);
  assert.equal(fixture.reads.length, 0);
});

test('client counts, query parameters, malformed bodies and excessive bodies are rejected', async () => {
  const fixture = setup();
  for (const body of ['{"count":39}', '{"progressToken":"fake"}', '[]', 'null', '1', 'invalid']) {
    assert.equal((await fixture.request('/v1/start', { body })).status, 400);
  }
  assert.equal((await fixture.request('/v1/start', { body: '{}' })).status, 200);
  assert.equal((await fixture.request('/v1/start', { body: ' '.repeat(1025) })).status, 413);
  assert.equal((await fixture.request('/v1/start', { headers: { 'Content-Length': '1025' } })).status, 413);
  assert.equal((await fixture.request('/v1/start', { headers: { 'Content-Length': 'x' } })).status, 400);
  assert.equal((await fixture.request('/v1/start?count=39')).status, 400);
  assert.equal((await fixture.request('/v1/data?token=secret')).status, 400);
  let cancelled = false;
  let sent = false;
  const body = new ReadableStream({
    pull(controller) {
      if (!sent) { sent = true; controller.enqueue(new Uint8Array(1025)); }
    },
    cancel() { cancelled = true; },
  });
  assert.equal((await fixture.request('/v1/start', { body, duplex: 'half' })).status, 413);
  assert.equal(cancelled, true);
});

test('health has no credentials or data, and unsupported routes and methods fail', async () => {
  const fixture = setup({ TOKEN_SECRET: undefined, MOON_DATA: undefined });
  const response = await fixture.request('/health', { origin: null });
  assert.deepEqual(await unwrap(response), { service: 'ar-moon-data', version: 1, status: 'ok' });
  assertNoStore(response);
  assert.equal((await fixture.request('/v1/start', { method: 'GET' })).status, 405);
  assert.equal((await fixture.request('/v1/data', { method: 'POST' })).status, 405);
  assert.equal((await fixture.request('/health', { method: 'POST' })).status, 405);
  assert.equal((await fixture.request('/unknown')).status, 404);
  assert.equal((await fixture.request('/v1/data/')).status, 404);
  assert.equal(typeof worker.fetch, 'function');
});

test('missing secrets, private binding or dataset and internal failures fail closed', async () => {
  for (const overrides of [{ TOKEN_SECRET: undefined }, { TOKEN_SECRET: 'too-short' }, { MOON_DATA: undefined }, { MOON_DATA: {} }]) {
    const fixture = setup(overrides);
    const response = await fixture.request('/v1/start');
    assert.deepEqual(await unwrap(response, 503), { error: 'unavailable' });
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assertNoStore(response);
  }
  for (const get of [async () => null, async () => { throw new Error(`${SECRET} ${FIXTURE}`); }]) {
    const fixture = setup({ MOON_DATA: { get } });
    const unlocked = await unlock(fixture);
    const response = await fixture.request('/v1/data', { token: unlocked.accessToken });
    assert.deepEqual(await unwrap(response, 503), { error: 'unavailable' });
    assertNoStore(response);
  }
  const fixture = setup();
  const unlocked = await unlock(fixture);
  for (const path of ['/health', '/v1/start', '/v1/step', '/v1/renew', '/bad-path']) {
    const text = await (await fixture.request(path, { token: unlocked.accessToken })).text();
    assert.equal(text.includes(SECRET), false);
    assert.equal(text.includes('SYNTHETIC-001'), false);
    assert.equal(text.includes('workbench-v1'), false);
  }
});

test('optional rate limiter uses only Cloudflare client IP and fails closed on errors', async () => {
  const keys = [];
  let allowed = true;
  const fixture = setup({ RATE_LIMITER: { async limit(options) { keys.push(options); return { success: allowed }; } } });
  const headers = { 'CF-Connecting-IP': '192.0.2.100' };
  const start = await unwrap(await fixture.request('/v1/start', { headers }));
  assert.equal((await fixture.request('/v1/step', { token: start.progressToken, headers })).status, 200);
  assert.equal((await fixture.request('/v1/renew', { token: start.progressToken, headers })).status, 401);
  assert.deepEqual(keys, Array(3).fill({ key: 'moon-unlock:192.0.2.100' }));
  allowed = false;
  const limited = await fixture.request('/v1/start', { headers });
  assert.deepEqual(await unwrap(limited, 429), { error: 'too_many_requests' });
  assert.equal(limited.headers.get('Retry-After'), '60');
  assertNoStore(limited);
  assert.equal((await fixture.request('/v1/start')).status, 503);
  fixture.env.RATE_LIMITER = { async limit() { throw new Error(SECRET); } };
  assert.deepEqual(await unwrap(await fixture.request('/v1/start', { headers }), 503), { error: 'unavailable' });
});

test('expiry is checked after waiting for rate limiting and the request body', async () => {
  const delayed = setup();
  const start = await unwrap(await delayed.request('/v1/start'));
  delayed.advance(1799);
  delayed.env.RATE_LIMITER = { async limit() { delayed.advance(2); return { success: true }; } };
  const token = signed({ ...payload(start.progressToken), count: 38 });
  assert.equal((await delayed.request('/v1/step', { token, headers: { 'CF-Connecting-IP': '192.0.2.1' } })).status, 401);

  const fixture = setup();
  const unlocked = await unlock(fixture);
  fixture.advance(2_592_000 - 1);
  const body = new ReadableStream({
    pull(controller) {
      fixture.advance(2);
      controller.enqueue(new TextEncoder().encode('{}'));
      controller.close();
    },
  }, { highWaterMark: 0 });
  assert.equal((await fixture.request('/v1/renew', { token: unlocked.rememberToken, body, duplex: 'half' })).status, 401);
});

test('successful data responses preserve streaming without pre-reading private content', async () => {
  let pulled = 0;
  const fixture = setup({ MOON_DATA: { async get() {
    return new ReadableStream({
      pull(controller) {
        pulled++;
        controller.enqueue(new TextEncoder().encode(pulled === 1 ? '{"synthetic":' : 'true}'));
        if (pulled === 2) controller.close();
      },
    }, { highWaterMark: 0 });
  } } });
  const unlocked = await unlock(fixture);
  const response = await fixture.request('/v1/data', { token: unlocked.accessToken });
  assert.equal(response.status, 200);
  assert.equal(pulled, 0);
  assert.deepEqual(await response.json(), { synthetic: true });
  assert.equal(pulled, 2);
});

test('overview requires an access proof and streams only the private overview key', async () => {
  const reads = [];
  let pulled = 0;
  const fixture = setup({ MOON_DATA: { async get(key, options) {
    reads.push({ key, options });
    return new ReadableStream({
      pull(controller) {
        pulled++;
        controller.enqueue(new TextEncoder().encode(pulled === 1 ? '{"syntheticOverview":' : 'true}'));
        if (pulled === 2) controller.close();
      },
    }, { highWaterMark: 0 });
  } } });
  const start = await unwrap(await fixture.request('/v1/start'));
  for (const token of [undefined, 'invalid-token', start.progressToken]) {
    const response = await fixture.request('/v1/overview', { token });
    assert.deepEqual(await unwrap(response, 401), { error: 'unauthorized' });
    assertNoStore(response);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  }
  const unlocked = await unlock(fixture);
  assert.equal((await fixture.request('/v1/overview', { token: unlocked.rememberToken })).status, 401);
  assert.equal((await fixture.request('/v1/overview', { token: unlocked.accessToken, origin: null })).status, 403);
  assert.equal((await fixture.request('/v1/overview', { token: unlocked.accessToken, method: 'POST' })).status, 405);
  assert.deepEqual(reads, []);

  const response = await fixture.request('/v1/overview', { token: unlocked.accessToken });
  assert.equal(response.status, 200);
  assert.deepEqual(reads, [{ key: 'overview-v1', options: { type: 'stream' } }]);
  assert.equal(pulled, 0);
  assertNoStore(response);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(await response.json(), { syntheticOverview: true });
  assert.equal(pulled, 2);

  fixture.env.MOON_DATA = { async get() { return null; } };
  assert.deepEqual(await unwrap(await fixture.request('/v1/overview', { token: unlocked.accessToken }), 503), { error: 'unavailable' });
  fixture.advance(900);
  assert.equal((await fixture.request('/v1/overview', { token: unlocked.accessToken })).status, 401);
});
