# geminiApi.gs ファイル分割 要件定義書 / ロードマップ v1.9

作成日: 2026-03-23
更新日: 2026-03-28（v1.9 v8.13: promptBuilder.gs 1,759行（ニュース主軸ルール3箇所追加））
対象: geminiApi.gsファイル分割後の21ファイル構成

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.0 | 2026-03-23 | 初版作成 |
| v1.1 | 2026-03-23 | 精査結果反映: testGenerateOnly重複問題・REVERSE_INDICATORS対応・行数修正・既存重複関数の記録・外部呼び出し一覧追加 |
| v1.2 | 2026-03-23 | 全Phase完了。testAll1-6全通過確認済み。実測行数・関数数で更新。今後の改善ガイド追加 |
| v1.3 | 2026-03-25 | v8.7〜v8.8反映: 行数更新（geminiApi 537行、config 556行、factCheck 660行、postProcessor 1,836行、promptBuilder 1,539行、main 605行）。改善ガイド更新（政策金利→確定データシート、後処理→applyPostProcessingChain_）。依存関係図更新 |
| v1.4 | 2026-03-26 | v8.8.1反映: geminiApi.gs 566行・6関数（executeRetry_/countEmojis_/checkMultiArrowBlocks_新設）、config.gs GEMINI_MODEL gemini-2.5-pro、postProcessor.gs 1,837行（\b除去）、testFunctions.gs 225行（再構成） |
| v1.5 | 2026-03-26 | v8.9反映: promptBuilder.gs 1,650行・12関数（getUnreleasedIndicatorNames_新設・GOLDEN/NY未発表指標ルール追加・重複コメント5箇所除去）、postProcessor.gs 1,832行（重複コメント1箇所除去）。buildPrompt_分割計画（v8.10予定）を今後の改善ガイドに追記 |
| v1.6 | 2026-03-26 | v8.10反映: promptBuilder.gs 1,709行・17関数。buildPrompt_を636行→391行に縮小（5ヘルパー関数: buildMarketTypePolicy_/buildKnowledgePolicy_/buildIndicatorPolicy_/buildWeekendPolicy_/buildRulePolicy_）。分割計画を「完了」に変更 |
| v1.7 | 2026-03-26 | v8.11反映: promptBuilder.gs 1,722行。条件分岐型仮説ルール追加（6箇所・+13行）。一方向の賭け仮説を禁止し「もしAならB、もしCならD」の読み解き型を推奨 |
| v1.8 | 2026-03-27 | v8.12反映: config.gs charMax緩和（16タイプ全て）、promptBuilder.gs 1,749行・18関数（答え合わせ重複防止）、qualityReview.gs 411行（品質レビュー全面改修: Claude指摘→Gemini修正→文字数保証）、postProcessor.gs 1,898行（removeOrphanedLines_新設+重複コメント除去） |
| v1.9 | 2026-03-28 | v8.13反映: promptBuilder.gs 1,759行。ニュース主軸ルール追加（buildMarketTypePolicy_+buildFormatRules_ 3箇所）。投稿の主軸を「レート・指標」→「ニュース」に転換 |

---

## 1. 完了サマリー

### 分割結果

| 項目 | 分割前 | 分割後 |
|------|--------|--------|
| geminiApi.gs | 9,398行・117関数 | 567行・3関数 |
| ファイル数 | 1ファイル | 11ファイル |
| 総行数 | 9,398行 | 9,392行（ヘッダーコメント等の調整） |
| 総関数数 | 117関数 | 116関数（testGenerateOnly 1関数を削除） |

### テスト結果（2026-03-23 全Phase完了後）

全16投稿タイプ、成功16 / 失敗0。

