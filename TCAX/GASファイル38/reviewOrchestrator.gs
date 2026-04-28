/**
 * CompanaFXAutoPost - reviewOrchestrator.gs
 * 品質レビューチェーンの調停(v12.10 従来フロー + v13.0 統合フローへの分岐)
 *
 * 提供する関数:
 *   - executeQualityReviewChain_: Phase B 用品質レビューチェーン(v12.10 フロー)
 *     - v13.0 フラグが立っていれば validationV13.gs へ処理委譲
 *   - executeRetry_: リトライ共通処理
 *   - countEmojis_: 絵文字カウント
 *   - checkMultiArrowBlocks_: →複数ブロック検出
 *   - testTask3QualityReviewChainExists: executeQualityReviewChain_ 動作確認テスト
 *
 * 履歴:
 *   v8.6: qualityReviewPost_ 導入
 *   v8.8.1: executeRetry_ でリトライ共通化
 *   v12.7 Phase 3分割: executeQualityReviewChain_ を Phase B 用に新設
 *   v13.0 並行稼働(2026-04-19): validationV13.gs への処理委譲分岐を追加
 *   v14.0 Phase R-1(2026-04-23): geminiApi.gs から独立ファイルへ分離
 */


// ===== ★v12.7 Phase 3分割: Phase B用品質レビューチェーン =====
/**
 * ★v12.7 Phase 3分割: Phase A後のテキストを受け取り、修正処理チェーンを実行
 *
 * この関数は generatePost() 内の [修正フェーズ] を切り出したもので、
 * タスク3時点では誰からも呼ばれない（並行実装）。
 * タスク4で executePhaseBQualityReview から呼ばれるようになる。
 *
 * 処理フロー:
 *   1. factResult に基づく修正
 *      - 検証不能（removable）: forceRemoveIssueLines_ で強制削除
 *      - 修正可能（fixable）: autoFixPost_ + verifyAutoFix_ でリトライ
 *      - 修正後に applyPostProcessingChain_ で再後処理
 *   2. 品質レビュー（qualityReviewPost_ Claude Q1-Q7）
 *      - 問題あれば修正版テキストで上書き + 後処理
 *   3. 最終事実検証（finalFactVerify_ Claude JSON検出+コード置換）
 *      - 問題あれば修正版テキストで上書き + 後処理
 *
 * @param {string} cleanedText - Phase A完了時点のテキスト
 * @param {Object} factResult - Phase Aで実行した factCheckPost_ の結果
 * @param {string} postType - 投稿タイプ (MORNING, INDICATOR, 等)
 * @param {Object} rates - レートオブジェクト
 * @param {Object} keys - APIキー群 (GEMINI_API_KEY, CLAUDE_API_KEY, SPREADSHEET_ID)
 * @param {Array|null} csForFactCheck - 通貨強弱ランキング（方向チェック用）
 * @param {Date} startTime - 生成開始時刻（時間制限判定用）
 * @param {number} TIME_LIMIT_SEC - 時間制限（秒）
 *
 * @return {Object} { text, fixLog, wasFixed, originalBeforeFix }
 *   - text: 修正後の最終テキスト
 *   - fixLog: 修正履歴（承認メール表示用）
 *   - wasFixed: 何らかの修正があったか
 *   - originalBeforeFix: 修正前の元テキスト（本文のみ、ハッシュタグ除く）
 */
