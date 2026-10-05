// Vercel entry: passes every request to the existing server. DEMO ONLY - mock data, not production (Q-01).
//
// Start-up never crashes the function: if the configuration is wrong (or a module fails to load), every /auth and
// /api request gets 503 with NO data (deny by default) and the reason is written to the Vercel logs.
// AuthConfigError messages name environment variables only, never their values.
let ready = null;

async function start() {
  const [{ createServer }, { AuthConfigError, loadAuthConfig }, { createGoogleAuth }, { createDevMockAdapter }, { createDemoAdapter }] = await Promise.all([
    import('../server/index.js'),
    import('../server/auth/config.js'),
    import('../server/auth/index.js'),
    import('../src/adapters/mock/devMockAdapter.js'),
    import('../src/adapters/demo/demoAdapter.js'),
  ]);
  try {
    const config = loadAuthConfig();
    if (config.mode !== 'google') throw new AuthConfigError('NIKUSHO_AUTH must be set to google on Vercel');
    const server = createServer({ live: createDevMockAdapter(), demo: createDemoAdapter(), auth: createGoogleAuth(config) });
    console.log(`[startup] Auth Prototype ready - origin ${config.publicOrigin}, allowlist from ${config.allowlistJson !== null ? 'NIKUSHO_ALLOWLIST_JSON' : 'NIKUSHO_ALLOWLIST_FILE'}`);
    return { handle: (req, res) => server.emit('request', req, res) };
  } catch (e) {
    if (e instanceof AuthConfigError) return { failure: e.message };
    throw e;
  }
}

export default async function handler(req, res) {
  let state;
  try { state = await (ready ??= start()); } catch (e) {
    console.error('[startup] unexpected start-up error:', e);
    state = { failure: 'unexpected start-up error (see the error above in the log)' };
  }
  if (state.handle) return state.handle(req, res);
  console.error(`[startup] NOT CONFIGURED - request refused: ${state.failure}`);
  res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  return res.end(JSON.stringify({ ok: false, error: 'server not configured' }));
}
