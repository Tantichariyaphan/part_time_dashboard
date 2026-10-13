// Production = live data only (server/liveSource.js, api/server.js). The live entry never shows mock or demo data; a missing or
// failing source is a connection/error state; the demo entry stays available separately. Synthetic data only, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseLiveAdapter, isProduction } from '../server/index.js';
import { createProductionLiveAdapter, BUNDLED_STORES_FILE } from '../server/liveSource.js';
import { loadSourceConfig } from '../server/source/config.js';
import { createApi } from '../server/api.js';
import { grant } from '../server/auth/authorize.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';
import { S } from '../public/app/strings.ja.js';
import { copyRead, heartbeatRead, memoryReader, metaRow, NOW } from './copyFixtures.js';
import { store as storeRow, schedules as scheduleRows } from './helpers.js';

const PROD = { NIKUSHO_DEPLOYMENT: 'production' };
const COPY_ID = 'TESTCOPYID_aaaaaaaaaaaaaaaaaaaa';
const HB_ID = 'TESTHBID_bbbbbbbbbbbbbbbbbbbbbbbb';
const storesJson = JSON.stringify({ stores: [storeRow({ production_host: 'h1' })], schedules: scheduleRows });
const srcEnv = (over = {}) => ({ ...PROD, NIKUSHO_COPY_SPREADSHEET_ID: COPY_ID, NIKUSHO_HEARTBEAT_SPREADSHEET_ID: HB_ID, NIKUSHO_COPY_STORE: 'S', NIKUSHO_STORES_JSON: storesJson, NIKUSHO_COPY_TIMEZONE: 'Asia/Bangkok', ...over });
// strings that only the dev mock or the demo snapshot contain
const MOCK = /STORE_A|STORE_B|STORE_C|mock-host|DUMMY-|dummy-|devmock|"adapterKind":"demo"/;
const RESOURCES = ['entry', 'all-stores', 'today', 'messages', 'questions', 'failures', 'machines', 'periods'];
const silent = () => {};

async function liveBodies(live) {
  const api = createApi({ live, demo: createDemoAdapter() });
  const out = {};
  for (const r of RESOURCES) {
    const q = new URLSearchParams(r === 'today' || r === 'messages' || r === 'questions' ? { store: 'S' } : {});
    const res = await api(grant('viewer@example.invalid'), 'live', r, q);
    out[r] = res;
  }
  return out;
}

test('LIVE-1 production is detected on Vercel or with NIKUSHO_DEPLOYMENT=production; development keeps the dev mock as default', () => {
  assert.equal(isProduction({ VERCEL: '1' }), true);
  assert.equal(isProduction(PROD), true);
  assert.equal(isProduction({}), false);
  assert.equal(chooseLiveAdapter({}).kind, 'devmock', 'local development unchanged');
  assert.notEqual(chooseLiveAdapter({ VERCEL: '1' }, { log: silent }).kind, 'devmock');
});

test('LIVE-2 production without any source configuration: live entry = client copy NOT CONNECTED, no mock data, stopped banner', async () => {
  const live = chooseLiveAdapter({ ...PROD }, { log: silent });
  assert.equal(live.kind, 'copy');
  const res = await liveBodies(live);
  for (const [r, x] of Object.entries(res)) {
    assert.ok([200, 404].includes(x.status), `${r} ${x.status}`);
    assert.equal(MOCK.test(JSON.stringify(x.body)), false, `${r} carries mock/demo data`);
  }
  const entry = res.entry.body;
  assert.equal(entry.data.adapterKind, 'copy');
  assert.equal(entry.data.sources.copy.state, 'NOT_CONNECTED');
  assert.equal(entry.freshness.state, 'stopped');
  assert.deepEqual(res['all-stores'].body.data.stores.map((s) => [s.store, s.connection]), [['NIKUSHO_BANGNA', 'not_connected']], 'shipped stores, all 未接続');
});

