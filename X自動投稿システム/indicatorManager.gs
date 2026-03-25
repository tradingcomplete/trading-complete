/**
 * CompanaFXAutoPost - indicatorManager.gs
 * 経済指標の取得・解析・フォーマット
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 5）
 * 
 * 経済指標の結果取得（Gemini+Grounding）、解析、週次サマリーを担当。
 * REVERSE_INDICATORSグローバル変数を含む（isReverseIndicator_で使用）。
 * 
 * 外部呼び出し元:
 *   scheduler.gs: refreshTodayIndicatorResults（指標発表後トリガー）
 *   promptBuilder.gs: fetchIndicatorResults_ / formatIndicatorPreview_ 等
 */

// ========================================
// ★v5.7: 前日の経済指標結果を自動取得
// Gemini+Groundingで検索→シートに記入→MORNING注入テキスト生成
// ========================================

// ===== 【公開】定期トリガーから呼び出す指標結果取得 ★v6.7追加 =====
// scheduler.gsのscheduleTodayPosts()で設定した定時トリガーから呼び出す
function refreshTodayIndicatorResults() {
  var keys = getApiKeys();
  fetchTodayAnnouncedResults_(keys.SPREADSHEET_ID, keys.GEMINI_API_KEY);
}

// ===== 今日の発表済み指標を取得してI列に書き込む ★v6.7追加 =====
// TOKYO/LUNCH/LONDON/GOLDEN/NY生成時に呼び出し。時刻が過ぎた今日の指標を対象にする。

// ===== 今日の発表済み指標を取得してI列に書き込む ★v6.7追加 =====
// TOKYO/LUNCH/LONDON/GOLDEN/NY生成時に呼び出し。時刻が過ぎた今日の指標を対象にする。
function fetchTodayAnnouncedResults_(spreadsheetId, geminiApiKey) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet || sheet.getLastRow() < 2) return;
    
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var todayStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy/MM/dd');
    var nowHour = now.getHours();
    var nowMin = now.getMinutes();
    
    // ★v6.7: 深夜0:00〜5:59は前日の市場セッション中とみなし、前日分も対象にする
    // 例: 1:04実行 → 3/12 21:30の未記入指標も取得対象になる
    var yesterday = new Date(today.getTime() - 86400000);
    var yesterdayStr = Utilities.formatDate(yesterday, 'Asia/Tokyo', 'yyyy/MM/dd');
    var isLateNight = (nowHour >= 0 && nowHour < 6);
    
    var lastCol = Math.min(sheet.getLastColumn(), 10);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    
    // 今日の発表済み（時刻が現在より前）かつI列が空の指標を抽出
    // 深夜帯は前日分も含める
    var targets = [];
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue;
      
      var eventDate = new Date(data[i][0]);
      var dateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'yyyy/MM/dd');
      var isToday = (dateStr === todayStr);
      var isYesterday = isLateNight && (dateStr === yesterdayStr);
      if (!isToday && !isYesterday) continue;
      
      // ★v6.8: B列はDate型で保存されているためgetHours/getMinutesで取得
      var rawTime = data[i][1];
      var timeStr = '';
      var timeHour = 0;
      var timeMin = 0;
      if (rawTime instanceof Date) {
        timeHour = rawTime.getHours();
        timeMin  = rawTime.getMinutes();
        timeStr  = timeHour + ':' + (timeMin < 10 ? '0' + timeMin : timeMin);
      } else {
        timeStr = String(rawTime || '').trim();
      }
      if (!timeStr || timeStr === '0:00' || timeStr === '00:00') continue;
      
      // 発表時刻が現在より前かチェック
      // 前日分（isYesterday）は時刻に関係なく全て発表済み
      var eventHour = timeHour;
      var eventMin  = timeMin;
      if (!(rawTime instanceof Date)) {
        // テキスト型の場合はparseIntで取得
        var timeParts = timeStr.split(':');
        eventHour = parseInt(timeParts[0], 10);
        eventMin  = parseInt(timeParts[1] || '0', 10);
      }
      var isAnnounced = isYesterday
        || (nowHour > eventHour)
        || (nowHour === eventHour && nowMin >= eventMin);
      // ★v7.10: 深夜・早朝（0:00〜5:59）イベントは実際にはJST翌日未明の発表。
      // 日中（6:00以降）にこの関数が走った場合、「3:00 < 14:00 → 発表済み」と誤判定されるのを防止。
      if (!isYesterday && eventHour < 6 && nowHour >= 6) {
        isAnnounced = false;
      }
      // ★v7.10c: isYesterday（前日分）でも深夜帯イベントは現在時刻と比較
      // 例: A列=3/18, B列=3:00 → 実際はJST 3/19 3:00発表
      //     3/19 1:19に実行 → isYesterday=true だが、まだ発表前
      // 前日の日中イベント（6:00以降）は確実に発表済みなのでガード不要
      if (isYesterday && eventHour < 6) {
        if (nowHour < eventHour || (nowHour === eventHour && nowMin < eventMin)) {
          isAnnounced = false;
        }
      }
      if (!isAnnounced) continue;
      
      // I列が空またはエラーのものだけ対象
      var resultCell = (lastCol >= 9) ? data[i][8] : null;
      var hasResult = resultCell && String(resultCell).trim() !== '' && String(resultCell).trim() !== '取得失敗';
      if (hasResult) continue;
      
      var importance = String(data[i][6] || '').trim();
      if (importance !== '高' && importance !== '中') continue;
      
      targets.push({
        rowIndex: i + 2,
        date: dateStr,
        time: timeStr,
        country: String(data[i][2] || '').trim(),
        name: String(data[i][3] || '').trim(),
        previous: String(data[i][4] || '').trim(),
        forecast: String(data[i][5] || '').trim(),
        importance: importance
      });
    }
    
    if (targets.length === 0) {
      console.log('📊 今日の発表済み指標（未記入）: なし');
      return;
    }
    
    console.log('📊 今日の発表済み指標取得: ' + targets.length + '件（現在 ' + nowHour + ':' + (nowMin < 10 ? '0' + nowMin : nowMin) + '）');
    for (var d = 0; d < targets.length; d++) {
      console.log('  ' + (d + 1) + '. [' + targets[d].time + '] ' + targets[d].name + '（行' + targets[d].rowIndex + '）');
    }
    
    // Gemini+Groundingで結果を検索（buildIndicatorResultPrompt_を流用）
    var prompt = buildIndicatorResultPrompt_(targets, today);
    var result = callGemini_(prompt, geminiApiKey, true);
    
    if (!result || !result.text) {
      console.log('⚠️ 今日分: Gemini応答なし → スキップ');
      return;
    }
    
    var parsed = parseIndicatorResults_(result.text);
    if (!parsed || parsed.length === 0) {
      console.log('⚠️ 今日分: JSON解析失敗 → スキップ');
      return;
    }
    
    // I列・J列に書き込み（writeIndicatorResults_を流用）
    writeIndicatorResults_(spreadsheetId, targets, parsed);
    console.log('📊 今日の発表済み指標をシートに書き込みました');
    
  } catch (e) {
    console.log('⚠️ 今日分指標取得エラー（スキップ）: ' + e.message);
  }
}

