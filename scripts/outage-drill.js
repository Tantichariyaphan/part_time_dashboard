// Outage drill on a TEST CONNECTION: how long until the dashboard shows "更新停止" after the source stops, and how long until it
// is normal again after recovery. Production polling and the client's files are never touched.
//
//   node scripts/outage-drill.js --scenario copy-stops   [--clock real|fast] [--poll 30] [--json drill.json]
//   scenarios: copy-stops   the copy's meta.last_read_at stops advancing (Copy Script stopped; TV21)
//              access-lost  the Sheets API answers 403 (share removed; TV13 / TV18)
//              api-timeout  the Sheets API stops answering (network / Google outage)
//              bad-contract a required column disappears from ログ (TV13)
//
// Test connection = a synthetic View-only Copy (Data Contract v1 columns, invented rows) served by an in-process fake of the
// Google Sheets API. Everything after it is the dashboard's real code path, unchanged: Sheets reader (GET, time limit) ->
// contract check -> transform -> copy adapter (one read per minute) -> freshness rule -> read-only API.
// The test copy behaves like the client's Copy Script: every 5 minutes it reads (meta.last_read_at = now) and appends one row.
// --clock real  runs in wall-clock time (copy-stops takes about 35 minutes) - this is the run that goes into the report.
// --clock fast  simulates the same timeline in seconds (for the automated tests); it proves the logic, not the timing.
// Not covered: the Takatsuji notice (not built: channel Q-02, contact Q-47), the client's own Copy Script, the source sheet.
import { COPY_COLUMNS, COPY_TAB, ROW_ID } from '../src/contract/copyContract.js';
import { createCopyAdapter } from '../src/adapters/copy/copyAdapter.js';
import { createSheetsReader } from '../server/source/sheetsReader.js';
import { createApi } from '../server/api.js';
import { grant } from '../server/auth/authorize.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';
import { formatIso, businessDayOf } from '../src/domain/time.js';
import { BANNER_STALE_MINUTES, STOP_DETECTION_MAX_MINUTES } from '../src/domain/constants.js';
import { args, config, failure, isMain, table, writeJson } from './lib/diag.js';

export const SCENARIOS = Object.freeze(['copy-stops', 'access-lost', 'api-timeout', 'bad-contract']);
const TEST_ID = 'DRILLTESTCOPY_000000000000000000';
const MIN = 60_000;
const iso = (ms) => formatIso(ms);

/** Synthetic test copy (invented values only). */
function createTestCopy(store, startMs) {
  let seq = 0;
  const rows = { log: [], sendLog: [], questions: [], heartbeat: [] };
  const meta = {};
  const row = (key, values) => COPY_COLUMNS[key].map((c) => values[c] ?? '');
  const tables = () => {
    const t = {};
    for (const key of ['log', 'sendLog', 'questions', 'heartbeat']) t[COPY_TAB[key]] = { header: [...COPY_COLUMNS[key]], rows: rows[key] };
    t[COPY_TAB.meta] = { header: [...COPY_COLUMNS.meta], rows: Object.values(meta) };
    return t;
  };
  const copy = {
    running: true,
    brokenColumn: null,
    lastRead: null,
    lastRowId: null,
    /** One Copy Script run: append one message row, then stamp the read time. */
    runAt(ms) {
      seq += 1;
      const id = String(1000 + seq);
      rows.log.push(row('log', { [ROW_ID]: id, 日時: iso(ms - MIN), グループID: 'DRILLGRP-2c54ac', 群: 'MEAT', 発言者: 'Drill Sender', 発言者キー: 'K-DRILL', 種別: 'text', 内容: `drill message ${seq}`, messageId: `77${String(seq).padStart(16, '0')}` }));
      for (const tab of ['ログ', '送信ログ', 'AI質問追跡', '心拍']) meta[tab] = row('meta', { tab, last_read_at: iso(ms), updated_at: iso(ms), source_rows: '1', copied_rows: '1', contract_version: 'v1', status: 'ok', detail: '' });
      copy.lastRead = ms;
      copy.lastRowId = `77${String(seq).padStart(16, '0')}`;
    },
    read() {
      const t = tables();
      if (copy.brokenColumn) { const h = t[COPY_TAB.log].header; t[COPY_TAB.log] = { header: h.filter((c) => c !== copy.brokenColumn), rows: t[COPY_TAB.log].rows.map((r) => r.filter((_, i) => h[i] !== copy.brokenColumn)) }; }
      return { titles: Object.values(COPY_TAB), tables: t };
    },
  };
  void store; void startMs;
  return copy;
}

