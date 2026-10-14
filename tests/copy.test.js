// View-only Copy connector: Data Contract v1, contract validation, Transform, limits (Q-49 / Q-52), heartbeat source.
// SYNTHETIC data only (tests/copyFixtures.js). Passing here is NOT evidence about the client's real copy (TV9/TV24 are type A).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildContext } from '../src/viewmodels/context.js';
import * as vm from '../src/viewmodels/pages.js';
import { COPY_COLUMNS, COPY_TAB, FORBIDDEN_FIELDS } from '../src/contract/copyContract.js';
import { ALLOWED_GROUPS } from '../src/contract/enums.js';
import { parseCopyTime, validateCopy } from '../src/adapters/copy/validate.js';
import { transformCopy } from '../src/adapters/copy/transform.js';
import { storeMachine } from '../src/domain/production.js';
import {
  NOW, READ_AT, adapterWith, beat, beatsRow, copyRead, heartbeatRead, log, memoryReader, metaRow, question, send, testConfig,
} from './copyFixtures.js';
import { adapterWith as adapterWithBase } from './copyFixtures.js';

const ctxOf = async (opts) => buildContext(await adapterWith(opts).adapter.load());
const problems = (r) => r.sources.copy.tabs.flatMap((t) => t.findings.map((f) => f.problem));
const tabState = (r, name) => r.sources.copy.tabs.find((t) => t.tab === name)?.state;
const withHeader = (read, tab, header) => { read.tables[tab].header = header; return read; };

// ------------------------------------------------------------------ contract shape
test('COPY-1 Data Contract v1: exact tabs and columns as fixed by the client on 10/7', () => {
  assert.deepEqual(Object.values(COPY_TAB), ['ログ', '送信ログ', 'AI質問追跡', '心拍', 'meta']);
  assert.deepEqual(COPY_COLUMNS.log, ['元の行番号', '日時', 'グループID', '群', '発言者', '発言者キー', '種別', '内容', 'messageId', '再送', '取消']);
  assert.deepEqual(COPY_COLUMNS.sendLog, ['元の行番号', '日時', '宛先', '宛先の群', '宛先キー', '文面', '結果', '返した元の発言']);
  assert.deepEqual(COPY_COLUMNS.questions, ['元の行番号', 'question_id', '送信時刻', 'group', 'who', 'question_th', 'source_candidate_sha256', 'slot', 'state']);
  assert.deepEqual(COPY_COLUMNS.heartbeat, ['元の行番号', '時刻', '読んだ行数', '候補数', '送信MEAT', '送信IN', '結果', '実行ms', 'gap分']);
  assert.deepEqual(COPY_COLUMNS.meta, ['tab', 'last_read_at', 'updated_at', 'source_rows', 'copied_rows', 'contract_version', 'status', 'detail']);
  assert.deepEqual(FORBIDDEN_FIELDS, ['userId', '宛先ID', '画像URL']);
  assert.deepEqual(ALLOWED_GROUPS, ['MEAT', 'IN', 'ALL', 'MANAGEMENT', 'PHOTO']);
  assert.equal(ALLOWED_GROUPS.includes('OWNER'), false, 'OWNER is a recipient class, not a group');
});

test('COPY-2 a valid copy connects: messages and sends reach the existing pipeline; banner normal', async () => {
  const r = await adapterWith().adapter.load();
  assert.equal(r.kind, 'copy');
  assert.equal(r.sources.copy.state, 'CONNECTED');
  assert.equal(r.storeConnection.S, 'connected');
  const ctx = buildContext(r);
  assert.equal(ctx.freshness.state, 'normal', JSON.stringify(ctx.freshness.reasons));
  assert.equal(ctx.screen.messages.length, 2);
  assert.equal(ctx.screen.sends.length, 1);
  assert.deepEqual(ctx.validation.invalid, []);
  const page = vm.messages(ctx, 'S', '2026-10-07');
  assert.equal(page.total.state, 'count');
  assert.equal(page.total.value, 2);
  const photo = page.items.find((m) => m.kind === 'photo');
  assert.equal(photo.text, null, 'image placeholder text is never carried');
});

// ------------------------------------------------------------------ required tabs / columns / meta
test('COPY-3 a missing data tab blocks that tab only; a missing meta tab blocks the whole copy', async () => {
  const noSend = copyRead(); delete noSend.tables['送信ログ']; noSend.titles = noSend.titles.filter((t) => t !== '送信ログ');
  let r = await adapterWith({ copy: noSend }).adapter.load();
  assert.equal(r.sources.copy.state, 'PARTIAL');
  assert.equal(tabState(r, '送信ログ'), 'blocked');
  assert.equal(r.raw.sends.rows.length, 0);
  assert.equal(r.raw.messages.rows.length, 2, 'ログ still connected');
  assert.equal(buildContext(r).freshness.state, 'stopped');

  const noMeta = copyRead(); delete noMeta.tables.meta;
  r = await adapterWith({ copy: noMeta }).adapter.load();
  assert.equal(r.sources.copy.state, 'BLOCKED');
  for (const k of ['messages', 'sends', 'questions', 'runs']) assert.equal(r.raw[k].rows.length, 0, k);
  assert.ok(r.raw.meta.rows.every((m) => m.status === 'error'));
});

test('COPY-4 required columns: missing, unexpected, duplicated or re-ordered columns block the tab', async () => {
  const cols = COPY_COLUMNS.log;
  const cases = [
    [cols.filter((c) => c !== '取消'), 'missing_column'],
    [[...cols, 'メモ'], 'unexpected_column'],
    [[cols[1], cols[0], ...cols.slice(2)], 'column_order'],
    [[...cols.slice(0, -1), '再送'], 'duplicate_column'],
  ];
  for (const [header, problem] of cases) {
    const r = await adapterWith({ copy: withHeader(copyRead(), 'ログ', header) }).adapter.load();
    assert.equal(tabState(r, 'ログ'), 'blocked', problem);
    assert.ok(problems(r).includes(problem), `${problem}: ${problems(r)}`);
    assert.equal(r.raw.messages.rows.length, 0);
  }
});

