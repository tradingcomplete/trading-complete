# T-CAX システム 全体設計図 v12.2

**プロジェクト名**: T-CAX（Trading Complete Auto X）
**コンセプト**: 「毎回その瞬間の最新情報で作成・即投稿」
**GASファイル**: 22本、合計約18,500行

---

## 1. システム概要

```
GAS + Gemini + Twelve Data で1日6回の市場投稿を自動生成・投稿。
指標30分前に動的投稿。週末は心得枠4投稿。市場系にはAI画像自動生成。

サービス:
  GAS              自動実行エンジン（無料）
  Gemini 2.5 Pro   テキスト生成 + 画像生成
  Claude Sonnet 4.6 品質レビュー + 事実検証 + 市場分析
  Twelve Data API   為替レート（7ペア + BTC + Gold）
  Google Sheets     データ保存（20シート）
  X API v2          投稿

★v12.1.1: Alpha Vantage（WTI/天然ガス）停止。データが古く誤情報の原因になるため。
  WTI情報はGroundingニュース経由で投稿に反映される。
```

---

## 2. 投稿スケジュール・文字数

```
【平日】
❶ 07:30頃  🌅 MORNING      今日のシナリオ提示       📷AI  150-300字
❷ 09:20頃  📊 TOKYO        空気感スナップ                  60-150字
❸ 12:10頃  🍱 LUNCH        生活×為替の共感                 60-150字
❹ 17:20頃  🌆 LONDON       欧州の温度差1ネタ        📷AI  100-250字
❺ 20:50頃  🔥 GOLDEN       冷静な振り返り・学び            150-350字
❻ 22:10頃  🗽 NY           今夜の一点集中           📷AI  100-250字
⚡ 指標連動  ⚡ INDICATOR    本番前の復習メモ         📷AI  140-180字

【土曜】
❶ 08:22  📋 WEEKLY_REVIEW    今週の物語              📷AI  200-400字
❷ 11:48  🧠 RULE_1           知識・原則                    120-280字
❸ 15:14  💪 RULE_2           習慣・メンタル                120-280字
❹ 20:32  📝 WEEKLY_LEARNING  今週の学び                    150-300字

【日曜】
❶ 10:18  🧠 RULE_3           実践テクニック                120-280字
❷ 14:13  🔮 NEXT_WEEK        来週の展望              📷AI  200-400字
❸ 17:42  💡 RULE_4           失敗からの学び                120-280字
❹ 20:28  💭 WEEKLY_HYPOTHESIS 来週の仮説                   150-300字

※ 曜日別1分単位スケジュール + ±0〜5分ランダムゆらぎ（Bot判定回避）
※ 月間約179件（平日132 + 土日32 + 指標約15）
```

---

## 3. 投稿パイプライン（★v12.1 3段階生成アーキテクチャ）

```
① ニュース収集（Gemini + Grounding ON）← リサーチ
   fetchMarketNews_ でTOP5ニュースを事前取得・1時間キャッシュ

①-b ★v12.1: Claude市場分析（Claude Sonnet 4.6）← データ分析
   通貨強弱・ペア変動・商品価格・ニュースをClaudeが分析
   「今何が起きているか」をデータから正しく読む
   → 分析結果をGeminiプロンプトに【★★★】セクションとして注入

② テキスト生成（Gemini + Grounding OFF）← ライティング ★v12.0変更
   プロンプトの検証済みデータ + ★Claude市場分析に従って書く
   Groundingで未検証の情報を拾わない → ハルシネーション防止
   Claude分析と矛盾する記述は絶対に書かない → 方向性矛盾防止

③ 後処理チェーン（12段階）
④ リトライ群（executeRetry_で4パターン統合）

⑤ ファクトチェック（Gemini + Grounding ON）← 検証チェック1
   Layer 1: 確定データ照合（レート + 商品価格 + カレンダー + 要人 + アノマリー）
   Layer 2: Grounding検索で事実確認
   ❌ → autoFix（Grounding OFF）→ 後処理再適用

⑥ 品質レビュー（Claude）← 検証チェック2+3 ★v12.0強化
   Q1〜Q5: 品質チェック（従来通り）
   Q6: 事実の信憑性（確定データ二重チェック + 定性的主張検証）★v12.1強化
   Q7: 絵文字行の書き分け（事実のみ・感想混入禁止）★v12.0追加
   修正フロー: Claude指摘 → Gemini修正（★v12.1: 削除禁止・書き直し）→ 文字数保証

⑦ 投稿キャッシュ保存 → 承認メール → 承認 → 投稿

★v12.1設計思想:
  Geminiに「分析もライティングも全部やれ」は無理がある。
  Claude = 分析役（データを正しく読む）
  Gemini = ライティング役（Claude分析に従って書く）
  Claude = レビュー役（品質チェック Q1〜Q7）
  各AIの得意分野に仕事を割り当てる。
```

