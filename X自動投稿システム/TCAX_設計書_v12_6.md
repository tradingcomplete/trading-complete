# T-CAX 設計書 v12.6

**方針**: プロンプト公開 + 学び自動蓄積 + 7通貨ペア市場データ + 完全自動学習
**関連**: スプレッドシート仕様書 v1.8（シート詳細）/ 全体設計図 v12.6（システム全体）

---

## 1. 設計思想

```
「魚ではなく、釣り方を」

AI自動投稿であることを公開。プロンプトを見せて信頼と期待感を生む。

【公開するもの（スプレッドシート）】
  キャラクター / トレードスタイル / 投稿プロンプト / 参照ソース / TC概要
  → 「何をAIに聞いているか」が見える

【非公開のもの（コード内）】
  フォーマットルール / 後処理チェーン / 文字数制限
  → 見せても意味がない＆見栄えが悪い

【使うほど賢くなる仕組み】
  投稿成功時にGeminiが学びを自動抽出 → 学びログに蓄積
  6カテゴリ: 相場心理 / テクニカル / ファンダメンタルズ / リスク管理 / 指標分析 / 市場構造

★v12.0: 3段防御アーキテクチャ
  Groundingの用途を「リサーチ」「検証」に限定。「ライティング」では不使用。
  チェック1: Geminiファクトチェック（確定データ + Grounding検索）
  チェック2: Claude事実検証（Q6: 確定データとの矛盾検出 + 定性的主張検証）
  チェック3: Claude品質チェック（Q1〜Q5 + Q7絵文字行）
  → チェック2と3は同一API呼び出しで実行（追加コストなし）

★v12.1: 3段階生成アーキテクチャ（v12.0を発展）
  Geminiに「分析もライティングも全部やれ」は方向性矛盾の原因。
  Stage 1: Claude が市場データを分析（通貨強弱・方向性・背景を正しく読む）
  Stage 2: Gemini がClaude分析に従って投稿を書く
  Stage 3: Claude が品質レビュー（Q1〜Q7）
  各AIの得意分野に仕事を割り当てる。人間のチームと同じ考え方。
  BTC/ゴールドは事前取得（scheduledFetchRates）で60秒短縮。

★v12.1追加: 通貨強弱シート + ダウ理論
  毎時scheduledFetchRatesで通貨強弱・勢い・初動・ダウ理論を蓄積。
  通貨強弱 + ダウ理論はT-CAXの「データ」「投稿スタイル」「運用」全てに適合する唯一の組み合わせ。
  RSI/MACD/ボリンジャー等はデータ粒度・投稿スタイルで不適合。これ以上足さない。

★v12.2: 4層安全網 + Claudeフォールバック
  チェック1: Geminiファクトチェック（確定データ + Grounding検索）
  チェック2: Claude品質レビュー + Web検索（要人発言・政策決定をリアルタイム検証）
  チェック3: ファクトチェック失敗時の自動ブロック（強制manualモード）
  チェック4: validateモード（問題時のみ承認メール）
  フォールバック: Gemini Pro 503時 → Claudeで代替生成（Flashは品質不足のため不採用）

★v12.2追加: ストーリー主導への転換
  Before: データ主導（通貨強弱の数字が起点→ニュースが補足）
  After:  ストーリー主導（ホットなニュースが起点→データは裏付け証拠）
  コンパナのスタイル = ファンダ・地政学で大枠の流れを読む順張りトレーダー。
  投稿の骨格 = 因果チェーン: 原因（何が起きた）→経路（なぜ・どう波及）→為替への影響
  まわりくどい説明は禁止。1文で事実を言い切り、→行で「なぜ」を補足。

★v12.4: Claude主導アーキテクチャ
  v12.1〜v12.3の「3段階生成（Claude分析→Gemini生成→Claude検証）」を発展。
  Geminiが方向を無視する問題（AUD+2.95%なのに「豪ドル売り」と書く）が頻発。
  修正ステップでもGeminiが品質レビューの誤った指摘を鵜呑みにして正しい投稿を壊す事故。
  → 投稿生成・ファクトチェック修正・品質修正の全てをClaude化。
  → 確定データガード: 通貨強弱・レートを修正プロンプトに注入し方向矛盾を防止。
  学び: クロスチェック（異モデル検証）より、正しいデータを持っていることが重要。
  学び: 絵文字行の体言止め + プロンプト末尾の口調リマインダーでキャラクターが際立つ。
```

