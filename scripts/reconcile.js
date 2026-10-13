// READ-ONLY reconciliation: client View-only Copy (SOURCE) -> Screen Data built by the dashboard's own copy adapter
// (TRANSFORMED) -> what the pages/API show (SCREEN), for the last N business days (default 7). Evidence for TV1, TV8, TV20.
//
//   node --env-file=.env scripts/reconcile.js [--days 7] [--end YYYY-MM-DD] [--json reconcile-counts.json]
//
// Stages (never mixed up in the output):
//   SOURCE       the rows of one GET read of the View-only Copy (dashboard reader account, same contract checks)
//   TRANSFORMED  Screen Data rows produced from THAT read by src/adapters/copy (validate + transform), i.e. the server's code
//   SCREEN       view-model output (src/viewmodels/pages.js = the JSON /api returns) computed from those rows
//   CACHE        not inspected: the running server keeps its own in-memory read; this script makes its own read
//   FIXTURES     none (the unit tests exercise this module with synthetic rows; see tests/diagnostics.test.js)
// Prints counts, business days, codes and 元の行番号 only - never message text, names, ids, recipient labels or keys.
import { COPY_TAB, CANCEL_MARK, RESEND_MARK, ROW_ID } from '../src/contract/copyContract.js';
import { TAB_NAME } from '../src/contract/enums.js';
import { createCopyAdapter } from '../src/adapters/copy/copyAdapter.js';
import { ID_DAMAGED, parseCopyTime, validateCopy } from '../src/adapters/copy/validate.js';
import { sendResult } from '../src/adapters/copy/transform.js';
import { buildContext } from '../src/viewmodels/context.js';
import * as vm from '../src/viewmodels/pages.js';
import { businessDayOf, businessDayWindow, formatIso, parseMs, recentDays } from '../src/domain/time.js';
import { expectedRuns } from '../src/domain/schedules.js';
import { args, count, failure, isMain, readLive, records, table, writeJson } from './lib/diag.js';

const keyOf = (rec) => (rec[ID_DAMAGED] === true ? `ROW-${rec[ROW_ID].trim()}` : rec.messageId.trim());

/**
 * @param {{read: {titles: string[], tables: object}, adapterConfig: object, now: number, days?: number, endDay?: string}} opts
 */
