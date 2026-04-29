/**
 * CompanaFXAutoPost - testFunctions.gs
 * テスト関数
 * 
 * v8.5: geminiApi.gsからファイル分割
 * v8.8.1: Pro対応で再構成。不要なテスト関数を削除
 * ★v12.9: Lv2改善 - v12.7-v12.9の新機能をカバーするテストを追加
 *   - testPro_NY削除(NY廃止のため)
 *   - トリガー整合性確認(22:11事件の再発防止)
 *   - 3シート(継続中重大事象/対話型検証ログ/未来日付ガードログ)の読込テスト
 *   - 対話型検証Step 1-3の単体テスト
 *   - Q6確定データ強化のシナリオ別テスト
 *   - Phase 3分割アーキテクチャの確認テスト
 * 
 * テスト実行方法:
 *   【日常の動作確認】
 *   API確認      → testGemini()
 *   レート確認   → testFetchRates()
 *   カレンダー確認→ testFetchCalendar()
 *   
 *   【投稿生成テスト】
 *   市場系（重い）→ testPro_MORNING() 等で1タイプずつ
 *   RULE系（軽い）→ testRULE1_3()
 *   RULE4+学び   → testRULE4()
 *   週間系（軽い）→ testWEEK()
 *   
 *   【運用監視・トリガー確認】★v12.9追加
 *   SCHEDULE整合性   → verifyScheduleIntegrity()
 *   トリガー一覧     → checkTriggers()
 *   Phase状態確認    → testShowPhaseStatus()
 *   
 *   【Phase 3分割テスト】★v12.9追加
 *   Phase B単体テスト → testPhaseBOnly()
 *   
 *   【対話型検証(v12.7)】
 *   有効化/無効化    → setInteractiveVerifyEnabled() / Disabled()
 *   状態確認         → checkInteractiveVerifyStatus()
 *   Step 1-3単体テスト → testInteractiveVerifyUnit() ★v12.9追加
 *   確定データ収集確認→ testCollectAnchorData() ★v12.9追加
 *   
 *   【3シートの読込確認】★v12.9追加
 *   継続中重大事象    → testOngoingEventsSheet()
 *   対話型検証ログ    → testInteractiveVerifyLogSheet()
 *   未来日付ガードログ→ testFutureDateGuardLogSheet()
 *   
 *   【Q6確定データ強化(v12.9)】
 *   RBA利下げ誤記    → testQReviewRBA()
 *   FOMC判断ミス     → testQReviewFOMC()
 *   継続中事象ケース  → testQReviewOngoingEvents()
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
function testPro_LUNCH()            { testBatch_(['LUNCH'], 'Pro LUNCH'); }
function testPro_LONDON()           { testBatch_(['LONDON'], 'Pro LONDON'); }
function testPro_GOLDEN()           { testBatch_(['GOLDEN'], 'Pro GOLDEN'); }
// ★v12.9: testPro_NY削除（NYタイプ廃止）
// ★2026-04-29: testPro_TOKYO削除（TOKYOタイプ廃止・平日5投稿→4投稿）
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
/**
 * ★一時用(タスク17-19接続): 対話型検証の有効化フラグ設定
 */
function setInteractiveVerifyDisabled() {
  PropertiesService.getScriptProperties().setProperty('INTERACTIVE_VERIFY_ENABLED', 'false');
  console.log('✅ INTERACTIVE_VERIFY_ENABLED = false (対話型検証を無効化)');
}

function setInteractiveVerifyEnabled() {
  PropertiesService.getScriptProperties().setProperty('INTERACTIVE_VERIFY_ENABLED', 'true');
  console.log('✅ INTERACTIVE_VERIFY_ENABLED = true (対話型検証を有効化)');
}

