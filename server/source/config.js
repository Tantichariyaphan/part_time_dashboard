// Source configuration for the live entry when NIKUSHO_LIVE_ADAPTER=copy. Server-side only: nothing here is sent to the
// browser, and values are never logged (errors name the variable, never its value).
//
//   NIKUSHO_COPY_SPREADSHEET_ID        id of the client's View-only Copy            (absent -> copy NOT_CONNECTED)
//   NIKUSHO_HEARTBEAT_SPREADSHEET_ID   id of the client's Machine Heartbeat Sheet   (absent -> heartbeat NOT_CONNECTED)
//   NIKUSHO_COPY_STORE                 `stores.store` the copy belongs to (one copy = one store; Nagoya has no copy, M-6)
//   NIKUSHO_COPY_TIMEZONE              optional IANA zone in which zone-less copy timestamps are written (Q-12).
//                                      Without it only ISO timestamps with an explicit offset are accepted.
//   NIKUSHO_STORES_JSON                {"stores":[...], "schedules":[...]} with the REQ §5-3 columns
//   NIKUSHO_STORES_FILE                or: path of that JSON file. When both are set, NIKUSHO_STORES_JSON is used.
//
// No spreadsheet id, store, e-mail or credential is built in. Reader credentials: none are configured here - the reader
// account does not exist yet and how it authenticates depends on the client's environment (Q-48, Q-01). Until then the
// readers are NOT_CONNECTED and no live data exists.
import { readFileSync } from 'node:fs';
import { COLUMNS } from '../../src/contract/columns.js';
import { normalizeTabs } from '../../src/normalize/normalize.js';
import { validateScreen } from '../../src/normalize/validate.js';
import { isSpreadsheetId } from './sheetsReader.js';

export class SourceConfigError extends Error {}

const validZone = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };

function readStoresJson(env) {
  let text;
  if (env.NIKUSHO_STORES_JSON) text = env.NIKUSHO_STORES_JSON;
  else if (env.NIKUSHO_STORES_FILE) {
    try { text = readFileSync(env.NIKUSHO_STORES_FILE, 'utf8'); } catch { throw new SourceConfigError('NIKUSHO_STORES_FILE cannot be read'); }
  } else throw new SourceConfigError('NIKUSHO_LIVE_ADAPTER=copy needs NIKUSHO_STORES_JSON (or NIKUSHO_STORES_FILE)');
  try { return JSON.parse(text); } catch { throw new SourceConfigError('stores configuration is not valid JSON'); }
}

/** Stores/schedules are checked with the existing Screen Data normalization and validation (same rules as every adapter). */
function checkStores(json) {
  if (!json || !Array.isArray(json.stores) || !Array.isArray(json.schedules)) throw new SourceConfigError('stores configuration needs "stores" and "schedules" arrays');
  const raw = {
    stores: { columns: COLUMNS.stores.filter((c) => json.stores.every((s) => s && Object.hasOwn(s, c))), rows: json.stores },
    schedules: { columns: COLUMNS.schedules.filter((c) => json.schedules.every((s) => s && Object.hasOwn(s, c))), rows: json.schedules },
  };
  const { screen, issues } = normalizeTabs(raw);
  for (const key of ['stores', 'schedules']) {
    if (issues[key].missingColumns.length) throw new SourceConfigError(`stores configuration: ${key} rows need columns ${issues[key].missingColumns.join(', ')}`);
  }
  const bad = validateScreen({ stores: screen.stores, schedules: screen.schedules }).invalid;
  if (bad.length) throw new SourceConfigError(`stores configuration: invalid ${[...new Set(bad.map((b) => `${b.tab}.${b.field}`))].join(', ')}`);
  const ids = screen.stores.map((s) => s.store);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new SourceConfigError('stores configuration: every store needs a unique `store` id');
  for (const s of screen.stores) if (!validZone(s.timezone)) throw new SourceConfigError('stores configuration: a store has an invalid timezone');
  return { stores: screen.stores, schedules: screen.schedules };
}

export function loadSourceConfig(rawEnv = process.env) {
  const env = Object.fromEntries(Object.entries(rawEnv).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
  const copyId = env.NIKUSHO_COPY_SPREADSHEET_ID || null;
  const heartbeatId = env.NIKUSHO_HEARTBEAT_SPREADSHEET_ID || null;
  if (copyId && !isSpreadsheetId(copyId)) throw new SourceConfigError('NIKUSHO_COPY_SPREADSHEET_ID is not a spreadsheet id');
  if (heartbeatId && !isSpreadsheetId(heartbeatId)) throw new SourceConfigError('NIKUSHO_HEARTBEAT_SPREADSHEET_ID is not a spreadsheet id');
  if (copyId && heartbeatId && copyId === heartbeatId) throw new SourceConfigError('the View-only Copy and the Heartbeat Sheet must be two different files');
  const timezone = env.NIKUSHO_COPY_TIMEZONE || null;
  if (timezone && !validZone(timezone)) throw new SourceConfigError('NIKUSHO_COPY_TIMEZONE is not a valid IANA time zone');
  const { stores, schedules } = checkStores(readStoresJson(env));
  const store = env.NIKUSHO_COPY_STORE || '';
  if (!store) throw new SourceConfigError('NIKUSHO_LIVE_ADAPTER=copy needs NIKUSHO_COPY_STORE');
  if (!stores.some((s) => s.store === store)) throw new SourceConfigError('NIKUSHO_COPY_STORE is not one of the configured stores');
  return {
    copySpreadsheetId: copyId,
    heartbeatSpreadsheetId: heartbeatId,
    adapter: { store, timezone, stores, schedules },
  };
}
