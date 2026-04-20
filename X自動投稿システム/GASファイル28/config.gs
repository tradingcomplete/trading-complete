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
 * ★ v8.16: POST_TYPES文字数を全タイプ軽量化（スクロール不要の共感重視設計）
 */

// ===== ★v12.6.1: ScriptProperties キー一覧（全24キー） =====
// 新しいプロパティを追加する際は、既存キーとの衝突を避けるためここを確認すること
//
// 【永続設定（13キー）】手動で1回設定。APIキー・ID・モード
//   X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET  ← xApi.gs
//   GEMINI_API_KEY                                                ← geminiApi.gs / factCheck.gs
//   CLAUDE_API_KEY                                                ← geminiApi.gs / qualityReview.gs
//   TWELVE_DATA_API_KEY / ALPHA_VANTAGE_API_KEY                   ← rateManager.gs
//   SPREADSHEET_ID / IMAGE_FOLDER_ID / WATERMARK_IMAGE_ID         ← 複数ファイル
//   WEBAPP_URL                                                    ← approval.gs
//   POST_MODE                                                     ← main.gs（manual/validate/auto）
//
// 【揮発性ランタイム（11キー）】実行中に自動で読み書き
//   PHASE_B_POST_ID / PHASE_B_POST_TYPE / PHASE_B_POST_TEXT       ← main.gs（Phase Bパイプライン。1分後に消費）
//   LAST_FACT_CHECK_ + postType                                   ← geminiApi.gs（承認メール用。動的サフィックス）
//   REGEN_REQUEST_ + postId                                       ← approval.gs（画像再生成要求。動的サフィックス）
//   FLASH_FALLBACK_USED                                           ← geminiApi.gs（Claudeフォールバック使用フラグ）
//   TODAY_QUESTION_COUNT                                          ← promptBuilder.gs（問いかけ回数。毎朝リセット）
//   SKIP_FACT_CHECK                                               ← testFunctions.gs（テスト用スキップ）
//   TC_FEATURE_INDEX                                              ← promptBuilder.gs（TC機能紹介の順序）
//   INDICATOR_TARGET                                              ← scheduler.gs（指標アラート対象指標名）
//   HOLIDAY_NOTIFIED_YEAR                                         ← anomalyManager.gs（祝日通知済み年）

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
  { key: 'us10y',  label: '米10年債利回り', unit: '%',      decimals: 3, min: 10,    max: 70,   tnxScale: 0.1 },
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

// ===== 日次レートシート列定義 ★v12.1.1 =====
// SH/SL列を追加しても既存コードに影響しないよう、列位置を1箇所で管理
var DAILY_RATE_COLS = {
  DATE: 0,
  OHLC_START: 1,
  OHLC_PER_PAIR: 4,
  getOhlcCols: function(pairIndex) {
    var base = this.OHLC_START + pairIndex * this.OHLC_PER_PAIR;
    return { open: base, high: base + 1, low: base + 2, close: base + 3 };
  },
  getCountCol: function() {
    return this.OHLC_START + CURRENCY_PAIRS.length * this.OHLC_PER_PAIR;
  },
  getShCol: function(pairIndex) {
    return this.getCountCol() + 1 + pairIndex * 2;
  },
  getSlCol: function(pairIndex) {
    return this.getCountCol() + 1 + pairIndex * 2 + 1;
  },
  getTotalCols: function() {
    return 1 + CURRENCY_PAIRS.length * this.OHLC_PER_PAIR + 1 + CURRENCY_PAIRS.length * 2;
  },
  getOhlcOnlyCols: function() {
    return 1 + CURRENCY_PAIRS.length * this.OHLC_PER_PAIR + 1;
  }
};

