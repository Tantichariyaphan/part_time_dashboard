# Implementation notes — Dashboard Skeleton milestone

Status: **skeleton with mock/demo data. Not production. No real data is connected** (2026-10-07: the client builds the Copy Script; PIATEC reads only the client's View-only Copy — §7. The View-only Copy connector is built and tested on synthetic data but stays NOT_CONNECTED until the reader account exists — §8, Q-48).
This file records what the skeleton does where the contract documents are silent, plus the new open questions found while building.
`Claude.md`, `docs/architecture.md`, `docs/connection-spec.md` and `docs/data-mapping.md` were **not modified**; the new questions below are *proposals* to add to the Q register (`docs/connection-spec.md` §12) once a human approves them.

## 1. Pipeline as built

```
Adapter (devmock | demo | none | copy)  →  normalize/validate (Screen Data)  →  domain rules
        →  view models  →  read-only JSON API (GET/HEAD only)  →  7 pages (vanilla ES modules)
```

* The UI imports nothing from `src/`; it only fetches `/api/{live|demo}/…`. Business rules live in `src/domain/`.
* The real pipeline (client Copy Script → View-only Copy → PIATEC reader/Transform) replaces **only the adapter**. Adapter contract: `src/adapters/types.js`.
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

* No reader of the View-only Copy, no Transform and no cache exist here (the Copy Script is the client's since 10/7). Authentication exists only as the development Auth Prototype (§5), not verified with real accounts. Nothing in this repository touches the customer's Source.
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

## 6. Prototype aligned with the Source sample of 2026-10-05 (2026-10-06)

Input: `docs/sample data_20261005/` (client extract of the Bangkok Source, 2026-09-28 – 10-04: `ログ` 1,211 rows, `送信ログ` 53,
`AI質問追跡` 12, `心拍` 98, plus `_抜き出しの記録.json`). The sample is **evidence for open questions, not a contract**: nothing below is
CONFIRMED until the client approves the connection spec. The files contain real staff names and business text, so they are
git-ignored and **no sample content was copied** into fixtures, the demo snapshot or tests — only shapes.

### 6.1 What the sample shows (structure only)

| Finding | Bears on |
|---|---|
| The extract already differs from the raw header: `ログ` has `群` (resolved group) instead of `グループID`, `発言者キー（userIdの代わり）` instead of `userId`, no `画像URL`; `送信ログ` has `宛先キー（宛先IDの代わり）` and names column 6 `返した元の発言 HH:MM\|発言者`. 16 other-group and 12 other-recipient rows were dropped at extraction | Q-10 (surrogate keys, resolved group), Q-13 |
| `送信ログ.宛先` values: `MEAT`, `IN`, `ALL`, `PHOTO`, `OWNER` | Q-13, Q-14 |
| `種別` values: `text`, `image`, `sticker`, `video`, `file`; `内容` = `[image]` / `[sticker]` / `[video]` / `[file]` for non-text. Images are 82 % of rows (mostly `PHOTO`) | Q-12 (`video`/`file` → `other`) |
| `再送` rows (6) carry their **own** `messageId` (no `messageId` repeats in 1,211 rows), so merging "same `messageId`" does not merge resends | Q-17, Q-11 |
| `取消` rows: 29 (2.4 %). Screen Data still has no cancel representation | Q-17 (prototype unchanged: no cancel display) |
| `結果`: `OK` (44) and `OK 200` (9); no `NG(` / `ATTEMPTING_NO_RETRY` this week | §6.3 mapping (both → `sent`) |
| Column 6 filled in 15 / 53 rows, all from 10/02; replies 1–5 min after the message, plus batches hours later | §8, Q-19 |
| `AI質問追跡`: all `waiting`; groups `MEAT` / `IN` only; `slot` = `yyyy-MM-dd HH:mm`; `question_id` = `<yyyyMMddHHmm of slot>-<group>-<8 hex>`; `送信時刻` ≈ slot + 73 min | Q-21 (question → run via `slot`), Phase-1 states |
| `心拍`: one row per hour at :13 (`gap分` 60), not one per scheduled patrol; `送信MEAT` / `送信IN` ∈ {`無言`, `送`, `-`}; `結果` = tokens joined by ` / ` (`AI=…`, `未分析=M…/I…`, `MEAT=…`, `IN=…`, `規則影…`, `STOP=…`, `owner=…`) plus free-text errors | **Q-15** — interpretation table still needed; the prototype does not interpret `結果` |
| Timestamps `yyyy/MM/dd H:mm:ss`, no zone | Q-12 |
| Daily report sent at 00:41 to `ALL` and `OWNER`; owner also receives alert-type texts | Q-14 (`kind`) |

### 6.2 What changed in the prototype

| ID | Change | Basis |
|----|--------|-------|
| N-28 | Mock fixtures: questions only to MEAT / IN with one send per group; `question_id` carries the slot (`<prefix>-q-<yyyyMMddHHmm>-<group>-<n>`); daily report to ALL and OWNER; owner alert sends after `unknown` / `blocked` patrols; PHOTO image bursts and `other` kind rows; emoji in display names. Demo snapshot regenerated from the same generator (still a draft pending client approval) | sample shapes (§6.1) |
| N-29 | Cross-page references in view models, by registry keys only: message → run (`run_id`) and → question (`question_id`, link strength unchanged); question → run (`run_id`) and → send (`send_id`, LINE-accepted result); answer → its business day on ③; run detail → run record + its question sends; ⑤ rows → ② / ③; unknown keys are reported as "not found", never guessed | REQ §6 drill-downs, data-mapping §7–§8 |
| N-30 | Detail views (open / close only): ③ message details (message_id, kind, handling, run_id, reply send_ids); ② run detail adds `posted_at`, `received_at`, `updated_at`, `evidence` **as stored** (provenance UNCONFIRMED, Q-15); ⑤ row details; ⑥ beats of the last 60 min per machine and `generated_at` age per tab (no new threshold) | REQ §6; extra detail wording Q-24 |
| N-31 | `other` kind shown as "(その他の種別：動画・ファイル等)" | data-mapping §5.6 (`other`), Q-12 |
| N-32 | `docs/sample data_*/` added to `.gitignore` | Claude.md §7 (real names/text), §11 |

Not changed: Source → Read Copy integration (none), business rules, statuses, candidate handling (candidates are never shown or counted
as confirmed), forbidden-field handling, read-only API, auth.

## 7. Client architecture update — 2026-10-07

Authority: `docs/connection-spec.md` §0 (facts), §4 (Data Contract v1), §11.1 (actions), §12.1 (Q status, Q-47 … Q-53). The four contract
files and this file were updated; no prototype behaviour was removed.

### 7.1 Assumptions that changed

| Before | Now |
|---|---|
| PIATEC builds the Copy Process; the Client Developer installs it; Maru approves once | **The client builds, runs and maintains the Copy Script** (every 5 min). PIATEC's old Copy Process prototype v0.1.0 is superseded (not in this repo) |
| Read Copy layout, timestamps, keys, `グループID` retention: PIATEC proposes (Q-10, Q-11) | Fixed by the client: **Data Contract v1** + copy `meta` (`last_read_at`, `updated_at`, …); row identity `元の行番号`, in-place update, never twice; rows from 2026-09-01; `グループID` kept with `群` |
| Recipient classification without `宛先ID` open (Q-13) | `宛先の群` (five groups / `OWNER`) |
| PIATEC reads a client-named Read Copy (account unspecified) | PIATEC reads **only two files** (View-only Copy, Heartbeat Spreadsheet) with a **dedicated reader account**, separate from login accounts; never Maru's account; never the Original Records |
| 17:00 start date open (Q-16) | 12:00/22:00 from 2026-09-13 to 10-01; 12:00/17:00/22:00 from 10-02; daily 00:35; host `snowmaru` |
| Scheduled patrols send questions to staff | Since 10/5 23:36 MEAT/IN questions/replies come from the 5-min polling loop; scheduled runs record only; `AI質問追跡` has no new rows since 10/6 (client fixing); `AI=scheduled-off` in `心拍.結果`; run-status reading not yet decided (Q-49) |
| Takatsuji is the single contact | Client message 10/7: "send all questions directly to me" + comment page — route UNCONFIRMED (Q-47) |

### 7.2 Implementation status (updated 2026-10-07, after the connector was built)

Status words: **IMPLEMENTED** (code + synthetic tests), **PARTIAL**, **UNCONFIRMED**, **BLOCKED**, **MISSING**. Nothing below has
been run against the client's real files: every connector item is tested on synthetic data only.

| Item | Status |
|---|---|
| Dashboard prototype (7 pages, mock/demo data, read-only API) | IMPLEMENTED (synthetic tests) |
| Auth prototype (Google sign-in, server-side allowlist) on vercel.app | PARTIAL — prototype hosting; TV3/TV15 not passed |
| Reader account for the two files | **BLOCKED / MISSING — PIATEC must create it and send its e-mail (Q-48)**. No token source exists in code; the connector is NOT_CONNECTED |
| Data Contract v1 as code (`src/contract/copyContract.js`) | IMPLEMENTED |
| Copy contract check (`src/adapters/copy/validate.js`) | IMPLEMENTED — §8.2 |
| Reader of the two spreadsheets (`server/source/sheetsReader.js`) | IMPLEMENTED against an in-process fake only; never called against Google (no reader account) → **PARTIAL** |
| Source configuration (`server/source/config.js`) | IMPLEMENTED — §8.3 |
| Copy adapter (`src/adapters/copy/copyAdapter.js`, kind `copy`) | IMPLEMENTED; live state today = **NOT_CONNECTED** (Q-48) |
| Transform `ログ` → messages | IMPLEMENTED |
| Transform `送信ログ` → sends + Bot replies | IMPLEMENTED; `kind` blank (Q-14); reply links only by the conservative §8 rule |
| Transform `AI質問追跡` → questions | PARTIAL — rows as recorded (`waiting` only); no answers, no run/send link (Q-21, Q-22, Q-23); gap since 10/5 23:36 flagged (Q-52) |
| Run status from `心拍` | BLOCKED (Q-15, Q-49) — `心拍` is validated only; runs are listed from `schedules` and shown "状態未判定" |
| Copy `meta` → banner | IMPLEMENTED with a proposed derivation (Q-09); `status` values other than `ok`/`stale`/`error` stop the banner (Q-50) |
| Heartbeat reader (`beats`, `alerts`) | IMPLEMENTED as a separate source; live state NOT_CONNECTED (Q-48) |
| Connection spec v1 + missing-record list v1 to the client | MISSING (this repo's draft; planned 10/6) |
| Written confirmation that vercel.app is prototype only | MISSING (PIATEC action) |
| Production install in the client's environment | not started (Q-01); vercel.app keeps the mock/demo entries |

### 7.3 Prototype code impact

None functionally. Comments that said PIATEC builds the copy were corrected (`src/contract/enums.js`, `src/adapters/types.js`,
`server/index.js` message, `src/adapters/mock/fixtures.js`). Mock data keeps its relative dates; the confirmed schedule history and
`snowmaru` are configuration for the real `stores` / `schedules`, not hard-coded (REQ §7-4).

### 7.4 Next implementation work (in order)

1. Create the reader account (in an environment acceptable to the client) and send its e-mail on the client's 10/7 page (Q-48); confirm in writing that vercel.app is prototype hosting only.
2. Send connection spec v1 (this file set) and the missing-record list v1; ask Q-47, Q-49 … Q-53 and Q-12 (timestamp zone, incl. the zone of the column-6 `HH:MM`) with two options + recommendation each.
3. Once the reader account and its environment are decided (Q-48, Q-01): add its token source and pass it to `chooseLiveAdapter(env, { getAccessToken })` — the only missing piece in code. Then run TV9 / TV24 against the real copy (type A, judged by the client).
4. After Q-49: run status from the copy (no rule before the client's announcement).
5. After Q-52: lift or re-date `COPY_SOURCE_LIMITS.questionsIncompleteFrom` according to the client's fix/backfill answer.
6. After Q-17 / Q-22: resend tie-up and candidate answers.
7. Decide hosting with the client (Q-01).

## 8. View-only Copy connector (built 2026-10-07)

### 8.1 Data flow and files

```text
client View-only Copy ──server/source/sheetsReader.js (GET, reader account, ids from server config)──┐
                                                                                                    ▼
                      src/adapters/copy/validate.js (Data Contract v1 check; fail closed per tab / per copy)
                                                                                                    ▼
                      src/adapters/copy/transform.js (full rebuild → Screen Data raw tabs; idempotent)
                                                                                                    ▼
                      src/adapters/copy/copyAdapter.js (AdapterResult kind `copy`; limits; source states)
                                                                                                    ▼
                      existing normalize → validate → domain → view models → read-only API → 7 pages

client Machine Heartbeat Sheet ──separate reader──▶ validateHeartbeat ──▶ beats / alerts as-is ──▶ ⑥ (and ① machine badge)
```

Mock (`devmock`) and demo adapters are unchanged; `devmock` stays the default live adapter. `copy` is opt-in
(`NIKUSHO_LIVE_ADAPTER=copy`) and, like any non-synthetic adapter, is refused behind the dev loopback gate.

### 8.2 Contract check (validate.js) — a violation blocks; nothing is stripped or repaired

| Check | Scope of the block |
|---|---|
| Tab list of the copy ≠ the 5 contract tabs (extra tab, or `meta` missing) | the reader refuses before reading cells (`unexpected_tabs` / `required_tab_missing`) → copy ERROR; `validateCopy` also blocks the whole copy |
| A data tab missing | that tab |
| Header: forbidden field (`userId`, `宛先ID`, `画像URL`, also inside an annotated name), missing / unexpected / duplicate / re-ordered column | that tab; the reader does not even download the rows of a tab whose header names a forbidden field |
| `元の行番号` missing, not a positive integer, or duplicated | that tab |
| Blank row, row wider than the header | that tab |
| `ログ`: `群` not one of the 5 groups; `グループID` suffix not in the REQ §5-1 table or not matching `群`; `messageId` blank or rounded (`E`, `.`, `,`); `再送`/`取消` other than blank or the mark; a link in `内容` of a non-text row | `ログ` |
| `送信ログ`: `宛先の群` not one of the 5 groups or `OWNER` | `送信ログ` |
| `AI質問追跡`: `group` not one of the 5 groups; `question_id` blank or duplicated | `AI質問追跡` |
| Timestamps not interpretable (ISO with offset; `yyyy/MM/dd H:mm:ss` only with `NIKUSHO_COPY_TIMEZONE`; impossible dates refused) | that tab |
| A LINE-style id (`U`/`C`/`R` + 32 hex) in any cell other than `グループID`; a URL outside the free-text columns | that tab |
| `meta`: wrong columns, a row for an unknown tab, two rows for one tab | the whole copy |
| `meta` row of a tab missing, `contract_version` ≠ `v1`, `last_read_at` unreadable | that tab |

Findings carry tab, `元の行番号` (or the sheet position `#n` when the id cell is malformed), column (a contract name, an exact
forbidden name, or `col n`) and a problem code — never a cell value, so a report about a leak cannot leak. They are shown on ⑥ for
sending evidence to the client.

### 8.3 Reader configuration (server-side only; `server/source/config.js`)

| Variable | Use |
|---|---|
| `NIKUSHO_LIVE_ADAPTER=copy` | select the connector (default stays `devmock`) |
| `NIKUSHO_COPY_SPREADSHEET_ID` | id of the client's View-only Copy (absent → copy NOT_CONNECTED) |
| `NIKUSHO_HEARTBEAT_SPREADSHEET_ID` | id of the Machine Heartbeat Sheet (absent → heartbeat NOT_CONNECTED); must differ from the copy |
| `NIKUSHO_COPY_STORE` | the `stores.store` the copy belongs to |
| `NIKUSHO_COPY_TIMEZONE` | optional IANA zone of zone-less copy timestamps and of the column-6 `HH:MM` (Q-12). Without it, zone-less times block the tab and no Bot reply is linked |
| `NIKUSHO_STORES_JSON` / `NIKUSHO_STORES_FILE` | `{"stores":[…],"schedules":[…]}` with the REQ §5-3 columns, checked by the existing Screen Data validation. Bangkok values confirmed 10/7 (slot history, daily 00:35, `production_host` `snowmaru`) belong here, not in code |

No spreadsheet id, e-mail, store or credential is in the repository. Ids are never sent to the browser, never logged, never echoed
in errors. The reader account's token source is **not configurable yet**: no environment variable supplies it, because the account
and how it authenticates are undecided (Q-48, Q-01). Code hook: `chooseLiveAdapter(env, { getAccessToken })`.

### 8.4 Transform rules actually implemented

| Copy | Screen Data | Rule |
|---|---|---|
| `ログ` | messages | `message_id`=`messageId`; rows sharing a `messageId` are one message (first copied row kept, Q-17); `kind` text/image→photo/sticker, everything else `other`; text only for `text` rows; `取消` → optional marker `cancelled=yes`, text removed (Q-17 option A, display only); `run_id`, `question_id`, `question_link` blank (Q-21, Q-22) |
| `送信ログ` | sends | `send_id`=`SL-<元の行番号>` (proposed, Q-11); `target_kind` owner when `宛先の群`=`OWNER`; `result` OK…→sent, `NG(`→failed, `ATTEMPTING_NO_RETRY`→unknown, anything else blank (unclassified, not a failure); `kind` blank (Q-14); optional `replies_to_message=yes` when column 6 is filled |
| `送信ログ` column 6 | messages `replies_json`, `handling` | data-mapping §8, applied conservatively: confirmed only when the calendar-day AND business-day readings give the same single message, the `HH:MM` is read in `NIKUSHO_COPY_TIMEZONE`, and the message is not later than the send; two or more → ambiguous (attached to none); replies that are not confirmed count as "unknown origin" on ⑦ |
| `AI質問追跡` | questions | `waiting` kept; any other `state` → unknown (needs evidence, Q-23); no answers, no `run_id` / `send_id` |
| `心拍` | — | validated only; no run row (Q-49). Runs are listed from `schedules`: `not_due` before the deadline, then "状態未判定" — never success, failure, missing or a rate |
| copy `meta` | Dashboard `meta` | `generated_at` = `last_success_at` = `source_through` = `last_read_at` (proposed, Q-09); `status` passed through (only `ok` is normal; `stale`/`error` and unknown values stop the banner, Q-50); a blocked tab → `status=error` with the finding summary |
| Heartbeat Sheet | beats, alerts | as-is after the column check (REQ §5-3 columns) |

Limits declared by the adapter (facts from the client's 10/7 update, not rules): `runStatus: UNCONFIRMED` (Q-49) and
`questionsIncompleteFrom: 2026-10-05T23:36:00+07:00` (Q-52) — ①, ④ and ⑦ say the question records are incomplete instead of
showing a low count as complete.

### 8.5 Freshness / performance

Reads at most once per minute per file (concurrent requests share one read); validation + Transform run once per read and every
request until the next read reuses the result. Copy every 5 min + ≤1 min read interval keeps "new row → screen" inside the
10-minute target on the PIATEC side (to be proven by TV9 on real data). Synthetic benchmark (20,000 messages, 2,000 replies):
validate ≈0.2 s + transform ≈0.45 s per read.

### 8.6 Known limitations (not hidden)

- A heartbeat read failure or blocked heartbeat tab shows "未接続" on ① / ⑥; the reason (ERROR / BLOCKED) is on the ⑥ data-source card.
- A failed copy read shows "update stopped" with no data for up to one read interval; the last good read is not kept (access may have been revoked).
- A numeric `messageId` the sheet rounded without an exponent cannot be detected (Q-12: the client should keep it as text).
- Resend rows with their own `messageId` are counted as separate messages until Q-17 says how resends are tied.