function checkInteractiveVerifyStatus() {
  var value = PropertiesService.getScriptProperties().getProperty('INTERACTIVE_VERIFY_ENABLED');
  console.log('📌 INTERACTIVE_VERIFY_ENABLED = ' + (value === null ? '(未設定)' : value));
  console.log('   → 対話型検証は ' + (value === 'false' ? '無効' : '有効') + ' です');
}
function testQualityReviewWithAnchor() {
  var testText = '今週のドル、主要通貨で最弱水準まで売られた。\n' +
                 'RBAは今年から利下げサイクルに入ってるけど、それでも豪ドルの底堅さは本物なんですよね。';
  var typeConfig = POST_TYPES.GOLDEN;
  
  console.log('=== テスト: RBA利下げ記述で品質レビュー ===');
  console.log('期待: Q6 で確定データ(RBA 4.10% 2026年3月利上げ)を根拠に指摘される');
  console.log('');
  
  var result = qualityReviewPost_(testText, 'GOLDEN', typeConfig);
  
  console.log('結果: ' + (result.passed ? '合格' : '改善あり'));
  if (result.issues) {
    result.issues.forEach(function(issue) {
      console.log(issue.id + ': ' + issue.problem);
    });
  }
}

// ========================================================================
// ★v12.9 Lv2改善: 新規テスト関数群
// ========================================================================

// ========================================
// A. 運用監視: トリガー整合性確認
// ========================================

/**
 * ★v12.9: SCHEDULE定数のtimes/types配列要素数が一致しているか確認
 * 2026-04-17 runMorning 22:11異常発火事件の根本原因チェック用。
 * 来週以降、config.gs変更時の回帰テストとして使える。
 */
function verifyScheduleIntegrity() {
  var days = ['日', '月', '火', '水', '木', '金', '土'];
  var allOk = true;
  console.log('=== SCHEDULE整合性チェック ===');
  for (var d = 0; d < 7; d++) {
    var s = SCHEDULE[d];
    if (!s) continue;
    var match = (s.times.length === s.types.length);
    if (!match) allOk = false;
    console.log(days[d] + ': times=' + s.times.length + ' types=' + s.types.length + 
                ' ' + (match ? '✅' : '🚨 不整合!'));
    if (!match) {
      console.log('  times: ' + JSON.stringify(s.times));
      console.log('  types: ' + JSON.stringify(s.types));
    }
  }
  console.log('');
  console.log(allOk ? '✅ 全曜日の整合性OK' : '🚨 不整合あり - config.gsのSCHEDULE定義を確認せよ');
}

/**
 * ★v12.9: 現在のトリガー一覧を表示
 * 謎のトリガー発見用。実行後リセットする場合は resetAllPostTriggers() へ。
 */
function checkTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  console.log('=== 現在のトリガー(' + triggers.length + '件) ===');
  triggers.forEach(function(t) {
    console.log(t.getHandlerFunction() + ' : ' + t.getEventType());
  });
}

// ========================================
// B. 3シートの読込確認テスト
// ========================================

/**
 * ★v12.9: 継続中重大事象シート(㉑)の読込確認
 * 地政学リスクが正しく取得できているか確認する。
 */
function testOngoingEventsSheet() {
  console.log('=== 継続中重大事象シート(㉑)読込テスト ===');
  try {
    // sheetsManager.gs に定義されている関数を呼ぶ
    var events = getOngoingEvents_();
    if (!events || events.length === 0) {
      console.log('ℹ️ 継続中重大事象: 0件(シートが空か未作成)');
      return;
    }
    console.log('📋 継続中重大事象: ' + events.length + '件取得');
    events.forEach(function(e, i) {
      console.log('  [' + (i+1) + '] ' + JSON.stringify(e));
    });
  } catch (err) {
    console.log('❌ エラー: ' + err.message);
    console.log('   → sheetsManager.gs の getOngoingEvents_ 関数名を確認してください');
  }
}

/**
 * ★v12.9: 対話型検証ログシート(㉒)の読込確認
 * 直近10件のStep 4実行履歴を表示。
 */
