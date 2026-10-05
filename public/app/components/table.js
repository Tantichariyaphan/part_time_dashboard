import { h } from '../lib/dom.js';

/**
 * DataTable. columns: header cells (string | Node) ; rows: array of cell arrays (string | Node).
 * `variant: 'left'` left-aligns every column (text tables). Fixed layout + wrapping: no horizontal overflow on phones.
 */
export function DataTable({ columns, rows, variant, caption }) {
  return h('div', { class: 'tablewrap' },
    h('table', { class: `table${variant === 'left' ? ' left' : ''}` },
      caption && h('caption', { class: 'sr-only' }, caption),
      h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((cell, i) => (i === 0 ? h('th', { scope: 'row' }, cell) : h('td', null, cell))))))));
}
