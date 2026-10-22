// Client run evidence (rules 2026-10-21 §3–§6, src/adapters/copy/evidence.js) on SYNTHETIC rows only.
// Contract = the client's column definition of 2026-10-22 (run_line_read / run_fast_patrol / run_daily_delivery).
// Passing here says nothing about the client's real rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copyRead, metaRow, testConfig, adapterWith } from './copyFixtures.js';
import { store } from './helpers.js';
import { buildContext } from '../src/viewmodels/context.js';
import * as vm from '../src/viewmodels/pages.js';
import { EVIDENCE_TAB } from '../src/contract/evidenceContract.js';
import { fiveMinCheck } from '../src/domain/production.js';
import { S } from '../public/app/strings.ja.js';
import { runLabel } from '../public/app/status.js';
import { dayRuns } from '../src/domain/runs.js';
import { runOpts } from '../src/viewmodels/context.js';

const Z = (s) => `${s}+07:00`;
const NOW = Date.parse(Z('2026-10-21T09:00:00'));
const cfg = testConfig({
  timezone: 'Asia/Bangkok',
  stores: [store({ production_host: 'h1', slot_times: '12:00,17:00,22:00', slot_deadline_min: 90, daily_deadline_min: 60 })],
  schedules: [
    { store: 'S', kind: 'slot', times: '12:00,17:00,22:00', valid_from: '2026-10-02', valid_to: null },
    { store: 'S', kind: 'daily', times: '00:35', valid_from: '2026-01-01', valid_to: null },
  ],
});
// the client puts the same column set in every tab (definition 1/4–2/4)
const ALL_H = ['record_key', 'business_date', 'kind', 'scheduled_at', 'started_at', 'finished_at', 'status', 'count', 'ref', 'detail', 'owner',
  'source_complete', 'send', 'issues', 'audit_issues', 'google_beat', 'body_sha256', 'body_changed_after_attempt'];
const SLOT_H = ALL_H; const DAILY_H = ALL_H; const PATROL_H = ALL_H;
let K = 0; const key = () => `k${(K += 1)}`;
const SHA = 'a'.repeat(64);
const table = (header, rows) => ({ header, rows: rows.map((r) => header.map((h) => r[h] ?? '')) });

function withEvidence({ slot, daily, patrol, meta = [] } = {}) {
  const read = copyRead({ meta: [...['ログ', '送信ログ', 'AI質問追跡', '心拍'].map((t) => metaRow(t, { last_read_at: Z('2026-10-21T08:55:00') })), ...meta] });
  const add = (name, t) => { if (t) { read.tables[name] = t; read.titles.push(name); } };
  add(EVIDENCE_TAB.slot, slot);
  add(EVIDENCE_TAB.daily, daily);
  add(EVIDENCE_TAB.patrol, patrol);
  return read;
}
async function ctxOf(read, now = NOW) {
  const { adapter } = adapterWith({ copy: read, config: cfg, now: () => now });
  return buildContext(await adapter.load());
}
const day20 = (ctx) => vm.today(ctx, 'S').days.find((d) => d.businessDay === '2026-10-20');

test('EV-1 without evidence tabs nothing changes: both kinds 未確認, the copy is not blocked', async () => {
  const ctx = await ctxOf(withEvidence());
  assert.deepEqual(ctx.limits.runStatusByKind, { slot: 'UNCONFIRMED', daily: 'UNCONFIRMED' });
  assert.equal(ctx.sources.copy.state, 'CONNECTED');
  assert.ok(day20(ctx).items.every((i) => i.status === 'unconfirmed'));
  assert.equal(day20(ctx).unconfirmedStatus, true);
});

test('EV-2 the client tabs run_line_read / run_fast_patrol / run_daily_delivery and their meta rows do not block the copy (10/22 unexpected_tabs)', async () => {
  assert.deepEqual(Object.values(EVIDENCE_TAB), ['run_line_read', 'run_fast_patrol', 'run_daily_delivery']);
  const ctx = await ctxOf(withEvidence({ slot: table(SLOT_H, []), daily: table(DAILY_H, []), patrol: table(PATROL_H, []),
    meta: [metaRow(EVIDENCE_TAB.slot), metaRow(EVIDENCE_TAB.daily), metaRow(EVIDENCE_TAB.patrol)] }));
  assert.equal(ctx.sources.copy.state, 'CONNECTED');
  assert.deepEqual(ctx.limits.runStatusByKind, { slot: 'EVIDENCE', daily: 'EVIDENCE' });
  const live = readFileSync(new URL('../server/liveSource.js', import.meta.url), 'utf8');
  assert.match(live, /tabs: \[\.\.\.Object\.values\(COPY_TAB\), \.\.\.Object\.values\(EVIDENCE_TAB\)\]/, 'the reader requests the tabs (exactTabs refuses unknown ones)');
});

