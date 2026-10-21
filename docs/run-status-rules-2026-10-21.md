# Client run-status rules of 2026-10-21 — gap analysis, traceability and verification

Source: client messages 「NIKUSHO 巡回・日次の状態判定ルール」 1/7 – 7/7 (Maru-san, LINE, 2026-10-21 09:09), plus the cover
message of 09:07. The original document file is **not** in this repository; every row below is checked against the messages as
received (quoted IDs `R-xx` are PIATEC's numbering). The rules are display / interpretation instructions only: they do not change
send records, production configuration or approved estimates, and they **do not approve extra cost or schedule** (rule 7/7).

Classification used in every table: `PASS` verified with evidence · `FAIL` contradicts the rule · `未確認` evidence missing ·
`BLOCKED` an external dependency prevents it · `N/A` with reason. "SYN" = synthetic tests only (not evidence about live data).

## Phase A — what the repository has today (commit `225cf25`, laptop = cloud working copy)

| Area | Implementation | Evidence it reads |
|---|---|---|
| Data freshness | `src/domain/freshness.js`, banner `public/app/components/freshness.js`, ⑥ データ更新 table | copy `meta` (last_read_at, status) |
| Machine | `src/domain/production.js` `storeMachine` / `machineView`; ① 稼働機, ⑥ machine cards | Heartbeat sheet `beats` (production host `snowmaru`, role=production), `alerts` |
| Scheduled slots 12/17/22 + daily 00:35 | `src/domain/runs.js` `dayRuns`; schedules from `config/stores.json` (slot history 9/13, 10/2; daily 00:35; deadlines 90 / 60) | **nothing**: `COPY_SOURCE_LIMITS.runStatus = 'UNCONFIRMED'` → every run is 時刻前 / 結果待ち / 状態未判定 (Q-49) |
| "Light check" (= new 5-min patrol) | `production.js` `lightCheck`: red when > 15 min since `beats.text_patrol_at` inside `stores.text_patrol` 10:00-24:00 | `beats.text_patrol_at` only |
| Replies | ③ Bot replies from copy `送信ログ` (result OK → `sent` 送信済み) | GAS 送信ログ |
| Access | Google sign-in + server allowlist; Host check; `VERCEL_ENV≠production` never reads sources; `npm run check:access` | — |

Not available to PIATEC (rule 2/7 says so too): `_line_read_launch.tsv`, `_line_read_heartbeat.tsv`, `heartbeat.jsonl`,
`ownership.json`, the new patrol case ledger, the 3 daily receipts. The copy has `ログ`, `送信ログ`, `AI質問追跡`, `心拍` (validated
only), `meta`; the heartbeat sheet has `beats`, `alerts`.

## Phase B — requirement inventory, gap and decision

| ID | Rule (short) | Today | Gap type | Decision |
|---|---|---|---|---|
| R-01 | 5 independent states: データ更新 / 機械の確認 / 定時 LINE 読取 / 5 分巡回 / 日次配送; no success reused for another | separate, but labelled 稼働機・巡回・簡易チェック・日次; ⑦ (10/19 change) merged slot+daily into one row | display defect | **C1, C4**: rename; ⑦ back to separate rows |
| R-02 | `meta.status=ok` only under 「データ更新」 | ⑥ データ更新, banner | — | PASS (no change) |
| R-03 | `beats.verify=PASS` only under 「機械の確認」, never 巡回成功 | heading 稼働機 / 自己検査 | wording | **C6** rename heading |
| R-04 | 12/17/22 named 「定時 LINE 読取」 after 10/5 23:36; rate heading 「定時読取成功率」 | 巡回 / 巡回 成功率 | wording | **C1** |
| R-05 | slot states ok/late/blocked/missing/unknown need `_line_read_*` evidence | not read | **missing evidence** (client CODE/Codex) | BLOCKED; until then **「未確認」** (R-06) |
| R-06 | until connected, each slot result = 「未確認」 | 状態未判定 | wording | **C2** 「未確認（読取記録 未接続）」 |
| R-07 | GAS `slot-readonly` = neither success nor failure; at most an auxiliary note | 心拍 not used for status | — | PASS (not used). Auxiliary note: not implemented (optional, needs parsing `心拍`) |
| R-08 | pre-10/5 23:36 slots judged by the old rule, not repainted | nothing judged in either period | — | N/A today (no status is produced); keep in mind when evidence arrives |
| R-09 | ownership `owner=new` MEAT/IN, else 「担当未確認」 | not available | missing evidence | BLOCKED; dependency listed; the screen never says 5-min success (R-11) |
| R-10 | 5-min patrol: ≤ 15 min 動作確認 (that run only); > 15 遅延／要確認; > 20 stop detection; outside 10:00-24:00 時間外 | > 15 → red; no 15–20 band | **rule change** | **C5**: 16–20 min = 遅延／要確認 (yellow), > 20 min = 停止検知 (red). 「動作確認」 is **not** shown: it needs `heartbeat.jsonl` (send / issues / audit_issues / google_beat), which we do not have |
| R-11 | until connected: 「最終稼働時刻のみ確認／全件判定未接続」; no 5-min / reply success rate (「未集計」, never 0%) | no rate shown; no wording | wording | **C5** note; **C4** ⑦ row 「未集計」 |
| R-12 | standby PASS never substitutes production | production only | — | PASS (existing tests TV14) |
| R-13 | individual reply 「LINE API 受付」 only when ledger `accepted` + 送信ログ `OK` link the same case | ③ shows 送信ログ OK as 「送信済み」 | wording risk | **C7**: 「送信受付」 (送信ログの受付記録); never 「LINE API 受付」 / 既読 / 解決 |
| R-14 | unknown / sending = 結果不明, no retry | `unknown` = 送信結果未確認; dashboard never sends | — | PASS |
| R-15 | daily D at D+1 00:35; a correct receipt from 00:00 (e.g. 00:32) is not 時刻前 / abnormal | no receipts read | N/A today | rule recorded for the connection work |
| R-16 | daily ok only with 3 receipts same business_date + SHA; any unknown → not ok; per-route display | not read | missing evidence | BLOCKED; until then **「3 経路判定未接続」** |
| R-17 | GAS 丸 LINE log never proves 丸メール | not used | — | PASS |
| R-18 | deadlines slot 90 / daily 60 → 13:30 / 18:30 / 23:30 / 01:35; report differences, do not overwrite | config 90 / 60 (marked provisional) | — | PASS; **C9** mark as client-stated 10/21 (no value change) |
| R-19 | stale / error / missing columns / incomplete range → 「未確認」 | stale/error stop the screen (red banner) | — | PASS |
| R-20 | minimum anonymised read-only fields (slot / 5-min / daily lists) prepared by client CODE/Codex | — | **new data connection** | **not started** — see Phase G (scope / estimate before work) |
| R-21 | PIATEC must not ask Maru-san to search originals or type data | — | — | PASS (none asked) |
| R-22 | Preview URL shows no real data — send the result | code guard + `check:access` exist; **not run against a Preview URL** | verification | **未確認** — needs a run from PIATEC's PC (Phase E list) |
| R-23 | reconcile 10/20: 3 slots, 5-min patrol, daily 3 routes vs originals; return times/states/reasons | — | verification | partly BLOCKED (originals not readable); what can be compared is produced by `npm run diag:ops` (Phase F) |
| R-24 | additional cost / schedule → scope + estimate before work | — | process | Phase G |

## Phase C — changes made (display only; no data source, count or send is changed)

| # | Change | Files |
|---|---|---|
| C1 | 巡回 → 「定時 LINE 読取」, 日次 → 「日次配送」 on ①②⑤⑦; ⑦ 「定時読取成功率」 | `strings.ja.js` |
| C2 | not-judged run: slot 「未確認（読取記録 未接続）」, daily 「3 経路判定未接続」 (label by kind); legend | `strings.ja.js`, `status.js`, pages using `runLabel` |
| C3 | notices: the rules have arrived; results stay 未確認 until the client's anonymised records are connected (replaces 「判定ルール待ち」) | `strings.ja.js` |
| C4 | ⑦: separate rows again — 定時読取成功率 未確認 / 日次配送 3 経路判定未接続 / 欠落・停止 未確認 / 5 分巡回・返信の成功率 未集計 (never 0%) | `periods.js` |
| C5 | 5 分巡回: label, last-run time + 「最終稼働時刻のみ確認／全件判定未接続」; 16–20 min 遅延／要確認, > 20 min 停止検知 | `production.js`, `constants.js`, `machine.js`, ①⑥ |
| C6 | 稼働機 → 「機械の確認」 (① row, ⑥ heading/nav) | `strings.ja.js` |
| C7 | 送信ログ OK: 「送信済み」 → 「送信受付」 | `strings.ja.js` |
| C8 | ① one-line summary uses the new names | `allStores.js` |
| C9 | `config/stores.json`: deadlines 90 / 60 noted as stated by the client 10/21 (values unchanged) | `config/stores.json` |

## Remaining dependencies (owner)

| Dependency | Needed for | Owner |
|---|---|---|
| Anonymised read-only copy: slot `run_id, scheduled_at, started_at, finished_at, source_complete, status, reason` | R-05 (定時読取 per slot) | client CODE/Codex |
| 5-min `at, host, send, issues, audit_issues, google_beat` (+ ownership state) | R-09, R-10 動作確認, R-11 rates | client CODE/Codex |
| daily `business_date, route, attempted_at, status, body_sha256, body_changed_after_attempt` | R-15, R-16 | client CODE/Codex |
| Reading those new tabs in the copy adapter + status logic + tests | turning 未確認 into judged states | PIATEC — **scope/estimate first** (Phase G) |
| Preview URL test run (`npm run check:access … --preview …`) and screenshots | R-22 | PIATEC (Putter) |
| Live run of `npm run diag:ops -- --day 2026-10-20` | R-23 (what can be compared) | PIATEC (Putter) |

## Phase D / E — tests and results (2026-10-21)

| Test | Kind | Result |
|---|---|---|
| `npm test` — 244 tests (was 236): new `tests/run-rules-1021.test.js` (RULE-1021-1 … 6) and `tests/ops-reconcile.test.js` (OPS-1, OPS-2); SCREEN-10 / SCREEN-11 updated to the new names and to separate ⑦ rows (the 10/19 merged row contradicted rule §0) | SYN | PASS 244 / 244 (cloud copy and PIATEC laptop) |
| Deadlines 13:30 / 18:30 / 23:30 / D+1 01:35, 17:00 slot only from 10/02, business day D → D+1 00:35 (RULE-1021-4) | SYN | PASS |
| 5-min boundaries 15 / 16 / 20 / 21 min, 09:59 and 24:00 時間外, PASS without `text_patrol_at` is not success, standby never substitutes (RULE-1021-5) | SYN | PASS |
| No screen text says 判定ルール待ち / 状態未判定 / 動作確認 / LINE API 受付 / 送信済み (RULE-1021-3) | SYN | PASS |
| Headless UI review (mock data, 7 pages, 375 / 1280 px) | SYN | PASS, no findings |
| Page render with live-like synthetic data (rule pending, 18 images, 26-min 5-min gap) | SYN | PASS, no console errors |
| Live data through the new code (`npm run diag:ops -- --day 2026-10-20`, run 2026-10-21 13:33 on PIATEC's PC) | live read-only | PASS for what it can read (Phase F); the rest 未確認 |
| Production URL after deploy | Production | **未確認** — not deployed yet |
| Preview isolation (R-22) | Preview | **未確認** — see below |

### Preview / access security (R-22) — status 2026-10-21

| # | Environment | Account | Procedure | Expected | Observed | Result |
|---|---|---|---|---|---|---|
| S1 | Production | logged out | browser (screenshot 2026-10-20 10:33) + `check:access` groups A–C, E (2026-10-21 06:34Z) | sign-in screen; every `/api/live/*` and `/api/demo/*` 401 without data; no key markers in the page and 27 scripts/styles; POST/PUT/DELETE 405 | as expected (50 checks) | PASS |
| S2 | Production | signed in, not on the allowlist (PIATEC staff account) | sign in | 403, no data | 「アクセス権がありません」 (screenshot 2026-10-20 10:35) | PASS (screen) |
| S3 | Production | allowlisted (client) | sign in | data shown | client reported real data and 心拍 08:47 matching the sheet (2026-10-21 09:07) | PASS (client) |
| S4 | Preview | any | open a Preview deployment URL in incognito and signed in; `/api/live/*` | no real data (Vercel protection or 未接続) | not run | **未確認** |
| S5 | Preview | none | `check:access` group D | preview answers and refuses | **run 2026-10-21 was invalid**: `--preview` was the placeholder `https://<preview URL>`, every request got no answer (HTTP 0) and the script counted that as PASS. Script fixed (placeholder rejected; no answer = FAIL) | **未確認** — rerun with the real Preview URL |
| S6 | Code | — | `VERCEL_ENV≠production` never reads the client files (`tests/live-only.test.js` LIVE-PREVIEW); no key in Git history (audit 10/19) | — | — | PASS (SYN / audit) — not a substitute for S4 / S5 |

## Phase F — reconciliation of 2026-10-20

`npm run diag:ops -- --day 2026-10-20 --json "Claude outputs\ops-1020.json"` (read-only; prints times, counts and fixed codes only).
What it can compare and what stays open:

| Item | Dashboard can compare | Result now | Stays open because |
|---|---|---|---|
| 定時 LINE 読取 12 / 17 / 22 | screen status and GAS 心拍 codes in each window (auxiliary) | screen 未確認 for all 3 (as the rules require); each window has 2 GAS 心拍 rows: `AI=scheduled-off` ×1 and `AI=slot-readonly / ROUTE=fast-patrol` ×1 — consistent with the client's description (old send route intentionally unused); proves neither success nor failure | `_line_read_launch.tsv` / `_line_read_heartbeat.tsv` not readable → BLOCKED (client CODE/Codex) |
| 5 分巡回 | gaps between production `text_patrol_at` values in 10:00–24:00 (>15, >20) | 166 production beats and 166 distinct problem-free run times in the window; longest gap 10 min; no gap > 15 or > 20; last 23:55. The screen would never have shown 遅延／要確認 that day. Per-run results 未確認 | `heartbeat.jsonl`, `ownership.json`, case ledger not readable → BLOCKED |
| 日次配送 (business day 10/20) | screen status and GAS 送信ログ ALL / OWNER rows from 10/21 00:00 | screen 3 経路判定未接続; 送信ログ 10/21 00:32 ALL `sent` ×1, OWNER `sent` ×2 — matches the client's 00:32 for the LINE side only; 丸メール not visible; 00:32 is before 00:35 and is not abnormal (rule §5) | 3 receipts (incl. 丸メール) not readable → BLOCKED |
| データ更新 / 機械の確認 | copy meta; production beats PASS / FAIL | copy meta ok, all tabs read 10/21 13:32; `snowmaru` 245 beats in business day 10/20 (05:02 – 10/21 01:42), PASS 237 / FAIL 8, standby 0. No production beat between 01:42 and 05:00 on 10/21 (observation, not judged: ask the client whether the PC is expected to run at night). Client confirmed 08:47 match (10/21) | — |

The client's examples (10/20 slots `mode=read/result=ok/exit_code=0`; daily receipts 10/21 00:32) are recorded as client-stated
expected points, **not** as PIATEC results.

## Phase G — scope, cost and schedule

- Everything in Phase C is display / wording inside the agreed screens and the pending run-status item (Q-49 / T-01).
- 2026-10-21: Iida-san replied 「そのまま進めてください」 to the evidence-connection item. **No extra cost or date change is
  claimed by PIATEC for it at this point**; if the client's final tab shape needs more than the proposal, PIATEC states the
  scope / estimate before that extra work (client 09:07).

## Phase G2 — evidence connection implemented (ready before the client adds the tabs)

| ID | Implementation | Test |
|---|---|---|
| R-05 / R-06 | tab `定時読取`: ok / late (finish > slot + 90) / blocked (reason as written) / started → 実行中, after deadline 結果不明 / not_started → 未実行 only with `source_complete=TRUE` after the deadline, else 未確認 / duplicate or unknown value → 結果不明 / no row → 「未確認（記録なし）」 (`no_evidence`, never 未実行) | EV-3 |
| R-08 | slots before 10/5 23:36: not judged even with a row (`before_rule`) | EV-6 |
| R-09 / R-10 | tab `5分巡回`: production host only; 動作確認 only for a clean run (send / issues / audit_issues / google_beat) with `owner=new`; owner missing → 担当未確認; > 15 遅延／要確認, > 20 停止検知 | EV-7 |
| R-11 | 5-min / reply success rate stays 未集計 (no case ledger) | RULE-1021-6 |
| R-15 / R-16 / R-17 | tab `日次配送`: 3 routes, same business_date + SHA, body unchanged → 3 経路受付記録あり (late after 01:35); any attempted / unknown / SHA mismatch / body changed / missing route → 結果不明; blocked → 停止; per-route display; 00:32 is normal; LINE rows never make the email route | EV-4 |
| R-19 | broken tab → blocked as a whole, findings without values; meta row ≠ ok → not used | EV-5 |
| ⑦ | judged kind gets a rate; a window with only not-judged runs → 未確認 (never 対象なし / 0%) | EV-8 |
| reader | optional tabs requested by the reader (`exactTabs` would otherwise refuse the whole copy) and accepted by the contract check / meta check | EV-2 |
| reconcile | `npm run diag:ops` shows evidence-tab states, per-slot / daily-route results and 5-min record counts; client free text never printed | OPS-3 |

Tab names, value vocabularies and the optional `owner` / `read_count` columns are a **PIATEC proposal**:
`docs/evidence-contract-proposal-2026-10-21.md` (to send to the client's CODE / Codex). Values outside the vocabulary are judged
結果不明, never success. **Deploy this version before the client adds the tabs**: the version now in production refuses a copy
with unknown tabs (`unexpected_tabs`) and would stop the whole dashboard.
