/**
 * imageGenerator.gs - AI画像生成（市場系投稿用）
 * Phase 7: Gemini API画像生成
 * 
 * 方式A: 投稿テキストから情報の80%を断捨離し、
 *         核となる3要素だけを抽出してインフォグラフィック画像を生成
 * 
 * Gemで実績ありのプロンプトをAPI用に移植
 * 
 * 依存: config.gs（getApiKeys）, sheetsManager.gs（getRecentArchetypes）
 */

// ============================================================
// 定数: 画像生成モデル
// ============================================================

/**
 * Gemini画像生成モデル名
 * gemini-3-pro-image-preview: Nano Banana Pro（最高品質、4K、テキスト描画精度94%）
 * 代替: gemini-3.1-flash-image-preview（Nano Banana 2、Pro級品質+高速）
 * 旧: gemini-2.5-flash-image（Nano Banana、品質低い）
 */
var IMAGE_GEN_MODEL = 'gemini-3-pro-image-preview';

/**
 * 画像再生成の上限回数
 */
var IMAGE_REGEN_MAX = 3;


// ============================================================
// 定数: 投稿タイプ別カラー・ラベル
// ============================================================

var IMAGE_TYPE_COLORS = {
  MORNING:       { accent: 'サイアン（水色/cyan）',  label: 'MORNING BRIEF' },
  LONDON:        { accent: 'ネオン緑（neon green）', label: 'LONDON REPORT' },
  NY:            { accent: 'ネオン紫（neon purple）', label: 'NY PREVIEW' },
  INDICATOR:     { accent: 'ネオン赤（neon red）',   label: 'INDICATOR ALERT' },
  WEEKLY_REVIEW: { accent: 'ゴールド（gold）',       label: 'WEEKLY REVIEW' },
  NEXT_WEEK:     { accent: 'ネオン緑（neon green）', label: 'NEXT WEEK' }
};


// ============================================================
// 定数: 12アーキタイプ
// ============================================================

var IMAGE_ARCHETYPES = {
  STRUCTURED_LIST: {
    name: 'ストラクチャード・リスト',
    description: '複数の重要なポイントやイベントを並列に整理して表示する構図。一覧形式。',
    bestFor: ['WEEKLY_REVIEW', 'NEXT_WEEK']
  },
  CENTRAL_FOCUS: {
    name: 'セントラル・フォーカス',
    description: '巨大な数字や事実を画面中央で強調する構図。一点突破。',
    bestFor: ['INDICATOR', 'MORNING']
  },
  DUAL_CONTRAST: {
    name: 'デュアル・コントラスト',
    description: '左右や斜めの分割画面で対比する構図。対立・比較。ブルvsベア、タカ派vsハト派など。',
    bestFor: ['MORNING', 'LONDON', 'NY']
  },
  FLOW_PERSPECTIVE: {
    name: 'フロー＆パースペクティブ',
    description: '奥へと続く道や分岐点を描く構図。シナリオ分岐・トレンド。',
    bestFor: ['NY', 'NEXT_WEEK']
  },
  CLOSEUP_MECHANISM: {
    name: 'クローズアップ・メカニズム',
    description: '複雑な構造の内部を拡大する構図。核心原因の強調。',
    bestFor: ['INDICATOR', 'MORNING']
  },
  TOPDOWN_BLUEPRINT: {
    name: 'トップダウン・ブループリント',
    description: '真上からの俯瞰図、設計図。全体構造の図解。',
    bestFor: ['WEEKLY_REVIEW', 'NEXT_WEEK']
  },
  DYNAMIC_ACTION: {
    name: 'ダイナミック・アクション',
    description: 'ロケット、ジェットコースターのような勢い。大きな動き・急騰急落。',
    bestFor: ['MORNING', 'LONDON']
  },
  BREAKTHROUGH_IMPACT: {
    name: 'ブレイクスルー・インパクト',
    description: '壁を突き破る、雷が落ちるような予期せぬ出来事。サプライズ・衝撃。',
    bestFor: ['INDICATOR', 'MORNING']
  },
  ATMOSPHERE: {
    name: '環境＆アトモスフィア',
    description: '嵐、霧、晴天など、相場全体のムードを表現する構図。',
    bestFor: ['LONDON', 'NY']
  },
  MIND_GAME: {
    name: 'マインド・ゲーム',
    description: '脳、迷路、天秤など、市場参加者の内面的な葛藤・迷い。',
    bestFor: ['NY', 'MORNING']
  },
  CROWD_SENTIMENT: {
    name: 'クラウド・センチメント',
    description: '群衆の波、一方方向への流れ、パニック。群集心理・トレンド追随。',
    bestFor: ['LONDON', 'MORNING']
  },
  CYCLE_RHYTHM: {
    name: 'サイクル＆リズム',
    description: '時計、振り子、波形など、景気や相場の繰り返し。循環・周期。',
    bestFor: ['WEEKLY_REVIEW', 'NEXT_WEEK']
  }
};


