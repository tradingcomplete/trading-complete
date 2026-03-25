/**
 * CompanaFXAutoPost - priceSummary.gs
 * 価格サマリー集計・日次OHLC
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 4）
 * 
 * レートサマリー更新（過去3ヶ月・半年・今年）と
 * 日次OHLC集計を担当。
 * 
 * 外部呼び出し元:
 *   scheduler.gs: aggregateDailyRates / updatePriceSummary（日次トリガー）
 *   main.gs: カスタムメニューから手動実行
 */


// ========================================
// サマリー更新（レートキャッシュ → レートサマリーに書き込み）
// ========================================

// 毎朝1回実行（朝の投稿前、またはスケジューラーから呼び出し）
function updatePriceSummary() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // ===== データソース1: 日次レート（OHLC集約済み、長期データ） =====
  var dailySheet = ss.getSheetByName('日次レート');
  var dailyData = [];
  var numDailyCols = 1 + CURRENCY_PAIRS.length * 4 + 1;
  if (dailySheet && dailySheet.getLastRow() >= 2) {
    dailyData = dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, numDailyCols).getValues();
  }
  
  // ===== データソース2: レートキャッシュ（今日のリアルタイムデータ） =====
  var cacheSheet = ss.getSheetByName('レートキャッシュ');
  var cacheData = [];
  var numCacheCols = 1 + CURRENCY_PAIRS.length + 2;
  if (cacheSheet && cacheSheet.getLastRow() >= 2) {
    cacheData = cacheSheet.getRange(2, 1, cacheSheet.getLastRow() - 1, numCacheCols).getValues();
  }
  
  if (dailyData.length === 0 && cacheData.length === 0) {
    console.log('⚠️ データがありません');
    return;
  }
  
  // 日付計算（文字列ベースで比較 - タイムゾーンずれ防止）
  var now = new Date();
  var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = Utilities.formatDate(yesterday, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  // 今週月曜
  var dayOfWeek = now.getDay(); // 0=日, 1=月, ...
  var weekStartDate = new Date(now);
  weekStartDate.setDate(weekStartDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  var weekStartStr = Utilities.formatDate(weekStartDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var lastWeekStartDate = new Date(weekStartDate); lastWeekStartDate.setDate(lastWeekStartDate.getDate() - 7);
  var lastWeekStartStr = Utilities.formatDate(lastWeekStartDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var twoWeeksAgoDate = new Date(weekStartDate); twoWeeksAgoDate.setDate(twoWeeksAgoDate.getDate() - 14);
  var twoWeeksAgoStr = Utilities.formatDate(twoWeeksAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  // 月初
  var monthStartStr = todayStr.substring(0, 8) + '01';
  var lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var lastMonthStartStr = Utilities.formatDate(lastMonthDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var threeMonthsAgoDate = new Date(now); threeMonthsAgoDate.setMonth(threeMonthsAgoDate.getMonth() - 3);
  var threeMonthsAgoStr = Utilities.formatDate(threeMonthsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var sixMonthsAgoDate = new Date(now); sixMonthsAgoDate.setMonth(sixMonthsAgoDate.getMonth() - 6);
  var sixMonthsAgoStr = Utilities.formatDate(sixMonthsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var yearStartStr = todayStr.substring(0, 5) + '01-01';
  
  var oneYearAgoDate = new Date(now); oneYearAgoDate.setFullYear(oneYearAgoDate.getFullYear() - 1);
  var oneYearAgoStr = Utilities.formatDate(oneYearAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var twoYearsAgoDate = new Date(now); twoYearsAgoDate.setFullYear(twoYearsAgoDate.getFullYear() - 2);
  var twoYearsAgoStr = Utilities.formatDate(twoYearsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var threeYearsAgoDate = new Date(now); threeYearsAgoDate.setFullYear(threeYearsAgoDate.getFullYear() - 3);
  var threeYearsAgoStr = Utilities.formatDate(threeYearsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var fiveYearsAgoDate = new Date(now); fiveYearsAgoDate.setFullYear(fiveYearsAgoDate.getFullYear() - 5);
  var fiveYearsAgoStr = Utilities.formatDate(fiveYearsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  // 期間定義（from以上 to未満 の文字列比較）
  var periods = [
    { label: '昨日', from: yesterdayStr, to: todayStr },
    { label: '今週', from: weekStartStr, to: '9999-12-31' },
    { label: '先週', from: lastWeekStartStr, to: weekStartStr },
    { label: '2週前', from: twoWeeksAgoStr, to: lastWeekStartStr },
    { label: '今月', from: monthStartStr, to: '9999-12-31' },
    { label: '先月', from: lastMonthStartStr, to: monthStartStr },
    { label: '過去3ヶ月', from: threeMonthsAgoStr, to: '9999-12-31' },
    { label: '過去半年', from: sixMonthsAgoStr, to: '9999-12-31' },
    { label: '今年', from: yearStartStr, to: '9999-12-31' },
    { label: '過去1年', from: oneYearAgoStr, to: '9999-12-31' },
    { label: '過去2年', from: twoYearsAgoStr, to: '9999-12-31' },
    { label: '過去3年', from: threeYearsAgoStr, to: '9999-12-31' },
    { label: '過去5年', from: fiveYearsAgoStr, to: '9999-12-31' }
  ];
  
  console.log('日付範囲デバッグ:');
  for (var pd = 0; pd < periods.length; pd++) {
    console.log('  ' + periods[pd].label + ': ' + periods[pd].from + ' 〜 ' + periods[pd].to);
  }
  
  var summaryRows = [];
  var timeStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  
  for (var p = 0; p < periods.length; p++) {
    var period = periods[p];
    
    // 各ペアのhigh/low配列を動的に作成
    var pairHighs = {};
    var pairLows = {};
    for (var pp = 0; pp < CURRENCY_PAIRS.length; pp++) {
      pairHighs[CURRENCY_PAIRS[pp].key] = [];
      pairLows[CURRENCY_PAIRS[pp].key] = [];
    }
    var dataCount = 0;
    
    // --- 日次レートから高値・安値を取得 ---
    for (var i = 0; i < dailyData.length; i++) {
      var rowDate = dailyData[i][0];
      var dateStr;
      if (rowDate instanceof Date) {
        dateStr = Utilities.formatDate(rowDate, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else {
        dateStr = String(rowDate).substring(0, 10);
      }
      
      if (dateStr >= period.from && dateStr < period.to) {
        for (var pp2 = 0; pp2 < CURRENCY_PAIRS.length; pp2++) {
          var colBase = 1 + pp2 * 4; // 高値=colBase+1, 安値=colBase+2
          var high = safeNumber_(dailyData[i][colBase + 1]);
          var low = safeNumber_(dailyData[i][colBase + 2]);
          var pair = CURRENCY_PAIRS[pp2];
          if (high > pair.min && high < pair.max) pairHighs[pair.key].push(high);
          if (low > pair.min && low < pair.max) pairLows[pair.key].push(low);
        }
        dataCount++;
      }
    }
    
    // --- レートキャッシュから今日のリアルタイムデータを補足 ---
    for (var j = 0; j < cacheData.length; j++) {
      var cacheDate = cacheData[j][0];
      var cacheDateStr;
      if (cacheDate instanceof Date) {
        cacheDateStr = Utilities.formatDate(cacheDate, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else {
        cacheDateStr = String(cacheDate).substring(0, 10);
      }
      
      if (cacheDateStr >= period.from && cacheDateStr < period.to) {
        for (var pp3 = 0; pp3 < CURRENCY_PAIRS.length; pp3++) {
          var val = safeNumber_(cacheData[j][1 + pp3]);
          var cpair = CURRENCY_PAIRS[pp3];
          if (val > cpair.min && val < cpair.max) {
            pairHighs[cpair.key].push(val);
            pairLows[cpair.key].push(val);
          }
        }
        dataCount++;
      }
    }
    
    // 行データ構築: [期間, ペア1高値, ペア1安値, ペア2高値, ペア2安値, ..., データ件数, 更新日時]
    var row = [period.label];
    for (var pp4 = 0; pp4 < CURRENCY_PAIRS.length; pp4++) {
      var key = CURRENCY_PAIRS[pp4].key;
      if (pairHighs[key].length >= 1) {
        row.push(Math.max.apply(null, pairHighs[key]));
        row.push(Math.min.apply(null, pairLows[key]));
      } else {
        row.push('', '');
      }
    }
    row.push(dataCount, timeStr);
    
    summaryRows.push(row);
  }
  
  // レートサマリーシートに書き込み
  var summarySheet = ss.getSheetByName('レートサマリー');
  if (!summarySheet) {
    summarySheet = ss.insertSheet('レートサマリー');
    console.log('✅ レートサマリーシートを新規作成');
  }
  
  var headers = ['期間'];
  for (var hh = 0; hh < CURRENCY_PAIRS.length; hh++) {
    headers.push(CURRENCY_PAIRS[hh].symbol + '高値', CURRENCY_PAIRS[hh].symbol + '安値');
  }
  headers.push('データ件数', '更新日時');
  
  summarySheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  
  if (summaryRows.length > 0) {
    summarySheet.getRange(2, 1, summaryRows.length, headers.length).setValues(summaryRows);
  }
  
  console.log('✅ レートサマリー更新完了（' + summaryRows.length + '期間 × ' + CURRENCY_PAIRS.length + 'ペア）');
}

// ===== Gemini API呼び出し =====

// ========================================
// 歴史的レートサマリー 初期データ投入
// ========================================
// 【実行タイミング】最初の1回だけ実行する初期化関数
// 【目的】運用開始時点で「年間高値安値」を
//         レートサマリーに入れておき、投稿の「意識ライン」を充実させる
// ========================================

/**
 * 歴史的高値安値データをレートサマリーシートに書き込む
 * ※最初の1回だけ実行。毎朝のupdatePriceSummary()は行2〜10のみ上書きするので
 *   行11以降のこのデータは保持される。
 */
function initializeHistoricalSummary() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // レートサマリーシートを取得（なければ作成）
  var sheet = ss.getSheetByName('レートサマリー');
  if (!sheet) {
    sheet = ss.insertSheet('レートサマリー');
    var headers = ['期間', 'USD/JPY高値', 'USD/JPY安値', 'EUR/USD高値', 'EUR/USD安値', 'GBP/USD高値', 'GBP/USD安値', 'データ件数', '更新日時'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    console.log('✅ レートサマリーシートを新規作成');
  }
  
  var timeStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  
  // 歴史的データ（年間高値安値）
  var historicalData = [
    ['2025年',      158.87, 139.89,  1.1919, 1.0141,  1.3789, 1.2100, 260, timeStr],
    ['2024年',      161.62, 140.66,  1.1208, 1.0350,  1.3424, 1.2299, 260, timeStr],
    ['2023年',      151.91, 127.22,  1.1275, 1.0449,  1.3143, 1.1803, 260, timeStr],
    ['2022年',      151.95, 113.47,  1.1455, 0.9536,  1.3700, 1.0350, 260, timeStr],
    ['2021年',      116.35, 102.59,  1.2349, 1.1186,  1.4248, 1.3188, 260, timeStr],
    ['5年間レンジ', 161.62, 102.59,  1.2349, 0.9536,  1.4248, 1.0350, 1300, timeStr]
  ];
  
  // 行11から書き込み（行2〜10は毎朝のupdatePriceSummaryが使う）
  var startRow = 11;
  sheet.getRange(startRow, 1, historicalData.length, 9).setValues(historicalData);
  
  // 余分な行をクリア
  var clearStart = startRow + historicalData.length;
  var sheetLastRow = sheet.getLastRow();
  if (sheetLastRow >= clearStart) {
    sheet.getRange(clearStart, 1, sheetLastRow - clearStart + 1, 9).clearContent();
  }
  
  console.log('✅ 歴史的レートサマリー初期化完了（' + historicalData.length + '期間）');
  for (var i = 0; i < historicalData.length; i++) {
    var r = historicalData[i];
    console.log('  ' + r[0] + ': USD/JPY ' + r[1].toFixed(2) + '〜' + r[2].toFixed(2));
  }
  console.log('📌 行11〜' + (startRow + historicalData.length - 1) + 'に書き込みました');
}



function aggregateDailyRates() {
  console.log('=== レートキャッシュ日次集約 ===');
  
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var cacheSheet = ss.getSheetByName('レートキャッシュ');
  
  if (!cacheSheet) {
    console.log('レートキャッシュシートがありません');
    return;
  }
  
  var lastRow = cacheSheet.getLastRow();
  if (lastRow <= 1) {
    console.log('集約対象のデータがありません');
    return;
  }
  
  // 全データ読み込み（ヘッダー除く）
  // 列: 日時, [7ペア], ソース, ステータス = 10列
  var numCols = 1 + CURRENCY_PAIRS.length + 2;
  var data = cacheSheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  console.log('レートキャッシュ: ' + data.length + '行');
  
  var now = new Date();
  var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var cutoffStr = Utilities.formatDate(sevenDaysAgo, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  // ステータス列のインデックス
  var statusCol = 1 + CURRENCY_PAIRS.length + 1; // 0-indexed: 9
  
  // 日付ごとにグループ化
  var dailyData = {};
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var dateTime = row[0];
    if (!dateTime) continue;
    
    var dateStr;
    if (dateTime instanceof Date) {
      dateStr = Utilities.formatDate(dateTime, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else {
      dateStr = String(dateTime).substring(0, 10);
    }
    
    if (dateStr === todayStr) continue;
    if (row[statusCol] !== '成功') continue;
    
    // 各ペアのレートを取得
    var record = { time: dateTime };
    var valid = true;
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var val = parseFloat(row[1 + p]);
      if (isNaN(val)) { valid = false; break; }
      record[CURRENCY_PAIRS[p].key] = val;
    }
    if (!valid) continue;
    
    if (!dailyData[dateStr]) dailyData[dateStr] = [];
    dailyData[dateStr].push(record);
  }
  
  // 日次レートシートを取得（なければ作成）
  var dailySheet = ss.getSheetByName('日次レート');
  if (!dailySheet) {
    dailySheet = ss.insertSheet('日次レート');
    console.log('日次レートシートを新規作成');
  }
  if (dailySheet.getLastRow() < 1) {
    var headers = ['日付'];
    for (var h = 0; h < CURRENCY_PAIRS.length; h++) {
      var sym = CURRENCY_PAIRS[h].symbol;
      headers.push(sym + '始値', sym + '高値', sym + '安値', sym + '終値');
    }
    headers.push('データ件数');
    dailySheet.appendRow(headers);
  }
  
  // 既に集約済みの日付を取得
  var existingDates = {};
  var dailyLastRow = dailySheet.getLastRow();
  if (dailyLastRow > 1) {
    var existingData = dailySheet.getRange(2, 1, dailyLastRow - 1, 1).getValues();
    for (var j = 0; j < existingData.length; j++) {
      var d = existingData[j][0];
      if (d instanceof Date) {
        existingDates[Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd')] = true;
      } else if (d) {
        existingDates[String(d).substring(0, 10)] = true;
      }
    }
  }
  
  // OHLC算出して書き込み
  var dates = Object.keys(dailyData).sort();
  var aggregated = 0;
  
  for (var k = 0; k < dates.length; k++) {
    var date = dates[k];
    if (existingDates[date]) continue;
    
    var records = dailyData[date];
    records.sort(function(a, b) { return new Date(a.time) - new Date(b.time); });
    
    var row = [date];
    for (var p2 = 0; p2 < CURRENCY_PAIRS.length; p2++) {
      var ohlc = calcOHLC_(records, CURRENCY_PAIRS[p2].key);
      row.push(ohlc.open, ohlc.high, ohlc.low, ohlc.close);
    }
    row.push(records.length);
    
    dailySheet.appendRow(row);
    // ★v5.9.1: 書き込み後に数値フォーマットを強制（SheetsのDate自動変換防止）
    var newRow = dailySheet.getLastRow();
    var dataCols = 1 + CURRENCY_PAIRS.length * 4; // B列からOHLC全列
    dailySheet.getRange(newRow, 2, 1, dataCols).setNumberFormat('0.00000');
    console.log('  集約: ' + date + '（' + records.length + '件）');
    aggregated++;
  }
  
  // 7日より古いデータを削除
  var deletedRows = 0;
  for (var m = data.length - 1; m >= 0; m--) {
    var rowDate = data[m][0];
    var rowDateStr;
    if (rowDate instanceof Date) {
      rowDateStr = Utilities.formatDate(rowDate, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else if (rowDate) {
      rowDateStr = String(rowDate).substring(0, 10);
    } else {
      continue;
    }
    if (rowDateStr < cutoffStr) {
      cacheSheet.deleteRow(m + 2);
      deletedRows++;
    }
  }
  
  console.log('');
  console.log('集約完了: ' + aggregated + '日分');
  console.log('キャッシュ削除: ' + deletedRows + '行（7日超の古いデータ）');
}

/**
 * Twelve Data APIから過去5年分の日次OHLCを取得して日次レートに書き込む
 * 3通貨ペア × 1回ずつ = 3 APIクレジット消費
 */

/**
 * Twelve Data APIから過去5年分の日次OHLCを取得して日次レートに書き込む
 * 3通貨ペア × 1回ずつ = 3 APIクレジット消費
 */
function rebuildDailyRates() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    '日次レート再構築（Twelve Data API）',
    '日次レートを全削除し、Twelve Data APIから過去5年分の正確なOHLCデータを取得します。\n' +
    CURRENCY_PAIRS.length + ' APIクレジットを消費します。続行しますか？',
    ui.ButtonSet.YES_NO
  );
  
  if (confirm !== ui.Button.YES) {
    ui.alert('キャンセルしました');
    return;
  }
  
  var keys = getApiKeys();
  var tdApiKey = keys.TWELVE_DATA_API_KEY;
  
  if (!tdApiKey) {
    ui.alert('❌ TWELVE_DATA_API_KEYが未設定です');
    return;
  }
  
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // 日次レートシートを取得（なければ作成）
  var dailySheet = ss.getSheetByName('日次レート');
  if (!dailySheet) {
    dailySheet = ss.insertSheet('日次レート');
  }
  
  // 既存データを削除
  if (dailySheet.getLastRow() > 1) {
    dailySheet.deleteRows(2, dailySheet.getLastRow() - 1);
    SpreadsheetApp.flush();
    console.log('日次レート: 既存データを削除');
  }
  
  // ヘッダーがなければ追加
  if (dailySheet.getLastRow() < 1) {
    var headers = ['日付'];
    for (var h = 0; h < CURRENCY_PAIRS.length; h++) {
      var sym = CURRENCY_PAIRS[h].symbol;
      headers.push(sym + '始値', sym + '高値', sym + '安値', sym + '終値');
    }
    headers.push('データ件数');
    dailySheet.appendRow(headers);
  }
  
  // 5年前の日付
  var now = new Date();
  var fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  var startDate = Utilities.formatDate(fiveYearsAgo, 'Asia/Tokyo', 'yyyy-MM-dd');
  var endDate = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  console.log('取得期間: ' + startDate + ' 〜 ' + endDate);
  
  // 全通貨ペアの日次OHLCを取得
  var allData = {};
  
  for (var s = 0; s < CURRENCY_PAIRS.length; s++) {
    var pair = CURRENCY_PAIRS[s];
    var url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(pair.symbol) +
      '&interval=1day&start_date=' + startDate + '&end_date=' + endDate +
      '&outputsize=5000&timezone=Asia/Tokyo&apikey=' + tdApiKey;
    
    console.log('📡 取得中: ' + pair.symbol + '...');
    
    try {
      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      
      if (response.getResponseCode() !== 200) {
        ui.alert('❌ ' + pair.symbol + ' の取得に失敗しました（HTTP ' + response.getResponseCode() + '）');
        return;
      }
      
      var data = JSON.parse(response.getContentText());
      
      if (data.code) {
        ui.alert('❌ APIエラー: ' + (data.message || data.code));
        return;
      }
      
      if (!data.values || data.values.length === 0) {
        ui.alert('❌ ' + pair.symbol + ' のデータが空です');
        return;
      }
      
      console.log('  ' + pair.symbol + ': ' + data.values.length + '日分取得');
      
      for (var i = 0; i < data.values.length; i++) {
        var v = data.values[i];
        var date = v.datetime;
        if (!allData[date]) allData[date] = {};
        allData[date][pair.key] = {
          open: parseFloat(v.open), high: parseFloat(v.high),
          low: parseFloat(v.low), close: parseFloat(v.close)
        };
      }
      
    } catch (e) {
      ui.alert('❌ ' + pair.symbol + ' の取得エラー: ' + e.message);
      return;
    }
    
    // API制限対策（8回/分）
    if (s < CURRENCY_PAIRS.length - 1) Utilities.sleep(1000);
  }
  
  // 日付順にソートして書き込み
  var dates = Object.keys(allData).sort();
  var rows = [];
  var numCols = 1 + CURRENCY_PAIRS.length * 4 + 1;
  
  for (var d = 0; d < dates.length; d++) {
    var date = dates[d];
    var day = allData[date];
    
    var row = [date];
    var complete = true;
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var ohlc = day[CURRENCY_PAIRS[p].key];
      if (!ohlc) { complete = false; break; }
      row.push(ohlc.open, ohlc.high, ohlc.low, ohlc.close);
    }
    if (!complete) continue;
    row.push(1);
    rows.push(row);
  }
  
  if (rows.length > 0) {
    dailySheet.getRange(2, 1, rows.length, numCols).setValues(rows);
    console.log('✅ ' + rows.length + '日分を書き込み完了');
  }
  
  updatePriceSummary();
  
  ui.alert('✅ 再構築完了\n\n' + rows.length + '日分の正確なOHLCデータを取得しました。\n' +
    '（期間: ' + dates[0] + ' 〜 ' + dates[dates.length - 1] + '）');
}

/**
 * データ配列からOHLC（始値/高値/安値/終値）を算出
 * ★外れ値除去: 中央値から大きく乖離したデータを除外してから計算
 * @param {Array} records - 時刻順にソートされたレコード
 * @param {string} field - 'usdjpy' / 'eurusd' / 'gbpusd'
 * @returns {Object} {open, high, low, close}
 */

/**
 * データ配列からOHLC（始値/高値/安値/終値）を算出
 * ★外れ値除去: 中央値から大きく乖離したデータを除外してから計算
 * @param {Array} records - 時刻順にソートされたレコード
 * @param {string} field - 'usdjpy' / 'eurusd' / 'gbpusd'
 * @returns {Object} {open, high, low, close}
 */
function calcOHLC_(records, field) {
  var values = [];
  for (var i = 0; i < records.length; i++) {
    values.push(records[i][field]);
  }
  
  // IQR（四分位範囲）方式で外れ値除去（5件以上ある場合）
  if (values.length >= 5) {
    var sorted = values.slice().sort(function(a, b) { return a - b; });
    var q1 = sorted[Math.floor(sorted.length * 0.25)];
    var q3 = sorted[Math.floor(sorted.length * 0.75)];
    var iqr = q3 - q1;
    
    // IQRが極端に小さい場合（全部ほぼ同じ値）は最低幅を設定
    var minIqr = (field === 'usdjpy') ? 0.3 : 0.003;
    if (iqr < minIqr) iqr = minIqr;
    
    var lowerBound = q1 - 1.5 * iqr;
    var upperBound = q3 + 1.5 * iqr;
    
    console.log('  ' + field + ' Q1=' + q1 + ' Q3=' + q3 + 
      ' IQR=' + iqr.toFixed(4) + ' 範囲=[' + lowerBound.toFixed(4) + ', ' + upperBound.toFixed(4) + ']');
    
    // 時系列順序を維持してフィルタ
    var filteredValues = [];
    for (var j = 0; j < records.length; j++) {
      var val = records[j][field];
      if (val >= lowerBound && val <= upperBound) {
        filteredValues.push(val);
      } else {
        console.log('    外れ値除外: ' + val);
      }
    }
    
    // フィルタ後に2件以上残った場合のみ採用
    if (filteredValues.length >= 2) {
      return {
        open: filteredValues[0],
        high: Math.max.apply(null, filteredValues),
        low: Math.min.apply(null, filteredValues),
        close: filteredValues[filteredValues.length - 1]
      };
    }
  }
  
  // フィルタできない場合はそのまま
  return {
    open: values[0],
    high: Math.max.apply(null, values),
    low: Math.min.apply(null, values),
    close: values[values.length - 1]
  };
}

// ========================================
// 経済カレンダー シート作成 & 自動取得
// ========================================

/**
 * 「経済カレンダー」シートを作成する（初回のみ実行）
 * GASエディタから手動実行: setupEconomicCalendarSheet
 */

