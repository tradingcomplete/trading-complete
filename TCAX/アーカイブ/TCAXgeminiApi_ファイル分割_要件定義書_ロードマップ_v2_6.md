# geminiApi.gs ファイル分割 要件定義書 / ロードマップ v2.6

作成日: 2026-03-23
更新日: 2026-04-15（v2.6 v12.6反映: testPostProcessor.gs新設で23ファイル化。formatRate_追加。fixHallucinatedRates_クロス汚染修正。promptBuilder.gs分割不要方針を明記）
対象: geminiApi.gsファイル分割後の23ファイル構成

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.0 | 2026-03-23 | 初版作成 |
| v1.1 | 2026-03-23 | 精査結果反映 |
| v1.2 | 2026-03-23 | 全Phase完了。testAll1-6全通過確認済み |
| v1.3 | 2026-03-25 | v8.7〜v8.8反映 |
| v1.4 | 2026-03-26 | v8.8.1反映: リトライ共通化+Pro変更 |
| v1.5 | 2026-03-26 | v8.9反映: GOLDEN/NY未発表指標ルール |
| v1.6 | 2026-03-26 | v8.10反映: buildPrompt_分割（5ヘルパー関数） |
| v1.7 | 2026-03-26 | v8.11反映: 条件分岐型仮説ルール |
| v1.8 | 2026-03-27 | v8.12反映: 品質レビュー全面改修 |
| v1.9 | 2026-03-28 | v8.13反映: ニュース主軸ルール |
| v2.0 | 2026-04-04 | 設計図v11.0反映: 22ファイル構成に更新。anomalyManager.gs+qualityReview.gs追加。v9.0〜v11.0の全変更（アノマリー/問いかけ/軽量化/v5プロンプト/役割分担明確化）反映。行数・関数数を最新実測値に更新 |
| v2.1 | 2026-04-06 | 設計図v12.0反映: 重複関数を「解決済み」に更新（v12.0リネームで解消確認）。geminiApi.gs+imageGenerator.gsのリトライ回数をMAX_RETRIES定数化。行数更新 |
| v2.2 | 2026-04-06 | 設計図v12.1反映: geminiApi.gs 573→713行（Claude市場分析追加）。qualityReview.gs 476→482行。rateManager.gs 785→796行（BTC事前取得）。依存関係図にanalyzeMarketWithClaude_追加 |
| v2.3 | 2026-04-07 | 設計図v12.2反映: WTI/天然ガス（Alpha Vantage）停止。ダウ理論をSH/SL（前後4日）ベースに刷新。週足シート新規。config.gsにDAILY_RATE_COLS追加。行数更新 |
| v2.4 | 2026-04-12 | 設計図v12.3反映: Claude品質レビューにWeb検索追加。Gemini Pro→Claudeフォールバック。ファクトチェック失敗ブロック。validateモード復活。画像3層階層。INDICATOR重複防止。TOKYO/LUNCH文字数変更。ストーリー主導への転換。MAX_RETRIES 3→2。行数更新 |
| v2.5 | 2026-04-14 | v12.4反映: 投稿生成Claude化（callClaudeGenerate_新設）。autoFixPost_ Claude化。品質修正Claude化。確定データ6（通貨強弱）+方向チェック（ルール1c）追加。体言止め（promptBuilder+Q7）。キャラクター口調リマインダー。月曜MORNING 08:03。画像時間表現ルール。Geminiはニュース取得+ファクトチェック検出のみに。行数更新 |
| v2.6 | 2026-04-15 | v12.5/v12.6反映: testPostProcessor.gs新設（23ファイル化）。config.gsにformatRate_+RATE_DECIMALS追加。postProcessor.gs fixHallucinatedRates_クロス汚染修正。toFixed→formatRate_置換（4ファイル48箇所）。promptBuilder.gs分割不要方針を明記（2,500行まで現状維持）。行数更新 |

---

## 1. 完了サマリー

### 分割結果

| 項目 | 分割前 | 現在（v12.6） |
|------|--------|--------------|
| geminiApi.gs | 9,398行・117関数 | 1,095行・11関数 |
| ファイル数 | 1ファイル | 23ファイル |
| 総行数 | 9,398行 | 約20,300行 |

### テスト体制（v10.0でテスト再構成）

