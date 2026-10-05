// ⑤ 欠落・失敗 - missing / blocked / late / unknown / "unconfirmed (no row)" in the last 14 days (REQ §6-⑤)
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api } from '../lib/api.js';
import { dateLabel, hhmm, mdhm } from '../lib/format.js';
import { runLabel, runTone, sendTone } from '../status.js';
import { Card, KeyValues, MetricCard, Metrics, AlertCard } from '../components/cards.js';
import { StatusBadge } from '../components/badges.js';
import { EmptyState } from '../components/states.js';

export const id = 'failures';
export const needsStore = false;
export const load = () => api('failures');

export function view(env) {
  const d = env.data;
  const t = d.totals;
  return h('div', { class: 'stack' },
    h('div', { class: 'small muted' }, S.failures.days(d.days)),
    Metrics(
      MetricCard(S.failures.missing, `${t.missing}`), MetricCard(S.failures.blocked, `${t.blocked}`),
      MetricCard(S.failures.late, `${t.late}`), MetricCard(S.failures.unknown, `${t.unknown}`)),
    Card({ title: `${S.pages.failures.title}` },
      d.items.length ? h('div', { class: 'rows' }, d.items.map((r) => h('div', { class: 'row' },
        h('div', { class: 'row-top' },
          h('span', { class: 't' }, `${dateLabel(r.businessDay)} ${hhmm(r.scheduledAt)}`), h('span', null, S.kind[r.kind]),
          StatusBadge(runTone(r.status), runLabel(r.status))),
        h('div', { class: 'small' }, r.display_name, r.reason && `　${r.reason}`)))) : EmptyState(S.failures.none)),
    Card({ title: S.failures.sends },
      d.sendProblems.length ? h('div', { class: 'rows' }, d.sendProblems.map((s) => h('div', { class: 'row' },
        h('div', { class: 'row-top' }, h('span', { class: 't' }, mdhm(s.sent_at)), h('span', null, s.target_label),
          StatusBadge(sendTone(s.result), S.sendResult[s.result] ?? S.unknown, { compact: true })),
        h('div', { class: 'msg-text small' }, s.text)))) : EmptyState(S.failures.none)),
    d.notConnected.length > 0 && AlertCard(S.failures.notConnected, d.notConnected.map((s) => s.display_name).join('・')));
}
