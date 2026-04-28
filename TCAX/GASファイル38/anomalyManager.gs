/**
 * CompanaFXAutoPost - anomalyManager.gs
 * アノマリー（カレンダー要因）の自動判定 + プロンプト/ファクトチェック注入
 * 
 * v8.15: 新規作成（Phase 1）
 * ★v8.16: 祝日データ不足の自動検知+メール通知機能
 * 
 * 8カテゴリ・20種類のアノマリーをコードで自動判定し、
 * 投稿の仮説精度と品質を向上させる。
 * 
 * カテゴリ:
 *   1. ゴトー日（仲値ドル買い）
 *   2. 月末・四半期末・年度末（リバランス/リパトリ）
 *   3. 週末金曜（ポジション調整）
 *   4. 海外祝祭日（薄商い）
 *   5. 夏枯れ（8月流動性低下）
 *   6. SQ日（先物オプション清算）
 *   7. 中銀会合前後（様子見ムード）
 *   8. 月別傾向（季節性）
 * 
 * 呼び出す外部関数:
 *   config.gs: JAPAN_HOLIDAYS（祝日配列）
 *   calendarManager.gs: getEconomicCalendar_（中銀会合判定用）
 *   sheetsManager.gs: SpreadsheetApp（アノマリーシート読み取り）
 * 
 * 設計の鉄則:
 *   - アノマリーは「傾向」であり「予測」ではない。断定させない
 *   - ファンダ > アノマリー。両方を材料として渡しAIに判断させる
 *   - 該当0件なら注入しない。3件以上なら重要度順に2件まで
 */


// ========================================
// メイン: 今日のアノマリーを取得
// ========================================

/**
 * 指定日（デフォルト: 今日）に該当するアノマリーを全て返す
 * 
 * @param {Date} [targetDate] - 判定対象日（省略時は今日）
 * @param {string} [scope] - 'today'(デフォルト) / 'next_week'(来週月〜金)
 * @return {Array} アノマリーオブジェクトの配列
 *   各要素: { id, category, name, impact, pairs, timeZone, confidence, usage }
 */
