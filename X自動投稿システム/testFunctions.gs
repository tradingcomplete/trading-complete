/**
 * CompanaFXAutoPost - testFunctions.gs
 * テスト関数（全てのテスト・デバッグ用関数を集約）
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 1）
 * 
 * テスト実行方法:
 *   testAll1: MORNING, TOKYO, LUNCH
 *   testAll2: LONDON, GOLDEN, NY
 *   testAll3: INDICATOR, KNOWLEDGE, WEEKLY_REVIEW
 *   testAll4: RULE_1, RULE_2, RULE_3
 *   testAll5: RULE_4, WEEKLY_LEARNING
 *   testAll6: NEXT_WEEK, WEEKLY_HYPOTHESIS
 */

// ========================================
// テスト関数
// ========================================

function testGemini() {
  var keys = getApiKeys();
  
  console.log('=== Gemini API テスト ===');
  console.log('モデル: ' + GEMINI_MODEL);
  console.log('');
  
  console.log('--- テスト1: 基本テキスト生成 ---');
  var result1 = callGemini_(
    'FXトレードで一番大事なことを一文で答えてください。',
    keys.GEMINI_API_KEY,
    false
  );
  
  if (result1) {
    console.log('✅ 基本生成成功');
    console.log('応答: ' + result1.text);
  } else {
    console.log('❌ 基本生成失敗');
    return;
  }
  
  console.log('');
  console.log('--- テスト2: Grounding付き ---');
  var result2 = callGemini_(
    '現在のドル円（USD/JPY）の最新レートと、今日の主な値動きの要因を簡潔に教えてください。',
    keys.GEMINI_API_KEY,
    true
  );
  
  if (result2) {
    console.log('✅ Grounding付き生成成功');
    console.log('応答: ' + result2.text);
  } else {
    console.log('❌ Grounding付き生成失敗');
    return;
  }
  
  console.log('');
  console.log('🎉 Gemini APIテスト完了！');
}

// ★ 個別タイプをテストしたい場合: testGenerateOnly() の中のタイプ名を変更して実行
// ★ 平日一括: testGenerateAll() / 土日一括: testGenerateWeekend()

// 個別タイプテスト（タイプ名を変更して実行）

// 全タイプ一括テスト（レート1回取得→キャッシュ再利用でAPI節約）
function testGenerateAll() {
  var types = [
    'MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR',
    'KNOWLEDGE',
    'WEEKLY_REVIEW', 'RULE_1', 'RULE_2', 'RULE_3', 'RULE_4',
    'WEEKLY_LEARNING', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'
  ];
  
  // レートを1回だけ取得してキャッシュ
  var keys = getApiKeys();
  console.log('=== レート事前取得 ===');
  var cachedRates = fetchLatestRates_(keys.GEMINI_API_KEY);
  if (cachedRates) {
    console.log('📊 キャッシュレート: USD/JPY=' + cachedRates.usdjpy + ' EUR/USD=' + cachedRates.eurusd + ' GBP/USD=' + cachedRates.gbpusd);
    saveRatesToSheet_(cachedRates, keys.SPREADSHEET_ID);
  } else {
    console.log('⚠️ レート取得失敗。レートなしでテスト続行');
  }
  
  console.log('');
  console.log('=== 全投稿タイプ 一括テスト（' + types.length + 'タイプ） ===');
  console.log('⚠️ レート制限回避のため各3秒間隔で実行');
  console.log('');
  
  var success = 0;
  var fail = 0;
  var results = [];
  var startTime = new Date();
  
  // ★v6.1.1: 一括テスト時はファクトチェックをスキップ（GAS 6分制限対策）
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SKIP_FACT_CHECK', 'true');
  console.log('⚠️ 一括テスト: ファクトチェックをスキップ（時間制限対策）');
  
  for (var i = 0; i < types.length; i++) {
    // 5分経過で安全停止（GAS制限は6分）
    var elapsed = (new Date() - startTime) / 1000;
    if (elapsed > 300) {
      console.log('⏰ 5分経過のため安全停止（GAS制限6分）');
      console.log('完了: ' + i + '/' + types.length + 'タイプ');
      break;
    }
    
    var type = types[i];
    console.log('--- [' + (i + 1) + '/' + types.length + '] ' + type + ' ---');
    
    var result = generatePost(type, null, cachedRates);
    
    if (result) {
      console.log('✅ ' + result.emoji + ' ' + result.label + ' | 文字数: ' + result.text.length);
      console.log(result.text);
      console.log('');
      results.push({type: type, chars: result.text.length, status: '✅'});
      success++;
    } else {
      console.log('❌ 生成失敗');
      console.log('');
      results.push({type: type, chars: 0, status: '❌'});
      fail++;
    }
    
    // レート制限回避（3秒間隔）
    if (i < types.length - 1) {
      Utilities.sleep(3000);
    }
  }
  
  // 一括テスト終了後にフラグをクリア（本番に影響しないように）
  props.deleteProperty('SKIP_FACT_CHECK');
  
  // サマリー
  console.log('========================================');
  console.log('📊 テスト結果サマリー');
  console.log('成功: ' + success + ' / 失敗: ' + fail + ' / 合計: ' + types.length);
  console.log('');
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var charWarning = (r.chars > 700) ? ' ⚠️文字数超過(700超)' : '';
    console.log(r.status + ' ' + r.type + ': ' + r.chars + '文字' + charWarning);
  }
  console.log('========================================');
}

