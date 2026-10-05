// Run (patrol / daily) status logic. REQ §5-3, §6.
//  - every scheduled run must have a row; a missing row after (scheduled + deadline) = "no_row" (dark red, never dropped)
//  - before the deadline = "not_due" (grey)
//  - a row still `running` past its deadline becomes `unknown` (TV25)
//  - a store/kind that is out of scope (blank `stores` column) is not counted as missing
import { RUN_STATUS } from '../contract/enums.js';
import { businessDayOf, parseMs } from './time.js';
import { deadlineMin, expectedRuns, scheduleConsistency, scopeOf } from './schedules.js';

/** Display status keys: the 7 REQ statuses plus two derived: `not_due`, `no_row`. */
export function effectiveRunStatus(row, store, now) {
  if (!RUN_STATUS.includes(row.status)) return { status: 'unknown', derived: 'unrecognized' };
  if (row.status === 'running') {
    const dl = deadlineMin(store, row.kind);
    const at = parseMs(row.scheduled_at);
    if (dl != null && Number.isFinite(at) && now > at + dl * 60000) return { status: 'unknown', derived: 'deadline_passed_running' };
  }
  return { status: row.status, derived: null };
}

/**
 * All runs of one store for one business day, newest first.
 * @returns {{items: object[], unconfirmedSchedule: {slot:boolean, daily:boolean}}}
 */
export function dayRuns({ store, schedules, runs, day, now, currentDay }) {
  const scope = scopeOf(store);
  const consistency = day === currentDay ? scheduleConsistency(store, schedules, day) : { slot: true, daily: true };
  const unconfirmedSchedule = { slot: scope.slot && !consistency.slot, daily: scope.daily && !consistency.daily };
  const mine = runs.filter((r) => r.store === store.store);
  const used = new Set();
  const items = [];

  for (const kind of ['slot', 'daily']) {
    if (!scope[kind] && !expectedRuns(store, schedules, kind, day).length) continue;
    if (unconfirmedSchedule[kind]) continue; // do not pick a schedule on our own
    for (const e of expectedRuns(store, schedules, kind, day)) {
      const row = mine.find((r) => r.kind === kind && parseMs(r.scheduled_at) === e.at);
      if (row) {
        used.add(row.run_id);
        const eff = effectiveRunStatus(row, store, now);
        items.push({ kind, scheduledMs: e.at, time: e.time, row, status: eff.status, derived: eff.derived });
      } else {
        const dl = deadlineMin(store, kind);
        const due = now >= e.at + (dl ?? 0) * 60000;
        items.push({ kind, scheduledMs: e.at, time: e.time, row: null, status: due ? 'no_row' : 'not_due', derived: null });
      }
    }
  }
  // Rows that exist for this business day but were not expected (e.g. schedule history gap) are shown as they are.
  for (const row of mine) {
    if (used.has(row.run_id)) continue;
    const at = parseMs(row.scheduled_at);
    if (!Number.isFinite(at) || businessDayOf(at, store) !== day) continue;
    const eff = effectiveRunStatus(row, store, now);
    items.push({ kind: row.kind, scheduledMs: at, time: null, row, status: eff.status, derived: eff.derived });
  }
  items.sort((a, b) => b.scheduledMs - a.scheduledMs);
  return { items, unconfirmedSchedule };
}

/** Statuses that count in the success-rate denominator: scheduled runs, excluding in-progress / not yet due. */
export const IN_PROGRESS = new Set(['running', 'not_due']);
export const SUCCESS = new Set(['ok', 'silent_ok', 'late']);
