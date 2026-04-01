# T-CAX 引継ぎプロンプト（2026-03-26）

## セッション情報
- **前回セッション**: 2026-03-26
- **設計図**: **v8.10**（v8.9から更新） / **設計書**: **v7.6**（v7.5から更新）
- **GASファイル**: 21本、合計約15,800行

## 前回セッションで完了した作業（9件）

| No | 課題 | 対象ファイル | 状態 |
|----|------|-------------|------|
| 1 | 未発表指標の仮説答え合わせ防止（対策A: プロンプト層） | promptBuilder.gs | ✅ v8.9 |
| 2 | 未発表指標の仮説答え合わせ防止（対策B: コード層） | promptBuilder.gs | ✅ v8.9 |
| 3 | 重複コメント除去（6箇所） | postProcessor.gs + promptBuilder.gs | ✅ v8.9 |
| 4 | buildPrompt_分割リファクタリング（636行→391行） | promptBuilder.gs | ✅ v8.10 |
| 5 | 条件分岐型仮説ルール追加（6箇所） | promptBuilder.gs | ✅ v8.11 |
| 6 | charMax緩和（300→380/350→420/450→550） | config.gs | ✅ v8.12 |
| 7 | 答え合わせ重複防止（TOKYO/LUNCHで同じ答え合わせ繰り返し防止） | promptBuilder.gs | ✅ v8.12 |
| 8 | 品質レビュー改善（Claude指摘のみ→Gemini修正→コード文字数保証） | qualityReview.gs | ✅ v8.12 |
| 9 | 孤立短文除去（「です。」だけ残るバグ対策） | postProcessor.gs | ✅ v8.12 |
| 10 | ニュース主軸ルール追加（レート→ニュース優先に転換） | promptBuilder.gs | ✅ v8.13 |

## ★v8.11の変更（条件分岐型仮説）

### 問題
仮説が「失業保険悪化→ドル円159円割れ」のような一方向の賭けになり、外れると「読み違えた」で終わる。
フォロワーにとっても「外れたか…」で価値がない。

### 対策
仮説を「条件分岐型」に変更。結果そのものではなく「結果に対する市場の反応」を読む仮説を推奨。
6箇所のプロンプト指示を更新（buildMarketTypePolicy_、buildFormatRules_、getHypothesisContext_内）。

OK: 「強い数字なのにドルが売られたら、市場はインフレより景気後退を心配している証拠。素直にドル買いなら、まだインフレ退治モード」
NG: 「失業保険悪化ならドル円159円割れ」（一方向の賭け）

## ★v8.12の変更（品質管理の全面改善）

### 課題6: charMax緩和
文字数上限が厳しすぎて品質レビュー修正時に文が壊れる問題を解消。

| タイプ群 | 修正前 | 修正後 |
|---------|--------|--------|
| MORNING/GOLDEN/NY等 | 280-450 | 280-**550** |
| TOKYO/LUNCH/LONDON等 | 200-350 | 200-**420** |
| RULE系 | 200-300 | 200-**380** |

### 課題7: 答え合わせ重複防止
TOKYOとLUNCHで同じ仮説の答え合わせが繰り返される問題を解消。
getHypothesisContext_内で今日の過去投稿キャッシュ（getTodayPreviousPosts_）を照合し、
同じ仮説が含まれていたら「すでに答え合わせ済み。代わりに状況の変化を1文で触れろ」と指示。

### 課題8: 品質レビュー改善（最大の構造変更）
Before: Claudeが「指摘+修正テキスト」を1回のJSON出力で全部やる → 修正が雑、文が壊れる
After:
- Step 1: Claude → 指摘のみ（得意な仕事に集中。修正テキスト不要）
- Step 2: Gemini → Claudeの指摘に基づいて修正（テキスト生成が得意）
- Step 3: コード側 → trimToCharMax_で文字数最終保証（charMax超過なら末尾から行単位で削除）

### 課題9: 孤立短文除去
品質修正で文の前半が削除され「です。」だけ残るバグ対策。
removeOrphanedLines_を新設し、後処理チェーンに組み込み。
10文字以下の孤立行（絵文字行・→行・ハッシュタグ行を除く）を自動除去。

## ★v8.13の変更（ニュース主軸）

### 問題
レートや指標の数字ばかりが並び、投稿が面白くない。Bloombergのヘッドラインのようなホットな話題が主軸になっていない。

### 対策
buildMarketTypePolicy_とbuildFormatRules_で「投稿の主軸はニュース。レートはその裏付け」に優先順位を逆転。
- 📰ニュースTOP5から最もインパクトのある話題を1つ選び、投稿の核にする指示を追加
- 「世界で何が起きているか→為替にどう影響しているか」の順で語る構造に変更
- レート数字で始める投稿をNG例として明記
- promptBuilder.gs 1,749→1,759行

