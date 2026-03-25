/**
 * CompanaFXAutoPost - rateManager.gs
 * レート取得・保存・検証
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 4）
 * 
 * 為替レート（Twelve Data API）・コモディティ価格（Alpha Vantage）の
 * 取得・キャッシュ・シート保存・クロス検証を担当。
 * 
 * 外部呼び出し元:
 *   scheduler.gs: scheduledFetchRates（1時間トリガー）
 *   main.gs: testFetchRates（カスタムメニュー）
 */

// ========================================
// レート取得（2段階方式 - Step1）
// ========================================

// Twelve Data API でリアルタイムレート取得
// - 無料プラン: 800回/日、8回/分
// - 全通貨ペアを1回のAPI呼び出しで取得（シンボル数分のクレジット消費）
function fetchLatestRates_(apiKey) {
  var keys = getApiKeys();
  var tdApiKey = keys.TWELVE_DATA_API_KEY;
  
  if (!tdApiKey) {
    console.log('❌ TWELVE_DATA_API_KEYが未設定です');
    return null;
  }
  
  var symbols = CURRENCY_PAIRS.map(function(p) { return p.symbol; }).join(',');
  var url = 'https://api.twelvedata.com/price?symbol=' + encodeURIComponent(symbols) + '&apikey=' + tdApiKey;
  
  try {
    console.log('📡 Twelve Data API呼び出し（' + CURRENCY_PAIRS.length + 'ペア）...');
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });
    
    var code = response.getResponseCode();
    if (code !== 200) {
      console.log('❌ HTTP ' + code + ': ' + response.getContentText().substring(0, 200));
      return null;
    }
    
    var data = JSON.parse(response.getContentText());
    
    if (data.code) {
      console.log('❌ APIエラー: ' + (data.message || data.code));
      return null;
    }
    
    var rates = { source: 'TwelveData', fetchedAt: new Date() };
    var logParts = [];
    
    for (var i = 0; i < CURRENCY_PAIRS.length; i++) {
      var pair = CURRENCY_PAIRS[i];
      var priceData = data[pair.symbol];
      
      if (!priceData || !priceData.price) {
        console.log('❌ ' + pair.symbol + ' のデータが取得できません');
        return null;
      }
      
      var val = parseFloat(priceData.price);
      
      if (!val || val < pair.min || val > pair.max) {
        console.log('❌ ' + pair.symbol + ' が異常値: ' + val);
        return null;
      }
      
      rates[pair.key] = val;
      logParts.push(pair.symbol + '=' + val);
    }
    
    console.log('📊 ' + logParts.join(' '));
    return rates;
  } catch (e) {
    console.log('❌ レートAPI呼び出しエラー: ' + e.message);
    return null;
  }
}

// ========================================
// 商品価格取得（★v6.5追加: WTI・BTC・天然ガス）
// ========================================

/**
 * Twelve Data APIで商品価格を取得（WTI・BTC・天然ガス）
 * @return {Object|null} {wti, btc, natgas, fetchedAt} または null
 */
/**
 * Twelve Data APIでBTC・ゴールドを取得（★v6.5更新: BTC+GOLD対応）
 * WTI・天然ガスは fetchDailyCommodityPrices_() で別途取得
 * @return {Object|null} {btc, gold} または null
 */

// ========================================
// 商品価格取得（★v6.5追加: WTI・BTC・天然ガス）
// ========================================

/**
 * Twelve Data APIで商品価格を取得（WTI・BTC・天然ガス）
 * @return {Object|null} {wti, btc, natgas, fetchedAt} または null
 */
/**
 * Twelve Data APIでBTC・ゴールドを取得（★v6.5更新: BTC+GOLD対応）
 * WTI・天然ガスは fetchDailyCommodityPrices_() で別途取得
 * @return {Object|null} {btc, gold} または null
 */