| テスト | タイプ | 備考 |
|--------|--------|------|
| testAll1 | MORNING, TOKYO, LUNCH | 平日前半3タイプ |
| testAll2 | LONDON, GOLDEN, NY | 平日後半3タイプ |
| testAll3 | INDICATOR, KNOWLEDGE, WEEKLY_REVIEW | 指標+知識+週次 |
| testAll4 | RULE_1〜3, RULE_4, WEEKLY_LEARNING, NEXT_WEEK, WEEKLY_HYPOTHESIS | 心得+週末 |
| testPro_[TYPE]() | 各1タイプ | ファクトチェック込み個別テスト |

---

## 2. 分割後のファイル一覧（23ファイル・最新実測値）

GASプロジェクトの全23ファイル（アルファベット順 = GAS読み込み順）。

| No | ファイル | 行数 | 関数数 | 役割 |
|----|---------|------|--------|------|
| 1 | anomalyManager.gs | 1,041 | 12 | ★v9.0新規: アノマリー自動判定+祝日通知 |
| 2 | applyPairColors.gs | 245 | - | 通貨ペア色分け ★v12.2: SH/SL列色設定 |
| 3 | approval.gs | 1,014 | - | 承認フロー+メール送信 ★v12.3: Claudeフォールバック通知 |
| 4 | calendarManager.gs | 784 | 7 | 経済カレンダー取得・インポート ★v12.2: 27:00形式対応+B列テキスト強制 |
| 5 | config.gs | 767 | 8 | 設定値+POST_TYPES ★v12.6: formatRate_+RATE_DECIMALS追加（レート桁数一元管理） |
| 6 | factCheck.gs | 533 | 5 | ファクトチェック ★v12.6: toFixed→formatRate_置換 |
| 7 | geminiApi.gs | 1,095 | 11 | 核: メイン処理+Claude市場分析 ★v12.6: finalFactVerify_新設(JSON検出+コード置換) |
| 8 | imageGenerator.gs | 898 | - | AI画像生成+透かし合成 ★v12.4: 時間表現ルール追加 |
| 9 | indicatorManager.gs | 1,154 | 20 | 経済指標の取得・解析・フォーマット |
| 10 | learningManager.gs | 873 | 8 | 学び・仮説の抽出・検証 ★v12.1.1: SH/SL例文更新 |
| 11 | main.gs | 694 | - | カスタムメニュー+エントリポイント ★v12.6: 🧪テストメニュー追加 |
| 12 | marketAnalysis.gs | 803 | 7 | 市場分析（通貨強弱・ニュース） ★v11.0: ニュースv3（背景+生活影響） |
| 13 | postProcessor.gs | 1,958 | 23 | 後処理チェーン14段階 ★v12.6: fixHallucinatedRates_クロス汚染修正 + convertExactRatesToRange_ |
| 14 | priceSummary.gs | 874 | 8 | 価格サマリー集計・日次OHLC ★v12.1.1: SH/SL判定+週足シート作成 |
| 15 | promptBuilder.gs | 1,988 | 18 | プロンプト構築+データ注入 ★v12.6: TOKYO/LUNCHレート台ルール。**分割不要（2,500行まで現状維持）** |
| 16 | qualityReview.gs | 635 | 8 | 品質レビュー Q1〜Q7 ★v12.6: toFixed→formatRate_置換（20箇所） |
| 17 | rateManager.gs | 1,635 | 18 | レート取得・保存・検証 ★v12.2: SH/SLダウ理論+62秒削除+キャッシュ読み |
| 18 | scheduler.gs | 599 | - | トリガー管理+スケジュール ★v12.5: サマータイムオフセット適用 |
| 19 | sheetsManager.gs | 1,038 | - | スプレッドシート読み書き |
| 20 | testFunctions.gs | 225 | 19 | テスト関数（E2E） |
| 21 | ★testPostProcessor.gs | 296 | 5 | ★v12.6新設: 後処理チェーン不変条件テスト（40ケース） |
| 22 | utils.gs | 172 | - | ユーティリティ |
| 23 | xApi.gs | 654 | - | X API v2投稿 |

### ★v12.6: promptBuilder.gsは分割しない

promptBuilder.gs（1,985行）は頻繁に「肥大化」と指摘されるが、分割は不要。理由:
1. **バグ実績なし**: 実際にバグを起こしたのはpostProcessor/qualityReview。promptBuilderはv12.0以降安定稼働
2. **分割リスク**: GASの同名関数「後勝ち」ルールで、分割自体がサイレントなリグレッションの原因になる（v12.0でimageGenerator.gsで事故実績あり）
3. **構造上の理由**: buildPrompt_は「プロンプトを組み立てる」1つの仕事。636行はセクション数の多さであり、複雑さではない。ヘルパー関数は既に分離済み
4. **分割が必要になる条件**: 2,500行を超える、または「別のロジック」が追加されたとき（例: Premium AI機能の独立プロンプト構築）

