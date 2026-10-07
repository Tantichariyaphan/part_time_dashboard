// Contract validation of what the reader returned from the client's View-only Copy (Data Contract v1) and from the
// Machine Heartbeat Spreadsheet. Fail closed: a violation BLOCKS the tab (or the whole copy) - nothing is repaired,
// stripped or guessed, and the Transform produces no rows from a blocked tab.
//
// Findings name tab / 元の行番号 / column / problem only. They never carry cell values, so a report about a leaked
// field cannot leak the field itself.
import {
  ALLOWED_RECIPIENT_CLASSES, CANCEL_MARK, COPY_COLUMNS, COPY_CONTRACT_VERSION, COPY_DATA_TAB_KEYS, COPY_TAB, FORBIDDEN_FIELDS,
  FREE_TEXT_COLUMNS, GROUP_ID_SUFFIX, HEARTBEAT_TAB, LINE_ID_ALLOWED_COLUMN, MESSAGE_KIND_MAP, RESEND_MARK, ROW_ID,
} from '../../contract/copyContract.js';
import { ALLOWED_GROUPS } from '../../contract/enums.js';
import { COLUMNS } from '../../contract/columns.js';
import { addDays, zonedInstant } from '../../domain/time.js';

const MAX_FINDINGS_KEPT = 50;
const LINE_ID = /(?<![A-Za-z0-9])[UCR][0-9a-f]{32}(?![0-9a-f])/;
const URL = /https?:\/\//i;
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const LOCAL_TIME = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

const cell = (v) => (v === undefined || v === null ? '' : String(v));
const blank = (v) => cell(v).trim() === '';

/**
 * A copy timestamp -> epoch ms, or NaN.
 * The copy's timestamp format is UNCONFIRMED (Q-12). Accepted:
 *   - ISO 8601 with an explicit offset (unambiguous);
 *   - `yyyy/MM/dd H:mm:ss` (the sample's form, no zone) ONLY when the server is configured with the zone those
 *     wall-clock times are written in (NIKUSHO_COPY_TIMEZONE). Without it the value is not interpretable.
 */
export function parseCopyTime(value, timezone) {
  const s = cell(value).trim();
  if (!s) return NaN;
  if (ISO_WITH_ZONE.test(s)) {
    const [date, time] = s.split('T');
    const [hh, mi, ss] = time.slice(0, 8).split(':').map(Number);
    if (addDays(date, 0) !== date || hh > 23 || mi > 59 || (ss ?? 0) > 59) return NaN; // no silent roll-over (e.g. 02-30)
    return Date.parse(s);
  }
  const m = LOCAL_TIME.exec(s);
  if (!m || !timezone) return NaN;
  const [y, mo, d, hh, mi, ss] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const date = `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (mo < 1 || mo > 12 || d < 1 || hh > 23 || mi > 59 || ss > 59 || addDays(date, 0) !== date || y < 2000) return NaN;
  return zonedInstant(date, `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, timezone) + ss * 1000;
}

function newTabResult(name) {
  return { tab: name, ok: true, findingCount: 0, findings: [], records: [] };
}

/** Sheet row position of a record (header = row 1). Not enumerable, so it never mixes with cell values. */
const POS = Symbol('row position');

/**
 * Row reference for a finding: the 元の行番号 only when it is a plain positive integer; otherwise the sheet position.
 * A malformed id cell could hold anything (a LINE id, a URL) and must not be echoed.
 */
const rowRef = (raw, pos) => (/^[1-9]\d*$/.test(String(raw ?? '').trim()) ? String(raw).trim() : `#${pos}`);

/** Column label for a finding: a contract column or an exact forbidden name is named; any other header text is not echoed. */
const colRef = (h, expected, idx) => (expected.includes(h) || FORBIDDEN_FIELDS.includes(h) ? h : `col ${idx + 1}`);

function note(result, row, column, problem) {
  result.ok = false;
  result.findingCount += 1;
  if (result.findings.length < MAX_FINDINGS_KEPT) result.findings.push({ tab: result.tab, row, column, problem });
}

/** Header checks shared by copy tabs and heartbeat tabs. Returns false when rows cannot be read safely. */
function checkHeader(result, table, expected, { exactOrder }) {
  if (!table) { note(result, null, null, 'tab_missing'); return false; }
  const header = (table.header ?? []).map((h) => cell(h).trim());
  header.forEach((h, i) => {
    if (FORBIDDEN_FIELDS.some((f) => h.includes(f))) note(result, null, colRef(h, expected, i), 'forbidden_field');
  });
  const seen = new Set();
  header.forEach((h, i) => {
    if (h === '') note(result, null, `col ${i + 1}`, 'blank_column_name');
    else if (seen.has(h)) note(result, null, colRef(h, expected, i), 'duplicate_column');
    seen.add(h);
  });
  for (const c of expected) if (!seen.has(c)) note(result, null, c, 'missing_column');
  header.forEach((h, i) => {
    if (h !== '' && !expected.includes(h) && !FORBIDDEN_FIELDS.some((f) => h.includes(f))) note(result, null, colRef(h, expected, i), 'unexpected_column');
  });
  if (exactOrder && result.ok && header.join('\u0000') !== expected.join('\u0000')) note(result, null, null, 'column_order');
  return result.ok;
}

