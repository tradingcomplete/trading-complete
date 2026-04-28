/**
 * CompanaFXAutoPost - applyPairColors
 * 日次レート・レートサマリーシートの通貨ペア列に背景色を設定
 * 
 * 【使い方】
 *   カスタムメニュー「FX自動投稿 → 🎨 列色を設定」で実行
 *   または GASエディタで applyPairColors() を直接実行
 *   ★1回実行すれば、再集計・日次集約しても色は維持されます
 */

// ===== 通貨ペア別カラーパレット =====
var PAIR_COLORS = {
  // [ヘッダー背景, データ背景]
  USDJPY: ['#9FC5E8', '#DAEAF8'],  // 青系
  EURUSD: ['#A8D08D', '#E2EFDA'],  // 緑系
  GBPUSD: ['#FFD966', '#FFF2CC'],  // 黄系
  EURJPY: ['#EA9999', '#F4CCCC'],  // ピンク系
  GBPJPY: ['#B4A7D6', '#D9D2E9'],  // 紫系
  AUDJPY: ['#76A5AF', '#D0E0E3'],  // シアン系
  AUDUSD: ['#F9CB9C', '#FCE5CD']   // オレンジ系
};

// ===== 商品データ別カラーパレット（★v6.5追加） =====
// [ヘッダー背景, データ背景]
var COMMODITY_COLORS = {
  WTI:    ['#C9A96E', '#F5E6D3'],  // アンバー（原油・エネルギーイメージ）
  BTC:    ['#F7C948', '#FDF3C8'],  // ゴールド（ビットコインイメージ）
  GOLD:   ['#E8C97A', '#FBF3DC'],  // ライトゴールド（ゴールドイメージ）
  NATGAS: ['#81C995', '#CEEAD6']   // ライトグリーン（天然ガスイメージ）
};

// ヘッダー・日付列・その他列の色
var HEADER_TEXT_COLOR = '#000000';
var DATE_HEADER_BG = '#D9D9D9';    // 日付列ヘッダー
var DATE_DATA_BG = '#F3F3F3';      // 日付列データ
var OTHER_HEADER_BG = '#D9D9D9';   // その他列ヘッダー
var OTHER_DATA_BG = '#F3F3F3';     // その他列データ


// ===== メイン: 両シートに色を設定 =====
function applyPairColors() {
  console.log('=== 通貨ペア列色設定 ===');
  console.log('');
  
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // 日次レートシート
  var dailySheet = ss.getSheetByName('日次レート');
  if (dailySheet) {
    applyDailyRateColors_(dailySheet);
  } else {
    console.log('⚠️ 日次レートシートが見つかりません');
  }
  
  // レートサマリーシート
  var summarySheet = ss.getSheetByName('レートサマリー');
  if (summarySheet) {
    applySummaryColors_(summarySheet);
  } else {
    console.log('⚠️ レートサマリーシートが見つかりません');
  }
  
  // レートキャッシュシート
  var cacheSheet = ss.getSheetByName('レートキャッシュ');
  if (cacheSheet) {
    applyCacheColors_(cacheSheet);
  } else {
    console.log('⚠️ レートキャッシュシートが見つかりません');
  }
  
  console.log('');
  console.log('🎨 列色設定完了！');
}


