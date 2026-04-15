/**
 * CompanaFXAutoPost - postProcessor.gs
 * 後処理チェーン（テキスト整形・検証・ハッシュタグ生成）
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 2）
 * 
 * generatePost内で生成テキストに対して順番に適用される:
 *   removeForeignText_ → stripAIPreamble_ → enforceLineBreaks_
 *   → removeDisallowedEmoji_ → fixOrphanedVariationSelector_（★v8.14: 孤立U+FE0F修復）
 *   → removeMarkdown_ → replaceProhibitedPhrases_
 *   → fixMondayYesterday_（月曜のみ） → removeDuplicateBlocks_
 *   → removeOrphanedLines_（★v8.12: 孤立短文除去）
 *   → fixBrokenSentenceEndings_（★v8.14: 壊れた句点修復）
 *   → truncateAfterHashtag_ → generateDynamicHashtags_
 *   → fixMissingDecimalPoint_ → fixHallucinatedRates_
 *   → validateFinalFormat_（安全網）
 * 
 * 設計の鉄則:
 *   - 正規表現で \b は使わない（二重小数点バグの原因）
 *   - \s は改行を含む → 行頭処理は [ \t]+ を使う
 *   - 新しい後処理を追加する前に既存チェーンへの影響を検証すること
 */

// ===== 外国語テキスト検出・除去 =====
function removeForeignText_(text) {
  // 許可する文字: 日本語（ひらがな、カタカナ、漢字、全角記号）、
  // 数字、基本記号、通貨ペア表記（A-Z/）、絵文字、改行・スペース
  // 許可しない文字: キリル文字、ベンガル文字、アラビア文字、タイ文字、タミル文字等
  
  // ① 英語（括弧書き）パターンを除去: "Hesitation（躊躇）" → "躊躇"
  // 半角英字の後に全角括弧で日本語が続くパターン
  text = text.replace(/[A-Za-z]+[\s]*（([^）]+)）/g, '$1');
  // 半角英字の後に半角括弧で日本語が続くパターン  
  text = text.replace(/[A-Za-z]+[\s]*\(([^\)]+)\)/g, '$1');
  
  // ② 文中に突然現れる英単語を除去（通貨ペア・固有名詞は許可）
  // 許可: USD, JPY, EUR, GBP, AUD, CPI, GDP, FOMC, FRB, ECB, BOE, BOJ, RBA, PPI, PCE, FX, TC, PF, CSV, OHLC
  // 許可: Trading, Complete, Fed, S&P, RSI, ADP, MBA, NFP, MACD, NZD, CHF, CAD, WTI, Excel
  // 3文字以上の英単語で許可リストにないものを除去
  // ★v8.8.1: \b → 明示的な非英字境界に変更（設計の鉄則準拠）
  text = text.replace(/(^|[^A-Za-z])(?!USD|JPY|EUR|GBP|AUD|NZD|CHF|CAD|CPI|GDP|FOMC|FRB|ECB|BOE|BOJ|RBA|PPI|PCE|FX|TC|PF|CSV|HICP|NY|Fed|ETF|ISM|PMI|RSI|ADP|MBA|NFP|MACD|WTI|Trading|Complete|SNS|OHLC|API|Excel)[A-Za-z]{3,}(?=[^A-Za-z]|$)/g, '$1');
  
  // ③ 外国語文字のパターン（キリル、ベンガル、アラビア、デーヴァナーガリー、タイ、タミル、テルグ等）
  var foreignPattern = /[\u0400-\u04FF\u0980-\u09FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u0530-\u058F\u10A0-\u10FF\u1100-\u11FF\uAC00-\uD7AF\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/g;
  
  if (foreignPattern.test(text)) {
    text = text.replace(/[\u0400-\u04FF\u0980-\u09FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u0530-\u058F\u10A0-\u10FF\u1100-\u11FF\uAC00-\uD7AF\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]+/g, '');
  }
  
  // ★v6.0.1: ラテン拡張文字（アクセント付き等）の除去
  // 例: é, ñ, ü, ö 等 — Geminiが外国語混入時に1文字だけ残るケース
  text = text.replace(/[\u00C0-\u00FF\u0100-\u024F]/g, '');

  // ④ 残骸の整理（連続スペース、空の括弧等）
  text = text.replace(/（\s*）/g, '');
  text = text.replace(/\(\s*\)/g, '');
  // ★v5.5.3: 英語除去後に残るカタカナ音訳括弧を除去 例: (ヒエヒエ) (リノク)
  text = text.replace(/\s*\([\u30A0-\u30FF]{2,8}\)/g, '');
  text = text.replace(/\s*（[\u30A0-\u30FF]{2,8}）/g, '');
  // ★v5.5.3: 英語除去後に孤立した接尾辞を修復
  // 例: "European勢" → " 勢" → 削除、"London勢" → " 勢" → 削除
  text = text.replace(/[、。\s]\s*勢が/g, function(m) {
    // 文脈が失われているので文全体は残すが「勢」を一般的な表現に
    return m.charAt(0) === '、' ? '、市場参加者が' : m.charAt(0) === '。' ? '。市場参加者が' : ' 市場参加者が';
  });
  text = text.replace(/[、。\s]\s*勢[はもの]/g, function(m) {
    var suffix = m.charAt(m.length - 1);
    return m.charAt(0) === '、' ? '、市場参加者' + suffix : m.charAt(0) === '。' ? '。市場参加者' + suffix : ' 市場参加者' + suffix;
  });
  text = text.replace(/、\s*、/g, '、');
  text = text.replace(/  +/g, ' ');
  text = text.replace(/\n +/g, '\n');
  
  return text;
}

/**
 * AI前置きを自動除去する
 * Geminiがプロンプト指示を無視して出力する「はい、承知しました」等の前置きを除去
 */
function stripAIPreamble_(text) {
  var original = text;
  
  // --- Phase 1: 「---」セパレータの前のメタ説明を丸ごと除去 ---
  // Geminiが「〜を作成します。\n説明文\n---\n本文」と出力するパターン
  var separatorMatch = text.match(/^[\s\S]*?\n---\n/);
  if (separatorMatch && separatorMatch[0].length < 500) {
    // 「---」前が500文字未満（メタ説明が短い場合のみ除去）
    text = text.replace(/^[\s\S]*?\n---\n/, '');
  }
  
  // --- Phase 2: 行頭の前置き文を除去 ---
  var preamblePatterns = [
    /^はい[、。].+?[。\n]/,
    /^承知[いし].+?[。\n]/,
    /^了解[いし].+?[。\n]/,
    /^かしこまりました.+?[。\n]/,
    /^以下[にが].+?[。\n]/,
    /^作成[しい].+?[。\n]/,
    // 挨拶系
    /^おはようございます.+?[。\n]/,
    /^こんにちは.+?[。\n]/,
    /^こんばんは.+?[。\n]/,
    /^コンパナです.+?[。\n]/,
    /^.{0,10}コンパナです[。\n]?/,
    // メタ説明系
    /^.{0,40}(ブリーフィング|をお届け|市場まとめ|サマリー|レポート).+?[。\n]/,
    /^.{0,10}\d+月\d+日.+?(お届け|まとめ|ブリーフィング|レポート).+?[。\n]/,
    // ランチタイム/朝の等の前置き
    /^☕?(ランチタイム|お昼|朝の|今朝の).{0,20}(まとめ|レポート|サマリー|ブリーフィング).+?[。\n]?/,
    // ★v5.5.3: ランチ挨拶パターン
    /^☕?(お昼休み|ランチタイム).{0,30}(でしょうか|ですか)[？?]\n?/,
    // 「〇〇投稿を作成します」系
    /^.{0,30}投稿を作成.+?[。\n]/,
    /^.{0,30}についてまとめ.+?[。\n]/,
    /^.{0,30}を投稿.+?[。\n]/,
    /^.{0,30}を発信.+?[。\n]/,
    // 「コンパナとして」系
    /^コンパナとして.+?[。\n]/,
    // 「Trading Complete...コンパナです」系
    /^Trading Complete.+?コンパナです[。\n]?/,
    /^Trading Complete.+?[。\n]/,
    // 「今週の〇〇を振り返り」系のメタ文
    /^.{0,20}振り返り投稿を作成.+?[。\n]/,
    // 「それでは、投稿を作成します」系
    /^それでは[、].+?[。\n]/,
    // ★v5.5.3: 「投稿テキスト」単体行（Geminiがラベルとして出力するパターン）
    /^投稿テキスト\s*\n?/,
    // ★v6.0.2: 「Trading FX〜コンパナです」自己紹介系
    /^Trading.{0,50}(コンパナ|開発)[^。]*[。\n]?/,
    // ★v6.0.2: 「投資で自分を満たし〜」モットー行
    /^「投資で.{0,60}[。\n]?/,
    // ★v6.0.2: 「ペルソナ「コンパナ」として〜」メタ指示漏れ
    /^ペルソナ.{0,100}[。\n]/,
    // ★v6.0.2: 昼休み挨拶系
    /^(昼休み|お昼休み).{0,30}(でしょうか|ですか|過ごし)[？?。\n]?/,
    // ★v6.0.3: 「【修正案】」ラベル行（絵文字リトライ時にGeminiが付与するケース）
    /^【修正案】\s*\n?/,
    // ★v6.0.3: 「〜キャラクター設定〜指示に従って〜」メタ説明
    /^.{0,50}(キャラクター設定|指示に従って|指示に基づき).+?[。\n]/,
    // ★v6.0.3: 「X投稿」単体行（Geminiがラベルとして出力するパターン）
    /^X投稿\s*\n?/,
    // ★v6.3: autoFixPost_由来のメタ行を汎用除去
    // 先頭行に「修正」「投稿テキスト」「以下の通り」が含まれればメタ行と判定
    /^.{0,60}(修正後|修正を|投稿テキスト|以下の通り|投稿の修正).+?[。：:\n]/,
    /^【(修正後|修正前|元の|原文)[^】]*】\s*\n?/,
    // ★v6.1: 「〜コンパナとして〜作成/投稿します」メタ説明（autoFixPost_由来）
    /^.{0,50}コンパナとして.{0,30}(作成|投稿).+?[。\n]/,
    // ★v5.9: 「〜すべて理解しました。」長文プロンプト読み上げ行
    // Geminiがセクション名を列挙して「すべて理解しました」と出力するパターン
    /^.+すべて理解しました[。]?\n?/,
    // ★v5.9: 「今週の相場を振り返る投稿を作成します。」系
    /^.{0,30}振り返る投稿を作成.+?[。\n]/,
    /^今週の相場を振り返.+?[。\n]/,
  ];
  
  // 最大3回ループ（複数行の前置きに対応）
  for (var round = 0; round < 3; round++) {
    var changed = false;
    for (var i = 0; i < preamblePatterns.length; i++) {
      var before = text;
      text = text.replace(preamblePatterns[i], '');
      if (text !== before) changed = true;
    }
    if (!changed) break;
    text = text.replace(/^[\s\n]+/, '');
  }
  
  // 先頭の空白・改行を除去
  text = text.replace(/^[\s\n]+/, '');
  
  if (text !== original) {
    console.log('⚠️ AI前置きを除去しました');
  }
  
  return text;
}

/**
 * 改行ルールを強制する後処理
 * 「。」「？」の後に改行がなければ自動挿入
 */
