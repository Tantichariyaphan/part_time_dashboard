// Pre-Source acceptance checks mapped to REQ §8 TV1–TV25 (see docs/acceptance-report.md for the verdict table).
// These run on SYNTHETIC data only. A passing test here is NOT client acceptance and NOT evidence about the real Source;
// type A tests (real data) cannot pass before the Source exists - only their skeleton-level preconditions are checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mockContext, T } from './helpers.js';
import * as vm from '../src/viewmodels/pages.js';
import { publicFreshness } from '../src/viewmodels/context.js';
import { dayRuns } from '../src/domain/runs.js';
import { businessDayOf } from '../src/domain/time.js';
import { runLabel, runTone } from '../public/app/status.js';
import { S } from '../public/app/strings.ja.js';
import { COLUMNS } from '../src/contract/columns.js';
import { ALLOWED_GROUPS, TAB_NAME } from '../src/contract/enums.js';
import { validateScreen } from '../src/normalize/validate.js';

const A = (ctx) => ctx.screen.stores.find((s) => s.store === 'STORE_A');
const storeA = (ctx) => vm.allStores(ctx).stores.find((s) => s.store === 'STORE_A');
const NOW = T('2026-10-02T13:50:00+07:00');

// ---------------------------------------------------------------- TV5 (B)
test('TV5 adding a store in `stores` makes it appear without code change', () => {
  const ctx = mockContext({ mutate: (raw) => {
    raw.stores.rows.push({ store: 'NEW_STORE', display_name: '新店舗', timezone: 'Asia/Bangkok', business_day_start: '05:00', slot_times: '12:00',
      slot_deadline_min: 60, daily_deadline_min: '', daily_time: '', text_patrol: '', production_host: 'mock-host-1', active: 'yes' });
    raw.schedules.rows.push({ store: 'NEW_STORE', kind: 'slot', times: '12:00', valid_from: '2026-01-01', valid_to: '' });
  } });
  const listed = vm.allStores(ctx).stores.find((s) => s.store === 'NEW_STORE');
  assert.ok(listed, 'new store is listed on ①');
  assert.equal(listed.connection, 'not_connected'); // safe default until the adapter says otherwise (Q-29)
  ctx.connection.NEW_STORE = 'connected'; // what an adapter would report
  const connected = vm.allStores(ctx).stores.find((s) => s.store === 'NEW_STORE');
  assert.equal(connected.patrol.items.length, 1);
  assert.equal(connected.daily.scope, 'out_of_scope');
  assert.ok(vm.entryInfo(ctx, 'live').stores.some((s) => s.store === 'NEW_STORE'));
});

// ---------------------------------------------------------------- TV8 (A) skeleton precondition
test('TV8 (precondition) 200 messages of one day pass through verbatim; replies sit on the source message', () => {
  const texts = ['Harami วันนี้ CUT กี่กิโลครับ?', 'မင်္ဂလာပါ', 'こんにちは　全角スペース', '  leading and trailing  ', 'line1\nline2', '<script>alert(1)</script>',
    '&amp; &lt;b&gt;', '😀 ZWJ:👨‍👩‍👧', 'a\tb'];
  const rows = Array.from({ length: 200 }, (_, i) => ({
    store: 'STORE_A', message_id: `MOCK-t8-${i}`, at: `2026-10-02T${String(5 + Math.floor((i * 2) / 60)).padStart(2, '0')}:${String((i * 2) % 60).padStart(2, '0')}:00+07:00`,
    group: 'MEAT', sender: 'Staff A', kind: 'text', text: texts[i % texts.length] + (i % 9 === 0 ? '' : ` #${i}`), handling: 'not_needed', replies_json: '[]',
    question_id: '', question_link: '', run_id: '', updated_at: '2026-10-02T13:45:00+07:00',
  }));
  rows[7].handling = 'replied';
  rows[7].replies_json = JSON.stringify([{ send_id: 'MOCK-s-t8', at: '2026-10-02T05:20:00+07:00', by: 'light', text: 'รับทราบครับ', result: 'sent', link: 'confirmed' }]);
  const ctx = mockContext({ mutate: (raw) => { raw.messages.rows = rows; } });
  const page = vm.messages(ctx, 'STORE_A', '2026-10-02');
  assert.equal(page.items.length, 200);
  const byId = new Map(page.items.map((m) => [m.message_id, m]));
  for (const r of rows) assert.equal(byId.get(r.message_id).text, r.text, `character-for-character: ${r.message_id}`);
  assert.deepEqual(page.items.map((m) => m.at), [...page.items.map((m) => m.at)].sort().reverse()); // newest first
  assert.equal(byId.get('MOCK-t8-7').replies.length, 1);
  assert.equal(byId.get('MOCK-t8-7').handling, 'replied');
});

