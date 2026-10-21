// UI strings (Japanese UI per REQ §6). Japanese wording is PROVISIONAL: the requirement document is in Thai and does not
// supply the Japanese UI text -> UNCONFIRMED (Q-24); to be reviewed via Takatsuji. Local-language registry text is never touched.
export const S = {
  appName: 'NIKUSHO 現場AI巡回',
  appSub: '管理画面',
  demoStrip: 'デモ表示 ｜ สาธิต ｜ 固定の匿名化データです（実データではありません）',
  devStrip: '開発用モック表示 ｜ 実データではありません (DEV MOCK)',
  liveDownStrip: (state, reason) => `実データに接続できていません：${state}${reason ? `（${reason}）` : ''} ｜ 表示できるデータはありません（モック・デモは表示しません）`,
  pages: {
    all: { n: '①', label: '全店舗', title: '全店舗' },
    today: { n: '②', label: '本日', title: '本日' },
    messages: { n: '③', label: 'メッセージ', title: 'メッセージ' },
    questions: { n: '④', label: '質問と回答', title: '質問と回答' },
    failures: { n: '⑤', label: '欠落・失敗', title: '欠落・失敗' },
    machines: { n: '⑥', label: '機械・更新', title: '機械の確認とデータ更新' }, // client rules 2026-10-21 §6-1
    periods: { n: '⑦', label: '期間別', title: '期間別数値' },
  },
  loading: '読み込み中…',
  errorTitle: '読み込めませんでした',
  errorBody: 'データを取得できません。時間をおいて再度開いてください。',
  forbidden: 'このデータを表示する権限がありません。',
  // Auth Prototype (wording provisional, Q-24)
  auth: {
    signInTitle: 'ログインが必要です',
    signInBody: '閲覧を許可された Google アカウントでログインしてください。',
    signInButton: 'Google でログイン',
    loginFailed: 'ログインできませんでした。もう一度お試しください。',
    expired: 'ログインの有効期限が切れました。もう一度ログインしてください。',
    deniedTitle: 'アクセス権がありません',
    deniedBody: 'このアカウントには管理画面の閲覧が許可されていません。',
    signedInAs: 'ログイン中',
    logout: 'ログアウト',
    switchAccount: 'ログアウトして別のアカウントでログイン',
  },
  noStores: '表示できる店舗がありません。',
  noStoresBody: '接続済みの店舗がありません。',
  notConnected: '未接続',
  notConnectedBody: 'この店舗のデータは接続されていません。',
  outOfScope: '対象外',
  offHours: '時間外',
  notPulled: '未取得',
  zero: '0件',
  none: '対象なし',
  notConcluded: '未集計',
  unknown: '未確認',
  yes: 'はい',
  no: 'いいえ',
  back: '一覧へ戻る',
  open: '開く',
  close: '閉じる',
  store: '店舗',
  date: '日付',
  filterAll: 'すべて',
  dayToday: '本日',
  dayYesterday: '前日',
  scheduleUnconfirmed: 'スケジュールが未確認です（stores と schedules が一致しません）',
  fresh: {
    ok: (hhmm, ago) => `データ更新：${hhmm} までの記録（${ago}）`,
    unknownThrough: 'データ更新：記録時刻を確認できません',
    stopped: (hhmm) => `更新停止（最終成功 ${hhmm ?? '—'}）`,
    asOf: (hhmm) => (hhmm ? `${hhmm} までの記録` : '記録時点を確認できません'),
    reasons: {
      stale: '遅延 (stale)',
      error: '読み取り失敗 (error)',
      old_generated_at: 'generated_at が20分より古い',
      no_meta_row: 'meta に行がありません',
      missing_columns: '必須列が不足しています',
      unreadable: 'シートを読み取れません',
      unrecognized_status: 'status の値を解釈できません',
    },
  },
  evidence: { CONFIRMED: '確認済み', CANDIDATE: '候補', UNKNOWN: '不明', NOT_CONNECTED: '未接続' },
  // client rules 2026-10-21: the 12/17/22 runs are 「定時 LINE 読取」 since 10/5 23:36; the 00:35 job is the daily delivery
  kind: { slot: '定時 LINE 読取', daily: '日次配送' },
  run: {
    ok: '完了（質問あり）', silent_ok: '完了（質問なし）', late: '完了（遅延）', running: '実行中', not_due: '時刻前', awaiting: '結果待ち（時刻経過）',
    unknown: '結果不明', blocked: '停止', missing: '未実行', no_row: '未確認（記録なし）',
    no_evidence: '未確認（記録なし）', // judged from the client's records, but none for this run - never 未実行 (rules §2.3)
    // not judged: the evidence the client's rules require is not connected yet (rules 2026-10-21 §6-2, §6-4)
    unconfirmed: '未確認（読取記録 未接続）', unconfirmedDaily: '3 経路判定未接続',
  },
  // labels that depend on the kind when judged from the client's records (rules 2026-10-21 §3, §5)
  runByKind: {
    slot: { ok: '読取完了', late: '遅れて読取完了' },
    daily: { ok: '3 経路受付記録あり', late: '遅れて受付', running: '受付途中' },
  },
  evidenceReason: {
    conflicting_records: '記録が矛盾', no_finish_time: '終了時刻の記録なし', unrecognized_status: '未知の状態値', failure_recorded: '失敗の記録あり',
    unknown_route: '未知の経路', body_changed: '送信後に本文が変更', body_change_unknown: '本文変更の有無が不明', no_body_hash: '本文 SHA なし',
    body_mismatch: '経路間で本文 SHA が不一致', route_without_record: '記録のない経路あり', no_attempt_time: '送信時刻の記録なし',
  },
  route: { staff_all_line: 'ALL LINE', owner_line: '丸 LINE', owner_email: '丸メール' },
  routeStatus: { sent: '受付', unknown: '結果不明', blocked: '停止', none: '記録なし' },
  routeNote: '送信口での受付の記録です。受信・閲覧の確認ではありません。',
  runKindUnconfirmed: {
    slot: '定時 LINE 読取：発注者側の読取記録がまだ接続されていないため「未確認」です。',
    daily: '日次配送：3 経路の受付記録がまだ接続されていないため「3 経路判定未接続」です。',
  },
  // Client rules 2026-10-21: the evidence they require (読取の起動・心拍記録, 日次 3 経路の受付記録) is not in the copy yet.
  // Until the client's anonymised read-only records are connected, every result stays 未確認 (never success, failure or 0).
  runStatusUnconfirmed: '定時 LINE 読取・日次配送の結果に必要な実行記録がまだ接続されていないため、結果は「未確認」です（予定時刻のみ表示）。',
  runStatusPending: '定時 LINE 読取・日次配送の結果は、発注者側の実行記録（匿名化した読取専用の写し）が接続されるまで「未確認」と表示します。欠落・停止・遅延・成功率も判定しません（0 件・0% ではありません）。',
  questionsIncomplete: (t) => `${t} 以降の質問記録は不完全な可能性があります。件数は実際より少ない可能性があります。`, // Q-52: completeness unconfirmed; never claims recovery
  questionsIncompleteShort: '記録が不完全',
  runDerived: { unrecognized: '未知の状態値', deadline_passed_running: '実行中のまま期限超過', before_rule: '10/5 23:36 以前の便（旧ルールのため判定対象外）' },
  legend: [
    ['tone-ok', '完了（読取完了・3 経路受付記録あり）'], ['tone-silent', '完了（質問なし）'], ['tone-late', '遅れて完了'],
    ['tone-wait', '実行中・時刻前'], ['tone-await', '結果待ち（時刻経過）'], ['tone-unknown', '結果不明'], ['tone-blocked', '停止'], ['tone-missing', '未実行・未確認'], ['tone-neutral', '未確認（読取記録 未接続）'],
  ],
  qstate: {
    waiting: '未回答（候補なし）', candidate: '関連の可能性のある回答あり（未確認）', acked: '回答あり（未完了）', answered: '回答完了',
    closed: 'クローズ', unknown: '未確認',
  },
  closedReason: { answered: '回答済み', owner: 'オーナー判断', no_reply: '回答なしで終了' },
  handling: { replied: 'Bot返信済み', pending: '対応待ち', carried: '次回巡回へ持越し', failed: '送信失敗', unknown: '未確認', not_needed: '' },
  // `sent` = 送信ログ OK: the sending script's acceptance record only - not 既読, not resolved (client rules 2026-10-21 §4, §5)
  sendResult: { sent: '送信受付', failed: '送信失敗', unknown: '送信結果未確認' },
  replyBy: { light: '5 分巡回', heavy: '定時便（旧）' },
  replyAmbiguous: '返信先の元メッセージが不明',
  questionLink: { confirmed: '↩ 質問への回答', candidate: '↩ 質問への回答の可能性（未確認）' },
  photo: '(画像)',
  sticker: '(スタンプ)',
  otherKind: '(その他の種別：動画・ファイル等)', // 種別 video/file -> kind other (Q-12)
  kindName: { text: 'テキスト', photo: '画像', sticker: 'スタンプ', other: 'その他' },
  sendKind: { question: '質問', reply: '返信', daily: '日次', alert: 'アラート' },
  // cross-page links and detail views (wording provisional, Q-24)
  link: {
    run: (t) => `定時読取 ${t}`, runNotFound: '定時読取の記録が見つかりません', toToday: '②本日で見る', toMessages: '③この日のメッセージ',
    toMessage: '③で見る', toQuestion: '④で見る', toMachines: '⑥機械の確認', details: '詳細', hide: '閉じる',
  },
  detail: {
    run: '定時読取', reply: (i) => `返信 ${i}`, kind: '種別', handling: '対応', // internal ids are never shown on the normal screen (client 2026-10-14, 2026-10-18)
    posted: '投稿', received: '受信', evidence: '証跡', updated: '更新', sendOfQuestion: '質問の送信', sendNotFound: '送信記録が見つかりません',
    sends: '送信（LINE受付）', none: '—', asStored: '記録の値をそのまま表示',
  },
  cancelled: 'メッセージは取り消されました',
  idDamaged: 'ID破損（行番号で表示）', // the sheet stored messageId as a number; the message is shown under its row number
  repliesUnreadable: '返信を読み取れません',
  answersUnreadable: '回答を読み取れません',
  noAnswers: 'まだありません',
  answerCandidate: '関連の可能性（未確認）',
  // display-only shortening (client review of the live screens, 2026-10-19) - counts and rules are unchanged
  collapse: {
    candidates: (n, shown) => `関連の可能性 ${n}件（質問時刻に近い${shown}件を表示）`,
    showAll: (n) => `すべて表示（${n}件）`, showFewer: '近い3件だけ表示',
    media: (counts) => Object.entries(counts).map(([k, n]) => `(${({ photo: '画像', sticker: 'スタンプ' })[k] ?? 'その他'} ×${n})`).join(' '),
    mediaOpen: '個別に表示', mediaClose: 'まとめて表示',
    mediaHandling: '画像・スタンプへの対応状況（1件ずつではなくまとめて表示）',
    idDamaged: (n) => `ID破損 ${n}行`, idDamagedKept: (n) => `ID破損 ${n}行（表示は継続）`, more: (n) => `ほか${n}行`, rowsShort: (n) => `${n}行`, showRows: '行番号を表示', hideRows: '行番号を隠す',
  },
  // Thai tab names of the dashboard data (REQ §5-3, internal) -> Japanese display names. The internal names are unchanged.
  tabLabel: { 'ทะเบียนรอบตรวจ': '巡回台帳', 'ทะเบียนคำถาม': '質問台帳', 'บันทึกการส่ง': '送信ログ', 'ทะเบียนข้อความ': 'メッセージ台帳' },
  cancelNote: '',
  // pages
  all: {
    patrol: '定時 LINE 読取', daily: '日次配送', questions: '質問', waiting: '未回答（候補なし）', candidate: (n) => `回答未確認 ${n}件`, messages: '本日のメッセージ', botReplies: 'Bot返信',
    machine: '機械の確認', lightCheck: '5 分巡回', unit: '件',
    summaryToday: '今日', patrolPlanned: (n) => `定時読取${n}回予定`, scheduleUnknown: '定時読取の予定 未確認',
    fiveMin: { ok: (t) => `5分巡回 最終${t}`, confirmed: (t) => `5分巡回 動作確認${t}`, issue: '5分巡回 要確認', owner_unconfirmed: '5分巡回 担当未確認', late: '5分巡回 遅延／要確認', red: '5分巡回 20分超の空き', off_hours: '5分巡回 時間外', unknown: '5分巡回 未確認', not_connected: '5分巡回 未接続' },
    waitingShort: (n) => `未回答（候補なし）${n}件`, candidateShort: (n) => `回答未確認${n}件`,
    machineShort: { ok: '機械の確認 PASS', red: '機械の確認 要確認', unknown: '機械の確認 未確認', not_connected: '機械の確認 未接続' },
  },
  today: {
    input: '入力', questions: '質問', sentMessages: '送信', owner: 'オーナー要判断', read: '読取', ai: 'AI完了', sent: '送信',
    photos: '画像', ownerNotified: 'オーナー通知', reason: '理由', detail: '詳細', readDone: '読取終了', readCount: '読取件数',
  },
  messages: { total: 'メッセージ数', bot: 'Bot返信', group: 'グループ', replied: 'Bot返信済み', problem: '失敗・未確認', after: (m) => `${m}分後`, minutesWord: '分' },
  questions: {
    filters: { all: 'すべて', waiting: '未回答（候補なし）', candidate: '回答未確認', answered: '回答あり', closed: 'クローズ' },
    waitingNote: '未回答（候補なし）は、記録の中に関連しそうな回答が見つからない質問です。回答がなかったことを確定したものではありません。',
    inIncomplete: '記録不完全期間',
    inIncompleteNote: '回答追跡の記録が不完全な期間に送信された質問です。回答の有無は確定できません。',
    wait: (h) => `${h}時間 待ち`, candidateNote: '現在の記録では回答の確定はできません（候補止まり）',
  },
  failures: { missing: '欠落', blocked: '停止', late: '遅延', unknown: '未確認', days: (d) => `直近${d}日`, sends: '送信の失敗・結果未確認', none: '該当はありません', notConnected: '未接続の店舗（対象外）',
    unclassifiedSends: (n) => `結果の値を分類できない送信 ${n}件（失敗とは判定していません）` },
  machines: {
    updates: 'データ更新', machines: '機械の確認', light: '5 分巡回（MEAT・IN）', alerts: '最近のアラート', production: '本番', standby: '待機',
    status: '状態', lastSuccess: '最終成功', through: '記録時点', heartbeat: 'ハートビート', ago: (m) => `${m}分前`, verify: '自己検査', failItems: '失敗項目',
    disk: 'ディスク空き', clock: '時刻ずれ', noSheet: 'ハートビートシートが未接続です', alertKind: { silent: '応答なし', recovered: '復旧', fail: '自己検査失敗' },
    notJudged: '待機機の判定基準は未確認', window: '対象時間', noBeat: '本番機のハートビートがありません',
    generated: (t, ago) => `生成 ${t}（${ago}）`, lastHour: '直近60分の受信', perInterval: (m) => `（${m}分ごとに書込み）`,
    recent: '受信履歴（直近60分）', count: (n) => `${n}件`,
    // client rules 2026-10-21 §4 / §6-3: only beats.text_patrol_at is available (last problem-free run)
    fiveMinNote: '最終稼働時刻のみ確認／全件判定未接続',
    fiveMinDetail: '本番機の text_patrol_at（最後の問題なし回）の時刻です。各 5 分回の結果・返信・担当（ownership）の確認は、発注者側の記録が接続されるまで判定しません。',
    lastRun: (t, m) => `最終稼働 ${t}（${m}分前）`,
    // with the client's per-run records (rules §4): 動作確認 is about that one run only
    fiveMinConfirmed: (t, m) => `動作確認 ${t}（${m}分前・その回のみ）`, fiveMinIssue: (t) => `要確認（${t} の回に問題の記録）`,
    fiveMinOwner: (t) => `担当未確認（最終 ${t}）`,
    fiveMinEvidenceNote: '5 分巡回の実行記録（発注者側の匿名化した写し）による判定です。返信・全件の成功率は未集計です。', fiveMinLate: (m) => `遅延／要確認（${m}分）`, fiveMinStop: (m) => `20分超の空き（${m}分・停止検知）`,
  },
  // Connection of the client's two files (copy adapter only). Codes are shown as they are.
  sources: {
    title: 'データ元（発注者のファイル）', copy: '閲覧専用コピー', heartbeat: '機械の心拍シート', readAt: '最終読取',
    state: { NOT_CONNECTED: '未接続', CONNECTED: '接続中', PARTIAL: '一部停止', BLOCKED: '停止（契約チェック不合格）', ERROR: '読取失敗' },
    tabState: { ok: '合格', blocked: '停止' }, rows: (n) => `${n}行`, findings: (n) => `指摘 ${n}件`,
    replies: (c, a, u) => `返信の紐付け：確定 ${c}／特定不可 ${a}／紐付けなし ${u}`,
    validatedOnly: '検証のみ（GAS の旧心拍：成功・失敗の判定には使いません）', row: '元の行番号', rowPos: 'シート行',
    evidence: '実行記録（発注者側の匿名化した写し）', evidenceState: { absent: '未接続', ok: '接続中', blocked: '停止（契約チェック不合格）', stale: '更新遅延（使用しません）' },
    warnings: (n) => `注意 ${n}件（表示は継続）`,
  },
  periods: {
    d7: '7日', d30: '30日', patrolRate: '定時読取成功率', dailyRate: '日次配送（3 経路）', stopped: '欠落／停止／結果不明', questions: '質問送信数',
    response: '回答率', answerTime: '回答までの時間', messages: 'メッセージ数', bot: 'Bot返信数', perDay: '日別メッセージ数',
    unknownOrigin: (n) => `元メッセージ不明の返信 ${n}件`, notConcluded: (n) => `確認済みの回答率は未集計（関連の可能性 ${n}件）`,
    minutes: (m) => `${Math.round(m)}分`, unconfirmedSchedule: 'スケジュール未確認の期間を含みます',
    fiveMinRate: '5 分巡回・返信の成功率', notTallied: '未集計',
    runUnconfirmed: '未確認', dailyUnconnected: '3 経路判定未接続',
  },
};
