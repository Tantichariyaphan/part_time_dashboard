// ⑥ 機械の確認とデータ更新 - are the machines and the updates still working? (REQ §6-⑥; names: client rules 2026-10-21)
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
import { isIdDamageText, rowListSummary } from '../lib/collapse.js';

/** Thai internal tab name -> Japanese display name (the internal name is unchanged; REQ: the screen is Japanese). */
export const tabLabel = (name) => S.tabLabel[name] ?? name;

/** A long row-number list -> 「ID破損 36行」 + 行番号を表示 (display only; the full text stays one tap away). */
function RowList(key, label, rows, ctx, full) {
  const open = ctx?.isOpen(key);
  return h('span', null, label,
    h('button', { class: 'linkbtn', type: 'button', 'aria-expanded': String(Boolean(open)), onclick: () => ctx.toggle(key) }, open ? S.collapse.hideRows : S.collapse.showRows),
    open && h('span', { class: 'sub rowlist' }, full));
}

function UpdateDetail(u, ctx) {
  const r = rowListSummary(u.detail);
  if (!r) return h('span', { class: 'sub' }, u.detail);
  const label = isIdDamageText(r.head) ? S.collapse.idDamaged(r.rows.length) : `${r.head}：${S.collapse.rowsShort(r.rows.length)}`;
  return h('span', { class: 'sub' }, RowList(`ud:${u.tab}`, label, r.rows, ctx, u.detail));
}

function WarningList(t, ctx) {
  const T = S.sources;
  const ws = t.warnings ?? [];
  const allIds = ws.length > 0 && ws.every((f) => f.problem === 'rounded_identifier');
  const text = allIds
    ? `${T.row} ${ws.map((f) => f.row).join(', ')}${t.warningCount > ws.length ? ` ${S.collapse.more(t.warningCount - ws.length)}` : ''}`
    : ws.map((f) => `${f.row ? `${T.row} ${f.row} ` : ''}${f.column ?? ''} ${f.problem}`).join('、');
  if (!allIds && ws.length < 4) return h('span', { class: 'muted' }, `${T.warnings(t.warningCount)}：${text}`);
  return h('span', { class: 'muted' }, RowList(`sw:${t.tab}`, allIds ? S.collapse.idDamagedKept(t.warningCount) : T.warnings(t.warningCount), ws, ctx, text));
}

export const id = 'machines';
export const needsStore = false;
export const load = () => api('machines');

const mark = (v) => (v === true ? '○' : v === false ? '×' : '—');

function Machine(m, intervalMin) {
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
      [S.machines.lastHour, h('span', null, S.machines.count(m.recent.length), h('span', { class: 'small muted' }, S.machines.perInterval(intervalMin)))],
    ].filter(Boolean)),
    m.recent.length > 0 && h('div', { class: 'beats', 'aria-label': S.machines.recent },
      m.recent.map((b) => h('span', { class: `beat${b.verify === 'FAIL' ? ' beat--fail' : ''}`, title: b.verify === 'FAIL' ? `FAIL ${b.fail_items ?? ''}` : 'PASS' },
        hhmm(b.received_at), b.verify === 'FAIL' && ' FAIL'))));
}

