# 完全自動学習型システム 要件定義書 v2.3

**対象**: X自動投稿システム（CompanaFXAutoPost / T-CAX）
**作成日**: 2026-03-04
**更新日**: 2026-04-18
**作成者**: コンパナ + Claude
**コンセプト**: 投稿すればするほど賢くなるシステム
**v2.3変更点（v12.10投稿品質総合改善を反映・2026-04-18）**:
  - ★factCheck 無効化フラグ導入: ScriptProperties DISABLE_FACTCHECK=true で Gemini factCheck / autoFix をスキップ。Claude品質レビュー + 最終事実検証 + 対話型検証の3段構成に簡素化
  - ★Q6.5 論理整合性チェック追加: 「事実は正しいが論理が矛盾」パターンを独立検出(qualityReview.gs +54行)
  - ★優先度付き修正プロンプト: Q6.5 > Q6 > Q5/Q7 > Q1/Q2/Q3 > Q4 の順に並べ替え
  - ★finalFactVerify 過剰修正防止: 時間軸を含む主張(週中高値・急落率等)はスナップショット値で反証しない
  - ★ニュース取得 Gemini → Claude web_search に全面切替: Gemini Grounding 検索スキップ問題を根絶
  - ★プロンプト肥大化対策: 92→68セクション・29,686→22,677字(-24%)
  - ★キャラクターシート改善: 【共感】5→1セクション統合 + 【軽さと勢い】追加 + 【禁止事項】具体エピソード禁止追加
**v2.2変更点（大幅更新・10日分の差分反映）**:
  - ★Claude主導アーキテクチャ（v12.4）: テキスト生成をGemini→Claudeに変更
  - ★Claude市場分析（v12.1）: analyzeMarketWithClaude_で通貨強弱・ペア変動・ニュースを分析
  - ★最終事実検証（v12.6）: finalFactVerify_で検出=Claude JSON、修正=コード置換
  - ★Phase 3分割（v12.7）: Phase A→B→C の非同期パイプライン。全モードで下書き必須
  - ★対話型検証（v12.7 タスク17-a〜d）: interactiveVerify.gsでStep1-3の3ステップ検証
  - ★タスク5-a/b/c完了（v12.8）: handleManual/Validate/AutoMode_を対称化
  - ★スプレッドシート23シート化: 継続中重大事象・対話型検証ログ・未来日付ガードログ追加
  - ★4段防御: Phase A内のファクトチェック/品質レビュー/最終事実検証 + Phase B内の対話型検証
**v2.1変更点**: ダウ理論をSH/SL（前後4日）ベースに刷新。日足+週足の2軸判定。仮説生成/検証の例文をSH/SL対応に更新。WTI/天然ガス（Alpha Vantage）停止。getDowTheorySummary_でClaude分析にSH/SL値を注入。

---

## 1. 現状の学習ループ（v12.10 Phase A→B→C 3分割 + 3段防御(factCheck無効化後) + Claude主導 + Claude web_searchニュース取得）

### 1-1. データフロー

