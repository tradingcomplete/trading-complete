# geminiApi.gs ファイル分割 要件定義書 / ロードマップ v3.0

**作成日**: 2026-03-23  
**v3.0 更新日**: 2026-04-19 深夜(v13.0 完成版反映・27ファイル化・promptBuilder 分割判断更新)  
**対象**: geminiApi.gs ファイル分割後の **27ファイル構成**

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
| v1.6 | 2026-03-26 | v8.10反映: buildPrompt_分割(5ヘルパー関数) |
| v1.7 | 2026-03-26 | v8.11反映: 条件分岐型仮説ルール |
| v1.8 | 2026-03-27 | v8.12反映: 品質レビュー全面改修 |
| v1.9 | 2026-03-28 | v8.13反映: ニュース主軸ルール |
| v2.0 | 2026-04-04 | 設計図v11.0反映: 22ファイル構成 |
| v2.1 | 2026-04-06 | 設計図v12.0反映: リネームで衝突解消 |
| v2.2 | 2026-04-06 | 設計図v12.1反映: Claude市場分析追加 |
| v2.3 | 2026-04-07 | 設計図v12.2反映: WTI/天然ガス停止・SH/SLダウ理論 |
| v2.4 | 2026-04-12 | 設計図v12.3反映: Web検索追加・Claudeフォールバック |
| v2.5 | 2026-04-14 | v12.4反映: 投稿生成Claude化・Claude主導 |
| v2.6 | 2026-04-15 | v12.6反映: 23ファイル化・formatRate_追加 |
| **v3.0** | **2026-04-19 深夜** | **v13.0 完成版反映(1日半で大規模変更)**:<br>・**27ファイル化**(新規4ファイル): validationV13.gs・setupUseV13Validation.gs・setupDisableFactCheck.gs・testPostProcessor.gs<br>・**validationV13.gs 1,308行・v13.0.8**: 2段検証の核(Stage 1総合レビュー + Stage 2修正適用 + Q8構造整合性 + detectStructureBreaks_)<br>・**promptBuilder.gs 2,205行**: Phase 6再設計完了(Before/After・統合案C/D/A・ダウ理論注入・鉤括弧ルール)。**分割判断**: 2,500行閾値に近づいたが、Phase 6 で構造再設計済みのため分割不要継続<br>・**qualityReview.gs 724行・v13.0.8**: trimToCharMax_ に鉤括弧保護追加<br>・**geminiApi.gs 約1,961行**: v13.0 分岐追加(USE_V13_VALIDATION)・max_tokens可変化<br>・**factCheck.gs**: v12.10 以降無効化中(DISABLE_FACTCHECK=true)。Phase 5 で削除予定<br>・**依存関係図更新**: v13.0 2段検証フローに刷新<br>・**v13.0 設計原則8項目を新設**: 小手先修正NG・生成時点対処・few-shot優位・並行稼働フラグ等 |

---

## 1. 完了サマリー

### 分割結果(v13.0 完成版)

| 項目 | 分割前 | v12.6 | **v13.0 現在** |
|------|--------|-------|---|
| geminiApi.gs | 9,398行・117関数 | 1,095行・11関数 | **約1,961行**(v13.0 分岐追加) |
| ファイル数 | 1ファイル | 23ファイル | **27ファイル** |
| 総行数 | 9,398行 | 約20,300行 | **約26,500行** |
| validationV13.gs(新規) | - | - | **1,308行**(v13.0.8) |

### 新規追加ファイル(v12.6 → v13.0)

| No | ファイル | 行数 | 追加時期 | 役割 |
|----|---------|------|---------|------|
| - | setupDisableFactCheck.gs | 257 | v12.10 | factCheck 無効化設定補助 |
| - | interactiveVerify.gs | 約400 | v12.7 | Step 4 対話型検証 |
| - | **validationV13.gs** | **1,308** | **v13.0** | **v13.0 総合検証・2段構造** |
| - | **setupUseV13Validation.gs** | **107** | **v13.0** | **v13.0 フラグ切替補助** |