function enforceLineBreaks_(text) {
  var original = text;
  
  // ★v6.9: 行末絵文字を行頭に移動（「テキスト✅」→「✅テキスト」）
  var allowedEmojis = ['📕', '📝', '📋', '☕', '💡', '⚠️', '✅'];
  allowedEmojis.forEach(function(emoji) {
    // 行末に絵文字があるパターン: テキスト絵文字\n または テキスト絵文字（末尾）
    var emojiEscaped = emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 「（絵文字以外の文字）絵文字」が行末にあれば → 行頭に移動
    text = text.replace(new RegExp('([^\n' + emojiEscaped + '])' + emojiEscaped + '(\n|$)', 'gu'),
      function(match, before, after) {
        return emoji + before + after;
      }
    );
  });

  // ★v6.0.3→v12.5.4: →の前に改行を強制（行頭以外の→は改行して行頭にする）
  // 例: 「☕今夜は米指標ラッシュ→インフレ指標」→「☕今夜は米指標ラッシュ\n→インフレ指標」
  // ただし既に行頭にある→はスキップ
  // ★v12.5.4: 数値変化の→（例: 4.35%→4.10%）は改行しない
  text = text.replace(/([^\n])→(?!\d)/g, '$1\n→');
  
  // 「。」の後に改行でない文字が続く場合、改行を挿入
  text = text.replace(/。([^\n])/g, '。\n$1');
  
  // 「？」の後に改行でない文字が続く場合、改行を挿入
  // ただし「」内の？では改行しない（セリフの分断を防ぐ）
  // 方針: 一旦全ての？で改行 → 「...？\n...」のパターンを修復
  text = text.replace(/？([^\n」])/g, '？\n$1');
  
  // 「〜？\n」+ 次の行が「」で終わるパターン → かぎカッコ内だったので改行を戻す
  // 例: 「どこまで上がるんだ？\n」→「どこまで上がるんだ？」に修復
  text = text.replace(/？\n([^」\n]*」)/g, '？$1');
  
  // ★v5.8: 空行（段落区切り）の自動挿入
  // 改行のみ（空行なし）が3行以上連続したら、3行目の後に空行を挿入
  var lines = text.split('\n');
  var newLines = [];
  var consecutiveCount = 0;
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var isEmpty = line.trim() === '';
    
    if (isEmpty) {
      consecutiveCount = 0;
      newLines.push(line);
      continue;
    }
    
    consecutiveCount++;
    newLines.push(line);
    
    // 3行連続テキストの後に空行を挿入（次の行がテキストの場合のみ）
    if (consecutiveCount >= 3 && i + 1 < lines.length && lines[i + 1].trim() !== '') {
      newLines.push('');
      consecutiveCount = 0;
    }
  }
  text = newLines.join('\n');
  
  // ★v5.8: 絵文字で始まる行（新しい話題）の前に空行を確保（ノート形式）
  text = text.replace(/([^\n])\n([📕📝📋☕💡✅])/gu, '$1\n\n$2');
  text = text.replace(/([^\n])\n(⚠️)/g, '$1\n\n$2');
  
  // 【】見出し行の前に空行を確保（先頭行を除く）
  text = text.replace(/([^\n])\n(【)/g, '$1\n\n$2');
  
  // 3連続以上の改行を2連続に正規化
  text = text.replace(/\n{3,}/g, '\n\n');

  // v5.8: shime arrow removal
  var paragraphs = text.split('\n\n');
  if (paragraphs.length >= 2) {
    var lastP = paragraphs[paragraphs.length - 1];
    if (/^→/.test(lastP.trim())) {
      paragraphs[paragraphs.length - 1] = lastP.replace(/^→/, '').trim();
      text = paragraphs.join('\n\n');
      console.log('📌 締めの→を除去しました');
    }
  }
  
  if (text !== original) {
    console.log('📌 改行を自動挿入しました');
  }
  return text;
}

/**
 * 禁止絵文字を後処理で機械的に除去
 * 許可: 📕📝📋☕💡⚠️✅ のみ（7種）
 * それ以外の絵文字は全て除去する
 * ★v5.8: 許可絵文字でも4個目以降を除去（スパム判定回避）
 */
function removeDisallowedEmoji_(text) {
  var original = text;
  
  // 許可する絵文字のコードポイント
  // 📕 U+1F4D5, 📝 U+1F4DD, 📋 U+1F4CB, ☕ U+2615, 💡 U+1F4A1, ⚠ U+26A0, ✅ U+2705
  // ⚠️はU+26A0 + U+FE0F（variation selector）
  
  // 絵文字の正規表現（広範囲にマッチ）
  // Supplementary Multilingual Plane の絵文字 (U+1F000-1FFFF) をサロゲートペアで
  // U+1F000-1FFFF → \uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]
  // Basic Multilingual Plane の記号 (U+2600-27BF, U+2B50等)
  
  var result = '';
  var i = 0;
  var removed = [];
  
  while (i < text.length) {
    var code = text.charCodeAt(i);
    
    // サロゲートペア（U+10000以上の文字）
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      var low = text.charCodeAt(i + 1);
      var codePoint = ((code - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
      
      // 許可する絵文字のコードポイント
      if (codePoint === 0x1F4D5 || // 📕
          codePoint === 0x1F4DD || // 📝
          codePoint === 0x1F4CB || // 📋
          codePoint === 0x1F4A1) { // 💡
        result += text.charAt(i) + text.charAt(i + 1);
        i += 2;
        continue;
      }
      
      // 絵文字範囲にある場合は除去
      if (codePoint >= 0x1F300 && codePoint <= 0x1FAFF) {
        removed.push(text.charAt(i) + text.charAt(i + 1));
        i += 2;
        continue;
      }
      
      // 絵文字でなければそのまま
      result += text.charAt(i) + text.charAt(i + 1);
      i += 2;
      continue;
    }
    
    // BMP内の絵文字的記号
    if (code === 0x2615) { // ☕
      result += text.charAt(i);
      i++;
      continue;
    }
    if (code === 0x26A0) { // ⚠
      result += text.charAt(i);
      i++;
      continue;
    }
    if (code === 0x2705) { // ✅
      result += text.charAt(i);
      i++;
      continue;
    }
    if (code === 0xFE0F) { // Variation Selector（⚠️の後半）
      result += text.charAt(i);
      i++;
      continue;
    }
    
    // その他のBMP絵文字記号を除去（U+2600-27BF、一部除外済み）
    if (code >= 0x2600 && code <= 0x27BF && 
        code !== 0x2615 && code !== 0x26A0 && code !== 0x2705) {
      removed.push(text.charAt(i));
      i++;
      continue;
    }
    
    // 通常文字
    result += text.charAt(i);
    i++;
  }
  
  if (removed.length > 0) {
    console.log('🚫 禁止絵文字を' + removed.length + '個除去: ' + removed.join(''));
  }
  
  // 絵文字除去後の不自然な空白を整理
  result = result.replace(/^ +/gm, '');  // 行頭の半角スペース
  result = result.replace(/\n{3,}/g, '\n\n');  // 3連続以上の改行
  
  // ★v5.8: 許可絵文字でも4個目以降を除去（スパム判定回避）
  var MAX_EMOJI = 3;
  var allowedCodePoints = [0x1F4D5, 0x1F4DD, 0x1F4CB, 0x1F4A1, 0x2615, 0x26A0, 0x2705];
  var emojiCount = 0;
  var limited = '';
  var j = 0;
  while (j < result.length) {
    var c2 = result.charCodeAt(j);
    var isAllowedEmoji = false;
    var charLen = 1;
    
    // サロゲートペア
    if (c2 >= 0xD800 && c2 <= 0xDBFF && j + 1 < result.length) {
      var low2 = result.charCodeAt(j + 1);
      var cp2 = ((c2 - 0xD800) * 0x400) + (low2 - 0xDC00) + 0x10000;
      charLen = 2;
      for (var ac = 0; ac < allowedCodePoints.length; ac++) {
        if (cp2 === allowedCodePoints[ac]) { isAllowedEmoji = true; break; }
      }
    }
    // BMP絵文字
    if (c2 === 0x2615 || c2 === 0x26A0 || c2 === 0x2705) {
      isAllowedEmoji = true;
    }
    
    if (isAllowedEmoji) {
      emojiCount++;
      if (emojiCount <= MAX_EMOJI) {
        limited += result.substring(j, j + charLen);
      }
      // 4個目以降は追加しない（スキップ）
      j += charLen;
    } else {
      limited += result.charAt(j);
      j++;
    }
  }
  
  if (emojiCount > MAX_EMOJI) {
    console.log('🚫 絵文字を' + emojiCount + '個→' + MAX_EMOJI + '個に制限しました');
    result = limited;
  }
  
  return result;
}


/**
 * ★v8.14: 孤立したvariation selector (U+FE0F) を修復する
 * Geminiが品質修正でテキストを書き直す際に、⚠️のベース文字 ⚠(U+26A0) を
 * 落としてU+FE0Fだけ残すパターンへの対策。
 * 
 * - 行頭の孤立U+FE0F → ⚠️に復元（絵文字ブロックヘッダーだった可能性が高い）
 * - 文中の孤立U+FE0F → 除去（残骸）
 */
function fixOrphanedVariationSelector_(text) {
  var before = text;
  var lines = text.split('\n');
  var fixed = [];
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    
    // 行頭の孤立U+FE0F → ⚠️に復元
    if (line.length > 0 && line.charCodeAt(0) === 0xFE0F) {
      line = '\u26A0\uFE0F' + line.substring(1);
    }
    
    // 行中の孤立U+FE0Fを除去（前の文字がベース絵文字でない場合）
    var result = '';
    for (var j = 0; j < line.length; j++) {
      if (line.charCodeAt(j) === 0xFE0F) {
        var prev = j > 0 ? line.charCodeAt(j - 1) : 0;
        // 正常なベース文字の後のU+FE0Fは保持
        if (prev === 0x26A0 || prev === 0x2615 || prev === 0x2705 ||
            prev === 0x2764 || prev === 0x2B50 || prev === 0x203C || prev === 0x2049) {
          result += line.charAt(j);
        }
        // それ以外は孤立→除去（何も追加しない）
      } else {
        result += line.charAt(j);
      }
    }
    fixed.push(result);
  }
  
  text = fixed.join('\n');
  if (text !== before) {
    console.log('📌 孤立variation selectorを修復しました');
  }
  return text;
}


/**
 * Markdown記法を後処理で除去
 * Geminiが稀にMarkdown記法を混入するため、機械的に除去する
 */
