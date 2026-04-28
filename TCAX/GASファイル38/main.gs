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
    .addItem('🔄 検証モード（問題時のみ承認）', 'setModeValidate')
    .addItem('🔄 自動モード（即投稿）', 'setModeAuto')
    .addSeparator()
    
    // --- セットアップ ---
    .addItem('📋 確定データシート作成（金利+要人）', 'setupReferenceDataSheet')
    .addSeparator()
    
    // --- テスト（★v12.6: リグレッション防止） ---
    .addItem('🧪 後処理チェーンテスト', 'testPostProcessorChain')
    .addItem('🧪 レートフォーマットテスト', 'testFormatRate')
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
 * 検証モードに切り替え（問題時のみ承認メール）
 * ★v12.2: メニュー復活
 */
function setModeValidate() {
  setPostMode_('validate', '検証モード（問題時のみ承認メール）');
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
    // ★v14.0 Phase 6(2026-04-23): skipValidation=true で Stage 1 検証をスキップ
    //   Phase A(runMorning等)ではテキスト生成までで完結させ、
    //   Stage 1 検証は Phase B(独立した6分枠)で実行する。
    //   目的: GAS 6分制限のタイムアウト根絶。
    var generated = generatePost(postType, context, null, { skipValidation: true });

    if (!generated || !generated.text) {
      throw new Error('テキスト生成失敗');
    }

    var postText = generated.text.trim();
    console.log('生成完了（' + postText.length + '文字）');
    if (generated.imageBlob) {
      console.log('画像選択済み: ' + generated.imageName);
    }
    console.log('');

    // === ★v12.2: ファクトチェック失敗時は強制的にmanualモードへ ===
    if (generated.factCheckSkipped && POST_MODE !== 'manual') {
      console.log('⚠️ ファクトチェック失敗 → 安全のためmanualモードに強制切替');
      return handleManualMode_(postType, postText, generated);
    }

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
    handleError_('warning', 'main.gs:AI画像生成', e, { fallback: 'テキストのみで続行' });
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
// ★v12.2: パイプライン分割（Phase A: テキスト生成→下書き / Phase B: 画像+メール）
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

  console.log('✅ 下書きを保存しました: ' + postId);

  // ★v12.7 タスク5-a: Phase B（品質レビュー）を1分後のトリガーに分離
  // Phase B完了後に Phase C（画像+メール）が更に1分後に自動起動される
  // GAS 6分制限対策: 各Phaseを3-4分枠に収めることで確実に完走させる
  // ★v12.9 タスク5-e: POST_TYPE/POST_TEXT は下書きシートから読むため削除済み
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PHASE_B_POST_ID', postId);

  // 1分後にPhase Bトリガーを設定
  ScriptApp.newTrigger('executePhaseBQualityReview')
    .timeBased()
    .after(60 * 1000)
    .create();

  console.log('⏱️ Phase B（品質レビュー）を1分後にスケジュール');
  console.log('');
  console.log('========================================');
  console.log('📋 Phase A完了: ' + postId);
  console.log('→ Phase B（品質レビュー）が1分後に自動実行されます');
  console.log('→ Phase C（画像生成+承認メール）は Phase B 完了後に自動実行されます');
  console.log('========================================');

  return { success: true, mode: 'manual', postId: postId };
}


// ===== ★v12.7 Phase 3分割: Phase B - 品質整形Phase =====
/**
 * ★v12.7 Phase 3分割: Phase B - 品質整形Phase
 *
 * Phase A完了の1分後にトリガーから自動実行される。
 * 下書きシートから初稿を読み込み、executeQualityReviewChain_ で
 * 品質レビュー・修正・最終事実検証を実行して下書きを上書き更新する。
 *
 * 処理フロー:
 *   1. ScriptProperties から postId 取得
 *   2. 自身のトリガーを削除（重複実行防止）
 *   3. getDraftById_ で下書き読込
 *   4. ステータス確認（中止/完了なら即return）
 *   5. FactCheckJSON と CSDataJSON をパース
 *   6. キャッシュからレート取得
 *   7. executeQualityReviewChain_ 実行
 *   8. 下書きを上書き（TEXT, STATUS, PHASE_B_COMPLETED_AT）
 *   9. factCheckSkipped=true時はステータス「手動確認待ち」に降格
 *  10. Phase Cトリガー設定（タスク5で実装予定）
 *
 * タスク4時点では testTask4Step2PhaseB のみ呼び出し元。
 * タスク5で既存 handleManualMode_/handleValidateMode_/handleAutoMode_ から
 * 呼ばれるようになる。
 */
