/**
 * CompanaFXAutoPost - promptBuilder.gs
 * プロンプト構築 + データ注入
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 6）
 * ★v8.16: 仮説振り返りは1日1回制（2投稿目以降は重複回避指示に切替）
 * ★v8.16: 仮説精度向上（的中率フィードバック全市場投稿に拡大 + 2層構造仮説）
 * ★v8.16: 問いかけシステム（1日2回上限・確率50%・対象タイプのみ）
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
 *   sheetsManager.gs: getCharacterPrompt, getOngoingEvents_
 *   geminiApi.gs: callClaudeApi_ (★v14.0 Phase 1: selectHotTopic_で使用)
 * 
 * プロンプト肥大化の監視:
 *   現在のプロンプト総文字数は約24,000文字（約12,000トークン）。
 *   セクション数は70-73個。肥大化に注意。
 *   ★v14.0 Phase 1(2026-04-20): ホットトピック事前選定機構を追加。
 *     2セクション増(【★今日書くべきトピック1つ】【書く手順】)・約+600字。
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
    // ★v12.10: 診断書 Phase 1-2 重複削除
    //   旧: 【TCの主な機能(投稿内で1つだけ自然に触れろ)】ヘッダを独立セクションで配置
    //   新: ヘッダ削除。機能リストは【Trading Complete(TC)について】の一部として自然に続ける
    //   削減: 1セクション・約50字
    text += '\n■ 機能リスト(投稿内で1つだけ自然に触れろ。押し売り厳禁):\n';
    
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
    text += '\n■ 導線の入れ方(自然に1箇所だけ):\n';
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
          // ★v12.2: 外為オンラインの27:00形式に正式対応
          // 27:00 = 翌日AM3:00。eventHour=27として比較すれば自然に未発表判定される
          // フォールバック: 3:00形式で貼られた場合も eventHour < 6 && !result で未発表扱い
          if (eventHour >= 24) {
            // 27:00等の深夜帯。現在時刻（0-23）より常に大きいので未発表
            statusLabel = result ? '■発表済み ' : '■未発表 ';
          } else if (eventHour < 6 && !result) {
            // フォールバック: 3:00形式で結果なし → 未発表扱い
            statusLabel = '■未発表 ';
          } else if (nowHour > eventHour || (nowHour === eventHour && nowMin >= eventMin)) {
            statusLabel = '■発表済み ';
          } else {
            statusLabel = '■未発表 ';
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
        text += '※■発表済み =結果について言及せよ。「これから発表」「注目」のように未来形で書くな。\n';
        text += '※■未発表 =これから発表される指標として言及してよい。\n';
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

// ===== 夜の材料ヒント（GOLDEN投稿向け）★v12.9追加 =====
/**
 * ★v12.9: GOLDEN投稿向けの「夜の材料ヒント」を動的生成
 * 
 * 経済カレンダーから、GOLDEN投稿(20-21時台)以降の時刻に発表される材料を抽出し、
 * 重要度別に分類してプロンプトヒントを構築する。
 * 
 * 分類ルール:
 *   ・重要度「高」→ INDICATOR投稿で詳述されるため、GOLDENは軽く触れる程度に留めさせる
 *   ・重要度「中」→ GOLDENで目線を述べてよい（指標名 + どこを見るか）
 *   ・重要度「低」→ 触れなくてよい（非表示）
 *   ・要人発言（指標名に「発言/証言/会見/スピーチ/講演」を含む）→ 別カテゴリで表示
 * 
 * 時刻範囲:
 *   ・今日の現在時刻より後のイベント
 *   ・明日の深夜・早朝（0-5時台）のイベント（FOMC/ECB等で日本時間が翌日未明のケース）
 * 
 * 発表済み（I列に結果あり）のイベントは除外。
 * 
 * @param {string} postType - 投稿タイプ
 * @return {string} プロンプト注入用テキスト（GOLDEN以外は空文字、材料なしも空文字）
 */
