/**
 * CompanaFXAutoPost - sheetsManager.gs
 * Google Sheets への読み書き
 * 
 * シート1「投稿履歴」: A:日時 B:曜日 C:投稿番号 D:タイプ名
 *   E:投稿テキスト F:画像有無 G:使用アーキタイプ
 *   H:仮説 I:学び J:ツイートID K:ステータス L:エラーログ
 * 
 * シート2「心得テーマ」: A:ID B:カテゴリ C:テーマ名 D:キーメッセージ
 *   E:TC導線パターン F:最終使用日 G:使用回数
 * 
 * ★ Phase 3.5 追加:
 * シート3「キャラクター」: A:セクション B:内容
 * シート4「下書き」: A:投稿ID B:生成日時 C:投稿予定時刻 D:投稿タイプ
 *   E:生成テキスト F:バリデーション結果 G:ステータス H:承認日時
 * 
 * ★ v5.5.2: 仮説・学びの投稿履歴書き込み + 検証結果更新
 */


// ===== スプレッドシート取得 =====
function getSpreadsheet_() {
  var keys = getApiKeys();
  return SpreadsheetApp.openById(keys.SPREADSHEET_ID);
}


// ===== シート取得（なければ作成） =====
function getOrCreateSheet_(sheetName, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    console.log('シート「' + sheetName + '」を作成しました');
  }

  return sheet;
}


// ===== 投稿履歴シートを取得 =====
function getHistorySheet_() {
  var headers = [
    '日時', '曜日', '投稿番号', 'タイプ名',
    '投稿テキスト', '画像有無', '使用アーキタイプ',
    '仮説', '学び', 'ツイートID', 'ステータス', 'エラーログ'
  ];
  return getOrCreateSheet_(SHEET_NAMES.HISTORY, headers);
}


// ===== 心得テーマシートを取得 =====
function getThemesSheet_() {
  var headers = [
    'ID', 'カテゴリ', 'テーマ名', 'キーメッセージ',
    'TC導線パターン', '最終使用日', '使用回数'
  ];
  return getOrCreateSheet_(SHEET_NAMES.THEMES, headers);
}


// ===== 投稿を保存 =====
function savePost(postData) {
  var sheet = getHistorySheet_();
  var now = new Date();
  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  var row = [
    Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
    dayNames[now.getDay()],
    postData.postNumber || '',
    postData.typeName || '',
    postData.text || '',
    postData.hasImage ? 'あり' : 'なし',
    postData.archetype || '',
    postData.hypothesis || '',
    postData.learning || '',
    postData.tweetId || '',
    postData.status || '成功',
    postData.errorLog || ''
  ];

  sheet.appendRow(row);
  console.log('✅ 投稿履歴を保存しました');
  return true;
}


// ===== エラーを記録 =====
function logError(postType, errorMessage) {
  var sheet = getHistorySheet_();
  var now = new Date();
  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  var row = [
    Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
    dayNames[now.getDay()],
    '',
    postType || '',
    '',
    '',
    '',
    '',
    '',
    '',
    'エラー',
    errorMessage || ''
  ];

  sheet.appendRow(row);
  console.log('⚠️ エラーログを記録しました: ' + errorMessage);
}


// ===== 直近の仮説を取得 =====
function getLastHypothesis() {
  var sheet = getHistorySheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return null;

  for (var i = lastRow; i >= 2; i--) {
    var value = sheet.getRange(i, 8).getValue();
    if (value && value.toString().trim() !== '') {
      return value.toString().trim();
    }
  }

  return null;
}


// ===== 直近の学びを取得 =====
function getLastLearning() {
  var sheet = getHistorySheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return null;

  for (var i = lastRow; i >= 2; i--) {
    var value = sheet.getRange(i, 9).getValue();
    if (value && value.toString().trim() !== '') {
      return value.toString().trim();
    }
  }

  return null;
}


// ===== ★v5.5.2: 投稿履歴の最終行H列（仮説）を更新 =====
function updateLastPostHypothesis(hypothesis) {
  var sheet = getHistorySheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(lastRow, 8).setValue(hypothesis);
  }
}


// ===== ★v5.5.2: 投稿履歴の最終行I列（学び）を更新 =====
function updateLastPostLearning(learning) {
  var sheet = getHistorySheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(lastRow, 9).setValue(learning);
  }
}


// ===== 最近使ったアーキタイプを取得（重複防止用） =====
function getRecentArchetypes(count) {
  var sheet = getHistorySheet_();
  var lastRow = sheet.getLastRow();
  var recent = [];

  if (lastRow <= 1) return recent;

  var limit = count || 5;

  for (var i = lastRow; i >= 2 && recent.length < limit; i--) {
    var value = sheet.getRange(i, 7).getValue();
    if (value && value.toString().trim() !== '') {
      recent.push(value.toString().trim());
    }
  }

  return recent;
}


// ===== 次の心得テーマを取得（使用回数が少ないものから） =====
function getNextTheme(category) {
  var sheet = getThemesSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var candidates = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (category && row[1] !== category) continue;

    candidates.push({
      rowIndex: i + 2,
      id: row[0],
      category: row[1],
      theme: row[2],
      keyMessage: row[3],
      tcPattern: row[4],
      lastUsed: row[5],
      useCount: row[6] || 0
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort(function(a, b) {
    return a.useCount - b.useCount;
  });

  var selected = candidates[0];

  sheet.getRange(selected.rowIndex, 6).setValue(
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd')
  );
  sheet.getRange(selected.rowIndex, 7).setValue(selected.useCount + 1);

  return selected;
}


// ===== 今日の投稿数を取得 =====
function getTodayPostCount() {
  var sheet = getHistorySheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return 0;

  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  var count = 0;

  for (var i = lastRow; i >= 2; i--) {
    var dateValue = sheet.getRange(i, 1).getValue();
    if (dateValue) {
      var dateStr = dateValue.toString().substring(0, 10);
      if (dateStr === today) {
        count++;
      } else if (dateStr < today) {
        break;
      }
    }
  }

  return count;
}


// ========================================
// ★ Phase 3.5 追加: キャラクター読み込み
// ========================================

// ===== キャラクター定義をプロンプト用テキストとして取得 =====
function getCharacterPrompt() {
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEET_NAMES.CHARACTER);

    if (!sheet) {
      console.log('⚠️ キャラクターシートが見つかりません。デフォルトを使用します。');
      return getDefaultCharacterPrompt_();
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      console.log('⚠️ キャラクターデータが空です。デフォルトを使用します。');
      return getDefaultCharacterPrompt_();
    }

    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var prompt = '';

    for (var i = 0; i < data.length; i++) {
      var section = data[i][0];
      var content = data[i][1];
      if (section && content) {
        prompt += '【' + section + '】\n' + content + '\n\n';
      }
    }

    return prompt.trim();

  } catch (e) {
    console.log('⚠️ キャラクター読み込みエラー: ' + e.message);
    return getDefaultCharacterPrompt_();
  }
}


// ===== キャラクターシートが使えない場合のフォールバック =====
function getDefaultCharacterPrompt_() {
  return 'あなたは日本のFXトレーダー「コンパナ」です。\n' +
    '個人トレーダーとしてXで発信しています。\n' +
    '事実→解釈の順で伝える。解釈から入らない。\n' +
    'AIっぽくならず、個人トレーダーの生の声のように。';
}


// ========================================
// ★ Phase 3.5 追加: 下書き管理
// ========================================

// ========================================
// ★v12.7: 下書きシート列定数（Phase 3分割対応）
// ========================================
// 列の順序を変更するときはこの定数だけを修正すること（DRY原則）。
// 全ての下書きシートアクセスはこの定数経由にする。
// 値は 1-indexed（スプレッドシートのgetRangeと同じ基準）。

var DRAFT_COLS = {
  POST_ID:              1,   // A
  GENERATED_AT:         2,   // B
  SCHEDULED_TIME:       3,   // C
  POST_TYPE:            4,   // D
  TEXT:                 5,   // E
  VALIDATION:           6,   // F
  STATUS:               7,   // G
  APPROVED_AT:          8,   // H
  PHASE_A_COMPLETED_AT: 9,   // I
  PHASE_B_COMPLETED_AT: 10,  // J
  FACT_CHECK_JSON:      11,  // K
  CS_DATA_JSON:         12,  // L
  FACT_CHECK_SKIPPED:   13,  // M
  FLASH_FALLBACK_USED:  14   // N
};

/**
 * ★v12.7: 下書きシートの総列数を返す
 * 列を追加したときは DRAFT_COLS に定義すれば、この関数は自動追従する。
 * @return {number} 列数（現状14）
 */
function getDraftColCount_() {
  return Object.keys(DRAFT_COLS).length;
}


