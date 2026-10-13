// READ-ONLY analysis of `心拍.結果` for the run-status proposal (docs/run-status-proposal.md). Nothing is written anywhere.
//
//   Live copy (the dashboard's own reader account and checks; GET only):
//     node --env-file=.env scripts/analyze-heartbeat.js [--days 14] [--json heartbeat-counts.json]
//   A local CSV export (e.g. the client's 2026-10-05 sample, kept git-ignored under docs/sample data_*/):
//     node scripts/analyze-heartbeat.js --csv "<dir>/心拍.csv" [--sends "<dir>/送信ログ.csv"] [--tz Asia/Bangkok] [--stores config/stores.json] [--store NIKUSHO_BANGNA]
//
// Prints counts, classes, times, digit-masked shapes (free text replaced by <text>) and the PROPOSED per-slot reading.
// Never prints 結果 free text, message text, names, recipient labels/keys, ids or key material.
// The proposal is NOT used by the dashboard: run status stays "状態未判定" until the client approves (Q-49).
import { COPY_TAB } from '../src/contract/copyContract.js';
import { parseCopyTime } from '../src/adapters/copy/validate.js';
import { sendResult } from '../src/adapters/copy/transform.js';
import { addDays, businessDayOf, dateString, formatIso, localParts } from '../src/domain/time.js';
import { expectedRuns, deadlineMin } from '../src/domain/schedules.js';
import { args, config, count, failure, isMain, readCsvFile, readLive, records, sortedEntries, table, writeJson } from './lib/diag.js';
import { classOf, parseResult, proposeSlot, sendWord, shapeOf } from './lib/heartbeatPatterns.js';

/** Client fact (connection-spec §0-14): from this instant MEAT/IN questions and replies are sent by the 5-minute polling loop. */
export const POLLING_CHANGE_AT = Date.parse('2026-10-05T23:36:00+07:00');

