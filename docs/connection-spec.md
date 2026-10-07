# docs/connection-spec.md — Connection Specification (Original Records → client's View-only Copy → Dashboard Data)

| Item | Value |
|---|---|
| Document status | CONTRACT DRAFT v0.2 (REQ deliverable **1c**: "ข้อกำหนดการเชื่อมต่อและรายการบันทึกที่ขาด"). It becomes binding only after the client reviews and approves it (REQ §3 #1c, §2). **Not yet sent to the client** (was due 10/6) |
| Written | 2026-10-03; **updated 2026-10-07** for the client architecture update (§0) and for the connector PIATEC built the same day (§5, §8.3, §11.1; details `docs/implementation-notes.md` §8) |
| Source of Truth | `01_ข้อกำหนดหน้าจอจัดการ.md` — Requirement **2026-10-02 (draft 5)**, cited **REQ §x** |
| Supporting | `02_ตัวอย่างทะเบียน_3สาขา.xlsx` (SAMPLE-02), `03_ตัวอย่างหน้าจอ.html` (SAMPLE-03) |
| Not usable | All documents of 9/30 are withdrawn (REQ §0) |
| Companions | `docs/data-mapping.md` (field-level rules), `docs/architecture.md`, `Claude.md` |
| Important | **PIATEC never accesses the Original Records (Source).** It reads only the client's **View-only Copy** and the **Machine Heartbeat Spreadsheet** (§0). Investigation sample (Bangkok, 2026-09-28 – 10-04) received 10/5 — structural findings in `docs/implementation-notes.md` §6. Anything that needs the real copy is marked **UNCONFIRMED / ไม่ยืนยัน**. Never write that unavailable data exists. |

Evidence labels (CONFIRMED / CANDIDATE / UNKNOWN / NOT CONNECTED) and the UNCONFIRMED marker are defined in `docs/data-mapping.md` §0.

---

## 0. Client architecture update — 2026-10-07 (supersedes REQ draft 5 where they differ)

Source: the client's 10/7 update page ("NIKUSHO 現場AI巡回 管理画面 ／ 2026-10-07 更新") and the accompanying message. Statements below are
labelled **CONFIRMED (client 10/7)** only where the client states them as fact or decision; open points stay UNCONFIRMED.

**Change:** in REQ draft 5 PIATEC was to build the copy process ("Copy Process", installed by the Client Developer). **From 10/7 the client
builds, runs and owns the Copy Script** ("because we know the original records and it is faster"). The column layout of the copy
("data contract v1") follows REQ §5-1 and does not change.

```text
A  ORIGINAL RECORDS (client only; Maru's spreadsheet; GAS writes every LINE message; tabs ログ・送信ログ・AI質問追跡・心拍)   ← never visible to PIATEC
      │ ① Copy Script — built and RUN BY THE CLIENT, every 5 minutes, permitted groups/columns only
      ▼
B  VIEW-ONLY COPY (client account; PIATEC reader account = view only) — same 4 tabs (filtered) + `meta`; rows from 2026-09-01
      │ ② Transform — PIATEC
      ▼
C  DASHBOARD DATA / LEDGER (REQ §5-3 registry: meta, stores, schedules, runs, questions, sends, messages) — stored in the client's account
      │ ③ Screens — PIATEC
      ▼
D  DASHBOARD
E  MACHINE HEARTBEAT SPREADSHEET (client account; PIATEC reader account = view only; `beats`, `alerts`; production machine writes a row every 5 min) → read directly by ⑥
```

| # | Fact | Label |
|---|---|---|
| 0-1 | The client builds, runs and maintains the Copy Script; PIATEC does not build, install or run it | CONFIRMED (client 10/7) |
| 0-2 | Copy runs every 5 minutes and contains only the permitted groups and columns (§4) | CONFIRMED (client 10/7) |
| 0-3 | PIATEC never opens the Original Records. A dedicated **reader account** (e.g. a service account) gets view access to **exactly two files**: the View-only Copy and the Machine Heartbeat Spreadsheet (Maru approves). Maru's account must not be used for reading (it could read everything in his Google account) | CONFIRMED (client 10/7; REQ §7-2, §7-5) |
| 0-4 | The dashboard login account(s) and the reader account are **separate** (Maru's dashboard login stays as it is) | CONFIRMED (client 10/7) |
| 0-5 | The copy matches rows by **`元の行番号`** (original row number) and **updates them in place** when a value changes later (`取消` in ログ, `結果` in 送信ログ, `state` in AI質問追跡). **A copied row never appears twice** | CONFIRMED (client 10/7) |
| 0-6 | The copy covers rows from **2026-09-01** onward | CONFIRMED (client 10/7) |
| 0-7 | A new row in the Original Records must appear on screen **within 10 minutes**, end to end | CONFIRMED (REQ §5; restated 10/7) |
| 0-8 | Columns of the copy = **Data Contract v1** (§4.1) and copy `meta` (§4.2) | CONFIRMED (client 10/7) |
| 0-9 | Dashboard Data / Ledger is stored in the client's account | CONFIRMED (client 10/7) |
| 0-10 | `parttimedashboard.vercel.app` is a prototype location only; production must be installed in an environment under the client's name (account and billing) — REQ §3-1, §7-5. The client asked PIATEC to confirm this understanding | CONFIRMED requirement; **PIATEC's written confirmation to the client: pending** |
| 0-11 | The client observed on the prototype that no data is returned without logging in | client observation 10/7 (not a TV3 pass) |
| 0-12 | Schedule history: **2026-09-13 – 10-01: 12:00, 22:00**; **from 2026-10-02: 12:00, 17:00, 22:00** (first 17:00 run 10/2 17:00); daily report **00:35** | CONFIRMED (client 10/7; REQ §5-4 #2) — resolves Q-16 |
| 0-13 | Production machine: `stores.production_host` = **`snowmaru`** | CONFIRMED (client 10/7) |
| 0-14 | Since **2026-10-05 23:36** questions to and replies from MEAT and IN are sent by the **5-minute polling loop**; the 12:00 / 17:00 / 22:00 runs only record their reads and decisions and **no longer send anything to staff** | CONFIRMED as a change of the Original Records (client 10/7) |
| 0-15 | As a result, `AI質問追跡` has **no new rows since 10/6**; the client is fixing the source side so that questions from the polling loop are written to `AI質問追跡` in the same format; Data Contract v1 does not change; the client will announce the fix | CONFIRMED (temporary gap) — date of fix and backfill **UNCONFIRMED (Q-52)** |
| 0-16 | `心拍.結果` now shows values such as **`AI=scheduled-off`** | CONFIRMED observation — **meaning UNCONFIRMED; no rule may be derived (Q-15, Q-49)** |
| 0-17 | How to read run status from now on: **not yet decided by the client**; they will announce it | **UNCONFIRMED (Q-49)** |
| 0-18 | Machine Heartbeat Spreadsheet: ready; view access is given once PIATEC's reader account is known. Nagoya 2-store samples: 10/8; the current records have **no field that tells the two Nagoya stores apart** | CONFIRMED (client 10/7) |
| 0-19 | Communication: questions as comments on the client's 10/7 page (with `@claude`; answered by the client's assistant, which changes no production settings; costs/contract/decisions by Maru); the message also says "send all questions and communications directly to me" | client statement 10/7 — **who the single contact is now, and whether it replaces the Takatsuji route of REQ §2, is UNCONFIRMED (Q-47)** |

The old PIATEC Copy Process prototype (v0.1.0; filter, HMAC substitute keys, checkpoint/upsert) is **superseded** and is not part of this
repository. Its design notes are kept only as background for verifying the client's copy (§5).

---

## 1. Purpose and authority

1. Define the contract that moves the monitoring system's existing logs into the dashboard automatically (REQ §2 completion condition).
2. State, per screen field, which Source column feeds it, what is calculated, and whether it can be **confirmed** with current records.
3. List the **missing records** and the changes the Client Developer must make.
4. If this file and REQ disagree, REQ wins — **except where the client's 2026-10-07 update (§0) changes REQ**, which then wins. If both are silent, the item is **UNCONFIRMED** — stop and ask the client contact (Q-47; REQ §7-7; options-with-recommendation rule in REQ §2).

---

## 2. Parties: who installs what, who has access

| Party | Does | Has access to | Must NOT |
|---|---|---|---|
| **PIATEC** | Reads the View-only Copy and the Heartbeat Spreadsheet with a dedicated reader account; builds the **Transform** (View-only Copy → Dashboard Data / Ledger) and the 7 pages; automatic update so a new original row is on screen ≤10 min; stop detection; writes this spec and the missing-record list; installs in the client's environment; authentication; demo data; fixes non-conforming items; post-delivery monitoring, root-cause analysis, recovery **of its own parts**; hands over procedures and source code (REQ §2 PIATEC ②–⑪; ① moved to the client on 10/7) | **View** of exactly two files (View-only Copy, Heartbeat Spreadsheet) via the reader account; the Dashboard Data / Ledger and cache it produces (client-named storage) | open, read or write the **Original Records**; read with Maru's account; access real GAS or real folders; send LINE or e-mail to groups/staff/owner (only exception: connection-problem and recovery notices via the single approved channel, Q-02); hold data only PIATEC owns; send registry text to any external service |
| **Client (Client Developer / Maru's side)** | **Builds, runs and maintains the Copy Script** (every 5 min) and the View-only Copy; grants the reader account view access to the two files (Maru approves); reviews/approves this spec and the missing-record list; changes the existing monitoring program **only when necessary**; answers read-method questions within **1 business day**; announces source-side changes (e.g. §0-14, §0-15) | Original Records (only the client touches them) | — |
| **Client Acceptance Tester (ผู้ตรวจรับ)** | Checks deliverables by comparing screen numbers against the records. **The pass/fail judge must not be the builder** (REQ §2) | records + screen | — |
| **Takatsuji (คุณทาคัตสึจิ)** | REQ §2: single contact for questions, confirmations and incident reports; receives connection-problem and recovery notices. **Whether this still holds after the client's 10/7 message ("send all questions directly to me") is UNCONFIRMED (Q-47)** | — | — |
| **Maru (คุณมารุ)** | Approves the quotation; identity verification and permission approvals only he can do (incl. the reader account's access, §0-3); costs, contract and decisions; final usability check | — | be assigned copying, updating, data comparison, checking, running commands, installing, daily operation or technical decisions. PIATEC never receives his password and never reads with his account (REQ §2, §7-5; §0-3) |

If copy-side or source-side errors are found (missing record, wrong time, etc.), PIATEC sends **evidence** — tab, `元の行番号`, time, expected vs actual value — to the client contact (Q-47); the client takes over (REQ §2).
Changes to the real monitoring system need Maru's approval (REQ §5-1).

---

## 3. Connection path and per-hop contract

```text
[Hop 0] ORIGINAL RECORDS ──(Copy Script, built and run by the CLIENT, every 5 min)──► [Hop 1] VIEW-ONLY COPY (client account)
[Hop 1] VIEW-ONLY COPY ──(PIATEC Transform, read with the reader account)──► [Hop 2] DASHBOARD DATA / LEDGER (7-tab registry)
[Hop 2] DASHBOARD DATA ──► [Hop 3] CACHE (derived only)
[Hop 2/3] + MACHINE HEARTBEAT SPREADSHEET (client, read as-is with the reader account) ──► [Hop 4] SERVER-SIDE VIEWER CHECK ──► DASHBOARD
```

| Hop | Producer | Consumer | Contract | Label |
|---|---|---|---|---|
| 0→1 | **client Copy Script** | View-only Copy | permitted groups/columns only (§4); every 5 min; in-place update by `元の行番号`; no duplicate rows; rows from 2026-09-01; copy `meta` with `last_read_at` / `updated_at` | CONFIRMED (client 10/7) |
| 1→2 | PIATEC Transform | Dashboard Data / Ledger | Produce REQ §5-3 columns and meanings; times as `yyyy-MM-ddTHH:mm:ss+07:00`; rebuild must not reset question state or answers | CONFIRMED (REQ §5-3) |
| 2→3 | PIATEC | Cache | Cache is derived from Dashboard Data only; if numbers differ, upstream wins; **revoked user must not see data from cache either** | CONFIRMED (REQ §7-3, §7-6) |
| HB | client | PIATEC | Heartbeat Spreadsheet tabs `beats`, `alerts` read as-is; ready, access after the reader account is known | CONFIRMED (REQ §5-3; client 10/7) |
| 0→screen | all | user | ≤ **10 minutes** end-to-end | CONFIRMED (REQ §5; client 10/7) |

Budget (DERIVED): the copy runs every 5 minutes, so in the worst case ≈5 minutes remain for reading the copy, the Transform and display.
PIATEC's Transform cadence, runtime and hosting are **UNCONFIRMED (Q-08 PARTIAL, Q-01)**. The reader account's identity is **pending — PIATEC must send it to the client (Q-48)**.

---

## 4. What the View-only Copy contains (Data Contract v1 — client 10/7, follows REQ §5-1)

### 4.1 Tabs and columns (left to right, exact)

| Tab | Columns |
|---|---|
| `ログ` | `元の行番号`, `日時`, `グループID`, `群`, `発言者`, `発言者キー`, `種別`, `内容`, `messageId`, `再送`, `取消` |
| `送信ログ` | `元の行番号`, `日時`, `宛先`, `宛先の群`, `宛先キー`, `文面`, `結果`, `返した元の発言` |
| `AI質問追跡` | `元の行番号`, `question_id`, `送信時刻`, `group`, `who`, `question_th`, `source_candidate_sha256`, `slot`, `state` |
| `心拍` | `元の行番号`, `時刻`, `読んだ行数`, `候補数`, `送信MEAT`, `送信IN`, `結果`, `実行ms`, `gap分` |
| `meta` (copy) | `tab`, `last_read_at`, `updated_at`, `source_rows`, `copied_rows`, `contract_version`, `status`, `detail` |

### 4.2 Copy `meta` (not the Dashboard Data `meta` of REQ §5-3)

| Column | Meaning (client 10/7) | Label |
|---|---|---|
| `tab` | copied tab | CONFIRMED |
| `last_read_at` | when the Original Records were last read | CONFIRMED — this is the REQ §5 "source read completed" timestamp |
| `updated_at` | when the copy was last written | CONFIRMED — this is the REQ §5 "copy updated" timestamp |
| `source_rows`, `copied_rows` | row counts (exact definition, e.g. whether `source_rows` counts rows before filtering) | names CONFIRMED; **definitions UNCONFIRMED (Q-50)** |
| `contract_version` | data-contract version (v1) | CONFIRMED |
| `status`, `detail` | copy status and reason | **allowed values UNCONFIRMED (Q-50)** |

### 4.3 Groups, recipients, keys

| Item | Rule | Label |
|---|---|---|
| Groups | **MEAT, IN, ALL, MANAGEMENT, PHOTO** only. `群` holds the group name, derived by the client from the last 6 characters of `グループID` (`2c54ac` MEAT, `c894fd` IN, `47247d` ALL, `15c2bf` MANAGEMENT, `49fcce` PHOTO; LINK `4846a3` and any other group are not copied) | CONFIRMED (REQ §5-1; client 10/7) |
| `グループID` | present in the copy (allowed by REQ §5-1); PIATEC uses `群` and does not carry `グループID` into Dashboard Data | CONFIRMED (copy); PIATEC rule DERIVED |
| Recipients (`送信ログ`) | only sends to the five groups and to the owner; **`宛先の群` = `OWNER`** classifies an owner send | CONFIRMED (client 10/7) — resolves Q-13 |
| Substitute keys | `発言者キー` and `宛先キー` replace `userId` / `宛先ID`; they **only work inside the copy**; the same person always gets the same key | CONFIRMED (client 10/7) |
| Masking | lines in owner reports that quote the accounting group or external groups are **masked** by the client | CONFIRMED (client 10/7); masked text format **UNCONFIRMED (Q-51)** |
| Row identity | `元の行番号` in every tab; rows updated in place; never twice | CONFIRMED (client 10/7) — resolves Q-11 for the copy |
| Range | rows from 2026-09-01 | CONFIRMED (client 10/7) |

### 4.4 Never present (and never carried by PIATEC)

`userId`, `宛先ID`, `画像URL` (and images), LINK and out-of-table groups, recipients other than the five groups and the owner, other tabs
(e.g. reservation names/phones). Cancelled (`取消`) rows: **whether the copy keeps their `内容` is not stated → UNCONFIRMED (Q-17)**;
until answered, PIATEC never displays the content of a `取消` row.

---

## 5. Filtering — done by the client's Copy Script; verified by PIATEC

1. Filtering happens **in the client's Copy Script**, before data reaches the View-only Copy (REQ §5-1). Hiding on screen is not compliance.
2. PIATEC **verifies** what it reads — **IMPLEMENTED** (`src/adapters/copy/validate.js`; full list in `docs/implementation-notes.md` §8.2;
   synthetic tests only): only the §4.1 tabs/columns; only the five groups and `OWNER`; `グループID` suffix consistent with `群`; no
   `userId` / `宛先ID` / `画像URL`; no raw LINE-style ids anywhere but `グループID`; no URLs outside the free-text columns (`内容`,
   `文面`, `question_th`, names, `結果`, `detail` — staff do type links) and none in `内容` of a non-text row; no duplicate or malformed
   `元の行番号` per tab; `contract_version` = v1. A violation **stops that tab** (or the whole copy for a `meta` / tab-list violation),
   is shown as "update stopped", never as data, and is reported with evidence (tab, `元の行番号` or sheet row, column, problem — never
   a cell value) on ⑥ for the client contact.
3. A new/unknown group, recipient or column **stops the tab** (fail closed; nothing is filtered row by row or stripped by PIATEC).
4. Test **TV24** inspects the *whole* View-only Copy (type A, real data; judged by the client).
5. Registry text goes to no external service (REQ §7-8). Tests that change data run on **test sheets only** (REQ §7-9).
6. Images: only counts may exist in Dashboard Data; no image bodies (REQ §5-3, §9).

---

## 6. Field mapping: View-only Copy column → Dashboard Data field

"Status" column: **C** = CONFIRMED by REQ or the client (10/7); **D** = derivable from REQ text; **Q** = UNCONFIRMED (question id). Full semantics are in `docs/data-mapping.md` §5.
Every copy tab also has `元の行番号` (row identity, §4.3); PIATEC keeps it as the trace key from a Dashboard Data row back to the copy (DERIVED).

### 6.1 `ログ` → `ทะเบียนข้อความ`

| Copy column | In the copy | Dashboard field | Transformation | Status |
|---|---|---|---|---|
| `元の行番号` | kept | (trace key) | row identity in the copy; one copy row = one source row | C (client 10/7) |
| `messageId` | kept | `message_id` | key; same `messageId` and/or `再送` rows → one logical message. Sample 10/5: `再送` rows carry their **own** `messageId` | C rule / **Q-17** (how resends are tied together, which row wins) |
| `日時` | kept | `at` | to `+07:00` ISO format | C format / Q-12 source format |
| `群` (and `グループID`) | both kept by the client | `group` | use `群` (the client already resolved the name); `グループID` is not carried into Dashboard Data | C (client 10/7) |
| `発言者` | kept | `sender` | verbatim | C |
| `発言者キー` | substitute key (copy only) | — (candidate-answer matching "same sender" may use it; not displayed) | not displayed; never sent outside | C key / use for matching **Q-22** |
| `種別` `text`/`image`/`sticker`/`video`/`file` (sample) | kept | `kind` `text`/`photo`/`sticker`/`other` | map; `video`/`file` → `other` | D / Q-12 for the full value list |
| `内容` | kept | `text` | verbatim; photo and sticker → blank | D |
| `取消` | kept, **updated in place** when a message is cancelled later | no REQ column | row shown "ข้อความถูกยกเลิก", no content | C rule / **Q-17** representation and whether the copy keeps `内容` |
| `再送` | kept | — | used only for de-dup | C |
| `userId`, `画像URL` | **not in the copy** | — | — | C (forbidden) |
| (message→run link) | — | `run_id` | no Source column identified | **Q-21** |
| (Bot handling) | — | `handling`, `replies_json` | see §6.2 and data-mapping §8 | partly **Q-18** |
| (answer link) | — | `question_id`, `question_link` | candidate rule data-mapping §7.2 | C candidate / Q-22 |

### 6.2 `送信ログ` → `บันทึกการส่ง` (and `replies_json`)

| Copy column | Dashboard field | Transformation | Status |
|---|---|---|---|
| `元の行番号` | (trace key); proposed source of `send_id` | e.g. `send_id` = tab-scoped `元の行番号` | C identity (client 10/7) / `send_id` derivation **PIATEC proposes (Q-11)** |
| `日時` | `sent_at` | ISO `+07:00` | C / Q-12 |
| `宛先` | `target_label` | recipient name as copied | C |
| `宛先の群` | `target_kind` (`OWNER` → `owner`; five groups → `group`) and group | map | C (client 10/7) |
| `宛先キー` | — | substitute key (copy only); not displayed | C |
| `宛先ID` | — | **not in the copy** | C |
| `文面` | `text` | verbatim (owner-report lines quoting accounting/external groups arrive **masked**) | C / masked format Q-51 |
| `結果` `OK…` (sample: `OK`, `OK 200`) | `result=sent` | LINE accepted the request; wording "ส่งแล้ว" only; **updated in place** by the copy when it changes | C |
| `結果` `NG(…` | `result=failed` | | C |
| `結果` `ATTEMPTING_NO_RETRY` (stuck) | `result=unknown` | | C |
| `結果` any other value | `result` blank | unclassified; never shown as a failure; counted on ⑤ (IMPLEMENTED) | — |
| `返した元の発言` (`HH:MM\|発言者`; was "column 6") | `replies_json[].link`, `handling` | unique match → `confirmed`; ≥2 → `ambiguous`; empty → no link. As implemented: confirmed only when calendar-day and business-day readings agree on one message (Q-19), the `HH:MM` is read in the configured copy zone (Q-12), and the message is not later than the send | C rule / conservative reading IMPLEMENTED |
| (kind) | `kind` (`question`/`reply`/`daily`/`alert`) | no copy column; since 10/5 23:36 MEAT/IN questions and replies come from the 5-min polling loop | **Q-14, Q-49** |

### 6.3 `AI質問追跡` → `ทะเบียนคำถาม`

| Copy column | Dashboard field | Transformation | Status |
|---|---|---|---|
| `元の行番号` | (trace key) | row identity; `state` is **updated in place** by the copy | C (client 10/7) |
| `question_id` | `question_id` | key | D |
| `送信時刻` | `sent_at` | ISO | D / Q-12 |
| `group` | `group` | | D |
| `who` | `who` | | D |
| `question_th` | `question_text` | verbatim | D |
| `slot` | `run_id` | slot→run link (sample: `question_id` starts with the slot time) | **Q-21**; questions from the 5-min polling loop (after the client's fix) and their run link **Q-49, Q-52** |
| `state` (always `waiting`) | `state` | `waiting`; `candidate` from rule data-mapping §7.2; never other values without evidence | C |
| `source_candidate_sha256` | — | no stated use | **Q-15** |
| (send link) | `send_id` | | **Q-21** |
| (closing) | `closed_reason`, `closed_at` | no Source evidence | **Q-23**, Phase 2 |
| (answers) | `answers_json` | candidates from `ログ` | C candidate; confirmed impossible now |

### 6.4 `心拍` (+ `送信ログ`) → `ทะเบียนรอบตรวจ`

| Copy | Dashboard field | Status |
|---|---|---|
| `心拍.元の行番号` | (trace key) | C (client 10/7) |
| `心拍.時刻` | probably `read_at` | **Q-15** |
| `心拍.読んだ行数` | probably `input_lines` (blank = not pulled; 0 = zero) | **Q-15** |
| `心拍.候補数`, `送信MEAT`, `送信IN`, `実行ms`, `gap分` | no stated screen field | **Q-15** |
| `心拍.結果` (free text; now also `AI=scheduled-off`, §0-16) | `status`, `reason` | **the client will decide and announce how run status is read (§0-17)**; until then no interpretation is implemented | **Q-15, Q-49** |
| `送信ログ` OK rows | `sent_at`, `questions_sent`, `messages_sent` | counts D; run linking **Q-21** |
| schedule (`schedules`) | `scheduled_at`; one row per scheduled run even if it did not run | C |
| — | `ai_done_at`, `posted_at`, `received_at`, `owner_items`, `photos_total`, `photos_reviewed`, `owner_notified`, `evidence` | no Source column identified | **Q-15** |

### 6.5 Configuration and meta

| Screen tab | Origin | Status |
|---|---|---|
| `stores`, `schedules` | configuration maintained so that **adding a store needs no code change**; where it is stored/edited and by whom (REQ calls it settings kept in client-named storage). Bangkok content CONFIRMED 10/7: slots 12:00,22:00 (2026-09-13 – 10-01), 12:00,17:00,22:00 (from 10-02), daily 00:35, `production_host` `snowmaru` | C principle and Bangkok values / **Q-29** for storage and Nagoya |
| `meta` (Dashboard Data) | written by the Transform for each of the four tabs: `generated_at`, `last_success_at`, `source_through`, `status`, `detail`, `contract_version`. `last_success_at` derives from copy `meta.last_read_at` (DERIVED) | C columns / **Q-09** computation of `source_through`, `stale` vs `error` |
| `beats`, `alerts` | Machine Heartbeat Spreadsheet read as-is with the reader account | C (ready; access after Q-48) |

---

## 7. Transformation and status rules (summary; details in data-mapping)

| Topic | Rule | Ref |
|---|---|---|
| Run status | 7 values; `running` past deadline → `unknown`; schedule without row after deadline → "ยังไม่ยืนยัน"; before deadline "ยังไม่ถึงเวลา"; out-of-scope → "ไม่อยู่ในขอบเขต" | data-mapping §5.3.1 |
| Send result | `OK`→`sent`, `NG(`→`failed`, `ATTEMPTING_NO_RETRY`→`unknown`; never "ถึงผู้รับ/อ่านแล้ว" | §6.3 |
| Question state | only `waiting`, `candidate` supportable now | §7 |
| Answer | `candidate` ≠ `confirmed`; candidate never in rate | §7 |
| Bot reply | exactly one matching message → `confirmed`; else `ambiguous` | §8 |
| Business day | per store; not viewer time zone | §9 |
| Dummy rows | `DUMMY-`/`dummy-` excluded from real summaries | §5 |
| Blank vs zero | blank = not pulled; 0 = zero | §10 |

---

## 8. Update target, stop detection, checkpoint, deduplication, recovery

### 8.1 Time requirements (CONFIRMED)

| Requirement | Value | Verified by |
|---|---|---|
| Source row → on screen | **≤ 10 minutes, whole path** | TV9 (3 consecutive days, real data, no client work, 0 writes to Source, no effect on monitoring/sending) |
| Updates stopped → detected | **≤ 20 minutes**: screen shows "หยุดอัปเดต"; the agreed contact (REQ: Takatsuji; Q-47) notified **once**; resumes from where it stopped; no duplicate or missing rows | TV19, TV21 |
| Test-sheet change → screen | ≤ 5 minutes | TV2 (type B) |
| Page display | ≤ 3 seconds | TV4, TV17 |

The 10-minute budget per hop and the polling/trigger cadence are **UNCONFIRMED (Q-08)**. The 20-minute figure is for *data update* freshness; the 15-minute figures for machine heartbeat and light check (data-mapping §9.2) are different thresholds and must not be merged.

### 8.2 Two separate timestamps

The View-only Copy keeps "time the Original Records were last read" (`meta.last_read_at`) **separately** from "time the copy was last written" (`meta.updated_at`) — CONFIRMED (client 10/7) — so that "0 messages" can be told from "reading stopped" (REQ §5). In Dashboard Data these appear as `meta.last_success_at` / `generated_at` / `source_through` (**Q-09** for exact derivation).

### 8.3 Checkpoint / resume / deduplication

Copy side (client, CONFIRMED 10/7): rows are matched by `元の行番号` and updated in place; a row never appears twice; the copy covers
2026-09-01 onward and is refreshed every 5 minutes. Resume after a failed copy run is the client's responsibility.

Transform side (PIATEC):
1. Running twice must create no duplicates; a mid-way failure must not lose or duplicate rows (REQ §3 #1b, TV19).
2. Because the copy is complete from 2026-09-01 and keyed by `元の行番号`, Dashboard Data is **rebuilt from the copy on each read**
   (idempotent by construction; no PIATEC-side checkpoint over the Original Records) — **IMPLEMENTED** in memory (`src/adapters/copy/`;
   reads at most once a minute; ≈0.7 s per read for 20,000 synthetic messages). Where the Dashboard Data / Ledger is stored in the
   client's account, and how question state survives a rebuild without PIATEC-only data, are **UNCONFIRMED (Q-01, Q-23)**.
3. Checkpoints / resume points, if any, live only in **client-named storage** (REQ §7-3).

### 8.4 Stop detection and recovery behaviour

| Event | Required behaviour | Label |
|---|---|---|
| Copy Script stopped (Original Records → View-only Copy only; later stages still running) — visible to PIATEC through copy `meta.last_read_at` / `updated_at` / `status` | do **not** display normal; within 20 min "หยุดอัปเดต" + notify the agreed contact (TV21; Q-02, Q-47) | C |
| Any stage fails midway | resume from checkpoint (TV19) | C |
| Monitoring process itself stops | must be detected too (TV25) | C |
| Stale/error/old `generated_at`/unreadable/missing column | red banner "หยุดอัปเดต (สำเร็จล่าสุด hh:mm)"; old numbers grey, never normal/0 | C |
| View-only Copy deleted / reader access lost / dashboard fault | dashboard shows "update stopped", never stale numbers as current; recovery of the copy and of access is the client's (Copy Script owner); PIATEC recovers its Transform and screens **without Maru acting**; named owner and contact channel in writing (TV18) | C principle / split of TV18 duties after 10/7 **UNCONFIRMED (Q-53)** |
| Notification | only to the agreed contact (REQ: Takatsuji; Q-47), via the single approved channel; no duplicate alerts; notice on recovery | C principle; channel and timings **Q-02, Q-03** |

PIATEC must not interrupt the existing monitoring: the monitoring system keeps running even if PIATEC's process or screen stops (REQ §2). PIATEC has no write access anywhere on the client side except the Dashboard Data / Ledger it produces.

---

## 9. Which states can / cannot be confirmed now (Bangkok, real records)

| State / function | Current records | Label |
|---|---|---|
| Patrol/daily ran, stopped, missing, late, unknown | derivable from `心拍` + `送信ログ` once the reading of run status is decided. Since 10/5 23:36 the scheduled runs no longer send to staff and `結果` shows e.g. `AI=scheduled-off`; **the client will announce how to read run status** | UNCONFIRMED (Q-15, Q-49); until then show "ยังไม่ยืนยัน" |
| Message received (text/photo/sticker), resend merged, cancelled hidden | yes | CONFIRMED |
| Send result OK/NG/ATTEMPTING_NO_RETRY | yes | CONFIRMED |
| Question sent | yes (`AI質問追跡` = sent only) — **but no new rows since 10/6** (polling-loop questions are not yet written; client fixing) | CONFIRMED up to 10/5; PARTIAL / BLOCKED from 10/6 until the fix (Q-52) |
| Question `waiting` | yes | CONFIRMED |
| Question `candidate` / candidate answer | yes (same group + same sender + after `送信時刻` + not cancelled) | CANDIDATE |
| Question `acked` / `answered` / `closed` | **no evidence** | cannot be confirmed (UNKNOWN until missing record exists) |
| Confirmed answer, response rate, time-to-answer | **no proof of question↔answer link** | cannot be confirmed; show "ยังไม่สรุป…" |
| Bot reply linked to message | only when `送信ログ` column 6 exists (from 2026-10-02) and exactly one message matches | CONFIRMED for unique matches only; otherwise UNKNOWN ("ไม่ทราบว่าตอบข้อความใด") |
| Bot reply linked by message ID | **no record** | cannot be confirmed |
| Light-check operating time | **not in any sheet yet** | cannot be confirmed (UNKNOWN) |
| Machine health | Machine Heartbeat Spreadsheet (ready; view access after the reader account is known) | NOT CONNECTED until PIATEC can read it (Q-48) |
| Nagoya 2 stores | samples on 10/8; the current records have no field that tells the two stores apart | NOT CONNECTED (Phase 2) |
| `handling` = `not_needed` / `pending` / `carried` | needs AI judgement; PIATEC must not guess | UNCONFIRMED (Q-18) |
| `owner_items`, `photos_*`, `owner_notified`, `ai_done_at`, `posted_at`, `received_at` | no Source column identified | UNCONFIRMED (Q-15) |

---

## 10. Required missing records (deliverable 1c; proposals are for the client to approve)

### 10.1 Known to REQ (§5-1) — mandatory entries

| ID | Missing record | Why needed | Current limitation | Phase | Proposed addition | Who changes the Source |
|---|---|---|---|---|---|---|
| M-1 | Evidence of "all answers obtained" / "closed" | `answered`, `closed`, `closed_reason` | tab only holds `waiting`; no evidence | 2 | PIATEC drafts the record definition; **not defined yet** | Client Developer (Maru approval via Takatsuji) |
| M-2 | Record proving question ↔ answer link | `confirmed` answers, response rate, time-to-answer, `acked` | link only provable as "possibly related" | 2 | PIATEC drafts; **not defined yet** | Client Developer |
| M-3 | Record linking a message to the Bot reply by message ID | exact `replied` for all cases incl. one reply to several messages | only `HH:MM|発言者` (column 6, from 2026-10-02; blank before) | 2 | PIATEC drafts; **not defined yet** | Client Developer |
| M-4 | Light-check operating time | page ⑥ and ① light-check status | not in any sheet | Phase not stated by REQ → **UNCONFIRMED (Q-07)**. Client change date: "ส่วนเพิ่มตามวันที่ตกลง", listed under 10/8 (REQ §5-4 #3) | per PIATEC proposal (not yet written) | Client Developer |
| M-5 | Machine Heartbeat Spreadsheet (`beats`, `alerts`) | page ⑥, ① | **ready** (client 10/7); access pending the reader account (Q-48) | 1 | exists as REQ §5-3 definition | Client |
| M-6 | Nagoya 2 stores readable records + store marker | Phase 2 real data | samples 10/8; **no field separating the 2 stores** (client 10/7) | 2 | PIATEC proposes spec, price, schedule after the samples | Client |
| M-7 | `AI質問追跡` rows for questions sent by the 5-min polling loop (since 10/5 23:36) | ④, ①, ⑦ question figures | **no new rows since 10/6** (client 10/7) | 1 | client is fixing it (same format, contract v1 unchanged); fix date / backfill Q-52 | Client |

### 10.2 Additional gaps found by this cross-check (NOT confirmed by the client; to be raised via Takatsuji for list v1)

| ID | Gap | Evidence | Question |
|---|---|---|---|
| G-1 | No Source column identified for `ai_done_at`, `posted_at`, `received_at`, `owner_items`, `photos_total`, `photos_reviewed`, `owner_notified`, `evidence` | REQ §5-1 lists `心拍`/`送信ログ`/`AI質問追跡`/`ログ` columns; none obviously carries them; SAMPLE-02 real rows nevertheless contain some | Q-15 |
| G-2 | No `send_id` / `kind` / `target_kind` source | `送信ログ` columns | Q-11, Q-14 |
| G-3 | No link send→run, message→run, question→run (only `slot` in `AI質問追跡`) | REQ §5-3 `run_id` columns | Q-21 |
| G-4 | Cancel representation missing in `ทะเบียนข้อความ` | REQ §5-3 vs §5-1 | Q-17 |
| G-5 | `handling` values needing AI judgement | REQ §5-1 forbids guessing | Q-18 |
| G-6 | Timestamp formats/time zones of Source columns | not stated | Q-12 |
| G-7 | Exact 17:00 patrol start date | **resolved 10/7: first 17:00 run 2026-10-02 17:00; 12:00,22:00 from 2026-09-13** | Q-16 (closed) |
| G-8 | `心拍.結果` interpretation table / run-status reading | REQ: PIATEC proposes, client confirms; 10/7: client will decide how to read run status | Q-15, Q-49 |

---

## 11. Changes required of the Client Developer, and install / rollback / recovery responsibilities

### 11.1 Required changes / actions (REQ §2, §5-4; updated 2026-10-07)

| # | Action | Who | When | Status |
|---|---|---|---|---|
| 1 | Supply investigation samples (allowed groups/columns only) | client | 10/6 | DONE (Bangkok 09/28–10/04, received 10/5) |
| 2 | Build the View-only Copy (Copy Script, every 5 min) | **client** (changed 10/7) | during 10/7 | in progress (client) |
| 3 | Send the reader account's e-mail (service account or similar) as a comment on the client's 10/7 page | **PIATEC** | now | **MISSING — PIATEC action (Q-48)** |
| 4 | Give the reader account view access to exactly two files (View-only Copy, Heartbeat Spreadsheet); Maru approves | client | the day the e-mail arrives | waiting on #3 |
| 5 | Connect the dashboard to the copy and show real data | PIATEC | from 10/8 | connector IMPLEMENTED on synthetic data (`NIKUSHO_LIVE_ADAPTER=copy`); real connection **BLOCKED by #3/#4** — today it shows NOT_CONNECTED |
| 6 | Send connection spec (rules for building Dashboard Data from the copy) and missing-record list v1 | PIATEC | planned 10/6 | **MISSING / overdue** (this document is the draft) |
| 7 | Review/approve the run-status reading, this spec, the missing-record list | client | within 1 business day of receipt | client will announce run-status reading (Q-49) |
| 8 | Machine Heartbeat Spreadsheet | client | ready (10/7) | access via #4 |
| 9 | Nagoya 2-store samples | client | 10/8 | expected |
| 10 | Fix `AI質問追跡` for polling-loop questions | client | announced when done | in progress (Q-52) |
| 11 | Confirm to the client that `parttimedashboard.vercel.app` is a prototype location and production will be installed in the client's environment | PIATEC | now | **MISSING — PIATEC action** |

If any further client-side work is found, tell the client contact **before building** (REQ §5-4; Q-47).

### 11.2 Install / rollback / recovery

| Activity | PIATEC | Client | Maru |
|---|---|---|---|
| Copy Script (build, install, run, revise, roll back) | none (may review the copy against this spec) | **owns all of it** (changed 10/7) | — |
| Reader account access to the two files | sends the account e-mail | grants view access | approves |
| Install in the client's environment (Transform, Dashboard Data, screens) | installs; verifies connection | provides account/billing (Q-01) | none |
| Recovery drill before handover (copy deleted / access re-granted / dashboard fault) | demonstrates the dashboard side (stop shown, recovery after access returns) (TV18) | restores the copy / access | not required |
| Post-handover fault | receives report, analyses root cause, recovers its parts, **confirms recovery** | recovers Copy Script / Original Records side | **must not** be asked to install or recover |
| 10/26–11/12 freeze | emergency fix only for **display stoppage or data leakage**, with the client contact's approval; rollback procedure and operator written by 10/25 | — | — |

README must let **one client-side person** reinstall and recover by themselves (REQ §3 #5).

---

## 12. Open-question register (the only list of UNCONFIRMED items)

Rules: answers come from the client contact (REQ §2 named Takatsuji; the route after 10/7 is Q-47); the client replies to read-method questions within 1 business day (REQ §2, §5-4 #5). "Safe default" is the non-guessing behaviour while the question is open. **Status after the 2026-10-07 update: §12.1.**

| ID | Question | Blocks | Who answers | REQ timing | Safe default until answered |
|---|---|---|---|---|---|
| **Q-01** | Authentication method (REQ §7-6) and hosting technology. REQ requires: install in the client's Google environment; server-side viewer check; works for Maru's personal Gmail and Takatsuji; some Apps Script settings cannot read the viewer's e-mail | login design, allowlist, TV3, TV15 | PIATEC answers (10/3), prototype tested with real accounts (10/6) | 10/3, 10/6 | no data to any viewer not verified on the server |
| **Q-02** | The single approved channel for notifying Takatsuji of connection problems/recovery | alert dispatch, TV19/TV21 | agreed at quotation | quotation (10/3) | no automatic notice sent until agreed |
| **Q-03** | Monitoring/recovery terms: minutes from fault detection to notice; duplicate suppression and recovery notice; service hours and holidays; first-response time; recovery-time target; holiday/night channel; warranty, contact, monthly cap | operations, quotation | PIATEC answers | 10/3 | none assumed |
| **Q-04** | Allowlist storage/maintenance procedure and revoked-user behaviour incl. cache | deliverable 6, TV3 | PIATEC proposes | 10/6 prototype | deny |
| **Q-05** | Cache location, lifetime and purge-on-revoke mechanism | TV3, TV7 | PIATEC proposes | — | no cache served to non-allowed viewer |
| **Q-06** | Who is the Client Acceptance Tester (must differ from the builder) | acceptance | client | — | not decided by PIATEC |
| **Q-07** | Phase 2 price/date; whether Nagoya shows real data at 10/25 and 11/12; due date of client-side changes for M-4 | Phase 2 | Maru approves, via Takatsuji | after quotation | Phase 1 behaviour: Nagoya "ยังไม่เชื่อมต่อ" |
| **Q-08** | Copy Process runtime/trigger/cadence and per-hop budget for the 10-minute path | pipeline | PIATEC proposes, Client Developer approves | after 10/6 inspection | none |
| **Q-09** | How `source_through` is computed and what separates `stale` from `error` | banner, TV13 | PIATEC proposes, client approves | — | show "หยุดอัปเดต" when unsure |
| **Q-10** | Read Copy layout, names of the two timestamps, surrogate-key method, retention of full `グループID`, retention of cancelled content | Copy Process | PIATEC proposes, Client Developer approves | 10/6 | exclude |
| **Q-11** | Row identity for dedup/checkpoint, esp. `ログ` duplicates, `送信ログ` (no id), `心拍`; source of `send_id` | TV19 | PIATEC proposes after samples | 10/6 | none |
| **Q-12** | Source timestamp formats/time zones; list of `種別` values; display time zone for clock times | all times | Client Developer | 1 business day | none |
| **Q-13** | How recipients are classified (5 groups / owner / representative / other) without `宛先ID`; whether owner-send `文面` may be copied | copy filter, TV24 | Client Developer | 10/6 | do not copy unclassified rows |
| **Q-14** | Source for send `kind` and `target_kind` | send log | Client Developer | 10/6 | show nothing for the unknown field |
| **Q-15** | `心拍.結果` interpretation table; criteria for `late`, `blocked`, `missing`, `unknown`; Source for `ai_done_at`, `posted_at`, `received_at`, `owner_items`, `photos_*`, `owner_notified`, `evidence`; use of `source_candidate_sha256`, `候補数`, `送信MEAT/IN`, `実行ms`, `gap分` | runs, ②, ⑤, ⑦ | PIATEC proposes, client confirms | 1 business day | "ยืนยันผลไม่ได้"/"ยังไม่ยืนยัน" |
| **Q-16** | Exact start date of the 17:00 patrol (and schedule history) | success rates, TV25 | Client Developer / Takatsuji | client sends | do not choose; show "ยังไม่ยืนยัน" |
| **Q-17** | Which duplicate row wins on resend; column for cancellation | messages | PIATEC proposes options A/B; Takatsuji | — | hide content of any `取消` row |
| **Q-18** | Source of `not_needed`, `pending`, `carried` | ③ marks | Client Developer | — | `unknown` ("ยังไม่ยืนยัน") |
| **Q-19** | Bot-reply matching edge cases (0 matches, "same day", where `ambiguous` is stored, source for `by=heavy`) | TV11, TV22 | PIATEC proposes | — | `unknown`; never guess |
| **Q-20** | Source of the "ไม่ส่งเพราะป้องกันส่งซ้ำ" display (TV23) | TV23 | Client Developer | — | not shown |
| **Q-21** | Linking sends/messages/questions to runs (`run_id`, `send_id`) | ②, drill-down | PIATEC proposes after samples | 10/6 | leave blank |
| **Q-22** | Candidate-answer window (cross-day, same name, renamed user) | TV22 | PIATEC proposes | — | `candidate` or `unknown`, never `confirmed` |
| **Q-23** | How question state/answers survive a rebuild without PIATEC-only data; evidence for `closed` | TV12 | PIATEC proposes | — | no state beyond `waiting`/`candidate` |
| **Q-24** | Japanese UI strings; extras in SAMPLE-03 not in REQ (e.g. "ล้มเหลว" on ①) | UI | Takatsuji | — | follow REQ text only |
| **Q-25** | Which `meta` row drives each page's banner | banner | PIATEC proposes | — | any stale tab → red banner |
| **Q-26** | Period windows (business days?) and denominator for not-yet-due runs in ⑦ | ⑦ | PIATEC proposes | — | exclude only `running` as REQ says |
| **Q-27** | Mapping of ④ filters to states | ④ | PIATEC proposes | — | `waiting`+`candidate` under "รอคำตอบ" |
| **Q-28** | Whether `DUMMY-` prefix also applies to `run_id` | summaries | Takatsuji | — | exclude `DUMMY-` run_id too |
| **Q-29** | How a store is marked "NOT CONNECTED"; where `stores`/`schedules` are edited | ①, TV5/TV6/TV16 | PIATEC proposes | — | no hard-coded store names |
| **Q-30** | Nagoya `timezone`/`business_day_start` (SAMPLE-02 shows `Asia/Tokyo`, `05:00`, and daily `02:45`; real Nagoya rows are scheduled `00:45`) | Phase 2 | Client Developer | Phase 2 | Nagoya not connected |

### 12.1 Status update — 2026-10-07

Status values: **CONFIRMED** (answered), **PARTIAL** (part answered), **UNCONFIRMED** (open), **BLOCKED** (cannot progress until another item).
Questions not listed are unchanged (UNCONFIRMED).

| ID | Status | What the client update settles / what stays open |
|---|---|---|
| Q-01 | PARTIAL | Production in the client's environment (account, billing, domain) re-stated; vercel.app = prototype (PIATEC to confirm, §11.1 #11). Hosting technology and where the Transform runs: open |
| Q-02 | UNCONFIRMED | Notice channel for stop/recovery not named |
| Q-04 | UNCONFIRMED | Allowlist storage in production unchanged. Dashboard login accounts are separate from the reader account (§0-4) |
| Q-05 | UNCONFIRMED | unchanged |
| Q-07 | UNCONFIRMED | Nagoya samples 10/8; no store-separating field |
| Q-08 | PARTIAL | Copy runtime/trigger: **client, every 5 min** (CONFIRMED). PIATEC Transform cadence and per-hop budget (≈5 min left after the copy, DERIVED): open |
| Q-09 | PARTIAL | Copy `meta` gives `last_read_at` / `updated_at` / `status` (CONFIRMED); how Dashboard `source_through` and `stale` vs `error` derive from them: PIATEC proposes |
| Q-10 | CONFIRMED (except one point) | Copy layout = Data Contract v1 (§4.1), timestamps named, substitute keys `発言者キー` / `宛先キー`, `グループID` retained alongside `群`. **Open: whether cancelled `内容` is kept → Q-17** |
| Q-11 | CONFIRMED (copy) / PARTIAL (Dashboard) | Row identity = `元の行番号`, in-place update, never twice. `send_id` for Dashboard Data: PIATEC proposes `元の行番号`-based id |
| Q-12 | UNCONFIRMED | Timestamp format in the copy not stated (sample: `yyyy/MM/dd H:mm:ss`, no zone); full `種別` list; zone of the column-6 `HH:MM`. Implemented safe default: ISO with offset always; zone-less only with `NIKUSHO_COPY_TIMEZONE`; no Bot-reply link without it; `messageId` must be kept as text (a rounded number cannot always be detected) |
| Q-13 | CONFIRMED | `宛先の群` classifies recipients (five groups / `OWNER`) |
| Q-14 | UNCONFIRMED | Send `kind` still has no column; polling-loop sends since 10/5 23:36 (Q-49) |
| Q-15 | UNCONFIRMED | Client will decide how to read run status (§0-17); `AI=scheduled-off` appears; no rule may be derived |
| Q-16 | CONFIRMED | 12:00,22:00 from 2026-09-13 to 10-01; 12:00,17:00,22:00 from 2026-10-02 (first 17:00 run 10/2 17:00); daily 00:35 |
| Q-17 | UNCONFIRMED | Cancelled rows are updated in place; whether `内容` is kept, how resends (own `messageId`) are tied, cancel display column |
| Q-21 | UNCONFIRMED | slot→run link supported by sample; polling-loop questions (Q-49) |
| Q-23 | UNCONFIRMED | Rebuild strategy proposed (§8.3); question state beyond `waiting`/`candidate` still needs evidence |
| Q-29 | PARTIAL | Bangkok `stores` values: `production_host` = `snowmaru` (CONFIRMED). Storage/editing of `stores`/`schedules` and the NOT CONNECTED marker: open |

New questions (2026-10-07):

| ID | Question | Blocks | Who answers | Safe default until answered | Status |
|---|---|---|---|---|---|
| **Q-47** | Communication route: who is the single contact now (the 10/7 message says "send all questions directly to me"; the 10/7 page takes `@claude` comments; REQ §2 named Takatsuji); who receives stop/recovery notices and incident evidence | all questions, notices | client | ask on the client's 10/7 page; do not contact Maru for operations | UNCONFIRMED |
| **Q-48** | Reader account: PIATEC must create it (e.g. a Google service account in an environment acceptable to the client) and send its e-mail; where its credentials live (client-owned environment, Q-01) | real data, TV9, TV24 | PIATEC proposes, client grants | no real data read; the connector is NOT_CONNECTED (code hook `getAccessToken` left unset) | **BLOCKED on PIATEC action** |
| **Q-49** | Reading run status after 10/5 23:36: scheduled runs record reads/decisions but send nothing to staff; questions/replies by the 5-min polling loop; meaning of `AI=scheduled-off`; how polling-loop sends relate to runs (`run_id`, `kind`) | ②, ⑤, ⑦ run figures; TV10, TV25 | client (announced) | show "ยังไม่ยืนยัน"; never derive status from `AI=scheduled-off` | UNCONFIRMED |
| **Q-50** | Copy `meta`: allowed `status` values, the exact `contract_version` literal (implemented: `v1`), meaning of `source_rows` / `copied_rows`, one row per tab (implemented: yes, else the copy is blocked)? Also: does the copy hold exactly the 5 tabs (implemented: any other tab blocks the copy)? | banner, TV13, TV19, TV21 | client | any value other than `ok` → "update stopped" (implemented) | UNCONFIRMED |
| **Q-51** | Format of masked lines in owner reports (what replaces the masked text) | ③ display of owner sends | client | show as copied (verbatim) — implemented | UNCONFIRMED |
| **Q-52** | `AI質問追跡` gap: date of the fix; whether questions sent 10/6 – fix are backfilled; how to mark days with incomplete question records | ④, ①, ⑦ | client | days after 10/5 count questions as "not pulled / incomplete", never 0 | UNCONFIRMED |
| **Q-53** | TV18 recovery drill after 10/7: which parts PIATEC demonstrates (copy recovery is the client's) | acceptance | client | PIATEC demonstrates dashboard-side detection and recovery only | UNCONFIRMED |

---

## 13. Acceptance linkage

| Contract element | Tests |
|---|---|
| Source→screen ≤10 min, no client work, 0 Source writes | TV9 |
| Stop detection ≤20 min, notify once, resume, no duplicates | TV19, TV21 |
| Forbidden data absent from the View-only Copy (client's copy; checked by PIATEC's verifier and judged by the client) | TV24 |
| Numbers equal Source | TV1, TV20 |
| Recovery by PIATEC | TV18 |
| Stale/missing handled | TV13, TV25 |

Test types: A = real data, B = test data (display only), C = Phase 2 real data. Details in `docs/architecture.md` §13.

---

## 14. Prohibitions (never violate)

1. Do not claim a Source column, record or state exists unless this document marks it CONFIRMED.
2. Do not open, read or write the Original Records; do not access GAS or real folders; read only the View-only Copy and the Heartbeat Spreadsheet, only with the reader account (never Maru's account); do not send LINE/e-mail to groups, staff or owner (single exception: connection/recovery notices via the agreed channel, Q-02/Q-47).
3. Do not carry `userId`, `宛先ID`, `画像URL`, LINK, out-of-table groups, other tabs, `グループID` or substitute keys into Dashboard Data or the screen; a copy that contains a forbidden field stops that tab.
4. Do not infer links from text similarity; do not count `candidate` in rates; do not show 0% without confirmation records.
5. Do not assign work to Maru; do not ask for his password; do not invent rules for `AI=scheduled-off` or run status (Q-49).
6. Do not alter real Source, real copy or real screen data for testing.
