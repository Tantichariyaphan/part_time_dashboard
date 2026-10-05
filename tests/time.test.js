import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDayOf, businessDayWindow, zonedInstant, formatIso, addDays } from '../src/domain/time.js';
import { store, T } from './helpers.js';

test('business day follows the STORE time zone and business_day_start, not the viewer (TV16)', () => {
  const instant = T('2026-10-02T03:00:00+07:00'); // 05:00 in Tokyo, 03:00 in Bangkok
  assert.equal(businessDayOf(instant, store({ timezone: 'Asia/Bangkok' })), '2026-10-01'); // before 05:00 -> previous day
  assert.equal(businessDayOf(instant, store({ timezone: 'Asia/Tokyo' })), '2026-10-02');
});

test('business day boundary is exactly business_day_start', () => {
  const s = store();
  assert.equal(businessDayOf(T('2026-10-02T04:59:59+07:00'), s), '2026-10-01');
  assert.equal(businessDayOf(T('2026-10-02T05:00:00+07:00'), s), '2026-10-02');
});

test('business day window spans start to next start', () => {
  const { start, end } = businessDayWindow('2026-10-02', store());
  assert.equal(formatIso(start), '2026-10-02T05:00:00+07:00');
  assert.equal(formatIso(end), '2026-10-03T05:00:00+07:00');
});

test('"24:00" rolls over to the next midnight', () => {
  assert.equal(formatIso(zonedInstant('2026-10-02', '24:00', 'Asia/Bangkok')), '2026-10-03T00:00:00+07:00');
});

test('addDays crosses month ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
});
