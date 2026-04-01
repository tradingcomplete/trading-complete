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

// ===== 下書きシートを取得 =====
function getDraftsSheet_() {
  var headers = [
    '投稿ID', '生成日時', '投稿予定時刻', '投稿タイプ',
    '生成テキスト', 'バリデーション結果', 'ステータス', '承認日時'
  ];
  return getOrCreateSheet_(SHEET_NAMES.DRAFTS, headers);
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
    '下書き',
    ''
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

  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var pending = [];

  for (var i = 0; i < data.length; i++) {
    if (data[i][6] === '下書き') {
      pending.push({
        rowIndex: i + 2,
        postId: data[i][0],
        generatedAt: data[i][1],
        scheduledTime: data[i][2],
        postType: data[i][3],
        text: data[i][4],
        validationResult: data[i][5],
        status: data[i][6]
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

  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var approved = [];

  for (var i = 0; i < data.length; i++) {
    if (data[i][6] === '承認') {
      approved.push({
        rowIndex: i + 2,
        postId: data[i][0],
        generatedAt: data[i][1],
        scheduledTime: data[i][2],
        postType: data[i][3],
        text: data[i][4],
        validationResult: data[i][5],
        status: data[i][6]
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
      sheet.getRange(rowIndex, 7).setValue(newStatus);
      if (newStatus === '承認' || newStatus === '中止') {
        sheet.getRange(rowIndex, 8).setValue(
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
function expireOldDrafts() {
  var sheet = getDraftsSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow <= 1) return 0;

  var now = new Date();
  var expiryMs = VALIDATION_CONFIG.DRAFT_EXPIRY_MINUTES * 60 * 1000;
  var expiredCount = 0;

  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

  for (var i = 0; i < data.length; i++) {
    if (data[i][6] === '下書き') {
      var generatedAt = data[i][1];
      if (generatedAt) {
        var generated = new Date(generatedAt);
        if (now.getTime() - generated.getTime() > expiryMs) {
          var rowIndex = i + 2;
          sheet.getRange(rowIndex, 7).setValue('期限切れ');
          sheet.getRange(rowIndex, 8).setValue(
            Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss')
          );
          expiredCount++;
        }
      }
    }
  }

  if (expiredCount > 0) {
    console.log('⏰ ' + expiredCount + '件の下書きが期限切れになりました');
  }

  return expiredCount;
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