# Implementation notes — Dashboard Skeleton milestone

Status: **skeleton with mock/demo data. Not production. The real Source is not connected.**
This file records what the skeleton does where the contract documents are silent, plus the new open questions found while building.
`Claude.md`, `docs/architecture.md`, `docs/connection-spec.md` and `docs/data-mapping.md` were **not modified**; the new questions below are *proposals* to add to the Q register (`docs/connection-spec.md` §12) once a human approves them.

## 1. Pipeline as built

```
Adapter (devmock | demo | none)  →  normalize/validate (Screen Data)  →  domain rules
        →  view models  →  read-only JSON API (GET/HEAD only)  →  7 pages (vanilla ES modules)
```

* The UI imports nothing from `src/`; it only fetches `/api/{live|demo}/…`. Business rules live in `src/domain/`.
* The real pipeline (Source → Copy Process → Read Copy) replaces **only the adapter**. Adapter contract: `src/adapters/types.js`.
* Two entries, no switch: `/` (live entry; permanent "DEV MOCK" strip) and `/demo/` (permanent "デモ表示 ｜ สาธิต" strip, frozen clock 2026-10-02T13:50:00+07:00, fixed anonymized snapshot).
* Startup refuses to run the dev gate in front of any adapter kind other than `devmock | demo | none` (`assertGateMatchesAdapters`).

## 2. Decisions taken where the documents are silent (all provisional)

