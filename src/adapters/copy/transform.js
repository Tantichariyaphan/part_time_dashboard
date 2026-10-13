// Transform: validated View-only Copy rows -> Screen Data raw tabs (REQ §5-3), the same shape the mock and demo
// adapters produce, so the existing normalize -> validate -> domain -> view-model pipeline is reused unchanged.
//
// Pure and idempotent: the output is a function of the current copy only (full rebuild, connection-spec §8.3).
// Reading the same copy twice gives identical output; a row the client updated in place (取消, 結果, state) simply
// rebuilds to its new value, and a row never appears twice because 元の行番号 is unique (checked in validate.js).
//
// Implemented only where the contract and the documented rules allow it:
//   ログ      -> messages   (IMPLEMENTED)
//   送信ログ   -> sends + Bot replies under messages (IMPLEMENTED; reply link only by the confirmed column-6 rule)
//   AI質問追跡 -> questions  (PARTIAL: rows as recorded + possibly-related answers by the REQ §5-1 rule, link=candidate only;
//                            no confirmed answer, no run/send link, no states beyond waiting/candidate; Q-21/Q-23/Q-52)
//   心拍      -> no run rows (BLOCKED: how to read run status is the client's decision, Q-49; `AI=scheduled-off` stays unclassified)
import { COPY_DATA_TAB_KEYS, COPY_TAB, COPY_TO_SCREEN, CANCEL_MARK, MESSAGE_KIND_MAP, OWNER_RECIPIENT, ROW_ID } from '../../contract/copyContract.js';
import { COLUMNS, OPTIONAL_COLUMNS } from '../../contract/columns.js';
import { CONTRACT_VERSION, TAB_NAME } from '../../contract/enums.js';
import { businessDayOf, dateString, formatIso, localParts } from '../../domain/time.js';
import { ID_DAMAGED, parseCopyTime } from './validate.js';

const byRowId = (a, b) => Number(a[ROW_ID]) - Number(b[ROW_ID]);
const orNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : v);
const tab = (key, rows) => ({ columns: [...COLUMNS[key], ...(OPTIONAL_COLUMNS[key] ?? [])], rows });

/** `送信ログ.結果` -> Screen Data `result` (data-mapping §6.3). Anything else stays unclassified (null). */
export function sendResult(text) {
  const s = String(text ?? '').trim();
  if (s.startsWith('OK')) return 'sent';
  if (s.startsWith('NG(')) return 'failed';
  if (s === 'ATTEMPTING_NO_RETRY') return 'unknown';
  return null;
}

function buildMessages(records, store, tz, unclassified) {
  const byId = new Map();
  for (const r of [...records].sort(byRowId)) {
    const damaged = r[ID_DAMAGED] === true;
    // A damaged messageId identifies nothing: the row is keyed by its own 元の行番号 and never merged with another row.
    const id = damaged ? `ROW-${r[ROW_ID].trim()}` : r.messageId.trim();
    const cancelled = r['取消'].trim() === CANCEL_MARK;
    const prev = damaged ? null : byId.get(id);
    if (prev) { // same messageId = one logical message (REQ §5-1); which row's values win is Q-17 -> the first copied row is kept
      prev.cancelled = prev.cancelled || cancelled; // a cancel on any row hides the content (safe side)
      prev.collapsed += 1;
      continue;
    }
    const kindRaw = r['種別'].trim();
    const kind = MESSAGE_KIND_MAP[kindRaw] ?? 'other';
    if (!MESSAGE_KIND_MAP[kindRaw] && !['video', 'file'].includes(kindRaw)) unclassified.messageKind += 1;
    byId.set(id, { r, kind, cancelled, damaged, collapsed: 0, atMs: parseCopyTime(r['日時'], tz) });
  }
  let collapsed = 0;
  const out = [...byId.entries()].map(([id, m]) => {
    collapsed += m.collapsed;
    return {
      store: store.store,
      message_id: id,
      at: formatIso(m.atMs),
      group: m.r['群'].trim(),
      sender: m.r['発言者'],
      kind: m.kind,
      text: m.kind === 'text' && !m.cancelled ? orNull(m.r['内容']) : null, // photo/sticker/other carry no text; cancelled never shows content (Q-17)
      handling: null, // set below only from a confirmed reply link; otherwise unknown (Q-18)
      replies_json: null,
      question_id: null, // set by linkCandidateAnswers() only when exactly one question matches (link=candidate, never confirmed)
      question_link: null,
      run_id: null, // message -> run link has no source column (Q-21)
      updated_at: null,
      cancelled: m.cancelled ? 'yes' : null, // display-only marker; representation in the ledger is Q-17 (option A, proposed)
      id_damaged: m.damaged ? 'yes' : null, // messageId lost by the sheet: shown as ROW-<元の行番号>; marker for ③ and ⑥
      _atMs: m.atMs,
    };
  });
  return { messages: out, collapsed };
}

