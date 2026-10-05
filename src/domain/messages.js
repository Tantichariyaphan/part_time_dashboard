// Message / Bot-reply rules. REQ §5-1, §5-3, §6-③; docs/data-mapping.md §6, §8.
//  - handling=replied only when replies_json holds a reply with result=sent AND link=confirmed
//  - a send result `sent` means LINE accepted the request - never "delivered"/"read"
//  - links come only from registry keys; never inferred from text similarity
import { HANDLING, REPLY_LINK, REPLY_BY, SEND_RESULT } from '../contract/enums.js';
import { parseMs } from './time.js';
import { parseJsonArray } from './questions.js';

export function readReplies(m) {
  const parsed = parseJsonArray(m.replies_json);
  if (!parsed.ok) return { ok: false, replies: [] };
  const replies = [];
  for (const r of parsed.items) {
    if (!r || typeof r !== 'object' || !Number.isFinite(parseMs(r.at))) return { ok: false, replies: [] };
    replies.push({
      send_id: r.send_id ?? null,
      at: r.at,
      atMs: parseMs(r.at),
      by: REPLY_BY.includes(r.by) ? r.by : null,
      text: r.text ?? null,
      result: SEND_RESULT.includes(r.result) ? r.result : null,
      link: REPLY_LINK.includes(r.link) ? r.link : null,
    });
  }
  replies.sort((a, b) => a.atMs - b.atMs);
  return { ok: true, replies };
}

/** `replied` that the replies cannot prove is downgraded to `unknown`. */
export function effectiveHandling(m, replies) {
  if (!HANDLING.includes(m.handling)) return 'unknown';
  if (m.handling === 'replied') {
    const proven = replies.some((r) => r.result === 'sent' && r.link === 'confirmed');
    return proven ? 'replied' : 'unknown';
  }
  return m.handling;
}

/** Row-level view used by page ③ (and counts elsewhere). */
export function messageRow(m) {
  const { ok, replies } = readReplies(m);
  const handling = effectiveHandling(m, ok ? replies : []);
  const replyProblem = ok && replies.some((r) => r.result !== 'sent' || r.link !== 'confirmed');
  return {
    message_id: m.message_id,
    at: m.at,
    atMs: parseMs(m.at),
    group: m.group,
    sender: m.sender,
    kind: m.kind,
    text: m.text,
    handling,
    repliesOk: ok,
    replies: replies.map((r) => ({ ...r, minutesAfter: Math.max(0, Math.floor((r.atMs - parseMs(m.at)) / 60000)) })),
    question: m.question_id ? { question_id: m.question_id, link: m.question_link ?? null } : null,
    run_id: m.run_id,
    flags: {
      replied: handling === 'replied',
      problem: handling === 'failed' || handling === 'unknown' || replyProblem || !ok,
    },
  };
}
