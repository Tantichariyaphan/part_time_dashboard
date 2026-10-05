// ⑥ 稼働機とデータ更新 - are the machines and the updates still working? (REQ §6-⑥)
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { api } from '../lib/api.js';
import { agoText, hhmm, mdhm } from '../lib/format.js';
import { metaTone } from '../status.js';
import { Card, KeyValues } from '../components/cards.js';
import { StatusBadge, EvidenceBadge } from '../components/badges.js';
import { EmptyState, NotConnectedState } from '../components/states.js';
import { DataTable } from '../components/table.js';
import { LightCheckBadge } from '../components/machine.js';

export const id = 'machines';
export const needsStore = false;
export const load = () => api('machines');

const mark = (v) => (v === true ? '○' : v === false ? '×' : '—');

function Machine(m) {
  const isProd = m.role === 'production';
  const hbBadge = m.ageJudged
    ? StatusBadge(m.heartbeatRed ? 'tone-blocked' : 'tone-ok', S.machines.ago(m.ageMin), { compact: true })
    : h('span', null, S.machines.ago(m.ageMin), h('span', { class: 'small muted' }, `（${S.machines.notJudged}）`));
  return Card({ title: m.host, aside: StatusBadge(isProd ? 'tone-neutral' : 'tone-wait', isProd ? S.machines.production : S.machines.standby, { compact: true }) },
    KeyValues([
      [S.machines.heartbeat, hbBadge],
      [S.machines.verify, StatusBadge(m.verifyRed ? 'tone-blocked' : 'tone-ok', m.verify ?? '—', { compact: true })],
      m.fail_items ? [S.machines.failItems, m.fail_items] : null,
      ['ChatGPT / Drive / G:', `${mark(m.chatgpt)}　${mark(m.drive)}　${mark(m.g_mounted)}`],
      [S.machines.disk, m.disk_free_gb === null ? '—' : `${m.disk_free_gb} GB`],
      [S.machines.clock, m.clock_offset_sec === null ? '—' : `${m.clock_offset_sec} s`],
    ].filter(Boolean)));
}

export function view(env) {
  const d = env.data;
  return h('div', { class: 'stack' },
    Card({ title: S.machines.updates },
      DataTable({
        variant: 'left',
        columns: ['', 'status', S.machines.lastSuccess, S.machines.through],
        rows: d.updates.map((u) => [
          u.tab,
          u.status ? StatusBadge(metaTone(u.status), u.status, { compact: true }) : StatusBadge('tone-unknown', S.unknown, { compact: true }),
          hhmm(u.last_success_at) ?? '—',
          h('span', null, hhmm(u.source_through) ?? '—', u.detail && h('span', { class: 'sub' }, u.detail)),
        ]),
      })),
    d.heartbeatSheet === 'not_connected'
      ? Card({ title: S.machines.machines, aside: EvidenceBadge('NOT_CONNECTED') }, NotConnectedState(S.machines.noSheet))
      : h('div', { class: 'stack' }, d.machines.length ? d.machines.map(Machine) : EmptyState(S.machines.noBeat)),
    d.lightChecks.length > 0 && Card({ title: S.machines.light },
      h('div', { class: 'rows' }, d.lightChecks.map((l) => h('div', { class: 'row' },
        h('div', { class: 'row-top' }, h('b', null, l.display_name), LightCheckBadge(l)),
        l.window && h('div', { class: 'small muted' }, `${S.machines.window} ${l.window}`))))),
    Card({ title: S.machines.alerts },
      d.alerts === null ? NotConnectedState(S.machines.noSheet)
        : d.alerts.length ? h('div', { class: 'rows' }, d.alerts.map((a) => h('div', { class: 'row' },
          h('div', { class: 'row-top' }, h('span', { class: 't' }, mdhm(a.at)),
            StatusBadge(a.kind === 'recovered' ? 'tone-ok' : a.kind === 'silent' ? 'tone-blocked' : 'tone-late', S.machines.alertKind[a.kind] ?? S.unknown, { compact: true })),
          h('div', { class: 'small' }, a.detail)))) : EmptyState(S.none)));
}