test('COPY-5 meta structure: one row per tab, contract v1, readable last_read_at, no unknown tabs', async () => {
  const metas = (over) => ['ログ', '送信ログ', 'AI質問追跡', '心拍'].map((t) => metaRow(t, over[t] ?? {}));
  let r = await adapterWith({ copy: copyRead({ meta: metas({ ログ: { contract_version: 'v2' } }) }) }).adapter.load();
  assert.equal(tabState(r, 'ログ'), 'blocked');
  assert.ok(problems(r).includes('contract_version'));
  r = await adapterWith({ copy: copyRead({ meta: metas({ 送信ログ: { last_read_at: '' } }) }) }).adapter.load();
  assert.equal(tabState(r, '送信ログ'), 'blocked');
  r = await adapterWith({ copy: copyRead({ meta: [...metas({}), metaRow('ログ')] }) }).adapter.load();
  assert.equal(r.sources.copy.state, 'BLOCKED', 'duplicate meta row');
  r = await adapterWith({ copy: copyRead({ meta: [...metas({}), metaRow('予約')] }) }).adapter.load();
  assert.equal(r.sources.copy.state, 'BLOCKED', 'unknown tab in meta');
  r = await adapterWith({ copy: copyRead({ meta: metas({}).filter((m) => m.tab !== '心拍') }) }).adapter.load();
  assert.equal(tabState(r, '心拍'), 'blocked');
  assert.ok(problems(r).includes('no_meta_row'));
});

test('COPY-5b a meta row for the meta tab itself is accepted and not used for freshness; a second one still blocks', async () => {
  const metas = ['ログ', '送信ログ', 'AI質問追跡', '心拍'].map((t) => metaRow(t));
  const stale = metaRow('meta', { last_read_at: '2026-10-01T00:00:00+07:00', status: 'error' }); // would stop the banner if it were used
  let r = await adapterWith({ copy: copyRead({ meta: [...metas, stale] }) }).adapter.load();
  assert.equal(r.sources.copy.state, 'CONNECTED');
  const ctx = buildContext(r);
  assert.equal(ctx.freshness.state, 'normal', 'the meta self-row does not drive any tab');
  assert.equal(ctx.screen.meta.length, 4);
  r = await adapterWith({ copy: copyRead({ meta: [...metas, metaRow('meta'), metaRow('meta')] }) }).adapter.load();
  assert.equal(r.sources.copy.state, 'BLOCKED');
  assert.ok(problems(r).includes('duplicate_meta_row') || r.sources.copy.metaTab.findings.some((f) => f.problem === 'duplicate_meta_row'));
  r = await adapterWith({ copy: copyRead({ meta: [...metas, metaRow('予約')] }) }).adapter.load();
  assert.equal(r.sources.copy.state, 'BLOCKED', 'other unknown names still block');
});

test('COPY-6 an unexpected tab in the copy blocks the whole copy (other tabs are never read)', async () => {
  const read = copyRead(); read.titles.push('予約');
  const r = await adapterWith({ copy: read }).adapter.load();
  assert.equal(r.sources.copy.state, 'BLOCKED');
  assert.equal(r.raw.messages.rows.length, 0);
});

// ------------------------------------------------------------------ forbidden fields / groups
test('COPY-7 forbidden fields: a userId / 宛先ID / 画像URL column blocks the tab and its values never reach the output', async () => {
  for (const [tab, field] of [['ログ', 'userId'], ['ログ', '画像URL'], ['送信ログ', '宛先ID'], ['AI質問追跡', 'userId']]) {
    const read = copyRead();
    read.tables[tab].header.push(field);
    read.tables[tab].rows.forEach((row) => row.push('LEAK-MARKER-VALUE'));
    const r = await adapterWith({ copy: read }).adapter.load();
    assert.equal(tabState(r, tab), 'blocked', `${tab}.${field}`);
    assert.ok(problems(r).includes('forbidden_field'));
    const body = JSON.stringify(r);
    assert.equal(body.includes('LEAK-MARKER-VALUE'), false, 'no value of a forbidden column is carried, not even in findings');
  }
});

test('COPY-8 forbidden field names inside a header (e.g. an annotated column) are caught too', async () => {
  const header = COPY_COLUMNS.log.map((c) => (c === '発言者キー' ? '発言者キー（userIdの代わり）' : c));
  const r = await adapterWith({ copy: withHeader(copyRead(), 'ログ', header) }).adapter.load();
  assert.ok(problems(r).includes('forbidden_field'));
});

test('COPY-9 allowed groups only: LINK, other groups and group-id mismatches block ログ; OWNER is a recipient class only', async () => {
  for (const row of [log({ 群: 'LINK' }), log({ 群: 'MEAT', グループID: 'TESTGRP-4846a3' }), log({ 群: 'MEAT', グループID: 'TESTGRP-c894fd' }), log({ 群: 'OWNER' })]) {
    const r = await adapterWith({ copy: copyRead({ log: [log(), row] }) }).adapter.load();
    assert.equal(tabState(r, 'ログ'), 'blocked', JSON.stringify(row));
    assert.equal(r.raw.messages.rows.length, 0, 'never filtered row by row: the tab stops');
  }
  let r = await adapterWith({ copy: copyRead({ sendLog: [send({ 宛先の群: 'OWNER', 宛先: 'Owner' })] }) }).adapter.load();
  assert.equal(tabState(r, '送信ログ'), 'ok');
  assert.equal(r.raw.sends.rows[0].target_kind, 'owner');
  r = await adapterWith({ copy: copyRead({ sendLog: [send({ 宛先の群: 'LINK' })] }) }).adapter.load();
  assert.equal(tabState(r, '送信ログ'), 'blocked');
  r = await adapterWith({ copy: copyRead({ questions: [question({ group: 'OWNER' })] }) }).adapter.load();
  assert.equal(tabState(r, 'AI質問追跡'), 'blocked');
});

test('COPY-10 malformed rows block the tab: bad / duplicate 元の行番号, blank rows, blank messageId, LINE ids, misplaced URLs', async () => {
  const lineLike = `U${'a1'.repeat(16)}`;
  const cases = [
    [{ log: [log({ 元の行番号: 'x1' })] }, 'ログ', 'malformed_row_identity'],
    [{ log: [log({ 元の行番号: '' })] }, 'ログ', 'missing_row_identity'],
    [{ log: [log({ 元の行番号: '7' }), log({ 元の行番号: '7' })] }, 'ログ', 'duplicate_row_identity'],
    [{ sendLog: [send({ 元の行番号: '9' }), send({ 元の行番号: '9' })] }, '送信ログ', 'duplicate_row_identity'],
    [{ log: [log({ messageId: '' })] }, 'ログ', 'missing_value'],
    [{ log: [log({ 日時: 'yesterday' })] }, 'ログ', 'timestamp_format'],
    [{ log: [log({ 内容: `id ${lineLike}` })] }, 'ログ', 'line_id_in_cell'],
    [{ log: [log({ 発言者キー: 'https://example.invalid/k' })] }, 'ログ', 'url_in_cell'],
    [{ log: [log({ 種別: 'image', 内容: 'https://example.invalid/img.jpg' })] }, 'ログ', 'url_in_media_row'],
    [{ questions: [question({ question_id: 'Q1' }), question({ question_id: 'Q1' })] }, 'AI質問追跡', 'duplicate_key'],
    [{ log: [log({ 取消: 'yes' })] }, 'ログ', 'unexpected_value'],
  ];
  for (const [rows, tab, problem] of cases) {
    const r = await adapterWith({ copy: copyRead(rows) }).adapter.load();
    assert.equal(tabState(r, tab), 'blocked', problem);
    assert.ok(problems(r).includes(problem), `${problem}: ${problems(r)}`);
  }
  const blankRow = copyRead(); blankRow.tables['ログ'].rows.push(COPY_COLUMNS.log.map(() => ''));
  assert.ok(problems(await adapterWith({ copy: blankRow }).adapter.load()).includes('blank_row'));
  // a link typed by staff in a text message is content, not a violation
  const ok = await adapterWith({ copy: copyRead({ log: [log({ 内容: 'see https://example.invalid/menu' })] }) }).adapter.load();
  assert.equal(tabState(ok, 'ログ'), 'ok');
});

