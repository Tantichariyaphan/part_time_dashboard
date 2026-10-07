// Reader / configuration / server wiring of the View-only Copy connector. Synthetic only; no network: the Google
// Sheets API is replaced by an in-process fake. Nothing here proves access to the client's real files (Q-48).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheetsReader } from '../server/source/sheetsReader.js';
import { loadSourceConfig, SourceConfigError } from '../server/source/config.js';
import { chooseLiveAdapter, createServer } from '../server/index.js';
import { createApi } from '../server/api.js';
import { grant } from '../server/auth/authorize.js';
import { assertGateMatchesAdapters, createDevLoopbackGate } from '../server/auth/gate.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';
import { createCopyAdapter } from '../src/adapters/copy/copyAdapter.js';
import { COPY_TAB, HEARTBEAT_TAB } from '../src/contract/copyContract.js';
import { copyRead, heartbeatRead, NOW, testConfig } from './copyFixtures.js';
import { store as storeRow, schedules as scheduleRows } from './helpers.js';

const COPY_ID = 'TESTCOPYID_aaaaaaaaaaaaaaaaaaaa';
const HB_ID = 'TESTHBID_bbbbbbbbbbbbbbbbbbbbbbbb';
const TOKEN = 'reader-token-for-tests-only';
const storesJson = JSON.stringify({ stores: [storeRow({ production_host: 'h1' })], schedules: scheduleRows });
const env = (over = {}) => ({ NIKUSHO_LIVE_ADAPTER: 'copy', NIKUSHO_COPY_SPREADSHEET_ID: COPY_ID, NIKUSHO_HEARTBEAT_SPREADSHEET_ID: HB_ID,
  NIKUSHO_COPY_STORE: 'S', NIKUSHO_STORES_JSON: storesJson, ...over });

/** Fake Google Sheets API: serves synthetic reads per spreadsheet id and records every request. */
function fakeSheets(files) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const u = new URL(url);
    const m = /^\/v4\/spreadsheets\/([^/]+)(\/values:batchGet)?$/.exec(u.pathname);
    const file = m && files[decodeURIComponent(m[1])];
    if (!file) return { ok: false, status: 404, json: async () => ({}) };
    if (!m[2]) return { ok: true, status: 200, json: async () => ({ sheets: file.titles.map((title) => ({ properties: { title } })) }) };
    const ranges = u.searchParams.getAll('ranges').map((r) => { const head = r.endsWith('!1:1'); const t = (head ? r.slice(0, -4) : r).slice(1, -1).replace(/''/g, "'"); return { t, head }; });
    return { ok: true, status: 200, json: async () => ({ valueRanges: ranges.map(({ t, head }) => ({ values: head ? [file.tables[t].header] : [file.tables[t].header, ...file.tables[t].rows] })) }) };
  };
  return { fetchImpl, calls };
}

// ------------------------------------------------------------------ reader
test('READER-1 without configuration or reader account the reader is NOT_CONNECTED; a bad id is refused without echoing it', () => {
  assert.deepEqual({ ...createSheetsReader({ spreadsheetId: null, tabs: ['ログ'] }) }, { connected: false, reason: 'not_configured' });
  assert.deepEqual({ ...createSheetsReader({ spreadsheetId: COPY_ID, tabs: ['ログ'] }) }, { connected: false, reason: 'reader_account_pending' });
  assert.throws(() => createSheetsReader({ spreadsheetId: '../../etc', tabs: [], getAccessToken: async () => TOKEN }), (e) => !e.message.includes('../../etc'));
});