function testInteractiveVerifyLogSheet() {
  console.log('=== 対話型検証ログシート(㉒)読込テスト ===');
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('対話型検証ログ');
    
    if (!sheet) {
      console.log('⚠️ シート「対話型検証ログ」が見つかりません');
      return;
    }
    
    var lastRow = sheet.getLastRow();
    console.log('総レコード数: ' + Math.max(0, lastRow - 1) + '件');
    
    if (lastRow <= 1) {
      console.log('ℹ️ まだログなし。対話型検証が発動すると記録されます');
      return;
    }
    
    var start = Math.max(2, lastRow - 9);
    var count = lastRow - start + 1;
    var data = sheet.getRange(start, 1, count, sheet.getLastColumn()).getValues();
    console.log('直近' + count + '件:');
    data.forEach(function(row, i) {
      console.log('  [' + (i+1) + '] ID=' + row[0] + ' / タイプ=' + row[1] + ' / 判定=❌' + row[5] + '/⚠️' + row[6] + '/✅' + row[7]);
    });
  } catch (err) {
    console.log('❌ エラー: ' + err.message);
  }
}

/**
 * ★v12.9: 未来日付ガードログシート(㉓)の読込確認
 * ガード発動履歴を表示(空でも正常)。
 */
function testFutureDateGuardLogSheet() {
  console.log('=== 未来日付ガードログシート(㉓)読込テスト ===');
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('未来日付ガードログ');
    
    if (!sheet) {
      console.log('⚠️ シート「未来日付ガードログ」が見つかりません');
      return;
    }
    
    var lastRow = sheet.getLastRow();
    console.log('総ガード発動数: ' + Math.max(0, lastRow - 1) + '件');
    
    if (lastRow <= 1) {
      console.log('✅ ガード発動なし(正常運用中)');
      return;
    }
    
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    data.forEach(function(row, i) {
      console.log('  [' + (i+1) + '] ' + JSON.stringify(row));
    });
  } catch (err) {
    console.log('❌ エラー: ' + err.message);
  }
}

// ========================================
// C. 対話型検証テスト
// ========================================

/**
 * ★v12.9: 対話型検証Step 1-3の単体テスト
 * 実投稿せず、サンプルテキストで対話型検証を走らせる。
 */
function testInteractiveVerifyUnit() {
  console.log('=== 対話型検証Step 1-3 単体テスト ===');
  
  var sampleText = '今日のドル、主要通貨で最弱水準まで売られた。\n' +
                   'パウエルFRB議長の解任示唆が影響している形ですね。\n' +
                   'RBAは今年から利上げサイクルで政策金利4.10%、豪ドルが一段上の強さを見せた週でした。';
  
  console.log('サンプル本文:');
  console.log(sampleText);
  console.log('');
  
  try {
    // interactiveVerify.gs の runInteractiveVerify_ を呼ぶ想定
    if (typeof runInteractiveVerify_ !== 'function') {
      console.log('❌ runInteractiveVerify_ が未定義。interactiveVerify.gs を確認してください');
      return;
    }
    
    var result = runInteractiveVerify_(sampleText, 'GOLDEN');
    
    console.log('--- 結果 ---');
    console.log('修正あり: ' + (result && result.revisedText ? 'Yes' : 'No'));
    if (result && result.revisedText) {
      console.log('修正後本文:');
      console.log(result.revisedText);
    }
  } catch (err) {
    console.log('❌ エラー: ' + err.message);
  }
}

/**
 * ★v12.9: collectAnchorData_ の出力確認
 * Q6強化の要となる確定データが正しく収集できているか。
 */
function testCollectAnchorData() {
  console.log('=== collectAnchorData_ 出力確認 ===');
  try {
    if (typeof collectAnchorData_ !== 'function') {
      console.log('❌ collectAnchorData_ が未定義。geminiApi.gs を確認してください');
      return;
    }
    
    var anchorText = collectAnchorData_('GOLDEN');
    console.log('--- GOLDEN用 確定データ ---');
    console.log('文字数: ' + (anchorText ? anchorText.length : 0));
    console.log('');
    console.log(anchorText || '(空)');
  } catch (err) {
    console.log('❌ エラー: ' + err.message);
  }
}