---

## 2. スプレッドシート構成（17シート）

```
【プロンプト素材（7シート）】
①キャラクター ②TC概要 ③投稿プロンプト（v5）④トレードスタイル
⑤参照ソース ⑥心得テーマ ⑦経済カレンダー

【データ蓄積（8シート）】
⑧投稿履歴 ⑨レートキャッシュ ⑩レートサマリー ⑪指標データ
⑫学びログ ⑬仮説検証ログ ⑭エンゲージメントログ ⑮確定データ

【運用（2シート）】
⑯下書き ⑰アノマリー（マスターデータ20行）

※ 各シートの列定義はスプレッドシート仕様書 v1.7を参照
```

---

## 3. 主要シートの構造

```
【キャラクター】2列（A:セクション B:内容）。コンパナの人格・口調・信念・相場観。全投稿に注入。
  ★v11.0: 相場観 + ネガティブ感情禁止
  ★v12.0（v11.0設計書）: 生活との接点の出し方（スケール感指示）追加
【投稿プロンプト】3列（A:タイプID B:投稿名 C:プロンプト内容）。16行。★v5に更新。
【トレードスタイル】2列（A:項目 B:内容）。18行。
【経済カレンダー】5列（A:日付 B:時刻 C:国 D:指標名 E:重要度）。週次手動更新。
【投稿履歴】12列（A:日時〜L:エラーログ）。H列=仮説、I列=学び。
【レートキャッシュ】14列（A:日時 B〜H:7通貨ペア I〜L:商品4銘柄 M:取得元 N:ステータス）。
【アノマリー】9列。20行。

※ 全列定義の詳細はスプレッドシート仕様書 v1.7を参照
```

---

## 4. フォーマットルール概要（非公開・コード内）

```
【後処理チェーン（postProcessor.gs・12段階）で制御する項目】
  外国語除去 / AI前置き除去 / 改行+空行制御 / 絵文字制限（2〜3個）
  Markdown除去 / 禁止表現置換 / 月曜「昨日」修正 / 重複ブロック除去
  孤立短文除去 / 壊れ句点修復 / ハッシュタグ処理 / レート検証

【絵文字ルール】
  許可: ☕📕📝📋💡⚠️✅（行頭専用。文中は使用禁止）
  各投稿2〜3個。0〜1個は視認性低下、4個以上はシャドウバン回避違反

【→行のルール】
  絵文字行 = 事実のメモ（短く言い切り。感想は入れるな）
  ★v12.4: 絵文字行は体言止め・動詞止めで速報ヘッドライン調
    OK: 「📝米イラン交渉が決裂。」「🛢原油、100ドル突破。」
    NG: 「📝米イラン交渉が決裂しました。」「〜しています。」
  →行 = 意見・背景・人間味（「〜かなと。」「〜感じですね。」等）
  →の前後で同じことを言い換えるな
  ★v12.0: Q7でClaudeが絵文字行の感想混入を検出・修正
  ★v12.4: Q7に体言止め判定追加

【文字数制御】
  charMin〜charMax（config.gs POST_TYPES定義）
  品質レビュー（Claude）でQ4チェック → Gemini修正 → trimToCharMax_で最終保証

【禁止事項】
  アスタリスク(*) / 「トレードした」「エントリーした」 / レートの羅列
  「今日一番動いている」（7ペアしか見ていない）/ 一方向の賭け仮説
  ネガティブ感情禁止（疲れた・胃が痛い・怖い・辛い）
```

