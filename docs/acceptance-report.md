# Pre-Source acceptance and contract verification

Scope: Dashboard skeleton with synthetic data (`devmock`, `demo`, `none`). **Not production. The real Source was not touched.**
Contract documents (`Claude.md`, `docs/architecture.md`, `docs/connection-spec.md`, `docs/data-mapping.md`) were not modified (also not by the 2026-10-05 Auth Prototype).
Source of Truth: Requirement 2026-10-02 draft 5 (REQ). Nothing here is client acceptance (REQ §8: the client judges pass/fail).

## How verdicts are assigned

* **PASS** — the criterion is fully checkable on synthetic data (REQ type B) and the executed evidence meets it.
* **BLOCKED** — the criterion needs the real Source / Copy Process / real accounts / deployment (REQ type A or C, or an environment that does not exist yet). The skeleton-level *preconditions* that could be executed are listed, but they are not a pass.
* **UNCONFIRMED / Q-xx** — the contract is silent, ambiguous, or contradictory for part of the criterion.
* **FAIL** — none remain open. Defects found during this review were fixed (section 6) and re-tested.

Evidence commands: `npm test` (135 tests: `tests/acceptance.test.js`, `edge.test.js`, `security.test.js`, `auth.test.js` (26, added 2026-10-05), `vercel.test.js` (6), `sample-shape.test.js` (7, added 2026-10-06), plus earlier suites) and
`PLAYWRIGHT_MODULE=… node scripts/ui-review.mjs <outDir>` (headless Chromium, in-process synthetic servers).

## 1. TV1–TV25