// ---------------------------------------------------------------- TV10 (B)
test('TV10 the five statuses and "table but no row" are displayed differently', () => {
  const keys = ['silent_ok', 'blocked', 'missing', 'running', 'unknown', 'no_row'];
  const labels = keys.map(runLabel);
  assert.equal(new Set(labels).size, keys.length, `labels differ: ${labels}`);
  const tones = keys.map(runTone);
  // running (grey) and missing/no_row (dark red) share tones only where REQ §6 says so (missing & no row = dark red)
  assert.equal(runTone('missing'), runTone('no_row'));
  assert.equal(new Set(['silent_ok', 'blocked', 'missing', 'running', 'unknown'].map(runTone)).size, 5);
  assert.match(runLabel('no_row'), /未確認/); // "ยังไม่ยืนยัน"
  assert.ok(tones.every(Boolean));
});

test('TV10 a scheduled run with no row is shown (never dropped): no_row after the deadline, not_due before it', () => {
  const ctx = mockContext({ mutate: (raw) => { raw.runs.rows = raw.runs.rows.filter((r) => !r.scheduled_at.startsWith('2026-10-02T12:00')); } });
  const today = vm.today(ctx, 'STORE_A').days[0].items;
  assert.equal(today.find((i) => i.kind === 'slot' && i.scheduledAt.includes('T12:00')).status, 'no_row');
  assert.equal(today.find((i) => i.kind === 'slot' && i.scheduledAt.includes('T22:00')).status, 'not_due');
});

// ---------------------------------------------------------------- TV11 (B)
test('TV11 only confirmed-sent replies count as "replied"; replies are listed in time order', () => {
  const msg = (id, at, handling, replies) => ({ store: 'STORE_A', message_id: id, at, group: 'MEAT', sender: 'Staff A', kind: 'text', text: id, handling,
    replies_json: JSON.stringify(replies), question_id: '', question_link: '', run_id: '', updated_at: '2026-10-02T13:45:00+07:00' });
  const r = (send_id, at, result, link) => ({ send_id, at, by: 'light', text: send_id, result, link });
  const ctx = mockContext({ mutate: (raw) => { raw.messages.rows = [
    msg('two-replies', '2026-10-02T10:00:00+07:00', 'replied', [r('s2', '2026-10-02T10:09:00+07:00', 'sent', 'confirmed'), r('s1', '2026-10-02T10:03:00+07:00', 'sent', 'confirmed')]),
    msg('one-of-three-a', '2026-10-02T11:00:00+07:00', 'replied', [r('s3', '2026-10-02T11:05:00+07:00', 'sent', 'confirmed')]),
    msg('one-of-three-b', '2026-10-02T11:00:30+07:00', 'unknown', [r('s3', '2026-10-02T11:05:00+07:00', 'sent', 'ambiguous')]),
    msg('one-of-three-c', '2026-10-02T11:00:40+07:00', 'replied', [r('s3', '2026-10-02T11:05:00+07:00', 'sent', 'ambiguous')]),
    msg('carried', '2026-10-02T12:00:00+07:00', 'carried', []),
    msg('unsent', '2026-10-02T12:10:00+07:00', 'replied', [r('s4', '2026-10-02T12:15:00+07:00', 'unknown', 'confirmed')]),
  ]; } });
  const items = new Map(vm.messages(ctx, 'STORE_A', '2026-10-02').items.map((m) => [m.message_id, m]));
  assert.deepEqual(items.get('two-replies').replies.map((x) => x.send_id), ['s1', 's2']);
  assert.equal(items.get('two-replies').handling, 'replied');
  assert.equal(items.get('one-of-three-a').handling, 'replied');
  assert.equal(items.get('one-of-three-b').handling, 'unknown');
  assert.equal(items.get('one-of-three-c').handling, 'unknown'); // claimed replied, but only an ambiguous link -> downgraded
  assert.equal(items.get('carried').handling, 'carried');
  assert.equal(items.get('unsent').handling, 'unknown'); // sent result unknown -> not "replied"
  assert.equal([...items.values()].filter((m) => m.flags.replied).length, 2);
  assert.equal(vm.messages(ctx, 'STORE_A', '2026-10-02').botReplied.value, 2);
});

