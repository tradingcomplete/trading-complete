# geminiApi.gs ファイル分割 要件定義書 / ロードマップ v2.2

作成日: 2026-03-23
更新日: 2026-04-06（v2.2 設計図v12.1反映: Claude市場分析追加+BTC事前取得+qualityReview改善+行数更新）
対象: geminiApi.gsファイル分割後の22ファイル構成

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

---

## 1. 完了サマリー

### 分割結果

| 項目 | 分割前 | 現在（v11.0） |
|------|--------|--------------|
| geminiApi.gs | 9,398行・117関数 | 713行・8関数 |
| ファイル数 | 1ファイル | 22ファイル |
| 総行数 | 9,398行 | 約17,200行 |

### テスト体制（v10.0でテスト再構成）

| テスト | タイプ | 備考 |
|--------|--------|------|
| testAll1 | MORNING, TOKYO, LUNCH | 平日前半3タイプ |
| testAll2 | LONDON, GOLDEN, NY | 平日後半3タイプ |
| testAll3 | INDICATOR, KNOWLEDGE, WEEKLY_REVIEW | 指標+知識+週次 |
| testAll4 | RULE_1〜3, RULE_4, WEEKLY_LEARNING, NEXT_WEEK, WEEKLY_HYPOTHESIS | 心得+週末 |
| testPro_[TYPE]() | 各1タイプ | ファクトチェック込み個別テスト |

---

## 2. 分割後のファイル一覧（22ファイル・最新実測値）

GASプロジェクトの全22ファイル（アルファベット順 = GAS読み込み順）。

| No | ファイル | 行数 | 関数数 | 役割 |
|----|---------|------|--------|------|
| 1 | anomalyManager.gs | 1,041 | 12 | ★v9.0新規: アノマリー自動判定+祝日通知 |
| 2 | applyPairColors.gs | 225 | - | 通貨ペア色分け |
| 3 | approval.gs | 983 | - | 承認フロー+メール送信 |
| 4 | calendarManager.gs | 771 | 7 | 経済カレンダー取得・インポート |
| 5 | config.gs | 585 | 6 | 設定値+POST_TYPES+確定データ ★v11.0: INDICATOR 140-180字 |
| 6 | factCheck.gs | 651 | 5 | ファクトチェック+自動修正 |
| 7 | geminiApi.gs | 713 | 8 | 核: メイン処理+Claude市場分析+Gemini API通信 ★v12.1: 3段階生成 |
| 8 | imageGenerator.gs | 890 | - | AI画像生成+透かし合成 |
| 9 | indicatorManager.gs | 1,154 | 20 | 経済指標の取得・解析・フォーマット |
| 10 | learningManager.gs | 849 | 8 | 学び・仮説の抽出・検証 |
| 11 | main.gs | 605 | - | カスタムメニュー+エントリポイント |
| 12 | marketAnalysis.gs | 803 | 7 | 市場分析（通貨強弱・ニュース） ★v11.0: ニュースv3（背景+生活影響） |
| 13 | postProcessor.gs | 1,874 | 22 | 後処理チェーン12段階 |
| 14 | priceSummary.gs | 630 | 5 | 価格サマリー集計・日次OHLC |
| 15 | promptBuilder.gs | 1,887 | 18 | プロンプト構築+データ注入 ★v11.0: assertTypes拡大+ネガティブ禁止+INDICATOR復習メモ |
| 16 | qualityReview.gs | 482 | 8 | 品質レビュー Q1〜Q7 ★v12.1: Q6定性チェック+Gemini削除禁止+TOKYO/LUNCH更新 |
| 17 | rateManager.gs | 1,364 | 16 | レート取得・保存・検証 ★v12.1: BTC事前取得+通貨強弱+ダウ理論+バックフィル |
| 18 | scheduler.gs | 552 | - | トリガー管理+スケジュール |
| 19 | sheetsManager.gs | 1,038 | - | スプレッドシート読み書き |
| 20 | testFunctions.gs | 225 | 19 | テスト関数 |
| 21 | utils.gs | 172 | - | ユーティリティ |
| 22 | xApi.gs | 654 | - | X API v2投稿 |

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
| promptBuilder.gs | 構造ルール + データ注入 |
| qualityReview.gs | 品質チェック基準 |

原則: 1つの仕事は1つの場所で定義。OK/NG例の詰め込みは出力を画一化させる。

---

## 4. 依存関係図（最新版）

```
generatePost（geminiApi.gs - 713行 - 司令塔）
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
  ├── テキスト生成
  │     callGemini_（geminiApi.gs）← Claude分析に従ってライティング
  │
  ├── 後処理チェーン（postProcessor.gs・12段階）
  │
  ├── ファクトチェック（factCheck.gs）
  │     factCheckPost_（L1: システムデータ+アノマリー確定データ、L2: Grounding ON）
  │
  ├── 品質レビュー（qualityReview.gs）★v12.1: Q6定性チェック+Gemini削除禁止
  │     Claude Sonnet 4.6（Q1〜Q7） → Gemini修正（書き直し） → trimToCharMax_
  │
  └── 自動修正（factCheck.gs）
        autoFixPost_（Grounding OFF）
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

v2.2 設計図v12.1反映・Claude市場分析追加・BTC事前取得・行数更新
