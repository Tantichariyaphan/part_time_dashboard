# docs/data-mapping.md — NIKUSHO AI Monitoring System: Data Model and Data Flow

| Item | Value |
|---|---|
| Document status | CONTRACT DRAFT v0 — binding for implementation; entries marked UNCONFIRMED must not be implemented by guessing |
| Written | 2026-10-03; **updated 2026-10-07** (client builds the copy; Data Contract v1 — `docs/connection-spec.md` §0, §4) |
| Source of Truth | `01_ข้อกำหนดหน้าจอจัดการ.md` = "ข้อกำหนด: หน้าจอจัดการ ฉบับ 2026-10-02 (ร่างที่ 5)" — cited below as **REQ §x** |
| Supporting context | `02_ตัวอย่างทะเบียน_3สาขา.xlsx` (cited **SAMPLE-02**), `03_ตัวอย่างหน้าจอ.html` (cited **SAMPLE-03**) |
| Withdrawn / must NOT be used | All documents sent on 9/30 (`エンジニアへ_現場AI巡回_20260930`, `送付一式_20260930` incl. 00–05) — REQ §0 |
| Companion files | `docs/architecture.md`, `docs/connection-spec.md` (holds the Q-xx open-question register), `Claude.md` |

> REQ is itself "ร่างที่ 5" (draft 5). If a newer version arrives, REQ wins over this file; update this file, do not "reconcile". The client's 2026-10-07 update (connection-spec §0) changes REQ on who builds the copy and fixes the copy layout (Data Contract v1).

---

## 0. How to read this file

### 0.1 Evidence labels (data level)

Every field, state and rule below carries one of these labels. They are the only four data-level labels.

| Label | Meaning | May appear on screen as |
|---|---|---|
| **CONFIRMED** | The source records prove it, or REQ states the rule explicitly | normal display |
| **CANDIDATE** | A possibly-related answer exists but the records cannot prove the link | "คำตอบที่อาจเกี่ยวข้อง・ยังไม่ยืนยัน" (never counted in response rate) |
| **UNKNOWN** | Records exist but the outcome or link cannot be established | "ยืนยันผลไม่ได้" (run `unknown`), "ยังไม่ยืนยัน", "ไม่ทราบว่าตอบข้อความใด" |
| **NOT CONNECTED** | The store/feature has no data connection yet (Phase 2) | "ยังไม่เชื่อมต่อ" |

### 0.2 Specification marker

**UNCONFIRMED / ไม่ยืนยัน (Q-xx)** = the *specification itself* is missing, ambiguous or contradictory. This is different from the data-level label UNKNOWN. The Q-xx id points to the register in `docs/connection-spec.md` §12. Rule from REQ §7-7 and §2: do not guess, show "ยังไม่ยืนยัน", ask Takatsuji, and if a choice is needed send **two options with a recommendation** to Takatsuji (never to Maru).

### 0.3 Terminology (canonical — identical in all four files)

| Term | Thai (REQ) | Meaning |
|---|---|---|
| Source / Original Records | บันทึกต้นทาง | The Bangkok spreadsheet the existing monitoring system (GAS) writes. **Never accessible to PIATEC** |
| Copy Script (formerly "Copy Process") | กระบวนการคัดลอก | **Built and run by the client** (since 2026-10-07), every 5 minutes; filters and copies only permitted groups/columns |
| View-only Copy (formerly "Read Copy") | สำเนาสำหรับอ่าน | Filtered copy of the 4 tabs + copy `meta` (Data Contract v1), in the client's account; PIATEC's reader account has view access |
| Reader account | — | PIATEC's dedicated account with view access to exactly two files (View-only Copy, Heartbeat Spreadsheet); separate from dashboard login accounts |
| Transform | — | PIATEC's step from the View-only Copy to Screen Data |
| Screen Data / Dashboard Data / Ledger | ข้อมูลสำหรับหน้าจอ / ทะเบียน | The 7-tab registry in REQ §5-3 (meta, stores, schedules, ทะเบียนรอบตรวจ, ทะเบียนคำถาม, บันทึกการส่ง, ทะเบียนข้อความ), built from the View-only Copy, stored in the client's account |
| Heartbeat Sheet / Machine Heartbeat Spreadsheet | สเปรดชีตสัญญาณชีพเครื่อง | Separate spreadsheet prepared by the client with tabs `beats`, `alerts`; read as-is with the reader account |
| Dashboard | หน้าจอจัดการ | The 7 pages (REQ §6) |
| Cache | แคช | Derived from Screen Data only, for speed (REQ §7-3) |
| PIATEC / Client Developer / Client Acceptance Tester / Takatsuji / Maru | PIATEC / ผู้พัฒนาฝั่งผู้ว่าจ้าง / ผู้ตรวจรับฝั่งผู้ว่าจ้าง / คุณทาคัตสึจิ / คุณมารุ | Roles — see `docs/architecture.md` §2 |

---

## 1. Data flow

```text
ORIGINAL RECORDS (Bangkok spreadsheet; 4 tabs used: ログ, 送信ログ, AI質問追跡, 心拍)
   │   NEVER accessible to PIATEC (REQ §2, §7-2; client 10/7)
   │   Copy Script: BUILT AND RUN BY THE CLIENT (since 2026-10-07), every 5 minutes
   ▼   filter at copy time: 5 groups, five groups + OWNER as recipients, allowed columns,
   │   no userId / 宛先ID / 画像URL, no other tabs; substitute keys 発言者キー / 宛先キー;
   │   accounting/external-group lines in owner reports masked; rows from 2026-09-01;
   │   row identity 元の行番号, updated in place, never twice
VIEW-ONLY COPY (client account; Data Contract v1; PIATEC reader account = view only)
   │   copy meta: last_read_at (records last read) SEPARATE from updated_at (copy last written)  [REQ §5; client 10/7]
   ▼   PIATEC Transform (verify; idempotent rebuild proposed — connection-spec §8.3)
SCREEN DATA / DASHBOARD DATA (REQ §5-3 registry, 7 tabs, client account)
   │   + Machine Heartbeat Spreadsheet (beats, alerts) read as-is with the reader account
   ▼   (Cache derived from Screen Data only)
SERVER-SIDE VIEWER CHECK (authentication + allowlist; no data to anyone not allowed)
   ▼
DASHBOARD: 7 pages (display only; buttons = open / filter / back)

End-to-end target: new original row → shown on screen ≤ 10 minutes (whole path)   [REQ §5; client 10/7]
Stopped-update detection: ≤ 20 minutes → red banner + notify the agreed contact once (Q-02, Q-47)   [REQ §6, TV19, TV21]
```