### テスト体制(変更なし)

| テスト | タイプ | 備考 |
|--------|--------|------|
| testAll1 | MORNING, TOKYO, LUNCH | 平日前半3タイプ |
| testAll2 | LONDON, GOLDEN, NY | 平日後半3タイプ |
| testAll3 | INDICATOR, KNOWLEDGE, WEEKLY_REVIEW | 指標+知識+週次 |
| testAll4 | RULE_1〜3, RULE_4, WEEKLY_LEARNING, NEXT_WEEK, WEEKLY_HYPOTHESIS | 心得+週末 |
| testPro_[TYPE]() | 各1タイプ | ファクトチェック込み個別テスト |
| **testDowTheoryOutput**(v13.0新設) | - | ダウ理論出力確認 |
| **testDetectStructureBreaks**(v13.0.8新設) | - | 鉤括弧構造チェック単体テスト |

---

## 2. v13.0 ファイル一覧(27ファイル・最新実測値)

GASプロジェクトの全27ファイル(アルファベット順 = GAS読み込み順)。

| No | ファイル | 行数 | 関数数 | 役割 |
|----|---------|------|--------|------|
| 1 | anomalyManager.gs | 1,041 | 12 | アノマリー自動判定+祝日通知(v9.0新規) |
| 2 | applyPairColors.gs | 245 | - | 通貨ペア色分け(SH/SL列色設定) |
| 3 | approval.gs | 約1,300 | - | 承認フロー+メール送信(Claudeフォールバック通知) |
| 4 | calendarManager.gs | 784 | 7 | 経済カレンダー取得・インポート |
| 5 | config.gs | 767 | 8 | 設定値+POST_TYPES(formatRate_+RATE_DECIMALS) |
| 6 | factCheck.gs | 533 | 5 | **無効化中(Phase 5で削除予定)** |
| 7 | **geminiApi.gs** | **約1,961** | 13 | **v13.0対応版・Claude市場分析・v13.0分岐** |
| 8 | imageGenerator.gs | 898 | - | AI画像生成+透かし合成 |
| 9 | indicatorManager.gs | 1,154 | 20 | 経済指標の取得・解析・フォーマット |
| 10 | **interactiveVerify.gs** | **約400** | 8 | **Step 4 対話型検証(v12.7新設)** |
| 11 | learningManager.gs | 873 | 8 | 学び・仮説の抽出・検証(SH/SL例文) |
| 12 | main.gs | 694 | - | カスタムメニュー+エントリポイント |
| 13 | marketAnalysis.gs | 919 | 7 | 市場分析(通貨強弱・ニュース・Claude web_search) |
| 14 | postProcessor.gs | 1,958 | 23 | 後処理チェーン14段階(v12.6: fixHallucinatedRates_修正) |
| 15 | priceSummary.gs | 874 | 8 | 価格サマリー集計・日次OHLC・SH/SL判定・週足シート |
| 16 | **promptBuilder.gs** | **2,205** | 19 | **v13.0 Phase 6再設計版・Before/After実例・ダウ理論注入・鉤括弧ルール** |
| 17 | **qualityReview.gs** | **724** | 9 | **v13.0.8: trimToCharMax_ 鉤括弧保護** |
| 18 | rateManager.gs | 1,636 | 19 | レート取得・保存・**getDowTheorySummary_(v13.0 で活用)** |
| 19 | scheduler.gs | 599 | - | トリガー管理+スケジュール(サマータイム対応) |
| 20 | **setupDisableFactCheck.gs** | **257** | 7 | **v12.10新設: factCheck無効化設定補助** |
| 21 | **setupUseV13Validation.gs** | **107** | 3 | **v13.0新設: USE_V13_VALIDATIONフラグ切替** |
| 22 | sheetsManager.gs | 1,038 | - | スプレッドシート読み書き |
| 23 | testFunctions.gs | 225+α | 20+ | テスト関数(E2E)+testDowTheoryOutput |
| 24 | testPostProcessor.gs | 296 | 5 | 後処理チェーン不変条件テスト(40ケース・v12.6新設) |
| 25 | utils.gs | 172 | - | ユーティリティ |
| 26 | **validationV13.gs** | **1,308** | 17 | **★v13.0核心・2段検証・Q8構造整合性・detectStructureBreaks_** |
| 27 | xApi.gs | 654 | - | X API v2投稿 |

