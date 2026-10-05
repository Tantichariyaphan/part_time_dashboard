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
