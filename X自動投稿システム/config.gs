/**
 * CompanaFXAutoPost - config.gs
 * システム全体の設定・定数
 * 
 * ここにAPIキーは書きません。
 * APIキーはスクリプトプロパティに保存済みです。
 * 
 * ★ Phase 3.5 追加: POST_MODE, SHEET_NAMES拡張, VALIDATION_CONFIG
 * ★ v3.7 追加: KNOWLEDGE投稿タイプ
 * ★ v5.5.3: MARKET_INDICATORS追加、X Premium対応で文字数拡張
 */

// ===== 通貨ペア定義（全システム共通） =====
var CURRENCY_PAIRS = [
  { symbol: 'USD/JPY', key: 'usdjpy', label: 'ドル円', min: 100, max: 200, decimals: 3 },
  { symbol: 'EUR/USD', key: 'eurusd', label: 'ユーロドル', min: 0.90, max: 1.25, decimals: 5 },
  { symbol: 'GBP/USD', key: 'gbpusd', label: 'ポンドドル', min: 1.10, max: 1.50, decimals: 5 },
  { symbol: 'EUR/JPY', key: 'eurjpy', label: 'ユーロ円', min: 120, max: 200, decimals: 3 },
  { symbol: 'GBP/JPY', key: 'gbpjpy', label: 'ポンド円', min: 150, max: 250, decimals: 3 },
  { symbol: 'AUD/JPY', key: 'audjpy', label: '豪ドル円', min: 60, max: 120, decimals: 3 },
  { symbol: 'AUD/USD', key: 'audusd', label: '豪ドル米ドル', min: 0.50, max: 0.90, decimals: 5 }
];
// ===== 市場指標定義（★v5.5.3追加） =====
// GOOGLEFINANCEで自動更新。「指標データ」シートから読み取り
// labelは「指標データ」シートのA列と一致させること
var MARKET_INDICATORS = [
  { key: 'nikkei', label: '日経225',       unit: '円',     decimals: 0, min: 20000, max: 80000 },
  { key: 'djia',   label: 'NYダウ',        unit: 'ドル',   decimals: 0, min: 20000, max: 60000 },
  { key: 'sp500',  label: 'S&P500',        unit: '',       decimals: 0, min: 3000,  max: 8000 },
  { key: 'us10y',  label: '米10年債利回り', unit: '%',      decimals: 3, min: 1.0,   max: 7.0 },
  { key: 'vix',    label: 'VIX',           unit: '',       decimals: 2, min: 5,     max: 90 },
  // ゴールド: GOOGLEFINANCEが非対応のためAlpha Vantage（DAILY_COMMODITY_ASSETS）で取得
];

// ===== 商品データ定義（★v6.5追加: Twelve Data APIで1時間ごと取得） =====
// 為替レートと同様にレートキャッシュシートへ追記して履歴として蓄積する
// 投稿では主役にせず、FX値動きの背景・理由説明に使う
var COMMODITY_ASSETS = [
  { symbol: 'BTC/USD', key: 'btc',  label: 'ビットコイン', unit: 'ドル', decimals: 0, min: 10000, max: 200000 },
  { symbol: 'XAU/USD', key: 'gold', label: 'ゴールド',     unit: 'ドル', decimals: 2, min: 1500,  max: 8000   }
];

// Alpha Vantageで日次取得する商品（GOOGLEFINANCEで取得できないもの）
var DAILY_COMMODITY_ASSETS = [
  { avFunction: 'WTI',         key: 'wti',   label: 'WTI原油',  unit: 'ドル', decimals: 2, min: 30, max: 200 },
  { avFunction: 'NATURAL_GAS', key: 'natgas',label: '天然ガス', unit: 'ドル', decimals: 3, min: 1,  max: 20  }
];