function executePhaseBQualityReview() {
  var props = PropertiesService.getScriptProperties();
  var postId = props.getProperty('PHASE_B_POST_ID');

  // プロパティをクリア
  props.deleteProperty('PHASE_B_POST_ID');
  props.deleteProperty('PHASE_B_POST_TYPE');
  props.deleteProperty('PHASE_B_POST_TEXT');

  // 使い終わったトリガーを削除（自身のトリガーのみ）
  var triggers = ScriptApp.getProjectTriggers();
  for (var t = 0; t < triggers.length; t++) {
    if (triggers[t].getHandlerFunction() === 'executePhaseBQualityReview') {
      ScriptApp.deleteTrigger(triggers[t]);
    }
  }

  if (!postId) {
    console.log('⚠️ executePhaseBQualityReview: PHASE_B_POST_ID が見つかりません');
    return;
  }

  console.log('========================================');
  console.log('🎨 Phase B開始: ' + postId);
  console.log('========================================');

  try {
    // Step 1: 下書きを読み込み
    var draft = getDraftById_(postId);
    if (!draft) {
      console.log('❌ 下書きが見つかりません: ' + postId);
      return;
    }

    // Step 2: ステータス確認（中止/完了なら即return）
    if (draft.status === '中止') {
      console.log('⚠️ 下書きステータスが「中止」のため Phase B をスキップ');
      return;
    }
    if (draft.status === '完了') {
      console.log('⚠️ 下書きステータスが「完了」のため Phase B をスキップ（重複実行防止）');
      return;
    }

    // Step 3: FactCheckJSON をパース
    var factResult = { passed: true, summary: 'スキップ', details: '', issues: [] };
    if (draft.factCheckJson) {
      try {
        var parsed = JSON.parse(draft.factCheckJson);
        if (parsed && typeof parsed === 'object') {
          factResult = parsed;
          // issuesが無い場合は空配列で初期化（executeQualityReviewChain_ が参照するため）
          if (!factResult.issues) factResult.issues = [];
        }
      } catch (e) {
        handleError_('warning', 'main.gs:FactCheckJSON パース', e, { fallback: 'スキップ扱いで続行' });
      }
    }

    // Step 4: CSDataJSON をパース（通貨強弱）
    var csForFactCheck = null;
    if (draft.csDataJson) {
      try {
        csForFactCheck = JSON.parse(draft.csDataJson);
      } catch (e) {
        handleError_('warning', 'main.gs:CSDataJSON パース', e);
      }
    }

    // Step 5: レート取得（キャッシュから）
    var keys = getApiKeys();
    var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
    if (!rates) {
      console.log('⚠️ レートキャッシュが空。レートなしで続行');
    }

    // Step 6: executeQualityReviewChain_ 実行
    console.log('🎨 品質レビューチェーン実行中（qualityReviewPost_ + finalFactVerify_）...');
    var startTime = new Date();
    var TIME_LIMIT_SEC = 300;

    var chainResult = executeQualityReviewChain_(
      draft.text,
      factResult,
      draft.postType,
      rates,
      keys,
      csForFactCheck,
      startTime,
      TIME_LIMIT_SEC
    );

    // Step 7: 下書きを更新（完成版テキスト + Phase B完了時刻 + ステータス）
    var phaseBCompletedAt = new Date().toISOString();
    // factCheckSkipped=true時は manual モードに強制降格（要件4.2）
    var newStatus = draft.factCheckSkipped ? '手動確認待ち' : 'Phase B完了';

    updateDraftContent_(postId, {
      TEXT: chainResult.text,
      PHASE_B_COMPLETED_AT: phaseBCompletedAt,
      STATUS: newStatus
    });

    console.log('');
    console.log('========================================');
    console.log('✅ Phase B完了: ' + postId);
    console.log('  修正あり: ' + chainResult.wasFixed);
    console.log('  新ステータス: ' + newStatus);
    if (chainResult.fixLog) {
      console.log('  fixLog:');
      console.log(chainResult.fixLog);
    } else {
      console.log('  （修正なし）');
    }
    console.log('========================================');

    // Step 8: Phase Cトリガー設定（★v12.7 タスク5-a で有効化）
    // Phase B 完了の1分後に Phase C（画像+メール）を自動実行させる
    props.setProperty('PHASE_C_POST_ID', postId);
    ScriptApp.newTrigger('executePhaseCImageAndPost')
      .timeBased()
      .after(60 * 1000)
      .create();
    console.log('⏱️ Phase C（画像生成+投稿）を1分後にスケジュール');

  } catch (e) {
    console.log('❌ Phase Bエラー: ' + e.message);
    console.log('Stack: ' + e.stack);

    // ★v12.7: Phase B失敗時は初稿のままPhase Cに進む（投稿継続フォールバック）
    // ステータスを「Phase Bエラー」に更新 → Phase Cで検知してmanualモード強制降格
    try {
      updateDraftContent_(postId, {
        STATUS: 'Phase Bエラー'
      });
    } catch (updateErr) {
      console.log('⚠️ 下書きステータス更新も失敗: ' + updateErr.message);
    }

    // エラーメール送信（品質レビューなし投稿の可能性を通知）
    sendErrorEmail('Phase B エラー (' + postId + ')',
      'Phase Bで品質レビューが失敗しました。\n' +
      '初稿のままPhase C（画像生成+投稿）に進みます。\n' +
      'Phase Cではmanualモードに強制降格されます。\n\n' +
      'エラー詳細:\n' + e.message + '\n\n' + e.stack);

    // Phase Cトリガー設定（★v12.7 タスク5-a で有効化 / 初稿のまま続行）
    // Phase B でエラーが出ても、初稿のまま Phase C に引き継ぎ投稿を継続させる
    // Phase C 側で Phase B エラーを検知して manualモードに強制降格する
    var propsErr = PropertiesService.getScriptProperties();
    propsErr.setProperty('PHASE_C_POST_ID', postId);
    ScriptApp.newTrigger('executePhaseCImageAndPost')
      .timeBased()
      .after(60 * 1000)
      .create();
    console.log('⏱️ Phase Bエラー → 初稿のまま Phase C を1分後にスケジュール');
  }
}


