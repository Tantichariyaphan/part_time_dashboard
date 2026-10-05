# docs/connection-spec.md — Connection Specification (Source → Read Copy → Screen Data)

| Item | Value |
|---|---|
| Document status | CONTRACT DRAFT v0 (first version of REQ deliverable **1c**: "ข้อกำหนดการเชื่อมต่อและรายการบันทึกที่ขาด"). It becomes binding only after the Client Developer reviews it and the client approves it (REQ §3 #1c, §2) |
| Written | 2026-10-03 |
| Source of Truth | `01_ข้อกำหนดหน้าจอจัดการ.md` — Requirement **2026-10-02 (draft 5)**, cited **REQ §x** |
| Supporting | `02_ตัวอย่างทะเบียน_3สาขา.xlsx` (SAMPLE-02), `03_ตัวอย่างหน้าจอ.html` (SAMPLE-03) |
| Not usable | All documents of 9/30 are withdrawn (REQ §0) |
| Companions | `docs/data-mapping.md` (field-level rules), `docs/architecture.md`, `Claude.md` |
| Important | This specification was prepared from REQ and the samples only. **PIATEC has not inspected the real Source** (REQ: source inspection starts 10/6 with samples supplied by the client). Anything that needs the real Source is marked **UNCONFIRMED / ไม่ยืนยัน**. Never write that unavailable Source data exists. |

Evidence labels (CONFIRMED / CANDIDATE / UNKNOWN / NOT CONNECTED) and the UNCONFIRMED marker are defined in `docs/data-mapping.md` §0.

---

## 1. Purpose and authority

1. Define the contract that moves the monitoring system's existing logs into the dashboard automatically (REQ §2 completion condition).
2. State, per screen field, which Source column feeds it, what is calculated, and whether it can be **confirmed** with current records.
3. List the **missing records** and the changes the Client Developer must make.
4. If this file and REQ disagree, REQ wins. If REQ is silent, the item is **UNCONFIRMED** — stop and ask Takatsuji (REQ §7-7; options-with-recommendation rule in REQ §2).

---

## 2. Parties: who installs what, who has access

| Party | Does | Has access to | Must NOT |
|---|---|---|---|
| **PIATEC** | Builds the Copy Process; builds Read Copy → Screen Data processing; automatic update ≤10 min; stop detection; inspects Source samples and writes this spec and the missing-record list; 7 pages; installs in the client's environment; authentication; demo data; fixes non-conforming items; post-delivery monitoring, root-cause analysis, recovery; hands over procedures and source code (REQ §2 PIATEC ①–⑪) | Read Copy, Screen Data, Heartbeat Sheet, cache (all client-named) | access the Source directly; write to the Source; access real GAS or real folders; send LINE or e-mail to groups/staff/owner (only exception: connection-problem and recovery notices to Takatsuji via the single approved channel); hold data only PIATEC owns; send registry text to any external service |
| **Client Developer (ผู้พัฒนาฝั่งผู้ว่าจ้าง)** | **Installs** the Copy Process on the Source side and approves its permissions; **installs revised versions** (PIATEC supplies the revision, test result and rollback procedure); reviews/approves this spec and the missing-record list; changes the existing monitoring program **only when necessary**; answers read-method questions within **1 business day**; confirms and sends schedule history (e.g. the exact 17:00 start date) (REQ §2 role 1) | the Source (this is the only party that touches it) | — |
| **Client Acceptance Tester (ผู้ตรวจรับ)** | Checks deliverables by comparing screen numbers against the Source. **The pass/fail judge must not be the builder** (REQ §2) | Source + screen | — |
| **Takatsuji (คุณทาคัตสึจิ)** | Single contact for questions, confirmations and **incident reports**; first screen check; installs revised Source-side versions together with / instead of the Client Developer; receives connection-problem and recovery notices (REQ §2, §7-1) | — | — |
| **Maru (คุณมารุ)** | Approves the quotation; first identity verification and permission approvals only he can do; approves the Copy Process on Source side **once** (REQ §4, 10/6); major cost/permission/business decisions; final usability check | — | be assigned copying, updating, data comparison, checking, running commands, installing, daily operation or technical decisions. **Never send him incident reports or questions directly.** PIATEC never receives his password (REQ §2, §7-5) |

If Source-side errors are found (missing record, wrong time, etc.), PIATEC sends **evidence** — tab, row, time, expected vs actual value — to Takatsuji; the Client Developer takes over (REQ §2).
Changes to the real monitoring system need Maru's approval, requested **through Takatsuji** (REQ §5-1).

---

## 3. Connection path and per-hop contract

```text
[Hop 0] SOURCE ──(Copy Process, installed by Client Developer)──► [Hop 1] READ COPY
[Hop 1] READ COPY ──(PIATEC build)──► [Hop 2] SCREEN DATA (7-tab registry)
[Hop 2] SCREEN DATA ──► [Hop 3] CACHE (derived only)
[Hop 2/3] + HEARTBEAT SHEET (client-prepared, read as-is) ──► [Hop 4] SERVER-SIDE VIEWER CHECK ──► DASHBOARD
```

| Hop | Producer | Consumer | Contract | Label |
|---|---|---|---|---|
| 0→1 | Copy Process | Read Copy | Filter *at copy time* (§4–§5); keep two separate timestamps (§8); continuous | CONFIRMED (REQ §5, §5-1) |
| 1→2 | PIATEC build | Screen Data | Produce REQ §5-3 columns and meanings; times as `yyyy-MM-ddTHH:mm:ss+07:00`; rebuild must not reset question state or answers | CONFIRMED (REQ §5-3) |
| 2→3 | PIATEC | Cache | Cache is derived from Screen Data only; if numbers differ, upstream wins; **revoked user must not see data from cache either** | CONFIRMED (REQ §7-3, §7-6) |
| HB | client | PIATEC | Heartbeat Sheet tabs `beats`, `alerts` read as-is; due **10/8** | CONFIRMED (REQ §5-3, §5-4) |
| 0→screen | all | user | ≤ **10 minutes** end-to-end | CONFIRMED (REQ §5) |

The physical layout of Read Copy (tabs, columns, key method, storage location), the Copy Process's trigger/schedule and runtime platform, and how the 10-minute budget is divided among hops are **not defined in REQ → UNCONFIRMED / ไม่ยืนยัน (Q-10, Q-08)**. They must be written into the next version of this document after the 10/6 inspection and approved by the Client Developer. Do not choose them in code first.

---

## 4. Exactly what may be copied (REQ §5-1)

### 4.1 Groups (decided by last 6 characters of `グループID`)

| Suffix | Group | Copy |
|---|---|---|
| `2c54ac` | MEAT | yes |
| `c894fd` | IN | yes |
| `47247d` | ALL | yes |
| `15c2bf` | MANAGEMENT | yes |
| `49fcce` | PHOTO | yes |
| `4846a3` | LINK (contains external persons) | **no** |
| any other ID | not in table | **no** |

### 4.2 Recipients (`送信ログ`)

Only sends to the five groups above and to the owner or the representative (เจ้าของกิจการหรือตัวแทน). Because `宛先ID` may not be copied, how a send row is classified as "one of the five groups / owner / representative / other" is **UNCONFIRMED / ไม่ยืนยัน (Q-13)** (candidate basis: `宛先` display name; not agreed). Until agreed, a row that cannot be classified must **not** be copied.

### 4.3 Tabs and columns

Copy only these 4 tabs and only the listed columns:

| Tab | Columns allowed (left to right) |
|---|---|
| `ログ` | `日時`, `グループID`*, `発言者`, `種別`, `内容`, `messageId`, `再送`, `取消` |
| `送信ログ` | `日時`, `宛先`, `文面`, `結果`, column 6 (`HH:MM|発言者`) |
| `AI質問追跡` | `question_id`, `送信時刻`, `group`, `who`, `question_th`, `source_candidate_sha256`, `slot`, `state` |
| `心拍` | `時刻`, `読んだ行数`, `候補数`, `送信MEAT`, `送信IN`, `結果`, `実行ms`, `gap分` |

\* full `グループID` retention vs storing only the resolved group name: **Q-10**.
`source_candidate_sha256` is listed in REQ's column table; REQ gives no use for it on screen (Q-15).

### 4.4 Forbidden (never copied)

`userId`, `宛先ID`, `画像URL`, LINK, groups not in §4.1, recipients not in §4.2, all other tabs (e.g. customer reservation name/phone). If an ID is needed to match a person or recipient, replace it with a **surrogate key usable only inside the copy**. The surrogate method must not allow recovering the original ID (**Q-10**).

---

## 5. Filtering and sensitive-field removal

```text
SOURCE row
  → 1 group filter (§4.1)          ── fail → drop row
  → 2 recipient filter (§4.2)      ── fail → drop row
  → 3 tab/column filter (§4.3)     ── remove non-listed columns
  → 4 sensitive removal (§4.4)     ── remove userId / 宛先ID / 画像URL; apply surrogate key if needed
  → READ COPY
```

Rules:
1. Filtering happens **in the Copy Process**, before data reaches Read Copy. Hiding on screen is not compliance (REQ §5-1).
2. A new/unknown group, recipient or column defaults to **exclude**.
3. Test **TV24** inspects the *whole* Read Copy: no unauthorized group (LINK, out-of-table), no unauthorized recipient, no `userId`/`宛先ID`/`画像URL`, no reservation tab. Result type A (real data).
4. Registry text goes to no external service (REQ §7-8). Tests that change data run on **test sheets only** (REQ §7-9).
5. Images: only counts (`photos_total`, `photos_reviewed`) may exist in Screen Data; no image bodies (REQ §5-3, §9).

---

## 6. Field mapping: Source → Read Copy → Screen field

"Status" column: **C** = CONFIRMED by REQ; **D** = derivable from REQ text; **Q** = UNCONFIRMED (question id). Full semantics are in `docs/data-mapping.md` §5.

### 6.1 `ログ` → `ทะเบียนข้อความ`

| Source column | Read Copy | Screen field | Transformation | Status |
|---|---|---|---|---|
| `messageId` | kept | `message_id` | key; same `messageId` and/or `再送` rows → one logical message | C (which duplicate wins: Q-17) |
| `日時` | kept | `at` | to `+07:00` ISO format | C format / Q-12 source format |
| `グループID` (last 6) | kept or resolved name | `group` | suffix table §4.1 | C / Q-10 |
| `発言者` | kept | `sender` | verbatim | C |
| `種別` `text`/`image`/`sticker`/other | kept | `kind` `text`/`photo`/`sticker`/`other` | map | D / Q-12 for other values |
| `内容` | kept | `text` | verbatim; photo and sticker → blank | D |
| `取消` | kept | no REQ column | row shown "ข้อความถูกยกเลิก", no content | C rule / **Q-17** representation |
| `再送` | kept | — | used only for de-dup | C |
| `userId`, `画像URL` | **not copied** | — | — | C (forbidden) |
| (message→run link) | — | `run_id` | no Source column identified | **Q-21** |
| (Bot handling) | — | `handling`, `replies_json` | see §6.2 and data-mapping §8 | partly **Q-18** |
| (answer link) | — | `question_id`, `question_link` | candidate rule data-mapping §7.2 | C candidate / Q-22 |

### 6.2 `送信ログ` → `บันทึกการส่ง` (and `replies_json`)

| Source column | Screen field | Transformation | Status |
|---|---|---|---|
| `日時` | `sent_at` | ISO `+07:00` | C / Q-12 |
| `宛先` | `target_label` | recipient name | D / Q-13 |
| `宛先ID` | — | **not copied** | C |
| `文面` | `text` | verbatim | C |
| `結果` `OK…` | `result=sent` | LINE accepted the request; wording "ส่งแล้ว" only | C |
| `結果` `NG(…` | `result=failed` | | C |
| `結果` `ATTEMPTING_NO_RETRY` (stuck) | `result=unknown` | | C |
| column 6 `HH:MM|発言者` | `replies_json[].link`, `handling` | unique match → `confirmed`; ≥2 → `ambiguous`; empty → no link | C |
| (send key) | `send_id` | no Source column identified | **Q-11** |
| (kind) | `kind` (`question`/`reply`/`daily`/`alert`) | no Source column identified | **Q-14** |
| (target kind) | `target_kind` (`group`/`owner`) | depends on §4.2 resolution | **Q-13, Q-14** |

### 6.3 `AI質問追跡` → `ทะเบียนคำถาม`

| Source column | Screen field | Transformation | Status |
|---|---|---|---|
| `question_id` | `question_id` | key | D |
| `送信時刻` | `sent_at` | ISO | D / Q-12 |
| `group` | `group` | | D |
| `who` | `who` | | D |
| `question_th` | `question_text` | verbatim | D |
| `slot` | `run_id` | slot→run link | **Q-21** |
| `state` (always `waiting`) | `state` | `waiting`; `candidate` from rule data-mapping §7.2; never other values without evidence | C |
| `source_candidate_sha256` | — | no stated use | **Q-15** |
| (send link) | `send_id` | | **Q-21** |
| (closing) | `closed_reason`, `closed_at` | no Source evidence | **Q-23**, Phase 2 |
| (answers) | `answers_json` | candidates from `ログ` | C candidate; confirmed impossible now |

### 6.4 `心拍` (+ `送信ログ`) → `ทะเบียนรอบตรวจ`

| Source | Screen field | Status |
|---|---|---|
| `心拍.時刻` | probably `read_at` | **Q-15** |
| `心拍.読んだ行数` | probably `input_lines` (blank = not pulled; 0 = zero) | **Q-15** |
| `心拍.候補数`, `送信MEAT`, `送信IN`, `実行ms`, `gap分` | no stated screen field | **Q-15** |
| `心拍.結果` (free text) | `status`, `reason` | PIATEC proposes an interpretation table from samples; client confirms within 1 business day | **Q-15** |
| `送信ログ` OK rows | `sent_at`, `questions_sent`, `messages_sent` | counts D; run linking **Q-21** |
| schedule (`schedules`) | `scheduled_at`; one row per scheduled run even if it did not run | C |
| — | `ai_done_at`, `posted_at`, `received_at`, `owner_items`, `photos_total`, `photos_reviewed`, `owner_notified`, `evidence` | no Source column identified | **Q-15** |

### 6.5 Configuration and meta

| Screen tab | Origin | Status |
|---|---|---|
| `stores`, `schedules` | configuration maintained so that **adding a store needs no code change**; where it is stored/edited and by whom (REQ calls it settings kept in client-named storage) | C principle / **Q-29, Q-16** for content |
| `meta` | written by the build for each of the four tabs: `generated_at`, `last_success_at`, `source_through`, `status`, `detail`, `contract_version` | C columns / **Q-09** computation |
| `beats`, `alerts` | Heartbeat Sheet read as-is | C (due 10/8) |

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
| Updates stopped → detected | **≤ 20 minutes**: screen shows "หยุดอัปเดต"; Takatsuji notified **once**; resumes from where it stopped; no duplicate or missing rows | TV19, TV21 |
| Test-sheet change → screen | ≤ 5 minutes | TV2 (type B) |
| Page display | ≤ 3 seconds | TV4, TV17 |

The 10-minute budget per hop and the polling/trigger cadence are **UNCONFIRMED (Q-08)**. The 20-minute figure is for *data update* freshness; the 15-minute figures for machine heartbeat and light check (data-mapping §9.2) are different thresholds and must not be merged.

### 8.2 Two separate timestamps

Read Copy keeps "time the Source read last completed" **separately** from "time the copy was updated", so that "0 messages" can be told from "reading stopped" (REQ §5). In Screen Data these appear as `meta.last_success_at` / `generated_at` / `source_through` (**Q-09** for exact derivation).

### 8.3 Checkpoint / resume / deduplication (CONFIRMED requirements; mechanisms UNCONFIRMED)

1. If a run fails midway, the next run **continues from the same point**; no duplicate rows; no missing rows (REQ §3 #1b, TV19).
2. Running twice in a row must create no duplicates (TV19).
3. Checkpoints and resume points may live only in **client-named storage** (REQ §7-3).
4. Natural keys already in REQ: `messageId`, `question_id`, `send_id`, `run_id`. A key for `ログ`/`送信ログ`/`心拍` rows without one (`送信ログ` has no id column listed) is **UNCONFIRMED (Q-11)**.

### 8.4 Stop detection and recovery behaviour

| Event | Required behaviour | Label |
|---|---|---|
| Copy Process stopped (Source→Read Copy only; later stages still running) | do **not** display normal; within 20 min "หยุดอัปเดต" + notify Takatsuji (TV21) | C |
| Any stage fails midway | resume from checkpoint (TV19) | C |
| Monitoring process itself stops | must be detected too (TV25) | C |
| Stale/error/old `generated_at`/unreadable/missing column | red banner "หยุดอัปเดต (สำเร็จล่าสุด hh:mm)"; old numbers grey, never normal/0 | C |
| Read Copy deleted / read permission lost / dashboard fault | recovery demonstrated before handover **without Maru acting**; named owner and contact channel in writing (TV18) | C |
| Notification | only to Takatsuji, via the single approved channel; no duplicate alerts; notice on recovery | C principle; channel and timings **Q-02, Q-03** |

PIATEC must not interrupt the existing monitoring: the monitoring system keeps running even if PIATEC's process or screen stops (REQ §2).

---

## 9. Which states can / cannot be confirmed now (Bangkok, real records)

| State / function | Current records | Label |
|---|---|---|
| Patrol/daily ran, stopped, missing, late, unknown | derivable from `心拍` + `送信ログ` once the `結果` interpretation table is approved | CONFIRMED only after Q-15 is answered; until then show "ยังไม่ยืนยัน" |
| Message received (text/photo/sticker), resend merged, cancelled hidden | yes | CONFIRMED |
| Send result OK/NG/ATTEMPTING_NO_RETRY | yes | CONFIRMED |
| Question sent | yes (`AI質問追跡` = sent only) | CONFIRMED |
| Question `waiting` | yes | CONFIRMED |
| Question `candidate` / candidate answer | yes (same group + same sender + after `送信時刻` + not cancelled) | CANDIDATE |
| Question `acked` / `answered` / `closed` | **no evidence** | cannot be confirmed (UNKNOWN until missing record exists) |
| Confirmed answer, response rate, time-to-answer | **no proof of question↔answer link** | cannot be confirmed; show "ยังไม่สรุป…" |
| Bot reply linked to message | only when `送信ログ` column 6 exists (from 2026-10-02) and exactly one message matches | CONFIRMED for unique matches only; otherwise UNKNOWN ("ไม่ทราบว่าตอบข้อความใด") |
| Bot reply linked by message ID | **no record** | cannot be confirmed |
| Light-check operating time | **not in any sheet yet** | cannot be confirmed (UNKNOWN) |
| Machine health | Heartbeat Sheet (due 10/8; in preparation) | NOT CONNECTED until it exists |
| Nagoya 2 stores | different place and format, read method unconfirmed | NOT CONNECTED (Phase 2) |
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
| M-5 | Machine Heartbeat Sheet (`beats`, `alerts`) | page ⑥, ① | being prepared by client | 1 | exists as REQ §5-3 definition | Client (due 10/8) |
| M-6 | Nagoya 2 stores readable records + store marker | Phase 2 real data | different place/format; no marker separating the 2 stores | 2 | client sends samples (due 10/8); PIATEC proposes spec, price, schedule | Client Developer |

### 10.2 Additional gaps found by this cross-check (NOT confirmed by the client; to be raised via Takatsuji for list v1)

| ID | Gap | Evidence | Question |
|---|---|---|---|
| G-1 | No Source column identified for `ai_done_at`, `posted_at`, `received_at`, `owner_items`, `photos_total`, `photos_reviewed`, `owner_notified`, `evidence` | REQ §5-1 lists `心拍`/`送信ログ`/`AI質問追跡`/`ログ` columns; none obviously carries them; SAMPLE-02 real rows nevertheless contain some | Q-15 |
| G-2 | No `send_id` / `kind` / `target_kind` source | `送信ログ` columns | Q-11, Q-14 |
| G-3 | No link send→run, message→run, question→run (only `slot` in `AI質問追跡`) | REQ §5-3 `run_id` columns | Q-21 |
| G-4 | Cancel representation missing in `ทะเบียนข้อความ` | REQ §5-3 vs §5-1 | Q-17 |
| G-5 | `handling` values needing AI judgement | REQ §5-1 forbids guessing | Q-18 |
| G-6 | Timestamp formats/time zones of Source columns | not stated | Q-12 |
| G-7 | Exact 17:00 patrol start date | REQ says client will send | Q-16 |
| G-8 | `心拍.結果` interpretation table | REQ: PIATEC proposes, client confirms | Q-15 |

---

## 11. Changes required of the Client Developer, and install / rollback / recovery responsibilities

### 11.1 Required changes / actions (REQ §2, §5-4)

| # | Action | When |
|---|---|---|
| 1 | Supply Source samples (only allowed groups/columns) | **10/6** |
| 2 | Install the Copy Process on the Source side (**Maru approves once**) | **10/6** |
| 3 | Review/approve: `結果` interpretation table, this connection spec, missing-record list; confirm exact 17:00 start date | within **1 business day** of receipt |
| 4 | Provide Heartbeat Sheet (`beats`, `alerts`); change the existing monitoring program to add missing records (e.g. light-check time) as per PIATEC proposal | **10/8** (parts added on agreed dates) |
| 5 | Provide Nagoya 2-store samples | **10/8** |
| 6 | Answer read-method questions | within 1 business day |
| 7 | Change the existing monitoring program only when necessary; changes to the real system need Maru's approval via Takatsuji | as needed |

If any further client-side work is found, tell Takatsuji **before building** (REQ §5-4).

### 11.2 Install / rollback / recovery

| Activity | PIATEC | Client Developer / Takatsuji | Maru |
|---|---|---|---|
| First install of Copy Process on Source side | builds and documents | **installs**; approves permissions | approves once |
| Revised Copy Process | provides revision, test result, **rollback procedure** | **installs** on Source side | none |
| Rollback on Source side | provides procedure | executes | none |
| Install on client environment (dashboard, Read Copy, Screen Data) | installs; verifies connection | — | none |
| Recovery drill before handover (delete copy / re-grant read permission / dashboard fault) | demonstrates (TV18) | observes | not required |
| Post-handover fault | receives report, analyses root cause, **confirms recovery** | Source-side recovery taken over by Client Developer | **must not** be asked to install or recover |
| 10/26–11/12 freeze | emergency fix only for **display stoppage or data leakage**, with Takatsuji's approval; rollback procedure and operator written by 10/25 | — | — |

README must let **one client-side person** reinstall and recover by themselves (REQ §3 #5).

---

## 12. Open-question register (the only list of UNCONFIRMED items)

Rules: answers come **through Takatsuji**; Client Developer replies within 1 business day (REQ §2, §5-4 #5). "Safe default" is the non-guessing behaviour while the question is open.

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

---

## 13. Acceptance linkage

| Contract element | Tests |
|---|---|
| Source→screen ≤10 min, no client work, 0 Source writes | TV9 |
| Stop detection ≤20 min, notify once, resume, no duplicates | TV19, TV21 |
| Forbidden data absent from Read Copy | TV24 |
| Numbers equal Source | TV1, TV20 |
| Recovery by PIATEC | TV18 |
| Stale/missing handled | TV13, TV25 |

Test types: A = real data, B = test data (display only), C = Phase 2 real data. Details in `docs/architecture.md` §13.

---

## 14. Prohibitions (never violate)

1. Do not claim a Source column, record or state exists unless this document marks it CONFIRMED.
2. Do not write to the Source; do not access GAS, real folders or the Source directly; do not send LINE/e-mail to groups, staff or owner (single exception: connection/recovery notices to Takatsuji).
3. Do not copy `userId`, `宛先ID`, `画像URL`, LINK, out-of-table groups, other tabs.
4. Do not infer links from text similarity; do not count `candidate` in rates; do not show 0% without confirmation records.
5. Do not assign work to Maru; do not ask for his password.
6. Do not alter real Source, real copy or real screen data for testing.
