# NIKUSHO AI Monitoring System — Dashboard skeleton

**Not production.** This milestone is the Dashboard skeleton, the Screen Data contract, a mock/demo adapter and a read-only API boundary.
No real data is connected. Since **2026-10-07 the client builds and runs the Copy Script**; PIATEC reads only the client's View-only Copy and the Machine Heartbeat Spreadsheet with a dedicated reader account and never the Original Records. The connector for those two files is built (`NIKUSHO_LIVE_ADAPTER=copy`, tested on synthetic data) but stays **NOT_CONNECTED** until the reader account exists (Q-48). The project contract is in `Claude.md` and `docs/` (`docs/connection-spec.md` §0 for the 10/7 update); deviations and open questions are in `docs/implementation-notes.md`. `parttimedashboard.vercel.app` is prototype hosting only.

## Run (Node.js >= 22; no dependencies)

```
npm install        # no packages are installed; it only checks the environment and writes package-lock.json
npm test           # node --test "tests/*.test.js"   (178 tests)
npm start          # node server/index.js
```

* Live entry (DEV MOCK data): http://127.0.0.1:3000/
* Demo entry (fixed anonymized snapshot, สาธิต): http://127.0.0.1:3000/demo/
* Defaults: `HOST=127.0.0.1`, `PORT=3000`. The dev gate accepts loopback only; open the URL printed at start-up.
* Another port: `PORT=3001 npm start` (macOS/Linux) or `$env:PORT=3001; npm start` (Windows PowerShell).
* Mock scenario (live entry only): `NIKUSHO_DEV_SCENARIO=full|phase1|stale-messages|stopped|error|machine-down`; no live data at all: `NIKUSHO_LIVE_ADAPTER=none`.
* Client's View-only Copy (real data): `NIKUSHO_LIVE_ADAPTER=copy` with `NIKUSHO_AUTH=google` (refused behind the dev gate) and the
  server-side variables in `docs/implementation-notes.md` §8.3 (`NIKUSHO_COPY_SPREADSHEET_ID`, `NIKUSHO_HEARTBEAT_SPREADSHEET_ID`,
  `NIKUSHO_COPY_STORE`, `NIKUSHO_STORES_JSON`, optional `NIKUSHO_COPY_TIMEZONE`). Today both files show **NOT_CONNECTED** on ⑥:
  the reader account and its token source do not exist yet (Q-48).
* `npm run demo:snapshot` regenerates `src/adapters/demo/demoScreenData.json` (not needed to run).

## Viewer check (authentication / authorization)

* Default `NIKUSHO_AUTH=dev-loopback`: the dev gate. **Not authentication**; synthetic data only; loopback only.
* `NIKUSHO_AUTH=google`: the **Auth Prototype** — "Sign in with Google" → server-verified identity → server session (HttpOnly cookie) →
  server-side allowlist on every API request → read-only API. Needs `NIKUSHO_PUBLIC_ORIGIN`, `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, and `NIKUSHO_ALLOWLIST_JSON` or `NIKUSHO_ALLOWLIST_FILE` (format: `config/allowlist.example.json`).
  Vercel demo (mock data only): `api/server.js` + `vercel.json`, see `docs/auth-prototype.md` §10a.
  Setup, allowlist add/remove/revoke procedure, tests and open items: `docs/auth-prototype.md`.
  Not verified with real accounts (TV3/TV15 not passed); production hosting/OAuth client belong to the client (Q-01).

## Layout

```
src/contract/    exact tab names, columns, enumerations (REQ §5-3)
src/normalize/   raw tab -> Screen Data (blank stays blank), validation (never repairs)
src/domain/      all business rules (time, runs, freshness, questions, messages, production, metrics)
src/adapters/    mock (dev), demo (fixed snapshot), none, copy (client's View-only Copy: contract check + Transform)
server/source/   reader of the client's two spreadsheets (GET only, ids from server config) and the source configuration
src/viewmodels/  Screen Data -> page data
server/          read-only API (GET/HEAD), viewer check (server/auth: dev gate | Google + allowlist prototype), static files
config/          allowlist.example.json (placeholders; the real allowlist.json is git-ignored)
public/          the 7 pages (no business rules, text rendered as text nodes only)
tests/           domain, API, safety and auth tests (tests/fakeGoogle.js = local test IdP for the auth tests)
```

## Rules the code keeps

Blank is never 0 · candidate answers are never counted as confirmed · stale/error data is greyed and tagged, never "current" ·
no 0% without evidence · `DUMMY-` ids excluded · business day comes from the store, not the viewer · read-only: no write/rerun/approve/send controls ·
demo is a separate entry with no toggle.

Verification: `npm test`; `PLAYWRIGHT_MODULE=<path> node scripts/ui-review.mjs <outDir>` (headless Chromium UI review). Results: `docs/acceptance-report.md`, `docs/traceability-matrix.md`.
