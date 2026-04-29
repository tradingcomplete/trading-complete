/**
 * CompanaFXAutoPost - approval.gs
 * 品質管理: Gmail通知、WebApp承認、バリデーション
 * 
 * 【このファイルの役割】
 *   ・下書きの承認/中止/画像再生成をGmailリンクから実行
 *   ・承認済み下書きを検知して投稿実行（画像付き対応）
 *   ・バリデーション（レベル2用）
 *   ・Gmail通知の送信
 * 
 * ★Phase 7: 画像付き承認フロー対応
 *   ・3ボタン化（承認/画像再生成/中止）
 *   ・メール内に画像プレビュー表示
 *   ・画像再生成は最大3回（超過でテキストのみ投稿）
 *   ・画像メタデータはScript Propertiesで管理
 */


// ========================================
// Gmail通知
// ========================================

/**
 * サロゲートペア絵文字をHTML数値参照に変換（GASメール文字化け対策）
 * 例: 📕 → &#x1F4D5;
 * GASのGmailApp.sendEmailはサロゲートペア文字を正しく送信できないため、
 * HTMLの数値参照に変換してから送信する
 */
function emojiToHtmlEntity_(text) {
  var result = '';
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    // サロゲートペアの上位（U+D800〜U+DBFF）
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      var lo = text.charCodeAt(i + 1);
      // サロゲートペアの下位（U+DC00〜U+DFFF）
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        var cp = ((code - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;
        result += '&#x' + cp.toString(16).toUpperCase() + ';';
        i++; // 下位サロゲートをスキップ
        continue;
      }
    }
    result += text.charAt(i);
  }
  return result;
}

/**
 * サロゲートペア文字（4バイト絵文字）を除去する（プレーンテキスト用）
 */
function stripSurrogatePairs_(text) {
  var result = '';
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      var lo = text.charCodeAt(i + 1);
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        i++; // サロゲートペアをスキップ
        continue;
      }
    }
    result += text.charAt(i);
  }
  return result;
}


// ========================================
// 画像メタデータ管理（Script Properties）
// ========================================

/**
 * 下書きの画像メタデータを保存
 * @param {string} postId - 投稿ID
 * @param {Object} imageData - { fileId, archetype, regenCount }
 */
function saveImageMeta_(postId, imageData) {
  var key = 'IMG_' + postId;
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(imageData));
}

/**
 * 下書きの画像メタデータを取得
 * @param {string} postId - 投稿ID
 * @returns {Object|null} { fileId, archetype, regenCount } or null
 */
function getImageMeta_(postId) {
  var key = 'IMG_' + postId;
  var data = PropertiesService.getScriptProperties().getProperty(key);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

/**
 * 下書きの画像メタデータを削除（投稿完了後のクリーンアップ）
 * @param {string} postId - 投稿ID
 */
function deleteImageMeta_(postId) {
  var key = 'IMG_' + postId;
  PropertiesService.getScriptProperties().deleteProperty(key);
}


// ========================================
// 画像をDriveに保存/取得
// ========================================

/**
 * 画像BlobをDriveに保存してファイルIDを返す
 * @param {Blob} imageBlob - 画像Blob
 * @param {string} postId - 投稿ID（ファイル名に使用）
 * @returns {string} DriveファイルID
 */
function saveImageToDrive_(imageBlob, postId) {
  var folderId = getApiKeys().IMAGE_FOLDER_ID;
  var folder = DriveApp.getFolderById(folderId);
  var fileName = 'draft_' + postId + '.png';
  
  // 既存ファイルがあれば削除（再生成用）
  var existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }
  
  var file = folder.createFile(imageBlob.setName(fileName));
  // 自分のメールで画像プレビューするためにアクセス設定
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return file.getId();
}

/**
 * DriveファイルIDから画像Blobを取得
 * @param {string} fileId - DriveファイルID
 * @returns {Blob|null} 画像Blob or null
 */
function getImageFromDrive_(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    return file.getBlob();
  } catch (e) {
    Logger.log('画像取得失敗: ' + e.message);
    return null;
  }
}


// ========================================
// 承認メール送信（3ボタン対応）
// ========================================

/**
 * 下書き一覧をGmailで通知する（HTML形式で絵文字文字化け防止）
 * ★Phase 7: 画像プレビュー + 3ボタン（承認/画像再生成/中止）
 * 
 * @param {Array} drafts - 下書きオブジェクトの配列
 *   各要素: { postId, scheduledTime, postType, text, imageFileId?(optional), archetype?(optional) }
 */
