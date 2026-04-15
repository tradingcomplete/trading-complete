# T-CAX システム 全体設計図 v12.6

**プロジェクト名**: T-CAX（Trading Complete Auto X）
**コンセプト**: 「毎回その瞬間の最新情報で作成・即投稿」
**GASファイル**: 23本、合計約20,000行

---

## 1. システム概要

```
GAS + Gemini + Twelve Data で1日6回の市場投稿を自動生成・投稿。
指標30分前に動的投稿。週末は心得枠4投稿。市場系にはAI画像自動生成。

サービス:
  GAS              自動実行エンジン（無料）
  Gemini 2.5 Pro   テキスト生成 + 画像生成
  Claude Sonnet 4.6 品質レビュー（★Web検索付き） + 事実検証 + 市場分析 + ★503フォールバック
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
❷ 09:20頃  📊 TOKYO        空気感スナップ                  100-180字
❸ 12:10頃  🍱 LUNCH        生活×為替の共感                 100-180字
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

## 3. 投稿パイプライン（★v12.4 Claude主導アーキテクチャ）

```
① ニュース収集（Gemini + Grounding ON）← Geminiが唯一得意なこと
   fetchMarketNews_ でTOP5ニュースを事前取得・1時間キャッシュ

①-b Claude市場分析（Claude Sonnet 4.6）← データ分析
   通貨強弱・ペア変動・商品価格・ニュースをClaudeが分析
   「今何が起きているか」をデータから正しく読む
   → 分析結果をプロンプトに【★★★】セクションとして注入

② ★v12.4: テキスト生成（Claude）← ライティング（Geminiから変更）
   プロンプトの検証済みデータ + Claude市場分析に従って書く
   末尾にキャラクター口調リマインダー配置（LLMは最後の指示を最重視）
   ★v12.3: ストーリー主導 — ニュースTOP5から最もホットなネタ1つを因果チェーンで展開
   ★v12.4: 絵文字行は体言止め・動詞止めで速報調。→行で人間味を出す

③ 後処理チェーン（14段階）
④ リトライ群（executeRetry_で4パターン統合）

⑤ ファクトチェック検出（Gemini + Grounding ON）← Groundingの価値
   Layer 1: 確定データ照合（レート + 商品価格 + カレンダー + 要人 + アノマリー + ★v12.4: 通貨強弱）
   Layer 2: Grounding検索で事実確認
   ★v12.4: 確定データ6（通貨強弱）+ ルール1c（方向チェック）追加
     「AUD +2.95%なのに豪ドル下落と書いている」→ ❌
   ❌ → ★v12.4: autoFix（Claude + 確定データガード）→ 後処理再適用

⑥ 品質レビュー（Claude + Web検索）← 検証チェック
   Q1〜Q5: 品質チェック（従来通り）
   Q6: 事実の信憑性（確定データ二重チェック + Web検索でリアルタイム検証）
   Q7: 絵文字行の書き分け（事実のみ・★v12.4: 体言止め必須）
   ★v12.4: 修正フロー変更: Claude指摘 → Claude修正（Geminiから変更）+ 確定データガード
   ★v12.5: Q6事実誤り検出時 → 全文再生成（スリムプロンプト）→ 2回目品質レビュー(Q6スキップ) → パッチ修正
   ★v12.5.1: 経済カレンダーをレビュー+修正に注入。カレンダー確定データ > Web検索 > AI推論
   ★v12.5.4: 口調はキャラクターシートから動的読み込み（getCharacterPrompt）。ハードコード口調ゼロ
     確定データ（レート + 通貨強弱）を修正プロンプトに注入
     「確定データの方向と矛盾する修正はするな」ルール

