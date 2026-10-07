// View models for the 7 pages (REQ §6). Pure functions: (ctx, params) -> plain JSON for the read-only API.
// All business rules live in src/domain; the UI only renders what is returned here.
import { activeStores, connectionOf, currentDay, findStore, publicFreshness, publicSources, questionsIncompleteFromMs, runStatusUnconfirmed, sourceThroughOf } from './context.js';
import { storeCapability } from '../domain/capability.js';
import { dayRuns, effectiveRunStatus } from '../domain/runs.js';
import { countWithCoverage, dayCoverage } from '../domain/freshness.js';
import { addDays, businessDayOf, businessDayWindow, formatIso, minutesBetween, parseMs, recentDays } from '../domain/time.js';
import { filterGroup, readAnswers, stateKey, waitHours } from '../domain/questions.js';
import { messageRow } from '../domain/messages.js';
import { latestPerMachine, lightCheck, machineView, storeMachine } from '../domain/production.js';
import { periodMetrics } from '../domain/metrics.js';
import { isDummyBeat, isDummyMessage, isDummyQuestion, isDummyRun, isDummySend, real } from '../domain/dummy.js';
import { ALERTS_SHOWN, HEARTBEAT_WRITE_INTERVAL_MINUTES, PERIOD_DAYS, RECENT_FAILURE_DAYS } from '../domain/constants.js';
import { scopeOf } from '../domain/schedules.js';

export class NotFound extends Error {}
export class BadRequest extends Error {}

const nz = (v) => (v === undefined ? null : v);

function storeOrThrow(ctx, id) {
  const store = findStore(ctx, id);
  if (!store) throw new NotFound(`unknown store: ${id}`);
  return store;
}

const questionsIncompleteNow = (ctx) => { const from = questionsIncompleteFromMs(ctx); return from != null && ctx.now > from; };

const questionsOf = (ctx, store) => ctx.screen.questions.filter((q) => q.store === store.store);

function runRow(it) {
  const r = it.row;
  return {
    key: r?.run_id ?? `${it.kind}-${it.scheduledMs}`,
    run_id: r?.run_id ?? null,
    kind: it.kind,
    scheduledAt: formatIso(it.scheduledMs),
    status: it.status,
    derived: it.derived,
    hasRow: !!r,
    reason: nz(r?.reason),
    input_lines: nz(r?.input_lines), // null = not pulled, 0 = zero
    questions_sent: nz(r?.questions_sent),
    messages_sent: nz(r?.messages_sent),
    owner_items: nz(r?.owner_items),
    read_at: nz(r?.read_at),
    ai_done_at: nz(r?.ai_done_at),
    sent_at: nz(r?.sent_at),
    photos_total: nz(r?.photos_total),
    photos_reviewed: nz(r?.photos_reviewed),
    owner_notified: nz(r?.owner_notified),
    // shown in detail views only; provenance of these columns is UNCONFIRMED (Q-15) - displayed as stored, never derived
    posted_at: nz(r?.posted_at),
    received_at: nz(r?.received_at),
    evidence: nz(r?.evidence),
    updated_at: nz(r?.updated_at),
  };
}

// ---------------------------------------------------------------- cross-page references (registry keys only, never inferred)
/** Is a business day still listed on ② (today / yesterday)? Used for links only. */
const onTodayPage = (ctx, store, day) => { const cur = currentDay(ctx, store); return day === cur || day === addDays(cur, -1); };

/** run_id -> the run it names (scheduled time, effective status). Blank -> null; a key with no row -> {found:false}. */
function runRef(ctx, store, runId) {
  if (!runId) return null;
  const row = ctx.screen.runs.find((r) => r.store === store.store && r.run_id === runId);
  if (!row) return { run_id: runId, found: false };
  const at = parseMs(row.scheduled_at);
  const day = Number.isFinite(at) ? businessDayOf(at, store) : null;
  return {
    run_id: runId, found: true, kind: row.kind, scheduledAt: nz(row.scheduled_at), status: effectiveRunStatus(row, store, ctx.now).status,
    businessDay: day, onTodayPage: day ? onTodayPage(ctx, store, day) : false,
  };
}

