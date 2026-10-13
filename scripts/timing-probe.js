// READ-ONLY freshness / update-timing probe. Polls the client's View-only Copy (and the Heartbeat Sheet) with the dashboard's
// own reader account, the way the server does, and records timestamps at every stage it can see. Nothing is written.
//
//   node --env-file=.env scripts/timing-probe.js [--minutes 60] [--interval 60] [--json timing.json]
//   (Ctrl+C prints the summary of what was collected so far)
//
// Stages visible to PIATEC (the Original Records are not: REQ §7-2):
//   row time        日時 / 送信時刻 / 時刻 written in the row (when the event happened; written by the client's GAS)
//   copy read       copy meta.last_read_at  (client Copy Script finished reading the Original Records)
//   copy written    copy meta.updated_at
//   reader sees     the first probe in which a row is present (this script, every --interval seconds)
//   dashboard       the server's adapter (same code, own read, at most one read per minute) and the banner it would show
// The dashboard can lag "reader sees" by at most its read interval (60 s) plus page load; that bound is stated, not measured.
// Prints times, counts, minutes, 元の行番号 and codes only.
import { COPY_TAB, ROW_ID } from '../src/contract/copyContract.js';
import { createCopyAdapter } from '../src/adapters/copy/copyAdapter.js';
import { parseCopyTime } from '../src/adapters/copy/validate.js';
import { buildContext, publicFreshness } from '../src/viewmodels/context.js';
import { formatIso } from '../src/domain/time.js';
import { TAB_NAME } from '../src/contract/enums.js';
import { BANNER_STALE_MINUTES, SOURCE_TO_SCREEN_MAX_MINUTES, STOP_DETECTION_MAX_MINUTES } from '../src/domain/constants.js';
import { createLiveReaders } from '../server/index.js';
import { args, failure, isMain, records, table, writeJson } from './lib/diag.js';

const TIME_COL = { [COPY_TAB.log]: '日時', [COPY_TAB.sendLog]: '日時', [COPY_TAB.questions]: '送信時刻', [COPY_TAB.heartbeat]: '時刻' };
const DATA_TABS = Object.keys(TIME_COL);
const minutes = (ms) => (ms == null || !Number.isFinite(ms) ? null : Math.round(ms / 6000) / 10);

/** One probe from one raw read + the dashboard's view of the same moment. Pure: exported for tests. */
export function observe({ read, at, tz, ctx, seen, firstProbe }) {
  const o = { at: formatIso(at), tabs: {}, newRows: [], issues: [] };
  const meta = records(read.tables[COPY_TAB.meta]);
  for (const tab of DATA_TABS) {
    const m = meta.find((x) => String(x.tab).trim() === tab);
    const recs = records(read.tables[tab]);
    const lastRead = m ? parseCopyTime(m.last_read_at, tz) : NaN;
    const updated = m ? parseCopyTime(m.updated_at, tz) : NaN;
    let newest = NaN;
    for (const r of recs) {
      const t = parseCopyTime(r[TIME_COL[tab]], tz);
      if (Number.isFinite(t) && !(t <= newest)) newest = t;
      const id = `${tab}#${String(r[ROW_ID]).trim()}`;
      if (!seen.has(id)) {
        seen.set(id, at);
        if (!firstProbe && Number.isFinite(t) && at - t < 3 * 3600000) o.newRows.push({ tab, row: String(r[ROW_ID]).trim(), rowTime: formatIso(t), readerSeesAfterMin: minutes(at - t), copyReadAfterMin: Number.isFinite(lastRead) ? minutes(lastRead - t) : null });
      }
    }
    o.tabs[tab] = { rows: recs.length, lastReadAt: Number.isFinite(lastRead) ? formatIso(lastRead) : null, updatedAt: Number.isFinite(updated) ? formatIso(updated) : null,
      status: m ? String(m.status ?? '').trim() : null, newestRow: Number.isFinite(newest) ? formatIso(newest) : null, copyAgeMin: Number.isFinite(lastRead) ? minutes(at - lastRead) : null };
    if (Number.isFinite(newest) && Number.isFinite(lastRead) && newest > lastRead + 60000) o.issues.push(`${tab}: newest row time is later than copy last_read_at (time zone or clock?)`);
  }
  const f = publicFreshness(ctx);
  o.dashboard = { banner: f.state, reasons: f.reasons.map((r) => `${r.tab}:${r.kind}`), sourceThrough: f.sourceThrough, minutesAgo: f.sourceThroughMinutesAgo,
    readAt: ctx.sources?.copy?.readAt ?? null, sourceState: ctx.sources?.copy?.state ?? null, heartbeatState: ctx.sources?.heartbeat?.state ?? null };
  const ages = DATA_TABS.map((t) => o.tabs[t].copyAgeMin).filter((x) => x !== null);
  const oldest = ages.length ? Math.max(...ages) : null;
  // expected banner from the RAW read: stopped when any copy tab's last read is older than the threshold or its status is not ok
  const expectStopped = oldest === null || oldest > BANNER_STALE_MINUTES || DATA_TABS.some((t) => o.tabs[t].status !== 'ok');
  o.expectedBanner = expectStopped ? 'stopped' : 'normal';
  // Did the dashboard's own read see the same copy version as this raw read? (Dashboard meta generated_at = copy last_read_at.)
  const SCREEN_TAB = { [COPY_TAB.log]: TAB_NAME.messages, [COPY_TAB.sendLog]: TAB_NAME.sends, [COPY_TAB.questions]: TAB_NAME.questions, [COPY_TAB.heartbeat]: TAB_NAME.runs };
  o.sameCopyVersion = DATA_TABS.every((t) => {
    const m = ctx.screen.meta.find((x) => x.tab === SCREEN_TAB[t]);
    return !!m && !!o.tabs[t].lastReadAt && Date.parse(m.generated_at) === Date.parse(o.tabs[t].lastReadAt);
  });
  // Same copy version -> the banner must be the one the raw read implies. A different version (the copy changed between the
  // two reads, seconds apart) is reported, not judged.
  o.bannerConsistent = !o.sameCopyVersion || o.expectedBanner === o.dashboard.banner;
  return o;
}

