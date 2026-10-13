# Run-status proposal — reading `心拍.結果` (and `送信ログ`) for patrol and daily runs

Status: **DRAFT PROPOSAL by PIATEC — not approved, not implemented, not yet sent: to be revised with the live shapes first (§5 item 7).** The dashboard keeps showing every scheduled run as
"状態未判定" (`unconfirmed`) or "時刻前" (`not_due`) until the client approves an interpretation (Q-49). Nothing in this file
changes `src/`; the reading below exists only in the diagnostic `scripts/analyze-heartbeat.js`.

Basis: REQ §5-1 ("ผลรอบตรวจ・รายวัน: built from `心拍` and `送信ログ`; **PIATEC proposes the interpretation table from samples and the
client confirms it**"), REQ §5-4 #2 (client reviews within 1 business day), REQ §5-1 / §7-7 (no guessing: what the records do not
prove stays "ยังไม่ยืนยัน"), client update 2026-10-07 (connection-spec §0-14 … §0-17). Questions go to the client contact
(REQ §2: Takatsuji; route after 10/7: Q-47) with two options and a recommendation each (REQ §2).

---

## 1. Evidence used, and what is still missing

| Evidence | Period | Rows | Status |
|---|---|---|---|
| Client sample `docs/sample data_20261005/心拍.csv` + `送信ログ.csv` (git-ignored; given to PIATEC by the client on 2026-10-05; groups/columns already filtered) | 2026-09-28 10:13 – 10-04 23:13 (Bangkok wall clock, no zone in the file) | 心拍 98, 送信ログ 53 | **analysed** (§2) with `node scripts/analyze-heartbeat.js --csv … --sends … --tz Asia/Bangkok` |
| Live View-only Copy `心拍` (rows from 2026-09-01, 720 rows at the 2026-10-13 ≈14:00 `check:sources` run) | 2026-09-01 – 2026-10-13, **including everything after the 10/5 23:36 change** | 722 | **summary only** (run 2026-10-13 on PIATEC's laptop): **24** `stop`-class rows, **239** rows of class `other`, **130** unparsed segments. Shapes, hour × class and per-slot readings of the live run have not been recorded yet (§5 item 7) |

The sample ends **before** the client's 2026-10-05 23:36 change (questions and replies moved to the 5-minute polling loop;
the scheduled runs "only record their reads and decisions"). Every reading in §3 is therefore evidenced for the period up to
10/5 only. For later rows the live run is required, and §3 already marks what cannot be read after the change.

## 2. Observed values (client sample, 98 rows)

`結果` is ` / `-separated `key=value` segments. Counts below are from the script (digits shown as `#`, free text as `<text>`).

| Shape of `結果` | Rows | Class |
|---|---|---|
| `AI=scheduled-off / 未分析=M#/I#(AI無) / MEAT=無言 / IN=無言` | 74 | `scheduled_off` |
| `AI=scheduled-off / 未分析=M#/I#(AI無) / 規則影#件(送らない) / MEAT=無言 / IN=無言` | 7 | `scheduled_off` |
| `AI=max-read #件 / 未分析=M#/I# / MEAT=無言 / IN=無言` | 7 | `ai_result` |
| `AI=max-read #件 / 未分析=M#/I# / MEAT=AIOK / IN=AIOK` | 3 | `ai_result` |
| `AI=max-read #件 / 未分析=M#/I# / MEAT=AIOK / IN=無言` | 3 | `ai_result` |
| `AI=<text> / STOP=analysis-unverified / owner=pc-confirmed` (3 different free-text sentences) | 4 | `stop` |

Other facts from the same 98 rows:

- **Cadence:** every row is written at minute **:13**, hourly from **10:13 to 23:13** (14 rows a day); interval 56–65 min for 91
  rows; the 6 gaps over 70 min are all 23:13 → 10:13 (overnight). `gap分` is 59–61 except blank on each day's first row (7).
- **Hour × class:** `scheduled_off` only at hours 10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 22 (and 18 before 10/2).
  `ai_result` and `stop` only at **13:13, 23:13** (and **18:13 from 2026-10-02**). These are the slot times 12:00 / 22:00
  (17:00 from 10/2, client-confirmed schedule history, connection-spec §0-12) **+ 73 minutes**. REQ §5-3 states a patrol takes
  about 65 minutes from read to send.
- **One result row per scheduled slot:** 17 scheduled slots in 9/28–10/4 (4 days × 2 + 3 days × 3); 17 `ai_result`/`stop` rows,
  exactly one in each slot window; none outside.
