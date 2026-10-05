// Static guards for the rules that must hold in every build of this skeleton.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (n === 'node_modules' || n === '.git') return [];
  return statSync(p).isDirectory() ? walk(p) : [p.split('\\').join('/')];
});
const code = ['public', 'src', 'server', 'scripts'].flatMap((d) => walk(join(ROOT, d))).filter((f) => /\.(js|html|css)$/.test(f));

test('UI never interprets registry text as markup', () => {
  for (const f of code.filter((x) => x.includes('/public/'))) {
    const t = readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(t), false, f);
  }
});

// The single exception: the Google OAuth/OIDC provider (Auth Prototype) may name Google's fixed OAuth endpoints - and
// nothing else. It receives no registry data (see security.test.js).
const GOOGLE_PROVIDER = '/server/auth/google.js';
const GOOGLE_OAUTH_URLS = new Set(['https://accounts.google.com/o/oauth2/v2/auth', 'https://oauth2.googleapis.com/token', 'https://www.googleapis.com/oauth2/v3/certs', 'https://accounts.google.com']);

test('no external services: UI/server code references no absolute http(s) URL', () => {
  for (const f of code) {
    const t = readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    for (const l of t) {
      if (f.endsWith(GOOGLE_PROVIDER)) {
        for (const u of l.match(/https?:\/\/[^'"`\s)]*/g) ?? []) assert.ok(GOOGLE_OAUTH_URLS.has(u), `${f}: unexpected URL ${u}`);
        continue;
      }
      assert.equal(/https?:\/\/(?!localhost|127\.0\.0\.1|\$\{host\})/.test(l), false, `${f}: ${l.trim()}`);
    }
  }
});

test('UI only reads: fetch is GET-only and no write verbs exist in the front end', () => {
  const api = readFileSync(join(ROOT, 'public/app/lib/api.js'), 'utf8');
  assert.equal(/method\s*:\s*['"](POST|PUT|PATCH|DELETE)/i.test(api), false);
  for (const f of code.filter((x) => x.includes('/public/app/'))) {
    assert.equal(/\.(sendBeacon|XMLHttpRequest)|<form|type="submit"|<input|<textarea/.test(readFileSync(f, 'utf8')), false, f);
  }
});

test('no secrets, tokens or LINE-style identifiers in the repository sources', () => {
  for (const f of code.concat(walk(join(ROOT, 'src/adapters/demo')))) {
    const t = readFileSync(f, 'utf8');
    // server/auth/ must NAME the OAuth client secret (read from the environment), so the word "secret" is allowed
    // there - but never a value: no string literal assigned to anything secret-like.
    const words = f.includes('/server/auth/') ? /(api[_-]?key|password|bearer\s+[A-Za-z0-9]|channel[_-]?access)/i : /(api[_-]?key|secret|password|bearer\s+[A-Za-z0-9]|channel[_-]?access)/i;
    assert.equal(words.test(t), false, f);
    assert.equal(/secret\w*['"]?\s*[:=]\s*['"`][^'"`]{4,}/i.test(t), false, `secret literal in ${f}`);
    assert.equal(/GOCSPX-|ya29\.|1\/\/0[A-Za-z0-9_-]{20,}|\d{6,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com/.test(t), false, `Google credential/token in ${f}`);
    assert.equal(/\b[UCR][0-9a-f]{32}\b/.test(t), false, `LINE-style id in ${f}`);
  }
});

test('demo snapshot is anonymized: no URLs, DEMO- ids only, demo store names', () => {
  const j = JSON.parse(readFileSync(join(ROOT, 'src/adapters/demo/demoScreenData.json'), 'utf8'));
  const text = JSON.stringify(j);
  assert.equal(/https?:\/\//.test(text), false);
  for (const key of ['runs', 'questions', 'sends', 'messages']) {
    const col = { runs: 'run_id', questions: 'question_id', sends: 'send_id', messages: 'message_id' }[key];
    for (const r of j.raw[key].rows) assert.match(r[col], /^(DEMO-|STORE_)/, `${key}.${col}=${r[col]}`);
  }
});

test('no hardcoded store, group or person names in the domain/UI layers (config-driven)', () => {
  for (const f of code.filter((x) => /\/(domain|viewmodels)\/|\/public\/app\//.test(x))) {
    assert.equal(/STORE_[A-Z]\b|MOCK-|DEMO-|Bangkok|Nagoya|Tokyo/.test(readFileSync(f, 'utf8')), false, f);
  }
});
