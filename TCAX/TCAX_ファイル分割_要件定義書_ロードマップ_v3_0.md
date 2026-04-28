# TCAX ファイル分割 要件定義書・ロードマップ v3.0(完了版)

**発行日**: 2026-04-24
**前版**: v2.3(2026-04-22 時点・計画段階)
**性格**: Phase R-1〜R-5 全実装完了の**完了記録**ドキュメント

---

## 0. v3.0 の位置づけ

v2.3 時点では「3大ファイル(geminiApi.gs・promptBuilder.gs・postProcessor.gs)を分割する計画」だった。本 v3.0 は **その計画が全て実施完了し、さらに Phase R-4(セクション整理)・R-5(構造再編)まで到達した完了版**として発行する。

---

## 1. Phase R シリーズ完了状況

### 1-1. 全Phase一覧

| Phase | 対象 | 状態 | 実施日 |
|---|---|---|---|
| **R-1** | geminiApi.gs 分割 | **完了** | 2026-04-23 |
| **R-2** | promptBuilder.gs 切り出し | **完了** | 2026-04-23 |
| **R-3** | postProcessor.gs 分割 | **完了** | 2026-04-23 |
| **R-3 追加修正** | 定数移動漏れ復元 | **完了** | 2026-04-23 |
| **R-4** | プロンプトセクション統合 | **完了** | 2026-04-23 |
| **R-5** | buildPrompt_ 構造再編 | **完了** | 2026-04-23 |
| R-6(将来) | validationV13.gs 分割 | 保留 | Phase 5 と同時に検討 |

### 1-2. 全体サマリ

計画時(v2.3): 3大ファイル分割 → 実施時: **5つの Phase R + 1つの修正作業に拡大**

理由:
- 分割後にプロンプト内部の冗長さが可視化されセクション統合(R-4)の必要性が明確化
- Phase 8(Prompt Caching)導入の前提として構造再編(R-5)が必須
- 分割時の移動漏れ(定数2件)が本番テストで発覚し緊急修正

---

## 2. Phase R-1: geminiApi.gs 分割(完了)

### 2-1. 成果

元 1,973行 → 5ファイル(合計 2,038行・関数15個)

| ファイル | 行数 | 関数数 | 役割 |
|---|---|---|---|
| geminiApi.gs(残) | 500 | 1 | Phase A メインフロー(generatePost) |
| reviewOrchestrator.gs | 427 | 5 | 品質レビューチェーン調停 |
| claudeApi.gs | 529 → 600(Phase 8で拡張) | 4 | Claude API ラッパ + 市場分析 + 最終事実検証 |
| llmApi.gs | 117 | 2 | Gemini API ラッパ |
| anchorDataCollector.gs | 465 | 3 | 確定データ収集 |

**削減率(geminiApi.gs 本体)**: 74.6%

### 2-2. 検証結果

- 構文チェック: 全ファイル PASS
- 関数一覧比較: 元ファイルと完全一致(15関数)
- 依存関係: 未解決呼び出しなし
- 本番テスト: Phase A → B → C 完走、タイムアウトなし

---

## 3. Phase R-2: promptBuilder.gs 切り出し(完了)

### 3-1. 成果

元 2,505行 → 4ファイル

| ファイル | 行数 | 役割 |
|---|---|---|
| promptBuilder.gs(残) | 624 → 659(R-4/R-5 + Phase 8で微増して最終669) | buildPrompt_ 本体 |
| promptSources.gs | 919 | 材料収集系関数(Sheetsアクセス) |
| promptPolicies.gs | 820 → 845(R-4で微増) | ポリシー系関数(buildFormatRules_ 等) |
| hotTopicSelector.gs | 253 | ホットトピック選定(selectHotTopic_) |

### 3-2. 設計判断: buildPrompt_ 内部の詳細分解は見送り

**理由**:
- buildPrompt_ 内部で 75個のローカル変数が複雑に交錯
- 関数分割すると引数リストが膨大化(5〜10引数)
- 単一責任原則より「ローカル変数交錯リスクの回避」を優先

この判断は後の Phase R-5(構造再編)の着地に有利に働いた。

---

