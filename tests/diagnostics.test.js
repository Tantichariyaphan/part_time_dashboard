// Read-only diagnostics (scripts/): heartbeat pattern analysis, reconciliation and the timing probe.
// SYNTHETIC rows only (tests/copyFixtures.js); 結果 strings below imitate the documented STRUCTURE (`key=value / ...`) with
// invented free text, so the tests can prove that free text never reaches the output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classOf, parseResult, proposeSlot, shapeOf } from '../scripts/lib/heartbeatPatterns.js';
import { analyze, POLLING_CHANGE_AT } from '../scripts/analyze-heartbeat.js';
import { reconcile } from '../scripts/reconcile.js';
import { observe, summarize } from '../scripts/timing-probe.js';
import { parseCsv } from '../scripts/lib/diag.js';
import { buildContext } from '../src/viewmodels/context.js';
import * as vm from '../src/viewmodels/pages.js';
import { NOW, adapterWith, beat, copyRead, log, metaRow, question, send, testConfig } from './copyFixtures.js';

const FREE = 'INVENTED FREE TEXT 12:00 file.json not for output';
const OFF = 'AI=scheduled-off / 未分析=M3/I0(AI無) / MEAT=無言 / IN=無言';
const RESULT = (meat, inn) => `AI=max-read 40件 / 未分析=M0/I0 / MEAT=${meat} / IN=${inn}`;
const STOP = `AI=${FREE} / STOP=analysis-unverified / owner=pc-confirmed`;

test('DIAG-1 結果 parsing: classes, codes, digit-masked shapes; free text never returned', () => {
  assert.equal(classOf(parseResult(OFF)), 'scheduled_off');
  assert.equal(classOf(parseResult(RESULT('AIOK', '無言'))), 'ai_result');
  assert.equal(classOf(parseResult(STOP)), 'stop');
  assert.equal(classOf(parseResult(`AI=${FREE}`)), 'other');
  assert.equal(classOf(parseResult('')), 'blank');
  const p = parseResult(STOP);
  assert.equal(p.stop, 'analysis-unverified');
  assert.equal(p.owner, 'pc-confirmed');
  assert.equal(parseResult(`AI=x / STOP=${FREE}`).stop, '<text>', 'a STOP value that is not a short code is withheld');
  assert.equal(shapeOf(STOP), 'AI=<text> / STOP=analysis-unverified / owner=pc-confirmed');
  assert.equal(shapeOf(RESULT('AIOK', '無言')), 'AI=max-read #件 / 未分析=M#/I# / MEAT=AIOK / IN=無言');
  assert.equal(shapeOf('AI=scheduled-off / 規則影2件(送らない) / MEAT=名前 / IN=無言'), 'AI=scheduled-off / 規則影#件(送らない) / MEAT=<other> / IN=無言');
  for (const s of [STOP, `AI=${FREE}`, `${FREE} / AI=scheduled-off`]) assert.equal(shapeOf(s).includes('INVENTED'), false);
});

test('DIAG-2 proposed slot reading: scheduled-off / heartbeat alone never give PASS or FAIL', () => {
  const r = (cls, meat = '無言', inn = '無言', stop = null) => ({ class: cls, parsed: { stop }, sendMeat: meat, sendIn: inn });
  const before = { afterPollingChange: false };
  assert.deepEqual(proposeSlot([], 0, before), { proposed: 'unconfirmed', basis: 'no_heartbeat_row_in_window' });
  assert.deepEqual(proposeSlot([], 3, before), { proposed: 'unconfirmed', basis: 'no_result_row_in_window' }, 'only scheduled-off rows -> not judged');
  assert.equal(proposeSlot([r('ai_result', '送', '無言')], 2, before).proposed, 'ok');
  assert.equal(proposeSlot([r('ai_result')], 2, before).proposed, 'silent_ok');
  assert.equal(proposeSlot([r('stop', '-', '-', 'analysis-unverified')], 2, before).proposed, 'blocked');
  assert.equal(proposeSlot([r('ai_result'), r('ai_result')], 2, before).proposed, 'unknown');
  assert.equal(proposeSlot([r('other')], 2, before).proposed, 'unknown');
  assert.equal(proposeSlot([r('ai_result', '<other>', '無言')], 2, before).proposed, 'unknown');
  // after the client's 2026-10-05 23:36 change the slot no longer sends: ok / silent_ok cannot be told apart
  assert.equal(proposeSlot([r('ai_result', '送', '送')], 2, { afterPollingChange: true }).proposed, 'completed_count_unknown');
});