## ★v8.10の変更（buildPrompt_分割）

### 変更の本質
buildPrompt_（636行）から投稿タイプ別の方針指示を5つのヘルパー関数に切り出し、391行に縮小。
ロジックの変更はゼロ（prompt += を text += に変えて return text するだけ）。

### 切り出した5関数

| 関数名 | 行 | 対象タイプ |
|--------|-----|-----------|
| buildMarketTypePolicy_(postType, now) | 1379 | MORNING/TOKYO/LUNCH/LONDON/GOLDEN/NY/INDICATOR |
| buildKnowledgePolicy_(postType) | 1510 | KNOWLEDGE |
| buildIndicatorPolicy_(postType, keys) | 1532 | INDICATOR |
| buildWeekendPolicy_(postType, keys, rates) | 1572 | WEEKLY_REVIEW/WEEKLY_LEARNING/NEXT_WEEK/WEEKLY_HYPOTHESIS |
| buildRulePolicy_(postType, isRuleType) | 1664 | RULE_1/RULE_2/RULE_3/RULE_4 |

### buildPrompt_内の呼び出し（695行目付近）
```
prompt += buildMarketTypePolicy_(postType, now);
prompt += buildKnowledgePolicy_(postType);
prompt += buildIndicatorPolicy_(postType, keys);
prompt += buildWeekendPolicy_(postType, keys, rates);
prompt += buildRulePolicy_(postType, isRuleType);
```
該当しないタイプでは空文字を返すので、常に5関数を呼ぶだけ。

## ★v8.9の変更（未発表指標の答え合わせ防止）

### 問題
GOLDEN（20:57生成）が、21:30発表の「新規失業保険申請件数」を条件にした仮説について、
発表前なのに「159円台を維持」とレート結果だけで答え合わせしてしまった。

### 対策A（プロンプト層）
GOLDEN/NYの構造指示に「仮説の条件に含まれる経済指標がまだ■未発表なら、答え合わせは保留」ルールを追加。

### 対策B（コード層）
新関数 getUnreleasedIndicatorNames_() を追加。経済カレンダーの未発表指標を取得し、仮説テキストと照合。
マッチしたら「⚠️この指標はまだ未発表。答え合わせ禁止」警告をプロンプトに注入。

## v8.13で変更されたファイル（1ファイル）

| ファイル | v8.12 | v8.13 | 変更内容 |
|---------|-------|-------|---------|
| promptBuilder.gs | 1,749行 | 1,759行 | ニュース主軸ルール3箇所追加（+10行） |

## v8.12で変更されたファイル（4ファイル）

| ファイル | v8.11 | v8.12 | 変更内容 |
|---------|-------|-------|---------|
| config.gs | 556行 | 556行 | charMax緩和（16タイプ全て） |
| promptBuilder.gs | 1,722行 | 1,749行 | 答え合わせ重複防止（+27行） |
| qualityReview.gs | 332行 | 411行 | 品質レビュー全面改修（Claude指摘→Gemini修正→コード文字数保証）|
| postProcessor.gs | 1,832行 | 1,898行 | removeOrphanedLines_新設+重複コメント除去（+66行） |

## v8.11で変更されたファイル（1ファイル）

| ファイル | v8.10 | v8.11 | 変更内容 |
|---------|-------|-------|---------|
| promptBuilder.gs | 1,709行 | 1,722行 | 条件分岐型仮説ルール6箇所追加（+13行） |

## v8.9〜v8.10で変更されたファイル（2ファイル）

| ファイル | v8.8.1 | v8.9 | v8.10 | 変更内容 |
|---------|--------|------|-------|---------|
| postProcessor.gs | 1,837行 | 1,832行 | 1,832行 | v8.9で重複コメント除去。v8.10変更なし |
| promptBuilder.gs | 1,581行 | 1,650行 | 1,709行 | v8.9: 未発表指標チェック+重複除去。v8.10: buildPrompt_分割（5ヘルパー関数） |

## AIモデル使い分け（v8.8.1）

| 用途 | モデル | Grounding |
|------|-------|-----------|
| テキスト生成 | **Gemini 2.5 Pro** | ON |
| ファクトチェック | Gemini 2.5 Pro | ON |
| 自動修正 | Gemini 2.5 Pro | OFF |
| 品質レビュー | Claude Sonnet 4.6 | 不要 |

## 投稿パイプライン（v8.8.1）

```
① テキスト生成（Gemini 2.5 Pro + Grounding）
② 後処理チェーン（applyPostProcessingChain_）
③ リトライ群（executeRetry_共通関数で4パターン統合）
④ ファクトチェック（Gemini Grounding ON）
⑤ 検証不能❌即削除 + 修正可能❌をautoFix
⑥ 後処理チェーン再適用
⑦ 品質レビュー（Claude Sonnet 4.6: Q1〜Q5）
⑧ 品質修正→後処理チェーン再適用
⑨ 投稿キャッシュ保存→結果保存
```