// ===== メイン: 前日の経済指標結果を取得してシートに書き込み =====
// MORNING生成の冒頭で呼び出し。注入テキストを返す。

// ===== メイン: 前日の経済指標結果を取得してシートに書き込み =====
// MORNING生成の冒頭で呼び出し。注入テキストを返す。
function fetchIndicatorResults_(spreadsheetId, geminiApiKey) {
  try {
    // Step 1: 対象日を決定（月曜なら金曜）
    var targetDate = getIndicatorTargetDate_();
    var targetStr = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy/MM/dd');
    console.log('📊 指標結果取得: 対象日 = ' + targetStr);
    
    // Step 2: 経済カレンダーから対象指標を取得
    var indicators = getYesterdayIndicators_(spreadsheetId, targetDate);
    
    if (!indicators || indicators.length === 0) {
      console.log('📊 対象の重要指標なし → スキップ');
      return null;
    }
    
    console.log('📊 対象指標: ' + indicators.length + '件');
    for (var d = 0; d < indicators.length; d++) {
      console.log('  ' + (d + 1) + '. ' + indicators[d].name + '（予想: ' + indicators[d].forecast + '）');
    }
    
    // Step 3: Gemini+Groundingで結果を検索
    var prompt = buildIndicatorResultPrompt_(indicators, targetDate);
    var result = callGemini_(prompt, geminiApiKey, true);
    
    if (!result || !result.text) {
      console.log('⚠️ Gemini API応答なし → スキップ');
      return null;
    }
    
    console.log('📊 Gemini応答取得成功');
    
    // Step 4: JSONパース
    var parsed = parseIndicatorResults_(result.text);
    
    if (!parsed || parsed.length === 0) {
      console.log('⚠️ JSON解析失敗 → 生テキストをログ出力');
      console.log(result.text.substring(0, 500));
      return null;
    }
    
    console.log('📊 解析成功: ' + parsed.length + '件');
    
    // Step 5: シートに書き込み
    writeIndicatorResults_(spreadsheetId, indicators, parsed);
    
    // Step 6: MORNING注入用テキストを生成
    var reviewText = formatIndicatorReview_(indicators, parsed);
    if (reviewText) {
      console.log('📊 指標結果注入テキスト生成完了');
    }
    
    return reviewText;
    
  } catch (e) {
    console.log('⚠️ 指標結果取得エラー（スキップ）: ' + e.message);
    return null;
  }
}

// ===== 対象日を決定（月曜なら金曜を返す） =====

// ===== 対象日を決定（月曜なら金曜を返す） =====
function getIndicatorTargetDate_() {
  var now = new Date();
  var dow = now.getDay(); // 0=日, 1=月, 2=火, ...
  
  if (dow === 1) {
    // 月曜日 → 金曜日の指標を検索
    var fri = new Date(now);
    fri.setDate(fri.getDate() - 3);
    return fri;
  }
  if (dow === 0) {
    // 日曜日 → 金曜日の指標を検索（WEEKLY_REVIEWで使う可能性）
    var fri2 = new Date(now);
    fri2.setDate(fri2.getDate() - 2);
    return fri2;
  }
  // 火〜土 → 昨日
  var yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday;
}

// ===== 経済カレンダーから対象日の重要指標を取得 =====

// ===== 経済カレンダーから対象日の重要指標を取得 =====
function getYesterdayIndicators_(spreadsheetId, targetDate) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName('経済カレンダー');
  
  if (!sheet || sheet.getLastRow() < 2) return [];
  
  // 列数を動的に取得（I列J列が追加されている場合は10列）
  var lastCol = Math.min(sheet.getLastColumn(), 10);
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  
  var targetStr = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy/MM/dd');
  var results = [];
  
  for (var i = 0; i < data.length; i++) {
    if (!data[i][0] || !data[i][3]) continue; // 日付・指標名なしはスキップ
    
    var eventDate = new Date(data[i][0]);
    var dateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'yyyy/MM/dd');
    var importance = String(data[i][6] || '').trim(); // G列: 重要度
    
    // I列（結果）が既に記入済みならスキップ（0-indexed = 8）
    var resultCell = (lastCol >= 9) ? data[i][8] : null;
    var hasResult = resultCell && String(resultCell).trim() !== '' && String(resultCell).trim() !== '取得失敗';
    
    // 日付一致 + 重要度が高or中 + 結果が未記入
    if (dateStr === targetStr &&
        (importance === '高' || importance === '中') &&
        !hasResult) {
      results.push({
        rowIndex: i + 2, // シートの行番号（1-indexed、ヘッダー分+1）
        date: dateStr,
        time: String(data[i][1] || '').trim(),
        country: String(data[i][2] || '').trim(),
        name: String(data[i][3] || '').trim(),
        previous: String(data[i][4] || '').trim(),
        forecast: String(data[i][5] || '').trim(),
        importance: importance
      });
    }
  }
  
  return results;
}

