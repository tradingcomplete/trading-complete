/**
 * CompanaFXAutoPost - scheduler.gs
 * 毎日のトリガーを自動設定・管理
 * 
 * 仕組み:
 *   1. 毎朝5:00にscheduleTodayPosts()が実行される
 *   2. 今日の曜日に応じたスケジュールを取得
 *   3. 各投稿時刻にトリガーを設定
 *   4. 翌日5:00に古いトリガーを削除して新しく設定
 */

// ===== 今日の投稿トリガーを一括設定 =====
function scheduleTodayPosts() {
  console.log('=== 今日のトリガー設定 ===');
  
  // ★v8.6: 前日の投稿キャッシュをクリア（品質レビューの重複チェック用）
  try {
    clearTodayPostCache_();
  } catch (e) {
    console.log('投稿キャッシュクリアエラー（続行）: ' + e.message);
  }
  
  // ★v8.6: トリガー設定を最優先に実行
  // 重い処理（サマリー更新等）でタイムアウトしても、トリガーは設定済みで投稿は生成される
  
  // 古いトリガーを削除（保護対象以外）★v8.0: 指標トリガー設定より前に実行
  cleanupPostTriggers_();

  // Phase 8: 平日のみ、今日の重要指標の30分前にINDICATOR投稿トリガーを設定
  try {
    var todayForIndicator = new Date();
    var dayForIndicator = todayForIndicator.getDay();
    if (dayForIndicator >= 1 && dayForIndicator <= 5) {
      scheduleIndicatorTriggers_();
      scheduleResultFetchTriggers_();
    }
  } catch (e) {
    console.log('指標連動トリガーエラー（続行）: ' + e.message);
  }
  
  var schedule = getTodaySchedule();
  if (!schedule) {
    console.log('今日は投稿スケジュールがありません');
    return;
  }
  
  console.log(schedule.dayName + '曜日: ' + schedule.postCount + '件の投稿');
  console.log('');
  
  var now = new Date();
  var today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var triggersCreated = 0;
  
  // ★v12.5.2: サマータイム判定（LONDON/GOLDENの投稿時刻を1時間前倒し）
  var isSummer = isSummerTime_(now);
  if (isSummer) {
    console.log('☀️ サマータイム期間: LONDON/GOLDENを' + Math.abs(SUMMER_TIME_OFFSET_MIN) + '分前倒し');
  } else {
    console.log('❄️ 冬時間期間: LONDON/GOLDENは通常時刻');
  }
  console.log('');
  
  for (var i = 0; i < schedule.times.length; i++) {
    var timeStr = schedule.times[i];
    var postType = schedule.types[i];
    var functionName = getFunctionName_(postType);
    
    // 時刻をパース
    var parts = timeStr.split(':');
    var hour = parseInt(parts[0], 10);
    var minute = parseInt(parts[1], 10);
    
    // ★v12.5.2: サマータイムオフセット適用（LONDON/GOLDENのみ）
    var summerAdjusted = false;
    if (isSummer && SUMMER_TIME_TYPES.indexOf(postType) !== -1) {
      minute += SUMMER_TIME_OFFSET_MIN; // -60分
      while (minute < 0) {
        minute += 60;
        hour -= 1;
      }
      summerAdjusted = true;
    }
    
    // ランダムゆらぎ追加（0〜5分）
    var randomMinutes = Math.floor(Math.random() * (RANDOM_DELAY_MAX - RANDOM_DELAY_MIN + 1)) + RANDOM_DELAY_MIN;
    minute += randomMinutes;
    if (minute >= 60) {
      hour += 1;
      minute -= 60;
    }
    
    // トリガー時刻を作成（GASがJSTプロジェクトならローカル時刻として解釈される）
    var triggerTime = new Date(today + 'T' + padZero_(hour) + ':' + padZero_(minute) + ':00');
    
    // 過去の時刻はスキップ
    if (triggerTime <= now) {
      console.log('  スキップ（過去）: ' + timeStr + '+' + randomMinutes + '分 → ' + postType);
      continue;
    }
    
    // トリガーを作成
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .at(triggerTime)
      .create();
    
    var actualTime = padZero_(hour) + ':' + padZero_(minute);
    if (summerAdjusted) {
      console.log('  ✅ ' + timeStr + ' ☀️+' + randomMinutes + '分 → ' + actualTime + ' → ' + postType + '（' + functionName + '）');
    } else {
      console.log('  ✅ ' + timeStr + ' +' + randomMinutes + '分 = ' + actualTime + ' → ' + postType + '（' + functionName + '）');
    }
    triggersCreated++;
  }
  
  console.log('');
  console.log('トリガー設定完了: ' + triggersCreated + '/' + schedule.postCount + '件');
  
  // ★v12.7: トリガー登録上限監視（GASは1プロジェクト最大20個）
  var currentTriggerCount = ScriptApp.getProjectTriggers().length;
  console.log('📊 現在のトリガー数: ' + currentTriggerCount + '/20');
  if (currentTriggerCount > 15) {
    console.log('⚠️ トリガー数が15を超えています（' + currentTriggerCount + '個）→ 警告メール送信');
    try {
      sendErrorEmail('⚠️ トリガー上限警告',
        'トリガー数が' + currentTriggerCount + '個に到達しました。\n' +
        'GAS上限は20個です。\n\n' +
        '不要なトリガーが残存している可能性があります。\n' +
        'GASエディタの「トリガー」画面で確認してください。');
    } catch (e) {
      console.log('⚠️ 警告メール送信失敗: ' + e.message);
    }
  }

  console.log('=== 全トリガー設定完了 ===');
}


