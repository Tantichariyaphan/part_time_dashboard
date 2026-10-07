// Adapter contract. The Dashboard never talks to a source; it talks to the API, which reads Screen Data
// produced by an adapter. Replacing the mock adapter with the real pipeline output
// (Original Records -> client Copy Script -> View-only Copy -> PIATEC Transform -> Screen Data) must not require UI changes.
//
// Adapter interface:
//   kind: 'devmock' | 'demo' | 'none' | 'copy'   ('copy' = reader of the client's View-only Copy + Heartbeat Sheet; real data;
//                                              NOT_CONNECTED until the reader account exists, Q-48)
//   async load(): Promise<AdapterResult>
//
// AdapterResult:
//   kind           string
//   now            number   - the clock the data must be judged against (real adapters: Date.now();
//                             demo: frozen reference time of the fixed snapshot)
//   raw            { [tabKey]: { columns: string[], rows: object[] } | null }
//                  tabKeys: meta, stores, schedules, runs, questions, sends, messages, beats, alerts
//                  `beats` / `alerts` = null when the Heartbeat Sheet does not exist (NOT CONNECTED)
//   storeConnection { [storeId]: 'connected' | 'not_connected' }
//                  INTERIM, outside the REQ §5-3 schema; the real mechanism is UNCONFIRMED (Q-29)
//   limits?        { runStatus?: 'UNCONFIRMED', questionsIncompleteFrom?: iso }   (copy adapter only)
//                  facts the source cannot prove yet: run status is not derived at all (Q-49); question records are
//                  incomplete from the given instant (Q-52). They suppress conclusions; they never create values.
//   sources?       { copy: {state, reason, ...}, heartbeat: {state, reason, ...} }   (copy adapter only)
//                  connection / contract-check state of each client file. Codes and counts only: no ids, no values.

export const ADAPTER_KINDS = Object.freeze(['devmock', 'demo', 'none', 'copy']);

export function assertAdapterResult(r) {
  if (!r || typeof r !== 'object') throw new Error('adapter returned nothing');
  if (!ADAPTER_KINDS.includes(r.kind)) throw new Error(`unknown adapter kind: ${r.kind}`);
  if (!Number.isFinite(r.now)) throw new Error('adapter result needs a numeric `now`');
  if (!r.raw || typeof r.raw !== 'object') throw new Error('adapter result needs `raw` tabs');
  return r;
}