```
【Phase A: 生成Phase（目標3-4分・全モード共通）】

ニュース収集（★v12.10: Claude web_search に切替・Gemini から変更）
    → fetchMarketNews_でTOP5ニュースを事前取得（1時間キャッシュ）
    → max_uses: 5（複数回検索を許可）
    → プロンプトで検索強制（内部知識だけは禁止・3〜5回検索推奨）
    → ソース0件時はキャッシュ保存せず次回再取得
    → 切替理由: Gemini Grounding がモデル判断で検索スキップし、
      古い内部知識で偽ニュースを生成する事故が発生（ホルムズ海峡開放等）
    ↓
★v12.1: Claude市場分析（Claude Sonnet 4.6）← データ分析
    → analyzeMarketWithClaude_ で通貨強弱・ペア変動・ニュース・商品価格を分析
    → 「今何が起きているか」をデータから正しく読む
    → 分析結果をプロンプトに【★★★】セクションとして注入
    ↓
★v12.4: テキスト生成（Claude Sonnet 4.6）← ライティング（Geminiから変更）
    → プロンプトの検証済みデータ + Claude市場分析に従って書く
    → ★v12.10: キャラクター口調リマインダーはコンパクトな3行に圧縮
      (v12.10までキャラクターシート全体を末尾で再注入していたが、
       プロンプト肥大化対策で核心リマインダーのみに圧縮)
    → 絵文字行は体言止め・動詞止めで速報調。→行で人間味を出す
    ↓
後処理チェーン（applyPostProcessingChain_で統合、14段階）
    ↓
リトライ群（executeRetry_共通関数で4パターン統合）
    ↓
★v12.10: ファクトチェック - 無効化フラグで全モードスキップ
    ScriptProperties DISABLE_FACTCHECK=true(デフォルト)
    → factCheckPost_ / autoFixPost_ をスキップ
    → Claude品質レビュー+最終事実検証+対話型検証の3段構成で品質保証
    → 無効化理由: Gemini factCheck が古い内部知識で誤修正する事故が発生
    ※ 既存ロジックは温存(DISABLE_FACTCHECK=false で緊急ロールバック可能)
    ↓
★チェック2+3: 品質レビュー（Claude Sonnet 4.6 - Q1〜Q7 + ★v12.10 Q6.5）
    → Q1〜Q5: 品質チェック（タイプ整合・重複・完成度・文字数・口調）
    → Q6: 事実の信憑性（確定データ + Web検索でリアルタイム検証）
    → ★v12.10 Q6.5: 論理整合性（事実は正しいが論理が矛盾するパターンを独立検出）
      例: 「仮説は外れた」と「着地点は合っていた」の自己矛盾
    → Q7: 絵文字行の書き分け（事実のみ・体言止め必須）
    → ★v12.10 優先度付き修正プロンプト:
      Q6.5 > Q6 > Q5/Q7 > Q1/Q2/Q3 > Q4 の順に並べ替え
    → Claude指摘 → Claude修正（元投稿ベース） + 確定データガード
    ↓
★チェック4: 最終事実検証（Claude JSON + コード置換）★v12.6 ★v12.10過剰修正防止
    → 検出=Claude JSON（{hasErrors, errors: [{wrong, correct, reason}]}）
    → 修正=コードでpostText.replace(wrong, correct)を機械的に適用
    → ★v12.10: 時間軸を含む主張（週中高値・〜年以来・急落率）は修正対象外
      (過剰修正で情報解像度が劣化する事故の根本対策)
    ↓
saveDraft（下書き保存・★v12.7全モード共通で必須）
PHASE_B_POST_ID 設定 + 1分後 executePhaseBQualityReview トリガー


【Phase B: 品質整形Phase（目標3-4分・全モード共通）】★v12.7

品質レビュー 再実行（qualityReviewPost_）← 二重実行だが安全側
    ↓
最終事実検証 再実行（finalFactVerify_）
    ↓
★チェック5: 対話型検証 Step 4（interactiveVerify.gs）★v12.7 タスク17-a〜d
    → Step 1: 検証質問抽出（Claude API 1回、Web検索なし）
            投稿本文から検証対象の主張を最大5件抽出
    → Step 2: 一括Web検証（Claude API 1回、Web検索あり）
            各主張を ❌/⚠️/✅ で判定
    → Step 3: 修正（Claude API 0-1回、❌/⚠️がある場合のみ）
            元投稿ベースで指摘箇所を書き換え
    → 対話型検証ログシート(12列)に実行ごとに1行追加
    ↓
下書きシート更新 + PHASE_C_POST_ID 設定 + 1分後 executePhaseCImageAndPost トリガー


【Phase C: 画像生成+モード分岐Phase（目標2-3分・全モード共通）】★v12.7

画像生成（市場系5タイプのみ: MORNING/GOLDEN/INDICATOR/WEEKLY_REVIEW/NEXT_WEEK）
    → Drive保存 + 画像メタデータ記録
    ↓
factCheckSkipped=true or Phase Bエラー → manual 強制降格
    ↓
★v12.8: POST_MODE による分岐（★タスク5-a/b/c で統一）:
    ├ manual   → 承認メール送信 → ステータス「承認待ち」
    ├ validate → validatePost → 通過→executePhaseCPost_(直接投稿)
    │                        / NG→承認メール + 失敗理由記録
    └ auto     → executePhaseCPost_(直接投稿 + 15分間隔チェック)
    ↓
★v12.0: 承認 → スプレッドシートE列を再読み込み（手動編集反映）→ X に投稿
    ↓
extractPostInsights_（仮説と学びを自動抽出）
    ↓
┌──────────────────────────────────────────────────────┐
│  保存先4箇所:                                         │
│  (1) 投稿履歴シート H列 → 仮説                        │
│  (2) 投稿履歴シート I列 → 学び                        │
│  (3) 学びログシート → カテゴリ別に蓄積                 │
│  (4) 仮説検証ログ → 全市場系（RULE/KNOWLEDGE以外）     │
└──────────────────────────────────────────────────────┘
    ↓
★Phase 4★ 24時間後にエンゲージメント自動収集
    → X API v2でメトリクス取得
    → 品質スコア計算 → エンゲージメントログに保存
    ↓
次の投稿生成時にプロンプトへ注入
    → ★Phase 2★ 仮説的中率サマリー（全市場系）
    → ★Phase 3★ スコアベースで学びを選択（70%上位+30%ランダム）
    → ★Phase 4★ 品質フィードバック（同タイプ5件以上蓄積後）
    → ★v12.7★ 継続中重大事象（finalFactVerify_に注入）
    → ★v12.7★ 対話型検証ログ（将来: プロンプト改善の根拠データ）
    ↓
投稿の内容に反映される

★v12.4 設計思想:
  クロスチェック（異モデル検証）より、正しいデータを握っていることが重要。
  通貨強弱+2.89%があれば、どのモデルが何を言っても「上昇」が事実。
  Gemini = 検索（Grounding）専用。ライティングと修正はClaude。
  スプレッドシートの確定データが「真実のアンカー」。
  ★v12.7追加: 継続中重大事象シート(㉑)が地政学リスクの「真実のアンカー」として機能。

★v12.8 Geminiの残存箇所（4つ・タスク18で3つに削減予定）:
  ・ニュース取得（fetchMarketNews_）: Grounding ON
  ・ファクトチェック検出（factCheckPost_）: Grounding ON ← タスク18で削除
  ・画像生成（imageGenerator.gs）: gemini-2.5-flash-image
  ・Phase A品質レビュー時のweb検索補助
  それ以外の全ての生成・修正・対話型検証はClaude。

★v12.8 学習ループへのデータ品質保証:
  Phase Aの3段検証 + Phase Bの2段検証 + ★Step 4対話型検証 = 合計6段の防御
  これにより、学習データの品質が従来以上に保証される。
```

### 1-2. 確認済みのログ出力（v12.8実運用ログ・2026-04-17）