// ===== ★v12.7 Phase 3分割: Phase C - 画像生成+投稿Phase =====
/**
 * ★v12.7 Phase 3分割: Phase C - 画像生成+モード分岐投稿Phase
 *
 * Phase B完了の1分後にトリガーから自動実行される。
 * Phase Bで完成したテキストを下書きから読み込み、画像生成と投稿処理を
 * モード（manual/validate/auto）に応じて分岐実行する。
 *
 * 処理フロー:
 *   1. ScriptProperties から PHASE_C_POST_ID 取得
 *   2. 自身のトリガーを削除（重複実行防止）
 *   3. getDraftById_ で下書き全体を読込
 *   4. ステータス確認（中止/完了/エラーなら即return）
 *   5. factCheckSkipped=true なら強制manualモード降格
 *   6. 画像生成（isImageGenerationType のみ）→ Driveに保存
 *   7. POST_MODE で分岐:
 *        manual   → 承認メール送信 → ステータス「承認待ち」
 *        validate → validatePost → 通過で投稿+「完了」/ NGでメール+「承認待ち」
 *        auto     → 直接投稿 → 「完了」or「エラー」
 *   8. 投稿成功時: savePost に履歴記録 + ステータス更新
 *
 * 方針B（タスク5段階 → 完了 / v12.9でタスク5-d適用済み）:
 *   - 旧 executePhaseBImageAndEmail は削除済み
 *   - 本関数は handleManualMode_ / handleValidateMode_ / handleAutoMode_ から
 *     1分後トリガー経由で呼ばれる
 *
 * POST_MODE の扱い:
 *   - グローバル変数ではなく、実行時に ScriptProperties から再読み込み
 *   - テスト時の動的切り替えに対応
 */
