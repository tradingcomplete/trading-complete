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
  
  // 外国語混入チェック＆除去
  var cleanedText = removeForeignText_(result.text);
  if (cleanedText !== result.text) {
    console.log('⚠️ 外国語を検出・除去しました');
  }
  
  // AI前置き除去（「はい、承知しました。」等）
  cleanedText = stripAIPreamble_(cleanedText);
  
  // 改行ルール強制（「。」「？」の後に改行がなければ自動挿入）★v5.8: 空行制御追加
  cleanedText = enforceLineBreaks_(cleanedText);
  
  // 禁止絵文字を除去（許可: 📕📝📋☕💡⚠️✅ のみ）★v5.8: 個数制限3個追加
  cleanedText = removeDisallowedEmoji_(cleanedText);
  
  // Markdown記法を除去（**太字**、##見出し、---区切り等）
  cleanedText = removeMarkdown_(cleanedText);
  
  // 禁止表現の置換（プロンプトで制御しきれない表現を後処理で修正）
  cleanedText = replaceProhibitedPhrases_(cleanedText);
  
  // 月曜日の「昨日」「昨夜」を機械的に修正 ★v5.6追加
  // 月曜日に「昨日」=日曜（市場休場）は100%事実誤り。後処理で確実に修正する。
  var todayDow = new Date().getDay();
  if (todayDow === 1) {
    cleanedText = fixMondayYesterday_(cleanedText);
  }
  
  // ハッシュタグ行以降を切り落とす（Geminiが2投稿分出力するケース対策）
  cleanedText = truncateAfterHashtag_(cleanedText);
  
  // ★v5.9.3: 小数点消失を修正（133361→1.33361等。レートデータと照合して機械的に修正）
  if (rates) {
    cleanedText = fixMissingDecimalPoint_(cleanedText, rates);
  }
  
  // ハッシュタグ動的生成（テキスト内容から最適なタグを自動選定）★v5.5.1
  cleanedText = generateDynamicHashtags_(cleanedText, postType);
  
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
  var marketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR'];
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
            var retryText = stripAIPreamble_(retryResult.text);
            retryText = removeForeignText_(retryText);
            retryText = enforceLineBreaks_(retryText);
            retryText = removeDisallowedEmoji_(retryText);
            retryText = removeMarkdown_(retryText);
            retryText = replaceProhibitedPhrases_(retryText);
            retryText = truncateAfterHashtag_(retryText);
            retryText = generateDynamicHashtags_(retryText, postType);
            if (rates) {
              retryText = fixMissingDecimalPoint_(retryText, rates);
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
          var riskRetryText = stripAIPreamble_(riskRetryResult.text);
          riskRetryText = removeForeignText_(riskRetryText);
          riskRetryText = enforceLineBreaks_(riskRetryText);
          riskRetryText = removeDisallowedEmoji_(riskRetryText);
          riskRetryText = removeMarkdown_(riskRetryText);
          riskRetryText = replaceProhibitedPhrases_(riskRetryText);
          riskRetryText = truncateAfterHashtag_(riskRetryText);
          riskRetryText = generateDynamicHashtags_(riskRetryText, postType);
          if (rates) {
            riskRetryText = fixMissingDecimalPoint_(riskRetryText, rates);
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
        var emojiRetryText = stripAIPreamble_(emojiRetryResult.text);
        emojiRetryText = removeForeignText_(emojiRetryText);
        emojiRetryText = enforceLineBreaks_(emojiRetryText);
        emojiRetryText = removeDisallowedEmoji_(emojiRetryText);
        emojiRetryText = removeMarkdown_(emojiRetryText);
        emojiRetryText = replaceProhibitedPhrases_(emojiRetryText);
        emojiRetryText = truncateAfterHashtag_(emojiRetryText);
        emojiRetryText = generateDynamicHashtags_(emojiRetryText, postType);
        if (rates) {
          emojiRetryText = fixMissingDecimalPoint_(emojiRetryText, rates);
        }
        
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
        var arrowRetryText = stripAIPreamble_(arrowRetryResult.text);
        arrowRetryText = removeForeignText_(arrowRetryText);
        arrowRetryText = enforceLineBreaks_(arrowRetryText);
        arrowRetryText = removeDisallowedEmoji_(arrowRetryText);
        arrowRetryText = removeMarkdown_(arrowRetryText);
        arrowRetryText = replaceProhibitedPhrases_(arrowRetryText);
        arrowRetryText = truncateAfterHashtag_(arrowRetryText);
        arrowRetryText = generateDynamicHashtags_(arrowRetryText, postType);
        if (rates) {
          arrowRetryText = fixMissingDecimalPoint_(arrowRetryText, rates);
        }
        
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
    factResult = factCheckPost_(cleanedText, postType, keys.GEMINI_API_KEY);
    
    if (!factResult.passed && factResult.issues.length > 0) {
      // 誤り/要確認があれば自動修正
      var fixResult = autoFixPost_(cleanedText, factResult.issues, postType, keys.GEMINI_API_KEY);
      
      if (fixResult.fixed) {
        // 修正後テキストに再度後処理を適用
        var fixedText = fixResult.text;
        fixedText = stripAIPreamble_(fixedText);
        fixedText = removeForeignText_(fixedText);
        fixedText = enforceLineBreaks_(fixedText);
        fixedText = removeDisallowedEmoji_(fixedText);
        fixedText = removeMarkdown_(fixedText);
        fixedText = replaceProhibitedPhrases_(fixedText);
        fixedText = truncateAfterHashtag_(fixedText);
        fixedText = generateDynamicHashtags_(fixedText, postType);
        if (rates) {
          fixedText = fixMissingDecimalPoint_(fixedText, rates);
        }
        
        cleanedText = fixedText;
        fixLog = fixResult.fixLog;
        console.log('✅ ファクトチェック→自動修正→後処理 完了');
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
  
  return {
    text: cleanedText,
    postType: postType,
    label: typeConfig.label,
    emoji: typeConfig.emoji
  };
}

// ========================================
// レート取得（2段階方式 - Step1）
// ========================================

// Twelve Data API でリアルタイムレート取得
// - 無料プラン: 800回/日、8回/分
// - 全通貨ペアを1回のAPI呼び出しで取得（シンボル数分のクレジット消費）
function fetchLatestRates_(apiKey) {
  var keys = getApiKeys();
  var tdApiKey = keys.TWELVE_DATA_API_KEY;
  
  if (!tdApiKey) {
    console.log('❌ TWELVE_DATA_API_KEYが未設定です');
    return null;
  }
  
  var symbols = CURRENCY_PAIRS.map(function(p) { return p.symbol; }).join(',');
  var url = 'https://api.twelvedata.com/price?symbol=' + encodeURIComponent(symbols) + '&apikey=' + tdApiKey;
  
  try {
    console.log('📡 Twelve Data API呼び出し（' + CURRENCY_PAIRS.length + 'ペア）...');
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });
    
    var code = response.getResponseCode();
    if (code !== 200) {
      console.log('❌ HTTP ' + code + ': ' + response.getContentText().substring(0, 200));
      return null;
    }
    
    var data = JSON.parse(response.getContentText());
    
    if (data.code) {
      console.log('❌ APIエラー: ' + (data.message || data.code));
      return null;
    }
    
    var rates = { source: 'TwelveData', fetchedAt: new Date() };
    var logParts = [];
    
    for (var i = 0; i < CURRENCY_PAIRS.length; i++) {
      var pair = CURRENCY_PAIRS[i];
      var priceData = data[pair.symbol];
      
      if (!priceData || !priceData.price) {
        console.log('❌ ' + pair.symbol + ' のデータが取得できません');
        return null;
      }
      
      var val = parseFloat(priceData.price);
      
      if (!val || val < pair.min || val > pair.max) {
        console.log('❌ ' + pair.symbol + ' が異常値: ' + val);
        return null;
      }
      
      rates[pair.key] = val;
      logParts.push(pair.symbol + '=' + val);
    }
    
    console.log('📊 ' + logParts.join(' '));
    return rates;
  } catch (e) {
    console.log('❌ レートAPI呼び出しエラー: ' + e.message);
    return null;
  }
}

// ========================================
// 商品価格取得（★v6.5追加: WTI・BTC・天然ガス）
// ========================================

/**
 * Twelve Data APIで商品価格を取得（WTI・BTC・天然ガス）
 * @return {Object|null} {wti, btc, natgas, fetchedAt} または null
 */
/**
 * Twelve Data APIでBTC・ゴールドを取得（★v6.5更新: BTC+GOLD対応）
 * WTI・天然ガスは fetchDailyCommodityPrices_() で別途取得
 * @return {Object|null} {btc, gold} または null
 */
function fetchCommodityPrices_() {
  try {
    var cache = CacheService.getScriptCache();
    var keys = getApiKeys();
    var tdApiKey = keys.TWELVE_DATA_API_KEY;
    if (!tdApiKey) {
      console.log('❌ TWELVE_DATA_API_KEY未設定（BTC/GOLD取得スキップ）');
      return null;
    }

    // 30分キャッシュ確認
    var cachedBtc  = cache.get('btc_price');
    var cachedGold = cache.get('gold_price');
    if (cachedBtc && cachedGold) {
      var btcVal  = parseFloat(cachedBtc);
      var goldVal = parseFloat(cachedGold);
      console.log('📦 BTC（キャッシュ）: ' + btcVal + '  ゴールド（キャッシュ）: ' + goldVal);
      return { btc: btcVal, gold: goldVal };
    }

    // BTC・XAUを一括取得（2クレジット）
    var url = 'https://api.twelvedata.com/price?symbol=BTC%2FUSD%2CXAU%2FUSD&apikey=' + tdApiKey;
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });

    if (response.getResponseCode() !== 200) {
      console.log('❌ BTC/GOLD API HTTP ' + response.getResponseCode());
      return null;
    }

    var data = JSON.parse(response.getContentText());
    if (data.code) {
      console.log('❌ BTC/GOLD APIエラー: ' + (data.message || data.code));
      return null;
    }

    var result = {};

    // BTC
    var btcData = data['BTC/USD'];
    if (btcData && btcData.price) {
      var btcVal = parseFloat(btcData.price);
      if (btcVal > 10000 && btcVal < 200000) {
        result.btc = btcVal;
        cache.put('btc_price', btcVal.toString(), 30 * 60);
        console.log('📊 BTC: ' + btcVal);
      } else {
        console.log('⚠️ BTC異常値: ' + btcVal);
      }
    }

    // ゴールド
    var goldData = data['XAU/USD'];
    if (goldData && goldData.price) {
      var goldVal = parseFloat(goldData.price);
      if (goldVal > 1500 && goldVal < 8000) {
        result.gold = goldVal;
        cache.put('gold_price', goldVal.toString(), 30 * 60);
        console.log('📊 ゴールド: ' + goldVal);
      } else {
        console.log('⚠️ ゴールド異常値: ' + goldVal);
      }
    }

    return Object.keys(result).length > 0 ? result : null;

  } catch (e) {
    console.log('⚠️ BTC/GOLD取得エラー（続行）: ' + e.message);
    return null;
  }
}

/**
 * Alpha Vantage APIでWTI・天然ガスを日次取得（★v6.5追加）
 * 23時間キャッシュで1日1回のみAPIを叩く（無料枠: 25リクエスト/日）
 * @return {Object|null} {wti, natgas} または null
 */
function fetchDailyCommodityPrices_() {
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
    var cache = CacheService.getScriptCache();
    var cacheKey = 'daily_commodities_' + today;

    // キャッシュ確認（当日中は再取得しない）
    var cached = cache.get(cacheKey);
    if (cached) {
      var parsed = JSON.parse(cached);
      console.log('📦 商品（キャッシュ）: WTI=' + parsed.wti + ' 天然ガス=' + parsed.natgas);
      return parsed;
    }

    var keys = getApiKeys();
    var avApiKey = keys.ALPHA_VANTAGE_API_KEY;
    if (!avApiKey) {
      console.log('❌ ALPHA_VANTAGE_API_KEY未設定（WTI・天然ガス取得スキップ）');
      return null;
    }

    var result = { wti: null, natgas: null };

    for (var i = 0; i < DAILY_COMMODITY_ASSETS.length; i++) {
      var t = DAILY_COMMODITY_ASSETS[i];
      // ゴールドなどavOverrideが指定されている場合は専用URL、それ以外はstandardエンドポイント
      var url = t.avOverride
        ? t.avOverride + avApiKey
        : 'https://www.alphavantage.co/query?function=' + t.avFunction + '&interval=daily&apikey=' + avApiKey;
      try {
        var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var data = JSON.parse(response.getContentText());

        var val = null;
        if (t.avOverride) {
          // COMMODITY_EXCHANGE_RATE レスポンス形式
          if (data['Realtime Currency Exchange Rate'] && data['Realtime Currency Exchange Rate']['5. Exchange Rate']) {
            val = parseFloat(data['Realtime Currency Exchange Rate']['5. Exchange Rate']);
          }
        } else if (data.data && data.data.length > 0) {
          val = parseFloat(data.data[0].value);
        }

        if (val !== null && val > t.min && val < t.max) {
          result[t.key] = val;
          console.log('📊 ' + t.label + ': ' + val + ' ドル');
        } else if (data.Information) {
          console.log('⚠️ Alpha Vantage上限: ' + data.Information.substring(0, 80));
        } else if (val !== null) {
          console.log('⚠️ ' + t.label + ' 異常値: ' + val + '（期待値: ' + t.min + '〜' + t.max + '）');
        } else {
          console.log('⚠️ ' + t.label + ' データなし');
        }
      } catch (e2) {
        console.log('⚠️ ' + t.label + ' 取得エラー: ' + e2.message);
      }
      Utilities.sleep(13000); // 13秒待機（Alpha Vantage: 5リクエスト/分の制限対策）
    }

    // 23時間キャッシュ（翌日まで保持）
    cache.put(cacheKey, JSON.stringify(result), 23 * 60 * 60);
    return result;

  } catch (e) {
    console.log('⚠️ 日次商品データ取得エラー（続行）: ' + e.message);
    return null;
  }
}

// ========================================
// 商品列セットアップ（★v6.5追加: 既存シートへの1回限り実行）
// ========================================

/**
 * 既存の「レートキャッシュ」シートにWTI・BTC・天然ガスのヘッダー列を追加する
 * ★ GASエディタから手動で1回だけ実行する
 * ★ 既存データは一切変更しない。ヘッダー行の列追加のみ。
 * ★ 実行後は testFetchRates() でデータが入ることを確認すること
 */
function setupCommodityColumns() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('レートキャッシュ');

    if (!sheet) {
      console.log('❌ 「レートキャッシュ」シートが見つかりません');
      console.log('→ 先に testFetchRates() を実行してシートを作成してください');
      return;
    }

    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    // 既にWTI/USDが存在するかチェック
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] === 'WTI/USD') {
        console.log('⚠️ 「WTI/USD」列は既に存在します。スキップします。');
        console.log('→ 現在の列構成: ' + headers.join(', '));
        return;
      }
    }

    // 「取得元」列の位置を探す
    var sourceColIndex = -1;
    for (var j = 0; j < headers.length; j++) {
      if (headers[j] === '取得元') {
        sourceColIndex = j + 1; // 1始まりの列番号
        break;
      }
    }

    if (sourceColIndex === -1) {
      console.log('❌ 「取得元」列が見つかりません');
      console.log('→ 現在の列構成: ' + headers.join(', '));
      return;
    }

    // 商品列3本を「取得元」列の直前に挿入
    sheet.insertColumnsBefore(sourceColIndex, COMMODITY_ASSETS.length);

    // ヘッダーテキストと書式設定（COMMODITY_COLORSを使用）
    var comColorKeys = ['WTI', 'BTC', 'NATGAS'];
    for (var k = 0; k < COMMODITY_ASSETS.length; k++) {
      var col = sourceColIndex + k;
      var cell = sheet.getRange(1, col);
      cell.setValue(COMMODITY_ASSETS[k].symbol);
      cell.setBackground(COMMODITY_COLORS[comColorKeys[k]][0]);
      cell.setFontColor(HEADER_TEXT_COLOR);
      cell.setFontWeight('bold');
      cell.setHorizontalAlignment('center');
      sheet.setColumnWidth(col, 110);
    }

    console.log('✅ 商品列ヘッダーを追加しました');
    console.log('→ WTI/USD: ' + sourceColIndex + '列目');
    console.log('→ BTC/USD: ' + (sourceColIndex + 1) + '列目');
    console.log('→ NATGAS/USD: ' + (sourceColIndex + 2) + '列目');
    console.log('→ 取得元・ステータスは ' + (sourceColIndex + 3) + '列目以降に移動');
    console.log('→ 次に applyPairColors() を実行して色を全列に適用してください');
    console.log('→ その後 testFetchRates() でデータが入ることを確認してください');

  } catch (e) {
    console.log('❌ setupCommodityColumns エラー: ' + e.message);
  }
}

// ========================================
// レート保存（2段階方式 - Step2）
// ========================================

// ========================================
// 安全な数値変換ヘルパー ★v5.9.1追加
// Google Sheetsが数値(182等)をDate型に自動フォーマットする問題の対策
// ========================================

/**
 * 値を安全に数値に変換する。Date型の場合はSheetsシリアル値に復元。
 * Google SheetsはEUR/JPY安値(182-184)を日付シリアル値と誤認しDate型に変換する。
 * Number(Date)はエポックミリ秒(-2兆等)を返すため、シリアル値に戻す必要がある。
 * @param {*} val - 値（数値、Date、文字列等）
 * @returns {number} 数値
 */
function safeNumber_(val) {
  if (val instanceof Date) {
    // Google Sheetsのシリアル値基準日: 1899年12月30日
    var baseDate = new Date(Date.UTC(1899, 11, 30, 0, 0, 0));
    var serial = (val.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000);
    return serial;
  }
  return Number(val);
}

// ========================================
// レートキャッシュからフォールバック取得 ★v5.9.1追加
// Twelve Data API失敗時に、レートキャッシュの最新行からratesオブジェクトを生成
// ========================================

/**
 * レートキャッシュの最新行からratesオブジェクトを生成（APIフォールバック用）
 * @param {string} spreadsheetId - スプレッドシートID
 * @returns {Object|null} ratesオブジェクト（fetchLatestRates_と同じ形式）
 */
function getLatestRatesFromCache_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    if (!sheet || sheet.getLastRow() < 2) return null;
    
    var lastRow = sheet.getLastRow();
    var numCols = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
    var latest = sheet.getRange(lastRow, 1, 1, numCols).getValues()[0];
    
    // キャッシュが古すぎないかチェック（6時間以内のみ有効）
    var timestamp = new Date(latest[0]);
    var now = new Date();
    var ageHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
    if (ageHours > 6) {
      console.log('⚠️ キャッシュが' + ageHours.toFixed(1) + '時間前のため無効');
      return null;
    }
    
    var rates = {
      source: 'レートキャッシュ（フォールバック）',
      fetchedAt: timestamp
    };
    
    // ヘッダーからCURRENCY_PAIRSのkeyにマッピング
    for (var i = 0; i < CURRENCY_PAIRS.length; i++) {
      var pair = CURRENCY_PAIRS[i];
      for (var j = 1; j < headers.length; j++) {
        if (headers[j] === pair.symbol) {
          var val = Number(latest[j]);
          if (val && val >= pair.min && val <= pair.max) {
            rates[pair.key] = val;
          }
          break;
        }
      }
    }
    
    // 全ペアが取得できたか確認
    for (var k = 0; k < CURRENCY_PAIRS.length; k++) {
      if (!rates[CURRENCY_PAIRS[k].key]) {
        console.log('⚠️ キャッシュに' + CURRENCY_PAIRS[k].symbol + 'がありません');
        return null;
      }
    }
    
    var dateStr = Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    console.log('📊 キャッシュフォールバック: ' + dateStr + '時点のデータを使用');
    return rates;
    
  } catch (e) {
    console.log('❌ キャッシュフォールバック失敗: ' + e.message);
    return null;
  }
}

/**
 * レートキャッシュの最新レートをプロンプト用テキストに整形 ★v5.9.1追加
 * buildPrompt_から呼ばれ、Geminiが「今の正確なレート」を把握するために使用
 * @param {string} spreadsheetId - スプレッドシートID
 * @returns {string} プロンプト注入用テキスト（空文字の場合もある）
 */
function getLatestRateText_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    if (!sheet || sheet.getLastRow() < 2) return '';
    
    var lastRow = sheet.getLastRow();
    var numCols = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
    var latest = sheet.getRange(lastRow, 1, 1, numCols).getValues()[0];
    
    var timestamp = new Date(latest[0]);
    var dateStr = Utilities.formatDate(timestamp, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    
    var lines = ['【直近の実勢レート（' + dateStr + '時点・レートキャッシュ）】'];
    lines.push('※ 投稿で具体的レートに言及する場合は必ずこの数値を基準にせよ。勝手に丸めるな。');
    
    for (var i = 1; i < headers.length; i++) {
      var pairName = headers[i];
      var rate = latest[i];
      
      if (pairName && typeof rate === 'number' && rate > 0) {
        if (pairName === '取得元' || pairName === 'ステータス') continue;
        var decimals = (pairName.indexOf('JPY') !== -1) ? 3 : 5;
        lines.push(pairName + ': ' + rate.toFixed(decimals));
      }
    }
    
    return lines.join('\n');
    
  } catch (e) {
    console.log('⚠️ getLatestRateText_ エラー: ' + e.message);
    return '';
  }
}


// スプレッドシートの「レートキャッシュ」シートに保存
function saveRatesToSheet_(rates, spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    
    // シートがなければ作成
    if (!sheet) {
      sheet = ss.insertSheet('レートキャッシュ');
      console.log('✅ レートキャッシュシートを新規作成');
    }
    
    // ヘッダーがなければ追加（★v6.5: 商品列 + 色定義を追加）
    if (sheet.getLastRow() < 1) {
      var headers = ['取得日時'];
      for (var h = 0; h < CURRENCY_PAIRS.length; h++) {
        headers.push(CURRENCY_PAIRS[h].symbol);
      }
      for (var ch = 0; ch < COMMODITY_ASSETS.length; ch++) {
        headers.push(COMMODITY_ASSETS[ch].symbol);
      }
      headers.push('取得元', 'ステータス');
      sheet.appendRow(headers);

      // 取得日時列
      sheet.getRange(1, 1).setBackground(DATE_HEADER_BG).setFontWeight('bold');

      // 為替列（B〜H）: PAIR_COLORSを使用
      var fxColorKeys = ['USDJPY', 'EURUSD', 'GBPUSD', 'EURJPY', 'GBPJPY', 'AUDJPY', 'AUDUSD'];
      for (var fw = 0; fw < CURRENCY_PAIRS.length; fw++) {
        var fxCell = sheet.getRange(1, 2 + fw);
        fxCell.setBackground(PAIR_COLORS[fxColorKeys[fw]][0]);
        fxCell.setFontColor(HEADER_TEXT_COLOR);
        fxCell.setFontWeight('bold');
        fxCell.setHorizontalAlignment('center');
        sheet.setColumnWidth(2 + fw, 100);
      }

      // 商品列（I〜K）: COMMODITY_COLORSを使用
      var comStartCol = 2 + CURRENCY_PAIRS.length;
      var comColorKeysNew = ['WTI', 'BTC', 'NATGAS'];
      for (var cw = 0; cw < COMMODITY_ASSETS.length; cw++) {
        var comCell = sheet.getRange(1, comStartCol + cw);
        comCell.setBackground(COMMODITY_COLORS[comColorKeysNew[cw]][0]);
        comCell.setFontColor(HEADER_TEXT_COLOR);
        comCell.setFontWeight('bold');
        comCell.setHorizontalAlignment('center');
        sheet.setColumnWidth(comStartCol + cw, 110);
      }

      // 取得元・ステータス列
      var metaStart = comStartCol + COMMODITY_ASSETS.length;
      sheet.getRange(1, metaStart, 1, 2).setBackground(OTHER_HEADER_BG).setFontWeight('bold');
      sheet.setColumnWidth(metaStart, 150);
      sheet.setColumnWidth(metaStart + 1, 80);

      // 取得日時列の幅
      sheet.setColumnWidth(1, 150);

      // 1行目固定
      sheet.setFrozenRows(1);

      console.log('✅ ヘッダーを追加（色付き）');
    }

    // ★v6.5更新: WTI・天然ガス（Alpha Vantage・日次キャッシュ）を先に取得
    // ※ キャッシュヒット時はAPI不使用のため62秒待機の前でOK
    var dailyCommodities = fetchDailyCommodityPrices_();

    // BTC（Twelve Data）は為替取得から62秒ずらして取得（分間クレジット制限対策）
    Utilities.sleep(62000);
    var btcData = fetchCommodityPrices_();

    // 全商品データを統合（BTC/GOLD=Twelve Data、WTI/天然ガス=Alpha Vantage）
    var commodities = {
      wti:    dailyCommodities ? dailyCommodities.wti    : null,
      btc:    btcData          ? btcData.btc             : null,
      gold:   btcData          ? btcData.gold            : null,
      natgas: dailyCommodities ? dailyCommodities.natgas : null
    };

    // レートを追記
    var timeStr = Utilities.formatDate(rates.fetchedAt, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    var row = [timeStr];
    for (var r = 0; r < CURRENCY_PAIRS.length; r++) {
      row.push(rates[CURRENCY_PAIRS[r].key]);
    }
    // ★v6.5更新: 商品データをシート列順（WTI/BTC/GOLD/NATGAS）に追加
    var comOrder = ['wti', 'btc', 'gold', 'natgas'];
    for (var cr = 0; cr < comOrder.length; cr++) {
      var cv = commodities ? commodities[comOrder[cr]] : null;
      row.push(cv !== null && cv !== undefined ? cv : '');
    }
    row.push(rates.source, '成功');
    sheet.appendRow(row);
    
    console.log('✅ レートをシートに保存: ' + timeStr);
  } catch (e) {
    console.log('⚠️ レート保存エラー（投稿生成は続行）: ' + e.message);
  }
}

// ========================================
// 価格分析（レートサマリーシートから読むだけ - 軽量）
// ========================================

// ========================================
// レート乖離チェック（キャッシュの直近データと比較）
// ========================================

/**
 * 取得したレートをキャッシュの直近データと比較し、異常値を検出する
 * @param {Object} rates - 取得したレート {usdjpy, eurusd, gbpusd}
 * @param {string} spreadsheetId - スプレッドシートID
 * @return {boolean} true=正常, false=乖離あり
 */
function crossValidateRate_(rates, spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    if (!sheet || sheet.getLastRow() < 2) {
      console.log('📌 キャッシュなし → 乖離チェックスキップ');
      return true;
    }
    
    // 直近20件を取得
    var lastRow = sheet.getLastRow();
    var startRow = Math.max(2, lastRow - 19);
    var numRows = lastRow - startRow + 1;
    var data = sheet.getRange(startRow, 1, numRows, 4).getValues();
    
    // 24時間以内のデータのみ抽出
    var now = new Date();
    var cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    var recentU = [];
    var recentE = [];
    var recentG = [];
    
    for (var i = 0; i < data.length; i++) {
      var rowDate = new Date(data[i][0]);
      if (rowDate >= cutoff) {
        var u = Number(data[i][1]);
        var e = Number(data[i][2]);
        var g = Number(data[i][3]);
        if (u > 100 && u < 200) recentU.push(u);
        if (e > 0.9 && e < 1.3)  recentE.push(e);
        if (g > 1.1 && g < 1.5)  recentG.push(g);
      }
    }
    
    // データが3件未満 → 信頼性不足のためスキップ
    if (recentU.length < 3) {
      console.log('📌 キャッシュ' + recentU.length + '件 → 乖離チェックスキップ');
      return true;
    }
    
    // 中央値を計算
    var medianU = getMedian_(recentU);
    var medianE = recentE.length >= 3 ? getMedian_(recentE) : null;
    var medianG = recentG.length >= 3 ? getMedian_(recentG) : null;
    
    // 乖離チェック（閾値: USDJPY±2.0円, EURUSD/GBPUSD±0.02）
    var devU = Math.abs(rates.usdjpy - medianU);
    if (devU > 2.0) {
      console.log('❌ USD/JPY乖離: 取得=' + rates.usdjpy + ' 中央値=' + medianU.toFixed(2) + ' 差=' + devU.toFixed(2) + '円');
      return false;
    }
    if (medianE && Math.abs(rates.eurusd - medianE) > 0.02) {
      console.log('❌ EUR/USD乖離: 取得=' + rates.eurusd + ' 中央値=' + medianE.toFixed(4) + ' 差=' + Math.abs(rates.eurusd - medianE).toFixed(4));
      return false;
    }
    if (medianG && Math.abs(rates.gbpusd - medianG) > 0.02) {
      console.log('❌ GBP/USD乖離: 取得=' + rates.gbpusd + ' 中央値=' + medianG.toFixed(4) + ' 差=' + Math.abs(rates.gbpusd - medianG).toFixed(4));
      return false;
    }
    
    console.log('✅ 乖離チェック通過（USDJPY中央値比: ±' + devU.toFixed(2) + '円, キャッシュ' + recentU.length + '件）');
    return true;
  } catch (e) {
    console.log('⚠️ 乖離チェックエラー（スキップ）: ' + e.message);
    return true;
  }
}

/**
 * 配列の中央値を返す
 */
function getMedian_(arr) {
  var sorted = arr.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 中央値から閾値以上乖離した外れ値を除去する
 * @param {number[]} arr - 数値配列
 * @param {number} threshold - 許容乖離幅（USDJPY: 2.0円, EURUSD/GBPUSD: 0.02）
 * @return {number[]} 外れ値を除去した配列
 */
function filterOutliers_(arr, threshold) {
  if (arr.length < 3) return arr;
  var median = getMedian_(arr);
  var filtered = arr.filter(function(v) {
    return Math.abs(v - median) <= threshold;
  });
  if (filtered.length !== arr.length) {
    console.log('📌 外れ値除去: ' + arr.length + '件 → ' + filtered.length + '件（中央値=' + median.toFixed(4) + ', 閾値=±' + threshold + '）');
  }
  return filtered.length > 0 ? filtered : arr;
}

// ========================================
// 市場分析エンジン ★v5.4 Phase 6.5（通貨強弱 + トレンド + ファンダ統合）
// ========================================

/**
 * 5通貨の強弱を計算（7ペアの変動率から導出）
 * USD/JPY↑ → USD強・JPY弱、EUR/USD↑ → EUR強・USD弱 の原理
 * @param {Array} pairChanges - ペア変動率配列
 * @return {Array} [{currency, jpName, score, direction}, ...] スコア降順
 */
function calcCurrencyStrength_(pairChanges) {
  var scores = { USD: [], EUR: [], GBP: [], AUD: [], JPY: [] };
  var pairMap = {
    usdjpy: { base: 'USD', quote: 'JPY' },
    eurusd: { base: 'EUR', quote: 'USD' },
    gbpusd: { base: 'GBP', quote: 'USD' },
    eurjpy: { base: 'EUR', quote: 'JPY' },
    gbpjpy: { base: 'GBP', quote: 'JPY' },
    audjpy: { base: 'AUD', quote: 'JPY' },
    audusd: { base: 'AUD', quote: 'USD' }
  };
  var jpNames = { USD: '米ドル', EUR: 'ユーロ', GBP: 'ポンド', AUD: '豪ドル', JPY: '円' };
  
  for (var i = 0; i < pairChanges.length; i++) {
    var m = pairMap[pairChanges[i].key];
    if (!m) continue;
    scores[m.base].push(pairChanges[i].changePercent);
    scores[m.quote].push(-pairChanges[i].changePercent);
  }
  
  var result = [];
  var currencies = ['USD', 'EUR', 'GBP', 'AUD', 'JPY'];
  for (var c = 0; c < currencies.length; c++) {
    var arr = scores[currencies[c]];
    var avg = 0;
    if (arr.length > 0) {
      var sum = 0;
      for (var s = 0; s < arr.length; s++) sum += arr[s];
      avg = sum / arr.length;
    }
    result.push({
      currency: currencies[c],
      jpName: jpNames[currencies[c]],
      score: avg,
      direction: avg > 0.05 ? '強' : avg < -0.05 ? '弱' : '中立'
    });
  }
  
  result.sort(function(a, b) { return b.score - a.score; });
  return result;
}

/**
 * レートキャッシュから本日の始値（最初のレート）を取得する ★v5.5.1
 * 毎朝5:00のscheduleTodayPosts実行後、最初に取得されたレートを「本日始値」とする
 * @param {Spreadsheet} ss - スプレッドシートオブジェクト
 * @return {Object|null} {usdjpy: 156.20, eurusd: 1.0880, ...}
 */
function getTodayOpenRates_(ss) {
  try {
    var cacheSheet = ss.getSheetByName('レートキャッシュ');
    if (!cacheSheet || cacheSheet.getLastRow() < 2) return null;
    
    var numCols = 1 + CURRENCY_PAIRS.length + 2;
    var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
    
    // 直近48行から今日の最初の行を探す（最大2日分）
    var lastRow = cacheSheet.getLastRow();
    var readRows = Math.min(48, lastRow - 1);
    var startRow = lastRow - readRows + 1;
    var data = cacheSheet.getRange(startRow, 1, readRows, numCols).getValues();
    
    var todayFirstRow = null;
    for (var i = 0; i < data.length; i++) {
      var dateVal = data[i][0];
      if (!dateVal) continue;
      
      var dateStr;
      if (dateVal instanceof Date) {
        dateStr = Utilities.formatDate(dateVal, 'Asia/Tokyo', 'yyyy/MM/dd');
      } else {
        dateStr = dateVal.toString().substring(0, 10);
      }
      
      if (dateStr === todayStr) {
        todayFirstRow = data[i];
        break; // 最初の1件を取得
      }
    }
    
    if (!todayFirstRow) {
      console.log('📌 本日始値: キャッシュに今日のデータなし');
      return null;
    }
    
    var openRates = {};
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var val = Number(todayFirstRow[1 + p]);
      if (val > CURRENCY_PAIRS[p].min && val < CURRENCY_PAIRS[p].max) {
        openRates[CURRENCY_PAIRS[p].key] = val;
      }
    }
    
    console.log('📌 本日始値取得成功: USD/JPY=' + (openRates.usdjpy || 'N/A'));
    return openRates;
    
  } catch (e) {
    console.log('⚠️ 本日始値取得エラー: ' + e.message);
    return null;
  }
}