/** send_id -> the send-log row it names (LINE accepted / failed / unknown). Blank -> null; unknown key -> {found:false}. */
function sendRef(ctx, store, sendId) {
  if (!sendId) return null;
  const s = ctx.screen.sends.find((x) => x.store === store.store && x.send_id === sendId);
  if (!s) return { send_id: sendId, found: false };
  return { send_id: sendId, found: true, sent_at: s.sent_at, kind: s.kind, target_label: s.target_label, result: s.result };
}

const dayOf = (store, iso) => { const t = parseMs(iso); return Number.isFinite(t) ? businessDayOf(t, store) : null; };

function questionRow(q, now, ctx = null, store = null) {
  const a = readAnswers(q);
  const refs = ctx && store ? {
    run: runRef(ctx, store, q.run_id),
    send: sendRef(ctx, store, q.send_id),
  } : {};
  return {
    ...refs,
    question_id: q.question_id,
    run_id: q.run_id,
    sent_at: q.sent_at,
    group: q.group,
    who: q.who,
    text: q.question_text,
    state: stateKey(q),
    waitHours: waitHours(q, now),
    closed_reason: q.closed_reason,
    closed_at: q.closed_at,
    answersOk: a.ok,
    answers: a.answers.map(({ message_id, at, who, text, link }) => ({ message_id, at, who, text, link, businessDay: store ? dayOf(store, at) : null })),
    filterGroup: filterGroup(q),
  };
}

// ---------------------------------------------------------------- entry / navigation
export function entryInfo(ctx, entry) {
  return {
    entry,
    adapterKind: ctx.adapterKind,
    sources: publicSources(ctx),
    stores: ctx.screen.stores.map((s) => ({
      store: s.store, display_name: s.display_name, active: s.active === 'yes', connection: connectionOf(ctx, s),
    })),
  };
}

// ---------------------------------------------------------------- ① all stores
export function allStores(ctx) {
  const dataRuns = real(ctx.screen.runs, isDummyRun);
  const out = activeStores(ctx).map((store) => {
    const conn = connectionOf(ctx, store);
    const cap = storeCapability(store, conn, questionsOf(ctx, store));
    const base = { store: store.store, display_name: store.display_name, connection: conn, capability: cap };
    if (conn !== 'connected') return base;

    const day = currentDay(ctx, store);
    const { items, unconfirmedSchedule, unconfirmedStatus } = dayRuns({
      store, schedules: ctx.screen.schedules, runs: dataRuns, day, now: ctx.now, currentDay: day, statusUnconfirmed: runStatusUnconfirmed(ctx),
    });
    const scope = scopeOf(store);
    const ofKind = (kind) => items.filter((i) => i.kind === kind).sort((a, b) => a.scheduledMs - b.scheduledMs)
      .map((i) => ({ at: formatIso(i.scheduledMs), status: i.status }));
    const asked = items.filter((i) => i.row).map((i) => i.row.questions_sent).filter((v) => v !== null); // all of today's run rows (REQ §6-①)

    const through = sourceThroughOf(ctx, 'messages');
    const cov = dayCoverage(through, store, day, ctx.now);
    const { start, end } = businessDayWindow(day, store);
    const todays = real(ctx.screen.messages, isDummyMessage).filter((m) => m.store === store.store)
      .filter((m) => { const t = parseMs(m.at); return t >= start && t < end; }).map(messageRow);
    const waiting = real(ctx.screen.questions, isDummyQuestion)
      .filter((q) => q.store === store.store && ['waiting', 'candidate'].includes(q.state)).length;

    return {
      ...base,
      businessDay: day,
      patrol: scope.slot ? { scope: 'in_scope', unconfirmedSchedule: unconfirmedSchedule.slot, unconfirmedStatus, items: unconfirmedSchedule.slot ? [] : ofKind('slot') } : { scope: 'out_of_scope' },
      daily: scope.daily ? { scope: 'in_scope', unconfirmedSchedule: unconfirmedSchedule.daily, unconfirmedStatus, items: unconfirmedSchedule.daily ? [] : ofKind('daily') } : { scope: 'out_of_scope' },
      questionsToday: asked.length ? { state: 'value', value: asked.reduce((s, v) => s + v, 0) } : { state: 'unpulled' },
      waitingQuestions: waiting, // all days, waiting + candidate (REQ §6-①)
      questionsIncomplete: questionsIncompleteNow(ctx), // question records known to be incomplete (Q-52): the count is a lower bound
      messagesToday: countWithCoverage(todays.length, cov),
      botRepliesToday: countWithCoverage(todays.filter((m) => m.flags.replied).length, cov),
      machine: summarizeMachine(storeMachine(store, ctx.screen.beats, ctx.now)),
      lightCheck: lightCheck(store, ctx.screen.beats, ctx.now),
    };
  });
  return { stores: out };
}