// ===== 経済指標名の日英マッピング ★v5.7 =====
// Gemini Grounding検索精度向上用
// 米国指標は英語検索の方がReuters/Bloomberg等にヒットしやすい
// キー: 経済カレンダーD列の指標名（部分一致で検索）
var INDICATOR_NAME_MAP = {
  // 米国: 雇用
  '非農業部門雇用者数': 'US Non-Farm Payrolls',
  'ADP雇用統計': 'ADP Employment Change',
  '失業率': 'US Unemployment Rate',
  '新規失業保険申請件数': 'US Initial Jobless Claims',
  '平均時給': 'US Average Hourly Earnings',
  'JOLTS求人件数': 'US JOLTS Job Openings',
  // 米国: 物価
  '消費者物価指数': 'US CPI',
  'コア消費者物価指数': 'US Core CPI',
  'コアPCEデフレーター': 'US Core PCE Price Index',
  'PCEデフレーター': 'US PCE Price Index',
  '生産者物価指数': 'US PPI',
  // 米国: 景況感
  'ISM製造業景況指数': 'ISM Manufacturing PMI',
  'ISM非製造業景況指数': 'ISM Services PMI',
  'ミシガン大消費者信頼感指数': 'University of Michigan Consumer Sentiment',
  'CB消費者信頼感指数': 'US Conference Board Consumer Confidence',
  'フィラデルフィア連銀製造業景気指数': 'Philadelphia Fed Manufacturing Index',
  'NY連銀製造業景気指数': 'NY Empire State Manufacturing Index',
  // 米国: GDP・その他
  'GDP': 'US GDP',
  '小売売上高': 'US Retail Sales',
  '鉱工業生産': 'US Industrial Production',
  '耐久財受注': 'US Durable Goods Orders',
  '住宅着工件数': 'US Housing Starts',
  '中古住宅販売件数': 'US Existing Home Sales',
  '新築住宅販売件数': 'US New Home Sales',
  '貿易収支': 'US Trade Balance',
  // 米国: 金融政策
  'FOMC声明': 'FOMC Interest Rate Decision',
  'FOMC議事録': 'FOMC Minutes',
  'パウエル': 'Fed Chair Powell Speech',
  // 日本（日本語のまま検索する方が精度が高い）
  '日銀金融政策決定会合': 'BOJ Interest Rate Decision',
  '全国消費者物価指数': 'Japan CPI',
  '東京都区部消費者物価指数': 'Tokyo CPI',
  // ユーロ圏
  'ECB政策金利': 'ECB Interest Rate Decision',
  'ラガルド': 'ECB President Lagarde Speech',
  'ユーロ圏消費者物価指数': 'Eurozone HICP',
  'ユーロ圏GDP': 'Eurozone GDP',
  // 英国
  'BOE政策金利': 'BOE Interest Rate Decision',
  'BOE金融政策委員会': 'BOE MPC Rate Decision',
  '英国消費者物価指数': 'UK CPI',
  '英国GDP': 'UK GDP',
  // 全角表記対応（外為どっとコム等のシート入力で全角になる場合）
  'ＩＳＭ製造業景況指数': 'ISM Manufacturing PMI',
  'ＩＳＭ非製造業景況指数': 'ISM Services PMI',
  'ＰＭＩ': 'PMI',
  'ＧＤＰ': 'US GDP',
  'ＣＰＩ': 'US CPI',
  'ＥＣＢ': 'ECB',
  'ＢＯＥ': 'BOE',
  'ＦＯＭＣ': 'FOMC Interest Rate Decision',
  'ＡＤＰ': 'ADP Employment Change',
  'ＰＰＩ': 'US PPI',
  'ＰＣＥ': 'US PCE Price Index',
  'ＦＲＢ': 'Federal Reserve'
};

// ===== APIキー取得用の関数 =====
function getApiKeys() {
  var props = PropertiesService.getScriptProperties();
  return {
    X_API_KEY: props.getProperty('X_API_KEY'),
    X_API_SECRET: props.getProperty('X_API_SECRET'),
    X_ACCESS_TOKEN: props.getProperty('X_ACCESS_TOKEN'),
    X_ACCESS_SECRET: props.getProperty('X_ACCESS_SECRET'),
    GEMINI_API_KEY: props.getProperty('GEMINI_API_KEY'),
    TWELVE_DATA_API_KEY: props.getProperty('TWELVE_DATA_API_KEY'),
    ALPHA_VANTAGE_API_KEY: props.getProperty('ALPHA_VANTAGE_API_KEY'),
    SPREADSHEET_ID: props.getProperty('SPREADSHEET_ID'),
    IMAGE_FOLDER_ID: props.getProperty('IMAGE_FOLDER_ID')
  };
}

// ===== 投稿モード（Phase 3.5）=====
// メニューから切り替え可能（ScriptPropertiesで管理）
// 初回はmanual。メニューの「モード切替」で変更できる
var POST_MODE = PropertiesService.getScriptProperties().getProperty('POST_MODE') || 'manual';

