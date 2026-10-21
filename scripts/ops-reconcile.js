// READ-ONLY operational reconciliation for ONE business day, per the client rules of 2026-10-21 (1/7 - 7/7).
//
//   node --env-file=.env scripts/ops-reconcile.js --day 2026-10-20 [--json "Claude outputs\ops-1020.json"]
//   (npm run diag:ops -- --day 2026-10-20)
//
// For each of the five separate states it prints what the dashboard can see and what it shows, and names the evidence the
// rules require that the dashboard cannot read (those stay 未確認 - this script never turns a gap into a result).
//   1 データ更新      copy meta (last_read_at, status) per tab
//   2 機械の確認      production beats on the day (count, PASS/FAIL, first/last); standby rows are counted apart, never used
//   3 定時 LINE 読取  12/17/22: screen status; GAS 心拍 rows in (T, T+deadline] as fixed codes only (auxiliary, rules §3)
//   4 5 分巡回        silence seen at each production beat inside 10:00-24:00 (same rule as the screen): max, >15, >20
//   5 日次配送        screen status; 送信ログ rows in [D+1 00:00, D+1 deadline+60] by 宛先の群 code and result code (times only)
// Prints counts, times and fixed codes only - never message text, names, recipient labels/keys, ids or key material.
// Sends nothing, writes nothing to any spreadsheet.
import { COPY_TAB } from '../src/contract/copyContract.js';
import { createCopyAdapter } from '../src/adapters/copy/copyAdapter.js';
import { parseCopyTime } from '../src/adapters/copy/validate.js';
import { sendResult } from '../src/adapters/copy/transform.js';
import { buildContext, runOpts, runStatusUnconfirmedFor } from '../src/viewmodels/context.js';
import { dayRuns } from '../src/domain/runs.js';
import { deadlineMin } from '../src/domain/schedules.js';
import { addDays, businessDayOf, formatIso, parseMs, zonedInstant } from '../src/domain/time.js';
import { fiveMinCheck, parseWindow } from '../src/domain/production.js';
import { LIGHT_CHECK_RED_MINUTES, FIVE_MIN_STOP_MINUTES } from '../src/domain/constants.js';
import { args, count, failure, isMain, readLive, records, table, writeJson } from './lib/diag.js';

const MIN = 60000;
/** A reason is printed only when it is a short code; client free text is never printed by this script. */
const codeOnly = (r) => (r == null ? null : /^[a-z0-9_=.:-]{1,40}$/i.test(String(r)) ? String(r) : '(text, see the screen)');
const hm = (ms) => (Number.isFinite(ms) ? formatIso(ms).slice(11, 16) : null);
const mdhm = (ms) => (Number.isFinite(ms) ? `${formatIso(ms).slice(5, 10)} ${formatIso(ms).slice(11, 16)}` : null);

/** Fixed codes in a GAS 心拍 結果 (no free text): which of the documented markers are present. */
export function heartbeatCodes(text) {
  const t = String(text ?? '');
  const codes = [];
  if (/slot-readonly/.test(t)) codes.push('AI=slot-readonly');
  if (/fast-patrol/.test(t)) codes.push('ROUTE=fast-patrol');
  if (/scheduled-off/.test(t)) codes.push('AI=scheduled-off');
  if (/max-read/.test(t)) codes.push('AI=max-read');
  const stop = /STOP=([a-z0-9_-]{1,40})/i.exec(t);
  if (stop) codes.push(`STOP=${stop[1]}`);
  return codes.length ? codes : ['(other)'];
}

/**
 * @param {{copy: object, heartbeat: object|null, adapterConfig: object, day: string, now: number}} o
 */
