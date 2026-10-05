// Demo adapter: fixed anonymized snapshot (REQ §7-12). Separate entry, separate dataset.
//  - never reads production data, never updates, no production/demo switch
//  - the clock is FROZEN at the snapshot's reference time, so the fixed data is always judged as of then
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseMs } from '../../domain/time.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'demoScreenData.json');

export function createDemoAdapter() {
  let cached = null;
  return {
    kind: 'demo',
    async load() {
      if (!cached) cached = JSON.parse(readFileSync(FILE, 'utf8'));
      return { kind: 'demo', now: parseMs(cached.referenceNow), raw: cached.raw, storeConnection: cached.storeConnection };
    },
  };
}