### ★v13.0 で最も重要なファイル

**validationV13.gs(1,308行・v13.0.8)**
- Stage 1 総合レビュー: Q1-Q8 の8観点チェック
- Stage 2 修正適用: 5種類の修正を必要に応じて実行
- Q8(v13.0.8 新設): 鉤括弧の対応・中身チェック
- detectStructureBreaks_: 機械的な最後の砦
- v13.0.1〜v13.0.8 の8回改修の集大成

### ★promptBuilder.gs の分割判断(v13.0 更新)

**現状**: 2,205行(v12.6の1,988行から +217行)。2,500行閾値に近づいた。

**判断**: **分割不要継続**。理由:

1. **Phase 6 で構造再設計済み**: 肥大化ではなく「実例強化」のための増加
   - Before/After 実例(+1,500字): few-shot 誘導・効果実証済み
   - ダウ理論注入: 既存関数 getDowTheorySummary_ の接続
   - 統合案C/D/A: 実は 11セクション削除・5セクション新設で**ネットで構造最適化**

2. **分割リスクは依然変わらず**: GAS 同名関数「後勝ち」ルールで事故リスク

3. **本質的な複雑さは増えていない**: buildPrompt_ 自体は「プロンプトを組み立てる」1つの仕事のまま

4. **分割が必要になる条件(更新)**:
   - 行数が 2,800行 を超える
   - 「別のロジック」が追加される(例: Premium AI機能の独立プロンプト構築)
   - Phase 6-2(TC関連統合)実施後に再評価

---

## 3. 今後の改善ガイド(どのファイルを触るか)

### 3-1. v13.0 改善目的 → 対象ファイル早見表

| やりたいこと | 対象ファイル | 備考 |
|-------------|-------------|------|
| **v13.0検証の調整** | | |
| Stage 1 Q1-Q8 の判定基準を変えたい | validationV13.gs | buildStage1Prompt_ |
| Q8 構造整合性チェックを強化 | validationV13.gs | Q8 定義 + detectStructureBreaks_ |
| 鉤括弧ルールを強化 | promptBuilder.gs + validationV13.gs | 段階1+段階2 |
| キャラクター注入の内容を変える | validationV13.gs | applyQualityFix_ 末尾(SSOT) |
| 二重実行防止の秒数変更 | validationV13.gs | 180秒定数 |
| v13.0 の無効化(緊急時) | setupUseV13Validation.gs | setUseV13ValidationFalse() |
| **プロンプト改善** | | |
| Before/After 実例を追加・変更 | promptBuilder.gs | buildBeforeAfterExamples_ |
| 最終確認の内容を変える | promptBuilder.gs | buildPrompt_ 末尾 L1080付近 |
| ダウ理論の注入位置を変える | promptBuilder.gs | buildPrompt_ L765付近 |
| 時間軸ルールを変更 | promptBuilder.gs | 最終確認内 + Before/After |
| 統合セクションを再統合 | promptBuilder.gs | buildFormatRules_ |
| **構造整合性** | | |
| trimToCharMax_ の圧縮ロジック変更 | qualityReview.gs | trimToCharMax_ |
| 圧縮時の鉤括弧保護を強化 | qualityReview.gs | trimToCharMax_ 内の鉤括弧ブロック |
| **従来の改善項目(v12.10 から継続)** | | |
| 禁止表現を追加・修正したい | postProcessor.gs | replaceProhibitedPhrases_ |
| 孤立短文の除去ルール | postProcessor.gs | removeOrphanedLines_ |
| レート取得元を変更 | rateManager.gs | fetchLatestRates_ |
| プロンプトに新しいデータを注入 | promptBuilder.gs | buildPrompt_内の該当箇所 |
| アノマリーを追加・修正 | anomalyManager.gs + スプレッドシート | - |
| 祝日を更新 | config.gs | JAPAN_HOLIDAYS配列 |
| 投稿タイプの文字数を変える | config.gs | POST_TYPES の charMin/charMax |
| 投稿プロンプトの内容 | スプレッドシート「投稿プロンプト」C列 | コード修正不要 |
| コンパナの口調・哲学 | スプレッドシート「キャラクター」シート | **SSOT(唯一の真実)** |
| 政策金利・要人情報 | スプレッドシート「確定データ」シート | コード修正不要 |
| Claudeモデルの変更 | config.gs | CLAUDE_MODEL変数 |
| **新規**: ScriptProperties の設定 | setupDisableFactCheck.gs + setupUseV13Validation.gs | ヘルパー実行 |