/** In-process fake of the Sheets API endpoints the reader uses. `mode` switches the failure. */
function createFakeSheets(copy) {
  const state = { mode: 'ok' };
  const fetchImpl = (url, init) => {
    if (state.mode === 'access-lost') return Promise.resolve({ ok: false, status: 403, json: async () => ({}) });
    if (state.mode === 'api-timeout') {
      // A request that never answers. The keep-alive timer stands in for the open socket of a real request: the reader's
      // AbortSignal.timeout timer is unref'd, so without it a standalone drill process could exit before the time limit fires.
      return new Promise((_, reject) => {
        const keepAlive = setInterval(() => {}, 1000);
        init.signal?.addEventListener('abort', () => { clearInterval(keepAlive); reject(new Error('aborted')); });
      });
    }
    const u = new URL(url);
    const m = /^\/v4\/spreadsheets\/([^/]+)(\/values:batchGet)?$/.exec(u.pathname);
    if (!m || decodeURIComponent(m[1]) !== TEST_ID) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    const file = copy.read();
    if (!m[2]) return Promise.resolve({ ok: true, status: 200, json: async () => ({ sheets: file.titles.map((title) => ({ properties: { title } })) }) });
    const ranges = u.searchParams.getAll('ranges').map((r) => { const head = r.endsWith('!1:1'); return { t: (head ? r.slice(0, -4) : r).slice(1, -1).replace(/''/g, "'"), head }; });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ valueRanges: ranges.map(({ t, head }) => ({ values: head ? [file.tables[t].header] : [file.tables[t].header, ...file.tables[t].rows] })) }) });
  };
  return { state, fetchImpl };
}

/**
 * @param {{scenario: string, clock?: 'real'|'fast', pollSec?: number, copyEveryMin?: number, normalMin?: number, maxWaitMin?: number,
 *          recoverWaitMin?: number, adapterConfig?: object, log?: Function}} o
 */
export async function runDrill({ scenario, clock = 'real', pollSec = 30, copyEveryMin = 5, normalMin = 12, maxWaitMin = 35, recoverWaitMin = 12, adapterConfig, log = () => {} }) {
  if (!SCENARIOS.includes(scenario)) throw new Error(`scenario must be one of ${SCENARIOS.join(', ')}`);
  const fast = clock === 'fast';
  let virtual = Date.now();
  const now = () => (fast ? virtual : Date.now());
  const sleep = (ms) => (fast ? (virtual += ms, Promise.resolve()) : new Promise((r) => setTimeout(r, ms)));
  const cfg = adapterConfig ?? config({ NIKUSHO_STORES_FILE: process.env.NIKUSHO_STORES_FILE || 'config/stores.json', NIKUSHO_COPY_STORE: process.env.NIKUSHO_COPY_STORE || 'NIKUSHO_BANGNA', NIKUSHO_COPY_TIMEZONE: 'Asia/Bangkok', NIKUSHO_COPY_SPREADSHEET_ID: '', NIKUSHO_HEARTBEAT_SPREADSHEET_ID: '', NIKUSHO_READER_KEY_FILE: '', NIKUSHO_READER_KEY_JSON: '' }).adapter;
  const store = cfg.stores.find((s) => s.store === cfg.store);
  const copy = createTestCopy(store, now());
  const fake = createFakeSheets(copy);
  const reader = createSheetsReader({ spreadsheetId: TEST_ID, tabs: Object.values(COPY_TAB), requiredTabs: [COPY_TAB.meta], exactTabs: true, getAccessToken: async () => 'drill-token', fetchImpl: fake.fetchImpl, timeoutMs: fast ? 50 : 10_000 });
  const off = { connected: false, reason: 'not_used', read: async () => { throw new Error('not used'); } };
  const live = createCopyAdapter({ config: cfg, copyReader: reader, heartbeatReader: off, now, log: () => {} }); // production read interval (60 s)
  const api = createApi({ live, demo: createDemoAdapter() });
  const who = grant('drill@example.invalid');
  const events = [];
  const ev = (what, extra = {}) => { const e = { at: iso(now()), what, ...extra }; events.push(e); log(`${e.at.slice(11, 19)}  ${what}${Object.keys(extra).length ? `  ${JSON.stringify(extra)}` : ''}`); };

  let nextCopy = now();
  const copyTick = () => { while (copy.running && now() >= nextCopy) { copy.runAt(nextCopy); ev('copy run', { lastRead: iso(copy.lastRead).slice(11, 19) }); nextCopy += copyEveryMin * MIN; } };
  const poll = async () => {
    const r = await api(who, 'live', 'entry', new URLSearchParams());
    const f = r.body.freshness;
    const msgs = await api(who, 'live', 'messages', new URLSearchParams({ store: store.store, date: businessDayOf(now(), store) }));
    const ids = new Set((msgs.body?.data?.items ?? []).map((m) => m.message_id));
    return { banner: f.state, reasons: f.reasons.map((x) => x.kind), sourceThrough: f.sourceThrough, minutesAgo: f.sourceThroughMinutesAgo, sourceState: r.body.data.sources.copy.state, seesLastRow: ids.has(copy.lastRowId) };
  };

  // phase 1: normal running - copy -> screen latency of each new row
  const latencies = [];
  const end1 = now() + normalMin * MIN;
  let pending = null;
  while (now() < end1) {
    const before = copy.lastRowId;
    copyTick();
    if (copy.lastRowId !== before) pending = { id: copy.lastRowId, at: copy.lastRead };
    const p = await poll();
    if (pending && p.seesLastRow && copy.lastRowId === pending.id) { latencies.push((now() - pending.at) / MIN); pending = null; }
    if (p.banner !== 'normal') ev('unexpected banner during normal phase', { banner: p.banner, reasons: p.reasons });
    await sleep(pollSec * 1000);
  }
  ev('normal phase done', { banner: (await poll()).banner });

  // phase 2: outage
  const outageAt = now();
  const lastGoodRead = copy.lastRead;
  if (scenario === 'copy-stops') copy.running = false;
  if (scenario === 'access-lost' || scenario === 'api-timeout') fake.state.mode = scenario;
  if (scenario === 'bad-contract') copy.brokenColumn = '発言者';
  ev('outage started', { scenario });
  let detectedAt = null; let detected = null;
  while (now() - outageAt <= maxWaitMin * MIN) {
    copyTick();
    const p = await poll();
    if (p.banner === 'stopped') { detectedAt = now(); detected = p; break; }
    await sleep(pollSec * 1000);
  }
  if (detectedAt) ev('dashboard shows 更新停止', { afterOutageMin: round((detectedAt - outageAt) / MIN), afterLastGoodReadMin: round((detectedAt - lastGoodRead) / MIN), reasons: detected.reasons, sourceState: detected.sourceState, sourceThrough: detected.sourceThrough });
  else ev('NOT detected within the wait', { waitedMin: maxWaitMin });

  // phase 3: recovery
  const recoverAt = now();
  copy.running = true; copy.brokenColumn = null; fake.state.mode = 'ok';
  if (nextCopy < now()) nextCopy = now();
  ev('source restored');
  let normalAt = null;
  while (now() - recoverAt <= recoverWaitMin * MIN) {
    copyTick();
    const p = await poll();
    if (p.banner === 'normal') { normalAt = now(); break; }
    await sleep(pollSec * 1000);
  }
  ev(normalAt ? 'dashboard normal again' : 'NOT normal within the wait', normalAt ? { afterRestoreMin: round((normalAt - recoverAt) / MIN) } : { waitedMin: recoverWaitMin });

  const detectMin = detectedAt ? round((detectedAt - outageAt) / MIN) : null;
  return {
    scenario, clock, pollSec, copyEveryMin,
    source: 'TEST CONNECTION: synthetic copy behind an in-process fake Sheets API (no client file, no production polling touched)',
    copyToScreenMin: latencies.length ? { n: latencies.length, max: round(Math.max(...latencies)), values: latencies.map(round) } : { n: 0 },
    detectionMin: detectMin,
    detectionFromLastGoodReadMin: detectedAt ? round((detectedAt - lastGoodRead) / MIN) : null,
    // Two readings of TV19/TV21 "within 20 min": from the moment the outage began, and (stricter, the worst case for a Copy
    // Script that dies right after a good run) from the last good copy read. Both are reported; neither is chosen here.
    detectionWithinLimit: detectMin !== null && detectMin <= STOP_DETECTION_MAX_MINUTES,
    detectionWithinLimitFromLastGoodRead: detectedAt !== null && (detectedAt - lastGoodRead) / MIN <= STOP_DETECTION_MAX_MINUTES,
    bannerThresholdMin: BANNER_STALE_MINUTES,
    recoveryMin: normalAt ? round((normalAt - recoverAt) / MIN) : null,
    notice: 'NOT IMPLEMENTED (Takatsuji notice: channel Q-02, contact Q-47)',
    events,
  };
}