function fetchCommodityPrices_() {
  try {
    var cache = CacheService.getScriptCache();
    var keys = getApiKeys();
    var tdApiKey = keys.TWELVE_DATA_API_KEY;
    if (!tdApiKey) {
      console.log('❌ TWELVE_DATA_API_KEY未設定（BTC/GOLD取得スキップ）');
      return null;
    }

    // 30分キャッシュ確認
    var cachedBtc  = cache.get('btc_price');
    var cachedGold = cache.get('gold_price');
    if (cachedBtc && cachedGold) {
      var btcVal  = parseFloat(cachedBtc);
      var goldVal = parseFloat(cachedGold);
      console.log('📦 BTC（キャッシュ）: ' + btcVal + '  ゴールド（キャッシュ）: ' + goldVal);
      return { btc: btcVal, gold: goldVal };
    }

    // BTC・XAUを一括取得（2クレジット）
    var url = 'https://api.twelvedata.com/price?symbol=BTC%2FUSD%2CXAU%2FUSD&apikey=' + tdApiKey;
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });

    if (response.getResponseCode() !== 200) {
      console.log('❌ BTC/GOLD API HTTP ' + response.getResponseCode());
      return null;
    }

    var data = JSON.parse(response.getContentText());
    if (data.code) {
      console.log('❌ BTC/GOLD APIエラー: ' + (data.message || data.code));
      return null;
    }

    var result = {};

    // BTC
    var btcData = data['BTC/USD'];
    if (btcData && btcData.price) {
      var btcVal = parseFloat(btcData.price);
      if (btcVal > 10000 && btcVal < 200000) {
        result.btc = btcVal;
        cache.put('btc_price', btcVal.toString(), 30 * 60);
        console.log('📊 BTC: ' + btcVal);
      } else {
        console.log('⚠️ BTC異常値: ' + btcVal);
      }
    }

    // ゴールド
    var goldData = data['XAU/USD'];
    if (goldData && goldData.price) {
      var goldVal = parseFloat(goldData.price);
      if (goldVal > 1500 && goldVal < 8000) {
        result.gold = goldVal;
        cache.put('gold_price', goldVal.toString(), 30 * 60);
        console.log('📊 ゴールド: ' + goldVal);
      } else {
        console.log('⚠️ ゴールド異常値: ' + goldVal);
      }
    }

    return Object.keys(result).length > 0 ? result : null;

  } catch (e) {
    console.log('⚠️ BTC/GOLD取得エラー（続行）: ' + e.message);
    return null;
  }
}

/**
 * Alpha Vantage APIでWTI・天然ガスを日次取得（★v6.5追加）
 * 23時間キャッシュで1日1回のみAPIを叩く（無料枠: 25リクエスト/日）
 * @return {Object|null} {wti, natgas} または null
 */

/**
 * Alpha Vantage APIでWTI・天然ガスを日次取得（★v6.5追加）
 * 23時間キャッシュで1日1回のみAPIを叩く（無料枠: 25リクエスト/日）
 * @return {Object|null} {wti, natgas} または null
 */