---

## 5. プロンプト組み立て

```
最終プロンプト =
  ① キャラクター（人格・口調・相場観・生活接点のスケール感）
  ② 確定レート（7ペア + 商品4銘柄 + 株価指数）
  ③ レート方向性 + 通貨強弱 + 本日始値比
  ④ レートサマリー（高値/安値/意識される水準）
  ⑤ 市場ニュースTOP5（Gemini+Grounding自動取得。背景+生活影響フィールド）
  ⑥ 経済カレンダー（スコープ別: today/this_week/next_week）
  ⑦ アノマリー情報（該当日のみ注入）
  ⑧ 投稿プロンプトv5（タイプ別指示。役割+文字数のみ）
  ⑨ トレードスタイル
  ⑩ フォーマットルール（タイプ別・非公開）
  ⑪ 品質フィードバック（ER平均値）
  ⑫ 的中率サマリー（直近5件・全市場投稿に注入）
  ⑬ 学びログ（スコア上位+ランダム選出）
  ⑭ 仮説コンテキスト（前回仮説+レート差分）
  ⑮ 問いかけ指示（1日2回上限・確率50%で注入）
  ★⑯ キャラクター口調リマインダー（★v12.4新設・プロンプト最末尾に配置）
    LLMは最初と最後の指示を最も重視。24,000文字のデータ処理で口調が薄まるため末尾に念押し
    NG/OK例付き: 「市場では〇〇が後退。」←NG / 「正直ちょっと遠のいた感じですね。」←OK

プロンプト総文字数: 約19,000〜25,000文字（タイプにより変動）

★v12.0: テキスト生成はGrounding OFFで実行。
  プロンプトに注入済みの検証データだけで書く。
  Groundingで未検証情報を拾うとハルシネーションの原因になるため。

★v12.2: ストーリー主導の題材選定
  ニュースTOP5から最もホットな地政学・ファンダのネタ1つを選び、因果チェーンで展開。
  通貨強弱・レート・ダウ理論は「実際にこう動いている」の裏付け証拠。主役にするな。
```

---

## 6. 注入ルール

```
（v10.0から変更なし。省略せず記載）

【シート→タイプ】
キャラクター / トレードスタイル / 参照ソース / フォーマットルール → 全16タイプ
投稿プロンプト → 該当タイプ（1対1）
心得テーマ → RULE_1〜4のみ
TC概要 → RULE系 + WEEKLY系（TC導線7タイプ）
レート → 市場系のみ（RULE/KNOWLEDGEには注入しない）

【経済カレンダー スコープ】
today     → MORNING〜NY, INDICATOR
this_week → WEEKLY_REVIEW, WEEKLY_LEARNING
next_week → NEXT_WEEK, WEEKLY_HYPOTHESIS
なし      → RULE_1〜4, KNOWLEDGE

【学びログ件数】
5件: WEEKLY_REVIEW, WEEKLY_LEARNING
3件: WEEKLY_HYPOTHESIS, RULE_1〜4
2件: MORNING, GOLDEN
1件: TOKYO, LUNCH, LONDON, NY, INDICATOR
なし: NEXT_WEEK, KNOWLEDGE

【仮説振り返り】
MORNINGのみ: 前回仮説+レート差分を注入（通常の答え合わせ）
TOKYO以降: 「振り返り済み。繰り返すな」指示を注入（重複防止）
WEEKLY系: 毎回振り返りOK（1日1本なので重複しない）

【問いかけ】
対象12タイプ: MORNING/LUNCH/GOLDEN/WEEKLY系/RULE系/KNOWLEDGE
非対象4タイプ: TOKYO/LONDON/NY/INDICATOR
1日2回上限・確率50% → ScriptProperties 'TODAY_QUESTION_COUNT'で管理

【アノマリー】
市場系+WEEKLY系: 今日のアノマリーを注入（該当0件なら注入しない）
NEXT_WEEK/WEEKLY_HYPOTHESIS: 来週のアノマリーを先読み注入
RULE系/KNOWLEDGE: 注入しない
```

