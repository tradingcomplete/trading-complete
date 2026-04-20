/**
 * =============================================================
 * ScriptProperties 設定 & クリーンアップ用スクリプト(使い捨て)
 * =============================================================
 *
 * 目的:
 *   1. DISABLE_FACTCHECK = true を設定（診断書 水準1-1 有効化）
 *   2. 古い IMG_* プロパティを削除して 50個以下にし、UI編集可能な状態に戻す
 *
 * 使い方(GASエディタから):
 *   1. このコードを新規ファイル setupDisableFactCheck.gs として貼り付け
 *   2. 関数 checkPropertyStatus を実行 → 現状確認
 *   3. 関数 setupDisableFactCheck を実行 → DISABLE_FACTCHECK 追加
 *   4. 関数 cleanOldImageMeta を実行 → 古い IMG_* を削除（確認後）
 *   5. 必要な設定が全て完了したら、このファイルは削除してよい
 *
 * 作成日: 2026-04-18
 * 用途: 診断書 水準1-1 の ScriptProperties 設定補助
 * =============================================================
 */


// ========================================
// STEP 1: 現状確認
// ========================================

/**
 * 現在の ScriptProperties の状態を確認する(読み取り専用・安全)
 * 
 * 確認項目:
 *   - 全プロパティ数
 *   - DISABLE_FACTCHECK の現在値
 *   - SKIP_FACT_CHECK の有無(あれば要注意)
 *   - IMG_* の件数(50個超過で UI編集不可)
 *   - IMG_* 以外のシステムプロパティ
 */
function checkPropertyStatus() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var keys = Object.keys(all);

  console.log('========================================');
  console.log('📊 ScriptProperties 現状チェック');
  console.log('========================================');
  console.log('総プロパティ数: ' + keys.length + '件');
  console.log('');

  // ===== 重要フラグの確認 =====
  console.log('--- 重要フラグ ---');
  console.log('DISABLE_FACTCHECK: ' + (all['DISABLE_FACTCHECK'] || '(未設定)'));
  console.log('SKIP_FACT_CHECK: ' + (all['SKIP_FACT_CHECK'] || '(未設定・OK)'));
  console.log('INTERACTIVE_VERIFY_ENABLED: ' + (all['INTERACTIVE_VERIFY_ENABLED'] || '(未設定・デフォルト=true)'));
  console.log('POST_MODE: ' + (all['POST_MODE'] || '(未設定・デフォルト=manual)'));
  console.log('');

  // ===== IMG_ プロパティの統計 =====
  var imgKeys = keys.filter(function(k) { return k.indexOf('IMG_') === 0; });
  console.log('--- IMG_* プロパティ統計 ---');
  console.log('IMG_* 件数: ' + imgKeys.length + '件');
  if (imgKeys.length > 0) {
    imgKeys.sort();
    console.log('最古: ' + imgKeys[0]);
    console.log('最新: ' + imgKeys[imgKeys.length - 1]);
  }
  console.log('');

  // ===== IMG_ 以外のシステムプロパティ一覧 =====
  var systemKeys = keys.filter(function(k) { return k.indexOf('IMG_') !== 0; });
  systemKeys.sort();
  console.log('--- IMG_以外のプロパティ(' + systemKeys.length + '件) ---');
  for (var i = 0; i < systemKeys.length; i++) {
    var val = all[systemKeys[i]] || '';
    var displayVal = val.length > 60 ? val.substring(0, 60) + '...(' + val.length + '文字)' : val;
    console.log('  ' + systemKeys[i] + ' = ' + displayVal);
  }
  console.log('');

  // ===== UI編集可能性 =====
  console.log('--- UI編集可能性 ---');
  if (keys.length > 50) {
    console.log('❌ 50件超過: GAS UI からの追加・編集ができない状態');
    console.log('   → cleanOldImageMeta を実行して 50件以下にするか、');
    console.log('   → setupDisableFactCheck でコード経由で設定する');
  } else {
    console.log('✅ 50件以下: GAS UI から追加・編集可能');
  }
  console.log('========================================');
}


// ========================================
// STEP 2: DISABLE_FACTCHECK を設定
// ========================================

/**
 * DISABLE_FACTCHECK = true を設定する(診断書 水準1-1)
 * 
 * 効果:
 *   - factCheckPost_ と autoFixPost_ が Phase A で呼ばれなくなる
 *   - Claude品質レビュー + 最終事実検証 + 対話型検証 の3段構成で品質保証
 *   - Claude API 回数: 10-12回/投稿 → 8-10回/投稿
 *
 * ロールバック方法:
 *   rollbackDisableFactCheck() を実行すれば 'false' に戻せる
 */
