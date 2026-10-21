import { StatusBadge, EvidenceBadge } from './badges.js';
import { S } from '../strings.ja.js';
import { hhmm } from '../lib/format.js';

/** Production machine of a store (page ① / ⑥). Standby never stands in for it (server picks host+role). */
export function MachineBadge(m) {
  switch (m.state) {
    case 'not_connected': return EvidenceBadge('NOT_CONNECTED');
    case 'unknown': return StatusBadge('tone-unknown', S.unknown, { compact: true });
    case 'red': return StatusBadge('tone-blocked', `${S.machines.ago(m.ageMin)} ${m.verify ?? ''}`.trim(), { compact: true });
    default: return StatusBadge('tone-ok', `${S.machines.ago(m.ageMin)} ${m.verify ?? ''}`.trim(), { compact: true });
  }
}

/** Light check (text patrol): red only inside its window; outside -> "off hours". */
export function LightCheckBadge(l) {
  switch (l.state) {
    case 'out_of_scope': return StatusBadge('tone-neutral', S.outOfScope, { compact: true });
    case 'off_hours': return StatusBadge('tone-neutral', S.offHours, { compact: true });
    case 'not_connected': return EvidenceBadge('NOT_CONNECTED');
    case 'unknown': return StatusBadge('tone-unknown', S.unknown, { compact: true });
    // client rules 2026-10-21 §4: > 15 min 遅延／要確認, > 20 min stop detection; ok = last-run time only (never "成功")
    case 'confirmed': return StatusBadge('tone-ok', S.machines.fiveMinConfirmed(hhmm(l.lastRunAt) ?? '—', l.minutesAgo), { compact: true, wrap: true });
    case 'issue': return StatusBadge('tone-late', S.machines.fiveMinIssue(hhmm(l.lastRunAt) ?? '—'), { compact: true, wrap: true });
    case 'owner_unconfirmed': return StatusBadge('tone-unknown', S.machines.fiveMinOwner(hhmm(l.lastRunAt) ?? '—'), { compact: true, wrap: true });
    case 'red': return StatusBadge('tone-blocked', l.stopDetected ? S.machines.fiveMinStop(l.silentMin) : S.machines.fiveMinLate(l.silentMin), { compact: true, wrap: true });
    default: return StatusBadge('tone-ok', S.machines.lastRun(hhmm(l.lastRunAt) ?? '—', l.minutesAgo), { compact: true, wrap: true, title: S.machines.fiveMinDetail });
  }
}
