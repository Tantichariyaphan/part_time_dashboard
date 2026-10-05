# Traceability matrix

Every implemented Screen Data field, API field, metric, status and UI state, with its source in the contract.
Source keys: **REQ** = Requirement 2026-10-02 draft 5 (§ number); **ARCH / CONN / MAP / CLAUDE** = `docs/architecture.md`, `docs/connection-spec.md`, `docs/data-mapping.md`, `Claude.md`; **Q-xx** = register in CONN §12; **Q-xx (proposed)** = proposed in `docs/implementation-notes.md`, not yet in the register.
Anything without an authoritative source is marked **UNCONFIRMED** (listed again in section 6). No requirement was created to fill a gap.

## 1. Screen Data fields (`src/contract/columns.js`)

Checked mechanically: every column below appears as a backticked token in the matching REQ §5-3 section (92/92), and every enumeration value appears in REQ.

| Tab | Columns | Source |
|-----|---------|--------|
| `meta` | tab, generated_at, last_success_at, source_through, status (ok/stale/error), detail, contract_version | REQ §5-3 "แท็บ meta"; MAP §2 |
| `stores` | store, display_name, timezone, business_day_start, slot_times, slot_deadline_min, daily_deadline_min, daily_time, text_patrol, production_host, active (yes/no) | REQ §5-3 "แท็บ stores" |
| `schedules` | store, kind (slot/daily), times, valid_from, valid_to | REQ §5-3 "แท็บ schedules" |
| `ทะเบียนรอบตรวจ` (runs) | store, run_id, kind, scheduled_at, status (7 values), reason, read_at, ai_done_at, posted_at, received_at, sent_at, input_lines, questions_sent, messages_sent, owner_items, photos_total, photos_reviewed, owner_notified (yes/no/blank), evidence, updated_at | REQ §5-3 |
| `ทะเบียนคำถาม` (questions) | store, question_id, run_id, send_id, sent_at, group, who, question_text, state (5 values), closed_reason (answered/owner/no_reply), closed_at, answers_json (message_id, at, who, text, link confirmed/candidate), updated_at | REQ §5-3 |
| `บันทึกการส่ง` (sends) | store, send_id, sent_at, kind (question/reply/daily/alert), target_kind (group/owner), target_label, text, result (sent/unknown/failed) | REQ §5-3 |
| `ทะเบียนข้อความ` (messages) | store, message_id, at, group, sender, kind (text/photo/sticker/other), text, handling (6 values), replies_json (send_id, at, by light/heavy, text, result, link confirmed/ambiguous), question_id, question_link (confirmed/candidate), run_id, updated_at | REQ §5-3 |
| `beats` | received_at, host, role (production/standby), stores, verify (PASS/FAIL), fail_items, chatgpt, drive, g_mounted, disk_free_gb, clock_offset_sec, text_patrol_at | REQ §5-3 "สัญญาณชีพเครื่อง" |
| `alerts` | at, kind (silent/recovered/fail), detail | REQ §5-3 |
| (adapter side channel) `storeConnection{store: connected\|not_connected}` | NOT in REQ §5-3 | **UNCONFIRMED / Q-29** |
| Forbidden, deliberately absent | `userId`, `宛先ID`, `画像URL`, `グループID`, any other tab | REQ §5-1, TV24 |

## 2. API fields (`server/api.js`, `src/viewmodels/pages.js`)

Envelope (all): `ok`, `entry`, `now`, `freshness{state, reasons[], sourceThrough, sourceThroughMinutesAgo, lastSuccess}`, `data` — REQ §6 common rules ("การอัปเดตข้อมูล", red bar, 20 minutes, last success time). `entry`/`now` are protocol fields (no REQ clause; needed to judge freshness against one clock — ARCH §7).