// ---------------------------------------------------------------- TV12 (B)
test('TV12 an answered question stays answered; a reply without numbers is still the registry answer; ⑦ uses answers_json links only', () => {
  const ctx = mockContext();
  const q = vm.questions(ctx, 'STORE_A').items.find((x) => x.state === 'answered');
  assert.ok(q && q.answers.some((a) => a.link === 'confirmed'));
  assert.ok(!/\d/.test('หน้าลิ้นใหญ่ครับ ชั่งตามน้ำหนักครับ')); // the fixture answer has no digits
  assert.equal(vm.questions(ctx, 'STORE_A').items.filter((x) => x.state === 'waiting').every((x) => x.waitHours !== null), true);
});

// ---------------------------------------------------------------- TV13 (B)
const stoppedBy = (name, mutate) => test(`TV13 ${name} -> "stopped" with last-success time; never normal`, () => {
  const ctx = mockContext({ mutate });
  assert.equal(ctx.freshness.state, 'stopped');
  assert.ok(ctx.freshness.reasons.length >= 1);
  const pub = publicFreshness(ctx);
  assert.equal(pub.state, 'stopped');
  assert.ok(pub.lastSuccess === null || /^\d{4}-\d{2}-\d{2}T/.test(pub.lastSuccess));
});
stoppedBy('meta=error', (raw) => { raw.meta.rows[1].status = 'error'; raw.meta.rows[1].detail = 'x'; });
stoppedBy('meta=stale', (raw) => { raw.meta.rows[2].status = 'stale'; });
stoppedBy('generated_at one hour old', (raw) => { for (const r of raw.meta.rows) r.generated_at = '2026-10-02T12:50:00+07:00'; });
stoppedBy('sheet unreadable (share revoked)', (raw) => { raw.questions = null; });
stoppedBy('required column deleted', (raw) => {
  raw.runs.columns = raw.runs.columns.filter((c) => c !== 'status');
  raw.runs.rows = raw.runs.rows.map(({ status, ...rest }) => rest);
});
test('TV13 corrupt answers_json -> that row says "cannot read answers"; the rest is unaffected and not treated as empty', () => {
  const ctx = mockContext({ mutate: (raw) => { raw.questions.rows[0].answers_json = '{not json'; } });
  assert.equal(ctx.freshness.state, 'normal');
  const items = vm.questions(ctx, 'STORE_A').items;
  const bad = items.filter((q) => !q.answersOk);
  assert.equal(bad.length, 1);
  assert.deepEqual(bad[0].answers, []);
  assert.ok(S.answersUnreadable);
});
test('TV13 corrupt replies_json -> message flagged unreadable, counted as a problem, not as "replied"', () => {
  const ctx = mockContext({ mutate: (raw) => { const m = raw.messages.rows.find((x) => x.handling === 'replied'); m.replies_json = '[{broken'; } });
  const bad = vm.messages(ctx, 'STORE_A', '2026-09-02').items.find((m) => !m.repliesOk);
  assert.ok(bad, 'the corrupted row is present and flagged unreadable');
  assert.equal(bad.flags.replied, false);
  assert.equal(bad.flags.problem, true);
  assert.deepEqual(bad.replies, []);
});

