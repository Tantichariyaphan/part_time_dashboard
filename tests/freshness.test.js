import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFreshness, dayCoverage, countWithCoverage } from '../src/domain/freshness.js';
import { businessDayWindow } from '../src/domain/time.js';
import { mockContext, store, T } from './helpers.js';

test('fresh mock data is normal', () => {
  assert.equal(mockContext().freshness.state, 'normal');
});

test('any required tab that is not ok marks the whole screen stopped', () => {
  for (const scenario of ['stale-messages', 'stopped', 'error']) {
    const f = mockContext({ scenario }).freshness;
    assert.equal(f.state, 'stopped', scenario);
    assert.ok(f.reasons.length > 0, scenario);
  }
});

test('generated_at older than 20 minutes is stopped; exactly 20 is not', () => {
  const now = T('2026-10-02T13:50:00+07:00');
  const meta = (gen) => ['ทะเบียนรอบตรวจ', 'ทะเบียนคำถาม', 'บันทึกการส่ง', 'ทะเบียนข้อความ'].map((tab) => ({
    tab, generated_at: gen, last_success_at: gen, source_through: gen, status: 'ok', detail: null }));
  assert.equal(computeFreshness(meta('2026-10-02T13:30:00+07:00'), {}, now).state, 'normal');
  assert.equal(computeFreshness(meta('2026-10-02T13:29:00+07:00'), {}, now).state, 'stopped');
});

test('missing meta rows are stopped (never assumed normal)', () => {
  assert.equal(computeFreshness([], {}, T('2026-10-02T13:50:00+07:00')).state, 'stopped');
});

test('a day that was never pulled shows "not pulled", not 0 items', () => {
  const s = store();
  const { start } = businessDayWindow('2026-10-02', s);
  assert.equal(dayCoverage(start - 1, s, '2026-10-02', start + 3600000), 'none');
  assert.deepEqual(countWithCoverage(0, 'none'), { value: null, state: 'unpulled' });
  assert.deepEqual(countWithCoverage(0, 'complete'), { value: 0, state: 'zero' });
  assert.equal(countWithCoverage(0, 'partial_today').state, 'zero_so_far');
});