test('COPY-10b a messageId the sheet rounded (E / . / ,) is flagged, not blocking: shown under its row number, never merged, value never carried', async () => {
  const bad = ['5.85123E+17', '585,123,456,789,012,345', '585123456789012345.0'];
  const rows = [log({ 元の行番号: '101', messageId: bad[0] }), log({ 元の行番号: '102', messageId: bad[1] }), log({ 元の行番号: '103', messageId: bad[2] }),
    log({ 元の行番号: '104', messageId: bad[0] }), log({ 元の行番号: '105' })]; // 101 and 104 show the same rounded value
  const r = await adapterWith({ copy: copyRead({ log: rows }) }).adapter.load();
  assert.equal(r.sources.copy.state, 'CONNECTED');
  const t = r.sources.copy.tabs.find((x) => x.tab === 'ログ');
  assert.equal(t.state, 'ok');
  assert.equal(t.findingCount, 0);
  assert.equal(t.warningCount, 4);
  assert.deepEqual(t.warnings.map((w) => [w.row, w.column, w.problem]), [['101', 'messageId', 'rounded_identifier'], ['102', 'messageId', 'rounded_identifier'], ['103', 'messageId', 'rounded_identifier'], ['104', 'messageId', 'rounded_identifier']]);
  const msgs = r.raw.messages.rows;
  assert.equal(msgs.length, 5, 'every row counted; the two equal rounded values are NOT merged');
  assert.deepEqual(msgs.filter((m) => m.id_damaged === 'yes').map((m) => m.message_id).sort(), ['ROW-101', 'ROW-102', 'ROW-103', 'ROW-104']);
  assert.equal(msgs.find((m) => m.message_id.startsWith('90000000')).id_damaged, null);
  const out = JSON.stringify(r) + JSON.stringify(vm.messages(buildContext(r), 'S', '2026-10-07'));
  for (const v of bad) assert.equal(out.includes(v), false, 'the rounded value is never carried or shown');
  const row = vm.messages(buildContext(r), 'S', '2026-10-07').items.find((m) => m.message_id === 'ROW-101');
  assert.equal(row.idDamaged, true);
  // a blank messageId still blocks the tab (nothing to key at all)
  const blank = await adapterWith({ copy: copyRead({ log: [log({ messageId: '' })] }) }).adapter.load();
  assert.equal(blank.sources.copy.tabs.find((x) => x.tab === 'ログ').state, 'blocked');
});

test('COPY-11 findings carry tab / 元の行番号 / column / problem only - never a cell value', () => {
  const read = copyRead({ log: [log({ 元の行番号: '42', 群: 'SECRETGROUPVALUE' })] });
  const v = validateCopy(read);
  const f = v.tabs.log.findings.find((x) => x.problem === 'unexpected_group');
  assert.deepEqual(Object.keys(f).sort(), ['column', 'problem', 'row', 'tab']);
  assert.equal(f.row, '42');
  assert.equal(JSON.stringify(v.tabs.log.findings).includes('SECRETGROUPVALUE'), false);
});

// ------------------------------------------------------------------ timestamps (Q-12)
test('COPY-12 timestamps: ISO with offset always; zone-less only with a configured copy time zone (Q-12)', async () => {
  assert.equal(parseCopyTime('2026-10-07T12:00:00+07:00', null), Date.parse('2026-10-07T05:00:00Z'));
  assert.ok(Number.isNaN(parseCopyTime('2026/10/07 12:00:00', null)), 'no zone, no configured zone -> not interpretable');
  assert.equal(parseCopyTime('2026/10/07 9:05:30', 'Asia/Bangkok'), Date.parse('2026-10-07T09:05:30+07:00'));
  assert.ok(Number.isNaN(parseCopyTime('2026/02/30 9:05:30', 'Asia/Bangkok')));
  const zoneless = copyRead({ log: [log({ 日時: '2026/10/07 12:01:00' })] });
  let r = await adapterWith({ copy: zoneless }).adapter.load();
  assert.equal(tabState(r, 'ログ'), 'blocked');
  r = await adapterWith({ copy: zoneless, config: testConfig({ timezone: 'Asia/Bangkok' }) }).adapter.load();
  assert.equal(tabState(r, 'ログ'), 'ok');
  assert.equal(r.raw.messages.rows[0].at, '2026-10-07T12:01:00+07:00');
});

// ------------------------------------------------------------------ update in place / idempotency
test('COPY-13 update in place: 取消, 結果 and state changed on the same 元の行番号 rebuild to the new value, never a second row', async () => {
  const m = log({ 元の行番号: '11', 内容: 'original text' });
  const s = send({ 元の行番号: '21', 結果: 'ATTEMPTING_NO_RETRY' });
  const q = question({ 元の行番号: '31' });
  const { adapter, copyReader } = adapterWith({ copy: copyRead({ log: [m], sendLog: [s], questions: [q] }) });
  let r = await adapter.load();
  assert.equal(r.raw.messages.rows[0].text, 'original text');
  assert.equal(r.raw.sends.rows[0].result, 'unknown');
  copyReader.data = copyRead({ log: [{ ...m, 取消: '取消' }], sendLog: [{ ...s, 結果: 'OK 200' }], questions: [{ ...q, state: 'answered' }] });
  r = await adapter.load();
  assert.equal(r.raw.messages.rows.length, 1);
  assert.equal(r.raw.messages.rows[0].text, null, 'cancelled: content removed on the next rebuild');
  assert.equal(r.raw.messages.rows[0].cancelled, 'yes');
  assert.equal(r.raw.sends.rows.length, 1);
  assert.equal(r.raw.sends.rows[0].result, 'sent');
  assert.equal(r.raw.questions.rows.length, 1);
  assert.equal(r.raw.questions.rows[0].state, null, 'a state other than waiting is not taken without evidence (Q-23) - shown as unknown');
  const row = vm.messages(buildContext(r), 'S', '2026-10-07').items[0];
  assert.equal(row.cancelled, true);
  assert.equal(row.text, null);
});

