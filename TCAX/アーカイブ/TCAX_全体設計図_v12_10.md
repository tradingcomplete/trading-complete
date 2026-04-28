# T-CAX システム 全体設計図 v12.10

**プロジェクト名**: T-CAX（Trading Complete Auto X）
**コンセプト**: 「毎回その瞬間の最新情報で作成・即投稿」
**GASファイル**: 26本、合計約25,710行
**v12.10 変更点（投稿品質総合改善・2026-04-18）**:
  - ★factCheck 無効化フラグ導入: ScriptProperties DISABLE_FACTCHECK=true で Gemini factCheck/autoFix をスキップ。Claude品質レビュー+最終事実検証+対話型検証の3段構成に簡素化
  - ★Q6.5 論理整合性チェック追加(qualityReview.gs +54行): 「事実は正しいが論理が矛盾」パターンを検出
  - ★優先度付き修正プロンプト: Q6.5 > Q6 > Q5/Q7 > Q1/Q2/Q3 > Q4 の順で修正指示をソート
  - ★finalFactVerify 過剰修正防止(geminiApi.gs +16行): 時間軸を含む主張はスナップショット値で反証しない
  - ★ニュース取得 Gemini → Claude web_search に全面切替(marketAnalysis.gs +14行): Gemini Grounding 検索スキップ問題を根絶
  - ★プロンプト肥大化対策: 92→68セクション・29,686→22,677字。キャラクターシート末尾再注入廃止・TC関連/イベント系セクション統合・【最重要】ラベル乱発削減
  - ★キャラクターシート改善: 【共感】5セクション→1つに統合・【軽さと勢い】追加・【禁止事項】に「具体エピソード詰め込み禁止」追加
  - ★setupDisableFactCheck.gs 新設(257行): ScriptProperties 設定補助スクリプト(checkPropertyStatus・cleanOldImageMeta・setupDisableFactCheck等)
  - ★ScriptProperties整理: 古いIMG_*メタデータ54件削除(96→42件)。UI編集可能状態に復旧
  - 関連ドキュメント: 設計書 v12.10 / スプレッドシート仕様書 v2.0 / TCAX_REFERENCE.md v1.1
  - ファイル数: 25本 → 26本 (setupDisableFactCheck.gs 追加)。スプレッドシートは23シート(変更なし)
**v12.9 変更点**:
  - ★Q6確定データ強化: qualityReview.gs に collectAnchorData_ 注入。Claude時系列バイアスによる誤判定対策(+20行)
  - ★GOLDEN夜の材料ヒント注入: promptBuilder.gs に buildEveningMaterialHint_ 新設(+140行)
  - ★SCHEDULE整合性修正: config.gs 月〜金 times から 22:XX 削除。runMorning 異常発火対策
  - ★testFunctions.gs Lv2拡充: 260行→656行。15関数追加
  - ★TCAX_REFERENCE.md 新設: 事件簿4件 + ベストプラクティス10項目
  - スプレッドシートは23シート(変更なし)、ファイル数は25本(変更なし)
**v12.8 変更点**: タスク5-a/b/c 完了 + 対話型検証 Step 4 初稼働成功 + Phase A→B→C 全モード稼働。interactiveVerify.gs + testInteractiveVerify.gs 追加(計25ファイル)。スプレッドシートは23シート。

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

## 3. 投稿パイプライン（★v12.8 Phase A→B→C 全モード統一 + Step 4 対話型検証）

