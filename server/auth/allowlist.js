// Server-side allowlist (AUTHORIZATION: "is this verified identity allowed to view?").
//
// One permission level only: allowed viewer (ARCH §5 rule 6; per-store permissions are out of scope, REQ §9).
// Deny by default. Where the list lives in production is UNCONFIRMED (Q-04); the prototype reads a JSON file that
// lives OUTSIDE public/ (never served) and reads it on every check, so add / remove / revoke takes effect on the
// very next request without a restart. Any problem with the file (missing, unreadable, invalid) denies everyone.
// Hosted deployments (e.g. the Vercel demo) can instead pass the same JSON in the environment variable
// NIKUSHO_ALLOWLIST_JSON, so real e-mail addresses never enter the repository; it is read once per deployment
// (changing it = edit the variable + redeploy). An invalid value also denies everyone.
//
// File format:
//   { "viewers": [ { "email": "someone@example.com", "name": "label for operators", "active": true, "sub": "optional" } ] }
//   email   required - the Google account e-mail (compared lower-case, exactly; no alias folding)
//   active  required - must be true to allow; false = revoked (keep the row for the record) or delete the row
//   name    optional - free label for whoever maintains the list; not a role, never used for decisions
//   sub     optional - Google account id; when present it must match too (pins the entry to one Google account)
import { readFileSync } from 'node:fs';

export class AllowlistError extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_KEYS = new Set(['email', 'name', 'active', 'sub']);

/** Validates the whole document; any defect rejects the whole list (fail closed). */
export function parseAllowlist(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.viewers)) throw new AllowlistError('allowlist must be {"viewers":[...]}');
  const byEmail = new Map();
  doc.viewers.forEach((v, i) => {
    if (!v || typeof v !== 'object') throw new AllowlistError(`viewers[${i}] is not an object`);
    for (const k of Object.keys(v)) if (!ALLOWED_KEYS.has(k)) throw new AllowlistError(`viewers[${i}] has unknown field "${k}"`);
    if (typeof v.email !== 'string' || !EMAIL.test(v.email.trim())) throw new AllowlistError(`viewers[${i}].email is invalid`);
    if (typeof v.active !== 'boolean') throw new AllowlistError(`viewers[${i}].active must be true or false`);
    if (v.sub !== undefined && (typeof v.sub !== 'string' || !v.sub)) throw new AllowlistError(`viewers[${i}].sub must be a non-empty string`);
    if (v.name !== undefined && typeof v.name !== 'string') throw new AllowlistError(`viewers[${i}].name must be a string`);
    const email = v.email.trim().toLowerCase();
    const prev = byEmail.get(email);
    // Duplicate rows: the safest reading wins (any inactive row revokes; conflicting subs revoke).
    if (prev) byEmail.set(email, { ...prev, active: prev.active && v.active, sub: prev.sub === v.sub ? prev.sub : '\u0000conflict' });
    else byEmail.set(email, { email, name: v.name ?? null, active: v.active, sub: v.sub ?? null });
  });
  return byEmail;
}

function decide(entries, identity) {
  if (!entries) return { allowed: false, reason: 'allowlist_unavailable' };
  const email = typeof identity?.email === 'string' ? identity.email.trim().toLowerCase() : null;
  if (!email || typeof identity?.sub !== 'string') return { allowed: false, reason: 'no_identity' };
  const e = entries.get(email);
  if (!e) return { allowed: false, reason: 'not_listed' };
  if (!e.active) return { allowed: false, reason: 'inactive' };
  if (e.sub && e.sub !== identity.sub) return { allowed: false, reason: 'sub_mismatch' };
  return { allowed: true, name: e.name };
}

/** In-code allowlist (tests). */
export function createStaticAllowlist(doc) {
  let entries = parseAllowlist(doc);
  return {
    kind: 'static',
    check: (identity) => decide(entries, identity),
    replace(next) { entries = parseAllowlist(next); },
  };
}

/** File-backed allowlist: the file is read on EVERY check (it is tiny), so a revocation can never be missed by a
 *  stale in-memory copy. Re-validated whenever its content changes; unusable file -> deny all. */
export function createFileAllowlist(path, { log = (m) => console.error(m) } = {}) {
  let lastText = null; let entries = null;
  const refresh = () => {
    let text;
    try { text = readFileSync(path, 'utf8'); } catch { if (lastText !== '\u0000missing') log('[auth] allowlist file not readable - denying everyone'); lastText = '\u0000missing'; entries = null; return; }
    if (text === lastText) return;
    lastText = text;
    try { entries = parseAllowlist(JSON.parse(text)); }
    catch (e) { entries = null; log(`[auth] allowlist rejected - denying everyone (${e instanceof AllowlistError ? e.message : 'not valid JSON'})`); }
  };
  return {
    kind: 'file',
    check(identity) { refresh(); return decide(entries, identity); },
  };
}

/** Allowlist from an environment variable (same JSON format). Parsed once; any defect denies everyone (fail closed). */
export function createEnvAllowlist(text, { log = (m) => console.error(m) } = {}) {
  let entries = null;
  try { entries = parseAllowlist(JSON.parse(String(text ?? ''))); }
  catch (e) { log(`[auth] NIKUSHO_ALLOWLIST_JSON rejected - denying everyone (${e instanceof AllowlistError ? e.message : 'not valid JSON'})`); }
  return {
    kind: 'env',
    check(identity) { return decide(entries, identity); },
  };
}