⑦ ★v12.6: 最終事実検証（Claude・事実だけに集中）← 最後の砦
   品質レビュー（Q1-Q7同時）は注意が分散し、方向の矛盾を見逃すことがある
   完成テキスト + 確定レート + 本日始値 + 通貨強弱 + カレンダーだけを渡す
   口調・文字数・フォーマットは一切見ない。事実だけに100%集中
   ★始値データから「ドル円が上=円安、下=円高」を明示注入（方向誤り防止）
   問題なし→そのまま。問題あり→事実だけ修正した投稿を返す→後処理再適用
   設計思想: 「チャットで承認OKか聞いた時」と同じ仕事の自動化

⑧ 投稿キャッシュ保存 → 承認メール → 承認 → 投稿

★v12.4 設計思想:
  クロスチェック（異モデル検証）より、正しいデータを握っていることが重要。
  通貨強弱+2.89%があれば、どのモデルが何を言っても「上昇」が事実。
  Gemini = 検索（Grounding）専用。ライティングと修正はClaude。
  スプレッドシートの確定データが「真実のアンカー」。

★v12.4 Geminiの残存箇所（2つだけ）:
  ・ニュース取得（fetchMarketNews_）: Grounding ON
  ・ファクトチェック検出（factCheckPost_）: Grounding ON
  それ以外の全ての生成・修正ステップはClaude。
```

---

## 4. GASファイル構成（23ファイル・★v12.6行数更新）

```
ファイル              行数    役割
────────────────────────────────────────────────────
geminiApi.gs          1,000   核: generatePost + Claude市場分析 + ★v12.6: finalFactVerify_新設（最終事実検証）
promptBuilder.gs      1,988   プロンプト構築 ★v12.6: toFixed→formatRate_置換 + TOKYO/LUNCHレート台ルール。分割不要（後述）
postProcessor.gs      1,957   後処理チェーン14段階 ★v12.6: fixHallucinatedRates_クロス汚染修正 + convertExactRatesToRange_新設
factCheck.gs          533     ファクトチェック ★v12.6: toFixed→formatRate_置換
qualityReview.gs      635     品質レビュー+修正 ★v12.6: toFixed→formatRate_置換（20箇所）
anomalyManager.gs     1,041   アノマリー自動判定 + 祝日通知
config.gs             767     設定値 + POST_TYPES ★v12.6: formatRate_関数+RATE_DECIMALS定数追加（レート桁数一元管理）
rateManager.gs        1,635   レート取得・保存・検証
marketAnalysis.gs     803     市場分析（通貨強弱・ニュース・背景フィールド）
indicatorManager.gs   1,154   経済指標の取得・解析
learningManager.gs    873     学び・仮説の抽出・検証
priceSummary.gs       874     価格サマリー集計
calendarManager.gs    784     経済カレンダー取得
testFunctions.gs      225     テスト関数（E2E）
★testPostProcessor.gs 265     ★v12.6新設: 後処理チェーン不変条件テスト（32ケース）
imageGenerator.gs     898     AI画像生成 + 透かし合成
scheduler.gs          599     トリガー管理 ★v12.5: サマータイムオフセット適用
main.gs               694     カスタムメニュー + エントリポイント ★v12.6: 🧪テストメニュー追加
sheetsManager.gs      1,038   スプレッドシート読み書き
approval.gs           1,014   承認フロー + メール送信
xApi.gs               654     X API v2投稿（OAuth 1.0a）
applyPairColors.gs    245     通貨ペア色分け
utils.gs              172     ユーティリティ
```

---

## 5. 役割分担（★v12.4更新）

```
【AI役割分担（★v12.4: Claude主導 + 確定データガード）】
  Claude = データ分析 + テキスト生成 + 品質レビュー + 品質修正 + ファクトチェック修正
  Gemini = ニュース検索（Grounding）+ ファクトチェック検出（Grounding）+ 画像生成
  確定データ = 真実のアンカー（通貨強弱・レート・金利・要人）
  設計思想: クロスチェックより正しいデータを持つことが重要。確定データ > AI推論
  ★v12.4の学び: Geminiはデータを無視して一般論で書く。修正ステップが正しい投稿を壊す。

