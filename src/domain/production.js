// Production machine / light-check rules. REQ §6-①, §6-⑥, TV14.
//  - production heartbeat = latest `beats` row with host = stores.production_host AND role = production
//  - a healthy standby NEVER substitutes for a stopped production machine
//  - production heartbeat older than 15 min -> red; verify=FAIL -> red
//  - light check: red only inside stores.text_patrol AND silent > 15 min counted from the LATER of
//    "last run" and "start of today's window"; outside the window -> "off hours"
import { PRODUCTION_HEARTBEAT_RED_MINUTES, LIGHT_CHECK_RED_MINUTES, FIVE_MIN_STOP_MINUTES } from './constants.js';
import { localParts, dateString, formatIso, minutesBetween, parseHHMM, parseMs, zonedInstant } from './time.js';
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
    state: silentMin > LIGHT_CHECK_RED_MINUTES ? 'red' : 'ok', // REQ TV14: red after 15 min (unchanged)
    // client rules 2026-10-21 §4: over 15 min = 遅延／要確認, over 20 min = stop detection. Display only: `ok` here never means
    // the 5-min patrol succeeded - only that text_patrol_at (last problem-free run) is recent.
    stopDetected: silentMin > FIVE_MIN_STOP_MINUTES,
    lastRunMs: last, lastRunAt: formatIso(last), minutesAgo: minutesBetween(last, now), silentMin,
  };
}

/**
 * 5-min patrol with the client's per-run evidence (client rules 2026-10-21 §4). Without the evidence (`patrol === null`)
 * this is exactly lightCheck() (last-run time from beats.text_patrol_at only).
 * With it, the latest row of the PRODUCTION host inside 10:00-24:00 decides:
 *   gap > 15 min -> red (遅延／要確認), > 20 min -> red + stopDetected;
 *   send=true, issues=0, audit_issues=0, google_beat ok AND owner=new -> `confirmed` (動作確認, for that run only);
 *   any of those not met -> `issue` (要確認); owner missing / not `new` -> `owner_unconfirmed` (担当未確認, never success).
 * Standby rows and other hosts are never used. Nothing here is a success rate.
 */
export function fiveMinCheck(store, patrol, beats, now) {
  const base = lightCheck(store, beats, now);
  if (patrol == null) return { ...base, evidence: false };
  if (base.state === 'out_of_scope' || base.state === 'off_hours' || (base.state === 'unknown' && base.reason === 'window_unparsable')) return { ...base, evidence: true };
  const win = parseWindow(store.text_patrol);
  const p = localParts(now, store.timezone);
  const startMs = zonedInstant(dateString(p.y, p.mo, p.d), win.start, store.timezone);
  // the client's run_fast_patrol is the production machine's own record (no host column): host null = production. Rows the
  // client marks outside_hours are not runs inside the window.
  const rows = patrol.filter((r) => (r.host == null || r.host === store.production_host) && r.status !== 'outside_hours'
    && Number.isFinite(parseMs(r.at)) && parseMs(r.at) <= now);
  const last = rows.reduce((best, r) => (!best || parseMs(r.at) > parseMs(best.at) ? r : best), null);
  if (!last) return { state: 'unknown', reason: 'no_production_patrol_row', evidence: true };
  const lastMs = parseMs(last.at);
  const silentMin = minutesBetween(Math.max(lastMs, startMs), now);
  const out = { evidence: true, lastRunMs: lastMs, lastRunAt: formatIso(lastMs), minutesAgo: minutesBetween(lastMs, now), silentMin,
    stopDetected: silentMin > FIVE_MIN_STOP_MINUTES, issues: last.issues, audit_issues: last.audit_issues };
  if (silentMin > LIGHT_CHECK_RED_MINUTES) return { ...out, state: 'red' };
  // the client's status decides (ok = send / issues / audit_issues / google_beat all clean, definition 2/4); never upgraded
  const clean = (last.status == null || last.status === 'ok') && last.send !== false && last.issues !== null && last.issues === 0
    && last.audit_issues === 0 && last.google_beat === true;
  if (!clean) return { ...out, state: 'issue' };
  if (last.owner !== 'new') return { ...out, state: 'owner_unconfirmed' };
  return { ...out, state: 'confirmed' };
}