| テスト | タイプ | 結果 |
|--------|--------|------|
| testAll1 | MORNING, TOKYO, LUNCH | 成功 3 / 失敗 0 |
| testAll2 | LONDON, GOLDEN, NY | 成功 3 / 失敗 0 |
| testAll3 | INDICATOR, KNOWLEDGE, WEEKLY_REVIEW | 成功 3 / 失敗 0 |
| testAll4 | RULE_1, RULE_2, RULE_3 | 成功 3 / 失敗 0 |
| testAll5 | RULE_4, WEEKLY_LEARNING | 成功 2 / 失敗 0 |
| testAll6 | NEXT_WEEK, WEEKLY_HYPOTHESIS | 成功 2 / 失敗 0 |

---

## 2. 分割後のファイル一覧（最終実測値）

GASプロジェクトの全20ファイル（アルファベット順 = GAS読み込み順）。

| No | ファイル | 行数 | 関数数 | 新規/既存 | 役割 |
|----|---------|------|--------|----------|------|
| 1 | applyPairColors.gs | 225 | - | 既存 | 通貨ペア色分け |
| 2 | approval.gs | 979 | - | 既存 | 承認フロー+メール送信 |
| 3 | calendarManager.gs | 802 | 7 | 新規 | 経済カレンダー取得・インポート |
| 4 | config.gs | 556 | 7 | 既存 | 設定値+定数+確定データシート読み取り ★v8.7: POLICY_RATES廃止 |
| 5 | factCheck.gs | 660 | 5 | 新規 | ファクトチェック+自動修正 ★v8.7: 要人リスト確定データ注入 |
| 6 | geminiApi.gs | 566 | 6 | 既存（縮小） | 核: メイン処理+Gemini API通信 ★v8.8.1: リトライ共通化+Pro変更 |
| 7 | imageGenerator.gs | 882 | - | 既存 | AI画像生成+透かし |
| 8 | indicatorManager.gs | 1,191 | 20 | 新規 | 経済指標の取得・解析・フォーマット |
| 9 | learningManager.gs | 859 | 8 | 新規 | 学び・仮説の抽出・検証 |
| 10 | main.gs | 605 | - | 既存 | カスタムメニュー+エントリポイント ★v8.7: 確定データシート作成追加 |
| 11 | marketAnalysis.gs | 795 | 7 | 新規 | 市場分析（通貨強弱・トレンド・ニュース） |
| 12 | postProcessor.gs | 1,898 | 22 | 新規 | 後処理チェーン ★v8.12: removeOrphanedLines_新設 |
| 13 | priceSummary.gs | 642 | 5 | 新規 | 価格サマリー集計・日次OHLC |
| 14 | promptBuilder.gs | 1,759 | 18 | 新規 | プロンプト構築+データ注入 ★v8.13: ニュース主軸+答え合わせ重複防止+条件分岐型仮説 |
| 15 | rateManager.gs | 811 | 12 | 新規 | レート取得・保存・検証 |
| 16 | scheduler.gs | 517 | - | 既存 | トリガー管理+スケジュール |
| 17 | sheetsManager.gs | 1,038 | - | 既存 | スプレッドシート読み書き |
| 18 | testFunctions.gs | 225 | 19 | 新規 | テスト関数 ★v8.8.1: 再構成（testAll廃止→testPro_*/testRULE/testWEEK） |
| 19 | utils.gs | 172 | - | 既存 | ユーティリティ |
| 20 | xApi.gs | 654 | - | 既存 | X API v2投稿 |

---

## 3. 今後の改善ガイド（どのファイルを触るか）

### 3-1. 改善目的 → 対象ファイル早見表