function buildEveningMaterialHint_(postType) {
  // GOLDEN専用
  if (postType !== 'GOLDEN') return '';
  
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('経済カレンダー');
    
    if (!sheet || sheet.getLastRow() < 2) return '';
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    var now = new Date();
    var today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd');
    var tomorrow = new Date(now.getTime() + 86400000);
    var tomorrowStr = Utilities.formatDate(tomorrow, 'Asia/Tokyo', 'yyyy/MM/dd');
    
    var majorIndicators = [];   // 重要度「高」
    var mediumIndicators = [];  // 重要度「中」
    var speakers = [];          // 要人発言
    
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue;
      
      var eventDate = new Date(data[i][0]);
      var eventDateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'yyyy/MM/dd');
      
      // 今日または明日(深夜)のみ対象
      var isToday = (eventDateStr === today);
      var isTomorrow = (eventDateStr === tomorrowStr);
      if (!isToday && !isTomorrow) continue;
      
      // 時刻パース（B列はDate型 or 文字列）
      var rawTime = data[i][1];
      var hour, minute, timeStr;
      if (rawTime instanceof Date) {
        hour = rawTime.getHours();
        minute = rawTime.getMinutes();
        timeStr = hour + ':' + (minute < 10 ? '0' + minute : minute);
      } else {
        timeStr = String(rawTime || '').trim();
        if (!timeStr || timeStr === '0:00' || timeStr === '00:00') continue;
        var parts = timeStr.split(':');
        hour = parseInt(parts[0], 10);
        minute = parseInt(parts[1] || '0', 10);
      }
      if (isNaN(hour) || isNaN(minute)) continue;
      
      // 今日の場合: 現在時刻より後のイベントのみ
      // 明日の場合: 深夜・早朝(0-5時)のみ (FOMC等で日本時間が翌日未明のケース)
      if (isToday) {
        var nowHour = now.getHours();
        var nowMin = now.getMinutes();
        if (hour < nowHour || (hour === nowHour && minute <= nowMin)) continue;
      } else { // isTomorrow
        if (hour >= 6) continue;
      }
      
      // 発表済み(I列に結果あり)はスキップ
      var result = String(data[i][8] || '').trim();
      if (result) continue;
      
      var country = String(data[i][2] || '').trim();
      var indicator = String(data[i][3]).trim();
      var importance = String(data[i][6] || '中').trim();
      
      var dayLabel = isTomorrow ? '【翌日未明】' : '';
      var line = dayLabel + timeStr + ' [' + country + '] ' + indicator;
      
      // 要人発言判定
      var isSpeaker = /(発言|証言|会見|スピーチ|講演)/.test(indicator);
      
      if (isSpeaker) {
        speakers.push(line + (importance === '高' ? ' ★重要' : ''));
      } else if (importance === '高') {
        majorIndicators.push(line + ' ★重要');
      } else if (importance === '中') {
        mediumIndicators.push(line);
      }
      // 重要度「低」は無視
    }
    
    // 材料なし → 空文字返却（GOLDENでは「今夜の材料」セクションを省略）
    if (majorIndicators.length === 0 && mediumIndicators.length === 0 && speakers.length === 0) {
      return '';
    }
    
    var text = '\n【夜の材料ヒント（GOLDEN投稿以降の注目・動的生成）】\n';
    
    if (majorIndicators.length > 0) {
      text += '■ 最重要指標（INDICATOR投稿で詳述されるため、GOLDENでは「〜の発表控え」程度に軽く触れる）:\n';
      text += '  ' + majorIndicators.join('\n  ') + '\n';
    }
    
    if (mediumIndicators.length > 0) {
      text += '■ 中堅指標（GOLDENで目線を述べてよい。指標名 + どこを見るかを1〜2行で）:\n';
      text += '  ' + mediumIndicators.join('\n  ') + '\n';
    }
    
    if (speakers.length > 0) {
      text += '■ 要人発言（発言者名 + 注目点を短く。予想はするな）:\n';
      text += '  ' + speakers.join('\n  ') + '\n';
    }
    
    text += '※「目線」「材料」「注目点」「見どころ」「反応をみたい」の語彙で書け。\n';
    text += '※「〜するはず」「〜になる」「〜が確実」等の断定禁止。\n';
    text += '※時間指定の決め打ち（「21:30に大きく動く」）禁止。\n';
    
    return text;
  } catch (e) {
    console.log('夜の材料ヒント生成エラー: ' + e.message);
    return '';
  }
}

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
  
  // ★v14.0 Phase 1(2026-04-20): ホットトピック選定で使うデータを保持
  //   buildPrompt_の下流でこれらの変数に「ついでに」値を保存し、
  //   ニュース取得後に selectHotTopic_ へ渡す。
  //   各既存のデータ取得処理はそのまま維持(重複取得を避ける)。
  var _hotTopicCurrencyStrength = '';
  var _hotTopicRateDirection    = '';
  var _hotTopicDowTheory        = '';
  var _hotTopicOngoingEvents    = '';
  
  // ① キャラクター定義（Sheetsから）
  var characterPrompt = getCharacterPrompt();
  
  // ★v8.6: TC言及禁止タイプではTC導線セクションを除外（不要な指示でGeminiの注意を分散させない）
  var tcProhibitedTypes = ['MORNING', 'TOKYO', 'LONDON', 'INDICATOR', 'KNOWLEDGE'];
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
    prompt += '・USD/JPY（ドル円）: ' + formatRate_(rates.usdjpy, 'usdjpy', 'display') + '円\n';
    prompt += '・EUR/USD（ユーロドル）: ' + formatRate_(rates.eurusd, 'eurusd', 'display') + 'ドル\n';
    prompt += '・GBP/USD（ポンドドル）: ' + formatRate_(rates.gbpusd, 'gbpusd', 'display') + 'ドル\n';
    prompt += '・EUR/JPY（ユーロ円）: ' + formatRate_(rates.eurjpy, 'eurjpy', 'display') + '円\n';
    prompt += '・GBP/JPY（ポンド円）: ' + formatRate_(rates.gbpjpy, 'gbpjpy', 'display') + '円\n';
    prompt += '・AUD/JPY（豪ドル円）: ' + formatRate_(rates.audjpy, 'audjpy', 'display') + '円\n';
    prompt += '・AUD/USD（豪ドル米ドル）: ' + formatRate_(rates.audusd, 'audusd', 'display') + 'ドル\n';
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
        _hotTopicRateDirection = direction;  // ★v14.0 Phase 1: ホットトピック選定でも使う
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
        _hotTopicCurrencyStrength = hotPairResult.text;  // ★v14.0 Phase 1: ホットトピック選定でも使う
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

    // ★v13.0.11 ロールバック(2026-04-20):
    //   要人データ + 継続中重大事象の生成時点注入を削除(Stage 1検証で既にカバー済みのため)
    //   理由: プロンプト文字数が 20,800→30,994字まで膨張(特にLUNCH)し、
    //         「100-180字」「ランチタイムらしく」等の役割指示が attention から希薄化。
    //         Stage 1 の toFactString() が worldLeaders / ongoingEvents を含んで検証するため、
    //         生成時点注入は冗長な二重化だった。

    // ★v12.1.1: 商品データ注入（BTC/GOLD=Twelve Data のみ。WTI/天然ガスはAlpha Vantageデータが古いため停止）
    var btcForPrompt   = fetchCommodityPrices_();
    var commoditiesForPrompt = {
      wti:    null,
      btc:    btcForPrompt   ? btcForPrompt.btc      : null,
      gold:   btcForPrompt   ? btcForPrompt.gold     : null,
      natgas: null
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

    // ★v13.1 Phase 6 再設計 S6: ダウ理論(日足SH/SL)を投稿生成プロンプトに注入
    //   目的: コンパナはデイ〜スイングトレーダー。時間軸は基本日足で語る必要がある
    //   現状: Claude市場分析(geminiApi.gs L825)では使用済みだが、投稿生成プロンプトでは未注入
    //   効果: 「日足はまだ下降トレンド」等の時間軸表現を Claude が確実に書ける
    try {
      if (typeof getDowTheorySummary_ === 'function') {
        var dowTheoryText = getDowTheorySummary_(keys.SPREADSHEET_ID);
        if (dowTheoryText) {
          prompt += dowTheoryText + '\n';
          prompt += '※時間軸の原則: コンパナはデイ〜スイングトレーダー。基本は日足の視点で語れ。\n';
          prompt += '※週足と日足のトレンドが一致している方が確度が高い。逆行している場合は「転換の可能性」として言及せよ。\n';
          prompt += '※SH/SL の数値を根拠に語れ。例: 「日足SH 158.97を超えれば高値更新」「SL 157.50を割れば下降転換」\n\n';
          _hotTopicDowTheory = dowTheoryText;  // ★v14.0 Phase 1: ホットトピック選定でも使う
        }
      }
    } catch (dowErr) {
      console.log('⚠️ ダウ理論取得失敗(続行): ' + dowErr.message);
    }
  }
  
  // ①-b4 市場ニュースTOP5（★v5.5 Phase 7: ニュース取得レイヤー）
  // ★v5.5.3: RULE系・WEEKLY_LEARNINGには注入しない（心得・学びが主題であるべき）
  var noNewsTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'WEEKLY_LEARNING'];
  var skipNews = noNewsTypes.indexOf(postType) !== -1;
  var _hotTopicMarketNews = '';  // ★v14.0 Phase 1: ホットトピック選定用
  if (!skipNews) {
    var marketNews = fetchMarketNews_(keys);
    if (marketNews) {
      prompt += marketNews;
      _hotTopicMarketNews = marketNews;
    }
  }
  
  // ★★v14.0 Phase 1(2026-04-20): ホットトピック事前選定 ★★
  //   目的: 毎日同じ静的データ(ゴトー日・通貨強弱%のみ)を選ぶ現象を解消し、
  //         「今この瞬間のホットな材料」を起点にした投稿を実現する。
  //   背景: TCAX_REFERENCE.md 事件8 参照。
  //   対象: 市場系投稿(MORNING/TOKYO/LUNCH/LONDON/GOLDEN)のみ。
  //   失敗時: null が返るので従来動作にフォールバック(従来のプロンプトがそのまま使われる)。
  var hotTopicEnabledTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN'];
  if (hotTopicEnabledTypes.indexOf(postType) !== -1 && _hotTopicMarketNews) {
    try {
      // 継続中重大事象を取得(Stage 1 で既に使われているが、選定にも渡す)
      if (typeof getOngoingEvents_ === 'function') {
        var ongoingList = getOngoingEvents_() || [];
        if (ongoingList.length > 0) {
          var ongoingText = '';
          for (var _oe = 0; _oe < ongoingList.length; _oe++) {
            var _ev = ongoingList[_oe];
            ongoingText += '・' + _ev.name;
            if (_ev.startDate) ongoingText += '(' + _ev.startDate + '〜継続中)';
            if (_ev.summary) ongoingText += ': ' + _ev.summary;
            ongoingText += '\n';
          }
          _hotTopicOngoingEvents = ongoingText;
        }
      }
      
      // Claude API キー取得
      var _claudeKey = (keys && keys.CLAUDE_API_KEY) 
        || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
      
      if (_claudeKey) {
        var hotTopic = selectHotTopic_({
          marketNews:       _hotTopicMarketNews,
          currencyStrength: _hotTopicCurrencyStrength,
          rateDirection:    _hotTopicRateDirection,
          dowTheory:        _hotTopicDowTheory,
          ongoingEvents:    _hotTopicOngoingEvents,
          postType:         postType,
          claudeApiKey:     _claudeKey
        });
        
        if (hotTopic) {
          // 選定成功 → プロンプトに構造化テキストを注入
          prompt += formatHotTopicForPrompt_(hotTopic);
        } else {
          console.log('ℹ️ ホットトピック選定はスキップ → 従来動作で続行');
        }
      } else {
        console.log('ℹ️ CLAUDE_API_KEY未設定のためホットトピック選定スキップ');
      }
    } catch (htErr) {
      console.log('⚠️ ホットトピック選定処理エラー(続行): ' + htErr.message);
    }
  }
  // ★★v14.0 Phase 1 ここまで ★★
  
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
    var dailyTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN'];
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
  
  // ①-e アノマリー（カレンダー要因）注入 ★v8.15
  // RULE系・WEEKLY_LEARNINGはformatAnomalyForPrompt_内でスキップ
  try {
    var anomalyScope = 'today';
    // NEXT_WEEK/WEEKLY_HYPOTHESISは来週のアノマリーを注入
    if (postType === 'NEXT_WEEK' || postType === 'WEEKLY_HYPOTHESIS') {
      anomalyScope = 'next_week';
    }
    var anomalies = getTodayAnomalies_(null, anomalyScope);
    var anomalyText = formatAnomalyForPrompt_(anomalies, postType);
    if (anomalyText) {
      prompt += anomalyText;
    }
  } catch (anomalyErr) {
    console.log('⚠️ アノマリー注入エラー（続行）: ' + anomalyErr.message);
  }
  
  prompt += '【投稿タイプ（※この名前は指示用。本文には絶対に書くな）】' + typeConfig.label + '\n\n';
  
  // ② 投稿プロンプト（Sheetsから）
  var postPrompt = getPostPrompt_(postType);
  if (postPrompt) {
    prompt += postPrompt.prompt + '\n';
  } else {
    prompt += '最新のFX市場情報を元に、このタイプに合った投稿を作成してください。\n';
  }
  
  // ★v8.8.1: スプレッドシートの投稿プロンプトに古い構造指示が含まれている場合、
  // 以下のコード側の構造指示が最終版。矛盾する場合はコード側を100%優先。
  var hypothesisTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN'];
  if (hypothesisTypes.indexOf(postType) !== -1) {
    prompt += '\n【★重要: 以下の構造指示が最終版。上のシート指示と矛盾する場合、以下を100%優先せよ】\n';
  }
  
  // ②-b トレードスタイル（全投稿に注入: 見解の一貫性を保つ）
  var tradeStyle = getTradeStyle_();
  if (tradeStyle) {
    prompt += tradeStyle;
  }
  
  // ②-c〜②-h: 投稿タイプ別方針（★v8.10: 5つのヘルパー関数に分割）
  prompt += buildMarketTypePolicy_(postType, now);
  prompt += buildKnowledgePolicy_(postType);
  prompt += buildIndicatorPolicy_(postType, keys);
  prompt += buildWeekendPolicy_(postType, keys, rates);
  prompt += buildRulePolicy_(postType, isRuleType);


  // ③ RULE系: テーマシート連動（既存のgetNextTheme処理を維持）
  if (postType.indexOf('RULE') === 0) {
    var categoryMap = {
      'RULE_1': '知識・原則',
      'RULE_2': '習慣・メンタル',
      'RULE_3': '実践テクニック',
      'RULE_4': '失敗談・本音'  // ★心得テーマシートのカテゴリ名と一致させること
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

  // ★v8.16: 仮説的中率サマリーを全市場投稿に拡大（以前はWEEKLY_HYPOTHESISのみ）
  // AIが「自分が最近何を外しているか」を知ることで、仮説の精度が向上する
  var verifTargetTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN',
                          'WEEKLY_REVIEW', 'WEEKLY_HYPOTHESIS'];
  if (verifTargetTypes.indexOf(postType) !== -1) {
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
    'MORNING': 2, 'TOKYO': 1, 'LUNCH': 1, 'LONDON': 1, 'GOLDEN': 2,
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
  var hypothesisTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN',
                         'WEEKLY_REVIEW', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
  var needsHypothesis = hypothesisTypes.indexOf(postType) !== -1;
  
  var historyContext = getHypothesisContext_(rates);
  
  // ★v8.16: 仮説の振り返りは1日1回だけ（平日市場系のみ）
  // 2投稿目以降は「振り返り済み」指示に切り替え、同じ答え合わせの繰り返しを防ぐ
  var dailyMarketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN'];
  var isDailyMarket = dailyMarketTypes.indexOf(postType) !== -1;
  var alreadyReviewed = false;
  
  if (isDailyMarket) {
    try {
      var todayPosts = getTodayPreviousPosts_();
      for (var tp = 0; tp < todayPosts.length; tp++) {
        if (dailyMarketTypes.indexOf(todayPosts[tp].type) !== -1) {
          alreadyReviewed = true;
          break;
        }
      }
    } catch (e) {
      // キャッシュ取得失敗時は初回扱い（安全側）
    }
  }
  
  // 仮説の振り返り（レートキャッシュの数値差分ベース）
  if (needsHypothesis && alreadyReviewed) {
    // ★v8.16: 2投稿目以降 → 振り返り済み指示
    prompt += '\n【前回の仮説の振り返り（本日済み）】\n';
    prompt += '今日の最初の投稿で前回の仮説を振り返り済み。同じ答え合わせを繰り返すな。\n';
    prompt += '「読み違えた」「外した」等の自己批判も不要。新しい視点で市場を語れ。\n';
    console.log('📝 仮説振り返り: 本日済み（' + postType + 'は2投稿目以降）→ 重複回避指示を注入');
  } else if (needsHypothesis && historyContext && historyContext.hypothesisBlock) {
    prompt += historyContext.hypothesisBlock;
  } else if (needsHypothesis && context && context.lastHypothesis) {
    // フォールバック: 外部contextから
    prompt += '\n【前回の仮説（参考情報）】\n' + context.lastHypothesis + '\n';
    prompt += '→ 1文で軽く触れてよい。「不発」「成功」等の評価語は使うな。\n';
  }
  
  // 学び
  if (historyContext && historyContext.learning) {
    prompt += '\n【最近の学び（参考情報）】\n' + historyContext.learning + '\n';
    prompt += '→ この学びを狙い目シナリオの根拠や、振り返りの反省材料として活用せよ。\n';
  } else if (context && context.lastLearning) {
    prompt += '\n【最近の学び（参考情報）】\n' + context.lastLearning + '\n';
    prompt += '→ この学びを狙い目シナリオの根拠や、振り返りの反省材料として活用せよ。\n';
  }
  
  // ★v8.16: 問いかけ注入（1日2回上限・対象タイプのみ）
  var questionEligibleTypes = ['MORNING', 'LUNCH', 'GOLDEN', 'WEEKLY_REVIEW', 'WEEKLY_LEARNING',
                                'NEXT_WEEK', 'WEEKLY_HYPOTHESIS', 'RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'KNOWLEDGE'];
  if (questionEligibleTypes.indexOf(postType) !== -1) {
    var qCount = getQuestionCount_();
    if (qCount < 2) {
      // 確率的に注入（毎回ではなく約50%の確率）
      var shouldQuestion = (Math.random() < 0.5);
      if (shouldQuestion) {
        prompt += '\n【★問いかけを入れてよい（今日' + qCount + '/2回使用済み）】\n';
        prompt += '投稿の最後に、読者が答えたくなる問いかけを1つだけ自然に入れろ。\n';
        prompt += '★最重要: 今日の投稿の題材から自分で考えろ。固定フレーズを使い回すな。\n';
        prompt += '★その日のニュース・為替の動き・生活への影響から、読者が「自分ごと」として答えられる問いを作れ。\n';
        prompt += '方向性の参考（この通りに書くな。あくまで方向性）:\n';
        prompt += '  ・生活実感: 為替や原油の変動が財布にどう影響するか\n';
        prompt += '  ・夢・目標: 投資の先にある生活。時間やお金の自由\n';
        prompt += '  ・選択・判断: 金利や為替の変動を受けて、生活でどう行動するか\n';
        prompt += '  ・内省: トレーダーとしての自分を振り返る\n';
        prompt += '★答えやすさが命。YES/NOや一言で答えられるのが理想。長文回答を求めるな。\n';
        incrementQuestionCount_();
        console.log('❓ 問いかけ: 注入（' + postType + '・本日' + (qCount + 1) + '/2回目）');
      } else {
        console.log('❓ 問いかけ: スキップ（確率判定で今回は不要）');
      }
    } else {
      console.log('❓ 問いかけ: 上限到達（本日' + qCount + '/2回済み）');
    }
  }
  
  // ★v12.4→v12.5.4→v12.10: キャラクター口調リマインダー（プロンプト最末尾に配置）
  // LLMは最初と最後を最も重視する。長文のデータ・ルールを処理した後、
  // 最後に「コンパナとして書け」を念押しすることでキャラクター口調を維持する。
  //
  // ★v12.10: 診断書 水準2-2「プロンプト肥大化」対応
  //   旧: キャラクターシート全体を末尾で再注入 → 91セクション中12セクションが重複
  //       プロンプト総文字数 26,000〜29,000文字に膨張し attention が希薄化
  //   新: 冒頭でキャラクターシート全文を注入し、末尾は「核心の口調例3行」のみ
  //       プロンプト約12,000文字削減・セクション数約60個に減少見込み

  // ★v13.1 Phase 6 再設計 S1: Before/After 実例セクションを末尾直前に追加
  //   目的: few-shot learning によるコンパナ口調の具体的手本を提示
  //   位置: 【★★★最終確認】の直前 = Claude が最後に見る具体例
  //   8組の「アナリスト調 → コンパナ口調」変換例 + 5つの核ルール
  prompt += buildBeforeAfterExamples_();

  // ★v13.1 Phase 6 再設計 S2: 最終確認の強化
  //   変更: Before/After との連携を強化、「データは背景」の原則を追加
  //   ★v13.1 S6 追加: 時間軸の原則を追加(デイ〜スイング目線)
  prompt += '\n【★★★最終確認(この指示が全てに優先する)】\n';
  prompt += '1. 上記 Before/After 実例のトーンで書け。漢語・名詞化・堅い文末は絶対禁止。\n';
  prompt += '2. データは「使う」もの。「報告」するものではない。会話の中に織り込め。\n';
  prompt += '3. 「〜ですね」「〜かなと思います」「〜とこですね」「〜感じですね」で文末を崩せ。「〜です/ます」の連続は禁止。\n';
  prompt += '4. ★文末は必ず動詞で完結させろ。「〜かなと。」「〜とこ。」で切るな。「〜かなと思います」「〜とこですね」まで書け。\n';
  prompt += '5. 絵文字行は体言止め・動詞止めで短く。→行で人間味を出せ。\n';
  prompt += '6. ★時間軸は基本「日足」(デイ〜スイング目線)。短期(数時間)は補足で触れる程度にせよ。\n';
  prompt += '7. 完成したら声に出して読め。硬い文が1文でもあれば書き直せ。\n';
  
  // ★v5.9.3: プロンプト文字数測定（デバッグ用）
  console.log('📏 プロンプト総文字数: ' + prompt.length + '文字（約' + Math.round(prompt.length / 2) + 'トークン）');
  
  // セクション別の大まかな内訳をログ出力
  var sections = prompt.match(/【[^】]+】/g) || [];
  console.log('📏 セクション数: ' + sections.length + '個');
  console.log('📏 セクション一覧: ' + sections.join(', '));
  
  return prompt;
}

// ========================================
// ★v8.16: 問いかけ回数管理
// ========================================

/**
 * 今日の問いかけ使用回数を取得
 * @return {number} 今日の問いかけ回数（0〜2）
 */
function getQuestionCount_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var count = parseInt(props.getProperty('TODAY_QUESTION_COUNT') || '0', 10);
    return isNaN(count) ? 0 : count;
  } catch (e) {
    return 0;
  }
}