// ===== 下書きシートを取得 =====
function getDraftsSheet_() {
  var headers = [
    '投稿ID', '生成日時', '投稿予定時刻', '投稿タイプ',
    '生成テキスト', 'バリデーション結果', 'ステータス', '承認日時',
    // ★v12.7 Phase 3分割用の追加列（I〜N列）
    'PhaseACompletedAt',   // I: Phase A完了時刻（ISO文字列）
    'PhaseBCompletedAt',   // J: Phase B完了時刻
    'FactCheckJSON',       // K: ファクトチェック結果JSON（最大50KB）
    'CSDataJSON',          // L: 通貨強弱データJSON
    'FactCheckSkipped',    // M: TRUE/FALSE（ファクトチェックスキップフラグ）
    'FlashFallbackUsed'    // N: TRUE/FALSE（Claudeフォールバック使用フラグ）
  ];
  var sheet = getOrCreateSheet_(SHEET_NAMES.DRAFTS, headers);
  migrateDraftsSheetColumns_(sheet, headers);  // ★v12.7: 既存シートのヘッダーを拡張
  return sheet;
}


// ===== ★v12.7: 下書きシートのヘッダーを拡張（Phase 3分割対応） =====
// 既存のスプレッドシート（本番運用中）に新列を追加するマイグレーション関数。
// getOrCreateSheet_() はシートが既に存在する場合ヘッダーを再設定しないため、
// こちらで不足列を検出して追加する。
function migrateDraftsSheetColumns_(sheet, expectedHeaders) {
  var currentLastCol = sheet.getLastColumn();
  if (currentLastCol >= expectedHeaders.length) {
    return;  // 既に拡張済み
  }

  // 不足している列ヘッダーを追加
  var missingHeaders = expectedHeaders.slice(currentLastCol);
  var startCol = currentLastCol + 1;
  sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
  sheet.getRange(1, startCol, 1, missingHeaders.length).setFontWeight('bold');
  console.log('✅ 下書きシートのヘッダーを拡張: ' + currentLastCol + '列 → ' + expectedHeaders.length + '列');
}


// ===== 下書きを保存 =====
function saveDraft(draftData) {
  var sheet = getDraftsSheet_();
  var now = new Date();
  var postId = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd_HHmmss') + '_' + draftData.postType;

  var row = [
    postId,
    Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
    draftData.scheduledTime || '',
    draftData.postType || '',
    draftData.text || '',
    draftData.validationResult || '',
    draftData.status || '下書き',  // ★v12.7: Phase Aから'Phase A完了'を渡せるようオプション化
    '',
    // ★v12.7 Phase 3分割用の追加列（I〜N列）
    draftData.phaseACompletedAt || '',                // I: Phase A完了時刻
    '',                                                 // J: Phase Bで記入
    draftData.factCheckJson || '',                     // K: ファクトチェック結果JSON
    draftData.csDataJson || '',                        // L: 通貨強弱データJSON
    draftData.factCheckSkipped ? 'TRUE' : 'FALSE',     // M: ファクトチェックスキップフラグ
    draftData.flashFallbackUsed ? 'TRUE' : 'FALSE'     // N: Claudeフォールバック使用フラグ
  ];

  sheet.appendRow(row);
  console.log('✅ 下書きを保存しました: ' + postId);
  return postId;
}


// ===== 承認待ちの下書きを取得 =====
function getPendingDrafts() {
  var sheet = getDraftsSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return [];

  // ★v12.7: 列数をDRAFT_COLS経由で動的取得
  var data = sheet.getRange(2, 1, lastRow - 1, getDraftColCount_()).getValues();
  var pending = [];

  for (var i = 0; i < data.length; i++) {
    // ★v12.7: ステータス判定をDRAFT_COLS経由に
    if (data[i][DRAFT_COLS.STATUS - 1] === '下書き') {
      pending.push({
        rowIndex: i + 2,
        postId:           data[i][DRAFT_COLS.POST_ID - 1],
        generatedAt:      data[i][DRAFT_COLS.GENERATED_AT - 1],
        scheduledTime:    data[i][DRAFT_COLS.SCHEDULED_TIME - 1],
        postType:         data[i][DRAFT_COLS.POST_TYPE - 1],
        text:             data[i][DRAFT_COLS.TEXT - 1],
        validationResult: data[i][DRAFT_COLS.VALIDATION - 1],
        status:           data[i][DRAFT_COLS.STATUS - 1]
      });
    }
  }

  return pending;
}


// ===== 承認済みの下書きを取得（投稿実行用） =====
function getApprovedDrafts() {
  var sheet = getDraftsSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return [];

  // ★v12.7: 列数をDRAFT_COLS経由で動的取得
  var data = sheet.getRange(2, 1, lastRow - 1, getDraftColCount_()).getValues();
  var approved = [];

  for (var i = 0; i < data.length; i++) {
    // ★v12.7: ステータス判定をDRAFT_COLS経由に
    if (data[i][DRAFT_COLS.STATUS - 1] === '承認') {
      approved.push({
        rowIndex: i + 2,
        postId:           data[i][DRAFT_COLS.POST_ID - 1],
        generatedAt:      data[i][DRAFT_COLS.GENERATED_AT - 1],
        scheduledTime:    data[i][DRAFT_COLS.SCHEDULED_TIME - 1],
        postType:         data[i][DRAFT_COLS.POST_TYPE - 1],
        text:             data[i][DRAFT_COLS.TEXT - 1],
        validationResult: data[i][DRAFT_COLS.VALIDATION - 1],
        status:           data[i][DRAFT_COLS.STATUS - 1]
      });
    }
  }

  return approved;
}


// ===== 下書きのステータスを更新 =====
function updateDraftStatus(postId, newStatus) {
  var sheet = getDraftsSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return false;

  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === postId) {
      var rowIndex = i + 2;
      // ★v12.7: 列指定をDRAFT_COLS経由に
      sheet.getRange(rowIndex, DRAFT_COLS.STATUS).setValue(newStatus);
      if (newStatus === '承認' || newStatus === '中止') {
        sheet.getRange(rowIndex, DRAFT_COLS.APPROVED_AT).setValue(
          Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
        );
      }
      console.log('✅ 下書き ' + postId + ' → ' + newStatus);
      return true;
    }
  }

  console.log('⚠️ 下書き ' + postId + ' が見つかりません');
  return false;
}


// ===== 期限切れの下書きを処理 =====
// ★2026-04-28 期限切れバグ修正: 「下書き」のみだった対象を「承認待ち」にも拡張
//   背景: manualモードで承認されない「承認待ち」が永久残留する問題を解消
//   閾値: DRAFT_EXPIRY_MINUTES(90分)を両ステータス共通で適用
function expireOldDrafts() {
  var sheet = getDraftsSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return 0;

  var now = new Date();
  var expiryMs = VALIDATION_CONFIG.DRAFT_EXPIRY_MINUTES * 60 * 1000;
  var draftExpired = 0;
  var pendingExpired = 0;

  // ★v12.7: 列数をDRAFT_COLS経由で動的取得
  var data = sheet.getRange(2, 1, lastRow - 1, getDraftColCount_()).getValues();

  for (var i = 0; i < data.length; i++) {
    var status = data[i][DRAFT_COLS.STATUS - 1];
    if (status !== '下書き' && status !== '承認待ち') continue;

    var generatedAt = data[i][DRAFT_COLS.GENERATED_AT - 1];
    if (!generatedAt) continue;

    var generated = new Date(generatedAt);
    if (now.getTime() - generated.getTime() <= expiryMs) continue;

    var rowIndex = i + 2;
    sheet.getRange(rowIndex, DRAFT_COLS.STATUS).setValue('期限切れ');
    sheet.getRange(rowIndex, DRAFT_COLS.APPROVED_AT).setValue(
      Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
    );
    if (status === '下書き') draftExpired++;
    else pendingExpired++;
  }

  var expiredCount = draftExpired + pendingExpired;
  if (expiredCount > 0) {
    console.log('⏰ ' + expiredCount + '件が期限切れ(下書き' + draftExpired + '/承認待ち' + pendingExpired + ')');
  }

  return expiredCount;
}


// ========================================
// ★v12.7 Phase 3分割: Phase B/C用ヘルパー関数
// ========================================

/**
 * ★v12.7: postIdで下書きを1件取得（全14列をオブジェクト形式で返す）
 *
 * Phase B/Cが下書きシートから特定の投稿データを読み込むためのヘルパー。
 * DRAFT_COLS定数経由で列アクセスしているため、列順変更に追従する。
 *
 * @param {string} postId - 取得する下書きの投稿ID
 * @return {Object|null} 下書きデータ / 見つからなければ null
 */