// ========================================
// D. Q6確定データ強化シナリオ別テスト
// ========================================

/**
 * ★v12.9: RBA利下げ誤記シナリオ(既存のtestQualityReviewWithAnchorを活用)
 * 期待: Q6が確定データを根拠に「利上げサイクル」と指摘する。
 */
function testQReviewRBA() {
  // 既存の testQualityReviewWithAnchor を呼び出すだけ
  testQualityReviewWithAnchor();
}

/**
 * ★v12.9: FRB政策判断ミスシナリオ
 * 期待: Q6が確定データ(FRB政策金利)を根拠に指摘する。
 */
function testQReviewFOMC() {
  var testText = '今日の米国市場、FRBが大幅利下げ決定でドルが崩れた展開。\n' +
                 'FF金利は2%台まで落ちて、タカ派姿勢は完全に終わった形ですね。';
  var typeConfig = POST_TYPES.GOLDEN;
  
  console.log('=== テスト: FRB大幅利下げ誤記で品質レビュー ===');
  console.log('期待: Q6 が確定データ(FRB政策金利の現在値)を根拠に指摘する');
  console.log('');
  
  try {
    var result = qualityReviewPost_(testText, 'GOLDEN', typeConfig);
    console.log('結果: ' + (result.passed ? '合格' : '改善あり'));
    if (result.issues) {
      result.issues.forEach(function(issue) {
        console.log(issue.id + ': ' + issue.problem);
      });
    }
  } catch (err) {
    console.log('❌ エラー: ' + err.message);
  }
}

/**
 * ★v12.9: 継続中重大事象ケース(「〜前」誤記)
 * 期待: Q6が継続中重大事象シートを根拠に「既に発生中」と指摘する。
 */
function testQReviewOngoingEvents() {
  var testText = '関税ショック前の静けさ、主要通貨は小動き。\n' +
                 '米中貿易摩擦の火種が残っているなかで、市場はやや楽観ムードで推移。';
  var typeConfig = POST_TYPES.GOLDEN;
  
  console.log('=== テスト: 継続中事象を「ショック前」と誤記 ===');
  console.log('期待: Q6 が継続中重大事象シートの内容を根拠に時制誤りを指摘する');
  console.log('');
  
  try {
    var result = qualityReviewPost_(testText, 'GOLDEN', typeConfig);
    console.log('結果: ' + (result.passed ? '合格' : '改善あり'));
    if (result.issues) {
      result.issues.forEach(function(issue) {
        console.log(issue.id + ': ' + issue.problem);
      });
    }
  } catch (err) {
    console.log('❌ エラー: ' + err.message);
  }
}

// ========================================
// E. Phase 3分割アーキテクチャテスト
// ========================================

/**
 * ★v12.9: 下書きシートのPhase状態一覧表示
 * どの下書きがどのPhaseで止まっているか確認。
 */
function testShowPhaseStatus() {
  console.log('=== 下書きシートのPhase状態一覧 ===');
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('下書き');
    
    if (!sheet) {
      console.log('⚠️ 下書きシートが見つかりません');
      return;
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.log('ℹ️ 下書きなし');
      return;
    }
    
    // 直近10件
    var start = Math.max(2, lastRow - 9);
    var count = lastRow - start + 1;
    var data = sheet.getRange(start, 1, count, sheet.getLastColumn()).getValues();
    
    console.log('直近' + count + '件:');
    data.forEach(function(row) {
      // A=投稿ID, B=生成日時, D=タイプ, G=ステータス
      console.log('  ' + row[0] + ' | ' + row[3] + ' | ' + row[6]);
    });
  } catch (err) {
    console.log('❌ エラー: ' + err.message);
  }
}