```
【Phase A】
📰 ニュースキャッシュ使用                     ← リサーチ（Grounding ON）
📚 学びログ注入: ✅2件取得（MORNING）
📊 品質フィードバック注入: MORNING ER平均2.98%（18件）
📊 仮説検証サマリー注入: 的中率4/5
📏 プロンプト総文字数: 28050文字
🧠 Claude市場分析を実行中...
✅ Claude市場分析完了（520文字）              ← ★v12.1
✅ Claude投稿生成成功（試行1）                 ← ★v12.4 Claudeに変更
📋 ファクトチェック結果: ✅全て正確            ← チェック1（Gemini）
📝 品質レビュー（Claude）: 7件の改善          ← チェック2+3
🔄 Q6事実誤り1件 + 他6件 → 元投稿ベース修正
✅ 品質修正完了（Claude指摘→Claude修正→文字数保証）
✅ 最終事実検証成功（試行1）                   ← チェック4（v12.6）
📝 最終事実検証: 2件の事実誤り検出
✅ 最終事実検証: 2件修正完了
✅ 下書きを保存しました: 20260417_155739_MORNING
⏱️ Phase B（品質レビュー）を1分後にスケジュール

【Phase B 自動発火】
🎨 Phase B開始: 20260417_155739_MORNING
✅ Claude品質レビュー成功（試行1・Web検索有効）
📝 品質レビュー（Claude）: 7件の改善
✅ 最終事実検証: 1件修正完了
🔍 対話型検証開始: MORNING                     ← ★v12.7 Step 4
📌 確定データ収集完了: toFactString=1887文字
📝 Step 1: 検証質問抽出
✅ Step 1完了: 5件のclaim抽出
🌐 Step 2: 一括Web検証
✅ Step 2完了: ❌0件 / ⚠️1件 / ✅4件
🔧 Step 3: 修正
✅ Step 3完了: 修正適用
⏱️ 対話型検証 経過時間: 38秒
📋 対話型検証ログ書込み: VL_20260417_160034_4012
⏱️ Phase C（画像生成+投稿）を1分後にスケジュール

【Phase C 自動発火】
🎬 Phase C開始: 20260417_155739_MORNING (mode: manual)
🎨 AI画像生成中...                             ← ★v12.7 Phase Cに移動
✅ 画像生成成功: 744KB, アーキタイプ: セントラル・フォーカス
🖼 画像をDriveに保存
📋 manualモード: 承認メール送信
✅ 承認メール送信完了 / ステータス: 承認待ち
```

### 1-3. 現在の運用状態（v12.10・2026-04-18）

```
POST_MODE: manual（承認制。メールで確認後に投稿）
INTERACTIVE_VERIFY_ENABLED: true（対話型検証Step 4 稼働中）
DISABLE_FACTCHECK: true（★v12.10新規・Gemini factCheck 無効化）
稼働開始: 2026-03-07（validateモード）→ 2026-04-04（manualモードに変更）
パイプライン: Phase A→B→C 3分割。全モードで下書き必須
ファクトチェック: ★v12.10で無効化デフォルト（Claude品質レビュー+最終事実検証+対話型検証の3段に簡素化）
品質レビュー: ★v12.10でQ1〜Q7 + Q6.5の8項目 + Web検索 + 優先度付き修正
テキスト生成: Claude Sonnet 4.6
最終事実検証: Claude JSON検出 + コード置換 ★v12.10: 時間軸主張の過剰修正防止
対話型検証: Phase B 内で Step 1-3 実行 + ログ蓄積
ニュース取得: ★v12.10で Gemini → Claude web_search に切替
承認フロー: スプレッドシートE列を投稿直前に再読み込み
```

### 1-4. 解決済みの課題

| 項目 | Phase | 状態 |
|------|-------|------|
| ~~事実の正確性~~ | Phase 1.5 | ✅ ファクトチェック+自動修正で解決 |
| ~~仮説の振り返り~~ | Phase 2 | ✅ 的中率自動集計+サマリー注入で解決 |
| ~~学びの多様性~~ | Phase 3 | ✅ スコアベース選択（70%上位+30%ランダム）で解決 |
| ~~品質フィードバック~~ | Phase 4 | ✅ エンゲージメント自動収集+品質スコアで解決 |
| ~~ハルシネーション~~ | v12.0 | ✅ 3段防御（Grounding OFF+商品価格Layer1+Q6）で解決 |
| ~~絵文字行の感想混入~~ | v12.0 | ✅ Q7で検出→修正で解決 |
| ~~承認後の手動編集未反映~~ | v12.0 | ✅ 投稿前E列再読み込みで解決 |
| ~~Q6ゴールド誤警報~~ | v1.9 | ✅ 確定データ補足指示追加で解決 |
| ~~重複関数の衝突リスク~~ | v12.0 | ✅ リネームで解消確認 |
| ~~リトライ回数のマジックナンバー~~ | v1.9 | ✅ 3ファイル全てMAX_RETRIES定数化 |
| ~~Claude市場分析未実装~~ | v12.1 | ✅ analyzeMarketWithClaude_で通貨強弱・ニュースを統合分析 |
| ~~Q6検証がリアルタイムでない~~ | v12.2 | ✅ Web検索（web_search_20250305）を追加 |
| ~~クロスチェックの曖昧さ~~ | v12.4 | ✅ 確定データガード + Claude修正で根本解決 |
| ~~修正で確定データと矛盾する誤修正~~ | v12.4 | ✅ 「確定データ > 品質レビュー指摘」ルールで解決 |
| ~~Claudeレビューが注意分散~~ | v12.6 | ✅ finalFactVerify_（JSON検出+コード置換）で補強 |
| ~~未来日付ハルシネーション~~ | v12.7 Phase 1 | ✅ 未来日付ガード + ガード発動ログシート㉓ |
| ~~Phase A過負荷による品質崩壊~~ | v12.7 Phase 2 | ✅ Phase A→B→C 3分割で解決 |
| ~~autoモードで下書きが作られない~~ | v12.8 タスク5-c | ✅ 全モードで下書き必須化・緊急中止ウィンドウ確保 |
| ~~継続中重大事象の時制誤り~~ | v12.7 | ✅ 継続中重大事象シート㉑を確定データとして注入 |
| ~~文脈依存の誤り検出不可~~ | v12.7 タスク17 | ✅ 対話型検証Step 4で検出+修正 |
| ~~Gemini factCheck 誤修正~~ | v12.10 | ✅ DISABLE_FACTCHECK=true で無効化・3段構成に簡素化 |
| ~~「事実は正しいが論理矛盾」検出不可~~ | v12.10 | ✅ Q6.5論理整合性チェックで独立検出 |
| ~~修正指示の優先順位不明~~ | v12.10 | ✅ 優先度付き修正プロンプト(Q6.5>Q6>他) |
| ~~finalFactVerify 過剰修正~~ | v12.10 | ✅ 時間軸を含む主張は修正対象外に |
| ~~Gemini Grounding 検索スキップ~~ | v12.10 | ✅ ニュース取得を Claude web_search に全面切替 |
| ~~プロンプト肥大化(29,686字)~~ | v12.10 | ✅ キャラクター末尾再注入廃止・セクション統合で22,677字に |
| ~~キャラクター口調のぎこちなさ~~ | v12.10 | ✅ 【軽さと勢い】追加・【共感】5→1統合・具体エピソード禁止 |
| プロンプト自動進化 | Phase 5 | ⬜ 対話型検証ログ蓄積後に着手予定 |
| 更なるプロンプト削減 | タスク18 | ⬜ 22,677→15,000字 目標に類似セクション統合(B/C/D/A) |
| factCheck.gs ファイル削除 | タスク19 | ⬜ DISABLE_FACTCHECK運用で問題ないことを1ヶ月確認後 |

