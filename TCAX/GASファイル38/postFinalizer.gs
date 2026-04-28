/**
 * CompanaFXAutoPost - postFinalizer.gs
 * 投稿の最終化処理(ハッシュタグ生成・未来日付ガード・TC言及除去)
 *
 * 提供する関数:
 *   - generateDynamicHashtags_:     投稿内容に応じてハッシュタグを動的生成
 *   - getImportantEventTag_:        本日の重要度「高」イベントから候補タグを抽出
 *   - determinePrimaryEventTag_:    複数候補から1つを決定
 *   - countAnyTag_:                 ハッシュタグ出現数カウント
 *   - removeTCMention_:             TC(Trading Complete)言及を除去(禁止投稿タイプ用)
 *   - isFutureDatePastTenseLine_:   未来日付+過去形の行を検出
 *   - removeFutureDateLines_:       未来日付+過去形文脈の行を削除
 *
 * 履歴:
 *   v14.0 Phase R-3(2026-04-23): postProcessor.gs から独立ファイルへ分離
 *   v14.2 Phase 9 v1.0(2026-04-24): ハッシュタグ動的可変運用。平常時0個・重要イベント当日1個のみ。
 *                                   #FX固定・通貨ペア・テーマタグ・フォールバック・3個上限を全撤廃。
 *                                   countPairTag_ 削除(通貨ペア検出廃止)。
 */



/**
 * ★v14.2 Phase 9 v1.0 (2026-04-24): ハッシュタグ動的可変運用
 *
 * 方針:
 *   - 平常時: ハッシュタグ 0 個
 *   - 重要イベント当日: 1 個のみ (#FOMC / #日銀 等)
 *
 * 判定ロジック:
 *   1. getImportantEventTag_(today) で本日の「★重要」イベントから候補タグを抽出
 *   2. 候補が 0 個 → ハッシュタグなしで返す
 *   3. 候補が複数 → determinePrimaryEventTag_ で 1 つに絞る
 *      (本文言及回数 2 回以上かつ単独最多ならそれ、それ以外は優先度テーブル順)
 *
 * 削除された旧ロジック(v14.1 以前):
 *   - #FX 固定付与
 *   - TC 言及 → #個人開発
 *   - 通貨ペア検出(#ドル円 等)
 *   - テーマ検出(#損切り / #資金管理 等)
 *   - フォールバック(#為替 / #トレード)
 *   - 3 個上限ロジック
 *   - URL 検出時の 1 個制限ロジック
 */
function generateDynamicHashtags_(text, postType) {
  var lines = text.split('\n');

  // === Step 1: Claude/Gemini が付けた既存ハッシュタグ行を除去 ===
  var cleanLines = [];
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    // ハッシュタグのみの行を除去
    if (trimmed.length > 0 && trimmed.length < 100 && /^#\S+(\s+#\S+)*$/.test(trimmed)) {
      continue;
    }
    cleanLines.push(lines[i]);
  }

  // 末尾の空行を整理
  while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') {
    cleanLines.pop();
  }

  var bodyText = cleanLines.join('\n');

  // === Step 2: 本日の重要イベントを確認 ===
  var today = new Date();
  var candidateTags = getImportantEventTag_(today);

  if (candidateTags.length === 0) {
    // 平常時 → ハッシュタグなし
    console.log('🏷️ ハッシュタグ: なし (平常時)');
    return bodyText;
  }

  // === Step 3: 複数候補から1つを決定 ===
  var primaryTag = determinePrimaryEventTag_(bodyText, candidateTags);

  if (!primaryTag) {
    console.log('🏷️ ハッシュタグ: なし (候補はあるが判定失敗)');
    return bodyText;
  }

  // === Step 4: 1個のみ付与 ===
  console.log('🏷️ ハッシュタグ自動生成: ' + primaryTag + ' (重要イベント当日)');
  return bodyText + '\n\n' + primaryTag;
}


// ===== ハッシュタグ生成ヘルパー関数 =====

/**
 * 本日の重要度「高」イベントから、該当するハッシュタグ候補を抽出する。
 *
 * getEconomicCalendar_('today') の戻り値(複数行文字列)を解析し、
 * 「★重要」マーク付きの行のみを対象にイベント名パターンマッチで候補タグを抽出する。
 * 重要度「中」「低」のイベントは ★重要 マークが付かないため自動的に除外される。
 *
 * @param {Date} today - 判定基準日(通常は new Date())。getEconomicCalendar_ が内部で今日を判定するため本引数は未使用だが、将来の拡張用に残す。
 * @return {Array<string>} 該当タグ候補配列(例: ['#FOMC', '#日銀'])、該当なしは []
 */
