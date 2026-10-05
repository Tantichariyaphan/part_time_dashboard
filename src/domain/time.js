// Time and business-day logic. REQ §5-3: times stored as yyyy-MM-ddTHH:mm:ss+07:00;
// "today" is the STORE's business day (timezone + business_day_start), never the viewer's time zone (TV16).

const FMT = new Map();
function formatter(tz) {
  if (!FMT.has(tz)) {
    FMT.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return FMT.get(tz);
}

export function parseMs(iso) {
  if (iso == null || iso === '') return NaN;
  return Date.parse(iso);
}

/** Wall-clock parts of an instant in a time zone. */
export function localParts(ms, tz) {
  const o = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year, mo: o.month, d: o.day, h: o.hour, mi: o.minute, s: o.second };
}

const pad = (n) => String(n).padStart(2, '0');
export const dateString = (y, mo, d) => `${y}-${pad(mo)}-${pad(d)}`;

export function addDays(dateStr, n) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return dateString(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function tzOffsetMs(ms, tz) {
  const p = localParts(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** Instant of a wall-clock date + HH:MM in a time zone. "24:00" rolls to the next day 00:00. */
export function zonedInstant(dateStr, hhmm, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t;
}

/** "HH:MM" -> minutes since midnight (24:00 = 1440); NaN when malformed. */
export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Business day (YYYY-MM-DD) that an instant belongs to for a store. */
export function businessDayOf(ms, store) {
  const p = localParts(ms, store.timezone);
  const start = parseHHMM(store.business_day_start);
  const date = dateString(p.y, p.mo, p.d);
  if (Number.isNaN(start)) return date;
  return p.h * 60 + p.mi < start ? addDays(date, -1) : date;
}

/** [startMs, endMs) of a business day. */
export function businessDayWindow(day, store) {
  const start = store.business_day_start || '00:00';
  return {
    start: zonedInstant(day, start, store.timezone),
    end: zonedInstant(addDays(day, 1), start, store.timezone),
  };
}

/** Business days ending at `endDay`, newest first. */
export function recentDays(endDay, count) {
  return Array.from({ length: count }, (_, i) => addDays(endDay, -i));
}

/** Storage format: yyyy-MM-ddTHH:mm:ss+07:00 */
export function formatIso(ms) {
  return new Date(ms + 7 * 3600000).toISOString().slice(0, 19) + '+07:00';
}

/** Clock text HH:MM in the storage zone (+07:00). Display zone for other stores: UNCONFIRMED (Q-12/Q-30). */
export function clock(ms) {
  if (!Number.isFinite(ms)) return null;
  return formatIso(ms).slice(11, 16);
}

export function minutesBetween(fromMs, toMs) {
  return Math.floor((toMs - fromMs) / 60000);
}