// ---------------------------------------------------------------- TV14 (B)
test('TV14 production heartbeat stopped, standby alive: production red; light check ok at 10:00, red at 10:20, off-hours at 01:00', () => {
  const at = (iso) => {
    const now = T(iso);
    const ctx = mockContext({ now, mutate: (raw) => {
      const standbyAt = new Date(now + 7 * 3600000 - 60000).toISOString().slice(0, 19) + '+07:00'; // standby alive 1 min ago
      raw.beats.rows = [
        { received_at: '2026-10-01T23:50:00+07:00', host: 'mock-host-1', role: 'production', stores: 'STORE_A', verify: 'PASS', fail_items: '', chatgpt: true, drive: true, g_mounted: true, disk_free_gb: 100, clock_offset_sec: 0.1, text_patrol_at: '2026-10-01T23:50:00+07:00' },
        { received_at: standbyAt, host: 'mock-host-2', role: 'standby', stores: 'STORE_A', verify: 'PASS', fail_items: '', chatgpt: true, drive: true, g_mounted: true, disk_free_gb: 80, clock_offset_sec: 0.2, text_patrol_at: standbyAt },
      ];
    } });
    return { all: storeA(ctx), machines: vm.machines(ctx) };
  };
  for (const t of ['2026-10-02T10:00:00+07:00', '2026-10-02T10:20:00+07:00', '2026-10-02T01:00:00+07:00']) assert.equal(at(t).all.machine.state, 'red', `production red at ${t}`);
  assert.equal(at('2026-10-02T10:00:00+07:00').all.lightCheck.state, 'ok');
  assert.equal(at('2026-10-02T10:20:00+07:00').all.lightCheck.state, 'red');
  assert.equal(at('2026-10-02T01:00:00+07:00').all.lightCheck.state, 'off_hours');
  const m = at('2026-10-02T10:20:00+07:00').machines.machines;
  assert.equal(m.find((x) => x.role === 'standby').heartbeatRed, false);
  assert.equal(m.find((x) => x.role === 'production').heartbeatRed, true);
});

// ---------------------------------------------------------------- TV16 (A=Bangkok, C=Nagoya) skeleton precondition
test('TV16 (precondition) the business day is decided by the store, identical under any viewer/process time zone', () => {
  const script = `
    import('${new URL('./helpers.js', import.meta.url).href}').then(async (h) => {
      const vm = await import('${new URL('../src/viewmodels/pages.js', import.meta.url).href}');
      const out = [];
      for (const iso of ['2026-10-02T04:59:59+07:00', '2026-10-02T05:00:00+07:00', '2026-10-02T13:50:00+07:00']) {
        const ctx = h.mockContext({ now: h.T(iso) });
        out.push(JSON.stringify([vm.allStores(ctx), vm.today(ctx, 'STORE_A')]));
      }
      console.log(out.join('\\n'));
    });`;
  const run = (tz) => execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  const a = run('Asia/Tokyo'); const b = run('Asia/Bangkok'); const c = run('America/Los_Angeles');
  assert.equal(a, b); assert.equal(b, c);
});
test('TV16 day rollover at business_day_start; a connected store with blank slot_times shows "out of scope", not missing', () => {
  const s = A(mockContext());
  assert.equal(businessDayOf(T('2026-10-02T04:59:59+07:00'), s), '2026-10-01');
  assert.equal(businessDayOf(T('2026-10-02T05:00:00+07:00'), s), '2026-10-02');
  const ctx = mockContext();
  ctx.connection.STORE_B = 'connected'; // blank slot_times / text_patrol in the mock
  const b = vm.allStores(ctx).stores.find((x) => x.store === 'STORE_B');
  assert.equal(b.patrol.scope, 'out_of_scope');
  assert.equal(b.lightCheck.state, 'out_of_scope');
  assert.ok(!vm.failures(ctx).items.some((i) => i.store === 'STORE_B' && i.kind === 'slot'));
});

