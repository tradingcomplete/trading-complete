/**
 * CompanaFXAutoPost - geminiApi.gs
 * Gemini API でテキスト生成 + Google検索Grounding
 * 
 * ★ Phase 3: プロンプト公開対応
 *   - 投稿プロンプトをSheetsから取得（公開可能）
 *   - TC概要をSheetsから取得（公開可能）
 *   - フォーマットルールはコード内（非公開）
 * ★ Phase 3.5: キャラクターシート参照
 * ★ Phase 2.5: フォーマット最適化ルール
 * ★ v3.1: フォーマットルール強化（前置き・タイプ名エコー・禁止絵文字対策）
 * ★ v3.2: レート取得精度向上（年の明示・手順指示・サイト指定）
 * ★ v3.3: 2段階方式（レート事前取得→プロンプト埋め込み→スプレッドシート保存）
 * ★ v3.4: レートキャッシュ再利用、EUR/USD混同防止、文字数180-230、日足週足注目価格
 * ★ v3.5: 価格分析機能（レートキャッシュから今週/先週/30日の高値安値を自動算出→プロンプト注入）
 * ★ v3.6: レートサマリーシート（確定済み高値安値を保存。毎回計算→読み取りのみに軽量化）
 * ★ v3.7: レートサマリー自動更新拡張（過去3ヶ月・過去半年・今年を自動計算 + 歴史データ行11以降に固定）
 * ★ v5.5 Phase 7: 市場ニュース自動取得レイヤー（fetchMarketNews_）
 *   - Gemini+Grounding でTOP5ニュースを事前取得（1時間キャッシュ）
 *   - 要人発言・金利・株価・地政学・関税等の具体的ネタを投稿に注入
 *   - 「リサーチ」と「ライティング」の分離で一般論脱却
 * ★ v5.5.1: ハッシュタグ動的生成 + 本日始値比
 * ★ v5.5.2: 仮説・学び自動抽出 + 仮説検証機能
 * ★ v5.5.3: 投稿品質改善（二重表記除去、FOMC誤検出修正、答え合わせ多様化、話題繰り返し防止、口調統一、ニュース数値正確性、論理一貫性）
 *   - ハッシュタグを投稿内容から自動選定（TC言及→#個人開発、指標→#CPI等）
 *   - 本日始値比を追加し「今日の方向」を正確に伝達（昨日の残り香問題を解消）
 * ★ v5.6: 月曜MORNING強化（週末世界情勢の検索強化 + 月曜専用プロンプト）
 * ★ v5.9.1: レート注入修正（キャッシュフォールバック + 直近レート明示注入 + 警告文修正）
 *   - API失敗時にレートキャッシュの最新値をフォールバック取得（rates=null回避）
 *   - buildPrompt_に直近レート（小数3桁）を常に注入（サマリーとの混同防止）
 *   - 「数値使うな」警告をキャッシュ有無で分岐（矛盾指示の解消）
 * ★ v8.8.1: リトライパターン共通化（executeRetry_で4つのリトライを統合）
 * ★ v12.5: Claude API呼び出し統合（callClaudeApi_共通関数新設）+ executeRetry_ Claude化
 */

