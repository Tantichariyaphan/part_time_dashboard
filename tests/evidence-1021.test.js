// Client run evidence (rules 2026-10-21 §3–§6, src/adapters/copy/evidence.js) on SYNTHETIC rows only.
// Passing here says nothing about the client's real records: their tab names / values are a PIATEC proposal until confirmed.
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
const SLOT_H = ['run_id', 'scheduled_at', 'started_at', 'finished_at', 'source_complete', 'status', 'reason', 'read_count'];
const DAILY_H = ['business_date', 'route', 'attempted_at', 'status', 'body_sha256', 'body_changed_after_attempt'];
const PATROL_H = ['at', 'host', 'send', 'issues', 'audit_issues', 'google_beat', 'owner'];
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

test('EV-2 evidence tabs and their meta rows do not block the copy (unexpected_tab / unexpected_meta_tab)', async () => {
  const ctx = await ctxOf(withEvidence({ slot: table(SLOT_H, []), daily: table(DAILY_H, []), patrol: table(PATROL_H, []),
    meta: [metaRow(EVIDENCE_TAB.slot), metaRow(EVIDENCE_TAB.daily), metaRow(EVIDENCE_TAB.patrol)] }));
  assert.equal(ctx.sources.copy.state, 'CONNECTED');
  assert.deepEqual(ctx.limits.runStatusByKind, { slot: 'EVIDENCE', daily: 'EVIDENCE' });
  const live = readFileSync(new URL('../server/liveSource.js', import.meta.url), 'utf8');
  assert.match(live, /tabs: \[\.\.\.Object\.values\(COPY_TAB\), \.\.\.Object\.values\(EVIDENCE_TAB\)\]/, 'the reader requests the optional tabs (exactTabs would refuse them otherwise)');
});

test('EV-3 定時 LINE 読取: ok / late / blocked / running→unknown / missing only with source_complete / no record = 未確認 / conflicts', async () => {
  const row = (over) => ({ run_id: 'R', started_at: '', finished_at: '', source_complete: 'TRUE', reason: '', read_count: '', ...over });
  const rows = [
    row({ scheduled_at: Z('2026-10-20T12:00:00'), started_at: Z('2026-10-20T12:00:30'), finished_at: Z('2026-10-20T12:04:00'), status: 'ok', read_count: '57' }),
    row({ scheduled_at: Z('2026-10-20T17:00:00'), finished_at: Z('2026-10-20T18:45:00'), status: 'ok' }), // after 18:30 -> late
    row({ scheduled_at: Z('2026-10-20T22:00:00'), status: 'fail', reason: 'exit_code=2' }),
    row({ scheduled_at: Z('2026-10-19T12:00:00'), started_at: Z('2026-10-19T12:00:30'), status: 'started' }), // never finished
    row({ scheduled_at: Z('2026-10-19T17:00:00'), status: 'not_started', source_complete: 'TRUE' }),
    row({ scheduled_at: Z('2026-10-19T22:00:00'), status: 'not_started', source_complete: 'FALSE' }), // range incomplete
    row({ scheduled_at: Z('2026-10-18T12:00:00'), status: 'ok', finished_at: Z('2026-10-18T12:03:00') }),
    row({ scheduled_at: Z('2026-10-18T12:00:00'), status: 'fail' }), // same slot twice -> conflict
    row({ scheduled_at: Z('2026-10-18T17:00:00'), status: 'done' }), // outside the vocabulary
    row({ scheduled_at: Z('2026-10-18T22:00:00'), status: 'ok' }), // ok without an end time
  ];
  const ctx = await ctxOf(withEvidence({ slot: table(SLOT_H, rows) }));
  assert.deepEqual(ctx.limits.runStatusByKind, { slot: 'EVIDENCE', daily: 'UNCONFIRMED' });
  const runs = (d) => dayRunsOf(ctx, d);
  assert.deepEqual(runs('2026-10-20'), { '12:00': 'ok', '17:00': 'late', '22:00': 'blocked', daily: 'unconfirmed' });
  assert.deepEqual(runs('2026-10-19'), { '12:00': 'unknown', '17:00': 'missing', '22:00': 'no_evidence', daily: 'unconfirmed' });
  assert.deepEqual(runs('2026-10-18'), { '12:00': 'unknown', '17:00': 'unknown', '22:00': 'unknown', daily: 'unconfirmed' });
  // a scheduled slot with no row at all -> 未確認（記録なし）, never 未実行
  assert.equal(runs('2026-10-17')['12:00'], 'no_evidence');
  // labels by kind
  assert.equal(runLabel('ok', 'slot'), '読取完了');
  assert.equal(runLabel('late', 'slot'), '遅れて読取完了');
  assert.equal(runLabel('no_evidence', 'slot'), '未確認（記録なし）');
  assert.equal(runLabel('unknown', 'slot'), '結果不明');
  const t = vm.today(ctx, 'S');
  assert.ok(t.days.every((d) => d.unconfirmedKinds.daily && !d.unconfirmedKinds.slot), 'daily still 3 経路判定未接続');
});

