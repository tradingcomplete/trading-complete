/**
 * CompanaFXAutoPost - llmApi.gs
 * Gemini API 呼び出しラッパー + レスポンステキスト抽出
 *
 * 提供する関数:
 *   - callGemini_: Gemini API 呼び出し(Grounding 対応)
 *   - extractTextFromResponse_: レスポンス body から text を抽出
 *
 * 設計思想:
 *   リサーチ(ニュース取得)と検証(factCheck)で Gemini を使うため
 *   ライティング(投稿生成)は Claude に移行済み(v12.4〜)
 *
 * 履歴:
 *   v3.x〜: Gemini API 連携
 *   v5.5 Phase 7: Grounding 対応
 *   v14.0 Phase R-1(2026-04-23): geminiApi.gs から独立ファイルへ分離
 */


// ===== Gemini API呼び出し =====
function callGemini_(prompt, apiKey, useGrounding) {
  var url = GEMINI_API_URL + GEMINI_MODEL + ':generateContent?key=' + apiKey;
  
  var requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 8192  // ★v7.10: 1024→8192（2.5以降はthinkingトークンが含まれるため余裕を持たせる）
    }
  };
  
  // ★v7.10: gemini-2.5以降のthinkingトークン制御
  // thinkingがmaxOutputTokensを食い尽くして出力が切れるのを防止
  if (GEMINI_MODEL.indexOf('2.5') !== -1 || GEMINI_MODEL.indexOf('3') !== -1) {
    requestBody.generationConfig.thinkingConfig = { thinkingBudget: 1024 };
  }
  
  if (useGrounding) {
    requestBody.tools = [{ google_search: {} }];
  }
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
  
  var MAX_RETRIES = 2;  // ★v12.2: 3→2（503多発時のタイムアウト防止。早めにClaudeフォールバック）
  for (var attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      var body = JSON.parse(response.getContentText());
      
      if (code === 200) {
        var text = extractTextFromResponse_(body);
        if (text) {
          console.log('✅ Gemini API成功（試行' + attempt + '）');
          return { text: text, raw: body };
        }
      }
      
      console.log('⚠️ Gemini API失敗 (' + code + ') 試行' + attempt + '/' + MAX_RETRIES);
      console.log('レスポンス: ' + JSON.stringify(body).substring(0, 500));
      
      if (code === 429 || code === 503) {
        // ★v12.2: 503（高需要）も段階的リトライ（10秒→20秒→30秒）
        Utilities.sleep(10000 * attempt);
      } else {
        Utilities.sleep(2000);
      }
    } catch (e) {
      console.log('⚠️ Gemini APIエラー: ' + e.message + ' 試行' + attempt + '/' + MAX_RETRIES);
      Utilities.sleep(2000);
    }
  }
  
  // ★v12.2→v12.5: Pro失敗時にClaude APIで自動フォールバック（callClaudeApi_共通関数経由）
  var claudeApiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (claudeApiKey) {
    console.log('🔄 Gemini Pro全滅 → Claude にフォールバック');
    var claudeResult = callClaudeApi_(prompt, claudeApiKey, { maxRetries: 1, logPrefix: 'Claudeフォールバック' });
    if (claudeResult) {
      PropertiesService.getScriptProperties().setProperty('FLASH_FALLBACK_USED', 'claude');
      return claudeResult;
    }
  }
  
  return null;
}

// ===== レスポンスからテキスト抽出 =====
function extractTextFromResponse_(body) {
  try {
    if (body.candidates && body.candidates.length > 0) {
      var parts = body.candidates[0].content.parts;
      var textParts = [];
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].text) {
          textParts.push(parts[i].text);
        }
      }
      return textParts.join('');
    }
  } catch (e) {
    console.log('テキスト抽出エラー: ' + e.message);
  }
  return null;
}


