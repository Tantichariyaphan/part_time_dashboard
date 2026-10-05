// HTTP server for the skeleton: static UI + read-only JSON API.
// Technology/hosting is UNCONFIRMED (Q-01); this plain Node server is a development harness with zero dependencies.
//
//   NIKUSHO_LIVE_ADAPTER   devmock (default for this milestone) | none
//   NIKUSHO_DEV_SCENARIO   full (default) | phase1 | stale-messages | stopped | error | machine-down   (devmock only)
//   PORT                   default 3000
//   HOST                   default 127.0.0.1 (dev gate accepts loopback only)
//   NIKUSHO_AUTH           dev-loopback (default) | google  -> Auth Prototype; see server/auth/config.js, docs/auth-prototype.md
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { createApi } from './api.js';
import { assertGateMatchesAdapters, createDevLoopbackGate } from './auth/gate.js';
import { AuthConfigError, loadAuthConfig } from './auth/config.js';
import { createGoogleAuth } from './auth/index.js';
import { createDevMockAdapter } from '../src/adapters/mock/devMockAdapter.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';
import { createNoneAdapter } from '../src/adapters/none/noneAdapter.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

export function chooseLiveAdapter(env = process.env) {
  const which = env.NIKUSHO_LIVE_ADAPTER ?? 'devmock';
  if (which === 'none') return createNoneAdapter();
  if (which === 'devmock') return createDevMockAdapter({ scenario: env.NIKUSHO_DEV_SCENARIO ?? 'full' });
  throw new Error(`NIKUSHO_LIVE_ADAPTER="${which}" is not available: the real Source pipeline is not connected (UNCONFIRMED Q-01/Q-08).`);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, obj === undefined ? undefined : JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

async function serveStatic(res, urlPath, method) {
  let rel;
  if (urlPath === '/') rel = 'index.html';
  else if (urlPath === '/demo' || urlPath === '/demo/') rel = join('demo', 'index.html');
  else if (urlPath.startsWith('/app/') || urlPath.startsWith('/styles/')) rel = urlPath.slice(1);
  else if (urlPath === '/favicon.ico') return send(res, 204, undefined); // no icon asset is shipped
  else return sendJson(res, 404, { ok: false, error: 'not found' });
  const file = normalize(join(ROOT, rel));
  if (!file.startsWith(ROOT + sep)) return sendJson(res, 404, { ok: false, error: 'not found' });
  try {
    const buf = await readFile(file);
    send(res, 200, method === 'HEAD' ? undefined : buf, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  } catch {
    sendJson(res, 404, { ok: false, error: 'not found' });
  }
}

/**
 * @param {{live:object, demo:object, gate?:object, auth?:object}} opts
 *   auth = createGoogleAuth(...) for the Auth Prototype (its gate is used); otherwise `gate` (dev loopback).
 */
export function createServer({ live, demo, gate: devGate, auth }) {
  const gate = auth?.gate ?? devGate;
  if (!gate) throw new Error('Refusing to start: no viewer gate');
  assertGateMatchesAdapters(gate, [live, demo]);
  const api = createApi({ live, demo });
  const authRoutes = auth ? auth.makeRoutes(SECURITY_HEADERS) : null;
  return http.createServer(async (req, res) => {
    // READ-ONLY: nothing but GET / HEAD is ever accepted.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { ok: false, error: 'read-only service' });
    }
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return sendJson(res, 400, { ok: false, error: 'bad request' }); }

    // Public auth entry points: who am I (no data), and the Google login / callback / logout redirects.
    if (url.pathname === '/auth/me') {
      const { status, body } = gate.status(req);
      return sendJson(res, status, req.method === 'HEAD' ? undefined : body);
    }
    if (url.pathname.startsWith('/auth/')) {
      if (authRoutes && await authRoutes(req, res, url)) return undefined;
      return sendJson(res, 404, { ok: false, error: 'not found' });
    }

    if (url.pathname.startsWith('/api/')) {
      // Server-side viewer check on EVERY request, BEFORE any data (or cached copy) is read:
      // authenticated? -> allowlisted? -> only then the read-only API.
      const verdict = gate.check(req);
      if (!verdict.allowed) {
        const status = verdict.status === 401 ? 401 : 403;
        return sendJson(res, status, { ok: false, error: status === 401 ? 'unauthenticated' : 'forbidden' });
      }
      const [, , entry, resource] = url.pathname.split('/');
      const { status, body } = await api(verdict, entry, resource, url.searchParams);
      return sendJson(res, status, body);
    }
    return serveStatic(res, url.pathname, req.method);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let authConfig;
  try { authConfig = loadAuthConfig(); } catch (e) {
    console.error(e instanceof AuthConfigError ? `Auth configuration: ${e.message} (see docs/auth-prototype.md)` : 'Auth configuration could not be read');
    process.exit(1);
  }
  const live = chooseLiveAdapter();
  const demo = createDemoAdapter();
  const auth = authConfig.mode === 'google' ? createGoogleAuth(authConfig) : null;
  const server = createServer({ live, demo, auth, gate: auth ? undefined : createDevLoopbackGate() });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use. Start with another port, e.g. PORT=3001 (see README).` : `Server error: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`NIKUSHO monitor skeleton (NOT production)  http://${host}:${port}/        live entry -> ${live.kind}${live.scenario ? ` (${live.scenario})` : ''}`);
    console.log(`                                            http://${host}:${port}/demo/   demo entry -> fixed anonymized snapshot`);
    console.log(auth
      ? `viewer check: Google sign-in + server-side allowlist (Auth Prototype). Open ${authConfig.publicOrigin}/ (or /demo/) - other host names are refused.`
      : 'viewer check: DEV loopback gate (NOT authentication; synthetic data only). Set NIKUSHO_AUTH=google for the Auth Prototype.');
  });
}