export async function reconcile({ read, adapterConfig, now, days = 7, endDay = null }) {
  const store = adapterConfig.stores.find((s) => s.store === adapterConfig.store);
  const tz = adapterConfig.timezone;
  const memoryReader = { connected: true, read: async () => structuredClone(read) };
  const off = { connected: false, reason: 'not_used', read: async () => { throw new Error('not used'); } };
  const adapter = createCopyAdapter({ config: adapterConfig, copyReader: memoryReader, heartbeatReader: off, now: () => now, minReadIntervalMs: 0, log: () => {} });
  const result = await adapter.load();
  const ctx = buildContext(result);
  const v = validateCopy(structuredClone(read), { timezone: tz }); // the same check, kept to see per-row flags (ID_DAMAGED)
  const end = endDay ?? businessDayOf(now, store);
  const dayList = recentDays(end, days).reverse();
  const dayOfMs = (ms) => (Number.isFinite(ms) ? businessDayOf(ms, store) : null);
  const out = { endDay: end, days: dayList, store: store.store, sourceState: result.sources.copy.state, checks: [], unexplained: [] };
  const check = (name, ok, detail = '') => { out.checks.push({ name, result: ok ? 'match' : 'MISMATCH', detail }); if (!ok) out.unexplained.push(`${name}${detail ? `: ${detail}` : ''}`); };

  // ---------------- meta (copy self-row kept; Dashboard meta derived from copy last_read_at)
  const metaRecs = records(read.tables[COPY_TAB.meta]);
  out.copyMeta = metaRecs.map((m) => ({ tab: String(m.tab).trim(), last_read_at: m.last_read_at || null, updated_at: m.updated_at || null, status: String(m.status ?? '').trim() || null,
    source_rows: m.source_rows || null, copied_rows: m.copied_rows || null, contract_version: m.contract_version || null, detailLength: String(m.detail ?? '').length }));
  out.metaSelfRows = out.copyMeta.filter((m) => m.tab === COPY_TAB.meta).length;
  out.dashboardMeta = ctx.screen.meta.map((m) => ({ tab: m.tab, generated_at: m.generated_at, source_through: m.source_through, status: m.status }));
  const map = { [TAB_NAME.messages]: COPY_TAB.log, [TAB_NAME.sends]: COPY_TAB.sendLog, [TAB_NAME.questions]: COPY_TAB.questions, [TAB_NAME.runs]: COPY_TAB.heartbeat };
  for (const dm of ctx.screen.meta) {
    const cm = out.copyMeta.find((m) => m.tab === map[dm.tab]);
    const a = cm ? parseCopyTime(cm.last_read_at, tz) : NaN;
    check(`meta ${dm.tab}: generated_at = copy ${map[dm.tab]}.last_read_at`, Number.isFinite(a) && parseMs(dm.generated_at) === a, Number.isFinite(a) ? '' : 'copy meta row missing or unreadable');
  }
  out.contract = result.sources.copy.tabs?.map((t) => ({ tab: t.tab, state: t.state, rows: t.rows, findings: t.findingCount, warnings: t.warningCount, warningRows: (t.warnings ?? []).map((w) => w.row) })) ?? [];

  // SOURCE counts come from the raw rows (a tab blocked by the contract check must show up as a difference, not vanish)
  for (const [k, tab] of [['log', COPY_TAB.log], ['sendLog', COPY_TAB.sendLog], ['questions', COPY_TAB.questions]]) {
    check(`${tab}: passed the contract check (every SOURCE row can reach the screen)`, v.tabs[k].ok, v.tabs[k].ok ? '' : `blocked, ${v.tabs[k].findingCount} finding(s)`);
  }
  const rawDay = (tab, col) => {
    const m = new Map();
    for (const r of records(read.tables[tab])) { const d = dayOfMs(parseCopyTime(r[col], tz)); if (d) count(m, d); }
    return m;
  };

  // ---------------- ログ -> messages -> ③ (TV8, TV20)
  const logRecs = v.tabs.log.ok ? v.tabs.log.records : [];
  const rawLogDay = rawDay(COPY_TAB.log, '日時');
  const byKey = new Map();
  for (const r of [...logRecs].sort((a, b) => Number(a[ROW_ID]) - Number(b[ROW_ID]))) { if (!byKey.has(keyOf(r))) byKey.set(keyOf(r), []); byKey.get(keyOf(r)).push(r); }
  const trMsgs = ctx.screen.messages.filter((m) => m.store === store.store);
  const trByKey = new Map();
  for (const m of trMsgs) { if (!trByKey.has(m.message_id)) trByKey.set(m.message_id, []); trByKey.get(m.message_id).push(m); }
  check('messages: every SOURCE key appears once in TRANSFORMED', [...byKey.keys()].every((k) => trByKey.get(k)?.length === 1), `${[...byKey.keys()].filter((k) => trByKey.get(k)?.length !== 1).length} key(s) missing or duplicated`);
  check('messages: no TRANSFORMED row without a SOURCE key', [...trByKey.keys()].every((k) => byKey.has(k)), `${[...trByKey.keys()].filter((k) => !byKey.has(k)).length} extra`);
  const damaged = logRecs.filter((r) => r[ID_DAMAGED] === true);
  out.roundedIds = { sourceRows: damaged.length, rowNumbers: damaged.map((r) => r[ROW_ID].trim()), shownAsRowKey: damaged.filter((r) => trByKey.get(`ROW-${r[ROW_ID].trim()}`)?.length === 1).length,
    flagged: trMsgs.filter((m) => m.id_damaged === 'yes').length };
  check('rounded messageIds: each shown once as ROW-<元の行番号>, never merged', out.roundedIds.shownAsRowKey === damaged.length && out.roundedIds.flagged === damaged.length);
  const dupGroups = [...byKey.entries()].filter(([k, rs]) => rs.length > 1 && !k.startsWith('ROW-'));
  out.duplicateMessageIds = { groups: dupGroups.length, rows: dupGroups.reduce((s, [, rs]) => s + rs.length, 0),
    withResendMark: dupGroups.filter(([, rs]) => rs.some((r) => r['再送'].trim() === RESEND_MARK)).length,
    withoutResendMarkRows: dupGroups.filter(([, rs]) => !rs.some((r) => r['再送'].trim() === RESEND_MARK)).map(([, rs]) => rs.map((r) => r[ROW_ID].trim()).join('+')) };
  const resendOwnId = logRecs.filter((r) => r['再送'].trim() === RESEND_MARK && byKey.get(keyOf(r)).length === 1).length;
  out.resendRowsWithOwnId = resendOwnId; // counted as separate messages until Q-17

  const perDay = new Map(dayList.map((d) => [d, { src: 0, srcKeys: new Set(), resend: 0, cancelled: 0, damaged: 0, tr: 0, scr: null, scrCount: null, textChecked: 0, textExact: 0, textMismatchRows: [], cancelledShown: 0, repliesShown: 0, repliesTransformed: 0 }]));
  for (const r of logRecs) {
    const d = perDay.get(dayOfMs(parseCopyTime(r['日時'], tz)));
    if (!d) continue;
    d.src += 1; d.srcKeys.add(keyOf(r));
    if (r['再送'].trim() === RESEND_MARK) d.resend += 1;
    if (r['取消'].trim() === CANCEL_MARK) d.cancelled += 1;
    if (r[ID_DAMAGED] === true) d.damaged += 1;
  }
  for (const m of trMsgs) { const d = perDay.get(dayOfMs(parseMs(m.at))); if (d) { d.tr += 1; d.repliesTransformed += m.replies_json ? JSON.parse(m.replies_json).length : 0; } }
  for (const day of dayList) {
    const d = perDay.get(day);
    const page = vm.messages(ctx, store.store, day);
    if (page.connection !== 'connected') continue;
    d.scr = page.items.length; d.scrCount = page.total.value === null ? page.total.state : `${page.total.value} (${page.total.state})`;
    for (const it of page.items) {
      d.repliesShown += it.replies.length;
      const rs = byKey.get(it.message_id);
      if (!rs) continue;
      const kept = rs[0];
      const cancelled = rs.some((r) => r['取消'].trim() === CANCEL_MARK);
      if (cancelled) { if (it.text !== null) d.cancelledShown += 1; continue; }
      if (kept['種別'].trim() !== 'text') continue;
      d.textChecked += 1;
      if ((it.text ?? '') === kept['内容']) d.textExact += 1; else d.textMismatchRows.push(kept[ROW_ID].trim());
    }
  }
  out.messagesPerDay = dayList.map((day) => { const d = perDay.get(day); return { day, src: rawLogDay.get(day) ?? 0, srcDistinct: d.srcKeys.size, resend: d.resend, cancelled: d.cancelled, damaged: d.damaged, transformed: d.tr, screenItems: d.scr, screenCount: d.scrCount, textChecked: d.textChecked, textExact: d.textExact, textMismatchRows: d.textMismatchRows, cancelledShown: d.cancelledShown, repliesTransformed: d.repliesTransformed, repliesShown: d.repliesShown }; });
  for (const d of out.messagesPerDay) {
    check(`③ ${d.day}: SOURCE distinct = TRANSFORMED = SCREEN items`, d.srcDistinct === d.transformed && d.transformed === d.screenItems, `${d.srcDistinct}/${d.transformed}/${d.screenItems}`);
    check(`③ ${d.day}: text identical to SOURCE (TV8)`, d.textMismatchRows.length === 0, d.textMismatchRows.length ? `rows ${d.textMismatchRows.slice(0, 20).join(',')}` : '');
    check(`③ ${d.day}: cancelled content hidden`, d.cancelledShown === 0);
    check(`③ ${d.day}: every linked Bot reply is shown under its message`, d.repliesShown === d.repliesTransformed, `${d.repliesTransformed}/${d.repliesShown}`);
  }

  // ---------------- 送信ログ -> sends (TV20)
  const sendRecs = records(read.tables[COPY_TAB.sendLog]); // raw rows: results classified the same way as the transform
  const trSends = ctx.screen.sends.filter((s) => s.store === store.store);
  const sendDay = new Map(dayList.map((d) => [d, { src: new Map(), tr: new Map() }]));
  for (const r of sendRecs) { const d = sendDay.get(dayOfMs(parseCopyTime(r['日時'], tz))); if (d) count(d.src, sendResult(r['結果']) ?? 'unclassified'); }
  for (const s of trSends) { const d = sendDay.get(dayOfMs(parseMs(s.sent_at))); if (d) count(d.tr, s.result ?? 'unclassified'); }
  const fail = vm.failures(ctx);
  const problemsByDay = new Map();
  for (const p of fail.sendProblems) count(problemsByDay, p.businessDay);
  out.sendsPerDay = dayList.map((day) => { const d = sendDay.get(day); const o = (m) => ({ sent: m.get('sent') ?? 0, failed: m.get('failed') ?? 0, unknown: m.get('unknown') ?? 0, unclassified: m.get('unclassified') ?? 0 });
    return { day, source: o(d.src), transformed: o(d.tr), screenProblems: problemsByDay.get(day) ?? 0 }; });
  for (const d of out.sendsPerDay) {
    check(`sends ${d.day}: SOURCE results = TRANSFORMED results`, JSON.stringify(d.source) === JSON.stringify(d.transformed));
    const within14 = businessDayWindow(d.day, store).start >= now - 14 * 86400000; // ⑤ lists the last 14 x 24 h: only whole days compared
    if (within14) check(`⑤ ${d.day}: failed + unknown sends listed`, d.screenProblems === d.transformed.failed + d.transformed.unknown, `${d.transformed.failed + d.transformed.unknown}/${d.screenProblems}`);
  }

  // ---------------- AI質問追跡 -> questions -> ④ / ⑦ (TV1, TV20)
  const qRecs = records(read.tables[COPY_TAB.questions]);
  const qPage = vm.questions(ctx, store.store);
  const qDay = new Map(dayList.map((d) => [d, { src: 0, tr: 0, scr: 0, candidate: 0, confirmed: 0 }]));
  for (const r of qRecs) { const d = qDay.get(dayOfMs(parseCopyTime(r['送信時刻'], tz))); if (d) d.src += 1; }
  for (const q of ctx.screen.questions.filter((x) => x.store === store.store)) {
    const d = qDay.get(dayOfMs(parseMs(q.sent_at)));
    if (!d) continue;
    d.tr += 1;
    const answers = q.answers_json ? JSON.parse(q.answers_json) : [];
    if (answers.some((a) => a.link === 'candidate')) d.candidate += 1;
    if (answers.some((a) => a.link === 'confirmed')) d.confirmed += 1;
  }
  for (const it of qPage.items ?? []) { const d = qDay.get(dayOfMs(parseMs(it.sent_at))); if (d) d.scr += 1; }
  out.questionsPerDay = dayList.map((day) => ({ day, ...qDay.get(day) }));
  // Extraction criteria and the matching rows (元の行番号, time, group, state - no names, no question text), for cross-checking
  // against the client's send records.
  const win = { from: formatIso(businessDayWindow(dayList[0], store).start), to: formatIso(businessDayWindow(dayList[dayList.length - 1], store).end) };
  out.questionCriteria = { tab: COPY_TAB.questions, timeColumn: '送信時刻', zone: tz ?? '(ISO offsets only)', windowFrom: win.from, windowToExclusive: win.to,
    rule: 'every row whose 送信時刻 falls in the window, any state; business day = store business_day_start', totalRowsInTab: qRecs.length };
  out.questionRows = qRecs.map((r) => ({ row: String(r[ROW_ID]).trim(), at: parseCopyTime(r['送信時刻'], tz), group: String(r.group ?? '').trim(), state: String(r.state ?? '').trim() }))
    .filter((r) => Number.isFinite(r.at)).sort((x, y) => x.at - y.at)
    .map((r) => ({ ...r, at: formatIso(r.at), inWindow: r.at >= Date.parse(win.from) && r.at < Date.parse(win.to) }));
  for (const d of out.questionsPerDay) {
    check(`④ ${d.day}: SOURCE = TRANSFORMED = SCREEN questions`, d.src === d.tr && d.tr === d.scr, `${d.src}/${d.tr}/${d.scr}`);
    check(`④ ${d.day}: no confirmed answer (copy cannot prove one)`, d.confirmed === 0);
  }

  // ---------------- ⑦ period totals (only when the window is the page's own window: the last 7 days ending today)
  if (days === 7 && end === businessDayOf(now, store)) {
    const p = vm.periods(ctx, '7').stores.find((s) => s.store === store.store)?.metrics;
    if (p) {
      const msgSum = out.messagesPerDay.reduce((s, d) => s + d.transformed, 0);
      out.periods = { messages: p.messages, questionsSent: p.questionsSent, responseRate: p.responseRate, timeToAnswer: p.timeToAnswer, patrolRate: p.patrolRate, dailyRate: p.dailyRate, botReplies: p.botReplies };
      check('⑦ messages (7 days) = sum of TRANSFORMED per day', p.messages.state !== 'value' || p.messages.value === msgSum, `${msgSum}/${p.messages.value}`);
      check('⑦ response rate is not a confirmed number', p.responseRate.state !== 'value', JSON.stringify(p.responseRate));
    }
  }

  // ---------------- runs (TV1 status part): what the screen does with each scheduled run
  const today = vm.today(ctx, store.store);
  const statuses = new Map();
  for (const day of dayList) {
    for (const kind of ['slot', 'daily']) {
      const n = expectedRuns(store, adapterConfig.schedules, kind, day).length;
      count(statuses, `${kind} expected`, n);
    }
  }
  for (const dd of today.days ?? []) for (const it of dd.items) count(statuses, `screen today/yesterday: ${it.status}`);
  out.runs = Object.fromEntries(statuses);
  out.runsNote = 'run status is not judged from the copy (Q-49): no run rows are derived; TV1 run-status comparison cannot be made';
  return out;
}

