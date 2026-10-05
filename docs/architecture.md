# docs/architecture.md — NIKUSHO AI Monitoring System: Architecture

| Item | Value |
|---|---|
| Document status | CONTRACT DRAFT v0 |
| Written | 2026-10-03 |
| Source of Truth | `01_ข้อกำหนดหน้าจอจัดการ.md` — Requirement **2026-10-02 (draft 5)**, cited **REQ §x** |
| Supporting | `02_ตัวอย่างทะเบียน_3สาขา.xlsx` (SAMPLE-02), `03_ตัวอย่างหน้าจอ.html` (SAMPLE-03) |
| Withdrawn | All 9/30 documents (REQ §0) |
| Companions | `docs/data-mapping.md`, `docs/connection-spec.md` (holds the Q-xx register, §12), `Claude.md` |

Markers: **CONFIRMED** = stated by REQ. **UNCONFIRMED / ไม่ยืนยัน (Q-xx)** = REQ is silent, ambiguous or contradictory; do not decide in code, ask Takatsuji. Data-level labels (CONFIRMED / CANDIDATE / UNKNOWN / NOT CONNECTED) are defined in `docs/data-mapping.md` §0.

---

## 1. What this system is

The deliverable is **not merely a 7-page frontend**. It is a **monitoring pipeline** that carries the existing monitoring system's logs to a phone screen automatically, plus the means to keep it running (REQ §0, §2, §3).

```text
Existing monitoring system (patrol program / GAS / LINE sending / AI instructions)   ← NOT changed by PIATEC
        │ writes
        ▼
SOURCE (Bangkok spreadsheet, 4 tabs used)                                            ← PIATEC has no direct access
        │ Copy Process (built by PIATEC, installed by Client Developer)
        ▼
READ COPY  → normalization/validation → domain logic → SCREEN DATA (7-tab registry) → CACHE
        │                                                                              (all in client-named storage)
        ▼
SERVER-SIDE VIEWER CHECK (authentication + allowlist) → API (read-only) → 7 DASHBOARD PAGES
        ▲
HEARTBEAT SHEET (beats, alerts; client-prepared; read as-is)

Cross-cutting: freshness monitoring · stop detection ≤20 min · alert to Takatsuji · checkpoint/resume · recovery
Separate entry: DEMO page on fixed anonymized data
```

**Completion condition (REQ §2):** logs the monitoring system already writes must flow to the screen automatically through the process PIATEC builds, and the client can open one URL and view every day. A screen alone, dummy data alone, or anything that still needs manual work by the client = **not accepted**. Neither phase may require Maru to work daily (confirming answers, copying data).

The system **reads and displays only**. It has no capability to change the monitoring system, send, re-run or approve (REQ §6, §7-1, §9).

---

## 2. Roles and responsibility boundary

| Role | Responsible for | Boundary |
|---|---|---|
| **PIATEC** | All of: ① select/copy only necessary data from Source into Read Copy continuously (build, test, monitor, recover) ② convert Read Copy to Screen Data ③ automatic update Source→screen ≤10 min and detect stops ④ **inspect the Source; write the connection spec and missing-record list** ⑤ 7 pages ⑥ install in the client's environment ⑦ authentication ⑧ demo data ⑨ fix non-conformities found in connection tests/acceptance ⑩ post-delivery monitoring, root-cause analysis, recovery ⑪ hand over procedures and source code (REQ §2) | No direct Source access; no Source writes; no LINE/e-mail to groups, staff, owner |
| **Client Developer** (ผู้พัฒนาฝั่งผู้ว่าจ้าง) | Install the Copy Process (and revised versions) on the Source side and approve permissions; review/approve spec and missing-record list; change the existing monitoring program only when necessary; answer read-method questions within 1 business day; confirm schedule history such as the 17:00 start date | Only party that touches the Source |
| **Client Acceptance Tester** (ผู้ตรวจรับ) | Compare screen numbers with the Source; decide pass/fail | **Must not be the builder** |
| **Takatsuji** (คุณทาคัตสึจิ, coordinator) | Collect questions, confirmations and **incident reports**; first screen check; receive connection-problem and recovery notices; installs Source-side revisions (with / instead of Client Developer) | Everything goes to him, **never to Maru directly**; unlimited number of questions; do not build while uncertain |
| **Maru** (คุณมารุ, client owner) | Approve quotation; first identity verification and owner-only permission approvals; one-time approval of the Copy Process on the Source side; major cost/permission/business decisions; final usability check | **Never assigned**: copying, updating, data comparison, checking, running commands, installing, daily operation, technical decisions. PIATEC never receives his password |