/** The client's two files as this server sees them (copy adapter only): states, codes, counts, row numbers. No values. */
function Sources(src, ctx) {
  const T = S.sources;
  const tabRow = (t) => h('div', { class: 'row-top small' }, h('span', null, tabLabel(t.tab)),
    StatusBadge(t.state === 'ok' ? 'tone-ok' : 'tone-blocked', T.tabState[t.state] ?? t.state, { compact: true }),
    t.rows != null && h('span', { class: 'muted' }, T.rows(t.rows)),
    t.used === 'validated_only' && h('span', { class: 'muted' }, T.validatedOnly),
    t.findingCount > 0 && h('span', null, `${T.findings(t.findingCount)}：${t.findings.map((f) => `${f.row ? `${T.row} ${f.row} ` : ''}${f.column ?? ''} ${f.problem}`).join('、')}`),
    t.warningCount > 0 && WarningList(t, ctx));
  const part = (label, s) => h('div', { class: 'row' },
    h('div', { class: 'row-top' }, h('b', null, label),
      s.state === 'NOT_CONNECTED' ? EvidenceBadge('NOT_CONNECTED') : StatusBadge(s.state === 'CONNECTED' ? 'tone-ok' : 'tone-blocked', T.state[s.state] ?? s.state, { compact: true }),
      s.reason && h('span', { class: 'small muted' }, s.reason)),
    s.readAt && h('div', { class: 'small muted' }, `${T.readAt} ${mdhm(s.readAt)}`),
    (s.tabs ?? []).map(tabRow),
    s.replyLinks && h('div', { class: 'small muted' }, T.replies(s.replyLinks.confirmed, s.replyLinks.ambiguous, s.replyLinks.unlinked)));
  // client run-evidence tabs (rules 2026-10-21): absent = 未接続, the matching state stays 未確認
  const ev = (src.evidenceTabs ?? []).length > 0 && h('div', { class: 'row' },
    h('div', { class: 'row-top' }, h('b', null, T.evidence)),
    src.evidenceTabs.map((t) => h('div', { class: 'row-top small' }, h('span', null, t.tab),
      StatusBadge(t.state === 'ok' ? 'tone-ok' : t.state === 'absent' ? 'tone-neutral' : 'tone-blocked', T.evidenceState[t.state] ?? t.state, { compact: true }),
      t.rows != null && h('span', { class: 'muted' }, T.rows(t.rows)),
      t.findingCount > 0 && h('span', null, `${T.findings(t.findingCount)}：${t.findings.map((f) => `${f.row ? `${T.rowPos} ${f.row} ` : ''}${f.column ?? ''} ${f.problem}`).join('、')}`))));
  return Card({ title: T.title }, h('div', { class: 'rows' }, part(T.copy, src.copy), part(T.heartbeat, src.heartbeat), ev));
}

export function view(env, ctx) {
  const d = env.data;
  return h('div', { class: 'stack' },
    d.sources && Sources(d.sources, ctx),
    Card({ title: S.machines.updates },
      DataTable({
        variant: 'left',
        columns: ['', S.machines.status, S.machines.lastSuccess, S.machines.through],
        rows: d.updates.map((u) => [
          tabLabel(u.tab),
          u.status ? StatusBadge(metaTone(u.status), u.status, { compact: true }) : StatusBadge('tone-unknown', S.unknown, { compact: true }),
          hhmm(u.last_success_at) ?? '—',
          h('span', null, hhmm(u.source_through) ?? '—', u.detail && UpdateDetail(u, ctx),
            u.generated_at && h('span', { class: 'sub' }, S.machines.generated(hhmm(u.generated_at), agoText(u.generatedAgeMin)))),
        ]),
      })),
    d.heartbeatSheet === 'not_connected'
      ? Card({ title: S.machines.machines, aside: EvidenceBadge('NOT_CONNECTED') }, NotConnectedState(S.machines.noSheet))
      : h('div', { class: 'stack' }, d.machines.length ? d.machines.map((m) => Machine(m, d.beatIntervalMin)) : EmptyState(S.machines.noBeat)),
    d.lightChecks.length > 0 && Card({ title: S.machines.light },
      h('div', { class: 'rows' }, d.lightChecks.map((l) => h('div', { class: 'row' },
        h('div', { class: 'row-top' }, h('b', null, l.display_name), LightCheckBadge(l)),
        l.window && h('div', { class: 'small muted' }, `${S.machines.window} ${l.window}`),
        // client rules 2026-10-21 §6-3: only the last-run time is confirmed; per-run results are not judged
        h('div', { class: 'small muted' }, l.evidence ? S.machines.fiveMinEvidenceNote : `${S.machines.fiveMinNote}：${S.machines.fiveMinDetail}`))))),
    Card({ title: S.machines.alerts },
      d.alerts === null ? NotConnectedState(S.machines.noSheet)
        : d.alerts.length ? h('div', { class: 'rows' }, d.alerts.map((a) => h('div', { class: 'row' },
          h('div', { class: 'row-top' }, h('span', { class: 't' }, mdhm(a.at)),
            StatusBadge(a.kind === 'recovered' ? 'tone-ok' : a.kind === 'silent' ? 'tone-blocked' : 'tone-late', S.machines.alertKind[a.kind] ?? S.unknown, { compact: true })),
          h('div', { class: 'small' }, a.detail)))) : EmptyState(S.none)));
}
