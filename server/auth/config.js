// Auth configuration from the environment. Values are NEVER logged; errors name the variable, never its value.
//
//   NIKUSHO_AUTH                    dev-loopback (default; synthetic data only) | google
//   NIKUSHO_PUBLIC_ORIGIN           origin the browser uses, e.g. http://localhost:3000 (dev) or https://<client URL>
//                                   -> redirect URI = <origin>/auth/callback (must be registered in the OAuth client)
//   GOOGLE_OAUTH_CLIENT_ID          OAuth 2.0 Web client ID (client's Google Cloud project in production)
//   GOOGLE_OAUTH_CLIENT_SECRET      its secret (server-side only; never sent to the browser)
//   NIKUSHO_ALLOWLIST_JSON          the allowlist JSON itself (hosted deployments: keeps e-mails out of the repository)
//   NIKUSHO_ALLOWLIST_FILE          or: path of the allowlist JSON (outside public/). One of the two is required;
//                                   when both are set, NIKUSHO_ALLOWLIST_JSON is used.
//   NIKUSHO_SESSION_IDLE_MINUTES    optional, default 60   (provisional, no REQ value)
//   NIKUSHO_SESSION_MAX_HOURS       optional, default 12   (provisional, no REQ value)
//
// Production values (client ID/secret, domain, allowlist location) belong to the client's environment and are
// UNCONFIRMED (Q-01 / Q-04). Nothing here has a built-in default credential.

export const AUTH_MODES = Object.freeze(['dev-loopback', 'google']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class AuthConfigError extends Error {}

export function loadAuthConfig(rawEnv = process.env) {
  // Surrounding spaces / line breaks pasted into a hosting dashboard are not part of any value.
  const env = Object.fromEntries(Object.entries(rawEnv).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
  const mode = env.NIKUSHO_AUTH || 'dev-loopback';
  if (!AUTH_MODES.includes(mode)) throw new AuthConfigError(`NIKUSHO_AUTH must be one of: ${AUTH_MODES.join(', ')}`);
  if (mode === 'dev-loopback') return { mode };

  const required = ['NIKUSHO_PUBLIC_ORIGIN', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'];
  const missing = required.filter((k) => !String(env[k] ?? '').trim());
  if (!env.NIKUSHO_ALLOWLIST_JSON && !env.NIKUSHO_ALLOWLIST_FILE) missing.push('NIKUSHO_ALLOWLIST_JSON (or NIKUSHO_ALLOWLIST_FILE)');
  if (missing.length) throw new AuthConfigError(`NIKUSHO_AUTH=google needs these environment variables: ${missing.join(', ')}`);

  let origin;
  try { origin = new URL(env.NIKUSHO_PUBLIC_ORIGIN); } catch { throw new AuthConfigError('NIKUSHO_PUBLIC_ORIGIN is not a valid URL'); }
  if (origin.origin !== env.NIKUSHO_PUBLIC_ORIGIN.replace(/\/$/, '').toLowerCase()) throw new AuthConfigError('NIKUSHO_PUBLIC_ORIGIN must be an origin only (scheme://host[:port]), no path');
  const secure = origin.protocol === 'https:';
  if (!secure && !(origin.protocol === 'http:' && LOOPBACK_HOSTS.has(origin.hostname))) {
    throw new AuthConfigError('NIKUSHO_PUBLIC_ORIGIN must use https (plain http is accepted only for localhost development)');
  }

  const minutes = (k, def) => {
    if (env[k] === undefined || env[k] === '') return def;
    const n = Number(env[k]);
    if (!Number.isFinite(n) || n <= 0) throw new AuthConfigError(`${k} must be a positive number`);
    return n;
  };

  return {
    mode,
    publicOrigin: origin.origin,
    publicHost: origin.host,
    secureCookies: secure,
    redirectUri: `${origin.origin}/auth/callback`,
    google: { clientId: env.GOOGLE_OAUTH_CLIENT_ID.trim(), clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET.trim() },
    allowlistJson: env.NIKUSHO_ALLOWLIST_JSON ? env.NIKUSHO_ALLOWLIST_JSON : null,
    allowlistFile: env.NIKUSHO_ALLOWLIST_FILE || null,
    session: {
      idleMs: minutes('NIKUSHO_SESSION_IDLE_MINUTES', 60) * 60_000,
      maxMs: minutes('NIKUSHO_SESSION_MAX_HOURS', 12) * 3_600_000,
    },
  };
}