// ============================================================
// メイン: 投稿画像生成
// ============================================================

/**
 * 投稿テキストからAI画像を生成する
 * 
 * @param {string} postText - 投稿テキスト
 * @param {string} postType - 投稿タイプ（MORNING, LONDON等）
 * @returns {Object|null} { blob: Blob, archetype: string } または null（失敗時）
 */
function generatePostImage(postText, postType) {
  // 画像対象タイプかチェック
  var typeConfig = IMAGE_TYPE_COLORS[postType];
  if (!typeConfig) {
    Logger.log('画像対象外のタイプ: ' + postType);
    return null;
  }
  
  try {
    // 1. アーキタイプ選定（直近3回と被らない）
    var recentArchetypes = getRecentImageArchetypes_();
    var archetype = selectImageArchetype_(postType, recentArchetypes);
    Logger.log('🎨 選定アーキタイプ: ' + archetype.name);
    
    // 2. 画像生成プロンプト構築
    var imagePrompt = buildImagePrompt_(postText, postType, typeConfig, archetype);
    
    // 3. Gemini API画像生成（3回リトライ）
    var imageBlob = callGeminiImageApi_(imagePrompt);
    
    if (!imageBlob) {
      Logger.log('⚠️ 画像生成失敗 → テキストのみにフォールバック');
      return null;
    }
    
    var sizeKB = Math.round(imageBlob.getBytes().length / 1024);
    Logger.log('✅ 画像生成成功: ' + sizeKB + 'KB, アーキタイプ: ' + archetype.name);
    
    // 4. 透かしロゴ合成
    var finalBlob = compositeWithWatermark_(imageBlob);
    var finalSizeKB = Math.round(finalBlob.getBytes().length / 1024);
    if (finalBlob !== imageBlob) {
      Logger.log('✅ 透かし合成完了: ' + finalSizeKB + 'KB');
    }
    
    return {
      blob: finalBlob,
      archetype: archetype.name
    };
    
  } catch (error) {
    Logger.log('❌ 画像生成エラー: ' + error.message);
    return null;
  }
}


/**
 * 画像を再生成する（承認フローの[🔄画像を再生成]用）
 * 同じテキストで画像だけ再生成
 * 
 * @param {string} postText - 投稿テキスト
 * @param {string} postType - 投稿タイプ
 * @param {string} previousArchetype - 前回のアーキタイプ（被り回避）
 * @returns {Object|null} { blob: Blob, archetype: string } または null
 */
function regeneratePostImage(postText, postType, previousArchetype) {
  var typeConfig = IMAGE_TYPE_COLORS[postType];
  if (!typeConfig) return null;
  
  try {
    // 前回と違うアーキタイプを選定
    var recentArchetypes = [previousArchetype];
    var archetype = selectImageArchetype_(postType, recentArchetypes);
    Logger.log('🔄 再生成アーキタイプ: ' + archetype.name + '（前回: ' + previousArchetype + '）');
    
    var imagePrompt = buildImagePrompt_(postText, postType, typeConfig, archetype);
    var imageBlob = callGeminiImageApi_(imagePrompt);
    
    if (!imageBlob) return null;
    
    var sizeKB = Math.round(imageBlob.getBytes().length / 1024);
    Logger.log('✅ 再生成成功: ' + sizeKB + 'KB');
    
    // 透かし合成
    var finalBlob = compositeWithWatermark_(imageBlob);
    // ★v8.6: 透かし合成の成功/失敗を明確にログ出力
    if (finalBlob !== imageBlob) {
      var finalSizeKB = Math.round(finalBlob.getBytes().length / 1024);
      console.log('✅ 再生成: 透かし合成完了 (' + finalSizeKB + 'KB)');
    } else {
      console.log('⚠️ 再生成: 透かし合成スキップまたは失敗（透かしなしの画像を使用）');
    }
    
    return {
      blob: finalBlob,
      archetype: archetype.name
    };
    
  } catch (error) {
    Logger.log('❌ 再生成エラー: ' + error.message);
    return null;
  }
}


// ============================================================
// アーキタイプ選定
// ============================================================

/**
 * 投稿タイプに適したアーキタイプを選定（直近と被らない制御）
 * 
 * @param {string} postType - 投稿タイプ
 * @param {Array<string>} recentArchetypes - 直近で使用したアーキタイプ名の配列
 * @returns {Object} { key, name, description }
 */