/**
 * ★v12.9: Phase B単体実行テスト
 * 最新の「Phase A完了」状態の下書きを取得してPhase Bを手動実行。
 * 注意: 実際の投稿に影響するので、テスト用下書きで実行すること。
 */
function testPhaseBOnly() {
  console.log('=== Phase B単体実行テスト ===');
  
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('下書き');
    
    if (!sheet || sheet.getLastRow() <= 1) {
      console.log('⚠️ 下書きなし');
      return;
    }
    
    // 最新の行を取得
    var lastRow = sheet.getLastRow();
    var latestId = sheet.getRange(lastRow, 1).getValue();
    var latestStatus = sheet.getRange(lastRow, 7).getValue();
    
    console.log('最新下書き: ' + latestId);
    console.log('ステータス: ' + latestStatus);
    console.log('');
    
    if (latestStatus !== 'Phase A完了') {
      console.log('⚠️ 最新下書きがPhase A完了状態ではありません');
      console.log('   Phase A完了状態の下書きがあれば手動でPHASE_B_POST_IDを設定して再実行してください');
      return;
    }
    
    // ScriptProperties経由でIDを渡す
    PropertiesService.getScriptProperties().setProperty('PHASE_B_POST_ID', latestId);
    console.log('PHASE_B_POST_ID設定: ' + latestId);
    console.log('');
    console.log('executePhaseBQualityReview を実行します...');
    console.log('');
    
    if (typeof executePhaseBQualityReview !== 'function') {
      console.log('❌ executePhaseBQualityReview が未定義。main.gs を確認してください');
      return;
    }
    
    executePhaseBQualityReview();
    console.log('');
    console.log('✅ Phase B実行完了(詳細は上記のログ参照)');
  } catch (err) {
    console.log('❌ エラー: ' + err.message);
  }
}
function testDowTheoryOutput() {
  var keys = getApiKeys();
  var text = getDowTheorySummary_(keys.SPREADSHEET_ID);
  console.log('===== ダウ理論サマリー出力 =====');
  console.log(text);
  console.log('===== 文字数: ' + (text ? text.length : 0) + ' =====');
}
/**
 * getTCOverview の出力を可視化するテスト関数
 * 
 * 使い方: GAS エディタで「testTCOverviewOutput」を選択 → 実行
 * 実行ログに現在の getTCOverview() の出力全文と文字数が表示される
 * 
 * 確認ポイント:
 *   1. 文字数が約300字前後(旧版1,082字からの圧縮確認)
 *   2. コンセプトとURLが入っている
 *   3. ★今回紹介する機能が入っている(ローテーション動作確認)
 */
function testTCOverviewOutput() {
  console.log('========================================');
  console.log('🔍 getTCOverview() 出力確認テスト');
  console.log('========================================');
  console.log('');
  
  try {
    // 現在の TC_FEATURE_INDEX を確認
    var props = PropertiesService.getScriptProperties();
    var beforeIdx = props.getProperty('TC_FEATURE_INDEX') || '(未設定)';
    console.log('● 実行前の TC_FEATURE_INDEX: ' + beforeIdx);
    console.log('');
    
    // getTCOverview を実行
    var output = getTCOverview();
    
    // 実行後の TC_FEATURE_INDEX
    var afterIdx = props.getProperty('TC_FEATURE_INDEX') || '(未設定)';
    
    if (!output) {
      console.log('⚠️ 空文字が返却されました(TC概要シートが空の可能性)');
      return;
    }
    
    console.log('● 出力文字数: ' + output.length + '字');
    console.log('● 実行後の TC_FEATURE_INDEX: ' + afterIdx + ' (次回紹介する機能のインデックス)');
    console.log('');
    
    // 圧縮効果の表示
    var oldSize = 1082;
    var diff = oldSize - output.length;
    var rate = (diff / oldSize * 100).toFixed(1);
    console.log('● 旧版(1,082字)からの削減: ' + diff + '字 (-' + rate + '%)');
    console.log('');
    
    // 内容確認
    console.log('● 含まれる要素の確認:');
    console.log('  [' + (output.indexOf('TC導線') !== -1 ? '✅' : '❌') + '] 「TC導線」ヘッダ');
    console.log('  [' + (output.indexOf('コンセプト') !== -1 ? '✅' : '❌') + '] 「TCのコンセプト」');
    console.log('  [' + (output.indexOf('URL') !== -1 ? '✅' : '❌') + '] 「URL」');
    console.log('  [' + (output.indexOf('★今回紹介する機能') !== -1 ? '✅' : '❌') + '] 「★今回紹介する機能」');
    console.log('  [' + (output.indexOf('OK例') !== -1 ? '✅' : '❌') + '] 「OK例」');
    console.log('  [' + (output.indexOf('NG例') !== -1 ? '✅' : '❌') + '] 「NG例」');
    console.log('');
    
    // 全文出力
    console.log('========================================');
    console.log('● 出力全文:');
    console.log('========================================');
    console.log(output);
    console.log('========================================');
    console.log('');
    console.log('✅ テスト完了');
    
  } catch (e) {
    console.log('❌ エラー: ' + e.message);
    console.log(e.stack);
  }
}