test('READER-2 GET only, fixed Sheets API host, configured id only, contract tabs only; the token travels in the header only', async () => {
  const read = copyRead();
  const { fetchImpl, calls } = fakeSheets({ [COPY_ID]: read });
  const reader = createSheetsReader({ spreadsheetId: COPY_ID, tabs: Object.values(COPY_TAB), getAccessToken: async () => TOKEN, fetchImpl });
  const got = await reader.read();
  assert.equal(calls.length, 3, 'tab list, header rows, then full rows');
  for (const c of calls) {
    assert.equal(c.init.method, 'GET');
    assert.equal(c.init.body, undefined);
    assert.equal(c.init.redirect, 'error');
    assert.ok(c.url.startsWith(`https://sheets.googleapis.com/v4/spreadsheets/${COPY_ID}`), c.url);
    assert.equal(c.url.includes(TOKEN), false);
    assert.equal(c.init.headers.Authorization, `Bearer ${TOKEN}`);
  }
  assert.deepEqual(new URL(calls[1].url).searchParams.getAll('ranges'), Object.values(COPY_TAB).map((t) => `'${t}'!1:1`));
  assert.deepEqual(new URL(calls[2].url).searchParams.getAll('ranges'), Object.values(COPY_TAB).map((t) => `'${t}'`));
  assert.equal(new URL(calls[2].url).searchParams.get('valueRenderOption'), 'FORMATTED_VALUE');
  assert.deepEqual(got.tables['ログ'].header, read.tables['ログ'].header);
  assert.equal(got.tables['ログ'].rows.length, read.tables['ログ'].rows.length);
});

test('READER-3 a tab missing from the file is not requested (the contract check reports it)', async () => {
  const read = copyRead(); read.titles = read.titles.filter((t) => t !== '心拍'); delete read.tables['心拍'];
  const { fetchImpl, calls } = fakeSheets({ [COPY_ID]: read });
  const got = await createSheetsReader({ spreadsheetId: COPY_ID, tabs: Object.values(COPY_TAB), getAccessToken: async () => TOKEN, fetchImpl }).read();
  assert.equal(calls.slice(1).some((c) => new URL(c.url).searchParams.getAll('ranges').some((r) => r.startsWith("'心拍'"))), false);
  assert.equal(got.tables['心拍'], undefined);
});

test('READER-4 failures become short codes; neither the token nor the URL is in the error', async () => {
  const cases = [
    [async () => { throw new Error(`boom ${TOKEN}`); }, 'network'],
    [async () => ({ ok: false, status: 403, json: async () => ({}) }), 'http_403'],
    [async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }), 'bad_response'],
    [async () => ({ ok: true, status: 200, json: async () => ({ nope: 1 }) }), 'bad_response'],
  ];
  for (const [fetchImpl, code] of cases) {
    const reader = createSheetsReader({ spreadsheetId: COPY_ID, tabs: ['ログ'], getAccessToken: async () => TOKEN, fetchImpl });
    await assert.rejects(reader.read(), (e) => e.code === code && !e.message.includes(TOKEN) && !e.message.includes(COPY_ID));
  }
  const noToken = createSheetsReader({ spreadsheetId: COPY_ID, tabs: ['ログ'], getAccessToken: async () => { throw new Error(TOKEN); }, fetchImpl: async () => { throw new Error('must not be called'); } });
  await assert.rejects(noToken.read(), (e) => e.code === 'token_unavailable' && !e.message.includes(TOKEN));
});

// ------------------------------------------------------------------ configuration
test('CONFIG-1 server-side configuration: ids, store and stores JSON from the environment; errors never echo values', () => {
  const c = loadSourceConfig(env());
  assert.equal(c.copySpreadsheetId, COPY_ID);
  assert.equal(c.heartbeatSpreadsheetId, HB_ID);
  assert.equal(c.adapter.store, 'S');
  assert.equal(c.adapter.timezone, null);
  const bad = (over, re) => assert.throws(() => loadSourceConfig(env(over)), (e) => e instanceof SourceConfigError && re.test(e.message) && !e.message.includes('VALUE-NOT-ECHOED'));
  bad({ NIKUSHO_COPY_SPREADSHEET_ID: 'VALUE-NOT-ECHOED/..' }, /NIKUSHO_COPY_SPREADSHEET_ID/);
  bad({ NIKUSHO_HEARTBEAT_SPREADSHEET_ID: COPY_ID }, /two different files/);
  bad({ NIKUSHO_STORES_JSON: '' }, /NIKUSHO_STORES_JSON/);
  bad({ NIKUSHO_STORES_JSON: '{VALUE-NOT-ECHOED' }, /not valid JSON/);
  bad({ NIKUSHO_COPY_STORE: '' }, /NIKUSHO_COPY_STORE/);
  bad({ NIKUSHO_COPY_STORE: 'VALUE-NOT-ECHOED' }, /not one of the configured stores/);
  bad({ NIKUSHO_COPY_TIMEZONE: 'Mars/VALUE-NOT-ECHOED' }, /NIKUSHO_COPY_TIMEZONE/);
  bad({ NIKUSHO_STORES_JSON: JSON.stringify({ stores: [storeRow({ active: 'maybe' })], schedules: [] }) }, /stores\.active/);
  bad({ NIKUSHO_STORES_JSON: JSON.stringify({ stores: [{ store: 'S' }], schedules: [] }) }, /need columns/);
});

