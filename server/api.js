// Read-only API boundary:  Screen Data -> API -> Dashboard.
//
//   GET /api/{live|demo}/entry
//   GET /api/{live|demo}/all-stores                        ①
//   GET /api/{live|demo}/today?store=                      ②
//   GET /api/{live|demo}/run?store=&run_id=                ② drill-down (messages + questions of one patrol)
//   GET /api/{live|demo}/messages?store=&date=             ③
//   GET /api/{live|demo}/questions?store=                  ④
//   GET /api/{live|demo}/failures                          ⑤
//   GET /api/{live|demo}/machines                          ⑥
//   GET /api/{live|demo}/periods?days=7|30                 ⑦
//
// No write, source-edit, re-run, approval or send endpoints exist. Anything but GET/HEAD is rejected by the server.
// `live` and `demo` are separate entries backed by separate adapters; there is no switch between them.
import { buildContext } from '../src/viewmodels/context.js';
import { isGranted } from './auth/authorize.js';
import * as vm from '../src/viewmodels/pages.js';

export const ENTRIES = Object.freeze(['live', 'demo']);

const routes = Object.freeze({
  'entry': (ctx, q, entry) => vm.entryInfo(ctx, entry),
  'all-stores': (ctx) => vm.allStores(ctx),
  'today': (ctx, q) => vm.today(ctx, q.get('store')),
  'run': (ctx, q) => vm.runDetail(ctx, q.get('store'), q.get('run_id')),
  'messages': (ctx, q) => vm.messages(ctx, q.get('store'), q.get('date')),
  'questions': (ctx, q) => vm.questions(ctx, q.get('store')),
  'failures': (ctx) => vm.failures(ctx),
  'machines': (ctx) => vm.machines(ctx),
  'periods': (ctx, q) => vm.periods(ctx, q.get('days')),
});

/**
 * @param {{live: object, demo: object}} adapters
 * @returns {(authz:object, entry:string, resource:string, query:URLSearchParams) => Promise<{status:number, body:object}>}
 *
 * `authz` must be an ALLOW verdict issued by the server-side gate for THIS request (authorize.js grant()).
 * Anything else - missing, denied, or a look-alike object - gets 403 before any adapter (or any copy the adapter
 * keeps in memory, e.g. the demo snapshot) is touched. Defence in depth behind the gate in server/index.js.
 */
export function createApi(adapters) {
  return async function handle(authz, entry, resource, query) {
    if (!isGranted(authz)) return { status: 403, body: { ok: false, error: 'forbidden' } };
    if (!ENTRIES.includes(entry)) return { status: 404, body: { ok: false, error: 'unknown entry' } };
    const route = Object.hasOwn(routes, resource) ? routes[resource] : null; // own keys only: 'constructor', '__proto__' etc. are not routes
    if (!route) return { status: 404, body: { ok: false, error: 'unknown resource' } };
    try {
      const ctx = buildContext(await adapters[entry].load());
      const data = route(ctx, query, entry);
      return { status: 200, body: vm.envelope(ctx, entry, data) };
    } catch (err) {
      if (err instanceof vm.NotFound) return { status: 404, body: { ok: false, error: err.message } };
      if (err instanceof vm.BadRequest) return { status: 400, body: { ok: false, error: err.message } };
      console.error('[api] internal error:', err); // details stay on the server
      return { status: 500, body: { ok: false, error: 'internal error' } };
    }
  };
}