function executeQualityReviewChain_(cleanedText, factResult, postType, rates, keys, csForFactCheck, startTime, TIME_LIMIT_SEC) {
  // ========================================
  // ★v13.0 並行稼働フラグ(2026-04-19追加)
  // USE_V13_VALIDATION=true の場合、validationV13.gs の新検証フローを呼ぶ。
  // false/未設定の場合は従来 v12.10 ロジックが動く(完全後方互換)。
  // validationV13.gs 未追加の環境でも typeof チェックで安全にフォールバック。
  // ========================================
  var useV13 = PropertiesService.getScriptProperties().getProperty('USE_V13_VALIDATION') === 'true';
  if (useV13 && typeof executeValidationV13_ === 'function') {
    console.log('🚀 USE_V13_VALIDATION=true → validationV13.gs へ処理委譲');
    try {
      return executeValidationV13_(cleanedText, factResult, postType, rates, keys, csForFactCheck, startTime, TIME_LIMIT_SEC);
    } catch (v13Err) {
      console.log('❌ v13.0 例外発生 → v12.10 従来フローへフォールバック: ' + v13Err.message);
      // フォールバック: 以下の従来ロジックが走る
    }
  } else if (useV13 && typeof executeValidationV13_ !== 'function') {
    console.log('⚠️ USE_V13_VALIDATION=true だが executeValidationV13_ 未定義 → v12.10従来フローへフォールバック');
  }

  var fixLog = '';
  var originalBeforeFix = cleanedText;
  var wasFixed = false;

  // テスト一括実行時は修正処理を全スキップ（GAS 6分制限対策）
  var skipFactCheck = PropertiesService.getScriptProperties().getProperty('SKIP_FACT_CHECK') === 'true';
  if (skipFactCheck) {
    console.log('⚠️ SKIP_FACT_CHECK=true → executeQualityReviewChain_ 全処理スキップ');
    return { text: cleanedText, fixLog: fixLog, wasFixed: false, originalBeforeFix: originalBeforeFix };
  }
  
  // ★v12.10: DISABLE_FACTCHECK 状態のログ（診断書 水準1-1）
  var disableFactCheck = PropertiesService.getScriptProperties().getProperty('DISABLE_FACTCHECK') !== 'false';
  if (disableFactCheck && factResult && factResult.passed) {
    console.log('ℹ️ factCheck 無効化中 → Step 1 (factCheckベース修正) は自動スキップ');
  }

  // ===== Step 1: factResult に基づく修正（removable削除 + fixable修正） =====
  if (!factResult.passed && factResult.issues && factResult.issues.length > 0) {
    var fixableIssues = [];
    var removableIssues = [];
    for (var fi = 0; fi < factResult.issues.length; fi++) {
      if (factResult.issues[fi].removable) {
        removableIssues.push(factResult.issues[fi]);
      } else {
        fixableIssues.push(factResult.issues[fi]);
      }
    }

    // Step 1a: 検証不能な記述は即削除（機械的処理）
    if (removableIssues.length > 0) {
      cleanedText = forceRemoveIssueLines_(cleanedText, removableIssues);
      fixLog += '【検証不能→削除 ' + removableIssues.length + '件】\n';
      for (var rmi = 0; rmi < removableIssues.length; rmi++) {
        fixLog += '  🗑️ ' + (removableIssues[rmi].claim || '').substring(0, 50) + '\n';
      }
      console.log('🗑️ 検証不能な記述を' + removableIssues.length + '件削除');
    }

    // Step 1b: 修正可能な❌はautoFixPost_に渡す
    if (fixableIssues.length > 0) {
      var fixResult = autoFixPost_(cleanedText, fixableIssues, postType, keys.GEMINI_API_KEY, rates, csForFactCheck);

      // ★v8.0: 自動修正後に問題の表現がまだ残っていないか検証+リトライ
      if (fixResult.fixed) {
        var remainingIssues = verifyAutoFix_(fixResult.text, fixableIssues);
        if (remainingIssues.length > 0) {
          console.log('⚠️ 自動修正後も' + remainingIssues.length + '件の問題が残存 → リトライ');
          for (var ri = 0; ri < remainingIssues.length; ri++) {
            console.log('  残存: ' + remainingIssues[ri].claim);
          }
          var retryFixResult = autoFixPost_(fixResult.text, remainingIssues, postType, keys.GEMINI_API_KEY, rates, csForFactCheck);
          if (retryFixResult.fixed) {
            var stillRemaining = verifyAutoFix_(retryFixResult.text, remainingIssues);
            if (stillRemaining.length > 0) {
              console.log('⚠️ リトライ後も' + stillRemaining.length + '件残存（強制削除で対応）');
              var forcedText = forceRemoveIssueLines_(retryFixResult.text, stillRemaining);
              fixResult = { text: forcedText, fixed: true, fixLog: retryFixResult.fixLog + '\n⚠️ 残存問題を強制削除' };
            } else {
              console.log('✅ リトライで全件修正完了');
              fixResult = retryFixResult;
            }
          }
        }
      }

      if (fixResult.fixed) {
        cleanedText = fixResult.text;
        fixLog += fixResult.fixLog;
      }
    }

    // 修正・削除があった場合、再度後処理を適用
    if (removableIssues.length > 0 || fixableIssues.length > 0) {
      cleanedText = applyPostProcessingChain_(cleanedText, postType, rates);
      wasFixed = true;
      console.log('✅ ファクトチェック→修正/削除→後処理 完了');
    }
  }

  // ===== Step 2: 品質レビュー（Claude API - クロスチェック） =====
  var typeConfig = POST_TYPES[postType] || {};
  var qualityResult = qualityReviewPost_(cleanedText, postType, typeConfig, rates, csForFactCheck);

  if (!qualityResult.passed && qualityResult.revisedText) {
    // 品質修正後に後処理チェーンを再適用
    cleanedText = applyPostProcessingChain_(qualityResult.revisedText, postType, rates);

    // fixLogに品質レビュー結果を追記
    fixLog += '【品質レビュー（Claude）】\n';
    for (var qi = 0; qi < qualityResult.issues.length; qi++) {
      fixLog += '  ' + qualityResult.issues[qi].id + ': ' + qualityResult.issues[qi].problem + '\n';
    }
    wasFixed = true;
    console.log('✅ 品質レビュー（Claude）→修正→後処理 完了');
  }

  // 今日の投稿キャッシュに保存（次の投稿の重複チェック用）
  cacheTodayPost_(postType, cleanedText);

  // ===== Step 3: 最終事実検証（★v12.6: 事実だけに集中した専用チェック+修正） =====
  // 品質レビュー（Q1-Q7同時）は注意が分散し、事実誤りを見逃すことがある。
  // 全処理が終わった最終テキストに対して「事実だけ」を検証し、問題があれば修正する。
  var elapsedBeforeFinal = (new Date() - startTime) / 1000;
  if (elapsedBeforeFinal < TIME_LIMIT_SEC - 30) {
    var finalResult = finalFactVerify_(cleanedText, postType, rates, keys);
    if (finalResult && finalResult !== cleanedText) {
      cleanedText = applyPostProcessingChain_(finalResult, postType, rates);
      fixLog += '【最終事実検証（Claude）】修正あり\n';
      wasFixed = true;
      console.log('✅ 最終事実検証 → 修正 → 後処理 完了');
      // キャッシュも更新
      cacheTodayPost_(postType, cleanedText);
    }
  } else {
    console.log('⏱️ 経過' + Math.round(elapsedBeforeFinal) + '秒 → 最終事実検証をスキップ（時間制限）');
  }

  // ===== ★v12.7 タスク17-19: Step 4 - 対話型検証（投稿本文から検証質問を抽出→Web検証→修正） =====
  // 既存の3段検証(factCheck/qualityReview/finalFactVerify)はチェックリスト型。
  // 対話型検証は投稿本文から独自に検証質問を抽出し、既存検証で見逃される
  // 「継続事象への時制付き言及」「要人発言の捏造」等を補完検出する。
  //
  // 有効化制御: ScriptProperties 'INTERACTIVE_VERIFY_ENABLED' = 'true' の場合のみ実行
  //   デフォルト(未設定): 有効(true相当)
  //   緊急ロールバック: 'false' に設定すれば即座に無効化
  //
  // 時間制限: 最終検証完了後、残り180秒以上ある場合のみ実行
  var interactiveVerifyEnabled = PropertiesService.getScriptProperties().getProperty('INTERACTIVE_VERIFY_ENABLED');
  var shouldRunInteractive = (interactiveVerifyEnabled !== 'false'); // デフォルト有効
  var elapsedBeforeInteractive = (new Date() - startTime) / 1000;

  if (shouldRunInteractive && elapsedBeforeInteractive < TIME_LIMIT_SEC - 180) {
    if (typeof executeInteractiveVerify_ === 'function') {
      try {
        var verifyResult = executeInteractiveVerify_(cleanedText, postType, rates, keys);
        if (verifyResult && verifyResult.fixApplied && verifyResult.fixedText && verifyResult.fixedText !== cleanedText) {
          cleanedText = applyPostProcessingChain_(verifyResult.fixedText, postType, rates);
          fixLog += '【対話型検証（Claude+Web検索）】❌' + verifyResult.ngCount +
                    '件/⚠️' + verifyResult.warnCount + '件 → 修正あり\n';
          wasFixed = true;
          console.log('✅ 対話型検証 → 修正 → 後処理 完了');
          // キャッシュも更新
          cacheTodayPost_(postType, cleanedText);
        } else if (verifyResult && verifyResult.extractedCount === 0) {
          console.log('ℹ️ 対話型検証: 検証対象のclaim抽出ゼロ(相場観・感想のみ)');
        } else if (verifyResult && !verifyResult.fixApplied) {
          console.log('ℹ️ 対話型検証: 問題検出されず(全claim ✅ 判定)');
        }
      } catch (interactiveErr) {
        console.log('⚠️ 対話型検証エラー（投稿には影響なし、既存フローで継続）: ' + interactiveErr.message);
      }
    } else {
      console.log('ℹ️ executeInteractiveVerify_ 未定義 → 対話型検証スキップ(interactiveVerify.gs未更新)');
    }
  } else if (!shouldRunInteractive) {
    console.log('ℹ️ INTERACTIVE_VERIFY_ENABLED=false → 対話型検証スキップ(手動無効化)');
  } else {
    console.log('⏱️ 経過' + Math.round(elapsedBeforeInteractive) + '秒 → 対話型検証をスキップ（時間制限）');
  }

  return {
    text: cleanedText,
    fixLog: fixLog,
    wasFixed: wasFixed,
    originalBeforeFix: originalBeforeFix
  };
}


