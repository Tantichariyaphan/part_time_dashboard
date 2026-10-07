// Normalization: raw adapter tabs -> Screen Data rows with documented columns only.
// Rule (REQ §6): blank != 0. Blank cells become null; numeric 0 stays 0.
import { COLUMNS, NUMERIC_COLUMNS, BOOLEAN_COLUMNS, OPTIONAL_COLUMNS } from '../contract/columns.js';
import { OPTIONAL_SHEET_KEYS } from '../contract/enums.js';

const isBlank = (v) => v === undefined || v === null || v === '';

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return v; // left as-is; validation reports it
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return v;
}

function normalizeRow(key, raw) {
  const out = {};
  const num = NUMERIC_COLUMNS[key] ?? [];
  const bool = BOOLEAN_COLUMNS[key] ?? [];
  for (const col of [...COLUMNS[key], ...(OPTIONAL_COLUMNS[key] ?? [])]) {
    let v = raw[col];
    if (isBlank(v)) { out[col] = null; continue; }
    if (num.includes(col)) v = toNumber(v);
    else if (bool.includes(col)) v = toBool(v);
    out[col] = v; // text kept verbatim (REQ §6: no summarising, translating or re-formatting)
  }
  return out;
}

/**
 * @param {Record<string, {columns:string[], rows:object[]}|null>} rawTabs keyed by internal tab key
 * @returns {{screen: Record<string, object[]|null>, issues: Record<string, {absent:boolean, missingColumns:string[], extraColumns:string[]}>}}
 */
export function normalizeTabs(rawTabs) {
  const screen = {};
  const issues = {};
  for (const key of Object.keys(COLUMNS)) {
    const tab = rawTabs?.[key];
    if (tab == null) {
      screen[key] = OPTIONAL_SHEET_KEYS.includes(key) ? null : [];
      issues[key] = { absent: true, missingColumns: [], extraColumns: [] };
      continue;
    }
    const have = new Set(tab.columns ?? []);
    issues[key] = {
      absent: false,
      missingColumns: COLUMNS[key].filter((c) => !have.has(c)),
      extraColumns: (tab.columns ?? []).filter((c) => !COLUMNS[key].includes(c) && !(OPTIONAL_COLUMNS[key] ?? []).includes(c)),
    };
    screen[key] = (tab.rows ?? []).map((r) => normalizeRow(key, r));
  }
  return { screen, issues };
}