---

## 3. 今後の改善ガイド（どのファイルを触るか）

### 3-1. 改善目的 → 対象ファイル早見表

| やりたいこと | 対象ファイル | 備考 |
|-------------|-------------|------|
| 禁止表現を追加・修正したい | postProcessor.gs | replaceProhibitedPhrases_ |
| 孤立短文の除去ルールを変えたい | postProcessor.gs | removeOrphanedLines_ |
| 新しい後処理ルールを追加したい | postProcessor.gs | applyPostProcessingChain_内に追加 |
| ファクトチェックの判定ルールを調整したい | factCheck.gs | factCheckPost_のL1/L2判定ルール |
| 自動修正のロジックを改善したい | factCheck.gs | autoFixPost_ |
| レート取得元を変更・追加したい | rateManager.gs | fetchLatestRates_ |
| 新しいコモディティを追加したい | rateManager.gs + config.gs | COMMODITY_ASSETSにも追加 |
| プロンプトに新しいデータを注入したい | promptBuilder.gs | buildPrompt_内の該当箇所 |
| 市場系投稿の方針を変えたい | promptBuilder.gs | buildMarketTypePolicy_ |
| KNOWLEDGE投稿の方針を変えたい | promptBuilder.gs | buildKnowledgePolicy_ |
| INDICATOR投稿の方針を変えたい | promptBuilder.gs | buildIndicatorPolicy_ |
| 週末系投稿の方針を変えたい | promptBuilder.gs | buildWeekendPolicy_ |
| RULE系投稿の方針を変えたい | promptBuilder.gs | buildRulePolicy_ |
| 品質レビューの基準を変えたい | qualityReview.gs | TYPE_DESCRIPTIONS |
| アノマリーを追加・修正したい | anomalyManager.gs + スプレッドシート「アノマリー」 |
| 祝日を更新したい | config.gs | JAPAN_HOLIDAYS配列 |
| 経済カレンダーの取得方法を変えたい | calendarManager.gs | fetchEconomicCalendar |
| 投稿タイプの文字数を変えたい | config.gs | POST_TYPES の charMin/charMax |
| 投稿プロンプトの内容を変えたい | スプレッドシート「投稿プロンプト」C列 | コード修正不要 |
| コンパナの口調・哲学を変えたい | スプレッドシート「キャラクター」シート | コード修正不要 |
| 政策金利を更新したい | スプレッドシート「確定データ」シート | コード修正不要 |
| 要人の交代 | スプレッドシート「確定データ」シート | コード修正不要 |
| Geminiモデルを変更したい | config.gs | GEMINI_MODEL変数（1箇所のみ） |
| 503フォールバック先を変えたい | geminiApi.gs | callGemini_末尾のClaudeフォールバック部分 |
| 投稿生成のモデルを変えたい | geminiApi.gs | callClaudeGenerate_（★v12.4新設） |
| 確定データガードの内容を変えたい | qualityReview.gs + factCheck.gs | 修正プロンプト内の確定データ注入部分 |
| 方向チェックのルールを変えたい | factCheck.gs | 確定データ6 + ルール1c |
| 絵文字行の体言止めルールを変えたい | promptBuilder.gs + qualityReview.gs | buildFormatRules_ + Q7 |
| キャラクター口調を強化したい | promptBuilder.gs | 最末尾の口調リマインダー |
| 画像の時間表現を修正したい | imageGenerator.gs | buildImagePrompt_内 |
| 品質レビューのWeb検索設定を変えたい | qualityReview.gs | callClaude_のweb_search設定+max_uses |
| ファクトチェック失敗時の挙動を変えたい | main.gs | factCheckSkipped判定部分 |
| Phase 5（プロンプト自動進化）の実装 | learningManager.gs | 既存の学び・仮説機能を拡張 |

### 3-2. buildPrompt_分割（v8.10完了）

buildPrompt_を636行→391行に縮小。投稿タイプごとの条件分岐を5つのヘルパー関数に切り出し。

