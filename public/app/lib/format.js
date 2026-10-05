// Presentation-only formatting. Stored timestamps are yyyy-MM-ddTHH:mm:ss+07:00 (REQ §5-3); clock text is taken
// from the stored string as-is (display zone for other stores is UNCONFIRMED, Q-12/Q-30).
export const hhmm = (iso) => (iso ? iso.slice(11, 16) : null);
export const mdhm = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)} ${iso.slice(11, 16)}` : null);

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export function dateLabel(day) {
  const [y, m, d] = day.split('-').map(Number);
  return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}(${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

export function agoText(min) {
  if (min === null || min === undefined) return '—';
  if (min < 1) return '1分未満前';
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h}時間前` : `${Math.floor(h / 24)}日前`;
}

export const pct = (v) => `${Math.round(v * 100)}%`;
