// TEST-ONLY stand-in for Google's OAuth/OIDC endpoints (authorization, token, JWKS) on 127.0.0.1.
// It lets the REAL provider code (server/auth/google.js) run end to end - PKCE check, RS256 signature, iss/aud/exp/
// nonce/email_verified - deterministically and without any real account. It is NOT Google and proves nothing about
// a real Google login (that is TV3/TV15, manual, with real accounts).
import http from 'node:http';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { GOOGLE_ENDPOINTS } from '../server/auth/google.js';

export const FAKE_ACCESS_TOKEN = 'FAKE_ACCESS_TOKEN_must_never_reach_the_browser';
export const FAKE_REFRESH_TOKEN = 'FAKE_REFRESH_TOKEN_must_never_reach_the_browser';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export async function startFakeGoogle({ clientId, clientSecret, now }) {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'fake-kid-1';
  const codes = new Map();
  const issuedIdTokens = [];
  let nextBrowserLogin = null; // identity used by the auto-consent /auth endpoint (browser end-to-end check)

  function idToken(claims, how = 'ok') {
    const header = { alg: how === 'none' ? 'none' : 'RS256', kid, typ: 'JWT' };
    const data = `${b64(header)}.${b64(claims)}`;
    if (how === 'none') return `${data}.`;
    const sig = sign('RSA-SHA256', Buffer.from(data), how === 'other-key' ? otherKey.privateKey : key.privateKey).toString('base64url');
    return `${data}.${sig}`;
  }

  /** Simulates the user consenting at Google: returns a one-time code bound to the PKCE challenge + redirect URI. */
  function issueCode({ email, sub, nonce, codeChallenge, redirectUri, claims = {}, how = 'ok' }) {
    const t = Math.floor(now() / 1000);
    const code = `code-${randomBytes(12).toString('hex')}`;
    codes.set(code, {
      codeChallenge, redirectUri, how,
      claims: { iss: GOOGLE_ENDPOINTS.issuers[0], aud: clientId, sub, email, email_verified: true, nonce, iat: t, exp: t + 3600, ...claims },
    });
    return code;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/certs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ keys: [{ ...key.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] }));
    }
    if (req.method === 'GET' && url.pathname === '/auth') { // auto-consent, for the browser check only
      const p = url.searchParams;
      if (!nextBrowserLogin || p.get('client_id') !== clientId || p.get('code_challenge_method') !== 'S256') { res.writeHead(400); return res.end(); }
      const code = issueCode({ ...nextBrowserLogin, nonce: p.get('nonce'), codeChallenge: p.get('code_challenge'), redirectUri: p.get('redirect_uri') });
      res.writeHead(302, { Location: `${p.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(p.get('state'))}` });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/token') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const f = new URLSearchParams(body);
        const c = codes.get(f.get('code'));
        codes.delete(f.get('code')); // one-time
        const ok = c && f.get('grant_type') === 'authorization_code' && f.get('client_id') === clientId && f.get('client_secret') === clientSecret
          && f.get('redirect_uri') === c.redirectUri && createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url') === c.codeChallenge;
        if (!ok) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end('{"error":"invalid_grant"}'); }
        const tok = idToken(c.claims, c.how);
        issuedIdTokens.push(tok);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: FAKE_ACCESS_TOKEN, refresh_token: FAKE_REFRESH_TOKEN, id_token: tok, token_type: 'Bearer', expires_in: 3599 }));
      });
      return undefined;
    }
    res.writeHead(404); return res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    endpoints: { authorization: `${base}/auth`, token: `${base}/token`, jwks: `${base}/certs`, issuers: GOOGLE_ENDPOINTS.issuers },
    issueCode, idToken, issuedIdTokens,
    setBrowserLogin: (identity) => { nextBrowserLogin = identity; },
    close: () => new Promise((r) => server.close(r)),
  };
}