/** Rows as objects keyed by column; a row wider than the header, or a fully blank row, is reported, never dropped. */
function toRecords(result, table, idColumn) {
  const header = table.header.map((h) => cell(h).trim());
  const out = [];
  (table.rows ?? []).forEach((cells, i) => {
    const arr = Array.isArray(cells) ? cells : [];
    const pos = i + 2;
    const ref = rowRef(idColumn ? arr[header.indexOf(idColumn)] : null, pos);
    if (arr.length > header.length && arr.slice(header.length).some((v) => !blank(v))) note(result, ref, null, 'row_wider_than_header');
    if (arr.every(blank)) { note(result, ref, null, 'blank_row'); return; }
    const rec = Object.fromEntries(header.map((h, j) => [h, cell(arr[j])]));
    rec[POS] = pos;
    out.push(rec);
  });
  return out;
}

function scanCells(result, key, rec, id) {
  const free = FREE_TEXT_COLUMNS[key] ?? [];
  for (const [col, v] of Object.entries(rec)) {
    if (col !== LINE_ID_ALLOWED_COLUMN && LINE_ID.test(v)) note(result, id, col, 'line_id_in_cell');
    if (!free.includes(col) && URL.test(v)) note(result, id, col, 'url_in_cell');
  }
}

function checkTime(result, rec, col, id, timezone) {
  if (!Number.isFinite(parseCopyTime(rec[col], timezone))) note(result, id, col, blank(rec[col]) ? 'missing_value' : 'timestamp_format');
}

const ROW_CHECKS = {
  log(result, rec, id, timezone) {
    checkTime(result, rec, '日時', id, timezone);
    const group = rec['群'].trim();
    if (!ALLOWED_GROUPS.includes(group)) note(result, id, '群', 'unexpected_group');
    const suffix = rec['グループID'].trim().slice(-6);
    if (blank(rec['グループID'])) note(result, id, 'グループID', 'missing_value');
    else if (GROUP_ID_SUFFIX[suffix] === undefined) note(result, id, 'グループID', 'unexpected_group');
    else if (GROUP_ID_SUFFIX[suffix] !== group) note(result, id, 'グループID', 'group_id_mismatch');
    const mid = rec.messageId.trim();
    if (!mid) note(result, id, 'messageId', 'missing_value');
    else if (/[eE.,]/.test(mid)) note(result, id, 'messageId', 'rounded_identifier'); // a number the sheet rounded (e.g. 1.23E+17)
    if (blank(rec['種別'])) note(result, id, '種別', 'missing_value');
    if (!['', RESEND_MARK].includes(rec['再送'].trim())) note(result, id, '再送', 'unexpected_value');
    if (!['', CANCEL_MARK].includes(rec['取消'].trim())) note(result, id, '取消', 'unexpected_value');
    // A media row whose 内容 holds a link is where an image URL would leak.
    if (MESSAGE_KIND_MAP[rec['種別'].trim()] !== 'text' && URL.test(rec['内容'])) note(result, id, '内容', 'url_in_media_row');
  },
  sendLog(result, rec, id, timezone) {
    checkTime(result, rec, '日時', id, timezone);
    if (!ALLOWED_RECIPIENT_CLASSES.includes(rec['宛先の群'].trim())) note(result, id, '宛先の群', 'unexpected_recipient');
  },
  questions(result, rec, id, timezone) {
    if (blank(rec.question_id)) note(result, id, 'question_id', 'missing_value');
    checkTime(result, rec, '送信時刻', id, timezone);
    if (!ALLOWED_GROUPS.includes(rec.group.trim())) note(result, id, 'group', 'unexpected_group');
  },
  heartbeat(result, rec, id, timezone) {
    checkTime(result, rec, '時刻', id, timezone);
  },
};

const UNIQUE_KEY = { questions: 'question_id' }; // the copy key must identify one row