export function analyze({ heartbeatRows, sendRows, tz, store, schedules, days = null, label }) {
  const hhmm = (ms) => { const p = localParts(ms, tz); return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`; };
  const dayOf = (ms) => { const p = localParts(ms, tz); return dateString(p.y, p.mo, p.d); };
  const rows = heartbeatRows.map((r) => {
    const at = parseCopyTime(r['時刻'], tz);
    const parsed = parseResult(r['結果']);
    return { at, parsed, cls: classOf(parsed), shape: shapeOf(r['結果']), sendMeat: sendWord(r['送信MEAT'] ?? null), sendIn: sendWord(r['送信IN'] ?? null), gap: String(r['gap分'] ?? '').trim() };
  });
  const timed = rows.filter((r) => Number.isFinite(r.at)).sort((a, b) => a.at - b.at);
  const out = { label, rows: rows.length, unreadableTime: rows.length - timed.length };
  if (!timed.length) return out;
  out.first = formatIso(timed[0].at);
  out.last = formatIso(timed[timed.length - 1].at);

  const classes = new Map(); const shapes = new Map(); const stops = new Map(); const owners = new Map(); const unknownKeys = new Map();
  const byHour = new Map(); const byMinute = new Map(); const sendsByClass = new Map(); const gaps = new Map();
  let noAi = 0; let shadow = 0; let unparsed = 0;
  for (const r of timed) {
    count(classes, r.cls); count(shapes, r.shape);
    if (r.parsed.stop) count(stops, r.parsed.stop);
    if (r.parsed.owner) count(owners, r.parsed.owner);
    for (const k of r.parsed.unknownKeys) count(unknownKeys, k);
    if (r.parsed.unanalysed?.noAi) noAi += 1;
    if (r.parsed.ruleShadow !== null) shadow += 1;
    unparsed += r.parsed.unparsedSegments;
    const p = localParts(r.at, tz);
    count(byHour, `${String(p.h).padStart(2, '0')}|${r.cls}`);
    count(byMinute, String(p.mi).padStart(2, '0'));
    count(sendsByClass, `${r.cls}|${r.sendMeat ?? '(blank)'}|${r.sendIn ?? '(blank)'}`);
    count(gaps, /^\d+$/.test(r.gap) ? (Number(r.gap) <= 61 && Number(r.gap) >= 59 ? '59-61' : Number(r.gap) < 59 ? '<59' : '>61') : r.gap === '' ? '(blank)' : '<other>');
  }
  Object.assign(out, {
    classes: Object.fromEntries(classes), shapes: sortedEntries(shapes), stopCodes: Object.fromEntries(stops), ownerCodes: Object.fromEntries(owners),
    unknownKeys: Object.fromEntries(unknownKeys), rowsWithNoAiMarker: noAi, rowsWithRuleShadow: shadow, unparsedSegments: unparsed,
    hourByClass: Object.fromEntries(byHour), minuteOfHour: sortedEntries(byMinute).slice(0, 6), sendColumnsByClass: Object.fromEntries(sendsByClass),
    gapColumn: Object.fromEntries(gaps),
  });

  // cadence: intervals between consecutive rows (minutes) and gaps over 70 minutes (time only)
  const intervals = new Map(); const longGaps = [];
  for (let i = 1; i < timed.length; i += 1) {
    const m = Math.round((timed[i].at - timed[i - 1].at) / 60000);
    count(intervals, m <= 10 ? '<=10' : m <= 55 ? '11-55' : m <= 65 ? '56-65' : m <= 70 ? '66-70' : '>70');
    if (m > 70) longGaps.push({ from: `${dayOf(timed[i - 1].at)} ${hhmm(timed[i - 1].at)}`, to: `${dayOf(timed[i].at)} ${hhmm(timed[i].at)}`, minutes: m });
  }
  out.intervals = Object.fromEntries(intervals);
  out.longGaps = longGaps;

  // send-log cross-check: a heartbeat row saying 送 for MEAT/IN vs 送信ログ OK rows to that group within +-2 minutes
  const sends = sendRows.map((s) => ({ at: parseCopyTime(s['日時'], tz), cls: String(s['宛先の群'] ?? s['宛先'] ?? '').trim(), result: sendResult(s['結果']), reply: String(Object.entries(s).find(([k]) => k.startsWith('返した元の発言'))?.[1] ?? '').trim() !== '' }))
    .filter((s) => Number.isFinite(s.at));
  const near = (at, cls) => sends.filter((s) => s.cls === cls && !s.reply && Math.abs(s.at - at) <= 120000).length;
  const xcheck = new Map();
  if (sends.length) {
    for (const r of timed) {
      for (const [col, cls] of [['sendMeat', 'MEAT'], ['sendIn', 'IN']]) {
        const w = r[col];
        if (w !== '送' && w !== '無言') continue;
        count(xcheck, `${cls} ${w}: ${near(r.at, cls) > 0 ? 'send-log row within 2 min' : 'no send-log row within 2 min'}`);
      }
    }
  }
  out.sendLogCrossCheck = sends.length ? Object.fromEntries(xcheck) : 'not available (no 送信ログ given)';

  // per scheduled slot / daily run: PROPOSED reading (not used by the dashboard)
  const lastDay = businessDayOf(timed[timed.length - 1].at, store);
  const firstDay = businessDayOf(timed[0].at, store);
  const dayList = [];
  for (let d = lastDay; d >= firstDay && (days === null || dayList.length < days); d = addDays(d, -1)) dayList.push(d);
  const slotRows = []; const proposedCount = new Map();
  for (const day of [...dayList].reverse()) {
    for (const run of expectedRuns(store, schedules, 'slot', day)) {
      const end = run.at + deadlineMin(store, 'slot') * 60000;
      if (run.at > timed[timed.length - 1].at) continue; // not yet observable in this read
      const all = timed.filter((r) => r.at > run.at && r.at <= end);
      const res = all.filter((r) => r.cls !== 'scheduled_off' && r.cls !== 'blank');
      const prop = proposeSlot(res.map((r) => ({ class: r.cls, parsed: r.parsed, sendMeat: r.sendMeat, sendIn: r.sendIn })), all.length, { afterPollingChange: run.at >= POLLING_CHANGE_AT });
      count(proposedCount, prop.proposed);
      slotRows.push([day, run.time, all.length, res.map((r) => r.cls).join(',') || '-', res.length === 1 ? `+${Math.round((res[0].at - run.at) / 60000)}m` : '-',
        res.length === 1 ? `${res[0].sendMeat ?? '-'}/${res[0].sendIn ?? '-'}` : '-', prop.proposed, prop.basis]);
    }
  }
  out.slots = slotRows; out.slotProposalCounts = Object.fromEntries(proposedCount);

  const dailyRows = [];
  if (sends.length) {
    for (const day of [...dayList].reverse()) {
      for (const run of expectedRuns(store, schedules, 'daily', day)) {
        if (run.at > timed[timed.length - 1].at) continue;
        const end = run.at + deadlineMin(store, 'daily') * 60000;
        const inWin = (cls) => sends.filter((s) => s.cls === cls && s.at > run.at && s.at <= end);
        const owner = inWin('OWNER'); const all = inWin('ALL');
        const okOwner = owner.filter((s) => s.result === 'sent');
        const dayOwner = sends.filter((s) => s.cls === 'OWNER' && businessDayOf(s.at, store) === day).length;
        dailyRows.push([day, run.time, owner.length, okOwner.length ? `+${Math.round((okOwner[0].at - run.at) / 60000)}m` : '-', all.length, dayOwner,
          okOwner.length ? 'owner_send_in_window' : 'unconfirmed']);
      }
    }
  }
  out.daily = dailyRows;
  return out;
}

function print(o) {
  console.log(`Source: ${o.label}`);
  console.log(`Rows: ${o.rows}   unreadable 時刻: ${o.unreadableTime}${o.first ? `   range ${o.first} .. ${o.last}` : ''}`);
  if (!o.first) return;
  console.log('\n[1] 結果 classes (scheduled_off / ai_result / stop / other / blank)');
  console.log(table(['class', 'rows'], sortedEntries(new Map(Object.entries(o.classes)))));
  console.log('\n[2] 結果 shapes (digits -> #, free text -> <text>)');
  console.log(table(['rows', 'shape'], o.shapes.map(([s, n]) => [n, s])));
  console.log(`\n    STOP codes: ${JSON.stringify(o.stopCodes)}   owner codes: ${JSON.stringify(o.ownerCodes)}   unknown keys: ${JSON.stringify(o.unknownKeys)}`);
  console.log(`    rows with 未分析 (AI無): ${o.rowsWithNoAiMarker}   rows with 規則影N件(送らない): ${o.rowsWithRuleShadow}   unparsed segments: ${o.unparsedSegments}`);
  console.log('\n[3] hour of day x class (copy time zone)');
  const hours = [...new Set(Object.keys(o.hourByClass).map((k) => k.split('|')[0]))].sort();
  const cls = ['scheduled_off', 'ai_result', 'stop', 'other', 'blank'];
  console.log(table(['hour', ...cls], hours.map((h) => [h, ...cls.map((c) => o.hourByClass[`${h}|${c}`] ?? '')])));
  console.log(`    most common minute of the hour: ${o.minuteOfHour.map(([m, n]) => `:${m} x${n}`).join(', ')}`);
  console.log(`    interval to previous row (min): ${JSON.stringify(o.intervals)}   gap分 column: ${JSON.stringify(o.gapColumn)}`);
  console.log(`    gaps over 70 min: ${o.longGaps.length}${o.longGaps.length ? `  (${o.longGaps.slice(0, 15).map((g) => `${g.from}->${g.to} ${g.minutes}m`).join('; ')}${o.longGaps.length > 15 ? '; ...' : ''})` : ''}`);
  console.log('\n[4] 送信MEAT / 送信IN by class');
  console.log(table(['class', '送信MEAT', '送信IN', 'rows'], sortedEntries(new Map(Object.entries(o.sendColumnsByClass))).map(([k, n]) => [...k.split('|'), n])));
  console.log(`    cross-check with 送信ログ (non-reply rows to the same group within 2 min): ${JSON.stringify(o.sendLogCrossCheck)}`);
  console.log('\n[5] PROPOSED reading per scheduled patrol slot (window = scheduled .. +slot_deadline_min). NOT used by the dashboard.');
  console.log(table(['business day', 'slot', 'rows in window', 'result rows', 'offset', 'MEAT/IN', 'proposed', 'basis'], o.slots));
  console.log(`    proposed counts: ${JSON.stringify(o.slotProposalCounts)}`);
  if (o.daily.length) {
    console.log('\n[6] Daily report evidence (送信ログ OWNER / ALL rows in daily_time .. +daily_deadline_min). NOT used by the dashboard.');
    console.log(table(['business day', 'daily', 'OWNER rows', 'first OK', 'ALL rows', 'OWNER rows that day', 'reading'], o.daily));
  }
}

if (isMain(import.meta.url)) {
  const a = args();
  try {
    let input;
    if (a.csv) {
      const cfg = config({ ...(a.stores ? { NIKUSHO_STORES_FILE: a.stores } : {}), ...(process.env.NIKUSHO_STORES_FILE || a.stores ? {} : { NIKUSHO_STORES_FILE: 'config/stores.json' }),
        NIKUSHO_COPY_STORE: a.store ?? process.env.NIKUSHO_COPY_STORE ?? 'NIKUSHO_BANGNA', NIKUSHO_COPY_TIMEZONE: a.tz ?? process.env.NIKUSHO_COPY_TIMEZONE ?? 'Asia/Bangkok' });
      const store = cfg.adapter.stores.find((s) => s.store === cfg.adapter.store);
      input = { heartbeatRows: records(readCsvFile(a.csv)), sendRows: a.sends ? records(readCsvFile(a.sends)) : [], tz: cfg.adapter.timezone, store, schedules: cfg.adapter.schedules,
        label: `LOCAL CSV EXPORT (not the live copy) - times read in ${cfg.adapter.timezone}${a.tz ? '' : ' (assumed: pass --tz to change)'}` };
    } else {
      const live = await readLive();
      const store = live.cfg.adapter.stores.find((s) => s.store === live.cfg.adapter.store);
      if (!live.cfg.adapter.timezone) console.log('Note: NIKUSHO_COPY_TIMEZONE is not set: only ISO times with an offset are readable.');
      input = { heartbeatRows: records(live.copy.tables[COPY_TAB.heartbeat]), sendRows: records(live.copy.tables[COPY_TAB.sendLog]), tz: live.cfg.adapter.timezone ?? store.timezone,
        store, schedules: live.cfg.adapter.schedules, label: `LIVE View-only Copy, read ${formatIso(live.copyReadAt)} (reader account, GET only)` };
    }
    const o = analyze({ ...input, days: a.days ? Number(a.days) : null });
    print(o);
    writeJson(a.json, o);
  } catch (e) {
    console.error(`analyze-heartbeat: ${failure(e)}`);
    process.exit(1);
  }
}