test('DIAG-3 analyze-heartbeat: hourly checks around the slots, send-log cross-check, daily window; no free text out', () => {
  const tz = 'Asia/Bangkok';
  const { stores: [store], schedules } = testConfig();
  const day = '2026-09-29';
  const hb = (hh, text, meat = '無言', inn = '無言') => ({ 時刻: `${day.replace(/-/g, '/')} ${hh}:13:16`, 読んだ行数: '3', 候補数: '0', 送信MEAT: meat, 送信IN: inn, 結果: text, 実行ms: '1000', gap分: '60' });
  const rows = [];
  for (let h = 10; h <= 23; h += 1) rows.push(hb(String(h).padStart(2, '0'), OFF));
  rows[3] = hb('13', RESULT('AIOK', '無言'), '送', '無言'); // 12:00 slot result 73 min later, MEAT sent
  rows[13] = hb('23', STOP, '-', '-');
  const sends = [{ 日時: `${day} 13:13:30`.replace(/-/g, '/'), 宛先: 'MEAT', 結果: 'OK', 文面: FREE }];
  const o = analyze({ heartbeatRows: rows, sendRows: sends, tz, store: { ...store, timezone: tz }, schedules, label: 'TEST' });
  assert.equal(o.rows, 14);
  assert.deepEqual(o.classes, { scheduled_off: 12, ai_result: 1, stop: 1 });
  assert.equal(o.sendLogCrossCheck['MEAT 送: send-log row within 2 min'], 1);
  const slots = Object.fromEntries(o.slots.map((s) => [`${s[0]} ${s[1]}`, s[6]]));
  assert.ok(Object.values(slots).length >= 1);
  assert.ok(Object.values(slots).every((x) => ['ok', 'silent_ok', 'blocked', 'unknown', 'unconfirmed', 'completed_count_unknown'].includes(x)));
  assert.equal(JSON.stringify(o).includes('INVENTED'), false, 'free text never in the output');
  assert.ok(POLLING_CHANGE_AT > Date.parse('2026-10-05T00:00:00+07:00'));
});

test('DIAG-4 CSV reader: quotes, embedded commas / newlines, BOM', () => {
  const t = parseCsv('﻿a,b\r\n1,"x, ""y""\nz"\r\n2,\r\n');
  assert.deepEqual(t.header, ['a', 'b']);
  assert.deepEqual(t.rows, [['1', 'x, "y"\nz'], ['2', '']]);
});

test('DIAG-5 reconcile: SOURCE = TRANSFORMED = SCREEN on synthetic rows (meta self-row, rounded id, resend, cancel); counts only', async () => {
  const read = copyRead({
    log: [log({ 日時: '2026-10-07T10:00:00+07:00', 内容: 'สวัสดีทดสอบ <b>x</b>' }), log({ 日時: '2026-10-06T10:00:00+07:00' }), log({ 日時: '2026-10-06T11:00:00+07:00', 取消: '取消' }),
      log({ 元の行番号: '4242', 日時: '2026-10-06T12:00:00+07:00', messageId: '1.23457E+17' }),
      log({ 日時: '2026-10-05T12:00:00+07:00', messageId: '900000000000000777' }), log({ 日時: '2026-10-05T12:00:30+07:00', messageId: '900000000000000777', 再送: '再送' })],
    sendLog: [send({ 結果: 'NG(timeout)' }), send({ 日時: '2026-10-06T09:00:00+07:00' })],
    questions: [question({ 送信時刻: '2026-10-06T09:00:00+07:00' })],
    meta: ['ログ', '送信ログ', 'AI質問追跡', '心拍', 'meta'].map((t) => metaRow(t)),
  });
  const o = await reconcile({ read, adapterConfig: testConfig({ timezone: 'Asia/Bangkok' }), now: NOW });
  assert.equal(o.metaSelfRows, 1);
  assert.deepEqual(o.checks.filter((c) => c.result !== 'match'), []);
  assert.deepEqual(o.roundedIds, { sourceRows: 1, rowNumbers: ['4242'], shownAsRowKey: 1, flagged: 1 });
  assert.equal(o.duplicateMessageIds.withResendMark, 1);
  const d6 = o.messagesPerDay.find((d) => d.day === '2026-10-06');
  assert.deepEqual([d6.src, d6.srcDistinct, d6.transformed, d6.screenItems, d6.cancelled, d6.damaged], [3, 3, 3, 3, 1, 1]);
  assert.equal(o.messagesPerDay.find((d) => d.day === '2026-10-07').textExact, 1, 'Thai text with markup compared character by character');
  assert.equal(o.sendsPerDay.find((d) => d.day === '2026-10-07').screenProblems, 1);
  assert.equal(o.questionsPerDay.find((d) => d.day === '2026-10-06').confirmed, 0);
  const json = JSON.stringify(o);
  for (const leak of ['สวัสดี', 'Staff One', '900000000000000777', '1.23457E+17', 'hello', 'question ']) assert.equal(json.includes(leak), false, leak);
  assert.equal(/reply \d/.test(json), false, 'send text');
});

