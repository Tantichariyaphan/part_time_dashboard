# CHANGES — NIKUSHO AI Monitoring Dashboard

Deliverable REQ §3 #7 (change history). Newest first. Dates are Bangkok time. Commit ids refer to the repository's `main` branch.
Test evidence for each change: `TEST_REPORT.md`; design decisions: `docs/implementation-notes.md`.

## Unreleased — not committed (2026-10-13)

Read-only real-data diagnostics, run-status proposal, delivery documents. No change to what the dashboard shows.

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