/**
 * レートキャッシュから直近のトレンドを検出（1時間ごとのデータ）
 * @param {string} spreadsheetId
 * @return {Object|null} {pairs: {usdjpy: {direction, momentum, ...}}, hoursAnalyzed}
 */
function detectTrendFromCache_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var cacheSheet = ss.getSheetByName('レートキャッシュ');
    if (!cacheSheet || cacheSheet.getLastRow() < 4) return null;
    
    var numCacheCols = 1 + CURRENCY_PAIRS.length + 2;
    var lastRow = cacheSheet.getLastRow();
    var readRows = Math.min(8, lastRow - 1);
    var startRow = lastRow - readRows + 1;
    var data = cacheSheet.getRange(startRow, 1, readRows, numCacheCols).getValues();
    
    if (data.length < 3) return null;
    
    var jpNames = {
      usdjpy: 'ドル円', eurusd: 'ユーロドル', gbpusd: 'ポンドドル',
      eurjpy: 'ユーロ円', gbpjpy: 'ポンド円', audjpy: '豪ドル円', audusd: '豪ドル米ドル'
    };
    var trends = {};
    
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var pair = CURRENCY_PAIRS[p];
      var colIndex = 1 + p;
      
      var entries = [];
      for (var i = 0; i < data.length; i++) {
        var val = Number(data[i][colIndex]);
        if (val > pair.min && val < pair.max) {
          entries.push({ time: data[i][0], rate: val });
        }
      }
      
      if (entries.length < 3) {
        trends[pair.key] = { direction: '不明', momentum: '', jpName: jpNames[pair.key] || pair.symbol };
        continue;
      }
      
      var oldest = entries[0].rate;
      var mid = entries[Math.floor(entries.length / 2)].rate;
      var latest = entries[entries.length - 1].rate;
      var totalChange = latest - oldest;
      var totalPct = (totalChange / oldest) * 100;
      
      // 方向の一貫性カウント
      var upCount = 0, downCount = 0;
      for (var j = 1; j < entries.length; j++) {
        if (entries[j].rate > entries[j - 1].rate) upCount++;
        else if (entries[j].rate < entries[j - 1].rate) downCount++;
      }
      var steps = entries.length - 1;
      
      var direction, momentum = '';
      if (Math.abs(totalPct) < 0.03) {
        direction = 'レンジ';
      } else if (totalChange > 0 && upCount > steps * 0.55) {
        direction = '上昇トレンド';
      } else if (totalChange < 0 && downCount > steps * 0.55) {
        direction = '下落トレンド';
      } else {
        direction = '方向感なし';
      }
      
      // 加速・減速判定
      if (direction.indexOf('トレンド') >= 0) {
        var firstHalf = Math.abs(mid - oldest);
        var secondHalf = Math.abs(latest - mid);
        if (secondHalf > firstHalf * 1.5) momentum = '加速中';
        else if (secondHalf < firstHalf * 0.5) momentum = '減速中';
        else momentum = '安定';
      }
      
      trends[pair.key] = {
        direction: direction,
        momentum: momentum,
        changePct: totalPct,
        oldest: oldest,
        latest: latest,
        hours: entries.length,
        jpName: jpNames[pair.key] || pair.symbol
      };
    }
    
    return { pairs: trends, hoursAnalyzed: data.length };
  } catch (e) {
    console.log('⚠️ トレンド検出エラー: ' + e.message);
    return null;
  }
}

/**
 * 市場分析（通貨強弱 + ペア変動率 + トレンド）を統合してプロンプト注入テキストを生成
 * @param {Object} rates - 現在のレート
 * @param {string} spreadsheetId - スプレッドシートID
 * @return {Object|null} {text, logSummary, hotPair, ...}
 */
function detectHotPair_(rates, spreadsheetId) {
  try {
    if (!rates) return null;
    
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var dailySheet = ss.getSheetByName('日次レート');
    if (!dailySheet || dailySheet.getLastRow() < 2) return null;
    
    var jpNames = {
      usdjpy: 'ドル円', eurusd: 'ユーロドル', gbpusd: 'ポンドドル',
      eurjpy: 'ユーロ円', gbpjpy: 'ポンド円', audjpy: '豪ドル円', audusd: '豪ドル米ドル'
    };
    
    // ===== Step 1: ペア変動率（昨日終値 vs 現在値）=====
    var numDailyCols = 1 + CURRENCY_PAIRS.length * 4 + 1;
    var lastRow = dailySheet.getLastRow();
    var lastData = dailySheet.getRange(lastRow, 1, 1, numDailyCols).getValues()[0];
    
    var pairChanges = [];
    for (var i = 0; i < CURRENCY_PAIRS.length; i++) {
      var pair = CURRENCY_PAIRS[i];
      var colBase = 1 + i * 4;
      var prevClose = Number(lastData[colBase + 3]);
      var current = Number(rates[pair.key]);
      if (!prevClose || !current || prevClose === 0) continue;
      
      var change = current - prevClose;
      var changePercent = (change / prevClose) * 100;
      var pips = pair.key.indexOf('jpy') >= 0 ? Math.abs(change) * 100 : Math.abs(change) * 10000;
      
      pairChanges.push({
        key: pair.key, symbol: pair.symbol, jpName: jpNames[pair.key] || pair.symbol,
        current: current, prevClose: prevClose, change: change,
        changePercent: changePercent, absPercent: Math.abs(changePercent), pips: pips,
        todayOpen: 0, todayChange: 0, todayChangePct: 0, todayPips: 0
      });
    }
    if (pairChanges.length === 0) return null;
    
    // ===== Step 1.5: 本日始値比（今日だけの値動き）★v5.5.1 =====
    var todayOpenRates = getTodayOpenRates_(ss);
    if (todayOpenRates) {
      for (var t = 0; t < pairChanges.length; t++) {
        var pc = pairChanges[t];
        var todayOpen = todayOpenRates[pc.key];
        if (todayOpen && todayOpen > 0) {
          pc.todayOpen = todayOpen;
          pc.todayChange = pc.current - todayOpen;
          pc.todayChangePct = (pc.todayChange / todayOpen) * 100;
          pc.todayPips = pc.key.indexOf('jpy') >= 0 ? Math.abs(pc.todayChange) * 100 : Math.abs(pc.todayChange) * 10000;
        }
      }
    }
    
    // ===== Step 2: 通貨強弱ランキング =====
    var csRanking = calcCurrencyStrength_(pairChanges);
    var strongest = csRanking[0];
    var weakest = csRanking[csRanking.length - 1];
    
    // 最強×最弱ペアを特定
    var bestPairKey = strongest.currency.toLowerCase() + weakest.currency.toLowerCase();
    // ペアキーの正引き・逆引き
    var bestPairKeyAlt = weakest.currency.toLowerCase() + strongest.currency.toLowerCase();
    var bestPair = null;
    for (var b = 0; b < pairChanges.length; b++) {
      if (pairChanges[b].key === bestPairKey || pairChanges[b].key === bestPairKeyAlt) {
        bestPair = pairChanges[b];
        break;
      }
    }
    
    // ===== Step 3: トレンド検出 =====
    var trendResult = detectTrendFromCache_(spreadsheetId);
    
    // ===== Step 4: ペア変動率ソート =====
    pairChanges.sort(function(a, b) { return b.absPercent - a.absPercent; });
    var hot = pairChanges[0];
    
    // ===== Step 5: 注入テキスト構築 =====
    var text = '【🔥市場分析（自動算出 - 投稿の主役選定に使え）】\n\n';
    
    // --- 通貨強弱 ---
    text += '■ 通貨の動き（昨日終値比・5通貨7ペアの簡易算出）\n';
    for (var r = 0; r < csRanking.length; r++) {
      var cs = csRanking[r];
      text += '  ' + (r + 1) + '位 ' + cs.currency + '（' + cs.jpName + '）';
      text += (cs.score >= 0 ? '+' : '') + cs.score.toFixed(2) + '%';
      text += '（' + cs.direction + '）\n';
    }
    text += '  → 買われている: ' + strongest.currency + '（' + strongest.jpName + '）';
    text += ' / 売られている: ' + weakest.currency + '（' + weakest.jpName + '）\n';
    var gapScore = strongest.score - weakest.score;
    if (bestPair) {
      text += '  → 注目ペア候補: ' + bestPair.symbol + '（強弱差 ' + gapScore.toFixed(2) + '%）\n';
    }
    text += '\n';
    
    // --- ペア変動率 + 本日値動き + トレンド統合 ---
    text += '■ ペア別状況\n';
    for (var p = 0; p < pairChanges.length; p++) {
      var pc = pairChanges[p];
      var dir = pc.change > 0 ? '↑' : pc.change < 0 ? '↓' : '→';
      text += '  ' + pc.symbol + '（' + pc.jpName + '）\n';
      text += '    昨日終値比: ' + dir;
      text += (pc.changePercent >= 0 ? '+' : '') + pc.changePercent.toFixed(2) + '%';
      text += ' / ' + pc.pips.toFixed(1) + 'pips\n';
      
      // ★v5.5.1: 本日始値比（今日だけの方向）
      if (pc.todayOpen > 0) {
        var todayDir = pc.todayChange > 0 ? '↑' : pc.todayChange < 0 ? '↓' : '→';
        text += '    ★本日の値動き: ' + todayDir;
        text += (pc.todayChangePct >= 0 ? '+' : '') + pc.todayChangePct.toFixed(2) + '%';
        text += ' / ' + pc.todayPips.toFixed(1) + 'pips';
        // 昨日と今日の方向が逆なら強調
        if ((pc.change > 0 && pc.todayChange < 0) || (pc.change < 0 && pc.todayChange > 0)) {
          text += ' ⚠️昨日と逆方向！';
        }
        text += '\n';
      }
      
      // トレンド情報を付加
      if (trendResult && trendResult.pairs[pc.key]) {
        var tr = trendResult.pairs[pc.key];
        if (tr.direction !== '不明') {
          text += '    短期トレンド（直近数時間）: ' + tr.direction;
          if (tr.momentum) text += '（' + tr.momentum + '）';
          text += '\n';
          
          // 日次変動と短期トレンドが矛盾する場合は注記
          var dailyUp = pc.change > 0;
          var trendUp = tr.direction === '上昇トレンド';
          var trendDown = tr.direction === '下落トレンド';
          if ((dailyUp && trendDown) || (!dailyUp && trendUp)) {
            text += '    ⚠️日次は' + (dailyUp ? '上昇' : '下落') + 'だが短期は' + tr.direction + '。';
            text += '転換の兆しか、一時的な調整か見極めが必要。\n';
          }
        }
      }
    }
    text += '\n';
    
    // --- 指示セクション ---
    text += '■ 投稿への指示\n';
    text += '・「本日の値動き」が投稿の基準。昨日終値比ではなく、今日どう動いているかを伝えること。\n';
    text += '  → 「昨日終値比+0.95%」でも「本日の値動き-0.30%」なら「今日は下がっている」が正しい。\n';
    text += '  → 昨日の上昇が今日も続いているように書くのはNG。\n';
    text += '・🔥注目ペア「' + hot.symbol + '（' + hot.jpName + '）」を主役候補として推奨。\n';
    text += '  → できるだけ「' + hot.jpName + '」を中心にストーリーを組み立てること。\n';
    text += '  → ただしニュースや相場状況的に他ペアが適切なら、そちらを主役にしてもよい。\n';
    text += '・【📰市場ニュースTOP5】が注入されている場合、ニュースを題材にすること。\n';
    text += '  → 要人の名前、具体的な数字、政策内容を入れる。一般論は避ける。\n';
    text += '・「⚠️昨日と逆方向」のペアがある場合、転換を正確に伝えること。\n';
    if (trendResult) {
      var hotTrend = trendResult.pairs[hot.key];
      if (hotTrend && hotTrend.direction.indexOf('トレンド') >= 0) {
        text += '・' + hot.symbol + 'の短期トレンドは「' + hotTrend.direction + '」。日次変動方向もあわせて正確に伝えよ。\n';
      }
    }
    text += '・全ペア0.1%未満の低ボラ日はドル円でよい。3ペア以上のレート並べは禁止。\n';
    text += '・★絶対禁止★ 通貨の動きデータと矛盾する記述をするな。\n';
    text += '  → 売られている通貨を「買いの流れ」と書くのは事実に反する。\n';
    text += '  → 買われている通貨を「売られている」と書くのは事実に反する。\n';
    text += '  → ニュースの「見通し」とデータの「事実」が矛盾する場合、データが正しい。\n';
    text += '  → 例: USDが売られているのに「ドル買いの流れ」はNG。「ドルは軟調」「ドルは売られている」が適切。\n';
    text += '  → ニュースで利下げ否定があっても、実際にUSDが売られているなら「発言にもかかわらずドルは軟調」と書け。\n\n';
    
    // ===== ログ =====
    var logSummary = '💪通貨強弱: ' + csRanking.map(function(c) { 
      return c.currency + '(' + (c.score >= 0 ? '+' : '') + c.score.toFixed(2) + '%)'; 
    }).join(' > ');
    logSummary += ' | 🔥主役: ' + hot.symbol + '(' + hot.jpName + ') 日次';
    logSummary += (hot.change >= 0 ? '+' : '') + hot.changePercent.toFixed(2) + '%';
    if (hot.todayOpen > 0) {
      logSummary += ' / 本日';
      logSummary += (hot.todayChange >= 0 ? '+' : '') + hot.todayChangePct.toFixed(2) + '%';
    }
    if (trendResult && trendResult.pairs[hot.key]) {
      var hotTr = trendResult.pairs[hot.key];
      logSummary += ' / 短期:' + hotTr.direction;
      if (hotTr.momentum) logSummary += '(' + hotTr.momentum + ')';
    }
    
    console.log(logSummary);
    
    return {
      hotPair: hot,
      allPairs: pairChanges,
      csRanking: csRanking,
      strongest: strongest,
      weakest: weakest,
      trendResult: trendResult,
      text: text,
      logSummary: logSummary
    };
    
  } catch (e) {
    console.log('⚠️ 市場分析エラー（スキップ）: ' + e.message);
    return null;
  }
}

// ===== 市場ニュースTOP5自動取得 ★v5.5 Phase 7 =====
/**
 * Gemini + Google Search Grounding で今日の市場ニュースTOP5を取得
 * 1時間キャッシュ（16タイプ生成中は1回のAPI呼び出しで済む）
 * 
 * @param {Object} keys - APIキー群
 * @return {string} プロンプト注入用ニューステキスト（取得失敗時は空文字）
 */
function fetchMarketNews_(keys) {
  try {
    // 1時間キャッシュ
    var cache = CacheService.getScriptCache();
    var cached = cache.get('market_news_v2');
    if (cached) {
      console.log('📰 ニュースキャッシュ使用');
      return cached;
    }
    
    var now = new Date();
    var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年M月d日');
    var isMonday = (now.getDay() === 1); // ★v5.6: 月曜日判定
    
    var prompt = '金融市場のニュースアナリストとして、' + dateStr + '現在のFX・株式・金利市場で\n';
    prompt += '最も注目されているニュースTOP5をGoogle検索で調べて報告してください。\n\n';
    
    // ★v5.6: 月曜日は週末の世界情勢を重点的に検索
    if (isMonday) {
      prompt += '【重要: 本日は月曜日（週明け）】\n';
      prompt += '土日は市場が閉まっていたが、世界情勢は動き続けている。\n';
      prompt += '金曜NYクローズ後〜月曜アジアオープンまでの約60時間に起きた出来事を重点的に検索せよ。\n';
      prompt += '特に以下を重点検索:\n';
      prompt += '・週末の要人発言（FRB理事、各国財務大臣、中央銀行総裁のインタビュー・講演）\n';
      prompt += '・地政学リスクの進展（戦争、制裁、テロ、外交交渉、選挙結果）\n';
      prompt += '・政策発表・関税発動（週末に発表されることがある）\n';
      prompt += '・中東/アジア市場の先行反応（日曜夕方〜月曜早朝のオセアニア・中東市場）\n';
      prompt += '・仮想通貨市場の大幅変動（24h市場のためセンチメント先行指標になる）\n';
      prompt += '・自然災害・パンデミック関連\n';
      prompt += '→ 週末に何も起きなかった場合は「大きなサプライズなし」と明記し、金曜の流れの延長を分析せよ。\n\n';
    }
    
    prompt += '【検索すべきソース】\n';
    prompt += '・Bloomberg、Reuters、日経新聞、ロイター日本語版\n';
    prompt += '・各国中央銀行（FRB/日銀/ECB/BOE/RBA）の発言・声明\n';
    prompt += '・地政学リスク（戦争、制裁、関税）\n';
    prompt += '・株式市場（S&P500、日経平均、DAX）の急変動\n';
    prompt += '・金利市場（米10年債利回り、日本国債）\n';
    prompt += '・商品市場（原油、金）\n\n';
    
    prompt += '【出力形式】各項目を以下の形式で5件。余計な説明文は不要。\n';
    prompt += '番号. [カテゴリ] ヘッドライン\n';
    prompt += '   日付: YYYY/MM/DD（このニュースがいつのものか。検索結果の日付を正確に記載）\n';
    prompt += '   影響: FX市場への具体的影響（どの通貨が買われ/売られるか）\n';
    prompt += '   織り込み度: 高/中/低（市場がどの程度反応済みか）\n';
    prompt += '   関連: 株価・金利・商品への波及効果\n\n';
    
    prompt += '【カテゴリ選択肢】\n';
    prompt += '要人発言 / 金融政策 / 地政学 / 経済指標結果 / 株式市場 / 商品市場 / 貿易・関税 / 政治\n\n';
    
    prompt += '【ルール】\n';
    if (isMonday) {
      prompt += '・金曜NYクローズ後〜現在までのニュースを重点的に検索。古くても金曜終盤のニュースはOK。\n';
    } else {
      prompt += '・直近24〜48時間以内のニュースのみ。古いネタは不要。\n';
    }
    prompt += '・検索結果で確認できた事実のみ。推測で作るな。\n';
    prompt += '・各ニュースの日付は検索結果から正確に取得せよ。日付不明なら「日付不明」と書け。\n';
    prompt += '・3日以上前のニュースは採用するな。' + dateStr + '時点で鮮度がないニュースは除外。\n';
    prompt += '・ヘッドラインは具体的に（NG:「米国の政策」→ OK:「パウエル議長、利下げ急がずと発言」）\n';
    prompt += '・「織り込み度」は市場の反応を見て判断（大きく動いた=高、まだ反応薄=低）\n';
    prompt += '・FXへの影響を最優先。株・金利・商品は「関連」として波及効果を書く。\n';
    prompt += '・日本語で出力。番号付きリストで簡潔に。\n';
    
    var result = callGemini_(prompt, keys.GEMINI_API_KEY, true);
    
    // ★v6.0.2: Grounding検索ソースをログ出力（ニュースの裏付け確認用）
    if (result && result.raw) {
      try {
        var candidate = result.raw.candidates && result.raw.candidates[0];
        if (candidate && candidate.groundingMetadata) {
          var gm = candidate.groundingMetadata;
          
          // 検索クエリをログ出力
          if (gm.webSearchQueries && gm.webSearchQueries.length > 0) {
            console.log('🔍 Grounding検索クエリ: ' + gm.webSearchQueries.join(' | '));
          }
          
          // ソースURLをログ出力（最大10件）
          if (gm.groundingChunks && gm.groundingChunks.length > 0) {
            var sources = [];
            for (var gi = 0; gi < Math.min(gm.groundingChunks.length, 10); gi++) {
              var chunk = gm.groundingChunks[gi];
              if (chunk.web) {
                sources.push((chunk.web.title || '不明') + ' → ' + chunk.web.uri);
              }
            }
            if (sources.length > 0) {
              console.log('📰 Groundingソース（' + sources.length + '件）:');
              for (var si = 0; si < sources.length; si++) {
                console.log('  ' + (si + 1) + '. ' + sources[si]);
              }
            }
          } else {
            console.log('⚠️ Groundingソースなし（Geminiの内部知識のみで回答した可能性）');
          }
        }
      } catch (gmErr) {
        console.log('⚠️ GroundingMetadata解析スキップ: ' + gmErr.message);
      }
    }
    
    if (result && result.text) {
      var newsText = '\n\n【📰 直近の市場ニュースTOP5（自動取得 - 投稿の題材として最優先で使え）】\n';
      newsText += result.text.trim();
      newsText += '\n\n';
      newsText += '■ ニュースの使い方（重要）\n';
      newsText += '・上記ニュースから投稿タイプに最も合うものを選び、投稿の「フック」（冒頭の掴み）に使え。\n';
      newsText += '・「なぜ今これが話題か」「市場がどう反応しているか」「織り込み済みか未織り込みか」を語れ。\n';
      newsText += '・ニュースの単なる要約ではなく、トレーダー目線での「だからどうする」「だから怖い/面白い」を書け。\n';
      newsText += '・要人発言は具体的な人名と発言内容を入れろ。「関係者が〜」のような曖昧表現は禁止。\n';
      newsText += '・金利・株価・商品との連鎖を語ると投稿に厚みが出る。FXだけで閉じるな。\n';
      newsText += '・RULE系タイプでも、最近のニュースを「例」として引用すると説得力が増す。\n';
      
      // 1時間キャッシュ（3600秒）
      cache.put('market_news_v2', newsText, 3600);
      console.log('📰 市場ニュース取得成功（キャッシュ保存: 1時間）');
      return newsText;
    }
    
    console.log('⚠️ 市場ニュース取得失敗（スキップ）');
    return '';
    
  } catch (e) {
    console.log('⚠️ 市場ニュース取得エラー（スキップ）: ' + e.message);
    return '';
  }
}

function analyzePriceHistory_(rates) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('レートサマリー');
    
    if (!sheet) return null;
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    
    var numCols = 1 + CURRENCY_PAIRS.length * 2 + 2;
    var countCol = 1 + CURRENCY_PAIRS.length * 2;
    var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    
    // ★v5.9.3: 「近い」「やや遠い」のエントリのみ収集し、「遠い・参考のみ」は完全除外
    var nearEntries = []; // {period, pair, high, low, tagH, tagL} を収集
    
    for (var i = 0; i < data.length; i++) {
      var period = data[i][0];
      var count = Number(data[i][countCol]);
      if (!period || count < 2) continue;
      
      for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
        var pair = CURRENCY_PAIRS[p];
        var high = safeNumber_(data[i][1 + p * 2]);
        var low = safeNumber_(data[i][1 + p * 2 + 1]);
        
        if (!high || !low) continue;
        if (!rates || !rates[pair.key]) continue;
        
        var decimals = pair.decimals >= 5 ? 4 : 2;
        var current = Number(rates[pair.key]);
        
        // 円ペアのみ距離判定
        if (pair.key.indexOf('jpy') >= 0) {
          var distH = Math.abs(current - high);
          var distL = Math.abs(current - low);
          
          // ★v5.9.3: 「近い」（±1.0円以内）のみ収集。やや遠い・遠いは完全除外
          var isHighNear = distH <= 1.0;
          var isLowNear = distL <= 1.0;
          
          if (isHighNear || isLowNear) {
            nearEntries.push({
              period: period,
              symbol: pair.symbol,
              high: isHighNear ? high.toFixed(decimals) : null,
              low: isLowNear ? low.toFixed(decimals) : null
            });
          }
        } else {
          // 非円ペアは直近2期間のみ（昨日、今週）
          var shortPeriods = ['昨日', '今週'];
          if (shortPeriods.indexOf(String(period)) !== -1) {
            nearEntries.push({
              period: period,
              symbol: pair.symbol,
              high: high.toFixed(decimals),
              low: low.toFixed(decimals)
            });
          }
        }
      }
    }
    
    if (nearEntries.length === 0) return null;
    
    // 期間ごとにグルーピングして出力
    var result = '【意識される価格帯（実績データから自動算出。近い水準のみ抜粋）】\n';
    var currentPeriod = '';
    
    for (var j = 0; j < nearEntries.length; j++) {
      var entry = nearEntries[j];
      if (entry.period !== currentPeriod) {
        currentPeriod = entry.period;
        result += '■' + currentPeriod + '\n';
      }
      var line = '  ' + entry.symbol;
      if (entry.high) line += ' 高値: ' + entry.high;
      if (entry.high && entry.low) line += ' /';
      if (entry.low) line += ' 安値: ' + entry.low;
      result += line + '\n';
    }
    
    result += '\n※上記は現在レートから±1.0円以内の水準のみ。「〇〇円が意識される」と触れてよい。\n';
    result += '※毎回入れる必要はない。文脈に合う時だけ自然に。\n\n';
    
    return result;
  } catch (e) {
    console.log('⚠️ 価格分析エラー（投稿生成は続行）: ' + e.message);
    return null;
  }
}

/**
 * 現在のレートとレートキャッシュの前回データを比較し、方向性テキストを生成 ★v5.6追加
 * 
 * Geminiにレート数値だけ渡しても「上がっているのか下がっているのか」が分からない。
 * 前回比と方向性を明示することで、ニュースとレートの矛盾を防ぐ。
 * 
 * @param {Object} rates - 現在のレート {usdjpy, eurusd, ...}
 * @param {string} spreadsheetId - スプレッドシートID
 * @return {string|null} 方向性テキスト
 */
function calculateRateDirection_(rates, spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    if (!sheet || sheet.getLastRow() < 3) return null; // 最低3行（ヘッダー+2データ）必要
    
    // 前回のレートを取得（最終行の1つ前 = 前回取得分）
    var lastRow = sheet.getLastRow();
    // 直近10行から、6時間以上前のデータを探す（同一セッション内の連続取得を避ける）
    var searchRows = Math.min(lastRow - 1, 10);
    var recentData = sheet.getRange(lastRow - searchRows, 1, searchRows + 1, 1 + CURRENCY_PAIRS.length).getValues();
    
    var now = new Date();
    var prevRow = null;
    
    // 最新行から遡って、4時間以上前のデータを見つける
    for (var i = recentData.length - 2; i >= 0; i--) {
      var rowDate = new Date(recentData[i][0]);
      var diffHours = (now.getTime() - rowDate.getTime()) / (1000 * 60 * 60);
      if (diffHours >= 4) {
        prevRow = recentData[i];
        break;
      }
    }
    
    if (!prevRow) return null;
    
    var prevRates = {};
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      prevRates[CURRENCY_PAIRS[p].key] = Number(prevRow[1 + p]);
    }
    
    var text = '【レートの方向性（前回比 - AIはこの方向を最優先で尊重せよ）】\n';
    var hasChange = false;
    
    for (var j = 0; j < CURRENCY_PAIRS.length; j++) {
      var pair = CURRENCY_PAIRS[j];
      var current = Number(rates[pair.key]);
      var prev = prevRates[pair.key];
      
      if (!current || !prev || prev === 0) continue;
      
      var diff = current - prev;
      var pctChange = ((diff / prev) * 100).toFixed(2);
      var decimals = pair.decimals >= 5 ? 4 : 2;
      var diffStr = diff >= 0 ? '+' + diff.toFixed(decimals) : diff.toFixed(decimals);
      
      var arrow = '';
      var direction = '';
      if (Math.abs(diff / prev) >= 0.005) {
        // 0.5%以上の変動 = 大きな動き
        arrow = diff > 0 ? '↑↑' : '↓↓';
        direction = diff > 0 ? '大幅上昇' : '大幅下落';
      } else if (Math.abs(diff / prev) >= 0.001) {
        // 0.1%以上 = 通常の動き
        arrow = diff > 0 ? '↑' : '↓';
        direction = diff > 0 ? '上昇' : '下落';
      } else {
        arrow = '→';
        direction = 'ほぼ横ばい';
      }
      
      text += '  ' + pair.symbol + ': ' + arrow + ' ' + direction + '（' + diffStr + '、' + pctChange + '%）\n';
      hasChange = true;
    }
    
    if (!hasChange) return null;
    
    text += '※上記の方向性が「今、相場で何が起きているか」の事実。\n';
    text += '※ニュースの解釈がこの方向性と矛盾する場合、方向性の方が正しい。\n\n';
    
    console.log('📈 レート方向性をプロンプトに注入');
    return text;
    
  } catch (e) {
    console.log('⚠️ レート方向性計算エラー（投稿生成は続行）: ' + e.message);
    return null;
  }
}

// ========================================
// ★v5.7: 前日の経済指標結果を自動取得
// Gemini+Groundingで検索→シートに記入→MORNING注入テキスト生成
// ========================================

// ===== 【公開】定期トリガーから呼び出す指標結果取得 ★v6.7追加 =====
// scheduler.gsのscheduleTodayPosts()で設定した定時トリガーから呼び出す
function refreshTodayIndicatorResults() {
  var keys = getApiKeys();
  fetchTodayAnnouncedResults_(keys.SPREADSHEET_ID, keys.GEMINI_API_KEY);
}

// ===== 今日の発表済み指標を取得してI列に書き込む ★v6.7追加 =====
// TOKYO/LUNCH/LONDON/GOLDEN/NY生成時に呼び出し。時刻が過ぎた今日の指標を対象にする。
function fetchTodayAnnouncedResults_(spreadsheetId, geminiApiKey) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet || sheet.getLastRow() < 2) return;
    
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var todayStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy/MM/dd');
    var nowHour = now.getHours();
    var nowMin = now.getMinutes();
    
    // ★v6.7: 深夜0:00〜5:59は前日の市場セッション中とみなし、前日分も対象にする
    // 例: 1:04実行 → 3/12 21:30の未記入指標も取得対象になる
    var yesterday = new Date(today.getTime() - 86400000);
    var yesterdayStr = Utilities.formatDate(yesterday, 'Asia/Tokyo', 'yyyy/MM/dd');
    var isLateNight = (nowHour >= 0 && nowHour < 6);
    
    var lastCol = Math.min(sheet.getLastColumn(), 10);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    
    // 今日の発表済み（時刻が現在より前）かつI列が空の指標を抽出
    // 深夜帯は前日分も含める
    var targets = [];
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue;
      
      var eventDate = new Date(data[i][0]);
      var dateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'yyyy/MM/dd');
      var isToday = (dateStr === todayStr);
      var isYesterday = isLateNight && (dateStr === yesterdayStr);
      if (!isToday && !isYesterday) continue;
      
      // ★v6.8: B列はDate型で保存されているためgetHours/getMinutesで取得
      var rawTime = data[i][1];
      var timeStr = '';
      var timeHour = 0;
      var timeMin = 0;
      if (rawTime instanceof Date) {
        timeHour = rawTime.getHours();
        timeMin  = rawTime.getMinutes();
        timeStr  = timeHour + ':' + (timeMin < 10 ? '0' + timeMin : timeMin);
      } else {
        timeStr = String(rawTime || '').trim();
      }
      if (!timeStr || timeStr === '0:00' || timeStr === '00:00') continue;
      
      // 発表時刻が現在より前かチェック
      // 前日分（isYesterday）は時刻に関係なく全て発表済み
      var eventHour = timeHour;
      var eventMin  = timeMin;
      if (!(rawTime instanceof Date)) {
        // テキスト型の場合はparseIntで取得
        var timeParts = timeStr.split(':');
        eventHour = parseInt(timeParts[0], 10);
        eventMin  = parseInt(timeParts[1] || '0', 10);
      }
      var isAnnounced = isYesterday
        || (nowHour > eventHour)
        || (nowHour === eventHour && nowMin >= eventMin);
      if (!isAnnounced) continue;
      
      // I列が空またはエラーのものだけ対象
      var resultCell = (lastCol >= 9) ? data[i][8] : null;
      var hasResult = resultCell && String(resultCell).trim() !== '' && String(resultCell).trim() !== '取得失敗';
      if (hasResult) continue;
      
      var importance = String(data[i][6] || '').trim();
      if (importance !== '高' && importance !== '中') continue;
      
      targets.push({
        rowIndex: i + 2,
        date: dateStr,
        time: timeStr,
        country: String(data[i][2] || '').trim(),
        name: String(data[i][3] || '').trim(),
        previous: String(data[i][4] || '').trim(),
        forecast: String(data[i][5] || '').trim(),
        importance: importance
      });
    }
    
    if (targets.length === 0) {
      console.log('📊 今日の発表済み指標（未記入）: なし');
      return;
    }
    
    console.log('📊 今日の発表済み指標取得: ' + targets.length + '件');
    for (var d = 0; d < targets.length; d++) {
      console.log('  ' + (d + 1) + '. ' + targets[d].time + ' ' + targets[d].name);
    }
    
    // Gemini+Groundingで結果を検索（buildIndicatorResultPrompt_を流用）
    var prompt = buildIndicatorResultPrompt_(targets, today);
    var result = callGemini_(prompt, geminiApiKey, true);
    
    if (!result || !result.text) {
      console.log('⚠️ 今日分: Gemini応答なし → スキップ');
      return;
    }
    
    var parsed = parseIndicatorResults_(result.text);
    if (!parsed || parsed.length === 0) {
      console.log('⚠️ 今日分: JSON解析失敗 → スキップ');
      return;
    }
    
    // I列・J列に書き込み（writeIndicatorResults_を流用）
    writeIndicatorResults_(spreadsheetId, targets, parsed);
    console.log('📊 今日の発表済み指標をシートに書き込みました');
    
  } catch (e) {
    console.log('⚠️ 今日分指標取得エラー（スキップ）: ' + e.message);
  }
}