function fetchDailyCommodityPrices_() {
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
    var cache = CacheService.getScriptCache();
    var cacheKey = 'daily_commodities_' + today;

    // キャッシュ確認（当日中は再取得しない）
    var cached = cache.get(cacheKey);
    if (cached) {
      var parsed = JSON.parse(cached);
      console.log('📦 商品（キャッシュ）: WTI=' + parsed.wti + ' 天然ガス=' + parsed.natgas);
      return parsed;
    }

    var keys = getApiKeys();
    var avApiKey = keys.ALPHA_VANTAGE_API_KEY;
    if (!avApiKey) {
      console.log('❌ ALPHA_VANTAGE_API_KEY未設定（WTI・天然ガス取得スキップ）');
      return null;
    }

    var result = { wti: null, natgas: null };

    for (var i = 0; i < DAILY_COMMODITY_ASSETS.length; i++) {
      var t = DAILY_COMMODITY_ASSETS[i];
      // ゴールドなどavOverrideが指定されている場合は専用URL、それ以外はstandardエンドポイント
      var url = t.avOverride
        ? t.avOverride + avApiKey
        : 'https://www.alphavantage.co/query?function=' + t.avFunction + '&interval=daily&apikey=' + avApiKey;
      try {
        var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var data = JSON.parse(response.getContentText());

        var val = null;
        if (t.avOverride) {
          // COMMODITY_EXCHANGE_RATE レスポンス形式
          if (data['Realtime Currency Exchange Rate'] && data['Realtime Currency Exchange Rate']['5. Exchange Rate']) {
            val = parseFloat(data['Realtime Currency Exchange Rate']['5. Exchange Rate']);
          }
        } else if (data.data && data.data.length > 0) {
          val = parseFloat(data.data[0].value);
        }

        if (val !== null && val > t.min && val < t.max) {
          result[t.key] = val;
          console.log('📊 ' + t.label + ': ' + val + ' ドル');
        } else if (data.Information) {
          console.log('⚠️ Alpha Vantage上限: ' + data.Information.substring(0, 80));
        } else if (val !== null) {
          console.log('⚠️ ' + t.label + ' 異常値: ' + val + '（期待値: ' + t.min + '〜' + t.max + '）');
        } else {
          console.log('⚠️ ' + t.label + ' データなし');
        }
      } catch (e2) {
        console.log('⚠️ ' + t.label + ' 取得エラー: ' + e2.message);
      }
      Utilities.sleep(13000); // 13秒待機（Alpha Vantage: 5リクエスト/分の制限対策）
    }

    // 23時間キャッシュ（翌日まで保持）
    cache.put(cacheKey, JSON.stringify(result), 23 * 60 * 60);
    return result;

  } catch (e) {
    console.log('⚠️ 日次商品データ取得エラー（続行）: ' + e.message);
    return null;
  }
}

// ========================================
// 商品列セットアップ（★v6.5追加: 既存シートへの1回限り実行）
// ========================================

/**
 * 既存の「レートキャッシュ」シートにWTI・BTC・天然ガスのヘッダー列を追加する
 * ★ GASエディタから手動で1回だけ実行する
 * ★ 既存データは一切変更しない。ヘッダー行の列追加のみ。
 * ★ 実行後は testFetchRates() でデータが入ることを確認すること
 */

// ========================================
// 商品列セットアップ（★v6.5追加: 既存シートへの1回限り実行）
// ========================================

/**
 * 既存の「レートキャッシュ」シートにWTI・BTC・天然ガスのヘッダー列を追加する
 * ★ GASエディタから手動で1回だけ実行する
 * ★ 既存データは一切変更しない。ヘッダー行の列追加のみ。
 * ★ 実行後は testFetchRates() でデータが入ることを確認すること
 */
