import { StatusBadge, EvidenceBadge } from './badges.js';
import { S } from '../strings.ja.js';

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
    case 'red': return StatusBadge('tone-blocked', S.machines.ago(l.minutesAgo), { compact: true });
    default: return StatusBadge('tone-ok', S.machines.ago(l.minutesAgo), { compact: true });
  }
}
