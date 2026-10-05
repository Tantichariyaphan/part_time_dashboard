// ③ メッセージ - incoming messages in time order with Bot replies directly under each (REQ §6-③)
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api } from '../lib/api.js';
import { dateLabel, hhmm } from '../lib/format.js';
import { countText } from '../lib/present.js';
import { handlingTone, sendTone } from '../status.js';
import { Card, MetricCard, Metrics } from '../components/cards.js';
import { StatusBadge } from '../components/badges.js';
import { Chips, Select } from '../components/controls.js';
import { EmptyState, NotConnectedState } from '../components/states.js';

export const id = 'messages';
export const needsStore = true;
export const load = ({ store, query }) => api('messages', { store, date: query.get('date') });

const filter = { group: 'all', mode: 'all' }; // view-only filter state (no data is changed)

function Reply(r) {
  const unconfirmedSend = r.result !== 'sent';
  return h('div', { class: 'reply' },
    h('div', { class: 'rmeta' },
      h('b', null, `Bot ${hhmm(r.at)}`),
      h('span', null, `（${S.messages.after(r.minutesAfter)}・${S.replyBy[r.by] ?? S.unknown}）`),
      unconfirmedSend && StatusBadge(sendTone(r.result), S.sendResult[r.result] ?? S.unknown, { compact: true }),
      r.link === 'ambiguous' && StatusBadge('tone-unknown', S.replyAmbiguous, { compact: true, wrap: true })),
    h('div', { class: 'msg-text' }, r.text));
}

function Message(m, store) {
  const mark = ['pending', 'carried', 'failed', 'unknown'].includes(m.handling)
    ? StatusBadge(handlingTone(m.handling), S.handling[m.handling], { compact: true }) : null;
  const body = m.kind === 'photo' ? S.photo : m.kind === 'sticker' ? S.sticker : m.text;
  return h('div', { class: 'msg' },
    h('div', { class: 'msg-meta' }, h('span', { class: 'time' }, hhmm(m.at)), h('span', null, m.group), h('span', null, m.sender), mark),
    h('div', { class: `msg-text${m.kind !== 'text' ? ' placeholder' : ''}` }, body),
    m.question && h('div', { class: 'qline' },
      h('a', { href: `#/questions?store=${encodeURIComponent(store)}&focus=${encodeURIComponent(m.question.question_id)}` },
        S.questionLink[m.question.link] ?? S.questionLink.candidate)),
    m.repliesOk ? m.replies.map(Reply) : h('div', { class: 'reply small' }, S.repliesUnreadable));
}

export function view(env, ctx) {
  const d = env.data;
  if (d.connection !== 'connected') return NotConnectedState();
  const items = d.items.filter((m) =>
    (filter.group === 'all' || m.group === filter.group)
    && (filter.mode === 'all' || (filter.mode === 'replied' && m.flags.replied) || (filter.mode === 'problem' && m.flags.problem)));
  return h('div', { class: 'stack' },
    h('div', { class: 'bar-controls' },
      Select(S.date, d.availableDays.map((x) => [x, dateLabel(x)]), d.businessDay, (v) => ctx.go('messages', { store: ctx.store, date: v }))),
    Metrics(
      MetricCard(S.messages.total, countText(d.total)),
      MetricCard(S.messages.bot, countText(d.botReplied))),
    h('div', { class: 'stack' },
      Chips([['all', S.filterAll], ['replied', S.messages.replied], ['problem', S.messages.problem]], filter.mode, (k) => { filter.mode = k; ctx.rerender(); }),
      d.groups.length > 1 && Chips([['all', `${S.messages.group}：${S.filterAll}`], ...d.groups.map((g) => [g, g])], filter.group, (k) => { filter.group = k; ctx.rerender(); })),
    Card({ title: `${d.display_name}　${dateLabel(d.businessDay)}` },
      items.length ? h('div', { class: 'rows' }, items.map((m) => Message(m, d.store)))
        : EmptyState(d.total.state === 'unpulled' ? S.notPulled : S.zero)));
}