function getTodayAnomalies_(targetDate, scope) {
  var now = targetDate || new Date();
  var results = [];
  
  // ★v8.16: 祝日データの年カバレッジチェック（年1回メール通知）
  checkHolidayDataCoverage_(now);
  
  // scope='next_week'の場合、来週月〜金の全日を走査
  if (scope === 'next_week') {
    return getNextWeekAnomalies_(now);
  }
  
  var month = now.getMonth() + 1; // 1-12
  var day = now.getDate();
  var dow = now.getDay(); // 0=日, 1=月, ..., 6=土
  var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  console.log('📅 アノマリー判定: ' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd（E）'));
  
  // ===== カテゴリ1: ゴトー日 =====
  var gotoResult = checkGotoDay_(now, day, dow);
  if (gotoResult) results.push(gotoResult);
  
  // ===== カテゴリ2: 月末・四半期末・年度末 =====
  if (isMonthEndPeriod_(now)) {
    results.push(buildAnomaly_('MONTH_END', '月末リバランス', 'month_end'));
  }
  if (isQuarterEnd_(now, month)) {
    results.push(buildAnomaly_('QUARTER_END', '四半期末リバランス', 'quarter_end'));
  }
  if (isFiscalYearEnd_(now, month, day)) {
    results.push(buildAnomaly_('FISCAL_YEAR_END', '日本の年度末リパトリ', 'fiscal_year_end'));
  }
  if (isFiscalYearStart_(month, day)) {
    results.push(buildAnomaly_('FISCAL_YEAR_START', '日本の新年度', 'fiscal_year_start'));
  }
  
  // ===== カテゴリ3: 週末金曜 =====
  if (dow === 5) {
    results.push(buildAnomaly_('FRIDAY_REBALANCE', '金曜リバランス', 'friday'));
  }
  
  // ===== カテゴリ4: 海外祝祭日 =====
  var holidayResult = checkHolidayPeriod_(now, month, day);
  if (holidayResult) results.push(holidayResult);
  
  // ===== カテゴリ5: 夏枯れ =====
  if (month === 8) {
    results.push(buildAnomaly_('SUMMER_LULL', '夏枯れ', 'summer'));
  }
  
  // ===== カテゴリ6: SQ日 =====
  var sqResult = checkSQDay_(now, month, dow, day);
  if (sqResult) results.push(sqResult);
  
  // ===== カテゴリ7: 中銀会合前日 =====
  var cbResults = checkPreCentralBank_(now);
  for (var i = 0; i < cbResults.length; i++) {
    results.push(cbResults[i]);
  }
  
  // ===== カテゴリ8: 月別傾向 =====
  var monthlyResult = getMonthlyTendency_(month);
  if (monthlyResult) results.push(monthlyResult);
  
  if (results.length > 0) {
    console.log('📅 該当アノマリー: ' + results.length + '件');
    for (var j = 0; j < results.length; j++) {
      console.log('  ' + results[j].name);
    }
  } else {
    console.log('📅 該当アノマリー: なし');
  }
  
  return results;
}


/**
 * 来週月〜金のアノマリーを一括取得（NEXT_WEEK/WEEKLY_HYPOTHESIS用）
 */
function getNextWeekAnomalies_(now) {
  var results = [];
  var seen = {}; // 重複除去用
  
  // 来週月曜を計算
  var dow = now.getDay();
  var daysToMonday = (dow === 0) ? 1 : (8 - dow);
  var monday = new Date(now.getTime() + daysToMonday * 86400000);
  
  for (var d = 0; d < 5; d++) {
    var target = new Date(monday.getTime() + d * 86400000);
    var dayAnomalies = getTodayAnomalies_(target);
    
    for (var i = 0; i < dayAnomalies.length; i++) {
      var a = dayAnomalies[i];
      var key = a.id;
      // 月別傾向は1回だけ
      if (a.category === '月別傾向' && seen[a.id]) continue;
      // 金曜リバランスは1回だけ
      if (a.id === 'FRIDAY_REBALANCE' && seen[a.id]) continue;
      
      if (!seen[key]) {
        seen[key] = true;
        // 日付情報を付加
        a.date = Utilities.formatDate(target, 'Asia/Tokyo', 'M/d（E）');
        results.push(a);
      }
    }
  }
  
  return results;
}


// ========================================
// カテゴリ1: ゴトー日判定
// ========================================

/**
 * ゴトー日チェック（営業日補正あり）
 * 5, 10, 15, 20, 25日 + 月末が営業日なら当日、休日なら直前営業日
 */
function checkGotoDay_(now, day, dow) {
  var gotoDays = [5, 10, 15, 20, 25];
  
  // 月末ゴトー日（月の最終営業日）
  var lastBizDay = getLastBusinessDayOfMonth_(now);
  var lastBizDate = lastBizDay.getDate();
  
  // 今日が通常ゴトー日かチェック
  for (var i = 0; i < gotoDays.length; i++) {
    var gotoDate = gotoDays[i];
    var adjusted = adjustToBusinessDay_(now, gotoDate);
    if (adjusted && adjusted.getDate() === day && adjusted.getMonth() === now.getMonth()) {
      var label = (day === lastBizDate) ? 'ゴトー日（' + gotoDate + '日・月末）' : 'ゴトー日（' + gotoDate + '日）';
      return buildAnomaly_(
        'GOTO_' + gotoDate,
        label,
        'goto'
      );
    }
  }
  
  // 月末ゴトー日（25日のゴトー日とは別に、月末営業日もゴトー日扱い）
  if (day === lastBizDate && gotoDays.indexOf(day) === -1) {
    return buildAnomaly_('GOTO_EOM', 'ゴトー日（月末）', 'goto');
  }
  
  return null;
}


/**
 * 指定日が営業日ならその日、休日なら直前営業日を返す
 */
function adjustToBusinessDay_(baseDate, targetDay) {
  var year = baseDate.getFullYear();
  var month = baseDate.getMonth();
  var target = new Date(year, month, targetDay);
  
  // 月を超えた場合はnull
  if (target.getMonth() !== month) return null;
  
  // 営業日になるまで前日に戻す
  var maxRetry = 7;
  while (!isBusinessDay_(target) && maxRetry > 0) {
    target = new Date(target.getTime() - 86400000);
    maxRetry--;
  }
  
  return target;
}


// ========================================
// カテゴリ2: 月末・四半期末・年度末
// ========================================

/**
 * 月末リバランス期間（最終営業日とその前営業日）
 */
function isMonthEndPeriod_(now) {
  var lastBiz = getLastBusinessDayOfMonth_(now);
  var lastBizDate = lastBiz.getDate();
  var day = now.getDate();
  
  // 最終営業日 or その前営業日
  if (day === lastBizDate) return true;
  
  // 前営業日を計算
  var prevBiz = new Date(lastBiz.getTime() - 86400000);
  var maxRetry = 5;
  while (!isBusinessDay_(prevBiz) && maxRetry > 0) {
    prevBiz = new Date(prevBiz.getTime() - 86400000);
    maxRetry--;
  }
  if (day === prevBiz.getDate() && now.getMonth() === prevBiz.getMonth()) return true;
  
  return false;
}

/**
 * 四半期末（3/6/9/12月の最終5営業日）
 */
function isQuarterEnd_(now, month) {
  if ([3, 6, 9, 12].indexOf(month) === -1) return false;
  
  var lastBiz = getLastBusinessDayOfMonth_(now);
  // 最終営業日から5営業日前まで
  var cursor = new Date(lastBiz.getTime());
  for (var count = 0; count < 5; count++) {
    if (now.getDate() === cursor.getDate() && now.getMonth() === cursor.getMonth()) return true;
    // 前の営業日に戻す
    cursor = new Date(cursor.getTime() - 86400000);
    var retry = 5;
    while (!isBusinessDay_(cursor) && retry > 0) {
      cursor = new Date(cursor.getTime() - 86400000);
      retry--;
    }
  }
  return false;
}

/**
 * 日本の年度末（3月25日〜31日の営業日）
 */
function isFiscalYearEnd_(now, month, day) {
  if (month !== 3) return false;
  return day >= 25 && isBusinessDay_(now);
}

/**
 * 日本の新年度（4月第1〜2週）
 */
function isFiscalYearStart_(month, day) {
  if (month !== 4) return false;
  return day <= 14;
}


// ========================================
// カテゴリ4: 海外祝祭日
// ========================================

/**
 * 祝祭日期間チェック
 */
function checkHolidayPeriod_(now, month, day) {
  var year = now.getFullYear();
  
  // イースター（聖金曜〜翌月曜）
  var easter = calculateEasterDate_(year);
  var goodFriday = new Date(easter.getTime() - 2 * 86400000);
  var easterMonday = new Date(easter.getTime() + 1 * 86400000);
  if (now >= goodFriday && now <= easterMonday) {
    return buildAnomaly_('EASTER', 'イースター休暇', 'easter');
  }
  // イースター前週（警戒期間）
  var easterWeekStart = new Date(goodFriday.getTime() - 3 * 86400000);
  if (now >= easterWeekStart && now < goodFriday) {
    return buildAnomaly_('EASTER', 'イースター前（薄商い警戒）', 'easter');
  }
  
  // 感謝祭（11月第4木曜 + 翌金曜）
  if (month === 11) {
    var thanksgiving = getNthDayOfWeek_(year, 10, 4, 4); // 11月(0-indexed=10)の第4木曜(4)
    var blackFriday = new Date(thanksgiving.getTime() + 86400000);
    if (day === thanksgiving.getDate() || day === blackFriday.getDate()) {
      return buildAnomaly_('THANKSGIVING', '感謝祭（米市場休場）', 'thanksgiving');
    }
  }
  
  // クリスマス（12月24〜26日）
  if (month === 12 && day >= 23 && day <= 26) {
    return buildAnomaly_('CHRISTMAS', 'クリスマス休暇', 'christmas');
  }
  // クリスマスラリー期間（12月27日〜31日）
  if (month === 12 && day >= 27) {
    return buildAnomaly_('CHRISTMAS', 'クリスマスラリー期間', 'christmas');
  }
  
  // 年末年始（12月29日〜1月3日）
  if ((month === 12 && day >= 29) || (month === 1 && day <= 3)) {
    return buildAnomaly_('NEW_YEAR', '年末年始（薄商い・フラッシュクラッシュ警戒）', 'new_year');
  }
  
  return null;
}


/**
 * イースター日付算出（Anonymous Gregorian algorithm）
 * @param {number} year - 西暦年
 * @return {Date} イースター日曜日の日付
 */
function calculateEasterDate_(year) {
  var a = year % 19;
  var b = Math.floor(year / 100);
  var c = year % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  var day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}


// ========================================
// カテゴリ6: SQ日
// ========================================

/**
 * SQ日チェック（第2金曜）
 */
function checkSQDay_(now, month, dow, day) {
  if (dow !== 5) return null; // 金曜日のみ
  
  var secondFriday = getNthDayOfWeek_(now.getFullYear(), now.getMonth(), 2, 5);
  if (day !== secondFriday.getDate()) return null;
  
  // メジャーSQ（3/6/9/12月）
  if ([3, 6, 9, 12].indexOf(month) !== -1) {
    return buildAnomaly_('MAJOR_SQ', 'メジャーSQ（先物・オプション同時清算）', 'major_sq');
  }
  
  return buildAnomaly_('MINI_SQ', 'ミニSQ（先物清算日）', 'mini_sq');
}


// ========================================
// カテゴリ7: 中銀会合前日
// ========================================

/**
 * 中銀会合前日チェック（経済カレンダーシートから検出）
 */
function checkPreCentralBank_(now) {
  var results = [];
  
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet || sheet.getLastRow() < 2) return results;
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    var tomorrow = new Date(now.getTime() + 86400000);
    var tomorrowStr = Utilities.formatDate(tomorrow, 'Asia/Tokyo', 'yyyy-MM-dd');
    
    // FOMC/日銀/ECBのキーワード
    var cbKeywords = [
      { keywords: ['FOMC', '政策金利（米）', 'FRB'], id: 'PRE_FOMC', name: 'FOMC前日（様子見ムード）' },
      { keywords: ['日銀', 'BOJ', '金融政策決定会合'], id: 'PRE_BOJ', name: '日銀会合前日（円ボラ警戒）' },
      { keywords: ['ECB', '欧州中銀'], id: 'PRE_ECB', name: 'ECB会合前日（ユーロボラ警戒）' }
    ];
    
    for (var i = 0; i < data.length; i++) {
      var eventDate = '';
      try {
        eventDate = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy-MM-dd');
      } catch (e) { continue; }
      
      if (eventDate !== tomorrowStr) continue;
      
      var eventName = String(data[i][3] || '');
      for (var k = 0; k < cbKeywords.length; k++) {
        var cb = cbKeywords[k];
        for (var m = 0; m < cb.keywords.length; m++) {
          if (eventName.indexOf(cb.keywords[m]) !== -1) {
            results.push(buildAnomaly_(cb.id, cb.name, 'central_bank'));
            break;
          }
        }
      }
    }
  } catch (e) {
    console.log('⚠️ 中銀会合チェックエラー: ' + e.message);
  }
  
  return results;
}


