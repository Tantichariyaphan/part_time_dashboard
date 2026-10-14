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
  assert.equal(S.all.waiting, '未回答');
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