test('COPY-14 idempotent sync: re-reading the same copy gives identical output; appended rows add only themselves', async () => {
  const read = copyRead();
  const { adapter, copyReader } = adapterWith({ copy: read });
  const a = await adapter.load();
  const b = await adapter.load();
  assert.deepEqual(a.raw, b.raw);
  const v = validateCopy(read);
  const opts = { store: testConfig().stores[0], timezone: null, nowMs: NOW };
  assert.deepEqual(transformCopy(v, opts), transformCopy(validateCopy(structuredClone(read)), opts));
  const before = a.raw.messages.rows.length;
  copyReader.data = copyRead({ log: [...[0, 1].map((i) => Object.fromEntries(read.tables['ログ'].header.map((h, j) => [h, read.tables['ログ'].rows[i][j]]))), log()] });
  const c = await adapter.load();
  assert.equal(c.raw.messages.rows.length, before + 1);
  assert.equal(new Set(c.raw.messages.rows.map((x) => x.message_id)).size, c.raw.messages.rows.length, 'no duplicate messages');
});

test('COPY-15 rows sharing a messageId are one logical message (REQ §5-1); a cancel on any of them hides the content', async () => {
  const r = await adapterWith({ copy: copyRead({ log: [log({ 元の行番号: '1', messageId: '77', 内容: 'a' }), log({ 元の行番号: '2', messageId: '77', 再送: '再送', 取消: '取消' })] }) }).adapter.load();
  assert.equal(r.raw.messages.rows.length, 1);
  assert.equal(r.raw.messages.rows[0].text, null);
  assert.equal(r.sources.copy.collapsedMessageRows, 1);
});

test('COPY-16 the transform never fabricates: answers are candidate only (never confirmed), no run links, no send kinds, unknown results stay unclassified', async () => {
  const r = await adapterWith({ copy: copyRead({ sendLog: [send({ 結果: 'QUEUED' })], log: [log({ 種別: 'video', 内容: '[video]' })] }) }).adapter.load();
  const m = r.raw.messages.rows[0];
  assert.equal(m.kind, 'other');
  assert.equal(m.text, null);
  // REQ §5-1: the same person in the same group after the question -> a possibly-related answer, never a confirmed one
  assert.equal(m.question_link, 'candidate'); assert.equal(m.run_id, null);
  assert.equal(r.raw.sends.rows[0].kind, null);
  assert.equal(r.raw.sends.rows[0].result, null);
  assert.equal(r.sources.copy.unclassified.sendResult, 1);
  for (const q of r.raw.questions.rows) {
    assert.ok(JSON.parse(q.answers_json).every((a) => a.link === 'candidate'));
    assert.notEqual(q.state, 'answered'); assert.equal(q.closed_reason, null); assert.equal(q.run_id, null); assert.equal(q.send_id, null);
  }
  const ctx = buildContext(r);
  assert.equal(vm.failures(ctx).sendProblems.length, 0, 'an unclassified result is not shown as a failure');
  assert.equal(vm.failures(ctx).unclassifiedSends, 1);
});

// ------------------------------------------------------------------ Bot replies (data-mapping §8)
test('COPY-17 Bot reply links only by the column-6 rule: unique -> confirmed; same minute twice -> ambiguous; OWNER -> none', async () => {
  const a = log({ 元の行番号: '1', 日時: '2026-10-07T12:01:10+07:00', 発言者: 'Staff One' });
  const reply = send({ 元の行番号: '9', 返した元の発言: '12:01|Staff One', 結果: 'OK' });
  const config = testConfig({ timezone: 'Asia/Bangkok' }); // zone of the column-6 HH:MM = the copy's configured zone
  const adapterWith = (o) => adapterWithBase({ config, ...o });
  let r = await adapterWith({ copy: copyRead({ log: [a], sendLog: [reply] }) }).adapter.load();
  assert.deepEqual(r.sources.copy.replyLinks, { confirmed: 1, ambiguous: 0, unlinked: 0, zoneUnknown: 0 });
  const replies = JSON.parse(r.raw.messages.rows[0].replies_json);
  assert.equal(replies[0].link, 'confirmed'); assert.equal(replies[0].send_id, 'SL-9');
  assert.equal(r.raw.messages.rows[0].handling, 'replied');

  const b = log({ 元の行番号: '2', 日時: '2026-10-07T12:01:50+07:00', 発言者: 'Staff One' });
  r = await adapterWith({ copy: copyRead({ log: [a, b], sendLog: [reply] }) }).adapter.load();
  assert.deepEqual(r.sources.copy.replyLinks, { confirmed: 0, ambiguous: 1, unlinked: 0, zoneUnknown: 0 });
  assert.ok(r.raw.messages.rows.every((m) => m.replies_json === null && m.handling === null), 'never guessed');

  r = await adapterWith({ copy: copyRead({ log: [a], sendLog: [send({ 宛先の群: 'OWNER', 返した元の発言: '12:01|Staff One' })] }) }).adapter.load();
  assert.deepEqual(r.sources.copy.replyLinks, { confirmed: 0, ambiguous: 0, unlinked: 1, zoneUnknown: 0 });

  // a single candidate written AFTER the send cannot be what it replied to
  const later = log({ 元の行番号: '3', 日時: '2026-10-07T12:01:10+07:00', 発言者: 'Staff One' });
  r = await adapterWith({ copy: copyRead({ log: [later], sendLog: [send({ 日時: '2026-10-07T12:01:00+07:00', 返した元の発言: '12:01|Staff One' })] }) }).adapter.load();
  assert.equal(r.sources.copy.replyLinks.confirmed, 0);
  // without a configured copy zone the column-6 clock cannot be placed: never confirmed
  r = await adapterWithBase({ copy: copyRead({ log: [a], sendLog: [reply] }) }).adapter.load();
  assert.deepEqual(r.sources.copy.replyLinks, { confirmed: 0, ambiguous: 0, unlinked: 1, zoneUnknown: 1 });
  // the clock is read in the copy zone, not the store zone: a message 2 hours later in Bangkok is not "16:05 Tokyo"
  const tokyo = testConfig({ timezone: 'Asia/Tokyo' });
  const msg = log({ 元の行番号: '4', 日時: '2026-10-07T16:05:00+07:00', 発言者: 'A' }); // 18:05 in Tokyo
  r = await adapterWithBase({ config: tokyo, copy: copyRead({ log: [msg], sendLog: [send({ 日時: '2026-10-07T14:07:00+07:00', 返した元の発言: '16:05|A' })] }) }).adapter.load();
  assert.equal(r.sources.copy.replyLinks.confirmed, 0);
});