★v12.5 サマータイム自動調整:
  isSummerTime_()で欧州サマータイム期間（3月最終日曜〜10月最終日曜）を自動判定
  SUMMER_TIME_TYPES = ['LONDON', 'GOLDEN', 'NY'] に -60分オフセット適用
  冬: LONDON 17:18 / GOLDEN 20:53 / NY 22:07
  夏: LONDON 16:18 / GOLDEN 19:53 / NY 21:07

★v12.5 口調一元管理:
  スプレッドシート「キャラクター」シートが唯一の口調定義
  getCharacterPrompt()で動的読み込み → promptBuilder冒頭+末尾、qualityReview Q5+修正に注入
  語尾パレット64種、禁止口調（アナリスト調+機関投資家調+カタカナ金融用語）

★v12.5 設計の鉄則:
  確定データ（カレンダー結果欄） > Web検索 > AI推論
  Q6事実誤り → 全文再生成 → 2回目品質レビュー（Q6スキップ）→ パッチ修正
  再生成プロンプトには骨格だけ。磨き上げは2回目品質レビューが担当
  通貨強弱%は内部計算値。投稿に載せない。「全通貨トップ」禁止→「主要通貨で最強」
    → Claudeが最初から正しく書き、確定データで守る方が確実

【C列プロンプト（投稿プロンプトv5）】
  各タイプの「役割」と「文字数」だけ。シンプルに。
  ★v12.2: TOKYO/LUNCHは100〜180字に拡大。「短くてもためになる」が軸。中身を薄くするための短さではない

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
  ★v12.2: Web検索（web_search_20250305）で要人発言・政策決定をリアルタイム検証

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
・★v12.2: Gemini Pro 503全滅時 → Claudeで代替生成（Flashは品質・ファクトチェック精度が低いため不採用）
・★v12.2: ファクトチェック失敗時 → auto/validateでも強制manualモード（検証なしで投稿しない）
・★v12.2: Claude品質レビューにWeb検索追加。要人発言・政策決定はリアルタイム検証
・★v12.2: INDICATOR maxIndicators=1（同時刻帯に複数指標があっても1件のみ）
・★v12.2: 画像の文字サイズ3層階層（フック=巨大 / 補足=中 / 文脈=小。全文字同サイズNG）
・★v12.3: ストーリー主導の鉄則（promptBuilder.gs 3セクション改訂）
  投稿の起点は「今一番ホットな地政学・ファンダのニュース」。データの数字ではない
  因果チェーン（原因→経路→為替への影響）が投稿の骨格
  通貨強弱・レート・ダウ理論は裏付け証拠。「実際にこう動いている」の確認に使う
  まわりくどい説明禁止。コンパナなら1文で言い切る
・★v12.4: Claude主導アーキテクチャの鉄則
  確定データ > AI推論。通貨強弱+2.89%があれば、どのモデルが何を言っても「上昇」が事実
  クロスチェック（異モデル検証）より、正しいデータを持っていることが重要
  修正ステップには必ず確定データを注入せよ。データなしの修正は方向を壊す
  Geminiは「検索（Grounding）」専用。「ライティング」と「修正」はClaude
  プロンプトの最末尾にキャラクター口調リマインダーを配置（LLMは最後の指示を最重視）
  絵文字行は体言止め・動詞止め。「〜しました。」「〜しています。」は冗長で禁止
  INDICATORトリガーは対象指標をScriptPropertiesに保存し、生成時に読み取る
・★v12.6: リグレッション防止の鉄則
  postProcessor.gsを変更する前後に testPostProcessorChain() を実行。失敗箇所 = 影響範囲
  レート桁数は formatRate_(value, pairKey, 'display'/'verify') を使う。toFixed()直書き禁止
  新しい後処理関数を追加したら testPostProcessor.gs にテストケースも追加