---

## 2. 目指す姿: 完全自動学習型システム

### 2-1. 学習サイクル全体像

```
Phase 1  （完了）: 記憶する    → 仮説と学びを保存・注入
Phase 1.5（完了）: 検証する    → 事実をファクトチェック+自動修正
Phase 2  （完了）: 振り返る    → 仮説の的中率を自動集計
Phase 3  （完了）: 優先する    → よく当たる学びを重み付け
Phase 4  （完了）: 改善する    → エンゲージメントで投稿品質を評価
v12.0    （完了）: 防御する    → 3段防御でハルシネーション排除
v12.1    （完了）: 分析する    → Claude市場分析でデータから現状把握
v12.4    （完了）: 統合する    → Claude主導 + 確定データガード
v12.6    （完了）: 精密化する  → finalFactVerify_で検出と修正を分離
v12.7    （完了）: 対話する    → 3分割 + 対話型検証で人間の検証プロセスを模倣
v12.8    （完了）: 対称化する  → 全モードハンドラーを統一、緊急中止ウィンドウ確保
Phase 5  （待機）: 進化する    → 自動でプロンプトルールを更新（対話型検証ログ蓄積後）
```

### 2-2. 完成イメージ

```
ニュース収集（Gemini Grounding ON）
    → Claude市場分析（★v12.1）
    → テキスト生成（Claude ★v12.4）
    → Phase A: ファクトチェック（Gemini）+ 品質レビュー（Claude Q1〜Q7）+ 最終事実検証（★v12.6）
    → saveDraft（全モード必須 ★v12.7）
    ↓（1分後トリガー）
    → Phase B: 品質レビュー再実行 + 最終事実検証再実行 + ★対話型検証Step 4（Claude + Web検索）
    → saveDraft更新
    ↓（1分後トリガー）
    → Phase C: 画像生成 + モード分岐（manual/validate/auto）
    → 承認（E列再読み込み）or 直接投稿 → X投稿 → エンゲージメント取得
    ↑                                                    ↓
プロンプト自動更新 ← 対話型検証ログ分析 ← 仮説検証
    ↑                                ↓
重み付け学び注入 ← 学びスコア更新 ← 品質フィードバック

★4段防御 + Step 4対話型検証が「学習データの品質」を保証する
★Phase 1〜4 + v12.0〜v12.8 は全て実装完了。ループが自動で回る状態。
★残課題: タスク18（factCheck削除）+ タスク19（Claude統一）+ Phase 5 プロンプト自動進化
```

---

## 3. Phase 1.5: ファクトチェック + 自動修正 ✅実装完了

### 3-1. 概要

投稿テキスト生成後、事実の正確性を自動検証し、誤りがあれば自動修正する。
★v12.0: 3段構成（Geminiファクトチェック → Claude事実検証 → Gemini修正）

### 3-2. 処理フロー（★v12.8 Phase A→B→C 3分割 + Step 4対話型検証）

```
【Phase A: 生成Phase】

(1) Claude市場分析（Claude Sonnet 4.6）★v12.1
    → 通貨強弱・ペア変動・ニュース・商品価格を分析
    → 分析結果をプロンプトに注入

(2) テキスト生成（★v12.4 Claude Sonnet 4.6）→ 後処理 → リトライ
    → Grounding不要（確定データ + Claude分析済み）

(3) factCheckPost_（Gemini + Grounding ON）← チェック1 ★タスク18で削除予定
    → Layer 1: システム確定データと照合
      ・為替レート（7ペア）: 3%超の乖離で❌
      ・商品価格（BTC/ゴールド）: 5%超の乖離で❌
      ・政策金利・カレンダー・要人・アノマリー
      ・★v12.4: 通貨強弱ランキング（方向チェック）
      ・★v12.7: 継続中重大事象シート（米国関税措置等）
    → Layer 2: Grounding検索で事実確認
    → JSON形式で構造化された検証結果を返す

(4) 判定分岐:
    ✅全て正確 → (6)へ
    ❌誤り → (5)へ

(5) autoFixPost_（★v12.4 Claude + 確定データガード）
    → 誤りを修正 → 再度後処理を適用
    → ルール: 「確定データの方向と矛盾する修正はするな」

(6) qualityReviewPost_（Claude Sonnet 4.6）← チェック2+3
    → Q6: 確定データ（レート+商品価格+継続中重大事象）との矛盾を検出
    → Q6: ★v12.2 Web検索（web_search_20250305）でリアルタイム事実確認
    → Q7: 絵文字行の感想混入を検出（★v12.4 体言止め必須）
    → Q1〜Q5: 品質チェック
    → ★v12.4: Claude指摘 → Claude修正（Geminiから変更）+ 確定データガード

(7) finalFactVerify_（★v12.6）← チェック4 ★タスク18で削除予定
    → 検出=Claude JSON出力強制（{hasErrors, errors: [{wrong, correct, reason}]}）
    → 修正=コードでpostText.replace(wrong, correct)を機械的に適用
    → 始値データから「ドル円が上=円安」を明示注入（方向誤り防止）

(8) saveDraft（★v12.7 全モードで必須）+ Phase B を1分後にスケジュール


【Phase B: 品質整形Phase】★v12.7 タスク4

(9) 品質レビュー 再実行（qualityReviewPost_）

(10) 最終事実検証 再実行（finalFactVerify_）

(11) ★v12.7 タスク17: 対話型検証 Step 4（interactiveVerify.gs）← チェック5
     → Step 1: 検証質問抽出（Claude API 1回、Web検索なし）
              投稿本文から検証対象の主張を最大5件抽出
     → Step 2: 一括Web検証（Claude API 1回、Web検索あり）
              各主張を ❌/⚠️/✅ で判定
     → Step 3: 修正（Claude API 0-1回、❌/⚠️がある場合のみ）
              元投稿ベースで指摘箇所を書き換え
     → 対話型検証ログシート(12列)に実行ごとに1行追加
     → 有効化: INTERACTIVE_VERIFY_ENABLED = true
     → 時間制限: 残り180秒以上の場合のみ実行

(12) saveDraft更新 + Phase C を1分後にスケジュール


【Phase C: 画像生成+モード分岐Phase】★v12.7

(13) 画像生成（市場系5タイプのみ: MORNING/GOLDEN/INDICATOR/WEEKLY_REVIEW/NEXT_WEEK）

(14) POST_MODE による分岐（★v12.8 タスク5-a/b/c で統一）:
     ├ manual   → 承認メール送信 → ステータス「承認待ち」
     ├ validate → validatePost → 通過→直接投稿 / NG→承認メール
     └ auto     → executePhaseCPost_（直接投稿 + 15分間隔チェック）

(15) 承認メール or 直接投稿
    → 修正済みテキスト + ファクトチェック結果 + 品質レビュー結果 + 対話型検証結果を表示
```