function dayRunsOf(ctx, day) {
  const st = ctx.screen.stores[0];
  const { items } = dayRuns({ store: st, schedules: ctx.screen.schedules, runs: ctx.screen.runs, day, now: ctx.now, currentDay: '2026-10-21', ...runOpts(ctx) });
  return Object.fromEntries(items.map((i) => [i.kind === 'daily' ? 'daily' : i.time, i.status]));
}

test('EV-4 日次配送: 3 routes, same business_date and SHA -> ok (00:32 is not early-abnormal); any doubt -> never ok', async () => {
  const d = (date, route, at, over = {}) => ({ business_date: date, route, attempted_at: Z(at), status: 'sent', body_sha256: SHA, body_changed_after_attempt: 'FALSE', ...over });
  const all3 = (date, at, over = {}) => ['staff_all_line', 'owner_line', 'owner_email'].map((r) => d(date, r, at, over[r] ?? {}));
  const rows = [
    ...all3('2026-10-20', '2026-10-21T00:32:00'), // ok
    ...all3('2026-10-19', '2026-10-20T00:40:00', { owner_email: { attempted_at: Z('2026-10-20T01:50:00') } }), // late
    ...all3('2026-10-18', '2026-10-19T00:40:00', { owner_email: { status: 'attempted' } }), // unknown, no retry
    ...all3('2026-10-17', '2026-10-18T00:40:00', { owner_line: { body_changed_after_attempt: 'TRUE' } }),
    ...all3('2026-10-16', '2026-10-17T00:40:00', { owner_email: { body_sha256: 'b'.repeat(64) } }),
    ...all3('2026-10-15', '2026-10-16T00:40:00', { staff_all_line: { status: 'blocked' }, owner_line: { status: 'blocked' }, owner_email: { status: 'blocked' } }),
    d('2026-10-14', 'staff_all_line', '2026-10-15T00:40:00'), d('2026-10-14', 'owner_line', '2026-10-15T00:40:00'), // no email record
  ];
  const ctx = await ctxOf(withEvidence({ daily: table(DAILY_H, rows) }));
  const st = (day) => dayRunsOf(ctx, day).daily;
  assert.equal(st('2026-10-20'), 'ok');
  assert.equal(st('2026-10-19'), 'late');
  assert.equal(st('2026-10-18'), 'unknown');
  assert.equal(st('2026-10-17'), 'unknown');
  assert.equal(st('2026-10-16'), 'unknown');
  assert.equal(st('2026-10-15'), 'blocked');
  assert.equal(st('2026-10-14'), 'unknown', 'LINE receipts alone never make the daily ok (丸メール missing)');
  assert.equal(st('2026-10-13'), 'no_evidence');
  const r = ctx.screen.runs.find((x) => x.kind === 'daily' && x.scheduled_at === Z('2026-10-21T00:35:00'));
  assert.deepEqual(JSON.parse(r.routes_json).map((x) => [x.route, x.status, x.at]), [
    ['staff_all_line', 'sent', Z('2026-10-21T00:32:00')], ['owner_line', 'sent', Z('2026-10-21T00:32:00')], ['owner_email', 'sent', Z('2026-10-21T00:32:00')]]);
  assert.equal(ctx.screen.runs.find((x) => x.run_id === 'EV-DAILY-2026-10-14').reason, 'route_without_record');
  assert.equal(runLabel('ok', 'daily'), '3 経路受付記録あり');
  assert.equal(S.routeStatus.sent, '受付');
  // partial routes before the deadline -> 受付途中 (running), not unknown
  const early = await ctxOf(withEvidence({ daily: table(DAILY_H, [d('2026-10-20', 'staff_all_line', '2026-10-21T00:32:00')]) }), Date.parse(Z('2026-10-21T00:50:00')));
  assert.equal(dayRunsOf(early, '2026-10-20').daily, 'running');
});

test('EV-5 a broken evidence tab is blocked as a whole -> that kind stays 未確認 (fail closed, no values in findings)', async () => {
  const bad = table(['run_id', 'scheduled_at', 'status'], [{ run_id: 'x', scheduled_at: Z('2026-10-20T12:00:00'), status: 'ok' }]);
  const ctx = await ctxOf(withEvidence({ slot: bad }));
  assert.equal(ctx.limits.runStatusByKind.slot, 'UNCONFIRMED');
  const rep = ctx.sources.copy.evidenceTabs.find((t) => t.tab === EVIDENCE_TAB.slot);
  assert.equal(rep.state, 'blocked');
  assert.ok(rep.findings.some((f) => f.problem === 'missing_column'));
  const leak = table(SLOT_H, [{ run_id: 'U0123456789abcdef0123456789abcdef', scheduled_at: Z('2026-10-20T12:00:00'), status: 'ok', source_complete: 'TRUE' }]);
  const c2 = await ctxOf(withEvidence({ slot: leak }));
  assert.equal(c2.limits.runStatusByKind.slot, 'UNCONFIRMED');
  assert.ok(!JSON.stringify(c2.sources.copy.evidenceTabs).includes('U0123456789abcdef'), 'the value is never echoed');
  // a stale meta row for the tab -> not used
  const c3 = await ctxOf(withEvidence({ slot: table(SLOT_H, []), meta: [metaRow(EVIDENCE_TAB.slot, { status: 'stale' })] }));
  assert.equal(c3.limits.runStatusByKind.slot, 'UNCONFIRMED');
});