function getDraftById_(postId) {
  var sheet = getDraftsSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, getDraftColCount_()).getValues();

  for (var i = 0; i < data.length; i++) {
    if (data[i][DRAFT_COLS.POST_ID - 1] === postId) {
      return {
        rowIndex:            i + 2,
        postId:              data[i][DRAFT_COLS.POST_ID - 1],
        generatedAt:         data[i][DRAFT_COLS.GENERATED_AT - 1],
        scheduledTime:       data[i][DRAFT_COLS.SCHEDULED_TIME - 1],
        postType:            data[i][DRAFT_COLS.POST_TYPE - 1],
        text:                data[i][DRAFT_COLS.TEXT - 1],
        validationResult:    data[i][DRAFT_COLS.VALIDATION - 1],
        status:              data[i][DRAFT_COLS.STATUS - 1],
        approvedAt:          data[i][DRAFT_COLS.APPROVED_AT - 1],
        phaseACompletedAt:   data[i][DRAFT_COLS.PHASE_A_COMPLETED_AT - 1],
        phaseBCompletedAt:   data[i][DRAFT_COLS.PHASE_B_COMPLETED_AT - 1],
        factCheckJson:       data[i][DRAFT_COLS.FACT_CHECK_JSON - 1],
        csDataJson:          data[i][DRAFT_COLS.CS_DATA_JSON - 1],
        factCheckSkipped:    data[i][DRAFT_COLS.FACT_CHECK_SKIPPED - 1] === 'TRUE' || data[i][DRAFT_COLS.FACT_CHECK_SKIPPED - 1] === true,
        flashFallbackUsed:   data[i][DRAFT_COLS.FLASH_FALLBACK_USED - 1] === 'TRUE' || data[i][DRAFT_COLS.FLASH_FALLBACK_USED - 1] === true
      };
    }
  }

  return null;
}


/**
 * ★v12.7: 下書きの複数列を一括更新
 *
 * Phase B/Cが完成版テキストや各Phase完了時刻を下書きに書き込むためのヘルパー。
 * updates のキーは DRAFT_COLS のキー名（例: TEXT, STATUS, PHASE_B_COMPLETED_AT）。
 * boolean値は自動的に 'TRUE'/'FALSE' 文字列に変換される。
 *
 * @param {string} postId - 更新する下書きの投稿ID
 * @param {Object} updates - 更新する列と値のマップ
 *   例: { TEXT: '新テキスト', STATUS: 'Phase B完了', FACT_CHECK_SKIPPED: true }
 * @return {boolean} 更新成功ならtrue、下書き未発見ならfalse
 */
function updateDraftContent_(postId, updates) {
  var sheet = getDraftsSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return false;

  // postIdで行を特定（全列取得せず、A列のみスキャン）
  var ids = sheet.getRange(2, DRAFT_COLS.POST_ID, lastRow - 1, 1).getValues();
  var rowIndex = -1;
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === postId) {
      rowIndex = i + 2;
      break;
    }
  }

  if (rowIndex === -1) {
    console.log('⚠️ updateDraftContent_: 下書き ' + postId + ' が見つかりません');
    return false;
  }

  // 更新対象の列を一つずつ書き込み
  var updatedCount = 0;
  var updatedKeys = [];
  for (var key in updates) {
    if (!updates.hasOwnProperty(key)) continue;
    if (typeof DRAFT_COLS[key] !== 'number') {
      console.log('⚠️ updateDraftContent_: 未知のキー「' + key + '」をスキップ');
      continue;
    }
    var value = updates[key];
    // boolean値はTRUE/FALSEに変換（スプレッドシート互換）
    if (typeof value === 'boolean') {
      value = value ? 'TRUE' : 'FALSE';
    }
    sheet.getRange(rowIndex, DRAFT_COLS[key]).setValue(value);
    updatedCount++;
    updatedKeys.push(key);
  }

  console.log('✅ 下書き ' + postId + ' の ' + updatedCount + '列を更新: ' + updatedKeys.join(', '));
  return true;
}


// ===== シート初期化テスト =====
function testSheets() {
  console.log('=== Sheets テスト ===');
  console.log('');

  console.log('投稿履歴シートを取得中...');
  var historySheet = getHistorySheet_();
  console.log('✅ 投稿履歴シート: ' + historySheet.getName());

  console.log('心得テーマシートを取得中...');
  var themesSheet = getThemesSheet_();
  console.log('✅ 心得テーマシート: ' + themesSheet.getName());

  console.log('下書きシートを取得中...');
  var draftsSheet = getDraftsSheet_();
  console.log('✅ 下書きシート: ' + draftsSheet.getName());

  console.log('');
  console.log('キャラクタープロンプト取得テスト...');
  var cp = getCharacterPrompt();
  console.log('✅ ' + cp.substring(0, 100) + '...');

  console.log('');
  console.log('🎉 Sheetsテスト完了！');
}


/**
 * ★v12.7タスク1動作確認: 下書きシート列拡張が正しく適用されたかを検証
 * GASエディタのプルダウンから実行してください。
 */
function testTask1DraftColumnsExpansion() {
  console.log('=== タスク1: 下書きシート列拡張テスト ===');
  console.log('');

  // getDraftsSheet_() を呼ぶと、既存シートに対して migrateDraftsSheetColumns_() が実行される
  var sheet = getDraftsSheet_();
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  console.log('現在の列数: ' + lastCol + '列');
  console.log('');
  console.log('ヘッダー一覧:');
  for (var i = 0; i < headers.length; i++) {
    var colLetter = String.fromCharCode(65 + i);  // A, B, C, ...
    console.log('  ' + colLetter + '列: ' + headers[i]);
  }

  var expectedHeaders = [
    '投稿ID', '生成日時', '投稿予定時刻', '投稿タイプ',
    '生成テキスト', 'バリデーション結果', 'ステータス', '承認日時',
    'PhaseACompletedAt', 'PhaseBCompletedAt', 'FactCheckJSON',
    'CSDataJSON', 'FactCheckSkipped', 'FlashFallbackUsed'
  ];

  console.log('');
  console.log('===== 検証結果 =====');
  var allMatch = true;
  for (var i = 0; i < expectedHeaders.length; i++) {
    var colLetter = String.fromCharCode(65 + i);
    if (headers[i] !== expectedHeaders[i]) {
      console.log('❌ ' + colLetter + '列不一致: 期待「' + expectedHeaders[i] + '」実際「' + (headers[i] || '(空)') + '」');
      allMatch = false;
    }
  }

  console.log('');
  if (allMatch && lastCol >= 14) {
    console.log('🎉 タスク1完了: 下書きシートは14列（A〜N列）に正しく拡張されています');
    console.log('  Phase 3分割用の6列（I〜N列）が追加されました:');
    console.log('    I: PhaseACompletedAt  / J: PhaseBCompletedAt');
    console.log('    K: FactCheckJSON       / L: CSDataJSON');
    console.log('    M: FactCheckSkipped    / N: FlashFallbackUsed');
  } else {
    console.log('❌ タスク1未完了: ヘッダーまたは列数が不正です');
    console.log('  現在: ' + lastCol + '列 / 期待: 14列');
  }
}


/**
 * ★v12.7タスク2動作確認: DRAFT_COLS定数化が正しく適用されたかを検証
 * GASエディタのプルダウンから実行してください。
 */