function selectImageArchetype_(postType, recentArchetypes) {
  // この投稿タイプに適したアーキタイプを抽出
  var candidates = [];
  var keys = Object.keys(IMAGE_ARCHETYPES);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var arch = IMAGE_ARCHETYPES[key];
    if (arch.bestFor.indexOf(postType) !== -1) {
      candidates.push({ key: key, name: arch.name, description: arch.description });
    }
  }
  
  // 直近で使ったものを除外
  var filtered = candidates.filter(function(c) {
    return recentArchetypes.indexOf(c.name) === -1;
  });
  
  // 全部除外されたら候補全体から選択（安全策）
  if (filtered.length === 0) {
    filtered = candidates;
  }
  
  // ランダム選択
  var index = Math.floor(Math.random() * filtered.length);
  return filtered[index];
}


/**
 * 投稿履歴から直近3件の使用アーキタイプを取得
 * 
 * @returns {Array<string>} アーキタイプ名の配列
 */
function getRecentImageArchetypes_() {
  try {
    if (typeof getRecentArchetypes === 'function') {
      return getRecentArchetypes() || [];
    }
    return [];
  } catch (e) {
    Logger.log('⚠️ 直近アーキタイプ取得失敗（初回は正常）: ' + e.message);
    return [];
  }
}


// ============================================================
// 画像生成プロンプト構築
// ============================================================

/**
 * Gemプロンプトをそのまま使用した画像生成プロンプトを構築
 * ※ Gemで実績のあるプロンプトを一字一句変えずに移植（動画部分のみ除外）
 * 
 * @param {string} postText - 投稿テキスト
 * @param {string} postType - 投稿タイプ
 * @param {Object} typeConfig - { accent, label }
 * @param {Object} archetype - { key, name, description }
 * @returns {string} プロンプト
 */
