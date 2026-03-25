/**
 * CompanaFXAutoPost - learningManager.gs
 * 学び・仮説の抽出・検証
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 5）
 * 
 * 投稿からの学び抽出・仮説検証・ログ管理を担当。
 * Phase 5（プロンプト自動進化）のデータ蓄積を担う重要モジュール。
 * 
 * 仮説3要素構造: 条件(IF)→理由(BECAUSE)→結果(THEN+レート)
 * 
 * 外部呼び出し元:
 *   main.gs: extractPostInsights_ / verifyPreviousHypothesis_
 *   approval.gs: extractPostInsights_
 *   scheduler.gs: verifyWeeklyHypotheses_
 */


// ========================================
// ★v5.5.2: 仮説・学び統合抽出
// ========================================

/**
 * 投稿テキストから「仮説」と「学び」を1回のAPI呼び出しで抽出し、
 * 投稿履歴のH列・I列に保存 + 学びログシートにも蓄積
 * @param {string} postType - 投稿タイプ
 * @param {string} postText - 投稿テキスト
 * @return {Object} {hypothesis: string|null, learning: string|null}
 */
function extractPostInsights_(postType, postText) {
  try {
    var keys = getApiKeys();
    
    // RULE系・KNOWLEDGEは学びのみ（仮説は市場系のみ）
    var skipHypothesisTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'KNOWLEDGE'];
    var needsHypothesis = (skipHypothesisTypes.indexOf(postType) === -1);
    
    // レートキャッシュから最新レートを取得（仮説に使用）
    var rateInfo = '';
    if (needsHypothesis) {
      try {
        var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
        var cacheSheet = ss.getSheetByName('レートキャッシュ');
        if (cacheSheet && cacheSheet.getLastRow() >= 2) {
          var lastRateRow = cacheSheet.getRange(cacheSheet.getLastRow(), 1, 1, 8).getValues()[0];
          // A=日時, B=USD/JPY, C=EUR/USD, D=GBP/USD, E=EUR/JPY, F=GBP/JPY, G=AUD/JPY, H=AUD/USD
          rateInfo = '\n【現在のレート】\n';
          rateInfo += 'USD/JPY: ' + Number(lastRateRow[1]).toFixed(2) + ' / ';
          rateInfo += 'EUR/USD: ' + Number(lastRateRow[2]).toFixed(4) + ' / ';
          rateInfo += 'GBP/USD: ' + Number(lastRateRow[3]).toFixed(4) + ' / ';
          rateInfo += 'EUR/JPY: ' + Number(lastRateRow[4]).toFixed(2) + ' / ';
          rateInfo += 'GBP/JPY: ' + Number(lastRateRow[5]).toFixed(2) + ' / ';
          rateInfo += 'AUD/JPY: ' + Number(lastRateRow[6]).toFixed(2) + ' / ';
          rateInfo += 'AUD/USD: ' + Number(lastRateRow[7]).toFixed(4) + '\n';
        }
      } catch (e) {
        console.log('⚠️ レートキャッシュ読み取りエラー: ' + e.message);
      }
    }
    
    // --- プロンプト構築 ---
    var prompt = '以下はFXトレーダー「コンパナ」がXに投稿した文章です。\n\n';
    prompt += '---\n' + postText + '\n---\n';
    prompt += rateInfo;
    prompt += '\n以下の' + (needsHypothesis ? '2つ' : '1つ（学びのみ）') + 'を抽出してください。\n\n';
    
    if (needsHypothesis) {
      prompt += '■ 仮説（今後の相場予測 — 3要素構造を厳守）\n';
      prompt += '・必ず「条件（IF）→ 理由（BECAUSE）→ 結果（THEN+具体的レート）」の3要素で書け\n';
      prompt += '・条件: 何が起きたら（指標結果、中銀判断、地政学イベント等）\n';
      prompt += '・理由: なぜそう動くか（資金フロー、金利差、リスクセンチメント等のメカニズム）\n';
      prompt += '・結果: 具体的な通貨ペア+レート水準+方向（後でレートで検証できる形）\n';
      prompt += '・投稿内で言及している材料に基づいた仮説にせよ。投稿にない材料を使うな\n';
      prompt += '・★仮説は積極的に立てよ。市場系投稿で仮説なしは基本ありえない\n';
      prompt += '・1行50文字以内で簡潔に\n\n';
      
      prompt += '【NGな仮説（即やり直し）】\n';
      prompt += '・ドル円は小動き → NG（曖昧すぎて検証不能）\n';
      prompt += '・方向感が出にくい → NG（レートで検証できない）\n';
      prompt += '・CPI上振れならドル高 → NG（理由がない。誰でも言える自明な仮説）\n';
      prompt += '・RBA次第で豪ドル円は大きく変動する → NG（方向もレートもない）\n';
      prompt += '・指標が上振れたら通貨高、下振れなら通貨安 → NG（教科書レベル。こんな仮説に価値はない）\n\n';
      
      prompt += '【OKな仮説（3要素が揃っている）】\n';
      prompt += '・RBAタカ派声明なら金利差拡大期待で豪ドル米ドルは0.7150ドル突破\n';
      prompt += '・米PPI上振れなら利下げ期待後退→米金利上昇でドル円は160円台\n';
      prompt += '・中東情勢長期化で原油100ドル維持なら、インフレ再燃懸念でFRB利上げ観測→ドル円161円\n';
      prompt += '・ECBラガルド総裁がインフレ上振れリスクに言及すれば利下げ観測後退でEUR/USD 1.1650ドル\n\n';
    }
    
    prompt += '■ 学び（次に似た相場が来た時に使える具体的な知見）\n';
    prompt += '・「○○の時に△△しやすい」という条件付きの法則にせよ\n';
    prompt += '・★重要: 教科書に書いてあるような一般論は不要。この投稿だからこそ得られた具体的な気づきを抽出せよ\n';
    prompt += '・具体的な日付は含めないが、「何が起きた時にどう動いたか」の因果関係は残すこと\n';
    prompt += '・1行40文字以内で簡潔に\n';
    prompt += '・カテゴリ: 相場心理/テクニカル/ファンダメンタルズ/リスク管理/指標分析/市場構造\n';
    prompt += '・学びが見当たらない場合は「なし」\n\n';
    
    prompt += '【NGな学び（一般論すぎて使えない）】\n';
    prompt += '・地政学リスクで安全資産のドルが買われやすい → NG（教科書レベル）\n';
    prompt += '・原油高はインフレ懸念を再燃させる → NG（誰でも知っている）\n';
    prompt += '・重要指標発表が多い週はリスク管理徹底 → NG（当たり前すぎる）\n\n';
    
    prompt += '【OKな学び（次のトレードに活かせる）】\n';
    prompt += '・RBA利上げ直後は豪ドル買いが加速するが声明内容で反転しやすい\n';
    prompt += '・FOMC当日は東京〜ロンドンでレンジになりNY以降に動く傾向\n';
    prompt += '・PPI上振れ時はドル買いが短時間で加速しやすい\n';
    prompt += '・中東リスク再燃時は原油高→豪ドル買いより円買いが先行する\n';
    prompt += '・RBA連続利上げでも追加利上げ観測後退なら豪ドルは伸び悩む\n\n';
    
    prompt += '【出力形式】' + (needsHypothesis ? '2行' : '1行') + 'のみ。余計な説明は一切不要。\n';
    if (needsHypothesis) {
      prompt += '仮説: [仮説内容]\n';
    }
    prompt += '学び: [カテゴリ|学びの内容 or なし]\n\n';
    
    prompt += '【出力例】\n';
    if (needsHypothesis) {
      prompt += '仮説: 米PPI上振れなら利下げ期待後退→米金利上昇でドル円は160円台\n';
    }
    prompt += '学び: 指標分析|RBA利上げ直後は声明のトーンで豪ドルが反転しやすい\n';
    
    // --- Gemini呼び出し ---
    var geminiResult = callGemini_(prompt, keys.GEMINI_API_KEY, false);
    
    if (!geminiResult || !geminiResult.text || geminiResult.text.trim() === '') {
      console.log('💡 インサイト抽出: 結果なし');
      return { hypothesis: null, learning: null };
    }
    
    var rawResult = geminiResult.text;
    
    // --- パース ---
    var lines = rawResult.trim().split('\n');
    var hypothesis = null;
    var learning = null;
    var category = null;
    
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      
      // 仮説の行
      if (line.indexOf('仮説:') === 0 || line.indexOf('仮説：') === 0) {
        var hText = line.replace(/^仮説[:：]\s*/, '').trim();
        if (hText && hText !== 'なし') {
          hypothesis = hText;
        }
      }
      
      // 学びの行
      if (line.indexOf('学び:') === 0 || line.indexOf('学び：') === 0) {
        var lText = line.replace(/^学び[:：]\s*/, '').trim();
        if (lText && lText !== 'なし') {
          var parts = lText.split('|');
          if (parts.length >= 2) {
            category = parts[0].trim();
            learning = parts.slice(1).join('|').trim();
            
            // カテゴリのバリデーション
            var validCategories = ['相場心理', 'テクニカル', 'ファンダメンタルズ', 'リスク管理', '指標分析', '市場構造'];
            if (validCategories.indexOf(category) === -1) {
              category = '相場心理';
            }
          } else {
            // パイプなしの場合
            category = '相場心理';
            learning = lText;
          }
        }
      }
    }
    
    // --- 投稿履歴H列・I列に保存 ---
    if (hypothesis) {
      updateLastPostHypothesis(hypothesis);
      console.log('💡 仮説保存: ' + hypothesis);
    }
    
    if (learning) {
      updateLastPostLearning(learning);
      console.log('📝 学び保存: ' + learning);
      
      // 学びログシートにも蓄積（既存の学びログ機能を維持）
      saveLearningToLog_(category, learning, postType);
    }

    // ★v8.3: 仮説検証ログへの登録をWEEKLY_HYPOTHESISのみ→仮説がある全投稿に拡張
    // Phase 5（プロンプト自動進化）のデータ蓄積のため、市場系+週末系の仮説を全て記録
    var ruleTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'KNOWLEDGE'];
    if (ruleTypes.indexOf(postType) === -1 && hypothesis) {
      try {
        var parsed = parseHypothesisDetails_(hypothesis);

        // レートキャッシュから仮説時レートを取得
        var hypothesisRate = 0;
        try {
          var ssForRate = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
          var cacheSheetForRate = ssForRate.getSheetByName('レートキャッシュ');
          if (cacheSheetForRate && cacheSheetForRate.getLastRow() >= 2) {
            var rateRow = cacheSheetForRate.getRange(cacheSheetForRate.getLastRow(), 1, 1, 8).getValues()[0];
            // B=USD/JPY(1), C=EUR/USD(2), D=GBP/USD(3), E=EUR/JPY(4), F=GBP/JPY(5), G=AUD/JPY(6), H=AUD/USD(7)
            hypothesisRate = Number(rateRow[parsed.rateIndex]) || 0;
          }
        } catch (rateErr) {
          console.log('⚠️ 仮説時レート取得エラー: ' + rateErr.message);
        }

        // 仮説IDを生成（日付_連番）
        var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
        var existingCount = 0;
        try {
          var logSheet = SpreadsheetApp.openById(keys.SPREADSHEET_ID).getSheetByName('仮説検証ログ');
          if (logSheet && logSheet.getLastRow() >= 2) {
            var idCol = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 1).getValues();
            for (var idx = 0; idx < idCol.length; idx++) {
              if (idCol[idx][0] && idCol[idx][0].toString().indexOf(todayStr) === 0) existingCount++;
            }
          }
        } catch (idErr) { /* 無視 */ }

        var hypothesisId = todayStr + '_' + (existingCount + 1);
        var dateForLog = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');

        saveHypothesisToLog({
          hypothesisId: hypothesisId,
          hypothesisDate: dateForLog,
          content: hypothesis,
          pair: parsed.pair,
          direction: parsed.direction,
          rateAtHypothesis: hypothesisRate
        });

        console.log('📊 仮説検証ログに登録: ' + hypothesisId + ' ' + parsed.pair + ' ' + parsed.direction + ' @' + hypothesisRate);
      } catch (logErr) {
        console.log('📊 仮説検証ログ保存エラー（続行）: ' + logErr.message);
      }
    }

    if (!hypothesis && !learning) {
      console.log('💡 インサイト抽出: この投稿からは仮説・学びなし');
    }
    
    return { hypothesis: hypothesis, learning: learning };
    
  } catch (e) {
    // インサイト抽出の失敗で投稿フロー全体を止めない
    console.log('💡 インサイト抽出エラー（投稿には影響なし）: ' + e.message);
    return { hypothesis: null, learning: null };
  }
}


