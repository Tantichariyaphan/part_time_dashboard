# Auth Prototype — Google sign-in, server session, server-side allowlist

Status: **prototype, development configuration only. Not production.** Written 2026-10-05.
Authority: REQ §7-6, `docs/architecture.md` §5 (Authentication vs Authorization), `Claude.md` §7 rule 5. This file is the
operating procedure for the prototype (including the allowlist add/remove procedure, REQ §3 #6). It does not change the contract;
open items stay in the Q register (`docs/connection-spec.md` §12) and in `docs/implementation-notes.md` §5.

What has been verified: automated tests against a **local test IdP** (`tests/fakeGoogle.js`) that runs the real provider code end to end; and one real Google-account authorization check: non-allowlisted `goter5555@gmail.com` successfully signed in and was denied access (**PASS**; see §9).
What has **not** been verified: logout with a real Google account, revocation without logout, direct API access after revocation, real phones, and the client's environment — **TV3 and TV15 are not passed** (see §9).

## 1. Flow

```text
Browser ── GET /auth/login ─────────────► server: new state + nonce + PKCE verifier (kept server-side, 10 min, one-time)
        ◄─ 302 to Google + HttpOnly login-flow cookie (SameSite=Lax)
Browser ── Google sign-in (account chooser) ─► Google
        ◄─ 302 /auth/callback?code&state
Browser ── GET /auth/callback ──────────► server: flow cookie + state must match → code exchanged server-to-Google
                                          (client secret + PKCE) → ID token verified (RS256 signature against Google's
                                          JWKS, iss, aud, exp/iat, nonce, email_verified=true) → keeps {sub, email} only;
                                          access/refresh tokens are discarded
        ◄─ 302 to the entry + HttpOnly session cookie (SameSite=Strict, Secure on https) = random id, no identity inside
Browser ── GET /api/{live|demo}/… ──────► EVERY request:
                                            requireAuthenticatedUser()   cookie → server session (expiry, idle) → identity   else 401
                                            requireAllowlistedUser()     identity → allowlist (read now, active)            else 403
                                            grant() → api(verdict, …)     only now is Screen Data (or any copy of it) read
        ◄─ 200 data (no-store)  |  401 / 403 {"ok":false} with no data
```

Authentication (who is it: Google) and authorization (may they see it: allowlist) are separate steps, in that order (ARCH §5).
A Google account that signs in successfully but is not on the list gets a session (its identity is known) and **no data**.
Identity is never read from the browser: query parameters, request bodies, headers such as `X-Forwarded-Email`, and
`Authorization: Bearer <ID token>` are ignored (test AUTH-5b). There is no username/password login, and nobody's password is
ever requested or stored.

## 2. Files

| File | Role |
|---|---|
| `server/auth/config.js` | reads/validates the environment; refuses to start with incomplete config; never prints values |
| `server/auth/google.js` | Google OIDC provider: authorization URL, code exchange, ID-token verification. The **only** module that makes outbound requests, only to Google's fixed endpoints; imports no data code |
| `server/auth/session.js` | in-memory sessions and login flows; cookie helpers |
| `server/auth/allowlist.js` | allowlist parsing (fail closed) and the file-backed allowlist |
| `server/auth/authorize.js` | `requireAuthenticatedUser` → `requireAllowlistedUser` → `grant`; the session gate |
| `server/auth/routes.js` | `GET /auth/login`, `/auth/callback`, `/auth/logout` |
| `server/auth/index.js` | wires the above together |
| `server/auth/gate.js` | the earlier **dev loopback gate** (default mode; not authentication; synthetic data only) |
| `server/api.js` | data layer refuses any request without a gate-issued ALLOW verdict |
| `public/app/components/auth.js` | sign-in / access-denied panels and the signed-in line with logout |
| `config/allowlist.example.json` | format example with placeholder addresses only |

Public routes: `/`, `/demo/`, `/app/*`, `/styles/*` (the app shell carries no data), `/auth/me` (who am I — no data),
`/auth/login`, `/auth/callback`, `/auth/logout`. Everything under `/api/` requires the two checks. The service stays GET/HEAD-only;
HEAD is refused on login/callback/logout so it can never change a session.

## 3. Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `NIKUSHO_AUTH` | — | `dev-loopback` (default: old dev gate, synthetic data only) or `google` (this prototype) |
| `NIKUSHO_PUBLIC_ORIGIN` | google | origin the browser uses, e.g. `http://localhost:3000`. Must be `https://…` except for localhost. Requests with another `Host` are refused on `/api` and `/auth` |
| `GOOGLE_OAUTH_CLIENT_ID` | google | OAuth 2.0 client ID (type *Web application*) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | google | its secret — server environment only; never in source, never sent to the browser, never logged |
| `NIKUSHO_ALLOWLIST_FILE` | google | path of the allowlist JSON (keep it outside `public/`; `config/allowlist.json` is git-ignored) |
| `NIKUSHO_SESSION_IDLE_MINUTES` | — | default 60 (provisional, no REQ value) |
| `NIKUSHO_SESSION_MAX_HOURS` | — | default 12 (provisional, no REQ value) |
| `HOST`, `PORT`, `NIKUSHO_LIVE_ADAPTER`, `NIKUSHO_DEV_SCENARIO` | — | unchanged (README) |

Redirect URI to register in the OAuth client: `<NIKUSHO_PUBLIC_ORIGIN>/auth/callback`.

## 4. Google OAuth configuration (development)

1. In a Google Cloud project used **for development only**, configure the OAuth consent screen (user type *External*, so a personal Gmail
   account can sign in; scopes `openid` and `email` only).
2. Create *Credentials → OAuth client ID → Web application*; authorized redirect URI `http://localhost:3000/auth/callback`.
3. Put the client ID and secret in the environment of the shell that starts the server (not in a file inside the repository).
4. While the consent screen is in *Testing*, Google itself only lets listed test users sign in. That is Google's setting, not the
   allowlist: the allowlist is still checked on every request.

Production: the OAuth client, consent screen, domain, hosting and billing must be the **client's** (REQ §7-5, ARCH §12). Do not create the
production client under a developer's personal account. Not done here — **UNCONFIRMED / Q-01**.

## 5. Session behaviour

* Server-side, in process memory: random 256-bit id in the cookie; identity, creation time, last use and absolute expiry on the server.
* Cookie: `HttpOnly`, `Path=/`, `SameSite=Strict`, `Max-Age` = absolute lifetime; on https `Secure` and the `__Host-` prefix
  (`__Host-nikusho_sid`). The login-flow cookie is `SameSite=Lax` (Google → callback is a cross-site navigation) and lives 10 minutes.
* Validated on every protected request: unknown, malformed, tampered, expired (idle or absolute) or logged-out ids → 401.
* A new id is issued at every login; a pre-login id is destroyed (no fixation).
* No token is stored anywhere: not in the browser (no localStorage, no readable cookie), not on the server.
* A server restart ends all sessions (viewers sign in again). Fails closed.
* Storage choice: smallest option that meets the contract, no database (Claude.md §5, REQ §9). A multi-instance or serverless host needs a
  shared session store in the client's environment — **UNCONFIRMED / Q-01** (proposed Q-44).

## 6. Allowlist — configuration and add / remove / revoke procedure

Format (`config/allowlist.example.json`):

```json
{ "viewers": [
  { "email": "management@example.com",     "name": "Management / Executive", "active": true },
  { "email": "representative@example.com", "name": "Representative",         "active": true }
] }
```

* `email` (required): the Google account address; compared lower-case and exactly (no dot/alias folding).
* `active` (required): `true` allows; `false` revokes. Missing or non-boolean → the file is rejected.
* `name` (optional): a label for whoever maintains the list. **Not a role**; never used for decisions. There is one permission level
  (allowed viewer); per-store permissions are out of scope (REQ §9). Unknown fields such as `role` reject the file.
* `sub` (optional): Google account id; when present it must also match (pins the row to one Google account).
* Deny by default. The file is read on **every** check. If it is missing, unreadable, not valid JSON or fails validation, **everyone is
  denied** and the server logs why (without e-mail addresses). Duplicate rows: the safest reading wins (any inactive row revokes).

Procedure (prototype):

| Action | Do | Takes effect |
|---|---|---|
| Add a viewer | add a row with `"active": true` | next request (no restart, no re-login needed) |
| Revoke | set `"active": false` (keeps the record) **or** delete the row | next request; the viewer's open screen is replaced by "access denied" at its next request, and old sessions get 403 |
| Re-allow | set `"active": true` again | next request |

Edit a copy and replace the file in one step where possible; a half-written file is rejected (deny all), never read as "allow".
Who maintains the list and where it lives in production: **UNCONFIRMED / Q-04**.

## 7. Logout

`GET /auth/logout?return=/|/demo/` (the link "ログアウト"): destroys the server session, clears the cookie, sends
`Clear-Site-Data: "cache"`, redirects to the entry. The old cookie value is useless afterwards (test AUTH-6). The session cookie is
`SameSite=Strict`, so a link on another site cannot carry it.

## 8. Cache and revocation

* Order is structural: the gate runs first on every `/api` request; the data layer (`createApi`) additionally refuses anything but a
  verdict issued by the gate for that request. Denied requests never reach an adapter or any in-process copy (the demo snapshot is held
  in memory after its first read; test AUTH-10 warms it, revokes, and gets 403 with no data and no adapter call).
* Every API response, including 401/403, is `Cache-Control: no-store`; logout sends `Clear-Site-Data: "cache"`. There is no service
  worker and no browser storage of data.
* There is **no server-side Screen Data cache** in this skeleton. Its location, lifetime and purge-on-revoke mechanism remain
  **UNCONFIRMED / Q-05**. Whatever is chosen must sit behind `api(verdict, …)` so it inherits the same rule.

## 9. Tests

Run: `npm test` (all suites) or `node --test tests/auth.test.js` (auth only). Security suites: `tests/security.test.js`,
`tests/safety.test.js`, `tests/api.test.js`, `tests/auth.test.js`.

Automated (deterministic, local test IdP, synthetic data):

| Required check | Test |
|---|---|
| Unauthenticated → deny | AUTH-1, AUTH-9 |
| Google-authenticated allowlisted (management, representative) → allow | AUTH-2 |
| Authenticated, not allowlisted → deny | AUTH-3 |
| Inactive / revoked entry → deny | AUTH-4, AUTH-10 |
| Invalid / tampered / forged session → deny | AUTH-5, AUTH-5b |
| Logout invalidates the session | AUTH-6 |
| Expired session (idle, absolute) → deny | AUTH-7 |
| Authorization on every protected request | AUTH-8 |
| Direct API calls get nothing | AUTH-1, AUTH-9 |
| Revoked user gets nothing from cache | AUTH-10, AUTH-10b |
| GET/HEAD-only still holds | AUTH-11 (+ existing security/api tests) |
| ID-token verification (aud, iss, exp, iat, nonce, email_verified, signature, alg) | AUTH-12 |
| Login CSRF / replay / expired flow | AUTH-12b, AUTH-12c |
| Cookie flags, rotation, no token in the browser | AUTH-13, AUTH-13b |
| No open redirect, Host check, public/private files, demo separation, secrets/logs, allowlist rules, config | AUTH-14 … AUTH-21 |

Also checked once by hand in headless Chromium against the test IdP (not a shipped script): sign-in screen → login → dashboard with the
signed-in line → revoke → "access denied" with no data → logout → sign-in; outsider → denied; `/demo/` sign-in keeps the demo strip and
returns to `/demo/`; failed login message; no horizontal overflow at 375 px; `document.cookie` empty (HttpOnly).

**Manual, real-account evidence:**

| Check | Result | Evidence |
|---|---|---|
| Non-allowlisted Google account authorization | **PASS** | `goter5555@gmail.com` successfully logged in with Google and was denied access. Displayed: “You do not have access rights. This account is not authorized to view the administration panel.” |

**Manual, real-account checks — not yet verified (UNCONFIRMED / not yet verified):**

* **TV3** (type A) remains **BLOCKED**: the non-allowlisted-account check above passed, but revoke an allowed account and open right after →
  no data, including after a previously loaded screen, has not been performed with a real account. Direct API access after revocation is also not yet verified.
* **TV15** (type A): Maru (personal Gmail) and Takatsuji sign in on their phones with their real accounts and can view.
  Needs an https URL in the client's environment (phones cannot use the localhost redirect URI). Maru's part is only signing in with
  his own account; nobody asks for or handles his password (REQ §7-5).
* Logout with a real Google account has not been performed.

## 10. Local development

```sh
npm test
# dev gate (unchanged default; synthetic data; loopback only)
npm start
# Auth Prototype (macOS/Linux)
cp config/allowlist.example.json config/allowlist.json      # then put the real test addresses in it
NIKUSHO_AUTH=google NIKUSHO_PUBLIC_ORIGIN=http://localhost:3000 \
GOOGLE_OAUTH_CLIENT_ID=<dev client id> GOOGLE_OAUTH_CLIENT_SECRET=<dev secret> \
NIKUSHO_ALLOWLIST_FILE=config/allowlist.json npm start
```

```powershell
# Windows PowerShell
Copy-Item config/allowlist.example.json config/allowlist.json
$env:NIKUSHO_AUTH='google'; $env:NIKUSHO_PUBLIC_ORIGIN='http://localhost:3000'
$env:GOOGLE_OAUTH_CLIENT_ID='<dev client id>'; $env:GOOGLE_OAUTH_CLIENT_SECRET='<dev secret>'
$env:NIKUSHO_ALLOWLIST_FILE='config/allowlist.json'; npm start
```

Open `http://localhost:3000/` (exactly the origin configured; `127.0.0.1` is refused in this mode).

## 11. Remaining UNCONFIRMED items

| Item | Mark |
|---|---|
| Hosting / runtime in the client's Google environment; whether this Node design or an Apps Script design is used (REQ notes some Apps Script settings cannot read the viewer's e-mail) | UNCONFIRMED / Q-01 |
| Production OAuth client, consent screen, domain/URL, TLS — in the client's account | UNCONFIRMED / Q-01 |
| Session store on a multi-instance / serverless host; session lifetimes (60 min idle / 12 h are provisional) | UNCONFIRMED / Q-01, proposed Q-43, Q-44 |
| Allowlist location in production, who edits it, whether rows are pinned by `sub` | UNCONFIRMED / Q-04, proposed Q-45 |
| Server-side cache: location, lifetime, purge on revoke | UNCONFIRMED / Q-05 |
| Whether the demo entry requires sign-in (prototype: same check as live) | UNCONFIRMED / Q-01, Q-04 (ARCH §10), proposed Q-46 |
| Japanese wording of sign-in / denied screens; Google sign-in button branding | UNCONFIRMED / Q-24 |
| TV3, TV15 with real accounts | TV3 remains **BLOCKED**; its non-allowlisted-account authorization component is **PASS**, while revocation without logout and direct API access after revocation are not yet verified. TV15 is not yet verified. |

## 12. Production deployment prerequisites (not done)

1. Q-01 decided: hosting in the client's Google environment, client account, domain and billing; one https URL.
2. OAuth client and consent screen created in the client's Google Cloud project; redirect URI `<client URL>/auth/callback`;
   secret stored in the host's secret/environment store (client-owned).
3. Q-04 decided: allowlist location and maintainer; initial rows for the two viewers; procedure in §6 adapted to that store.
4. Q-05 decided before any server cache is added; the cache must sit behind `api(verdict, …)`.
5. Session store suitable for the host (Q-01); `NIKUSHO_PUBLIC_ORIGIN` = the https URL (enables `Secure` / `__Host-`).
6. A non-synthetic adapter exists (real pipeline) — only then is real data behind this gate.
7. TV3 and TV15 executed by the client side with the real accounts and recorded in `TEST_REPORT.md`.
