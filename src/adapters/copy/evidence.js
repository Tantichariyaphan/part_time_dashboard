// Run evidence from the client's anonymised read-only tabs (client rules 2026-10-21, src/contract/evidenceContract.js).
// Read-only, fail closed, no guessing:
//   - a tab that is absent -> that state stays 未確認 (nothing is produced);
//   - a tab whose header or cells break the contract -> blocked as a whole (findings: tab / row / column / problem, no values);
//   - a value outside the vocabulary, conflicting rows, a missing end time, a changed body -> 結果不明 (unknown), never success;
//   - absence of a row is never 未実行: missing only when the client's own row says not started AND source_complete=TRUE.
// Output: Screen Data `runs` rows (slot + daily) and normalised 5-min patrol rows. Nothing is sent and nothing is retried.
import {
  DAILY_ROUTES, DAILY_ROUTE_ORDER, DAILY_STATUS, EVIDENCE_COLUMNS, EVIDENCE_OPTIONAL_COLUMNS, EVIDENCE_TAB, FALSE_VALUES,
  GOOGLE_BEAT_OK, SLOT_RULE_FROM, SLOT_STATUS, TRUE_VALUES,
} from '../../contract/evidenceContract.js';
import { FORBIDDEN_FIELDS } from '../../contract/copyContract.js';
import { parseCopyTime } from './validate.js';
import { expectedRuns, deadlineMin } from '../../domain/schedules.js';
import { formatIso } from '../../domain/time.js';

const MAX_FINDINGS = 50;
const MIN = 60000;
const LINE_ID = /(?<![A-Za-z0-9])[UCR][0-9a-f]{32}(?![0-9a-f])/;
const URL = /https?:\/\//i;
const SHA256 = /^[0-9a-f]{64}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cell = (v) => (v === undefined || v === null ? '' : String(v).trim());
const lower = (v) => cell(v).toLowerCase();
export const boolOf = (v) => (TRUE_VALUES.includes(lower(v)) ? true : FALSE_VALUES.includes(lower(v)) ? false : null);
const intOf = (v) => (/^\d+$/.test(cell(v)) ? Number(cell(v)) : null);
const RULE_FROM_MS = Date.parse(SLOT_RULE_FROM);

function tabResult(key) {
  return { key, tab: EVIDENCE_TAB[key], present: false, ok: false, rows: 0, findingCount: 0, findings: [], records: [] };
}
function note(r, row, column, problem) {
  r.ok = false;
  r.findingCount += 1;
  if (r.findings.length < MAX_FINDINGS) r.findings.push({ tab: r.tab, row, column, problem });
}

/** Header + cell checks of one evidence tab. Row refs are sheet positions (header = row 1); values are never echoed. */
export function validateEvidenceTab(key, table, timezone) {
  const r = tabResult(key);
  if (!table) return r;
  r.present = true;
  r.ok = true;
  const header = (table.header ?? []).map(cell);
  const allowed = [...EVIDENCE_COLUMNS[key], ...EVIDENCE_OPTIONAL_COLUMNS[key]];
  const seen = new Set();
  header.forEach((h, i) => {
    if (FORBIDDEN_FIELDS.some((f) => h.includes(f))) note(r, null, `col ${i + 1}`, 'forbidden_field');
    else if (h === '') note(r, null, `col ${i + 1}`, 'blank_column_name');
    else if (seen.has(h)) note(r, null, h, 'duplicate_column');
    else if (!allowed.includes(h)) note(r, null, `col ${i + 1}`, 'unexpected_column'); // names a position, not the header text
    seen.add(h);
  });
  for (const c of EVIDENCE_COLUMNS[key]) if (!seen.has(c)) note(r, null, c, 'missing_column');
  if (!r.ok) return r;
  (table.rows ?? []).forEach((cells, i) => {
    const pos = i + 2;
    const arr = Array.isArray(cells) ? cells : [];
    if (arr.every((v) => cell(v) === '')) return; // blank rows are ignored in evidence tabs (sheet tail)
    if (arr.length > header.length && arr.slice(header.length).some((v) => cell(v) !== '')) note(r, pos, null, 'row_wider_than_header');
    const rec = Object.fromEntries(header.map((h, j) => [h, cell(arr[j])]));
    for (const [col, v] of Object.entries(rec)) {
      if (LINE_ID.test(v)) note(r, pos, col, 'line_id_in_cell');
      if (URL.test(v)) note(r, pos, col, 'url_in_cell');
    }
    const time = (col, required) => {
      if (rec[col] === '') { if (required) note(r, pos, col, 'missing_value'); return; }
      if (!Number.isFinite(parseCopyTime(rec[col], timezone))) note(r, pos, col, 'timestamp_format');
    };
    if (key === 'slot') { time('scheduled_at', true); time('started_at', false); time('finished_at', false); }
    if (key === 'patrol') time('at', true);
    if (key === 'daily') {
      if (!DATE.test(rec.business_date)) note(r, pos, 'business_date', rec.business_date ? 'date_format' : 'missing_value');
      time('attempted_at', false);
      if (rec.body_sha256 !== '' && !SHA256.test(rec.body_sha256)) note(r, pos, 'body_sha256', 'sha256_format');
    }
    rec._pos = pos;
    r.records.push(rec);
  });
  r.rows = r.records.length;
  if (!r.ok) r.records = [];
  return r;
}

