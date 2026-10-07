# Claude.md — Master Project Context: NIKUSHO AI Monitoring System (หน้าจอจัดการ)

> Read this file first, then `docs/data-mapping.md`, `docs/connection-spec.md`, `docs/architecture.md`.
> These files are **project contracts**, not brainstorming notes. When something is unknown, missing or contradictory: **STOP and mark it `UNCONFIRMED / ไม่ยืนยัน`. Do not guess.**

Written 2026-10-03. Contract draft v0. **Updated 2026-10-07: the client builds and runs the Copy Script; PIATEC reads only the client's View-only Copy** (`docs/connection-spec.md` §0).

---

## 1. Source of Truth

1. **Requirement 2026-10-02 (draft 5)** = `01_ข้อกำหนดหน้าจอจัดการ.md` is the highest authority. Cited as `REQ §x`.
2. Supporting context only: `02_ตัวอย่างทะเบียน_3สาขา.xlsx` (sample registry; almost entirely dummy data) and `03_ตัวอย่างหน้าจอ.html` (layout sample; REQ wins wherever they differ).
3. **All documents sent on 9/30 are withdrawn** (`エンジニアへ_現場AI巡回_20260930`, `送付一式_20260930` and 00–05). Never use them.
4. Chat drafts, earlier architecture proposals and your own ideas are **not** sources. `docs/architecture.md` §16 lists what was rejected from the earlier draft.
5. If a newer requirement version arrives, it replaces REQ; update the four contract files — do not reconcile by blending.
6. All open questions live in one register: `docs/connection-spec.md` §12 (Q-01 … Q-30, status update and Q-47 … Q-53 in §12.1). Add new questions there; do not hide them in code comments.
7. **Client architecture update 2026-10-07** (recorded in `docs/connection-spec.md` §0): where it changes REQ draft 5 (who builds the copy, Data Contract v1, schedule history), it wins. Client *statements of intent* (e.g. "we will decide how to read run status") are **not** rules until the client confirms them.

## 2. What this project is

NIKUSHO is a restaurant business (Bangkok 1 store; Nagoya 2 stores — Hayabusa Osu and Hayabusa Meieki; more later). An existing AI monitoring system reads staff LINE messages, asks the staff about issues, follows up on answers and reports to the owner each night.

**This project** (client: Maru; coordinator per REQ: Takatsuji — contact route after 10/7 is Q-47; contractor: **PIATEC**) delivers a **management screen that works immediately on handover** plus the **pipeline** that reads the client's **View-only Copy** of the monitoring system's logs, converts it to dashboard data, installs it, and keeps it running. It is a **monitoring pipeline**, not just a 7-page frontend. Since 10/7 the copy itself is built and run by the client.

The screen lets the owner and representative, on one phone, see **at the same time**:
1. Is the monitoring system running (patrols and daily job: running / stopped / missing)?
2. What messages came in (staff LINE messages and Bot replies)?
3. Were the Bot's questions answered?
4. Are the machines and the data updates still working?

## 3. Responsibilities of the system

- Data moves **Original Records → (client Copy Script, every 5 min) → View-only Copy → (PIATEC Transform) → Dashboard Data / Ledger → Dashboard**, automatically, **within 10 minutes** end to end.
- Detect stopped updates **within 20 minutes**: red banner + notify Takatsuji once; resume from the same point; no duplicates or gaps.
- Show only what the records prove. Anything else is "ยังไม่ยืนยัน" / "ยังไม่เชื่อมต่อ" / "ไม่อยู่ในขอบเขต".
- Be installable and recoverable in the client's environment by one client-side person.

## 4. Scope