// ===== 指標名を英語に変換（部分一致） =====

// ===== 指標名を英語に変換（部分一致） =====
function getEnglishIndicatorName_(jaName, country) {
  var keys = Object.keys(INDICATOR_NAME_MAP);
  for (var i = 0; i < keys.length; i++) {
    if (jaName.indexOf(keys[i]) !== -1) {
      return INDICATOR_NAME_MAP[keys[i]];
    }
  }
  return jaName; // マップにない場合はそのまま
}

// ===== Gemini+Grounding用プロンプトを構築 =====

// ===== Gemini+Grounding用プロンプトを構築 =====
function buildIndicatorResultPrompt_(indicators, targetDate) {
  var dateStrEn = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'MMMM d, yyyy');
  var dateStrJa = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy年M月d日');
  var nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy年M月d日 HH:mm');
  
  var prompt = '';
  prompt += '金融市場のデータアナリストとして、以下の経済指標について\n';
  prompt += dateStrJa + '（' + dateStrEn + '）に発表された結果（実績値）を\n';
  prompt += 'Google検索で正確に調べてください。\n\n';
  
  prompt += '【現在時刻】' + nowStr + '（日本時間）\n\n';
  
  prompt += '【厳守ルール】\n';
  prompt += '- 確認できない値は必ずnullと回答。絶対に値を捏造しない。\n';
  prompt += '- ★最重要: 予想値（forecast/consensus）を結果として返すな。実際に発表された公式の数値のみ。\n';
  prompt += '- ★最重要: まだ発表されていない指標（現在時刻より後に発表予定）は必ずactualをnullにせよ。\n';
  prompt += '- ★最重要: 検索結果で「予想」「見通し」「コンセンサス」としか出てこない場合、それは結果ではない。nullにせよ。\n';
  prompt += '- 数値は小数点表記で返す（例: 3.5%なら "3.5"、51.2なら "51.2"）\n';
  prompt += '- 前回値の修正（revised）があれば revised_previous に記載\n';
  prompt += '- 金利決定は「据え置き」「0.25%利下げ」等のテキストで回答\n';
  prompt += '- 要人発言はactualをnullとし、noteに一文要約を記載\n';
  prompt += '- 最新の予想値（コンセンサス）がシートの予想と異なる場合は latest_forecast に記載\n\n';
  
  prompt += '【検索すべきソース】\n';
  prompt += '- Reuters, Bloomberg, Trading Economics, Investing.com\n';
  prompt += '- BLS.gov（米雇用統計/CPI）, ISM公式（ISM指数）\n';
  prompt += '- 日銀公式, NHK, 日経新聞（日本の指標）\n\n';
  
  prompt += '【対象指標】\n';
  for (var i = 0; i < indicators.length; i++) {
    var ind = indicators[i];
    var enName = getEnglishIndicatorName_(ind.name, ind.country);
    prompt += (i + 1) + '. ';
    if (ind.time) prompt += '[' + ind.time + ' JST] ';
    if (enName !== ind.name) {
      prompt += enName + ' (' + ind.name + ')';
    } else {
      prompt += ind.name;
    }
    prompt += ' [' + ind.country + ']';
    if (ind.forecast) prompt += ' - 予想: ' + ind.forecast;
    if (ind.previous) prompt += ', 前回: ' + ind.previous;
    prompt += '\n';
  }
  
  prompt += '\n【回答形式】以下のJSON配列のみで回答してください。他のテキストは一切不要。\n';
  prompt += '```json\n[\n';
  for (var j = 0; j < indicators.length; j++) {
    prompt += '  {"index": ' + (j + 1) + ', "actual": "数値またはnull", "unit": "単位", "note": "備考またはnull", "revised_previous": "修正値またはnull", "latest_forecast": "最新予想またはnull"}';
    if (j < indicators.length - 1) prompt += ',';
    prompt += '\n';
  }
  prompt += ']\n```\n';
  
  return prompt;
}

// ===== Geminiの応答からJSONを解析 =====

// ===== Geminiの応答からJSONを解析 =====
function parseIndicatorResults_(rawText) {
  try {
    var jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    var jsonStr = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
    
    var startIdx = jsonStr.indexOf('[');
    var endIdx = jsonStr.lastIndexOf(']');
    
    if (startIdx === -1 || endIdx === -1) {
      console.log('⚠️ JSON配列が見つからない');
      return null;
    }
    
    jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    var parsed = JSON.parse(jsonStr);
    
    if (!Array.isArray(parsed)) {
      console.log('⚠️ 配列ではない');
      return null;
    }
    
    return parsed;
    
  } catch (e) {
    console.log('⚠️ JSON解析エラー: ' + e.message);
    return null;
  }
}

// ===== 解析結果をシートに書き込み =====

// ===== 解析結果をシートに書き込み =====
function writeIndicatorResults_(spreadsheetId, indicators, parsed) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet) return;
    
    for (var i = 0; i < indicators.length; i++) {
      var ind = indicators[i];
      var matchedResult = findMatchedResult_(parsed, i);
      
      if (matchedResult) {
        var actual = matchedResult.actual;
        var note = matchedResult.note || '';
        
        // ★v7.10c: Geminiがnullを返した場合は書き込まない（未発表の可能性）
        if (actual === null || actual === undefined || actual === 'null' || String(actual).trim() === '') {
          if (note && note !== 'null') {
            sheet.getRange(ind.rowIndex, 9).setValue(note);
            console.log('  ✅ ' + ind.name + ': ' + note);
          } else {
            // nullの場合は何も書き込まない（「取得失敗」も書かない）
            console.log('  ⏭️ ' + ind.name + ': 結果なし（未発表の可能性）→ スキップ');
          }
        } else {
          // I列（9列目）に結果を書き込み（単位があれば結合）
          var unit = (matchedResult.unit && matchedResult.unit !== 'null') ? String(matchedResult.unit).trim() : '';
          var actualWithUnit = String(actual);
          // 単位が予想値にも含まれていれば付与。%・円・ドル・万件・万人・億ドル等
          if (unit && actualWithUnit.indexOf(unit) === -1) {
            actualWithUnit = actualWithUnit + unit;
          }
          sheet.getRange(ind.rowIndex, 9).setValue(actualWithUnit);
          console.log('  ✅ ' + ind.name + ': 結果 = ' + actualWithUnit);
        }
        
        // J列（10列目）に判定を書き込み
        var forecastForJudge = ind.forecast;
        if (matchedResult.latest_forecast && matchedResult.latest_forecast !== 'null') {
          forecastForJudge = matchedResult.latest_forecast;
        }
        var judgment = judgeDeviation_(forecastForJudge, actual);
        if (judgment) {
          sheet.getRange(ind.rowIndex, 10).setValue(judgment);
        }
        
      } else {
        // ★v7.10c: マッチなしの場合も書き込まない（取得失敗を書くと再取得の対象外になる）
        console.log('  ⏭️ ' + ind.name + ': マッチなし → スキップ（次回リトライ対象）');
      }
    }
    
    console.log('📊 シート書き込み完了');
    
  } catch (e) {
    console.log('⚠️ シート書き込みエラー: ' + e.message);
  }
}

