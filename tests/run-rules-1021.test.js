// Client rules of 2026-10-21 「NIKUSHO 巡回・日次の状態判定ルール」 (1/7 - 7/7), as far as they can be applied with the evidence the
// dashboard has today (copy + beats). SYNTHETIC data only: passing here says nothing about the live runs of 10/20.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S } from '../public/app/strings.ja.js';
import { runLabel, runTone } from '../public/app/status.js';
import { lightCheck } from '../src/domain/production.js';
import { dayRuns } from '../src/domain/runs.js';
import { T, store } from './helpers.js';

const cfg = JSON.parse(readFileSync(new URL('../config/stores.json', import.meta.url), 'utf8'));
const bangna = cfg.stores[0];
const allStrings = [];
(function walk(o) { for (const v of Object.values(o)) { if (typeof v === 'string') allStrings.push(v); else if (typeof v === 'function') allStrings.push(String(v(1, 2))); else if (v && typeof v === 'object') walk(v); } })(S);

test('RULE-1021-1 five separate names: データ更新 / 機械の確認 / 定時 LINE 読取 / 5 分巡回 / 日次配送', () => {
  assert.equal(S.machines.updates, 'データ更新');
  assert.equal(S.all.machine, '機械の確認');
  assert.equal(S.machines.machines, '機械の確認');
  assert.equal(S.kind.slot, '定時 LINE 読取');
  assert.equal(S.all.lightCheck, '5 分巡回');
  assert.equal(S.kind.daily, '日次配送');
  assert.equal(S.periods.patrolRate, '定時読取成功率', '§3: the rate heading is 定時読取成功率');
  assert.equal(new Set([S.machines.updates, S.all.machine, S.kind.slot, S.all.lightCheck, S.kind.daily]).size, 5);
});

test('RULE-1021-2 not-judged results: 定時読取 「未確認」, 日次 「3 経路判定未接続」, never a success / failure colour', () => {
  assert.match(runLabel('unconfirmed', 'slot'), /^未確認/);
  assert.equal(runLabel('unconfirmed', 'daily'), '3 経路判定未接続');
  assert.equal(runTone('unconfirmed'), 'tone-neutral');
  for (const t of ['ok', 'silent_ok', 'late', 'blocked', 'missing', 'no_row']) assert.notEqual(runTone('unconfirmed'), runTone(t), t);
  assert.ok(S.legend.some(([tone, label]) => tone === 'tone-neutral' && label === S.run.unconfirmed));
  assert.equal(S.periods.dailyUnconnected, '3 経路判定未接続');
  assert.equal(S.periods.notTallied, '未集計');
  assert.equal(S.machines.fiveMinNote, '最終稼働時刻のみ確認／全件判定未接続');
});

test('RULE-1021-3 the rules have arrived: no screen text says they are pending; no text claims what the evidence cannot prove', () => {
  // 「動作確認」 is allowed only in the labels used when the client's per-run 5-min records are connected (fiveMinCheck `confirmed`)
  const evidenceOnly = new Set([S.machines.fiveMinConfirmed(1, 2), S.all.fiveMin.confirmed(1)]);
  for (const s of allStrings) {
    assert.doesNotMatch(s, /判定ルール待ち|連絡待ち|未決定|状態未判定/, s);
    assert.doesNotMatch(s, /LINE API 受付|巡回成功|送信済み/, `${s} (not provable from the connected evidence)`);
    if (!evidenceOnly.has(s)) assert.doesNotMatch(s, /動作確認/, s);
  }
  assert.equal(S.sendResult.sent, '送信受付', '送信ログ OK is the sending script acceptance only');
});

