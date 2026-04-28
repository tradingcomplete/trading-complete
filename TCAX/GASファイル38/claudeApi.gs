/**
 * CompanaFXAutoPost - claudeApi.gs
 * Claude API 呼び出しラッパー + 市場分析 + 最終事実検証
 *
 * 提供する関数:
 *   - analyzeMarketWithClaude_: 市場データを Claude で分析(書く前のリサーチ)
 *   - finalFactVerify_: 最終事実検証(検出=Claude JSON、修正=コード置換)
 *   - callClaudeApi_: Claude API 共通呼び出し関数(Web検索対応)
 *   - callClaudeGenerate_: Claude 投稿生成(callClaudeApi_ ラッパー)
 *
 * 履歴:
 *   v12.1: analyzeMarketWithClaude_ 新設
 *   v12.4: Claude化 Phase 1(Gemini→Claude)
 *   v12.5: callClaudeApi_ 共通関数新設
 *   v12.6: finalFactVerify_ 新設
 *   v14.0 Phase R-1(2026-04-23): geminiApi.gs から独立ファイルへ分離
 */


// ===== ★v12.1: Claude市場分析（書く前にデータを正しく読む） =====
/**
 * 投稿テキストを生成する前に、Claudeが市場データを分析する。
 * 「今何が起きているか」をデータから正しく読み、その分析を
 * 投稿生成プロンプトに注入することで、方向性の矛盾を防ぐ。
 * 
 * 設計思想（v12.4〜）: 全ステージがClaude
 *   Claude = 分析役（データを読む）← この関数
 *   Claude = ライティング役（書く）（★v12.4でGeminiから変更）
 *   Claude = レビュー役（Q1〜Q7）
 * 
 * @param {Object} rates - 為替レートデータ
 * @param {string} postType - 投稿タイプ
 * @param {Object} keys - APIキー群
 * @return {string|null} Claude分析テキスト（失敗時null）
 */
