# NIKUSHO dashboard: PIATEC response to the 10/13 direction (items 1–6)

From: PIATEC. To: the client, via Iida-san. Date: 2026-10-15. All times are Bangkok time.
Items marked **[PIATEC to fill]** are completed by PIATEC management before sending. PIATEC does not state prices or commitments
on cost in this document until management has set them.

## 0. Summary

| # | Item | Status | What we send | When |
|---|---|---|---|---|
| 1 | Connection, 7 live pages, 7-day reconciliation | ready | verification report with screenshots, live and test results separated | 10/15 |
| 2 | Auto-refresh and outage detection | tests built; first run on 10/14 | test design, results, list of the cooperation we need (§2.4) | first results 10/15; 3-day timing 10/16 |
| 3 | Production environment | waiting for your decision | facts for the interim Vercel decision (§3) | 10/15 |
| 4 | Prototype update | approved by you; redeploy on 10/14 | URL and verification results (§4) | 10/15 |
| 5 | Open data issues | rows and criteria shared for your cross-check | §5 + row lists | 10/15 |
| 6 | Single issue list, 10/15 feature list | this document | §6, §7 | 10/15 |

---

## 1. Verification report (10/15)

Submitted separately as *Verification report: connection, live display, 7-day reconciliation*. It has three parts:
**A. LIVE data** (both sheets, all 7 pages, 7-day reconciliation for business days 10/7–10/13); **B. TEST data only**; **C. not verified yet**.
Live screens are captured on PIATEC's development PC with read-only access. The Vercel prototype is not connected to live data.

## 2. Auto-refresh and outage detection

### 2.1 What we measure

| Stage | How | Data |
|---|---|---|
| Source sheet → copy | `diag:timing`: time written in each new row (`日時`) → the copy's read time (`meta.last_read_at`) → first time our reader sees the row | LIVE, read-only, 60 min a day on 10/14, 10/15, 10/16. Production polling is not touched |
| Copy → screen | the same run, plus the dashboard's fixed intervals: the server reads the copy at most once a minute; an open page refreshes every 60 s | LIVE |
| Outage → "更新停止" on screen, and recovery | `outage-drill` on a **test connection**: a synthetic copy (Data Contract v1 columns, invented rows) behind a test Sheets API, read by the dashboard's real code. Four cases: copy stops updating; access removed (403); Google API does not answer; a required column disappears | TEST only. No client file is touched |

### 2.2 Results so far (logic check with a simulated clock; real-time runs on 10/14)

| Case | Screen shows 更新停止 | Back to normal after restore |
|---|---|---|
| Copy stops updating | 21 min after the copy's last successful read | ≤ 1 min |
| Access removed (403) | ≤ 1 min | ≤ 1 min |
| Google API does not answer | ≤ 1 min (each request is cut off after 10 s) | ≤ 1 min |
| Required column missing | ≤ 1 min | ≤ 1 min |

Real-time results replace this table in the report of 10/15 (outage) and 10/16 (3 days of timing).

**Live timing sample (2026-10-13 17:33–17:52, read-only, 20 reads):** the copy was refreshed every 5 minutes (3 intervals, all
5 min); the oldest copy data seen was 4.9 minutes old; the dashboard always read the same copy version as the probe. No new message
arrived during the sample, so "message time → screen" is **not measured yet**; it will be measured in a busier hour. The banner showed
更新停止 throughout because of the copy's `warning` status (T-12), not because the copy stopped.

### 2.3 Finding: the 20-minute rule leaves no margin

The banner rule (REQ §6: data up to 20 minutes old is shown as normal) and TV19/TV21 ("更新停止 within 20 minutes") use the same
20 minutes. Counted from the copy's **last successful read**, detection takes about 21 minutes (20 + one server read + one page
refresh). Counted from the **first missed copy run** (5 minutes later), it takes about 16 minutes. We have not changed the threshold.
Question T-11 below asks which start point applies.

### 2.4 Operations that need your cooperation (only these)