### 3-3. 検証対象

```
【検証する事実】
  ・要人発言: 誰が、いつ、何を言ったか
  ・経済指標: 名称、日付、予想値、前回値、結果値
  ・レート水準: 具体的な数値の正確性
  ・商品価格: BTC・ゴールドの具体値
  ・日付の整合性: 「今日」「昨日」の出来事が本当にその日か（★v12.7 未来日付ガード）
  ・中央銀行の政策: 決定内容の正確性
  ・★v12.7: 継続中重大事象: 「〜前」「〜ショック前」等の時制誤り検出
  ・★v12.7 Step 4: 文脈依存の誤り（発言引用のニュアンス精度等）

【検証しない】
  ・個人の感想（「マジで注目」等）
  ・相場観（「上がりそう」等）
  ・RULE_1〜4（個人の経験談が主体）
```

### 3-4. 対象ファイル・関数（★v12.8更新）

```
factCheck.gs: ★タスク18で削除予定
  factCheckPost_()   → ファクトチェック（Gemini+Grounding ON）
  autoFixPost_()     → ★v12.4: Claudeに変更 + 確定データガード

qualityReview.gs:
  qualityReviewPost_() → 品質レビュー（Claude Sonnet 4.6・Q1〜Q7）
                         ★v12.2: Web検索（web_search_20250305）追加
                         ★v12.4: 修正をClaudeで実行

geminiApi.gs:
  analyzeMarketWithClaude_() → ★v12.1: Claude市場分析
  generatePost()             → Phase A末尾にfinalFactVerify_まで完走 → saveDraft
  finalFactVerify_()         → ★v12.6: JSON検出+コード置換
  collectAnchorData_()       → ★v12.7 タスク17-a: 確定データ収集の一元化

interactiveVerify.gs: ★v12.7 タスク17-b 新設
  extractVerificationQuestions_() → Step 1: 検証質問抽出
  verifyQuestionsWithWeb_()       → Step 2: 一括Web検証
  applyInteractiveFix_()          → Step 3: 修正

main.gs: ★v12.8 タスク5-a/b/c で対称化
  handleManualMode_()   → saveDraft + Phase B トリガー（38行）
  handleValidateMode_() → saveDraft + Phase B トリガー（38行）
  handleAutoMode_()     → saveDraft + Phase B トリガー（40行）
  executePhaseBQualityReview() → Phase B 実行
  executePhaseCImageAndPost()  → Phase C 実行（モード分岐）

sheetsManager.gs: ★v12.7 更新
  getOngoingEventsSheet_()         → 継続中重大事象シート㉑
  getInteractiveVerifyLogSheet_()  → 対話型検証ログシート㉒
  getFutureDateGuardLogSheet_()    → 未来日付ガードログシート㉓

approval.gs:
  sendDraftNotification()    → メール本文に検証結果を追加
  processApprovedDrafts()    → ★v12.0: 投稿直前にスプレッドシートE列を再読み込み
  processPendingRegenRequests_() → 画像再生成時もE列から最新テキスト取得

ScriptProperties:
  INTERACTIVE_VERIFY_ENABLED → ★v12.7: 対話型検証の有効化制御
  PHASE_B_POST_ID / PHASE_C_POST_ID → Phase間のID受け渡し
  LAST_FACT_CHECK_{postType} → 一時保存（メール送信後に削除）
  SKIP_FACT_CHECK            → 一括テスト時のスキップフラグ
```

### 3-5. v12.0で解決したハルシネーション問題

```
【問題】
  テキスト生成時のGrounding ONで、Geminiが未検証の情報（WTI 113ドル台、
  トランプ発言等）を検索結果から拾い、それを膨らませてハルシネーションを生成。
  同じGeminiによるファクトチェックでは検出が不安定（同モデルバイアス）。

【対策: 3段防御】
  ① 発生防止: テキスト生成のGrounding OFF（検証済みデータだけで書く）
  ② Layer1強化: 商品価格を確定データに追加（WTI等の価格捏造を即検出）
  ③ 別モデル検証: Claude Q6で確定データとの矛盾を二重チェック

【結果】
  全16タイプテストでハルシネーション0件。
  数値の捏造（雇用統計17.8万人等）が残ってもQ6で毎回検出・修正。
```

---

## 4. Phase 2: 仮説の的中率自動集計 ✅実装完了

### 4-1. 概要

全市場系投稿（MORNING〜NY + WEEKLY系。RULE/KNOWLEDGEは除外）で立てた仮説を、レートデータで自動検証する。

