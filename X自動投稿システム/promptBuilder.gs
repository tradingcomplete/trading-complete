/**
 * CompanaFXAutoPost - promptBuilder.gs
 * プロンプト構築 + データ注入
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 6）
 * 
 * buildPrompt_はシステム最大の関数（636行）。
 * 他のほぼ全モジュールの関数を呼び出し、投稿プロンプトを組み立てる。
 * 
 * 呼び出す外部関数の所在:
 *   rateManager.gs: getLatestRateText_
 *   marketAnalysis.gs: calculateRateDirection_, detectHotPair_, fetchMarketNews_, analyzePriceHistory_
 *   indicatorManager.gs: fetchIndicatorResults_, formatIndicatorPreview_, formatWeeklyRateTrend_,
 *                        formatWeeklyIndicatorSummary_, formatIndicatorTrend_, getLatestIndicators_
 *   config.gs: getPolicyRatesText_
 *   sheetsManager.gs: getCharacterPrompt
 * 
 * プロンプト肥大化の監視:
 *   現在のプロンプト総文字数は約23,000文字（約11,500トークン）。
 *   セクション数は93-97個。肥大化が進行中のため、定期的な見直しが必要。
 */


function getPostPrompt_(postType) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('投稿プロンプト');
    
    if (!sheet) {
      console.log('⚠️ 投稿プロンプトシートが見つかりません');
      return null;
    }
    
    var data = sheet.getDataRange().getValues();
    
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === postType) {
        return {
          name: data[i][1],
          prompt: data[i][2]
        };
      }
    }
    
    console.log('⚠️ 投稿タイプが見つかりません: ' + postType);
    return null;
  } catch (e) {
    console.log('投稿プロンプト取得エラー: ' + e.message);
    return null;
  }
}

// ===== TC概要をSheetsから取得（コンパクト版） =====

// ===== TC概要をSheetsから取得（コンパクト版） =====
function getTCOverview() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('TC概要');
    
    if (!sheet) {
      console.log('⚠️ TC概要シートが見つかりません');
      return '';
    }
    
    var data = sheet.getDataRange().getValues();
    
    // 必要な行だけ抽出（全22行を注入すると冗長すぎてGeminiが無視する）
    var keyRows = ['サービス名', 'コンセプト', '一言で言うと', '解決する課題', 
                   'ターゲット', '核心の価値', '投稿での扱い', 'URL'];
    var sections = [];
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][1]) {
        var sectionName = String(data[i][0]).trim();
        for (var k = 0; k < keyRows.length; k++) {
          if (sectionName === keyRows[k]) {
            sections.push(sectionName + ': ' + String(data[i][1]).trim());
            break;
          }
        }
      }
    }
    
    if (sections.length === 0) return '';
    
    var text = '\n\n【Trading Complete（TC）について - 投稿に自然に織り込むための参考情報】\n';
    text += sections.join('\n') + '\n';
    text += '\n【TCの主な機能（投稿内で1つだけ自然に触れろ。押し売り厳禁）】\n';
    
    // 8機能を定義
    var features = [
      'エントリー前チェックリスト: 3つの根拠（エントリー・損切り・利確）を書かないと保存できない「関所」機能',
      'リスク自動判定: 許容損失額を超えるトレードは赤警告。ロットの適正値も自動計算',
      '手法別勝率分析: どの手法が勝てているか・負けているかが一目で分かる',
      '月次カレンダー: 日別損益を緑（利益）/赤（損失）で色分け表示。勝てる曜日・負ける曜日が一目で分かる',
      '相場ノート検索: 過去のノートをキーワード検索。「去年の今頃」が瞬時に分かる',
      '期待値・PF計算: 勝率だけでなく「1トレードあたりいくら稼げるか」を自動算出',
      '経費管理・CSV出力: 確定申告用のデータが一発で出せる',
      'バッジ機能: ルール遵守・リスク判定がトレードカードにバッジとして表示される'
    ];
    
    // スクリプトプロパティで前回のインデックスを記録→順番に回す
    var props = PropertiesService.getScriptProperties();
    var lastIdx = parseInt(props.getProperty('TC_FEATURE_INDEX') || '0', 10);
    var nextIdx = (lastIdx + 1) % features.length;
    props.setProperty('TC_FEATURE_INDEX', String(nextIdx));
    
    text += '★今回はこの機能を紹介しろ → ' + features[nextIdx] + '\n';
    for (var g = 0; g < features.length; g++) {
      if (g !== nextIdx) {
        text += '・' + features[g] + '\n';
      }
    }
    text += '\n【TC導線の入れ方（自然に1箇所だけ）】\n';
    text += '・宣伝感は絶対に出さない。自分の体験→課題→TCの機能で解決、の自然な流れ\n';
    text += '・投稿の主題はあくまで市場情報や心得。TC言及は脇役として自然に添える程度\n';
    text += '・★印の機能を具体的に紹介すること（毎回違う機能になる）\n';
    text += '・OK: 「Trading Completeのリスク自動判定で、許容損失額を超えた時に警告が出る」\n';
    text += '・OK: 「手法別の勝率を分析タブで見たら、逆張りの勝率が20%台だった。封印したら収支が改善」\n';
    text += '・OK: 「月次カレンダーで赤（損失日）が並ぶ週があって、調べたら全部感情的なトレードだった」\n';
    text += '・OK: 「相場ノート検索で去年の同時期を振り返ったら、似たパターンを発見」\n';
    text += '・NG: 「記録が大事」（抽象的すぎる）\n';
    text += '・NG: 「Trading Completeで仕組み化した」（何の機能か分からない）\n';
    text += '・NG: 「ぜひ使ってください」「リンクはプロフから」（直接宣伝）\n';
    
    return text;
  } catch (e) {
    console.log('TC概要取得エラー: ' + e.message);
    return '';
  }
}

// ===== トレードスタイルをSheetsから取得 =====

// ===== トレードスタイルをSheetsから取得 =====
function getTradeStyle_() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('トレードスタイル');
    
    if (!sheet) {
      console.log('⚠️ トレードスタイルシートが見つかりません');
      return '';
    }
    
    var data = sheet.getDataRange().getValues();
    var items = [];
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][1]) {
        items.push('・' + data[i][0] + ': ' + data[i][1]);
      }
    }
    
    return '\n\n【コンパナのトレードスタイル（この視点で見解を述べること）】\n' + items.join('\n');
  } catch (e) {
    console.log('トレードスタイル取得エラー: ' + e.message);
    return '';
  }
}

// ===== 参照ソースをSheetsから取得 =====

// ===== 参照ソースをSheetsから取得 =====
function getReferenceSources_() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('参照ソース');
    
    if (!sheet) {
      console.log('⚠️ 参照ソースシートが見つかりません');
      return '';
    }
    
    var data = sheet.getDataRange().getValues();
    var items = [];
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][1]) {
        items.push('・' + data[i][0] + ' | ' + data[i][1] + '（' + (data[i][2] || '') + '）');
      }
    }
    
    var text = '\n\n【情報ソース（以下のサイトの最新情報をGoogle検索で取得すること）】\n';
    text += items.join('\n');
    
    return text;
  } catch (e) {
    console.log('参照ソース取得エラー: ' + e.message);
    return '';
  }
}

// ===== 経済カレンダーをSheetsから取得 =====
/**
 * 「経済カレンダー」シートから今日〜来週末の指標を取得
 * シート構成: A=日付, B=時間(JST), C=国/地域, D=指標名, E=前回, F=予想, G=重要度(高/中/低), H=備考
 * 
 * @param {string} scope - 'today'（今日のみ）, 'this_week'（今週）, 'next_week'（来週）, 'all'（今日〜来週末）
 * @return {string} プロンプト注入用テキスト
 */

// ===== 経済カレンダーをSheetsから取得 =====
/**
 * 「経済カレンダー」シートから今日〜来週末の指標を取得
 * シート構成: A=日付, B=時間(JST), C=国/地域, D=指標名, E=前回, F=予想, G=重要度(高/中/低), H=備考
 * 
 * @param {string} scope - 'today'（今日のみ）, 'this_week'（今週）, 'next_week'（来週）, 'all'（今日〜来週末）
 * @return {string} プロンプト注入用テキスト
 */