function analyzeMarketWithClaude_(rates, postType, keys) {
  // RULE系・KNOWLEDGEは市場分析不要
  var skipTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'KNOWLEDGE'];
  if (skipTypes.indexOf(postType) !== -1) return null;
  if (!rates) return null;
  
  var claudeApiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!claudeApiKey) {
    console.log('⚠️ CLAUDE_API_KEY未設定 → 市場分析をスキップ');
    return null;
  }
  
  try {
    // ===== データ収集 =====
    var dataSummary = '';
    
    // 為替レート
    dataSummary += '【現在の為替レート】\n';
    dataSummary += 'USD/JPY: ' + formatRate_(rates.usdjpy, 'usdjpy', 'verify') + '\n';
    dataSummary += 'EUR/USD: ' + formatRate_(rates.eurusd, 'eurusd', 'verify') + '\n';
    dataSummary += 'GBP/USD: ' + formatRate_(rates.gbpusd, 'gbpusd', 'verify') + '\n';
    dataSummary += 'EUR/JPY: ' + formatRate_(rates.eurjpy, 'eurjpy', 'verify') + '\n';
    dataSummary += 'GBP/JPY: ' + formatRate_(rates.gbpjpy, 'gbpjpy', 'verify') + '\n';
    dataSummary += 'AUD/JPY: ' + formatRate_(rates.audjpy, 'audjpy', 'verify') + '\n';
    dataSummary += 'AUD/USD: ' + formatRate_(rates.audusd, 'audusd', 'verify') + '\n';
    
    // 通貨強弱トレンド（★v12.1: 蓄積データから取得。計算不要で高速）
    var strengthTrend = getCurrencyStrengthHistory_(keys.SPREADSHEET_ID, 4);
    if (strengthTrend) {
      dataSummary += '\n' + strengthTrend;
    } else {
      // シート未作成の場合はdetectHotPair_にフォールバック
      var hotPairResult = detectHotPair_(rates, keys.SPREADSHEET_ID);
      if (hotPairResult && hotPairResult.csRanking) {
        dataSummary += '\n【通貨強弱ランキング（前日比）】\n';
        hotPairResult.csRanking.forEach(function(c) {
          dataSummary += c.currency + ': ' + (c.score >= 0 ? '+' : '') + c.score.toFixed(2) + '%\n';
        });
      }
    }
    
    // ★v12.1.1: ダウ理論詳細（日足+週足のSH/SL値を含む）
    try {
      var dowSummary = getDowTheorySummary_(keys.SPREADSHEET_ID);
      if (dowSummary) dataSummary += '\n' + dowSummary;
    } catch (dowErr) { console.log('⚠️ ダウ理論取得失敗（続行）: ' + dowErr.message); }
    
    // 商品価格（BTC/GOLDのみ。WTI/天然ガスはAlpha Vantageデータが古いため停止）
    try {
      var btcCom = fetchCommodityPrices_();
      dataSummary += '\n【商品価格】\n';
      if (btcCom && btcCom.btc) dataSummary += 'BTC: ' + btcCom.btc.toFixed(0) + 'ドル\n';
      if (btcCom && btcCom.gold) dataSummary += 'ゴールド: ' + btcCom.gold.toFixed(2) + 'ドル\n';
    } catch (e) { console.log('⚠️ 商品価格取得失敗（続行）: ' + e.message); }
    
    // ニュースキャッシュ（buildPrompt_で取得済みの場合のみ）
    var scriptCache = CacheService.getScriptCache();
    var newsCache = scriptCache.get('market_news_v3');
    if (newsCache) {
      dataSummary += '\n【市場ニュース抜粋】\n' + newsCache.substring(0, 600) + '\n';
    }
    
    // ===== Claude分析プロンプト =====
    var analysisPrompt = 'あなたはFX市場のシニアアナリストです。\n';
    analysisPrompt += '以下のリアルタイムデータを読み、今の市場で何が起きているかを分析してください。\n';
    analysisPrompt += 'データが全てです。一般論や思い込みではなく、数字が示す事実だけを述べてください。\n\n';
    analysisPrompt += dataSummary;
    analysisPrompt += '\n【分析指示】以下の5項目を簡潔に述べよ:\n';
    analysisPrompt += '1. 今日の主要テーマ（1文で）\n';
    analysisPrompt += '2. 通貨の強弱: データから読み取れる事実。「○○が最も強い」「○○が弱い」\n';
    analysisPrompt += '3. ★勢いとモメンタム（最重要）: どの通貨の勢いが加速しているか。「★初動」がある通貨は特に注目。トレンドの強さ・方向・持続性を重視せよ\n';
    analysisPrompt += '4. 背景の推測: ニュースや金融政策から推測される理由（推測は「〜の可能性」と明記）\n';
    analysisPrompt += '5. ダウ理論との整合: 日足SH/SLトレンドと週足SH/SLトレンドが一致しているか。通貨強弱の勢いと日足トレンドが矛盾していないか。週足が日足と逆方向の場合は特に注意して言及せよ\n\n';
    analysisPrompt += '【出力ルール】\n';
    analysisPrompt += '・400文字以内で簡潔に\n';
    analysisPrompt += '・データにない情報を捏造するな\n';
    analysisPrompt += '・「史上最高値」「急騰」「暴落」等の表現はデータで裏付けられる場合のみ使用可\n';
    
    console.log('🧠 Claude市場分析を実行中...');
    var result = callClaude_(analysisPrompt, claudeApiKey);
    
    if (result) {
      console.log('✅ Claude市場分析完了（' + result.length + '文字）');
      console.log('🧠 分析: ' + result.substring(0, 200) + (result.length > 200 ? '...' : ''));
      return result;
    } else {
      console.log('⚠️ Claude市場分析失敗 → スキップ');
      return null;
    }
  } catch (e) {
    console.log('⚠️ Claude市場分析エラー（スキップ）: ' + e.message);
    return null;
  }
}


// ===== ★v12.6: 最終事実検証（検出=Claude JSON、修正=コード置換） =====
/**
 * 全処理が終わった最終投稿テキストに対して「事実だけ」を検証し、
 * 問題があればコードで機械的に修正して正しいテキストを返す。
 * 
 * 設計思想:
 *   Step 1: Claude APIで事実誤りを検出（JSON出力強制）
 *     → {"hasErrors": false} or {"hasErrors": true, "errors": [{wrong, correct, reason}]}
 *   Step 2: コードで postText.replace(wrong, correct) を機械的に適用
 *   → Claudeは「検出」だけ。「修正」はコード。分析レポートが投稿を壊す事故を根絶。
 * 
 * @param {string} postText - 最終投稿テキスト
 * @param {string} postType - 投稿タイプ
 * @param {Object} rates - 確定レート
 * @param {Object} keys - APIキー群
 * @return {string|null} 修正後テキスト（問題なしならnull、失敗でもnull）
 */