| やりたいこと | 対象ファイル | 備考 |
|-------------|-------------|------|
| 禁止表現を追加・修正したい | postProcessor.gs | replaceProhibitedPhrases_ |
| 孤立短文の除去ルールを変えたい | postProcessor.gs | removeOrphanedLines_（★v8.12新設） |
| 新しい後処理ルールを追加したい | postProcessor.gs | applyPostProcessingChain_内に追加するだけでOK（★v8.8共通関数化） |
| ファクトチェックの判定ルールを調整したい | factCheck.gs | factCheckPost_のL1/L2判定ルール |
| 自動修正のロジックを改善したい | factCheck.gs | autoFixPost_ |
| レート取得元を変更・追加したい | rateManager.gs | fetchLatestRates_ |
| 新しいコモディティを追加したい | rateManager.gs + config.gs | COMMODITY_ASSETSにも追加 |
| プロンプトに新しいデータを注入したい | promptBuilder.gs | buildPrompt_内の該当箇所 |
| プロンプトの文字数を削減したい | promptBuilder.gs | buildPrompt_ + buildFormatRules_ |
| 市場系投稿の方針を変えたい | promptBuilder.gs | buildMarketTypePolicy_（★v8.10分割） |
| KNOWLEDGE投稿の方針を変えたい | promptBuilder.gs | buildKnowledgePolicy_（★v8.10分割） |
| INDICATOR投稿の方針を変えたい | promptBuilder.gs | buildIndicatorPolicy_（★v8.10分割） |
| 週末系投稿の方針を変えたい | promptBuilder.gs | buildWeekendPolicy_（★v8.10分割） |
| RULE系投稿の方針を変えたい | promptBuilder.gs | buildRulePolicy_（★v8.10分割） |
| 経済カレンダーの取得方法を変えたい | calendarManager.gs | fetchEconomicCalendar |
| 経済指標の解析ロジックを変えたい | indicatorManager.gs | 該当関数 |
| 仮説3要素構造を改善したい | learningManager.gs | extractPostInsights_ + parseHypothesisDetails_ |
| Phase 5（プロンプト自動進化）の実装 | learningManager.gs | 既存の学び・仮説機能を拡張 |
| 投稿タイプを追加したい | config.gs + promptBuilder.gs | POST_TYPES + buildPrompt_ |
| Geminiモデルを変更したい | config.gs | GEMINI_MODEL変数（1箇所のみ）★v8.8.1: Flash→Pro変更 |
| 政策金利を更新したい | スプレッドシート「確定データ」シート | コード修正不要。セルを書き換えるだけ（★v8.7） |
| 要人の交代 | スプレッドシート「確定データ」シート | コード修正不要。セルを書き換えるだけ（★v8.7） |
| テスト関数を追加したい | testFunctions.gs | 末尾に追加 |
| generatePostのフロー自体を変えたい | geminiApi.gs | 核ファイル（慎重に） |
| 未発表指標の判定ロジックを変えたい | promptBuilder.gs | getUnreleasedIndicatorNames_（★v8.9新設） |

### 3-1b. buildPrompt_分割（★v8.10完了）

buildPrompt_を636行→391行に縮小。投稿タイプごとの条件分岐を5つのヘルパー関数に切り出し。
ロジックの変更はゼロ（コードを関数に移動しただけ）。testPro_GOLDENで動作確認済み。

| 切り出した部分 | 関数名 | 行 |
|-------------|---------|-----|
| ②-c 市場系方針 + タイプ別指示 + 月曜コンテキスト | buildMarketTypePolicy_(postType, now) | 1379 |
| ②-d KNOWLEDGE方針 | buildKnowledgePolicy_(postType) | 1510 |
| ②-e INDICATOR方針 + データ注入 | buildIndicatorPolicy_(postType, keys) | 1532 |
| ②-f〜②-f3 週末系方針 + データ注入 | buildWeekendPolicy_(postType, keys, rates) | 1572 |
| ②-g/②-h RULE系方針 | buildRulePolicy_(postType, isRuleType) | 1664 |

今後の投稿タイプ別方針の変更は、対応するヘルパー関数内を修正するだけでOK（buildPrompt_本体を触らない）。

### 3-2. 修正時のルール

- 修正対象のファイルだけ出力・差し替えすればOK（geminiApi.gs丸ごと不要）
- 修正後はtestAll1で動作確認（後処理やファクトチェックの変更はtestAll1-6推奨）
- 新しい後処理を追加する前に既存チェーンへの影響を検証すること
- 正規表現で `\b` は使わない（二重小数点バグの原因）
- `\s` は改行を含む → 行頭処理は `[ \t]+` を使う

### 3-3. Claudeとのセッション運用