- **Send columns agree with `送信ログ`:** `送信MEAT=送` (6 rows) and `送信IN=送` (3 rows) each have a non-reply `送信ログ` row to
  that group within 2 minutes; `無言` (88 MEAT / 91 IN rows) never has one. `stop` rows have `-` in both columns.
- **STOP rows:** all four have an `OWNER` send 8–19 minutes earlier in `送信ログ` (observation only; not used below).
- **Daily 00:35:** an `OWNER` (and an `ALL`) `OK` send 6–8 minutes after 00:35 on 5 of the 6 observable business days;
  for business day 2026-09-29 there is none in the 60-minute window (the next `OWNER`/`ALL` sends are at 09:16).
- `心拍` has **no row between 23:13 and 10:13**, so it carries nothing about the 00:35 daily report.
- `AI=max-read N件` has N = 0–3 in the sample; its meaning is unknown and is not used.

## 3. Proposed interpretation table

**Machine health is not part of this table.** Machine health = the Machine Heartbeat Spreadsheet (`beats` of the production host
`snowmaru`, `role=production` only; `alerts`) on ① and ⑥ (REQ §6-①, §6-⑥). It never decides a run status, and standby-machine rows
are never used for anything here. `心拍` is the client GAS's hourly check, not a machine heartbeat.

Window of a scheduled patrol at time T (schedule in force that day, `schedules`): `心拍` rows with `時刻` in **(T, T + `slot_deadline_min`]**
(`slot_deadline_min` = 90, provisional). "Result row" = a row in the window whose class is not `scheduled_off` and not blank.

| # | Evidence in the window (patrol, up to 2026-10-05 23:36) | Proposed `status` | `reason` | Confidence |
|---|---|---|---|---|
| P1 | exactly one `ai_result` row; `送信MEAT` or `送信IN` = `送` | `ok` (完了・質問あり) | — | sample: 6/6 consistent with `送信ログ` |
| P2 | exactly one `ai_result` row; both `無言` | `silent_ok` (完了・質問なし) | — | sample: 7 rows |
| P3 | exactly one `stop` row | `blocked` (停止) | the `STOP=` code only (e.g. `analysis-unverified`), never the free text | sample: 4 rows; meaning of the code: client |
| P4 | two or more result rows, an `other` row (free-text `AI=` without `STOP=`), or send columns not in {`送`,`無言`,`-`} | `unknown` (結果確認不可) | `several_result_rows` / `unrecognised_result` | not seen in the sample |
| P5 | `心拍` rows in the window but **only `scheduled_off`** | **no status — stays "ยังไม่ยืนยัน"** after the deadline, "ยังไม่ถึงเวลา" before | — | REQ §6 common rule; `scheduled_off` proves neither success nor failure |
| P6 | **no `心拍` row at all** in the window (the hourly check itself did not run) | **no status — stays "ยังไม่ยืนยัน"** | — | the checker's own stop is not a patrol failure |
| P7 | any row after 2026-10-05 23:36 that would be P1/P2 | **not `ok`/`silent_ok`**: "completed, question count not provable" → no REQ status fits; stays "ยังไม่ยืนยัน" until Q-49b is answered | — | client: the scheduled runs send nothing since the change |
| P8 | `late` | **not proposed** — no record defines "late"; no `late` is produced | — | Q-49d |
| P9 | `missing` | **not proposed** — absence of a result row is P5/P6 ("ยังไม่ยืนยัน"), never `missing`, unless the client confirms that a run that executed always writes a result row | — | Q-49e |

Daily report (00:35, `daily_deadline_min` = 60, provisional), from `送信ログ` only (`心拍` has no night rows):

| # | Evidence in (00:35, 00:35 + 60 min] | Proposed `status` |
|---|---|---|
| D1 | at least one `OWNER` row with `結果` `OK…` | `ok` (完了) — `ok` vs `silent_ok` for a report that never asks questions is Q-49f |
| D2 | `OWNER` rows only with `NG(` / `ATTEMPTING_NO_RETRY` | `unknown` |
| D3 | no `OWNER` row | stays "ยังไม่ยืนยัน" (e.g. sample business day 9/29) |

Fields of the run row that the same evidence could fill (only after approval): `read_at` ← no (the `心拍` time is the check time,
not the read time); `sent_at` ← the matching `送信ログ` `OK` row time (P1); `owner_notified` ← **no** (the `owner=pc-confirmed`
code and the earlier `OWNER` send are not proven to be a notice for that run). `input_lines`, `questions_sent`, `messages_sent`,
`owner_items`, `photos_*`, `ai_done_at`, `posted_at`, `received_at`, `evidence`: no proven source (Q-15 stays open).

## 4. Explicitly NOT inferred