test('LIVE-3 production refuses NIKUSHO_LIVE_ADAPTER=devmock / none / demo: an error state, never mock records', async () => {
  for (const which of ['devmock', 'none', 'demo']) {
    const logs = [];
    const live = chooseLiveAdapter(srcEnv({ NIKUSHO_LIVE_ADAPTER: which }), { log: (m) => logs.push(m) });
    assert.equal(live.kind, 'copy');
    assert.equal(live.unavailable, 'live_adapter_not_copy');
    const res = await liveBodies(live);
    assert.equal(MOCK.test(JSON.stringify(res)), false, which);
    assert.equal(res.entry.body.data.sources.copy.reason, 'live_adapter_not_copy');
    assert.deepEqual(res['all-stores'].body.data.stores.map((s) => [s.store, s.connection]), [['S', 'not_connected']]);
    assert.match(logs.join('\n'), /must be "copy"/);
  }
});

test('LIVE-4 production with a source that fails to read: ERROR state, no rows, nothing from fixtures', async () => {
  const cfg = loadSourceConfig(srcEnv());
  const failing = { connected: true, read: async () => { throw Object.assign(new Error('boom https://example.invalid/x'), { code: 'http_403' }); } };
  const live = createProductionLiveAdapter(srcEnv(), { readers: { cfg, copyReader: failing, heartbeatReader: failing }, log: silent, now: () => NOW });
  const res = await liveBodies(live);
  const all = JSON.stringify(res);
  assert.equal(MOCK.test(all), false);
  assert.equal(all.includes('example.invalid/x'), false, 'error messages never reach the API');
  assert.equal(res.entry.body.data.sources.copy.state, 'ERROR');
  assert.equal(res.entry.body.data.sources.copy.reason, 'http_403');
  assert.equal(res.entry.body.freshness.state, 'stopped');
  assert.equal(res.messages.body.data.items.length, 0);
});

test('LIVE-5 production with a readable copy: real rows only, freshness = copy last_read_at, run status not judged, ids from the source', async () => {
  const cfg = loadSourceConfig(srcEnv());
  const read = copyRead({ meta: ['ログ', '送信ログ', 'AI質問追跡', '心拍'].map((t) => metaRow(t, { last_read_at: '2026-10-07T13:55:00+07:00' })) });
  const ids = read.tables['ログ'].rows.map((r) => r[read.tables['ログ'].header.indexOf('messageId')]);
  const live = createProductionLiveAdapter(srcEnv(), { readers: { cfg, copyReader: memoryReader(read), heartbeatReader: memoryReader(heartbeatRead()) }, log: silent, now: () => NOW });
  const res = await liveBodies(live);
  assert.equal(MOCK.test(JSON.stringify(res)), false);
  assert.equal(res.entry.body.data.sources.copy.state, 'CONNECTED');
  assert.equal(res.entry.body.freshness.sourceThrough, '2026-10-07T13:55:00+07:00');
  assert.equal(res.entry.body.freshness.state, 'normal');
  const statuses = res.today.body.data.days.flatMap((d) => d.items.map((i) => i.status));
  assert.ok(statuses.length && statuses.every((s) => s === 'unconfirmed' || s === 'not_due'), 'run status stays 状態未判定');
  const shown = res.messages.body.data.items.map((m) => m.message_id);
  assert.ok(shown.every((id) => ids.includes(id) || /^ROW-\d+$/.test(id)), 'message ids come from the copy (or ROW-<n> for a damaged id)');
});

test('LIVE-6 the demo entry stays available and separate: demo data on /demo only, labelled, never on the live entry', async () => {
  const live = chooseLiveAdapter({ ...PROD }, { log: silent });
  const api = createApi({ live, demo: createDemoAdapter() });
  const demo = await api(grant('viewer@example.invalid'), 'demo', 'entry', new URLSearchParams());
  assert.equal(demo.status, 200);
  assert.equal(demo.body.entry, 'demo');
  assert.equal(demo.body.data.adapterKind, 'demo');
  const liveEntry = await api(grant('viewer@example.invalid'), 'live', 'entry', new URLSearchParams());
  assert.equal(liveEntry.body.data.adapterKind, 'copy');
  assert.match(S.demoStrip, /実データではありません/);
  assert.match(S.liveDownStrip('未接続', 'not_configured'), /モック・デモは表示しません/);
});