/** 定時 LINE 読取 rows -> Screen Data runs (kind slot). */
export function judgeSlots(records, { store, timezone, readAt }) {
  const dl = (deadlineMin(store, 'slot') ?? 0) * MIN;
  const groups = new Map();
  let beforeRule = 0;
  for (const rec of records) {
    const at = parseCopyTime(rec.scheduled_at, timezone);
    if (at < RULE_FROM_MS) { beforeRule += 1; continue; } // older runs follow the old rule, not judged here (§3)
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push(rec);
  }
  const rows = [];
  const counts = { beforeRule, conflicting: 0, unrecognized: 0, notJudgedIncomplete: 0 };
  for (const [at, list] of groups) {
    const base = { store: store.store, kind: 'slot', scheduled_at: formatIso(at), evidence: 'client_records', run_id: `EV-SLOT-${formatIso(at)}` };
    if (list.length > 1) { counts.conflicting += 1; rows.push({ ...base, status: 'unknown', reason: 'conflicting_records' }); continue; }
    const rec = list[0];
    const fin = parseCopyTime(rec.finished_at, timezone);
    const st = SLOT_STATUS[lower(rec.status)];
    const read = { read_at: Number.isFinite(fin) ? formatIso(fin) : null, input_lines: intOf(rec.read_count) };
    if (st === 'ok') {
      if (!Number.isFinite(fin)) rows.push({ ...base, ...read, status: 'unknown', reason: 'no_finish_time' });
      else rows.push({ ...base, ...read, status: fin > at + dl ? 'late' : 'ok', reason: null });
    } else if (st === 'blocked') rows.push({ ...base, ...read, status: 'blocked', reason: cell(rec.reason).slice(0, 120) || 'failure_recorded' });
    else if (st === 'running') rows.push({ ...base, ...read, status: Number.isFinite(fin) ? 'unknown' : 'running', reason: Number.isFinite(fin) ? 'conflicting_records' : null });
    else if (st === 'not_started') {
      if (readAt < at + dl) continue; // not due yet: the screen shows 時刻前 / 結果待ち
      if (boolOf(rec.source_complete) === true) rows.push({ ...base, status: 'missing', reason: null });
      else counts.notJudgedIncomplete += 1; // range not complete: 未確認, never 未実行 (§2.3, §2.5)
    } else { counts.unrecognized += 1; rows.push({ ...base, ...read, status: 'unknown', reason: 'unrecognized_status' }); }
  }
  return { rows, counts };
}