function testTask2DraftColsConstant() {
  console.log('=== タスク2: DRAFT_COLS定数化テスト ===');
  console.log('');

  // 1. DRAFT_COLS定数の存在と内容確認
  console.log('1. DRAFT_COLS定数の定義確認');
  if (typeof DRAFT_COLS === 'undefined') {
    console.log('❌ DRAFT_COLS定数が定義されていません');
    return;
  }
  var keys = Object.keys(DRAFT_COLS);
  console.log('   定義されたキー数: ' + keys.length);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var colNum = DRAFT_COLS[key];
    var colLetter = String.fromCharCode(64 + colNum);  // A=65
    console.log('   ' + key + ': ' + colNum + ' (' + colLetter + '列)');
  }

  // 2. getDraftColCount_() の動作確認
  console.log('');
  console.log('2. getDraftColCount_() 動作確認');
  var colCount = getDraftColCount_();
  console.log('   列数: ' + colCount);
  if (colCount !== 14) {
    console.log('❌ 期待: 14、実際: ' + colCount);
    return;
  }
  console.log('   ✅ 期待通り14列');

  // 3. 必須キーの存在確認
  console.log('');
  console.log('3. 必須キーの存在確認');
  var requiredKeys = [
    'POST_ID', 'GENERATED_AT', 'SCHEDULED_TIME', 'POST_TYPE',
    'TEXT', 'VALIDATION', 'STATUS', 'APPROVED_AT',
    'PHASE_A_COMPLETED_AT', 'PHASE_B_COMPLETED_AT',
    'FACT_CHECK_JSON', 'CS_DATA_JSON',
    'FACT_CHECK_SKIPPED', 'FLASH_FALLBACK_USED'
  ];
  var allKeysOk = true;
  for (var i = 0; i < requiredKeys.length; i++) {
    if (typeof DRAFT_COLS[requiredKeys[i]] !== 'number') {
      console.log('   ❌ 欠損: ' + requiredKeys[i]);
      allKeysOk = false;
    }
  }
  if (allKeysOk) {
    console.log('   ✅ 全14キー定義済み');
  }

  // 4. getPendingDrafts / getApprovedDrafts が動作することを確認
  console.log('');
  console.log('4. 関数動作確認（リグレッション防止）');
  try {
    var pending = getPendingDrafts();
    console.log('   ✅ getPendingDrafts() 正常動作 / 取得件数: ' + pending.length + '件');
  } catch (e) {
    console.log('   ❌ getPendingDrafts() エラー: ' + e.message);
    return;
  }
  try {
    var approved = getApprovedDrafts();
    console.log('   ✅ getApprovedDrafts() 正常動作 / 取得件数: ' + approved.length + '件');
  } catch (e) {
    console.log('   ❌ getApprovedDrafts() エラー: ' + e.message);
    return;
  }

  // 5. 既存の下書きデータ形式が維持されていることを確認
  console.log('');
  console.log('5. 下書きデータ形式の整合性確認');
  var allDrafts = pending.concat(approved);
  if (allDrafts.length > 0) {
    var sample = allDrafts[0];
    var expectedFields = ['postId', 'generatedAt', 'scheduledTime', 'postType', 'text', 'validationResult', 'status'];
    var missingFields = [];
    for (var i = 0; i < expectedFields.length; i++) {
      if (!(expectedFields[i] in sample)) {
        missingFields.push(expectedFields[i]);
      }
    }
    if (missingFields.length > 0) {
      console.log('   ❌ 下書きオブジェクトの欠損フィールド: ' + missingFields.join(', '));
      return;
    }
    console.log('   ✅ 下書きオブジェクトの必須フィールドが全て存在');
  } else {
    console.log('   (下書きが0件のためデータ形式確認はスキップ)');
  }

  console.log('');
  console.log('🎉 タスク2完了: DRAFT_COLS定数化が全て正しく適用されています');
  console.log('  ハードコード列参照（data[i][6], getRange(..., 8)等）が');
  console.log('  DRAFT_COLS定数経由に置換され、拡張性が向上しました');
}


/**
 * ★v12.7タスク4 Step 1動作確認: getDraftById_ / updateDraftContent_ ヘルパー関数のテスト
 * GASエディタのプルダウンから実行してください。
 *
 * 実際に下書きシートに対して書き込み/読み込みを行うため、
 * テスト完了後に作成した行を自動削除します。
 */
function testTask4Step1DraftHelpers() {
  console.log('=== タスク4 Step 1: 下書きヘルパー関数テスト ===');
  console.log('');

  // 1. 関数存在確認
  console.log('1. 関数定義の確認');
  if (typeof getDraftById_ !== 'function') {
    console.log('❌ getDraftById_ 関数が見つかりません');
    return;
  }
  if (typeof updateDraftContent_ !== 'function') {
    console.log('❌ updateDraftContent_ 関数が見つかりません');
    return;
  }
  console.log('   ✅ getDraftById_ 関数が定義されています');
  console.log('   ✅ updateDraftContent_ 関数が定義されています');

  // 2. テスト用下書きを作成
  console.log('');
  console.log('2. テスト用下書きを作成');
  var testPostId;
  try {
    testPostId = saveDraft({
      postType: 'TEST_TASK4',
      text: 'タスク4テスト用の初稿テキスト',
      scheduledTime: '00:00',
      validationResult: ''
    });
    console.log('   ✅ テスト下書き作成: ' + testPostId);
  } catch (e) {
    console.log('   ❌ saveDraft失敗: ' + e.message);
    return;
  }

  // 3. getDraftById_ で取得確認
  console.log('');
  console.log('3. getDraftById_ 動作確認');
  try {
    var draft = getDraftById_(testPostId);
    if (!draft) {
      console.log('   ❌ getDraftById_: 作成した下書きが取得できません');
      return;
    }
    console.log('   ✅ 下書きを取得できました');
    console.log('   - postId: ' + draft.postId);
    console.log('   - postType: ' + draft.postType);
    console.log('   - text: ' + draft.text);
    console.log('   - status: ' + draft.status);
    console.log('   - rowIndex: ' + draft.rowIndex);
    console.log('   - factCheckSkipped: ' + draft.factCheckSkipped);
    console.log('   - flashFallbackUsed: ' + draft.flashFallbackUsed);

    // 必須フィールドの存在確認
    var expectedFields = ['rowIndex', 'postId', 'postType', 'text', 'status',
                          'phaseACompletedAt', 'phaseBCompletedAt',
                          'factCheckJson', 'csDataJson',
                          'factCheckSkipped', 'flashFallbackUsed'];
    var missing = [];
    for (var i = 0; i < expectedFields.length; i++) {
      if (!(expectedFields[i] in draft)) missing.push(expectedFields[i]);
    }
    if (missing.length > 0) {
      console.log('   ❌ 欠損フィールド: ' + missing.join(', '));
      return;
    }
    console.log('   ✅ 必須フィールド全て存在');
  } catch (e) {
    console.log('   ❌ getDraftById_エラー: ' + e.message);
    return;
  }

  // 4. updateDraftContent_ で複数列を更新
  console.log('');
  console.log('4. updateDraftContent_ 動作確認');
  try {
    var updateResult = updateDraftContent_(testPostId, {
      TEXT: 'タスク4テストで更新されたテキスト',
      STATUS: 'Phase B完了',
      PHASE_A_COMPLETED_AT: '2026-04-17T10:00:00Z',
      PHASE_B_COMPLETED_AT: '2026-04-17T10:05:00Z',
      FACT_CHECK_JSON: '{"test":"factcheck data"}',
      CS_DATA_JSON: '{"test":"cs data"}',
      FACT_CHECK_SKIPPED: false,
      FLASH_FALLBACK_USED: true
    });

    if (!updateResult) {
      console.log('   ❌ updateDraftContent_が false を返しました');
      return;
    }
    console.log('   ✅ updateDraftContent_ 成功');

    // 更新後に再取得して確認
    var updatedDraft = getDraftById_(testPostId);
    if (updatedDraft.text !== 'タスク4テストで更新されたテキスト') {
      console.log('   ❌ TEXT更新失敗: ' + updatedDraft.text);
      return;
    }
    if (updatedDraft.status !== 'Phase B完了') {
      console.log('   ❌ STATUS更新失敗: ' + updatedDraft.status);
      return;
    }
    if (updatedDraft.phaseACompletedAt !== '2026-04-17T10:00:00Z') {
      console.log('   ❌ PHASE_A_COMPLETED_AT更新失敗: ' + updatedDraft.phaseACompletedAt);
      return;
    }
    if (updatedDraft.phaseBCompletedAt !== '2026-04-17T10:05:00Z') {
      console.log('   ❌ PHASE_B_COMPLETED_AT更新失敗: ' + updatedDraft.phaseBCompletedAt);
      return;
    }
    if (updatedDraft.factCheckJson !== '{"test":"factcheck data"}') {
      console.log('   ❌ FACT_CHECK_JSON更新失敗');
      return;
    }
    if (updatedDraft.factCheckSkipped !== false) {
      console.log('   ❌ FACT_CHECK_SKIPPED更新失敗（false期待、実際: ' + updatedDraft.factCheckSkipped + '）');
      return;
    }
    if (updatedDraft.flashFallbackUsed !== true) {
      console.log('   ❌ FLASH_FALLBACK_USED更新失敗（true期待、実際: ' + updatedDraft.flashFallbackUsed + '）');
      return;
    }
    console.log('   ✅ 全8列が正しく更新されています');
  } catch (e) {
    console.log('   ❌ updateDraftContent_エラー: ' + e.message);
    return;
  }

  // 5. 存在しないpostIdの処理確認
  console.log('');
  console.log('5. 異常系テスト');
  var notFound = getDraftById_('NOT_EXIST_POST_ID_' + new Date().getTime());
  if (notFound !== null) {
    console.log('   ❌ 存在しないpostIdで null が返されない');
    return;
  }
  console.log('   ✅ 存在しないpostIdで null を返す');

  var updateNotFound = updateDraftContent_('NOT_EXIST_POST_ID_' + new Date().getTime(), { TEXT: 'x' });
  if (updateNotFound !== false) {
    console.log('   ❌ 存在しないpostIdで false が返されない');
    return;
  }
  console.log('   ✅ 存在しないpostIdで false を返す');

  // 6. 未知のキー処理確認
  console.log('');
  console.log('6. 未知のキー処理確認');
  var partialUpdate = updateDraftContent_(testPostId, {
    TEXT: 'キー混在テスト',
    UNKNOWN_KEY: 'これはスキップされるはず'
  });
  if (!partialUpdate) {
    console.log('   ❌ 既知キーを含む更新が false を返しました');
    return;
  }
  console.log('   ✅ 未知キーはスキップ、既知キーのみ更新');

  // 7. テスト用下書きを削除（後始末）
  console.log('');
  console.log('7. テスト用下書きの削除');
  try {
    var sheet = getDraftsSheet_();
    var targetDraft = getDraftById_(testPostId);
    if (targetDraft) {
      sheet.deleteRow(targetDraft.rowIndex);
      console.log('   ✅ テスト下書きを削除しました: ' + testPostId);
    }
  } catch (e) {
    console.log('   ⚠️ 削除失敗（手動で下書きシートから ' + testPostId + ' を削除してください）: ' + e.message);
  }

  console.log('');
  console.log('🎉 タスク4 Step 1完了: 下書きヘルパー関数が正常に動作しています');
  console.log('  Phase B/Cが下書きシートから postId で読み書きできる基盤が整いました');
  console.log('  次のステップ: main.gs に executePhaseBQualityReview を新設');
}


