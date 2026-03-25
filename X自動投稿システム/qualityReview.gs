/**
 * CompanaFXAutoPost - qualityReview.gs
 * 投稿品質レビュー（Claude API）
 * 
 * v8.6: 新規作成
 * 
 * Geminiが生成した投稿を、Claude（別モデル）がクロスチェックする。
 * 「正確か？」はfactCheckPost_（Gemini）が担当。
 * 「良い投稿か？」はqualityReviewPost_（Claude）が担当。
 * 
 * レビュー項目:
 *   Q1. タイプ整合: 投稿の冒頭・トーンがpostTypeの時間帯と合っているか
 *   Q2. 表現重複: 今日の過去投稿と同じ締め文・フレーズが使われていないか
 *   Q3. 文の完成度: 体言止め・文脈の飛躍・途中で切れた文がないか
 *   Q4. 文字数: charMin〜charMax内に収まっているか
 *   Q5. 口調の一貫性: コンパナの口調が維持されているか
 * 
 * 必要なスクリプトプロパティ:
 *   CLAUDE_API_KEY: Anthropic APIキー
 */


// ===== 投稿タイプ別の時間帯と役割（Q1判定用） =====
var TYPE_DESCRIPTIONS = {
  'MORNING': '朝7:30頃配信。昨夜のNY市場のおさらい→今日の東京オープンへの橋渡し。「昨夜NYで〜」「今日の東京では〜」が自然な切り口。NG: 「今まさに〜」（NY市場は閉まっている）',
  'TOKYO': '朝9:30頃配信。東京市場オープン後の「観察」を伝える。「東京オープン後、ドル円は〜」が自然。NG: 「〜が予想される」（東京は既に動いている。予想ではなく観察）',
  'LUNCH': '昼12時台配信。午前の振り返り+午後の欧州勢参入への橋渡し。「午前中は〜」「欧州勢が入ってくる午後は〜」が自然。',
  'LONDON': '夕方17時台配信。「ここから欧州勢が本番」という緊張感。「欧州勢が入ってきた」「東京とロンドンの温度差」が自然。NG: 「週明けの東京市場は〜」（LONDONは東京の話ではない）',
  'GOLDEN': '夜20-21時台配信。1日を振り返る共感重視のトーン。「今日を振り返ると〜」居酒屋トークの温度感。',
  'NY': '夜22時台配信。NY市場オープン前の緊張感。「今夜の勝負所」「NYの焦点は〜」が自然。',
  'INDICATOR': '指標発表30分前の速報感。「あと○分で○○発表」の緊張感。先輩が後輩に直前に教える感覚。',
  'WEEKLY_REVIEW': '土曜朝。今週の振り返りをストーリーで語る。レートの羅列禁止。',
  'WEEKLY_LEARNING': '土曜夕方。今週の学び・気づき。市場レポートではなく心理面・判断の反省。',
  'NEXT_WEEK': '日曜昼。来週の展望。経済カレンダーに基づいた具体的な予告。',
  'WEEKLY_HYPOTHESIS': '日曜夜。来週の仮説。条件→理由→結果の3要素構造。',
  'RULE_1': '土曜。トレーダーの知識・原則。心得投稿。',
  'RULE_2': '土曜。習慣・メンタルの心得投稿。',
  'RULE_3': '日曜。実践テクニックの心得投稿。',
  'RULE_4': '日曜。失敗談・本音の心得投稿。',
  'KNOWLEDGE': '知識解説投稿。難しい金融を楽しくかみ砕く。教科書ではない。'
};


// ===== メイン: 品質レビュー =====
/**
 * Claude APIで投稿の品質をレビューする
 * 
 * @param {string} postText - レビュー対象の投稿テキスト
 * @param {string} postType - 投稿タイプ
 * @param {Object} typeConfig - POST_TYPES[postType]（charMin/charMax等）
 * @return {Object} { passed: boolean, issues: Array, revisedText: string }
 */
