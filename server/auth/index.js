// Composition of the Auth Prototype (NIKUSHO_AUTH=google):
//   Google provider (authentication)  +  session store  +  allowlist (authorization)  ->  { gate, routes }
import { createGoogleProvider } from './google.js';
import { createSessionStore, cookieNames } from './session.js';
import { createFileAllowlist } from './allowlist.js';
import { createSessionGate } from './authorize.js';
import { createAuthRoutes } from './routes.js';

/**
 * @param {object} config  result of loadAuthConfig() with mode 'google'
 * @param {{provider?:object, allowlist?:object, now?:()=>number, log?:Function}} [deps]  test seams (set in code only)
 */
export function createGoogleAuth(config, deps = {}) {
  const now = deps.now ?? Date.now;
  const provider = deps.provider ?? createGoogleProvider({ clientId: config.google.clientId, clientSecret: config.google.clientSecret, now });
  const allowlist = deps.allowlist ?? createFileAllowlist(config.allowlistFile, { log: deps.log });
  const sessions = createSessionStore({ idleMs: config.session.idleMs, maxMs: config.session.maxMs, now });
  const cookies = cookieNames(config.secureCookies);
  const gate = createSessionGate({ sessions, allowlist, cookieName: cookies.session, publicHost: config.publicHost });
  const makeRoutes = (headers) => createAuthRoutes({ provider, sessions, cookies, config, headers, log: deps.log });
  return { gate, makeRoutes, sessions, cookies, provider, allowlist };
}