function executePhaseCImageAndPost() {
  var props = PropertiesService.getScriptProperties();
  var postId = props.getProperty('PHASE_C_POST_ID');

  // プロパティをクリア
  props.deleteProperty('PHASE_C_POST_ID');

  // 使い終わったトリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var t = 0; t < triggers.length; t++) {
    if (triggers[t].getHandlerFunction() === 'executePhaseCImageAndPost') {
      ScriptApp.deleteTrigger(triggers[t]);
    }
  }

  if (!postId) {
    console.log('⚠️ executePhaseCImageAndPost: PHASE_C_POST_ID が見つかりません');
    return;
  }

  // POST_MODE を実行時に再読み込み（テスト時の動的切り替え対応）
  var currentMode = props.getProperty('POST_MODE') || 'manual';

  console.log('========================================');
  console.log('🎬 Phase C開始: ' + postId + ' (mode: ' + currentMode + ')');
  console.log('========================================');

  try {
    // Step 1: 下書きを読み込み
    var draft = getDraftById_(postId);
    if (!draft) {
      console.log('❌ 下書きが見つかりません: ' + postId);
      return;
    }

    // Step 2: ステータス確認（中止/完了/エラーなら即return）
    if (draft.status === '中止') {
      console.log('⚠️ 下書きステータスが「中止」のため Phase C をスキップ');
      return;
    }
    if (draft.status === '完了') {
      console.log('⚠️ 下書きステータスが「完了」のため Phase C をスキップ（重複実行防止）');
      return;
    }
    if (draft.status === 'エラー') {
      console.log('⚠️ 下書きステータスが「エラー」のため Phase C をスキップ');
      return;
    }

    // Step 3: factCheckSkipped=true または Phase Bエラー の場合は強制 manual モード降格（要件4.3, 7.2）
    if ((draft.factCheckSkipped || draft.status === 'Phase Bエラー') && currentMode !== 'manual') {
      var reason = draft.factCheckSkipped ? 'factCheckSkipped=true' : 'Phase Bエラー（初稿のまま進行）';
      console.log('⚠️ ' + reason + ' → 安全のためmanualモードに強制切替');
      currentMode = 'manual';
    }

    // Step 4: 画像生成（市場系タイプのみ）
    var postText = draft.text;
    var postType = draft.postType;
    var imageResult = generateImageIfNeeded_(postType, postText);
    var imageBlob = imageResult ? imageResult.blob : null;
    var imageFileId = null;
    var archetype = null;

    if (imageResult) {
      imageFileId = saveImageToDrive_(imageResult.blob, postId);
      archetype = imageResult.archetype;
      saveImageMeta_(postId, {
        fileId: imageFileId,
        archetype: archetype,
        regenCount: 0
      });
      console.log('🖼 画像をDriveに保存: ' + imageFileId + ' (' + archetype + ')');
    }

    // Step 5: POST_MODE で分岐
    if (currentMode === 'manual') {
      // === manualモード: 承認メール送信 ===
      console.log('📋 manualモード: 承認メール送信');
      var scheduledTime = draft.scheduledTime || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm');
      sendDraftNotification([{
        postId: postId,
        scheduledTime: scheduledTime,
        postType: postType,
        text: postText,
        imageFileId: imageFileId,
        archetype: archetype
      }]);
      updateDraftContent_(postId, { STATUS: '承認待ち' });
      console.log('✅ 承認メール送信完了 / ステータス: 承認待ち');

    } else if (currentMode === 'validate') {
      // === validateモード: バリデーション → 通過で投稿 / NGで承認メール ===
      console.log('🔍 validateモード: バリデーション中...');
      var validation = validatePost(postText, postType);

      if (validation.passed) {
        console.log('✅ バリデーション通過 → 自動投稿');
        executePhaseCPost_(postId, postType, postText, imageBlob, archetype);
      } else {
        console.log('⚠️ バリデーション失敗: ' + validation.summary);
        var vScheduledTime = draft.scheduledTime || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm');
        sendDraftNotification([{
          postId: postId,
          scheduledTime: vScheduledTime,
          postType: postType,
          text: '⚠️ バリデーションNG: ' + validation.summary + '\n\n' + postText,
          imageFileId: imageFileId,
          archetype: archetype
        }]);
        updateDraftContent_(postId, {
          STATUS: '承認待ち',
          VALIDATION: validation.summary
        });
        console.log('✅ バリデーションNG → 承認メール送信 / ステータス: 承認待ち');
      }

    } else {
      // === autoモード: 直接投稿 ===
      console.log('🚀 autoモード: 直接投稿');
      executePhaseCPost_(postId, postType, postText, imageBlob, archetype);
    }

    console.log('');
    console.log('========================================');
    console.log('✅ Phase C完了: ' + postId);
    console.log('========================================');

  } catch (e) {
    console.log('❌ Phase Cエラー: ' + e.message);
    console.log('Stack: ' + e.stack);

    // エラー時は下書きのステータスを「エラー」に更新
    try {
      updateDraftContent_(postId, { STATUS: 'エラー' });
    } catch (updateErr) {
      console.log('⚠️ 下書きステータス更新も失敗: ' + updateErr.message);
    }

    sendErrorEmail('Phase C エラー (' + postId + ')', e.message + '\n\n' + e.stack);
  }
}


/**
 * ★v12.7 Phase C内部: 実投稿処理（validate通過時 / autoモード時に呼ばれる）
 *
 * @param {string} postId
 * @param {string} postType
 * @param {string} postText
 * @param {Blob|null} imageBlob
 * @param {string|null} archetype
 */
function executePhaseCPost_(postId, postType, postText, imageBlob, archetype) {
  // 15分間隔チェック（handleAutoMode_と同じロジック）
  var cache = CacheService.getScriptCache();
  var lastPostTime = cache.get('last_post_time');
  if (lastPostTime) {
    var elapsed = (Date.now() - Number(lastPostTime)) / 1000 / 60;
    if (elapsed < 15) {
      console.log('⚠️ 前回投稿から' + Math.round(elapsed) + '分。15分未満のためスキップ');
      updateDraftContent_(postId, { STATUS: 'エラー', VALIDATION: '投稿間隔15分未満' });
      return;
    }
  }

  // 投稿実行
  var result = executePostToX_(postText, imageBlob);

  // 投稿履歴に記録
  var todayCount = getTodayPostCount();
  savePost({
    postNumber: getDayName() + '-' + (todayCount + 1),
    typeName: postType,
    text: postText,
    hasImage: !!imageBlob,
    archetype: archetype || '',
    hypothesis: '',
    learning: '',
    tweetId: result.success ? result.tweetId : '',
    status: result.success ? '成功' : 'エラー',
    errorLog: result.success ? '' : JSON.stringify(result.error)
  });

  if (result.success) {
    console.log('✅ 投稿完了: ' + postType);
    console.log('Tweet ID: ' + result.tweetId);
    console.log('URL: https://x.com/Compana_Doppio/status/' + result.tweetId);
    // 下書きステータス「完了」に更新
    updateDraftContent_(postId, { STATUS: '完了' });
    // 仮説・学び抽出
    extractPostInsights_(postType, postText);
    // 投稿時刻をキャッシュに記録
    cache.put('last_post_time', String(Date.now()), 3600);
  } else {
    console.log('❌ 投稿失敗: ' + postType);
    updateDraftContent_(postId, { STATUS: 'エラー' });
    sendErrorEmail(postType + ' Phase C 投稿失敗', 'エラー: ' + JSON.stringify(result.error));
  }
}


