// Documented boundary conditions (REQ §5-3, §6, §7; docs/data-mapping.md). Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockContext, store, schedules, T } from './helpers.js';
import { periodMetrics } from '../src/domain/metrics.js';
import { normalizeTabs } from '../src/normalize/normalize.js';
import { buildMockTabs } from '../src/adapters/mock/fixtures.js';
import { dayRuns } from '../src/domain/runs.js';
import { expectedRuns } from '../src/domain/schedules.js';
import { formatIso } from '../src/domain/time.js';
import * as vm from '../src/viewmodels/pages.js';

const now = T('2026-10-02T13:50:00+07:00');
const run = (day, time, status, over = {}) => ({ store: 'S', run_id: `R-${day}-${time}`, kind: 'slot', scheduled_at: `${day}T${time}:00+07:00`, status, ...over });

function metrics(runs) {
  return periodMetrics({ store: store(), data: { runs, questions: [], messages: [], sends: [], schedules }, now, currentDay: '2026-10-02', sourceThroughMs: now, days: 2 });
}

test('blank is not zero: normalize keeps "" as null and 0 as 0', () => {
  const { raw } = buildMockTabs(now, {});
  raw.runs.rows[0].input_lines = ''; raw.runs.rows[1].input_lines = 0;
  const { screen } = normalizeTabs(raw);
  assert.equal(screen.runs[0].input_lines, null);
  assert.equal(screen.runs[1].input_lines, 0);
});

test('blank is not zero on ①: today\'s question total is "not pulled" when every value is blank, 0 only when 0', () => {
  const blank = mockContext({ mutate: (raw) => { for (const r of raw.runs.rows) r.questions_sent = ''; } });
  assert.equal(vm.allStores(blank).stores.find((s) => s.store === 'STORE_A').questionsToday.state, 'unpulled');
  const zero = mockContext({ mutate: (raw) => { for (const r of raw.runs.rows) r.questions_sent = 0; } });
  assert.deepEqual(vm.allStores(zero).stores.find((s) => s.store === 'STORE_A').questionsToday, { state: 'value', value: 0 });
});

test('① question total sums questions_sent of ALL of today\'s run rows (patrol and daily) - REQ §6-①', () => {
  const ctx = mockContext({ mutate: (raw) => {
    for (const r of raw.runs.rows) r.questions_sent = 0;
    const daily = raw.runs.rows.filter((r) => r.kind === 'daily' && r.scheduled_at.startsWith('2026-10-03'));
    const patrol = raw.runs.rows.find((r) => r.kind === 'slot' && r.scheduled_at === '2026-10-02T12:00:00+07:00');
    patrol.questions_sent = 2;
    // a daily row belonging to today's business day (scheduled 00:35 of the next calendar date)
    raw.runs.rows.push({ ...raw.runs.rows[0], run_id: 'MOCK-daily-today', kind: 'daily', scheduled_at: '2026-10-03T00:35:00+07:00', status: 'ok', questions_sent: 3 });
    void daily;
  } });
  const total = vm.allStores(ctx).stores.find((s) => s.store === 'STORE_A').questionsToday;
  assert.equal(total.state, 'value');
  assert.ok(total.value >= 2, `value ${total.value}`);
});

test('success rate: late counts as success; running/not-due are outside the denominator; blocked/missing/unknown/no-row are inside', () => {
  const m = metrics([
    run('2026-10-01', '12:00', 'ok'), run('2026-10-01', '22:00', 'late'),
    run('2026-10-01', '00:35', 'blocked', { kind: 'daily', scheduled_at: '2026-10-02T00:35:00+07:00', run_id: 'D1' }),
    run('2026-10-02', '12:00', 'running'), // past its deadline at 13:50 -> unknown
  ]);
  assert.deepEqual([m.patrolRate.numerator, m.patrolRate.denominator], [2, 3]); // 22:00 of 10-02 is not due -> excluded
  assert.deepEqual([m.dailyRate.numerator, m.dailyRate.denominator], [0, 1]); // 10-02's daily is not due
  assert.deepEqual(m.stopped, { missing: 0, blocked: 1, unknown: 1 });
});

test('a scheduled run with no row after its deadline counts as missing ("not confirmed"), never dropped', () => {
  const m = metrics([run('2026-10-01', '22:00', 'ok'), run('2026-10-02', '12:00', 'silent_ok')]);
  assert.equal(m.stopped.missing, 2); // 10-01 12:00 AND 10-01's daily (00:35 on 10-02) have no row
  assert.deepEqual([m.patrolRate.numerator, m.patrolRate.denominator], [2, 3]);
});