// ========================================
// カテゴリ8: 月別傾向
// ========================================

/**
 * 月別傾向を返す
 */
function getMonthlyTendency_(month) {
  var tendencies = {
    1: { id: 'JANUARY_EFFECT', name: '1月効果', type: 'january' },
    5: { id: 'SELL_IN_MAY', name: 'セルインメイ', type: 'sell_in_may' }
  };
  
  if (tendencies[month]) {
    var t = tendencies[month];
    return buildAnomaly_(t.id, t.name, t.type);
  }
  return null;
}


// ========================================
// ユーティリティ
// ========================================

/**
 * 営業日判定（土日 + 日本の祝日）
 */
function isBusinessDay_(date) {
  var dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  
  // 祝日チェック（config.gsのJAPAN_HOLIDAYS配列）
  if (typeof JAPAN_HOLIDAYS !== 'undefined') {
    var dateStr = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
    for (var i = 0; i < JAPAN_HOLIDAYS.length; i++) {
      if (JAPAN_HOLIDAYS[i] === dateStr) return false;
    }
  }
  
  return true;
}

/**
 * 月の最終営業日を取得
 */
function getLastBusinessDayOfMonth_(date) {
  var year = date.getFullYear();
  var month = date.getMonth();
  // 翌月1日の前日 = 月末
  var lastDay = new Date(year, month + 1, 0);
  
  var retry = 7;
  while (!isBusinessDay_(lastDay) && retry > 0) {
    lastDay = new Date(lastDay.getTime() - 86400000);
    retry--;
  }
  return lastDay;
}

