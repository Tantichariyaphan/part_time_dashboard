// Live data source of the dashboard's LIVE entry: the client's View-only Copy + Machine Heartbeat Sheet, read-only.
//
// Production rule (deployed dashboard, e.g. api/server.js on Vercel, or NIKUSHO_DEPLOYMENT=production):
//   - the live entry is ALWAYS the copy adapter. Mock (devmock), demo and "none" are never served as the live entry.
//   - if the configuration, the reader key or the files are unavailable, the live entry shows a connection/error state
//     (stores "未接続", red "update stopped" banner, the reason code on the strip and on ⑥) - never mock records.
//   - the demo entry (/demo/) is a separate, explicitly opened entry backed by the anonymized snapshot (REQ §7-12).
// Credentials stay on the server: the key is read from NIKUSHO_READER_KEY_JSON / _FILE by server/source/config.js and used
// only by server/source/serviceAccountToken.js (scope spreadsheets.readonly). Nothing here logs a value.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCopyAdapter, notConnectedReader, SOURCE_STATE } from '../src/adapters/copy/copyAdapter.js';
import { COPY_SOURCE_LIMITS, COPY_TAB, FORBIDDEN_FIELDS, HEARTBEAT_TAB } from '../src/contract/copyContract.js';
import { COLUMNS } from '../src/contract/columns.js';
import { loadSourceConfig, SourceConfigError } from './source/config.js';
import { createSheetsReader } from './source/sheetsReader.js';
import { createServiceAccountTokenSource } from './source/serviceAccountToken.js';

/** The stores / schedules configuration shipped with the code (config/stores.json), as an absolute path. */
export const BUNDLED_STORES_FILE = fileURLToPath(new URL('../config/stores.json', import.meta.url));

/**
 * Per-request time limit for the Google token and Sheets requests of a deployed dashboard. One read = token + 3 GETs per file
 * (the two files in parallel), so the worst case stays under 4 x 10 s = 40 s, inside the function limit in vercel.json
 * (maxDuration 60): a stalled Google API ends as an ERROR state with a code, not as a platform time-out.
 */
export const PRODUCTION_READ_TIMEOUT_MS = 10_000;

/** True for a deployed dashboard: on Vercel (VERCEL=1) or when NIKUSHO_DEPLOYMENT=production. */
export const isProduction = (env = process.env) => String(env.VERCEL ?? '').trim() === '1' || String(env.NIKUSHO_DEPLOYMENT ?? '').trim() === 'production';

/**
 * The two read-only readers of the client's files, built from server configuration only. Shared by the live adapter and the
 * read-only diagnostics in scripts/ (so a diagnostic reads exactly what the dashboard reads, with the same checks).
 */
export function createLiveReaders(env = process.env, { getAccessToken: injected, timeoutMs } = {}) {
  const cfg = loadSourceConfig(env);
  const t = timeoutMs ? { timeoutMs } : {};
  const getAccessToken = injected ?? (cfg.readerKey ? createServiceAccountTokenSource(cfg.readerKey, t) : undefined);
  return {
    cfg,
    // Two separate readers, one per client file; the same reader account; ids only from server configuration.
    copyReader: createSheetsReader({
      spreadsheetId: cfg.copySpreadsheetId, tabs: Object.values(COPY_TAB), requiredTabs: [COPY_TAB.meta], exactTabs: true,
      refuseHeaders: FORBIDDEN_FIELDS, getAccessToken, ...t,
    }),
    heartbeatReader: createSheetsReader({
      spreadsheetId: cfg.heartbeatSpreadsheetId, tabs: Object.values(HEARTBEAT_TAB), refuseHeaders: FORBIDDEN_FIELDS, getAccessToken, ...t,
    }),
  };
}

/**
 * Live entry when the copy cannot even be configured: no stores rows unless the stores configuration itself is readable,
 * no data tabs (=> red "update stopped" banner), every store "未接続", the reason as a short code. Kind stays `copy`
 * so the UI and the gate treat it as the real-data entry; it carries nothing fabricated.
 */
