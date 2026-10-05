// ③ メッセージ - incoming messages in time order with Bot replies directly under each (REQ §6-③)
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api } from '../lib/api.js';
import { dateLabel, hhmm, mdhm } from '../lib/format.js';
import { countText, href, messageBody } from '../lib/present.js';
import { handlingTone, runLabel, runTone, sendTone } from '../status.js';
import { Card, KeyValues, MetricCard, Metrics } from '../components/cards.js';
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

/** The patrol that read this message (registry run_id only). */
function RunChip(run, store) {
  if (!run) return null;
  if (!run.found) return h('span', { class: 'small muted' }, S.link.runNotFound);
  const label = h('span', { class: 'runchip' }, S.link.run(`${run.onTodayPage ? hhmm(run.scheduledAt) : mdhm(run.scheduledAt)}`),
    StatusBadge(runTone(run.status), runLabel(run.status), { compact: true }));
  return run.onTodayPage ? h('a', { class: 'runlink', href: href.today(store) }, label) : label;
}

function Detail(m) {
  return h('div', { class: 'detail' },
    KeyValues([
      [S.detail.messageId, m.message_id],
      [S.detail.kind, S.kindName[m.kind] ?? S.unknown],
      [S.detail.handling, S.handling[m.handling] || S.detail.none],
      [S.detail.runId, m.run?.run_id ?? S.detail.none],
      ...m.replies.map((r, i) => [`${S.detail.sendId} ${i + 1}`, `${r.send_id ?? S.detail.none}（${S.sendResult[r.result] ?? S.unknown}）`]),
    ]));
}

function Message(m, store, ctx) {
  const mark = ['pending', 'carried', 'failed', 'unknown'].includes(m.handling)
    ? StatusBadge(handlingTone(m.handling), S.handling[m.handling], { compact: true }) : null;
  const key = `m:${m.message_id}`;
  const open = ctx.isOpen(key);
  return h('div', { class: 'msg', id: `m-${m.message_id}` },
    h('div', { class: 'msg-meta' }, h('span', { class: 'time' }, hhmm(m.at)), h('span', null, m.group), h('span', null, m.sender), mark),
    h('div', { class: `msg-text${m.kind !== 'text' ? ' placeholder' : ''}` }, messageBody(m)),
    m.question && h('div', { class: 'qline' },
      h('a', { href: href.questions(store, m.question.question_id) },
        S.questionLink[m.question.link] ?? S.questionLink.candidate,
        m.question.sent_at && h('span', { class: 'small muted' }, `（${mdhm(m.question.sent_at)} ${m.question.who ?? ''}）`))),
    m.repliesOk ? m.replies.map(Reply) : h('div', { class: 'reply small' }, S.repliesUnreadable),
    h('div', { class: 'msg-foot' }, RunChip(m.run, store),
      h('button', { class: 'linkbtn', type: 'button', 'aria-expanded': String(open), onclick: () => ctx.toggle(key) }, open ? S.link.hide : S.link.details)),
    open && Detail(m));
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
      items.length ? h('div', { class: 'rows' }, items.map((m) => Message(m, d.store, ctx)))
        : EmptyState(d.total.state === 'unpulled' ? S.notPulled : S.zero)));
}
