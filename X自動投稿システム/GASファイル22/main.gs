/**
 * CompanaFXAutoPost - main.gs
 * エントリーポイント
 * スケジューラから呼ばれ、投稿生成→投稿→記録の一連処理を実行
 * 
 * ★ Phase 3.5: POST_MODEによる分岐（manual/validate/auto）
 * ★ Phase 4: 画像付き投稿対応（Drive画像マッチ）
 * ★ v5.0: カスタムメニュー追加（スプレッドシートから主要機能実行）
 * ★ v5.5.2: 仮説自動検証 + 仮説・学び統合抽出
 * ★ Phase 7: AI画像生成統合（市場系6タイプ → Gemini画像 + 透かし合成）
 */


// ===== カスタムメニュー（スプレッドシートを開くと自動表示） =====
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  
  ui.createMenu('FX自動投稿')
    
    // --- 経済指標 ---
    .addItem('経済指標をインポート（貼り付け→変換）', 'importFromRawSheet')
    .addItem('📊 指標結果を取得（I列が空の指標を更新）', 'refreshTodayIndicatorResults')
    .addSeparator()
    
    // --- レート ---
    .addItem('レートを取得', 'testFetchRates')
    .addItem('レートサマリーを更新', 'updatePriceSummary')
    .addItem('レート日次集約', 'aggregateDailyRates')
    .addItem('🔧 日次レートを再構築', 'rebuildDailyRates')
    .addSeparator()
    
    // --- モード切替 ---
    .addItem('現在のモード確認', 'showCurrentMode')
    .addItem('🔄 手動モード（承認して投稿）', 'setModeManual')
    .addItem('🔄 自動モード（即投稿）', 'setModeAuto')
    .addSeparator()
    
    // --- セットアップ ---
    .addItem('📋 確定データシート作成（金利+要人）', 'setupReferenceDataSheet')
    .addSeparator()
    
    // --- 危険 ---
    .addItem('⚠️ スケジューラ開始', 'initializeScheduler')
    .addItem('⚠️ 緊急停止（全トリガー削除）', 'emergencyStop')
    
    .addToUi();
}


/**
 * onOpenのinstallableトリガーを設定する
 * スタンドアロンGASでは1回だけ手動実行が必要
 * ★emergencyStop()で消えた場合もこれで復活
 */
function installOnOpenTrigger() {
  var ss = SpreadsheetApp.openById(getApiKeys().SPREADSHEET_ID);
  
  // 既存のonOpenトリガーを削除（重複防止）
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onOpen') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 新しいinstallableトリガーを設定
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(ss)
    .onOpen()
    .create();
  
  console.log('✅ onOpenトリガーを設定しました。スプレッドシートを再度開くとメニューが表示されます。');
}


// ===== モード切り替え =====

/**
 * 現在のPOST_MODEを表示
 */
function showCurrentMode() {
  var mode = PropertiesService.getScriptProperties().getProperty('POST_MODE') || 'manual';
  var modeNames = {
    'manual': '手動モード（Gmail承認して投稿）',
    'validate': '検証モード（バリデーション通過で自動投稿）',
    'auto': '自動モード（生成→即投稿）'
  };
  var ui = SpreadsheetApp.getUi();
  ui.alert('現在のモード', '📋 ' + (modeNames[mode] || mode), ui.ButtonSet.OK);
}

/**
 * 手動モードに切り替え（承認して投稿）
 */
function setModeManual() {
  setPostMode_('manual', '手動モード（Gmail承認して投稿）');
}

/**
 * 自動モードに切り替え（即投稿）
 */
function setModeAuto() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    '⚠️ 自動モードに切り替え',
    '自動モードでは生成→即Xに投稿されます。\n確認なしで投稿されますが、よろしいですか？',
    ui.ButtonSet.YES_NO
  );
  
  if (result === ui.Button.YES) {
    setPostMode_('auto', '自動モード（即投稿）');
  } else {
    ui.alert('キャンセルしました。手動モードのままです。');
  }
}

/**
 * POST_MODEを変更する共通関数
 */
