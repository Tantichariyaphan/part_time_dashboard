import test from 'node:test';
import assert from 'node:assert/strict';
import { answerEvidenceLevel, readAnswers } from '../src/domain/questions.js';
import { effectiveHandling, messageRow } from '../src/domain/messages.js';
import { periods, questions as questionsVm } from '../src/viewmodels/pages.js';
import { mockContext } from './helpers.js';

const q = (over) => ({ question_id: 'MOCK-Q1', state: 'waiting', answers_json: '[]', ...over });

test('evidence level: candidate is never confirmed', () => {
  const cand = JSON.stringify([{ at: '2026-10-02T10:00:00+07:00', link: 'candidate' }]);
  const conf = JSON.stringify([{ at: '2026-10-02T10:00:00+07:00', link: 'confirmed' }]);
  assert.equal(answerEvidenceLevel([q({ state: 'candidate', answers_json: cand })]), 'CANDIDATE');
  assert.equal(answerEvidenceLevel([q({ state: 'answered', answers_json: conf })]), 'CONFIRMED');
  assert.equal(answerEvidenceLevel([q()]), 'UNKNOWN');
});

test('corrupt answers_json is reported, never repaired', () => {
  assert.equal(readAnswers(q({ answers_json: '{oops' })).ok, false);
});

test('Phase 1 data: response rate is not concluded, never 0%', () => {
  const ctx = mockContext({ scenario: 'phase1' });
  const a = periods(ctx, 7).stores.find((s) => s.connection === 'connected').metrics.responseRate;
  assert.notEqual(a.state, 'value');
  assert.ok(['not_concluded', 'none'].includes(a.state));
});

test('full data: candidates are counted separately and NOT in the rate', () => {
  const ctx = mockContext();
  const m = periods(ctx, 7).stores.find((s) => s.connection === 'connected').metrics;
  assert.equal(m.responseRate.state, 'value');
  assert.ok(m.responseRate.candidateCount >= 1);
  assert.ok(m.responseRate.numerator <= m.responseRate.denominator);
});

test('DUMMY- rows never enter real summaries', () => {
  const base = mockContext();
  const withDummy = mockContext({ mutate: (raw) => {
    raw.questions.rows.push({ ...raw.questions.rows[0], question_id: 'DUMMY-Q1', send_id: 'DUMMY-S1' });
    raw.runs.rows.push({ ...raw.runs.rows[0], run_id: 'DUMMY-R1', status: 'blocked' });
  } });
  const pick = (ctx) => periods(ctx, 7).stores.find((s) => s.connection === 'connected').metrics;
  assert.deepEqual(pick(withDummy).stopped, pick(base).stopped);
  assert.equal(pick(withDummy).questionsSent, pick(base).questionsSent);
});

test('a Bot "replied" without a confirmed sent reply is downgraded to unknown', () => {
  assert.equal(effectiveHandling({ handling: 'replied' }, []), 'unknown');
  assert.equal(effectiveHandling({ handling: 'replied' }, [{ result: 'sent', link: 'candidate' }]), 'unknown');
  assert.equal(effectiveHandling({ handling: 'replied' }, [{ result: 'sent', link: 'confirmed' }]), 'replied');
});

test('registry text stays verbatim text (HTML-looking text is data, not markup)', () => {
  const ctx = mockContext();
  const hit = ctx.screen.messages.map(messageRow).find((r) => /<b>test<\/b>/.test(r.text ?? ''));
  assert.ok(hit, 'fixture contains an HTML-looking text row');
  assert.equal(hit.text.includes('<b>test</b>'), true);
});

test('questions view for a Phase 1 store reports CANDIDATE evidence', () => {
  const ctx = mockContext({ scenario: 'phase1' });
  assert.notEqual(questionsVm(ctx, 'STORE_A').answerEvidence, 'CONFIRMED');
});
