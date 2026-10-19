// Display-only grouping and shortening (client review of the live screens, 2026-10-19).
// Nothing here changes a count, a state or a candidate rule: the same items are only shown in a shorter form, and every
// item stays reachable with one tap ("すべて表示" / "個別に表示" / "行番号を表示"). No DOM here, so it is unit-tested.

const ms = (iso) => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? t : null; };

/**
 * ④ answers of one question: confirmed answers are always shown; when there are more than `n` candidates, only the `n`
 * candidates nearest to the question time are shown first (kept in time order). The rule that made them candidates is
 * not touched - the full list is one tap away.
 * @returns {{shown: object[], candidateCount: number, hiddenCount: number}}
 */
export function nearestCandidates(answers, sentAt, n = 3) {
  const list = answers ?? [];
  const cands = list.filter((a) => a.link !== 'confirmed');
  if (cands.length <= n) return { shown: list, candidateCount: cands.length, hiddenCount: 0 };
  const q = ms(sentAt);
  const dist = (a) => { const t = ms(a.at); return q == null || t == null ? Number.POSITIVE_INFINITY : Math.abs(t - q); };
  const keep = new Set([...cands].map((a, i) => ({ a, i, d: dist(a) })).sort((x, y) => x.d - y.d || x.i - y.i).slice(0, n).map((x) => x.a));
  const shown = list.filter((a) => a.link === 'confirmed' || keep.has(a));
  return { shown, candidateCount: cands.length, hiddenCount: list.length - shown.length };
}

const MEDIA = new Set(['photo', 'sticker']);
/** A message that can be folded into a media run: image / sticker, nothing attached that needs its own row. */
const foldable = (m) => MEDIA.has(m.kind) && !m.cancelled && !m.question && m.repliesOk !== false && !(m.replies?.length);

/**
 * ③ consecutive images / stickers from the same sender in the same group, each within `gapMin` of the previous one and
 * with the same handling, become one row. Runs of one stay a normal row.
 * @returns {Array<{type:'one', m:object} | {type:'media', items:object[]}>}
 */
export function groupMediaRuns(items, gapMin = 5) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length >= 2) out.push({ type: 'media', items: run });
    else for (const m of run) out.push({ type: 'one', m });
    run = [];
  };
  for (const m of items ?? []) {
    if (!foldable(m)) { flush(); out.push({ type: 'one', m }); continue; }
    const prev = run[run.length - 1];
    const t = ms(m.at); const pt = prev ? ms(prev.at) : null;
    const joins = prev && prev.group === m.group && prev.sender === m.sender && prev.handling === m.handling
      && t != null && pt != null && Math.abs(t - pt) <= gapMin * 60000;
    if (!joins) flush();
    run.push(m);
  }
  flush();
  return out;
}

/** Counts per kind of a media run, e.g. {photo: 18, sticker: 2}. */
export function kindCounts(items) {
  const c = {};
  for (const m of items) c[m.kind] = (c[m.kind] ?? 0) + 1;
  return c;
}

/**
 * ⑥ a text that ends with a long list of row numbers ("…: 行 670,2380,…") -> {head, rows}. Shorter lists, or text without
 * such a list, return null and are shown as they are.
 */
export function rowListSummary(text, min = 6) {
  if (typeof text !== 'string') return null;
  const m = /^(.*?)\s*[:：]?\s*(?:行|rows?)\s*[:：]?\s*([\d][\d\s,，、]*\d)\s*(?:[…\.]{1,3}|など|ほか)?\s*$/su.exec(text);
  if (!m) return null;
  const rows = m[2].split(/[\s,，、]+/).filter(Boolean);
  if (rows.length < min) return null;
  return { head: m[1].replace(/[\s:：]+$/u, ''), rows };
}

/** The head of a row-number list that talks about damaged / rounded long ids. */
export const isIdDamageText = (head) => /ID/.test(head ?? '') && /(長い|指数|数値|丸め|復元|rounded|exponent)/i.test(head ?? '');
