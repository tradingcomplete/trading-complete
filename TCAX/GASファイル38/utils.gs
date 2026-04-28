/**
 * CompanaFXAutoPost - utils.gs
 * ユーティリティ関数
 */

// ===== 日付フォーマット =====
function formatDate(date, format) {
  return Utilities.formatDate(
    date || new Date(),
    'Asia/Tokyo',
    format || 'yyyy/MM/dd HH:mm:ss'
  );
}

// ===== ランダム遅延（Bot判定回避） =====
function addRandomDelay() {
  // ★v8.0: 投稿処理のsleepは最大60秒に制限（6分制限タイムアウト対策）
  // config.gsのRANDOM_DELAY_MAXはscheduler.gsのトリガーゆらぎ（分）にも使われるため、
  // ここでは独立した上限を設定する
  var maxDelaySec = 60; // 投稿処理の遅延上限（秒）
  var delayMs = Math.floor(Math.random() * (maxDelaySec * 1000 + 1));
  var delaySec = Math.round(delayMs / 1000);
  
  if (delaySec > 0) {
    console.log('ランダム遅延: ' + delaySec + '秒');
    Utilities.sleep(delayMs);
  }
  
  return delaySec;
}

// ===== エラーメール通知 =====
function sendErrorEmail(subject, body) {
  try {
    var recipient = Session.getActiveUser().getEmail();
    if (!recipient) {
      console.log('メールアドレスが取得できません');
      return false;
    }
    
    var fullSubject = '[CompanaFXAutoPost] ' + subject;
    var fullBody = '=== CompanaFXAutoPost エラー通知 ===\n\n' +
      '日時: ' + formatDate() + '\n\n' +
      body + '\n\n' +
      '---\n' +
      'このメールは自動送信されています。';
    
    GmailApp.sendEmail(recipient, fullSubject, fullBody);
    console.log('エラーメールを送信しました: ' + subject);
    return true;
  } catch (e) {
    console.log('メール送信失敗: ' + e.message);
    return false;
  }
}

// ===== 曜日名を取得 =====
function getDayName(date) {
  var days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[(date || new Date()).getDay()];
}

// ===== 今日のスケジュールを取得 =====
function getTodaySchedule() {
  var today = new Date();
  var dayOfWeek = today.getDay(); // 0=日, 1=月, ..., 6=土
  
  var schedule = SCHEDULE[dayOfWeek];
  if (!schedule) {
    console.log('今日（' + getDayName() + '）のスケジュールはありません');
    return null;
  }
  
  return {
    dayOfWeek: dayOfWeek,
    dayName: getDayName(),
    times: schedule.times,
    types: schedule.types,
    postCount: schedule.times.length
  };
}

// ===== アーキタイプ選択（マンネリ防止） =====
function selectArchetype(postType) {
  // 推奨アーキタイプを取得
  var recommended = ARCHETYPE_MAP[postType];
  if (!recommended || recommended.length === 0) {
    recommended = ARCHETYPES; // 全種類から選択
  }
  
  // 最近使ったアーキタイプを取得
  var recent = getRecentArchetypes(5);
  
  // 最近使っていないものを優先
  var candidates = [];
  for (var i = 0; i < recommended.length; i++) {
    if (recent.indexOf(recommended[i]) === -1) {
      candidates.push(recommended[i]);
    }
  }
  
  // 全部最近使った場合は推奨リストから選択
  if (candidates.length === 0) {
    candidates = recommended;
  }
  
  // ランダムに1つ選択
  var index = Math.floor(Math.random() * candidates.length);
  var selected = candidates[index];
  
  console.log('アーキタイプ選択: ' + selected +
    '（候補: ' + candidates.length + '件, 最近使用: ' + recent.length + '件）');
  
  return selected;
}

// ===== テキストの文字数チェック =====
function validateTextLength(text, postType) {
  var config = POST_TYPES[postType];
  if (!config) return { valid: true, length: text.length };
  
  var length = text.length;
  var valid = length >= config.charMin && length <= config.charMax;
  
  if (!valid) {
    console.log('文字数: ' + length +
      '（目標: ' + config.charMin + '〜' + config.charMax + '）' +
      (length < config.charMin ? ' → 短すぎ' : ' → 長すぎ'));
  }
  
  return {
    valid: valid,
    length: length,
    min: config.charMin,
    max: config.charMax
  };
}

// ===== テスト: ユーティリティ確認 =====
function testUtils() {
  console.log('=== Utils テスト ===');
  console.log('');
  
  // 日付フォーマット
  console.log('現在日時: ' + formatDate());
  console.log('曜日: ' + getDayName());
  
  // 今日のスケジュール
  console.log('');
  var schedule = getTodaySchedule();
  if (schedule) {
    console.log('今日のスケジュール（' + schedule.dayName + '曜日）:');
    console.log('投稿数: ' + schedule.postCount + '件');
    for (var i = 0; i < schedule.times.length; i++) {
      console.log('  ' + schedule.times[i] + ' → ' + schedule.types[i]);
    }
  }
  
  // アーキタイプ選択
  console.log('');
  console.log('アーキタイプ選択テスト:');
  console.log('MORNING → ' + selectArchetype('MORNING'));
  console.log('LONDON → ' + selectArchetype('LONDON'));
  
  // 文字数チェック
  console.log('');
  var testText = 'これはテスト文章です。'.repeat(20);
  var check = validateTextLength(testText, 'MORNING');
  console.log('文字数チェック: ' + check.length + '文字（目標: ' + check.min + '〜' + check.max + '）');
  
  console.log('');
  console.log('🎉 Utilsテスト完了！');
}