## 設計の鉄則
- factCheckPost_はGrounding ON / autoFixPost_はGrounding OFF
- 正規表現で`\b`は使わない / `\s`は改行を含む → `[ \t]+`を使う
- 新しい後処理 → applyPostProcessingChain_内に追加するだけ
- 新しいリトライ → executeRetry_を使えばconfig/baseを渡すだけ
- scheduler.gsではトリガー設定を最優先
- T-CAX設計図・設計書は内容が変わるたびにバージョン番号を上げること
- ★v8.10: 投稿タイプ別の方針変更 → 5つのヘルパー関数内を修正（buildPrompt_本体を触らない）

## 投稿の鉄則（v8.8.1追加 + v8.9追加 + v8.11追加）
- 仮説は「非自明な読み」を出せ。当たり前の仮説は禁止
- レート数字の羅列は禁止。方向感で語れ
- 「エントリーした」「利確した」は禁止。「こう読んでいる」で表現
- 為替の裏にある人間社会・生活への影響にも触れる
- 仮説の答え合わせは正直に。外れた時こそ信頼を生む
- 絵文字行（📕📝💡）= 事実。→行 = 意見・人間味
- ★v8.9: 仮説の条件に未発表指標が含まれる場合、答え合わせ禁止。「結果次第」で書け
- ★v8.11: 仮説は「条件分岐型」で書け。「もしAならB、もしCならD」。一方向の賭けは禁止
- ★v8.13: 投稿の主軸は「ニュース」。レートや指標はその裏付け。数字の羅列で始めるな

## テスト関数（v8.8.1）

| 関数 | 内容 | 所要時間 |
|------|------|---------|
| testPro_MORNING() 等12個 | 各1タイプ | 約4分 |
| testRULE1_3() | RULE_1/2/3 | 約3分 |
| testRULE4() | RULE_4+WEEKLY_LEARNING | 約2分 |
| testWEEK() | NEXT_WEEK+WEEKLY_HYPOTHESIS | 約3分 |

## ファイル一覧（v8.13・21ファイル）

| ファイル | 行数 | 関数数 | 役割 |
|---------|------|--------|------|
| geminiApi.gs | 566 | 6 | 核: generatePost+executeRetry_+Gemini API通信 |
| promptBuilder.gs | 1,759 | 18 | プロンプト構築+ニュース主軸+仮説ベース構造+未発表指標チェック+答え合わせ重複防止+条件分岐型仮説+5ヘルパー関数 |
| postProcessor.gs | 1,898 | 22 | 後処理チェーン+removeOrphanedLines_ |
| factCheck.gs | 661 | 5 | ファクトチェック+自動修正 |
| qualityReview.gs | 411 | - | 品質レビュー（Claude指摘→Gemini修正→文字数保証） |
| config.gs | 556 | 7 | 設定値+GEMINI_MODEL(Pro)+charMax緩和済み |
| rateManager.gs | 812 | 12 | レート取得・保存・検証 |
| marketAnalysis.gs | 799 | 7 | 市場分析（通貨強弱・ニュース） |
| indicatorManager.gs | 1,191 | 20 | 経済指標の取得・解析 |
| learningManager.gs | 860 | 8 | 学び・仮説の抽出・検証 |
| priceSummary.gs | 643 | 5 | 価格サマリー集計 |
| calendarManager.gs | 803 | 7 | 経済カレンダー取得 |
| testFunctions.gs | 225 | 19 | テスト関数（testPro_*/testRULE/testWEEK） |
| imageGenerator.gs | 889 | - | AI画像生成+透かし |
| scheduler.gs | 552 | - | トリガー管理 |
| main.gs | 605 | - | カスタムメニュー+エントリポイント |
| sheetsManager.gs | 1,038 | - | スプレッドシート読み書き |
| approval.gs | 983 | - | 承認フロー+メール送信 |
| xApi.gs | 654 | - | X API v2投稿 |
| applyPairColors.gs | 225 | - | 通貨ペア色分け |
| utils.gs | 172 | - | ユーティリティ |

## 設計ドキュメント

| ドキュメント | バージョン |
|-------------|-----------|
| 全体設計図 | v8.13 |
| 設計書 | v7.9 |
| 品質改善要件定義書 | v1.4（最終版） |
| スプレッドシート仕様書 | v1.6 |
| ファイル分割要件定義書 | v1.9 |
| 投稿品質レビューシステム要件定義書 | v1.2 |
| 完全自動学習型システム要件定義書 | v1.7 |
| キャラクターシート | v2（5行統合版） |
| 投稿プロンプト | v3（仮説ベース+ファンダ重視+詳細ルール完全統合版） |
