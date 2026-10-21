# CHANGES — NIKUSHO AI Monitoring Dashboard

Deliverable REQ §3 #7 (change history). Newest first. Dates are Bangkok time. Commit ids refer to the repository's `main` branch.
Test evidence for each change: `TEST_REPORT.md`; design decisions: `docs/implementation-notes.md`.

## Unreleased — 2026-10-21 (b) — evidence connection (Iida-san: 「そのまま進めてください」)

- New optional copy tabs `定時読取` / `5分巡回` / `日次配送` (client minimum columns §6-5; tab names and values: PIATEC proposal,
  `docs/evidence-contract-proposal-2026-10-21.md`). Judged per the rules of 10/21 in `src/adapters/copy/evidence.js`; a kind is
  judged only when its tab is present, passes the contract check and its meta row (if any) is ok. Absent tab = previous behaviour.
- Labels when judged: 読取完了 / 遅れて読取完了 / 3 経路受付記録あり / 遅れて受付 / 受付途中 / 結果不明 (was 結果確認不可) /
  未確認（記録なし）; daily per-route badges (ALL LINE / 丸 LINE / 丸メール); 5 分巡回 動作確認（その回のみ） / 要確認 / 担当未確認.
- The reader requests the optional tabs and the contract / meta checks accept them — **deploy before the client adds them** (the
  current production version would refuse the copy).
- ⑥ shows the state of the three evidence tabs; `npm run diag:ops` prints them.
- Tests: EV-1 … EV-8, OPS-3. 244 → 253, synthetic only. Not verified with the client's real tabs (they do not exist yet).

## Unreleased — 2026-10-21 — client run-status rules (「NIKUSHO 巡回・日次の状態判定ルール」 1/7–7/7)

Applied with the evidence the dashboard has today; no data source, count or send changed. Gap analysis, traceability and the
verification status: `docs/run-status-rules-2026-10-21.md` (the earlier `docs/run-status-proposal.md` is marked superseded).
- **Five separate names:** データ更新 / 機械の確認 (was 稼働機) / 定時 LINE 読取 (was 巡回) / 5 分巡回 (was 簡易チェック) / 日次配送
  (was 日次). ⑥ nav 「機械・更新」, title 「機械の確認とデータ更新」.
- **Not-judged results:** 定時 LINE 読取 「未確認（読取記録 未接続）」, 日次配送 「3 経路判定未接続」 (was 状態未判定). The notices now say the
  rules exist and the client's records are not connected yet (was 「判定ルール待ち」).
- **⑦:** one row per state again — 定時読取成功率 未確認 / 日次配送（3 経路） 3 経路判定未接続 / 欠落・停止・結果不明 未確認 / 5 分巡回・返信の
  成功率 未集計. The single merged row of 10/19 is removed (it combined states the rules keep apart).
- **5 分巡回:** shows 「最終稼働 HH:MM（N分前）」 and 「最終稼働時刻のみ確認／全件判定未接続」; over 15 min 「遅延／要確認」, over 20 min
  「20分超の空き（停止検知）」 (red after 15 min unchanged, REQ TV14). 「動作確認」 is not shown (needs `heartbeat.jsonl`).
- **送信ログ OK:** 「送信済み」 → 「送信受付」 (acceptance record only, not 既読 / 解決).
- `config/stores.json`: slot 90 / daily 60 min noted as stated by the client on 10/21 (values unchanged).
- New `npm run diag:ops -- --day YYYY-MM-DD` (`scripts/ops-reconcile.js`): read-only per-day view of the five states (times,
  counts, fixed codes only) for the 10/20 reconciliation; names the evidence that is not readable.
