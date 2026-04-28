/**
 * CompanaFXAutoPost - promptSources.gs
 * プロンプト材料の収集(Sheets取得・カレンダー・学びログ・指標・仮説)
 *
 * 提供する関数:
 *   - getPostPrompt_:                 Sheetsから投稿プロンプトを取得
 *   - getTCOverview:                  TC概要を取得
 *   - getTradeStyle_:                 コンパナのトレードスタイルを取得
 *   - getReferenceSources_:           参考ソース一覧
 *   - getEconomicCalendar_:           経済カレンダー取得(scopeで今日/今週/来週等)
 *   - buildEveningMaterialHint_:      夕方投稿用の材料ヒント
 *   - getLearningLog_:                学びログ取得(postType別)
 *   - getQuestionCount_:              今日の問いかけ回数取得
 *   - incrementQuestionCount_:        問いかけ回数インクリメント
 *   - getUnreleasedIndicatorNames_:   未発表指標名取得
 *   - getHypothesisContext_:          仮説コンテキスト取得
 *
 * 履歴:
 *   v14.0 Phase R-2(2026-04-23): promptBuilder.gs(2505行) から独立ファイルへ分離
 */


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


// ===== TC概要をSheetsから取得（★Phase 1 選択肢A: 2026-04-21 圧縮版） =====
// 旧版(1,082字)を新版(約305字)に圧縮。-777字(-72%)
// キャラクターシート【TC導線】(トーン・OK/NG例)と連携し、
// ここでは今週のローテーション機能とコア指示のみに絞る
function getTCOverview() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('TC概要');
    
    // ★Phase 1 選択肢A: KV情報はコンセプトとURLのみに絞る
    //   他の項目(サービス名/ターゲット/核心の価値等)はキャラクターシート【ペルソナ】で既出
    var concept = '';
    var url = '';
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var k = String(data[i][0] || '').trim();
        var v = String(data[i][1] || '').trim();
        if (k === 'コンセプト' && v) concept = v;
        else if (k === 'URL' && v) url = v;
      }
    }
    
    // 8機能を定義(ローテーション対象・変更なし)
    var features = [
      'エントリー前チェックリスト(3つの根拠を書かないと保存できない関所機能)',
      'リスク自動判定(許容損失超過を赤警告・ロット適正値も自動計算)',
      '手法別勝率分析(どの手法が勝てているか/負けているか一目で分かる)',
      '月次カレンダー(日別損益を色分け表示・勝てる曜日が一目で分かる)',
      '相場ノート検索(過去のノートをキーワード検索・「去年の今頃」が瞬時に)',
      '期待値・PF計算(1トレードあたりいくら稼げるかを自動算出)',
      '経費管理・CSV出力(確定申告データが一発で出せる)',
      'バッジ機能(ルール遵守・リスク判定がカードにバッジ表示される)'
    ];
    
    // スクリプトプロパティで前回のインデックスを記録→順番に回す
    var props = PropertiesService.getScriptProperties();
    var lastIdx = parseInt(props.getProperty('TC_FEATURE_INDEX') || '0', 10);
    var nextIdx = (lastIdx + 1) % features.length;
    props.setProperty('TC_FEATURE_INDEX', String(nextIdx));
    
    // ★Phase 1 選択肢A: 統合版TC導線(旧版1,082字 → 新版約305字)
    var text = '\n\n【TC導線(今週紹介する機能・自然に織り込め)】\n';
    if (concept) text += 'TCのコンセプト: ' + concept + '\n';
    if (url) text += 'URL: ' + url + '\n';
    text += '★今回紹介する機能: ' + features[nextIdx] + '\n\n';
    text += '入れ方(キャラクターシート【TC導線】のルールも参照):\n';
    text += '・主題は市場情報や心得。TC言及は脇役として自然に添える(投稿の20%以下・週1〜2回)\n';
    text += '・★印の機能を具体的に触れる。宣伝感厳禁\n';
    text += '・OK例: 「手法別の勝率を分析タブで見たら、逆張りの勝率が20%台だった。封印したら収支が改善」\n';
    text += '・NG例: 「ぜひ使ってください」「記録が大事」(直接宣伝・抽象論はNG)\n';
    
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

