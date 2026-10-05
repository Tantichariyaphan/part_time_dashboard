// Vercel demo entry (api/server.js) + allowlist from NIKUSHO_ALLOWLIST_JSON. Synthetic data; local test IdP.
// Proves the wiring only. A real Google sign-in on the deployed URL is a manual check (TV15-style), not covered here.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from '../server/index.js';
import { loadAuthConfig, AuthConfigError } from '../server/auth/config.js';
import { createGoogleAuth } from '../server/auth/index.js';
import { createGoogleProvider } from '../server/auth/google.js';
import { createEnvAllowlist } from '../server/auth/allowlist.js';
import { createDevMockAdapter } from '../src/adapters/mock/devMockAdapter.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';
import { startFakeGoogle } from './fakeGoogle.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRAPPER = new URL('../api/server.js', import.meta.url).href;
const ORIGIN = 'https://demo-test.vercel.app';
const HOST = 'demo-test.vercel.app';
const SECRET = 'VERCEL-TEST-SECRET-0123456789';
const ALLOWED = { email: 'allowed.viewer@example.com', sub: '200000000000000000001' };
const OTHER = { email: 'not.listed@example.com', sub: '200000000000000000002' };
const ENV_LIST = JSON.stringify({ viewers: [{ email: 'Allowed.Viewer@example.com', name: 'test', active: true }] });
const DATA = /モック|デモ|STORE_|Staff|"stores"|"freshness"/;
const BASE_ENV = { NIKUSHO_AUTH: 'google', NIKUSHO_PUBLIC_ORIGIN: ORIGIN, GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: SECRET };

/** Runs the real Vercel entry in a fresh process (its start-up state is per process) and calls a few paths. */
function runWrapper(env, paths) {
  const script = `
    import http from 'node:http';
    const { default: h } = await import(${JSON.stringify(WRAPPER)});
    const s = http.createServer(h).listen(0, '127.0.0.1', async () => {
      const out = [];
      for (const p of ${JSON.stringify(paths)}) {
        out.push(await new Promise((ok) => http.get({ host: '127.0.0.1', port: s.address().port, path: p, headers: { Host: ${JSON.stringify(HOST)} } },
          (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => ok({ p, status: r.statusCode, location: r.headers.location ?? null, body: b })); })));
      }
      console.log('RESULT' + JSON.stringify(out)); s.close();
    });`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 20_000 });
  const stdout = r.stdout; const stderr = r.stderr;
  const line = String(stdout).split('\n').find((l) => l.startsWith('RESULT'));
  return { results: JSON.parse(line.slice(6)), log: String(stdout) + stderr };
}