| Resource | Fields | Source |
|----------|--------|--------|
| `entry` | stores[]{store, display_name, active, connection}, entry, adapterKind | stores: REQ §6-①, §7-4; `connection`: **UNCONFIRMED / Q-29**; `entry`: REQ §7-12; `adapterKind`: dev strip only (Master Prompt, not REQ) — **UNCONFIRMED** |
| `all-stores` ① | businessDay, patrol/daily{scope, unconfirmedSchedule, items[]{at,status}}, questionsToday{state,value}, waitingQuestions, messagesToday, botRepliesToday, machine{state,host,ageMin,verify}, lightCheck{state,…}, capability{evidence,answers,scope,connection} | REQ §6-① rows 1–6, common rules (blank vs 0, out-of-scope, no row). `capability.*`: evidence labels CONFIRMED/CANDIDATE/UNKNOWN/NOT CONNECTED — CLAUDE / ARCH §9, REQ §2, §5-1 wording |
| `today` ② | days[]{label, businessDay, unconfirmedSchedule, items[]{key, run_id, kind, scheduledAt, status, derived, hasRow, reason, input_lines, questions_sent, messages_sent, owner_items, read_at, ai_done_at, sent_at, photos_total, photos_reviewed, owner_notified}}, scope | REQ §6-② (today + yesterday, newest first, field list). `derived` (deadline_passed_running, unrecognized) explains REQ §5-3 `running`→`unknown` and REQ §7-7. `key` is a UI key (no REQ) |
| `run` drill-down | run_id, messages[], questions[] | REQ §6-② ("กดรอบตรวจ… ③ แถว run_id เดียวกัน, ④ แถว run_id เดียวกัน") |
| `messages` ③ | businessDay, currentDay, availableDays[], coverage, total, botReplied, groups[], items[]{at, group, sender, kind, text, handling, repliesOk, replies[]{at, by, text, result, link, minutesAfter, send_id}, question{question_id, link}, run_id, flags{replied, problem}} | REQ §6-③ rows 1–7. `availableDays` range (14 days): **UNCONFIRMED / Q-42 (proposed)**. `atMs`, `flags` internal derivations of REQ filters ("Bot ตอบแล้ว", "ล้มเหลว・ยังไม่ยืนยัน") |
| `questions` ④ | answerEvidence, counts{all, waiting, answered, closed}, items[]{question_id, run_id, sent_at, group, who, text, state, waitHours, closed_reason, closed_at, answersOk, answers[]{message_id, at, who, text, link}, filterGroup} | REQ §6-④ (statuses, wait hours for `waiting` only, answers sorted by `at`, unreadable JSON). Filter→state mapping: **UNCONFIRMED / Q-27**. `answerEvidence`: CLAUDE/ARCH evidence labels |
| `failures` ⑤ | days (14), totals{missing, blocked, late, unknown}, items[] (run fields + store, display_name, businessDay), sendProblems[]{store, send_id, sent_at, kind, target_label, text, result}, notConnected[] | REQ §6-⑤ (14 days, five statuses incl. no-row, total on top, `result=unknown|failed` list). `notConnected` — REQ §4/§5-2 (Nagoya shown "ยังไม่เชื่อมต่อ"); mechanism Q-29 |
| `machines` ⑥ | updates[]{tab, status, last_success_at, source_through, detail, generated_at, normal}, heartbeatSheet, machines[]{host, role, stores[], ageMin, verify, fail_items, chatgpt, drive, g_mounted, disk_free_gb, clock_offset_sec, heartbeatRed, verifyRed, red, ageJudged}, lightChecks[]{store, display_name, window, state, lastRunMs, minutesAgo, silentMin}, alerts[] (20, newest first) | REQ §6-⑥. `ageJudged` (standby age never judged): **UNCONFIRMED / Q-34 (proposed)**. `generated_at`/`normal`: REQ §6 common rule (20 minutes) |
| `GET /auth/me` (Auth Prototype) | ok, mode (google/dev-loopback), authenticated, allowed, email (own address, only when signed in), realIdentity (dev only) | REQ §7-6, ARCH §5 (authentication then allowlist); no dashboard data. Route shape: **UNCONFIRMED / Q-01** |
| `GET /auth/login`, `/auth/callback`, `/auth/logout` | redirects + HttpOnly cookies only (no body data) | REQ §7-6 (Google account, server-side check), §7-5 (no password); mechanism **UNCONFIRMED / Q-01** |
| Cross-page references (2026-10-06) | `messages.items[].run{run_id, found, kind, scheduledAt, status, businessDay, onTodayPage}`, `.question{…, found, sent_at, who}`; `questions.items[].run{…}`, `.send{send_id, found, sent_at, kind, target_label, result}`, `.answers[].businessDay`; `run.run{…runRow}`, `run.sends[]`; `failures.items[].onTodayPage`, `sendProblems[].businessDay`; `machines.machines[].recent[]{received_at, verify, fail_items}`, `beatIntervalMin`, `updates[].generatedAgeMin`; run rows add `posted_at, received_at, evidence, updated_at` | REQ §6-② drill-down, §6-③ (question link), §6-⑥; keys only (data-mapping §5.4–§5.6, §7–§8). Detail views and their wording: **UNCONFIRMED / Q-24**; `posted_at`/`received_at`/`evidence` provenance **UNCONFIRMED / Q-15**; links via `run_id`/`send_id` **UNCONFIRMED / Q-21** |
| `periods` ⑦ | days (7/30), stores[]{metrics{patrolRate, dailyRate, stopped{missing, blocked, unknown}, questionsSent, responseRate{state, value, numerator, denominator, candidateCount}, timeToAnswer{state, minutes}, messages, messagesPerDay[]{day, count, coverage}, botReplies, unknownOriginReplies, scope, unconfirmedSchedule, answersUnreadable}} | REQ §6-⑦ table. `candidateCount` unit: **UNCONFIRMED / Q-33 (proposed)**. `answersUnreadable`: internal, not displayed — **UNCONFIRMED / Q-40 (proposed)** |

