// Connection check for the client's two files, without starting the web server or signing in:
//
//   npm run check:sources        (reads .env; same configuration as `npm run start:live`)
//
// Prints, per file: NOT_CONNECTED / CONNECTED / PARTIAL / BLOCKED / ERROR, the reason code, and per tab the row count and
// the contract-check findings (tab, 元の行番号, column, problem). It never prints cell values, spreadsheet ids or the key.
// Typical results:
//   reader_account_pending  no key configured (NIKUSHO_READER_KEY_FILE / _JSON)
//   http_403                key works, but the client has not shared the file with the reader account yet
//   http_404                wrong spreadsheet id
//   CONNECTED               ready; open the dashboard with `npm run start:live`
import { chooseLiveAdapter } from '../server/index.js';
import { loadSourceConfig, SourceConfigError } from '../server/source/config.js';

if ((process.env.NIKUSHO_LIVE_ADAPTER ?? '') !== 'copy') {
  console.error('Set NIKUSHO_LIVE_ADAPTER=copy (see .env.example).');
  process.exit(1);
}
let cfg;
let live;
try {
  cfg = loadSourceConfig(process.env);
  live = chooseLiveAdapter(process.env);
} catch (e) {
  console.error(e instanceof SourceConfigError ? `Source configuration: ${e.message}` : `Cannot start: ${e.message}`);
  process.exit(1);
}

const keyNote = { not_configured: 'no key configured (NIKUSHO_READER_KEY_FILE or NIKUSHO_READER_KEY_JSON)', file_not_found: 'key file not found at NIKUSHO_READER_KEY_FILE - save the service-account JSON there' };
console.log(`Reader account: ${cfg.readerKey ? `${cfg.readerKey.clientEmail}   <- the client shares both sheets with this address (Viewer)` : `(${keyNote[cfg.readerKeyStatus]})`}`);
console.log(`Copy store: ${cfg.adapter.store}   copy time zone: ${cfg.adapter.timezone ?? '(not set: only ISO timestamps with an offset are accepted)'}`);
const r = await live.load();
for (const [name, s] of Object.entries(r.sources)) {
  console.log(`\n[${name}] ${s.state}${s.reason ? `  (${s.reason})` : ''}${s.readAt ? `  read ${s.readAt}` : ''}`);
  for (const t of [...(s.tabs ?? []), ...(s.metaTab ? [s.metaTab] : [])]) {
    console.log(`  ${t.tab.padEnd(12)} ${t.state.padEnd(8)} ${t.rows == null ? '' : `${t.rows} rows`}${t.findingCount ? `  ${t.findingCount} finding(s)` : ''}`);
    for (const f of t.findings ?? []) console.log(`      - ${f.problem}${f.column ? `  column ${f.column}` : ''}${f.row ? `  row ${f.row}` : ''}`);
    if (t.warningCount) console.log(`    ${t.warningCount} flagged row(s), shown with a warning (not blocking):`);
    for (const f of t.warnings ?? []) console.log(`      ~ ${f.problem}${f.column ? `  column ${f.column}` : ''}${f.row ? `  row ${f.row}` : ''}`);
  }
  for (const f of s.copyFindings ?? []) console.log(`  (copy) ${f.problem}`);
  if (s.answerLinks) console.log(`  Possible answers (candidate only, never confirmed): questions with candidates ${s.answerLinks.questionsWithCandidates}, candidate links ${s.answerLinks.candidateLinks}, messages matching 2+ questions ${s.answerLinks.messagesWithSeveralQuestions}`);
  if (s.replyLinks) console.log(`  Bot replies: confirmed ${s.replyLinks.confirmed}, ambiguous ${s.replyLinks.ambiguous}, unlinked ${s.replyLinks.unlinked}${s.replyLinks.zoneUnknown ? ` (no copy time zone: ${s.replyLinks.zoneUnknown})` : ''}`);
}