function getEconomicCalendar_(scope) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('経済カレンダー');
    
    if (!sheet || sheet.getLastRow() < 2) {
      console.log('⚠️ 経済カレンダーシートが空です');
      return '';
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues(); // ★v6.7: I列(結果)・J列(判定)追加
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // 今週末（日曜日）と来週末（次の日曜日）を計算
    var dayOfWeek = today.getDay(); // 0=日, 1=月, ..., 6=土
    var thisWeekEnd = new Date(today.getTime() + (7 - dayOfWeek) * 86400000);
    var nextWeekEnd = new Date(thisWeekEnd.getTime() + 7 * 86400000);
    
    // ★v5.5.3: 今週の月曜日を計算（過去の指標も取得するため）
    var mondayOffset = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek; // 日曜は前の月曜
    var thisWeekStart = new Date(today.getTime() + mondayOffset * 86400000);
    
    var todayEvents = [];
    var tomorrowHighEvents = []; // ★v7.10: 明日の重要度「高」イベント（FOMC翌日の日銀等を拾う）
    var thisWeekEvents = [];     // 今日〜今週末（従来: 未来のみ）
    var thisWeekPastEvents = []; // ★v5.5.3: 今週月曜〜昨日（過去の指標）
    var nextWeekEvents = [];
    var tomorrow = new Date(today.getTime() + 86400000); // ★v7.10: 明日の日付
    
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue; // 日付・指標名がない行はスキップ
      
      var eventDate = new Date(data[i][0]);
      var eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      
      var dateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'M/d（E）');
      // ★v6.9: B列はDate型対応（表示用フォーマット）
      var rawTimeDisp = data[i][1];
      var timeStr = '';
      if (rawTimeDisp instanceof Date) {
        var h = rawTimeDisp.getHours();
        var m = rawTimeDisp.getMinutes();
        if (h !== 0 || m !== 0) {
          timeStr = h + ':' + (m < 10 ? '0' + m : m);
        }
      } else {
        timeStr = rawTimeDisp ? String(rawTimeDisp).trim() : '';
        if (timeStr === '0:00' || timeStr === '00:00') timeStr = '';
      }
      var country = String(data[i][2] || '').trim();
      var indicator = String(data[i][3]).trim();
      var previous = String(data[i][4] || '').trim();
      var forecast = String(data[i][5] || '').trim();
      var importance = String(data[i][6] || '中').trim();
      var note = String(data[i][7] || '').trim();
      var result = String(data[i][8] || '').trim();   // ★v6.7: I列（結果）
      var judgment = String(data[i][9] || '').trim(); // ★v6.7: J列（判定）
      
      var line = dateStr;
      if (timeStr) line += ' ' + timeStr;
      line += ' [' + country + '] ' + indicator;
      if (previous) line += '（前回: ' + previous + '）';
      if (forecast) line += '（予想: ' + forecast + '）';
      if (result) line += '（結果: ' + result + '）';   // ★v6.7: 結果が入っていれば表示
      if (judgment) line += '（' + judgment + '）';    // ★v6.7: 上振れ/下振れ/一致
      if (importance === '高') line += ' ★重要';
      if (note) line += ' ※' + note;
      
      if (eventDay.getTime() === today.getTime()) {
        // ★v5.8: 投稿時刻との前後関係を判定（発表済み/未発表ラベル）
        var statusLabel = '';
        if (timeStr) {
          // ★v6.9: B列はDate型対応
          var rawTimeEC = data[i][1];
          var eventHour, eventMin;
          if (rawTimeEC instanceof Date) {
            eventHour = rawTimeEC.getHours();
            eventMin  = rawTimeEC.getMinutes();
          } else {
            var timeParts = timeStr.split(':');
            eventHour = parseInt(timeParts[0], 10);
            eventMin  = parseInt(timeParts[1] || '0', 10);
          }
          var nowHour = now.getHours();
          var nowMin = now.getMinutes();
          // ★v7.10: 深夜・早朝（0:00〜5:59）イベントの誤判定防止
          // 外為どっとコムは米国取引日をA列に使うため、FOMC 3:00等は
          // 実際にはJST翌日未明の発表。結果(I列)が空なら未発表扱い。
          if (eventHour < 6 && !result) {
            statusLabel = '【未発表】';
          } else if (nowHour > eventHour || (nowHour === eventHour && nowMin >= eventMin)) {
            statusLabel = '【発表済み】';
          } else {
            statusLabel = '【未発表】';
          }
        }
        todayEvents.push(statusLabel + line);
      } else if (eventDay >= thisWeekStart && eventDay < today) {
        // ★v5.5.3: 今週月曜〜昨日（過去の指標）
        thisWeekPastEvents.push(line);
      } else if (eventDay > today && eventDay < thisWeekEnd) {
        thisWeekEvents.push(line);
        // ★v7.10: 明日の重要度「高」イベントはtomorrowHighEventsにも追加
        if (eventDay.getTime() === tomorrow.getTime() && importance === '高') {
          tomorrowHighEvents.push('【明日】' + line);
        }
      } else if (eventDay >= thisWeekEnd && eventDay < nextWeekEnd) {
        nextWeekEvents.push(line);
      }
    }
    
    var text = '';
    
    if (scope === 'today' || scope === 'all') {
      if (todayEvents.length > 0) {
        text += '\n【今日の経済指標（この情報のみ使え）】\n';
        text += '※【発表済み】=結果について言及せよ。「これから発表」「注目」のように未来形で書くな。\n';
        text += '※【未発表】=これから発表される指標として言及してよい。\n';
        text += todayEvents.join('\n') + '\n';
      } else {
        text += '\n【今日の経済指標】なし（指標発表のない日）\n';
      }
      // ★v7.10: 明日の重要度「高」イベントも表示（日銀・FOMC翌日等を見逃さない）
      if (tomorrowHighEvents.length > 0) {
        text += '\n【明日の重要イベント（予告として触れてよい）】\n';
        text += tomorrowHighEvents.join('\n') + '\n';
        text += '※「明日」「今週○日に」と日付を明記して言及せよ。「今日」と誤記するな。\n';
      }
    }
    
    if (scope === 'this_week' || scope === 'all') {
      // ★v5.5.3: 今週の過去指標も表示（WEEKLY_REVIEW/WEEKLY_LEARNINGの振り返り用）
      if (thisWeekPastEvents.length > 0) {
        text += '\n【今週発表済みの経済指標（実際に起きたことの参照用）】\n';
        text += thisWeekPastEvents.join('\n') + '\n';
      }
      if (thisWeekEvents.length > 0) {
        text += '\n【今週の残り経済指標】\n';
        text += thisWeekEvents.join('\n') + '\n';
      }
    }
    
    if (scope === 'next_week' || scope === 'all') {
      if (nextWeekEvents.length > 0) {
        text += '\n【来週の経済指標】\n';
        text += nextWeekEvents.join('\n') + '\n';
      } else {
        text += '\n【来週の経済指標】未登録（まだ更新されていません）\n';
      }
    }
    
    // ★v5.5.3: 日曜日用 — thisWeekEventsを「来週の経済指標」として表示
    if (scope === 'this_week_as_next') {
      if (thisWeekEvents.length > 0) {
        text += '\n【来週の経済指標】\n';
        text += thisWeekEvents.join('\n') + '\n';
      } else {
        text += '\n【来週の経済指標】未登録（まだ更新されていません）\n';
      }
    }
    
    if (text) {
      text += '\n⚠️ 上記のカレンダーに記載されていない経済指標の日付・名称・数値は絶対に書くな。\n';
      text += '⚠️ カレンダーが空の場合は「注目指標なし」として、指標に触れるな。\n';
    }
    
    return text;
  } catch (e) {
    console.log('経済カレンダー取得エラー: ' + e.message);
    return '';
  }
}

// ===== 学びログをSheetsから取得 =====

// ===== 学びログをSheetsから取得 =====
function getLearningLog_(postType, maxItems) {
  try {
    // Phase 3: スコアベース選択（getLearningLogWithScoresはsheetsManager.gsに定義）
    var items = getLearningLogWithScores(null, 0);
    if (items.length === 0) return '';

    var count = maxItems || 3;
    var selected = [];
    var selectedIndices = [];

    // 70%をスコア上位から、30%をランダムから選択
    var topCount = Math.max(1, Math.ceil(count * 0.7));
    var randomCount = count - topCount;

    // スコア降順 → 同スコアなら使用回数が少ない順（新しい学びにチャンスを与える）
    var sortedByScore = items.slice().sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.usageCount - b.usageCount;
    });

    // スコア上位N件を選択
    for (var i = 0; i < Math.min(topCount, sortedByScore.length); i++) {
      selected.push(sortedByScore[i]);
      selectedIndices.push(sortedByScore[i].rowIndex);
    }

    // 残りからランダムに選択
    var remaining = [];
    for (var j = 0; j < items.length; j++) {
      if (selectedIndices.indexOf(items[j].rowIndex) === -1) {
        remaining.push(items[j]);
      }
    }

    for (var k = 0; k < Math.min(randomCount, remaining.length); k++) {
      var idx = Math.floor(Math.random() * remaining.length);
      selected.push(remaining[idx]);
      selectedIndices.push(remaining[idx].rowIndex);
      remaining.splice(idx, 1);
    }

    if (selected.length === 0) return '';

    // 選択された学びの使用回数をインクリメント（incrementLearningUsageはsheetsManager.gsに定義）
    for (var m = 0; m < selected.length; m++) {
      try {
        incrementLearningUsage(selected[m].rowIndex);
      } catch (e) { /* 使用回数更新の失敗で処理を止めない */ }
    }

    var text = '\n\n【過去の学び・気づき（引き出し）】\n';
    text += '以下はコンパナが過去の相場で実際に得た学び。今日の相場に当てはまる学びがあれば投稿に活かすこと。\n';
    text += '特に仮説を立てる際は、これらの学びを根拠に使え。\n';
    for (var n = 0; n < selected.length; n++) {
      text += '・[' + selected[n].category + '] ' + selected[n].content + '\n';
    }

    console.log('📚 学びログ注入: ✅' + selected.length + '件取得（' + postType + '）' +
                ' うちスコア上位' + Math.min(topCount, selected.length) + '件+ランダム' +
                (selected.length - Math.min(topCount, selected.length)) + '件');

    return text;
  } catch (e) {
    console.log('学びログ取得エラー: ' + e.message);
    return '';
  }
}