### 3-2. buildPrompt_ の構造(v13.0 Phase 6 再設計版)

Phase 6 で以下を再構成済み:

| ブロック | セクション数(旧) | セクション数(v13.0) | 削除された旧セクション |
|---|---|---|---|
| スタイル情報(冒頭) | 19 | 19 | 変更なし |
| データ(中盤) | 11 | **13** | +ダウ理論(日足・週足) |
| 投稿タイプ指示(中盤) | 12 | **11** | -【レートデータの使い方】(S3統合) |
| 学び・フィードバック | 4 | 4 | 変更なし |
| スタイル再掲(中盤) | 8 | 8 | 変更なし |
| フォーマットルール(後半) | 11 | **7** | -【フォーマット構造】【絵文字の位置】【投稿の構造】【絵文字行と→行の書き分け】(S4統合) / +【投稿フォーマット】 |
| 最重要(末尾) | 3 | **4** | +【★★★Before/After】(S1新設) |

### 3-3. 修正時のルール(v13.0 で追加)

- 修正対象のファイルだけ出力・差し替えすればOK
- 正規表現で `\b` は使わない(二重小数点バグの原因)
- `\s` は改行を含む → 行頭処理は `[ \t]+` を使う
- 新しい後処理を追加する前に既存チェーンへの影響を検証すること
- 設計図・設計書は内容が変わるたびにバージョン番号を上げること
- **★v13.0 追加**: 検証層を足す前に根本原因を疑え(肥大化ループ回避)
- **★v13.0 追加**: 新機能は必ず並行稼働フラグで切り替え可能に(ロールバック容易)
- **★v13.0 追加**: キャラクター定義はスプレッドシートがSSOT。コード側で重複注入しない
- **★v13.0 追加**: プロンプト末尾が最も効く。重要な指示は末尾に置く

### 3-4. 役割分担(v13.0 更新)

| 場所 | 仕事 |
|------|------|
| C列プロンプト | 各タイプの「役割」と「文字数」だけ |
| キャラクターシート | **SSOT: 口調・哲学・禁止事項(コード側で重複注入しない)** |
| promptBuilder.gs | 構造ルール + データ注入 + **Before/After 実例 + 最終確認(末尾)** |
| **validationV13.gs** | **★v13.0核心: 総合検証(Q1-Q8) + 修正適用(5種類)** |
| qualityReview.gs | **文字数保証(trimToCharMax_)のみ**。検証本体はvalidationV13.gsへ |
| factCheck.gs | **無効化中(Phase 5で削除予定)** |
| スプレッドシート確定データ | **真実のアンカー(通貨強弱・レート・金利・要人)** |
| スプレッドシート継続中重大事象 | 地政学リスクの真実のアンカー |

原則: **確定データ > AI推論**。1つの仕事は1つの場所で定義。

---

## 4. 依存関係図(v13.0・最新版)

