// Shared helpers for the read-only diagnostics in scripts/ (analyze-heartbeat, reconcile, timing-probe).
// They never write to any spreadsheet, never print cell values of free-text columns, staff names, message ids,
// recipient labels/keys, spreadsheet ids or key material. Everything printed is a count, a time, a row number
// (元の行番号), a column name, a fixed code, or a digit-masked shape.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createLiveReaders } from '../../server/index.js';
import { loadSourceConfig, SourceConfigError } from '../../server/source/config.js';

/** `--name value` / `--flag` arguments. */
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const k = a.slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) { out[k] = argv[i + 1]; i += 1; } else out[k] = true;
  }
  return out;
}

/** RFC 4180 CSV (quoted fields, embedded commas/newlines, BOM) -> { header, rows } (same shape as the Sheets reader). */
export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) rows.push(row); }
  const [header = [], ...body] = rows;
  return { header: header.map((h) => h.trim()), rows: body };
}

export const readCsvFile = (path) => parseCsv(readFileSync(path, 'utf8'));

/** Table rows as objects keyed by header. */
export const records = (table) => (table ? table.rows.map((r) => Object.fromEntries(table.header.map((h, i) => [String(h).trim(), r[i] ?? '']))) : []);

/** Configuration (stores, schedules, copy zone) exactly as the server loads it; env overrides for local CSV analysis. */
export function config(overrides = {}) {
  return loadSourceConfig({ ...process.env, ...overrides });
}

/** One read of the client's View-only Copy (and optionally the Heartbeat Sheet) with the dashboard's own readers. */
export async function readLive({ heartbeat = false } = {}) {
  const { cfg, copyReader, heartbeatReader } = createLiveReaders(process.env);
  if (!copyReader.connected) throw Object.assign(new Error(`View-only Copy not connected (${copyReader.reason})`), { code: copyReader.reason });
  const startedAt = Date.now();
  const copy = await copyReader.read();
  const copyReadAt = Date.now();
  let hb = null;
  let hbReadAt = null;
  if (heartbeat && heartbeatReader.connected) { hb = await heartbeatReader.read(); hbReadAt = Date.now(); }
  return { cfg, copy, heartbeat: hb, startedAt, copyReadAt, heartbeatReadAt: hbReadAt, readers: { copyReader, heartbeatReader } };
}

/** Fixed-width text table. Cells must already be safe (counts, codes, times). */
export function table(header, rows) {
  const all = [header, ...rows].map((r) => r.map((c) => (c == null ? '' : String(c))));
  const w = header.map((_, i) => Math.max(...all.map((r) => [...r[i]].length)));
  const line = (r) => r.map((c, i) => c + ' '.repeat(w[i] - [...c].length)).join('  ').trimEnd();
  return [line(all[0]), w.map((n) => '-'.repeat(n)).join('  '), ...all.slice(1).map(line)].join('\n');
}

export function count(map, key, n = 1) { map.set(key, (map.get(key) ?? 0) + n); return map; }
export const sortedEntries = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

/** Writes counts-only JSON evidence when `--json <file>` is given. */
export function writeJson(path, obj) {
  if (!path || path === true) return;
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
  console.log(`\n(counts written to ${path})`);
}

/** Error code only (never a message: it may hold a URL or an id). */
export const codeOf = (e) => (/^[a-z0-9_]{1,40}$/.test(String(e?.code ?? '')) ? e.code : 'error');

/** A short, safe failure line: configuration messages are ours (no values); anything else is reduced to its code. */
export const failure = (e) => (e instanceof SourceConfigError ? `configuration: ${e.message}` : codeOf(e));

/** True when the module is the script being run (not imported by a test). */
export const isMain = (metaUrl) => !!process.argv[1] && metaUrl === pathToFileURL(process.argv[1]).href;
