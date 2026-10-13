# Verification report: connection, live display, 7-day reconciliation (submission 2026-10-15)

Prepared by PIATEC (the builder). **This is not acceptance.** The client's tester judges pass/fail (REQ §2, §8).
Capture date: **2026-10-14 (Wed), Bangkok time**. Submitted: **2026-10-15 (Thu)**.
Code: `main` at `<commit>`. Where it ran: PIATEC's development laptop (`npm run start:live`, Google sign-in + allowlist,
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
| View-only Copy: state, tabs, row counts, contract check | `<CONNECTED>`; `ログ <n>` / `送信ログ <n>` / `AI質問追跡 <n>` / `心拍 <n>` / `meta` ok; findings `<n>` | `A1-1_check-sources.png` |
| Machine Heartbeat Sheet: state, tabs, row counts | `<CONNECTED>`; `beats <n>` / `alerts <n>` | `A1-1_check-sources.png` |
| The same two connections as the dashboard shows them (⑥ data source card: last read time per file) | `<both read at hh:mm>` | `A1-2_page6-sources.png` |
| Access is read-only | the reader account has view-only access and the `spreadsheets.readonly` scope; the dashboard has no write route (API answers 405) | design + `npm test` (TEST) |

### A2. Live data on all 7 pages

Desktop browser on the laptop, live entry (`http://localhost:<port>/`, not `/demo/`). Each screenshot shows the URL bar and the
last-updated time. Staff names are masked before the images leave PIATEC (REQ §7-8, §7-12).

| Page | What the screenshot shows | Known limits shown on screen (not defects of the capture) | File |
|---|---|---|---|
| ① 全店舗 | Bangkok with today's figures; Nagoya 未接続 | Nagoya is Phase 2; no Nagoya store rows yet (Q-07) | `A2-1.png` |
| ② 本日 | today's scheduled runs | run results show 状態未判定 until the client approves how to read `心拍` (Q-49) | `A2-2.png` |
| ③ メッセージ | `<busiest day in 10/7–10/13>`: messages with Bot replies under the original message | 11 messages with a rounded `messageId` are shown by row number and flagged; their IDs are not restored or guessed | `A2-3.png` |
| ④ 質問と回答 | questions in the 7-day window and their candidate answers | question records after 10/5 may be incomplete (Q-52); the screen says so | `A2-4.png` |
| ⑤ 欠落・失敗 | last 14 days | missing daily reports appear as unconfirmed, not as failures (Q-49) | `A2-5.png` |
| ⑥ 稼働機 | production machine heartbeat, alerts, data source card with the 11 flagged rows | — | `A2-6.png` |
| ⑦ 期間別 | 7 days | patrol and daily success rates show 未集計 (Q-49); response rate "not concluded" | `A2-7.png` |

### A3. 7-day reconciliation (business days 2026-10-07 … 10-13, Bangkok, day starts 05:00)

Two comparisons, reported separately:

**A3-1. Source → dashboard data** (`npm run diag:reconcile -- --days 7 --end 2026-10-13`). The script reads the copy once, runs the
dashboard's own transform, and compares each business day. It prints counts and row numbers only.

| Business day | Messages (`ログ` → ③) | Sends sent / failed / unknown (`送信ログ`) | Questions (`AI質問追跡` → ④) | Bot replies under original | Match |
|---|---|---|---|---|---|
| 10/07 | `<n> → <n>` | `<n/n/n>` | `<n → n>` | `<n>` | `<yes/no>` |
| 10/08 – 10/13 | … | … | … | … | … |
| **Total** | | | | | **`<n>` checks matched, `<n>` mismatches** |

Evidence: `A3-1_reconcile.png` (terminal) and `reconcile-counts.json`. Previous run on 2026-10-13: 68 matched, 0 mismatches.

**A3-2. Dashboard data → running screen** (manual). The ⑦ 7-day figures in `A2-7.png` are compared with section [6] of the same
reconcile run, figure by figure. On ③ for `<one day>`, the first and last messages and every Bot reply are checked against [3] and [4].

| Figure | Screen (⑦) | Reconcile [6] | Same? |
|---|---|---|---|
| Messages, 7 days | `<n>` | `<n>` | |
| Questions, 7 days | `<n>` | `<n>` | |
| Bot replies, 7 days | `<n>` | `<n>` | |

---

## Part B — Verified with TEST data only

None of these used client data. They prove the screen logic, not the live system.

| Item | Result | Evidence |
|---|---|---|
| Automated tests | `<n>/<n>` pass | `B1_npm-test.png` |
| Display-only tests TV5, TV10, TV11, TV13, TV14 | pass (synthetic) | `TEST_REPORT.md` §4 |
| Outage detection on a test connection (synthetic copy, fake Sheets API; production polling untouched) | `<results of --clock real>` | outage-drill output (sent separately with the refresh/outage test report) |

## Part C — Not verified yet (stated, not hidden)

| Item | Why | Next step |
|---|---|---|
| Live data on a hosted URL (vercel.app or the client's environment) | not approved (client direction 10/13); hosting is a separate decision | client's decision on the interim/final environment |
| Phones, real accounts (TV3, TV4, TV15, TV16) | needs a hosted URL | after hosting |
| Source → screen ≤ 10 min over 3 days (TV9) | one timing sample so far | `diag:timing` daily, 10/14 – 10/16 |
| Run status (②⑤⑦ rates) | interpretation awaits client approval (Q-49) | client decision |
| Notice to Takatsuji on a stop (TV19, TV21) | channel and contact not yet named (Q-02, Q-47) | client decision, then build |