## 4. Phase R-3: postProcessor.gs 分割(完了)

### 4-1. 成果

元 2,188行 → 4ファイル

| ファイル | 行数 | 役割 |
|---|---|---|
| postProcessor.gs(残) | 83 | エントリポイント(applyPostProcessingChain_) |
| textCleanup.gs | 1,310 | テキストクレンジング(13関数) |
| postFinalizer.gs | 348 → 371 → 402(Phase 9 v1.0) | 最終化(ハッシュタグ動的可変運用・TC言及除去等) |
| rateSanitizer.gs | 472 | レート関連サニタイズ |

### 4-2. 分割方針

postProcessor.gs の責務が以下4つに分かれていたため、機能別に分離:

1. 外国語・不要テキスト除去(textCleanup.gs)
2. レート数値の清掃・検証(rateSanitizer.gs)
3. 最終化処理(postFinalizer.gs)
4. チェーン実行の統括(postProcessor.gs・残)

---

## 5. Phase R-3 追加修正: 定数移動漏れ(完了)

### 5-1. 問題発覚

Phase R-4/R-5 実装後の本番テスト(2026-04-23 夜)で以下のエラーが発覚:

```
⚠️ 市場ニュース取得エラー（スキップ）: FUTURE_INTENT_KEYWORDS is not defined
⚠️ 市場ニュース取得エラー（スキップ）: PAST_TENSE_KEYWORDS is not defined
```

### 5-2. 原因

Phase R-3 で postProcessor.gs → postFinalizer.gs に `isFutureDatePastTenseLine_` 関数を移動したが、その関数が使う2つの定数が別の位置にあり、移動漏れしていた。

| 定数名 | 元位置(postProcessor.gs) | キーワード数 |
|---|---|---|
| PAST_TENSE_KEYWORDS | 1941行 | 30 |
| FUTURE_INTENT_KEYWORDS | 1962行 | 21 |

### 5-3. 修正

postFinalizer.gs の isFutureDatePastTenseLine_ 関数直前(231行目付近)に、両定数を復元。

**ファイル変更**: postFinalizer.gs +23行(348 → 371)

### 5-4. 教訓(TCAX_REFERENCE.md IV-13 に記録)

ファイル分割時のチェックリスト:

1. 作業前に `grep -n "^var [A-Z_]\+\s*=" 分割元.gs` で全定数をリストアップ
2. 移動対象の関数内で `grep -oE "[A-Z_]{3,}" 関数本体` で参照識別子を抽出
3. 両リストを突合し、関数が使う定数を全特定
4. 関数と定数をセットで移動する
5. 移動後、エラーログで「is not defined」が出ていないことを確認

---

## 6. Phase R-4: プロンプトセクション統合(完了)

### 6-1. 背景

Phase R-1〜R-3 完了後、プロンプト内に **75セクション** が並列配置されていることが発覚。類似テーマが分散しており、Claude の attention が集中しない状態。

### 6-2. 採用した統合案(v2.0 確定版)

Q1〜Q4 シミュレーションで最適化した結果:

| 統合案 | 内容 | セクション削減 |
|---|---|---|
| **B** | 禁止事項統合(即やり直し + 抽象描写禁止 + 低ボラ日 + TC言及禁止 → 1) | -3 |
| **C** | 方針統合(市場系の方針 + ストーリー主導 → 1) | -1 |
| **D** | 事実・論理統合(事実論理数値 + 環境認識 + 因果チェーン → 1) | -2 |
| **E** | 仮説構造化(仮説ベース + 構造仮説 + 今日の仮説 → 1) | -2 |
| **Stage 1.5** | 最優先ルール9(口調)を独立・上位化 | 0(位置変更) |
| **Stage 3-2** | 【参考: 現在のレート】3パターン → 1 | 0(名称統一) |

### 6-3. 見送った案

- **Q1 統合案A(ルール統合)**: 不採用・行動規範と書式規則は性質が違う
- **Q2 統合案F(トーン統合)**: 不採用・few-shot と指示は役割が違う
- **Q3 Stage 2(構造再編)**: Phase R-5 として切り出し

### 6-4. 効果(本番実測)