function buildSends(records, store, tz, unclassified) {
  return [...records].sort(byRowId).map((r) => {
    const result = sendResult(r['結果']);
    if (result === null) unclassified.sendResult += 1;
    const cls = r['宛先の群'].trim();
    return {
      row: {
        store: store.store,
        send_id: `SL-${r[ROW_ID].trim()}`, // PIATEC-proposed id from the copy row identity (Q-11 PARTIAL)
        sent_at: formatIso(parseCopyTime(r['日時'], tz)),
        kind: null, // no source column for question/reply/daily/alert (Q-14)
        target_kind: cls === OWNER_RECIPIENT ? 'owner' : 'group',
        target_label: orNull(r['宛先']),
        text: orNull(r['文面']), // verbatim; owner-report lines arrive masked by the client (format Q-51)
        result,
        // column 6 names the message this send replied to -> it is a reply; whether its origin is known is decided below.
        replies_to_message: String(r['返した元の発言'] ?? '').trim() ? 'yes' : null,
      },
      cls,
      replyTo: String(r['返した元の発言'] ?? '').trim(),
    };
  });
}

/**
 * Bot-reply matching, data-mapping §8 (CONFIRMED rule): same day AND same recipient group AND HH:MM = column-6 time
 * AND 発言者 = column-6 sender. Exactly one candidate -> confirmed; two or more -> ambiguous; none -> no link.
 * Applied conservatively, so an open point can never turn a guess into a confirmed link:
 *  - "same day" is open (Q-19: calendar or business day): confirmed only when BOTH readings give the same single message;
 *  - the zone of the column-6 HH:MM is not documented (Q-12): it is read in the copy's configured time zone
 *    (NIKUSHO_COPY_TIMEZONE); without that setting no link is confirmed;
 *  - a reply cannot answer a later message: a single candidate written after the send is not linked.
 * Messages are indexed once (group|sender|HH:MM), so the cost grows linearly with the copy.
 */
