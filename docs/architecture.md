# docs/architecture.md — NIKUSHO AI Monitoring System: Architecture

| Item | Value |
|---|---|
| Document status | CONTRACT DRAFT v0.2 |
| Written | 2026-10-03; **updated 2026-10-07** — client architecture update: the client builds and runs the Copy Script (`docs/connection-spec.md` §0) |
| Source of Truth | `01_ข้อกำหนดหน้าจอจัดการ.md` — Requirement **2026-10-02 (draft 5)**, cited **REQ §x** |
| Supporting | `02_ตัวอย่างทะเบียน_3สาขา.xlsx` (SAMPLE-02), `03_ตัวอย่างหน้าจอ.html` (SAMPLE-03) |
| Withdrawn | All 9/30 documents (REQ §0) |
| Companions | `docs/data-mapping.md`, `docs/connection-spec.md` (holds the Q-xx register, §12), `Claude.md` |

Markers: **CONFIRMED** = stated by REQ or by the client's 2026-10-07 update. **UNCONFIRMED / ไม่ยืนยัน (Q-xx)** = silent, ambiguous or contradictory; do not decide in code, ask the client contact (Q-47). Data-level labels (CONFIRMED / CANDIDATE / UNKNOWN / NOT CONNECTED) are defined in `docs/data-mapping.md` §0.

---

## 1. What this system is

The deliverable is **not merely a 7-page frontend**. It is a **monitoring pipeline** that carries the existing monitoring system's logs to a phone screen automatically, plus the means to keep it running (REQ §0, §2, §3).

```text
Existing monitoring system (patrol program / GAS / LINE sending / AI instructions)   ← NOT changed by PIATEC
        │ writes
        ▼
ORIGINAL RECORDS (Bangkok spreadsheet, 4 tabs used)                                  ← client only; NEVER accessible to PIATEC
        │ ① Copy Script — BUILT AND RUN BY THE CLIENT (since 2026-10-07), every 5 min, permitted groups/columns only
        ▼
VIEW-ONLY COPY (client account; Data Contract v1 + copy meta; rows from 2026-09-01; 元の行番号 = row identity, updated in place)
        │ ② Transform — PIATEC (reader account, view only): verify → normalize/validate → domain logic
        ▼
DASHBOARD DATA / LEDGER (7-tab registry, client account) → CACHE
        │
        ▼
SERVER-SIDE VIEWER CHECK (authentication + allowlist) → API (read-only) → ③ 7 DASHBOARD PAGES
        ▲
MACHINE HEARTBEAT SPREADSHEET (beats, alerts; client account; reader account = view only; read as-is)

Cross-cutting: freshness monitoring · stop detection ≤20 min · alert (channel Q-02, contact Q-47) · recovery of PIATEC's parts
Separate entry: DEMO page on fixed anonymized data
Prototype hosting: parttimedashboard.vercel.app (mock/demo data only) — production goes to the client's environment (Q-01)
```

**Completion condition (REQ §2, adjusted 10/7):** logs the monitoring system already writes must flow to the screen automatically — through the client's Copy Script and PIATEC's Transform — and the client can open one URL and view every day. A screen alone, dummy data alone, or anything that still needs manual work by the client = **not accepted**. Neither phase may require Maru to work daily (confirming answers, copying data).

The system **reads and displays only**. It has no capability to change the monitoring system, send, re-run or approve (REQ §6, §7-1, §9).

---

## 2. Roles and responsibility boundary