// ===== 投稿タイプの定義 =====
var POST_TYPES = {
  MORNING: {
    id: 'morning',
    label: 'MORNING BRIEF',
    emoji: '🌅',
    hasImage: false,
    frameColor: '#00e5ff',
    charMin: 280,
    charMax: 450
  },
  TOKYO: {
    id: 'tokyo',
    label: 'TOKYO OPEN',
    emoji: '📊',
    hasImage: false,
    frameColor: null,
    charMin: 200,
    charMax: 350
  },
  LUNCH: {
    id: 'lunch',
    label: 'LUNCH',
    emoji: '🍱',
    hasImage: false,
    frameColor: null,
    charMin: 200,
    charMax: 350
  },
  LONDON: {
    id: 'london',
    label: 'LONDON REPORT',
    emoji: '🌆',
    hasImage: false,
    frameColor: '#00ff88',
    charMin: 200,
    charMax: 350
  },
  GOLDEN: {
    id: 'golden',
    label: 'GOLDEN TIME',
    emoji: '🔥',
    hasImage: false,
    frameColor: null,
    charMin: 280,
    charMax: 450
  },
  NY: {
    id: 'ny',
    label: 'NY PREVIEW',
    emoji: '🗽',
    hasImage: false,
    frameColor: '#bf5fff',
    charMin: 280,
    charMax: 450
  },
  INDICATOR: {
    id: 'indicator',
    label: 'INDICATOR ALERT',
    emoji: '⚡',
    hasImage: false,
    frameColor: '#ff3355',
    charMin: 280,
    charMax: 450
  },
  KNOWLEDGE: {
    id: 'knowledge',
    label: 'KNOWLEDGE',
    emoji: '📕',
    hasImage: false,
    frameColor: null,
    charMin: 200,
    charMax: 350
  },
  WEEKLY_REVIEW: {
    id: 'weekly_review',
    label: 'WEEKLY REVIEW',
    emoji: '📋',
    hasImage: false,
    frameColor: '#ffd700',
    charMin: 280,
    charMax: 450
  },
  RULE_1: {
    id: 'rule_1',
    label: 'RULE',
    emoji: '🧠',
    hasImage: false,
    frameColor: null,
    charMin: 200,
    charMax: 300
  },
  RULE_2: {
    id: 'rule_2',
    label: "TRADER'S RULE",
    emoji: '💪',
    hasImage: false,
    frameColor: '#00e5ff',
    charMin: 200,
    charMax: 300
  },
  WEEKLY_LEARNING: {
    id: 'weekly_learning',
    label: 'LEARNING',
    emoji: '📝',
    hasImage: false,
    frameColor: null,
    charMin: 200,
    charMax: 300
  },
  RULE_3: {
    id: 'rule_3',
    label: 'RULE',
    emoji: '🧠',
    hasImage: false,
    frameColor: null,
    charMin: 200,
    charMax: 300
  },
  NEXT_WEEK: {
    id: 'next_week',
    label: 'NEXT WEEK',
    emoji: '🔮',
    hasImage: false,
    frameColor: '#00ff88',
    charMin: 280,
    charMax: 450
  },
  RULE_4: {
    id: 'rule_4',
    label: 'RULE',
    emoji: '💡',
    hasImage: false,
    frameColor: null,
    charMin: 200,
    charMax: 300
  },
  WEEKLY_HYPOTHESIS: {
    id: 'weekly_hypothesis',
    label: 'HYPOTHESIS',
    emoji: '💭',
    hasImage: false,
    frameColor: null,
    charMin: 200,
    charMax: 300
  }
};

