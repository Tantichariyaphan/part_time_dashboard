# TEST_REPORT — NIKUSHO AI Monitoring Dashboard (TV1–TV25)

Deliverable REQ §3 #7 (`TEST_REPORT.md`: results of TV1–TV25 in REQ §8, with screenshots).
Report date: **2026-10-13**. Prepared by PIATEC (the builder). **This is not acceptance:** REQ §2 / §8 — the client's tester judges
pass/fail, and the person who judges must not be the builder. Every status below is PIATEC's evidence-based self-assessment.

Code under test: commit `b64bed8` (`main` = `origin/main`) plus uncommitted read-only diagnostics of 2026-10-13
(`scripts/analyze-heartbeat.js`, `scripts/reconcile.js`, `scripts/timing-probe.js`, `tests/diagnostics.test.js`; see `CHANGES.md`).
Where it ran: PIATEC's laptop (`npm run start:live`, Google sign-in + allowlist, reader account). **Nothing is installed in the
client's environment; vercel.app holds mock/demo data only.**

Related documents (no duplicated verdicts): detailed synthetic/pre-source evidence per TV — `docs/acceptance-report.md` §1;
real-data evidence status — `docs/acceptance-report.md` §1a; how the diagnostics work — `docs/implementation-notes.md` §9;
open questions — `docs/connection-spec.md` §12. **If a verdict in another document differs, this file is current.**

---

## 1. Legend

| Status | Meaning |
|---|---|
| **PASS** | every pass criterion is met by executed evidence of the type REQ §8 requires (B = test data is enough for display-only tests) |
| **PARTIAL** | some criteria have executed evidence; others are missing, need another evidence type (A = real data), or depend on an open question |
| **FAIL** | executed and did not meet the criterion |
| **BLOCKED** | cannot be executed until a named blocker is removed (hosting, test sheet, client decision, missing feature) |
| **NOT TESTED** | could be executed now but has not been (or only a fragment was) |

| Evidence | Meaning |
|---|---|
| **LIVE** | the client's real View-only Copy / Heartbeat Sheet, read with the reader account (GET only) on 2026-10-13; outputs were pasted into the working session; raw output files are **not** in the repository |
| **SYN** | automated tests on synthetic data (`npm test`, 202 tests) or the headless UI review (`scripts/ui-review.mjs`) |
| **MAN** | a manual check by a person |

REQ §8 types: **A** = Phase 1 real data, **B** = Phase 1 test data (display only), **C** = Phase 2 real data.

## 2. Summary

| PASS | PARTIAL | FAIL | BLOCKED | NOT TESTED | Total |
|---|---|---|---|---|---|
| 5 | 10 | 0 | 9 | 1 | 25 |

- PASS: TV5, TV10, TV11, TV13, TV14 (all type B, SYN).
- PARTIAL: TV1, TV8, TV12, TV16, TV17, TV20, TV22, TV23, TV24, TV25.
- BLOCKED: TV2, TV3, TV4, TV6, TV7, TV15, TV18, TV19, TV21.
- NOT TESTED: TV9.
- No type-A test is PASS. **No screenshots are attached** (§5 lists what must be captured).

## 3. Real-data evidence recorded (LIVE, 2026-10-13)