function qualityReviewPost_(postText, postType, typeConfig) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!apiKey) {
      console.log('⚠️ CLAUDE_API_KEY未設定 → 品質レビューをスキップ');
      return { passed: true, issues: [], revisedText: '' };
    }
    
    // 今日の過去投稿を取得（重複チェック用）
    var previousPosts = getTodayPreviousPosts_();
    
    // 投稿タイプの時間帯と役割
    var typeDesc = TYPE_DESCRIPTIONS[postType] || '';
    
    // 文字数情報
    var charMin = typeConfig.charMin || 200;
    var charMax = typeConfig.charMax || 350;
    var bodyText = postText.split(/\n\n#/)[0]; // ハッシュタグ前の本文
    var currentLength = bodyText.length;
    
    // プロンプト構築
    var prompt = 'あなたはFX関連X投稿の品質レビュアーです。\n';
    prompt += '以下の投稿を5つの観点でレビューし、問題があれば修正してください。\n\n';
    
    prompt += '【投稿タイプ】' + postType + '（' + (typeConfig.label || '') + '）\n';
    prompt += '【投稿タイプの時間帯と役割】' + typeDesc + '\n';
    prompt += '【文字数制限】' + charMin + '〜' + charMax + '文字（現在: ' + currentLength + '文字）\n\n';
    
    prompt += '【レビュー対象の投稿テキスト】\n';
    prompt += postText + '\n\n';
    
    if (previousPosts && previousPosts.length > 0) {
      prompt += '【今日の過去投稿（重複チェック用）】\n';
      for (var i = 0; i < previousPosts.length; i++) {
        prompt += '--- ' + previousPosts[i].type + ' ---\n';
        prompt += previousPosts[i].text + '\n\n';
      }
    }
    
    prompt += '【レビュー項目】\n';
    prompt += 'Q1. タイプ整合: この投稿の冒頭・トーンは「' + postType + '」の時間帯と合っているか？\n';
    prompt += '    上記の【時間帯と役割】に基づいて判定せよ。\n';
    prompt += 'Q2. 表現重複: 今日の過去投稿と同じ締め文・フレーズ（「休む勇気」「検証日和」等）が使われていないか？\n';
    prompt += '    同じフレーズが既に使われていたら別表現に変更せよ。\n';
    prompt += 'Q3. 文の完成度: 体言止めで文が完結していない箇所、文脈が飛躍している箇所はないか？\n';
    prompt += 'Q4. 文字数: ' + charMin + '〜' + charMax + '文字に収まっているか？（現在' + currentLength + '文字）\n';
    prompt += '    超過している場合は、冗長な補足説明を削って範囲内に収めよ。\n';
    prompt += 'Q5. 口調の一貫性: コンパナの口調（ですね/かなと/なんですよ/って感じ）が維持されているか？\n';
    prompt += '    アナリスト調（〜である/〜と見られる）になっていたら修正せよ。\n\n';
    
    prompt += '【修正時の絶対ルール】\n';
    prompt += '・絵文字構造（📕📝💡☕⚠️✅で始まるブロック）は絶対に変えるな。\n';
    prompt += '・→行の構造も変えるな。\n';
    prompt += '・ハッシュタグ行はそのまま残せ。\n';
    prompt += '・修正は最小限に。問題のある箇所だけ直して、それ以外は一切触るな。\n';
    prompt += '・事実やレートの数値は変更するな（事実検証は別の仕組みが担当）。\n\n';
    
    prompt += '【出力形式】JSON形式のみ出力。それ以外のテキストは不要。\n';
    prompt += '{\n';
    prompt += '  "passed": true/false,\n';
    prompt += '  "issues": [\n';
    prompt += '    {\n';
    prompt += '      "id": "Q1〜Q5のどれか",\n';
    prompt += '      "problem": "問題の説明（日本語）",\n';
    prompt += '      "fix": "どう修正したか（日本語）"\n';
    prompt += '    }\n';
    prompt += '  ],\n';
    prompt += '  "revisedText": "問題があった場合の修正済みテキスト（問題なければ空文字）"\n';
    prompt += '}\n';
    prompt += '問題がなければ {"passed": true, "issues": [], "revisedText": ""} を返せ。\n';
    
    // Claude API呼び出し
    var result = callClaude_(prompt, apiKey);
    
    if (!result) {
      console.log('⚠️ Claude API呼び出し失敗 → 品質レビューをスキップ');
      return { passed: true, issues: [], revisedText: '' };
    }
    
    // JSONパース
    var parsed = parseClaudeResponse_(result);
    
    if (!parsed) {
      console.log('⚠️ Claude品質レビュー応答のパース失敗 → スキップ');
      return { passed: true, issues: [], revisedText: '' };
    }
    
    // ログ出力
    if (parsed.passed) {
      console.log('✅ 品質レビュー（Claude）: 合格');
    } else {
      console.log('📝 品質レビュー（Claude）: ' + parsed.issues.length + '件の改善');
      for (var j = 0; j < parsed.issues.length; j++) {
        var issue = parsed.issues[j];
        console.log('  ' + issue.id + ': ' + issue.problem);
      }
    }
    
    return parsed;
    
  } catch (e) {
    console.log('⚠️ 品質レビューエラー: ' + e.message + ' → スキップ');
    return { passed: true, issues: [], revisedText: '' };
  }
}


// ===== Claude API呼び出し =====
/**
 * Anthropic Messages APIを呼び出す
 * 
 * @param {string} prompt - プロンプト
 * @param {string} apiKey - Anthropic APIキー
 * @return {string|null} レスポンステキスト
 */