test('VERCEL-1 entry starts with NIKUSHO_ALLOWLIST_JSON: sign-in offered, Google redirect correct, API refuses without a session', () => {
  const { results, log } = runWrapper({ ...BASE_ENV, NIKUSHO_ALLOWLIST_JSON: ENV_LIST }, ['/auth/me', '/api/live/entry', '/api/demo/entry', '/auth/login?return=/demo/']);
  const [me, live, demo, login] = results;
  assert.equal(me.status, 200); assert.deepEqual(JSON.parse(me.body), { ok: true, mode: 'google', authenticated: false, allowed: false });
  assert.equal(live.status, 401); assert.equal(DATA.test(live.body), false);
  assert.equal(demo.status, 401); assert.equal(DATA.test(demo.body), false);
  assert.equal(login.status, 302);
  const u = new URL(login.location);
  assert.equal(`${u.origin}${u.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('redirect_uri'), `${ORIGIN}/auth/callback`);
  assert.match(log, /allowlist from NIKUSHO_ALLOWLIST_JSON/);
  assert.equal(log.includes('allowed.viewer'), false, 'e-mails are not logged'); assert.equal(log.includes(SECRET), false);
});

test('VERCEL-2 values pasted with spaces / line breaks still work', () => {
  const env = { NIKUSHO_AUTH: ' google\n', NIKUSHO_PUBLIC_ORIGIN: ` ${ORIGIN}/ \n`, GOOGLE_OAUTH_CLIENT_ID: ' cid ', GOOGLE_OAUTH_CLIENT_SECRET: `${SECRET}\n`, NIKUSHO_ALLOWLIST_JSON: `\n${ENV_LIST}\n` };
  const { results } = runWrapper(env, ['/auth/me']);
  assert.equal(results[0].status, 200);
  const c = loadAuthConfig(env);
  assert.equal(c.publicOrigin, ORIGIN); assert.equal(c.google.clientSecret, SECRET); assert.equal(c.redirectUri, `${ORIGIN}/auth/callback`);
});

test('VERCEL-3 misconfigured deployment refuses every request with 503 and no data (never crashes, never serves)', () => {
  for (const [env, expect] of [
    [{ ...BASE_ENV, NIKUSHO_AUTH: undefined }, /NIKUSHO_AUTH must be set to google/],
    [{ ...BASE_ENV, NIKUSHO_AUTH: 'magic' }, /NIKUSHO_AUTH must be one of/],
    [{ ...BASE_ENV }, /NIKUSHO_ALLOWLIST_JSON \(or NIKUSHO_ALLOWLIST_FILE\)/],
    [{ ...BASE_ENV, GOOGLE_OAUTH_CLIENT_ID: '', NIKUSHO_ALLOWLIST_JSON: ENV_LIST }, /GOOGLE_OAUTH_CLIENT_ID/],
    [{ ...BASE_ENV, NIKUSHO_PUBLIC_ORIGIN: 'https://demo-test.vercel.app/app', NIKUSHO_ALLOWLIST_JSON: ENV_LIST }, /origin only/],
  ]) {
    const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined));
    const { results, log } = runWrapper(clean, ['/auth/me', '/api/live/entry', '/auth/login']);
    for (const r of results) {
      assert.equal(r.status, 503, `${r.p} ${expect}`); assert.deepEqual(JSON.parse(r.body), { ok: false, error: 'server not configured' });
      assert.equal(r.location, null);
    }
    assert.match(log, expect);
    assert.equal(log.includes(SECRET), false, 'secret value never logged');
  }
});

test('VERCEL-4 NIKUSHO_ALLOWLIST_JSON: exact listed accounts only, invalid value denies everyone, it wins over the file', () => {
  const logs = [];
  const l = createEnvAllowlist(ENV_LIST, { log: (m) => logs.push(m) });
  assert.equal(l.check(ALLOWED).allowed, true, 'case-insensitive e-mail');
  assert.equal(l.check(OTHER).allowed, false);
  assert.equal(l.check({ email: ALLOWED.email }).allowed, false, 'no verified Google id -> deny');
  for (const bad of ['', '{', '[]', '{"viewers":[{"email":"a@example.com"}]}', '{"viewers":[{"email":"a@example.com","active":true,"role":"admin"}]}', undefined]) {
    const x = createEnvAllowlist(bad, { log: (m) => logs.push(m) });
    assert.equal(x.check(ALLOWED).allowed, false, `bad value ${bad}`);
  }
  assert.equal(logs.join('\n').includes('allowed.viewer'), false, 'e-mails are not logged');
  const c = loadAuthConfig({ ...BASE_ENV, NIKUSHO_ALLOWLIST_JSON: ENV_LIST, NIKUSHO_ALLOWLIST_FILE: 'config/allowlist.json' });
  assert.equal(c.allowlistJson, ENV_LIST);
  assert.equal(createGoogleAuth(c, { log: () => {} }).allowlist.kind, 'env');
  assert.equal(createGoogleAuth(loadAuthConfig({ ...BASE_ENV, NIKUSHO_ALLOWLIST_FILE: 'x.json' }), { log: () => {} }).allowlist.kind, 'file');
  assert.throws(() => loadAuthConfig(BASE_ENV), AuthConfigError);
});

// ---- full sign-in through the same composition with the allowlist from the environment (local test IdP)
let fake; let server; let port;
const call = (path, cookie) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, headers: { Host: HOST, ...(cookie ? { Cookie: cookie } : {}) } }, (res) => {
    let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject); req.end();
});
before(async () => {
  fake = await startFakeGoogle({ clientId: 'cid', clientSecret: SECRET, now: Date.now });
  const config = loadAuthConfig({ ...BASE_ENV, NIKUSHO_ALLOWLIST_JSON: ENV_LIST });
  const auth = createGoogleAuth(config, { provider: createGoogleProvider({ clientId: 'cid', clientSecret: SECRET, endpoints: fake.endpoints }), log: () => {} });
  server = createServer({ live: createDevMockAdapter(), demo: createDemoAdapter(), auth });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(async () => { server.close(); await fake.close(); });

async function signIn(who) {
  const start = await call('/auth/login?return=/');
  const p = new URL(start.headers.location).searchParams;
  const flow = start.headers['set-cookie'][0].split(';')[0];
  assert.match(flow, /^__Host-nikusho_login=/, 'https origin -> __Host- cookie');
  const code = fake.issueCode({ ...who, nonce: p.get('nonce'), codeChallenge: p.get('code_challenge'), redirectUri: p.get('redirect_uri') });
  const cb = await call(`/auth/callback?code=${code}&state=${p.get('state')}`, flow);
  const sid = (cb.headers['set-cookie'] ?? []).find((c) => c.startsWith('__Host-nikusho_sid='));
  assert.ok(sid, 'session cookie'); assert.match(sid, /Secure/); assert.match(sid, /HttpOnly/); assert.match(sid, /SameSite=Strict/);
  return sid.split(';')[0];
}

test('VERCEL-5 listed account signs in and sees the dashboard; an unlisted account signs in and gets nothing', async () => {
  const ok = await signIn(ALLOWED);
  for (const r of ['/api/live/entry', '/api/demo/entry', '/api/live/failures']) assert.equal((await call(r, ok)).status, 200, r);
  assert.deepEqual(JSON.parse((await call('/auth/me', ok)).body), { ok: true, mode: 'google', authenticated: true, allowed: true, email: ALLOWED.email });

  const no = await signIn(OTHER);
  for (const r of ['/api/live/entry', '/api/demo/entry']) {
    const res = await call(r, no);
    assert.equal(res.status, 403, r); assert.equal(DATA.test(res.body), false);
  }
  assert.equal(JSON.parse((await call('/auth/me', no)).body).allowed, false);
  const out = await call('/auth/logout', ok);
  assert.equal(out.status, 302);
  assert.equal((await call('/api/live/entry', ok)).status, 401, 'logged out');
});

test('VERCEL-6 vercel.json serves only public/ as static files and routes /auth and /api to the entry', () => {
  const v = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(v.outputDirectory, 'public');
  assert.deepEqual(v.rewrites.map((r) => [r.source, r.destination]).sort(), [['/api/:path*', '/api/server'], ['/auth/:path*', '/api/server']]);
  const h = Object.fromEntries(v.headers[0].headers.map((x) => [x.key, x.value]));
  assert.match(h['Content-Security-Policy'], /default-src 'self'/); assert.equal(h['X-Frame-Options'], 'DENY');
});