export async function opsReconcile({ copy, heartbeat, adapterConfig, day, now }) {
  const store = adapterConfig.stores.find((s) => s.store === adapterConfig.store);
  const tz = adapterConfig.timezone;
  const mem = (data) => ({ connected: true, read: async () => structuredClone(data) });
  const off = { connected: false, reason: 'not_read', read: async () => { throw new Error('not read'); } };
  const adapter = createCopyAdapter({ config: adapterConfig, copyReader: mem(copy), heartbeatReader: heartbeat ? mem(heartbeat) : off, now: () => now, minReadIntervalMs: 0, log: () => {} });
  const result = await adapter.load();
  const ctx = buildContext(result);
  const out = { day, store: store.store, readAt: formatIso(now), copyState: result.sources.copy.state, heartbeatState: result.sources.heartbeat.state };

  // 1 データ更新
  out.dataUpdate = records(copy.tables[COPY_TAB.meta]).map((m) => ({ tab: String(m.tab).trim(), last_read_at: m.last_read_at || null, status: String(m.status ?? '').trim() || null }));

  // 2 機械の確認 (production host only; standby counted apart)
  const beats = ctx.screen.beats ?? [];
  const winText = parseWindow(store.text_patrol);
  const dayStart = zonedInstant(day, store.business_day_start ?? '00:00', store.timezone);
  const dayEnd = zonedInstant(addDays(day, 1), store.business_day_start ?? '00:00', store.timezone);
  const inDay = (b) => { const t = parseMs(b.received_at); return t >= dayStart && t < dayEnd; };
  const prod = beats.filter((b) => b.host === store.production_host && b.role === 'production' && inDay(b)).sort((a, b) => parseMs(a.received_at) - parseMs(b.received_at));
  out.machine = {
    productionHost: store.production_host, rows: prod.length,
    pass: prod.filter((b) => b.verify === 'PASS').length, fail: prod.filter((b) => b.verify === 'FAIL').length,
    first: mdhm(parseMs(prod[0]?.received_at)), last: mdhm(parseMs(prod[prod.length - 1]?.received_at)),
    standbyRowsIgnored: beats.filter((b) => b.role !== 'production' && inDay(b)).length,
    note: 'verify=PASS is machine evidence only (rules §1, §6-1): never a patrol, read, reply or daily success',
  };

  // 3 / 5 scheduled reads and daily delivery as the screen shows them now
  const runs = dayRuns({ store, schedules: ctx.screen.schedules, runs: ctx.screen.runs ?? [], day, now, currentDay: businessDayOf(now, store), ...runOpts(ctx) });
  out.evidenceTabs = (result.sources.copy.evidenceTabs ?? []).map((t) => ({ tab: t.tab, state: t.state, rows: t.rows, findings: t.findingCount }));
  const slotJudged = !runStatusUnconfirmedFor(ctx, 'slot');
  const dailyJudged = !runStatusUnconfirmedFor(ctx, 'daily');
  const hbRows = records(copy.tables[COPY_TAB.heartbeat]).map((r) => ({ at: parseCopyTime(r['時刻'], tz), codes: heartbeatCodes(r['結果']) }));
  out.scheduledReads = runs.items.filter((i) => i.kind === 'slot').sort((a, b) => a.scheduledMs - b.scheduledMs).map((i) => {
    const dl = deadlineMin(store, 'slot') ?? 0;
    const rows = hbRows.filter((r) => r.at > i.scheduledMs && r.at <= i.scheduledMs + dl * MIN);
    const codes = new Map();
    for (const r of rows) for (const c of r.codes) count(codes, c);
    return { slot: i.time, deadline: hm(i.scheduledMs + dl * MIN), screen: i.status, gasHeartbeatRows: rows.length, gasCodes: Object.fromEntries(codes),
      reason: codeOnly(i.row?.reason), readAt: i.row?.read_at ? i.row.read_at.slice(11, 16) : null,
      requiredEvidence: '_line_read_launch.tsv (mode=read, result=ok, exit_code=0) + _line_read_heartbeat.tsv (ok, manifest=ok, count)', evidenceReadable: slotJudged };
  });

  // 4 5 分巡回: gaps between successive problem-free runs (production beats.text_patrol_at) inside the window, incl. from the
  // window start and up to the window end (or the read time). Whether the machine or the patrol was silent is not decided here.
  const five = { window: store.text_patrol ?? null, beatsInWindow: 0, runsSeen: 0, maxGapMin: null, over15: 0, over20: 0, over20From: [], lastTextPatrolAt: null };
  if (winText) {
    const ws = zonedInstant(day, winText.start, store.timezone);
    const we = zonedInstant(day, winText.end, store.timezone);
    const runsAt = new Set();
    for (const b of prod) {
      const t = parseMs(b.received_at);
      if (t >= ws && t < we) five.beatsInWindow += 1;
      const last = parseMs(b.text_patrol_at);
      if (!Number.isFinite(last)) { if (t >= ws && t < we) count(five.unreadable ??= new Map(), 'no_text_patrol_at'); continue; }
      if (last >= ws && last < we) runsAt.add(last);
    }
    const seq = [...runsAt].sort((x, y) => x - y);
    five.runsSeen = seq.length;
    const points = [ws, ...seq, Math.min(we, now)];
    for (let i = 1; i < points.length; i += 1) {
      const gap = Math.round((points[i] - points[i - 1]) / MIN);
      five.maxGapMin = Math.max(five.maxGapMin ?? 0, gap);
      if (gap > LIGHT_CHECK_RED_MINUTES) five.over15 += 1;
      if (gap > FIVE_MIN_STOP_MINUTES) five.over20From.push(`${hm(points[i - 1])}-${hm(points[i])}`);
    }
    five.over20 = five.over20From.length;
    five.lastTextPatrolAt = mdhm(seq[seq.length - 1]);
  }
  if (five.unreadable) five.unreadable = Object.fromEntries(five.unreadable);
  five.screen = '最終稼働時刻のみ確認／全件判定未接続';
  five.requiredEvidence = 'heartbeat.jsonl (at, host, send, issues, audit_issues, google_beat) + ownership.json + case ledger';
  five.evidenceReadable = !!ctx.evidence?.patrol;
  if (ctx.evidence?.patrol && winText) { // client per-run records: counts for the production host inside the window
    const ws = zonedInstant(day, winText.start, store.timezone); const we = zonedInstant(day, winText.end, store.timezone);
    const mine = ctx.evidence.patrol.filter((r) => r.host === store.production_host && parseMs(r.at) >= ws && parseMs(r.at) < we);
    five.evidenceRows = { rows: mine.length, clean: mine.filter((r) => r.send === true && r.issues === 0 && r.audit_issues === 0 && r.google_beat === true).length,
      ownerNew: mine.filter((r) => r.owner === 'new').length, ownerMissing: mine.filter((r) => r.owner == null).length, otherHostsIgnored: ctx.evidence.patrol.filter((r) => r.host !== store.production_host).length };
    five.screenNow = fiveMinCheck(store, ctx.evidence.patrol, ctx.screen.beats, now).state;
  }
  out.fiveMinutePatrol = five;

  // 5 日次配送 for business day D (scheduled the next calendar day)
  const daily = runs.items.find((i) => i.kind === 'daily');
  const dDl = deadlineMin(store, 'daily') ?? 0;
  const from = daily ? zonedInstant(formatIso(daily.scheduledMs).slice(0, 10), '00:00', store.timezone) : null;
  const to = daily ? daily.scheduledMs + (dDl + 60) * MIN : null;
  const sends = from == null ? [] : records(copy.tables[COPY_TAB.sendLog])
    .map((r) => ({ at: parseCopyTime(r['日時'], tz), cls: String(r['宛先の群'] ?? '').trim() || '(blank)', result: sendResult(r['結果']) ?? 'unclassified' }))
    .filter((s) => s.at >= from && s.at <= to).sort((a, b) => a.at - b.at);
  out.dailyDelivery = {
    businessDay: day, scheduled: daily ? mdhm(daily.scheduledMs) : null, deadline: daily ? mdhm(daily.scheduledMs + dDl * MIN) : null,
    screen: daily?.status ?? null, screenLabel: daily?.status === 'unconfirmed' ? '3 経路判定未接続' : null, reason: codeOnly(daily?.row?.reason),
    routes: daily?.row?.routes_json ? JSON.parse(daily.row.routes_json).map((x) => ({ route: x.route, status: x.status, at: x.at ? x.at.slice(11, 16) : null })) : null,
    gasSendLogRows: sends.map((s) => ({ at: hm(s.at), cls: s.cls, result: s.result })),
    requiredEvidence: '01_staff_all / 02_owner_line / 03_owner_email receipts (status=sent, sent=true, same business_date and body_sha256)', evidenceReadable: dailyJudged,
    note: 'GAS 送信ログ covers LINE routes only; it never proves 丸メール (rules §5, §6-4)',
  };
  out.clientStatedExpected = {
    scheduledReads: '2026-10-20 12/17/22: local launch rows mode=read/result=ok/exit_code=0 with read heartbeats (client, not verified by PIATEC)',
    daily: 'business day 2026-10-20: 3 route receipts sent at 2026-10-21 00:32 (client, not verified by PIATEC)',
  };
  return out;
}