```
generatePost(geminiApi.gs - 司令塔)
  │
  ├── レート取得
  │     fetchLatestRates_(rateManager.gs)
  │     getLatestRatesFromCache_(rateManager.gs)
  │     saveRatesToSheet_(rateManager.gs)
  │
  ├── プロンプト構築(★v13.0 Phase 6 再設計)
  │     buildPrompt_(promptBuilder.gs・2,205行)
  │       ├── getCharacterPrompt()(sheetsManager.gs)← SSOT
  │       ├── calculateRateDirection_(marketAnalysis.gs)
  │       ├── detectHotPair_(marketAnalysis.gs)
  │       ├── fetchMarketNews_(marketAnalysis.gs)← Claude web_search
  │       ├── analyzePriceHistory_(marketAnalysis.gs)
  │       ├── fetchIndicatorResults_(indicatorManager.gs)
  │       ├── formatIndicatorPreview_(indicatorManager.gs)
  │       ├── ★getDowTheorySummary_(rateManager.gs)← v13.0 S6 新規呼び出し
  │       ├── fetchCommodityPrices_(rateManager.gs)
  │       ├── getTodayAnomalies / getNextWeekAnomalies(anomalyManager.gs)
  │       ├── buildMarketTypePolicy_(promptBuilder.gs)
  │       ├── buildKnowledgePolicy_(promptBuilder.gs)
  │       ├── buildIndicatorPolicy_(promptBuilder.gs)
  │       ├── buildWeekendPolicy_(promptBuilder.gs)
  │       ├── buildRulePolicy_(promptBuilder.gs)
  │       ├── getLearningLog_(promptBuilder.gs)
  │       ├── getQualityFeedback_(promptBuilder.gs)
  │       ├── getHypothesisContext_(promptBuilder.gs)
  │       ├── buildFormatRules_(promptBuilder.gs・Phase 6 再設計済み)
  │       ├── ★buildBeforeAfterExamples_(promptBuilder.gs)← v13.0 S1 新規
  │       ├── getPolicyRatesText_(config.gs)
  │       └── getWorldLeadersText_(config.gs)
  │
  ├── Claude 市場分析(geminiApi.gs L820付近)
  │     analyzeMarketWithClaude_(Claude Sonnet 4.6)
  │       ├── detectHotPair_(marketAnalysis.gs)
  │       ├── fetchCommodityPrices_(rateManager.gs)
  │       ├── ★getDowTheorySummary_(rateManager.gs)← v12.1.1 から利用
  │       └── CacheService.get('market_news_v3')
  │     → 分析結果をプロンプトに【🔥市場分析】として注入
  │
  ├── テキスト生成(Claude)
  │     callClaudeGenerate_(geminiApi.gs)
  │     Claude Sonnet 4.6 がプロンプトに従ってライティング
  │
  ├── 後処理チェーン(postProcessor.gs・12段階)
  │     改行整形・Markdown除去・禁止表現・ハッシュタグ生成・孤立短文除去
  │
  └── ★v13.0 総合検証(validationV13.gs)
      ├── USE_V13_VALIDATION=true 分岐(geminiApi.gs)
      │
      ├── ★v13.0.4 二重実行防止ガード(180秒・ScriptProperties)
      │
      ├── Stage 1: Claude 総合レビュー(max_tokens 8192・Web検索5回まで)
      │   ├── Q1-Q5 品質(v13.0.6-7 で文末未完結・アナリスト調を error 化)
      │   ├── Q6 事実検証
      │   ├── Q6.5 論理整合性
      │   ├── Q7 絵文字行の体言止め
      │   └── ★Q8 構造整合性(v13.0.8 新設)← 鉤括弧・→・絵文字チェック
      │
      ├── Stage 2: 修正適用(必要なもののみ実行)
      │   ├── 修正1: 論理矛盾 → Claude 再生成
      │   ├── 修正2: 事実誤り → 機械置換
      │   ├── 修正3: Web検証NG → 該当行削除
      │   ├── 修正4: WARN → Claude 修正
      │   └── 修正5: 品質error → Claude 一括修正
      │         ★キャラクターシート全文を末尾注入(v13.0.2・SSOT)
      │
      ├── 文字数保証(qualityReview.gs trimToCharMax_)
      │   ★v13.0.8 鉤括弧保護ロジック
      │
      ├── ★v13.0.8 構造警告チェック(detectStructureBreaks_)
      │   機械的に鉤括弧・→・絵文字の破綻を検出(最後の砦)
      │
      ├── 対話型検証(interactiveVerify.gs・Step 1-4)
      │
      └── アダプタ層 → 既存フォーマットでログ保存(v13.0 互換性維持)
```