// ★v8.0: 6分割テスト（testAll1〜6）ファクトチェック込み
// 16タイプを3タイプずつに分けてファクトチェック込みでテスト
// GAS 6分制限対策: 3タイプ×約1.5分 = 約4.5分で余裕をもって完了


// ★v8.0: 6分割テスト（testAll1〜6）ファクトチェック込み
// 16タイプを3タイプずつに分けてファクトチェック込みでテスト
// GAS 6分制限対策: 3タイプ×約1.5分 = 約4.5分で余裕をもって完了

function testAll1() {
  testBatch_(['MORNING', 'TOKYO', 'LUNCH'], 'グループ1/6');
}

function testAll2() {
  testBatch_(['LONDON', 'GOLDEN', 'NY'], 'グループ2/6');
}

function testAll3() {
  testBatch_(['INDICATOR', 'KNOWLEDGE', 'WEEKLY_REVIEW'], 'グループ3/6');
}

function testAll4() {
  testBatch_(['RULE_1', 'RULE_2', 'RULE_3'], 'グループ4/6');
}

function testAll5() {
  testBatch_(['RULE_4', 'WEEKLY_LEARNING'], 'グループ5/6');
}

function testAll6() {
  testBatch_(['NEXT_WEEK', 'WEEKLY_HYPOTHESIS'], 'グループ6/6');
}

// 分割テストの共通処理

// 分割テストの共通処理
function testBatch_(types, label) {
  var keys = getApiKeys();
  console.log('=== レート事前取得 ===');
  var cachedRates = fetchLatestRates_(keys.GEMINI_API_KEY);
  if (cachedRates) {
    console.log('📊 キャッシュレート: USD/JPY=' + cachedRates.usdjpy + ' EUR/USD=' + cachedRates.eurusd + ' GBP/USD=' + cachedRates.gbpusd);
    saveRatesToSheet_(cachedRates, keys.SPREADSHEET_ID);
  } else {
    console.log('⚠️ レート取得失敗。レートなしでテスト続行');
  }

  console.log('');
  console.log('=== 分割テスト ' + label + '（' + types.length + 'タイプ・ファクトチェック込み） ===');
  console.log('⚠️ レート制限回避のため各3秒間隔で実行');
  console.log('');

  var success = 0;
  var fail = 0;
  var results = [];

  for (var i = 0; i < types.length; i++) {
    var type = types[i];
    console.log('--- [' + (i + 1) + '/' + types.length + '] ' + type + ' ---');

    var result = generatePost(type, null, cachedRates);

    if (result) {
      console.log('✅ ' + result.emoji + ' ' + result.label + ' | 文字数: ' + result.text.length);
      console.log(result.text);
      console.log('');
      results.push({type: type, chars: result.text.length, status: '✅'});
      success++;
    } else {
      console.log('❌ 生成失敗');
      console.log('');
      results.push({type: type, chars: 0, status: '❌'});
      fail++;
    }

    if (i < types.length - 1) {
      Utilities.sleep(3000);
    }
  }

  console.log('========================================');
  console.log('📊 テスト結果サマリー (' + label + ')');
  console.log('成功: ' + success + ' / 失敗: ' + fail + ' / 合計: ' + types.length);
  console.log('');
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var charWarning = (r.chars > 700) ? ' ⚠️文字数超過(700超)' : '';
    console.log(r.status + ' ' + r.type + ': ' + r.chars + '文字' + charWarning);
  }
  console.log('========================================');
}

