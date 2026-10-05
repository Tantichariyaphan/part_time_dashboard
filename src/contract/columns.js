// Exact Screen Data columns per REQ §5-3 / docs/data-mapping.md §5. Order follows the requirement.
// Extra columns are tolerated (REQ §5-3 allows adding), but a documented column that is missing is treated
// as "required column missing" -> stopped-update banner (REQ §6). Which columns are truly "required" is
// not defined by the REQ: strict reading used (UNCONFIRMED, see docs/implementation-notes.md N-03).

export const COLUMNS = Object.freeze({
  meta: ['tab', 'generated_at', 'last_success_at', 'source_through', 'status', 'detail', 'contract_version'],
  stores: [
    'store', 'display_name', 'timezone', 'business_day_start', 'slot_times', 'slot_deadline_min',
    'daily_deadline_min', 'daily_time', 'text_patrol', 'production_host', 'active',
  ],
  schedules: ['store', 'kind', 'times', 'valid_from', 'valid_to'],
  runs: [
    'store', 'run_id', 'kind', 'scheduled_at', 'status', 'reason', 'read_at', 'ai_done_at', 'posted_at',
    'received_at', 'sent_at', 'input_lines', 'questions_sent', 'messages_sent', 'owner_items',
    'photos_total', 'photos_reviewed', 'owner_notified', 'evidence', 'updated_at',
  ],
  questions: [
    'store', 'question_id', 'run_id', 'send_id', 'sent_at', 'group', 'who', 'question_text', 'state',
    'closed_reason', 'closed_at', 'answers_json', 'updated_at',
  ],
  sends: ['store', 'send_id', 'sent_at', 'kind', 'target_kind', 'target_label', 'text', 'result'],
  messages: [
    'store', 'message_id', 'at', 'group', 'sender', 'kind', 'text', 'handling', 'replies_json',
    'question_id', 'question_link', 'run_id', 'updated_at',
  ],
  beats: [
    'received_at', 'host', 'role', 'stores', 'verify', 'fail_items', 'chatgpt', 'drive', 'g_mounted',
    'disk_free_gb', 'clock_offset_sec', 'text_patrol_at',
  ],
  alerts: ['at', 'kind', 'detail'],
});

/** Columns that hold counts / numbers. Blank (null) means "not pulled"; 0 means zero (REQ §6). */
export const NUMERIC_COLUMNS = Object.freeze({
  stores: ['slot_deadline_min', 'daily_deadline_min'],
  runs: ['input_lines', 'questions_sent', 'messages_sent', 'owner_items', 'photos_total', 'photos_reviewed'],
  beats: ['disk_free_gb', 'clock_offset_sec'],
});

export const BOOLEAN_COLUMNS = Object.freeze({
  beats: ['chatgpt', 'drive', 'g_mounted'],
});

/** Columns holding timestamps in `yyyy-MM-ddTHH:mm:ss+07:00` (REQ §5-3). */
export const TIMESTAMP_COLUMNS = Object.freeze({
  meta: ['generated_at', 'last_success_at', 'source_through'],
  runs: ['scheduled_at', 'read_at', 'ai_done_at', 'posted_at', 'received_at', 'sent_at', 'updated_at'],
  questions: ['sent_at', 'closed_at', 'updated_at'],
  sends: ['sent_at'],
  messages: ['at', 'updated_at'],
  beats: ['received_at', 'text_patrol_at'],
  alerts: ['at'],
});

export const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/;

/** Enumerated columns -> allowed values (null/blank permitted unless stated by REQ). */
import * as E from './enums.js';
export const ENUM_COLUMNS = Object.freeze({
  meta: { status: E.META_STATUS },
  stores: { active: E.ACTIVE },
  schedules: { kind: E.RUN_KIND },
  runs: { kind: E.RUN_KIND, status: E.RUN_STATUS, owner_notified: E.OWNER_NOTIFIED },
  questions: { state: E.QUESTION_STATE, closed_reason: E.CLOSED_REASON },
  sends: { kind: E.SEND_KIND, target_kind: E.TARGET_KIND, result: E.SEND_RESULT },
  messages: { kind: E.MESSAGE_KIND, handling: E.HANDLING, question_link: E.QUESTION_LINK },
  beats: { role: E.BEAT_ROLE, verify: E.BEAT_VERIFY },
  alerts: { kind: E.ALERT_KIND },
});
