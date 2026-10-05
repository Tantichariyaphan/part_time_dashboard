// Security verification: methods, access control, exposure, outbound traffic, rendering. Synthetic data only.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server/index.js';
import { createDevLoopbackGate } from '../server/auth/gate.js';
import { createDevMockAdapter } from '../src/adapters/mock/devMockAdapter.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';

let server; let port;
const call = (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
    let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject); req.end();
});
before(async () => {
  server = createServer({ live: createDevMockAdapter(), demo: createDemoAdapter(), gate: createDevLoopbackGate() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => server.close());

const RESOURCES = ['entry', 'all-stores', 'today?store=STORE_A', 'run?store=STORE_A&run_id=x', 'messages?store=STORE_A', 'questions?store=STORE_A', 'failures', 'machines', 'periods?days=7'];

test('only GET and HEAD are served; every other method is refused on API and static paths', async () => {
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT']) {
    for (const p of ['/api/live/entry', '/api/demo/failures', '/', '/app/main.js']) {
      const r = await call(p, { method: m }).catch(() => ({ status: 'closed' }));
      assert.ok(r.status === 405 || r.status === 'closed', `${m} ${p} -> ${r.status}`);
    }
  }
  assert.equal((await call('/api/live/entry', { method: 'HEAD' })).status, 200);
  assert.equal((await call('/api/live/entry', { method: 'HEAD' })).body, '');
});

test('unauthorized requests receive no data from ANY resource of either entry', async () => {
  for (const entry of ['live', 'demo']) {
    for (const res of RESOURCES) {
      const r = await call(`/api/${entry}/${res}`, { headers: { Host: 'attacker.example' } });
      assert.equal(r.status, 403, `${entry}/${res}`);
      assert.equal(/モック|デモ|STORE_|Staff|ทะเบียน/.test(r.body), false, `${entry}/${res} leaked`);
    }
  }
});

test('no CORS grant, no credentials sharing, API is never cached', async () => {
  const r = await call('/api/live/entry');
  assert.equal(r.headers['access-control-allow-origin'], undefined);
  assert.match(r.headers['cache-control'], /no-store/);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'DENY');
});

test('only the public UI is served: server code, source, docs and package files are not reachable', async () => {
  for (const p of ['/src/domain/time.js', '/server/index.js', '/package.json', '/docs/architecture.md', '/Claude.md', '/tests/api.test.js', '/src/adapters/demo/demoScreenData.json', '/..%2Fpackage.json', '/app/../../package.json']) {
    const r = await call(p);
    assert.notEqual(r.status, 200, p);
    assert.equal(/"type": "module"|NIKUSHO/.test(r.body) && r.status === 200, false, p);
  }
});

test('errors reveal no internals (no stack, no file paths)', async () => {
  for (const p of ['/api/live/today?store=NOPE', '/api/live/periods?days=abc', '/api/live/messages?store=STORE_A&date=2026-13-99x', '/api/x/y']) {
    const r = await call(p);
    assert.equal(/\/home\/|node:|at .*\(|\.js:\d+/.test(r.body), false, p);
  }
});

test('API responses contain none of the fields the Read Copy must never carry', async () => {
  for (const entry of ['live', 'demo']) {
    for (const res of RESOURCES.filter((x) => !x.startsWith('run?'))) {
      const body = (await call(`/api/${entry}/${res}`)).body;
      assert.equal(/userId|宛先ID|画像URL|"image_url"|グループID/.test(body), false, `${entry}/${res}`);
      assert.equal(/\b[UCR][0-9a-f]{32}\b/.test(body), false, `${entry}/${res} LINE-style id`);
      assert.equal(/https?:\/\//.test(body), false, `${entry}/${res} URL`);
    }
  }
});

test('nothing in the server, domain or UI can send registry text to another host', () => {
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p.split('\\').join('/')]; });
  const root = fileURLToPath(new URL('..', import.meta.url));
  for (const f of ['server', 'src', 'public', 'scripts', 'api'].flatMap((d) => walk(join(root, d))).filter((x) => x.endsWith('.js'))) {
    const t = readFileSync(f, 'utf8');
    assert.equal(/node:(https|net|tls|dgram|dns|child_process|worker_threads|cluster)|from 'https?'|require\(/.test(t), false, `${f} imports a network/process module`);
    assert.equal(/\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|sendBeacon|navigator\.|importScripts/.test(t), false, `${f} uses a browser network channel`);
  }
  // the only fetches in the UI target this origin: /api/{entry}/... and /auth/me (Auth Prototype, no data)
  const api = readFileSync(join(root, 'public/app/lib/api.js'), 'utf8');
  const fetches = api.match(/fetch\([^)]*\)/g) ?? [];
  assert.ok(fetches.length >= 1 && fetches.every((x) => /^fetch\(url,/.test(x)), fetches.join(' | '));
  const targets = [...api.matchAll(/const url = ([^;]+);/g)].map((m) => m[1].trim());
  assert.deepEqual(targets.sort(), ["'/auth/me'", '`/api/${entryName()}/${resource}${q.size ? `?${q}` : \'\'}`'].sort());
  assert.equal(/https?:\/\//.test(api), false);
  for (const f of walk(join(root, 'public'))) assert.equal(/fetch\(/.test(readFileSync(f, 'utf8')) && !f.endsWith('/public/app/lib/api.js'), false, `${f} fetches`);
  // Server side: the only outbound call is the Google OIDC provider, which imports no registry/Screen Data code.
  for (const f of ['server', 'src', 'api'].flatMap((d) => walk(join(root, d))).filter((x) => x.endsWith('.js'))) {
    const t = readFileSync(f, 'utf8');
    if (f.endsWith('/server/auth/google.js')) {
      assert.equal(/from '\.\.\/\.\.\/src|from '\.\.\/api|adapters|viewmodels/.test(t), false, 'google.js must not import data code');
      assert.ok((t.match(/fetchImpl\(/g) ?? []).length === 2, 'google.js: exactly two outbound calls (JWKS, token)');
      assert.ok(/fetchImpl\(endpoints\.jwks/.test(t) && /fetchImpl\(endpoints\.token/.test(t));
    } else {
      assert.equal(/\bfetch\s*\(|fetchImpl/.test(t), false, `${f} makes an outbound request`);
    }
  }
});

test('the dev gate is loopback-only; nothing binds beyond 127.0.0.1 by default', () => {
  const idx = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(idx, /HOST \?\? '127\.0\.0\.1'/);
});

test('regression: only declared resources are routes (no prototype-chain names), and the raw context is never returned', async () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '__defineGetter__']) {
    const r = await call(`/api/live/${name}`);
    assert.equal(r.status, 404, name);
    assert.equal(/"screen"|"issues"|"validation"|"adapterKind"/.test(r.body), false, `${name} leaked internals`);
  }
});

test('regression: impossible calendar dates are rejected instead of shown as an empty/"not pulled" day', async () => {
  for (const d of ['2026-13-99', '2026-02-30', '2026-00-10', '2026-04-31']) assert.equal((await call(`/api/live/messages?store=STORE_A&date=${d}`)).status, 400, d);
  assert.equal((await call('/api/live/messages?store=STORE_A&date=2026-02-28')).status, 200);
});
