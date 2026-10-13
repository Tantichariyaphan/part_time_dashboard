// Access tokens for the dedicated READER account when it is a Google service account (client 10/7: "e.g. a service
// account"). SERVER ONLY. Used by sheetsReader.js; nothing else.
//
//  - Scope is read-only Sheets: https://www.googleapis.com/auth/spreadsheets.readonly. The account can read only what
//    the client shares with it (the View-only Copy and the Heartbeat Sheet).
//  - The key is passed in by the server configuration (NIKUSHO_READER_KEY_FILE / NIKUSHO_READER_KEY_JSON). It is never
//    logged, never echoed in errors, never sent to the browser, and never committed (.gitignore).
//  - One outbound call: POST of a signed assertion to Google's fixed token endpoint. No registry data is ever sent;
//    this module imports no data, domain or view-model code.
//  - The reader account is not the dashboard login: nothing here touches sessions or the allowlist.
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const LIFETIME_S = 3600;
const RENEW_BEFORE_MS = 5 * 60_000;

export class TokenError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/** Checks the shape of a service-account key without revealing any of it. Returns { clientEmail, privateKey }. */
export function parseServiceAccountKey(json) {
  let k;
  try { k = typeof json === 'string' ? JSON.parse(json) : json; } catch { throw new TokenError('key_not_json'); }
  if (!k || k.type !== 'service_account') throw new TokenError('key_not_service_account');
  if (typeof k.client_email !== 'string' || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(k.client_email)) throw new TokenError('key_bad_client_email');
  if (typeof k.private_key !== 'string' || !k.private_key.includes('PRIVATE KEY')) throw new TokenError('key_bad_private_key');
  return { clientEmail: k.client_email, privateKey: k.private_key };
}

/**
 * @param {{clientEmail: string, privateKey: string}} key
 * @param {{fetchImpl?: Function, now?: () => number, timeoutMs?: number}} opts
 * @returns {() => Promise<string>} getAccessToken for sheetsReader.js (cached until shortly before expiry)
 */
export function createServiceAccountTokenSource({ clientEmail, privateKey }, { fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 20_000 } = {}) {
  let cached = null;
  let inflight = null;

  async function fetchToken() {
    const iat = Math.floor(now() / 1000);
    const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + LIFETIME_S })}`;
    let signature;
    try { signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url'); } catch { throw new TokenError('key_cannot_sign'); }
    let res;
    try {
      res = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }).toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch { throw new TokenError('token_network'); }
    if (!res.ok) throw new TokenError(`token_http_${Number(res.status) || 0}`);
    let data;
    try { data = await res.json(); } catch { throw new TokenError('token_bad_response'); }
    if (typeof data?.access_token !== 'string' || !data.access_token) throw new TokenError('token_bad_response');
    const ttl = Number(data.expires_in);
    cached = { token: data.access_token, until: now() + (Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : LIFETIME_S * 1000) - RENEW_BEFORE_MS };
    return cached.token;
  }

  return async function getAccessToken() {
    if (cached && now() < cached.until) return cached.token;
    inflight ??= fetchToken().finally(() => { inflight = null; });
    return inflight;
  };
}