---

## 5. 外部ファイルからの呼び出し一覧(v13.0 更新)

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
| **★setUseV13ValidationTrue / False** | **setupUseV13Validation.gs** | **カスタムメニュー(フラグ切替)** |
| **★setDisableFactCheck** | **setupDisableFactCheck.gs** | **カスタムメニュー(設定)** |

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

### ★v13.0 新規: validationV13.gs から呼ばれる関数

| 関数名 | 分割先 | 用途 |
|--------|--------|------|
| callClaude_ | qualityReview.gs | Claude API 呼び出し(共通) |
| trimToCharMax_ | qualityReview.gs | 文字数保証(鉤括弧保護付き) |
| applyPostProcessingChain_ | postProcessor.gs | 後処理再適用 |
| collectAnchorData_ | geminiApi.gs | 確定データ収集 |
| getCharacterPrompt | sheetsManager.gs | キャラクターシート取得(SSOT) |
| cacheTodayPost_ | qualityReview.gs | 投稿キャッシュ |

### ★v13.0 新規: geminiApi.gs から呼ばれる関数

| 関数名 | 分割先 | 用途 |
|--------|--------|------|
| executeV13Validation | validationV13.gs | v13.0 総合検証のエントリポイント |

---

## 6. 既知の技術的注意事項(v13.0 更新)

### GASの読み込み順序(アルファベット順・27ファイル)

```
anomalyManager.gs → applyPairColors.gs → approval.gs → calendarManager.gs
→ config.gs → factCheck.gs → geminiApi.gs → imageGenerator.gs
→ indicatorManager.gs → interactiveVerify.gs → learningManager.gs → main.gs
→ marketAnalysis.gs → postProcessor.gs → priceSummary.gs → promptBuilder.gs
→ qualityReview.gs → rateManager.gs → scheduler.gs → setupDisableFactCheck.gs
→ setupUseV13Validation.gs → sheetsManager.gs → testFunctions.gs
→ testPostProcessor.gs → utils.gs → validationV13.gs → xApi.gs
```

### 重複関数(★v12.0で解決済み・v13.0 で新たな重複なし)

v13.0 では既存関数との衝突なし。validationV13.gs は独立した関数群で、既存の qualityReview.gs 等の関数を呼ぶ形。

### グローバル変数(v13.0 で追加なし)

| 変数名 | ファイル | 備考 |
|--------|---------|------|
| REVERSE_INDICATORS | indicatorManager.gs | isReverseIndicator_の直前に定義 |
| MARKET_INDICATORS | config.gs | 重要指標リスト |
| その他の定数 | config.gs | CURRENCY_PAIRS, POST_TYPES, SCHEDULE, JAPAN_HOLIDAYS, **DAILY_RATE_COLS**(SH/SL列含む) |

### ★v13.0 ScriptProperties(追加)

| キー | 値 | 用途 |
|---|---|---|
| **USE_V13_VALIDATION** | true | **v13.0 総合検証を有効化** |
| DISABLE_FACTCHECK | true | factCheck 無効化(v12.10〜) |
| INTERACTIVE_VERIFY_ENABLED | true | Step 4 対話型検証(v12.7〜) |
| POST_MODE | manual | 承認メール経由 |

---

## 7. v13.0 の設計原則(新設・今後の開発指針)

### 7-1. 検証層を足さない

問題出るたびにルール/層を追加するループに入ったら止める。根本構造を再設計する。

**悪例**: v12.10 まで「問題→検証層追加→別の問題→また追加」で4段検証に肥大化。

**良例**: v13.0 で2段検証に統廃合し -43% のAPI削減。

### 7-2. 生成時点で対処する

検証で直すより、生成時点で間違えないプロンプトを作る。

**悪例**: validationV13.gs で間違いを検出 → Claude に修正依頼 → リトライ。