// ===== メイン: 前日の経済指標結果を取得してシートに書き込み =====
// MORNING生成の冒頭で呼び出し。注入テキストを返す。
function fetchIndicatorResults_(spreadsheetId, geminiApiKey) {
  try {
    // Step 1: 対象日を決定（月曜なら金曜）
    var targetDate = getIndicatorTargetDate_();
    var targetStr = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy/MM/dd');
    console.log('📊 指標結果取得: 対象日 = ' + targetStr);
    
    // Step 2: 経済カレンダーから対象指標を取得
    var indicators = getYesterdayIndicators_(spreadsheetId, targetDate);
    
    if (!indicators || indicators.length === 0) {
      console.log('📊 対象の重要指標なし → スキップ');
      return null;
    }
    
    console.log('📊 対象指標: ' + indicators.length + '件');
    for (var d = 0; d < indicators.length; d++) {
      console.log('  ' + (d + 1) + '. ' + indicators[d].name + '（予想: ' + indicators[d].forecast + '）');
    }
    
    // Step 3: Gemini+Groundingで結果を検索
    var prompt = buildIndicatorResultPrompt_(indicators, targetDate);
    var result = callGemini_(prompt, geminiApiKey, true);
    
    if (!result || !result.text) {
      console.log('⚠️ Gemini API応答なし → スキップ');
      return null;
    }
    
    console.log('📊 Gemini応答取得成功');
    
    // Step 4: JSONパース
    var parsed = parseIndicatorResults_(result.text);
    
    if (!parsed || parsed.length === 0) {
      console.log('⚠️ JSON解析失敗 → 生テキストをログ出力');
      console.log(result.text.substring(0, 500));
      return null;
    }
    
    console.log('📊 解析成功: ' + parsed.length + '件');
    
    // Step 5: シートに書き込み
    writeIndicatorResults_(spreadsheetId, indicators, parsed);
    
    // Step 6: MORNING注入用テキストを生成
    var reviewText = formatIndicatorReview_(indicators, parsed);
    if (reviewText) {
      console.log('📊 指標結果注入テキスト生成完了');
    }
    
    return reviewText;
    
  } catch (e) {
    console.log('⚠️ 指標結果取得エラー（スキップ）: ' + e.message);
    return null;
  }
}

// ===== 対象日を決定（月曜なら金曜を返す） =====
function getIndicatorTargetDate_() {
  var now = new Date();
  var dow = now.getDay(); // 0=日, 1=月, 2=火, ...
  
  if (dow === 1) {
    // 月曜日 → 金曜日の指標を検索
    var fri = new Date(now);
    fri.setDate(fri.getDate() - 3);
    return fri;
  }
  if (dow === 0) {
    // 日曜日 → 金曜日の指標を検索（WEEKLY_REVIEWで使う可能性）
    var fri2 = new Date(now);
    fri2.setDate(fri2.getDate() - 2);
    return fri2;
  }
  // 火〜土 → 昨日
  var yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday;
}

// ===== 経済カレンダーから対象日の重要指標を取得 =====
function getYesterdayIndicators_(spreadsheetId, targetDate) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName('経済カレンダー');
  
  if (!sheet || sheet.getLastRow() < 2) return [];
  
  // 列数を動的に取得（I列J列が追加されている場合は10列）
  var lastCol = Math.min(sheet.getLastColumn(), 10);
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
  
  var targetStr = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy/MM/dd');
  var results = [];
  
  for (var i = 0; i < data.length; i++) {
    if (!data[i][0] || !data[i][3]) continue; // 日付・指標名なしはスキップ
    
    var eventDate = new Date(data[i][0]);
    var dateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'yyyy/MM/dd');
    var importance = String(data[i][6] || '').trim(); // G列: 重要度
    
    // I列（結果）が既に記入済みならスキップ（0-indexed = 8）
    var resultCell = (lastCol >= 9) ? data[i][8] : null;
    var hasResult = resultCell && String(resultCell).trim() !== '' && String(resultCell).trim() !== '取得失敗';
    
    // 日付一致 + 重要度が高or中 + 結果が未記入
    if (dateStr === targetStr &&
        (importance === '高' || importance === '中') &&
        !hasResult) {
      results.push({
        rowIndex: i + 2, // シートの行番号（1-indexed、ヘッダー分+1）
        date: dateStr,
        time: String(data[i][1] || '').trim(),
        country: String(data[i][2] || '').trim(),
        name: String(data[i][3] || '').trim(),
        previous: String(data[i][4] || '').trim(),
        forecast: String(data[i][5] || '').trim(),
        importance: importance
      });
    }
  }
  
  return results;
}

// ===== 指標名を英語に変換（部分一致） =====
function getEnglishIndicatorName_(jaName, country) {
  var keys = Object.keys(INDICATOR_NAME_MAP);
  for (var i = 0; i < keys.length; i++) {
    if (jaName.indexOf(keys[i]) !== -1) {
      return INDICATOR_NAME_MAP[keys[i]];
    }
  }
  return jaName; // マップにない場合はそのまま
}

// ===== Gemini+Grounding用プロンプトを構築 =====
function buildIndicatorResultPrompt_(indicators, targetDate) {
  var dateStrEn = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'MMMM d, yyyy');
  var dateStrJa = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy年M月d日');
  
  var prompt = '';
  prompt += '金融市場のデータアナリストとして、以下の経済指標について\n';
  prompt += dateStrJa + '（' + dateStrEn + '）に発表された結果（実績値）を\n';
  prompt += 'Google検索で正確に調べてください。\n\n';
  
  prompt += '【厳守ルール】\n';
  prompt += '- 確認できない値は必ずnullと回答。絶対に値を捏造しない。\n';
  prompt += '- 数値は小数点表記で返す（例: 3.5%なら "3.5"、51.2なら "51.2"）\n';
  prompt += '- 前回値の修正（revised）があれば revised_previous に記載\n';
  prompt += '- 金利決定は「据え置き」「0.25%利下げ」等のテキストで回答\n';
  prompt += '- 要人発言はactualをnullとし、noteに一文要約を記載\n';
  prompt += '- 最新の予想値（コンセンサス）がシートの予想と異なる場合は latest_forecast に記載\n\n';
  
  prompt += '【検索すべきソース】\n';
  prompt += '- Reuters, Bloomberg, Trading Economics, Investing.com\n';
  prompt += '- BLS.gov（米雇用統計/CPI）, ISM公式（ISM指数）\n';
  prompt += '- 日銀公式, NHK, 日経新聞（日本の指標）\n\n';
  
  prompt += '【対象指標】\n';
  for (var i = 0; i < indicators.length; i++) {
    var ind = indicators[i];
    var enName = getEnglishIndicatorName_(ind.name, ind.country);
    prompt += (i + 1) + '. ';
    if (enName !== ind.name) {
      prompt += enName + ' (' + ind.name + ')';
    } else {
      prompt += ind.name;
    }
    prompt += ' [' + ind.country + ']';
    if (ind.forecast) prompt += ' - 予想: ' + ind.forecast;
    if (ind.previous) prompt += ', 前回: ' + ind.previous;
    prompt += '\n';
  }
  
  prompt += '\n【回答形式】以下のJSON配列のみで回答してください。他のテキストは一切不要。\n';
  prompt += '```json\n[\n';
  for (var j = 0; j < indicators.length; j++) {
    prompt += '  {"index": ' + (j + 1) + ', "actual": "数値またはnull", "unit": "単位", "note": "備考またはnull", "revised_previous": "修正値またはnull", "latest_forecast": "最新予想またはnull"}';
    if (j < indicators.length - 1) prompt += ',';
    prompt += '\n';
  }
  prompt += ']\n```\n';
  
  return prompt;
}

// ===== Geminiの応答からJSONを解析 =====
function parseIndicatorResults_(rawText) {
  try {
    var jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    var jsonStr = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
    
    var startIdx = jsonStr.indexOf('[');
    var endIdx = jsonStr.lastIndexOf(']');
    
    if (startIdx === -1 || endIdx === -1) {
      console.log('⚠️ JSON配列が見つからない');
      return null;
    }
    
    jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    var parsed = JSON.parse(jsonStr);
    
    if (!Array.isArray(parsed)) {
      console.log('⚠️ 配列ではない');
      return null;
    }
    
    return parsed;
    
  } catch (e) {
    console.log('⚠️ JSON解析エラー: ' + e.message);
    return null;
  }
}

// ===== 解析結果をシートに書き込み =====
function writeIndicatorResults_(spreadsheetId, indicators, parsed) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet) return;
    
    for (var i = 0; i < indicators.length; i++) {
      var ind = indicators[i];
      var matchedResult = findMatchedResult_(parsed, i);
      
      if (matchedResult) {
        var actual = matchedResult.actual;
        var note = matchedResult.note || '';
        
        // I列（9列目）に結果を書き込み（単位があれば結合）
        if (actual !== null && actual !== undefined && actual !== 'null' && String(actual).trim() !== '') {
          var unit = (matchedResult.unit && matchedResult.unit !== 'null') ? String(matchedResult.unit).trim() : '';
          var actualWithUnit = String(actual);
          // 単位が予想値にも含まれていれば付与。%・円・ドル・万件・万人・億ドル等
          if (unit && actualWithUnit.indexOf(unit) === -1) {
            actualWithUnit = actualWithUnit + unit;
          }
          sheet.getRange(ind.rowIndex, 9).setValue(actualWithUnit);
          console.log('  ✅ ' + ind.name + ': 結果 = ' + actualWithUnit);
        } else if (note && note !== 'null') {
          sheet.getRange(ind.rowIndex, 9).setValue(note);
          console.log('  ✅ ' + ind.name + ': ' + note);
        } else {
          sheet.getRange(ind.rowIndex, 9).setValue('取得失敗');
          console.log('  ⚠️ ' + ind.name + ': 取得失敗');
        }
        
        // J列（10列目）に判定を書き込み
        var forecastForJudge = ind.forecast;
        if (matchedResult.latest_forecast && matchedResult.latest_forecast !== 'null') {
          forecastForJudge = matchedResult.latest_forecast;
        }
        var judgment = judgeDeviation_(forecastForJudge, actual);
        if (judgment) {
          sheet.getRange(ind.rowIndex, 10).setValue(judgment);
        }
        
      } else {
        sheet.getRange(ind.rowIndex, 9).setValue('取得失敗');
        console.log('  ⚠️ ' + ind.name + ': マッチする結果なし');
      }
    }
    
    console.log('📊 シート書き込み完了');
    
  } catch (e) {
    console.log('⚠️ シート書き込みエラー: ' + e.message);
  }
}

// ===== 解析結果と指標をマッチング =====
function findMatchedResult_(parsed, indicatorIndex) {
  if (!parsed || !Array.isArray(parsed)) return null;
  
  for (var i = 0; i < parsed.length; i++) {
    if (parsed[i].index === indicatorIndex + 1) {
      return parsed[i];
    }
  }
  
  // indexがない場合は配列の位置で対応
  if (indicatorIndex < parsed.length) {
    return parsed[indicatorIndex];
  }
  
  return null;
}

// ===== 予想 vs 結果の判定 =====
// ★v5.9.3: 逆指標リスト（数字が小さいほど良い指標）
// 失業率、新規失業保険申請件数など「下がる＝改善」の指標
var REVERSE_INDICATORS = [
  '失業率', '失業保険', '新規失業', 'Unemployment',
  '貿易赤字', '財政赤字'
];

/**
 * ★v5.9.3: 逆指標かどうかを判定
 * @param {string} name - 指標名
 * @return {boolean} true=逆指標（数字が小さいほど良い）
 */
function isReverseIndicator_(name) {
  if (!name) return false;
  for (var i = 0; i < REVERSE_INDICATORS.length; i++) {
    if (name.indexOf(REVERSE_INDICATORS[i]) !== -1) return true;
  }
  return false;
}

function judgeDeviation_(forecast, actual) {
  if (!forecast || !actual) return '';
  
  var f = parseFloat(String(forecast).replace(/[,%]/g, ''));
  var a = parseFloat(String(actual).replace(/[,%]/g, ''));
  
  if (isNaN(f) || isNaN(a)) return '';
  
  var diff = a - f;
  var threshold = Math.max(Math.abs(f) * 0.01, 0.1);
  
  if (diff > threshold) return '上振れ';
  if (diff < -threshold) return '下振れ';
  return '一致';
}

// ===== MORNING投稿用の注入テキストを生成 =====
function formatIndicatorReview_(indicators, parsed) {
  var lines = [];
  var hasData = false;
  
  for (var i = 0; i < indicators.length; i++) {
    var ind = indicators[i];
    var result = findMatchedResult_(parsed, i);
    if (!result) continue;
    
    var actual = result.actual;
    var note = result.note || '';
    
    var forecast = ind.forecast;
    if (result.latest_forecast && result.latest_forecast !== 'null') {
      forecast = result.latest_forecast;
    }
    
    if (actual !== null && actual !== undefined && actual !== 'null' && String(actual).trim() !== '') {
      var judgment = judgeDeviation_(forecast, actual);
      var reverse = isReverseIndicator_(ind.name);
      
      // ★v5.9.3: 逆指標の場合は解釈を反転して明示
      var interpretText = '';
      if (judgment === '上振れ') {
        interpretText = reverse
          ? '（上振れ = 悪化。この通貨の売り要因）'
          : '（上振れ = この通貨の買い要因）';
      } else if (judgment === '下振れ') {
        interpretText = reverse
          ? '（下振れ = 改善。この通貨の買い要因）'
          : '（下振れ = この通貨の売り要因）';
      } else {
        interpretText = '（一致）';
      }
      
      lines.push('  ' + ind.name + ': 予想' + forecast + ' → 結果' + actual + interpretText);
      hasData = true;
    } else if (note && note !== 'null') {
      lines.push('  ' + ind.name + ': ' + note);
      hasData = true;
    }
  }
  
  if (!hasData) return null;
  
  var header = '【前日の経済指標結果（この情報のみ使え。捏造するな）】\n';
  var footer = '\n';
  footer += '  ※ 上記の（買い要因）（売り要因）の判定をそのまま信じろ。自分で再解釈するな。\n';
  footer += '  ※ 特に失業率は「数字が下がる＝改善＝買い要因」だ。数字が下がったのに「悪化」と書くな。\n';
  footer += '  ※ 指標結果と上の【レートの方向性】を組み合わせて「なぜ動いたか」を説明しろ。\n';
  footer += '  ※ 結果の数値は上記のとおり正確に使え（Gemini自身で検索し直すな）。\n';
  footer += '  ※ 前回値の修正（revised）があった場合はそれも重要な材料。\n\n';
  
  return header + lines.join('\n') + '\n' + footer;
}


// ========================================
// ★v5.7 Layer 2,3: 蓄積データの活用（過去実績・トレンド分析）
// 「忘れない。感情に流されない。毎日少しずつ賢くなる。」
// ========================================

// ===== 共通: 過去の指標結果を検索する「記憶の引き出し」 =====
/**
 * @param {string} spreadsheetId
 * @param {Object} options - indicatorName, dateFrom, dateTo, importanceFilter, maxResults
 * @return {Array} [{date, name, country, forecast, actual, judgment, importance}, ...]
 */
function getIndicatorHistory_(spreadsheetId, options) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet || sheet.getLastRow() < 2) return [];
    
    var lastCol = Math.min(sheet.getLastColumn(), 10);
    if (lastCol < 9) return []; // I列がなければ空
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    var results = [];
    
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue;
      
      var actual = (lastCol >= 9) ? String(data[i][8] || '').trim() : '';
      if (!actual || actual === '取得失敗') continue;
      
      var eventDate = new Date(data[i][0]);
      var dateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'yyyy/MM/dd');
      var name = String(data[i][3]).trim();
      var importance = String(data[i][6] || '').trim();
      
      // フィルタ: 指標名（部分一致）
      if (options.indicatorName) {
        if (name.indexOf(options.indicatorName) === -1) continue;
      }
      
      // フィルタ: 日付範囲
      if (options.dateFrom) {
        var fromStr = Utilities.formatDate(options.dateFrom, 'Asia/Tokyo', 'yyyy/MM/dd');
        if (dateStr < fromStr) continue;
      }
      if (options.dateTo) {
        var toStr = Utilities.formatDate(options.dateTo, 'Asia/Tokyo', 'yyyy/MM/dd');
        if (dateStr > toStr) continue;
      }
      
      // フィルタ: 重要度
      if (options.importanceFilter && options.importanceFilter.length > 0) {
        if (options.importanceFilter.indexOf(importance) === -1) continue;
      }
      
      var judgment = (lastCol >= 10) ? String(data[i][9] || '').trim() : '';
      
      results.push({
        date: dateStr,
        time: String(data[i][1] || '').trim(),
        country: String(data[i][2] || '').trim(),
        name: name,
        previous: String(data[i][4] || '').trim(),
        forecast: String(data[i][5] || '').trim(),
        actual: actual,
        judgment: judgment,
        importance: importance
      });
    }
    
    // 日付の新しい順にソート
    results.sort(function(a, b) {
      return b.date.localeCompare(a.date);
    });
    
    if (options.maxResults) {
      results = results.slice(0, options.maxResults);
    }
    
    return results;
  } catch (e) {
    console.log('⚠️ getIndicatorHistory_ エラー: ' + e.message);
    return [];
  }
}

// ===== Layer 2: INDICATOR投稿用 - 今日の指標の「過去実績」を注入 =====
function formatIndicatorPreview_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('経済カレンダー');
    if (!sheet || sheet.getLastRow() < 2) return null;
    
    var now = new Date();
    var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd');
    var lastCol = Math.min(sheet.getLastColumn(), 10);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();
    
    // 今日の重要指標を取得
    var todayIndicators = [];
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue;
      var dateStr = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'yyyy/MM/dd');
      var importance = String(data[i][6] || '').trim();
      if (dateStr === todayStr && importance === '高') {
        todayIndicators.push(String(data[i][3]).trim());
      }
    }
    
    if (todayIndicators.length === 0) return null;
    
    var lines = [];
    lines.push('【今日の指標 過去の実績（システムの記憶。忘れるな。捏造するな。）】');
    
    for (var t = 0; t < todayIndicators.length; t++) {
      var indicatorName = todayIndicators[t];
      
      var history = getIndicatorHistory_(spreadsheetId, {
        indicatorName: indicatorName,
        maxResults: 3,
        importanceFilter: ['高', '中']
      });
      
      if (history.length === 0) {
        lines.push('');
        lines.push('■ ' + indicatorName + ': 過去データなし（初回取得）');
        continue;
      }
      
      lines.push('');
      lines.push('■ ' + indicatorName + '（過去' + history.length + '回）');
      
      var upCount = 0, downCount = 0, matchCount = 0;
      
      for (var h = 0; h < history.length; h++) {
        var rec = history[h];
        var line = '  ・' + rec.date + ': 予想' + rec.forecast + ' → 結果' + rec.actual;
        if (rec.judgment) {
          line += '（' + rec.judgment + '）';
          if (rec.judgment === '上振れ') upCount++;
          else if (rec.judgment === '下振れ') downCount++;
          else matchCount++;
        }
        lines.push(line);
      }
      
      // パターン分析
      if (history.length >= 2) {
        var pattern = '  → パターン: 直近' + history.length + '回中 ';
        var parts = [];
        if (upCount > 0) parts.push(upCount + '回上振れ');
        if (downCount > 0) parts.push(downCount + '回下振れ');
        if (matchCount > 0) parts.push(matchCount + '回一致');
        pattern += parts.join('、');
        
        if (upCount > downCount) {
          pattern += '。上振れ傾向。市場は上振れを警戒している可能性。';
        } else if (downCount > upCount) {
          pattern += '。下振れ傾向。市場の期待が高すぎる可能性。';
        }
        lines.push(pattern);
      }
    }
    
    lines.push('');
    lines.push('※ 上記は過去の事実。この実績を踏まえて「今回はどうなりそうか」のシナリオを書け。');
    lines.push('※ 「前回も上振れたから今回も上振れる」とは限らない。ただし市場心理には影響する。');
    lines.push('');
    
    return lines.join('\n');
  } catch (e) {
    console.log('⚠️ formatIndicatorPreview_ エラー: ' + e.message);
    return null;
  }
}

// ===== Layer 3.5: WEEKLY_REVIEW用 - 今週の主要ペア週間レートトレンド（日次OHLC版）=====
// 日次レートシートのOHLCから今週の各日の動きを集計し、方向性・ドラマを事実として渡す
function formatWeeklyRateTrend_(spreadsheetId, rates) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(spreadsheetId || keys.SPREADSHEET_ID);

    // 今週月曜〜今日の日付範囲を算出
    var now = new Date();
    var dayOfWeek = now.getDay(); // 0=日, 1=月, ...
    var weekStartDate = new Date(now);
    weekStartDate.setDate(weekStartDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    var weekStartStr = Utilities.formatDate(weekStartDate, 'Asia/Tokyo', 'yyyy-MM-dd');
    var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');

    // 日次レートシート読み込み（A=日付, 各ペア4列: 始値/高値/安値/終値）
    var dailySheet = ss.getSheetByName('日次レート');
    if (!dailySheet || dailySheet.getLastRow() < 2) return null;
    var numCols = 1 + CURRENCY_PAIRS.length * 4 + 1;
    var dailyData = dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, numCols).getValues();

    // 対象ペア（主要3ペアのみ: ドル円・ユーロドル・ポンドドル）
    var targetPairs = [
      { idx: 0, label: 'ドル円',     unit: '円',  digits: 2, jpyPair: true  },
      { idx: 1, label: 'ユーロドル', unit: 'ドル', digits: 4, jpyPair: false },
      { idx: 2, label: 'ポンドドル', unit: 'ドル', digits: 4, jpyPair: false }
    ];
    var dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    // 今週の日次データを収集
    var weekRows = [];
    for (var i = 0; i < dailyData.length; i++) {
      var rowDate = dailyData[i][0];
      var dateStr = (rowDate instanceof Date)
        ? Utilities.formatDate(rowDate, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(rowDate).substring(0, 10);
      if (dateStr < weekStartStr || dateStr > todayStr) continue;
      var d = (rowDate instanceof Date) ? rowDate : new Date(rowDate);
      weekRows.push({ dateStr: dateStr, dayName: dayNames[d.getDay()], row: dailyData[i] });
    }

    if (weekRows.length === 0) return null;
    weekRows.sort(function(a, b) { return a.dateStr < b.dateStr ? -1 : 1; });

    var lines = [];
    lines.push('【今週の主要ペア週間トレンド（事実データ。通貨の方向性を正確に反映せよ）】');
    lines.push('※ 日次レートOHLCから自動算出。このデータが事実。感覚・印象で上書き禁止。');
    lines.push('');

    for (var p = 0; p < targetPairs.length; p++) {
      var cfg = targetPairs[p];
      var colBase = 1 + cfg.idx * 4; // colBase+0=始値, +1=高値, +2=安値, +3=終値

      var weekOpen  = Number(weekRows[0].row[colBase]);
      var weekClose = rates && rates[CURRENCY_PAIRS[cfg.idx].key]
                    ? Number(rates[CURRENCY_PAIRS[cfg.idx].key])
                    : Number(weekRows[weekRows.length - 1].row[colBase + 3]);

      var weekHigh = 0, weekLow = 999999;
      for (var r = 0; r < weekRows.length; r++) {
        var h = Number(weekRows[r].row[colBase + 1]);
        var l = Number(weekRows[r].row[colBase + 2]);
        if (h > weekHigh) weekHigh = h;
        if (l < weekLow)  weekLow  = l;
      }

      var weekChange = weekClose - weekOpen;
      var changeStr  = (weekChange >= 0 ? '+' : '') + weekChange.toFixed(cfg.digits);
      var pips = cfg.jpyPair
               ? Math.round(Math.abs(weekChange) * 100)
               : Math.round(Math.abs(weekChange) * 10000);
      var range = weekHigh - weekLow;
      var rangeStr = cfg.jpyPair
               ? Math.round(range * 100) + 'pips'
               : Math.round(range * 10000) + 'pips';

      var direction = '';
      if (cfg.jpyPair) {
        direction = weekChange > 0.1 ? 'ドル買い・円売り（ドル円上昇）'
                  : weekChange < -0.1 ? 'ドル売り・円買い（ドル円下落）'
                  : 'レンジ（方向感なし）';
      } else {
        var baseCcy = cfg.label.replace('ドル', '');
        direction = weekChange > 0.001 ? baseCcy + '買い・ドル売り（' + cfg.label + '上昇）'
                  : weekChange < -0.001 ? baseCcy + '売り・ドル買い（' + cfg.label + '下落）'
                  : 'レンジ（方向感なし）';
      }

      var dailySummary = [];
      for (var r2 = 0; r2 < weekRows.length; r2++) {
        var open2  = Number(weekRows[r2].row[colBase]);
        var close2 = Number(weekRows[r2].row[colBase + 3]);
        var diff   = close2 - open2;
        var arrow  = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        dailySummary.push(weekRows[r2].dayName + '曜' + arrow + close2.toFixed(cfg.digits));
      }

      lines.push('■ ' + cfg.label);
      lines.push('  週始（月曜）: ' + weekOpen.toFixed(cfg.digits) + cfg.unit
               + ' → 現在: ' + weekClose.toFixed(cfg.digits) + cfg.unit
               + '（' + changeStr + cfg.unit + ' / ' + pips + 'pips）');
      lines.push('  週間レンジ: ' + weekLow.toFixed(cfg.digits) + '〜' + weekHigh.toFixed(cfg.digits) + cfg.unit
               + '（' + rangeStr + '）');
      lines.push('  日次推移: ' + dailySummary.join(' → '));
      lines.push('  今週の方向性: ' + direction);
      lines.push('');
    }

    lines.push('⚠️ 上記と矛盾する表現（例: ドル円上昇週なのに「円が買われた」等）は絶対禁止。');
    lines.push('');
    return lines.join('\n');

  } catch (e) {
    console.log('⚠️ formatWeeklyRateTrend_ エラー: ' + e.message);
    return null;
  }
}


// ===== Layer 3: WEEKLY_REVIEW用 - 今週の全指標結果サマリー =====
function formatWeeklyIndicatorSummary_(spreadsheetId) {
  try {
    var now = new Date();
    var dow = now.getDay();
    var mondayOffset = (dow === 0) ? -6 : 1 - dow;
    var monday = new Date(now);
    monday.setDate(monday.getDate() + mondayOffset);
    
    var history = getIndicatorHistory_(spreadsheetId, {
      dateFrom: monday,
      dateTo: now,
      importanceFilter: ['高', '中']
    });
    
    if (!history || history.length === 0) return null;
    
    var lines = [];
    lines.push('【今週の指標結果サマリー（システムの正確な記録。これだけが事実。）】');
    
    var upCount = 0, downCount = 0, matchCount = 0;
    
    for (var i = 0; i < history.length; i++) {
      var rec = history[i];
      var emoji = '';
      if (rec.judgment === '上振れ') { emoji = '📈'; upCount++; }
      else if (rec.judgment === '下振れ') { emoji = '📉'; downCount++; }
      else if (rec.judgment === '一致') { emoji = '➡️'; matchCount++; }
      else { emoji = '📊'; }
      
      lines.push('  ' + emoji + ' ' + rec.date + ' ' + rec.name + ': 予想' + rec.forecast + ' → 結果' + rec.actual);
    }
    
    var total = upCount + downCount + matchCount;
    if (total >= 2) {
      lines.push('');
      lines.push('  今週の集計: ' + total + '件中 上振れ' + upCount + '件 / 下振れ' + downCount + '件 / 一致' + matchCount + '件');
      
      if (upCount > downCount && upCount > matchCount) {
        lines.push('  → 今週は上振れ優勢。景気の底堅さ or インフレの粘着性が示された週。');
      } else if (downCount > upCount && downCount > matchCount) {
        lines.push('  → 今週は下振れ優勢。景気減速 or インフレ鈍化のシグナル。');
      } else {
        lines.push('  → 今週は強弱混在。方向感が出にくい週だった。');
      }
    }
    
    lines.push('');
    lines.push('※ この事実だけを使って週の総括を書け。記載にない指標結果は捏造するな。');
    lines.push('');
    
    return lines.join('\n');
  } catch (e) {
    console.log('⚠️ formatWeeklyIndicatorSummary_ エラー: ' + e.message);
    return null;
  }
}

// ===== Layer 3: MORNING用 - 直近1ヶ月の指標トレンド =====
function formatIndicatorTrend_(spreadsheetId) {
  try {
    var now = new Date();
    var oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    var history = getIndicatorHistory_(spreadsheetId, {
      dateFrom: oneMonthAgo,
      dateTo: now,
      importanceFilter: ['高']
    });
    
    if (!history || history.length < 3) return null;
    
    // カテゴリ別に分類
    var categories = {
      '物価系': { keywords: ['CPI', '消費者物価', 'PCE', 'PPI', '物価', 'デフレーター'], up: 0, down: 0, match: 0 },
      '雇用系': { keywords: ['雇用', '失業', 'ADP', 'JOLTS', 'NFP', '時給'], up: 0, down: 0, match: 0 },
      '景況感系': { keywords: ['ISM', 'PMI', '信頼感', 'ミシガン', '景況'], up: 0, down: 0, match: 0 },
      'その他': { keywords: [], up: 0, down: 0, match: 0 }
    };
    
    var totalUp = 0, totalDown = 0, totalMatch = 0;
    
    for (var i = 0; i < history.length; i++) {
      var rec = history[i];
      var categorized = false;
      
      var catKeys = Object.keys(categories);
      for (var c = 0; c < catKeys.length - 1; c++) {
        var cat = categories[catKeys[c]];
        for (var k = 0; k < cat.keywords.length; k++) {
          if (rec.name.indexOf(cat.keywords[k]) !== -1) {
            if (rec.judgment === '上振れ') { cat.up++; totalUp++; }
            else if (rec.judgment === '下振れ') { cat.down++; totalDown++; }
            else { cat.match++; totalMatch++; }
            categorized = true;
            break;
          }
        }
        if (categorized) break;
      }
      
      if (!categorized) {
        if (rec.judgment === '上振れ') { categories['その他'].up++; totalUp++; }
        else if (rec.judgment === '下振れ') { categories['その他'].down++; totalDown++; }
        else { categories['その他'].match++; totalMatch++; }
      }
    }
    
    var total = totalUp + totalDown + totalMatch;
    if (total < 3) return null;
    
    var lines = [];
    lines.push('【直近1ヶ月の指標トレンド（システムの記憶。感情ではなくデータで語れ。）】');
    lines.push('  全' + total + '件: 上振れ' + totalUp + ' / 下振れ' + totalDown + ' / 一致' + totalMatch);
    
    var catKeys2 = Object.keys(categories);
    for (var c2 = 0; c2 < catKeys2.length; c2++) {
      var catName = catKeys2[c2];
      var cat2 = categories[catName];
      var catTotal = cat2.up + cat2.down + cat2.match;
      if (catTotal === 0) continue;
      
      var trend = '';
      if (cat2.up > cat2.down) trend = '→ 上振れ傾向';
      else if (cat2.down > cat2.up) trend = '→ 下振れ傾向';
      else trend = '→ 混在';
      
      lines.push('  ' + catName + ': 上振れ' + cat2.up + ' / 下振れ' + cat2.down + ' / 一致' + cat2.match + ' ' + trend);
    }
    
    lines.push('');
    if (totalUp > totalDown * 1.5) {
      lines.push('  全体: 指標は上振れ基調。景気の底堅さ or インフレの粘着性が続いている。');
    } else if (totalDown > totalUp * 1.5) {
      lines.push('  全体: 指標は下振れ基調。景気減速のサインが出始めている。');
    } else {
      lines.push('  全体: 強弱混在。市場は方向感を探っている段階。');
    }
    lines.push('');
    
    return lines.join('\n');
  } catch (e) {
    console.log('⚠️ formatIndicatorTrend_ エラー: ' + e.message);
    return null;
  }
}


// ========================================
// サマリー更新（レートキャッシュ → レートサマリーに書き込み）
// ========================================