const round = (x) => Math.round(x * 10) / 10;

function print(r) {
  console.log(`\n==== Outage drill: ${r.scenario} (${r.clock} clock, poll every ${r.pollSec}s)`);
  console.log(r.source);
  console.log(table(['item', 'value'], [
    ['copy -> screen latency of new rows (min)', JSON.stringify(r.copyToScreenMin)],
    ['outage -> 更新停止 on screen (min)', r.detectionMin ?? 'not detected'],
    ['last good copy read -> 更新停止 (min)', r.detectionFromLastGoodReadMin ?? '-'],
    [`within ${STOP_DETECTION_MAX_MINUTES} min of the outage`, r.detectionWithinLimit ? 'yes' : 'NO'],
    [`within ${STOP_DETECTION_MAX_MINUTES} min of the last good read`, r.detectionWithinLimitFromLastGoodRead ? 'yes' : 'NO'],
    ['restore -> normal (min)', r.recoveryMin ?? 'not normal'],
    ['notice to Takatsuji', r.notice],
  ]));
  console.log('screen = the read-only API the pages call; an open page re-asks it every 60 s, so add up to 1 min for what a viewer sees.');
  if (r.clock === 'fast') console.log('fast clock: proves the logic only; run with --clock real for the timing evidence.');
}

if (isMain(import.meta.url)) {
  const a = args();
  try {
    const r = await runDrill({ scenario: a.scenario ?? 'copy-stops', clock: a.clock === 'fast' ? 'fast' : 'real', pollSec: Number(a.poll ?? 30), log: (m) => console.log(m) });
    print(r);
    writeJson(a.json, r);
  } catch (e) {
    console.error(`outage-drill: ${e.message?.startsWith('scenario must') ? e.message : failure(e)}`);
    process.exit(1);
  }
}