test('EV-6 slots before 10/5 23:36 keep the old rule: not judged even with a row', async () => {
  const ctx = await ctxOf(withEvidence({ slot: table(SLOT_H, [{ run_id: 'o', scheduled_at: Z('2026-10-05T22:00:00'), finished_at: Z('2026-10-05T22:05:00'), status: 'ok', source_complete: 'TRUE' }]) }), Date.parse(Z('2026-10-06T09:00:00')));
  const st = ctx.screen.stores[0];
  const { items } = dayRuns({ store: st, schedules: ctx.screen.schedules, runs: ctx.screen.runs, day: '2026-10-05', now: ctx.now, currentDay: '2026-10-06', ...runOpts(ctx) });
  const s22 = items.find((i) => i.kind === 'slot' && i.time === '22:00');
  assert.deepEqual([s22.status, s22.derived], ['unconfirmed', 'before_rule']);
});

test('EV-7 5 分巡回 with per-run records: 動作確認 only for a clean run of the production host with owner=new', () => {
  const s = store({ production_host: 'h1' });
  const p = (over) => ({ at: Z('2026-10-20T12:00:00'), host: 'h1', send: true, issues: 0, audit_issues: 0, google_beat: true, owner: 'new', ...over });
  const at = (iso, rows) => fiveMinCheck(s, rows, [], Date.parse(Z(iso)));
  assert.equal(at('2026-10-20T12:05:00', [p()]).state, 'confirmed');
  assert.equal(at('2026-10-20T12:05:00', [p({ owner: null })]).state, 'owner_unconfirmed', 'no ownership evidence -> 担当未確認');
  assert.equal(at('2026-10-20T12:05:00', [p({ owner: 'both' })]).state, 'owner_unconfirmed');
  assert.equal(at('2026-10-20T12:05:00', [p({ issues: 2 })]).state, 'issue');
  assert.equal(at('2026-10-20T12:05:00', [p({ send: false })]).state, 'issue');
  assert.equal(at('2026-10-20T12:05:00', [p({ google_beat: false })]).state, 'issue');
  assert.deepEqual([at('2026-10-20T12:16:00', [p()]).state, at('2026-10-20T12:16:00', [p()]).stopDetected], ['red', false]);
  assert.deepEqual([at('2026-10-20T12:21:00', [p()]).state, at('2026-10-20T12:21:00', [p()]).stopDetected], ['red', true]);
  assert.equal(at('2026-10-20T12:21:00', [p(), p({ host: 'h2', at: Z('2026-10-20T12:20:00') })]).stopDetected, true, 'another host never substitutes');
  assert.equal(at('2026-10-20T09:00:00', [p()]).state, 'off_hours');
  assert.equal(at('2026-10-20T12:05:00', []).state, 'unknown');
  assert.equal(fiveMinCheck(s, null, [], Date.parse(Z('2026-10-20T12:05:00'))).evidence, false, 'without the tab: last-run-time mode');
});

test('EV-8 ⑦: a judged kind gets a rate; an unjudged kind stays 未確認; only not-judged runs in the window -> 未確認, not 対象なし', async () => {
  const ok = (day, t) => ({ run_id: 'r', scheduled_at: Z(`${day}T${t}:00`), finished_at: Z(`${day}T${t.slice(0, 2)}:05:00`), status: 'ok', source_complete: 'TRUE' });
  const rows = [];
  for (const day of ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']) for (const t of ['12:00', '17:00', '22:00']) rows.push(ok(day, t));
  rows.pop(); // 10/20 22:00 has no record -> 未確認（記録なし）, excluded from the rate
  const ctx = await ctxOf(withEvidence({ slot: table(SLOT_H, rows) }));
  const m = vm.periods(ctx, 7).stores[0].metrics;
  assert.equal(m.patrolRate.state, 'value');
  assert.equal(m.patrolRate.denominator, 17);
  assert.equal(m.patrolRate.numerator, 17);
  assert.equal(m.dailyRate.state, 'unconfirmed');
  const none = await ctxOf(withEvidence({ slot: table(SLOT_H, []) }));
  assert.equal(vm.periods(none, 7).stores[0].metrics.patrolRate.state, 'unconfirmed');
});