function buildPrompt_(postType, typeConfig, context, rates) {
  var now = new Date();
  var yearStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy');
  var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年M月d日（E）');
  var timeStr = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');
  var keys = getApiKeys(); // ★v5.4: ホットペア検出で使用
  
  // ① キャラクター定義（Sheetsから）
  var characterPrompt = getCharacterPrompt();
  
  // ★v8.6: TC言及禁止タイプではTC導線セクションを除外（不要な指示でGeminiの注意を分散させない）
  var tcProhibitedTypes = ['MORNING', 'TOKYO', 'LONDON', 'NY', 'INDICATOR', 'KNOWLEDGE'];
  if (tcProhibitedTypes.indexOf(postType) !== -1) {
    characterPrompt = characterPrompt.replace(/【TC導線】[\s\S]*?(?=【|$)/, '');
    characterPrompt = characterPrompt.replace(/【TC導線のトーン】[\s\S]*?(?=【|$)/, '');
  }
  
  var prompt = characterPrompt + '\n\n';
  
  // ①-a 日時情報
  prompt += '【現在の日時】' + dateStr + ' ' + timeStr + '（日本時間）\n';
  prompt += '【年の確認】現在は' + yearStr + '年です。' + yearStr + '年以外のデータは絶対に使うな。\n\n';
  
  // ①-b 確定レート（事前取得済み）を直接埋め込む ★v5.4: 7ペア化
  // タイプ別にレートの役割を変える
  var ruleTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4'];
  var isRuleType = ruleTypes.indexOf(postType) !== -1;
  
  if (rates) {
    if (postType === 'KNOWLEDGE') {
      prompt += '【参考: 現在のレート（テーマ選定の参考。本文にレート数値を書く必要はない）】\n';
    } else if (isRuleType || postType === 'WEEKLY_LEARNING') {
      prompt += '【参考: 現在のレート（心得・学び投稿の本文にレート数値を無理に入れる必要はない）】\n';
    } else {
      prompt += '【本日の確定レート（7ペア）】\n';
    }
    prompt += '・USD/JPY（ドル円）: ' + Number(rates.usdjpy).toFixed(2) + '円\n';
    prompt += '・EUR/USD（ユーロドル）: ' + Number(rates.eurusd).toFixed(4) + 'ドル\n';
    prompt += '・GBP/USD（ポンドドル）: ' + Number(rates.gbpusd).toFixed(4) + 'ドル\n';
    prompt += '・EUR/JPY（ユーロ円）: ' + Number(rates.eurjpy).toFixed(2) + '円\n';
    prompt += '・GBP/JPY（ポンド円）: ' + Number(rates.gbpjpy).toFixed(2) + '円\n';
    prompt += '・AUD/JPY（豪ドル円）: ' + Number(rates.audjpy).toFixed(2) + '円\n';
    prompt += '・AUD/USD（豪ドル米ドル）: ' + Number(rates.audusd).toFixed(4) + 'ドル\n';
    prompt += '・取得元: ' + rates.source + '\n';
    if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
      prompt += '※レートはチャートを見れば分かる情報。数字の羅列ではなく「なぜ今この価格なのか」の背景と心理を書け。\n';
      prompt += '※7ペアを全部並べるのはNG。1〜2ペアに絞ってストーリーを語ること。\n';
      prompt += '※数値の小数点「.」は絶対に省略するな。1.3672を13672と書くのは禁止。\n';
      prompt += '※ペアの数値を絶対に混同するな。豪ドル円の話題にドル円の数値を混ぜるのは致命的ミス。各ペアの数値は上記リストの対応する行のみ使え。\n';
      prompt += '※レート表記の桁数ルール: JPYペアは小数2桁（例: 159.24円）、USDペアは小数4桁（例: 1.1592ドル）で書け。5桁（1.15915ドル等）はAPI生値そのままでAI臭い。「〜付近」「〜台」等の自然な表現を使え。\n\n';
      
      // ★v5.6: レートの方向性を自動計算してプロンプトに注入
      var direction = calculateRateDirection_(rates, keys.SPREADSHEET_ID);
      if (direction) {
        prompt += direction;
      }
      
      
      // ★v5.7 Layer 1: 前日の経済指標結果を注入（MORNING, TOKYO）
      var indicatorResultTypes = ['MORNING', 'TOKYO'];
      if (indicatorResultTypes.indexOf(postType) !== -1) {
        try {
          var indicatorReview = fetchIndicatorResults_(keys.SPREADSHEET_ID, keys.GEMINI_API_KEY);
          if (indicatorReview) {
            prompt += indicatorReview;
          }
        } catch (irErr) {
          console.log('⚠️ 指標結果注入スキップ: ' + irErr.message);
        }
      }
      
      // ★v6.7: 今日の発表済み指標取得は定期トリガー(refreshTodayIndicatorResults)に移動
      // buildPrompt_からの呼び出しは削除。scheduler.gsで9:05/10:35/14:05/21:35/22:05に実行。
      
      // ★v5.7 Layer 3: 直近1ヶ月の指標トレンド注入（MORNINGのみ）
      // ★v5.9: WEEKLY_REVIEWは今週サマリーで代替するため除外（プロンプト削減）
      if (postType === 'MORNING') {
        try {
          var indicatorTrend = formatIndicatorTrend_(keys.SPREADSHEET_ID);
          if (indicatorTrend) {
            prompt += indicatorTrend;
          }
        } catch (tErr) {
          console.log('⚠️ 指標トレンド注入スキップ: ' + tErr.message);
        }
      }
      
    } else {
      prompt += '\n';
    }
    
    // ①-b1.5 ホットペア情報注入 ★v5.4 Phase 6.5
    if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
      var hotPairResult = detectHotPair_(rates, keys.SPREADSHEET_ID);
      if (hotPairResult) {
        prompt += hotPairResult.text;
      }
    }
  } else {
    // ★v5.9.1: レートキャッシュに直近データがあれば、そこから注入
    var cacheRateText = getLatestRateText_(keys.SPREADSHEET_ID);
    if (cacheRateText) {
      prompt += '⚠️リアルタイムAPI未接続。以下はレートキャッシュの直近値です。\n';
      prompt += cacheRateText + '\n';
      prompt += '※ この値を基準に投稿を書け。勝手に丸めたり別の数値を使うな。\n\n';
    } else {
      prompt += '⚠️レート取得に完全に失敗しています。具体的な数値は使わず「上昇」「下落」等で表現すること。\n\n';
    }
  }
  

  // ①-b2 意識される価格帯（レートサマリーから読み取り）※KNOWLEDGE・RULE系・WEEKLY_LEARNINGには不要
  if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
    var priceAnalysis = analyzePriceHistory_(rates);
    if (priceAnalysis) {
      prompt += priceAnalysis;
    }
  }
  
  // ①-b3 市場環境データ（★v5.5.3: 株価指数・金利・VIX・ゴールド）
  // KNOWLEDGE・RULE系・WEEKLY_LEARNINGには不要
  if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
    var indicators = getLatestIndicators_(keys.SPREADSHEET_ID);
    if (indicators) {
      prompt += '【市場環境データ（Twelve Data API取得・正確な値。投稿で使用してよい）】\n';
      for (var mi = 0; mi < MARKET_INDICATORS.length; mi++) {
        var ind = MARKET_INDICATORS[mi];
        var val = indicators[ind.key];
        if (val !== null && val !== undefined) {
          var formatted = val.toFixed(ind.decimals);
          // 日経・ダウなど大きい数字はカンマ区切り
          if (ind.decimals === 0 && val >= 1000) {
            formatted = Number(formatted).toLocaleString();
          }
          prompt += '・' + ind.label + ': ' + formatted + ind.unit + '\n';
        }
      }
      prompt += '※GOOGLEFINANCE自動更新（15〜20分遅延あり）\n';
      prompt += '※Gemini Groundingで得た株価指数・金利の数値は使うな。上記の数値のみ使え。\n';
      prompt += '※株価指数は背景・クロスマーケット分析として触れるのはOK。ただし主役はFX。\n\n';
    }

    // ★v8.5: 政策金利はconfig.gsのPOLICY_RATESから一元取得（3箇所共通化）
    prompt += '【主要中銀の政策金利（現在値・正確）】\n';
    prompt += getPolicyRatesText_();
    prompt += '※「日銀のハト派姿勢」「日銀の緩和政策」は過去の話。現在は利上げ路線。間違えるな。\n';
    prompt += '※ 上記と矛盾する金融政策スタンスを書くな（例: 日銀がハト派、FRBが利上げ中 等は誤り）。\n\n';

    // ★v6.5更新: 商品データ注入（WTI・天然ガス=日次キャッシュ、BTC=30分キャッシュ）
    var dailyForPrompt = fetchDailyCommodityPrices_();
    var btcForPrompt   = fetchCommodityPrices_();
    var commoditiesForPrompt = {
      wti:    dailyForPrompt ? dailyForPrompt.wti    : null,
      btc:    btcForPrompt   ? btcForPrompt.btc      : null,
      gold:   btcForPrompt   ? btcForPrompt.gold     : null,
      natgas: dailyForPrompt ? dailyForPrompt.natgas : null
    };
    var hasComData = COMMODITY_ASSETS.some(function(a) { return commoditiesForPrompt[a.key] !== null; });
    if (hasComData) {
      prompt += '【商品データ】\n';
      for (var ci = 0; ci < COMMODITY_ASSETS.length; ci++) {
        var ca = COMMODITY_ASSETS[ci];
        var cv = commoditiesForPrompt[ca.key];
        if (cv !== null && cv !== undefined) {
          prompt += '・' + ca.label + ': ' + cv.toFixed(ca.decimals) + ca.unit + '\n';
        }
      }
      prompt += '※上記は直近1時間以内のAPIデータ（基準値）。Groundingで最新値も検索して確認し、大きくズレていれば最新値を優先せよ。\n';
      prompt += '※使い方: FX値動きの背景・理由説明に使え。商品価格自体を投稿の主役にするな。\n';
      prompt += '※OK: 「原油安を背景に豪ドルが軟調」 NG: 「WTIが85ドル台で推移」を冒頭に持ってくる\n\n';
    }
  }
  
  // ①-b4 市場ニュースTOP5（★v5.5 Phase 7: ニュース取得レイヤー）
  // ★v5.5.3: RULE系・WEEKLY_LEARNINGには注入しない（心得・学びが主題であるべき）
  var noNewsTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'WEEKLY_LEARNING'];
  var skipNews = noNewsTypes.indexOf(postType) !== -1;
  if (!skipNews) {
    var marketNews = fetchMarketNews_(keys);
    if (marketNews) {
      prompt += marketNews;
    }
  }
  
  // ①-c 参照ソース（市況やニュースの取得先）※RULE系には不要
  if (!isRuleType) {
    var refSources = getReferenceSources_();
    if (refSources) {
      prompt += refSources;
    }
  }
  
  // ①-d 経済カレンダー（シートから正確なデータを注入）※RULE系・KNOWLEDGEには不要
  // ★v5.5.3: WEEKLY_LEARNINGには「参考用」として今週カレンダーを注入（架空イベント創作防止）
  if (!isRuleType && postType !== 'KNOWLEDGE') {
    var calScope = 'today'; // デフォルト: 今日のみ
    
    // タイプ別にスコープを変える
    var dailyTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY'];
    if (dailyTypes.indexOf(postType) !== -1) {
      calScope = 'today';
    } else if (postType === 'INDICATOR') {
      calScope = 'today';
    } else if (postType === 'NEXT_WEEK' || postType === 'WEEKLY_HYPOTHESIS') {
      // ★v5.5.3修正: 日曜日は「来週」= 明日からの月〜金（thisWeekEvents）
      var todayDow = new Date().getDay();
      calScope = (todayDow === 0) ? 'this_week_as_next' : 'next_week';
    } else if (postType === 'WEEKLY_REVIEW') {
      calScope = null; // ★v5.9: カレンダー不要（formatWeeklyIndicatorSummary_で代替）
    } else if (postType === 'WEEKLY_LEARNING') {
      calScope = 'this_week';
    }
    // ★v5.9: WEEKLY_REVIEWはカレンダー不要（formatWeeklyIndicatorSummary_で代替）
    
    var calendar = calScope ? getEconomicCalendar_(calScope) : null;
    if (calendar) {
      prompt += calendar;
    }
  }
  
  prompt += '【投稿タイプ（※この名前は指示用。本文には絶対に書くな）】' + typeConfig.label + '\n\n';
  
  // ② 投稿プロンプト（Sheetsから）
  var postPrompt = getPostPrompt_(postType);
  if (postPrompt) {
    prompt += postPrompt.prompt + '\n';
  } else {
    prompt += '最新のFX市場情報を元に、このタイプに合った投稿を作成してください。\n';
  }
  
  // ②-b トレードスタイル（全投稿に注入: 見解の一貫性を保つ）
  var tradeStyle = getTradeStyle_();
  if (tradeStyle) {
    prompt += tradeStyle;
  }
  
  // ②-c 市場系投稿の方針（buildFormatRules_と重複しない項目のみ）
  var marketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR'];
  if (marketTypes.indexOf(postType) !== -1) {
    prompt += '\n【市場系投稿の方針（最重要）】\n';
    prompt += '■ 指標に言及する場合は時刻を含めて正確に。【今日の経済指標】の時刻を使え。\n';
    prompt += '■ 【最重要】レートの事実とニュース解釈を一致させろ。矛盾したらレート優先。\n';
    prompt += '■ 【通貨の動きとの整合】売られている通貨を「買い」、買われている通貨を「売り」と書くのは絶対禁止。データが事実。\n';
    prompt += '\n【経済イベント・指標の日付確認ルール（最重要）】\n';
    prompt += '・「〜が控えています」「〜の発表があります」と書く場合、必ず【経済カレンダー】で今日の日付を確認せよ。\n';
    prompt += '・今日の日付に載っていないイベントを「今日控えている」「東京時間中に発表」と書くな。\n';
    prompt += '・NG例: 今日が3月17日なのに「日銀会合が控えています」（日銀会合は3月19日）\n';
    prompt += '・OK例: 「今日12:30にRBA政策金利発表が予定されています」（カレンダーに今日の日付で記載あり）\n';
    prompt += '・今週の指標に触れたい場合は「今週19日に日銀会合が予定されています」と日付を明記せよ。\n';
  }
  
  // ②-c1.5 MORNING共通: 東京市場オープン前の認識 ★v5.6追加
  if (postType === 'MORNING') {
    prompt += '\n【MORNING投稿の時間帯と役割（重要 - 全曜日共通）】\n';
    prompt += '■ この投稿は朝7:30〜8:00頃の配信。東京市場（9:00）オープンの約1時間前。\n';
    prompt += '■ 読者はこの投稿を見て「今日の東京オープンに向けた準備」をする。\n';
    prompt += '■ 昨夜（日本時間深夜〜早朝）のNY市場・欧州市場での動きは「読者がまだ消化しきれていない情報」として扱え。\n';
    prompt += '  → 読者は夜中のニュースを把握していない可能性が高い。昨夜起きたことをおさらいしてあげるイメージ。\n';
    prompt += '■ 構成の基本フレーム:【昨夜のNY市場おさらい】→【なぜそう動いたか】→【今日の東京で注目するポイント】\n';
    prompt += '  → OK: 「昨夜NYでドル円が一段安。CPIの結果を受けて利下げ観測が再燃した形。東京勢がこの流れを引き継ぐかが今日の焦点」\n';
    prompt += '  → OK: 「昨夜の原油急落を受けて、今日は資源国通貨の動向に注目」\n';
    prompt += '  → NG: 「今まさに〜が起きている」「現在の市場では〜」（NY市場は既に閉まっている）\n';
    prompt += '■ 今日の経済指標発表がある場合は必ず触れ「結果次第でどう動くか」を示せ。\n';
    prompt += '■ 断定的な見通しは避け「〜が焦点」「〜を見極める展開か」など余地を残す表現にせよ。\n';
    prompt += '■ 【通貨ペア混同禁止】同じ段落・同じ→で異なる通貨ペアのレートを混ぜるな。\n';
    prompt += '  → AUD/USDの話をしていたら最後までAUD/USDで統一。AUD/JPYに切り替えるなら段落を分けよ。\n';
  }
  
  // ②-c1.6 TOKYO共通: 東京市場序盤の認識（全曜日共通） ★v6.6追加
  if (postType === 'TOKYO') {
    prompt += '\n【TOKYO投稿の時間帯と役割（重要 - 全曜日共通）】\n';
    prompt += '■ この投稿は朝9:11〜9:43頃の配信。東京市場（9:00）オープン後10〜40分が経過した頃。\n';
    prompt += '■ 読者は「東京がどう動き出したか」を知りたがっている。「予想」ではなく「観察」を伝えろ。\n';
    prompt += '■ 8:50に日本の経済指標（企業物価指数・貿易統計・機械受注等）が発表された場合:\n';
    prompt += '  → 【前日の経済指標結果】に記載があれば、それが東京オープンの値動きに影響しているはずだ。\n';
    prompt += '  → 「8:50の○○指標が△△（予想比上振れ/下振れ）→ 円買い/円売り優勢」という流れで構成せよ。\n';
    prompt += '■ 構成の基本フレーム:【東京オープン序盤の値動き（事実）】→【なぜそう動いたか（背景）】→【午前中の注目ポイント】\n';
    prompt += '  → OK: 「東京オープン後、ドル円は154円台後半で小動き。8:50の企業物価指数が予想を下回り、円買いが若干優勢な展開」\n';
    prompt += '  → OK: 「MORNINGで警戒していたNY安の流れを東京も引き継ぎ、オープン直後から売り圧力」\n';
    prompt += '  → NG: 「〜が予想される」「〜だろう」（東京は既に動いている。現在の値動きを伝えろ）\n';
    prompt += '■ MORNINGで提示した「今日の焦点」と対比させると読者に継続性が生まれる。\n';
    prompt += '■ 【通貨ペア混同禁止】同じ→（矢印）の前後で異なる通貨ペアのレートを引用するな。\n';
    prompt += '  → NG: 「豪ドル米ドルの高値は要確認。→1990年9月以来の113円台」（USD建てとJPY建ての混同）\n';
    prompt += '  → OK: 「豪ドル円は先週113.96円をつけた。」「豪ドル米ドルは0.70ドル台で推移。」と分けて書け。\n';
  }
  
  // ②-c2 月曜日コンテキスト（市場系全投稿共通）★v5.6追加
  var todayDayOfWeek = now.getDay(); // 0=日, 1=月, ..., 6=土
  var mondayMarketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR'];
  if (todayDayOfWeek === 1 && mondayMarketTypes.indexOf(postType) !== -1) {
    prompt += '\n【月曜日の投稿方針（最重要 - 本日は週明け。全市場系投稿で厳守）】\n';
    prompt += '■ 今日は月曜日。土日は為替市場が閉まっていた。\n';
    prompt += '■ 「昨日」「昨夜」は絶対禁止（昨日＝日曜で市場は閉まっている）。\n';
    prompt += '  → NG: 「昨日のNY市場では〜」「昨夜のNYで〜」「昨日の流れを引き継ぎ〜」\n';
    prompt += '  → OK: 「先週金曜のNY市場では〜」「金曜NYの流れを引き継ぎ〜」「週末を挟んで〜」\n';
    prompt += '■ 週末の世界情勢を踏まえる:\n';
    prompt += '  → 📰ニュースTOP5で拾った週末の要人発言・地政学ニュース・政策発表を題材にする。\n';
    prompt += '  → 市場が閉まっている間に世界で何が起きたか、が月曜の最大の関心事。\n';
    
    // MORNING固有の追加指示
    if (postType === 'MORNING') {
      prompt += '■ 【MORNING固有】窓開け（ギャップ）を中心に構成:\n';
      prompt += '  → 金曜NYの終値と月曜早朝のレートを比較し、窓の大きさと方向を伝える。\n';
      prompt += '  → 窓が大きい場合:「週末に何が起きたか」→「窓は埋まるか、このまま走るか」の分析。\n';
      prompt += '  → 窓が小さい場合:「週末は大きなサプライズなし」→「金曜の流れを引き継ぐか」の分析。\n';
      prompt += '  → 「東京市場がこのニュースにどう反応するか」が読者の最大の関心事。\n';
      prompt += '■ 先週のWEEKLY_HYPOTHESISの仮説との対比があれば触れてよい。\n';
    }
    
    // TOKYO固有の追加指示
    if (postType === 'TOKYO') {
      prompt += '■ 【TOKYO固有】月曜の東京オープンの特殊性:\n';
      prompt += '  → 週末のニュースに対する東京市場の最初の本格的反応。\n';
      prompt += '  → 窓埋め（ギャップフィル）が起きているか、窓方向にさらに走っているか。\n';
      prompt += '  → 「金曜NYの流れ」ではなく「週末を挟んだ変化」に対する東京の反応として書く。\n';
    }
    
    // LUNCH固有の追加指示
    if (postType === 'LUNCH') {
      prompt += '■ 【LUNCH固有】月曜午前の振り返り:\n';
      prompt += '  → 「週明けの東京市場がどう反応したか」の振り返りが自然な切り口。\n';
      prompt += '  → 窓埋め完了/未完了、週末ニュースへの織り込み具合を整理する。\n';
    }
    
    // LONDON以降は「昨日」禁止だけで十分（午後〜夜は市場が動いているため）
  }
  
  // ②-d KNOWLEDGE投稿の方針（「1分でわかる！」スタイル）
  if (postType === 'KNOWLEDGE') {
    prompt += '\n【KNOWLEDGE投稿の方針（最重要 - 必ず守れ）】\n';
    prompt += '■ この投稿は「難しい金融を楽しくかみ砕く」投稿。教科書ではない。\n';
    prompt += '■ 読者が「へぇ！」「そういうことか！」と思える例え話やトリビアを必ず入れる。\n';
    prompt += '■ 上の確定レートは「今日何が注目されているか」を判断するためだけに使え。\n';
    prompt += '■ 冒頭にレートの数字を書くな。「ドル円は152円」から始めるのは禁止。\n';
    prompt += '■ 内容のヒント（構造は共通のノート形式に従え）:\n';
    prompt += '  ・問いかけ→例え話→過去エピソード→実感、の流れが効果的。\n';
    prompt += '  ・ただし各トピックは必ず「絵文字+事実→分析」のブロック形式で書くこと。\n';
    prompt += '■ 冒頭の例:\n';
    prompt += '  OK: 「CPIって何？→物価の体温計みたいなもの。熱が高い（インフレ）と利下げが遠のく」\n';
    prompt += '  OK: 「FOMCって聞くけど、実際に何が決まる？→世界の株価と為替の心臓部みたいな会議」\n';
    prompt += '  NG: 「スプレッドとは、FX取引における買値と売値の差のことで…」（教科書的で退屈）\n';
  }
  
  // ★v5.7 Layer 2: INDICATOR投稿に過去の指標実績を注入
  if (postType === 'INDICATOR') {
    try {
      var indicatorPreview = formatIndicatorPreview_(keys.SPREADSHEET_ID);
      if (indicatorPreview) {
        prompt += indicatorPreview;
      }
    } catch (pErr) {
      console.log('⚠️ 指標予習注入スキップ: ' + pErr.message);
    }
  }
  
  // ②-e INDICATOR投稿の方針（かみ砕き重視）
  if (postType === 'INDICATOR') {
    prompt += '\n【INDICATOR投稿の方針】\n';
    prompt += '■ 上の【今日の経済指標】に記載された指標のみ解説せよ。記載がない指標を勝手に書くな。\n';
    prompt += '■ 【今日の経済指標】が「なし」の場合:\n';
    prompt += '  → 架空の指標発表を書くのは致命的な誤情報。「あと○分でCPI発表」等は絶対禁止。\n';
    prompt += '  → 代わりに【通貨強弱データ】と【📰市場ニュース】を活用して、今日の値動きの解説に切り替えろ。\n';
    prompt += '  → または、来週の注目指標の予告に切り替えよ。\n';
    prompt += '■ 指標の「予想値と前回値」だけでなく、「なぜ重要か」「結果がどう影響するか」をかみ砕く。\n';
    prompt += '■ 具体的な数値（前回値・予想値）は【今日の経済指標】に記載されたものだけ使え。記載がない数値を捏造するな。\n';
    prompt += '■ 因果関係を明示する: 「CPIが高い＝物価上昇＝利下げ遠のく＝ドル買われやすい」\n';
    prompt += '■ 大衆心理を描写: 「みんなが今どう身構えているか」を人間味ある言葉で。\n';
    prompt += '■ OK: 「市場は上振れにビクビク。もし3%超えたら…という恐怖が漂っている」\n';
    prompt += '■ NG: 「上振れの場合、ドル円は156円を目指す展開も想定されます」（無機質すぎ）\n';
    prompt += '■ NG: 「あと15分でCPI発表」（カレンダーに記載がない指標＝捏造）\n';
    prompt += '■ 「あと○分で発表」「まもなく発表」等の残り時間表現は禁止。承認までのタイムロスで不正確になるため。\n';
    prompt += '■ OK: 「本日9:30に豪州CPIが発表されます」（時刻指定）\n';
    prompt += '■ NG: 「あと24分で豪州CPI発表」（残り時間指定）\n';
  }
  
  
  // ★v5.7 Layer 3: WEEKLY_REVIEW/WEEKLY_LEARNINGに今週の指標結果サマリーを注入
  if (postType === 'WEEKLY_REVIEW' || postType === 'WEEKLY_LEARNING') {
    try {
      var weeklySummary = formatWeeklyIndicatorSummary_(keys.SPREADSHEET_ID);
      if (weeklySummary) {
        prompt += weeklySummary;
      }
    } catch (wsErr) {
      console.log('⚠️ 週次サマリー注入スキップ: ' + wsErr.message);
    }
  }

  // ★v5.10: WEEKLY_REVIEWに週間レートトレンドを注入（論理矛盾防止）
  // 日次レートOHLCから曜日ごとの動きを集計し、方向性を事実として渡す
  if (postType === 'WEEKLY_REVIEW') {
    try {
      var weeklyTrend = formatWeeklyRateTrend_(keys.SPREADSHEET_ID, rates);
      if (weeklyTrend) {
        prompt += weeklyTrend;
        console.log('📊 週間レートトレンド注入済み（日次OHLC版）');
      }
    } catch (wtErr) {
      console.log('⚠️ 週間トレンド注入スキップ: ' + wtErr.message);
    }
  }
  
  // ②-f 週末系投稿の方針（大衆心理・ストーリー重視）
  var weekendTypes = ['WEEKLY_REVIEW', 'WEEKLY_LEARNING', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
  if (weekendTypes.indexOf(postType) !== -1) {
    prompt += '\n【週末系投稿の方針】\n';
    prompt += '■ レートの羅列は禁止。「今週はこういうドラマがあった」とストーリーで語る。\n';
    prompt += '■ 大衆心理を必ず描写: 「今週、市場参加者はどんな気持ちだったか？」\n';
    prompt += '■ 例: 「今週は完全に指標待ちの一週間。みんな手を出したいけど出せない、そんなモヤモヤが漂っていた」\n';
    prompt += '■ 「」の個人見解はトレード判断ではなく、相場観や感想で。\n';
    prompt += '■ OK: 「嵐の前の静けさ。来週のCPIが号砲になるかもしれない」\n';
    prompt += '■ NG: 「今週は方向感が出にくい相場でした」（感想が薄い）\n';
  }
  
  // ②-f2 来週展望系（NEXT_WEEK, WEEKLY_HYPOTHESIS）: カレンダー厳守
  if (postType === 'NEXT_WEEK' || postType === 'WEEKLY_HYPOTHESIS') {
    prompt += '\n【来週の指標に関する厳守事項】\n';
    prompt += '■ 上の【来週の経済指標】に記載された指標のみ言及せよ。\n';
    prompt += '■ 記載がない指標の日付・名称を勝手に作るな。これは誤情報であり信頼を失う致命的ミス。\n';
    prompt += '■ 指標の日付を並べ替えるな。カレンダーに「3/2 ISM」とあれば「3/2」と書け。勝手に3/4等に変更するのは誤情報。\n';
    prompt += '■ 発表時刻を勝手に付けるな。カレンダーに時刻がない場合は時刻を書くな。「00:00」等を捏造するな。\n';
    prompt += '■ カレンダーが「未登録」の場合は、具体的な指標名・日付に触れず「来週も経済指標が控えている」程度に留めよ。\n';
    prompt += '■ OK: 「来週は○/○に△△が発表予定」（カレンダーに記載あり）\n';
    prompt += '■ NG: 「2/27に米耐久財受注が〜」（カレンダーに記載なし＝捏造）\n';
    prompt += '■ NG: 「3/4 00:00 ISM」（カレンダーでは3/2＝日付の勝手な変更）\n';
  }

  // ②-f3 WEEKLY_LEARNING: 架空イベント創作禁止 ★v5.5.3
  if (postType === 'WEEKLY_LEARNING') {
    prompt += '\n【WEEKLY_LEARNING 厳守事項】\n';
    prompt += '■ 今週実際に起きたことだけを書け。架空の市場イベントを創作するな。\n';
    prompt += '■ 上の【今週発表済みの経済指標】に記載がない指標を「発表された」と書くのは捏造。絶対禁止。\n';
    prompt += '■ 要人発言（パウエル議長、ラガルド総裁等）もカレンダーに記載があるものだけ。架空の「議会証言」「声明」は捏造。\n';
    prompt += '■ 具体的な指標名・日付・要人名を書く場合は、必ずカレンダーに記載があるものだけ。\n';
    prompt += '■ 不確かなら指標名・要人名を書くな。「今週は値動きが激しかった」等の体感ベースで書け。\n';
    prompt += '■ 主題は「学び・気づき」。市場レポートではない。心理面・トレード判断の反省に集中しろ。\n';
    prompt += '■ OK: 「今週、急な値動きに焦って損切りが遅れた」（体験ベース）\n';
    prompt += '■ OK: 「PPIの結果を見て、自分のルール通り静観できた」（カレンダーにある指標）\n';
    prompt += '■ NG: 「金曜の雇用統計でドル円が急落した」（カレンダーにない指標＝捏造）\n';
    prompt += '■ NG: 「パウエル議長の議会証言で〜」（カレンダーにない要人発言＝捏造）\n';
    prompt += '\n【今週の失敗談・ミスを架空で創作するな（最重要）】\n';
    prompt += '■ コンパナは7年のFX経験者。「今週〇〇というミスをした」を架空で作るのは人格を傷つける。絶対禁止。\n';
    prompt += '■ 決めつけエントリー・損切りしない・感情的なトレード等の初歩的ミスを「今週やった」と書くな。\n';
    prompt += '■ 今週の失敗談を書く場合は、必ず事実ベース（「損切りが少し遅れた」等の軽微なもの）に限れ。\n';
    prompt += '■ 過去の教訓として語るのはOK: 「昔、FOMCで決めつけエントリーして痛い目を見たことがある」\n';
    prompt += '■ NG: 「今週のFOMCで決めつけでショートエントリーした」（架空の失敗談＝捏造）\n';
    prompt += '■ 今週の出来事として語れるのは「相場の動き」「指標の結果」「相場を見て感じたこと」のみ。\n';
    prompt += '■ トレードの失敗談は過去形・体験談として語れ。今週のことのように架空で語るな。\n';
    prompt += '■ 「しっかり損切りできた」「ルールを守れた」等のポジティブな今週の出来事はOK。\n';
  }

  // ②-g RULE系投稿の方針（心得・教訓が主体）★v5.5 ★v8.6: ニュース参照指示を削除（データ未注入との矛盾解消）
  if (isRuleType) {
    prompt += '\n【RULE系投稿の方針（厳守）】\n';
    prompt += '■ この投稿は「トレーダーの心得・教訓」投稿。市場速報ではない。\n';
    prompt += '■ テーマに沿った教訓・経験談・心構えが主体。\n';
    prompt += '■ 架空のニュース・要人発言・経済指標は絶対に書くな。\n';
    prompt += '\n【根拠のない数値・事実の禁止（RULE系最重要）】\n';
    prompt += '■ 具体的な金利水準・レート値・経済指標の数値を書くな。\n';
    prompt += '  NG: 「2年債利回りは5%付近で膠着」「ドル円が158円台で推移」\n';
    prompt += '  OK: 「長期金利が上昇傾向にある」「ドル円が節目付近で動きにくい展開」\n';
    prompt += '■ 海外の研究データ・統計・論文の数値（例:「判断力が30%落ちる」）も根拠が確認できないため使うな。\n';
    prompt += '■ 体験談は「コンパナ自身の経験」として書け。客観的な統計・研究を装うな。\n';
    prompt += '  NG: 「研究によると疲労時の判断力は30%低下する」\n';
    prompt += '  OK: 「疲れてる時ほど謎エントリーしてしまう。自分の経験上これは本当」\n';
  }

  // ②-h RULE_3専用: 投稿構造の明示（実践テクニック）v2
  if (postType === 'RULE_3') {
    prompt += '\n【RULE_3 投稿の構造（絵文字ブロック形式で書け）】\n';
    prompt += '通常のフォーマット（絵文字行 + →行 + 補足）を守りながら、以下の流れで3ブロック構成にしろ。\n';
    prompt += '\n';
    prompt += 'ブロック1（☕または✅）: 実用性を示すフック\n';
    prompt += '  絵文字行: 「これ知ってるだけで負けが減る」「地味だけど効果絶大」等の実用性ある1行\n';
    prompt += '  →行: テクニックの概要と、いつ使うかを「〇〇な時は〇〇する」の形で語る\n';
    prompt += '\n';
    prompt += 'ブロック2（📝または💡）: 本質（なぜそうするのか）\n';
    prompt += '  絵文字行: テクニックの核心を短く1行\n';
    prompt += '  →行: 「なぜそうするのか」の根拠・理由。やり方の説明ではなく根本を語る\n';
    prompt += '  補足行: 補足や実感があれば→なしで1行続ける\n';
    prompt += '\n';
    prompt += 'ブロック3（📕または📋）: 具体例（体験談）\n';
    prompt += '  絵文字行: 過去の体験談の場面を1行\n';
    prompt += '  →行: これで助かった / これを知らずに損した経験を実感ある言葉で\n';
    prompt += '\n';
    prompt += '締め: 絵文字・→なし。気づきや変化を1〜2行で。「〇〇で変わった」「〇〇だと気づいた」トーン\n';
    prompt += '\n【RULE_3 TC導線（自然に入る場合のみ）】\n';
    prompt += '・テーマが「過去検証」「勝率分析」「データ可視化」に関連する時だけ触れてよい\n';
    prompt += '・OK例: 「手法別の勝率を可視化してみたら、得意だと思ってた手法が実は一番負けてた」\n';
    prompt += '・NG例: 「Trading Completeの分析タブを使いましょう」（宣伝文句は絶対NG）\n';
  }

  // ③ RULE系: テーマシート連動（既存のgetNextTheme処理を維持）
  if (postType.indexOf('RULE') === 0) {
    var categoryMap = {
      'RULE_1': '知識・原則',
      'RULE_2': '習慣・メンタル',
      'RULE_3': '実践テクニック',
      'RULE_4': '失敗談・本音'
    };
    var category = categoryMap[postType];
    if (category) {
      var theme = getNextTheme(category);
      if (theme) {
        prompt += '\nテーマ: ' + theme.theme + '\n';
        prompt += 'キーメッセージ: ' + theme.keyMessage + '\n';
        
        if (theme.tcPattern && theme.tcPattern !== 'なし' &&
            ['RULE_1', 'RULE_3', 'WEEKLY_REVIEW'].indexOf(postType) !== -1) {
          prompt += '\n【Trading Complete導線（※以下は構成の指針。このテキストをそのまま本文に含めるな）】\n';
          switch (theme.tcPattern) {
            case '課題提起型':
              prompt += '構成の流れ:「記録が大事」→「でも面倒」→「だからツールで仕組み化」\n';
              prompt += '最後にさりげなく「自分はツールを作って解決した」と触れる程度でOK\n';
              prompt += '※上記の矢印付きフローをそのまま本文に書くな。自然な文章で表現しろ。\n';
              break;
            case '開発ストーリー型':
              prompt += '構成の流れ: 自分の体験談 →「Excelで挫折」→「自分でツールを作った」\n';
              prompt += '開発者としての本音を出す。宣伝感は出さない\n';
              prompt += '※上記の矢印付きフローをそのまま本文に書くな。自然な文章で表現しろ。\n';
              break;
            case 'データ型':
              prompt += '構成の流れ: 具体的な数字 →「記録を振り返ったら発見があった」\n';
              prompt += 'データの力を実感したエピソードを入れる\n';
              prompt += '※上記の矢印付きフローをそのまま本文に書くな。自然な文章で表現しろ。\n';
              break;
          }
          prompt += '\n';
        }
      }
    }
  }
  
  // ④ TC概要（TC導線がある投稿タイプのみ）★v5.4で拡張
  //    週末: RULE_1〜4, WEEKLY_REVIEW, WEEKLY_LEARNING, WEEKLY_HYPOTHESIS（従来通り＋拡張）
  //    平日: GOLDEN, LUNCH（AI自律判断で週1〜2回）
  var tcTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'WEEKLY_REVIEW', 'WEEKLY_LEARNING', 'WEEKLY_HYPOTHESIS', 'GOLDEN', 'LUNCH'];
  if (tcTypes.indexOf(postType) !== -1) {
    var tcOverview = getTCOverview();
    if (tcOverview) {
      prompt += tcOverview;
    }
  }
  
  // Phase 4: 品質フィードバック注入（データ5件以上ある場合のみ）
  var qualityFeedback = getQualityFeedback_(postType);
  if (qualityFeedback) {
    prompt += qualityFeedback;
  }

  // Phase 2: WEEKLY_HYPOTHESIS生成時に、過去の仮説的中率サマリーを注入
  if (postType === 'WEEKLY_HYPOTHESIS') {
    var verifSummary = getHypothesisVerificationSummary_();
    if (verifSummary) {
      prompt += verifSummary;
    }
  }

  // ★v5.10: WEEKLY_HYPOTHESISに今週のレートトレンドを注入（仮説の根拠強化）
  // 今週の実際の動き（日次OHLC）を渡すことで、事実ベースの来週予測が可能になる
  if (postType === 'WEEKLY_HYPOTHESIS') {
    try {
      var hypoTrend = formatWeeklyRateTrend_(keys.SPREADSHEET_ID, rates);
      if (hypoTrend) {
        // WEEKLY_HYPOTHESIS用に見出しを差し替えて注入
        hypoTrend = hypoTrend.replace(
          '【今週の主要ペア週間トレンド（事実データ。通貨の方向性を正確に反映せよ）】',
          '【今週の主要ペア週間トレンド（来週の仮説を立てる際の根拠データとして使え）】'
        );
        prompt += hypoTrend;
        console.log('📊 週間レートトレンド注入済み（WEEKLY_HYPOTHESIS）');
      }
    } catch (htErr) {
      console.log('⚠️ WEEKLY_HYPOTHESIS週間トレンド注入スキップ: ' + htErr.message);
    }
  }

  // ④-b 学びログ（過去の引き出しを注入）★v5.5: 全タイプに拡張
  var learningMaxMap = {
    'MORNING': 2, 'TOKYO': 1, 'LUNCH': 1, 'LONDON': 1, 'GOLDEN': 2, 'NY': 1,
    'INDICATOR': 1, 'NEXT_WEEK': 2,
    'WEEKLY_REVIEW': 3, 'WEEKLY_LEARNING': 5, 'WEEKLY_HYPOTHESIS': 3,
    'RULE_1': 3, 'RULE_2': 3, 'RULE_3': 3, 'RULE_4': 3,
    'KNOWLEDGE': 3
  };
  var maxLearnings = learningMaxMap[postType];
  if (maxLearnings) {
    var learningLog = getLearningLog_(postType, maxLearnings);
    if (learningLog) {
      prompt += learningLog;
    }
  }
  
  // ⑤ フォーマットルール（投稿タイプ別文字数を反映）
  prompt += buildFormatRules_(typeConfig.charMin, typeConfig.charMax, postType);
  
  // ⑥ コンテキスト（仮説・学びを投稿履歴シート＋レートキャッシュから自動取得）
  // 仮説は市場系・週末系のみ注入（RULE系・KNOWLEDGEには不要）
  var hypothesisTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY',
                         'WEEKLY_REVIEW', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
  var needsHypothesis = hypothesisTypes.indexOf(postType) !== -1;
  
  var historyContext = getHypothesisContext_(rates);
  
  // 仮説の振り返り（レートキャッシュの数値差分ベース）
  if (needsHypothesis && historyContext && historyContext.hypothesisBlock) {
    prompt += historyContext.hypothesisBlock;
  } else if (needsHypothesis && context && context.lastHypothesis) {
    // フォールバック: 外部contextから
    prompt += '\n【前回の仮説（参考情報）】\n' + context.lastHypothesis + '\n';
    prompt += '→ 1文で軽く触れてよい。「不発」「成功」等の評価語は使うな。\n';
  }
  
  // 学び
  if (historyContext && historyContext.learning) {
    prompt += '\n【最近の学び（参考情報）】\n' + historyContext.learning + '\n';
    prompt += '→ この学びの内容を自然に織り込んでもよい。\n';
  } else if (context && context.lastLearning) {
    prompt += '\n【最近の学び（参考情報）】\n' + context.lastLearning + '\n';
    prompt += '→ この学びの内容を自然に織り込んでもよい。\n';
  }
  
  // ★v5.9.3: プロンプト文字数測定（デバッグ用）
  console.log('📏 プロンプト総文字数: ' + prompt.length + '文字（約' + Math.round(prompt.length / 2) + 'トークン）');
  
  // セクション別の大まかな内訳をログ出力
  var sections = prompt.match(/【[^】]+】/g) || [];
  console.log('📏 セクション数: ' + sections.length + '個');
  console.log('📏 セクション一覧: ' + sections.join(', '));
  
  return prompt;
}

