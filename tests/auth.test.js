// Auth Prototype: Google identity -> server session -> allowlist -> read-only API.
// Deterministic: the real provider code runs against a local fake IdP (tests/fakeGoogle.js). Synthetic data only.
// A real Google login with the real accounts (TV3 / TV15) is NOT covered here - it is a manual check.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server/index.js';
import { createApi } from '../server/api.js';
import { loadAuthConfig, AuthConfigError } from '../server/auth/config.js';
import { createGoogleAuth } from '../server/auth/index.js';
import { createGoogleProvider } from '../server/auth/google.js';
import { createFileAllowlist, createStaticAllowlist, parseAllowlist, AllowlistError } from '../server/auth/allowlist.js';
import { createSessionStore } from '../server/auth/session.js';
import { createDevMockAdapter } from '../src/adapters/mock/devMockAdapter.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';
import { startFakeGoogle, FAKE_ACCESS_TOKEN, FAKE_REFRESH_TOKEN } from './fakeGoogle.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLIENT_ID = 'test-client-id.example';
const CLIENT_SECRET = 'TEST-CLIENT-SECRET-value-0123456789';
const ORIGIN = 'http://localhost:3999';
const HOST = 'localhost:3999';
const OWNER = { email: 'owner.test@example.com', sub: '100000000000000000001' }; // Management / Executive (test identity)
const REP = { email: 'representative.test@example.com', sub: '100000000000000000002' }; // Representative (test identity)
const OUTSIDER = { email: 'outsider@example.com', sub: '100000000000000000003' };
const FORMER = { email: 'former@example.com', sub: '100000000000000000004' };
const ALLOWLIST = {
  viewers: [
    { email: OWNER.email, name: 'Management (test)', active: true },
    { email: REP.email, name: 'Representative (test)', active: true },
    { email: FORMER.email, name: 'Revoked (test)', active: false },
  ],
};
const DATA = /モック|デモ|STORE_|Staff|ทะเบียน|"stores"|"freshness"/; // any dashboard data at all
const RESOURCES = ['entry', 'all-stores', 'today?store=STORE_A', 'run?store=STORE_A&run_id=x', 'messages?store=STORE_A', 'questions?store=STORE_A', 'failures', 'machines', 'periods?days=7'];

let clock = Date.parse('2026-10-05T09:00:00+07:00');
const now = () => clock;
let fake; let server; let port; let dir; let allowFile; let checks = 0; let loads = 0; const logs = [];
let config; let auth;

const writeAllowlist = (doc) => writeFileSync(allowFile, typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2));

