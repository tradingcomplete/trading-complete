/**
 * CompanaFXAutoPost - calendarManager.gs
 * 経済カレンダー取得・インポート
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 4）
 * 
 * 経済カレンダーの自動取得（Gemini+Grounding）と
 * 外為どっとコム等からの手動インポート機能を担当。
 * 
 * 外部呼び出し元:
 *   main.gs: importFromRawSheet（カスタムメニュー）
 *   promptBuilder.gs内のgetEconomicCalendar_から間接的に参照
 */

// ========================================
// 経済カレンダー シート作成 & 自動取得
// ========================================

/**
 * 「経済カレンダー」シートを作成する（初回のみ実行）
 * GASエディタから手動実行: setupEconomicCalendarSheet
 */
function setupEconomicCalendarSheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  var existing = ss.getSheetByName('経済カレンダー');
  if (existing) {
    console.log('⚠️ 「経済カレンダー」シートは既に存在します。');
    console.log('→ データを更新する場合は fetchEconomicCalendar() を実行してください。');
    return;
  }
  
  var sheet = ss.insertSheet('経済カレンダー');
  
  // ヘッダー
  var headers = ['日付', '時間(JST)', '国/地域', '指標名', '前回', '予想', '重要度', '備考'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // ヘッダーの書式設定
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#4a86c8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  
  // 列幅の設定
  sheet.setColumnWidth(1, 120); // 日付
  sheet.setColumnWidth(2, 90);  // 時間
  sheet.setColumnWidth(3, 80);  // 国/地域
  sheet.setColumnWidth(4, 250); // 指標名
  sheet.setColumnWidth(5, 80);  // 前回
  sheet.setColumnWidth(6, 80);  // 予想
  sheet.setColumnWidth(7, 60);  // 重要度
  sheet.setColumnWidth(8, 200); // 備考
  
  // 1行目を固定
  sheet.setFrozenRows(1);
  
  // 入力規則: G列（重要度）にプルダウン
  var importanceRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['高', '中', '低'], true)
    .build();
  sheet.getRange(2, 7, 100, 1).setDataValidation(importanceRule);
  
  console.log('✅ 「経済カレンダー」シートを作成しました');
  console.log('→ 次に fetchEconomicCalendar() を実行してデータを取得してください');
}

/**
 * ★v5.7: 経済カレンダーシートにI列（結果）・J列（判定）を追加する
 * 既存データは一切変更しない。ヘッダーと書式のみ追加。
 * GASエディタから手動実行: setupIndicatorResultColumns
 */

/**
 * ★v5.7: 経済カレンダーシートにI列（結果）・J列（判定）を追加する
 * 既存データは一切変更しない。ヘッダーと書式のみ追加。
 * GASエディタから手動実行: setupIndicatorResultColumns
 */
function setupIndicatorResultColumns() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('経済カレンダー');
  
  if (!sheet) {
    console.log('❌ 「経済カレンダー」シートが見つかりません');
    console.log('→ 先に setupEconomicCalendarSheet() を実行してください');
    return;
  }
  
  // 既にI列にヘッダーがあるかチェック
  var currentHeaders = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), 10)).getValues()[0];
  
  if (currentHeaders.length >= 9 && currentHeaders[8] === '結果') {
    console.log('⚠️ I列「結果」は既に存在します。スキップします。');
    return;
  }
  
  // I列（9列目）にヘッダー「結果」を追加
  sheet.getRange(1, 9).setValue('結果');
  sheet.getRange(1, 9).setBackground('#4a86c8');
  sheet.getRange(1, 9).setFontColor('#ffffff');
  sheet.getRange(1, 9).setFontWeight('bold');
  sheet.getRange(1, 9).setHorizontalAlignment('center');
  sheet.setColumnWidth(9, 100);
  
  // J列（10列目）にヘッダー「判定」を追加
  sheet.getRange(1, 10).setValue('判定');
  sheet.getRange(1, 10).setBackground('#4a86c8');
  sheet.getRange(1, 10).setFontColor('#ffffff');
  sheet.getRange(1, 10).setFontWeight('bold');
  sheet.getRange(1, 10).setHorizontalAlignment('center');
  sheet.setColumnWidth(10, 80);
  
  // J列（判定）にプルダウンを設定
  var lastRow = Math.max(sheet.getLastRow(), 100);
  var judgmentRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['上振れ', '下振れ', '一致'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 10, lastRow - 1, 1).setDataValidation(judgmentRule);
  
  console.log('✅ 経済カレンダーにI列（結果）・J列（判定）を追加しました');
  console.log('  A:日付 B:時間 C:国 D:指標名 E:前回 F:予想 G:重要度 H:備考 I:結果 J:判定');
  console.log('→ 次に testFetchIndicatorResults() でテスト実行してください');
}



function setupRawImportSheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  var existing = ss.getSheetByName('経済指標_貼り付け');
  if (existing) {
    console.log('⚠️ 「経済指標_貼り付け」シートは既に存在します。');
    console.log('→ データを貼り付けてから importFromRawSheet() を実行してください。');
    return;
  }
  
  var sheet = ss.insertSheet('経済指標_貼り付け');
  
  // 説明を記入
  sheet.getRange('A1').setValue('【使い方】このシートのA3セルから下に、外為どっとコムの経済指標カレンダーをコピー＆ペーストしてください');
  sheet.getRange('A1').setFontWeight('bold');
  sheet.getRange('A1').setFontColor('#d32f2f');
  sheet.getRange('A2').setValue('貼り付け後、GASエディタで importFromRawSheet を実行すると「経済カレンダー」シートに変換されます');
  sheet.getRange('A2').setFontColor('#666666');
  
  // 列幅
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(4, 60);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 100);
  sheet.setColumnWidth(7, 100);
  
  console.log('✅ 「経済指標_貼り付け」シートを作成しました');
  console.log('');
  console.log('【手順】');
  console.log('1. 外為どっとコム（https://www.gaitame.com/markets/calendar/）を開く');
  console.log('2. 表の部分を選択してコピー');
  console.log('3. 「経済指標_貼り付け」シートのA3セルに貼り付け');
  console.log('4. GASエディタで importFromRawSheet を実行');
}

/**
 * 「経済指標_貼り付け」シートのデータをパースして「経済カレンダー」に書き込む
 * GASエディタから手動実行: importFromRawSheet
 */

/**
 * 「経済指標_貼り付け」シートのデータをパースして「経済カレンダー」に書き込む
 * GASエディタから手動実行: importFromRawSheet
 */
function importFromRawSheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // 貼り付けシートの確認
  var rawSheet = ss.getSheetByName('経済指標_貼り付け');
  if (!rawSheet) {
    console.log('❌ 「経済指標_貼り付け」シートがありません。setupRawImportSheet() を先に実行してください。');
    return;
  }
  
  // 経済カレンダーシートの確認
  var calSheet = ss.getSheetByName('経済カレンダー');
  if (!calSheet) {
    setupEconomicCalendarSheet();
    calSheet = ss.getSheetByName('経済カレンダー');
  }
  
  // データ読み取り（A3から開始）
  var lastRow = rawSheet.getLastRow();
  if (lastRow < 3) {
    console.log('❌ データが貼り付けられていません。A3セルからデータを貼り付けてください。');
    return;
  }
  
  var lastCol = rawSheet.getLastColumn();
  if (lastCol < 1) lastCol = 9;
  var data = rawSheet.getRange(3, 1, lastRow - 2, Math.min(lastCol, 10)).getValues();
  
  console.log('=== 経済指標データ変換開始 ===');
  console.log('読み取り行数: ' + data.length);
  console.log('読み取り列数: ' + Math.min(lastCol, 10));
  
  // パース
  var now = new Date();
  var currentYear = now.getFullYear();
  var currentDate = '';
  var events = [];
  var skippedCountries = {};
  
  // 対象国マッピング
  var countryMap = {
    'アメリカ': '米国',
    '米国': '米国',
    '日本': '日本',
    'ユーロ': 'ユーロ圏',
    'イギリス': '英国',
    '英国': '英国',
    'オーストラリア': '豪州',
    '豪州': '豪州'
  };
  
  // 時刻パターン（HH:MM or H:MM、秒付きのHH:MM:SSにも対応）
  var timePattern = /^(\d{1,2}):(\d{2})(:\d{2})?$/;
  // 日付パターン（M/D(曜) or MM/DD(曜)）
  var datePattern = /^(\d{1,2})\/(\d{1,2})\s*[\(（].*[\)）]?/;
  // 数値パターン（前回値・予想値の判定用）
  var numericPattern = /[\d]/;
  
  var currentTime    = '';
  var currentCountry = null;
  var lastEventValid = false;

  for (var i = 0; i < data.length; i++) {
    var rawA = data[i][0];
    var rawB = data[i][1];
    var rawC = data[i][2];

    // 全セルを文字列に変換（Date型対策）
    var colA = (rawA instanceof Date)
      ? (rawA.getHours() + ':' + ('0' + rawA.getMinutes()).slice(-2))
      : String(rawA || '').trim();
    var colB = (rawB instanceof Date)
      ? (rawB.getHours() + ':' + ('0' + rawB.getMinutes()).slice(-2))
      : String(rawB || '').trim();
    var colC = String(rawC          || '').trim();
    var colD = String(data[i][3]    || '').trim();
    var colE = String(data[i][4]    || '').trim();
    var colF = String(data[i][5]    || '').trim();

    // 空行スキップ
    if (!colA && !colB && !colC) continue;

    // ヘッダー行スキップ
    if (colA === '日付') continue;

    // ① 日付行: A="3/9(月)" パターン
    var dateMatch = colA.match(datePattern);
    if (dateMatch) {
      var month = parseInt(dateMatch[1]);
      var day   = parseInt(dateMatch[2]);
      currentDate    = currentYear + '/' + ('0' + month).slice(-2) + '/' + ('0' + day).slice(-2);
      currentTime    = '';
      currentCountry = null;
      continue;
    }

    // ② 休場・祝日スキップ
    if (colA === '休場' || colB === '休場') continue;

    // ③ セパレータ行（旧形式）: B が Date型（時刻）かつ C に [国名] がある
    if (rawB instanceof Date && colC) {
      var rawCountry = colC.replace(/^[\[【\[［]/, '').replace(/[\]】\]］]$/, '');
      var mapped = countryMap[rawCountry];
      if (mapped) {
        currentTime    = colB;
        currentCountry = mapped;
      } else {
        currentTime    = colB;
        currentCountry = null;
        lastEventValid = false;
        skippedCountries[rawCountry] = (skippedCountries[rawCountry] || 0) + 1;
      }
      continue;
    }

    // ③-2 新形式: A が Date型（時刻）かつ B が国名、C が指標名
    //   A=DATE(時刻)  B=国名  C=指標名  D=空  E=前回  F=予想  G=結果
    if (rawA instanceof Date && colB && colC) {
      var rawCountry2 = colB.replace(/^[\[【\[［]/, '').replace(/[\]】\]］]$/, '');
      var mapped2 = countryMap[rawCountry2];
      if (mapped2) {
        currentTime    = colA; // A列の時刻文字列
        currentCountry = mapped2;
        // C列=指標名、E列=前回、F列=予想、G列=結果 として直接イベント登録
        var indicator2  = colC;
        var previous2   = String(data[i][4] || '').trim(); // E列
        var forecast2   = String(data[i][5] || '').trim(); // F列
        var result2     = String(data[i][6] || '').trim(); // G列
        var judgment2   = (forecast2 && result2) ? judgeDeviation_(forecast2, result2) : '';
        var importance2 = judgeImportance_(indicator2);
        events.push({
          date:       currentDate,
          time:       currentTime,
          country:    currentCountry,
          name:       indicator2,
          previous:   previous2,
          forecast:   forecast2,
          importance: importance2,
          note:       '',
          result:     result2,
          judgment:   judgment2
        });
        lastEventValid = true;
      } else {
        currentTime    = colA;
        currentCountry = null;
        lastEventValid = false;
        skippedCountries[rawCountry2] = (skippedCountries[rawCountry2] || 0) + 1;
      }
      continue;
    }

    // ④ 継続行: A が "(" または "（" で始まる（前回値の修正値行）
    //    A=修正前回値  B=予想  C=結果
    if (/^[（(]/.test(colA)) {
      if (events.length > 0 && lastEventValid) {
        var lastEv = events[events.length - 1];
        lastEv.previous = lastEv.previous + colA;
        if (!lastEv.forecast && colB) lastEv.forecast = colB;
        if (!lastEv.result   && colC) {
          lastEv.result = colC;
          if (lastEv.forecast && lastEv.result) {
            lastEv.judgment = judgeDeviation_(lastEv.forecast, lastEv.result);
          }
        }
      }
      continue;
    }

    // ⑤ 指標行: A が空、B が文字列（指標名）
    //    B=指標名  D=前回  E=予想  F=結果
    if (!colA && colB && !(rawB instanceof Date)) {
      if (!currentCountry || !currentDate) continue; // 対象外の国はスキップ

      var indicator = colB;
      var previous  = colD;
      var forecast  = colE;
      var result    = colF;
      var judgment  = (forecast && result) ? judgeDeviation_(forecast, result) : '';
      var importance = judgeImportance_(indicator);
      var note = '';

      // 24:00以上の時刻の注記
      var hourMatch = currentTime.match(/^(\d+):(\d+)/);
      if (hourMatch && parseInt(hourMatch[1]) >= 24) {
        note = '翌' + (parseInt(hourMatch[1]) - 24) + ':' + hourMatch[2];
      }

      events.push({
        date:       currentDate,
        time:       currentTime,
        country:    currentCountry,
        name:       indicator,
        previous:   previous,
        forecast:   forecast,
        importance: importance,
        note:       note,
        result:     result,
        judgment:   judgment
      });
      lastEventValid = true;
      continue;
    }

    // ⑥ それ以外はスキップ
  }

  // スキップされた国を表示
  var skippedList = [];
  for (var c in skippedCountries) {
    skippedList.push(c + '(' + skippedCountries[c] + '件)');
  }
  if (skippedList.length > 0) {
    console.log('🚫 対象外の国を除外: ' + skippedList.join(', '));
  }
  
  // 重複除去（日付+時刻+指標名が同一のデータ）
  var seen = {};
  var unique = [];
  for (var u = 0; u < events.length; u++) {
    var key = events[u].date + '_' + events[u].time + '_' + events[u].name;
    if (!seen[key]) {
      seen[key] = true;
      unique.push(events[u]);
    }
  }
  if (unique.length < events.length) {
    console.log('📌 重複を除去: ' + events.length + '件 → ' + unique.length + '件');
  }
  events = unique;
  
  if (events.length === 0) {
    console.log('⚠️ 対象データが0件でした。貼り付けデータを確認してください。');
    return;
  }
  
  // 経済カレンダーシートに書き込み
  // 既存データをクリア（I列・J列も含めて10列）
  if (calSheet.getLastRow() > 1) {
    var clearRows = calSheet.getLastRow() - 1;
    calSheet.getRange(2, 1, clearRows, 10).clearContent();
    calSheet.getRange(2, 1, clearRows, 10).setBackground(null);
  }
  
  var rows = [];
  for (var j = 0; j < events.length; j++) {
    var ev = events[j];
    var judgment = ev.judgment || '';
    rows.push([
      ev.date,       // A: 日付
      ev.time,       // B: 時間(JST)
      ev.country,    // C: 国/地域
      ev.name,       // D: 指標名
      ev.previous,   // E: 前回
      ev.forecast,   // F: 予想
      ev.importance, // G: 重要度
      ev.note,       // H: 備考
      ev.result,     // I: 結果
      judgment       // J: 判定
    ]);
  }
  
  calSheet.getRange(2, 1, rows.length, 10).setValues(rows);
  
  // 重要度「高」の行を黄色ハイライト
  for (var k = 0; k < rows.length; k++) {
    if (rows[k][6] === '高') {
      calSheet.getRange(k + 2, 1, 1, 10).setBackground('#fff9c4');
    }
  }
  
  // 日付列のフォーマット
  calSheet.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy/mm/dd');
  
  // 最終更新日時（H1に書く。J1はヘッダー「判定」のため上書きしない）
  var now2 = new Date();
  calSheet.getRange('H1').setValue('最終更新: ' + Utilities.formatDate(now2, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  calSheet.getRange('H1').setFontSize(9);
  calSheet.getRange('H1').setFontColor('#ffffff');
  
  console.log('');
  console.log('✅ 経済カレンダーに ' + rows.length + '件を書き込みました');
  
  // 貼り付けシートをクリア（ヘッダー2行は残す）
  if (rawSheet.getLastRow() > 2) {
    rawSheet.getRange(3, 1, rawSheet.getLastRow() - 2, rawSheet.getLastColumn()).clearContent();
  }
  console.log('🗑️ 貼り付けシートをクリアしました');
  console.log('');
  
  // 内容をログに表示
  console.log('=== 取得結果一覧 ===');
  var highCount = 0;
  var midCount = 0;
  for (var m = 0; m < rows.length; m++) {
    var line = rows[m][0] + ' ' + rows[m][1] + ' [' + rows[m][2] + '] ' + rows[m][3];
    if (rows[m][4] || rows[m][5]) {
      line += '（前回:' + (rows[m][4] || '-') + ' 予想:' + (rows[m][5] || '-') + '）';
    }
    if (rows[m][6] === '高') { line += ' ★'; highCount++; }
    else { midCount++; }
    console.log(line);
  }
  console.log('');
  console.log('重要度 高: ' + highCount + '件 / 中: ' + midCount + '件');
  
  // ★v6.7: インポート後にINDICATOR・結果取得トリガーを再設定
  // 5:00以降にインポートした場合でも重要指標のトリガーが確実に設定される
  var nowForTrigger = new Date();
  var dayForTrigger = nowForTrigger.getDay();
  if (dayForTrigger >= 1 && dayForTrigger <= 5) { // 平日のみ
    try {
      scheduleIndicatorTriggers_();   // INDICATOR投稿（発表30分前）
      scheduleResultFetchTriggers_(); // 結果取得（発表5分後）
      console.log('✅ トリガーを再設定しました');
    } catch (e) {
      console.log('⚠️ トリガー再設定エラー（続行）: ' + e.message);
    }
  }
}

/**
 * 指標名から重要度を自動判定する
 * @param {string} name - 指標名
 * @return {string} '高' or '中'
 */

/**
 * 指標名から重要度を自動判定する
 * @param {string} name - 指標名
 * @return {string} '高' or '中'
 */
function judgeImportance_(name) {
  // 全角→半角変換してマッチしやすくする
  var n = name.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
  var upper = n.toUpperCase();
  
  // 重要度「高」の指標
  var highPatterns = [
    'GDP', '国内総生産',
    'CPI', '消費者物価指数',
    '雇用統計', '非農業部門雇用者数', 'NFP',
    'FOMC', '連邦公開市場委員会',
    'PCE', '個人消費支出',
    '日銀', '金融政策決定会合',
    'BOE', 'イングランド銀行',
    'ECB', '欧州中央銀行',
    'RBA', '豪準備銀行', '豪中銀',
    'ISM製造業', 'ISM非製造業',
    '政策金利'
  ];
  
  for (var i = 0; i < highPatterns.length; i++) {
    if (upper.indexOf(highPatterns[i].toUpperCase()) !== -1) {
      return '高';
    }
  }
  
  return '中';
}

/**
 * Gemini + Google検索で経済指標カレンダーを自動取得してシートに書き込む
 * 今週と来週を別々に取得して合算する（精度向上のため分割）
 * GASエディタから手動実行: fetchEconomicCalendar
 * 週1回（日曜）実行推奨。トリガーで自動化も可能。
 */

/**
 * Gemini + Google検索で経済指標カレンダーを自動取得してシートに書き込む
 * 今週と来週を別々に取得して合算する（精度向上のため分割）
 * GASエディタから手動実行: fetchEconomicCalendar
 * 週1回（日曜）実行推奨。トリガーで自動化も可能。
 */
function fetchEconomicCalendar() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // シートがなければ作成
  var sheet = ss.getSheetByName('経済カレンダー');
  if (!sheet) {
    setupEconomicCalendarSheet();
    sheet = ss.getSheetByName('経済カレンダー');
  }
  
  // 日付計算
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dayOfWeek = today.getDay();
  
  // 今週月曜〜日曜
  var thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  var thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);
  
  // 来週月曜〜日曜
  var nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  var nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);
  
  console.log('=== 経済カレンダー取得（2週間分） ===');
  
  // --- 今週分を取得 ---
  var thisWeekFrom = Utilities.formatDate(thisMonday, 'Asia/Tokyo', 'yyyy年M月d日');
  var thisWeekTo = Utilities.formatDate(thisSunday, 'Asia/Tokyo', 'yyyy年M月d日');
  console.log('📅 今週: ' + thisWeekFrom + ' 〜 ' + thisWeekTo);
  
  var thisWeekEvents = fetchCalendarWeek_(keys, thisWeekFrom, thisWeekTo);
  console.log('  → 今週: ' + thisWeekEvents.length + '件');
  
  // レート制限回避
  Utilities.sleep(5000);
  
  // --- 来週分を取得 ---
  var nextWeekFrom = Utilities.formatDate(nextMonday, 'Asia/Tokyo', 'yyyy年M月d日');
  var nextWeekTo = Utilities.formatDate(nextSunday, 'Asia/Tokyo', 'yyyy年M月d日');
  console.log('📅 来週: ' + nextWeekFrom + ' 〜 ' + nextWeekTo);
  
  var nextWeekEvents = fetchCalendarWeek_(keys, nextWeekFrom, nextWeekTo);
  console.log('  → 来週: ' + nextWeekEvents.length + '件');
  
  // --- 合算してシートに書き込み ---
  var allEvents = thisWeekEvents.concat(nextWeekEvents);
  
  if (allEvents.length === 0) {
    console.log('⚠️ 経済指標データが0件でした。手動入力をお願いします。');
    console.log('確認先: https://www.gaitame.com/markets/calendar/');
    return;
  }
  
  // 既存データをクリア（ヘッダーは残す）
  if (sheet.getLastRow() > 1) {
    var clearRows = sheet.getLastRow() - 1;
    sheet.getRange(2, 1, clearRows, 8).clearContent();
    sheet.getRange(2, 1, clearRows, 8).setBackground(null);
  }
  
  // 対象国フィルタリング（プロンプトで指定しても漏れる場合のセーフティネット）
  var allowedCountries = ['米国', '日本', 'ユーロ圏', '英国'];
  var filtered = [];
  var skipped = [];
  for (var f = 0; f < allEvents.length; f++) {
    var country = String(allEvents[f].country || '').trim();
    if (allowedCountries.indexOf(country) !== -1) {
      filtered.push(allEvents[f]);
    } else {
      skipped.push(country + ': ' + (allEvents[f].name || ''));
    }
  }
  if (skipped.length > 0) {
    console.log('🚫 対象外の国を除外: ' + skipped.join(', '));
  }
  allEvents = filtered;
  
  if (allEvents.length === 0) {
    console.log('⚠️ フィルタ後のデータが0件です。手動入力をお願いします。');
    return;
  }
  
  // シートに書き込み
  var rows = [];
  for (var i = 0; i < allEvents.length; i++) {
    var ev = allEvents[i];
    rows.push([
      ev.date || '',
      ev.time || '',
      ev.country || '',
      ev.name || '',
      ev.previous || '',
      ev.forecast || '',
      ev.importance || '中',
      ev.note || ''
    ]);
  }
  
  sheet.getRange(2, 1, rows.length, 8).setValues(rows);
  
  // 重要度「高」の行を黄色ハイライト
  for (var j = 0; j < rows.length; j++) {
    if (rows[j][6] === '高') {
      sheet.getRange(j + 2, 1, 1, 8).setBackground('#fff9c4');
    }
  }
  
  // 日付列のフォーマット
  sheet.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy/mm/dd');
  
  // 最終更新日時を記録
  var lastUpdateCell = sheet.getRange('J1');
  lastUpdateCell.setValue('最終更新: ' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  lastUpdateCell.setFontSize(9);
  lastUpdateCell.setFontColor('#888888');
  
  console.log('✅ 経済カレンダーを更新: 合計 ' + rows.length + '件');
  
  // 内容をログに表示（目視確認用）
  console.log('');
  console.log('=== 取得結果一覧 ===');
  for (var k = 0; k < rows.length; k++) {
    var line = rows[k][0] + ' ' + rows[k][1] + ' [' + rows[k][2] + '] ' + rows[k][3];
    if (rows[k][6] === '高') line += ' ★';
    console.log(line);
  }
  console.log('');
  console.log('⚠️ 重要: AI生成のため誤りの可能性があります。');
  console.log('⚠️ 必ず以下で目視確認してください:');
  console.log('   https://www.gaitame.com/markets/calendar/');
  console.log('   間違いがあればシート上で直接修正してください。');
}