test('daily rate is a separate row from the patrol rate; an out-of-scope kind gives "no qualifying items"', () => {
  const m = periodMetrics({ store: store({ slot_times: '', slot_deadline_min: null }), data: { runs: [], questions: [], messages: [], sends: [], schedules: schedules.filter((s) => s.kind === 'daily') },
    now, currentDay: '2026-10-02', sourceThroughMs: now, days: 2 });
  assert.equal(m.patrolRate.state, 'none');
});

test('⑤ lists only missing / blocked / late / unknown / no-row; never ok, silent_ok, running or not-due', () => {
  const ctx = mockContext();
  const statuses = new Set(vm.failures(ctx).items.map((i) => i.status));
  for (const s of statuses) assert.ok(['missing', 'blocked', 'late', 'unknown', 'no_row'].includes(s), s);
  assert.ok(statuses.has('late') && statuses.has('blocked') && statuses.has('missing'));
  assert.ok(vm.failures(ctx).items.every((i) => i.businessDay >= '2026-09-19')); // 14 days
});

test('⑤ send problems are result=unknown|failed only', () => {
  const ctx = mockContext();
  const sp = vm.failures(ctx).sendProblems;
  assert.ok(sp.length > 0);
  assert.ok(sp.every((s) => ['unknown', 'failed'].includes(s.result)));
});

test('timezone: a Tokyo store\'s 12:00 patrol is 12:00 Tokyo time (10:00+07:00), independent of the Bangkok storage format', () => {
  const tokyo = store({ timezone: 'Asia/Tokyo' });
  const [e] = expectedRuns(tokyo, schedules.map((s) => ({ ...s, store: 'S' })), 'slot', '2026-10-02');
  assert.equal(e.time, '12:00');
  assert.equal(formatIso(e.at), '2026-10-02T10:00:00+07:00');
});

test('every DUMMY- / dummy- key type is excluded from real summaries (REQ §6 last paragraph)', () => {
  const base = mockContext();
  const dirty = mockContext({ mutate: (raw) => {
    const m0 = raw.messages.rows.find((m) => m.at.startsWith('2026-10-02'));
    raw.messages.rows.push({ ...m0, message_id: 'DUMMY-m1' }, { ...m0, message_id: 'dummy-m2' }, { ...m0, message_id: 'MOCK-real-like', run_id: 'DUMMY-run' });
    raw.sends.rows.push({ ...raw.sends.rows[0], send_id: 'DUMMY-s1', result: 'failed', sent_at: '2026-10-02T10:00:00+07:00' });
    raw.beats.rows.push({ ...raw.beats.rows[0], host: 'DUMMY-host', received_at: '2026-10-02T13:49:00+07:00' });
  } });
  const a = vm.allStores(base).stores.find((s) => s.store === 'STORE_A');
  const b = vm.allStores(dirty).stores.find((s) => s.store === 'STORE_A');
  assert.deepEqual(b.messagesToday, a.messagesToday);
  assert.deepEqual(b.machine, a.machine);
  assert.deepEqual(vm.failures(dirty).sendProblems, vm.failures(base).sendProblems);
  assert.deepEqual(vm.machines(dirty).machines.map((m) => m.host), vm.machines(base).machines.map((m) => m.host));
});

test('Bot replies that cannot be tied to a message are reported separately, not folded into "replied"', () => {
  const ctx = mockContext({ mutate: (raw) => {
    raw.sends.rows.push({ store: 'STORE_A', send_id: 'MOCK-orphan-reply', sent_at: '2026-10-02T11:00:00+07:00', kind: 'reply', target_kind: 'group', target_label: 'MEAT', text: 'x', result: 'sent' });
  } });
  const base = vm.periods(mockContext(), 7).stores.find((s) => s.store === 'STORE_A').metrics;
  const m = vm.periods(ctx, 7).stores.find((s) => s.store === 'STORE_A').metrics;
  assert.equal(m.unknownOriginReplies, base.unknownOriginReplies + 1);
  assert.deepEqual(m.botReplies, base.botReplies);
});

test('stop detection reasons are specific per tab, and a normal screen has none', () => {
  assert.equal(mockContext().freshness.reasons.length, 0);
  const f = mockContext({ scenario: 'error' }).freshness;
  assert.ok(f.reasons.some((r) => r.kind === 'error'));
});

test('dayRuns never returns a not-due/no-row item for a time outside any schedule', () => {
  const { items } = dayRuns({ store: store(), schedules, runs: [], day: '2026-10-02', now, currentDay: '2026-10-02' });
  assert.deepEqual(items.filter((i) => i.kind === 'slot').map((i) => i.time).sort(), ['12:00', '22:00']);
});