/**
 * ★v8.6: 日次メンテナンス処理（重い処理を分離）
 * 
 * scheduleTodayPosts（5:00）とは別トリガー（5:15）で実行。
 * タイムアウトしても投稿トリガーには影響なし。
 * 
 * initializeScheduler()で毎朝5:15のトリガーを設定済み。
 */
function scheduleDailyMaintenance() {
  console.log('=== 日次メンテナンス処理 ===');
  
  // レートキャッシュの日次集約（前日分をOHLCに圧縮）
  try {
    aggregateDailyRates();
  } catch (e) {
    console.log('日次集約エラー（続行）: ' + e.message);
  }
  
  // レートサマリー更新（日次レート+キャッシュから高値安値を計算）
  try {
    updatePriceSummary();
  } catch (e) {
    console.log('サマリー更新エラー（続行）: ' + e.message);
  }

  // Phase 2: 月曜日のみ、先週のWEEKLY_HYPOTHESIS仮説を自動検証
  try {
    var todayForVerify = new Date();
    if (todayForVerify.getDay() === 1) {
      console.log('📊 月曜日: 先週の仮説を自動検証中...');
      verifyWeeklyHypotheses_();
    }
  } catch (e) {
    console.log('仮説検証エラー（続行）: ' + e.message);
  }

  // Phase 4: 24時間以上前の投稿のエンゲージメントを自動収集
  try {
    collectAndSaveMetrics_();
  } catch (e) {
    console.log('エンゲージメント収集エラー（続行）: ' + e.message);
  }
  
  console.log('=== メンテナンス完了 ===');
}

// ===== 投稿用トリガーだけ削除（スケジューラ・下書き処理は残す） =====
function cleanupPostTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  var keepFunctions = ['scheduleTodayPosts', 'scheduleDailyMaintenance', 'initializeScheduler', 'processApprovedDrafts', 'testFetchRates', 'scheduledFetchRates', 'onOpen'];
  var deleted = 0;
  
  for (var i = 0; i < triggers.length; i++) {
    var funcName = triggers[i].getHandlerFunction();
    if (keepFunctions.indexOf(funcName) === -1) {
      ScriptApp.deleteTrigger(triggers[i]);
      deleted++;
    }
  }
  
  if (deleted > 0) {
    console.log('古いトリガーを' + deleted + '件削除しました');
  }
}