・★v12.6: promptBuilder.gsは分割しない（2,500行まで現状維持）
  理由1: 実際にバグを起こしたのはpostProcessor/qualityReview。promptBuilderは安定稼働中
  理由2: GASの同名関数「後勝ち」ルールで分割自体がリグレッションの原因になりうる
  理由3: buildPrompt_は「プロンプトを組み立てる」1つの仕事。636行は複雑さではなくセクション数の多さ
  分割が必要になるのは「別のロジック」が追加されたとき（例: Premium AI機能の独立プロンプト）
・★v12.6: fixHallucinatedRates_は「最近傍キーワード割り当て方式」
  同一行に複数ペアがある場合、各レートを直前で最も近いキーワードに割り当てて修正
  旧方式（ペア順に一括置換）ではクロス汚染が発生（本番で「ドル円113.21」事故）
・★v12.1: Gemini修正指示は「削除するな、書き直せ」。charMin未満は絶対禁止
・★v12.1: TOKYO/LUNCHは「短くてもためになる」が軸。中身を薄くするための短さではない
・タイプ別方針変更 → 5ヘルパー関数内を修正（buildPrompt_本体触るな）
・scheduler.gsではトリガー設定を最優先
・設計図・設計書は内容が変わるたびにバージョン番号を上げること
・★v12.0: GASの同名関数は「後勝ち」（アルファベット順で後に読まれるファイルが有効）
  → 別ファイルで同名関数を定義しない。imageGenerator.gsの関数をリネーム済み

【投稿】
・1本で完結。どの1本を見ても楽しめる・学べる
・★v12.3: ストーリー主導。ホットなニュース1つが起点。データは裏付け証拠
  因果チェーン: 原因（何が起きた）→経路（なぜ・どう波及）→為替への影響
  まわりくどい説明禁止。1文で言い切り、→行で「なぜ」を補足
・仮説は条件分岐型 + 2層構造（構造仮説+今日の仮説）
・絵文字行 = 事実のメモ。短く言い切り。感想は→行で
・ネガティブ感情禁止（疲れた・胃が痛い・怖い・辛い）
・相場は敵じゃない。外れたら切り替える。切り替えの速さが武器
・★v12.0: 生活との接点はスケールの大きい話で（海外旅行・電気代・住宅ローン等）
  「ガソリン満タンにしますか？」等の小さい話は避ける
・問いかけは題材から毎回生成。固定ローテーション禁止
・アノマリーは「傾向」。ファンダ > アノマリー
・指示はシンプルに。OK/NG例の詰め込みは出力を似せる原因になる