/**
 * 問いかけ使用回数をインクリメント
 */
function incrementQuestionCount_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var count = getQuestionCount_();
    props.setProperty('TODAY_QUESTION_COUNT', String(count + 1));
  } catch (e) {
    console.log('⚠️ 問いかけカウント更新エラー: ' + e.message);
  }
}


// ★v8.9: 未発表指標名取得（仮説答え合わせ防止用）
// ========================================

/**
 * 今日の経済カレンダーから、まだ発表されていない指標名の一覧を返す。
 * getHypothesisContext_ から呼ばれ、仮説テキストとの照合に使う。
 * 時刻判定ロジックは getEconomicCalendar_ と同じ。
 * 
 * @return {Array<string>} 未発表の指標名（例: ['新規失業保険申請件数', 'GDP確報値']）
 */
function getUnreleasedIndicatorNames_() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet || sheet.getLastRow() < 2) return [];
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var names = [];
    
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue;
      var eventDate = new Date(data[i][0]);
      var eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      if (eventDay.getTime() !== today.getTime()) continue;
      
      // 時刻の解析（getEconomicCalendar_ と同じロジック）
      var rawTime = data[i][1];
      var result = String(data[i][8] || '').trim(); // I列（結果）
      var eventHour, eventMin;
      
      if (rawTime instanceof Date) {
        eventHour = rawTime.getHours();
        eventMin = rawTime.getMinutes();
      } else {
        var timeStr = rawTime ? String(rawTime).trim() : '';
        var parts = timeStr.split(':');
        eventHour = parseInt(parts[0], 10) || 0;
        eventMin = parseInt(parts[1] || '0', 10);
      }
      
      // ★v12.2: 未発表判定（27:00形式対応）
      var isUnreleased = false;
      if (eventHour >= 24) {
        // 27:00等の深夜帯。結果がなければ未発表
        isUnreleased = !result;
      } else if (eventHour < 6 && !result) {
        // フォールバック: 3:00形式で結果なし → 未発表
        isUnreleased = true;
      } else if (now.getHours() < eventHour || (now.getHours() === eventHour && now.getMinutes() < eventMin)) {
        // 現在時刻がイベント時刻より前 → 未発表
        isUnreleased = true;
      }
      
      if (isUnreleased) {
        names.push(String(data[i][3]).trim());
      }
    }
    
    return names;
  } catch (e) {
    console.log('⚠️ 未発表指標名取得エラー: ' + e.message);
    return [];
  }
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
    
    // ★v12.1.1: 仮説検証ログからシステム判定を取得して注入
    // verifyPreviousHypothesis_がgeneratePostの前に実行済み → 判定結果がシートにある
    try {
      var verifySheet = ss.getSheetByName('仮説検証ログ');
      if (verifySheet && verifySheet.getLastRow() >= 2) {
        var verifyData = verifySheet.getRange(2, 1, verifySheet.getLastRow() - 1, 11).getValues();
        // 最新の検証済み結果を探す（J列=index9が空でないもの）
        for (var vi = verifyData.length - 1; vi >= 0; vi--) {
          var verdict = verifyData[vi][9]; // J列: 判定（○/△/×）
          var verdictReason = verifyData[vi][10]; // K列: 理由
          if (verdict && String(verdict).trim()) {
            // 仮説内容が一致するか確認（先頭20文字で照合）
            var logHypothesis = String(verifyData[vi][2]).trim();
            if (logHypothesis && lastHypothesis.substring(0, 20) === logHypothesis.substring(0, 20)) {
              block += '\n■ システム検証結果（自動判定・この判定が正しい）\n';
              block += '  判定: ' + String(verdict).trim() + '\n';
              if (verdictReason) block += '  理由: ' + String(verdictReason).trim() + '\n';
              block += '\n【絶対遵守】上記のシステム検証結果に従え。この判定と矛盾する記述は絶対に書くな。\n';
              block += '  例: 判定が「△方向は合った」なら「逆方向でした」「読み違えた」は絶対禁止。\n';
              block += '  例: 判定が「×外れ」なら「読み通り」「的中」は絶対禁止。\n';
              block += '  環境認識が全て。データが示す事実をそのまま伝えよ。感情や願望で歪めるな。\n';
              console.log('📊 仮説検証結果を注入: ' + String(verdict).trim());
              break;
            }
          }
        }
      }
    } catch (verifyErr) {
      console.log('⚠️ 仮説検証ログ読み取りエラー（続行）: ' + verifyErr.message);
    }
    
    // ★v8.9: 仮説に未発表指標が含まれる場合、答え合わせ不可の警告を追加
    var unreleasedNames = getUnreleasedIndicatorNames_();
    var matchedUnreleased = [];
    for (var u = 0; u < unreleasedNames.length; u++) {
      var indName = unreleasedNames[u];
      // 完全一致チェック
      if (lastHypothesis.indexOf(indName) !== -1) {
        matchedUnreleased.push(indName);
      } else {
        // 部分一致チェック: 共通接頭辞を除去して4文字以上でマッチ
        var shortName = indName.replace(/^(新規|米国|英国|豪州|日本|ユーロ圏|前月比|前年比)/, '');
        if (shortName.length >= 4 && lastHypothesis.indexOf(shortName) !== -1) {
          matchedUnreleased.push(indName);
        }
      }
    }
    
    if (matchedUnreleased.length > 0) {
      block += '\n⚠️【重要】この仮説の条件に含まれる「' + matchedUnreleased.join('、') + '」はまだ発表されていません（■未発表）。\n';
      block += '→ 答え合わせは絶対にするな。「結果次第」「発表を待つ」のスタンスで書け。\n';
      block += '→ 「〜と見ていましたが」「〜は外れました」のような答え合わせ表現は禁止。\n';
      block += '→ OK: 「この仮説は今夜の結果で答え合わせ。どう出るか」\n';
      block += '→ NG: 「159円割れを想定していましたが、159円台を維持」（まだ結果が出ていない）\n';
      console.log('⚠️ 仮説に未発表指標を検出: ' + matchedUnreleased.join(', ') + ' → 答え合わせ禁止警告を注入');
    }
    
    // ★v8.12: 今日の過去投稿で同じ仮説の答え合わせが済んでいるかチェック
    var alreadyReviewed = false;
    try {
      var todayPosts = getTodayPreviousPosts_();
      if (todayPosts && todayPosts.length > 0) {
        // 仮説テキストの先頭20文字で照合（完全一致は不要）
        var hypoSnippet = lastHypothesis.substring(0, 20);
        for (var tp = 0; tp < todayPosts.length; tp++) {
          if (todayPosts[tp].text && todayPosts[tp].text.indexOf(hypoSnippet) !== -1) {
            alreadyReviewed = true;
            console.log('📌 仮説「' + hypoSnippet + '...」は ' + todayPosts[tp].type + ' で答え合わせ済み → 繰り返し防止');
            break;
          }
        }
      }
    } catch (tpErr) {
      // キャッシュ取得失敗は無視（答え合わせ重複より投稿生成を優先）
    }
    
    if (alreadyReviewed) {
      block += '\n⚠️ この仮説は今日の前の投稿ですでに答え合わせ済み。同じ振り返りを繰り返すな。\n';
      block += '→ 代わりに「仮説のその後」として、状況がどう変化したかを1文で触れろ。\n';
      block += '→ OK: 「朝の読み通り豪ドルは売られ続けている。午後も流れは変わらず」\n';
      block += '→ OK: 「朝はドル買い優勢だったが、ここにきて少し失速。欧州勢の出方が鍵」\n';
      block += '→ NG: 「前回の仮説、答え合わせ完了ですね。→中東リスクを背景に…」（朝と全く同じ文の繰り返し）\n';
    } else {
      block += '\n→ ★v8.8.1: 仮説の振り返りは必ず1ブロック（絵文字行+→行）を使って投稿の冒頭に入れろ。省略禁止。\n';
      block += '→ 根拠と結果のギャップを正直に述べよ。「読みが当たった」「外れた」どちらもOK。\n';
      block += '→ 毎回違う表現を使え。同じフレーズの使い回しは禁止。\n';
      block += '→ OK例1: 「' + hypothesisDateStr + '時点では' + (closestRate ? closestRate.toFixed(0) : '153') + '円台だったが、' + currentRate.toFixed(2) + '円まで動いた。読み通り」\n';
      block += '→ OK例2: 「先週の仮説では上方向を想定していたが、結果的に横ばい推移。地政学リスクの影響を甘く見ていた」\n';
      block += '→ OK例3: 「強い数字なのにドルが売られるパターンを想定していたが、素直にドル買い。市場はまだインフレ退治モードだった」\n';
      block += '→ NG: 「先週は上昇基調で155円を見ていたが、155円台に反転」（この定型文は禁止）\n';
      block += '→ NG: 「ロング戦略は失敗」「仮説は不発」（トレード評価語は禁止。「ロングした」とも書くな）\n';
    }
    
    result.hypothesisBlock = block;
    return result;
  } catch (e) {
    console.log('⚠️ 仮説コンテキスト取得エラー: ' + e.message);
    return null;
  }
}