/**
 * N番目の特定曜日を取得（例: 第2金曜日）
 * @param {number} year - 西暦年
 * @param {number} month - 月（0-indexed）
 * @param {number} nth - 第N（1〜5）
 * @param {number} dayOfWeek - 曜日（0=日, 5=金）
 */
function getNthDayOfWeek_(year, month, nth, dayOfWeek) {
  var first = new Date(year, month, 1);
  var firstDow = first.getDay();
  var diff = (dayOfWeek - firstDow + 7) % 7;
  var day = 1 + diff + (nth - 1) * 7;
  return new Date(year, month, day);
}


// ========================================
// アノマリーオブジェクト構築
// ========================================

/**
 * アノマリーオブジェクトを構築（シートから説明文を取得）
 */
function buildAnomaly_(id, name, type) {
  // シートからマスターデータを取得（キャッシュ活用）
  var master = getAnomalyMaster_();
  var detail = master[id] || {};
  
  return {
    id: id,
    category: detail.category || '',
    name: name,
    impact: detail.impact || '',
    pairs: detail.pairs || '',
    timeZone: detail.timeZone || '',
    confidence: detail.confidence || '中',
    usage: detail.usage || ''
  };
}

/**
 * アノマリーシートのマスターデータをキャッシュ付きで取得
 */
var anomalyMasterCache_ = null;

function getAnomalyMaster_() {
  if (anomalyMasterCache_) return anomalyMasterCache_;
  
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('アノマリー');
    
    if (!sheet || sheet.getLastRow() < 2) {
      console.log('⚠️ アノマリーシートが見つかりません（デフォルト値を使用）');
      anomalyMasterCache_ = {};
      return anomalyMasterCache_;
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    var master = {};
    
    for (var i = 0; i < data.length; i++) {
      var id = String(data[i][0]).trim();
      if (!id) continue;
      
      // I列（有効フラグ）がFALSEなら無視
      if (data[i][8] === false || String(data[i][8]).toUpperCase() === 'FALSE') continue;
      
      master[id] = {
        category: String(data[i][1] || ''),
        name: String(data[i][2] || ''),
        impact: String(data[i][3] || ''),
        pairs: String(data[i][4] || ''),
        timeZone: String(data[i][5] || ''),
        confidence: String(data[i][6] || '中'),
        usage: String(data[i][7] || '')
      };
    }
    
    anomalyMasterCache_ = master;
    return master;
  } catch (e) {
    console.log('⚠️ アノマリーマスター取得エラー: ' + e.message);
    anomalyMasterCache_ = {};
    return anomalyMasterCache_;
  }
}


// ========================================
// プロンプト注入用テキスト整形
// ========================================

/**
 * プロンプト注入用にアノマリー情報を整形する
 * 
 * @param {Array} anomalies - getTodayAnomalies_の戻り値
 * @param {string} postType - 投稿タイプ
 * @return {string} プロンプトに追加するテキスト（該当なしなら空文字）
 */
function formatAnomalyForPrompt_(anomalies, postType) {
  if (!anomalies || anomalies.length === 0) return '';
  
  // RULE系・WEEKLY_LEARNINGには注入しない
  var skipTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'WEEKLY_LEARNING'];
  if (skipTypes.indexOf(postType) !== -1) return '';
  
  // 3件以上なら重要度順に2件まで
  var selected = anomalies;
  if (anomalies.length > 2) {
    // 信頼度「高」を優先
    selected = anomalies.sort(function(a, b) {
      var order = { '高': 0, '中': 1, '低': 2 };
      return (order[a.confidence] || 1) - (order[b.confidence] || 1);
    }).slice(0, 2);
  }
  
  var text = '\n\n【📅 本日のアノマリー（カレンダー要因）】\n';
  text += '※値動きの背景にカレンダー要因がある場合、ファンダだけで説明するな。両方を仮説の材料にせよ。\n';
  text += '※アノマリーは「傾向」であり「確実」ではない。「〜しやすい傾向」「〜が意識される」で書け。「〜だから上がる」はNG。\n\n';
  
  for (var i = 0; i < selected.length; i++) {
    var a = selected[i];
    text += '■ ' + a.name;
    if (a.date) text += '（' + a.date + '）'; // 来週アノマリーの場合
    text += '\n';
    if (a.impact) text += '  影響: ' + a.impact + '\n';
    if (a.pairs) text += '  主な通貨ペア: ' + a.pairs + '\n';
    if (a.timeZone) text += '  時間帯: ' + a.timeZone + '\n';
    if (a.usage) text += '  投稿での使い方: ' + a.usage + '\n';
    text += '\n';
  }
  
  return text;
}