```
【Phase A: 生成Phase（目標3-4分・全モード共通）】

① ニュース収集（Gemini + Grounding ON）← Geminiが唯一得意なこと
   fetchMarketNews_ でTOP5ニュースを事前取得・1時間キャッシュ

①-b Claude市場分析（Claude Sonnet 4.6）← データ分析
   通貨強弱・ペア変動・商品価格・ニュースをClaudeが分析
   → 分析結果をプロンプトに【★★★】セクションとして注入

② ★v12.4: テキスト生成（Claude）← ライティング
   プロンプトの検証済みデータ + Claude市場分析に従って書く
   末尾にキャラクター口調リマインダー配置

③ 後処理チェーン（14段階）
④ リトライ群（executeRetry_で4パターン統合）

⑤ ファクトチェック検出（Gemini + Grounding ON）← タスク18で削除予定
   Layer 1: 確定データ照合（レート + 商品価格 + カレンダー + 要人 + 通貨強弱 + 継続中重大事象）
   Layer 2: Grounding検索で事実確認
   ❌ → autoFix（Claude + 確定データガード）→ 後処理再適用

⑥ 品質レビュー（Claude + Web検索）← タスク18で削除予定
   Q1〜Q7 の7項目チェック

⑦ 最終事実検証（検出=Claude JSON、修正=コード置換）← タスク18で削除予定

⑧ saveDraft + PHASE_B_POST_ID 設定 + 1分後 Phase B トリガー
   ★v12.7: 全モード(manual/validate/auto)で下書き保存必須


【Phase B: 品質整形Phase（目標3-4分・全モード共通）】★v12.7/v12.8

⑨ 品質レビュー 再実行（qualityReviewPost_）← 二重実行だが安全側
⑩ 最終事実検証 再実行（finalFactVerify_）
⑪ ★NEW: Step 4 対話型検証（interactiveVerify.gs）★v12.7 タスク17-a〜d
   Step 1: 検証質問抽出（Claude API 1回、Web検索なし）
           投稿本文から検証対象の主張を最大5件抽出
   Step 2: 一括Web検証（Claude API 1回、Web検索あり）
           各主張を ❌/⚠️/✅ で判定
   Step 3: 修正（Claude API 0-1回、❌/⚠️がある場合のみ）
           元投稿ベースで指摘箇所を書き換え
   有効化: INTERACTIVE_VERIFY_ENABLED = true (デフォルト)
   時間制限: 残り180秒以上の場合のみ実行
   ログ: 対話型検証ログシート(12列)に1行追加

⑫ 下書きシート更新 + PHASE_C_POST_ID 設定 + 1分後 Phase C トリガー


【Phase C: 画像生成+モード分岐Phase（目標2-3分・全モード共通）】★v12.7/v12.8

⑬ 画像生成（isImageGenerationType の5タイプのみ）
⑭ Drive 保存 + 画像メタデータ記録
⑮ factCheckSkipped=true or Phase Bエラー → manual 強制降格
⑯ POST_MODE による分岐:
   ├ manual   → 承認メール送信 → ステータス「承認待ち」
   ├ validate → validatePost → 通過→executePhaseCPost_(直接投稿)
   │                        / NG→承認メール + 失敗理由記録
   └ auto     → executePhaseCPost_(直接投稿 + 15分間隔チェック)

⑰ 投稿成功 → savePost + extractPostInsights_ + last_post_time 更新


★v12.8 設計思想(クラスフロー):
  3モードハンドラー(handleManualMode_ / handleValidateMode_ / handleAutoMode_)は
  対称形に統一。「saveDraft + Phase B トリガー」のみの最小実装(各30-40行)。
  モード固有の挙動は全て Phase C の currentMode 分岐に集約。
  これにより、新モード追加時の影響範囲が Phase C 内に限定される。

★v12.4 設計思想:
  クロスチェック（異モデル検証）より、正しいデータを握っていることが重要。
  通貨強弱+2.89%があれば、どのモデルが何を言っても「上昇」が事実。
  Gemini = 検索（Grounding）専用。ライティングと修正はClaude。
  スプレッドシートの確定データが「真実のアンカー」。
  ★v12.7追加: 継続中重大事象シート(㉑)が地政学リスクの「真実のアンカー」として機能。

★v12.8 Geminiの残存箇所（4つ）:
  ・ニュース取得（fetchMarketNews_）: Grounding ON
  ・ファクトチェック検出（factCheckPost_）: Grounding ON ← タスク18で削除予定
  ・画像生成（imageGenerator.gs）: gemini-2.5-flash-image
  ・Phase A 品質レビュー時のweb検索補助
  それ以外の全ての生成・修正・Step 4 対話型検証はClaude。
  タスク19 完了時にGemini依存を更に削減。
```