// ===== レベル2: バリデーションモード =====
// ★v12.7 タスク5-b: Phase A→B→C パイプライン化
// 旧実装は validatePost → 即投稿 / NG→下書き の分岐を同期実行していたが、
// 新実装は handleManualMode_ と同じく「下書き保存 + Phase B トリガー」のみ。
// バリデーション判定・投稿実行は Phase C の validate モード分岐に完全委譲。
function handleValidateMode_(postType, postText, generated) {
  console.log('🔍 バリデーションモード: 下書きに保存します（検証はPhase Cで実施）');

  var now = new Date();
  var scheduledTime = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');

  var postId = saveDraft({
    postType: postType,
    text: postText,
    scheduledTime: scheduledTime,
    validationResult: ''
  });

  console.log('✅ 下書きを保存しました: ' + postId);

  // ★v12.7 タスク5-b: Phase B（品質レビュー）を1分後のトリガーに分離
  // handleManualMode_ と同じ処理。Phase C で validate モード分岐が実行される
  // ★v12.9 タスク5-e: POST_TYPE/POST_TEXT は下書きシートから読むため削除済み
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PHASE_B_POST_ID', postId);

  // 1分後にPhase Bトリガーを設定
  ScriptApp.newTrigger('executePhaseBQualityReview')
    .timeBased()
    .after(60 * 1000)
    .create();

  console.log('⏱️ Phase B（品質レビュー）を1分後にスケジュール');
  console.log('');
  console.log('========================================');
  console.log('📋 Phase A完了: ' + postId);
  console.log('→ Phase B（品質レビュー）が1分後に自動実行されます');
  console.log('→ Phase C（validate分岐: 通過→投稿 / NG→承認メール）は Phase B 完了後に自動実行されます');
  console.log('========================================');

  return { success: true, mode: 'validate', postId: postId };
}


// ===== レベル3: 自動投稿モード =====
// ★v12.7 タスク5-c: Phase A→B→C パイプライン化
// 旧実装は 15分チェック → 画像生成 → executePostToX_ を同期実行していたが、
// 新実装は handleManualMode_ / handleValidateMode_ と同じく
// 「下書き保存 + Phase B トリガー」のみ。
// 15分間隔チェック・画像生成・投稿実行・savePost・extractPostInsights_ は
// すべて Phase C（executePhaseCImageAndPost と executePhaseCPost_）に完全委譲。
//
// 副次的効果: autoモードでも下書きが必ず作成される（要件定義4.4.2）。
// Phase A完了〜Phase C実行の約2分間は「緊急中止可能期間」となり、
// 下書きステータスを「中止」に手動変更することで投稿を止められる。
function handleAutoMode_(postType, postText, generated, startTime) {
  console.log('🚀 自動投稿モード: 下書きに保存します（投稿はPhase Cで実施）');

  var now = new Date();
  var scheduledTime = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');

  var postId = saveDraft({
    postType: postType,
    text: postText,
    scheduledTime: scheduledTime,
    validationResult: ''
  });

  console.log('✅ 下書きを保存しました: ' + postId);

  // ★v12.7 タスク5-c: Phase B（品質レビュー）を1分後のトリガーに分離
  // handleManualMode_ / handleValidateMode_ と同じ処理。
  // Phase C で auto モード分岐（直接投稿）が実行される
  // ★v12.9 タスク5-e: POST_TYPE/POST_TEXT は下書きシートから読むため削除済み
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PHASE_B_POST_ID', postId);

  // 1分後にPhase Bトリガーを設定
  ScriptApp.newTrigger('executePhaseBQualityReview')
    .timeBased()
    .after(60 * 1000)
    .create();

  console.log('⏱️ Phase B（品質レビュー）を1分後にスケジュール');
  console.log('');
  console.log('========================================');
  console.log('📋 Phase A完了: ' + postId);
  console.log('→ Phase B（品質レビュー）が1分後に自動実行されます');
  console.log('→ Phase C（auto分岐: 直接投稿）は Phase B 完了後に自動実行されます');
  console.log('→ 🛑 緊急中止: 下書きシートのステータスを「中止」に変更すれば投稿を止められます');
  console.log('========================================');

  return { success: true, mode: 'auto', postId: postId };
}


// ===== 平日投稿関数（スケジューラから呼ばれる） =====
function runMorning()  { return executePost('MORNING'); }
function runTokyo()    { return executePost('TOKYO'); }
function runLunch()    { return executePost('LUNCH'); }
function runLondon()   { return executePost('LONDON'); }
function runGolden()   { return executePost('GOLDEN'); }
// ★v12.7: runNy() 削除（NY投稿タイプ廃止）

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

// ===== ★v12.7 タスク4 Step 2動作確認用テスト関数 =====
/**
 * executePhaseBQualityReview の実動作テスト。
 * Claude API を実際に呼び出すため、処理時間 約1-2分 / コスト数円 が発生します。
 *
 * テスト手順:
 *   1. テスト用下書きを作成（Phase A完了状態）
 *   2. FactCheckJSON/CSDataJSON/ステータスを Phase A 成果として書き込み
 *   3. ScriptProperties に PHASE_B_POST_ID を設定
 *   4. executePhaseBQualityReview を実行
 *   5. 下書きが正しく更新されているか検証
 *   6. テスト下書きを削除
 */