// 毎朝1回実行（朝の投稿前、またはスケジューラーから呼び出し）
function updatePriceSummary() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // ===== データソース1: 日次レート（OHLC集約済み、長期データ） =====
  var dailySheet = ss.getSheetByName('日次レート');
  var dailyData = [];
  var numDailyCols = 1 + CURRENCY_PAIRS.length * 4 + 1;
  if (dailySheet && dailySheet.getLastRow() >= 2) {
    dailyData = dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, numDailyCols).getValues();
  }
  
  // ===== データソース2: レートキャッシュ（今日のリアルタイムデータ） =====
  var cacheSheet = ss.getSheetByName('レートキャッシュ');
  var cacheData = [];
  var numCacheCols = 1 + CURRENCY_PAIRS.length + 2;
  if (cacheSheet && cacheSheet.getLastRow() >= 2) {
    cacheData = cacheSheet.getRange(2, 1, cacheSheet.getLastRow() - 1, numCacheCols).getValues();
  }
  
  if (dailyData.length === 0 && cacheData.length === 0) {
    console.log('⚠️ データがありません');
    return;
  }
  
  // 日付計算（文字列ベースで比較 - タイムゾーンずれ防止）
  var now = new Date();
  var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = Utilities.formatDate(yesterday, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  // 今週月曜
  var dayOfWeek = now.getDay(); // 0=日, 1=月, ...
  var weekStartDate = new Date(now);
  weekStartDate.setDate(weekStartDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  var weekStartStr = Utilities.formatDate(weekStartDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var lastWeekStartDate = new Date(weekStartDate); lastWeekStartDate.setDate(lastWeekStartDate.getDate() - 7);
  var lastWeekStartStr = Utilities.formatDate(lastWeekStartDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var twoWeeksAgoDate = new Date(weekStartDate); twoWeeksAgoDate.setDate(twoWeeksAgoDate.getDate() - 14);
  var twoWeeksAgoStr = Utilities.formatDate(twoWeeksAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  // 月初
  var monthStartStr = todayStr.substring(0, 8) + '01';
  var lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var lastMonthStartStr = Utilities.formatDate(lastMonthDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var threeMonthsAgoDate = new Date(now); threeMonthsAgoDate.setMonth(threeMonthsAgoDate.getMonth() - 3);
  var threeMonthsAgoStr = Utilities.formatDate(threeMonthsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var sixMonthsAgoDate = new Date(now); sixMonthsAgoDate.setMonth(sixMonthsAgoDate.getMonth() - 6);
  var sixMonthsAgoStr = Utilities.formatDate(sixMonthsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var yearStartStr = todayStr.substring(0, 5) + '01-01';
  
  var oneYearAgoDate = new Date(now); oneYearAgoDate.setFullYear(oneYearAgoDate.getFullYear() - 1);
  var oneYearAgoStr = Utilities.formatDate(oneYearAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var twoYearsAgoDate = new Date(now); twoYearsAgoDate.setFullYear(twoYearsAgoDate.getFullYear() - 2);
  var twoYearsAgoStr = Utilities.formatDate(twoYearsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var threeYearsAgoDate = new Date(now); threeYearsAgoDate.setFullYear(threeYearsAgoDate.getFullYear() - 3);
  var threeYearsAgoStr = Utilities.formatDate(threeYearsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var fiveYearsAgoDate = new Date(now); fiveYearsAgoDate.setFullYear(fiveYearsAgoDate.getFullYear() - 5);
  var fiveYearsAgoStr = Utilities.formatDate(fiveYearsAgoDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  // 期間定義（from以上 to未満 の文字列比較）
  var periods = [
    { label: '昨日', from: yesterdayStr, to: todayStr },
    { label: '今週', from: weekStartStr, to: '9999-12-31' },
    { label: '先週', from: lastWeekStartStr, to: weekStartStr },
    { label: '2週前', from: twoWeeksAgoStr, to: lastWeekStartStr },
    { label: '今月', from: monthStartStr, to: '9999-12-31' },
    { label: '先月', from: lastMonthStartStr, to: monthStartStr },
    { label: '過去3ヶ月', from: threeMonthsAgoStr, to: '9999-12-31' },
    { label: '過去半年', from: sixMonthsAgoStr, to: '9999-12-31' },
    { label: '今年', from: yearStartStr, to: '9999-12-31' },
    { label: '過去1年', from: oneYearAgoStr, to: '9999-12-31' },
    { label: '過去2年', from: twoYearsAgoStr, to: '9999-12-31' },
    { label: '過去3年', from: threeYearsAgoStr, to: '9999-12-31' },
    { label: '過去5年', from: fiveYearsAgoStr, to: '9999-12-31' }
  ];
  
  console.log('日付範囲デバッグ:');
  for (var pd = 0; pd < periods.length; pd++) {
    console.log('  ' + periods[pd].label + ': ' + periods[pd].from + ' 〜 ' + periods[pd].to);
  }
  
  var summaryRows = [];
  var timeStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  
  for (var p = 0; p < periods.length; p++) {
    var period = periods[p];
    
    // 各ペアのhigh/low配列を動的に作成
    var pairHighs = {};
    var pairLows = {};
    for (var pp = 0; pp < CURRENCY_PAIRS.length; pp++) {
      pairHighs[CURRENCY_PAIRS[pp].key] = [];
      pairLows[CURRENCY_PAIRS[pp].key] = [];
    }
    var dataCount = 0;
    
    // --- 日次レートから高値・安値を取得 ---
    for (var i = 0; i < dailyData.length; i++) {
      var rowDate = dailyData[i][0];
      var dateStr;
      if (rowDate instanceof Date) {
        dateStr = Utilities.formatDate(rowDate, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else {
        dateStr = String(rowDate).substring(0, 10);
      }
      
      if (dateStr >= period.from && dateStr < period.to) {
        for (var pp2 = 0; pp2 < CURRENCY_PAIRS.length; pp2++) {
          var colBase = 1 + pp2 * 4; // 高値=colBase+1, 安値=colBase+2
          var high = safeNumber_(dailyData[i][colBase + 1]);
          var low = safeNumber_(dailyData[i][colBase + 2]);
          var pair = CURRENCY_PAIRS[pp2];
          if (high > pair.min && high < pair.max) pairHighs[pair.key].push(high);
          if (low > pair.min && low < pair.max) pairLows[pair.key].push(low);
        }
        dataCount++;
      }
    }
    
    // --- レートキャッシュから今日のリアルタイムデータを補足 ---
    for (var j = 0; j < cacheData.length; j++) {
      var cacheDate = cacheData[j][0];
      var cacheDateStr;
      if (cacheDate instanceof Date) {
        cacheDateStr = Utilities.formatDate(cacheDate, 'Asia/Tokyo', 'yyyy-MM-dd');
      } else {
        cacheDateStr = String(cacheDate).substring(0, 10);
      }
      
      if (cacheDateStr >= period.from && cacheDateStr < period.to) {
        for (var pp3 = 0; pp3 < CURRENCY_PAIRS.length; pp3++) {
          var val = safeNumber_(cacheData[j][1 + pp3]);
          var cpair = CURRENCY_PAIRS[pp3];
          if (val > cpair.min && val < cpair.max) {
            pairHighs[cpair.key].push(val);
            pairLows[cpair.key].push(val);
          }
        }
        dataCount++;
      }
    }
    
    // 行データ構築: [期間, ペア1高値, ペア1安値, ペア2高値, ペア2安値, ..., データ件数, 更新日時]
    var row = [period.label];
    for (var pp4 = 0; pp4 < CURRENCY_PAIRS.length; pp4++) {
      var key = CURRENCY_PAIRS[pp4].key;
      if (pairHighs[key].length >= 1) {
        row.push(Math.max.apply(null, pairHighs[key]));
        row.push(Math.min.apply(null, pairLows[key]));
      } else {
        row.push('', '');
      }
    }
    row.push(dataCount, timeStr);
    
    summaryRows.push(row);
  }
  
  // レートサマリーシートに書き込み
  var summarySheet = ss.getSheetByName('レートサマリー');
  if (!summarySheet) {
    summarySheet = ss.insertSheet('レートサマリー');
    console.log('✅ レートサマリーシートを新規作成');
  }
  
  var headers = ['期間'];
  for (var hh = 0; hh < CURRENCY_PAIRS.length; hh++) {
    headers.push(CURRENCY_PAIRS[hh].symbol + '高値', CURRENCY_PAIRS[hh].symbol + '安値');
  }
  headers.push('データ件数', '更新日時');
  
  summarySheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  
  if (summaryRows.length > 0) {
    summarySheet.getRange(2, 1, summaryRows.length, headers.length).setValues(summaryRows);
  }
  
  console.log('✅ レートサマリー更新完了（' + summaryRows.length + '期間 × ' + CURRENCY_PAIRS.length + 'ペア）');
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
      maxOutputTokens: 1024
    }
  };
  
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
  // 許可: Trading, Complete, Fed, S&P, RSI, ADP, MBA, NFP, MACD, NZD, CHF, CAD, WTI
  // 3文字以上の英単語で許可リストにないものを除去
  text = text.replace(/\b(?!USD|JPY|EUR|GBP|AUD|NZD|CHF|CAD|CPI|GDP|FOMC|FRB|ECB|BOE|BOJ|RBA|PPI|PCE|FX|TC|PF|CSV|HICP|NY|Fed|ETF|ISM|PMI|RSI|ADP|MBA|NFP|MACD|WTI|Trading|Complete|SNS|OHLC|API)[A-Za-z]{3,}\b/g, '');
  
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

  // ★v6.0.3: →の前に改行を強制（行頭以外の→は改行して行頭にする）
  // 例: 「☕今夜は米指標ラッシュ→インフレ指標」→「☕今夜は米指標ラッシュ\n→インフレ指標」
  // ただし既に行頭にある→はスキップ
  text = text.replace(/([^\n])→/g, '$1\n→');
  
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
  
  // === レート小数点脱落の修正 ★v5.5.3 / v6.0.1拡張 ===
  // Geminiが「1.1838ドル」を「11838ドル」と書く問題を修正
  // 1XXXX形式（5桁）でドルが続く場合、小数点を挿入
  var beforeDecimal = text;
  text = text.replace(/\b(1\d{4})(ドル)/g, function(match, num, suffix) {
    return num.charAt(0) + '.' + num.substring(1) + suffix;
  });
  // ★v6.0.1: 0XXXX形式（AUD/USD等の0.7台レート）の小数点脱落も修正
  // 例: 「07068ドル」→「0.7068ドル」、「07119ドル」→「0.7119ドル」
  text = text.replace(/\b(0\d{4})(ドル)/g, function(match, num, suffix) {
    return num.charAt(0) + '.' + num.substring(1) + suffix;
  });
  if (text !== beforeDecimal) changes.push('レート小数点修正');
  
  // 「様子見」系 → 「静観」系に置換
  if (text.indexOf('様子見') !== -1) {
    text = text.replace(/様子見が賢明/g, '静観が賢明');
    text = text.replace(/様子見ムード/g, '静観ムード');
    text = text.replace(/様子見/g, '静観');
    changes.push('様子見→静観');
  }
  
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
  
  // 「見極めたい」→ 4パターンでローテーション ★v5.5.3改善
  if (text.indexOf('見極めたい') !== -1) {
    var miCount = 0;
    var miReplacements = [
      '、ここからが本番',
      'の答え合わせはこれから',
      '、結果を見届けよう',
      '次第で景色が変わるかも'
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
  // プラス方向も同様: 129% → 1.29%（本文でのパーセント変動表記）
  text = text.replace(/\b([1-9])(\d{2})([%％])/g, '$1.$2$3');
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

// ========================================
// Sheets読み込み関数（公開可能な情報源）
// ========================================

// ===== 投稿プロンプトをSheetsから取得 =====
function getPostPrompt_(postType) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('投稿プロンプト');
    
    if (!sheet) {
      console.log('⚠️ 投稿プロンプトシートが見つかりません');
      return null;
    }
    
    var data = sheet.getDataRange().getValues();
    
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === postType) {
        return {
          name: data[i][1],
          prompt: data[i][2]
        };
      }
    }
    
    console.log('⚠️ 投稿タイプが見つかりません: ' + postType);
    return null;
  } catch (e) {
    console.log('投稿プロンプト取得エラー: ' + e.message);
    return null;
  }
}

// ===== TC概要をSheetsから取得（コンパクト版） =====
function getTCOverview() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('TC概要');
    
    if (!sheet) {
      console.log('⚠️ TC概要シートが見つかりません');
      return '';
    }
    
    var data = sheet.getDataRange().getValues();
    
    // 必要な行だけ抽出（全22行を注入すると冗長すぎてGeminiが無視する）
    var keyRows = ['サービス名', 'コンセプト', '一言で言うと', '解決する課題', 
                   'ターゲット', '核心の価値', '投稿での扱い', 'URL'];
    var sections = [];
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][1]) {
        var sectionName = String(data[i][0]).trim();
        for (var k = 0; k < keyRows.length; k++) {
          if (sectionName === keyRows[k]) {
            sections.push(sectionName + ': ' + String(data[i][1]).trim());
            break;
          }
        }
      }
    }
    
    if (sections.length === 0) return '';
    
    var text = '\n\n【Trading Complete（TC）について - 投稿に自然に織り込むための参考情報】\n';
    text += sections.join('\n') + '\n';
    text += '\n【TCの主な機能（投稿内で1つだけ自然に触れろ。押し売り厳禁）】\n';
    
    // 8機能を定義
    var features = [
      'エントリー前チェックリスト: 3つの根拠（エントリー・損切り・利確）を書かないと保存できない「関所」機能',
      'リスク自動判定: 許容損失額を超えるトレードは赤警告。ロットの適正値も自動計算',
      '手法別勝率分析: どの手法が勝てているか・負けているかが一目で分かる',
      '月次カレンダー: 日別損益を緑（利益）/赤（損失）で色分け表示。勝てる曜日・負ける曜日が一目で分かる',
      '相場ノート検索: 過去のノートをキーワード検索。「去年の今頃」が瞬時に分かる',
      '期待値・PF計算: 勝率だけでなく「1トレードあたりいくら稼げるか」を自動算出',
      '経費管理・CSV出力: 確定申告用のデータが一発で出せる',
      'バッジ機能: ルール遵守・リスク判定がトレードカードにバッジとして表示される'
    ];
    
    // スクリプトプロパティで前回のインデックスを記録→順番に回す
    var props = PropertiesService.getScriptProperties();
    var lastIdx = parseInt(props.getProperty('TC_FEATURE_INDEX') || '0', 10);
    var nextIdx = (lastIdx + 1) % features.length;
    props.setProperty('TC_FEATURE_INDEX', String(nextIdx));
    
    text += '★今回はこの機能を紹介しろ → ' + features[nextIdx] + '\n';
    for (var g = 0; g < features.length; g++) {
      if (g !== nextIdx) {
        text += '・' + features[g] + '\n';
      }
    }
    text += '\n【TC導線の入れ方（自然に1箇所だけ）】\n';
    text += '・宣伝感は絶対に出さない。自分の体験→課題→TCの機能で解決、の自然な流れ\n';
    text += '・投稿の主題はあくまで市場情報や心得。TC言及は脇役として自然に添える程度\n';
    text += '・★印の機能を具体的に紹介すること（毎回違う機能になる）\n';
    text += '・OK: 「Trading Completeのリスク自動判定で、許容損失額を超えた時に警告が出る」\n';
    text += '・OK: 「手法別の勝率を分析タブで見たら、逆張りの勝率が20%台だった。封印したら収支が改善」\n';
    text += '・OK: 「月次カレンダーで赤（損失日）が並ぶ週があって、調べたら全部感情的なトレードだった」\n';
    text += '・OK: 「相場ノート検索で去年の同時期を振り返ったら、似たパターンを発見」\n';
    text += '・NG: 「記録が大事」（抽象的すぎる）\n';
    text += '・NG: 「Trading Completeで仕組み化した」（何の機能か分からない）\n';
    text += '・NG: 「ぜひ使ってください」「リンクはプロフから」（直接宣伝）\n';
    
    return text;
  } catch (e) {
    console.log('TC概要取得エラー: ' + e.message);
    return '';
  }
}

// ===== トレードスタイルをSheetsから取得 =====
function getTradeStyle_() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('トレードスタイル');
    
    if (!sheet) {
      console.log('⚠️ トレードスタイルシートが見つかりません');
      return '';
    }
    
    var data = sheet.getDataRange().getValues();
    var items = [];
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][1]) {
        items.push('・' + data[i][0] + ': ' + data[i][1]);
      }
    }
    
    return '\n\n【コンパナのトレードスタイル（この視点で見解を述べること）】\n' + items.join('\n');
  } catch (e) {
    console.log('トレードスタイル取得エラー: ' + e.message);
    return '';
  }
}

// ===== 参照ソースをSheetsから取得 =====
function getReferenceSources_() {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('参照ソース');
    
    if (!sheet) {
      console.log('⚠️ 参照ソースシートが見つかりません');
      return '';
    }
    
    var data = sheet.getDataRange().getValues();
    var items = [];
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][1]) {
        items.push('・' + data[i][0] + ' | ' + data[i][1] + '（' + data[i][3] + '）');
      }
    }
    
    var text = '\n\n【情報ソース（以下のサイトの最新情報をGoogle検索で取得すること）】\n';
    text += items.join('\n');
    
    return text;
  } catch (e) {
    console.log('参照ソース取得エラー: ' + e.message);
    return '';
  }
}

// ===== 経済カレンダーをSheetsから取得 =====
/**
 * 「経済カレンダー」シートから今日〜来週末の指標を取得
 * シート構成: A=日付, B=時間(JST), C=国/地域, D=指標名, E=前回, F=予想, G=重要度(高/中/低), H=備考
 * 
 * @param {string} scope - 'today'（今日のみ）, 'this_week'（今週）, 'next_week'（来週）, 'all'（今日〜来週末）
 * @return {string} プロンプト注入用テキスト
 */
function getEconomicCalendar_(scope) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('経済カレンダー');
    
    if (!sheet || sheet.getLastRow() < 2) {
      console.log('⚠️ 経済カレンダーシートが空です');
      return '';
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues(); // ★v6.7: I列(結果)・J列(判定)追加
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // 今週末（日曜日）と来週末（次の日曜日）を計算
    var dayOfWeek = today.getDay(); // 0=日, 1=月, ..., 6=土
    var thisWeekEnd = new Date(today.getTime() + (7 - dayOfWeek) * 86400000);
    var nextWeekEnd = new Date(thisWeekEnd.getTime() + 7 * 86400000);
    
    // ★v5.5.3: 今週の月曜日を計算（過去の指標も取得するため）
    var mondayOffset = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek; // 日曜は前の月曜
    var thisWeekStart = new Date(today.getTime() + mondayOffset * 86400000);
    
    var todayEvents = [];
    var thisWeekEvents = [];     // 今日〜今週末（従来: 未来のみ）
    var thisWeekPastEvents = []; // ★v5.5.3: 今週月曜〜昨日（過去の指標）
    var nextWeekEvents = [];
    
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue; // 日付・指標名がない行はスキップ
      
      var eventDate = new Date(data[i][0]);
      var eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      
      var dateStr = Utilities.formatDate(eventDate, 'Asia/Tokyo', 'M/d（E）');
      // ★v6.9: B列はDate型対応（表示用フォーマット）
      var rawTimeDisp = data[i][1];
      var timeStr = '';
      if (rawTimeDisp instanceof Date) {
        var h = rawTimeDisp.getHours();
        var m = rawTimeDisp.getMinutes();
        if (h !== 0 || m !== 0) {
          timeStr = h + ':' + (m < 10 ? '0' + m : m);
        }
      } else {
        timeStr = rawTimeDisp ? String(rawTimeDisp).trim() : '';
        if (timeStr === '0:00' || timeStr === '00:00') timeStr = '';
      }
      var country = String(data[i][2] || '').trim();
      var indicator = String(data[i][3]).trim();
      var previous = String(data[i][4] || '').trim();
      var forecast = String(data[i][5] || '').trim();
      var importance = String(data[i][6] || '中').trim();
      var note = String(data[i][7] || '').trim();
      var result = String(data[i][8] || '').trim();   // ★v6.7: I列（結果）
      var judgment = String(data[i][9] || '').trim(); // ★v6.7: J列（判定）
      
      var line = dateStr;
      if (timeStr) line += ' ' + timeStr;
      line += ' [' + country + '] ' + indicator;
      if (previous) line += '（前回: ' + previous + '）';
      if (forecast) line += '（予想: ' + forecast + '）';
      if (result) line += '（結果: ' + result + '）';   // ★v6.7: 結果が入っていれば表示
      if (judgment) line += '（' + judgment + '）';    // ★v6.7: 上振れ/下振れ/一致
      if (importance === '高') line += ' ★重要';
      if (note) line += ' ※' + note;
      
      if (eventDay.getTime() === today.getTime()) {
        // ★v5.8: 投稿時刻との前後関係を判定（発表済み/未発表ラベル）
        var statusLabel = '';
        if (timeStr) {
          // ★v6.9: B列はDate型対応
          var rawTimeEC = data[i][1];
          var eventHour, eventMin;
          if (rawTimeEC instanceof Date) {
            eventHour = rawTimeEC.getHours();
            eventMin  = rawTimeEC.getMinutes();
          } else {
            var timeParts = timeStr.split(':');
            eventHour = parseInt(timeParts[0], 10);
            eventMin  = parseInt(timeParts[1] || '0', 10);
          }
          var nowHour = now.getHours();
          var nowMin = now.getMinutes();
          if (nowHour > eventHour || (nowHour === eventHour && nowMin >= eventMin)) {
            statusLabel = '【発表済み】';
          } else {
            statusLabel = '【未発表】';
          }
        }
        todayEvents.push(statusLabel + line);
      } else if (eventDay >= thisWeekStart && eventDay < today) {
        // ★v5.5.3: 今週月曜〜昨日（過去の指標）
        thisWeekPastEvents.push(line);
      } else if (eventDay > today && eventDay < thisWeekEnd) {
        thisWeekEvents.push(line);
      } else if (eventDay >= thisWeekEnd && eventDay < nextWeekEnd) {
        nextWeekEvents.push(line);
      }
    }
    
    var text = '';
    
    if (scope === 'today' || scope === 'all') {
      if (todayEvents.length > 0) {
        text += '\n【今日の経済指標（この情報のみ使え）】\n';
        text += '※【発表済み】=結果について言及せよ。「これから発表」「注目」のように未来形で書くな。\n';
        text += '※【未発表】=これから発表される指標として言及してよい。\n';
        text += todayEvents.join('\n') + '\n';
      } else {
        text += '\n【今日の経済指標】なし（指標発表のない日）\n';
      }
    }
    
    if (scope === 'this_week' || scope === 'all') {
      // ★v5.5.3: 今週の過去指標も表示（WEEKLY_REVIEW/WEEKLY_LEARNINGの振り返り用）
      if (thisWeekPastEvents.length > 0) {
        text += '\n【今週発表済みの経済指標（実際に起きたことの参照用）】\n';
        text += thisWeekPastEvents.join('\n') + '\n';
      }
      if (thisWeekEvents.length > 0) {
        text += '\n【今週の残り経済指標】\n';
        text += thisWeekEvents.join('\n') + '\n';
      }
    }
    
    if (scope === 'next_week' || scope === 'all') {
      if (nextWeekEvents.length > 0) {
        text += '\n【来週の経済指標】\n';
        text += nextWeekEvents.join('\n') + '\n';
      } else {
        text += '\n【来週の経済指標】未登録（まだ更新されていません）\n';
      }
    }
    
    // ★v5.5.3: 日曜日用 — thisWeekEventsを「来週の経済指標」として表示
    if (scope === 'this_week_as_next') {
      if (thisWeekEvents.length > 0) {
        text += '\n【来週の経済指標】\n';
        text += thisWeekEvents.join('\n') + '\n';
      } else {
        text += '\n【来週の経済指標】未登録（まだ更新されていません）\n';
      }
    }
    
    if (text) {
      text += '\n⚠️ 上記のカレンダーに記載されていない経済指標の日付・名称・数値は絶対に書くな。\n';
      text += '⚠️ カレンダーが空の場合は「注目指標なし」として、指標に触れるな。\n';
    }
    
    return text;
  } catch (e) {
    console.log('経済カレンダー取得エラー: ' + e.message);
    return '';
  }
}

