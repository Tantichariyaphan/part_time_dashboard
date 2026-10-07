// SYNTHETIC View-only Copy / Heartbeat Sheet builders for tests. Nothing here comes from the client's records or
// samples: names, texts, ids and times are invented. Group ids are fake strings that only END in the documented
// 6-character suffixes (they do not look like LINE ids).
import { COPY_COLUMNS, COPY_TAB } from '../src/contract/copyContract.js';
import { COLUMNS } from '../src/contract/columns.js';
import { createCopyAdapter, notConnectedReader } from '../src/adapters/copy/copyAdapter.js';
import { store as storeRow, schedules as scheduleRows } from './helpers.js';

export const GROUP_ID = { MEAT: 'TESTGRP-2c54ac', IN: 'TESTGRP-c894fd', ALL: 'TESTGRP-47247d', MANAGEMENT: 'TESTGRP-15c2bf', PHOTO: 'TESTGRP-49fcce', LINK: 'TESTGRP-4846a3' };

export const READ_AT = '2026-10-07T13:55:00+07:00';
export const NOW = Date.parse('2026-10-07T14:00:00+07:00');

let seq = 0;
export const log = (over = {}) => {
  seq += 1;
  const g = over['群'] ?? 'MEAT';
  return { 元の行番号: String(100 + seq), 日時: '2026-10-07T12:01:00+07:00', グループID: GROUP_ID[g] ?? 'TESTGRP-000000', 群: g, 発言者: 'Staff One',
    発言者キー: 'K-0001', 種別: 'text', 内容: `hello ${seq}`, messageId: `90000000${String(seq).padStart(10, '0')}`, 再送: '', 取消: '', ...over };
};
export const send = (over = {}) => {
  seq += 1;
  return { 元の行番号: String(500 + seq), 日時: '2026-10-07T12:03:00+07:00', 宛先: 'MEAT', 宛先の群: 'MEAT', 宛先キー: 'D-0001', 文面: `reply ${seq}`, 結果: 'OK', 返した元の発言: '', ...over };
};
export const question = (over = {}) => {
  seq += 1;
  return { 元の行番号: String(700 + seq), question_id: `Q-TEST-${seq}`, 送信時刻: '2026-10-05T12:13:00+07:00', group: 'MEAT', who: 'Staff One',
    question_th: `question ${seq}`, source_candidate_sha256: 'abc', slot: '2026-10-05 12:00', state: 'waiting', ...over };
};
export const beat = (over = {}) => {
  seq += 1;
  return { 元の行番号: String(800 + seq), 時刻: '2026-10-07T13:00:00+07:00', 読んだ行数: '3', 候補数: '0', 送信MEAT: '無言', 送信IN: '無言', 結果: 'AI=scheduled-off', 実行ms: '1200', gap分: '60', ...over };
};
export const metaRow = (tab, over = {}) => ({ tab, last_read_at: READ_AT, updated_at: READ_AT, source_rows: '1', copied_rows: '1', contract_version: 'v1', status: 'ok', detail: '', ...over });

const toTable = (columns, rows) => ({ header: [...columns], rows: rows.map((r) => columns.map((c) => r[c] ?? '')) });

/** A full, valid copy read. `rows` overrides per tab key (log/sendLog/questions/heartbeat/meta). */
export function copyRead(rows = {}) {
  const data = {
    log: rows.log ?? [log(), log({ 群: 'PHOTO', 種別: 'image', 内容: '[image]' })],
    sendLog: rows.sendLog ?? [send()],
    questions: rows.questions ?? [question()],
    heartbeat: rows.heartbeat ?? [beat()],
    meta: rows.meta ?? ['ログ', '送信ログ', 'AI質問追跡', '心拍'].map((t) => metaRow(t)),
  };
  const tables = {};
  for (const [key, list] of Object.entries(data)) tables[COPY_TAB[key]] = toTable(COPY_COLUMNS[key], list);
  return { titles: Object.values(COPY_TAB), tables };
}

export const beatsRow = (over = {}) => ({ received_at: '2026-10-07T13:58:00+07:00', host: 'h1', role: 'production', stores: 'S', verify: 'PASS', fail_items: '',
  chatgpt: 'TRUE', drive: 'TRUE', g_mounted: 'TRUE', disk_free_gb: '40', clock_offset_sec: '0', text_patrol_at: '2026-10-07T13:50:00+07:00', ...over });
export function heartbeatRead({ beats = [beatsRow()], alerts = [] } = {}) {
  return { titles: ['beats', 'alerts'], tables: { beats: toTable(COLUMNS.beats, beats), alerts: toTable(COLUMNS.alerts, alerts) } };
}

/** In-memory reader (stands in for the reader account; returns whatever the test sets). */
export function memoryReader(initial) {
  const r = { connected: true, data: initial, reads: 0, fail: null };
  r.read = async () => { r.reads += 1; if (r.fail) throw r.fail; return structuredClone(r.data); };
  return r;
}

export const testConfig = (over = {}) => ({
  store: 'S', timezone: null, stores: [storeRow({ production_host: 'h1' })], schedules: scheduleRows.map((s) => ({ ...s })), ...over,
});

export function adapterWith({ copy = copyRead(), heartbeat = null, config = testConfig(), now = () => NOW } = {}) {
  const copyReader = copy && copy.connected !== undefined ? copy : copy ? memoryReader(copy) : notConnectedReader('reader_account_pending');
  const heartbeatReader = heartbeat && heartbeat.connected !== undefined ? heartbeat : heartbeat ? memoryReader(heartbeat) : notConnectedReader('reader_account_pending');
  return { adapter: createCopyAdapter({ config, copyReader, heartbeatReader, now, minReadIntervalMs: 0, log: () => {} }), copyReader, heartbeatReader };
}