function buildImagePrompt_(postText, postType, typeConfig, archetype) {
  // === Gemプロンプト（動画部分を除いてそのまま） ===
  var gemPrompt = 'あなたは、金融・投資アカウント「@Compana_Doppio」専属の**ミニマリストAIビジュアル・クリエイター兼アドバイザー**です。\n'
    + '\n'
    + 'あなたの使命は、ユーザーの投稿テキストから**情報の80%を大胆に捨て去り**、最も重要な核となるメッセージだけを抽出して、**スマホ画面でも一瞬で伝わる、視認性抜群の高品質な文字入りインフォグラフィック画像**に変換し、直接提示することです。\n'
    + '\n'
    + '## デザイン・共通ガイドライン（厳守）\n'
    + '\n'
    + '- **アスペクト比:** 全ての画像は、Xの投稿に最適な横長サイズ（16:9）で生成する。\n'
    + '- **世界観:** 洗練されたFintech、サイバーパンク、高度なデータ分析。\n'
    + '- **カラー:** 背景（ダーク/紺/黒）、ポジティブ（ネオン緑/サイアン）、ネガティブ（ネオン赤/紫）。\n'
    + '- **【最重要】画像内テキストは日本語のみ（英語禁止）:**\n'
    + '    - 画像内に表示する**全てのテキスト**は、**日本語のみ**で統一すること。英語は一切使用禁止。\n'
    + '    - 通貨ペア表記（USD/JPY等）と数値のみ例外として許可。\n'
    + '    - NG: 「MARKET MIND GAME」「CAUTION: INTERVENTION RISK」「FOCUS: LAGARDE TONIGHT」\n'
    + '    - OK: 「市場心理」「介入警戒」「ラガルド総裁に注目」\n'
    + '    - **文字化けを絶対に回避するため、テキストには特殊な記号や絵文字（例：🇺🇸、🇯🇵、📕、→）を使用せず、単純な文字のみで構成すること。**\n'
    + '- **【重要】テキストの描写（文字崩れ防止の絶対条件）:**\n'
    + '    - **装飾の完全禁止:** 文字化けや崩れを絶対に回避するため、テキストには**3D効果、発光（Glow）、影（Shadow）、縁取り（Outline）などの装飾エフェクトを一切適用してはならない。**\n'
    + '    - **プレーンテキスト配置:** 全てのテキストは、背景と高いコントラストを持つ**単色（白または明るい色）の、装飾のない単純で太いデジタルフォント**として配置すること。視認性は、エフェクトではなく「文字の大きさと背景とのコントラスト」のみで確保する。\n'
    + '\n'
    + '## 思考プロセス（画像生成）\n'
    + '\n'
    + 'ユーザーからテキスト入力があったら、以下の手順で思考し、直ちに画像を生成して表示してください。\n'
    + '\n'
    + '1.  **極限の断捨離と視認性の確保（最重要）:**\n'
    + '    入力テキストを分析し、以下の**「3要素」だけ**を残して、残りの詳細情報はすべて捨ててください。\n'
    + '    - **「最大のインパクト」**（例：歴史的急騰 +1493円）\n'
    + '    - **「核心となる問い」**（例：持続か？調整か？）\n'
    + '    - **「主要な構造」**（例：対立、分岐、原因）\n'
    + '    *※画像内に含めるテキスト情報は、この3要素に関連する極めて短い単語や数字のみに厳選し、**スマホで瞬時に読めるサイズ**で配置すること。*\n'
    + '\n'
    + '    **【文字サイズの3層階層（最重要・必ず守れ）】**\n'
    + '    - **第1層（フック・主役）:** 読者がスクロールを止める「問い」「意外性」「核心の主張」を1つ選び、画面幅の50〜70%を占める巨大な文字で配置。事実の羅列ではなく「利下げ期待、修正か？」「流れ反転」のような感情を動かす短いフレーズ。\n'
    + '    - **第2層（補足）:** 第1層の半分程度のサイズで、背景や条件を1〜2箇所に配置。\n'
    + '    - **第3層（文脈）:** 最も小さい文字で、日時や補足情報を隅に配置。なくてもよい。\n'
    + '    - **NG: 全ての文字が同じサイズ。情報が画面に均等に散らばる構図。「米CPI 21:30発表」のような事実だけが大きい画像。**\n'
    + '    - **OK: 「インフレ警戒、再燃か？」が巨大で、「今夜21:30 米CPI」が小さく添えられている画像。**\n'
    + '\n'
    + '2.  **アーキタイプ選択:**\n'
    + '    抽出した核となるメッセージを最も効果的に伝える構図を、以下の拡張された多様なアーキタイプから1つ選択してください。（※マンネリ防止のため、直近と異なる選択を意識し、新しい選択肢も積極的に活用する）\n'
    + '\n'
    + '    **【基本構図・構造】**\n'
    + '    - ストラクチャード・リスト (まとめ・一覧): 複数の重要なポイントやイベントを並列に整理して表示。\n'
    + '    - セントラル・フォーカス (一点突破): 巨大な数字や事実を画面中央で強調。\n'
    + '    - デュアル・コントラスト (対立・比較): 左右や斜めの分割画面で対比。\n'
    + '    - フロー＆パースペクティブ (シナリオ分岐・トレンド): 奥へと続く道や分岐点。\n'
    + '    - クローズアップ・メカニズム (核心原因の強調): 複雑な構造の内部を拡大。\n'
    + '    - トップダウン・ブループリント (全体構造の図解): 真上からの俯瞰図、設計図。\n'
    + '\n'
    + '    **【動き・変化・衝撃】**\n'
    + '    - ダイナミック・アクション (大きな動き): ロケット、ジェットコースターのような勢い。\n'
    + '    - ブレイクスルー・インパクト (サプライズ・衝撃): 壁を突き破る、雷が落ちるような予期せぬ出来事。\n'
    + '\n'
    + '    **【心理・環境・周期】**\n'
    + '    - 環境＆アトモスフィア (市場の雰囲気): 嵐、霧、晴天など、相場全体のムード。\n'
    + '    - マインド・ゲーム (投資家心理・迷い): 脳、迷路、天秤など、市場参加者の内面的な葛藤。\n'
    + '    - クラウド・センチメント (群集心理・トレンド追随): 群衆の波、一方方向への流れ、パニック。\n'
    + '    - サイクル＆リズム (循環・周期): 時計、振り子、波形など、景気や相場の繰り返し。\n'
    + '\n'
    + '以下が投稿テキストです。この内容から画像を1枚生成してください。\n'
    + '※再確認: 画像内のテキストは全て日本語で書くこと。英語のテキストは一切配置しないこと。\n'
    + '※時間表現の厳守: 投稿テキスト内の時間表現（「本日」「今夜」「明日」「15:15」等）を勝手に変換するな。「本日15:15」を「今夜」にするのはNG。原文の表現をそのまま使え。\n'
    + '\n'
    + '【指定アーキタイプ】' + archetype.name + '\n'
    + '上記のアーキタイプ一覧の中から「' + archetype.name + '」の構図を必ず使用してください。\n'
    + '※アーキタイプ名（例:「環境＆アトモスフィア」「マインド・ゲーム」等）は構図の指示であり、画像内テキストとして表示してはならない。\n'
    + '\n'
    + '【投稿テキスト】\n'
    + postText;
  
  return gemPrompt;
}


// ============================================================
// Gemini API画像生成呼び出し
// ============================================================