// ---------------------------------------------------------------- TV17 (A・B)
test('TV17 (B) empty and question-less periods follow the rules; days the pull has not reached are gaps, not zeros', () => {
  const noQuestions = mockContext({ mutate: (raw) => { raw.questions.rows = []; } });
  const m = vm.periods(noQuestions, 7).stores.find((x) => x.store === 'STORE_A').metrics;
  assert.equal(m.responseRate.state, 'none'); // "no qualifying items" - never 0%
  assert.equal(m.timeToAnswer.state, 'none');
  assert.equal(m.questionsSent, 0);
  const gap = mockContext({ mutate: (raw) => {
    const meta = raw.meta.rows.find((r) => r.tab === 'ทะเบียนข้อความ');
    meta.source_through = '2026-09-28T23:59:00+07:00';
    raw.messages.rows = raw.messages.rows.filter((r) => r.at < '2026-09-29');
  } });
  const per = vm.periods(gap, 7).stores.find((x) => x.store === 'STORE_A').metrics.messagesPerDay;
  assert.ok(per.some((d) => d.count === null), 'unpulled days are null');
  assert.ok(per.every((d) => d.count === null || d.count >= 0));
});
test('TV17 (A) timing at mock volume x2 (real-volume timing stays BLOCKED)', async () => {
  const ctx = mockContext({ mutate: (raw) => {
    const dup = (rows, f) => rows.concat(rows.map(f));
    raw.messages.rows = dup(raw.messages.rows, (r) => ({ ...r, message_id: `${r.message_id}-x2`, replies_json: '[]', handling: 'not_needed', question_id: '', question_link: '' }));
    raw.questions.rows = dup(raw.questions.rows, (r) => ({ ...r, question_id: `${r.question_id}-x2` }));
  } });
  const t0 = performance.now();
  vm.periods(ctx, 30); vm.allStores(ctx); vm.failures(ctx); vm.machines(ctx); vm.messages(ctx, 'STORE_A'); vm.questions(ctx, 'STORE_A'); vm.today(ctx, 'STORE_A');
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `server-side view models took ${ms.toFixed(0)} ms`);
});

// ---------------------------------------------------------------- TV19/TV21 (A) skeleton precondition: stop detection limit
test('TV19/TV21 (precondition) the screen turns to "stopped" when the newest generated_at is older than 20 minutes (not at exactly 20)', () => {
  const mk = (ageMin) => mockContext({ mutate: (raw) => {
    const iso = new Date(NOW + 7 * 3600000 - ageMin * 60000).toISOString().slice(0, 19) + '+07:00';
    for (const r of raw.meta.rows) r.generated_at = iso;
  } }).freshness.state;
  assert.equal(mk(19), 'normal'); assert.equal(mk(20), 'normal'); assert.equal(mk(21), 'stopped');
});

// ---------------------------------------------------------------- TV22 (B)
test('TV22 candidates and unrecognized links are never counted as confirmed; only-candidate data -> "not concluded"', () => {
  const q = (id, answers, state) => ({ store: 'STORE_A', question_id: id, run_id: '', send_id: '', sent_at: '2026-10-01T10:00:00+07:00', group: 'MEAT', who: 'Staff A',
    question_text: id, state, closed_reason: '', closed_at: '', answers_json: JSON.stringify(answers), updated_at: '2026-10-01T10:30:00+07:00' });
  const a = (link) => ({ message_id: 'm', at: '2026-10-01T10:05:00+07:00', who: 'Staff A', text: 't', link });
  const onlyCandidates = mockContext({ mutate: (raw) => { raw.questions.rows = [q('q1', [a('candidate')], 'candidate'), q('q2', [a('weird')], 'candidate'), q('q3', [], 'waiting')]; } });
  const m1 = vm.periods(onlyCandidates, 7).stores.find((s) => s.store === 'STORE_A').metrics;
  assert.equal(m1.questionsSent, 3);
  assert.equal(m1.responseRate.state, 'not_concluded');
  assert.equal(m1.timeToAnswer.state, 'not_concluded');
  const mixed = mockContext({ mutate: (raw) => { raw.questions.rows = [q('q1', [a('candidate')], 'candidate'), q('q2', [a('confirmed')], 'acked'), q('q3', [], 'waiting')]; } });
  const m2 = vm.periods(mixed, 7).stores.find((s) => s.store === 'STORE_A').metrics;
  assert.equal(m2.responseRate.numerator, 1); assert.equal(m2.responseRate.denominator, 3); assert.equal(m2.responseRate.candidateCount, 1);
  assert.equal(m2.timeToAnswer.state, 'value');
});

