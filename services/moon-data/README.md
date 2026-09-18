# Moon data service

This dependency-free Cloudflare Worker serves dashboard JSON from a private KV binding. The public site contains the interface and this protocol, but no dataset, signing secret, or reusable access token. The stored values are JSON blobs at `MOON_DATA["workbench-v1"]` and `MOON_DATA["overview-v1"]`; the Worker forwards each as a stream after checking an access token. Dataset shapes are owned by the dashboard client.

The 39-step Easter egg is access friction, **not identity authentication**. Anyone who can discover and automate the public start/step sequence can receive a valid token. Origin/CORS restrictions protect browser behavior; a non-browser client can supply an allowed Origin. Use actual identity authorization if access must be restricted to particular people. Tokens are bearer grants and must never be put in URLs, committed, logged, or included in public builds.

## API

All `/v1/*` requests need an exact allowed `Origin`. POST bodies should be absent; `{}` is accepted. Client-supplied count, token and other body fields are rejected. Send tokens only as `Authorization: Bearer <token>`, without cookies. Every expiry below is numeric Unix seconds.

| Request | Response |
| --- | --- |
| `POST /v1/start` | `{progressToken, count: 0, expiresAt}` |
| `POST /v1/step` with progress token | Counts 1–38: `{progressToken, count, expiresAt}` |
| Same request reaching count 39 | `{count: 39, accessToken, expiresAt, rememberToken, rememberExpiresAt}` |
| `POST /v1/renew` with remember token | `{accessToken, expiresAt}` |
| `GET /v1/data` with access token | Workbench JSON stream from `workbench-v1` |
| `GET /v1/overview` with access token | Overview JSON stream from `overview-v1` |
| `GET /health` | Public `{service: "ar-moon-data", version: 1, status: "ok"}`; no Origin needed |

Progress expires 30 minutes after start, regardless of intermediate steps. Replaying a progress token returns the same next count and cannot skip a step. The last step can be retried and may issue equivalent fresh grants while its progress proof remains valid. Access lasts 15 minutes; remember lasts 30 days. Renewal does not rotate or extend remember, and renewed access is capped at remember expiry.

Proofs are base64url JSON followed by a dot and a base64url HMAC-SHA-256 signature. The signed fields are `v`, `purpose`, `aud`, `origin`, `iat`, `exp`, `flow`, and `count`. The server verifies all required claims, the signature, and the deadline. Progress has count 0–38; access and remember require count 39. Progress tokens have no server-side consumption record; retry-safe replay is deliberate. Rotating `TOKEN_SECRET` invalidates all outstanding grants immediately.

Responses have browser and CDN `no-store` headers, including errors and health. Preflight permits only the route’s method and `Authorization`/`Content-Type`. Query parameters, unknown routes/methods, bodies over 1 KiB, and tokens over 4096 characters are rejected. Errors contain only a generic code. The service never logs request bodies, tokens, secrets, or dataset contents. Cloudflare observability and preview URLs are disabled in the checked-in configuration.

Error statuses are `400 invalid_request`, `401 unauthorized`, `403 forbidden`, `404 not_found`, `405 method_not_allowed`, `413 request_too_large`, `429 too_many_requests`, and `503 unavailable`. A missing/short signing secret or missing KV binding prevents grants. A missing dataset or KV failure prevents data responses. Health reports service liveness only, never configuration or dataset readiness.

## Configuration

- `MOON_DATA`: private Workers KV binding. Store the complete workbench JSON as key `workbench-v1` and the overview JSON as key `overview-v1`, both outside the public repository and frontend build. Both routes require the same access proof and enforce the same Origin, CORS and cache rules.
- `TOKEN_SECRET`: Cloudflare Worker secret with at least 32 bytes of cryptographically random material. Set through the secret-management interface; never add it to Wrangler vars or tracked files.
- `PUBLIC_ORIGIN`: exact HTTPS production origin; checked-in value is `https://ark0ishi.github.io`.
- `ALLOWED_ORIGINS` (optional): comma-separated exact additional origins. Local development is allowed only when explicitly listed here, for example `http://localhost:4321`. No wildcard, pathname or trailing slash is accepted. HTTP is accepted only for explicit loopback origins.
- `RATE_LIMITER` (optional): Cloudflare rate-limit binding. All three POST routes share a key derived solely from Cloudflare’s `CF-Connecting-IP`. Configured limiter errors or a missing IP fail closed. Rejection returns 429 with `Retry-After: 60`. If the binding is absent, no application rate limiting is performed.

To enable rate limiting, add a `ratelimits` entry with `name: "RATE_LIMITER"`, an account-unique numeric-string `namespace_id`, and `simple: {limit: 120, period: 60}`. Choose a limit that permits a normal 40-request unlock and account for users sharing an IP. This binding’s counters are approximate and local to Cloudflare locations, not a global quota.

The KV binding intentionally starts without a namespace ID so current Wrangler can provision it. Use Wrangler 4.45.0 or newer for this feature. Once provisioned, keep the resulting binding ID in configuration. `workers_dev: true` enables the service endpoint; `preview_urls: false` prevents additional preview endpoints. A published endpoint alone does not expose KV; only the protected data and overview routes read it.

There are no deployment hooks in the frontend package. Deploy and populate this service separately after configuring the private secret and dataset, then point the public client at its HTTPS base URL. Changing frontend build settings must never ingest private JSON. Do not check local KV persistence or private upload files into Git.

## Verification

From this directory, run `node --test` on Node 22 or newer. Tests use Web Crypto, mock KV, an injectable Unix-second clock, and an entirely synthetic fixture. They exercise the complete 39-step protocol, expiration and retry behavior, forged/invalid claims, Origin/CORS, body/token caps, generic errors, unavailable configuration/data, rate limiting, and streamed output. The default export is the Worker handler; `createWorker({now})` is the only named export and exists to support deterministic tests.

Cloudflare references: [KV automatic provisioning](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning), [preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/), and [rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
