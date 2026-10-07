// ① 全店舗 - one card per active store; tap -> ② (REQ §6-①)
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api } from '../lib/api.js';
import { hhmm } from '../lib/format.js';
import { countText, href } from '../lib/present.js';
import { runLabel, runTone } from '../status.js';
import { Card, KeyValues, MetricCard, Metrics, AlertCard } from '../components/cards.js';
import { DotLabel, EvidenceBadge } from '../components/badges.js';
import { EmptyState, NotConnectedState } from '../components/states.js';
import { Legend } from '../components/controls.js';
import { LightCheckBadge, MachineBadge } from '../components/machine.js';

export const id = 'all';
export const needsStore = false;
export const load = () => api('all-stores');

function scheduleLine(label, part, store) {
  if (part.scope === 'out_of_scope') return h('div', { class: 'row-top' }, h('b', null, label), h('span', { class: 'muted' }, S.outOfScope));
  if (part.unconfirmedSchedule) return AlertCard(label, S.scheduleUnconfirmed, 'warn');
  return h('a', { class: 'row-top rowlink', href: href.today(store) }, h('b', null, label),
    h('div', { class: 'dots' }, part.items.length
      ? part.items.map((i) => DotLabel(runTone(i.status), hhmm(i.at), runLabel(i.status)))
      : h('span', { class: 'muted' }, '—')));
}

export function view(env) {
  const stores = env.data.stores;
  if (!stores.length) return EmptyState(S.noStores, S.noStoresBody);
  return h('div', { class: 'stack' },
    h('div', { class: 'card card--glass keep-color' }, Legend()),
    stores.map((s) => {
      const head = { title: s.display_name, href: `#/today?store=${encodeURIComponent(s.store)}`, aside: EvidenceBadge(s.capability.evidence) };
      if (s.connection !== 'connected') return Card(head, NotConnectedState());
      return Card(head,
        h('div', { class: 'stack' },
          scheduleLine(S.all.patrol, s.patrol, s.store),
          scheduleLine(S.all.daily, s.daily, s.store),
          (s.patrol.unconfirmedStatus || s.daily.unconfirmedStatus) && h('div', { class: 'small muted' }, S.runStatusUnconfirmed),
          Metrics(
            MetricCard(S.all.questions, s.questionsToday.state === 'value' ? `${s.questionsToday.value}${S.all.unit}` : S.notPulled, null, { href: href.today(s.store) }),
            MetricCard(S.all.waiting, `${s.waitingQuestions}${S.all.unit}`, s.questionsIncomplete ? S.questionsIncompleteShort : null, { href: href.questions(s.store) }),
            MetricCard(S.all.messages, countText(s.messagesToday), `${S.all.botReplies} ${countText(s.botRepliesToday)}`, { href: href.messages(s.store) }),
          ),
          h('a', { class: 'rowlink', href: href.machines() }, KeyValues([
            [S.all.machine, MachineBadge(s.machine)],
            [S.all.lightCheck, LightCheckBadge(s.lightCheck)],
          ]))));
    }));
}