// ========================================
// 仮説・学びコンテキスト（投稿履歴＋レートキャッシュから自動取得）
// ========================================

/**
 * 投稿履歴シートから前回の仮説と学びを取得し、
 * レートキャッシュの数値差分を付加して返す
 * @param {Object} rates - 現在のレート {usdjpy, eurusd, gbpusd}
 * @return {Object} {hypothesisBlock: string|null, learning: string|null}
 */

// ========================================
// 仮説・学びコンテキスト（投稿履歴＋レートキャッシュから自動取得）
// ========================================

/**
 * 投稿履歴シートから前回の仮説と学びを取得し、
 * レートキャッシュの数値差分を付加して返す
 * @param {Object} rates - 現在のレート {usdjpy, eurusd, gbpusd}
 * @return {Object} {hypothesisBlock: string|null, learning: string|null}
 */
function getHypothesisContext_(rates) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('投稿履歴');
    if (!sheet || sheet.getLastRow() < 2) return null;
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    // A=日時(0), H=仮説(7), I=学び(8)
    
    var lastHypothesis = null;
    var hypothesisDate = null;
    var lastLearning = null;
    
    // 最新の仮説と学びを探す（下から上へ）
    for (var i = data.length - 1; i >= 0; i--) {
      if (!lastHypothesis && data[i][7] && String(data[i][7]).trim()) {
        lastHypothesis = String(data[i][7]).trim();
        hypothesisDate = new Date(data[i][0]);
      }
      if (!lastLearning && data[i][8] && String(data[i][8]).trim()) {
        lastLearning = String(data[i][8]).trim();
      }
      if (lastHypothesis && lastLearning) break;
    }
    
    var result = { hypothesisBlock: null, learning: lastLearning };
    
    if (!lastHypothesis || !hypothesisDate) return result;
    if (!rates || !rates.usdjpy) {
      result.hypothesisBlock = '\n【前回の仮説（参考情報）】\n' + lastHypothesis + '\n';
      result.hypothesisBlock += '→ 1文で軽く触れてよい。「不発」「成功」等の評価語は使うな。\n';
      return result;
    }
    
    // レートキャッシュから仮説時点のデータを取得
    var cacheSheet = ss.getSheetByName('レートキャッシュ');
    if (!cacheSheet || cacheSheet.getLastRow() < 2) {
      result.hypothesisBlock = '\n【前回の仮説（参考情報）】\n' + lastHypothesis + '\n';
      result.hypothesisBlock += '→ 1文で軽く触れてよい。「不発」「成功」等の評価語は使うな。\n';
      return result;
    }
    
    var cacheData = cacheSheet.getRange(2, 1, cacheSheet.getLastRow() - 1, 4).getValues();
    
    // --- 仮説時点のレートを探す ---
    var closestRate = null;
    var closestDiff = Infinity;
    for (var j = 0; j < cacheData.length; j++) {
      var cacheDate = new Date(cacheData[j][0]);
      var diff = Math.abs(cacheDate.getTime() - hypothesisDate.getTime());
      if (diff < closestDiff) {
        closestDiff = diff;
        closestRate = Number(cacheData[j][1]); // USD/JPY
      }
    }
    
    // --- 仮説の根拠: その週のトレンドを復元 ---
    // 仮説日の7日前〜仮説日のレートを集めて、週の方向を計算
    var weekStart = new Date(hypothesisDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    var weekRates = [];
    for (var k = 0; k < cacheData.length; k++) {
      var d = new Date(cacheData[k][0]);
      var val = Number(cacheData[k][1]);
      if (d >= weekStart && d <= hypothesisDate && val > 100) {
        weekRates.push({ date: d, rate: val });
      }
    }
    
    // 差分計算
    var currentRate = Number(rates.usdjpy);
    var hypothesisDateStr = Utilities.formatDate(hypothesisDate, 'Asia/Tokyo', 'M/d');
    
    var block = '\n【前回の仮説の振り返り（事実データ）】\n';
    block += '仮説内容: ' + lastHypothesis + '\n';
    
    // 根拠データ（仮説時点の状況）
    if (weekRates.length >= 2) {
      // 時系列でソート
      weekRates.sort(function(a, b) { return a.date.getTime() - b.date.getTime(); });
      var weekStartRate = weekRates[0].rate;
      var weekEndRate = weekRates[weekRates.length - 1].rate;
      var weekChange = weekEndRate - weekStartRate;
      var weekChangeStr = (weekChange >= 0 ? '+' : '') + weekChange.toFixed(2);
      var weekHigh = weekRates.reduce(function(max, r) { return r.rate > max ? r.rate : max; }, 0);
      var weekLow = weekRates.reduce(function(min, r) { return r.rate < min ? r.rate : min; }, 999);
      
      block += '■ 仮説の根拠データ（' + hypothesisDateStr + '時点）\n';
      block += '  仮説時レート: ' + weekEndRate.toFixed(2) + '円\n';
      block += '  直近7日の変動: ' + weekChangeStr + '円（' + weekStartRate.toFixed(2) + '→' + weekEndRate.toFixed(2) + '）\n';
      block += '  直近7日の高安: ' + weekHigh.toFixed(2) + '円〜' + weekLow.toFixed(2) + '円\n';
      block += '  トレンド: ' + (weekChange > 0.3 ? '上昇基調' : weekChange < -0.3 ? '下落基調' : 'レンジ') + '\n';
    } else if (closestRate && closestRate > 100) {
      block += '■ 仮説時レート（' + hypothesisDateStr + '）: ' + closestRate.toFixed(2) + '円\n';
    }
    
    // その後の実績
    block += '■ その後の実績\n';
    block += '  現在レート: ' + currentRate.toFixed(2) + '円\n';
    if (closestRate && closestRate > 100) {
      var change = currentRate - closestRate;
      var changeStr = (change >= 0 ? '+' : '') + change.toFixed(2);
      var direction = (change > 0.3 ? '仮説方向' : change < -0.3 ? '仮説と逆方向' : 'ほぼ横ばい');
      block += '  変動: ' + changeStr + '円（' + direction + '）\n';
    }
    
    block += '\n→ 上記の事実データのみ使い、1文で軽く触れてよい（アクセント程度）。\n';
    block += '→ 根拠と結果のギャップを述べるのはOK。\n';
    block += '→ 毎回違う表現を使え。同じフレーズの使い回しは禁止。\n';
    block += '→ OK例1: 「' + hypothesisDateStr + '時点では' + (closestRate ? closestRate.toFixed(0) : '153') + '円台だったが、' + currentRate.toFixed(2) + '円まで動いた」\n';
    block += '→ OK例2: 「先週の仮説では上方向を想定していたが、結果的に横ばい推移」\n';
    block += '→ OK例3: 仮説に触れず、純粋に今のレートと材料だけで書く（触れないのもOK）\n';
    block += '→ NG: 「先週は上昇基調で155円を見ていたが、155円台に反転」（この定型文は禁止）\n';
    block += '→ NG: 「ロング戦略は失敗」「仮説は不発」（トレード評価語は禁止）\n';
    
    result.hypothesisBlock = block;
    return result;
  } catch (e) {
    console.log('⚠️ 仮説コンテキスト取得エラー: ' + e.message);
    return null;
  }
}