| 指標 | Phase R-4 前 | Phase R-4 後 | 削減 |
|---|---|---|---|
| セクション数 | 75個 | **66個** | **-9(-12%)** |
| プロンプト文字数 | 29,309字 | **23,665字** | **-5,644字(-19%)** |

**ファイル変更**: promptPolicies.gs 820→845行・promptBuilder.gs 620→624行

---

## 7. Phase R-5: buildPrompt_ 構造再編(完了)

### 7-1. 背景

Phase 8(Prompt Caching)導入には「静的プレフィックス → 動的サフィックス」の順序構造が必要。現状は交互配置で最長連続静的ブロックが 約6,000字に留まっていた。

### 7-2. 採用したアプローチ(v2.0 確定版)

**アプローチA: 二段階組み立て**
- `var staticPart` と `var dynamicPart` の2変数を用意
- 109箇所の `prompt += ` を振り分け: 静的34 / 動的78
- 末尾に【★再確認(最終チェック)】2項目版を追加
- `var prompt = staticPart + dynamicPart` で連結

### 7-3. 実装上の重要発見

**「コードの実行順を変えなくても、staticPart/dynamicPart の2変数に振り分けるだけで、最終的な `staticPart + dynamicPart` で静的→動的の順序が得られる」**

この発見により:
- ローカル変数75個の参照タイミングリスクを完全回避
- 当初4セッション想定が**1セッションで完了**
- リスクが極小化

### 7-4. Q1〜Q4 判断の最適解

| 質問 | v1.0 想定 | v2.0 確定 |
|---|---|---|
| Q1: アプローチ | A(二段階組み立て) | **A確定** |
| Q2: 末尾再確認マーカー | 4項目版 | **C案(2項目版)に変更**(attention分散回避) |
| Q3: 情報ソース位置 | 検討中 | **静的化** |
| Q4: postPrompt位置 | 検討中 | **静的化**(リトライ時キャッシュヒット期待) |

### 7-5. 効果(本番実測)

| 指標 | Phase R-5 前 | Phase R-5 後 |
|---|---|---|
| buildPrompt_ 行数 | 624 | 659 |
| 最長連続静的ブロック | 約 6,000字 | **15,335字(+156%)** |
| staticPart 文字数 | - | **15,335字** |
| dynamicPart 文字数 | - | 約 8,330字(市場分析注入前) |

**ファイル変更**: promptBuilder.gs 624→659行(+35行・ヘッダ更新含む)

### 7-6. Phase 8 への引き継ぎ

- staticPart が独立変数として存在 → cache_control 設定位置が明確
- dynamicPart 先頭への市場分析注入で staticPart を保護可能
- Phase 8 実装の前提条件が整備完了

---

## 8. 分割後のファイル構成(v3.0 時点・**38本**)

### 8-1. カテゴリ別一覧

**[カテゴリA] プロンプト・AI関連(11本・Phase R で整理済み)**

| ファイル | 現在行数 | Phase R 変化 |
|---|---|---|
| validationV13.gs | 1,501 | Phase 7 で +30行(Step 0.5 追加) |
| promptSources.gs | 919 | R-2 で切り出し |
| promptPolicies.gs | 845 | R-2 切り出し + R-4(統合案 B/C/D/E) |
| promptBuilder.gs | 669 | R-2(切り出し)+ R-4 + R-5(二段階構造)+ Phase 8 |
| claudeApi.gs | 600 | R-1(切り出し)+ Phase 8 キャッシュ対応 |
| geminiApi.gs | 505 | R-1 切り出し + Phase 8(promptObj 対応) |
| anchorDataCollector.gs | 503 | R-1 で切り出し |
| reviewOrchestrator.gs | 427 | R-1 で切り出し |
| hotTopicSelector.gs | 253 | R-2 で切り出し |
| llmApi.gs | 117 | R-1 で切り出し |
| marketAnalysis.gs | 未実測 | - |
| qualityReview.gs | 未実測 | v13.0 前の旧ロジック(移行中) |

**[カテゴリB] 後処理・検証(8本・Phase R-3 で分割)**