Escalation rule (REQ §2): a decision not covered by the REQ → stop building that part; send **two options with a recommendation** to Takatsuji. Source-side defects → send **evidence** (tab, row, time, expected value vs actual value) to Takatsuji; Client Developer takes over; checking is never handed back to Maru. Real-system changes needing approval are requested **through Takatsuji**.

No other roles exist in the REQ. Per-store manager permissions are **out of scope** (REQ §9): every allowed viewer sees all stores.

---

## 3. Pipeline layers and responsibilities

| # | Layer | Responsibility | Where it lives | Status |
|---|---|---|---|---|
| L0 | Source | Written by the existing system; read-only to us; PIATEC cannot reach it | existing spreadsheet (client) | CONFIRMED |
| L1 | Copy Process | Filter at copy time (groups, recipients, columns, sensitive fields); surrogate keys; keep two timestamps; resumable | installed Source-side by Client Developer | CONFIRMED (REQ §5-1); runtime/trigger **Q-08** |
| L2 | Read Copy | Stores the filtered copy | client-named storage | CONFIRMED; layout **Q-10** |
| L3 | Normalization | Source column → Screen field (formats, `+07:00` timestamps, group names, `kind`, resend/cancel merge) | PIATEC build | CONFIRMED rules; see data-mapping §5–§6 |
| L4 | Validation | Reject/flag malformed rows, missing required columns, broken JSON; detect sensitive fields that should never be present; schema/`contract_version` check | PIATEC build | CONFIRMED needs (TV13, TV24); mechanism not specified |
| L5 | Domain logic | Run status, question state, answer candidate, Bot-reply match, business day, schedule history, heartbeat, freshness, 7/30-day figures, Phase capability | PIATEC build | CONFIRMED rules |
| L6 | Screen Data | 7-tab registry (REQ §5-3) + `meta` freshness | client-named storage | CONFIRMED |
| L7 | Cache | Speed only; derived from Screen Data; deletable and rebuildable (TV7); **no bypass of authorization** | client environment | CONFIRMED principle; mechanism **Q-05** |
| L8 | Viewer check | Authentication then allowlist **on the server** | client environment | CONFIRMED principle; method **Q-01** |
| L9 | API | Read-only delivery of Screen Data to authorized viewers; no write operations; `GET`-style reads only | client environment | read-only is CONFIRMED (REQ §6 "ไม่เขียนข้อมูลจากหน้าจอ"); concrete endpoints/technology **UNCONFIRMED (Q-01)** — none are defined |
| L10 | UI | 7 pages; Japanese UI; portrait phone; plain-text rendering | client environment | CONFIRMED |
| X | Monitoring / alert / recovery | See §8 | client environment | CONFIRMED needs; terms **Q-02, Q-03** |

Technology: REQ says "choose as appropriate, **prioritise a structure that needs no server maintenance**" (REQ §3), install in the client's Google environment, one URL. Anything beyond this (framework, language, storage engine) is **not fixed by REQ → UNCONFIRMED (Q-01)**. Do not introduce a database: moving the registry from spreadsheet to DB is explicitly **out of scope** (REQ §9); the registry stays a spreadsheet-type store in client-named storage unless the client changes this.

Single-direction data flow with **upstream wins** (REQ §7-3): Source → Read Copy → Screen Data → Cache. Stores are created only from the upstream layer; PIATEC-only data is forbidden (copies, screen data, settings and resume points are permitted **in client-named storage**).

---

## 4. Source access restriction and client-side copy installation

```text
              PIATEC                                CLIENT SIDE
     (cannot enter the Source)             ┌──────────────────────────────────┐
  builds Copy Process ──delivers──────────▶│ Client Developer / Takatsuji      │
  (code, test results, rollback)           │  INSTALLS on Source side          │
                                           │  Maru approves permission ONCE    │
                                           └────────────────┬─────────────────┘
                                                            ▼
                                       SOURCE ──filtered copy──▶ READ COPY (client-named)
                                                                      ▲
                                    PIATEC build reads here ──────────┘
```