---

## 7. 品質管理システム（★v12.0 3段防御）

```
【ファクトチェック（factCheck.gs）— チェック1】
  Gemini + Grounding ON でレート・指標・ニュースの事実検証
  Layer 1: システム確定データと照合
    ・為替レート（7ペア）: 3%超の乖離で❌
    ・★v12.0: 商品価格（WTI/BTC/ゴールド/天然ガス）: 5%超の乖離で❌
    ・政策金利・カレンダー・要人・アノマリー
  Layer 2: Grounding検索で事実確認
  ❌誤り → autoFix（Grounding OFF）で自動修正
  ⚠️要確認 → 修正不要（システムデータで検証不可の意味）
  RULE系はスキップ（個人の経験談が主体）

【品質レビュー（qualityReview.gs）— チェック2+3】
  Claude Sonnet 4.6 が★v12.0で7項目をチェック:
    Q1. タイプ整合（TYPE_DESCRIPTIONSベース）
    Q2. 表現重複（今日の過去投稿とフレーズ重複）
    Q3. 文の完成度（体言止め・文脈飛躍・孤立短文）
    Q4. 文字数（charMin〜charMax。超過時はtrimToCharMax_で圧縮）
    Q5. 口調一貫性（コンパナ口調 vs アナリスト調）
    ★Q6. 事実の信憑性（確定データ二重チェック + ★v12.2: Web検索でリアルタイム検証）
    ★Q7. 絵文字行の書き分け（事実のみ・感想混入禁止 + ★v12.4: 体言止め必須）
  ★v12.2: Claude品質レビューにWeb検索（web_search_20250305）を追加
    要人発言・政策決定・直近イベントについてWeb検索で事実確認
    例: 「植田総裁が発言」→検索して発言の事実を確認
    例: 「RBAが利上げ」→検索して最新の政策決定を確認
    systemパラメータでJSON出力を強制（Web検索使用時の文章混入防止）
    max_tokens: 4096（Web検索時の出力切れ防止）
    JSONフォールバックパーサー（文章中からJSON部分を自動抽出）
  ★v12.4: 修正フロー変更
    旧: Claude指摘 → Gemini修正 → コード側文字数保証
    新: Claude指摘 → Claude修正 + 確定データガード → コード側文字数保証
    確定データガード: レート7ペア + 通貨強弱ランキングを修正プロンプトに注入
    「確定データの方向と矛盾する修正はするな。確定データ > 品質レビュー指摘」
  ★v12.0: Q6指摘の数値誤りはClaude修正で正しい値に置換

【後処理チェーン（postProcessor.gs・14段階）】
  生成→リトライ→ファクトチェック修正後→品質修正後の4回適用
  新しい後処理 → applyPostProcessingChain_内に追加するだけ
  ★v12.6: fixHallucinatedRates_を「最近傍キーワード割り当て方式」に書き換え
    旧: ペア順に行内全レートを一括置換 → 同一行2ペアでクロス汚染
    新: 行ごとに全キーワード位置収集 → 各レートを最近傍に割り当て → 位置ベース置換

【★v12.6: リグレッション防止（testPostProcessor.gs新設）】
  後処理チェーンの変更前後に testPostProcessorChain() を実行（32テストケース、API不要）
  レート桁数は formatRate_(value, pairKey, purpose) で一元管理（toFixed直書き禁止）
  promptBuilder.gsは2,500行まで分割しない（安定稼働中。GAS同名関数「後勝ち」で分割自体がリスク）
```

---

## 8. 市場データ収集

