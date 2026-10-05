// Prototype data follows the SHAPE of the client's Source sample (docs/sample data_20261005), and the pages expose the
// registry-key relationships between messages, questions, runs, sends and machines. Synthetic data only: nothing in the
// fixtures comes from the sample's content, and nothing here is evidence about the real Source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mockContext, T } from './helpers.js';
import * as vm from '../src/viewmodels/pages.js';
import { messageBody } from '../public/app/lib/present.js';
import { S } from '../public/app/strings.ja.js';

const NOW = T('2026-10-02T13:50:00+07:00');
const slotKey = (iso) => iso.slice(0, 16).replace(/[-T:]/g, '');

test('SHAPE-1 patrol questions go to MEAT / IN only, carry their slot in question_id, and each group has its own send', () => {
  const ctx = mockContext();
  const { questions, runs, sends } = ctx.screen;
  assert.ok(questions.length > 0);
  for (const q of questions) {
    assert.ok(['MEAT', 'IN'].includes(q.group), q.question_id);
    const run = runs.find((r) => r.run_id === q.run_id);
    assert.ok(run, `run of ${q.question_id}`);
    assert.ok(q.question_id.includes(`-${slotKey(run.scheduled_at)}-${q.group}-`), q.question_id);
    const send = sends.find((s) => s.send_id === q.send_id);
    assert.ok(send, `send of ${q.question_id}`);
    assert.equal(send.kind, 'question'); assert.equal(send.target_kind, 'group'); assert.equal(send.target_label, q.group);
  }
});

test('SHAPE-2 daily report goes to ALL and OWNER; owner alerts exist; images dominate; photo/sticker/other carry no text', () => {
  const { sends, messages } = mockContext().screen;
  const daily = sends.filter((s) => s.kind === 'daily');
  assert.ok(daily.some((s) => s.target_label === 'ALL' && s.target_kind === 'group'));
  assert.ok(daily.some((s) => s.target_label === 'OWNER' && s.target_kind === 'owner'));
  assert.ok(sends.some((s) => s.kind === 'alert' && s.target_kind === 'owner'));
  const kinds = messages.reduce((o, m) => ({ ...o, [m.kind]: (o[m.kind] ?? 0) + 1 }), {});
  assert.ok(kinds.photo > kinds.text, JSON.stringify(kinds));
  assert.ok(kinds.other > 0 && kinds.sticker > 0);
  for (const m of messages.filter((x) => x.kind !== 'text')) assert.equal(m.text, null, `${m.kind} ${m.message_id}`); // blank stays blank
  assert.equal(messageBody({ kind: 'other', text: null }), S.otherKind);
  assert.equal(messageBody({ kind: 'photo', text: null }), S.photo);
  assert.equal(messageBody({ kind: 'text', text: '<b>x</b>' }), '<b>x</b>');
});

test('LINK-1 ③ messages carry the patrol (run_id) and the question they may answer, by registry keys only', () => {
  const ctx = mockContext({ scenario: 'phase1', now: NOW, mutate: (raw) => { raw.messages.rows.at(-1).run_id = 'MOCK-no-such-run'; } });
  const days = [...new Set(ctx.screen.messages.map((m) => m.at.slice(0, 10)))];
  const items = days.flatMap((d) => vm.messages(ctx, 'STORE_A', d).items);
  const withRun = items.filter((m) => m.run?.found);
  assert.ok(withRun.length > 0);
  for (const m of withRun) {
    const row = ctx.screen.runs.find((r) => r.run_id === m.run.run_id);
    assert.equal(m.run.scheduledAt, row.scheduled_at);
    assert.ok(m.run.status);
  }
  assert.ok(items.some((m) => m.run && m.run.found === false), 'unknown run_id is reported, not guessed');
  for (const m of items.filter((x) => !x.run)) assert.equal(ctx.screen.messages.find((r) => r.message_id === m.message_id).run_id, null);
  const answered = items.filter((m) => m.question);
  assert.ok(answered.length > 0);
  for (const m of answered) {
    assert.equal(m.question.link, 'candidate', 'phase 1: never confirmed');
    assert.ok(m.question.found && m.question.sent_at);
  }
});

test('LINK-2 ④ questions show their patrol and whether LINE accepted the send; answers point to their business day on ③', () => {
  const ctx = mockContext({ scenario: 'phase1', now: NOW });
  const page = vm.questions(ctx, 'STORE_A');
  assert.ok(page.items.length > 0);
  for (const q of page.items) {
    assert.ok(q.run?.found, q.question_id); assert.ok(q.send?.found, q.question_id);
    assert.ok(['sent', 'unknown', 'failed'].includes(q.send.result));
    for (const a of q.answers) {
      assert.equal(a.link, 'candidate');
      assert.match(a.businessDay, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(vm.messages(ctx, 'STORE_A', a.businessDay).items.some((m) => m.message_id === a.message_id), 'the answer is listed on that ③ day');
    }
  }
  assert.equal(page.answerEvidence, 'CANDIDATE');
});

test('LINK-3 ② run detail adds the run record and its question sends; ⑤ rows know whether ② still lists them', () => {
  const ctx = mockContext({ now: NOW });
  const withQ = ctx.screen.runs.find((r) => ctx.screen.questions.some((q) => q.run_id === r.run_id));
  const d = vm.runDetail(ctx, 'STORE_A', withQ.run_id);
  assert.equal(d.run.run_id, withQ.run_id);
  assert.ok('evidence' in d.run && 'posted_at' in d.run && 'updated_at' in d.run);
  assert.ok(d.sends.length >= 1 && d.sends.every((s) => s.found && s.kind === 'question'));
  const f = vm.failures(ctx);
  assert.ok(f.items.some((i) => i.onTodayPage) && f.items.some((i) => !i.onTodayPage));
  for (const s of f.sendProblems) assert.match(s.businessDay, /^\d{4}-\d{2}-\d{2}$/);
});

test('LINK-4 ⑥ lists each machine\'s beats of the last 60 minutes (newest first, FAIL kept) and the age of each generated_at', () => {
  const ctx = mockContext({ now: NOW });
  const m = vm.machines(ctx);
  assert.equal(m.beatIntervalMin, 5);
  const prod = m.machines.find((x) => x.role === 'production');
  assert.ok(prod.recent.length >= 1 && prod.recent.length <= 12);
  const times = prod.recent.map((b) => Date.parse(b.received_at));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.ok(times.every((t) => NOW - t < 3600000 && t <= NOW));
  assert.ok(prod.recent.some((b) => b.verify === 'FAIL'));
  for (const u of m.updates) assert.equal(typeof u.generatedAgeMin, 'number');
});

test('LINK-5 none of the new reference fields carries a forbidden field or a URL', () => {
  const ctx = mockContext({ now: NOW });
  const body = JSON.stringify([vm.messages(ctx, 'STORE_A', '2026-10-02'), vm.questions(ctx, 'STORE_A'), vm.failures(ctx), vm.machines(ctx)]);
  assert.equal(/userId|宛先ID|画像URL|グループID|https?:\/\//.test(body), false);
});