// ===== 学びログをSheetsから取得 =====
function getLearningLog_(postType, maxItems) {
  try {
    // Phase 3: スコアベース選択（getLearningLogWithScoresはsheetsManager.gsに定義）
    var items = getLearningLogWithScores(null, 0);
    if (items.length === 0) return '';

    var count = maxItems || 3;
    var selected = [];
    var selectedIndices = [];

    // 70%をスコア上位から、30%をランダムから選択
    var topCount = Math.max(1, Math.ceil(count * 0.7));
    var randomCount = count - topCount;

    // スコア降順 → 同スコアなら使用回数が少ない順（新しい学びにチャンスを与える）
    var sortedByScore = items.slice().sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.usageCount - b.usageCount;
    });

    // スコア上位N件を選択
    for (var i = 0; i < Math.min(topCount, sortedByScore.length); i++) {
      selected.push(sortedByScore[i]);
      selectedIndices.push(sortedByScore[i].rowIndex);
    }

    // 残りからランダムに選択
    var remaining = [];
    for (var j = 0; j < items.length; j++) {
      if (selectedIndices.indexOf(items[j].rowIndex) === -1) {
        remaining.push(items[j]);
      }
    }

    for (var k = 0; k < Math.min(randomCount, remaining.length); k++) {
      var idx = Math.floor(Math.random() * remaining.length);
      selected.push(remaining[idx]);
      selectedIndices.push(remaining[idx].rowIndex);
      remaining.splice(idx, 1);
    }

    if (selected.length === 0) return '';

    // 選択された学びの使用回数をインクリメント（incrementLearningUsageはsheetsManager.gsに定義）
    for (var m = 0; m < selected.length; m++) {
      try {
        incrementLearningUsage(selected[m].rowIndex);
      } catch (e) { /* 使用回数更新の失敗で処理を止めない */ }
    }

    var text = '\n\n【過去の学び・気づき（引き出し）】\n';
    text += '以下はコンパナが過去のトレードで実際に得た学び。投稿に自然に活かすこと。\n';
    for (var n = 0; n < selected.length; n++) {
      text += '・[' + selected[n].category + '] ' + selected[n].content + '\n';
    }

    console.log('📚 学びログ注入: ✅' + selected.length + '件取得（' + postType + '）' +
                ' うちスコア上位' + Math.min(topCount, selected.length) + '件+ランダム' +
                (selected.length - Math.min(topCount, selected.length)) + '件');

    return text;
  } catch (e) {
    console.log('学びログ取得エラー: ' + e.message);
    return '';
  }
}


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
      prompt += '■ 仮説（今後の相場予測）\n';
      prompt += '・「○○は△△になる」「○○は△△円を維持する」等、後でレートで検証できる形\n';
      prompt += '・具体的な通貨ペアとレート水準を含めること\n';
      prompt += '・1行40文字以内で簡潔に\n';
      prompt += '・仮説が立てられない投稿なら「なし」\n\n';
    }
    
    prompt += '■ 学び（トレーダーとしての気づき・市場の法則）\n';
    prompt += '・「相場は○○の時に△△しやすい」等の再利用可能な知見\n';
    prompt += '・具体的な日付やレート数値は含めない（普遍的な学びにする）\n';
    prompt += '・1行40文字以内で簡潔に\n';
    prompt += '・カテゴリ: 相場心理/テクニカル/ファンダメンタルズ/リスク管理/指標分析/市場構造\n';
    prompt += '・学びが見当たらない場合は「なし」\n\n';
    
    prompt += '【出力形式】' + (needsHypothesis ? '2行' : '1行') + 'のみ。余計な説明は一切不要。\n';
    if (needsHypothesis) {
      prompt += '仮説: [仮説内容 or なし]\n';
    }
    prompt += '学び: [カテゴリ|学びの内容 or なし]\n\n';
    
    prompt += '【出力例】\n';
    if (needsHypothesis) {
      prompt += '仮説: ドル円は156円台を維持し東京時間は小動き\n';
    }
    prompt += '学び: 相場心理|重要指標の前はポジション縮小で値動きが小さくなりやすい\n';
    
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

    // Phase 2: WEEKLY_HYPOTHESISの場合、仮説検証ログにも保存
    if (postType === 'WEEKLY_HYPOTHESIS' && hypothesis) {
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
    
    var rawResult = callGemini_(prompt, keys.GEMINI_API_KEY, false);
    
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
    
    var rawResult = callGemini_(extractPrompt, keys.GEMINI_API_KEY, false);
    
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

function buildPrompt_(postType, typeConfig, context, rates) {
  var now = new Date();
  var yearStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy');
  var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年M月d日（E）');
  var timeStr = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');
  var keys = getApiKeys(); // ★v5.4: ホットペア検出で使用
  
  // ① キャラクター定義（Sheetsから）
  var characterPrompt = getCharacterPrompt();
  var prompt = characterPrompt + '\n\n';
  
  // ①-a 日時情報
  prompt += '【現在の日時】' + dateStr + ' ' + timeStr + '（日本時間）\n';
  prompt += '【年の確認】現在は' + yearStr + '年です。' + yearStr + '年以外のデータは絶対に使うな。\n\n';
  
  // ①-b 確定レート（事前取得済み）を直接埋め込む ★v5.4: 7ペア化
  // タイプ別にレートの役割を変える
  var ruleTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4'];
  var isRuleType = ruleTypes.indexOf(postType) !== -1;
  
  if (rates) {
    if (postType === 'KNOWLEDGE') {
      prompt += '【参考: 現在のレート（テーマ選定の参考。本文にレート数値を書く必要はない）】\n';
    } else if (isRuleType || postType === 'WEEKLY_LEARNING') {
      prompt += '【参考: 現在のレート（心得・学び投稿の本文にレート数値を無理に入れる必要はない）】\n';
    } else {
      prompt += '【本日の確定レート（7ペア）】\n';
    }
    prompt += '・USD/JPY（ドル円）: ' + Number(rates.usdjpy).toFixed(2) + '円\n';
    prompt += '・EUR/USD（ユーロドル）: ' + Number(rates.eurusd).toFixed(4) + 'ドル\n';
    prompt += '・GBP/USD（ポンドドル）: ' + Number(rates.gbpusd).toFixed(4) + 'ドル\n';
    prompt += '・EUR/JPY（ユーロ円）: ' + Number(rates.eurjpy).toFixed(2) + '円\n';
    prompt += '・GBP/JPY（ポンド円）: ' + Number(rates.gbpjpy).toFixed(2) + '円\n';
    prompt += '・AUD/JPY（豪ドル円）: ' + Number(rates.audjpy).toFixed(2) + '円\n';
    prompt += '・AUD/USD（豪ドル米ドル）: ' + Number(rates.audusd).toFixed(4) + 'ドル\n';
    prompt += '・取得元: ' + rates.source + '\n';
    if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
      prompt += '※レートはチャートを見れば分かる情報。数字の羅列ではなく「なぜ今この価格なのか」の背景と心理を書け。\n';
      prompt += '※7ペアを全部並べるのはNG。1〜2ペアに絞ってストーリーを語ること。\n';
      prompt += '※数値の小数点「.」は絶対に省略するな。1.3672を13672と書くのは禁止。\n';
      prompt += '※ペアの数値を絶対に混同するな。豪ドル円の話題にドル円の数値を混ぜるのは致命的ミス。各ペアの数値は上記リストの対応する行のみ使え。\n\n';
      
      // ★v5.6: レートの方向性を自動計算してプロンプトに注入
      var direction = calculateRateDirection_(rates, keys.SPREADSHEET_ID);
      if (direction) {
        prompt += direction;
      }
      
      
      // ★v5.7 Layer 1: 前日の経済指標結果を注入（MORNING, TOKYO）
      var indicatorResultTypes = ['MORNING', 'TOKYO'];
      if (indicatorResultTypes.indexOf(postType) !== -1) {
        try {
          var indicatorReview = fetchIndicatorResults_(keys.SPREADSHEET_ID, keys.GEMINI_API_KEY);
          if (indicatorReview) {
            prompt += indicatorReview;
          }
        } catch (irErr) {
          console.log('⚠️ 指標結果注入スキップ: ' + irErr.message);
        }
      }
      
      // ★v6.7: 今日の発表済み指標取得は定期トリガー(refreshTodayIndicatorResults)に移動
      // buildPrompt_からの呼び出しは削除。scheduler.gsで9:05/10:35/14:05/21:35/22:05に実行。
      
      // ★v5.7 Layer 3: 直近1ヶ月の指標トレンド注入（MORNINGのみ）
      // ★v5.9: WEEKLY_REVIEWは今週サマリーで代替するため除外（プロンプト削減）
      if (postType === 'MORNING') {
        try {
          var indicatorTrend = formatIndicatorTrend_(keys.SPREADSHEET_ID);
          if (indicatorTrend) {
            prompt += indicatorTrend;
          }
        } catch (tErr) {
          console.log('⚠️ 指標トレンド注入スキップ: ' + tErr.message);
        }
      }
      
    } else {
      prompt += '\n';
    }
    
    // ①-b1.5 ホットペア情報注入 ★v5.4 Phase 6.5
    if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
      var hotPairResult = detectHotPair_(rates, keys.SPREADSHEET_ID);
      if (hotPairResult) {
        prompt += hotPairResult.text;
      }
    }
  } else {
    // ★v5.9.1: レートキャッシュに直近データがあれば、そこから注入
    var cacheRateText = getLatestRateText_(keys.SPREADSHEET_ID);
    if (cacheRateText) {
      prompt += '⚠️リアルタイムAPI未接続。以下はレートキャッシュの直近値です。\n';
      prompt += cacheRateText + '\n';
      prompt += '※ この値を基準に投稿を書け。勝手に丸めたり別の数値を使うな。\n\n';
    } else {
      prompt += '⚠️レート取得に完全に失敗しています。具体的な数値は使わず「上昇」「下落」等で表現すること。\n\n';
    }
  }
  

  // ①-b2 意識される価格帯（レートサマリーから読み取り）※KNOWLEDGE・RULE系・WEEKLY_LEARNINGには不要
  if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
    var priceAnalysis = analyzePriceHistory_(rates);
    if (priceAnalysis) {
      prompt += priceAnalysis;
    }
  }
  
  // ①-b3 市場環境データ（★v5.5.3: 株価指数・金利・VIX・ゴールド）
  // KNOWLEDGE・RULE系・WEEKLY_LEARNINGには不要
  if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
    var indicators = getLatestIndicators_(keys.SPREADSHEET_ID);
    if (indicators) {
      prompt += '【市場環境データ（Twelve Data API取得・正確な値。投稿で使用してよい）】\n';
      for (var mi = 0; mi < MARKET_INDICATORS.length; mi++) {
        var ind = MARKET_INDICATORS[mi];
        var val = indicators[ind.key];
        if (val !== null && val !== undefined) {
          var formatted = val.toFixed(ind.decimals);
          // 日経・ダウなど大きい数字はカンマ区切り
          if (ind.decimals === 0 && val >= 1000) {
            formatted = Number(formatted).toLocaleString();
          }
          prompt += '・' + ind.label + ': ' + formatted + ind.unit + '\n';
        }
      }
      prompt += '※GOOGLEFINANCE自動更新（15〜20分遅延あり）\n';
      prompt += '※Gemini Groundingで得た株価指数・金利の数値は使うな。上記の数値のみ使え。\n';
      prompt += '※株価指数は背景・クロスマーケット分析として触れるのはOK。ただし主役はFX。\n\n';
    }

    // ★v6.5更新: 商品データ注入（WTI・天然ガス=日次キャッシュ、BTC=30分キャッシュ）
    var dailyForPrompt = fetchDailyCommodityPrices_();
    var btcForPrompt   = fetchCommodityPrices_();
    var commoditiesForPrompt = {
      wti:    dailyForPrompt ? dailyForPrompt.wti    : null,
      btc:    btcForPrompt   ? btcForPrompt.btc      : null,
      gold:   btcForPrompt   ? btcForPrompt.gold     : null,
      natgas: dailyForPrompt ? dailyForPrompt.natgas : null
    };
    var hasComData = COMMODITY_ASSETS.some(function(a) { return commoditiesForPrompt[a.key] !== null; });
    if (hasComData) {
      prompt += '【商品データ】\n';
      for (var ci = 0; ci < COMMODITY_ASSETS.length; ci++) {
        var ca = COMMODITY_ASSETS[ci];
        var cv = commoditiesForPrompt[ca.key];
        if (cv !== null && cv !== undefined) {
          prompt += '・' + ca.label + ': ' + cv.toFixed(ca.decimals) + ca.unit + '\n';
        }
      }
      prompt += '※上記は直近1時間以内のAPIデータ（基準値）。Groundingで最新値も検索して確認し、大きくズレていれば最新値を優先せよ。\n';
      prompt += '※使い方: FX値動きの背景・理由説明に使え。商品価格自体を投稿の主役にするな。\n';
      prompt += '※OK: 「原油安を背景に豪ドルが軟調」 NG: 「WTIが85ドル台で推移」を冒頭に持ってくる\n\n';
    }
  }
  
  // ①-b4 市場ニュースTOP5（★v5.5 Phase 7: ニュース取得レイヤー）
  // ★v5.5.3: RULE系・WEEKLY_LEARNINGには注入しない（心得・学びが主題であるべき）
  var noNewsTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'WEEKLY_LEARNING'];
  var skipNews = noNewsTypes.indexOf(postType) !== -1;
  if (!skipNews) {
    var marketNews = fetchMarketNews_(keys);
    if (marketNews) {
      prompt += marketNews;
    }
  }
  
  // ①-c 参照ソース（市況やニュースの取得先）※RULE系には不要
  if (!isRuleType) {
    var refSources = getReferenceSources_();
    if (refSources) {
      prompt += refSources;
    }
  }
  
  // ①-d 経済カレンダー（シートから正確なデータを注入）※RULE系・KNOWLEDGEには不要
  // ★v5.5.3: WEEKLY_LEARNINGには「参考用」として今週カレンダーを注入（架空イベント創作防止）
  if (!isRuleType && postType !== 'KNOWLEDGE') {
    var calScope = 'today'; // デフォルト: 今日のみ
    
    // タイプ別にスコープを変える
    var dailyTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY'];
    if (dailyTypes.indexOf(postType) !== -1) {
      calScope = 'today';
    } else if (postType === 'INDICATOR') {
      calScope = 'today';
    } else if (postType === 'NEXT_WEEK' || postType === 'WEEKLY_HYPOTHESIS') {
      // ★v5.5.3修正: 日曜日は「来週」= 明日からの月〜金（thisWeekEvents）
      var todayDow = new Date().getDay();
      calScope = (todayDow === 0) ? 'this_week_as_next' : 'next_week';
    } else if (postType === 'WEEKLY_REVIEW') {
      calScope = null; // ★v5.9: カレンダー不要（formatWeeklyIndicatorSummary_で代替）
    } else if (postType === 'WEEKLY_LEARNING') {
      calScope = 'this_week';
    }
    // ★v5.9: WEEKLY_REVIEWはカレンダー不要（formatWeeklyIndicatorSummary_で代替）
    
    var calendar = calScope ? getEconomicCalendar_(calScope) : null;
    if (calendar) {
      prompt += calendar;
    }
  }
  
  prompt += '【投稿タイプ（※この名前は指示用。本文には絶対に書くな）】' + typeConfig.label + '\n\n';
  
  // ② 投稿プロンプト（Sheetsから）
  var postPrompt = getPostPrompt_(postType);
  if (postPrompt) {
    prompt += postPrompt.prompt + '\n';
  } else {
    prompt += '最新のFX市場情報を元に、このタイプに合った投稿を作成してください。\n';
  }
  
  // ②-b トレードスタイル（全投稿に注入: 見解の一貫性を保つ）
  var tradeStyle = getTradeStyle_();
  if (tradeStyle) {
    prompt += tradeStyle;
  }
  
  // ②-c 市場系投稿の方針（buildFormatRules_と重複しない項目のみ）
  var marketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR'];
  if (marketTypes.indexOf(postType) !== -1) {
    prompt += '\n【市場系投稿の方針（最重要）】\n';
    prompt += '■ 指標に言及する場合は時刻を含めて正確に。【今日の経済指標】の時刻を使え。\n';
    prompt += '■ 【最重要】レートの事実とニュース解釈を一致させろ。矛盾したらレート優先。\n';
    prompt += '■ 【通貨の動きとの整合】売られている通貨を「買い」、買われている通貨を「売り」と書くのは絶対禁止。データが事実。\n';
  }
  
  // ②-c1.5 MORNING共通: 東京市場オープン前の認識 ★v5.6追加
  if (postType === 'MORNING') {
    prompt += '\n【MORNING投稿の時間帯と役割（重要 - 全曜日共通）】\n';
    prompt += '■ この投稿は朝7:30〜8:00頃の配信。東京市場（9:00）オープンの約1時間前。\n';
    prompt += '■ 読者はこの投稿を見て「今日の東京オープンに向けた準備」をする。\n';
    prompt += '■ 昨夜（日本時間深夜〜早朝）のNY市場・欧州市場での動きは「読者がまだ消化しきれていない情報」として扱え。\n';
    prompt += '  → 読者は夜中のニュースを把握していない可能性が高い。昨夜起きたことをおさらいしてあげるイメージ。\n';
    prompt += '■ 構成の基本フレーム:【昨夜のNY市場おさらい】→【なぜそう動いたか】→【今日の東京で注目するポイント】\n';
    prompt += '  → OK: 「昨夜NYでドル円が一段安。CPIの結果を受けて利下げ観測が再燃した形。東京勢がこの流れを引き継ぐかが今日の焦点」\n';
    prompt += '  → OK: 「昨夜の原油急落を受けて、今日は資源国通貨の動向に注目」\n';
    prompt += '  → NG: 「今まさに〜が起きている」「現在の市場では〜」（NY市場は既に閉まっている）\n';
    prompt += '■ 今日の経済指標発表がある場合は必ず触れ「結果次第でどう動くか」を示せ。\n';
    prompt += '■ 断定的な見通しは避け「〜が焦点」「〜を見極める展開か」など余地を残す表現にせよ。\n';
  }
  
  // ②-c1.6 TOKYO共通: 東京市場序盤の認識（全曜日共通） ★v6.6追加
  if (postType === 'TOKYO') {
    prompt += '\n【TOKYO投稿の時間帯と役割（重要 - 全曜日共通）】\n';
    prompt += '■ この投稿は朝9:11〜9:43頃の配信。東京市場（9:00）オープン後10〜40分が経過した頃。\n';
    prompt += '■ 読者は「東京がどう動き出したか」を知りたがっている。「予想」ではなく「観察」を伝えろ。\n';
    prompt += '■ 8:50に日本の経済指標（企業物価指数・貿易統計・機械受注等）が発表された場合:\n';
    prompt += '  → 【前日の経済指標結果】に記載があれば、それが東京オープンの値動きに影響しているはずだ。\n';
    prompt += '  → 「8:50の○○指標が△△（予想比上振れ/下振れ）→ 円買い/円売り優勢」という流れで構成せよ。\n';
    prompt += '■ 構成の基本フレーム:【東京オープン序盤の値動き（事実）】→【なぜそう動いたか（背景）】→【午前中の注目ポイント】\n';
    prompt += '  → OK: 「東京オープン後、ドル円は154円台後半で小動き。8:50の企業物価指数が予想を下回り、円買いが若干優勢な展開」\n';
    prompt += '  → OK: 「MORNINGで警戒していたNY安の流れを東京も引き継ぎ、オープン直後から売り圧力」\n';
    prompt += '  → NG: 「〜が予想される」「〜だろう」（東京は既に動いている。現在の値動きを伝えろ）\n';
    prompt += '■ MORNINGで提示した「今日の焦点」と対比させると読者に継続性が生まれる。\n';
  }
  
  // ②-c2 月曜日コンテキスト（市場系全投稿共通）★v5.6追加
  var todayDayOfWeek = now.getDay(); // 0=日, 1=月, ..., 6=土
  var mondayMarketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR'];
  if (todayDayOfWeek === 1 && mondayMarketTypes.indexOf(postType) !== -1) {
    prompt += '\n【月曜日の投稿方針（最重要 - 本日は週明け。全市場系投稿で厳守）】\n';
    prompt += '■ 今日は月曜日。土日は為替市場が閉まっていた。\n';
    prompt += '■ 「昨日」「昨夜」は絶対禁止（昨日＝日曜で市場は閉まっている）。\n';
    prompt += '  → NG: 「昨日のNY市場では〜」「昨夜のNYで〜」「昨日の流れを引き継ぎ〜」\n';
    prompt += '  → OK: 「先週金曜のNY市場では〜」「金曜NYの流れを引き継ぎ〜」「週末を挟んで〜」\n';
    prompt += '■ 週末の世界情勢を踏まえる:\n';
    prompt += '  → 📰ニュースTOP5で拾った週末の要人発言・地政学ニュース・政策発表を題材にする。\n';
    prompt += '  → 市場が閉まっている間に世界で何が起きたか、が月曜の最大の関心事。\n';
    
    // MORNING固有の追加指示
    if (postType === 'MORNING') {
      prompt += '■ 【MORNING固有】窓開け（ギャップ）を中心に構成:\n';
      prompt += '  → 金曜NYの終値と月曜早朝のレートを比較し、窓の大きさと方向を伝える。\n';
      prompt += '  → 窓が大きい場合:「週末に何が起きたか」→「窓は埋まるか、このまま走るか」の分析。\n';
      prompt += '  → 窓が小さい場合:「週末は大きなサプライズなし」→「金曜の流れを引き継ぐか」の分析。\n';
      prompt += '  → 「東京市場がこのニュースにどう反応するか」が読者の最大の関心事。\n';
      prompt += '■ 先週のWEEKLY_HYPOTHESISの仮説との対比があれば触れてよい。\n';
    }
    
    // TOKYO固有の追加指示
    if (postType === 'TOKYO') {
      prompt += '■ 【TOKYO固有】月曜の東京オープンの特殊性:\n';
      prompt += '  → 週末のニュースに対する東京市場の最初の本格的反応。\n';
      prompt += '  → 窓埋め（ギャップフィル）が起きているか、窓方向にさらに走っているか。\n';
      prompt += '  → 「金曜NYの流れ」ではなく「週末を挟んだ変化」に対する東京の反応として書く。\n';
    }
    
    // LUNCH固有の追加指示
    if (postType === 'LUNCH') {
      prompt += '■ 【LUNCH固有】月曜午前の振り返り:\n';
      prompt += '  → 「週明けの東京市場がどう反応したか」の振り返りが自然な切り口。\n';
      prompt += '  → 窓埋め完了/未完了、週末ニュースへの織り込み具合を整理する。\n';
    }
    
    // LONDON以降は「昨日」禁止だけで十分（午後〜夜は市場が動いているため）
  }
  
  // ②-d KNOWLEDGE投稿の方針（「1分でわかる！」スタイル）
  if (postType === 'KNOWLEDGE') {
    prompt += '\n【KNOWLEDGE投稿の方針（最重要 - 必ず守れ）】\n';
    prompt += '■ この投稿は「難しい金融を楽しくかみ砕く」投稿。教科書ではない。\n';
    prompt += '■ 読者が「へぇ！」「そういうことか！」と思える例え話やトリビアを必ず入れる。\n';
    prompt += '■ 上の確定レートは「今日何が注目されているか」を判断するためだけに使え。\n';
    prompt += '■ 冒頭にレートの数字を書くな。「ドル円は152円」から始めるのは禁止。\n';
    prompt += '■ 内容のヒント（構造は共通のノート形式に従え）:\n';
    prompt += '  ・問いかけ→例え話→過去エピソード→実感、の流れが効果的。\n';
    prompt += '  ・ただし各トピックは必ず「絵文字+事実→分析」のブロック形式で書くこと。\n';
    prompt += '■ 冒頭の例:\n';
    prompt += '  OK: 「CPIって何？→物価の体温計みたいなもの。熱が高い（インフレ）と利下げが遠のく」\n';
    prompt += '  OK: 「FOMCって聞くけど、実際に何が決まる？→世界の株価と為替の心臓部みたいな会議」\n';
    prompt += '  NG: 「スプレッドとは、FX取引における買値と売値の差のことで…」（教科書的で退屈）\n';
  }
  
  // ★v5.7 Layer 2: INDICATOR投稿に過去の指標実績を注入
  if (postType === 'INDICATOR') {
    try {
      var indicatorPreview = formatIndicatorPreview_(keys.SPREADSHEET_ID);
      if (indicatorPreview) {
        prompt += indicatorPreview;
      }
    } catch (pErr) {
      console.log('⚠️ 指標予習注入スキップ: ' + pErr.message);
    }
  }
  
  // ②-e INDICATOR投稿の方針（かみ砕き重視）
  if (postType === 'INDICATOR') {
    prompt += '\n【INDICATOR投稿の方針】\n';
    prompt += '■ 上の【今日の経済指標】に記載された指標のみ解説せよ。記載がない指標を勝手に書くな。\n';
    prompt += '■ 【今日の経済指標】が「なし」の場合:\n';
    prompt += '  → 架空の指標発表を書くのは致命的な誤情報。「あと○分でCPI発表」等は絶対禁止。\n';
    prompt += '  → 代わりに【通貨強弱データ】と【📰市場ニュース】を活用して、今日の値動きの解説に切り替えろ。\n';
    prompt += '  → または、来週の注目指標の予告に切り替えよ。\n';
    prompt += '■ 指標の「予想値と前回値」だけでなく、「なぜ重要か」「結果がどう影響するか」をかみ砕く。\n';
    prompt += '■ 具体的な数値（前回値・予想値）は【今日の経済指標】に記載されたものだけ使え。記載がない数値を捏造するな。\n';
    prompt += '■ 因果関係を明示する: 「CPIが高い＝物価上昇＝利下げ遠のく＝ドル買われやすい」\n';
    prompt += '■ 大衆心理を描写: 「みんなが今どう身構えているか」を人間味ある言葉で。\n';
    prompt += '■ OK: 「市場は上振れにビクビク。もし3%超えたら…という恐怖が漂っている」\n';
    prompt += '■ NG: 「上振れの場合、ドル円は156円を目指す展開も想定されます」（無機質すぎ）\n';
    prompt += '■ NG: 「あと15分でCPI発表」（カレンダーに記載がない指標＝捏造）\n';
  }
  
  
  // ★v5.7 Layer 3: WEEKLY_REVIEW/WEEKLY_LEARNINGに今週の指標結果サマリーを注入
  if (postType === 'WEEKLY_REVIEW' || postType === 'WEEKLY_LEARNING') {
    try {
      var weeklySummary = formatWeeklyIndicatorSummary_(keys.SPREADSHEET_ID);
      if (weeklySummary) {
        prompt += weeklySummary;
      }
    } catch (wsErr) {
      console.log('⚠️ 週次サマリー注入スキップ: ' + wsErr.message);
    }
  }

  // ★v5.10: WEEKLY_REVIEWに週間レートトレンドを注入（論理矛盾防止）
  // 日次レートOHLCから曜日ごとの動きを集計し、方向性を事実として渡す
  if (postType === 'WEEKLY_REVIEW') {
    try {
      var weeklyTrend = formatWeeklyRateTrend_(keys.SPREADSHEET_ID, rates);
      if (weeklyTrend) {
        prompt += weeklyTrend;
        console.log('📊 週間レートトレンド注入済み（日次OHLC版）');
      }
    } catch (wtErr) {
      console.log('⚠️ 週間トレンド注入スキップ: ' + wtErr.message);
    }
  }
  
  // ②-f 週末系投稿の方針（大衆心理・ストーリー重視）
  var weekendTypes = ['WEEKLY_REVIEW', 'WEEKLY_LEARNING', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
  if (weekendTypes.indexOf(postType) !== -1) {
    prompt += '\n【週末系投稿の方針】\n';
    prompt += '■ レートの羅列は禁止。「今週はこういうドラマがあった」とストーリーで語る。\n';
    prompt += '■ 大衆心理を必ず描写: 「今週、市場参加者はどんな気持ちだったか？」\n';
    prompt += '■ 例: 「今週は完全に指標待ちの一週間。みんな手を出したいけど出せない、そんなモヤモヤが漂っていた」\n';
    prompt += '■ 「」の個人見解はトレード判断ではなく、相場観や感想で。\n';
    prompt += '■ OK: 「嵐の前の静けさ。来週のCPIが号砲になるかもしれない」\n';
    prompt += '■ NG: 「今週は方向感が出にくい相場でした」（感想が薄い）\n';
  }
  
  // ②-f2 来週展望系（NEXT_WEEK, WEEKLY_HYPOTHESIS）: カレンダー厳守
  if (postType === 'NEXT_WEEK' || postType === 'WEEKLY_HYPOTHESIS') {
    prompt += '\n【来週の指標に関する厳守事項】\n';
    prompt += '■ 上の【来週の経済指標】に記載された指標のみ言及せよ。\n';
    prompt += '■ 記載がない指標の日付・名称を勝手に作るな。これは誤情報であり信頼を失う致命的ミス。\n';
    prompt += '■ 指標の日付を並べ替えるな。カレンダーに「3/2 ISM」とあれば「3/2」と書け。勝手に3/4等に変更するのは誤情報。\n';
    prompt += '■ 発表時刻を勝手に付けるな。カレンダーに時刻がない場合は時刻を書くな。「00:00」等を捏造するな。\n';
    prompt += '■ カレンダーが「未登録」の場合は、具体的な指標名・日付に触れず「来週も経済指標が控えている」程度に留めよ。\n';
    prompt += '■ OK: 「来週は○/○に△△が発表予定」（カレンダーに記載あり）\n';
    prompt += '■ NG: 「2/27に米耐久財受注が〜」（カレンダーに記載なし＝捏造）\n';
    prompt += '■ NG: 「3/4 00:00 ISM」（カレンダーでは3/2＝日付の勝手な変更）\n';
  }

  // ②-f3 WEEKLY_LEARNING: 架空イベント創作禁止 ★v5.5.3
  if (postType === 'WEEKLY_LEARNING') {
    prompt += '\n【WEEKLY_LEARNING 厳守事項】\n';
    prompt += '■ 今週実際に起きたことだけを書け。架空の市場イベントを創作するな。\n';
    prompt += '■ 上の【今週発表済みの経済指標】に記載がない指標を「発表された」と書くのは捏造。絶対禁止。\n';
    prompt += '■ 要人発言（パウエル議長、ラガルド総裁等）もカレンダーに記載があるものだけ。架空の「議会証言」「声明」は捏造。\n';
    prompt += '■ 具体的な指標名・日付・要人名を書く場合は、必ずカレンダーに記載があるものだけ。\n';
    prompt += '■ 不確かなら指標名・要人名を書くな。「今週は値動きが激しかった」等の体感ベースで書け。\n';
    prompt += '■ 主題は「学び・気づき」。市場レポートではない。心理面・トレード判断の反省に集中しろ。\n';
    prompt += '■ OK: 「今週、急な値動きに焦って損切りが遅れた」（体験ベース）\n';
    prompt += '■ OK: 「PPIの結果を見て、自分のルール通り静観できた」（カレンダーにある指標）\n';
    prompt += '■ NG: 「金曜の雇用統計でドル円が急落した」（カレンダーにない指標＝捏造）\n';
    prompt += '■ NG: 「パウエル議長の議会証言で〜」（カレンダーにない要人発言＝捏造）\n';
  }

  // ②-g RULE系投稿の方針（心得・教訓が主体。ニュースは例示に活用可）★v5.5
  if (isRuleType) {
    prompt += '\n【RULE系投稿の方針（厳守）】\n';
    prompt += '■ この投稿は「トレーダーの心得・教訓」投稿。市場速報ではない。\n';
    prompt += '■ テーマに沿った教訓・経験談・心構えが主体。\n';
    prompt += '■ ただし【📰市場ニュース】の中から、教訓を補強する「最近の例」として1つ引用するのは効果的。\n';
    prompt += '  例: 「パウエル発言で一瞬で50pips動いた。こういう時に焦ってエントリーすると負ける」\n';
    prompt += '  例: 「トランプ関税でリスクオフ。こんな日に限ってポジション持ってしまうのが人間」\n';
    prompt += '■ 架空のニュース・要人発言は絶対に書くな。【📰市場ニュース】に記載された事実のみ引用可。\n';
  }

  // ②-h RULE_3専用: 投稿構造の明示（実践テクニック）v2
  if (postType === 'RULE_3') {
    prompt += '\n【RULE_3 投稿の構造（絵文字ブロック形式で書け）】\n';
    prompt += '通常のフォーマット（絵文字行 + →行 + 補足）を守りながら、以下の流れで3ブロック構成にしろ。\n';
    prompt += '\n';
    prompt += 'ブロック1（☕または✅）: 実用性を示すフック\n';
    prompt += '  絵文字行: 「これ知ってるだけで負けが減る」「地味だけど効果絶大」等の実用性ある1行\n';
    prompt += '  →行: テクニックの概要と、いつ使うかを「〇〇な時は〇〇する」の形で語る\n';
    prompt += '\n';
    prompt += 'ブロック2（📝または💡）: 本質（なぜそうするのか）\n';
    prompt += '  絵文字行: テクニックの核心を短く1行\n';
    prompt += '  →行: 「なぜそうするのか」の根拠・理由。やり方の説明ではなく根本を語る\n';
    prompt += '  補足行: 補足や実感があれば→なしで1行続ける\n';
    prompt += '\n';
    prompt += 'ブロック3（📕または📋）: 具体例（体験談）\n';
    prompt += '  絵文字行: 過去の体験談の場面を1行\n';
    prompt += '  →行: これで助かった / これを知らずに損した経験を実感ある言葉で\n';
    prompt += '\n';
    prompt += '締め: 絵文字・→なし。気づきや変化を1〜2行で。「〇〇で変わった」「〇〇だと気づいた」トーン\n';
    prompt += '\n【RULE_3 TC導線（自然に入る場合のみ）】\n';
    prompt += '・テーマが「過去検証」「勝率分析」「データ可視化」に関連する時だけ触れてよい\n';
    prompt += '・OK例: 「手法別の勝率を可視化してみたら、得意だと思ってた手法が実は一番負けてた」\n';
    prompt += '・NG例: 「Trading Completeの分析タブを使いましょう」（宣伝文句は絶対NG）\n';
  }

  // ③ RULE系: テーマシート連動（既存のgetNextTheme処理を維持）
  if (postType.indexOf('RULE') === 0) {
    var categoryMap = {
      'RULE_1': '知識・原則',
      'RULE_2': '習慣・メンタル',
      'RULE_3': '実践テクニック',
      'RULE_4': '失敗談・本音'
    };
    var category = categoryMap[postType];
    if (category) {
      var theme = getNextTheme(category);
      if (theme) {
        prompt += '\nテーマ: ' + theme.theme + '\n';
        prompt += 'キーメッセージ: ' + theme.keyMessage + '\n';
        
        if (theme.tcPattern && theme.tcPattern !== 'なし' &&
            ['RULE_1', 'RULE_3', 'WEEKLY_REVIEW'].indexOf(postType) !== -1) {
          prompt += '\n【Trading Complete導線（※以下は構成の指針。このテキストをそのまま本文に含めるな）】\n';
          switch (theme.tcPattern) {
            case '課題提起型':
              prompt += '構成の流れ:「記録が大事」→「でも面倒」→「だからツールで仕組み化」\n';
              prompt += '最後にさりげなく「自分はツールを作って解決した」と触れる程度でOK\n';
              prompt += '※上記の矢印付きフローをそのまま本文に書くな。自然な文章で表現しろ。\n';
              break;
            case '開発ストーリー型':
              prompt += '構成の流れ: 自分の体験談 →「Excelで挫折」→「自分でツールを作った」\n';
              prompt += '開発者としての本音を出す。宣伝感は出さない\n';
              prompt += '※上記の矢印付きフローをそのまま本文に書くな。自然な文章で表現しろ。\n';
              break;
            case 'データ型':
              prompt += '構成の流れ: 具体的な数字 →「記録を振り返ったら発見があった」\n';
              prompt += 'データの力を実感したエピソードを入れる\n';
              prompt += '※上記の矢印付きフローをそのまま本文に書くな。自然な文章で表現しろ。\n';
              break;
          }
          prompt += '\n';
        }
      }
    }
  }
  
  // ④ TC概要（TC導線がある投稿タイプのみ）★v5.4で拡張
  //    週末: RULE_1〜4, WEEKLY_REVIEW, WEEKLY_LEARNING, WEEKLY_HYPOTHESIS（従来通り＋拡張）
  //    平日: GOLDEN, LUNCH（AI自律判断で週1〜2回）
  var tcTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'WEEKLY_REVIEW', 'WEEKLY_LEARNING', 'WEEKLY_HYPOTHESIS', 'GOLDEN', 'LUNCH'];
  if (tcTypes.indexOf(postType) !== -1) {
    var tcOverview = getTCOverview();
    if (tcOverview) {
      prompt += tcOverview;
    }
  }
  
  // Phase 4: 品質フィードバック注入（データ5件以上ある場合のみ）
  var qualityFeedback = getQualityFeedback_(postType);
  if (qualityFeedback) {
    prompt += qualityFeedback;
  }

  // Phase 2: WEEKLY_HYPOTHESIS生成時に、過去の仮説的中率サマリーを注入
  if (postType === 'WEEKLY_HYPOTHESIS') {
    var verifSummary = getHypothesisVerificationSummary_();
    if (verifSummary) {
      prompt += verifSummary;
    }
  }

  // ★v5.10: WEEKLY_HYPOTHESISに今週のレートトレンドを注入（仮説の根拠強化）
  // 今週の実際の動き（日次OHLC）を渡すことで、事実ベースの来週予測が可能になる
  if (postType === 'WEEKLY_HYPOTHESIS') {
    try {
      var hypoTrend = formatWeeklyRateTrend_(keys.SPREADSHEET_ID, rates);
      if (hypoTrend) {
        // WEEKLY_HYPOTHESIS用に見出しを差し替えて注入
        hypoTrend = hypoTrend.replace(
          '【今週の主要ペア週間トレンド（事実データ。通貨の方向性を正確に反映せよ）】',
          '【今週の主要ペア週間トレンド（来週の仮説を立てる際の根拠データとして使え）】'
        );
        prompt += hypoTrend;
        console.log('📊 週間レートトレンド注入済み（WEEKLY_HYPOTHESIS）');
      }
    } catch (htErr) {
      console.log('⚠️ WEEKLY_HYPOTHESIS週間トレンド注入スキップ: ' + htErr.message);
    }
  }

  // ④-b 学びログ（過去の引き出しを注入）★v5.5: 全タイプに拡張
  var learningMaxMap = {
    'MORNING': 2, 'TOKYO': 1, 'LUNCH': 1, 'LONDON': 1, 'GOLDEN': 2, 'NY': 1,
    'INDICATOR': 1, 'NEXT_WEEK': 2,
    'WEEKLY_REVIEW': 3, 'WEEKLY_LEARNING': 5, 'WEEKLY_HYPOTHESIS': 3,
    'RULE_1': 3, 'RULE_2': 3, 'RULE_3': 3, 'RULE_4': 3,
    'KNOWLEDGE': 3
  };
  var maxLearnings = learningMaxMap[postType];
  if (maxLearnings) {
    var learningLog = getLearningLog_(postType, maxLearnings);
    if (learningLog) {
      prompt += learningLog;
    }
  }
  
  // ⑤ フォーマットルール（投稿タイプ別文字数を反映）
  prompt += buildFormatRules_(typeConfig.charMin, typeConfig.charMax, postType);
  
  // ⑥ コンテキスト（仮説・学びを投稿履歴シート＋レートキャッシュから自動取得）
  // 仮説は市場系・週末系のみ注入（RULE系・KNOWLEDGEには不要）
  var hypothesisTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY',
                         'WEEKLY_REVIEW', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
  var needsHypothesis = hypothesisTypes.indexOf(postType) !== -1;
  
  var historyContext = getHypothesisContext_(rates);
  
  // 仮説の振り返り（レートキャッシュの数値差分ベース）
  if (needsHypothesis && historyContext && historyContext.hypothesisBlock) {
    prompt += historyContext.hypothesisBlock;
  } else if (needsHypothesis && context && context.lastHypothesis) {
    // フォールバック: 外部contextから
    prompt += '\n【前回の仮説（参考情報）】\n' + context.lastHypothesis + '\n';
    prompt += '→ 1文で軽く触れてよい。「不発」「成功」等の評価語は使うな。\n';
  }
  
  // 学び
  if (historyContext && historyContext.learning) {
    prompt += '\n【最近の学び（参考情報）】\n' + historyContext.learning + '\n';
    prompt += '→ この学びの内容を自然に織り込んでもよい。\n';
  } else if (context && context.lastLearning) {
    prompt += '\n【最近の学び（参考情報）】\n' + context.lastLearning + '\n';
    prompt += '→ この学びの内容を自然に織り込んでもよい。\n';
  }
  
  // ★v5.9.3: プロンプト文字数測定（デバッグ用）
  console.log('📏 プロンプト総文字数: ' + prompt.length + '文字（約' + Math.round(prompt.length / 2) + 'トークン）');
  
  // セクション別の大まかな内訳をログ出力
  var sections = prompt.match(/【[^】]+】/g) || [];
  console.log('📏 セクション数: ' + sections.length + '個');
  console.log('📏 セクション一覧: ' + sections.join(', '));
  
  return prompt;
}

// ========================================
// 仮説・学びコンテキスト（投稿履歴＋レートキャッシュから自動取得）
// ========================================

/**
 * 投稿履歴シートから前回の仮説と学びを取得し、
 * レートキャッシュの数値差分を付加して返す
 * @param {Object} rates - 現在のレート {usdjpy, eurusd, gbpusd}
 * @return {Object} {hypothesisBlock: string|null, learning: string|null}
 */
function getHypothesisContext_(rates) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('投稿履歴');
    if (!sheet || sheet.getLastRow() < 2) return null;
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    // A=日時(0), H=仮説(7), I=学び(8)
    
    var lastHypothesis = null;
    var hypothesisDate = null;
    var lastLearning = null;
    
    // 最新の仮説と学びを探す（下から上へ）
    for (var i = data.length - 1; i >= 0; i--) {
      if (!lastHypothesis && data[i][7] && String(data[i][7]).trim()) {
        lastHypothesis = String(data[i][7]).trim();
        hypothesisDate = new Date(data[i][0]);
      }
      if (!lastLearning && data[i][8] && String(data[i][8]).trim()) {
        lastLearning = String(data[i][8]).trim();
      }
      if (lastHypothesis && lastLearning) break;
    }
    
    var result = { hypothesisBlock: null, learning: lastLearning };
    
    if (!lastHypothesis || !hypothesisDate) return result;
    if (!rates || !rates.usdjpy) {
      result.hypothesisBlock = '\n【前回の仮説（参考情報）】\n' + lastHypothesis + '\n';
      result.hypothesisBlock += '→ 1文で軽く触れてよい。「不発」「成功」等の評価語は使うな。\n';
      return result;
    }
    
    // レートキャッシュから仮説時点のデータを取得
    var cacheSheet = ss.getSheetByName('レートキャッシュ');
    if (!cacheSheet || cacheSheet.getLastRow() < 2) {
      result.hypothesisBlock = '\n【前回の仮説（参考情報）】\n' + lastHypothesis + '\n';
      result.hypothesisBlock += '→ 1文で軽く触れてよい。「不発」「成功」等の評価語は使うな。\n';
      return result;
    }
    
    var cacheData = cacheSheet.getRange(2, 1, cacheSheet.getLastRow() - 1, 4).getValues();
    
    // --- 仮説時点のレートを探す ---
    var closestRate = null;
    var closestDiff = Infinity;
    for (var j = 0; j < cacheData.length; j++) {
      var cacheDate = new Date(cacheData[j][0]);
      var diff = Math.abs(cacheDate.getTime() - hypothesisDate.getTime());
      if (diff < closestDiff) {
        closestDiff = diff;
        closestRate = Number(cacheData[j][1]); // USD/JPY
      }
    }
    
    // --- 仮説の根拠: その週のトレンドを復元 ---
    // 仮説日の7日前〜仮説日のレートを集めて、週の方向を計算
    var weekStart = new Date(hypothesisDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    var weekRates = [];
    for (var k = 0; k < cacheData.length; k++) {
      var d = new Date(cacheData[k][0]);
      var val = Number(cacheData[k][1]);
      if (d >= weekStart && d <= hypothesisDate && val > 100) {
        weekRates.push({ date: d, rate: val });
      }
    }
    
    // 差分計算
    var currentRate = Number(rates.usdjpy);
    var hypothesisDateStr = Utilities.formatDate(hypothesisDate, 'Asia/Tokyo', 'M/d');
    
    var block = '\n【前回の仮説の振り返り（事実データ）】\n';
    block += '仮説内容: ' + lastHypothesis + '\n';
    
    // 根拠データ（仮説時点の状況）
    if (weekRates.length >= 2) {
      // 時系列でソート
      weekRates.sort(function(a, b) { return a.date.getTime() - b.date.getTime(); });
      var weekStartRate = weekRates[0].rate;
      var weekEndRate = weekRates[weekRates.length - 1].rate;
      var weekChange = weekEndRate - weekStartRate;
      var weekChangeStr = (weekChange >= 0 ? '+' : '') + weekChange.toFixed(2);
      var weekHigh = weekRates.reduce(function(max, r) { return r.rate > max ? r.rate : max; }, 0);
      var weekLow = weekRates.reduce(function(min, r) { return r.rate < min ? r.rate : min; }, 999);
      
      block += '■ 仮説の根拠データ（' + hypothesisDateStr + '時点）\n';
      block += '  仮説時レート: ' + weekEndRate.toFixed(2) + '円\n';
      block += '  直近7日の変動: ' + weekChangeStr + '円（' + weekStartRate.toFixed(2) + '→' + weekEndRate.toFixed(2) + '）\n';
      block += '  直近7日の高安: ' + weekHigh.toFixed(2) + '円〜' + weekLow.toFixed(2) + '円\n';
      block += '  トレンド: ' + (weekChange > 0.3 ? '上昇基調' : weekChange < -0.3 ? '下落基調' : 'レンジ') + '\n';
    } else if (closestRate && closestRate > 100) {
      block += '■ 仮説時レート（' + hypothesisDateStr + '）: ' + closestRate.toFixed(2) + '円\n';
    }
    
    // その後の実績
    block += '■ その後の実績\n';
    block += '  現在レート: ' + currentRate.toFixed(2) + '円\n';
    if (closestRate && closestRate > 100) {
      var change = currentRate - closestRate;
      var changeStr = (change >= 0 ? '+' : '') + change.toFixed(2);
      var direction = (change > 0.3 ? '仮説方向' : change < -0.3 ? '仮説と逆方向' : 'ほぼ横ばい');
      block += '  変動: ' + changeStr + '円（' + direction + '）\n';
    }
    
    block += '\n→ 上記の事実データのみ使い、1文で軽く触れてよい（アクセント程度）。\n';
    block += '→ 根拠と結果のギャップを述べるのはOK。\n';
    block += '→ 毎回違う表現を使え。同じフレーズの使い回しは禁止。\n';
    block += '→ OK例1: 「' + hypothesisDateStr + '時点では' + (closestRate ? closestRate.toFixed(0) : '153') + '円台だったが、' + currentRate.toFixed(2) + '円まで動いた」\n';
    block += '→ OK例2: 「先週の仮説では上方向を想定していたが、結果的に横ばい推移」\n';
    block += '→ OK例3: 仮説に触れず、純粋に今のレートと材料だけで書く（触れないのもOK）\n';
    block += '→ NG: 「先週は上昇基調で155円を見ていたが、155円台に反転」（この定型文は禁止）\n';
    block += '→ NG: 「ロング戦略は失敗」「仮説は不発」（トレード評価語は禁止）\n';
    
    result.hypothesisBlock = block;
    return result;
  } catch (e) {
    console.log('⚠️ 仮説コンテキスト取得エラー: ' + e.message);
    return null;
  }
}

