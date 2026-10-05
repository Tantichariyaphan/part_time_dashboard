// Headless-Chromium UI review (dev tool, not part of the product). Starts the app in-process with synthetic adapters only.
//   PLAYWRIGHT_MODULE=/path/to/playwright node scripts/ui-review.mjs <outDir>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { createServer } from '../server/index.js';
import { createDevLoopbackGate } from '../server/auth/gate.js';
import { createDevMockAdapter } from '../src/adapters/mock/devMockAdapter.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';
import { createNoneAdapter } from '../src/adapters/none/noneAdapter.js';
import { buildMockTabs } from '../src/adapters/mock/fixtures.js';

const out = process.argv[2] ?? './ui-review-out';
mkdirSync(out, { recursive: true });
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const PAGES = ['', 'today', 'messages', 'questions', 'failures', 'machines', 'periods'];
const NAMES = ['all', 'today', 'messages', 'questions', 'failures', 'machines', 'periods'];
const findings = []; const log = (...a) => console.log(...a);
const bad = (where, what) => { findings.push(`${where}: ${what}`); log('  FINDING', where, what); };

async function listen(live) {
  const server = createServer({ live, demo: createDemoAdapter(), gate: createDevLoopbackGate() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const browser = await pw.chromium.launch({ executablePath: CHROMIUM });

async function review({ base, entry, width, scenario, tag, shots = true, tz }) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 812 : 900 }, locale: 'ja-JP', timezoneId: tz ?? 'Asia/Bangkok' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errs.push(`console ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && errs.push(`HTTP ${r.status()} ${r.url()}`));
  const result = {};
  for (const [i, p] of PAGES.entries()) {
    const where = `${tag} ${entry} ${width}px ${NAMES[i]}`;
    const t0 = Date.now();
    await page.goto(`${base}${entry === 'demo' ? '/demo/' : '/'}#/${p}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.querySelector('#main .loading') && document.querySelector('#main .fresh, #main .card, #main .state'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(150);
    const ms = Date.now() - t0;
    const info = await page.evaluate(() => {
      const main = document.getElementById('main');
      const text = document.body.innerText;
      const wide = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1; }).slice(0, 3).map((e) => `${e.tagName}.${e.className}`);
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, wide,
        badText: ['null', 'undefined', '[object', 'NaN'].filter((t) => text.includes(t)),
        nav: document.querySelectorAll('nav a').length, current: document.querySelector('nav a[aria-current="page"]')?.getAttribute('aria-label'),
        strip: document.querySelector('.strip')?.innerText ?? null, title: document.title, lang: document.documentElement.lang,
        banner: document.querySelector('.fresh')?.className ?? null, bannerText: document.querySelector('.fresh')?.innerText.slice(0, 80) ?? null,
        stale: main?.classList.contains('is-stale'), asof: document.querySelectorAll('.asof-tag').length, cards: document.querySelectorAll('#main .card').length,
        ja: /[぀-ヿ一-鿿]/.test(main?.innerText ?? ''), empty: document.querySelectorAll('.state-empty, .empty').length,
        nc: document.querySelectorAll('.state-notconnected, .nc, .evidence-not_connected, [class*="not_connected"], [class*="notconn"]').length,
        text: main?.innerText.slice(0, 60).replace(/\n/g, ' | '),
      };
    });
    result[NAMES[i]] = info;
    if (info.overflow) bad(where, `horizontal overflow; wide elements: ${info.wide}`);
    if (info.badText.length) bad(where, `bad text ${info.badText}`);
    if (info.nav !== 7) bad(where, `nav links ${info.nav}`);
    if (info.current !== (i === 0 ? '全店舗' : info.current)) bad(where, `aria-current ${info.current}`);
    if (!info.ja) bad(where, 'no Japanese text in main');
    if (info.lang !== 'ja') bad(where, `html lang=${info.lang}`);
    if (entry === 'demo' && !(info.strip?.includes('สาธิต') && info.title.includes('デモ'))) bad(where, 'demo label missing');
    if (entry === 'live' && (info.strip?.includes('สาธิต') || info.title.includes('デモ'))) bad(where, 'demo label on live entry');
    if (ms > 3000) bad(where, `render ${ms} ms > 3000`);
    if (info.banner?.includes('stopped') !== undefined && scenario === 'stopped-expected' && !info.stale) bad(where, 'expected stale greying');
    if (shots) await page.screenshot({ path: `${out}/${tag}-${entry}-${width}-${NAMES[i]}.png`, fullPage: true });
  }
  if (errs.length) bad(`${tag} ${entry} ${width}px`, `console/network errors: ${[...new Set(errs)].join(' ; ')}`);
  await ctx.close();
  return result;
}