---

## 4. GASファイル構成（22ファイル・★v12.2行数更新）

```
ファイル              行数    役割
────────────────────────────────────────────────────
geminiApi.gs          712     核: generatePost + Claude市場分析 + executeRetry_ ★v12.1.1: ダウ理論詳細注入
promptBuilder.gs      1,941   プロンプト構築 + 問いかけ + 仮説管理 ★v12.2: 環境認識+仮説検証注入+未発表禁止+27:00対応
postProcessor.gs      1,874   後処理チェーン12段階
factCheck.gs          665     ファクトチェック + 自動修正 ★v12.1.1: WTI/天然ガス停止
qualityReview.gs      483     品質レビュー Q1〜Q7 ★v12.2: 仮説矛盾+未発表イベントチェック
anomalyManager.gs     1,041   アノマリー自動判定 + 祝日通知
config.gs             624     設定値 + POST_TYPES + ★v12.1.1: DAILY_RATE_COLS/WEEKLY_RATE_COLS追加
rateManager.gs        1,635   レート取得・保存・検証 ★v12.2: SH/SLダウ理論+62秒待機削除+キャッシュ読みのみ
marketAnalysis.gs     803     市場分析（通貨強弱・ニュース・背景フィールド）
indicatorManager.gs   1,154   経済指標の取得・解析
learningManager.gs    873     学び・仮説の抽出・検証 ★v12.1.1: SH/SL例文更新
priceSummary.gs       874     価格サマリー集計 ★v12.1.1: SH/SL判定+週足シート作成
calendarManager.gs    784     経済カレンダー取得 ★v12.2: 27:00形式対応+B列テキスト強制
testFunctions.gs      225     テスト関数
imageGenerator.gs     890     AI画像生成 + 透かし合成
scheduler.gs          552     トリガー管理
main.gs               674     カスタムメニュー + エントリポイント ★v12.2: パイプライン分割（Phase A/B）
sheetsManager.gs      1,038   スプレッドシート読み書き
approval.gs           996     承認フロー + メール送信
xApi.gs               654     X API v2投稿（OAuth 1.0a）
applyPairColors.gs    245     通貨ペア色分け ★v12.1.1: SH/SL列色設定追加
utils.gs              172     ユーティリティ
```

---

## 5. 役割分担（★v12.1更新）

```
【AI役割分担（★v12.1: 各AIの得意分野に割り当て）】
  Gemini = ニュース検索（Grounding）+ 画像生成 + テキストライティング
  Claude = データ分析（市場の読み）+ 品質レビュー（Q1〜Q7）
  設計思想: 1つのAIに全部やらせない。得意なことをやらせる。

【C列プロンプト（投稿プロンプトv5）】
  各タイプの「役割」と「文字数」だけ。シンプルに。
  ★v12.1: TOKYO/LUNCHは「短くてもためになる一言。ホットなニュースがあれば速報で」

【キャラクターシート】
  コンパナの人格・口調・哲学・禁止事項。全投稿に注入。
  ★v11.0: 相場観 + ネガティブ感情禁止
  ★v12.0: 生活との接点の出し方（スケール感の指示）追加

【promptBuilder.gs（コード内・非公開）】
  構造ルール: 絵文字行=事実、→行=感想
  タイプ別構成フレーム + 市場データ注入

【geminiApi.gs - analyzeMarketWithClaude_（★v12.1新設）】
  Claude市場分析: データを正しく読み、方向性を整理
  → Geminiプロンプトに【★★★】セクションとして注入

【qualityReview.gs】
  Claude品質レビュー Q1〜Q7
  ★v12.0: Q6事実検証+Q7絵文字行チェック
  ★v12.1: Q6に定性的主張検証追加。Gemini修正は「削除禁止・書き直し」

原則: 1つの仕事は1つの場所で定義。重複させない。
```

---

## 6. 問いかけシステム（v10.0新設）