function finalFactVerify_(postText, postType, rates, keys) {
  // RULE系は個人の経験談が主体なのでスキップ
  var skipTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'KNOWLEDGE'];
  if (skipTypes.indexOf(postType) !== -1) return null;
  
  var claudeApiKey = keys.CLAUDE_API_KEY || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!claudeApiKey) return null;
  
  try {
    // ===== 確定データ収集 =====
    var factData = '';
    
    // ★v12.7: 本日の日付を明示（未来日付ハルシネーション防止のための基準）
    var todayForVerify = new Date();
    var todayStr = Utilities.formatDate(todayForVerify, 'Asia/Tokyo', 'yyyy年M月d日（E）');
    var todayIso = Utilities.formatDate(todayForVerify, 'Asia/Tokyo', 'yyyy-MM-dd');
    factData += '【本日の日付（最重要の基準）】\n';
    factData += todayStr + '（ISO: ' + todayIso + '）\n';
    factData += '→ この日付より後の日付の出来事を「起きた」「発言した」等の過去形・完了形で書いていたらハルシネーション（誤り）。\n';
    factData += '→ ただし「〜発表予定」「〜に注目」「〜を控える」等の未来予定は正しい記述。\n\n';
    
    // 現在レート
    if (rates) {
      factData += '【確定レート（APIリアルタイム値）】\n';
      for (var i = 0; i < CURRENCY_PAIRS.length; i++) {
        var p = CURRENCY_PAIRS[i];
        if (rates[p.key]) {
          factData += p.symbol + '(' + p.label + '): ' + formatRate_(rates[p.key], p.key, 'verify') + '\n';
        }
      }
    }
    
    // 本日始値（方向チェック用）
    try {
      var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
      var openRates = getTodayOpenRates_(ss);
      if (openRates && openRates.usdjpy) {
        factData += '\n【本日始値（方向判定の基準）】\n';
        factData += 'USD/JPY始値: ' + formatRate_(openRates.usdjpy, 'usdjpy', 'verify') + '\n';
        var currentUsdjpy = Number(rates.usdjpy);
        var openUsdjpy = Number(openRates.usdjpy);
        if (currentUsdjpy > openUsdjpy) {
          factData += '→ 本日のドル円は始値より上昇（= 円安方向）。「円高」と書いたら誤り\n';
        } else {
          factData += '→ 本日のドル円は始値より下落（= 円高方向）。「円安」と書いたら誤り\n';
        }
      }
    } catch (e) { console.log('⚠️ 始値取得失敗（続行）: ' + e.message); }
    
    // 通貨強弱
    try {
      var hotPairResult = detectHotPair_(rates, keys.SPREADSHEET_ID);
      if (hotPairResult && hotPairResult.csRanking) {
        factData += '\n【通貨強弱（実測値）】\n';
        for (var ci = 0; ci < hotPairResult.csRanking.length; ci++) {
          var cs = hotPairResult.csRanking[ci];
          factData += cs.currency + ': ' + (cs.score >= 0 ? '+' : '') + cs.score.toFixed(2) + '% ' + cs.direction + '\n';
        }
      }
    } catch (e) { console.log('⚠️ 通貨強弱取得失敗（続行）: ' + e.message); }
    
    // 経済カレンダー
    try {
      var cal = getEconomicCalendar_('today');
      if (cal) {
        factData += '\n【経済カレンダー（結果欄が空=未発表）】\n' + cal + '\n';
      }
    } catch (e) { console.log('⚠️ カレンダー取得失敗（続行）: ' + e.message); }
    
    // 政策金利（★v12.6: RBA 4.10%等の事実誤認防止）
    try {
      var policyRates = getPolicyRatesText_();
      if (policyRates) {
        factData += '\n【政策金利（確定データシートの値が正しい。お前の内部知識より優先）】\n' + policyRates;
      }
    } catch (e) { console.log('⚠️ 政策金利取得失敗（続行）: ' + e.message); }
    
    // 要人
    try {
      var leaders = getWorldLeadersText_();
      if (leaders) {
        factData += '\n【要人（確定データシートの値が正しい）】\n' + leaders;
      }
    } catch (e) { console.log('⚠️ 要人取得失敗（続行）: ' + e.message); }
    
    // ★v12.7: 継続中重大事象（「関税ショック前」等のハルシネーション防止）
    try {
      var ongoingEvents = getOngoingEvents_();
      if (ongoingEvents.length > 0) {
        factData += '\n【継続中重大事象チェック（最重要: これらは投稿時点で継続中）】\n';
        for (var ei = 0; ei < ongoingEvents.length; ei++) {
          var ev = ongoingEvents[ei];
          factData += '・' + ev.name + '（開始: ' + ev.startDate + '、現在も継続中）\n';
          if (ev.summary) factData += '  概要: ' + ev.summary + '\n';
          if (ev.cautionKeywords) factData += '  注意キーワード: ' + ev.cautionKeywords + '\n';
        }
        factData += '\n★投稿本文に以下のような表現があれば要警戒:\n';
        factData += '- 「〜前」「〜以前」「〜発動前」「〜ショック前」「〜が起きる前」\n';
        factData += '- 「〜が来る前」「〜が始まる前」\n';
        factData += '継続中事象を「まだ来ていない」「起きていない」と書いていたら\n';
        factData += 'ハルシネーション。correctには「〜が続く中」「〜の影響下で」等に書き換えよ。\n';
        factData += '※「2024年当時」「パンデミック前の」等、時期を明示する表現は保持してよい。\n';
      }
    } catch (e) { console.log('⚠️ 継続中重大事象取得失敗（続行）: ' + e.message); }
    
    // ===== Step 1: Claude APIで事実誤りを検出（JSON出力強制） =====
    var prompt = '以下のFX投稿テキストに事実の誤りがないか検証せよ。\n';
    prompt += '口調・文字数・フォーマットは見るな。事実だけに集中しろ。\n\n';
    prompt += '【投稿テキスト】\n' + postText + '\n\n';
    prompt += factData;
    prompt += '\n【チェック項目】\n';
    prompt += '1. 「円高」「円安」「上昇」「下落」の方向が確定データと一致しているか\n';
    prompt += '   ★最重要: ドル円が始値より大きい=円安。始値より小さい=円高\n';
    prompt += '2. 通貨強弱と「最強」「最弱」の記述が整合しているか\n';
    prompt += '3. 未発表指標を発表済みと書いていないか\n';
    prompt += '4. 要人名・政策の事実誤認がないか\n';
    prompt += '5. レート水準とペア名が一致しているか\n';
    prompt += '6. ★v12.7: 本日の日付より後の日付の出来事を過去形で書いていないか（最重要）\n';
    prompt += '   例（誤り）: 「4/17、トランプが解任示唆」「4月17日、米CPIが上振れ」\n';
    prompt += '   例（正しい）: 「4/17の米CPIに注目」「4月17日発表予定」\n';
    prompt += '   誤りの場合、correctには該当部分を丸ごと削除するか、未来予定の表現に書き換えよ\n\n';
    prompt += '7. ★v12.7: 継続中重大事象を「未発生」扱いしていないか\n';
    prompt += '   例（誤り）: 「関税ショック前の数字」→実際は関税ショックは2025年3月から継続中\n';
    prompt += '   例（正しい）: 「関税ショックの最中の数字」「関税の影響下での数字」\n';
    prompt += '   誤りの場合、correctには「〜が続く中」「〜の影響下で」等の書き換えを指定せよ\n\n';
    prompt += '★出力は以下のJSON形式のみ。JSON以外の文字を1文字でも出力したら失敗。\n';
    prompt += '問題なし: {"hasErrors": false}\n';
    prompt += '問題あり: {"hasErrors": true, "errors": [\n';
    prompt += '  {"wrong": "投稿内の間違っている表現（原文そのままコピペ）",\n';
    prompt += '   "correct": "差し替える正しい表現（wrongと同じ文体・長さ。説明は入れるな）",\n';
    prompt += '   "reason": "理由（説明はここに書け）"}\n';
    prompt += ']}\n\n';
    prompt += '★★★correctフィールドの鉄則:\n';
    prompt += '・correctはwrongの「差し替え」。投稿テキスト内でそのまま入れ替えても文章が成立する表現だけ書け\n';
    prompt += '・correctに括弧付き説明（〜＝円安）や理由を絶対に入れるな。理由はreasonに書け\n';
    prompt += '・問題のない箇所をerrorsに入れるな。事実誤りがある箇所だけ\n';
    prompt += '・四捨五入・丸め誤差（0.7138 vs 0.71376）は誤りではない。errorsに入れるな\n';
    prompt += '・wrongとcorrectが同じになるなら、それは誤りではない。errorsに入れるな\n';
    prompt += '例: wrong="159円台まで円高" → correct="159円台まで円安" reason="始値158.72→159は上昇=円安"\n';
    prompt += '例: wrong="円も対ドルでは強いけど" → correct="円も対ドルでは弱いけど" reason="ドル円上昇=円安=円は弱い"\n';
    prompt += 'NG: correct="円も対ドルでは弱い（始値158.72→159.00＝円安）" ← 説明が混入。投稿が壊れる\n';
    
    var systemPrompt = 'You are a fact checker. Respond with ONLY valid JSON. No explanations, no markdown, no text before or after the JSON.';
    
    console.log('🔍 最終事実検証を実行中...');
    var result = callClaudeApi_(prompt, claudeApiKey, { 
      maxRetries: 2, 
      logPrefix: '最終事実検証',
      systemPrompt: systemPrompt
    });
    
    if (!result || !result.text) {
      console.log('⚠️ 最終事実検証: API失敗 → スキップ');
      return null;
    }
    
    // JSONパース
    var parsed = null;
    try {
      var cleaned = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // フォールバック1: 文章中からJSON部分を抽出
      try {
        var jsonMatch = result.text.match(/\{[\s\S]*"hasErrors"[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
          console.log('✅ 最終事実検証: フォールバックJSON抽出成功');
        }
      } catch (e2) { console.log('⚠️ 最終事実検証: JSON抽出失敗（続行）: ' + e2.message); }
      
      // フォールバック2: 切れたJSONを修復（reason途中で切れた場合）
      if (!parsed) {
        try {
          var raw = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          // 不完全なJSON末尾を補完: "}]}" で閉じてみる
          var repaired = raw.replace(/,?\s*"reason"\s*:\s*"[^"]*$/, '"reason": ""') + ']}';
          // さらに余分な閉じ括弧を除去
          repaired = repaired.replace(/\]\}(\]\})+$/, ']}');
          parsed = JSON.parse(repaired);
          console.log('✅ 最終事実検証: 切れたJSON修復成功');
        } catch (e3) { console.log('⚠️ 最終事実検証: JSON修復失敗（続行）: ' + e3.message); }
      }
    }
    
    if (!parsed) {
      console.log('⚠️ 最終事実検証: JSON解析失敗 → スキップ');
      console.log('  応答冒頭: ' + result.text.substring(0, 150));
      return null;
    }
    
    // hasErrors=falseが明示されていなくても、errorsが空なら問題なし
    if (!parsed.hasErrors || !parsed.errors || parsed.errors.length === 0) {
      console.log('✅ 最終事実検証: 問題なし');
      return null;
    }
    
    // ===== Step 2: コードで機械的に置換 =====
    console.log('📝 最終事実検証: ' + parsed.errors.length + '件の事実誤り検出');
    var fixedText = postText;
    var fixCount = 0;
    
    for (var ei = 0; ei < parsed.errors.length; ei++) {
      var err = parsed.errors[ei];
      if (!err.wrong || !err.correct) continue;
      
      // ★v12.6: wrongとcorrectが同一なら修正不要 → スキップ
      if (err.wrong === err.correct) {
        console.log('  ⏭️ wrong===correct → スキップ: 「' + err.wrong + '」');
        continue;
      }
      
      // ★安全弁: correctフィールドに説明が混入していたらスキップ
      // 「（...）」付き説明、wrongの2倍以上の長さ、「問題ない」等のメタ表現を検出
      var correctContaminated = false;
      if (err.correct.indexOf('（') !== -1 && err.correct.indexOf('）') !== -1 
          && err.correct.length > err.wrong.length * 1.5) {
        correctContaminated = true;
      }
      if (err.correct.indexOf('問題ない') !== -1 || err.correct.indexOf('許容範囲') !== -1
          || err.correct.indexOf('表現自体は') !== -1 || err.correct.indexOf('誤りなし') !== -1) {
        correctContaminated = true;
      }
      if (err.correct.length > err.wrong.length * 3) {
        correctContaminated = true;
      }
      
      if (correctContaminated) {
        console.log('  ⚠️ correct汚染検出 → スキップ: 「' + err.wrong + '」→「' + err.correct.substring(0, 50) + '...」');
        continue;
      }
      
      if (fixedText.indexOf(err.wrong) !== -1) {
        fixedText = fixedText.replace(err.wrong, err.correct);
        console.log('  🔧 「' + err.wrong + '」→「' + err.correct + '」（' + (err.reason || '') + '）');
        fixCount++;
      } else {
        console.log('  ⚠️ 「' + err.wrong + '」が投稿内に見つからず → スキップ');
      }
    }
    
    if (fixCount === 0) {
      console.log('⚠️ 最終事実検証: 指摘箇所が投稿内に見つからず → 修正なし');
      return null;
    }
    
    console.log('✅ 最終事実検証: ' + fixCount + '件修正完了');
    return fixedText;
    
  } catch (e) {
    console.log('⚠️ 最終事実検証エラー（スキップ）: ' + e.message);
    return null;
  }
}