/**
 * 学びログシートに書き込み（extractPostInsights_から呼ばれる）
 */


/**
 * 学びログシートに書き込み（extractPostInsights_から呼ばれる）
 */
function saveLearningToLog_(category, learning, postType) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('学びログ');
    
    if (!sheet) {
      sheet = ss.insertSheet('学びログ');
      sheet.getRange('A1:D1').setValues([['日付', 'カテゴリ', '学びの内容', 'ソース']]);
      sheet.getRange('A1:D1').setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(3, 400);
      console.log('📝 学びログシートを新規作成');
    }
    
    // 重複チェック（直近20件と比較）
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var recentCount = Math.min(lastRow - 1, 20);
      var recentData = sheet.getRange(lastRow - recentCount + 1, 3, recentCount, 1).getValues();
      for (var i = 0; i < recentData.length; i++) {
        if (String(recentData[i][0]).trim() === learning) {
          console.log('📝 学びログ: 重複スキップ → ' + learning);
          return;
        }
      }
    }
    
    var dateStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
    // Phase 3: E〜H列のデフォルト値も一緒に保存
    sheet.appendRow([dateStr, category, learning, postType, 0, 0, '', 'active']);
    console.log('📝 学びログに追記: [' + category + '] ' + learning);
    
  } catch (e) {
    console.log('📝 学びログ保存エラー: ' + e.message);
  }
}