// 土日タイプ一括テスト（★v5.5.3追加）

// 土日タイプ一括テスト（★v5.5.3追加）
function testGenerateWeekend() {
  var types = [
    'WEEKLY_REVIEW', 'RULE_1', 'RULE_2', 'WEEKLY_LEARNING',
    'RULE_3', 'NEXT_WEEK', 'RULE_4', 'WEEKLY_HYPOTHESIS'
  ];
  
  var keys = getApiKeys();
  console.log('=== 土日タイプ一括テスト（' + types.length + 'タイプ） ===');
  var cachedRates = fetchLatestRates_(keys.GEMINI_API_KEY);
  if (cachedRates) {
    console.log('📊 レートキャッシュ済み');
    saveRatesToSheet_(cachedRates, keys.SPREADSHEET_ID);
  }
  console.log('');
  
  var results = [];
  var startTime = new Date();
  
  for (var i = 0; i < types.length; i++) {
    var elapsed = (new Date() - startTime) / 1000;
    if (elapsed > 300) {
      console.log('⏰ 5分経過のため安全停止');
      break;
    }
    
    var type = types[i];
    console.log('--- [' + (i + 1) + '/' + types.length + '] ' + type + ' ---');
    
    var result = generatePost(type, null, cachedRates);
    
    if (result) {
      console.log('✅ ' + result.emoji + ' ' + result.label + ' | 文字数: ' + result.text.length);
      console.log(result.text.substring(0, 100) + '...');
      results.push({type: type, chars: result.text.length, status: '✅'});
    } else {
      console.log('❌ 生成失敗');
      results.push({type: type, chars: 0, status: '❌'});
    }
    console.log('');
    
    if (i < types.length - 1) Utilities.sleep(3000);
  }
  
  console.log('========================================');
  console.log('📊 土日テスト結果');
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var typeLabel = r.type.indexOf('RULE') !== -1 || r.type === 'WEEKLY_LEARNING' ? '心得系' : '市場系';
    console.log(r.status + ' ' + r.type + '(' + typeLabel + '): ' + r.chars + '文字');
  }
  console.log('========================================');
}

function testGenerate_(postType) {
  var typeConfig = POST_TYPES[postType];
  var label = typeConfig ? typeConfig.label : postType;
  
  console.log('=== ' + postType + '投稿 生成テスト ===');
  console.log('');
  
  var result = generatePost(postType, null);
  
  if (result) {
    console.log('投稿タイプ: ' + result.emoji + ' ' + result.label);
    console.log('文字数: ' + result.text.length);
    console.log('');
    console.log('--- 生成テキスト ---');
    console.log(result.text);
  } else {
    console.log('❌ 生成失敗');
  }
}

// ★ 追加テスト: Sheets読み込み確認