// ========================================
// ★v13.1 Phase 6 再設計 S1: Before/After 実例セクション
// ========================================
//
// 目的: few-shot learning によるコンパナ口調の具体的手本を提示
// 配置: プロンプト末尾の【★★★最終確認】直前(Claude が最後に見る実例)
//
// 設計思想:
//   - 禁止指示より実例による誘導(LLMは few-shot に強く反応)
//   - アナリスト調/AI翻訳調 → コンパナ口調 の変換例 8組
//   - 末尾に「コンパナらしさの核 5原則」を配置
//
// 実例の出典:
//   2026-04-19 のコンパナとClaudeの対話で合意された書き直し例を元に構成
//   実際のコンパナの校正案(アナリスト調→コンパナ口調)を収録
//
function buildBeforeAfterExamples_() {
  var s = '';
  s += '\n【★★★Before/After(必ずこのトーンで書け・最優先)】\n';
  s += 'アナリスト調やAI翻訳調ではなく、友達に話すコンパナ口調で書け。以下の変換例を手本にせよ:\n\n';

  s += '■ 例1(「〜を確認」の堅さ):\n';
  s += '  NG: 「豪ドル円、114円手前で週中に一時的な上値の重さを確認。」\n';
  s += '  OK: 「豪ドル円、114円手前で一時ちょっと上が重かったですね。」\n\n';

  s += '■ 例2(AI翻訳調・漢語過多):\n';
  s += '  NG: 「対円でも週間ベースでは上昇優位でしたが、特定時間帯では戻り売り圧力が散見された局面がありました。」\n';
  s += '  OK: 「対円でも週間で見れば優位でしたが、時間帯によっては戻り売りがちらほら入ってた感じ。」\n\n';

  s += '■ 例3(報告調・名詞化):\n';
  s += '  NG: 「来週の最大テーマは4/24(金)の日本CPI。」\n';
  s += '  OK: 「来週の本丸は4/24(金)の日本CPI、これに尽きます。」\n\n';

  s += '■ 例4(堅い文末「〜はずです」):\n';
  s += '  NG: 「住宅ローンを変動で組んでいる人にとっては他人事じゃないはずです。」\n';
  s += '  OK: 「住宅ローンを変動で組んでる人にとっては、正直他人事じゃない話。」\n\n';

  s += '■ 例5(堅い文末「〜ましょう」):\n';
  s += '  NG: 「仲値に向けたドル買いフローが9〜10時台に走りやすい傾向は覚えときましょう。」\n';
  s += '  OK: 「仲値に向けたドル買いフローが9〜10時台に出やすいのは頭に入れときたいところ。」\n\n';

  s += '■ 例6(漢語多用・名詞化過剰):\n';
  s += '  NG: 「ドライバーが複合的だった点が読みと違った部分です。」\n';
  s += '  OK: 「読み違えたとこは、ドライバーが絡んでたかなと思います。」\n\n';

  s += '■ 例7(堅い体言止め+カタカナ):\n';
  s += '  NG: 「豪ドルは+3.74%で主要通貨最強クラス。」\n';
  s += '  OK: 「豪ドル、4%近く上がって主役クラスですね。」\n\n';

  s += '■ 例8(「〜します」の謙譲):\n';
  s += '  NG: 「週明けで答え合わせします。」\n';
  s += '  OK: 「週明け、答え合わせしたいとこですね。」\n\n';

  // ★v13.0.10(2026-04-20): 文末未完結「〜かなと。」再発防止の実例追加
  // 背景: 2026-04-20 の MORNING 投稿で「〜見えてくるかなと。」が再発。
  // Stage 1 Q5 とプロンプト最終確認の2層ですり抜けたため、few-shot 実例で駄目押し。
  s += '■ 例9(★文末未完結・v13.0.10 再発防止):\n';
  s += '  NG: 「東京市場の反応でドル売りの本物度が見えてくるかなと。」\n';
  s += '  OK: 「東京市場の反応でドル売りの本物度が見えてくるかなと思います。」\n';
  s += '  NG: 「強い数字ならドル買い優勢とみているとこ。」\n';
  s += '  OK: 「強い数字ならドル買い優勢とみているとこですね。」\n';
  s += '  NG: 「値動きが重い感じ。」\n';
  s += '  OK: 「値動きが重い感じですね。」\n\n';

  s += '■ コンパナらしさの核(この6つを全て守れ):\n';
  s += '  1. 漢語より和語(「複合的」→「絡んでる」、「局面」→「ところ」、「確認」→「確かめる」)\n';
  s += '  2. 名詞化より動詞化(「上値の重さ」→「上が重い」、「未確定ながら」→「まだわかんないけど」)\n';
  s += '  3. 「〜です/ます」だけで終わらせず「〜ですね」「〜かなと思います」「〜とこですね」「〜感じですね」で崩せ\n';
  s += '  4. ★文末は必ず動詞で完結させろ。「〜かなと。」「〜とこ。」「〜感じ。」で切るな。「〜かなと思います/思ってます」「〜とこですね」「〜感じですね」まで書け（例9参照）\n';
  s += '  5. 「正直」「ちょっと」「ぶっちゃけ」を自然に挿入\n';
  s += '  6. 同じ語尾2回連続は禁止(「〜です。〜です。」「〜ますね。〜ますね。」)\n';
  s += '\n';

  return s;
}


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
  rules += '7. ★抽象逃げ禁止。「面白い動き」「注目の展開」「興味深い」は情報量ゼロ。何がどう動いて、なぜそうなっているかを書け。\n';
  rules += '  NG: 「豪ドル円が面白い動きになっています」（何が面白いのか不明。読者は何も学べない）\n';
  rules += '  NG: 「注目の展開ですね」「興味深い値動き」（感想であって情報ではない）\n';
  rules += '  OK: 「豪ドル円が110円台前半で揉み合い。原油高の豪ドル買いとリスクオフの円買いがぶつかってる構図ですね」\n';
  rules += '  OK: 「ドル円159円台で膠着。160円台の介入警戒が上値を抑えてる感じかなと思います」\n';
  rules += '  → 短い投稿でも「何が」「どう動いて」「なぜか」の3点は必ず含めろ。これが読者の学びになる。\n';
  rules += '8. ★ネガティブ感情禁止。「疲れた」「胃が痛い」「怖い」「辛い」は書くな。外れたら「切り替える」。\n';
  rules += '9. 口調:冒頭【ペルソナ】【発信の原則と口調】が唯一の基準。アナリスト調(〜である/〜と見られる/推察される)は禁止。同じ語尾2回連続禁止。\n';
  
  // ★v12.10: 診断書 Phase 1-1 重複削除
  //   旧: 【コンパナの口調(絶対遵守)】セクションを独立セクションとして配置(3行)
  //   新: 最優先ルール9.に統合。冒頭キャラクターシートの【発信の原則と口調】が唯一の基準であることを明示。
  //   削減: 3行・約120字・1セクション
  
  // === ★v13.1 Phase 6 再設計 S4 統合案A: フォーマット5セクション → 1統合セクション ===
  //   旧: 【フォーマット構造】+【絵文字の位置】+【投稿の構造】+【フォーマットルール】+【絵文字行と→行の書き分けルール】
  //   新: 【投稿フォーマット(見た目・構造・絵文字・書き分け)】1セクション
  //   削減: -4セクション・約-500字
  rules += '\n【投稿フォーマット(見た目・構造・絵文字・書き分け)】\n';
  rules += '■ 基本単位 =「絵文字ブロック」:\n';
  rules += '  絵文字行: 絵文字+事実(短く・体言止め or 動詞止め・「〜しました/しています」は冗長で禁止・感想入れるな)\n';
  rules += '  →行: 話題の背景・分析・意見・読み・感想(1ブロックに→は1つだけ・1〜2文で完結)\n';
  rules += '  補足行: →なし・最大1行・なくてもよい\n';
  rules += '\n';
  rules += '■ 構造ルール:\n';
  rules += '  ・1投稿 = 3〜4ブロック(絵文字3個が基本・0個は絶対禁止)\n';
  rules += '  ・絵文字は必ず行頭(行末・文中への配置は絶対禁止)。NG「地味だけど効果絶大✅」/ OK「✅地味だけど効果絶大」\n';
  rules += '  ・使える絵文字: 📕📝📋☕💡⚠️✅の7種のみ\n';
  rules += '  ・1ブロック = 1話題。話題が変わったら空行を入れて次の絵文字\n';
  rules += '  ・絵文字行の上には必ず空行(先頭除く)\n';
  rules += '  ・最後は絵文字なし・→なしでコンパナの感想1〜2行で締める\n';
  rules += '  ・改行: 「。」「?」の後で改行\n';
  rules += '\n';
  rules += '■ 絵文字行の書き方(事実のメモ・見出し調):\n';
  rules += '  OK: 「📝米イラン交渉が決裂。」「🛢原油、100ドル突破。」「💡植田総裁の発言を控える。」\n';
  rules += '  NG: 「📝米イラン交渉が決裂しました。」「🛢原油が100ドルを突破しています。」\n';
  rules += '\n';
  rules += '■ OK例(このレイアウトを全投稿で守れ):\n';
  rules += '  ☕パウエル、まだ利下げしない。\n';
  rules += '  →タカ派的な発言で市場の期待を冷ました感じですね。\n';
  rules += '  米ドルが買われ、ドル円は一時157円割れ。\n';
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
  rules += '  × 1ブロックに→が2つ以上(→は1つだけ)\n';
  rules += '  × カレンダーの日付に→を使う(→は分析用)\n';
  rules += '  × 絵文字なしの行が5行以上連続\n';
  rules += '  × →がない絵文字ブロック(事実だけで分析なし)\n';
  rules += '  × 1ブロック内で話題が変わる(話題ごとに絵文字)\n';
  rules += '  × セクション名(【現在のレート】等)やリスト記号(・)を本文に書く\n';
  rules += '\n';

  // ★v13.0.8 段階1: 鉤括弧の整合性ルール(構造破綻の予防)
  //   背景: 17:48投稿で「原油下落\n→反落」のように鉤括弧内に改行と→が入り論理破綻
  //   目的: 生成時点で鉤括弧『』「」の中に改行・→を入れさせない
  rules += '■ ★鉤括弧の整合性(絶対遵守・構造破綻防止):\n';
  rules += '  ・鉤括弧(「」『』)は必ず同じ行の中で開いて閉じろ。改行を挟むな\n';
  rules += '  ・鉤括弧の中に「→」を入れるな。→は鉤括弧の外で使え\n';
  rules += '  ・鉤括弧の中に絵文字(📕📝📋☕💡⚠️✅)を入れるな\n';
  rules += '  ・NG: 「原油下落\\n→反落」(鉤括弧の中で改行+→)\n';
  rules += '  ・NG: 「停戦延長で豪ドル買い継続」か「原油下落\\n→反落」か(鉤括弧の中断)\n';
  rules += '  ・OK: 「原油下落で豪ドル反落」(鉤括弧内で完結)\n';
  rules += '  ・OK: 「停戦延長で豪ドル買い継続」か「決裂で原油下落+豪ドル反落」か(両方の鉤括弧が同じ行で閉じている)\n';
  rules += '  ・複数の鉤括弧を並べる時は、それぞれが独立した1文として閉じろ\n';
  rules += '\n';
  
  // ★v8.6: 投稿タイプ分類（セクションの条件分岐用）
  var marketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'INDICATOR'];
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
    rules += '\n【題材選定ルール（★v12.3: ストーリー主導）】\n';
    rules += '・★最最重要: コンパナのスタイルは「ファンダ・地政学で大枠の流れを読む順張りトレーダー」。\n';
    rules += '  投稿もこのスタイルで書け。「今、世界で何が起きていて、それが為替にどう波及するか」のストーリーが主役。\n';
    rules += '・📰ニュースTOP5から最もホットな地政学・ファンダのネタを1つ選び、投稿の核にしろ。\n';
    rules += '・通貨強弱・レート・ダウ理論は「実際にこう動いている」の裏付け証拠。主役にするな。\n';
    rules += '  OK: 「米イラン協議決裂→ホルムズ封鎖継続→原油高。実際に豪ドルは+2.5%で資源国買いが鮮明」\n';
    rules += '  NG: 「豪ドルが+2.5%で強い。背景には米イラン情勢が...」（データが先に来ている）\n';
    rules += '・1日6投稿で同じニュース主題は最大2回。切り口を変えろ。\n';
    rules += '・ニュースなし/低ボラ日はドル円でよいが、政治・地政学の背景を必ず添えろ。\n';
  }
  
  // === ★v13.1 S4 統合案A: 【投稿の構造】は【投稿フォーマット】に統合されたため削除 ===
  //   ただし「因果チェーン」の鉄則は重要なので、市場系のみ維持
  if (isMarketType || isWeekendMarket) {
    rules += '\n【投稿の骨格は因果チェーン(市場系のみ・最重要)】\n';
    rules += '★原因(何が起きた)→ 経路(なぜ・どう波及)→ 為替への影響(だからこう動いている)\n';
    rules += '例: 「米イラン協議決裂(原因)→ ホルムズ封鎖でエネルギー供給不安(経路)→ 原油高で資源国通貨買い・リスクオフで円買い(影響)」\n';
    rules += '冒頭1行は「世界で今起きている出来事」のインパクトで始めろ。レートの数字で始めるな。\n';
    rules += '仮説の答え合わせがある場合は冒頭1ブロックで。その後すぐにストーリーへ。\n';
  }
  
  // === ★v12.1.1: 環境認識の原則（全投稿タイプ共通） ===
  rules += '\n【環境認識の原則（最重要・全投稿で遵守）】\n';
  rules += 'T-CAXは市場を予測するシステムではない。環境認識システムである。\n';
  rules += '・現状を正確に認識せよ。今が上昇なら「上昇している」と書け。「下がるかも」と願望を書くな。\n';
  rules += '・データが示す事実がすべて。感情・願望・希望的観測で事実を歪めるな。\n';
  rules += '・仮説の振り返りでは、システム検証結果（○/△/×）が注入されている場合、その判定に100%従え。\n';
  rules += '  「方向は合った」と判定されているのに「逆方向でした」と書くのは絶対禁止。\n';
  rules += '・未来は誰にも分からない。「〜になるだろう」ではなく「〜の可能性が高い環境」と書け。\n';
  
  // === ★v13.1 Phase 6 再設計 S3 統合案D: 事実・論理3セクション → 1セクション統合 ===
  //   旧: 【事実とフィクションの区別】+【論理の一貫性】(+ 別所の【レートデータの使い方】)
  //   新: 【事実・論理・データの使い方】1セクションに統合
  //   削減: -1セクション・約-100字
  if (needsMarketRules) {
    // 市場系・週末系: フル版
    rules += '\n【事実・論理・数値の正確性(絶対遵守)】\n';
    rules += '■ 事実:\n';
    rules += '  ・架空のトレード/ニュース/指標日程/要人発言は禁止\n';
    rules += '  ・経済指標の日付・名称は上記カレンダー記載のもののみ。国名を必ず明記\n';
    rules += '  ・指標名を混同するな(CPI/PPI/HICP は別物)。正式名称を使え\n';
    rules += '  ・為替レートは上記の確定レート、株価等は市場環境データの数値のみ使え\n';
    rules += '  ・Gemini検索で得た数値は使うな。注入データのみが正確\n';
    rules += '■ 論理:\n';
    rules += '  ・中銀と通貨の対応: 日銀→円/FRB→ドル/ECB→ユーロ/BOE→ポンド/RBA→豪ドル\n';
    rules += '  ・因果関係を間違えるな(詳細は別途、因果関係のセクションを参照)\n';
    rules += '■ 数値の書き方:\n';
    rules += '  ・レート・指標データは「方向感の把握」に使え。数字の羅列は禁止\n';
    rules += '  ・OK: 「ドル円は上昇基調が続いていて」「ユーロは先週から売られっぱなし」\n';
    rules += '  ・NG: 「ドル円は159.27円」「EUR/USDは1.1568ドル」(数字の羅列)\n';
    rules += '  ・数字を使うのは大台(160円)や大きな変動幅の説明時だけ\n';
  } else {
    // RULE系・KNOWLEDGE: 最小版
    rules += '\n【事実とフィクションの区別(絶対遵守)】\n';
    rules += '・架空のトレード結果、架空のニュース、架空の要人発言は絶対禁止\n';
    rules += '・体験談はコンパナ自身の実体験のみ。架空の失敗談を創作するな\n';
  }
  
  // === 表記ルール(全タイプ共通・★v13.1 S4: 【フォーマットルール】から改名して統合セクションと区別) ===
  rules += '\n【表記ルール】\n'; 
  rules += '・ハッシュタグは書くな(システムが自動付与)。リスト記号(・●1.-)禁止\n';
  rules += '・ピリオド不可、句点「。」使用。URL禁止。全て日本語で書け\n';
  if (needsMarketRules) {
    rules += '・通貨ペアは日本語名で書け: USD/JPY→ドル円、EUR/USD→ユーロドル、GBP/USD→ポンドドル、EUR/JPY→ユーロ円、GBP/JPY→ポンド円、AUD/JPY→豪ドル円、AUD/USD→豪ドル米ドル\n';
    rules += '・言及できる通貨ペアは上記7ペアのみ。カナダドル(CAD)・スイスフラン(CHF)・NZドル(NZD)・人民元(CNY)等はデータが存在しないため言及禁止\n';
    rules += '・例外: 原油高とCADの関係等、背景説明として通貨名のみ触れるのはOK。レート数値を書くのは禁止\n';
  }
  rules += '・マークダウン記法(---、**、##)禁止\n';
  
  // === 禁止事項（★v8.6: 共通部分とタイプ別で分離） ===
  rules += '\n【禁止事項（即やり直し）】\n';
  rules += '前置き・挨拶・自己紹介・呼びかけ（皆さん/みなさん）・投稿タイプ名\n';
  rules += '締め文: 「頑張りたい」「しっかり〜しましょう」「ワクワクしますね」「どんな戦略で臨みますか？」\n';
  rules += 'トレード判断の言い換え: 「様子見」→「静観ムード」、「見送る」→「一歩引いて」\n';
  rules += '仮説・読みの提示はOK: 「自分はこう読んでいる」「こういう展開を想定している」は積極的に書け。\n';
  rules += '★ただし「エントリーした」「ポジション持った」「利確した」は禁止（実際にトレードしていない）。\n';
  rules += '★レート数字の羅列は禁止。「159.27円」「1.1568ドル」を並べるな。方向感で語れ。\n';
  rules += '→で始まる文には必ず主語を入れろ。NG「→が急落した」OK「→原油価格が急落した」\n';
  rules += '疑問形「でしょうか」は1投稿につき最大1回。複数の疑問形は断言か別表現に変換せよ。\n';
  rules += '※「末尾に質問を入れよ」の指示がある場合、その質問行が唯一の疑問形。本文中の疑問形は全て断言に変換せよ。\n';
  
  // 市場系のみ: レート・商品・始値関連の禁止事項
  if (needsMarketRules) {
    rules += '始値/終値断言禁止: NG「155.36円でスタート」→OK「155円台で推移」\n';
    rules += '商品価格は背景のみ: WTI・BTC・天然ガスを投稿の主役にするな。FXへの影響として1文で触れる程度にとどめよ。\n';
    // ★v12.11 Phase 6-1 統合案C: WTI因果・経済指標・リスクセンチメントを【因果関係ルール】1セクションに統合
    // WTI関連はここから削除し、下の統合セクションで集約
  }
  
  // === TC言及制限 ===
  if (isMarketType) {
    rules += '\n【低ボラ日の対応】\n';
    rules += '全ペア変動小なら値動き分析を無理に語るな。指標解説/学び/トレード心理に切り替え。\n';
  }
  
  var tcWeekdayTypes = ['GOLDEN', 'LUNCH'];
  var tcNoTypes = ['MORNING', 'TOKYO', 'LONDON', 'INDICATOR', 'KNOWLEDGE'];
  if (tcWeekdayTypes.indexOf(postType) !== -1) {
    rules += '\n【TC導線（AI自律判断・週1〜2回・投稿の20%以下）】\n';
    rules += '宣伝感NG。「記録が大事→面倒→ツールで仕組み化」の自然な流れで。\n';
  } else if (tcNoTypes.indexOf(postType) !== -1) {
    rules += '\n【TC言及禁止。純粋な価値提供のみ。】\n';
  }
  
  // === ★v12.11 Phase 6-1 統合案C: 因果関係ルール(市場データが注入されるタイプのみ) ===
  //   旧: 【WTI原油と為替の因果関係】+【経済指標の方向性ルール】+【リスクセンチメントと円の方向性】の3セクション(約460字)
  //   新: 【因果関係ルール】1セクション(約280字)
  //   削減: -2セクション・約-180字(-39%)・情報量は全て保持
  if (needsMarketRules) {
    rules += '\n【因果関係ルール(最重要・間違えたら致命的)】\n';
    rules += '■ リスクセンチメント:\n';
    rules += '  リスクオフ(戦争・地政学・株安)= 円高・安全通貨買い / リスクオン(株高・楽観)= 円安・リスク通貨買い\n';
    rules += '  × 絶対NG「リスクオフで円安」「リスク回避で円売り」は真逆\n';
    rules += '■ 経済指標:\n';
    rules += '  通常(GDP/PMI/CPI等): 予想超=買い要因・予想下=売り要因\n';
    rules += '  逆指標(失業率等): 予想下=改善=買い要因・予想上=悪化=売り要因\n';
    rules += '  注入データの(買い/売り要因)判定をそのまま使え。「上振れ」=数字が大きい。失業率の上振れ=悪化。\n';
    rules += '■ WTI原油:\n';
    rules += '  原油高→資源国通貨(豪ドル/CAD)買い・円は輸入コスト増で売られやすい\n';
    rules += '  原油安→資源国通貨売り・円は輸入コスト減で買われやすい\n';
    rules += '  × 絶対NG「原油下落がドル高」「WTI下落で円安」(原油とドルは別の話・原油安は円高要因)\n';
  }
  
  // === 断言ルールと人間味ルール ===
  var assertTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'INDICATOR',
                     'WEEKLY_REVIEW', 'WEEKLY_LEARNING', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
  if (assertTypes.indexOf(postType) !== -1) {
    // ★v13.1 S4 統合案A: 【絵文字行と→行の書き分けルール】は【投稿フォーマット】に統合済み
    //   ここでは「要確認禁止」「かもしれません限定」の補足ルールのみ残す
    rules += '\n【書き分け補足ルール】\n';
    rules += '・「要確認」は投稿に書くな。「かもしれません」は→行のみ\n';
  }

  // === NG例（★v8.6: 市場系とRULE系で分離） ===
  if (needsMarketRules) {
    rules += '\n【NG例】\n';
    rules += '× レート数字の羅列 × 前置き挨拶 × 呼びかけ × 投稿タイプ名 × 架空トレード結果（「ロングした」「利確した」）\n';
    rules += '× 当たり前の仮説（「指標上振れなら通貨高」は誰でも言える。書くな）\n';
    rules += '× 一方向の賭け仮説（「○○なら○○円割れ」は禁止。条件分岐型で書け）\n';
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


// ========================================
// ★v8.10: buildPrompt_から分割したヘルパー関数群
// 各関数はプロンプト文字列を返す。該当しないタイプでは空文字を返す。
// ロジックはbuildPrompt_から丸ごと移動。変更なし。
// ========================================


/**
 * ★v8.10: 市場系投稿の方針（②-c〜②-c2）
 * 対象: MORNING, TOKYO, LUNCH, LONDON, GOLDEN, INDICATOR
 * 仮説ベース構造、レートデータ使い方、月曜コンテキスト等を含む
 * ★v13.0.9(2026-04-20): NY削除の残骸整理(v12.7でNYタイプ廃止済み)
 */
function buildMarketTypePolicy_(postType, now) {
  var text = '';
  
  // ②-c 市場系投稿の方針（buildFormatRules_と重複しない項目のみ）
  var marketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'INDICATOR'];
  if (marketTypes.indexOf(postType) !== -1) {
    text += '\n【市場系投稿の方針（最重要）】\n';
    text += '■ ★v12.3【ストーリー主導の鉄則】\n';
    text += '  ・コンパナはファンダ・地政学で大枠の流れを読む順張りトレーダー。投稿もこの視点で書け。\n';
    text += '  ・読者が知りたいのは「今、世界で何が起きているの？それで自分のお金はどうなるの？」。\n';
    text += '  ・「ホルムズ海峡封鎖でエネルギーの2割が止まっている」は面白い。「AUD/USDが+2.5%」は退屈。\n';
    text += '  ・上に注入された「📰ニュースTOP5」から最もホットなネタを1つ選び、因果チェーンで展開しろ。\n';
    text += '  ・因果チェーン: 原因（何が起きた）→ 経路（なぜ・どう波及）→ 為替への影響\n';
    text += '  ・通貨強弱・レートは因果チェーンの「証拠」として使え。「実際にこう動いている」を裏付ける役割。\n';
    text += '  ・★まわりくどい説明は禁止。「据え置き中のドルや緩やかな引き締め下の円が売られ」←これはアナリスト。\n';
    text += '  ・コンパナなら「ドルが売られて豪ドルが買われてる。シンプルに金利差ですね」と一言で言い切る。\n';
    text += '  ・1文で事実を言い切り、→行で「なぜ」を補足。これだけ。\n';
    text += '■ 指標に言及する場合は時刻を含めて正確に。上記「今日の経済指標」の時刻を使え。\n';
    text += '■ レート・ニュース解釈・通貨の売買方向は確定データに必ず従え。売られている通貨を「買い」、買われている通貨を「売り」と書くのは絶対禁止。矛盾したらデータ優先。\n';
    text += '■ ★v10.1【抽象的な値動き描写の禁止】\n';
    text += '  ・「面白い動き」「注目の動き」「興味深い展開」等の抽象的な形容詞で値動きを描写するな。\n';
    text += '  ・値動きには必ずファンダメンタルズの因果関係を添えろ。「なぜその動きが起きているのか」が読者の学びになる。\n';
    text += '  ・NG: 「豪ドル円が面白い動きになっています」（何が面白いのか不明。学びゼロ）\n';
    text += '  ・OK: 「豪ドル円が綱引き状態ですね。原油高で資源国の豪ドルが買われる一方、中東リスクで円も買われていて方向が定まらない」\n';
    text += '  ・NG: 「ユーロに注目です」（なぜ注目なのか書いていない）\n';
    text += '  ・OK: 「ユーロ圏PMIが予想を大幅に下回って、ECBの追加利下げ観測が再浮上していますね」\n';
    text += '  ・原則: 形容詞を使うな。因果関係を書け。読者が「なるほど、だからこう動いてるのか」と思えるのが正解。\n';
    text += '\n【★仮説ベースの投稿構造（v8.8.1・最重要）】\n';
    text += '■ コンパナの投稿はニュース要約ではない。「仮説の提示→答え合わせ→次の仮説」のサイクルで回せ。\n';
    text += '■ 前回の仮説の振り返りデータが注入されている場合、必ず1ブロック使って答え合わせを入れろ。\n';
    text += '■ 仮説は「非自明な読み」を出せ。以下を厳守:\n';
    text += '  ・「指標上振れなら通貨高」のような当たり前の仮説は禁止。誰でも言える。\n';
    text += '  ・政治（トランプの関税、各国の選挙）、地政学（中東、ホルムズ海峡）、構造変化（高齢化、財政赤字）に根ざした仮説が理想。\n';
    text += '  ・「表面上は○○だが、実は○○ではないか」「市場はまだ○○を織り込んでいない」の視点。\n';
    text += '  ・為替の裏にある人間社会・生活への影響にも触れろ（円安と海外旅行、原油高とガソリン代等）。\n';
    text += '  ・OK: 「停戦報道で楽観ムードだが、イランの本音は時間稼ぎ。この楽観は脆い」\n';
    text += '  ・OK: 「市場は利下げ織り込みを進めているが、トランプの関税第2弾が来たらインフレ再燃でシナリオ崩壊」\n';
    text += '  ・NG: 「失業保険が予想以下ならドル買い」（当たり前すぎる）\n';
    text += '  ・NG: 「159.50超えならロング。損切は159.00」（数字の羅列。読者の目が滑る）\n';
    text += '■ ★v8.16: 仮説は「2層構造」で考えろ:\n';
    text += '  【構造仮説】今週〜数週間の大きなシナリオ。ファンダメンタルズ・地政学に根ざした読み。\n';
    text += '    ・例: 「ホルムズ海峡の安全航行が回復すれば、WTI原油が90ドル台に下落→インフレ期待後退→FRB利下げ観測でドル安、同時にリスクオンで円売り」\n';
    text += '    ・例: 「トランプの対中関税第3弾が発動されれば、中国減速→豪州資源輸出減→豪ドル売り加速」\n';
    text += '    ・例: 「ECBがエネルギーインフレに耐えきれず利上げに転じたら、ユーロ圏景気後退リスクでユーロは一時的に買われた後、むしろ売られる」\n';
    text += '    ・ポイント: 「原因→経路→為替への影響」の因果チェーンで書け。結論だけ言うな。\n';
    text += '  【今日の仮説】今日〜明日の具体的な注目点。構造仮説の枠内で、今日のイベントがどう作用するか。\n';
    text += '    ・例: 「今夜の失業保険は、上の構造（FRBの利下げ観測）が正しいかのテスト。強い数字なのにドルが売られたら、市場は利下げを既定路線と見ている証拠」\n';
    text += '    ・ポイント: 構造仮説を「検証するための観察ポイント」として書くと、外れても学びになる。\n';
    text += '  投稿では両方を全て書く必要はない。構造仮説を頭に置いた上で、今日の仮説を自然に語れ。\n';
    text += '  ただしGOLDENでは構造仮説に触れるチャンスがある。大きな読みを語れ。\n';
    text += '■ ★v8.11: 仮説は「条件分岐型」で書け（一方向の賭けは禁止）:\n';
    text += '  ・仮説 = 市場の読み解き方を示すこと。「当たるか外れるか」の賭けではない。\n';
    text += '  ・「結果が出た後の市場の反応」を読む仮説が最上。どう転んでも学びになる。\n';
    text += '  ・NG（賭け型）: 「失業保険悪化ならドル円159円割れ」→外れたら「読み違えた」で終わり\n';
    text += '  ・OK（条件分岐型）: 「失業保険の数字自体より、結果が出た後のドルの反応を見る。\n';
    text += '    強い数字なのにドルが売られたら、市場はインフレより景気後退を心配している証拠。\n';
    text += '    素直にドル買いなら、まだインフレ退治が最優先という合図」\n';
    text += '  ・OK: 「停戦合意が出ても原油が下がらなければ、市場は合意の持続性を信じていないということ」\n';
    text += '  ・OK: 「日銀が据え置きでも円が売られなければ、次回利上げを織り込み始めたサイン」\n';
    text += '  ・ポイント: 「もしAならBだが、もしCならDという意味」の構造。読者に市場の見方を教える。\n';
    text += '■ 負けた（外れた）時は正直に書け。「読み違えた」「反省ポイント」も投稿の価値。\n';
    text += '■ ★「トレードした」「エントリーした」「利確した」は禁止（実際にトレードしていない）。\n';
    text += '  ・「自分はこう読んでいる」「こう見ている」「こういう展開を想定している」で表現。\n';
    // ★v13.1 S3 統合案D: 【レートデータの使い方】は【事実・論理・数値の正確性】に統合されたため削除
    if (postType === 'TOKYO' || postType === 'LUNCH') {
      text += '■ ★v12.6【TOKYO/LUNCH専用】具体的なレート数値（158.97等）は一切書くな。「158円台」「0.71ドル台」のようにレベル感で伝えよ。\n';
    }
    text += '\n【経済イベントの日付・時制(絶対遵守)】\n';
    text += '■ 日付:「〜が控えています」と書くときは必ず経済カレンダーで今日の日付を確認。今日の日付に載っていないイベントを「今日控えている」と書くな。\n';
    text += '  NG: 今日が3月17日なのに「日銀会合が控えています」(日銀会合は3月19日)\n';
    text += '  OK: 「今日12:30にRBA政策金利発表」(カレンダーに今日の日付で記載あり)\n';
    text += '■ 時制(★ハルシネーション防止): 経済カレンダーの「結果」列が空欄の指標はまだ発表されていない。\n';
    text += '  未発表の指標を「〜を受けて」「〜の結果」「〜が示された」等の過去形で書くな。\n';
    text += '  ニュース検索で事前報道が見つかっても、それは「発表された結果」ではない。\n';
    text += '  NG: 「FOMC議事要旨でハト派な見解が示された」(まだ発表されていない)\n';
    text += '  OK: 「今夜FOMC議事要旨が控えている。ハト派なら〜の可能性」(未来形・条件分岐型)\n';
  }
  
  // ②-c1.5 MORNING共通: 東京市場オープン前の認識 ★v5.6追加
  if (postType === 'MORNING') {
    text += '\n【MORNING投稿の役割】\n';
    text += '■ 朝7:30〜8:00頃配信。東京市場(9:00)オープンの約1時間前。\n';
    text += '■ 構成:①昨夜の世界で何が起きたか(政治・地政学・中銀) → ②今日の仮説(条件分岐型) → ③前回仮説の答え合わせ(データ注入時のみ・最長1文)\n';
    text += '■ 同じ段落で異なる通貨ペアのレートを混ぜるな。\n';
  }
  
  // ②-c1.6 TOKYO共通: 東京市場序盤の認識（全曜日共通） ★v6.6追加 ★v10.1: 理由必須
  if (postType === 'TOKYO') {
    text += '\n【TOKYO投稿の役割】\n';
    text += '■ 朝9:11〜9:43頃配信。東京オープン後10〜40分。「予想」ではなく「観察」。\n';
    text += '■ MORNINGの仮説の「途中経過」を1文入れろ。東京勢の空気感を描写(実需の動き・輸出勢の売り等)。\n';
    text += '■ 8:50の日本指標が発表済みなら結果に触れよ。\n';
    text += '■ ★v12.6【レートは「台」で表現】具体的な数値(158.97等)は書くな。「158円台」「0.71ドル台」のようにレベル感で伝えよ。100〜180字の短い投稿で5分後に変わる数字に字数を使うな。\n';
  }
  if (postType === 'GOLDEN') {
    text += '\n【GOLDEN投稿の役割】\n';
    text += '■ 夜20-21時台配信。1日の振り返りを冷静に。\n';
    text += '■ ①仮説スコアカード: 朝の仮説がどうなったか。当たり外れを正直に。\n';
    text += '■ ②今日一番の学び: 数字ではなく「世界の動き」から何を学んだか。\n';
    text += '■ ③明日への視点: 今日の結果を踏まえて世界がどう動きそうか。\n';
    text += '■ ★未発表指標の答え合わせ禁止: 仮説の条件に含まれる経済指標がまだ未発表なら、答え合わせは保留。\n';
    
    // ★v12.9: 夜の材料ヒント（経済カレンダーから動的生成）
    text += buildEveningMaterialHint_(postType);
  }
  
  // ★v12.7: NY投稿セクション削除（NYタイプ廃止のため）
  
  // ②-c2 月曜日コンテキスト（市場系全投稿共通）★v5.6追加
  var todayDayOfWeek = now.getDay(); // 0=日, 1=月, ..., 6=土
  var mondayMarketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'INDICATOR'];
  if (todayDayOfWeek === 1 && mondayMarketTypes.indexOf(postType) !== -1) {
    text += '\n【月曜日の投稿方針(本日は週明け・全市場系投稿で厳守)】\n';
    text += '■ 今日は月曜日。土日は為替市場が閉まっていた。\n';
    text += '■ 「昨日」「昨夜」は絶対禁止（昨日＝日曜で市場は閉まっている）。\n';
    text += '  → NG: 「昨日のNY市場では〜」「昨夜のNYで〜」「昨日の流れを引き継ぎ〜」\n';
    text += '  → OK: 「先週金曜のNY市場では〜」「金曜NYの流れを引き継ぎ〜」「週末を挟んで〜」\n';
    text += '■ 週末の世界情勢を踏まえる:\n';
    text += '  → 📰ニュースTOP5で拾った週末の要人発言・地政学ニュース・政策発表を題材にする。\n';
    text += '  → 市場が閉まっている間に世界で何が起きたか、が月曜の最大の関心事。\n';
    
    // MORNING固有の追加指示
    if (postType === 'MORNING') {
      text += '■ 【MORNING固有】窓開け（ギャップ）を中心に構成:\n';
      text += '  → 金曜NYの終値と月曜早朝のレートを比較し、窓の大きさと方向を伝える。\n';
      text += '  → 窓が大きい場合:「週末に何が起きたか」→「窓は埋まるか、このまま走るか」の分析。\n';
      text += '  → 窓が小さい場合:「週末は大きなサプライズなし」→「金曜の流れを引き継ぐか」の分析。\n';
      text += '  → 「東京市場がこのニュースにどう反応するか」が読者の最大の関心事。\n';
      text += '■ 先週のWEEKLY_HYPOTHESISの仮説との対比があれば触れてよい。\n';
    }
    
    // TOKYO固有の追加指示
    if (postType === 'TOKYO') {
      text += '■ 【TOKYO固有】月曜の東京オープンの特殊性:\n';
      text += '  → 週末のニュースに対する東京市場の最初の本格的反応。\n';
      text += '  → 窓埋め（ギャップフィル）が起きているか、窓方向にさらに走っているか。\n';
      text += '  → 「金曜NYの流れ」ではなく「週末を挟んだ変化」に対する東京の反応として書く。\n';
    }
    
    // LUNCH固有の追加指示
    if (postType === 'LUNCH') {
      text += '■ 【LUNCH固有】月曜午前の振り返り:\n';
      text += '  → 「週明けの東京市場がどう反応したか」の振り返りが自然な切り口。\n';
      text += '  → 窓埋め完了/未完了、週末ニュースへの織り込み具合を整理する。\n';
    }
    
    // LONDON以降は「昨日」禁止だけで十分（午後〜夜は市場が動いているため）
  }
  
  return text;
}