function sendDraftNotification(drafts) {
  if (!drafts || drafts.length === 0) return;
  
  var now = new Date();
  var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'M/d');
  var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  var dayName = dayNames[now.getDay()];
  
  // WebAppのURL（デプロイ後に設定）
  var webAppUrl = getWebAppUrl_();
  var sheetsUrl = 'https://docs.google.com/spreadsheets/d/' + getApiKeys().SPREADSHEET_ID;
  
  var subject = 'コンパナFX 投稿確認（' + dateStr + ' ' + dayName + '曜 ' + drafts.length + '件）';
  
  // HTML本文を構築（絵文字の文字化け防止）
  var html = '';
  html += '<div style="font-family:sans-serif; max-width:600px; margin:0 auto; padding:16px;">';
  html += '<h2 style="border-bottom:2px solid #1a73e8; padding-bottom:8px;">';
  html += 'コンパナFX 投稿確認 ' + dateStr + '（' + dayName + '） ' + drafts.length + '件</h2>';
  
  for (var i = 0; i < drafts.length; i++) {
    var draft = drafts[i];
    var typeEmoji = emojiToHtmlEntity_(getTypeEmoji_(draft.postType));
    var hasImage = !!(draft.imageFileId);
    
    html += '<div style="margin:16px 0; padding:12px; border:1px solid #ddd; border-radius:8px;">';
    html += '<div style="font-weight:bold; margin-bottom:8px;">';
    html += (i + 1) + '. ' + draft.scheduledTime + ' ' + typeEmoji + ' ' + draft.postType;
    if (hasImage) {
      html += ' ' + emojiToHtmlEntity_('🖼') + ' 画像あり';
    }
    html += '</div>';
    
    // ★ 画像プレビュー（画像がある場合のみ）
    if (hasImage) {
      html += '<div style="margin:8px 0; text-align:center;">';
      html += '<img src="https://drive.google.com/thumbnail?id=' + draft.imageFileId + '&sz=w560" ';
      html += 'alt="生成画像" style="max-width:100%; border-radius:6px; border:1px solid #eee;" />';
      if (draft.archetype) {
        html += '<div style="font-size:0.8rem; color:#888; margin-top:4px;">';
        html += emojiToHtmlEntity_('🎨') + ' ' + draft.archetype + '</div>';
      }
      html += '</div>';
    }
    
    // テキストを表示（改行をbrに変換）★v6.1.1: 全文表示に変更（300文字省略を廃止）
    var displayText = draft.text;
    // HTMLエスケープ + 改行変換 + 絵文字変換
    displayText = displayText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    displayText = emojiToHtmlEntity_(displayText);
    
    html += '<div style="white-space:pre-wrap; padding:8px; background:#f8f8f8; border-radius:4px; line-height:1.6;">';
    html += displayText;
    html += '</div>';
    
    // ★v12.7: 下書きシートから追加データを取得（FLASH_FALLBACK / FactCheckJSON共用）
    // Phase 3分割後は下書きシートに全データが保存される。
    // 旧フロー（ScriptProperties経由）も後方互換として残す。
    var draftSheetData = null;
    try {
      draftSheetData = getDraftById_(draft.postId);
    } catch (dsErr) {
      // 取得失敗してもScriptPropertiesフォールバックで続行
      console.log('⚠️ 下書きシート読み取りスキップ（ScriptPropertiesで代替）: ' + dsErr.message);
    }

    // ★v12.2: Flashフォールバック通知
    try {
      var props = PropertiesService.getScriptProperties();
      // ★v12.7: 下書きシートのFlashFallbackUsed列を優先、ScriptPropertiesはフォールバック
      var flashUsed = null;
      if (draftSheetData && draftSheetData.flashFallbackUsed) {
        flashUsed = 'claude';
      } else {
        flashUsed = props.getProperty('FLASH_FALLBACK_USED');
      }
      if (flashUsed) {
        html += '<div style="margin:10px 0; padding:8px 12px; background:#fff3e0; border-left:4px solid #ff9800; border-radius:4px; font-size:0.9rem; color:#e65100;">';
        if (flashUsed === 'claude') {
          html += '&#x26A0;&#xFE0F; Gemini Pro 503 &#x2192; Claudeで代替生成';
        } else {
          html += '&#x26A0;&#xFE0F; Gemini Pro 503 &#x2192; 代替モデルで生成（品質が通常と異なる可能性）';
        }
        html += '</div>';
        props.deleteProperty('FLASH_FALLBACK_USED');  // 旧フローのクリーンアップ
      }
    } catch (flashErr) {
      // 表示失敗しても投稿処理には影響なし
    }
    
    // ★v6.1: ファクトチェック結果をメールに追加
    try {
      var props = PropertiesService.getScriptProperties();
      // ★v12.7: 下書きシートのFactCheckJSON列を優先、ScriptPropertiesはフォールバック
      var factCheckJson = null;
      if (draftSheetData && draftSheetData.factCheckJson) {
        factCheckJson = draftSheetData.factCheckJson;
      } else {
        factCheckJson = props.getProperty('LAST_FACT_CHECK_' + draft.postType);
      }
      if (factCheckJson) {
        var fc = JSON.parse(factCheckJson);
        
        var fcAllOk = fc.summary && fc.summary.indexOf('✅') !== -1 && !fc.wasFixed;
        var fcHasIssue = fc.summary && (fc.summary.indexOf('❌') !== -1 || fc.summary.indexOf('⚠') !== -1);
        
        if (fcAllOk) {
          // パターン1: 全て正確 → 緑の1行
          html += '<div style="margin:10px 0; padding:8px 12px; background:#e8f5e9; border-left:4px solid #00c853; border-radius:4px; font-size:0.9rem; color:#2e7d32;">';
          html += '&#x2705; ファクトチェック: 全て正確';
          html += '</div>';
        } else if (fcHasIssue || fc.wasFixed) {
          // パターン2/3: 問題あり / 自動修正あり → オレンジ枠で問題項目のみ
          html += '<div style="margin:10px 0; padding:10px; background:#fff8e1; border-left:4px solid #ff9800; border-radius:4px; font-size:0.9rem;">';
          html += '<div style="font-weight:bold; margin-bottom:6px; color:#e65100;">&#x26A0;&#xFE0F; ファクトチェック: ' + emojiToHtmlEntity_(fc.summary) + '</div>';
          
          // ❌/⚠️の項目のみ抽出して表示（✅は省略）
          if (fc.details) {
            var issueLines = fc.details.split('\n').filter(function(line) {
              return line.indexOf('❌') !== -1 || line.indexOf('⚠') !== -1;
            });
            if (issueLines.length > 0) {
              var issueHtml = issueLines.join('\n')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
              issueHtml = emojiToHtmlEntity_(issueHtml);
              html += '<div style="margin:4px 0; line-height:1.8;">' + issueHtml + '</div>';
            }
          }
          
          // 自動修正あり → 修正内容を簡潔に表示（修正前テキストは廃止）
          if (fc.wasFixed && fc.fixLog) {
            var fixLogHtml = fc.fixLog
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\n/g, '<br>');
            fixLogHtml = emojiToHtmlEntity_(fixLogHtml);
            html += '<div style="margin-top:6px; padding:6px; background:#fff3e0; border-radius:4px;">';
            html += '<span style="font-weight:bold;">&#x1F527; 自動修正済み</span><br>';
            html += '<div style="margin-top:4px; line-height:1.6;">' + fixLogHtml + '</div>';
            html += '</div>';
          }
          
          html += '</div>';
        }
        
        // 使用後に削除
        props.deleteProperty('LAST_FACT_CHECK_' + draft.postType);
      }
    } catch (fcErr) {
      console.log('⚠️ ファクトチェック結果のメール添付スキップ: ' + fcErr.message);
    }
    
    // ★ 3ボタン（承認 / 画像再生成 / 中止）
    html += '<div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">';
    if (webAppUrl) {
      // 承認ボタン（緑）
      html += '<a href="' + webAppUrl + '?action=approve&id=' + encodeURIComponent(draft.postId) + '" ';
      html += 'style="display:inline-block; padding:10px 20px; background:#00c853; color:white; text-decoration:none; border-radius:4px; font-weight:bold; font-size:15px;">';
      html += '&#x2705; 承認する</a> ';
      
      // 画像再生成ボタン（青）- 画像ありの場合のみ表示
      if (hasImage) {
        html += '<a href="' + webAppUrl + '?action=regenerate&id=' + encodeURIComponent(draft.postId) + '" ';
        html += 'style="display:inline-block; padding:10px 20px; background:#1a73e8; color:white; text-decoration:none; border-radius:4px; font-weight:bold; font-size:15px;">';
        html += '&#x1F504; 画像を再生成</a> ';
      }
      
      // 中止ボタン（赤）
      html += '<a href="' + webAppUrl + '?action=cancel&id=' + encodeURIComponent(draft.postId) + '" ';
      html += 'style="display:inline-block; padding:10px 20px; background:#f44336; color:white; text-decoration:none; border-radius:4px; font-weight:bold; font-size:15px;">';
      html += '&#x274C; 中止する</a>';
    } else {
      html += '<span style="color:#ff9800;">&#x26A0;&#xFE0F; WebApp未設定 → Sheetsで直接ステータスを変更してください</span>';
    }
    html += '</div>';

    // ★v14.2 T1-D: 却下理由タグボタン(任意・Phase 5 教師データに活用)
    if (webAppUrl) {
      html += '<div style="margin-top:12px; padding:10px; background:#fff3e0; border-left:4px solid #ff9800; border-radius:4px; font-size:13px;">';
      html += '<div style="margin-bottom:8px; color:#666; font-weight:bold;">&#x1F4DD; 却下理由付き(理由を添えて中止・Phase 5 教師データ)</div>';
      html += '<div style="display:flex; gap:6px; flex-wrap:wrap;">';
      var rejectReasons = [
        { tag: 'number',     label: '&#x274C; 数値誤り' },
        { tag: 'name',       label: '&#x274C; 固有名詞誤り' },
        { tag: 'logic',      label: '&#x274C; 論理矛盾' },
        { tag: 'fact_other', label: '&#x274C; 事実誤り(その他)' },
        { tag: 'tone',       label: '&#x274C; トーン不適' },
        { tag: 'timing',     label: '&#x274C; タイミング不適' },
        { tag: 'duplicate',  label: '&#x274C; 重複' },
        { tag: 'thin',       label: '&#x274C; 内容薄い' },
        { tag: 'other',      label: '&#x274C; その他' }
      ];
      for (var rr = 0; rr < rejectReasons.length; rr++) {
        html += '<a href="' + webAppUrl + '?action=reject&reason=' + rejectReasons[rr].tag + '&id=' + encodeURIComponent(draft.postId) + '" ';
        html += 'style="display:inline-block; padding:6px 10px; background:#fff; color:#d32f2f; text-decoration:none; border:1px solid #d32f2f; border-radius:4px; font-size:12px; font-weight:bold;">';
        html += rejectReasons[rr].label + '</a>';
      }
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
  }
  
  // Sheetsリンク
  html += '<div style="margin-top:16px; padding:8px; background:#e8f0fe; border-radius:4px; text-align:center;">';
  html += emojiToHtmlEntity_('📋') + ' <a href="' + sheetsUrl + '" style="color:#1a73e8;">Sheets下書き確認</a>';
  html += '</div>';
  
  html += '</div>';
  
  // プレーンテキストのフォールバック（サロゲートペア絵文字は除去）
  var plainBody = '';
  for (var j = 0; j < drafts.length; j++) {
    plainBody += (j + 1) + '. ' + drafts[j].scheduledTime + ' ' + drafts[j].postType + '\n';
    plainBody += stripSurrogatePairs_(drafts[j].text) + '\n\n';
  }
  
  // HTML形式で送信（絵文字が正しく表示される）
  var recipientEmail = Session.getActiveUser().getEmail();
  console.log('📧 送信先アドレス: [' + recipientEmail + ']');
  console.log('📧 件名: ' + subject);
  console.log('📧 HTML長: ' + html.length + '文字');
  GmailApp.sendEmail(
    recipientEmail,
    subject,
    plainBody,
    { htmlBody: html }
  );
  
  console.log('📧 通知メールを送信しました（' + drafts.length + '件）');
}