function removeMarkdown_(text) {
  var original = text;
  
  // **太字** → 太字
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  // *斜体* → 斜体
  text = text.replace(/\*(.+?)\*/g, '$1');
  // ## 見出し → 見出し
  text = text.replace(/^#{1,6}\s*/gm, '');
  // --- 区切り線
  text = text.replace(/^-{3,}$/gm, '');
  // [リンクテキスト](URL)→リンクテキスト
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // `コード` → コード
  text = text.replace(/`([^`]+)`/g, '$1');
  // 空行の整理
  text = text.replace(/\n{3,}/g, '\n\n');
  
  if (text !== original) {
    console.log('📌 Markdown記法を除去しました');
  }
  
  return text;
}

/**
 * 禁止表現を後処理で置換
 * プロンプトで制御しきれない表現を機械的に修正する
 * ★v5.5.3: 二重表記除去、答え合わせローテーション、丁寧すぎ修正を追加
 */
function replaceProhibitedPhrases_(text) {
  var original = text;
  var changes = [];
  
  // === 通貨ペア二重表記の除去 ★v5.5.3 ===
  // Geminiが「USD/ドル円」「GBP/ポンドドル」のように英語記号+日本語名を重複させる
  if (/[A-Z]{3}\//.test(text)) {
    var beforeDup = text;
    text = text.replace(/USD\/ドル円/g, 'ドル円');
    text = text.replace(/EUR\/ユーロドル/g, 'ユーロドル');
    text = text.replace(/GBP\/ポンドドル/g, 'ポンドドル');
    text = text.replace(/EUR\/ユーロ円/g, 'ユーロ円');
    text = text.replace(/GBP\/ポンド円/g, 'ポンド円');
    text = text.replace(/AUD\/豪ドル円/g, '豪ドル円');
    text = text.replace(/AUD\/豪ドル/g, '豪ドル');
    if (text !== beforeDup) changes.push('二重表記除去');
  }
  
  // ★v7.10b: 日本語名の括弧付き二重表記を除去
  // Geminiが「豪ドル米ドル（豪ドル米ドル）」「ドル円（ドル円）」のように同名を括弧で繰り返すパターン
  var beforeJpDup = text;
  text = text.replace(/(ドル円|ユーロドル|ポンドドル|ユーロ円|ポンド円|豪ドル円|豪ドル米ドル)[（\(]\1[）\)]/g, '$1');
  if (text !== beforeJpDup) changes.push('日本語二重表記除去');
  
  // === レート小数点脱落の修正 ★v5.5.3 / v6.0.1拡張 / v8.2.1修正 ===
  // Geminiが「1.1838ドル」を「11838ドル」と書く問題を修正
  // 1XXXX形式（5桁）でドルが続く場合、小数点を挿入
  // ★v8.2.1: \b → (^|[^0-9.]) に変更。\bは小数点の直後にもマッチするため
  //   「1.15916ドル」の中の「15916」にヒットして「1.1.5916ドル」に壊していた
  var beforeDecimal = text;
  text = text.replace(/(^|[^0-9.])(1\d{4})(ドル)/g, function(match, prefix, num, suffix) {
    return prefix + num.charAt(0) + '.' + num.substring(1) + suffix;
  });
  // ★v6.0.1: 0XXXX形式（AUD/USD等の0.7台レート）の小数点脱落も修正
  // 例: 「07068ドル」→「0.7068ドル」、「07119ドル」→「0.7119ドル」
  // ★v8.2.1: 同上の\b修正
  text = text.replace(/(^|[^0-9.])(0\d{4})(ドル)/g, function(match, prefix, num, suffix) {
    return prefix + num.charAt(0) + '.' + num.substring(1) + suffix;
  });
  if (text !== beforeDecimal) changes.push('レート小数点修正');
  
  // 「様子見」系 → 「静観」系に置換
  if (text.indexOf('様子見') !== -1) {
    text = text.replace(/様子見が賢明/g, '静観が賢明');
    text = text.replace(/様子見ムード/g, '静観ムード');
    text = text.replace(/様子見/g, '静観');
    changes.push('様子見→静観');
  }
  
  // ★v8.6: 「皆さん」等の大勢への呼びかけを除去（1対1の語りかけスタンスを維持）
  if (text.indexOf('皆さん') !== -1 || text.indexOf('フォロワー') !== -1) {
    var beforeMinasan = text;
    text = text.replace(/皆さん、[ \t]*/g, '');
    text = text.replace(/皆さんは[ \t]*/g, '');
    text = text.replace(/皆さんも[ \t]*/g, '');
    text = text.replace(/フォロワーの皆様[、,]?[ \t]*/g, '');
    text = text.replace(/フォロワーの皆さん[、,]?[ \t]*/g, '');
    if (text !== beforeMinasan) changes.push('呼びかけ除去');
  }
  
  // ★v8.14: 「ここからが本番」壊れパターン除去（Geminiが好む定型句。品質修正で壊れやすい）
  // 「、ここからが本番。ですね。」のように句点が不自然に入るケースのみ対象
  // 正常な「ここからが本番ですね。」は壊れていないのでそのまま通す
  if (text.indexOf('ここからが本番') !== -1) {
    var beforeHonban = text;
    // 読点の後 + 句点で終わる壊れパターン: 「、ここからが本番。」→「。」
    text = text.replace(/[、,][ \t]*ここからが本番[。.]/g, '。');
    // 行頭・文頭 + 句点で終わる壊れパターン: 「ここからが本番。」→ 除去
    text = text.replace(/ここからが本番[。.][ \t]*/g, '');
    if (text !== beforeHonban) changes.push('「ここからが本番」除去');
  }
  
  // ★v8.8: メタ的自己言及を含む文を除去（システムの裏側を暴露する表現）
  // 「投稿を作成します」「アラートの投稿を作成」等はボットであることを暴露する
  // stripAIPreamble_は行頭のみ対応。本文途中に出現するケースをここで除去
  var metaPatterns = [
    '投稿を作成',
    'ツイートを作成',
    '投稿を準備',
    'アラートの投稿',
    '次の投稿で',
    '別の投稿で',
    '指標アラートの投稿'
  ];
  var hasMetaRef = false;
  for (var mp = 0; mp < metaPatterns.length; mp++) {
    if (text.indexOf(metaPatterns[mp]) !== -1) {
      hasMetaRef = true;
      break;
    }
  }
  if (hasMetaRef) {
    var beforeMeta = text;
    var lines = text.split('\n');
    var cleaned = [];
    for (var li = 0; li < lines.length; li++) {
      var lineHasMeta = false;
      for (var mp2 = 0; mp2 < metaPatterns.length; mp2++) {
        if (lines[li].indexOf(metaPatterns[mp2]) !== -1) {
          lineHasMeta = true;
          break;
        }
      }
      if (!lineHasMeta) {
        cleaned.push(lines[li]);
      }
    }
    text = cleaned.join('\n');
    // 除去後の連続空行を整理
    text = text.replace(/\n{3,}/g, '\n\n');
    if (text !== beforeMeta) changes.push('メタ自己言及の文を除去');
  }
  
  // ★v8.8: 「あと○分で」残り時間表現を除去（承認タイムロスで不正確になるため）
  // 「あと30分で英国CPI発表」→「英国CPI発表」
  // 「あと約24分で日本時間9:30の」→「日本時間9:30の」
  var beforeCountdown = text;
  text = text.replace(/あと約?\d+分で/g, '');
  text = text.replace(/あと約?\d+時間で/g, '');
  text = text.replace(/あと約?\d+秒で/g, '');
  if (text !== beforeCountdown) changes.push('残り時間表現を除去');
  
  // ★v5.9: 「静観」がトレード判断として使われる表現を置換
  // 「様子見→静観」変換の後に実行し、最終的なトレード判断示唆を除去する
  if (text.indexOf('静観') !== -1) {
    var beforeSikan = text;
    // 「無理せず静観〜」パターン
    text = text.replace(/無理せず静観[^。\n]*/g, '無理せず休んで過去検証する日にしよう');
    // 「静観ってのもアリ」「静観するのもアリ」「静観が賢明」パターン
    text = text.replace(/静観(ってのも|するのも)(アリ|良い|いい)[^。\n]*/g, '一歩引いて相場を観察するのも大事');
    text = text.replace(/静観が賢明[^。\n]*/g, '一歩引いて相場を観察するのが大事');
    // 「今日は静観〜」「静観しよう」パターン
    text = text.replace(/今日は静観[^。\n]*/g, '今日は相場の観察に徹しよう');
    text = text.replace(/静観しよう[^。\n]*/g, '相場の観察に徹しよう');
    // ★v5.9: 「静観が一番」「無理に〜静観」パターン追加
    text = text.replace(/静観が一番[^。\n]*/g, '相場の観察に徹するのが大事');
    text = text.replace(/無理に[^。\n]*静観[^。\n]*/g, '無理せず相場の観察に徹しよう');
    if (text !== beforeSikan) changes.push('静観トレード判断→観察に置換');
  }

  // 「見送る」「見送り」→ 削除ではなく置換
  // ★v5.5.3: 金融政策の文脈（利上げ/利下げを見送る）は正しい日本語なので置換しない
  if (text.indexOf('見送') !== -1) {
    // 金融政策の「見送る」を一時退避
    text = text.replace(/利上げを見送/g, '§HIKE_SKIP§');
    text = text.replace(/利下げを見送/g, '§CUT_SKIP§');
    text = text.replace(/追加利上げ[をが]見送/g, '§ADD_HIKE_SKIP§');
    // トレード判断の「見送る」のみ置換
    text = text.replace(/見送る/g, '一歩引く');
    text = text.replace(/見送り/g, '静観');
    // 金融政策を復元
    text = text.replace(/§HIKE_SKIP§/g, '利上げを見送');
    text = text.replace(/§CUT_SKIP§/g, '利下げを見送');
    text = text.replace(/§ADD_HIKE_SKIP§/g, '追加利上げを見送');
    changes.push('見送る→一歩引く');
  }
  
  // 「狙いたい」→ 文脈に応じて置換 ★v5.5修正
  if (text.indexOf('狙いたい') !== -1) {
    text = text.replace(/を狙いたいところ/g, 'が面白そうなところ');
    text = text.replace(/を狙いたい/g, 'が面白そう');
    text = text.replace(/狙いたいところ/g, '面白そうなところ');
    text = text.replace(/狙いたいですね/g, '面白そうですね');
    text = text.replace(/狙いたいかなと/g, '面白そうかなと');
    text = text.replace(/狙いたい/g, '面白そう');
    changes.push('狙いたい→面白そう');
  }
  
  // 「見極めたい」→ 4パターンでローテーション ★v5.5.3改善 ★v7.10修正: 句点付きで文を完結
  if (text.indexOf('見極めたい') !== -1) {
    var miCount = 0;
    var miReplacements = [
      '、ここが勝負どころ。',
      'の答え合わせはこれから。',
      '、結果を見届けよう。',
      '次第で景色が変わるかも。'
    ];
    text = text.replace(/を見極めたいところ|を見極めたいですね|を見極めたい|見極めたいところ|見極めたいですね|見極めたい/g, function() {
      var replacement = miReplacements[miCount % miReplacements.length];
      miCount++;
      return replacement;
    });
    changes.push('見極めたい→ローテーション');
  }
  
  // 「待ちたい」→ 文脈に応じて置換 ★v5.5修正
  if (text.indexOf('待ちたい') !== -1) {
    text = text.replace(/待ちたいところ/g, '見届けたいところ');
    text = text.replace(/待ちたいですね/g, '見届けたいですね');
    text = text.replace(/待ちたい/g, '見届けよう');
    changes.push('待ちたい→見届けよう');
  }
  
  // 「答え合わせ」の重複チェック ★v5.5.3
  // 1投稿内で2回以上出現した場合、2回目以降を別の表現に置換
  var kotaeCount = 0;
  var kotaeAlts = ['ここからが勝負', '結果はすぐ分かる', '今夜ハッキリする'];
  if ((text.match(/答え合わせ/g) || []).length >= 2) {
    text = text.replace(/答え合わせ/g, function(match) {
      kotaeCount++;
      if (kotaeCount === 1) return match; // 1回目はそのまま
      return kotaeAlts[(kotaeCount - 2) % kotaeAlts.length]; // 2回目以降は置換
    });
    changes.push('答え合わせ重複→分散');
  }
  
  // 「でスタート」「でクローズ」「で引け」の始値/終値断言を緩和
  text = text.replace(/(\d+\.?\d*)円でスタート/g, '$1円付近で推移');
  text = text.replace(/(\d+\.?\d*)円でクローズ/g, '$1円付近で取引を終えた');
  text = text.replace(/(\d+\.?\d*)ドルでスタート/g, '$1ドル付近で推移');
  text = text.replace(/(\d+\.?\d*)ドルでクローズ/g, '$1ドル付近で取引を終えた');
  
  // 丁寧すぎる表現の簡略化 ★v5.5.3
  if (/かと思います|かもしれませんね|意識しておきたいところです|注視したいところです/.test(text)) {
    var beforePolite = text;
    text = text.replace(/可能性もあるかと思います/g, 'かもしれないですね');
    text = text.replace(/可能性があるかと思います/g, 'かもしれないですね');
    text = text.replace(/かもしれませんね/g, 'かもですね');
    text = text.replace(/意識しておきたいところです/g, '意識したいところ');
    text = text.replace(/注視したいところです/g, '注目ですね');
    if (text !== beforePolite) changes.push('丁寧すぎ→カジュアル化');
  }
  
  // ★v5.8: 「7年かかった」→ 正確な表現に修正
  // FX歴7年だが、特定のことに7年かかったわけではない
  var before7y = text;
  text = text.replace(/[にで]7年かかり?ました/g, 'に3年かかりました');
  text = text.replace(/[にで]7年かかった/g, 'に3年かかった');
  text = text.replace(/7年越しに/g, '3年かけて');
  text = text.replace(/気づくのに7年/g, '気づくのに3年');
  text = text.replace(/7年間[かを]けて/g, '3年かけて');
  if (text !== before7y) changes.push('7年→3年に修正');
  
  // ★v5.5.3: 「500万溶かして」→ 事実に合った表現に修正
  // 実際は7割溶かしかけた（全額ではない）
  var before500 = text;
  text = text.replace(/500万[円]?溶かして/g, '500万溶かしかけて');
  text = text.replace(/500万[円]?を溶かして/g, '500万を溶かしかけて');
  text = text.replace(/500万[円]?溶かした/g, '500万溶かしかけた');
  text = text.replace(/500万[円]?を溶かした/g, '500万を溶かしかけた');
  if (text !== before500) changes.push('500万→溶かしかけて');
  
  // ★v5.5.3: レバレッジの数値脱落を修復（固定25倍）
  // 例: 「レバレッジをまで上げて」→「レバレッジを25倍まで上げて」
  var beforeLev = text;
  text = text.replace(/レバレッジをまで/g, 'レバレッジを25倍まで');
  if (text !== beforeLev) changes.push('レバレッジ数値補完');
  
  // ★v5.5.3: 一人称「私たち」→「僕たち」（コンパナの口調に統一）
  var beforeWatashi = text;
  text = text.replace(/私たちの/g, '僕たちの');
  text = text.replace(/私たちは/g, '僕たちは');
  text = text.replace(/私たちが/g, '僕たちが');
  if (text !== beforeWatashi) changes.push('私たち→僕たち');
  
  // ★v5.5.3: 「？\nで」→「？\nそれで」（Geminiが「それ」を脱落するパターン）
  var beforeDe = text;
  text = text.replace(/？\nで([そその])/g, '？\nそれで$1');
  text = text.replace(/？\nでその/g, '？\nそれでその');
  if (text !== beforeDe) changes.push('脱字「で」→「それで」');
  
  // リスト記号の除去（Geminiが稀に使う）
  text = text.replace(/^\*\s+/gm, '');
  
  // ★v5.5.3 / v6.0.1拡張: 半角ピリオド「.」を除去（日本語文末に不自然）
  // 例: 「豪ドルが売られている.」→「豪ドルが売られている」
  var beforePeriod = text;
  text = text.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])\.\s*$/gm, '$1');
  text = text.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])\.\s*\n/g, '$1\n');
  // ★v6.0.3: 文中の「日本語. 次の文」パターン（句点に変換して改行）
  // 例: 「ですよ. 世界最大の」→「ですよ。\n世界最大の」
  text = text.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])\.\s+/g, '$1。\n');
  // ★v6.0.3: 「す.」「る.」等の文末（スペースなし・次が日本語）
  // 例: 「注目してます.ちなみに」→「注目してます。\nちなみに」
  text = text.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])\.([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/g, '$1。\n$2');
  // ★v6.0.1: 半角ピリオド+句読点の二重パターンを除去
  // 例: 「状況.。」→「状況。」、「可能性.、」→「可能性、」
  text = text.replace(/\.(。|、|？)/g, '$1');
  if (text !== beforePeriod) changes.push('半角ピリオド除去');
  
  // ★v5.5.3: 二重読点「、、」を除去
  text = text.replace(/、、+/g, '、');
  
  // ★v5.5.3: 本文中の不自然な「00:00」時刻を除去
  text = text.replace(/\s*00:00\s*/g, ' ');
  text = text.replace(/\s*0:00\s*/g, ' ');
  
  // ★v5.5.3: 感嘆符「！」を除去（コンパナの口調にそぐわない）
  // 文末の「！」→ 直前が名詞/動詞なら「。」、疑問形なら「？」
  var before_excl = text;
  text = text.replace(/！\n/g, '\n');
  text = text.replace(/！$/gm, '');
  if (text !== before_excl) changes.push('感嘆符除去');
  // ★v5.9: 絵文字行と→行の間の空行を除去
  // 「☕〜ですね。\n\n→分析」→「☕〜ですね。\n→分析」
  var beforeEmptyArrow = text;
  text = text.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF。、」])\n\n(→)/g, '$1\n$2');
  if (text !== beforeEmptyArrow) changes.push('絵文字行→空行除去');

  // ★v6.0.1: 「→ 」の半角スペースを除去（Geminiが稀に「→ 重要なのは」と出力する）
  var beforeArrow = text;
  text = text.replace(/→\s+/g, '→');
  if (text !== beforeArrow) changes.push('→半角スペース除去');
  // ★v6.0.3: アスタリスク(*)を全除去（AI感が出るため禁止）
  // removeMarkdown_で**ペア**は除去するが、閉じていない**や改行またぎの**が残るケースがある
  var beforeAsterisk = text;
  text = text.replace(/\*/g, '');
  if (text !== beforeAsterisk) changes.push('アスタリスク除去');
  // ★v6.0.3: 孤立した全角カッコを除去
  // Geminiが（補足コメント）で囲む癖があり、改行処理後に（や）が孤立する
  var beforeParen = text;
  // 行末の「（」を除去: 「見える（\n」→「見える\n」
  text = text.replace(/（\s*\n/g, '\n');
  // 行頭の「）」を除去: 「\n）」→「\n」
  text = text.replace(/\n）\s*/g, '\n');
  // 行末の「）」を除去: 「注意！）\n」→「注意！\n」
  text = text.replace(/）\s*\n/g, '\n');
  // 文中の孤立「（」「）」（前後が日本語）
  text = text.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF！？])（\s*$/gm, '$1');
  text = text.replace(/^）/gm, '');
  // ★v5.9: 行内で「（」が開いたまま行末で閉じていない場合、「）」を補完
  // 例: 「米消費者物価指数（CPI」→「米消費者物価指数（CPI）」
  //      「カレンダー（3/16〜3/20」→「カレンダー（3/16〜3/20）」
  var lines = text.split('\n');
  lines = lines.map(function(line) {
    var openCount = (line.match(/（/g) || []).length;
    var closeCount = (line.match(/）/g) || []).length;
    if (openCount > closeCount) {
      // 閉じが足りない分だけ末尾に補完
      for (var i = 0; i < openCount - closeCount; i++) {
        line = line + '）';
      }
    }
    return line;
  });
  text = lines.join('\n');
  if (text !== beforeParen) changes.push('孤立カッコ除去');
  // ★v6.0.2: 通貨ペア英語表記を日本語名に変換
  // プロンプトで指示してもGeminiが英語表記（USD/JPY等）で出力するケースがあるため後処理で確実に変換
  var beforePairConvert = text;
  text = text.replace(/USD\/JPY/g, 'ドル円');
  text = text.replace(/EUR\/USD/g, 'ユーロドル');
  text = text.replace(/GBP\/USD/g, 'ポンドドル');
  text = text.replace(/EUR\/JPY/g, 'ユーロ円');
  text = text.replace(/GBP\/JPY/g, 'ポンド円');
  text = text.replace(/AUD\/JPY/g, '豪ドル円');
  text = text.replace(/AUD\/USD/g, '豪ドル米ドル');
  text = text.replace(/NZD\/USD/g, 'NZドル米ドル');
  text = text.replace(/NZD\/JPY/g, 'NZドル円');
  if (text !== beforePairConvert) changes.push('通貨ペア日本語化');
  
  // ★v5.9: `[: 自動計算]` 系プレースホルダーを除去
  // Geminiがテンプレートタグをそのまま出力するパターン
  var beforePlaceholder = text;
  text = text.replace(/\s*\[:\s*[^\]]+\]/g, '');
  text = text.replace(/\s*\[:\s*\]/g, '');
  if (text !== beforePlaceholder) changes.push('プレースホルダー除去');

  // ★v5.9: 数値脱落「 万円」補完
  // Geminiが「〇〇万円」の数値部分を脱落させて「 万円」にするパターン
  // 例: 「含み損はあっという間に 万円に」→「含み損はあっという間に数万円に」
  var beforeManen = text;
  text = text.replace(/(に|の|で|を|が|は|も)\s+万円/g, '$1数万円');
  if (text !== beforeManen) changes.push('数値脱落万円補完');

  // ★v5.9: 「静観」連続パターンの解消
  // 「様子見→静観」置換の副作用で同ブロック内に静観が2回出現するケース
  // 例: 「静観ムードで終わった\n→静観といったところか」→ 2行目を別表現に
  var beforeSikanDouble = text;
  text = text.replace(/静観といったところか/g, '小休止といったところか');
  text = text.replace(/静観の時間帯だった/g, '落ち着いた時間帯だった');
  text = text.replace(/静観で終わった/g, '小休止で終わった');
  if (text !== beforeSikanDouble) changes.push('静観連続→分散');

  // ★v5.9: パーセント表記の小数点脱落を修正
  // Geminiが「-1.29%」を「-129%」、「-0.35%」を「-035%」と出力するパターン
  var beforePct = text;
  // 3桁整数パターン: -129% → -1.29% / -128% → -1.28%
  text = text.replace(/-([1-9])(\d{2})([%％])/g, '-$1.$2$3');
  // 0始まり3桁パターン: -035% → -0.35%
  text = text.replace(/-0(\d{2})([%％])/g, '-0.$1$2');
  // ★v8.2.1: \b → (^|[^0-9.]) に変更。\bは小数点直後にもマッチするため
  //   「4.391%」の中の「391」にヒットして「4.3.91%」に壊していた
  // プラス方向も同様: 129% → 1.29%（本文でのパーセント変動表記）
  text = text.replace(/(^|[^0-9.])([1-9])(\d{2})([%％])/g, '$1$2.$3$4');
  if (text !== beforePct) changes.push('パーセント小数点修正');

  // ★v5.9: 「静観する」「静観かな」等の未登録パターンを追加
  // 既存の静観ブロックに追記（「静観」indexOf チェック内で実行）
  if (text.indexOf('静観') !== -1) {
    var beforeSikan2 = text;
    text = text.replace(/静観する[^。\n]*/g, '相場の観察に徹する');
    text = text.replace(/静観かな[^。\n]*/g, '一歩引いて様子を見ようかな');
    text = text.replace(/静観の姿勢[^。\n]*/g, '観察の姿勢');
    text = text.replace(/静観になっ[^。\n]*/g, '慎重になっ');
    if (text !== beforeSikan2) changes.push('静観追加パターン→置換');
  }

  // ★v5.9: 行頭の孤立スペースを除去（禁止絵文字除去後に残るパターン）
  // 例: 「 ホルムズ海峡の封鎖で」→「ホルムズ海峡の封鎖で」
  var beforeLeadingSpace = text;
  text = text.replace(/^[ \t]+([^\s])/gm, '$1');
  if (text !== beforeLeadingSpace) changes.push('行頭スペース除去');

  // ★v5.11: 「あなた」→「みなさん」置換（リプライ誘発質問の二人称禁止）
  // 「あなたはどうですか？」→「みなさんはどうですか？」
  // 「あなたも」「あなたは」等に対応。「あなた自身」は除外（体験談文脈はOK）
  var beforeAnata = text;
  text = text.replace(/あなたは/g, 'みなさんは');
  text = text.replace(/あなたも/g, 'みなさんも');
  text = text.replace(/あなたはどう/g, 'みなさんはどう');
  if (text !== beforeAnata) changes.push('あなた→みなさん');

  // ★v5.11: →直後の孤立助詞を除去（外国語除去後の残骸）
  // 例: 「→やボラティリティ指標」→「→ボラティリティ指標」
  // 英単語が外国語除去で消えた後、「や」「と」「も」「で」等が残るパターン
  // ★v8.8修正: カタカナが続く場合のみ除去。「→もし予想」「→では」等の誤除去を防止
  var beforeOrphanParticle = text;
  text = text.replace(/→(や|と|も|で|に|を|が|は)([\u30A0-\u30FF])/g, '→$2');
  if (text !== beforeOrphanParticle) changes.push('→直後の孤立助詞を除去');

  // ★v5.11: 数値脱落「 な〜」パターンを補完
  // 例: 「結局 な利益」→「結局わずかな利益」
  // Geminiが「わずかな」「ごくわずかな」等を脱落させてスペース+「な」が残るパターン
  var beforeNaDropout = text;
  text = text.replace(/(結局|最終的に|トータルで)\s+な([^\s])/g, '$1わずかな$2');
  text = text.replace(/\s+な(利益|損失|金額|結果|収益)/g, 'わずかな$1');
  if (text !== beforeNaDropout) changes.push('数値脱落「な」補完');

  // ★v5.11: 「今日一番」系の断言表現を置換（7ペアしか見ていない旨）
  var beforeIchiban = text;
  text = text.replace(/今日一番動いているのは[「『]?([^」』。\n]+)[」』]?/g, '今日注目しているのは$1');
  text = text.replace(/今日一番動いている([^。\n]*)/g, '今日ボラティリティのある$1');
  text = text.replace(/今日は一番動いている([^。\n]*)/g, '今日ボラティリティのある$1');
  text = text.replace(/最も動いているのは[「『]?([^」』。\n]+)[」』]?/g, '注目しているのは$1');
  text = text.replace(/一番注目すべきは[「『]?([^」』。\n]+)[」』]?/g, '注目しているのは$1');
  text = text.replace(/一番動いている[「『]?([^」』。\n]+)[」』]?/g, 'ボラティリティのある$1');
  if (text !== beforeIchiban) changes.push('今日一番→注目表現に変換');

  // ★v5.11: 「でしょうか」の重複を除去（1投稿1回まで）
  // プロンプトで禁止しているが素通りするため後処理で保険をかける
  // 1回目は保持、2回目以降を断言に変換
  var deshouka_count = 0;
  var beforeDeshouka = text;
  text = text.replace(/([^\n]*でしょうか[？?。]?)/g, function(match) {
    deshouka_count++;
    if (deshouka_count === 1) {
      return match; // 1回目はそのまま
    }
    // 2回目以降: 断言に変換
    return match
      .replace(/でしょうか[？?]/g, 'かもしれません。')
      .replace(/でしょうか。/g, 'かもしれません。')
      .replace(/でしょうか$/g, 'かもしれません');
  });
  if (text !== beforeDeshouka) changes.push('でしょうか重複→断言');

  // ★v7.7: 通貨ペアの冗長な修飾語を除去
  // 「オセアニア通貨の豪ドル」「資源国通貨である豪ドル」等、同格説明が投稿の流れを重くするパターン
  // 背景知識として知っている読者には冗長。「豪ドル」だけで十分。
  var beforeRedundant = text;
  text = text.replace(/オセアニア通貨の豪ドル/g, '豪ドル');
  text = text.replace(/資源国通貨の豪ドル/g, '豪ドル');
  text = text.replace(/資源国通貨である豪ドル/g, '豪ドル');
  text = text.replace(/資源国通貨としての豪ドル/g, '豪ドル');
  text = text.replace(/高金利通貨の豪ドル/g, '豪ドル');
  if (text !== beforeRedundant) changes.push('通貨ペア冗長表現を除去');

  // ★v7.5: Grounding検索の作業痕跡を除去
  // 「〜という記述が見つかりました」等、Geminiの検索過程が投稿に漏れるパターン
  // 投稿に検索作業ログが残るのは不自然なため後処理で除去・断言表現に変換する
  var beforeGrounding = text;
  text = text.replace(/という記述が見つかりました/g, 'という');
  text = text.replace(/との記述が見つかりました/g, 'とのことだ');
  text = text.replace(/という情報が見つかりました/g, 'という');
  text = text.replace(/との情報が見つかりました/g, 'とのことだ');
  text = text.replace(/という記事が見つかりました/g, 'という');
  text = text.replace(/という報告が見つかりました/g, 'という');
  text = text.replace(/によると、?.*?という記述[があります|がありました]/g, '');
  text = text.replace(/検索結果によると/g, '');
  text = text.replace(/調べたところ、?/g, '');
  if (text !== beforeGrounding) changes.push('Grounding痕跡を除去');

  // ★v7.10: 「要確認」を除去（プロンプトで禁止しているがすり抜けるケースがある）
  // buildFormatRules_で「確認してから書け」と指示済みだが、Geminiが無視することがある
  var beforeYoukakunin = text;
  text = text.replace(/、要確認。/g, '。');
  text = text.replace(/、要確認$/gm, '');
  text = text.replace(/のため、要確認/g, 'のため注目');
  text = text.replace(/するため、要確認/g, 'するため注目');
  text = text.replace(/は変動するため、要確認/g, 'は変動しやすい展開');
  text = text.replace(/要確認。/g, '注目。');
  text = text.replace(/要確認/g, '注目');
  if (text !== beforeYoukakunin) changes.push('要確認→注目');

  // ★v7.10: 二重句点・二重読点を除去（後処理の置換で句点が重複するケースの安全弁）
  text = text.replace(/。。/g, '。');
  text = text.replace(/。、/g, '。');
  text = text.replace(/、。/g, '。');

  // 連続する空行を整理
  text = text.replace(/\n{3,}/g, '\n\n');
  
  if (text !== original) {
    if (changes.length > 0) {
      console.log('📌 禁止表現を置換: ' + changes.join(', '));
    }
  }
  
  return text;
}

/**
 * 月曜日の「昨日」「昨夜」を「先週金曜」に機械的に置換 ★v5.6追加
 * 
 * 月曜日に「昨日のNY市場」と書けば、昨日=日曜で市場は閉まっている。
 * これは100%事実の誤りであるため、後処理で確実に修正する。
 * プロンプトで指示してもGeminiが従わないケースがあるため、後処理が必要。
 * 
 * @param {string} text - 投稿テキスト
 * @return {string} 修正済みテキスト
 */
function fixMondayYesterday_(text) {
  var original = text;
  var changes = [];
  
  // 「昨夜のNY」「昨夜の米国」系（最も頻出）
  text = text.replace(/昨夜のNY/g, '先週金曜のNY');
  text = text.replace(/昨夜のニューヨーク/g, '先週金曜のニューヨーク');
  text = text.replace(/昨夜の米国/g, '先週金曜の米国');
  text = text.replace(/昨夜の米/g, '先週金曜の米');
  
  // 「昨日のNY」「昨日の流れ」系
  text = text.replace(/昨日のNY/g, '先週金曜のNY');
  text = text.replace(/昨日のニューヨーク/g, '先週金曜のニューヨーク');
  text = text.replace(/昨日の米国/g, '先週金曜の米国');
  text = text.replace(/昨日の流れ/g, '金曜の流れ');
  text = text.replace(/昨日の相場/g, '金曜の相場');
  text = text.replace(/昨日の市場/g, '金曜の市場');
  text = text.replace(/昨日の動き/g, '金曜の動き');
  text = text.replace(/昨日の値動き/g, '金曜の値動き');
  text = text.replace(/昨日の終値/g, '金曜の終値');
  text = text.replace(/昨日終値比/g, '金曜終値比');
  text = text.replace(/昨日の終値比/g, '金曜の終値比');

  // 通貨ペア名を含む「昨日の〜」パターン（例: 「昨日の豪ドル米ドルの高値」）
  // 通貨ペア名が入ると上の汎用パターンに引っかからないため個別対応
  text = text.replace(/昨日の([^\s。、\n]*(?:ドル|円|ユーロ|ポンド|豪ドル|AUD|USD|EUR|GBP|JPY)[^\s。、\n]*)の(高値|安値|始値|終値|レート|水準)/g,
    '金曜の$1の$2');
  text = text.replace(/昨日の([^\s。、\n]*(?:ドル|円|ユーロ|ポンド|豪ドル|AUD|USD|EUR|GBP|JPY)[^\s。、\n]*)は/g,
    '金曜の$1は');
  
  // 残った「昨夜」「昨日」（上で処理されなかったもの）
  // 文脈を壊さないよう、市場関連の文脈でのみ置換
  text = text.replace(/昨夜は/g, '先週金曜の夜は');
  text = text.replace(/昨夜、/g, '先週金曜の夜、');
  text = text.replace(/昨夜の/g, '先週金曜夜の');
  
  if (text !== original) {
    changes.push('月曜「昨日/昨夜」修正');
    console.log('📅 月曜日後処理: 「昨日」「昨夜」→「先週金曜」に修正');
  }
  
  return text;
}

/**
 * ★v8.0: 重複テキストブロック除去
 * autoFixPost_やリトライ時にGeminiが本文の一部を繰り返し出力するケースへの対策
 * 冒頭数行と同じ内容が後半に再出現した場合、重複ブロックを除去する
 * 
 * 例:
 *   ☕午前中は豪ドルが急落...（本文）
 *   ...#FX #FOMC の手前に
 *   午前中は豪ドルが急落...（重複）← これを除去
 */
function removeDuplicateBlocks_(text) {
  var lines = text.split('\n');
  if (lines.length < 8) return text; // 短すぎるテキストは対象外
  
  // 絵文字プレフィックスを除去してテキスト内容だけ比較するヘルパー
  function stripLinePrefix(line) {
    // 先頭の絵文字・記号を除去（☕📕📝📋💡⚠️✅🔥📊📰📌🍱等）
    return line.replace(/^[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF\uFE0F\u200D]+\s*/u, '').trim();
  }
  
  // 冒頭の実質的な行（空行・短い行を除く）を見つける
  var firstLines = [];
  for (var i = 0; i < Math.min(lines.length, 8); i++) {
    var stripped = stripLinePrefix(lines[i]);
    if (stripped.length >= 10) {
      firstLines.push({ index: i, content: stripped });
      if (firstLines.length >= 3) break;
    }
  }
  
  if (firstLines.length === 0) return text;
  
  // 冒頭行と同じ内容が後半に再出現するか検索
  var firstMatch = firstLines[0].content;
  
  for (var j = firstLines[0].index + 5; j < lines.length; j++) {
    var stripped2 = stripLinePrefix(lines[j]);
    if (stripped2 !== firstMatch) continue;
    
    // 一致候補を発見。次の行も一致するか確認
    var matchCount = 1;
    for (var k = 1; k < firstLines.length; k++) {
      var nextOriginal = firstLines[k].content;
      // 一致候補の後続行を順に探す（空行スキップ対応）
      var searchLimit = Math.min(j + 10, lines.length);
      for (var m = j + matchCount; m < searchLimit; m++) {
        var candidate = stripLinePrefix(lines[m]);
        if (candidate.length < 10) continue; // 空行・短行はスキップ
        if (candidate === nextOriginal) {
          matchCount++;
          break;
        } else {
          break; // 不一致なら中断
        }
      }
    }
    
    // 2行以上一致 → 重複ブロックと判定
    if (matchCount >= 2) {
      // ハッシュタグ行を探す（重複ブロック内にあるかもしれない）
      var hashtagIndex = -1;
      for (var h = j; h < lines.length; h++) {
        if (/^[A-Za-z]*\s*#|^#/.test(lines[h].trim())) {
          hashtagIndex = h;
          break;
        }
      }
      
      var before = lines.slice(0, j);
      // 末尾の空行を除去
      while (before.length > 0 && before[before.length - 1].trim() === '') {
        before.pop();
      }
      
      if (hashtagIndex !== -1) {
        // 重複ブロックを除去し、ハッシュタグ行以降を保持
        var after = lines.slice(hashtagIndex);
        var result = before.concat(['']).concat(after);
        console.log('📌 重複テキストブロックを除去しました（' + (hashtagIndex - j) + '行）');
        return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      } else {
        // ハッシュタグなし → 重複ブロックから末尾まで除去
        console.log('📌 重複テキストブロックを除去しました（末尾' + (lines.length - j) + '行）');
        return before.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      }
    }
  }
  
  return text;
}


/**
 * ★v8.12: 品質修正で壊れた孤立短文を除去する
 * Geminiが文字数圧縮時に前半を削除し、「です。」「ですね。」だけが残るケースへの対策
 * 
 * 除去対象:
 *   - 10文字以下の孤立行（絵文字行・→行・ハッシュタグ行は除く）
 *   - 空行に挟まれた短い断片
 */
function removeOrphanedLines_(text) {
  var lines = text.split('\n');
  var cleaned = [];
  var removed = 0;
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();
    
    // 空行はそのまま保持
    if (trimmed === '') {
      cleaned.push(line);
      continue;
    }
    
    // 絵文字行（ブロック先頭）は保持
    if (/^[☕📕📝📋💡⚠️✅]/.test(trimmed)) {
      cleaned.push(line);
      continue;
    }
    
    // →行は保持
    if (trimmed.indexOf('→') === 0) {
      cleaned.push(line);
      continue;
    }
    
    // ハッシュタグ行は保持
    if (/^#/.test(trimmed)) {
      cleaned.push(line);
      continue;
    }
    
    // 10文字以下の孤立行を検出
    if (trimmed.length <= 10) {
      // 前の行が空行（または先頭）かチェック
      var prevEmpty = (i === 0) || (lines[i - 1].trim() === '');
      // 次の行が空行（または末尾）かチェック
      var nextEmpty = (i === lines.length - 1) || (lines[i + 1].trim() === '');
      
      if (prevEmpty || nextEmpty) {
        console.log('🗑️ 孤立短文を除去: 「' + trimmed + '」');
        removed++;
        continue;
      }
    }
    
    cleaned.push(line);
  }
  
  if (removed > 0) {
    // 連続空行の整理
    var result = cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return result;
  }
  
  return text;
}


/**
 * ★v8.14: 壊れた句点パターンを修復する
 * 品質修正（Gemini）が文を切り貼りした際に、「。ですね。」「。です。」のように
 * 句点の直後に短い文末表現が孤立するパターンを修復。
 * 
 * 例:
 *   「しっかり。ですね。」→「しっかりですね。」
 *   「本番。です。」→「本番です。」
 */
function fixBrokenSentenceEndings_(text) {
  var before = text;
  // 「。」の直後に短い文末表現が続くパターン → 不要な「。」を除去して接続
  text = text.replace(/。(ですね。|です。|でした。|ました。|ましたね。|ですよ。|ですよね。|かなと。|って感じです。|って感じですね。|ますね。|ますよ。|んですよ。|んですよね。|かもですね。)/g, '$1');
  
  if (text !== before) {
    console.log('📌 壊れた句点を修復しました');
  }
  return text;
}


/**
 * ハッシュタグ行以降のテキストを切り落とす
 * Geminiが1回のレスポンスで2投稿分を出力するケースへの対策
 * 例: 「FX #ドル円\n現在の時刻は...」→「FX #ドル円」で終了
 */
function truncateAfterHashtag_(text) {
  var lines = text.split('\n');
  var hashtagLineIndex = -1;
  
  // ハッシュタグ行を検索（「FX #」「#FX」「#ドル円」等を含む行）
  for (var i = 0; i < lines.length; i++) {
    if (/^[A-Za-z]*\s*#|^#/.test(lines[i].trim())) {
      hashtagLineIndex = i;
      break;
    }
  }
  
  // ハッシュタグ行が見つかり、その後にまだテキストがある場合
  if (hashtagLineIndex !== -1 && hashtagLineIndex < lines.length - 1) {
    // ハッシュタグ行までを残す
    var truncated = lines.slice(0, hashtagLineIndex + 1).join('\n').trim();
    if (truncated !== text.trim()) {
      console.log('📌 ハッシュタグ行以降を切り落としました');
    }
    return truncated;
  }
  
  return text;
}

/**
 * ★v5.9.3: 小数点が消失したレート数値を後処理で修正する
 * 
 * Geminiが「1.33361ドル」を「133361ドル」と出力するケースに対応。
 * 各レートの小数点なしバージョンを生成し、テキスト内で一致すれば正しい値に置換する。
 * 
 * @param {string} text - 投稿テキスト
 * @param {Object} rates - {usdjpy, eurusd, gbpusd, eurjpy, gbpjpy, audjpy, audusd}
 * @return {string} 修正済みテキスト
 */
function fixMissingDecimalPoint_(text, rates) {
  if (!rates) return text;
  
  var fixCount = 0;
  
  // 各レートについて、小数点なし文字列を生成して照合
  var rateEntries = [
    { key: 'usdjpy', value: rates.usdjpy, unit: '円', name: 'USD/JPY' },
    { key: 'eurjpy', value: rates.eurjpy, unit: '円', name: 'EUR/JPY' },
    { key: 'gbpjpy', value: rates.gbpjpy, unit: '円', name: 'GBP/JPY' },
    { key: 'audjpy', value: rates.audjpy, unit: '円', name: 'AUD/JPY' },
    { key: 'eurusd', value: rates.eurusd, unit: 'ドル', name: 'EUR/USD' },
    { key: 'gbpusd', value: rates.gbpusd, unit: 'ドル', name: 'GBP/USD' },
    { key: 'audusd', value: rates.audusd, unit: 'ドル', name: 'AUD/USD' }
  ];

  // ★追加: 整数に丸められたケースの修正
  // 例: AUD/JPY=113.50 → Geminiが「11350円」と書くパターンを「113.50円」に修正
  for (var ri = 0; ri < rateEntries.length; ri++) {
    var re = rateEntries[ri];
    if (!re.value) continue;
    var rateNum = Number(re.value);
    if (isNaN(rateNum)) continue;
    // 小数点以下を100倍した整数（113.50 → 11350）
    var multiplied = Math.round(rateNum * 100);
    if (multiplied < 1000) continue; // 4桁未満はスキップ（誤検知防止）
    var multipliedStr = String(multiplied);
    var correctStr = re.unit === '円'
      ? Number(rateNum).toFixed(2)
      : Number(rateNum).toFixed(4);
    var escapedM = multipliedStr.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
    var foundM = false;
    text = text.replace(new RegExp('([^0-9\\.])' + escapedM + '(' + re.unit + ')', 'g'), function(match, before, unit) {
      foundM = true;
      return before + correctStr + unit;
    });
    if (foundM) {
      console.log('📌 整数丸め修正: ' + multipliedStr + re.unit + ' → ' + correctStr + re.unit + '（' + re.name + '）');
    }
  }
  
  for (var i = 0; i < rateEntries.length; i++) {
    var entry = rateEntries[i];
    if (!entry.value) continue;
    
    // レートを文字列化（小数3〜5桁）
    var rateStr = String(entry.value);
    
    // 小数点を除去した文字列を生成（例: 1.33361 → 133361）
    var noDot = rateStr.replace('.', '');
    
    // 先頭の0を除去（0.70184 → 070184 → 70184）
    noDot = noDot.replace(/^0+/, '') || '0';
    
    // 5桁以上の数字でテキスト内を検索（前後が数字や小数点でないこと）
    if (noDot.length >= 5) {
      var escaped = noDot.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
      var found = false;
      // 前後の文字をチェックしながら置換
      text = text.replace(new RegExp('([^0-9\\.])' + escaped + '([^0-9])', 'g'), function(match, before, after) {
        found = true;
        return before + rateStr + after;
      });
      // 行頭のケース
      text = text.replace(new RegExp('^' + escaped + '([^0-9])', 'g'), function(match, after) {
        found = true;
        return rateStr + after;
      });
      if (found) {
        fixCount++;
        console.log('📌 小数点修正: ' + noDot + ' → ' + rateStr + '（' + entry.name + '）');
      }
    }
    
    // 部分一致も試す（Geminiが丸めた場合: 133361 → 13336 等）
    if (noDot.length >= 5) {
      var shortNoDot = noDot.substring(0, noDot.length - 1);
      var shortRate = rateStr.substring(0, rateStr.length - 1);
      if (shortNoDot.length >= 5) {
        var shortEscaped = shortNoDot.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
        var shortFound = false;
        text = text.replace(new RegExp('([^0-9\\.])' + shortEscaped + '([^0-9])', 'g'), function(match, before, after) {
          shortFound = true;
          return before + shortRate + after;
        });
        text = text.replace(new RegExp('^' + shortEscaped + '([^0-9])', 'g'), function(match, after) {
          shortFound = true;
          return shortRate + after;
        });
        if (shortFound) {
          fixCount++;
          console.log('📌 小数点修正（部分）: ' + shortNoDot + ' → ' + shortRate + '（' + entry.name + '）');
        }
      }
    }
  }
  
  if (fixCount > 0) {
    console.log('📌 小数点消失を' + fixCount + '箇所修正しました');
  }
  
  return text;
}

/**
 * ★v8.1: 自動修正で混入したハルシネーションレートを確定レートで修正する
 * 
 * autoFixPost_がGeminiにレート修正を依頼した際、Geminiが正しいレートではなく
 * 別の数値を返すケースに対応。システムが持つ確定レートと照合し、
 * 乖離が大きい場合は確定レートに置換する。
 * 
 * 例: USD/JPY確定レート159.89 → Geminiが149.60と書く → 159.89に修正
 * 
 * @param {string} text - 投稿テキスト
 * @param {Object} rates - {usdjpy, eurusd, gbpusd, eurjpy, gbpjpy, audjpy, audusd}
 * @return {string} 修正済みテキスト
 */
function fixHallucinatedRates_(text, rates) {
  if (!rates) return text;
  
  var fixCount = 0;
  
  // 通貨ペアごとのキーワードと確定レート
  var pairChecks = [
    { keywords: ['ドル円', 'USD/JPY', 'USDJPY'], value: rates.usdjpy, unit: '円', decimals: 2, name: 'USD/JPY', threshold: 0.03 },
    { keywords: ['ユーロ円', 'EUR/JPY', 'EURJPY'], value: rates.eurjpy, unit: '円', decimals: 2, name: 'EUR/JPY', threshold: 0.03 },
    { keywords: ['ポンド円', 'GBP/JPY', 'GBPJPY'], value: rates.gbpjpy, unit: '円', decimals: 2, name: 'GBP/JPY', threshold: 0.03 },
    { keywords: ['豪ドル円', 'AUD/JPY', 'AUDJPY'], value: rates.audjpy, unit: '円', decimals: 2, name: 'AUD/JPY', threshold: 0.03 },
    { keywords: ['ユーロドル', 'EUR/USD', 'EURUSD'], value: rates.eurusd, unit: 'ドル', decimals: 4, name: 'EUR/USD', threshold: 0.05 },
    { keywords: ['ポンドドル', 'GBP/USD', 'GBPUSD'], value: rates.gbpusd, unit: 'ドル', decimals: 4, name: 'GBP/USD', threshold: 0.05 },
    { keywords: ['豪ドル米ドル', '豪ドル/米ドル', 'AUD/USD', 'AUDUSD'], value: rates.audusd, unit: 'ドル', decimals: 4, name: 'AUD/USD', threshold: 0.05 }
  ];
  
  var lines = text.split('\n');
  
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    
    // ===== Step 1: この行に存在する全ペアキーワードの位置を収集 =====
    // ★v12.6: ペア単位ではなく行単位で処理。各レートを最も近いキーワードに割り当てることで
    //          同一行に複数ペアがある場合のクロス汚染を防止
    var kwFound = [];
    for (var p = 0; p < pairChecks.length; p++) {
      var pair = pairChecks[p];
      if (!pair.value) continue;
      if (isNaN(Number(pair.value))) continue;
      
      for (var k = 0; k < pair.keywords.length; k++) {
        var kw = pair.keywords[k];
        if (line.indexOf(kw) === -1) continue;
        
        // ★v8.6: 部分一致防止（「豪ドル円」の中の「ドル円」を誤検出しない）
        if (kw === 'ドル円') {
          var stripped = line.replace(/豪ドル円/g, '＿＿＿').replace(/ポンドドル円/g, '＿＿＿＿');
          var strippedPos = stripped.indexOf('ドル円');
          if (strippedPos === -1) continue;
          kwFound.push({ pairIdx: p, position: strippedPos });
        } else {
          kwFound.push({ pairIdx: p, position: line.indexOf(kw) });
        }
        break;
      }
    }
    
    if (kwFound.length === 0) continue;
    kwFound.sort(function(a, b) { return a.position - b.position; });
    
    // ===== Step 2: 行内の全レート候補を収集 =====
    // ★v12.5.5: 「円」「ドル」なしのレートも検出
    var jpyPattern = /(\d{2,3}\.\d{1,3})(?:円|まで|台|付近|前後|に|を|で|と|、|。|\s|$)/g;
    var usdPattern = /(\d\.\d{2,5})(?:ドル|台|付近|前後|まで|に|を|で|と|、|。|\s|$)/g;
    
    var rateMatches = [];
    var m;
    while ((m = jpyPattern.exec(line)) !== null) {
      rateMatches.push({ value: parseFloat(m[1]), position: m.index, numStr: m[1] });
    }
    while ((m = usdPattern.exec(line)) !== null) {
      // ★v12.6: 位置の重複チェック（JPYマッチ「142.82」の中の「2.82」をUSDとして誤検出しない）
      var dup = false;
      for (var rd = 0; rd < rateMatches.length; rd++) {
        var existing = rateMatches[rd];
        if (m.index >= existing.position && m.index < existing.position + existing.numStr.length) {
          dup = true; break;
        }
      }
      if (!dup) {
        rateMatches.push({ value: parseFloat(m[1]), position: m.index, numStr: m[1] });
      }
    }
    
    if (rateMatches.length === 0) continue;
    
    // ===== Step 3: 各レートを直前で最も近いキーワードに割り当てて検証 =====
    var corrections = [];
    
    for (var ri = 0; ri < rateMatches.length; ri++) {
      var rate = rateMatches[ri];
      
      // 直前で最も近いキーワードを探す
      var nearest = null;
      for (var ki = kwFound.length - 1; ki >= 0; ki--) {
        if (kwFound[ki].position <= rate.position) {
          nearest = kwFound[ki];
          break;
        }
      }
      if (!nearest) continue;
      
      var assignedPair = pairChecks[nearest.pairIdx];
      var correctRate = Number(assignedPair.value);
      var deviation = Math.abs(rate.value - correctRate) / correctRate;
      
      if (deviation > assignedPair.threshold) {
        var correctStr = correctRate.toFixed(assignedPair.decimals);
        corrections.push({
          position: rate.position,
          oldStr: rate.numStr,
          newStr: correctStr,
          pairName: assignedPair.name,
          deviation: deviation
        });
        fixCount++;
      }
    }
    
    // ===== Step 4: 後ろから順に位置ベースで置換（位置ズレ防止） =====
    if (corrections.length > 0) {
      corrections.sort(function(a, b) { return b.position - a.position; });
      var correctedLine = line;
      for (var ci = 0; ci < corrections.length; ci++) {
        var c = corrections[ci];
        correctedLine = correctedLine.substring(0, c.position) + c.newStr + correctedLine.substring(c.position + c.oldStr.length);
        console.log('📌 レート乖離修正: ' + c.oldStr + ' → ' + c.newStr + '（' + c.pairName + ' 乖離' + (c.deviation * 100).toFixed(1) + '%）');
      }
      lines[li] = correctedLine;
    }
  }
  
  if (fixCount > 0) {
    console.log('📌 ハルシネーションレートを' + fixCount + '箇所修正しました');
  }
  
  return lines.join('\n');
}

/**
 * ★v8.6: レート桁数を正規化する後処理
 * 
 * Geminiが確定レートのAPI生値（5桁）をそのまま書くケースを防止。
 * JPYペア: 小数3桁以上 → 2桁に丸める（例: 159.217円 → 159.22円）
 * USDペア: 小数5桁以上 → 4桁に丸める（例: 1.15374ドル → 1.1537ドル）
 * 
 * プロンプトでルールとして指示しているが守られないため、後処理で確実に修正する。
 */
function normalizeRateDecimals_(text) {
  var fixCount = 0;
  
  // JPYペア: 小数3桁以上の「○○○.○○○円」→ 2桁に丸め
  // 100〜300の範囲（JPYペアのレート範囲）
  text = text.replace(/(\d{2,3})\.(\d{3,})円/g, function(match, intPart, decPart) {
    var num = parseFloat(intPart + '.' + decPart);
    if (isNaN(num)) return match;
    var rounded = num.toFixed(2);
    if (rounded !== intPart + '.' + decPart.substring(0, 2)) {
      fixCount++;
    }
    return rounded + '円';
  });
  
  // USDペア: 小数5桁以上の「○.○○○○○ドル」→ 4桁に丸め
  // 0.5〜2.0の範囲（USDペアのレート範囲）
  text = text.replace(/(\d)\.(\d{5,})ドル/g, function(match, intPart, decPart) {
    var num = parseFloat(intPart + '.' + decPart);
    if (isNaN(num)) return match;
    var rounded = num.toFixed(4);
    if (rounded !== intPart + '.' + decPart.substring(0, 4)) {
      fixCount++;
    }
    return rounded + 'ドル';
  });
  
  if (fixCount > 0) {
    console.log('📌 レート桁数を' + fixCount + '箇所正規化しました');
  }
  
  return text;
}

/**
 * ★v8.2.1: 最終フォーマットバリデーション（後処理チェーンの最終安全網）
 * 
 * 後処理チェーンの複数の修正が連鎖した結果、フォーマットが壊れるケースを検出・修正する。
 * 例: replaceProhibitedPhrases_ → fixHallucinatedRates_ の連鎖で
 *     「1.15916ドル」→「1.1.5916ドル」→「1.1.1592ドル」のような二重小数点が発生
 * 
 * ファクトチェックを通した後の最終出力は「正しいもの」でなければならない。
 * この関数はその最後の砦として機能する。
 * 
 * @param {string} text - 投稿テキスト
 * @param {Object} rates - 確定レートオブジェクト（optional）
 * @return {string} 検証・修正済みテキスト
 */
function validateFinalFormat_(text, rates) {
  var fixes = [];
  
  // === 1. 二重小数点の検出・修正 ===
  // 「1.1.1592ドル」「159.10.99円」のようなパターンは絶対にありえない
  text = text.replace(/(\d+)\.(\d+)\.(\d+)(円|ドル)/g, function(match, p1, p2, p3, unit) {
    // 確定レートがあれば、最も近い正しい値に置換
    if (rates) {
      var correctRate = findCorrectRate_(p1 + '.' + p2 + '.' + p3, unit, rates);
      if (correctRate) {
        fixes.push('二重小数点: ' + match + ' → ' + correctRate + unit);
        return correctRate + unit;
      }
    }
    // 確定レートがない場合: 先頭整数部 + '.' + 最後の数字列で復元
    // 例: 1.1.1592 → 1.1592（中間の小数部分を除去）
    var restored = p1 + '.' + p3;
    fixes.push('二重小数点: ' + match + ' → ' + restored + unit);
    return restored + unit;
  });
  
  // === 2. 三重以上の小数点（さらに壊れたケース）===
  text = text.replace(/(\d+\.){2,}\d+(円|ドル)/g, function(match, _, unit) {
    fixes.push('多重小数点検出: ' + match + '（修正不可・確認必要）');
    return match; // 自動修正は危険なのでログのみ
  });
  
  // === 3. レートの桁数異常チェック ===
  // 「0.ドル」「.円」のような明らかな壊れ
  text = text.replace(/(\d*)\.(円|ドル)/g, function(match, num, unit) {
    // 小数点直後に通貨単位 = 小数部分が消えている
    fixes.push('小数部分消失: ' + match);
    return match; // ログのみ（確定レートでの自動修正は上位で対応済み）
  });
  
  // === 4. パーセント表記の二重小数点（★v8.2.1追加） ===
  // 「4.3.91%」のようなパターン → 「4.391%」に復元
  text = text.replace(/(\d+)\.(\d+)\.(\d+)([%％])/g, function(match, p1, p2, p3, unit) {
    var restored = p1 + '.' + p2 + p3;
    fixes.push('パーセント二重小数点: ' + match + ' → ' + restored + unit);
    return restored + unit;
  });
  
  if (fixes.length > 0) {
    console.log('📌 最終フォーマット検証: ' + fixes.join(' | '));
  }
  
  return text;
}

/**
 * 二重小数点から正しいレートを特定する補助関数
 * @param {string} brokenRate - 壊れたレート文字列（例: "1.1.1592"）
 * @param {string} unit - 通貨単位（"円" or "ドル"）
 * @param {Object} rates - 確定レートオブジェクト
 * @return {string|null} 正しいレート文字列、特定できなければnull
 */
function findCorrectRate_(brokenRate, unit, rates) {
  var pairChecks;
  if (unit === '円') {
    pairChecks = [
      { value: rates.usdjpy, decimals: 2, name: 'USD/JPY' },
      { value: rates.eurjpy, decimals: 2, name: 'EUR/JPY' },
      { value: rates.gbpjpy, decimals: 2, name: 'GBP/JPY' },
      { value: rates.audjpy, decimals: 2, name: 'AUD/JPY' }
    ];
  } else {
    pairChecks = [
      { value: rates.eurusd, decimals: 4, name: 'EUR/USD' },
      { value: rates.gbpusd, decimals: 4, name: 'GBP/USD' },
      { value: rates.audusd, decimals: 4, name: 'AUD/USD' }
    ];
  }
  
  // 壊れたレートの数字部分だけ抽出して、各確定レートとの近さで判定
  var digits = brokenRate.replace(/\./g, '');
  
  for (var i = 0; i < pairChecks.length; i++) {
    var pair = pairChecks[i];
    if (!pair.value) continue;
    var correctNum = Number(pair.value);
    if (isNaN(correctNum)) continue;
    var correctStr = correctNum.toFixed(pair.decimals);
    var correctDigits = correctStr.replace(/\./g, '');
    
    // 数字列が一致または近似していれば、この確定レートを採用
    if (digits.indexOf(correctDigits) !== -1 || correctDigits.indexOf(digits) !== -1) {
      return correctStr;
    }
    // 先頭4桁以上一致でも採用
    if (digits.length >= 4 && correctDigits.length >= 4 &&
        digits.substring(0, 4) === correctDigits.substring(0, 4)) {
      return correctStr;
    }
  }
  
  return null;
}

/**
 * テキスト内容からハッシュタグを動的生成する ★v5.5.1
 * 
 * Geminiが付けたハッシュタグ行を除去し、テキスト内容を分析して
 * 最適なハッシュタグを自動選定・付与する
 * 
 * 優先度: #FX（固定）→ TC言及(#個人開発) → イベント → 通貨ペア → テーマ
 * 最大3個
 */
function generateDynamicHashtags_(text, postType) {
  var lines = text.split('\n');
  
  // === Step 1: Geminiが付けた既存ハッシュタグ行を除去 ===
  var cleanLines = [];
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    // 「FX」で始まるハッシュタグ行を除去
    if (/^#?FX\s/i.test(trimmed) || /^#?FX$/i.test(trimmed)) {
      continue;
    }
    // 「#○○ #○○」だけの短い行も除去（ハッシュタグのみの行）
    if (trimmed.length > 0 && trimmed.length < 40 && /^#\S+(\s+#\S+)*$/.test(trimmed)) {
      continue;
    }
    cleanLines.push(lines[i]);
  }
  
  // 末尾の空行を整理
  while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') {
    cleanLines.pop();
  }
  
  var bodyText = cleanLines.join('\n');
  var tags = ['#FX']; // 常に付ける
  
  // === Step 2: TC言及検出 → #個人開発 ===
  if (/Trading\s*Complete/i.test(bodyText) ||
      /トレード記録ツール/i.test(bodyText) ||
      /記録.*仕組み化/i.test(bodyText) ||
      /自分で.*ツール.*作/i.test(bodyText) ||
      /チェックリスト.*エントリー/i.test(bodyText) ||
      /リスク.*自動判定/i.test(bodyText)) {
    tags.push('#個人開発');
  }
  
  // === Step 3: イベント・指標検出 ===
  var eventCandidates = [
    { tag: '#雇用統計', count: countAnyTag_(bodyText, ['雇用統計', 'NFP', '非農業部門']) },
    { tag: '#CPI',     count: countAnyTag_(bodyText, ['CPI', '消費者物価']) },
    { tag: '#FOMC',    count: countAnyTag_(bodyText, ['FOMC', 'パウエル']) },
    { tag: '#日銀',    count: countAnyTag_(bodyText, ['日銀', 'BOJ', '植田', '金融政策決定会合']) },
    { tag: '#ECB',     count: countAnyTag_(bodyText, ['ECB', 'ラガルド']) },
    { tag: '#RBA',     count: countAnyTag_(bodyText, ['RBA', '豪準備銀行', '豪中銀']) },
    { tag: '#BOE',     count: countAnyTag_(bodyText, ['BOE', 'ベイリー', '英中銀']) },
    { tag: '#GDP',     count: countAnyTag_(bodyText, ['GDP']) },
    { tag: '#ISM',     count: countAnyTag_(bodyText, ['ISM']) },
    { tag: '#PPI',     count: countAnyTag_(bodyText, ['PPI', '生産者物価']) }
  ];
  eventCandidates.sort(function(a, b) { return b.count - a.count; });
  
  // === Step 4: 通貨ペア検出（出現回数ランキング） ===
  var pairCandidates = [
    { tag: '#ドル円',     count: countPairTag_(bodyText, 'ドル円', '豪') + countAnyTag_(bodyText, ['USD/JPY']) },
    { tag: '#ユーロドル', count: countAnyTag_(bodyText, ['ユーロドル', 'EUR/USD']) },
    { tag: '#ポンドドル', count: countAnyTag_(bodyText, ['ポンドドル', 'GBP/USD']) },
    { tag: '#ユーロ円',   count: countAnyTag_(bodyText, ['ユーロ円', 'EUR/JPY']) },
    { tag: '#ポンド円',   count: countAnyTag_(bodyText, ['ポンド円', 'GBP/JPY']) },
    { tag: '#豪ドル円',   count: countAnyTag_(bodyText, ['豪ドル円', 'AUD/JPY']) },
    { tag: '#豪ドル',     count: countPairTag_(bodyText, '豪ドル', null, '円') + countAnyTag_(bodyText, ['AUD/USD', '豪ドル米ドル']) }
  ];
  pairCandidates.sort(function(a, b) { return b.count - a.count; });
  
  // === Step 5: テーマ検出（RULE系・心得系用） ===
  var themeCandidates = [
    { tag: '#損切り',       count: countAnyTag_(bodyText, ['損切り', 'ロスカット', 'ストップロス']) },
    { tag: '#資金管理',     count: countAnyTag_(bodyText.replace(/プロット/g, ''), ['資金管理', 'リスク管理', '許容損失', 'ロット']) },
    { tag: '#トレード心理', count: countAnyTag_(bodyText, ['メンタル', '心理', '感情', '恐怖', '欲']) },
    { tag: '#過去検証',     count: countAnyTag_(bodyText, ['過去検証', 'バックテスト', '検証']) },
    { tag: '#トレード',     count: countAnyTag_(bodyText, ['規律', '習慣', 'ルール遵守']) }
  ];
  themeCandidates.sort(function(a, b) { return b.count - a.count; });
  
  // === Step 6: 優先度順にタグ追加（最大3個） ===
  // イベント > 通貨ペア > テーマ
  if (tags.length < 3 && eventCandidates[0] && eventCandidates[0].count > 0) {
    tags.push(eventCandidates[0].tag);
  }
  if (tags.length < 3 && pairCandidates[0] && pairCandidates[0].count > 0) {
    tags.push(pairCandidates[0].tag);
  }
  if (tags.length < 3 && themeCandidates[0] && themeCandidates[0].count > 0) {
    tags.push(themeCandidates[0].tag);
  }
  
  // フォールバック: 2個未満ならジャンルに応じて補完
  if (tags.length < 2) {
    var marketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR',
                       'WEEKLY_REVIEW', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
    if (marketTypes.indexOf(postType) !== -1) {
      tags.push('#為替');
    } else {
      tags.push('#トレード');
    }
  }
  
  // ★v5.8: 外部URL検出時はハッシュタグを1個に制限（シャドウバン回避）
  // Xアルゴリズムでは外部リンク+ハッシュタグ多数の組み合わせがスパム判定のトリガー
  if (/https?:\/\//.test(bodyText)) {
    tags = ['#FX'];
    console.log('🔗 URL検出: ハッシュタグを1個に制限（シャドウバン回避）');
  }
  
  var hashtagLine = tags.join(' ');
  console.log('🏷️ ハッシュタグ自動生成: ' + hashtagLine);
  
  return bodyText + '\n\n' + hashtagLine;
}


// ===== ハッシュタグ生成ヘルパー関数 =====

/** 複数キーワードの出現回数を合計 */


// ===== ハッシュタグ生成ヘルパー関数 =====

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

/** 通貨ペア名の出現回数（接頭辞・接尾辞による誤カウント防止） */

/** 通貨ペア名の出現回数（接頭辞・接尾辞による誤カウント防止） */
function countPairTag_(text, word, excludePrefix, excludeSuffix) {
  var re = new RegExp(word, 'g');
  var matches = text.match(re);
  var total = matches ? matches.length : 0;
  
  if (excludePrefix) {
    var preRe = new RegExp(excludePrefix + word, 'g');
    var preMatches = text.match(preRe);
    total -= preMatches ? preMatches.length : 0;
  }
  if (excludeSuffix) {
    var sufRe = new RegExp(word + excludeSuffix, 'g');
    var sufMatches = text.match(sufRe);
    total -= sufMatches ? sufMatches.length : 0;
  }
  
  return Math.max(0, total);
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


// ===== 後処理チェーン共通関数 =====
// ★v8.8: geminiApi.gsの7箇所にコピペされていた後処理チェーンを1関数に統合
// 新しい後処理を追加する場合はここだけ変更すればOK
// TC除去（removeTCMention_）はタイプ別判定があるため呼び出し側で個別に実行すること
/**
 * @param {string} text - 後処理対象のテキスト
 * @param {string} postType - 投稿タイプ
 * @param {Object|null} rates - レートオブジェクト（nullならレート修正をスキップ）
 * @return {string} 後処理済みテキスト
 */
function applyPostProcessingChain_(text, postType, rates) {
  text = removeForeignText_(text);
  text = stripAIPreamble_(text);
  text = enforceLineBreaks_(text);
  text = removeDisallowedEmoji_(text);
  text = fixOrphanedVariationSelector_(text);  // ★v8.14: 孤立U+FE0F修復
  text = removeMarkdown_(text);
  text = replaceProhibitedPhrases_(text);
  
  // 月曜日の「昨日」「昨夜」を機械的に修正
  var todayDow = new Date().getDay();
  if (todayDow === 1) {
    text = fixMondayYesterday_(text);
  }
  
  text = removeDuplicateBlocks_(text);
  text = removeOrphanedLines_(text);  // ★v8.12: 品質修正で壊れた孤立短文を除去
  text = fixBrokenSentenceEndings_(text);  // ★v8.14: 壊れた句点パターン修復
  text = truncateAfterHashtag_(text);
  text = generateDynamicHashtags_(text, postType);
  
  if (rates) {
    text = fixMissingDecimalPoint_(text, rates);
    text = fixHallucinatedRates_(text, rates);
    text = normalizeRateDecimals_(text);
    text = convertExactRatesToRange_(text, postType);  // ★v12.6: TOKYO/LUNCHのレート台変換
    text = validateFinalFormat_(text, rates);
  }
  
  return text;
}


// ===== ★v12.6: TOKYO/LUNCHのレート数値を「台」表現に変換 =====
/**
 * 100〜180字の短い投稿で具体的なレート数値（158.97等）は不要。
 * 「158円台」「0.71ドル台」のようにレベル感で伝える。
 * 
 * プロンプトで指示しても守られないケースの安全網。
 * fixHallucinatedRates_・normalizeRateDecimals_の後に実行する。
 * 
 * @param {string} text - 投稿テキスト
 * @param {string} postType - 投稿タイプ
 * @return {string} 変換後テキスト
 */
function convertExactRatesToRange_(text, postType) {
  if (postType !== 'TOKYO' && postType !== 'LUNCH') return text;
  
  var original = text;
  
  // Pattern 1: 「158.97円」→「158円台」（「円」付き。「円台」は除外）
  text = text.replace(/(\d{2,3})\.\d{1,3}円(?!台)/g, '$1円台');
  
  // Pattern 2: 「0.7125ドル」→「0.71ドル台」（「ドル」付き。「ドル台」は除外）
  text = text.replace(/(\d\.\d{2})\d*ドル(?!台)/g, '$1ドル台');
  
  // Pattern 3: 通貨ペアキーワード直後の数値（「円」なし）
  // 「ドル円158.97、」→「ドル円158円台、」
  // ★長いキーワードを先に配置（「豪ドル円」が「ドル円」より優先されるように）
  // ★v12.6: スペース区切り「豪ドル円 113.39」にも対応
  text = text.replace(/(豪ドル円|ポンド円|ユーロ円|ドル円)(は|が|,|、| )?(\d{2,3})\.\d{1,3}/g, '$1$2$3円台');
  
  if (text !== original) {
    console.log('📌 レート数値を「台」表現に変換しました（' + postType + '）');
  }
  
  return text;
}


// ========================================
// Sheets読み込み関数（公開可能な情報源）
// ========================================

// ===== 投稿プロンプトをSheetsから取得 =====