- 全ファイルを1つのチャットで管理（ファイルが小さくなったため）
- 修正指示はダウンロードリンク付きで提供
- geminiApi.gsの丸ごと出力は不要になった（567行の核ファイルのみ）
- 修正対象ファイルのみ出力が基本

---

## 4. 依存関係図（最終版）

```
generatePost（geminiApi.gs - 566行 - 司令塔 ★v8.8.1: リトライ共通化+Pro変更）
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
  │       ├── fetchMarketNews_（marketAnalysis.gs）
  │       ├── analyzePriceHistory_（marketAnalysis.gs）
  │       ├── fetchIndicatorResults_（indicatorManager.gs）
  │       ├── formatIndicatorPreview_（indicatorManager.gs）
  │       ├── formatWeeklyRateTrend_（indicatorManager.gs）
  │       ├── formatWeeklyIndicatorSummary_（indicatorManager.gs）
  │       ├── formatIndicatorTrend_（indicatorManager.gs）
  │       ├── getLatestIndicators_（indicatorManager.gs）
  │       ├── getEconomicCalendar_（promptBuilder.gs）
  │       ├── buildMarketTypePolicy_（promptBuilder.gs）★v8.10: buildPrompt_から分割
  │       ├── buildKnowledgePolicy_（promptBuilder.gs）★v8.10: buildPrompt_から分割
  │       ├── buildIndicatorPolicy_（promptBuilder.gs）★v8.10: buildPrompt_から分割
  │       │     └── formatIndicatorPreview_（indicatorManager.gs）
  │       ├── buildWeekendPolicy_（promptBuilder.gs）★v8.10: buildPrompt_から分割
  │       │     ├── formatWeeklyIndicatorSummary_（indicatorManager.gs）
  │       │     └── formatWeeklyRateTrend_（indicatorManager.gs）
  │       ├── buildRulePolicy_（promptBuilder.gs）★v8.10: buildPrompt_から分割
  │       ├── getLearningLog_（promptBuilder.gs）
  │       ├── getQualityFeedback_（promptBuilder.gs）
  │       ├── getHypothesisContext_（promptBuilder.gs）
  │       │     └── getUnreleasedIndicatorNames_（promptBuilder.gs）★v8.9新設: 未発表指標チェック
  │       ├── buildFormatRules_（promptBuilder.gs）
  │       ├── getPolicyRatesText_（config.gs）★v8.7: 確定データシートから読み取り
  │       ├── getWorldLeadersText_（config.gs）★v8.7新設: 要人リスト
  │       └── getCharacterPrompt()（sheetsManager.gs）
  │
  ├── テキスト生成
  │     callGemini_（geminiApi.gs - 共通インフラ）
  │
  ├── 後処理チェーン（postProcessor.gs）
  │     removeForeignText_ → stripAIPreamble_ → enforceLineBreaks_
  │     → removeDisallowedEmoji_ → removeMarkdown_ → replaceProhibitedPhrases_
  │     → fixMondayYesterday_（月曜のみ） → removeDuplicateBlocks_
  │     → truncateAfterHashtag_ → generateDynamicHashtags_
  │     → fixMissingDecimalPoint_ → fixHallucinatedRates_
  │     → validateFinalFormat_（安全網）
  │
  ├── ファクトチェック（factCheck.gs）
  │     factCheckPost_（L1: システムデータ、L2: Grounding ON）
  │     └── callGemini_（geminiApi.gs）
  │
  └── 自動修正（factCheck.gs）
        autoFixPost_（Grounding OFF）
        → verifyAutoFix_ → autoFixPost_（リトライ）
        → forceRemoveIssueLines_（最終手段）
        └── callGemini_（geminiApi.gs）
```

---

## 5. 外部ファイルからの呼び出し一覧

### main.gs から呼ばれる関数