/**
 * 投稿タイプに対応する絵文字を返す
 * ★v13.0.9(2026-04-20): NY削除の残骸整理(v12.7でNYタイプ廃止済み)
 * ★2026-04-29: TOKYO削除(平日5投稿→4投稿)
 */
function getTypeEmoji_(postType) {
  var emojis = {
    'MORNING': '🌅',
    'LUNCH': '🍱',
    'LONDON': '🌆',
    'GOLDEN': '🔥',
    'INDICATOR': '⚡',
    'WEEKLY_REVIEW': '📋',
    'RULE_1': '🧠',
    'RULE_2': '💪',
    'RULE_3': '🧠',
    'RULE_4': '💡',
    'WEEKLY_LEARNING': '📝',
    'NEXT_WEEK': '🔮',
    'WEEKLY_HYPOTHESIS': '💭',
    'KNOWLEDGE': '📕'
  };
  return emojis[postType] || '📄';
}

/**
 * WebAppのURLを取得（スクリプトプロパティから）
 */
function getWebAppUrl_() {
  try {
    return PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
  } catch (e) {
    return '';
  }
}


// ========================================
// WebApp（承認リンクの受け口）
// ========================================

/**
 * GETリクエストを処理（メールのリンクをタップした時に呼ばれる）
 * 
 * ★Phase 7: 3アクション対応
 *   - approve: 承認 → 投稿キューに入れる
 *   - regenerate: 画像再生成 → 新しいメールを送信（最大3回）
 *   - cancel: 中止 → 投稿しない
 */
function doGet(e) {
  var action = e.parameter.action;
  var postId = e.parameter.id;
  
  if (!action || !postId) {
    return HtmlService.createHtmlOutput(
      '<h2>&#x26A0;&#xFE0F; パラメータが不足しています</h2>'
    );
  }
  
  var resultHtml = '';
  
  // ==================
  // 承認
  // ==================
  if (action === 'approve') {
    var success = updateDraftStatus(postId, '承認');
    if (success) {
      resultHtml = '<div style="text-align:center; padding:40px; font-family:sans-serif;">' +
        '<h1 style="color:#00c853;">&#x2705; 承認しました</h1>' +
        '<p style="font-size:18px;">投稿ID: ' + postId + '</p>' +
        '<p style="color:#666;">5分以内に自動で投稿されます。</p>' +
        '<p style="margin-top:30px;"><a href="https://docs.google.com/spreadsheets/d/' + 
        getApiKeys().SPREADSHEET_ID + '" style="color:#1a73e8;">Sheetsで確認</a></p>' +
        '</div>';
    } else {
      resultHtml = buildNotFoundHtml_(postId);
    }
  
  // ==================
  // 画像再生成（非同期: フラグを立てて即返す）
  // ==================
  } else if (action === 'regenerate') {
    // ★タイムアウト対策: 重い処理はトリガーに委譲し、即座にページを返す
    var regenMeta = getImageMeta_(postId);
    var regenCount = regenMeta ? (regenMeta.regenCount || 0) : 0;
    var MAX_REGEN_CHECK = 3;

    if (!regenMeta) {
      resultHtml = '<div style="text-align:center; padding:40px; font-family:sans-serif;">' +
        '<h1 style="color:#ff9800;">&#x26A0;&#xFE0F; 画像データが見つかりません</h1>' +
        '<p>投稿ID: ' + postId + '</p>' +
        '<p>画像なしの投稿として承認してください。</p>' +
        '</div>';
    } else if (regenCount >= MAX_REGEN_CHECK) {
      resultHtml = '<div style="text-align:center; padding:40px; font-family:sans-serif;">' +
        '<h1 style="color:#ff9800;">&#x26A0;&#xFE0F; 再生成上限（' + MAX_REGEN_CHECK + '回）に達しました</h1>' +
        '<p>投稿ID: ' + postId + '</p>' +
        '<p style="color:#666;">現在の画像で承認するか、中止してください。</p>' +
        '<p style="margin-top:20px;">' +
        '<a href="' + getWebAppUrl_() + '?action=approve&id=' + encodeURIComponent(postId) + '" ' +
        'style="display:inline-block; padding:10px 24px; background:#00c853; color:white; text-decoration:none; border-radius:4px; font-weight:bold;">&#x2705; 承認する</a>' +
        '&nbsp;&nbsp;' +
        '<a href="' + getWebAppUrl_() + '?action=cancel&id=' + encodeURIComponent(postId) + '" ' +
        'style="display:inline-block; padding:10px 24px; background:#f44336; color:white; text-decoration:none; border-radius:4px; font-weight:bold;">&#x274C; 中止する</a>' +
        '</p></div>';
    } else {
      // フラグを立てるだけで即返す（重い処理はトリガーに任せる）
      PropertiesService.getScriptProperties().setProperty('REGEN_REQUEST_' + postId, 'pending');
      console.log('🔄 再生成リクエスト受付: ' + postId);
      resultHtml = '<div style="text-align:center; padding:40px; font-family:sans-serif;">' +
        '<h1 style="color:#1a73e8;">&#x1F504; リクエストを受け付けました</h1>' +
        '<p style="font-size:18px;">投稿ID: ' + postId + '</p>' +
        '<p style="color:#666;">5分以内に新しいメールが届きます。</p>' +
        '<p style="margin-top:16px; color:#999; font-size:0.9rem;">このページは閉じて構いません。</p>' +
        '</div>';
    }
  
  // ==================
  // 中止
  // ==================
  } else if (action === 'cancel') {
    var success = updateDraftStatus(postId, '中止');
    if (success) {
      // 画像メタデータもクリーンアップ
      deleteImageMeta_(postId);

      resultHtml = '<div style="text-align:center; padding:40px; font-family:sans-serif;">' +
        '<h1 style="color:#f44336;">&#x274C; 中止しました</h1>' +
        '<p style="font-size:18px;">投稿ID: ' + postId + '</p>' +
        '<p style="color:#666;">この投稿は投稿されません。</p>' +
        '</div>';
    } else {
      resultHtml = buildNotFoundHtml_(postId);
    }

  // ==================
  // 却下(理由付き・★v14.2 T1-D)
  // ==================
  } else if (action === 'reject') {
    var reason = e.parameter.reason || 'other';
    var reasonLabels = {
      number:     '数値誤り',
      name:       '固有名詞誤り',
      logic:      '論理矛盾',
      fact_other: '事実誤り(その他)',
      tone:       'トーン不適',
      timing:     'タイミング不適',
      duplicate:  '重複',
      thin:       '内容薄い',
      other:      'その他'
    };
    var reasonLabel = reasonLabels[reason] || 'その他';

    var rejectSuccess = updateDraftStatus(postId, '中止');
    if (rejectSuccess) {
      deleteImageMeta_(postId);
      // 却下理由をログシートに記録
      _logRejectionReason_(postId, reason, reasonLabel);

      resultHtml = '<div style="text-align:center; padding:40px; font-family:sans-serif;">' +
        '<h1 style="color:#f44336;">&#x274C; 却下しました</h1>' +
        '<p style="font-size:18px;">投稿ID: ' + postId + '</p>' +
        '<p style="font-size:16px; color:#d32f2f;">理由: <strong>' + reasonLabel + '</strong></p>' +
        '<p style="color:#666;">この投稿は投稿されません。Phase 5 の教師データとして記録されました。</p>' +
        '</div>';
    } else {
      resultHtml = buildNotFoundHtml_(postId);
    }
  } else {
    resultHtml = '<h2>&#x26A0;&#xFE0F; 不明なアクションです</h2>';
  }
  
  return HtmlService.createHtmlOutput(resultHtml)
    .setTitle('コンパナFX 投稿承認');
}


