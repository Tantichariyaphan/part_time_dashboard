// Mock/Demo data generator. DEVELOPMENT ONLY - synthetic, deterministic, contains NO customer data.
// Produces raw "sheet" tabs shaped exactly like Screen Data (REQ §5-3 / docs/data-mapping.md §5) so the real
// pipeline (Source -> Copy Process -> Read Copy -> Screen Data) can later replace this adapter without UI changes.
//
// Everything here is invented: store ids, staff names, hosts, texts. No real identifiers (userId, recipient ID,
// image URL) exist in this module and none may be added (REQ §5-1).
import { COLUMNS } from '../../contract/columns.js';
import { addDays, businessDayOf, formatIso, zonedInstant } from '../../domain/time.js';
import { effectiveTimes } from '../../domain/schedules.js';

export const SCENARIOS = Object.freeze(['full', 'phase1', 'stale-messages', 'stopped', 'error', 'machine-down']);

const MIN = 60000;
const iso = (ms) => formatIso(ms);
const tab = (key, rows) => ({ columns: [...COLUMNS[key]], rows });

const RUN_PATTERN = ['silent_ok', 'silent_ok', 'ok', 'silent_ok', 'silent_ok', 'late', 'silent_ok', 'ok', 'silent_ok',
  'silent_ok', 'silent_ok', 'blocked', 'silent_ok', 'missing', 'silent_ok', 'unknown'];
const GROUPS = ['MEAT', 'PHOTO', 'IN', 'ALL', 'MANAGEMENT'];
const STAFF = ['Staff A', 'Staff B', 'Staff C', 'Staff D'];
const QUESTION_TEXTS = [
  'Harami วันนี้ CUT กี่กิโลครับ?',
  'Tongue STOCK เหลือกี่กิโลครับ?',
  'Karubi HAGI วันนี้กี่กรัมครับ?',
  '1044 Tip of the tongue: 13 ชิ้น (ปกติ 17 ชิ้นขึ้นไป) เกิดอะไรขึ้นครับ?',
];
const ANSWER_TEXTS = ['เดี๋ยวชั่งให้ครับ', 'Tongue 4.2 kg ครับ', 'หน้าลิ้นใหญ่ครับ ชั่งตามน้ำหนักครับ', 'รอสักครู่ครับ'];
const CHAT_TEXTS = [
  'CUT_Harami 2.4kg / HAGI 0.2kg',
  'เนื้อมาส่งแล้วครับ',
  'วันนี้ลูกค้าจอง 3 โต๊ะค่ะ <b>test</b>', // HTML-looking text: must be displayed as characters (TV15)
  'ปิดร้านเรียบร้อยแล้วค่ะ',
  'Karubi เหลือ 3.5 kg ครับ',
  'မင်္ဂလာပါ', // Burmese greeting kept verbatim (local-language rule)
  'รับทราบครับ',
];
const BOT_TEXTS = ['@Bot Harami สต็อกเหลือเท่าไหร่?', '@Bot ส่งรายงานแล้วค่ะ', '@Bot เดือนนี้สั่งเนื้อไปเท่าไหร่?'];
const MSG_OFFSETS = ['10:42', '11:05', '11:20', '11:31', '11:40', '13:47', '14:20', '15:05', '16:12', '17:30', '18:44', '19:15', '20:02', '21:10', '22:35'];

/**
 * @param {number} now ms
 * @param {{variant:'dev'|'demo', scenario?:string, days?:number}} opts
 * @returns {{raw: Record<string, any>, storeConnection: Record<string,string>}}
 */