- PIATEC reads only Read Copy and the Heartbeat Sheet; **no access to real GAS, real folders or the Source** (REQ §7-2).
- Installation of revised versions follows the same route; PIATEC supplies the revision, test result and rollback procedure; PIATEC keeps receiving fault reports, analysing causes and confirming recovery. Never hand install/recovery work back to Maru (REQ §2).
- Filtering at copy time: groups MEAT・IN・ALL・MANAGEMENT・PHOTO only; owner/representative and the five groups as recipients; no `userId`, `宛先ID`, `画像URL`; no LINK; no other tabs (details: connection-spec §4–§5).

---

## 5. Authentication vs Authorization

| Concept | Meaning here | Source |
|---|---|---|
| Authentication | Establishing who the viewer is (verified identity). The REQ asks PIATEC to answer the identity-verification method by **10/3** and to prototype it with real accounts of Maru (personal Gmail) and Takatsuji by **10/6**. Some Apps Script configurations cannot read the viewer's e-mail. | REQ §4, §7-6; method **UNCONFIRMED (Q-01)** |
| Authorization | Whether that verified viewer is on the **allowlist** (list of permitted viewers). Checked **on the server**. | REQ §7-6 |

Rules (CONFIRMED, REQ §7-6, TV3):
1. Server-side viewer check: **no data is sent** to anyone not on the allowlist **or whose identity cannot be verified**. Merely hiding the screen is not acceptable.
2. When access is revoked, the viewer must see nothing — **including from cache**. Cache is never a bypass.
3. Order of checks on every data request: (1) authenticated? (2) on the allowlist? (3) only then return data. An unverified identity is treated the same as "not on the list".
4. A procedure to **add and remove viewers** is a deliverable (REQ §3 #6). Where the list lives: **Q-04**.
5. Only identity verification and owner-only approvals are asked of Maru; PIATEC never holds his password (REQ §7-5).
6. There is one level of permission: allowed viewer. No role-based/per-store permission (REQ §9).

Required tests: TV3 (account not on list; open right after revocation → both receive no data) and TV15 (real accounts of Maru and Takatsuji on phones).

---

## 6. Security boundaries

| Boundary | Rule | Source |
|---|---|---|
| Source | read-only to everyone but the existing system; PIATEC never writes or connects | REQ §2, §7-1, §7-2 |
| Read Copy | contains only allowed groups/recipients/columns; no `userId`, `宛先ID`, `画像URL` | REQ §5-1; TV24 |
| External services | registry contains staff names and local-language text → **never** sent to external services (translation API, analytics, AI input) | REQ §7-8 |
| Rendering | registry text is displayed as characters; HTML/script text must not execute (e.g. `<script>`, `<b>test</b>`) | REQ §6; TV15 |
| Screen | no writes; buttons only open / filter / back | REQ §6 |
| Outbound messages | no LINE/e-mail to work groups, staff or owner; sole exception: connection-problem and recovery notices to Takatsuji via the single approved channel | REQ §7-1; channel **Q-02** |
| Ownership | client's account, domain, billing; code in a client-named repository | REQ §7-5, §3 |
| Test data | tests that change data use test sheets only; never alter real Source, real copy or real Screen Data | REQ §7-9 |
| Demo | separate entry, anonymized (see §10) | REQ §7-12 |
| References | using the client's name/store/screen as portfolio requires asking first; contract states the client may use, modify and hand over the work | REQ §7-11 |

---

## 7. Freshness, monitoring, alerting and recovery

### 7.1 Time constants (single source; do not scatter literals)

| Constant | Value | Meaning | Source |
|---|---|---|---|
| `SOURCE_TO_SCREEN_MAX_MINUTES` | **10** | Source row → screen, whole path | REQ §5, §3 #1b, TV9 |
| `STOP_DETECTION_MAX_MINUTES` | **20** | stopped updates detected; banner and notice | REQ §6, TV19, TV21 |
| `BANNER_STALE_MINUTES` | **20** | `generated_at` older than this → red banner | REQ §6 |
| `PRODUCTION_HEARTBEAT_RED_MINUTES` | **15** | production machine heartbeat older → red | REQ §6-⑥, TV14 |
| `LIGHT_CHECK_RED_MINUTES` | **15** | light check silent within its window (counted from the later of last run and today's window start) | REQ §6-⑥, TV14 |
| `HEARTBEAT_WRITE_INTERVAL` | 5 min | machines write a `beats` row every 5 minutes | REQ §5-3 |
| `PAGE_RENDER_MAX_SECONDS` | 3 | page display | TV4, TV17 |
| `TEST_CHANGE_MAX_MINUTES` | 5 | test-sheet change shown | TV2 |
| `RECENT_FAILURE_DAYS` | 14 | page ⑤ window | REQ §6-⑤ |
| `ALERTS_SHOWN` | 20 | latest alerts on ⑥ | REQ §6-⑥ |

> Correction to the earlier chat draft: it advised not embedding the 15-minute threshold. **REQ §6-⑥ and TV14 explicitly require 15 minutes** for the production machine and the light check. Keep 15 (machine) and 20 (data update) as separate constants.

### 7.2 Stop detection

```text
last successful update ──► age ≥ 20 min or status ∈ {stale, error}, unreadable, required column missing
        ──► screen: red banner "หยุดอัปเดต (สำเร็จล่าสุด hh:mm)"; numbers below grey, tagged "บันทึกถึงเวลานี้"
        ──► notify Takatsuji ONCE (no repeat), notify again when recovered
```

Must also detect: Source→Read Copy stopped while later stages still run (TV21), a stage failing midway (TV19), and the **monitoring process itself stopping** (TV25). Exact notice timings/duplicate suppression/service hours/first response/recovery target: **Q-03**; channel: **Q-02**.

### 7.3 Recovery

PIATEC recovers without Maru acting. Before handover PIATEC installs, verifies the connection and demonstrates recovery from: copy deleted, read permission re-granted, screen fault (REQ §7-10, TV18). A named responsible person and contact channel in writing are required. Post-delivery: receive report → root cause → recover → confirm (REQ §2).

---

## 8. Idempotency, deduplication, checkpoint / resume

| Requirement | Detail | Source |
|---|---|---|
| Idempotent runs | running twice in a row creates no duplicate rows | TV19 |
| Dedup keys | `messageId` (+ `再送`), `question_id`, `send_id`, `run_id` | REQ §5-1, §5-3; keys for rows lacking one: **Q-11** |
| Resume | after a mid-way failure the next run continues from the same point with no loss and no duplicate | REQ §3 #1b, TV19 |
| State persistence | rebuilding the registry must not reset question state or answers | REQ §5-3, TV12; mechanism **Q-23** |
| Where state lives | client-named storage only | REQ §7-3 |
| Rebuild | deleting all screen cache must rebuild identically from the registry | TV7 |

---

## 9. Phase 1 / Phase 2 capability model

Capability is a property of **(store, function)**, derived from configuration and available records — never a hard-coded store name (REQ §7-4, TV5). Labels are the four data-level labels only.

| Function (REQ §2) | Bangkok, Phase 1 | Bangkok, Phase 2 | Nagoya Osu / Meieki |
|---|---|---|---|
| Monitoring running (patrol, daily) | CONFIRMED with real data (subject to Q-15) | — | NOT CONNECTED → Phase 2 real data |
| Staff messages | CONFIRMED | — | NOT CONNECTED → Phase 2 |
| Bot replies | CONFIRMED (unique match only; else UNKNOWN) | — | NOT CONNECTED → Phase 2 |
| Machine and update health | CONFIRMED (Heartbeat Sheet due 10/8; NOT CONNECTED until present) | — | NOT CONNECTED → Phase 2 |
| Answers to questions | **CANDIDATE** ("อาจเกี่ยวข้อง・ยังไม่ยืนยัน"); `waiting`/`candidate` only | confirmed answers, complete, close — after missing records exist | NOT CONNECTED → Phase 2 |

- Phase 1 acceptance (Bangkok data pull, display, connection monitoring) **is not whole-system completion**.
- Phase 2 starts after price and schedule are approved. To show real 3-store data at the 11/12 presentation, the Phase 2 delivery date must be agreed (**Q-07**). The demo screen is a different matter from completed real use.
- The quotation and connection check must contain a **per-function table**: "usable in Phase 1 / shown only up to unconfirmed / complete in Phase 2" with cost, schedule and what the client must change (REQ §2).
- How a store is marked NOT CONNECTED in Screen Data: **Q-29**.

---

## 10. Demo vs Production separation

| | Production | Demo |
|---|---|---|
| Purpose | daily use by allowed viewers | presentation (11/12) without exposing real names and text |
| Data | real Screen Data | **fixed, anonymized** sheet with the same columns; PIATEC masks real names; client reviews and approves content |
| Entry | the single production URL | **separate entry** (same screens) |
| Banner | normal update banner | "สาธิต" (demo) shown at the top **at all times** |
| Switching | — | **no button or automatic switching between production and demo** |
| Updates | pipeline | none (fixed data) |

Rules: the real screen holds real names/text → never projected at the presentation. Demo must not read production data. Production summaries exclude `DUMMY-` rows. Deliverable #3. How the demo entry is authorized: **Q-01/Q-04** (not defined by REQ).

---

## 11. The 7 dashboard pages (REQ §6; details in data-mapping §11)

| # | Page | Delivery | Purpose |
|---|---|---|---|
| ① | All stores (home) | 10/25 | one group per `active=yes` store; links to ② |
| ② | Today | 10/15 | patrols/daily of today and yesterday; drill-down to messages and questions |
| ③ | Messages | 10/15 | incoming messages with Bot replies under each |
| ④ | Questions and answers | 10/15 | question → answer → state in time order (main presentation page per SAMPLE-03) |
| ⑤ | Missing and failed | 10/15 | `missing`/`blocked`/`late`/`unknown`/"ยังไม่ยืนยัน" in last 14 days; failed/unknown sends |
| ⑥ | Production machine and updates | 10/15 | data-update status per tab, per-machine health, light check, alerts |
| ⑦ | Numbers by period | 10/15 one store; 10/25 store comparison | 7/30-day rates, counts, medians |

Common: Japanese UI; local-language text verbatim; plain-text rendering; portrait phone with no horizontal scroll; no writes; buttons only open/filter/back; **every page top shows "การอัปเดตข้อมูล"** (`source_through` and minutes ago); status colours identical everywhere (data-mapping §5.3.1); blank ≠ 0; denominator 0 → "ไม่มีรายการที่เข้าเกณฑ์".
Page-level detail on 10/12: prototype with **real data flowing** (REQ §4).

---

## 12. Deployment in the client environment

- Installed in the **client's Google** environment: client-owned account, domain and billing; one URL; portrait phone (REQ §3 #1, §7-5).
- Storage for copy, screen data, settings and resume points: client-named (REQ §7-3, §5-3).
- Source code in a client-named repository; `README.md`, install steps and recovery steps so that **one client-side person** can reinstall and recover (REQ §3 #4–#5).
- Allowlist procedure for adding/removing viewers (REQ §3 #6). `CHANGES.md`, `TEST_REPORT.md` (TV1–TV25 results with screenshots) (REQ §3 #7).
- Quotation: **one lump-sum price + monthly operation fee** (not person-months); includes source inspection, connection spec, connection process, installation, connection test, demo data, fixes for non-conformities found at acceptance; monitoring/recovery terms (Q-03); warranty, contact, monthly cap and prior-approval rule (REQ §3 #8).
- Quotation must separate unknowns: Phase 1 = Bangkok within what current records support, lump sum; Phase 2 = Nagoya 2 stores + handling missing records, separate price and schedule after investigation.
- Hosting product, framework and data store: **UNCONFIRMED (Q-01, Q-08)**. The Next.js-style folder tree in the earlier chat draft is **not a project decision**.

---

## 13. Acceptance tests TV1–TV25 (REQ §8)

The client decides pass/fail on real items; TV2 and TV13 and any test that changes data run on **test sheets**. Types: **A** = Phase 1, real data. **B** = Phase 1, test data (display only; does not mean the real function is complete). **C** = Phase 2, real data. If, within TV9's 3 days, relevant events (questions, Bot replies…) do not occur naturally, record "ยังไม่ยืนยันในการใช้งานจริง" and report separately from test-data results.

| # | Test | Pass criteria | Type |
|---|---|---|---|
| TV1 | Compare 7 days of registry with screen figures | patrol status, question count, response rate, message count all match | A |
| TV2 | Add a row / change `status` in test sheet | shown within 5 min; no writes from screen | B |
| TV3 | Open with an account not on the list; open right after revocation | neither receives data (server-side denial) | A |
| TV4 | Open ② on portrait phone | status and reason readable with no horizontal scroll; shown within 3 s | A |
| TV5 | Add a store in `stores` | appears without code change | B |
| TV6 | Open ① on portrait phone | today's status of 3 stores on one screen, matches registry | A (Nagoya shows "ยังไม่เชื่อมต่อ") |
| TV7 | Delete all screen cache | rebuilds from registry and shows the same | A |
| TV8 | Open ③ for one day (200 rows) | local-language text matches registry character for character; Bot replies right under the source message | A |
| TV9 | Real new records (message, question, Bot reply) through PIATEC's process to screen | 3 consecutive days, shown within 10 min, client does no work, 0 writes to Source, no effect on monitoring or sending | A |
| TV10 | Completed-without-question / stopped / not run / running / result unknown | 5 statuses displayed differently; schedule without row → "ยังไม่ยืนยัน" | B |
| TV11 | One message with 2 replies / 3 messages with 1 reply / message carried to next patrol | matches registry; only confirmed-sent replies count as "ตอบแล้ว" | B |
| TV12 | Rebuild registry having answered questions; question answered fully with no number in the reply; question closed with no reply | state does not revert to waiting; shows answered; no-reply case excluded from response rate | B (real data = C) |
| TV13 | `meta=error` / `generated_at` 1 h old / share revoked / required column deleted / `answers_json` corrupt | shows "หยุดอัปเดต" with last success time; no stale green or 0 looks normal; corrupt row shows "อ่านไม่ได้" | B |
| TV14 | Stop production heartbeat, standby alive; view at 10:00 / 10:20 / 01:00 | production red; light check not red at 10:00, red at 10:20 if not running, "นอกเวลา" at 01:00 | B |
| TV15 | Maru and Takatsuji open on phones with real accounts; put `<script>`-like text in registry | both can view; text shown verbatim as characters | A |
| TV16 | Phone set to Japan time / Thai time; open "today" for 3 stores incl. day rollover | same business day and content for both; store without patrols shows "ไม่อยู่ในขอบเขต" | A = Bangkok; C = Nagoya |
| TV17 | 30 days at real volume and double; mixed dummy rows; empty and question-less periods | shown within 3 s; dummy excluded; "ไม่มีรายการที่เข้าเกณฑ์"/"ยังไม่ได้ดึงข้อมูล" per rules | A・B |
| TV18 | PIATEC installs and demonstrates recovery: copy deleted, read permission re-granted, screen fault | recovered without Maru acting; named owner and contact in writing | A |
| TV19 | Deliberately stop the connection process / fail midway / run twice in a row | within 20 min screen "หยุดอัปเดต" and Takatsuji notified once; resumes from the point; no duplicate or missing rows | A |
| TV20 | Compare screen directly with Source (`ログ`・`送信ログ`・`AI質問追跡`) for 7 days | message count and send results match; questions/answers split into confirmed vs possibly-related per rules | A |
| TV21 | Stop only Source→Read Copy; later stages still run | does not show normal; within 20 min "หยุดอัปเดต" and notice to Takatsuji | A |
| TV22 | Same person writes about something else after the question / two messages in one minute / two open questions to one person / answer next day / renamed or same-name people | 0 wrongly confirmed links (unprovable → "อาจเกี่ยวข้อง"/"ไม่ทราบ"); candidates not in response rate; with only such data, response rate and time-to-answer "ยังไม่สรุป" | B |
| TV23 | Request accepted / not sent due to duplicate-send prevention / result unknown | 3 distinct displays; never "ถึงผู้รับแล้ว"/"อ่านแล้ว" | B (2nd display Q-20) |
| TV24 | Inspect the whole Read Copy | no unauthorized group (LINK, out-of-table), recipient, `userId`, `宛先ID`, `画像URL` or reservation tab | A |
| TV25 | Success rate before/after schedule-change day; run stuck `running` past deadline; **stop the monitoring process itself** | before-change days use the old schedule; past-deadline run = "ยืนยันผลไม่ได้"; the stop of the watcher is detected | B |

Tests are executed per phase: Phase 1 (10/15) covers pages ②–⑦ for Bangkok; the final acceptance (10/25) runs TV1–TV25 (REQ §4). Items needing Nagoya data are type C.
Evidence: `TEST_REPORT.md` with screenshots; `CHANGES.md` for history.

---

## 14. Timeline and operational constraints (REQ §4)

| Date | PIATEC | Client side |
|---|---|---|
| 10/3 | screen design; quotation (Phase 1 lump sum, Phase 2 after investigation); **answer on identity-verification method (§7-6) and monitoring/recovery terms (§3)** | approve quotation |
| 10/6 | **identity-verification prototype with real accounts**; start Source inspection and send first connection spec + missing-record list; Copy Process prototype | send Source samples (allowed groups/columns only); install Copy Process on Source side (Maru approves once) |
| 10/8 | — | Heartbeat Sheet (`beats`, `alerts`); monitoring-program changes for missing records (as agreed); Nagoya samples |
| 10/12 | prototype shown (Maru and Takatsuji on phones); **real data must be flowing** | first check (Takatsuji) |
| **10/15** | **first version complete**: pages ②–⑦ for Bangkok, installed, connected, automatic update working | acceptance |
| **10/25** | **final**: page ① (all stores) and store comparison in ⑦; Nagoya 2 stores per Phase 2 agreement | accept TV1–TV25 |
| 10/26–11/12 | **freeze** — only emergency fixes for **display stoppage or data leakage**, with Takatsuji's approval; rollback procedure and operator in writing by 10/25 | demo shown at 11/12 presentation |

Within 1 business day: client reviews/approves interpretation table, connection spec, missing-record list, confirms 17:00 start date, answers read-method questions. Dates are constraints on what the system must be able to do on each date — they are not decorative.

Operational constraints: patrol 12:00 / 17:00 / 22:00 (17:00 added October 2026, exact start date via `schedules`, **Q-16**); a patrol with no question to ask and "send nothing" is normal; patrol takes ≈ 65 min from read to send; light check every 5 min 10:00–24:00, started 10/2; daily report once per night; business day boundary from `stores`; stores can be added without code change.

---

## 15. Out of scope (REQ §9) and things this architecture must not describe as available

- Per-store manager permissions; Thai UI language; showing image bodies or image food-evaluation results (red/yellow); migrating the registry to a DB; any action from the screen (send, re-run, approve, change settings); changes to the real monitoring program/GAS/sending (client side).
- Therefore **not described as part of this system**: writing to Source, LINE sending, AI execution/judgement, production control, translation, analytics services, re-send buttons.
- Withdrawn work (9/30): error fixing, internal design improvement, Hayabusa-system migration, operation/maintenance documents are **not PIATEC scope**.

---

## 16. Reconciliation with the earlier chat architecture draft (non-binding)

The attached draft was reviewed. Items kept because REQ supports them: pipeline view; client-side install; explicit filter policy; server-side allowlist with cache not bypassing; demo separation; checkpoint/resume; TV mapping; timeline; roles.
Items **not adopted** because REQ does not support them (do not implement unless confirmed):
1. Next.js `app/` and `lib/` folder structure, specific API route folders, "jobs/", TypeScript type files — technology is **UNCONFIRMED (Q-01)**.
2. A `CapabilityStatus` enum with values `available`/`phase_2`: the four data labels are used instead; the notion of capability being data-driven per (store, function) **is** kept.
3. Dropping the 15-minute thresholds — rejected (see §7.1).
4. Extra documents (`missing-records.md`, `responsibility-matrix.md`, `timeline.md`, etc.) — their content is held in the four contract files; separate files are optional and not created.
5. Role names "Manager/Representative" — replaced by the actual roles in §2.

---

## 17. Open items

All UNCONFIRMED items are in `docs/connection-spec.md` §12 (Q-01 … Q-30). Architecture-relevant: Q-01 (authentication/hosting), Q-02 (notification channel), Q-03 (monitoring terms), Q-04 (allowlist), Q-05 (cache), Q-06 (acceptance tester), Q-07 (Phase 2), Q-08 (copy runtime and 10-minute budget).