/**
 * ★v8.10: KNOWLEDGE投稿の方針（②-d）
 */
function buildKnowledgePolicy_(postType) {
  if (postType !== 'KNOWLEDGE') return '';
  
  var text = '\n【KNOWLEDGE投稿の方針（最重要 - 必ず守れ）】\n';
  text += '■ この投稿は「難しい金融を楽しくかみ砕く」投稿。教科書ではない。\n';
  text += '■ 読者が「そうだったのか」「知らなかった」と思える例え話やトリビアを必ず入れる。\n';
  text += '■ 上の確定レートは「今日何が注目されているか」を判断するためだけに使え。\n';
  text += '■ 冒頭にレートの数字を書くな。「ドル円は152円」から始めるのは禁止。\n';
  text += '■ 内容のヒント（構造は共通のノート形式に従え）:\n';
  text += '  ・問いかけ→例え話→過去エピソード→実感、の流れが効果的。\n';
  text += '  ・ただし各トピックは必ず「絵文字+事実→分析」のブロック形式で書くこと。\n';
  text += '■ 冒頭の例:\n';
  text += '  OK: 「CPIって何？→物価の体温計みたいなもの。熱が高い（インフレ）と利下げが遠のく」\n';
  text += '  OK: 「FOMCって聞くけど、実際に何が決まる？→世界の株価と為替の心臓部みたいな会議」\n';
  text += '  NG: 「スプレッドとは、FX取引における買値と売値の差のことで…」（教科書的で退屈）\n';
  return text;
}