// ===== 解析結果と指標をマッチング =====

// ===== 解析結果と指標をマッチング =====
function findMatchedResult_(parsed, indicatorIndex) {
  if (!parsed || !Array.isArray(parsed)) return null;
  
  for (var i = 0; i < parsed.length; i++) {
    if (parsed[i].index === indicatorIndex + 1) {
      return parsed[i];
    }
  }
  
  // indexがない場合は配列の位置で対応
  if (indicatorIndex < parsed.length) {
    return parsed[indicatorIndex];
  }
  
  return null;
}

// ===== 予想 vs 結果の判定 =====
// ★v5.9.3: 逆指標リスト（数字が小さいほど良い指標）
// 失業率、新規失業保険申請件数など「下がる＝改善」の指標
var REVERSE_INDICATORS = [
  '失業率', '失業保険', '新規失業', 'Unemployment',
  '貿易赤字', '財政赤字'
];

/**
 * ★v5.9.3: 逆指標かどうかを判定
 * @param {string} name - 指標名
 * @return {boolean} true=逆指標（数字が小さいほど良い）
 */
function isReverseIndicator_(name) {
  if (!name) return false;
  for (var i = 0; i < REVERSE_INDICATORS.length; i++) {
    if (name.indexOf(REVERSE_INDICATORS[i]) !== -1) return true;
  }
  return false;
}



function judgeDeviation_(forecast, actual) {
  if (!forecast || !actual) return '';
  
  var f = parseFloat(String(forecast).replace(/[,%]/g, ''));
  var a = parseFloat(String(actual).replace(/[,%]/g, ''));
  
  if (isNaN(f) || isNaN(a)) return '';
  
  var diff = a - f;
  var threshold = Math.max(Math.abs(f) * 0.01, 0.1);
  
  if (diff > threshold) return '上振れ';
  if (diff < -threshold) return '下振れ';
  return '一致';
}

// ===== MORNING投稿用の注入テキストを生成 =====

// ===== MORNING投稿用の注入テキストを生成 =====
function formatIndicatorReview_(indicators, parsed) {
  var lines = [];
  var hasData = false;
  
  for (var i = 0; i < indicators.length; i++) {
    var ind = indicators[i];
    var result = findMatchedResult_(parsed, i);
    if (!result) continue;
    
    var actual = result.actual;
    var note = result.note || '';
    
    var forecast = ind.forecast;
    if (result.latest_forecast && result.latest_forecast !== 'null') {
      forecast = result.latest_forecast;
    }
    
    if (actual !== null && actual !== undefined && actual !== 'null' && String(actual).trim() !== '') {
      var judgment = judgeDeviation_(forecast, actual);
      var reverse = isReverseIndicator_(ind.name);
      
      // ★v5.9.3: 逆指標の場合は解釈を反転して明示
      var interpretText = '';
      if (judgment === '上振れ') {
        interpretText = reverse
          ? '（上振れ = 悪化。この通貨の売り要因）'
          : '（上振れ = この通貨の買い要因）';
      } else if (judgment === '下振れ') {
        interpretText = reverse
          ? '（下振れ = 改善。この通貨の買い要因）'
          : '（下振れ = この通貨の売り要因）';
      } else {
        interpretText = '（一致）';
      }
      
      lines.push('  ' + ind.name + ': 予想' + forecast + ' → 結果' + actual + interpretText);
      hasData = true;
    } else if (note && note !== 'null') {
      lines.push('  ' + ind.name + ': ' + note);
      hasData = true;
    }
  }
  
  if (!hasData) return null;
  
  var header = '【前日の経済指標結果（この情報のみ使え。捏造するな）】\n';
  var footer = '\n';
  footer += '  ※ 上記の（買い要因）（売り要因）の判定をそのまま信じろ。自分で再解釈するな。\n';
  footer += '  ※ 特に失業率は「数字が下がる＝改善＝買い要因」だ。数字が下がったのに「悪化」と書くな。\n';
  footer += '  ※ 指標結果と上の【レートの方向性】を組み合わせて「なぜ動いたか」を説明しろ。\n';
  footer += '  ※ 結果の数値は上記のとおり正確に使え（Gemini自身で検索し直すな）。\n';
  footer += '  ※ 前回値の修正（revised）があった場合はそれも重要な材料。\n\n';
  
  return header + lines.join('\n') + '\n' + footer;
}


// ========================================
// ★v5.7 Layer 2,3: 蓄積データの活用（過去実績・トレンド分析）
// 「忘れない。感情に流されない。毎日少しずつ賢くなる。」
// ========================================

// ===== 共通: 過去の指標結果を検索する「記憶の引き出し」 =====
/**
 * @param {string} spreadsheetId
 * @param {Object} options - indicatorName, dateFrom, dateTo, importanceFilter, maxResults
 * @return {Array} [{date, name, country, forecast, actual, judgment, importance}, ...]
 */


