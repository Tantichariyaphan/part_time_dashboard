// Sample rows must never enter real summaries (REQ §6): question_id / message_id / send_id / host
// starting with DUMMY- / dummy-. Whether run_id is included is UNCONFIRMED (Q-28); safe default: exclude too.
import { DUMMY_PREFIXES } from './constants.js';

export const isDummyId = (v) => typeof v === 'string' && DUMMY_PREFIXES.some((p) => v.startsWith(p));

export const isDummyRun = (r) => isDummyId(r.run_id);
export const isDummyQuestion = (q) => isDummyId(q.question_id) || isDummyId(q.send_id) || isDummyId(q.run_id);
export const isDummySend = (s) => isDummyId(s.send_id);
export const isDummyMessage = (m) => isDummyId(m.message_id) || isDummyId(m.run_id);
export const isDummyBeat = (b) => isDummyId(b.host);

export const real = (rows, isDummy) => rows.filter((r) => !isDummy(r));