/**
 * ★v8.10: INDICATOR投稿の方針 + データ注入（Layer 2 + ②-e）
 */
function buildIndicatorPolicy_(postType, keys) {
  if (postType !== 'INDICATOR') return '';
  
  var text = '';
  
  // ★v12.4: トリガーが発火した対象指標を読み取り、主題として注入
  try {
    var targetJson = PropertiesService.getScriptProperties().getProperty('INDICATOR_TARGET');
    if (targetJson) {
      var target = JSON.parse(targetJson);
      text += '\n【★この投稿の対象指標（トリガーが発火した指標。これについて書け）】\n';
      text += '本投稿は「' + target.time + ' [' + target.country + '] ' + target.name + '」の30分前に発火したトリガーで生成されている。\n';
      text += '★この指標について書け。他の指標がどんなに面白そうでも、この指標が主題。\n';
      text += '★他の指標（PPI等）に勝手に切り替えるな。\n\n';
      console.log('📌 INDICATOR対象指標: ' + target.time + ' ' + target.country + ' ' + target.name);
      // 使用後にクリア（次のトリガーで上書きされるが念のため）
      PropertiesService.getScriptProperties().deleteProperty('INDICATOR_TARGET');
    }
  } catch (tErr) {
    console.log('⚠️ INDICATOR対象指標取得エラー（続行）: ' + tErr.message);
  }
  
  // ★v5.7 Layer 2: INDICATOR投稿に過去の指標実績を注入
  try {
    var indicatorPreview = formatIndicatorPreview_(keys.SPREADSHEET_ID);
    if (indicatorPreview) {
      text += indicatorPreview;
    }
  } catch (pErr) {
    console.log('⚠️ 指標予習注入スキップ: ' + pErr.message);
  }
  
  // ②-e INDICATOR投稿の方針（★v10.1: 本番前の復習メモ）
  text += '\n【INDICATOR投稿の方針】\n';
  text += '■ ★v10.1: 「本番前の復習メモ」として書け。読者がこの投稿を読んで発表に臨める内容にしろ。\n';
  text += '  ・①この指標は何か（1文で簡潔に）: 「CPIは物価の体温計。上がればインフレ→FRBは利下げしにくくなる」\n';
  text += '  ・②今回なぜ注目か（1文で文脈）: 「前回予想を上回って市場が荒れた。今回も上振れるかが焦点」\n';
  text += '  ・③見るべきポイント1つ: 「ヘッドラインより平均時給。FRBが一番気にしてるのは賃金インフレ」\n';
  text += '■ 上の「今日の経済指標」に記載された指標のみ解説せよ。記載がない指標を勝手に書くな。\n';
  text += '■ 「今日の経済指標」が「なし」の場合:\n';
  text += '  → 架空の指標発表を書くのは致命的な誤情報。「あと○分でCPI発表」等は絶対禁止。\n';
  text += '  → 代わりに通貨強弱データと市場ニュースを活用して、今日の値動きの解説に切り替えろ。\n';
  text += '  → または、来週の注目指標の予告に切り替えよ。\n';
  text += '■ 因果関係を明示する: 「CPIが高い＝物価上昇＝利下げ遠のく＝ドル買われやすい」\n';
  text += '■ 具体的な数値（前回値・予想値）は上記「今日の経済指標」に記載されたものだけ使え。記載がない数値を捏造するな。\n';
  text += '■ OK: 「前回は予想を上回って市場が大きく動いた。今回のポイントは平均時給の方ですね」\n';
  text += '■ NG: 「上振れの場合、ドル円は156円を目指す展開も想定されます」（無機質すぎ）\n';
  text += '■ NG: 「あと○分でCPI発表」（カレンダーに記載がない指標＝捏造）\n';
  text += '■ 「あと○分で発表」「まもなく発表」等の残り時間表現は禁止。承認までのタイムロスで不正確になるため。\n';
  text += '■ OK: 「本日9:30に豪州CPIが発表されます」（時刻指定）\n';
  text += '■ NG: 「あと24分で豪州CPI発表」（残り時間指定）\n';
  return text;
}