test('COPY-29 replies whose origin message is unknown are counted on ⑦, not dropped (REQ §6-⑦)', async () => {
  const a = log({ 元の行番号: '1', 日時: '2026-10-07T12:01:10+07:00', 発言者: 'Staff One' });
  const b = log({ 元の行番号: '2', 日時: '2026-10-07T12:01:40+07:00', 発言者: 'Staff One' });
  const ctx = buildContext(await adapterWithBase({ config: testConfig({ timezone: 'Asia/Bangkok' }), copy: copyRead({ log: [a, b], sendLog: [send({ 返した元の発言: '12:01|Staff One' }), send({ 返した元の発言: '09:00|Nobody' }), send()] }) }).adapter.load());
  const m = vm.periods(ctx, '7').stores[0].metrics;
  assert.equal(m.unknownOriginReplies, 2, 'ambiguous + unlinked; a send without column 6 is not a reply');
  assert.equal(m.botReplies.value, 0);
});

test('COPY-30 validation + Transform run once per read; every request until the next read reuses the result', async () => {
  const { createCopyAdapter, notConnectedReader } = await import('../src/adapters/copy/copyAdapter.js');
  const reader = memoryReader(copyRead());
  const adapter = createCopyAdapter({ config: testConfig(), copyReader: reader, heartbeatReader: notConnectedReader('x'), now: () => NOW, minReadIntervalMs: 60_000, log: () => {} });
  const a = await adapter.load();
  const b = await adapter.load();
  assert.equal(a.raw.messages, b.raw.messages, 'same transformed object');
});