// ========================================
// フォーマットルール（非公開・コード内）
// ========================================


// ========================================
// フォーマットルール（非公開・コード内）
// ========================================

function buildFormatRules_(charMin, charMax, postType) {
  var minChars = charMin || 200;
  var maxChars = charMax || 280;
  if (maxChars > 700) maxChars = 700;
  var rules = '';
  
  // === 最優先ルール ===
  rules += '\n【最優先ルール（違反は即やり直し）】\n';
  rules += '1. 投稿テキストのみ出力。前置き・挨拶・自己紹介は一切書くな。1文字目から本文。\n';
  rules += '2. 投稿タイプ名（MORNING BRIEF, TOKYO OPEN等）を本文に書くな。\n';
  rules += '3. 総文字数' + minChars + '〜' + maxChars + '文字（ハッシュタグ含まず）。★' + maxChars + '文字を絶対に超えるな。超過は即やり直し。\n';
  rules += '4. AIの無機質な要約はNG。「隣の席の凄腕トレーダー」が語るイメージ。\n';
  rules += '5. レート数字の複数ペア並べ禁止。主役1つ。数字より「なぜ？」と「大衆心理」。\n';
  rules += '6. 簡潔に書け。読者が推測できる補足説明は省略しろ。→行は1〜2文で完結。冗長な言い換えや繰り返しは削れ。\n';
  rules += '  NG: 「動かない相場で無理にトレードしても、疲れるだけで結局は消耗しちゃいますからね」（「休む勇気が大事」と書けば十分）\n';
  rules += '  NG: 「市場参加者が積極的にポジションを取りにいってない状況」（「小動きでスタート」で伝わる）\n';
  rules += '  OK: 核心→根拠→一言感想。この3要素だけで1ブロックを完結させろ。\n';
  
  // === コンパナの口調（圧縮版） ===
  rules += '\n【コンパナの口調（絶対遵守）】\n';
  rules += '語尾: 〜ですね / 〜かなと / 〜なんですよ / 〜ですしね / 〜って感じ / 〜じゃないかな\n';
  rules += '親しみ: 「本気で」「凄く」「マジで」「正直」「ぶっちゃけ」\n';
  rules += '相場描写: 「じわじわ上げてきた」「スコーンと落ちた」「重い天井」「ヌルッと抜けた」\n';
  rules += '禁止口調: 「〜である」「〜であろう」「〜と見られる」「推察される」「渦巻いている」→アナリスト/新聞記者\n';
  rules += '変換例: Before「豪ドルが買われる展開であろう」→After「豪ドル、もう一段上がるんじゃないかなと」\n';
  rules += 'ルール: 同じ語尾2回連続禁止。語尾バリエーション最低3種類使え。\n';
  
  // === ノート構造（全投稿統一）★v6.0.2 ===
  rules += '\n【フォーマット構造（全投稿で守れ）】\n';
  rules += '■ 全投稿が同じ「ノート形式」になるように書け。投稿タイプごとに構造を変えるな。\n';
  rules += '\n';
  rules += '■ ノートの基本単位 = 「絵文字ブロック」:\n';
  rules += '  絵文字行: 絵文字+事実や題名（1行で短く。言い切り型）\n';
  rules += '  →行: その話題の背景・分析・感想。1ブロックに→は1つだけ。1〜2文で完結させろ。\n';
  rules += '  補足行: →なしの通常テキスト。最大1行。なくてもよい。\n';
  rules += '\n';
  rules += '■ ルール:\n';
  rules += '  ・1投稿 = 3〜4ブロック（絵文字3個が基本）\n';
  rules += '  ・絵文字0個は絶対禁止。最低でも3個の絵文字ブロックで構成しろ。\n';
  rules += '  ・1ブロック = 1つの話題。話題が変わったら空行を入れて次の絵文字。\n';
  rules += '  ・→は1ブロックに1つだけ。2つ以上の→は禁止。\n';
  rules += '  ・絵文字行の上には必ず空行（先頭ブロック除く）\n';
  rules += '  ・最後は絵文字なし・→なしでコンパナの感想1〜2行で締める\n';
  rules += '  ・改行: 「。」「？」の後で改行。\n';
  rules += '  ・絵文字: 📕📝📋☕💡⚠️✅の7種のみ。\n';
  rules += '  ・カレンダーや日付の羅列に→を使うな。→は分析・感想専用。\n';
  rules += '\n';
  rules += '■ OK例（このレイアウトを全投稿で守れ）:\n';
  rules += '  ☕パウエル、まだ利下げしない。\n';
  rules += '  →タカ派的な発言で市場の期待を冷ました感じですね。\n';
  rules += '  米ドルが買われ、ドル円は一時157円を割る場面も。\n';
  rules += '  \n';
  rules += '  📝豪ドルは資源国通貨として原油高の恩恵。\n';
  rules += '  →豪ドル米ドルは上昇トレンドが加速中ですが、イラン情勢次第でボラが高まる可能性もありますね。\n';
  rules += '  \n';
  rules += '  💡本日は豪1月貿易収支が発表予定。\n';
  rules += '  →予想は39億豪ドル。上振れなら豪ドルがさらに買われるかも。\n';
  rules += '  \n';
  rules += '  原油価格と各国の金融政策、答え合わせは今夜ですね。\n';
  rules += '\n';
  rules += '■ NG例:\n';
  rules += '  × 1ブロックに→が2つ以上ある（→は1つだけ。残りは→なしテキスト）\n';
  rules += '  × カレンダーの日付に→を使う（→は分析用。日付は普通のテキストで並べろ）\n';
  rules += '  × 絵文字が最初の1個だけ、あとはダラダラ文章が続く\n';
  rules += '  × 絵文字なしの行が5行以上連続する\n';
  rules += '  × →がない絵文字ブロック（事実だけ書いて分析がない）\n';
  rules += '  × 1ブロック内で話題が変わる（話題ごとに絵文字で区切れ）\n';
  rules += '  × 絵文字0個で文章だけがダラダラ続く（これは最悪。絵文字で区切れ）\n';
  rules += '  × プロンプトのセクション名（【現在のレート】等）やリスト記号（・）を本文に書く\n';
  rules += '  × 絵文字を行末に置く（「地味だけど効果絶大✅」はNG。「✅地味だけど効果絶大」が正しい）\n';
  rules += '\n【絵文字の位置（絶対ルール）】\n';
  rules += '絵文字は必ず行頭に置け。行末・文中への絵文字配置は絶対禁止。\n';
  rules += 'NG: 「地味だけど効果絶大✅」「テクニックは場面とセットで📝」\n';
  rules += 'OK: 「✅地味だけど効果絶大」「📝テクニックは場面とセットで」\n';
  
  // ★v8.6: 投稿タイプ分類（セクションの条件分岐用）
  var marketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR'];
  var isMarketType = marketTypes.indexOf(postType) !== -1;
  var weekendMarketTypes = ['WEEKLY_REVIEW', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
  var isWeekendMarket = weekendMarketTypes.indexOf(postType) !== -1;
  var ruleTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4'];
  var isRuleType = ruleTypes.indexOf(postType) !== -1;
  // 市場データ（レート・指標・ニュース）が注入されるタイプ
  var needsMarketRules = isMarketType || isWeekendMarket || postType === 'WEEKLY_LEARNING';

  // === 結論バリエーション（市場系・週末系のみ。RULE/KNOWLEDGEには不要） ===
  if (needsMarketRules) {
    rules += '\n【結論のバリエーション（毎回同じ結論禁止）】\n';
    rules += '「静観」のみで終わるの禁止。以下から選べ:\n';
    rules += 'A資金管理 / B具体レベル / C時間軸提案 / D逆張り目線 / E経験からの教訓 / F通貨ペア切替 / Gリスクリワード / H感情の吐露\n';
    rules += '「静観」は1日最大1回まで。\n';
  }
  
  // === コンパナ経歴（全タイプ共通） ===
  rules += '\n【コンパナの経歴ファクト】\n';
  rules += 'FX歴7年（2019年〜）。1年目: 500万を溶かしかけた。2〜4年目: 記録開始→3年で収支安定。\n';
  rules += 'OK:「3年かけて収支が安定」 NG:「7年かかった」「500万を溶かした」\n';
  
  // === 題材選定ルール（市場系・週末系のみ。RULE/KNOWLEDGEにはニュース・通貨強弱データなし） ===
  if (isMarketType || isWeekendMarket) {
    rules += '\n【題材選定ルール（ニュース × 通貨強弱）】\n';
    rules += '・📰ニュースTOP5から最適な1つを選び、要人名+具体的事実を軸にストーリー構築。\n';
    rules += '・通貨強弱データをニュースの裏付けに使うこと。\n';
    rules += '・1日6投稿で同じニュース主題は最大2回。切り口を変えろ。\n';
    rules += '・ニュースなし/低ボラ日はドル円でよい。\n';
    rules += '・ニュースにソース元（Bloomberg、Reuters等）がある場合、「Bloombergの報道によると」「Reutersが伝えたところでは」等の形で自然に1回だけ言及しろ。信頼性が上がる。\n';
  }
  
  // === 投稿の構造（市場系・週末系のみ。RULE系は別途buildPrompt_で構造指示あり） ===
  if (isMarketType || isWeekendMarket) {
    rules += '\n【投稿の構造】\n';
    rules += '冒頭1行が全て。ニュースのインパクト凝縮。事実羅列で始めるな。\n';
    rules += 'OK:「パウエル、まだ利下げしない。市場の期待を冷水で叩いた。」\n';
    rules += '事実→「なぜ？」→大衆心理描写（必須1回以上）→具体的数字or過去事例\n';
  }
  
  // === 事実・数値の正確性（★v8.6: タイプ別に分岐。重複レート桁数ルールをbuildPrompt_に一本化） ===
  if (needsMarketRules) {
    // 市場系・週末系: フル版（カレンダー・レート・指標のルールが全て必要）
    rules += '\n【事実とフィクションの区別 / 数値の正確性（絶対遵守）】\n';
    rules += '・架空のトレード結果、架空のニュース、架空の指標日程は絶対禁止。\n';
    rules += '・経済指標の日付・名称は【経済カレンダー】記載のもののみ。\n';
    rules += '・経済指標を書く際は必ず国名を明記せよ。\n';
    rules += '・指標名を混同するな。CPI（消費者物価指数）とPPI（卸売物価指数/生産者物価指数）は別物。HICP（統合消費者物価指数）もCPIやPPIとは別指標。カレンダー記載の正式名称をそのまま使え。\n';
    rules += '・複数国の指標をまとめる際、名前のすり替えに注意。NG: 「ユーロ圏と米国のCPI」（米国はPPI）。\n';
    rules += 'NG: 「GDP改定値が発表されます」→OK: 「日本の10-12月期GDP改定値が発表されます」\n';
    rules += 'NG: 「CPI発表を控えて」→OK: 「米2月CPI発表を控えて」\n';
    rules += '・為替レートは【確定レート】、株価等は【市場環境データ】の数値のみ使え。\n';
    rules += '・Gemini検索で得た数値は使うな。注入データのみが正確。\n';
  } else {
    // RULE系・KNOWLEDGE: 最小版（市場データが注入されないのでカレンダー・レート参照は不要）
    rules += '\n【事実とフィクションの区別（絶対遵守）】\n';
    rules += '・架空のトレード結果、架空のニュース、架空の要人発言は絶対禁止。\n';
    rules += '・体験談はコンパナ自身の実体験のみ。架空の失敗談を創作するな。\n';
  }
  
  // === 論理の一貫性（市場データが注入されるタイプのみ） ===
  if (needsMarketRules) {
    rules += '\n【論理の一貫性】\n';
    rules += '日銀→円 / FRB→ドル / ECB→ユーロ / BOE→ポンド / RBA→豪ドル。因果関係を間違えるな。\n';
  }
  
  // === フォーマットルール（全タイプ共通） ===
  rules += '\n【フォーマットルール】\n';
  rules += '・ハッシュタグは書くな（システムが自動付与）。リスト記号（・●1.-）禁止。\n';
  rules += '・ピリオド不可、句点「。」使用。URL禁止。全て日本語で書け。\n';
  if (needsMarketRules) {
    rules += '・通貨ペアは日本語名で書け: USD/JPY→ドル円、EUR/USD→ユーロドル、GBP/USD→ポンドドル、EUR/JPY→ユーロ円、GBP/JPY→ポンド円、AUD/JPY→豪ドル円、AUD/USD→豪ドル米ドル\n';
    rules += '・言及できる通貨ペアは上記7ペアのみ。カナダドル（CAD）・スイスフラン（CHF）・NZドル（NZD）・人民元（CNY）等はデータが存在しないため言及禁止。\n';
    rules += '・例外: 原油高とCADの関係等、背景説明として通貨名のみ触れるのはOK。レート数値を書くのは禁止。\n';
  }
  rules += '・マークダウン記法（---、**、##）禁止。\n';
  
  // === 禁止事項（★v8.6: 共通部分とタイプ別で分離） ===
  rules += '\n【禁止事項（即やり直し）】\n';
  rules += '前置き・挨拶・自己紹介・呼びかけ（皆さん/みなさん）・投稿タイプ名\n';
  rules += '締め文: 「頑張りたい」「しっかり〜しましょう」「ワクワクしますね」「どんな戦略で臨みますか？」\n';
  rules += 'トレード判断: 「様子見」→「静観ムード」「休むも相場」、「見送る」→「一歩引いて」、「注目」→「面白いのは」「見逃せない」\n';
  rules += '→で始まる文には必ず主語を入れろ。NG「→が急落した」OK「→原油価格が急落した」\n';
  rules += '疑問形「でしょうか」は1投稿につき最大1回。複数の疑問形は断言か別表現に変換せよ。\n';
  rules += '※【末尾に質問を入れよ】の指示がある場合、その質問行が唯一の疑問形。本文中の疑問形は全て断言に変換せよ。\n';
  
  // 市場系のみ: レート・商品・始値関連の禁止事項
  if (needsMarketRules) {
    rules += '始値/終値断言禁止: NG「155.36円でスタート」→OK「155円台で推移」\n';
    rules += '商品価格は背景のみ: WTI・BTC・天然ガスを投稿の主役にするな。FXへの影響として1文で触れる程度にとどめよ。\n';
    rules += '【WTI原油と為替の因果関係（間違えると致命的）】\n';
    rules += '原油高 → 資源国通貨（豪ドル・カナダドル）の買い要因。円は輸入コスト増で売られやすい。\n';
    rules += '原油安 → 資源国通貨の売り要因。円は輸入コスト減で買われやすい。\n';
    rules += '× 絶対NG: 「原油下落がドル高につながった」（原油とドルは別の話。因果関係を捏造するな）\n';
    rules += '× 絶対NG: 「WTI下落で円安」（原油安は円高要因。逆）\n';
  }
  
  // === TC言及制限 ===
  if (isMarketType) {
    rules += '\n【低ボラ日の対応】\n';
    rules += '全ペア変動小なら値動き分析を無理に語るな。指標解説/学び/トレード心理に切り替え。\n';
  }
  
  var tcWeekdayTypes = ['GOLDEN', 'LUNCH'];
  var tcNoTypes = ['MORNING', 'TOKYO', 'LONDON', 'NY', 'INDICATOR', 'KNOWLEDGE'];
  if (tcWeekdayTypes.indexOf(postType) !== -1) {
    rules += '\n【TC導線（AI自律判断・週1〜2回・投稿の20%以下）】\n';
    rules += '宣伝感NG。「記録が大事→面倒→ツールで仕組み化」の自然な流れで。\n';
  } else if (tcNoTypes.indexOf(postType) !== -1) {
    rules += '\n【TC言及禁止。純粋な価値提供のみ。】\n';
  }
  
  // === 経済指標・リスクセンチメント（市場データが注入されるタイプのみ） ===
  if (needsMarketRules) {
    rules += '\n【経済指標の方向性ルール（誤解釈は致命的）】\n';
    rules += '通常指標（GDP,PMI,CPI等）: 予想より高い=上振れ=買い要因、低い=下振れ=売り要因\n';
    rules += '逆指標（失業率等）: 予想より低い=改善=買い要因、高い=悪化=売り要因\n';
    rules += '「上振れ」=数字が大きい。失業率の上振れ＝悪化。注入データの（買い/売り要因）判定をそのまま使え。\n';
    rules += '\n【リスクセンチメントと円の方向性（絶対に間違えるな）】\n';
    rules += 'リスクオフ（戦争・地政学リスク・株安・景気悪化）= 安全通貨の円が買われる = 円高方向\n';
    rules += 'リスクオン（株高・景気回復期待・楽観ムード）= 円が売られる = 円安方向\n';
    rules += '× 絶対NG: 「リスク回避で円売り」「リスクオフで円安」は真逆。使うな。\n';
  }
  
  // === 断言ルールと人間味ルール（市場系投稿のみ） ===
  var assertTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'NY', 'INDICATOR'];
  if (assertTypes.indexOf(postType) !== -1) {
    rules += '\n【絵文字行と→行の書き分けルール（最重要）】\n';
    rules += '投稿は「絵文字行（事実）」と「→行（意見・背景・感想）」の2層構造で書け。\n';
    rules += '\n';
    rules += '■ 絵文字行（📕📝💡等で始まる行）= 事実・情報の提示\n';
    rules += '  → 確認できている事実を言い切れ。「〜だ。」「〜している。」「〜した。」\n';
    rules += '\n';
    rules += '■ →行（→で始まる行）= コンパナの意見・背景・読み・感想\n';
    rules += '  → 人間味のある表現を使え。「〜かなと。」「〜かもしれません。」はOK。\n';
    rules += '  → 居酒屋で隣のトレーダーが話しているような温度感で書け。\n';
    rules += '\n';
    rules += '■ その他: 「要確認」は投稿に書くな。「かもしれません」は→行のみ。\n';
  }

  // === NG例（★v8.6: 市場系とRULE系で分離） ===
  if (needsMarketRules) {
    rules += '\n【NG例】\n';
    rules += '× レート羅列 × 前置き挨拶 × 呼びかけ × 投稿タイプ名 × 架空トレード結果\n';
    rules += '× トレード判断示唆（「静観」「様子見」「エントリーを避けたい」等は書くな）\n';
    rules += '× リスク方向の誤り（「リスク回避=円売り」は致命的な誤り）\n';
  } else {
    rules += '\n【NG例】\n';
    rules += '× 前置き挨拶 × 呼びかけ × 投稿タイプ名 × 架空の失敗談・統計データ\n';
  }

  // === リプライ誘発質問（約30%の確率で末尾に挿入） ===
  // リプライはいいねの150倍の価値がある。質問は投稿の末尾1行に限定し、本文の流れを崩さない
  if (Math.random() < 0.3) {
    rules += '\n【末尾に質問を入れよ（リプライ誘発・必須）】\n';
    rules += '投稿の末尾の最後の1行に、本文の内容に合ったリプライを誘発する質問を1つ自由に考えて書け。\n';
    rules += '■ 質問は本文のテーマ・内容から自然に生まれるものにすること。\n';
    rules += '■ 読者が「自分も答えたい」と思える問いかけにする。\n';
    rules += '■ 例（市場系）: 「今日みたいな相場、どう過ごしましたか？」「今夜の指標、リアルタイムで追いますか？」\n';
    rules += '■ 例（心得系）: 「同じ経験した人いますか？」「メンタル管理で効果があった方法、何かありますか？」\n';
    rules += '■ 例（週次系）: 「今週一番印象に残った動きは何ですか？」「来週の相場、どう見てますか？」\n';
    rules += '※本文中の疑問形は全て断言に変換し、質問はこの末尾の1行のみにせよ。\n';
    rules += '※「でしょうか」終わりの質問は禁止。「ありますか？」「ですか？」等の自然な語尾にすること。\n';
    rules += '※質問に「あなた」を使うな。「みなさん」または「〜した人いますか？」等の表現にすること。\n';
    console.log('💬 リプライ誘発質問を注入（自由生成）');
  }

  return rules;
}