// ========================================
// ★v5.5.2: 仮説自動検証
// ========================================

/**
 * 前回の未検証仮説をレートデータで検証し、
 * 投稿履歴のH列に検証結果（○/△/×）を追記する
 * 投稿生成の前に呼ぶ
 */


// ========================================
// ★v5.5.2: 仮説自動検証
// ========================================

/**
 * 前回の未検証仮説をレートデータで検証し、
 * 投稿履歴のH列に検証結果（○/△/×）を追記する
 * 投稿生成の前に呼ぶ
 */
function verifyPreviousHypothesis_() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var historySheet = ss.getSheetByName('投稿履歴');
    
    if (!historySheet || historySheet.getLastRow() < 2) {
      console.log('📊 仮説検証: 投稿履歴が空');
      return;
    }
    
    // --- 未検証の仮説を探す ---
    var lastRow = historySheet.getLastRow();
    var targetRow = null;
    var hypothesis = null;
    var hypothesisDate = null;
    var hypothesisDateStr = null;
    
    // 最新から遡って、未検証の仮説を1つ見つける
    for (var i = lastRow; i >= 2; i--) {
      var value = historySheet.getRange(i, 8).getValue();
      if (value && value.toString().trim() !== '') {
        var str = value.toString().trim();
        // 既に検証済み（「」が含まれる）ならスキップ
        if (str.indexOf(' → ') !== -1) {
          continue;
        }
        targetRow = i;
        hypothesis = str;
        hypothesisDate = new Date(historySheet.getRange(i, 1).getValue());
        hypothesisDateStr = Utilities.formatDate(hypothesisDate, 'Asia/Tokyo', 'M/d HH:mm');
        break;
      }
    }
    
    if (!targetRow || !hypothesis) {
      console.log('📊 仮説検証: 未検証の仮説なし');
      return;
    }
    
    // 仮説が古すぎる場合（3日以上前）は「期限切れ」として処理
    var now = new Date();
    var hoursSince = (now.getTime() - hypothesisDate.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 72) {
      historySheet.getRange(targetRow, 8).setValue(hypothesis + ' → ⏰期限切れ（72h超過）');
      console.log('📊 仮説検証: 期限切れ（' + Math.round(hoursSince) + '時間経過）→ ' + hypothesis);
      return;
    }
    
    // --- レートキャッシュから仮説時点と現在のレートを取得 ---
    var cacheSheet = ss.getSheetByName('レートキャッシュ');
    if (!cacheSheet || cacheSheet.getLastRow() < 2) {
      console.log('📊 仮説検証: レートキャッシュが空');
      return;
    }
    
    var cacheData = cacheSheet.getRange(2, 1, cacheSheet.getLastRow() - 1, 8).getValues();
    // A=日時(0), B=USD/JPY(1), C=EUR/USD(2), D=GBP/USD(3),
    // E=EUR/JPY(4), F=GBP/JPY(5), G=AUD/JPY(6), H=AUD/USD(7)
    
    // 仮説時点に最も近いレート
    var closestIdx = 0;
    var closestDiff = Infinity;
    for (var j = 0; j < cacheData.length; j++) {
      var d = new Date(cacheData[j][0]);
      var diff = Math.abs(d.getTime() - hypothesisDate.getTime());
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIdx = j;
      }
    }
    
    // 最新のレート（キャッシュ末尾）
    var latestIdx = cacheData.length - 1;
    
    var pairNames = ['USD/JPY', 'EUR/USD', 'GBP/USD', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'AUD/USD'];
    var pairDecimals = [2, 4, 4, 2, 2, 2, 4];
    
    // --- 検証データ構築 ---
    var dataBlock = '仮説時点（' + hypothesisDateStr + '）→ 現在のレート変化:\n';
    for (var k = 0; k < pairNames.length; k++) {
      var oldRate = Number(cacheData[closestIdx][k + 1]);
      var newRate = Number(cacheData[latestIdx][k + 1]);
      if (oldRate > 0 && newRate > 0) {
        var change = newRate - oldRate;
        var changeStr = (change >= 0 ? '+' : '') + change.toFixed(pairDecimals[k]);
        dataBlock += '  ' + pairNames[k] + ': ' + oldRate.toFixed(pairDecimals[k]);
        dataBlock += ' → ' + newRate.toFixed(pairDecimals[k]);
        dataBlock += '（' + changeStr + '）\n';
      }
    }
    
    // --- Geminiで検証 ---
    var prompt = '以下のFX相場仮説を、実際のレート変動データで検証してください。\n\n';
    prompt += '仮説: ' + hypothesis + '\n\n';
    prompt += dataBlock + '\n';
    prompt += '【判定基準】\n';
    prompt += '○的中: 仮説の方向・水準がおおむね正しかった\n';
    prompt += '△部分的: 方向は合ったが水準が外れた、または一時的に的中した\n';
    prompt += '×外れ: 仮説と逆の動きになった\n\n';
    prompt += '【出力形式】記号1つ + 理由15文字以内。1行のみ。余計な説明は一切不要。\n';
    prompt += '出力例:\n';
    prompt += '○156円台を維持\n';
    prompt += '×155円台に下落\n';
    prompt += '△方向は合ったがレンジ\n';
    
    var geminiResult = callGemini_(prompt, keys.GEMINI_API_KEY, false);
    var rawResult = geminiResult ? geminiResult.text : null;
    
    if (!rawResult || rawResult.trim() === '') {
      console.log('📊 仮説検証: Gemini応答なし');
      return;
    }
    
    var verdict = rawResult.trim().split('\n')[0]; // 1行目のみ
    
    // 検証結果に○△×が含まれているか確認
    if (verdict.indexOf('○') === -1 && verdict.indexOf('△') === -1 && verdict.indexOf('×') === -1) {
      verdict = '△' + verdict; // 記号がなければ△をデフォルト追加
    }
    
    // 投稿履歴を更新
    var updated = hypothesis + ' → ' + verdict;
    historySheet.getRange(targetRow, 8).setValue(updated);
    
    console.log('');
    console.log('📊 ===== 仮説検証結果 =====');
    console.log('  仮説（' + hypothesisDateStr + '）: ' + hypothesis);
    console.log('  判定: ' + verdict);
    console.log('  更新行: ' + targetRow);
    console.log('=============================');
    console.log('');
    
  } catch (e) {
    // 検証の失敗で投稿フロー全体を止めない
    console.log('📊 仮説検証エラー（投稿には影響なし）: ' + e.message);
  }
}