// ===== 投稿タイプから関数名を取得 =====
function getFunctionName_(postType) {
  var map = {
    'MORNING': 'runMorning',
    'TOKYO': 'runTokyo',
    'LUNCH': 'runLunch',
    'LONDON': 'runLondon',
    'GOLDEN': 'runGolden',
    // ★v12.7: NY削除
    'WEEKLY_REVIEW': 'runWeeklyReview',
    'RULE_1': 'runRule1',
    'RULE_2': 'runRule2',
    'WEEKLY_LEARNING': 'runWeeklyLearning',
    'RULE_3': 'runRule3',
    'NEXT_WEEK': 'runNextWeek',
    'RULE_4': 'runRule4',
    'WEEKLY_HYPOTHESIS': 'runWeeklyHypothesis',
    'INDICATOR': 'runIndicator',
    'KNOWLEDGE': 'runKnowledge'
  };
  
  return map[postType] || 'runMorning';
}

// ===== ゼロ埋め =====
function padZero_(num) {
  return num < 10 ? '0' + num : '' + num;
}

// ===== 初期設定: 毎朝5:00にスケジューラを実行するトリガー =====
function initializeScheduler() {
  // 既存のscheduleTodayPostsとscheduledFetchRatesとscheduleDailyMaintenanceトリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var func = triggers[i].getHandlerFunction();
    if (func === 'scheduleTodayPosts' || func === 'scheduledFetchRates' || func === 'scheduleDailyMaintenance') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 毎朝5:00にscheduleTodayPostsを実行（トリガー設定のみ。軽い）
  ScriptApp.newTrigger('scheduleTodayPosts')
    .timeBased()
    .atHour(5)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();
  
  // ★v8.6: 毎朝5:15にscheduleDailyMaintenanceを実行（重い処理。別トリガーで分離）
  ScriptApp.newTrigger('scheduleDailyMaintenance')
    .timeBased()
    .atHour(5)
    .nearMinute(15)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();
  
  // 1時間ごとにレート取得（Twelve Data API）
  ScriptApp.newTrigger('scheduledFetchRates')
    .timeBased()
    .everyHours(1)
    .create();
  
  console.log('✅ スケジューラを初期化しました');
  console.log('毎朝5:00に投稿トリガーが自動設定されます');
  console.log('毎朝5:15に日次メンテナンス（サマリー更新等）が実行されます');
  console.log('1時間ごとにレートを自動取得します（Twelve Data API）');
  console.log('');
  
  // 今日のトリガーも即座に設定
  console.log('今日のトリガーも設定します...');
  console.log('');
  scheduleTodayPosts();
}

// ===== 全トリガーを削除（緊急停止用） =====
function emergencyStop() {
  var triggers = ScriptApp.getProjectTriggers();
  var deleted = 0;
  var protected_ = 0;
  console.log('投稿トリガーを削除します（onOpenは保護）');
  
  for (var i = 0; i < triggers.length; i++) {
    var funcName = triggers[i].getHandlerFunction();
    // onOpenトリガーは保護（カスタムメニュー用）
    if (funcName === 'onOpen') {
      console.log('  保護: ' + funcName + '（カスタムメニュー）');
      protected_++;
      continue;
    }
    console.log('  削除: ' + funcName);
    ScriptApp.deleteTrigger(triggers[i]);
    deleted++;
  }
  
  console.log('');
  console.log('🛑 緊急停止完了（削除:' + deleted + '件、保護:' + protected_ + '件）');
  console.log('再開するにはinitializeSchedulerを実行してください');
}

// ===== 現在のトリガー一覧を表示 =====
function showTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  console.log('=== 現在のトリガー一覧（' + triggers.length + '件） ===');
  console.log('');
  
  if (triggers.length === 0) {
    console.log('トリガーはありません');
    console.log('initializeSchedulerを実行してスケジューラを開始してください');
    return;
  }
  
  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    console.log((i + 1) + '. ' + trigger.getHandlerFunction() +
      ' | タイプ: ' + trigger.getEventType() +
      ' | ソース: ' + trigger.getTriggerSource());
  }
}