function call(path, { method = 'GET', headers = {}, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const h = { Host: HOST, ...headers };
    if (cookie) h.Cookie = cookie;
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: h }, (res) => {
      let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
}
const cookiePair = (setCookies, name) => (setCookies ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith(`${name}=`));

/** Full flow: /auth/login -> (fake Google consent) -> /auth/callback. Returns the session cookie pair or null. */
async function login(who, { claims, how, ret = '/', tamper } = {}) {
  const start = await call(`/auth/login?return=${encodeURIComponent(ret)}`);
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.location);
  const flow = cookiePair(start.headers['set-cookie'], 'nikusho_login');
  const p = loc.searchParams;
  const code = fake.issueCode({ ...who, nonce: p.get('nonce'), codeChallenge: p.get('code_challenge'), redirectUri: p.get('redirect_uri'), claims, how });
  let q = `code=${encodeURIComponent(code)}&state=${encodeURIComponent(p.get('state'))}`;
  let flowCookie = flow;
  if (tamper) ({ q, flowCookie } = tamper({ q, flowCookie, code, state: p.get('state') }));
  const cb = await call(`/auth/callback?${q}`, { cookie: flowCookie });
  return { cb, start, session: cookiePair(cb.headers['set-cookie'], 'nikusho_sid') ?? null };
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'nikusho-auth-'));
  allowFile = join(dir, 'allowlist.json');
  writeAllowlist(ALLOWLIST);
  fake = await startFakeGoogle({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, now });
  config = loadAuthConfig({ NIKUSHO_AUTH: 'google', NIKUSHO_PUBLIC_ORIGIN: ORIGIN, GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET, NIKUSHO_ALLOWLIST_FILE: allowFile });
  const fileList = createFileAllowlist(allowFile, { log: (m) => logs.push(m) });
  const counted = { kind: 'counted', check: (i) => { checks++; return fileList.check(i); } };
  const provider = createGoogleProvider({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, endpoints: fake.endpoints, now });
  auth = createGoogleAuth(config, { provider, allowlist: counted, now, log: (m) => logs.push(m) });
  const dev = createDevMockAdapter();
  const live = { kind: 'devmock', load: async () => { loads++; return dev.load(); } };
  server = createServer({ live, demo: createDemoAdapter(), auth });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(async () => { server.close(); await fake.close(); rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => { writeAllowlist(ALLOWLIST); });

// ---------------------------------------------------------------- 1. unauthenticated
test('AUTH-1 unauthenticated: every resource of both entries -> 401 with no data', async () => {
  const before = loads;
  for (const entry of ['live', 'demo']) {
    for (const r of RESOURCES) {
      const res = await call(`/api/${entry}/${r}`);
      assert.equal(res.status, 401, `${entry}/${r}`);
      assert.deepEqual(JSON.parse(res.body), { ok: false, error: 'unauthenticated' });
      assert.match(res.headers['cache-control'], /no-store/);
    }
  }
  assert.equal(loads, before, 'no adapter load happened for denied requests');
  const me = JSON.parse((await call('/auth/me')).body);
  assert.deepEqual(me, { ok: true, mode: 'google', authenticated: false, allowed: false });
});

// ---------------------------------------------------------------- 2. allowlisted -> allow
test('AUTH-2 Google-authenticated allowlisted users (management, representative) -> ALLOW on every resource', async () => {
  for (const who of [OWNER, REP]) {
    const { cb, session } = await login(who);
    assert.equal(cb.status, 302); assert.equal(cb.headers.location, '/');
    assert.ok(session, 'session cookie set');
    for (const entry of ['live', 'demo']) {
      for (const r of RESOURCES.filter((x) => !x.startsWith('run?'))) {
        const res = await call(`/api/${entry}/${r}`, { cookie: session });
        assert.equal(res.status, 200, `${who.email} ${entry}/${r}`);
        assert.equal(JSON.parse(res.body).ok, true);
        assert.match(res.headers['cache-control'], /no-store/);
      }
    }
    const me = JSON.parse((await call('/auth/me', { cookie: session })).body);
    assert.deepEqual(me, { ok: true, mode: 'google', authenticated: true, allowed: true, email: who.email });
  }
});

// ---------------------------------------------------------------- 3. not on the allowlist
test('AUTH-3 Google-authenticated but NOT allowlisted -> 403, no data, UI told "denied"', async () => {
  const { session } = await login(OUTSIDER);
  assert.ok(session, 'authentication succeeds (identity is known) ...');
  for (const entry of ['live', 'demo']) {
    for (const r of RESOURCES) {
      const res = await call(`/api/${entry}/${r}`, { cookie: session });
      assert.equal(res.status, 403, `${entry}/${r}`);
      assert.equal(DATA.test(res.body), false, `${entry}/${r} leaked`);
    }
  }
  const me = JSON.parse((await call('/auth/me', { cookie: session })).body);
  assert.equal(me.authenticated, true); assert.equal(me.allowed, false, '... but authorization denies');
});

// ---------------------------------------------------------------- 4. inactive / revoked entry
test('AUTH-4 allowlist entry with active:false -> 403 no data', async () => {
  const { session } = await login(FORMER);
  const res = await call('/api/live/entry', { cookie: session });
  assert.equal(res.status, 403); assert.equal(DATA.test(res.body), false);
});

// ---------------------------------------------------------------- 5. invalid / tampered session
test('AUTH-5 invalid, tampered or forged session cookies -> 401', async () => {
  const { session } = await login(OWNER);
  const [name, value] = session.split('=');
  const flip = value.slice(0, -1) + (value.at(-1) === 'A' ? 'B' : 'A');
  const idTok = fake.issuedIdTokens.at(-1);
  for (const c of [`${name}=${flip}`, `${name}=`, `${name}=x`, `${name}=${value}x`, `${name}=${idTok}`, `${name}=${Buffer.from(OWNER.email).toString('base64url')}`, `other=${value}`]) {
    const res = await call('/api/live/entry', { cookie: c });
    assert.equal(res.status, 401, c.slice(0, 40)); assert.equal(DATA.test(res.body), false);
  }
});

test('AUTH-5b identity supplied by the browser (query, headers, bearer ID token) is never accepted', async () => {
  const t = Math.floor(clock / 1000);
  const validIdToken = fake.idToken({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: OWNER.sub, email: OWNER.email, email_verified: true, iat: t, exp: t + 3600, nonce: 'n' });
  const attempts = [
    { path: `/api/live/entry?email=${OWNER.email}&user=${OWNER.email}&sub=${OWNER.sub}` },
    { path: '/api/live/entry', headers: { 'X-Forwarded-Email': OWNER.email, 'X-Forwarded-User': OWNER.email, 'X-Goog-Authenticated-User-Email': `accounts.google.com:${OWNER.email}`, 'X-Auth-Request-Email': OWNER.email } },
    { path: '/api/live/entry', headers: { Authorization: `Bearer ${validIdToken}` } },
    { path: `/api/live/entry?id_token=${validIdToken}` },
  ];
  for (const a of attempts) {
    const res = await call(a.path, { headers: a.headers });
    assert.equal(res.status, 401, a.path); assert.equal(DATA.test(res.body), false);
  }
});

// ---------------------------------------------------------------- 6. logout
test('AUTH-6 logout destroys the server session: the old cookie is useless afterwards', async () => {
  const { session } = await login(OWNER);
  assert.equal((await call('/api/live/entry', { cookie: session })).status, 200);
  const out = await call('/auth/logout?return=/demo/', { cookie: session });
  assert.equal(out.status, 302); assert.equal(out.headers.location, '/demo/');
  assert.match(out.headers['set-cookie'].join(';'), /nikusho_sid=;.*Max-Age=0/);
  assert.equal(out.headers['clear-site-data'], '"cache"');
  const replay = await call('/api/live/entry', { cookie: session });
  assert.equal(replay.status, 401); assert.equal(DATA.test(replay.body), false);
  assert.equal(JSON.parse((await call('/auth/me', { cookie: session })).body).authenticated, false);
  assert.equal((await call('/auth/logout?return=https://evil.example/')).headers.location, '/', 'logout return is not an open redirect');
});

// ---------------------------------------------------------------- 7. expiry
test('AUTH-7 idle-expired and absolutely-expired sessions -> 401 (login required)', async () => {
  const idleMin = config.session.idleMs / 60_000;
  let { session } = await login(OWNER);
  clock += (idleMin + 1) * 60_000;
  assert.equal((await call('/api/live/entry', { cookie: session })).status, 401, 'idle timeout');

  ({ session } = await login(OWNER));
  const step = Math.floor(config.session.idleMs / 2);
  const end = clock + config.session.maxMs;
  while (clock + step < end) { clock += step; assert.equal((await call('/api/live/entry', { cookie: session })).status, 200); }
  clock = end + 1000;
  assert.equal((await call('/api/live/entry', { cookie: session })).status, 401, 'absolute lifetime');
});

// ---------------------------------------------------------------- 8. authorization on EVERY request
test('AUTH-8 the allowlist is consulted on every protected request (no per-session caching of the decision)', async () => {
  const { session } = await login(REP);
  const c0 = checks;
  for (let i = 0; i < 12; i++) assert.equal((await call(`/api/live/${['entry', 'failures', 'machines'][i % 3]}`, { cookie: session })).status, 200);
  assert.equal(checks - c0, 12);
});

// ---------------------------------------------------------------- 9. direct API calls
test('AUTH-9 calling the API directly without signing in yields nothing, on every path shape', async () => {
  for (const p of ['/api/live/entry', '/api/demo/entry', '/api/live/constructor', '/api/live/__proto__', '/api/x/y', '/api/', '/api/live/', '/api//entry']) {
    const res = await call(p);
    assert.equal(res.status, 401, p); assert.equal(DATA.test(res.body), false, p);
  }
});

// ---------------------------------------------------------------- 10. revocation + cache
test('AUTH-10 revocation is immediate, and no cached copy reaches a revoked viewer', async () => {
  const { session } = await login(OWNER);
  // warm every in-process copy: the demo adapter memoizes its snapshot after the first read
  assert.equal((await call('/api/demo/entry', { cookie: session })).status, 200);
  assert.equal((await call('/api/live/entry', { cookie: session })).status, 200);
  const loadsBefore = loads;

  writeAllowlist({ viewers: ALLOWLIST.viewers.map((v) => (v.email === OWNER.email ? { ...v, active: false } : v)) }); // revoke
  for (const entry of ['live', 'demo']) {
    for (const r of RESOURCES) {
      const res = await call(`/api/${entry}/${r}`, { cookie: session });
      assert.equal(res.status, 403, `${entry}/${r} right after revocation`);
      assert.equal(DATA.test(res.body), false, `${entry}/${r} served from cache`);
      assert.match(res.headers['cache-control'], /no-store/);
    }
  }
  assert.equal(loads, loadsBefore, 'the data layer was not even reached');
  assert.equal(JSON.parse((await call('/auth/me', { cookie: session })).body).allowed, false);

  writeAllowlist({ viewers: ALLOWLIST.viewers.filter((v) => v.email !== OWNER.email) }); // removed entirely
  assert.equal((await call('/api/demo/entry', { cookie: session })).status, 403);

  writeAllowlist(ALLOWLIST); // re-added -> allowed again without a new login (add procedure)
  assert.equal((await call('/api/demo/entry', { cookie: session })).status, 200);
});

test('AUTH-10b the data layer itself refuses anything but a gate-issued ALLOW verdict', async () => {
  const api = createApi({ live: createDevMockAdapter(), demo: createDemoAdapter() });
  for (const v of [undefined, null, {}, { allowed: true }, Object.freeze({ allowed: true, identity: OWNER })]) {
    const r = await api(v, 'demo', 'entry', new URLSearchParams());
    assert.equal(r.status, 403); assert.equal(DATA.test(JSON.stringify(r.body)), false);
  }
});

// ---------------------------------------------------------------- 11. GET/HEAD only
test('AUTH-11 still GET/HEAD-only: write-like methods refused on API and auth routes; HEAD never logs in or out', async () => {
  const { session } = await login(OWNER);
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) {
    for (const p of ['/api/live/entry', '/auth/login', '/auth/callback', '/auth/logout', '/auth/me', '/']) {
      const r = await call(p, { method: m, cookie: session }).catch(() => ({ status: 'closed' }));
      assert.ok(r.status === 405 || r.status === 'closed', `${m} ${p} -> ${r.status}`);
    }
  }
  for (const p of ['/auth/login', '/auth/callback', '/auth/logout']) {
    const r = await call(p, { method: 'HEAD', cookie: session });
    assert.equal(r.status, 405, p); assert.equal(r.headers.location, undefined); assert.equal(r.headers['set-cookie'], undefined);
  }
  assert.equal((await call('/api/live/entry', { cookie: session })).status, 200, 'HEAD /auth/logout did not log out');
  const head = await call('/api/live/entry', { method: 'HEAD', cookie: session });
  assert.equal(head.status, 200); assert.equal(head.body, '');
  assert.equal((await call('/api/live/entry', { method: 'HEAD' })).status, 401);
});