/**
 * 保留中の再生成リクエストを処理する（トリガーから呼ばれる）
 * processApprovedDrafts() の冒頭で呼び出される
 *
 * ★タイムアウト対策:
 *   doGet は即座に「受け付けました」を返し、
 *   実際の画像生成はこの関数で行う（6分制限のトリガー内）
 */
function processPendingRegenRequests_() {
  var MAX_REGEN = 3;
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();

  // REGEN_REQUEST_ で始まるキーを全件検索
  var pendingKeys = Object.keys(allProps).filter(function(k) {
    return k.indexOf('REGEN_REQUEST_') === 0 && allProps[k] === 'pending';
  });

  if (pendingKeys.length === 0) return;

  console.log('🔄 再生成リクエスト処理: ' + pendingKeys.length + '件');

  for (var i = 0; i < pendingKeys.length; i++) {
    var postId = pendingKeys[i].replace('REGEN_REQUEST_', '');

    try {
      // フラグを「処理中」に更新（二重処理防止）
      props.setProperty('REGEN_REQUEST_' + postId, 'processing');

      var imageMeta = getImageMeta_(postId);
      if (!imageMeta) {
        console.log('⚠️ 再生成スキップ（画像メタなし）: ' + postId);
        props.deleteProperty('REGEN_REQUEST_' + postId);
        continue;
      }

      var regenCount = imageMeta.regenCount || 0;
      if (regenCount >= MAX_REGEN) {
        console.log('⚠️ 再生成スキップ（上限超過）: ' + postId);
        props.deleteProperty('REGEN_REQUEST_' + postId);
        continue;
      }

      var draftData = getDraftById_(postId);
      if (!draftData) {
        console.log('⚠️ 再生成スキップ（下書きなし）: ' + postId);
        props.deleteProperty('REGEN_REQUEST_' + postId);
        continue;
      }

      // ★v11.0: スプレッドシートから読み取ったテキストをログ出力（編集反映の確認用）
      console.log('📝 下書きテキスト（スプレッドシートE列）: ' + (draftData.text || '').substring(0, 80) + '...');
      console.log('🎨 画像再生成開始: ' + postId + '（' + (regenCount + 1) + '/' + MAX_REGEN + '回目）');

      var result = regeneratePostImage(draftData.text, draftData.postType, imageMeta.archetype);

      if (!result) {
        console.log('❌ 画像再生成失敗: ' + postId);
        props.deleteProperty('REGEN_REQUEST_' + postId);
        continue;
      }

      // 新しい画像をDriveに保存
      var newFileId = saveImageToDrive_(result.blob, postId);

      // メタデータ更新
      saveImageMeta_(postId, {
        fileId: newFileId,
        archetype: result.archetype,
        regenCount: regenCount + 1
      });

      // 新しい承認メールを送信
      sendDraftNotification([{
        postId: draftData.postId,
        scheduledTime: draftData.scheduledTime || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm'),
        postType: draftData.postType,
        text: draftData.text,
        imageFileId: newFileId,
        archetype: result.archetype
      }]);

      console.log('✅ 再生成完了・メール送信: ' + postId + '（アーキタイプ: ' + result.archetype + '）');

      // フラグを削除（処理完了）
      props.deleteProperty('REGEN_REQUEST_' + postId);

    } catch (e) {
      console.log('❌ 再生成エラー: ' + postId + ' - ' + e.message);
      props.deleteProperty('REGEN_REQUEST_' + postId);
    }
  }
}


/**
 * 下書きデータをIDで取得するヘルパー
 *
 * ★v12.7: この関数は sheetsManager.gs に統合されました（全14フィールド対応版）。
 * 本ファイル内の重複定義を削除し、sheetsManager.gs の getDraftById_ を使用します。
 * 戻り値の postId/postType/text/scheduledTime は完全に後方互換です。
 */


/**
 * 「見つかりません」共通HTML
 */
function buildNotFoundHtml_(postId) {
  return '<div style="text-align:center; padding:40px; font-family:sans-serif;">' +
    '<h1 style="color:#ff9800;">&#x26A0;&#xFE0F; 見つかりません</h1>' +
    '<p>投稿ID: ' + postId + '</p>' +
    '<p>既に処理済みか、期限切れの可能性があります。</p>' +
    '</div>';
}


// ========================================
// 承認チェック（5分おきに実行）
// ========================================

/**
 * 承認済みの下書きを検知して投稿する
 * スケジューラから5分おきに呼ばれる
 * ★Phase 7: 画像付き投稿対応
 */