// ★ 追加テスト: Sheets読み込み確認
function testSheetLoading() {
  console.log('=== Sheets読み込みテスト ===');
  console.log('');
  
  // 投稿プロンプトシート
  console.log('--- 投稿プロンプトシート ---');
  var morningPrompt = getPostPrompt_('MORNING');
  if (morningPrompt) {
    console.log('✅ MORNING取得成功: ' + morningPrompt.name);
    console.log('プロンプト: ' + morningPrompt.prompt.substring(0, 100) + '...');
  } else {
    console.log('❌ MORNING取得失敗（投稿プロンプトシートを作成してください）');
  }
  
  console.log('');
  
  // TC概要シート
  console.log('--- TC概要シート ---');
  var tcOverview = getTCOverview();
  if (tcOverview) {
    console.log('✅ TC概要取得成功');
    console.log('内容（先頭200文字）: ' + tcOverview.substring(0, 200) + '...');
  } else {
    console.log('❌ TC概要取得失敗（TC概要シートを作成してください）');
  }
  
  console.log('');
  
  // トレードスタイルシート
  console.log('--- トレードスタイルシート ---');
  var tradeStyle = getTradeStyle_();
  if (tradeStyle) {
    console.log('✅ トレードスタイル取得成功');
    console.log('内容（先頭200文字）: ' + tradeStyle.substring(0, 200) + '...');
  } else {
    console.log('❌ トレードスタイル取得失敗（トレードスタイルシートを作成してください）');
  }
  
  console.log('');
  
  // 学びログシート
  console.log('--- 学びログシート ---');
  var learningLog = getLearningLog_('WEEKLY_REVIEW', 5);
  if (learningLog) {
    console.log('✅ 学びログ取得成功');
    console.log('内容: ' + learningLog.substring(0, 200) + '...');
  } else {
    console.log('⚠️ 学びログなし（まだ蓄積がないか、シートが未作成）');
  }
  
  console.log('');
  
  // 参照ソースシート
  console.log('--- 参照ソースシート ---');
  var refSources = getReferenceSources_();
  if (refSources) {
    console.log('✅ 参照ソース取得成功');
    console.log('内容（先頭200文字）: ' + refSources.substring(0, 200) + '...');
  } else {
    console.log('❌ 参照ソース取得失敗（参照ソースシートを作成してください）');
  }
  
  console.log('');
  console.log('🎉 Sheets読み込みテスト完了！');
}

// ========================================
// サマリー更新テスト
// ========================================


// ========================================
// サマリー更新テスト
// ========================================

function testUpdateSummary() {
  console.log('=== レートサマリー更新テスト ===');
  console.log('');
  updatePriceSummary();
  console.log('');
  console.log('🎉 レートサマリーシートを確認してください');
  console.log('');
  
  // 分析結果もテスト
  console.log('--- プロンプト注入テスト ---');
  var analysis = analyzePriceHistory_();
  if (analysis) {
    console.log('✅ 分析データあり:');
    console.log(analysis);
  } else {
    console.log('⚠️ 分析データなし（データ蓄積が必要です）');
  }
}

// ========================================
// レート取得テスト
// ========================================


// ========================================
// レート取得テスト
// ========================================

function testFetchRates() {
  var keys = getApiKeys();
  
  console.log('=== レート取得テスト ===');
  console.log('');
  
  var rates = fetchLatestRates_(keys.GEMINI_API_KEY);
  
  if (rates) {
    console.log('✅ レート取得成功');
    console.log('  USD/JPY: ' + rates.usdjpy);
    console.log('  EUR/USD: ' + rates.eurusd);
    console.log('  GBP/USD: ' + rates.gbpusd);
    console.log('  取得元: ' + rates.source);
    console.log('');
    
    // スプレッドシート保存テスト
    console.log('--- スプレッドシート保存テスト ---');
    saveRatesToSheet_(rates, keys.SPREADSHEET_ID);
    console.log('');
    console.log('🎉 レートキャッシュシートを確認してください');
  } else {
    console.log('❌ レート取得失敗');
  }
}

/**
 * 定期レート取得（1時間ごとにトリガーで自動実行）
 * Twelve Data APIからレートを取得してレートキャッシュに保存
 */

/**
 * テスト: 指標データシートの読み取り確認
 */