test('RULE-1021-4 deadlines from config (client 10/21): 12→13:30, 17→18:30, 22→23:30, daily D → D+1 01:35 (Asia/Bangkok)', () => {
  assert.equal(bangna.slot_deadline_min, 90);
  assert.equal(bangna.daily_deadline_min, 60);
  assert.ok(!cfg._provisional.includes('stores.slot_deadline_min') && !cfg._provisional.includes('stores.daily_deadline_min'));
  const at = (kind, time, nowIso) => dayRuns({ store: bangna, schedules: cfg.schedules, runs: [], day: '2026-10-20', now: T(nowIso), currentDay: '2026-10-20', statusUnconfirmed: true })
    .items.find((i) => i.kind === kind && i.time === time).status;
  for (const [time, deadline, before] of [['12:00', '13:30', '13:29'], ['17:00', '18:30', '18:29'], ['22:00', '23:30', '23:29']]) {
    assert.equal(at('slot', time, `2026-10-20T${time}:00+07:00`), 'awaiting', `${time} at its time`);
    assert.equal(at('slot', time, `2026-10-20T${before}:59+07:00`), 'awaiting', `${time} just before ${deadline}`);
    assert.equal(at('slot', time, `2026-10-20T${deadline}:00+07:00`), 'unconfirmed', `${time} at ${deadline}: 未確認, never missing`);
  }
  // business day 2026-10-20: daily at 2026-10-21 00:35, deadline 01:35
  assert.equal(at('daily', '00:35', '2026-10-21T00:32:00+07:00'), 'not_due');
  assert.equal(at('daily', '00:35', '2026-10-21T01:34:00+07:00'), 'awaiting');
  assert.equal(at('daily', '00:35', '2026-10-21T01:35:00+07:00'), 'unconfirmed');
  // the 17:00 slot exists only from 2026-10-02
  const before = dayRuns({ store: bangna, schedules: cfg.schedules, runs: [], day: '2026-10-01', now: T('2026-10-02T09:00:00+07:00'), currentDay: '2026-10-02', statusUnconfirmed: true });
  assert.deepEqual(before.items.filter((i) => i.kind === 'slot').map((i) => i.time).sort(), ['12:00', '22:00']);
});

test('RULE-1021-5 5 分巡回: ≤15 min last-run only, 16–20 遅延／要確認, >20 stop detection, outside 10:00–24:00 時間外', () => {
  const s = store();
  const beat = (over) => ({ host: 'h1', role: 'production', received_at: '2026-10-20T12:00:00+07:00', verify: 'PASS', text_patrol_at: '2026-10-20T12:00:00+07:00', ...over });
  const lc = (nowIso, beats = [beat()]) => lightCheck(s, beats, T(nowIso));
  assert.deepEqual([lc('2026-10-20T12:15:00+07:00').state, lc('2026-10-20T12:15:00+07:00').stopDetected], ['ok', false]);
  assert.equal(lc('2026-10-20T12:15:00+07:00').lastRunAt, '2026-10-20T12:00:00+07:00', 'last-run time in the store zone');
  assert.deepEqual([lc('2026-10-20T12:16:00+07:00').state, lc('2026-10-20T12:16:00+07:00').stopDetected], ['red', false], 'REQ TV14 red kept; label 遅延／要確認');
  assert.deepEqual([lc('2026-10-20T12:20:00+07:00').state, lc('2026-10-20T12:20:00+07:00').stopDetected], ['red', false]);
  assert.deepEqual([lc('2026-10-20T12:21:00+07:00').state, lc('2026-10-20T12:21:00+07:00').stopDetected], ['red', true], 'over 20 min: stop detection');
  assert.equal(lc('2026-10-20T09:59:00+07:00').state, 'off_hours');
  assert.equal(lc('2026-10-21T00:00:00+07:00').state, 'off_hours', '24:00 = end of window');
  // a PASS beat with no text_patrol_at is not a 5-min success
  assert.equal(lc('2026-10-20T12:05:00+07:00', [beat({ text_patrol_at: '' })]).state, 'unknown');
  // a standby machine's recent patrol time never stands in for the production machine
  const standby = beat({ host: 'h2', role: 'standby', text_patrol_at: '2026-10-20T12:30:00+07:00', received_at: '2026-10-20T12:30:00+07:00' });
  assert.equal(lc('2026-10-20T12:31:00+07:00', [beat(), standby]).stopDetected, true);
  assert.match(S.machines.fiveMinStop(25), /20分超/);
  assert.match(S.machines.fiveMinLate(17), /遅延／要確認/);
});

test('RULE-1021-6 pages: ⑦ one row per state, the 5-min / reply rate is 未集計; ⑥ and ① carry the 5-min note', () => {
  const page = (f) => readFileSync(new URL(`../public/app/pages/${f}`, import.meta.url), 'utf8');
  const p = page('periods.js');
  assert.match(p, /S\.periods\.fiveMinRate, \.\.\.col\(\(\) => h\('span', \{ class: 'muted' \}, S\.periods\.notTallied\)\)/);
  assert.match(p, /rateCell\(m\.dailyRate, m\.runUnconfirmedKinds\?\.daily === false \? S\.periods\.runUnconfirmed : S\.periods\.dailyUnconnected\)/);
  assert.match(page('machines.js'), /S\.machines\.fiveMinNote/);
  assert.match(page('allStores.js'), /S\.machines\.fiveMinNote/);
  for (const f of ['today.js', 'failures.js']) assert.match(page(f), /runLabel\(r\.status, r\.kind\)/, `${f}: label by kind`);
});
