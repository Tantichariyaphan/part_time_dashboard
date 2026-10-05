// Public authentication entry points (NIKUSHO_AUTH=google). All are GET (the service stays GET/HEAD-only); none of
// them returns dashboard data. HEAD is refused on these three so a HEAD can never start, finish or end a session.
//
//   GET /auth/login?return=/|/demo/   -> 302 to Google (state + nonce + PKCE S256), sets a short-lived login-flow cookie
//   GET /auth/callback?code&state     -> state checked against the flow cookie, code exchanged server-to-Google,
//                                        ID token verified, NEW server session, HttpOnly cookie, 302 to the entry
//   GET /auth/logout?return=/|/demo/  -> server session destroyed, cookie cleared, 302 to the entry
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { FLOW_TTL_MS, parseCookies, serializeCookie } from './session.js';

/** Only the two entries are valid return targets (no open redirect). */
export const RETURN_PATHS = Object.freeze(['/', '/demo/']);
const safeReturn = (v) => (RETURN_PATHS.includes(v) ? v : '/');
const rnd = () => randomBytes(32).toString('base64url');
const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function createAuthRoutes({ provider, sessions, cookies, config, headers, log = (m) => console.error(m) }) {
  const sessionMaxAgeS = Math.floor(config.session.maxMs / 1000);
  const setCookie = (name, value, sameSite, maxAgeS) => serializeCookie(name, value, { secure: config.secureCookies, sameSite, maxAgeS });
  const clear = (name, sameSite) => setCookie(name, '', sameSite, 0);
  const redirect = (res, location, setCookies = []) => {
    res.writeHead(302, { ...headers, Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': setCookies });
    res.end();
  };
  const hostOk = (req) => String(req.headers.host ?? '').toLowerCase() === config.publicHost.toLowerCase();

  async function login(req, res, url) {
    const state = rnd(); const nonce = rnd(); const codeVerifier = rnd();
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const flowId = sessions.startFlow({ state, nonce, codeVerifier, returnTo: safeReturn(url.searchParams.get('return')) });
    redirect(res, provider.authorizationUrl({ state, nonce, codeChallenge, redirectUri: config.redirectUri }),
      [setCookie(cookies.flow, flowId, 'Lax', Math.floor(FLOW_TTL_MS / 1000))]);
  }

  async function callback(req, res, url) {
    const jar = parseCookies(req.headers.cookie);
    const flow = sessions.takeFlow(jar[cookies.flow]); // one-time, whatever happens next
    const fail = (reason, returnTo = flow?.returnTo ?? '/') => {
      log(`[auth] login failed: ${reason}`); // reason codes only - no code, token, e-mail or state value
      redirect(res, `${returnTo}?login=failed`, [clear(cookies.flow, 'Lax')]);
    };
    if (!flow) return fail('no_login_flow');
    const state = url.searchParams.get('state');
    if (!state || !same(state, flow.state)) return fail('state_mismatch');
    if (url.searchParams.has('error')) return fail('provider_error');
    let identity;
    try {
      identity = await provider.exchangeCode({ code: url.searchParams.get('code'), codeVerifier: flow.codeVerifier, redirectUri: config.redirectUri, nonce: flow.nonce });
    } catch (e) {
      return fail(e?.reason ?? 'verification_failed');
    }
    // Authentication done. Authorization is NOT decided here: it is checked on every data request (authorize.js).
    sessions.destroy(jar[cookies.session]); // never keep a pre-login session id (no fixation)
    const sid = sessions.create(identity);
    redirect(res, flow.returnTo, [clear(cookies.flow, 'Lax'), setCookie(cookies.session, sid, 'Strict', sessionMaxAgeS)]);
  }

  async function logout(req, res, url) {
    sessions.destroy(parseCookies(req.headers.cookie)[cookies.session]);
    res.setHeader('Clear-Site-Data', '"cache"');
    redirect(res, safeReturn(url.searchParams.get('return')), [clear(cookies.session, 'Strict')]);
  }

  const routes = { '/auth/login': login, '/auth/callback': callback, '/auth/logout': logout };

  /** @returns {Promise<boolean>} true when the request was handled */
  return async function handle(req, res, url) {
    const fn = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : null;
    if (!fn) return false;
    const json = (status, body) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'GET') { json(405, { ok: false, error: 'method not allowed' }); return true; }
    if (!hostOk(req)) { json(403, { ok: false, error: 'forbidden' }); return true; }
    try { await fn(req, res, url); } catch { log('[auth] internal error'); if (!res.headersSent) json(500, { ok: false, error: 'internal error' }); }
    return true;
  };
}
