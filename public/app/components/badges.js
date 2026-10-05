import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';

/** Status = coloured dot + WORD (colour is never the only signal). tone: a `tone-*` class from status.js. */
export function StatusBadge(tone, label, { compact = false, wrap = false, title } = {}) {
  return h('span', { class: `badge ${tone}${compact ? ' compact' : ''}${wrap ? ' wrap' : ''}`, title }, label);
}

/** Data-level evidence label (CONFIRMED / CANDIDATE / UNKNOWN / NOT_CONNECTED). Neutral outline styles only. */
const GLYPH = { CONFIRMED: '✓', CANDIDATE: '≈', UNKNOWN: '?', NOT_CONNECTED: '⊘' };
export function EvidenceBadge(level) {
  const key = String(level ?? 'UNKNOWN');
  return h('span', { class: `evidence evidence--${key.toLowerCase()}`, title: key },
    h('i', { 'aria-hidden': 'true' }, GLYPH[key] ?? '?'), S.evidence[key] ?? key, h('span', { class: 'sr-only' }, ` ${key}`));
}

/** Time + colour dot, e.g. patrol 12:00 ●. Accessible name carries the status word. */
export function DotLabel(tone, text, statusWord) {
  return h('span', { class: `dotlabel ${tone}`, role: 'img', 'aria-label': `${text} ${statusWord}`, title: statusWord }, text);
}
