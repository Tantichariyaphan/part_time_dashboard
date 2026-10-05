// Read-only API client. The UI talks ONLY to /api/{entry}/...; it never touches raw data or any source.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const entryName = () => document.body.dataset.entry; // 'live' | 'demo' (set by the entry's own HTML file)

export async function api(resource, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, v);
  const url = `/api/${entryName()}/${resource}${q.size ? `?${q}` : ''}`;
  let res;
  try { res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' }); }
  catch { throw new ApiError(0, 'network'); }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || !body?.ok) throw new ApiError(res.status, body?.error ?? 'error');
  return body;
}

/** Who am I? Same-origin, no data. {mode:'google'|'dev-loopback', authenticated, allowed, email?} */
export async function authStatus() {
  const url = '/auth/me';
  let res;
  try { res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' }); }
  catch { throw new ApiError(0, 'network'); }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok || !body?.ok) throw new ApiError(res.status, body?.error ?? 'error');
  return body;
}

/** Same-origin links for the Google sign-in / logout redirects (navigation only - the session cookie is HttpOnly). */
export const loginHref = () => `/auth/login?return=${encodeURIComponent(entryName() === 'demo' ? '/demo/' : '/')}`;
export const logoutHref = () => `/auth/logout?return=${encodeURIComponent(entryName() === 'demo' ? '/demo/' : '/')}`;
