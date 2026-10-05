// Question / answer rules. REQ §5-1, §5-3, §6-④; docs/data-mapping.md §7.
//  - candidate !== confirmed. Candidates are NEVER counted in the response rate.
//  - acked / answered / closed need evidence records; the display layer just shows what the registry says.
//  - answers_json that cannot be parsed is "unreadable" (shown "อ่านคำตอบไม่ได้"), never treated as empty.
import { ANSWER_LINK, QUESTION_STATE } from '../contract/enums.js';
import { parseMs } from './time.js';

export function parseJsonArray(text) {
  if (text == null) return { ok: true, items: [] };
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? { ok: true, items: v } : { ok: false, items: [] };
  } catch {
    return { ok: false, items: [] };
  }
}

/** Answers sorted by `at` (the registry need not be ordered; the screen must sort). */
export function readAnswers(q) {
  const parsed = parseJsonArray(q.answers_json);
  if (!parsed.ok) return { ok: false, answers: [] };
  const answers = [];
  for (const a of parsed.items) {
    if (!a || typeof a !== 'object' || !Number.isFinite(parseMs(a.at))) return { ok: false, answers: [] };
    answers.push({
      message_id: a.message_id ?? null,
      at: a.at,
      atMs: parseMs(a.at),
      who: a.who ?? null,
      text: a.text ?? null,
      link: ANSWER_LINK.includes(a.link) ? a.link : null,
    });
  }
  answers.sort((x, y) => x.atMs - y.atMs);
  return { ok: true, answers };
}

export const stateKey = (q) => (QUESTION_STATE.includes(q.state) ? q.state : 'unknown');

/** Q-27 (UNCONFIRMED) safe default: รอคำตอบ = waiting + candidate; มีคำตอบ = acked + answered; ปิดเรื่อง = closed. */
export function filterGroup(q) {
  const s = stateKey(q);
  if (s === 'waiting' || s === 'candidate') return 'waiting';
  if (s === 'acked' || s === 'answered') return 'answered';
  if (s === 'closed') return 'closed';
  return 'other';
}

/** Wait time in whole hours, `waiting` only: now - sent_at. */
export function waitHours(q, now) {
  if (stateKey(q) !== 'waiting') return null;
  const at = parseMs(q.sent_at);
  return Number.isFinite(at) ? Math.floor((now - at) / 3600000) : null;
}

/**
 * Evidence level of answers for a set of questions:
 *  CONFIRMED  - at least one confirmed answer / evidence state exists
 *  CANDIDATE  - only possibly-related answers exist
 *  UNKNOWN    - nothing to conclude from
 */
export function answerEvidenceLevel(questions) {
  let candidate = false;
  for (const q of questions) {
    const s = stateKey(q);
    const { ok, answers } = readAnswers(q);
    if (s === 'acked' || s === 'answered' || (ok && answers.some((a) => a.link === 'confirmed'))) return 'CONFIRMED';
    if (s === 'candidate' || (ok && answers.some((a) => a.link === 'candidate'))) candidate = true;
  }
  return candidate ? 'CANDIDATE' : 'UNKNOWN';
}