test('DIAG-6 reconcile shows a blocked tab as a difference instead of hiding it', async () => {
  const read = copyRead({ log: [log({ 日時: '2026-10-06T10:00:00+07:00' }), log({ 日時: '2026-10-06T11:00:00+07:00', 取消: 'x' })] }); // 取消 must be blank or 取消
  const o = await reconcile({ read, adapterConfig: testConfig({ timezone: 'Asia/Bangkok' }), now: NOW });
  assert.ok(o.checks.some((c) => c.result === 'MISMATCH' && c.name.startsWith('ログ: passed the contract check')));
  const d = o.messagesPerDay.find((x) => x.day === '2026-10-06');
  assert.deepEqual([d.src, d.transformed], [2, 0]);
  assert.ok(o.unexplained.some((u) => u.includes('blocked')));
});

test('DIAG-7 timing probe: first-seen delay of a new row, banner consistent with the raw read, stop seen when the copy is old', async () => {
  const cfg = testConfig({ timezone: 'Asia/Bangkok' });
  const seen = new Map();
  const probe = async (read, at, first) => {
    const { adapter } = adapterWith({ copy: read, config: cfg, now: () => at });
    return observe({ read, at, tz: 'Asia/Bangkok', ctx: buildContext(await adapter.load()), seen, firstProbe: first });
  };
  const base = [log({ 元の行番号: '1' })];
  const fixed = { sendLog: [send({ 元の行番号: '501' })], questions: [question({ 元の行番号: '701' })], heartbeat: [beat({ 元の行番号: '801' })] };
  const copyRead2 = (o) => copyRead({ ...fixed, ...o });
  const p1 = await probe(copyRead2({ log: base }), NOW, true);
  assert.deepEqual(p1.newRows, []);
  const p2 = await probe(copyRead2({ log: [...base, log({ 元の行番号: '2', 日時: '2026-10-07T13:54:00+07:00' })] }), NOW + 60000, false);
  assert.deepEqual(p2.newRows.map((r) => [r.row, r.readerSeesAfterMin]), [['2', 7]]);
  assert.equal(p2.dashboard.banner, 'normal');
  assert.equal(p2.bannerConsistent, true);
  // copy last read 25 minutes before the probe -> both the raw read and the dashboard say "stopped"
  const old = ['ログ', '送信ログ', 'AI質問追跡', '心拍', 'meta'].map((t) => metaRow(t, { last_read_at: '2026-10-07T13:35:00+07:00' }));
  const p3 = await probe(copyRead2({ log: base, meta: old }), NOW, false);
  assert.equal(p3.expectedBanner, 'stopped');
  assert.equal(p3.dashboard.banner, 'stopped');
  assert.equal(p3.bannerConsistent, true);
  const s = summarize([p1, p2, p3], { intervalSec: 60 });
  assert.equal(s.stopObserved, true);
  assert.deepEqual(s.bannerInconsistent, []);
  assert.equal(JSON.stringify(s).includes('hello'), false);
});

test('DIAG-8 the dashboard is unchanged by the proposal: run status stays not judged on the copy adapter', async () => {
  const r = await adapterWith({ copy: copyRead({ heartbeat: [beat({ 結果: RESULT('AIOK', 'AIOK'), 時刻: '2026-10-07T13:13:00+07:00' }), beat({ 結果: STOP })] }) }).adapter.load();
  const ctx = buildContext(r);
  assert.equal(ctx.screen.runs.length, 0);
  const statuses = vm.today(ctx, 'S').days.flatMap((d) => d.items.map((i) => i.status));
  assert.ok(statuses.every((s) => s === 'unconfirmed' || s === 'not_due'));
});
