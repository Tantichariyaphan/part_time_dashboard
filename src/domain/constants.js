// Single source for requirement-mandated numbers (Claude.md §10, docs/architecture.md §7.1).
// Do not scatter these literals elsewhere.

/** Source row -> screen, whole path (REQ §5, TV9). Pipeline target; the UI does not enforce it. */
export const SOURCE_TO_SCREEN_MAX_MINUTES = 10;
/** Stopped updates must be detected within this time (REQ §6, TV19, TV21). */
export const STOP_DETECTION_MAX_MINUTES = 20;
/** `generated_at` older than this -> red "update stopped" banner (REQ §6). */
export const BANNER_STALE_MINUTES = 20;
/** Production machine heartbeat older than this -> red (REQ §6-⑥, TV14). */
export const PRODUCTION_HEARTBEAT_RED_MINUTES = 15;
/** Light check silent this long inside its window -> red (REQ §6-⑥, TV14). */
export const LIGHT_CHECK_RED_MINUTES = 15;
/** Page ⑤ window (REQ §6-⑤). */
export const RECENT_FAILURE_DAYS = 14;
/** Latest alerts shown on page ⑥ (REQ §6-⑥). */
export const ALERTS_SHOWN = 20;
/** Selectable periods on page ⑦ (REQ §6-⑦). */
export const PERIOD_DAYS = Object.freeze([7, 30]);
/** Machines write one `beats` row every 5 minutes (REQ §5-3). Informational. */
export const HEARTBEAT_WRITE_INTERVAL_MINUTES = 5;
/** Ids with these prefixes are samples: excluded from real summaries (REQ §6). */
export const DUMMY_PREFIXES = Object.freeze(['DUMMY-', 'dummy-']);