// ===== 曜日別スケジュール（1分単位 + Bot判定回避） =====
var SCHEDULE = {
  1: { // 月曜
    times: ['07:33', '09:18', '12:08', '17:22', '20:47', '22:13'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY']
  },
  2: { // 火曜
    times: ['07:48', '09:33', '12:14', '17:18', '20:53', '22:07'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY']
  },
  3: { // 水曜
    times: ['07:41', '09:11', '12:06', '17:28', '20:42', '22:18'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY']
  },
  4: { // 木曜
    times: ['07:56', '09:26', '12:19', '17:14', '20:56', '22:04'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY']
  },
  5: { // 金曜
    times: ['07:37', '09:38', '12:11', '17:24', '20:49', '22:11'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY']
  },
  6: { // 土曜
    times: ['08:22', '11:48', '15:14', '20:32'],
    types: ['WEEKLY_REVIEW', 'RULE_1', 'RULE_2', 'WEEKLY_LEARNING']
  },
  0: { // 日曜
    times: ['10:18', '14:13', '17:42', '20:28'],
    types: ['RULE_3', 'NEXT_WEEK', 'RULE_4', 'WEEKLY_HYPOTHESIS']
  }
};

// ===== ランダムゆらぎ（分） =====
var RANDOM_DELAY_MIN = 0;
var RANDOM_DELAY_MAX = 2; // ★v5.9.4: 5→2に短縮（6分制限タイムアウト対策。scheduler.gsのトリガーゆらぎと合わせて最大4分のランダム性を確保）

// ===== Gemini API設定 =====
var GEMINI_MODEL = 'gemini-2.0-flash';
var GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// ===== X API設定 =====
var X_API_BASE = 'https://api.x.com/2';

// ===== Sheets設定（★Phase 3.5で拡張） =====
var SHEET_NAMES = {
  HISTORY: '投稿履歴',
  THEMES: '心得テーマ',
  CHARACTER: 'キャラクター',   // ★追加
  DRAFTS: '下書き'             // ★追加
};

// ===== 12種のアーキタイプ（画像の構図） =====
var ARCHETYPES = [
  'structured_list',
  'central_focus',
  'dual_contrast',
  'flow_perspective',
  'closeup_mechanism',
  'topdown_blueprint',
  'dynamic_action',
  'breakthrough_impact',
  'atmosphere',
  'mind_game',
  'crowd_sentiment',
  'cycle_rhythm'
];

// ===== 投稿タイプ別の推奨アーキタイプ =====
var ARCHETYPE_MAP = {
  MORNING: ['dynamic_action', 'breakthrough_impact', 'atmosphere', 'central_focus'],
  LONDON: ['structured_list', 'dual_contrast', 'dynamic_action'],
  NY: ['flow_perspective', 'structured_list', 'mind_game'],
  INDICATOR: ['central_focus', 'mind_game', 'structured_list'],
  WEEKLY_REVIEW: ['structured_list', 'cycle_rhythm', 'central_focus'],
  RULE_2: ['central_focus', 'mind_game', 'dual_contrast'],
  NEXT_WEEK: ['structured_list', 'flow_perspective', 'topdown_blueprint']
};

// ===== 背景画像の固定スタイルプロンプト =====
var BACKGROUND_PROMPT = 'Generate a 16:9 background image.\n\n' +
  'MANDATORY STYLE (every image):\n' +
  '- Color: ONLY dark navy (#0a0e27) to black (#050510) gradient\n' +
  '- Accent: subtle geometric grid lines in very dim cyan (#0f2f3f)\n' +
  '- Texture: fine digital noise/grain overlay\n' +
  '- Elements: abstract data visualization shapes (circles, lines, dots)\n' +
  '- Brightness: VERY DARK (max 30% brightness)\n' +
  '- NO text, NO numbers, NO characters, NO words\n\n' +
  'COMPOSITION: {archetype}\n' +
  'MOOD: {mood}';

// ===== バリデーション設定（★Phase 3.5 レベル2で使用） =====
var VALIDATION_CONFIG = {
  USDJPY_MIN: 100,
  USDJPY_MAX: 200,
  EURJPY_MIN: 100,
  EURJPY_MAX: 250,
  GBPJPY_MIN: 130,
  GBPJPY_MAX: 280,
  CURRENT_YEAR: new Date().getFullYear(),
  BANNED_WORDS: ['いかがでしょうか', '本日は', 'フォロワーの皆様', '皆さん'],
  DRAFT_EXPIRY_MINUTES: 90
};

// ===== テスト用: 設定確認関数 =====
function testConfig() {
  var keys = getApiKeys();

  console.log('X_API_KEY: ' + (keys.X_API_KEY ? '✅ 設定済み' : '❌ 未設定'));
  console.log('X_API_SECRET: ' + (keys.X_API_SECRET ? '✅ 設定済み' : '❌ 未設定'));
  console.log('X_ACCESS_TOKEN: ' + (keys.X_ACCESS_TOKEN ? '✅ 設定済み' : '❌ 未設定'));
  console.log('X_ACCESS_SECRET: ' + (keys.X_ACCESS_SECRET ? '✅ 設定済み' : '❌ 未設定'));
  console.log('GEMINI_API_KEY: ' + (keys.GEMINI_API_KEY ? '✅ 設定済み' : '❌ 未設定'));
  console.log('TWELVE_DATA_API_KEY: ' + (keys.TWELVE_DATA_API_KEY ? '✅ 設定済み' : '❌ 未設定'));
  console.log('SPREADSHEET_ID: ' + (keys.SPREADSHEET_ID ? '✅ 設定済み' : '❌ 未設定'));
  console.log('IMAGE_FOLDER_ID: ' + (keys.IMAGE_FOLDER_ID ? '✅ 設定済み' : '❌ 未設定'));

  console.log('');
  console.log('タイムゾーン: ' + Session.getScriptTimeZone());
  console.log('投稿タイプ数: ' + Object.keys(POST_TYPES).length);
  console.log('POST_MODE: ' + POST_MODE);
  console.log('設定の読み込みテスト完了！');
}