**良例**: promptBuilder.gs に Before/After 実例を入れて、最初から正しく生成させる。

### 7-3. few-shot > 禁止指示

LLMは「こう書け」の実例に強く反応する。

**悪例**: 「アナリスト調は禁止」とだけ書く。

**良例**: 「NG: 〜の局面 / OK: 〜とこですね」の8組を提示。

### 7-4. プロンプト末尾が最強

Claude は最後に見た指示を最優先する。

**悪例**: 重要な指示を中盤に置く → データの海に埋もれて効かない。

**良例**: ★★★最終確認・Before/After 実例を末尾に配置。

### 7-5. SSOT(Single Source of Truth)

キャラクター定義はスプレッドシートが唯一。

**悪例**: コード内に固定文字列で口調定義を書く → スプシと乖離。

**良例**: getCharacterPrompt() でスプシから取得 → 修正はスプシ1箇所のみ。

### 7-6. 並行稼働フラグで即ロールバック

新機能は必ずフラグで切り替え可能に。

**悪例**: 直接上書きして新機能をリリース → 問題発生時に戻せない。

**良例**: USE_V13_VALIDATION=true で v13.0 有効化。false で即座に v12.10 動作。

### 7-7. 疲れたら止まる

疲労した状態でコードに変更を加えるとバグを生む。

**悪例**: 「すぐ直したい」衝動で夜中に大改修 → 朝に後悔。

**良例**: シミュレーション書き出し → 一晩寝かせる → 冷静に判断。

### 7-8. 多層防御で想定外をガード

1層のチェックでは必ず取りこぼす観点がある。

**悪例**: validationV13.gs の Q1-Q7 だけに頼る → 鉤括弧破綻を見逃す。

**良例**: v13.0.8 の3段防御(予防・検出・保護)で多層化。

---

## 8. 今後のロードマップ(v13.0 完成後)

### Phase 4: 観察期間(2026-04-20〜・1-2週間)

- v13.0 の本番動作安定性確認
- 毎日の投稿ログ観察
  - プロンプト総文字数(約20,800字前後)
  - セクション数(約65個前後)
  - 鉤括弧破綻の発生有無(**ゼロであるべき**)
  - Claude API 呼び出し(約4回/投稿)
  - 実行時間(約2分18秒)

### Phase 5: 古いコード削除(Phase 4 完了後)

削除候補:
- factCheck.gs(v12.10以降無効化中): 533行
- qualityReview.gs の一部関数(v13.0で置換済み)
- 旧 executeQualityReviewChain_ の一部
- 削減見込み: 約 -1,000行(26,500行 → 25,500行)

### Phase 6 残タスク(新チャットで継続)

- **S5 キャラクターシート末尾再注入**: S1-S6 の効果観察後に判断
- **統合案B(TC関連6→1)**: スプレッドシート側の手動編集が必要

### promptBuilder.gs 分割の再評価

- 2,800行超過したら分割検討
- Premium AI機能追加時に必ず再評価

---

## 9. 関連ドキュメント

| ドキュメント | 役割 |
|---|---|
| TCAX_設計書_v13_0.md | 設計思想・アーキテクチャ詳細 |
| TCAX_全体設計図_v13_0.md | システム全体像 |
| TCAX_REFERENCE.md | 事件簿(事件6: v13.0) |
| TCAX_v13_検証統廃合_シミュレーション_v1_2.md | v13.0 設計根拠・時系列全記録 |
| promptBuilder_再設計_シミュレーション_v1_0.md | Phase 6 設計根拠 |
| TCAX_引き継ぎプロンプト_2026-04-19.md | 新チャット引き継ぎ資料 |

---

*作成日: 2026-03-23 | 最終更新: 2026-04-19 深夜 v3.0 v13.0完成版反映*  
*27ファイル・約26,500行・validationV13.gs 核心・v13.0.8 構造整合性3段防御・Phase 6プロンプト再設計*  
*TCAX v13.0 を支える全ファイル構成と依存関係の決定版ドキュメント*