function getImportantEventTag_(today) {
  var calendarText = getEconomicCalendar_('today');
  if (!calendarText) return [];

  // 「★重要」マークが付いた行のみ抽出
  var importantLines = calendarText.split('\n').filter(function(line) {
    return line.indexOf('★重要') !== -1;
  });
  if (importantLines.length === 0) return [];

  // イベント名 → ハッシュタグ のマッピング(v1.0 対応イベント)
  var eventToTag = [
    { patterns: ['FOMC', 'パウエル'],                     tag: '#FOMC' },
    { patterns: ['日銀', 'BOJ', '植田', '金融政策決定会合'], tag: '#日銀' },
    { patterns: ['雇用統計', 'NFP', '非農業部門'],          tag: '#雇用統計' },
    { patterns: ['CPI', '消費者物価'],                     tag: '#CPI' },
    { patterns: ['PPI', '生産者物価'],                     tag: '#PPI' },
    { patterns: ['GDP'],                                  tag: '#GDP' },
    { patterns: ['ECB', 'ラガルド'],                       tag: '#ECB' },
    { patterns: ['BOE', 'ベイリー', '英中銀'],              tag: '#BOE' },
    { patterns: ['RBA', '豪準備銀行', '豪中銀'],            tag: '#RBA' },
    { patterns: ['ISM'],                                  tag: '#ISM' }
  ];

  var detectedTags = [];
  for (var i = 0; i < importantLines.length; i++) {
    var line = importantLines[i];
    for (var j = 0; j < eventToTag.length; j++) {
      var entry = eventToTag[j];
      for (var k = 0; k < entry.patterns.length; k++) {
        if (line.indexOf(entry.patterns[k]) !== -1) {
          if (detectedTags.indexOf(entry.tag) === -1) {
            detectedTags.push(entry.tag);
          }
          break;
        }
      }
    }
  }

  return detectedTags;
}

/**
 * 複数のイベントタグ候補から、本投稿に付けるべきタグを1つ決定する。
 *
 * ロジック:
 *   Step 1. 本文でのキーワード言及回数を集計
 *   Step 2. 最多タグが 2 回以上かつ単独最多 → その主題タグを採用
 *   Step 3. それ以外 → 優先度テーブルで決定
 *           (FOMC > 日銀 > 雇用統計 > CPI > PPI > GDP > ECB > BOE > RBA > ISM)
 *
 * @param {string} bodyText - 投稿本文(ハッシュタグ除去済み)
 * @param {Array<string>} eventTags - 候補タグ配列
 * @return {string|null} 採用する 1 個のタグ(該当なしは null)
 */
function determinePrimaryEventTag_(bodyText, eventTags) {
  if (!eventTags || eventTags.length === 0) return null;
  if (eventTags.length === 1) return eventTags[0];

  // タグ → 本文キーワードパターンの逆引き(getImportantEventTag_ と同一定義)
  var tagToKeywords = {
    '#FOMC':    ['FOMC', 'パウエル'],
    '#日銀':    ['日銀', 'BOJ', '植田', '金融政策決定会合'],
    '#雇用統計': ['雇用統計', 'NFP', '非農業部門'],
    '#CPI':     ['CPI', '消費者物価'],
    '#PPI':     ['PPI', '生産者物価'],
    '#GDP':     ['GDP'],
    '#ECB':     ['ECB', 'ラガルド'],
    '#BOE':     ['BOE', 'ベイリー', '英中銀'],
    '#RBA':     ['RBA', '豪準備銀行', '豪中銀'],
    '#ISM':     ['ISM']
  };

  // Step 1: 本文での言及回数をカウント(countAnyTag_ 再利用・DRY)
  var tagCounts = eventTags.map(function(tag) {
    var keywords = tagToKeywords[tag] || [];
    return { tag: tag, count: countAnyTag_(bodyText, keywords) };
  });

  // Step 2: 最多タグが 2 回以上かつ単独最多なら主題として採用
  tagCounts.sort(function(a, b) { return b.count - a.count; });
  if (tagCounts[0].count >= 2 && tagCounts[0].count > tagCounts[1].count) {
    return tagCounts[0].tag;
  }

  // Step 3: 主題が曖昧 → 優先度テーブルで決定
  var priorityOrder = ['#FOMC', '#日銀', '#雇用統計', '#CPI', '#PPI', '#GDP', '#ECB', '#BOE', '#RBA', '#ISM'];
  for (var j = 0; j < priorityOrder.length; j++) {
    if (eventTags.indexOf(priorityOrder[j]) !== -1) {
      return priorityOrder[j];
    }
  }

  return eventTags[0]; // フォールバック(優先度テーブル外のタグが渡された場合)
}