| 関数名 | 分割先 | main.gsでの用途 |
|--------|--------|----------------|
| generatePost | geminiApi.gs | executePost()から呼び出し |
| verifyPreviousHypothesis_ | learningManager.gs | 投稿前に前回仮説を検証 |
| extractPostInsights_ | learningManager.gs | 投稿後に仮説・学びを抽出 |
| importFromRawSheet | calendarManager.gs | カスタムメニューから手動実行 |
| refreshTodayIndicatorResults | indicatorManager.gs | カスタムメニューから手動実行 |
| updatePriceSummary | priceSummary.gs | カスタムメニューから手動実行 |
| aggregateDailyRates | priceSummary.gs | カスタムメニューから手動実行 |
| rebuildDailyRates | priceSummary.gs | カスタムメニューから手動実行 |
| testFetchRates | testFunctions.gs | カスタムメニューから手動実行 |

### scheduler.gs から呼ばれる関数

| 関数名 | 分割先 | scheduler.gsでの用途 |
|--------|--------|---------------------|
| aggregateDailyRates | priceSummary.gs | 日次トリガー（0時） |
| updatePriceSummary | priceSummary.gs | 日次トリガー（0時） |
| verifyWeeklyHypotheses_ | learningManager.gs | 土曜トリガー |
| scheduledFetchRates | rateManager.gs | 1時間トリガー |
| refreshTodayIndicatorResults | indicatorManager.gs | 指標発表後トリガー |

### approval.gs から呼ばれる関数

| 関数名 | 分割先 | approval.gsでの用途 |
|--------|--------|---------------------|
| extractPostInsights_ | learningManager.gs | 承認後の投稿から仮説・学びを抽出 |

---

## 6. 既知の技術的注意事項

### GASの読み込み順序（アルファベット順）
```
applyPairColors.gs → approval.gs → calendarManager.gs → config.gs
→ factCheck.gs → geminiApi.gs → imageGenerator.gs → indicatorManager.gs
→ learningManager.gs → main.gs → marketAnalysis.gs → postProcessor.gs
→ priceSummary.gs → promptBuilder.gs → rateManager.gs → scheduler.gs
→ sheetsManager.gs → testFunctions.gs → utils.gs → xApi.gs
```

### 重複関数（未解決・今後の課題）
| 関数名 | ファイル1 | ファイル2 | 備考 |
|--------|----------|----------|------|
| saveImageToDrive_ | approval.gs | imageGenerator.gs | 読み込み順でapproval.gs版が有効 |
| getImageFromDrive_ | approval.gs | imageGenerator.gs | 読み込み順でapproval.gs版が有効 |

### グローバル変数
| 変数名 | ファイル | 備考 |
|--------|---------|------|
| REVERSE_INDICATORS | indicatorManager.gs | isReverseIndicator_の直前に定義 |
| POLICY_RATES | config.gs | 政策金利一元管理（v8.5で追加） |
| その他の定数 | config.gs | CURRENCY_PAIRS, POST_TYPES, SCHEDULE等 |

### 設計の鉄則（コード修正時の必須ルール）
- factCheckPost_はGrounding ON / autoFixPost_はGrounding OFF
- 正規表現で `\b` は使わない（二重小数点バグの原因）
- `\s` は改行を含む → 行頭処理は `[ \t]+` を使う
- 新しい後処理を追加する前に既存チェーンへの影響を検証すること
- factCheckPost_のカレンダースコープはpostType別

---

## 7. プロンプトサイズ（参考データ）

分割完了時点でのプロンプト総文字数（testAll実行時の実測値）。

| 投稿タイプ | 文字数 | セクション数 | 備考 |
|-----------|--------|-------------|------|
| MORNING | 約23,000 | 93 | 市場系最大（ニュース+指標+分析の全注入） |
| TOKYO | 約23,000 | 94 | MORNING同等 |
| LUNCH | 約25,000 | 97 | TC導線セクション追加で最大 |
| RULE系 | 約16,600 | 71 | 市場データ注入が少ないため軽量 |
| WEEKLY_LEARNING | 約19,400 | 73 | 中間 |

市場系投稿の肥大化（22,000-25,000文字）は今後の改善課題。
改善対象: promptBuilder.gs の buildPrompt_ + buildFormatRules_

---

v1.9 v8.13反映・ニュース主軸ルール追加