// ========================================
// ★v5.7 Layer 2,3: 蓄積データの活用（過去実績・トレンド分析）
// 「忘れない。感情に流されない。毎日少しずつ賢くなる。」
// ========================================

// ===== 共通: 過去の指標結果を検索する「記憶の引き出し」 =====
/**
 * @param {string} spreadsheetId
 * @param {Object} options - indicatorName, dateFrom, dateTo, importanceFilter, maxResults
 * @return {Array} [{date, name, country, forecast, actual, judgment, importance}, ...]
 */
function getIndicatorHistory_(spreadsheetId, options) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet || sheet.getLastRow() < 2) return [];
    
    var lastCol = Math.min(sheet.getLastColumn(), 10);
    if (lastCol < 9) return []; // I列がなければ空
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    var results = [];
    
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue;
      
      var actual = (lastCol >= 9) ? String(data[i][8] || '').trim() : '';
      if (!actual || actual === '取得失敗') continue;
      
      var eventDate = new Date(data[i][0]);
      var dateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'yyyy/MM/dd');
      var name = String(data[i][3]).trim();
      var importance = String(data[i][6] || '').trim();
      
      // フィルタ: 指標名（部分一致）
      if (options.indicatorName) {
        if (name.indexOf(options.indicatorName) === -1) continue;
      }
      
      // フィルタ: 日付範囲
      if (options.dateFrom) {
        var fromStr = Utilities.formatDate(options.dateFrom, 'Asia/Tokyo', 'yyyy/MM/dd');
        if (dateStr < fromStr) continue;
      }
      if (options.dateTo) {
        var toStr = Utilities.formatDate(options.dateTo, 'Asia/Tokyo', 'yyyy/MM/dd');
        if (dateStr > toStr) continue;
      }
      
      // フィルタ: 重要度
      if (options.importanceFilter && options.importanceFilter.length > 0) {
        if (options.importanceFilter.indexOf(importance) === -1) continue;
      }
      
      var judgment = (lastCol >= 10) ? String(data[i][9] || '').trim() : '';
      
      results.push({
        date: dateStr,
        time: String(data[i][1] || '').trim(),
        country: String(data[i][2] || '').trim(),
        name: name,
        previous: String(data[i][4] || '').trim(),
        forecast: String(data[i][5] || '').trim(),
        actual: actual,
        judgment: judgment,
        importance: importance
      });
    }
    
    // 日付の新しい順にソート
    results.sort(function(a, b) {
      return b.date.localeCompare(a.date);
    });
    
    if (options.maxResults) {
      results = results.slice(0, options.maxResults);
    }
    
    return results;
  } catch (e) {
    console.log('⚠️ getIndicatorHistory_ エラー: ' + e.message);
    return [];
  }
}

// ===== Layer 2: INDICATOR投稿用 - 今日の指標の「過去実績」を注入 =====

// ===== Layer 2: INDICATOR投稿用 - 今日の指標の「過去実績」を注入 =====
function formatIndicatorPreview_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet || sheet.getLastRow() < 2) return null;
    
    var now = new Date();
    var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd');
    var lastCol = Math.min(sheet.getLastColumn(), 10);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    
    // 今日の重要指標を取得
    var todayIndicators = [];
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue;
      var dateStr = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy/MM/dd');
      var importance = String(data[i][6] || '').trim();
      if (dateStr === todayStr && importance === '高') {
        todayIndicators.push(String(data[i][3]).trim());
      }
    }
    
    if (todayIndicators.length === 0) return null;
    
    var lines = [];
    lines.push('【今日の指標 過去の実績（システムの記憶。忘れるな。捏造するな。）】');
    
    for (var t = 0; t < todayIndicators.length; t++) {
      var indicatorName = todayIndicators[t];
      
      var history = getIndicatorHistory_(spreadsheetId, {
        indicatorName: indicatorName,
        maxResults: 3,
        importanceFilter: ['高', '中']
      });
      
      if (history.length === 0) {
        lines.push('');
        lines.push('■ ' + indicatorName + ': 過去データなし（初回取得）');
        continue;
      }
      
      lines.push('');
      lines.push('■ ' + indicatorName + '（過去' + history.length + '回）');
      
      var upCount = 0, downCount = 0, matchCount = 0;
      
      for (var h = 0; h < history.length; h++) {
        var rec = history[h];
        var line = '  ・' + rec.date + ': 予想' + rec.forecast + ' → 結果' + rec.actual;
        if (rec.judgment) {
          line += '（' + rec.judgment + '）';
          if (rec.judgment === '上振れ') upCount++;
          else if (rec.judgment === '下振れ') downCount++;
          else matchCount++;
        }
        lines.push(line);
      }
      
      // パターン分析
      if (history.length >= 2) {
        var pattern = '  → パターン: 直近' + history.length + '回中 ';
        var parts = [];
        if (upCount > 0) parts.push(upCount + '回上振れ');
        if (downCount > 0) parts.push(downCount + '回下振れ');
        if (matchCount > 0) parts.push(matchCount + '回一致');
        pattern += parts.join('、');
        
        if (upCount > downCount) {
          pattern += '。上振れ傾向。市場は上振れを警戒している可能性。';
        } else if (downCount > upCount) {
          pattern += '。下振れ傾向。市場の期待が高すぎる可能性。';
        }
        lines.push(pattern);
      }
    }
    
    lines.push('');
    lines.push('※ 上記は過去の事実。この実績を踏まえて「今回はどうなりそうか」のシナリオを書け。');
    lines.push('※ 「前回も上振れたから今回も上振れる」とは限らない。ただし市場心理には影響する。');
    lines.push('');
    
    return lines.join('\n');
  } catch (e) {
    console.log('⚠️ formatIndicatorPreview_ エラー: ' + e.message);
    return null;
  }
}

// ===== Layer 3.5: WEEKLY_REVIEW用 - 今週の主要ペア週間レートトレンド（日次OHLC版）=====
// 日次レートシートのOHLCから今週の各日の動きを集計し、方向性・ドラマを事実として渡す