### 4-2. 新規シート: 仮説検証ログ

```
列  ヘッダー          内容                        データ型
─────────────────────────────────────────────────────────
A   仮説ID            一意のID                     yyyyMMdd_N
B   仮説日            仮説を立てた日               yyyy/MM/dd
C   仮説内容          テキスト                     テキスト
D   対象ペア          USD/JPY等                    テキスト
E   仮説方向          上昇/下落/レンジ              テキスト
F   仮説時レート       仮説時点のレート              数値
G   検証日            1週間後の日付                 yyyy/MM/dd
H   検証時レート       検証時点のレート              数値
I   変動幅            検証時 - 仮説時               数値（+/-）
J   判定              的中/不的中/判定不能           テキスト
K   的中理由          なぜ当たった/外れたか          テキスト（Gemini自動生成）
```

### 4-3. 対象ファイル・関数

```
learningManager.gs:
  parseHypothesisDetails_()            仮説テキストから対象ペア・方向を自動パース
  verifyWeeklyHypotheses_()            未検証仮説をレートデータで自動判定
  generateVerificationReason_()        的中理由をGeminiで1行自動生成
  getHypothesisVerificationSummary_()  直近5件の的中率サマリーを生成
  extractPostInsights_()               全市場系で仮説検証ログ保存
```

---

## 5. Phase 3: 学びの重み付け ✅実装完了

### 5-1. 概要

学びログシートに「使用回数」「有効度スコア」を追加し、よく使われる/役に立つ学びを優先注入する。

### 5-2. 処理フロー

```
(1) getLearningLog_をスコアベース選択
    → 70%: 有効度スコア上位から選択（実績重視）
    → 30%: ランダムに選択（新しい学びにもチャンスを与える）

(2) Phase 4連携:
    → エンゲージメントの良い投稿で使われた学びのスコアを加算
    → 一定期間使われない学びは retired に変更
```

---

## 6. Phase 4: エンゲージメントフィードバック ✅実装完了

### 6-1. 概要

X API v2でインプレッション/いいね数を取得し、投稿品質を数値化する。

### 6-2. 処理フロー

```
(1) 毎朝5:00にscheduleTodayPostsから自動実行
    → 投稿履歴から24時間以上前かつ未取得のツイートIDを収集
    → X API v2でバッチ取得 → エンゲージメントログに保存

(2) 品質スコア計算
    → ER/平均ER x 50 で正規化（平均=50点、2倍=100点）

(3) プロンプト注入
    → 同タイプ5件以上蓄積後に自動注入開始
```

### 6-3. X API仕様

```
エンドポイント: GET https://api.x.com/2/tweets
認証: OAuth 1.0a
課金: pay-per-use $0.01/リクエスト
月額コスト: 約$0.30
```

---

## 7. Phase 5: プロンプト自動進化 ⬜待機中

### 7-1. 概要

蓄積されたデータを元に、buildFormatRules_やキャラクタープロンプトのルールを自動更新する。

### 7-2. 処理フロー

```
(1) 月1回の自動分析 → Geminiに「改善提案」を生成させる
(2) 提案をスプレッドシートに保存 → コンパナが確認して手動で承認（安全策）
(3) 承認された提案はキャラクタープロンプトシートに反映
```

### 7-3. 実装状態

```
状態: ⬜ 待機中
着手目安: 2026年4月下旬〜（v12.0の3段防御で運用データが2〜3週間溜まった後）
待機理由:
  - v12.0でパイプラインが大幅変更（2026-04-05〜）。新構造のデータで分析すべき
  - 仮説検証ログ・エンゲージメントログのデータ蓄積が必要
  - データ不足でGeminiに分析させると的外れな提案になるリスク
  - Phase 1〜4 + v12.0防御は全て完了。技術的障壁はなし
```

---

## 8. 実装ロードマップ

### 8-1. スケジュール

```
完了済み: Phase 1.5（ファクトチェック）（2026-03-06）
完了済み: Phase 2 + 3 + 4（1日で実装完了）（2026-03-07）
稼働中:   validateモード本番運用開始（2026-03-07〜）
稼働中:   Phase 8 指標連動投稿（2026-03-09〜）
完了済み: 指標結果取得の品質強化・定期トリガー化（2026-03-13）
完了済み: 経済カレンダーB列Date型対応（2026-03-13）
完了済み: 仮説検証ログ対象を全市場系に拡張 v8.4（2026-03-22）
完了済み: geminiApi.gsファイル分割 v8.5（2026-03-23）
完了済み: 品質レビューシステム新設（Claude Sonnet 4.6）v8.6（2026-03-23）
完了済み: 確定データシート化 v8.7（2026-03-25）
完了済み: Gemini 2.5 Pro変更+リトライ共通化 v8.8.1（2026-03-26）
完了済み: 投稿構造の根本改革（仮説サイクル型）v8.8.1（2026-03-26）
完了済み: アノマリー自動判定 v9.0（2026-04-01）
完了済み: 投稿軽量化+問いかけシステム v10.0（2026-04-02）
完了済み: v5プロンプト整理+役割分担明確化 v11.0（2026-04-04）
完了済み: ★3段防御アーキテクチャ+承認フロー修正 v12.0（2026-04-05）
完了済み: Q6ゴールド誤警報修正+リトライ定数化+重複関数解決確認 v1.9（2026-04-06）
蓄積中:   エンゲージメントログ / 仮説検証ログ（本番運用中）
着手予定: Phase 5（2026年4月下旬、v12.0データが2〜3週間溜まった後）
```

---

## 9. 成功指標

| Phase | 指標 | 目標値 | 状態 |
|-------|------|--------|------|
| Phase 1.5 | ファクトチェック修正率 | テスト16投稿中7件を自動修正 | ✅達成 |
| v12.0 | ハルシネーション発生率 | 0件/16タイプテスト | ✅達成（全16タイプ通過） |
| v12.0 | Q6数値捏造検出率 | 100%（検出漏れ0件） | ✅達成（5件中5件検出） |
| Phase 2 | 仮説的中率 | 50%以上 | 📊 データ蓄積中（現在1/5=20%） |
| Phase 3 | 学びのバリエーション | 1ヶ月で20種類以上の学びが循環 | 📊 データ蓄積中 |
| Phase 4 | エンゲージメント率 | 1ヶ月で平均0.5%向上 | 📊 データ蓄積中 |
| Phase 5 | ルール改善提案の承認率 | 70%以上 | ⬜ 未着手 |