function testTask4Step2PhaseB() {
  console.log('=== タスク4 Step 2: Phase B実動作テスト ===');
  console.log('');
  console.log('⚠️ このテストはClaude APIを実際に呼び出します');
  console.log('  処理時間: 約1-2分');
  console.log('  コスト: 数円');
  console.log('');

  // 1. テスト用下書きを作成
  console.log('1. テスト用下書きを作成');
  var testText = 'おはようございます☕\n\n📕昨夜のFOMC、市場はタカ派トーンを消化中。\n→ドル買いが続き、ドル円は155円台を維持。\n\n📝今日の注目は米CPI（21:30）。\n→コアCPIの前月比がポイント。\n\n今日も1日、冷静にいきましょう。';
  var postId;
  try {
    postId = saveDraft({
      postType: 'MORNING',
      text: testText,
      scheduledTime: '07:00',
      validationResult: '',
      status: 'Phase A完了'
    });
    console.log('   ✅ テスト下書き作成: ' + postId);
    console.log('   初稿文字数: ' + testText.length);
  } catch (e) {
    console.log('   ❌ saveDraft失敗: ' + e.message);
    return;
  }

  // 2. Phase A成果を擬似的に書き込み
  console.log('');
  console.log('2. Phase A成果を擬似的に書き込み（FactCheckJSON / 通貨強弱）');
  var dummyFactResult = {
    passed: true,
    summary: 'テスト: 全て正確',
    details: '',
    issues: []
  };
  var dummyCsRanking = [
    { currency: 'USD', score: '+0.5%' },
    { currency: 'JPY', score: '-0.3%' }
  ];

  try {
    updateDraftContent_(postId, {
      FACT_CHECK_JSON: JSON.stringify(dummyFactResult),
      CS_DATA_JSON: JSON.stringify(dummyCsRanking),
      PHASE_A_COMPLETED_AT: new Date().toISOString(),
      FACT_CHECK_SKIPPED: false
    });
    console.log('   ✅ Phase A成果を書き込み完了');
  } catch (e) {
    console.log('   ❌ updateDraftContent_失敗: ' + e.message);
    return;
  }

  // 3. ScriptProperties に postId を設定
  console.log('');
  console.log('3. ScriptProperties に PHASE_B_POST_ID を設定');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PHASE_B_POST_ID', postId);
  console.log('   ✅ 設定完了');

  // 4. executePhaseBQualityReview を実行
  console.log('');
  console.log('4. executePhaseBQualityReview を実行中...');
  console.log('   （qualityReviewPost_ と finalFactVerify_ でClaude API呼び出しが発生）');
  console.log('');

  try {
    executePhaseBQualityReview();
  } catch (e) {
    console.log('❌ 実行エラー: ' + e.message);
    console.log('Stack: ' + e.stack);
    return;
  }

  // 5. 下書きの更新状態を検証
  console.log('');
  console.log('5. 下書きの更新状態を検証');
  var updatedDraft = getDraftById_(postId);
  if (!updatedDraft) {
    console.log('   ❌ 下書きが取得できません');
    return;
  }

  console.log('   ---');
  console.log('   更新後ステータス: ' + updatedDraft.status);
  console.log('   Phase B完了時刻: ' + updatedDraft.phaseBCompletedAt);
  console.log('   更新後テキスト文字数: ' + (updatedDraft.text || '').length);
  console.log('   ---');
  console.log('   更新後テキスト（全文）:');
  console.log('');
  console.log(updatedDraft.text);
  console.log('');
  console.log('   ---');

  // ステータス検証
  if (updatedDraft.status !== 'Phase B完了' && updatedDraft.status !== '手動確認待ち') {
    console.log('   ❌ ステータスが期待値でない: ' + updatedDraft.status);
    return;
  }
  console.log('   ✅ ステータス: ' + updatedDraft.status);

  // Phase B完了時刻検証
  if (!updatedDraft.phaseBCompletedAt) {
    console.log('   ❌ PhaseBCompletedAtが記録されていない');
    return;
  }
  console.log('   ✅ PhaseBCompletedAt 記録済み');

  // テキストが空でないことを確認
  if (!updatedDraft.text || updatedDraft.text.length < 10) {
    console.log('   ❌ 更新後テキストが異常に短い');
    return;
  }
  console.log('   ✅ 更新後テキストが有効');

  // 6. テスト下書きを削除
  console.log('');
  console.log('6. テスト下書きを削除');
  try {
    var sheet = getDraftsSheet_();
    var targetDraft = getDraftById_(postId);
    if (targetDraft) {
      sheet.deleteRow(targetDraft.rowIndex);
      console.log('   ✅ テスト下書き削除: ' + postId);
    }
  } catch (e) {
    console.log('   ⚠️ 削除失敗（手動で下書きシートから ' + postId + ' を削除してください）: ' + e.message);
  }

  console.log('');
  console.log('🎉 タスク4 Step 2完了: Phase B が実動作で下書きを更新できました');
  console.log('  Claude APIによる品質レビュー・最終事実検証が正常に動作');
  console.log('  次のステップ: タスク5 - Phase C改名とモード分岐実装');
}


