/**
 * CompanaFXAutoPost - geminiApi.gs
 * 投稿テキスト生成のメインフロー(Phase A)
 *
 * 提供する関数:
 *   - generatePost: レート取得 → プロンプト構築 → 市場分析 → 生成 → 後処理
 *                  v13.0 または v12.10 の品質検証を呼び出して完結させる
 *
 * 依存する関数(他ファイル):
 *   - buildPrompt_                       (promptBuilder.gs)
 *   - fetchLatestRates_ / saveRatesToSheet_ / getLatestRatesFromCache_ (rateManager.gs)
 *   - applyPostProcessingChain_ / removeTCMention_                   (postProcessor.gs)
 *   - analyzeMarketWithClaude_ / callClaudeGenerate_                 (claudeApi.gs)
 *   - factCheckPost_                     (factCheck.gs)
 *   - detectHotPair_ / cacheTodayPost_   (marketAnalysis.gs)
 *   - executeQualityReviewChain_         (reviewOrchestrator.gs)
 *   - executeValidationV13_              (validationV13.gs)
 *
 * 履歴:
 *   Phase 3〜v14.0 Phase 6 までの主要履歴は各ファイルのヘッダを参照。
 *   v14.0 Phase R-1(2026-04-23): 1,973行から generatePost のみに切り出し。
 *     - 品質レビュー調停 → reviewOrchestrator.gs
 *     - Claude API ラッパ + 市場分析 + 最終事実検証 → claudeApi.gs
 *     - Gemini API ラッパ → llmApi.gs
 *     - 確定データ収集 → anchorDataCollector.gs
 */