function getQualityFeedback_(postType) {
  try {
    // このタイプの統計を取得（sheetsManager.gsの関数）
    var stats = getEngagementStats(postType, 30);

    // データが5件未満なら注入しない（信頼性が低い）
    if (stats.count < 5) {
      return '';
    }

    var avgER = Math.round(stats.avgER * 100) / 100;
    var avgImp = Math.round(stats.avgImpressions);

    // トップ3とワースト3を取得
    var sorted = stats.records.slice().sort(function(a, b) {
      return b.engagementRate - a.engagementRate;
    });

    var text = '\n【投稿品質フィードバック（自動集計）】\n';
    text += postType + ' 直近' + stats.count + '件: 平均印象' + avgImp + '回 / 平均ER' + avgER + '%\n';

    // トップ3
    if (sorted.length >= 3) {
      var top = sorted[0];
      text += 'ベスト: 印象' + top.impressions + '回 ER' + top.engagementRate + '%\n';
    }

    // ワースト
    if (sorted.length >= 3) {
      var worst = sorted[sorted.length - 1];
      text += 'ワースト: 印象' + worst.impressions + '回 ER' + worst.engagementRate + '%\n';
    }

    text += '→ ER' + avgER + '%以上を目指せ。読者が反応する具体的な数値やニュースを含めよ。\n';

    console.log('📊 品質フィードバック注入: ' + postType + ' ER平均' + avgER + '%（' + stats.count + '件）');
    return text;

  } catch (e) {
    console.log('⚠️ 品質フィードバック取得エラー: ' + e.message);
    return '';
  }
}

