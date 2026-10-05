import test from 'node:test';
import assert from 'node:assert/strict';
import { lightCheck, machineView, storeMachine, latestPerMachine } from '../src/domain/production.js';
import { store, T } from './helpers.js';

const beat = (over) => ({ host: 'h1', role: 'production', received_at: '2026-10-02T13:45:00+07:00', verify: 'PASS', text_patrol_at: null, ...over });

test('production heartbeat: red only when older than 15 minutes', () => {
  const now = T('2026-10-02T14:00:00+07:00');
  assert.equal(machineView(beat({ received_at: '2026-10-02T13:45:00+07:00' }), now).heartbeatRed, false); // exactly 15
  assert.equal(machineView(beat({ received_at: '2026-10-02T13:44:00+07:00' }), now).heartbeatRed, true);
});

test('verify=FAIL is red; a standby is never judged by age', () => {
  const now = T('2026-10-02T14:00:00+07:00');
  assert.equal(machineView(beat({ verify: 'FAIL' }), now).red, true);
  const sb = machineView(beat({ role: 'standby', received_at: '2026-10-01T00:00:00+07:00' }), now);
  assert.equal(sb.ageJudged, false);
  assert.equal(sb.heartbeatRed, false);
});

test('a healthy standby does NOT substitute for a stopped production machine', () => {
  const now = T('2026-10-02T14:00:00+07:00');
  const beats = [beat({ received_at: '2026-10-02T12:00:00+07:00' }), beat({ host: 'h2', role: 'standby', received_at: '2026-10-02T13:59:00+07:00' })];
  assert.equal(storeMachine(store(), beats, now).state, 'red');
});

test('production machine = host equals stores.production_host AND role = production', () => {
  const now = T('2026-10-02T14:00:00+07:00');
  const onlyOtherHost = [beat({ host: 'h9' })];
  assert.equal(storeMachine(store(), onlyOtherHost, now).state, 'unknown');
  const wrongRole = [beat({ role: 'standby' })];
  assert.equal(storeMachine(store(), wrongRole, now).state, 'unknown');
  assert.equal(storeMachine(store(), null, now).state, 'not_connected');
});

test('DUMMY- hosts are ignored', () => {
  assert.deepEqual(latestPerMachine([beat({ host: 'DUMMY-h1' })]), []);
});

test('light check boundaries (TV14): window start, +20 min, after midnight', () => {
  const s = store();
  const beats = [beat({ received_at: '2026-10-02T10:19:00+07:00', text_patrol_at: '2026-10-01T23:50:00+07:00' })];
  // 10:00 sharp: silence is counted from the window start -> 0 min -> ok
  assert.equal(lightCheck(s, beats, T('2026-10-02T10:00:00+07:00')).state, 'ok');
  // 10:20: 20 min since the window start, last run was yesterday -> red
  assert.equal(lightCheck(s, beats, T('2026-10-02T10:20:00+07:00')).state, 'red');
  // 01:00 next day: outside 10:00-24:00 -> off hours, never red
  assert.equal(lightCheck(s, beats, T('2026-10-03T01:00:00+07:00')).state, 'off_hours');
});

test('light check: 15 minutes is not red, 16 is; blank text_patrol is out of scope', () => {
  const s = store();
  const mk = (at) => [beat({ text_patrol_at: at })];
  assert.equal(lightCheck(s, mk('2026-10-02T12:00:00+07:00'), T('2026-10-02T12:15:00+07:00')).state, 'ok');
  assert.equal(lightCheck(s, mk('2026-10-02T12:00:00+07:00'), T('2026-10-02T12:16:00+07:00')).state, 'red');
  assert.equal(lightCheck(store({ text_patrol: null }), [], T('2026-10-02T12:00:00+07:00')).state, 'out_of_scope');
  assert.equal(lightCheck(s, null, T('2026-10-02T12:00:00+07:00')).state, 'not_connected');
});