// ---------------------------------------------------------------- identity verification (server side)
test('AUTH-12 ID tokens that fail any check never create a session', async () => {
  const t = Math.floor(clock / 1000);
  const cases = {
    wrong_audience: { claims: { aud: 'someone-elses-client' } },
    wrong_issuer: { claims: { iss: 'https://evil.example' } },
    expired: { claims: { iat: t - 7200, exp: t - 3600 } },
    issued_in_future: { claims: { iat: t + 3600, exp: t + 7200 } },
    wrong_nonce: { claims: { nonce: 'not-the-nonce' } },
    email_unverified: { claims: { email_verified: false } },
    email_verified_string: { claims: { email_verified: 'true' } },
    no_email: { claims: { email: undefined } },
    bad_signature: { how: 'other-key' },
    alg_none: { how: 'none' },
  };
  for (const [name, opt] of Object.entries(cases)) {
    const { cb, session } = await login(OWNER, opt);
    assert.equal(session, null, name);
    assert.equal(cb.status, 302, name); assert.equal(cb.headers.location, '/?login=failed', name);
  }
});

test('AUTH-12b login CSRF / replay: callback needs the same browser\'s one-time flow and matching state', async () => {
  const variants = {
    no_flow_cookie: ({ q }) => ({ q, flowCookie: undefined }),
    wrong_state: ({ code, flowCookie }) => ({ q: `code=${code}&state=forged`, flowCookie }),
    no_state: ({ code, flowCookie }) => ({ q: `code=${code}`, flowCookie }),
    other_browser_flow: ({ q }) => ({ q, flowCookie: 'nikusho_login=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
    provider_error: ({ state, flowCookie }) => ({ q: `error=access_denied&state=${state}`, flowCookie }),
  };
  for (const [name, tamper] of Object.entries(variants)) {
    const { session, cb } = await login(OWNER, { tamper });
    assert.equal(session, null, name); assert.match(cb.headers.location, /\?login=failed$/, name);
  }
  // replay: the same flow cookie + state + a fresh code a second time
  const start = await call('/auth/login');
  const p = new URL(start.headers.location).searchParams;
  const flow = cookiePair(start.headers['set-cookie'], 'nikusho_login');
  const mk = () => fake.issueCode({ ...OWNER, nonce: p.get('nonce'), codeChallenge: p.get('code_challenge'), redirectUri: p.get('redirect_uri') });
  const first = await call(`/auth/callback?code=${mk()}&state=${p.get('state')}`, { cookie: flow });
  assert.ok(cookiePair(first.headers['set-cookie'], 'nikusho_sid'));
  const second = await call(`/auth/callback?code=${mk()}&state=${p.get('state')}`, { cookie: flow });
  assert.equal(cookiePair(second.headers['set-cookie'], 'nikusho_sid'), undefined, 'flow is one-time');
  // expired flow (10 min)
  const s2 = await call('/auth/login');
  const p2 = new URL(s2.headers.location).searchParams;
  clock += 11 * 60_000;
  const late = await call(`/auth/callback?code=${fake.issueCode({ ...OWNER, nonce: p2.get('nonce'), codeChallenge: p2.get('code_challenge'), redirectUri: p2.get('redirect_uri') })}&state=${p2.get('state')}`, { cookie: cookiePair(s2.headers['set-cookie'], 'nikusho_login') });
  assert.equal(cookiePair(late.headers['set-cookie'], 'nikusho_sid'), undefined, 'expired flow');
});

test('AUTH-12c the authorization request uses code flow + PKCE S256 + state + nonce, scope openid email, no secret', async () => {
  const r = await call('/auth/login?return=/demo/');
  const u = new URL(r.headers.location);
  assert.equal(`${u.origin}${u.pathname}`, fake.endpoints.authorization);
  const p = u.searchParams;
  assert.equal(p.get('response_type'), 'code'); assert.equal(p.get('scope'), 'openid email');
  assert.equal(p.get('code_challenge_method'), 'S256'); assert.match(p.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(p.get('state'), /^[A-Za-z0-9_-]{43}$/); assert.match(p.get('nonce'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(p.get('redirect_uri'), `${ORIGIN}/auth/callback`); assert.equal(p.get('client_id'), CLIENT_ID);
  assert.equal(r.headers.location.includes(CLIENT_SECRET), false); assert.equal(p.has('client_secret'), false);
  const flowCookie = r.headers['set-cookie'].find((c) => c.startsWith('nikusho_login='));
  assert.match(flowCookie, /HttpOnly/); assert.match(flowCookie, /SameSite=Lax/); assert.match(flowCookie, /Max-Age=600/);
});

// ---------------------------------------------------------------- session cookie properties / no token exposure
test('AUTH-13 session cookie is HttpOnly + SameSite=Strict, opaque, rotated per login; no OAuth token reaches the browser', async () => {
  const pre = await login(OWNER);
  const { cb, session } = await login(OWNER, { tamper: ({ q, flowCookie }) => ({ q, flowCookie: `${flowCookie}; ${pre.session}` }) });
  const sc = cb.headers['set-cookie'].find((c) => c.startsWith('nikusho_sid='));
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Path=\//); assert.match(sc, /Max-Age=\d+/);
  assert.match(session, /^nikusho_sid=[A-Za-z0-9_-]{43}$/);
  assert.notEqual(session, pre.session, 'new id at every login');
  assert.equal((await call('/api/live/entry', { cookie: pre.session })).status, 401, 'pre-login session id was destroyed (no fixation)');
  const everything = JSON.stringify([cb.headers, cb.body, (await call('/auth/me', { cookie: session })).body]);
  for (const secret of [FAKE_ACCESS_TOKEN, FAKE_REFRESH_TOKEN, CLIENT_SECRET, ...fake.issuedIdTokens]) assert.equal(everything.includes(secret), false);
});

test('AUTH-13b over https the cookies are __Host- prefixed and Secure', async () => {
  const cfg = loadAuthConfig({ NIKUSHO_AUTH: 'google', NIKUSHO_PUBLIC_ORIGIN: 'https://monitor.example.test', GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET, NIKUSHO_ALLOWLIST_FILE: allowFile });
  assert.equal(cfg.secureCookies, true); assert.equal(cfg.redirectUri, 'https://monitor.example.test/auth/callback');
  const a = createGoogleAuth(cfg, { provider: createGoogleProvider({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, endpoints: fake.endpoints, now }), allowlist: createStaticAllowlist(ALLOWLIST), now, log: () => {} });
  const s = createServer({ live: createDevMockAdapter(), demo: createDemoAdapter(), auth: a });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const get = (path, cookie) => new Promise((resolve) => http.get({ host: '127.0.0.1', port: s.address().port, path, headers: { Host: 'monitor.example.test', ...(cookie ? { Cookie: cookie } : {}) } }, (res) => { res.resume(); res.on('end', () => resolve(res)); }));
  const start = await get('/auth/login');
  const flow = start.headers['set-cookie'][0];
  assert.match(flow, /^__Host-nikusho_login=/); assert.match(flow, /; Secure/);
  const p = new URL(start.headers.location).searchParams;
  const code = fake.issueCode({ ...OWNER, nonce: p.get('nonce'), codeChallenge: p.get('code_challenge'), redirectUri: p.get('redirect_uri') });
  const cb = await get(`/auth/callback?code=${code}&state=${p.get('state')}`, flow.split(';')[0]);
  const sid = cb.headers['set-cookie'].find((c) => c.startsWith('__Host-nikusho_sid='));
  assert.ok(sid); assert.match(sid, /; Secure/); assert.match(sid, /HttpOnly/); assert.match(sid, /SameSite=Strict/); assert.match(sid, /Path=\//);
  assert.equal(/Domain=/i.test(sid), false);
  s.close();
});

// ---------------------------------------------------------------- open redirect, host, static, demo separation
test('AUTH-14 return target is limited to the two entries (no open redirect)', async () => {
  for (const [ret, expected] of [['/demo/', '/demo/'], ['/', '/'], ['https://evil.example/', '/'], ['//evil.example', '/'], ['/api/live/entry', '/'], ['javascript:alert(1)', '/']]) {
    const { cb } = await login(REP, { ret });
    assert.equal(cb.headers.location, expected, ret);
  }
});

test('AUTH-15 a request for another Host is refused on auth and API routes', async () => {
  const { session } = await login(OWNER);
  for (const p of ['/api/live/entry', '/auth/login', '/auth/me', '/auth/logout']) {
    const r = await call(p, { headers: { Host: 'attacker.example' }, cookie: session });
    assert.equal(r.status, 403, p); assert.equal(DATA.test(r.body), false); assert.equal(r.headers.location, undefined);
  }
});

test('AUTH-16 public shell stays public; demo stays a separate entry; private files stay private', async () => {
  for (const p of ['/', '/demo/', '/demo', '/app/main.js', '/app/components/auth.js', '/styles/components.css']) assert.equal((await call(p)).status, 200, p);
  assert.match((await call('/demo/')).body, /data-entry="demo"/);
  for (const p of ['/server/auth/google.js', '/server/auth/config.js', '/config/allowlist.example.json', '/allowlist.json', '/tests/fakeGoogle.js', '/docs/auth-prototype.md', '/.env', '/package.json']) {
    assert.notEqual((await call(p)).status, 200, p);
  }
  const { session } = await login(OWNER);
  const live = JSON.parse((await call('/api/live/entry', { cookie: session })).body);
  const demo = JSON.parse((await call('/api/demo/entry', { cookie: session })).body);
  assert.equal(live.entry, 'live'); assert.equal(demo.entry, 'demo');
  assert.ok(JSON.stringify(live.data.stores).includes('モック') && !JSON.stringify(live.data.stores).includes('デモ'));
  assert.ok(JSON.stringify(demo.data.stores).includes('デモ') && !JSON.stringify(demo.data.stores).includes('モック'));
});

test('AUTH-17 no secret in static files or responses; logs carry reason codes only', async () => {
  for (const p of ['/', '/demo/', '/app/main.js', '/app/lib/api.js', '/app/components/auth.js', '/auth/me']) {
    const b = (await call(p)).body;
    assert.equal(b.includes(CLIENT_SECRET), false, p); assert.equal(b.includes(allowFile), false, p);
  }
  await login(OWNER, { how: 'other-key' });
  const all = logs.join('\n');
  for (const s of [CLIENT_SECRET, FAKE_ACCESS_TOKEN, FAKE_REFRESH_TOKEN, OWNER.email, REP.email, ...fake.issuedIdTokens]) assert.equal(all.includes(s), false, 'log leaked');
  assert.match(all, /login failed: id_token_signature/);
});

// ---------------------------------------------------------------- allowlist rules (deny by default)
test('AUTH-18 allowlist: deny by default, fail closed on a bad file, exact match, optional sub pin', async () => {
  const { session } = await login(OWNER);
  for (const bad of ['', '{', '[]', '{"viewers":{}}', JSON.stringify({ viewers: [{ email: OWNER.email }] }), JSON.stringify({ viewers: [{ email: OWNER.email, active: 'yes' }] }), JSON.stringify({ viewers: [{ email: OWNER.email, active: true, role: 'admin' }] })]) {
    writeAllowlist(bad);
    assert.equal((await call('/api/live/entry', { cookie: session })).status, 403, `bad file: ${bad.slice(0, 40)}`);
  }
  rmSync(allowFile);
  assert.equal((await call('/api/live/entry', { cookie: session })).status, 403, 'missing file');

  assert.throws(() => parseAllowlist({ viewers: [{ email: 'a@example.com', active: true, role: 'manager' }] }), AllowlistError, 'no role field: one permission level only');
  const l = createStaticAllowlist({ viewers: [
    { email: 'Mixed.Case@Example.com', active: true },
    { email: 'dup@example.com', active: true }, { email: 'dup@example.com', active: false },
    { email: 'pinned@example.com', active: true, sub: '42' },
  ] });
  assert.equal(l.check({ email: 'mixed.case@example.com', sub: '1' }).allowed, true);
  assert.equal(l.check({ email: 'mixedcase@example.com', sub: '1' }).allowed, false, 'no alias folding');
  assert.equal(l.check({ email: 'dup@example.com', sub: '1' }).allowed, false, 'an inactive duplicate revokes');
  assert.equal(l.check({ email: 'pinned@example.com', sub: '43' }).allowed, false);
  assert.equal(l.check({ email: 'pinned@example.com', sub: '42' }).allowed, true);
  assert.equal(l.check(null).allowed, false); assert.equal(l.check({ email: 'mixed.case@example.com' }).allowed, false, 'no verified sub');
  // the example file shipped with the repo is valid and contains placeholders only
  const ex = JSON.parse(readFileSync(join(ROOT, 'config/allowlist.example.json'), 'utf8'));
  assert.doesNotThrow(() => parseAllowlist(ex));
  for (const v of ex.viewers) assert.match(v.email, /@example\.(com|org|net)$/);
});

test('AUTH-19 session store: unknown / malformed ids are not sessions', () => {
  const s = createSessionStore({ idleMs: 1000, maxMs: 5000, now: () => 0 });
  const id = s.create({ sub: '1', email: 'a@example.com' });
  assert.deepEqual(s.get(id), { sub: '1', email: 'a@example.com' });
  for (const bad of [undefined, '', 'x', `${id}=`, id.toUpperCase() === id ? id.toLowerCase() : id.toUpperCase(), { toString: () => id }]) assert.equal(s.get(bad), null);
  s.destroy(id); assert.equal(s.get(id), null);
});

// ---------------------------------------------------------------- configuration
test('AUTH-20 configuration: explicit mode, required variables named (never their values), https outside localhost', () => {
  assert.deepEqual(loadAuthConfig({}), { mode: 'dev-loopback' });
  assert.throws(() => loadAuthConfig({ NIKUSHO_AUTH: 'magic' }), AuthConfigError);
  try { loadAuthConfig({ NIKUSHO_AUTH: 'google', GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET }); assert.fail('should throw'); } catch (e) {
    assert.ok(e instanceof AuthConfigError);
    assert.match(e.message, /NIKUSHO_PUBLIC_ORIGIN.*GOOGLE_OAUTH_CLIENT_ID.*NIKUSHO_ALLOWLIST_FILE/);
    assert.equal(e.message.includes(CLIENT_SECRET), false);
  }
  const base = { NIKUSHO_AUTH: 'google', GOOGLE_OAUTH_CLIENT_ID: 'a', GOOGLE_OAUTH_CLIENT_SECRET: 'b', NIKUSHO_ALLOWLIST_FILE: 'f' };
  assert.throws(() => loadAuthConfig({ ...base, NIKUSHO_PUBLIC_ORIGIN: 'http://monitor.example.test' }), /https/);
  assert.throws(() => loadAuthConfig({ ...base, NIKUSHO_PUBLIC_ORIGIN: 'https://monitor.example.test/app' }), /origin only/);
  assert.throws(() => loadAuthConfig({ ...base, NIKUSHO_PUBLIC_ORIGIN: 'http://localhost:3000', NIKUSHO_SESSION_IDLE_MINUTES: '-5' }), AuthConfigError);
  assert.equal(loadAuthConfig({ ...base, NIKUSHO_PUBLIC_ORIGIN: 'http://localhost:3000' }).secureCookies, false);
});

test('AUTH-21 the server refuses to start in google mode with incomplete configuration (no value echoed)', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'server/index.js')], {
    env: { PATH: process.env.PATH, NIKUSHO_AUTH: 'google', GOOGLE_OAUTH_CLIENT_SECRET: CLIENT_SECRET, PORT: '0' }, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /GOOGLE_OAUTH_CLIENT_ID/);
  assert.equal(`${r.stdout}${r.stderr}`.includes(CLIENT_SECRET), false);
});
