// Google OAuth 2.0 / OpenID Connect provider (authorization-code flow + PKCE, state, nonce).
//
// AUTHENTICATION ONLY: this module answers "who is this?" with a Google-verified identity. Whether that identity may
// see anything is decided separately by the allowlist (authorize.js). It never decides access.
//
// This is the ONLY module that makes outbound HTTP requests, and only to Google's fixed OAuth endpoints below.
// It imports nothing from src/ and never receives registry/Screen Data, so no registry text can leave through it
// (REQ §7-8). OAuth access/refresh tokens returned by Google are discarded immediately: never stored, never logged,
// never sent to the browser. Only {sub, email} of a verified ID token is kept.
import { createPublicKey, verify as verifySig, timingSafeEqual } from 'node:crypto';

export const GOOGLE_ENDPOINTS = Object.freeze({
  authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  jwks: 'https://www.googleapis.com/oauth2/v3/certs',
  issuers: Object.freeze(['https://accounts.google.com', 'accounts.google.com']),
});

const CLOCK_SKEW_S = 60;
const JWKS_TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;

/** Failure with a short machine reason only (safe to log; never contains tokens or identities). */
export class IdentityError extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

const b64urlJson = (s) => {
  try { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); } catch { throw new IdentityError('id_token_malformed'); }
};
const sameString = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * @param {{clientId:string, clientSecret:string, endpoints?:object, fetchImpl?:Function, now?:()=>number}} opts
 *   `endpoints` / `fetchImpl` exist for the deterministic test IdP only; they are set in code, never from the environment.
 */
export function createGoogleProvider({ clientId, clientSecret, endpoints = GOOGLE_ENDPOINTS, fetchImpl = globalThis.fetch, now = Date.now }) {
  if (!clientId || !clientSecret) throw new Error('Google provider needs a client ID and secret');
  let jwks = { keys: new Map(), fetchedAt: 0 };

  async function loadKeys(force = false) {
    if (!force && jwks.keys.size && now() - jwks.fetchedAt < JWKS_TTL_MS) return jwks.keys;
    let body;
    try {
      const res = await fetchImpl(endpoints.jwks, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error();
      body = await res.json();
    } catch { throw new IdentityError('jwks_unavailable'); }
    const keys = new Map();
    for (const k of Array.isArray(body?.keys) ? body.keys : []) {
      if (k?.kty !== 'RSA' || !k.kid) continue;
      try { keys.set(k.kid, createPublicKey({ key: { kty: k.kty, n: k.n, e: k.e }, format: 'jwk' })); } catch { /* skip bad key */ }
    }
    jwks = { keys, fetchedAt: now() };
    return keys;
  }

  /** Verifies a Google ID token completely (signature, issuer, audience, expiry, nonce, verified e-mail). */
  async function verifyIdToken(idToken, { nonce }) {
    if (typeof idToken !== 'string') throw new IdentityError('id_token_missing');
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new IdentityError('id_token_malformed');
    const header = b64urlJson(parts[0]);
    const claims = b64urlJson(parts[1]);
    if (header?.alg !== 'RS256' || typeof header.kid !== 'string') throw new IdentityError('id_token_alg');
    let key = (await loadKeys()).get(header.kid);
    if (!key) key = (await loadKeys(true)).get(header.kid); // Google rotates keys
    if (!key) throw new IdentityError('id_token_unknown_key');
    const ok = verifySig('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
    if (!ok) throw new IdentityError('id_token_signature');

    const t = Math.floor(now() / 1000);
    if (!endpoints.issuers.includes(claims.iss)) throw new IdentityError('id_token_issuer');
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(clientId)) throw new IdentityError('id_token_audience');
    if (aud.length > 1 && claims.azp !== clientId) throw new IdentityError('id_token_azp');
    if (!Number.isFinite(claims.exp) || claims.exp + CLOCK_SKEW_S < t) throw new IdentityError('id_token_expired');
    if (!Number.isFinite(claims.iat) || claims.iat - CLOCK_SKEW_S > t) throw new IdentityError('id_token_iat');
    if (typeof claims.nonce !== 'string' || !sameString(claims.nonce, nonce)) throw new IdentityError('id_token_nonce');
    if (typeof claims.sub !== 'string' || !claims.sub) throw new IdentityError('id_token_sub');
    if (typeof claims.email !== 'string' || !claims.email.includes('@')) throw new IdentityError('id_token_email');
    if (claims.email_verified !== true) throw new IdentityError('id_token_email_unverified');
    return { sub: claims.sub, email: claims.email.trim().toLowerCase() };
  }

  return {
    kind: 'google-oidc',
    realIdentity: true,
    /** URL the browser is redirected to. Contains no secret (client ID is public by design). */
    authorizationUrl({ state, nonce, codeChallenge, redirectUri }) {
      const u = new URL(endpoints.authorization);
      u.search = new URLSearchParams({
        response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: 'openid email',
        state, nonce, code_challenge: codeChallenge, code_challenge_method: 'S256', prompt: 'select_account',
      }).toString();
      return u.toString();
    },
    /** Server-to-Google code exchange, then full ID-token verification. Returns {sub, email} only. */
    async exchangeCode({ code, codeVerifier, redirectUri, nonce }) {
      if (typeof code !== 'string' || !code || code.length > 2048) throw new IdentityError('code_missing');
      let body;
      try {
        const res = await fetchImpl(endpoints.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }).toString(),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error();
        body = await res.json();
      } catch { throw new IdentityError('token_exchange_failed'); }
      const idToken = body?.id_token;
      body = null; // access_token / refresh_token are dropped here and never leave this function
      return verifyIdToken(idToken, { nonce });
    },
    verifyIdToken,
  };
}