function setupCommodityColumns() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('レートキャッシュ');

    if (!sheet) {
      console.log('❌ 「レートキャッシュ」シートが見つかりません');
      console.log('→ 先に testFetchRates() を実行してシートを作成してください');
      return;
    }

    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    // 既にWTI/USDが存在するかチェック
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === 'WTI/USD') {
        console.log('⚠️ 「WTI/USD」列は既に存在します。スキップします。');
        console.log('→ 現在の列構成: ' + headers.join(', '));
        return;
      }
    }

    // 「取得元」列の位置を探す
    var sourceColIndex = -1;
    for (var j = 0; j < headers.length; j++) {
      if (headers[j] === '取得元') {
        sourceColIndex = j + 1; // 1始まりの列番号
        break;
      }
    }

    if (sourceColIndex === -1) {
      console.log('❌ 「取得元」列が見つかりません');
      console.log('→ 現在の列構成: ' + headers.join(', '));
      return;
    }

    // 商品列3本を「取得元」列の直前に挿入
    sheet.insertColumnsBefore(sourceColIndex, COMMODITY_ASSETS.length);

    // ヘッダーテキストと書式設定（COMMODITY_COLORSを使用）
    var comColorKeys = ['WTI', 'BTC', 'NATGAS'];
    for (var k = 0; k < COMMODITY_ASSETS.length; k++) {
      var col = sourceColIndex + k;
      var cell = sheet.getRange(1, col);
      cell.setValue(COMMODITY_ASSETS[k].symbol);
      cell.setBackground(COMMODITY_COLORS[comColorKeys[k]][0]);
      cell.setFontColor(HEADER_TEXT_COLOR);
      cell.setFontWeight('bold');
      cell.setHorizontalAlignment('center');
      sheet.setColumnWidth(col, 110);
    }

    console.log('✅ 商品列ヘッダーを追加しました');
    console.log('→ WTI/USD: ' + sourceColIndex + '列目');
    console.log('→ BTC/USD: ' + (sourceColIndex + 1) + '列目');
    console.log('→ NATGAS/USD: ' + (sourceColIndex + 2) + '列目');
    console.log('→ 取得元・ステータスは ' + (sourceColIndex + 3) + '列目以降に移動');
    console.log('→ 次に applyPairColors() を実行して色を全列に適用してください');
    console.log('→ その後 testFetchRates() でデータが入ることを確認してください');

  } catch (e) {
    console.log('❌ setupCommodityColumns エラー: ' + e.message);
  }
}

// ========================================
// レート保存（2段階方式 - Step2）
// ========================================

// ========================================
// 安全な数値変換ヘルパー ★v5.9.1追加
// Google Sheetsが数値(182等)をDate型に自動フォーマットする問題の対策
// ========================================

/**
 * 値を安全に数値に変換する。Date型の場合はSheetsシリアル値に復元。
 * Google SheetsはEUR/JPY安値(182-184)を日付シリアル値と誤認しDate型に変換する。
 * Number(Date)はエポックミリ秒(-2兆等)を返すため、シリアル値に戻す必要がある。
 * @param {*} val - 値（数値、Date、文字列等）
 * @returns {number} 数値
 */

// ========================================
// レート保存（2段階方式 - Step2）
// ========================================

// ========================================
// 安全な数値変換ヘルパー ★v5.9.1追加
// Google Sheetsが数値(182等)をDate型に自動フォーマットする問題の対策
// ========================================

/**
 * 値を安全に数値に変換する。Date型の場合はSheetsシリアル値に復元。
 * Google SheetsはEUR/JPY安値(182-184)を日付シリアル値と誤認しDate型に変換する。
 * Number(Date)はエポックミリ秒(-2兆等)を返すため、シリアル値に戻す必要がある。
 * @param {*} val - 値（数値、Date、文字列等）
 * @returns {number} 数値
 */
function safeNumber_(val) {
  if (val instanceof Date) {
    // Google Sheetsのシリアル値基準日: 1899年12月30日
    var baseDate = new Date(Date.UTC(1899, 11, 30, 0, 0, 0));
    var serial = (val.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000);
    return serial;
  }
  return Number(val);
}

// ========================================
// レートキャッシュからフォールバック取得 ★v5.9.1追加
// Twelve Data API失敗時に、レートキャッシュの最新行からratesオブジェクトを生成
// ========================================

/**
 * レートキャッシュの最新行からratesオブジェクトを生成（APIフォールバック用）
 * @param {string} spreadsheetId - スプレッドシートID
 * @returns {Object|null} ratesオブジェクト（fetchLatestRates_と同じ形式）
 */

// ========================================
// レートキャッシュからフォールバック取得 ★v5.9.1追加
// Twelve Data API失敗時に、レートキャッシュの最新行からratesオブジェクトを生成
// ========================================

/**
 * レートキャッシュの最新行からratesオブジェクトを生成（APIフォールバック用）
 * @param {string} spreadsheetId - スプレッドシートID
 * @returns {Object|null} ratesオブジェクト（fetchLatestRates_と同じ形式）
 */