/**
 * ★v8.10: 週末系投稿の方針 + データ注入（Layer 3 + ②-f〜②-f3）
 * 対象: WEEKLY_REVIEW, WEEKLY_LEARNING, NEXT_WEEK, WEEKLY_HYPOTHESIS
 */
function buildWeekendPolicy_(postType, keys, rates) {
  var text = '';
  
  // ★v5.7 Layer 3: WEEKLY_REVIEW/WEEKLY_LEARNINGに今週の指標結果サマリーを注入
  if (postType === 'WEEKLY_REVIEW' || postType === 'WEEKLY_LEARNING') {
    try {
      var weeklySummary = formatWeeklyIndicatorSummary_(keys.SPREADSHEET_ID);
      if (weeklySummary) {
        text += weeklySummary;
      }
    } catch (wsErr) {
      console.log('⚠️ 週次サマリー注入スキップ: ' + wsErr.message);
    }
  }

  // ★v5.10: WEEKLY_REVIEWに週間レートトレンドを注入（論理矛盾防止）
  if (postType === 'WEEKLY_REVIEW') {
    try {
      var weeklyTrend = formatWeeklyRateTrend_(keys.SPREADSHEET_ID, rates);
      if (weeklyTrend) {
        text += weeklyTrend;
        console.log('📊 週間レートトレンド注入済み（日次OHLC版）');
      }
    } catch (wtErr) {
      console.log('⚠️ 週間トレンド注入スキップ: ' + wtErr.message);
    }
  }
  
  // ②-f 週末系投稿の方針（大衆心理・ストーリー重視）
  var weekendTypes = ['WEEKLY_REVIEW', 'WEEKLY_LEARNING', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
  if (weekendTypes.indexOf(postType) !== -1) {
    text += '\n【週末系投稿の方針】\n';
    text += '■ レートの羅列は禁止。「今週はこういうドラマがあった」とストーリーで語る。\n';
    text += '■ 大衆心理を必ず描写: 「今週、市場参加者はどんな気持ちだったか？」\n';
    text += '■ 例: 「今週は完全に指標待ちの一週間。みんな手を出したいけど出せない、そんなモヤモヤが漂っていた」\n';
    text += '■ 「」の個人見解はトレード判断ではなく、相場観や感想で。\n';
    text += '■ OK: 「嵐の前の静けさ。来週のCPIが号砲になるかもしれない」\n';
    text += '■ NG: 「今週は方向感が出にくい相場でした」（感想が薄い）\n';
    if (postType === 'WEEKLY_REVIEW') {
      text += '\n■ ★WEEKLY_REVIEW固有: 今週の仮説スコアカード\n';
      text += '  → 今週提示した仮説のうち、当たったもの・外れたものを正直に振り返れ。\n';
      text += '  → 数字の的中率ではなく「何を読み違えたか」「何が見えていたか」の質で語れ。\n';
      text += '  → OK: 「今週は停戦報道の楽観を疑った読みが当たった。でもECBのタカ派転換は完全に想定外だった」\n';
      text += '  → OK: 「正直、今週は読みがズレっぱなし。トランプの関税発言の影響を軽く見すぎた」\n';
    }
  }
  
  // ②-f2 来週展望系（NEXT_WEEK, WEEKLY_HYPOTHESIS）: カレンダー厳守
  if (postType === 'NEXT_WEEK' || postType === 'WEEKLY_HYPOTHESIS') {
    text += '\n【来週の指標に関する厳守事項】\n';
    text += '■ 上の「来週の経済指標」に記載された指標のみ言及せよ。\n';
    text += '■ 記載がない指標の日付・名称を勝手に作るな。これは誤情報であり信頼を失う致命的ミス。\n';
    text += '■ 指標の日付を並べ替えるな。カレンダーに「3/2 ISM」とあれば「3/2」と書け。勝手に3/4等に変更するのは誤情報。\n';
    text += '■ 発表時刻を勝手に付けるな。カレンダーに時刻がない場合は時刻を書くな。「00:00」等を捏造するな。\n';
    text += '■ カレンダーが「未登録」の場合は、具体的な指標名・日付に触れず「来週も経済指標が控えている」程度に留めよ。\n';
    text += '■ OK: 「来週は○/○に△△が発表予定」（カレンダーに記載あり）\n';
    text += '■ NG: 「2/27に米耐久財受注が〜」（カレンダーに記載なし＝捏造）\n';
    text += '■ NG: 「3/4 00:00 ISM」（カレンダーでは3/2＝日付の勝手な変更）\n';
  }

  // ②-f3 WEEKLY_LEARNING: 架空イベント創作禁止 ★v5.5.3
  if (postType === 'WEEKLY_LEARNING') {
    text += '\n【WEEKLY_LEARNING 厳守事項】\n';
    text += '■ 今週実際に起きたことだけを書け。架空の市場イベントを創作するな。\n';
    text += '■ 上の「今週発表済みの経済指標」に記載がない指標を「発表された」と書くのは捏造。絶対禁止。\n';
    text += '■ 要人発言（パウエル議長、ラガルド総裁等）もカレンダーに記載があるものだけ。架空の「議会証言」「声明」は捏造。\n';
    text += '■ 具体的な指標名・日付・要人名を書く場合は、必ずカレンダーに記載があるものだけ。\n';
    text += '■ 不確かなら指標名・要人名を書くな。「今週は値動きが激しかった」等の体感ベースで書け。\n';
    text += '■ 主題は「学び・気づき」。市場レポートではない。心理面・トレード判断の反省に集中しろ。\n';
    text += '■ OK: 「今週、急な値動きに焦って損切りが遅れた」（体験ベース）\n';
    text += '■ OK: 「PPIの結果を見て、自分のルール通り静観できた」（カレンダーにある指標）\n';
    text += '■ NG: 「金曜の雇用統計でドル円が急落した」（カレンダーにない指標＝捏造）\n';
    text += '■ NG: 「パウエル議長の議会証言で〜」（カレンダーにない要人発言＝捏造）\n';
    text += '\n【今週の失敗談・ミスを架空で創作するな（最重要）】\n';
    text += '■ コンパナは7年のFX経験者。「今週〇〇というミスをした」を架空で作るのは人格を傷つける。絶対禁止。\n';
    text += '■ 決めつけエントリー・損切りしない・感情的なトレード等の初歩的ミスを「今週やった」と書くな。\n';
    text += '■ 今週の失敗談を書く場合は、必ず事実ベース（「損切りが少し遅れた」等の軽微なもの）に限れ。\n';
    text += '■ 過去の教訓として語るのはOK: 「昔、FOMCで決めつけエントリーして痛い目を見たことがある」\n';
    text += '■ NG: 「今週のFOMCで決めつけでショートエントリーした」（架空の失敗談＝捏造）\n';
    text += '■ 今週の出来事として語れるのは「相場の動き」「指標の結果」「相場を見て感じたこと」のみ。\n';
    text += '■ トレードの失敗談は過去形・体験談として語れ。今週のことのように架空で語るな。\n';
    text += '■ 「しっかり損切りできた」「ルールを守れた」等のポジティブな今週の出来事はOK。\n';
  }

  return text;
}


/**
 * ★v8.10: RULE系投稿の方針（②-g + ②-h）
 * 対象: RULE_1, RULE_2, RULE_3, RULE_4
 */
function buildRulePolicy_(postType, isRuleType) {
  if (!isRuleType) return '';
  
  var text = '';
  
  // ②-g RULE系投稿の方針（心得・教訓が主体）★v5.5 ★v8.6: ニュース参照指示を削除（データ未注入との矛盾解消）
  text += '\n【RULE系投稿の方針（厳守）】\n';
  text += '■ この投稿は「トレーダーの心得・教訓」投稿。市場速報ではない。\n';
  text += '■ テーマに沿った教訓・経験談・心構えが主体。\n';
  text += '■ 架空のニュース・要人発言・経済指標は絶対に書くな。\n';
  text += '\n【根拠のない数値・事実の禁止（RULE系最重要）】\n';
  text += '■ 具体的な金利水準・レート値・経済指標の数値を書くな。\n';
  text += '  NG: 「2年債利回りは5%付近で膠着」「ドル円が158円台で推移」\n';
  text += '  OK: 「長期金利が上昇傾向にある」「ドル円が節目付近で動きにくい展開」\n';
  text += '■ 海外の研究データ・統計・論文の数値（例:「判断力が30%落ちる」）も根拠が確認できないため使うな。\n';
  text += '■ 体験談は「コンパナ自身の経験」として書け。客観的な統計・研究を装うな。\n';
  text += '  NG: 「研究によると疲労時の判断力は30%低下する」\n';
  text += '  OK: 「疲れてる時ほど謎エントリーしてしまう。自分の経験上これは本当」\n';

  // ②-h RULE_3専用: 投稿構造の明示（実践テクニック）v2
  if (postType === 'RULE_3') {
    text += '\n【RULE_3 投稿の構造（絵文字ブロック形式で書け）】\n';
    text += '通常のフォーマット（絵文字行 + →行 + 補足）を守りながら、以下の流れで3ブロック構成にしろ。\n';
    text += '\n';
    text += 'ブロック1（☕または✅）: 実用性を示すフック\n';
    text += '  絵文字行: 「これ知ってるだけで負けが減る」「地味だけど効果絶大」等の実用性ある1行\n';
    text += '  →行: テクニックの概要と、いつ使うかを「〇〇な時は〇〇する」の形で語る\n';
    text += '\n';
    text += 'ブロック2（📝または💡）: 本質（なぜそうするのか）\n';
    text += '  絵文字行: テクニックの核心を短く1行\n';
    text += '  →行: 「なぜそうするのか」の根拠・理由。やり方の説明ではなく根本を語る\n';
    text += '  補足行: 補足や実感があれば→なしで1行続ける\n';
    text += '\n';
    text += 'ブロック3（📕または📋）: 具体例（体験談）\n';
    text += '  絵文字行: 過去の体験談の場面を1行\n';
    text += '  →行: これで助かった / これを知らずに損した経験を実感ある言葉で\n';
    text += '\n';
    text += '締め: 絵文字・→なし。気づきや変化を1〜2行で。「〇〇で変わった」「〇〇だと気づいた」トーン\n';
    text += '\n【RULE_3 TC導線（自然に入る場合のみ）】\n';
    text += '・テーマが「過去検証」「勝率分析」「データ可視化」に関連する時だけ触れてよい\n';
    text += '・OK例: 「手法別の勝率を可視化してみたら、得意だと思ってた手法が実は一番負けてた」\n';
    text += '・NG例: 「Trading Completeの分析タブを使いましょう」（宣伝文句は絶対NG）\n';
  }
  
  return text;
}


// ==========================================================================
// ★v14.0 Phase 1 (2026-04-20): ホットトピック事前選定機構
// ==========================================================================
//
// 背景(TCAX_REFERENCE.md 事件8):
//   従来は「全データを Claude に投げて、その中から自由に選ばせる」設計だった。
//   結果として毎日似たような静的データ(ゴトー日・通貨強弱%の羅列)を選びがちで、
//   「今この瞬間の新鮮な材料」が投稿に入らず「面白くない」と評価された。
//
//   コンパナの本質: 「事実を収集する → コンパナ風にユーザーに有益に伝える」
//   対話時は人間が「今日のホットな材料」を選んで Claude に渡していた。
//   自動化でもこの「材料選定を先に機械的に実行する」を再現する。
//
// 設計思想:
//   1. 材料(ニュース・通貨強弱・ダウ理論・継続中事象)を構造化して Claude に渡す
//   2. Claude が「今最も語るべきトピック1つ」を選ぶ
//   3. 構造化JSON(headline / background / causalChain / mainPair / dowContext / nextView)を返す
//   4. これを投稿生成プロンプトの最優先ブロックに注入
//   5. 投稿生成 Claude は「選ぶタスク」を免除され「書くタスク」に集中できる
//
// API 呼び出し: +1回(約15-30秒追加・GAS 6分制限に注意)
// フォールバック: 失敗したら null を返し、呼び出し元は従来動作に戻る
//
// 呼び出し元: buildPrompt_ 内(fetchMarketNews_ の直後)
//
/**
 * 【v14.0 Phase 1】ホットトピック事前選定
 * 
 * @param {Object} params
 *   - marketNews:        string  - fetchMarketNews_ の結果(TOP5テキスト)
 *   - currencyStrength:  string  - 通貨強弱ランキングテキスト(例: "AUD(+3.48%) > GBP ...")
 *   - rateDirection:     string  - レート方向テキスト(例: "USD/JPY: 始値→現在 円安方向")
 *   - dowTheory:         string  - ダウ理論 SH/SL テキスト
 *   - ongoingEvents:     string  - 継続中重大事象テキスト(任意)
 *   - postType:          string  - 投稿タイプ('MORNING' 等・時間帯のヒント)
 *   - claudeApiKey:      string  - Claude API キー
 * 
 * @return {Object|null}
 *   成功: {
 *     headline:     string (20文字以内)
 *     background:   string (80文字程度)
 *     causalChain:  string (60文字程度)
 *     mainPair:     string (通貨ペア日本語名)
 *     dowContext:   string (40文字程度)
 *     nextView:     string (60文字程度)
 *     confidence:   'high' | 'medium' | 'low'
 *   }
 *   失敗: null (呼び出し元は従来動作にフォールバック)
 */
function selectHotTopic_(params) {
  params = params || {};
  var marketNews       = params.marketNews       || '';
  var currencyStrength = params.currencyStrength || '';
  var rateDirection    = params.rateDirection    || '';
  var dowTheory        = params.dowTheory        || '';
  var ongoingEvents    = params.ongoingEvents    || '';
  var postType         = params.postType         || 'MORNING';
  var claudeApiKey     = params.claudeApiKey     || '';
  
  if (!claudeApiKey) {
    console.log('⚠️ selectHotTopic_: CLAUDE_API_KEY 未指定 → スキップ');
    return null;
  }
  
  // ニュースがない場合は選定しても意味がない
  if (!marketNews || marketNews.length < 50) {
    console.log('⚠️ selectHotTopic_: ニュース情報が不足 → スキップ');
    return null;
  }
  
  var today = new Date();
  var dateStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy年M月d日(E)');
  
  // ===== プロンプト組み立て =====
  var prompt = '';
  prompt += '【タスク】\n';
  prompt += 'あなたはベテランFXアナリスト。今この瞬間、日本のFXトレーダーに\n';
  prompt += '「これを知らないと損する」と思わせる材料を1つ選び、構造化して返せ。\n\n';
  
  prompt += '【本日の日付】\n' + dateStr + '\n\n';
  prompt += '【投稿タイプ】' + postType + '(時間帯のヒント・絶対のルールではない)\n\n';
  
  prompt += '【判断材料1: 直近の市場ニュースTOP5】\n';
  prompt += marketNews + '\n\n';
  
  if (currencyStrength) {
    prompt += '【判断材料2: 現在の通貨強弱(実測値)】\n';
    prompt += currencyStrength + '\n\n';
  }
  
  if (rateDirection) {
    prompt += '【判断材料3: 本日の方向性】\n';
    prompt += rateDirection + '\n\n';
  }
  
  if (dowTheory) {
    prompt += '【判断材料4: ダウ理論(日足SH/SL)】\n';
    prompt += dowTheory + '\n\n';
  }
  
  if (ongoingEvents) {
    prompt += '【判断材料5: 継続中の重大事象】\n';
    prompt += ongoingEvents + '\n\n';
  }
  
  prompt += '【判断の軸】\n';
  prompt += '1. FXトレーダーが知らないと損する材料か?\n';
  prompt += '2. 今日の値動きの因果を説明できるか?\n';
  prompt += '3. 具体的な通貨ペアに影響があるか?\n';
  prompt += '4. 「次の見方」を示せるか?(このラインを抜けたら転換 など)\n\n';
  
  prompt += '【出力形式(必ずこのJSON形式で返せ・余計な説明は不要・コードブロック記法も不要)】\n';
  prompt += '{\n';
  prompt += '  "headline":    "20文字以内で簡潔に。キャッチーに",\n';
  prompt += '  "background":  "80文字程度。いつ何が起きたか・現状どう進行しているか",\n';
  prompt += '  "causalChain": "60文字程度。原因→経路→為替への影響の順",\n';
  prompt += '  "mainPair":    "通貨ペア日本語名(ドル円/豪ドル米ドル/ユーロドル等)",\n';
  prompt += '  "dowContext":  "40文字程度。日足のトレンド状況を具体値で",\n';
  prompt += '  "nextView":    "60文字程度。XX抜けたらYY形式で具体レベルを示す",\n';
  prompt += '  "confidence":  "high/medium/low(この材料の影響確度)"\n';
  prompt += '}\n\n';
  
  prompt += '【注意】\n';
  prompt += '- 毎日同じネタ(ゴトー日・通貨強弱%のみ)を選ぶな。新鮮なニュース由来の材料を優先\n';
  prompt += '- 静的データではなく、今この瞬間のホットな材料を選べ\n';
  prompt += '- トレーダーが「人より早く知りたい」情報を優先\n';
  prompt += '- JSON以外の文字(コードブロック、説明文、マークダウン)は一切出力するな\n';
  
  // ===== Claude API 呼び出し =====
  console.log('🎯 selectHotTopic_: ホットトピック選定中...');
  console.log('   プロンプト長: ' + prompt.length + '文字');
  
  var result;
  try {
    result = callClaudeApi_(prompt, claudeApiKey, {
      maxTokens: 1024,            // 構造化JSONなので少なめで十分
      maxRetries: 2,              // API回数節約
      logPrefix: 'ホットトピック選定',
      systemPrompt: 'あなたはFX市場の材料選定エキスパート。トレーダーが最も知りたい材料を1つ選び、指定されたJSON形式のみで返す。'
    });
  } catch (e) {
    console.log('⚠️ selectHotTopic_: API呼び出しエラー → null 返却: ' + e.message);
    return null;
  }
  
  if (!result || !result.text) {
    console.log('⚠️ selectHotTopic_: レスポンスが空 → null 返却');
    return null;
  }
  
  // ===== JSON パース(防御的) =====
  var rawText = result.text.trim();
  
  // コードブロック記法が混入している場合は除去
  rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  
  // JSON の先頭{から最後の}までを抽出(前後の説明文を除去)
  var firstBrace = rawText.indexOf('{');
  var lastBrace  = rawText.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    console.log('⚠️ selectHotTopic_: JSONブロックが見つからない → null 返却');
    console.log('   レスポンス先頭: ' + rawText.substring(0, 200));
    return null;
  }
  rawText = rawText.substring(firstBrace, lastBrace + 1);
  
  var parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    console.log('⚠️ selectHotTopic_: JSONパース失敗 → null 返却: ' + e.message);
    console.log('   パース試行対象: ' + rawText.substring(0, 300));
    return null;
  }
  
  // ===== 必須フィールド検証 =====
  var requiredFields = ['headline', 'background', 'causalChain', 'mainPair', 'dowContext', 'nextView'];
  for (var i = 0; i < requiredFields.length; i++) {
    var field = requiredFields[i];
    if (!parsed[field] || typeof parsed[field] !== 'string' || parsed[field].trim().length === 0) {
      console.log('⚠️ selectHotTopic_: 必須フィールド ' + field + ' が欠落/不正 → null 返却');
      return null;
    }
  }
  
  // confidence はデフォルト値補完
  if (!parsed.confidence || ['high', 'medium', 'low'].indexOf(parsed.confidence) === -1) {
    parsed.confidence = 'medium';
  }
  
  console.log('✅ selectHotTopic_: 選定成功');
  console.log('   ヘッドライン: ' + parsed.headline);
  console.log('   主役ペア: ' + parsed.mainPair);
  console.log('   確度: ' + parsed.confidence);
  
  return parsed;
}