| ID | Topic | What the skeleton does | Related |
|----|-------|------------------------|---------|
| N-01 | Stack / hosting | Zero-dependency Node 22 `http` harness + vanilla ES modules, so no framework choice is implied. | Q-01 |
| N-02 | Viewer identity | Dev loopback gate with Host-header check. It is **not** authentication; `realIdentity:false`. Still the default mode; the Auth Prototype (§5) is `NIKUSHO_AUTH=google`. | Q-04 |
| N-03 | NOT CONNECTED mechanism | Adapter returns `storeConnection{store:'connected'|'not_connected'}` outside the REQ §5-3 schema. Default for anything not stated = not connected. | Q-29 |
| N-04 | Freshness | Any required tab not `ok`, missing, unreadable, missing columns, unrecognized status, or `generated_at` > 20 min → whole screen "stopped". Old numbers stay visible but greyed and tagged with their as-of time. | Q-25 |
| N-05 | Not-due runs | `not_due` / `running` excluded from the success-rate denominator. | Q-26 |
| N-06 | Standby machine | Age is shown, never judged red (no documented threshold). | — |
| N-07 | Group filter on ④ | waiting = waiting + candidate; answered = acked + answered; closed = closed. | Q-27 |
| N-08 | Dummy ids | `DUMMY-`/`dummy-` prefixes excluded from every real summary, including `run_id`. | Q-28 |
| N-09 | Display clock | Times shown as stored (+07:00). No conversion for other-zone stores. | Q-12, Q-30 |
| N-10 | Japanese UI text | Provisional wording, all in `public/app/strings.ja.js`. | Q-24 |
| N-11 | Colours | Status hues taken from SAMPLE-03 and REQ §6 meanings. Brand red (≈#CD282C, from the Master Development Prompt) is used only for the brand mark, never for status. | — |
| N-12 | Time zone for `parse` | All stored timestamps must match `yyyy-MM-ddTHH:mm:ss+07:00`; other values are reported by `validateScreen`, never repaired. | — |
| N-13 | Required columns | A missing documented column on a required tab is treated as "unreadable"; extra columns are ignored. | — |
| N-14 | Boundary semantics | "older than 15 min" = strictly greater than 15; window start inclusive, end exclusive. | — |

## 3. Proposed new questions (not yet in the Q register)

* **Q-31 (proposed)** — Business-day assignment of the daily run: with `business_day_start` 05:00 and `daily_time` 00:35, strict application puts the 00:35 run in the *previous* business day, which differs from the layout shown in SAMPLE-03. The skeleton follows the written rule. Which is intended?
* **Q-32 (proposed)** — Should runs that are not yet due be excluded from the success-rate denominator (N-05), or counted?
* **Q-33 (proposed)** — Exact definition of `candidateCount` shown beside the response rate (distinct questions with only candidate answers, or number of candidate answer records?). The skeleton counts distinct questions.
* **Q-34 (proposed)** — Standby machine thresholds (N-06).
* **Q-35 (proposed)** — Whether a missing documented column on a required tab should stop the screen (N-13) or only mark that column UNKNOWN.
* **Q-36 (proposed)** — Source of the brand colour value (N-11); only the Master Prompt states it.
* **Q-37 (proposed)** — REQ §6-⑦ divides by *all* questions sent in the period; TV12 says a question closed with no reply is "excluded from the response rate". Which holds? The skeleton follows §6-⑦.
* **Q-38 (proposed)** — TV6 "today's status of 3 stores on one screen": one page, or one phone viewport without scrolling? (① is ~1180 px tall at 375 px.)
* **Q-39 (proposed)** — Today is never "completely pulled" until the business day ends. With 0 messages so far, show "0 items" (skeleton) or "not pulled"?
* **Q-40 (proposed)** — Questions whose `answers_json` is unreadable stay in the ⑦ denominator and are not counted as answered; confirm, or exclude them and show the count.
* **Q-41 (proposed)** — Page auto-refresh interval of the live entry (skeleton: 60 s); REQ gives only the 10-minute data path and the 5-minute test-change budget.
* **Q-42 (proposed)** — Range of the ③ date picker (skeleton: last 14 business days, borrowed from ⑤).

## 3a. Acceptance review (pre-Source)

Results are in `docs/acceptance-report.md`; the field-by-field trace is in `docs/traceability-matrix.md`.
Five implementation defects were found and fixed during that review (D-1…D-5 there). New provisional decisions made by the skeleton:

| ID | Topic | What the skeleton does |
|----|-------|------------------------|
| N-15 | Auto refresh | The live entry re-fetches every 60 s (Q-41). The demo entry never refreshes. |
| N-16 | Date picker | ③ offers the last 14 business days (Q-42). Real calendar dates only; others are 400. |
| N-17 | API routing | Only the nine declared resources are routes (own keys). |

## 4. Known limits of this milestone

* No real Source, Copy Process, Read Copy or cache exists here. Authentication exists only as the development Auth Prototype (§5), not verified with real accounts. Nothing in this repository touches the customer's Source.
* Numbers shown are mock/demo and not evidence of any real behaviour.
* Demo snapshot content is a draft pending client approval.
* Phase 2 (Nagoya) is shown as NOT CONNECTED by design.

## 5. Auth Prototype (2026-10-05)

Procedure, configuration and test map: `docs/auth-prototype.md`. Contract files were **not** modified: the prototype implements ARCH §5 /
REQ §7-6 as written; Q-01, Q-04 and Q-05 stay **open** (no production decision was taken).

| ID | Topic | What the prototype does | Related |
|----|-------|-------------------------|---------|
| N-18 | Authentication | Google OAuth 2.0 / OIDC authorization-code flow with PKCE (S256), state, nonce; ID token verified server-side (RS256 via Google JWKS, iss, aud, exp/iat, nonce, `email_verified=true`). Scope `openid email`. Access/refresh tokens discarded. | Q-01 |
| N-19 | Session | In-memory server session; random 256-bit id in an HttpOnly, SameSite=Strict cookie (`Secure` + `__Host-` on https); idle 60 min / absolute 12 h (provisional); new id per login; restart ends sessions. | Q-01, proposed Q-43, Q-44 |
| N-20 | Allowlist | JSON file outside `public/`, read on every check; rows `email`, `active`, optional `name` (label only) and `sub`; one permission level; deny by default; any file defect denies everyone. | Q-04 |
| N-21 | Order | `requireAuthenticatedUser` → `requireAllowlistedUser` → `grant` → `api(verdict, …)` on every `/api` request; the data layer refuses verdicts it did not see issued. 401 = not signed in, 403 = signed in but not allowed. | REQ §7-6, ARCH §5 |
| N-22 | Cache | No server cache added (Q-05 open). The only in-process copy (demo snapshot) sits behind the gate; all API responses `no-store`; logout sends `Clear-Site-Data: "cache"`. | Q-05 |
| N-23 | Demo entry | Same sign-in + allowlist as live (no data to anyone unverified). The demo HTML stays public; the demo strip shows on the sign-in screen too. | Q-01, Q-04, proposed Q-46 |
| N-24 | Outbound traffic | `server/auth/google.js` is the single module allowed to call out, only to Google's fixed OAuth endpoints; it imports no data code (static tests). | REQ §7-8 |
| N-25 | Logout over GET | The service stays GET/HEAD-only, so logout is `GET /auth/logout`; the Strict session cookie keeps other sites from triggering it with the viewer's session. | — |
| N-26 | Host check | In google mode `/api` and `/auth` refuse any `Host` other than `NIKUSHO_PUBLIC_ORIGIN`'s. | — |
| N-27 | Vercel demo | `api/server.js` + `vercel.json` (2026-10-06). Allowlist may come from `NIKUSHO_ALLOWLIST_JSON` (wins over the file; read once per deployment; invalid → deny all) so real e-mails stay out of Git. Misconfiguration → 503 with no data, reason in the log. Values trimmed. Mock/demo data only; not the client environment. | Q-01, Q-04, Q-44 |

Proposed questions (not yet in the Q register):

* **Q-43 (proposed)** — Session lifetime: idle timeout and maximum session length for viewers on phones (prototype 60 min / 12 h).
* **Q-44 (proposed)** — Session storage on the chosen host (part of Q-01): if the host is multi-instance/serverless, which client-named store holds sessions.
* **Q-45 (proposed)** — Allowlist rows keyed by e-mail only, or also pinned to the Google account id (`sub`) after the first verified sign-in.
* **Q-46 (proposed)** — Must the demo entry (11/12 presentation) require sign-in, as in the prototype, or be shown without an account?

Not verified: real Google sign-in, real accounts on phones, the client's environment → TV3 and TV15 remain not passed.