Upstream-wins rule (REQ §7-3): regeneration order is Original Records → View-only Copy → Screen Data → Cache. If numbers differ between layers, **the upstream layer is correct**. PIATEC must not hold data that exists only with PIATEC; screen data, settings and process resume points live in **client-named storage**.

### 1.1 What each layer may contain

| Layer | May contain | Must never contain |
|---|---|---|
| View-only Copy (client) | only the 4 tabs + copy `meta` (Data Contract v1, connection-spec §4.1); only groups MEAT・IN・ALL・MANAGEMENT・PHOTO; only the five groups and `OWNER` as recipients; only allowed columns; substitute keys `発言者キー` / `宛先キー` | `userId`, `宛先ID`, `画像URL`, group LINK (`4846a3`), any group not in the table, any other tab (e.g. customer reservation names/phones), image bytes |
| Screen Data | columns in §5 (extra columns allowed but existing columns/meanings must not change — REQ §5-3) | image bodies (REQ §5-3 "ไม่เก็บตัวภาพในทะเบียน"), data absent upstream |
| Dashboard | text rendered **as plain text** | HTML/script execution; writes; actions |

---

## 2. Source tabs (REQ §5-1) — as they appear in the View-only Copy

One spreadsheet for Bangkok, continuously written by the GAS that receives/sends LINE. Only these 4 tabs are copied, by the client's Copy Script. PIATEC sees them **only through the View-only Copy**, whose exact columns are Data Contract v1 (connection-spec §4.1): every tab starts with `元の行番号`; `ログ` adds `群` and `発言者キー` (no `userId`, `画像URL`); `送信ログ` adds `宛先の群` and `宛先キー` (no `宛先ID`) and names column 6 `返した元の発言`. The column tables below describe the original meaning (REQ §5-1).

### 2.1 `ログ` — one row = one LINE message received

| Column | Meaning | In the View-only Copy? |
|---|---|---|
| `日時` | date-time | yes |
| `元の行番号` | original row number (row identity) | yes — added by the client (10/7) |
| `グループID` | group ID. Group name = last 6 characters (§2.5) | yes — kept, together with `群` (resolved group name) (client 10/7; Q-10 closed) |
| `発言者` | sender display name | yes (staff names — see §3 on external services) |
| `userId` | LINE user ID | **NO — forbidden**; replaced by `発言者キー` (substitute key, copy-only) |
| `種別` | `text`・`image`・`sticker` etc. | yes |
| `内容` | content; image = `[image]`, sticker = `[sticker]` (sample also `[video]`, `[file]`) | yes (for `取消` rows: Q-17) |
| `messageId` | message id | yes |
| `画像URL` | image URL | **NO — forbidden** |
| `再送` | "再送" if LINE re-sent | yes |
| `取消` | "取消" if the sender cancelled | yes |

### 2.2 `送信ログ` — one row = one message the Bot attempted to send

(question, light-check reply, daily, to owner, all alerts)

| Column | Meaning | Copy? |
|---|---|---|
| `日時` | date-time | yes |
| `元の行番号` | original row number (row identity; `結果` updated in place) | yes — added by the client (10/7) |
| `宛先` | recipient name | yes |
| `宛先の群` | recipient class: one of the five groups or `OWNER` | yes — added by the client (10/7; Q-13 closed) |
| `宛先ID` | recipient ID | **NO — forbidden**; replaced by `宛先キー` (substitute key, copy-only) |
| `文面` | message text | yes — owner-report lines quoting the accounting group or external groups are masked (client 10/7; format Q-51) |
| `結果` | result; see §6 | yes |
| `返した元の発言` (column 6) | original message that the reply answered, format `HH:MM|発言者` | yes — named in Data Contract v1 |

### 2.3 `AI質問追跡` — one row = one question from a patrol run that **was actually sent**

`元の行番号` (copy) / `question_id` / `送信時刻` / `group` / `who` / `question_th` / `source_candidate_sha256` / `slot` (which run) / `state` (stays at default `waiting`; updated in place by the copy if it changes). **No new rows since 10/6** because polling-loop questions are not yet written here (client fixing; Q-52).

### 2.4 `心拍` — one row = one GAS patrol check

`元の行番号` (copy) / `時刻` / `読んだ行数` (rows read) / `候補数` (candidate count) / `送信MEAT` / `送信IN` / `結果` (free text; values such as `AI=scheduled-off` appear since the 10/5 change — meaning **UNCONFIRMED, Q-49**) / `実行ms` / `gap分`.

### 2.5 Group ID → group name (REQ §5-1; applied by the client's Copy Script → `群`)

Decided by the last 6 characters of `グループID`:

| Suffix | Group | In the View-only Copy? |
|---|---|---|
| `2c54ac` | MEAT | yes |
| `c894fd` | IN | yes |
| `47247d` | ALL | yes |
| `15c2bf` | MANAGEMENT | yes |
| `49fcce` | PHOTO | yes |
| `4846a3` | LINK (group contains external persons) | **NO** |
| anything else | not in table | **NO** |

> SAMPLE-02 and SAMPLE-03 use a group named `OPS` (and Nagoya group names `โอสุ`, `เมเอคิ`). `OPS` is **not** one of the five allowed groups. The samples are dummy layout data; they do **not** extend the allow-list. Implement the filter from REQ §5-1 only.

### 2.6 Allowed / excluded summary (REQ §5-1, enforced at copy time — hiding on screen is not sufficient)

| Dimension | Allowed | Excluded |
|---|---|---|
| Groups | MEAT, IN, ALL, MANAGEMENT, PHOTO | LINK (`4846a3`), every group not in §2.5 |
| Recipients (`送信ログ`) | sends to the five groups above; sends to owner (เจ้าของกิจการ) or representative | all others. The rule for resolving recipient → group/owner without `宛先ID` is **UNCONFIRMED / ไม่ยืนยัน (Q-13)** |
| Columns | those in §2.1–§2.4 | `userId`, `宛先ID`, `画像URL` |
| Tabs | `ログ`, `送信ログ`, `AI質問追跡`, `心拍` | all other tabs |
| Identifiers | surrogate keys usable only inside the copy | raw IDs |

---

## 3. Sensitive data — never in the View-only Copy (and never carried by PIATEC)

1. `userId`
2. `宛先ID`
3. `画像URL` (and image bodies)
4. Messages/rows of group LINK and of any group outside §2.5
5. Sends to recipients other than the five groups and the owner (`宛先の群` = `OWNER`)
6. Other tabs (e.g. customer reservation names and phone numbers)
7. Any passwords/credentials of Maru (REQ §7-5: never received); reading with Maru's account is not allowed (client 10/7)
8. Substitute keys `発言者キー` / `宛先キー` are valid only inside the copy (same person → same key): PIATEC may use them for matching inside the Transform but never displays or exports them
9. Owner-report lines quoting the accounting group or external groups are masked by the client (format Q-51)

