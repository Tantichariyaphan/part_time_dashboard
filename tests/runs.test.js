import test from 'node:test';
import assert from 'node:assert/strict';
import { dayRuns, effectiveRunStatus } from '../src/domain/runs.js';
import { store, schedules, T } from './helpers.js';

const now = T('2026-10-02T13:50:00+07:00');
const run = (over) => ({ store: 'S', run_id: 'MOCK-R1', kind: 'slot', scheduled_at: '2026-10-02T12:00:00+07:00', status: 'ok', ...over });
const list = (runs, s = store(), at = now) => dayRuns({ store: s, schedules, runs, day: '2026-10-02', now: at, currentDay: '2026-10-02' });

test('a row still `running` past its deadline becomes unknown (TV25)', () => {
  const r = effectiveRunStatus(run({ status: 'running' }), store(), now);
  assert.equal(r.status, 'unknown');
  assert.equal(effectiveRunStatus(run({ status: 'running' }), store(), T('2026-10-02T12:30:00+07:00')).status, 'running');
});

test('an unrecognized status is unknown, never silently ok', () => {
  assert.equal(effectiveRunStatus(run({ status: 'weird' }), store(), now).status, 'unknown');
});

test('scheduled run without a row: no_row after the deadline, not_due before it', () => {
  const { items } = list([]);
  const slot = (t) => items.find((i) => i.kind === 'slot' && i.time === t);
  assert.equal(slot('12:00').status, 'no_row'); // 12:00 + 60 min < 13:50
  assert.equal(slot('22:00').status, 'not_due');
});

test('out-of-scope kind (blank column, no schedule history) is not counted as missing', () => {
  const dailyOnly = schedules.filter((x) => x.kind === 'daily');
  const { items } = dayRuns({ store: store({ slot_times: '', slot_deadline_min: null }), schedules: dailyOnly, runs: [], day: '2026-10-02', now, currentDay: '2026-10-02' });
  assert.equal(items.filter((i) => i.kind === 'slot').length, 0);
  assert.ok(items.some((i) => i.kind === 'daily'));
});

test('stores vs schedules disagreement is flagged, not guessed', () => {
  const { items, unconfirmedSchedule } = list([], store({ slot_times: '11:00,21:00' }));
  assert.equal(unconfirmedSchedule.slot, true);
  assert.equal(items.filter((i) => i.kind === 'slot').length, 0);
});

test('an existing row is returned with its own status', () => {
  const { items } = list([run({ status: 'late' })]);
  assert.equal(items.find((i) => i.time === '12:00').status, 'late');
});

// Client 2026-10-14: a run whose time has passed is never shown as 時刻前 (not_due); until its deadline it is `awaiting`
// (結果待ち), after it `no_row` / `unconfirmed` - three different keys, never mixed.
test('RUN-AWAIT before its time = not_due, from its time to the deadline = awaiting, after the deadline = no_row', () => {
  const at = (hm) => T(`2026-10-02T${hm}:00+07:00`);
  const slot12 = (when) => list([], store(), at(when)).items.find((i) => i.kind === 'slot' && i.time === '12:00').status;
  assert.equal(slot12('11:59'), 'not_due');
  assert.equal(slot12('12:00'), 'awaiting');
  assert.equal(slot12('12:30'), 'awaiting');
  assert.equal(slot12('13:30'), 'no_row'); // deadline 60 min in the test store
});

test('RUN-AWAIT the same split when run status is not judged (Q-49): not_due / awaiting / unconfirmed', () => {
  const at = (hm) => T(`2026-10-02T${hm}:00+07:00`);
  const slot12 = (when) => dayRuns({ store: store(), schedules, runs: [], day: '2026-10-02', now: at(when), currentDay: '2026-10-02', statusUnconfirmed: true })
    .items.find((i) => i.kind === 'slot' && i.time === '12:00').status;
  assert.equal(slot12('11:59'), 'not_due');
  assert.equal(slot12('12:10'), 'awaiting');
  assert.equal(slot12('13:30'), 'unconfirmed');
});

test('RUN-AWAIT boundaries are exact (1 ms) and the daily run follows the same rule across midnight', () => {
  const ms = (iso) => T(iso);
  const status = (kind, time, now, unconfirmed = false) => dayRuns({ store: store(), schedules, runs: [], day: '2026-10-02', now, currentDay: '2026-10-02', statusUnconfirmed: unconfirmed })
    .items.find((i) => i.kind === kind && i.time === time).status;
  const at = ms('2026-10-02T12:00:00+07:00');
  assert.equal(status('slot', '12:00', at - 1), 'not_due');
  assert.equal(status('slot', '12:00', at), 'awaiting');
  assert.equal(status('slot', '12:00', at + 60 * 60000 - 1), 'awaiting');
  assert.equal(status('slot', '12:00', at + 60 * 60000), 'no_row'); // exactly at the deadline: no longer awaiting
  assert.equal(status('slot', '12:00', at + 60 * 60000, true), 'unconfirmed');
  // daily 00:35 of business day 10/02 is on 10/03 (business day starts 05:00, Asia/Bangkok)
  const d = ms('2026-10-03T00:35:00+07:00');
  assert.equal(status('daily', '00:35', d - 1), 'not_due');
  assert.equal(status('daily', '00:35', d + 1), 'awaiting');
  assert.equal(status('daily', '00:35', d + 60 * 60000), 'no_row');
});

test('RUN-AWAIT awaiting is never counted: not a success, not a failure, not in a rate denominator', async () => {
  const { IN_PROGRESS, NOT_JUDGED, SUCCESS } = await import('../src/domain/runs.js');
  assert.ok(IN_PROGRESS.has('awaiting'));
  assert.ok(!SUCCESS.has('awaiting') && !NOT_JUDGED.has('awaiting'));
});