function getLatestRatesFromCache_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    if (!sheet || sheet.getLastRow() < 2) return null;
    
    var lastRow = sheet.getLastRow();
    var numCols = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
    var latest = sheet.getRange(lastRow, 1, 1, numCols).getValues()[0];
    
    // キャッシュが古すぎないかチェック（6時間以内のみ有効）
    var timestamp = new Date(latest[0]);
    var now = new Date();
    var ageHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
    if (ageHours > 6) {
      console.log('⚠️ キャッシュが' + ageHours.toFixed(1) + '時間前のため無効');
      return null;
    }
    
    var rates = {
      source: 'レートキャッシュ（フォールバック）',
      fetchedAt: timestamp
    };
    
    // ヘッダーからCURRENCY_PAIRSのkeyにマッピング
    for (var i = 0; i < CURRENCY_PAIRS.length; i++) {
      var pair = CURRENCY_PAIRS[i];
      for (var j = 1; j < headers.length; j++) {
        if (headers[j] === pair.symbol) {
          var val = Number(latest[j]);
          if (val && val >= pair.min && val <= pair.max) {
            rates[pair.key] = val;
          }
          break;
        }
      }
    }
    
    // 全ペアが取得できたか確認
    for (var k = 0; k < CURRENCY_PAIRS.length; k++) {
      if (!rates[CURRENCY_PAIRS[k].key]) {
        console.log('⚠️ キャッシュに' + CURRENCY_PAIRS[k].symbol + 'がありません');
        return null;
      }
    }
    
    var dateStr = Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    console.log('📊 キャッシュフォールバック: ' + dateStr + '時点のデータを使用');
    return rates;
    
  } catch (e) {
    console.log('❌ キャッシュフォールバック失敗: ' + e.message);
    return null;
  }
}

/**
 * レートキャッシュの最新レートをプロンプト用テキストに整形 ★v5.9.1追加
 * buildPrompt_から呼ばれ、Geminiが「今の正確なレート」を把握するために使用
 * @param {string} spreadsheetId - スプレッドシートID
 * @returns {string} プロンプト注入用テキスト（空文字の場合もある）
 */

/**
 * レートキャッシュの最新レートをプロンプト用テキストに整形 ★v5.9.1追加
 * buildPrompt_から呼ばれ、Geminiが「今の正確なレート」を把握するために使用
 * @param {string} spreadsheetId - スプレッドシートID
 * @returns {string} プロンプト注入用テキスト（空文字の場合もある）
 */
function getLatestRateText_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    if (!sheet || sheet.getLastRow() < 2) return '';
    
    var lastRow = sheet.getLastRow();
    var numCols = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
    var latest = sheet.getRange(lastRow, 1, 1, numCols).getValues()[0];
    
    var timestamp = new Date(latest[0]);
    var dateStr = Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    
    var lines = ['【直近の実勢レート（' + dateStr + '時点・レートキャッシュ）】'];
    lines.push('※ 投稿で具体的レートに言及する場合は必ずこの数値を基準にせよ。勝手に丸めるな。');
    
    for (var i = 1; i < headers.length; i++) {
      var pairName = headers[i];
      var rate = latest[i];
      
      if (pairName && typeof rate === 'number' && rate > 0) {
        if (pairName === '取得元' || pairName === 'ステータス') continue;
        var decimals = (pairName.indexOf('JPY') !== -1) ? 3 : 5;
        lines.push(pairName + ': ' + rate.toFixed(decimals));
      }
    }
    
    return lines.join('\n');
    
  } catch (e) {
    console.log('⚠️ getLatestRateText_ エラー: ' + e.message);
    return '';
  }
}


// スプレッドシートの「レートキャッシュ」シートに保存