/**
 * Gemini APIで画像を生成する（3回リトライ）
 * 
 * @param {string} prompt - 画像生成プロンプト
 * @returns {Blob|null} 画像Blob または null（失敗時）
 */
function callGeminiImageApi_(prompt) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません');
  }
  
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' 
          + IMAGE_GEN_MODEL 
          + ':generateContent?key=' + apiKey;
  
  var payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: '16:9'
      }
    }
  };
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  // リトライ（指数バックオフ）
  var MAX_RETRIES = 3;
  for (var attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      Logger.log('🎨 画像生成API呼び出し（試行 ' + attempt + '/' + MAX_RETRIES + '）...');
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      
      if (code === 200) {
        var json = JSON.parse(response.getContentText());
        var blob = extractImageFromResponse_(json);
        if (blob) return blob;
        Logger.log('⚠️ レスポンス200だが画像データなし');
      } else if (code === 429) {
        Logger.log('⚠️ レート制限（429）→ 30秒待機');
        Utilities.sleep(30000);
      } else {
        var errorText = response.getContentText().substring(0, 300);
        Logger.log('⚠️ APIエラー ' + code + ': ' + errorText);
      }
      
      // リトライ前に待機（指数バックオフ）
      if (attempt < MAX_RETRIES) {
        var waitSec = 5 * attempt;
        Logger.log('⏳ ' + waitSec + '秒後にリトライ...');
        Utilities.sleep(waitSec * 1000);
      }
      
    } catch (e) {
      Logger.log('⚠️ 通信エラー（試行 ' + attempt + '）: ' + e.message);
      if (attempt < MAX_RETRIES) Utilities.sleep(5000 * attempt);
    }
  }
  
  Logger.log('❌ ' + MAX_RETRIES + '回リトライ後も画像生成失敗');
  return null;
}


/**
 * Gemini APIレスポンスから画像データを抽出
 * 
 * @param {Object} json - APIレスポンスJSON
 * @returns {Blob|null} 画像Blob または null
 */
function extractImageFromResponse_(json) {
  try {
    var candidates = json.candidates;
    if (!candidates || candidates.length === 0) {
      Logger.log('⚠️ candidatesが空');
      // finishReasonを確認
      if (json.promptFeedback) {
        Logger.log('  promptFeedback: ' + JSON.stringify(json.promptFeedback));
      }
      return null;
    }
    
    var parts = candidates[0].content.parts;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].inlineData) {
        var mimeType = parts[i].inlineData.mimeType || 'image/png';
        var base64Data = parts[i].inlineData.data;
        
        // 拡張子をmimeTypeから決定
        var ext = 'png';
        if (mimeType.indexOf('jpeg') !== -1 || mimeType.indexOf('jpg') !== -1) {
          ext = 'jpg';
        }
        
        Logger.log('✅ 画像データ取得: ' + mimeType + ', base64長: ' + base64Data.length);
        
        var decoded = Utilities.base64Decode(base64Data);
        return Utilities.newBlob(decoded, mimeType, 'post_image.' + ext);
      }
    }
    
    // テキストのみ返された場合（画像生成拒否等）
    for (var j = 0; j < parts.length; j++) {
      if (parts[j].text) {
        Logger.log('⚠️ テキストのみ返却: ' + parts[j].text.substring(0, 200));
      }
    }
    
    return null;
    
  } catch (e) {
    Logger.log('❌ 画像抽出エラー: ' + e.message);
    return null;
  }
}


// ============================================================
// 画像をDriveに一時保存（承認メール用）
// ============================================================

/**
 * 生成した画像をDriveに一時保存し、URLを返す
 * 承認メールでインライン表示するために使用
 * 
 * @param {Blob} imageBlob - 画像Blob
 * @param {string} draftId - 下書きID（ファイル名に使用）
 * @returns {Object|null} { fileId, webViewLink, webContentLink } または null
 */
function saveImageToTempDrive_(imageBlob, draftId) {
  try {
    // 一時フォルダを取得または作成
    var folderName = 'CompanaAutoPost_TempImages';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
      Logger.log('📁 一時画像フォルダ作成: ' + folderName);
    }
    
    // ファイル名に下書きIDとタイムスタンプを使用
    var fileName = 'img_' + draftId + '_' + new Date().getTime() + '.png';
    imageBlob.setName(fileName);
    var file = folder.createFile(imageBlob);
    
    // 共有設定（リンクを知っている人が閲覧可能）
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    Logger.log('💾 画像をDriveに保存: ' + fileName);
    
    return {
      fileId: file.getId(),
      webViewLink: file.getUrl(),
      webContentLink: 'https://drive.google.com/uc?export=view&id=' + file.getId()
    };
    
  } catch (e) {
    Logger.log('❌ Drive保存エラー: ' + e.message);
    return null;
  }
}