// ===== リトライ共通処理 =====
/**
 * ★v8.8.1: 4つのリトライパターン（主役ペア/リスクセンチメント/絵文字/→ブロック）を共通化
 * ★v12.5: Gemini→Claude化。メイン生成と同じモデルでリトライし、口調・フォーマットの一貫性を確保
 * 
 * 処理フロー: 経過時間チェック → Claude API呼び出し → 後処理チェーン → TC言及除去 → 検証
 * 
 * @param {Object} config - リトライ固有の設定
 * @param {string} config.name - リトライ名（ログ表示用）
 * @param {string} config.prompt - Claudeに渡すリトライプロンプト
 * @param {boolean} config.useGrounding - （★v12.5で無効。後方互換のため残存）
 * @param {boolean} config.applyTCRemoval - TC言及除去を適用するか
 * @param {Function} config.verifyFn - 検証関数（retryText => boolean: trueで修正成功）
 * @param {Object} base - generatePostから引き継ぐ共通パラメータ
 * @param {string} base.postType - 投稿タイプ
 * @param {Object} base.rates - レートデータ
 * @param {Date} base.startTime - generatePost開始時刻
 * @param {number} base.timeLimitSec - 時間制限（秒）
 * @param {Array} base.tcAllowedInPost - TC言及許可タイプリスト
 * @return {string|null} 成功時は修正テキスト、失敗・スキップ時はnull
 */