function setupDisableFactCheck() {
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperty('DISABLE_FACTCHECK');

  console.log('========================================');
  console.log('🔧 DISABLE_FACTCHECK 設定');
  console.log('========================================');
  console.log('変更前: ' + (current || '(未設定)'));

  props.setProperty('DISABLE_FACTCHECK', 'true');

  var after = props.getProperty('DISABLE_FACTCHECK');
  console.log('変更後: ' + after);
  console.log('');
  console.log('✅ 診断書 水準1-1 が有効化されました');
  console.log('   次の投稿から Gemini factCheck はスキップされ、');
  console.log('   Claude品質レビュー + 最終事実検証 + 対話型検証 で品質保証します');
  console.log('========================================');
}


/**
 * DISABLE_FACTCHECK をロールバック(factCheck を再有効化)
 * 
 * 使用シーン:
 *   - 水準1-1 で問題が発生した場合の緊急復旧
 */
function rollbackDisableFactCheck() {
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperty('DISABLE_FACTCHECK');

  console.log('========================================');
  console.log('⏪ DISABLE_FACTCHECK ロールバック');
  console.log('========================================');
  console.log('変更前: ' + (current || '(未設定)'));

  props.setProperty('DISABLE_FACTCHECK', 'false');

  console.log('変更後: false');
  console.log('✅ factCheck が再有効化されました(次の投稿から)');
  console.log('========================================');
}


// ========================================
// STEP 3: 古い IMG_* を削除
// ========================================

/**
 * 古い IMG_* プロパティを一括削除する
 * 
 * 判定基準:
 *   - 日付が14日前より古い IMG_* は削除対象
 *   - キー形式: IMG_YYYYMMDD_HHMMSS_TYPE
 * 
 * 安全性:
 *   - 画像ファイル本体(Google Drive)は削除されない
 *   - 削除されるのは ScriptProperties 内のメタデータだけ
 *   - 過去の投稿(既にX公開済み)は影響を受けない
 *   - 新規投稿は全く影響なし
 * 
 * 実行前に checkPropertyStatus で件数を確認することを推奨
 */
function cleanOldImageMeta() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var keys = Object.keys(all);

  // 14日前の日付(YYYYMMDD形式)
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);
  var cutoffStr = Utilities.formatDate(cutoffDate, 'Asia/Tokyo', 'yyyyMMdd');

  console.log('========================================');
  console.log('🧹 古い IMG_* プロパティの削除');
  console.log('========================================');
  console.log('削除基準: ' + cutoffStr + ' より古い IMG_* を削除');
  console.log('');

  var imgKeys = keys.filter(function(k) { return k.indexOf('IMG_') === 0; });
  console.log('IMG_* 総数: ' + imgKeys.length + '件');

  var deletedCount = 0;
  var keptCount = 0;
  var invalidCount = 0;

  for (var i = 0; i < imgKeys.length; i++) {
    var key = imgKeys[i];
    // キー形式: IMG_YYYYMMDD_HHMMSS_TYPE → 日付部分を抽出
    var match = key.match(/^IMG_(\d{8})_/);
    if (!match) {
      invalidCount++;
      console.log('  ⚠️ 形式不正(保持): ' + key);
      continue;
    }
    var keyDate = match[1];
    if (keyDate < cutoffStr) {
      props.deleteProperty(key);
      deletedCount++;
      if (deletedCount <= 5) {
        console.log('  🗑️ 削除: ' + key);
      }
    } else {
      keptCount++;
    }
  }

  if (deletedCount > 5) {
    console.log('  ... 他 ' + (deletedCount - 5) + ' 件削除');
  }

  console.log('');
  console.log('--- 削除結果 ---');
  console.log('削除: ' + deletedCount + '件');
  console.log('保持(' + cutoffStr + '以降): ' + keptCount + '件');
  console.log('保持(形式不正): ' + invalidCount + '件');
  console.log('');
  console.log('削除後の総プロパティ数: ' + Object.keys(props.getProperties()).length + '件');
  console.log('========================================');
}


// ========================================
// STEP 4: 一括実行(全て自動)
// ========================================

/**
 * 全ての設定を一度に実行する
 * 
 * 実行内容:
 *   1. checkPropertyStatus: 現状確認
 *   2. cleanOldImageMeta: 古い IMG_* を削除
 *   3. setupDisableFactCheck: DISABLE_FACTCHECK 設定
 *   4. checkPropertyStatus: 設定後確認
 * 
 * 推奨: 初回は各関数を個別に実行して状況を確認してから、この一括実行を使う
 */
function setupAllAtOnce() {
  console.log('##### 一括セットアップ開始 #####\n');
  
  checkPropertyStatus();
  console.log('');
  
  cleanOldImageMeta();
  console.log('');
  
  setupDisableFactCheck();
  console.log('');
  
  checkPropertyStatus();
  console.log('\n##### 一括セットアップ完了 #####');
}