/**
 * 古い一時画像を削除（7日以上前）
 * scheduleTodayPostsから呼び出す想定
 */
function cleanupTempImages() {
  try {
    var folderName = 'CompanaAutoPost_TempImages';
    var folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) return;
    
    var folder = folders.next();
    var files = folder.getFiles();
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    var count = 0;
    
    while (files.hasNext()) {
      var file = files.next();
      if (file.getDateCreated() < cutoff) {
        file.setTrashed(true);
        count++;
      }
    }
    
    if (count > 0) {
      Logger.log('🗑️ 古い一時画像を削除: ' + count + '件');
    }
  } catch (e) {
    Logger.log('⚠️ 一時画像クリーンアップエラー: ' + e.message);
  }
}


/**
 * DriveファイルIDから画像Blobを取得（承認後の投稿時に使用）
 * 
 * @param {string} fileId - DriveファイルID
 * @returns {Blob|null} 画像Blob または null
 */
function getImageFromDriveTemp_(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    return file.getBlob();
  } catch (e) {
    Logger.log('❌ Drive画像取得エラー: ' + e.message);
    return null;
  }
}


// ============================================================
// 画像対象タイプの判定
// ============================================================

/**
 * 指定タイプが画像生成対象（方式A）かどうか判定
 * 
 * @param {string} postType - 投稿タイプ
 * @returns {boolean} 画像対象ならtrue
 */
function isImageGenerationType(postType) {
  return IMAGE_TYPE_COLORS.hasOwnProperty(postType);
}


// ============================================================
// 透かしロゴ合成（Slidesで合成 → PNG出力）
// ============================================================

/**
 * Gemini生成画像にTC透かしロゴを合成してPNGを返す
 * 
 * 仕組み:
 *   1. 空のスライドを作成（16:9）
 *   2. Gemini画像を全面に挿入（Layer 1）
 *   3. 透かしロゴPNGを全面に重ねる（Layer 3）
 *   4. サムネイルAPIでPNGエクスポート
 * 
 * 必要なスクリプトプロパティ:
 *   WATERMARK_IMAGE_ID: Drive上の透かしロゴPNGのファイルID
 * 
 * @param {Blob} imageBlob - Gemini生成画像
 * @returns {Blob} 透かし付きPNG画像（失敗時は元のimageBlob）
 */
function compositeWithWatermark_(imageBlob) {
  var watermarkId = PropertiesService.getScriptProperties().getProperty('WATERMARK_IMAGE_ID');
  if (!watermarkId) {
    console.log('⚠️ WATERMARK_IMAGE_ID 未設定 → 透かしなしで続行');
    return imageBlob;
  }
  
  try {
    // 1. 一時プレゼンテーション作成
    var presentation = SlidesApp.create('temp_watermark_' + new Date().getTime());
    var presId = presentation.getId();
    var slide = presentation.getSlides()[0];
    
    // スライドサイズ: 720pt x 405pt (16:9, デフォルト)
    var slideWidth = 720;
    var slideHeight = 405;
    
    // 2. Gemini画像を全面に挿入（Layer 1: 背景）
    var bgImage = slide.insertImage(imageBlob, 0, 0, slideWidth, slideHeight);
    
    // 3. 透かしロゴを全面に重ねる（Layer 3: 透過オーバーレイ）
    var watermarkFile = DriveApp.getFileById(watermarkId);
    var watermarkBlob = watermarkFile.getBlob();
    var wmImage = slide.insertImage(watermarkBlob, 0, 0, slideWidth, slideHeight);
    
    // 4. デフォルトのテキストボックス等があれば削除
    var shapes = slide.getShapes();
    for (var i = shapes.length - 1; i >= 0; i--) {
      shapes[i].remove();
    }
    
    // 5. 保存
    presentation.saveAndClose();
    
    // 6. サムネイルAPIでPNGエクスポート（少し待機して反映を確認）
    Utilities.sleep(3000);
    
    // ページIDを再取得（saveAndClose後なのでAPI経由）
    var presResponse = UrlFetchApp.fetch(
      'https://slides.googleapis.com/v1/presentations/' + presId,
      {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      }
    );
    
    if (presResponse.getResponseCode() !== 200) {
      console.log('⚠️ プレゼンテーション取得失敗: ' + presResponse.getResponseCode());
      DriveApp.getFileById(presId).setTrashed(true);
      return imageBlob;
    }
    
    var presJson = JSON.parse(presResponse.getContentText());
    var pageId = presJson.slides[0].objectId;
    
    var exportUrl = 'https://slides.googleapis.com/v1/presentations/' + presId 
      + '/pages/' + pageId 
      + '/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE';
    
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      console.log('⚠️ サムネイルAPI失敗: ' + response.getResponseCode() + ' ' + response.getContentText().substring(0, 200));
      DriveApp.getFileById(presId).setTrashed(true);
      return imageBlob;
    }
    
    var thumbnailJson = JSON.parse(response.getContentText());
    var thumbnailUrl = thumbnailJson.contentUrl;
    var finalBlob = UrlFetchApp.fetch(thumbnailUrl).getBlob();
    finalBlob.setName('post_image_watermarked.png');
    
    var sizeKB = Math.round(finalBlob.getBytes().length / 1024);
    console.log('✅ 透かし合成完了: ' + sizeKB + 'KB');
    
    // 7. クリーンアップ
    DriveApp.getFileById(presId).setTrashed(true);
    
    return finalBlob;
    
  } catch (e) {
    console.log('❌ 透かし合成エラー: ' + e.message);
    console.log('→ 透かしなしで続行');
    return imageBlob;
  }
}