// ===== Layer 3.5: WEEKLY_REVIEW用 - 今週の主要ペア週間レートトレンド（日次OHLC版）=====
// 日次レートシートのOHLCから今週の各日の動きを集計し、方向性・ドラマを事実として渡す
function formatWeeklyRateTrend_(spreadsheetId, rates) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(spreadsheetId || keys.SPREADSHEET_ID);

    // 今週月曜〜今日の日付範囲を算出
    var now = new Date();
    var dayOfWeek = now.getDay(); // 0=日, 1=月, ...
    var weekStartDate = new Date(now);
    weekStartDate.setDate(weekStartDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    var weekStartStr = Utilities.formatDate(weekStartDate, 'Asia/Tokyo', 'yyyy-MM-dd');
    var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');

    // 日次レートシート読み込み（A=日付, 各ペア4列: 始値/高値/安値/終値）
    var dailySheet = ss.getSheetByName('日次レート');
    if (!dailySheet || dailySheet.getLastRow() < 2) return null;
    var numCols = 1 + CURRENCY_PAIRS.length * 4 + 1;
    var dailyData = dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, numCols).getValues();

    // 対象ペア（主要3ペアのみ: ドル円・ユーロドル・ポンドドル）
    var targetPairs = [
      { idx: 0, label: 'ドル円',     unit: '円',  digits: 2, jpyPair: true  },
      { idx: 1, label: 'ユーロドル', unit: 'ドル', digits: 4, jpyPair: false },
      { idx: 2, label: 'ポンドドル', unit: 'ドル', digits: 4, jpyPair: false }
    ];
    var dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    // 今週の日次データを収集
    var weekRows = [];
    for (var i = 0; i < dailyData.length; i++) {
      var rowDate = dailyData[i][0];
      var dateStr = (rowDate instanceof Date)
        ? Utilities.formatDate(rowDate, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(rowDate).substring(0, 10);
      if (dateStr < weekStartStr || dateStr > todayStr) continue;
      var d = (rowDate instanceof Date) ? rowDate : new Date(rowDate);
      weekRows.push({ dateStr: dateStr, dayName: dayNames[d.getDay()], row: dailyData[i] });
    }

    if (weekRows.length === 0) return null;
    weekRows.sort(function(a, b) { return a.dateStr < b.dateStr ? -1 : 1; });

    var lines = [];
    lines.push('【今週の主要ペア週間トレンド（事実データ。通貨の方向性を正確に反映せよ）】');
    lines.push('※ 日次レートOHLCから自動算出。このデータが事実。感覚・印象で上書き禁止。');
    lines.push('');

    for (var p = 0; p < targetPairs.length; p++) {
      var cfg = targetPairs[p];
      var colBase = 1 + cfg.idx * 4; // colBase+0=始値, +1=高値, +2=安値, +3=終値

      var weekOpen  = Number(weekRows[0].row[colBase]);
      var weekClose = rates && rates[CURRENCY_PAIRS[cfg.idx].key]
                    ? Number(rates[CURRENCY_PAIRS[cfg.idx].key])
                    : Number(weekRows[weekRows.length - 1].row[colBase + 3]);

      var weekHigh = 0, weekLow = 999999;
      for (var r = 0; r < weekRows.length; r++) {
        var h = Number(weekRows[r].row[colBase + 1]);
        var l = Number(weekRows[r].row[colBase + 2]);
        if (h > weekHigh) weekHigh = h;
        if (l < weekLow)  weekLow  = l;
      }

      var weekChange = weekClose - weekOpen;
      var changeStr  = (weekChange >= 0 ? '+' : '') + weekChange.toFixed(cfg.digits);
      var pips = cfg.jpyPair
               ? Math.round(Math.abs(weekChange) * 100)
               : Math.round(Math.abs(weekChange) * 10000);
      var range = weekHigh - weekLow;
      var rangeStr = cfg.jpyPair
               ? Math.round(range * 100) + 'pips'
               : Math.round(range * 10000) + 'pips';

      var direction = '';
      if (cfg.jpyPair) {
        direction = weekChange > 0.1 ? 'ドル買い・円売り（ドル円上昇）'
                  : weekChange < -0.1 ? 'ドル売り・円買い（ドル円下落）'
                  : 'レンジ（方向感なし）';
      } else {
        var baseCcy = cfg.label.replace('ドル', '');
        direction = weekChange > 0.001 ? baseCcy + '買い・ドル売り（' + cfg.label + '上昇）'
                  : weekChange < -0.001 ? baseCcy + '売り・ドル買い（' + cfg.label + '下落）'
                  : 'レンジ（方向感なし）';
      }

      var dailySummary = [];
      for (var r2 = 0; r2 < weekRows.length; r2++) {
        var open2  = Number(weekRows[r2].row[colBase]);
        var close2 = Number(weekRows[r2].row[colBase + 3]);
        var diff   = close2 - open2;
        var arrow  = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        dailySummary.push(weekRows[r2].dayName + '曜' + arrow + close2.toFixed(cfg.digits));
      }

      lines.push('■ ' + cfg.label);
      lines.push('  週始（月曜）: ' + weekOpen.toFixed(cfg.digits) + cfg.unit
               + ' → 現在: ' + weekClose.toFixed(cfg.digits) + cfg.unit
               + '（' + changeStr + cfg.unit + ' / ' + pips + 'pips）');
      lines.push('  週間レンジ: ' + weekLow.toFixed(cfg.digits) + '〜' + weekHigh.toFixed(cfg.digits) + cfg.unit
               + '（' + rangeStr + '）');
      lines.push('  日次推移: ' + dailySummary.join(' → '));
      lines.push('  今週の方向性: ' + direction);
      lines.push('');
    }

    lines.push('⚠️ 上記と矛盾する表現（例: ドル円上昇週なのに「円が買われた」等）は絶対禁止。');
    lines.push('');
    return lines.join('\n');

  } catch (e) {
    console.log('⚠️ formatWeeklyRateTrend_ エラー: ' + e.message);
    return null;
  }
}