function testReadIndicators() {
  var keys = getApiKeys();
  var result = getLatestIndicators_(keys.SPREADSHEET_ID);
  
  if (!result) {
    console.log('❌ 指標データが取得できません');
    console.log('setupIndicatorSheet() を実行してシートを作成してください');
    return;
  }
  
  console.log('=== 指標データ読み取りテスト ===');
  for (var i = 0; i < MARKET_INDICATORS.length; i++) {
    var ind = MARKET_INDICATORS[i];
    var val = result[ind.key];
    if (val !== null && val !== undefined) {
      console.log('✅ ' + ind.label + ': ' + val.toFixed(ind.decimals) + ind.unit);
    } else {
      console.log('❌ ' + ind.label + ': データなし');
    }
  }
}

// ========================================
// レートキャッシュ日次集約
// ========================================
// 【呼び出し元】scheduler.gs の scheduleTodayPosts()（毎朝5:00）
// 【処理内容】
//   1. レートキャッシュから前日以前のデータを読み取り
//   2. 日付ごとにOHLC（始値/高値/安値/終値）を算出
//   3. 「日次レート」シートに1日1行で保存
//   4. 7日より古い生データをレートキャッシュから削除
// ========================================

/**
 * レートキャッシュの日次集約（毎朝5:00に自動実行）
 * - 前日以前のデータ → OHLC集約 → 「日次レート」シートへ
 * - 7日超の生データ → レートキャッシュから削除
 */

/**
 * GASエディタから手動実行: testFetchIndicatorResults
 */
function testFetchIndicatorResults() {
  var keys = getApiKeys();
  
  console.log('=== 指標結果自動取得テスト ===');
  console.log('');
  
  // Step 1: 対象日の確認
  var targetDate = getIndicatorTargetDate_();
  var targetStr = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy/MM/dd（E）');
  console.log('対象日: ' + targetStr);
  console.log('');
  
  // Step 2: 対象指標の確認
  var indicators = getYesterdayIndicators_(keys.SPREADSHEET_ID, targetDate);
  console.log('対象指標数: ' + (indicators ? indicators.length : 0) + '件');
  
  if (!indicators || indicators.length === 0) {
    console.log('→ 対象日に重要指標がないか、既に結果が記入済みです。');
    console.log('');
    console.log('ヒント: 経済カレンダーの対象日に重要度「高」「中」の指標があり、');
    console.log('I列（結果）が空白であることを確認してください。');
    return;
  }
  
  for (var i = 0; i < indicators.length; i++) {
    var ind = indicators[i];
    var enName = getEnglishIndicatorName_(ind.name, ind.country);
    console.log('  ' + (i + 1) + '. ' + ind.name);
    console.log('     英語名: ' + enName);
    console.log('     予想: ' + ind.forecast + ' / 前回: ' + ind.previous);
    console.log('     シート行: ' + ind.rowIndex);
  }
  console.log('');
  
  // Step 3: Gemini+Grounding呼び出し
  console.log('Gemini+Grounding呼び出し中...');
  var result = fetchIndicatorResults_(keys.SPREADSHEET_ID, keys.GEMINI_API_KEY);
  
  console.log('');
  if (result) {
    console.log('=== 生成された注入テキスト ===');
    console.log(result);
  } else {
    console.log('結果取得失敗（上のログを確認してください）');
  }
  
  console.log('');
  console.log('=== テスト完了 ===');
}

/**
 * 「経済指標_貼り付け」シートを作成する（初回のみ実行）
 * 外為どっとコムからコピーしたデータを貼り付ける場所
 * GASエディタから手動実行: setupRawImportSheet
 */

/**
 * 経済カレンダーの取得テスト（書き込みなし、ログ確認用）
 */
function testFetchCalendar() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('経済カレンダー');
  
  if (!sheet) {
    console.log('⚠️ まず setupEconomicCalendarSheet() を実行してください');
    return;
  }
  
  // 現在のデータを表示
  if (sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    console.log('=== 現在の経済カレンダーデータ ===');
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] && data[i][3]) {
        var dateStr = '';
        try {
          dateStr = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'M/d');
        } catch(e) {
          dateStr = String(data[i][0]);
        }
        console.log(dateStr + ' ' + data[i][1] + ' [' + data[i][2] + '] ' + data[i][3] + (data[i][6] === '高' ? ' ★' : ''));
      }
    }
    console.log('合計: ' + data.length + '件');
  } else {
    console.log('（データなし。fetchEconomicCalendar() を実行してください）');
  }
  
  // プロンプト注入のテスト
  console.log('\n=== プロンプト注入テスト ===');
  var calToday = getEconomicCalendar_('today');
  console.log('【today】' + (calToday || '（なし）'));
  
  var calNextWeek = getEconomicCalendar_('next_week');
  console.log('【next_week】' + (calNextWeek || '（なし）'));
}