test('CONFIG-2 ids are optional: without them each file is NOT_CONNECTED (nothing is assumed about hosting or accounts)', async () => {
  const live = chooseLiveAdapter(env({ NIKUSHO_COPY_SPREADSHEET_ID: '', NIKUSHO_HEARTBEAT_SPREADSHEET_ID: '' }));
  const r = await live.load();
  assert.equal(r.sources.copy.reason, 'not_configured');
  assert.equal(r.sources.heartbeat.reason, 'not_configured');
});

// ------------------------------------------------------------------ server wiring
test('SERVER-1 NIKUSHO_LIVE_ADAPTER=copy today: both readers NOT_CONNECTED (reader account pending, Q-48); no id reaches the output', async () => {
  const live = chooseLiveAdapter(env());
  assert.equal(live.kind, 'copy');
  const r = await live.load();
  assert.deepEqual([r.sources.copy.state, r.sources.copy.reason], ['NOT_CONNECTED', 'reader_account_pending']);
  assert.deepEqual([r.sources.heartbeat.state, r.sources.heartbeat.reason], ['NOT_CONNECTED', 'reader_account_pending']);
  assert.equal(JSON.stringify(r).includes(COPY_ID) || JSON.stringify(r).includes(HB_ID), false);
  assert.equal(chooseLiveAdapter({}).kind, 'devmock', 'mock stays the default; copy is opt-in');
  assert.throws(() => chooseLiveAdapter({ NIKUSHO_LIVE_ADAPTER: 'sheet' }), /devmock, none, copy/);
});

test('SERVER-2 the copy adapter carries real data: refused behind the dev gate (needs Google sign-in + allowlist)', () => {
  const live = chooseLiveAdapter(env());
  assert.throws(() => assertGateMatchesAdapters(createDevLoopbackGate(), [live]), /Refusing to start/);
  assert.throws(() => createServer({ live, demo: createDemoAdapter(), gate: createDevLoopbackGate() }), /Refusing to start/);
});