// ========================================
// フォーマットルール（非公開・コード内）
// ========================================

function buildFormatRules_(charMin, charMax, postType) {
  var minChars = charMin || 200;
  var maxChars = charMax || 280;
  if (maxChars > 700) maxChars = 700;
  var rules = '';
  
  // === 最優先ルール ===
  rules += '\n【最優先ルール（違反は即やり直し）】\n';
  rules += '1. 投稿テキストのみ出力。前置き・挨拶・自己紹介は一切書くな。1文字目から本文。\n';
  rules += '2. 投稿タイプ名（MORNING BRIEF, TOKYO OPEN等）を本文に書くな。\n';
  rules += '3. 総文字数' + minChars + '〜' + maxChars + '文字（ハッシュタグ含まず）。X投稿である。1投稿1テーマ。\n';
  rules += '4. AIの無機質な要約はNG。「隣の席の凄腕トレーダー」が語るイメージ。\n';
  rules += '5. レート数字の複数ペア並べ禁止。主役1つ。数字より「なぜ？」と「大衆心理」。\n';
  
  // === コンパナの口調（圧縮版） ===
  rules += '\n【コンパナの口調（絶対遵守）】\n';
  rules += '語尾: 〜ですね / 〜かなと / 〜なんですよ / 〜ですしね / 〜って感じ / 〜じゃないかな\n';
  rules += '親しみ: 「本気で」「凄く」「マジで」「正直」「ぶっちゃけ」\n';
  rules += '相場描写: 「じわじわ上げてきた」「スコーンと落ちた」「重い天井」「ヌルッと抜けた」\n';
  rules += '禁止口調: 「〜である」「〜であろう」「〜と見られる」「推察される」「渦巻いている」→アナリスト/新聞記者\n';
  rules += '変換例: Before「豪ドルが買われる展開であろう」→After「豪ドル、もう一段上がるんじゃないかなと」\n';
  rules += 'ルール: 同じ語尾2回連続禁止。語尾バリエーション最低3種類使え。\n';
  
  // === ノート構造（全投稿統一）★v6.0.2 ===
  rules += '\n【フォーマット構造（全投稿で守れ）】\n';
  rules += '■ 全投稿が同じ「ノート形式」になるように書け。投稿タイプごとに構造を変えるな。\n';
  rules += '\n';
  rules += '■ ノートの基本単位 = 「絵文字ブロック」:\n';
  rules += '  絵文字行: 絵文字+事実や題名（1行で短く）\n';
  rules += '  →行: その話題の背景・分析・感想。1ブロックに→は1つだけ。\n';
  rules += '  補足行: →なしの通常テキスト。同じ話題の補足があれば→なしで続ける。\n';
  rules += '\n';
  rules += '■ ルール:\n';
  rules += '  ・1投稿 = 3〜4ブロック（絵文字3個が基本）\n';
  rules += '  ・絵文字0個は絶対禁止。最低でも3個の絵文字ブロックで構成しろ。\n';
  rules += '  ・1ブロック = 1つの話題。話題が変わったら空行を入れて次の絵文字。\n';
  rules += '  ・→は1ブロックに1つだけ。2つ以上の→は禁止。\n';
  rules += '  ・絵文字行の上には必ず空行（先頭ブロック除く）\n';
  rules += '  ・最後は絵文字なし・→なしでコンパナの感想1〜2行で締める\n';
  rules += '  ・改行: 「。」「？」の後で改行。\n';
  rules += '  ・絵文字: 📕📝📋☕💡⚠️✅の7種のみ。\n';
  rules += '  ・カレンダーや日付の羅列に→を使うな。→は分析・感想専用。\n';
  rules += '\n';
  rules += '■ OK例（このレイアウトを全投稿で守れ）:\n';
  rules += '  ☕パウエル、まだ利下げしない。\n';
  rules += '  →タカ派的な発言で市場の期待を冷ました感じですね。\n';
  rules += '  米ドルが買われ、ドル円は一時157円を割る場面も。\n';
  rules += '  \n';
  rules += '  📝豪ドルは資源国通貨として原油高の恩恵。\n';
  rules += '  →豪ドル米ドルは上昇トレンドが加速中ですが、イラン情勢次第でボラが高まる可能性もありますね。\n';
  rules += '  \n';
  rules += '  💡本日は豪1月貿易収支が発表予定。\n';
  rules += '  →予想は39億豪ドル。上振れなら豪ドルがさらに買われるかも。\n';
  rules += '  \n';
  rules += '  原油価格と各国の金融政策、答え合わせは今夜ですね。\n';
  rules += '\n';
  rules += '■ NG例:\n';
  rules += '  × 1ブロックに→が2つ以上ある（→は1つだけ。残りは→なしテキスト）\n';
  rules += '  × カレンダーの日付に→を使う（→は分析用。日付は普通のテキストで並べろ）\n';
  rules += '  × 絵文字が最初の1個だけ、あとはダラダラ文章が続く\n';
  rules += '  × 絵文字なしの行が5行以上連続する\n';
  rules += '  × →がない絵文字ブロック（事実だけ書いて分析がない）\n';
  rules += '  × 1ブロック内で話題が変わる（話題ごとに絵文字で区切れ）\n';
  rules += '  × 絵文字0個で文章だけがダラダラ続く（これは最悪。絵文字で区切れ）\n';
  rules += '  × プロンプトのセクション名（【現在のレート】等）やリスト記号（・）を本文に書く\n';
  rules += '  × 絵文字を行末に置く（「地味だけど効果絶大✅」はNG。「✅地味だけど効果絶大」が正しい）\n';
  rules += '\n【絵文字の位置（絶対ルール）】\n';
  rules += '絵文字は必ず行頭に置け。行末・文中への絵文字配置は絶対禁止。\n';
  rules += 'NG: 「地味だけど効果絶大✅」「テクニックは場面とセットで📝」\n';
  rules += 'OK: 「✅地味だけど効果絶大」「📝テクニックは場面とセットで」\n';
  
  // === 結論バリエーション ===
  rules += '\n【結論のバリエーション（毎回同じ結論禁止）】\n';
  rules += '「静観」のみで終わるの禁止。以下から選べ:\n';
  rules += 'A資金管理 / B具体レベル / C時間軸提案 / D逆張り目線 / E経験からの教訓 / F通貨ペア切替 / Gリスクリワード / H感情の吐露\n';
  rules += '「静観」は1日最大1回まで。\n';
  
  // === コンパナ経歴 ===
  rules += '\n【コンパナの経歴ファクト】\n';
  rules += 'FX歴7年（2019年〜）。1年目: 500万を溶かしかけた。2〜4年目: 記録開始→3年で収支安定。\n';
  rules += 'OK:「3年かけて収支が安定」 NG:「7年かかった」「500万を溶かした」\n';
  
  // === 題材選定ルール（圧縮版） ===
  rules += '\n【題材選定ルール（ニュース × 通貨強弱）】\n';
  rules += '・📰ニュースTOP5から最適な1つを選び、要人名+具体的事実を軸にストーリー構築。\n';
  rules += '・通貨強弱データをニュースの裏付けに使うこと。\n';
  rules += '・1日6投稿で同じニュース主題は最大2回。切り口を変えろ。\n';
  rules += '・ニュースなし/低ボラ日はドル円でよい。\n';
  
  // === 投稿の構造（圧縮版） ===
  rules += '\n【投稿の構造】\n';
  rules += '冒頭1行が全て。ニュースのインパクト凝縮。事実羅列で始めるな。\n';
  rules += 'OK:「パウエル、まだ利下げしない。市場の期待を冷水で叩いた。」\n';
  rules += '事実→「なぜ？」→大衆心理描写（必須1回以上）→具体的数字or過去事例\n';
  
  // === 事実・数値の正確性（3セクション統合） ===
  rules += '\n【事実とフィクションの区別 / 数値の正確性（絶対遵守）】\n';
  rules += '・架空のトレード結果、架空のニュース、架空の指標日程は絶対禁止。\n';
  rules += '・経済指標の日付・名称は【経済カレンダー】記載のもののみ。\n';
  rules += '・経済指標を書く際は必ず国名を明記せよ。\n';
  rules += 'NG: 「GDP改定値が発表されます」→OK: 「日本の10-12月期GDP改定値が発表されます」\n';
  rules += 'NG: 「CPI発表を控えて」→OK: 「米2月CPI発表を控えて」\n';
  rules += '・為替レートは【確定レート】、株価等は【市場環境データ】の数値のみ使え。\n';
  rules += '・Gemini検索で得た数値は使うな。注入データのみが正確。\n';
  
  // === 論理の一貫性（圧縮版） ===
  rules += '\n【論理の一貫性】\n';
  rules += '日銀→円 / FRB→ドル / ECB→ユーロ / BOE→ポンド / RBA→豪ドル。因果関係を間違えるな。\n';
  
  // === フォーマットルール（圧縮版） ===
  rules += '\n【フォーマットルール】\n';
  rules += '・ハッシュタグは書くな（システムが自動付与）。リスト記号（・●1.-）禁止。\n';
  rules += '・ピリオド不可、句点「。」使用。URL禁止。全て日本語で書け。\n';
  rules += '・通貨ペアは日本語名で書け: USD/JPY→ドル円、EUR/USD→ユーロドル、GBP/USD→ポンドドル、EUR/JPY→ユーロ円、GBP/JPY→ポンド円、AUD/JPY→豪ドル円、AUD/USD→豪ドル米ドル\n';
  rules += '・言及できる通貨ペアは上記7ペアのみ。カナダドル（CAD）・スイスフラン（CHF）・NZドル（NZD）・人民元（CNY）等はデータが存在しないため言及禁止。\n';
  rules += '・例外: 原油高とCADの関係等、背景説明として通貨名のみ触れるのはOK。レート数値を書くのは禁止。\n';
  rules += '・マークダウン記法（---、**、##）禁止。\n';
  
  // === 禁止事項（圧縮版） ===
  rules += '\n【禁止事項（即やり直し）】\n';
  rules += '前置き・挨拶・自己紹介・呼びかけ（皆さん/みなさん）・投稿タイプ名\n';
  rules += '締め文: 「頑張りたい」「しっかり〜しましょう」「ワクワクしますね」「どんな戦略で臨みますか？」\n';
  rules += 'トレード判断: 「様子見」→「静観ムード」「休むも相場」、「見送る」→「一歩引いて」、「注目」→「面白いのは」「見逃せない」\n';
  rules += '始値/終値断言禁止: NG「155.36円でスタート」→OK「155円台で推移」\n';
  rules += '→で始まる文には必ず主語を入れろ。NG「→が急落した」OK「→原油価格が急落した」\n';
  rules += '商品価格は背景のみ: WTI・BTC・天然ガスを投稿の主役にするな。FXへの影響として1文で触れる程度にとどめよ。\n';
  rules += '疑問形「でしょうか」は1投稿につき最大1回。複数の疑問形は断言か別表現に変換せよ。\n';
  rules += 'NG: 「どうでしょうか。東京勢は静観でしょうか？下値は157円台でしょうか。」\n';
  rules += 'OK: 「東京勢は動きにくい展開。下値は157円台が意識される。」\n';
  rules += '※【末尾に質問を入れよ】の指示がある場合、その質問行が唯一の疑問形。本文中の疑問形は全て断言に変換せよ。\n';
  
  // === TC言及制限 ===
  var marketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR'];
  if (marketTypes.indexOf(postType) !== -1) {
    rules += '\n【低ボラ日の対応】\n';
    rules += '全ペア変動小なら値動き分析を無理に語るな。指標解説/学び/トレード心理に切り替え。\n';
  }
  
  var tcWeekdayTypes = ['GOLDEN', 'LUNCH'];
  var tcNoTypes = ['MORNING', 'TOKYO', 'LONDON', 'NY', 'INDICATOR', 'KNOWLEDGE'];
  if (tcWeekdayTypes.indexOf(postType) !== -1) {
    rules += '\n【TC導線（AI自律判断・週1〜2回・投稿の20%以下）】\n';
    rules += '宣伝感NG。「記録が大事→面倒→ツールで仕組み化」の自然な流れで。\n';
  } else if (tcNoTypes.indexOf(postType) !== -1) {
    rules += '\n【TC言及禁止。純粋な価値提供のみ。】\n';
  }
  
  // === 経済指標の方向性ルール ===
  rules += '\n【経済指標の方向性ルール（誤解釈は致命的）】\n';
  rules += '通常指標（GDP,PMI,CPI等）: 予想より高い=上振れ=買い要因、低い=下振れ=売り要因\n';
  rules += '逆指標（失業率等）: 予想より低い=改善=買い要因、高い=悪化=売り要因\n';
  rules += '「上振れ」=数字が大きい。失業率の上振れ＝悪化。注入データの（買い/売り要因）判定をそのまま使え。\n';
  rules += '\n【リスクセンチメントと円の方向性（絶対に間違えるな）】\n';
  rules += 'リスクオフ（戦争・地政学リスク・株安・景気悪化）= 安全通貨の円が買われる = 円高方向\n';
  rules += 'リスクオン（株高・景気回復期待・楽観ムード）= 円が売られる = 円安方向\n';
  rules += '× 絶対NG: 「リスク回避で円売り」「リスクオフで円安」は真逆。使うな。\n';
  rules += '✅ OK例: 「地政学リスクでリスクオフ。円が買われ、ドル円は下落」\n';
  rules += '✅ OK例: 「原油高=資源国通貨（AUD・CAD）の買い要因。円や欧州通貨には逆風」\n';
  rules += '※ 例外: 日本が輸入国のため原油高は日本の経常収支悪化=円安要因にもなる。文脈で判断せよ。\n';
  
  // === NG例 ===
  rules += '\n【NG例】\n';
  rules += '× レート羅列 × 前置き挨拶 × 呼びかけ × 投稿タイプ名 × 架空トレード結果\n';
  rules += '× トレード判断示唆（「静観」「様子見」「エントリーを避けたい」「今日は見送り」等は絶対に書くな）\n';
  rules += '× リスク方向の誤り（「リスク回避=円売り」は致命的な誤り）\n';

  // === リプライ誘発質問（約30%の確率で末尾に挿入） ===
  // リプライはいいねの150倍の価値がある。質問は投稿の末尾1行に限定し、本文の流れを崩さない
  if (Math.random() < 0.3) {
    var replyQuestions = {
      // 市場系: 今日の相場に絡めた問いかけ
      'MORNING': [
        '今日注目してる通貨ペアはありますか？',
        '今日の相場、どう見てますか？',
        '今週一番気になってる指標、何ですか？'
      ],
      'TOKYO': [
        '今朝のチャート、もう確認しましたか？',
        '東京時間、どのペアを追ってますか？',
        'アジア時間の動き、どう読んでますか？'
      ],
      'LUNCH': [
        '午前中、相場を見る時間ありましたか？',
        '今日の午前、何か気になった動きはありましたか？',
        '兼業の人、昼休みにチャート確認してますか？'
      ],
      'LONDON': [
        'ロンドン時間、リアルタイムで見てますか？',
        '欧州時間の動き、追えてる人いますか？',
        'ロンドン勢の動き、読めてきましたか？'
      ],
      'GOLDEN': [
        '今日の相場、一言で表すと何ですか？',
        '今日、印象に残った動きはありましたか？',
        '今日みたいな相場、どう過ごしましたか？'
      ],
      'NY': [
        '今夜の指標、リアルタイムで追いますか？',
        'NY時間、起きて見る派ですか？',
        '今夜の結果、朝に答え合わせしましょう。皆さんはどっちに動くと思いますか？'
      ],
      'INDICATOR': [
        '発表結果、一緒に確認しましょう。予想はどっち方向ですか？',
        '今回の指標、上振れと下振れどちらを警戒してますか？',
        'この指標、リアルタイムで見ますか？'
      ],
      // 心得系: 読者の体験を引き出す問いかけ
      'KNOWLEDGE': [
        'これ、知ったのはいつ頃ですか？',
        '同じ経験した人いますか？',
        'これを知る前と後で、何か変わりましたか？'
      ],
      'RULE_1': [
        'この原則、気づくのに何年かかりましたか？',
        '同じ失敗、した人いますか？',
        'トレードで一番大事にしてるルール、何ですか？'
      ],
      'RULE_2': [
        'この心理、身に覚えありますか？',
        'メンタル管理で効果があった方法、何かありますか？',
        '感情に負けて後悔したトレード、ありますか？'
      ],
      'RULE_3': [
        'このテクニック、使ってる人いますか？',
        '地味だけど効いてるって習慣、何かありますか？',
        'これ知る前と後で、成績変わりましたか？'
      ],
      'RULE_4': [
        '同じ失敗、した人いますか？',
        'FXで一番痛かった経験、何ですか？（聞いてもいいなら）',
        '今振り返ると「あれが転機だった」って出来事、ありますか？'
      ],
      // 週次系
      'WEEKLY_REVIEW': [
        '今週の相場、一言で表すと何ですか？',
        '今週、一番印象に残った動きは何ですか？',
        '今週の自分のトレード、振り返れましたか？'
      ],
      'WEEKLY_LEARNING': [
        '今週、何か気づきはありましたか？',
        '今週のトレード、一言で表すと何ですか？',
        '来週、一つだけ意識することを決めるとしたら何ですか？'
      ],
      'WEEKLY_HYPOTHESIS': [
        '来週の相場、どう見てますか？',
        '来週一番気になってるイベント、何ですか？',
        '来週のシナリオ、一緒に考えませんか？'
      ],
      'NEXT_WEEK': [
        '来週、どのイベントが一番気になりますか？',
        '来週の主役は何だと思いますか？',
        '来週注目してる通貨ペア、何ですか？'
      ]
    };

    var questions = replyQuestions[postType];

    // 対応するタイプがなければ汎用質問
    if (!questions) {
      questions = [
        '皆さんはどう見てますか？',
        '同じ経験した人いますか？',
        'これ、どう思いますか？'
      ];
    }

    var selectedQuestion = questions[Math.floor(Math.random() * questions.length)];

    rules += '\n【末尾に質問を入れよ（リプライ誘発・必須）】\n';
    rules += '投稿の末尾の最後の1行に、以下の質問を自然な形で追加せよ。\n';
    rules += '質問: 「' + selectedQuestion + '」\n';
    rules += '※この質問行は本文の締めとして機能させる。唐突にならないよう前の文と繋げること。\n';
    rules += '※本文中の疑問形は全て断言に変換し、質問はこの1行のみにせよ。\n';
    console.log('💬 リプライ誘発質問を注入: ' + selectedQuestion);
  }

  return rules;
}

// ========================================
// 歴史的レートサマリー 初期データ投入
// ========================================
// 【実行タイミング】最初の1回だけ実行する初期化関数
// 【目的】運用開始時点で「年間高値安値」を
//         レートサマリーに入れておき、投稿の「意識ライン」を充実させる
// ========================================

/**
 * 歴史的高値安値データをレートサマリーシートに書き込む
 * ※最初の1回だけ実行。毎朝のupdatePriceSummary()は行2〜10のみ上書きするので
 *   行11以降のこのデータは保持される。
 */
function initializeHistoricalSummary() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // レートサマリーシートを取得（なければ作成）
  var sheet = ss.getSheetByName('レートサマリー');
  if (!sheet) {
    sheet = ss.insertSheet('レートサマリー');
    var headers = ['期間', 'USD/JPY高値', 'USD/JPY安値', 'EUR/USD高値', 'EUR/USD安値', 'GBP/USD高値', 'GBP/USD安値', 'データ件数', '更新日時'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    console.log('✅ レートサマリーシートを新規作成');
  }
  
  var timeStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  
  // 歴史的データ（年間高値安値）
  var historicalData = [
    ['2025年',      158.87, 139.89,  1.1919, 1.0141,  1.3789, 1.2100, 260, timeStr],
    ['2024年',      161.62, 140.66,  1.1208, 1.0350,  1.3424, 1.2299, 260, timeStr],
    ['2023年',      151.91, 127.22,  1.1275, 1.0449,  1.3143, 1.1803, 260, timeStr],
    ['2022年',      151.95, 113.47,  1.1455, 0.9536,  1.3700, 1.0350, 260, timeStr],
    ['2021年',      116.35, 102.59,  1.2349, 1.1186,  1.4248, 1.3188, 260, timeStr],
    ['5年間レンジ', 161.62, 102.59,  1.2349, 0.9536,  1.4248, 1.0350, 1300, timeStr]
  ];
  
  // 行11から書き込み（行2〜10は毎朝のupdatePriceSummaryが使う）
  var startRow = 11;
  sheet.getRange(startRow, 1, historicalData.length, 9).setValues(historicalData);
  
  // 余分な行をクリア
  var clearStart = startRow + historicalData.length;
  var sheetLastRow = sheet.getLastRow();
  if (sheetLastRow >= clearStart) {
    sheet.getRange(clearStart, 1, sheetLastRow - clearStart + 1, 9).clearContent();
  }
  
  console.log('✅ 歴史的レートサマリー初期化完了（' + historicalData.length + '期間）');
  for (var i = 0; i < historicalData.length; i++) {
    var r = historicalData[i];
    console.log('  ' + r[0] + ': USD/JPY ' + r[1].toFixed(2) + '〜' + r[2].toFixed(2));
  }
  console.log('📌 行11〜' + (startRow + historicalData.length - 1) + 'に書き込みました');
}

// ========================================
// テスト関数
// ========================================

function testGemini() {
  var keys = getApiKeys();
  
  console.log('=== Gemini API テスト ===');
  console.log('モデル: ' + GEMINI_MODEL);
  console.log('');
  
  console.log('--- テスト1: 基本テキスト生成 ---');
  var result1 = callGemini_(
    'FXトレードで一番大事なことを一文で答えてください。',
    keys.GEMINI_API_KEY,
    false
  );
  
  if (result1) {
    console.log('✅ 基本生成成功');
    console.log('応答: ' + result1.text);
  } else {
    console.log('❌ 基本生成失敗');
    return;
  }
  
  console.log('');
  console.log('--- テスト2: Grounding付き ---');
  var result2 = callGemini_(
    '現在のドル円（USD/JPY）の最新レートと、今日の主な値動きの要因を簡潔に教えてください。',
    keys.GEMINI_API_KEY,
    true
  );
  
  if (result2) {
    console.log('✅ Grounding付き生成成功');
    console.log('応答: ' + result2.text);
  } else {
    console.log('❌ Grounding付き生成失敗');
    return;
  }
  
  console.log('');
  console.log('🎉 Gemini APIテスト完了！');
}

// ★ 個別タイプをテストしたい場合: testGenerateOnly() の中のタイプ名を変更して実行
// ★ 平日一括: testGenerateAll() / 土日一括: testGenerateWeekend()

// 個別タイプテスト（タイプ名を変更して実行）
function testGenerateOnly() {
  var type = 'MORNING'; // ← ここを変更: MORNING, TOKYO, LUNCH, LONDON, GOLDEN, NY, INDICATOR, KNOWLEDGE, RULE_1〜4, WEEKLY_REVIEW, WEEKLY_LEARNING, NEXT_WEEK, WEEKLY_HYPOTHESIS
  testGenerate_(type);
}

// 全タイプ一括テスト（レート1回取得→キャッシュ再利用でAPI節約）
function testGenerateAll() {
  var types = [
    'MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN', 'NY', 'INDICATOR',
    'KNOWLEDGE',
    'WEEKLY_REVIEW', 'RULE_1', 'RULE_2', 'RULE_3', 'RULE_4',
    'WEEKLY_LEARNING', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'
  ];
  
  // レートを1回だけ取得してキャッシュ
  var keys = getApiKeys();
  console.log('=== レート事前取得 ===');
  var cachedRates = fetchLatestRates_(keys.GEMINI_API_KEY);
  if (cachedRates) {
    console.log('📊 キャッシュレート: USD/JPY=' + cachedRates.usdjpy + ' EUR/USD=' + cachedRates.eurusd + ' GBP/USD=' + cachedRates.gbpusd);
    saveRatesToSheet_(cachedRates, keys.SPREADSHEET_ID);
  } else {
    console.log('⚠️ レート取得失敗。レートなしでテスト続行');
  }
  
  console.log('');
  console.log('=== 全投稿タイプ 一括テスト（' + types.length + 'タイプ） ===');
  console.log('⚠️ レート制限回避のため各3秒間隔で実行');
  console.log('');
  
  var success = 0;
  var fail = 0;
  var results = [];
  var startTime = new Date();
  
  // ★v6.1.1: 一括テスト時はファクトチェックをスキップ（GAS 6分制限対策）
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SKIP_FACT_CHECK', 'true');
  console.log('⚠️ 一括テスト: ファクトチェックをスキップ（時間制限対策）');
  
  for (var i = 0; i < types.length; i++) {
    // 5分経過で安全停止（GAS制限は6分）
    var elapsed = (new Date() - startTime) / 1000;
    if (elapsed > 300) {
      console.log('⏰ 5分経過のため安全停止（GAS制限6分）');
      console.log('完了: ' + i + '/' + types.length + 'タイプ');
      break;
    }
    
    var type = types[i];
    console.log('--- [' + (i + 1) + '/' + types.length + '] ' + type + ' ---');
    
    var result = generatePost(type, null, cachedRates);
    
    if (result) {
      console.log('✅ ' + result.emoji + ' ' + result.label + ' | 文字数: ' + result.text.length);
      console.log(result.text);
      console.log('');
      results.push({type: type, chars: result.text.length, status: '✅'});
      success++;
    } else {
      console.log('❌ 生成失敗');
      console.log('');
      results.push({type: type, chars: 0, status: '❌'});
      fail++;
    }
    
    // レート制限回避（3秒間隔）
    if (i < types.length - 1) {
      Utilities.sleep(3000);
    }
  }
  
  // 一括テスト終了後にフラグをクリア（本番に影響しないように）
  props.deleteProperty('SKIP_FACT_CHECK');
  
  // サマリー
  console.log('========================================');
  console.log('📊 テスト結果サマリー');
  console.log('成功: ' + success + ' / 失敗: ' + fail + ' / 合計: ' + types.length);
  console.log('');
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var charWarning = (r.chars > 700) ? ' ⚠️文字数超過(700超)' : '';
    console.log(r.status + ' ' + r.type + ': ' + r.chars + '文字' + charWarning);
  }
  console.log('========================================');
}

// ★v5.9: 4分割テスト（testAll1〜4）
// 16タイプを4つずつに分けて確実にテストするための関数
// GAS 6分制限対策: 4タイプなら余裕で完了する

function testAll1() {
  testBatch_(['MORNING', 'TOKYO', 'LUNCH', 'LONDON'], 'グループ1/4');
}
function testAll2() {
  testBatch_(['GOLDEN', 'NY', 'INDICATOR', 'KNOWLEDGE'], 'グループ2/4');
}
function testAll3() {
  testBatch_(['WEEKLY_REVIEW', 'RULE_1', 'RULE_2', 'RULE_3'], 'グループ3/4');
}
function testAll4() {
  testBatch_(['RULE_4', 'WEEKLY_LEARNING', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'], 'グループ4/4');
}

// 分割テストの共通処理
function testBatch_(types, label) {
  var keys = getApiKeys();
  console.log('=== レート事前取得 ===');
  var cachedRates = fetchLatestRates_(keys.GEMINI_API_KEY);
  if (cachedRates) {
    console.log('📊 キャッシュレート: USD/JPY=' + cachedRates.usdjpy + ' EUR/USD=' + cachedRates.eurusd + ' GBP/USD=' + cachedRates.gbpusd);
    saveRatesToSheet_(cachedRates, keys.SPREADSHEET_ID);
  } else {
    console.log('⚠️ レート取得失敗。レートなしでテスト続行');
  }

  console.log('');
  console.log('=== 分割テスト ' + label + '（' + types.length + 'タイプ） ===');
  console.log('⚠️ レート制限回避のため各3秒間隔で実行');
  console.log('');

  var props = PropertiesService.getScriptProperties();
  props.setProperty('SKIP_FACT_CHECK', 'true');
  console.log('⚠️ 一括テスト: ファクトチェックをスキップ（時間制限対策）');

  var success = 0;
  var fail = 0;
  var results = [];

  for (var i = 0; i < types.length; i++) {
    var type = types[i];
    console.log('--- [' + (i + 1) + '/' + types.length + '] ' + type + ' ---');

    var result = generatePost(type, null, cachedRates);

    if (result) {
      console.log('✅ ' + result.emoji + ' ' + result.label + ' | 文字数: ' + result.text.length);
      console.log(result.text);
      console.log('');
      results.push({type: type, chars: result.text.length, status: '✅'});
      success++;
    } else {
      console.log('❌ 生成失敗');
      console.log('');
      results.push({type: type, chars: 0, status: '❌'});
      fail++;
    }

    if (i < types.length - 1) {
      Utilities.sleep(3000);
    }
  }

  props.deleteProperty('SKIP_FACT_CHECK');

  console.log('========================================');
  console.log('📊 テスト結果サマリー (' + label + ')');
  console.log('成功: ' + success + ' / 失敗: ' + fail + ' / 合計: ' + types.length);
  console.log('');
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var charWarning = (r.chars > 700) ? ' ⚠️文字数超過(700超)' : '';
    console.log(r.status + ' ' + r.type + ': ' + r.chars + '文字' + charWarning);
  }
  console.log('========================================');
}

// 土日タイプ一括テスト（★v5.5.3追加）
function testGenerateWeekend() {
  var types = [
    'WEEKLY_REVIEW', 'RULE_1', 'RULE_2', 'WEEKLY_LEARNING',
    'RULE_3', 'NEXT_WEEK', 'RULE_4', 'WEEKLY_HYPOTHESIS'
  ];
  
  var keys = getApiKeys();
  console.log('=== 土日タイプ一括テスト（' + types.length + 'タイプ） ===');
  var cachedRates = fetchLatestRates_(keys.GEMINI_API_KEY);
  if (cachedRates) {
    console.log('📊 レートキャッシュ済み');
    saveRatesToSheet_(cachedRates, keys.SPREADSHEET_ID);
  }
  console.log('');
  
  var results = [];
  var startTime = new Date();
  
  for (var i = 0; i < types.length; i++) {
    var elapsed = (new Date() - startTime) / 1000;
    if (elapsed > 300) {
      console.log('⏰ 5分経過のため安全停止');
      break;
    }
    
    var type = types[i];
    console.log('--- [' + (i + 1) + '/' + types.length + '] ' + type + ' ---');
    
    var result = generatePost(type, null, cachedRates);
    
    if (result) {
      console.log('✅ ' + result.emoji + ' ' + result.label + ' | 文字数: ' + result.text.length);
      console.log(result.text.substring(0, 100) + '...');
      results.push({type: type, chars: result.text.length, status: '✅'});
    } else {
      console.log('❌ 生成失敗');
      results.push({type: type, chars: 0, status: '❌'});
    }
    console.log('');
    
    if (i < types.length - 1) Utilities.sleep(3000);
  }
  
  console.log('========================================');
  console.log('📊 土日テスト結果');
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var typeLabel = r.type.indexOf('RULE') !== -1 || r.type === 'WEEKLY_LEARNING' ? '心得系' : '市場系';
    console.log(r.status + ' ' + r.type + '(' + typeLabel + '): ' + r.chars + '文字');
  }
  console.log('========================================');
}
function testGenerate_(postType) {
  var typeConfig = POST_TYPES[postType];
  var label = typeConfig ? typeConfig.label : postType;
  
  console.log('=== ' + postType + '投稿 生成テスト ===');
  console.log('');
  
  var result = generatePost(postType, null);
  
  if (result) {
    console.log('投稿タイプ: ' + result.emoji + ' ' + result.label);
    console.log('文字数: ' + result.text.length);
    console.log('');
    console.log('--- 生成テキスト ---');
    console.log(result.text);
  } else {
    console.log('❌ 生成失敗');
  }
}

// ★ 追加テスト: Sheets読み込み確認
function testSheetLoading() {
  console.log('=== Sheets読み込みテスト ===');
  console.log('');
  
  // 投稿プロンプトシート
  console.log('--- 投稿プロンプトシート ---');
  var morningPrompt = getPostPrompt_('MORNING');
  if (morningPrompt) {
    console.log('✅ MORNING取得成功: ' + morningPrompt.name);
    console.log('プロンプト: ' + morningPrompt.prompt.substring(0, 100) + '...');
  } else {
    console.log('❌ MORNING取得失敗（投稿プロンプトシートを作成してください）');
  }
  
  console.log('');
  
  // TC概要シート
  console.log('--- TC概要シート ---');
  var tcOverview = getTCOverview();
  if (tcOverview) {
    console.log('✅ TC概要取得成功');
    console.log('内容（先頭200文字）: ' + tcOverview.substring(0, 200) + '...');
  } else {
    console.log('❌ TC概要取得失敗（TC概要シートを作成してください）');
  }
  
  console.log('');
  
  // トレードスタイルシート
  console.log('--- トレードスタイルシート ---');
  var tradeStyle = getTradeStyle_();
  if (tradeStyle) {
    console.log('✅ トレードスタイル取得成功');
    console.log('内容（先頭200文字）: ' + tradeStyle.substring(0, 200) + '...');
  } else {
    console.log('❌ トレードスタイル取得失敗（トレードスタイルシートを作成してください）');
  }
  
  console.log('');
  
  // 学びログシート
  console.log('--- 学びログシート ---');
  var learningLog = getLearningLog_('WEEKLY_REVIEW', 5);
  if (learningLog) {
    console.log('✅ 学びログ取得成功');
    console.log('内容: ' + learningLog.substring(0, 200) + '...');
  } else {
    console.log('⚠️ 学びログなし（まだ蓄積がないか、シートが未作成）');
  }
  
  console.log('');
  
  // 参照ソースシート
  console.log('--- 参照ソースシート ---');
  var refSources = getReferenceSources_();
  if (refSources) {
    console.log('✅ 参照ソース取得成功');
    console.log('内容（先頭200文字）: ' + refSources.substring(0, 200) + '...');
  } else {
    console.log('❌ 参照ソース取得失敗（参照ソースシートを作成してください）');
  }
  
  console.log('');
  console.log('🎉 Sheets読み込みテスト完了！');
}

