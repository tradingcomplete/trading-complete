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
 */

// ===== メイン: 投稿テキスト生成 =====
function generatePost(postType, context, cachedRates) {
  var keys = getApiKeys();
  var typeConfig = POST_TYPES[postType];
  
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
  
  // Step3: 投稿テキスト生成
  var result = callGemini_(prompt, keys.GEMINI_API_KEY, true);
  
  if (!result) {
    console.log('❌ Gemini API呼び出し失敗');
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
          
          var retryPrompt = '以下の投稿を少し調整してください。\n\n';
          retryPrompt += '今日一番動いている「' + hotSymbol + '（' + hotJpName + '）」にも触れてほしいです。\n';
          retryPrompt += '文章の自然さ・口調・フォーマットはそのまま維持してください。\n';
          retryPrompt += '無理に全体を書き換えず、自然に「' + hotJpName + '」を組み込む程度でOK。\n\n';
          retryPrompt += '【元の投稿】\n' + cleanedText;
          
          var retryResult = callGemini_(retryPrompt, keys.GEMINI_API_KEY, true);
          if (retryResult && retryResult.text) {
            var retryText = applyPostProcessingChain_(retryResult.text, postType, rates);
          // ★v7.6: TC言及除去をリトライにも適用
          if (tcAllowedInPost.indexOf(postType) === -1) {
            retryText = removeTCMention_(retryText);
          }
            
            // リトライ版に主役が含まれているか最終確認
            var retryBody = retryText.split(/\n\n#/)[0];
            if (retryBody.indexOf(hotSymbol) !== -1 || retryBody.indexOf(hotJpName) !== -1) {
              cleanedText = retryText;
              console.log('✅ リトライ成功: 🔥主役「' + hotJpName + '」を反映');
            } else {
              console.log('⚠️ リトライでも主役未含。元テキストを使用');
            }
          }
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
        
        var riskRetryPrompt = '以下の投稿に重大な誤りがあります。修正してください。\n\n';
        riskRetryPrompt += '【絶対禁止ルール】\n';
        riskRetryPrompt += 'リスクオフ（地政学リスク・株安）= 円高方向（円が買われる）\n';
        riskRetryPrompt += '「リスクオフで円売り」「リスク回避で円売り」は完全に間違い。必ず削除または修正すること。\n\n';
        riskRetryPrompt += '口調・フォーマット・絵文字はそのまま維持。リスクセンチメントの方向性だけ修正。\n\n';
        riskRetryPrompt += '【修正前の投稿】\n' + cleanedText;
        
        var riskRetryResult = callGemini_(riskRetryPrompt, keys.GEMINI_API_KEY, true);
        if (riskRetryResult && riskRetryResult.text) {
          var riskRetryText = applyPostProcessingChain_(riskRetryResult.text, postType, rates);
          // ★v7.6: TC言及除去をリトライにも適用
          if (tcAllowedInPost.indexOf(postType) === -1) {
            riskRetryText = removeTCMention_(riskRetryText);
          }
          
          // リトライ後も誤記が残っていないか確認
          var riskRetryBody = riskRetryText.split(/\n\n#/)[0];
          var stillHasError = (riskRetryBody.indexOf('リスクオフ') !== -1 || riskRetryBody.indexOf('リスク回避') !== -1)
                           && riskRetryBody.indexOf('円売り') !== -1;
          if (!stillHasError) {
            cleanedText = riskRetryText;
            console.log('✅ リスクセンチメント修正成功');
          } else {
            console.log('⚠️ リスクセンチメント修正失敗。元テキストを使用（要手動確認）');
          }
        }
      }
    } catch (riskErr) {
      console.log('⚠️ リスクセンチメントチェックエラー（投稿には影響なし）: ' + riskErr.message);
    }
  }

  // ★v6.0.2: 絵文字最低3個のバリデーション（全投稿タイプ共通）
  // プロンプトで指示しても絵文字0〜2個の投稿が生成されるケースがあるためリトライで補完
  try {
    var bodyForEmojiCheck = cleanedText.split(/\n\n#/)[0]; // ハッシュタグ前の本文
    
    // サロゲートペア対応: indexOf で各絵文字の出現回数をカウント
    var emojiList = ['\u2615', '\uD83D\uDCD5', '\uD83D\uDCDD', '\uD83D\uDCCB', '\uD83D\uDCA1', '\u26A0\uFE0F', '\u2705'];
    // ☕=\u2615, 📕=\uD83D\uDCD5, 📝=\uD83D\uDCDD, 📋=\uD83D\uDCCB, 💡=\uD83D\uDCA1, ⚠️=\u26A0\uFE0F, ✅=\u2705
    var currentEmojiCount = 0;
    for (var ei = 0; ei < emojiList.length; ei++) {
      var searchIdx = 0;
      while ((searchIdx = bodyForEmojiCheck.indexOf(emojiList[ei], searchIdx)) !== -1) {
        currentEmojiCount++;
        searchIdx += emojiList[ei].length;
      }
    }
    
    if (currentEmojiCount < 3) {
      console.log('⚠️ 絵文字が' + currentEmojiCount + '個（最低3個必要）。リトライ...');
      
      var emojiRetryPrompt = '以下の投稿を、ノート形式に調整してください。\n\n';
      emojiRetryPrompt += '【ルール】\n';
      emojiRetryPrompt += '・絵文字（☕📕📝📋💡⚠️✅）を使って3〜4ブロックに区切ること。\n';
      emojiRetryPrompt += '・各ブロック: 絵文字+事実（1行）→分析（→1つだけ）の構造。\n';
      emojiRetryPrompt += '・内容・口調・文字数はそのまま維持。構造だけ変える。\n';
      emojiRetryPrompt += '・最後は絵文字なし・→なしの感想で締める。\n\n';
      emojiRetryPrompt += '【元の投稿】\n' + cleanedText;
      
      var emojiRetryResult = callGemini_(emojiRetryPrompt, keys.GEMINI_API_KEY, false);
      if (emojiRetryResult && emojiRetryResult.text) {
        var emojiRetryText = applyPostProcessingChain_(emojiRetryResult.text, postType, rates);
        
        // リトライ版の絵文字数を確認（同じ方法でカウント）
        var retryBodyEmoji = emojiRetryText.split(/\n\n#/)[0];
        var retryEmojiCount = 0;
        for (var rei = 0; rei < emojiList.length; rei++) {
          var rSearchIdx = 0;
          while ((rSearchIdx = retryBodyEmoji.indexOf(emojiList[rei], rSearchIdx)) !== -1) {
            retryEmojiCount++;
            rSearchIdx += emojiList[rei].length;
          }
        }
        
        if (retryEmojiCount >= 3) {
          cleanedText = emojiRetryText;
          console.log('✅ 絵文字リトライ成功: ' + currentEmojiCount + '個→' + retryEmojiCount + '個');
        } else {
          console.log('⚠️ 絵文字リトライでも' + retryEmojiCount + '個。元テキストを使用');
        }
      }
    }
  } catch (emojiErr) {
    console.log('⚠️ 絵文字チェックエラー（投稿には影響なし）: ' + emojiErr.message);
  }
  
  // ★v5.9: →が1ブロックに2本以上あるブロックを検出してリトライ
  // 「1ブロックに→は1つだけ」ルールの後処理による担保
  try {
    var bodyForArrowCheck = cleanedText.split(/\n\n#/)[0]; // ハッシュタグ前の本文
    var hasMultiArrowBlock = false;
    
    // 空行で分割してブロックを取得し、→の数をカウント
    var blocks = bodyForArrowCheck.split(/\n\n+/);
    for (var bi = 0; bi < blocks.length; bi++) {
      var arrowCount = (blocks[bi].match(/^→/gm) || []).length;
      if (arrowCount >= 2) {
        hasMultiArrowBlock = true;
        break;
      }
    }
    
    if (hasMultiArrowBlock) {
      console.log('⚠️ →が2本以上のブロックを検出。リトライ...');
      
      var arrowRetryPrompt = '以下の投稿を修正してください。\n\n';
      arrowRetryPrompt += '【絶対ルール】\n';
      arrowRetryPrompt += '・絵文字ブロック1つに →（矢印で始まる行）は必ず1行だけ。\n';
      arrowRetryPrompt += '・2本目以降の→は、→を外して普通の補足文として書き直せ。\n';
      arrowRetryPrompt += '・例(NG): 「→上振れ \\n→インフレ懸念 \\n→ドル買い」\n';
      arrowRetryPrompt += '・例(OK): 「→上振れはインフレ懸念につながり、ドル買いが加速する」\n';
      arrowRetryPrompt += '・内容・口調・絵文字・文字数はそのまま維持。→の本数だけ直す。\n\n';
      arrowRetryPrompt += '【元の投稿】\n' + cleanedText;
      
      var arrowRetryResult = callGemini_(arrowRetryPrompt, keys.GEMINI_API_KEY, false);
      if (arrowRetryResult && arrowRetryResult.text) {
        var arrowRetryText = applyPostProcessingChain_(arrowRetryResult.text, postType, rates);
        
        // リトライ後も違反が残っていないか確認
        var retryBodyArrow = arrowRetryText.split(/\n\n#/)[0];
        var retryBlocks = retryBodyArrow.split(/\n\n+/);
        var stillHasMultiArrow = false;
        for (var rbi = 0; rbi < retryBlocks.length; rbi++) {
          if ((retryBlocks[rbi].match(/^→/gm) || []).length >= 2) {
            stillHasMultiArrow = true;
            break;
          }
        }
        
        if (!stillHasMultiArrow) {
          cleanedText = arrowRetryText;
          console.log('✅ →複数ブロック修正成功');
        } else {
          console.log('⚠️ →複数ブロック修正失敗。元テキストを使用');
        }
      }
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
    factResult = factCheckPost_(cleanedText, postType, keys.GEMINI_API_KEY, rates);
    
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
        var fixResult = autoFixPost_(cleanedText, fixableIssues, postType, keys.GEMINI_API_KEY, rates);
        
        // ★v8.0: 自動修正後に問題の表現がまだ残っていないか検証+リトライ
        if (fixResult.fixed) {
          var remainingIssues = verifyAutoFix_(fixResult.text, fixableIssues);
          if (remainingIssues.length > 0) {
            console.log('⚠️ 自動修正後も' + remainingIssues.length + '件の問題が残存 → リトライ');
            for (var ri = 0; ri < remainingIssues.length; ri++) {
              console.log('  残存: ' + remainingIssues[ri].claim);
            }
            var retryResult = autoFixPost_(fixResult.text, remainingIssues, postType, keys.GEMINI_API_KEY, rates);
            if (retryResult.fixed) {
              var stillRemaining = verifyAutoFix_(retryResult.text, remainingIssues);
              if (stillRemaining.length > 0) {
                console.log('⚠️ リトライ後も' + stillRemaining.length + '件残存（強制削除で対応）');
                var forcedText = forceRemoveIssueLines_(retryResult.text, stillRemaining);
                fixResult = { text: forcedText, fixed: true, fixLog: retryResult.fixLog + '\n⚠️ 残存問題を強制削除' };
              } else {
                console.log('✅ リトライで全件修正完了');
                fixResult = retryResult;
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
    var qualityResult = qualityReviewPost_(cleanedText, postType, typeConfig);
    
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
  
  return {
    text: cleanedText,
    postType: postType,
    label: typeConfig.label,
    emoji: typeConfig.emoji
  };
}
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
  
  for (var attempt = 1; attempt <= 3; attempt++) {
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
      
      console.log('⚠️ Gemini API失敗 (' + code + ') 試行' + attempt + '/3');
      console.log('レスポンス: ' + JSON.stringify(body).substring(0, 500));
      
      if (code === 429) {
        Utilities.sleep(10000 * attempt);
      } else {
        Utilities.sleep(2000);
      }
    } catch (e) {
      console.log('⚠️ Gemini APIエラー: ' + e.message + ' 試行' + attempt + '/3');
      Utilities.sleep(2000);
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
