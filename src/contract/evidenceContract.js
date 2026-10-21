// Run-evidence tabs in the client's View-only Copy (client rules 2026-10-21 「NIKUSHO 巡回・日次の状態判定ルール」 §6-5, §7).
// The client's CODE / Codex builds them from its existing execution records, anonymised and read-only. PIATEC reads them only.
//
// STATUS OF THIS CONTRACT: the COLUMN lists are the client's minimum (§6-5). The TAB NAMES and the VALUE vocabularies below
// are PIATEC's PROPOSAL (docs/evidence-contract-proposal-2026-10-21.md) until the client confirms them. Anything outside the
// vocabularies is never guessed: it is judged 結果不明 (unknown) and reported as a finding code.
//
// Until a tab exists in the copy, the matching state stays 未確認 / 3 経路判定未接続 / 最終稼働時刻のみ確認 (existing behaviour).

export const EVIDENCE_TAB = Object.freeze({
  slot: '定時読取', // 12 / 17 / 22 scheduled LINE reads, one row per scheduled run
  patrol: '5分巡回', // new 5-minute patrol, one row per execution
  daily: '日次配送', // daily report, one row per (business_date, route)
});

/** Required columns (client minimum, §6-5). Order is not fixed. */
export const EVIDENCE_COLUMNS = Object.freeze({
  slot: ['run_id', 'scheduled_at', 'started_at', 'finished_at', 'source_complete', 'status', 'reason'],
  patrol: ['at', 'host', 'send', 'issues', 'audit_issues', 'google_beat'],
  daily: ['business_date', 'route', 'attempted_at', 'status', 'body_sha256', 'body_changed_after_attempt'],
});

/** Optional columns PIATEC asks for (proposal): without `owner` the 5-min patrol stays 「担当未確認」 (rule §4). */
export const EVIDENCE_OPTIONAL_COLUMNS = Object.freeze({
  slot: ['read_count'],
  patrol: ['owner'],
  daily: [],
});

/** Proposed value vocabularies (case-insensitive). Unknown values -> unknown, never success. */
export const SLOT_STATUS = Object.freeze({
  ok: 'ok', // client side: launch mode=read / result=ok / exit_code=0 AND read heartbeat ok / manifest=ok with a count (§3)
  fail: 'blocked', failed: 'blocked', error: 'blocked', stopped: 'blocked', safety_stop: 'blocked', // explicit failure / stop (§3)
  started: 'running', running: 'running', // launched, no end yet -> 結果不明 after the deadline (§2.5)
  not_started: 'not_started', // no launch row; missing only with source_complete=TRUE after the deadline (§2.5)
});
export const DAILY_ROUTES = Object.freeze({
  staff_all_line: 'staff_all_line', 'all line': 'staff_all_line', all_line: 'staff_all_line', '01': 'staff_all_line',
  owner_line: 'owner_line', '丸 line': 'owner_line', '02': 'owner_line',
  owner_email: 'owner_email', '丸メール': 'owner_email', '03': 'owner_email',
});
export const DAILY_ROUTE_ORDER = Object.freeze(['staff_all_line', 'owner_line', 'owner_email']);
export const DAILY_STATUS = Object.freeze({
  sent: 'sent', // send-gateway acceptance (status=sent, sent=true) - not inbox arrival, not read (§5)
  attempted: 'unknown', sending: 'unknown', unknown: 'unknown', // tried, outcome unknown -> no retry (§2.4, §5)
  blocked: 'blocked', stopped: 'blocked', prepare_failed: 'blocked', // stopped before sending (§5)
});
export const TRUE_VALUES = Object.freeze(['true', 'yes', '1']);
export const FALSE_VALUES = Object.freeze(['false', 'no', '0']);
export const GOOGLE_BEAT_OK = Object.freeze(['ok', 'true', 'success']);
export const PATROL_OWNER_NEW = 'new';

/** The current rules apply from this instant (§3); earlier slots keep the old rule and are not judged here. */
export const SLOT_RULE_FROM = '2026-10-05T23:36:00+07:00';
