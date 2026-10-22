// Run-evidence tabs in the client's View-only Copy (client rules 2026-10-21 §6-5; the client's column definition
// 「PIATEC 実行記録の列定義」 1/4–4/4 of 2026-10-22). The client's CODE / Codex builds them from its saved execution records
// (anonymised, read-only, merged every 5 minutes by record_key). The CLIENT judges each row's status; PIATEC reads it as given,
// never upgrades it, and never turns a missing or unreadable record into success.
//
// Tab names and columns below are the client's (2026-10-22). They replace PIATEC's earlier proposal (定時読取 / 5分巡回 / 日次配送).

export const EVIDENCE_TAB = Object.freeze({
  slot: 'run_line_read', // business day × 12 / 17 / 22 scheduled LINE reads
  patrol: 'run_fast_patrol', // every saved 5-minute patrol run (_fast_patrol/heartbeat.jsonl)
  daily: 'run_daily_delivery', // business day × 01_staff_all / 02_owner_line / 03_owner_email
});

/** All columns the client may put in any of the three tabs (union of the definition). Anything else blocks that tab. */
export const EVIDENCE_ALLOWED_COLUMNS = Object.freeze([
  'record_key', 'business_date', 'kind', 'scheduled_at', 'started_at', 'finished_at', 'status', 'count', 'ref', 'detail', 'owner',
  'source_complete', 'send', 'issues', 'audit_issues', 'google_beat', 'body_sha256', 'body_changed_after_attempt',
]);

/** Columns each tab needs before anything is judged from it. */
export const EVIDENCE_REQUIRED_COLUMNS = Object.freeze({
  slot: ['record_key', 'business_date', 'scheduled_at', 'status'],
  patrol: ['record_key', 'started_at', 'status', 'owner'],
  daily: ['record_key', 'business_date', 'kind', 'status', 'body_changed_after_attempt'],
});

/** Status values of the client (definition 2/4). Anything else -> 結果不明, never success. */
export const LINE_STATUS = Object.freeze(['ok', 'late', 'blocked', 'unknown', 'missing', 'scheduled', 'pending']);
export const PATROL_STATUS = Object.freeze(['ok', 'blocked', 'unknown', 'outside_hours']);
export const DAILY_STATUS = Object.freeze(['ok', 'late', 'blocked', 'unknown', 'missing', 'scheduled']);

/** `kind` of a daily row = the route (definition 1/4). */
export const DAILY_ROUTES = Object.freeze({
  '01_staff_all': 'staff_all_line', staff_all: 'staff_all_line', staff_all_line: 'staff_all_line',
  '02_owner_line': 'owner_line', owner_line: 'owner_line',
  '03_owner_email': 'owner_email', owner_email: 'owner_email',
});
export const DAILY_ROUTE_ORDER = Object.freeze(['staff_all_line', 'owner_line', 'owner_email']);

export const TRUE_VALUES = Object.freeze(['true', 'yes', '1']);
export const FALSE_VALUES = Object.freeze(['false', 'no', '0']);
export const PATROL_OWNER_NEW = 'new';

/** The current rules apply from this instant (§3); earlier slots keep the old rule and are not judged here. */
export const SLOT_RULE_FROM = '2026-10-05T23:36:00+07:00';
