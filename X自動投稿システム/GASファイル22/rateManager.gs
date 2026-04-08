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
        cache.put('btc_price', btcVal.toString(), 75 * 60); // ★v12.1: 75分キャッシュ（毎時更新に合わせて延長）
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
        cache.put('gold_price', goldVal.toString(), 75 * 60); // ★v12.1: 75分キャッシュ（毎時更新に合わせて延長）
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

    // ★v12.1.1: Alpha Vantage WTI/天然ガス取得を停止（データが古く誤情報の原因になるため）
    // WTI情報はGroundingニュース経由で投稿に反映される

    // ★v12.2: BTC/GOLDはscheduledFetchRatesで毎時キャッシュ済み。ここでは取得しない
    // 理由: 62秒待機が不要になり、APIクレジット超過（9/8分）も解消
    var cache = CacheService.getScriptCache();
    var cachedBtc = cache.get('btc_price');
    var cachedGold = cache.get('gold_price');

    // 商品データ（キャッシュから読むだけ。API呼び出しなし）
    var commodities = {
      wti:    null,
      btc:    cachedBtc  ? parseFloat(cachedBtc)  : null,
      gold:   cachedGold ? parseFloat(cachedGold) : null,
      natgas: null
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
  
  // ★v12.1: BTC/ゴールドを事前取得（generatePost内での60秒待ちを回避）
  // 75分キャッシュなので、毎時実行で常にキャッシュが温まった状態になる
  try {
    var comResult = fetchCommodityPrices_();
    if (comResult) {
      console.log('✅ BTC/ゴールド事前取得完了');
    }
  } catch (e) {
    console.log('⚠️ BTC/ゴールド事前取得エラー（続行）: ' + e.message);
  }
  
  // ★v12.1: 通貨強弱シート更新（毎時の強弱・勢い・ダウ理論を蓄積）
  if (rates) {
    try {
      updateCurrencyStrengthSheet_(rates, keys.SPREADSHEET_ID);
      console.log('✅ 通貨強弱シート更新完了');
    } catch (e) {
      console.log('⚠️ 通貨強弱シート更新エラー（続行）: ' + e.message);
    }
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
// ★v12.1: 通貨強弱シート管理
// 毎時の通貨強弱・勢い・ダウ理論を蓄積
// ========================================

/**
 * 通貨強弱シートに1行追加（scheduledFetchRatesから毎時呼び出し）
 * @param {Object} rates - 為替レートデータ
 * @param {string} spreadsheetId - スプレッドシートID
 */
function updateCurrencyStrengthSheet_(rates, spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  
  // シート取得 or 作成
  var sheet = ss.getSheetByName('通貨強弱');
  if (!sheet) {
    sheet = ss.insertSheet('通貨強弱');
    var headers = [
      '日時',
      'EUR(%)', 'USD(%)', 'JPY(%)', 'GBP(%)', 'AUD(%)',
      '最強', '最弱', '強弱差(%)',
      'EUR勢い', 'USD勢い', 'JPY勢い', 'GBP勢い', 'AUD勢い',
      '3h最強', '3hトレンド', '注目ペア',
      'USD/JPYダウ', 'EUR/USDダウ', 'GBP/USDダウ',
      'EUR/JPYダウ', 'GBP/JPYダウ', 'AUD/JPYダウ', 'AUD/USDダウ'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    console.log('📊 通貨強弱シートを新規作成');
  }
  
  // 通貨強弱を計算（detectHotPair_を使用）
  var hotPairResult = detectHotPair_(rates, spreadsheetId);
  if (!hotPairResult || !hotPairResult.csRanking) {
    console.log('⚠️ 通貨強弱計算失敗 → スキップ');
    return;
  }
  
  // スコアを取り出す
  var currencies = ['EUR', 'USD', 'JPY', 'GBP', 'AUD'];
  var scores = {};
  hotPairResult.csRanking.forEach(function(c) {
    scores[c.currency] = Math.round(c.score * 100) / 100;
  });
  
  var sorted = hotPairResult.csRanking;
  var strongest = sorted[0].currency;
  var weakest = sorted[sorted.length - 1].currency;
  var gap = Math.round((sorted[0].score - sorted[sorted.length - 1].score) * 100) / 100;
  
  // 勢い判定（前回行との比較）
  var lastRow = sheet.getLastRow();
  var momentum = {};
  if (lastRow >= 2) {
    var prevRow = sheet.getRange(lastRow, 2, 1, 5).getValues()[0]; // B-F列
    var prevScores = { EUR: prevRow[0], USD: prevRow[1], JPY: prevRow[2], GBP: prevRow[3], AUD: prevRow[4] };
    
    // 前々回の勢いデータ（初動検出用）
    var prevMomentums = {};
    if (lastRow >= 3) {
      var prev2Row = sheet.getRange(lastRow - 1, 10, 2, 5).getValues(); // J-N列の直近2行
      currencies.forEach(function(c, idx) {
        prevMomentums[c] = {
          mom1: prev2Row[0][idx] || '-',  // 2時間前の勢い
          mom2: prev2Row[1][idx] || '-'   // 1時間前の勢い
        };
      });
    }
    
    currencies.forEach(function(c) {
      var diff = (scores[c] || 0) - (prevScores[c] || 0);
      var label = '';
      
      // 勢いの強さを3段階で判定
      if (diff > 0.15) label = '↑↑急加速';
      else if (diff > 0.05) label = '↑加速';
      else if (diff < -0.15) label = '↓↓急減速';
      else if (diff < -0.05) label = '↓減速';
      else label = '→維持';
      
      // ★初動検出: 直前2時間が「維持」だったのに動き始めた
      if (prevMomentums[c]) {
        var was1 = prevMomentums[c].mom1;
        var was2 = prevMomentums[c].mom2;
        var wasQuiet = (was1 === '→維持' || was1 === '-') && (was2 === '→維持' || was2 === '-');
        if (wasQuiet && label !== '→維持') {
          label = '★初動' + label;
        }
      }
      
      momentum[c] = label;
    });
  } else {
    currencies.forEach(function(c) { momentum[c] = '-'; });
  }
  
  // 3時間トレンド（直近3行の最強通貨を集計）
  var threeHourStrongest = strongest;
  var threeHourTrend = 'データ蓄積中';
  if (lastRow >= 3) {
    var readCount = Math.min(2, lastRow - 1);
    var recentStrongest = sheet.getRange(lastRow - readCount + 1, 7, readCount, 1).getValues();
    var counts = {};
    recentStrongest.forEach(function(row) {
      var s = row[0];
      if (s) counts[s] = (counts[s] || 0) + 1;
    });
    counts[strongest] = (counts[strongest] || 0) + 1; // 今回分を追加
    
    var maxCount = 0;
    Object.keys(counts).forEach(function(key) {
      if (counts[key] > maxCount) {
        maxCount = counts[key];
        threeHourStrongest = key;
      }
    });
    
    if (maxCount >= 3) threeHourTrend = threeHourStrongest + '独歩高';
    else if (maxCount >= 2) threeHourTrend = threeHourStrongest + '優位';
    else threeHourTrend = '混戦';
  }
  
  // 注目ペア（最強×最弱で7ペアから選定）
  var pairLookup = {
    'EURUSD': 'EUR/USD', 'EURJPY': 'EUR/JPY', 'EURGBP': 'EUR/GBP', 'EURAUD': 'EUR/AUD',
    'USDJPY': 'USD/JPY', 'GBPUSD': 'GBP/USD', 'AUDUSD': 'AUD/USD',
    'GBPJPY': 'GBP/JPY', 'AUDJPY': 'AUD/JPY', 'GBPAUD': 'GBP/AUD'
  };
  var suggestedPair = pairLookup[strongest + weakest] || pairLookup[weakest + strongest] || strongest + '/' + weakest;
  
  // ダウ理論判定
  var dowResults = calcDowTheory_(spreadsheetId);
  
  // 行を構築
  var now = new Date();
  var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  var row = [
    dateStr,
    scores.EUR || 0, scores.USD || 0, scores.JPY || 0, scores.GBP || 0, scores.AUD || 0,
    strongest, weakest, gap,
    momentum.EUR, momentum.USD, momentum.JPY, momentum.GBP, momentum.AUD,
    threeHourStrongest, threeHourTrend, suggestedPair,
    dowResults.usdjpy, dowResults.eurusd, dowResults.gbpusd,
    dowResults.eurjpy, dowResults.gbpjpy, dowResults.audjpy, dowResults.audusd
  ];
  
  sheet.appendRow(row);
  console.log('📊 通貨強弱: ' + strongest + '(' + (scores[strongest] >= 0 ? '+' : '') + scores[strongest] + '%) > ' + weakest + '(' + (scores[weakest] >= 0 ? '+' : '') + scores[weakest] + '%) | 勢い: ' + threeHourTrend);
  
  // 7日より古い行を削除（168行超過時）
  var maxRows = 168;
  var currentRows = sheet.getLastRow() - 1; // ヘッダー除く
  if (currentRows > maxRows) {
    var deleteCount = currentRows - maxRows;
    sheet.deleteRows(2, deleteCount);
    console.log('🗑️ 通貨強弱シート: ' + deleteCount + '行の古いデータを削除');
  }
}


/**
 * ★v12.1.1: 日次レートシートのSH/SL列からダウ理論判定
 * @param {string} spreadsheetId
 * @return {Object} { usdjpy: '上昇トレンド', eurusd: 'レンジ', ... }
 */
function calcDowTheory_(spreadsheetId) {
  var result = {};
  var pairKeys = ['usdjpy', 'eurusd', 'gbpusd', 'eurjpy', 'gbpjpy', 'audjpy', 'audusd'];
  pairKeys.forEach(function(k) { result[k] = 'データ不足'; });
  
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var dailySheet = ss.getSheetByName('日次レート');
    if (!dailySheet || dailySheet.getLastRow() < 2) return result;
    
    var totalCols = dailySheet.getLastColumn();
    if (totalCols < DAILY_RATE_COLS.getTotalCols()) return result; // SH/SL列がない
    
    var lastRow = dailySheet.getLastRow();
    var readRows = Math.min(60, lastRow - 1); // 直近60日分を読む（SH/SLを2組見つけるため）
    var startRow = lastRow - readRows + 1;
    var data = dailySheet.getRange(startRow, 1, readRows, totalCols).getValues();
    
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var pair = CURRENCY_PAIRS[p];
      var shColIdx = DAILY_RATE_COLS.getShCol(p); // 0-indexed
      var slColIdx = DAILY_RATE_COLS.getSlCol(p);
      var closeColIdx = DAILY_RATE_COLS.getOhlcCols(p).close;
      
      // SH/SLを直近から逆順に探す
      var shList = []; // [{value, rowIdx}]
      var slList = [];
      for (var i = data.length - 1; i >= 0; i--) {
        var shVal = parseFloat(data[i][shColIdx]);
        var slVal = parseFloat(data[i][slColIdx]);
        if (!isNaN(shVal) && shVal > 0 && shList.length < 2) shList.push({ value: shVal, idx: i });
        if (!isNaN(slVal) && slVal > 0 && slList.length < 2) slList.push({ value: slVal, idx: i });
        if (shList.length >= 2 && slList.length >= 2) break;
      }
      
      if (shList.length < 2 || slList.length < 2) continue;
      
      // shList[0]=最新SH, shList[1]=前回SH
      var shUp = shList[0].value > shList[1].value;
      var shDown = shList[0].value < shList[1].value;
      var slUp = slList[0].value > slList[1].value;
      var slDown = slList[0].value < slList[1].value;
      
      var trend = 'レンジ';
      if (shUp && slUp) trend = '上昇トレンド';
      else if (shDown && slDown) trend = '下降トレンド';
      
      // トレンド転換チェック（直近終値が前回SH/SLをブレイク）
      var latestClose = parseFloat(data[data.length - 1][closeColIdx]);
      if (!isNaN(latestClose)) {
        if (trend === '上昇トレンド' && latestClose < slList[0].value) {
          trend = '転換↓';
        } else if (trend === '下降トレンド' && latestClose > shList[0].value) {
          trend = '転換↑';
        }
      }
      
      result[pair.key] = trend;
    }
  } catch (e) {
    console.log('⚠️ ダウ理論計算エラー: ' + e.message);
  }
  
  return result;
}


/**
 * ★v12.1.1: Claude市場分析用のダウ理論詳細サマリー（日足+週足のSH/SL値を含む）
 * @param {string} spreadsheetId
 * @return {string} フォーマット済みテキスト
 */
function getDowTheorySummary_(spreadsheetId) {
  var text = '';
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var pairNames = ['USD/JPY', 'EUR/USD', 'GBP/USD', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'AUD/USD'];
    
    // === 日足 ===
    var dailySheet = ss.getSheetByName('日次レート');
    if (dailySheet && dailySheet.getLastRow() >= 2 && dailySheet.getLastColumn() >= DAILY_RATE_COLS.getTotalCols()) {
      var dLastRow = dailySheet.getLastRow();
      var dReadRows = Math.min(60, dLastRow - 1);
      var dStartRow = dLastRow - dReadRows + 1;
      var dTotalCols = dailySheet.getLastColumn();
      var dData = dailySheet.getRange(dStartRow, 1, dReadRows, dTotalCols).getValues();
      
      text += '【ダウ理論（日足 SH/SL・前後4日確定）】\n';
      for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
        var shCol = DAILY_RATE_COLS.getShCol(p);
        var slCol = DAILY_RATE_COLS.getSlCol(p);
        var closeCol = DAILY_RATE_COLS.getOhlcCols(p).close;
        var decimals = CURRENCY_PAIRS[p].symbol.indexOf('JPY') !== -1 ? 3 : 5;
        
        var shList = [];
        var slList = [];
        for (var i = dData.length - 1; i >= 0; i--) {
          var sv = parseFloat(dData[i][shCol]);
          var lv = parseFloat(dData[i][slCol]);
          if (!isNaN(sv) && sv > 0 && shList.length < 2) shList.push(sv);
          if (!isNaN(lv) && lv > 0 && slList.length < 2) slList.push(lv);
          if (shList.length >= 2 && slList.length >= 2) break;
        }
        
        if (shList.length < 2 || slList.length < 2) {
          text += pairNames[p] + ': データ不足\n';
          continue;
        }
        
        var shDir = shList[0] > shList[1] ? '↑' : (shList[0] < shList[1] ? '↓' : '→');
        var slDir = slList[0] > slList[1] ? '↑' : (slList[0] < slList[1] ? '↓' : '→');
        
        var trend = 'レンジ';
        if (shDir === '↑' && slDir === '↑') trend = '上昇トレンド';
        else if (shDir === '↓' && slDir === '↓') trend = '下降トレンド';
        
        var latestClose = parseFloat(dData[dData.length - 1][closeCol]);
        if (!isNaN(latestClose)) {
          if (trend === '上昇トレンド' && latestClose < slList[0]) trend = '転換↓';
          else if (trend === '下降トレンド' && latestClose > shList[0]) trend = '転換↑';
        }
        
        text += pairNames[p] + ': ' + trend;
        text += '（SH: ' + shList[1].toFixed(decimals) + '→' + shList[0].toFixed(decimals) + shDir;
        text += ' / SL: ' + slList[1].toFixed(decimals) + '→' + slList[0].toFixed(decimals) + slDir + '）\n';
      }
    }
    
    // === 週足 ===
    var weeklySheet = ss.getSheetByName('週足');
    if (weeklySheet && weeklySheet.getLastRow() >= 2) {
      var wLastRow = weeklySheet.getLastRow();
      var wReadRows = Math.min(30, wLastRow - 1);
      var wStartRow = wLastRow - wReadRows + 1;
      var wTotalCols = WEEKLY_RATE_COLS.getTotalCols();
      var wData = weeklySheet.getRange(wStartRow, 1, wReadRows, wTotalCols).getValues();
      
      text += '\n【ダウ理論（週足 SH/SL・前後4週確定）】\n';
      for (var wp = 0; wp < CURRENCY_PAIRS.length; wp++) {
        var wCols = WEEKLY_RATE_COLS.getPairCols(wp);
        var wDecimals = CURRENCY_PAIRS[wp].symbol.indexOf('JPY') !== -1 ? 3 : 5;
        
        var wShList = [];
        var wSlList = [];
        for (var wi = wData.length - 1; wi >= 0; wi--) {
          var wsv = parseFloat(wData[wi][wCols.sh]);
          var wlv = parseFloat(wData[wi][wCols.sl]);
          if (!isNaN(wsv) && wsv > 0 && wShList.length < 2) wShList.push(wsv);
          if (!isNaN(wlv) && wlv > 0 && wSlList.length < 2) wSlList.push(wlv);
          if (wShList.length >= 2 && wSlList.length >= 2) break;
        }
        
        if (wShList.length < 2 || wSlList.length < 2) {
          text += pairNames[wp] + ': データ蓄積中\n';
          continue;
        }
        
        var wShDir = wShList[0] > wShList[1] ? '↑' : (wShList[0] < wShList[1] ? '↓' : '→');
        var wSlDir = wSlList[0] > wSlList[1] ? '↑' : (wSlList[0] < wSlList[1] ? '↓' : '→');
        
        var wTrend = 'レンジ';
        if (wShDir === '↑' && wSlDir === '↑') wTrend = '上昇トレンド';
        else if (wShDir === '↓' && wSlDir === '↓') wTrend = '下降トレンド';
        
        text += pairNames[wp] + ': ' + wTrend;
        text += '（SH: ' + wShList[1].toFixed(wDecimals) + '→' + wShList[0].toFixed(wDecimals) + wShDir;
        text += ' / SL: ' + wSlList[1].toFixed(wDecimals) + '→' + wSlList[0].toFixed(wDecimals) + wSlDir + '）\n';
      }
    } else {
      text += '\n【ダウ理論（週足）】\nデータ蓄積中\n';
    }
  } catch (e) {
    console.log('⚠️ ダウ理論サマリーエラー: ' + e.message);
  }
  return text;
}