// ========================================
// ★v14.0 Phase 7(2026-04-23): 数値主張の整合性チェックテスト
// 事件13(LONDON「今日だけで4円17銭超の急騰」)再現テスト
// ========================================

/**
 * Phase 7: anchorDataCollector.gs の toFactString が本日変動セクションを
 *          正しく出力するかを確認する。
 * 
 * 期待: 【本日変動（始値比・本日限定の数値・★事件13対策の最重要基準）】セクションが
 *       出力され、USD/JPY・AUD/JPY 等の本日変動が明示されること。
 */
function testPhase7BodyDeltaSection() {
  console.log('========================================');
  console.log('🧪 Phase 7 テスト: 本日変動セクション出力確認');
  console.log('========================================');
  
  try {
    var keys = getApiKeys();
    var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
    
    if (!rates) {
      console.log('❌ レートキャッシュが空。テストスキップ');
      return false;
    }
    
    console.log('📊 レート取得成功: USD/JPY=' + rates.usdjpy);
    
    var anchor = collectAnchorData_(rates, keys, { includeCalendar: false, includeOngoingEvents: false });
    if (!anchor) {
      console.log('❌ collectAnchorData_ が null を返した');
      return false;
    }
    
    var factStr = anchor.toFactString();
    console.log('✅ toFactString() 生成: ' + factStr.length + '文字');
    
    // チェック項目
    var checks = [
      { name: '本日変動セクション存在', pattern: '【本日変動（始値比' },
      { name: '事件13対策の明示', pattern: '事件13対策' },
      { name: '通貨強弱の注記', pattern: '直近24時間の複数ペア総合スコア' },
      { name: '混同禁止ルール明示', pattern: '直近24時間変動を絶対に混同するな' },
    ];
    
    var allPass = true;
    for (var ci = 0; ci < checks.length; ci++) {
      var c = checks[ci];
      if (factStr.indexOf(c.pattern) !== -1) {
        console.log('   ✅ ' + c.name);
      } else {
        console.log('   ❌ ' + c.name + ' (パターン未検出: 「' + c.pattern + '」)');
        allPass = false;
      }
    }
    
    // 本日変動セクションの抜粋を表示
    var deltaIdx = factStr.indexOf('【本日変動');
    if (deltaIdx !== -1) {
      var deltaEnd = factStr.indexOf('\n\n', deltaIdx);
      if (deltaEnd === -1) deltaEnd = deltaIdx + 600;
      console.log('');
      console.log('--- 本日変動セクション抜粋 ---');
      console.log(factStr.substring(deltaIdx, Math.min(deltaEnd, deltaIdx + 600)));
      console.log('------------------------------');
    }
    
    console.log('');
    if (allPass) {
      console.log('🎉 Phase 7 テスト PASS');
    } else {
      console.log('⚠️ Phase 7 テスト 一部項目 FAIL');
    }
    return allPass;
    
  } catch (e) {
    console.log('❌ 例外: ' + e.message);
    console.log(e.stack);
    return false;
  }
}