// ===== ★v12.5: Claude API共通呼び出し関数 =====
/**
 * Anthropic Messages APIの共通呼び出し関数。
 * callClaudeGenerate_、callClaude_（qualityReview.gs）、callGemini_フォールバックが
 * 全てこの関数を経由する。バグ修正やモデル変更を1箇所で完結させるための統合。
 * 
 * @param {string} prompt - プロンプト
 * @param {string} apiKey - Anthropic APIキー
 * @param {Object} [options] - オプション
 * @param {boolean} [options.useWebSearch=false] - Web検索ツール使用
 * @param {string}  [options.systemPrompt=null] - systemプロンプト
 * @param {number}  [options.maxRetries=3] - リトライ回数
 * @param {string}  [options.logPrefix='Claude API'] - ログ表示名
 * @return {{ text: string, raw: Object }|null}
 */
function callClaudeApi_(prompt, apiKey, options) {
  var opts = options || {};
  var MAX_RETRIES = opts.maxRetries || 3;
  var logPrefix = opts.logPrefix || 'Claude API';
  var url = 'https://api.anthropic.com/v1/messages';
  
  // ★v14.0 Phase 8(2026-04-24): Prompt Caching 対応
  //   opts.useCache == true かつ opts.staticPart があれば、
  //   content を配列化し staticPart に cache_control を設定する。
  //   それ以外は従来通り content: string で動作する(後方互換完全維持)。
  var content;
  if (opts.useCache && opts.staticPart && opts.staticPart.length > 0) {
    // staticPart + dynamicPart = prompt の想定
    // prompt から staticPart 部分を除いた残りが dynamicPart
    var staticPart = opts.staticPart;
    var dynamicPart;
    if (prompt.indexOf(staticPart) === 0) {
      dynamicPart = prompt.substring(staticPart.length);
    } else {
      // staticPart が prompt の先頭にない場合は prompt 全体を動的扱い(保険)
      console.log('⚠️ ' + logPrefix + ' キャッシュ無効: staticPart が prompt 先頭にない');
      dynamicPart = prompt;
      staticPart = null;
    }
    
    if (staticPart) {
      content = [
        {
          type: 'text',
          text: staticPart,
          cache_control: { type: 'ephemeral' }  // 5分キャッシュ
        },
        {
          type: 'text',
          text: dynamicPart
        }
      ];
    } else {
      content = prompt;  // フォールバック
    }
  } else {
    // 従来モード: content は string
    content = prompt;
  }
  
  var requestBody = {
    model: CLAUDE_MODEL,  // ★v12.6.1: config.gs定数参照（ハードコード廃止）
    max_tokens: opts.maxTokens || 4096,  // ★v13.0: Stage 1総合レビュー用に可変化(デフォルト4096・Stage1で8192指定)
    messages: [
      { role: 'user', content: content }
    ]
  };
  
  // Web検索ツール（品質レビューQ6用・ニュース取得用）
  // ★v12.10: max_uses 可変化
  // 注: web_search は server-side tool のため tool_choice による強制は非対応。
  //     検索を使わせたい場合はプロンプトで強く指示する方式で対応する。
  if (opts.useWebSearch) {
    var maxSearchUses = opts.maxSearchUses || 3;
    requestBody.tools = [
      { type: 'web_search_20250305', name: 'web_search', max_uses: maxSearchUses }
    ];
  }
  
  // systemプロンプト（Web検索時のJSON出力強制等）
  if (opts.systemPrompt) {
    requestBody.system = opts.systemPrompt;
  }
  
  var fetchOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
  
  for (var attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, fetchOptions);
      var code = response.getResponseCode();
      
      if (code === 200) {
        var body = JSON.parse(response.getContentText());
        if (body.content && body.content.length > 0) {
          var textParts = [];
          for (var ci = 0; ci < body.content.length; ci++) {
            if (body.content[ci].type === 'text' && body.content[ci].text) {
              textParts.push(body.content[ci].text);
            }
          }
          if (textParts.length > 0) {
            console.log('✅ ' + logPrefix + '成功（試行' + attempt + (opts.useWebSearch ? '・Web検索有効' : '') + (opts.useCache ? '・キャッシュ有効' : '') + '）');
            
            // ★v14.0 Phase 8: キャッシュ効果のログ出力
            if (body.usage) {
              try {
                if (body.usage.cache_creation_input_tokens && body.usage.cache_creation_input_tokens > 0) {
                  console.log('💰 ' + logPrefix + ' キャッシュ書き込み: ' + body.usage.cache_creation_input_tokens + ' トークン (1.25x課金・初回)');
                }
                if (body.usage.cache_read_input_tokens && body.usage.cache_read_input_tokens > 0) {
                  console.log('💰 ' + logPrefix + ' キャッシュ読み込み: ' + body.usage.cache_read_input_tokens + ' トークン (0.1x課金・再利用)');
                }
              } catch (logErr) {
                // ログ失敗は無視
              }
            }
            
            return { text: textParts.join(''), raw: body };
          }
        }
      }
      
      // エラー詳細ログ
      var errorDetail = '';
      try {
        var errorBody = JSON.parse(response.getContentText());
        errorDetail = ' → ' + (errorBody.error ? errorBody.error.type + ': ' + errorBody.error.message : response.getContentText().substring(0, 200));
      } catch (parseErr) {
        errorDetail = ' → ' + response.getContentText().substring(0, 200);
      }
      console.log('⚠️ ' + logPrefix + '失敗 (' + code + ') 試行' + attempt + '/' + MAX_RETRIES + errorDetail);
      
      // 指数バックオフ（429/529は長め、その他は短め）
      if (code === 429 || code === 529) {
        var waitSec = 5 * Math.pow(2, attempt - 1);
        console.log('⏱️ ' + waitSec + '秒待機中...');
        Utilities.sleep(waitSec * 1000);
      } else {
        Utilities.sleep(2000);
      }
    } catch (e) {
      console.log('⚠️ ' + logPrefix + 'エラー: ' + e.message + ' 試行' + attempt + '/' + MAX_RETRIES);
      Utilities.sleep(3000);
    }
  }
  
  console.log('❌ ' + logPrefix + ': 全リトライ失敗');
  return null;
}