- `AI=scheduled-off` is never `ok`, `silent_ok`, `blocked`, `missing` or `unknown`: it is an hourly check with no scheduled AI result
  to deliver (hypothesis H1, to confirm). It also is not proof that a patrol did *not* run.
- A machine heartbeat (`beats`) alone, `verify=PASS`, or a standby machine's rows never produce a patrol or daily status.
- The 8–19 minute `OWNER` send before each STOP row is not read as `owner_notified`.
- `max-read N件`, `未分析=M#/I#`, `規則影#件(送らない)` and `実行ms` are reported, not interpreted.
- Polling-loop sends (every 5 minutes since 10/5 23:36) are not attached to scheduled runs (Q-49c, Q-21).

## 5. Ambiguities and limits

1. **The sample predates the 10/5 23:36 change.** After it, P1/P2 cannot be told apart (P7) and the shape of `結果` may have changed
   (the client reported `AI=scheduled-off` "now" appears; in the sample it already appears in every non-slot hour).
2. 98 rows / 17 slots / 6 daily reports is a small sample; four STOP rows carry three different free-text sentences.
3. The window relies on `slot_deadline_min` = 90 (provisional; REQ example). The observed offset is 73 minutes every time; a
   deadline under 73 would turn every patrol into "ยังไม่ยืนยัน".
4. `心拍.時刻` has no zone in the sample; the analysis reads it in `Asia/Bangkok` (NIKUSHO_COPY_TIMEZONE; format/zone Q-12).
5. Two result rows in one window cannot happen with 90-minute windows and hourly checks unless a run is delayed past the next
   check; P4 then answers `unknown`, never a guess.
6. The daily window can also contain unrelated `OWNER` sends; D1 does not prove the send *is* the daily report (Q-49f).
7. **Live data does not fit the sample's patterns:** 239 of 722 live rows (33 %) are `other` — a `結果` the parser does not recognise —
   and 130 segments could not be parsed. The table in §3 was built from the 10/5 sample and **must be revised with the live shapes
   (sections [2]–[5] of the live output: masked shapes and counts only) before it is sent to the client.** Until then P4 applies to
   those rows (`unknown`), and the dashboard does not use any of this.

## 6. How to produce the live evidence (read-only)

```powershell
cd C:\Putter\nikusho-monitor-skeleton
npm run diag:heartbeat -- --days 14 --json "Claude outputs\heartbeat-counts.json"
```

The output contains counts, classes, times, digit-masked shapes and STOP/owner codes only (no 結果 free text, no message text, no
names, no ids). Paste it back; PIATEC updates §2 with the live counts before the proposal is sent to the client.

## 7. Questions for the client (to Takatsuji; route Q-47) — two options and a recommendation each

| ID | Question | Option A | Option B | PIATEC recommends |
|---|---|---|---|---|
| Q-49a | Is `心拍` the GAS hourly check (minute :13, 10:13–23:13) that delivers a patrol result when one is ready, and does `AI=scheduled-off` mean "no scheduled AI result for this hour"? | yes — `scheduled_off` rows carry no run status (P5) | no — tell us what it means | A (matches all 98 sample rows) |
| Q-49b | After 10/5 23:36 the scheduled runs send nothing. How should ② show a completed patrol? | show "ยังไม่ยืนยัน" until a record states whether questions were produced (P7) | the client adds a field to `心拍` (e.g. questions produced by the run) so `ok`/`silent_ok` can be read | B (a missing-record entry); A until then |
| Q-49c | Polling-loop questions/replies since 10/5 23:36: do they belong to any scheduled run? | no — they are listed as messages/sends, not under a run | yes — tell us the linking field (`slot`?) | A |
| Q-49d | What is `late`? | not used in Phase 1 | a result row later than X minutes after the slot (client gives X) | A |
| Q-49e | If a slot window has hourly rows but no result row, did the patrol not run? | keep "ยังไม่ยืนยัน" (P5) | show `missing` (the GAS always writes a result row when the patrol ran) | A unless the client confirms B in writing |
| Q-49f | Daily 00:35: is an `OWNER` `OK` send within 60 minutes the evidence of a completed daily report, and is it `ok` or `silent_ok`? | yes, `ok` (D1) | no — tell us the record | A, with the client confirming which send is the report |
| Q-49g | `STOP=` codes: full list and whether each means "stopped" (`blocked`); meaning of `owner=pc-confirmed` | every `STOP=` → `blocked`, reason = code (P3) | some codes are not stops — list them | A |
| Q-49h | `slot_deadline_min` / `daily_deadline_min` for Bangkok (provisional 90 / 60) | confirm 90 / 60 | other values | A (observed offsets 73 min / 6–8 min) |

Until every row of §3 used by the screen is approved, the implemented behaviour does not change.