// ---- 1. full matrix: both entries x both widths x 7 pages
{
  const { server, base } = await listen(createDevMockAdapter({ scenario: 'full' }));
  for (const entry of ['live', 'demo']) for (const width of [375, 1280]) { log('full', entry, width); await review({ base, entry, width, tag: 'full' }); }
  server.close();
}

// ---- 2. scenarios (live entry, phone + desktop)
for (const scenario of ['phase1', 'stale-messages', 'stopped', 'error', 'machine-down']) {
  const { server, base } = await listen(createDevMockAdapter({ scenario }));
  for (const width of [375, 1280]) {
    log(scenario, width);
    const r = await review({ base, entry: 'live', width, tag: scenario });
    if (['stale-messages', 'stopped', 'error'].includes(scenario)) {
      for (const [name, info] of Object.entries(r)) {
        if (!info.banner?.includes('stopped') && !/停止/.test(info.bannerText ?? '')) bad(`${scenario} ${width}px ${name}`, `no stop banner: ${info.bannerText}`);
        if (!info.stale) bad(`${scenario} ${width}px ${name}`, 'content not greyed');
        if (info.cards > 0 && info.asof === 0 && name !== 'machines') bad(`${scenario} ${width}px ${name}`, `cards=${info.cards} but no as-of tags`);
      }
    }
  }
  server.close();
}

// ---- 3. no live adapter at all
{
  const { server, base } = await listen(createNoneAdapter());
  for (const width of [375, 1280]) { log('none', width); await review({ base, entry: 'live', width, tag: 'none' }); }
  server.close();
}