function summarizeMachine(m) {
  if (m.state === 'not_connected' || m.state === 'unknown') return { state: m.state, host: m.host ?? null };
  return { state: m.state, host: m.host, ageMin: m.ageMin, verify: m.verify };
}

// ---------------------------------------------------------------- ② today
export function today(ctx, storeId) {
  const store = storeOrThrow(ctx, storeId);
  if (connectionOf(ctx, store) !== 'connected') return { store: store.store, display_name: store.display_name, connection: 'not_connected' };
  const day = currentDay(ctx, store);
  const dataRuns = real(ctx.screen.runs, isDummyRun);
  const mk = (d, label) => {
    const { items, unconfirmedSchedule, unconfirmedStatus } = dayRuns({ store, schedules: ctx.screen.schedules, runs: dataRuns, day: d, now: ctx.now, currentDay: day, statusUnconfirmed: runStatusUnconfirmed(ctx) });
    return { label, businessDay: d, unconfirmedSchedule, unconfirmedStatus, items: items.map(runRow) };
  };
  return {
    store: store.store, display_name: store.display_name, connection: 'connected', scope: scopeOf(store),
    days: [mk(day, 'today'), mk(addDays(day, -1), 'yesterday')],
  };
}

export function runDetail(ctx, storeId, runId) {
  const store = storeOrThrow(ctx, storeId);
  if (!runId) throw new BadRequest('run_id required');
  const run = ctx.screen.runs.find((r) => r.store === store.store && r.run_id === runId);
  if (!run) throw new NotFound('unknown run');
  const eff = effectiveRunStatus(run, store, ctx.now);
  const questionsOfRun = ctx.screen.questions.filter((q) => q.store === store.store && q.run_id === runId);
  const sendIds = [...new Set(questionsOfRun.map((q) => q.send_id).filter(Boolean))];
  return {
    run_id: runId,
    run: runRow({ row: run, kind: run.kind, scheduledMs: parseMs(run.scheduled_at), status: eff.status, derived: eff.derived }),
    messages: ctx.screen.messages.filter((m) => m.store === store.store && m.run_id === runId)
      .map(messageRow).sort((a, b) => b.atMs - a.atMs).map(({ atMs, ...m }) => ({ ...m, businessDay: dayOf(store, m.at) })),
    questions: questionsOfRun.map((q) => questionRow(q, ctx.now, ctx, store)).sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1)),
    sends: sendIds.map((id) => sendRef(ctx, store, id)), // the question sends of this patrol (by send_id key)
  };
}