function callClaude_(prompt, apiKey) {
  var url = 'https://api.anthropic.com/v1/messages';
  
  var requestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      { role: 'user', content: prompt }
    ]
  };
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
  
  for (var attempt = 1; attempt <= 2; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      
      if (code === 200) {
        var body = JSON.parse(response.getContentText());
        if (body.content && body.content.length > 0 && body.content[0].text) {
          console.log('✅ Claude API成功（試行' + attempt + '）');
          return body.content[0].text;
        }
      }
      
      console.log('⚠️ Claude API失敗 (' + code + ') 試行' + attempt + '/2');
      if (code === 429) {
        Utilities.sleep(5000);
      } else {
        Utilities.sleep(2000);
      }
    } catch (e) {
      console.log('⚠️ Claude APIエラー: ' + e.message + ' 試行' + attempt + '/2');
      Utilities.sleep(2000);
    }
  }
  
  return null;
}


// ===== Claudeレスポンスのパース =====
function parseClaudeResponse_(text) {
  try {
    // ```json ... ``` を除去
    var cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var parsed = JSON.parse(cleaned);
    
    return {
      passed: !!parsed.passed,
      issues: parsed.issues || [],
      revisedText: parsed.revisedText || ''
    };
  } catch (e) {
    console.log('⚠️ Claude応答JSON解析失敗: ' + e.message);
    console.log('  応答冒頭: ' + text.substring(0, 200));
    return null;
  }
}


// ===== 今日の過去投稿を取得（ScriptPropertiesキャッシュ） =====
/**
 * 今日生成された過去の投稿テキストを取得する
 * 各投稿はgeneratePost成功時にcacheTodayPost_()で保存される
 * 
 * @return {Array} [{type: 'MORNING', text: '...'}, ...]
 */
function getTodayPreviousPosts_() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var posts = [];
  
  for (var key in allProps) {
    if (key.indexOf('TODAY_POST_') === 0) {
      try {
        var data = JSON.parse(allProps[key]);
        posts.push(data);
      } catch (e) { /* パース失敗は無視 */ }
    }
  }
  
  return posts;
}


/**
 * 今日の投稿をキャッシュに保存する（generatePost成功時に呼ぶ）
 * 
 * @param {string} postType - 投稿タイプ
 * @param {string} postText - 投稿テキスト
 */
function cacheTodayPost_(postType, postText) {
  var props = PropertiesService.getScriptProperties();
  var key = 'TODAY_POST_' + postType;
  props.setProperty(key, JSON.stringify({
    type: postType,
    text: postText.split(/\n\n#/)[0], // ハッシュタグ前の本文のみ（容量節約）
    time: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm')
  }));
}


/**
 * 今日の投稿キャッシュをクリアする（scheduleTodayPosts()の冒頭で呼ぶ）
 */
function clearTodayPostCache_() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var cleared = 0;
  
  for (var key in allProps) {
    if (key.indexOf('TODAY_POST_') === 0) {
      props.deleteProperty(key);
      cleared++;
    }
  }
  
  if (cleared > 0) {
    console.log('🗑️ 前日の投稿キャッシュをクリア: ' + cleared + '件');
  }
}


// ===== テスト関数 =====
/**
 * 品質レビューの動作確認用テスト
 * GASエディタから手動実行
 */
function testQualityReview() {
  var testText = '☕中東情勢の緊迫化で、週明けの東京市場はリスクオフムードがかなり重かったですね。\n\n';
  testText += '📝ユーロドル、本日はじわじわ下落。\n';
  testText += '→先週金曜は上昇していたんですけど、今日は一転して1.1537ドル付近まで値を下げてきましたね。\n\n';
  testText += '💡これからユーロ圏の3月消費者信頼感（速報値）の発表があります。\n';
  testText += '→予想が-14.2と前回より悪化する見込みなんですよ。\n\n';
  testText += '相場が難しい日は、無理せず休む勇気が大事って本気で思います。\n\n';
  testText += '#FX #ユーロドル';
  
  var typeConfig = POST_TYPES['LONDON'];
  var result = qualityReviewPost_(testText, 'LONDON', typeConfig);
  
  console.log('=== 品質レビュー結果 ===');
  console.log('合格: ' + result.passed);
  console.log('問題数: ' + result.issues.length);
  for (var i = 0; i < result.issues.length; i++) {
    console.log('  ' + result.issues[i].id + ': ' + result.issues[i].problem);
    if (result.issues[i].fix) {
      console.log('    修正: ' + result.issues[i].fix);
    }
  }
  if (result.revisedText) {
    console.log('--- 修正後テキスト ---');
    console.log(result.revisedText);
  }
}
