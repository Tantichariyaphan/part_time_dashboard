// ⑤ 欠落・失敗 - missing / blocked / late / unknown / "unconfirmed (no row)" in the last 14 days (REQ §6-⑤)
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api } from '../lib/api.js';
import { dateLabel, hhmm, mdhm } from '../lib/format.js';
import { runLabel, runTone, sendTone } from '../status.js';
import { Card, Links, MetricCard, Metrics, AlertCard } from '../components/cards.js';
import { href } from '../lib/present.js';
import { runValues } from './today.js';
import { StatusBadge } from '../components/badges.js';
import { EmptyState } from '../components/states.js';

export const id = 'failures';
export const needsStore = false;
export const load = () => api('failures');

export function view(env, ctx) {
  const d = env.data;
  const t = d.totals;
  return h('div', { class: 'stack' },
    h('div', { class: 'small muted' }, S.failures.days(d.days)),
    d.runStatusUnconfirmed && AlertCard(null, S.runStatusUnconfirmed, 'warn'),
    Metrics(...[[S.failures.missing, t.missing], [S.failures.blocked, t.blocked], [S.failures.late, t.late], [S.failures.unknown, t.unknown]]
      .map(([label, n]) => MetricCard(label, d.runStatusUnconfirmed ? S.periods.rateUnconfirmed : `${n}`))), // not judged (Q-49) is not "0"
    Card({ title: `${S.pages.failures.title}` },
      d.items.length ? h('div', { class: 'rows' }, d.items.map((r) => {
        const key = `f:${r.store}:${r.key}`;
        const open = ctx.isOpen(key);
        return h('div', { class: 'row' },
          h('div', { class: 'row-top' },
            h('span', { class: 't' }, `${dateLabel(r.businessDay)} ${hhmm(r.scheduledAt)}`), h('span', null, S.kind[r.kind]),
            StatusBadge(runTone(r.status), runLabel(r.status)),
            r.derived && h('span', { class: 'small muted' }, S.runDerived[r.derived])),
          h('div', { class: 'small' }, r.display_name, r.reason && `　${r.reason}`),
          h('div', { class: 'links' },
            r.hasRow && h('button', { class: 'linkbtn', type: 'button', 'aria-expanded': String(open), onclick: () => ctx.toggle(key) }, open ? S.link.hide : S.link.details),
            r.onTodayPage && h('a', { href: href.today(r.store) }, S.link.toToday),
            h('a', { href: href.messages(r.store, r.businessDay) }, S.link.toMessages)),
          open && h('div', { class: 'detail' }, runValues(r), r.run_id && h('div', { class: 'small muted' }, `${S.detail.runId}：${r.run_id}`)));
      })) : EmptyState(d.runStatusUnconfirmed ? S.run.unconfirmed : S.failures.none)),
    Card({ title: S.failures.sends },
      d.unclassifiedSends > 0 && h('div', { class: 'small muted' }, S.failures.unclassifiedSends(d.unclassifiedSends)),
      d.sendProblems.length ? h('div', { class: 'rows' }, d.sendProblems.map((s) => h('div', { class: 'row' },
        h('div', { class: 'row-top' }, h('span', { class: 't' }, mdhm(s.sent_at)), h('span', null, S.sendKind[s.kind] ?? S.unknown), h('span', null, `→ ${s.target_label ?? ''}`),
          StatusBadge(sendTone(s.result), S.sendResult[s.result] ?? S.unknown, { compact: true })),
        h('div', { class: 'msg-text small' }, s.text),
        Links([s.businessDay && [S.link.toMessages, href.messages(s.store, s.businessDay)]])))) : EmptyState(S.failures.none)),
    d.notConnected.length > 0 && AlertCard(S.failures.notConnected, d.notConnected.map((s) => s.display_name).join('・')));
}
