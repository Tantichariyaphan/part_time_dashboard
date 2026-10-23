// Client approval of 2026-10-22: proposal 1 (unsupported tabs are skipped and listed on ⑥, the safety line is unchanged) and
// proposal 2 (HAYABUSA_MEIEKI / HAYABUSA_OSU shown as 未接続, Asia/Tokyo, no schedules, excluded from every figure).
// SYNTHETIC data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLiveReaders, BUNDLED_STORES_FILE } from '../server/liveSource.js';
import { COPY_TAB } from '../src/contract/copyContract.js';
import { EVIDENCE_TAB } from '../src/contract/evidenceContract.js';
import { copyRead, metaRow, testConfig, adapterWith, memoryReader } from './copyFixtures.js';
import { buildContext } from '../src/viewmodels/context.js';
import * as vm from '../src/viewmodels/pages.js';

const Z = (s) => `${s}+07:00`;
const NOW = Date.parse(Z('2026-10-21T09:00:00'));
const COPY_ID = 'TESTCOPYID_aaaaaaaaaaaaaaaaaaaa';
const shipped = JSON.parse(readFileSync(BUNDLED_STORES_FILE, 'utf8'));
const ALL_H = ['record_key', 'business_date', 'kind', 'scheduled_at', 'started_at', 'finished_at', 'status', 'count', 'ref', 'detail', 'owner',
  'source_complete', 'send', 'issues', 'audit_issues', 'google_beat', 'body_sha256', 'body_changed_after_attempt'];
const table = (header, rows) => ({ header, rows: rows.map((r) => header.map((h) => r[h] ?? '')) });
const freshMeta = (extra = []) => [...['ログ', '送信ログ', 'AI質問追跡', '心拍'].map((t) => metaRow(t, { last_read_at: Z('2026-10-21T08:55:00') })), ...extra];
const slotRow = (t, status = 'ok') => ({ record_key: `k-${t}`, business_date: '2026-10-20', kind: 'line_read', scheduled_at: Z(`2026-10-20T${t}:00`), status, source_complete: 'true' });

function read({ evidence = {}, extraTabs = {}, meta = [] } = {}) {
  const r = copyRead({ meta: freshMeta(meta) });
  for (const [name, t] of Object.entries({ ...evidence, ...extraTabs })) { r.tables[name] = t; r.titles.push(name); }
  return r;
}
const cfgOf = (stores) => testConfig({ store: 'NIKUSHO_BANGNA', timezone: 'Asia/Bangkok', stores, schedules: shipped.schedules });
async function ctxOf(copy, stores = shipped.stores, now = NOW) {
  const { adapter } = adapterWith({ copy, config: cfgOf(stores), now: () => now });
  return buildContext(await adapter.load());
}

// ---------------------------------------------------------------- R2
test('R2-1 the live copy reader no longer fails on an unknown tab and never downloads its cells; meta and forbidden headers unchanged', async () => {
  const copy = read({ extraTabs: { 予約: { header: ['名前', '電話'], rows: [['LEAK-NAME', 'LEAK-PHONE']] } } });
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    const u = new URL(url);
    if (!u.pathname.endsWith('values:batchGet')) return { ok: true, status: 200, json: async () => ({ sheets: copy.titles.map((title) => ({ properties: { title } })) }) };
    const ranges = u.searchParams.getAll('ranges').map((r) => { const head = r.endsWith('!1:1'); return { t: (head ? r.slice(0, -4) : r).slice(1, -1), head }; });
    return { ok: true, status: 200, json: async () => ({ valueRanges: ranges.map(({ t, head }) => ({ values: head ? [copy.tables[t].header] : [copy.tables[t].header, ...copy.tables[t].rows] })) }) };
  };
  try {
    const env = { NIKUSHO_LIVE_ADAPTER: 'copy', NIKUSHO_STORES_FILE: BUNDLED_STORES_FILE, NIKUSHO_COPY_STORE: 'NIKUSHO_BANGNA', NIKUSHO_COPY_SPREADSHEET_ID: COPY_ID, NIKUSHO_COPY_TIMEZONE: 'Asia/Bangkok' };
    const { copyReader } = createLiveReaders(env, { getAccessToken: async () => 'tok' });
    const got = await copyReader.read();
    assert.ok(got.titles.includes('予約'), 'the title is known (for the 未対応 list)');
    assert.equal(got.tables['予約'], undefined, 'its cells are not in the read');
    assert.equal(calls.some((c) => c.includes(encodeURIComponent("'予約'"))), false, 'never requested');
    assert.equal(JSON.stringify(got).includes('LEAK-'), false);
  } finally { globalThis.fetch = realFetch; }
  const src = readFileSync(new URL('../server/liveSource.js', import.meta.url), 'utf8');
  assert.match(src, /requiredTabs: \[COPY_TAB\.meta\], exactTabs: false,/);
  assert.match(src, /refuseHeaders: FORBIDDEN_FIELDS, getAccessToken/, 'forbidden headers still refused by the copy reader');
});