/**
 * ファクトチェック用にアノマリー情報を整形する
 * 
 * @param {Array} anomalies - getTodayAnomalies_の戻り値
 * @return {string} ファクトチェックに追加するテキスト（該当なしなら空文字）
 */
function formatAnomalyForFactCheck_(anomalies) {
  if (!anomalies || anomalies.length === 0) return '';
  
  var text = '【確定データN: 本日のアノマリー（カレンダー要因）】\n';
  text += '本日は以下のカレンダー要因が該当します:\n';
  
  for (var i = 0; i < anomalies.length; i++) {
    var a = anomalies[i];
    text += '・' + a.name;
    if (a.impact) text += ' → ' + a.impact;
    text += '\n';
  }
  
  text += '※投稿がカレンダー要因を完全に無視し、ファンダだけで値動きを説明している場合、\n';
  text += '  ⚠️「カレンダー要因（' + anomalies[0].name + '等）も考慮すべき」と指摘せよ。\n';
  text += '※アノマリーを「確実に起こる」と断定している場合も⚠️。あくまで「傾向」である。\n\n';
  
  return text;
}


// ========================================
// ★v8.16: 祝日データ不足の自動検知+メール通知
// ========================================

/**
 * JAPAN_HOLIDAYS配列に今年のデータが含まれているかチェック。
 * 含まれていない場合、年1回だけメールで通知する。
 * 
 * ScriptPropertiesの 'HOLIDAY_NOTIFIED_YEAR' で通知済み年を管理。
 * → 同じ年に何度も通知が飛ばないようにする。
 */
function checkHolidayDataCoverage_(now) {
  try {
    var currentYear = String(now.getFullYear());
    
    // 既に今年分の通知済みならスキップ
    var props = PropertiesService.getScriptProperties();
    var notifiedYear = props.getProperty('HOLIDAY_NOTIFIED_YEAR') || '';
    if (notifiedYear === currentYear) return;
    
    // JAPAN_HOLIDAYSに今年のデータがあるかチェック
    if (typeof JAPAN_HOLIDAYS === 'undefined') {
      console.log('⚠️ JAPAN_HOLIDAYS未定義');
      return;
    }
    
    var hasCurrentYear = false;
    var prefix = currentYear + '-';
    for (var i = 0; i < JAPAN_HOLIDAYS.length; i++) {
      if (JAPAN_HOLIDAYS[i].indexOf(prefix) === 0) {
        hasCurrentYear = true;
        break;
      }
    }
    
    if (hasCurrentYear) return; // 今年のデータあり → 問題なし
    
    // ===== 今年のデータがない → メール通知 =====
    console.log('🚨 JAPAN_HOLIDAYSに' + currentYear + '年のデータがありません！');
    console.log('   → config.gsの JAPAN_HOLIDAYS配列に' + currentYear + '年の祝日を追加してください');
    
    var recipientEmail = Session.getEffectiveUser().getEmail();
    if (!recipientEmail) {
      console.log('⚠️ メールアドレス取得不可 → ログ出力のみ');
      props.setProperty('HOLIDAY_NOTIFIED_YEAR', currentYear);
      return;
    }
    
    var subject = '【T-CAX】祝日データ更新が必要です（' + currentYear + '年）';
    var body = 'T-CAXアノマリー機能からの通知です。\n\n'
      + 'config.gs の JAPAN_HOLIDAYS 配列に ' + currentYear + '年の祝日データがありません。\n\n'
      + 'ゴトー日の営業日判定が正しく動作しない可能性があります。\n\n'
      + '【対応方法】\n'
      + '1. GASエディタで config.gs を開く\n'
      + '2. JAPAN_HOLIDAYS 配列に ' + currentYear + '年の祝日を追加\n'
      + '   （内閣府「国民の祝日」ページを参照: https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html ）\n'
      + '3. 振替休日も忘れずに追加\n\n'
      + 'このメールは年1回のみ送信されます。';
    
    GmailApp.sendEmail(recipientEmail, subject, body);
    console.log('📧 祝日データ不足の通知メールを送信しました → ' + recipientEmail);
    
    // 通知済みフラグをセット（同じ年に再送しない）
    props.setProperty('HOLIDAY_NOTIFIED_YEAR', currentYear);
    
  } catch (e) {
    // 通知失敗でも投稿処理は止めない
    console.log('⚠️ 祝日カバレッジチェックエラー（続行）: ' + e.message);
  }
}


// ========================================
// テスト関数
// ========================================

/**
 * 今日のアノマリーをテスト出力
 */