/** 複数キーワードの出現回数を合計 */
function countAnyTag_(text, keywords) {
  var total = 0;
  for (var i = 0; i < keywords.length; i++) {
    var re = new RegExp(keywords[i], 'g');
    var matches = text.match(re);
    total += matches ? matches.length : 0;
  }
  return total;
}

/**
 * TC（Trading Complete）言及を含む文を除去する
 * プロンプト指示で禁止しても、Geminiがすり抜けて書くことがあるため後処理で対応
 */
function removeTCMention_(text) {
  var original = text;
  var lines = text.split('\n');
  var filtered = [];
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Trading Complete または TradingComplete を含む行を除去
    if (/Trading\s*Complete/i.test(line)) {
      continue;
    }
    filtered.push(line);
  }
  
  var result = filtered.join('\n');
  // 除去後に3連続以上の改行があれば整理
  result = result.replace(/\n{3,}/g, '\n\n');
  
  if (result !== original) {
    console.log('📌 TC言及を除去しました（禁止タイプ）');
  }
  
  return result;
}


/**
 * ★v12.7: 指定した行に「未来日付＋過去形文脈」が含まれているかを判定する
 * 
 * ロジック:
 *   1. 行から日付パターンを抽出（M月D日・M/D・April X等）
 *   2. 抽出日付が今日より後か判定
 *   3. 今日より後の場合:
 *      a. 未来予定キーワード（予定・注目等）が含まれる → 保持（false）
 *      b. 過去形キーワード（発言・示唆・昨夜等）が含まれる → 削除（true）
 *      c. どちらもない → 保持（false・安全側に倒す）
 * 
 * @param {string} line - 検査対象の行
 * @param {Date} [today] - 判定基準日（省略時は現在）
 * @return {boolean} 削除すべき行ならtrue
 */

/** 
 * ★v14.0 Phase R-3 修正(2026-04-23): 
 *   Phase R-3 分割時に postProcessor.gs から移動漏れしていた定数群。
 *   isFutureDatePastTenseLine_ で使用される。
 */

/** 削除対象となる過去形/完了形のキーワード（これらが文脈にあれば未来日付を削除） */
var PAST_TENSE_KEYWORDS = [
  // 発言系
  'が発言', 'と発言', 'を発言', 'が示唆', 'と示唆', 'を示唆',
  'が表明', 'と表明', 'を表明', 'が発表', 'を発表',
  'が明らかに', 'を明らか', 'が公表', 'を公表',
  // 起きた系
  'が起きた', 'が起こった', 'が発生', '事件が', '発生した',
  'となった', '決裂した', '合意した', '成立した',
  // 受動系（結果受領）
  'が示された', 'が判明', 'を受けて', 'を受け',
  'で確認された', 'が確認された',
  // ★v12.7 追加: 結果の示現系（雇用統計・CPI等の発表結果）
  'を示した', 'を示唆した', '結果が', '発表された',
  '上振れ', '下振れ', '予想を上回', '予想を下回',
  // 時制副詞+過去
  '昨夜', '昨日', '今朝', '今日未明', '今未明',
  // 直接の過去形語尾（比較的ゆるいパターン）
  'しました', 'されました', 'だった', 'ました'
];

/** 保持対象となる未来予定/予想の文脈キーワード（これらがあれば削除しない） */
var FUTURE_INTENT_KEYWORDS = [
  '予定', '予想', '見込み', '見通し', '控える', '控えた',
  'に注目', 'に焦点', '公表予定', '発表予定', '開催予定',
  '可能性', '可能性が', 'かもしれ', 'だろう', 'でしょう',
  '待ち', '待たれる', '注視', '警戒', '警戒感'
];

