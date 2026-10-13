import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';

export const PAGE_IDS = ['all', 'today', 'messages', 'questions', 'failures', 'machines', 'periods'];

/** Entry strip: makes demo / dev-mock impossible to mistake for production data. No switch between entries exists.
 *  On the live entry over the client copy it also says plainly when the copy is not connected / not readable: then the
 *  pages hold no data (never mock records) and the strip names the state and its reason code. */
export function EntryStrip(entry, adapterKind, sources = null) {
  if (entry === 'demo') return h('p', { class: 'strip strip--demo', role: 'note' }, S.demoStrip);
  if (adapterKind === 'devmock') return h('p', { class: 'strip strip--devmock', role: 'note' }, S.devStrip);
  const copy = adapterKind === 'copy' ? sources?.copy : null;
  if (copy && copy.state !== 'CONNECTED' && copy.state !== 'PARTIAL') {
    return h('p', { class: 'strip strip--live-down', role: 'alert' }, S.liveDownStrip(S.sources.state[copy.state] ?? copy.state, copy.reason));
  }
  return null;
}

/** Navigation: ①–⑦. Labels shown on wider screens; numbers only on phones (44px tap targets). */
export function Navigation(active, storeParam) {
  const suffix = storeParam ? `?store=${encodeURIComponent(storeParam)}` : '';
  return h('nav', { class: 'nav', 'aria-label': 'pages' }, PAGE_IDS.map((id) => {
    const p = S.pages[id];
    const href = id === 'all' ? '#/' : `#/${id}${id === 'failures' || id === 'machines' ? '' : suffix}`;
    return h('a', { href, 'aria-current': id === active ? 'page' : null, 'aria-label': p.title },
      h('span', { class: 'n', 'aria-hidden': 'true' }, p.n), h('span', { class: 'l' }, p.label));
  }));
}

export function PageHeader(active, storeParam) {
  return h('header', { class: 'shell-header' },
    h('div', { class: 'brandline' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
      h('span', { class: 'brand-name' }, S.appName),
      h('span', { class: 'brand-sub' }, S.appSub),
      h('h1', { class: 'page-title' }, S.pages[active].title)),
    Navigation(active, storeParam));
}
