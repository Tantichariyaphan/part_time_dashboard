// Builds the evaluation context for one request: adapter result -> normalize -> validate -> freshness.
// Pipeline position: Mock Data (adapter) -> Screen Data (normalized) -> [domain] -> view model -> API -> UI.
import { assertAdapterResult } from '../adapters/types.js';
import { normalizeTabs } from '../normalize/normalize.js';
import { validateScreen } from '../normalize/validate.js';
import { computeFreshness } from '../domain/freshness.js';
import { businessDayOf, formatIso, minutesBetween } from '../domain/time.js';
import { TAB_NAME } from '../contract/enums.js';

export function buildContext(adapterResult) {
  assertAdapterResult(adapterResult);
  const { screen, issues } = normalizeTabs(adapterResult.raw);
  const validation = validateScreen(screen);
  const freshness = computeFreshness(screen.meta, issues, adapterResult.now);
  return {
    adapterKind: adapterResult.kind,
    now: adapterResult.now,
    screen,
    issues,
    validation,
    freshness,
    connection: adapterResult.storeConnection ?? {},
  };
}

/** Stores shown on ① : `active=yes` (REQ §6-①). Stores come from configuration, never from code. */
export const activeStores = (ctx) => ctx.screen.stores.filter((s) => s.active === 'yes');
export const findStore = (ctx, id) => ctx.screen.stores.find((s) => s.store === id) ?? null;
/** Conservative default: a store is connected only if the adapter says so (Q-29, interim). */
export const connectionOf = (ctx, store) => (ctx.connection[store.store] === 'connected' ? 'connected' : 'not_connected');
export const currentDay = (ctx, store) => businessDayOf(ctx.now, store);
export const sourceThroughOf = (ctx, tabKey) => {
  const t = ctx.freshness.tabs.find((x) => x.key === tabKey);
  const ms = t?.source_through ? Date.parse(t.source_through) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

/** Freshness as sent to the UI. */
export function publicFreshness(ctx) {
  const f = ctx.freshness;
  return {
    state: f.state,
    reasons: f.reasons,
    sourceThrough: f.sourceThroughMs == null ? null : formatIso(f.sourceThroughMs),
    sourceThroughMinutesAgo: f.sourceThroughMs == null ? null : minutesBetween(f.sourceThroughMs, ctx.now),
    lastSuccess: f.lastSuccessMs == null ? null : formatIso(f.lastSuccessMs),
  };
}

export const TAB_LABELS = TAB_NAME;