### In scope (REQ §2–§3)
reading the client's View-only Copy and the Machine Heartbeat Spreadsheet with a dedicated reader account · verification of the copy (forbidden fields, groups, duplicates) · conversion to Dashboard Data (Transform) · automatic update · stop detection and notification · sample inspection · connection spec and missing-record list · 7 pages · installation in the client's environment · authentication with server-side allowlist · demo screen with anonymized fixed data · fixes of non-conformities found in acceptance · post-delivery monitoring, root-cause analysis, recovery · source code, README, install/recovery procedures, allowlist procedure, `CHANGES.md`, `TEST_REPORT.md` (TV1–TV25) · quotation (lump sum + monthly operation).

### Out of scope (REQ §9, §2, §0) — do not build, do not describe as available
Building, installing or running the Copy Script (client, since 10/7) · any access to the Original Records ·
Per-store manager permissions · Thai UI language · showing image bodies or image food-evaluation results · migrating the registry from spreadsheet to DB · any action from the screen (send, re-run, approve, change settings) · changes to the real monitoring program / GAS / sending (client does them) · writing to the Source · sending LINE or e-mail to groups, staff or owner · running AI · production control · error fixing / internal redesign / Hayabusa-system migration / operation docs from the withdrawn 9/30 order.

Only exception to the no-sending rule: connection-problem and recovery notices **to Takatsuji** through the single approved channel (channel itself UNCONFIRMED, Q-02).

## 5. Architecture and data pipeline

```text
ORIGINAL RECORDS (Maru's spreadsheet; tabs ログ・送信ログ・AI質問追跡・心拍; client only — NEVER accessible to PIATEC)
  → Copy Script (BUILT AND RUN BY THE CLIENT since 2026-10-07; every 5 min; permitted groups/columns only; rows from 2026-09-01;
                 row identity 元の行番号, updated in place, never twice)
  → VIEW-ONLY COPY (client account; Data Contract v1 + copy meta; PIATEC reader account = view only)
  → PIATEC TRANSFORM: verification / normalization / validation / domain logic
  → DASHBOARD DATA / LEDGER = registry of 7 tabs: meta・stores・schedules・ทะเบียนรอบตรวจ・ทะเบียนคำถาม・บันทึกการส่ง・ทะเบียนข้อความ (client account)
  → CACHE (speed only, derived)
  → SERVER-SIDE VIEWER CHECK (authentication → allowlist) → read-only API → 7 PAGES
MACHINE HEARTBEAT SPREADSHEET (beats・alerts; client account; PIATEC reader account = view only; read as-is) feeds pages ① and ⑥
```