/**
 * 通貨強弱シートから直近N行を取得（Claude市場分析用）
 * @param {string} spreadsheetId
 * @param {number} rows - 取得する行数（デフォルト3）
 * @return {string} フォーマット済みテキスト
 */
function getCurrencyStrengthHistory_(spreadsheetId, rows) {
  rows = rows || 3;
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('通貨強弱');
    if (!sheet || sheet.getLastRow() < 2) return '';
    
    var lastRow = sheet.getLastRow();
    var readRows = Math.min(rows, lastRow - 1);
    var startRow = lastRow - readRows + 1;
    var data = sheet.getRange(startRow, 1, readRows, 24).getValues();
    
    if (data.length === 0) return '';
    
    var text = '【通貨強弱トレンド（直近' + data.length + '時間）】\n';
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var time = String(row[0]).substring(11, 16); // HH:mm部分
      text += time + '  ';
      // B-F列のスコアを強い順にソート
      var entries = [
        { c: 'EUR', s: row[1] }, { c: 'USD', s: row[2] }, { c: 'JPY', s: row[3] },
        { c: 'GBP', s: row[4] }, { c: 'AUD', s: row[5] }
      ];
      entries.sort(function(a, b) { return b.s - a.s; });
      text += entries.map(function(e) {
        return e.c + (e.s >= 0 ? '+' : '') + (typeof e.s === 'number' ? e.s.toFixed(2) : e.s) + '%';
      }).join(' > ');
      text += '\n';
    }
    
    // 最新行の勢い情報
    var latest = data[data.length - 1];
    var momentumParts = [];
    var currencies = ['EUR', 'USD', 'JPY', 'GBP', 'AUD'];
    for (var m = 0; m < currencies.length; m++) {
      var mom = latest[9 + m]; // J-N列
      if (mom && mom !== '-' && mom !== '→維持') {
        momentumParts.push(currencies[m] + ':' + mom);
      }
    }
    if (momentumParts.length > 0) {
      text += '勢い変化: ' + momentumParts.join('、') + '\n';
    }
    
    // 3hトレンド
    text += '3時間トレンド: ' + (latest[15] || '不明') + '\n';
    
    // ダウ理論（R-X列）
    text += '\n【ダウ理論（日足SH/SL）】\n';
    var pairNames = ['USD/JPY', 'EUR/USD', 'GBP/USD', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'AUD/USD'];
    for (var d = 0; d < pairNames.length; d++) {
      var dow = latest[17 + d]; // R-X列
      if (dow && dow !== 'データ不足') {
        text += pairNames[d] + ': ' + dow + '\n';
      }
    }
    
    return text;
  } catch (e) {
    console.log('⚠️ 通貨強弱履歴取得エラー: ' + e.message);
    return '';
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



/**
 * ★v12.1: 日次レートから通貨強弱を遡及計算して通貨強弱シートに挿入
 * GASエディタから手動で1回だけ実行する
 * 既存の毎時データの前に日次データを挿入する
 */
/**
 * ★v12.1.1: 既存の日次レートに対してSH/SLを一括判定+週足シートを作成
 * GASエディタから手動で1回だけ実行する
 */
function backfillSwingHighLow() {
  console.log('=== SH/SLバックフィル開始 ===');
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var dailySheet = ss.getSheetByName('日次レート');
  
  if (!dailySheet || dailySheet.getLastRow() < 10) {
    console.log('❌ 日次レートが10日未満。バックフィル不可');
    return;
  }
  
  // SH/SL列ヘッダーがなければ追加
  var existingCols = dailySheet.getLastColumn();
  var expectedCols = DAILY_RATE_COLS.getTotalCols();
  if (existingCols < expectedCols) {
    var shslHeaders = [];
    for (var hh = 0; hh < CURRENCY_PAIRS.length; hh++) {
      shslHeaders.push(CURRENCY_PAIRS[hh].symbol + '_SH', CURRENCY_PAIRS[hh].symbol + '_SL');
    }
    dailySheet.getRange(1, existingCols + 1, 1, shslHeaders.length).setValues([shslHeaders]);
    console.log('✅ SH/SL列ヘッダーを追加');
  }
  
  // 全データ読み込み（OHLC部分のみ）
  var numOhlcCols = DAILY_RATE_COLS.getOhlcOnlyCols();
  var lastRow = dailySheet.getLastRow();
  var data = dailySheet.getRange(2, 1, lastRow - 1, numOhlcCols).getValues();
  console.log('📊 ' + data.length + '日分を読み込み');
  
  // SH/SL判定（先頭4日と末尾4日は判定不能）
  var shslData = [];
  var shCount = 0;
  var slCount = 0;
  
  for (var i = 0; i < data.length; i++) {
    var row = [];
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var cols = DAILY_RATE_COLS.getOhlcCols(p);
      var targetHigh = parseFloat(data[i][cols.high]);
      var targetLow = parseFloat(data[i][cols.low]);
      var isSH = (i >= 4 && i < data.length - 4);
      var isSL = (i >= 4 && i < data.length - 4);
      
      if (isSH || isSL) {
        for (var offset = 1; offset <= 4; offset++) {
          if (isSH && targetHigh <= parseFloat(data[i - offset][cols.high])) isSH = false;
          if (isSH && targetHigh <= parseFloat(data[i + offset][cols.high])) isSH = false;
          if (isSL && targetLow >= parseFloat(data[i - offset][cols.low])) isSL = false;
          if (isSL && targetLow >= parseFloat(data[i + offset][cols.low])) isSL = false;
        }
      }
      
      row.push(isSH ? targetHigh : '');
      row.push(isSL ? targetLow : '');
      if (isSH) shCount++;
      if (isSL) slCount++;
    }
    shslData.push(row);
  }
  
  // 一括書き込み
  var writeCol = DAILY_RATE_COLS.getCountCol() + 2; // 1-indexed
  dailySheet.getRange(2, writeCol, shslData.length, CURRENCY_PAIRS.length * 2).setValues(shslData);
  console.log('✅ 日足SH/SL書き込み完了: SH=' + shCount + '個, SL=' + slCount + '個');
  
  // === 週足バックフィル ===
  console.log('');
  console.log('=== 週足バックフィル開始 ===');
  
  var weeklySheet = ss.getSheetByName('週足');
  if (weeklySheet) {
    ss.deleteSheet(weeklySheet); // 再作成
  }
  weeklySheet = ss.insertSheet('週足');
  var wHeaders = ['週開始日'];
  for (var wh = 0; wh < CURRENCY_PAIRS.length; wh++) {
    var wsym = CURRENCY_PAIRS[wh].symbol;
    wHeaders.push(wsym + '始値', wsym + '高値', wsym + '安値', wsym + '終値', wsym + '_SH', wsym + '_SL');
  }
  weeklySheet.appendRow(wHeaders);
  weeklySheet.getRange(1, 1, 1, wHeaders.length).setFontWeight('bold');
  
  // 日次データを週単位にグループ化
  var weeks = {};
  for (var d = 0; d < data.length; d++) {
    var dateVal = data[d][0];
    var dateObj;
    if (dateVal instanceof Date) dateObj = dateVal;
    else dateObj = new Date(String(dateVal).substring(0, 10));
    
    var dow = dateObj.getDay();
    var mondayDate = new Date(dateObj);
    mondayDate.setDate(mondayDate.getDate() - (dow === 0 ? 6 : dow - 1));
    var mondayStr = Utilities.formatDate(mondayDate, 'Asia/Tokyo', 'yyyy-MM-dd');
    
    if (!weeks[mondayStr]) weeks[mondayStr] = [];
    weeks[mondayStr].push(data[d]);
  }
  
  // 週足OHLC作成
  var weekKeys = Object.keys(weeks).sort();
  var weekRows = [];
  for (var w = 0; w < weekKeys.length; w++) {
    var wk = weeks[weekKeys[w]];
    var wRow = [weekKeys[w]];
    for (var wp = 0; wp < CURRENCY_PAIRS.length; wp++) {
      var wCols = DAILY_RATE_COLS.getOhlcCols(wp);
      var wOpen = parseFloat(wk[0][wCols.open]);
      var wClose = parseFloat(wk[wk.length - 1][wCols.close]);
      var wHigh = -Infinity;
      var wLow = Infinity;
      for (var wr = 0; wr < wk.length; wr++) {
        var wh2 = parseFloat(wk[wr][wCols.high]);
        var wl2 = parseFloat(wk[wr][wCols.low]);
        if (wh2 > wHigh) wHigh = wh2;
        if (wl2 < wLow) wLow = wl2;
      }
      wRow.push(wOpen, wHigh, wLow, wClose, '', '');
    }
    weekRows.push(wRow);
  }
  
  if (weekRows.length > 0) {
    weeklySheet.getRange(2, 1, weekRows.length, weekRows[0].length).setValues(weekRows);
    console.log('📊 週足: ' + weekRows.length + '週分を書き込み');
  }
  
  // 週足SH/SL判定
  var wShCount = 0;
  var wSlCount = 0;
  for (var wi = 4; wi < weekRows.length - 4; wi++) {
    for (var wpp = 0; wpp < CURRENCY_PAIRS.length; wpp++) {
      var wpc = WEEKLY_RATE_COLS.getPairCols(wpp);
      var wTargetHigh = parseFloat(weekRows[wi][wpc.high]);
      var wTargetLow = parseFloat(weekRows[wi][wpc.low]);
      var wIsSH = true;
      var wIsSL = true;
      
      for (var wo = 1; wo <= 4; wo++) {
        if (wTargetHigh <= parseFloat(weekRows[wi - wo][wpc.high])) wIsSH = false;
        if (wTargetHigh <= parseFloat(weekRows[wi + wo][wpc.high])) wIsSH = false;
        if (wTargetLow >= parseFloat(weekRows[wi - wo][wpc.low])) wIsSL = false;
        if (wTargetLow >= parseFloat(weekRows[wi + wo][wpc.low])) wIsSL = false;
      }
      
      if (wIsSH) {
        weeklySheet.getRange(wi + 2, wpc.sh + 1).setValue(wTargetHigh); // +2: ヘッダー+0-indexed
        wShCount++;
      }
      if (wIsSL) {
        weeklySheet.getRange(wi + 2, wpc.sl + 1).setValue(wTargetLow);
        wSlCount++;
      }
    }
  }
  console.log('✅ 週足SH/SL書き込み完了: SH=' + wShCount + '個, SL=' + wSlCount + '個');
  
  // 52週超を削除
  if (weekRows.length > 52) {
    var wDel = weekRows.length - 52;
    weeklySheet.deleteRows(2, wDel);
    console.log('🗑️ 週足: ' + wDel + '行の古いデータを削除');
  }
  
  console.log('');
  console.log('=== バックフィル完了 ===');
}