function executeRetry_(config, base) {
  // 経過時間チェック（★v8.8 タイムガード）
  var elapsed = (new Date() - base.startTime) / 1000;
  if (elapsed > base.timeLimitSec) {
    console.log('⏱️ 経過' + Math.round(elapsed) + '秒 → ' + config.name + 'リトライをスキップ（時間制限）');
    return null;
  }
  
  // ★v12.5: Claude API呼び出し（Geminiから変更。メイン生成と同じモデルで一貫性確保）
  var retryResult = callClaudeGenerate_(config.prompt, getApiKeys());
  if (!retryResult || !retryResult.text) return null;
  
  // 後処理チェーン適用
  var retryText = applyPostProcessingChain_(retryResult.text, base.postType, base.rates);
  
  // TC言及除去（主役ペア・リスクセンチメントのリトライで必要）
  if (config.applyTCRemoval && base.tcAllowedInPost.indexOf(base.postType) === -1) {
    retryText = removeTCMention_(retryText);
  }
  
  // 検証（呼び出し元が定義した判定ロジック）
  if (config.verifyFn(retryText)) {
    console.log('✅ ' + config.name + '修正成功');
    return retryText;
  } else {
    console.log('⚠️ ' + config.name + '修正失敗。元テキストを使用');
    return null;
  }
}


// ===== 絵文字カウント =====
/**
 * ★v8.8.1: 絵文字バリデーション用カウント関数を分離
 * サロゲートペア対応: indexOf で各絵文字の出現回数をカウント
 * 
 * @param {string} text - カウント対象テキスト
 * @param {Array} emojiList - 絵文字のユニコード配列
 * @return {number} 絵文字の出現回数
 */
function countEmojis_(text, emojiList) {
  var count = 0;
  for (var i = 0; i < emojiList.length; i++) {
    var searchIdx = 0;
    while ((searchIdx = text.indexOf(emojiList[i], searchIdx)) !== -1) {
      count++;
      searchIdx += emojiList[i].length;
    }
  }
  return count;
}