function dayRunsOf(ctx, day) {
  const st = ctx.screen.stores[0];
  const { items } = dayRuns({ store: st, schedules: ctx.screen.schedules, runs: ctx.screen.runs, day, now: ctx.now, currentDay: '2026-10-21', ...runOpts(ctx) });
  return Object.fromEntries(items.map((i) => [i.kind === 'daily' ? 'daily' : i.time, i.status]));
}

test('EV-3 run_line_read: the client status is used as given; missing = 未実行 only with source_complete; scheduled/pending = schedule; conflicts = 結果不明', async () => {
  const row = (day, t, status, over = {}) => ({ record_key: key(), business_date: day, kind: 'line_read', scheduled_at: Z(`${day}T${t}:00`), status, source_complete: 'true', ...over });
  const rows = [
    row('2026-10-20', '12:00', 'ok', { started_at: Z('2026-10-20T12:00:20'), finished_at: Z('2026-10-20T12:03:05'), count: '0' }),
    row('2026-10-20', '17:00', 'late', { finished_at: Z('2026-10-20T18:45:00') }),
    row('2026-10-20', '22:00', 'blocked', { detail: 'exit_code_nonzero' }),
    row('2026-10-19', '12:00', 'unknown'),
    row('2026-10-19', '17:00', 'missing', { source_complete: 'true' }),
    row('2026-10-19', '22:00', 'missing', { source_complete: 'false' }),
    row('2026-10-18', '12:00', 'ok'), row('2026-10-18', '12:00', 'blocked'), // two records for one run
    row('2026-10-18', '17:00', 'done'), // outside the vocabulary
    row('2026-10-18', '22:00', 'blocked', { detail: 'free text with spaces' }), // detail that is not a code is not shown
  ];
  const ctx = await ctxOf(withEvidence({ slot: table(SLOT_H, rows) }));
  assert.deepEqual(ctx.limits.runStatusByKind, { slot: 'EVIDENCE', daily: 'UNCONFIRMED' });
  assert.deepEqual(dayRunsOf(ctx, '2026-10-20'), { '12:00': 'ok', '17:00': 'late', '22:00': 'blocked', daily: 'unconfirmed' });
  assert.deepEqual(dayRunsOf(ctx, '2026-10-19'), { '12:00': 'unknown', '17:00': 'missing', '22:00': 'no_evidence', daily: 'unconfirmed' });
  assert.deepEqual(dayRunsOf(ctx, '2026-10-18'), { '12:00': 'unknown', '17:00': 'unknown', '22:00': 'blocked', daily: 'unconfirmed' });
  assert.equal(dayRunsOf(ctx, '2026-10-17')['12:00'], 'no_evidence', 'no record at all -> 未確認（記録なし）, never 未実行');
  const r22 = ctx.screen.runs.find((x) => x.scheduled_at === Z('2026-10-20T22:00:00'));
  assert.equal(r22.reason, 'exit_code_nonzero');
  assert.equal(ctx.screen.runs.find((x) => x.scheduled_at === Z('2026-10-18T22:00:00')).reason, 'failure_recorded');
  const r12 = ctx.screen.runs.find((x) => x.scheduled_at === Z('2026-10-20T12:00:00'));
  assert.deepEqual([r12.read_at, r12.input_lines], [Z('2026-10-20T12:03:05'), 0]);
  // scheduled / pending: the row is not used, the schedule decides (時刻前 / 結果待ち)
  const early = await ctxOf(withEvidence({ slot: table(SLOT_H, [row('2026-10-21', '12:00', 'pending')]) }), Date.parse(Z('2026-10-21T12:30:00')));
  assert.equal(dayRunsOf(early, '2026-10-21')['12:00'], 'awaiting');
  assert.equal(runLabel('ok', 'slot'), '読取完了');
  assert.equal(runLabel('no_evidence', 'slot'), '未確認（記録なし）');
});