// ===== メイン: 投稿テキスト生成 =====
function generatePost(postType, context, cachedRates) {
  var keys = getApiKeys();
  var typeConfig = POST_TYPES[postType];
  
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
  var prompt = buildPrompt_(postType, typeConfig, context, rates);
  
  // ★v12.1→v12.4: Claude市場分析（書く前にデータを正しく読む）
  // 設計（v12.4〜）: 全3ステージがClaude
  //   Stage 1: Claude がデータを読み、何が起きているか分析（←これ）
  //   Stage 2: Claude が分析に基づいて投稿を書く（★v12.4でGeminiから変更）
  //   Stage 3: Claude が品質レビュー（Q1〜Q7）
  var elapsed = (new Date() - startTime) / 1000;
  if (elapsed < 180) { // 3分以内ならClaude分析を実行（6分制限の安全策）
    var marketAnalysis = analyzeMarketWithClaude_(rates, postType, keys);
    if (marketAnalysis) {
      var injectionMarker = '【★重要: 以下の構造指示が最終版';
      if (prompt.indexOf(injectionMarker) !== -1) {
        prompt = prompt.replace(
          injectionMarker,
          '【★★★ Claude市場分析（この分析が最も正確。この分析と矛盾する記述を絶対に書くな）】\n' +
          marketAnalysis + '\n' +
          '※上記はリアルタイムデータに基づくClaude Sonnetの分析です。\n' +
          '※通貨の方向（上昇/下落）、強弱関係、背景の記述は全てこの分析に従うこと。\n' +
          '※この分析と矛盾する一般論（例:「リスク回避=円買い」）をデータが否定している場合、データが正しい。\n\n' +
          injectionMarker
        );
      }
      console.log('📏 Claude分析注入後のプロンプト: ' + prompt.length + '文字');
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
  var result = callClaudeGenerate_(prompt, keys);
  
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
  var marketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY'];
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
  var riskSentimentTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR'];
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
  var skipFactCheck = PropertiesService.getScriptProperties().getProperty('SKIP_FACT_CHECK') === 'true';
  var factResult = { passed: true, summary: 'スキップ', details: '', issues: [] };
  var fixLog = '';
  var originalBeforeFix = cleanedText;
  
  if (!skipFactCheck) {
    // ★v12.3.1: 方向チェック用の通貨強弱データを取得してファクトチェックに渡す
    var csForFactCheck = null;
    try {
      var hotForFact = detectHotPair_(rates, keys.SPREADSHEET_ID);
      if (hotForFact && hotForFact.csRanking) {
        csForFactCheck = hotForFact.csRanking;
      }
    } catch (csErr) {
      console.log('⚠️ 方向チェック用通貨強弱取得失敗（続行）: ' + csErr.message);
    }
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
  }
  
  // ★v8.6: 品質レビュー（Claude API - クロスチェック）
  // ファクトチェック（Gemini）の後、別モデル（Claude）で投稿品質をレビュー
  // testAll時はスキップ（SKIP_FACT_CHECK=true時）
  if (!skipFactCheck) {
    var typeConfig = POST_TYPES[postType] || {};
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


// ===== リトライ共通処理 =====
/**
 * ★v8.8.1: 4つのリトライパターン（主役ペア/リスクセンチメント/絵文字/→ブロック）を共通化
 * ★v12.5: Gemini→Claude化。メイン生成と同じモデルでリトライし、口調・フォーマットの一貫性を確保
 * 
 * 処理フロー: 経過時間チェック → Claude API呼び出し → 後処理チェーン → TC言及除去 → 検証
 * 
 * @param {Object} config - リトライ固有の設定
 * @param {string} config.name - リトライ名（ログ表示用）
 * @param {string} config.prompt - Claudeに渡すリトライプロンプト
 * @param {boolean} config.useGrounding - （★v12.5で無効。後方互換のため残存）
 * @param {boolean} config.applyTCRemoval - TC言及除去を適用するか
 * @param {Function} config.verifyFn - 検証関数（retryText => boolean: trueで修正成功）
 * @param {Object} base - generatePostから引き継ぐ共通パラメータ
 * @param {string} base.postType - 投稿タイプ
 * @param {Object} base.rates - レートデータ
 * @param {Date} base.startTime - generatePost開始時刻
 * @param {number} base.timeLimitSec - 時間制限（秒）
 * @param {Array} base.tcAllowedInPost - TC言及許可タイプリスト
 * @return {string|null} 成功時は修正テキスト、失敗・スキップ時はnull
 */
function executeRetry_(config, base) {
  // 経過時間チェック（★v8.8 タイムガード）
  var elapsed = (new Date() - base.startTime) / 1000;
  if (elapsed > base.timeLimitSec) {
    console.log('⏱️ 経過' + Math.round(elapsed) + '秒 → ' + config.name + 'リトライをスキップ（時間制限）');
    return null;
  }
  
  // ★v12.5: Claude API呼び出し（Geminiから変更。メイン生成と同じモデルで一貫性確保）
  var retryResult = callClaudeGenerate_(config.prompt, getApiKeys());
  if (!retryResult || !retryResult.text) return null;
  
  // 後処理チェーン適用
  var retryText = applyPostProcessingChain_(retryResult.text, base.postType, base.rates);
  
  // TC言及除去（主役ペア・リスクセンチメントのリトライで必要）
  if (config.applyTCRemoval && base.tcAllowedInPost.indexOf(base.postType) === -1) {
    retryText = removeTCMention_(retryText);
  }
  
  // 検証（呼び出し元が定義した判定ロジック）
  if (config.verifyFn(retryText)) {
    console.log('✅ ' + config.name + '修正成功');
    return retryText;
  } else {
    console.log('⚠️ ' + config.name + '修正失敗。元テキストを使用');
    return null;
  }
}


// ===== 絵文字カウント =====
/**
 * ★v8.8.1: 絵文字バリデーション用カウント関数を分離
 * サロゲートペア対応: indexOf で各絵文字の出現回数をカウント
 * 
 * @param {string} text - カウント対象テキスト
 * @param {Array} emojiList - 絵文字のユニコード配列
 * @return {number} 絵文字の出現回数
 */
function countEmojis_(text, emojiList) {
  var count = 0;
  for (var i = 0; i < emojiList.length; i++) {
    var searchIdx = 0;
    while ((searchIdx = text.indexOf(emojiList[i], searchIdx)) !== -1) {
      count++;
      searchIdx += emojiList[i].length;
    }
  }
  return count;
}


// ===== →複数ブロック検出 =====
/**
 * ★v8.8.1: →ブロックバリデーション用検出関数を分離
 * 空行で分割してブロックを取得し、→の数をカウント
 * 
 * @param {string} text - 検出対象テキスト（ハッシュタグ前の本文）
 * @return {boolean} →が2本以上のブロックが存在するか
 */
function checkMultiArrowBlocks_(text) {
  var blocks = text.split(/\n\n+/);
  for (var i = 0; i < blocks.length; i++) {
    if ((blocks[i].match(/^→/gm) || []).length >= 2) {
      return true;
    }
  }
  return false;
}


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
    } catch (dowErr) { /* SH/SL未バックフィルの場合はスキップ */ }
    
    // 商品価格（BTC/GOLDのみ。WTI/天然ガスはAlpha Vantageデータが古いため停止）
    try {
      var btcCom = fetchCommodityPrices_();
      dataSummary += '\n【商品価格】\n';
      if (btcCom && btcCom.btc) dataSummary += 'BTC: ' + btcCom.btc.toFixed(0) + 'ドル\n';
      if (btcCom && btcCom.gold) dataSummary += 'ゴールド: ' + btcCom.gold.toFixed(2) + 'ドル\n';
    } catch (e) { /* 取得失敗は無視 */ }
    
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
    } catch (e) { /* 始値取得失敗は無視 */ }
    
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
    } catch (e) { /* 通貨強弱取得失敗は無視 */ }
    
    // 経済カレンダー
    try {
      var cal = getEconomicCalendar_('today');
      if (cal) {
        factData += '\n【経済カレンダー（結果欄が空=未発表）】\n' + cal + '\n';
      }
    } catch (e) { /* カレンダー取得失敗は無視 */ }
    
    // 政策金利（★v12.6: RBA 4.10%等の事実誤認防止）
    try {
      var policyRates = getPolicyRatesText_();
      if (policyRates) {
        factData += '\n【政策金利（確定データシートの値が正しい。お前の内部知識より優先）】\n' + policyRates;
      }
    } catch (e) { /* 取得失敗は無視 */ }
    
    // 要人
    try {
      var leaders = getWorldLeadersText_();
      if (leaders) {
        factData += '\n【要人（確定データシートの値が正しい）】\n' + leaders;
      }
    } catch (e) { /* 取得失敗は無視 */ }
    
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
    prompt += '5. レート水準とペア名が一致しているか\n\n';
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
      // フォールバック: 文章中からJSON部分を抽出
      try {
        var jsonMatch = result.text.match(/\{[\s\S]*"hasErrors"[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
          console.log('✅ 最終事実検証: フォールバックJSON抽出成功');
        }
      } catch (e2) { /* フォールバックも失敗 */ }
    }
    
    if (!parsed) {
      console.log('⚠️ 最終事実検証: JSON解析失敗 → スキップ');
      console.log('  応答冒頭: ' + result.text.substring(0, 150));
      return null;
    }
    
    // 問題なし
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
  
  var requestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      { role: 'user', content: prompt }
    ]
  };
  
  // Web検索ツール（品質レビューQ6用）
  if (opts.useWebSearch) {
    requestBody.tools = [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 3 }
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
            console.log('✅ ' + logPrefix + '成功（試行' + attempt + (opts.useWebSearch ? '・Web検索有効' : '') + '）');
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
 * @return {Object|null} { text: string, raw: Object } callGemini_と同じ形式
 */
function callClaudeGenerate_(prompt, keys) {
  var apiKey = keys.CLAUDE_API_KEY || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) {
    console.log('❌ CLAUDE_API_KEYが未設定です');
    return null;
  }
  return callClaudeApi_(prompt, apiKey, { logPrefix: 'Claude投稿生成' });
}


