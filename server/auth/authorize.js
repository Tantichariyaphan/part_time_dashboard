// The order every protected data request follows (REQ §7-6, ARCH §5 rule 3):
//
//   requireAuthenticatedUser()  - who is this? (server session created from a Google-verified identity)
//          ↓
//   requireAllowlistedUser()    - is that identity on the allowlist and active? (checked on EVERY request)
//          ↓
//   grant()                     - an authorization verdict the data layer can recognise
//          ↓
//   api(verdict, …)             - only now is Screen Data (or any cached copy of it) read
//
// Identity supplied by the browser (query, body, headers such as X-Forwarded-Email, Authorization: Bearer …) is never
// read here: the only input is the opaque session cookie, resolved against server-side state.
import { parseCookies } from './session.js';

const GRANTED = new WeakSet();

/** Creates an ALLOW verdict. Only verdicts made here are accepted by the data layer (server/api.js). */
export function grant(identity, extra = {}) {
  const v = Object.freeze({ allowed: true, identity, ...extra });
  GRANTED.add(v);
  return v;
}
export const isGranted = (v) => GRANTED.has(v);
const deny = (status, reason, extra = {}) => Object.freeze({ allowed: false, status, reason, ...extra });

/** Step 1 - authentication. Returns {authenticated:true, identity, sid} or {authenticated:false, reason}. */
export function requireAuthenticatedUser(req, { sessions, cookieName }) {
  const sid = parseCookies(req.headers.cookie)[cookieName];
  if (!sid) return { authenticated: false, reason: 'no_session' };
  const identity = sessions.get(sid);
  if (!identity) return { authenticated: false, reason: 'invalid_or_expired_session' };
  return { authenticated: true, identity, sid };
}

/** Step 2 - authorization. Never called without a successful step 1. */
export function requireAllowlistedUser(authn, allowlist) {
  if (!authn?.authenticated) return deny(401, authn?.reason ?? 'not_authenticated');
  const d = allowlist.check(authn.identity);
  if (!d.allowed) return deny(403, d.reason, { identity: authn.identity });
  return grant(authn.identity, { name: d.name ?? null });
}

/**
 * Gate used when NIKUSHO_AUTH=google. `check(req)` runs both steps for every /api request.
 * `realIdentity: true`: identities come from verified Google ID tokens, not from the network position.
 */
export function createSessionGate({ sessions, allowlist, cookieName, publicHost }) {
  const hostOk = (req) => !publicHost || String(req.headers.host ?? '').toLowerCase() === publicHost.toLowerCase();
  return {
    kind: 'google-session',
    realIdentity: true,
    check(req) {
      if (!hostOk(req)) return deny(403, 'unexpected_host');
      return requireAllowlistedUser(requireAuthenticatedUser(req, { sessions, cookieName }), allowlist);
    },
    /** For GET /auth/me: tells the UI which screen to show. Never contains dashboard data or tokens. */
    status(req) {
      if (!hostOk(req)) return { status: 403, body: { ok: false, error: 'forbidden' } };
      const authn = requireAuthenticatedUser(req, { sessions, cookieName });
      if (!authn.authenticated) return { status: 200, body: { ok: true, mode: 'google', authenticated: false, allowed: false } };
      const v = requireAllowlistedUser(authn, allowlist);
      return { status: 200, body: { ok: true, mode: 'google', authenticated: true, allowed: v.allowed, email: authn.identity.email } };
    },
  };
}