// ===== 週足シート列定義 ★v12.1.1 =====
var WEEKLY_RATE_COLS = {
  DATE: 0,
  COLS_PER_PAIR: 6,
  getPairCols: function(pairIndex) {
    var base = 1 + pairIndex * this.COLS_PER_PAIR;
    return { open: base, high: base + 1, low: base + 2, close: base + 3, sh: base + 4, sl: base + 5 };
  },
  getTotalCols: function() {
    return 1 + CURRENCY_PAIRS.length * this.COLS_PER_PAIR;
  }
};

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
// ★v8.16: 文字数を全タイプ軽量化（1投稿1ネタ・140字以内ならスクロール不要）
// ★v12.6.1: hasImageフィールド廃止。画像対象タイプはimageGenerator.gs IMAGE_TYPE_COLORSで一元管理
var POST_TYPES = {
  MORNING: {
    id: 'morning',
    label: 'MORNING BRIEF',
    emoji: '🌅',
    frameColor: '#00e5ff',
    charMin: 150,
    charMax: 300
  },
  TOKYO: {
    id: 'tokyo',
    label: 'TOKYO OPEN',
    emoji: '📊',
    frameColor: null,
    charMin: 100,
    charMax: 180
  },
  LUNCH: {
    id: 'lunch',
    label: 'LUNCH',
    emoji: '🍱',
    frameColor: null,
    charMin: 100,
    charMax: 180
  },
  LONDON: {
    id: 'london',
    label: 'LONDON REPORT',
    emoji: '🌆',
    frameColor: '#00ff88',
    charMin: 100,
    charMax: 250
  },
  GOLDEN: {
    id: 'golden',
    label: 'GOLDEN TIME',
    emoji: '🔥',
    frameColor: null,
    charMin: 150,
    charMax: 350
  },
  // ★v12.7: NY削除（GOLDENと役割重複。1日6投稿→5投稿に削減）
  INDICATOR: {
    id: 'indicator',
    label: 'INDICATOR ALERT',
    emoji: '⚡',
    frameColor: '#ff3355',
    charMin: 140,
    charMax: 180
  },
  KNOWLEDGE: {
    id: 'knowledge',
    label: 'KNOWLEDGE',
    emoji: '📕',
    frameColor: null,
    charMin: 150,
    charMax: 350
  },
  WEEKLY_REVIEW: {
    id: 'weekly_review',
    label: 'WEEKLY REVIEW',
    emoji: '📋',
    frameColor: '#ffd700',
    charMin: 200,
    charMax: 400
  },
  RULE_1: {
    id: 'rule_1',
    label: 'RULE',
    emoji: '🧠',
    frameColor: null,
    charMin: 120,
    charMax: 280
  },
  RULE_2: {
    id: 'rule_2',
    label: "TRADER'S RULE",
    emoji: '💪',
    frameColor: '#00e5ff',
    charMin: 120,
    charMax: 280
  },
  WEEKLY_LEARNING: {
    id: 'weekly_learning',
    label: 'LEARNING',
    emoji: '📝',
    frameColor: null,
    charMin: 150,
    charMax: 300
  },
  RULE_3: {
    id: 'rule_3',
    label: 'RULE',
    emoji: '🧠',
    frameColor: null,
    charMin: 120,
    charMax: 280
  },
  NEXT_WEEK: {
    id: 'next_week',
    label: 'NEXT WEEK',
    emoji: '🔮',
    frameColor: '#00ff88',
    charMin: 200,
    charMax: 400
  },
  RULE_4: {
    id: 'rule_4',
    label: 'RULE',
    emoji: '💡',
    frameColor: null,
    charMin: 120,
    charMax: 280
  },
  WEEKLY_HYPOTHESIS: {
    id: 'weekly_hypothesis',
    label: 'HYPOTHESIS',
    emoji: '💭',
    frameColor: null,
    charMin: 150,
    charMax: 300
  }
};

