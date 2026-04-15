/**
 * CompanaFXAutoPost - qualityReview.gs
 * 投稿品質レビュー（Claude API）
 * 
 * v8.6: 新規作成
 * ★v8.14: callClaude_改修 — 529対策（指数バックオフ5→10→20秒、リトライ2→3回、エラー詳細ログ）
 * ★v8.16: ハッシュタグ分離ロジック強化 — \n\n# 以外のパターン（\n# や空白+#）にも対応
 * ★v12.4: Step 2修正をGemini→Claudeに変更。確定データ（通貨強弱）を修正プロンプトに注入し方向矛盾を防止
 * ★v12.5: callClaude_ をcallClaudeApi_共通関数のラッパーに簡素化（84行→12行）
 * ★v12.5.1: 経済カレンダーを品質レビュー+修正に注入。指標の発表済み/未発表はカレンダー確定データのみで判定（Web検索で覆すな）
 * ★v12.5.3: Q6事実誤り検出時はパッチ修正ではなく全文再生成。確定データだけに基づいて最初から書き直す
 * ★v12.5.4: 口調の一元管理。ハードコード口調を全削除し、キャラクターシートを動的読み込み（getCharacterPrompt）
 * ★v12.5.5: Q6再生成後に2回目品質レビュー（Q6スキップ）追加。再生成プロンプトをスリム化。いたちごっこ解消
 * 
 * Claudeが品質レビュー（Q1〜Q7）を行い、問題があればClaudeが自分で修正する。
 * 「正確か？」はfactCheckPost_（Gemini Grounding）が担当。
 * 「良い投稿か？」と「修正」はqualityReviewPost_（Claude）が担当。
 * 
 * レビュー項目:
 *   Q1. タイプ整合: 投稿の冒頭・トーンがpostTypeの時間帯と合っているか
 *   Q2. 表現重複: 今日の過去投稿と同じ締め文・フレーズが使われていないか
 *   Q3. 文の完成度: 体言止め・文脈の飛躍・途中で切れた文がないか
 *   Q4. 文字数: charMin〜charMax内に収まっているか
 *   Q5. 口調の一貫性: コンパナの口調が維持されているか
 *   Q6. 事実の信憑性: 確定データ（レート・商品価格）との矛盾がないか（★v11.0追加）
 *   Q7. 絵文字行の書き分け: 絵文字行が事実のみで、体言止め・動詞止めになっているか（★v12.3.1追加: 体言止めルール）
 * 
 * 必要なスクリプトプロパティ:
 *   CLAUDE_API_KEY: Anthropic APIキー
 */


// ===== 投稿タイプ別の時間帯と役割（Q1判定用） =====
var TYPE_DESCRIPTIONS = {
  // ★v12.3: ストーリー主導に更新
  'MORNING': '朝7:30頃配信。今一番ホットな地政学・ファンダのネタ1つを因果チェーンで展開。「自分はこう読んでいる」を伝える。データは裏付け。150〜300字。NG: データから始める。指標を全部列挙。3ペア以上に言及',
  'TOKYO': '朝9:30頃配信。短くてもためになる一言。ホットなニュースがあれば速報ヘッドラインで。なければ東京の空気感を1〜2文。100〜180字。NG: 長い分析。冗長な解説',
  'LUNCH': '昼12時台配信。短くてもためになる一言。午前に動きがあれば速報的に。生活×為替の共感も◎。100〜180字。NG: 長い分析。午後の展望。仮説の振り返り',
  'LONDON': '夕方17時台配信。欧州勢参入で何が変わったかを1ネタ。東京との温度差。100〜250字。NG: 東京時間の詳細な振り返り',
  'GOLDEN': '夜20-21時台配信。1日の締め。冷静な振り返り。今日の答え合わせ1〜2文+一番の学び。150〜350字。NG: ネガティブ感情。詳細な市場分析の繰り返し。明日の展望',
  'NY': '夜22時台配信。今夜の一点集中。焦点1つ+翌朝の仮説1つ。100〜250字。NG: 今日の振り返り。テーマを3つ並べる',
  'INDICATOR': '指標発表前の復習メモ。①この指標は何か②今回なぜ注目か③見るべきポイント1つ。140〜180字。先輩が本番前にサッと教えてくれる感覚。NG: 詳細な予想値解説。複数指標を並べる。残り時間表現',
  'WEEKLY_REVIEW': '土曜朝。今週を一言で+一番印象的な出来事1つ。レートの羅列禁止。物語で。200〜400字',
  'WEEKLY_LEARNING': '土曜夕方。今週の気づき1つ。法則形式が理想。市場レポートではなく心理面・判断の反省。150〜300字',
  'NEXT_WEEK': '日曜昼。来週の最大イベント1つ+アノマリー。指標の全列挙禁止。200〜400字',
  'WEEKLY_HYPOTHESIS': '日曜夜。来週の仮説1つ。因果チェーン（原因→経路→為替への影響）。150〜300字',
  'RULE_1': '土曜。原則1つを短く言い切る。実体験付き。120〜280字',
  'RULE_2': '土曜。習慣・メンタル1つ。仕事や生活にも通じる話。120〜280字',
  'RULE_3': '日曜。実践テクニック1つ。具体的にすぐ使える。120〜280字',
  'RULE_4': '日曜。失敗談・本音。正直に。弱さを見せる。120〜280字',
  'KNOWLEDGE': '知識解説。1つの金融知識を身近な例で。「自分の財布にどう関係するか」。150〜350字'
};


