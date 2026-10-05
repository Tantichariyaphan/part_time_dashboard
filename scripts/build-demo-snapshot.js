// Builds the FIXED, anonymized demo dataset (REQ §7-12): same columns as Screen Data, no real names.
// The result is a static JSON "sheet"; the demo entry never reads production data and never updates.
// CONTENT IS A DRAFT: the client must review and approve demo content (REQ §3 #3) - UNCONFIRMED until approved.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildMockTabs } from '../src/adapters/mock/fixtures.js';
import { parseMs } from '../src/domain/time.js';

export const DEMO_REFERENCE_NOW = '2026-10-02T13:50:00+07:00';

const now = parseMs(DEMO_REFERENCE_NOW);
const { raw, storeConnection } = buildMockTabs(now, { variant: 'demo', scenario: 'full', days: 31 });
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'adapters', 'demo', 'demoScreenData.json');
writeFileSync(out, JSON.stringify({ referenceNow: DEMO_REFERENCE_NOW, storeConnection, raw }, null, 1) + '\n');
console.log(`wrote ${out}`);