| TV | Type | Verdict | Executed evidence / why |
|----|------|---------|-------------------------|
| TV1 | A | **BLOCKED** — requires real Source | Needs 7 days of real registry. Precondition run: ⑦ figures are produced only from registry rows by the REQ §6-⑦ formulas (`edge.test.js`, `answers.test.js`). |
| TV2 | B | **BLOCKED** — requires real Source (test sheet + Read Copy) | No sheet is read. Precondition: every request recomputes from adapter output (no server cache); the page re-fetches every 60 s on the live entry; no write route exists (405). Timing budget belongs to Q-08. |
| TV3 | A | **BLOCKED** — requires real Source and real accounts; **UNCONFIRMED / Q-01, Q-04, Q-05** | Auth Prototype (2026-10-05, `docs/auth-prototype.md`): with the local test IdP, an account not on the allowlist gets 403 and no data on every resource of both entries; right after revocation (file edit, no restart) the old session gets 403 and no data, including after the in-process demo snapshot was warmed; the data layer refuses non-gate verdicts (`auth.test.js` AUTH-3/4/10/10b). Real-account evidence: non-allowlisted Google account `goter5555@gmail.com` successfully signed in and was denied with “You do not have access rights. This account is not authorized to view the administration panel.” (**PASS** for this authorization check). Logout, revocation without logout, and direct API access after revocation remain unverified; production cache (Q-05) does not exist yet. |
| TV4 | A | **BLOCKED** — requires real Source | Precondition: ② at 375 px has no horizontal overflow; first render 647–672 ms on loopback with mock volume. Real volume/hosting timing unknown (Q-01). |
| TV5 | B | **PASS** | `acceptance.test.js`: a row added to `stores` (+`schedules`) appears on ① and in the store list with no code change. New stores are NOT CONNECTED until the adapter says otherwise (Q-29). |
| TV6 | A | **BLOCKED** — requires real Source; **UNCONFIRMED / proposed Q-38** | Precondition: ① shows the 3 stores on one page, Nagoya as 未接続. Page height 1180 px vs 812 px viewport: "one screen" read as one page, not one viewport — interpretation not confirmed. |
| TV7 | A | **BLOCKED** — requires real Source; **UNCONFIRMED / Q-05** | No cache layer exists to delete; two consecutive responses are identical. |
| TV8 | A | **BLOCKED** — requires real Source | Precondition: 200 synthetic messages (Thai, Burmese, Japanese, emoji, HTML-looking, leading/trailing spaces, newlines) pass API→DOM character for character; replies render inside their source message block (`acceptance.test.js`, `ui-review.mjs` §8). |
| TV9 | A | **BLOCKED** — requires real Source | Copy Process, 3 real days, 10-minute path. |
| TV10 | B | **PASS** | `silent_ok`, `blocked`, `missing`, `running`, `unknown` and "table but no row" have distinct labels; tones distinct except missing/no-row (both dark red per REQ §6); no-row label is 未確認 (record なし). |
| TV11 | B | **PASS** | Two replies listed in `at` order; three messages / one reply: only the confirmed-sent one is "replied"; `carried` kept; reply with unknown result or ambiguous link is downgraded to `unknown`. |
| TV12 | B (real = C) | **UNCONFIRMED / Q-23, proposed Q-37** | Display part passes (answered stays answered; waiting shows wait time). Rebuild-without-reverting is Copy Process (Q-23, BLOCKED). REQ §6-⑦ (denominator = all questions sent) and TV12 ("no-reply case excluded from the rate") conflict; the skeleton follows §6-⑦. |
| TV13 | B | **PASS** | `meta=error`, `meta=stale`, `generated_at` 1 h old, unreadable tab, deleted required column → "stopped" with last-success time; UI greys every data card and tags "as of" (checked on all 7 pages × 3 stop scenarios); corrupt `answers_json`/`replies_json` → "cannot read" on that row only, never treated as empty. |
| TV14 | B | **PASS** | Production heartbeat stopped + standby alive: production red at 10:00/10:20/01:00; light check ok at 10:00, red at 10:20, 時間外 at 01:00; 15/16-minute boundaries. |
| TV15 | A | **BLOCKED** — requires real Source (real accounts on phones; Q-01) | Precondition: `<script>`, `<img onerror>`, `<svg onload>`, `<b>` in messages, questions, replies, alerts, reasons, senders: nothing executed, no element injected, text visible as characters on every page (`ui-review.mjs` §5). Sign-in path exists (Auth Prototype) and was exercised in headless Chromium at 375 px against the test IdP only; Maru's and Takatsuji's real accounts on phones need an https URL in the client's environment — not yet verified. |
| TV16 | A / C | **BLOCKED** — requires real Source (Bangkok real; Nagoya Phase 2) | Precondition: identical output under process TZ Tokyo / Bangkok / Los Angeles; identical page text for viewer time zones Tokyo / Bangkok / LA and locales ja/th/en; rollover exactly at 05:00; connected store with blank `slot_times` shows 対象外, not missing. |
| TV17 | A・B | **PASS** (B part) / **BLOCKED** (A part — real volume) | B: dummy rows excluded, empty/question-less period → "no qualifying items", days the pull has not reached are gaps not zeros. A: 30 days ×2 mock volume, all view models in < 3 s server-side; UI render < 1 s. |
| TV18 | A | **BLOCKED** — requires real Source (deployment, recovery demo; Q-01, Q-03) | Nothing is deployed. |
| TV19 | A | **BLOCKED** — requires real Source; notification **UNCONFIRMED / Q-02, Q-03** | Precondition: red "stopped" banner when newest `generated_at` > 20 min (19/20 normal, 21 stopped). Alert to Takatsuji is **not implemented** (channel undecided). |
| TV20 | A | **BLOCKED** — requires real Source | Needs `ログ`/`送信ログ`/`AI質問追跡`. |
| TV21 | A | **BLOCKED** — requires real Source; notification **UNCONFIRMED / Q-02, Q-03** | Same display precondition as TV19. |
| TV22 | B | **PASS** | Candidate and unrecognized links never counted as confirmed; only-candidate data → response rate and time-to-answer "not concluded"; candidate count shown separately. The registry builder's "0 wrongly confirmed links" is not testable here (Q-19, Q-22); the dashboard never infers links. |
| TV23 | B | **UNCONFIRMED / Q-20** | Request accepted / unknown / failed render as three distinct labels and no delivered/read wording exists anywhere in the UI strings. The second display ("not sent because of duplicate-send prevention") has no Screen Data value (`result` ∈ sent/unknown/failed) — source unknown (Q-20). |
| TV24 | A | **BLOCKED** — requires real Source (inspect the real Read Copy; Q-10, Q-13) | Precondition: Screen Data columns contain no `userId`/`宛先ID`/`画像URL`/`グループID`; only the 9 documented tabs; groups in fixtures limited to the five; no API response contains URLs or LINE-style ids. The dashboard does not filter groups itself (REQ: filter at the copy step). |
| TV25 | B | **PASS** | Day before the schedule change expects 2 slots, day of change 3 (`schedules` history); `running` past deadline → `unknown`; stop of the monitored machine → production red on ① + scheduled runs without rows become no_row. Actual 17:00 start date is data (Q-16). |

Totals: PASS 7 (TV5, 10, 11, 13, 14, 22, 25) · PASS-B/BLOCKED-A 1 (TV17) · UNCONFIRMED 2 (TV12, TV23) · BLOCKED 15 · FAIL 0.

## 2. UI review (headless Chromium)