| 切り出した部分 | 関数名 |
|-------------|---------|
| 市場系方針 + タイプ別指示 + 月曜コンテキスト | buildMarketTypePolicy_ |
| KNOWLEDGE方針 | buildKnowledgePolicy_ |
| INDICATOR方針 + データ注入 | buildIndicatorPolicy_ |
| 週末系方針 + データ注入 | buildWeekendPolicy_ |
| RULE系方針 | buildRulePolicy_ |

### 3-3. 修正時のルール

- 修正対象のファイルだけ出力・差し替えすればOK
- 正規表現で `\b` は使わない（二重小数点バグの原因）
- `\s` は改行を含む → 行頭処理は `[ \t]+` を使う
- 新しい後処理を追加する前に既存チェーンへの影響を検証すること
- 設計図・設計書は内容が変わるたびにバージョン番号を上げること

### 3-4. 役割分担（★v11.0）

| 場所 | 仕事 |
|------|------|
| C列プロンプト | 各タイプの「役割」と「文字数」だけ |
| キャラクターシート | 口調・哲学・禁止事項 |
| promptBuilder.gs | 構造ルール + データ注入 + ★口調リマインダー（最末尾） |
| qualityReview.gs | 品質チェック基準 + ★修正（Claude化・確定データガード付き） |
| factCheck.gs | ファクトチェック検出（Gemini Grounding）+ ★修正（Claude化） |
| スプレッドシート確定データ | ★真実のアンカー（通貨強弱・レート・金利・要人） |

原則: 確定データ > AI推論。1つの仕事は1つの場所で定義。OK/NG例の詰め込みは出力を画一化させる。

---

## 4. 依存関係図（最新版）

```
generatePost（geminiApi.gs - 768行 - 司令塔）
  │
  ├── レート取得
  │     fetchLatestRates_（rateManager.gs）
  │     getLatestRatesFromCache_（rateManager.gs）
  │     saveRatesToSheet_（rateManager.gs）
  │
  ├── プロンプト構築
  │     buildPrompt_（promptBuilder.gs）
  │       ├── calculateRateDirection_（marketAnalysis.gs）
  │       ├── detectHotPair_（marketAnalysis.gs）
  │       ├── fetchMarketNews_（marketAnalysis.gs）★v11.0: 背景+生活影響フィールド
  │       ├── analyzePriceHistory_（marketAnalysis.gs）
  │       ├── fetchIndicatorResults_（indicatorManager.gs）
  │       ├── formatIndicatorPreview_（indicatorManager.gs）
  │       ├── formatWeeklyRateTrend_（indicatorManager.gs）
  │       ├── formatWeeklyIndicatorSummary_（indicatorManager.gs）
  │       ├── formatIndicatorTrend_（indicatorManager.gs）
  │       ├── getLatestIndicators_（indicatorManager.gs）
  │       ├── getEconomicCalendar_（promptBuilder.gs）
  │       ├── getTodayAnomalies / getNextWeekAnomalies（anomalyManager.gs）★v9.0
  │       ├── buildMarketTypePolicy_（promptBuilder.gs）
  │       ├── buildKnowledgePolicy_（promptBuilder.gs）
  │       ├── buildIndicatorPolicy_（promptBuilder.gs）★v11.0: 復習メモ化
  │       ├── buildWeekendPolicy_（promptBuilder.gs）
  │       ├── buildRulePolicy_（promptBuilder.gs）
  │       ├── getLearningLog_（promptBuilder.gs）
  │       ├── getQualityFeedback_（promptBuilder.gs）
  │       ├── getHypothesisContext_（promptBuilder.gs）
  │       ├── buildFormatRules_（promptBuilder.gs）★v11.0: assertTypes 11タイプに拡大
  │       ├── getPolicyRatesText_（config.gs）
  │       ├── getWorldLeadersText_（config.gs）
  │       └── getCharacterPrompt()（sheetsManager.gs）
  │
  ├── ★v12.1: Claude市場分析（geminiApi.gs）
  │     analyzeMarketWithClaude_（Claude Sonnet 4.6）
  │       ├── detectHotPair_（marketAnalysis.gs）← 通貨強弱・ペア変動
  │       ├── fetchCommodityPrices_（rateManager.gs）← キャッシュから即取得
  │       ├── fetchDailyCommodityPrices_（rateManager.gs）← キャッシュから即取得
  │       └── CacheService.get('market_news_v3')← ニュースキャッシュ
  │     → 分析結果をプロンプトに【★★★】セクションとして注入
  │
  ├── ★v12.4: テキスト生成（Claude）
  │     callClaudeGenerate_（geminiApi.gs）← Geminiから変更
  │     Claude Sonnet 4.6がbuildPrompt_のプロンプトに従ってライティング
  │
  ├── 後処理チェーン（postProcessor.gs・12段階）
  │
  ├── ファクトチェック（factCheck.gs）
  │     factCheckPost_（L1: システムデータ+アノマリー確定データ+★確定データ6（通貨強弱）、L2: Grounding ON）
  │     ★v12.4: 方向チェック（ルール1c）追加
  │
  ├── ★v12.4: ファクトチェック修正（Claude + 確定データガード）
  │     autoFixPost_（Claude化。通貨強弱データ注入。方向矛盾防止）
  │
  ├── 品質レビュー（qualityReview.gs）★v12.4: Q7体言止め判定追加
  │     Claude Sonnet 4.6（Q1〜Q7 + ★Web検索 web_search_20250305 max_uses:3）
  │     ★v12.4: qualityReviewPost_にrates, csData引数追加
  │
  └── ★v12.4: 品質修正（Claude + 確定データガード）
        callClaudeGenerate_（Geminiから変更。確定データ注入。方向矛盾防止）
```