// ---------------------------------------------------------------- ③ messages
export function messages(ctx, storeId, dayParam) {
  const store = storeOrThrow(ctx, storeId);
  if (connectionOf(ctx, store) !== 'connected') return { store: store.store, display_name: store.display_name, connection: 'not_connected' };
  const current = currentDay(ctx, store);
  const day = dayParam ?? current;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || addDays(day, 0) !== day) throw new BadRequest('date must be a real calendar date, YYYY-MM-DD');
  const { start, end } = businessDayWindow(day, store);
  const through = sourceThroughOf(ctx, 'messages');
  const cov = dayCoverage(through, store, day, ctx.now);
  const inDay = ctx.screen.messages.filter((m) => m.store === store.store)
    .filter((m) => { const t = parseMs(m.at); return t >= start && t < end; });
  const rows = inDay.map(messageRow).sort((a, b) => b.atMs - a.atMs);
  const realIds = new Set(real(inDay, isDummyMessage).map((m) => m.message_id)); // dummy rows listed, never counted
  const realRows = rows.filter((r) => realIds.has(r.message_id));
  return {
    store: store.store, display_name: store.display_name, connection: 'connected', businessDay: day, currentDay: current,
    availableDays: recentDays(current, RECENT_FAILURE_DAYS),
    coverage: cov,
    total: countWithCoverage(realRows.length, cov),
    botReplied: countWithCoverage(realRows.filter((r) => r.flags.replied).length, cov),
    groups: [...new Set(rows.map((r) => r.group))].sort(),
    items: rows.map(({ atMs, ...r }) => ({ ...r, run: runRef(ctx, store, r.run_id), question: questionRef(ctx, store, r.question) })),
  };
}

/** Adds the question's send time / recipient to a message's question link (link strength unchanged). */
function questionRef(ctx, store, qLink) {
  if (!qLink) return null;
  const q = ctx.screen.questions.find((x) => x.store === store.store && x.question_id === qLink.question_id);
  return { ...qLink, found: !!q, sent_at: q?.sent_at ?? null, who: q?.who ?? null };
}

// ---------------------------------------------------------------- ④ questions
export function questions(ctx, storeId) {
  const store = storeOrThrow(ctx, storeId);
  if (connectionOf(ctx, store) !== 'connected') return { store: store.store, display_name: store.display_name, connection: 'not_connected' };
  const qs = questionsOf(ctx, store).map((q) => questionRow(q, ctx.now, ctx, store)).sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1));
  const cap = storeCapability(store, 'connected', questionsOf(ctx, store));
  const count = (g) => qs.filter((q) => q.filterGroup === g).length;
  return {
    store: store.store, display_name: store.display_name, connection: 'connected',
    answerEvidence: cap.answers, // CONFIRMED | CANDIDATE | UNKNOWN
    incompleteFrom: questionsIncompleteNow(ctx) ? formatIso(questionsIncompleteFromMs(ctx)) : null, // Q-52
    counts: { all: qs.length, waiting: count('waiting'), answered: count('answered'), closed: count('closed') },
    items: qs,
  };
}

// ---------------------------------------------------------------- ⑤ missing / failed
const PROBLEM = new Set(['missing', 'blocked', 'late', 'unknown', 'no_row']);

export function failures(ctx) {
  const stores = activeStores(ctx);
  const connected = stores.filter((s) => connectionOf(ctx, s) === 'connected');
  const dataRuns = real(ctx.screen.runs, isDummyRun);
  const items = [];
  const totals = { missing: 0, blocked: 0, late: 0, unknown: 0 };
  for (const store of connected) {
    const cur = currentDay(ctx, store);
    for (const day of recentDays(cur, RECENT_FAILURE_DAYS)) {
      const { items: its } = dayRuns({ store, schedules: ctx.screen.schedules, runs: dataRuns, day, now: ctx.now, currentDay: cur, statusUnconfirmed: runStatusUnconfirmed(ctx) });
      for (const it of its) {
        if (!PROBLEM.has(it.status)) continue;
        items.push({ ...runRow(it), store: store.store, display_name: store.display_name, businessDay: day, onTodayPage: onTodayPage(ctx, store, day) });
        if (it.status === 'missing' || it.status === 'no_row') totals.missing += 1;
        else totals[it.status] += 1;
      }
    }
  }
  items.sort((a, b) => (a.scheduledAt < b.scheduledAt ? 1 : -1));
  const windowStart = ctx.now - RECENT_FAILURE_DAYS * 86400000;
  const sendProblems = real(ctx.screen.sends, isDummySend)
    .filter((s) => connected.some((c) => c.store === s.store) && (s.result === 'unknown' || s.result === 'failed') && parseMs(s.sent_at) >= windowStart)
    .sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1))
    .map((s) => {
      const st = connected.find((c) => c.store === s.store);
      return { store: s.store, send_id: s.send_id, sent_at: s.sent_at, kind: s.kind, target_label: s.target_label, text: s.text, result: s.result, businessDay: dayOf(st, s.sent_at) };
    });
  return {
    days: RECENT_FAILURE_DAYS, totals, items, sendProblems,
    runStatusUnconfirmed: runStatusUnconfirmed(ctx), // runs are not judged at all (Q-49): an empty list is not "no failures"
    unclassifiedSends: real(ctx.screen.sends, isDummySend).filter((s) => connected.some((c) => c.store === s.store) && s.result === null && parseMs(s.sent_at) >= windowStart).length,
    notConnected: stores.filter((s) => connectionOf(ctx, s) !== 'connected').map((s) => ({ store: s.store, display_name: s.display_name })),
  };
}