【承認フロー（★v12.2修正）】
・投稿直前にスプレッドシートから再読み込み（手動編集を確実に反映）
・画像再生成時もスプレッドシートE列の最新テキストを使用
・★v12.2: validateモード復活（問題なし→自動投稿 / 問題あり→承認メール）
・★v12.2: ファクトチェック失敗時は強制manualモード
・★v12.2: Claudeフォールバック使用時はメールにオレンジ枠で通知
・★v12.2: クロスモデル検証が安全網の核心。同じモデルで生成と検証をやると同じ間違いを見逃す
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
Gemini API失敗（テキスト）  → 3回リトライ（★v12.2: 503も段階的10→20→30秒）→ ★Claudeフォールバック → エラーメール
Gemini API失敗（画像）      → 3回リトライ → テキストのみで続行
Twelve Data失敗             → レートキャッシュからフォールバック → エラーログ
Claude API 529              → 指数バックオフ（5→10→20秒）+ 3回リトライ
透かし合成失敗              → 透かしなしの画像で続行
X API失敗                   → 429:15分待ち / 403:メール通知
GAS 6分制限                 → 4分で安全弁発動（TIME_LIMIT_SEC=240）
ファクトチェック失敗         → ★v12.2: auto/validateでも強制manualモード
Gemini Pro 503全滅           → ★v12.2: Claudeで代替生成（メール通知付き）
全エラー                    → Gmailに自動通知 + Sheetsにエラーログ記録
```

---

## 12. バージョン履歴（直近のみ）

```
v12.6（2026-04-15）リグレッション防止 + fixHallucinatedRates_クロス汚染修正
  背景: 「1箇所直したら別の箇所が壊れる」が繰り返し発生。
        後処理チェーンの連鎖干渉、レート桁数の6ファイル散在（DRY違反）、テスト不在が根本原因。
        本番投稿で「ドル円は113.21、豪ドル円は113.21」（正: ドル円158.87）が発生。
        fixHallucinatedRates_がペア順に一括置換し、後から処理したAUD/JPYがUSD/JPYの値を上書き。
  ・testPostProcessor.gs: 新設。後処理チェーン不変条件テスト32ケース（API不要・数秒で完了）
  ・config.gs: formatRate_関数+RATE_DECIMALS定数追加（display=2/4桁、verify=3/5桁の一元管理）
  ・postProcessor.gs: fixHallucinatedRates_を「最近傍キーワード割り当て方式」に書き換え
    旧: ペア順に行内全レートを一括置換 → クロス汚染
    新: 行ごとに全キーワード位置収集 → 各レートを最近傍キーワードに割り当て → 位置ベース置換
  ・postProcessor.gs: USDパターン重複チェックを範囲重複に修正（「142.82」中の「2.82」誤検出防止）
  ・qualityReview.gs/geminiApi.gs/factCheck.gs/promptBuilder.gs: toFixed→formatRate_置換（計48箇所）
  ・main.gs: 🧪テストメニュー追加（後処理チェーンテスト+レートフォーマットテスト）
  ・geminiApi.gs: finalFactVerify_新設（最終事実検証。事実だけに集中した専用チェック+修正）
  ・postProcessor.gs: convertExactRatesToRange_新設（TOKYO/LUNCHのレート数値→「台」自動変換）
  ・promptBuilder.gs: TOKYO/LUNCHに「レートは台で表現」ルール追加
  ・設計思想: promptBuilder.gsは2,500行まで分割しない（安定稼働中。分割自体がリスク）

v12.5（2026-04-14/15）コード品質改善 + 品質レビュー大幅強化
  背景: Claude API呼び出しが3箇所に散在（209行）。品質レビューにカレンダー未注入でPPI捏造。
        Q6パッチ修正のいたちごっこ。口調定義が3箇所にハードコード。
  ・geminiApi.gs: callClaudeApi_共通関数統合（209行→90行）。executeRetry_ Claude化
  ・factCheck.gs: 死コード削除（qualityCheckPost_ -138行）
  ・qualityReview.gs: 経済カレンダー注入。Q6→全文再生成→2回目品質レビュー→パッチ修正
  ・qualityReview.gs: 口調一元管理（getCharacterPrompt動的読み込み。ハードコード口調全削除）
  ・config.gs: サマータイム自動調整（LONDON/GOLDEN/NY -60分）
  ・promptBuilder.gs: 口調末尾リマインダーにキャラクターシート動的再注入
  ・postProcessor.gs: 数値変化→で改行しない正規表現修正。fixHallucinatedRates_正規表現拡張