test('R2-2 an unsupported tab is listed (⑥) and every supported tab keeps working, incl. the evidence tabs', async () => {
  const ctx = await ctxOf(read({ evidence: { [EVIDENCE_TAB.slot]: table(ALL_H, [slotRow('12:00')]) }, extraTabs: { run_extra: table(['x'], [['1']]) } }));
  assert.equal(ctx.sources.copy.state, 'CONNECTED');
  assert.deepEqual(ctx.sources.copy.unsupportedTabs, ['run_extra']);
  assert.equal(ctx.limits.runStatusByKind.slot, 'EVIDENCE');
  assert.equal(ctx.freshness.state, 'normal');
  const pub = vm.machines(ctx).sources;
  assert.deepEqual(pub.copy.unsupportedTabs, ['run_extra']);
  const page = readFileSync(new URL('../public/app/pages/machines.js', import.meta.url), 'utf8');
  assert.match(page, /s\.unsupportedTabs \?\? \[\]\)\.length > 0 && h\('div'/);
  const S = (await import('../public/app/strings.ja.js')).S;
  assert.equal(S.sources.unsupported, '未対応のタブ');
});

test('R2-3 the safety line is unchanged: a missing core tab or a forbidden column still stops; a missing meta still blocks everything', async () => {
  const extra = { 予約: table(['a'], [['b']]) };
  const noSend = read({ extraTabs: extra }); delete noSend.tables['送信ログ']; noSend.titles = noSend.titles.filter((t) => t !== '送信ログ');
  let ctx = await ctxOf(noSend);
  assert.equal(ctx.sources.copy.tabs.find((t) => t.tab === '送信ログ').state, 'blocked');
  assert.equal(ctx.freshness.state, 'stopped', 'screen stops as before');
  const leaky = read({ extraTabs: extra }); leaky.tables['ログ'].header.push('userId'); leaky.tables['ログ'].rows.forEach((r) => r.push('LEAK-ID'));
  ctx = await ctxOf(leaky);
  assert.equal(ctx.sources.copy.tabs.find((t) => t.tab === 'ログ').state, 'blocked');
  assert.equal(ctx.freshness.state, 'stopped');
  assert.equal(JSON.stringify(ctx.screen).includes('LEAK-ID'), false);
  const noMeta = read({ extraTabs: extra }); delete noMeta.tables.meta;
  ctx = await ctxOf(noMeta);
  assert.equal(ctx.sources.copy.state, 'BLOCKED');
});

