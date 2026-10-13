// Pattern analysis of `心拍.結果` for the run-status PROPOSAL (docs/run-status-proposal.md). Diagnostics only:
// nothing here is imported by the dashboard, and the dashboard keeps showing run status as "状態未判定" (Q-49)
// until the client approves an interpretation.
//
// Privacy: `結果` is system text written by the client's GAS, but its free-text parts can contain file names, slot times
// and error sentences. Only structure leaves this module: segment keys, short machine codes that match SAFE_CODE,
// counts, and digit-masked shapes in which every free-text part is replaced by `<text>`.

const SAFE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;
/** Known short values of the `送信MEAT` / `送信IN` columns and of the `MEAT=` / `IN=` segments (seen in the client sample). */
const SEND_WORDS = new Set(['無言', '送', '-', 'AIOK']);

/** `a / b / c` -> segments `{ key, value }` (a segment without `=` has key null). */
export function segments(text) {
  const s = String(text ?? '').trim();
  if (!s) return [];
  return s.split(' / ').map((part) => {
    const i = part.indexOf('=');
    return i > 0 ? { key: part.slice(0, i).trim(), value: part.slice(i + 1).trim() } : { key: null, value: part.trim() };
  });
}

/** The `AI=` segment: scheduled-off / max-read N件 / free text. */
function aiKind(value) {
  if (value == null) return { kind: 'absent', maxRead: null };
  if (value === 'scheduled-off') return { kind: 'scheduled-off', maxRead: null };
  const m = /^max-read (\d+)件$/.exec(value);
  if (m) return { kind: 'max-read', maxRead: Number(m[1]) };
  return { kind: 'free-text', maxRead: null };
}

/** Structured reading of one `結果` value. Free text is never returned, only its presence. */
export function parseResult(text) {
  const segs = segments(text);
  const get = (k) => segs.find((x) => x.key === k)?.value ?? null;
  const ai = aiKind(get('AI'));
  const stop = get('STOP');
  const owner = get('owner');
  const unanalysed = /^M(\d+)\/I(\d+)(\(AI無\))?$/.exec(get('未分析') ?? '');
  const shadow = segs.map((x) => (x.key === null ? /^規則影(\d+)件\(送らない\)$/.exec(x.value) : null)).find(Boolean);
  const known = new Set(['AI', 'STOP', 'owner', '未分析', 'MEAT', 'IN']);
  return {
    blank: segs.length === 0,
    ai: ai.kind,
    maxRead: ai.maxRead,
    stop: stop == null ? null : SAFE_CODE.test(stop) ? stop : '<text>',
    owner: owner == null ? null : SAFE_CODE.test(owner) ? owner : '<text>',
    meat: word(get('MEAT')),
    in: word(get('IN')),
    unanalysed: unanalysed ? { m: Number(unanalysed[1]), i: Number(unanalysed[2]), noAi: !!unanalysed[3] } : null,
    ruleShadow: shadow ? Number(shadow[1]) : null,
    unknownKeys: [...new Set(segs.filter((x) => x.key !== null && !known.has(x.key)).map((x) => (SAFE_CODE.test(x.key) ? x.key : '<key>')))],
    unparsedSegments: segs.filter((x) => x.key === null && !/^規則影\d+件\(送らない\)$/.test(x.value)).length,
  };
}

function word(v) {
  if (v == null) return null;
  return SEND_WORDS.has(v) ? v : '<other>';
}
export const sendWord = word;

/**
 * Pattern class of a row (the unit counted in the proposal):
 *   blank         no 結果
 *   scheduled_off AI=scheduled-off and no STOP: the hourly check had no scheduled AI result to deliver
 *   ai_result     AI=max-read N件 and no STOP: an AI patrol result was read
 *   stop          a STOP= segment is present
 *   other         anything else (free-text AI=, unknown keys) - never interpreted
 */
export function classOf(p) {
  if (p.blank) return 'blank';
  if (p.stop !== null) return 'stop';
  if (p.ai === 'scheduled-off') return 'scheduled_off';
  if (p.ai === 'max-read') return 'ai_result';
  return 'other';
}

/** Digit-masked shape of a 結果 value with free text replaced, e.g. `AI=max-read #件 / 未分析=M#/I# / MEAT=無言 / IN=無言`. */
export function shapeOf(text) {
  return segments(text).map(({ key, value }) => {
    if (key === null) return /^規則影\d+件\(送らない\)$/.test(value) ? value.replace(/\d+/g, '#') : '<text>';
    const k = SAFE_CODE.test(key) || ['未分析', 'MEAT', 'IN'].includes(key) ? key : '<key>';
    let v;
    if (k === 'AI') v = aiKind(value).kind === 'free-text' ? '<text>' : value.replace(/\d+/g, '#');
    else if (k === '未分析') v = /^M\d+\/I\d+(\(AI無\))?$/.test(value) ? value.replace(/\d+/g, '#') : '<text>';
    else if (k === 'MEAT' || k === 'IN') v = word(value);
    else v = SAFE_CODE.test(value) ? value.replace(/\d+/g, '#') : '<text>';
    return `${k}=${v}`;
  }).join(' / ') || '(blank)';
}

/**
 * PROPOSED reading of one scheduled patrol slot (docs/run-status-proposal.md §4). NOT used by the dashboard.
 * @param {{class: string, parsed: object, sendMeat: string|null, sendIn: string|null}[]} inWindow
 *        heartbeat rows whose time is in (scheduled, scheduled + slot_deadline_min], excluding blank / scheduled_off rows
 * @param {number} anyRowsInWindow number of heartbeat rows of any class in the same window
 * @param {{afterPollingChange: boolean}} opts  slot later than the client's 2026-10-05 23:36 change (connection-spec §0-14)
 * @returns {{proposed: string, basis: string}}
 */
export function proposeSlot(inWindow, anyRowsInWindow, { afterPollingChange }) {
  if (anyRowsInWindow === 0) return { proposed: 'unconfirmed', basis: 'no_heartbeat_row_in_window' };
  if (inWindow.length === 0) return { proposed: 'unconfirmed', basis: 'no_result_row_in_window' };
  if (inWindow.length > 1) return { proposed: 'unknown', basis: 'several_result_rows' };
  const r = inWindow[0];
  if (r.class === 'stop') return { proposed: 'blocked', basis: `stop:${r.parsed.stop ?? '<none>'}` };
  if (r.class !== 'ai_result') return { proposed: 'unknown', basis: `class:${r.class}` };
  const sent = [r.sendMeat, r.sendIn];
  if (afterPollingChange) return { proposed: 'completed_count_unknown', basis: 'ai_result_after_polling_change' };
  if (sent.includes('送')) return { proposed: 'ok', basis: 'ai_result_with_send' };
  if (sent.every((x) => x === '無言')) return { proposed: 'silent_ok', basis: 'ai_result_silent' };
  return { proposed: 'unknown', basis: 'ai_result_send_columns_unclear' };
}
