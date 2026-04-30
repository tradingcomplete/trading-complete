/**
 * CompanaFXAutoPost - hotTopicSelector.gs
 * ホットトピック選定(★v14.0 Phase 1・事件8対策)
 *
 * 提供する関数:
 *   - selectHotTopic_:           市場データ・ニュース・継続中事象を統合してホットトピック選定
 *   - formatHotTopicForPrompt_:  選定結果をプロンプトに注入する文字列形式に変換
 *
 * 背景:
 *   事件8(2026-04-20): 投稿タイプ設計の根本誤りへの対処として、
 *   投稿生成前に「今日書くべきトピック」を Claude に選定させる機構を新設。
 *
 * 履歴:
 *   v14.0 Phase 1(2026-04-20): 新設
 *   v14.0 Phase R-2(2026-04-23): promptBuilder.gs から独立ファイルへ分離
 */




// ==========================================================================
// ★v14.0 Phase 1 (2026-04-20): ホットトピック事前選定機構
// ==========================================================================
//
// 背景(TCAX_REFERENCE.md 事件8):
//   従来は「全データを Claude に投げて、その中から自由に選ばせる」設計だった。
//   結果として毎日似たような静的データ(ゴトー日・通貨強弱%の羅列)を選びがちで、
//   「今この瞬間の新鮮な材料」が投稿に入らず「面白くない」と評価された。
//
//   コンパナの本質: 「事実を収集する → コンパナ風にユーザーに有益に伝える」
//   対話時は人間が「今日のホットな材料」を選んで Claude に渡していた。
//   自動化でもこの「材料選定を先に機械的に実行する」を再現する。
//
// 設計思想:
//   1. 材料(ニュース・通貨強弱・ダウ理論・継続中事象)を構造化して Claude に渡す
//   2. Claude が「今最も語るべきトピック1つ」を選ぶ
//   3. 構造化JSON(headline / background / causalChain / mainPair / dowContext / nextView)を返す
//   4. これを投稿生成プロンプトの最優先ブロックに注入
//   5. 投稿生成 Claude は「選ぶタスク」を免除され「書くタスク」に集中できる
//
// API 呼び出し: +1回(約15-30秒追加・GAS 6分制限に注意)
// フォールバック: 失敗したら null を返し、呼び出し元は従来動作に戻る
//
// 呼び出し元: buildPrompt_ 内(fetchMarketNews_ の直後)
//
/**
 * 【v14.0 Phase 1】ホットトピック事前選定
 * 
 * @param {Object} params
 *   - marketNews:        string  - fetchMarketNews_ の結果(TOP5テキスト)
 *   - currencyStrength:  string  - 通貨強弱ランキングテキスト(例: "AUD(+3.48%) > GBP ...")
 *   - rateDirection:     string  - レート方向テキスト(例: "USD/JPY: 始値→現在 円安方向")
 *   - dowTheory:         string  - ダウ理論 SH/SL テキスト
 *   - ongoingEvents:     string  - 継続中重大事象テキスト(任意)
 *   - postType:          string  - 投稿タイプ('MORNING' 等・時間帯のヒント)
 *   - claudeApiKey:      string  - Claude API キー
 * 
 * @return {Object|null}
 *   成功: {
 *     headline:     string (20文字以内)
 *     background:   string (80文字程度)
 *     causalChain:  string (60文字程度)
 *     mainPair:     string (通貨ペア日本語名)
 *     dowContext:   string (40文字程度)
 *     nextView:     string (60文字程度)
 *     confidence:   'high' | 'medium' | 'low'
 *   }
 *   失敗: null (呼び出し元は従来動作にフォールバック)
 */