// ===== メイン: 品質レビュー =====
/**
 * Claude APIで投稿の品質をレビューする
 * 
 * @param {string} postText - レビュー対象の投稿テキスト
 * @param {string} postType - 投稿タイプ
 * @param {Object} typeConfig - POST_TYPES[postType]（charMin/charMax等）
 * @return {Object} { passed: boolean, issues: Array, revisedText: string }
 */
function qualityReviewPost_(postText, postType, typeConfig, rates, csData) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!apiKey) {
      console.log('⚠️ CLAUDE_API_KEY未設定 → 品質レビューをスキップ');
      return { passed: true, issues: [], revisedText: '' };
    }
    
    // 今日の過去投稿を取得（重複チェック用）
    var previousPosts = getTodayPreviousPosts_();
    
    // 投稿タイプの時間帯と役割
    var typeDesc = TYPE_DESCRIPTIONS[postType] || '';
    
    // 文字数情報
    var charMin = typeConfig.charMin || 200;
    var charMax = typeConfig.charMax || 420;
    var bodyText = postText.split(/\n\n#/)[0]; // ハッシュタグ前の本文
    var currentLength = bodyText.length;
    
    // ===== Step 1: Claude → 指摘のみ（修正テキストは要求しない） =====
    var reviewPrompt = 'あなたはFX関連X投稿の品質レビュアーです。\n';
    reviewPrompt += '以下の投稿を7つの観点でレビューし、問題点のみを指摘してください。\n';
    reviewPrompt += '★修正テキストは不要。問題点の指摘だけに集中せよ。\n\n';
    
    reviewPrompt += '【投稿タイプ】' + postType + '（' + (typeConfig.label || '') + '）\n';
    reviewPrompt += '【投稿タイプの時間帯と役割】' + typeDesc + '\n';
    reviewPrompt += '【文字数制限】' + charMin + '〜' + charMax + '文字（現在: ' + currentLength + '文字）\n\n';
    
    // ★v11.0: 確定データを注入（Q6事実検証用）
    // RULE系は個人の経験談が主体なので確定データ注入不要
    var skipFactTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4'];
    if (skipFactTypes.indexOf(postType) === -1) {
      var confirmedData = '';
      try {
        var latestRates = getLatestRatesFromCache_(getApiKeys().SPREADSHEET_ID);
        if (latestRates) {
          confirmedData += '  USD/JPY: ' + formatRate_(latestRates.usdjpy, 'usdjpy', 'verify') + '円\n';
          confirmedData += '  EUR/JPY: ' + formatRate_(latestRates.eurjpy, 'eurjpy', 'verify') + '円\n';
          confirmedData += '  GBP/JPY: ' + formatRate_(latestRates.gbpjpy, 'gbpjpy', 'verify') + '円\n';
          confirmedData += '  AUD/JPY: ' + formatRate_(latestRates.audjpy, 'audjpy', 'verify') + '円\n';
          confirmedData += '  EUR/USD: ' + formatRate_(latestRates.eurusd, 'eurusd', 'verify') + '\n';
          confirmedData += '  GBP/USD: ' + formatRate_(latestRates.gbpusd, 'gbpusd', 'verify') + '\n';
          confirmedData += '  AUD/USD: ' + formatRate_(latestRates.audusd, 'audusd', 'verify') + '\n';
        }
      } catch (e) { /* レート取得失敗は無視 */ }
      try {
        var btcCom = fetchCommodityPrices_();
        if (btcCom && btcCom.btc) confirmedData += '  ビットコイン: ' + btcCom.btc.toFixed(0) + 'ドル\n';
        if (btcCom && btcCom.gold) confirmedData += '  ゴールド: ' + btcCom.gold.toFixed(2) + 'ドル\n';
      } catch (e) { /* 商品価格取得失敗は無視 */ }
      if (confirmedData) {
        reviewPrompt += '【確定データ（API取得の正確な値。Q6の判定に使用）】\n';
        reviewPrompt += confirmedData;
        reviewPrompt += '※上記は全てリアルタイムAPIから取得した正確な値である。お前の内部知識と乖離していても、確定データが正しい。確定データ自体の異常値を指摘するな。投稿テキスト内の数値と確定データの矛盾だけを検証せよ。\n\n';
      }
      
      // ★v12.5.1: 経済カレンダーを注入（指標の発表済み/未発表を判定する唯一の情報源）
      try {
        var calForReview = getEconomicCalendar_('today');
        if (calForReview) {
          reviewPrompt += '【★★★ 経済カレンダー確定データ（指標の発表済み/未発表の唯一の判定基準）】\n';
          reviewPrompt += calForReview + '\n';
          reviewPrompt += '※「結果」欄が空の指標 = 未発表。「結果」欄に数値がある指標 = 発表済み。\n';
          reviewPrompt += '※この判定は絶対。Web検索で「既に発表済み」という情報が見つかっても、カレンダーの結果欄が空なら未発表として扱え。\n';
          reviewPrompt += '※未発表の指標を「発表済み」と指摘するのは致命的な誤り。逆に、発表済みの指標を「未発表」と書いている投稿は指摘せよ。\n\n';
        }
      } catch (calErr) { /* カレンダー取得失敗は無視（続行） */ }
    }
    
    reviewPrompt += '【レビュー対象の投稿テキスト】\n';
    reviewPrompt += postText + '\n\n';
    
    if (previousPosts && previousPosts.length > 0) {
      reviewPrompt += '【今日の過去投稿（重複チェック用）】\n';
      for (var i = 0; i < previousPosts.length; i++) {
        reviewPrompt += '--- ' + previousPosts[i].type + ' ---\n';
        reviewPrompt += previousPosts[i].text + '\n\n';
      }
    }
    
    // ★v12.5.4: キャラクターシートを動的注入（口調の一元管理）
    // 口調はqualityReview.gsにハードコードしない。スプレッドシート「キャラクター」シートが唯一の定義。
    var characterPrompt = '';
    try {
      characterPrompt = getCharacterPrompt();
      if (characterPrompt) {
        reviewPrompt += '【キャラクター定義（口調判定の唯一の基準。以下に書かれた口調だけがコンパナの正しい口調）】\n';
        reviewPrompt += characterPrompt + '\n\n';
      }
    } catch (charErr) { /* キャラクターシート取得失敗は無視（Q5判定が甘くなるが投稿は止まらない） */ }
    
    reviewPrompt += '【レビュー項目】\n';
    reviewPrompt += 'Q1. タイプ整合: この投稿の冒頭・トーンは「' + postType + '」の時間帯と合っているか？\n';
    reviewPrompt += '    上記の【時間帯と役割】に基づいて判定せよ。\n';
    reviewPrompt += 'Q2. 表現重複: 今日の過去投稿と同じ締め文・フレーズ（「休む勇気」「検証日和」等）が使われていないか？\n';
    reviewPrompt += 'Q3. 文の完成度: 体言止めで文が完結していない箇所、孤立した短文（「です。」だけ等）、文脈が飛躍している箇所はないか？\n';
    reviewPrompt += 'Q4. 文字数: ' + charMin + '〜' + charMax + '文字に収まっているか？（現在' + currentLength + '文字）\n';
    reviewPrompt += '    超過している場合、どの部分が冗長で削れるかを具体的に指摘せよ。\n';
    reviewPrompt += 'Q5. 口調の一貫性: 上記のキャラクター定義に基づいて口調が維持されているか？\n';
    reviewPrompt += '    アナリスト調（〜である/〜であろう/〜と見られる/推察される）になっていたら指摘せよ。\n';
    reviewPrompt += '    同じ語尾が2回連続していたら指摘せよ（バリエーション最低3種類）。\n';
    reviewPrompt += 'Q6. 事実の信憑性: 投稿に含まれる具体的な価格・数値・出来事が、上記の確定データと矛盾していないか？\n';
    reviewPrompt += '    また、要人の発言や政策決定など、お前の知識で明らかに事実と異なる記述がないか？\n';
    reviewPrompt += '    さらに「史上最高値」「過去最安値」「急騰」「暴落」「○年ぶり」等の定性的な主張も検証せよ。\n';
    reviewPrompt += '    確定データの数値だけでは検証できない主張（例:「最高値更新中」）は、お前の知識で事実かどうか判断し、\n';
    reviewPrompt += '    事実と確認できない場合は「検証不能のため削除すべき」と指摘せよ。\n';
    reviewPrompt += '    確定データがない場合（RULE系等）はスキップしてよい。\n';
    reviewPrompt += '    ★v12.2: Web検索が使える。要人発言・政策決定・直近のイベントについて投稿が言及している場合、\n';
    reviewPrompt += '    Web検索で事実かどうかを必ず確認せよ。例:「植田総裁が〜と発言」→検索して発言の事実を確認。\n';
    reviewPrompt += '    「RBAが利上げ」→検索して最新の政策決定を確認。検索で裏付けが取れない主張は指摘せよ。\n';
    reviewPrompt += '    ★★★v12.5.1 最最重要: 経済指標の「発表済み/未発表」は上記の経済カレンダー確定データのみで判定せよ。\n';
    reviewPrompt += '    カレンダーの結果欄が空 = 未発表。これは絶対のルール。Web検索で「4月10日に発表済み」等の情報が出ても、\n';
    reviewPrompt += '    カレンダーの結果欄が空ならその指標は未発表として扱え。Web検索でカレンダーの未発表ステータスを覆すな。\n';
    reviewPrompt += '    「未発表の指標を発表済みに書き換えろ」という指摘は致命的な誤り。結果が存在しない指標の結果を捏造するな。\n';
    reviewPrompt += '    ★v12.1.1: 仮説の振り返り部分がある場合、「方向は合った」のに「逆方向でした」と書いていないか確認せよ。\n';
    reviewPrompt += '    データが上昇を示しているのに「下落した」と書くのは環境認識の失敗であり、最も重大な誤り。\n';
    reviewPrompt += '    ★未発表イベントの過去形チェック: 経済カレンダーで「結果」が空のイベントを「〜を受けて」「〜が示された」等の過去形で書いていないか確認せよ。\n';
    reviewPrompt += '    まだ発表されていないイベントを過去形で書くのはハルシネーションであり、最も重大な誤り。\n';
    reviewPrompt += 'Q7. 絵文字行の書き分け: 絵文字（☕📕📝📋💡⚠️✅）で始まる行は「事実の短い言い切り」になっているか？\n';
    reviewPrompt += '    ■ 感想禁止: 絵文字行に感想・感情・意見（「驚きました」「マジで」「すごい」「怖い」「嬉しい」等）が混入していたら指摘せよ。\n';
    reviewPrompt += '    感想は→行に書くのがルール。絵文字行は事実だけ。\n';
    reviewPrompt += '    ■ 体言止め・動詞止め必須: 絵文字行は速報ヘッドライン調で書け。「〜しました。」「〜しています。」「〜していますね。」は冗長なので禁止。\n';
    reviewPrompt += '    OK: 「📝米イラン交渉が決裂。」「🛢原油、100ドル突破。」「💡植田総裁の発言を控える。」「📕雇用統計、予想を大きく上回る結果。」\n';
    reviewPrompt += '    NG: 「📝米イラン交渉が決裂しました。」「🛢原油が100ドルを突破しています。」「📕3月の米雇用統計、マジで驚きましたね。」「☕上昇基調が続いていますね。」\n';
    reviewPrompt += '    ■ 指標名の省略禁止: 経済指標の数値を書く場合は必ず指標名（PPI, CPI, GDP等）を明記せよ。\n';
    reviewPrompt += '    OK: 「📕米PPI前年同月比、予想4.6%に対して4.0%で下振れ。」\n';
    reviewPrompt += '    NG: 「📕米前年同月比、予想4.6%に対して4.0%で下振れ。」（何の指標か分からない）\n\n';
    
    reviewPrompt += '【出力形式（絶対厳守）】\n';
    reviewPrompt += '★Web検索を使った場合でも、検索結果の説明や分析テキストは一切出力するな。\n';
    reviewPrompt += '★出力はJSON形式のみ。JSON以外の文字を1文字でも出力したら失敗とみなす。\n';
    reviewPrompt += '{\n';
    reviewPrompt += '  "passed": true/false,\n';
    reviewPrompt += '  "issues": [\n';
    reviewPrompt += '    {"id": "Q1〜Q7", "problem": "問題の説明（Web検索で確認した事実も含めて書け）", "suggestion": "どう直すべきかの具体的指示"}\n';
    reviewPrompt += '  ]\n';
    reviewPrompt += '}\n';
    reviewPrompt += '問題がなければ {"passed": true, "issues": []} を返せ。\n';
    
    // Claude API呼び出し（指摘のみ）★v12.2: Web検索有効（Q6事実検証強化）
    var reviewResult = callClaude_(reviewPrompt, apiKey, true);
    
    if (!reviewResult) {
      console.log('⚠️ Claude API呼び出し失敗 → 品質レビューをスキップ');
      return { passed: true, issues: [], revisedText: '' };
    }
    
    // JSONパース
    var parsed = parseClaudeReviewResponse_(reviewResult);
    
    if (!parsed) {
      console.log('⚠️ Claude品質レビュー応答のパース失敗 → スキップ');
      return { passed: true, issues: [], revisedText: '' };
    }
    
    // ログ出力
    if (parsed.passed) {
      console.log('✅ 品質レビュー（Claude）: 合格');
      return { passed: true, issues: [], revisedText: '' };
    }
    
    console.log('📝 品質レビュー（Claude）: ' + parsed.issues.length + '件の改善');
    for (var j = 0; j < parsed.issues.length; j++) {
      console.log('  ' + parsed.issues[j].id + ': ' + parsed.issues[j].problem);
    }
    
    // ===== Step 2: 修正 =====
    // ★v12.5.5: Q6事実誤り → スリム再生成 → 2回目品質レビュー(Q6スキップ) → パッチ修正
    // Q6なし → 従来パッチ修正
    
    var q6Issues = [];
    var otherIssues = [];
    for (var qi = 0; qi < parsed.issues.length; qi++) {
      var issueId = parsed.issues[qi].id || '';
      if (issueId.indexOf('Q6') !== -1) {
        q6Issues.push(parsed.issues[qi]);
      } else {
        otherIssues.push(parsed.issues[qi]);
      }
    }
    
    var revisedText = '';
    
    if (q6Issues.length > 0) {
      // ===== Q6事実誤り → 全文再生成（スリムプロンプト） =====
      console.log('🔄 Q6事実誤り' + q6Issues.length + '件 → 全文再生成モード');
      
      var regenPrompt = 'あなたはFX関連X投稿のライター「コンパナ」です。\n';
      regenPrompt += '以下の投稿に事実誤りがあった。確定データだけに基づいて全文を書き直せ。\n\n';
      regenPrompt += '【投稿タイプ】' + postType + '（' + (typeConfig.label || '') + '）\n';
      regenPrompt += '【投稿タイプの役割】' + typeDesc + '\n';
      regenPrompt += '【文字数】' + charMin + '〜' + charMax + '文字\n\n';
      
      // キャラクターシート注入（口調の基盤）
      if (characterPrompt) {
        regenPrompt += '【キャラクター口調（この口調で書け）】\n' + characterPrompt + '\n\n';
      }
      regenPrompt += '【事実誤り（これを繰り返すな）】\n';
      for (var q6i = 0; q6i < q6Issues.length; q6i++) {
        regenPrompt += '・' + q6Issues[q6i].problem + '\n';
      }
      regenPrompt += '\n【確定データ（事実はこれだけ。確定データにないことは書くな）】\n';
      if (rates) {
        if (rates.usdjpy) regenPrompt += 'USD/JPY: ' + formatRate_(rates.usdjpy, 'usdjpy', 'display') + '  ';
        if (rates.audusd) regenPrompt += 'AUD/USD: ' + formatRate_(rates.audusd, 'audusd', 'display') + '  ';
        if (rates.eurusd) regenPrompt += 'EUR/USD: ' + formatRate_(rates.eurusd, 'eurusd', 'display') + '\n';
        if (rates.gbpusd) regenPrompt += 'GBP/USD: ' + formatRate_(rates.gbpusd, 'gbpusd', 'display') + '  ';
        if (rates.audjpy) regenPrompt += 'AUD/JPY: ' + formatRate_(rates.audjpy, 'audjpy', 'display') + '  ';
        if (rates.eurjpy) regenPrompt += 'EUR/JPY: ' + formatRate_(rates.eurjpy, 'eurjpy', 'display') + '\n';
      }
      if (csData && csData.length > 0) {
        regenPrompt += '通貨強弱: ';
        for (var ci = 0; ci < csData.length; ci++) {
          regenPrompt += csData[ci].currency + '(' + (csData[ci].score >= 0 ? '+' : '') + csData[ci].score.toFixed(2) + '%) ';
        }
        regenPrompt += '\n';
      }
      try {
        var calForRegen = getEconomicCalendar_('today');
        if (calForRegen) regenPrompt += '経済カレンダー（結果欄が空=未発表）:\n' + calForRegen + '\n';
      } catch (e) {}
      regenPrompt += '\n【フォーマット】\n';
      regenPrompt += '・絵文字行（☕📕📝💡⚠️✅）+ →行のブロック構造で書け。絵文字なしの投稿は禁止。\n';
      regenPrompt += '・絵文字行 = 事実の短い言い切り。→行 = 分析・意見。\n';
      regenPrompt += '・レート数値は確定データをそのまま使え。桁を変えるな。\n';
      regenPrompt += '\n投稿テキストのみ出力。説明不要。\n';
      
      var regenResult = callClaudeGenerate_(regenPrompt, getApiKeys());
      if (!regenResult || !regenResult.text) {
        console.log('⚠️ Q6再生成失敗 → 指摘のみ返却');
        return { passed: false, issues: parsed.issues, revisedText: '' };
      }
      
      var regenText = regenResult.text;
      console.log('✅ Q6再生成完了（' + regenText.length + '文字）');
      
      // ===== 2回目品質レビュー（Q6スキップ） =====
      console.log('🔍 再生成後の品質チェック（Q6スキップ）...');
      
      var review2Prompt = 'FX投稿テキストの品質をチェックしてください。事実検証（Q6）は済んでいるのでスキップ。\n\n';
      review2Prompt += '【投稿テキスト】\n' + regenText + '\n\n';
      
      // キャラクターシート注入（口調判定用）
      if (characterPrompt) {
        review2Prompt += '【キャラクター定義】\n' + characterPrompt + '\n\n';
      }
      
      review2Prompt += '【チェック項目】\n';
      review2Prompt += 'Q4. 文字数: ' + charMin + '〜' + charMax + '文字か？超過なら冗長箇所を指摘。\n';
      review2Prompt += 'Q5. 口調: 上記キャラクター定義の口調か？アナリスト調・AI調になっていないか？同じ語尾2回連続してないか？\n';
      review2Prompt += 'Q7. 絵文字行: 事実の短い言い切りか？感想・逆説（「ただ〜」）が混入していないか？体言止め・動詞止めか？\n';
      review2Prompt += '    指標名（PPI等）が省略されていないか？\n';
      review2Prompt += '    →行がない絵文字ブロックはないか？\n\n';
      review2Prompt += '{"passed": true/false, "issues": [{"id": "Q4〜Q7", "problem": "...", "suggestion": "..."}]}\n';
      review2Prompt += 'JSON形式のみ出力。問題なければ {"passed": true, "issues": []}。\n';
      
      var review2Result = callClaude_(review2Prompt, apiKey, false); // Web検索なし
      var parsed2 = review2Result ? parseClaudeReviewResponse_(review2Result) : null;
      
      if (parsed2 && !parsed2.passed && parsed2.issues.length > 0) {
        // 2回目で問題あり → パッチ修正
        console.log('📝 再生成後の品質指摘: ' + parsed2.issues.length + '件 → パッチ修正');
        for (var p2j = 0; p2j < parsed2.issues.length; p2j++) {
          console.log('  ' + parsed2.issues[p2j].id + ': ' + parsed2.issues[p2j].problem);
        }
        
        var patchPrompt = '以下のFX投稿テキストを品質指摘に基づいて修正してください。\n\n';
        patchPrompt += '【投稿テキスト】\n' + regenText + '\n\n';
        patchPrompt += '【品質指摘】\n';
        for (var p2k = 0; p2k < parsed2.issues.length; p2k++) {
          patchPrompt += '・' + parsed2.issues[p2k].id + ': ' + parsed2.issues[p2k].problem + '\n';
          if (parsed2.issues[p2k].suggestion) patchPrompt += '  → ' + parsed2.issues[p2k].suggestion + '\n';
        }
        patchPrompt += '\n【ルール】\n';
        patchPrompt += '・指摘箇所だけ直せ。それ以外は触るな。\n';
        patchPrompt += '・文字数' + charMin + '〜' + charMax + '文字。\n';
        patchPrompt += '・絵文字行は事実のみ。感想・逆説は→行に書け。\n';
        patchPrompt += '・修正後テキストのみ出力。\n';
        
        if (characterPrompt) {
          patchPrompt += '\n【キャラクター口調】\n' + characterPrompt + '\n';
        }
        
        var patchResult = callClaudeGenerate_(patchPrompt, getApiKeys());
        revisedText = (patchResult && patchResult.text) ? patchResult.text : regenText;
        console.log('✅ 品質修正完了（Q6再生成→品質チェック→パッチ修正）');
      } else {
        revisedText = regenText;
        console.log('✅ 再生成後の品質チェック: 合格');
      }
      
    } else {
      // ===== Q6なし → 従来パッチ修正 =====
      var fixPrompt = '以下のFX投稿テキストを、品質レビューの指摘に基づいて修正してください。\n\n';
      fixPrompt += '【元の投稿テキスト】\n' + postText + '\n\n';
      fixPrompt += '【品質レビューの指摘】\n';
      for (var k = 0; k < parsed.issues.length; k++) {
        fixPrompt += '・' + parsed.issues[k].id + ': ' + parsed.issues[k].problem + '\n';
        if (parsed.issues[k].suggestion) fixPrompt += '  → 修正指示: ' + parsed.issues[k].suggestion + '\n';
      }
      fixPrompt += '\n【確定データ（これが絶対的な事実。品質レビューの指摘より優先）】\n';
      if (rates) {
        fixPrompt += '確定レート:\n';
        if (rates.usdjpy) fixPrompt += '  USD/JPY: ' + formatRate_(rates.usdjpy, 'usdjpy', 'verify') + '円\n';
        if (rates.audusd) fixPrompt += '  AUD/USD: ' + formatRate_(rates.audusd, 'audusd', 'verify') + 'ドル\n';
        if (rates.audjpy) fixPrompt += '  AUD/JPY: ' + formatRate_(rates.audjpy, 'audjpy', 'verify') + '円\n';
        if (rates.eurjpy) fixPrompt += '  EUR/JPY: ' + formatRate_(rates.eurjpy, 'eurjpy', 'verify') + '円\n';
        if (rates.gbpjpy) fixPrompt += '  GBP/JPY: ' + formatRate_(rates.gbpjpy, 'gbpjpy', 'verify') + '円\n';
        if (rates.eurusd) fixPrompt += '  EUR/USD: ' + formatRate_(rates.eurusd, 'eurusd', 'verify') + 'ドル\n';
        if (rates.gbpusd) fixPrompt += '  GBP/USD: ' + formatRate_(rates.gbpusd, 'gbpusd', 'verify') + 'ドル\n';
      }
      if (csData && csData.length > 0) {
        fixPrompt += '通貨強弱ランキング（前日比・実測値）:\n';
        for (var ci2 = 0; ci2 < csData.length; ci2++) {
          var cs2 = csData[ci2];
          fixPrompt += '  ' + cs2.jpName + '(' + cs2.currency + '): ' + (cs2.score >= 0 ? '+' : '') + cs2.score.toFixed(2) + '% → ' + cs2.direction + '\n';
        }
      }
      fixPrompt += '\n';
      try {
        var calForFix = getEconomicCalendar_('today');
        if (calForFix) {
          fixPrompt += '経済カレンダー（結果欄が空 = 未発表。未発表指標を発表済みに書き換えるな）:\n' + calForFix + '\n';
        }
      } catch (calFixErr) {}
      
      fixPrompt += '\n【ルール】\n';
      fixPrompt += '・確定データの方向と矛盾する修正はするな。確定データ > 品質レビュー指摘。\n';
      fixPrompt += '・問題のある文は削除するな。書き直して改善せよ。\n';
      fixPrompt += '・指摘箇所を書き直し、それ以外は触るな。\n';
      fixPrompt += '・文字数' + charMin + '〜' + charMax + '文字。' + charMin + '文字未満は禁止。\n';
      fixPrompt += '・絵文字行は事実のみ・体言止め。感想は→行。\n';
      fixPrompt += '・修正後テキストのみ出力。\n';
      
      if (characterPrompt) {
        fixPrompt += '\n【キャラクター口調】\n' + characterPrompt + '\n';
      }
      
      var fixResult = callClaudeGenerate_(fixPrompt, getApiKeys());
      if (!fixResult || !fixResult.text) {
        console.log('⚠️ Claude修正失敗 → 指摘のみ返却');
        return { passed: false, issues: parsed.issues, revisedText: '' };
      }
      revisedText = fixResult.text;
      console.log('✅ 品質修正完了（パッチ修正）');
    }
    
    // ===== Step 3: コード側で文字数最終保証 =====
    // ★v8.16: ハッシュタグ分離を柔軟化（\n\n# だけでなく \n# や空白+# にも対応）
    var hashtagSplit = revisedText.match(/\n*[ \t]*(#\S+(?:[ \t]+#\S+)*)\s*$/);
    var revisedBody = hashtagSplit ? revisedText.slice(0, hashtagSplit.index).trim() : revisedText.trim();
    var revisedLength = revisedBody.length;
    console.log('📏 品質修正後の本文: ' + revisedLength + '文字（ハッシュタグ' + (hashtagSplit ? 'あり' : 'なし') + '）');
    
    if (revisedLength > charMax) {
      console.log('⚠️ Claude修正後も文字数超過（' + revisedLength + '/' + charMax + '）→ コード側で圧縮');
      // 末尾から文単位で削って範囲内に収める
      revisedText = trimToCharMax_(revisedText, charMax);
    }
    
    console.log('✅ 品質修正完了（' + (q6Issues.length > 0 ? 'Q6再生成→品質チェック→修正' : 'パッチ修正') + '→文字数保証）');
    
    return { passed: false, issues: parsed.issues, revisedText: revisedText };
    
  } catch (e) {
    console.log('⚠️ 品質レビューエラー: ' + e.message + ' → スキップ');
    return { passed: true, issues: [], revisedText: '' };
  }
}


// ===== Claude API呼び出し（★v12.5: callClaudeApi_ラッパー化） =====
/**
 * Anthropic Messages APIを呼び出す
 * ★v12.5: geminiApi.gsのcallClaudeApi_共通関数を経由。重複コード84行→12行に圧縮
 * 
 * @param {string} prompt - プロンプト
 * @param {string} apiKey - Anthropic APIキー
 * @param {boolean} [useWebSearch] - Web検索ツール使用（Q6事実検証用）
 * @return {string|null} レスポンステキスト（後方互換: string返却）
 */
function callClaude_(prompt, apiKey, useWebSearch) {
  var options = { logPrefix: 'Claude品質レビュー' };
  if (useWebSearch) {
    options.useWebSearch = true;
    options.systemPrompt = 'You are a quality reviewer. You MUST respond with ONLY a valid JSON object. No explanations, no markdown, no text before or after the JSON. If you use web search, incorporate findings into the JSON "problem" field only.';
  }
  var result = callClaudeApi_(prompt, apiKey, options);
  return result ? result.text : null;
}


// ===== Claudeレビュー応答のパース（指摘のみ版） =====
function parseClaudeReviewResponse_(text) {
  try {
    // ```json ... ``` を除去
    var cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var parsed = JSON.parse(cleaned);
    
    return {
      passed: !!parsed.passed,
      issues: parsed.issues || []
    };
  } catch (e) {
    // ★v12.2: Web検索使用時のフォールバック — 文章中からJSON部分を抽出
    try {
      var jsonMatch = text.match(/\{[\s\S]*"passed"[\s\S]*\}/);
      if (jsonMatch) {
        var extracted = JSON.parse(jsonMatch[0]);
        console.log('✅ フォールバック: 文章中からJSON抽出成功');
        return {
          passed: !!extracted.passed,
          issues: extracted.issues || []
        };
      }
    } catch (e2) {
      // フォールバックも失敗
    }
    console.log('⚠️ Claude応答JSON解析失敗: ' + e.message);
    console.log('  応答冒頭: ' + text.substring(0, 200));
    return null;
  }
}


// ===== 文字数超過時のコード側圧縮 =====
/**
 * ★v8.12: 文字数がcharMaxを超えている場合、末尾から文単位で削る
 * ハッシュタグは保持。絵文字ブロック構造は壊さない。
 * 
 * @param {string} text - 投稿テキスト全体（ハッシュタグ含む）
 * @param {number} charMax - 本文の文字数上限
 * @return {string} 圧縮後のテキスト
 */
function trimToCharMax_(text, charMax) {
  // ★v8.16: ハッシュタグ分離を柔軟化（\n\n# だけでなく \n# や空白+# にも対応）
  var hashtagMatch = text.match(/\n*[ \t]*(#\S+(?:[ \t]+#\S+)*)\s*$/);
  var body = hashtagMatch ? text.slice(0, hashtagMatch.index) : text;
  var hashtagPart = hashtagMatch ? '\n\n' + hashtagMatch[1] : '';
  
  // 本文を行に分割
  var lines = body.split('\n');
  
  // 末尾から行を削って範囲内に収める（絵文字行は削らない）
  while (lines.join('\n').length > charMax && lines.length > 3) {
    var lastLine = lines[lines.length - 1];
    
    // 空行は無条件で削除
    if (lastLine.trim() === '') {
      lines.pop();
      continue;
    }
    
    // 絵文字行（ブロック先頭）は削らない
    if (/^[☕📕📝📋💡⚠️✅]/.test(lastLine)) {
      break;
    }
    
    // 孤立短文（10文字以下）は優先的に削除
    if (lastLine.trim().length <= 10) {
      lines.pop();
      continue;
    }
    
    // 通常の行を末尾から削除
    lines.pop();
  }
  
  var trimmed = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  console.log('✂️ 文字数圧縮: ' + body.length + '→' + trimmed.length + '文字');
  return trimmed + hashtagPart;
}


// ===== 今日の過去投稿を取得（ScriptPropertiesキャッシュ） =====
/**
 * 今日生成された過去の投稿テキストを取得する
 * 各投稿はgeneratePost成功時にcacheTodayPost_()で保存される
 * 
 * @return {Array} [{type: 'MORNING', text: '...'}, ...]
 */
function getTodayPreviousPosts_() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var posts = [];
  
  for (var key in allProps) {
    if (key.indexOf('TODAY_POST_') === 0) {
      try {
        var data = JSON.parse(allProps[key]);
        posts.push(data);
      } catch (e) { /* パース失敗は無視 */ }
    }
  }
  
  return posts;
}


/**
 * 今日の投稿をキャッシュに保存する（generatePost成功時に呼ぶ）
 * 
 * @param {string} postType - 投稿タイプ
 * @param {string} postText - 投稿テキスト
 */
function cacheTodayPost_(postType, postText) {
  var props = PropertiesService.getScriptProperties();
  var key = 'TODAY_POST_' + postType;
  props.setProperty(key, JSON.stringify({
    type: postType,
    text: postText.split(/\n\n#/)[0], // ハッシュタグ前の本文のみ（容量節約）
    time: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm')
  }));
}


/**
 * 今日の投稿キャッシュをクリアする（scheduleTodayPosts()の冒頭で呼ぶ）
 */
function clearTodayPostCache_() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var cleared = 0;
  
  for (var key in allProps) {
    if (key.indexOf('TODAY_POST_') === 0) {
      props.deleteProperty(key);
      cleared++;
    }
  }
  
  // ★v8.16: 問いかけカウントもリセット
  props.deleteProperty('TODAY_QUESTION_COUNT');
  
  if (cleared > 0) {
    console.log('🗑️ 前日の投稿キャッシュをクリア: ' + cleared + '件');
  }
}


// ===== テスト関数 =====
/**
 * 品質レビューの動作確認用テスト
 * GASエディタから手動実行
 */
function testQualityReview() {
  var testText = '☕中東情勢の緊迫化で、週明けの東京市場はリスクオフムードがかなり重かったですね。\n\n';
  testText += '📝ユーロドル、本日はじわじわ下落。\n';
  testText += '→先週金曜は上昇していたんですけど、今日は一転して1.1537ドル付近まで値を下げてきましたね。\n\n';
  testText += '💡これからユーロ圏の3月消費者信頼感（速報値）の発表があります。\n';
  testText += '→予想が-14.2と前回より悪化する見込みなんですよ。\n\n';
  testText += '相場が難しい日は、無理せず休む勇気が大事って本気で思います。\n\n';
  testText += '#FX #ユーロドル';
  
  var typeConfig = POST_TYPES['LONDON'];
  var result = qualityReviewPost_(testText, 'LONDON', typeConfig);
  
  console.log('=== 品質レビュー結果 ===');
  console.log('合格: ' + result.passed);
  console.log('問題数: ' + result.issues.length);
  for (var i = 0; i < result.issues.length; i++) {
    console.log('  ' + result.issues[i].id + ': ' + result.issues[i].problem);
    if (result.issues[i].fix) {
      console.log('    修正: ' + result.issues[i].fix);
    }
  }
  if (result.revisedText) {
    console.log('--- 修正後テキスト ---');
    console.log(result.revisedText);
  }
}