| Role | Responsible for | Boundary |
|---|---|---|
| **PIATEC** | All of: ① ~~select/copy data from Source into Read Copy~~ — **moved to the client on 10/7**; PIATEC instead reads and verifies the View-only Copy ② convert the View-only Copy to Dashboard Data ③ automatic update Source→screen ≤10 min and detect stops ④ **inspect samples / the copy; write the connection spec and missing-record list** ⑤ 7 pages ⑥ install in the client's environment ⑦ authentication ⑧ demo data ⑨ fix non-conformities found in connection tests/acceptance ⑩ post-delivery monitoring, root-cause analysis, recovery ⑪ hand over procedures and source code (REQ §2) | No access at all to the Original Records; reads only two files with a dedicated reader account (never Maru's account); no LINE/e-mail to groups, staff, owner |
| **Client Developer** (ผู้พัฒนาฝั่งผู้ว่าจ้าง) | **Build, run and maintain the Copy Script and the View-only Copy** (since 10/7; every 5 min); give the reader account view access to exactly two files; review/approve spec and missing-record list; change the existing monitoring program only when necessary; answer read-method questions within 1 business day; confirm schedule history (done 10/7) | Only party that touches the Original Records |
| **Client Acceptance Tester** (ผู้ตรวจรับ) | Compare screen numbers with the Source; decide pass/fail | **Must not be the builder** |
| **Takatsuji** (คุณทาคัตสึจิ, coordinator) | REQ §2: collect questions, confirmations and **incident reports**; first screen check; receive connection-problem and recovery notices | REQ: everything goes to him. **10/7: the client wrote "send all questions and communications directly to me" and opened a comment page — route UNCONFIRMED (Q-47)** |
| **Maru** (คุณมารุ, client owner) | Approve quotation; first identity verification and owner-only permission approvals (incl. the reader account's access to the two files); major cost/permission/business decisions; final usability check | **Never assigned**: copying, updating, data comparison, checking, running commands, installing, daily operation, technical decisions. PIATEC never receives his password |

Escalation rule (REQ §2): a decision not covered by the REQ → stop building that part; send **two options with a recommendation** to the client contact (Q-47). Copy- or source-side defects → send **evidence** (tab, `元の行番号`, time, expected value vs actual value); the client takes over; checking is never handed back to Maru.

No other roles exist in the REQ. Per-store manager permissions are **out of scope** (REQ §9): every allowed viewer sees all stores.

---

## 3. Pipeline layers and responsibilities

| # | Layer | Responsibility | Where it lives | Status |
|---|---|---|---|---|
| L0 | Original Records | Written by the existing system; **never accessible to PIATEC** | existing spreadsheet (client) | CONFIRMED |
| L1 | Copy Script | Filter at copy time (groups, recipients, columns, sensitive fields); substitute keys `発言者キー`/`宛先キー`; masks accounting/external-group lines in owner reports; copy `meta` with two timestamps; in-place update by `元の行番号`; every 5 min | **built and run by the client** (since 10/7) | CONFIRMED (REQ §5-1; client 10/7) |
| L2 | View-only Copy | Stores the filtered copy; Data Contract v1; rows from 2026-09-01 | client account; PIATEC reader account = view | CONFIRMED (client 10/7) |
| L3 | Verify + normalization | copy verified against Data Contract v1 (forbidden fields, groups, duplicates) — tab stops on violation; copy column → Dashboard field (formats, `+07:00` timestamps, group names, `kind`, resend/cancel merge) | PIATEC build — **IMPLEMENTED** (synthetic tests): reader `server/source/sheetsReader.js`, contract check `src/adapters/copy/validate.js`, Transform `src/adapters/copy/transform.js`, adapter `src/adapters/copy/copyAdapter.js` (kind `copy`); live state NOT_CONNECTED until the reader account exists (Q-48) | CONFIRMED rules; see data-mapping §5–§6, implementation-notes §8 |
| L4 | Validation | Reject/flag malformed rows, missing required columns, broken JSON; detect sensitive fields that should never be present; schema/`contract_version` check | PIATEC build | CONFIRMED needs (TV13, TV24); copy side IMPLEMENTED in L3 (fail closed per tab); Screen Data side `src/normalize/validate.js` |
| L5 | Domain logic | Run status, question state, answer candidate, Bot-reply match, business day, schedule history, heartbeat, freshness, 7/30-day figures, Phase capability | PIATEC build | CONFIRMED rules |
| L6 | Screen Data | 7-tab registry (REQ §5-3) + `meta` freshness | client-named storage | CONFIRMED |
| L7 | Cache | Speed only; derived from Screen Data; deletable and rebuildable (TV7); **no bypass of authorization** | client environment | CONFIRMED principle; mechanism **Q-05** |
| L8 | Viewer check | Authentication then allowlist **on the server** | client environment | CONFIRMED principle; method **Q-01** |
| L9 | API | Read-only delivery of Screen Data to authorized viewers; no write operations; `GET`-style reads only | client environment | read-only is CONFIRMED (REQ §6 "ไม่เขียนข้อมูลจากหน้าจอ"); concrete endpoints/technology **UNCONFIRMED (Q-01)** — none are defined |
| L10 | UI | 7 pages; Japanese UI; portrait phone; plain-text rendering | client environment | CONFIRMED |
| X | Monitoring / alert / recovery | See §8 | client environment | CONFIRMED needs; terms **Q-02, Q-03** |

Technology: REQ says "choose as appropriate, **prioritise a structure that needs no server maintenance**" (REQ §3), install in the client's Google environment, one URL. Anything beyond this (framework, language, storage engine) is **not fixed by REQ → UNCONFIRMED (Q-01)**. Do not introduce a database: moving the registry from spreadsheet to DB is explicitly **out of scope** (REQ §9); the registry stays a spreadsheet-type store in client-named storage unless the client changes this.

Single-direction data flow with **upstream wins** (REQ §7-3): Original Records → View-only Copy → Dashboard Data → Cache. Stores are created only from the upstream layer; PIATEC-only data is forbidden (copies, screen data, settings and resume points are permitted **in client-named storage**).

---

## 4. Access restriction: the client's copy and PIATEC's reader account (changed 2026-10-07)

```text
                    CLIENT SIDE (client account, client billing)                     PIATEC
  ┌─────────────────────────────────────────────────────────────────┐
  │ ORIGINAL RECORDS ──① Copy Script (client builds & runs, 5 min)──▶ VIEW-ONLY COPY ◀─── view ── reader account ─▶ ② Transform
  │                                                                   HEARTBEAT SHEET ◀── view ──┘
  │ Maru approves the reader account's access to exactly these two files                        (never Maru's account)
  └─────────────────────────────────────────────────────────────────┘
```

- PIATEC reads **only** the View-only Copy and the Machine Heartbeat Spreadsheet, with a dedicated **reader account** (e.g. a service
  account) that has view access to exactly those two files; **no access to the Original Records, real GAS or real folders** (REQ §7-2).
  Reading with Maru's account is not allowed: it could read everything in his Google account (client 10/7).
- The reader account is separate from the dashboard login accounts (Maru's dashboard login stays as it is).
- The Copy Script (and its revisions, rollback, recovery) belongs to the client. PIATEC may review the copy against the connection spec
  and report evidence (tab, `元の行番号`), and keeps receiving fault reports for its own parts. Never hand install/recovery work to Maru (REQ §2).
- Filtering at copy time by the client: groups MEAT・IN・ALL・MANAGEMENT・PHOTO only; the five groups and `OWNER` as recipients; no `userId`,
  `宛先ID`, `画像URL`; no LINK; no other tabs (details: connection-spec §4–§5). PIATEC verifies and stops a tab that violates it.
- Reader account status: PIATEC must create it and send its e-mail to the client — **pending (Q-48)**.

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

Two kinds of account (client 10/7): **dashboard login accounts** (people; allowlist) and the **reader account** (PIATEC's process; view access to two files). They are separate and are never combined. The client observed on the prototype that no data is returned without logging in (10/7; not a TV3 pass).

---

## 6. Security boundaries

| Boundary | Rule | Source |
|---|---|---|
| Source | read-only to everyone but the existing system; PIATEC never writes or connects | REQ §2, §7-1, §7-2 |
| Original Records | never accessible to PIATEC | REQ §7-2; client 10/7 |
| View-only Copy (client) | contains only allowed groups/recipients/columns (Data Contract v1); no `userId`, `宛先ID`, `画像URL`; substitute keys only valid inside the copy; PIATEC verifies | REQ §5-1; client 10/7; TV24 |
| Reader account | view access to exactly two files; separate from login accounts; never Maru's account | client 10/7; Q-48 |
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
        ──► notify the agreed contact ONCE (REQ: Takatsuji; Q-47), notify again when recovered
```

Must also detect: the client's Copy Script stopped (Original Records → View-only Copy; seen through copy `meta`, Q-50) while later stages still run (TV21), a stage failing midway (TV19), and the **monitoring process itself stopping** (TV25). Exact notice timings/duplicate suppression/service hours/first response/recovery target: **Q-03**; channel: **Q-02**.

### 7.3 Recovery

PIATEC recovers without Maru acting. Before handover PIATEC installs, verifies the connection and demonstrates recovery from: copy deleted, read permission re-granted, screen fault (REQ §7-10, TV18). A named responsible person and contact channel in writing are required. Post-delivery: receive report → root cause → recover → confirm (REQ §2).

---

## 8. Idempotency, deduplication, checkpoint / resume

| Requirement | Detail | Source |
|---|---|---|
| Copy row identity | `元の行番号`; rows updated in place; a copied row never appears twice; rows from 2026-09-01 | client 10/7 (copy side, client's responsibility) |
| Idempotent runs | running the Transform twice in a row creates no duplicate rows (proposed: rebuild Dashboard Data from the copy each cycle) | TV19; approach Q-08/Q-23 |
| Dedup keys | copy: `元の行番号`; Dashboard: `messageId` (+ `再送`, Q-17), `question_id`, `send_id` (proposed from `元の行番号`), `run_id` | REQ §5-1, §5-3; client 10/7; Q-11 PARTIAL |
| Resume | after a mid-way failure the next run continues from the same point with no loss and no duplicate (copy: client; Transform: PIATEC) | REQ §3 #1b, TV19 |
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

- Installed in the **client's Google** environment: client-owned account, domain and billing; one URL; portrait phone (REQ §3 #1, §7-5). The client re-stated this on 10/7.
- `parttimedashboard.vercel.app` is **prototype hosting only** (mock/demo data; PIATEC-side account). It must never hold real data, and PIATEC owes the client a written confirmation of this (connection-spec §11.1 #11).
- The reader account's credentials must also live in the client's environment for production (Q-01, Q-48).
- Storage for the View-only Copy (client-built), dashboard data, settings and resume points: client-named (REQ §7-3, §5-3).
- Source code in a client-named repository; `README.md`, install steps and recovery steps so that **one client-side person** can reinstall and recover (REQ §3 #4–#5).
- Allowlist procedure for adding/removing viewers (REQ §3 #6). `CHANGES.md`, `TEST_REPORT.md` (TV1–TV25 results with screenshots) (REQ §3 #7).
- Quotation: **one lump-sum price + monthly operation fee** (not person-months); includes source inspection, connection spec, connection process, installation, connection test, demo data, fixes for non-conformities found at acceptance; monitoring/recovery terms (Q-03); warranty, contact, monthly cap and prior-approval rule (REQ §3 #8).
- Quotation must separate unknowns: Phase 1 = Bangkok within what current records support, lump sum; Phase 2 = Nagoya 2 stores + handling missing records, separate price and schedule after investigation.
- Hosting product, framework, data store and where the Transform runs: **UNCONFIRMED (Q-01, Q-08)**. The Next.js-style folder tree in the earlier chat draft is **not a project decision**.

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

After 10/7: **TV24** inspects the client's View-only Copy (PIATEC's verifier gives evidence; the client judges); **TV9** runs through the client's Copy Script and PIATEC's Transform; **TV19/TV21** detect a stopped copy through copy `meta` (`last_read_at`, `updated_at`, `status`, Q-50); **TV18** duties split between client (copy, access) and PIATEC (dashboard) — Q-53; **TV10/TV25** depend on the run-status reading the client has not yet decided (Q-49).

Tests are executed per phase: Phase 1 (10/15) covers pages ②–⑦ for Bangkok; the final acceptance (10/25) runs TV1–TV25 (REQ §4). Items needing Nagoya data are type C.
Evidence: `TEST_REPORT.md` with screenshots; `CHANGES.md` for history.

---

## 14. Timeline and operational constraints (REQ §4)

| Date | PIATEC | Client side |
|---|---|---|
| 10/3 | screen design; quotation (Phase 1 lump sum, Phase 2 after investigation); **answer on identity-verification method (§7-6) and monitoring/recovery terms (§3)** | approve quotation |
| 10/6 | **identity-verification prototype with real accounts** (done on vercel.app, prototype); start sample inspection and send first connection spec + missing-record list (**not sent**); ~~Copy Process prototype~~ (moved to the client 10/7) | send samples (done 10/5) |
| 10/5 | — | Bangkok investigation sample (09/28–10/04) received; **23:36: MEAT/IN questions/replies move to the 5-min polling loop; scheduled runs stop sending to staff** |
| **10/7** | **send the reader account e-mail (MISSING)**; confirm vercel.app = prototype (MISSING); connection spec + missing-record list v1 still owed (planned 10/6) | **client update: client builds the Copy Script**; build the View-only Copy and run it every 5 min; schedule history and `snowmaru` confirmed; give view access to the two files the day the e-mail arrives |
| 10/8 | from 10/8: connect the dashboard to the copy and show real data (needs reader access) | Heartbeat Spreadsheet (ready; access via reader account); Nagoya samples; monitoring-program changes for missing records (as agreed); fix of `AI質問追跡` for polling-loop questions (date Q-52) |
| 10/12 | prototype shown (Maru and Takatsuji on phones); **real data must be flowing** | first check (Takatsuji) |
| **10/15** | **first version complete**: pages ②–⑦ for Bangkok, installed, connected, automatic update working | acceptance |
| **10/25** | **final**: page ① (all stores) and store comparison in ⑦; Nagoya 2 stores per Phase 2 agreement | accept TV1–TV25 |
| 10/26–11/12 | **freeze** — only emergency fixes for **display stoppage or data leakage**, with Takatsuji's approval; rollback procedure and operator in writing by 10/25 | demo shown at 11/12 presentation |

Within 1 business day: client reviews/approves interpretation table, connection spec, missing-record list, answers read-method questions (17:00 start date confirmed 10/7). Dates are constraints on what the system must be able to do on each date — they are not decorative.

Operational constraints: patrols **12:00 / 22:00 from 2026-09-13 to 10-01** and **12:00 / 17:00 / 22:00 from 2026-10-02** (first 17:00 run 10/2 17:00 — CONFIRMED 10/7, Q-16 closed); daily report **00:35**; production host **`snowmaru`**; since **10/5 23:36** MEAT/IN questions and replies are sent by the **5-minute polling loop** and the scheduled runs only record reads/decisions (how to read run status: **Q-49**, client to decide); a patrol with no question to ask and "send nothing" is normal; patrol takes ≈ 65 min from read to send; light check every 5 min 10:00–24:00, started 10/2; daily report once per night; business day boundary from `stores`; stores can be added without code change.

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

All UNCONFIRMED items are in `docs/connection-spec.md` §12 (Q-01 … Q-30; status update and Q-47 … Q-53 in §12.1). Architecture-relevant: Q-01 (hosting; production in the client's environment), Q-02 (notification channel), Q-03 (monitoring terms), Q-04 (allowlist), Q-05 (cache), Q-06 (acceptance tester), Q-07 (Phase 2), Q-08 (Transform cadence; copy every 5 min is CONFIRMED), Q-47 (contact route), Q-48 (reader account), Q-49 (run-status reading), Q-53 (TV18 split).