// ===== Gemini API呼び出し =====
function callGemini_(prompt, apiKey, useGrounding) {
  var url = GEMINI_API_URL + GEMINI_MODEL + ':generateContent?key=' + apiKey;
  
  var requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 8192  // ★v7.10: 1024→8192（2.5以降はthinkingトークンが含まれるため余裕を持たせる）
    }
  };
  
  // ★v7.10: gemini-2.5以降のthinkingトークン制御
  // thinkingがmaxOutputTokensを食い尽くして出力が切れるのを防止
  if (GEMINI_MODEL.indexOf('2.5') !== -1 || GEMINI_MODEL.indexOf('3') !== -1) {
    requestBody.generationConfig.thinkingConfig = { thinkingBudget: 1024 };
  }
  
  if (useGrounding) {
    requestBody.tools = [{ google_search: {} }];
  }
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
  
  var MAX_RETRIES = 2;  // ★v12.2: 3→2（503多発時のタイムアウト防止。早めにClaudeフォールバック）
  for (var attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, options);
      var code = response.getResponseCode();
      var body = JSON.parse(response.getContentText());
      
      if (code === 200) {
        var text = extractTextFromResponse_(body);
        if (text) {
          console.log('✅ Gemini API成功（試行' + attempt + '）');
          return { text: text, raw: body };
        }
      }
      
      console.log('⚠️ Gemini API失敗 (' + code + ') 試行' + attempt + '/' + MAX_RETRIES);
      console.log('レスポンス: ' + JSON.stringify(body).substring(0, 500));
      
      if (code === 429 || code === 503) {
        // ★v12.2: 503（高需要）も段階的リトライ（10秒→20秒→30秒）
        Utilities.sleep(10000 * attempt);
      } else {
        Utilities.sleep(2000);
      }
    } catch (e) {
      console.log('⚠️ Gemini APIエラー: ' + e.message + ' 試行' + attempt + '/' + MAX_RETRIES);
      Utilities.sleep(2000);
    }
  }
  
  // ★v12.2→v12.5: Pro失敗時にClaude APIで自動フォールバック（callClaudeApi_共通関数経由）
  var claudeApiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (claudeApiKey) {
    console.log('🔄 Gemini Pro全滅 → Claude にフォールバック');
    var claudeResult = callClaudeApi_(prompt, claudeApiKey, { maxRetries: 1, logPrefix: 'Claudeフォールバック' });
    if (claudeResult) {
      PropertiesService.getScriptProperties().setProperty('FLASH_FALLBACK_USED', 'claude');
      return claudeResult;
    }
  }
  
  return null;
}

// ===== レスポンスからテキスト抽出 =====
function extractTextFromResponse_(body) {
  try {
    if (body.candidates && body.candidates.length > 0) {
      var parts = body.candidates[0].content.parts;
      var textParts = [];
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].text) {
          textParts.push(parts[i].text);
        }
      }
      return textParts.join('');
    }
  } catch (e) {
    console.log('テキスト抽出エラー: ' + e.message);
  }
  return null;
}