// ===== 曜日別スケジュール（1分単位 + Bot判定回避） =====
// ★v12.7/v12.8: NYを削除。平日5投稿に統一
//   types削除 + times削除を完全同期。不整合で undefined → runMorning 誤発火を防止
var SCHEDULE = {
  1: { // 月曜 ★v12.3.1: MORNING 07:28→08:03（原油先物開場+1h確保。週末ニュースのGrounding精度向上）
    times: ['08:03', '09:18', '12:08', '17:22', '20:47'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN']
  },
  2: { // 火曜
    times: ['07:43', '09:33', '12:14', '17:18', '20:53'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN']
  },
  3: { // 水曜
    times: ['07:35', '09:11', '12:06', '17:28', '20:42'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN']
  },
  4: { // 木曜
    times: ['07:47', '09:26', '12:19', '17:14', '20:56'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN']
  },
  5: { // 金曜
    times: ['07:22', '09:38', '12:11', '17:24', '20:49'],
    types: ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN']
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
var RANDOM_DELAY_MAX = 3; // ★v8.0: 2→3に拡大（ランダム性を確保しつつ6分制限内に収まる）

// ===== ★v12.6: レート桁数の一元管理（リグレッション防止） =====
// toFixed()の桁数が6ファイル以上に散在していた問題を解消。
// 「投稿テキスト用」と「内部検証用」の2種類を一元定義。
//
// 使い方:
//   formatRate_(158.864, 'usdjpy', 'display')  → '158.86'（投稿テキスト用）
//   formatRate_(158.864, 'usdjpy', 'verify')   → '158.864'（内部検証用）
//   formatRate_(1.15374, 'eurusd', 'display')  → '1.1537'（投稿テキスト用）
//   formatRate_(1.15374, 'eurusd', 'verify')   → '1.15374'（内部検証用）
//
// 鉄則: Number(rates.xxx).toFixed(N) を直書きしない。この関数を使う。

/** 投稿テキスト用の桁数（人間が読む精度） */
var RATE_DECIMALS_DISPLAY = { jpy: 2, usd: 4 };
/** 内部検証用の桁数（API精度を維持） */
var RATE_DECIMALS_VERIFY  = { jpy: 3, usd: 5 };

/**
 * レートの表示桁数を一元管理する
 *
 * @param {number} value - レート値
 * @param {string} pairKey - 通貨ペアキー（'usdjpy', 'eurusd'等）
 * @param {string} [purpose='display'] - 'display'=投稿用(2/4桁), 'verify'=検証用(3/5桁)
 * @return {string} フォーマット済みレート文字列
 */
function formatRate_(value, pairKey, purpose) {
  if (!value || isNaN(Number(value))) return '';
  purpose = purpose || 'display';
  
  // CURRENCY_PAIRSからペア情報を取得
  var pair = null;
  for (var i = 0; i < CURRENCY_PAIRS.length; i++) {
    if (CURRENCY_PAIRS[i].key === pairKey) {
      pair = CURRENCY_PAIRS[i];
      break;
    }
  }
  
  if (!pair) return Number(value).toFixed(2);
  
  // JPYペア（decimals=3）かUSDペア（decimals=5）かで桁数を決定
  var isJpy = pair.decimals === 3;
  var decimals;
  if (purpose === 'verify') {
    decimals = isJpy ? RATE_DECIMALS_VERIFY.jpy : RATE_DECIMALS_VERIFY.usd;
  } else {
    decimals = isJpy ? RATE_DECIMALS_DISPLAY.jpy : RATE_DECIMALS_DISPLAY.usd;
  }
  
  return Number(value).toFixed(decimals);
}


// ===== formatRate_テスト =====
function testFormatRate() {
  console.log('=== formatRate_ テスト ===');
  var passed = 0;
  var failed = 0;
  
  function check(name, expected, actual) {
    if (expected === actual) {
      passed++;
    } else {
      failed++;
      console.log('  ❌ ' + name + ': 期待=' + expected + ' 実際=' + actual);
    }
  }
  
  // JPYペア display: 2桁
  check('USD/JPY display', '158.86', formatRate_(158.864, 'usdjpy', 'display'));
  check('EUR/JPY display', '163.42', formatRate_(163.421, 'eurjpy', 'display'));
  check('AUD/JPY display', '97.50',  formatRate_(97.503, 'audjpy', 'display'));
  
  // JPYペア verify: 3桁
  check('USD/JPY verify', '158.864', formatRate_(158.864, 'usdjpy', 'verify'));
  check('EUR/JPY verify', '163.421', formatRate_(163.421, 'eurjpy', 'verify'));
  
  // USDペア display: 4桁
  check('EUR/USD display', '1.1537', formatRate_(1.15374, 'eurusd', 'display'));
  check('GBP/USD display', '1.2984', formatRate_(1.29843, 'gbpusd', 'display'));
  check('AUD/USD display', '0.7126', formatRate_(0.71260, 'audusd', 'display'));
  
  // USDペア verify: 5桁
  check('EUR/USD verify', '1.15374', formatRate_(1.15374, 'eurusd', 'verify'));
  check('AUD/USD verify', '0.71260', formatRate_(0.71260, 'audusd', 'verify'));
  
  // デフォルトはdisplay
  check('purpose省略=display', '158.86', formatRate_(158.864, 'usdjpy'));
  
  // エッジケース
  check('null入力', '', formatRate_(null, 'usdjpy'));
  check('NaN入力', '', formatRate_('abc', 'usdjpy'));
  
  console.log('');
  console.log('formatRate_テスト: ✅' + passed + ' / ❌' + failed);
}

// ===== ★v12.5.2: サマータイム自動調整 =====
// ロンドン・NY市場の開場時刻はサマータイムで1時間早まる。
// 投稿時刻もそれに合わせて自動で1時間前倒しする。
// 欧州サマータイム: 3月最終日曜〜10月最終日曜（米国DST: 3月第2日曜〜11月第1日曜とほぼ重複）
// → 欧州基準で判定（ロンドン市場を優先。NY市場は1-2週間のズレがあるが実用上問題なし）

/** サマータイム対象の投稿タイプ（ロンドン・NY市場連動 + GOLDEN） */
var SUMMER_TIME_TYPES = ['LONDON', 'GOLDEN'];  // ★v12.7: NY削除

/** サマータイム時のオフセット（分）。マイナス = 前倒し */
var SUMMER_TIME_OFFSET_MIN = -60;

/**
 * 現在が欧州サマータイム期間かどうかを判定する
 * 欧州サマータイム: 3月最終日曜 01:00 UTC 〜 10月最終日曜 01:00 UTC
 * 
 * @param {Date} [date] - 判定対象日（省略時は現在）
 * @return {boolean} サマータイム期間ならtrue
 */
function isSummerTime_(date) {
  var now = date || new Date();
  var year = now.getFullYear();
  var month = now.getMonth(); // 0-11
  
  // 4月〜9月は確実にサマータイム
  if (month >= 3 && month <= 8) return true;
  // 1月〜2月, 11月〜12月は確実に冬時間
  if (month <= 1 || month >= 10) return false;
  
  // 3月: 最終日曜日以降ならサマータイム
  if (month === 2) {
    var marchLast = new Date(year, 2, 31);
    var marchLastSun = 31 - marchLast.getDay();
    return now.getDate() >= marchLastSun;
  }
  
  // 10月: 最終日曜日より前ならサマータイム
  if (month === 9) {
    var octLast = new Date(year, 9, 31);
    var octLastSun = 31 - octLast.getDay();
    return now.getDate() < octLastSun;
  }
  
  return false;
}

// ===== 日本の祝日（★v8.15: アノマリー判定用・年1回更新） =====
// ゴトー日の営業日補正に使用。振替休日含む。
// 更新タイミング: 毎年12月に翌年分を追加
var JAPAN_HOLIDAYS = [
  // 2026年
  '2026-01-01', // 元日
  '2026-01-12', // 成人の日
  '2026-02-11', // 建国記念の日
  '2026-02-23', // 天皇誕生日
  '2026-03-20', // 春分の日
  '2026-04-29', // 昭和の日
  '2026-05-03', // 憲法記念日
  '2026-05-04', // みどりの日
  '2026-05-05', // こどもの日
  '2026-05-06', // 振替休日
  '2026-07-20', // 海の日
  '2026-08-11', // 山の日
  '2026-09-21', // 敬老の日
  '2026-09-22', // 国民の休日
  '2026-09-23', // 秋分の日
  '2026-10-12', // スポーツの日
  '2026-11-03', // 文化の日
  '2026-11-23', // 勤労感謝の日
  // 2027年（12月に追加予定）
];

// ===== Gemini API設定 =====
var GEMINI_MODEL = 'gemini-2.5-pro';  // ★v8.8.1: Flash→Pro変更（指示追従・文字数遵守の改善）
var GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// ===== Claude API設定（★v12.6.1: 定数化。geminiApi.gs callClaudeApi_が参照） =====
var CLAUDE_MODEL = 'claude-sonnet-4-6';

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
  // ★v12.7: NY削除
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

// ===== 確定データ（スプレッドシート「確定データ」シートから読み取り） =====
// ★v8.7: config.gsのPOLICY_RATESハードコード廃止 → スプレッドシートに一元化
// 金利変更・要人交代時はスプレッドシートのセルを書き換えるだけでOK（コード修正不要）
// 初回セットアップ: カスタムメニュー「確定データシート作成」を実行

/**
 * 「確定データ」シートから政策金利のテキストを取得する
 * 呼び出し元: promptBuilder.gs / factCheck.gs（3箇所）
 * @return {string} プロンプト注入用テキスト
 */
function getPolicyRatesText_() {
  return getRefDataText_('金利');
}

/**
 * 「確定データ」シートから要人リストのテキストを取得する
 * 呼び出し元: promptBuilder.gs / factCheck.gs（3箇所）
 * @return {string} プロンプト注入用テキスト
 */
function getWorldLeadersText_() {
  return getRefDataText_('要人');
}

/**
 * 「確定データ」シートから指定区分のデータを読み取ってテキスト化する
 * @param {string} category - 区分名（'金利' or '要人'）
 * @return {string} プロンプト注入用テキスト
 */
function getRefDataText_(category) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('確定データ');
    
    if (!sheet) {
      console.log('⚠️ 確定データシートが見つかりません。カスタムメニュー「確定データシート作成」を実行してください');
      return '';
    }
    
    var data = sheet.getDataRange().getValues();
    var lines = '';
    
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === category) {
        var name = String(data[i][1]).trim();
        var detail = String(data[i][2]).trim();
        var note = String(data[i][3]).trim();
        
        if (name && detail) {
          lines += '・' + name + ': ' + detail;
          if (note) {
            lines += '（' + note + '）';
          }
          lines += '\n';
        }
      }
    }
    
    return lines;
  } catch (e) {
    console.log('⚠️ 確定データ読み取りエラー（' + category + '）: ' + e.message);
    return '';
  }
}

/**
 * 「確定データ」シートを新規作成し、初期データを投入する
 * カスタムメニューから1回だけ実行する
 */
function setupReferenceDataSheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // 既存シートがあれば確認
  var existing = ss.getSheetByName('確定データ');
  if (existing) {
    var ui = SpreadsheetApp.getUi();
    var response = ui.alert(
      '確定データシートは既に存在します',
      '上書きしますか？（既存データは全て消えます）',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) {
      console.log('キャンセルしました');
      return;
    }
    ss.deleteSheet(existing);
  }
  
  var sheet = ss.insertSheet('確定データ');
  
  // ヘッダー
  var headers = ['区分', '名称', '詳細', '備考'];
  sheet.getRange(1, 1, 1, 4).setValues([headers]);
  
  // 初期データ
  var data = [
    // 政策金利
    ['金利', 'FRB（米国）',     '3.50-3.75%',    '2025年12月利下げ後据え置き中'],
    ['金利', '日銀（日本）',     '0.75%',         '2025年12月利上げ。緩やかな引き締め路線'],
    ['金利', 'ECB（ユーロ圏）',  '政策金利2.15%', '2025年6月利下げ完了後、据え置き中。2026年3月19日も据え置き決定'],
    ['金利', 'BOE（英国）',     '3.75%',         '2025年に6回利下げ後、据え置き中。2026年3月20日も据え置き決定'],
    ['金利', 'RBA（豪州）',     '4.10%',         '2026年3月17日に3.85%→4.10%へ利上げ。連続利上げ'],
    // 要人: 米国
    ['要人', 'ドナルド・トランプ',         '米国大統領（第47代）',     '2025年1月就任'],
    ['要人', 'JD・ヴァンス',              '米国副大統領',            '2025年1月就任'],
    ['要人', 'スコット・ベッセント',       '米国財務長官',            '2025年1月就任'],
    ['要人', 'ジェローム・パウエル',       'FRB議長',                '2018年2月就任。任期2026年5月まで'],
    // 要人: 日本
    ['要人', '高市早苗',                  '日本国内閣総理大臣（第104代）', '2025年10月就任。初の女性首相'],
    ['要人', '片山さつき',                '日本国財務大臣兼金融担当相', '2025年10月就任'],
    ['要人', '茂木敏充',                  '日本国外務大臣',           '2025年10月就任'],
    ['要人', '植田和男',                  '日銀総裁',                '2023年4月就任'],
    // 要人: 欧州
    ['要人', 'クリスティーヌ・ラガルド',   'ECB総裁',                '2019年11月就任'],
    ['要人', 'アンドリュー・ベイリー',     'BOE総裁',                '2020年3月就任'],
    // 要人: その他
    ['要人', 'ミシェル・ブロック',         'RBA総裁',                '2023年9月就任'],
    ['要人', '習近平',                    '中国国家主席',            '米中貿易摩擦・関税関連で頻出'],
  ];
  
  sheet.getRange(2, 1, data.length, 4).setValues(data);
  
  // 書式設定
  var headerRange = sheet.getRange(1, 1, 1, 4);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a86c8');
  headerRange.setFontColor('white');
  
  // 列幅
  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 250);
  sheet.setColumnWidth(4, 400);
  
  // 区分列の色分け
  for (var i = 0; i < data.length; i++) {
    var row = i + 2;
    if (data[i][0] === '金利') {
      sheet.getRange(row, 1).setBackground('#e8f5e9');
    } else if (data[i][0] === '要人') {
      sheet.getRange(row, 1).setBackground('#e3f2fd');
    }
  }
  
  sheet.getRange(1, 1).setNote('金利変更・要人交代時はこのシートを編集するだけでOK。コード修正不要。');
  
  console.log('✅ 確定データシートを作成しました（金利' + data.filter(function(r){ return r[0] === '金利'; }).length + '件 + 要人' + data.filter(function(r){ return r[0] === '要人'; }).length + '件）');
  SpreadsheetApp.getUi().alert('確定データシートを作成しました');
}