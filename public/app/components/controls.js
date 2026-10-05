import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { StatusBadge } from './badges.js';

/** Filter control (REQ §6: buttons are only "open / filter / back"). */
export function Select(label, options, value, onChange) {
  return h('label', { class: 'small muted' }, `${label} `,
    h('select', { class: 'select', onchange: (e) => onChange(e.target.value) },
      options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))));
}

export const StoreSelect = (stores, value, onChange) =>
  Select(S.store, stores.map((s) => [s.store, s.display_name]), value, onChange);

/** Toggle chips. options: [key, label][] ; active: key */
export function Chips(options, active, onPick) {
  return h('div', { class: 'chips', role: 'group' }, options.map(([k, label]) =>
    h('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === active), onclick: () => onPick(k) }, label)));
}

/** Status colour legend (same on every page that uses run statuses). */
export function Legend() {
  return h('div', { class: 'legend', 'aria-label': 'status legend' }, S.legend.map(([tone, label]) => StatusBadge(tone, label, { compact: true })));
}