// ========================================
// サマリー更新テスト
// ========================================

function testUpdateSummary() {
  console.log('=== レートサマリー更新テスト ===');
  console.log('');
  updatePriceSummary();
  console.log('');
  console.log('🎉 レートサマリーシートを確認してください');
  console.log('');
  
  // 分析結果もテスト
  console.log('--- プロンプト注入テスト ---');
  var analysis = analyzePriceHistory_();
  if (analysis) {
    console.log('✅ 分析データあり:');
    console.log(analysis);
  } else {
    console.log('⚠️ 分析データなし（データ蓄積が必要です）');
  }
}

// ========================================
// レート取得テスト
// ========================================

function testFetchRates() {
  var keys = getApiKeys();
  
  console.log('=== レート取得テスト ===');
  console.log('');
  
  var rates = fetchLatestRates_(keys.GEMINI_API_KEY);
  
  if (rates) {
    console.log('✅ レート取得成功');
    console.log('  USD/JPY: ' + rates.usdjpy);
    console.log('  EUR/USD: ' + rates.eurusd);
    console.log('  GBP/USD: ' + rates.gbpusd);
    console.log('  取得元: ' + rates.source);
    console.log('');
    
    // スプレッドシート保存テスト
    console.log('--- スプレッドシート保存テスト ---');
    saveRatesToSheet_(rates, keys.SPREADSHEET_ID);
    console.log('');
    console.log('🎉 レートキャッシュシートを確認してください');
  } else {
    console.log('❌ レート取得失敗');
  }
}

/**
 * 定期レート取得（1時間ごとにトリガーで自動実行）
 * Twelve Data APIからレートを取得してレートキャッシュに保存
 */
function scheduledFetchRates() {
  console.log('=== 定期レート取得 ===');
  var keys = getApiKeys();
  
  var rates = fetchLatestRates_(keys.GEMINI_API_KEY);
  
  if (rates) {
    saveRatesToSheet_(rates, keys.SPREADSHEET_ID);
    console.log('✅ レートキャッシュに保存完了');
  } else {
    console.log('⚠️ レート取得失敗（次回リトライ）');
  }
}

// ========================================
// 市場指標データ読み取り（★v5.5.3）
// GOOGLEFINANCE関数で自動更新される「指標データ」シートから読み取り
// APIクレジット不要・トリガー不要
// ========================================

/**
 * 「指標データ」シートからGOOGLEFINANCEの最新値を読み取る
 * buildPrompt_から呼ばれてプロンプトに注入する
 */
function getLatestIndicators_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('指標データ');
    
    if (!sheet) {
      return null;
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    
    // A列:ラベル B列:値 C列:単位（行2〜7を想定）
    var dataRows = Math.min(lastRow - 1, 6); // 最大6行
    var data = sheet.getRange(2, 1, dataRows, 3).getValues();
    
    var result = {};
    var validCount = 0;
    
    // MARKET_INDICATORSと照合して読み取り
    for (var i = 0; i < data.length; i++) {
      var label = String(data[i][0]).trim();
      var val = data[i][1];
      
      if (val === '' || val === null || val === undefined || val === '#N/A' || val === '#ERROR!') {
        continue;
      }
      
      var numVal = parseFloat(val);
      if (isNaN(numVal)) continue;
      
      // ラベルからキーを特定
      if (typeof MARKET_INDICATORS !== 'undefined') {
        for (var j = 0; j < MARKET_INDICATORS.length; j++) {
          if (MARKET_INDICATORS[j].label === label) {
            // 範囲チェック
            var ind = MARKET_INDICATORS[j];
            if (numVal >= ind.min && numVal <= ind.max) {
              // ★ TNXスケール補正: GOOGLEFINANCE("TNX")は実際の値の10倍で返す
              var storeVal = ind.tnxScale ? numVal * ind.tnxScale : numVal;
              result[ind.key] = storeVal;
              validCount++;
            } else {
              console.log('⚠️ ' + label + ' が範囲外: ' + numVal + '（' + ind.min + '〜' + ind.max + '）');
            }
            break;
          }
        }
      }
    }
    
    if (validCount === 0) return null;
    
    // ★v6.9: F1セルにGAS読み取り日時を書き込む
    try {
      var now = new Date();
      var readTime = Utilities.formatDate(now, 'Asia/Tokyo', 'GAS読み取り: yyyy/MM/dd HH:mm');
      sheet.getRange(1, 6).setValue(readTime);
    } catch (e2) {
      // 書き込み失敗は無視（読み取り結果には影響させない）
    }
    
    return result;
  } catch (e) {
    console.log('⚠️ 指標データ読み取りエラー: ' + e.message);
    return null;
  }
}

/**
 * 「指標データ」シートを作成し、GOOGLEFINANCE数式を自動投入する
 * 初回1回だけ実行。実行後は関数削除OK
 */
function setupIndicatorSheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // 既存シートはクリア、なければ新規作成（getUi不使用でGASエディタからも実行可能）
  var sheet = ss.getSheetByName('指標データ');
  if (sheet) {
    sheet.clear();
    console.log('既存の「指標データ」シートをクリアして更新します');
  } else {
    sheet = ss.insertSheet('指標データ');
  }
  
  // ヘッダー
  var headers = ['指標名', '現在値', '単位', 'シンボル', '更新状態', 'GAS読み取り'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  
  // GOOGLEFINANCE数式を投入（★ゴールドは非対応のため削除。Alpha Vantageで取得）
  var indicators = [
    { label: '日経225',       formula: '=GOOGLEFINANCE("INDEXNIKKEI:NI225","price")', unit: '円',  symbol: 'INDEXNIKKEI:NI225' },
    { label: 'NYダウ',        formula: '=GOOGLEFINANCE("INDEXDJX:.DJI","price")',      unit: 'ドル',symbol: 'INDEXDJX:.DJI' },
    { label: 'S&P500',        formula: '=GOOGLEFINANCE("INDEXSP:.INX","price")',       unit: '',    symbol: 'INDEXSP:.INX' },
    { label: '米10年債利回り', formula: '=GOOGLEFINANCE("TNX","price")',                unit: '%',   symbol: 'TNX' },
    { label: 'VIX',           formula: '=GOOGLEFINANCE("INDEXCBOE:VIX","price")',      unit: '',    symbol: 'INDEXCBOE:VIX' }
  ];
  
  for (var i = 0; i < indicators.length; i++) {
    var row = i + 2;
    var ind = indicators[i];
    sheet.getRange(row, 1).setValue(ind.label);
    sheet.getRange(row, 2).setFormula(ind.formula);
    sheet.getRange(row, 3).setValue(ind.unit);
    sheet.getRange(row, 4).setValue(ind.symbol);
    sheet.getRange(row, 5).setFormula('=IF(ISNUMBER(B' + row + '),"✅ OK","❌ 要確認")');
  }
  
  // 書式設定
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 50);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(5, 100);
  
  sheet.getRange('B2').setNumberFormat('#,##0');
  sheet.getRange('B3').setNumberFormat('#,##0');
  sheet.getRange('B4').setNumberFormat('#,##0.00');
  sheet.getRange('B5').setNumberFormat('0.000');
  sheet.getRange('B6').setNumberFormat('0.00');
  
  sheet.getRange(7, 1).setValue('このシートはGOOGLEFINANCE関数で自動更新されます（15〜20分遅延）');
  sheet.getRange(7, 1).setFontColor('#666666');
  sheet.getRange(8, 1).setValue('E列が全て「✅ OK」なら正常動作中');
  sheet.getRange(8, 1).setFontColor('#666666');
  sheet.getRange(9, 1).setValue('※ゴールドはGOOGLEFINANCE非対応のためAlpha Vantageで取得');
  sheet.getRange(9, 1).setFontColor('#999999');
  
  SpreadsheetApp.flush();
  
  console.log('✅ 指標データシートを更新しました（5指標・ゴールド行を削除）');
  console.log('E列が全て ✅ OK なら正常です');
}

/**
 * テスト: 指標データシートの読み取り確認
 */
function testReadIndicators() {
  var keys = getApiKeys();
  var result = getLatestIndicators_(keys.SPREADSHEET_ID);
  
  if (!result) {
    console.log('❌ 指標データが取得できません');
    console.log('setupIndicatorSheet() を実行してシートを作成してください');
    return;
  }
  
  console.log('=== 指標データ読み取りテスト ===');
  for (var i = 0; i < MARKET_INDICATORS.length; i++) {
    var ind = MARKET_INDICATORS[i];
    var val = result[ind.key];
    if (val !== null && val !== undefined) {
      console.log('✅ ' + ind.label + ': ' + val.toFixed(ind.decimals) + ind.unit);
    } else {
      console.log('❌ ' + ind.label + ': データなし');
    }
  }
}

// ========================================
// レートキャッシュ日次集約
// ========================================
// 【呼び出し元】scheduler.gs の scheduleTodayPosts()（毎朝5:00）
// 【処理内容】
//   1. レートキャッシュから前日以前のデータを読み取り
//   2. 日付ごとにOHLC（始値/高値/安値/終値）を算出
//   3. 「日次レート」シートに1日1行で保存
//   4. 7日より古い生データをレートキャッシュから削除
// ========================================

/**
 * レートキャッシュの日次集約（毎朝5:00に自動実行）
 * - 前日以前のデータ → OHLC集約 → 「日次レート」シートへ
 * - 7日超の生データ → レートキャッシュから削除
 */
function aggregateDailyRates() {
  console.log('=== レートキャッシュ日次集約 ===');
  
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var cacheSheet = ss.getSheetByName('レートキャッシュ');
  
  if (!cacheSheet) {
    console.log('レートキャッシュシートがありません');
    return;
  }
  
  var lastRow = cacheSheet.getLastRow();
  if (lastRow <= 1) {
    console.log('集約対象のデータがありません');
    return;
  }
  
  // 全データ読み込み（ヘッダー除く）
  // 列: 日時, [7ペア], ソース, ステータス = 10列
  var numCols = 1 + CURRENCY_PAIRS.length + 2;
  var data = cacheSheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  console.log('レートキャッシュ: ' + data.length + '行');
  
  var now = new Date();
  var todayStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var cutoffStr = Utilities.formatDate(sevenDaysAgo, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  // ステータス列のインデックス
  var statusCol = 1 + CURRENCY_PAIRS.length + 1; // 0-indexed: 9
  
  // 日付ごとにグループ化
  var dailyData = {};
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var dateTime = row[0];
    if (!dateTime) continue;
    
    var dateStr;
    if (dateTime instanceof Date) {
      dateStr = Utilities.formatDate(dateTime, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else {
      dateStr = String(dateTime).substring(0, 10);
    }
    
    if (dateStr === todayStr) continue;
    if (row[statusCol] !== '成功') continue;
    
    // 各ペアのレートを取得
    var record = { time: dateTime };
    var valid = true;
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var val = parseFloat(row[1 + p]);
      if (isNaN(val)) { valid = false; break; }
      record[CURRENCY_PAIRS[p].key] = val;
    }
    if (!valid) continue;
    
    if (!dailyData[dateStr]) dailyData[dateStr] = [];
    dailyData[dateStr].push(record);
  }
  
  // 日次レートシートを取得（なければ作成）
  var dailySheet = ss.getSheetByName('日次レート');
  if (!dailySheet) {
    dailySheet = ss.insertSheet('日次レート');
    console.log('日次レートシートを新規作成');
  }
  if (dailySheet.getLastRow() < 1) {
    var headers = ['日付'];
    for (var h = 0; h < CURRENCY_PAIRS.length; h++) {
      var sym = CURRENCY_PAIRS[h].symbol;
      headers.push(sym + '始値', sym + '高値', sym + '安値', sym + '終値');
    }
    headers.push('データ件数');
    dailySheet.appendRow(headers);
  }
  
  // 既に集約済みの日付を取得
  var existingDates = {};
  var dailyLastRow = dailySheet.getLastRow();
  if (dailyLastRow > 1) {
    var existingData = dailySheet.getRange(2, 1, dailyLastRow - 1, 1).getValues();
    for (var j = 0; j < existingData.length; j++) {
      var d = existingData[j][0];
      if (d instanceof Date) {
        existingDates[Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd')] = true;
      } else if (d) {
        existingDates[String(d).substring(0, 10)] = true;
      }
    }
  }
  
  // OHLC算出して書き込み
  var dates = Object.keys(dailyData).sort();
  var aggregated = 0;
  
  for (var k = 0; k < dates.length; k++) {
    var date = dates[k];
    if (existingDates[date]) continue;
    
    var records = dailyData[date];
    records.sort(function(a, b) { return new Date(a.time) - new Date(b.time); });
    
    var row = [date];
    for (var p2 = 0; p2 < CURRENCY_PAIRS.length; p2++) {
      var ohlc = calcOHLC_(records, CURRENCY_PAIRS[p2].key);
      row.push(ohlc.open, ohlc.high, ohlc.low, ohlc.close);
    }
    row.push(records.length);
    
    dailySheet.appendRow(row);
    // ★v5.9.1: 書き込み後に数値フォーマットを強制（SheetsのDate自動変換防止）
    var newRow = dailySheet.getLastRow();
    var dataCols = 1 + CURRENCY_PAIRS.length * 4; // B列からOHLC全列
    dailySheet.getRange(newRow, 2, 1, dataCols).setNumberFormat('0.00000');
    console.log('  集約: ' + date + '（' + records.length + '件）');
    aggregated++;
  }
  
  // 7日より古いデータを削除
  var deletedRows = 0;
  for (var m = data.length - 1; m >= 0; m--) {
    var rowDate = data[m][0];
    var rowDateStr;
    if (rowDate instanceof Date) {
      rowDateStr = Utilities.formatDate(rowDate, 'Asia/Tokyo', 'yyyy-MM-dd');
    } else if (rowDate) {
      rowDateStr = String(rowDate).substring(0, 10);
    } else {
      continue;
    }
    if (rowDateStr < cutoffStr) {
      cacheSheet.deleteRow(m + 2);
      deletedRows++;
    }
  }
  
  console.log('');
  console.log('集約完了: ' + aggregated + '日分');
  console.log('キャッシュ削除: ' + deletedRows + '行（7日超の古いデータ）');
}

/**
 * Twelve Data APIから過去5年分の日次OHLCを取得して日次レートに書き込む
 * 3通貨ペア × 1回ずつ = 3 APIクレジット消費
 */
function rebuildDailyRates() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    '日次レート再構築（Twelve Data API）',
    '日次レートを全削除し、Twelve Data APIから過去5年分の正確なOHLCデータを取得します。\n' +
    CURRENCY_PAIRS.length + ' APIクレジットを消費します。続行しますか？',
    ui.ButtonSet.YES_NO
  );
  
  if (confirm !== ui.Button.YES) {
    ui.alert('キャンセルしました');
    return;
  }
  
  var keys = getApiKeys();
  var tdApiKey = keys.TWELVE_DATA_API_KEY;
  
  if (!tdApiKey) {
    ui.alert('❌ TWELVE_DATA_API_KEYが未設定です');
    return;
  }
  
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // 日次レートシートを取得（なければ作成）
  var dailySheet = ss.getSheetByName('日次レート');
  if (!dailySheet) {
    dailySheet = ss.insertSheet('日次レート');
  }
  
  // 既存データを削除
  if (dailySheet.getLastRow() > 1) {
    dailySheet.deleteRows(2, dailySheet.getLastRow() - 1);
    SpreadsheetApp.flush();
    console.log('日次レート: 既存データを削除');
  }
  
  // ヘッダーがなければ追加
  if (dailySheet.getLastRow() < 1) {
    var headers = ['日付'];
    for (var h = 0; h < CURRENCY_PAIRS.length; h++) {
      var sym = CURRENCY_PAIRS[h].symbol;
      headers.push(sym + '始値', sym + '高値', sym + '安値', sym + '終値');
    }
    headers.push('データ件数');
    dailySheet.appendRow(headers);
  }
  
  // 5年前の日付
  var now = new Date();
  var fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  var startDate = Utilities.formatDate(fiveYearsAgo, 'Asia/Tokyo', 'yyyy-MM-dd');
  var endDate = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  console.log('取得期間: ' + startDate + ' 〜 ' + endDate);
  
  // 全通貨ペアの日次OHLCを取得
  var allData = {};
  
  for (var s = 0; s < CURRENCY_PAIRS.length; s++) {
    var pair = CURRENCY_PAIRS[s];
    var url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(pair.symbol) +
      '&interval=1day&start_date=' + startDate + '&end_date=' + endDate +
      '&outputsize=5000&timezone=Asia/Tokyo&apikey=' + tdApiKey;
    
    console.log('📡 取得中: ' + pair.symbol + '...');
    
    try {
      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      
      if (response.getResponseCode() !== 200) {
        ui.alert('❌ ' + pair.symbol + ' の取得に失敗しました（HTTP ' + response.getResponseCode() + '）');
        return;
      }
      
      var data = JSON.parse(response.getContentText());
      
      if (data.code) {
        ui.alert('❌ APIエラー: ' + (data.message || data.code));
        return;
      }
      
      if (!data.values || data.values.length === 0) {
        ui.alert('❌ ' + pair.symbol + ' のデータが空です');
        return;
      }
      
      console.log('  ' + pair.symbol + ': ' + data.values.length + '日分取得');
      
      for (var i = 0; i < data.values.length; i++) {
        var v = data.values[i];
        var date = v.datetime;
        if (!allData[date]) allData[date] = {};
        allData[date][pair.key] = {
          open: parseFloat(v.open), high: parseFloat(v.high),
          low: parseFloat(v.low), close: parseFloat(v.close)
        };
      }
      
    } catch (e) {
      ui.alert('❌ ' + pair.symbol + ' の取得エラー: ' + e.message);
      return;
    }
    
    // API制限対策（8回/分）
    if (s < CURRENCY_PAIRS.length - 1) Utilities.sleep(1000);
  }
  
  // 日付順にソートして書き込み
  var dates = Object.keys(allData).sort();
  var rows = [];
  var numCols = 1 + CURRENCY_PAIRS.length * 4 + 1;
  
  for (var d = 0; d < dates.length; d++) {
    var date = dates[d];
    var day = allData[date];
    
    var row = [date];
    var complete = true;
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var ohlc = day[CURRENCY_PAIRS[p].key];
      if (!ohlc) { complete = false; break; }
      row.push(ohlc.open, ohlc.high, ohlc.low, ohlc.close);
    }
    if (!complete) continue;
    row.push(1);
    rows.push(row);
  }
  
  if (rows.length > 0) {
    dailySheet.getRange(2, 1, rows.length, numCols).setValues(rows);
    console.log('✅ ' + rows.length + '日分を書き込み完了');
  }
  
  updatePriceSummary();
  
  ui.alert('✅ 再構築完了\n\n' + rows.length + '日分の正確なOHLCデータを取得しました。\n' +
    '（期間: ' + dates[0] + ' 〜 ' + dates[dates.length - 1] + '）');
}

/**
 * データ配列からOHLC（始値/高値/安値/終値）を算出
 * ★外れ値除去: 中央値から大きく乖離したデータを除外してから計算
 * @param {Array} records - 時刻順にソートされたレコード
 * @param {string} field - 'usdjpy' / 'eurusd' / 'gbpusd'
 * @returns {Object} {open, high, low, close}
 */
function calcOHLC_(records, field) {
  var values = [];
  for (var i = 0; i < records.length; i++) {
    values.push(records[i][field]);
  }
  
  // IQR（四分位範囲）方式で外れ値除去（5件以上ある場合）
  if (values.length >= 5) {
    var sorted = values.slice().sort(function(a, b) { return a - b; });
    var q1 = sorted[Math.floor(sorted.length * 0.25)];
    var q3 = sorted[Math.floor(sorted.length * 0.75)];
    var iqr = q3 - q1;
    
    // IQRが極端に小さい場合（全部ほぼ同じ値）は最低幅を設定
    var minIqr = (field === 'usdjpy') ? 0.3 : 0.003;
    if (iqr < minIqr) iqr = minIqr;
    
    var lowerBound = q1 - 1.5 * iqr;
    var upperBound = q3 + 1.5 * iqr;
    
    console.log('  ' + field + ' Q1=' + q1 + ' Q3=' + q3 + 
      ' IQR=' + iqr.toFixed(4) + ' 範囲=[' + lowerBound.toFixed(4) + ', ' + upperBound.toFixed(4) + ']');
    
    // 時系列順序を維持してフィルタ
    var filteredValues = [];
    for (var j = 0; j < records.length; j++) {
      var val = records[j][field];
      if (val >= lowerBound && val <= upperBound) {
        filteredValues.push(val);
      } else {
        console.log('    外れ値除外: ' + val);
      }
    }
    
    // フィルタ後に2件以上残った場合のみ採用
    if (filteredValues.length >= 2) {
      return {
        open: filteredValues[0],
        high: Math.max.apply(null, filteredValues),
        low: Math.min.apply(null, filteredValues),
        close: filteredValues[filteredValues.length - 1]
      };
    }
  }
  
  // フィルタできない場合はそのまま
  return {
    open: values[0],
    high: Math.max.apply(null, values),
    low: Math.min.apply(null, values),
    close: values[values.length - 1]
  };
}

// ========================================
// 経済カレンダー シート作成 & 自動取得
// ========================================

/**
 * 「経済カレンダー」シートを作成する（初回のみ実行）
 * GASエディタから手動実行: setupEconomicCalendarSheet
 */
function setupEconomicCalendarSheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  var existing = ss.getSheetByName('経済カレンダー');
  if (existing) {
    console.log('⚠️ 「経済カレンダー」シートは既に存在します。');
    console.log('→ データを更新する場合は fetchEconomicCalendar() を実行してください。');
    return;
  }
  
  var sheet = ss.insertSheet('経済カレンダー');
  
  // ヘッダー
  var headers = ['日付', '時間(JST)', '国/地域', '指標名', '前回', '予想', '重要度', '備考'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // ヘッダーの書式設定
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#4a86c8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  
  // 列幅の設定
  sheet.setColumnWidth(1, 120); // 日付
  sheet.setColumnWidth(2, 90);  // 時間
  sheet.setColumnWidth(3, 80);  // 国/地域
  sheet.setColumnWidth(4, 250); // 指標名
  sheet.setColumnWidth(5, 80);  // 前回
  sheet.setColumnWidth(6, 80);  // 予想
  sheet.setColumnWidth(7, 60);  // 重要度
  sheet.setColumnWidth(8, 200); // 備考
  
  // 1行目を固定
  sheet.setFrozenRows(1);
  
  // 入力規則: G列（重要度）にプルダウン
  var importanceRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['高', '中', '低'], true)
    .build();
  sheet.getRange(2, 7, 100, 1).setDataValidation(importanceRule);
  
  console.log('✅ 「経済カレンダー」シートを作成しました');
  console.log('→ 次に fetchEconomicCalendar() を実行してデータを取得してください');
}

/**
 * ★v5.7: 経済カレンダーシートにI列（結果）・J列（判定）を追加する
 * 既存データは一切変更しない。ヘッダーと書式のみ追加。
 * GASエディタから手動実行: setupIndicatorResultColumns
 */
function setupIndicatorResultColumns() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('経済カレンダー');
  
  if (!sheet) {
    console.log('❌ 「経済カレンダー」シートが見つかりません');
    console.log('→ 先に setupEconomicCalendarSheet() を実行してください');
    return;
  }
  
  // 既にI列にヘッダーがあるかチェック
  var currentHeaders = sheet.getRange(1, 1, 1, Math.min(sheet.getLastColumn(), 10)).getValues()[0];
  
  if (currentHeaders.length >= 9 && currentHeaders[8] === '結果') {
    console.log('⚠️ I列「結果」は既に存在します。スキップします。');
    return;
  }
  
  // I列（9列目）にヘッダー「結果」を追加
  sheet.getRange(1, 9).setValue('結果');
  sheet.getRange(1, 9).setBackground('#4a86c8');
  sheet.getRange(1, 9).setFontColor('#ffffff');
  sheet.getRange(1, 9).setFontWeight('bold');
  sheet.getRange(1, 9).setHorizontalAlignment('center');
  sheet.setColumnWidth(9, 100);
  
  // J列（10列目）にヘッダー「判定」を追加
  sheet.getRange(1, 10).setValue('判定');
  sheet.getRange(1, 10).setBackground('#4a86c8');
  sheet.getRange(1, 10).setFontColor('#ffffff');
  sheet.getRange(1, 10).setFontWeight('bold');
  sheet.getRange(1, 10).setHorizontalAlignment('center');
  sheet.setColumnWidth(10, 80);
  
  // J列（判定）にプルダウンを設定
  var lastRow = Math.max(sheet.getLastRow(), 100);
  var judgmentRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['上振れ', '下振れ', '一致'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 10, lastRow - 1, 1).setDataValidation(judgmentRule);
  
  console.log('✅ 経済カレンダーにI列（結果）・J列（判定）を追加しました');
  console.log('  A:日付 B:時間 C:国 D:指標名 E:前回 F:予想 G:重要度 H:備考 I:結果 J:判定');
  console.log('→ 次に testFetchIndicatorResults() でテスト実行してください');
}

/**
 * GASエディタから手動実行: testFetchIndicatorResults
 */
function testFetchIndicatorResults() {
  var keys = getApiKeys();
  
  console.log('=== 指標結果自動取得テスト ===');
  console.log('');
  
  // Step 1: 対象日の確認
  var targetDate = getIndicatorTargetDate_();
  var targetStr = Utilities.formatDate(targetDate, 'Asia/Tokyo', 'yyyy/MM/dd（E）');
  console.log('対象日: ' + targetStr);
  console.log('');
  
  // Step 2: 対象指標の確認
  var indicators = getYesterdayIndicators_(keys.SPREADSHEET_ID, targetDate);
  console.log('対象指標数: ' + (indicators ? indicators.length : 0) + '件');
  
  if (!indicators || indicators.length === 0) {
    console.log('→ 対象日に重要指標がないか、既に結果が記入済みです。');
    console.log('');
    console.log('ヒント: 経済カレンダーの対象日に重要度「高」「中」の指標があり、');
    console.log('I列（結果）が空白であることを確認してください。');
    return;
  }
  
  for (var i = 0; i < indicators.length; i++) {
    var ind = indicators[i];
    var enName = getEnglishIndicatorName_(ind.name, ind.country);
    console.log('  ' + (i + 1) + '. ' + ind.name);
    console.log('     英語名: ' + enName);
    console.log('     予想: ' + ind.forecast + ' / 前回: ' + ind.previous);
    console.log('     シート行: ' + ind.rowIndex);
  }
  console.log('');
  
  // Step 3: Gemini+Grounding呼び出し
  console.log('Gemini+Grounding呼び出し中...');
  var result = fetchIndicatorResults_(keys.SPREADSHEET_ID, keys.GEMINI_API_KEY);
  
  console.log('');
  if (result) {
    console.log('=== 生成された注入テキスト ===');
    console.log(result);
  } else {
    console.log('結果取得失敗（上のログを確認してください）');
  }
  
  console.log('');
  console.log('=== テスト完了 ===');
}

/**
 * 「経済指標_貼り付け」シートを作成する（初回のみ実行）
 * 外為どっとコムからコピーしたデータを貼り付ける場所
 * GASエディタから手動実行: setupRawImportSheet
 */
function setupRawImportSheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  var existing = ss.getSheetByName('経済指標_貼り付け');
  if (existing) {
    console.log('⚠️ 「経済指標_貼り付け」シートは既に存在します。');
    console.log('→ データを貼り付けてから importFromRawSheet() を実行してください。');
    return;
  }
  
  var sheet = ss.insertSheet('経済指標_貼り付け');
  
  // 説明を記入
  sheet.getRange('A1').setValue('【使い方】このシートのA3セルから下に、外為どっとコムの経済指標カレンダーをコピー＆ペーストしてください');
  sheet.getRange('A1').setFontWeight('bold');
  sheet.getRange('A1').setFontColor('#d32f2f');
  sheet.getRange('A2').setValue('貼り付け後、GASエディタで importFromRawSheet を実行すると「経済カレンダー」シートに変換されます');
  sheet.getRange('A2').setFontColor('#666666');
  
  // 列幅
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 300);
  sheet.setColumnWidth(4, 60);
  sheet.setColumnWidth(5, 100);
  sheet.setColumnWidth(6, 100);
  sheet.setColumnWidth(7, 100);
  
  console.log('✅ 「経済指標_貼り付け」シートを作成しました');
  console.log('');
  console.log('【手順】');
  console.log('1. 外為どっとコム（https://www.gaitame.com/markets/calendar/）を開く');
  console.log('2. 表の部分を選択してコピー');
  console.log('3. 「経済指標_貼り付け」シートのA3セルに貼り付け');
  console.log('4. GASエディタで importFromRawSheet を実行');
}

/**
 * 「経済指標_貼り付け」シートのデータをパースして「経済カレンダー」に書き込む
 * GASエディタから手動実行: importFromRawSheet
 */