## 3. Metrics (`src/domain/metrics.js`)

| Metric | Implementation | Source |
|--------|----------------|--------|
| Patrol success rate | (ok+silent_ok+late) ÷ scheduled patrol runs, excluding `running`; schedule in force on each day | REQ §6-⑦ row 1; REQ §5-3 `schedules`. Exclusion of *not-due* runs: **UNCONFIRMED / Q-26, Q-32 (proposed)** |
| Daily success rate | same with `kind=daily`, separate row | REQ §6-⑦ row 2 |
| Missing / stopped / unknown | missing+no-row / blocked / unknown | REQ §6-⑦ row 3 |
| Questions sent | question rows with `sent_at` in the period | REQ §6-⑦ row 4. Period = business days of the store: **UNCONFIRMED / Q-26** |
| Response rate | questions with ≥1 `link=confirmed` ÷ questions sent; candidate excluded; 0 questions → "no qualifying items"; no confirmations → "not concluded" with candidate count, never 0% | REQ §6-⑦ row 5. TV12 "no-reply excluded": **UNCONFIRMED / Q-37 (proposed)** |
| Time to answer | median of (first confirmed answer by `at` − `sent_at`); candidates only → "not concluded" | REQ §6-⑦ row 6 |
| Message count + daily bars | message rows per business day; days the pull has not reached are gaps | REQ §6-⑦ row 7; REQ §6-③ top figures |
| Bot replies | `handling=replied` (effective) | REQ §6-⑦ row 8; REQ §5-3 `handling` |
| Replies of unknown origin | `kind=reply` sends not linked by a confirmed reply | REQ §6-⑦ row 8 last sentence |
| Today's partial-day zero ("0 so far") | shown as 0件 when the pull reached into today | REQ §6-③ ("pulled the day completely"): **UNCONFIRMED / Q-39 (proposed)** |
| Constants | 10 / 20 / 20 / 15 / 15 minutes, 14 days, 20 alerts, 7/30 periods, 3 s | REQ §5, §6, §8 (ARCH §7.1) |

## 4. Statuses and states