function processApprovedDrafts() {
  // 期限切れチェック
  expireOldDrafts();

  // ★ 保留中の再生成リクエストを処理
  processPendingRegenRequests_();

  // 承認済みを取得
  var approved = getApprovedDrafts();
  
  if (approved.length === 0) return;
  
  console.log('📬 承認済み ' + approved.length + '件を検知');
  
  for (var i = 0; i < approved.length; i++) {
    var draft = approved[i];
    
    try {
      // ★v11.0: 投稿直前にスプレッドシートから再読み込み（手動編集を確実に反映）
      var latestDraft = getDraftById_(draft.postId);
      if (latestDraft && latestDraft.text) {
        if (latestDraft.text !== draft.text) {
          console.log('📝 スプレッドシート編集を検出 → 最新テキストを使用');
          console.log('  変更前: ' + draft.text.substring(0, 50) + '...');
          console.log('  変更後: ' + latestDraft.text.substring(0, 50) + '...');
        }
        draft.text = latestDraft.text;
      }
      
      // ★ 画像メタデータがあれば画像付き投稿
      var imageMeta = getImageMeta_(draft.postId);
      var imageBlob = null;
      
      if (imageMeta && imageMeta.fileId) {
        imageBlob = getImageFromDrive_(imageMeta.fileId);
        if (imageBlob) {
          console.log('🖼 画像付き投稿: ' + imageMeta.archetype);
        } else {
          console.log('⚠️ 画像取得失敗 → テキストのみで投稿');
        }
      }
      
      // X APIで投稿（画像あり/なし自動判定）
      var result = executePostToX_(draft.text, imageBlob);
      
      if (result && result.success) {
        // 下書きステータスを「投稿済み」に
        updateDraftStatus(draft.postId, '投稿済み');
        
        // 投稿履歴にも保存
        savePost({
          postNumber: draft.postId,
          typeName: draft.postType,
          text: draft.text,
          hasImage: !!imageBlob,
          archetype: (imageMeta && imageMeta.archetype) || '',
          hypothesis: '',
          learning: '',
          tweetId: result.tweetId || '',
          status: '成功'
        });
        
        console.log('✅ 投稿完了: ' + draft.postId + ' → ' + (result.tweetId || ''));
        
        // 学びログ自動蓄積 ★v5.6修正: extractPostInsights_に統合（仮説+学び+学びログ）
        try {
          extractPostInsights_(draft.postType, draft.text);
        } catch (learningErr) {
          console.log('📝 インサイト抽出スキップ: ' + learningErr.message);
        }
      } else {
        console.log('❌ 投稿失敗: ' + draft.postId);
        updateDraftStatus(draft.postId, '投稿エラー');
        logError(draft.postType, 'X API投稿失敗');
      }
      
      // 画像メタデータをクリーンアップ
      deleteImageMeta_(draft.postId);
      
    } catch (e) {
      console.log('❌ 投稿エラー: ' + draft.postId + ' - ' + e.message);
      logError(draft.postType, e.message);
      // エラーでもステータスは変更（リトライ防止）
      updateDraftStatus(draft.postId, '投稿エラー');
      deleteImageMeta_(draft.postId);
    }
    
    // X API制限対策：複数件ある場合は間隔を空ける
    if (i < approved.length - 1) {
      Utilities.sleep(3000);
    }
  }
}


// ========================================
// バリデーション（レベル2用）
// ========================================

/**
 * 生成テキストをバリデーションチェック
 * @param {string} text - 生成されたテキスト
 * @param {string} postType - 投稿タイプ
 * @returns {Object} {passed: boolean, errors: string[]}
 */
function validatePost(text, postType) {
  var errors = [];
  var now = new Date();
  var currentYear = VALIDATION_CONFIG.CURRENT_YEAR;
  
  // ① アスタリスクチェック
  if (text.indexOf('*') !== -1) {
    errors.push('アスタリスク（*）が含まれています');
  }
  
  // ② 古い年号チェック
  for (var y = currentYear - 3; y < currentYear; y++) {
    if (text.indexOf(y + '年') !== -1) {
      errors.push('古い年号 ' + y + '年 が含まれています');
    }
  }
  
  // ③ 禁止表現チェック
  var banned = VALIDATION_CONFIG.BANNED_WORDS;
  for (var i = 0; i < banned.length; i++) {
    if (text.indexOf(banned[i]) !== -1) {
      errors.push('禁止表現「' + banned[i] + '」が含まれています');
    }
  }
  
  // ④ 文字数チェック
  if (text.length > 500) {
    errors.push('文字数超過: ' + text.length + '文字（上限500）');
  }
  if (text.length < 50) {
    errors.push('文字数不足: ' + text.length + '文字（最低50）');
  }
  
  // ⑤ レート範囲チェック（ドル円の数値を検出）
  var rateMatch = text.match(/(\d{2,3}\.\d{1,2})円/g);
  if (rateMatch) {
    for (var j = 0; j < rateMatch.length; j++) {
      var rate = parseFloat(rateMatch[j].replace('円', ''));
      if (rate < VALIDATION_CONFIG.USDJPY_MIN || rate > VALIDATION_CONFIG.USDJPY_MAX) {
        errors.push('レート範囲外: ' + rateMatch[j] + '（想定: ' + 
          VALIDATION_CONFIG.USDJPY_MIN + '〜' + VALIDATION_CONFIG.USDJPY_MAX + '円）');
      }
    }
  }
  
  // ⑥ 日付の整合性チェック（月/日が現実的か）
  var dateMatch = text.match(/(\d{1,2})月(\d{1,2})日/g);
  if (dateMatch) {
    var todayMonth = now.getMonth() + 1;
    var todayDate = now.getDate();
    for (var k = 0; k < dateMatch.length; k++) {
      var parts = dateMatch[k].match(/(\d{1,2})月(\d{1,2})日/);
      var month = parseInt(parts[1]);
      if (Math.abs(month - todayMonth) > 1 && !(todayMonth === 1 && month === 12) && !(todayMonth === 12 && month === 1)) {
        errors.push('日付が離れすぎ: ' + dateMatch[k] + '（今日: ' + todayMonth + '月' + todayDate + '日）');
      }
    }
  }
  
  return {
    passed: errors.length === 0,
    errors: errors,
    summary: errors.length === 0 ? 'OK' : errors.join(' / ')
  };
}


// ========================================
// 承認チェックトリガーの設定
// ========================================

/**
 * 5分おきの承認チェックトリガーを設定（1回だけ実行）
 */
function setupApprovalChecker() {
  // 既存の承認チェックトリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processApprovedDrafts') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 5分おきトリガーを設定
  ScriptApp.newTrigger('processApprovedDrafts')
    .timeBased()
    .everyMinutes(5)
    .create();
  
  console.log('✅ 承認チェックトリガーを設定しました（5分おき）');
  console.log('processApprovedDraftsが5分ごとに実行されます。');
}

/**
 * 承認チェックトリガーを停止
 */
function stopApprovalChecker() {
  var triggers = ScriptApp.getProjectTriggers();
  var count = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processApprovedDrafts') {
      ScriptApp.deleteTrigger(triggers[i]);
      count++;
    }
  }
  console.log('✅ 承認チェックトリガーを' + count + '件停止しました');
}


// ========================================
// テスト用関数
// ========================================

/**
 * 通知メールのテスト（実際には投稿しない）
 * ★Phase 7: 画像プレビュー付きテスト
 */
function testNotification() {
  console.log('=== 通知メール テスト ===');
  
  var testDrafts = [
    {
      postId: 'TEST_20260301_083000_MORNING',
      scheduledTime: '08:30',
      postType: 'MORNING',
      text: '📕ドル円156円台で拮抗する力。\n\n日銀利上げ観測で円高圧力が強まる一方、実需のドル買いが下値を支えている。\n\n米CPI：分岐点\n\n→ここから抜ける方向が今週のトレンドを決める。\n\n#FX #ドル円',
      imageFileId: null,  // テスト用に画像なし
      archetype: null
    },
    {
      postId: 'TEST_20260301_152000_LONDON',
      scheduledTime: '15:20',
      postType: 'LONDON',
      text: '📕ロンドン勢参入。欧州時間の初動に注目。\n\nユーロドルが1.0850付近で攻防中。\nここを抜けるとストップを巻き込みそう。\n\n→東京の安値を割るかどうかが鍵。\n\n#FX #EURUSD',
      imageFileId: null,
      archetype: null
    }
  ];
  
  sendDraftNotification(testDrafts);
  console.log('✅ テスト通知を送信しました。Gmailを確認してください。');
}