- **Upstream wins**: if layers disagree, Original Records → View-only Copy → Dashboard Data → Cache, the earlier one is right. No data may exist only with PIATEC; dashboard data, settings and resume points live in **client-named storage** (REQ §7-3).
- The copy `meta` keeps `last_read_at` (Original Records last read) separate from `updated_at` (copy last written) — CONFIRMED 10/7.
- The reader account (view access to **exactly two files**: View-only Copy, Heartbeat Spreadsheet) is **separate** from the dashboard login accounts; never read with Maru's account. Reader account identity: PIATEC must send it (Q-48).
- `parttimedashboard.vercel.app` is **prototype hosting only**; production runs in the client's environment (account, billing) — REQ §3-1, §7-5.
- Technology is open (REQ: pick what fits; prefer **no server maintenance**; install in the client's Google environment; one URL) — specific stack = **UNCONFIRMED (Q-01)**. Do not add a database, queue, service or API that the REQ does not call for.

Full detail: `docs/architecture.md`, `docs/connection-spec.md`.

## 6. Roles and responsibility boundary

| Role | Does | Never |
|---|---|---|
| **PIATEC** | builds everything in §4 (Transform, dashboard data, pages, auth, demo); reads only the View-only Copy and the Heartbeat Spreadsheet with the reader account; inspects samples; monitors and recovers its parts after handover | open/read/write the Original Records; read with Maru's account; build or run the Copy Script; send to groups/staff/owner |
| **Client (Client Developer / Maru's side)** | **builds, runs and maintains the Copy Script and the View-only Copy** (since 10/7); grants the reader account view access to the two files; approves spec; changes the monitoring program only if needed; answers read-method questions in 1 business day; announces source-side changes | — |
| **Client Acceptance Tester** | decides pass/fail by comparing screen to the records | must not be the builder |
| **Takatsuji** | REQ §2: single contact (questions, confirmations, incident reports, first check, connection/recovery notices). **After the client's 10/7 message ("send all questions directly to me"; questions as `@claude` comments on the 10/7 page) the contact route is UNCONFIRMED (Q-47)** | — |
| **Maru** | approves quotation; first identity verification and owner-only permission approvals (incl. the reader account's access to the two files); major cost/permission/business decisions; final usability check | **never** assigned copying, updating, data comparison, checking, running commands, installing, daily operation or technical decisions; **never contacted directly**; PIATEC never holds his password |

Escalation: a matter not in the REQ → stop that part, send **two options + recommendation** to the client contact (Q-47). Copy/source-side defects → send **evidence** (tab, `元の行番号`, time, expected vs actual); the client takes over. Questions are unlimited; do not build while not understanding.

## 7. Security rules

1. **Never in the View-only Copy** (the client's Copy Script filters at copy time; PIATEC verifies and stops a tab that violates it): `userId`, `宛先ID`, `画像URL` (and images); group LINK (`4846a3`) and any group outside MEAT・IN・ALL・MANAGEMENT・PHOTO; recipients other than the five groups and the owner (`宛先の群` = `OWNER`); other tabs (e.g. reservations). `発言者キー` / `宛先キー` are substitute keys valid only inside the copy (same person → same key); PIATEC never displays them or sends them anywhere. Owner-report lines quoting the accounting group or external groups arrive masked. Hiding on screen is not enough.
2. **Allowed groups only**: MEAT, IN, ALL, MANAGEMENT, PHOTO (by last 6 chars of `グループID`: `2c54ac`=MEAT, `c894fd`=IN, `47247d`=ALL, `15c2bf`=MANAGEMENT, `49fcce`=PHOTO; the client's copy already resolves this into `群`). `OWNER` is a **recipient classification** for sends (`宛先の群`), not a group.
3. Registry text (staff names, Thai/Burmese text) **never goes to external services** (translation API, analytics, AI input).
4. Render registry text **as characters**; never execute HTML/script.
5. **Server-side viewer check**: no data to anyone not on the allowlist or not verifiable. Revoked users must see nothing, **including from cache**. Authentication (who) and Authorization (allowed?) are separate checks, in that order.
6. Screen performs **no writes**; buttons are only open / filter / back.
7. Tests that change data use **test sheets only**; never edit the real Source, real copy or real screen data.
8. Work in the client's environment (account, domain, billing); vercel.app is prototype hosting only. Never ask for or store Maru's password; never read data with Maru's account.
9. Using the client/store/screen as a reference requires asking first.
10. Demo is separate (§11).
11. **PIATEC never accesses the Original Records.** It reads only two files (View-only Copy, Machine Heartbeat Spreadsheet) with a dedicated reader account that is separate from dashboard login accounts.

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
- Source meaning not understood → "ยังไม่ยืนยัน", ask the client contact (Q-47). A required column that is not identified (see connection-spec §6, §10) stays UNCONFIRMED.
- **Confirmed operating facts (client 10/7)**: patrols **12:00, 22:00** from 2026-09-13 to 10-01 and **12:00, 17:00, 22:00** from 2026-10-02 (first 17:00 run 10/2 17:00); daily report **00:35**; production host **`snowmaru`**.
- **Changed source behaviour (client 10/7)**: since **2026-10-05 23:36** MEAT/IN questions and replies are sent by the **5-minute polling loop**; the 12:00/17:00/22:00 runs only record reads and decisions and send nothing to staff; `AI質問追跡` has **no new rows since 10/6** (client fixing); `心拍.結果` shows values such as **`AI=scheduled-off`**. **How to read run status is not decided by the client yet (Q-49) — do not derive any rule from `AI=scheduled-off`.**

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

**Constants** (keep as single named constants): Source→screen **10 min**; stop detection **20 min**; banner stale **20 min**; production heartbeat red **15 min**; light check red **15 min** (counted from the later of last run and today's window start); test-sheet change visible **5 min**; machine writes a `beats` row every **5 min**; client copy refresh every **5 min** (client 10/7); failure window **14 days**; alerts shown **20**. The 15-minute machine thresholds are REQ-mandated and are **not** the same as the 20-minute update threshold.

## 11. Demo rules (REQ §7-12)

Production screen has real names and real text → never project it. Demo = **separate entry**, same screens, **fixed anonymized data** (same columns; PIATEC masks names; client reviews and approves content), "สาธิต" shown at the top at all times. **No button or automatic switching** between production and demo. Demo never reads production data.

## 12. Testing and acceptance

- Acceptance = **TV1–TV25** (`docs/architecture.md` §13). Types: **A** real data (Phase 1), **B** test data (display only — does not prove the real function), **C** real data Phase 2.
- Client decides pass/fail on the real item (TV2, TV13 and any data-changing test use test sheets). The judge must not be the builder.
- TV9: 3 consecutive days of real records shown within 10 min, no client work, 0 writes to Source. If events do not occur naturally record "ยังไม่ยืนยันในการใช้งานจริง" and report separately.
- Key gates: TV3 (no data to unlisted/revoked, even via cache) · TV19/TV21 (stop detected ≤20 min, notify once, resume without dupes/gaps) · TV22 (0 wrongly confirmed links) · TV24 (nothing forbidden in the client's View-only Copy; PIATEC's verifier + client judgement) · TV18 (recovery without Maru).
- Evidence: `TEST_REPORT.md` with screenshots; `CHANGES.md`.

## 13. Documentation requirements

Deliverables: all source code in a client-named repository; `README.md`; install steps; recovery steps (one client-side person can reinstall and recover); allowlist add/remove procedure; `CHANGES.md`; `TEST_REPORT.md`; connection spec and missing-record list (client reviews/approves); quotation with the per-function table "Phase 1 usable / shown up to unconfirmed / complete in Phase 2" (with cost, schedule, required client changes). Keep the four contract files and the Q register current; every behaviour change updates the contract first.

## 14. Development order (derived from REQ dependencies and dates; not a REQ clause)

Status as of 2026-10-07 (PASS / IMPLEMENTED / PARTIAL / UNCONFIRMED / BLOCKED / MISSING; IMPLEMENTED = code + synthetic tests, never real data):

1. Resolve/record blocking questions — **PARTIAL**: Q-10, Q-11 (copy), Q-13, Q-16 answered 10/7; Q-01, Q-02, Q-03, Q-15/Q-49 open; new Q-47 … Q-53.
2. Identity-verification prototype with real accounts — **PARTIAL**: Google sign-in + server-side allowlist prototype running on vercel.app (prototype hosting); client observed no data without login; TV3/TV15 not passed.
3. Sample inspection → connection spec v1 + missing-record list v1 (planned 10/6) — sample analysed (implementation-notes §6); **spec/list not yet sent: MISSING**.
4. ~~Copy Process prototype~~ — **moved to the client on 10/7** (client builds and runs the Copy Script). PIATEC's old prototype v0.1.0 is superseded.
5. **Reader account** for the two files: create it and send its e-mail to the client — **MISSING (PIATEC action, Q-48)**; blocks real data.
6. View-only Copy → Dashboard Data Transform — **IMPLEMENTED on synthetic data** (`NIKUSHO_LIVE_ADAPTER=copy`: Data Contract v1 in `src/contract/copyContract.js`, contract check / Transform / adapter in `src/adapters/copy/`, reader + configuration in `server/source/`; `ログ`/`送信ログ` connected, `AI質問追跡` PARTIAL (Q-52), run status BLOCKED (Q-49), heartbeat as a separate source). Live state today: **NOT_CONNECTED** until 5 is done. Details: `docs/implementation-notes.md` §8.
7. Domain logic (status, questions, candidates, Bot-reply matching, business day, schedules, heartbeat, freshness, metrics) — **PARTIAL** (built on mock data; run-status reading BLOCKED by Q-49).
8. Server-side authorization, read-only API — **PARTIAL** (prototype); cache — not built (Q-05).
9. Pages ②–⑥ → ⑦ (single store) with **real data** — **BLOCKED** by 5 (REQ target: real data flowing by 10/12; deliver 10/15).
10. Page ① and store comparison; Nagoya "ยังไม่เชื่อมต่อ" (10/25); Phase 2 only after agreement (Nagoya samples 10/8).
11. Monitoring/alerting/recovery (channel Q-02, route Q-47); recovery drill (Q-53); demo entry and data; TV1–TV25; production install in the client's environment (Q-01); freeze 10/26–11/12 (emergency fixes only: display stoppage or data leakage, approval, written rollback).

## 15. Critical DO NOT rules

1. **DO NOT guess.** Unknown → `UNCONFIRMED / ไม่ยืนยัน`, add to the Q register, ask the client contact (Q-47) with two options + recommendation.
2. DO NOT open, read or write the Original Records, touch the existing monitoring system or the client's Copy Script, access GAS/real folders, read with Maru's account, or run/re-send/approve anything.
3. DO NOT send LINE or e-mail to groups, staff or owner (only connection/recovery notices via the agreed channel, Q-02/Q-47).
4. DO NOT carry `userId`, `宛先ID`, `画像URL`, LINK or out-of-table groups/recipients/tabs, `グループID` or substitute keys into dashboard data or the screen; DO NOT send registry text to external services.
5. DO NOT count a candidate answer as an answer; DO NOT show 0% where there is no confirmation record; DO NOT use `acked`/`answered`/`closed` without evidence.
6. DO NOT infer Bot-reply or answer links from text similarity; DO NOT confirm a Bot reply unless exactly one message matches.
7. DO NOT say "delivered" or "read" — `sent` means LINE accepted the request.
8. DO NOT treat blank as 0, or make stale numbers look normal.
9. DO NOT use the viewer's time zone for "today"; DO NOT hard-code store names, times or the 17:00 start date.
10. DO NOT let a revoked user see data (including cache); DO NOT hide a screen instead of denying on the server.
11. DO NOT let a standby machine stand in for the production machine.
12. DO NOT assign work to Maru; DO NOT ask for his password. (Contact route after the client's 10/7 message: Q-47.)
13. DO NOT add features, roles, permissions, databases, APIs, services, UI languages or buttons beyond the REQ.
14. DO NOT mix production and demo, or add a switch between them; DO NOT project the production screen.
15. DO NOT alter real data for tests; DO NOT include `DUMMY-`/`dummy-` rows in real summaries.
16. DO NOT claim any column, record or state exists unless a contract file marks it CONFIRMED. Samples (SAMPLE-02/03, sample data 2026-10-05) do not define the real copy.
    DO NOT relax the copy contract check to "let data through": a violation blocks the tab; PIATEC never filters or strips the client's copy.
17. DO NOT make changes during the 10/26–11/12 freeze except emergency display-stoppage / data-leakage fixes with approval and written rollback.
18. DO NOT use the withdrawn 9/30 documents.
19. DO NOT turn client statements of intent into rules (run-status reading, `AI=scheduled-off`, the `AI質問追跡` fix) until the client confirms them.
20. DO NOT install production on PIATEC's or a developer's account; vercel.app is prototype hosting only.
