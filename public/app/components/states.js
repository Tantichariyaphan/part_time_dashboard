import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { EvidenceBadge } from './badges.js';

export const LoadingState = () => h('div', { class: 'state', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'spinner' }), S.loading);

export const ErrorState = (message) => h('div', { class: 'state state--error', role: 'alert' },
  h('div', { class: 'big' }, S.errorTitle), h('div', null, message ?? S.errorBody));

export const EmptyState = (title, body) => h('div', { class: 'state' }, h('div', { class: 'big' }, title), body && h('div', null, body));

/** NOT CONNECTED: the store/feature has no data connection yet. Never rendered as "stopped" or "0". */
export function NotConnectedState(body = S.notConnectedBody) {
  return h('div', { class: 'state state--notconnected' },
    h('div', { class: 'big' }, EvidenceBadge('NOT_CONNECTED')), h('div', null, body));
}

/** UNKNOWN: records exist but cannot establish the answer. */
export const UnknownState = (body) => h('div', { class: 'state' }, h('div', { class: 'big' }, EvidenceBadge('UNKNOWN')), body && h('div', null, body));