function setPostMode_(mode, displayName) {
  PropertiesService.getScriptProperties().setProperty('POST_MODE', mode);
  var ui = SpreadsheetApp.getUi();
  ui.alert('モード変更完了', '✅ ' + displayName + ' に切り替えました。', ui.ButtonSet.OK);
  console.log('✅ POST_MODE → ' + mode);
}


// ===== メイン: 指定タイプの投稿を実行 =====
function executePost(postType) {
  var startTime = new Date();
  console.log('========================================');
  console.log('投稿実行開始: ' + postType);
  console.log('モード: ' + POST_MODE);
  console.log('日時: ' + formatDate(startTime));
  console.log('========================================');

  try {
    // ランダム遅延（Bot判定回避）
    addRandomDelay();

    // コンテキスト情報を取得
    var context = {
      lastHypothesis: getLastHypothesis(),
      lastLearning: getLastLearning()
    };

    console.log('前回の仮説: ' + (context.lastHypothesis || 'なし'));
    console.log('前回の学び: ' + (context.lastLearning || 'なし'));
    console.log('');

    // ★v5.5.2: 前回仮説の自動検証（投稿生成の前に実行）
    verifyPreviousHypothesis_();

    // Geminiでテキスト生成（+ 画像選択）
    console.log('テキスト生成中...');
    var generated = generatePost(postType, context);

    if (!generated || !generated.text) {
      throw new Error('テキスト生成失敗');
    }

    var postText = generated.text.trim();
    console.log('生成完了（' + postText.length + '文字）');
    if (generated.imageBlob) {
      console.log('画像選択済み: ' + generated.imageName);
    }
    console.log('');

    // === POST_MODEで分岐 ===
    switch (POST_MODE) {

      case 'manual':
        return handleManualMode_(postType, postText, generated);

      case 'validate':
        return handleValidateMode_(postType, postText, generated);

      case 'auto':
      default:
        return handleAutoMode_(postType, postText, generated, startTime);
    }

  } catch (e) {
    console.log('❌ エラー: ' + e.message);
    logError(postType, e.message);
    sendErrorEmail(postType + ' 実行エラー', e.message + '\n\n' + e.stack);
    return { success: false, error: e.message };
  }
}


// ===== AI画像生成（市場系タイプのみ） =====
/**
 * 市場系投稿タイプの場合、AI画像を生成して返す
 * 非市場系タイプ（RULE等）の場合はnullを返す
 * 
 * @param {string} postType - 投稿タイプ
 * @param {string} postText - 投稿テキスト
 * @returns {Object|null} { blob, archetype } or null
 */
function generateImageIfNeeded_(postType, postText) {
  // 市場系タイプ（MORNING, LONDON, NY, INDICATOR, WEEKLY_REVIEW, NEXT_WEEK）のみ
  if (!isImageGenerationType(postType)) {
    return null;
  }
  
  console.log('🎨 AI画像生成中...');
  
  try {
    var result = generatePostImage(postText, postType);
    
    if (result && result.blob) {
      var sizeKB = Math.round(result.blob.getBytes().length / 1024);
      console.log('✅ AI画像生成完了: ' + result.archetype + '（' + sizeKB + 'KB）');
      return result;
    } else {
      console.log('⚠️ AI画像生成失敗 → テキストのみで続行');
      return null;
    }
  } catch (e) {
    console.log('⚠️ AI画像生成エラー: ' + e.message + ' → テキストのみで続行');
    return null;
  }
}


// ===== 投稿実行（テキスト or テキスト+画像） =====
function executePostToX_(postText, imageBlob) {
  if (imageBlob) {
    // 画像付き投稿
    console.log('📤 画像アップロード中...');
    var mediaResult = uploadMedia(imageBlob);
    
    if (mediaResult && mediaResult.success && mediaResult.mediaId) {
      console.log('✅ 画像アップロード成功: mediaId=' + mediaResult.mediaId);
      return postTweetWithMedia(postText, mediaResult.mediaId);
    } else {
      console.log('⚠️ 画像アップロード失敗 → テキストのみで投稿');
      return postTweet(postText);
    }
  } else {
    // テキストのみ投稿
    return postTweet(postText);
  }
}


