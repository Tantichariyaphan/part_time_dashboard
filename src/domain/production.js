// Production machine / light-check rules. REQ §6-①, §6-⑥, TV14.
//  - production heartbeat = latest `beats` row with host = stores.production_host AND role = production
//  - a healthy standby NEVER substitutes for a stopped production machine
//  - production heartbeat older than 15 min -> red; verify=FAIL -> red
//  - light check: red only inside stores.text_patrol AND silent > 15 min counted from the LATER of
//    "last run" and "start of today's window"; outside the window -> "off hours"
import { PRODUCTION_HEARTBEAT_RED_MINUTES, LIGHT_CHECK_RED_MINUTES } from './constants.js';
import { localParts, dateString, minutesBetween, parseHHMM, parseMs, zonedInstant } from './time.js';
import { isDummyBeat } from './dummy.js';

const latest = (rows) => rows.reduce((best, r) => (!best || parseMs(r.received_at) > parseMs(best.received_at) ? r : best), null);

/** Latest beat per (host, role). `beats === null` means the Heartbeat Sheet does not exist (NOT CONNECTED). */
export function latestPerMachine(beats) {
  if (beats == null) return null;
  const real = beats.filter((b) => !isDummyBeat(b));
  const keys = [...new Set(real.map((b) => `${b.host}|${b.role}`))];
  return keys.map((k) => latest(real.filter((b) => `${b.host}|${b.role}` === k)));
}

export function machineView(beat, now) {
  const at = parseMs(beat.received_at);
  const ageMin = Number.isFinite(at) ? minutesBetween(at, now) : null;
  const isProduction = beat.role === 'production';
  const heartbeatRed = isProduction && (ageMin === null || ageMin > PRODUCTION_HEARTBEAT_RED_MINUTES);
  const verifyRed = beat.verify === 'FAIL';
  return {
    host: beat.host, role: beat.role, stores: beat.stores ? String(beat.stores).split(',').map((s) => s.trim()) : [],
    ageMin, verify: beat.verify, fail_items: beat.fail_items, chatgpt: beat.chatgpt, drive: beat.drive, g_mounted: beat.g_mounted,
    disk_free_gb: beat.disk_free_gb, clock_offset_sec: beat.clock_offset_sec,
    heartbeatRed, verifyRed, red: heartbeatRed || verifyRed,
    // Standby thresholds are not defined by the REQ: age is shown, never judged (UNCONFIRMED, notes N-06).
    ageJudged: isProduction,
  };
}

/**
 * Production machine of a store.
 * state: not_connected (no Heartbeat Sheet) | unknown (sheet exists, no matching production row) | ok | red
 */
export function storeMachine(store, beats, now) {
  if (beats == null) return { state: 'not_connected' };
  const rows = beats.filter((b) => !isDummyBeat(b) && b.host === store.production_host && b.role === 'production');
  const beat = latest(rows);
  if (!beat) return { state: 'unknown', host: store.production_host };
  const v = machineView(beat, now);
  return { state: v.red ? 'red' : 'ok', ...v, beat };
}

/** "10:00-24:00" -> {start:'10:00', end:'24:00'} or null. */
export function parseWindow(text) {
  const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(String(text ?? '').trim());
  if (!m || Number.isNaN(parseHHMM(m[1])) || Number.isNaN(parseHHMM(m[2]))) return null;
  return { start: m[1], end: m[2] };
}

/**
 * Light check (text patrol) state.
 * out_of_scope: stores.text_patrol blank.  off_hours: outside window.  not_connected / unknown: no data.  ok / red.
 */
export function lightCheck(store, beats, now) {
  if (!store.text_patrol) return { state: 'out_of_scope' };
  const win = parseWindow(store.text_patrol);
  if (!win) return { state: 'unknown', reason: 'window_unparsable' };
  const p = localParts(now, store.timezone);
  const date = dateString(p.y, p.mo, p.d);
  const startMs = zonedInstant(date, win.start, store.timezone);
  const endMs = zonedInstant(date, win.end, store.timezone); // "24:00" rolls to next midnight
  if (now < startMs || now >= endMs) return { state: 'off_hours' };
  if (beats == null) return { state: 'not_connected' };
  const machine = storeMachine(store, beats, now);
  const last = machine.beat ? parseMs(machine.beat.text_patrol_at) : NaN;
  if (!Number.isFinite(last)) return { state: 'unknown', reason: machine.state === 'unknown' ? 'no_production_beat' : 'no_text_patrol_at' };
  const ref = Math.max(last, startMs);
  const silentMin = minutesBetween(ref, now);
  return {
    state: silentMin > LIGHT_CHECK_RED_MINUTES ? 'red' : 'ok',
    lastRunMs: last, minutesAgo: minutesBetween(last, now), silentMin,
  };
}