function importFromRawSheet() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // 貼り付けシートの確認
  var rawSheet = ss.getSheetByName('経済指標_貼り付け');
  if (!rawSheet) {
    console.log('❌ 「経済指標_貼り付け」シートがありません。setupRawImportSheet() を先に実行してください。');
    return;
  }
  
  // 経済カレンダーシートの確認
  var calSheet = ss.getSheetByName('経済カレンダー');
  if (!calSheet) {
    setupEconomicCalendarSheet();
    calSheet = ss.getSheetByName('経済カレンダー');
  }
  
  // データ読み取り（A3から開始）
  var lastRow = rawSheet.getLastRow();
  if (lastRow < 3) {
    console.log('❌ データが貼り付けられていません。A3セルからデータを貼り付けてください。');
    return;
  }
  
  var lastCol = rawSheet.getLastColumn();
  if (lastCol < 1) lastCol = 9;
  var data = rawSheet.getRange(3, 1, lastRow - 2, Math.min(lastCol, 10)).getValues();
  
  console.log('=== 経済指標データ変換開始 ===');
  console.log('読み取り行数: ' + data.length);
  console.log('読み取り列数: ' + Math.min(lastCol, 10));
  
  // パース
  var now = new Date();
  var currentYear = now.getFullYear();
  var currentDate = '';
  var events = [];
  var skippedCountries = {};
  
  // 対象国マッピング
  var countryMap = {
    'アメリカ': '米国',
    '米国': '米国',
    '日本': '日本',
    'ユーロ': 'ユーロ圏',
    'イギリス': '英国',
    '英国': '英国',
    'オーストラリア': '豪州',
    '豪州': '豪州'
  };
  
  // 時刻パターン（HH:MM or H:MM、秒付きのHH:MM:SSにも対応）
  var timePattern = /^(\d{1,2}):(\d{2})(:\d{2})?$/;
  // 日付パターン（M/D(曜) or MM/DD(曜)）
  var datePattern = /^(\d{1,2})\/(\d{1,2})\s*[\(（].*[\)）]?/;
  // 数値パターン（前回値・予想値の判定用）
  var numericPattern = /[\d]/;
  
  var currentTime    = '';
  var currentCountry = null;
  var lastEventValid = false;

  for (var i = 0; i < data.length; i++) {
    var rawA = data[i][0];
    var rawB = data[i][1];
    var rawC = data[i][2];

    // 全セルを文字列に変換（Date型対策）
    var colA = (rawA instanceof Date)
      ? (rawA.getHours() + ':' + ('0' + rawA.getMinutes()).slice(-2))
      : String(rawA || '').trim();
    var colB = (rawB instanceof Date)
      ? (rawB.getHours() + ':' + ('0' + rawB.getMinutes()).slice(-2))
      : String(rawB || '').trim();
    var colC = String(rawC          || '').trim();
    var colD = String(data[i][3]    || '').trim();
    var colE = String(data[i][4]    || '').trim();
    var colF = String(data[i][5]    || '').trim();

    // 空行スキップ
    if (!colA && !colB && !colC) continue;

    // ヘッダー行スキップ
    if (colA === '日付') continue;

    // ① 日付行: A="3/9(月)" パターン
    var dateMatch = colA.match(datePattern);
    if (dateMatch) {
      var month = parseInt(dateMatch[1]);
      var day   = parseInt(dateMatch[2]);
      currentDate    = currentYear + '/' + ('0' + month).slice(-2) + '/' + ('0' + day).slice(-2);
      currentTime    = '';
      currentCountry = null;
      continue;
    }

    // ② 休場・祝日スキップ
    if (colA === '休場' || colB === '休場') continue;

    // ③ セパレータ行: B が Date型（時刻）かつ C に [国名] がある
    if (rawB instanceof Date && colC) {
      var rawCountry = colC.replace(/^[\[【\[［]/, '').replace(/[\]】\]］]$/, '');
      var mapped = countryMap[rawCountry];
      if (mapped) {
        currentTime    = colB;
        currentCountry = mapped;
      } else {
        // 対象外の国 → currentCountryをnullにして次の指標行をスキップさせる
        currentTime    = colB;
        currentCountry = null;
        lastEventValid = false;
        skippedCountries[rawCountry] = (skippedCountries[rawCountry] || 0) + 1;
      }
      continue;
    }

    // ④ 継続行: A が "(" または "（" で始まる（前回値の修正値行）
    //    A=修正前回値  B=予想  C=結果
    if (/^[（(]/.test(colA)) {
      if (events.length > 0 && lastEventValid) {
        var lastEv = events[events.length - 1];
        lastEv.previous = lastEv.previous + colA;
        if (!lastEv.forecast && colB) lastEv.forecast = colB;
        if (!lastEv.result   && colC) {
          lastEv.result = colC;
          if (lastEv.forecast && lastEv.result) {
            lastEv.judgment = judgeDeviation_(lastEv.forecast, lastEv.result);
          }
        }
      }
      continue;
    }

    // ⑤ 指標行: A が空、B が文字列（指標名）
    //    B=指標名  D=前回  E=予想  F=結果
    if (!colA && colB && !(rawB instanceof Date)) {
      if (!currentCountry || !currentDate) continue; // 対象外の国はスキップ

      var indicator = colB;
      var previous  = colD;
      var forecast  = colE;
      var result    = colF;
      var judgment  = (forecast && result) ? judgeDeviation_(forecast, result) : '';
      var importance = judgeImportance_(indicator);
      var note = '';

      // 24:00以上の時刻の注記
      var hourMatch = currentTime.match(/^(\d+):(\d+)/);
      if (hourMatch && parseInt(hourMatch[1]) >= 24) {
        note = '翌' + (parseInt(hourMatch[1]) - 24) + ':' + hourMatch[2];
      }

      events.push({
        date:       currentDate,
        time:       currentTime,
        country:    currentCountry,
        name:       indicator,
        previous:   previous,
        forecast:   forecast,
        importance: importance,
        note:       note,
        result:     result,
        judgment:   judgment
      });
      lastEventValid = true;
      continue;
    }

    // ⑥ それ以外はスキップ
  }

  // スキップされた国を表示
  var skippedList = [];
  for (var c in skippedCountries) {
    skippedList.push(c + '(' + skippedCountries[c] + '件)');
  }
  if (skippedList.length > 0) {
    console.log('🚫 対象外の国を除外: ' + skippedList.join(', '));
  }
  
  // 重複除去（日付+時刻+指標名が同一のデータ）
  var seen = {};
  var unique = [];
  for (var u = 0; u < events.length; u++) {
    var key = events[u].date + '_' + events[u].time + '_' + events[u].name;
    if (!seen[key]) {
      seen[key] = true;
      unique.push(events[u]);
    }
  }
  if (unique.length < events.length) {
    console.log('📌 重複を除去: ' + events.length + '件 → ' + unique.length + '件');
  }
  events = unique;
  
  if (events.length === 0) {
    console.log('⚠️ 対象データが0件でした。貼り付けデータを確認してください。');
    return;
  }
  
  // 経済カレンダーシートに書き込み
  // 既存データをクリア（I列・J列も含めて10列）
  if (calSheet.getLastRow() > 1) {
    var clearRows = calSheet.getLastRow() - 1;
    calSheet.getRange(2, 1, clearRows, 10).clearContent();
    calSheet.getRange(2, 1, clearRows, 10).setBackground(null);
  }
  
  var rows = [];
  for (var j = 0; j < events.length; j++) {
    var ev = events[j];
    var judgment = ev.judgment || '';
    rows.push([
      ev.date,       // A: 日付
      ev.time,       // B: 時間(JST)
      ev.country,    // C: 国/地域
      ev.name,       // D: 指標名
      ev.previous,   // E: 前回
      ev.forecast,   // F: 予想
      ev.importance, // G: 重要度
      ev.note,       // H: 備考
      ev.result,     // I: 結果
      judgment       // J: 判定
    ]);
  }
  
  calSheet.getRange(2, 1, rows.length, 10).setValues(rows);
  
  // 重要度「高」の行を黄色ハイライト
  for (var k = 0; k < rows.length; k++) {
    if (rows[k][6] === '高') {
      calSheet.getRange(k + 2, 1, 1, 10).setBackground('#fff9c4');
    }
  }
  
  // 日付列のフォーマット
  calSheet.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy/mm/dd');
  
  // 最終更新日時（H1に書く。J1はヘッダー「判定」のため上書きしない）
  var now2 = new Date();
  calSheet.getRange('H1').setValue('最終更新: ' + Utilities.formatDate(now2, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  calSheet.getRange('H1').setFontSize(9);
  calSheet.getRange('H1').setFontColor('#ffffff');
  
  console.log('');
  console.log('✅ 経済カレンダーに ' + rows.length + '件を書き込みました');
  
  // 貼り付けシートをクリア（ヘッダー2行は残す）
  if (rawSheet.getLastRow() > 2) {
    rawSheet.getRange(3, 1, rawSheet.getLastRow() - 2, rawSheet.getLastColumn()).clearContent();
  }
  console.log('🗑️ 貼り付けシートをクリアしました');
  console.log('');
  
  // 内容をログに表示
  console.log('=== 取得結果一覧 ===');
  var highCount = 0;
  var midCount = 0;
  for (var m = 0; m < rows.length; m++) {
    var line = rows[m][0] + ' ' + rows[m][1] + ' [' + rows[m][2] + '] ' + rows[m][3];
    if (rows[m][4] || rows[m][5]) {
      line += '（前回:' + (rows[m][4] || '-') + ' 予想:' + (rows[m][5] || '-') + '）';
    }
    if (rows[m][6] === '高') { line += ' ★'; highCount++; }
    else { midCount++; }
    console.log(line);
  }
  console.log('');
  console.log('重要度 高: ' + highCount + '件 / 中: ' + midCount + '件');
  
  // ★v6.7: インポート後にINDICATOR・結果取得トリガーを再設定
  // 5:00以降にインポートした場合でも重要指標のトリガーが確実に設定される
  var nowForTrigger = new Date();
  var dayForTrigger = nowForTrigger.getDay();
  if (dayForTrigger >= 1 && dayForTrigger <= 5) { // 平日のみ
    try {
      scheduleIndicatorTriggers_();   // INDICATOR投稿（発表30分前）
      scheduleResultFetchTriggers_(); // 結果取得（発表5分後）
      console.log('✅ トリガーを再設定しました');
    } catch (e) {
      console.log('⚠️ トリガー再設定エラー（続行）: ' + e.message);
    }
  }
}

/**
 * 指標名から重要度を自動判定する
 * @param {string} name - 指標名
 * @return {string} '高' or '中'
 */
function judgeImportance_(name) {
  // 全角→半角変換してマッチしやすくする
  var n = name.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
  var upper = n.toUpperCase();
  
  // 重要度「高」の指標
  var highPatterns = [
    'GDP', '国内総生産',
    'CPI', '消費者物価指数',
    '雇用統計', '非農業部門雇用者数', 'NFP',
    'FOMC', '連邦公開市場委員会',
    'PCE', '個人消費支出',
    '日銀', '金融政策決定会合',
    'BOE', 'イングランド銀行',
    'ECB', '欧州中央銀行',
    'RBA', '豪準備銀行', '豪中銀',
    'ISM製造業', 'ISM非製造業',
    '政策金利'
  ];
  
  for (var i = 0; i < highPatterns.length; i++) {
    if (upper.indexOf(highPatterns[i].toUpperCase()) !== -1) {
      return '高';
    }
  }
  
  return '中';
}

/**
 * Gemini + Google検索で経済指標カレンダーを自動取得してシートに書き込む
 * 今週と来週を別々に取得して合算する（精度向上のため分割）
 * GASエディタから手動実行: fetchEconomicCalendar
 * 週1回（日曜）実行推奨。トリガーで自動化も可能。
 */
function fetchEconomicCalendar() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  
  // シートがなければ作成
  var sheet = ss.getSheetByName('経済カレンダー');
  if (!sheet) {
    setupEconomicCalendarSheet();
    sheet = ss.getSheetByName('経済カレンダー');
  }
  
  // 日付計算
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dayOfWeek = today.getDay();
  
  // 今週月曜〜日曜
  var thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  var thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);
  
  // 来週月曜〜日曜
  var nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  var nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);
  
  console.log('=== 経済カレンダー取得（2週間分） ===');
  
  // --- 今週分を取得 ---
  var thisWeekFrom = Utilities.formatDate(thisMonday, 'Asia/Tokyo', 'yyyy年M月d日');
  var thisWeekTo = Utilities.formatDate(thisSunday, 'Asia/Tokyo', 'yyyy年M月d日');
  console.log('📅 今週: ' + thisWeekFrom + ' 〜 ' + thisWeekTo);
  
  var thisWeekEvents = fetchCalendarWeek_(keys, thisWeekFrom, thisWeekTo);
  console.log('  → 今週: ' + thisWeekEvents.length + '件');
  
  // レート制限回避
  Utilities.sleep(5000);
  
  // --- 来週分を取得 ---
  var nextWeekFrom = Utilities.formatDate(nextMonday, 'Asia/Tokyo', 'yyyy年M月d日');
  var nextWeekTo = Utilities.formatDate(nextSunday, 'Asia/Tokyo', 'yyyy年M月d日');
  console.log('📅 来週: ' + nextWeekFrom + ' 〜 ' + nextWeekTo);
  
  var nextWeekEvents = fetchCalendarWeek_(keys, nextWeekFrom, nextWeekTo);
  console.log('  → 来週: ' + nextWeekEvents.length + '件');
  
  // --- 合算してシートに書き込み ---
  var allEvents = thisWeekEvents.concat(nextWeekEvents);
  
  if (allEvents.length === 0) {
    console.log('⚠️ 経済指標データが0件でした。手動入力をお願いします。');
    console.log('確認先: https://www.gaitame.com/markets/calendar/');
    return;
  }
  
  // 既存データをクリア（ヘッダーは残す）
  if (sheet.getLastRow() > 1) {
    var clearRows = sheet.getLastRow() - 1;
    sheet.getRange(2, 1, clearRows, 8).clearContent();
    sheet.getRange(2, 1, clearRows, 8).setBackground(null);
  }
  
  // 対象国フィルタリング（プロンプトで指定しても漏れる場合のセーフティネット）
  var allowedCountries = ['米国', '日本', 'ユーロ圏', '英国'];
  var filtered = [];
  var skipped = [];
  for (var f = 0; f < allEvents.length; f++) {
    var country = String(allEvents[f].country || '').trim();
    if (allowedCountries.indexOf(country) !== -1) {
      filtered.push(allEvents[f]);
    } else {
      skipped.push(country + ': ' + (allEvents[f].name || ''));
    }
  }
  if (skipped.length > 0) {
    console.log('🚫 対象外の国を除外: ' + skipped.join(', '));
  }
  allEvents = filtered;
  
  if (allEvents.length === 0) {
    console.log('⚠️ フィルタ後のデータが0件です。手動入力をお願いします。');
    return;
  }
  
  // シートに書き込み
  var rows = [];
  for (var i = 0; i < allEvents.length; i++) {
    var ev = allEvents[i];
    rows.push([
      ev.date || '',
      ev.time || '',
      ev.country || '',
      ev.name || '',
      ev.previous || '',
      ev.forecast || '',
      ev.importance || '中',
      ev.note || ''
    ]);
  }
  
  sheet.getRange(2, 1, rows.length, 8).setValues(rows);
  
  // 重要度「高」の行を黄色ハイライト
  for (var j = 0; j < rows.length; j++) {
    if (rows[j][6] === '高') {
      sheet.getRange(j + 2, 1, 1, 8).setBackground('#fff9c4');
    }
  }
  
  // 日付列のフォーマット
  sheet.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy/mm/dd');
  
  // 最終更新日時を記録
  var lastUpdateCell = sheet.getRange('J1');
  lastUpdateCell.setValue('最終更新: ' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  lastUpdateCell.setFontSize(9);
  lastUpdateCell.setFontColor('#888888');
  
  console.log('✅ 経済カレンダーを更新: 合計 ' + rows.length + '件');
  
  // 内容をログに表示（目視確認用）
  console.log('');
  console.log('=== 取得結果一覧 ===');
  for (var k = 0; k < rows.length; k++) {
    var line = rows[k][0] + ' ' + rows[k][1] + ' [' + rows[k][2] + '] ' + rows[k][3];
    if (rows[k][6] === '高') line += ' ★';
    console.log(line);
  }
  console.log('');
  console.log('⚠️ 重要: AI生成のため誤りの可能性があります。');
  console.log('⚠️ 必ず以下で目視確認してください:');
  console.log('   https://www.gaitame.com/markets/calendar/');
  console.log('   間違いがあればシート上で直接修正してください。');
}

/**
 * 1週間分の経済指標をGemini + Google検索で取得する（内部関数）
 * @param {Object} keys - APIキー
 * @param {string} fromStr - 開始日（例: "2026年2月23日"）
 * @param {string} toStr - 終了日（例: "2026年3月1日"）
 * @return {Array} イベント配列
 */
function fetchCalendarWeek_(keys, fromStr, toStr) {
  var yearStr = fromStr.substring(0, 4);
  
  var prompt = '以下の期間のFX関連の主要経済指標を、Google検索で調べてJSON形式で返してください。\n\n';
  prompt += '【対象期間】 ' + fromStr + '（月） 〜 ' + toStr + '（日）\n\n';
  prompt += '【対象国（この4地域のみ。他は一切含めるな）】\n';
  prompt += '・米国\n・日本\n・ユーロ圏（ドイツ単独の指標は含めるな。ユーロ圏全体のみ）\n・英国\n';
  prompt += '※NZ、豪州、カナダ、中国、ドイツ単独の指標は対象外。含めるな。\n\n';
  prompt += '【検索キーワード例】\n';
  prompt += '・「経済指標カレンダー ' + fromStr.replace('年', '/').replace('月', '/').replace('日', '') + '」\n';
  prompt += '・「FX 経済指標 今週 来週 ' + yearStr + '年」\n';
  prompt += '・site:fx.minkabu.jp 経済指標\n';
  prompt += '・site:gaitame.com 経済指標カレンダー\n\n';
  prompt += '【取得すべき指標の例（この期間に該当するものだけ探せ）】\n';
  prompt += '米国: 雇用統計(NFP)、CPI、コアCPI、PPI、PCEデフレーター、コアPCE、GDP(速報/改定/確報)、\n';
  prompt += '      小売売上高、ISM製造業/非製造業、新規失業保険申請件数、FOMC議事録/声明、\n';
  prompt += '      耐久財受注、住宅着工件数、中古住宅販売、消費者信頼感指数、ミシガン大消費者信頼感\n';
  prompt += '日本: 日銀金融政策決定会合、CPI(全国/東京)、GDP、機械受注、貿易収支\n';
  prompt += 'ユーロ圏: ECB政策金利、ユーロ圏CPI/HICP、PMI(製造業/サービス業)、ZEW景況感\n';
  prompt += '英国: BOE政策金利、CPI、雇用統計、小売売上高、PMI\n\n';
  prompt += '【出力形式】JSON配列のみ出力。説明文は一切不要。\n';
  prompt += '[\n';
  prompt += '  {"date":"' + yearStr + '/MM/DD","time":"HH:MM","country":"米国","name":"指標名（対象月）","previous":"前回値","forecast":"予想値","importance":"高or中","note":"備考"}\n';
  prompt += ']\n\n';
  prompt += '【ルール】\n';
  prompt += '・検索結果で確認できた指標のみ返せ。推測で作るな。\n';
  prompt += '・時間は日本時間(JST)。米国指標は夏時間なら21:30、冬時間なら22:30等。\n';
  prompt += '・前回値・予想値が不明なら空文字 "" にせよ。\n';
  prompt += '・countryの値は必ず「米国」「日本」「ユーロ圏」「英国」の4つのどれか。\n';
  prompt += '・重要度の基準:\n';
  prompt += '  高 = 雇用統計(NFP)、CPI、コアCPI、PCEデフレーター、GDP、FOMC声明/議事録、日銀会合、ECB/BOE政策金利\n';
  prompt += '  中 = PPI、小売売上高、ISM、住宅指標、耐久財受注、消費者信頼感、新規失業保険申請件数、PMI、ZEW、機械受注、貿易収支、東京CPI\n';
  prompt += '・最低でも5件以上は見つかるはず。1〜2件しか見つからない場合は検索を追加で試みよ。\n';
  prompt += '・[ で始めて ] で終えること。```json等は不要。\n';
  
  var url = GEMINI_API_URL + GEMINI_MODEL + ':generateContent?key=' + keys.GEMINI_API_KEY;
  
  var requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096
    },
    tools: [{ google_search: {} }]
  };
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };
  
  var response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (e) {
    console.log('  ❌ API通信エラー: ' + e.message);
    return [];
  }
  
  var code = response.getResponseCode();
  if (code !== 200) {
    console.log('  ❌ Gemini API エラー (' + code + ')');
    return [];
  }
  
  var body = JSON.parse(response.getContentText());
  var rawText = extractTextFromResponse_(body);
  
  if (!rawText) {
    console.log('  ❌ Geminiからテキスト応答なし');
    return [];
  }
  
  // JSONパース
  var jsonText = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    var events = JSON.parse(jsonText);
    if (Array.isArray(events)) {
      return events;
    }
  } catch (e) {
    console.log('  ❌ JSONパースエラー: ' + e.message);
    console.log('  生テキスト（先頭200文字）: ' + jsonText.substring(0, 200));
  }
  
  return [];
}

/**
 * 経済カレンダーの取得テスト（書き込みなし、ログ確認用）
 */
function testFetchCalendar() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('経済カレンダー');
  
  if (!sheet) {
    console.log('⚠️ まず setupEconomicCalendarSheet() を実行してください');
    return;
  }
  
  // 現在のデータを表示
  if (sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
    console.log('=== 現在の経済カレンダーデータ ===');
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] && data[i][3]) {
        var dateStr = '';
        try {
          dateStr = Utilities.formatDate(new Date(data[i][0]), 'Asia/Tokyo', 'M/d');
        } catch(e) {
          dateStr = String(data[i][0]);
        }
        console.log(dateStr + ' ' + data[i][1] + ' [' + data[i][2] + '] ' + data[i][3] + (data[i][6] === '高' ? ' ★' : ''));
      }
    }
    console.log('合計: ' + data.length + '件');
  } else {
    console.log('（データなし。fetchEconomicCalendar() を実行してください）');
  }
  
  // プロンプト注入のテスト
  console.log('\n=== プロンプト注入テスト ===');
  var calToday = getEconomicCalendar_('today');
  console.log('【today】' + (calToday || '（なし）'));
  
  var calNextWeek = getEconomicCalendar_('next_week');
  console.log('【next_week】' + (calNextWeek || '（なし）'));
}


// ========================================
// テスト: レート注入修正確認 ★v5.9.1
// ========================================

/**
 * キャッシュフォールバックのテスト
 * 実行: GASエディタから直接実行
 */
function testCacheFallback() {
  var keys = getApiKeys();
  
  console.log('=== 1. getLatestRatesFromCache_ テスト ===');
  var cacheRates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
  if (cacheRates) {
    console.log('✅ キャッシュフォールバック成功');
    console.log('  source: ' + cacheRates.source);
    console.log('  USD/JPY: ' + cacheRates.usdjpy);
    console.log('  EUR/USD: ' + cacheRates.eurusd);
    console.log('  GBP/USD: ' + cacheRates.gbpusd);
    console.log('  EUR/JPY: ' + cacheRates.eurjpy);
    console.log('  GBP/JPY: ' + cacheRates.gbpjpy);
    console.log('  AUD/JPY: ' + cacheRates.audjpy);
    console.log('  AUD/USD: ' + cacheRates.audusd);
  } else {
    console.log('❌ キャッシュフォールバック失敗（キャッシュにデータなし）');
  }
  
  console.log('\n=== 2. getLatestRateText_ テスト ===');
  var rateText = getLatestRateText_(keys.SPREADSHEET_ID);
  if (rateText) {
    console.log('✅ 出力:');
    console.log(rateText);
  } else {
    console.log('❌ テキスト生成失敗');
  }
}

/**
 * buildPrompt_のレート注入箇所を確認するテスト
 * LONDONタイプでプロンプトを組み立て、レート関連部分だけ抽出して表示
 * 実行: GASエディタから直接実行
 */
function testRateInjection() {
  console.log('=== buildPrompt_ レート注入確認 ===\n');
  
  // rates=null のケース（APIが失敗した場合を再現）
  console.log('--- ケースA: rates=null（API失敗時）---');
  var promptA = buildPrompt_('LONDON', POST_TYPES['LONDON'], {}, null);
  extractAndLogRateSection_(promptA);
  
  // rates有りのケース
  console.log('\n--- ケースB: rates有り（通常時）---');
  var keys = getApiKeys();
  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
  if (rates) {
    var promptB = buildPrompt_('LONDON', POST_TYPES['LONDON'], {}, rates);
    extractAndLogRateSection_(promptB);
  } else {
    console.log('（キャッシュなしのためスキップ）');
  }
}

/**
 * プロンプトからレート関連セクションを抽出してログ出力（テスト用ヘルパー）
 * @param {string} prompt - 組み立て済みプロンプト
 */
function extractAndLogRateSection_(prompt) {
  var lines = prompt.split('\n');
  var rateLines = [];
  
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf('レート') !== -1 ||
        line.indexOf('USD/JPY') !== -1 ||
        line.indexOf('確定レート') !== -1 ||
        line.indexOf('意識される') !== -1 ||
        line.indexOf('実勢レート') !== -1 ||
        line.indexOf('API未接続') !== -1 ||
        line.indexOf('レート取得') !== -1 ||
        line.indexOf('市場環境') !== -1) {
      for (var j = i; j < Math.min(i + 6, lines.length); j++) {
        rateLines.push('L' + (j + 1) + ': ' + lines[j]);
      }
      rateLines.push('...');
      i += 5;
    }
  }
  
  if (rateLines.length > 0) {
    console.log(rateLines.join('\n'));
  } else {
    console.log('（レート関連セクションが見つかりません）');
  }
  
  console.log('\nプロンプト全体: ' + prompt.length + '文字');
}



// ========================================
// EUR/JPY安値Date型バグ修正 ★v5.9.1
// ========================================

/**
 * 日次レートシートのDate型セルを数値に修正し、レートサマリーを再計算
 * 実行: GASエディタから手動実行（1回のみ）
 */
function fixDateBugInDailyRates() {
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('日次レート');
  
  if (!sheet || sheet.getLastRow() < 2) {
    console.log('日次レートシートがありません');
    return;
  }
  
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  
  var fixCount = 0;
  
  for (var i = 0; i < data.length; i++) {
    for (var j = 1; j < data[i].length; j++) {
      var val = data[i][j];
      if (val instanceof Date) {
        // Date型をSheetsシリアル値に戻す
        var baseDate = new Date(Date.UTC(1899, 11, 30, 0, 0, 0));
        var serial = (val.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000);
        data[i][j] = serial;
        fixCount++;
        console.log('  修正: 行' + (i+2) + ' 列' + (j+1) + ' ' + val + ' → ' + serial.toFixed(5));
      }
    }
  }
  
  if (fixCount > 0) {
    // 修正データを書き戻し
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
    // 数値列を全て数値フォーマットに強制
    sheet.getRange(2, 2, data.length, lastCol - 1).setNumberFormat('0.00000');
    console.log('\n✅ ' + fixCount + '個のDate型セルを数値に修正しました');
    
    // レートサマリーも再計算
    console.log('\nレートサマリーを再計算します...');
    updatePriceSummary();
    console.log('✅ 完了！レートサマリーシートを確認してください');
  } else {
    console.log('✅ Date型のセルは見つかりませんでした（問題なし）');
  }
}

// ===== ファクトチェック自動化 ★v6.1 =====
/**
 * 投稿テキストの事実をGemini + Groundingで自動検証
 * 
 * @param {string} postText - 検証対象の投稿テキスト
 * @param {string} postType - 投稿タイプ（MORNING等）
 * @param {string} apiKey - Gemini APIキー
 * @return {Object} { passed: boolean, summary: string, details: string, issues: Array }
 */
function factCheckPost_(postText, postType, apiKey) {
  try {
    // RULE系は個人の経験談が主体なのでスキップ
    var skipTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4'];
    if (skipTypes.indexOf(postType) !== -1) {
      return { passed: true, summary: 'スキップ（心得投稿）', details: '', issues: [] };
    }
    
    var prompt = 'あなたはFX市場専門のファクトチェッカーです。\n';
    prompt += '以下のX投稿に含まれる「事実の主張」を1つずつ抜き出し、Google検索で裏付けを確認してください。\n\n';
    prompt += '【検証対象の投稿テキスト】\n';
    prompt += postText + '\n\n';
    prompt += '【検証すべき事実】\n';
    prompt += '・要人発言: 誰が、いつ、何を言ったか（発言者の混同がないか）\n';
    prompt += '・経済指標: 名称、日付、予想値、前回値、結果値が正確か\n';
    prompt += '・レート水準: 具体的な数値が現実と一致するか\n';
    prompt += '・日付の整合性: 「今日」「昨日」の出来事が本当にその日か\n';
    prompt += '・中央銀行の政策: RBA/FRB/日銀等の決定内容が正確か\n\n';
    prompt += '【検証不要】\n';
    prompt += '・個人の感想（「マジで注目」「面白い」等）\n';
    prompt += '・相場観（「上がりそう」「下がるかも」等）\n';
    prompt += '・一般的なFX知識の説明\n\n';
    prompt += '【出力形式（厳守）】JSON形式で出力せよ。それ以外のテキストは不要。\n';
    prompt += '{\n';
    prompt += '  "overall": "✅全て正確" or "⚠️要確認あり" or "❌誤りあり",\n';
    prompt += '  "items": [\n';
    prompt += '    {\n';
    prompt += '      "claim": "検証した事実の主張",\n';
    prompt += '      "verdict": "✅" or "⚠️" or "❌",\n';
    prompt += '      "reason": "判定理由（1行で簡潔に）",\n';
    prompt += '      "correction": "❌の場合のみ: 正しい情報"\n';
    prompt += '    }\n';
    prompt += '  ]\n';
    prompt += '}\n';
    
    var result = callGemini_(prompt, apiKey, true);
    
    if (result && result.text) {
      var checkText = result.text.trim();
      // JSON部分を抽出（```json ... ``` の場合も対応）
      checkText = checkText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      try {
        var parsed = JSON.parse(checkText);
        var passed = parsed.overall.indexOf('❌') === -1;
        var hasWarning = parsed.overall.indexOf('⚠') !== -1;
        var issues = [];
        
        if (parsed.items) {
          for (var i = 0; i < parsed.items.length; i++) {
            var item = parsed.items[i];
            if (item.verdict !== '✅') {
              issues.push(item);
            }
          }
        }
        
        // GroundingソースURLをログ出力
        if (result.raw) {
          try {
            var candidate = result.raw.candidates && result.raw.candidates[0];
            if (candidate && candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks) {
              var chunks = candidate.groundingMetadata.groundingChunks;
              var sources = [];
              for (var ci = 0; ci < Math.min(chunks.length, 5); ci++) {
                if (chunks[ci].web) sources.push(chunks[ci].web.uri);
              }
              if (sources.length > 0) {
                console.log('🔍 ファクトチェック検証ソース: ' + sources.join(' | '));
              }
            }
          } catch (e) { /* 無視 */ }
        }
        
        console.log('📋 ファクトチェック結果: ' + parsed.overall + '（問題' + issues.length + '件）');
        
        // 読みやすいテキスト形式も生成
        var detailText = '総合判定: ' + parsed.overall + '\n';
        if (parsed.items) {
          for (var j = 0; j < parsed.items.length; j++) {
            var it = parsed.items[j];
            detailText += (j + 1) + '. ' + it.claim + ' → ' + it.verdict + ' ' + it.reason + '\n';
            if (it.correction) {
              detailText += '   正: ' + it.correction + '\n';
            }
          }
        }
        
        return {
          passed: passed && !hasWarning,
          summary: parsed.overall,
          details: detailText,
          issues: issues
        };
        
      } catch (parseErr) {
        // JSONパース失敗 → テキストベースで判定
        console.log('⚠️ ファクトチェックJSON解析失敗。テキスト判定に切替');
        var hasFail = checkText.indexOf('❌') !== -1;
        var hasWarn = checkText.indexOf('⚠') !== -1;
        return {
          passed: !hasFail && !hasWarn,
          summary: hasFail ? '❌誤りあり' : hasWarn ? '⚠️要確認あり' : '✅全て正確',
          details: checkText,
          issues: []
        };
      }
    }
    
    console.log('⚠️ ファクトチェック失敗（スキップ）');
    return { passed: true, summary: 'チェック失敗（スキップ）', details: '', issues: [] };
    
  } catch (e) {
    console.log('⚠️ ファクトチェックエラー（スキップ）: ' + e.message);
    return { passed: true, summary: 'エラー（スキップ）', details: '', issues: [] };
  }
}

/**
 * ファクトチェックで発見された誤りを自動修正
 * Gemini + Groundingで正確な情報に書き換える
 * 
 * @param {string} postText - 修正対象の投稿テキスト
 * @param {Array} issues - factCheckPost_が返したissues配列
 * @param {string} postType - 投稿タイプ
 * @param {string} apiKey - Gemini APIキー
 * @return {Object} { text: string, fixed: boolean, fixLog: string }
 */
function autoFixPost_(postText, issues, postType, apiKey) {
  try {
    if (!issues || issues.length === 0) {
      return { text: postText, fixed: false, fixLog: '' };
    }
    
    var prompt = '以下のFX関連X投稿に事実の誤り/不確かな情報が見つかりました。\n';
    prompt += '正確な情報にGoogle検索で確認した上で修正してください。\n\n';
    prompt += '【元の投稿テキスト】\n';
    prompt += postText + '\n\n';
    prompt += '【修正が必要な箇所】\n';
    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      prompt += (i + 1) + '. ' + issue.verdict + ' ' + issue.claim + '\n';
      prompt += '   理由: ' + issue.reason + '\n';
      if (issue.correction) {
        prompt += '   正しい情報: ' + issue.correction + '\n';
      }
    }
    prompt += '\n【修正ルール】\n';
    prompt += '・誤りのある部分だけを正確な情報に修正せよ。\n';
    prompt += '・口調・フォーマット・文字数は変えるな。コンパナの口調を維持せよ。\n';
    prompt += '・事実が確認できない場合は、その部分を削除して別の確認済み事実に差し替えろ。\n';
    prompt += '・修正後の投稿テキストのみ出力。説明文は不要。\n';
    
    var result = callGemini_(prompt, apiKey, true);
    
    if (result && result.text) {
      var fixedText = result.text.trim();
      
      // 修正ログ生成
      var fixLog = '【自動修正 ' + issues.length + '件】\n';
      for (var j = 0; j < issues.length; j++) {
        fixLog += '  ' + issues[j].verdict + ' ' + issues[j].claim + ' → 修正済み\n';
      }
      
      console.log('✅ 自動修正完了（' + issues.length + '件修正）');
      
      return {
        text: fixedText,
        fixed: true,
        fixLog: fixLog
      };
    }
    
    console.log('⚠️ 自動修正失敗。元テキストを使用');
    return { text: postText, fixed: false, fixLog: '自動修正失敗' };
    
  } catch (e) {
    console.log('⚠️ 自動修正エラー: ' + e.message);
    return { text: postText, fixed: false, fixLog: 'エラー: ' + e.message };
  }
}


// ========================================
// Phase 2: 仮説パース・検証・サマリー
// ========================================

/**
 * 仮説テキストから「対象ペア」と「仮説方向」を自動パース
 * @param {string} hypothesisText - 仮説テキスト（例: 「ドル円は156円台を維持」）
 * @return {Object} { pair, rateIndex, isJpy, direction }
 */
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
function getQualityFeedback_(postType) {
  try {
    // このタイプの統計を取得（sheetsManager.gsの関数）
    var stats = getEngagementStats(postType, 30);

    // データが5件未満なら注入しない（信頼性が低い）
    if (stats.count < 5) {
      return '';
    }

    var avgER = Math.round(stats.avgER * 100) / 100;
    var avgImp = Math.round(stats.avgImpressions);

    // トップ3とワースト3を取得
    var sorted = stats.records.slice().sort(function(a, b) {
      return b.engagementRate - a.engagementRate;
    });

    var text = '\n【投稿品質フィードバック（自動集計）】\n';
    text += postType + ' 直近' + stats.count + '件: 平均印象' + avgImp + '回 / 平均ER' + avgER + '%\n';

    // トップ3
    if (sorted.length >= 3) {
      var top = sorted[0];
      text += 'ベスト: 印象' + top.impressions + '回 ER' + top.engagementRate + '%\n';
    }

    // ワースト
    if (sorted.length >= 3) {
      var worst = sorted[sorted.length - 1];
      text += 'ワースト: 印象' + worst.impressions + '回 ER' + worst.engagementRate + '%\n';
    }

    text += '→ ER' + avgER + '%以上を目指せ。読者が反応する具体的な数値やニュースを含めよ。\n';

    console.log('📊 品質フィードバック注入: ' + postType + ' ER平均' + avgER + '%（' + stats.count + '件）');
    return text;

  } catch (e) {
    console.log('⚠️ 品質フィードバック取得エラー: ' + e.message);
    return '';
  }
}

function testGoldPrice() {
  var keys = getApiKeys();
  var tdApiKey = keys.TWELVE_DATA_API_KEY;
  var avApiKey = keys.ALPHA_VANTAGE_API_KEY;
  // Twelve DataでXAU/USDを試す
  var tdCandidates = ['XAU/USD', 'XAUUSD', 'GLD'];
  console.log('=== Twelve Data ===');
  for (var i = 0; i < tdCandidates.length; i++) {
    var url = 'https://api.twelvedata.com/price?symbol=' + encodeURIComponent(tdCandidates[i]) + '&apikey=' + tdApiKey;
    console.log('--- ' + tdCandidates[i] + ' ---');
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      console.log(res.getContentText().substring(0, 200));
    } catch(e) { console.log('エラー: ' + e.message); }
    Utilities.sleep(13000);
  }
  // Alpha VantageでFX_DAILY(XAU/USD)を試す
  console.log('=== Alpha Vantage FX_DAILY ===');
  var avUrl = 'https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=XAU&to_symbol=USD&apikey=' + avApiKey;
  try {
    var avRes = UrlFetchApp.fetch(avUrl, { muteHttpExceptions: true });
    console.log(avRes.getContentText().substring(0, 300));
  } catch(e) { console.log('エラー: ' + e.message); }
}