// ===== 学びログ自動蓄積: 投稿テキストから学びを抽出して保存 =====
/**
 * 投稿テキストからGeminiが「学び・気づき」を1つ抽出し、学びログシートに自動追記する。
 * RULE系・KNOWLEDGE投稿はスキップ（教訓投稿であり市場観察ではないため）。
 * 
 * @param {string} postType - 投稿タイプ
 * @param {string} postText - 投稿テキスト
 */


// ===== 学びログ自動蓄積: 投稿テキストから学びを抽出して保存 =====
/**
 * 投稿テキストからGeminiが「学び・気づき」を1つ抽出し、学びログシートに自動追記する。
 * RULE系・KNOWLEDGE投稿はスキップ（教訓投稿であり市場観察ではないため）。
 * 
 * @param {string} postType - 投稿タイプ
 * @param {string} postText - 投稿テキスト
 */
function extractAndSaveLearning_(postType, postText) {
  try {
    // RULE系・KNOWLEDGEはスキップ（教訓投稿から学びを抽出しても循環するだけ）
    var skipTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'KNOWLEDGE'];
    if (skipTypes.indexOf(postType) !== -1) {
      console.log('📝 学びログ: ' + postType + ' はスキップ（教訓系投稿）');
      return;
    }
    
    var keys = getApiKeys();
    
    // Geminiに学びを抽出させる
    var extractPrompt = '以下はFXトレーダー「コンパナ」がXに投稿した文章です。\n\n';
    extractPrompt += '---\n' + postText + '\n---\n\n';
    extractPrompt += 'この投稿から「トレーダーとしての学び・気づき・市場の法則」を1つだけ抽出してください。\n\n';
    extractPrompt += '【ルール】\n';
    extractPrompt += '・「相場は○○の時に△△しやすい」「○○指標は△△に影響する」等の再利用可能な知見にする\n';
    extractPrompt += '・具体的な日付やレート数値は含めない（普遍的な学びにする）\n';
    extractPrompt += '・1行50文字以内で簡潔に\n';
    extractPrompt += '・学びが見当たらない場合は「なし」とだけ返す\n\n';
    extractPrompt += '【出力形式】1行のみ。余計な説明不要。\n';
    extractPrompt += 'カテゴリ|学びの内容\n\n';
    extractPrompt += '【カテゴリ一覧（この中から1つ選べ）】\n';
    extractPrompt += '相場心理 / テクニカル / ファンダメンタルズ / リスク管理 / 指標分析 / 市場構造\n\n';
    extractPrompt += '【出力例】\n';
    extractPrompt += '相場心理|重要指標の前はポジション縮小で値動きが小さくなりやすい\n';
    extractPrompt += '指標分析|CPIの上振れは利下げ期待を後退させドル買いに直結する\n';
    extractPrompt += '市場構造|ロンドン勢の参入で東京時間のレンジがブレイクされやすい\n';
    
    var geminiResult = callGemini_(extractPrompt, keys.GEMINI_API_KEY, false);
    var rawResult = geminiResult ? geminiResult.text : null;
    
    if (!rawResult || rawResult.trim() === 'なし' || rawResult.trim() === '') {
      console.log('📝 学びログ: 抽出結果なし（この投稿から学びは見当たらず）');
      return;
    }
    
    // パース: "カテゴリ|学びの内容"
    var line = rawResult.trim().split('\n')[0]; // 1行目だけ
    var parts = line.split('|');
    
    if (parts.length < 2) {
      console.log('📝 学びログ: パース失敗 → ' + line);
      return;
    }
    
    var category = parts[0].trim();
    var learning = parts.slice(1).join('|').trim(); // |が学びの中に含まれる場合に対応
    
    // カテゴリのバリデーション
    var validCategories = ['相場心理', 'テクニカル', 'ファンダメンタルズ', 'リスク管理', '指標分析', '市場構造'];
    if (validCategories.indexOf(category) === -1) {
      category = '相場心理'; // デフォルト
    }
    
    // 重複チェック（同じ学びが既にあるか）
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('学びログ');
    
    if (!sheet) {
      // シートがなければ作成
      sheet = ss.insertSheet('学びログ');
      sheet.getRange('A1:D1').setValues([['日付', 'カテゴリ', '学びの内容', 'ソース']]);
      sheet.getRange('A1:D1').setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(3, 400);
      console.log('📝 学びログシートを新規作成');
    }
    
    // 直近20件と比較して類似チェック（完全一致のみ除外）
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var recentCount = Math.min(lastRow - 1, 20);
      var recentData = sheet.getRange(lastRow - recentCount + 1, 3, recentCount, 1).getValues();
      for (var i = 0; i < recentData.length; i++) {
        if (String(recentData[i][0]).trim() === learning) {
          console.log('📝 学びログ: 重複スキップ → ' + learning);
          return;
        }
      }
    }
    
    // 書き込み
    var now = new Date();
    var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd');
    var source = postType;
    
    sheet.appendRow([dateStr, category, learning, source]);
    
    console.log('📝 学びログに追記: [' + category + '] ' + learning + ' ← ' + source);
    
  } catch (e) {
    // 学びログの失敗で投稿フロー全体を止めない
    console.log('📝 学びログ抽出エラー（投稿には影響なし）: ' + e.message);
  }
}