test('LIVE-7 the Vercel entry never wires the dev mock; production code never imports mock or demo fixtures', () => {
  const wrapper = readFileSync(new URL('../api/server.js', import.meta.url), 'utf8');
  const code = (t) => t.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.equal(/mock\/devMockAdapter|createDevMockAdapter|fixtures/.test(code(wrapper)), false);
  assert.match(code(wrapper), /NIKUSHO_DEPLOYMENT: 'production'/);
  const src = code(readFileSync(new URL('../server/liveSource.js', import.meta.url), 'utf8'));
  assert.equal(/adapters\/(mock|demo|none)/.test(src), false);
  assert.ok(BUNDLED_STORES_FILE.replace(/\\/g, '/').endsWith('config/stores.json'));
});

test('LIVE-8 credentials stay server-side: no key material, token, spreadsheet id or reader e-mail in any live response or log', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const key = JSON.stringify({ type: 'service_account', client_email: 'reader-test@example-project.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'kid-test' });
  const logs = [];
  const live = chooseLiveAdapter(srcEnv({ NIKUSHO_READER_KEY_JSON: key }), { getAccessToken: async () => { throw Object.assign(new Error('token endpoint said no'), { code: 'token_http_400' }); }, log: (m) => logs.push(m) });
  const all = JSON.stringify(await liveBodies(live)) + logs.join('\n');
  for (const leak of ['PRIVATE KEY', privateKey.slice(40, 80), 'reader-test@', 'kid-test', COPY_ID, HB_ID, 'token endpoint said no']) assert.equal(all.includes(leak), false, leak);
});

test('LIVE-9 a missing reader key is named precisely: no key variable vs a key FILE path that does not exist (JSON wins when both are set)', async () => {
  const none = await chooseLiveAdapter(srcEnv(), { log: silent }).load();
  assert.equal(none.sources.copy.state, 'NOT_CONNECTED');
  assert.equal(none.sources.copy.reason, 'reader_key_not_configured');
  const missingFile = await chooseLiveAdapter(srcEnv({ NIKUSHO_READER_KEY_FILE: '/nonexistent/nikusho-reader.json' }), { log: silent }).load();
  assert.equal(missingFile.sources.copy.reason, 'reader_key_file_not_found');
  assert.equal(JSON.stringify(missingFile).includes('/nonexistent/'), false, 'the path is never echoed');
  // both set: the JSON is the one used (an invalid JSON is a configuration error, never a silent fall-back to the file)
  const both = chooseLiveAdapter(srcEnv({ NIKUSHO_READER_KEY_FILE: '/nonexistent/nikusho-reader.json', NIKUSHO_READER_KEY_JSON: '{"type":"service_account"}' }), { log: silent });
  assert.equal(both.unavailable, 'source_config_invalid');
});

test('LIVE-10 a stalled Google API ends as an ERROR state inside the read time limit, not as a platform time-out', async () => {
  const started = Date.now();
  const live = createProductionLiveAdapter(srcEnv(), { getAccessToken: () => new Promise(() => {}), timeoutMs: 50, log: silent });
  const r = await live.load();
  assert.equal(r.sources.copy.state, 'ERROR');
  assert.equal(r.sources.copy.reason, 'token_unavailable');
  assert.ok(Date.now() - started < 2000);
});

test('LIVE-11 vercel.json: the function limit covers the worst read (token + 3 requests at the production time limit) and stays within the Hobby maximum', async () => {
  const { PRODUCTION_READ_TIMEOUT_MS } = await import('../server/liveSource.js');
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const fn = v.functions['api/server.js'];
  assert.ok(fn.maxDuration * 1000 >= 4 * PRODUCTION_READ_TIMEOUT_MS + 10_000, 'room for the worst read plus processing');
  assert.ok(fn.maxDuration <= 300, 'Hobby plan maximum (300 s)');
  assert.equal(fn.includeFiles, '{src,server,config}/**');
});

test('LIVE-12 .vercelignore keeps local secrets and client data out of any deployment upload, and keeps what the function needs', () => {
  const lines = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const must of ['.env', '.env.*', 'config/allowlist.json', 'config/reader-key*.json', '*.key.json', 'secrets/', 'Claude outputs/', `docs/sample ${'data'}_*/`]) assert.ok(lines.includes(must), must); // name split: COPY-28
  for (const keep of ['api', 'public', 'src', 'server', 'config', 'config/stores.json', 'package.json', 'vercel.json']) assert.equal(lines.some((l) => l.replace(/\/$/, '') === keep), false, keep);
});