/**
 * ★v12.7 タスク4 Step 1 診断用テスト関数
 * 
 * testTask4Step1DraftHelpers が失敗した場合、こちらを実行して
 * 原因を特定します。シートの生データとgetDraftById_の戻り値を
 * 詳細にログ出力します。
 */
function testTask4DiagnoseGetDraft() {
  console.log('=== 診断: getDraftById_ の戻り値完全検査 ===');
  console.log('');

  // 1. シート状態の確認
  console.log('1. 下書きシートの基本情報');
  var sheet = getDraftsSheet_();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var colCount = getDraftColCount_();
  console.log('   シートの最終行: ' + lastRow);
  console.log('   シートの最終列: ' + lastCol);
  console.log('   getDraftColCount_(): ' + colCount);

  if (lastCol < 14) {
    console.log('');
    console.log('❌ 異常: シートが14列未満です');
    console.log('   → 最新版のsheetsManager.gsが保存されていない可能性');
    console.log('   → タスク1を再実行してください（testTask1DraftColumnsExpansion）');
    return;
  }

  // 2. 既存データのヘッダー確認
  console.log('');
  console.log('2. シートヘッダー（14列期待）');
  var headers = sheet.getRange(1, 1, 1, colCount).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    console.log('   列' + (i + 1) + ': ' + headers[i]);
  }

  // 3. テスト下書きを作成
  console.log('');
  console.log('3. テスト下書きを作成');
  var postId = saveDraft({
    postType: 'DIAG_TEST',
    text: '診断テスト用テキスト',
    scheduledTime: '00:00',
    validationResult: ''
  });
  console.log('   作成されたpostId: ' + postId);

  // 4. 直接getRangeで行を読み取り
  console.log('');
  console.log('4. 作成された行を直接 getRange で読む');
  var newLastRow = sheet.getLastRow();
  var rawRow = sheet.getRange(newLastRow, 1, 1, colCount).getValues()[0];
  console.log('   行番号: ' + newLastRow);
  console.log('   列数: ' + rawRow.length);
  console.log('   生データ: ' + JSON.stringify(rawRow));
  console.log('');
  console.log('   各列の値:');
  for (var i = 0; i < rawRow.length; i++) {
    var val = rawRow[i];
    var displayVal = val === '' ? '(空)' : (val === null ? '(null)' : (val === undefined ? '(undefined)' : JSON.stringify(val)));
    console.log('   列' + (i + 1) + ' (' + headers[i] + '): ' + displayVal);
  }

  // 5. rawRowの配列長が14未満ならエラー
  if (rawRow.length !== 14) {
    console.log('');
    console.log('❌ 異常: 読み取った行が14列ではありません（' + rawRow.length + '列）');
    console.log('   → saveDraft の row 配列が古い8列のままの可能性');
    console.log('   → ファイルを再度アップロード→保存してください');
  } else {
    console.log('');
    console.log('✅ 行は14列あります');
  }

  // 6. getDraftById_で取得
  console.log('');
  console.log('5. getDraftById_ で同じ行を取得');
  var draft = getDraftById_(postId);
  if (!draft) {
    console.log('   ❌ getDraftById_がnullを返しました');
    return;
  }
  console.log('   draft オブジェクトのキー: ' + Object.keys(draft).join(', '));
  console.log('   draft 全体: ' + JSON.stringify(draft));

  // 7. クリーンアップ
  console.log('');
  console.log('6. テスト下書きを削除');
  sheet.deleteRow(newLastRow);
  console.log('   ✅ 削除完了');

  console.log('');
  console.log('=== 診断完了 ===');
  console.log('上記のログを私に共有してください');
}


// ========================================
// Phase 2: 仮説検証ログ
// ========================================

/**
 * 仮説検証ログシートを取得（なければ作成）
 * Phase 2: WEEKLY_HYPOTHESISの仮説を記録し、翌週に自動検証する
 */
function getHypothesisLogSheet_() {
  var headers = [
    '仮説ID', '仮説日', '仮説内容', '対象ペア', '仮説方向',
    '仮説時レート', '検証日', '検証時レート', '変動幅', '判定', '的中理由'
  ];
  return getOrCreateSheet_('仮説検証ログ', headers);
}


/**
 * 仮説を検証ログに保存（WEEKLY_HYPOTHESIS投稿後に呼ばれる）
 * @param {Object} data - { hypothesisId, hypothesisDate, content, pair, direction, rateAtHypothesis }
 * @return {string} 保存した仮説ID
 */
function saveHypothesisToLog(data) {
  var sheet = getHypothesisLogSheet_();

  var row = [
    data.hypothesisId || '',
    data.hypothesisDate || '',
    data.content || '',
    data.pair || '',
    data.direction || '',
    data.rateAtHypothesis || '',
    '',  // G: 検証日（翌週に記入）
    '',  // H: 検証時レート
    '',  // I: 変動幅
    '',  // J: 判定
    ''   // K: 的中理由
  ];

  sheet.appendRow(row);
  console.log('✅ 仮説検証ログに保存: ' + data.hypothesisId + ' ' + data.pair + ' ' + data.direction);
  return data.hypothesisId;
}


/**
 * 未検証の仮説を取得（G列「検証日」が空の行）
 * @return {Array} 未検証仮説の配列
 */
function getUnverifiedHypotheses() {
  var sheet = getHypothesisLogSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var unverified = [];

  for (var i = 0; i < data.length; i++) {
    // G列（検証日、index 6）が空なら未検証
    if (!data[i][6] || data[i][6].toString().trim() === '') {
      unverified.push({
        rowIndex: i + 2,
        hypothesisId: data[i][0],
        hypothesisDate: data[i][1],
        content: data[i][2],
        pair: data[i][3],
        direction: data[i][4],
        rateAtHypothesis: Number(data[i][5])
      });
    }
  }

  return unverified;
}


/**
 * 検証結果を書き込み（G〜K列を更新）
 * @param {string} hypothesisId - 仮説ID
 * @param {Object} verificationData - { verificationDate, rateAtVerification, change, verdict, reason }
 * @return {boolean} 更新成功ならtrue
 */
function updateHypothesisVerification(hypothesisId, verificationData) {
  var sheet = getHypothesisLogSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return false;

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === hypothesisId) {
      var rowIndex = i + 2;
      sheet.getRange(rowIndex, 7, 1, 5).setValues([[
        verificationData.verificationDate || '',
        verificationData.rateAtVerification || '',
        verificationData.change || '',
        verificationData.verdict || '',
        verificationData.reason || ''
      ]]);
      console.log('✅ 仮説検証完了: ' + hypothesisId + ' → ' + verificationData.verdict);
      return true;
    }
  }

  console.log('⚠️ 仮説ID ' + hypothesisId + ' が見つかりません');
  return false;
}


/**
 * 直近N件の検証済み結果を取得（新しい順）
 * @param {number} count - 取得件数（デフォルト5）
 * @return {Array} 検証済み仮説の配列
 */
function getRecentHypothesisResults(count) {
  var sheet = getHypothesisLogSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var verified = [];

  // 最終行から遡って、J列（判定、index 9）が空でないものを探す
  for (var i = data.length - 1; i >= 0 && verified.length < (count || 5); i--) {
    if (data[i][9] && data[i][9].toString().trim() !== '') {
      verified.push({
        hypothesisId: data[i][0],
        hypothesisDate: data[i][1],
        content: data[i][2],
        pair: data[i][3],
        direction: data[i][4],
        rateAtHypothesis: data[i][5],
        verificationDate: data[i][6],
        rateAtVerification: data[i][7],
        change: data[i][8],
        verdict: data[i][9],
        reason: data[i][10]
      });
    }
  }

  return verified;
}


// ========================================
// Phase 3: 学びログ拡張（重み付け）
// ========================================

/**
 * 学びログシートにE〜H列ヘッダーを追加（初回1回だけ実行）
 * 既存データの A〜D列には影響しない
 * GASエディタから手動実行: setupLearningLogExtension()
 */