/**
 * Phase 7: Stage 1 プロンプトに Step 0.5 が正しく含まれているかを確認する。
 * 
 * 期待: buildComprehensiveReviewPrompt_ の生成結果に 
 *       「Step 0.5: 時間限定数値主張の整合性チェック」が含まれること。
 */
function testPhase7Step05InPrompt() {
  console.log('========================================');
  console.log('🧪 Phase 7 テスト: Stage 1 プロンプトに Step 0.5 が入っているか');
  console.log('========================================');
  
  try {
    if (typeof buildComprehensiveReviewPrompt_ !== 'function') {
      console.log('❌ buildComprehensiveReviewPrompt_ 関数が見つからない');
      return false;
    }
    
    var dummyText = '📝豪ドル円、今日だけで4円17銭超の急騰。\n→昨日のS&P500最高値更新によるリスクオン...\n#FX #豪ドル円';
    var dummyTypeConfig = { label: 'ロンドン市場オープン', charMin: 200, charMax: 420 };
    var dummyAnchorData = null;  // 意図的にnullで構造チェックのみ
    var dummyPreviousPosts = [];
    
    var prompt = buildComprehensiveReviewPrompt_(
      dummyText, 'LONDON', dummyTypeConfig, 200, 420, dummyAnchorData, dummyPreviousPosts
    );
    
    console.log('✅ プロンプト生成成功: ' + prompt.length + '文字');
    
    var checks = [
      { name: 'Step 0.5 見出し', pattern: 'Step 0.5: 時間限定数値主張の整合性チェック' },
      { name: '事件13 背景説明', pattern: '2026-04-23 LONDON で「豪ドル円、今日だけで4円17銭超の急騰」' },
      { name: '対象語リスト', pattern: '「今日」「本日」「今日だけで」' },
      { name: '誤差倍率3倍超ルール', pattern: '誤差倍率が3倍超' },
      { name: '絶対値差50銭超ルール', pattern: '絶対値差が50銭超' },
      { name: '混同禁止ルール', pattern: '絶対混同禁止ルール' },
    ];
    
    var allPass = true;
    for (var ci = 0; ci < checks.length; ci++) {
      var c = checks[ci];
      if (prompt.indexOf(c.pattern) !== -1) {
        console.log('   ✅ ' + c.name);
      } else {
        console.log('   ❌ ' + c.name + ' (パターン未検出)');
        allPass = false;
      }
    }
    
    console.log('');
    if (allPass) {
      console.log('🎉 Phase 7 Step 0.5 テスト PASS');
    } else {
      console.log('⚠️ Phase 7 Step 0.5 テスト 一部 FAIL');
    }
    return allPass;
    
  } catch (e) {
    console.log('❌ 例外: ' + e.message);
    console.log(e.stack);
    return false;
  }
}


/**
 * Phase 7 総合テスト: 上記2つを連続実行
 */
function testPhase7All() {
  console.log('');
  console.log('########################################');
  console.log('# Phase 7 総合テスト実行');
  console.log('########################################');
  console.log('');
  
  var r1 = testPhase7BodyDeltaSection();
  console.log('');
  var r2 = testPhase7Step05InPrompt();
  console.log('');
  
  console.log('########################################');
  console.log('# Phase 7 総合テスト結果');
  console.log('#   本日変動セクション: ' + (r1 ? '✅ PASS' : '❌ FAIL'));
  console.log('#   Stage 1 Step 0.5:  ' + (r2 ? '✅ PASS' : '❌ FAIL'));
  console.log('#   総合: ' + ((r1 && r2) ? '🎉 全PASS' : '⚠️ 一部FAIL'));
  console.log('########################################');
}