| Item | Source |
|------|--------|
| Run statuses ok, silent_ok, late, running, blocked, missing, unknown | REQ §5-3, colours REQ §6 table |
| Derived `not_due`, `no_row` | REQ §6 common rule ("ยังไม่ถึงเวลา" / "ยังไม่ยืนยัน" dark red) |
| Hues: ok #2e8b57, silent #9ccfb2, late #d9a400, grey #9a9892, blocked #c8372d, missing #8f1d16 | SAMPLE-03 CSS variables (REQ §6 defers to the sample for colour) |
| Hue for `unknown` (#8a6a00, "dark yellow") | **UNCONFIRMED / Q-24** — no hex in REQ or SAMPLE-03 |
| Question states and colours (waiting red, candidate/acked yellow, answered green, closed grey) | REQ §6-④ |
| Handling marks (pending, carried, failed red, unknown, not_needed blank) | REQ §6-③ |
| Send results: sent / unknown / failed wording ("送信済み" not "届いた") | REQ §5-1, §6-③, TV23. Duplicate-prevention display: **UNCONFIRMED / Q-20** |
| Evidence labels CONFIRMED / CANDIDATE / UNKNOWN / NOT CONNECTED | CLAUDE, ARCH §9 (project vocabulary); REQ §5-1 ("อาจเกี่ยวข้อง", "ยังไม่ยืนยัน") |
| Machine states ok / red / unknown / not_connected | REQ §6-①, §6-⑥ (15 min, verify FAIL, host+role); `unknown`/`not_connected` = REQ §7-7 and Heartbeat Sheet "กำลังเตรียม" (REQ §5-1) |
| Light check ok / red / off hours / out of scope / not connected / unknown | REQ §6-⑥ (15 min from the later of last run and window start; 'นอกเวลา'; 'ไม่อยู่ในขอบเขต') |

## 5. UI states

| State | Source |
|-------|--------|
| Red "stopped (last success hh:mm)" banner, grey + "as of" tags, never "0" | REQ §6 common rules; TV13 |
| Freshness line "source_through + minutes ago" on every page | REQ §6 common rules |
| NOT CONNECTED (store / Heartbeat Sheet) | REQ §4 (10/25), §5-2, §5-1 |
| UNKNOWN / "ยังไม่ยืนยัน" | REQ §7-7, §6 common rules |
| Out of scope ("ไม่อยู่ในขอบเขต") | REQ §6 common rules, TV16 |
| Not pulled vs 0 vs "no qualifying items" | REQ §6 common rules, §6-③, §6-⑦ |
| Unreadable answers / replies | REQ §6-④, TV13 |
| Demo strip "สาธิต", separate entry, no switch | REQ §7-12 |
| Read-only: buttons only open / filter / back | REQ §6 common rules, §7-1 |
| Sign-in / access-denied panels, signed-in line + logout (Auth Prototype) | REQ §7-6 (deny on the server; screens only explain) — wording **UNCONFIRMED / Q-24**. Real-account evidence: non-allowlisted Google account `goter5555@gmail.com` successfully signed in and received “You do not have access rights. This account is not authorized to view the administration panel.” (**PASS** for this authorization check). Logout with a real Google account, revocation without logout, and direct API access after revocation are not yet verified. |
| Loading / generic error / forbidden states | No REQ clause (implementation necessity; wording Q-24) — **UNCONFIRMED / Q-24** |
| "DEV MOCK" strip | Master Development Prompt only; to be removed with the mock adapter — **UNCONFIRMED** |
| 60 s quiet refresh (live entry) | No REQ clause (keeps "n minutes ago" honest) — **UNCONFIRMED / Q-41 (proposed)** |
| Japanese UI wording, ①–⑦ labels, legend, page titles | REQ §6 ("ภาษาญี่ปุ่น"); wording **Q-24** |

## 6. Items with no authoritative source (do not treat as requirements)

| Item | Mark |
|------|------|
| `storeConnection` / NOT CONNECTED mechanism | UNCONFIRMED / Q-29 |
| `unknown` hue #8a6a00 | UNCONFIRMED / Q-24 |
| Japanese strings, loading/error/forbidden wording, legend | UNCONFIRMED / Q-24 |
| Standby machine never judged by age | UNCONFIRMED / Q-34 (proposed) |
| Not-due runs excluded from the denominator; business-day period windows | UNCONFIRMED / Q-26, Q-32 (proposed) |
| `candidateCount` unit | UNCONFIRMED / Q-33 (proposed) |
| TV12 no-reply questions vs §6-⑦ denominator | UNCONFIRMED / Q-37 (proposed) |
| TV6 "one screen" (page vs viewport) | UNCONFIRMED / Q-38 (proposed) |
| Today's "0 so far" display | UNCONFIRMED / Q-39 (proposed) |
| Corrupt `answers_json` rows inside ⑦'s denominator | UNCONFIRMED / Q-40 (proposed) |
| 60 s refresh interval | UNCONFIRMED / Q-41 (proposed) |
| ③ date picker range (14 days, borrowed from ⑤) | UNCONFIRMED / Q-42 (proposed) |
| Session lifetimes (60 min idle / 12 h), in-memory session store | UNCONFIRMED / Q-01, Q-43, Q-44 (proposed) |
| Allowlist file format and location; `sub` pin | UNCONFIRMED / Q-04, Q-45 (proposed) |
| Demo entry behind the same sign-in | UNCONFIRMED / Q-01, Q-04, Q-46 (proposed) |
| Detail views (③ message, ⑤ row, ② run extras, ⑥ 60-minute beat list) and cross-page links | UNCONFIRMED / Q-24 (no REQ wording); data only from Screen Data keys |
| `other` message kind label | UNCONFIRMED / Q-12 |
| DEV MOCK strip, `adapterKind` field | Not a REQ item; dev-only, removed with the mock |
| Required-column strictness (any missing column stops the screen) | UNCONFIRMED / Q-35 (proposed); REQ §6 says "ขาดคอลัมน์จำเป็น" without listing which columns are required |