// ========================================
// プロンプト構築（メイン）
// ========================================


function parseHypothesisDetails_(hypothesisText) {
  // --- ペア検出 ---
  var pairMap = [
    { keywords: ['ドル円', 'USD/JPY', 'USDJPY'], symbol: 'USD/JPY', rateIndex: 1, isJpy: true },
    { keywords: ['ユーロドル', 'EUR/USD', 'EURUSD'], symbol: 'EUR/USD', rateIndex: 2, isJpy: false },
    { keywords: ['ポンドドル', 'GBP/USD', 'GBPUSD'], symbol: 'GBP/USD', rateIndex: 3, isJpy: false },
    { keywords: ['ユーロ円', 'EUR/JPY', 'EURJPY'], symbol: 'EUR/JPY', rateIndex: 4, isJpy: true },
    { keywords: ['ポンド円', 'GBP/JPY', 'GBPJPY'], symbol: 'GBP/JPY', rateIndex: 5, isJpy: true },
    { keywords: ['豪ドル円', 'AUD/JPY', 'AUDJPY'], symbol: 'AUD/JPY', rateIndex: 6, isJpy: true },
    { keywords: ['豪ドル米ドル', '豪ドル/米ドル', 'AUD/USD', 'AUDUSD'], symbol: 'AUD/USD', rateIndex: 7, isJpy: false }
  ];

  var detectedPair = null;
  for (var i = 0; i < pairMap.length; i++) {
    for (var j = 0; j < pairMap[i].keywords.length; j++) {
      if (hypothesisText.indexOf(pairMap[i].keywords[j]) !== -1) {
        detectedPair = pairMap[i];
        break;
      }
    }
    if (detectedPair) break;
  }

  // ペアが検出できない場合はデフォルトでドル円
  if (!detectedPair) {
    detectedPair = pairMap[0];
  }

  // --- 方向検出 ---
  var upKeywords = ['上昇', '上がる', '上方向', '高値更新', 'ブレイク', '突破', '反発', '買い', 'ロング', '上抜け', '円安', '上値試し'];
  var downKeywords = ['下落', '下がる', '下方向', '安値更新', '割れる', '崩れる', '売り', 'ショート', '下抜け', '円高', '下値試し'];
  // rangeKeywords: レンジ/横ばい/維持/もみ合い → デフォルトのまま

  var direction = 'レンジ'; // デフォルト

  for (var u = 0; u < upKeywords.length; u++) {
    if (hypothesisText.indexOf(upKeywords[u]) !== -1) {
      direction = '上昇';
      break;
    }
  }
  if (direction === 'レンジ') {
    for (var d = 0; d < downKeywords.length; d++) {
      if (hypothesisText.indexOf(downKeywords[d]) !== -1) {
        direction = '下落';
        break;
      }
    }
  }

  console.log('📊 仮説パース: ペア=' + detectedPair.symbol + ' 方向=' + direction);
  return {
    pair: detectedPair.symbol,
    rateIndex: detectedPair.rateIndex,
    isJpy: detectedPair.isJpy,
    direction: direction
  };
}