function testTodayAnomalies() {
  console.log('=== アノマリー判定テスト ===');
  console.log('');
  
  var anomalies = getTodayAnomalies_();
  
  if (anomalies.length === 0) {
    console.log('該当なし');
  } else {
    for (var i = 0; i < anomalies.length; i++) {
      var a = anomalies[i];
      console.log('[' + a.id + '] ' + a.name);
      if (a.impact) console.log('  影響: ' + a.impact);
      if (a.confidence) console.log('  信頼度: ' + a.confidence);
    }
  }
  
  console.log('');
  console.log('--- プロンプト注入テキスト ---');
  console.log(formatAnomalyForPrompt_(anomalies, 'MORNING'));
  
  console.log('');
  console.log('--- ファクトチェック用テキスト ---');
  console.log(formatAnomalyForFactCheck_(anomalies));
  
  console.log('');
  console.log('--- 来週のアノマリー ---');
  var nextWeek = getTodayAnomalies_(null, 'next_week');
  if (nextWeek.length === 0) {
    console.log('該当なし');
  } else {
    for (var j = 0; j < nextWeek.length; j++) {
      var nw = nextWeek[j];
      console.log('[' + nw.id + '] ' + nw.name + (nw.date ? ' (' + nw.date + ')' : ''));
    }
  }
}

/**
 * 特定日のアノマリーをテスト（日付を指定してテスト可能）
 * GASエディタで実行: testAnomalyForDate()
 * 日付を変えてテストしたい場合はコード内のtargetDateを変更
 */
