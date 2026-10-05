// Server-side viewer gate.
//
// REQ §7-6: viewers are checked ON THE SERVER; no data goes to anyone not on the allowlist or not verifiable;
// revoked viewers must see nothing, including from cache. Authentication (who?) and Authorization (allowed?)
// are separate steps, in that order.
//
// Two gates exist:
//   * createSessionGate (authorize.js, NIKUSHO_AUTH=google) - the Auth Prototype: Google-verified identity ->
//     server session -> allowlist, checked on every request. Production hosting/allowlist/cache remain
//     UNCONFIRMED (Q-01 / Q-04 / Q-05).
//   * createDevLoopbackGate (this file, default) - DEV ONLY, NOT authentication (`realIdentity:false`): serves
//     loopback requests so the skeleton can be viewed. It is safe only because the sole data behind it is synthetic.
//     startServer() REFUSES to pair this gate with any adapter that could carry real data.
import { grant } from './authorize.js';

/** @typedef {{allowed:boolean, identity?:string, reason?:string}} GateResult */

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function createDevLoopbackGate() {
  return {
    kind: 'dev-loopback',
    realIdentity: false,
    /**
     * Step 1 (authentication) + step 2 (authorization), kept as separate stages even in the dev gate.
     * @returns {GateResult}
     */
    check(req) {
      const authenticated = LOOPBACK.has(req.socket.remoteAddress ?? ''); // dev "identity" = local machine
      if (!authenticated) return { allowed: false, status: 403, reason: 'not authenticated (dev gate accepts loopback only)' };
      const host = String(req.headers.host ?? '').replace(/:\d+$/, '');
      if (!LOCAL_HOSTS.has(host)) return { allowed: false, status: 403, reason: 'unexpected Host header' }; // DNS-rebinding guard
      return grant('dev-loopback'); // dev gate has no identity and therefore no allowlist
    },
    /** For GET /auth/me: the UI shows the dashboard directly in this mode (no sign-in screen). */
    status(req) {
      const v = this.check(req);
      return { status: 200, body: { ok: true, mode: 'dev-loopback', realIdentity: false, authenticated: v.allowed, allowed: v.allowed } };
    },
  };
}

/** Adapter kinds that carry only synthetic data / no data and may therefore sit behind the dev gate. */
export const SYNTHETIC_ADAPTER_KINDS = Object.freeze(['devmock', 'demo', 'none']);

export function assertGateMatchesAdapters(gate, adapters) {
  if (gate.realIdentity) return;
  for (const a of adapters) {
    if (!SYNTHETIC_ADAPTER_KINDS.includes(a.kind)) {
      throw new Error(`Refusing to start: adapter "${a.kind}" may carry real data but the dev-only gate is not real authentication (Q-01/Q-04).`);
    }
  }
}