// ============================================================
// セットアップ: 透かしロゴをDriveにアップロード
// ============================================================

/**
 * 透かしロゴのファイルIDを確認するテスト関数
 * WATERMARK_IMAGE_ID が正しく設定されているか確認
 */
function testWatermarkSetup() {
  var watermarkId = PropertiesService.getScriptProperties().getProperty('WATERMARK_IMAGE_ID');
  if (!watermarkId) {
    Logger.log('❌ WATERMARK_IMAGE_ID が未設定です');
    Logger.log('');
    Logger.log('【セットアップ手順】');
    Logger.log('1. 透かしロゴPNGをGoogle Driveにアップロード');
    Logger.log('2. ファイルを右クリック → 共有 → リンクをコピー');
    Logger.log('3. URLからファイルIDを取得（/d/XXXXX/の部分）');
    Logger.log('4. スクリプトプロパティ WATERMARK_IMAGE_ID にIDを設定');
    return;
  }
  
  try {
    var file = DriveApp.getFileById(watermarkId);
    Logger.log('✅ 透かしロゴ確認OK');
    Logger.log('  ファイル名: ' + file.getName());
    Logger.log('  サイズ: ' + Math.round(file.getSize() / 1024) + 'KB');
    Logger.log('  タイプ: ' + file.getMimeType());
  } catch (e) {
    Logger.log('❌ ファイルアクセスエラー: ' + e.message);
    Logger.log('  WATERMARK_IMAGE_ID の値を確認してください: ' + watermarkId);
  }
}


/**
 * アクセントカラー名からHEXカラーコードを返す
 */
function getHexColor_(accentName) {
  if (accentName.indexOf('サイアン') !== -1 || accentName.indexOf('cyan') !== -1) return '#00E5FF';
  if (accentName.indexOf('ネオン緑') !== -1 || accentName.indexOf('neon green') !== -1) return '#39FF14';
  if (accentName.indexOf('ネオン紫') !== -1 || accentName.indexOf('neon purple') !== -1) return '#BF00FF';
  if (accentName.indexOf('ネオン赤') !== -1 || accentName.indexOf('neon red') !== -1) return '#FF073A';
  if (accentName.indexOf('ゴールド') !== -1 || accentName.indexOf('gold') !== -1) return '#FFD700';
  return '#00E5FF'; // デフォルト: サイアン
}


// ============================================================
// テスト関数
// ============================================================

/**
 * 単体テスト: MORNING画像1枚を生成してDriveに保存
 * GASエディタから実行 → ログでURL確認 → ブラウザで画像確認
 */
function testImageGeneration() {
  Logger.log('=== AI画像生成テスト（MORNING）===');
  Logger.log('モデル: ' + IMAGE_GEN_MODEL);
  
  var testText = 'ドル円は156円台で推移。パウエル議長の慎重姿勢が続く中、日銀の利上げ観測がじわじわ円高圧力に。'
    + '金利差は縮小方向だが、実需のドル買いが下値を支える構図。'
    + '今日の注目は米CPI。上振れならドル買い加速、下振れなら円高に転じる分岐点。';
  
  var result = generatePostImage(testText, 'MORNING');
  
  if (result) {
    Logger.log('✅ 画像生成成功');
    Logger.log('  アーキタイプ: ' + result.archetype);
    
    // Driveに保存して確認
    var driveResult = saveImageToTempDrive_(result.blob, 'test_morning');
    if (driveResult) {
      Logger.log('  📎 確認用URL: ' + driveResult.webViewLink);
    }
  } else {
    Logger.log('❌ 画像生成失敗');
    Logger.log('');
    Logger.log('【確認事項】');
    Logger.log('1. GEMINI_API_KEY は設定されていますか？');
    Logger.log('2. モデル名 "' + IMAGE_GEN_MODEL + '" は正しいですか？');
    Logger.log('   → 画像生成対応モデルでない場合、モデル名を変更してください');
    Logger.log('   → 候補: gemini-3-pro-image-preview, gemini-3.1-flash-image-preview');
  }
}


