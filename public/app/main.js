// App shell + hash router. Read-only: the UI only fetches from /api/{entry}/... and renders what it receives.
import { h, clear } from './lib/dom.js';
import { api, ApiError, authStatus, entryName } from './lib/api.js';
import { S } from './strings.ja.js';
import { hhmm } from './lib/format.js';
import { EntryStrip, PAGE_IDS, PageHeader } from './components/shell.js';
import { FreshnessIndicator } from './components/freshness.js';
import { ErrorState, LoadingState, NotConnectedState } from './components/states.js';
import { AuthBar, AuthHeader, DeniedPanel, SignInPanel } from './components/auth.js';
import * as allStores from './pages/allStores.js';
import * as today from './pages/today.js';
import * as messages from './pages/messages.js';
import * as questions from './pages/questions.js';
import * as failures from './pages/failures.js';
import * as machines from './pages/machines.js';
import * as periods from './pages/periods.js';

const PAGES = Object.fromEntries([allStores, today, messages, questions, failures, machines, periods].map((p) => [p.id, p]));
const root = document.getElementById('app');
const entry = entryName();
const REFRESH_MS = 60_000; // keeps "n minutes ago" honest so a left-open tab cannot look current when it is not

const open = new Set(); // ② expanded run rows (view state only)
let token = 0;
let last = null; // { env, page, ctx } for re-render without re-fetch
let auth = null; // GET /auth/me result; the server decides, this only picks which screen to show
let signedOut = false; // sign-in / denied screen is showing -> no data requests until the page is reloaded

function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const seg = path.replace(/^\//, '') || 'all';
  return { id: PAGE_IDS.includes(seg) ? seg : 'all', query: new URLSearchParams(qs ?? '') };
}

function go(page, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, v);
  location.hash = `#/${page === 'all' ? '' : page}${q.size ? `?${q}` : ''}`;
}

function frame(pageId, storeParam, info) {
  clear(root);
  const main = h('main', { class: 'content', id: 'main' }, LoadingState());
  const header = PageHeader(pageId, storeParam);
  if (auth?.mode === 'google' && auth.allowed) header.append(AuthBar(auth.email));
  root.append(...[header, EntryStrip(entry, info?.adapterKind ?? null), main].filter(Boolean));
  return main;
}

/** Sign-in or access-denied screen. Drops everything previously shown (a revoked viewer keeps nothing on screen). */
function showAuthScreen(panel) {
  signedOut = true; last = null; open.clear(); token++;
  clear(root);
  root.append(...[AuthHeader(), EntryStrip(entry, null), h('main', { class: 'content', id: 'main' }, panel)].filter(Boolean));
}

/** After a 401/403 from the API in Google mode: ask the server who we are now, then show the matching screen. */
async function handleAuthFailure(status) {
  let me = null;
  try { me = await authStatus(); } catch { /* fall through */ }
  if (me) auth = me;
  if (!me || !me.authenticated) return showAuthScreen(SignInPanel(status === 401 ? S.auth.expired : undefined));
  return showAuthScreen(DeniedPanel(me.email));
}

function applyFreshness(main, freshness) {
  main.prepend(FreshnessIndicator(freshness));
  if (freshness.state === 'stopped') {
    // Old numbers stay visible but greyed and tagged with their as-of time; never "normal", never "0".
    main.classList.add('is-stale');
    for (const card of main.querySelectorAll('.card:not(.keep-color)')) {
      card.prepend(h('span', { class: 'asof-tag' }, S.fresh.asOf(hhmm(freshness.sourceThrough))));
    }
  }
}

async function render({ quiet = false } = {}) {
  if (signedOut) return;
  const my = ++token;
  const { id, query } = route();
  const page = PAGES[id];
  const scroll = quiet ? window.scrollY : 0;
  let main = quiet && last ? document.getElementById('main') : frame(id, query.get('store'), null);
  try {
    const infoEnv = await api('entry');
    if (my !== token) return;
    const stores = infoEnv.data.stores.filter((s) => s.active && s.connection === 'connected');
    const store = stores.find((s) => s.store === query.get('store'))?.store ?? stores[0]?.store ?? null;
    if (!quiet) main = frame(id, store, infoEnv.data); // header/nav carry the resolved store
    const ctx = {
      query, stores, store, entry, go,
      isOpen: (k) => open.has(k),
      toggle: (k) => { open.has(k) ? open.delete(k) : open.add(k); rerender(); },
      rerender: () => rerender(),
    };
    let env;
    if (page.needsStore && !store) env = { ...infoEnv, data: null };
    else env = await page.load({ store, query });
    if (my !== token) return;
    last = { env, page, ctx, infoEnv };
    paint(main, env, page, ctx, infoEnv);
    if (quiet) window.scrollTo(0, scroll);
    else focusTarget(query);
  } catch (e) {
    if (my !== token) return;
    if (auth?.mode === 'google' && e instanceof ApiError && (e.status === 401 || e.status === 403)) return handleAuthFailure(e.status);
    clear(main);
    main.classList.remove('is-stale');
    main.append(ErrorState(e instanceof ApiError && e.status === 403 ? S.forbidden : undefined));
  }
}

function paint(main, env, page, ctx, infoEnv) {
  clear(main);
  main.classList.remove('is-stale');
  const fresh = env.freshness ?? infoEnv.freshness;
  main.append(env.data === null ? NotConnectedState(S.noStoresBody) : page.view(env, ctx));
  applyFreshness(main, fresh);
}

function rerender() {
  if (!last) return;
  paint(document.getElementById('main'), last.env, last.page, last.ctx, last.infoEnv);
}

function focusTarget(query) {
  const f = query.get('focus');
  if (!f) return;
  document.getElementById(`q-${f}`)?.scrollIntoView({ block: 'start' });
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const loginFailed = params.get('login') === 'failed';
  if (params.has('login')) history.replaceState(null, '', `${location.pathname}${location.hash}`);
  try { auth = await authStatus(); } catch {
    auth = null;
    clear(root); root.append(...[AuthHeader(), EntryStrip(entry, null), h('main', { class: 'content', id: 'main' }, ErrorState())].filter(Boolean));
    return;
  }
  if (auth.mode === 'google' && !auth.authenticated) return showAuthScreen(SignInPanel(loginFailed ? S.auth.loginFailed : undefined));
  if (auth.mode === 'google' && !auth.allowed) return showAuthScreen(DeniedPanel(auth.email));
  window.addEventListener('hashchange', () => render());
  render();
  if (entry === 'live') {
    setInterval(() => { if (document.visibilityState === 'visible') render({ quiet: true }); }, REFRESH_MS);
  }
}

boot();