export function createSourceUnavailableAdapter({ reason, stores = [], schedules = [], now = Date.now }) {
  return {
    kind: 'copy',
    unavailable: reason,
    async load() {
      return {
        kind: 'copy',
        now: now(),
        raw: { stores: { columns: COLUMNS.stores, rows: stores }, schedules: { columns: COLUMNS.schedules, rows: schedules } },
        storeConnection: Object.fromEntries(stores.map((s) => [s.store, 'not_connected'])),
        limits: { ...COPY_SOURCE_LIMITS },
        sources: { copy: { state: SOURCE_STATE.NOT_CONNECTED, reason }, heartbeat: { state: SOURCE_STATE.NOT_CONNECTED, reason } },
      };
    },
  };
}

const CODE = /^[a-z0-9_]{1,40}$/;

/**
 * The live adapter for a deployed dashboard. Never throws for a missing or wrong source configuration and never returns
 * mock data: problems become a connection/error state with a code. `log` receives messages that name variables, never values.
 * @param {object} env
 * @param {{getAccessToken?: Function, readers?: {cfg: object, copyReader: object, heartbeatReader: object}, log?: Function, now?: Function}} [deps]
 */
export function createProductionLiveAdapter(env = process.env, { getAccessToken, readers, log = console.error, now, timeoutMs = PRODUCTION_READ_TIMEOUT_MS } = {}) {
  const e = { ...env };
  if (!e.NIKUSHO_STORES_JSON && !e.NIKUSHO_STORES_FILE) e.NIKUSHO_STORES_FILE = BUNDLED_STORES_FILE; // the shipped Bangkok configuration
  const requested = String(e.NIKUSHO_LIVE_ADAPTER ?? 'copy').trim();
  let built;
  try {
    built = readers ?? createLiveReaders(e, { getAccessToken, timeoutMs });
  } catch (err) {
    if (!(err instanceof SourceConfigError)) throw err;
    log(`[source] live entry NOT CONNECTED - source configuration: ${err.message}`);
    // Still list the configured stores (all 未接続) when the stores configuration itself is readable.
    let storesCfg = {};
    const bare = { ...e, NIKUSHO_COPY_SPREADSHEET_ID: '', NIKUSHO_HEARTBEAT_SPREADSHEET_ID: '', NIKUSHO_READER_KEY_JSON: '', NIKUSHO_READER_KEY_FILE: '', NIKUSHO_COPY_TIMEZONE: '' };
    try {
      if (!bare.NIKUSHO_COPY_STORE) bare.NIKUSHO_COPY_STORE = JSON.parse(bare.NIKUSHO_STORES_JSON ?? readFileSync(bare.NIKUSHO_STORES_FILE, 'utf8')).stores?.[0]?.store ?? '';
      storesCfg = loadSourceConfig(bare).adapter;
    } catch { /* stores unreadable too: no store rows */ }
    return createSourceUnavailableAdapter({ reason: 'source_config_invalid', stores: storesCfg.stores ?? [], schedules: storesCfg.schedules ?? [], ...(now ? { now } : {}) });
  }
  const { cfg } = built;
  if (requested !== 'copy') {
    // An explicit devmock / none / demo setting is refused in production: the live entry never shows non-live data.
    log('[source] live entry NOT CONNECTED - NIKUSHO_LIVE_ADAPTER must be "copy" (or unset) in production; mock/demo data are never served as live');
    return createSourceUnavailableAdapter({ reason: 'live_adapter_not_copy', stores: cfg.adapter.stores, schedules: cfg.adapter.schedules, ...(now ? { now } : {}) });
  }
  // Name the missing piece precisely: no key variable at all, or a key FILE path that does not exist (on Vercel a file path
  // never exists - use NIKUSHO_READER_KEY_JSON there). Codes only.
  const keyCode = { not_configured: 'reader_key_not_configured', file_not_found: 'reader_key_file_not_found' }[cfg.readerKeyStatus];
  const reason = (r) => {
    const code = CODE.test(String(r?.reason ?? '')) ? r.reason : 'not_configured';
    return code === 'reader_account_pending' && keyCode ? keyCode : code;
  };
  const keep = (r) => (r?.connected ? r : notConnectedReader(reason(r))); // a reader that cannot read reports its code only
  const adapter = createCopyAdapter({ config: cfg.adapter, copyReader: keep(built.copyReader), heartbeatReader: keep(built.heartbeatReader), ...(now ? { now } : {}), log });
  // For the start-up log only: is each file configured (codes, never ids or key material)?
  adapter.readers = { copy: built.copyReader?.connected ? 'configured' : reason(built.copyReader), heartbeat: built.heartbeatReader?.connected ? 'configured' : reason(built.heartbeatReader) };
  return adapter;
}
