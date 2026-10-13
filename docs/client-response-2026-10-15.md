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

URL: `https://parttimedashboard.vercel.app/` (live entry) and `/demo/` (anonymized demo, labelled デモ).

| Check | Expected | Result |
|---|---|---|
| Vercel environment has no source variables (sheet IDs, reader key) | none set | **[10/14]** |
| Start-up log | `live entry -> client copy NOT CONNECTED (…)` | **[10/14]** |
| Not signed in: `/api/live/entry` | no data | **[10/14]** |
| Signed in, live entry `/` | every store 未接続, red 更新停止 banner, strip 「実データに接続できていません … モック・デモは表示しません」; no figures | **[10/14 + screenshot]** |
| `/demo/` | demo snapshot, labelled デモ | **[10/14 + screenshot]** |
| Automated tests | all pass | **[10/14: n/n]** |

## 5. Open data issues

### 5.1 Heartbeat (`心拍`): liveness check, successful processing, accepted transmission

Live copy read on 10/13: 723 rows. Our reading of each form of the `結果` column is below. The **row numbers (元の行番号) and times for
each form** are in the attached list (`diag:heartbeat --rows`, section [7]); please read the actual text in your sheet at those rows.
These readings are proposals. Nothing on the screen uses them until you confirm (② ⑤ ⑦ show 状態未判定 meanwhile).

| Form of `結果` (free text shown as `<text>`) | Rows | Liveness check ran | Processing succeeded | Transmission accepted | Our question |
|---|---|---|---|---|---|
| `AI=scheduled-off …` | 353 | yes | no (no scheduled AI result that hour) | no | confirm |
| `AI=max-read N件 / 未分析=… / MEAT=… / IN=…` | 107 | yes | yes | only where `送信MEAT/IN=送` (matches `送信ログ` up to 10/5) | after 10/5, are sends only in `送信ログ`? |
| `AI=<text> / STOP=analysis-unverified` | 23 | yes | no (stopped) | no | is every `STOP=` a stop? full code list |
| `AI=<text> / STOP=staff-delivery` | 1 | yes | unclear: analysis may have finished, delivery stopped | no | what stopped? |
| `owner=accepted` | 13 | — | — | owner notice accepted (our guess) | is this LINE acceptance of an owner notice? |
| `owner=pc-confirmed` / `owner=pc-uncertain` | 10 / 1 | — | — | unclear | meaning |
| `AI=<text> / ROUTE=fast-patrol / was=<text>` | 17 (every slot from 10/7 22:00) | yes | unclear | not in this row | the new post-10/5 form: what do `ROUTE` and `was` mean, and which record shows a completed patrol? |
| `AI=<text>/未分析(AI無)` | 88 | yes | no (not analysed) | no | failure, or nothing to analyse? |
| free text only (old form, 9/1–9/13, written at :42) | 130 | yes | cannot tell | cannot tell | can we leave this period out of Phase 1 figures? |

Counts overlap where one row carries several codes.

### 5.2 Questions: period, tab and extraction criteria

| Item | Value |
|---|---|
| Tab | `AI質問追跡` in the View-only Copy (all rows of the tab are read) |
| Time column | `送信時刻`, read as Asia/Bangkok |
| Period | business days 10/7–10/13 = from 2026-10-07 05:00 to 2026-10-14 05:00 (+07:00); a business day starts at 05:00 |
| Rule | every row whose `送信時刻` falls in the period, **any state**; no filter on group, state or slot |
| Result (10/13 read) | 30 rows in the tab; **1** row in the period |

The attached list (`diag:reconcile --rows`, section [7b]) gives each row's 元の行番号, `送信時刻`, group, state and whether it is in the
period, so you can match them against `送信ログ` and your transmission records.

### 5.3 Message IDs

11 rows in `ログ` (元の行番号 15410, 15959, 16009, 16566, 17040, 18739, 19976, 20583, 21166, 21329, 22401) hold a rounded `messageId`.
They are shown by row number, flagged on ⑥, and never merged with other rows. We do not fill in or guess any ID. Their mapping
(Bot replies, resends) stays **unverified** until you confirm the recovery. New rows after your fix are checked on every read.

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