export function buildMockTabs(now, { variant = 'dev', scenario = 'full', days = 31 } = {}) {
  const P = variant === 'demo' ? 'DEMO' : 'MOCK';
  const stores = [
    { store: 'STORE_A', display_name: variant === 'demo' ? 'デモ店舗A' : 'モック店舗A', timezone: 'Asia/Bangkok', business_day_start: '05:00',
      slot_times: '12:00,17:00,22:00', slot_deadline_min: 90, daily_deadline_min: 60, daily_time: '00:35', text_patrol: '10:00-24:00',
      production_host: 'mock-host-1', active: 'yes' },
    { store: 'STORE_B', display_name: variant === 'demo' ? 'デモ店舗B' : 'モック店舗B', timezone: 'Asia/Tokyo', business_day_start: '05:00',
      slot_times: '', slot_deadline_min: '', daily_deadline_min: 60, daily_time: '02:45', text_patrol: '', production_host: 'mock-host-1', active: 'yes' },
    { store: 'STORE_C', display_name: variant === 'demo' ? 'デモ店舗C' : 'モック店舗C', timezone: 'Asia/Tokyo', business_day_start: '05:00',
      slot_times: '', slot_deadline_min: '', daily_deadline_min: 60, daily_time: '02:45', text_patrol: '', production_host: 'mock-host-1', active: 'yes' },
  ];
  const A = stores[0];
  const today = businessDayOf(now, A);
  const cutover = addDays(today, -5); // mock: the 17:00 patrol starts here (real date is UNCONFIRMED, Q-16)
  const schedules = [
    { store: 'STORE_A', kind: 'slot', times: '12:00,22:00', valid_from: addDays(today, -60), valid_to: addDays(cutover, -1) },
    { store: 'STORE_A', kind: 'slot', times: '12:00,17:00,22:00', valid_from: cutover, valid_to: '' },
    { store: 'STORE_A', kind: 'daily', times: '00:35', valid_from: addDays(today, -60), valid_to: '' },
    { store: 'STORE_B', kind: 'daily', times: '02:45', valid_from: addDays(today, -30), valid_to: '' },
    { store: 'STORE_C', kind: 'daily', times: '02:45', valid_from: addDays(today, -30), valid_to: '' },
  ];

  const runs = [], questions = [], sends = [], messages = [];
  let n = 0, qn = 0, sn = 0, mn = 0;
  const runIdOf = (kind, ms) => `STORE_A_${kind}_${iso(ms).slice(0, 16).replace(':', '')}+07:00`;

  const dayList = Array.from({ length: days }, (_, i) => addDays(today, -(days - 1 - i)));
  for (const day of dayList) {
    // ---------- runs (slot + daily) ----------
    const dayRunRows = [];
    for (const kind of ['slot', 'daily']) {
      const times = effectiveTimes(schedules, 'STORE_A', kind, day);
      for (const t of times) {
        const [h] = t.split(':').map(Number);
        const date = h < 5 ? addDays(day, 1) : day;
        const at = zonedInstant(date, t, A.timezone);
        if (at > now) continue; // future: no row yet -> screen shows "not due"
        n += 1;
        if (n % 23 === 0 && at < now - 3 * 3600000) continue; // deliberately absent row -> "no_row" (unconfirmed)
        const deadline = (kind === 'slot' ? A.slot_deadline_min : A.daily_deadline_min) * MIN;
        let status = kind === 'daily' ? (n % 11 === 0 ? 'blocked' : 'ok') : RUN_PATTERN[n % RUN_PATTERN.length];
        if (now < at + 65 * MIN) status = 'running';
        const row = {
          store: 'STORE_A', run_id: runIdOf(kind, at), kind, scheduled_at: iso(at), status, reason: '',
          read_at: '', ai_done_at: '', posted_at: '', received_at: '', sent_at: '',
          input_lines: '', questions_sent: 0, messages_sent: 0, owner_items: 0, photos_total: '', photos_reviewed: '', owner_notified: '',
          evidence: `${P.toLowerCase()}-evidence`, updated_at: iso(Math.min(now, at + 70 * MIN)),
        };
        if (status === 'running') {
          Object.assign(row, { read_at: iso(at), input_lines: 9, questions_sent: '', messages_sent: '', owner_items: '', updated_at: iso(now) });
        } else if (status === 'blocked') {
          row.reason = 'หยุดในขั้นดึงข้อมูลหรือด่านตรวจขั้นก่อนหน้า';
        } else if (status === 'missing') {
          row.reason = 'ไม่มีสัญญาณชีพ';
        } else if (status === 'unknown') {
          Object.assign(row, { reason: 'ยืนยันผลการส่งไม่ได้', read_at: iso(at + 4 * MIN), ai_done_at: iso(at + 52 * MIN), posted_at: iso(at + 65 * MIN), input_lines: 31 });
        } else {
          const asked = status === 'ok' ? 1 + (n % 3 === 0 ? 1 : 0) : status === 'late' ? 2 : 0;
          Object.assign(row, {
            read_at: iso(at + 2 * MIN), ai_done_at: iso(at + (status === 'late' ? 72 : 8) * MIN), posted_at: iso(at + 65 * MIN),
            received_at: iso(at + 65 * MIN + 4000), input_lines: 2 + (n * 7) % 40, questions_sent: kind === 'daily' ? 0 : asked,
            messages_sent: kind === 'daily' ? 1 : asked ? 1 : 0, owner_items: kind === 'daily' ? 1 + (n % 4) : 0,
          });
          if (status === 'late') row.reason = 'AI ทำงานเสร็จช้า 20 นาที';
          if (asked || kind === 'daily') row.sent_at = iso(at + 65 * MIN);
          if (kind === 'slot' && status === 'late') Object.assign(row, { photos_total: 5, photos_reviewed: 3, owner_notified: 'yes' });
          if (kind === 'daily') row.owner_notified = 'yes';
        }
        runs.push(row);
        dayRunRows.push({ row, at, kind, status });
      }
    }

    // ---------- questions + sends for ok/late patrols ----------
    for (const { row, at, kind, status } of dayRunRows) {
      if (kind !== 'slot' || !row.questions_sent || status === 'running') continue;
      const sentMs = at + 65 * MIN;
      sn += 1;
      const sendId = `${P}-s-${sn}`;
      const qTexts = [];
      for (let k = 0; k < row.questions_sent; k++) {
        qn += 1;
        const who = STAFF[qn % 3];
        const group = GROUPS[qn % 3];
        const qtext = QUESTION_TEXTS[qn % QUESTION_TEXTS.length];
        qTexts.push(`@${who} ${qtext}`);
        const mode = qn % 7; // 0 waiting, 1 candidate, 2 answered, 3 waiting, 4 closed/no_reply, 5 acked, 6 closed/answered
        const q = {
          store: 'STORE_A', question_id: `${P}-q-${qn}`, run_id: row.run_id, send_id: sendId, sent_at: iso(sentMs), group, who,
          question_text: qtext, state: 'waiting', closed_reason: '', closed_at: '', answers_json: '[]', updated_at: iso(Math.min(now, sentMs + 30 * MIN)),
        };
        const ans = (link, offMin, text = ANSWER_TEXTS[qn % ANSWER_TEXTS.length]) => {
          const atMs = sentMs + offMin * MIN;
          if (atMs > now) return null;
          mn += 1;
          messages.push({
            store: 'STORE_A', message_id: `${P}-m-${mn}`, at: iso(atMs), group, sender: who, kind: 'text', text, handling: 'not_needed',
            replies_json: '[]', question_id: q.question_id, question_link: link, run_id: '', updated_at: iso(now),
          });
          return { message_id: `${P}-m-${mn}`, at: iso(atMs), who, text, link };
        };
        if (mode === 1) { const a = ans('candidate', 8); if (a) { q.state = 'candidate'; q.answers_json = JSON.stringify([a]); } }
        else if (mode === 2) { const a = ans('confirmed', 13); if (a) { q.state = 'answered'; q.answers_json = JSON.stringify([a]); } }
        else if (mode === 5) { const a = ans('confirmed', 6); if (a) { q.state = 'acked'; q.answers_json = JSON.stringify([a]); } }
        else if (mode === 6) {
          const a1 = ans('confirmed', 9, ANSWER_TEXTS[3]); const a2 = ans('confirmed', 4, ANSWER_TEXTS[1]);
          if (a1 && a2) { q.state = 'closed'; q.closed_reason = 'answered'; q.closed_at = iso(sentMs + 20 * MIN); q.answers_json = JSON.stringify([a1, a2]); } // unordered on purpose: screen must sort
        } else if (mode === 4 && sentMs < now - 26 * 3600000) { q.state = 'closed'; q.closed_reason = 'no_reply'; q.closed_at = iso(sentMs + 26 * 3600000); }
        questions.push(q);
      }
      sends.push({ store: 'STORE_A', send_id: sendId, sent_at: iso(sentMs), kind: 'question', target_kind: 'group', target_label: GROUPS[qn % 3],
        text: qTexts.join('\n'), result: sn % 13 === 0 ? 'unknown' : 'sent' });
    }
    for (const { row, at, kind } of dayRunRows) {
      if (kind === 'daily' && row.sent_at) {
        sn += 1;
        sends.push({ store: 'STORE_A', send_id: `${P}-s-${sn}`, sent_at: row.sent_at, kind: 'daily', target_kind: 'owner',
          target_label: 'เจ้าของกิจการ (อีเมล)', text: '【รายวัน】…', result: 'sent' });
      }
    }

    // ---------- messages ----------
    MSG_OFFSETS.forEach((hhmm, i) => {
      const at = zonedInstant(day, hhmm, A.timezone) + (i % 4) * 7000;
      if (at > now || i % 3 === 2 && day !== today) return; // vary daily volume a little
      mn += 1;
      const sender = STAFF[(i + mn) % 4];
      const group = GROUPS[(i + 1) % GROUPS.length];
      const kind = i % 6 === 1 ? 'photo' : i % 7 === 4 ? 'sticker' : 'text';
      const toBot = kind === 'text' && i % 5 === 3;
      const text = kind !== 'text' ? '' : toBot ? BOT_TEXTS[i % BOT_TEXTS.length] : CHAT_TEXTS[(i + mn) % CHAT_TEXTS.length];
      const m = {
        store: 'STORE_A', message_id: `${P}-m-${mn}`, at: iso(at), group, sender, kind, text, handling: 'not_needed',
        replies_json: '[]', question_id: '', question_link: '', run_id: '', updated_at: iso(now),
      };
      if (toBot) {
        sn += 1;
        const replyAt = at + 4 * MIN + 40000;
        const bad = mn % 9 === 0;
        const carried = at > now - 3 * 3600000 && mn % 4 === 0;
        if (carried) m.handling = 'carried';
        else if (replyAt <= now) {
          const result = bad ? 'failed' : 'sent';
          sends.push({ store: 'STORE_A', send_id: `${P}-s-${sn}`, sent_at: iso(replyAt), kind: 'reply', target_kind: 'group', target_label: group,
            text: `@${sender} รับทราบครับ`, result });
          m.handling = bad ? 'failed' : 'replied';
          m.replies_json = JSON.stringify([{ send_id: `${P}-s-${sn}`, at: iso(replyAt), by: 'light', text: `@${sender} รับทราบครับ`, result, link: bad ? 'ambiguous' : 'confirmed' }]);
        } else m.handling = 'pending';
      } else if (mn % 17 === 0) m.handling = 'unknown';
      messages.push(m);
    });
  }
  // message -> run link: the first patrol that ran after the message (registry key link; blank when none)
  const slotRuns = runs.filter((r) => r.kind === 'slot' && r.status !== 'missing').map((r) => ({ id: r.run_id, at: Date.parse(r.scheduled_at) }));
  for (const m of messages) {
    if (m.question_id) continue;
    const t = Date.parse(m.at);
    const next = slotRuns.filter((r) => r.at >= t).sort((a, b) => a.at - b.at)[0];
    if (next && next.at - t < 12 * 3600000) m.run_id = next.id;
  }

  // ---------- heartbeat sheet ----------
  const beats = [];
  for (let k = 11; k >= 0; k--) {
    const t = now - 2 * MIN - k * 5 * MIN;
    beats.push({ received_at: iso(t), host: 'mock-host-1', role: 'production', stores: 'STORE_A,STORE_B,STORE_C', verify: k === 6 ? 'FAIL' : 'PASS',
      fail_items: k === 6 ? 'drive' : '', chatgpt: true, drive: k !== 6, g_mounted: true, disk_free_gb: 120.4 - k * 0.1, clock_offset_sec: 0.4, text_patrol_at: iso(t - 1000) });
  }
  beats.push({ received_at: iso(now - 90000), host: 'mock-host-2', role: 'standby', stores: 'STORE_A,STORE_B,STORE_C', verify: 'PASS', fail_items: '',
    chatgpt: true, drive: true, g_mounted: true, disk_free_gb: 80, clock_offset_sec: 1.1, text_patrol_at: '' });
  const alerts = [
    { at: iso(now - 20 * 3600000), kind: 'silent', detail: 'ไม่มีสัญญาณชีพจาก mock-host-1 เป็นเวลา 15 นาที' },
    { at: iso(now - 19.5 * 3600000), kind: 'recovered', detail: 'mock-host-1 กลับมาทำงาน' },
    { at: iso(now - 30 * MIN), kind: 'fail', detail: 'mock-host-1 ตรวจสอบตัวเอง FAIL: drive' },
  ];

  const meta = ['ทะเบียนรอบตรวจ', 'ทะเบียนคำถาม', 'บันทึกการส่ง', 'ทะเบียนข้อความ'].map((name) => ({
    tab: name, generated_at: iso(now - 3 * MIN), last_success_at: iso(now - 3 * MIN), source_through: iso(now - 5 * MIN), status: 'ok', detail: '', contract_version: 'v1',
  }));

  const out = {
    raw: {
      meta: tab('meta', meta), stores: tab('stores', stores), schedules: tab('schedules', schedules), runs: tab('runs', runs),
      questions: tab('questions', questions), sends: tab('sends', sends), messages: tab('messages', messages),
      beats: tab('beats', beats), alerts: tab('alerts', alerts),
    },
    // Interim side-channel (OUTSIDE the REQ §5-3 schema): which stores have a data connection. Mechanism UNCONFIRMED (Q-29).
    storeConnection: { STORE_A: 'connected', STORE_B: 'not_connected', STORE_C: 'not_connected' },
  };
  return applyScenario(out, scenario, now);
}