// ===== テスト: トリガー設定のドライラン（実際には設定しない） =====
function testScheduleDryRun() {
  console.log('=== スケジュール ドライラン ===');
  console.log('（トリガーは設定せず、内容だけ確認します）');
  console.log('');
  
  var schedule = getTodaySchedule();
  if (!schedule) {
    console.log('今日は投稿スケジュールがありません');
    return;
  }
  
  console.log(schedule.dayName + '曜日: ' + schedule.postCount + '件の投稿');
  
  var now = new Date();
  
  // ★v12.5.2: サマータイム表示
  var isSummer = isSummerTime_(now);
  console.log(isSummer ? '☀️ サマータイム期間' : '❄️ 冬時間期間');
  console.log('');
  
  for (var i = 0; i < schedule.times.length; i++) {
    var timeStr = schedule.times[i];
    var postType = schedule.types[i];
    var functionName = getFunctionName_(postType);
    
    var parts = timeStr.split(':');
    var hour = parseInt(parts[0], 10);
    var minute = parseInt(parts[1], 10);
    
    
    // ★v12.5.2: サマータイムオフセット適用
    var summerTag = '';
    if (isSummer && SUMMER_TIME_TYPES.indexOf(postType) !== -1) {
      minute += SUMMER_TIME_OFFSET_MIN;
      while (minute < 0) {
        minute += 60;
        hour -= 1;
      }
      summerTag = '☀️';
    }
    
    // ランダムゆらぎの範囲を表示
    var minTime = padZero_(hour) + ':' + padZero_(minute);
    var maxMinute = minute + RANDOM_DELAY_MAX;
    var maxHour = hour;
    if (maxMinute >= 60) {
      maxHour += 1;
      maxMinute -= 60;
    }
    var maxTime = padZero_(maxHour) + ':' + padZero_(maxMinute);
    
    var typeConfig = POST_TYPES[postType];
    var emoji = typeConfig ? typeConfig.emoji : '';
    var label = typeConfig ? typeConfig.label : postType;
    var hasImage = isImageGenerationType(postType) ? '📷' : '  ';  // ★v12.6.1: imageGenerator.gs IMAGE_TYPE_COLORS参照
    
    console.log(hasImage + ' ' + minTime + '〜' + maxTime + ' | ' + emoji + ' ' + label + summerTag + ' → ' + functionName + '()');
  }
  
  console.log('');
  console.log('現在時刻: ' + formatDate());
  console.log('過去の時刻はスキップされます');
}

// ========================================
// Phase 8: 指標連動投稿
// ========================================

/**
 * 今日の重要経済指標を読み、発表30分前にrunIndicator()トリガーを設定
 * scheduleTodayPosts()から平日のみ呼ばれる
 * 
 * 対象: 経済カレンダーシートで重要度「高」の指標
 * 制限: 1日最大2件
 * 条件: 発表時刻が現在より未来 かつ 30分前がまだ過ぎていない
 */