| ファイル | 現在行数 | Phase R 変化 |
|---|---|---|
| textCleanup.gs | 1,310 | R-3 で切り出し |
| rateSanitizer.gs | 472 | R-3 で切り出し |
| postFinalizer.gs | 402 | R-3 切り出し + 定数復元(PAST_TENSE/FUTURE_INTENT) + Phase 9 v1.0 ハッシュタグ動的可変運用(2026-04-24) |
| postProcessor.gs | 83 | R-3 でエントリのみに |
| interactiveVerify.gs | 未実測 | 対話型検証 Step 4 |
| learningManager.gs | 未実測 | 学びログ管理 |
| anomalyManager.gs | 未実測 | アノマリー判定 |
| factCheck.gs | 未実測 | DISABLE_FACTCHECK=true で無効化中 |

**[カテゴリC] システム統括・データ層(14本)**

main.gs / config.gs / sheetsManager.gs / scheduler.gs / imageGenerator.gs / xApi.gs / approval.gs / applyPairColors.gs / rateManager.gs / priceSummary.gs / calendarManager.gs / indicatorManager.gs / utils.gs / (他内部)

**[カテゴリD] テスト・セットアップ(5本)**

| ファイル | 行数 |
|---|---|
| testFunctions.gs | 903 |
| testPostProcessor.gs | 未実測 |
| testInteractiveVerify.gs | 未実測 |
| setupDisableFactCheck.gs | 未実測 |
| setupUseV13Validation.gs | 107 |

### 8-2. 健全性判定

| 判定基準 | 該当ファイル |
|---|---|
| 緊急(2,000行超) | **0件** ✅ |
| 要監視(1,500行超) | validationV13.gs(1,501行)1件 |
| 許容(1,000行超) | textCleanup.gs(1,310行)1件 |
| 健全(1,000行未満) | 他全て |

### 8-3. 総合規模

- ファイル数: **38本**
- 実測済み15ファイルの合計: **9,478行**
- 全38ファイルの推定合計: **約 28,000 〜 30,000行**

---

## 9. Phase R-6(将来): validationV13.gs 分割

### 9-1. なぜ今やらないか

- validationV13.gs は現状 1,501行で「要監視」レベルだが緊急ではない
- 機能的に密結合(品質検証 + 修正系)
- Phase 5(プロンプト自動進化)実装時に追加機能(ログ分析・改善案生成)が入る可能性大
- **Phase 5 と同時に R-6 を実施する方が効率的**

### 9-2. 想定する分割(将来の参考)

| 想定ファイル | 行数予想 | 責務 |
|---|---|---|
| validationV13.gs(残) | 約 300 | メイン統制(executeValidationV13_ / runComprehensiveReview_) |
| reviewPromptBuilder.gs | 約 230 | プロンプト構築(buildComprehensiveReviewPrompt_) |
| reviewResponseParser.gs | 約 100 | JSON パース(parseComprehensiveReviewResponse_) |
| reviewFixes.gs | 約 310 | 修正系(applyLogicalFix_ 他) |
| reviewLogger.gs | 約 190 | ログ記録 |

**実施タイミング**: Phase 5 の設計段階で判断(2026-05〜06月頃)

---

## 10. 総合効果(Phase R 全完了時点)

### 10-1. コードベース全体

| 指標 | Phase R 前 | Phase R 後 | 変化 |
|---|---|---|---|
| ファイル数 | 約 23本 | **38本** | +15本(元ファイル 3本 → 13本に増加し、他の既存ファイルも含めて合計 38 本) |
| 最大ファイル行数 | 2,505行(promptBuilder) | **1,501行**(validationV13) | -1,004行 |
| 2,000行超のファイル | 3個 | **0個** | ✅ 解消 |
| 1,500行超のファイル | 5個 | **1個** | -4 |

### 10-2. プロンプト

| 指標 | Phase R 前 | Phase R 後 | 変化 |
|---|---|---|---|
| セクション数 | 75個 | **66個** | -9(-12%) |
| 総文字数 | 29,309字 | **23,665字** | -5,644(-19%) |
| 最長連続静的ブロック | 約 6,000字 | **15,335字** | +9,335(+156%) |

### 10-3. 運用安定性