---

## 4. GASファイル構成（25ファイル・★v12.8行数更新）

```
ファイル                  行数    役割
────────────────────────────────────────────────────
geminiApi.gs              1,923   核: generatePost + Claude市場分析 + finalFactVerify_ + collectAnchorData_ + Step 4配線 ★v12.10: DISABLE_FACTCHECKフラグ + finalFactVerify過剰修正防止
promptBuilder.gs          2,105   プロンプト構築 ★v12.10: 末尾キャラクター再注入廃止・TC関連ヘッダ統合・buildMarketTypePolicy_整理(【最重要】ラベル削減・【経済イベントの日付・時制】統合)
postProcessor.gs          2,130   後処理チェーン14段階
factCheck.gs              533     ファクトチェック ★v12.10: DISABLE_FACTCHECK=trueで無効化(ロジックは温存・緊急ロールバック用)
qualityReview.gs          679     品質レビュー+修正 ★v12.10: Q6.5論理整合性追加 + 優先度付き修正プロンプト(+54行)
anomalyManager.gs         1,041   アノマリー自動判定 + 祝日通知
config.gs                 773     設定値 + POST_TYPES + formatRate_ + INTERACTIVE_VERIFY_ENABLED + SCHEDULE整合性修正
rateManager.gs            1,635   レート取得・保存・検証
marketAnalysis.gs         908     市場分析（通貨強弱・ニュース・背景フィールド）★v12.10: fetchMarketNews_ Gemini→Claude web_search切替
indicatorManager.gs       1,154   経済指標の取得・解析
learningManager.gs        873     学び・仮説の抽出・検証
priceSummary.gs           874     価格サマリー集計
calendarManager.gs        784     経済カレンダー取得
testFunctions.gs          656     運用監視・3シート確認・Q6シナリオ別・Phase 3分割テスト
testPostProcessor.gs      392     後処理チェーン不変条件テスト（32ケース）
imageGenerator.gs         898     AI画像生成 + 透かし合成
scheduler.gs              722     トリガー管理・サマータイムオフセット適用
main.gs                   1,349   ★v12.10: 死体コード削除(executePhaseBImageAndEmail等)で 1,440→1,349行
sheetsManager.gs          2,059   スプレッドシート読み書き + 対話型検証ログ + 未来日付ガードログ + 継続中重大事象
approval.gs               1,119   承認フロー + メール送信
xApi.gs                   654     X API v2投稿（OAuth 1.0a）
applyPairColors.gs        245     通貨ペア色分け
utils.gs                  172     ユーティリティ
interactiveVerify.gs      819     対話型検証本体（Step1-3の3関数）
testInteractiveVerify.gs  1,180   対話型検証テスト基盤（19関数・11テストケース）

★v12.10 新規追加:
setupDisableFactCheck.gs   257    ★NEW: ScriptProperties 設定補助(checkPropertyStatus / cleanOldImageMeta / setupDisableFactCheck / rollbackDisableFactCheck / setupAllAtOnce)
────────────────────────────────────────────────────
合計: 26ファイル・約25,710行

★v12.10 GAS反映済み(2026-04-18時点):
  ・geminiApi.gs: 1,923行(DISABLE_FACTCHECK / finalFactVerify過剰修正防止)
  ・qualityReview.gs: 679行(Q6.5追加・優先度付き修正プロンプト)
  ・promptBuilder.gs: 2,105行(末尾キャラ重複削除・buildMarketTypePolicy整理)
  ・marketAnalysis.gs: 908行(fetchMarketNews_ Claude web_search切替)
  ・main.gs: 1,349行(死体コード削除)
  ・setupDisableFactCheck.gs: 257行(新規・ScriptProperties 設定補助)

★v12.10 実測効果:
  ・プロンプト文字数: 29,686 → 22,677 字 (-24%)
  ・セクション数: 92 → 68 個 (-26%)
  ・ニュース取得ソース: 0-10件 → 50件 (Claude web_search効果)
  ・ハルシネーション検出率: Q6.5追加で論理矛盾100%検出
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
INTERACTIVE_VERIFY_ENABLED（対話型検証の有効/無効・デフォルト=有効）
★v12.10新規:
  DISABLE_FACTCHECK（'true'で Gemini factCheck 無効化・デフォルト=無効化扱い）

【ScriptProperties の制約】
  UI経由の編集・追加は50個まで（GASの仕様）。
  超過した場合は setupDisableFactCheck.gs 経由で操作する:
    - checkPropertyStatus(): 現状確認(読み取り専用・安全)
    - cleanOldImageMeta(): 14日前より古い IMG_* メタデータ削除
    - setupDisableFactCheck(): DISABLE_FACTCHECK=true 設定
    - rollbackDisableFactCheck(): 緊急ロールバック('false'設定)
  運用中は画像メタデータ(IMG_*)が累積するので、定期的に cleanOldImageMeta 実行推奨。

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
GAS 6分制限                 → 5分で安全弁発動（★v12.6: TIME_LIMIT_SEC=300。Phase B分離済みで安全）
ファクトチェック失敗         → ★v12.2: auto/validateでも強制manualモード
Gemini Pro 503全滅           → ★v12.2: Claudeで代替生成（メール通知付き）
全エラー                    → Gmailに自動通知 + Sheetsにエラーログ記録
```