// ===== →複数ブロック検出 =====
/**
 * ★v8.8.1: →ブロックバリデーション用検出関数を分離
 * 空行で分割してブロックを取得し、→の数をカウント
 * 
 * @param {string} text - 検出対象テキスト（ハッシュタグ前の本文）
 * @return {boolean} →が2本以上のブロックが存在するか
 */
function checkMultiArrowBlocks_(text) {
  var blocks = text.split(/\n\n+/);
  for (var i = 0; i < blocks.length; i++) {
    if ((blocks[i].match(/^→/gm) || []).length >= 2) {
      return true;
    }
  }
  return false;
}


// ===== ★v12.7 タスク3動作確認用テスト関数 =====
/**
 * executeQualityReviewChain_ 関数が正しく定義され、基本動作するかを検証。
 * GASエディタのプルダウンから実行してください。
 *
 * タスク3では関数の存在確認と、SKIP_FACT_CHECK=true時の即return動作のみ検証。
 * 実際の修正処理のテストはタスク4（Phase B新設）以降で行う。
 */
function testTask3QualityReviewChainExists() {
  console.log('=== タスク3: executeQualityReviewChain_ 関数存在確認テスト ===');
  console.log('');

  // 1. 関数が存在するか
  console.log('1. 関数定義の確認');
  if (typeof executeQualityReviewChain_ !== 'function') {
    console.log('❌ executeQualityReviewChain_ 関数が見つかりません');
    return;
  }
  console.log('   ✅ executeQualityReviewChain_ 関数が定義されています');

  // 2. SKIP_FACT_CHECK=true で呼び出してスルーすることを確認
  console.log('');
  console.log('2. スキップモード動作確認（SKIP_FACT_CHECK=true）');
  var props = PropertiesService.getScriptProperties();
  var originalSkip = props.getProperty('SKIP_FACT_CHECK');
  props.setProperty('SKIP_FACT_CHECK', 'true');

  try {
    var dummyFactResult = { passed: true, summary: 'スキップ', details: '', issues: [] };
    var dummyText = 'テスト投稿本文';
    var result = executeQualityReviewChain_(
      dummyText,
      dummyFactResult,
      'MORNING',
      {},  // rates
      { GEMINI_API_KEY: '', CLAUDE_API_KEY: '', SPREADSHEET_ID: '' },  // keys
      null,  // csForFactCheck
      new Date(),  // startTime
      300  // TIME_LIMIT_SEC
    );

    if (result.text === dummyText) {
      console.log('   ✅ テキストは変更されていない');
    } else {
      console.log('   ❌ テキストが変更されている（スキップモードのはず）');
      return;
    }
    if (result.wasFixed === false) {
      console.log('   ✅ wasFixed=false');
    } else {
      console.log('   ❌ wasFixed=' + result.wasFixed + '（falseのはず）');
      return;
    }
    if (result.fixLog === '') {
      console.log('   ✅ fixLog=空文字');
    } else {
      console.log('   ❌ fixLog="' + result.fixLog + '"（空のはず）');
      return;
    }
    if (result.originalBeforeFix === dummyText) {
      console.log('   ✅ originalBeforeFixは入力テキストと一致');
    } else {
      console.log('   ❌ originalBeforeFix不一致');
      return;
    }
  } catch (e) {
    console.log('   ❌ エラー: ' + e.message);
    console.log('   Stack: ' + e.stack);
    return;
  } finally {
    // スキップフラグを元の状態に戻す
    if (originalSkip) {
      props.setProperty('SKIP_FACT_CHECK', originalSkip);
    } else {
      props.deleteProperty('SKIP_FACT_CHECK');
    }
  }

  // 3. 戻り値のオブジェクト構造確認
  console.log('');
  console.log('3. 戻り値のフィールド構造確認');
  console.log('   期待フィールド: text, fixLog, wasFixed, originalBeforeFix');
  console.log('   ✅ 全フィールドが存在');

  console.log('');
  console.log('🎉 タスク3完了: executeQualityReviewChain_ 関数が正常に定義されています');
  console.log('  （タスク4で Phase B 新設時に呼ばれるようになります）');
  console.log('  （generatePost() の既存処理は一切変更されていないため、本番運用に影響なし）');
}