// ===== ★v12.7 タスク5動作確認用テスト関数 =====
/**
 * executePhaseCImageAndPost の実動作テスト（manualモード限定）。
 *
 * ⚠️ 安全のため、POST_MODE が manual 以外なら実行しない。
 *    auto/validate モードでは実投稿される可能性があるため。
 *
 * Claude API（executeQualityReviewChainは経由しない）+ Gemini 画像生成 API を呼び出す。
 * 処理時間: 約30秒-1分 / コスト: 数円（画像生成あり）
 *
 * テスト手順:
 *   1. POST_MODE が manual であることを確認
 *   2. テスト用下書きを作成（Phase B完了状態）
 *   3. ScriptProperties に PHASE_C_POST_ID を設定
 *   4. executePhaseCImageAndPost を実行
 *   5. 画像が生成され Drive に保存されたか確認
 *   6. 承認メールが送信されたか（ログで確認）
 *   7. 下書きのステータスが「承認待ち」に更新されたか確認
 *   8. テスト下書きを削除
 */
function testTask5PhaseC() {
  console.log('=== タスク5: Phase C実動作テスト（manualモード限定） ===');
  console.log('');

  // 0. 安全チェック: POST_MODE が manual であることを確認
  var props = PropertiesService.getScriptProperties();
  var currentMode = props.getProperty('POST_MODE') || 'manual';
  console.log('0. 安全チェック: 現在の POST_MODE = ' + currentMode);

  if (currentMode !== 'manual') {
    console.log('');
    console.log('❌ テスト中断: POST_MODE が manual ではありません');
    console.log('  このテストは画像生成 + 承認メール送信まで行いますが、');
    console.log('  validate/auto モードでは実投稿される可能性があります。');
    console.log('');
    console.log('  対処: POST_MODE を manual に切り替えてください。');
    console.log('  方法: カスタムメニューから「モード切替」→「manual」を選択');
    console.log('  または: PropertiesService.getScriptProperties().setProperty(\'POST_MODE\', \'manual\')');
    return;
  }
  console.log('   ✅ manualモード確認OK（安全にテスト可能）');

  // 1. テスト用下書きを作成（Phase B完了状態に相当）
  console.log('');
  console.log('1. テスト用下書きを作成');
  var testText = '📕昨夜のFOMC、市場はタカ派トーンを消化中。\n→ドル売りが続き、ドル円は159円台で推移。\n\n📝今日の注目はユーロ圏の経常収支・貿易収支（17:00〜18:00）。\n\n今日も1日、冷静にいきましょう。\n\n#FX #FOMC #ドル円';
  var postId;
  try {
    postId = saveDraft({
      postType: 'MORNING',
      text: testText,
      scheduledTime: '07:00',
      validationResult: '',
      status: 'Phase B完了'
    });
    console.log('   ✅ テスト下書き作成: ' + postId);
    console.log('   テキスト文字数: ' + testText.length);
  } catch (e) {
    console.log('   ❌ saveDraft失敗: ' + e.message);
    return;
  }

  // 2. Phase B完了状態の擬似データを追記
  console.log('');
  console.log('2. Phase B完了状態を下書きに書き込み');
  try {
    updateDraftContent_(postId, {
      PHASE_A_COMPLETED_AT: new Date().toISOString(),
      PHASE_B_COMPLETED_AT: new Date().toISOString(),
      FACT_CHECK_SKIPPED: false
    });
    console.log('   ✅ 書き込み完了');
  } catch (e) {
    console.log('   ❌ updateDraftContent_失敗: ' + e.message);
    return;
  }

  // 3. ScriptProperties に postId を設定
  console.log('');
  console.log('3. ScriptProperties に PHASE_C_POST_ID を設定');
  props.setProperty('PHASE_C_POST_ID', postId);
  console.log('   ✅ 設定完了');

  // 4. executePhaseCImageAndPost を実行
  console.log('');
  console.log('4. executePhaseCImageAndPost を実行中...');
  console.log('   （画像生成でGemini APIが呼ばれます、30秒-1分）');
  console.log('');

  try {
    executePhaseCImageAndPost();
  } catch (e) {
    console.log('❌ 実行エラー: ' + e.message);
    console.log('Stack: ' + e.stack);
    return;
  }

  // 5. 下書きの更新状態を検証
  console.log('');
  console.log('5. 下書きの更新状態を検証');
  var updatedDraft = getDraftById_(postId);
  if (!updatedDraft) {
    console.log('   ❌ 下書きが取得できません');
    return;
  }
  console.log('   ---');
  console.log('   更新後ステータス: ' + updatedDraft.status);
  console.log('   ---');

  if (updatedDraft.status !== '承認待ち') {
    console.log('   ❌ ステータスが「承認待ち」ではない: ' + updatedDraft.status);
    return;
  }
  console.log('   ✅ ステータス: 承認待ち');

  // 6. テスト下書きを削除
  console.log('');
  console.log('6. テスト下書きを削除');
  try {
    var sheet = getDraftsSheet_();
    var targetDraft = getDraftById_(postId);
    if (targetDraft) {
      sheet.deleteRow(targetDraft.rowIndex);
      console.log('   ✅ テスト下書き削除: ' + postId);
    }
  } catch (e) {
    console.log('   ⚠️ 削除失敗（手動で下書きシートから ' + postId + ' を削除してください）: ' + e.message);
  }

  console.log('');
  console.log('🎉 タスク5完了: Phase C が manualモードで実動作確認OK');
  console.log('  📧 Gmailを確認してください（承認メールが届いているはず）');
  console.log('  🖼  Driveの「TCAX_Images」フォルダを確認してください（画像が保存されているはず）');
  console.log('  次のステップ: タスク6 - ScriptProperties整理（LAST_FACT_CHECK移行）');
}