---

## 12. バージョン履歴（直近のみ）

```
v12.10（2026-04-18 完成）投稿品質総合改善(8段階)

  背景: コンパナから「毎投稿、正直おかしい文章が多く、承認時の判断負担が大きい」
    朝8:22 WEEKLY_REVIEW で論理矛盾・Gemini偽ニュース・finalFactVerify過剰修正・
    プロンプト肥大化(29,686字・92セクション)が同時発生

  8段階の改善:
    1. factCheck無効化: ScriptProperties DISABLE_FACTCHECK=true
    2. Q6.5論理整合性追加: qualityReview.gs +54行
    3. 優先度付き修正プロンプト: Q6.5>Q6>Q5/Q7>Q1-Q3>Q4
    4. キャラクターシート末尾再注入廃止: 12セクション重複解消
    5. finalFactVerify過剰修正防止: 時間軸を含む主張の保護
    6. プロンプト重複削除: TC関連ヘッダ統合・【最重要】ラベル削減
    7. キャラクターシート改善: 【共感】統合・【軽さと勢い】追加
    8. ニュース取得Claude web_search切替: Gemini Grounding問題根絶

  実測効果(朝→夕方):
    プロンプト文字数: 29,686 → 22,677 字 (-24%)
    セクション数: 92 → 68個 (-26%)
    ニュース取得ソース: 0-10件 → 50件
    Q6.5論理矛盾検出: 該当投稿で100%検出・修正
    finalFactVerify過剰修正: ゼロ化
    最終投稿品質: 論理一貫・事実正確・鮮度良好

  ファイル変更:
    main.gs: 1,440→1,349行(死体コード削除)
    geminiApi.gs: 1,893→1,923行(+16行)
    qualityReview.gs: 625→679行(+54行)
    promptBuilder.gs: 2,116→2,105行(整理統合)
    marketAnalysis.gs: 894→908行(+14行)
    setupDisableFactCheck.gs: 新規257行
    合計: 25→26ファイル・約25,000→25,710行

  関連ドキュメント:
    設計書 v12.10
    スプレッドシート仕様書 v2.0
    TCAX_REFERENCE.md v1.1(事件5)

  残課題(次回以降):
    プロンプト文字数まだ目標15,000字に対し22,677字(約50%オーバー)
    Phase 2-3 の統合案B/C/D/A が未実施
    本番運用での Claude web_search 安定性は要観察


v12.9（2026-04-17 完成）Q6確定データ強化 + GOLDEN夜の材料ヒント + SCHEDULE整合性修正
  背景: 2026-04-17 運用中に発覚した2件の事件を根本解決。
        事件1: runMorning 22:11異常発火(config.gsのtimes/types配列不整合)
        事件2: Phase B Q6 RBA利下げ誤判定(Claude時系列バイアス)
  目標: 再発防止 + Claude主導アーキテクチャの完全性確保。
  
  【達成した成果】
  ・Q6確定データ強化(qualityReview.gs 605→625行、+20行):
    - collectAnchorData_(postType) を呼び出す注入ブロックを追加
    - 政策金利・通貨強弱・継続中重大事象を Q6 プロンプトに注入
    - 判定優先順位を明示(カレンダー > 確定データ > 本文 > Web検索 > 内部知識)
    - testQReviewRBA で RBA 利上げサイクル判定の正答を確認
  
  ・GOLDEN夜の材料ヒント注入(promptBuilder.gs 1,976→2,116行、+140行):
    - buildEveningMaterialHint_(postType) 関数を新設
    - 経済カレンダーから GOLDEN 投稿(20-21時台)以降の材料を動的抽出
    - 重要度別分類(高=軽く触れる/中=目線述べる/要人発言=別枠)
    - INDICATOR 投稿との重複回避設計
    - 静かな日(材料なし)は空文字返却で「今夜の材料」セクション省略
  
  ・SCHEDULE整合性修正(config.gs 771→773行):
    - 月〜金の times 配列から 22:XX (NYスロット) を削除
    - types/times が全曜日で要素数一致(不整合解消)
    - runMorning 異常発火の根本対策
    - verifyScheduleIntegrity() で自動検証可能
  
  ・testFunctions.gs Lv2拡充(260→656行、+396行):
    - 15関数追加: verifyScheduleIntegrity / checkTriggers /
      testOngoingEventsSheet / testInteractiveVerifyLogSheet / testFutureDateGuardLogSheet /
      testInteractiveVerifyUnit / testCollectAnchorData /
      testQReviewRBA / testQReviewFOMC / testQReviewOngoingEvents /
      testShowPhaseStatus / testPhaseBOnly 等
    - testPro_NY 削除(NY廃止のため)
  
  ・ドキュメント新設:
    - TCAX_REFERENCE.md v1.0 (504行): 事件簿4件 + ベストプラクティス10項目
    - Trading Complete の REFERENCE.md とは別管理
  
  【事件解決の実績】
  ・runMorning 22:11異常発火(同日夜):
    - トリガー一括リセット(11件→5件)で緊急対応
    - 下書き中止
    - config.gs 修正で根本対策
    - verifyScheduleIntegrity() で全曜日 times=types 確認済み
  ・RBA 利下げ誤判定:
    - Q6 確定データ強化 + 優先順位明示で対策
    - testQReviewRBA で「2026年3月利上げ、政策金利4.10%」を根拠に正判定を確認

v12.8（2026-04-17 完成）タスク5-a/b/c 完了 + 対話型検証 Step 4 初稼働成功
  背景: v12.7 Phase 2 (A/B/C 3分割) のタスク4 完了後、タスク5 が「コード存在・本番未接続」状態で発見。
        実コード調査で handleManualMode_ だけでなく handleValidateMode_ / handleAutoMode_ も
        大規模改修が必要と判明。要件定義v1.8 の記述が不完全だったことも判明。
  目標: Phase A→B→C の非同期パイプラインを全モードで稼働させ、対話型検証を本番フロー内で動作させる。
  
  【達成した成果】
  ・タスク5-a(約1時間): handleManualMode_ トリガー切替 + Phase C トリガー有効化
    - executePhaseBImageAndEmail → executePhaseBQualityReview へ切替
    - executePhaseBQualityReview 末尾の Phase C トリガー設定コメントアウト解除(正常系+異常系)
  ・タスク5-b(約30分): handleValidateMode_ 88行 → 38行簡素化
    - バリデーション判定を Phase C に完全委譲
    - 画像生成・投稿・savePost を Phase C に集約
  ・タスク5-c(約20分): handleAutoMode_ 63行 → 40行簡素化
    - 15分間隔チェックを executePhaseCPost_ に移植(既に実装済み)
    - 全モードで下書き必須化 → 緊急中止ウィンドウ 約2分間確保
  ・対話型検証 Step 4 初稼働(2026-04-17 16:00 runMorning):
    - claim 5件抽出 / ❌0件 / ⚠️1件 / ✅4件 / 修正発動
    - 経過時間 38秒、Claude API 3回
    - 対話型検証ログシートに初回レコード VL_20260417_160034_4012
  
  【コード変化】
  ・main.gs: 1,497行 → 1,440行 (-57行の簡素化)
  ・3モードハンドラーが対称形に統一（各30-40行・「saveDraft + Phase B トリガー」のみ）
  ・旧 executePhaseBImageAndEmail は dead code として保持（タスク5-d で削除予定）
  
  【次のマイルストーン】
  M3: 対話型検証ON のまま1-2週間運用 → ログ100件超蓄積 → タスク18 の判断材料取得
  M4: タスク18(factCheck削除) → Claude API 回数約半減
  M5: タスク19(Claude統一) → Gemini依存を最小化
  M6: validateモード切替 → M7: autoモード切替 → 完成宣言

v12.7（計画中・2026-04-17〜）Phase 3分割 + 未来日付ガード（完全自動運用への最終章）
  背景: 2026-04-16本番MORNINGで「4/17のトランプ発言を4/16投稿に混入」事故。
        ファクトチェック・品質レビュー・最終検証の3段全てを通過し発信直前まで到達。
        根本原因: Phase A（1トリガー=6分）に検証と修正を全詰めし、Gemini 503フォールバック時に品質崩壊。
        未来日付検証の専用ロジックがない。autoモードで下書きすら作られず事故時の中止手段ゼロ。
  目標: 人間が毎回確認しなくても誤情報が出ない「完全自動運用」の実現。
  
  【Phase 1: 未来日付ガード（約2時間・APIコスト0・先行実装推奨）】
  ・marketAnalysis.gs: fetchMarketNews_に未来日付フィルタ追加（Gemini取得段階で除外）
  ・postProcessor.gs: removeFutureDateLines_新設（投稿本文の過去形＋未来日付を検出削除）
  ・testPostProcessor.gs: 未来日付ガードのテストケース7件追加（False Positive防止）
  ・geminiApi.gs: finalFactVerify_に「今日の日付」を明示注入（Claudeの判定精度向上）
  ・sheetsManager.gs: 未来日付ガード発動ログシート新設（週次レビュー用）
  ・ホワイトリスト: 「〜予定」「〜に注目」等の未来予定文脈は保持。過去形文脈のみ削除
  
  【Phase 2: A/B/C 3分割（約8時間・要件定義v1.2準拠）】
  ・main.gs: Phase A縮小（生成+簡易チェック）+ Phase B新設（品質整形）+ Phase C（画像+投稿）
  ・sheetsManager.gs: 下書きシートI〜N列追加（PhaseA/B完了時刻+FactCheckJSON+CSData等）
  ・sheetsManager.gs: 列数ハードコード（"8"）をDRAFT_COLS定数に一元化
  ・approval.gs: LAST_FACT_CHECK_参照を下書きシート参照に移行
  ・scheduler.gs: ハートビート監視（15分おき。Phase不発検知→異常メール通知）
  ・scheduler.gs: トリガー登録上限監視（20個）。1時間経過の一時トリガー自動削除
  ・★autoモードでも下書きが必ず作られる設計（緊急中止ウィンドウ約2分）
  ・★factCheckSkipped=true時は Phase Cで強制manual降格
  
  【Phase 3: テスト・段階デプロイ（約4.5時間）】
  ・testPhaseA/B/C個別テスト関数
  ・3Phase統合テスト（MORNING→全16タイプ）
  ・移行手順: 下書きシート完全クリア → 旧トリガー削除 → 新トリガー設定
  ・段階移行: Day1-7 manualモード → Day8-14 validateモード → Day15- autoモード
  
  【設計思想】
  ・Write-Then-Review: 生成と検証を別Phaseに分離。「一晩寝かせてから推敲する」人間の知恵のシステム化
  ・確定データ > AI推論（v12.4から継承）
  ・完全自動でも下書きは残す。事後分析と緊急中止手段を確保
  ・API呼び出し回数は増加ゼロ。コスト±0円

v12.6.1（2026-04-16）コード品質改善（4項目・30分で実装完了）
  ・config.gs: CLAUDE_MODEL定数追加（ハードコード廃止。GEMINI_MODELと同じ管理方針）
  ・config.gs: ScriptProperties全24キー一覧コメント追加（永続13+揮発11）
  ・config.gs: POST_TYPESからhasImageフィールド廃止（IMAGE_TYPE_COLORSで一元管理）
  ・geminiApi.gs: サイレントcatch 9箇所にログ追加（完全自動運用時のサイレント劣化防止）
  ・qualityReview.gs: Q6「全文再生成」を「元投稿ベース事実修正」に変更（API 3回→1回）
  ・qualityReview.gs: サイレントcatch 5箇所にログ追加
  ・scheduler.gs: ログ表示をisImageGenerationType()参照に変更
  ・設計思想: 完全自動運用では「静かに劣化する」ことが最大のリスク。ログなしcatchは禁止

v12.6（2026-04-15/16）リグレッション防止 + 最終事実検証 + TOKYO/LUNCHレート台変換
  背景: 「1箇所直したら別の箇所が壊れる」が繰り返し発生。
        品質レビュー（Q1-Q7同時）が注意分散で「159円台まで円高」（正: 円安）を見逃す。
        本番TOKYO投稿で「ドル円は113.21、豪ドル円は113.21」クロス汚染が発生。
  ・testPostProcessor.gs: 新設。後処理チェーン不変条件テスト40ケース（API不要・数秒で完了）
  ・config.gs: formatRate_関数+RATE_DECIMALS定数追加（display=2/4桁、verify=3/5桁の一元管理）
  ・postProcessor.gs: fixHallucinatedRates_を「最近傍キーワード割り当て方式」に書き換え（クロス汚染修正）
  ・postProcessor.gs: convertExactRatesToRange_新設（TOKYO/LUNCHのレート数値→「台」自動変換）
  ・postProcessor.gs: USDパターン重複チェックを範囲重複に修正（「142.82」中の「2.82」誤検出防止）
  ・geminiApi.gs: finalFactVerify_新設（最終事実検証。JSON検出+コード置換方式）
    Step 1: Claude APIでJSON出力強制 → {hasErrors, errors: [{wrong, correct, reason}]}
    Step 2: コードでreplace(wrong, correct)を機械的に適用
    確定データ: レート+始値+通貨強弱+カレンダー+政策金利+要人
    correctフィールド汚染検出（括弧付き説明、メタ表現、3倍超長さ→スキップ）
    wrong===correctスキップ、四捨五入差は誤りとしない
    切れたJSON修復（reason途中切断時にフォールバック補完）
    ★本番NY投稿で「円高→円安」の方向誤りを自動検出・自動修正（効果実証済み）
  ・geminiApi.gs: TIME_LIMIT_SEC 240→300秒に緩和（Phase B分離済みで安全）
  ・qualityReview.gs/geminiApi.gs/factCheck.gs/promptBuilder.gs: toFixed→formatRate_置換（計48箇所）
  ・promptBuilder.gs: TOKYO/LUNCHに「レートは台で表現」ルール追加
  ・main.gs: 🧪テストメニュー追加
  ・設計思想: promptBuilder.gsは2,500行まで分割しない。Claudeは検出だけ、修正はコード

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
★v12.9 時点の最新版:
  全体設計図 v12.9 / 設計書 v12.9
  TCAX_REFERENCE.md v1.0(NEW・事件簿+ベストプラクティス)

★v12.8 継続版:
  Phase 3分割+未来日付ガード要件定義書 v2.2
  完全自動学習型システム要件定義書 v2.2
  スプレッドシート仕様書 v1.9

★その他(変更なし):
  投稿プロンプト v5.1 / アノマリー要件定義書 v1.0
  キャラクターシート v2.1 / ファイル分割要件定義書 v2.6
  v12.4 Claude主導アーキテクチャ要件定義書 v1.1
  投稿スタイル方向転換要件定義書 v1.1
  投稿品質レビューシステム要件定義書 v1.3
  ダウ理論改善SH/SL要件定義書 v1.1
  通貨強弱シート要件定義書 v1.3
  リグレッション防止要件定義書 v1.1
```