/**
 * 未検証の仮説を現在のレートデータで自動検証する
 * scheduler.gsから月曜朝に呼ばれる
 */


/**
 * 未検証の仮説を現在のレートデータで自動検証する
 * scheduler.gsから月曜朝に呼ばれる
 */
function verifyWeeklyHypotheses_() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);

    // 未検証仮説を取得（sheetsManager.gsの関数）
    var unverified = getUnverifiedHypotheses();
    if (unverified.length === 0) {
      console.log('📊 週次仮説検証: 未検証の仮説なし');
      return;
    }

    console.log('📊 週次仮説検証: ' + unverified.length + '件の未検証仮説');

    // レートキャッシュから最新レートを取得
    var cacheSheet = ss.getSheetByName('レートキャッシュ');
    if (!cacheSheet || cacheSheet.getLastRow() < 2) {
      console.log('📊 週次仮説検証: レートキャッシュが空');
      return;
    }

    var lastRow = cacheSheet.getLastRow();
    var latestRates = cacheSheet.getRange(lastRow, 1, 1, 8).getValues()[0];
    // B=USD/JPY(1), C=EUR/USD(2), D=GBP/USD(3), E=EUR/JPY(4), F=GBP/JPY(5), G=AUD/JPY(6), H=AUD/USD(7)

    var pairIndexMap = {
      'USD/JPY': 1, 'EUR/USD': 2, 'GBP/USD': 3,
      'EUR/JPY': 4, 'GBP/JPY': 5, 'AUD/JPY': 6, 'AUD/USD': 7
    };

    var jpyPairs = ['USD/JPY', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY'];

    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');

    for (var i = 0; i < unverified.length; i++) {
      var h = unverified[i];
      var pair = h.pair;
      var rateIdx = pairIndexMap[pair];

      if (!rateIdx) {
        console.log('  ⚠️ ペア不明: ' + pair + ' → スキップ');
        continue;
      }

      var currentRate = Number(latestRates[rateIdx]);
      var hypothesisRate = Number(h.rateAtHypothesis);

      if (!currentRate || currentRate <= 0 || !hypothesisRate || hypothesisRate <= 0) {
        console.log('  ⚠️ レート不正: ' + pair + ' 仮説時=' + hypothesisRate + ' 現在=' + currentRate);
        continue;
      }

      var change = currentRate - hypothesisRate;
      var isJpy = jpyPairs.indexOf(pair) !== -1;

      // 的中判定の閾値（JPYペアとUSDペアで異なる）
      var hitThreshold = isJpy ? 0.3 : 0.003;
      var rangeThreshold = isJpy ? 0.5 : 0.005;

      var verdict = '不的中';
      if (h.direction === '上昇' && change > hitThreshold) {
        verdict = '的中';
      } else if (h.direction === '下落' && change < -hitThreshold) {
        verdict = '的中';
      } else if (h.direction === 'レンジ' && Math.abs(change) < rangeThreshold) {
        verdict = '的中';
      }

      // Geminiで「なぜ当たった/外れた」を1行で自動生成
      var reason = generateVerificationReason_(h, currentRate, change, verdict, keys.GEMINI_API_KEY);

      // 変動幅の表示用フォーマット
      var decimals = isJpy ? 2 : 5;
      var changeRounded = change.toFixed(decimals);

      // 検証結果をシートに書き込み（sheetsManager.gsの関数）
      updateHypothesisVerification(h.hypothesisId, {
        verificationDate: today,
        rateAtVerification: currentRate,
        change: changeRounded,
        verdict: verdict,
        reason: reason
      });

      var emoji = (verdict === '的中') ? '✅' : '❌';
      console.log('  ' + emoji + ' ' + h.hypothesisId + ': ' + pair + ' ' + h.direction +
                  ' → ' + verdict + '（' + (change >= 0 ? '+' : '') + changeRounded + '）');
    }

    console.log('📊 週次仮説検証完了');

  } catch (e) {
    console.log('📊 週次仮説検証エラー（続行）: ' + e.message);
  }
}