// ===== 指標結果取得トリガーを設定（発表時刻+5分・カレンダー連動） ★v6.7追加 =====
// 固定時刻ではなくカレンダーのB列を読んで動的設定するため、サマータイムに自動対応する
function scheduleResultFetchTriggers_() {
  console.log('');
  console.log('📊 指標結果取得トリガー設定中...');

  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('経済カレンダー');

  if (!sheet || sheet.getLastRow() < 2) {
    console.log('  ⚠️ 経済カレンダーシートが空');
    return;
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var now = new Date();
  var today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd');
  var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');

  // 今日の「高」指標の発表時刻を収集（重複排除）★v8.0: 「中」はscheduledFetchRatesに委譲
  var triggerMinutes = {}; // "HH:MM" → true（重複防止）
  var triggerCount = 0;

  for (var i = 0; i < data.length; i++) {
    if (!data[i][0] || !data[i][1] || !data[i][3]) continue;

    var eventDate = new Date(data[i][0]);
    var eventDateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'yyyy/MM/dd');
    if (eventDateStr !== today) continue;

    var importance = String(data[i][6] || '').trim();
    // ★v8.0: 「高」のみに限定（トリガー数上限20件対策）
    // 「中」の結果はscheduledFetchRates（1時間ごと）のリトライで取得される
    if (importance !== '高') continue;

    // ★v6.8: B列はDate型対応
    var rawTime2 = data[i][1];
    var hour, minute, timeStr;
    if (rawTime2 instanceof Date) {
      hour    = rawTime2.getHours();
      minute  = rawTime2.getMinutes();
      timeStr = hour + ':' + (minute < 10 ? '0' + minute : minute);
    } else {
      timeStr = String(rawTime2 || '').trim();
      var timeParts2 = timeStr.split(':');
      hour   = parseInt(timeParts2[0], 10);
      minute = parseInt(timeParts2[1] || '0', 10);
    }
    if (!timeStr || timeStr === '0:00' || timeStr === '00:00') continue;
    if (isNaN(hour) || isNaN(minute)) continue;

    // 発表時刻 + 10分（★v8.0: 5分だとGoogle検索に未反映の場合があるため拡大）
    var fetchMinute = minute + 10;
    var fetchHour = hour;
    if (fetchMinute >= 60) {
      fetchMinute -= 60;
      fetchHour += 1;
    }

    var key = padZero_(fetchHour) + ':' + padZero_(fetchMinute);
    if (triggerMinutes[key]) continue; // 同じ時刻は1回だけ
    triggerMinutes[key] = true;

    // 過去の時刻はスキップ
    var triggerTime = new Date(todayStr + 'T' + key + ':00');
    if (triggerTime <= now) {
      console.log('  スキップ（過去）: ' + timeStr + ' → ' + key);
      continue;
    }

    ScriptApp.newTrigger('refreshTodayIndicatorResults')
      .timeBased()
      .at(triggerTime)
      .create();

    console.log('  ✅ 📊 ' + timeStr + ' 発表 → ' + key + ' に結果取得');
    triggerCount++;
  }

  console.log('📊 指標結果取得トリガー: ' + triggerCount + '件設定完了');
}

