/**
 * CompanaFXAutoPost - promptBuilder.gs
 * プロンプト組立のメイン関数(buildPrompt_)
 *
 * 提供する関数:
 *   - buildPrompt_: 投稿タイプ別に全材料を統合してプロンプト全文を組み立てる
 *
 * 依存する関数(他ファイル):
 *   - getCharacterPrompt                    (sheetsManager.gs)
 *   - getPostPrompt_ / getTCOverview / getTradeStyle_ /
 *     getReferenceSources_ / getEconomicCalendar_ /
 *     buildEveningMaterialHint_ / getLearningLog_ /
 *     getQuestionCount_ / incrementQuestionCount_ /
 *     getUnreleasedIndicatorNames_ / getHypothesisContext_    (promptSources.gs)
 *   - buildBeforeAfterExamples_ / buildFormatRules_ /
 *     getQualityFeedback_ / buildMarketTypePolicy_ /
 *     buildKnowledgePolicy_ / buildIndicatorPolicy_ /
 *     buildWeekendPolicy_ / buildRulePolicy_                  (promptPolicies.gs)
 *   - selectHotTopic_ / formatHotTopicForPrompt_              (hotTopicSelector.gs)
 *   - fetchMarketNews_                                        (marketAnalysis.gs / claudeApi.gs)
 *   - detectHotPair_ / calculateRateDirection_                (marketAnalysis.gs)
 *   - その他: fetchIndicatorResults_ / analyzePriceHistory_ /
 *             getLatestIndicators_ / fetchCommodityPrices_ /
 *             getDowTheorySummary_ / getOngoingEvents_ etc.
 *
 * ★v14.0 Phase R-5 構造(2026-04-23):
 *   プロンプトを「静的プレフィックス → 動的サフィックス」の二段階構造に再編。
 *   Phase 8(Prompt Caching)で staticPart をキャッシュ対象にする土台。
 *
 *   [staticPart] 約 13,000字
 *     - characterPrompt
 *     - 投稿タイプ・postPrompt
 *     - 構造指示・トレードスタイル
 *     - ポリシー群(buildMarketTypePolicy_ 等)
 *     - getTCOverview(条件付き)
 *     - buildFormatRules_
 *     - buildBeforeAfterExamples_
 *     - 【★★★最終確認】
 *     - 【情報ソース】
 *
 *   [dynamicPart] 約 7,500字
 *     - 日時・レート・方向
 *     - 指標トレンド・市場分析
 *     - 市場環境データ・政策金利・商品・ダウ理論
 *     - 市場ニュース・ホットトピック
 *     - 経済カレンダー・アノマリー
 *     - 投稿品質フィードバック・仮説検証・学び
 *     - 前回の仮説振り返り・最近の学び・問いかけ誘発
 *     - 【★再確認(最終チェック)】 ← 末尾 watch マーカー
 *
 * 履歴:
 *   v14.0 Phase R-2(2026-04-23): 2,505行から buildPrompt_ のみに切り出し
 *   v14.0 Phase R-4(2026-04-23): セクション統合(B/C/D/E案採用・Stage 1.5・Stage 3-2)
 *   v14.0 Phase R-5(2026-04-23): 二段階組み立て構造に再編(Phase 8 の前提整備)
 */