// ===== Claude投稿生成（★v12.4新規 → ★v12.5: callClaudeApi_ラッパー化） =====
/**
 * Claude APIで投稿テキストを生成する
 * Geminiの代わりにメイン生成を担当。データに忠実で方向の矛盾が起きにくい。
 * 
 * @param {string} prompt - buildPrompt_で構築済みのプロンプト
 * @param {Object} keys - getApiKeys()の戻り値
 * @param {string|Object} promptOrPromptObj - 
 *   string: 従来の形式(後方互換・キャッシュなし)
 *   Object: { staticPart, dynamicPart, prompt } 形式 → Prompt Caching 有効
 * @return {Object|null} { text: string, raw: Object } callGemini_と同じ形式
 */
function callClaudeGenerate_(promptOrPromptObj, keys) {
  var apiKey = keys.CLAUDE_API_KEY || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) {
    console.log('❌ CLAUDE_API_KEYが未設定です');
    return null;
  }
  
  // ★v14.0 Phase 8(2026-04-24): Prompt Caching 対応
  //   引数が Object(staticPart付き) なら5分キャッシュ有効
  //   引数が string なら従来通り(後方互換)
  if (typeof promptOrPromptObj === 'object' && promptOrPromptObj !== null && promptOrPromptObj.staticPart) {
    // 新形式: promptObj = { staticPart, dynamicPart, prompt }
    return callClaudeApi_(promptOrPromptObj.prompt, apiKey, {
      logPrefix: 'Claude投稿生成',
      useCache: true,
      staticPart: promptOrPromptObj.staticPart
    });
  } else {
    // 旧形式: string (後方互換)
    return callClaudeApi_(promptOrPromptObj, apiKey, { logPrefix: 'Claude投稿生成' });
  }
}