// スプレッドシートの「レートキャッシュ」シートに保存
function saveRatesToSheet_(rates, spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    
    // シートがなければ作成
    if (!sheet) {
      sheet = ss.insertSheet('レートキャッシュ');
      console.log('✅ レートキャッシュシートを新規作成');
    }
    
    // ヘッダーがなければ追加（★v6.5: 商品列 + 色定義を追加）
    if (sheet.getLastRow() < 1) {
      var headers = ['取得日時'];
      for (var h = 0; h < CURRENCY_PAIRS.length; h++) {
        headers.push(CURRENCY_PAIRS[h].symbol);
      }
      for (var ch = 0; ch < COMMODITY_ASSETS.length; ch++) {
        headers.push(COMMODITY_ASSETS[ch].symbol);
      }
      headers.push('取得元', 'ステータス');
      sheet.appendRow(headers);

      // 取得日時列
      sheet.getRange(1, 1).setBackground(DATE_HEADER_BG).setFontWeight('bold');

      // 為替列（B〜H）: PAIR_COLORSを使用
      var fxColorKeys = ['USDJPY', 'EURUSD', 'GBPUSD', 'EURJPY', 'GBPJPY', 'AUDJPY', 'AUDUSD'];
      for (var fw = 0; fw < CURRENCY_PAIRS.length; fw++) {
        var fxCell = sheet.getRange(1, 2 + fw);
        fxCell.setBackground(PAIR_COLORS[fxColorKeys[fw]][0]);
        fxCell.setFontColor(HEADER_TEXT_COLOR);
        fxCell.setFontWeight('bold');
        fxCell.setHorizontalAlignment('center');
        sheet.setColumnWidth(2 + fw, 100);
      }

      // 商品列（I〜K）: COMMODITY_COLORSを使用
      var comStartCol = 2 + CURRENCY_PAIRS.length;
      var comColorKeysNew = ['WTI', 'BTC', 'NATGAS'];
      for (var cw = 0; cw < COMMODITY_ASSETS.length; cw++) {
        var comCell = sheet.getRange(1, comStartCol + cw);
        comCell.setBackground(COMMODITY_COLORS[comColorKeysNew[cw]][0]);
        comCell.setFontColor(HEADER_TEXT_COLOR);
        comCell.setFontWeight('bold');
        comCell.setHorizontalAlignment('center');
        sheet.setColumnWidth(comStartCol + cw, 110);
      }

      // 取得元・ステータス列
      var metaStart = comStartCol + COMMODITY_ASSETS.length;
      sheet.getRange(1, metaStart, 1, 2).setBackground(OTHER_HEADER_BG).setFontWeight('bold');
      sheet.setColumnWidth(metaStart, 150);
      sheet.setColumnWidth(metaStart + 1, 80);

      // 取得日時列の幅
      sheet.setColumnWidth(1, 150);

      // 1行目固定
      sheet.setFrozenRows(1);

      console.log('✅ ヘッダーを追加（色付き）');
    }

    // ★v6.5更新: WTI・天然ガス（Alpha Vantage・日次キャッシュ）を先に取得
    // ※ キャッシュヒット時はAPI不使用のため62秒待機の前でOK
    var dailyCommodities = fetchDailyCommodityPrices_();

    // BTC（Twelve Data）は為替取得から62秒ずらして取得（分間クレジット制限対策）
    Utilities.sleep(62000);
    var btcData = fetchCommodityPrices_();

    // 全商品データを統合（BTC/GOLD=Twelve Data、WTI/天然ガス=Alpha Vantage）
    var commodities = {
      wti:    dailyCommodities ? dailyCommodities.wti    : null,
      btc:    btcData          ? btcData.btc             : null,
      gold:   btcData          ? btcData.gold            : null,
      natgas: dailyCommodities ? dailyCommodities.natgas : null
    };

    // レートを追記
    var timeStr = Utilities.formatDate(rates.fetchedAt, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    var row = [timeStr];
    for (var r = 0; r < CURRENCY_PAIRS.length; r++) {
      row.push(rates[CURRENCY_PAIRS[r].key]);
    }
    // ★v6.5更新: 商品データをシート列順（WTI/BTC/GOLD/NATGAS）に追加
    var comOrder = ['wti', 'btc', 'gold', 'natgas'];
    for (var cr = 0; cr < comOrder.length; cr++) {
      var cv = commodities ? commodities[comOrder[cr]] : null;
      row.push(cv !== null && cv !== undefined ? cv : '');
    }
    row.push(rates.source, '成功');
    sheet.appendRow(row);
    
    console.log('✅ レートをシートに保存: ' + timeStr);
  } catch (e) {
    console.log('⚠️ レート保存エラー（投稿生成は続行）: ' + e.message);
  }
}

