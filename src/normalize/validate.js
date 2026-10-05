// Validation of normalized Screen Data. Reports problems; never "repairs" values.
// Unrecognised values are surfaced as UNKNOWN downstream ("ยังไม่ยืนยัน"), never guessed (REQ §7-7).
import { ENUM_COLUMNS, NUMERIC_COLUMNS, BOOLEAN_COLUMNS, TIMESTAMP_COLUMNS, TIMESTAMP_PATTERN } from '../contract/columns.js';
import { CONTRACT_VERSION } from '../contract/enums.js';

/**
 * @returns {{ invalid: Array<{tab:string,row:number,field:string,value:any,problem:string}>, duplicates: Array<{tab:string,key:string,value:string}> }}
 */
export function validateScreen(screen) {
  const invalid = [];
  const note = (tab, row, field, value, problem) => invalid.push({ tab, row, field, value, problem });

  for (const [tab, rows] of Object.entries(screen)) {
    if (!rows) continue;
    rows.forEach((r, i) => {
      for (const [col, allowed] of Object.entries(ENUM_COLUMNS[tab] ?? {})) {
        if (r[col] !== null && !allowed.includes(r[col])) note(tab, i, col, r[col], 'enum');
      }
      for (const col of NUMERIC_COLUMNS[tab] ?? []) {
        if (r[col] !== null && typeof r[col] !== 'number') note(tab, i, col, r[col], 'number');
      }
      for (const col of BOOLEAN_COLUMNS[tab] ?? []) {
        if (r[col] !== null && typeof r[col] !== 'boolean') note(tab, i, col, r[col], 'boolean');
      }
      for (const col of TIMESTAMP_COLUMNS[tab] ?? []) {
        if (r[col] !== null && !TIMESTAMP_PATTERN.test(String(r[col]))) note(tab, i, col, r[col], 'timestamp');
      }
      if (tab === 'meta' && r.contract_version !== null && r.contract_version !== CONTRACT_VERSION) {
        note(tab, i, 'contract_version', r.contract_version, 'version');
      }
    });
  }

  const unique = { runs: 'run_id', questions: 'question_id', sends: 'send_id', messages: 'message_id' };
  const duplicates = [];
  for (const [tab, keyCol] of Object.entries(unique)) {
    const seen = new Set();
    for (const r of screen[tab] ?? []) {
      const k = `${r.store}|${r[keyCol]}`;
      if (seen.has(k)) duplicates.push({ tab, key: keyCol, value: String(r[keyCol]) });
      seen.add(k);
    }
  }
  return { invalid, duplicates };
}