export function print(o, readInfo) {
  console.log(`SOURCE      : ${readInfo}`);
  console.log('TRANSFORMED : Screen Data built from that read by src/adapters/copy (the server code)');
  console.log('SCREEN      : view-model output (= /api JSON) computed from those rows; the running server cache is NOT inspected');
  console.log(`Window      : ${o.days.length} business days ${o.days[0]} .. ${o.days[o.days.length - 1]}   store ${o.store}   source state ${o.sourceState}`);
  console.log('\n[1] Copy meta (self-row kept) and Dashboard meta');
  console.log(table(['copy tab', 'last_read_at', 'updated_at', 'status', 'source_rows', 'copied_rows', 'contract', 'detail chars'], o.copyMeta.map((m) => [m.tab, m.last_read_at, m.updated_at, m.status, m.source_rows, m.copied_rows, m.contract_version, m.detailLength])));
  console.log(`    meta self-rows: ${o.metaSelfRows}`);
  console.log(table(['dashboard tab', 'generated_at', 'source_through', 'status'], o.dashboardMeta.map((m) => [m.tab, m.generated_at, m.source_through, m.status])));
  console.log('\n[2] Contract check');
  console.log(table(['tab', 'state', 'rows', 'findings', 'flagged rows'], o.contract.map((t) => [t.tab, t.state, t.rows, t.findings, t.warnings])));
  console.log(`    rounded messageIds: ${o.roundedIds.sourceRows} source rows (元の行番号 ${o.roundedIds.rowNumbers.join(',') || '-'}); shown as ROW-<n>: ${o.roundedIds.shownAsRowKey}; flagged ID破損: ${o.roundedIds.flagged}`);
  console.log(`    same messageId on 2+ rows: ${o.duplicateMessageIds.groups} group(s) / ${o.duplicateMessageIds.rows} rows; with a 再送 row: ${o.duplicateMessageIds.withResendMark}; without: ${o.duplicateMessageIds.withoutResendMarkRows.length ? o.duplicateMessageIds.withoutResendMarkRows.join(' ') : 0}`);
  console.log(`    再送 rows with their own messageId (counted separately until Q-17): ${o.resendRowsWithOwnId}`);
  console.log('\n[3] ログ -> messages -> ③ per business day');
  console.log(table(['day', 'src rows', 'src distinct', '再送', '取消', 'ID破損', 'transformed', 'screen items', 'screen count', 'text checked', 'text exact', 'replies tr/shown'],
    o.messagesPerDay.map((d) => [d.day, d.src, d.srcDistinct, d.resend, d.cancelled, d.damaged, d.transformed, d.screenItems, d.screenCount, d.textChecked, d.textExact, `${d.repliesTransformed}/${d.repliesShown}`])));
  console.log('\n[4] 送信ログ -> sends per business day (sent / failed / unknown / unclassified)');
  console.log(table(['day', 'SOURCE', 'TRANSFORMED', '⑤ failed+unknown listed'], o.sendsPerDay.map((d) => [d.day, Object.values(d.source).join('/'), Object.values(d.transformed).join('/'), d.screenProblems])));
  console.log('\n[5] AI質問追跡 -> questions -> ④ per business day');
  console.log(table(['day', 'SOURCE', 'TRANSFORMED', 'SCREEN', 'with candidate', 'with confirmed'], o.questionsPerDay.map((d) => [d.day, d.src, d.tr, d.scr, d.candidate, d.confirmed])));
  if (o.periods) console.log(`\n[6] ⑦ 7 days: ${JSON.stringify(o.periods)}`);
  console.log(`\n[7] Runs: ${JSON.stringify(o.runs)}\n    ${o.runsNote}`);
  if (o.showRows) {
    console.log(`\n[7b] Question extraction: ${JSON.stringify(o.questionCriteria)}`);
    console.log(table(['元の行番号', '送信時刻', 'group', 'state', 'in window'], o.questionRows.map((r) => [r.row, r.at, r.group, r.state, r.inWindow ? 'yes' : ''])));
  }
  const bad = o.checks.filter((c) => c.result !== 'match');
  console.log(`\n[8] Checks: ${o.checks.length - bad.length} match, ${bad.length} mismatch`);
  for (const c of bad) console.log(`    MISMATCH ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
}

if (isMain(import.meta.url)) {
  const a = args();
  try {
    const live = await readLive();
    const o = await reconcile({ read: live.copy, adapterConfig: live.cfg.adapter, now: live.copyReadAt, days: a.days ? Number(a.days) : 7, endDay: a.end ?? null });
    o.showRows = !!a.rows;
    print(o, `LIVE View-only Copy, one GET read finished ${formatIso(live.copyReadAt)} (${Math.round((live.copyReadAt - live.startedAt) / 100) / 10} s)`);
    writeJson(a.json, o);
  } catch (e) {
    console.error(`reconcile: ${failure(e)}`);
    process.exit(1);
  }
}