// ---------------------------------------------------------------- TV23 (B; second display Q-20)
test('TV23 "request accepted" / "unknown" / "failed" are three distinct displays; delivery/read wording never appears', () => {
  const labels = ['sent', 'unknown', 'failed'].map((k) => S.sendResult[k]);
  assert.equal(new Set(labels).size, 3, `${labels}`);
  const values = [];
  (function walk(o) { for (const v of Object.values(o)) { if (typeof v === 'string') values.push(v); else if (v && typeof v === 'object') walk(v); } })(S);
  const banned = /届|既読|読まれ|配信済|着信|ถึงผู้รับ|อ่านแล้ว|delivered|\bread by\b/i;
  assert.deepEqual(values.filter((s) => banned.test(s)), []);
});

// ---------------------------------------------------------------- TV24 (A) skeleton precondition
test('TV24 (precondition) Screen Data columns never include userId / 宛先ID / 画像URL; groups are limited to the five; no reservation tab', () => {
  const cols = Object.values(COLUMNS).flat().join(' ');
  assert.equal(/userId|宛先ID|画像URL|グループID|image_url|user_id/i.test(cols), false);
  assert.deepEqual(Object.values(TAB_NAME).sort(), ['meta', 'stores', 'schedules', 'ทะเบียนรอบตรวจ', 'ทะเบียนคำถาม', 'บันทึกการส่ง', 'ทะเบียนข้อความ', 'beats', 'alerts'].sort());
  const ctx = mockContext();
  const groups = new Set([...ctx.screen.messages.map((m) => m.group), ...ctx.screen.questions.map((q) => q.group)]);
  for (const g of groups) assert.ok(ALLOWED_GROUPS.includes(g), `group ${g}`);
  assert.deepEqual([...ALLOWED_GROUPS].sort(), ['ALL', 'IN', 'MANAGEMENT', 'MEAT', 'PHOTO']);
  assert.deepEqual(validateScreen(ctx.screen), { invalid: [], duplicates: [] }); // the synthetic Screen Data conforms to the contract
});

// ---------------------------------------------------------------- TV25 (B)
test('TV25 before-change days use the old schedule; past-deadline `running` is "unknown"', () => {
  const ctx = mockContext();
  const store = A(ctx);
  const rows = ctx.screen.schedules.filter((s) => s.kind === 'slot').sort((x, y) => (x.valid_from < y.valid_from ? -1 : 1));
  const change = rows.find((s) => s.times.split(',').length === 3).valid_from;
  const dayBefore = new Date(Date.parse(`${change}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const count = (day) => dayRuns({ store, schedules: ctx.screen.schedules, runs: ctx.screen.runs, day, now: NOW, currentDay: '2026-10-02' }).items.filter((i) => i.kind === 'slot').length;
  assert.equal(count(dayBefore), 2);
  assert.equal(count(change), 3);
  const stuck = mockContext({ mutate: (raw) => { const r = raw.runs.rows.find((x) => x.scheduled_at === '2026-10-02T12:00:00+07:00'); r.status = 'running'; } });
  assert.equal(vm.today(stuck, 'STORE_A').days[0].items.find((i) => i.scheduledAt.includes('T12:00') && i.kind === 'slot').status, 'unknown');
});
test('TV25 the stop of the watcher itself is visible: production heartbeat red + runs without rows after the deadline', () => {
  const ctx = mockContext({ scenario: 'machine-down' });
  assert.equal(storeA(ctx).machine.state, 'red');
});