// ---- 4. loading / error / forbidden / empty states
{
  const { server, base } = await listen(createDevMockAdapter({ scenario: 'full' }));
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  await page.route('**/api/live/entry', async (r) => { await new Promise((res) => setTimeout(res, 1500)); r.continue(); });
  await page.goto(`${base}/#/today`);
  await page.waitForTimeout(300);
  const loading = await page.evaluate(() => document.getElementById('main')?.innerText.slice(0, 40));
  await page.screenshot({ path: `${out}/state-loading-375.png` });
  log('loading state text:', JSON.stringify(loading));
  if (!loading || /null|undefined/.test(loading)) bad('loading state', `unexpected text ${loading}`);
  await ctx.close();

  for (const [status, label] of [[500, 'error'], [403, 'forbidden']]) {
    const c2 = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ja-JP' });
    const p2 = await c2.newPage();
    await p2.route('**/api/live/**', (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'x' }) }));
    await p2.goto(`${base}/#/messages`, { waitUntil: 'networkidle' }); await p2.waitForTimeout(300);
    const t = await p2.evaluate(() => document.getElementById('main').innerText);
    log(`${label} state:`, JSON.stringify(t.slice(0, 80)));
    await p2.screenshot({ path: `${out}/state-${label}-375.png` });
    if (!t.trim() || /null|undefined|\[object|stack|Error:/.test(t)) bad(`${label} state`, `text ${t}`);
    await c2.close();
  }
  // empty states: a day with no messages; ⑤ with nothing to list
  const c3 = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ja-JP' });
  const p3 = await c3.newPage();
  await p3.goto(`${base}/#/messages?store=STORE_A&date=2026-01-01`, { waitUntil: 'networkidle' }); await p3.waitForTimeout(300);
  const e = await p3.evaluate(() => document.getElementById('main').innerText.slice(0, 200).replace(/\n/g, ' | '));
  log('empty/unpulled messages day:', e);
  await p3.screenshot({ path: `${out}/state-empty-messages-375.png`, fullPage: true });
  await c3.close();
  server.close();
}
{
  const clean = { kind: 'devmock', scenario: 'clean', async load() {
    const now = Date.now(); const { raw, storeConnection } = buildMockTabs(now, { variant: 'dev', scenario: 'full' });
    raw.runs.rows = raw.runs.rows.map((r) => (['blocked', 'missing', 'late', 'unknown'].includes(r.status) ? { ...r, status: 'ok' } : r));
    raw.sends.rows = raw.sends.rows.map((s) => ({ ...s, result: 'sent' }));
    raw.questions.rows = []; return { kind: 'devmock', now, raw, storeConnection };
  } };
  const { server, base } = await listen(clean);
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  for (const p of ['questions', 'failures']) {
    await page.goto(`${base}/#/${p}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    const t = await page.evaluate(() => document.getElementById('main').innerText.slice(0, 160).replace(/\n/g, ' | '));
    log(`empty ${p}:`, t); await page.screenshot({ path: `${out}/state-empty-${p}-375.png`, fullPage: true });
  }
  await ctx.close(); server.close();
}

// ---- 5. TV15: markup-looking registry text is shown as characters and never executed
{
  const evil = ['<script>window.__pwned=1</script>', '<img src=x onerror="window.__pwned=2">', '<b>bold?</b>', '"><svg onload=window.__pwned=3>', '&lt;i&gt; &amp;'];
  const live = { kind: 'devmock', scenario: 'xss', async load() {
    const now = Date.now(); const { raw, storeConnection } = buildMockTabs(now, { variant: 'dev', scenario: 'full' });
    const bt = (rows, i, f) => rows.forEach((r, n) => { if (n % 3 === 0) r[f] = evil[(n + i) % evil.length]; });
    bt(raw.messages.rows, 0, 'text'); bt(raw.questions.rows, 1, 'question_text'); bt(raw.alerts.rows, 2, 'detail'); bt(raw.runs.rows, 3, 'reason'); bt(raw.sends.rows, 4, 'text');
    bt(raw.messages.rows, 0, 'sender'); bt(raw.questions.rows, 2, 'who');
    for (const m of raw.messages.rows) if (m.replies_json !== '[]') m.replies_json = m.replies_json.replace(/"text":"[^"]*"/, `"text":${JSON.stringify(evil[0])}`);
    return { kind: 'devmock', now, raw, storeConnection };
  } };
  const { server, base } = await listen(live);
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  for (const [i, p] of PAGES.entries()) {
    await page.goto(`${base}/#/${p}${['today', 'messages', 'questions'].includes(p) ? '?store=STORE_A' : ''}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
    if (p === 'today') { const b = page.locator('button.btn').first(); if (await b.count()) { await b.click(); await page.waitForTimeout(300); } }
    const r = await page.evaluate(() => ({ pwned: window.__pwned ?? null, injected: document.querySelectorAll('#app script, #app img, #app svg[onload], #app iframe').length,
      literal: document.body.innerText.includes('<script>') || document.body.innerText.includes('<img src=x') || document.body.innerText.includes('<b>bold?</b>') }));
    log(`TV15 ${NAMES[i]}:`, JSON.stringify(r));
    if (r.pwned !== null || r.injected > 0) bad(`TV15 ${NAMES[i]}`, `executed/injected ${JSON.stringify(r)}`);
    if (['messages', 'questions'].includes(p) && !r.literal) bad(`TV15 ${NAMES[i]}`, 'markup text not visible as characters');
    if (p === 'messages') await page.screenshot({ path: `${out}/tv15-messages-375.png`, fullPage: true });
  }
  if (dialogs.length) bad('TV15', `dialogs ${dialogs}`);
  await ctx.close(); server.close();
}

// ---- 6. TV16: viewer time zone / locale must not change what is shown (demo entry has a frozen clock)
{
  const { server, base } = await listen(createNoneAdapter());
  const grab = async (tz, locale) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale, timezoneId: tz });
    const page = await ctx.newPage(); const res = {};
    for (const [i, p] of PAGES.entries()) { await page.goto(`${base}/demo/#/${p}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(250); res[NAMES[i]] = await page.evaluate(() => document.getElementById('main').innerText); }
    await ctx.close(); return res;
  };
  const jp = await grab('Asia/Tokyo', 'ja-JP'); const th = await grab('Asia/Bangkok', 'th-TH'); const la = await grab('America/Los_Angeles', 'en-US');
  for (const n of NAMES) { if (jp[n] !== th[n] || th[n] !== la[n]) bad(`TV16 ${n}`, 'content differs by viewer time zone/locale'); }
  log('TV16 viewer tz/locale identical:', NAMES.every((n) => jp[n] === th[n] && th[n] === la[n]));
  server.close();
}

// ---- 7. TV4 / TV6 geometry on the phone
{
  const { server, base } = await listen(createDevMockAdapter({ scenario: 'full' }));
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  const t0 = Date.now(); await page.goto(`${base}/#/today?store=STORE_A`, { waitUntil: 'networkidle' }); const ms = Date.now() - t0;
  log('TV4 ② first render ms:', ms);
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300);
  const g = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight, vh: window.innerHeight, cards: [...document.querySelectorAll('#main .card')].map((c) => Math.round(c.getBoundingClientRect().height)) }));
  log('TV6 ① geometry:', JSON.stringify(g));
  await ctx.close(); server.close();
}

