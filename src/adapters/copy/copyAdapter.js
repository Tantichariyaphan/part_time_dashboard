// Live adapter for the client's View-only Copy (Data Contract v1) + the client's Machine Heartbeat Spreadsheet.
//
//   View-only Copy  --reader--> validateCopy --> transformCopy --+
//                                                                +--> AdapterResult (same shape as mock/demo) --> existing pipeline
//   Heartbeat Sheet --reader--> validateHeartbeat ---------------+     (beats/alerts are passed as-is; separate source and state)
//
// The two readers are separate objects with separate state: the heartbeat is never merged into the copy.
// A reader is { connected: boolean, reason?: string, read(): Promise<{titles, tables}> }. Google-specific reading lives on
// the server (server/source/); this module never knows spreadsheet ids, credentials or hosts.
// Until the reader account exists (Q-48) the server wires a not-connected reader: nothing is read and nothing is fabricated.
import { COPY_SOURCE_LIMITS, COPY_DATA_TAB_KEYS, COPY_TAB, COPY_TO_SCREEN, HEARTBEAT_TAB } from '../../contract/copyContract.js';
import { COLUMNS } from '../../contract/columns.js';
import { CONTRACT_VERSION, TAB_NAME } from '../../contract/enums.js';
import { formatIso } from '../../domain/time.js';
import { validateCopy, validateHeartbeat } from './validate.js';
import { transformCopy } from './transform.js';

export const SOURCE_STATE = Object.freeze({
  NOT_CONNECTED: 'NOT_CONNECTED', // no reader access (reader account pending, Q-48) or not configured
  CONNECTED: 'CONNECTED', // read and every tab passed the contract check
  PARTIAL: 'PARTIAL', // read; some tabs blocked by the contract check
  BLOCKED: 'BLOCKED', // read; the copy as a whole failed the contract check (all tabs blocked)
  ERROR: 'ERROR', // the read itself failed (no data shown)
});

/** A reader that reads nothing. `reason` is a short code shown on ⑥ (a code only: never a credential or an id). */
export function notConnectedReader(reason) {
  return Object.freeze({ connected: false, reason, async read() { throw Object.assign(new Error('not connected'), { code: reason }); } });
}

const CODE = /^[a-z0-9_]{1,40}$/;
const errorCode = (err) => (CODE.test(String(err?.code ?? '')) ? err.code : 'read_failed');

function storeById(config) {
  const store = config.stores.find((s) => s.store === config.store);
  if (!store) throw new Error('copy adapter: the configured copy store is not in the stores configuration');
  return store;
}

/**
 * @param {{config: {store: string, timezone: string|null, stores: object[], schedules: object[]},
 *          copyReader: object, heartbeatReader: object, now?: () => number, minReadIntervalMs?: number, log?: Function}} opts
 *   minReadIntervalMs: the copy changes every 5 minutes; reading at most once a minute keeps "new row -> screen" within 10 minutes.
 */
