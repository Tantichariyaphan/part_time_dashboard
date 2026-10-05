// Schedule resolution. `schedules` is the original (history); `stores.slot_times` / `daily_time` are display copies.
// If the copy and the original disagree, do NOT pick one: show "unconfirmed" (REQ §5-3).
import { addDays, parseHHMM, zonedInstant } from './time.js';

export const splitTimes = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);

/** Times in force for (store, kind) on a business day: the row with the latest valid_from that covers the day. */
export function effectiveTimes(schedules, storeId, kind, day) {
  const rows = schedules.filter((s) =>
    s.store === storeId && s.kind === kind && s.valid_from && s.valid_from <= day && (!s.valid_to || day <= s.valid_to));
  if (!rows.length) return [];
  rows.sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1));
  return splitTimes(rows[0].times);
}

/** Expected run instants for a business day. A time earlier than business_day_start falls on the next calendar date. */
export function expectedRuns(store, schedules, kind, day) {
  const start = parseHHMM(store.business_day_start);
  return effectiveTimes(schedules, store.store, kind, day).map((time) => {
    const date = parseHHMM(time) < (Number.isNaN(start) ? 0 : start) ? addDays(day, 1) : day;
    return { time, at: zonedInstant(date, time, store.timezone) };
  });
}

/** Scope: a blank `stores` column means "out of scope" (REQ §6 common rules). */
export function scopeOf(store) {
  return {
    slot: !!store.slot_times,
    daily: !!store.daily_time,
    lightCheck: !!store.text_patrol,
  };
}

const norm = (list) => [...list].sort().join(',');

/** Does the `stores` display copy match the `schedules` original for the given (current) business day? */
export function scheduleConsistency(store, schedules, day) {
  return {
    slot: norm(splitTimes(store.slot_times)) === norm(effectiveTimes(schedules, store.store, 'slot', day)),
    daily: norm(splitTimes(store.daily_time)) === norm(effectiveTimes(schedules, store.store, 'daily', day)),
  };
}

export const deadlineMin = (store, kind) => (kind === 'slot' ? store.slot_deadline_min : store.daily_deadline_min);