function testAnomalyForDate() {
  // テストしたい日付を指定（例: 2026年3月31日 = 年度末）
  var targetDate = new Date(2026, 2, 31); // 月は0-indexed（2=3月）
  
  console.log('=== 指定日アノマリーテスト ===');
  console.log('対象日: ' + Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy/MM/dd（E）'));
  console.log('');
  
  var anomalies = getTodayAnomalies_(targetDate);
  
  if (anomalies.length === 0) {
    console.log('該当なし');
  } else {
    for (var i = 0; i < anomalies.length; i++) {
      var a = anomalies[i];
      console.log('[' + a.id + '] ' + a.name);
      if (a.impact) console.log('  影響: ' + a.impact);
    }
  }
}


// ========================================
// シートセットアップ（初回のみ実行）
// ========================================

/**
 * アノマリーシートにマスターデータを自動入力する
 * カスタムメニューまたはGASエディタから1回だけ実行
 */
function setupAnomalySheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  var sheet = ss.getSheetByName('アノマリー');
  if (!sheet) {
    sheet = ss.insertSheet('アノマリー');
    console.log('📅 アノマリーシートを新規作成');
  } else {
    // 既存データがあれば確認
    if (sheet.getLastRow() > 1) {
      var ui = SpreadsheetApp.getUi();
      var response = ui.alert(
        'アノマリーシートにはデータがあります',
        '上書きしますか？（既存データは全て消えます）',
        ui.ButtonSet.YES_NO
      );
      if (response !== ui.Button.YES) {
        console.log('キャンセルしました');
        return;
      }
    }
    sheet.clear();
  }
  
  // ===== ヘッダー =====
  var headers = [
    'アノマリーID',    // A
    'カテゴリ',        // B
    '名前',           // C
    '為替への影響',    // D
    '主な通貨ペア',    // E
    '時間帯',         // F
    '信頼度',         // G
    '投稿での使い方',  // H
    '有効'            // I
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // ===== マスターデータ（20行） =====
  // [ID, カテゴリ, 名前, 為替への影響, 主な通貨ペア, 時間帯, 信頼度, 投稿での使い方, 有効]
  var data = [
    // --- カテゴリ1: ゴトー日 ---
    ['GOTO_5',  'ゴトー日', 'ゴトー日（5日）',
      '東京仲値（9:55）に向けてドル買い需要が入りやすい。輸入企業の決済用ドル調達が集中する傾向。仲値通過後はドル売り反転が起きやすい',
      'USD/JPY', '東京（9:00〜10:00）', '高',
      '「ゴトー日の仲値需要が意識される」「仲値通過後の反転に注意」。仲値前後の値動きを仮説に組み込め', true],
    ['GOTO_10', 'ゴトー日', 'ゴトー日（10日）',
      '5日と同様。仲値に向けたドル買い需要',
      'USD/JPY', '東京（9:00〜10:00）', '高',
      '5日と同様', true],
    ['GOTO_15', 'ゴトー日', 'ゴトー日（15日）',
      '5日と同様。仲値に向けたドル買い需要',
      'USD/JPY', '東京（9:00〜10:00）', '高',
      '5日と同様', true],
    ['GOTO_20', 'ゴトー日', 'ゴトー日（20日）',
      '5日と同様。仲値に向けたドル買い需要',
      'USD/JPY', '東京（9:00〜10:00）', '高',
      '5日と同様', true],
    ['GOTO_25', 'ゴトー日', 'ゴトー日（25日）',
      '5日と同様。仲値に向けたドル買い需要。給料日と重なるため特にフローが大きい傾向',
      'USD/JPY', '東京（9:00〜10:00）', '高',
      '25日は給料日とも重なりフロー大。仲値前後の動きに注目', true],
    ['GOTO_EOM', 'ゴトー日', 'ゴトー日（月末）',
      '月末決済の集中でゴトー日の中でも最もドル買いフローが大きい傾向。ただし月末リバランスと方向が逆になることもある',
      'USD/JPY', '東京（9:00〜10:00）', '高',
      '月末ゴトー日は最大のフロー。月末リバランスと方向が逆になる可能性も仮説に入れろ', true],

    // --- カテゴリ2: 月末・四半期末・年度末 ---
    ['MONTH_END', '月末・年度末', '月末リバランス',
      'ロンドンフィキシング（日本時間25:00/夏時間24:00）前後に大口のポートフォリオリバランスフロー。月初からのトレンドの逆方向に動きやすい',
      '主要通貨全般', 'ロンドン〜NY（フィキシング前後）', '中',
      '「月末リバランスのフローが意識される」「月初からドル高が続いた分、月末は調整のドル売りが出やすい」', true],
    ['QUARTER_END', '月末・年度末', '四半期末リバランス',
      '年金・ファンドのポートフォリオリバランス。株高の四半期だった場合、株売り+債券買い+為替ヘッジ調整で大きなフロー',
      '主要通貨全般', 'ロンドン〜NY', '中',
      '月末リバランスより規模が大きい。「今四半期は株高だったので、リバランスのドル売りが出やすい」等', true],
    ['FISCAL_YEAR_END', '月末・年度末', '日本の年度末リパトリ',
      '日本企業が海外利益を円に戻すリパトリエーション（円転=ドル売り/円買い）。3月最終週が最も強い。ファンダ要因と無関係に円高圧力',
      'USD/JPY, EUR/JPY, GBP/JPY', '東京〜ロンドン', '高',
      '最重要アノマリーの一つ。「年度末リパトリの円買いフローが出やすい時期」「ファンダだけで説明しきれない円高はリパトリの影響も」', true],
    ['FISCAL_YEAR_START', '月末・年度末', '日本の新年度',
      '4月に入ると海外投資を再開する日本の機関投資家のドル買い/円売りフローが出やすい。年度末の逆方向',
      'USD/JPY, EUR/JPY', '東京', '中',
      '「新年度の海外投資再開で、年度末とは逆のドル買い/円売りフローが意識される」', true],

    // --- カテゴリ3: 週末金曜 ---
    ['FRIDAY_REBALANCE', '週末金曜', '金曜リバランス',
      'ポジション調整のリスクオフ傾向。特にロンドンフィキシング前後に動きやすい。月末金曜はさらに効果増大',
      '主要通貨全般', 'ロンドン〜NY', '中',
      '「週末を控えたポジション調整」「金曜のフィキシングは要注意」', true],

    // --- カテゴリ4: 海外祝祭日 ---
    ['EASTER', '海外祝祭日', 'イースター休暇',
      '聖金曜〜翌月曜は欧米主要市場が休場。薄商いでスプレッド拡大、フラッシュムーブのリスク。ロンドン・NYが不在のため東京が主導権',
      '主要通貨全般', '全時間帯（薄商い）', '高',
      '「イースター休暇で欧米勢が不在」「薄商いで値動きが荒くなりやすい」「無理にポジションを取る場面ではない」', true],
    ['THANKSGIVING', '海外祝祭日', '感謝祭',
      '米市場休場〜半日。薄商い。年末ラリーの起点になることも',
      'USD関連', 'NY時間が不在', '中',
      '「感謝祭で米市場が休場」「年末ラリーの起点になることもある」', true],
    ['CHRISTMAS', '海外祝祭日', 'クリスマス休暇',
      '欧米市場休場。薄商い。ただし「クリスマスラリー」（株高=リスクオン）の傾向があり、年末にかけて楽観ムードが広がりやすい',
      '主要通貨全般', '全時間帯（薄商い）', '中',
      '「クリスマス休暇で薄商い」「クリスマスラリーへの期待」', true],
    ['NEW_YEAR', '海外祝祭日', '年末年始',
      '日米欧すべて薄商い。フラッシュクラッシュのリスク（2019年1月3日のドル円急落事例）。流動性が極端に低下',
      '主要通貨全般', '全時間帯', '高',
      '「年末年始は流動性が極端に低下」「フラッシュクラッシュに警戒」「ポジション管理を最優先に」', true],

    // --- カテゴリ5: 夏枯れ ---
    ['SUMMER_LULL', '夏枯れ', '夏枯れ（8月）',
      '欧米勢のバカンスで流動性低下。トレンドが出にくいがフラッシュムーブのリスク。お盆週は日本勢も不在でさらに薄い',
      '主要通貨全般', '全時間帯', '中',
      '「8月は夏枯れで流動性が低い」「トレンドが出にくい」「お盆週は特に注意」', true],

    // --- カテゴリ6: SQ日 ---
    ['MINI_SQ', 'SQ日', 'ミニSQ',
      '先物清算日。株価の乱高下→為替に波及するパターン。特にNY時間の米SQ（トリプルウィッチング）は要注意',
      '株価連動通貨ペア', '15:00以降〜NY', '低',
      '「SQ日で先物清算が集中」「株価連動でドル円にも波及する可能性」', true],
    ['MAJOR_SQ', 'SQ日', 'メジャーSQ',
      '先物・オプションの同時清算。ミニSQより影響大。特に3月と9月は日本の年度末/中間期と重なり効果増大',
      '株価連動通貨ペア', '15:00以降〜NY', '中',
      'ミニSQより影響大。「メジャーSQで大口の清算フローが入りやすい」', true],

    // --- カテゴリ7: 中銀会合前日 ---
    ['PRE_FOMC', '中銀会合', 'FOMC前日',
      'FOMC結果待ちの様子見ムード。ボラティリティが低下し、発表後に急変する傾向。「ブラックアウト期間」でFRB高官の発言もなし',
      'USD関連全般', '全時間帯', '高',
      '「FOMC前で様子見ムード」「結果次第で大きく動く可能性があるため、事前のポジション管理が重要」', true],
    ['PRE_BOJ', '中銀会合', '日銀会合前日',
      '日銀の金融政策決定会合を翌日に控え、円のボラティリティに警戒。特に利上げ観測がある場合はポジション調整が先行',
      'JPYクロス全般', '東京〜ロンドン', '高',
      '「明日の日銀会合を前に円のボラに警戒」「利上げ観測でポジション調整が先行」', true],
    ['PRE_ECB', '中銀会合', 'ECB会合前日',
      'ECB理事会を翌日に控え、ユーロのボラティリティに警戒。利下げ/据え置きの期待値でポジション調整',
      'EUR関連全般', 'ロンドン〜NY', '中',
      '「明日のECB理事会を前にユーロの方向感が出にくい」', true],

    // --- カテゴリ8: 月別傾向 ---
    ['JANUARY_EFFECT', '月別傾向', '1月効果',
      '新年の資金流入でリスクオン傾向。ドル円は年初に方向感が出やすい。「1月の動きがその年のトレンドを示す」というアノマリー',
      '主要通貨全般', '月を通じて', '低',
      '「新年の資金流入でリスクオン傾向」「1月の方向感が年間トレンドの先行指標になることも」', true],
    ['SELL_IN_MAY', '月別傾向', 'セルインメイ',
      '「Sell in May and go away」。5〜10月は株式パフォーマンスが悪化する傾向。株安→リスクオフ→円買いの連鎖が意識される',
      '主要通貨全般', '月を通じて', '低',
      '「セルインメイの時期に入った」「統計的に5〜10月はリスクオフ傾向」。ただし毎年成立するわけではないことも付記', true],
  ];
  
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  
  // ===== 書式設定 =====
  // ヘッダー
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1565C0');
  headerRange.setFontColor('white');
  headerRange.setHorizontalAlignment('center');
  
  // 列幅
  sheet.setColumnWidth(1, 130);  // A: アノマリーID
  sheet.setColumnWidth(2, 100);  // B: カテゴリ
  sheet.setColumnWidth(3, 180);  // C: 名前
  sheet.setColumnWidth(4, 500);  // D: 為替への影響
  sheet.setColumnWidth(5, 150);  // E: 主な通貨ペア
  sheet.setColumnWidth(6, 180);  // F: 時間帯
  sheet.setColumnWidth(7, 60);   // G: 信頼度
  sheet.setColumnWidth(8, 500);  // H: 投稿での使い方
  sheet.setColumnWidth(9, 50);   // I: 有効
  
  // カテゴリ別の背景色
  var categoryColors = {
    'ゴトー日':     '#DAEAF8',
    '月末・年度末': '#E2EFDA',
    '週末金曜':     '#FFF2CC',
    '海外祝祭日':   '#F4CCCC',
    '夏枯れ':       '#FCE5CD',
    'SQ日':         '#D9D2E9',
    '中銀会合':     '#D0E0E3',
    '月別傾向':     '#F3F3F3'
  };
  
  for (var i = 0; i < data.length; i++) {
    var row = i + 2;
    var category = data[i][1];
    var color = categoryColors[category] || '#FFFFFF';
    sheet.getRange(row, 1, 1, headers.length).setBackground(color);
    
    // 信頼度の色分け（G列）
    var confidence = data[i][6];
    if (confidence === '高') {
      sheet.getRange(row, 7).setBackground('#C8E6C9').setFontWeight('bold');
    } else if (confidence === '低') {
      sheet.getRange(row, 7).setBackground('#FFCDD2');
    }
  }
  
  // 有効列（I列）のチェックボックス化
  var checkRange = sheet.getRange(2, 9, data.length, 1);
  checkRange.insertCheckboxes();
  var checkValues = [];
  for (var j = 0; j < data.length; j++) {
    checkValues.push([true]);
  }
  checkRange.setValues(checkValues);
  
  // 信頼度列の中央揃え
  sheet.getRange(2, 7, data.length, 1).setHorizontalAlignment('center');
  
  // フリーズ
  sheet.setFrozenRows(1);
  
  // ノート
  sheet.getRange(1, 1).setNote('アノマリー（カレンダー要因）のマスターデータ。コードが自動で今日の該当を判定し、プロンプトに注入します。\n有効フラグをOFFにすると判定対象外になります。');
  sheet.getRange(1, 4).setNote('為替への影響を記述。コードはこの文をそのままプロンプトに注入します。');
  sheet.getRange(1, 7).setNote('高: ほぼ毎回効く（ゴトー日等）\n中: 効く場合が多い\n低: 効かない場合もある（季節性等）');
  sheet.getRange(1, 8).setNote('AIがこのアノマリーを投稿で使う際のガイドライン。コードがプロンプトに注入します。');
  
  console.log('');
  console.log('✅ アノマリーシートを作成しました');
  console.log('  データ: ' + data.length + '件（8カテゴリ）');
  console.log('  ゴトー日: 6件 / 月末・年度末: 4件 / 週末金曜: 1件');
  console.log('  海外祝祭日: 4件 / 夏枯れ: 1件 / SQ日: 2件');
  console.log('  中銀会合: 3件 / 月別傾向: 2件');
  
  SpreadsheetApp.getUi().alert('アノマリーシートを作成しました（' + data.length + '件）');
}