export function summarize(probes, { intervalSec }) {
  const lastReads = [...new Set(probes.map((p) => p.tabs[COPY_TAB.log]?.lastReadAt).filter(Boolean))].map((x) => Date.parse(x)).sort((a, b) => a - b);
  const cadence = lastReads.slice(1).map((t, i) => minutes(t - lastReads[i]));
  const delays = probes.flatMap((p) => p.newRows);
  const byTab = {};
  for (const d of delays) (byTab[d.tab] ??= []).push(d.readerSeesAfterMin);
  const stat = (xs) => (xs.length ? { n: xs.length, min: Math.min(...xs), median: [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)], max: Math.max(...xs) } : { n: 0 });
  const maxAge = Math.max(...probes.map((p) => Math.max(...Object.values(p.tabs).map((t) => t.copyAgeMin ?? 0))));
  return {
    probes: probes.length, from: probes[0]?.at ?? null, to: probes[probes.length - 1]?.at ?? null, intervalSec,
    copyReadCadenceMin: stat(cadence), distinctCopyReads: lastReads.length,
    newRowDelayMin: Object.fromEntries(Object.entries(byTab).map(([k, xs]) => [k, stat(xs)])),
    rowsOverTenMinutes: delays.filter((d) => d.readerSeesAfterMin + intervalSec / 60 + 1 > SOURCE_TO_SCREEN_MAX_MINUTES).map((d) => `${d.tab}#${d.row} ${d.readerSeesAfterMin}m`),
    maxCopyAgeMin: Number.isFinite(maxAge) ? maxAge : null,
    bannerStates: probes.reduce((m, p) => ({ ...m, [p.dashboard.banner]: (m[p.dashboard.banner] ?? 0) + 1 }), {}),
    bannerInconsistent: probes.filter((p) => !p.bannerConsistent).map((p) => p.at),
    differentCopyVersion: probes.filter((p) => !p.sameCopyVersion).length,
    stopObserved: probes.some((p) => p.expectedBanner === 'stopped'),
    issues: [...new Set(probes.flatMap((p) => p.issues))],
    thresholds: { sourceToScreenMin: SOURCE_TO_SCREEN_MAX_MINUTES, stopDetectionMin: STOP_DETECTION_MAX_MINUTES, bannerStaleMin: BANNER_STALE_MINUTES },
  };
}