function setupLearningLogExtension() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('学びログ');

  if (!sheet) {
    console.log('⚠️ 学びログシートが見つかりません');
    return;
  }

  // E1〜H1にヘッダーがなければ追加
  var currentHeaders = sheet.getRange(1, 5, 1, 4).getValues()[0];
  if (!currentHeaders[0] || currentHeaders[0] === '') {
    sheet.getRange(1, 5, 1, 4).setValues([['使用回数', '有効度スコア', '最終使用日', 'ステータス']]);
    sheet.getRange(1, 5, 1, 4).setFontWeight('bold');

    // 既存データ行にデフォルト値を設定
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var defaults = [];
      for (var i = 0; i < lastRow - 1; i++) {
        defaults.push([0, 0, '', 'active']);
      }
      sheet.getRange(2, 5, lastRow - 1, 4).setValues(defaults);
    }

    console.log('✅ 学びログシートにE〜H列を追加しました（既存' + (lastRow - 1) + '行にデフォルト値設定）');
  } else {
    console.log('✅ 学びログシートのE〜H列は既に存在します');
  }
}


/**
 * 学びの使用回数をインクリメント + 最終使用日を更新
 * @param {number} rowIndex - シートの行番号（2以上）
 */
function incrementLearningUsage(rowIndex) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('学びログ');
  if (!sheet) return;

  // E列（使用回数）をインクリメント
  var currentCount = sheet.getRange(rowIndex, 5).getValue() || 0;
  sheet.getRange(rowIndex, 5).setValue(currentCount + 1);

  // G列（最終使用日）を更新
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  sheet.getRange(rowIndex, 7).setValue(today);
}


/**
 * 学びログをスコア付きで全件取得（Phase 3の選択ロジック用）
 * @param {string} category - カテゴリフィルタ（nullなら全件）
 * @param {number} maxItems - 未使用（互換性のため残す）
 * @return {Array} 学びデータの配列（rowIndex, content, score等）
 */
function getLearningLogWithScores(category, maxItems) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('学びログ');

  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  // A〜H列を取得（H列まで拡張されていない場合も考慮）
  var colCount = Math.min(sheet.getLastColumn(), 8);
  var data = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  var items = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var itemCategory = row[1] ? row[1].toString().trim() : '';
    var content = row[2] ? row[2].toString().trim() : '';
    var status = (colCount >= 8 && row[7]) ? row[7].toString().trim() : 'active';

    // retiredはスキップ
    if (status === 'retired') continue;
    // 内容が空はスキップ
    if (!content) continue;
    // カテゴリフィルタ（指定時のみ）
    if (category && itemCategory !== category) continue;

    items.push({
      rowIndex: i + 2,
      date: row[0],
      category: itemCategory,
      content: content,
      source: row[3] ? row[3].toString().trim() : '',
      usageCount: (colCount >= 5) ? (Number(row[4]) || 0) : 0,
      score: (colCount >= 6) ? (Number(row[5]) || 0) : 0,
      lastUsed: (colCount >= 7) ? row[6] : '',
      status: status
    });
  }

  return items;
}


// ========================================
// Phase 2 + 3: セットアップ（初回1回だけ実行）
// ========================================

/**
 * Phase 2 + 3 の初期セットアップ
 * GASエディタから手動実行: setupPhase2And3()
 * 
 * 実行すること:
 *   1. 仮説検証ログシートを作成（Phase 2）
 *   2. 学びログシートにE〜H列を追加（Phase 3）
 */
function setupPhase2And3() {
  console.log('=== Phase 2 + 3 セットアップ ===');
  console.log('');

  // Phase 2: 仮説検証ログシート作成
  console.log('Phase 2: 仮説検証ログシート...');
  var hypothesisSheet = getHypothesisLogSheet_();
  console.log('✅ ' + hypothesisSheet.getName() + ' 準備完了');
  console.log('');

  // Phase 3: 学びログシート拡張
  console.log('Phase 3: 学びログシート拡張...');
  setupLearningLogExtension();
  console.log('');

  console.log('=== セットアップ完了 ===');
  console.log('');
  console.log('次のステップ:');
  console.log('  1. スプレッドシートで「仮説検証ログ」シートが作成されたか確認');
  console.log('  2. 「学びログ」シートにE〜H列が追加されたか確認');
}


// ========================================
// Phase 4: エンゲージメントログ
// ========================================

/**
 * エンゲージメントログシートを取得（なければ作成）
 */
function getEngagementLogSheet_() {
  var headers = [
    '投稿ID', 'ツイートID', '取得日時', 'インプレッション',
    'いいね数', 'RT数', '返信数', 'エンゲージメント率',
    '品質スコア', '投稿タイプ'
  ];
  return getOrCreateSheet_('エンゲージメントログ', headers);
}


/**
 * エンゲージメントデータを保存
 * @param {Object} data - メトリクスデータ
 * @return {boolean} 保存成功ならtrue
 */
function saveEngagementData(data) {
  var sheet = getEngagementLogSheet_();

  var row = [
    data.postId || '',
    data.tweetId || '',
    data.fetchedAt || '',
    data.impressions || 0,
    data.likes || 0,
    data.retweets || 0,
    data.replies || 0,
    data.engagementRate || 0,
    data.qualityScore || 0,
    data.postType || ''
  ];

  sheet.appendRow(row);
  return true;
}


/**
 * 既に取得済みのツイートIDセットを返す
 * @return {Object} キーがツイートID、値がtrueのオブジェクト
 */
function getCollectedTweetIds_() {
  var sheet = getEngagementLogSheet_();
  var lastRow = sheet.getLastRow();
  var collected = {};

  if (lastRow <= 1) return collected;

  var ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0]) {
      collected[ids[i][0].toString()] = true;
    }
  }

  return collected;
}


/**
 * 投稿履歴から未取得かつ24時間以上前のツイートを取得
 * @return {Array} { postId, tweetId, postType, postedAt } の配列
 */
function getUncollectedTweets() {
  var historySheet = getHistorySheet_();
  var lastRow = historySheet.getLastRow();

  if (lastRow <= 1) return [];

  var data = historySheet.getRange(2, 1, lastRow - 1, 12).getValues();
  // A=日時(0), D=タイプ名(3), J=ツイートID(9), K=ステータス(10)

  var collected = getCollectedTweetIds_();
  var now = new Date();
  var threshold = 24 * 60 * 60 * 1000; // 24時間（ミリ秒）
  var uncollected = [];

  for (var i = 0; i < data.length; i++) {
    var tweetId = data[i][9] ? data[i][9].toString().trim() : '';
    var status = data[i][10] ? data[i][10].toString().trim() : '';

    // ツイートIDがない、数字のみでない、またはステータスが成功でないものはスキップ
    if (!tweetId || status !== '成功') continue;
    if (!/^\d+$/.test(tweetId)) continue;

    // 既に取得済みならスキップ
    if (collected[tweetId]) continue;

    // 24時間以上前かチェック
    var postedAt = new Date(data[i][0]);
    if ((now.getTime() - postedAt.getTime()) < threshold) continue;

    uncollected.push({
      postId: data[i][2] ? data[i][2].toString() : '', // C列: 投稿番号
      tweetId: tweetId,
      postType: data[i][3] ? data[i][3].toString().trim() : '',
      postedAt: postedAt
    });
  }

  return uncollected;
}


/**
 * 特定投稿タイプの直近N件のエンゲージメント率の平均を取得
 * @param {string} postType - 投稿タイプ
 * @param {number} count - 対象件数（デフォルト30）
 * @return {Object} { avgER, avgImpressions, count, records }
 */
function getEngagementStats(postType, count) {
  var sheet = getEngagementLogSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return { avgER: 0, avgImpressions: 0, count: 0, records: [] };

  var data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var maxCount = count || 30;
  var matched = [];

  // 最終行から遡って、該当タイプを探す
  for (var i = data.length - 1; i >= 0 && matched.length < maxCount; i--) {
    var type = data[i][9] ? data[i][9].toString().trim() : '';
    if (type === postType) {
      matched.push({
        postId: data[i][0],
        tweetId: data[i][1],
        impressions: Number(data[i][3]) || 0,
        likes: Number(data[i][4]) || 0,
        retweets: Number(data[i][5]) || 0,
        replies: Number(data[i][6]) || 0,
        engagementRate: Number(data[i][7]) || 0,
        qualityScore: Number(data[i][8]) || 0
      });
    }
  }

  if (matched.length === 0) return { avgER: 0, avgImpressions: 0, count: 0, records: [] };

  var totalER = 0;
  var totalImp = 0;
  for (var j = 0; j < matched.length; j++) {
    totalER += matched[j].engagementRate;
    totalImp += matched[j].impressions;
  }

  return {
    avgER: totalER / matched.length,
    avgImpressions: totalImp / matched.length,
    count: matched.length,
    records: matched
  };
}


/**
 * 全タイプ合算の平均エンゲージメント率を取得
 * @param {number} count - 対象件数（デフォルト30）
 * @return {Object} { avgER, count }
 */
