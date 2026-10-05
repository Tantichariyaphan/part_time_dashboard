// Development-only mock adapter. Used by the LIVE entry ONLY when explicitly started in dev-mock mode,
// and then every page carries a permanent "DEV MOCK - not real data" strip. It is not production data.
import { buildMockTabs, SCENARIOS } from './fixtures.js';

export function createDevMockAdapter({ scenario = 'full' } = {}) {
  if (!SCENARIOS.includes(scenario)) throw new Error(`unknown scenario "${scenario}" (allowed: ${SCENARIOS.join(', ')})`);
  return {
    kind: 'devmock',
    scenario,
    async load() {
      const now = Date.now();
      const { raw, storeConnection } = buildMockTabs(now, { variant: 'dev', scenario });
      return { kind: 'devmock', now, raw, storeConnection };
    },
  };
}