/**
 * 仮説検証の「なぜ当たった/外れた」を1行で自動生成
 * @param {Object} hypothesis - 仮説データ
 * @param {number} currentRate - 検証時レート
 * @param {number} change - 変動幅
 * @param {string} verdict - 的中/不的中
 * @param {string} apiKey - Gemini APIキー
 * @return {string} 理由テキスト（20文字以内）
 */


/**
 * 仮説検証の「なぜ当たった/外れた」を1行で自動生成
 * @param {Object} hypothesis - 仮説データ
 * @param {number} currentRate - 検証時レート
 * @param {number} change - 変動幅
 * @param {string} verdict - 的中/不的中
 * @param {string} apiKey - Gemini APIキー
 * @return {string} 理由テキスト（20文字以内）
 */
function generateVerificationReason_(hypothesis, currentRate, change, verdict, apiKey) {
  try {
    var prompt = '以下のFX仮説の検証結果を1行（20文字以内）で説明してください。\n\n';
    prompt += '仮説: ' + hypothesis.content + '\n';
    prompt += '対象ペア: ' + hypothesis.pair + '\n';
    prompt += '仮説時レート: ' + hypothesis.rateAtHypothesis + '\n';
    prompt += '検証時レート: ' + currentRate + '\n';
    prompt += '変動: ' + (change >= 0 ? '+' : '') + change.toFixed(4) + '\n';
    prompt += '判定: ' + verdict + '\n\n';
    prompt += '【出力】1行のみ。20文字以内。余計な説明不要。\n';
    prompt += '出力例: ドル買い継続で155円台到達 / 予想に反し円高方向へ / 小動きで方向感なし\n';

    var result = callGemini_(prompt, apiKey, false);
    if (result && result.text) {
      return result.text.trim().split('\n')[0].substring(0, 40);
    }
    return verdict === '的中' ? '仮説通りの展開' : '仮説と異なる展開';
  } catch (e) {
    return verdict === '的中' ? '仮説通りの展開' : '仮説と異なる展開';
  }
}