```
目的: 情報提供だけでなく読者の「反応」を引き出す
制約: 1日2回上限。約50%の確率で注入。毎回ではない

対象12タイプ: MORNING/LUNCH/GOLDEN/WEEKLY系/RULE系/KNOWLEDGE
非対象4タイプ: TOKYO/LONDON/NY/INDICATOR（短すぎ or 緊張感優先）

方向性（AIがその日の題材から毎回新規生成。固定ローテーション禁止）:
  ・生活実感 / 夢・目標 / 選択・判断 / 内省

管理: ScriptProperties 'TODAY_QUESTION_COUNT'。毎朝5:00リセット
```

---

## 7. アノマリー自動判定（v9.0新設）

```
8カテゴリ・20種類のカレンダー要因をanomalyManager.gsで自動判定:
  ゴトー日（営業日補正）/ 月末・四半期末・年度末 / 週末金曜
  海外祝祭日（イースター等）/ 夏枯れ / SQ日 / 中銀会合前日 / 月別傾向

注入先: プロンプト（仮説の材料）+ ファクトチェック（確定データ）+ 学び抽出（文脈）
鉄則: 「傾向」であり「予測」ではない。ファンダ > アノマリー。3件以上は2件まで
祝日: config.gsのJAPAN_HOLIDAYS配列（年1回更新。不足時はメール通知）
```

---

## 8. 設計の鉄則

```
【コード】
・\b 使うな / \s は改行含む → [ \t]+ を使え
・新しい後処理 → applyPostProcessingChain_内に追加
・新しいリトライ → executeRetry_にconfig/base渡すだけ
・factCheck = Grounding ON / autoFix = Grounding OFF
・★v12.0: generatePost（テキスト生成）= Grounding OFF
  理由: プロンプトに検証済みデータが注入済み。Groundingで未検証情報を拾うとハルシネーションの原因になる
・★v12.1: テキスト生成の前にClaude市場分析を実行（analyzeMarketWithClaude_）
  Geminiに「分析もライティングも全部やれ」は方向性矛盾の原因。分析はClaudeに任せる
・★v12.1: BTC/ゴールドはscheduledFetchRatesで事前取得（75分キャッシュ）
  generatePost内の60秒待ちを回避。Claude分析の時間を確保
・★v12.1.1: WTI/天然ガス（Alpha Vantage）停止。データが古い（104.69固定）ため。
  WTI情報はGroundingニュース経由で投稿に反映
・★v12.1.1: ダウ理論をSH/SLベースに刷新（前後4日のスイングハイ/ロー）
  日足+週足の2軸判定。SH/SL値はシートに蓄積（毎回計算しない）
  列定義はconfig.gsのDAILY_RATE_COLS/WEEKLY_RATE_COLSで管理
・★v12.2: パイプライン分割（Phase A: テキスト→下書き / Phase B: 1分後に画像+メール）
  GAS 6分制限対策。Phase Aで下書き保存、Phase Bで画像生成+メール送信
・★v12.2: 環境認識が9割。T-CAXは予測システムではなく環境認識システム
  データが示す事実をそのまま伝える。感情・願望で歪めない
  仮説検証結果（○/△/×）をプロンプトに注入。矛盾する記述は絶対禁止
・★v12.2: 未発表イベントを過去形で書くな。まだ起きていないことを起きたように書かない
・★v12.2: 経済カレンダーの時刻は27:00形式を使用。B列はテキスト形式で保存
・★v12.1: Gemini修正指示は「削除するな、書き直せ」。charMin未満は絶対禁止
・★v12.1: TOKYO/LUNCHは「短くてもためになる」が軸。中身を薄くするための短さではない
・タイプ別方針変更 → 5ヘルパー関数内を修正（buildPrompt_本体触るな）
・scheduler.gsではトリガー設定を最優先
・設計図・設計書は内容が変わるたびにバージョン番号を上げること
・★v12.0: GASの同名関数は「後勝ち」（アルファベット順で後に読まれるファイルが有効）
  → 別ファイルで同名関数を定義しない。imageGenerator.gsの関数をリネーム済み

【投稿】
・1本で完結。どの1本を見ても楽しめる・学べる
・仮説は条件分岐型 + 2層構造（構造仮説+今日の仮説）
・絵文字行 = 事実のメモ。短く言い切り。感想は→行で
・ネガティブ感情禁止（疲れた・胃が痛い・怖い・辛い）
・相場は敵じゃない。外れたら切り替える。切り替えの速さが武器
・★v12.0: 生活との接点はスケールの大きい話で（海外旅行・電気代・住宅ローン等）
  「ガソリン満タンにしますか？」等の小さい話は避ける
・問いかけは題材から毎回生成。固定ローテーション禁止
・アノマリーは「傾向」。ファンダ > アノマリー
・指示はシンプルに。OK/NG例の詰め込みは出力を似せる原因になる

【承認フロー（★v12.0修正）】
・投稿直前にスプレッドシートから再読み込み（手動編集を確実に反映）
・画像再生成時もスプレッドシートE列の最新テキストを使用
```