function buildPrompt_(postType, typeConfig, context, rates) {
  var now = new Date();
  var yearStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy');
  var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年M月d日（E）');
  var timeStr = Utilities.formatDate(now, 'Asia/Tokyo', 'HH:mm');
  var keys = getApiKeys(); // ★v5.4: ホットペア検出で使用
  
  // ★v14.0 Phase 1(2026-04-20): ホットトピック選定で使うデータを保持
  //   buildPrompt_の下流でこれらの変数に「ついでに」値を保存し、
  //   ニュース取得後に selectHotTopic_ へ渡す。
  //   各既存のデータ取得処理はそのまま維持(重複取得を避ける)。
  var _hotTopicCurrencyStrength = '';
  var _hotTopicRateDirection    = '';
  var _hotTopicDowTheory        = '';
  var _hotTopicOngoingEvents    = '';
  
  // ① キャラクター定義（Sheetsから）
  var characterPrompt = getCharacterPrompt();
  
  // ★v8.6: TC言及禁止タイプではTC導線セクションを除外（不要な指示でGeminiの注意を分散させない）
  var tcProhibitedTypes = ['MORNING', 'TOKYO', 'LONDON', 'INDICATOR', 'KNOWLEDGE'];
  if (tcProhibitedTypes.indexOf(postType) !== -1) {
    characterPrompt = characterPrompt.replace(/【TC導線】[\s\S]*?(?=【|$)/, '');
    characterPrompt = characterPrompt.replace(/【TC導線のトーン】[\s\S]*?(?=【|$)/, '');
  }
  
  var staticPart  = characterPrompt + '\n\n';
  var dynamicPart = '';  // ★v14.0 Phase R-5: 動的サフィックス
  
  // ①-a 日時情報
  dynamicPart += '【現在の日時】' + dateStr + ' ' + timeStr + '（日本時間）\n';
  dynamicPart += '【年の確認】現在は' + yearStr + '年です。' + yearStr + '年以外のデータは絶対に使うな。\n\n';
  
  // ①-b 確定レート（事前取得済み）を直接埋め込む ★v5.4: 7ペア化
  // タイプ別にレートの役割を変える
  var ruleTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4'];
  var isRuleType = ruleTypes.indexOf(postType) !== -1;
  
  if (rates) {
    // ★v14.0 Phase R-4 Stage 3(2026-04-23): 【参考: 現在のレート】の3パターン統合
    //   旧: KNOWLEDGE / RULE系・WEEKLY_LEARNING / 市場系 で3つの異なる見出し
    //   新: 「本日の確定レート」に統合(タイプ別の注記は中で条件表示)
    //   削減: 実セクション数は変わらないが見出しパターンを統一し、認識される文字列を減らす
    if (postType === 'KNOWLEDGE') {
      dynamicPart += '【本日の確定レート(参考: テーマ選定の参考。本文にレート数値を書く必要はない)】\n';
    } else if (isRuleType || postType === 'WEEKLY_LEARNING') {
      dynamicPart += '【本日の確定レート(参考: 心得・学び投稿の本文にレート数値を無理に入れる必要はない)】\n';
    } else {
      dynamicPart += '【本日の確定レート（7ペア）】\n';
    }
    dynamicPart += '・USD/JPY（ドル円）: ' + formatRate_(rates.usdjpy, 'usdjpy', 'display') + '円\n';
    dynamicPart += '・EUR/USD（ユーロドル）: ' + formatRate_(rates.eurusd, 'eurusd', 'display') + 'ドル\n';
    dynamicPart += '・GBP/USD（ポンドドル）: ' + formatRate_(rates.gbpusd, 'gbpusd', 'display') + 'ドル\n';
    dynamicPart += '・EUR/JPY（ユーロ円）: ' + formatRate_(rates.eurjpy, 'eurjpy', 'display') + '円\n';
    dynamicPart += '・GBP/JPY（ポンド円）: ' + formatRate_(rates.gbpjpy, 'gbpjpy', 'display') + '円\n';
    dynamicPart += '・AUD/JPY（豪ドル円）: ' + formatRate_(rates.audjpy, 'audjpy', 'display') + '円\n';
    dynamicPart += '・AUD/USD（豪ドル米ドル）: ' + formatRate_(rates.audusd, 'audusd', 'display') + 'ドル\n';
    dynamicPart += '・取得元: ' + rates.source + '\n';
    if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
      dynamicPart += '※レートはチャートを見れば分かる情報。数字の羅列ではなく「なぜ今この価格なのか」の背景と心理を書け。\n';
      dynamicPart += '※7ペアを全部並べるのはNG。1〜2ペアに絞ってストーリーを語ること。\n';
      dynamicPart += '※数値の小数点「.」は絶対に省略するな。1.3672を13672と書くのは禁止。\n';
      dynamicPart += '※ペアの数値を絶対に混同するな。豪ドル円の話題にドル円の数値を混ぜるのは致命的ミス。各ペアの数値は上記リストの対応する行のみ使え。\n';
      dynamicPart += '※レート表記の桁数ルール: JPYペアは小数2桁（例: 159.24円）、USDペアは小数4桁（例: 1.1592ドル）で書け。5桁（1.15915ドル等）はAPI生値そのままでAI臭い。「〜付近」「〜台」等の自然な表現を使え。\n\n';
      
      // ★v5.6: レートの方向性を自動計算してプロンプトに注入
      var direction = calculateRateDirection_(rates, keys.SPREADSHEET_ID);
      if (direction) {
        dynamicPart += direction;
        _hotTopicRateDirection = direction;  // ★v14.0 Phase 1: ホットトピック選定でも使う
      }
      
      
      // ★v5.7 Layer 1: 前日の経済指標結果を注入（MORNING, TOKYO）
      var indicatorResultTypes = ['MORNING', 'TOKYO'];
      if (indicatorResultTypes.indexOf(postType) !== -1) {
        try {
          var indicatorReview = fetchIndicatorResults_(keys.SPREADSHEET_ID, keys.GEMINI_API_KEY);
          if (indicatorReview) {
            dynamicPart += indicatorReview;
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
            dynamicPart += indicatorTrend;
          }
        } catch (tErr) {
          console.log('⚠️ 指標トレンド注入スキップ: ' + tErr.message);
        }
      }
      
    } else {
      dynamicPart += '\n';
    }
    
    // ①-b1.5 ホットペア情報注入 ★v5.4 Phase 6.5
    if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
      var hotPairResult = detectHotPair_(rates, keys.SPREADSHEET_ID);
      if (hotPairResult) {
        dynamicPart += hotPairResult.text;
        _hotTopicCurrencyStrength = hotPairResult.text;  // ★v14.0 Phase 1: ホットトピック選定でも使う
      }
    }
  } else {
    // ★v5.9.1: レートキャッシュに直近データがあれば、そこから注入
    var cacheRateText = getLatestRateText_(keys.SPREADSHEET_ID);
    if (cacheRateText) {
      dynamicPart += '⚠️リアルタイムAPI未接続。以下はレートキャッシュの直近値です。\n';
      dynamicPart += cacheRateText + '\n';
      dynamicPart += '※ この値を基準に投稿を書け。勝手に丸めたり別の数値を使うな。\n\n';
    } else {
      dynamicPart += '⚠️レート取得に完全に失敗しています。具体的な数値は使わず「上昇」「下落」等で表現すること。\n\n';
    }
  }
  

  // ①-b2 意識される価格帯（レートサマリーから読み取り）※KNOWLEDGE・RULE系・WEEKLY_LEARNINGには不要
  if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
    var priceAnalysis = analyzePriceHistory_(rates);
    if (priceAnalysis) {
      dynamicPart += priceAnalysis;
    }
  }
  
  // ①-b3 市場環境データ（★v5.5.3: 株価指数・金利・VIX・ゴールド）
  // KNOWLEDGE・RULE系・WEEKLY_LEARNINGには不要
  if (postType !== 'KNOWLEDGE' && !isRuleType && postType !== 'WEEKLY_LEARNING') {
    var indicators = getLatestIndicators_(keys.SPREADSHEET_ID);
    if (indicators) {
      dynamicPart += '【市場環境データ（Twelve Data API取得・正確な値。投稿で使用してよい）】\n';
      for (var mi = 0; mi < MARKET_INDICATORS.length; mi++) {
        var ind = MARKET_INDICATORS[mi];
        var val = indicators[ind.key];
        if (val !== null && val !== undefined) {
          var formatted = val.toFixed(ind.decimals);
          // 日経・ダウなど大きい数字はカンマ区切り
          if (ind.decimals === 0 && val >= 1000) {
            formatted = Number(formatted).toLocaleString();
          }
          dynamicPart += '・' + ind.label + ': ' + formatted + ind.unit + '\n';
        }
      }
      dynamicPart += '※GOOGLEFINANCE自動更新（15〜20分遅延あり）\n';
      dynamicPart += '※Gemini Groundingで得た株価指数・金利の数値は使うな。上記の数値のみ使え。\n';
      dynamicPart += '※株価指数は背景・クロスマーケット分析として触れるのはOK。ただし主役はFX。\n\n';
    }

    // ★v8.5: 政策金利はconfig.gsのPOLICY_RATESから一元取得（3箇所共通化）
    dynamicPart += '【主要中銀の政策金利（現在値・正確）】\n';
    dynamicPart += getPolicyRatesText_();
    dynamicPart += '※「日銀のハト派姿勢」「日銀の緩和政策」は過去の話。現在は利上げ路線。間違えるな。\n';
    dynamicPart += '※ 上記と矛盾する金融政策スタンスを書くな（例: 日銀がハト派、FRBが利上げ中 等は誤り）。\n\n';

    // ★v13.0.11 ロールバック(2026-04-20):
    //   要人データ + 継続中重大事象の生成時点注入を削除(Stage 1検証で既にカバー済みのため)
    //   理由: プロンプト文字数が 20,800→30,994字まで膨張(特にLUNCH)し、
    //         「100-180字」「ランチタイムらしく」等の役割指示が attention から希薄化。
    //         Stage 1 の toFactString() が worldLeaders / ongoingEvents を含んで検証するため、
    //         生成時点注入は冗長な二重化だった。

    // ★v12.1.1: 商品データ注入（BTC/GOLD=Twelve Data のみ。WTI/天然ガスはAlpha Vantageデータが古いため停止）
    var btcForPrompt   = fetchCommodityPrices_();
    var commoditiesForPrompt = {
      wti:    null,
      btc:    btcForPrompt   ? btcForPrompt.btc      : null,
      gold:   btcForPrompt   ? btcForPrompt.gold     : null,
      natgas: null
    };
    var hasComData = COMMODITY_ASSETS.some(function(a) { return commoditiesForPrompt[a.key] !== null; });
    if (hasComData) {
      dynamicPart += '【商品データ】\n';
      for (var ci = 0; ci < COMMODITY_ASSETS.length; ci++) {
        var ca = COMMODITY_ASSETS[ci];
        var cv = commoditiesForPrompt[ca.key];
        if (cv !== null && cv !== undefined) {
          dynamicPart += '・' + ca.label + ': ' + cv.toFixed(ca.decimals) + ca.unit + '\n';
        }
      }
      dynamicPart += '※上記は直近1時間以内のAPIデータ（基準値）。Groundingで最新値も検索して確認し、大きくズレていれば最新値を優先せよ。\n';
      dynamicPart += '※使い方: FX値動きの背景・理由説明に使え。商品価格自体を投稿の主役にするな。\n';
      dynamicPart += '※OK: 「原油安を背景に豪ドルが軟調」 NG: 「WTIが85ドル台で推移」を冒頭に持ってくる\n\n';
    }

    // ★v13.1 Phase 6 再設計 S6: ダウ理論(日足SH/SL)を投稿生成プロンプトに注入
    //   目的: コンパナはデイ〜スイングトレーダー。時間軸は基本日足で語る必要がある
    //   現状: Claude市場分析(geminiApi.gs L825)では使用済みだが、投稿生成プロンプトでは未注入
    //   効果: 「日足はまだ下降トレンド」等の時間軸表現を Claude が確実に書ける
    try {
      if (typeof getDowTheorySummary_ === 'function') {
        var dowTheoryText = getDowTheorySummary_(keys.SPREADSHEET_ID);
        if (dowTheoryText) {
          dynamicPart += dowTheoryText + '\n';
          dynamicPart += '※時間軸の原則: コンパナはデイ〜スイングトレーダー。基本は日足の視点で語れ。\n';
          dynamicPart += '※週足と日足のトレンドが一致している方が確度が高い。逆行している場合は「転換の可能性」として言及せよ。\n';
          dynamicPart += '※SH/SL の数値を根拠に語れ。例: 「日足SH 158.97を超えれば高値更新」「SL 157.50を割れば下降転換」\n\n';
          _hotTopicDowTheory = dowTheoryText;  // ★v14.0 Phase 1: ホットトピック選定でも使う
        }
      }
    } catch (dowErr) {
      console.log('⚠️ ダウ理論取得失敗(続行): ' + dowErr.message);
    }
  }
  
  // ①-b4 市場ニュースTOP5（★v5.5 Phase 7: ニュース取得レイヤー）
  // ★v5.5.3: RULE系・WEEKLY_LEARNINGには注入しない（心得・学びが主題であるべき）
  var noNewsTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'WEEKLY_LEARNING'];
  var skipNews = noNewsTypes.indexOf(postType) !== -1;
  var _hotTopicMarketNews = '';  // ★v14.0 Phase 1: ホットトピック選定用
  if (!skipNews) {
    var marketNews = fetchMarketNews_(keys);
    if (marketNews) {
      dynamicPart += marketNews;
      _hotTopicMarketNews = marketNews;
    }
  }
  
  // ★★v14.0 Phase 1(2026-04-20): ホットトピック事前選定 ★★
  //   目的: 毎日同じ静的データ(ゴトー日・通貨強弱%のみ)を選ぶ現象を解消し、
  //         「今この瞬間のホットな材料」を起点にした投稿を実現する。
  //   背景: TCAX_REFERENCE.md 事件8 参照。
  //   対象: 市場系投稿(MORNING/TOKYO/LUNCH/LONDON/GOLDEN)のみ。
  //   失敗時: null が返るので従来動作にフォールバック(従来のプロンプトがそのまま使われる)。
  var hotTopicEnabledTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN'];
  if (hotTopicEnabledTypes.indexOf(postType) !== -1 && _hotTopicMarketNews) {
    try {
      // 継続中重大事象を取得(Stage 1 で既に使われているが、選定にも渡す)
      if (typeof getOngoingEvents_ === 'function') {
        var ongoingList = getOngoingEvents_() || [];
        if (ongoingList.length > 0) {
          var ongoingText = '';
          for (var _oe = 0; _oe < ongoingList.length; _oe++) {
            var _ev = ongoingList[_oe];
            ongoingText += '・' + _ev.name;
            if (_ev.startDate) ongoingText += '(' + _ev.startDate + '〜継続中)';
            if (_ev.summary) ongoingText += ': ' + _ev.summary;
            ongoingText += '\n';
          }
          _hotTopicOngoingEvents = ongoingText;
        }
      }
      
      // Claude API キー取得
      var _claudeKey = (keys && keys.CLAUDE_API_KEY) 
        || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
      
      if (_claudeKey) {
        // ★v14.2 T2-F(2026-04-27): 本日の既出投稿を取得して同主題回避ヒントとして渡す
        var _priorPosts = [];
        try {
          if (typeof getTodayPreviousPosts_ === 'function') {
            _priorPosts = getTodayPreviousPosts_() || [];
          }
        } catch (_priorErr) {
          console.log('⚠️ priorPosts 取得失敗(空で続行): ' + _priorErr.message);
        }

        var hotTopic = selectHotTopic_({
          marketNews:       _hotTopicMarketNews,
          currencyStrength: _hotTopicCurrencyStrength,
          rateDirection:    _hotTopicRateDirection,
          dowTheory:        _hotTopicDowTheory,
          ongoingEvents:    _hotTopicOngoingEvents,
          postType:         postType,
          claudeApiKey:     _claudeKey,
          priorPosts:       _priorPosts
        });
        
        if (hotTopic) {
          // 選定成功 → プロンプトに構造化テキストを注入
          dynamicPart += formatHotTopicForPrompt_(hotTopic);
        } else {
          console.log('ℹ️ ホットトピック選定はスキップ → 従来動作で続行');
        }

        // ★v14.2 T2-F-2(2026-04-27): 投稿生成プロンプトにも priorPosts ヒント注入
        // 背景: T2-F だけでは selectHotTopic_ にしかヒントが届かず、
        //       投稿生成段階で日銀等の最大材料が再注入され重複が再発した。
        //       本文生成プロンプトにも同じヒント+最優先ルールを直接届ける。
        try {
          if (_priorPosts && _priorPosts.length > 0) {
            dynamicPart += '\n【本日の既出投稿(本文の主題重複を避けよ)】\n';
            for (var ppi = 0; ppi < _priorPosts.length; ppi++) {
              var pp = _priorPosts[ppi];
              if (!pp) continue;
              var ppSummary = String(pp.text || '').substring(0, 120).replace(/\n/g, ' ');
              dynamicPart += '- ' + (pp.time || '??:??') + ' ' + (pp.type || '?') + ': ' + ppSummary + '\n';
            }
            dynamicPart += '\n';
            dynamicPart += '★重要(本文の切り口差別化・3軸モットー):\n';
            dynamicPart += '- 同じ主題でも、別の角度・別の数字・別の通貨ペア・別の時間軸なら OK\n';
            dynamicPart += '- 完全に同じ切り口の繰り返しだけは避けよ(読者の飽き防止)\n';
            dynamicPart += '- 判断3軸(全部満たすほど良い投稿):\n';
            dynamicPart += '  (1) ホット度: 今この瞬間の最新材料か。続報があるなら積極的に拾え\n';
            dynamicPart += '  (2) 面白さ: 読者の好奇心を引く切り口か(意外性・新事実・数字の具体化)\n';
            dynamicPart += '  (3) 役立つ度: トレード判断に使える具体情報があるか\n';
            dynamicPart += '- 当日最大材料(日銀・FOMC等)は何度でも触れて可・ただし毎回違う角度から\n';
            dynamicPart += '- 続報があるならその続報を最優先(発表前→発表直後→反応・と時系列で深掘り)\n';
            dynamicPart += '- 「タカ派/ハト派」「円買い/円売り」型は既出なら、別フレーミング(具体的な経済指標予想数値・テクニカル水準など)を優先\n';
            dynamicPart += '- 「明日の○○発言、どちらを想定?」型の問いかけが既出なら、別の角度の問いかけを使え\n';
            dynamicPart += '\n';
          }
        } catch (_t2f2Err) {
          console.log('⚠️ T2-F-2 priorPosts 注入失敗(本文生成は続行): ' + _t2f2Err.message);
        }
      } else {
        console.log('ℹ️ CLAUDE_API_KEY未設定のためホットトピック選定スキップ');
      }
    } catch (htErr) {
      console.log('⚠️ ホットトピック選定処理エラー(続行): ' + htErr.message);
    }
  }
  // ★★v14.0 Phase 1 ここまで ★★
  
  // ①-c 参照ソース（市況やニュースの取得先）※RULE系には不要
  if (!isRuleType) {
    var refSources = getReferenceSources_();
    if (refSources) {
      staticPart += refSources;
    }
  }
  
  // ①-d 経済カレンダー（シートから正確なデータを注入）※RULE系・KNOWLEDGEには不要
  // ★v5.5.3: WEEKLY_LEARNINGには「参考用」として今週カレンダーを注入（架空イベント創作防止）
  if (!isRuleType && postType !== 'KNOWLEDGE') {
    var calScope = 'today'; // デフォルト: 今日のみ
    
    // タイプ別にスコープを変える
    var dailyTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN'];
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
      dynamicPart += calendar;
    }
  }
  
  // ①-e アノマリー（カレンダー要因）注入 ★v8.15
  // RULE系・WEEKLY_LEARNINGはformatAnomalyForPrompt_内でスキップ
  try {
    var anomalyScope = 'today';
    // NEXT_WEEK/WEEKLY_HYPOTHESISは来週のアノマリーを注入
    if (postType === 'NEXT_WEEK' || postType === 'WEEKLY_HYPOTHESIS') {
      anomalyScope = 'next_week';
    }
    var anomalies = getTodayAnomalies_(null, anomalyScope);
    var anomalyText = formatAnomalyForPrompt_(anomalies, postType);
    if (anomalyText) {
      dynamicPart += anomalyText;
    }
  } catch (anomalyErr) {
    console.log('⚠️ アノマリー注入エラー（続行）: ' + anomalyErr.message);
  }
  
  staticPart += '【投稿タイプ（※この名前は指示用。本文には絶対に書くな）】' + typeConfig.label + '\n\n';
  
  // ② 投稿プロンプト（Sheetsから）
  var postPrompt = getPostPrompt_(postType);
  if (postPrompt) {
    staticPart += postPrompt.prompt + '\n';
  } else {
    staticPart += '最新のFX市場情報を元に、このタイプに合った投稿を作成してください。\n';
  }
  
  // ★v8.8.1: スプレッドシートの投稿プロンプトに古い構造指示が含まれている場合、
  // 以下のコード側の構造指示が最終版。矛盾する場合はコード側を100%優先。
  var hypothesisTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN'];
  if (hypothesisTypes.indexOf(postType) !== -1) {
    staticPart += '\n【★重要: 以下の構造指示が最終版。上のシート指示と矛盾する場合、以下を100%優先せよ】\n';
  }
  
  // ②-b トレードスタイル（全投稿に注入: 見解の一貫性を保つ）
  var tradeStyle = getTradeStyle_();
  if (tradeStyle) {
    staticPart += tradeStyle;
  }
  
  // ②-c〜②-h: 投稿タイプ別方針（★v8.10: 5つのヘルパー関数に分割）
  staticPart += buildMarketTypePolicy_(postType, now);
  staticPart += buildKnowledgePolicy_(postType);
  staticPart += buildIndicatorPolicy_(postType, keys);
  staticPart += buildWeekendPolicy_(postType, keys, rates);
  staticPart += buildRulePolicy_(postType, isRuleType);


  // ③ RULE系: テーマシート連動（既存のgetNextTheme処理を維持）
  if (postType.indexOf('RULE') === 0) {
    var categoryMap = {
      'RULE_1': '知識・原則',
      'RULE_2': '習慣・メンタル',
      'RULE_3': '実践テクニック',
      'RULE_4': '失敗談・本音'  // ★心得テーマシートのカテゴリ名と一致させること
    };
    var category = categoryMap[postType];
    if (category) {
      var theme = getNextTheme(category);
      if (theme) {
        staticPart += '\nテーマ: ' + theme.theme + '\n';
        staticPart += 'キーメッセージ: ' + theme.keyMessage + '\n';
        
        if (theme.tcPattern && theme.tcPattern !== 'なし' &&
            ['RULE_1', 'RULE_3', 'WEEKLY_REVIEW'].indexOf(postType) !== -1) {
          staticPart += '\n【Trading Complete導線（※以下は構成の指針。このテキストをそのまま本文に含めるな）】\n';
          switch (theme.tcPattern) {
            case '課題提起型':
              staticPart += '構成の流れ:「記録が大事」→「でも面倒」→「だからツールで仕組み化」\n';
              staticPart += '最後にさりげなく「自分はツールを作って解決した」と触れる程度でOK\n';
              staticPart += '※上記の矢印付きフローをそのまま本文に書くな。自然な文章で表現しろ。\n';
              break;
            case '開発ストーリー型':
              staticPart += '構成の流れ: 自分の体験談 →「Excelで挫折」→「自分でツールを作った」\n';
              staticPart += '開発者としての本音を出す。宣伝感は出さない\n';
              staticPart += '※上記の矢印付きフローをそのまま本文に書くな。自然な文章で表現しろ。\n';
              break;
            case 'データ型':
              staticPart += '構成の流れ: 具体的な数字 →「記録を振り返ったら発見があった」\n';
              staticPart += 'データの力を実感したエピソードを入れる\n';
              staticPart += '※上記の矢印付きフローをそのまま本文に書くな。自然な文章で表現しろ。\n';
              break;
          }
          dynamicPart += '\n';
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
      staticPart += tcOverview;
    }
  }
  
  // Phase 4: 品質フィードバック注入（データ5件以上ある場合のみ）
  var qualityFeedback = getQualityFeedback_(postType);
  if (qualityFeedback) {
    dynamicPart += qualityFeedback;
  }

  // ★v8.16: 仮説的中率サマリーを全市場投稿に拡大（以前はWEEKLY_HYPOTHESISのみ）
  // AIが「自分が最近何を外しているか」を知ることで、仮説の精度が向上する
  var verifTargetTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN',
                          'WEEKLY_REVIEW', 'WEEKLY_HYPOTHESIS'];
  if (verifTargetTypes.indexOf(postType) !== -1) {
    var verifSummary = getHypothesisVerificationSummary_();
    if (verifSummary) {
      dynamicPart += verifSummary;
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
        dynamicPart += hypoTrend;
        console.log('📊 週間レートトレンド注入済み（WEEKLY_HYPOTHESIS）');
      }
    } catch (htErr) {
      console.log('⚠️ WEEKLY_HYPOTHESIS週間トレンド注入スキップ: ' + htErr.message);
    }
  }

  // ④-b 学びログ（過去の引き出しを注入）★v5.5: 全タイプに拡張
  var learningMaxMap = {
    'MORNING': 2, 'TOKYO': 1, 'LUNCH': 1, 'LONDON': 1, 'GOLDEN': 2,
    'INDICATOR': 1, 'NEXT_WEEK': 2,
    'WEEKLY_REVIEW': 3, 'WEEKLY_LEARNING': 5, 'WEEKLY_HYPOTHESIS': 3,
    'RULE_1': 3, 'RULE_2': 3, 'RULE_3': 3, 'RULE_4': 3,
    'KNOWLEDGE': 3
  };
  var maxLearnings = learningMaxMap[postType];
  if (maxLearnings) {
    var learningLog = getLearningLog_(postType, maxLearnings);
    if (learningLog) {
      dynamicPart += learningLog;
    }
  }
  
  // ⑤ フォーマットルール（投稿タイプ別文字数を反映）
  staticPart += buildFormatRules_(typeConfig.charMin, typeConfig.charMax, postType);
  
  // ⑥ コンテキスト（仮説・学びを投稿履歴シート＋レートキャッシュから自動取得）
  // 仮説は市場系・週末系のみ注入（RULE系・KNOWLEDGEには不要）
  var hypothesisTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN',
                         'WEEKLY_REVIEW', 'NEXT_WEEK', 'WEEKLY_HYPOTHESIS'];
  var needsHypothesis = hypothesisTypes.indexOf(postType) !== -1;
  
  var historyContext = getHypothesisContext_(rates);
  
  // ★v8.16: 仮説の振り返りは1日1回だけ（平日市場系のみ）
  // 2投稿目以降は「振り返り済み」指示に切り替え、同じ答え合わせの繰り返しを防ぐ
  var dailyMarketTypes = ['MORNING', 'TOKYO', 'LUNCH', 'LONDON', 'GOLDEN'];
  var isDailyMarket = dailyMarketTypes.indexOf(postType) !== -1;
  var alreadyReviewed = false;
  
  if (isDailyMarket) {
    try {
      var todayPosts = getTodayPreviousPosts_();
      for (var tp = 0; tp < todayPosts.length; tp++) {
        if (dailyMarketTypes.indexOf(todayPosts[tp].type) !== -1) {
          alreadyReviewed = true;
          break;
        }
      }
    } catch (e) {
      // キャッシュ取得失敗時は初回扱い（安全側）
    }
  }
  
  // 仮説の振り返り（レートキャッシュの数値差分ベース）
  if (needsHypothesis && alreadyReviewed) {
    // ★v8.16: 2投稿目以降 → 振り返り済み指示
    dynamicPart += '\n【前回の仮説の振り返り（本日済み）】\n';
    dynamicPart += '今日の最初の投稿で前回の仮説を振り返り済み。同じ答え合わせを繰り返すな。\n';
    dynamicPart += '「読み違えた」「外した」等の自己批判も不要。新しい視点で市場を語れ。\n';
    console.log('📝 仮説振り返り: 本日済み（' + postType + 'は2投稿目以降）→ 重複回避指示を注入');
  } else if (needsHypothesis && historyContext && historyContext.hypothesisBlock) {
    dynamicPart += historyContext.hypothesisBlock;
  } else if (needsHypothesis && context && context.lastHypothesis) {
    // フォールバック: 外部contextから
    dynamicPart += '\n【前回の仮説（参考情報）】\n' + context.lastHypothesis + '\n';
    dynamicPart += '→ 1文で軽く触れてよい。「不発」「成功」等の評価語は使うな。\n';
  }
  
  // 学び
  if (historyContext && historyContext.learning) {
    dynamicPart += '\n【最近の学び（参考情報）】\n' + historyContext.learning + '\n';
    dynamicPart += '→ この学びを狙い目シナリオの根拠や、振り返りの反省材料として活用せよ。\n';
  } else if (context && context.lastLearning) {
    dynamicPart += '\n【最近の学び（参考情報）】\n' + context.lastLearning + '\n';
    dynamicPart += '→ この学びを狙い目シナリオの根拠や、振り返りの反省材料として活用せよ。\n';
  }
  
  // ★v8.16: 問いかけ注入（1日2回上限・対象タイプのみ）
  var questionEligibleTypes = ['MORNING', 'LUNCH', 'GOLDEN', 'WEEKLY_REVIEW', 'WEEKLY_LEARNING',
                                'NEXT_WEEK', 'WEEKLY_HYPOTHESIS', 'RULE_1', 'RULE_2', 'RULE_3', 'RULE_4', 'KNOWLEDGE'];
  if (questionEligibleTypes.indexOf(postType) !== -1) {
    var qCount = getQuestionCount_();
    if (qCount < 2) {
      // 確率的に注入（毎回ではなく約50%の確率）
      var shouldQuestion = (Math.random() < 0.5);
      if (shouldQuestion) {
        dynamicPart += '\n【★問いかけを入れてよい（今日' + qCount + '/2回使用済み）】\n';
        dynamicPart += '投稿の最後に、読者が答えたくなる問いかけを1つだけ自然に入れろ。\n';
        dynamicPart += '★最重要: 今日の投稿の題材から自分で考えろ。固定フレーズを使い回すな。\n';
        dynamicPart += '★その日のニュース・為替の動き・生活への影響から、読者が「自分ごと」として答えられる問いを作れ。\n';
        dynamicPart += '方向性の参考（この通りに書くな。あくまで方向性）:\n';
        dynamicPart += '  ・生活実感: 為替や原油の変動が財布にどう影響するか\n';
        dynamicPart += '  ・夢・目標: 投資の先にある生活。時間やお金の自由\n';
        dynamicPart += '  ・選択・判断: 金利や為替の変動を受けて、生活でどう行動するか\n';
        dynamicPart += '  ・内省: トレーダーとしての自分を振り返る\n';
        dynamicPart += '★答えやすさが命。YES/NOや一言で答えられるのが理想。長文回答を求めるな。\n';
        incrementQuestionCount_();
        console.log('❓ 問いかけ: 注入（' + postType + '・本日' + (qCount + 1) + '/2回目）');
      } else {
        console.log('❓ 問いかけ: スキップ（確率判定で今回は不要）');
      }
    } else {
      console.log('❓ 問いかけ: 上限到達（本日' + qCount + '/2回済み）');
    }
  }
  
  // ★v12.4→v12.5.4→v12.10: キャラクター口調リマインダー（プロンプト最末尾に配置）
  // LLMは最初と最後を最も重視する。長文のデータ・ルールを処理した後、
  // 最後に「コンパナとして書け」を念押しすることでキャラクター口調を維持する。
  //
  // ★v12.10: 診断書 水準2-2「プロンプト肥大化」対応
  //   旧: キャラクターシート全体を末尾で再注入 → 91セクション中12セクションが重複
  //       プロンプト総文字数 26,000〜29,000文字に膨張し attention が希薄化
  //   新: 冒頭でキャラクターシート全文を注入し、末尾は「核心の口調例3行」のみ
  //       プロンプト約12,000文字削減・セクション数約60個に減少見込み

  // ★v13.1 Phase 6 再設計 S1: Before/After 実例セクションを末尾直前に追加
  //   目的: few-shot learning によるコンパナ口調の具体的手本を提示
  //   位置: 【★★★最終確認】の直前 = Claude が最後に見る具体例
  //   8組の「アナリスト調 → コンパナ口調」変換例 + 5つの核ルール
  staticPart += buildBeforeAfterExamples_();

  // ★v13.1 Phase 6 再設計 S2: 最終確認の強化
  //   変更: Before/After との連携を強化、「データは背景」の原則を追加
  //   ★v13.1 S6 追加: 時間軸の原則を追加(デイ〜スイング目線)
  staticPart += '\n【★★★最終確認(この指示が全てに優先する)】\n';
  staticPart += '1. 上記 Before/After 実例のトーンで書け。漢語・名詞化・堅い文末は絶対禁止。\n';
  staticPart += '2. データは「使う」もの。「報告」するものではない。会話の中に織り込め。\n';
  staticPart += '3. 「〜ですね」「〜かなと思います」「〜とこですね」「〜感じですね」で文末を崩せ。「〜です/ます」の連続は禁止。\n';
  staticPart += '4. ★文末は必ず動詞で完結させろ。「〜かなと。」「〜とこ。」で切るな。「〜かなと思います」「〜とこですね」まで書け。\n';
  staticPart += '5. 絵文字行は体言止め・動詞止めで短く。→行で人間味を出せ。\n';
  staticPart += '6. ★時間軸は基本「日足」(デイ〜スイング目線)。短期(数時間)は補足で触れる程度にせよ。\n';
  staticPart += '7. 完成したら声に出して読め。硬い文が1文でもあれば書き直せ。\n';
  
  // ★v14.0 Phase R-5 末尾再確認マーカー(Q2: 2項目版・動的サフィックス末尾)
  //   役割: 動的データに引っ張られた Claude を冒頭ルールに引き戻す watch 役
  dynamicPart += '\n【★再確認(最終チェック)】\n';
  dynamicPart += '1. 冒頭のルール・トーン・フォーマットを守れ\n';
  dynamicPart += '2. 文末は動詞完結(「〜かなと。」で切るな)\n';
  
  // ★v14.0 Phase R-5: 静的プレフィックスと動的サフィックスを連結
  //   Phase 8(Prompt Caching)では staticPart 末尾に cache_control を設定予定
  var prompt = staticPart + dynamicPart;
  
  // ★v5.9.3: プロンプト文字数測定（デバッグ用）
  // ★v14.0 Phase R-5: prompt 変数が生成された後にログ出力する位置に移動
  console.log('📏 プロンプト総文字数: ' + prompt.length + '文字（約' + Math.round(prompt.length / 2) + 'トークン）');
  console.log('📏 静的プレフィックス: ' + staticPart.length + '文字 / 動的サフィックス: ' + dynamicPart.length + '文字');
  
  var sections = prompt.match(/【[^】]+】/g) || [];
  console.log('📏 セクション数: ' + sections.length + '個');
  console.log('📏 セクション一覧: ' + sections.join(', '));
  
  // ★v14.0 Phase 8(2026-04-24): Prompt Caching 対応のため返り値をオブジェクト化
  //   旧: return prompt;  (string)
  //   新: return { staticPart, dynamicPart, prompt };  (object)
  //   互換性: 呼び出し側は promptObj.prompt で従来の string を取得可能
  //   目的: callClaudeApi_ の cache_control 設定のため staticPart を個別に取得可能に
  return {
    staticPart: staticPart,
    dynamicPart: dynamicPart,
    prompt: prompt
  };
}