function linkReplies(messages, sends, store, copyTz) {
  const counts = { confirmed: 0, ambiguous: 0, unlinked: 0, zoneUnknown: 0 };
  const index = new Map();
  if (copyTz) {
    for (const m of messages) {
      const p = localParts(m._atMs, copyTz);
      m._cal = dateString(p.y, p.mo, p.d);
      m._biz = businessDayOf(m._atMs, store);
      const key = `${m.group}|${String(m.sender).trim()}|${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(m);
    }
  }
  for (const s of sends) {
    if (!s.replyTo) continue;
    const m = /^(\d{1,2}):(\d{2})\|([\s\S]+)$/.exec(s.replyTo);
    if (!m || s.cls === OWNER_RECIPIENT) { counts.unlinked += 1; continue; }
    if (!copyTz) { counts.unlinked += 1; counts.zoneUnknown += 1; continue; }
    const sentMs = Date.parse(s.row.sent_at);
    const p = localParts(sentMs, copyTz);
    const cal = dateString(p.y, p.mo, p.d);
    const biz = businessDayOf(sentMs, store);
    const same = index.get(`${s.cls}|${m[3].trim()}|${m[1].padStart(2, '0')}:${m[2]}`) ?? [];
    const a = same.filter((x) => x._cal === cal);
    const b = same.filter((x) => x._biz === biz);
    if (a.length >= 2 || b.length >= 2) counts.ambiguous += 1; // "cannot tell which message"; not attached to any (Q-19)
    else if (a.length === 1 && b.length === 1 && a[0] === b[0] && a[0]._atMs <= sentMs) {
      counts.confirmed += 1;
      (a[0]._replies ??= []).push({ send_id: s.row.send_id, at: s.row.sent_at, by: null, text: s.row.text, result: s.row.result, link: 'confirmed' });
    } else counts.unlinked += 1;
  }
  for (const msg of messages) {
    const replies = (msg._replies ?? []).sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
    msg.replies_json = replies.length ? JSON.stringify(replies) : null;
    if (replies.some((r) => r.result === 'sent')) msg.handling = 'replied';
    else if (replies.some((r) => r.result === 'failed')) msg.handling = 'failed';
    for (const k of ['_replies', '_atMs', '_cal', '_biz']) delete msg[k];
  }
  return counts;
}

function buildQuestions(records, store, tz, unclassified) {
  return [...records].sort(byRowId).map((r) => {
    const state = r.state.trim() === 'waiting' ? 'waiting' : null; // other values need evidence records (REQ §5-3, Q-23) -> shown as unknown
    if (state === null) unclassified.questionState += 1;
    const sentMs = parseCopyTime(r['送信時刻'], tz);
    return {
      store: store.store,
      question_id: r.question_id.trim(),
      run_id: null, // slot -> run link: Q-21; polling-loop questions: Q-49 / Q-52
      send_id: null, // question -> send link: Q-21
      sent_at: formatIso(sentMs),
      group: r.group.trim(),
      who: orNull(r.who),
      question_text: orNull(r.question_th),
      state,
      closed_reason: null,
      closed_at: null,
      answers_json: null, // filled by linkCandidateAnswers(): link=candidate only; a confirmed answer needs evidence records (M-2)
      updated_at: null,
      _sentMs: sentMs,
    };
  });
}

/**
 * Possibly-related answers, REQ §5-1 (rule as written, nothing added):
 *   a ログ row whose group AND sender equal the question's `group` / `who`, that is later than the question's 送信時刻,
 *   and that is not 取消  ->  "คำตอบที่อาจเกี่ยวข้อง・ยังไม่ยืนยัน" (link = candidate).
 *  - NEVER `confirmed`: the copy cannot prove that a message answers a question (REQ §5-1; TV22 = 0 wrong confirmations).
 *    Candidates are excluded from the response rate and time-to-answer by src/domain/metrics.js.
 *  - No time window: the REQ sets none (answers may cross days, TV22), so none is invented here. A later unrelated
 *    message from the same person is still a candidate - that is exactly why it stays unconfirmed.
 *  - Comparison is exact after trimming spaces (group label, display name). No name folding, no userId (not in the copy).
 *  - Missing evidence -> no candidates: blank who/group, unreadable 送信時刻 or message time.
 *  - Strictly later (`>`): a message at the same instant as the question is not "after" it.
 *  - Message side (`question_id` / `question_link`): a message has room for one question. It is set (candidate) only when
 *    the message is a candidate for exactly ONE question; with two or more open questions to the same person it stays
 *    blank (the question side still lists it), so the message screen never points at a guessed question.
 *  - A question whose recorded state is `waiting` becomes `candidate` when at least one candidate exists (REQ §5-3:
 *    the current records support waiting / candidate only). Any other recorded state is left as it is.
 */
function linkCandidateAnswers(messages, questions) {
  const counts = { questionsWithCandidates: 0, candidateLinks: 0, messagesWithSeveralQuestions: 0 };
  const index = new Map(); // group|sender -> messages, ordered by time
  for (const m of messages) {
    if (m.cancelled === 'yes' || !Number.isFinite(m._atMs)) continue;
    const g = String(m.group ?? '').trim();
    const who = String(m.sender ?? '').trim();
    if (!g || !who) continue;
    const key = `${g}|${who}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(m);
  }
  for (const list of index.values()) list.sort((a, b) => a._atMs - b._atMs);
  const perMessage = new Map(); // message -> questions it is a candidate for
  for (const q of questions) {
    const g = String(q.group ?? '').trim();
    const who = String(q.who ?? '').trim();
    if (!g || !who || !Number.isFinite(q._sentMs)) continue;
    const answers = (index.get(`${g}|${who}`) ?? []).filter((m) => m._atMs > q._sentMs);
    if (!answers.length) continue;
    q.answers_json = JSON.stringify(answers.map((m) => ({ message_id: m.message_id, at: m.at, who: m.sender, text: m.text, link: 'candidate' })));
    if (q.state === 'waiting') q.state = 'candidate';
    counts.questionsWithCandidates += 1;
    counts.candidateLinks += answers.length;
    for (const m of answers) {
      if (!perMessage.has(m)) perMessage.set(m, []);
      perMessage.get(m).push(q.question_id);
    }
  }
  for (const [m, qids] of perMessage) {
    if (qids.length === 1) { m.question_id = qids[0]; m.question_link = 'candidate'; } else counts.messagesWithSeveralQuestions += 1;
  }
  for (const q of questions) delete q._sentMs;
  return counts;
}

/** Dashboard Data `meta` rows from the copy `meta` (proposed derivation, Q-09): all three times = copy `last_read_at`. */
function metaRow(screenKey, t, tz, nowMs) {
  const lastRead = t.meta ? parseCopyTime(t.meta.last_read_at, tz) : NaN;
  const iso = Number.isFinite(lastRead) ? formatIso(lastRead) : null;
  if (!t.ok) {
    const problems = [...new Set(t.findings.map((f) => f.problem))].join(', ');
    return {
      tab: TAB_NAME[screenKey], generated_at: formatIso(nowMs), last_success_at: iso, source_through: null, status: 'error',
      detail: t.findingCount
        ? `View-only Copy ${t.tab}: contract check failed (${t.findingCount}: ${problems})`
        : `View-only Copy ${t.tab}: blocked because the copy as a whole failed the contract check`,
      contract_version: CONTRACT_VERSION,
    };
  }
  return {
    tab: TAB_NAME[screenKey],
    generated_at: iso, // the data is as of the copy's last read of the Original Records
    last_success_at: iso,
    source_through: iso,
    status: orNull(t.meta.status?.trim()), // passed through; only REQ values ok/stale/error are understood (Q-50) - anything else stops the banner
    detail: orNull(t.meta.detail),
    contract_version: CONTRACT_VERSION,
  };
}

/**
 * @param {ReturnType<import('./validate.js').validateCopy>} v
 * @param {{store: object, timezone: string|null, nowMs: number}} opts  store = the configured store this copy belongs to
 * @returns {{raw: Record<string, {columns:string[], rows:object[]}>, report: object}}
 */
export function transformCopy(v, { store, timezone, nowMs }) {
  const unclassified = { messageKind: 0, sendResult: 0, questionState: 0 };
  const t = v.tabs;
  const { messages, collapsed } = buildMessages(t.log.ok ? t.log.records : [], store, timezone, unclassified);
  const sends = buildSends(t.sendLog.ok ? t.sendLog.records : [], store, timezone, unclassified);
  const questions = buildQuestions(t.questions.ok ? t.questions.records : [], store, timezone, unclassified);
  const answerLinks = linkCandidateAnswers(messages, questions); // before linkReplies(), which drops the message times
  const replyLinks = linkReplies(messages, sends, store, timezone);

  const raw = {
    meta: tab('meta', COPY_DATA_TAB_KEYS.map((k) => metaRow(COPY_TO_SCREEN[k], t[k], timezone, nowMs))),
    runs: tab('runs', []), // Q-49: no run row is derived from 心拍 until the client decides how run status is read
    questions: tab('questions', questions),
    sends: tab('sends', sends.map((s) => s.row)),
    messages: tab('messages', messages),
  };
  const report = {
    tabs: COPY_DATA_TAB_KEYS.map((k) => ({
      tab: COPY_TAB[k], state: t[k].ok ? 'ok' : 'blocked', rows: t[k].ok ? t[k].records.length : null,
      findingCount: t[k].findingCount, findings: t[k].findings.slice(0, 10),
      warningCount: t[k].warningCount ?? 0, warnings: (t[k].warnings ?? []).slice(0, 20),
      used: k === 'heartbeat' ? 'validated_only' : 'transformed',
    })),
    replyLinks,
    answerLinks, // counts only (no ids, names or text)
    collapsedMessageRows: collapsed,
    unclassified,
  };
  return { raw, report };
}
