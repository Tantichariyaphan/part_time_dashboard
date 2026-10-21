// Screen rules requested by the client on 2026-10-14 that are checked on the page code itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S } from '../public/app/strings.ja.js';
import { runTone } from '../public/app/status.js';

const page = (f) => readFileSync(new URL(`../public/app/pages/${f}`, import.meta.url), 'utf8');

test('SCREEN-1 the internal question id is never printed as text on the normal screen (only as anchor / link target)', () => {
  const code = page('questions.js').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const uses = [...code.matchAll(/q\.question_id/g)].map((m) => code.slice(Math.max(0, m.index - 40), m.index + 20));
  assert.ok(uses.length > 0);
  for (const u of uses) assert.match(u, /id: `q-\$\{q\.question_id\}`|href/, `printed as text: ${u}`);
  for (const f of ['today.js', 'messages.js', 'allStores.js']) {
    const c = page(f);
    for (const m of c.matchAll(/question_id/g)) assert.match(c.slice(Math.max(0, m.index - 60), m.index), /href/, `${f}: question_id outside a link`);
  }
});

test('SCREEN-2 runs past their time have their own label, different from 時刻前 and from 状態未判定', () => {
  assert.equal(S.run.not_due, '時刻前');
  assert.ok(S.run.awaiting && S.run.awaiting !== S.run.not_due && S.run.awaiting !== S.run.unconfirmed);
  assert.equal(runTone('awaiting'), 'tone-await');
  assert.notEqual(runTone('awaiting'), runTone('not_due'), 'different from 時刻前 on the ① dots');
  assert.notEqual(runTone('awaiting'), runTone('unconfirmed'), 'different from 状態未判定');
  assert.ok(S.legend.some(([tone, label]) => tone === 'tone-await' && label === S.run.awaiting), 'listed in the legend');
  assert.ok(S.legend.some(([tone, label]) => tone === 'tone-neutral' && label === S.run.unconfirmed), '状態未判定 is in the legend too, so the two can be told apart on ①');
  const css = readFileSync(new URL('../public/styles/components.css', import.meta.url), 'utf8');
  assert.match(css, /\.tone-await\.dotlabel::before/, 'the ① dot of awaiting has its own shape');
});

test('SCREEN-3 未回答 and 回答未確認 have different labels and filters', () => {
  assert.notEqual(S.qstate.waiting, S.qstate.candidate);
  assert.notEqual(S.questions.filters.waiting, S.questions.filters.candidate);
  assert.equal(S.all.waiting, '未回答（候補なし）');
  // client 2026-10-18: "no candidate found" must not read as a confirmed 未回答
  for (const label of [S.qstate.waiting, S.all.waiting, S.questions.filters.waiting]) assert.match(label, /候補なし/);
  assert.match(S.questions.waitingNote, /確定したものではありません/);
});