function getOverallEngagementStats(count) {
  var sheet = getEngagementLogSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return { avgER: 0, count: 0 };

  var maxCount = count || 30;
  var startRow = Math.max(2, lastRow - maxCount + 1);
  var data = sheet.getRange(startRow, 8, lastRow - startRow + 1, 1).getValues();

  var total = 0;
  var validCount = 0;
  for (var i = 0; i < data.length; i++) {
    var er = Number(data[i][0]);
    if (er > 0) {
      total += er;
      validCount++;
    }
  }

  return {
    avgER: validCount > 0 ? total / validCount : 0,
    count: validCount
  };
}


/**
 * 品質スコアを計算
 * 同タイプの平均ERと比較して0〜100のスコアに変換
 * @param {number} engagementRate - このツイートのER（%）
 * @param {string} postType - 投稿タイプ
 * @return {number} 品質スコア（0〜100）
 */
function calculateQualityScore(engagementRate, postType) {
  // 同タイプの統計を取得
  var stats = getEngagementStats(postType, 30);

  // データ不足の場合は全体平均を使用
  var avgER = stats.avgER;
  if (stats.count < 5) {
    var overall = getOverallEngagementStats(30);
    avgER = overall.avgER;
  }

  // 平均ERが0の場合（初期データなし）はデフォルト50
  if (avgER <= 0) return 50;

  // スコア計算: ER/平均ER * 50
  // 平均と同じ → 50点、平均の2倍 → 100点、0 → 0点
  var score = Math.round((engagementRate / avgER) * 50);
  return Math.min(100, Math.max(0, score));
}


/**
 * Phase 4 セットアップ（初回1回だけ実行）
 * GASエディタから手動実行: setupPhase4()
 */
function setupPhase4() {
  console.log('=== Phase 4 セットアップ ===');
  console.log('');

  var sheet = getEngagementLogSheet_();
  console.log('✅ ' + sheet.getName() + ' 準備完了');

  // 列幅を設定
  sheet.setColumnWidth(1, 150); // 投稿ID
  sheet.setColumnWidth(2, 180); // ツイートID
  sheet.setColumnWidth(3, 150); // 取得日時
  sheet.setColumnWidth(10, 120); // 投稿タイプ

  console.log('');
  console.log('=== セットアップ完了 ===');
  console.log('スプレッドシートに「エンゲージメントログ」シートが作成されたか確認してください');
}


// ========================================
// ★v12.7: 未来日付ガード発動ログ（Phase 1）
// ========================================

/**
 * 「未来日付ガードログ」シートを取得（なければ作成）
 * 週次レビュー用。False Positive（保持すべき文が削除された）を発見するため。
 */
function getFutureDateGuardLogSheet_() {
  var headers = ['発動日時', '段階', '削除内容'];
  return getOrCreateSheet_('未来日付ガードログ', headers);
}

/**
 * ★v12.7: 未来日付ガードの発動をログシートに記録する
 * 
 * @param {string} stage - 発動段階（'news'=ニュース収集時 / 'postBody'=投稿本文処理時 / 'finalVerify'=最終検証時）
 * @param {string} removedContent - 削除された内容
 */
function logFutureDateGuard_(stage, removedContent) {
  try {
    var sheet = getFutureDateGuardLogSheet_();
    var now = new Date();
    var row = [
      Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
      stage,
      String(removedContent || '').substring(0, 500)  // 長すぎる場合は切り詰め
    ];
    sheet.appendRow(row);
  } catch (e) {
    console.log('⚠️ 未来日付ガードログ書き込み失敗（続行）: ' + e.message);
  }
}

// ========================================
// ★v12.7: 継続中重大事象シート（Phase 2 タスク13）
// ========================================

/**
 * ★v12.7: 「継続中重大事象」シートを取得（なければ作成）
 *
 * 継続中の地政学・経済イベントを管理するシート。
 * finalFactVerify_ で「〜ショック前」等のハルシネーションを検出するために使用。
 * データは週次でコンパナさんが手動更新（AIに任せない）。
 *
 * 列構成（7列）:
 *   A: 事象名（例: 米国関税措置）
 *   B: 開始日（例: 2025-03-12）
 *   C: 最新更新日（例: 2026-02-21）
 *   D: 現状（継続中 / 終了）
 *   E: 概要（時系列の要約）
 *   F: 影響する投稿タイプ（INDICATOR, LUNCH, LONDON, NEXT_WEEK 等）
 *   G: 注意キーワード（関税前, 関税ショック前 等）
 */
function getOngoingEventsSheet_() {
  var headers = [
    '事象名', '開始日', '最新更新日', '現状',
    '概要', '影響する投稿タイプ', '注意キーワード'
  ];
  return getOrCreateSheet_('継続中重大事象', headers);
}


/**
 * ★v12.7: 継続中の重大事象を全件取得（現状=継続中の行のみ）
 *
 * finalFactVerify_ のプロンプトに注入し、「関税ショック前」等の
 * ハルシネーションを検出するための確定データとして使用する。
 *
 * @return {Array} 継続中事象の配列
 *   各要素: { name, startDate, lastUpdated, status, summary, affectedTypes, cautionKeywords }
 *   空配列の場合: シートが空または全事象が「終了」
 */
function getOngoingEvents_() {
  var sheet = getOngoingEventsSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var events = [];

  for (var i = 0; i < data.length; i++) {
    var status = (data[i][3] || '').toString().trim();
    // 「継続中」の行のみ取得（「終了」は除外）
    if (status === '継続中') {
      events.push({
        name:             data[i][0] || '',
        startDate:        data[i][1] || '',
        lastUpdated:      data[i][2] || '',
        status:           status,
        summary:          data[i][4] || '',
        affectedTypes:    data[i][5] || '',
        cautionKeywords:  data[i][6] || ''
      });
    }
  }

  console.log('📋 継続中重大事象: ' + events.length + '件取得');
  return events;
}


/**
 * ★v12.7 タスク13テスト: 継続中重大事象シートとgetOngoingEvents_の動作確認
 */
function testTask13OngoingEvents() {
  console.log('=== タスク13: 継続中重大事象シートテスト ===');
  console.log('');

  // 1. シート取得（なければ自動作成）
  console.log('1. 継続中重大事象シート取得');
  var sheet;
  try {
    sheet = getOngoingEventsSheet_();
    console.log('   ✅ シート取得成功: ' + sheet.getName());
    var lastCol = sheet.getLastColumn();
    console.log('   列数: ' + lastCol);
    if (lastCol >= 7) {
      var headers = sheet.getRange(1, 1, 1, 7).getValues()[0];
      console.log('   ヘッダー: ' + headers.join(' | '));
      console.log('   ✅ 7列ヘッダー確認OK');
    } else {
      console.log('   ⚠️ 列数が7未満（' + lastCol + '列）');
    }
  } catch (e) {
    console.log('   ❌ エラー: ' + e.message);
    return;
  }

  // 2. getOngoingEvents_ 実行
  console.log('');
  console.log('2. getOngoingEvents_ 実行');
  try {
    var events = getOngoingEvents_();
    console.log('   取得件数: ' + events.length + '件');
    if (events.length > 0) {
      for (var i = 0; i < events.length; i++) {
        console.log('   [' + (i + 1) + '] ' + events[i].name + '（' + events[i].status + '）');
        console.log('       注意KW: ' + events[i].cautionKeywords);
      }
    } else {
      console.log('   （データなし → タスク15で初期データを投入してください）');
    }
  } catch (e) {
    console.log('   ❌ エラー: ' + e.message);
    return;
  }

  console.log('');
  console.log('🎉 タスク13完了: 継続中重大事象シートとgetOngoingEvents_が動作しています');
  console.log('  次のステップ: タスク14 - finalFactVerify_に継続中事象データ注入');
  console.log('  その後: タスク15 - シートに初期データを手動投入');
}


// ========================================
// ★v12.7 タスク17-d: 対話型検証ログシート対応
// ========================================

/**
 * 対話型検証ログシートを取得(なければ作成)
 *
 * シート名: 対話型検証ログ
 * 列構成(12列): 要件定義v1.9 セクション20.2参照
 * 保持期間: 無期限(月別分割への移行余地を残す)
 *
 * @return {Sheet} 対話型検証ログシート
 */
function getInteractiveVerifyLogSheet_() {
  var headers = [
    'ログID',              // A: VL_yyyyMMdd_HHmmss_xxxx
    '実行日時',            // B: ISO文字列
    '投稿ID',              // C: 下書きシートのpostId(Phase B統合時)
    '投稿タイプ',          // D: MORNING, INDICATOR等
    '抽出claim数',         // E: Step1で抽出された数
    'NG件数(❌)',          // F: Step2でWeb検索と矛盾と判定
    '要注意件数(⚠️)',      // G: Step2で裏付けが取れなかった
    'OK件数(✅)',          // H: Step2でWeb検索に裏付けあり
    '修正発動',            // I: TRUE/FALSE
    '修正前プレビュー',    // J: 原文先頭100文字
    '修正後プレビュー',    // K: 修正後先頭100文字
    '検証結果JSON'         // L: 全claim+verdictのJSON(最大50KB)
  ];
  return getOrCreateSheet_('対話型検証ログ', headers);
}


