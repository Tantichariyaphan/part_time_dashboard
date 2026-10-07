// Reader for the client's two Google Spreadsheets (View-only Copy, Machine Heartbeat Spreadsheet). SERVER ONLY.
//
//  - GET only, to the fixed Google Sheets API host below; nothing is ever written, and no registry text is ever sent:
//    a request carries only the spreadsheet id (from server configuration) and tab names (from the contract).
//  - Spreadsheet ids come from server-side configuration only. The browser cannot choose a file: no request parameter
//    reaches this module.
//  - The access token belongs to the dedicated READER account (view access to exactly the two files; client 10/7).
//    It is never the dashboard login, never Maru's account, never logged. How the reader account obtains a token
//    (service account, other identity) depends on the client's environment and is NOT decided (Q-48, Q-01): the caller
//    passes `getAccessToken`, and without it this reader is NOT_CONNECTED.
//  - Reads cell text as displayed (FORMATTED_VALUE) so text cells - e.g. long messageIds kept as text - are not rounded.
//  - Defence in depth (the client's file permissions are the primary guard): with `exactTabs` a file whose tab list is
//    not the contract's is refused before any cell is read; header rows are read first and the rows of a tab whose
//    header names a refused field (userId, 宛先ID, 画像URL) are never downloaded - the contract check then blocks it.
//  - This module imports no data, domain or view-model code.
//  - It cannot reach the Original Records: it only knows the ids it is configured with, and the client grants the
//    reader account access to the two files only.
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets/';
const SPREADSHEET_ID = /^[A-Za-z0-9_-]{20,128}$/;

export class ReaderError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export const isSpreadsheetId = (v) => typeof v === 'string' && SPREADSHEET_ID.test(v);

/**
 * @param {{spreadsheetId: string|null, tabs: string[], requiredTabs?: string[], exactTabs?: boolean, refuseHeaders?: string[],
 *          getAccessToken?: () => Promise<string>, fetchImpl?: Function, timeoutMs?: number}} opts
 * @returns {{connected: boolean, reason?: string, read?: () => Promise<{titles: string[], tables: object}>}}
 */
export function createSheetsReader({
  spreadsheetId, tabs, requiredTabs = [], exactTabs = false, refuseHeaders = [], getAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 20_000,
}) {
  if (!spreadsheetId) return Object.freeze({ connected: false, reason: 'not_configured' });
  if (!isSpreadsheetId(spreadsheetId)) throw new Error('sheets reader: malformed spreadsheet id'); // value never echoed
  if (typeof getAccessToken !== 'function') return Object.freeze({ connected: false, reason: 'reader_account_pending' }); // Q-48
  const base = SHEETS_API + encodeURIComponent(spreadsheetId);

  async function getJson(url, token) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ReaderError('network');
    }
    if (!res.ok) throw new ReaderError(`http_${Number(res.status) || 0}`);
    try { return await res.json(); } catch { throw new ReaderError('bad_response'); }
  }

  const rangesOf = (list, suffix) => list.map((t) => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'${suffix}`)}`).join('&');
  const valuesOf = (data, n) => {
    if (!Array.isArray(data?.valueRanges) || data.valueRanges.length !== n) throw new ReaderError('bad_response');
    return data.valueRanges.map((r) => (Array.isArray(r?.values) ? r.values : []));
  };

  return Object.freeze({
    connected: true,
    async read() {
      let token;
      let timer;
      try {
        token = await Promise.race([getAccessToken(), new Promise((_, no) => { timer = setTimeout(no, timeoutMs); })]);
      } catch { throw new ReaderError('token_unavailable'); } finally { clearTimeout(timer); }
      if (typeof token !== 'string' || token === '') throw new ReaderError('token_unavailable');

      const info = await getJson(`${base}?fields=${encodeURIComponent('sheets.properties.title')}`, token);
      if (!Array.isArray(info?.sheets)) throw new ReaderError('bad_response');
      const titles = info.sheets.map((s) => String(s?.properties?.title ?? ''));
      if (exactTabs && titles.some((t) => !tabs.includes(t))) throw new ReaderError('unexpected_tabs');
      if (requiredTabs.some((t) => !titles.includes(t))) throw new ReaderError('required_tab_missing');
      const present = tabs.filter((t) => titles.includes(t)); // a missing tab is reported by the contract check, not requested
      const tables = {};
      if (!present.length) return { titles, tables };

      // 1) header rows only
      const heads = valuesOf(await getJson(`${base}/values:batchGet?${rangesOf(present, '!1:1')}&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`, token), present.length)
        .map((v) => v[0] ?? []);
      const clean = present.filter((t, i) => !heads[i].some((h) => refuseHeaders.some((f) => String(h).includes(f))));
      present.forEach((t, i) => { tables[t] = { header: heads[i], rows: [] }; }); // a refused tab keeps its header only
      // 2) full rows of the tabs whose header is clean
      if (clean.length) {
        const full = valuesOf(await getJson(`${base}/values:batchGet?${rangesOf(clean, '')}&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`, token), clean.length);
        clean.forEach((t, i) => { tables[t] = { header: full[i][0] ?? [], rows: full[i].slice(1) }; });
      }
      return { titles, tables };
    },
  });
}