export function print(o) {
  console.log(`ops-reconcile  business day ${o.day}  store ${o.store}  read ${o.readAt}  copy ${o.copyState}  heartbeat ${o.heartbeatState}`);
  console.log('\n[1] データ更新 (copy meta)');
  console.log(table(['tab', 'last_read_at', 'status'], o.dataUpdate.map((m) => [m.tab, m.last_read_at, m.status])));
  const m = o.machine;
  console.log(`\n[2] 機械の確認  production ${m.productionHost}: ${m.rows} rows (PASS ${m.pass} / FAIL ${m.fail})  ${m.first ?? '-'} .. ${m.last ?? '-'}   standby rows ignored: ${m.standbyRowsIgnored}`);
  console.log(`    ${m.note}`);
  console.log(`\n[0] client evidence tabs: ${o.evidenceTabs.length ? o.evidenceTabs.map((t) => `${t.tab} ${t.state}${t.rows != null ? ` ${t.rows} rows` : ''}${t.findings ? ` ${t.findings} findings` : ''}`).join(' / ') : 'none'}`);
  console.log('\n[3] 定時 LINE 読取');
  console.log(table(['slot', 'deadline', 'screen', 'read end', 'reason', 'GAS 心拍 rows', 'GAS codes (auxiliary)', 'evidence connected'], o.scheduledReads.map((s) => [s.slot, s.deadline, s.screen, s.readAt ?? '-', s.reason ?? '-', s.gasHeartbeatRows, JSON.stringify(s.gasCodes), s.evidenceReadable ? 'yes' : 'NO -> 未確認'])));
  const f = o.fiveMinutePatrol;
  console.log(`\n[4] 5 分巡回  window ${f.window}  production beats in window ${f.beatsInWindow}  distinct problem-free runs ${f.runsSeen}  longest gap ${f.maxGapMin ?? '-'} min  gaps >15: ${f.over15}  >20: ${f.over20}${f.over20From.length ? ` (${f.over20From.join(', ')})` : ''}  last text_patrol_at ${f.lastTextPatrolAt ?? '-'}`);
  console.log(f.evidenceReadable ? `    client records (production host, window): ${JSON.stringify(f.evidenceRows ?? {})}; screen now: ${f.screenNow ?? '-'}` : `    screen: ${f.screen}; per-run evidence connected: NO`);
  const d = o.dailyDelivery;
  console.log(`\n[5] 日次配送  business day ${d.businessDay}  scheduled ${d.scheduled}  deadline ${d.deadline}  screen ${d.screen}${d.screenLabel ? ` (${d.screenLabel})` : ''}`);
  console.log(d.gasSendLogRows.length ? table(['at', '宛先の群', 'result'], d.gasSendLogRows.map((s) => [s.at, s.cls, s.result])) : '    no 送信ログ rows in the window');
  if (d.routes) console.log(table(['route', 'status', 'at'], d.routes.map((x) => [x.route, x.status, x.at ?? '-'])));
  console.log(d.evidenceReadable ? `    from the client's 日次配送 records${d.reason ? `  reason ${d.reason}` : ''}.  ${d.note}` : `    receipts connected: NO -> 3 経路判定未接続.  ${d.note}`);
  console.log('\nClient-stated expected points (NOT verified by PIATEC):');
  for (const v of Object.values(o.clientStatedExpected)) console.log(`  - ${v}`);
}

if (isMain(import.meta.url)) {
  const a = args();
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.day ?? ''))) throw Object.assign(new Error('usage'), { code: 'usage_day_YYYY-MM-DD' });
    const live = await readLive({ heartbeat: true });
    const o = await opsReconcile({ copy: live.copy, heartbeat: live.heartbeat, adapterConfig: live.cfg.adapter, day: a.day, now: live.copyReadAt });
    print(o);
    writeJson(a.json, o);
  } catch (e) {
    console.error(`ops-reconcile: ${failure(e)}`);
    process.exit(1);
  }
}

