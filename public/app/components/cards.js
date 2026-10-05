import { h } from '../lib/dom.js';

export function Card({ title, sub, aside, href, class: cls } = {}, ...children) {
  const head = (title || aside) && h('div', { class: 'card-head' },
    h('div', null,
      title && h('h2', null, href ? h('a', { href }, title) : title),
      sub && h('div', { class: 'sub' }, sub)),
    aside);
  return h('section', { class: `card${cls ? ` ${cls}` : ''}` }, head, children);
}

/** Single figure. `value` must already be the correct text (0 and "not pulled" are different strings). */
export function MetricCard(label, value, sub, { text = false, href = null } = {}) {
  const parts = [h('div', { class: 'k' }, label), h('div', { class: `v${text ? ' text' : ''}` }, value), sub && h('div', { class: 's' }, sub)];
  return href ? h('a', { class: 'metric metric--link', href }, parts) : h('div', { class: 'metric' }, parts);
}

/** A row of navigation links (open / back only - REQ §6). links: [label, href][] ; falsy entries skipped. */
export function Links(links) {
  const items = links.filter(Boolean);
  return items.length ? h('div', { class: 'links' }, items.map(([label, href]) => h('a', { href }, label))) : null;
}

export const Metrics = (...cards) => h('div', { class: 'metrics' }, cards);

/** Notice box. level: 'warn' | undefined */
export function AlertCard(title, body, level) {
  return h('div', { class: `alert${level === 'warn' ? ' alert--warn' : ''}`, role: 'note' }, title && h('b', null, title), h('span', null, body));
}

/** Label/value grid used inside rows. items: [label, value][] ; null values are skipped by the caller. */
export function KeyValues(items) {
  return h('dl', { class: 'kv' }, items.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))));
}