/**
 * 画像付き通知メールのテスト
 * ★事前に testImageGeneration を実行して画像IDを取得しておく
 */
function testNotificationWithImage() {
  console.log('=== 画像付き通知メール テスト ===');
  
  // テスト用に画像を生成
  var testText = '📕ドル円156円台。日銀利上げ観測と実需ドル買いが拮抗。\n米CPIが分岐点。';
  var imageResult = generatePostImage(testText, 'MORNING');
  
  if (!imageResult) {
    console.log('❌ テスト画像生成失敗');
    return;
  }
  
  // 画像をDriveに保存
  var testPostId = 'TEST_IMG_' + Date.now();
  var fileId = saveImageToDrive_(imageResult.blob, testPostId);
  console.log('💾 テスト画像保存: ' + fileId);
  
  // メタデータ保存
  saveImageMeta_(testPostId, {
    fileId: fileId,
    archetype: imageResult.archetype,
    regenCount: 0
  });
  
  // メール送信
  sendDraftNotification([{
    postId: testPostId,
    scheduledTime: '08:30',
    postType: 'MORNING',
    text: testText,
    imageFileId: fileId,
    archetype: imageResult.archetype
  }]);
  
  console.log('✅ 画像付きテスト通知を送信しました。Gmailを確認してください。');
  console.log('   アーキタイプ: ' + imageResult.archetype);
  console.log('   画像ID: ' + fileId);
}

/**
 * バリデーションのテスト
 */
function testValidation() {
  console.log('=== バリデーション テスト ===');
  
  // 正常なテキスト
  var text1 = 'ドル円は153.50円で推移中。今週のFOMCが鍵ですね。\nここを抜けるかどうか、正直読みにくいかなと。';
  var result1 = validatePost(text1, 'MORNING');
  console.log('テスト1（正常）: ' + (result1.passed ? 'PASS ✅' : 'FAIL ❌ ' + result1.summary));
  
  // アスタリスク含む
  var text2 = '今週の注目ポイント:\n* ドル円\n* ユーロ円';
  var result2 = validatePost(text2, 'MORNING');
  console.log('テスト2（アスタリスク）: ' + (result2.passed ? 'PASS ✅' : 'FAIL ❌ ' + result2.summary));
  
  // 古い年号
  var text3 = '2024年のFOMCでは利上げが続きましたが、今年は違う展開ですね。';
  var result3 = validatePost(text3, 'MORNING');
  console.log('テスト3（古い年号）: ' + (result3.passed ? 'PASS ✅' : 'FAIL ❌ ' + result3.summary));
  
  // レート範囲外
  var text4 = 'ドル円は53.50円まで急落。歴史的な下落ですね。';
  var result4 = validatePost(text4, 'MORNING');
  console.log('テスト4（レート範囲外）: ' + (result4.passed ? 'PASS ✅' : 'FAIL ❌ ' + result4.summary));
  
  // 禁止表現
  var text5 = '本日はドル円について解説いたします。フォロワーの皆様、いかがでしょうか。';
  var result5 = validatePost(text5, 'MORNING');
  console.log('テスト5（禁止表現）: ' + (result5.passed ? 'PASS ✅' : 'FAIL ❌ ' + result5.summary));
  
  console.log('');
  console.log('バリデーションテスト完了');
}

/**
 * デバッグ用: processPendingRegenRequests_の内部状態を詳細確認
 */
function debugRegenRequest() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();

  // REGEN_REQUEST_ キーを全件表示
  Logger.log('=== REGEN_REQUEST_ キー一覧 ===');
  var found = false;
  Object.keys(allProps).forEach(function(k) {
    if (k.indexOf('REGEN_REQUEST_') === 0) {
      Logger.log('  キー: ' + k + ' / 値: ' + allProps[k]);
      found = true;
    }
  });
  if (!found) Logger.log('  （なし）');

  // IMG_ キーを全件表示
  Logger.log('=== IMG_ キー一覧 ===');
  Object.keys(allProps).forEach(function(k) {
    if (k.indexOf('IMG_') === 0) {
      Logger.log('  キー: ' + k + ' / 値: ' + allProps[k]);
    }
  });

  // 下書きシートの最新5件を表示
  Logger.log('=== 下書きシート最新5件 ===');
  try {
    var ss = SpreadsheetApp.openById(getApiKeys().SPREADSHEET_ID);
    var sheet = ss.getSheetByName('下書き');
    var lastRow = sheet.getLastRow();
    var startRow = Math.max(2, lastRow - 4);
    var data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 8).getValues();
    data.forEach(function(row) {
      Logger.log('  postId: [' + row[0] + ']');
      Logger.log('  postType: [' + row[1] + '] (長さ: ' + String(row[1]).length + ')');
      Logger.log('  status: [' + row[6] + ']');
      Logger.log('  ---');
    });
  } catch (e) {
    Logger.log('シート読み取りエラー: ' + e.message);
  }
}

// ===== ★v12.7 タスク6動作確認用テスト関数 =====
/**
 * ScriptProperties → 下書きシート移行の動作確認テスト。
 *
 * 下書きシートの FactCheckJSON / FlashFallbackUsed 列にデータを書き込み、
 * ScriptProperties には設定しない状態で sendDraftNotification を呼び出す。
 * 承認メールに FactCheck 結果が正しく表示されれば、移行成功。
 *
 * ⚠️ このテストは本物の承認メールを1通送信します。
 */