v12.4（2026-04-14）Claude主導アーキテクチャ + 確定データガード
  背景: Geminiが通貨強弱+2.95%のAUDを「豪ドル売り加速」と書く方向矛盾が頻発。
        Claude品質レビューがハルシネーション（「過去投稿に下落とある」）→Gemini修正が正しい投稿を壊す。
        クロスチェックは検出はできても修正ができない場合がある。確定データの方が確実。
  ・geminiApi.gs: 投稿生成をGemini→Claude化（callClaudeGenerate_新設）
  ・geminiApi.gs: qualityReviewPost_にrates, csData引数追加
  ・factCheck.gs: 確定データ6（通貨強弱）+ルール1c（方向チェック）追加
  ・factCheck.gs: autoFixPost_ Claude化 + 通貨強弱データ注入
  ・qualityReview.gs: Q7に体言止め判定追加
  ・qualityReview.gs: 修正ステップをGemini→Claude化 + 確定データガード
  ・promptBuilder.gs: 絵文字行の体言止めルール（OK/NG例付き）
  ・promptBuilder.gs: キャラクター口調リマインダー（プロンプト最末尾に配置）
  ・promptBuilder.gs: buildIndicatorPolicy_でINDICATOR対象指標を読み取り注入
  ・scheduler.gs: INDICATOR_TARGETをScriptPropertiesに保存
  ・config.gs: 月曜MORNING 07:28→08:03（原油先物開場+1h確保）
  ・imageGenerator.gs: 時間表現を原文から変えないルール
  ・設計思想: 確定データ > AI推論。クロスチェックより正しいデータを持つことが重要

v12.3（2026-04-10/12）4層安全網 + Claudeフォールバック + Web検索品質レビュー + ストーリー主導
  背景: Gemini 503エラーが頻発（2026年2月以降、全ユーザーに影響）。
        Flashフォールバックを試みたが品質が低く（153円問題等）、ファクトチェックとしても不正確。
        品質レビュー（Claude）に事実検証能力がなく、直近の要人発言を検証できなかった。
        投稿がデータ主導（通貨強弱の数字）になりがちで、読者にとって面白くなかった。
  ・qualityReview.gs: Claude品質レビューにWeb検索追加（web_search_20250305, max_uses:3）
  ・qualityReview.gs: systemパラメータでJSON出力強制 + JSONフォールバックパーサー
  ・qualityReview.gs: max_tokens 2000→4096 + MORNING TYPE_DESCRIPTIONS更新
  ・qualityReview.gs: TOKYO/LUNCH TYPE_DESCRIPTIONS文字数 60-150→100-180
  ・geminiApi.gs: 503リトライ段階的待機 + MAX_RETRIES 3→2（タイムアウト防止）
  ・geminiApi.gs: factCheckSkippedフラグ + Pro→Claude自動フォールバック（品質優先）
  ・main.gs: validateモード復活 + ファクトチェック失敗時の強制manualブロック
  ・imageGenerator.gs: 文字サイズ3層階層（フック優先）
  ・approval.gs: Claudeフォールバック通知をメールに表示（オレンジ枠）
  ・config.gs: TOKYO/LUNCH charMin 60→100 / charMax 150→180
  ・scheduler.gs: INDICATOR maxIndicators 2→1
  ・promptBuilder.gs: 題材選定ルール→ストーリー主導に改訂（ファンダ・地政学が起点）
  ・promptBuilder.gs: 投稿の構造→因果チェーン中心に再構成
  ・promptBuilder.gs: 市場系投稿の方針→ストーリー主導の鉄則+まわりくどい説明禁止
  ・設計思想: ストーリー主導（ニュースが起点→データは裏付け）+ クロスモデル検証

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
全体設計図 v12.6 / 設計書 v12.6 / 投稿プロンプト v5.1
スプレッドシート仕様書 v1.8 / アノマリー要件定義書 v1.0
完全自動学習型システム要件定義書 v2.1 / キャラクターシート v2.1
ファイル分割要件定義書 v2.6
v12.4 Claude主導アーキテクチャ要件定義書 v1.1
投稿スタイル方向転換要件定義書 v1.1
投稿品質レビューシステム要件定義書 v1.3
ダウ理論改善SH/SL要件定義書 v1.1
通貨強弱シート要件定義書 v1.3
リグレッション防止要件定義書 v1.1
```

---

*更新日: 2026-04-15 | v12.6（リグレッション防止+fixHallucinatedRates_クロス汚染修正+promptBuilder分割不要方針）*