function validateDataTab(key, table, timezone) {
  const result = newTabResult(COPY_TAB[key]);
  if (!checkHeader(result, table, COPY_COLUMNS[key], { exactOrder: true })) return result;
  const records = toRecords(result, table, ROW_ID);
  const ids = new Set();
  const keys = new Set();
  for (const rec of records) {
    const raw = rec[ROW_ID].trim();
    const id = /^[1-9]\d*$/.test(raw) ? raw : null;
    if (!id) note(result, `#${rec[POS]}`, ROW_ID, raw ? 'malformed_row_identity' : 'missing_row_identity');
    else if (ids.has(id)) note(result, id, ROW_ID, 'duplicate_row_identity');
    if (id) ids.add(id);
    const ref = id ?? `#${rec[POS]}`;
    scanCells(result, key, rec, ref);
    ROW_CHECKS[key](result, rec, ref, timezone);
    const uk = UNIQUE_KEY[key];
    if (uk && !blank(rec[uk])) {
      if (keys.has(rec[uk].trim())) note(result, ref, uk, 'duplicate_key');
      keys.add(rec[uk].trim());
    }
  }
  result.records = result.ok ? records : [];
  return result;
}

/** Copy `meta`: one row per data tab; `contract_version` must be v1; `last_read_at` must be a readable time. */
function validateMeta(table, timezone) {
  const result = newTabResult(COPY_TAB.meta);
  const perTab = {};
  if (!checkHeader(result, table, COPY_COLUMNS.meta, { exactOrder: true })) return { result, perTab };
  const records = toRecords(result, table, null);
  const names = Object.fromEntries(COPY_DATA_TAB_KEYS.map((k) => [COPY_TAB[k], k]));
  for (const rec of records) {
    scanCells(result, 'meta', rec, null);
    const key = names[rec.tab.trim()];
    if (!key) { note(result, null, 'tab', 'unexpected_meta_tab'); continue; }
    if (perTab[key]) { note(result, null, 'tab', 'duplicate_meta_row'); continue; }
    const problems = [];
    if (rec.contract_version.trim() !== COPY_CONTRACT_VERSION) problems.push(['contract_version', 'contract_version']);
    if (!Number.isFinite(parseCopyTime(rec.last_read_at, timezone))) problems.push(['last_read_at', blank(rec.last_read_at) ? 'missing_value' : 'timestamp_format']);
    if (!blank(rec.updated_at) && !Number.isFinite(parseCopyTime(rec.updated_at, timezone))) problems.push(['updated_at', 'timestamp_format']);
    perTab[key] = { record: rec, problems };
  }
  result.records = result.ok ? records : [];
  return { result, perTab };
}

/**
 * @param {{titles: string[]|null, tables: Record<string, {header: any[], rows: any[][]}|undefined>}} read
 * @param {{timezone?: string|null}} opts
 * @returns {{ok: boolean, copyFindings: object[], meta: object, tabs: Record<string, object>}}
 *   ok=false at copy level -> every tab is blocked. A tab with ok=false is blocked on its own.
 */
export function validateCopy(read, { timezone = null } = {}) {
  const copy = newTabResult('(copy)');
  const tables = read?.tables ?? {};
  const known = new Set(Object.values(COPY_TAB));
  if (Array.isArray(read?.titles)) for (const t of read.titles) if (!known.has(String(t))) note(copy, null, null, 'unexpected_tab');

  const { result: meta, perTab } = validateMeta(tables[COPY_TAB.meta], timezone);
  if (!meta.ok) note(copy, null, null, 'meta_invalid');

  const tabs = {};
  for (const key of COPY_DATA_TAB_KEYS) {
    const r = validateDataTab(key, tables[COPY_TAB[key]], timezone);
    const m = perTab[key];
    if (meta.ok && !m) note(r, null, null, 'no_meta_row');
    for (const [col, problem] of m?.problems ?? []) note(r, null, `meta.${col}`, problem);
    if (!copy.ok) { r.ok = false; r.records = []; }
    if (!r.ok) r.records = [];
    tabs[key] = { ...r, meta: m?.record ?? null };
  }
  return { ok: copy.ok, copyFindings: copy.findings, copyFindingCount: copy.findingCount, meta, tabs };
}

/** Machine Heartbeat Spreadsheet: tabs `beats` and `alerts` with the REQ §5-3 columns (order not fixed by REQ). */
export function validateHeartbeat(read) {
  const tables = read?.tables ?? {};
  const tabs = {};
  for (const key of Object.keys(HEARTBEAT_TAB)) {
    const result = newTabResult(HEARTBEAT_TAB[key]);
    if (checkHeader(result, tables[HEARTBEAT_TAB[key]], COLUMNS[key], { exactOrder: false })) {
      const records = toRecords(result, tables[HEARTBEAT_TAB[key]], null);
      for (const rec of records) {
        for (const [col, v] of Object.entries(rec)) if (LINE_ID.test(v) || URL.test(v)) note(result, null, col, 'unexpected_identifier_or_url');
      }
      result.records = result.ok ? records : [];
    }
    tabs[key] = result;
  }
  return { ok: Object.values(tabs).every((t) => t.ok), tabs };
}