function selectHotTopic_(params) {
  params = params || {};
  var marketNews       = params.marketNews       || '';
  var currencyStrength = params.currencyStrength || '';
  var rateDirection    = params.rateDirection    || '';
  var dowTheory        = params.dowTheory        || '';
  var ongoingEvents    = params.ongoingEvents    || '';
  var postType         = params.postType         || 'MORNING';
  var claudeApiKey     = params.claudeApiKey     || '';
  var priorPosts       = params.priorPosts       || [];  // ★v14.2 T2-F(2026-04-27): 日内コンテキスト
  
  if (!claudeApiKey) {
    console.log('⚠️ selectHotTopic_: CLAUDE_API_KEY 未指定 → スキップ');
    return null;
  }
  
  // ニュースがない場合は選定しても意味がない
  if (!marketNews || marketNews.length < 50) {
    console.log('⚠️ selectHotTopic_: ニュース情報が不足 → スキップ');
    return null;
  }
  
  var today = new Date();
  var dateStr = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy年M月d日(E)');
  
  // ===== プロンプト組み立て =====
  var prompt = '';
  prompt += '【タスク】\n';
  prompt += 'あなたはベテランFXアナリスト。今この瞬間、日本のFXトレーダーに\n';
  prompt += '「これを知らないと損する」と思わせる材料を1つ選び、構造化して返せ。\n\n';
  
  prompt += '【本日の日付】\n' + dateStr + '\n\n';
  prompt += '【投稿タイプ】' + postType + '(時間帯のヒント・絶対のルールではない)\n\n';

  // ★v14.2 T2-F(2026-04-27 本番観察追加): 日内コンテキスト注入
  // 背景: 同日 4 投稿が同主題(日銀会合)に収束した問題への対策
  // ★2026-04-30 拡張: 日跨ぎ主題重複回避(YESTERDAY ラベル対応)
  //   背景: 2026-04-30 MORNING で前日(04-29) GOLDEN と同じ「日銀会合」テーマを連投した事故
  try {
    if (priorPosts && priorPosts.length > 0) {
      // 本日分と昨日分を分けて表示(分かりやすさのため)
      var todayList   = [];
      var yesterdayList = [];
      for (var pi = 0; pi < priorPosts.length; pi++) {
        var p = priorPosts[pi];
        if (!p) continue;
        if (p.dayLabel === '昨日') yesterdayList.push(p);
        else                       todayList.push(p);
      }

      if (yesterdayList.length > 0) {
        prompt += '【昨日の既出投稿(主題引きずり防止のための参考)】\n';
        for (var yi = 0; yi < yesterdayList.length; yi++) {
          var py = yesterdayList[yi];
          var summaryY = String(py.text || '').substring(0, 120).replace(/\n/g, ' ');
          prompt += '- 昨日 ' + (py.time || '??:??') + ' ' + (py.type || '?') + ': ' + summaryY + '\n';
        }
        prompt += '\n';
      }

      if (todayList.length > 0) {
        prompt += '【本日の既出投稿(同主題・同切り口の繰り返しを避けるための参考)】\n';
        for (var ti = 0; ti < todayList.length; ti++) {
          var pt = todayList[ti];
          var summaryT = String(pt.text || '').substring(0, 120).replace(/\n/g, ' ');
          prompt += '- 本日 ' + (pt.time || '??:??') + ' ' + (pt.type || '?') + ': ' + summaryT + '\n';
        }
        prompt += '\n';
      }

      prompt += '★重要(主題評価の3軸モットー):\n';
      prompt += '   - 同じ主題でも、別の角度・別の数字・別の通貨ペア・別の時間軸なら OK\n';
      prompt += '   - 完全に同じ切り口の繰り返しだけは避けよ(読者の飽き防止)\n';
      prompt += '   - 判断3軸(全部満たすほど良い):\n';
      prompt += '     (1) ホット度: 今この瞬間の最新材料か。続報があるなら何度触れても OK\n';
      prompt += '     (2) 面白さ: 読者の好奇心を引く切り口か(意外性・新事実・数字の具体化)\n';
      prompt += '     (3) 役立つ度: トレード判断に使える具体情報があるか\n';
      prompt += '   - 当日最大材料(日銀・FOMC等)は何度でも触れて可・ただし毎回違う角度から\n';
      prompt += '   - 切り口の進化例(同主題でも時系列で深掘り):\n';
      prompt += '     朝「日銀会合の予告・想定シナリオ」 →\n';
      prompt += '     昼「発表直前のポジション動向・市場心理」 →\n';
      prompt += '     夕「会見後の値動き反応・次の見方」\n';
      prompt += '   - 既出の二項対立(タカ派/ハト派 等)は、3 投稿目以降では別フレーミング(具体的な指標予想数値・テクニカル水準)を優先\n';
      prompt += '   - ★2026-04-30 追加: 昨日既出の主題は今日の MORNING/LUNCH で軸にするな(続報や新展開がある場合のみ角度を変えて触れる)\n';
      prompt += '     例: 昨日 GOLDEN で日銀会合タカ派サプライズを論じた → 今日 MORNING は日銀以外(FOMC・米GDP・ポンド等)を軸に\n';
      prompt += '\n';
    }
  } catch (priorErr) {
    // priorPosts 処理失敗時はセクションを諦めて従来動作に戻る
    console.log('⚠️ selectHotTopic_: priorPosts 処理失敗(コンテキスト注入スキップ): ' + priorErr.message);
  }

  prompt += '【判断材料1: 直近の市場ニュースTOP5】\n';
  prompt += marketNews + '\n\n';
  
  if (currencyStrength) {
    prompt += '【判断材料2: 現在の通貨強弱(実測値)】\n';
    prompt += currencyStrength + '\n\n';
  }
  
  if (rateDirection) {
    prompt += '【判断材料3: 本日の方向性】\n';
    prompt += rateDirection + '\n\n';
  }
  
  if (dowTheory) {
    prompt += '【判断材料4: ダウ理論(日足SH/SL)】\n';
    prompt += dowTheory + '\n\n';
  }
  
  if (ongoingEvents) {
    prompt += '【判断材料5: 継続中の重大事象】\n';
    prompt += ongoingEvents + '\n\n';
  }
  
  prompt += '【判断の軸】\n';
  prompt += '1. FXトレーダーが知らないと損する材料か?\n';
  prompt += '2. 今日の値動きの因果を説明できるか?\n';
  prompt += '3. 具体的な通貨ペアに影響があるか?\n';
  prompt += '4. 「次の見方」を示せるか?(このラインを抜けたら転換 など)\n\n';

  // ★2026-04-30 追加: 値動き連動の判断材料優先順位
  // 背景: 2026-04-30 GOLDEN で「ウォーシュ承認」(政治・人事ニュース)を選定したが、
  //       実際のホットは片山財務相の円安けん制発言(ドル円1円急落)だった。
  //       ニュースに表面化する前に値動きが起きていた場合、政治・人事より値動きを優先せよ。
  prompt += '【★判断材料の優先順位(2026-04-30 追加)】\n';
  prompt += '1. 本日の値動き(レート方向性・通貨強弱の最大変動)が最優先\n';
  prompt += '   - 短時間で1円以上動いた通貨ペアがあるか?\n';
  prompt += '   - 通貨強弱で +/-3%超が出ているか?\n';
  prompt += '2. 値動きを起こした最新の材料(政治発言・指標・地政学)\n';
  prompt += '   - 為替介入示唆・円安けん制・要人発言・指標サプライズ等\n';
  prompt += '3. 値動きが小さい場合のみ、政治・人事ニュース(承認・任命等)を採用\n\n';
  prompt += '★ニュース TOP5 に表面化していなくても、本日のレート変動が大きい場合は\n';
  prompt += '  「何が原因でこの値動きになったか」を逆算して材料を推定せよ。\n';
  prompt += '  例: ドル円が短時間で1円急落 → 為替介入示唆発言・財務相/財務官のけん制発言を疑え\n';
  prompt += '  例: 円が独歩高 → 日本側の円安けん制発言・介入示唆の可能性を疑え\n';
  prompt += '  例: ドルが独歩安 → FOMC ハト派サプライズ・米要人のドル安容認発言の可能性を疑え\n';
  prompt += '★政治・人事ニュース(議長承認・任命等)は派手だが、実際の値動きが小さい場合は\n';
  prompt += '  ホットトピックに選ぶな。市場が反応していない材料はトレーダーにとって優先度が低い。\n\n';
  
  prompt += '【出力形式(必ずこのJSON形式で返せ・余計な説明は不要・コードブロック記法も不要)】\n';
  prompt += '{\n';
  prompt += '  "headline":    "20文字以内で簡潔に。キャッチーに",\n';
  prompt += '  "background":  "80文字程度。いつ何が起きたか・現状どう進行しているか",\n';
  prompt += '  "causalChain": "60文字程度。原因→経路→為替への影響の順",\n';
  prompt += '  "mainPair":    "通貨ペア日本語名(ドル円/豪ドル米ドル/ユーロドル等)",\n';
  prompt += '  "dowContext":  "40文字程度。日足のトレンド状況を具体値で",\n';
  prompt += '  "nextView":    "60文字程度。XX抜けたらYY形式で具体レベルを示す",\n';
  prompt += '  "confidence":  "high/medium/low(この材料の影響確度)"\n';
  prompt += '}\n\n';
  
  prompt += '【注意】\n';
  prompt += '- 毎日同じネタ(ゴトー日・通貨強弱%のみ)を選ぶな。新鮮なニュース由来の材料を優先\n';
  prompt += '- 静的データではなく、今この瞬間のホットな材料を選べ\n';
  prompt += '- トレーダーが「人より早く知りたい」情報を優先\n';
  prompt += '- JSON以外の文字(コードブロック、説明文、マークダウン)は一切出力するな\n';
  
  // ===== Claude API 呼び出し =====
  console.log('🎯 selectHotTopic_: ホットトピック選定中...');
  console.log('   プロンプト長: ' + prompt.length + '文字');
  
  var result;
  try {
    result = callClaudeApi_(prompt, claudeApiKey, {
      maxTokens: 1024,            // 構造化JSONなので少なめで十分
      maxRetries: 2,              // API回数節約
      logPrefix: 'ホットトピック選定',
      systemPrompt: 'あなたはFX市場の材料選定エキスパート。トレーダーが最も知りたい材料を1つ選び、指定されたJSON形式のみで返す。'
    });
  } catch (e) {
    console.log('⚠️ selectHotTopic_: API呼び出しエラー → null 返却: ' + e.message);
    return null;
  }
  
  if (!result || !result.text) {
    console.log('⚠️ selectHotTopic_: レスポンスが空 → null 返却');
    return null;
  }
  
  // ===== JSON パース(防御的) =====
  var rawText = result.text.trim();
  
  // コードブロック記法が混入している場合は除去
  rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  
  // JSON の先頭{から最後の}までを抽出(前後の説明文を除去)
  var firstBrace = rawText.indexOf('{');
  var lastBrace  = rawText.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    console.log('⚠️ selectHotTopic_: JSONブロックが見つからない → null 返却');
    console.log('   レスポンス先頭: ' + rawText.substring(0, 200));
    return null;
  }
  rawText = rawText.substring(firstBrace, lastBrace + 1);
  
  var parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    console.log('⚠️ selectHotTopic_: JSONパース失敗 → null 返却: ' + e.message);
    console.log('   パース試行対象: ' + rawText.substring(0, 300));
    return null;
  }
  
  // ===== 必須フィールド検証 =====
  var requiredFields = ['headline', 'background', 'causalChain', 'mainPair', 'dowContext', 'nextView'];
  for (var i = 0; i < requiredFields.length; i++) {
    var field = requiredFields[i];
    if (!parsed[field] || typeof parsed[field] !== 'string' || parsed[field].trim().length === 0) {
      console.log('⚠️ selectHotTopic_: 必須フィールド ' + field + ' が欠落/不正 → null 返却');
      return null;
    }
  }
  
  // confidence はデフォルト値補完
  if (!parsed.confidence || ['high', 'medium', 'low'].indexOf(parsed.confidence) === -1) {
    parsed.confidence = 'medium';
  }
  
  console.log('✅ selectHotTopic_: 選定成功');
  console.log('   ヘッドライン: ' + parsed.headline);
  console.log('   主役ペア: ' + parsed.mainPair);
  console.log('   確度: ' + parsed.confidence);
  
  return parsed;
}



