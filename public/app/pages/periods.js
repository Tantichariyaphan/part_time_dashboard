// ⑦ 期間別数値 - 7 / 30 days, store comparison (REQ §6-⑦). All figures are computed by the domain layer;
// this page only chooses words for the states it receives.
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api } from '../lib/api.js';
import { dateLabel, pct } from '../lib/format.js';
import { countText } from '../lib/present.js';
import { Card, AlertCard } from '../components/cards.js';
import { EvidenceBadge } from '../components/badges.js';
import { Chips, StoreSelect } from '../components/controls.js';
import { DataTable } from '../components/table.js';
import { EmptyState } from '../components/states.js';

export const id = 'periods';
export const needsStore = false;
export const load = ({ query }) => api('periods', { days: query.get('days') ?? '7' });

const NC = () => h('span', { class: 'muted' }, S.notConnected);

function rateCell(r) {
  if (r.state === 'value') return h('span', null, pct(r.value), h('span', { class: 'sub' }, `${r.numerator}/${r.denominator}`));
  return S.none; // denominator 0 / out of scope -> "no qualifying items" (never 0%)
}

function responseCell(r) {
  if (r.state === 'value') return h('span', null, pct(r.value), h('span', { class: 'sub' }, `${r.numerator}/${r.denominator}`),
    r.candidateCount > 0 && h('span', { class: 'sub' }, `${S.answerCandidate} ${r.candidateCount}`));
  if (r.state === 'not_concluded') return h('span', { class: 'small' }, S.periods.notConcluded(r.candidateCount)); // never 0%
  return S.none;
}

function timeCell(t) {
  if (t.state === 'value') return S.periods.minutes(t.minutes);
  return t.state === 'not_concluded' ? S.notConcluded : S.none;
}

export function view(env, ctx) {
  const d = env.data;
  const stores = d.stores;
  const connected = stores.filter((s) => s.connection === 'connected');
  if (!stores.length) return EmptyState(S.noStores);
  const col = (fn) => stores.map((s) => (s.connection === 'connected' ? fn(s.metrics) : NC()));
  const chartStore = connected.find((s) => s.store === ctx.store) ?? connected[0];

  return h('div', { class: 'stack' },
    Chips([['7', S.periods.d7], ['30', S.periods.d30]], String(d.days), (k) => ctx.go('periods', { days: k, store: ctx.store })),
    connected.some((s) => s.metrics.unconfirmedSchedule) && AlertCard(null, S.periods.unconfirmedSchedule, 'warn'),
    Card({ title: S.pages.periods.title, sub: `${d.days === 7 ? S.periods.d7 : S.periods.d30}` },
      DataTable({
        columns: ['', ...stores.map((s) => s.display_name)],
        rows: [
          [S.periods.patrolRate, ...col((m) => rateCell(m.patrolRate))],
          [S.periods.dailyRate, ...col((m) => rateCell(m.dailyRate))],
          [S.periods.stopped, ...col((m) => `${m.stopped.missing}／${m.stopped.blocked}／${m.stopped.unknown}`)],
          [S.periods.questions, ...col((m) => `${m.questionsSent}`)],
          [S.periods.response, ...col((m) => responseCell(m.responseRate))],
          [S.periods.answerTime, ...col((m) => timeCell(m.timeToAnswer))],
          [S.periods.messages, ...col((m) => countText(m.messages))],
          [S.periods.bot, ...col((m) => h('span', null, countText(m.botReplies), m.unknownOriginReplies > 0 && h('span', { class: 'sub' }, S.periods.unknownOrigin(m.unknownOriginReplies))))],
        ],
      })),
    chartStore && Card({ title: S.periods.perDay, sub: chartStore.display_name, aside: connected.length > 1 ? StoreSelect(connected, chartStore.store, (v) => ctx.go('periods', { days: d.days, store: v })) : null }, Bars(chartStore.metrics.messagesPerDay)),
    stores.some((s) => s.connection !== 'connected') && h('div', { class: 'bar-controls' }, EvidenceBadge('NOT_CONNECTED'), h('span', { class: 'small muted' }, stores.filter((s) => s.connection !== 'connected').map((s) => s.display_name).join('・'))));
}

function Bars(perDay) {
  const max = Math.max(1, ...perDay.map((p) => p.count ?? 0));
  const bars = perDay.map((p) => {
    const el = h('div', { class: `bar${p.count === null ? ' gap' : ''}`, role: 'img', 'aria-label': `${dateLabel(p.day)} ${p.count === null ? S.notPulled : `${p.count}${S.all.unit}`}`, title: `${dateLabel(p.day)}：${p.count === null ? S.notPulled : p.count}` });
    if (p.count !== null) el.style.height = `${Math.round((p.count / max) * 100)}%`;
    return el;
  });
  return h('div', null, h('div', { class: 'bars' }, bars),
    h('div', { class: 'barlabels' }, h('span', null, dateLabel(perDay[0].day)), h('span', null, dateLabel(perDay[perDay.length - 1].day))));
}