export function createCopyAdapter({ config, copyReader, heartbeatReader, now = Date.now, minReadIntervalMs = 60_000, log = console.error }) {
  const store = storeById(config);
  const cache = {};
  const inflight = {};

  function readOnce(reader, slot) {
    if (!reader?.connected) return Promise.resolve({ state: SOURCE_STATE.NOT_CONNECTED, reason: reader?.reason ?? 'not_configured' });
    const t = now();
    if (cache[slot] && t - cache[slot].at < minReadIntervalMs) return Promise.resolve(cache[slot].result);
    if (!inflight[slot]) {
      inflight[slot] = reader.read()
        .then((data) => ({ ok: true, data, readAt: t }), (err) => {
          const reason = errorCode(err);
          try { log(`[source] ${slot} read failed: ${reason}`); } catch { /* logging must never wedge the reader */ } // code only: never the message (it may hold a URL or id)
          return { ok: false, reason, at: t };
        })
        .then((result) => { cache[slot] = { at: t, result }; inflight[slot] = null; return result; });
    }
    return inflight[slot];
  }

  // Validation + Transform run once per read, not once per API request: every page between two reads reuses the result.
  const parts = new WeakMap();
  const memo = (result, build) => {
    if (!parts.has(result)) parts.set(result, build(result));
    return parts.get(result);
  };

  function copyPart(c) {
    if (c.state === SOURCE_STATE.NOT_CONNECTED) return { raw: {}, connected: false, source: { state: c.state, reason: c.reason } };
    if (!c.ok) {
      const meta = COPY_DATA_TAB_KEYS.map((k) => ({
        tab: TAB_NAME[COPY_TO_SCREEN[k]], generated_at: formatIso(c.at), last_success_at: null, source_through: null, status: 'error',
        detail: `View-only Copy could not be read (${c.reason})`, contract_version: CONTRACT_VERSION,
      }));
      const empty = (key) => ({ columns: COLUMNS[key], rows: [] });
      return {
        raw: { meta: { columns: COLUMNS.meta, rows: meta }, runs: empty('runs'), questions: empty('questions'), sends: empty('sends'), messages: empty('messages') },
        connected: true,
        source: { state: SOURCE_STATE.ERROR, reason: c.reason },
      };
    }
    const v = validateCopy(c.data, { timezone: config.timezone });
    const { raw, report } = transformCopy(v, { store, timezone: config.timezone, nowMs: c.readAt });
    const blocked = report.tabs.some((x) => x.state === 'blocked');
    const state = !v.ok ? SOURCE_STATE.BLOCKED : blocked ? SOURCE_STATE.PARTIAL : SOURCE_STATE.CONNECTED;
    return {
      raw,
      connected: true,
      source: {
        state, reason: null, readAt: formatIso(c.readAt),
        copyFindingCount: v.copyFindingCount, copyFindings: v.copyFindings.slice(0, 10),
        metaTab: { tab: COPY_TAB.meta, state: v.meta.ok ? 'ok' : 'blocked', findingCount: v.meta.findingCount, findings: v.meta.findings.slice(0, 10) },
        ...report,
      },
    };
  }

  function heartbeatPart(h) {
    if (h.state === SOURCE_STATE.NOT_CONNECTED) return { raw: {}, source: { state: h.state, reason: h.reason } };
    if (!h.ok) return { raw: {}, source: { state: SOURCE_STATE.ERROR, reason: h.reason } };
    const v = validateHeartbeat(h.data);
    const raw = {};
    for (const key of Object.keys(HEARTBEAT_TAB)) if (v.tabs[key].ok) raw[key] = { columns: COLUMNS[key], rows: v.tabs[key].records };
    const okCount = Object.keys(raw).length;
    return {
      raw,
      source: {
        state: okCount === Object.keys(HEARTBEAT_TAB).length ? SOURCE_STATE.CONNECTED : okCount ? SOURCE_STATE.PARTIAL : SOURCE_STATE.BLOCKED,
        reason: null, readAt: formatIso(h.readAt),
        tabs: Object.values(v.tabs).map((x) => ({ tab: x.tab, state: x.ok ? 'ok' : 'blocked', rows: x.ok ? x.records.length : null, findingCount: x.findingCount, findings: x.findings.slice(0, 10) })),
      },
    };
  }

  return {
    kind: 'copy',
    async load() {
      const nowMs = now();
      const [c, h] = await Promise.all([readOnce(copyReader, 'copy'), readOnce(heartbeatReader, 'heartbeat')]);
      const copy = memo(c, copyPart);
      const hb = memo(h, heartbeatPart);
      const storeConnection = Object.fromEntries(config.stores.map((s) => [s.store, 'not_connected']));
      if (copy.connected) storeConnection[store.store] = 'connected'; // other configured stores have no copy (Nagoya: M-6)
      return {
        kind: 'copy',
        now: nowMs,
        raw: {
          stores: { columns: COLUMNS.stores, rows: config.stores },
          schedules: { columns: COLUMNS.schedules, rows: config.schedules },
          ...copy.raw,
          ...hb.raw, // absent beats/alerts = NOT CONNECTED on ① and ⑥ (existing behaviour)
        },
        storeConnection,
        limits: { ...COPY_SOURCE_LIMITS },
        sources: { copy: copy.source, heartbeat: hb.source },
      };
    },
  };
}