test('EV-4 run_daily_delivery: 3 routes ok -> ok (00:32 normal); SHA differs per route by design; any doubt -> never ok', async () => {
  const d = (date, route, at, status = 'ok', over = {}) => ({ record_key: key(), business_date: date, kind: route, scheduled_at: Z(`${date.replace(/\d+$/, (x) => String(Number(x) + 1).padStart(2, '0'))}T00:35:00`),
    started_at: Z(at), status, body_sha256: (route[1] === '1' ? 'a' : route[1] === '2' ? 'b' : 'c').repeat(64), body_changed_after_attempt: 'false', source_complete: 'false', ...over });
  const R = ['01_staff_all', '02_owner_line', '03_owner_email'];
  const all3 = (date, at, over = {}) => R.map((r) => d(date, r, at, over[r]?.status ?? 'ok', over[r] ?? {}));
  const rows = [
    ...all3('2026-10-20', '2026-10-21T00:32:26'),
    ...all3('2026-10-19', '2026-10-20T00:40:00', { '03_owner_email': { status: 'late', started_at: Z('2026-10-20T01:50:00') } }),
    ...all3('2026-10-18', '2026-10-19T00:40:00', { '03_owner_email': { status: 'unknown' } }),
    ...all3('2026-10-17', '2026-10-18T00:40:00', { '02_owner_line': { body_changed_after_attempt: 'true' } }),
    ...all3('2026-10-15', '2026-10-16T00:40:00', { '01_staff_all': { status: 'blocked' } }),
    d('2026-10-14', '01_staff_all', '2026-10-15T00:40:00'), d('2026-10-14', '02_owner_line', '2026-10-15T00:40:00'), d('2026-10-14', '03_owner_email', '2026-10-15T00:40:00', 'missing'),
  ];
  const ctx = await ctxOf(withEvidence({ daily: table(DAILY_H, rows) }));
  const st = (day) => dayRunsOf(ctx, day).daily;
  assert.equal(st('2026-10-20'), 'ok', 'different SHA per route is normal (definition 2/4)');
  assert.equal(st('2026-10-19'), 'late');
  assert.equal(st('2026-10-18'), 'unknown');
  assert.equal(st('2026-10-17'), 'unknown');
  assert.equal(st('2026-10-15'), 'blocked');
  assert.equal(st('2026-10-14'), 'unknown', 'a missing email receipt never makes the daily ok, and never 未実行');
  assert.equal(st('2026-10-13'), 'no_evidence');
  const r = ctx.screen.runs.find((x) => x.run_id === 'EV-DAILY-2026-10-20');
  assert.deepEqual(JSON.parse(r.routes_json).map((x) => [x.route, x.status, x.at]), [
    ['staff_all_line', 'ok', Z('2026-10-21T00:32:26')], ['owner_line', 'ok', Z('2026-10-21T00:32:26')], ['owner_email', 'ok', Z('2026-10-21T00:32:26')]]);
  assert.equal(ctx.screen.runs.find((x) => x.run_id === 'EV-DAILY-2026-10-14').reason, 'route_without_record');
  assert.equal(S.routeStatus.ok, '受付');
  // today's routes still 'scheduled' before 00:35 -> not judged yet (時刻前)
  const early = await ctxOf(withEvidence({ daily: table(DAILY_H, R.map((x) => d('2026-10-20', x, '2026-10-21T00:00:00', 'scheduled', { started_at: '' }))) }), Date.parse(Z('2026-10-21T00:20:00')));
  assert.equal(dayRunsOf(early, '2026-10-20').daily, 'not_due');
  const partial = await ctxOf(withEvidence({ daily: table(DAILY_H, [d('2026-10-20', '01_staff_all', '2026-10-21T00:32:00')]) }), Date.parse(Z('2026-10-21T00:50:00')));
  assert.equal(dayRunsOf(partial, '2026-10-20').daily, 'running');
});

test('EV-5 a broken tab or a meta row that is not ok -> not used, that kind stays 未確認 (fail closed, no values in findings)', async () => {
  const bad = table(['record_key', 'business_date', 'status', 'who'], [{ record_key: 'x', business_date: '2026-10-20', status: 'ok', who: 'name' }]);
  const ctx = await ctxOf(withEvidence({ slot: bad }));
  assert.equal(ctx.limits.runStatusByKind.slot, 'UNCONFIRMED');
  const rep = ctx.sources.copy.evidenceTabs.find((t) => t.tab === EVIDENCE_TAB.slot);
  assert.equal(rep.state, 'blocked');
  assert.ok(rep.findings.some((f) => f.problem === 'missing_column'));
  assert.ok(rep.findings.some((f) => f.problem === 'unexpected_column' && f.column === 'col 4'), 'names the position, not the header');
  const leak = table(SLOT_H, [{ record_key: 'U0123456789abcdef0123456789abcdef', business_date: '2026-10-20', scheduled_at: Z('2026-10-20T12:00:00'), status: 'ok' }]);
  const c2 = await ctxOf(withEvidence({ slot: leak }));
  assert.equal(c2.limits.runStatusByKind.slot, 'UNCONFIRMED');
  assert.ok(!JSON.stringify(c2.sources.copy.evidenceTabs).includes('U0123456789abcdef'));
  // owner check failed on the client side -> meta error (definition 2/4) -> not used, shown as such on ⑥
  const c3 = await ctxOf(withEvidence({ patrol: table(PATROL_H, []), slot: table(SLOT_H, []), meta: [metaRow(EVIDENCE_TAB.slot, { status: 'error' }), metaRow(EVIDENCE_TAB.patrol, { status: 'error' })] }));
  assert.equal(c3.limits.runStatusByKind.slot, 'UNCONFIRMED');
  assert.equal(c3.evidence.patrol, null);
  assert.equal(c3.sources.copy.evidenceTabs.find((t) => t.tab === EVIDENCE_TAB.patrol).state, 'error');
});

