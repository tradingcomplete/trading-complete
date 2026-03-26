/**
 * CompanaFXAutoPost - testFunctions.gs
 * テスト関数
 * 
 * v8.5: geminiApi.gsからファイル分割
 * v8.8.1: Pro対応で再構成。不要なテスト関数を削除
 * 
 * テスト実行方法:
 *   市場系（重い）→ testPro_MORNING() 等で1タイプずつ
 *   RULE系（軽い）→ testRULE1_3()
 *   RULE4+学び   → testRULE4()
 *   週間系（軽い）→ testWEEK()
 *   API確認      → testGemini()
 *   レート確認   → testFetchRates()
 *   カレンダー確認→ testFetchCalendar()
 */

// ========================================
// API接続確認
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

// ========================================
// 投稿テスト（まとめ実行）
// ========================================

function testRULE1_3() {
  testBatch_(['RULE_1', 'RULE_2', 'RULE_3'], 'RULE 1-3');
}

function testRULE4() {
  testBatch_(['RULE_4', 'WEEKLY_LEARNING'], 'RULE4 + WEEKLY_LEARNING');
}

function testWEEK() {
  testBatch_(['NEXT_WEEK', 'WEEKLY_HYPOTHESIS'], 'NEXT_WEEK + WEEKLY_HYPOTHESIS');
}

// ========================================
// 投稿テスト（1タイプずつ・Pro用）
// ========================================

function testPro_MORNING()          { testBatch_(['MORNING'], 'Pro MORNING'); }
function testPro_TOKYO()            { testBatch_(['TOKYO'], 'Pro TOKYO'); }
function testPro_LUNCH()            { testBatch_(['LUNCH'], 'Pro LUNCH'); }
function testPro_LONDON()           { testBatch_(['LONDON'], 'Pro LONDON'); }
function testPro_GOLDEN()           { testBatch_(['GOLDEN'], 'Pro GOLDEN'); }
function testPro_NY()               { testBatch_(['NY'], 'Pro NY'); }
function testPro_INDICATOR()        { testBatch_(['INDICATOR'], 'Pro INDICATOR'); }
function testPro_KNOWLEDGE()        { testBatch_(['KNOWLEDGE'], 'Pro KNOWLEDGE'); }
function testPro_WEEKLY_REVIEW()    { testBatch_(['WEEKLY_REVIEW'], 'Pro WEEKLY_REVIEW'); }
function testPro_NEXT_WEEK()        { testBatch_(['NEXT_WEEK'], 'Pro NEXT_WEEK'); }
function testPro_WEEKLY_HYPOTHESIS(){ testBatch_(['WEEKLY_HYPOTHESIS'], 'Pro WEEKLY_HYPOTHESIS'); }
function testPro_WEEKLY_LEARNING()  { testBatch_(['WEEKLY_LEARNING'], 'Pro WEEKLY_LEARNING'); }

// ========================================
// テストの共通処理
// ========================================

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
  console.log('=== テスト: ' + label + '（' + types.length + 'タイプ・ファクトチェック込み） ===');
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
    console.log(r.status + ' ' + r.type + ': ' + r.chars + '文字');
  }
  console.log('========================================');
}

// ========================================
// データ確認用テスト
// ========================================

function testFetchRates() {
  var keys = getApiKeys();
  
  console.log('=== レート取得テスト ===');
  console.log('');
  
  console.log('--- Twelve Data API ---');
  var rates = fetchLatestRates_(keys.GEMINI_API_KEY);
  if (rates) {
    console.log('✅ 取得成功');
    console.log('  USD/JPY: ' + rates.usdjpy);
    console.log('  EUR/USD: ' + rates.eurusd);
    console.log('  GBP/USD: ' + rates.gbpusd);
    console.log('  EUR/JPY: ' + rates.eurjpy);
    console.log('  GBP/JPY: ' + rates.gbpjpy);
    console.log('  AUD/JPY: ' + rates.audjpy);
    console.log('  AUD/USD: ' + rates.audusd);
  } else {
    console.log('❌ 取得失敗');
  }
  
  console.log('');
  console.log('--- キャッシュフォールバック ---');
  var cacheRates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
  if (cacheRates) {
    console.log('✅ キャッシュ取得成功: USD/JPY=' + cacheRates.usdjpy);
  } else {
    console.log('❌ キャッシュにデータなし');
  }
}

function testFetchCalendar() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('経済カレンダー');
  
  if (!sheet) {
    console.log('⚠️ 経済カレンダーシートがありません');
    return;
  }
  
  if (sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    console.log('=== 経済カレンダーデータ ===');
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
    console.log('（データなし）');
  }
  
  console.log('\n=== プロンプト注入テスト ===');
  var calToday = getEconomicCalendar_('today');
  console.log('【today】' + (calToday || '（なし）'));
  
  var calNextWeek = getEconomicCalendar_('next_week');
  console.log('【next_week】' + (calNextWeek || '（なし）'));
}