test('R2-4 an evidence tab that is missing, renamed or has meta error -> 未確認 for that part only', async () => {
  const slot = table(ALL_H, [slotRow('12:00'), slotRow('17:00'), slotRow('22:00')]);
  const st = (ctx) => vm.today(ctx, 'NIKUSHO_BANGNA').days.find((d) => d.businessDay === '2026-10-20').items.filter((i) => i.kind === 'slot').map((i) => i.status);
  assert.deepEqual(st(await ctxOf(read({ evidence: { [EVIDENCE_TAB.slot]: slot } }))), ['ok', 'ok', 'ok']);
  assert.deepEqual(st(await ctxOf(read())), ['unconfirmed', 'unconfirmed', 'unconfirmed'], 'missing');
  const renamed = await ctxOf(read({ extraTabs: { run_line_read_v2: slot } }));
  assert.deepEqual(st(renamed), ['unconfirmed', 'unconfirmed', 'unconfirmed'], 'renamed');
  assert.deepEqual(renamed.sources.copy.unsupportedTabs, ['run_line_read_v2'], 'the renamed tab is listed, not read');
  const err = await ctxOf(read({ evidence: { [EVIDENCE_TAB.slot]: slot }, meta: [metaRow(EVIDENCE_TAB.slot, { status: 'error' })] }));
  assert.deepEqual(st(err), ['unconfirmed', 'unconfirmed', 'unconfirmed'], 'meta error');
  assert.equal(err.freshness.state, 'normal', 'only that part: the rest of the screen keeps updating');
  // the other evidence kinds are unaffected by one tab's problem
  const daily = table(ALL_H, ['01_staff_all', '02_owner_line', '03_owner_email'].map((kind, i) => ({ record_key: `d${i}`, business_date: '2026-10-20', kind, started_at: Z('2026-10-21T00:32:00'), status: 'ok', body_changed_after_attempt: 'false' })));
  const mixed = await ctxOf(read({ evidence: { [EVIDENCE_TAB.slot]: slot, [EVIDENCE_TAB.daily]: daily }, meta: [metaRow(EVIDENCE_TAB.slot, { status: 'error' })] }));
  assert.deepEqual(mixed.limits.runStatusByKind, { slot: 'UNCONFIRMED', daily: 'EVIDENCE' });
});

test('R2-5 no old success survives: ok on one read, meta error / tab gone on the next read -> 未確認, nothing cached', async () => {
  const slot = table(ALL_H, [slotRow('12:00'), slotRow('17:00'), slotRow('22:00')]);
  const reader = memoryReader(read({ evidence: { [EVIDENCE_TAB.slot]: slot } }));
  const { adapter } = adapterWith({ copy: reader, config: cfgOf(shipped.stores), now: () => NOW });
  const st = (ctx) => vm.today(ctx, 'NIKUSHO_BANGNA').days.find((d) => d.businessDay === '2026-10-20').items.filter((i) => i.kind === 'slot').map((i) => i.status);
  assert.deepEqual(st(buildContext(await adapter.load())), ['ok', 'ok', 'ok']);
  reader.data = read({ evidence: { [EVIDENCE_TAB.slot]: slot }, meta: [metaRow(EVIDENCE_TAB.slot, { status: 'error' })] });
  let ctx = buildContext(await adapter.load());
  assert.deepEqual(st(ctx), ['unconfirmed', 'unconfirmed', 'unconfirmed']);
  assert.equal(ctx.screen.runs.length, 0, 'no run row from the previous read');
  reader.data = read();
  ctx = buildContext(await adapter.load());
  assert.deepEqual(st(ctx), ['unconfirmed', 'unconfirmed', 'unconfirmed'], 'tab removed');
  reader.fail = Object.assign(new Error('x'), { code: 'http_500' });
  ctx = buildContext(await adapter.load());
  assert.equal(ctx.sources.copy.state, 'ERROR');
  assert.equal(ctx.screen.runs.length, 0, 'a failed read shows nothing, never the earlier result');
});

test('R2-6 a tab title that looks like an id or a URL is not printed', async () => {
  const ctx = await ctxOf(read({ extraTabs: { 'U0123456789abcdef0123456789abcdef': table(['a'], [['b']]), 'https://x.example/y': table(['a'], [['b']]) } }));
  assert.deepEqual(ctx.sources.copy.unsupportedTabs, ['(名前非表示)', '(名前非表示)']);
});