// Fix B with every question state at once: each question is in exactly one group, candidates are never confirmed.
test('SCREEN-4 未回答 / 回答未確認 / 回答あり / クローズ: each question counted once; candidates never raise the response rate', async () => {
  const { mockContext } = await import('./helpers.js');
  const vm = await import('../src/viewmodels/pages.js');
  const sent = '2026-10-02T13:05:00+07:00';
  const ans = (link, n = 1) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ message_id: `M-${link}-${i}`, at: `2026-10-02T13:1${i}:00+07:00`, who: 'Staff', text: 't', link })));
  const q = (id, state, answers = '[]', extra = {}) => ({ store: 'STORE_A', question_id: `SYN-${id}`, run_id: '', send_id: '', sent_at: sent, group: 'MEAT', who: 'Staff',
    question_text: 'q', state, closed_reason: '', closed_at: '', answers_json: answers, updated_at: sent, ...extra });
  const rows = [
    q('none', 'waiting'), // no candidate
    q('one', 'candidate', ans('candidate', 1)), // one candidate
    q('many', 'candidate', ans('candidate', 3)), // several candidates (ambiguous sender / same minute)
    q('confirmed', 'answered', ans('confirmed', 1)),
    q('acked', 'acked', ans('confirmed', 1)),
    q('closed', 'closed', '[]', { closed_reason: 'no_reply', closed_at: sent }),
  ];
  const ctx = mockContext({ mutate: (raw) => { raw.questions.rows = rows; } });
  const page = vm.questions(ctx, 'STORE_A');
  assert.deepEqual(page.counts, { all: 6, waiting: 1, candidate: 2, answered: 2, closed: 1 });
  const groups = page.items.map((i) => i.filterGroup);
  assert.equal(groups.length, new Set(page.items.map((i) => i.question_id)).size, 'one row per question');
  assert.equal(page.counts.waiting + page.counts.candidate + page.counts.answered + page.counts.closed, page.counts.all, 'no double counting');
  const card = vm.allStores(ctx).stores.find((s) => s.store === 'STORE_A');
  assert.equal(card.waitingQuestions, 1);
  assert.equal(card.candidateQuestions, 2);
  for (const i of page.items.filter((x) => x.state === 'candidate')) assert.ok(i.answers.every((a) => a.link !== 'confirmed'), 'a candidate is never shown as confirmed');
  // response rate: only confirmed answers count; candidates are reported separately and never in the numerator
  const rr = vm.periods(ctx, '7').stores.find((s) => s.store === 'STORE_A').metrics.responseRate;
  assert.equal(rr.numerator, 2, 'confirmed answers only (answered + acked)');
  assert.equal(rr.denominator, 6, 'every question sent');
  assert.equal(rr.candidateCount, 2, 'candidates reported separately');
});

// client 2026-10-18: no internal id (message_id / run_id / send_id / question_id) in the 「詳細」 panels of the normal screen either
test('SCREEN-5 detail panels print no internal ids', () => {
  for (const k of ['messageId', 'questionId', 'runId', 'sendId']) assert.equal(S.detail[k], undefined, `S.detail.${k} label removed`);
  for (const f of ['messages.js', 'today.js', 'failures.js', 'questions.js', 'allStores.js', 'machines.js', 'periods.js']) {
    const code = page(f).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    // an id may appear only as a link target, an element id / key, or an API parameter - never inside printed text
    for (const m of code.matchAll(/\$\{[^}]*\b(message_id|run_id|send_id|question_id)\b[^}]*\}/g)) {
      const before = code.slice(Math.max(0, m.index - 30), m.index);
      assert.match(before, /id: `|key = `|href|`[mqf]-|`[mqf]:/, `${f}: ${m[0]} printed as text`);
    }
    assert.doesNotMatch(code, /\[S\.detail\.\w+, [^\]]*\.(message_id|run_id|send_id)\]/, `${f}: id in a key/value row`);
  }
});

// client 2026-10-18: a question sent while question tracking is incomplete is marked, and its 未回答 is not presented as concluded
test('SCREEN-6 questions in the incomplete tracking period are marked on ④', async () => {
  const { mockContext } = await import('./helpers.js');
  const vm = await import('../src/viewmodels/pages.js');
  const q = (id, sent) => ({ store: 'STORE_A', question_id: `SYN-${id}`, run_id: '', send_id: '', sent_at: sent, group: 'MEAT', who: 'Staff',
    question_text: 'q', state: 'waiting', closed_reason: '', closed_at: '', answers_json: '[]', updated_at: sent });
  const ctx = mockContext({ mutate: (raw) => { raw.questions.rows = [q('before', '2026-10-02T13:05:00+07:00'), q('after', '2026-10-06T10:00:00+07:00')]; } });
  ctx.limits = { ...(ctx.limits ?? {}), questionsIncompleteFrom: '2026-10-05T23:36:00+07:00' };
  const items = vm.questions(ctx, 'STORE_A').items;
  assert.equal(items.find((i) => i.question_id === 'SYN-before').inIncompletePeriod, false);
  assert.equal(items.find((i) => i.question_id === 'SYN-after').inIncompletePeriod, true);
  const ctx0 = mockContext({ mutate: (raw) => { raw.questions.rows = [q('after', '2026-10-06T10:00:00+07:00')]; } });
  ctx0.limits = {};
  assert.equal(vm.questions(ctx0, 'STORE_A').items[0].inIncompletePeriod, false, 'no known gap -> no mark');
  const code = page('questions.js');
  assert.match(code, /q\.inIncompletePeriod && StatusBadge/);
  assert.match(code, /S\.questions\.waitingNote/);
});

