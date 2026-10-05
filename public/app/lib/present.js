// Text for "count with coverage" values produced by the domain layer. Presentation only - no business rules here.
// Blank (not pulled) and 0 are different texts (REQ §6).
import { S } from '../strings.ja.js';

/** {state:'count'|'value'|'zero'|'zero_so_far'|'unpulled'|'partial'|'none', value?} -> string */
export function countText(c) {
  if (!c) return S.notPulled;
  switch (c.state) {
    case 'count': case 'value': return `${c.value}${S.all.unit}`;
    case 'zero': case 'zero_so_far': return S.zero;
    case 'partial': return `${c.value}${S.all.unit}＋（一部未取得）`;
    case 'none': return S.none;
    default: return S.notPulled;
  }
}

/** Message body as displayed: photo / sticker / other kinds have no text in Screen Data (REQ §5-3), so a label is shown. */
export function messageBody(m) {
  if (m.kind === 'photo') return S.photo;
  if (m.kind === 'sticker') return S.sticker;
  if (m.kind === 'other') return S.otherKind;
  return m.text;
}

/** Hash links between pages (navigation only). */
export const href = {
  today: (store) => `#/today?store=${encodeURIComponent(store)}`,
  messages: (store, date, focus) => `#/messages?store=${encodeURIComponent(store)}${date ? `&date=${encodeURIComponent(date)}` : ''}${focus ? `&focus=${encodeURIComponent(focus)}` : ''}`,
  questions: (store, focus) => `#/questions?store=${encodeURIComponent(store)}${focus ? `&focus=${encodeURIComponent(focus)}` : ''}`,
  machines: () => '#/machines',
  failures: () => '#/failures',
};