test('SERVER-3 API over a connected copy: no read before authorization; the browser cannot choose a file; no ids or keys in responses', async () => {
  const { fetchImpl, calls } = fakeSheets({ [COPY_ID]: copyRead(), [HB_ID]: heartbeatRead() });
  const live = chooseLiveAdapter(env(), { getAccessToken: async () => TOKEN });
  // swap in the fake transport while keeping the server-side configuration path
  const cfg = loadSourceConfig(env());
  const adapter = createCopyAdapter({
    config: cfg.adapter, now: () => NOW, minReadIntervalMs: 0, log: () => {},
    copyReader: createSheetsReader({ spreadsheetId: cfg.copySpreadsheetId, tabs: Object.values(COPY_TAB), getAccessToken: async () => TOKEN, fetchImpl }),
    heartbeatReader: createSheetsReader({ spreadsheetId: cfg.heartbeatSpreadsheetId, tabs: Object.values(HEARTBEAT_TAB), getAccessToken: async () => TOKEN, fetchImpl }),
  });
  assert.equal(live.kind, adapter.kind);
  const api = createApi({ live: adapter, demo: createDemoAdapter() });
  const denied = await api({ allowed: true }, 'live', 'entry', new URLSearchParams());
  assert.equal(denied.status, 403);
  assert.equal(calls.length, 0, 'nothing is read for an unauthorized request');

  const q = new URLSearchParams({ store: 'S', spreadsheetId: 'ATTACKERCHOSENID_xxxxxxxxxxxx', tab: '予約', range: 'A1:Z' });
  const out = [];
  for (const res of ['entry', 'all-stores', 'messages', 'questions', 'failures', 'machines', 'periods']) {
    const r = await api(grant('viewer@example.invalid'), 'live', res, q);
    assert.equal(r.status, 200, res);
    out.push(JSON.stringify(r.body));
  }
  const body = out.join('\n');
  assert.ok(calls.every((c) => !c.url.includes('ATTACKERCHOSENID') && !c.url.includes(encodeURIComponent("'予約'"))), 'request parameters never reach the reader');
  assert.ok(calls.every((c) => c.url.includes(COPY_ID) || c.url.includes(HB_ID)), 'only the two configured files are read');
  assert.equal(/TESTCOPYID|TESTHBID|reader-token|K-0001|D-0001|TESTGRP-|userId|宛先ID|画像URL/.test(body), false);
  assert.match(body, /"sources":\{"copy":\{"state":"CONNECTED"/);
});

test('READER-5 defence in depth: a file that is not the copy is refused before any cell is read; a refused header keeps its rows unread', async () => {
  const opts = { tabs: Object.values(COPY_TAB), requiredTabs: ['meta'], exactTabs: true, refuseHeaders: ['userId', '宛先ID', '画像URL'], getAccessToken: async () => TOKEN };
  const extra = copyRead(); extra.titles.push('予約');
  let f = fakeSheets({ [COPY_ID]: extra });
  await assert.rejects(createSheetsReader({ ...opts, spreadsheetId: COPY_ID, fetchImpl: f.fetchImpl }).read(), (e) => e.code === 'unexpected_tabs');
  assert.equal(f.calls.length, 1, 'only the tab list was requested');
  const noMeta = copyRead(); noMeta.titles = noMeta.titles.filter((t) => t !== 'meta');
  f = fakeSheets({ [COPY_ID]: noMeta });
  await assert.rejects(createSheetsReader({ ...opts, spreadsheetId: COPY_ID, fetchImpl: f.fetchImpl }).read(), (e) => e.code === 'required_tab_missing');
  assert.equal(f.calls.length, 1);
  // a tab whose header carries a refused field: header read, rows never downloaded, the contract check blocks it
  const leaky = copyRead(); leaky.tables['ログ'].header.push('userId'); leaky.tables['ログ'].rows.forEach((r) => r.push('LEAK-MARKER'));
  f = fakeSheets({ [COPY_ID]: leaky });
  const got = await createSheetsReader({ ...opts, spreadsheetId: COPY_ID, fetchImpl: f.fetchImpl }).read();
  assert.deepEqual(got.tables['ログ'].rows, []);
  assert.equal(new URL(f.calls[2].url).searchParams.getAll('ranges').includes("'ログ'"), false);
  assert.equal(JSON.stringify(got).includes('LEAK-MARKER'), false);
  const adapter = createCopyAdapter({ config: testConfig(), now: () => NOW, minReadIntervalMs: 0, log: () => {},
    copyReader: { connected: true, read: async () => got }, heartbeatReader: { connected: false, reason: 'x' } });
  const r = await adapter.load();
  assert.equal(r.sources.copy.tabs.find((t) => t.tab === 'ログ').state, 'blocked');
});

test('READER-6 a token source that never answers fails with a code instead of hanging every request', async () => {
  const reader = createSheetsReader({ spreadsheetId: COPY_ID, tabs: ['meta'], getAccessToken: () => new Promise(() => {}), timeoutMs: 30, fetchImpl: async () => { throw new Error('not called'); } });
  await assert.rejects(reader.read(), (e) => e.code === 'token_unavailable');
});
