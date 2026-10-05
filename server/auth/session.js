// Server-side sessions + short-lived login flows (in memory).
//
// The browser holds only a random 256-bit session id in an HttpOnly cookie. Identity, expiry and validity live on the
// server; the cookie carries no identity and no token, so it cannot be edited into another user. Unknown, tampered,
// expired or logged-out ids are simply not found -> not authenticated.
//
// Storage choice (smallest that meets the contract, no database - Claude.md §5, REQ §9): process memory.
// A restart logs everyone out (fails closed). A multi-instance/serverless host needs a shared store in the client's
// environment - that hosting decision is UNCONFIRMED (Q-01). No session data is written to disk.
import { randomBytes, createHash } from 'node:crypto';

const ID_BYTES = 32;
const MAX_SESSIONS = 1000;
const MAX_FLOWS = 500;
export const FLOW_TTL_MS = 10 * 60_000;

export const newId = () => randomBytes(ID_BYTES).toString('base64url');
const key = (id) => createHash('sha256').update(id).digest('base64url'); // the raw id is never used as a map key
const ID_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** @param {{idleMs:number, maxMs:number, now?:()=>number}} opts */
export function createSessionStore({ idleMs, maxMs, now = Date.now }) {
  const sessions = new Map();
  const flows = new Map();

  const sweep = () => {
    const t = now();
    for (const [k, s] of sessions) if (t >= s.expiresAt || t - s.lastSeenAt >= idleMs) sessions.delete(k);
    for (const [k, f] of flows) if (t - f.createdAt >= FLOW_TTL_MS) flows.delete(k);
  };
  const cap = (map, max) => { while (map.size >= max) map.delete(map.keys().next().value); }; // oldest first

  return {
    /** New session for a VERIFIED identity ({sub, email}). Returns the opaque id for the cookie. */
    create(identity) {
      sweep(); cap(sessions, MAX_SESSIONS);
      const id = newId(); const t = now();
      sessions.set(key(id), { identity: { sub: identity.sub, email: identity.email }, createdAt: t, lastSeenAt: t, expiresAt: t + maxMs });
      return id;
    },
    /** Validates on every call: absolute lifetime and idle timeout. Returns the identity or null. */
    get(id) {
      if (typeof id !== 'string' || !ID_SHAPE.test(id)) return null;
      const k = key(id); const s = sessions.get(k);
      if (!s) return null;
      const t = now();
      if (t >= s.expiresAt || t - s.lastSeenAt >= idleMs) { sessions.delete(k); return null; }
      s.lastSeenAt = t;
      return s.identity;
    },
    destroy(id) { if (typeof id === 'string' && ID_SHAPE.test(id)) sessions.delete(key(id)); },
    size: () => sessions.size,

    /** Login flow (state, nonce, PKCE verifier, return path) bound to the browser by a separate flow cookie. */
    startFlow(flow) {
      sweep(); cap(flows, MAX_FLOWS);
      const id = newId();
      flows.set(key(id), { ...flow, createdAt: now() });
      return id;
    },
    /** One-time: the flow is removed whether or not it is still valid. */
    takeFlow(id) {
      if (typeof id !== 'string' || !ID_SHAPE.test(id)) return null;
      const k = key(id); const f = flows.get(k);
      flows.delete(k);
      if (!f || now() - f.createdAt >= FLOW_TTL_MS) return null;
      return f;
    },
  };
}

// ---- cookies ----
export function cookieNames(secure) {
  // __Host- prefix (Secure, Path=/, no Domain) whenever the origin is https.
  return secure ? { session: '__Host-nikusho_sid', flow: '__Host-nikusho_login' } : { session: 'nikusho_sid', flow: 'nikusho_login' };
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (!Object.hasOwn(out, name)) out[name] = part.slice(i + 1).trim();
  }
  return out;
}

/** HttpOnly always; Secure on https; SameSite=Strict for the session, Lax for the login flow (Google -> callback is a cross-site navigation). */
export function serializeCookie(name, value, { secure, sameSite, maxAgeS }) {
  return [`${name}=${value}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`, secure ? 'Secure' : null, `Max-Age=${maxAgeS}`].filter(Boolean).join('; ');
}