```
【3層アーキテクチャ】
  Layer 1: Twelve Data API（7通貨ペア + BTC + Gold、1時間ごと）
  Layer 2: GOOGLEFINANCE（日経/NYダウ/S&P/VIX/米10年債）
  Layer 3: Alpha Vantage（WTI原油 + 天然ガス、日次）

【通貨強弱】（rateManager.gs + marketAnalysis.gs）
  7ペアのレートから5通貨の強弱を計算 → 最も動いたペアを「主役」として注入
  ★v12.1: 「通貨強弱」シートに毎時蓄積（24列）
    勢い5段階: ↑↑急加速 / ↑加速 / →維持 / ↓減速 / ↓↓急減速
    ★初動検出: 2時間横ばいから動き始めた通貨をフラグ
    3hトレンド: 独歩高 / 優位 / 混戦
    ダウ理論: 日次OHLC直近5日の高値安値パターン（7ペア）
  通貨強弱+ダウ理論 = T-CAXに最適な唯一の組み合わせ（他インジケーターは不適合）

【ニュース取得】（v3フォーマット）
  Gemini + Grounding で市場ニュースTOP5を取得
  各ニュースに「背景」「生活影響」フィールドを付与
  キャッシュキー: market_news_v3（1時間キャッシュ）
  ★v12.0: ニュース取得（リサーチ）のみGrounding ON。テキスト生成（ライティング）はOFF
```

---

## 9. 仮説システム

```
【2層構造仮説】
  構造仮説: 週単位の大きなシナリオ（原因→経路→為替への影響の因果チェーン）
  今日の仮説: 構造仮説の枠内で、今日のイベントがどう作用するか

【仮説サイクル】
  NY投稿で仮説を提示 → 翌朝MORNINGで答え合わせ → 学びを抽出 → 学びログに蓄積
  検証: Geminiがレート差分データで○/△/×を自動判定
  的中率: 直近5件のサマリーを全市場投稿のプロンプトに注入

【条件分岐型】
  「もしAならB、もしCならD」の構造。一方向の賭けは禁止。
  外れても学びになる仮説が最上。
```

---

## 10. 承認フロー（★v12.2修正）

```
【フロー】
  generatePost → 下書きシートE列に保存 → 承認メール送信
  → [承認] → processApprovedDrafts → ★v12.0: E列を再読み込み → X API投稿
  → [画像再生成] → processPendingRegenRequests_ → ★v12.0: E列から最新テキスト取得 → 新メール
  → [中止] → ステータス更新

★v12.2追加:
  ・validateモード復活（メニューに「検証モード（問題時のみ承認）」追加）
    バリデーション通過 → 自動投稿 / 問題あり → 承認メール
  ・ファクトチェック失敗時の自動ブロック
    factCheckSkippedフラグ（503等でファクトチェック未実行）
    → auto/validateモードでも強制的にmanualモードへ（検証なしで投稿されない）
  ・Claudeフォールバック通知
    Gemini Pro 503 → Claude代替生成時、メールにオレンジ枠で表示

★v12.0修正:
  ・投稿直前にgetDraftById_でスプレッドシートE列を再読み込み
  ・手動編集した場合、編集後のテキストが確実に投稿される
  ・画像再生成時も同様にE列の最新テキストを使用

★v12.0修正: imageGenerator.gsの重複関数
  ・saveImageToDrive_ → approval.gs版のみ有効（文字列を返す）
  ・saveImageToTempDrive_ → imageGenerator.gs版（オブジェクトを返す。テスト用）
  ・GASは同名関数が「後勝ち」のため、リネームで衝突を回避
```

---

## 11. バージョン履歴（直近のみ）

