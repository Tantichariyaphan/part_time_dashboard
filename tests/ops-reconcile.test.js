// scripts/ops-reconcile.js on SYNTHETIC rows (tests/copyFixtures.js). Checks what it may and may not conclude, and that it
// prints no free text. Says nothing about the live 10/20 runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyRead, heartbeatRead, beatsRow, beat, send, testConfig } from './copyFixtures.js';
import { store } from './helpers.js';
import { opsReconcile, heartbeatCodes } from '../scripts/ops-reconcile.js';

const cfg = testConfig({ timezone: 'Asia/Bangkok', stores: [store({ production_host: 'h1', slot_times: '12:00,17:00,22:00', slot_deadline_min: 90 })],
  schedules: [{ store: 'S', kind: 'slot', times: '12:00,17:00,22:00', valid_from: '2026-10-02', valid_to: null }, { store: 'S', kind: 'daily', times: '00:35', valid_from: '2026-01-01', valid_to: null }] });
const at = (iso) => `${iso}+07:00`;

test('OPS-1 one business day: five states kept apart; nothing the evidence cannot prove is concluded', async () => {
  const copy = copyRead({
    heartbeat: [beat({ 時刻: at('2026-10-20T13:13:00'), 結果: 'AI=slot-readonly / ROUTE=fast-patrol / secret words' }), beat({ 時刻: at('2026-10-20T11:13:00'), 結果: 'AI=scheduled-off' })],
    sendLog: [send({ 日時: at('2026-10-21T00:32:00'), 宛先の群: 'ALL', 文面: 'daily body' }), send({ 日時: at('2026-10-21T00:32:00'), 宛先の群: 'OWNER', 宛先: 'Owner Name', 文面: 'daily body' }), send({ 日時: at('2026-10-21T03:00:00'), 宛先の群: 'MEAT' })],
  });
  const beats = [];
  for (let m = 0; m <= 14 * 60; m += 5) { // 10:00 .. 24:00 every 5 min; one 25-minute hole at 15:00
    const t = Date.parse(at('2026-10-20T10:00:00')) + m * 60000;
    if (m >= 300 && m < 325) continue;
    const iso = new Date(t + 7 * 3600000).toISOString().slice(0, 19) + '+07:00';
    beats.push(beatsRow({ received_at: iso, text_patrol_at: iso }));
  }
  beats.push(beatsRow({ host: 'h2', role: 'standby', received_at: at('2026-10-20T15:10:00'), text_patrol_at: at('2026-10-20T15:10:00') }));
  const o = await opsReconcile({ copy, heartbeat: heartbeatRead({ beats }), adapterConfig: cfg, day: '2026-10-20', now: Date.parse(at('2026-10-21T09:00:00')) });

  assert.deepEqual(o.scheduledReads.map((s) => [s.slot, s.deadline, s.screen]), [['12:00', '13:30', 'unconfirmed'], ['17:00', '18:30', 'unconfirmed'], ['22:00', '23:30', 'unconfirmed']]);
  assert.deepEqual(o.scheduledReads[0].gasCodes, { 'AI=slot-readonly': 1, 'ROUTE=fast-patrol': 1 }, 'auxiliary codes only');
  assert.ok(o.scheduledReads.every((s) => s.evidenceReadable === false));
  assert.equal(o.dailyDelivery.screen, 'unconfirmed');
  assert.equal(o.dailyDelivery.screenLabel, '3 経路判定未接続');
  assert.deepEqual(o.dailyDelivery.gasSendLogRows, [{ at: '00:32', cls: 'ALL', result: 'sent' }, { at: '00:32', cls: 'OWNER', result: 'sent' }], 'window D+1 00:00 .. deadline+60, MEAT reply at 03:00 excluded');
  assert.equal(o.fiveMinutePatrol.maxGapMin, 30, '14:55 -> 15:25');
  assert.deepEqual(o.fiveMinutePatrol.over20From, ['14:55-15:25']);
  assert.equal(o.fiveMinutePatrol.runsSeen, 163, 'the standby 15:10 row is not a production run');
  assert.equal(o.fiveMinutePatrol.screen, '最終稼働時刻のみ確認／全件判定未接続');
  assert.equal(o.machine.standbyRowsIgnored, 1);
  assert.equal(o.machine.pass, o.machine.rows);
  const text = JSON.stringify(o);
  for (const bad of ['secret words', 'daily body', 'Owner Name', 'Staff One']) assert.ok(!text.includes(bad), `no free text: ${bad}`);
});