| 指標 | Phase R 前 | Phase R 後 |
|---|---|---|
| タイムアウト発生率 | 約 15% | **0%**(Phase 6 以降) |
| プロンプト内の重複指示 | 多数 | 解消 |
| ローカル変数の可読性 | 複雑 | 改善 |
| 各ファイルの単一責任 | 不徹底 | 達成 |
| バックアップ | なし | 全Phase分保存 |

---

## 11. 残タスク(v3.0 時点)

### 11-1. 直近(今週〜2週間)

- M3 運用観察期間の継続
- Phase 8 v2.0 の実運用コスト実測

### 11-2. 中期(2026-05月)

- Phase 5(プロンプト自動進化)の要件定義着手
- Phase R-6(validationV13.gs 分割)の検討開始

### 11-3. 長期(2026-06月)

- Phase 5 実装完了
- 「完全自動学習型システム」としての完成

---

## 12. 教訓総括

Phase R シリーズを通じて得られた重要な教訓:

1. **分割対象ファイル全体で定数定義を先にリストアップ**(IV-13)
2. **コードの実行順を変えずに、変数振り分けだけで順序変更できる場合がある**(R-5 の発見)
3. **単一責任より可変要素のリスク回避が優先される場合がある**(R-2 の内部分解見送り判断)
4. **本番テストでのエラーログは必ず検証する**(catch スキップで隠れる R-3 の移動漏れ)
5. **要件定義 v1.0 → Q1〜Q4 シミュレーション → v2.0 確定**の流れは有効なプロセス

---

## 13. バージョン履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v1.0 | 2026-04-15 | 初版・3大ファイル分割計画 |
| v1.2 | 2026-04-18 | Phase 分類と優先度整理 |
| v2.0 | 2026-04-20 | 運用停止を前提とする計画書に昇格 |
| v2.3 | 2026-04-22 | Phase R-1 着手直前・シミュレーション結果反映 |
| **v3.0** | **2026-04-24** | **Phase R-1〜R-5 全完了版・Phase R-6 は Phase 5 時に保留** |

---

## 14. 参照ドキュメント

- TCAX_運用停止_リファクタリング計画書_v3_0_完了版.md(Phase R 詳細記録)
- TCAX_Phase_R-4_セクション整理_要件定義書_v2_0.md(R-4 採用版)
- TCAX_Phase_R-5_buildPrompt構造再編_要件定義書_v2_0.md(R-5 採用版)
- TCAX_Phase_8_Prompt_Caching導入_要件定義書_v2_0.md(Phase 8 採用版)
- TCAX_REFERENCE.md v1.4(事件13〜15・IV-13/IV-14)
- TCAX_設計書_v14_1.md
- TCAX_全体設計図_v14_1.md
- TCAX完全自動学習型システム_要件定義書_v2_6.md(Phase 5 への道筋)

---

*本 v3.0 は「ファイル分割計画」としては最終版。次の大きな分割作業は Phase R-6(validationV13.gs)のみで、それも Phase 5 実装と同時に判断する。*

---

## 【2026-04-24 追記】Phase 9 v1.0 ハッシュタグ動的可変運用 完了

Phase R 全完了後の追加変更として、`postFinalizer.gs` に Phase 9 v1.0(ハッシュタグ動的可変運用)を適用した。**ファイル分割計画自体には影響しない**が、本ロードマップの 8-1 カテゴリ別一覧・8-3 総合規模に記載の postFinalizer.gs 行数(371 → 402)を更新したため、記録として追記する。

**変更概要**:
- 旧仕様: 毎投稿に最大3個のハッシュタグ(#FX 固定 + イベント + 通貨ペア)
- 新仕様: 平常時0個・重要イベント当日1個のみ(#FOMC / #日銀 等)
- 削除: `countPairTag_` 関数(通貨ペア検出廃止)
- 新規: `getImportantEventTag_` / `determinePrimaryEventTag_`

**根拠**: 2026年 X アルゴリズム最新動向レポート。詳細は `ハッシュタグ動的可変運用_要件定義書_v1_0.md` 参照。

*更新日: 2026-04-24 | v3.0 完了版*