/**
 * 1週間分の経済指標をGemini + Google検索で取得する（内部関数）
 * @param {Object} keys - APIキー
 * @param {string} fromStr - 開始日（例: "2026年2月23日"）
 * @param {string} toStr - 終了日（例: "2026年3月1日"）
 * @return {Array} イベント配列
 */

/**
 * 1週間分の経済指標をGemini + Google検索で取得する（内部関数）
 * @param {Object} keys - APIキー
 * @param {string} fromStr - 開始日（例: "2026年2月23日"）
 * @param {string} toStr - 終了日（例: "2026年3月1日"）
 * @return {Array} イベント配列
 */
function fetchCalendarWeek_(keys, fromStr, toStr) {
  var yearStr = fromStr.substring(0, 4);
  
  var prompt = '以下の期間のFX関連の主要経済指標を、Google検索で調べてJSON形式で返してください。\n\n';
  prompt += '【対象期間】 ' + fromStr + '（月） 〜 ' + toStr + '（日）\n\n';
  prompt += '【対象国（この4地域のみ。他は一切含めるな）】\n';
  prompt += '・米国\n・日本\n・ユーロ圏（ドイツ単独の指標は含めるな。ユーロ圏全体のみ）\n・英国\n';
  prompt += '※NZ、豪州、カナダ、中国、ドイツ単独の指標は対象外。含めるな。\n\n';
  prompt += '【検索キーワード例】\n';
  prompt += '・「経済指標カレンダー ' + fromStr.replace('年', '/').replace('月', '/').replace('日', '') + '」\n';
  prompt += '・「FX 経済指標 今週 来週 ' + yearStr + '年」\n';
  prompt += '・site:fx.minkabu.jp 経済指標\n';
  prompt += '・site:gaitame.com 経済指標カレンダー\n\n';
  prompt += '【取得すべき指標の例（この期間に該当するものだけ探せ）】\n';
  prompt += '米国: 雇用統計(NFP)、CPI、コアCPI、PPI、PCEデフレーター、コアPCE、GDP(速報/改定/確報)、\n';
  prompt += '      小売売上高、ISM製造業/非製造業、新規失業保険申請件数、FOMC議事録/声明、\n';
  prompt += '      耐久財受注、住宅着工件数、中古住宅販売、消費者信頼感指数、ミシガン大消費者信頼感\n';
  prompt += '日本: 日銀金融政策決定会合、CPI(全国/東京)、GDP、機械受注、貿易収支\n';
  prompt += 'ユーロ圏: ECB政策金利、ユーロ圏CPI/HICP、PMI(製造業/サービス業)、ZEW景況感\n';
  prompt += '英国: BOE政策金利、CPI、雇用統計、小売売上高、PMI\n\n';
  prompt += '【出力形式】JSON配列のみ出力。説明文は一切不要。\n';
  prompt += '[\n';
  prompt += '  {"date":"' + yearStr + '/MM/DD","time":"HH:MM","country":"米国","name":"指標名（対象月）","previous":"前回値","forecast":"予想値","importance":"高or中","note":"備考"}\n';
  prompt += ']\n\n';
  prompt += '【ルール】\n';
  prompt += '・検索結果で確認できた指標のみ返せ。推測で作るな。\n';
  prompt += '・時間は日本時間(JST)。米国指標は夏時間なら21:30、冬時間なら22:30等。\n';
  prompt += '・前回値・予想値が不明なら空文字 "" にせよ。\n';
  prompt += '・countryの値は必ず「米国」「日本」「ユーロ圏」「英国」の4つのどれか。\n';
  prompt += '・重要度の基準:\n';
  prompt += '  高 = 雇用統計(NFP)、CPI、コアCPI、PCEデフレーター、GDP、FOMC声明/議事録、日銀会合、ECB/BOE政策金利\n';
  prompt += '  中 = PPI、小売売上高、ISM、住宅指標、耐久財受注、消費者信頼感、新規失業保険申請件数、PMI、ZEW、機械受注、貿易収支、東京CPI\n';
  prompt += '・最低でも5件以上は見つかるはず。1〜2件しか見つからない場合は検索を追加で試みよ。\n';
  prompt += '・[ で始めて ] で終えること。```json等は不要。\n';
  
  var url = GEMINI_API_URL + GEMINI_MODEL + ':generateContent?key=' + keys.GEMINI_API_KEY;
  
  var requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096
    },
    tools: [{ google_search: {} }]
  };
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
  
  var response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (e) {
    console.log('  ❌ API通信エラー: ' + e.message);
    return [];
  }
  
  var code = response.getResponseCode();
  if (code !== 200) {
    console.log('  ❌ Gemini API エラー (' + code + ')');
    return [];
  }
  
  var body = JSON.parse(response.getContentText());
  var rawText = extractTextFromResponse_(body);
  
  if (!rawText) {
    console.log('  ❌ Geminiからテキスト応答なし');
    return [];
  }
  
  // JSONパース
  var jsonText = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    var events = JSON.parse(jsonText);
    if (Array.isArray(events)) {
      return events;
    }
  } catch (e) {
    console.log('  ❌ JSONパースエラー: ' + e.message);
    console.log('  生テキスト（先頭200文字）: ' + jsonText.substring(0, 200));
  }
  
  return [];
}