---

## 5. 外部ファイルからの呼び出し一覧

### main.gs から呼ばれる関数

| 関数名 | 分割先 | 用途 |
|--------|--------|------|
| generatePost | geminiApi.gs | executePost()から呼び出し |
| verifyPreviousHypothesis_ | learningManager.gs | 投稿前に前回仮説を検証 |
| extractPostInsights_ | learningManager.gs | 投稿後に仮説・学びを抽出 |
| importFromRawSheet | calendarManager.gs | カスタムメニュー |
| refreshTodayIndicatorResults | indicatorManager.gs | カスタムメニュー |
| updatePriceSummary | priceSummary.gs | カスタムメニュー |
| aggregateDailyRates | priceSummary.gs | カスタムメニュー |
| rebuildDailyRates | priceSummary.gs | カスタムメニュー |

### scheduler.gs から呼ばれる関数

| 関数名 | 分割先 | 用途 |
|--------|--------|------|
| aggregateDailyRates | priceSummary.gs | 日次トリガー |
| updatePriceSummary | priceSummary.gs | 日次トリガー |
| verifyWeeklyHypotheses_ | learningManager.gs | 土曜トリガー |
| scheduledFetchRates | rateManager.gs | 1時間トリガー |
| refreshTodayIndicatorResults | indicatorManager.gs | 指標発表後トリガー |

### approval.gs から呼ばれる関数

| 関数名 | 分割先 | 用途 |
|--------|--------|------|
| extractPostInsights_ | learningManager.gs | 承認後の学び抽出 |

---

## 6. 既知の技術的注意事項

### GASの読み込み順序（アルファベット順・22ファイル）
```
anomalyManager.gs → applyPairColors.gs → approval.gs → calendarManager.gs
→ config.gs → factCheck.gs → geminiApi.gs → imageGenerator.gs
→ indicatorManager.gs → learningManager.gs → main.gs → marketAnalysis.gs
→ postProcessor.gs → priceSummary.gs → promptBuilder.gs → qualityReview.gs
→ rateManager.gs → scheduler.gs → sheetsManager.gs → testFunctions.gs
→ utils.gs → xApi.gs
```

### 重複関数（★v12.0で解決済み）

v12.0でimageGenerator.gs側の関数をリネーム（saveImageToTempDrive_）し、衝突を解消。
現在の状態:
- saveImageToDrive_ → approval.gsにのみ存在（本番用。呼び出し元: approval.gs + main.gs）
- saveImageToTempDrive_ → imageGenerator.gsにのみ存在（テスト用。別関数）
- getImageFromDrive_ → approval.gsにのみ存在（呼び出し元: approval.gsのみ）

### グローバル変数
| 変数名 | ファイル | 備考 |
|--------|---------|------|
| REVERSE_INDICATORS | indicatorManager.gs | isReverseIndicator_の直前に定義 |
| MARKET_INDICATORS | config.gs | 重要指標リスト |
| その他の定数 | config.gs | CURRENCY_PAIRS, POST_TYPES, SCHEDULE, JAPAN_HOLIDAYS等 |

---

v2.5 v12.4反映・Claude主導アーキテクチャ・確定データガード・投稿生成+autoFix+品質修正Claude化・体言止め・キャラクター口調リマインダー・行数更新