/**
 * 【v14.0 Phase 1】ホットトピックをプロンプト用テキストに整形
 * 
 * selectHotTopic_ の戻り値を、投稿生成プロンプトへ注入する文字列に変換する。
 * 
 * @param {Object} hotTopic - selectHotTopic_ の戻り値
 * @return {string} プロンプト用テキスト
 */
function formatHotTopicForPrompt_(hotTopic) {
  if (!hotTopic) return '';
  
  var text = '';
  text += '【★今日書くべきトピック1つ(これを核にしろ・ここから逸脱禁止)】\n';
  text += 'ヘッドライン: ' + hotTopic.headline + '\n';
  text += '背景: ' + hotTopic.background + '\n';
  text += '因果チェーン: ' + hotTopic.causalChain + '\n';
  text += '今日の主役ペア: ' + hotTopic.mainPair + '\n';
  text += 'ダウ理論の文脈: ' + hotTopic.dowContext + '\n';
  text += '次の見方: ' + hotTopic.nextView + '\n\n';
  
  text += '【書く手順(この順番で構成しろ)】\n';
  text += '1. 冒頭1行: ヘッドラインをキャッチーに言い換え\n';
  text += '2. 背景を簡潔に説明(いつ何が起きたか・現状どう進行しているか)\n';
  text += '3. 因果チェーンで相場への波及を語る\n';
  text += '4. 主役ペアのダウ理論文脈を具体値で(「日足SH XX を超えたら」等)\n';
  text += '5. 次の見方を示す(具体レベル + 転換条件)\n\n';
  
  text += '※ このトピックを軸に書け。通貨強弱%の羅列や静的データ(ゴトー日のみ等)で投稿を埋めるな。\n';
  text += '※ MORNING/GOLDEN で仮説振り返りがある場合は、冒頭1ブロックで済ませてから本トピックへ。\n\n';
  
  return text;
}