// ========================================
// テスト: レート注入修正確認 ★v5.9.1
// ========================================

/**
 * キャッシュフォールバックのテスト
 * 実行: GASエディタから直接実行
 */


// ========================================
// テスト: レート注入修正確認 ★v5.9.1
// ========================================

/**
 * キャッシュフォールバックのテスト
 * 実行: GASエディタから直接実行
 */
function testCacheFallback() {
  var keys = getApiKeys();
  
  console.log('=== 1. getLatestRatesFromCache_ テスト ===');
  var cacheRates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
  if (cacheRates) {
    console.log('✅ キャッシュフォールバック成功');
    console.log('  source: ' + cacheRates.source);
    console.log('  USD/JPY: ' + cacheRates.usdjpy);
    console.log('  EUR/USD: ' + cacheRates.eurusd);
    console.log('  GBP/USD: ' + cacheRates.gbpusd);
    console.log('  EUR/JPY: ' + cacheRates.eurjpy);
    console.log('  GBP/JPY: ' + cacheRates.gbpjpy);
    console.log('  AUD/JPY: ' + cacheRates.audjpy);
    console.log('  AUD/USD: ' + cacheRates.audusd);
  } else {
    console.log('❌ キャッシュフォールバック失敗（キャッシュにデータなし）');
  }
  
  console.log('\n=== 2. getLatestRateText_ テスト ===');
  var rateText = getLatestRateText_(keys.SPREADSHEET_ID);
  if (rateText) {
    console.log('✅ 出力:');
    console.log(rateText);
  } else {
    console.log('❌ テキスト生成失敗');
  }
}

/**
 * buildPrompt_のレート注入箇所を確認するテスト
 * LONDONタイプでプロンプトを組み立て、レート関連部分だけ抽出して表示
 * 実行: GASエディタから直接実行
 */

/**
 * buildPrompt_のレート注入箇所を確認するテスト
 * LONDONタイプでプロンプトを組み立て、レート関連部分だけ抽出して表示
 * 実行: GASエディタから直接実行
 */
function testRateInjection() {
  console.log('=== buildPrompt_ レート注入確認 ===\n');
  
  // rates=null のケース（APIが失敗した場合を再現）
  console.log('--- ケースA: rates=null（API失敗時）---');
  var promptA = buildPrompt_('LONDON', POST_TYPES['LONDON'], {}, null);
  extractAndLogRateSection_(promptA);
  
  // rates有りのケース
  console.log('\n--- ケースB: rates有り（通常時）---');
  var keys = getApiKeys();
  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
  if (rates) {
    var promptB = buildPrompt_('LONDON', POST_TYPES['LONDON'], {}, rates);
    extractAndLogRateSection_(promptB);
  } else {
    console.log('（キャッシュなしのためスキップ）');
  }
}

/**
 * プロンプトからレート関連セクションを抽出してログ出力（テスト用ヘルパー）
 * @param {string} prompt - 組み立て済みプロンプト
 */

/**
 * プロンプトからレート関連セクションを抽出してログ出力（テスト用ヘルパー）
 * @param {string} prompt - 組み立て済みプロンプト
 */
function extractAndLogRateSection_(prompt) {
  var lines = prompt.split('\n');
  var rateLines = [];
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf('レート') !== -1 ||
        line.indexOf('USD/JPY') !== -1 ||
        line.indexOf('確定レート') !== -1 ||
        line.indexOf('意識される') !== -1 ||
        line.indexOf('実勢レート') !== -1 ||
        line.indexOf('API未接続') !== -1 ||
        line.indexOf('レート取得') !== -1 ||
        line.indexOf('市場環境') !== -1) {
      for (var j = i; j < Math.min(i + 6, lines.length); j++) {
        rateLines.push('L' + (j + 1) + ': ' + lines[j]);
      }
      rateLines.push('...');
      i += 5;
    }
  }
  
  if (rateLines.length > 0) {
    console.log(rateLines.join('\n'));
  } else {
    console.log('（レート関連セクションが見つかりません）');
  }
  
  console.log('\nプロンプト全体: ' + prompt.length + '文字');
}