test('EV-6 slots before 10/5 23:36 keep the old rule: not judged even with a row', async () => {
  const ctx = await ctxOf(withEvidence({ slot: table(SLOT_H, [{ record_key: 'o', business_date: '2026-10-05', scheduled_at: Z('2026-10-05T22:00:00'), status: 'ok' }]) }), Date.parse(Z('2026-10-06T09:00:00')));
  const st = ctx.screen.stores[0];
  const { items } = dayRuns({ store: st, schedules: ctx.screen.schedules, runs: ctx.screen.runs, day: '2026-10-05', now: ctx.now, currentDay: '2026-10-06', ...runOpts(ctx) });
  const s22 = items.find((i) => i.kind === 'slot' && i.time === '22:00');
  assert.deepEqual([s22.status, s22.derived], ['unconfirmed', 'before_rule']);
});

test('EV-7 run_fast_patrol: 動作確認 only for an ok run with owner=new; blocked / unknown -> 要確認; outside_hours rows ignored; 15 / 20 min', async () => {
  const p = (at, status = 'ok', over = {}) => ({ record_key: key(), started_at: Z(`2026-10-20T${at}:00`), status, owner: 'new', send: 'true', issues: '0', audit_issues: '0', google_beat: 'true', ...over });
  const s = store({ production_host: 'h1' });
  const check = async (rows, nowHm) => {
    const ctx = await ctxOf(withEvidence({ patrol: table(PATROL_H, rows) }), Date.parse(Z(`2026-10-20T${nowHm}:00`)));
    return fiveMinCheck(s, ctx.evidence.patrol, [], ctx.now);
  };
  assert.equal((await check([p('12:00')], '12:05')).state, 'confirmed');
  assert.equal((await check([p('12:00', 'ok', { owner: '' })], '12:05')).state, 'owner_unconfirmed');
  assert.equal((await check([p('12:00', 'blocked', { issues: '2' })], '12:05')).state, 'issue');
  assert.equal((await check([p('12:00', 'unknown', { issues: '' })], '12:05')).state, 'issue');
  assert.deepEqual(await check([p('12:00')], '12:16').then((x) => [x.state, x.stopDetected]), ['red', false]);
  assert.deepEqual(await check([p('12:00')], '12:21').then((x) => [x.state, x.stopDetected]), ['red', true]);
  assert.equal((await check([p('09:55', 'outside_hours'), p('10:00')], '10:03')).state, 'confirmed');
  assert.equal((await check([p('09:55', 'outside_hours')], '09:58')).state, 'off_hours');
});

test('EV-8 ⑦: a judged kind gets a rate; an unjudged kind stays 未確認; only not-judged runs in the window -> 未確認, not 対象なし', async () => {
  const rows = [];
  for (const day of ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']) for (const t of ['12:00', '17:00', '22:00']) {
    rows.push({ record_key: key(), business_date: day, kind: 'line_read', scheduled_at: Z(`${day}T${t}:00`), status: 'ok', source_complete: 'true' });
  }
  rows.pop(); // 10/20 22:00 has no record -> 未確認（記録なし）, excluded from the rate
  const ctx = await ctxOf(withEvidence({ slot: table(SLOT_H, rows) }));
  const m = vm.periods(ctx, 7).stores[0].metrics;
  assert.deepEqual([m.patrolRate.state, m.patrolRate.numerator, m.patrolRate.denominator], ['value', 17, 17]);
  assert.equal(m.dailyRate.state, 'unconfirmed');
  const none = await ctxOf(withEvidence({ slot: table(SLOT_H, []) }));
  assert.equal(vm.periods(none, 7).stores[0].metrics.patrolRate.state, 'unconfirmed');
});