function scheduleIndicatorTriggers_() {
  console.log('');
  console.log('⚡ 指標連動トリガー設定中...');

  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('経済カレンダー');

  if (!sheet || sheet.getLastRow() < 2) {
    console.log('  ⚠️ 経済カレンダーシートが空');
    return;
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  // A=日付(0), B=時間JST(1), C=国/地域(2), D=指標名(3), E=前回(4), F=予想(5), G=重要度(6), H=備考(7)

  var now = new Date();
  var today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd');
  var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd'); // ★v8.0: Date作成用（ISO形式）
  var candidates = [];

  for (var i = 0; i < data.length; i++) {
    if (!data[i][0] || !data[i][1] || !data[i][3]) continue;

    // 今日の指標のみ
    var eventDate = new Date(data[i][0]);
    var eventDateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'yyyy/MM/dd');
    if (eventDateStr !== today) continue;

    // 重要度「高」のみ
    var importance = String(data[i][6] || '').trim();
    if (importance !== '高') continue;

    // 時刻をパース（★v6.8: B列はDate型対応）
    var rawTime1 = data[i][1];
    var hour, minute, timeStr;
    if (rawTime1 instanceof Date) {
      hour    = rawTime1.getHours();
      minute  = rawTime1.getMinutes();
      timeStr = hour + ':' + (minute < 10 ? '0' + minute : minute);
    } else {
      timeStr = String(rawTime1 || '').trim();
      if (!timeStr || timeStr === '0:00' || timeStr === '00:00') continue;
      var timeParts1 = timeStr.split(':');
      hour   = parseInt(timeParts1[0], 10);
      minute = parseInt(timeParts1[1] || '0', 10);
    }
    if (!timeStr || timeStr === '0:00' || timeStr === '00:00') continue;
    if (isNaN(hour) || isNaN(minute)) continue;

    // 30分前の時刻を計算
    var triggerMinute = minute - 30;
    var triggerHour = hour;
    if (triggerMinute < 0) {
      triggerMinute += 60;
      triggerHour -= 1;
    }

    // 30分前が既に過ぎていたらスキップ
    var triggerTime = new Date(todayStr + 'T' + padZero_(triggerHour) + ':' + padZero_(triggerMinute) + ':00');
    if (triggerTime <= now) {
      var indicatorName = String(data[i][3]).trim();
      console.log('  スキップ（過去）: ' + timeStr + ' ' + indicatorName + '（30分前=' + padZero_(triggerHour) + ':' + padZero_(triggerMinute) + '）');
      continue;
    }

    candidates.push({
      indicatorName: String(data[i][3]).trim(),
      country: String(data[i][2] || '').trim(),
      eventTime: timeStr,
      triggerHour: triggerHour,
      triggerMinute: triggerMinute,
      triggerTime: triggerTime
    });
  }

  if (candidates.length === 0) {
    console.log('  今日は重要指標（重要度: 高）がありません');
    return;
  }

  // 時刻順にソート
  candidates.sort(function(a, b) {
    return a.triggerTime.getTime() - b.triggerTime.getTime();
  });

  // 最大1件に制限（★v12.2: 同時刻帯の重複投稿防止）
  var maxIndicators = 1;
  var triggerCount = 0;

  for (var j = 0; j < Math.min(candidates.length, maxIndicators); j++) {
    var c = candidates[j];

    // ランダムゆらぎ（0〜2分）
    var randomMinutes = Math.floor(Math.random() * (RANDOM_DELAY_MAX - RANDOM_DELAY_MIN + 1)) + RANDOM_DELAY_MIN;
    var actualMinute = c.triggerMinute + randomMinutes;
    var actualHour = c.triggerHour;
    if (actualMinute >= 60) {
      actualHour += 1;
      actualMinute -= 60;
    }

    var actualTriggerTime = new Date(todayStr + 'T' + padZero_(actualHour) + ':' + padZero_(actualMinute) + ':00');

    // 過去の時刻は再チェック（ランダムゆらぎで超える場合は稀だが安全策）
    if (actualTriggerTime <= now) continue;

    ScriptApp.newTrigger('runIndicator')
      .timeBased()
      .at(actualTriggerTime)
      .create();

    // ★v12.4: 対象指標をScriptPropertiesに保存（buildIndicatorPolicy_で読み取り）
    PropertiesService.getScriptProperties().setProperty('INDICATOR_TARGET', JSON.stringify({
      name: c.indicatorName,
      country: c.country,
      time: c.eventTime
    }));

    var actualTimeStr = padZero_(actualHour) + ':' + padZero_(actualMinute);
    console.log('  ✅ ⚡ ' + c.eventTime + ' [' + c.country + '] ' + c.indicatorName);
    console.log('     → 30分前 ' + padZero_(c.triggerHour) + ':' + padZero_(c.triggerMinute) + ' +' + randomMinutes + '分 = ' + actualTimeStr + ' にrunIndicator()設定');
    triggerCount++;
  }

  if (candidates.length > maxIndicators) {
    console.log('  ⚠️ 重要指標が' + candidates.length + '件あり、上位' + maxIndicators + '件のみトリガー設定');
  }

  console.log('');
  console.log('⚡ 指標連動トリガー: ' + triggerCount + '件設定完了');
}


// ========================================
// ★v12.7: ハートビート監視（Phase 3分割対応）
// ========================================

/**
 * ★v12.7: ハートビート監視（システム沈黙の検知）
 *
 * 15分おきに実行され、投稿予定時刻から30分以上経過しているのに
 * 下書きもエラーメールもない場合に異常通知する。
 *
 * Phase A/B/Cの全フローが接続されてから有効化。
 * 現段階では骨組みのみ（方針B並行実装: フロー未接続のため）。
 *
 * 有効化タイミング: 全タスク完了後の統合テスト時に実装を追加
 * トリガー設定: scheduleTodayPosts 内で15分おきに登録（有効化時に追加）
 */
function heartbeatCheck_() {
  // Phase A/B/C全フロー接続後に以下を実装:
  //
  // 1. 今日の投稿予定時刻を走査
  //    var schedule = getTodaySchedule();
  //    for each 予定時刻:
  //
  // 2. 各投稿予定時刻から30分以上経過しているのに:
  //    - 下書きシートに該当投稿がない（Phase A未完了）
  //    - かつエラーメールも送られていない
  //    の場合:
  //
  // 3. 「システム沈黙検知」として異常メール通知
  //    sendErrorEmail('⚠️ システム沈黙検知', ...);
  //
  // 注意: Phase Aが正常に失敗（try-catch内でエラーメール送信）した場合は
  //       「下書きなし + エラーメールあり」なので沈黙ではない。
  //       ハートビートが検知するのは「何も起きていない」状態のみ。

  console.log('heartbeatCheck_: 現段階では未実装（Phase A/B/C全フロー接続後に有効化）');
}