// ========================================
// EUR/JPY安値Date型バグ修正 ★v5.9.1
// ========================================

/**
 * 日次レートシートのDate型セルを数値に修正し、レートサマリーを再計算
 * 実行: GASエディタから手動実行（1回のみ）
 */



// ========================================
// EUR/JPY安値Date型バグ修正 ★v5.9.1
// ========================================

/**
 * 日次レートシートのDate型セルを数値に修正し、レートサマリーを再計算
 * 実行: GASエディタから手動実行（1回のみ）
 */
function fixDateBugInDailyRates() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('日次レート');
  
  if (!sheet || sheet.getLastRow() < 2) {
    console.log('日次レートシートがありません');
    return;
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  
  var fixCount = 0;
  
  for (var i = 0; i < data.length; i++) {
    for (var j = 1; j < data[i].length; j++) {
      var val = data[i][j];
      if (val instanceof Date) {
        // Date型をSheetsシリアル値に戻す
        var baseDate = new Date(Date.UTC(1899, 11, 30, 0, 0, 0));
        var serial = (val.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000);
        data[i][j] = serial;
        fixCount++;
        console.log('  修正: 行' + (i+2) + ' 列' + (j+1) + ' ' + val + ' → ' + serial.toFixed(5));
      }
    }
  }
  
  if (fixCount > 0) {
    // 修正データを書き戻し
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
    // 数値列を全て数値フォーマットに強制
    sheet.getRange(2, 2, data.length, lastCol - 1).setNumberFormat('0.00000');
    console.log('\n✅ ' + fixCount + '個のDate型セルを数値に修正しました');
    
    // レートサマリーも再計算
    console.log('\nレートサマリーを再計算します...');
    updatePriceSummary();
    console.log('✅ 完了！レートサマリーシートを確認してください');
  } else {
    console.log('✅ Date型のセルは見つかりませんでした（問題なし）');
  }
}

// ===== ファクトチェック自動化 ★v6.1 =====
/**
 * 投稿テキストの事実をGemini + Groundingで自動検証
 * 
 * @param {string} postText - 検証対象の投稿テキスト
 * @param {string} postType - 投稿タイプ（MORNING等）
 * @param {string} apiKey - Gemini APIキー
 * @return {Object} { passed: boolean, summary: string, details: string, issues: Array }
 */


function testGoldPrice() {
  var keys = getApiKeys();
  var tdApiKey = keys.TWELVE_DATA_API_KEY;
  var avApiKey = keys.ALPHA_VANTAGE_API_KEY;
  // Twelve DataでXAU/USDを試す
  var tdCandidates = ['XAU/USD', 'XAUUSD', 'GLD'];
  console.log('=== Twelve Data ===');
  for (var i = 0; i < tdCandidates.length; i++) {
    var url = 'https://api.twelvedata.com/price?symbol=' + encodeURIComponent(tdCandidates[i]) + '&apikey=' + tdApiKey;
    console.log('--- ' + tdCandidates[i] + ' ---');
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      console.log(res.getContentText().substring(0, 200));
    } catch(e) { console.log('エラー: ' + e.message); }
    Utilities.sleep(13000);
  }
  // Alpha VantageでFX_DAILY(XAU/USD)を試す
  console.log('=== Alpha Vantage FX_DAILY ===');
  var avUrl = 'https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=XAU&to_symbol=USD&apikey=' + avApiKey;
  try {
    var avRes = UrlFetchApp.fetch(avUrl, { muteHttpExceptions: true });
    console.log(avRes.getContentText().substring(0, 300));
  } catch(e) { console.log('エラー: ' + e.message); }
}