// ---- 8. TV8 precondition (DOM text == API text) and REQ §6 status colours
{
  const { server, base } = await listen(createDevMockAdapter({ scenario: 'full' }));
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  await page.goto(`${base}/#/messages?store=STORE_A&date=2026-10-02`, { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  const r = await page.evaluate(async () => {
    const api = await (await fetch('/api/live/messages?store=STORE_A&date=2026-10-02')).json();
    const want = api.data.items.filter((m) => m.kind === 'text').map((m) => m.text);
    const got = [...document.querySelectorAll('#main .msg > .msg-text')].map((e) => e.textContent);
    const missing = want.filter((t) => !got.includes(t));
    // a reply must follow its source message inside the same block
    const replyInside = [...document.querySelectorAll('#main .msg .reply')].every((e) => e.closest('.msg') !== null);
    return { total: want.length, missing: missing.length, replyInside, replies: document.querySelectorAll('#main .msg .reply').length };
  });
  log('TV8 DOM vs API:', JSON.stringify(r));
  if (r.missing) bad('TV8', `${r.missing} message texts differ between API and DOM`);
  if (!r.replyInside) bad('TV8', 'a Bot reply is outside its source message block');
  await page.goto(`${base}/#/`, { waitUntil: 'networkidle' });
  const colours = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return Object.fromEntries(['ok', 'silent', 'late', 'wait', 'unknown', 'blocked', 'missing'].map((k) => [k, cs.getPropertyValue(`--st-${k}`).trim().toLowerCase()])); });
  const sample03 = { ok: '#2e8b57', silent: '#9ccfb2', late: '#d9a400', wait: '#9a9892', blocked: '#c8372d', missing: '#8f1d16' };
  for (const [k, v] of Object.entries(sample03)) if (colours[k] !== v) bad('colours', `${k}: ${colours[k]} != SAMPLE-03 ${v}`);
  if (new Set(Object.values(colours)).size !== 7) bad('colours', 'status colours are not 7 distinct values');
  log('status colours:', JSON.stringify(colours));
  await ctx.close(); server.close();
}

await browser.close();
log('\nFINDINGS:', findings.length ? `\n - ${findings.join('\n - ')}` : 'none');
process.exit(findings.length ? 1 : 0);
