// ④ 質問と回答 - question -> answer -> state in time order, original text kept (REQ §6-④)
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api } from '../lib/api.js';
import { hhmm, mdhm } from '../lib/format.js';
import { qTone, runLabel, runTone, sendTone } from '../status.js';
import { href } from '../lib/present.js';
import { Card, AlertCard } from '../components/cards.js';
import { EvidenceBadge, StatusBadge } from '../components/badges.js';
import { Chips } from '../components/controls.js';
import { EmptyState, NotConnectedState } from '../components/states.js';
import { nearestCandidates } from '../lib/collapse.js';

export const id = 'questions';
export const needsStore = true;
export const load = ({ store }) => api('questions', { store });

const filter = { key: 'all' };

function Answer(a, store) {
  const cand = a.link !== 'confirmed'; // candidate (or unrecognised) is never presented as confirmed
  return h('div', { class: `ans${cand ? ' cand' : ''}` },
    h('div', { class: 'ameta' }, `${hhmm(a.at)}　${a.who ?? ''}`, cand && ` ／ ${S.answerCandidate}`,
      a.message_id && a.businessDay && h('a', { class: 'small', href: href.messages(store, a.businessDay, a.message_id) }, `　${S.link.toMessage}`)),
    h('div', null, a.text));
}

/** Where the question came from (run_id) and whether LINE accepted its send (send_id). Registry keys only. */
function Provenance(q, store) {
  // The internal question id (e.g. R021-confirm-…) is never printed on the normal screen (client 2026-10-14); it is used only
  // as a link target (anchor) and in request parameters.
  const run = q.run;
  const send = q.send;
  return h('div', { class: 'prov small' },
    run && (run.found
      ? h('span', { class: 'runchip' }, run.onTodayPage ? h('a', { href: href.today(store) }, S.link.run(hhmm(run.scheduledAt))) : S.link.run(mdhm(run.scheduledAt)),
        StatusBadge(runTone(run.status), runLabel(run.status), { compact: true }))
      : h('span', { class: 'muted' }, S.link.runNotFound)),
    send && (send.found
      ? h('span', { class: 'runchip' }, `${S.detail.sendOfQuestion} ${hhmm(send.sent_at) ?? ''} → ${send.target_label ?? ''}`,
        StatusBadge(sendTone(send.result), S.sendResult[send.result] ?? S.unknown, { compact: true }))
      : h('span', { class: 'muted' }, S.detail.sendNotFound)));
}

/** Answers of one question. More than 3 candidates -> the 3 nearest to the question time first, the rest one tap away
 * (display only: the candidate rule and every count are unchanged; client review 2026-10-19). */
function Answers(q, store, ctx) {
  if (!q.answers.length) return h('div', { class: 'small muted' }, `${S.noAnswers}`);
  const key = `qa:${q.sent_at}|${q.group}|${q.who}`; // toggle key (the internal id is not used on the screen)
  const all = ctx?.isOpen(key);
  const { shown, candidateCount, hiddenCount } = nearestCandidates(q.answers, q.sent_at, 3);
  if (!hiddenCount) return q.answers.map((a) => Answer(a, store));
  return [
    h('div', { class: 'small muted' }, S.collapse.candidates(candidateCount, 3)),
    (all ? q.answers : shown).map((a) => Answer(a, store)),
    h('button', { class: 'linkbtn', type: 'button', 'aria-expanded': String(Boolean(all)), onclick: () => ctx.toggle(key) },
      all ? S.collapse.showFewer : S.collapse.showAll(q.answers.length)),
  ];
}

function Question(q, store, ctx) {
  return h('section', { class: 'card', id: `q-${q.question_id}` },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', null, `${mdhm(q.sent_at)}　${q.group} → ${q.who}`),
        q.state === 'waiting' && q.waitHours !== null && h('div', { class: 'sub' }, S.questions.wait(q.waitHours)),
        q.state === 'closed' && q.closed_reason && h('div', { class: 'sub' }, S.closedReason[q.closed_reason] ?? S.unknown)),
      h('div', { class: 'badges' }, StatusBadge(qTone(q.state), S.qstate[q.state] ?? S.unknown, { wrap: true }),
        q.inIncompletePeriod && StatusBadge('tone-unknown', S.questions.inIncomplete, { compact: true, wrap: true }))),
    q.inIncompletePeriod && h('div', { class: 'small muted' }, S.questions.inIncompleteNote),
    h('div', { class: 'q' }, q.text),
    q.answersOk
      ? Answers(q, store, ctx)
      : h('div', { class: 'small' }, StatusBadge('tone-unknown', S.answersUnreadable, { compact: true })),
    Provenance(q, store));
}

export function view(env, ctx) {
  const d = env.data;
  if (d.connection !== 'connected') return NotConnectedState();
  const items = d.items.filter((q) => filter.key === 'all' || q.filterGroup === filter.key);
  const c = d.counts;
  return h('div', { class: 'stack' },
    h('div', { class: 'bar-controls' }, EvidenceBadge(d.answerEvidence), d.answerEvidence !== 'CONFIRMED' && h('span', { class: 'small muted' }, S.questions.candidateNote)),
    d.answerEvidence === 'CANDIDATE' && AlertCard(null, S.questions.candidateNote, 'warn'),
    d.incompleteFrom && AlertCard(null, S.questionsIncomplete(mdhm(d.incompleteFrom)), 'warn'), // Q-52: not "0 questions"
    Chips([['all', `${S.questions.filters.all} ${c.all}`], ['waiting', `${S.questions.filters.waiting} ${c.waiting}`],
      ['candidate', `${S.questions.filters.candidate} ${c.candidate ?? 0}`],
      ['answered', `${S.questions.filters.answered} ${c.answered}`], ['closed', `${S.questions.filters.closed} ${c.closed}`]],
    filter.key, (k) => { filter.key = k; ctx.rerender(); }),
    c.waiting > 0 && h('div', { class: 'small muted' }, S.questions.waitingNote),
    items.length ? items.map((q) => Question(q, d.store, ctx)) : EmptyState(S.zero));
}