// ===== Layer 3: WEEKLY_REVIEW用 - 今週の全指標結果サマリー =====


// ===== Layer 3: WEEKLY_REVIEW用 - 今週の全指標結果サマリー =====
function formatWeeklyIndicatorSummary_(spreadsheetId) {
  try {
    var now = new Date();
    var dow = now.getDay();
    var mondayOffset = (dow === 0) ? -6 : 1 - dow;
    var monday = new Date(now);
    monday.setDate(monday.getDate() + mondayOffset);
    
    var history = getIndicatorHistory_(spreadsheetId, {
      dateFrom: monday,
      dateTo: now,
      importanceFilter: ['高', '中']
    });
    
    if (!history || history.length === 0) return null;
    
    var lines = [];
    lines.push('【今週の指標結果サマリー（システムの正確な記録。これだけが事実。）】');
    
    var upCount = 0, downCount = 0, matchCount = 0;
    
    for (var i = 0; i < history.length; i++) {
      var rec = history[i];
      var emoji = '';
      if (rec.judgment === '上振れ') { emoji = '📈'; upCount++; }
      else if (rec.judgment === '下振れ') { emoji = '📉'; downCount++; }
      else if (rec.judgment === '一致') { emoji = '➡️'; matchCount++; }
      else { emoji = '📊'; }
      
      lines.push('  ' + emoji + ' ' + rec.date + ' ' + rec.name + ': 予想' + rec.forecast + ' → 結果' + rec.actual);
    }
    
    var total = upCount + downCount + matchCount;
    if (total >= 2) {
      lines.push('');
      lines.push('  今週の集計: ' + total + '件中 上振れ' + upCount + '件 / 下振れ' + downCount + '件 / 一致' + matchCount + '件');
      
      if (upCount > downCount && upCount > matchCount) {
        lines.push('  → 今週は上振れ優勢。景気の底堅さ or インフレの粘着性が示された週。');
      } else if (downCount > upCount && downCount > matchCount) {
        lines.push('  → 今週は下振れ優勢。景気減速 or インフレ鈍化のシグナル。');
      } else {
        lines.push('  → 今週は強弱混在。方向感が出にくい週だった。');
      }
    }
    
    lines.push('');
    lines.push('※ この事実だけを使って週の総括を書け。記載にない指標結果は捏造するな。');
    lines.push('');
    
    return lines.join('\n');
  } catch (e) {
    console.log('⚠️ formatWeeklyIndicatorSummary_ エラー: ' + e.message);
    return null;
  }
}

// ===== Layer 3: MORNING用 - 直近1ヶ月の指標トレンド =====

// ===== Layer 3: MORNING用 - 直近1ヶ月の指標トレンド =====
function formatIndicatorTrend_(spreadsheetId) {
  try {
    var now = new Date();
    var oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    var history = getIndicatorHistory_(spreadsheetId, {
      dateFrom: oneMonthAgo,
      dateTo: now,
      importanceFilter: ['高']
    });
    
    if (!history || history.length < 3) return null;
    
    // カテゴリ別に分類
    var categories = {
      '物価系': { keywords: ['CPI', '消費者物価', 'PCE', 'PPI', '物価', 'デフレーター'], up: 0, down: 0, match: 0 },
      '雇用系': { keywords: ['雇用', '失業', 'ADP', 'JOLTS', 'NFP', '時給'], up: 0, down: 0, match: 0 },
      '景況感系': { keywords: ['ISM', 'PMI', '信頼感', 'ミシガン', '景況'], up: 0, down: 0, match: 0 },
      'その他': { keywords: [], up: 0, down: 0, match: 0 }
    };
    
    var totalUp = 0, totalDown = 0, totalMatch = 0;
    
    for (var i = 0; i < history.length; i++) {
      var rec = history[i];
      var categorized = false;
      
      var catKeys = Object.keys(categories);
      for (var c = 0; c < catKeys.length - 1; c++) {
        var cat = categories[catKeys[c]];
        for (var k = 0; k < cat.keywords.length; k++) {
          if (rec.name.indexOf(cat.keywords[k]) !== -1) {
            if (rec.judgment === '上振れ') { cat.up++; totalUp++; }
            else if (rec.judgment === '下振れ') { cat.down++; totalDown++; }
            else { cat.match++; totalMatch++; }
            categorized = true;
            break;
          }
        }
        if (categorized) break;
      }
      
      if (!categorized) {
        if (rec.judgment === '上振れ') { categories['その他'].up++; totalUp++; }
        else if (rec.judgment === '下振れ') { categories['その他'].down++; totalDown++; }
        else { categories['その他'].match++; totalMatch++; }
      }
    }
    
    var total = totalUp + totalDown + totalMatch;
    if (total < 3) return null;
    
    var lines = [];
    lines.push('【直近1ヶ月の指標トレンド（システムの記憶。感情ではなくデータで語れ。）】');
    lines.push('  全' + total + '件: 上振れ' + totalUp + ' / 下振れ' + totalDown + ' / 一致' + totalMatch);
    
    var catKeys2 = Object.keys(categories);
    for (var c2 = 0; c2 < catKeys2.length; c2++) {
      var catName = catKeys2[c2];
      var cat2 = categories[catName];
      var catTotal = cat2.up + cat2.down + cat2.match;
      if (catTotal === 0) continue;
      
      var trend = '';
      if (cat2.up > cat2.down) trend = '→ 上振れ傾向';
      else if (cat2.down > cat2.up) trend = '→ 下振れ傾向';
      else trend = '→ 混在';
      
      lines.push('  ' + catName + ': 上振れ' + cat2.up + ' / 下振れ' + cat2.down + ' / 一致' + cat2.match + ' ' + trend);
    }
    
    lines.push('');
    if (totalUp > totalDown * 1.5) {
      lines.push('  全体: 指標は上振れ基調。景気の底堅さ or インフレの粘着性が続いている。');
    } else if (totalDown > totalUp * 1.5) {
      lines.push('  全体: 指標は下振れ基調。景気減速のサインが出始めている。');
    } else {
      lines.push('  全体: 強弱混在。市場は方向感を探っている段階。');
    }
    lines.push('');
    
    return lines.join('\n');
  } catch (e) {
    console.log('⚠️ formatIndicatorTrend_ エラー: ' + e.message);
    return null;
  }
}



