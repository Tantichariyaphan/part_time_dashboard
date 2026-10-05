// ④ 質問と回答 - question -> answer -> state in time order, original text kept (REQ §6-④)
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api } from '../lib/api.js';
import { hhmm, mdhm } from '../lib/format.js';
import { qTone } from '../status.js';
import { Card, AlertCard } from '../components/cards.js';
import { EvidenceBadge, StatusBadge } from '../components/badges.js';
import { Chips } from '../components/controls.js';
import { EmptyState, NotConnectedState } from '../components/states.js';

export const id = 'questions';
export const needsStore = true;
export const load = ({ store }) => api('questions', { store });

const filter = { key: 'all' };

function Answer(a) {
  const cand = a.link !== 'confirmed'; // candidate (or unrecognised) is never presented as confirmed
  return h('div', { class: `ans${cand ? ' cand' : ''}` },
    h('div', { class: 'ameta' }, `${hhmm(a.at)}　${a.who ?? ''}`, cand && ` ／ ${S.answerCandidate}`),
    h('div', null, a.text));
}

function Question(q) {
  return h('section', { class: 'card', id: `q-${q.question_id}` },
    h('div', { class: 'card-head' },
      h('div', null, h('h3', null, `${mdhm(q.sent_at)}　${q.group} → ${q.who}`),
        q.state === 'waiting' && q.waitHours !== null && h('div', { class: 'sub' }, S.questions.wait(q.waitHours)),
        q.state === 'closed' && q.closed_reason && h('div', { class: 'sub' }, S.closedReason[q.closed_reason] ?? S.unknown)),
      StatusBadge(qTone(q.state), S.qstate[q.state] ?? S.unknown, { wrap: true })),
    h('div', { class: 'q' }, q.text),
    q.answersOk
      ? (q.answers.length ? q.answers.map(Answer) : h('div', { class: 'small muted' }, `${S.noAnswers}`))
      : h('div', { class: 'small' }, StatusBadge('tone-unknown', S.answersUnreadable, { compact: true })));
}

export function view(env, ctx) {
  const d = env.data;
  if (d.connection !== 'connected') return NotConnectedState();
  const items = d.items.filter((q) => filter.key === 'all' || q.filterGroup === filter.key);
  const c = d.counts;
  return h('div', { class: 'stack' },
    h('div', { class: 'bar-controls' }, EvidenceBadge(d.answerEvidence), d.answerEvidence !== 'CONFIRMED' && h('span', { class: 'small muted' }, S.questions.candidateNote)),
    d.answerEvidence === 'CANDIDATE' && AlertCard(null, S.questions.candidateNote, 'warn'),
    Chips([['all', `${S.questions.filters.all} ${c.all}`], ['waiting', `${S.questions.filters.waiting} ${c.waiting}`],
      ['answered', `${S.questions.filters.answered} ${c.answered}`], ['closed', `${S.questions.filters.closed} ${c.closed}`]],
    filter.key, (k) => { filter.key = k; ctx.rerender(); }),
    items.length ? items.map(Question) : EmptyState(S.zero));
}
