/**
 * CompanaFXAutoPost - rateSanitizer.gs
 * レート数値の検証・修正系関数群
 *
 * 提供する関数:
 *   - fixMissingDecimalPoint_:  小数点欠落の修正(例: 15967 → 159.67)
 *   - fixHallucinatedRates_:    レートハルシネーション修正(実際と異なる値)
 *   - normalizeRateDecimals_:   小数点桁数の正規化
 *   - validateFinalFormat_:     最終フォーマット検証(安全網)
 *   - findCorrectRate_:         壊れたレートに対して正しい値を検索
 *   - convertExactRatesToRange_: LUNCH 用にレート数値をレンジ表現へ変換(★2026-04-29: TOKYO削除)
 *
 * 設計の鉄則:
 *   - 正規表現で \b は使わない(二重小数点バグの原因)
 *   - \s は改行を含む → 行頭処理は [ \t]+ を使う
 *
 * 履歴:
 *   v14.0 Phase R-3(2026-04-23): postProcessor.gs から独立ファイルへ分離
 */



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



// ===== ★v12.6: LUNCHのレート数値を「台」表現に変換 =====
// ★2026-04-29: TOKYO削除に伴い LUNCH 専用に変更(平日5投稿→4投稿)
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
  if (postType !== 'LUNCH') return text;
  
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