function applyScenario(out, scenario, now) {
  const { raw } = out;
  const metaRow = (name) => raw.meta.rows.find((m) => m.tab === name);
  switch (scenario) {
    case 'phase1': // only what the current Source records can prove: waiting / candidate (REQ §2, §5-1)
      for (const q of raw.questions.rows) {
        if (['acked', 'answered', 'closed'].includes(q.state)) {
          const answers = JSON.parse(q.answers_json).map((a) => ({ ...a, link: 'candidate' }));
          q.state = answers.length ? 'candidate' : 'waiting';
          q.closed_reason = ''; q.closed_at = ''; q.answers_json = JSON.stringify(answers);
        }
      }
      for (const m of raw.messages.rows) if (m.question_link === 'confirmed') m.question_link = 'candidate';
      break;
    case 'stale-messages': {
      const r = metaRow('ทะเบียนข้อความ');
      Object.assign(r, { generated_at: iso(now - 3 * MIN), last_success_at: iso(now - 40 * MIN), source_through: iso(now - 45 * MIN), status: 'stale', detail: 'อ่านบันทึก LINE ล้มเหลวสองครั้งติดต่อกัน' });
      break;
    }
    case 'stopped':
      for (const r of raw.meta.rows) Object.assign(r, { generated_at: iso(now - 45 * MIN), last_success_at: iso(now - 47 * MIN), source_through: iso(now - 50 * MIN), status: 'ok' });
      break;
    case 'error':
      for (const r of raw.meta.rows) Object.assign(r, { status: 'error', last_success_at: iso(now - 120 * MIN), source_through: iso(now - 125 * MIN), detail: 'อ่านต้นทางล้มเหลว' });
      break;
    case 'machine-down':
      raw.beats.rows = raw.beats.rows.filter((b) => b.role !== 'production' || Date.parse(b.received_at) < now - 40 * MIN);
      raw.beats.rows.push({ received_at: iso(now - 41 * MIN), host: 'mock-host-1', role: 'production', stores: 'STORE_A,STORE_B,STORE_C', verify: 'PASS', fail_items: '',
        chatgpt: true, drive: true, g_mounted: true, disk_free_gb: 120, clock_offset_sec: 0.4, text_patrol_at: iso(now - 41 * MIN) });
      break;
    default:
  }
  return out;
}
