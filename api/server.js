// Vercel entry: passes every request to the existing server.
//
//   live entry  (/ , /api/live/*)  = the client's View-only Copy + Machine Heartbeat Sheet, read-only, through the reader
//                                    account (server/liveSource.js). NEVER mock or demo data: when the source is not
//                                    configured or cannot be read, the pages show "未接続" / "更新停止" with a reason code.
//   demo entry  (/demo/, /api/demo/*) = the fixed anonymized snapshot (REQ §7-12), opened explicitly, labelled デモ.
// The dev mock (src/adapters/mock/) is not wired here at all; it stays for local development and tests.
//
// Start-up never crashes the function: if the sign-in configuration is wrong (or a module fails to load), every /auth and
// /api request gets 503 with NO data (deny by default) and the reason is written to the Vercel logs. Configuration messages
// name environment variables only, never their values. Source problems do not stop the function: they become a
// connection/error state on the live entry (no data), so the demo entry and the sign-in keep working.
let ready = null;

async function start() {
  const [{ createServer, chooseLiveAdapter }, { AuthConfigError, loadAuthConfig }, { createGoogleAuth }, { createDemoAdapter }] = await Promise.all([
    import('../server/index.js'),
    import('../server/auth/config.js'),
    import('../server/auth/index.js'),
    import('../src/adapters/demo/demoAdapter.js'),
  ]);
  try {
    const config = loadAuthConfig();
    if (config.mode !== 'google') throw new AuthConfigError('NIKUSHO_AUTH must be set to google on Vercel');
    // Production policy is forced here, whatever VERCEL / NIKUSHO_DEPLOYMENT say: the live entry is the client copy only.
    const live = chooseLiveAdapter({ ...process.env, NIKUSHO_DEPLOYMENT: 'production' }, { log: (m) => console.error(m) });
    const server = createServer({ live, demo: createDemoAdapter(), auth: createGoogleAuth(config) });
    console.log(`[startup] ready - origin ${config.publicOrigin}, allowlist from ${config.allowlistJson !== null ? 'NIKUSHO_ALLOWLIST_JSON' : 'NIKUSHO_ALLOWLIST_FILE'}; live entry -> client copy${live.unavailable ? ` NOT CONNECTED (${live.unavailable})` : ` (copy: ${live.readers?.copy}, heartbeat: ${live.readers?.heartbeat})`}; demo entry -> anonymized snapshot`);
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