/**
 * 全画像対象タイプ（6種）を一括テスト
 * 各5秒間隔で実行（レート制限回避）
 */
function testImageAllTypes() {
  Logger.log('=== 全画像対象タイプ テスト（6タイプ）===');
  Logger.log('モデル: ' + IMAGE_GEN_MODEL);
  Logger.log('');
  
  var testTexts = {
    MORNING: 'ドル円156円台。パウエル議長は慎重姿勢、日銀利上げ観測が円高圧力。金利差縮小 vs 実需ドル買い、今日のCPIが分岐点。',
    LONDON: '東京は155.80-156.20のレンジ。ロンドン勢参入で方向感が出るか。欧州PMIが弱く、ユーロ売りドル買いの流れ。',
    NY: '今夜のFOMC議事要旨に注目。タカ派トーンならドル買い、ハト派なら売り。テクニカルでは156.50が上値抵抗線。',
    INDICATOR: '米CPI発表まであと30分。前回3.2%に対し予想3.1%。下振れなら利下げ期待で円高、上振れならドル買い加速。',
    WEEKLY_REVIEW: '今週のドル円は154.80-157.20の約2.4円幅。水曜のCPI上振れで157円タッチ後、金曜に利益確定で155円台に。来週は日銀会合が焦点。',
    NEXT_WEEK: '来週の注目イベント。火曜: 米小売売上高、水曜: FOMC議事要旨、金曜: 日銀金融政策決定会合。利上げ判断が最大の焦点。'
  };
  
  var types = Object.keys(testTexts);
  var successCount = 0;
  
  for (var i = 0; i < types.length; i++) {
    var type = types[i];
    Logger.log('--- ' + (i + 1) + '/6: ' + type + ' ---');
    
    var result = generatePostImage(testTexts[type], type);
    if (result) {
      successCount++;
      var driveResult = saveImageToTempDrive_(result.blob, 'test_' + type.toLowerCase());
      if (driveResult) {
        Logger.log('✅ ' + type + ': 成功（' + result.archetype + '）');
        Logger.log('   📎 ' + driveResult.webViewLink);
      }
    } else {
      Logger.log('❌ ' + type + ': 失敗');
    }
    
    // レート制限回避（最後以外）
    if (i < types.length - 1) {
      Logger.log('⏳ 5秒待機...');
      Utilities.sleep(5000);
    }
    Logger.log('');
  }
  
  Logger.log('=== テスト完了: ' + successCount + '/6 成功 ===');
}

/**
 * デバッグ用: regeneratePostImageを直接テスト
 * 再生成が2秒で失敗する原因を調査するために使用
 */
function testRegenerate() {
  Logger.log('=== regeneratePostImage デバッグテスト ===');

  var testText = 'ドル円は156円台で推移。パウエル議長の慎重姿勢が続く中、日銀の利上げ観測がじわじわ円高圧力に。今日の注目は米CPI。';
  var testType = 'MORNING';
  var testArchetype = 'ダイナミック・アクション';

  Logger.log('postType: ' + testType);
  Logger.log('previousArchetype: ' + testArchetype);

  // typeConfig確認
  var typeConfig = IMAGE_TYPE_COLORS[testType];
  Logger.log('typeConfig: ' + JSON.stringify(typeConfig));
  if (!typeConfig) {
    Logger.log('❌ typeConfigがnull → ここで失敗している');
    return;
  }

  // アーキタイプ選定
  var archetype = selectImageArchetype_(testType, [testArchetype]);
  Logger.log('選定アーキタイプ: ' + JSON.stringify(archetype));

  // APIキー確認
  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  Logger.log('APIキー存在: ' + (apiKey ? 'あり（' + apiKey.substring(0, 8) + '...）' : 'なし ← これが原因の可能性'));

  // プロンプト構築
  var prompt = buildImagePrompt_(testText, testType, typeConfig, archetype);
  Logger.log('プロンプト長: ' + prompt.length + '文字');

  // API呼び出し（ここで時間がかかるはず）
  Logger.log('API呼び出し開始...');
  var blob = callGeminiImageApi_(prompt);

  if (blob) {
    Logger.log('✅ 成功: ' + Math.round(blob.getBytes().length / 1024) + 'KB');
  } else {
    Logger.log('❌ 失敗: callGeminiImageApi_がnullを返した');
  }
}