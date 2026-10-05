// Auth Prototype screens. They carry no dashboard data: the server sends none before authorization succeeds;
// these only tell the viewer what to do. The session cookie is HttpOnly, so the UI never sees or stores a token.
import { h } from '../lib/dom.js';
import { S } from '../strings.ja.js';
import { loginHref, logoutHref } from '../lib/api.js';

export function AuthHeader() {
  return h('header', { class: 'shell-header' },
    h('div', { class: 'brandline' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
      h('span', { class: 'brand-name' }, S.appName),
      h('span', { class: 'brand-sub' }, S.appSub)));
}

/** Unauthenticated (or session expired). `note` = optional reason line. */
export function SignInPanel(note) {
  return h('section', { class: 'state auth-panel', 'aria-labelledby': 'auth-title' },
    h('div', { class: 'big', id: 'auth-title' }, S.auth.signInTitle),
    note && h('p', { class: 'auth-note', role: 'alert' }, note),
    h('p', null, S.auth.signInBody),
    h('a', { class: 'btn btn--primary', href: loginHref(), id: 'sign-in' }, S.auth.signInButton));
}

/** Authenticated with Google but not (or no longer) on the allowlist. */
export function DeniedPanel(email) {
  return h('section', { class: 'state state--error auth-panel', role: 'alert', 'aria-labelledby': 'auth-title' },
    h('div', { class: 'big', id: 'auth-title' }, S.auth.deniedTitle),
    email && h('p', { class: 'auth-email' }, email),
    h('p', null, S.auth.deniedBody),
    h('a', { class: 'btn', href: logoutHref(), id: 'sign-out' }, S.auth.switchAccount));
}

/** Small signed-in line under the navigation (Google mode only). */
export function AuthBar(email) {
  return h('div', { class: 'authbar' },
    h('span', { class: 'authbar-who' }, `${S.auth.signedInAs}：`, h('span', { class: 'authbar-email' }, email ?? '')),
    h('a', { class: 'authbar-out', href: logoutHref(), id: 'sign-out' }, S.auth.logout));
}
