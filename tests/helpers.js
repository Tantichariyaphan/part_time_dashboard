// Shared builders for tests. Everything here is synthetic.
import { buildMockTabs } from '../src/adapters/mock/fixtures.js';
import { buildContext } from '../src/viewmodels/context.js';

export const T = (iso) => Date.parse(iso);

export const store = (over = {}) => ({
  store: 'S', display_name: 'S', timezone: 'Asia/Bangkok', business_day_start: '05:00',
  slot_times: '12:00,22:00', slot_deadline_min: 60, daily_deadline_min: 60, daily_time: '00:35',
  text_patrol: '10:00-24:00', production_host: 'h1', active: 'yes', ...over,
});

export const schedules = [
  { store: 'S', kind: 'slot', times: '12:00,22:00', valid_from: '2026-01-01', valid_to: null },
  { store: 'S', kind: 'daily', times: '00:35', valid_from: '2026-01-01', valid_to: null },
];

export function mockContext({ scenario = 'full', now = T('2026-10-02T13:50:00+07:00'), variant = 'dev', mutate } = {}) {
  const { raw, storeConnection } = buildMockTabs(now, { variant, scenario });
  if (mutate) mutate(raw);
  return buildContext({ kind: variant === 'demo' ? 'demo' : 'devmock', now, raw, storeConnection });
}