- `npm run check:access`: a placeholder or non-Vercel `--preview` now stops the run, and a Preview that does not answer
  (HTTP 0) is FAIL (it was counted as PASS on 2026-10-21; that run's Preview result is void).
- Tests: RULE-1021-1…6, OPS-1…2; SCREEN-10 / 11 updated to the new names and separate ⑦ rows. 236 → 244, synthetic only.
  Headless UI review: no findings. **Not verified on live data or on a Preview URL yet.**

## Unreleased — 2026-10-19 (b) — shorter screens after the first look at the live data (display only)

Nothing here changes a count, a state, a candidate rule or the data read; every shortened item is one tap away.
- **④ 質問と回答:** a question with more than 3 possibly related answers shows 「関連の可能性 N件（質問時刻に近い3件を表示）」, the 3
  candidates nearest to the question time and 「すべて表示（N件）」. Confirmed answers are always shown.
- **⑥ / update banner:** the dashboard-data tab names are shown in Japanese (巡回台帳 / 質問台帳 / 送信ログ / メッセージ台帳); the
  internal (contract) names are unchanged. The ⑥ column header `status` is now 「状態」.
- **③ メッセージ:** consecutive images / stickers of the same sender in the same group (≤ 5 min apart, same handling, no question
  link, no Bot reply) become one row 「21:59–22:00 … (画像 ×18)」 with one handling badge and 「個別に表示」. Every message keeps its
  link anchor, and a link to a grouped message opens the group.
- **① 全店舗:** each card starts with one line, e.g. 「今日：巡回3回予定・未回答（候補なし）2件・回答未確認32件・稼働機 正常」. The
  evidence badge 「? 不明」 is no longer shown when its only reason is the pending run-status rule (the card says so in words);
  any other reason (not connected, candidate, …) keeps the badge.
- **⑤ / ⑦ while the run-status rule is pending (Q-49 / T-01):** one message 「巡回結果の判定ルールは発注者からの連絡待ちです…」
  instead of four 未判定 tiles and an empty list (⑤) or three 未判定 rows (⑦ → one row 「判定ルール待ち」). Never shown as 0.
- **⑥ long row-number lists:** a meta detail ending in a long list of row numbers, and the copy's `rounded_identifier` warnings,
  are folded to 「ID破損 36行」 + 「行番号を表示」 (the full original text / row numbers when opened).
- New `public/app/lib/collapse.js` (pure, no DOM). Tests SCREEN-7 … SCREEN-12 (fail on the previous code). 230 → 236, synthetic
  data only. Headless UI review (mock): no findings; page render check with live-like synthetic data (18 images, 12 candidates,
  36 damaged ids, rule pending): no errors.
- **Not verified on live data yet.**

## Unreleased — 2026-10-19 — screen fixes requested by the client (Maru-san, 10/18)

- **No internal ids in the 「詳細」 panels:** ③ message detail no longer prints `message_id`, `run_id` or `send_id`; it shows the
  kind, handling, the patrol's time and each reply's send result. ② run detail no longer prints `run_id`, and a missing send record
  is shown without its `send_id`. ⑤ detail no longer prints `run_id`. The ids remain only as link targets / element ids and in the
  API JSON (for support). The labels `S.detail.messageId / questionId / runId / sendId` were removed.
- **未回答 is not presented as concluded:** the `waiting` label is now 「未回答（候補なし）」 on ① and ④ (state, filter, card); ④
  explains under the filters that it means no possibly related answer was found, not that no answer was given. A question sent
  while the client's question tracking is known to be incomplete (Q-52, from 10/05 23:36) carries the badge 「記録不完全期間」 and the
  note 「回答の有無は確定できません」 (view model: `inIncompletePeriod`). No count or state rule changed.
- **Client conditions for the reader key on Vercel (2026-10-19):** a Preview or Development deployment (`VERCEL_ENV` ≠ production)
  never parses the key or reads the client files, even if the variables were set for it by mistake; its live entry shows 未接続
  (`not_production_deployment`). New `npm run check:access -- --url https://<production host> --preview https://<preview host>`:
  pre-release check without an account (not signed in → 401 and no data on every resource; page and every script contain no key
  material or source ids; preview → no data; write methods refused). Prints status codes and PASS / FAIL only.
- Tests: SCREEN-3 updated (new label), SCREEN-5 (no id in any detail panel or key/value row, on all 7 page files), SCREEN-6
  (incomplete-period mark, before / after the gap, no gap). LIVE-PREVIEW (no token request and no read on preview / development). The new tests fail on the previous code. 227 → 230,
  synthetic data only.
- Checked outside `npm test` (synthetic data): headless UI review, all 7 pages at 375 / 1280 px, no findings.
- **Not verified on live data yet.**

## Unreleased — 2026-10-14 — screen fixes requested by the client (Maru-san, 10/14)

- **Runs past their time:** a scheduled run whose time has passed is no longer shown as 「時刻前」. Before its time: 時刻前
  (`not_due`); from its time to its deadline: **「結果待ち（時刻経過）」 (`awaiting`, new)**; after the deadline: 未確認（記録なし） /
  状態未判定 as before. `awaiting` is in-progress (excluded from every rate, like `not_due`; never a success or a failure). On ① the
  run chips are dots, so `awaiting` has its own ring-shaped dot (`tone-await`) and its own legend entry; 状態未判定 was added to the
  legend so the two are told apart. Boundaries: at the scheduled time exactly → `awaiting`; at the deadline exactly → after-deadline.
  No run-status rule was added: what a run's result is stays the client's decision (Q-49).
- **未回答 vs 回答未確認:** ① no longer adds questions with a possibly related answer (`candidate`) to the unanswered count. ① card
  「未回答 N件」 with the sub-line 「回答未確認 M件」; ④ filters すべて / 未回答 / 回答未確認 / 回答あり / クローズ; the state label
  `waiting` is now 「未回答」. View model: `waitingQuestions` = waiting only, new `candidateQuestions`; ④ `counts.candidate`.
- **Internal question id hidden:** ④ no longer prints the question id (e.g. `R021-confirm-…`) on the normal screen; it is used only
  as an anchor / link target. Message / run / send ids stay inside the closed 「詳細」 panels only.
- Tests: RUN-AWAIT ×4 (`tests/runs.test.js`: before/at/after the time and the deadline, 1 ms boundaries, daily run across midnight,
  never counted), `tests/screen-rules.test.js` (SCREEN-1…4; SCREEN-4 = every question state at once, no double counting, response
  rate from confirmed answers only), COPY-33 updated to the new counting rule. 219 → 227, all on synthetic data.
- Checked outside `npm test` (synthetic data): headless UI review of all 7 pages at 375 / 1280 px, no findings; rendered-DOM search
  for a synthetic id `R021-confirm-SYNTHMARK-*` on all 7 pages with collapsible panels opened: visible text before the fix on ④,
  none after; it remains only as the `id` attribute of the ④ question card (anchor) and in the `/api/live/questions` JSON.
- **Not verified on live data yet:** the live ① / ④ counts after the change and the ② 「結果待ち」 state during a result window.

## Unreleased — not committed (2026-10-13) — production = live data only

- **Fixed (root cause of mock data on vercel.app):** `api/server.js` wired the dev mock as the live entry. It now forces the production
  policy: the live entry is the client's View-only Copy + Heartbeat Sheet only; without a working source it shows 未接続 / 更新停止 with a
  reason code, never mock or demo data.
- **Added** `server/liveSource.js` (`isProduction`, `createLiveReaders` (moved), `createProductionLiveAdapter`,
  `createSourceUnavailableAdapter`); `chooseLiveAdapter()` uses it when `VERCEL=1` or `NIKUSHO_DEPLOYMENT=production`; a requested
  `devmock` / `none` / `demo` is refused there. Local development is unchanged (dev mock default).
- **UI:** strip 「実データに接続できていません …（モック・デモは表示しません）」 on the live entry when the copy is not connected; the 未接続 card
  text no longer says "Phase 2".
- `vercel.json`: `maxDuration: 60` for the entry. `.env.example`: `NIKUSHO_DEPLOYMENT`; key variables explained (FILE on the laptop,
  JSON on a hosted deployment, JSON wins when both are set).
- **Security (pre-commit review):** Google token and Sheets requests of a deployed dashboard time out after 10 s
  (`PRODUCTION_READ_TIMEOUT_MS`; worst case 4 × 10 s < `maxDuration` 60), so a stalled Google API ends as an ERROR state with a code,
  not a platform time-out. New `.vercelignore` keeps `.env*`, `config/allowlist.json`, reader keys, `secrets/`, `Claude outputs/` and the
  client sample folders out of any upload. Precise NOT CONNECTED codes `reader_key_not_configured` / `reader_key_file_not_found`.
- **Added** `scripts/outage-drill.js` (`npm run drill:outage`): outage drill on a TEST CONNECTION (synthetic copy behind an in-process fake
  Sheets API; the real reader → contract → adapter → freshness → API path); scenarios `copy-stops`, `access-lost`, `api-timeout`,
  `bad-contract`; measures copy → API latency, outage → 更新停止, restore → normal. Production polling and client files are not touched.
- **Diagnostics:** `diag:heartbeat -- --rows` lists the hard-to-classify `心拍` rows by 元の行番号 per class/shape (section [7]);
  `diag:reconcile -- --rows` prints the question extraction criteria and each `AI質問追跡` row in or near the window (section [7b]).
- **Remove** the stray file `tics and reconciliation…` committed in `ad78238` (`git rm`, no history rewrite).
- **Tests:** `tests/live-only.test.js` (LIVE-1 … LIVE-12), `tests/outage-drill.test.js` (DRILL-1 … DRILL-3), DIAG-3/DIAG-5 extended;
  `tests/vercel.test.js` composes the server like the Vercel entry. 202 → 219.
- **Docs:** `docs/client-response-2026-10-15.md` (new: consolidated issue list, 10/15 feature list, refresh/outage test plan, Vercel
  interim facts for the client's decision), `README.md`, `docs/auth-prototype.md` §10a, `docs/architecture.md` §10/§12, `docs/implementation-notes.md` §11,
  `docs/connection-spec.md` §12.2 (Q-01), `docs/traceability-matrix.md`, `TEST_REPORT.md` (L9).
- Kept: mock fixtures, demo snapshot and `/demo/`, read-only access, sign-in and allowlist.

## 59f00de, ad78238 — 2026-10-13 — read-only diagnostics and delivery documents

Read-only real-data diagnostics, run-status proposal, delivery documents. No change to what the dashboard shows.
(`ad78238` also added a stray file whose name starts with `tics and reconciliation` — terminal output of a `git diff`, no
credentials; to be removed in the next commit.)

- **Added** `scripts/reconcile.js` (`npm run diag:reconcile`): copy → transformed Screen Data → view model for N business days;
  counts, text equality, replies, send results, questions, meta; prints counts and row numbers only (TV1, TV8, TV20 evidence).
- **Added** `scripts/timing-probe.js` (`npm run diag:timing`): copy cadence, row time → first visible to the reader, banner vs raw
  copy `meta` (TV9, TV19, TV21 evidence).
- **Added** `scripts/analyze-heartbeat.js`, `scripts/lib/heartbeatPatterns.js` (`npm run diag:heartbeat`): classes and masked
  shapes of `心拍.結果`; the PROPOSED slot reading — not used by the dashboard.
- **Added** `scripts/lib/diag.js` (shared helpers), `tests/diagnostics.test.js` (DIAG-1 … DIAG-8). Tests: 194 → 202.
- **Changed** `server/index.js`: the two readers are built by one function `createLiveReaders()`, used by the live adapter and the
  diagnostics (no behaviour change).
- **Added** `docs/run-status-proposal.md` (REQ §5-1, §5-4 #2): interpretation table for `心拍.結果`, evidence, limits,
  questions Q-49a–h. **Not approved, not implemented.**
- **Docs:** `docs/architecture.md` §7.4 (time requirements: design bound vs evidence) and §8a (Screen Data storage gap and proposed
  client-owned store, minimum permissions; nothing created); Q-54 and the 2026-10-13 status table in `docs/connection-spec.md` §12.2;
  `docs/data-mapping.md`, `docs/implementation-notes.md` §9–§10, `docs/acceptance-report.md` §1a, `docs/traceability-matrix.md` §9,
  `README.md`.
- **Added** `TEST_REPORT.md` (TV1–TV25 with LIVE / SYN / MAN evidence) and this `CHANGES.md`.
- **Reclassified** TV25 from PASS to PARTIAL and TV22 from PASS to PARTIAL (reasons in `TEST_REPORT.md` §4).

## b64bed8 — 2026-10-13 — live copy connector fixes, candidate answers

- Reader account: service-account token source (`server/source/serviceAccountToken.js`, `spreadsheets.readonly`), key path from
  `.env` (`NIKUSHO_READER_KEY_FILE`), `.env.example`, `npm run start:live`, `npm run check:sources`; `config/stores.json`
  (Bangkok; provisional values listed in its `_provisional`).
- Copy `meta`: a row describing the `meta` tab itself is accepted (not used for freshness); a second one still blocks.
- Rounded `messageId` (sheet stored the id as a number): non-blocking warning; the row is shown as `ROW-<元の行番号>`, flagged
  "ID破損", never merged; blank `messageId` still blocks.
- Possibly-related answers (REQ §5-1): same group and sender as the question, after `送信時刻`, not `取消`; `link=candidate` only,
  never confirmed, no time window; `waiting` → `candidate`; excluded from response rate and time to answer.
- Question-gap wording: "10/05 23:36 以降の質問記録は不完全な可能性があります" (no claim of recovery).
- ① store badge: "不明" with the reason while run status is not judged (was "確認済み").
- Tests: 184 → 194.

## c0fb043 — 2026-10-07 — client View-only Copy connector

- Follows the client's 10/7 architecture update: the client builds and runs the Copy Script; PIATEC reads the View-only Copy and
  the Heartbeat Sheet with a separate reader account.
- Data Contract v1 in code (`src/contract/copyContract.js`); contract check that blocks a tab on forbidden fields, groups,
  recipients, duplicate row ids (`src/adapters/copy/validate.js`); Transform copy → Screen Data (`transform.js`); copy adapter
  (`copyAdapter.js`); GET-only Sheets reader (`server/source/sheetsReader.js`); run status not judged (Q-49); question-gap note (Q-52).
- Documents re-aligned to the 10/7 update (`docs/connection-spec.md` §0, `docs/architecture.md`, `docs/data-mapping.md`).

## a63e836 — 2026-10-06 — sample-data structure, cross-page links, detail views

- Screens and synthetic data aligned with the client's 10/5 source sample (structure only); links between pages; run, message and
  question detail views; `tests/sample-shape.test.js`.

## d99602c, f088f7c — 2026-10-05 / 06 — Vercel prototype

- Prototype hosting on vercel.app with mock/demo data only (`api/server.js`, `vercel.json`, `tests/vercel.test.js`). Not production.

## 7ab764d — 2026-10-05 — initial skeleton

- Seven pages (Japanese UI, portrait phone), Screen Data contract (REQ §5-3), domain rules (run status, business day, freshness,
  questions, Bot replies), mock and demo adapters, read-only API, Auth Prototype (Google sign-in, server session, server-side
  allowlist), architecture / connection-spec / data-mapping / traceability documents, test suites.