// ===== 日次レートシートの色設定 =====
function applyDailyRateColors_(sheet) {
  console.log('📊 日次レートシートに色を設定中...');
  
  var maxRow = 5000; // 将来データ分も含めて大きく確保
  var pairCount = CURRENCY_PAIRS.length; // 7
  var colsPerPair = 4; // 始値,高値,安値,終値
  var totalCols = 1 + pairCount * colsPerPair + 1; // 日付 + 7x4 + データ件数
  
  // --- ヘッダー行（1行目） ---
  // 日付列ヘッダー
  sheet.getRange(1, 1).setBackground(DATE_HEADER_BG).setFontWeight('bold');
  
  // 各通貨ペアのヘッダー
  var colorKeys = ['USDJPY', 'EURUSD', 'GBPUSD', 'EURJPY', 'GBPJPY', 'AUDJPY', 'AUDUSD'];
  for (var i = 0; i < pairCount; i++) {
    var startCol = 2 + i * colsPerPair; // B=2, F=6, J=10...
    var headerColor = PAIR_COLORS[colorKeys[i]][0];
    sheet.getRange(1, startCol, 1, colsPerPair)
      .setBackground(headerColor)
      .setFontWeight('bold')
      .setFontColor(HEADER_TEXT_COLOR);
  }
  
  // データ件数列ヘッダー
  var lastCol = 2 + pairCount * colsPerPair;
  sheet.getRange(1, lastCol).setBackground(OTHER_HEADER_BG).setFontWeight('bold');
  
  // --- データ行（2行目〜5000行目） ---
  // 日付列
  sheet.getRange(2, 1, maxRow - 1, 1).setBackground(DATE_DATA_BG);
  
  // 各通貨ペアのデータ列
  for (var j = 0; j < pairCount; j++) {
    var startColData = 2 + j * colsPerPair;
    var dataColor = PAIR_COLORS[colorKeys[j]][1];
    sheet.getRange(2, startColData, maxRow - 1, colsPerPair).setBackground(dataColor);
  }
  
  // データ件数列
  sheet.getRange(2, lastCol, maxRow - 1, 1).setBackground(OTHER_DATA_BG);
  
  // ★v12.1.1: SH/SL列の色設定（件数列の次から14列）
  var shslStartCol = lastCol + 1;
  var shslColCount = pairCount * 2; // 7ペア × SH/SL
  if (sheet.getLastColumn() >= shslStartCol + shslColCount - 1) {
    // ヘッダー
    for (var si = 0; si < pairCount; si++) {
      var shCol = shslStartCol + si * 2;
      var slCol = shCol + 1;
      var shslColor = PAIR_COLORS[colorKeys[si]][0];
      sheet.getRange(1, shCol, 1, 2).setBackground(shslColor).setFontWeight('bold').setFontColor(HEADER_TEXT_COLOR);
    }
    // データ行
    for (var sj = 0; sj < pairCount; sj++) {
      var shDataCol = shslStartCol + sj * 2;
      var shslDataColor = PAIR_COLORS[colorKeys[sj]][1];
      sheet.getRange(2, shDataCol, maxRow - 1, 2).setBackground(shslDataColor);
    }
    console.log('  ✅ SH/SL列: ' + shslColCount + '列に色設定');
  }
  
  console.log('  ✅ 日次レート: ' + pairCount + 'ペア × ' + colsPerPair + '列 = ' + (pairCount * colsPerPair) + '列に色設定');
}


// ===== レートサマリーシートの色設定 =====
function applySummaryColors_(sheet) {
  console.log('📋 レートサマリーシートに色を設定中...');
  
  var maxRow = 50; // サマリーは少ないので50行で十分
  var pairCount = CURRENCY_PAIRS.length; // 7
  var colsPerPair = 2; // 高値,安値
  var totalCols = 1 + pairCount * colsPerPair + 2; // 期間 + 7x2 + 件数 + 日時
  
  // --- ヘッダー行（1行目） ---
  // 期間列ヘッダー
  sheet.getRange(1, 1).setBackground(DATE_HEADER_BG).setFontWeight('bold');
  
  // 各通貨ペアのヘッダー
  var colorKeys = ['USDJPY', 'EURUSD', 'GBPUSD', 'EURJPY', 'GBPJPY', 'AUDJPY', 'AUDUSD'];
  for (var i = 0; i < pairCount; i++) {
    var startCol = 2 + i * colsPerPair; // B=2, D=4, F=6...
    var headerColor = PAIR_COLORS[colorKeys[i]][0];
    sheet.getRange(1, startCol, 1, colsPerPair)
      .setBackground(headerColor)
      .setFontWeight('bold')
      .setFontColor(HEADER_TEXT_COLOR);
  }
  
  // データ件数・更新日時列ヘッダー
  var extraStart = 2 + pairCount * colsPerPair;
  sheet.getRange(1, extraStart, 1, 2).setBackground(OTHER_HEADER_BG).setFontWeight('bold');
  
  // --- データ行（2行目〜50行目） ---
  // 期間列
  sheet.getRange(2, 1, maxRow - 1, 1).setBackground(DATE_DATA_BG);
  
  // 各通貨ペアのデータ列
  for (var j = 0; j < pairCount; j++) {
    var startColData = 2 + j * colsPerPair;
    var dataColor = PAIR_COLORS[colorKeys[j]][1];
    sheet.getRange(2, startColData, maxRow - 1, colsPerPair).setBackground(dataColor);
  }
  
  // データ件数・更新日時列
  sheet.getRange(2, extraStart, maxRow - 1, 2).setBackground(OTHER_DATA_BG);
  
  console.log('  ✅ レートサマリー: ' + pairCount + 'ペア × ' + colsPerPair + '列 = ' + (pairCount * colsPerPair) + '列に色設定');
}