function getLatestIndicators_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('指標データ');
    
    if (!sheet) {
      return null;
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    
    // A列:ラベル B列:値 C列:単位（行2〜7を想定）
    var dataRows = Math.min(lastRow - 1, 6); // 最大6行
    var data = sheet.getRange(2, 1, dataRows, 3).getValues();
    
    var result = {};
    var validCount = 0;
    
    // MARKET_INDICATORSと照合して読み取り
    for (var i = 0; i < data.length; i++) {
      var label = String(data[i][0]).trim();
      var val = data[i][1];
      
      if (val === '' || val === null || val === undefined || val === '#N/A' || val === '#ERROR!') {
        continue;
      }
      
      var numVal = parseFloat(val);
      if (isNaN(numVal)) continue;
      
      // ラベルからキーを特定
      if (typeof MARKET_INDICATORS !== 'undefined') {
        for (var j = 0; j < MARKET_INDICATORS.length; j++) {
          if (MARKET_INDICATORS[j].label === label) {
            // 範囲チェック
            var ind = MARKET_INDICATORS[j];
            if (numVal >= ind.min && numVal <= ind.max) {
              // ★ TNXスケール補正: GOOGLEFINANCE("TNX")は実際の値の10倍で返す
              var storeVal = ind.tnxScale ? numVal * ind.tnxScale : numVal;
              result[ind.key] = storeVal;
              validCount++;
            } else {
              console.log('⚠️ ' + label + ' が範囲外: ' + numVal + '（' + ind.min + '〜' + ind.max + '）');
            }
            break;
          }
        }
      }
    }
    
    if (validCount === 0) return null;
    
    // ★v6.9: F1セルにGAS読み取り日時を書き込む
    try {
      var now = new Date();
      var readTime = 'GAS読み取り: ' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
      sheet.getRange(1, 6).setValue(readTime);
      SpreadsheetApp.flush(); // ★v7.10: GOOGLEFINANCE数式シートとの書き込み競合を防止
    } catch (e2) {
      console.log('⚠️ 指標データF列書き込み失敗: ' + e2.message);
    }
    
    return result;
  } catch (e) {
    console.log('⚠️ 指標データ読み取りエラー: ' + e.message);
    return null;
  }
}

/**
 * 「指標データ」シートを作成し、GOOGLEFINANCE数式を自動投入する
 * 初回1回だけ実行。実行後は関数削除OK
 */

/**
 * 「指標データ」シートを作成し、GOOGLEFINANCE数式を自動投入する
 * 初回1回だけ実行。実行後は関数削除OK
 */
function setupIndicatorSheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // 既存シートはクリア、なければ新規作成（getUi不使用でGASエディタからも実行可能）
  var sheet = ss.getSheetByName('指標データ');
  if (sheet) {
    sheet.clear();
    console.log('既存の「指標データ」シートをクリアして更新します');
  } else {
    sheet = ss.insertSheet('指標データ');
  }
  
  // ヘッダー
  var headers = ['指標名', '現在値', '単位', 'シンボル', '更新状態', 'GAS読み取り'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  
  // GOOGLEFINANCE数式を投入（★ゴールドは非対応のため削除。Alpha Vantageで取得）
  var indicators = [
    { label: '日経225',       formula: '=GOOGLEFINANCE("INDEXNIKKEI:NI225","price")', unit: '円',  symbol: 'INDEXNIKKEI:NI225' },
    { label: 'NYダウ',        formula: '=GOOGLEFINANCE("INDEXDJX:.DJI","price")',      unit: 'ドル',symbol: 'INDEXDJX:.DJI' },
    { label: 'S&P500',        formula: '=GOOGLEFINANCE("INDEXSP:.INX","price")',       unit: '',    symbol: 'INDEXSP:.INX' },
    { label: '米10年債利回り', formula: '=GOOGLEFINANCE("TNX","price")',                unit: '%',   symbol: 'TNX' },
    { label: 'VIX',           formula: '=GOOGLEFINANCE("INDEXCBOE:VIX","price")',      unit: '',    symbol: 'INDEXCBOE:VIX' }
  ];
  
  for (var i = 0; i < indicators.length; i++) {
    var row = i + 2;
    var ind = indicators[i];
    sheet.getRange(row, 1).setValue(ind.label);
    sheet.getRange(row, 2).setFormula(ind.formula);
    sheet.getRange(row, 3).setValue(ind.unit);
    sheet.getRange(row, 4).setValue(ind.symbol);
    sheet.getRange(row, 5).setFormula('=IF(ISNUMBER(B' + row + '),"✅ OK","❌ 要確認")');
  }
  
  // 書式設定
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 50);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(5, 100);
  
  sheet.getRange('B2').setNumberFormat('#,##0');
  sheet.getRange('B3').setNumberFormat('#,##0');
  sheet.getRange('B4').setNumberFormat('#,##0.00');
  sheet.getRange('B5').setNumberFormat('0.000');
  sheet.getRange('B6').setNumberFormat('0.00');
  
  sheet.getRange(7, 1).setValue('このシートはGOOGLEFINANCE関数で自動更新されます（15〜20分遅延）');
  sheet.getRange(7, 1).setFontColor('#666666');
  sheet.getRange(8, 1).setValue('E列が全て「✅ OK」なら正常動作中');
  sheet.getRange(8, 1).setFontColor('#666666');
  sheet.getRange(9, 1).setValue('※ゴールドはGOOGLEFINANCE非対応のためAlpha Vantageで取得');
  sheet.getRange(9, 1).setFontColor('#999999');
  
  SpreadsheetApp.flush();
  
  console.log('✅ 指標データシートを更新しました（5指標・ゴールド行を削除）');
  console.log('E列が全て ✅ OK なら正常です');
}