1. **T-04:** the meaning of `日時` in `ログ`. Is it the time the message arrived, or the time your script wrote the row into the source
   sheet? About how long after arrival is the row written? We cannot see the source sheet. Without this answer we can measure
   "message time → copy → screen", but not "source sheet → copy" on its own.
2. **D-04:** the channel and recipient for stop/recovery notices to Takatsuji-san. Without them, the "notify once" part of TV19/TV21
   cannot be built or tested.
3. **T-11:** the start point of the 20 minutes in TV21 (§2.3).

No other cooperation is needed. In particular, we do not need you to stop your Copy Script or production polling.

## 3. Production environment: facts for your decision

We treat the polling machine and the dashboard hosting as separate. None of our tests depend on Takatsuji-san's machine migration.
Until you approve, no key is placed on Vercel and the prototype stays unconnected.

| Your question | Answer |
|---|---|
| **Cost and existing quote** | This row applies only to interim use on PIATEC's Vercel; the final environment can be any Node.js host you choose (D-02), and without the interim period there is no Vercel cost. Vercel's free Hobby plan is for non-commercial personal use only, so client work needs the Pro plan: USD 20 per month per member who deploys (Vercel's list price). Viewers need no Vercel account. Covered by the existing quote: **[PIATEC to fill]**. Interim cost and who bears it: **[PIATEC to fill]** |
| **Who can view** | Google sign-in. Only addresses on a server-side allowlist receive data; any other account gets no data. Preview URLs are refused. A person is removed by deleting the address and redeploying; sessions end after 60 minutes idle. Proposed allowlist: **[addresses you approve]** |
| **Service account key** | Stored as a Vercel environment variable marked *Sensitive*: after saving, its value cannot be displayed in the Vercel dashboard or CLI. Can change or delete it (not read it): Vercel project members **[PIATEC to fill: names]**. Can create or revoke keys: owners of the Google Cloud project that holds the account **[PIATEC to fill: project owner]**. Today a copy exists only on PIATEC's development PC, for the local tests. The account is read-only (`spreadsheets.readonly`) and has view access to exactly two files. Revoking the key, or removing the share, stops access immediately |
| **Data and logs** | Data: no database, no files written. Each read is held in server memory for at most about 1 minute and disappears when the instance stops. Responses are sent over HTTPS with `no-store` (not cached). Logs: our code logs status codes and variable names only, never message text, names, IDs or key values. Vercel keeps request logs (time, path, status, IP address, browser) for 1 day on Pro, then deletes them. Server region can be set to Singapore or Tokyo. Deletion at the end: delete the environment variables and the Vercel project, revoke the key, remove the reader account's share |
| **Migration to the final environment** | The dashboard is a plain Node.js 22 server; the same code runs outside Vercel. Steps: (1) you prepare the environment; (2) PIATEC deploys and configures; (3) a new key is issued in your Google Cloud (or the account is transferred) and you share the two files with it; (4) PIATEC verifies; (5) PIATEC revokes the old key and deletes the Vercel project. Owner: PIATEC for 2, 4, 5; your side for 1 and the sharing in 3. Cost: **[PIATEC to fill]** |

## 4. Prototype update

Scope as approved: no live data or credentials; "未接続" instead of mock data when data cannot be retrieved.

URL: `https://parttimedashboard.vercel.app/` (live entry) and `/demo/` (anonymized demo, labelled デモ). Deployed on 2026-10-14 from commit `0eddab8`.

| Check | Expected | Result |
|---|---|---|
| Vercel environment has no source variables (sheet IDs, reader key) | none set | No reader key: confirmed (the live page reports `reader_key_not_configured`; no sheet can be read). Project settings show no source variables (checked 10/14). The reason code nevertheless shows that the deployment sees a copy spreadsheet ID; we are tracing where it comes from and will remove it. The ID alone gives no access. |
| Start-up log | `live entry -> client copy NOT CONNECTED (…)` | not checked on 10/14 (the page itself shows NOT CONNECTED) |
| Not signed in: `/api/live/entry` | no data | OK (10/14, private window): `{"ok":false,"error":"unauthenticated"}`, no data |
| Signed in, live entry `/` | every store 未接続, red 更新停止 banner, strip 「実データに接続できていません … モック・デモは表示しません」; no figures | OK (10/14): strip 「未接続（reader_key_not_configured）｜表示できるデータはありません（モック・デモは表示しません）」, banner 更新停止, every tab 「シートを読み取れません」; no data, no mock — `P3.png` |
| `/demo/` | demo snapshot, labelled デモ | OK (10/14): strip 「デモ表示｜固定の匿名化データです（実データではありません）」, demo store only — `P4.png` |
| Automated tests | all pass | 219 / 219 (10/14, PIATEC PC) |

## 5. Open data issues

### 5.1 Heartbeat (`心拍`): liveness check, successful processing, accepted transmission

Live copy read on 2026-10-14 00:41: 730 rows (2026-09-01 – 10-13). Our reading of each form of the `結果` column is below. The
**row numbers (元の行番号) for each form** are given in the table (from `diag:heartbeat --rows`); please read the actual
text in your sheet at those rows. These readings are proposals. Nothing on the screen uses them until you confirm (② ⑤ ⑦ show 状態未判定
meanwhile).

| Form of `結果` (free text shown as `<text>`) | Rows | Liveness check ran | Processing succeeded | Transmission accepted | Our question |
|---|---|---|---|---|---|
| `AI=scheduled-off / 未分析=…(AI無) / …` | 358 | yes | no (no scheduled AI result that hour) | no | confirm |
| `AI=max-read N件 / 未分析=… / MEAT=… / IN=…` | 107 (19 with `AIOK` for MEAT or IN) | yes | yes | not in `結果`: read from the columns `送信MEAT` / `送信IN` (`送` = sent; matched `送信ログ` up to 10/5) | does `AIOK` in `結果` mean the AI found something to send? After 10/5, are sends recorded only in `送信ログ`? |
| `AI=<text> / STOP=analysis-unverified / owner=…` | 23. owner=accepted (12): 元の行番号 534, 604, 608, 663, 673, 677, 687, 845, 850, 855, 859, 864 — note **every slot from 10/6 12:00 to 10/7 17:00** (845–864), just before the fast-patrol form starts. owner=pc-confirmed (10): 562, 631, 635, 659, 701, 771, 803, 822, 827, 836. owner=pc-uncertain (1): row number to follow | yes | no (stopped) | the owner notice only, if `owner=accepted` means LINE accepted it | is every `STOP=` a stop? meaning of the three `owner=` values |
| `AI=max-read N件 / … / IN=AIOK / STOP=staff-delivery / owner=accepted` | 1 | yes | yes (analysis finished) | unclear: staff delivery stopped | what stopped, and was anything sent to staff? |
| `AI=<text> / ROUTE=fast-patrol / was=<text>` | 19: one per patrol slot from 10/7 22:00 to 10/13 22:00, at 13:13 / 18:13 / 23:13: 元の行番号 869, 873, 878, 883, 887, 892, 897, 901, 906, 911, 915, 920, 925, 929, 934, 939, 943, 948, 953 | yes | unclear | not in this row | the post-10/5 form: what do `ROUTE` and `was` mean, and which record shows a completed patrol? |
| `AI=<text> / 未分析=…(AI無) / …` | 92 (88 + 4 with `規則影`). Two groups: (a) 9/1–9/8, hourly daytime checks at :42, e.g. 元の行番号 234–246 (9/1 10:42–22:42); (b) 9/15–10/2 **at the patrol result times 13:13 / 23:13**: 552, 622, 649, 705, 715, 719, 729, 733, 743, 747, 757, 761, 775, 789 | yes | no (not analysed) | no | (a): nothing to analyse, or a failure? (b): these are in the place of a patrol result. Did the patrol run without AI analysis, and should that slot count as a failure? |
| free text only (old form): 9/1–9/13, 10 rows a night at 00:42–09:42, e.g. 元の行番号 224–233 (9/1), 248–257 (9/2), 512–521 (9/13) | 130 | yes | cannot tell | cannot tell | what did the night-time check record before 9/14? Can this period be left out of Phase 1 figures? |

Classes: `scheduled_off` 358, `ai_result` 107, `stop` 24, not recognised 241 (= 19 + 92 + 130). Result rows (`ai_result` / `stop`)
appear only at 13:13, 18:13 and 23:13, i.e. 73 minutes after the 12:00 / 17:00 / 22:00 slots.

### 5.2 Questions: period, tab and extraction criteria

| Item | Value |
|---|---|
| Tab | `AI質問追跡` in the View-only Copy (all rows of the tab are read) |
| Time column | `送信時刻`, read as Asia/Bangkok |
| Period | business days 10/7–10/13 = from 2026-10-07 05:00 to 2026-10-14 05:00 (+07:00); a business day starts at 05:00 |
| Rule | every row whose `送信時刻` falls in the period, **any state**; no filter on group, state or slot |
| Result (read 2026-10-14 00:41) | 30 rows in the copy tab (元の行番号 11–40; your source tab has 39 rows); **1** row in the period: 元の行番号 40, 2026-10-12 23:45, MEAT, state `waiting` |

Every row of the copy tab (from `diag:reconcile --rows`, read 2026-10-14 00:41), so you can match them against `送信ログ` and your
transmission records:

| 元の行番号 | 送信時刻 (Bangkok) | group | state | in period |
|---|---|---|---|---|
| 11 | 2026-09-02 13:42:29 | IN | waiting |  |
| 12 | 2026-09-04 15:42:28 | IN | waiting |  |
| 13 | 2026-09-05 11:42:28 | IN | waiting |  |
| 14 | 2026-09-07 19:42:28 | MEAT | waiting |  |
| 15 | 2026-09-07 19:42:28 | IN | waiting |  |
| 16 | 2026-09-14 13:13:17 | MEAT | waiting |  |
| 17 | 2026-09-16 13:13:17 | MEAT | waiting |  |
| 18 | 2026-09-16 23:13:17 | MEAT | waiting |  |
| 19 | 2026-09-17 13:13:16 | IN | waiting |  |
| 20 | 2026-09-17 23:13:17 | MEAT | waiting |  |
| 21 | 2026-09-17 23:13:17 | MEAT | waiting |  |
| 22 | 2026-09-18 13:13:17 | MEAT | waiting |  |
| 23 | 2026-09-18 13:13:17 | MEAT | waiting |  |
| 24 | 2026-09-19 23:13:16 | IN | waiting |  |
| 25 | 2026-09-25 13:13:16 | MEAT | waiting |  |
| 26 | 2026-10-01 23:13:17 | MEAT | waiting |  |
| 27 | 2026-10-01 23:13:17 | IN | waiting |  |
| 28 | 2026-10-02 18:13:24 | MEAT | waiting |  |
| 29 | 2026-10-02 18:13:24 | IN | waiting |  |
| 30 | 2026-10-02 23:13:17 | MEAT | waiting |  |
| 31 | 2026-10-03 18:13:17 | MEAT | waiting |  |
| 32 | 2026-10-03 23:13:16 | MEAT | waiting |  |
| 33 | 2026-10-03 23:13:16 | MEAT | waiting |  |
| 34 | 2026-10-03 23:13:16 | MEAT | waiting |  |
| 35 | 2026-10-04 13:13:16 | MEAT | waiting |  |
| 36 | 2026-10-04 13:13:16 | MEAT | waiting |  |
| 37 | 2026-10-04 13:13:16 | IN | waiting |  |
| 38 | 2026-10-05 13:13:17 | IN | waiting |  |
| 39 | 2026-10-05 23:13:24 | IN | waiting |  |
| 40 | 2026-10-12 23:45:00 | MEAT | waiting | **yes** |
 What the list shows:

- Rows 11–39 run from 2026-09-02 to 2026-10-05 23:13, all at a slot time + 13 or + 42 minutes (scheduled runs).
- **No row between 2026-10-05 23:13 and 2026-10-12 23:45**, the period after your 10/5 23:36 change. Row 40 (23:45) is not at a
  slot time; it may come from the 5-minute polling loop.
- Your source tab has 39 rows, the copy 30. Are the 9 rows not copied questions to groups outside the copy, or missing?

### 5.3 Message IDs

On 2026-10-13 our check found 11 rows in `ログ` with a rounded `messageId` (元の行番号 15410, 15959, 16009, 16566, 17040, 18739, 19976,
20583, 21166, 21329, 22401). In the read of 2026-10-14 00:41 our check finds none, **but your copy now reports `ログ` with
`status = warning` and `detail` 「元の長いIDが数値型（末尾復元不可）: 行 …」**: some original IDs are numeric and their last digits cannot
be restored. We read this as: the IDs are written as text now, but the lost digits are not recovered. Our check no longer sees those
rows because the damaged values are now stored as text.

Rows listed in your `detail` (36, 元の行番号 of the source): 670, 2380, 3052, 3787, 4601, 5647, 9611, 9614, 9619, 9624, 9629, 9634,
9640, 9647, 9656, 9667, 9681, 9694, 9708, 9722, 9739, 9755, 12611, 15410, 15959, 16009, 16566, 17040, 18739, 19976, 20583, 21166,
21329, 22401, 22631, 23067. All 11 rows we found on 10/13 are in this list. The other 25 were not found by our check (they may be
rows outside the copy, or values our check could not recognise as rounded). Questions: (1) Is this list complete? (2) Rows 22631
and 23067 are near the end of your source tab: were they written after the string fix, i.e. is the fix complete for new rows?

We have not filled in or guessed any ID. Until you confirm which rows are affected and that the others are the original IDs, the
mapping (Bot replies, resends) of every row listed in your `detail` is **unverified**. Please confirm that the row list in `detail`
is complete; we propose to flag exactly those rows on screen (no other change), after your confirmation.

### 5.4 Nagoya

Phase 2. Kept separate from all Bangkok tests. ① shows Nagoya as 未接続 and nothing else.

## 6. Single issue list (Batches 1 and 2 combined)

### 6.1 Technical: between Takatsuji-san and the developers

| ID | Issue | Needed from | Status |
|---|---|---|---|
| T-01 | Heartbeat reading after 10/5 (§5.1); STOP code list; `slot`/`daily` deadlines (provisional 90 / 60 min) | Takatsuji-san | open |
| T-02 | Low question count: cross-check our criteria (§5.2) against transmission records | Takatsuji-san | open |
| T-03 | Message IDs: completion of the recovery of the 11 rows (§5.3) | Takatsuji-san | open; mapping unverified |
| T-04 | Meaning of `日時` and source-sheet write timing (§2.4) | Takatsuji-san | open |
| T-05 | Copy `meta`: allowed `status` values, `contract_version` literal, meaning of `source_rows` / `copied_rows` | Takatsuji-san | open |
| T-06 | Cancelled rows: is `内容` kept? How are resends with their own `messageId` tied to the original? | Takatsuji-san | open |
| T-07 | Timestamp format and zone in the copy; full `種別` list; zone of the `HH:MM` in `送信ログ` column 6 | Takatsuji-san | open |
| T-08 | Sends from the 5-minute polling loop: how they relate to scheduled runs (no `kind` column) | Takatsuji-san | open |
| T-09 | Format of masked lines in owner reports | Takatsuji-san | open |
| T-10 | Days with incomplete question records after 10/5: how to mark them | Takatsuji-san | open |
| T-11 | Start point of the 20 minutes in TV21 (§2.3) | Takatsuji-san | open |
| T-12 | **Urgent:** since the afternoon of 10/13 the copy's `meta` row for `ログ` has `status = warning`, `detail` 「元の長いIDが数値型（末尾復元不可）: 行 …」. The agreed values are ok / stale / error, so the dashboard shows the red 更新停止 banner for messages although the copy is current (read every 5 min). Option A: treat `warning` as "data current, with a notice" (no red banner; the rows in `detail` flagged). Option B: keep treating it as stopped. We recommend A. Which do you want? | Takatsuji-san | open |

### 6.2 Decisions on cost, permissions or business: for you

| ID | Decision | Type | Status |
|---|---|---|---|
| D-01 | Interim live data on Vercel (§3) | cost, permission | waiting for your decision |
| D-02 | Final environment: where, who prepares it, cost (§3) | cost, business | open |
| D-03 | Screen-side storage: location (your Google account / folder) and a separate writer account with edit access to that one file only | permission | open |
| D-04 | Stop/recovery notices: channel and recipients | business | open |
| D-05 | Who may view the dashboard (allowlist) | permission | open |

### 6.3 Closed

Reader account created and both files shared (10/13); Nagoya = Phase 2 (10/13); prototype update approved (10/13).

## 7. Features verifiable on 10/15 and features not complete

Expected dates for "not complete" items are PIATEC estimates, counted from the day the prerequisite is met.
**[PIATEC to confirm the estimates]**

### 7.1 Verifiable on 10/15

| Feature | Evidence | Owner |
|---|---|---|
| Read-only connection to both sheets | LIVE | PIATEC |
| All 7 pages with live data (PIATEC PC) | LIVE | PIATEC |
| 7-day reconciliation, source → dashboard data → screen | LIVE | PIATEC |
| Damaged message IDs flagged, never guessed | LIVE | PIATEC |
| Prototype shows 未接続, never mock data; demo kept separate | deployed prototype | PIATEC |
| Outage detection and recovery on a test connection (4 cases) | TEST | PIATEC |
| Auto-refresh timing, day 1 of 3 | LIVE | PIATEC |
| Display-only tests TV5, TV10, TV11, TV13, TV14 | TEST | PIATEC |

### 7.2 Not complete on 10/15

| Feature | Owner | Prerequisite | Expected completion |
|---|---|---|---|
| Auto-refresh timing over 3 days (TV9) | PIATEC | none | 10/16 |
| Run status on ② ⑤ ⑦ (patrol / daily rates) | PIATEC | your answers to T-01 | **[+2 business days]** |
| Stop/recovery notice to Takatsuji-san (TV19, TV21) | PIATEC | D-04, T-11 | **[+3 business days]** |
| Screen-side storage and rebuild (TV1 registry, TV7, TV12) | PIATEC | D-03 | **[+5 business days]** |
| Monitoring of the dashboard's own process (TV25) | PIATEC | D-02 (where it runs), D-04 | **[after D-02]** |
| Phones, real accounts, page speed on real volume (TV3, TV4, TV15, TV16, TV17) | PIATEC | D-01 or D-02 (a hosted URL) | **[+2 business days after hosting]** |
| Installation and recovery demo (TV18) | PIATEC (dashboard side); you (copy side) | D-02 | **[after D-02]** |
| Question count explained (TV20) | you, with PIATEC | T-02, T-10 | after your cross-check |
| Message ID mapping for the 11 rows | you | T-03 | after your confirmation |
| Nagoya (TV6 Nagoya part, TV16 Nagoya) | — | Phase 2 | Phase 2 |

## 8. Responsibilities and scope

PIATEC's responsibility, as requested: connection processing, screen-side storage, auto-refresh, and connection-failure monitoring and
recovery checks. Items that may be out of scope are listed here **before** any work starts:

| Item | Why it may be out of scope | Additional cost |
|---|---|---|
| Interim hosting fees on Vercel | platform cost not in the development quote **[PIATEC to confirm]** | **[PIATEC to fill]** |
| Setting up the final environment beyond deploy and configuration | depends on what D-02 requires | **[PIATEC to fill after D-02]** |
| Nagoya connection | Phase 2 | Phase 2 quote |

## 9. Automated tests: what was checked with live data and what with test data only

**All 227 automated tests (`npm test`; 219 before the 10/14 screen fixes) run on test data only**: synthetic rows, an in-process
fake of the Google Sheets API and a local test sign-in. No test reads the client's files, and test COPY-28 fails the build if any
test refers to the client's sample folder. Passing them shows that the logic works on the cases written into the tests; it is
**not** evidence about the live data.

Live data was checked separately, read-only, with the dashboard's own code (diagnostic scripts and the running pages). The table
pairs each test area with the live check, if there is one.

| Area | Test file(s) | Tests | Data in the tests | Live-data check (date, result) |
|---|---|---|---|---|
| Copy connection, contract check, transform, limits | `copy.test.js`, `copy-reader.test.js` | 59 | synthetic copy, fake Sheets API | **Yes.** 10/14 00:41 read: both files CONNECTED, contract findings 0 (⑥, `diag:reconcile`) |
| Messages / sends / questions per day, replies under the original | `acceptance.test.js` (TV1–TV25 display logic), `edge.test.js` | 37 | synthetic | **Yes.** 7 business days 10/7–10/13: 68 checks matched, 0 mismatches; ⑦ = reconcile (1,281 / 1 / 9) |
| Candidate answers, answer evidence | `answers.test.js` (+ COPY-33…38 in `copy.test.js`) | 8 | synthetic | Partly. Live: 1 question in the 7 days; the rule has not been seen producing a candidate in that window |
| Freshness banner (更新停止 after 20 min / status not ok) | `freshness.test.js` | 5 | synthetic | **Yes, by chance.** 10/13–10/14 the copy's `warning` status turned the banner red on the live pages (T-12) |
| Business day, time zones | `time.test.js` | 5 | synthetic | **Yes.** the 05:00 business-day windows used by the live reconciliation |
| Run status display (時刻前 / 結果待ち / 状態未判定, incl. 1 ms boundaries and the daily run across midnight) | `runs.test.js`, `screen-rules.test.js` | 14 | synthetic | Partly. Live run status is not judged (Q-49), so the live pages show 状態未判定. 「結果待ち」 on live data: to be seen in a slot's result window (e.g. 12:00–13:30) after the fix is deployed |
| 未回答 / 回答未確認 counts (every state at once, no double counting, response rate from confirmed answers only), question id hidden (also checked in the rendered pages with a synthetic id) | COPY-33 in `copy.test.js`, SCREEN-1/3/4 in `screen-rules.test.js` | (counted above) | synthetic | **To do after deployment** (① and ④ on live data) |
| Machine heartbeat, light check (⑥) | `production.test.js` (+ TV14 in `acceptance.test.js`) | 7 | synthetic | Partly. Live Heartbeat Sheet read (beats 1,484, alerts 7); the stop scenarios of TV14 cannot be produced on live data |
| Sign-in, allowlist, read-only API, security headers | `auth.test.js`, `api.test.js`, `security.test.js` | 48 | local test sign-in | Partly. Vercel prototype 10/14: no data without sign-in (`unauthenticated`); an allowlisted Google account signed in. Revocation with real accounts: not yet (TV3) |
| Live entry never shows mock data; demo separate; Vercel limits | `live-only.test.js`, `vercel.test.js` | 18 | synthetic | **Yes.** Vercel prototype 10/14 (commit `0eddab8`): live entry 未接続, no mock; `/demo/` labelled デモ |
| Outage detection and recovery | `outage-drill.test.js` | 5 | test connection (synthetic copy) | **No, by design**: production polling is not stopped (client direction 10/13). Real-time drill on the test connection: to follow |
| Diagnostic scripts themselves | `diagnostics.test.js` | 8 | synthetic | The same scripts were run on live data (reconcile, heartbeat, timing) |
| Build rules (no write route, no client data in tests, demo is anonymous) | `safety.test.js`, `sample-shape.test.js` | 13 | static code checks / synthetic | Not applicable |
| **Total** | 19 files | **227** | **all test data** | |