// ========================================
// 価格分析（レートサマリーシートから読むだけ - 軽量）
// ========================================

// ========================================
// レート乖離チェック（キャッシュの直近データと比較）
// ========================================

/**
 * 取得したレートをキャッシュの直近データと比較し、異常値を検出する
 * @param {Object} rates - 取得したレート {usdjpy, eurusd, gbpusd}
 * @param {string} spreadsheetId - スプレッドシートID
 * @return {boolean} true=正常, false=乖離あり
 */

// ========================================
// 価格分析（レートサマリーシートから読むだけ - 軽量）
// ========================================

// ========================================
// レート乖離チェック（キャッシュの直近データと比較）
// ========================================

/**
 * 取得したレートをキャッシュの直近データと比較し、異常値を検出する
 * @param {Object} rates - 取得したレート {usdjpy, eurusd, gbpusd}
 * @param {string} spreadsheetId - スプレッドシートID
 * @return {boolean} true=正常, false=乖離あり
 */
function crossValidateRate_(rates, spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    if (!sheet || sheet.getLastRow() < 2) {
      console.log('📌 キャッシュなし → 乖離チェックスキップ');
      return true;
    }
    
    // 直近20件を取得
    var lastRow = sheet.getLastRow();
    var startRow = Math.max(2, lastRow - 19);
    var numRows = lastRow - startRow + 1;
    var data = sheet.getRange(startRow, 1, numRows, 4).getValues();
    
    // 24時間以内のデータのみ抽出
    var now = new Date();
    var cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    var recentU = [];
    var recentE = [];
    var recentG = [];
    
    for (var i = 0; i < data.length; i++) {
      var rowDate = new Date(data[i][0]);
      if (rowDate >= cutoff) {
        var u = Number(data[i][1]);
        var e = Number(data[i][2]);
        var g = Number(data[i][3]);
        if (u > 100 && u < 200) recentU.push(u);
        if (e > 0.9 && e < 1.3)  recentE.push(e);
        if (g > 1.1 && g < 1.5)  recentG.push(g);
      }
    }
    
    // データが3件未満 → 信頼性不足のためスキップ
    if (recentU.length < 3) {
      console.log('📌 キャッシュ' + recentU.length + '件 → 乖離チェックスキップ');
      return true;
    }
    
    // 中央値を計算
    var medianU = getMedian_(recentU);
    var medianE = recentE.length >= 3 ? getMedian_(recentE) : null;
    var medianG = recentG.length >= 3 ? getMedian_(recentG) : null;
    
    // 乖離チェック（閾値: USDJPY±2.0円, EURUSD/GBPUSD±0.02）
    var devU = Math.abs(rates.usdjpy - medianU);
    if (devU > 2.0) {
      console.log('❌ USD/JPY乖離: 取得=' + rates.usdjpy + ' 中央値=' + medianU.toFixed(2) + ' 差=' + devU.toFixed(2) + '円');
      return false;
    }
    if (medianE && Math.abs(rates.eurusd - medianE) > 0.02) {
      console.log('❌ EUR/USD乖離: 取得=' + rates.eurusd + ' 中央値=' + medianE.toFixed(4) + ' 差=' + Math.abs(rates.eurusd - medianE).toFixed(4));
      return false;
    }
    if (medianG && Math.abs(rates.gbpusd - medianG) > 0.02) {
      console.log('❌ GBP/USD乖離: 取得=' + rates.gbpusd + ' 中央値=' + medianG.toFixed(4) + ' 差=' + Math.abs(rates.gbpusd - medianG).toFixed(4));
      return false;
    }
    
    console.log('✅ 乖離チェック通過（USDJPY中央値比: ±' + devU.toFixed(2) + '円, キャッシュ' + recentU.length + '件）');
    return true;
  } catch (e) {
    console.log('⚠️ 乖離チェックエラー（スキップ）: ' + e.message);
    return true;
  }
}