export function printProbe(p) {
  const log = p.tabs[COPY_TAB.log];
  const nr = p.newRows.length ? p.newRows.map((d) => `${d.tab}#${d.row}:${d.readerSeesAfterMin}m`).join(' ') : '-';
  console.log([p.at.slice(11, 19), `copy read ${log.lastReadAt?.slice(11, 19) ?? '-'} (age ${log.copyAgeMin ?? '-'}m)`, `newest ログ ${log.newestRow ? log.newestRow.slice(5, 19).replace('T', ' ') : '-'}`,
    `banner ${p.dashboard.banner}${p.dashboard.minutesAgo != null ? ` ${p.dashboard.minutesAgo}m` : ''}`, p.bannerConsistent ? '' : 'BANNER?', `new: ${nr}`].join(' | '));
}

export function printSummary(s) {
  console.log('\n==== Summary (evidence for 10-minute delivery / 20-minute stop detection; see limits below)');
  console.log(table(['item', 'value'], [
    ['window', `${s.from} .. ${s.to} (${s.probes} probes every ${s.intervalSec}s)`],
    ['distinct copy reads seen (ログ meta.last_read_at)', s.distinctCopyReads],
    ['copy read cadence (min)', JSON.stringify(s.copyReadCadenceMin)],
    ['new rows: row time -> visible to reader (min)', JSON.stringify(s.newRowDelayMin)],
    ['rows possibly over 10 min incl. probe + dashboard read interval', s.rowsOverTenMinutes.length ? s.rowsOverTenMinutes.join(', ') : 'none'],
    ['max copy age seen (min)', s.maxCopyAgeMin],
    ['dashboard banner states', JSON.stringify(s.bannerStates)],
    ['banner inconsistent with raw read (same copy version)', s.bannerInconsistent.length ? s.bannerInconsistent.join(', ') : 'none'],
    ['probes where the dashboard read another copy version', s.differentCopyVersion],
    ['a stop was observed in the window', s.stopObserved ? 'yes' : 'no (stop detection NOT exercised)'],
    ['timestamp issues', s.issues.length ? s.issues.join('; ') : 'none'],
  ]));
  console.log('Limits: the Original Records are not visible, so "row time" is the event time written in the row, not the moment the row was');
  console.log('appended. The dashboard read interval (<= 60 s) and page load are added as a bound, not measured. One window is one sample:');
  console.log('TV9 needs 3 consecutive days; TV19 / TV21 need a deliberate stop on a test copy and the Takatsuji notice (not built).');
}

if (isMain(import.meta.url)) {
  const a = args();
  const intervalSec = Math.max(60, Number(a.interval ?? 60)); // never faster than the dashboard's own read limit
  const endAt = Date.now() + Math.max(1, Number(a.minutes ?? 60)) * 60000;
  const probes = [];
  let stop = false;
  process.on('SIGINT', () => { stop = true; });
  try {
    const { cfg, copyReader, heartbeatReader } = createLiveReaders(process.env);
    if (!copyReader.connected) throw Object.assign(new Error('not connected'), { code: copyReader.reason });
    const tz = cfg.adapter.timezone;
    // the dashboard's path: the server's adapter with the real readers (own reads, 60 s read interval)
    const dashboard = createCopyAdapter({ config: cfg.adapter, copyReader, heartbeatReader, log: () => {} });
    const seen = new Map();
    console.log(`timing-probe: every ${intervalSec}s until ${formatIso(endAt)} (Ctrl+C to stop early). Read-only.`);
    while (!stop && Date.now() < endAt) {
      const at = Date.now();
      const read = await copyReader.read();
      const ctx = buildContext(await dashboard.load());
      const p = observe({ read, at, tz, ctx, seen, firstProbe: probes.length === 0 });
      probes.push(p);
      printProbe(p);
      const wait = intervalSec * 1000 - (Date.now() - at);
      for (let t = 0; t < wait && !stop; t += 1000) await new Promise((r) => setTimeout(r, Math.min(1000, wait - t)));
    }
    const s = summarize(probes, { intervalSec });
    printSummary(s);
    writeJson(a.json, { summary: s, probes });
  } catch (e) {
    console.error(`timing-probe: ${failure(e)}`);
    if (probes.length) printSummary(summarize(probes, { intervalSec }));
    process.exit(1);
  }
}