// ===== ★v12.7 タスク7動作確認用テスト関数 =====
/**
 * トリガー登録上限監視のテスト。
 * 現在のトリガー一覧を表示し、上限に対する余裕度を確認する。
 * トリガーの追加・削除は行わない（副作用なし）。
 */
function testTask7TriggerMonitor() {
  console.log('=== タスク7: トリガー登録上限監視テスト ===');
  console.log('');

  // 1. 現在のトリガー一覧
  var triggers = ScriptApp.getProjectTriggers();
  console.log('1. 現在のトリガー数: ' + triggers.length + '/20（GAS上限）');
  console.log('');

  if (triggers.length === 0) {
    console.log('   （トリガーなし）');
  } else {
    for (var i = 0; i < triggers.length; i++) {
      var t = triggers[i];
      console.log('   ' + (i + 1) + '. ' + t.getHandlerFunction() +
        ' | タイプ: ' + t.getEventType() +
        ' | ソース: ' + t.getTriggerSource());
    }
  }

  // 2. 上限チェック
  console.log('');
  console.log('2. 上限チェック');
  if (triggers.length > 15) {
    console.log('   ⚠️ ' + triggers.length + '個 → 15個超！ 警告対象');
    console.log('   本番の scheduleTodayPosts 実行時に警告メールが送信されます');
  } else {
    console.log('   ✅ ' + triggers.length + '個 → 正常範囲（15個以内）');
  }

  // 3. Phase B/C 関連の一時トリガーが残っていないか確認
  console.log('');
  console.log('3. Phase B/C 一時トリガー残存チェック');
  var phaseTriggers = ['executePhaseBQualityReview', 'executePhaseCImageAndPost', 'executePhaseBImageAndEmail'];
  var foundPhase = false;
  for (var i = 0; i < triggers.length; i++) {
    var funcName = triggers[i].getHandlerFunction();
    if (phaseTriggers.indexOf(funcName) !== -1) {
      console.log('   ⚠️ 残存: ' + funcName);
      foundPhase = true;
    }
  }
  if (!foundPhase) {
    console.log('   ✅ Phase B/C 一時トリガーの残存なし');
  }

  // 4. heartbeatCheck_ の存在確認
  console.log('');
  console.log('4. heartbeatCheck_ 関数存在確認');
  if (typeof heartbeatCheck_ === 'function') {
    console.log('   ✅ heartbeatCheck_ 関数が定義されています（骨組みのみ）');
  } else {
    console.log('   ❌ heartbeatCheck_ 関数が見つかりません');
  }

  console.log('');
  console.log('🎉 タスク7完了: トリガー登録上限監視が設定されました');
  console.log('  毎朝5:00の scheduleTodayPosts 実行時に自動でトリガー数チェック');
  console.log('  15個超で警告メール送信');
}
// ===== 手動実行用: トリガー全リセット =====
// 2026-04-17 金曜 22:11 runMorning 異常発火の対処用
function resetAllPostTriggers() {
  cleanupPostTriggers_();
  scheduleTodayPosts();
}

// ===== 手動実行用: トリガー一覧確認 =====
function checkTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  console.log('=== 現在のトリガー(' + triggers.length + '件) ===');
  triggers.forEach(function(t) {
    console.log(t.getHandlerFunction() + ' : ' + t.getEventType());
  });
}

function verifyScheduleIntegrity() {
  var days = ['日', '月', '火', '水', '木', '金', '土'];
  var allOk = true;
  for (var d = 0; d < 7; d++) {
    var s = SCHEDULE[d];
    if (!s) continue;
    var match = (s.times.length === s.types.length);
    if (!match) allOk = false;
    console.log(days[d] + ': times=' + s.times.length + ' types=' + s.types.length + 
                ' ' + (match ? '✅' : '🚨 不整合!'));
  }
  console.log('');
  console.log(allOk ? '✅ 全曜日の整合性OK' : '🚨 不整合あり');
}