function backfillCurrencyStrength() {
  console.log('=== 通貨強弱バックフィル開始 ===');
  
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var dailySheet = ss.getSheetByName('日次レート');
  
  if (!dailySheet || dailySheet.getLastRow() < 3) {
    console.log('❌ 日次レートが3日未満。バックフィル不可');
    return;
  }
  
  // 全日次データを読み込み
  var numCols = 1 + 7 * 4 + 1; // 30列
  var data = dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, numCols).getValues();
  console.log('📊 日次レート: ' + data.length + '日分');
  
  // 通貨強弱シートを取得（なければ作成）
  var csSheet = ss.getSheetByName('通貨強弱');
  if (!csSheet) {
    csSheet = ss.insertSheet('通貨強弱');
    var headers = [
      '日時',
      'EUR(%)', 'USD(%)', 'JPY(%)', 'GBP(%)', 'AUD(%)',
      '最強', '最弱', '強弱差(%)',
      'EUR勢い', 'USD勢い', 'JPY勢い', 'GBP勢い', 'AUD勢い',
      '3h最強', '3hトレンド', '注目ペア',
      'USD/JPYダウ', 'EUR/USDダウ', 'GBP/USDダウ',
      'EUR/JPYダウ', 'GBP/JPYダウ', 'AUD/JPYダウ', 'AUD/USDダウ'
    ];
    csSheet.appendRow(headers);
    csSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    console.log('📊 通貨強弱シートを新規作成');
  }
  
  // 既存の毎時データを退避
  var existingData = [];
  if (csSheet.getLastRow() >= 2) {
    existingData = csSheet.getRange(2, 1, csSheet.getLastRow() - 1, 24).getValues();
    console.log('📦 既存の毎時データ: ' + existingData.length + '行を退避');
  }
  
  // ペアキーと終値列のマッピング
  var pairKeys = ['usdjpy', 'eurusd', 'gbpusd', 'eurjpy', 'gbpjpy', 'audjpy', 'audusd'];
  var closeColIndices = [4, 8, 12, 16, 20, 24, 28]; // 0-indexed
  
  // 通貨強弱を日ごとに計算
  var rows = [];
  var prevScores = null;
  var prevMom1 = null; // 2日前の勢い
  var prevMom2 = null; // 1日前の勢い
  var recentStrongest = []; // 直近3日の最強通貨
  
  for (var d = 1; d < data.length; d++) { // d=1から（前日終値が必要）
    var today = data[d];
    var yesterday = data[d - 1];
    
    // 日付取得
    var dateVal = today[0];
    var dateStr = '';
    if (dateVal instanceof Date) {
      dateStr = Utilities.formatDate(dateVal, 'Asia/Tokyo', 'yyyy/MM/dd') + ' 23:59';
    } else {
      dateStr = String(dateVal).substring(0, 10) + ' 23:59';
    }
    
    // ペア変動率を計算（今日の終値 vs 昨日の終値）
    var pairChanges = [];
    for (var p = 0; p < pairKeys.length; p++) {
      var todayClose = parseFloat(today[closeColIndices[p]]);
      var yesterdayClose = parseFloat(yesterday[closeColIndices[p]]);
      if (!todayClose || !yesterdayClose || yesterdayClose === 0) continue;
      var changePercent = ((todayClose - yesterdayClose) / yesterdayClose) * 100;
      pairChanges.push({ key: pairKeys[p], changePercent: changePercent });
    }
    if (pairChanges.length < 5) continue; // データ不足
    
    // 通貨強弱を計算
    var csRanking = calcCurrencyStrength_(pairChanges);
    var currencies = ['EUR', 'USD', 'JPY', 'GBP', 'AUD'];
    var scores = {};
    csRanking.forEach(function(c) {
      scores[c.currency] = Math.round(c.score * 100) / 100;
    });
    
    var strongest = csRanking[0].currency;
    var weakest = csRanking[csRanking.length - 1].currency;
    var gap = Math.round((csRanking[0].score - csRanking[csRanking.length - 1].score) * 100) / 100;
    
    // 勢い計算
    var momentum = {};
    if (prevScores) {
      currencies.forEach(function(c) {
        var diff = (scores[c] || 0) - (prevScores[c] || 0);
        var label = '';
        if (diff > 0.15) label = '↑↑急加速';
        else if (diff > 0.05) label = '↑加速';
        else if (diff < -0.15) label = '↓↓急減速';
        else if (diff < -0.05) label = '↓減速';
        else label = '→維持';
        
        // 初動検出
        if (prevMom1 && prevMom2) {
          var was1 = prevMom1[c] || '-';
          var was2 = prevMom2[c] || '-';
          var wasQuiet = (was1 === '→維持' || was1 === '-') && (was2 === '→維持' || was2 === '-');
          if (wasQuiet && label !== '→維持') {
            label = '★初動' + label;
          }
        }
        momentum[c] = label;
      });
    } else {
      currencies.forEach(function(c) { momentum[c] = '-'; });
    }
    
    // 3日トレンド
    recentStrongest.push(strongest);
    if (recentStrongest.length > 3) recentStrongest.shift();
    var threeStrongest = strongest;
    var threeTrend = 'データ蓄積中';
    if (recentStrongest.length >= 3) {
      var counts = {};
      recentStrongest.forEach(function(s) { counts[s] = (counts[s] || 0) + 1; });
      var maxCount = 0;
      Object.keys(counts).forEach(function(k) {
        if (counts[k] > maxCount) { maxCount = counts[k]; threeStrongest = k; }
      });
      if (maxCount >= 3) threeTrend = threeStrongest + '独歩高';
      else if (maxCount >= 2) threeTrend = threeStrongest + '優位';
      else threeTrend = '混戦';
    }
    
    // 注目ペア
    var pairLookup = {
      'EURUSD': 'EUR/USD', 'EURJPY': 'EUR/JPY', 'EURAUD': 'EUR/AUD',
      'USDJPY': 'USD/JPY', 'GBPUSD': 'GBP/USD', 'AUDUSD': 'AUD/USD',
      'GBPJPY': 'GBP/JPY', 'AUDJPY': 'AUD/JPY', 'GBPAUD': 'GBP/AUD'
    };
    var suggestedPair = pairLookup[strongest + weakest] || pairLookup[weakest + strongest] || strongest + '/' + weakest;
    
    // ダウ理論（直近5日分のOHLC）
    var dowResults = {};
    pairKeys.forEach(function(k) { dowResults[k] = 'データ不足'; });
    if (d >= 4) { // 5日分必要（d-4 ~ d）
      for (var dp = 0; dp < pairKeys.length; dp++) {
        var highCol = 1 + dp * 4 + 1; // 高値列
        var lowCol = 1 + dp * 4 + 2;  // 安値列
        var highs = [], lows = [];
        for (var dd = d - 4; dd <= d; dd++) {
          var h = parseFloat(data[dd][highCol]);
          var l = parseFloat(data[dd][lowCol]);
          if (h > 0) highs.push(h);
          if (l > 0) lows.push(l);
        }
        if (highs.length < 3 || lows.length < 3) continue;
        var hUp = 0, hDown = 0, lUp = 0, lDown = 0;
        for (var j = 1; j < highs.length; j++) {
          if (highs[j] > highs[j-1]) hUp++; else if (highs[j] < highs[j-1]) hDown++;
          if (lows[j] > lows[j-1]) lUp++; else if (lows[j] < lows[j-1]) lDown++;
        }
        var steps = highs.length - 1;
        var trend = 'レンジ';
        if (hUp >= steps * 0.6 && lUp >= steps * 0.6) trend = '上昇トレンド';
        else if (hDown >= steps * 0.6 && lDown >= steps * 0.6) trend = '下降トレンド';
        if (highs.length >= 3) {
          var rH = highs[highs.length-1] > highs[highs.length-2];
          var pH = highs[highs.length-2] > highs[highs.length-3];
          if (rH !== pH && trend !== 'レンジ') trend += '（転換の兆し）';
        }
        dowResults[pairKeys[dp]] = trend;
      }
    }
    
    // 行を構築
    rows.push([
      dateStr,
      scores.EUR || 0, scores.USD || 0, scores.JPY || 0, scores.GBP || 0, scores.AUD || 0,
      strongest, weakest, gap,
      momentum.EUR, momentum.USD, momentum.JPY, momentum.GBP, momentum.AUD,
      threeStrongest, threeTrend, suggestedPair,
      dowResults.usdjpy, dowResults.eurusd, dowResults.gbpusd,
      dowResults.eurjpy, dowResults.gbpjpy, dowResults.audjpy, dowResults.audusd
    ]);
    
    // 次の日用に保存
    prevMom1 = prevMom2;
    prevMom2 = {};
    currencies.forEach(function(c) { prevMom2[c] = momentum[c]; });
    prevScores = scores;
  }
  
  // 既存データから「本日の毎時データ」だけを抽出（過去のバックフィル結果は除外）
  var hourlyData = [];
  for (var e = 0; e < existingData.length; e++) {
    var ts = String(existingData[e][0]);
    // 23:59で終わるのは日次バックフィルデータ → 除外。それ以外が毎時データ
    if (ts.indexOf('23:59') === -1 && ts.length > 0) {
      hourlyData.push(existingData[e]);
    }
  }
  console.log('📦 毎時データ（本日分）: ' + hourlyData.length + '行');
  
  // 日次データを直近分のみに絞る（168行制限 - 毎時データ分を確保）
  var maxDailyRows = 168 - hourlyData.length;
  if (rows.length > maxDailyRows) {
    rows = rows.slice(rows.length - maxDailyRows);
    console.log('📊 日次データを直近 ' + maxDailyRows + '日分に絞り込み');
  }
  
  console.log('📊 計算完了: ' + rows.length + '日分');
  
  // 通貨強弱シートに書き込み
  if (csSheet.getLastRow() >= 2) {
    csSheet.deleteRows(2, csSheet.getLastRow() - 1);
  }
  
  // 日次データを書き込み
  if (rows.length > 0) {
    csSheet.getRange(2, 1, rows.length, 24).setValues(rows);
    console.log('✅ 日次データ ' + rows.length + '行を書き込み');
  }
  
  // 毎時データを追記
  if (hourlyData.length > 0) {
    var startRow = 2 + rows.length;
    csSheet.getRange(startRow, 1, hourlyData.length, 24).setValues(hourlyData);
    console.log('✅ 毎時データ ' + hourlyData.length + '行を復元');
  }
  
  console.log('=== バックフィル完了 ===');
  console.log('日次データ: ' + rows.length + '日分 + 毎時データ: ' + hourlyData.length + '行');
}
