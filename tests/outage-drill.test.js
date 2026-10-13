// Outage drill on a test connection (scripts/outage-drill.js), fast clock: proves the detection and recovery logic of the
// real code path (Sheets reader -> contract -> copy adapter -> freshness -> API). Timing evidence comes from --clock real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDrill, SCENARIOS } from '../scripts/outage-drill.js';
import { BANNER_STALE_MINUTES, STOP_DETECTION_MAX_MINUTES } from '../src/domain/constants.js';

test('DRILL-1 copy stops: 更新停止 once the last good copy read is older than the banner limit, normal again after restore', async () => {
  const r = await runDrill({ scenario: 'copy-stops', clock: 'fast' });
  assert.equal(r.copyToScreenMin.n > 0, true, 'new rows reached the API during the normal phase');
  assert.ok(r.detectionMin !== null, 'detected');
  assert.ok(r.detectionFromLastGoodReadMin > BANNER_STALE_MINUTES, 'not before the 20-minute stale limit (no false alarm)');
  assert.ok(r.detectionFromLastGoodReadMin <= BANNER_STALE_MINUTES + 1.5, 'within one read interval + one poll of the limit');
  assert.ok(r.recoveryMin !== null && r.recoveryMin <= 2);
  assert.match(r.notice, /NOT IMPLEMENTED/);
  assert.match(r.source, /TEST CONNECTION/);
});

for (const scenario of ['access-lost', 'api-timeout', 'bad-contract']) {
  test(`DRILL-2 ${scenario}: 更新停止 within ${STOP_DETECTION_MAX_MINUTES} min, normal again after restore`, async () => {
    const r = await runDrill({ scenario, clock: 'fast' });
    assert.ok(r.detectionMin !== null && r.detectionMin <= 2, `detected on the next read (${r.detectionMin})`);
    assert.equal(r.detectionWithinLimit, true);
    assert.equal(r.detectionWithinLimitFromLastGoodRead, true);
    const hit = r.events.find((e) => e.what === 'dashboard shows 更新停止');
    assert.ok(hit.reasons.includes('error'), 'shown as an error, not as old-but-normal data');
    assert.ok(r.recoveryMin !== null && r.recoveryMin <= 2);
  });
}

test('DRILL-3 unknown scenario is refused', async () => {
  await assert.rejects(runDrill({ scenario: 'stop-production', clock: 'fast' }), /scenario must be one of/);
  assert.deepEqual([...SCENARIOS], ['copy-stops', 'access-lost', 'api-timeout', 'bad-contract']);
});