test('COPY-31 findings never echo a malformed id cell or a header text', () => {
  const lineLike = `U${'b2'.repeat(16)}`;
  const read = copyRead({ log: [log({ 元の行番号: lineLike }), log({ 元の行番号: 'https://example.invalid/x.jpg' })] });
  read.tables['ログ'].rows.push([...COPY_COLUMNS.log.map(() => '1'), 'EXTRA-CELL-VALUE']);
  let v = validateCopy(read);
  let text = JSON.stringify(v.tabs.log.findings);
  assert.equal(text.includes(lineLike) || text.includes('example.invalid') || text.includes('EXTRA-CELL-VALUE'), false, text);
  assert.ok(v.tabs.log.findings.some((f) => /^#\d+$/.test(f.row)), 'sheet position used instead');
  const hdr = copyRead(); hdr.tables['ログ'].header.push(`x ${lineLike}`); hdr.tables['ログ'].header.push('userId（memo）');
  v = validateCopy(hdr);
  text = JSON.stringify(v.tabs.log.findings);
  assert.equal(text.includes(lineLike) || text.includes('memo'), false, text);
  assert.ok(v.tabs.log.findings.some((f) => f.problem === 'forbidden_field' && /^col \d+$/.test(f.column)));
});

test('COPY-32 impossible ISO dates are not rolled over into another day', () => {
  assert.ok(Number.isNaN(parseCopyTime('2026-02-30T10:00:00+07:00', null)));
  assert.ok(Number.isNaN(parseCopyTime('2026-10-07T24:00:00+07:00', null)));
});

test('COPY-18 "same day" is open (Q-19): a match that holds under one reading only is never confirmed', async () => {
  // 04:30 local is before business_day_start 05:00: calendar day 10/07, business day 10/06.
  const msg = log({ 元の行番号: '1', 日時: '2026-10-07T04:30:00+07:00', 発言者: 'Staff One' });
  const reply = send({ 元の行番号: '9', 日時: '2026-10-07T06:00:00+07:00', 返した元の発言: '04:30|Staff One' });
  const r = await adapterWith({ copy: copyRead({ log: [msg], sendLog: [reply] }) }).adapter.load();
  assert.equal(r.sources.copy.replyLinks.confirmed, 0);
});

// ------------------------------------------------------------------ meta freshness
test('COPY-19 copy meta drives freshness: recent ok -> normal; old last_read_at, stale/error or an unknown status -> stopped', async () => {
  const metas = (over) => copyRead({ meta: ['ログ', '送信ログ', 'AI質問追跡', '心拍'].map((t) => metaRow(t, over)) });
  let ctx = await ctxOf({ copy: metas({}) });
  assert.equal(ctx.freshness.state, 'normal');
  assert.equal(ctx.freshness.tabs[0].last_success_at, READ_AT);
  ctx = await ctxOf({ copy: metas({ last_read_at: '2026-10-07T13:30:00+07:00' }) });
  assert.equal(ctx.freshness.state, 'stopped');
  assert.ok(ctx.freshness.reasons.some((x) => x.kind === 'old_generated_at'));
  for (const status of ['stale', 'error']) {
    ctx = await ctxOf({ copy: metas({ status }) });
    assert.ok(ctx.freshness.reasons.some((x) => x.kind === status), status);
  }
  ctx = await ctxOf({ copy: metas({ status: 'running' }) });
  assert.ok(ctx.freshness.reasons.some((x) => x.kind === 'unrecognized_status'), 'meaning not invented (Q-50)');
  ctx = await ctxOf({ copy: metas({ status: '' }) });
  assert.equal(ctx.freshness.state, 'stopped');
});

test('COPY-20 a read failure shows "update stopped" with no data; the log carries a code only', async () => {
  const logged = [];
  const reader = memoryReader(copyRead());
  reader.fail = Object.assign(new Error('403 for https://sheets.example/ID-SHOULD-NOT-BE-LOGGED'), { code: 'http_403' });
  const { createCopyAdapter, notConnectedReader } = await import('../src/adapters/copy/copyAdapter.js');
  const adapter = createCopyAdapter({ config: testConfig(), copyReader: reader, heartbeatReader: notConnectedReader('reader_account_pending'), now: () => NOW, minReadIntervalMs: 0, log: (x) => logged.push(x) });
  const r = await adapter.load();
  assert.equal(r.sources.copy.state, 'ERROR');
  assert.equal(r.sources.copy.reason, 'http_403');
  assert.equal(r.raw.messages.rows.length, 0);
  const ctx = buildContext(r);
  assert.equal(ctx.freshness.state, 'stopped');
  assert.equal(vm.messages(ctx, 'S', '2026-10-07').total.state, 'unpulled', 'not 0');
  assert.deepEqual(logged, ['[source] copy read failed: http_403']);
});

test('COPY-21 reads are rate-limited (at most once per interval) so the 10-minute path holds without hammering the API', async () => {
  const { createCopyAdapter, notConnectedReader } = await import('../src/adapters/copy/copyAdapter.js');
  const reader = memoryReader(copyRead());
  let t = NOW;
  const adapter = createCopyAdapter({ config: testConfig(), copyReader: reader, heartbeatReader: notConnectedReader('x'), now: () => t, minReadIntervalMs: 60_000, log: () => {} });
  await Promise.all([adapter.load(), adapter.load(), adapter.load()]);
  assert.equal(reader.reads, 1, 'concurrent loads share one read');
  t += 30_000; await adapter.load();
  assert.equal(reader.reads, 1);
  t += 31_000; await adapter.load();
  assert.equal(reader.reads, 2);
});

// ------------------------------------------------------------------ AI質問追跡 gap (Q-52)
test('COPY-22 questions: recorded rows are shown; the gap since 2026-10-05 23:36 is flagged, never read as zero (Q-52)', async () => {
  const ctx = await ctxOf({ copy: copyRead({ questions: [] }) });
  const page = vm.questions(ctx, 'S');
  assert.equal(page.items.length, 0);
  assert.equal(page.incompleteFrom, '2026-10-05T23:36:00+07:00');
  const p = vm.periods(ctx, '7').stores[0].metrics;
  assert.equal(p.questionsIncomplete, true);
  assert.equal(p.responseRate.state, 'none');
  assert.equal(vm.allStores(ctx).stores[0].questionsIncomplete, true);
  // nobody matching the question wrote after it -> still waiting, no answers, nothing concluded
  const ctx2 = await ctxOf({ copy: copyRead({ log: [log({ 発言者: 'Staff Two' })], questions: [question({ state: 'waiting' })] }) });
  const q = vm.questions(ctx2, 'S').items[0];
  assert.equal(q.state, 'waiting');
  assert.deepEqual(q.answers, []);
  assert.equal(vm.questions(ctx2, 'S').answerEvidence, 'UNKNOWN', 'no answer relationship is invented');
});

// ------------------------------------------------------------------ run status (Q-49)
test('COPY-23 `AI=scheduled-off` stays unclassified: no run row, no PASS/FAIL/STOP, no rate, nothing on ⑤', async () => {
  const ctx = await ctxOf({ copy: copyRead({ heartbeat: [beat({ 結果: 'AI=scheduled-off' }), beat({ 結果: 'AI=scheduled-off / other text' })] }) });
  assert.equal(ctx.screen.runs.length, 0);
  const today = vm.today(ctx, 'S');
  const statuses = today.days.flatMap((d) => d.items.map((i) => i.status));
  assert.ok(statuses.length > 0, 'scheduled runs are still listed');
  assert.ok(statuses.every((s) => s === 'unconfirmed' || s === 'not_due'), statuses.join(','));
  assert.ok(today.days.every((d) => d.unconfirmedStatus));
  const f = vm.failures(ctx);
  assert.equal(f.items.length, 0);
  assert.equal(f.runStatusUnconfirmed, true);
  assert.deepEqual(f.totals, { missing: 0, blocked: 0, late: 0, unknown: 0 });
  const m = vm.periods(ctx, '30').stores[0].metrics;
  assert.equal(m.patrolRate.state, 'unconfirmed');
  assert.equal(m.dailyRate.state, 'unconfirmed');
  const all = vm.allStores(ctx).stores[0];
  assert.ok(all.patrol.unconfirmedStatus && all.daily.unconfirmedStatus);
  assert.equal(JSON.stringify([today, f, m, all]).includes('scheduled-off'), false, 'the raw value is not turned into a status');
  const r = await adapterWith().adapter.load();
  assert.equal(r.sources.copy.tabs.find((t) => t.tab === '心拍').used, 'validated_only');
});

// ------------------------------------------------------------------ heartbeat: separate source
test('COPY-24 heartbeat not connected: ⑥ and ① show NOT_CONNECTED, independent of the copy', async () => {
  const ctx = await ctxOf({ heartbeat: null });
  assert.equal(ctx.screen.beats, null);
  assert.equal(vm.machines(ctx).heartbeatSheet, 'not_connected');
  assert.equal(vm.machines(ctx).sources.heartbeat.state, 'NOT_CONNECTED');
  assert.equal(vm.machines(ctx).sources.copy.state, 'CONNECTED');
  assert.equal(storeMachine(ctx.screen.stores[0], ctx.screen.beats, ctx.now).state, 'not_connected');
});

test('COPY-25 heartbeat connected: beats/alerts read as-is; a forbidden or unexpected column blocks the sheet', async () => {
  let ctx = await ctxOf({ heartbeat: heartbeatRead() });
  assert.equal(vm.machines(ctx).sources.heartbeat.state, 'CONNECTED');
  assert.equal(ctx.screen.beats.length, 1);
  assert.equal(storeMachine(ctx.screen.stores[0], ctx.screen.beats, ctx.now).state, 'ok');
  const bad = heartbeatRead(); bad.tables.beats.header.push('userId'); bad.tables.beats.rows.forEach((r) => r.push('x'));
  ctx = await ctxOf({ heartbeat: bad });
  assert.equal(ctx.screen.beats, null);
  assert.equal(vm.machines(ctx).sources.heartbeat.state, 'PARTIAL');
  const noCopy = await ctxOf({ copy: null, heartbeat: heartbeatRead({ beats: [beatsRow()] }) });
  assert.equal(vm.machines(noCopy).sources.copy.state, 'NOT_CONNECTED');
  assert.equal(vm.machines(noCopy).sources.heartbeat.state, 'CONNECTED', 'the two sources are independent');
});

// ------------------------------------------------------------------ not connected (Q-48)
test('COPY-26 reader account pending (Q-48): NOT_CONNECTED, store not connected, no data fabricated', async () => {
  const r = await adapterWith({ copy: null, heartbeat: null }).adapter.load();
  assert.equal(r.sources.copy.state, 'NOT_CONNECTED');
  assert.equal(r.sources.copy.reason, 'reader_account_pending');
  assert.equal(r.storeConnection.S, 'not_connected');
  for (const k of ['messages', 'sends', 'questions', 'runs', 'meta', 'beats', 'alerts']) assert.equal(r.raw[k], undefined, k);
  const ctx = buildContext(r);
  assert.equal(ctx.freshness.state, 'stopped');
  assert.equal(vm.allStores(ctx).stores[0].connection, 'not_connected');
  assert.equal(vm.entryInfo(ctx, 'live').sources.copy.state, 'NOT_CONNECTED');
});

test('COPY-27 substitute keys and group ids never leave the Transform; API data has no forbidden field name', async () => {
  const ctx = await ctxOf({ heartbeat: heartbeatRead() });
  const body = JSON.stringify([vm.allStores(ctx), vm.messages(ctx, 'S', '2026-10-07'), vm.questions(ctx, 'S'), vm.failures(ctx), vm.machines(ctx), vm.periods(ctx, '7'), vm.entryInfo(ctx, 'live')]);
  assert.equal(/K-0001|D-0001|TESTGRP-/.test(body), false, 'substitute keys / group ids are not displayed');
  assert.equal(/userId|宛先ID|画像URL|グループID|発言者キー|宛先キー/.test(body), false);
});

test('COPY-28 tests use synthetic data only: no test code refers to the client sample folder (comments may name it)', () => {
  for (const f of readdirSync(new URL('.', import.meta.url))) {
    const code = readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.equal(code.replace(/test\('COPY-28[\s\S]*$/, '').includes('sample data_'), false, f);
  }
});

// ------------------------------------------------------------------ possibly-related answers (REQ §5-1, TV22)
const QT = '2026-10-05T12:13:00+07:00'; // question 送信時刻 used below
const answersOf = (r, qid) => JSON.parse(r.raw.questions.rows.find((q) => q.question_id === qid).answers_json ?? '[]');
const msgOf = (r, id) => r.raw.messages.rows.find((m) => m.message_id === id);

test('COPY-33 candidate answer: same group + same sender + after 送信時刻 + not 取消 -> listed as candidate (no time limit)', async () => {
  const q = question({ 送信時刻: QT, group: 'MEAT', who: 'Staff One' });
  const a1 = log({ 日時: '2026-10-05T12:20:00+07:00', 発言者: 'Staff One', 内容: 'first' });
  const a2 = log({ 日時: '2026-10-07T09:00:00+07:00', 発言者: ' Staff One ', 内容: 'two days later' }); // crosses days: still a candidate
  const img = log({ 日時: '2026-10-05T12:30:00+07:00', 発言者: 'Staff One', 種別: 'image', 内容: '[image]' });
  const r = await adapterWith({ copy: copyRead({ log: [a2, a1, img], questions: [q] }) }).adapter.load();
  const answers = answersOf(r, q.question_id);
  assert.equal(answers.length, 3);
  assert.ok(answers.every((a) => a.link === 'candidate'));
  assert.deepEqual(answers.map((a) => a.message_id).sort(), [a1.messageId, a2.messageId, img.messageId].sort());
  const row = r.raw.questions.rows[0];
  assert.equal(row.state, 'candidate', 'waiting + a possibly-related answer -> candidate (REQ §5-3)');
  for (const id of [a1.messageId, a2.messageId, img.messageId]) {
    assert.equal(msgOf(r, id).question_id, q.question_id);
    assert.equal(msgOf(r, id).question_link, 'candidate');
  }
  assert.deepEqual(r.sources.copy.answerLinks, { questionsWithCandidates: 1, candidateLinks: 3, messagesWithSeveralQuestions: 0 });
  // the screen: sorted by time, flagged as unconfirmed, state candidate (yellow), no wait time
  const ctx = buildContext(r);
  const item = vm.questions(ctx, 'S').items[0];
  assert.equal(item.state, 'candidate');
  assert.deepEqual(item.answers.map((a) => a.text), ['first', null, 'two days later']);
  assert.ok(item.answers.every((a) => a.link === 'candidate'));
  assert.equal(vm.questions(ctx, 'S').answerEvidence, 'CANDIDATE');
  // client 2026-10-14: 回答未確認 (candidate) is counted on its own, never under 未回答 (waiting)
  assert.equal(vm.questions(ctx, 'S').counts.waiting, 0, 'a candidate is not counted as unanswered');
  assert.equal(vm.questions(ctx, 'S').counts.candidate, 1, 'a candidate is counted as unconfirmed');
  assert.equal(vm.allStores(ctx).stores[0].waitingQuestions, 0);
  assert.equal(vm.allStores(ctx).stores[0].candidateQuestions, 1);
});

test('COPY-34 not a candidate: other group, other sender, before or at 送信時刻', async () => {
  const q = question({ 送信時刻: QT, group: 'MEAT', who: 'Staff One' });
  const rows = [
    log({ 群: 'IN', 日時: '2026-10-05T13:00:00+07:00', 発言者: 'Staff One' }), // other group
    log({ 日時: '2026-10-05T13:00:00+07:00', 発言者: 'Staff Two' }), // other sender
    log({ 日時: '2026-10-05T13:00:00+07:00', 発言者: 'staff one' }), // no name folding
    log({ 日時: '2026-10-05T12:12:59+07:00', 発言者: 'Staff One' }), // before the question
    log({ 日時: QT, 発言者: 'Staff One' }), // same instant is not "after"
  ];
  const r = await adapterWith({ copy: copyRead({ log: rows, questions: [q] }) }).adapter.load();
  assert.deepEqual(answersOf(r, q.question_id), []);
  assert.equal(r.raw.questions.rows[0].answers_json, null);
  assert.equal(r.raw.questions.rows[0].state, 'waiting');
  for (const m of r.raw.messages.rows) { assert.equal(m.question_id, null); assert.equal(m.question_link, null); }
  assert.equal(r.sources.copy.answerLinks.candidateLinks, 0);
});

test('COPY-35 a cancelled (取消) message is never a candidate answer', async () => {
  const q = question({ 送信時刻: QT });
  const c = log({ 日時: '2026-10-05T12:20:00+07:00', 取消: '取消' });
  const ok = log({ 日時: '2026-10-05T12:25:00+07:00' });
  const r = await adapterWith({ copy: copyRead({ log: [c, ok], questions: [q] }) }).adapter.load();
  assert.deepEqual(answersOf(r, q.question_id).map((a) => a.message_id), [ok.messageId]);
  assert.equal(msgOf(r, c.messageId).question_id, null);
  // only a cancelled message -> nothing to show, still waiting
  const r2 = await adapterWith({ copy: copyRead({ log: [log({ 日時: '2026-10-05T12:20:00+07:00', 取消: '取消' })], questions: [question({ 送信時刻: QT })] }) }).adapter.load();
  assert.equal(r2.raw.questions.rows[0].answers_json, null);
  assert.equal(r2.raw.questions.rows[0].state, 'waiting');
});

test('COPY-36 missing evidence -> no candidates: blank who, unreadable 送信時刻 (tab blocked), ログ blocked; unknown state kept', async () => {
  const later = () => log({ 日時: '2026-10-05T13:00:00+07:00' });
  let r = await adapterWith({ copy: copyRead({ log: [later()], questions: [question({ who: '' })] }) }).adapter.load();
  assert.equal(r.raw.questions.rows[0].answers_json, null);
  assert.equal(r.raw.questions.rows[0].state, 'waiting');
  r = await adapterWith({ copy: copyRead({ log: [later()], questions: [question({ 送信時刻: 'yesterday' })] }) }).adapter.load();
  assert.equal(r.raw.questions.rows.length, 0, 'an unreadable 送信時刻 blocks the tab (fail closed)');
  for (const m of r.raw.messages.rows) assert.equal(m.question_id, null);
  r = await adapterWith({ copy: copyRead({ log: [later(), log({ 取消: 'x' })], questions: [question()] }) }).adapter.load();
  assert.equal(r.raw.messages.rows.length, 0, 'ログ blocked');
  assert.equal(r.raw.questions.rows[0].answers_json, null);
  assert.equal(r.raw.questions.rows[0].state, 'waiting');
  // a state other than waiting is unknown: answers may be listed, but the state is not upgraded to anything
  r = await adapterWith({ copy: copyRead({ log: [later()], questions: [question({ state: 'answered' })] }) }).adapter.load();
  assert.equal(r.raw.questions.rows[0].state, null);
  assert.ok(JSON.parse(r.raw.questions.rows[0].answers_json).every((a) => a.link === 'candidate'));
});

test('COPY-37 a candidate never becomes confirmed: response rate / time to answer not concluded, evidence CANDIDATE, message link candidate', async () => {
  const q = question({ 送信時刻: QT });
  const a = log({ 日時: '2026-10-05T12:20:00+07:00' });
  const r = await adapterWith({ copy: copyRead({ log: [a], questions: [q] }) }).adapter.load();
  const all = [...r.raw.questions.rows.flatMap((x) => JSON.parse(x.answers_json ?? '[]').map((y) => y.link)), ...r.raw.messages.rows.map((m) => m.question_link)];
  assert.equal(all.includes('confirmed'), false);
  assert.ok(!r.raw.questions.rows.some((x) => ['acked', 'answered', 'closed'].includes(x.state)));
  const ctx = buildContext(r);
  const m = vm.periods(ctx, '7').stores[0].metrics;
  assert.equal(m.responseRate.state, 'not_concluded', 'candidates are not counted in the response rate');
  assert.equal(m.responseRate.candidateCount, 1);
  assert.equal(m.timeToAnswer.state, 'not_concluded');
  assert.equal(vm.allStores(ctx).stores[0].capability.answers, 'CANDIDATE');
  const msg = vm.messages(ctx, 'S', '2026-10-05').items.find((x) => x.message_id === a.messageId);
  assert.equal(msg.question.link, 'candidate');
  assert.equal(msg.question.found, true);
});

test('COPY-38 two open questions to the same person: the message is listed under both, its own question link stays blank', async () => {
  const q1 = question({ 送信時刻: '2026-10-05T12:13:00+07:00' });
  const q2 = question({ 送信時刻: '2026-10-05T12:40:00+07:00' });
  const between = log({ 日時: '2026-10-05T12:20:00+07:00' }); // after q1 only
  const after = log({ 日時: '2026-10-05T12:50:00+07:00' }); // after both
  const r = await adapterWith({ copy: copyRead({ log: [between, after], questions: [q1, q2] }) }).adapter.load();
  assert.deepEqual(answersOf(r, q1.question_id).map((x) => x.message_id).sort(), [between.messageId, after.messageId].sort());
  assert.deepEqual(answersOf(r, q2.question_id).map((x) => x.message_id), [after.messageId]);
  assert.equal(msgOf(r, between.messageId).question_id, q1.question_id);
  assert.equal(msgOf(r, after.messageId).question_id, null, 'which question it answers is unknown');
  assert.equal(msgOf(r, after.messageId).question_link, null);
  assert.equal(r.sources.copy.answerLinks.messagesWithSeveralQuestions, 1);
});

test('COPY-39 a row with a damaged messageId can be a candidate (by ROW-<n>), never confirmed', async () => {
  const d = log({ 元の行番号: '4242', 日時: '2026-10-05T12:20:00+07:00', messageId: '1.23457E+17' });
  const r = await adapterWith({ copy: copyRead({ log: [d], questions: [question({ 送信時刻: QT })] }) }).adapter.load();
  const answers = JSON.parse(r.raw.questions.rows[0].answers_json);
  assert.deepEqual(answers.map((x) => [x.message_id, x.link]), [['ROW-4242', 'candidate']]);
  assert.equal(JSON.stringify(r.raw).includes('1.23457E+17'), false, 'the rounded value is never used as an id');
});

test('COPY-40 candidate linking is a pure rebuild: same copy -> identical output', () => {
  const read = copyRead({ log: [log({ 日時: '2026-10-05T12:20:00+07:00' })], questions: [question({ 送信時刻: QT })] });
  const run = () => transformCopy(validateCopy(structuredClone(read), { timezone: null }), { store: { store: 'S', open_time: '00:00', close_time: '23:59' }, timezone: null, nowMs: NOW });
  assert.deepEqual(run().raw.questions, run().raw.questions);
  assert.deepEqual(run().raw.messages, run().raw.messages);
});

test('COPY-41 ① badge: a connected copy store is not shown as CONFIRMED while run status is undetermined (Q-49)', async () => {
  const ctx = await ctxOf({});
  const s = vm.allStores(ctx).stores[0];
  assert.equal(s.connection, 'connected');
  assert.equal(s.patrol.unconfirmedStatus, true);
  assert.notEqual(s.capability.evidence, 'CONFIRMED');
  assert.equal(s.capability.evidence, 'UNKNOWN');
  assert.equal(s.capability.evidenceReason, 'run_status_unconfirmed');
});

test('COPY-42 question-gap wording: "may be incomplete", never "not recorded" or "fixed"', async () => {
  const { S } = await import('../public/app/strings.ja.js');
  const t = S.questionsIncomplete('10/05 23:36');
  assert.match(t, /10\/05 23:36 以降の質問記録は不完全な可能性があります/);
  for (const bad of ['記録されていません', '修正中', '修正済', '復旧']) assert.equal(t.includes(bad), false, bad);
});
