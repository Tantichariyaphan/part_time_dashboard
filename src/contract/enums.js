// Screen Data enumerations. Authority: docs/data-mapping.md §5 (REQ §5-3, §6). Do not add values.

/** Internal keys -> exact Screen Data tab names (REQ §5-3). */
export const TAB_NAME = Object.freeze({
  meta: 'meta',
  stores: 'stores',
  schedules: 'schedules',
  runs: 'ทะเบียนรอบตรวจ',
  questions: 'ทะเบียนคำถาม',
  sends: 'บันทึกการส่ง',
  messages: 'ทะเบียนข้อความ',
  beats: 'beats', // Heartbeat Sheet (client-prepared)
  alerts: 'alerts', // Heartbeat Sheet (client-prepared)
});

/** The four tabs described by a `meta` row (REQ §5-3). */
export const META_TAB_KEYS = Object.freeze(['runs', 'questions', 'sends', 'messages']);

/** Heartbeat Sheet tabs: may be absent (NOT CONNECTED) until the client prepares them (due 10/8). */
export const OPTIONAL_SHEET_KEYS = Object.freeze(['beats', 'alerts']);

export const RUN_STATUS = Object.freeze(['ok', 'silent_ok', 'late', 'running', 'blocked', 'missing', 'unknown']);
export const RUN_KIND = Object.freeze(['slot', 'daily']);
export const META_STATUS = Object.freeze(['ok', 'stale', 'error']);
export const QUESTION_STATE = Object.freeze(['waiting', 'candidate', 'acked', 'answered', 'closed']);
export const CLOSED_REASON = Object.freeze(['answered', 'owner', 'no_reply']);
export const ANSWER_LINK = Object.freeze(['confirmed', 'candidate']);
export const QUESTION_LINK = Object.freeze(['confirmed', 'candidate']);
export const SEND_KIND = Object.freeze(['question', 'reply', 'daily', 'alert']);
export const TARGET_KIND = Object.freeze(['group', 'owner']);
export const SEND_RESULT = Object.freeze(['sent', 'unknown', 'failed']);
export const MESSAGE_KIND = Object.freeze(['text', 'photo', 'sticker', 'other']);
export const HANDLING = Object.freeze(['replied', 'not_needed', 'pending', 'carried', 'failed', 'unknown']);
export const REPLY_BY = Object.freeze(['light', 'heavy']);
export const REPLY_LINK = Object.freeze(['confirmed', 'ambiguous']);
export const BEAT_ROLE = Object.freeze(['production', 'standby']);
export const BEAT_VERIFY = Object.freeze(['PASS', 'FAIL']);
export const ALERT_KIND = Object.freeze(['silent', 'recovered', 'fail']);
export const OWNER_NOTIFIED = Object.freeze(['yes', 'no']);
export const ACTIVE = Object.freeze(['yes', 'no']);
/** Value of the optional yes-only marker columns (columns.js OPTIONAL_COLUMNS: messages.cancelled, sends.replies_to_message). */
export const MARK_YES = Object.freeze(['yes']);

/** Data-level evidence labels (docs/data-mapping.md §0.1). */
export const EVIDENCE = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  CANDIDATE: 'CANDIDATE',
  UNKNOWN: 'UNKNOWN',
  NOT_CONNECTED: 'NOT_CONNECTED',
});

/** Groups allowed in the View-only Copy (REQ §5-1). Filtering is done by the client's Copy Script (since 2026-10-07); PIATEC verifies, it never filters the Original Records. */
export const ALLOWED_GROUPS = Object.freeze(['MEAT', 'IN', 'ALL', 'MANAGEMENT', 'PHOTO']);

export const CONTRACT_VERSION = 'v1';