---

## 9. スクリプトプロパティ・トリガー

```
【プロパティ】
X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET
GEMINI_API_KEY / CLAUDE_API_KEY / SPREADSHEET_ID
IMAGE_FOLDER_ID / WEBAPP_URL / WATERMARK_IMAGE_ID
TWELVE_DATA_API_KEY / ALPHA_VANTAGE_API_KEY
POST_MODE（manual/validate/auto）
TODAY_QUESTION_COUNT / HOLIDAY_NOTIFIED_YEAR

【トリガー】
scheduleTodayPosts     毎朝5:00（日次スケジューラ）
scheduledFetchRates    毎時（レート取得）
processApprovedDrafts  5分ごと（承認チェック）
run[Morning〜Ny]       当日スケジュール（毎朝動的設定）
runIndicator           重要指標30分前（動的）
```

---

## 10. 画像システム

```
【AI画像生成 + TC透かし合成】
  対象: MORNING, LONDON, NY, INDICATOR, WEEKLY_REVIEW, NEXT_WEEK（6タイプ）
  方式: Gemini画像生成 → Google Slides API透かし合成 → PNG出力（約1000〜1800KB）
  画像なし: TOKYO, LUNCH, GOLDEN, RULE_1〜4, WEEKLY_LEARNING, WEEKLY_HYPOTHESIS, KNOWLEDGE

【12アーキタイプ（構図バリエーション）】
  ストラクチャード・リスト / セントラル・フォーカス / デュアル・コントラスト
  フロー＆パースペクティブ / クローズアップ・メカニズム / トップダウン・ブループリント
  ダイナミック・アクション / マインド・ゲーム / ブレイクスルー・インパクト
  サイクル＆リズム / クラウド・センチメント / ネットワーク・コネクション
  ※ 直近使用アーキタイプは除外して選定（マンネリ防止）
```

---

## 11. エラーハンドリング

```
Gemini API失敗（テキスト）  → 3回リトライ（指数バックオフ）→ エラーメール
Gemini API失敗（画像）      → 3回リトライ → テキストのみで続行
Twelve Data失敗             → レートキャッシュからフォールバック → エラーログ
Claude API 529              → 指数バックオフ（5→10→20秒）+ 3回リトライ
透かし合成失敗              → 透かしなしの画像で続行
X API失敗                   → 429:15分待ち / 403:メール通知
GAS 6分制限                 → 4分で安全弁発動（TIME_LIMIT_SEC=240）
全エラー                    → Gmailに自動通知 + Sheetsにエラーログ記録
```

---

## 12. バージョン履歴（直近のみ）