/**
 * 配列の中央値を返す
 */

/**
 * 配列の中央値を返す
 */
function getMedian_(arr) {
  var sorted = arr.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 中央値から閾値以上乖離した外れ値を除去する
 * @param {number[]} arr - 数値配列
 * @param {number} threshold - 許容乖離幅（USDJPY: 2.0円, EURUSD/GBPUSD: 0.02）
 * @return {number[]} 外れ値を除去した配列
 */

/**
 * 中央値から閾値以上乖離した外れ値を除去する
 * @param {number[]} arr - 数値配列
 * @param {number} threshold - 許容乖離幅（USDJPY: 2.0円, EURUSD/GBPUSD: 0.02）
 * @return {number[]} 外れ値を除去した配列
 */
function filterOutliers_(arr, threshold) {
  if (arr.length < 3) return arr;
  var median = getMedian_(arr);
  var filtered = arr.filter(function(v) {
    return Math.abs(v - median) <= threshold;
  });
  if (filtered.length !== arr.length) {
    console.log('📌 外れ値除去: ' + arr.length + '件 → ' + filtered.length + '件（中央値=' + median.toFixed(4) + ', 閾値=±' + threshold + '）');
  }
  return filtered.length > 0 ? filtered : arr;
}

// ========================================
// 市場分析エンジン ★v5.4 Phase 6.5（通貨強弱 + トレンド + ファンダ統合）
// ========================================

/**
 * 5通貨の強弱を計算（7ペアの変動率から導出）
 * USD/JPY↑ → USD強・JPY弱、EUR/USD↑ → EUR強・USD弱 の原理
 * @param {Array} pairChanges - ペア変動率配列
 * @return {Array} [{currency, jpName, score, direction}, ...] スコア降順
 */


function scheduledFetchRates() {
  console.log('=== 定期レート取得 ===');
  var keys = getApiKeys();
  
  var rates = fetchLatestRates_(keys.GEMINI_API_KEY);
  
  if (rates) {
    saveRatesToSheet_(rates, keys.SPREADSHEET_ID);
    console.log('✅ レートキャッシュに保存完了');
  } else {
    console.log('⚠️ レート取得失敗（次回リトライ）');
  }
  
  // ★v7.10: 未取得指標の結果リトライ（1時間ごとに自動チェック）
  // 発表+10分のトリガーでGoogle検索にまだ載っていなかった場合や、
  // 深夜帯（FOMC等）でトリガーが設定されなかった場合のリカバリ。
  // fetchTodayAnnouncedResults_は対象0件なら即returnするので無駄なAPIコールは発生しない。
  try {
    refreshTodayIndicatorResults();
  } catch (e) {
    console.log('⚠️ 指標結果リトライエラー（続行）: ' + e.message);
  }
}

// ========================================
// 市場指標データ読み取り（★v5.5.3）
// GOOGLEFINANCE関数で自動更新される「指標データ」シートから読み取り
// APIクレジット不要・トリガー不要
// ========================================

/**
 * 「指標データ」シートからGOOGLEFINANCEの最新値を読み取る
 * buildPrompt_から呼ばれてプロンプトに注入する
 */