// ===== レートキャッシュシートの色設定 =====
function applyCacheColors_(sheet) {
  console.log('📦 レートキャッシュシートに色を設定中...');

  var maxRow = 10000; // キャッシュは大量なので多めに確保
  var pairCount = CURRENCY_PAIRS.length; // 7
  // A:取得日時 B〜H:7ペア I:WTI J:BTC K:NATGAS L:取得元 M:ステータス ★v6.5

  var fxColorKeys = ['USDJPY', 'EURUSD', 'GBPUSD', 'EURJPY', 'GBPJPY', 'AUDJPY', 'AUDUSD'];
  var comColorKeys = ['WTI', 'BTC', 'GOLD', 'NATGAS']; // ★v6.5更新: GOLD追加

  // --- ヘッダー行（1行目） ---
  // 取得日時列
  sheet.getRange(1, 1).setBackground(DATE_HEADER_BG).setFontWeight('bold');

  // 為替列（B〜H）
  for (var i = 0; i < pairCount; i++) {
    var col = 2 + i;
    sheet.getRange(1, col)
      .setBackground(PAIR_COLORS[fxColorKeys[i]][0])
      .setFontWeight('bold')
      .setFontColor(HEADER_TEXT_COLOR);
  }

  // 商品列（I〜K）★v6.5追加
  var comStart = 2 + pairCount; // I=9
  for (var ci = 0; ci < comColorKeys.length; ci++) {
    sheet.getRange(1, comStart + ci)
      .setBackground(COMMODITY_COLORS[comColorKeys[ci]][0])
      .setFontWeight('bold')
      .setFontColor(HEADER_TEXT_COLOR);
  }

  // 取得元・ステータス列（L〜M）★v6.5: 9→12列目に移動
  var extraStart = 2 + pairCount + comColorKeys.length; // L=12
  sheet.getRange(1, extraStart, 1, 2).setBackground(OTHER_HEADER_BG).setFontWeight('bold');

  // --- データ行（2行目〜10000行目） ---
  // 取得日時
  sheet.getRange(2, 1, maxRow - 1, 1).setBackground(DATE_DATA_BG);

  // 為替データ（B〜H）
  for (var j = 0; j < pairCount; j++) {
    sheet.getRange(2, 2 + j, maxRow - 1, 1).setBackground(PAIR_COLORS[fxColorKeys[j]][1]);
  }

  // 商品データ（I〜K）★v6.5追加
  for (var cj = 0; cj < comColorKeys.length; cj++) {
    sheet.getRange(2, comStart + cj, maxRow - 1, 1)
      .setBackground(COMMODITY_COLORS[comColorKeys[cj]][1]);
  }

  // 取得元・ステータスデータ（L〜M）
  sheet.getRange(2, extraStart, maxRow - 1, 2).setBackground(OTHER_DATA_BG);

  console.log('  ✅ レートキャッシュ: FX' + pairCount + 'ペア + 商品' + comColorKeys.length + '列に色設定');
  console.log('     列構成: A(日時) B-H(FX7ペア) I-K(WTI/BTC/天然ガス) L-M(取得元/ステータス)');
}