/**
 * 【v14.0 Phase 1】ホットトピックをプロンプト用テキストに整形
 * 
 * selectHotTopic_ の戻り値を、投稿生成プロンプトへ注入する文字列に変換する。
 * 
 * @param {Object} hotTopic - selectHotTopic_ の戻り値
 * @return {string} プロンプト用テキスト
 */
function formatHotTopicForPrompt_(hotTopic) {
  if (!hotTopic) return '';
  
  var text = '';
  text += '【★今日書くべきトピック1つ(これを核にしろ・ここから逸脱禁止)】\n';
  text += 'ヘッドライン: ' + hotTopic.headline + '\n';
  text += '背景: ' + hotTopic.background + '\n';
  text += '因果チェーン: ' + hotTopic.causalChain + '\n';
  text += '今日の主役ペア: ' + hotTopic.mainPair + '\n';
  text += 'ダウ理論の文脈: ' + hotTopic.dowContext + '\n';
  text += '次の見方: ' + hotTopic.nextView + '\n\n';
  
  text += '【書く手順(この順番で構成しろ)】\n';
  text += '1. 冒頭1行: ヘッドラインをキャッチーに言い換え\n';
  text += '2. 背景を簡潔に説明(いつ何が起きたか・現状どう進行しているか)\n';
  text += '3. 因果チェーンで相場への波及を語る\n';
  text += '4. 主役ペアのダウ理論文脈を具体値で(「日足SH XX を超えたら」等)\n';
  text += '5. 次の見方を示す(具体レベル + 転換条件)\n\n';
  
  text += '※ このトピックを軸に書け。通貨強弱%の羅列や静的データ(ゴトー日のみ等)で投稿を埋めるな。\n';
  text += '※ MORNING/GOLDEN で仮説振り返りがある場合は、冒頭1ブロックで済ませてから本トピックへ。\n\n';
  
  return text;
}