---

## 10. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| ~~ハルシネーション~~ | ~~架空の数値・ニュースが投稿される~~ | ★v12.0で解決: Grounding OFF + 商品価格Layer1 + Q6二重チェック |
| ファクトチェックが過剰修正 | 正確な内容を不要に書き換える | 最終判断はコンパナの承認制。Before/After表示で確認 |
| Q6の誤警報 | Claudeの内部知識が古く正常値を異常と判定 | ★v1.9で解決: 確定データ注入時に「APIの値が正しい。確定データ自体を指摘するな」と補足指示追加 |
| Claude APIクレジット切れ | 品質レビュー（Q1〜Q7）が停止する | ★v1.9: $25チャージ+auto-reload設定済み（$5で自動$15補充）。月コスト約$2〜4 |
| 学びが偏る | 同じパターンの投稿ばかりに | Phase 3の30%ランダム枠で多様性確保 |
| X API課金超過 | クレジット残高不足 | 月額$0.30。アラート設定推奨 |
| Geminiの分析品質 | Phase 5の改善提案が的外れ | Phase 5は承認制にして安全策 |
| プロンプト肥大化 | 注入データ増でトークン超過 | 各Phase注入は最大500文字の上限を設定 |
| ★GAS同名関数の後勝ち | 意図しない関数が有効になる | v12.0でimageGenerator.gsをリネームして解決。今後も注意 |
| ★承認時のデータ不整合 | 手動編集が投稿に反映されない | v12.0で投稿直前にE列再読み込みで解決 |

---

## 11. 技術メモ

### 11-1. 4段防御アーキテクチャ（★v12.7/v12.8）

```
【設計思想（★v12.4更新）】
  Claude主導 + 確定データガード:
    リサーチ（fetchMarketNews_）: Gemini + Grounding ON → ニュース検索
    ★分析（analyzeMarketWithClaude_）: Claude → 通貨強弱・ペア変動・ニュース統合
    ★ライティング（generatePost）: Claude → 検証済みデータ + Claude分析に従って書く
    検証（factCheckPost_）: Gemini + Grounding ON → 事実確認 ★タスク18で削除予定

【4段防御の流れ（Phase A内）】
  防御1: 発生防止（Claude主導 + 確定データで未検証情報を混入させない）★v12.4
  防御2: Gemini検出（Layer1確定データ + Layer2 Grounding検索）★タスク18で削除予定
  防御3: Claude検出（Q1-Q7 + Q6 Web検索 + Q7 絵文字行チェック）★v12.2 Web検索追加
  防御4: ★v12.6 finalFactVerify_（検出=Claude JSON、修正=コード置換）

【Phase B内の再検証】
  防御3': 品質レビュー 再実行
  防御4': 最終事実検証 再実行
  ★NEW: 防御5 対話型検証 Step 4（Claude + Web検索）
         「この主張は事実か？」を Web で調査。文脈依存の誤りを検出

【効果】
  v12.0導入時: テスト16タイプ全通過、ハルシネーション0件
  v12.7導入時: 本番事故時の「〜ショック前」ハルシネーションにも対処（継続中重大事象シート）
  v12.7対話型検証初稼働時: 発言引用のニュアンス精度を検出（既存検証では見逃し）
```

### 11-2. 各Phaseのプロンプト注入上限

```
Phase 1.5（ファクトチェック）: 注入なし（検証結果はメールに表示）
Phase 2（仮説検証）: 最大500文字（直近5件のサマリー）
Phase 3（学び重み付け）: 既存枠内（追加文字数なし）
Phase 4（品質フィードバック）: 最大300文字（平均ER、ベスト/ワースト）
Phase 5（ルール更新）: プロンプト自体が変わる（注入ではない）
★v12.7: 継続中重大事象（finalFactVerify_に注入）: 最大500文字
★v12.7: 対話型検証ログ（将来分析用）: プロンプト注入ではなく将来のプロンプト改善の根拠データ
```

### 11-3. 既存コードとの関連（★v12.8更新）