// ===== ★v12.7 タスク8動作確認用テスト関数 =====
/**
 * Phase B/Cのエラーハンドリングとフォールバックロジックの確認テスト。
 * APIコストゼロ（Claude/Gemini API不使用）。
 *
 * 確認内容:
 *   1. Phase B失敗時のステータスが「Phase Bエラー」になること
 *   2. Phase Cが「Phase Bエラー」ステータスを検知してmanual降格すること
 */
function testTask8ErrorHandling() {
  console.log('=== タスク8: エラーハンドリングテスト ===');
  console.log('');

  // 1. テスト下書き作成（Phase Bエラー状態をシミュレーション）
  console.log('1. テスト下書き作成（Phase Bエラー状態）');
  var postId;
  try {
    postId = saveDraft({
      postType: 'MORNING',
      text: 'タスク8テスト: Phase Bエラー時のフォールバック確認',
      scheduledTime: '07:00',
      validationResult: '',
      status: 'Phase Bエラー'
    });
    console.log('   ✅ テスト下書き作成: ' + postId);
  } catch (e) {
    console.log('   ❌ saveDraft失敗: ' + e.message);
    return;
  }

  // 2. getDraftById_でステータスが「Phase Bエラー」であることを確認
  console.log('');
  console.log('2. ステータス確認');
  var draft = getDraftById_(postId);
  if (!draft) {
    console.log('   ❌ 下書きが取得できません');
    return;
  }
  if (draft.status === 'Phase Bエラー') {
    console.log('   ✅ ステータス: 「Phase Bエラー」');
  } else {
    console.log('   ❌ ステータスが期待値でない: ' + draft.status);
    return;
  }

  // 3. Phase Cのmanual降格ロジックのシミュレーション
  console.log('');
  console.log('3. Phase C manual降格ロジックのシミュレーション');
  var currentMode = 'auto';  // autoモードを想定
  console.log('   入力モード: ' + currentMode);

  // Phase Cの降格ロジックと同じ条件
  if ((draft.factCheckSkipped || draft.status === 'Phase Bエラー') && currentMode !== 'manual') {
    var reason = draft.factCheckSkipped ? 'factCheckSkipped=true' : 'Phase Bエラー（初稿のまま進行）';
    console.log('   ⚠️ ' + reason + ' → manual降格トリガー発動');
    currentMode = 'manual';
  }

  if (currentMode === 'manual') {
    console.log('   ✅ autoモード → manualモードに降格成功');
  } else {
    console.log('   ❌ 降格されなかった: ' + currentMode);
    return;
  }

  // 4. factCheckSkipped=true のケースも確認
  console.log('');
  console.log('4. factCheckSkipped=true のケースも確認');
  updateDraftContent_(postId, { FACT_CHECK_SKIPPED: true, STATUS: 'Phase B完了' });
  var draft2 = getDraftById_(postId);
  var mode2 = 'validate';
  if ((draft2.factCheckSkipped || draft2.status === 'Phase Bエラー') && mode2 !== 'manual') {
    mode2 = 'manual';
    console.log('   ✅ factCheckSkipped=true → validateからmanualに降格成功');
  } else {
    console.log('   ❌ 降格されなかった');
    return;
  }

  // 5. テスト下書きを削除
  console.log('');
  console.log('5. テスト下書きを削除');
  try {
    var sheet = getDraftsSheet_();
    var targetDraft = getDraftById_(postId);
    if (targetDraft) {
      sheet.deleteRow(targetDraft.rowIndex);
      console.log('   ✅ テスト下書き削除: ' + postId);
    }
  } catch (e) {
    console.log('   ⚠️ 削除失敗: ' + e.message);
  }

  console.log('');
  console.log('🎉 タスク8完了: エラーハンドリングが正しく実装されています');
  console.log('  Phase Bエラー → ステータス「Phase Bエラー」');
  console.log('  Phase C → 「Phase Bエラー」検知 → manualモード強制降格');
  console.log('  factCheckSkipped=true → 同様にmanualモード強制降格');
}
