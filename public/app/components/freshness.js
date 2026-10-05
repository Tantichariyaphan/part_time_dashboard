import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { agoText, hhmm } from '../lib/format.js';

/**
 * "Data update" indicator shown at the top of EVERY page (REQ §6).
 *  normal  -> quiet pill: records through hh:mm (n min ago)
 *  stopped -> RED banner "update stopped (last success hh:mm)"; the page below is greyed (see main.js) and
 *             must never look current, normal or "0".
 */
export function FreshnessIndicator(f) {
  if (f.state === 'stopped') {
    return h('div', { class: 'fresh fresh--stopped', role: 'alert' },
      S.fresh.stopped(hhmm(f.lastSuccess)),
      f.sourceThrough && h('span', { class: 'small' }, `（${S.fresh.asOf(hhmm(f.sourceThrough))}）`),
      f.reasons.length > 0 && h('ul', null, f.reasons.map((r) =>
        h('li', null, `${r.tab}：${S.fresh.reasons[r.kind] ?? r.kind}${r.detail ? `（${r.detail}）` : ''}`))));
  }
  return h('div', { class: 'fresh', role: 'status' },
    f.sourceThrough
      ? h('span', null, S.fresh.ok(hhmm(f.sourceThrough), agoText(f.sourceThroughMinutesAgo)))
      : h('span', null, S.fresh.unknownThrough));
}