// ---------------------------------------------------------------- client review of the live screens (2026-10-19), display only
test('SCREEN-7 ④ more than 3 candidates: the 3 nearest to the question time first, confirmed answers always shown, nothing removed', async () => {
  const { nearestCandidates } = await import('../public/app/lib/collapse.js');
  const at = (d, hm) => `2026-10-${d}T${hm}:00+07:00`;
  const cand = (d, hm) => ({ at: at(d, hm), link: 'candidate', text: `${d} ${hm}` });
  const answers = [cand('01', '09:00'), cand('02', '13:20'), cand('02', '13:06'), { at: at('03', '10:00'), link: 'confirmed', text: 'c' }, cand('02', '14:00'), cand('20', '22:00')];
  const r = nearestCandidates(answers, at('02', '13:05'), 3);
  assert.equal(r.candidateCount, 5, 'the count is every candidate (rule unchanged)');
  assert.deepEqual(r.shown.map((a) => a.text), ['02 13:20', '02 13:06', 'c', '02 14:00'], 'nearest 3 candidates + the confirmed one, original order');
  assert.equal(r.hiddenCount, 2);
  assert.equal(r.shown.length + r.hiddenCount, answers.length);
  assert.deepEqual(nearestCandidates(answers.slice(0, 3), at('02', '13:05')).hiddenCount, 0, '3 or fewer: all shown');
  const code = page('questions.js');
  assert.match(code, /S\.collapse\.showAll\(q\.answers\.length\)/, 'the full list is one tap away');
});

test('SCREEN-8 ⑥ / banner: Thai tab names are shown in Japanese; the internal names are unchanged', async () => {
  const { TAB_NAME, META_TAB_KEYS } = await import('../src/contract/enums.js');
  for (const k of META_TAB_KEYS) {
    const ja = S.tabLabel[TAB_NAME[k]];
    assert.ok(ja, `label for ${k}`);
    assert.doesNotMatch(ja, /[฀-๿]/, 'no Thai on the screen');
  }
  assert.equal(TAB_NAME.runs, 'ทะเบียนรอบตรวจ', 'contract name kept');
  assert.match(page('machines.js'), /tabLabel\(u\.tab\)/);
  assert.match(page('machines.js'), /tabLabel\(t\.tab\)/);
  assert.match(readFileSync(new URL('../public/app/components/freshness.js', import.meta.url), 'utf8'), /S\.tabLabel\[r\.tab\]/);
});

test('SCREEN-9 ③ consecutive images / stickers of one sender become one row; anything with a question or reply stays its own row', async () => {
  const { groupMediaRuns, kindCounts } = await import('../public/app/lib/collapse.js');
  const m = (id, hm, kind = 'photo', extra = {}) => ({ message_id: id, at: `2026-10-19T${hm}:00+07:00`, kind, group: 'PHOTO', sender: 'A', handling: 'unknown', replies: [], repliesOk: true, ...extra });
  const items = [m('1', '21:59'), m('2', '21:59'), m('3', '22:00', 'sticker'), m('4', '22:01', 'text'), m('5', '22:02'),
    m('6', '22:03', 'photo', { replies: [{ at: 'x' }] }), m('7', '22:04'), m('8', '22:05', 'photo', { sender: 'B' }), m('9', '22:30', 'photo', { sender: 'B' })];
  const g = groupMediaRuns(items);
  assert.deepEqual(g.map((x) => (x.type === 'media' ? x.items.map((i) => i.message_id).join('+') : x.m.message_id)), ['1+2+3', '4', '5', '6', '7', '8', '9']);
  assert.deepEqual(kindCounts(g[0].items), { photo: 2, sticker: 1 });
  assert.equal(S.collapse.media({ photo: 18 }), '(画像 ×18)');
  assert.equal(g.reduce((n, x) => n + (x.type === 'media' ? x.items.length : 1), 0), items.length, 'no message is dropped');
  const code = page('messages.js');
  assert.match(code, /id: `m-\$\{m\.message_id\}`, class: 'anchor'/, 'every grouped message keeps its link anchor');
  assert.match(code, /some\(\(m\) => m\.message_id === focus\)/, 'a link to a grouped message opens the group');
});

