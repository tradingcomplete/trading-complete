/**
 * =============================================================
 * USE_V13_VALIDATION 設定補助スクリプト(使い捨て)
 * =============================================================
 *
 * 目的:
 *   ScriptProperties UI が 50個超過で編集不可のため、GAS関数経由で
 *   USE_V13_VALIDATION フラグを設定する。
 *
 * 使い方(GASエディタから):
 *   1. このコードを新規ファイル setupUseV13Validation.gs として追加
 *   2. checkV13Status を実行 → 現状確認
 *   3. setUseV13ValidationTrue を実行 → v13.0 ON
 *   4. 問題があれば setUseV13ValidationFalse を実行 → v12.10 復帰
 *   5. Phase 4(並行稼働)完了後、このファイルは削除してよい
 *
 * 作成日: 2026-04-19
 * 用途: v13.0 検証統廃合 Phase 3 フラグ切替
 * =============================================================
 */


/**
 * 現在の v13.0 関連フラグ状態を確認(読み取り専用・安全)
 */
function checkV13Status() {
  var props = PropertiesService.getScriptProperties();

  console.log('========================================');
  console.log('📊 v13.0 フラグ状態チェック');
  console.log('========================================');

  var useV13 = props.getProperty('USE_V13_VALIDATION');
  console.log('USE_V13_VALIDATION: ' + (useV13 === null ? '(未設定・v12.10動作)' : useV13));

  console.log('');
  console.log('--- 関連フラグ ---');
  console.log('DISABLE_FACTCHECK: ' + (props.getProperty('DISABLE_FACTCHECK') || '(未設定)'));
  console.log('INTERACTIVE_VERIFY_ENABLED: ' + (props.getProperty('INTERACTIVE_VERIFY_ENABLED') || '(未設定・デフォルトtrue)'));
  console.log('POST_MODE: ' + (props.getProperty('POST_MODE') || '(未設定・デフォルトmanual)'));
  console.log('SKIP_FACT_CHECK: ' + (props.getProperty('SKIP_FACT_CHECK') || '(未設定・OK)'));

  console.log('');
  console.log('--- 関数定義チェック ---');
  console.log('executeValidationV13_: ' + (typeof executeValidationV13_ === 'function' ? '✅ 定義済み' : '❌ 未定義(validationV13.gs 未追加?)'));
  console.log('executeQualityReviewChain_: ' + (typeof executeQualityReviewChain_ === 'function' ? '✅ 定義済み' : '❌ 未定義'));
  console.log('');

  if (useV13 === 'true') {
    console.log('▶️ 現状: v13.0 新検証フローで動作');
  } else {
    console.log('▶️ 現状: v12.10 従来検証フローで動作');
  }
  console.log('========================================');
}


/**
 * USE_V13_VALIDATION = true に設定(v13.0 有効化)
 */
function setUseV13ValidationTrue() {
  var props = PropertiesService.getScriptProperties();

  // 前提: validationV13.gs が追加済みかチェック
  if (typeof executeValidationV13_ !== 'function') {
    console.log('❌ executeValidationV13_ が未定義です。validationV13.gs を先にGASに追加してください。');
    console.log('   フラグは設定しませんでした(安全のため)。');
    return;
  }

  props.setProperty('USE_V13_VALIDATION', 'true');
  console.log('✅ USE_V13_VALIDATION = true に設定しました');
  console.log('▶️ 次回の generatePost 以降、v13.0 新検証フローが動作します');
  console.log('▶️ ロールバックは setUseV13ValidationFalse を実行');
  console.log('');

  // 設定後の状態確認
  checkV13Status();
}


/**
 * USE_V13_VALIDATION = false に設定(v12.10 復帰・緊急ロールバック用)
 */
function setUseV13ValidationFalse() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('USE_V13_VALIDATION', 'false');
  console.log('✅ USE_V13_VALIDATION = false に設定しました');
  console.log('▶️ 次回の generatePost 以降、v12.10 従来フローで動作します');
  console.log('');

  checkV13Status();
}


/**
 * USE_V13_VALIDATION プロパティを削除(未設定状態に戻す)
 * false と同じ動作(v12.10 従来フロー)になる
 */
function deleteUseV13Validation() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('USE_V13_VALIDATION');
  console.log('✅ USE_V13_VALIDATION を削除しました(未設定状態・v12.10 動作)');
  console.log('');

  checkV13Status();
}