```
# Phase 1-4 関連
extractPostInsights_          → Phase 2で仮説検証ログ保存（learningManager.gs）
parseHypothesisDetails_       → Phase 2（learningManager.gs）
verifyWeeklyHypotheses_       → Phase 2（learningManager.gs）
getLearningLog_               → Phase 3でスコアベース選択（promptBuilder.gs）
fetchTweetMetrics_            → Phase 4（xApi.gs）
collectAndSaveMetrics_        → Phase 4（xApi.gs）
getQualityFeedback_           → Phase 4（promptBuilder.gs）
buildPrompt_                  → Phase 2+4で注入ブロック追加（promptBuilder.gs）
getHypothesisContext_         → 仮説振り返りデータ取得（promptBuilder.gs）

# v12.0-v12.8 アーキテクチャ関連
factCheckPost_                → ★タスク18で削除予定（factCheck.gs）
autoFixPost_                  → ★v12.4: Claudeに変更（factCheck.gs）
stripAIPreamble_              → メタ行汎用除去（postProcessor.gs）
qualityReviewPost_            → ★v12.2: Web検索追加（qualityReview.gs）
analyzeMarketWithClaude_      → ★v12.1: Claude市場分析（geminiApi.gs）
generatePost                  → ★v12.4: Claude生成（geminiApi.gs）
finalFactVerify_              → ★v12.6: JSON検出+コード置換（geminiApi.gs）
collectAnchorData_            → ★v12.7 タスク17-a: 確定データ収集一元化（geminiApi.gs）
processApprovedDrafts         → ★v12.0: E列再読み込み（approval.gs）
saveImageToTempDrive_         → ★v12.0: リネーム済み（imageGenerator.gs）
applyPostProcessingChain_     → 後処理チェーン統合（postProcessor.gs・14段階）
executeRetry_                 → リトライ4パターン統合（geminiApi.gs）
fixHallucinatedRates_         → ★v12.6: 最近傍キーワード方式（postProcessor.gs）

# v12.7 Phase 3分割 + 対話型検証
handleManualMode_             → ★v12.8 タスク5-a: saveDraft + Phase Bトリガー（main.gs・38行）
handleValidateMode_           → ★v12.8 タスク5-b: 88→38行簡素化（main.gs）
handleAutoMode_               → ★v12.8 タスク5-c: 63→40行簡素化（main.gs）
executePhaseBQualityReview    → ★v12.7: Phase B本体（main.gs）
executePhaseCImageAndPost     → ★v12.7: Phase C本体（main.gs）
executePhaseCPost_            → ★v12.7: 直接投稿（auto/validate用）（main.gs）
extractVerificationQuestions_ → ★v12.7: Step 1質問抽出（interactiveVerify.gs）
verifyQuestionsWithWeb_       → ★v12.7: Step 2 Web検証（interactiveVerify.gs）
applyInteractiveFix_          → ★v12.7: Step 3 修正（interactiveVerify.gs）
getOngoingEventsSheet_        → ★v12.7: 継続中重大事象シート㉑（sheetsManager.gs）
getInteractiveVerifyLogSheet_ → ★v12.7: 対話型検証ログシート㉒（sheetsManager.gs）
getFutureDateGuardLogSheet_   → ★v12.7: 未来日付ガードログシート㉓（sheetsManager.gs）
logFutureDateGuard_           → ★v12.7: ガード発動ログ書込（sheetsManager.gs）
removeFutureDateLines_        → ★v12.7: 未来日付削除（postProcessor.gs）

# 未着手
buildFormatRules_             → Phase 5で自動更新候補（promptBuilder.gs）⬜未着手
```

### 11-4. スプレッドシート構成（★v12.8で23シート）

```
#    シート名              カテゴリ        Phase
───────────────────────────────────────────────────
①   キャラクター           プロンプト素材   - ★v12.0: 生活接点のスケール感追加
②   TC概要                プロンプト素材   -
③   投稿プロンプト         プロンプト素材   - ★v11.0: v5に更新
④   トレードスタイル       プロンプト素材   -
⑤   参照ソース            プロンプト素材   -
⑥   学びログ              プロンプト素材   Phase 3で拡張（E〜H列追加）
⑦   経済カレンダー         プロンプト素材   -
⑧   投稿履歴              運用管理         -
⑨   心得テーマ            運用管理         -
⑩   下書き                運用管理         ★v12.0: E列再読み込み / ★v12.7: Phase間のステータス管理
⑪   レートキャッシュ       レートデータ     -
⑫   日次レート            レートデータ     ★v1.8: SH/SL14列追加（30→44列）
⑬   レートサマリー         レートデータ     -
⑭   指標データ            レートデータ     -
⑮   経済指標_貼り付け      ユーティリティ   -
⑯   仮説検証ログ           自動学習         Phase 2
⑰   エンゲージメントログ    自動学習         Phase 4
⑱   確定データ             プロンプト素材   -
⑲   通貨強弱              分析データ       ★v12.1: 毎時の強弱・勢い・初動・ダウ理論
⑳   週足                  分析データ       ★v1.8: OHLC+SH/SL・52週保持
㉑   継続中重大事象         確定データ       ★v12.7: 地政学リスク手動更新（7列）
㉒   対話型検証ログ         自動学習         ★v12.7: Step 4実行ごとに1行（12列）
㉓   未来日付ガードログ     運用管理         ★v12.7: 削除発動時のみ書込（3列）
```

---

## バージョン履歴（学習システム視点）

| バージョン | 日付 | 主な変更 |
|-----------|------|---------|
| v2.0 | 2026-03-04 | 初版。Phase 1-4 全実装完了。v12.0 3段防御導入 |
| v2.1 | 2026-04-07 | ダウ理論SH/SL刷新。WTI/天然ガス停止 |
| **v2.2** | **2026-04-17** | **v12.1-v12.8 の10日分の差分を一括反映**: Claude市場分析 / Claude主導テキスト生成 / 最終事実検証（finalFactVerify_） / Phase A→B→C 3分割 / 対話型検証 Step 4 / 23シート化（継続中重大事象・対話型検証ログ・未来日付ガードログ） / タスク5-a/b/c 完了 |

### v2.2 で更新した主なセクション

- セクション1（学習ループ）: v12.0 → v12.8 アーキテクチャに全面書き換え
- セクション1-4（解決済み課題）: v12.1-v12.8 の新規解決項目11件追加
- セクション2（目指す姿）: 学習サイクルに v12.1/v12.4/v12.6/v12.7/v12.8 追加
- セクション3（Phase 1.5）: 処理フローを Phase A/B/C 15ステップ構造に全面書き換え
- セクション11-1（防御アーキテクチャ）: 3段 → 4段 + Step 4対話型検証
- セクション11-3（コード関連）: v12.8関連の全関数を追記
- セクション11-4（シート構成）: 19 → 23シート

### 関連ドキュメント（参照推奨）

- TCAX_Phase3分割_未来日付ガード_要件定義書_v2.2.md（v12.7-v12.8 の実装詳細・タスク順序）
- TCAX_設計書_v12.8.md（技術仕様）
- TCAX_全体設計図_v12.8.md（システム全体図）
- X自動投稿_スプレッドシート仕様書_v1.9.md（23シート詳細）

---

*更新日: 2026-04-17 | v2.2（v12.1-v12.8 の10日分差分を一括反映。Claude主導 + Phase A→B→C 3分割 + 対話型検証 Step 4 + 23シート化）*
*更新日: 2026-04-07 | v2.1（SH/SLダウ理論刷新・WTI停止・仮説例文SH/SL対応）*