test('OPS-2 GAS 心拍 codes: fixed markers only, free text never kept', () => {
  assert.deepEqual(heartbeatCodes('AI=これは自由文 / STOP=analysis-unverified / owner=pc-confirmed'), ['STOP=analysis-unverified']);
  assert.deepEqual(heartbeatCodes('anything else'), ['(other)']);
});

test('OPS-3 with the client evidence tabs: per-slot status, daily routes, 5-min record counts; print() runs and shows no free text', async () => {
  const { print } = await import('../scripts/ops-reconcile.js');
  const { EVIDENCE_TAB } = await import('../src/contract/evidenceContract.js');
  const copy = copyRead();
  const tbl = (header, rows) => ({ header, rows: rows.map((r) => header.map((h) => r[h] ?? '')) });
  copy.tables[EVIDENCE_TAB.slot] = tbl(['run_id', 'scheduled_at', 'started_at', 'finished_at', 'source_complete', 'status', 'reason'], [
    { run_id: 'a', scheduled_at: at('2026-10-20T12:00:00'), finished_at: at('2026-10-20T12:04:00'), status: 'ok', source_complete: 'TRUE' },
    { run_id: 'b', scheduled_at: at('2026-10-20T22:00:00'), status: 'fail', reason: 'safety stop secret', source_complete: 'TRUE' }]);
  copy.tables[EVIDENCE_TAB.daily] = tbl(['business_date', 'route', 'attempted_at', 'status', 'body_sha256', 'body_changed_after_attempt'],
    ['staff_all_line', 'owner_line', 'owner_email'].map((route) => ({ business_date: '2026-10-20', route, attempted_at: at('2026-10-21T00:32:00'), status: 'sent', body_sha256: 'c'.repeat(64), body_changed_after_attempt: 'FALSE' })));
  copy.tables[EVIDENCE_TAB.patrol] = tbl(['at', 'host', 'send', 'issues', 'audit_issues', 'google_beat', 'owner'], [
    { at: at('2026-10-20T12:00:00'), host: 'h1', send: 'TRUE', issues: '0', audit_issues: '0', google_beat: 'ok', owner: 'new' },
    { at: at('2026-10-20T12:05:00'), host: 'h1', send: 'TRUE', issues: '1', audit_issues: '0', google_beat: 'ok', owner: 'new' },
    { at: at('2026-10-20T12:05:00'), host: 'h2', send: 'TRUE', issues: '0', audit_issues: '0', google_beat: 'ok', owner: 'new' }]);
  copy.titles.push(...Object.values(EVIDENCE_TAB));
  const o = await opsReconcile({ copy, heartbeat: null, adapterConfig: cfg, day: '2026-10-20', now: Date.parse(at('2026-10-21T09:00:00')) });
  assert.deepEqual(o.scheduledReads.map((s) => [s.slot, s.screen]), [['12:00', 'ok'], ['17:00', 'no_evidence'], ['22:00', 'blocked']]);
  assert.equal(o.dailyDelivery.screen, 'ok');
  assert.deepEqual(o.dailyDelivery.routes.map((r) => r.status), ['sent', 'sent', 'sent']);
  assert.deepEqual(o.fiveMinutePatrol.evidenceRows, { rows: 2, clean: 1, ownerNew: 2, ownerMissing: 0, otherHostsIgnored: 1 });
  const lines = [];
  const orig = console.log; console.log = (...a) => lines.push(a.join(' '));
  try { print(o); } finally { console.log = orig; }
  assert.ok(lines.join('\n').includes('日次配送'));
  assert.ok(!lines.join('\n').includes('safety stop secret'), 'client free text is not printed');
});