function generatePost(postType, context, cachedRates, options) {
  var keys = getApiKeys();
  var typeConfig = POST_TYPES[postType];
  
  // ★v14.0 Phase 6(2026-04-23): options.skipValidation=true なら Stage 1 検証をスキップ
  //   背景: runMorning 内でランダム遅延・API制限・ニュース取得で時間を使った後に
  //         Stage 1 を実行するとGAS 6分制限でタイムアウト(2026-04-23本番で発生)。
  //   対処: Phase A では生成までで完結させ、Stage 1 は Phase B(独立した6分枠)に移動。
  var skipValidation = (options && options.skipValidation === true);
  
  // ★v8.8: GAS 6分制限の安全弁（経過時間を監視し、4分超過でリトライをスキップ）
  var startTime = new Date();
  var TIME_LIMIT_SEC = 300; // 5分（★v12.6: 4分→5分に緩和。Phase Bに画像+メール分離済みのため安全）
  
  if (!typeConfig) {
    console.log('❌ 不明な投稿タイプ: ' + postType);
    return null;
  }
  
  // ★ Step1: レート取得（キャッシュがあればスキップ）
  var rates = cachedRates || null;
  if (!rates) {
    rates = fetchLatestRates_(keys.GEMINI_API_KEY);
    if (rates) {
      console.log('📊 レート取得成功: USD/JPY=' + rates.usdjpy + ' EUR/USD=' + rates.eurusd + ' GBP/USD=' + rates.gbpusd + ' EUR/JPY=' + rates.eurjpy + ' GBP/JPY=' + rates.gbpjpy + ' AUD/JPY=' + rates.audjpy + ' AUD/USD=' + rates.audusd);
      saveRatesToSheet_(rates, keys.SPREADSHEET_ID);
    } else {
      // ★v5.9.1: API失敗時、レートキャッシュの最新値にフォールバック
      console.log('⚠️ Twelve Data API失敗。レートキャッシュからフォールバック取得...');
      rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
      if (rates) {
        console.log('✅ キャッシュフォールバック成功: USD/JPY=' + rates.usdjpy);
      } else {
        console.log('❌ キャッシュにもデータなし。レートなしで生成します');
      }
    }
  } else {
    console.log('📊 キャッシュレート使用: USD/JPY=' + rates.usdjpy);
  }
  
  // Step2: レートを埋め込んでプロンプト構築
  // ★v14.0 Phase 8(2026-04-24): buildPrompt_ の返り値がオブジェクト化
  //   旧: var prompt = buildPrompt_(...);  (string)
  //   新: var promptObj = buildPrompt_(...);  { staticPart, dynamicPart, prompt }
  var promptObj = buildPrompt_(postType, typeConfig, context, rates);
  
  // ★v12.1→v12.4: Claude市場分析（書く前にデータを正しく読む）
  // 設計（v12.4〜）: 全3ステージがClaude
  //   Stage 1: Claude がデータを読み、何が起きているか分析（←これ）
  //   Stage 2: Claude が分析に基づいて投稿を書く（★v12.4でGeminiから変更）
  //   Stage 3: Claude が品質レビュー（Q1〜Q7）
  var elapsed = (new Date() - startTime) / 1000;
  if (elapsed < 180) { // 3分以内ならClaude分析を実行（6分制限の安全策）
    var marketAnalysis = analyzeMarketWithClaude_(rates, postType, keys);
    if (marketAnalysis) {
      // ★v14.0 Phase 8(2026-04-24): 市場分析を dynamicPart 先頭に注入
      //   旧: staticPart 内の【★重要】の直前に replace で挿入
      //       → 毎回 staticPart が変わり Prompt Caching が無効化
      //   新: dynamicPart の先頭に連結
      //       → staticPart 不変でキャッシュ有効
      //       → 設計意図(Claude が動的データ前に分析指示を受ける)は保持
      var marketAnalysisBlock = '【★★★ Claude市場分析（この分析が最も正確。この分析と矛盾する記述を絶対に書くな）】\n' +
                                marketAnalysis + '\n' +
                                '※上記はリアルタイムデータに基づくClaude Sonnetの分析です。\n' +
                                '※通貨の方向（上昇/下落）、強弱関係、背景の記述は全てこの分析に従うこと。\n' +
                                '※この分析と矛盾する一般論（例:「リスク回避=円買い」）をデータが否定している場合、データが正しい。\n\n';
      promptObj.dynamicPart = marketAnalysisBlock + promptObj.dynamicPart;
      promptObj.prompt = promptObj.staticPart + promptObj.dynamicPart;
      console.log('📏 Claude分析注入後のプロンプト: ' + promptObj.prompt.length + '文字 (staticPart不変: ' + promptObj.staticPart.length + '字)');
    }
  } else {
    console.log('⏱️ 経過' + Math.round(elapsed) + '秒 → Claude市場分析をスキップ（時間節約）');
  }
  
  // Step3: 投稿テキスト生成
  // ★v12.4: Gemini→Claude化（Phase 1）
  // 理由: Geminiはプロンプト内のデータ（通貨強弱等）を自分の推論で上書きし、
  //        「AUD+2.95%（最強）」なのに「豪ドル売り加速」と書く方向の矛盾が頻発。
  //        Claudeは指示とデータに忠実で、方向の矛盾がほぼ発生しない。
  // 設計: Geminiは「リサーチ」（fetchMarketNews_のGrounding）と「検証」（factCheckPost_のGrounding）のみ。
  //        「ライティング」はClaudeが担当。
  // ★v14.0 Phase 8: promptObj を渡す(キャッシュ対応のため staticPart が必要)
  var result = callClaudeGenerate_(promptObj, keys);
  
  if (!result) {
    console.log('❌ Claude投稿生成失敗');
    return null;
  }
  
  // ★v8.8: 後処理チェーンを共通関数に統合（旧: 19関数を個別呼び出し）
  var cleanedText = applyPostProcessingChain_(result.text, postType, rates);
  
  // TC言及の後処理除去（禁止タイプでプロンプト指示をすり抜けた場合）
  // ★v5.4: GOLDEN/LUNCH（平日AI自律判断）+ 全RULE/WEEKLY系を許可に拡張
  var tcAllowedInPost = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'WEEKLY_REVIEW', 'WEEKLY_LEARNING', 'WEEKLY_HYPOTHESIS', 'GOLDEN', 'LUNCH'];
  if (tcAllowedInPost.indexOf(postType) === -1) {
    cleanedText = removeTCMention_(cleanedText);
  }
  
  // ★v5.8: 700文字ハードカット（ハッシュタグを除く本文が700文字を超えたら切る）
  // NEXT_WEEKなどで経済カレンダーを全展開してしまうケースの安全弁
  var hardCap = 700;
  var hashtagMatch = cleanedText.match(/\n\n(#[^\n]+)$/);
  var bodyForCap = hashtagMatch ? cleanedText.slice(0, hashtagMatch.index) : cleanedText;
  var hashtagPart = hashtagMatch ? hashtagMatch[0] : '';
  
  if (bodyForCap.length > hardCap) {
    // 700文字以内の最後の「。」「？」「）」で切る
    var cutBody = bodyForCap.substring(0, hardCap);
    var lastSentenceEnd = Math.max(
      cutBody.lastIndexOf('。'),
      cutBody.lastIndexOf('？'),
      cutBody.lastIndexOf('）')
    );
    if (lastSentenceEnd > hardCap * 0.5) {
      cutBody = cutBody.substring(0, lastSentenceEnd + 1);
    }
    cleanedText = cutBody.trim() + hashtagPart;
    console.log('✂️ 700文字ハードカット: ' + bodyForCap.length + '文字→' + cutBody.trim().length + '文字');
  }
  
  // ★v8.8.1→v12.5: リトライ共通パラメータ（4つのリトライで共有）
  var retryBase = {
    postType: postType,
    rates: rates,
    startTime: startTime,
    timeLimitSec: TIME_LIMIT_SEC,
    tcAllowedInPost: tcAllowedInPost
  };
  
  // ★v5.9.4: 🔥主役ペアのバリデーション（市場系投稿のみ）
  // 通貨強弱で算出した主役ペアが本文に含まれていなければリトライ
  // ★v8.8: INDICATORを除外（指標の通貨ペアが主役であるべきで、通貨強弱の主役とは一致しないことが多い）
  // ★v13.0.9(2026-04-20): NY削除の残骸整理(v12.7でNYタイプ廃止済み)
  // ★2026-04-29: TOKYO削除(平日5投稿→4投稿)
  var marketTypes = ['MORNING', 'LUNCH', 'LONDON', 'GOLDEN'];
  if (marketTypes.indexOf(postType) !== -1 && rates) {
    try {
      var hotCheck = detectHotPair_(rates, keys.SPREADSHEET_ID);
      if (hotCheck && hotCheck.hotPair) {
        var hotSymbol = hotCheck.hotPair.symbol;   // 例: GBP/USD
        var hotJpName = hotCheck.hotPair.jpName;   // 例: ポンドドル
        var bodyOnly = cleanedText.split(/\n\n#/)[0]; // ハッシュタグ前の本文
        
        if (bodyOnly.indexOf(hotSymbol) === -1 && bodyOnly.indexOf(hotJpName) === -1) {
          console.log('⚠️ 🔥主役ペア「' + hotJpName + '」が本文に未含。リトライ...');
          
          var hotPrompt = '以下の投稿を少し調整してください。\n\n';
          hotPrompt += '今日一番動いている「' + hotSymbol + '（' + hotJpName + '）」にも触れてほしいです。\n';
          hotPrompt += '文章の自然さ・口調・フォーマットはそのまま維持してください。\n';
          hotPrompt += '無理に全体を書き換えず、自然に「' + hotJpName + '」を組み込む程度でOK。\n\n';
          hotPrompt += '【元の投稿】\n' + cleanedText;
          
          var hotResult = executeRetry_({
            name: '🔥主役ペア「' + hotJpName + '」',
            prompt: hotPrompt,
            useGrounding: true,
            applyTCRemoval: true,
            verifyFn: function(retryText) {
              var retryBody = retryText.split(/\n\n#/)[0];
              return retryBody.indexOf(hotSymbol) !== -1 || retryBody.indexOf(hotJpName) !== -1;
            }
          }, retryBase);
          if (hotResult) cleanedText = hotResult;
        } else {
          console.log('✅ 🔥主役ペア「' + hotJpName + '」確認OK');
        }
      }
    } catch (hotErr) {
      console.log('⚠️ 主役ペアチェックエラー（投稿には影響なし）: ' + hotErr.message);
    }
  }
  
  // === リスクセンチメント誤記チェック（市場系投稿のみ） ===
  // 「リスクオフ」+「円売り」の組み合わせは絶対禁止。検出したらリトライ
  // ★v13.0.9(2026-04-20): NY削除の残骸整理(v12.7でNYタイプ廃止済み)
  // ★2026-04-29: TOKYO削除(平日5投稿→4投稿)
  var riskSentimentTypes = ['MORNING', 'LUNCH', 'LONDON', 'GOLDEN', 'INDICATOR'];
  if (riskSentimentTypes.indexOf(postType) !== -1) {
    try {
      var bodyForRiskCheck = cleanedText.split(/\n\n#/)[0];
      var hasRiskOffYenSell = (bodyForRiskCheck.indexOf('リスクオフ') !== -1 || bodyForRiskCheck.indexOf('リスク回避') !== -1)
                           && bodyForRiskCheck.indexOf('円売り') !== -1;
      
      if (hasRiskOffYenSell) {
        console.log('⚠️ リスクセンチメント誤記を検出（リスクオフ+円売り）。リトライ...');
        
        var riskPrompt = '以下の投稿に重大な誤りがあります。修正してください。\n\n';
        riskPrompt += '【絶対禁止ルール】\n';
        riskPrompt += 'リスクオフ（地政学リスク・株安）= 円高方向（円が買われる）\n';
        riskPrompt += '「リスクオフで円売り」「リスク回避で円売り」は完全に間違い。必ず削除または修正すること。\n\n';
        riskPrompt += '口調・フォーマット・絵文字はそのまま維持。リスクセンチメントの方向性だけ修正。\n\n';
        riskPrompt += '【修正前の投稿】\n' + cleanedText;
        
        var riskResult = executeRetry_({
          name: 'リスクセンチメント',
          prompt: riskPrompt,
          useGrounding: true,
          applyTCRemoval: true,
          verifyFn: function(retryText) {
            var retryBody = retryText.split(/\n\n#/)[0];
            var stillHasError = (retryBody.indexOf('リスクオフ') !== -1 || retryBody.indexOf('リスク回避') !== -1)
                             && retryBody.indexOf('円売り') !== -1;
            return !stillHasError;
          }
        }, retryBase);
        if (riskResult) cleanedText = riskResult;
      }
    } catch (riskErr) {
      console.log('⚠️ リスクセンチメントチェックエラー（投稿には影響なし）: ' + riskErr.message);
    }
  }

  // ★v6.0.2: 絵文字最低3個のバリデーション（全投稿タイプ共通）
  // プロンプトで指示しても絵文字0〜2個の投稿が生成されるケースがあるためリトライで補完
  var emojiList = ['\u2615', '\uD83D\uDCD5', '\uD83D\uDCDD', '\uD83D\uDCCB', '\uD83D\uDCA1', '\u26A0\uFE0F', '\u2705'];
  // ☕=\u2615, 📕=\uD83D\uDCD5, 📝=\uD83D\uDCDD, 📋=\uD83D\uDCCB, 💡=\uD83D\uDCA1, ⚠️=\u26A0\uFE0F, ✅=\u2705
  try {
    var bodyForEmojiCheck = cleanedText.split(/\n\n#/)[0];
    var currentEmojiCount = countEmojis_(bodyForEmojiCheck, emojiList);
    
    if (currentEmojiCount < 3) {
      console.log('⚠️ 絵文字が' + currentEmojiCount + '個（最低3個必要）。リトライ...');
      
      var emojiPrompt = '以下の投稿を、ノート形式に調整してください。\n\n';
      emojiPrompt += '【ルール】\n';
      emojiPrompt += '・絵文字（☕📕📝📋💡⚠️✅）を使って3〜4ブロックに区切ること。\n';
      emojiPrompt += '・各ブロック: 絵文字+事実（1行）→分析（→1つだけ）の構造。\n';
      emojiPrompt += '・内容・口調・文字数はそのまま維持。構造だけ変える。\n';
      emojiPrompt += '・最後は絵文字なし・→なしの感想で締める。\n\n';
      emojiPrompt += '【元の投稿】\n' + cleanedText;
      
      var emojiResult = executeRetry_({
        name: '絵文字',
        prompt: emojiPrompt,
        useGrounding: false,
        applyTCRemoval: false,
        verifyFn: function(retryText) {
          var retryBody = retryText.split(/\n\n#/)[0];
          return countEmojis_(retryBody, emojiList) >= 3;
        }
      }, retryBase);
      if (emojiResult) cleanedText = emojiResult;
    }
  } catch (emojiErr) {
    console.log('⚠️ 絵文字チェックエラー（投稿には影響なし）: ' + emojiErr.message);
  }
  
  // ★v5.9: →が1ブロックに2本以上あるブロックを検出してリトライ
  // 「1ブロックに→は1つだけ」ルールの後処理による担保
  try {
    var bodyForArrowCheck = cleanedText.split(/\n\n#/)[0];
    
    if (checkMultiArrowBlocks_(bodyForArrowCheck)) {
      console.log('⚠️ →が2本以上のブロックを検出。リトライ...');
      
      var arrowPrompt = '以下の投稿を修正してください。\n\n';
      arrowPrompt += '【絶対ルール】\n';
      arrowPrompt += '・絵文字ブロック1つに →（矢印で始まる行）は必ず1行だけ。\n';
      arrowPrompt += '・2本目以降の→は、→を外して普通の補足文として書き直せ。\n';
      arrowPrompt += '・例(NG): 「→上振れ \\n→インフレ懸念 \\n→ドル買い」\n';
      arrowPrompt += '・例(OK): 「→上振れはインフレ懸念につながり、ドル買いが加速する」\n';
      arrowPrompt += '・内容・口調・絵文字・文字数はそのまま維持。→の本数だけ直す。\n\n';
      arrowPrompt += '【元の投稿】\n' + cleanedText;
      
      var arrowResult = executeRetry_({
        name: '→複数ブロック',
        prompt: arrowPrompt,
        useGrounding: false,
        applyTCRemoval: false,
        verifyFn: function(retryText) {
          var retryBody = retryText.split(/\n\n#/)[0];
          return !checkMultiArrowBlocks_(retryBody);
        }
      }, retryBase);
      if (arrowResult) cleanedText = arrowResult;
    }
  } catch (arrowErr) {
    console.log('⚠️ →複数ブロックチェックエラー（投稿には影響なし）: ' + arrowErr.message);
  }

  // ★v6.1: ファクトチェック + 自動修正
  // ★v6.1.1: テスト一括実行時はスキップ（GAS 6分制限対策）
  // ★v12.10: DISABLE_FACTCHECK フラグで無効化可能に（診断書 水準1-1: factCheck削除）
  //   背景: 2026-04-18 WEEKLY_REVIEW で Q6①論理矛盾が Gemini autoFix 経由で悪化。
  //         検証段階の責務重複が問題の根本原因と判明。
  //         Gemini factCheck → Gemini autoFix のループを断ち切り、
  //         Claude 品質レビュー + 最終事実検証 + 対話型検証の3段で純化する。
  //   ロールバック: ScriptProperties 'DISABLE_FACTCHECK' = 'false' で復活
  var skipFactCheck = PropertiesService.getScriptProperties().getProperty('SKIP_FACT_CHECK') === 'true';
  var disableFactCheck = PropertiesService.getScriptProperties().getProperty('DISABLE_FACTCHECK') !== 'false'; // デフォルト無効化
  var factResult = { passed: true, summary: 'スキップ', details: '', issues: [] };
  var fixLog = '';
  var originalBeforeFix = cleanedText;
  var csForFactCheck = null;
  
  // ★v12.10: 通貨強弱データは品質レビューでも使うため、factCheck 無効化でも取得する
  try {
    var hotForFact = detectHotPair_(rates, keys.SPREADSHEET_ID);
    if (hotForFact && hotForFact.csRanking) {
      csForFactCheck = hotForFact.csRanking;
    }
  } catch (csErr) {
    console.log('⚠️ 方向チェック用通貨強弱取得失敗（続行）: ' + csErr.message);
  }
  
  if (!skipFactCheck && !disableFactCheck) {
    factResult = factCheckPost_(cleanedText, postType, keys.GEMINI_API_KEY, rates, csForFactCheck);
    
    if (!factResult.passed && factResult.issues.length > 0) {
      // ★v8.6: 検証不能（removable）と修正可能を分離
      var fixableIssues = [];
      var removableIssues = [];
      for (var fi = 0; fi < factResult.issues.length; fi++) {
        if (factResult.issues[fi].removable) {
          removableIssues.push(factResult.issues[fi]);
        } else {
          fixableIssues.push(factResult.issues[fi]);
        }
      }
      
      // Step 1: 検証不能な記述は即削除（Geminiに任せず機械的に処理）
      if (removableIssues.length > 0) {
        cleanedText = forceRemoveIssueLines_(cleanedText, removableIssues);
        fixLog += '【検証不能→削除 ' + removableIssues.length + '件】\n';
        for (var rmi = 0; rmi < removableIssues.length; rmi++) {
          fixLog += '  🗑️ ' + (removableIssues[rmi].claim || '').substring(0, 50) + '\n';
        }
        console.log('🗑️ 検証不能な記述を' + removableIssues.length + '件削除');
      }
      
      // Step 2: 修正可能な❌はautoFixPost_に渡す
      if (fixableIssues.length > 0) {
        var fixResult = autoFixPost_(cleanedText, fixableIssues, postType, keys.GEMINI_API_KEY, rates, csForFactCheck);
        
        // ★v8.0: 自動修正後に問題の表現がまだ残っていないか検証+リトライ
        if (fixResult.fixed) {
          var remainingIssues = verifyAutoFix_(fixResult.text, fixableIssues);
          if (remainingIssues.length > 0) {
            console.log('⚠️ 自動修正後も' + remainingIssues.length + '件の問題が残存 → リトライ');
            for (var ri = 0; ri < remainingIssues.length; ri++) {
              console.log('  残存: ' + remainingIssues[ri].claim);
            }
            var retryFixResult = autoFixPost_(fixResult.text, remainingIssues, postType, keys.GEMINI_API_KEY, rates, csForFactCheck);
            if (retryFixResult.fixed) {
              var stillRemaining = verifyAutoFix_(retryFixResult.text, remainingIssues);
              if (stillRemaining.length > 0) {
                console.log('⚠️ リトライ後も' + stillRemaining.length + '件残存（強制削除で対応）');
                var forcedText = forceRemoveIssueLines_(retryFixResult.text, stillRemaining);
                fixResult = { text: forcedText, fixed: true, fixLog: retryFixResult.fixLog + '\n⚠️ 残存問題を強制削除' };
              } else {
                console.log('✅ リトライで全件修正完了');
                fixResult = retryFixResult;
              }
            }
          }
        }
        
        if (fixResult.fixed) {
          cleanedText = fixResult.text;
          fixLog += fixResult.fixLog;
        }
      }
      
      // 修正・削除があった場合、再度後処理を適用
      if (removableIssues.length > 0 || (fixableIssues.length > 0)) {
        var fixedText = applyPostProcessingChain_(cleanedText, postType, rates);
        
        cleanedText = fixedText;
        console.log('✅ ファクトチェック→修正/削除→後処理 完了');
      }
    }
  } else if (disableFactCheck && !skipFactCheck) {
    console.log('ℹ️ factCheck 無効化中（DISABLE_FACTCHECK=true / 診断書 水準1-1）→ Claude品質レビュー+最終事実検証+対話型検証で品質保証');
  }

  // typeConfig は v13.0 パス・v12.10 パスの両方で必要なので先に定義
  var typeConfig = POST_TYPES[postType] || {};

  // ========================================
  // ★v13.0 並行稼働フラグ(generatePost 経路・2026-04-19追加)
  // USE_V13_VALIDATION=true かつ executeValidationV13_ 定義済みなら
  // 品質レビュー+最終事実検証+対話型検証を1関数で実行する(4段→2段統合)
  // false/未設定/例外時は以下の従来 v12.10 ロジックが動く(完全後方互換)
  // ========================================
  // ★v14.0 Phase 6: skipValidation=true なら Stage 1 を完全スキップ(Phase Bで実行する)
  var useV13Gen = PropertiesService.getScriptProperties().getProperty('USE_V13_VALIDATION') === 'true';
  var v13GenSucceeded = false;
  if (skipValidation) {
    console.log('⏭️ v14.0 Phase 6: Stage 1 検証をスキップ(Phase B で実行)');
    v13GenSucceeded = true; // 以下の従来ロジックもスキップするためフラグを立てる
  } else if (useV13Gen && typeof executeValidationV13_ === 'function' && !skipFactCheck) {
    console.log('🚀 USE_V13_VALIDATION=true (generatePost経路) → validationV13.gs へ処理委譲');
    try {
      var v13GenResult = executeValidationV13_(cleanedText, factResult, postType, rates, keys, csForFactCheck, startTime, TIME_LIMIT_SEC);
      if (v13GenResult && v13GenResult.text) {
        cleanedText = v13GenResult.text;
        fixLog = v13GenResult.fixLog || fixLog;
        v13GenSucceeded = true;
      }
    } catch (v13GenErr) {
      console.log('❌ v13.0 例外発生(generatePost経路) → v12.10 従来フローへフォールバック: ' + v13GenErr.message);
    }
  } else if (useV13Gen && typeof executeValidationV13_ !== 'function' && !skipFactCheck) {
    console.log('⚠️ USE_V13_VALIDATION=true だが executeValidationV13_ 未定義 → v12.10従来フローへフォールバック');
  }

  // ★v13.0 が OFF または失敗した場合のみ、以下の v12.10 ロジックが動く
  if (!v13GenSucceeded) {
    // ★v8.6: 品質レビュー（Claude API - クロスチェック）
    // ファクトチェック（Gemini）の後、別モデル（Claude）で投稿品質をレビュー
    // testAll時はスキップ（SKIP_FACT_CHECK=true時）
    if (!skipFactCheck) {
      var qualityResult = qualityReviewPost_(cleanedText, postType, typeConfig, rates, csForFactCheck);

      if (!qualityResult.passed && qualityResult.revisedText) {
        // 品質修正後に後処理チェーンを再適用
        var qText = applyPostProcessingChain_(qualityResult.revisedText, postType, rates);
        cleanedText = qText;

        // fixLogに品質レビュー結果を追記
        fixLog += '【品質レビュー（Claude）】\n';
        for (var qi = 0; qi < qualityResult.issues.length; qi++) {
          fixLog += '  ' + qualityResult.issues[qi].id + ': ' + qualityResult.issues[qi].problem + '\n';
        }
        console.log('✅ 品質レビュー（Claude）→修正→後処理 完了');
      }

      // 今日の投稿キャッシュに保存（次の投稿の重複チェック用）
      cacheTodayPost_(postType, cleanedText);
    }

    // ★v12.6: 最終事実検証（事実だけに集中した専用チェック+修正）
    // 品質レビュー（Q1-Q7同時）は注意が分散し、事実誤りを見逃すことがある。
    // 全処理が終わった最終テキストに対して「事実だけ」を検証し、問題があれば修正する。
    // 設計思想: このチャットでユーザーが「承認OKか？」と聞いた時と同じ仕事を自動化
    if (!skipFactCheck) {
      var elapsedBeforeFinal = (new Date() - startTime) / 1000;
      if (elapsedBeforeFinal < TIME_LIMIT_SEC - 30) { // 残り30秒以上あれば実行
        var finalResult = finalFactVerify_(cleanedText, postType, rates, keys);
        if (finalResult && finalResult !== cleanedText) {
          cleanedText = applyPostProcessingChain_(finalResult, postType, rates);
          fixLog += '【最終事実検証（Claude）】修正あり\n';
          console.log('✅ 最終事実検証 → 修正 → 後処理 完了');
          // キャッシュも更新
          cacheTodayPost_(postType, cleanedText);
        }
      } else {
        console.log('⏱️ 経過' + Math.round(elapsedBeforeFinal) + '秒 → 最終事実検証をスキップ（時間制限）');
      }
    }
  }
  
  // 結果をScriptPropertiesに一時保存（承認メールで使用）
  var props = PropertiesService.getScriptProperties();
  props.setProperty('LAST_FACT_CHECK_' + postType, JSON.stringify({
    summary: factResult.summary,
    details: factResult.details,
    fixLog: fixLog,
    wasFixed: fixLog !== '',
    originalText: fixLog !== '' ? originalBeforeFix.split(/\n\n#/)[0] : '',
    timestamp: new Date().toISOString()
  }));
  
  // ★v5.5.2: 学びログ蓄積はmain.gsのextractPostInsights_に統合（重複呼び出し解消）
  
  // ★v12.2: ファクトチェックが実際に実行されたかフラグ化
  var factCheckSkipped = factResult.summary.indexOf('失敗') !== -1 
                      || factResult.summary.indexOf('エラー') !== -1;
  
  return {
    text: cleanedText,
    postType: postType,
    label: typeConfig.label,
    emoji: typeConfig.emoji,
    factCheckSkipped: factCheckSkipped  // ★v12.2: ファクトチェック失敗フラグ
  };
}