// ===== レベル1: 手動承認モード =====
function handleManualMode_(postType, postText, generated) {
  console.log('📋 手動承認モード: 下書きに保存します');

  var now = new Date();
  var scheduledTime = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');

  var postId = saveDraft({
    postType: postType,
    text: postText,
    scheduledTime: scheduledTime,
    validationResult: ''
  });

  // ★ Phase 7: 市場系タイプならAI画像を生成
  var imageResult = generateImageIfNeeded_(postType, postText);
  var imageFileId = null;
  var archetype = null;
  
  if (imageResult) {
    // Driveに保存
    imageFileId = saveImageToDrive_(imageResult.blob, postId);
    archetype = imageResult.archetype;
    
    // メタデータ保存（再生成ボタン用）
    saveImageMeta_(postId, {
      fileId: imageFileId,
      archetype: archetype,
      regenCount: 0
    });
    
    console.log('🖼 画像をDriveに保存: ' + imageFileId);
  }

  sendDraftNotification([{
    postId: postId,
    scheduledTime: scheduledTime,
    postType: postType,
    text: postText,
    imageFileId: imageFileId,
    archetype: archetype
  }]);

  console.log('');
  console.log('========================================');
  console.log('📋 下書き保存完了: ' + postId);
  if (imageFileId) {
    console.log('🖼 AI画像: ' + archetype);
  }
  console.log('📧 Gmail通知送信済み');
  console.log('→ メールの [✅承認する] をタップすると投稿されます');
  if (imageFileId) {
    console.log('→ [🔄画像を再生成] で別のアーキタイプに変更可能');
  }
  console.log('========================================');

  return { success: true, mode: 'manual', postId: postId };
}


// ===== レベル2: バリデーションモード =====
function handleValidateMode_(postType, postText, generated) {
  console.log('🔍 バリデーションモード: チェック中...');

  var validation = validatePost(postText, postType);

  // ★ Phase 7: バリデーション後にAI画像を生成（通過/不通過共通）
  var imageResult = generateImageIfNeeded_(postType, postText);
  var imageBlob = imageResult ? imageResult.blob : (generated.imageBlob || null);
  var archetype = imageResult ? imageResult.archetype : (generated.imageName || '');

  if (validation.passed) {
    console.log('✅ バリデーション通過 → 自動投稿します');

    var result = executePostToX_(postText, imageBlob);
    var todayCount = getTodayPostCount();

    savePost({
      postNumber: getDayName() + '-' + (todayCount + 1),
      typeName: postType,
      text: postText,
      hasImage: !!imageBlob,
      archetype: archetype,
      hypothesis: '',
      learning: '',
      tweetId: result.success ? result.tweetId : '',
      status: result.success ? '成功' : 'エラー',
      errorLog: result.success ? '' : JSON.stringify(result.error)
    });

    console.log('');
    console.log('========================================');
    if (result.success) {
      console.log('✅ バリデーション通過 → 自動投稿完了');
      console.log('Tweet ID: ' + result.tweetId);
      if (archetype) {
        console.log('画像: ' + archetype);
      }
      // ★v5.5.2: 仮説・学び統合抽出（投稿履歴H/I列 + 学びログに保存）
      extractPostInsights_(postType, postText);
    } else {
      console.log('❌ バリデーション通過だが投稿失敗');
      sendErrorEmail(postType + ' 投稿失敗', JSON.stringify(result.error));
    }
    console.log('========================================');

    return result;

  } else {
    console.log('⚠️ バリデーション失敗: ' + validation.summary);

    var now = new Date();
    var scheduledTime = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');

    var postId = saveDraft({
      postType: postType,
      text: postText,
      scheduledTime: scheduledTime,
      validationResult: validation.summary
    });

    // 画像があればDriveに保存 + メタデータ保存
    var imageFileId = null;
    if (imageResult) {
      imageFileId = saveImageToDrive_(imageResult.blob, postId);
      saveImageMeta_(postId, {
        fileId: imageFileId,
        archetype: archetype,
        regenCount: 0
      });
    }

    sendDraftNotification([{
      postId: postId,
      scheduledTime: scheduledTime,
      postType: postType,
      text: '⚠️ バリデーションNG: ' + validation.summary + '\n\n' + postText,
      imageFileId: imageFileId,
      archetype: archetype
    }]);

    console.log('');
    console.log('========================================');
    console.log('⚠️ バリデーションNG → 下書き保存: ' + postId);
    console.log('📧 Gmail通知送信済み → 手動確認してください');
    console.log('========================================');

    return { success: true, mode: 'validate_ng', postId: postId, validation: validation };
  }
}


