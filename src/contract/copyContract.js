// Data Contract v1 of the client's View-only Copy (client update 2026-10-07; docs/connection-spec.md §4) and the
// tab names of the client's Machine Heartbeat Spreadsheet (REQ §5-3).
//
// This is the INPUT contract read by PIATEC. It is separate from the Screen Data contract (columns.js / enums.js),
// which is what the Transform produces. The Copy Script that writes this copy is the client's; PIATEC never builds,
// installs or replaces it, and never opens the Original Records.
//
// Every value here is CONFIRMED by the client (10/7) or by REQ §5-1 unless its comment says otherwise.
import { ALLOWED_GROUPS, TAB_NAME } from './enums.js';

export const COPY_CONTRACT_VERSION = 'v1'; // literal value written in copy `meta.contract_version`: UNCONFIRMED (Q-50)

/** Internal keys -> exact tab names in the View-only Copy. */
export const COPY_TAB = Object.freeze({
  log: 'ログ',
  sendLog: '送信ログ',
  questions: 'AI質問追跡',
  heartbeat: '心拍',
  meta: 'meta',
});
export const COPY_DATA_TAB_KEYS = Object.freeze(['log', 'sendLog', 'questions', 'heartbeat']);

/** Columns, left to right, exactly as the client fixed them (connection-spec §4.1). */
export const COPY_COLUMNS = Object.freeze({
  log: ['元の行番号', '日時', 'グループID', '群', '発言者', '発言者キー', '種別', '内容', 'messageId', '再送', '取消'],
  sendLog: ['元の行番号', '日時', '宛先', '宛先の群', '宛先キー', '文面', '結果', '返した元の発言'],
  questions: ['元の行番号', 'question_id', '送信時刻', 'group', 'who', 'question_th', 'source_candidate_sha256', 'slot', 'state'],
  heartbeat: ['元の行番号', '時刻', '読んだ行数', '候補数', '送信MEAT', '送信IN', '結果', '実行ms', 'gap分'],
  meta: ['tab', 'last_read_at', 'updated_at', 'source_rows', 'copied_rows', 'contract_version', 'status', 'detail'],
});

/** Row identity in every data tab: one copy row = one original row, updated in place, never twice (client 10/7). */
export const ROW_ID = '元の行番号';

/** Copy tab -> the Screen Data tab it feeds (connection-spec §6). */
export const COPY_TO_SCREEN = Object.freeze({ log: 'messages', sendLog: 'sends', questions: 'questions', heartbeat: 'runs' });

/** Columns that must never appear anywhere (REQ §5-1). A header containing one of these names blocks the tab. */
export const FORBIDDEN_FIELDS = Object.freeze(['userId', '宛先ID', '画像URL']);

/** Recipient classification for owner sends in `送信ログ.宛先の群`. OWNER is NOT a sixth group (client 10/7). */
export const OWNER_RECIPIENT = 'OWNER';
export const ALLOWED_RECIPIENT_CLASSES = Object.freeze([...ALLOWED_GROUPS, OWNER_RECIPIENT]);

/** Last 6 characters of `グループID` -> group name (REQ §5-1). LINK (4846a3) and every other suffix are never copied. */
export const GROUP_ID_SUFFIX = Object.freeze({ '2c54ac': 'MEAT', c894fd: 'IN', '47247d': 'ALL', '15c2bf': 'MANAGEMENT', '49fcce': 'PHOTO' });

/** Free-text columns (staff writing, sent text). Links typed by staff are content; everywhere else a URL is a violation. */
export const FREE_TEXT_COLUMNS = Object.freeze({
  log: ['発言者', '内容'],
  sendLog: ['宛先', '文面', '返した元の発言'],
  questions: ['who', 'question_th'],
  heartbeat: ['結果'],
  meta: ['detail'],
});

/** The only column allowed to hold a LINE group id (REQ §5-1 keeps `グループID`; the client resolves `群` from it). */
export const LINE_ID_ALLOWED_COLUMN = 'グループID';

/** Values of `ログ.再送` / `ログ.取消` other than blank (sample 10/5; REQ §5-1). */
export const RESEND_MARK = '再送';
export const CANCEL_MARK = '取消';

/** `ログ.種別` -> Screen Data `kind` (data-mapping §5.6). Values outside this table -> `other` (the full list is Q-12). */
export const MESSAGE_KIND_MAP = Object.freeze({ text: 'text', image: 'photo', sticker: 'sticker' });

/** Rows from this date onward are in the copy (client 10/7). Informational: older rows are not an error. */
export const COPY_RANGE_FROM = '2026-09-01';

/**
 * Source facts the client stated on 10/7 that limit what the copy can prove (connection-spec §0-14 – §0-17).
 * They are facts, not rules: nothing below decides a run status or a question state.
 *  - since 2026-10-05 23:36 MEAT/IN questions are sent by the 5-minute polling loop and are NOT written to
 *    `AI質問追跡` until the client's fix (Q-52) -> question records are incomplete from this instant.
 *  - how to read run status (incl. `AI=scheduled-off`) is not decided (Q-49) -> run status is not derived at all.
 */
export const COPY_SOURCE_LIMITS = Object.freeze({
  questionsIncompleteFrom: '2026-10-05T23:36:00+07:00',
  runStatus: 'UNCONFIRMED',
});

/** Machine Heartbeat Spreadsheet: a separate client file, read as-is (REQ §5-3). Columns = Screen Data `beats` / `alerts`. */
export const HEARTBEAT_TAB = Object.freeze({ beats: TAB_NAME.beats, alerts: TAB_NAME.alerts });