---

## 14. ★NEW: 完成への道のり（2026-04-17時点）

```
【現在地】
  機能実装: ほぼ完成（v12.6.1）
  手動承認モード運用: 安定
  **Phase A→B→C パイプライン**: ✅ 2026-04-17 完成・manualモードで本番稼働確認済み
  **対話型検証 Step 4**: ✅ 2026-04-17 16:00 本番フロー内で初稼働成功
  完全自動運用: validate/autoモードのコード実装完了・実運用検証待ち
  
【完成定義】
  人間が毎回目視確認しなくても、誤情報を発信せずに月179投稿が回り続ける状態。

【v12.8 達成済み課題】
  ✅ 課題1: 未来日付ハルシネーション混入
     → v12.7 Phase 1 + 未来日付ガードログシート(㉓) で止血・監視
  ✅ 課題2: Phase A過負荷によるフォールバック時の品質崩壊
     → v12.7 Phase 2 で A/B/C 3分割完成。各Phase 3-4分枠で余裕
  ✅ 課題3: autoモードで下書きが作られず事故時の中止手段なし
     → v12.8 タスク5-c で autoモードも下書き必須化。緊急中止ウィンドウ 約2分間確保

【v12.8以降の残課題】
  課題4: 対話型検証の実効果測定(1-2週間の運用データ取得)
     → 100件超のログ蓄積で ❌/⚠️/✅ 分布を把握
  課題5: Phase A内の既存検証との重複コスト削減
     → タスク18(factCheck削除 + Q6削除)で Claude API 回数を約半減

【マイルストーン】
  ✅ M1(止血完了): Phase 1デプロイ → 1週間運用 → 未来日付混入ゼロ確認
  ✅ M2(基盤完成): Phase 2+タスク5-a/b/c デプロイ → manualモードで稼働確認済み
  🔄 M3(実効果測定): 対話型検証ON のまま1-2週間運用 → ログ100件超蓄積
  ⬜ M4(検証層最適化): タスク18 → Phase A内検証削除 → コスト半減
  ⬜ M5(Claude統一): タスク19 → Gemini依存を最小化
  ⬜ M6(半自動運用): validateモード切替 → 1週間運用
  ⬜ M7(完全自動運用): autoモード切替 → 連続7日間179投稿事故ゼロで完成宣言
  
【完成後の世界】
  毎朝PCを起動して投稿を確認する作業が不要になる。
  月27,000円相当（9時間/月）の人間工数が解放される。
  その時間をTC開発・新機能企画・休養に回せる。
  T-CAXはFX情報発信の無人プラットフォームとして完成する。
```

---

*更新日: 2026-04-17 | v12.9（Q6確定データ強化 + GOLDEN夜の材料ヒント + SCHEDULE整合性修正 + testFunctions.gs Lv2拡充 + TCAX_REFERENCE.md 新設）*
*更新日: 2026-04-17 | v12.8（タスク5-a/b/c 完了 + Step 4 初稼働 + Phase A→B→C 全モード稼働達成。M3実効果測定フェーズへ）*
