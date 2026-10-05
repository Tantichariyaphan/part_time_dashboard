import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../server/index.js';
import { createDevLoopbackGate, assertGateMatchesAdapters } from '../server/auth/gate.js';
import { createDevMockAdapter } from '../src/adapters/mock/devMockAdapter.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';
import { createNoneAdapter } from '../src/adapters/none/noneAdapter.js';

let server; let port;
const call = (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
    let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject); req.end();
});
const json = async (path) => { const r = await call(path); return { ...r, json: JSON.parse(r.body) }; };

before(async () => {
  server = createServer({ live: createDevMockAdapter(), demo: createDemoAdapter(), gate: createDevLoopbackGate() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => server.close());

test('read-only: every method except GET/HEAD is refused', async () => {
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await call('/api/live/entry', { method: m })).status, 405, m);
});

test('server-side gate: foreign Host header gets nothing', async () => {
  const r = await call('/api/live/entry', { headers: { Host: 'evil.example' } });
  assert.equal(r.status, 403);
  assert.equal(r.body.includes('stores'), false);
});

test('all seven pages have an API resource, each wrapped in the envelope', async () => {
  const paths = ['entry', 'all-stores', 'today?store=STORE_A', 'messages?store=STORE_A', 'questions?store=STORE_A', 'failures', 'machines', 'periods?days=7'];
  for (const p of paths) {
    const { status, json: j } = await json(`/api/live/${p}`);
    assert.equal(status, 200, p);
    assert.equal(j.ok, true, p);
    assert.ok('freshness' in j && 'now' in j && 'data' in j, p);
  }
});

test('bad input is rejected, unknown store is 404, unknown resource is 404', async () => {
  assert.equal((await call('/api/live/periods?days=5')).status, 400);
  assert.equal((await call('/api/live/today?store=NOPE')).status, 404);
  assert.equal((await call('/api/live/anything')).status, 404);
  assert.equal((await call('/api/other/entry')).status, 404);
});

test('NOT CONNECTED stores are reported as such and carry no figures', async () => {
  const { json: j } = await json('/api/live/all-stores');
  const nc = j.data.stores.filter((s) => s.connection === 'not_connected');
  assert.ok(nc.length >= 1);
  for (const s of nc) assert.equal('metrics' in s || 'patrol' in s, false);
});

test('demo entry is its own dataset, frozen in time, labelled as demo', async () => {
  const a = (await json('/api/demo/entry')).json;
  const b = (await json('/api/demo/entry')).json;
  assert.equal(a.entry, 'demo');
  assert.equal(a.now, b.now);
  assert.match(a.now, /^2026-10-02T13:50:00\+07:00$/);
  assert.equal(a.data.adapterKind, 'demo');
});

test('the live entry never serves demo data and vice versa', async () => {
  const live = JSON.stringify((await json('/api/live/entry')).json.data.stores.map((s) => s.display_name));
  const demo = JSON.stringify((await json('/api/demo/entry')).json.data.stores.map((s) => s.display_name));
  assert.ok(live.includes('モック') && !live.includes('デモ'));
  assert.ok(demo.includes('デモ') && !demo.includes('モック'));
});

test('both HTML entries exist; the demo page is labelled', async () => {
  const live = await call('/'); const demo = await call('/demo/');
  assert.equal(live.status, 200); assert.equal(demo.status, 200);
  assert.match(demo.body, /สาธิต/);
  assert.match(demo.body, /data-entry="demo"/);
  assert.match(live.body, /data-entry="live"/);
});

test('security headers: CSP forbids inline script and external sources', async () => {
  const r = await call('/');
  const csp = r.headers['content-security-policy'];
  assert.ok(csp && csp.includes("default-src 'self'"));
  assert.equal(csp.includes("'unsafe-inline'"), false);
});

test('path traversal cannot leave public/', async () => {
  assert.notEqual((await call('/app/../../package.json')).status, 200);
  assert.notEqual((await call('/app/%2e%2e/%2e%2e/package.json')).status, 200);
});

test('startup is refused when the dev gate would front a non-synthetic adapter', () => {
  const gate = createDevLoopbackGate();
  assert.throws(() => assertGateMatchesAdapters(gate, [{ kind: 'real-source' }]), /Refusing to start/);
  assert.doesNotThrow(() => assertGateMatchesAdapters(gate, [createNoneAdapter(), createDemoAdapter(), createDevMockAdapter()]));
});

test('adapter "none" stops the screen instead of showing numbers', async () => {
  const s2 = createServer({ live: createNoneAdapter(), demo: createDemoAdapter(), gate: createDevLoopbackGate() });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r));
  const p = s2.address().port;
  const body = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: p, path: '/api/live/entry' }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve(JSON.parse(b))); }));
  s2.close();
  assert.equal(body.freshness.state, 'stopped');
});