// ===== レベル3: 自動投稿モード =====
function handleAutoMode_(postType, postText, generated, startTime) {
  // ★v5.8: 投稿間隔チェック（15分未満の連投はスパム判定リスク）
  var cache = CacheService.getScriptCache();
  var lastPostTime = cache.get('last_post_time');
  if (lastPostTime) {
    var elapsed = (Date.now() - Number(lastPostTime)) / 1000 / 60;
    if (elapsed < 15) {
      console.log('⚠️ 前回投稿から' + Math.round(elapsed) + '分。15分未満のためスキップ。');
      return { success: false, error: '投稿間隔15分未満' };
    }
  }
  
  console.log('🚀 自動投稿モード: 投稿します');

  // ★ Phase 7: 市場系タイプならAI画像を生成
  var imageResult = generateImageIfNeeded_(postType, postText);
  var imageBlob = imageResult ? imageResult.blob : (generated.imageBlob || null);
  var archetype = imageResult ? imageResult.archetype : (generated.imageName || '');

  // 画像付き or テキストのみで投稿
  var result = executePostToX_(postText, imageBlob);

  var todayCount = getTodayPostCount();

  savePost({
    postNumber: getDayName() + '-' + (todayCount + 1),
    typeName: postType,
    text: postText,
    hasImage: !!imageBlob,
    archetype: archetype,
    hypothesis: '',
    learning: '',
    tweetId: result.success ? result.tweetId : '',
    status: result.success ? '成功' : 'エラー',
    errorLog: result.success ? '' : JSON.stringify(result.error)
  });

  var elapsed = ((new Date() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('========================================');
  if (result.success) {
    console.log('✅ 投稿完了: ' + generated.emoji + ' ' + generated.label);
    console.log('Tweet ID: ' + result.tweetId);
    console.log('URL: https://x.com/Compana_Doppio/status/' + result.tweetId);
    if (archetype) {
      console.log('画像: ' + archetype);
    }
    // ★v5.5.2: 仮説・学び統合抽出（投稿履歴H/I列 + 学びログに保存）
    extractPostInsights_(postType, postText);
    // ★v5.8: 投稿時刻をキャッシュに記録（15分間隔チェック用）
    cache.put('last_post_time', String(Date.now()), 3600);
  } else {
    console.log('❌ 投稿失敗: ' + postType);
    sendErrorEmail(
      postType + ' 投稿失敗',
      'エラー: ' + JSON.stringify(result.error)
    );
  }
  console.log('処理時間: ' + elapsed + '秒');
  console.log('========================================');

  return result;
}


// ===== 平日投稿関数（スケジューラから呼ばれる） =====
function runMorning()  { return executePost('MORNING'); }
function runTokyo()    { return executePost('TOKYO'); }
function runLunch()    { return executePost('LUNCH'); }
function runLondon()   { return executePost('LONDON'); }
function runGolden()   { return executePost('GOLDEN'); }
function runNy()       { return executePost('NY'); }

// ===== 週末投稿関数 =====
function runWeeklyReview()     { return executePost('WEEKLY_REVIEW'); }
function runRule1()            { return executePost('RULE_1'); }
function runRule2()            { return executePost('RULE_2'); }
function runWeeklyLearning()   { return executePost('WEEKLY_LEARNING'); }
function runRule3()            { return executePost('RULE_3'); }
function runNextWeek()         { return executePost('NEXT_WEEK'); }
function runRule4()            { return executePost('RULE_4'); }
function runWeeklyHypothesis() { return executePost('WEEKLY_HYPOTHESIS'); }

// ===== 指標連動 =====
function runIndicator() { return executePost('INDICATOR'); }

// ===== KNOWLEDGE =====
function runKnowledge() { return executePost('KNOWLEDGE'); }


// ===== テスト: 下書きモード確認（投稿しない） =====
function testDraftMode() {
  console.log('=== 下書きモードテスト ===');
  console.log('POST_MODE: ' + POST_MODE);
  console.log('');

  var originalMode = POST_MODE;
  POST_MODE = 'manual';

  console.log('MORNING投稿を生成して下書き保存します...');
  console.log('（投稿はされません。Gmailに通知が届きます）');
  console.log('');

  var result = executePost('MORNING');

  POST_MODE = originalMode;

  console.log('');
  console.log('📧 Gmailを確認してください。');
  console.log('✅承認する / ❌中止する のリンクが含まれています。');

  return result;
}


// ===== テスト: MORNING投稿を実際に実行（Xに投稿される！） =====
function testFullPost() {
  console.log('');
  console.log('============================');
  console.log('  フルテスト: MORNING投稿');
  console.log('  注意: 実際にXに投稿されます');
  console.log('============================');
  console.log('');

  return executePost('MORNING');
}


// ===== テスト: 投稿せずにテキスト生成だけ確認 =====
function testGenerateOnly() {
  console.log('=== テキスト生成テスト（投稿しない） ===');
  console.log('');

  var context = {
    lastHypothesis: getLastHypothesis(),
    lastLearning: getLastLearning()
  };

  console.log('前回の仮説: ' + (context.lastHypothesis || 'なし'));
  console.log('前回の学び: ' + (context.lastLearning || 'なし'));
  console.log('');

  var schedule = getTodaySchedule();
  var postType = schedule ? schedule.types[0] : 'MORNING';

  console.log('投稿タイプ: ' + postType);
  console.log('生成中...');
  console.log('');

  var result = generatePost(postType, context);

  if (result) {
    console.log('--- 生成結果 ---');
    console.log('タイプ: ' + result.emoji + ' ' + result.label);
    console.log('画像あり: ' + result.hasImage);
    if (result.imageName) {
      console.log('選択画像: ' + result.imageName);
    }
    console.log('文字数: ' + result.text.length);
    console.log('');
    console.log(result.text);
    console.log('');

    var check = validateTextLength(result.text, postType);
    console.log('文字数チェック: ' + (check.valid ? '✅ OK' : '⚠️ 範囲外'));
  } else {
    console.log('❌ 生成失敗');
  }
}


// ===== 全体ステータス確認 =====
function showStatus() {
  console.log('=== CompanaFXAutoPost ステータス ===');
  console.log('');

  var keys = getApiKeys();
  console.log('APIキー:');
  console.log('  X_API_KEY: ' + (keys.X_API_KEY ? '✅' : '❌'));
  console.log('  X_API_SECRET: ' + (keys.X_API_SECRET ? '✅' : '❌'));
  console.log('  X_ACCESS_TOKEN: ' + (keys.X_ACCESS_TOKEN ? '✅' : '❌'));
  console.log('  X_ACCESS_SECRET: ' + (keys.X_ACCESS_SECRET ? '✅' : '❌'));
  console.log('  GEMINI_API_KEY: ' + (keys.GEMINI_API_KEY ? '✅' : '❌'));
  console.log('  SPREADSHEET_ID: ' + (keys.SPREADSHEET_ID ? '✅' : '❌'));
  console.log('  IMAGE_FOLDER_ID: ' + (keys.IMAGE_FOLDER_ID ? '✅' : '❌'));

  console.log('');
  console.log('POST_MODE: ' + POST_MODE);

  var schedule = getTodaySchedule();
  if (schedule) {
    console.log('');
    console.log('今日（' + schedule.dayName + '）のスケジュール: ' + schedule.postCount + '件');
    for (var i = 0; i < schedule.times.length; i++) {
      console.log('  ' + schedule.times[i] + ' → ' + schedule.types[i]);
    }
  }

  console.log('');
  console.log('今日の投稿数: ' + getTodayPostCount());
  console.log('直近の仮説: ' + (getLastHypothesis() || 'なし'));
  console.log('直近の学び: ' + (getLastLearning() || 'なし'));

  console.log('');
  console.log('=== ステータス確認完了 ===');
}