/**
 * WEEKLY_HYPOTHESIS生成時にプロンプトに注入する的中率サマリーを生成
 * @return {string} 注入テキスト（最大500文字）。データなしなら空文字
 */


/**
 * WEEKLY_HYPOTHESIS生成時にプロンプトに注入する的中率サマリーを生成
 * @return {string} 注入テキスト（最大500文字）。データなしなら空文字
 */
function getHypothesisVerificationSummary_() {
  try {
    // 直近5件の検証結果を取得（sheetsManager.gsの関数）
    var results = getRecentHypothesisResults(5);
    if (results.length === 0) return '';

    var hitCount = 0;
    var totalCount = results.length;
    var upHit = 0, upTotal = 0;
    var downHit = 0, downTotal = 0;
    var rangeHit = 0, rangeTotal = 0;

    var lines = [];

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var isHit = (r.verdict === '的中');
      if (isHit) hitCount++;

      if (r.direction === '上昇') { upTotal++; if (isHit) upHit++; }
      else if (r.direction === '下落') { downTotal++; if (isHit) downHit++; }
      else { rangeTotal++; if (isHit) rangeHit++; }

      var emoji = isHit ? '✅' : '❌';
      var changeStr = r.change ? ((Number(r.change) >= 0 ? '+' : '') + r.change) : '';
      lines.push('  ' + emoji + ' ' + r.hypothesisDate + ' ' + r.content + ' → ' + r.verdict + '（' + changeStr + '）');
    }

    var text = '\n【前回までの仮説検証（自動集計）】\n';
    text += '直近' + totalCount + '件の的中率: ' + hitCount + '/' + totalCount + '（' + Math.round(hitCount / totalCount * 100) + '%）\n';
    text += lines.join('\n') + '\n';

    // 方向別の傾向
    var trend = '傾向: ';
    if (upTotal > 0) trend += '上昇予測' + upHit + '/' + upTotal + '的中。';
    if (downTotal > 0) trend += '下落予測' + downHit + '/' + downTotal + '的中。';
    if (rangeTotal > 0) trend += 'レンジ予測' + rangeHit + '/' + rangeTotal + '的中。';
    text += trend + '\n';
    text += '→ この傾向を踏まえて仮説を立てよ。\n';

    console.log('📊 仮説検証サマリー注入: 的中率' + hitCount + '/' + totalCount);
    return text;
  } catch (e) {
    console.log('⚠️ 仮説検証サマリー取得エラー: ' + e.message);
    return '';
  }
}


// ========================================
// Phase 4: 投稿品質フィードバック
// ========================================

/**
 * 投稿タイプ別の品質フィードバックテキストを生成
 * buildPrompt_からWEEKLY_HYPOTHESIS以外の全タイプで呼ばれる
 * 
 * @param {string} postType - 投稿タイプ
 * @return {string} 注入テキスト（最大300文字）。データ不足なら空文字
 */

