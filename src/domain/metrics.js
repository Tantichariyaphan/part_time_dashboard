// Period figures for page ⑦ (REQ §6-⑦). Only documented formulas.
//  - success rate = (ok + silent_ok + late) / scheduled runs, excluding running (and not-yet-due: Q-26 UNCONFIRMED)
//  - daily rate is a separate row from patrol rate
//  - response rate = questions sent in period with >=1 `link=confirmed` answer / questions sent in period
//    candidates are NOT counted; with no confirmation records the rate is "not concluded" - never 0%
//  - time to answer = median of (first confirmed answer - sent_at); candidates only -> "not concluded"
//  - DUMMY- rows are excluded from every real summary
//  - runStatusUnconfirmed (source cannot prove run status, Q-49): rates are "unconfirmed", never a number
//  - questionsIncompleteFromMs (question records incomplete from that instant, Q-52): the question count is flagged incomplete
import { businessDayOf, businessDayWindow, parseMs, recentDays } from './time.js';
import { dayRuns, IN_PROGRESS, NOT_JUDGED, SUCCESS } from './runs.js';
import { scopeOf } from './schedules.js';
import { readAnswers } from './questions.js';
import { messageRow, readReplies } from './messages.js';
import { dayCoverage } from './freshness.js';
import { isDummyMessage, isDummyQuestion, isDummyRun, isDummySend, real } from './dummy.js';

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const rate = (num, den) => (den === 0 ? { state: 'none' } : { state: 'value', value: num / den, numerator: num, denominator: den });

export function periodMetrics({ store, data, now, currentDay, sourceThroughMs, days, runStatusUnconfirmed = false, questionsIncompleteFromMs = null }) {
  const scope = scopeOf(store);
  const dayList = recentDays(currentDay, days); // newest first
  const runs = real(data.runs, isDummyRun);
  const questions = real(data.questions, isDummyQuestion).filter((q) => q.store === store.store);
  const messages = real(data.messages, isDummyMessage).filter((m) => m.store === store.store);
  const sends = real(data.sends, isDummySend).filter((s) => s.store === store.store);

  // ---- runs
  const tally = { slot: { ok: 0, den: 0 }, daily: { ok: 0, den: 0 }, missing: 0, blocked: 0, unknown: 0 };
  let unconfirmedSchedule = false;
  for (const day of dayList) {
    const { items, unconfirmedSchedule: u } = dayRuns({ store, schedules: data.schedules, runs, day, now, currentDay, statusUnconfirmed: runStatusUnconfirmed });
    if (u.slot || u.daily) unconfirmedSchedule = true;
    for (const it of items) {
      if (IN_PROGRESS.has(it.status) || NOT_JUDGED.has(it.status)) continue;
      const t = tally[it.kind];
      if (t) { t.den += 1; if (SUCCESS.has(it.status)) t.ok += 1; }
      if (it.status === 'missing' || it.status === 'no_row') tally.missing += 1;
      else if (it.status === 'blocked') tally.blocked += 1;
      else if (it.status === 'unknown') tally.unknown += 1;
    }
  }

  // ---- questions
  const inWindow = (iso) => {
    const ms = parseMs(iso);
    return Number.isFinite(ms) && dayList.includes(businessDayOf(ms, store));
  };
  const qs = questions.filter((q) => inWindow(q.sent_at));
  let confirmedQs = 0;
  let candidateQs = 0;
  let unreadable = 0;
  const firstConfirmedDeltas = [];
  for (const q of qs) {
    const a = readAnswers(q);
    if (!a.ok) { unreadable += 1; continue; }
    const firstConfirmed = a.answers.find((x) => x.link === 'confirmed');
    if (firstConfirmed) {
      confirmedQs += 1;
      firstConfirmedDeltas.push((firstConfirmed.atMs - parseMs(q.sent_at)) / 60000);
    } else if (a.answers.some((x) => x.link === 'candidate')) candidateQs += 1;
  }
  let responseRate;
  if (qs.length === 0) responseRate = { state: 'none' };
  else if (confirmedQs === 0) responseRate = { state: 'not_concluded', candidateCount: candidateQs };
  else responseRate = { ...rate(confirmedQs, qs.length), candidateCount: candidateQs };
  let timeToAnswer;
  if (qs.length === 0) timeToAnswer = { state: 'none' };
  else if (firstConfirmedDeltas.length === 0) timeToAnswer = { state: 'not_concluded' };
  else timeToAnswer = { state: 'value', minutes: median(firstConfirmedDeltas) };

  // ---- messages (per business day; days the pull has not reached are gaps, not zeros)
  const perDay = dayList.map((day) => {
    const cov = dayCoverage(sourceThroughMs, store, day, now);
    const { start, end } = businessDayWindow(day, store);
    const n = messages.filter((m) => { const t = parseMs(m.at); return t >= start && t < end; }).length;
    const pulled = cov === 'complete' || cov === 'partial_today';
    return { day, count: pulled || n > 0 ? n : null, coverage: cov };
  });
  const pulledDays = perDay.filter((d) => d.count !== null);
  const msgRows = messages.filter((m) => inWindow(m.at)).map(messageRow);
  const botReplies = msgRows.filter((m) => m.flags.replied).length;
  const confirmedSendIds = new Set();
  for (const m of messages) for (const r of readReplies(m).replies) if (r.link === 'confirmed' && r.send_id) confirmedSendIds.add(r.send_id);
  const unknownOrigin = sends.filter((s) => (s.kind === 'reply' || s.replies_to_message === 'yes') && inWindow(s.sent_at) && !confirmedSendIds.has(s.send_id)).length;

  return {
    days,
    scope,
    unconfirmedSchedule,
    runStatusUnconfirmed,
    patrolRate: !scope.slot ? { state: 'none' } : runStatusUnconfirmed ? { state: 'unconfirmed' } : rate(tally.slot.ok, tally.slot.den),
    dailyRate: !scope.daily ? { state: 'none' } : runStatusUnconfirmed ? { state: 'unconfirmed' } : rate(tally.daily.ok, tally.daily.den),
    stopped: { missing: tally.missing, blocked: tally.blocked, unknown: tally.unknown },
    questionsSent: qs.length,
    questionsIncomplete: questionsIncompleteFromMs != null && now > questionsIncompleteFromMs,
    responseRate,
    timeToAnswer,
    answersUnreadable: unreadable,
    messages: pulledDays.length ? { state: 'value', value: pulledDays.reduce((s, d) => s + d.count, 0) } : { state: 'unpulled' },
    messagesPerDay: perDay.slice().reverse(), // oldest -> newest for the bar chart
    botReplies: pulledDays.length ? { state: 'value', value: botReplies } : { state: 'unpulled' },
    unknownOriginReplies: unknownOrigin,
  };
}
