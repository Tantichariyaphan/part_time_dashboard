// Data-update freshness (REQ §6 common rules).
// Normal ONLY when status=ok AND generated_at is within 20 minutes. Otherwise "update stopped" (red banner);
// old numbers must never look normal or "0".
// Which `meta` row(s) drive each page's banner is UNCONFIRMED (Q-25). Safe default: ANY required tab not normal -> stopped.
import { META_TAB_KEYS, TAB_NAME, META_STATUS } from '../contract/enums.js';
import { BANNER_STALE_MINUTES } from './constants.js';
import { minutesBetween, parseMs, businessDayWindow } from './time.js';

/**
 * @param {object[]} metaRows normalized `meta` rows
 * @param {Record<string, any>} issues normalization issues (missing columns / absent tabs)
 * @param {number} now ms
 */
export function computeFreshness(metaRows, issues, now) {
  const reasons = [];
  const tabs = [];

  if (issues?.meta?.absent || (issues?.meta?.missingColumns?.length ?? 0) > 0) {
    reasons.push({ tab: TAB_NAME.meta, kind: issues?.meta?.absent ? 'unreadable' : 'missing_columns', detail: (issues?.meta?.missingColumns ?? []).join(',') || null });
  }

  for (const key of META_TAB_KEYS) {
    const name = TAB_NAME[key];
    const row = metaRows.find((m) => m.tab === name) ?? null;
    const gen = row ? parseMs(row.generated_at) : NaN;
    const ok = row && row.status === 'ok';
    const ageMin = Number.isFinite(gen) ? minutesBetween(gen, now) : null;
    const entry = {
      tab: name, key, status: row?.status ?? null, detail: row?.detail ?? null,
      generated_at: row?.generated_at ?? null, last_success_at: row?.last_success_at ?? null,
      source_through: row?.source_through ?? null, generatedAgeMin: ageMin, normal: false,
    };
    if (issues?.[key]?.absent) reasons.push({ tab: name, kind: 'unreadable', detail: null });
    else if ((issues?.[key]?.missingColumns?.length ?? 0) > 0) reasons.push({ tab: name, kind: 'missing_columns', detail: issues[key].missingColumns.join(',') });
    else if (!row) reasons.push({ tab: name, kind: 'no_meta_row', detail: null });
    else if (!META_STATUS.includes(row.status)) reasons.push({ tab: name, kind: 'unrecognized_status', detail: String(row.status) });
    else if (!ok) reasons.push({ tab: name, kind: row.status, detail: row.detail });
    else if (ageMin === null || ageMin > BANNER_STALE_MINUTES) reasons.push({ tab: name, kind: 'old_generated_at', detail: null });
    else entry.normal = true;
    tabs.push(entry);
  }

  const stopped = reasons.length > 0;
  const through = tabs.map((t) => parseMs(t.source_through)).filter(Number.isFinite);
  const success = tabs.map((t) => parseMs(t.last_success_at)).filter(Number.isFinite);
  const oldestThrough = through.length ? Math.min(...through) : null;
  // "last success" shown on the red banner: the oldest last_success_at (the tab that has been stopped longest).
  const oldestSuccess = success.length ? Math.min(...success) : null;

  return {
    state: stopped ? 'stopped' : 'normal',
    reasons,
    tabs,
    sourceThroughMs: oldestThrough,
    sourceThroughMinutesAgo: oldestThrough == null ? null : minutesBetween(oldestThrough, now),
    lastSuccessMs: oldestSuccess,
  };
}

/**
 * How far has the pull covered a business day? Decides "0 items" (pulled) vs "not pulled" (REQ §6, ③).
 *  complete: source_through >= end of day.   partial: reached into the day.   none: before the day started.
 */
export function dayCoverage(sourceThroughMs, store, day, now) {
  if (sourceThroughMs == null) return 'none';
  const { start, end } = businessDayWindow(day, store);
  if (sourceThroughMs >= end) return 'complete';
  if (sourceThroughMs >= start) return now < end ? 'partial_today' : 'partial_past';
  return 'none';
}

/** Interpret a count under coverage: a 0 from a not-pulled day must not be shown as "0 items". */
export function countWithCoverage(n, coverage) {
  if (coverage === 'none' || coverage === 'partial_past') return n > 0 ? { value: n, state: 'partial' } : { value: null, state: 'unpulled' };
  if (coverage === 'partial_today') return { value: n, state: n > 0 ? 'count' : 'zero_so_far' };
  return { value: n, state: n > 0 ? 'count' : 'zero' };
}