| # | Evidence | Result |
|---|---|---|
| L1 | `npm test` on PIATEC's laptop | **202 / 202 passed** |
| L2 | `npm run check:sources` (≈ 14:00) | View-only Copy CONNECTED: `ログ` 7,515 rows, `送信ログ` 237, `AI質問追跡` 30, `心拍` 720, copy `meta` ok (incl. its self-row); Heartbeat Sheet CONNECTED: `beats` 1,351, `alerts` 7; Bot replies 25 confirmed / 7 ambiguous / 0 unlinked |
| L3 | Source contract check (same read path) | **0 findings**; **11** `ログ` rows with a rounded `messageId` flagged (non-blocking; shown as `ROW-<元の行番号>`, never merged) |
| L4 | `npm run diag:reconcile` — 7 business days **2026-10-07 … 10-13** | **68 checks matched, 0 mismatches** (copy → transformed Screen Data → view model: messages per day, text identical, cancelled hidden, replies under their message, send results, ⑤ list, questions, Dashboard `meta` = copy `last_read_at`) |
| L5 | ⑦ 7-day figures from the same run | **1 question**, **0 candidate answers**, **9 Bot replies**; patrol / daily rates **unconfirmed** (run status not judged, Q-49) |
| L6 | `npm run diag:heartbeat` | **722** `心拍` rows; **24** `STOP`-class rows; **239** rows of class `other` (not recognised by the proposal's parser); **130** unparsed segments. The proposed run-status rules are **not approved and not used** by the dashboard |
| L7 | `npm run diag:timing` | **one sample only.** No 3-day series, no observed stop |
| L8 | Live pages | all 7 pages rendered live data with the last-updated time in a desktop browser on the laptop (MAN, no screenshot kept) |

Limits that apply to every LIVE row: L4 computes the view model **from the same source read** in-process; it does **not** inspect
the running server's cache or the rendered DOM. All LIVE evidence comes from one laptop on one day.

## 4. TV1–TV25

| TV | Type | Status | Evidence | What is missing / blocker | Screenshot needed |
|---|---|---|---|---|---|
| TV1 7-day registry vs screen figures | A | **PARTIAL** | LIVE L4/L5: message count, question count, response rate state ("not concluded" — no confirmed answers) match the copy for 10/7–10/13. SYN: ⑦ formulas (`edge.test.js`, `answers.test.js`) | patrol status not judged (Q-49, proposal unapproved); no **registry** exists to compare with — Screen Data is in memory only (Q-54); comparison was copy ↔ view model, not the running screen | ⑦ 7 days and ② for the same days, next to the reconcile output |
| TV2 test-sheet change shown ≤ 5 min | B | **BLOCKED** | SYN precondition: reads at most once a minute, page refresh 60 s, no write route (405) | no test copy sheet exists (REQ §7-9 forbids changing real data) | before/after with timestamps |
| TV3 non-allowlisted / revoked account gets no data | A | **BLOCKED** | MAN: one real non-allowlisted Google account signed in and was denied (component PASS, `docs/auth-prototype.md` §9). SYN: `auth.test.js` (deny, revoke without restart, API 403) | revocation with a real account, direct API after revocation, production hosting (Q-01, Q-04, Q-05) | denial screen; API response after revocation |
| TV4 ② on portrait phone ≤ 3 s, no horizontal scroll | A | **BLOCKED** | SYN: 375 px no overflow, first render 647–672 ms (mock volume) | an https URL a phone can reach (client-environment hosting, Q-01) | ② on a phone with load time |
| TV5 add a store in `stores` | B | **PASS** | SYN `acceptance.test.js` TV5 | — | ① before/after (synthetic) |
| TV6 ① shows 3 stores on one screen, matches registry | A | **BLOCKED** | SYN: ① renders 3 stores, Nagoya 未接続 | live `config/stores.json` has **no Nagoya rows** (store ids / display names not provided); phone hosting (Q-01); "one screen" reading (Q-38) | ① on a phone |
| TV7 delete all cache → rebuilt from registry | A | **BLOCKED** | — | no registry store and no separate cache layer (Q-54, Q-05; `docs/architecture.md` §8a) | — |
| TV8 ③ one day, text exact, replies under the message | A | **PARTIAL** | LIVE L4: every text message of each of 7 days identical to `ログ.内容`; cancelled content hidden; every linked reply listed under its message (view-model level). SYN: 200 messages API→DOM verbatim (`acceptance.test.js`, `ui-review.mjs`) | rendered page / phone not checked on live data; no live day reached 200 rows check by eye; running server not inspected | ③ for one busy day (phone), replies visible |
| TV9 new real records on screen ≤ 10 min, 3 days | A | **NOT TESTED** | LIVE L7: one timing sample only | 3 consecutive days of `diag:timing`; question records after 10/5 23:36 may be incomplete (Q-52); one-sample results are not evidence | probe logs + ③ screenshots at the times |
| TV10 five statuses + "no row" displayed differently | B | **PASS** | SYN `acceptance.test.js` TV10 | real-data reading of run status (Q-49) is outside this type-B test | ② with each status (synthetic) |
| TV11 replies: 2 for 1 / 1 for 3 / carried | B | **PASS** | SYN `acceptance.test.js` TV11 | — | ③ (synthetic) |
| TV12 rebuild keeps answered / answered without numbers / closed without reply | B (C) | **PARTIAL** | SYN: display part (answered stays answered) | rebuild-without-revert needs a stored registry (Q-23, Q-54); REQ §6-⑦ vs TV12 denominator conflict (Q-37); copy cannot produce `answered`/`closed` (Phase 2) | ④ (synthetic) |
| TV13 meta error / old / revoked / column missing / corrupt JSON | B | **PASS** | SYN `acceptance.test.js`, `freshness.test.js`, COPY-19 (all 7 pages × 3 stop scenarios) | — | stopped banner on ② and ⑥ (synthetic) |
| TV14 production heartbeat stopped, standby alive | B | **PASS** | SYN `acceptance.test.js` TV14 (10:00 / 10:20 / 01:00, 15/16-min boundaries) | — | ⑥ at the three times (synthetic) |
| TV15 Maru and Takatsuji on phones; `<script>` text shown as text | A | **BLOCKED** | SYN: `ui-review.mjs` §5 — nothing executed, text shown verbatim | real accounts on phones need a client-environment URL (Q-01) | both phones |
| TV16 phone in Japan / Thai time, same business day | A / C | **PARTIAL** | SYN: identical output under Tokyo / Bangkok / LA, rollover at 05:00, out-of-scope store | not checked on live data on phones (hosting Q-01); Nagoya = C | ② on two phones |
| TV17 30 days real volume ×2 in ≤ 3 s; dummy excluded | A・B | **PARTIAL** | SYN B part passes; mock ×2 volume < 3 s server-side | real-volume page timing not measured (live pages rendered, not timed) | ⑦ 30 days with timing |
| TV18 install + recovery demo (copy deleted, access re-granted, screen fault) | A | **BLOCKED** | — | nothing installed in the client's environment (Q-01); TV18 split after 10/7 (Q-53); named owner/contact in writing | recovery steps |
| TV19 stop / fail midway / run twice → "stopped" ≤ 20 min, notice once, resume, no duplicates | A | **BLOCKED** | SYN: banner at > 20 min (exactly 20 normal); idempotent rebuild (COPY-30, COPY-40) | **alert to Takatsuji not built** (channel Q-02, route Q-47); no test copy to stop; no observed stop (L7) | banner + notice received |
| TV20 screen vs `ログ`/`送信ログ`/`AI質問追跡`, 7 days | A | **PARTIAL** | LIVE L4: message counts and send results match per day for 10/7–10/13; questions match; 0 confirmed answers, 0 candidate answers (L5) | comparison is copy ↔ view model, not the running screen; the client's tester has not judged; candidate rule unexercised on live data (0 candidates); resend rows with their own id counted separately (Q-17) | ③④⑤ for the 7 days + reconcile output |
| TV21 only the copy step stops | A | **BLOCKED** | SYN: same banner rule as TV19; L4 shows Dashboard `meta` follows copy `last_read_at` | alert not built (Q-02); no test copy whose Copy Script can be stopped | banner + notice |
| TV22 wrong confirmed links 0; candidates not in rates | B | **PARTIAL** | SYN: COPY-33 … 38 (same group+sender, after `送信時刻`, not 取消, no time limit, never confirmed), metrics "not concluded" | criterion covers "renamed / same-name people": the rule matches display names exactly, so a renamed person is missed and two people with one name are both matched as candidates — acceptable only as unconfirmed; no live candidate observed (L5: 0) | ④ with candidates (synthetic) |
| TV23 accepted / not sent (duplicate prevention) / unknown | B | **PARTIAL** | SYN: 3 distinct labels for sent / unknown / failed; no delivered/read wording | "not sent because of duplicate-send prevention" has no source value (Q-20) | ③ / ⑤ labels |
| TV24 whole copy has no forbidden group / recipient / field / tab | A | **PARTIAL** | LIVE L2/L3: the contract check (forbidden headers refused, five groups, allowed recipients, 4 tabs + meta) found **0** findings on the 10/13 read | the client inspects and judges the whole copy (TV24 is the client's test of its own copy) | `check:sources` output |
| TV25 schedule change day / running past deadline / **watcher itself stopped** | B | **PARTIAL** | SYN: old schedule before the change day; past-deadline `running` → unknown; production machine stopped → red | the stop of **PIATEC's own monitoring process** is not detected by anything (no external watcher, no alert — `docs/architecture.md` §7.2). Earlier report read "watcher" as the client's machine and marked PASS; reclassified here | — |

## 5. Screenshots and evidence still to capture

None exist in the repository. Do not reuse synthetic screenshots as real-data evidence.

1. **Real data, available now on the laptop (desktop browser, phone-sized window):** ⑦ 7 days (TV1), ③ busiest day of 10/7–10/13
   with replies (TV8, TV20), ④ (TV20), ⑤ (TV20), ⑥ data-source card with the 11 flagged rows (TV24) — mask staff names before the
   images leave PIATEC (REQ §7-8, §7-12).
2. **Saved command outputs** (counts only, store under the git-ignored `Claude outputs/`): `diag:reconcile --json`, `diag:heartbeat
   --json`, `check:sources`, 3 days of `diag:timing --json`.
3. **Synthetic, any time:** `scripts/ui-review.mjs <outDir>` for TV5, TV10, TV11, TV13, TV14, TV22, TV23.
4. **Need hosting / accounts / test sheet first:** TV2, TV3, TV4, TV6, TV7, TV9, TV15, TV16 (phones), TV17 (timing), TV18, TV19, TV21.

## 6. Known gaps (all open; none is hidden by a status above)

| Gap | State today | Blocks | Resolved by |
|---|---|---|---|
| **Candidate answers** | implemented (REQ §5-1 rule, never confirmed); live: 1 question, 0 candidates in 7 days — the rule has not been seen working on real data; whether `AI質問追跡.who` equals `ログ.発言者` display names is unverified | TV20, TV22 (live), ④ | a live week with questions and answers; `check:sources` "Possible answers" line |
| **Screen Data storage** | in memory only, rebuilt from each copy read; REQ §5-3 / §7-3 client-named store missing | TV1 (registry), TV7, TV12 | client decides Q-54 (location, file, writer identity); then build §8a |
| **Run Status approval** | proposal `docs/run-status-proposal.md` from the 10/5 sample; live: 239 of 722 rows are not recognised by it, 24 STOP rows | TV1 (status), TV10/TV25 real data, ②⑤⑦ | revise the proposal with the live shapes; client answers Q-49a–h |
| **Timing verification** | one sample | TV9, TV19, TV21 | 3 days of `diag:timing`; a stop on a test copy |
| **Alert delivery** | not built | TV19, TV21, TV25 | client names the channel and contact (Q-02, Q-47); then build |
| **Client-owned hosting** | laptop only; vercel.app = mock/demo | TV2–TV4, TV6, TV9, TV15–TV19, TV21 | Q-01 decision and install in the client's account |
| **Nagoya configuration** | no Nagoya rows in `config/stores.json` (Phase 1 needs them shown as 未接続) | TV6 | client gives the two store ids / display names (Q-07); config change only (TV5 proves no code change) |
| **Resend linkage** | rows sharing a `messageId` are merged; `再送` rows with their **own** `messageId` count as separate messages | TV20 accuracy, ③ | client answers Q-17 |

## 7. Handover checklist (priority order)

Owners: **DEV** = PIATEC developer work; **YUKI** = actions only Yuki (PIATEC lead, holder of the reader key and the laptop) can do;
**CLIENT** = decisions or actions of the client (asked through the contact route, Q-47; never assigned to Maru except approvals only
he can give, REQ §2).

| # | Owner | Item | Exact blocker | Evidence that closes it |
|---|---|---|---|---|
| 1 | YUKI | Save `diag:reconcile --json`, `diag:heartbeat --json`, `check:sources` outputs of 10/13 under `Claude outputs/`; capture the real-data screenshots of §5-1 (names masked) | — (can be done now) | files + images referenced from this report |
| 2 | DEV | Revise `docs/run-status-proposal.md` with the live `心拍` shapes (239 `other` rows, 24 STOP, 130 unparsed segments) | needs sections [2]–[5] of the live `diag:heartbeat` output (counts and masked shapes only) | proposal §2 updated from live counts; DIAG tests extended for the new shapes |
| 3 | YUKI | Send to the client: Q-49a–h (after #2), Q-54, Q-02 + Q-47, Q-07 (Nagoya ids/names), Q-17, Q-01, Q-52 | — | client's written answers |
| 4 | YUKI | Run `npm run diag:timing -- --minutes 60` at least once per day for 3 consecutive days (laptop on, `.env` + key in place) | laptop availability | 3 saved JSON summaries; TV9 can move from NOT TESTED |
| 5 | CLIENT | Run-status interpretation (Q-49a–h) | client decision | written approval → DEV implements, tests on live data (TV1 status part, TV10/TV25 real) |
| 6 | CLIENT | Dashboard Data storage: location, file created by the client, separate writer identity with Editor on that file only (Q-54) | client decision + sharing (Maru approves) | file shared; DEV builds `docs/architecture.md` §8a; TV7, TV1 registry part, TV12 |
| 7 | CLIENT | Alert channel and contact (Q-02, Q-47) | client decision | DEV builds the notice; TV19/TV21/TV25 on a test copy |
| 8 | CLIENT | Hosting in the client's environment (Q-01) | client decision, client billing | install; TV2–TV4, TV6, TV15–TV18 on phones |
| 9 | CLIENT | Test copy sheet for TV2 / TV19 / TV21 (REQ §7-9) | client creates and shares it (Viewer for the reader account) | test runs with screenshots |
| 10 | CLIENT | Nagoya store ids and display names (Q-07) | client data | DEV adds two `stores` rows (config only); TV6 |
| 11 | CLIENT | Resend tie-up rule (Q-17); question-record completeness after 10/5 23:36 (Q-52) | client answers | DEV adjusts transform / lifts the incompleteness note; reconcile re-run |
| 12 | YUKI | Written confirmation to the client that vercel.app is prototype hosting only (connection-spec §11.1 #11) | — | sent message |
| 13 | CLIENT | Name the acceptance tester (not PIATEC, REQ §2) and judge TV1–TV25 | client decision | client's verdicts recorded in this file |

**Stop point:** no Git commit, push, deployment, production change, file creation in the client's Drive or sharing change happens
without Yuki's explicit approval.