// ---------------------------------------------------------------- R3
test('R3-1 shipped config: Bangkok first and unchanged; two Nagoya stores, Asia/Tokyo, no schedules, nothing invented', () => {
  assert.deepEqual(shipped.stores.map((s) => [s.store, s.display_name, s.timezone]), [
    ['NIKUSHO_BANGNA', 'NIKUSHO บางนา', 'Asia/Bangkok'], ['HAYABUSA_MEIEKI', '麺屋はやぶさ 名駅店', 'Asia/Tokyo'], ['HAYABUSA_OSU', '麺屋はやぶさ 大須店', 'Asia/Tokyo']]);
  const bkk = shipped.stores[0];
  assert.deepEqual([bkk.business_day_start, bkk.slot_times, bkk.slot_deadline_min, bkk.daily_deadline_min, bkk.daily_time, bkk.text_patrol, bkk.production_host],
    ['05:00', '12:00,17:00,22:00', 90, 60, '00:35', '10:00-24:00', 'snowmaru']);
  for (const s of shipped.stores.slice(1)) {
    for (const k of ['business_day_start', 'slot_times', 'slot_deadline_min', 'daily_deadline_min', 'daily_time', 'text_patrol', 'production_host']) assert.equal(s[k], '', `${s.store}.${k} left blank`);
    assert.equal(shipped.schedules.some((x) => x.store === s.store), false, `${s.store}: no schedule`);
  }
});

test('R3-2 Nagoya stores: 未接続 on ①, no figures anywhere, never another store\'s data', async () => {
  const ctx = await ctxOf(read({ evidence: { [EVIDENCE_TAB.slot]: table(ALL_H, [slotRow('12:00')]) } }));
  const all = vm.allStores(ctx).stores;
  assert.deepEqual(all.map((s) => [s.store, s.connection]), [['NIKUSHO_BANGNA', 'connected'], ['HAYABUSA_MEIEKI', 'not_connected'], ['HAYABUSA_OSU', 'not_connected']]);
  for (const s of all.slice(1)) {
    assert.deepEqual(Object.keys(s).sort(), ['capability', 'connection', 'display_name', 'store'], `${s.store} carries no figures`);
    assert.equal(s.capability.evidence, 'NOT_CONNECTED');
  }
  const p = vm.periods(ctx, 7).stores;
  for (const s of p.slice(1)) assert.equal(s.metrics, undefined, `${s.store}: no metrics, no denominators`);
  const f = vm.failures(ctx);
  assert.equal(f.items.some((i) => i.store !== 'NIKUSHO_BANGNA'), false);
  assert.deepEqual(f.notConnected.map((s) => s.store), ['HAYABUSA_MEIEKI', 'HAYABUSA_OSU']);
  assert.equal(vm.machines(ctx).lightChecks.some((l) => l.store !== 'NIKUSHO_BANGNA'), false);
  const t = vm.today(ctx, 'HAYABUSA_OSU');
  assert.deepEqual([t.connection, t.days], ['not_connected', undefined], 'no ② data for an unconnected store');
  assert.equal(vm.messages(ctx, 'HAYABUSA_MEIEKI').connection, 'not_connected');
  assert.equal(vm.questions(ctx, 'HAYABUSA_MEIEKI').connection, 'not_connected');
});

test('R3-3 Bangkok results are identical with and without the Nagoya rows', async () => {
  const copy = read({ evidence: { [EVIDENCE_TAB.slot]: table(ALL_H, [slotRow('12:00'), slotRow('17:00', 'late')]) } });
  const a = await ctxOf(copy, shipped.stores);
  const b = await ctxOf(copy, shipped.stores.slice(0, 1));
  const pick = (ctx) => JSON.stringify({
    all: vm.allStores(ctx).stores[0], today: vm.today(ctx, 'NIKUSHO_BANGNA'), messages: vm.messages(ctx, 'NIKUSHO_BANGNA'),
    questions: vm.questions(ctx, 'NIKUSHO_BANGNA'), p7: vm.periods(ctx, 7).stores[0], p30: vm.periods(ctx, 30).stores[0],
    failures: { items: vm.failures(ctx).items, totals: vm.failures(ctx).totals }, light: vm.machines(ctx).lightChecks,
  });
  assert.equal(pick(a), pick(b));
});