function testTask6ScriptPropertiesMigration() {
  console.log('=== タスク6: ScriptProperties移行テスト ===');
  console.log('  （下書きシートから FactCheckJSON / FlashFallbackUsed を読み込むテスト）');
  console.log('');

  // 1. テスト下書き作成 + データ書き込み
  console.log('1. テスト下書き作成 + FactCheckJSON / FlashFallbackUsed 書き込み');
  var testText = 'タスク6テスト: 下書きシートからFactCheckJSON読み込み確認用投稿。\nこのテキストは実際には投稿されません。';
  var postId;
  try {
    postId = saveDraft({
      postType: 'MORNING',
      text: testText,
      scheduledTime: '07:00',
      validationResult: '',
      status: 'Phase B完了'
    });

    var testFactCheck = {
      summary: '⚠️ 要確認あり（問題3件）',
      details: '❌ ドル円レートが155円と記載されているが、実際は159円\n✅ FOMCへの言及は正確\n⚠️ 米CPI発表日が不正確',
      fixLog: '【最終事実検証（Claude）】修正あり\nドル円レートを159円に修正',
      wasFixed: true,
      originalText: '',
      timestamp: new Date().toISOString()
    };

    updateDraftContent_(postId, {
      FACT_CHECK_JSON: JSON.stringify(testFactCheck),
      FLASH_FALLBACK_USED: true,
      PHASE_A_COMPLETED_AT: new Date().toISOString(),
      PHASE_B_COMPLETED_AT: new Date().toISOString()
    });
    console.log('   ✅ テスト下書き作成: ' + postId);
    console.log('   ✅ FactCheckJSON / FlashFallbackUsed を下書きシートに書き込み');
    console.log('   （ScriptProperties には LAST_FACT_CHECK / FLASH_FALLBACK_USED を設定していません）');
  } catch (e) {
    console.log('   ❌ 準備エラー: ' + e.message);
    return;
  }

  // 2. sendDraftNotification を呼び出し
  console.log('');
  console.log('2. 承認メールを送信（下書きシート経由のFactCheck読み込み確認）');
  try {
    sendDraftNotification([{
      postId: postId,
      scheduledTime: '07:00',
      postType: 'MORNING',
      text: testText,
      imageFileId: null,
      archetype: null
    }]);
    console.log('   ✅ 承認メール送信完了');
  } catch (e) {
    console.log('   ❌ sendDraftNotification エラー: ' + e.message);
  }

  // 3. ScriptProperties に旧フラグが残っていないか確認
  console.log('');
  console.log('3. ScriptProperties 残存チェック');
  var props = PropertiesService.getScriptProperties();
  var oldFactCheck = props.getProperty('LAST_FACT_CHECK_MORNING');
  var oldFlash = props.getProperty('FLASH_FALLBACK_USED');
  console.log('   LAST_FACT_CHECK_MORNING: ' + (oldFactCheck ? '残存あり（旧フロー）' : 'なし ✅'));
  console.log('   FLASH_FALLBACK_USED: ' + (oldFlash ? '残存あり（旧フロー）' : 'なし ✅'));

  // 4. テスト下書きを削除
  console.log('');
  console.log('4. テスト下書きを削除');
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
  console.log('🎉 タスク6テスト完了');
  console.log('  📧 Gmailを確認してください:');
  console.log('  期待されるメール内容:');
  console.log('   1. ⚠️ Gemini Pro 503 → Claude代替生成（オレンジ枠）');
  console.log('   2. ⚠️ ファクトチェック: 要確認あり（オレンジ枠）');
  console.log('   3. ❌ ドル円レート155円→159円の指摘');
  console.log('   4. 🔧 自動修正済み の表示');
  console.log('  上記4項目がメールに表示されていれば、下書きシートからの読み込みが成功です。');
}


// ========================================
// T1-D: 却下理由ログ(★v14.2・2026-04-24)
// ========================================

/**
 * 却下理由を「却下理由ログ」シートに記録する
 *
 * 背景: 承認メールで「❌ <理由タグ>」ボタンが押された時に呼ばれ、
 *       Phase 5 の教師データ(人間によるラベル付き判定)として蓄積。
 *
 * @param {string} postId - 投稿ID
 * @param {string} reasonTag - 却下理由タグ(number / name / logic / 等)
 * @param {string} reasonLabel - 理由の日本語表示
 * @private
 */
function _logRejectionReason_(postId, reasonTag, reasonLabel) {
  try {
    var keys = getApiKeys();
    if (!keys || !keys.SPREADSHEET_ID) return;
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('却下理由ログ');
    if (!sheet) return;

    // 下書きから投稿本文と投稿タイプを取得(失敗しても続行)
    var postType = '';
    var postText = '';
    var fixCount = '';
    try {
      var draft = getDraftById_(postId);
      if (draft) {
        postType = draft.postType || '';
        postText = (draft.text || '').substring(0, 500);
        // 修正件数は fixLog の行数から推定(正確ではないが目安)
        if (draft.fixLog) {
          var fixLines = String(draft.fixLog).split('\n').filter(function(l) {
            return /^【/.test(l);
          });
          fixCount = fixLines.length;
        }
      }
    } catch (e) {
      console.log('⚠️ _logRejectionReason_: 下書き取得失敗(続行): ' + e.message);
    }

    sheet.appendRow([
      new Date().toISOString(),  // A 却下日時
      postId,                    // B 投稿ID
      postType,                  // C 投稿タイプ
      reasonLabel,               // D 却下理由タグ
      postText,                  // E 投稿本文
      fixCount,                  // F 投稿時の修正件数
      ''                         // G 自由記述(UI からは未入力)
    ]);
    console.log('📝 却下理由ログ記録: ' + postId + ' / ' + reasonLabel);
  } catch (e) {
    console.log('⚠️ _logRejectionReason_ 失敗(続行): ' + e.message);
  }
}


// ========================================
// T1-D 拡張: 手動記録ヘルパー(★v14.2・2026-04-24)
// ========================================

/**
 * 却下理由を手動で記録する
 *
 * 用途:
 *   - 承認メールの却下ボタンを見逃した投稿への事後記録
 *   - 既に承認済み/中止済みだが「却下すべきだった」と後から気づいた投稿
 *   - 本番観察で発見したパターンを Phase 5 教師データに追加
 *
 * 使い方: Apps Script エディタから以下を実行
 *
 *   logManualRejection('20260424_163044_LONDON', 'other', '通貨ペア曖昧(豪ドル→豪ドル円)');
 *   logManualRejection('20260424_121542_LUNCH', 'other', '通貨ペア曖昧(豪ドル→豪ドル円)');
 *
 * 有効な理由タグ(9 種類):
 *   number / name / logic / fact_other / tone / timing / duplicate / thin / other
 *
 * @param {string} postId - 投稿ID(下書きシートの A 列から取得)
 * @param {string} reasonTag - 却下理由タグ(9 種類のいずれか)
 * @param {string} [freeNote] - 自由記述(任意・G 列に入る)
 * @return {Object} { success: boolean, error?: string }
 */
