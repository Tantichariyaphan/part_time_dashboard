// Maps semantic keys (sent by the API) to a tone class + label.
// Colours follow REQ §6 and must not be re-purposed for decoration:
//   ok=green  silent_ok=light green  late=yellow  running/not-due=grey  unknown=dark yellow  blocked=red  missing/no-row=dark red
import { S } from './strings.ja.js';

const RUN_TONE = {
  ok: 'tone-ok', silent_ok: 'tone-silent', late: 'tone-late', running: 'tone-wait', not_due: 'tone-wait', awaiting: 'tone-await', // ring dot: time passed, no result yet (client 2026-10-14)
  unknown: 'tone-unknown', blocked: 'tone-blocked', missing: 'tone-missing', no_row: 'tone-missing',
  unconfirmed: 'tone-neutral', // listed, not judged (Q-49): must not look like any REQ status colour
  no_evidence: 'tone-neutral', // judged from the client's records but none for this run: not judged, never 未実行
};
export const runTone = (k) => RUN_TONE[k] ?? 'tone-unknown';
// not judged: a daily delivery says 「3 経路判定未接続」, a scheduled read 「未確認（読取記録 未接続）」 (client rules 2026-10-21)
export const runLabel = (k, kind) => (k === 'unconfirmed' && kind === 'daily' ? S.run.unconfirmedDaily : S.runByKind[kind]?.[k] ?? S.run[k] ?? S.unknown);
/** Reason codes produced from the client's evidence -> words; a client-written reason is shown as it is. */
export const reasonText = (r) => (r == null ? null : S.evidenceReason[r] ?? r);
const ROUTE_TONE = { ok: 'tone-ok', late: 'tone-late', sent: 'tone-ok', unknown: 'tone-unknown', blocked: 'tone-blocked', missing: 'tone-neutral', scheduled: 'tone-wait', none: 'tone-neutral' };
export const routeTone = (k) => ROUTE_TONE[k] ?? 'tone-unknown';

// Question state colours (REQ §6-④): waiting=red, candidate=yellow, acked=yellow, answered=green, closed=grey
const Q_TONE = { waiting: 'tone-blocked', candidate: 'tone-late', acked: 'tone-late', answered: 'tone-ok', closed: 'tone-wait', unknown: 'tone-unknown' };
export const qTone = (k) => Q_TONE[k] ?? 'tone-unknown';

// Send results: `failed` is red (REQ §6-③ "ส่งล้มเหลว (แดง)"); `unknown` = not confirmed. `sent` has no documented colour -> neutral.
const SEND_TONE = { sent: 'tone-neutral', failed: 'tone-blocked', unknown: 'tone-unknown' };
export const sendTone = (k) => SEND_TONE[k] ?? 'tone-unknown';

// Handling marks (REQ §6-③): failed red; others have no documented colour.
const HANDLING_TONE = { replied: 'tone-neutral', pending: 'tone-wait', carried: 'tone-wait', failed: 'tone-blocked', unknown: 'tone-unknown' };
export const handlingTone = (k) => HANDLING_TONE[k] ?? 'tone-unknown';

// meta.status: stale / error stop the display (red banner, REQ §6)
export const metaTone = (k) => (k === 'ok' ? 'tone-ok' : k === 'stale' || k === 'error' ? 'tone-blocked' : 'tone-unknown');
