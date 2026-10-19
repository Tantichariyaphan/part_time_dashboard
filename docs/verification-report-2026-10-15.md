# Verification report: connection, live display, 7-day reconciliation (submission 2026-10-15)

Prepared by PIATEC (the builder). **This is not acceptance.** The client's tester judges pass/fail (REQ §2, §8).
Capture date: **2026-10-14 (Wed), Bangkok time**. Submitted: **2026-10-15 (Thu)**.
Code: `main` at commit `0eddab8` (deployed to the Vercel prototype on 2026-10-14). Where it ran: PIATEC's development laptop (`npm run start:live`, Google sign-in + allowlist,
reader account with read-only access). **The vercel.app prototype is not connected to live data**, as the client directed on 10/13.

Every result below is labelled with its evidence type, and the types are never mixed:

| Label | Meaning |
|---|---|
| **LIVE** | the client's real View-only Copy and Machine Heartbeat Sheet, read-only (GET), on the capture date |
| **TEST** | synthetic data only: automated tests (`npm test`) or the outage drill on a test connection. No client data is involved |

---

## Part A — Verified with LIVE data

### A1. Connection to both sheets

| Item | Result | Evidence |
|---|---|---|
| View-only Copy: state, tabs, row counts, contract check | CONNECTED (read 2026-10-14 00:41); `ログ` 7,626 / `送信ログ` 240 / `AI質問追跡` 30 / `心拍` 730 rows; contract findings 0; rounded `messageId` 0. Copy `meta`: `ログ` status **`warning`** (T-12), other tabs `ok` (**10/15 16:06: all tabs `ok`** after the client's fix); copy refreshed every 5 min | `A1-2_page6-sources.png`, `A3-1_reconcile.png` |
| Machine Heartbeat Sheet: state, tabs, row counts | CONNECTED (⑥, last read 2026-10-14 01:09); `beats` 1,484 / `alerts` 7 rows, both passed the contract check | `A1-2_page6-sources.png` |
| The same two connections as the dashboard shows them (⑥ data source card) | both 接続中, last read 2026-10-14 01:09; copy tabs ログ 7,626 / 送信ログ 240 / AI質問追跡 30 / 心拍 730 rows, meta passed; Bot reply links: confirmed 25 / cannot identify 7 / unlinked 0 | `A1-2_page6-sources.png` |
| Access is read-only | the reader account has view-only access and the `spreadsheets.readonly` scope; the dashboard has no write route (API answers 405) | design + `npm test` (TEST) |

### A2. Live data on all 7 pages

Desktop browser on the laptop, live entry (`http://localhost:3000/`, not `/demo/`). **The red 更新停止 banner on the message pages is caused by the copy's `ログ` status `warning` (detail: 「元の長いIDが数値型（末尾復元不可）」, T-12); the copy itself is current (read every 5 minutes).** The client corrected the status; on 10/15 16:06 every copy tab reads `ok` and the banner is gone. Each screenshot shows the URL bar and the
last-updated time. Staff names are masked before the images leave PIATEC (REQ §7-8, §7-12).

| Page | What the screenshot shows | Known limits shown on screen (not defects of the capture) | File |
|---|---|---|---|
| ① 全店舗 | Bangkok with today's figures; Nagoya 未接続 | Nagoya is Phase 2; no Nagoya store rows yet (Q-07) | `A2-1.png` |
| ② 本日 | today's scheduled runs | run results show 状態未判定 until the client approves how to read `心拍` (Q-49) | `A2-2.png` |
| ③ メッセージ | 10/10 (223 messages, the busiest day of 10/7–10/13): messages with Bot replies under the original message | 36 source rows have an original ID whose last digits cannot be restored (copy `meta` detail, T-12); no ID is restored or guessed, and their reply mapping is unverified | `A2-3.png` |
| ④ 質問と回答 | questions in the 7-day window and their candidate answers | question records after 10/5 may be incomplete (Q-52); the screen says so | `A2-4.png` |
| ⑤ 欠落・失敗 | last 14 days | missing daily reports appear as unconfirmed, not as failures (Q-49) | `A2-5.png` |
| ⑥ 稼働機 | production machine heartbeat, alerts, data source card with the 11 flagged rows | — | `A2-6.png` |
| ⑦ 期間別 | 7 days | patrol and daily success rates show 未集計 (Q-49); response rate "not concluded" | `A2-7.png` |

### A3. 7-day reconciliation (business days 2026-10-07 … 10-13, Bangkok, day starts 05:00)

Two comparisons, reported separately:

**A3-1. Source → dashboard data** (`npm run diag:reconcile -- --days 7 --end 2026-10-13`). The script reads the copy once, runs the
dashboard's own transform, and compares each business day. It prints counts and row numbers only.

Read: 2026-10-14 00:41 (+07:00). Source = the copy's rows; transformed = the dashboard's data; screen = what the pages return.

| Business day | Messages (`ログ` → ③), source = transformed = screen | Sends sent / failed / unknown | Questions (`AI質問追跡` → ④) | Bot replies under original |
|---|---|---|---|---|
| 10/07 | 174 | 15 / 0 / 0 | 0 | 4 |
| 10/08 | 162 | 11 / 0 / 0 | 0 | 0 |
| 10/09 | 152 | 9 / 0 / 0 | 0 | 3 |
| 10/10 | 223 | 7 / 0 / 0 | 0 | 1 |
| 10/11 | 186 | 7 / 0 / 0 | 0 | 0 |
| 10/12 | 219 | 5 / 0 / 0 | 1 | 1 |
| 10/13 | 165 | 4 / 0 / 0 | 0 | 0 |
| **Total** | **1,281** | **58 / 0 / 0** | **1** | **9** |

**68 checks matched, 0 mismatches.** Every message text checked was identical to `ログ.内容`; cancelled messages (取消, 18 in the
7 days) are hidden; 再送 rows that carry their own `messageId` (8) are counted separately until Q-17 is answered.

Evidence: `A3-1_reconcile.png` (terminal). Previous run on 2026-10-13: 68 matched, 0 mismatches.

**A3-2. Dashboard data → running screen** (manual). The ⑦ 7-day figures in `A2-7.png` are compared with section [6] of the same
reconcile run, figure by figure. On ③ for 10/10, the page lists 223 messages and the Bot reply under its original message, as in [3].

| Figure | Screen (⑦) | Reconcile [6] | Same? |
|---|---|---|---|
| Messages, 7 days | 1,281 | 1,281 | yes |
| Questions, 7 days | 1 | 1 | yes |
| Bot replies, 7 days | 9 | 9 | yes |

### A4. Source → screen within 10 minutes, consecutive days (TV9)

`npm run diag:timing` (read-only), 60-minute windows on 4 consecutive business days, 10/15–10/18 (a business day starts at 05:00).

| Business day | New rows measured | Row time → visible to our reader | Banner |
|---|---|---|---|
| 10/15 | `ログ` 9, `心拍` 1 | 0.5–5.1 min | normal |
| 10/16 | `ログ` 15, `心拍` 1 (4 more rows arrived while the PC slept: not measured) | 0.6–5.1 min | normal |
| 10/17 | `送信ログ` 3 | 0.3–5.3 min | normal |
| 10/18 | `ログ` 8, `心拍` 3 | 1.0–4.5 min | normal |

Measured maximum to our reader: **5.3 minutes**. To the screen, **≤ 7.3 minutes is an upper-bound estimate** (+ dashboard read interval ≤ 1 min
+ page refresh ≤ 1 min), not a measurement; the measured run to a browser on the hosted URL follows after the key is approved.
The 4 rows of 10/16 seen only after the PC woke (`ログ` #23474–#23477) are excluded and listed in the response, §2.2.
Evidence: terminal screenshots `T1`–`T6` (one per window). Measured on PIATEC's PC, not on a hosted URL.

---

## Part B — Verified with TEST data only

None of these used client data. They prove the screen logic, not the live system.

| Item | Result | Evidence |
|---|---|---|
| Automated tests (PIATEC PC, 2026-10-14) | 219 / 219 pass (227 / 227 after the 10/14 screen fixes, run on PIATEC's staging copy of this project). **All run on test data only**; which areas were also checked on live data: response §9 | `B1_npm-test.png` |
| Display-only tests TV5, TV10, TV11, TV13, TV14 | pass (synthetic) | `TEST_REPORT.md` §4 |
| Outage detection on a test connection (synthetic copy, fake Sheets API; production polling untouched) | logic test with a simulated clock: 更新停止 shown ≤ 1 min after access loss / API timeout / missing column, 21 min after the copy's last good read when the copy stops; normal ≤ 1 min after restore. Real-time run to follow (see the response, §2.2) | outage-drill output (sent separately with the refresh/outage test report) |

## Part C — Not verified yet (stated, not hidden)

| Item | Why | Next step |
|---|---|---|
| Live data on a hosted URL (vercel.app or the client's environment) | not approved on 10/13; agreed 10/15: PIATEC's Vercel until 11/12, final environment after 11/12 | starts once the client confirms the reader key may be placed on Vercel (D-01) |
| Phones, real accounts (TV3, TV4, TV15, TV16) | needs a hosted URL | after hosting |
| Run status (②⑤⑦ rates) | interpretation awaits client approval (Q-49) | client decision |
| Notice to Takatsuji on a stop (TV19, TV21) | channel and contact not yet named (Q-02, Q-47) | client decision, then build |
