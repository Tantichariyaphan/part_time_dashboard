// Builds the evaluation context for one request: adapter result -> normalize -> validate -> freshness.
// Pipeline position: Mock Data (adapter) -> Screen Data (normalized) -> [domain] -> view model -> API -> UI.
import { assertAdapterResult } from '../adapters/types.js';
import { normalizeTabs } from '../normalize/normalize.js';
import { validateScreen } from '../normalize/validate.js';
import { computeFreshness } from '../domain/freshness.js';
import { businessDayOf, formatIso, minutesBetween } from '../domain/time.js';
import { TAB_NAME } from '../contract/enums.js';
import { SLOT_RULE_FROM } from '../contract/evidenceContract.js';

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
    limits: adapterResult.limits ?? {},
    sources: adapterResult.sources ?? null,
    evidence: adapterResult.evidence ?? null, // client run-evidence (copy adapter): 5-min patrol rows or null
  };
}

/**
 * Run status of one kind cannot be read from the source (copy adapter): runs are listed, never judged. Since the client
 * rules of 2026-10-21 a kind is judged once the client's evidence tab for it is connected (limits.runStatusByKind).
 */
export const runStatusUnconfirmedFor = (ctx, kind) => (ctx.limits?.runStatusByKind
  ? ctx.limits.runStatusByKind[kind] !== 'EVIDENCE'
  : ctx.limits?.runStatus === 'UNCONFIRMED');
/** Neither kind can be judged. */
export const runStatusUnconfirmed = (ctx) => runStatusUnconfirmedFor(ctx, 'slot') && runStatusUnconfirmedFor(ctx, 'daily');
/** Per-kind flags for dayRuns / periodMetrics. */
export const runUnconfirmedKinds = (ctx) => ({ slot: runStatusUnconfirmedFor(ctx, 'slot'), daily: runStatusUnconfirmedFor(ctx, 'daily') });
/** Judged from the client's evidence records: a scheduled run without a record is 未確認（記録なし）, never 未実行 (rules §2.3). */
export const runsFromEvidence = (ctx) => !!ctx.limits?.runStatusByKind;
/** Options for dayRuns() / periodMetrics(): per-kind judging, evidence-mode empty runs, and the slot rule start. */
export const runOpts = (ctx) => ({
  statusUnconfirmed: runUnconfirmedKinds(ctx),
  noRowStatus: runsFromEvidence(ctx) ? 'no_evidence' : 'no_row',
  judgedFrom: runsFromEvidence(ctx) ? { slot: Date.parse(SLOT_RULE_FROM) } : null,
});
/** Instant from which question records are known to be incomplete (copy adapter, Q-52), or null. */
export const questionsIncompleteFromMs = (ctx) => {
  const ms = Date.parse(ctx.limits?.questionsIncompleteFrom ?? '');
  return Number.isFinite(ms) ? ms : null;
};

/** Source connection states for the UI: states, reason codes, counts and row numbers only (no ids, no cell values). */
export function publicSources(ctx) {
  if (!ctx.sources) return null;
  const tabs = (list) => (list ?? []).map((t) => ({ tab: t.tab, state: t.state, rows: t.rows ?? null, findingCount: t.findingCount ?? 0,
    findings: (t.findings ?? []).map((f) => ({ row: f.row ?? null, column: f.column ?? null, problem: f.problem })), used: t.used ?? null,
    warningCount: t.warningCount ?? 0, warnings: (t.warnings ?? []).map((f) => ({ row: f.row ?? null, column: f.column ?? null, problem: f.problem })) }));
  const c = ctx.sources.copy ?? {};
  const h = ctx.sources.heartbeat ?? {};
  return {
    copy: {
      state: c.state ?? 'NOT_CONNECTED', reason: c.reason ?? null, readAt: c.readAt ?? null,
      tabs: tabs(c.metaTab ? [...(c.tabs ?? []), c.metaTab] : c.tabs),
      copyFindingCount: c.copyFindingCount ?? 0, copyFindings: (c.copyFindings ?? []).map((f) => ({ problem: f.problem })),
      replyLinks: c.replyLinks ?? null, unclassified: c.unclassified ?? null, collapsedMessageRows: c.collapsedMessageRows ?? null,
    },
    heartbeat: { state: h.state ?? 'NOT_CONNECTED', reason: h.reason ?? null, readAt: h.readAt ?? null, tabs: tabs(h.tabs) },
    runStatus: ctx.limits?.runStatus ?? null, runStatusByKind: ctx.limits?.runStatusByKind ?? null,
    evidenceTabs: (c.evidenceTabs ?? []).map((t) => ({ tab: t.tab, state: t.state, rows: t.rows ?? null, findingCount: t.findingCount ?? 0, findings: (t.findings ?? []).map((f) => ({ row: f.row ?? null, column: f.column ?? null, problem: f.problem })) })),
    questionsIncompleteFrom: ctx.limits?.questionsIncompleteFrom ?? null,
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