```
v12.2（2026-04-07/08）SH/SLダウ理論+WTI停止+パイプライン分割+環境認識
  背景: Alpha VantageのWTI/天然ガスが古いデータ（104.69固定）を返し続け、
        ファクトチェック→自動修正の無駄なサイクルが発生。
        またダウ理論が5日間60%ルールでノイズに振り回されていた。
        さらにGeminiが仮説検証結果を無視して「逆方向でした」と捏造。
        GAS 6分タイムアウトで画像生成+メール送信が間に合わないケースも発生。
  ・config.gs: DAILY_RATE_COLS/WEEKLY_RATE_COLS列定義追加
  ・rateManager.gs: calcDowTheory_をSH/SL（前後4日）ベースに刷新
  ・rateManager.gs: getDowTheorySummary_新規（日足+週足SH/SL詳細をClaude分析に注入）
  ・rateManager.gs: backfillSwingHighLow新規（既存1,341日+週足52週のSH/SL一括判定）
  ・rateManager.gs: saveRatesToSheet_から62秒待機+BTC/GOLD API呼び出し削除（キャッシュ読みのみ）
  ・priceSummary.gs: aggregateDailyRatesにSH/SL判定+週足シート作成を追加
  ・geminiApi.gs/promptBuilder.gs/factCheck.gs/qualityReview.gs: WTI/天然ガス注入停止（5ファイル）
  ・promptBuilder.gs: 仮説検証ログの判定結果（○/△/×）をプロンプトに注入
  ・promptBuilder.gs: 環境認識の原則セクション追加（全投稿共通）
  ・promptBuilder.gs: 未発表イベント過去形禁止ルール追加
  ・promptBuilder.gs: 27:00形式正式対応（深夜イベントの未発表判定）
  ・qualityReview.gs: Q6に仮説矛盾チェック+未発表イベントチェック追加
  ・learningManager.gs: 仮説生成/検証の例文をSH/SL対応に更新
  ・applyPairColors.gs: SH/SL列の色設定追加
  ・main.gs: パイプライン分割（Phase A: テキスト→下書き / Phase B: 1分後に画像+メール）
  ・calendarManager.gs: インポート時B列テキスト形式強制+テキスト時刻パターン対応
  ・日次レート: 30列→44列（SH/SL 14列追加）
  ・週足シート新規作成（⑳番目のシート。52週保持）
  ・設計思想: 環境認識が9割。データの事実を歪めない。予測ではなく環境認識

v12.1（2026-04-06）3段階生成アーキテクチャ
  背景: Geminiが通貨の方向性を間違える（EUR最強なのに「ユーロ売り」と書く等）。
        Geminiに「分析もライティングも全部やれ」は無理がある。
  ・geminiApi.gs: Claude市場分析ステップ新設（analyzeMarketWithClaude_）
  ・geminiApi.gs/imageGenerator.gs: MAX_RETRIES定数化
  ・rateManager.gs: BTC/ゴールド事前取得+キャッシュ75分延長（60秒短縮）
  ・qualityReview.gs: Q6定性的主張チェック追加（「史上最高値」「急騰」等）
  ・qualityReview.gs: Gemini修正に「削除禁止・書き直し」ルール追加
  ・qualityReview.gs: TOKYO/LUNCH TYPE_DESCRIPTIONS更新（速報ヘッドライン許可）
  ・qualityReview.gs: ゴールド誤警報修正（確定データ補足指示）
  ・learningManager.gs: 仮説生成+仮説検証に通貨強弱トレンド+ダウ理論を注入
  ・投稿プロンプトv5: TOKYO/LUNCH C列更新
  ・設計思想: 各AIの得意分野に仕事を割り当てる

v12.0（2026-04-05）3段防御アーキテクチャ+承認フロー修正
  背景: Grounding ONのテキスト生成でハルシネーション（WTI 113ドル等）が頻発。
        ファクトチェック（Gemini）の検出が不安定。Claudeの品質レビューは事実を見ていなかった。
  ・geminiApi.gs: テキスト生成のGrounding OFF（ハルシネーション防止）
  ・factCheck.gs: Layer 1に商品価格（WTI/BTC/ゴールド/天然ガス）追加
  ・qualityReview.gs: Q6事実検証+Q7絵文字行チェック追加（5項目→7項目）
  ・approval.gs: 投稿直前にスプレッドシートから再読み込み（手動編集反映）
  ・imageGenerator.gs: 重複関数リネーム（saveImageToTempDrive_）
  ・キャラクターシート: 生活との接点の出し方（スケール感）追加
  ・設計思想: Grounding用途を「リサーチ」「検証」に限定。「ライティング」では不使用

v11.0（2026-04-04）v5プロンプト整理+役割分担明確化

v10.0（2026-04-02）投稿軽量化+仮説精度向上+問いかけシステム

v9.0（2026-04-01）アノマリー自動判定+品質修正安定化
```

---

## 13. ドキュメント版数

```
全体設計図 v12.2 / 設計書 v12.1 / 投稿プロンプト v5
スプレッドシート仕様書 v1.8 / アノマリー要件定義書 v1.0
完全自動学習型システム要件定義書 v2.1 / キャラクターシート v2.1
ファイル分割要件定義書 v2.3
v12.1 3段階生成アーキテクチャ要件定義書 v1.0
ダウ理論改善SH/SL要件定義書 v1.1
通貨強弱シート要件定義書 v1.3
```

---

*更新日: 2026-04-07 | v12.2（SH/SLダウ理論+WTI停止）*