// ===== エラー段階化ヘルパー(★v14.2 T1-B・2026-04-24) =====

/**
 * エラーを段階別に処理する共通ヘルパー
 *
 * 背景: 事件14(Phase R-3 定数移動漏れ・1 日マスキング)の再発防止。
 *       従来の catch { console.log(続行) } パターンを段階化する。
 *
 * 段階:
 *   - critical: throw して停止(本来止めるべきエラー)
 *   - warning : 「エラー隠蔽ログ」シートに記録 + console.log + 続行
 *   - info    : console.log のみ + 続行
 *
 * 運用方針:
 *   - Day 2〜Day 8 の 1 週間は全て warning レベルで運用(観察期間)
 *   - エラー隠蔽ログを見て実際に発生したエラーを確認
 *   - 真に止めるべきエラーのみ critical に昇格
 *
 * @param {string} severity - 'critical' / 'warning' / 'info'
 * @param {string} context - 発生箇所(ファイル名:関数名)
 * @param {Error|string} error - エラーオブジェクト or メッセージ文字列
 * @param {Object} [meta] - 追加情報(任意・JSON シリアライズ可能なもの)
 */
function handleError_(severity, context, error, meta) {
  var timestamp = new Date().toISOString();
  var errorMsg = error && error.message ? error.message : String(error);

  if (severity === 'critical') {
    console.error('❌ [CRITICAL] ' + context + ': ' + errorMsg);
    // critical でも隠蔽ログには記録してから throw する(記録失敗しても throw は継続)
    try {
      _writeErrorLog_(timestamp, severity, context, errorMsg, meta);
    } catch (_) { /* ログ失敗は無視・throw を優先 */ }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(errorMsg);
  }

  if (severity === 'warning') {
    console.log('⚠️ [WARNING] ' + context + ': ' + errorMsg);
    try {
      _writeErrorLog_(timestamp, severity, context, errorMsg, meta);
    } catch (logErr) {
      // ログ書込失敗時はコンソールのみ(無限ループ防止のため handleError_ 自体は呼ばない)
      console.log('⚠️ handleError_: エラー隠蔽ログ書込失敗(続行): ' + logErr.message);
    }
    return;
  }

  // info(デフォルト)
  console.log('ℹ️ [INFO] ' + context + ': ' + errorMsg);
}

/**
 * エラー隠蔽ログシートへの書込(handleError_ 内部用)
 * @private
 */
function _writeErrorLog_(timestamp, severity, context, errorMsg, meta) {
  var keys = getApiKeys();
  if (!keys || !keys.SPREADSHEET_ID) return;
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('エラー隠蔽ログ');
  if (!sheet) return;
  sheet.appendRow([
    timestamp,
    severity,
    context,
    errorMsg,
    meta ? JSON.stringify(meta) : ''
  ]);
}


// ===== 修正パターンログ(★v14.2 T1-C・2026-04-24) =====

/**
 * 修正パターンをログシートに記録する
 *
 * 背景: Stage 2 の各修正が「どのタイプの誤りが何回修正されたか」の構造化データを持たない。
 *       Phase 5 プロンプト自動進化の素データとして、今日から蓄積する。
 *
 * 書込先: 「修正パターンログ」シート(11 列)
 *
 * @param {string} postType - 投稿タイプ(MORNING / INDICATOR / 等)
 * @param {string} errorType - 誤りタイプ(論理矛盾 / 事実誤り / Web検証NG / Web検証WARN / 品質:Q4 等)
 * @param {string} fixMethod - 修正方式(Claude修正 / 機械置換 / 行削除)
 * @param {string} beforeText - 誤り原文(100 字で切詰め)
 * @param {string} afterText - 修正後(100 字で切詰め)
 * @param {string} detectionLayer - 検出層(Stage1 / Stage2 / Step0.5 / 後処理)
 * @param {string} [reason] - 修正理由(任意)
 * @param {Array<string>} [keywords] - 関連キーワード(任意)
 */
function logCorrectionPattern_(postType, errorType, fixMethod, beforeText, afterText, detectionLayer, reason, keywords) {
  try {
    var keys = getApiKeys();
    if (!keys || !keys.SPREADSHEET_ID) return;
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('修正パターンログ');
    if (!sheet) return;

    var timestamp = new Date().toISOString();
    var postId = 'V13_' + timestamp.replace(/[-:.TZ]/g, '').substring(0, 14) + '_' + (postType || 'UNKNOWN');

    sheet.appendRow([
      timestamp,                                           // A 発生日時
      postId,                                              // B 投稿ID
      postType || '',                                      // C 投稿タイプ
      errorType || '',                                     // D 誤りタイプ
      fixMethod || '',                                     // E 修正方式
      (beforeText || '').toString().substring(0, 100),     // F 誤り原文
      (afterText || '').toString().substring(0, 100),      // G 修正後
      detectionLayer || '',                                // H 検出層
      (reason || '').toString().substring(0, 300),         // I 修正理由
      Array.isArray(keywords) ? keywords.join(', ') : (keywords || ''),  // J 関連キーワード
      ''                                                   // K Compana 後確認(空欄で作成)
    ]);
  } catch (e) {
    // ログ失敗でも本処理は続行(無限ループ防止)
    console.log('⚠️ logCorrectionPattern_ 失敗(続行): ' + e.message);
  }
}