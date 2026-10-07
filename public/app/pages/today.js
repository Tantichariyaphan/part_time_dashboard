// ② 本日 - patrols and daily jobs of today and yesterday (store business days), newest first (REQ §6-②)
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api, ApiError } from '../lib/api.js';
import { dateLabel, hhmm, mdhm } from '../lib/format.js';
import { href, messageBody } from '../lib/present.js';
import { runLabel, runTone, qTone, sendTone } from '../status.js';
import { Card, KeyValues, AlertCard } from '../components/cards.js';
import { StatusBadge } from '../components/badges.js';
import { EmptyState, ErrorState, LoadingState, NotConnectedState } from '../components/states.js';
import { Legend } from '../components/controls.js';

export const id = 'today';
export const needsStore = true;
export const load = ({ store }) => api('today', { store });

const count = (v) => (v === null ? S.notPulled : v === 0 ? S.zero : `${v}${S.all.unit}`); // blank != 0
const time = (iso) => hhmm(iso) ?? '—';

export function runValues(r) {
  if (!r.hasRow) return null;
  const items = [
    [S.today.input, count(r.input_lines)],
    [S.today.questions, count(r.questions_sent)],
    [S.today.sentMessages, count(r.messages_sent)],
    [S.today.owner, count(r.owner_items)],
    [`${S.today.read}→${S.today.ai}→${S.today.sent}`, `${time(r.read_at)} → ${time(r.ai_done_at)} → ${time(r.sent_at)}`],
  ];
  if (r.photos_total !== null) items.push([S.today.photos, `${r.photos_reviewed ?? '—'}/${r.photos_total}`]);
  if (r.owner_notified !== null) items.push([S.today.ownerNotified, r.owner_notified === 'yes' ? S.yes : S.no]);
  return KeyValues(items);
}

function RunRow(r, ctx, businessDay) {
  const open = ctx.isOpen(r.key);
  const detail = h('div', { class: 'stack' });
  if (open && r.run_id) loadDetail(detail, ctx, r.run_id);
  return h('div', { class: 'row' },
    h('div', { class: 'row-top' },
      h('span', { class: 't' }, hhmm(r.scheduledAt)), h('span', null, S.kind[r.kind]),
      StatusBadge(runTone(r.status), runLabel(r.status)),
      r.derived && h('span', { class: 'small muted' }, S.runDerived[r.derived])),
    r.reason && h('div', { class: 'small' }, `${S.today.reason}：${r.reason}`),
    runValues(r),
    h('div', { class: 'links' },
      r.run_id && h('button', { class: 'btn', type: 'button', 'aria-expanded': String(open), onclick: () => ctx.toggle(r.key) }, open ? S.close : S.open),
      h('a', { href: href.messages(ctx.store, businessDay) }, S.link.toMessages)),
    open && detail);
}

// Drill-down: messages (③ rows with the same run_id) and questions (④ rows with the same run_id)
async function loadDetail(box, ctx, runId) {
  box.appendChild(LoadingState());
  try {
    const env = await api('run', { store: ctx.store, run_id: runId });
    box.replaceChildren();
    const { messages, questions, run, sends } = env.data;
    box.append(...[ // native append: skip empty parts explicitly
      h('div', { class: 'detail' }, KeyValues([
        [S.detail.runId, run.run_id],
        [S.detail.posted, time(run.posted_at)], [S.detail.received, time(run.received_at)],
        [S.detail.updated, run.updated_at ? mdhm(run.updated_at) : '—'],
        [S.detail.evidence, run.evidence ?? '—'],
      ]), h('div', { class: 'small muted' }, S.detail.asStored)),
      sends.length > 0 && h('div', null, h('h3', null, S.detail.sends),
        sends.map((x) => h('div', { class: 'row-top small' },
          x.found ? [h('span', { class: 'time' }, hhmm(x.sent_at)), h('span', null, x.target_label), StatusBadge(sendTone(x.result), S.sendResult[x.result] ?? S.unknown, { compact: true })]
            : h('span', { class: 'muted' }, `${x.send_id}：${S.detail.sendNotFound}`)))),
      h('div', null, h('h3', null, `${S.pages.messages.title} ${messages.length}${S.all.unit}`),
        messages.length ? messages.map((m) => h('a', { class: 'msg msg--link', href: href.messages(ctx.store, m.businessDay, m.message_id) },
          h('div', { class: 'msg-meta' }, h('span', { class: 'time' }, hhmm(m.at)), h('span', null, m.group), h('span', null, m.sender)),
          h('div', { class: `msg-text${m.kind !== 'text' ? ' placeholder' : ''}` }, messageBody(m)))) : h('div', { class: 'muted small' }, S.zero)),
      h('div', null, h('h3', null, `${S.pages.questions.title} ${questions.length}${S.all.unit}`),
        questions.length ? questions.map((q) => h('a', { class: 'msg msg--link', href: href.questions(ctx.store, q.question_id) },
          h('div', { class: 'msg-meta' }, h('span', { class: 'time' }, hhmm(q.sent_at)), `${q.group} → ${q.who}`, StatusBadge(qTone(q.state), S.qstate[q.state] ?? S.unknown, { compact: true, wrap: true })),
          h('div', { class: 'msg-text' }, q.text))) : h('div', { class: 'muted small' }, S.zero)),
    ].filter(Boolean));
  } catch (e) {
    box.replaceChildren(ErrorState(e instanceof ApiError && e.status === 403 ? S.forbidden : undefined));
  }
}

export function view(env, ctx) {
  const d = env.data;
  if (d.connection !== 'connected') return NotConnectedState();
  return h('div', { class: 'stack' },
    h('div', { class: 'card card--glass keep-color' }, Legend()),
    d.days.map((day) => Card(
      { title: `${day.label === 'today' ? S.dayToday : S.dayYesterday}　${dateLabel(day.businessDay)}` },
      day.unconfirmedSchedule.slot || day.unconfirmedSchedule.daily ? AlertCard(null, S.scheduleUnconfirmed, 'warn') : null,
      day.unconfirmedStatus ? AlertCard(null, S.runStatusUnconfirmed, 'warn') : null,
      day.items.length ? h('div', { class: 'rows' }, day.items.map((r) => RunRow(r, ctx, day.businessDay))) : EmptyState(S.none))));
}