function logManualRejection(postId, reasonTag, freeNote) {
  var reasonLabels = {
    number:     '数値誤り',
    name:       '固有名詞誤り',
    logic:      '論理矛盾',
    fact_other: '事実誤り(その他)',
    tone:       'トーン不適',
    timing:     'タイミング不適',
    duplicate:  '重複',
    thin:       '内容薄い',
    other:      'その他'
  };

  // ★引数なしで呼ばれた場合(GAS エディタから直接実行)は使い方を表示
  if (!postId && !reasonTag) {
    console.log('========================================');
    console.log('💡 logManualRejection の使い方');
    console.log('========================================');
    console.log('');
    console.log('GAS エディタの「実行」ボタンは引数を渡せません。');
    console.log('代わりに対話型の関数を使ってください:');
    console.log('');
    console.log('  logObservationInteractive()');
    console.log('    → プロンプトで投稿ID・理由・自由記述を順に入力');
    console.log('');
    console.log('または、新規ファイルで自作ラッパーを書く:');
    console.log('');
    console.log('  function myRejection() {');
    console.log('    logManualRejection("20260424_XXXXXX_TYPE", "other", "理由");');
    console.log('  }');
    console.log('');
    console.log('  その後 myRejection を選択して実行');
    console.log('');
    console.log('有効な理由タグ:');
    Object.keys(reasonLabels).forEach(function(k) {
      console.log('  ' + k + ' → ' + reasonLabels[k]);
    });
    console.log('========================================');
    return { success: false, error: '引数未指定(使い方を表示)' };
  }

  var reasonLabel = reasonLabels[reasonTag];
  if (!reasonLabel) {
    console.log('❌ 無効な理由タグ: ' + reasonTag);
    console.log('   有効なタグ: ' + Object.keys(reasonLabels).join(' / '));
    return { success: false, error: '無効な理由タグ' };
  }

  if (!postId) {
    console.log('❌ postId が未指定');
    return { success: false, error: 'postId 未指定' };
  }

  try {
    var keys = getApiKeys();
    if (!keys || !keys.SPREADSHEET_ID) {
      console.log('❌ SPREADSHEET_ID 未設定');
      return { success: false, error: 'SPREADSHEET_ID 未設定' };
    }
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('却下理由ログ');
    if (!sheet) {
      console.log('❌ 却下理由ログ シートが見つかりません');
      return { success: false, error: 'シートが見つかりません' };
    }

    // 下書きから投稿情報を取得(失敗しても続行)
    var postType = '';
    var postText = '';
    var fixCount = '';
    var draftFound = false;
    try {
      var draft = getDraftById_(postId);
      if (draft) {
        draftFound = true;
        postType = draft.postType || '';
        postText = (draft.text || '').substring(0, 500);
        if (draft.fixLog) {
          var fixLines = String(draft.fixLog).split('\n').filter(function(l) {
            return /^【/.test(l);
          });
          fixCount = fixLines.length;
        }
      }
    } catch (e) {
      console.log('⚠️ 下書き取得失敗(ログは記録します): ' + e.message);
    }

    if (!draftFound) {
      console.log('⚠️ 投稿ID が下書きシートで見つかりません(ログは記録します): ' + postId);
    }

    sheet.appendRow([
      new Date().toISOString(),        // A 却下日時(手動記録時は現在時刻)
      postId,                           // B 投稿ID
      postType,                         // C 投稿タイプ
      reasonLabel,                      // D 却下理由タグ
      postText,                         // E 投稿本文
      fixCount,                         // F 修正件数
      freeNote || '(手動記録)'         // G 自由記述
    ]);

    console.log('✅ 却下理由ログに手動記録しました');
    console.log('   投稿ID: ' + postId);
    console.log('   理由: ' + reasonLabel);
    if (freeNote) console.log('   自由記述: ' + freeNote);
    if (!draftFound) console.log('   ⚠️ 下書き情報なし(投稿本文・修正件数は空)');
    return { success: true };
  } catch (e) {
    console.log('❌ logManualRejection 失敗: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * 直近の下書き一覧を表示する(logManualRejection で使う postId を調べる用)
 *
 * 使い方: Apps Script エディタから実行
 *   listRecentDrafts();
 *
 * 実行ログに直近 20 件の投稿情報が一覧表示される。
 */
function listRecentDrafts() {
  try {
    var sheet = getDraftsSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.log('📋 下書きなし');
      return;
    }

    var startRow = Math.max(2, lastRow - 19);
    var colCount = getDraftColCount_();
    var data = sheet.getRange(startRow, 1, lastRow - startRow + 1, colCount).getValues();

    console.log('========================================');
    console.log('📋 直近の下書き(' + data.length + '件・新しい順)');
    console.log('========================================');
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      var postId = row[DRAFT_COLS.POST_ID - 1];
      var postType = row[DRAFT_COLS.POST_TYPE - 1];
      var status = row[DRAFT_COLS.STATUS - 1];
      var statusIcon;
      if (status === '承認') statusIcon = '✅';
      else if (status === '中止') statusIcon = '❌';
      else if (status === '承認待ち') statusIcon = '⏳';
      else if (status === '期限切れ') statusIcon = '⏰';
      else statusIcon = '📝';
      console.log(statusIcon + '  ' + postId + '  [' + postType + ']  (' + status + ')');
    }
    console.log('========================================');
    console.log('💡 使い方例:');
    console.log('   logManualRejection("<postId>", "other", "曖昧さあり");');
    console.log('');
    console.log('   有効な理由タグ: number / name / logic / fact_other /');
    console.log('                   tone / timing / duplicate / thin / other');
    console.log('========================================');
  } catch (e) {
    console.log('❌ listRecentDrafts 失敗: ' + e.message);
  }
}

/**
 * 却下理由を対話的に記録する(汎用・将来の観察事項用)
 *
 * 使い方: Apps Script エディタでこの関数を選択して「実行」
 *   → スプレッドシート画面に 3 つのプロンプトが順に表示される
 *     1. 投稿ID を入力(listRecentDrafts で調べられる)
 *     2. 理由タグを入力(number/name/logic/fact_other/tone/timing/duplicate/thin/other から 1 つ)
 *     3. 自由記述を入力(省略可)
 *   → 却下理由ログシートに記録される
 *
 * ※ スプレッドシートが開いた状態で Apps Script エディタから実行してください。
 *   プロンプトはスプレッドシート側のタブに表示されます。
 */
function logObservationInteractive() {
  var ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    console.log('❌ SpreadsheetApp.getUi() が使えません。スプレッドシートを開いた状態で実行してください');
    console.log('   (または logManualRejection(postId, reason, note) を直接呼ぶ自作ラッパーを使ってください)');
    return;
  }

  // Step 1: 投稿ID
  var postIdResp = ui.prompt(
    '却下理由を記録(1/3)',
    '投稿ID を入力してください。\n例: 20260424_163044_LONDON\n\n(listRecentDrafts を先に実行すると直近 20 件の ID が実行ログに表示されます)',
    ui.ButtonSet.OK_CANCEL
  );
  if (postIdResp.getSelectedButton() !== ui.Button.OK) {
    console.log('ℹ️ キャンセルされました');
    return;
  }
  var postId = postIdResp.getResponseText().trim();
  if (!postId) {
    ui.alert('❌ 投稿ID が空です。処理を中止します');
    return;
  }

  // Step 2: 理由タグ
  var reasonResp = ui.prompt(
    '却下理由を記録(2/3)',
    '理由タグを入力してください(以下から 1 つ):\n\n' +
    'number     - 数値誤り\n' +
    'name       - 固有名詞誤り\n' +
    'logic      - 論理矛盾\n' +
    'fact_other - 事実誤り(その他)\n' +
    'tone       - トーン不適\n' +
    'timing     - タイミング不適\n' +
    'duplicate  - 重複\n' +
    'thin       - 内容薄い\n' +
    'other      - その他',
    ui.ButtonSet.OK_CANCEL
  );
  if (reasonResp.getSelectedButton() !== ui.Button.OK) {
    console.log('ℹ️ キャンセルされました');
    return;
  }
  var reason = reasonResp.getResponseText().trim();
  if (!reason) {
    ui.alert('❌ 理由タグが空です。処理を中止します');
    return;
  }

  // Step 3: 自由記述(任意)
  var noteResp = ui.prompt(
    '却下理由を記録(3/3)',
    '自由記述(理由の詳細・省略可):\n例: 通貨ペア曖昧(豪ドル→豪ドル円)',
    ui.ButtonSet.OK_CANCEL
  );
  if (noteResp.getSelectedButton() !== ui.Button.OK) {
    console.log('ℹ️ キャンセルされました');
    return;
  }
  var note = noteResp.getResponseText().trim();

  // 記録実行
  var result = logManualRejection(postId, reason, note);
  if (result && result.success) {
    ui.alert(
      '✅ 記録完了',
      '投稿ID: ' + postId + '\n理由: ' + reason + (note ? '\n記述: ' + note : '') + '\n\n「却下理由ログ」シートを確認してください',
      ui.ButtonSet.OK
    );
  } else {
    ui.alert(
      '❌ 記録失敗',
      (result && result.error) || '不明なエラー',
      ui.ButtonSet.OK
    );
  }
}