/**
 * 対話型検証のログを1行追加する
 *
 * executeInteractiveVerify_ の最後で呼ばれる。
 * 検証結果の統計・詳細をスプレッドシートに永続化する。
 *
 * 分析用途:
 *   - 投稿タイプ別のNG発生率を把握
 *   - 修正発動頻度からプロンプト品質を評価
 *   - よく検出される観点を洗い出し、プロンプト改善の根拠データに
 *
 * @param {Object} logData - ログに書き込むデータ
 * @param {string} logData.logId        - ログID(必須)
 * @param {string} logData.executedAt   - 実行日時ISO(必須)
 * @param {string} [logData.postId]     - 投稿ID(任意。Phase B統合後に設定される)
 * @param {string} logData.postType     - 投稿タイプ(必須)
 * @param {number} logData.extractedCount - 抽出claim数
 * @param {number} logData.ngCount      - ❌件数
 * @param {number} logData.warnCount    - ⚠️件数
 * @param {number} logData.okCount      - ✅件数
 * @param {boolean} logData.fixApplied  - 修正発動
 * @param {string} logData.originalText - 修正前テキスト(全文)
 * @param {string} logData.fixedText    - 修正後テキスト(全文)
 * @param {string} logData.resultJson   - 検証結果JSON(全claim+verdict)
 * @return {boolean} 成功ならtrue
 */
function logInteractiveVerify_(logData) {
  try {
    var sheet = getInteractiveVerifyLogSheet_();

    // 50KB上限対策(要件定義 6.2.3と同じパターン)
    // セル上限50,000文字に対し、JSONが大きすぎる場合はプレースホルダに差し替え
    var resultJson = logData.resultJson || '';
    if (resultJson.length > 50000) {
      console.log('⚠️ 検証結果JSONが50KB超過(' + resultJson.length + '文字) → オーバーフロー表記に差し替え');
      resultJson = JSON.stringify({ overflow: 'yes', originalLength: resultJson.length });
    }

    sheet.appendRow([
      logData.logId || '',
      logData.executedAt || new Date().toISOString(),
      logData.postId || '',
      logData.postType || '',
      logData.extractedCount || 0,
      logData.ngCount || 0,
      logData.warnCount || 0,
      logData.okCount || 0,
      logData.fixApplied ? 'TRUE' : 'FALSE',
      (logData.originalText || '').substring(0, 100),
      (logData.fixedText || '').substring(0, 100),
      resultJson
    ]);

    console.log('📋 対話型検証ログ書込み: ' + logData.logId + ' (' + logData.postType + ')');
    return true;
  } catch (e) {
    console.log('⚠️ 対話型検証ログ書込み失敗(続行): ' + e.message);
    return false;
  }
}


/**
 * ★v12.7 タスク17-d テスト: 対話型検証ログシートの動作確認
 *
 * GASエディタで testTask17dLogSheet() を実行することで、
 * ログシート作成・書込み・読み取りが正しく動作するか検証できる。
 */
function testTask17dLogSheet() {
  console.log('========================================');
  console.log('🧪 タスク17-d: 対話型検証ログシート動作テスト');
  console.log('========================================');
  console.log('');

  var passed = true;

  // 1. シート作成
  console.log('1. シート取得/作成');
  var sheet;
  try {
    sheet = getInteractiveVerifyLogSheet_();
    console.log('   ✅ シート取得成功: ' + sheet.getName());
    var lastCol = sheet.getLastColumn();
    console.log('   列数: ' + lastCol + ' (期待: 12)');
    if (lastCol < 12) {
      console.log('   ❌ 列数不足');
      passed = false;
    }
  } catch (e) {
    console.log('   ❌ シート取得エラー: ' + e.message);
    return false;
  }

  // 2. ログ書込み(テストデータ)
  console.log('');
  console.log('2. テストログ書込み');
  var testLogData = {
    logId: 'VL_TEST_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss') + '_' + Math.floor(Math.random() * 10000),
    executedAt: new Date().toISOString(),
    postId: 'TEST_POST_ID',
    postType: 'MORNING',
    extractedCount: 3,
    ngCount: 1,
    warnCount: 1,
    okCount: 1,
    fixApplied: true,
    originalText: '☕ おはようございます。📝テスト投稿。',
    fixedText: '☕ おはようございます。📝修正済みテスト投稿。',
    resultJson: JSON.stringify({
      claims: [
        { id: 1, text: 'テスト主張1', question: 'テスト質問1' },
        { id: 2, text: 'テスト主張2', question: 'テスト質問2' }
      ],
      results: [
        { id: 1, verdict: '❌', evidence: 'テスト根拠' },
        { id: 2, verdict: '✅', evidence: 'テスト根拠' }
      ]
    })
  };

  var beforeRows = sheet.getLastRow();
  var writeOk = logInteractiveVerify_(testLogData);
  if (!writeOk) {
    console.log('   ❌ 書込み失敗');
    return false;
  }

  var afterRows = sheet.getLastRow();
  if (afterRows !== beforeRows + 1) {
    console.log('   ❌ 行数が増えていない: ' + beforeRows + ' → ' + afterRows);
    passed = false;
  } else {
    console.log('   ✅ 行数増加確認: ' + beforeRows + ' → ' + afterRows);
  }

  // 3. 書き込んだ内容の検証
  console.log('');
  console.log('3. 書込み内容検証');
  var writtenRow = sheet.getRange(afterRows, 1, 1, 12).getValues()[0];
  // Google Sheetsは 'TRUE'/'FALSE' 文字列を自動的に Boolean型 に変換することがあるため、
  // I列の fixApplied は両方のケース(文字列'TRUE' / Boolean true)を許容する特殊チェック
  var fixAppliedActual = writtenRow[8];
  var fixAppliedOk = (fixAppliedActual === true || fixAppliedActual === 'TRUE');

  var checks = [
    { col: 'A (logId)',       expected: testLogData.logId,              actual: writtenRow[0] },
    { col: 'C (postId)',      expected: testLogData.postId,             actual: writtenRow[2] },
    { col: 'D (postType)',    expected: testLogData.postType,           actual: writtenRow[3] },
    { col: 'E (extracted)',   expected: testLogData.extractedCount,     actual: writtenRow[4] },
    { col: 'F (ng)',          expected: testLogData.ngCount,            actual: writtenRow[5] }
  ];
  for (var i = 0; i < checks.length; i++) {
    var c = checks[i];
    if (c.expected == c.actual) {
      console.log('   ✅ ' + c.col + ': ' + c.actual);
    } else {
      console.log('   ❌ ' + c.col + ': 期待=' + c.expected + ' 実際=' + c.actual);
      passed = false;
    }
  }
  // I列 fixApplied の特殊チェック(Google Sheetsの型変換を許容)
  if (fixAppliedOk) {
    console.log('   ✅ I (fixApplied): ' + fixAppliedActual + ' (Boolean型/文字列型どちらも許容)');
  } else {
    console.log('   ❌ I (fixApplied): 期待=TRUE or true, 実際=' + fixAppliedActual);
    passed = false;
  }

  // 4. 50KB超過時のオーバーフロー処理テスト
  console.log('');
  console.log('4. 50KB超過時のオーバーフロー処理');
  var hugeJson = JSON.stringify({ data: 'x'.repeat(60000) });  // 約60KB
  var overflowLogData = {
    logId: 'VL_TEST_OVERFLOW_' + Math.floor(Math.random() * 10000),
    executedAt: new Date().toISOString(),
    postType: 'MORNING',
    extractedCount: 0,
    ngCount: 0,
    warnCount: 0,
    okCount: 0,
    fixApplied: false,
    originalText: '',
    fixedText: '',
    resultJson: hugeJson
  };
  var overflowOk = logInteractiveVerify_(overflowLogData);
  if (overflowOk) {
    var overflowRow = sheet.getLastRow();
    var overflowContent = sheet.getRange(overflowRow, 12).getValue();
    if (overflowContent.indexOf('overflow') !== -1) {
      console.log('   ✅ 50KB超過時にオーバーフロー表記に差し替え');
    } else {
      console.log('   ⚠️ オーバーフロー差し替えが動作していない可能性');
    }
  }

  console.log('');
  console.log('========================================');
  if (passed) {
    console.log('🎉 タスク17-d テスト: 全項目合格');
  } else {
    console.log('⚠️ タスク17-d テスト: 一部失敗');
  }
  console.log('========================================');
  console.log('');
  console.log('💡 テスト用の行はスプレッドシートに残っています。');
  console.log('   不要なら手動で削除してください(VL_TEST_ で始まる行)。');

  return passed;
}
