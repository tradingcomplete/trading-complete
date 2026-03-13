/**
 * CompanaFXAutoPost - utils.gs
 * ユーティリティ関数
 */

// ===== 日付フォーマット =====
function formatDate(date, format) {
  return Utilities.formatDate(
    date || new Date(),
    'Asia/Tokyo',
    format || 'yyyy/MM/dd HH:mm:ss'
  );
}

// ===== ランダム遅延（Bot判定回避） =====
function addRandomDelay() {
  var minMs = RANDOM_DELAY_MIN * 60 * 1000;
  var maxMs = RANDOM_DELAY_MAX * 60 * 1000;
  var delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  var delaySec = Math.round(delayMs / 1000);
  
  if (delaySec > 0) {
    console.log('ランダム遅延: ' + delaySec + '秒');
    Utilities.sleep(delayMs);
  }
  
  return delaySec;
}

// ===== エラーメール通知 =====
function sendErrorEmail(subject, body) {
  try {
    var recipient = Session.getActiveUser().getEmail();
    if (!recipient) {
      console.log('メールアドレスが取得できません');
      return false;
    }
    
    var fullSubject = '[CompanaFXAutoPost] ' + subject;
    var fullBody = '=== CompanaFXAutoPost エラー通知 ===\n\n' +
      '日時: ' + formatDate() + '\n\n' +
      body + '\n\n' +
      '---\n' +
      'このメールは自動送信されています。';
    
    GmailApp.sendEmail(recipient, fullSubject, fullBody);
    console.log('エラーメールを送信しました: ' + subject);
    return true;
  } catch (e) {
    console.log('メール送信失敗: ' + e.message);
    return false;
  }
}

// ===== 曜日名を取得 =====
function getDayName(date) {
  var days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[(date || new Date()).getDay()];
}

// ===== 今日のスケジュールを取得 =====
function getTodaySchedule() {
  var today = new Date();
  var dayOfWeek = today.getDay(); // 0=日, 1=月, ..., 6=土
  
  var schedule = SCHEDULE[dayOfWeek];
  if (!schedule) {
    console.log('今日（' + getDayName() + '）のスケジュールはありません');
    return null;
  }
  
  return {
    dayOfWeek: dayOfWeek,
    dayName: getDayName(),
    times: schedule.times,
    types: schedule.types,
    postCount: schedule.times.length
  };
}

// ===== アーキタイプ選択（マンネリ防止） =====
function selectArchetype(postType) {
  // 推奨アーキタイプを取得
  var recommended = ARCHETYPE_MAP[postType];
  if (!recommended || recommended.length === 0) {
    recommended = ARCHETYPES; // 全種類から選択
  }
  
  // 最近使ったアーキタイプを取得
  var recent = getRecentArchetypes(5);
  
  // 最近使っていないものを優先
  var candidates = [];
  for (var i = 0; i < recommended.length; i++) {
    if (recent.indexOf(recommended[i]) === -1) {
      candidates.push(recommended[i]);
    }
  }
  
  // 全部最近使った場合は推奨リストから選択
  if (candidates.length === 0) {
    candidates = recommended;
  }
  
  // ランダムに1つ選択
  var index = Math.floor(Math.random() * candidates.length);
  var selected = candidates[index];
  
  console.log('アーキタイプ選択: ' + selected +
    '（候補: ' + candidates.length + '件, 最近使用: ' + recent.length + '件）');
  
  return selected;
}

// ===== テキストの文字数チェック =====
function validateTextLength(text, postType) {
  var config = POST_TYPES[postType];
  if (!config) return { valid: true, length: text.length };
  
  var length = text.length;
  var valid = length >= config.charMin && length <= config.charMax;
  
  if (!valid) {
    console.log('文字数: ' + length +
      '（目標: ' + config.charMin + '〜' + config.charMax + '）' +
      (length < config.charMin ? ' → 短すぎ' : ' → 長すぎ'));
  }
  
  return {
    valid: valid,
    length: length,
    min: config.charMin,
    max: config.charMax
  };
}

// ===== テスト: ユーティリティ確認 =====
function testUtils() {
  console.log('=== Utils テスト ===');
  console.log('');
  
  // 日付フォーマット
  console.log('現在日時: ' + formatDate());
  console.log('曜日: ' + getDayName());
  
  // 今日のスケジュール
  console.log('');
  var schedule = getTodaySchedule();
  if (schedule) {
    console.log('今日のスケジュール（' + schedule.dayName + '曜日）:');
    console.log('投稿数: ' + schedule.postCount + '件');
    for (var i = 0; i < schedule.times.length; i++) {
      console.log('  ' + schedule.times[i] + ' → ' + schedule.types[i]);
    }
  }
  
  // アーキタイプ選択
  console.log('');
  console.log('アーキタイプ選択テスト:');
  console.log('MORNING → ' + selectArchetype('MORNING'));
  console.log('LONDON → ' + selectArchetype('LONDON'));
  
  // 文字数チェック
  console.log('');
  var testText = 'これはテスト文章です。'.repeat(20);
  var check = validateTextLength(testText, 'MORNING');
  console.log('文字数チェック: ' + check.length + '文字（目標: ' + check.min + '〜' + check.max + '）');
  
  console.log('');
  console.log('🎉 Utilsテスト完了！');
}