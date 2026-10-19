// Pre-release access check of a deployed dashboard (client condition 4, 2026-10-19). Read-only HTTP GETs, no sign-in.
//
//   node scripts/access-check.mjs --url https://<production host> [--preview https://<preview host>] [--json out.json]
//
// Checks, without any account:
//   A. not signed in: every /api/live/* and /api/demo/* resource answers 401 with no data
//   B. /auth/me says "not signed in" and carries no data
//   C. the page and every script / style it loads contain no key material and no source ids
//   D. a Preview deployment (if given): no data, signed in or not (host check / not the production deployment)
//   E. write methods are refused (405)
// What it cannot check (done by hand, with screenshots): a signed-in account that is NOT on the allowlist gets 403 and an empty
// screen; the allowlisted account (maru.yakimayo@gmail.com) sees the pages. Prints status codes and PASS / FAIL only - never a
// response body, so no business data can end up in a terminal capture.
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] ?? '']] : a), []));
const base = String(args.url ?? '').replace(/\/$/, '');
if (!/^(https:\/\/[^/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/.test(base)) { console.error('usage: node scripts/access-check.mjs --url https://<production host> [--preview https://<preview host>]'); process.exit(2); }
const preview = args.preview ? String(args.preview).replace(/\/$/, '') : null;

const RESOURCES = ['entry', 'all-stores', 'today', 'messages', 'questions', 'failures', 'machines', 'periods', 'run'];
// markers of key material or source configuration that must never reach a browser
const SECRET = /-----BEGIN [A-Z ]*PRIVATE KEY|"private_key"|private_key_id|NIKUSHO_READER_KEY|GOOGLE_OAUTH_CLIENT_SECRET|iam\.gserviceaccount\.com|docs\.google\.com\/spreadsheets|NIKUSHO_COPY_SPREADSHEET_ID/;
// a response carrying data has a data / items / stores field
const HAS_DATA = /"(data|items|stores|rows)"\s*:/;

const results = [];
const check = (group, name, ok, detail) => { results.push({ group, name, ok, detail }); };

async function get(u, init = {}) {
  try {
    const r = await fetch(u, { redirect: 'manual', ...init, headers: { 'cache-control': 'no-cache', ...(init.headers ?? {}) } });
    const text = await r.text();
    return { status: r.status, text, type: r.headers.get('content-type') ?? '', cache: r.headers.get('cache-control') ?? '' };
  } catch (e) { return { status: 0, text: '', error: e.cause?.code ?? e.name }; }
}

async function main() {
  // A. not signed in
  for (const entry of ['live', 'demo']) {
    for (const r of RESOURCES) {
      const x = await get(`${base}/api/${entry}/${r}`);
      check('A not signed in', `/api/${entry}/${r}`, x.status === 401 && !HAS_DATA.test(x.text), `HTTP ${x.status}`);
    }
  }
  // B. who am I
  const me = await get(`${base}/auth/me`);
  check('B /auth/me', '/auth/me', [200, 401].includes(me.status) && !HAS_DATA.test(me.text) && !/@/.test(me.text), `HTTP ${me.status}`);
  // C. page and assets
  const page = await get(`${base}/`);
  check('C page', '/ (HTML)', page.status === 200 && !SECRET.test(page.text), `HTTP ${page.status}`);
  const assets = new Set([...page.text.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]));
  const queue = [...assets];
  while (queue.length) { // follow ES-module imports so every script the browser would load is checked
    const path = queue.shift();
    const x = await get(`${base}${path}`);
    check('C assets', path, x.status === 200 && !SECRET.test(x.text), `HTTP ${x.status}`);
    if (path.endsWith('.js')) {
      for (const m of x.text.matchAll(/(?:import|from)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.js)['"]/g)) {
        const next = new URL(m[1], `https://x${path}`).pathname;
        if (!assets.has(next)) { assets.add(next); queue.push(next); }
      }
    }
  }
  check('C assets', `${assets.size} scripts / styles followed`, assets.size > 0, '');
  // D. preview deployment
  if (preview) {
    for (const r of ['entry', 'all-stores', 'messages', 'questions']) {
      const x = await get(`${preview}/api/live/${r}`);
      check('D preview', `preview /api/live/${r}`, x.status !== 200 && !HAS_DATA.test(x.text), `HTTP ${x.status}`);
    }
  } else check('D preview', 'not given (--preview)', false, 'skipped');
  // E. write methods
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const x = await get(`${base}/api/live/entry`, { method });
    check('E write refused', `${method} /api/live/entry`, x.status === 405 || x.status === 401 || x.status === 403, `HTTP ${x.status}`);
  }

  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`access-check ${new Date().toISOString()}  target: ${base.replace(/^https:\/\//, '')}${preview ? '  + preview' : ''}`);
  let group = '';
  for (const r of results) {
    if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} / ${results.length} PASS${failed.length ? `  - FAIL: ${failed.map((f) => f.name).join(', ')}` : ''}`);
  console.log('Manual (screenshots): a signed-in account NOT on the allowlist sees no data (403); the allowlisted account sees the pages.');
  if (args.json) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.json, JSON.stringify({ at: new Date().toISOString(), target: base, results }, null, 2));
  }
  process.exit(failed.length ? 1 : 0);
}
main();
