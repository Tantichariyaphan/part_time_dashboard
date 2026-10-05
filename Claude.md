# Claude.md — Master Project Context: NIKUSHO AI Monitoring System (หน้าจอจัดการ)

> Read this file first, then `docs/data-mapping.md`, `docs/connection-spec.md`, `docs/architecture.md`.
> These files are **project contracts**, not brainstorming notes. When something is unknown, missing or contradictory: **STOP and mark it `UNCONFIRMED / ไม่ยืนยัน`. Do not guess.**

Written 2026-10-03. Contract draft v0.

---

## 1. Source of Truth

1. **Requirement 2026-10-02 (draft 5)** = `01_ข้อกำหนดหน้าจอจัดการ.md` is the highest authority. Cited as `REQ §x`.
2. Supporting context only: `02_ตัวอย่างทะเบียน_3สาขา.xlsx` (sample registry; almost entirely dummy data) and `03_ตัวอย่างหน้าจอ.html` (layout sample; REQ wins wherever they differ).
3. **All documents sent on 9/30 are withdrawn** (`エンジニアへ_現場AI巡回_20260930`, `送付一式_20260930` and 00–05). Never use them.
4. Chat drafts, earlier architecture proposals and your own ideas are **not** sources. `docs/architecture.md` §16 lists what was rejected from the earlier draft.
5. If a newer requirement version arrives, it replaces REQ; update the four contract files — do not reconcile by blending.
6. All open questions live in one register: `docs/connection-spec.md` §12 (Q-01 … Q-30). Add new questions there; do not hide them in code comments.

## 2. What this project is

NIKUSHO is a restaurant business (Bangkok 1 store; Nagoya 2 stores — Hayabusa Osu and Hayabusa Meieki; more later). An existing AI monitoring system reads staff LINE messages, asks the staff about issues, follows up on answers and reports to the owner each night.

**This project** (client: Maru; coordinator: Takatsuji; contractor: **PIATEC**) delivers a **management screen that works immediately on handover** plus the **pipeline** that reads the monitoring system's existing logs, converts them to screen data, installs it, and keeps it running. It is a **monitoring pipeline**, not just a 7-page frontend.

The screen lets the owner and representative, on one phone, see **at the same time**:
1. Is the monitoring system running (patrols and daily job: running / stopped / missing)?
2. What messages came in (staff LINE messages and Bot replies)?
3. Were the Bot's questions answered?
4. Are the machines and the data updates still working?

## 3. Responsibilities of the system

- Continuously move necessary data **Source → Read Copy → Screen Data → Dashboard**, automatically, **within 10 minutes** end to end.
- Detect stopped updates **within 20 minutes**: red banner + notify Takatsuji once; resume from the same point; no duplicates or gaps.
- Show only what the records prove. Anything else is "ยังไม่ยืนยัน" / "ยังไม่เชื่อมต่อ" / "ไม่อยู่ในขอบเขต".
- Be installable and recoverable in the client's environment by one client-side person.

## 4. Scope

### In scope (REQ §2–§3)
Copy Process (built by PIATEC, installed by Client Developer) · Read Copy · conversion to Screen Data · automatic update · stop detection and notification · Source inspection · connection spec and missing-record list · 7 pages · installation in the client's environment · authentication with server-side allowlist · demo screen with anonymized fixed data · fixes of non-conformities found in acceptance · post-delivery monitoring, root-cause analysis, recovery · source code, README, install/recovery procedures, allowlist procedure, `CHANGES.md`, `TEST_REPORT.md` (TV1–TV25) · quotation (lump sum + monthly operation).

### Out of scope (REQ §9, §2, §0) — do not build, do not describe as available
Per-store manager permissions · Thai UI language · showing image bodies or image food-evaluation results · migrating the registry from spreadsheet to DB · any action from the screen (send, re-run, approve, change settings) · changes to the real monitoring program / GAS / sending (client does them) · writing to the Source · sending LINE or e-mail to groups, staff or owner · running AI · production control · error fixing / internal redesign / Hayabusa-system migration / operation docs from the withdrawn 9/30 order.

Only exception to the no-sending rule: connection-problem and recovery notices **to Takatsuji** through the single approved channel (channel itself UNCONFIRMED, Q-02).

## 5. Architecture and data pipeline