test('SCREEN-10 ① the card has a one-line summary; the evidence badge is replaced only when the pending run rule is the reason', async () => {
  const { summaryLine } = await import('../public/app/pages/allStores.js');
  const code = page('allStores.js');
  assert.match(code, /runRuleOnly \? null : EvidenceBadge/);
  assert.match(code, /runRuleOnly \|\| s\.patrol\.unconfirmedStatus/, 'the pending rule is still said in words on the card');
  assert.equal(S.all.machineShort.ok, '機械の確認 PASS'); // client rules 2026-10-21 §6-1: PASS only under 「機械の確認」
  { // summaryLine is pure (no DOM)
    const s = { patrol: { scope: 'in_scope', items: [1, 2, 3] }, waitingQuestions: 2, candidateQuestions: 0, machine: { state: 'ok' } };
    // names per the client rules of 2026-10-21 (定時 LINE 読取 / 5 分巡回 / 機械の確認 are separate)
    assert.equal(summaryLine(s), '今日：定時読取3回予定・未回答（候補なし）2件・機械の確認 PASS');
    assert.equal(summaryLine({ ...s, patrol: { scope: 'in_scope', unconfirmedSchedule: true, items: [] }, candidateQuestions: 32, machine: { state: 'red' } }),
      '今日：定時読取の予定 未確認・未回答（候補なし）2件・回答未確認32件・機械の確認 要確認');
    assert.equal(summaryLine({ ...s, lightCheck: { state: 'ok', lastRunAt: '2026-10-21T08:45:00+07:00' } }), '今日：定時読取3回予定・未回答（候補なし）2件・5分巡回 最終08:45・機械の確認 PASS');
    assert.equal(summaryLine({ ...s, lightCheck: { state: 'red', stopDetected: false } }), '今日：定時読取3回予定・未回答（候補なし）2件・5分巡回 遅延／要確認・機械の確認 PASS');
  }
});

test('SCREEN-11 ⑤ evidence not connected: one message, no 未判定 tiles, never 0 (⑦ keeps one row per state, rules 2026-10-21)', () => {
  const f = page('failures.js');
  assert.match(f, /d\.runStatusUnconfirmed && AlertCard\(null, S\.runStatusPending/);
  assert.match(f, /!d\.runStatusUnconfirmed && Metrics/);
  assert.match(S.runStatusPending, /0 件・0% ではありません/, 'says explicitly that nothing is zero');
  // 10/19 merged 定時読取 and 日次 into one ⑦ row; the client's rules (§0, §6) require them separate -> one row each again
  const p = page('periods.js');
  for (const k of ['patrolRate', 'dailyRate', 'stopped', 'fiveMinRate']) assert.match(p, new RegExp(`S\\.periods\\.${k}`), k);
  assert.doesNotMatch(p, /allRunPending/);
});

test('SCREEN-12 ⑥ a long row-number list is folded to 「ID破損 N行」, the full text one tap away', async () => {
  const { rowListSummary, isIdDamageText } = await import('../public/app/lib/collapse.js');
  const rows = Array.from({ length: 36 }, (_, i) => 670 + i * 10);
  const text = `警告: 元の長いIDが数値型または指数表記（末尾復元不可）: 行 ${rows.join(',')}`;
  const r = rowListSummary(text);
  assert.equal(r.rows.length, 36);
  assert.ok(isIdDamageText(r.head));
  assert.equal(S.collapse.idDamaged(r.rows.length), 'ID破損 36行');
  assert.equal(rowListSummary('警告: 行 1,2,3'), null, 'short lists are shown as they are');
  // the live text (2026-10-21) has a sentence after the list
  const live = rowListSummary(`${text}。このIDを使う回答の紐付け・集計は未確認`);
  assert.equal(live.rows.length, 36);
  assert.equal(live.tail, 'このIDを使う回答の紐付け・集計は未確認');
  assert.equal(rowListSummary('ok'), null);
  assert.equal(isIdDamageText('読み取り遅延'), false);
  assert.match(page('machines.js'), /open && h\('span', \{ class: 'sub rowlist' \}, full\)/);
});