function isFutureDatePastTenseLine_(line, today) {
  if (!line || line.length === 0) return false;
  today = today || new Date();
  var thisYear = today.getFullYear();
  var todayMonth = today.getMonth() + 1; // 1-12
  var todayDate = today.getDate();
  
  // 日付パターン抽出（複数候補）
  var candidates = [];
  
  // パターン1: M月D日
  var m1;
  var re1 = /(\d{1,2})月(\d{1,2})日/g;
  while ((m1 = re1.exec(line)) !== null) {
    candidates.push({ month: parseInt(m1[1], 10), date: parseInt(m1[2], 10) });
  }
  
  // パターン2: M/D（年なし・スラッシュ区切り）
  // レート数値（1.1803等）や通貨ペア（EUR/USD）と誤認しないよう、前後に文字種制限
  var m2;
  var re2 = /(?:^|[^0-9A-Z.\/])(\d{1,2})\/(\d{1,2})(?![0-9A-Z.\/])/g;
  while ((m2 = re2.exec(line)) !== null) {
    var mo = parseInt(m2[1], 10);
    var da = parseInt(m2[2], 10);
    // 妥当な日付範囲（1-12月・1-31日）
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      candidates.push({ month: mo, date: da });
    }
  }
  
  // パターン3: April D, Apr D（英語月名）
  var monthMap = {
    'January': 1, 'Jan': 1, 'February': 2, 'Feb': 2, 'March': 3, 'Mar': 3,
    'April': 4, 'Apr': 4, 'May': 5, 'June': 6, 'Jun': 6,
    'July': 7, 'Jul': 7, 'August': 8, 'Aug': 8, 'September': 9, 'Sep': 9,
    'October': 10, 'Oct': 10, 'November': 11, 'Nov': 11, 'December': 12, 'Dec': 12
  };
  var m3;
  var re3 = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/g;
  while ((m3 = re3.exec(line)) !== null) {
    candidates.push({ month: monthMap[m3[1]], date: parseInt(m3[2], 10) });
  }
  
  if (candidates.length === 0) return false; // 日付なし→保持
  
  // 今日より後の日付が1つでもあるか
  var hasFutureDate = false;
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    if (c.month > todayMonth || (c.month === todayMonth && c.date > todayDate)) {
      hasFutureDate = true;
      break;
    }
  }
  
  if (!hasFutureDate) return false; // 未来日付なし→保持
  
  // 未来予定キーワードがあれば保持（ホワイトリスト優先）
  for (var j = 0; j < FUTURE_INTENT_KEYWORDS.length; j++) {
    if (line.indexOf(FUTURE_INTENT_KEYWORDS[j]) !== -1) {
      return false; // 未来予定文脈→保持
    }
  }
  
  // 過去形キーワードがあれば削除
  for (var k = 0; k < PAST_TENSE_KEYWORDS.length; k++) {
    if (line.indexOf(PAST_TENSE_KEYWORDS[k]) !== -1) {
      return true; // 未来日付＋過去形→削除
    }
  }
  
  // 未来日付はあるが過去形も未来予定もない→保持（安全側）
  return false;
}

/**
 * ★v12.7: 投稿本文から「未来日付＋過去形文脈」の行を削除する
 * 
 * 削除された内容は「未来日付ガード発動ログ」シートに記録（週次レビュー用）
 * 
 * @param {string} text - 投稿テキスト
 * @return {string} 削除処理後のテキスト
 */
function removeFutureDateLines_(text) {
  if (!text) return text;
  
  var lines = text.split('\n');
  var kept = [];
  var removedLines = [];
  var today = new Date();
  
  for (var i = 0; i < lines.length; i++) {
    if (isFutureDatePastTenseLine_(lines[i], today)) {
      removedLines.push(lines[i]);
      console.log('⚠️ 未来日付＋過去形文脈を検出→行削除: ' + lines[i].substring(0, 80));
    } else {
      kept.push(lines[i]);
    }
  }
  
  // 削除があった場合、ログシートに記録
  if (removedLines.length > 0) {
    try {
      logFutureDateGuard_('postBody', removedLines.join(' | '));
    } catch (logErr) {
      console.log('⚠️ 未来日付ガードログ記録失敗（続行）: ' + logErr.message);
    }
  }
  
  return kept.join('\n');
}