// ---------------------------------------------------------------- ⑥ machines + updates
export function machines(ctx) {
  const beats = ctx.screen.beats;
  const latest = latestPerMachine(beats);
  const stores = activeStores(ctx).filter((s) => connectionOf(ctx, s) === 'connected');
  const alerts = ctx.screen.alerts == null ? null : [...ctx.screen.alerts].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, ALERTS_SHOWN);
  return {
    updates: ctx.freshness.tabs.map((t) => ({
      tab: t.tab, status: t.status, last_success_at: t.last_success_at, source_through: t.source_through, detail: t.detail,
      generated_at: t.generated_at, generatedAgeMin: t.generatedAgeMin, normal: t.normal,
    })),
    heartbeatSheet: beats == null ? 'not_connected' : 'connected',
    sources: publicSources(ctx), // copy / heartbeat connection and contract-check state (copy adapter only)
    beatIntervalMin: HEARTBEAT_WRITE_INTERVAL_MINUTES, // machines write one row every 5 min (REQ §5-3): shown as information, not judged
    machines: latest == null ? [] : latest.filter(Boolean).map((b) => ({ ...machineView(b, ctx.now), recent: recentBeats(beats, b, ctx.now) }))
      .sort((a, b) => (a.role === 'production' ? -1 : 1) - (b.role === 'production' ? -1 : 1)),
    lightChecks: stores.map((s) => ({ store: s.store, display_name: s.display_name, window: s.text_patrol, ...lightCheck(s, beats, ctx.now) })),
    alerts,
  };
}

/** Beats of one machine received in the last 60 minutes, newest first (as stored; no threshold applied here). */
function recentBeats(beats, latestBeat, now) {
  return real(beats, isDummyBeat)
    .filter((b) => b.host === latestBeat.host && b.role === latestBeat.role)
    .map((b) => ({ received_at: b.received_at, at: parseMs(b.received_at), verify: b.verify, fail_items: b.fail_items }))
    .filter((b) => Number.isFinite(b.at) && b.at <= now && minutesBetween(b.at, now) < 60)
    .sort((a, b) => b.at - a.at)
    .map(({ at, ...b }) => b);
}

// ---------------------------------------------------------------- ⑦ period numbers
export function periods(ctx, daysParam) {
  const days = Number(daysParam ?? PERIOD_DAYS[0]);
  if (!PERIOD_DAYS.includes(days)) throw new BadRequest(`days must be one of ${PERIOD_DAYS.join(', ')}`);
  return {
    days,
    stores: activeStores(ctx).map((store) => {
      const conn = connectionOf(ctx, store);
      const base = { store: store.store, display_name: store.display_name, connection: conn };
      if (conn !== 'connected') return base;
      const day = currentDay(ctx, store);
      return {
        ...base,
        metrics: periodMetrics({
          store, data: ctx.screen, now: ctx.now, currentDay: day, sourceThroughMs: sourceThroughOf(ctx, 'messages'), days,
          runStatusUnconfirmed: runStatusUnconfirmed(ctx), questionsIncompleteFromMs: questionsIncompleteFromMs(ctx),
        }),
      };
    }),
  };
}

export const envelope = (ctx, entry, data) => ({
  ok: true, entry, now: formatIso(ctx.now), freshness: publicFreshness(ctx), data,
});