Matrix: live and demo × 375 px and 1280 px × 7 pages = 28 renders, plus live scenarios (phase1, stale-messages, stopped, error, machine-down) and `none`, each at both widths = 84 more.
Checked on every render: horizontal overflow (document and any element wider than the viewport), `null`/`undefined`/`[object`/`NaN` text, console errors, page errors, HTTP ≥ 400, 7 nav links and `aria-current`, `lang=ja` and Japanese text, demo label (strip with สาธิต + title 【デモ】) present on demo and absent on live, render time < 3 s.
Result: **0 findings** after the fixes in section 6. Stop scenarios: red banner + grey + as-of tags on all 7 pages. Also exercised: loading state, 500 error state, 403 forbidden state, empty ③/④/⑤ lists, NOT CONNECTED (stores B/C, no Heartbeat Sheet, no live adapter), UNKNOWN (unknown runs, 不明 evidence badge, 時間外), stale greying, candidate/unconfirmed tags, XSS-looking text, viewer time zones.
Status hues equal the SAMPLE-03 variables for ok/silent/late/wait/blocked/missing; the `unknown` hue (#8a6a00) has no source value (UNCONFIRMED / Q-24).
Screenshots were viewed for ① demo, ② live and demo, ③, ④, ⑤, ⑥ (two scenarios), ⑦ at 375 px and ①, ⑦, stopped-④ at 1280 px. Not every one of the ~110 screenshots was inspected visually; the automated checks above cover all of them.

## 3. Business logic

See `tests/edge.test.js`, `acceptance.test.js`, `production.test.js`, `runs.test.js`, `freshness.test.js`, `answers.test.js`, `time.test.js`. All pass (135 tests in the full suite). Cases whose truth needs the real Source are listed as BLOCKED in section 1, not here.

## 4. Security

Methods (GET/HEAD only; POST, PUT, PATCH, DELETE, OPTIONS, TRACE, CONNECT refused), foreign Host → 403 on every resource of both entries with no data, no CORS grant, API `no-store`, only `/`, `/demo/`, `/app/*`, `/styles/*` served (src, server, docs, tests, package.json, demo JSON unreachable; traversal refused), errors carry no stack/path, no `innerHTML`-family or `eval`, no outbound network module or browser network channel anywhere, no absolute external URL, no secrets/LINE-style ids, loopback-only bind, startup refuses non-synthetic adapters behind the dev gate. Defect found and fixed: prototype-chain route names (section 6).
Auth Prototype (2026-10-05; `tests/auth.test.js`, local test IdP): unauthenticated → 401 / not allowlisted, inactive or revoked → 403 with no data on every resource; tampered/forged/expired/logged-out sessions → 401; browser-supplied identity (query, headers, bearer ID token) ignored; ID-token checks (signature, alg, iss, aud, exp, iat, nonce, email_verified); login CSRF/replay/expired flow; HttpOnly + SameSite=Strict (+ Secure/`__Host-` on https) cookie, rotated per login; no OAuth token, client secret or e-mail in responses or logs; no open redirect; Host check; GET/HEAD-only kept; outbound calls only from `server/auth/google.js` to Google's OAuth endpoints (static check). Two static tests were scoped for this (`safety.test.js`: Google OAuth URLs allowed only in `google.js`; the word "secret" allowed only in `server/auth/` while secret values and Google credential/token patterns are now checked everywhere; `security.test.js`: UI fetch targets pinned to `/api/…` and `/auth/me`).
Real-account Auth Prototype evidence: non-allowlisted Google account `goter5555@gmail.com` successfully signed in and was denied access with “You do not have access rights. This account is not authorized to view the administration panel.” (**PASS** for the non-allowlisted-account authorization check). Not yet verifiable: logout with a real Google account, revocation without logout, direct API access after revocation, production cache purge (Q-05), and TLS/hosting. TV3, Q-01, Q-04, and Q-05 remain **BLOCKED** / **UNCONFIRMED** as stated above.

## 5. Traceability

See `docs/traceability-matrix.md`.

## 6. Defects found by this review (all fixed, re-tested)

| ID | Defect | Contract basis | Fix |
|----|--------|----------------|-----|
| D-1 | ④ question cards carried `keep-color`, so under a "stopped" banner they stayed coloured and untagged | REQ §6 common rules (old numbers grey + "as of") | removed the class on question cards |
| D-2 | ① question total summed patrol rows only | REQ §6-① "sum `questions_sent` of today's rows" | sum all of today's run rows |
| D-3 | ③/② message header ran group and sender together ("MEATStaff A") | REQ §6-③ first line = time・group・sender | separate elements |
| D-4 | `/api/{entry}/constructor` returned the whole internal context (all Screen Data rows) and `/__proto__` returned 500, because route lookup used the prototype chain | REQ §6/§7 (UI binds to view models only); read-only boundary | own-key lookup only; test added |
| D-5 | Impossible dates (`2026-13-99`, `2026-02-30`) returned 200 "not pulled" | REQ §6 blank ≠ 0 (a made-up day must not look like a pulled one) | 400 for non-calendar dates; test added |