Related rules:
- Registry contains staff names and local-language text (Thai, Burmese). **No external service may receive them**: translation API, analytics service, or feeding any AI (REQ §7-8). Registry text is used only for on-screen display.
- Screen text is shown **verbatim** (REQ §6): no summarising, translating or re-formatting. HTML/script-like text is displayed as characters (TV15).

---

## 4. View-only Copy — fixed by the client on 2026-10-07 (Data Contract v1)

REQ fixed the source tabs, filters, forbidden fields, substitute-key principle and **two separate timestamps**. The client's 10/7 update
fixes the rest (CONFIRMED unless marked):

| Item | Value | Label |
|---|---|---|
| Who builds / runs it | the client; every 5 minutes | CONFIRMED |
| Columns | Data Contract v1 — connection-spec §4.1 | CONFIRMED |
| Two timestamps | copy `meta.last_read_at` (Original Records last read) / `meta.updated_at` (copy last written) | CONFIRMED |
| Other `meta` columns | `tab`, `source_rows`, `copied_rows`, `contract_version`, `status`, `detail` — allowed `status` values and row-count definitions | names CONFIRMED / meanings **Q-50** |
| Row identity | `元の行番号` in every tab; later changes (`取消`, `結果`, `state`) update the row in place; never twice | CONFIRMED |
| Range | rows from 2026-09-01 | CONFIRMED |
| `グループID` | retained next to `群` | CONFIRMED |
| Substitute keys | `発言者キー`, `宛先キー`; copy-only; stable per person | CONFIRMED (method is the client's) |
| `内容` of a `取消` row | not stated | **UNCONFIRMED (Q-17)** — PIATEC never displays it |
| Timestamp format | not stated (sample: `yyyy/MM/dd H:mm:ss`, no zone) | **UNCONFIRMED (Q-12)** |

Do not invent anything beyond this table in code.

---

## 5. Screen Data (REQ §5-3) — schema and provenance

General (CONFIRMED, REQ §5-3):
- All times stored as `yyyy-MM-ddTHH:mm:ss+07:00` (Bangkok time), for every store.
- "Today" is the **business day of each store** from `stores.timezone` and `stores.business_day_start`. A phone set to Japan or Thailand time must show the same business day for the same store (TV16). Never use viewer/browser time zone to decide "today".
- On rebuild, question state and answers must **not** revert to default (§7.4, **Q-23** for mechanism).
- Extra columns may be added; existing columns and meanings must not change.
- Registry rows whose `question_id` / `message_id` / `send_id` / `host` start with `DUMMY-` / `dummy-` are samples: **excluded from all real summaries** (REQ §6). SAMPLE-02 also marks `run_id` with `DUMMY-`; REQ does not list `run_id` → **UNCONFIRMED / ไม่ยืนยัน (Q-28)**.

Provenance legend used in the tables: **REQ** = REQ states it; **DERIVED** = follows directly from REQ text (cited); **UNCONFIRMED (Q-xx)** = no stated source column/rule.

### 5.1 `meta` (screen reads this first)

One row per tab: `ทะเบียนรอบตรวจ` / `ทะเบียนคำถาม` / `บันทึกการส่ง` / `ทะเบียนข้อความ`.

| Column | Meaning | Provenance |
|---|---|---|
| `tab` | tab name | REQ |
| `generated_at` | when the registry was last regenerated | REQ; written by PIATEC build |
| `last_success_at` | last successful source read | REQ; from copy `meta.last_read_at` (CONFIRMED name 10/7; derivation DERIVED) |
| `source_through` | records exist up to this time | REQ; rule to compute: UNCONFIRMED (Q-09) |
| `status` | `ok` / `stale` / `error` | REQ values; criteria separating `stale` from `error`: UNCONFIRMED (Q-09) |
| `detail` | reason for `stale` / `error` | REQ |
| `contract_version` | column-agreement version, e.g. `v1` | REQ |

### 5.2 `stores` and `schedules` (configuration; adding a store requires NO code change — REQ §7-4)

`stores`:

| Column | Meaning | Notes |
|---|---|---|
| `store` | store identifier, e.g. `NIKUSHO_BANGNA` | |
| `display_name` | display name, e.g. `NIKUSHO บางนา` | |
| `timezone` / `business_day_start` | store time zone / business-day boundary, e.g. `Asia/Bangkok` / `05:00` | Reading "`business_day_start` is in the store's `timezone`" is the natural reading; confirmed only for Bangkok (equal to +07:00). For Nagoya (`Asia/Tokyo` in SAMPLE-02): UNCONFIRMED (Q-29/Q-30) |
| `slot_times` | **copy** of current patrol times for display (comma-separated; blank = no patrols). Original is `schedules`. If they disagree: do not pick one — show "ยังไม่ยืนยัน" and notify Takatsuji | REQ |
| `slot_deadline_min` / `daily_deadline_min` | minutes after scheduled time after which, with no completed record, "ยังไม่ยืนยัน" is shown. Patrol takes ≈ 65 min from read to send, so do not set all to 30 | REQ; sample `90` / `60` |
| `daily_time` | daily-report time (blank = none), e.g. `00:35` | REQ |
| `text_patrol` | light-check window e.g. `10:00-24:00` (blank = out of scope) | REQ |
| `production_host` | `host` of the production machine responsible for the store | REQ |
| `active` | `yes` / `no` (paused) | REQ |

`schedules` (history; one row = schedule for a period): `store` / `kind` (`slot` / `daily`) / `times` (comma-separated) / `valid_from` / `valid_to` (blank = still effective).
Bangkok (**CONFIRMED by the client 2026-10-07**, closes Q-16): slots `12:00,22:00` valid **2026-09-13 – 2026-10-01**; `12:00,17:00,22:00` from **2026-10-02** (first 17:00 run 10/2 17:00); daily `00:35`; `production_host` = **`snowmaru`**. Historical success rates use the schedule in force on that day. Rows before 2026-09-13 have no confirmed schedule (the copy starts 2026-09-01).

### 5.3 `ทะเบียนรอบตรวจ` (runs) — 1 row = one execution of one store

Rule (REQ): **every scheduled patrol/daily must have exactly one row even if it did not run.** Built from `心拍` and `送信ログ` (REQ §5-1). The interpretation table for the free-text `心拍.結果` is to be **proposed by PIATEC from samples and confirmed by the client within 1 business day** — not yet existing → **UNCONFIRMED / ไม่ยืนยัน (Q-15)**.

> **Source change (client 10/7):** since **2026-10-05 23:36** MEAT/IN questions and replies are sent by the **5-minute polling loop**; the 12:00/17:00/22:00 runs only record reads and decisions and send nothing to staff; `心拍.結果` shows values such as `AI=scheduled-off`. **The client will decide and announce how to read run status (Q-49).** Until then: no status is derived from `AI=scheduled-off`, and runs after 10/5 23:36 stay "ยังไม่ยืนยัน" where the record does not prove a status.

| Column | Meaning | Provenance |
|---|---|---|
| `store`, `run_id`, `kind` | store / unique row key / `slot` (patrol), `daily` | REQ. `run_id` format seen in real rows of SAMPLE-02: `<store>_<kind>_<yyyy-MM-ddTHHmm+07:00>`; only uniqueness is normative |
| `scheduled_at` | scheduled time | DERIVED from `schedules` (schedule in force that day) |
| `status` | see §5.3.1 | REQ values; derivation from `心拍`/`送信ログ`: UNCONFIRMED (Q-15) |
| `reason` | short reason for `blocked`・`missing`・`late`・`unknown` | REQ |
| `read_at` | time of read step | likely `心拍.時刻`; UNCONFIRMED (Q-15) |
| `ai_done_at`, `posted_at`, `received_at` | time of each step | **no source column identified in REQ §5-1** → UNCONFIRMED (Q-15) |
| `sent_at` | time LINE accepted the send request | DERIVED from `送信ログ` row with `結果` starting `OK` (REQ: "`sent_at` คือเวลาที่ LINE รับคำขอส่ง"); linking send→run: UNCONFIRMED (Q-21) |
| `input_lines` | number of messages read. **Blank = not yet pulled; 0 = "0 items"** | likely `心拍.読んだ行数`; UNCONFIRMED (Q-15) |
| `questions_sent` | questions LINE accepted | DERIVED from `AI質問追跡` (only sent questions) + send result; linking: Q-21 |
| `messages_sent` | actual messages sent (one message may hold several questions, so may differ from `questions_sent`) | DERIVED from `送信ログ`; linking: Q-21 |
| `owner_items` | items for the owner to decide | **no source column identified** → UNCONFIRMED (Q-15) |
| `photos_total`, `photos_reviewed` | image count / images content-reviewed (may be blank) | **no source column identified** → UNCONFIRMED (Q-15). Counts only; images never stored |
| `owner_notified` | `yes` / `no` / blank | **no source column identified** → UNCONFIRMED (Q-15) |
| `evidence`, `updated_at` | evidence identifier (display as-is) / last update | REQ; SAMPLE-02 real rows hold a sha256-like hash; provenance UNCONFIRMED (Q-15) |

> SAMPLE-02 real rows (2026-09-25–10-01) contain values for `ai_done_at`, `posted_at`, `received_at`, `evidence`, so *someone* produced those values, but REQ §5-1 lists no Source column for them. This is the main reason the source investigation (due 10/6) exists. Do not backfill by assumption.

#### 5.3.1 Run `status` (CONFIRMED values, REQ §5-3 and §6)

| `status` | Meaning | Display (Thai per REQ) | Colour |
|---|---|---|---|
| `ok` | completed, questions sent | เสร็จ (มีคำถาม) | green |
| `silent_ok` | completed, no question (a patrol that sends nothing is **normal**) | เสร็จ (ไม่มีคำถาม) | light green |
| `late` | completed late | เสร็จล่าช้า | yellow |
| `running` / before scheduled time | in progress / not yet due | กำลังทำงาน・ยังไม่ถึงเวลา | grey |
| `unknown` | result cannot be confirmed | ยืนยันผลไม่ได้ | dark yellow |
| `blocked` | stopped | หยุดแล้ว | red |
| `missing` / no row | did not run / unconfirmed | ไม่ได้ทำงาน・ยังไม่ยืนยัน | dark red |

Rules (REQ):
1. A row still `running` when its deadline passes (`slot_deadline_min` / `daily_deadline_min`) becomes **`unknown`** so it does not vanish from the success-rate denominator (TV25).
2. Schedule exists but **no row**: after `schedules` time + deadline minutes from `stores` → "ยังไม่ยืนยัน" (dark red, never silently deleted); before the deadline → "ยังไม่ถึงเวลา".
3. Store whose patrol/daily/light-check is out of scope (the related `stores` column blank) → "ไม่อยู่ในขอบเขต", **not** counted as missing.
4. What exactly makes a run `late` (versus `ok`) is **UNCONFIRMED / ไม่ยืนยัน (Q-15)**.

### 5.4 `ทะเบียนคำถาม` (questions) — 1 row = one question LINE accepted

(Questions the AI only generated but did not send are excluded.)

| Column | Meaning | Provenance |
|---|---|---|
| `store`, `question_id`, `run_id`, `send_id` | store / unique question key / run that sent it (blank for light-check) / send-log row | `question_id` ← `AI質問追跡.question_id` (DERIVED). `run_id` from `slot` and `send_id` linking: UNCONFIRMED (Q-21). **No new `AI質問追跡` rows since 10/6** (polling-loop questions; client fixing — Q-52) |
| `sent_at`, `group`, `who` | send time / group / recipient display name | ← `送信時刻`, `group`, `who` (DERIVED) |
| `question_text` | text as sent (local language kept) | ← `question_th` (DERIVED) |
| `state` | §7.1 | `waiting`/`candidate` computable now; others need evidence |
| `closed_reason`, `closed_at` | `answered` / `owner` / `no_reply` | **no evidence in current Source** → UNCONFIRMED (Q-23) / Phase 2 |
| `answers_json` | JSON array `message_id`, `at`, `who`, `text`, `link` (`confirmed` / `candidate`); need not be oldest-first, **screen must sort by `at`** | REQ; candidates DERIVED per §7.2 |
| `updated_at` | last update | REQ |

### 5.5 `บันทึกการส่ง` (send log) — 1 row = one message actually attempted

| Column | Meaning | Provenance |
|---|---|---|
| `store`, `send_id`, `sent_at` | store / unique key / time | `sent_at` ← `送信ログ.日時`. `send_id`: no source id column; PIATEC proposes an id from `送信ログ.元の行番号` (row identity CONFIRMED 10/7) → Q-11 PARTIAL |
| `kind` | `question` / `reply` (light-check) / `daily` / `alert` | **no source column** → UNCONFIRMED (Q-14) |
| `target_kind`, `target_label` | `group` / `owner` and recipient name | ← `宛先の群` (`OWNER` → `owner`, five groups → `group`; CONFIRMED 10/7, Q-13 closed) and `宛先` |
| `text` | message sent | ← `文面` |
| `result` | `sent` / `unknown` / `failed` | §6 (CONFIRMED). Any other `結果` value → blank (unclassified, never a failure) — IMPLEMENTED |
| `replies_to_message` *(optional, PIATEC)* | `yes` when `返した元の発言` is filled | IMPLEMENTED (copy connector); used only to count replies with unknown origin on ⑦; `kind` stays blank (Q-14) |

### 5.6 `ทะเบียนข้อความ` (messages) — 1 row = one staff message

| Column | Meaning | Provenance |
|---|---|---|
| `store`, `message_id`, `at` | store / unique key / time | `message_id` ← `messageId`; `at` ← `日時` |
| `group`, `sender` | group name / display name | ← `群` (resolved by the client, §2.5); ← `発言者` |
| `kind` | `text` / `photo` / `sticker` / `other` | ← `種別`: `text`→`text`, `image`→`photo`, `sticker`→`sticker`. Other values → `other` (implied; the full list of `種別` values is UNCONFIRMED, Q-12) |
| `text` | content (local language kept). **Photo and sticker = blank** | ← `内容`; `[image]`/`[sticker]` placeholders are not copied into `text` (DERIVED) |
| `handling` | §5.6.1 | partly UNCONFIRMED (Q-18) |
| `replies_json` | JSON array `send_id`, `at`, `by` (`light`/`heavy`), `text`, `result`, `link` (`confirmed` / `ambiguous`); several replies per message possible | §8 |
| `question_id`, `question_link` | if this message is (or may be) an answer to a Bot question: question key and `confirmed` / `candidate` (blank otherwise) | §7.2 |
| `run_id`, `updated_at` | run that read this message (blank if none) / last update | REQ; message→run linking UNCONFIRMED (Q-21) |

Cancellation has **no column** in the REQ §5-3 schema — see §6.2 and **Q-17**. The copy connector adds an optional display-only
column `cancelled` (`yes`) and blanks `text` (option A below, **proposed, not approved**); mock/demo data do not need it.

#### 5.6.1 `handling` values

| Value | Meaning (REQ) | Derivable from current Source? |
|---|---|---|
| `replied` | Bot replied. **Only when `replies_json` contains a reply with `result=sent` AND `link=confirmed`** | yes, via §9 unique match |
| `failed` | send failed | yes, from `結果` starting `NG(` on a linked reply |
| `unknown` | cannot be confirmed from records, **including "unknown which message was answered"** | yes (default when unconfirmable) |
| `not_needed` | not someone the Bot needs to answer | **UNCONFIRMED / ไม่ยืนยัน (Q-18)** — needs AI judgement; PIATEC must not guess (REQ §5-1) |
| `pending` | waiting to be handled | **UNCONFIRMED (Q-18)** |
| `carried` | carried to next patrol | **UNCONFIRMED (Q-18)** |

Link messages to answers **only by keys in the registry**. The Dashboard must never infer a link from text similarity (REQ §5-3).

### 5.7 Heartbeat Sheet (prepared by client; read as-is with the reader account; REQ §5-3, §5-4)

`beats` (production/standby machines write one row every 5 minutes): `received_at`, `host`, `role` (`production`/`standby`), `stores` (comma-separated), `verify` (`PASS`/`FAIL`), `fail_items`, `chatgpt`, `drive`, `g_mounted` (true/false), `disk_free_gb`, `clock_offset_sec`, `text_patrol_at` (last light-check run).
`alerts`: `at`, `kind` (`silent` = not responding / `recovered` / `fail`), `detail`.

Availability: **ready** (client 10/7); view access is granted once PIATEC's reader account is known (Q-48). Production machine for Bangkok: `snowmaru`. "Light-check operating time (not yet in any sheet)" is a known missing record (see §12). Until the sheet exists, anything depending on it is NOT CONNECTED / UNKNOWN, never normal.

---

## 6. messageId, resend, cancel, and send results

### 6.1 messageId / resend (CONFIRMED, REQ §5-1)

- A message = a row of `ログ`.
- Rows with `再送` ("re-sent by LINE") and rows sharing the same `messageId` collapse into **one** logical message.
- In the copy each source row is one copy row (`元の行番号`). Sample 10/5: `再送` rows carry their **own** `messageId`, so "same `messageId`" alone does not tie a resend to its original → how resends are tied: **UNCONFIRMED (Q-17)**.
- The rule for which duplicate row's `at`/`text` is kept is **UNCONFIRMED / ไม่ยืนยัน (Q-17)**.

### 6.2 Cancel

- A row with `取消` is shown as "ข้อความถูกยกเลิก" **without content** (CONFIRMED).
- A cancelled message is **never** a valid answer candidate (CONFIRMED — answers must be "ไม่ถูก取消").
- The copy updates `取消` **in place** when a message is cancelled later (client 10/7). Whether the copy keeps the cancelled `内容` is not stated (Q-17).
- **UNCONFIRMED / ไม่ยืนยัน (Q-17):** REQ §5-3 has no cancel column in `ทะเบียนข้อความ`. §5-3 allows adding columns without changing existing ones; the representation must be approved via Takatsuji. Proposed options for the Q-17 decision: (A) add a column (e.g. `cancelled`) and blank `text` — recommended; (B) encode via existing columns — not recommended because `kind` has no cancelled value. Until decided: do not display the content of any row whose `取消` is set. If cancel arrives after the message was already copied, the displayed content must be removed on the next rebuild.
  **IMPLEMENTED (copy connector, synthetic tests):** rebuild on each read removes the content; ③ shows "メッセージは取り消されました"; a cancel on any row sharing the `messageId` hides the content.

### 6.3 Send result (CONFIRMED, REQ §5-1 and §5-3)

| Source `送信ログ.結果` | Screen Data `result` | Meaning | Allowed wording |
|---|---|---|---|
| starts with `OK` | `sent` | **LINE accepted the send request** | "ส่งแล้ว" only |
| starts with `NG(` | `failed` | failed | "ส่งล้มเหลว" |
| stuck at `ATTEMPTING_NO_RETRY` | `unknown` | result cannot be confirmed | "ยืนยันผลไม่ได้" / "ยังไม่ยืนยันการส่ง" |

Forbidden wording (TV23): "ถึงผู้รับแล้ว", "อ่านแล้ว" (`sent` does **not** mean delivered to the phone or read).
TV23 also lists a third display, "ไม่ส่งเพราะป้องกันส่งซ้ำ" (not sent because of duplicate-send prevention). REQ defines only three `result` values and no Source value for it → **UNCONFIRMED / ไม่ยืนยัน (Q-20)**.

---

## 7. Questions, candidate answers, confirmed answers

### 7.1 Question states (CONFIRMED values; evidence rule from REQ §5-3)

| `state` | Meaning | Display | Colour | Can be produced from current Source? |
|---|---|---|---|---|
| `waiting` | no answer | รอคำตอบ | red | **yes** (default value in Source) |
| `candidate` | a possibly-related answer exists, **not confirmed** | มีคำตอบที่อาจเกี่ยวข้อง・ยังไม่ยืนยัน | yellow | **yes** |
| `acked` | a confirmed answer exists but not complete | มีคำตอบ・ยังไม่ครบ | yellow | **no** — needs evidence record |
| `answered` | all required answers obtained | ได้คำตอบครบ | green | **no** |
| `closed` | closed; show `closed_reason` as words (`answered` / `owner` / `no_reply`) | ปิดเรื่อง | grey | **no** |

`acked`, `answered`, `closed` may be used **only when an evidence record exists**. The four current Source tabs contain no "answered completely" or "closed" record (REQ §5-1). Therefore on real Bangkok data, Phase 1 supports **only `waiting` and `candidate`**.

### 7.2 Candidate rule (CONFIRMED)

A `ログ` row is a **"candidate answer"** when: same group and same sender as the question, **after** the question's `送信時刻`, and **not cancelled**.
- Display "คำตอบที่อาจเกี่ยวข้อง・ยังไม่ยืนยัน".
- It may be an unrelated message (same person writes about something else; two open questions to the same person).
- **Never counted in the response rate.**
- Whether a candidate may be created across days, or when two people share a display name or a name changed, is not defined (TV22 expects confirmed-wrong-links = 0, and unprovable cases shown as "อาจเกี่ยวข้อง"/"ไม่ทราบ") → exact window **UNCONFIRMED / ไม่ยืนยัน (Q-22)**.

### 7.3 Confirmed answer

Only when records prove the answer belongs to that question. **Current records cannot prove it.** A missing record is required (see §12). Until then no `link=confirmed` answer exists on real data and the screen must say "ยังไม่สรุปอัตรายืนยัน・อาจเกี่ยวข้อง n รายการ" instead of 0% (REQ §6-⑦).

### 7.4 Rebuild rule

When Screen Data is rebuilt, question state and answers must **not return to default** (REQ §5-3, TV12). The mechanism that satisfies this together with "regenerate from upstream, no PIATEC-only data" (REQ §7-3) is **UNCONFIRMED / ไม่ยืนยัน (Q-23)**. Constraint: any state other than `waiting`/`candidate` must be reconstructible from upstream evidence.

---

## 8. Bot-reply matching (CONFIRMED, REQ §5-1)

Inputs: `送信ログ.返した元の発言` ("column 6", `HH:MM|発言者`; named in Data Contract v1) and `ログ`. Since 10/5 23:36 these replies come from the 5-minute polling loop (Q-49 for how they relate to runs).

```text
For a 送信ログ row whose column 6 is non-empty:
  candidates = ログ messages where
        same day  AND  same recipient group  AND  HH:MM = column-6 time  AND  発言者 = column-6 sender
  exactly 1 candidate  → link = confirmed   (handling may be replied if result = sent)
  2 or more            → link = ambiguous   ("ไม่ทราบว่าตอบข้อความใด"; e.g. one person wrote two messages in the same minute)
  column 6 empty (includes everything before 2026-10-02) → do NOT link
```

Rules:
- Confirm **only** when exactly one message matches. Never guess.
- Column 6 alone does **not** prove the case "one reply answers several messages".
- Replies that cannot be tied to a message are counted separately as "คำตอบที่ไม่ทราบข้อความต้นทาง n รายการ" (REQ §6-⑦) and are **not** counted in "Bot ตอบ".
- Only `link=confirmed` AND `result=sent` makes `handling=replied`.
- Display (REQ §6-③): Bot replies appear **immediately under the original message**, in `at` order ("กี่นาทีต่อมา・ตรวจแบบเบา/รอบตรวจ・ข้อความ"); `result` not `sent` → label "ยังไม่ยืนยันการส่ง" or "ส่งล้มเหลว".

**As implemented in the copy connector (conservative reading while Q-19 / Q-12 are open):** a link is `confirmed` only when the
calendar-day reading and the business-day reading give the same single message, the column-6 `HH:MM` is read in the configured copy
time zone (`NIKUSHO_COPY_TIMEZONE`; without it nothing is confirmed), and that message is not later than the send. Two or more
candidates → `ambiguous`, attached to no message. Every reply that is not confirmed counts as "unknown origin" on ⑦.

**UNCONFIRMED / ไม่ยืนยัน (Q-19):** behaviour when zero messages match; the meaning of "same day" (calendar vs business day, matters around midnight); where an `ambiguous` reply is stored (SAMPLE-02 `DUMMY-m-005` stores an `ambiguous` reply inside one message row, which conflicts with "cannot tell which message"); `by=heavy` (patrol-run replies) matching source — no column identified.

---

## 9. Time, business day, schedules, freshness

| Rule | Value | Label |
|---|---|---|
| Storage format | `yyyy-MM-ddTHH:mm:ss+07:00` for all stores | CONFIRMED |
| "Today" | business day per store (`timezone`, `business_day_start`) | CONFIRMED |
| Phone timezone | irrelevant to "today" | CONFIRMED (TV16) |
| Day-boundary case | include the change-of-day in TV16 | CONFIRMED |
| Formats/timezones of Source timestamps (`日時`, `時刻`, `送信時刻`, `HH:MM`) | not stated in REQ | UNCONFIRMED (Q-12) |
| Timezone used to *display* clock times (Bangkok store vs Tokyo store) | not stated | UNCONFIRMED (Q-12) |
| End-to-end latency | ≤ **10 minutes** Source row → screen | CONFIRMED (REQ §5; TV9, 3 consecutive days) |
| Test registry change → screen | ≤ **5 minutes** (TV2, type B) | CONFIRMED |
| Stopped-update detection | ≤ **20 minutes**; screen shows "หยุดอัปเดต" and notifies the agreed contact once (Q-02, Q-47) | CONFIRMED (TV19, TV21) |
| Copy refresh | client Copy Script every **5 minutes** | CONFIRMED (client 10/7) |
| Copy range | rows from **2026-09-01** (⑦ can look back to that date) | CONFIRMED (client 10/7) |
| Screen performance | page shows within **3 seconds** (TV4, TV17) | CONFIRMED |

### 9.1 Update banner (top of every page; REQ §6)

Show `meta.source_through` ("บันทึกถึง hh:mm") and minutes elapsed.

| Condition | Display |
|---|---|
| `status=ok` **and** `generated_at` within 20 minutes | normal |
| `stale`, `error`, `generated_at` older than 20 minutes, sheet unreadable, or required column missing | **red banner "หยุดอัปเดต (สำเร็จล่าสุด hh:mm)"**; numbers below greyed with tag "บันทึกถึงเวลานี้"; **never** make old numbers look "normal" or "0 items" |

Which `meta` row drives the banner on each page (and how rows are combined on ① and ②) is **UNCONFIRMED / ไม่ยืนยัน (Q-25)**. SAMPLE-03 suggests page-specific tabs (page ③ shows the `ทะเบียนข้อความ` row), but it is only a sample.

### 9.2 Machine heartbeat (REQ §6-①, ⑥)

| Item | Rule (CONFIRMED) |
|---|---|
| Production machine for a store | latest `beats` row where `host` = `stores.production_host` **and `role=production`** |
| Standby | **never** substitutes for the production machine; a healthy standby with a stopped production machine must show **red** |
| Production heartbeat age | older than **15 minutes → red**; `verify=FAIL` → red |
| Light check (`text_patrol_at`) | red only if inside `stores.text_patrol` window AND not running for **15 minutes counted from the later of "last run time" and "start time of today's window"**; outside window → "นอกเวลา" |
| Alerts | latest 20 `alerts` rows, newest first |

TV14 reading (derived; compressed wording in REQ): production stopped → red at 10:00, 10:20 and 01:00; light check: at 10:00 not red (window just started, no night-time carry-over), red at 10:20 if still not running, "นอกเวลา" at 01:00. The 15-minute thresholds here are the REQ's and are **different** from the 20-minute data-update threshold; do not merge them.

### 9.3 Deadlines and "no row" (see §5.3.1). Out-of-scope stores: see §5.3.1 rule 3.

---

## 10. Missing, unknown and zero (REQ §6 common rules)

| Situation | Display | Never |
|---|---|---|
| Blank value in a count field (e.g. `input_lines`) | "ยังไม่ได้ดึงข้อมูล" | treat as 0 |
| Explicit 0 | "0 รายการ" | treat as missing |
| Rate whose denominator is 0 | "ไม่มีรายการที่เข้าเกณฑ์" | show 0% |
| Day pulled completely and has 0 messages | "0 รายการ" | |
| Day not pulled completely (judge by `meta.source_through`) | "ยังไม่ได้ดึงข้อมูล" | show "0 รายการ" |
| `answers_json` unparsable | "อ่านคำตอบไม่ได้" | treat as empty |
| Row unreadable (TV13) | "อ่านไม่ได้" | |
| No confirmed-answer records in period | "ยังไม่สรุปอัตรายืนยัน・อาจเกี่ยวข้อง n รายการ" | 0% |
| Only candidate answers → time-to-answer | "ยังไม่สรุป" | |
| Source meaning not understood | "ยังไม่ยืนยัน" + ask Takatsuji | guess |
| Nagoya store, no connection | "ยังไม่เชื่อมต่อ" | "หยุดแล้ว" (today everything in Nagoya looks `blocked` because no store marker exists — REQ §5-2) |
| Store feature out of scope (blank `stores` column) | "ไม่อยู่ในขอบเขต" | count as missing |

---

## 11. Dashboard derivations (Screen Data → 7 pages; REQ §6)

Common: display language **Japanese** per REQ §6; local-language text shown verbatim; text rendered as plain text; portrait phone with no horizontal scroll; no writes; buttons only open / filter / back. The exact Japanese UI strings are not in the provided Thai document → **UNCONFIRMED / ไม่ยืนยัน (Q-24)**; Thai wording in this file expresses meaning only. Thai UI is explicitly out of scope (REQ §9).

### ① All stores (home; 10/25)
One group per store with `stores.active=yes` (auto-added when a store is added); tap → ②.

| Display | Build |
|---|---|
| Patrol/daily dots | for each scheduled time in `stores`: `status` of today's (store business day) run row; no row → "ยังไม่ถึงเวลา" or "ยังไม่ยืนยัน" |
| คำถาม n | sum of `questions_sent` of today's rows |
| รอคำตอบ n | count of question rows with `state` ∈ {`waiting`, `candidate`}, **all days** |
| ข้อความวันนี้ n (Bot ตอบ n) | count of today's message rows / count with `handling=replied` (confirmed only) |
| เครื่องใช้งานจริง n นาทีที่แล้ว | §9.2 |
| ตรวจแบบเบา n นาทีที่แล้ว | `text_patrol_at` of the same row; out-of-scope → "ไม่อยู่ในขอบเขต" |

SAMPLE-03 ① additionally shows "ล้มเหลว 1" in the message line. REQ lists only "ข้อความวันนี้ n (Bot ตอบ n)". REQ wins: do **not** add the extra item unless confirmed (Q-24).

### ② Today (10/15)
Patrol and daily runs for today and yesterday (business days) of the selected store, newest first. Row: scheduled time / kind / `status` (colour and word) / `reason` / `input_lines` / `questions_sent` / `messages_sent` / `owner_items` / `read_at`・`ai_done_at`・`sent_at` / photos if non-blank (e.g. "ตรวจภาพ 3/5 ภาพ") / `owner_notified`. Tapping a patrol shows its messages (③ rows with same `run_id`) and questions (④ rows with same `run_id`).

### ③ Messages (10/15)
Selected store, newest first, date changeable.
- Line 1: `at`・`group`・`sender`. Body: `text`; `photo` → "(ภาพ)"; `sticker` → "(สติกเกอร์)".
- Bot replies: all `replies_json` by `at`, as a paragraph directly under the message.
- Handling marks: `pending`="รอดำเนินการ", `carried`="ส่งต่อรอบถัดไป", `failed`="ส่งล้มเหลว"(red), `unknown`="ยังไม่ยืนยัน"; `not_needed` shows nothing.
- Answer-to-question: `question_link=confirmed` → "↩ คำตอบต่อคำถาม"; `candidate` → "↩ อาจเป็นคำตอบต่อคำถาม (ยังไม่ยืนยัน)"; tap goes to the question in ④.
- Filters: by group / only "Bot ตอบแล้ว" / only "ล้มเหลว・ยังไม่ยืนยัน".
- Top figures: message count for the day and Bot-reply count (see §10 for 0 vs not pulled).

### ④ Questions and answers (10/15)
Newest first. Filters: ทั้งหมด / รอคำตอบ / มีคำตอบ / ปิดเรื่อง. Mapping of states to these filters is **UNCONFIRMED / ไม่ยืนยัน (Q-27)**; SAMPLE-03 counts `waiting`+`candidate` under "รอคำตอบ" (consistent with ①).
- Wait time: **only `waiting`** rows: now − `sent_at`, in hours (SAMPLE-03: 62 h for a 09/29 23:05 question viewed 10/02 13:50, i.e. whole hours).
- Question text verbatim; answers all by `at` with time・person・text; `link=candidate` tagged "อาจเกี่ยวข้อง (ยังไม่ยืนยัน)"; none → "ยังไม่มี"; broken JSON → "อ่านคำตอบไม่ได้".
- Must read in order question → answer → state, in time order, original text kept.

### ⑤ Missing and failed (10/15)
Only `missing`・`blocked`・`late`・`unknown` and "ยังไม่ยืนยัน" (schedule but no row) in the **latest 14 days**, newest first. Columns: date・time・store・kind・status・reason. Total counts on top. `บันทึกการส่ง` rows with `result=unknown`/`failed` are listed separately below.

### ⑥ Production machine and updates (10/15)
- Data update: for each `meta` tab: `status`・`last_success_at`・`source_through`・`detail`.
- Each machine: last heartbeat age / `role` / `verify` / `fail_items` / `chatgpt`・`drive`・`g_mounted` / `disk_free_gb` / `clock_offset_sec`. Rules in §9.2.
- Light check: §9.2. Alerts: latest 20.

### ⑦ Numbers by period (10/15 one store; 10/25 store comparison)
Select 7 or 30 days. Scheduled runs counted from `schedules` (schedule in force that day).

| Figure | Calculation |
|---|---|
| Patrol success rate | (`ok`+`silent_ok`+`late`) in scheduled patrols ÷ number of scheduled patrols (**excluding `running`**). Store with patrol out of scope: "ไม่มีรายการที่เข้าเกณฑ์" |
| Daily success rate | same with `kind=daily`; **shown on a separate row from patrols** |
| Missing / Stopped / Unconfirmed | `missing`+no row / `blocked` / `unknown` |
| Questions sent | count of question rows with `sent_at` in period |
| Response rate | questions sent in period having ≥1 answer with `link=confirmed` ÷ questions sent in period. `candidate` not counted. 0 questions → "ไม่มีรายการที่เข้าเกณฑ์". No confirmation records → never 0%, show "ยังไม่สรุปอัตรายืนยัน・อาจเกี่ยวข้อง n รายการ" |
| Time to answer | median of (first `link=confirmed` answer `at`, sorted by `at`) − `sent_at`; only candidates → "ยังไม่สรุป" |
| Messages | count of message rows + daily bar chart |
| Bot replies | count of `handling=replied` only; unknown-origin replies shown separately: "คำตอบที่ไม่ทราบข้อความต้นทาง n รายการ" |

**UNCONFIRMED / ไม่ยืนยัน (Q-26):** whether 7/14/30-day windows use business days, and whether scheduled runs not yet due are in the denominator (REQ excludes only `running`).
`DUMMY-`/`dummy-` rows are excluded from every real summary (§5).

---

## 12. Phase 1 vs Phase 2 data availability (REQ §2)

| Function | Bangkok — Phase 1 (10/15・10/25) | Phase 2 (after quotation + schedule approval) | Nagoya 2 stores |
|---|---|---|---|
| Is the monitoring system running (patrol, daily) | **complete with real data**, subject to Q-15 | — | Phase 1: show "ยังไม่เชื่อมต่อ" correctly; Phase 2: real data |
| Messages from staff | **complete with real data** | — | same |
| Bot replies | **complete with real data** (confirm-only-if-unique, §8) | — | same |
| Machine and update health | **complete with real data** (Heartbeat Sheet due 10/8) | — | same |
| Answer to questions | up to **CANDIDATE** ("อาจเกี่ยวข้อง・ยังไม่ยืนยัน") | **confirm answers, complete, close** — after missing records are added | same |

- Acceptance of Phase 1 **does not mean the whole system is complete** (REQ §2).
- Data label per Phase-1 state of Bangkok question answers = CANDIDATE; Nagoya = NOT CONNECTED.
- The mechanism that marks a store NOT CONNECTED in Screen Data is **UNCONFIRMED / ไม่ยืนยัน (Q-29)** (the `stores` schema has no such column; SAMPLE-02 shows Nagoya patrol/daily rows as `blocked` with reason "ต้นฉบับไม่มีตัวระบุสาขา…"). Do not hard-code `if store == Nagoya`.

### 12.1 Known missing records (REQ §5-1)

1. Evidence of "all answers obtained" / "closed".
2. Record confirming question ↔ answer link.
3. Record linking a message to the Bot reply by message ID.
4. Light-check operating time (not yet in any sheet).
5. Machine Heartbeat Sheet (in preparation).
6. Nagoya 2 stores (different place and format; REQ §5-2: client has not confirmed how to read; no store marker).

Additional gaps found by cross-check (not client-confirmed; candidates for the missing-record list v1 due 10/6): see `docs/connection-spec.md` §10.

---

## 13. Notes on the sample files (non-normative)

**SAMPLE-02 (`02_ตัวอย่างทะเบียน_3สาขา.xlsx`)** — sheets: `คำแนะนำ`, `meta`, `stores`, `schedules`, `ทะเบียนรอบตรวจ`, `ทะเบียนคำถาม`, `บันทึกการส่ง`, `ทะเบียนข้อความ`, `beats`, `alerts`. Column sets match REQ §5-3 exactly (runs 20 columns, questions 13, sends 8, messages 13, meta 7, stores 11, schedules 5, beats 12, alerts 3).
- `ทะเบียนรอบตรวจ` rows whose `run_id` does not start with `DUMMY-` are real data for 2026-09-25 to 10-01 and contain **no names or message text**; every other sheet is dummy (even the schedule start dates).
- It is the format "when every status exists"; statuses the real records cannot prove must still show "ยังไม่ยืนยัน" (REQ §5-3).
- Observed inconsistencies (do not "fix" in code; raise via Takatsuji): group `OPS` outside the allow-list; Nagoya `daily_time` `02:45` in `stores` while real Nagoya run rows are scheduled `00:45`; a real-looking `NIKUSHO_BANGNA` 17:00 `missing` row dated 2026-10-01 although the 17:00 slot is `valid_from` 2026-10-02 in the dummy `schedules` (the true 17:00 start date is pending client confirmation, Q-16).

**SAMPLE-03 (`03_ตัวอย่างหน้าจอ.html`)** — layout only; numbers and text are dummy; it states colour/order/items follow the requirement. Its caption cites "ข้อกำหนด §4" while REQ puts the screen rules in **§6**; REQ is authoritative. REQ says ④ is "the main page to be used in the presentation" (SAMPLE-03 caption). Where SAMPLE-03 shows something REQ does not specify (e.g. "ล้มเหลว 1" on ①), follow REQ.

---

## 14. Open-question index for this file

Q-09 to Q-30 (data-level questions; Q-01 to Q-08 cover platform, authentication, notification and timeline and are used by `docs/architecture.md`) — full register with owner, due date and safe default in `docs/connection-spec.md` §12. Status after the client's 2026-10-07 update and new questions Q-47 … Q-53 (contact route, reader account, run-status reading, copy `meta`, masked lines, `AI質問追跡` gap, TV18 split): `docs/connection-spec.md` §12.1.