```
v12.6（2026-04-15）= 設計図v12.6
  リグレッション防止 + fixHallucinatedRates_クロス汚染修正 + 最終事実検証 + TOKYO/LUNCHレート台変換
  ・testPostProcessor.gs新設: 後処理チェーン不変条件テスト38ケース
  ・config.gs: formatRate_関数+RATE_DECIMALS定数（toFixed散在をDRY化）
  ・postProcessor.gs: fixHallucinatedRates_を最近傍キーワード割り当て方式に書き換え
  ・postProcessor.gs: convertExactRatesToRange_新設（TOKYO/LUNCHのレート数値→「台」自動変換）
  ・qualityReview.gs/geminiApi.gs/factCheck.gs/promptBuilder.gs: toFixed→formatRate_置換（計48箇所）
  ・geminiApi.gs: finalFactVerify_新設（品質レビュー後に事実だけに集中した最終検証+修正）
  ・promptBuilder.gs: TOKYO/LUNCHに「レートは台で表現」ルール追加
  ・main.gs: 🧪テストメニュー追加
  ・設計思想: promptBuilder.gsは2,500行まで分割しない。テストで守れる安全網を優先
  ・設計思想: 品質レビュー(Q1-Q7同時)は注意が分散する。最終検証は事実だけに100%集中させる

v12.5（2026-04-14/15）= 設計図v12.5
  コード品質改善 + 品質レビュー大幅強化
  ・geminiApi.gs: callClaudeApi_共通関数統合。executeRetry_ Claude化
  ・factCheck.gs: 死コード削除（qualityCheckPost_ -138行）
  ・qualityReview.gs: 経済カレンダー注入。Q6全文再生成→2回目品質レビュー。口調一元管理
  ・config.gs: サマータイム自動調整（isSummerTime_）
  ・promptBuilder.gs: 口調末尾リマインダーにキャラクターシート動的再注入
  ・postProcessor.gs: 数値変化→改行修正+fixHallucinatedRates_正規表現拡張

v12.4（2026-04-14）= 設計図v12.4
  Claude主導アーキテクチャ + 確定データガード
  ・geminiApi.gs: 投稿生成をGemini→Claude化（callClaudeGenerate_新設）
  ・geminiApi.gs: qualityReviewPost_にrates, csData引数追加
  ・factCheck.gs: 確定データ6（通貨強弱）+ルール1c（方向チェック）追加
  ・factCheck.gs: autoFixPost_ Claude化 + 通貨強弱データ注入
  ・qualityReview.gs: Q7体言止め判定追加。修正ステップGemini→Claude化。確定データガード
  ・promptBuilder.gs: 体言止めルール（OK/NG例）+キャラクター口調リマインダー（最末尾）
  ・promptBuilder.gs: buildIndicatorPolicy_でINDICATOR対象指標をScriptPropertiesから読み取り注入
  ・scheduler.gs: INDICATOR_TARGETをScriptPropertiesに保存（対象指標の伝達）
  ・config.gs: 月曜MORNING 07:28→08:03（原油先物開場+1h確保）
  ・imageGenerator.gs: 時間表現を原文から変えないルール
  ・設計思想: 確定データ > AI推論。クロスチェックより正しいデータを持つことが重要

v12.2（2026-04-10/12）= 設計図v12.3
  4層安全網 + Claudeフォールバック + Web検索品質レビュー + ストーリー主導
  ・qualityReview.gs: Claude品質レビューにWeb検索追加（web_search_20250305, max_uses:3）
  ・qualityReview.gs: systemパラメータでJSON出力強制 + JSONフォールバックパーサー
  ・qualityReview.gs: max_tokens 2000→4096 + MORNING TYPE_DESCRIPTIONS更新
  ・qualityReview.gs: TOKYO/LUNCH TYPE_DESCRIPTIONS文字数 60-150→100-180
  ・geminiApi.gs: 503リトライ段階的待機 + MAX_RETRIES 3→2
  ・geminiApi.gs: factCheckSkippedフラグ + Pro→Claude自動フォールバック
  ・main.gs: validateモード復活 + ファクトチェック失敗時の強制manualブロック
  ・imageGenerator.gs: 文字サイズ3層階層（フック優先）
  ・approval.gs: Claudeフォールバック通知をメールに表示
  ・config.gs: TOKYO/LUNCH charMin/charMax 60-150→100-180
  ・scheduler.gs: INDICATOR maxIndicators 2→1
  ・promptBuilder.gs: 題材選定ルール→ストーリー主導に改訂
  ・promptBuilder.gs: 投稿の構造→因果チェーン中心に再構成
  ・promptBuilder.gs: 市場系投稿の方針→ストーリー主導の鉄則+まわりくどい説明禁止

v12.1（2026-04-07）= 設計図v12.2
  SH/SLダウ理論+WTI/天然ガス停止
  ・rateManager.gs: calcDowTheory_をSH/SL（前後4日）ベースに刷新+getDowTheorySummary_+backfillSwingHighLow
  ・config.gs: DAILY_RATE_COLS/WEEKLY_RATE_COLS列定義追加
  ・priceSummary.gs: SH/SL判定+週足シート作成（⑳番目）
  ・geminiApi.gs/promptBuilder.gs/factCheck.gs/qualityReview.gs: WTI/天然ガス注入停止
  ・learningManager.gs: 仮説例文SH/SL対応
  ・日次レート: 30→44列。週足シート新規。20シート構成

v12.0（2026-04-06）= 設計図v12.1
  3段階生成アーキテクチャ
  ・geminiApi.gs: Claude市場分析ステップ新設（analyzeMarketWithClaude_）
  ・geminiApi.gs/imageGenerator.gs: MAX_RETRIES定数化
  ・rateManager.gs: BTC/ゴールド事前取得+キャッシュ75分延長
  ・rateManager.gs: 通貨強弱シート自動更新（勢い5段階+★初動検出+3hトレンド+ダウ理論）
  ・rateManager.gs: バックフィル機能（日次レートから過去164日分を遡及計算）
  ・geminiApi.gs: Claude市場分析に通貨強弱トレンド+ダウ理論を注入
  ・priceSummary.gs: GAS上の中身相違を発覚・復旧。日次レートをAPI再取得（1,341日分）
  ・learningManager.gs: 仮説生成に通貨強弱トレンド+ダウ理論を材料注入。仮説検証にも同データを判定材料追加
  ・qualityReview.gs: Q6定性的主張チェック+Gemini削除禁止+TOKYO/LUNCH更新+ゴールド誤警報修正
  ・投稿プロンプトv5: TOKYO/LUNCH C列更新（速報ヘッドライン許可）
  ・設計思想: 各AIの得意分野に仕事を割り当てる

v11.0（2026-04-05）= 設計図v12.0
  3段防御アーキテクチャ+承認フロー修正
  ・geminiApi.gs: テキスト生成Grounding OFF（ハルシネーション防止）
  ・factCheck.gs: Layer 1に商品価格追加（WTI/BTC/ゴールド/天然ガス）
  ・qualityReview.gs: Q6事実検証+Q7絵文字行チェック追加（5→7項目）
  ・approval.gs: 投稿直前にスプレッドシート再読み込み（手動編集反映）
  ・imageGenerator.gs: 重複関数リネーム（saveImageToTempDrive_）
  ・キャラクターシート: 生活との接点の出し方（スケール感）追加
  ・設計思想: Grounding用途を「リサーチ」「検証」に限定

v10.0（2026-04-04）= 設計図v11.0
  v5プロンプト整理+役割分担明確化

v9.0（2026-04-02）= 設計図v10.0
  投稿軽量化+仮説精度向上+問いかけシステム

v8.0（2026-04-01）= 設計図v9.0
  アノマリー自動判定+品質修正安定化
```

---

*更新日: 2026-04-15 | v12.6（リグレッション防止+fixHallucinatedRates_クロス汚染修正+promptBuilder分割不要方針）*
