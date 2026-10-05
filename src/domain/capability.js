// Store capability = (store, function) property derived from data/config - never from store names (REQ §7-4, TV5).
// How a store is marked NOT CONNECTED in Screen Data is UNCONFIRMED (Q-29): the adapter supplies an interim
// per-store `connection` side-channel OUTSIDE the REQ §5-3 schema (docs/implementation-notes.md N-01).
import { EVIDENCE } from '../contract/enums.js';
import { scopeOf } from './schedules.js';
import { answerEvidenceLevel } from './questions.js';

export function storeCapability(store, connection, storeQuestions) {
  const connected = connection === 'connected';
  if (!connected) {
    return {
      connection: 'not_connected',
      evidence: EVIDENCE.NOT_CONNECTED,
      scope: { slot: false, daily: false, lightCheck: false },
      answers: EVIDENCE.NOT_CONNECTED,
    };
  }
  return {
    connection: 'connected',
    evidence: EVIDENCE.CONFIRMED,
    scope: scopeOf(store),
    // Phase 1: answers reach CANDIDATE only until confirmation records exist (REQ §2).
    answers: EVIDENCE[answerEvidenceLevel(storeQuestions)],
  };
}
