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
 * ★v12.6.1: Q6「全文再生成」を廃止→「元の投稿ベース事実修正」に変更。API呼び出し3回→1回。
 *   白紙再生成は口調・構造が崩壊する原因だった。元の投稿を渡してQ6+他の指摘を同時修正する方式に統合。
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
// ★v13.0.9(2026-04-20): NY削除の残骸整理(v12.7でNYタイプ廃止済み)
var TYPE_DESCRIPTIONS = {
  // ★v12.3: ストーリー主導に更新
  'MORNING': '朝7:30頃配信。今一番ホットな地政学・ファンダのネタ1つを因果チェーンで展開。「自分はこう読んでいる」を伝える。データは裏付け。150〜300字。NG: データから始める。指標を全部列挙。3ペア以上に言及',
  'TOKYO': '朝9:30頃配信。短くてもためになる一言。ホットなニュースがあれば速報ヘッドラインで。なければ東京の空気感を1〜2文。100〜180字。NG: 長い分析。冗長な解説',
  'LUNCH': '昼12時台配信。短くてもためになる一言。午前に動きがあれば速報的に。生活×為替の共感も◎。100〜180字。NG: 長い分析。午後の展望。仮説の振り返り',
  'LONDON': '夕方17時台配信。欧州勢参入で何が変わったかを1ネタ。東京との温度差。100〜250字。NG: 東京時間の詳細な振り返り',
  'GOLDEN': '夜20-21時台配信。1日の締め。冷静な振り返り。今日の答え合わせ1〜2文+一番の学び。150〜350字。NG: ネガティブ感情。詳細な市場分析の繰り返し。明日の展望',
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
      } catch (e) { console.log('⚠️ レビュー用レート取得失敗（続行）: ' + e.message); }
      try {
        var btcCom = fetchCommodityPrices_();
        if (btcCom && btcCom.btc) confirmedData += '  ビットコイン: ' + btcCom.btc.toFixed(0) + 'ドル\n';
        if (btcCom && btcCom.gold) confirmedData += '  ゴールド: ' + btcCom.gold.toFixed(2) + 'ドル\n';
      } catch (e) { console.log('⚠️ レビュー用商品価格取得失敗（続行）: ' + e.message); }
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
      } catch (calErr) { console.log('⚠️ レビュー用カレンダー取得失敗（続行）: ' + calErr.message); }
      
      // ★v12.9: Q6事実検証の精度向上のため、政策金利・通貨強弱・継続中重大事象を追加注入
      // finalFactVerify_ と同じ collectAnchorData_ を再利用（2026-04-17 GOLDEN事件の根本対策）
      try {
        var anchorForReview = collectAnchorData_(postType);
        if (anchorForReview) {
          reviewPrompt += '【★★★ 追加の確定データ（政策金利・通貨強弱・継続中重大事象）】\n';
          reviewPrompt += anchorForReview + '\n';
          reviewPrompt += '※このセクションは「真実のアンカー」である。Web検索結果と矛盾する場合は必ずこちらを優先せよ。\n';
          reviewPrompt += '※特に政策金利・金融政策(利上げ/利下げ)について、上記の値が絶対。Web検索で過去の記事が見つかっても無視せよ。\n';
          reviewPrompt += '※Claudeの内部知識(カットオフ以前の情報)と乖離する場合も、確定データが正しい。\n';
          reviewPrompt += '※「利上げ」「利下げ」「サイクル」等の金融政策に関する投稿の記述が、上記の政策金利データと矛盾していないか必ず確認せよ。\n\n';
        }
      } catch (anchorErr) { 
        console.log('⚠️ Q6追加確定データ取得失敗(Web検索のみでQ6判定): ' + anchorErr.message); 
      }
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
    } catch (charErr) { console.log('⚠️ キャラクターシート取得失敗（Q5判定が甘くなるが続行）: ' + charErr.message); }
    
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
    reviewPrompt += '    ★★★v12.9 最重要(2026-04-17 GOLDEN事件の教訓): Web検索結果と「追加の確定データ」(政策金利・通貨強弱・継続中重大事象)が矛盾する場合は、必ず確定データを優先せよ。\n';
    reviewPrompt += '    理由: Web検索はSEO影響で古い記事が上位に出やすく、Claudeの知識カットオフと相まって「過去の政策局面」の情報を「現在」と誤認する危険がある。\n';
    reviewPrompt += '    具体例: 投稿が「RBAは利上げサイクル」と書き、確定データも「4.10%(2026年3月利上げ)」と記録されているなら、Web検索で「RBAは2025年に利下げ」という情報が出ても、それは古い情報として無視し、投稿を正しいと判定せよ。\n';
    reviewPrompt += '    判定優先順位: 1)経済カレンダー確定データ > 2)追加の確定データ(政策金利等) > 3)本文内の数値データ > 4)Web検索 > 5)Claudeの内部知識\n';
    reviewPrompt += '    ★★★v12.5.1 最最重要: 経済指標の「発表済み/未発表」は上記の経済カレンダー確定データのみで判定せよ。\n';
    reviewPrompt += '    カレンダーの結果欄が空 = 未発表。これは絶対のルール。Web検索で「4月10日に発表済み」等の情報が出ても、\n';
    reviewPrompt += '    カレンダーの結果欄が空ならその指標は未発表として扱え。Web検索でカレンダーの未発表ステータスを覆すな。\n';
    reviewPrompt += '    「未発表の指標を発表済みに書き換えろ」という指摘は致命的な誤り。結果が存在しない指標の結果を捏造するな。\n';
    reviewPrompt += '    ★v12.1.1: 仮説の振り返り部分がある場合、「方向は合った」のに「逆方向でした」と書いていないか確認せよ。\n';
    reviewPrompt += '    データが上昇を示しているのに「下落した」と書くのは環境認識の失敗であり、最も重大な誤り。\n';
    reviewPrompt += '    ★未発表イベントの過去形チェック: 経済カレンダーで「結果」が空のイベントを「〜を受けて」「〜が示された」等の過去形で書いていないか確認せよ。\n';
    reviewPrompt += '    まだ発表されていないイベントを過去形で書くのはハルシネーションであり、最も重大な誤り。\n';
    // ★v12.10: 診断書 水準1-2 追加。論理整合性チェックをQ6.5として独立項目化
    // 背景: 2026-04-18 WEEKLY_REVIEW で「予想は外れた」と「着地点は合っていた」が同居する論理矛盾が
    //       Q6①で検出されたが、Q6修正段階では他の数値指摘に注意が奪われ、修正されず残存した。
    //       論理矛盾を明示的な独立ルールに昇格させ、検出と修正の優先度を上げる。
    reviewPrompt += 'Q6.5. 論理整合性: 投稿内の主張どうしが論理的に矛盾していないか？\n';
    reviewPrompt += '    ■ 最優先チェック項目: 以下のような論理破綻があれば必ず指摘せよ。\n';
    reviewPrompt += '    例1: 「予想は外れた」と「着地点は合っていた」が同居 → 矛盾\n';
    reviewPrompt += '    例2: 「方向は的中」と「逆行した」が同居 → 矛盾\n';
    reviewPrompt += '    例3: 「リスクオン」と「円高進行」が同居 → 矛盾\n';
    reviewPrompt += '    例4: 「仮説通り」と「プロセスが違った」が同居 → これは論点をすり替えた矛盾\n';
    reviewPrompt += '    例5: 「利上げ期待」と「利下げサイクル」が同居 → 矛盾\n';
    reviewPrompt += '    ■ 判定ルール: 2つの主張が同じ投稿内で明らかに相反する場合、どちらが事実かを確定データから判定し、\n';
    reviewPrompt += '    もう一方を修正(または削除)するよう具体的に指摘せよ。\n';
    reviewPrompt += '    ■ 因果関係の不整合もチェック: 「Aが起きた」+「だからBが起きた」の因果が成り立たない場合も指摘せよ。\n';
    reviewPrompt += '    ■ この項目は Q6(事実検証) とは別の観点。事実が正しくても「論理的に矛盾した語り」になっている投稿は多い。\n';
    reviewPrompt += '    ■ 検出した場合は必ず id を "Q6.5" で返せ。\n';
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
    reviewPrompt += '    {"id": "Q1〜Q7 または Q6.5", "problem": "問題の説明（Web検索で確認した事実も含めて書け）", "suggestion": "どう直すべきかの具体的指示"}\n';
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
    var q65Issues = [];  // ★v12.10: Q6.5(論理矛盾)を別カウント(診断書 水準1-2)
    var otherIssues = [];
    for (var qi = 0; qi < parsed.issues.length; qi++) {
      var issueId = parsed.issues[qi].id || '';
      if (issueId === 'Q6.5') {
        q65Issues.push(parsed.issues[qi]);
        q6Issues.push(parsed.issues[qi]);  // 元投稿ベース修正ルートにも入れる
      } else if (issueId.indexOf('Q6') !== -1) {
        q6Issues.push(parsed.issues[qi]);
      } else {
        otherIssues.push(parsed.issues[qi]);
      }
    }
    
    // ★v12.10: Q6.5 検出時は警告ログで目立たせる(診断書 水準1-2)
    if (q65Issues.length > 0) {
      console.log('⚠️ Q6.5 論理矛盾検出: ' + q65Issues.length + '件 → 修正プロンプトで最優先扱い');
    }
    
    var revisedText = '';
    
    if (q6Issues.length > 0) {
      // ===== ★v12.6.1: Q6事実誤り → 元の投稿ベースで事実修正（全文再生成を廃止） =====
      // 旧（v12.5.5）: 白紙から全文再生成 → 2回目品質レビュー → パッチ修正（API 3回）
      //   問題: 元の投稿の構造・口調が失われ、ハルシネーション発生、別人の投稿になる
      // 新（v12.6.1）: 元の投稿を渡して事実誤り箇所だけ修正（API 1回）
      //   元の投稿の口調・構造・絵文字ブロックをそのまま維持する
      //   Q1-Q5, Q7の指摘も同時に反映（初回レビューで検出済み）
      var q65Count = q65Issues.length;
      var q6OnlyCount = q6Issues.length - q65Count;
      console.log('🔄 Q6.5論理矛盾' + q65Count + '件 + Q6事実誤り' + q6OnlyCount + '件 + 他' + otherIssues.length + '件 → 元投稿ベース修正');
      
      // Q6 + 他の指摘を統合（1回のAPI呼び出しで全て修正）
      // ★v12.10: 診断書 水準1-3 優先度順ソート
      //   背景: 2026-04-18 WEEKLY_REVIEW で5件の指摘を同列に並べた結果、
      //         最重要の論理矛盾(Q6①)が数値修正(Q6④)と同列扱いされ修正漏れ。
      //   対策: 論理矛盾(Q6.5) > 事実誤り(Q6) > 口調(Q5,Q7) > 文字数(Q4) の順で並べ、
      //         修正プロンプトに「最優先で直せ」のラベルを明示する。
      var priorityOf = function(id) {
        if (id === 'Q6.5') return 1; // 論理矛盾: 最優先
        if (id === 'Q6')   return 2; // 事実誤り
        if (id === 'Q5' || id === 'Q7') return 3; // 口調・絵文字
        if (id === 'Q1' || id === 'Q2' || id === 'Q3') return 4; // 構造
        if (id === 'Q4')   return 5; // 文字数
        return 9;
      };
      var allIssues = q6Issues.concat(otherIssues);
      allIssues.sort(function(a, b) { return priorityOf(a.id) - priorityOf(b.id); });
      
      var fixPrompt = '以下のFX投稿テキストに事実誤りと品質の問題がある。修正してください。\n\n';
      fixPrompt += '【★最重要ルール】\n';
      fixPrompt += '・元の投稿の口調・絵文字ブロックの並び・→行の構造をそのまま維持せよ。\n';
      fixPrompt += '・指摘された箇所だけ書き換えよ。指摘のない箇所は一字一句変えるな。\n';
      fixPrompt += '・事実誤りの文は、正しい事実に差し替えつつ元の口調を維持せよ。\n';
      fixPrompt += '・文字数' + charMin + '〜' + charMax + '文字（超過指摘がある場合は冗長な部分を削って収めよ）。\n\n';
      
      // ★v12.10: 修正優先度の明示(診断書 水準1-3)
      fixPrompt += '【★★★修正の優先順位(絶対厳守)】\n';
      fixPrompt += '複数の指摘を同時に反映する場合、以下の順で直せ。上位ほど重要で、下位の指摘に注意を奪われて上位を見落とすな。\n';
      fixPrompt += '  1. 【最優先】Q6.5 論理矛盾: 投稿内の主張どうしの矛盾。ここが残ると投稿全体が破綻する。\n';
      fixPrompt += '  2. 【次点】  Q6   事実誤り: 数値・要人発言・政策決定の誤り。\n';
      fixPrompt += '  3. 【その次】Q5/Q7 表現・口調: 語尾バリエーション・絵文字行の体言止め。\n';
      fixPrompt += '  4. 【構造】  Q1/Q2/Q3: 時間帯整合・表現重複・文の完成度。\n';
      fixPrompt += '  5. 【最後】  Q4   文字数圧縮: 上記を全て満たした上で文字数を調整せよ。\n';
      fixPrompt += '※ Q6.5 の論理矛盾を見落とすと、他を全て直しても投稿は使えない。まず論理矛盾を解消してから他に進め。\n\n';
      
      fixPrompt += '【元の投稿テキスト（これがベース。構造を壊すな）】\n' + postText + '\n\n';
      
      fixPrompt += '【修正すべき問題（' + allIssues.length + '件・優先度順）】\n';
      for (var ai = 0; ai < allIssues.length; ai++) {
        var prefix = (allIssues[ai].id === 'Q6.5') ? '★最優先 ' 
                   : (allIssues[ai].id === 'Q6')   ? '★次点   ' 
                   : '';
        fixPrompt += prefix + '・' + allIssues[ai].id + ': ' + allIssues[ai].problem + '\n';
        if (allIssues[ai].suggestion) fixPrompt += '  → ' + allIssues[ai].suggestion + '\n';
      }
      
      fixPrompt += '\n【確定データ（これが絶対的な事実。レートはこの値を使え）】\n';
      if (rates) {
        fixPrompt += '確定レート:\n';
        if (rates.usdjpy) fixPrompt += '  USD/JPY: ' + formatRate_(rates.usdjpy, 'usdjpy', 'verify') + '円\n';
        if (rates.audusd) fixPrompt += '  AUD/USD: ' + formatRate_(rates.audusd, 'audusd', 'verify') + '\n';
        if (rates.audjpy) fixPrompt += '  AUD/JPY: ' + formatRate_(rates.audjpy, 'audjpy', 'verify') + '円\n';
        if (rates.eurjpy) fixPrompt += '  EUR/JPY: ' + formatRate_(rates.eurjpy, 'eurjpy', 'verify') + '円\n';
        if (rates.gbpjpy) fixPrompt += '  GBP/JPY: ' + formatRate_(rates.gbpjpy, 'gbpjpy', 'verify') + '円\n';
        if (rates.eurusd) fixPrompt += '  EUR/USD: ' + formatRate_(rates.eurusd, 'eurusd', 'verify') + '\n';
        if (rates.gbpusd) fixPrompt += '  GBP/USD: ' + formatRate_(rates.gbpusd, 'gbpusd', 'verify') + '\n';
      }
      if (csData && csData.length > 0) {
        fixPrompt += '通貨強弱ランキング:\n';
        for (var ci = 0; ci < csData.length; ci++) {
          var cs = csData[ci];
          fixPrompt += '  ' + (cs.jpName || cs.currency) + '(' + cs.currency + '): ' + (cs.score >= 0 ? '+' : '') + cs.score.toFixed(2) + '% → ' + cs.direction + '\n';
        }
      }
      try {
        var calForFix = getEconomicCalendar_('today');
        if (calForFix) {
          fixPrompt += '経済カレンダー（結果欄が空 = 未発表。未発表指標を発表済みに書き換えるな）:\n' + calForFix + '\n';
        }
      } catch (calErr) { console.log('⚠️ カレンダー取得失敗（続行）: ' + calErr.message); }
      
      fixPrompt += '\n【絶対遵守のフォーマットルール】\n';
      fixPrompt += '・絵文字行（☕📕📝💡⚠️✅）= 事実の短い言い切り。体言止め・動詞止め必須。\n';
      fixPrompt += '  OK: 「📝米イラン交渉が決裂。」「📕雇用統計、予想を上回る結果。」\n';
      fixPrompt += '  NG: 「📝米イラン交渉が決裂しました。」「📕上昇基調が続いています。」\n';
      fixPrompt += '・→行 = 背景・意見・人間味。コンパナの口調で。\n';
      fixPrompt += '・確定データの方向と矛盾する修正はするな。確定データ > 品質レビュー指摘。\n';
      fixPrompt += '・レート数値は確定データをそのまま使え。桁を変えるな。丸めるな。\n';
      fixPrompt += '・修正後テキストのみ出力。説明不要。\n';
      
      if (characterPrompt) {
        fixPrompt += '\n【★★★コンパナの口調（元の投稿と同じ口調を維持せよ。別人にするな）】\n' + characterPrompt + '\n';
      }
      
      var fixResult = callClaudeGenerate_(fixPrompt, getApiKeys());
      if (!fixResult || !fixResult.text) {
        console.log('⚠️ Q6修正失敗 → 指摘のみ返却');
        return { passed: false, issues: parsed.issues, revisedText: '' };
      }
      revisedText = fixResult.text;
      console.log('✅ 品質修正完了（元投稿ベース事実修正・API 1回）');
      
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
      } catch (calFixErr) { console.log('⚠️ カレンダー取得失敗（続行）: ' + calFixErr.message); }
      
      fixPrompt += '\n【ルール】\n';
      fixPrompt += '・確定データの方向と矛盾する修正はするな。確定データ > 品質レビュー指摘。\n';
      fixPrompt += '・問題のある文は削除するな。書き直して改善せよ。\n';
      fixPrompt += '・指摘箇所を書き直し、それ以外は触るな。\n';
      fixPrompt += '・文字数' + charMin + '〜' + charMax + '文字。' + charMin + '文字未満は禁止。\n';
      fixPrompt += '・絵文字行は事実のみ・体言止め・動詞止め必須。\n';
      fixPrompt += '  OK: 「📝米イラン交渉が決裂。」「📕雇用統計、予想を上回る結果。」\n';
      fixPrompt += '  NG: 「📝米イラン交渉が決裂しました。」「📕上昇基調が続いています。」\n';
      fixPrompt += '・→行 = 背景・意見。コンパナの口調で。\n';
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
    
    // ★v13.0.8 段階3: 鉤括弧の途中で切らない保護
    //   削除候補の行を削ると、鉤括弧「」『』の対応が壊れる場合、
    //   現行の行ではなくその前の行から削るか、削除を諦める
    var remainingAfterPop = lines.slice(0, -1).join('\n');
    var openKaku1 = (remainingAfterPop.match(/「/g) || []).length;
    var closeKaku1 = (remainingAfterPop.match(/」/g) || []).length;
    var openKaku2 = (remainingAfterPop.match(/『/g) || []).length;
    var closeKaku2 = (remainingAfterPop.match(/』/g) || []).length;

    if (openKaku1 !== closeKaku1 || openKaku2 !== closeKaku2) {
      // この行を削ると鉤括弧が破綻する
      // → 次善策: 鉤括弧を含む行セット全体を削除(鉤括弧の開始行から末尾まで)
      console.log('🔒 鉤括弧保護: 現行行を削ると破綻 → 鉤括弧ブロックごと削除を試行');
      
      // 鉤括弧の開始位置を探す
      var kakuStartIdx = -1;
      for (var i = lines.length - 1; i >= 0; i--) {
        if (/[「『]/.test(lines[i])) {
          // この行で鉤括弧が開始
          // 同じ行で閉じているかチェック
          var lineOpen1 = (lines[i].match(/「/g) || []).length;
          var lineClose1 = (lines[i].match(/」/g) || []).length;
          var lineOpen2 = (lines[i].match(/『/g) || []).length;
          var lineClose2 = (lines[i].match(/』/g) || []).length;
          if (lineOpen1 > lineClose1 || lineOpen2 > lineClose2) {
            // この行で開いて閉じていない = 鉤括弧ブロックの開始行
            kakuStartIdx = i;
            break;
          }
        }
      }
      
      if (kakuStartIdx >= 0 && kakuStartIdx >= 3) {
        // 鉤括弧の開始行から末尾まで削除
        var deletedCount = lines.length - kakuStartIdx;
        lines = lines.slice(0, kakuStartIdx);
        console.log('🔒 鉤括弧ブロックごと削除: ' + deletedCount + '行削除');
        continue;
      } else {
        // ブロック削除不可 → 削除ループを抜ける(これ以上削れない)
        console.log('🔒 鉤括弧保護で削除不可 → 圧縮中断');
        break;
      }
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
      } catch (e) { console.log('⚠️ 投稿キャッシュパース失敗（続行）: ' + e.message); }
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