/** 日次配送 rows (one per business_date × route) -> Screen Data runs (kind daily) with per-route detail. */
export function judgeDaily(records, { store, schedules, timezone, readAt }) {
  const dl = (deadlineMin(store, 'daily') ?? 0) * MIN;
  const byDay = new Map();
  for (const rec of records) {
    if (!byDay.has(rec.business_date)) byDay.set(rec.business_date, []);
    byDay.get(rec.business_date).push(rec);
  }
  const rows = [];
  const counts = { unscheduled: 0, unknownRoute: 0, conflicting: 0 };
  for (const [day, list] of byDay) {
    const exp = expectedRuns(store, schedules, 'daily', day)[0];
    if (!exp) { counts.unscheduled += 1; continue; }
    const deadline = exp.at + dl;
    const base = { store: store.store, kind: 'daily', scheduled_at: formatIso(exp.at), evidence: 'client_records', run_id: `EV-DAILY-${day}` };
    const routes = new Map();
    let reason = null;
    for (const rec of list) {
      const route = DAILY_ROUTES[lower(rec.route)];
      if (!route) { counts.unknownRoute += 1; reason = 'unknown_route'; continue; }
      if (routes.has(route)) { counts.conflicting += 1; reason = 'conflicting_records'; routes.set(route, { ...routes.get(route), status: 'unknown' }); continue; }
      const at = parseCopyTime(rec.attempted_at, timezone);
      let status = DAILY_STATUS[lower(rec.status)] ?? 'unknown';
      if (!DAILY_STATUS[lower(rec.status)]) reason ??= 'unrecognized_status';
      const changed = boolOf(rec.body_changed_after_attempt);
      if (status === 'sent' && changed !== false) { status = 'unknown'; reason ??= changed === true ? 'body_changed' : 'body_change_unknown'; }
      if (status === 'sent' && !rec.body_sha256) { status = 'unknown'; reason ??= 'no_body_hash'; }
      routes.set(route, { route, status, at: Number.isFinite(at) ? at : null, sha: lower(rec.body_sha256) || null });
    }
    const vals = DAILY_ROUTE_ORDER.map((r) => routes.get(r) ?? { route: r, status: 'none', at: null, sha: null });
    const sent = vals.filter((v) => v.status === 'sent');
    if (new Set(sent.map((v) => v.sha)).size > 1) { reason ??= 'body_mismatch'; for (const v of sent) v.status = 'unknown'; }
    let status;
    if (reason === 'unknown_route' || vals.some((v) => v.status === 'unknown')) status = 'unknown';
    else if (vals.some((v) => v.status === 'blocked')) status = 'blocked';
    else if (vals.every((v) => v.status === 'sent')) {
      const last = Math.max(...vals.map((v) => v.at ?? Number.POSITIVE_INFINITY));
      status = !Number.isFinite(last) ? 'unknown' : last > deadline ? 'late' : 'ok';
      if (!Number.isFinite(last)) reason ??= 'no_attempt_time';
    } else if (readAt < deadline) status = 'running'; // some routes still to come
    else { status = 'unknown'; reason ??= 'route_without_record'; }
    const lastAt = Math.max(...vals.map((v) => v.at ?? 0));
    rows.push({
      ...base, status, reason: status === 'ok' || status === 'late' || status === 'running' ? null : reason,
      sent_at: lastAt > 0 ? formatIso(lastAt) : null,
      routes_json: JSON.stringify(vals.map((v) => ({ route: v.route, status: v.status, at: v.at ? formatIso(v.at) : null }))),
    });
  }
  return { rows, counts };
}

/** 5分巡回 rows -> normalised rows (production host is chosen later, from the store configuration). */
export function patrolRows(records, { timezone }) {
  return records.map((rec) => {
    const at = parseCopyTime(rec.at, timezone);
    return {
      at: formatIso(at), host: cell(rec.host), send: boolOf(rec.send), issues: intOf(rec.issues), audit_issues: intOf(rec.audit_issues),
      google_beat: GOOGLE_BEAT_OK.includes(lower(rec.google_beat)) ? true : rec.google_beat === '' ? null : false,
      owner: rec.owner === undefined || rec.owner === '' ? null : lower(rec.owner),
    };
  }).sort((a, b) => (a.at < b.at ? -1 : 1));
}

/**
 * All evidence tabs of one copy read.
 * @returns {{runs: object[]|null, judged: {slot: boolean, daily: boolean}, patrol: object[]|null, report: object[]}}
 *   judged[kind] = true only when that tab is present and passed the contract check (and its meta row, if any, is ok)
 */
export function evaluateEvidence(tables, { store, schedules, timezone, readAt, metaStatus = {} }) {
  const v = Object.fromEntries(Object.keys(EVIDENCE_TAB).map((k) => [k, validateEvidenceTab(k, tables?.[EVIDENCE_TAB[k]], timezone)]));
  const usable = (k) => v[k].present && v[k].ok && (metaStatus[k] == null || metaStatus[k] === 'ok');
  const slot = usable('slot') ? judgeSlots(v.slot.records, { store, timezone, readAt }) : null;
  const daily = usable('daily') ? judgeDaily(v.daily.records, { store, schedules, timezone, readAt }) : null;
  return {
    runs: slot || daily ? [...(slot?.rows ?? []), ...(daily?.rows ?? [])] : null,
    judged: { slot: !!slot, daily: !!daily },
    patrol: usable('patrol') ? patrolRows(v.patrol.records, { timezone }) : null,
    report: Object.values(v).map((t) => ({
      tab: t.tab, state: !t.present ? 'absent' : !t.ok ? 'blocked' : metaStatus[t.key] != null && metaStatus[t.key] !== 'ok' ? 'stale' : 'ok',
      rows: t.present ? t.rows : null, findingCount: t.findingCount, findings: t.findings.slice(0, 10),
      counts: t.key === 'slot' ? slot?.counts ?? null : t.key === 'daily' ? daily?.counts ?? null : null,
    })),
  };
}