```text
SOURCE (existing spreadsheet; tabs ログ・送信ログ・AI質問追跡・心拍; PIATEC cannot access)
  → Copy Process (built by PIATEC; INSTALLED on Source side by Client Developer; Maru approves once)
  → READ COPY (filtered at copy time; client-named storage)
  → normalization / validation / domain logic (PIATEC)
  → SCREEN DATA = registry of 7 tabs: meta・stores・schedules・ทะเบียนรอบตรวจ・ทะเบียนคำถาม・บันทึกการส่ง・ทะเบียนข้อความ
  → CACHE (speed only, derived)
  → SERVER-SIDE VIEWER CHECK (authentication → allowlist) → read-only API → 7 PAGES
HEARTBEAT SHEET (tabs beats・alerts; prepared by client; read as-is) feeds pages ① and ⑥
```

- **Upstream wins**: if layers disagree, Source → Read Copy → Screen Data → Cache, the earlier one is right. No data may exist only with PIATEC; copies, screen data, settings and resume points live in **client-named storage** (REQ §7-3).
- Read Copy keeps "last time the Source read completed" separate from "copy updated time".
- Technology is open (REQ: pick what fits; prefer **no server maintenance**; install in the client's Google environment; one URL) — specific stack = **UNCONFIRMED (Q-01)**. Do not add a database, queue, service or API that the REQ does not call for.

Full detail: `docs/architecture.md`, `docs/connection-spec.md`.

## 6. Roles and responsibility boundary

| Role | Does | Never |
|---|---|---|
| **PIATEC** | builds everything in §4; inspects Source samples; monitors and recovers after handover | access/write the Source; send to groups/staff/owner |
| **Client Developer** | installs the Copy Process (and revisions) on the Source side; approves spec; changes the monitoring program only if needed; answers read-method questions in 1 business day | — |
| **Client Acceptance Tester** | decides pass/fail by comparing screen to Source | must not be the builder |
| **Takatsuji** | single contact: questions, confirmations, **incident reports**, first check, receives connection/recovery notices | — |
| **Maru** | approves quotation; first identity verification and owner-only permission approvals; one-time approval of the Copy Process; major cost/permission/business decisions; final usability check | **never** assigned copying, updating, data comparison, checking, running commands, installing, daily operation or technical decisions; **never contacted directly**; PIATEC never holds his password |

Escalation: a matter not in the REQ → stop that part, send **two options + recommendation** to Takatsuji. Source-side defects → send **evidence** (tab, row, time, expected vs actual) to Takatsuji; Client Developer takes over. Questions to Takatsuji are unlimited; do not build while not understanding.

## 7. Security rules

1. **Never copy to Read Copy**: `userId`, `宛先ID`, `画像URL` (and images); group LINK (`4846a3`) and any group outside the table; recipients other than the five groups and owner/representative; other tabs (e.g. reservations). Filter **at copy time**; hiding on screen is not enough. Use surrogate keys inside the copy if an ID is needed.
2. **Allowed groups only** (by last 6 chars of `グループID`): `2c54ac`=MEAT, `c894fd`=IN, `47247d`=ALL, `15c2bf`=MANAGEMENT, `49fcce`=PHOTO.
3. Registry text (staff names, Thai/Burmese text) **never goes to external services** (translation API, analytics, AI input).
4. Render registry text **as characters**; never execute HTML/script.
5. **Server-side viewer check**: no data to anyone not on the allowlist or not verifiable. Revoked users must see nothing, **including from cache**. Authentication (who) and Authorization (allowed?) are separate checks, in that order.
6. Screen performs **no writes**; buttons are only open / filter / back.
7. Tests that change data use **test sheets only**; never edit the real Source, real copy or real screen data.
8. Work in the client's environment (account, domain, billing). Never ask for or store Maru's password.
9. Using the client/store/screen as a reference requires asking first.
10. Demo is separate (§11).

## 8. Data interpretation rules (short form; authority = `docs/data-mapping.md`)

- **Labels**: CONFIRMED · CANDIDATE · UNKNOWN · NOT CONNECTED (data level). **UNCONFIRMED / ไม่ยืนยัน (Q-xx)** marks a missing/ambiguous *specification*.
- **Message**: row of `ログ`; same `messageId` and `再送` rows = one message; `取消` → show "ข้อความถูกยกเลิก" without content, never an answer candidate.
- **Send result**: `OK…`=`sent` (LINE accepted the request — say "ส่งแล้ว" only; **never** "ถึงผู้รับแล้ว"/"อ่านแล้ว"); `NG(…`=`failed`; stuck `ATTEMPTING_NO_RETRY`=`unknown`.
- **Question**: only questions actually sent. States `waiting`, `candidate`, `acked`, `answered`, `closed`; **`acked`/`answered`/`closed` only with evidence records — current records support only `waiting` and `candidate`**.
- **Candidate answer**: same group + same sender + after the question's send time + not cancelled → "คำตอบที่อาจเกี่ยวข้อง・ยังไม่ยืนยัน". **Never counted in response rate.** With no confirmation records show "ยังไม่สรุปอัตรายืนยัน・อาจเกี่ยวข้อง n รายการ", never 0%.
- **Bot reply ↔ message**: from `送信ログ` column 6 `HH:MM|発言者`; confirm **only when exactly one** message in the same day and recipient group matches; ≥2 → "ไม่ทราบว่าตอบข้อความใด"; empty column 6 (all data before 2026-10-02) → no link. `handling=replied` only if `result=sent` and `link=confirmed`. **Never infer links from text similarity.**
- **Run status**: `ok`, `silent_ok`, `late`, `running`, `blocked`, `missing`, `unknown`. Every scheduled run needs one row even if it did not run. `running` past deadline → `unknown`. No row after deadline → "ยังไม่ยืนยัน" (never silently dropped); before deadline "ยังไม่ถึงเวลา". A patrol that sends nothing is **normal**.
- **Blank ≠ 0**: blank = "ยังไม่ได้ดึงข้อมูล"; 0 = "0 รายการ"; denominator 0 → "ไม่มีรายการที่เข้าเกณฑ์".
- **Time**: all stored as `yyyy-MM-ddTHH:mm:ss+07:00`. "Today" = store's **business day** (`stores.timezone`, `business_day_start`) — never the viewer's time zone. Success rates use the schedule in force that day.
- **Machines**: production heartbeat = latest `beats` row with `host = stores.production_host` **and `role=production`**; a healthy standby never substitutes.
- **Dummy rows**: ids starting `DUMMY-` / `dummy-` are excluded from all real summaries.
- Display language **Japanese**; local-language text verbatim (no summarize/translate/reformat).
- Source meaning not understood → "ยังไม่ยืนยัน", ask Takatsuji. A required Source column that is not identified (see connection-spec §6, §10) stays UNCONFIRMED.

## 9. Phase boundaries (REQ §2)

| | Phase 1 (10/15・10/25) | Phase 2 (after quotation + schedule approval) |
|---|---|---|
| Bangkok: monitoring running, messages, Bot replies, machine/update health | **complete with real data** | — |
| Bangkok: answers to questions | up to **CANDIDATE** only | confirmed answers / complete / close — after missing records are added |
| Nagoya 2 stores | show **"ยังไม่เชื่อมต่อ"** correctly | real data connection |

- Phase 1 acceptance ≠ whole-system completion.
- Never hard-code store names; capability derives from configuration/records (adding a store needs no code change).
- Real 3-store data at the 11/12 presentation requires an agreed Phase 2 date (Q-07). The demo screen is separate from completed real use.
- Known missing records (REQ §5-1): evidence of "all answered/closed"; record confirming question↔answer link; record linking message to Bot reply by message ID; light-check operating time; machine Heartbeat Sheet (in preparation); Nagoya 2 stores. More gaps: connection-spec §10.2.

## 10. The 7 pages and time requirements

| # | Page | Date |
|---|---|---|
| ① | All stores (home; one group per `active=yes` store) | 10/25 |
| ② | Today (today + yesterday patrols/daily; drill-down) | 10/15 |
| ③ | Messages (with Bot replies under each) | 10/15 |
| ④ | Questions and answers | 10/15 |
| ⑤ | Missing and failed (last 14 days) | 10/15 |
| ⑥ | Production machine and updates | 10/15 |
| ⑦ | Numbers by period (7/30 days; store comparison 10/25) | 10/15 / 10/25 |

Every page top shows "การอัปเดตข้อมูล" (`source_through`, minutes ago). Banner turns red "หยุดอัปเดต (สำเร็จล่าสุด hh:mm)" when `status` is `stale`/`error`, `generated_at` is older than 20 minutes, the sheet is unreadable, or a required column is missing; old numbers go grey, never "normal"/"0". Portrait phone, no horizontal scroll, page shown within 3 s.

**Constants** (keep as single named constants): Source→screen **10 min**; stop detection **20 min**; banner stale **20 min**; production heartbeat red **15 min**; light check red **15 min** (counted from the later of last run and today's window start); test-sheet change visible **5 min**; machine writes a `beats` row every **5 min**; failure window **14 days**; alerts shown **20**. The 15-minute machine thresholds are REQ-mandated and are **not** the same as the 20-minute update threshold.

## 11. Demo rules (REQ §7-12)

Production screen has real names and real text → never project it. Demo = **separate entry**, same screens, **fixed anonymized data** (same columns; PIATEC masks names; client reviews and approves content), "สาธิต" shown at the top at all times. **No button or automatic switching** between production and demo. Demo never reads production data.

## 12. Testing and acceptance

- Acceptance = **TV1–TV25** (`docs/architecture.md` §13). Types: **A** real data (Phase 1), **B** test data (display only — does not prove the real function), **C** real data Phase 2.
- Client decides pass/fail on the real item (TV2, TV13 and any data-changing test use test sheets). The judge must not be the builder.
- TV9: 3 consecutive days of real records shown within 10 min, no client work, 0 writes to Source. If events do not occur naturally record "ยังไม่ยืนยันในการใช้งานจริง" and report separately.
- Key gates: TV3 (no data to unlisted/revoked, even via cache) · TV19/TV21 (stop detected ≤20 min, notify once, resume without dupes/gaps) · TV22 (0 wrongly confirmed links) · TV24 (nothing forbidden in Read Copy) · TV18 (recovery without Maru).
- Evidence: `TEST_REPORT.md` with screenshots; `CHANGES.md`.

## 13. Documentation requirements

Deliverables: all source code in a client-named repository; `README.md`; install steps; recovery steps (one client-side person can reinstall and recover); allowlist add/remove procedure; `CHANGES.md`; `TEST_REPORT.md`; connection spec and missing-record list (client reviews/approves); quotation with the per-function table "Phase 1 usable / shown up to unconfirmed / complete in Phase 2" (with cost, schedule, required client changes). Keep the four contract files and the Q register current; every behaviour change updates the contract first.

## 14. Development order (derived from REQ dependencies and dates; not a REQ clause)

1. Resolve/record blocking questions (Q-01, Q-02, Q-03 by 10/3; Q-10…Q-16 after 10/6 samples).
2. Identity-verification prototype with real accounts (10/6) — decides hosting shape.
3. Source inspection from samples → connection spec v1 + missing-record list v1 (10/6).
4. Copy Process prototype (installed by Client Developer; TV24-style check of the copy).
5. Read Copy → Screen Data build (idempotent, checkpoint/resume, two timestamps, `meta`).
6. Domain logic (status, questions, candidates, Bot-reply matching, business day, schedules, heartbeat, freshness, metrics).
7. Server-side authorization, then read-only API, cache.
8. Pages ②–⑥ → ⑦ (single store) with **real data flowing by 10/12**; deliver 10/15.
9. Page ① and store comparison; Nagoya "ยังไม่เชื่อมต่อ" (10/25); Phase 2 connection only after agreement.
10. Monitoring/alerting/recovery; recovery drill; demo entry and data; TV1–TV25; freeze 10/26–11/12 (emergency fixes only: display stoppage or data leakage, Takatsuji's approval, written rollback).

## 15. Critical DO NOT rules

1. **DO NOT guess.** Unknown → `UNCONFIRMED / ไม่ยืนยัน`, add to the Q register, ask Takatsuji with two options + recommendation.
2. DO NOT write to the Source, touch the existing monitoring system, access GAS/real folders, or run/re-send/approve anything.
3. DO NOT send LINE or e-mail to groups, staff or owner (only connection/recovery notices to Takatsuji).
4. DO NOT copy `userId`, `宛先ID`, `画像URL`, LINK or out-of-table groups/recipients/tabs; DO NOT send registry text to external services.
5. DO NOT count a candidate answer as an answer; DO NOT show 0% where there is no confirmation record; DO NOT use `acked`/`answered`/`closed` without evidence.
6. DO NOT infer Bot-reply or answer links from text similarity; DO NOT confirm a Bot reply unless exactly one message matches.
7. DO NOT say "delivered" or "read" — `sent` means LINE accepted the request.
8. DO NOT treat blank as 0, or make stale numbers look normal.
9. DO NOT use the viewer's time zone for "today"; DO NOT hard-code store names, times or the 17:00 start date.
10. DO NOT let a revoked user see data (including cache); DO NOT hide a screen instead of denying on the server.
11. DO NOT let a standby machine stand in for the production machine.
12. DO NOT assign work to Maru or contact him directly; DO NOT ask for his password.
13. DO NOT add features, roles, permissions, databases, APIs, services, UI languages or buttons beyond the REQ.
14. DO NOT mix production and demo, or add a switch between them; DO NOT project the production screen.
15. DO NOT alter real data for tests; DO NOT include `DUMMY-`/`dummy-` rows in real summaries.
16. DO NOT claim any Source column, record or state exists unless a contract file marks it CONFIRMED. Samples (SAMPLE-02/03) do not define the real Source.
17. DO NOT make changes during the 10/26–11/12 freeze except emergency display-stoppage / data-leakage fixes with approval and written rollback.
18. DO NOT use the withdrawn 9/30 documents.
