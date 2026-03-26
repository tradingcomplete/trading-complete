# T-CAX システム 全体設計図 v8.8.1

**プロジェクト名**: T-CAX（Trading Complete Auto X）
**コンセプト**: 「毎回その瞬間の最新情報で作成・即投稿」
**更新日**: 2026-03-26
**v8.8.1変更点**: Geminiモデル gemini-2.5-flash→gemini-2.5-pro変更（文字数遵守・指示追従の大幅改善）、リトライ4パターンをexecuteRetry_共通化（geminiApi.gs 537→566行）、countEmojis_/checkMultiArrowBlocks_分離、postProcessor.gsの\b除去（設計の鉄則準拠）、testFunctions.gs再構成（819→225行・testAll1-6廃止→testPro_*/testRULE/testWEEK）、★投稿構造の根本改革: ニュース要約型→仮説サイクル型（promptBuilder.gs 1,539→1,581行・投稿プロンプトシート市場系6タイプ書き換え）
**v8.8変更点**: 後処理チェーン共通関数化（geminiApi.gs 638→537行）、INDICATOR主役ペア除外、GAS 6分タイムガード、メタ自己言及除去、孤立助詞バグ修正、Excel許可リスト、残り時間表現除去、プロンプトセクション数削減（71→53）
**v8.7変更点**: 確定データシート化（POLICY_RATESハードコード廃止→スプレッドシート一元管理）、要人リスト新設（factCheck/promptBuilderに確定データ注入）
**v8.6変更点**: プロンプト最適化（キャラクターシート9→5行統合、buildFormatRules_タイプ別条件分岐、セクション数93→68）、レート混同バグ修正（postProcessor.gs）、ファクトチェック検証不能❌即削除（factCheck.gs+geminiApi.gs）、品質レビューシステム新設（Claude Sonnet 4.6によるクロスチェック）、投稿文字数制御改善、scheduler.gs処理順序変更
**v8.5変更点**: geminiApi.gsファイル分割（9,398行→567行・11ファイル）、政策金利config.gs一元管理化
**v8.4変更点**: factCheckPost_カレンダースコープ修正、仮説検証ログ登録対象拡張（全市場系）、仮説抽出3要素構造化

---

## 1. システム概要

```
【移行前（Manus）】
  ・1日2回まとめ作成（朝3本 + 夜3本）→ 手動投稿
  ・情報が古くなる / 投稿時間がバラバラ
  ・画像はGemで手動作成（毎回バラバラ）
  ・月額 $39

【移行後（GAS + Gemini + Twelve Data）】★システム実装完了
  ・1日6回 x 1投稿ずつ都度作成 → 即自動投稿
  ・エンゲージメント最適時間に配置
  ・指標30分前に動的投稿
  ・週末は心得枠4投稿（Trading Complete導線）
  ・市場系6タイプ → AI画像自動生成（Gemini + TC透かし）★v5.4
  ・月額 $0（X Premium枠で投稿無料）
```

### 使うサービス

```
・Google Apps Script（GAS）  → 自動実行エンジン（無料）
・Gemini API                 → テキスト生成（gemini-2.5-pro）+ 画像生成（gemini-3-pro-image-preview）★v8.8.1モデル更新
・Google Slides API          → 透かし合成用（無料）★v5.4で追加
・Twelve Data API            → 為替レート取得（無料枠: 800クレジット/日）
・Google Sheets              → データ保存・キャラクター定義（無料）
・Google Drive               → 投稿画像保存（無料）
・X API v2                   → 投稿（X Premium枠）
・Claude API                 → 品質レビュー（Claude Sonnet 4.6）★v8.6で追加
```

---

## 2. 投稿スケジュール

### 平日（月〜金）6投稿

```
❶ 07:30頃  🌅 朝の市場チェック                    📷AI画像
❷ 09:20頃  📊 東京オープン後ブリーフィング
❸ 12:10頃  🍱 ランチタイムまとめ
❹ 17:20頃  🌆 ロンドンオープンレポート              📷AI画像
❺ 20:50頃  🔥 夜のゴールデンタイム
❻ 22:10頃  🗽 NY市場オープン前                      📷AI画像
⚡ 指標連動（重要指標の30分前）                     📷AI画像
```

### 土曜日（4投稿）

```
❶ 08:22  📋 今週の振り返り                        📷AI画像
❷ 11:48  🧠 心得①（知識・原則系）
❸ 15:14  💪 心得②（習慣・メンタル系）              📷Drive画像
❹ 20:32  📝 今週の学び + 来週に向けて
```

### 日曜日（4投稿）

```
❶ 10:18  🧠 心得③（実践テクニック系）
❷ 14:13  🔮 来週の注目イベント整理                 📷AI画像
❸ 17:42  💡 心得④（失敗談・本音系）
❹ 20:28  💭 来週の仮説 + 心構え
```

### 曜日別1分単位スケジュール（Bot判定回避）

```
【平日】
       ❶朝     ❷東京前   ❸ランチ   ❹ロンドン  ❺ゴールデン ❻NY前
月曜   07:28    09:18     12:08     17:22      20:47      22:13
火曜   07:43    09:33     12:14     17:18      20:53      22:07
水曜   07:35    09:11     12:06     17:28      20:42      22:18
木曜   07:47    09:26     12:19     17:14      20:56      22:04
金曜   07:22    09:38     12:11     17:24      20:49      22:11

【土曜】  ❶振り返り  ❷心得①   ❸心得②   ❹学び
          08:22      11:48     15:14     20:32

【日曜】  ❶心得③    ❷イベント  ❸心得④   ❹仮説
          10:18     14:13      17:42     20:28

※ 毎回 ±0〜5分のランダムゆらぎ追加
```

### 月間投稿数

```
平日: 6 x 22日 = 132 / 土曜: 4 x 4 = 16 / 日曜: 4 x 4 = 16
指標連動: 約15件 → 合計: 約179件/月（X Premium枠 → 投稿無制限）
```

---

## 3. 画像システム ★v6.0でAI画像のみに統一

### 3-1. 方式概要

```
★v6.0変更: TC Drive画像マッチ（方式B）を廃止。AI画像生成のみに統一。
  理由: TC投稿画像は20枚と少なく、マンネリしやすい。AI画像の方がバリエーション豊か。

【AI画像生成 + TC透かし合成】★v5.4で実装完了
  対象: 市場系（MORNING, LONDON, NY, INDICATOR, WEEKLY_REVIEW, NEXT_WEEK）
  方式: Gemini画像生成 → Google Slides API透かし合成 → PNG出力
  → サイバーパンク風の高品質画像を自動生成
  → TCロゴの透かしでブランド認知

【画像なし】
  対象: TOKYO, LUNCH, GOLDEN, RULE_1〜4, WEEKLY_LEARNING, WEEKLY_HYPOTHESIS, KNOWLEDGE
```

### 3-2. 方式A: AI画像生成（★v5.4で実装完了）

```
生成フロー:
  ① 投稿テキストから情報を80%断捨離（核心ワードだけ抽出）
  ② 12アーキタイプから投稿タイプに適した構図を自動選定
  ③ Gemini gemini-3-pro-image-preview でサイバーパンク画像を生成
  ④ Google Slides APIでTC透かしロゴを合成
  ⑤ 最終PNG出力（約1000〜1800KB）

画像の構成:
  ・Gemini生成画像（サイバーパンク風、日本語テキスト入り）
  ・TC透かしロゴ（右下に控えめに表示）

投稿タイプ別アクセントカラー:
  MORNING       サイアン(水色)    MORNING BRIEF
  LONDON        ネオン緑          LONDON REPORT
  NY            ネオン紫          NY PREVIEW
  INDICATOR     ネオン赤          INDICATOR ALERT
  WEEKLY_REVIEW ゴールド          WEEKLY REVIEW
  NEXT_WEEK     ネオン緑          NEXT WEEK
```

### 3-3. 12アーキタイプ（構図バリエーション）★v5.4で追加

```
構図名                      特徴                    適合タイプ
────────────────────────────────────────────────────────────
ストラクチャード・リスト    一覧形式                WEEKLY_REVIEW, NEXT_WEEK
セントラル・フォーカス      中央強調                INDICATOR, MORNING
デュアル・コントラスト      左右対比                MORNING, LONDON, NY
フロー＆パースペクティブ    奥行・分岐              NY, NEXT_WEEK
クローズアップ・メカニズム  内部拡大                INDICATOR, MORNING
トップダウン・ブループリント 俯瞰図                WEEKLY_REVIEW
ダイナミック・アクション    動き・勢い              LONDON, NY
マインド・ゲーム           心理・駆け引き           NY, MORNING
ブレイクスルー・インパクト  衝撃・突破              INDICATOR, LONDON
サイクル＆リズム           周期・循環               WEEKLY_REVIEW, NEXT_WEEK
クラウド・センチメント      群衆心理                MORNING, LONDON
ネットワーク・コネクション  相関関係                WEEKLY_REVIEW, NEXT_WEEK

※ マンネリ防止: 直近使用したアーキタイプは除外して選定
※ 再生成時: 前回のアーキタイプを明示的に除外
```

### 3-4. 透かし合成の仕組み ★v5.4で追加

```
Google Slides APIを使った2レイヤー合成:

  Layer 1: Gemini生成画像（720x405、全面）
  Layer 2: TC透かしロゴPNG（720x405、全面オーバーレイ）
    → 透過PNG: ロゴ以外は完全透明
    → 右下にTCロゴが控えめに表示

処理フロー:
  ① 空のプレゼンテーションを作成（16:9）
  ② Gemini画像をinsertImage（全面）
  ③ 透かしPNGをinsertImage（オーバーレイ）
  ④ Slides API thumbnailエンドポイントでPNG出力（LARGE: ~1600px幅）
  ⑤ 一時プレゼンテーションを自動削除

必要設定:
  ・GASで Google Slides API 高度なサービスを有効化
  ・スクリプトプロパティ WATERMARK_IMAGE_ID に透かしPNGのDriveファイルIDを設定
```

### 3-5. 画像をつける/つけない（最終形）★v6.0更新

```
【AI画像生成】★v5.4で実装完了
  ❶朝 / ❹ロンドン / ❻NY前 / ⚡指標
  土❶振り返り / 日❷イベント

【画像なし】
  ❷東京前 / ❸ランチ / ❺ゴールデン
  土❷心得① / 土❸心得② / 土❹学び
  日❶心得③ / 日❸心得④ / 日❹仮説
  KNOWLEDGE

★v6.0変更: RULE_2のDrive画像マッチを廃止。全RULE系は画像なし。
  関連関数（getMatchedDriveImage_, selectBestImage_, setupImageFolders）も削除済み。
```

---

## 4. システム全体図

```
┌──────────────────────────────────────────────────────────────┐
│                    Google Apps Script                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  スケジューラ                                         │    │
│  │  固定: 平日6回 + 土日各4回                            │    │
│  │  動的: 指標30分前                                     │    │
│  │  レート: 1時間ごと自動取得（Twelve Data API）         │    │
│  │  曜日別1分単位 + ±0〜5分ランダム                      │    │
│  └──────────┬────────────────────────┬─────────────────┘    │
│             ▼                        ▼                       │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  投稿生成エンジン（毎回1投稿）                        │    │
│  │                                                      │    │
│  │  ① Sheetsから仮説/学び/キャラクターを取得            │    │
│  │  ② Gemini → テキスト生成（レートはTwelve Dataから）  │    │
│  │  ③ 投稿品質管理（後処理チェーン + リトライ）         │    │
│  │  ④ ファクトチェック（Gemini+Grounding）★v6.1        │    │
│  │     → 誤り/要確認あり → 自動修正 → 再度後処理       │    │
│  │  ⑤ 市場系タイプ → AI画像生成 + 透かし合成  ★v5.4    │    │
│  │  ⑥ POST_MODEに応じて分岐:                            │    │
│  │     manual → 画像Drive保存 + メタデータ保存           │    │
│  │           → Gmail通知（画像プレビュー + 3ボタン）     │    │
│  │     validate → チェック通過で自動投稿/NGなら下書き    │    │
│  │     auto → 即X投稿（画像付き）                        │    │
│  │  ⑥ Sheetsに記録                                      │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘

外部連携:
  Gemini API → テキスト生成（gemini-2.5-pro）+ 画像生成（gemini-3-pro-image-preview）★v8.8.1モデル更新
  Google Slides API → 透かし合成（一時スライド作成→PNG出力→削除）★v5.4
  Twelve Data API → 為替レート取得（7通貨ペア、1時間ごと）
  Google Drive → TC投稿画像 + AI生成画像の一時保存
  X API v2 → テキスト投稿 / テキスト+画像投稿 / メトリクス取得 ★v6.2
  Gmail → 下書き通知メール（画像プレビュー + 3ボタン承認）★v5.4
```

---

## 5. 投稿タイプ一覧（16種）

### config.gs POST_TYPES 定義

```
タイプ名               ラベル              絵文字  画像方式          レート注入
──────────────────────────────────────────────────────────────────────
MORNING               MORNING BRIEF        🌅    AI画像★v5.4      あり
TOKYO                 TOKYO OPEN           📊    なし              あり
LUNCH                 LUNCH CHECK          🍱    なし              あり
LONDON                LONDON REPORT        🌆    AI画像★v5.4      あり
GOLDEN                GOLDEN TIME          🔥    なし              あり
NY                    NY PREVIEW           🗽    AI画像★v5.4      あり
INDICATOR             INDICATOR ALERT      ⚡    AI画像★v5.4      あり
WEEKLY_REVIEW         WEEKLY REVIEW        📋    AI画像★v5.4      なし
RULE_1                RULE                 🧠    なし              なし
RULE_2                RULE                 🧠    Drive             なし
WEEKLY_LEARNING       LEARNING             📝    なし              なし
RULE_3                RULE                 🧠    なし              なし
NEXT_WEEK             NEXT WEEK            🔮    AI画像★v5.4      なし
RULE_4                RULE                 🧠    なし              なし
WEEKLY_HYPOTHESIS     HYPOTHESIS           💭    なし              なし
KNOWLEDGE             KNOWLEDGE            📕    なし              あり
```

### 各投稿タイプの詳細

```
平日❶ 朝の市場チェック（MORNING）📷AI画像
  時間: 07:30頃 / 文字数: 400〜500
  内容: 前日NYの結果 + 今日の注目ポイント
  ループ: 前日❻の「仮説」と比較
  ★v5.5 月曜日専用: 金曜NY振り返り + 週末世界情勢 + 窓開け + 市場心理変化

平日❷ 東京オープン後（TOKYO）
  時間: 09:20頃 / 文字数: 300〜400
  内容: 注目通貨ペア + テクニカル水準

平日❸ ランチタイム（LUNCH）
  時間: 12:10頃 / 文字数: 350〜450
  内容: 午前の振り返り + 学び

平日❹ ロンドンレポート（LONDON）📷AI画像
  時間: 17:20頃 / 文字数: 400〜500
  内容: 東京まとめ + ロンドン初動 + NY展望
  ループ: 今日の「学び」を記録

平日❺ ゴールデンタイム（GOLDEN）★1日最重要枠
  時間: 20:50頃 / 文字数: 350〜450
  内容: 今日の心理・本音（共感重視）

平日❻ NY前（NY）📷AI画像
  時間: 22:10頃 / 文字数: 350〜450
  内容: 今夜の注目点 + 仮説
  ループ: 「仮説」記録 → 翌朝❶へ

指標連動（INDICATOR）📷AI画像
  時間: 重要指標の30分前 / 文字数: 300〜400
  内容: 指標解説 + 前回/予想 + シナリオ

KNOWLEDGE
  時間: 平日の空き枠 / 文字数: 300〜400
  内容: 経済指標やFX用語の解説（CPI、雇用統計等）

土曜❶ 振り返り（WEEKLY_REVIEW）📷AI画像
  時間: 08:22 / 内容: 今週の相場まとめ + 先週仮説との比較

土曜❷ 心得①（RULE_1）
  時間: 11:48 / 内容: 知識・原則系 / TC導線: 2回に1回

土曜❸ 心得②（RULE_2）📷Drive画像
  時間: 15:14 / 内容: 習慣・メンタル系

土曜❹ 学び（WEEKLY_LEARNING）
  時間: 20:32 / 内容: 教訓まとめ + 自己採点

日曜❶ 心得③（RULE_3）
  時間: 10:18 / 内容: 実践テクニック系

日曜❷ 来週イベント（NEXT_WEEK）📷AI画像
  時間: 14:13 / 内容: 来週の経済指標カレンダー

日曜❸ 心得④（RULE_4）
  時間: 17:42 / 内容: 失敗談・本音系

日曜❹ 仮説（WEEKLY_HYPOTHESIS）
  時間: 20:28 / 内容: 来週の見立て
  ループ: 翌土曜❶に引き継ぎ
```

---

## 6. 指標連動投稿 ★v6.3で実装完了

```
毎朝05:00（scheduleTodayPosts内）:
  ① 経済カレンダーシートから今日の指標を取得
  ② 重要度「高」をフィルタ
  ③ 発表30分前にrunIndicator()トリガーを動的設定
  ④ 1日最大2件 + ±0〜3分ランダムゆらぎ ★v8.1更新
  ⑤ 平日のみ実行（土日はスキップ）

対象: 米雇用統計 / FOMC / 米CPI / 日銀（最優先）
      米小売売上高 / ISM / ECB/BOE（優先）

実装: scheduler.gs scheduleIndicatorTriggers_()
投稿: main.gs runIndicator() → generatePost('INDICATOR')
品質: ファクトチェック適用（指標名・予想値・前回値の正確性検証）
```

---

## 7. 仮説→学びループ

```
【平日】
  ❶朝 → 前日❻の仮説と比較
  ❷東京前 → ❶を具体化
  ❸ランチ → ❷の結果を振り返り
  ❹ロンドン → 今日の「学び」を記録
  ❺ゴールデン → 学びをどう感じたか
  ❻NY前 → 「仮説」を記録 → 翌朝❶へ

  ★v5.5 月曜❶の特殊処理:
    前日❻ = 金曜NYの仮説（土日は市場休場）
    + 週末の世界情勢変化（fetchMarketNews_が60時間分を検索）
    + 窓開け・オセアニア先行反応
    + 日曜❹のWEEKLY_HYPOTHESISとの対比

【週次】
  土❶ → 前週日❹の仮説と比較
  土❹ → 週次学びを記録
  日❹ → 週次仮説を記録 → 翌土❶へ

【完全自動学習ループ】★v6.2追加
  日❹ WEEKLY_HYPOTHESIS投稿
    → 仮説を自動パース（ペア・方向・レート）
    → 仮説検証ログシートに保存
  翌月曜 朝5:00
    → レートキャッシュから検証時レートを取得
    → 的中/不的中を自動判定
    → Geminiで理由を1行自動生成
  次の日❹ WEEKLY_HYPOTHESIS生成時
    → 直近5件の的中率サマリーをプロンプトに注入

【学びの抽出品質】★v8.0根本改善
  旧: 「普遍的な学びにする」→ 教科書レベルの一般論しか出なかった
  新: 「この投稿だからこそ得られた具体的な知見」を抽出
    → NG/OK例をプロンプトに明示し、一般論を排除
    → 条件付きの法則（○○の時に△△しやすい）を要求
  NG例: 「地政学リスクで安全資産のドルが買われやすい」（誰でも知っている）
  OK例: 「RBA利上げ直後は声明のトーンで豪ドルが反転しやすい」（次に活かせる）

【仮説の抽出品質】★v8.0強化
  旧: 「仮説が立てられない投稿なら『なし』」→ なしが多発
  新: 「市場系投稿で仮説なしは基本ありえない」と明示
    → NG/OK例を追加（曖昧→検証不能 / 具体的→レートで検証可能）
    → 「もし○○なら△△」の条件付き仮説もOKと明示

【学び→仮説の連携】★v8.0追加
  学びログ注入時に「仮説を立てる際はこれらの学びを根拠に使え」と指示。
  例: 学び「RBA利上げ直後は声明で反転しやすい」
    → 次のRBA利上げ日に仮説「声明がタカ派なら豪ドル0.72突破」が生成される

【学びの重み付け】★v6.2追加
  学びログのスコアベース選択
    → 70%: 有効度スコア上位から選択
    → 30%: ランダムに選択（多様性確保）
    → 選択された学びの使用回数を自動インクリメント

【エンゲージメントフィードバック】★v6.2追加
  毎朝5:00: 24時間以上前の投稿のメトリクスを自動収集
    → X API v2でインプレッション/いいね/RT/返信を取得
    → エンゲージメント率・品質スコアを計算
    → エンゲージメントログシートに保存
  投稿生成時（同タイプ5件以上蓄積後）:
    → 平均ER・ベスト/ワーストをプロンプトに注入
```

---

## 8. Trading Complete導線

```
80%は純粋な価値提供、20%で自然にTCに触れる
週末心得枠4つのうちTC言及は1〜2回

4パターン:
  ① 課題提起型:「記録が大事→面倒→ツール」
  ② 開発ストーリー型:「Excel挫折→自分で作った」
  ③ データ型:「3ヶ月記録→負けパターン発見」
  ④ 言及なし: 純粋な心得のみ（信頼の土台）

心得テーマ: 24件をSheetsでローテーション管理
```

### TC機能ハイライト（プロンプトに注入済み）

```
8つの具体機能をGeminiに提供し、抽象表現を防止:

  ① エントリー前チェックリスト
     → 3つの根拠を書かないと保存できない「関所」機能
  ② リスク自動判定
     → 許容損失額超過で赤警告、ロット適正値自動計算
  ③ 手法別勝率分析
     → どの手法が勝てているか一目で分かる
  ④ 月次カレンダー
     → 日別損益を緑/赤で色分け表示
  ⑤ 相場ノート検索
     → 過去ノートをキーワード検索
  ⑥ 期待値・PF計算
     → 1トレードあたりの稼ぎを自動算出
  ⑦ 経費管理・CSV出力
     → 確定申告用データ一発出力
  ⑧ バッジ機能
     → ルール遵守・リスク判定がカードに表示

OK例: 「チェックリスト機能を使い始めてから、衝動エントリーが激減した」
NG例: 「記録が大事」「Trading Completeで仕組み化した」（抽象的すぎ）
```

---

## 9. Google Sheets設計

```
【シート1: 投稿履歴】
  A:日時 B:曜日 C:投稿番号 D:タイプ名
  E:投稿テキスト F:画像有無 G:使用画像名/アーキタイプ
  H:仮説 I:学び J:ツイートID K:ステータス L:エラーログ

【シート2: 心得テーマ】
  A:ID B:カテゴリ C:テーマ名 D:キーメッセージ
  E:TC導線パターン F:最終使用日 G:使用回数

【シート3: キャラクター】
  A:セクション B:内容
  → プロンプトに注入するキャラクター定義

【シート4: 下書き】
  A:投稿ID B:生成日時 C:投稿予定時刻 D:投稿タイプ
  E:生成テキスト F:バリデーション結果 G:ステータス H:承認日時
  ★ E列を手動編集 → 承認で編集後テキストが投稿される

【シート5: レートキャッシュ】直近7日分の生データ ★v5.3で7ペア対応
  A:取得日時
  B:USD/JPY C:EUR/USD D:GBP/USD E:EUR/JPY F:GBP/JPY G:AUD/JPY H:AUD/USD
  I:取得元 J:ステータス
  → 1時間ごとTwelve Data APIで自動取得（24行/日）
  → 7日超の生データは日次集約後に自動削除

【シート6: 日次レート】日次OHLC集約データ ★v5.3で7ペア x 4値
  A:日付
  B〜E:USD/JPY（始値/高値/安値/終値）
  F〜I:EUR/USD（始値/高値/安値/終値）
  J〜M:GBP/USD（始値/高値/安値/終値）
  N〜Q:EUR/JPY（始値/高値/安値/終値）
  R〜U:GBP/JPY（始値/高値/安値/終値）
  V〜Y:AUD/JPY（始値/高値/安値/終値）
  Z〜AC:AUD/USD（始値/高値/安値/終値）
  AD:データ件数
  → 前日のキャッシュ→1行に集約（毎朝5:00自動実行）
  → IQR外れ値フィルタリングでスパイクデータ除去
  → 5年分の履歴データをTwelve Data APIから取得済み

【シート7: レートサマリー】★v5.3で13期間 x 7ペア
  A:期間名
  B〜O:7ペア x 2（高値/安値）
  P:データ件数 Q:更新日時
  → 13期間: 昨日/今週/先週/2週前/今月/先月/過去3ヶ月/
            過去半年/今年/過去1年/過去2年/過去3年/過去5年
  → 日付比較はYYYY-MM-DD文字列ベース（タイムゾーンずれ防止）

【設定】
  APIキーはスクリプトプロパティに保存（10キー）★v5.4で1キー追加
```

---

## 10. GASファイル構成

```
CompanaFXAutoPost/
├── main.gs               ← エントリーポイント          ✅実装済み（★v6.3更新）
│   ├── executePost()        POST_MODEで分岐
│   ├── generateImageIfNeeded_() 市場系タイプならAI画像生成 ★v5.4
│   ├── executePostToX_()    テキスト or テキスト+画像投稿
│   ├── handleManualMode_()  下書き保存 + 画像生成 + Gmail通知 ★v5.4更新
│   ├── handleValidateMode_() バリデーション分岐 + 画像生成 ★v5.4更新
│   ├── handleAutoMode_()    画像生成 + 即自動投稿 ★v5.4更新
│   ├── setModeManual()      手動モード切替
│   ├── setModeValidate()    検証モード切替 ★v6.3追加
│   ├── setModeAuto()        自動モード切替
│   ├── runMorning()〜runNy() 平日6投稿
│   ├── runWeeklyReview()等  週末4+4投稿
│   ├── runIndicator()       指標連動
│   ├── runKnowledge()       知識解説
│   └── showStatus()         全体ステータス確認
│
├── scheduler.gs          ← トリガー自動管理            ✅実装済み（552行）★v8.6: 処理分離（5:00トリガー設定+5:15メンテナンス）
│   ├── initializeScheduler() 毎朝5:00 + 毎時レート取得
│   ├── scheduleTodayPosts()  今日の投稿トリガー設定 + 日次集約
│   │                         + Phase 2仮説検証（月曜）+ Phase 4エンゲージメント収集
│   │                         + Phase 8指標連動トリガー設定（平日）★v6.3追加
│   ├── scheduleIndicatorTriggers_() 重要指標30分前にrunIndicator設定 ★v6.3追加
│   ├── scheduledFetchRates() 1時間ごとレート自動取得（★v5.3追加）
│   ├── cleanupPostTriggers_() 古いトリガー削除（scheduledFetchRates/onOpen保護）
│   ├── emergencyStop()       全トリガー削除（緊急停止）
│   ├── showTriggers()        現在のトリガー一覧
│   └── testScheduleDryRun()  ドライラン（設定せず確認）
│
├── geminiApi.gs          ← 核: メイン処理+Gemini API通信 ✅実装済み（566行）★v8.8.1: リトライ共通化+Pro変更
│   ├── generatePost()       メイン生成処理（司令塔。全モジュールを呼び出す）
│   ├── executeRetry_()      リトライ共通処理（4パターン統合）★v8.8.1新設
│   ├── countEmojis_()       絵文字カウント（サロゲートペア対応）★v8.8.1新設
│   ├── checkMultiArrowBlocks_() →複数ブロック検出 ★v8.8.1新設
│   ├── callGemini_()        Gemini API呼び出し（3回リトライ）★v8.0: maxOutputTokens 8192 + thinkingConfig
│   └── extractTextFromResponse_() レスポンスからテキスト抽出
│
├── promptBuilder.gs      ← プロンプト構築+データ注入    ✅実装済み（1,581行）★v8.8.1: 仮説ベース投稿構造+ファンダ重視+レート数字禁止
│   ├── buildPrompt_()       プロンプト組み立て（システム最大の関数・636行）
│   ├── buildFormatRules_()  フォーマットルール生成（投稿タイプ別）
│   ├── getEconomicCalendar_() 経済カレンダー取得（scope別）
│   ├── getLearningLog_()    学びログ取得（スコア上位+ランダム選出）
│   ├── getHypothesisContext_() 仮説コンテキスト取得
│   ├── getQualityFeedback_() 品質フィードバック取得（ER平均値）
│   ├── getPostPrompt_()     投稿プロンプト取得（Sheets）
│   ├── getTCOverview()      TC概要取得（Sheets）
│   ├── getTradeStyle_()     トレードスタイル取得
│   └── getReferenceSources_() 情報ソース一覧取得
│
├── postProcessor.gs      ← 後処理チェーン              ✅実装済み（1,837行）★v8.8.1: \b除去（設計の鉄則準拠）
│   ├── removeForeignText_() / stripAIPreamble_() / enforceLineBreaks_()
│   ├── removeDisallowedEmoji_() / removeMarkdown_() / replaceProhibitedPhrases_()
│   ├── fixMondayYesterday_() / removeDuplicateBlocks_() / truncateAfterHashtag_()
│   ├── fixMissingDecimalPoint_() / fixHallucinatedRates_() / validateFinalFormat_()
│   ├── generateDynamicHashtags_() / removeTCMention_()
│   └── （主役ペア・絵文字・リスクセンチメントのリトライはgeminiApi.gsのgeneratePost内）
│
├── factCheck.gs          ← ファクトチェック+自動修正    ✅実装済み（653行）★v8.6: removable分類+日時注入+要人役職ルール
│   ├── factCheckPost_()     2層ファクトチェック（L1:データ照合+L2:Grounding ON）
│   ├── autoFixPost_()       自動修正（Grounding OFF）
│   ├── verifyAutoFix_()     修正後残留チェック
│   ├── extractKeyPhrases_() キーフレーズ抽出
│   └── forceRemoveIssueLines_() 問題行の強制削除（最終手段）
│
├── rateManager.gs        ← レート取得・保存・検証       ✅実装済み（811行）★v8.5分割
│   ├── fetchLatestRates_()  Twelve Data API レート取得（7ペア）
│   ├── fetchCommodityPrices_() BTC・ゴールド取得（30分キャッシュ）
│   ├── fetchDailyCommodityPrices_() WTI・天然ガス取得（日次）
│   ├── saveRatesToSheet_()  レートをシートに保存
│   ├── getLatestRatesFromCache_() キャッシュフォールバック
│   ├── crossValidateRate_() レートクロス検証
│   └── scheduledFetchRates() 定期レート取得（1時間トリガー）
│
├── marketAnalysis.gs     ← 市場分析                    ✅実装済み（799行）★v8.6: Bloomberg最優先検索+ソース欄追加
│   ├── detectHotPair_()     注目通貨ペア検出（主役ペア選定）
│   ├── fetchMarketNews_()   市場ニュースTOP5取得（Grounding・1時間キャッシュ）
│   ├── calculateRateDirection_() レート方向性計算
│   ├── calcCurrencyStrength_() 通貨強弱計算
│   ├── detectTrendFromCache_() トレンド検出
│   ├── analyzePriceHistory_() 価格履歴分析
│   └── getTodayOpenRates_() 本日始値取得
│
├── indicatorManager.gs   ← 経済指標                    ✅実装済み（1,191行）★v8.5分割
│   ├── fetchTodayAnnouncedResults_() 発表済み指標結果取得
│   ├── fetchIndicatorResults_() 前日の指標結果取得
│   ├── formatIndicatorReview_() MORNING用指標レビュー
│   ├── formatIndicatorPreview_() INDICATOR用過去実績
│   ├── formatWeeklyRateTrend_() WEEKLY_REVIEW用レートトレンド
│   ├── formatWeeklyIndicatorSummary_() 週次指標サマリー
│   └── getLatestIndicators_() / setupIndicatorSheet()
│
├── learningManager.gs    ← 学び・仮説                  ✅実装済み（859行）★v8.5分割
│   ├── extractPostInsights_() 投稿から仮説・学び抽出（3要素構造）
│   ├── verifyPreviousHypothesis_() 前回仮説の検証
│   ├── verifyWeeklyHypotheses_() 週次仮説検証
│   ├── parseHypothesisDetails_() 仮説3要素パース
│   └── saveLearningToLog_() / extractAndSaveLearning_()
│
├── priceSummary.gs       ← 価格集計                    ✅実装済み（642行）★v8.5分割
│   ├── updatePriceSummary() レートサマリー更新（13期間）
│   ├── aggregateDailyRates() 日次OHLC集約
│   ├── rebuildDailyRates()  日次レート再構築
│   └── calcOHLC_() / initializeHistoricalSummary()
│
├── calendarManager.gs    ← 経済カレンダー              ✅実装済み（802行）★v8.5分割
│   ├── fetchEconomicCalendar() Gemini+Groundingでカレンダー取得
│   ├── importFromRawSheet() 生データからインポート
│   └── setupEconomicCalendarSheet() / setupIndicatorResultColumns()
│
├── testFunctions.gs      ← テスト関数                  ✅実装済み（225行）★v8.8.1再構成
├── qualityReview.gs      ← 品質レビュー（Claude API）   ✅実装済み（332行）★v8.6新規追加
│   ├── testPro_MORNING()等  1タイプずつテスト（Pro用・ファクトチェック込み）★v8.8.1新設
│   ├── testRULE1_3() / testRULE4() / testWEEK()  まとめテスト ★v8.8.1新設
│   ├── testBatch_()         バッチテスト実行エンジン
│   └── testGemini() / testFetchRates() / testFetchCalendar()
│
├── xApi.gs               ← X API v2                    ✅実装済み
│   ├── postTweet()          テキスト投稿
│   ├── postTweetWithMedia() 画像付き投稿
│   ├── uploadMedia()        画像アップロード
│   └── buildOAuthHeader_()  OAuth 1.0a署名
│
├── sheetsManager.gs      ← Sheets読み書き              ✅実装済み
│   ├── savePost()           投稿履歴保存
│   ├── getLastHypothesis()  直近の仮説取得
│   ├── getLastLearning()    直近の学び取得
│   ├── getNextTheme()       心得テーマローテーション
│   ├── getRecentArchetypes() 最近の画像使用履歴
│   ├── getCharacterPrompt() キャラクター定義読み込み
│   ├── saveDraft()          下書き保存
│   ├── getPendingDrafts()   承認待ち下書き取得
│   ├── updateDraftStatus()  下書きステータス更新
│   ├── getTodayPostCount()  今日の投稿数
│   └── logError()           エラーログ記録
│
├── config.gs             ← 設定・定数                  ✅実装済み
│   ├── POST_MODE            投稿モード（manual/validate/auto）
│   ├── GEMINI_MODEL         テキスト生成モデル（gemini-2.5-pro）★v8.8.1更新
│   ├── SCHEDULE             曜日別1分単位時刻
│   ├── POST_TYPES           16投稿タイプ定義
│   ├── CURRENCY_PAIRS       7通貨ペア定義（★v5.3追加）
│   ├── SHEET_NAMES          シート名定数
│   ├── VALIDATION_CONFIG    バリデーション設定
│   ├── POLICY_RATES         主要5中銀の政策金利（一元管理）★v8.5追加
│   ├── getPolicyRatesText_() 政策金利をプロンプト用テキストに変換 ★v8.5追加
│   └── getApiKeys()         スクリプトプロパティ取得（10キー）★v5.4で1キー追加
│
├── approval.gs           ← 品質管理・承認フロー         ✅実装済み（★v5.4更新）
│   ├── sendDraftNotification() Gmail通知（画像プレビュー + 3ボタン）★v5.4
│   ├── emojiToHtmlEntity_()    絵文字→HTML数値参照変換
│   ├── stripSurrogatePairs_()  絵文字除去（プレーンテキスト用）
│   ├── saveImageMeta_()        画像メタデータ保存 ★v5.4
│   ├── getImageMeta_()         画像メタデータ取得 ★v5.4
│   ├── deleteImageMeta_()      画像メタデータ削除 ★v5.4
│   ├── saveImageToDrive_()     画像BlobをDriveに保存 ★v5.4
│   ├── getImageFromDrive_()    DriveファイルIDから画像Blob取得 ★v5.4
│   ├── doGet()                 WebApp承認リンク（承認/再生成/中止）★v5.4更新
│   ├── handleRegenerate_()     画像再生成処理（最大3回）★v5.4
│   ├── getDraftById_()         下書きデータをIDで取得 ★v5.4
│   ├── processApprovedDrafts() 承認済み下書き→画像付き投稿 ★v5.4更新
│   ├── validatePost()          投稿バリデーション
│   ├── setupApprovalChecker()  5分おきトリガー設定
│   └── stopApprovalChecker()   承認チェック停止
│
├── imageGenerator.gs     ← AI画像生成                   ✅実装済み（889行）★v8.6: 透かしログ改善
│   ├── IMAGE_TYPE_COLORS      投稿タイプ別アクセントカラー定数
│   ├── IMAGE_ARCHETYPES       12アーキタイプ定義
│   ├── generatePostImage()     メイン画像生成処理
│   ├── regeneratePostImage()   再生成（前回アーキタイプ除外）
│   ├── selectImageArchetype_() アーキタイプ選定（マンネリ防止）
│   ├── buildImagePrompt_()     Gemini用画像プロンプト構築
│   ├── callGeminiImageApi_()   Gemini画像生成API呼び出し（3回リトライ）
│   ├── compositeWithWatermark_() Slides APIで透かし合成
│   ├── isImageGenerationType() 市場系タイプ判定
│   └── testImageGeneration()等  テスト関数群
│
└── utils.gs              ← ユーティリティ              ✅実装済み
    ├── formatDate()         日付フォーマット
    ├── addRandomDelay()     Bot回避用ランダム遅延
    ├── getDayName()         曜日名取得
    ├── getTodaySchedule()   今日のスケジュール取得
    ├── selectArchetype()    アーキタイプ選択（マンネリ防止）
    ├── validateTextLength() 文字数バリデーション
    └── sendErrorEmail()     エラー通知メール
```

---

## 11. 投稿品質管理

### 11-1. テキスト後処理チェーン + ファクトチェック ★v6.1

```
9段階の後処理 + 4つのバリデーション・リトライ + ファクトチェック自動修正を適用:

【処理の順序】
  後処理（9段階） → リトライ（主役ペア・絵文字・→複数・リスクセンチメント）
    → ファクトチェック → 自動修正（必要時のみ）→ 再度後処理
      → 承認メール送信（修正済みテキスト + 検証結果）

【バリデーション・リトライ（後処理後に実行）】

  🔥主役ペアリトライ（市場系のみ）★v5.9
    → 主役候補として推奨。ニュース状況的に他ペアが適切ならそちらでよい

  ⚠️リスクセンチメントリトライ ★v7.0
    → 「リスクオフ」+「円売り」同時出現で強制リトライ

  絵文字最低3個リトライ ★v6.0
    → 3個未満ならリトライ

  →複数ブロックリトライ ★v7.2
    → 1ブロック内に→が2本以上で強制リトライ

【9段階後処理チェーン】

① 外国語テキスト除去（removeForeignText_）
   英語フレーズ、キリル文字、ラテン拡張文字等を除去

② AI前置き除去（stripAIPreamble_）★v7.3強化
   「コンパナとして〜」「はい、承知しました」等を除去
   追加パターン: 「ツールを実行して〜」「すべて理解しました」
   「以下に調整した投稿を示します」「振り返る投稿を作成します」等

③ 改行+空行制御（enforceLineBreaks_）
   「。」「？」後に自動改行 / →の前に自動改行
   絵文字行の前に空行確保 / 締めの→自動除去
   行末絵文字→行頭移動 ★v7.0
   ★バグ注意: \sは改行も含む。行頭処理は[ \t]+を使うこと

④ 絵文字: 種類制限+個数制限（removeDisallowedEmoji_）
   許可7種: 📕📝📋☕💡⚠️✅ / 最大3個

⑤ Markdown除去（removeMarkdown_）

⑥ 禁止表現置換（replaceProhibitedPhrases_）★v7.3大幅強化
   既存（v7.2まで）: 通貨ペア英語→日本語 / 静観7パターン / パーセント小数点修正 /
                     行頭スペース除去 / 絵文字行→空行除去 / あなた→みなさん /
                     今日一番→注目表現に変換 / →直後の孤立助詞除去 / 万円補完
   ★v7.3追加:
     - あなたの → みなさんの
     - 「今日注目しているのはXXでしょうか」→「ですね。」
     - 0XX%パターン修正（013%→0.13%）
     - 全角スペース行頭除去（　　テキスト → テキスト）
     - でしょうか重複→2回目以降を断言に変換
   ★v8.0追加:
     - 「要確認」→「注目」に置換（プロンプト禁止のすり抜け防止）
     - 「見極めたい」置換テキストに句点追加（文結合バグ防止）
     - 二重句点「。。」→「。」の安全弁

⑦ 月曜日「昨日」修正（fixMondayYesterday_）

⑧ ハッシュタグ自動生成（generateDynamicHashtags_）
   URL検出時は#FXの1個のみ（シャドウバン回避）

⑨ 投稿間隔チェック（handleAutoMode_内）

【後処理修正の鉄則】
  正規表現で\sを使う場合は改行も含まれるため要注意。
  行頭・行末系の処理では[ \t]+（スペース・タブのみ）を使うこと。

【v8.6追加の鉄則】
  fixHallucinatedRates_で「ドル円」キーワード検出時、「豪ドル円」「ポンドドル円」の部分一致を除外すること。
  キャラクターシートのB列に【サブセクション名】を大量に書かないこと（Geminiのセクション数カウントが増える）。
  プロンプトに不要なセクションを注入しない。投稿タイプごとに必要なデータ・ルールだけを注入する。
```

### 11-2. プロンプト品質管理 ★v7.3更新

```
【言及できる通貨ペア制限】★v7.2
  7ペアのみ（ドル円・ユーロドル・ポンドドル・ユーロ円・ポンド円・豪ドル円・豪ドル米ドル）
  CAD・CHF・NZD・CNY等はレート数値の言及禁止（背景説明としての言及はOK）

【主役ペア表現禁止】★v7.3
  「今日一番動いている」「最も動いた」は禁止
  システムは7ペアしか見ていないため、全市場の最強ペアのように断言しない
  OK: 「ユーロドルに注目しています」「ユーロドルはボラティリティのある展開」

【WEEKLY_REVIEW・HYPOTHESIS 週間トレンド注入】★v7.2
  formatWeeklyRateTrend_() で日次レートOHLCから今週の変動を自動計算
  曜日別OHLC・週間レンジ・方向性ラベルをプロンプトに注入
  論理矛盾（「円が買われ、ドル円は159円」等）を防止

【WEEKLY_LEARNING 架空失敗談禁止】★v7.3
  コンパナは7年の経験者。初歩的なミスを「今週やった」と架空で書くのは禁止
  OK: 「昔〜で痛い目を見た」（過去の教訓）
  NG: 「今週FOMCで決めつけでエントリーした」（架空の今週の失敗）
  今週の出来事として語れるのは「相場の動き・指標の結果・感じたこと」のみ

【RULE系 根拠のない数値禁止】★v7.2
  具体的な金利水準・レート値・研究データの数値を書くな
  体験談は「コンパナ自身の経験」として書け

【リプライ誘発質問（Gemini自由生成）】★v7.3
  固定プールを廃止。Geminiが本文内容に合った質問を自由生成
  「あなた」禁止→「みなさん」を使うこと
  「でしょうか」終わりの質問は禁止
```

### 11-3. ファクトチェック + 自動修正 ★v6.1追加

```
投稿テキスト生成後、事実の正確性を自動検証し、誤りがあれば自動修正する。
「生成」と「検証」を別のGemini呼び出しで行う2段構え方式。
★v8.3: ファクトチェックを2層構造に改修。

【フロー】
  ① テキスト生成 → 後処理 → リトライ（既存）
  ② factCheckPost_（2層構造・Grounding ON）
     Layer 1: システム確定データ（レート・金利・カレンダー）との照合
     Layer 2: Geminiの知識+Google検索で要人発言・指標結果・因果関係・架空データを検証
     → 各事実を ✅正確 / ⚠️検証不可 / ❌誤り で判定（layerフィールドでL1/L2を明示）
  ③ ✅全て正確 → そのまま⑤へ
  ④ ❌あり → autoFixPost_（Grounding OFF・correction+システムデータのみで修正）
     → factCheckPost_が見つけたcorrection情報に基づき修正
     → Grounding OFFの理由: 検索結果で正しい投稿を壊すリスク回避（v8.2の教訓）
     → ⚠️はautoFix対象外（メール表示のみ）
  ⑤ 承認メール送信
     → 修正済みテキスト + ファクトチェック結果を表示
     → コンパナが最終確認 → 承認/却下

【検証対象】
  ・要人発言: 誰が、いつ、何を言ったか
  ・経済指標: 名称、日付、予想値、前回値
  ・経済指標の名称混同: CPI/PPI/HICPの混同チェック ★v8.0追加
  ・レート水準: 具体的な数値の正確性
  ・日付の整合性: 「今日」「昨日」が本当にその日か
  ・中央銀行の政策: 決定内容の正確性
  ・中央銀行のスタンス: 日銀を「ハト派」と書いていないか等 ★v8.0追加
  ・経済カレンダーとの整合: カレンダーの正式名称と投稿内の指標名が一致するか ★v8.0追加
  ・サプライズ判定: 「サプライズ」「予想外」等の表現が実態と一致するか ★v8.0追加

【総合判定ロジック】★v8.0修正
  Geminiが返すoverallフィールドを信頼せず、個別itemsのverdictから再計算。
  理由: Geminiが個別に⚠️を付けておきながらoverallを「✅全て正確」にする
        矛盾が発生し、自動修正が発動しないバグがあったため。
  → ⚠️/❌が1件でもあれば自動修正を発動する。
  → ⚠️の場合もcorrectionフィールドを出力させる（旧: ❌のみ）。

【スキップ対象】
  ・RULE_1〜4: 個人の経験談が主体のため検証不要
  ・旧testAll1〜6: 廃止（★v8.8.1でPro対応のため1タイプずつに再構成）
  ・testPro_MORNING()等: 1タイプずつテスト（Pro用・ファクトチェック込み）★v8.8.1
  ・testRULE1_3() / testRULE4() / testWEEK(): RULE系・週間系まとめテスト ★v8.8.1
  ・個別テスト（testGenerateMorning等）: ファクトチェック実行

【API使用量】
  ・1投稿あたり +1〜2回（チェック1回 + 修正0〜1回）
  ・RULE系スキップで実質6〜8回/日追加
  ・Gemini API無料枠で十分対応可能

【完全自動学習システムとの連携】
  ファクトチェックで正確性が担保された投稿のみが学習ループに入る。
  「間違った情報を学習→さらに間違う」の悪循環を防止。
```

### 11-4. POST_MODE（3段階の安全レベル） ★v5.4更新

```
manual（現在の設定）:
  生成 → 後処理+リトライ → ファクトチェック+自動修正 ★v6.1
  → 市場系なら画像生成 → 下書きシートに保存
  → 画像をDriveに保存 + メタデータ保存
  → Gmail通知（画像プレビュー + ファクトチェック結果 + 3ボタン承認）★v6.1更新
  → 下書きシートE列で手動編集可能
  → メール内の [✅承認する] をタップで画像付き投稿
  → メール内の [🔄画像を再生成] で別アーキタイプに変更（最大3回）
  → メール内の [❌中止する] で投稿取り消し
  ★ 初期運用はこのモードで品質確認

validate:
  生成 → 画像生成 → バリデーション → 通過なら画像付き自動投稿 ★v5.4
  → 不合格は下書き保存 + Gmail通知（画像プレビュー付き）
  ★v6.3: カスタムメニューから切替可能に

auto:
  生成 → 画像生成 → 即X投稿（画像付き）→ Sheets記録 ★v5.4
  ★ 品質安定後に移行
```

---

## 12. 市場データ収集（3層アーキテクチャ） ★v5.3で全面刷新

```
【データソース】
  メイン: Twelve Data API（正確なFXレート + BTC + ゴールド）
  → /price エンドポイントで7ペア同時取得
  → BTC/USD + XAU/USD を62秒後に同時取得（2クレジット）
  → 無料枠: 800クレジット/日、8リクエスト/分
  → 使用量: 192クレジット/日（24%）= 十分な余裕

  サブ: Alpha Vantage API（WTI・天然ガスの日次取得）★v6.6追加
  → 無料枠: 25リクエスト/日、使用量: 2リクエスト/日（8%）
  → 23時間キャッシュで1日1回のみAPI呼び出し

【3層データフロー】
  Twelve Data API（1時間ごと、7ペア + BTC + GOLD）
    → レートキャッシュ（直近7日分の生データ）
      → 日次レート（OHLC集約、5年分蓄積）※為替のみ
        → レートサマリー（13期間の高値/安値）※為替のみ

  Alpha Vantage API（日次、WTI + 天然ガス）
    → レートキャッシュに同行保存

【7通貨ペア】
  USD/JPY, EUR/USD, GBP/USD, EUR/JPY, GBP/JPY, AUD/JPY, AUD/USD
  ※ CURRENCY_PAIRS定数で一元管理

【商品4銘柄】★v6.6追加
  WTI/USD  : Alpha Vantage・日次（I列）
  BTC/USD  : Twelve Data・1時間ごと（J列）
  GOLD/USD : Twelve Data・1時間ごと（K列）※XAU/USDとして取得
  NATGAS   : Alpha Vantage・日次（L列）

【Geminiへの注入方法】★v6.6更新
  APIデータを基準値として注入 + Groundingで最新値を確認するよう指示
  → APIデータ（基準）+ リアルタイム検索（確認）の二重チェック
```

---

## 13. エラーハンドリング

```
Gemini API失敗（テキスト）  → 3回リトライ（指数バックオフ）→ エラーメール
Gemini API失敗（画像）      → 3回リトライ → テキストのみで続行 ★v5.4
Twelve Data失敗             → フォールバックURL2段階 → エラーログ
透かし合成失敗              → 透かしなしの画像で続行 ★v5.4
画像取得失敗                → テキストのみ投稿にフォールバック
画像アップロード失敗        → テキストのみ投稿にフォールバック
X API失敗                   → 429:15分待ち / 403:メール通知
全エラー                    → Gmailに自動通知 + Sheetsにエラーログ記録
```

---

## 14. Bot判定回避 + シャドウバン回避 ★v5.8強化

```
【Bot判定回避】
✅ 曜日ごとに1分単位で時刻が違う + ±0〜5分ランダム
✅ 画像ありとなしが混在（40:60）
✅ AI画像の構図が12アーキタイプで毎回違う ★v5.4
✅ 投稿数が日によって違う（平日6、土日4）
✅ いいね/フォロー/RTの自動化なし
✅ リプライは手動（週1回以上）
✅ POST_MODE=manualで承認フロー挟む

【シャドウバン回避】★v5.8追加
✅ 絵文字2〜3個制限（0〜1個は視認性低下、4個以上はスパム判定リスク）
✅ 外部URL検出時はハッシュタグ1個に制限（URL+ハッシュタグ多数が主因）
✅ autoモード時、前回投稿から15分未満は自動スキップ
✅ 外部リンクは本文に書かず、リプライに投稿（本文スコア-15回避）
   → 本文: 「note書きました」（URLなし）
   → リプライ: URL投稿（本文スコアに影響なし + リプライ=+75スコア）
```

---

## 15. コスト

```
                Manus（旧）     新システム
月額合計        $39             $0
年間節約        -               約$468（約7万円）
手動作業        15分/日 + 画像  0分/日（manualモード時は承認のみ）

内訳:
  GAS             無料
  Gemini API      Google One AI Premium含む（$0追加）★テキスト+画像
  Google Slides API  無料 ★v5.4で追加
  Twelve Data     無料枠（800クレジット/日、使用192 = 24%）★v6.6更新
  Alpha Vantage   無料枠（25リクエスト/日、使用2 = 8%）★v6.6追加
  Google Sheets   無料
  Google Drive    無料
  X API           pay-per-use（投稿: 既存 + メトリクス取得: 約$0.30/月）★v6.2
```

---

## 16. 移行スケジュール

```
Phase 1: 準備 ★完了
  ✅ X APIキー取得 + テスト投稿成功
  ✅ Gemini APIキー取得
  ✅ Google Sheets作成
  ✅ GASプロジェクト作成
  ✅ スクリプトプロパティ設定（10キー）

Phase 2: 基本機能 ★完了
  ✅ config.gs / xApi.gs / geminiApi.gs / sheetsManager.gs / utils.gs / main.gs

Phase 3: 投稿品質 ★完了
  ✅ 16投稿タイプ全てのプロンプト + 8段階後処理チェーン + TC導線

Phase 4: Drive画像マッチ ★完了
  ✅ 9サブフォルダ + 2段階マッチ + 20枚投入

Phase 5: スケジューラ ★完了
  ✅ 曜日別スケジュール + ランダムゆらぎ + 緊急停止

Phase 5.5: レートデータ基盤 ★完了
  ✅ Twelve Data API + 7通貨ペア + 5年分OHLC + 13期間サマリー

Phase 6: テキスト並行運用 ★完了
  ✅ manualモード稼働 + 承認フロー + WebAppデプロイ

Phase 6.5: ホットペア自動選定 □未着手
  □ 変動率ベースのペア自動選定 + プロンプト注入

Phase 7: AI画像生成 ★実装完了（v5.4）
  ✅ Gemini gemini-3-pro-image-preview による画像生成
  ✅ Gem連携プロンプト（サイバーパンク風、日本語テキスト入り）
  ✅ 12アーキタイプ定義（マンネリ防止付き選定ロジック）
  ✅ アーキタイプ指定のプロンプト反映（品質安定化）
  ✅ TC透かしロゴ合成（Google Slides API、透過PNG）
  ✅ 全6タイプテスト成功（MORNING/LONDON/NY/INDICATOR/WEEKLY_REVIEW/NEXT_WEEK）
  ✅ imageGenerator.gs 新規作成（834行）
  ✅ approval.gs 更新（3ボタン承認メール + 画像プレビュー + 再生成機能）
  ✅ main.gs 更新（3モード全てでAI画像生成を統合）
  ✅ WebApp再デプロイ完了（regenerateアクション対応）
  □ 統合テスト（testDraftMode実行）

Phase 7.5: 完全自動学習型システム ★Phase 2〜4実装完了（v6.2）
  ✅ Phase 1.5: ファクトチェック+自動修正（v6.1で完了）
  ✅ Phase 2: 仮説的中率自動集計
     → 仮説検証ログシート（A〜K列）
     → WEEKLY_HYPOTHESIS投稿後に仮説パース・保存
     → 月曜朝にレートデータで自動判定
     → プロンプトに的中率サマリー注入
  ✅ Phase 3: 学びの重み付け
     → 学びログにE〜H列追加（使用回数、有効度スコア、最終使用日、ステータス）
     → スコアベース選択（70%上位+30%ランダム）
  ✅ Phase 4: エンゲージメントフィードバック
     → X API v2でpublic_metrics自動取得（pay-per-use $0.01/回）
     → エンゲージメントログシート（A〜J列）
     → 品質スコア計算（同タイプ平均ERと比較）
     → プロンプトに品質フィードバック注入（5件以上蓄積後）
  □ Phase 5: プロンプト自動進化（1ヶ月のデータ蓄積後に着手予定）

Phase 8: 指標連動 ★実装完了（v6.3）
  ✅ 経済カレンダーから重要度「高」指標を自動検出
  ✅ 発表30分前にrunIndicator()トリガーを動的設定
  ✅ 1日最大2件 + ±0〜2分ランダムゆらぎ
  ✅ ファクトチェック適用済み（指標名・予想値・前回値の正確性検証）
  ✅ 平日のみ実行（土日はスキップ）

Phase 9: 切り替え □未着手
  □ Manus停止 → GAS本番 → Manus解約
```

---

## 17. スクリプトプロパティ一覧

```
プロパティ名          用途
────────────────────────────────
X_API_KEY             X APIコンシューマーキー
X_API_SECRET          X APIコンシューマーシークレット
X_ACCESS_TOKEN        X APIアクセストークン
X_ACCESS_SECRET       X APIアクセスシークレット
GEMINI_API_KEY        Gemini APIキー
SPREADSHEET_ID        Google SheetsのID
IMAGE_FOLDER_ID       TC投稿画像フォルダのID
WEBAPP_URL            WebApp承認リンクのURL
TWELVE_DATA_API_KEY   Twelve Data APIキー（★v5.3追加）
ALPHA_VANTAGE_API_KEY Alpha Vantage APIキー（★v6.6追加: WTI・天然ガス取得用）
WATERMARK_IMAGE_ID    透かしロゴPNGのDriveファイルID（★v5.4追加）
```

---

## 18. トリガー一覧（9件 + 指標連動）

```
関数名                   タイプ      実行タイミング
──────────────────────────────────────────────────────
scheduleTodayPosts       CLOCK       毎朝5:00（日次スケジューラ）
scheduledFetchRates      CLOCK       毎時（Twelve Data APIレート取得 + 未取得指標結果リトライ）★v8.0リトライ追加
processApprovedDrafts    CLOCK       5分ごと（承認チェック + 画像付き投稿）★v5.4更新
onOpen                   ON_OPEN     スプレッドシート起動時
runTokyo                 CLOCK       当日スケジュール（動的）
runLunch                 CLOCK       当日スケジュール（動的）
runLondon                CLOCK       当日スケジュール（動的）
runGolden                CLOCK       当日スケジュール（動的）
runNy                    CLOCK       当日スケジュール（動的）
runIndicator             CLOCK       重要指標30分前（動的）★v6.3追加

※ run系は毎朝scheduleTodayPostsで再設定される
※ runIndicatorは経済カレンダーの重要度「高」指標のみ（1日最大2件）★v6.3
※ cleanupPostTriggers_はscheduledFetchRates/onOpenを保護
```

---

## 19. テスト関数一覧

```
関数名                       内容                              安全性
──────────────────────────────────────────────────────────────────
showStatus()                全体ステータス確認                ✅安全
testConfig()                APIキー・設定確認（10キー）       ✅安全
testGenerateOnly()          テキスト生成のみ                  ✅安全
testPro_MORNING()等12個    1タイプずつテスト（Pro用・ファクトチェック込み）★v8.8.1新設
testRULE1_3()               RULE_1/RULE_2/RULE_3 まとめテスト ★v8.8.1新設
testRULE4()                 RULE_4/WEEKLY_LEARNING まとめテスト ★v8.8.1新設
testWEEK()                  NEXT_WEEK/WEEKLY_HYPOTHESIS まとめテスト ★v8.8.1新設
testFetchRates()            レート取得 + キャッシュ保存       ✅安全
testDraftMode()             下書きモード（AI画像含む）        ✅安全（Gmail通知あり）★v5.4更新
testImageGeneration()       MORNING画像生成テスト             ✅安全（Drive保存のみ）★v5.4追加
testImageAllTypes()         全6タイプ画像生成テスト           ✅安全（Drive保存のみ）★v5.4追加
testNotification()          承認メール表示テスト              ✅安全
testNotificationWithImage() 画像付き承認メールテスト          ✅安全 ★v5.4追加
testScheduleDryRun()        スケジュール確認                  ✅安全
showTriggers()              現在のトリガー一覧表示            ✅安全
initializeScheduler()       スケジューラ開始                  ⚠️トリガー設定
testFullPost()              MORNING投稿を実行                 ⚠️Xに投稿
emergencyStop()             全トリガー削除                    ⚠️全停止
setupPhase2And3()           Phase 2+3 シート初期化            ✅安全 ★v6.2追加
setupPhase4()               Phase 4 シート初期化              ✅安全 ★v6.2追加
testHypothesisLogging()     仮説検証ログ保存テスト            ✅安全 ★v6.2追加
testGetTweetMetrics()       ツイートメトリクス取得テスト      ✅安全 ★v6.2追加
testCollectMetrics()        エンゲージメント一括収集テスト    ✅安全 ★v6.2追加
```

---

## 20. API使用量

```
【Twelve Data API】
  無料枠: 800クレジット/日
  使用量: 168クレジット/日（21%）

【Gemini API】★v8.0モデル更新
  テキスト生成: gemini-2.5-pro（★v8.8.1: Flash→Pro変更。文字数遵守・指示追従の大幅改善）
    → maxOutputTokens: 8192（thinkingトークン対応）
    → thinkingConfig: { thinkingBudget: 1024 }
    → 1日6〜8回
    → ※gemini-2.0-flashは2026/06/01廃止予定のため移行済み
    → ※gemini-3-flash-previewはStable昇格後に移行予定
  画像生成: gemini-3-pro-image-preview
    → 1日3〜6回（市場系タイプのみ）
    → 再生成: 最大3回/投稿

【X API v2 メトリクス取得】★v6.2追加
  pay-per-use: $0.01/リクエスト
  毎朝1回: 前日の全投稿メトリクスをバッチ取得
  月額: 約$0.30（1リクエスト/日 x 30日）

【Google Slides API】★v5.4追加
  透かし合成用: 画像生成1回につき1回（1回約10秒）
```

---

## 21. GAS高度なサービス ★v5.4追加

```
GASエディタで有効化が必要:
  ・Google Slides API（slides / v1）→ 透かし合成用
```

---

*バージョン: v8.0*
*v8.0: Geminiモデル移行・投稿品質基盤強化バッチ（2026-03-18）*
*　　　① Geminiモデル移行: gemini-2.0-flash → gemini-2.5-flash*
*　　　　 - 2.0-flashは2026/06/01廃止予定のため移行*
*　　　　 - 2.5-flashはthinkingがデフォルトON → maxOutputTokens 1024→8192に拡張*
*　　　　 - thinkingConfig { thinkingBudget: 1024 } でthinking消費を制限*
*　　　　 - 次期移行先: gemini-3-flash-preview（Stable昇格後に移行予定。API形式は同一、callGemini_に約15行追加で対応可）*
*　　　② 深夜・早朝（0:00〜5:59）イベントの「発表済み」誤判定修正*
*　　　　 原因: 外為どっとコムは米国取引日をA列に使うため、FOMC 3:00等が日中に「発表済み」扱いされていた*
*　　　　 修正: getEconomicCalendar_とfetchTodayAnnouncedResults_の両方にガード追加（I列空＋0:00-5:59→未発表）*
*　　　③ 明日の重要度「高」イベントをカレンダー出力に追加*
*　　　　 植田日銀総裁記者会見（翌日15:30）等が「【明日】」ラベル付きで表示される*
*　　　④ 主要5中銀の政策金利をbuildPrompt_に常時注入*
*　　　　 FRB 3.50-3.75% / 日銀 0.75% / ECB 2.00% / BOE 3.75% / RBA 4.10%*
*　　　　 ※v8.5で政策金利をconfig.gsのPOLICY_RATESに一元管理化。金利変更時はconfig.gsの1箇所のみ更新*
*　　　⑤ 指標名混同防止ルール追加（buildFormatRules_）*
*　　　　 CPI≠PPI≠HICP。カレンダー記載の正式名称をそのまま使えと明記*
*　　　⑥ ファクトチェック強化（factCheckPost_）*
*　　　　 - 経済カレンダーデータをファクトチェッカーにも注入（指標名整合チェック）*
*　　　　 - 指標名混同チェック追加（CPI/PPI/HICP）*
*　　　　 - 中銀政策スタンスチェック追加（日銀ハト派等の誤記検出）*
*　　　⑦ 「要確認」後処理除去（replaceProhibitedPhrases_）*
*　　　　 プロンプトで禁止しているがすり抜けるケース → 「注目」に置換*
*　　　⑧ 指標結果取得の改善*
*　　　　 - scheduleResultFetchTriggers_: 発表+5分→+10分に延長（検索インデックス遅延対策）*
*　　　　 - scheduledFetchRates: 毎時リトライ追加（未取得指標を自動回収。深夜FOMC等もカバー）*
*　　　　 - fetchTodayAnnouncedResults_: 深夜ガード追加（0:00-5:59イベントを日中に誤取得しない）*
*　　　⑨ 「見極めたい」置換テキストに句点追加（文結合バグ防止）*
*　　　⑩ 二重句点「。。」→「。」の安全弁追加*
*　　　⑪ 指標データシートF列書き込みバグ修正（Utilities.formatDateの文字列分離）*
*　　　⑫ config.gs: TNX range修正（min:1.0→10, max:7.0→70, tnxScale:0.1追加）適用確認*
*　　　⑬ main.gs: メニューに「📊 指標結果を取得」追加（refreshTodayIndicatorResults手動実行）*
*　　　⑭ 後処理追加: 日本語名括弧付き二重表記除去（「豪ドル米ドル（豪ドル米ドル）」→「豪ドル米ドル」）*
*　　　⑮ 後処理追加: 「一番動いている」変形パターン2件追加（「今日は一番動いている」「一番動いている」）*
*　　　⑯ ファクトチェック総合判定ロジック修正*
*　　　　 バグ: Geminiが個別に⚠️を付けておきながらoverallを「✅全て正確」にする矛盾が発生*
*　　　　 修正: overallをGeminiに依存せず、個別itemsのverdictから再計算*
*　　　　 追加: ⚠️でもcorrectionを出力させる（旧は❌のみ）*
*　　　　 追加: サプライズ判定チェック（「サプライズ」「予想外」等の表現が実態と一致するか検証）*
*　　　⑰ 学び抽出プロンプト根本改善（extractPostInsights_）*
*　　　　 旧: 「普遍的な学びにする」→教科書レベルの一般論が大量発生*
*　　　　 新: 「この投稿だからこそ得られた具体的な知見」を要求*
*　　　　 NG/OK例を明示して一般論を排除（例: NG「地政学リスクでドル買い」OK「RBA利上げ直後は声明で反転しやすい」）*
*　　　⑱ 仮説抽出プロンプト強化（extractPostInsights_）*
*　　　　 旧: 「仮説が立てられない投稿ならなし」→なし多発*
*　　　　 新: 「市場系投稿で仮説なしは基本ありえない」+条件付き仮説OK+NG/OK例追加*
*　　　⑲ 学びログ注入テキスト改善（getLearningLog_）*
*　　　　 「仮説を立てる際はこれらの学びを根拠に使え」と指示追加（学び→仮説連携）*
*　　　⑳ ファクトチェック総合判定: verdict空文字列対策（v7.10c）*
*　　　　 バグ: Geminiがverdictを空("")で返す→correctionがあっても自動修正が発動しない*
*　　　　 修正: correctionフィールドの有無で実際の問題を判定。issuesをfilterして本当の問題だけautoFixPost_に渡す*
*　　　㉑ buildIndicatorResultPrompt_に現在時刻・未発表ガード追加*
*　　　　 バグ: 未発表指標の予想値を「結果」として書き込んでいた*
*　　　　 修正: プロンプトに現在時刻+各指標の発表時刻を追加、「予想値を結果として返すな」ルール明記*
*　　　㉒ writeIndicatorResults_: nullスキップ（取得失敗を書き込まない→次回リトライ対象に残す）*
*　　　㉓ fetchTodayAnnouncedResults_: isYesterday深夜帯ガード追加*
*　　　　 バグ: A列=3/18,B列=3:00(FOMC)を3/19 1:19に「昨日→全て発表済み」と誤判定*
*　　　　 修正: isYesterday+eventHour<6の場合、現在時刻と比較して未来なら発表前扱い*
*　　　㉔ testAll1〜4 → testAll1〜6に再分割（3タイプ×6グループ）*
*　　　　 testBatch_からSKIP_FACT_CHECKを削除 → ファクトチェック込みでテスト*
*　　　　 最長グループ約5分で6分制限に余裕あり（実測値で確認済み）*
*　　　㉕ 後処理追加: 日本語名括弧付き二重表記除去+「一番動いている」変形パターン2件追加*

*バージョン: v8.1*
*v8.1: scheduler/後処理品質強化バッチ（2026-03-19）*
*　　　① scheduler.gs: cleanupPostTriggers_の実行順序をINDICATOR/結果取得トリガー設定の前に移動*
*　　　　 バグ: 設定直後のrunIndicator/refreshTodayIndicatorResultsトリガーがcleanupで即削除されていた*
*　　　② scheduler.gs: 指標結果取得タイミングを発表+5分→+10分に変更*
*　　　　 5分ではGoogle検索に結果が未反映のケースがあり取得失敗→1時間後のリトライまで待つ問題*
*　　　③ scheduler.gs: scheduleIndicatorTriggers_の日付フォーマットバグ修正*
*　　　　 バグ: new Date('yyyy/MM/ddTHH:MM:SS')がInvalid Date→トリガー即発火→INDICATOR投稿が意図しないタイミングで2件生成*
*　　　　 修正: todayStr（yyyy-MM-dd形式）を追加しISO 8601準拠に*
*　　　④ scheduler.gs: 結果取得トリガーの対象を「高」+「中」→「高」のみに限定*
*　　　　 原因: 経済指標が多い日にトリガー数がGAS上限20件を超過し、通常投稿（GOLDEN/NY）が設定できなかった*
*　　　　 「中」の結果はscheduledFetchRates（1時間ごと）のリトライで取得される*
*　　　⑤ geminiApi.gs: 自動修正リトライ+強制削除（verifyAutoFix_ / extractKeyPhrases_ / forceRemoveIssueLines_）*
*　　　　 バグ: autoFixPost_がGeminiから「修正済み」を受け取っても、実際のテキストに問題表現が残るケースあり*
*　　　　 修正: 3段階セーフティネット（1回目修正→残留チェック+リトライ→強制行削除）*
*　　　⑥ geminiApi.gs: 重複テキストブロック除去（removeDuplicateBlocks_）*
*　　　　 バグ: autoFixPost_のGemini応答に本文の冒頭部分が重複して出力されるケース*
*　　　　 修正: 冒頭と同じ内容が後半に再出現した場合に自動除去。全6箇所の後処理チェーンに追加*
*　　　⑦ config.gs: MORNING投稿時刻を7:20〜7:50帯に変更（5曜日個別調整）*
*　　　⑧ config.gs: RANDOM_DELAY_MAX 2→3に拡大（トリガーゆらぎ拡大）*
*　　　⑨ utils.gs: addRandomDelay()の投稿処理sleepを最大60秒に独立制限*
*　　　　 バグ: RANDOM_DELAY_MAX=3でsleep最大180秒→GAS 6分制限でタイムアウト（メール未送信）*
*　　　　 修正: scheduler.gsのトリガーゆらぎとutils.gsの投稿遅延を分離*
*　　　⑩ geminiApi.gs: ハルシネーションレート修正（fixHallucinatedRates_）*
*　　　　 バグ: autoFixPost_がGeminiにレート修正を依頼した際、確定レートではなく別の値（例: 149.60円）を返す*
*　　　　 修正: 投稿テキスト内のレートをシステム確定レート（Twelve Data API）と照合し、乖離3%超なら確定値に置換*
*　　　⑪ geminiApi.gs: factCheckPost_/autoFixPost_にシステム確定レート注入*
*　　　　 根本対策: ファクトチェッカーと自動修正の両方にAPI確定レートを渡し、「3%以内は正確と判定」「レート修正時はこの値を使え」と指示*
*　　　　 Grounding検索と確定レートの情報源矛盾によるレート系誤検出を解消*
*　　　⑫ geminiApi.gs: autoFixPost_にファクトチェック用語混入検出+修正棄却*
*　　　　 バグ: Geminiが「修正後テキスト」ではなく「ファクトチェック結果の説明文」を返すケース*
*　　　　 修正: 15パターンの検証用語（「記述は正確です」「検証できません」等）を検出したら修正を棄却し元テキストを使用*

*バージョン: v8.8.1*
*v8.8.1: Gemini 2.5 Pro変更 + リトライ共通化 + テスト再構成（2026-03-26）*
*　　　① Geminiモデル変更: gemini-2.5-flash → gemini-2.5-pro（config.gs）*
*　　　　 文字数遵守・指示追従が大幅改善。Flashの2,069文字暴走・構造崩壊が解消*
*　　　　 Free Tier（100RPD/5RPM）で運用可能。月額コスト変更なし（$0）*
*　　　② リトライ4パターン共通化（geminiApi.gs: 537→566行）*
*　　　　 executeRetry_(config, base)新設: 主役ペア/リスクセンチメント/絵文字/→ブロックの共通処理を統合*
*　　　　 countEmojis_(text, emojiList)新設: 絵文字カウント重複コード解消*
*　　　　 checkMultiArrowBlocks_(text)新設: →複数ブロック検出重複コード解消*
*　　　③ postProcessor.gs \b除去（1,836→1,837行）*
*　　　　 37行目の英単語除去正規表現: \b → (^|[^A-Za-z]) + (?=[^A-Za-z]|$)*
*　　　　 設計の鉄則「\bは使わない」に準拠。動作変化なし*
*　　　④ testFunctions.gs再構成（819→225行）*
*　　　　 testAll1〜6廃止（Proの推論速度で3タイプ同時実行が6分超え）*
*　　　　 testPro_MORNING()等12個新設（1タイプずつ・ファクトチェック込み）*
*　　　　 testRULE1_3()/testRULE4()/testWEEK()新設（RULE系・週間系まとめ）*
*　　　　 不要テスト12個削除（testGenerateAll/testGenerateWeekend/fixDateBug等）*
*　　　⑤ 投稿構造の根本改革: ニュース要約型→仮説サイクル型（promptBuilder.gs 1,539→1,581行）*
*　　　　 「仮説の提示→答え合わせ→次の仮説」のサイクルで1日を回す構造に変更*
*　　　　 レート数字の羅列禁止。方向感（上昇基調/売られっぱなし等）で語る指示に変更*
*　　　　 「指標上振れなら通貨高」のような当たり前の仮説は禁止。政治・地政学・構造変化に根ざした非自明な仮説を要求*
*　　　　 為替の裏にある人間社会・生活への影響にも触れる指示を追加*
*　　　　 「エントリーした」「利確した」は禁止。「こう読んでいる」「こう見ている」で表現*
*　　　　 スプレッドシート投稿プロンプトの市場系6タイプ（MORNING〜NY）をv3に全面書き換え*
*　　　　 MORNING: 仮説答え合わせ→昨夜の世界→今日の仮説*
*　　　　 TOKYO: 朝のシナリオ途中経過→東京勢の空気感*
*　　　　 LUNCH: 午前総括→仮説の中間判定→生活との接点*
*　　　　 LONDON: 欧州ファンダ→仮説の現在地→NY展望*
*　　　　 GOLDEN: 仮説スコアカード→今日の学び→明日への視点*
*　　　　 NY: 仮説進捗→今夜の仮説（翌朝答え合わせ用）*
*　　　　 スプレッドシートの旧構造指示がコード側を上書きする問題を解消（上書き宣言追加）*

*バージョン: v8.8*
*v8.8: 品質改善バッチ（2026-03-25）*
*　　　① 後処理チェーン共通関数化（postProcessor.gs + geminiApi.gs）*
*　　　　 geminiApi.gsの7箇所にコピペされていた後処理チェーンをapplyPostProcessingChain_(text, postType, rates)に統合*
*　　　　 geminiApi.gs: 638行→537行（-101行）。今後の後処理追加は1箇所のみ*
*　　　② メタ的自己言及除去（postProcessor.gs）*
*　　　　 「投稿を作成します」「アラートの投稿」等7パターンを検出し、該当行を丸ごと除去*
*　　　③ INDICATOR投稿の主役ペア問題（geminiApi.gs + promptBuilder.gs）*
*　　　　 🔥主役ペアバリデーション対象からINDICATORを除外。指標の通貨ペアが主役であるべき*
*　　　　 INDICATOR方針に「あと○分で」残り時間表現禁止ルールを追加*
*　　　④ 「→もし」→「→し」バグ修正（postProcessor.gs）*
*　　　　 孤立助詞除去の正規表現を修正。助詞の後にカタカナが来た場合のみ除去するよう限定*
*　　　⑤ Excel除去バグ修正（postProcessor.gs）*
*　　　　 removeForeignText_の英単語許可リストにExcelを追加*
*　　　⑥ 「あと○分で」残り時間表現除去（postProcessor.gs + promptBuilder.gs）*
*　　　　 プロンプト層（禁止ルール）+ 後処理層（機械的除去）の二重防御*
*　　　⑦ プロンプトセクション数削減 Phase 1（promptBuilder.gs + marketAnalysis.gs）*
*　　　　 経済カレンダーの【発表済み】【未発表】→■に変更（セクションカウンター回避）*
*　　　　 ルール文中の【参照名】→括弧なしテキストに変更*
*　　　　 実測: MORNING 71→53セクション（-18）、18,252→17,345文字（-907文字）*
*　　　⑧ GAS 6分制限タイムガード（geminiApi.gs）*
*　　　　 generatePost冒頭にstartTimeタイマーを設置。4つのリトライ前に経過時間チェック*
*　　　　 4分（240秒）超過でリトライをスキップし、現在のテキストで続行*

*バージョン: v8.7*
*v8.7: 確定データシート化 + 要人リスト新設（2026-03-25）*
*　　　① POLICY_RATESハードコード廃止（config.gs）*
*　　　　 config.gsのPOLICY_RATES配列+getPolicyRatesText_関数を削除*
*　　　　 スプレッドシート「確定データ」シートから読み取る方式に変更*
*　　　　 金利変更時はスプレッドシートのセルを書き換えるだけでOK（コード修正不要）*
*　　　② 要人リスト新設（config.gs + factCheck.gs + promptBuilder.gs）*
*　　　　 主要12人（トランプ大統領、高市首相、パウエルFRB議長、植田日銀総裁等）*
*　　　　 factCheckPost_/autoFixPost_/buildPrompt_に確定データとして注入*
*　　　　 Geminiの古い学習データ（バイデン大統領）による誤判定を防止*
*　　　③ setupReferenceDataSheet()新設（config.gs）*
*　　　　 カスタムメニューからシートを自動作成（金利5件+要人12人の初期データ投入）*
*　　　④ factCheckPost_の要人役職ルール更新（factCheck.gs）*
*　　　　 「Google検索を最優先」→「確定データ4のリストを最優先」に変更*
*　　　　 確定データに載っている人物は確定データが100%正しいと明示*
*　　　⑤ カスタムメニューに「確定データシート作成」追加（main.gs）*

*バージョン: v8.4*
*v8.4: factCheckカレンダー修正・仮説検証ログ拡張・仮説3要素構造化（2026-03-22）*
*　　　① factCheckPost_のカレンダースコープをpostType別に修正（NEXT_WEEKに来週カレンダーを渡す）*
*　　　② 仮説検証ログ登録対象をWEEKLY_HYPOTHESISのみ→RULE/KNOWLEDGE以外の全市場系に拡張（Phase 5データ蓄積）*
*　　　③ 仮説抽出プロンプトを「条件(IF)→理由(BECAUSE)→結果(THEN+レート)」の3要素構造に強化*

*バージョン: v8.5*
*v8.5: geminiApi.gsファイル分割 + 政策金利一元管理（2026-03-23）*
*　　　① geminiApi.gsファイル分割（9,398行→567行・11ファイル）*
*　　　　 geminiApi.gs（核: 567行）/ promptBuilder.gs（1,505行）/ postProcessor.gs（1,682行）*
*　　　　 factCheck.gs（442行）/ rateManager.gs（811行）/ marketAnalysis.gs（795行）*
*　　　　 indicatorManager.gs（1,191行）/ learningManager.gs（859行）/ priceSummary.gs（642行）*
*　　　　 calendarManager.gs（802行）/ testFunctions.gs（819行）*
*　　　② 政策金利をconfig.gsのPOLICY_RATESに一元管理化*
*　　　　 旧: geminiApi.gsの3箇所（buildPrompt_/factCheckPost_/autoFixPost_）にハードコード*
*　　　　 新: config.gsのPOLICY_RATES + getPolicyRatesText_()で1箇所管理*
*　　　③ testGenerateOnly重複関数を削除（main.gsに高機能版が存在するため）*
*　　　④ REVERSE_INDICATORSグローバル変数をindicatorManager.gsに移動*
*　　　⑤ 詳細は「geminiApi_ファイル分割_要件定義書_ロードマップ_v1_2_完了版.md」を参照*

*バージョン: v8.6*
*v8.6: プロンプト最適化 + レート混同修正 + ファクトチェック改善（2026-03-23）*
*　　　① キャラクターシート統合（スプレッドシート「キャラクター」シート）*
*　　　　 9行・約20サブセクション・約8,000文字 → 5行・約5サブセクション・約3,500文字*
*　　　　 ペルソナ+人間味/発信原則+口調+専門用語/禁止表現→禁止事項/TC導線圧縮/根底思想→削除*
*　　　② buildFormatRules_タイプ別条件分岐（promptBuilder.gs）*
*　　　　 needsMarketRules変数でRULE系・KNOWLEDGEから不要な7セクションを除外*
*　　　　 重複削除: レート桁数ルールをbuildPrompt_に一本化*
*　　　③ TC導線フィルタリング（promptBuilder.gs）*
*　　　　 TC禁止タイプでキャラクターシートのTC導線セクションを自動除外*
*　　　④ RULE系ニュース参照矛盾修正（promptBuilder.gs）*
*　　　　 ニュース未注入のRULE系に「📰市場ニュースから引用せよ」があった矛盾を解消*
*　　　⑤ 簡潔さルール追加（promptBuilder.gs）*
*　　　　 最優先ルール6「読者が推測できる補足は省略」+フォーマット構造「→行は1〜2文で完結」*
*　　　⑥ fixHallucinatedRates_部分一致バグ修正（postProcessor.gs）*
*　　　　 「豪ドル円」内の「ドル円」がUSD/JPYに部分一致していた問題を修正*
*　　　⑦ ファクトチェック❌のremovable/fixable分類（factCheck.gs）*
*　　　　 correctionが空/「確認できません」系 → removable=true（即削除対象）*
*　　　⑧ 検証不能❌即削除ロジック（geminiApi.gs）*
*　　　　 removable=trueの❌はGeminiに渡さずforceRemoveIssueLines_で即削除*
*　　　⑨ 効果実測値: MORNING 92→68セクション、23,007→18,137文字（-21%）*
*　　　　 TOKYO投稿文字数 477→368文字（charMax 350内に収まった）*
*　　　⑩ 品質レビューシステム新設（qualityReview.gs 332行）*
*　　　　 Claude Sonnet 4.6によるクロスチェック（Gemini生成→Claude品質レビュー）*
*　　　　 レビュー5項目: タイプ整合/表現重複/文の完成度/文字数/口調一貫性*
*　　　　 過去投稿キャッシュ（ScriptProperties）で1日の表現重複を検出*
*　　　⑪ normalizeRateDecimals_追加（postProcessor.gs）*
*　　　　 レート桁数正規化: JPY小数3桁以上→2桁、USD小数5桁以上→4桁*
*　　　⑫ factCheckPost_/autoFixPost_に日時動的注入（factCheck.gs）*
*　　　　 Geminiが時制を見失う問題（「トランプは民間人」誤判定）を防止*
*　　　⑬ scheduler.gs処理順序変更*
*　　　　 トリガー設定を最優先に実行。サマリー更新タイムアウトでも投稿は動く*
*　　　⑭ imageGenerator.gs透かしログ改善*
*　　　　 再生成時の透かし合成成功/失敗をconsole.logで出力*
*　　　⑮ factCheck.gs要人役職の特別ルール追加*
*　　　　 要人の役職判定はGoogle検索結果を最優先。内部知識だけで❌にしない（全要人対応）*
*　　　⑯ postProcessor.gs「皆さん」呼びかけ自動除去*
*　　　　 「皆さん、」「フォロワーの皆様」等を除去。1対1の語りかけスタンス維持*
*　　　⑰ Bloomberg最優先検索（marketAnalysis.gs）*
*　　　　 fetchMarketNews_の検索ソースにbloomberg.com/bloomberg.co.jpを最優先指定+ソース欄追加*
*　　　⑱ 参照ソース注入バグ修正+ソース元言及ルール（promptBuilder.gs）*
*　　　　 getReferenceSources_のD列→C列修正。「Bloombergの報道によると〜」自然言及ルール追加*
*　　　⑲ scheduler.gs処理分離（scheduleTodayPosts 5:00 + scheduleDailyMaintenance 5:15）*
*　　　　 INDICATORが投稿されなかった根本原因（毎朝のタイムアウト）を解消*

*バージョン: v8.3*
*v8.3: 後処理修正・ファクトチェック2層構造・金利更新・仮説検証バグ修正（2026-03-21〜22）*
*　　　① replaceProhibitedPhrases_の\b→(^|[^0-9.])修正（レート用・パーセント用の2箇所）。小数点直後にマッチして二重小数点を生成していた*
*　　　② validateFinalFormat_()新設（二重小数点の最終安全網）。全6経路に組み込み*
*　　　③ レート表記桁数ルール追加（JPY小数2桁/USD小数4桁。プロンプト2箇所）*
*　　　④ ECB政策金利: 預金金利2.00%→政策金利2.15%に統一（3箇所）。BOE据え置き日も追記*
*　　　⑤ 仮説検証/学び抽出: callGemini_戻り値がオブジェクトなのに直接.trim()していた→.textを取り出すよう修正（2箇所）*
*　　　⑥ ファクトチェック2層構造化: factCheckPost_にLayer 2（知識+Grounding検証）追加。autoFixPost_はGrounding OFF（correction+システムデータのみ）*

*バージョン: v8.2*
*v8.2: ファクトチェック根本改修・承認メール簡潔化（2026-03-20）*
*　　　① geminiApi.gs: factCheckPost_をGrounding依存→システムデータ照合に根本改修*
*　　　　 旧: Google検索（Grounding）で外部情報を取得して検証 → 古い情報で正しい投稿を誤判定*
*　　　　 新: システム確定データ（レート・金利・経済カレンダー）との照合のみ。Groundingを使わない（callGemini_第3引数をfalse）*
*　　　　 「システムデータで検証できない主張は⚠️（検証不可）とし、❌にはするな」と指示*
*　　　② geminiApi.gs: ⚠️の扱い変更*
*　　　　 旧: ⚠️もautoFix対象 → Groundingで古い情報を使って正しい投稿を悪化させる*
*　　　　 新: ⚠️はautoFix対象外（❌のみautoFix発動）。⚠️は承認メールに表示するだけ*
*　　　③ geminiApi.gs: factCheckPost_/autoFixPost_に政策金利5中銀分を注入*
*　　　　 buildPrompt_と同じデータ（FRB/日銀/ECB/BOE/RBA）をチェッカーにも渡す*
*　　　④ approval.gs: 承認メール表示の簡潔化*
*　　　　 旧: 全項目（✅含む）表示+修正ログ+修正前テキスト → 問題が埋もれる*
*　　　　 新: ✅なら緑の1行 / 問題ありなら❌/⚠️のみオレンジ枠 / 修正前テキスト廃止*

*v7.9: 後処理品質強化バッチ・人間味ルール導入・autoFixPost_投稿タイプ別トーン保持（2026-03-17）*
*　　　① v7.4: 伝聞表現後処理（6パターン）・月曜「昨日終値比」追加・過去事実プロンプトルール追加*
*　　　② v7.4b: プロンプト注入テキストの曜日分岐修正*
*　　　　 isMonday_ / prevDayLabel 変数を追加（月曜=「先週金曜終値比」/ 火〜金=「前日終値比」）*
*　　　③ v7.4c: aggregateDailyRates()列ズレバグ修正*
*　　　　 原因: v6.6商品データ追加でキャッシュが14列になりステータス列を誤認識→日次レートが3/9から停止*
*　　　　 修正: numColsをcacheSheet.getLastColumn()で動的取得・statusColをヘッダー検索で特定*
*　　　　 対応: rebuildDailyRates()で欠損期間（3/10〜3/15）を再構築済み*
*　　　④ v7.5: 後処理チェーン強化（4点）*
*　　　　 - fixMondayYesterday_に通貨ペア名パターン追加（「昨日の豪ドル米ドルの高値」等）*
*　　　　 - replaceProhibitedPhrases_にGrounding痕跡除去追加（「という記述が見つかりました」等9パターン）*
*　　　　 - buildFormatRules_の断言ルールを「絵文字行=事実言い切り/→行=人間味」の2層構造ルールに刷新*
*　　　　 - buildPrompt_のTOKYO・MORNINGに通貨ペア混同禁止ルール追加（AUD/USDとAUD/JPYの混在禁止）*
*　　　⑤ v7.6: リトライチェーンTC除去漏れ修正*
*　　　　 主役ペアリトライ・リスクセンチメントリトライの後処理にremoveTCMention_を追加*
*　　　⑥ v7.7: 後処理・プロンプト・ファクトチェック強化（4点）*
*　　　　 - 冗長表現除去（「オセアニア通貨の豪ドル」「資源国通貨の豪ドル」等5パターン）*
*　　　　 - 経済カレンダー日付確認ルール追加（今日でないイベントを「今日控えている」と書くな）*
*　　　　 - WTI原油と為替の因果関係ルール強化（逆方向のNG例を明示）*
*　　　　 - factCheckPost_に経済イベント日付チェック追加（今日でないイベントの日付誤りを検出）*
*　　　⑦ v7.8: autoFixPost_に投稿タイプ別トーン保持ルール追加*
*　　　　 原因: ファクトチェック後の自動修正でGeminiが投稿タイプの文脈を無視して書き直した（LONDON→朝の投稿に変質）*
*　　　　 修正: typeContextMap（7タイプ分のトーン定義）をpromptに注入し、タイプ別トーン維持を強制*

*バージョン: v7.3*
*v7.3: 後処理追加強化・プロンプト品質改善バッチ（2026-03-15）*
*　　　① 後処理チェーン追加強化（5項目）:*
*　　　　 - あなたの→みなさんの*
*　　　　 - 「今日注目しているのはXXでしょうか」→「ですね。」*
*　　　　 - 0XX%パターン修正（013%→0.13%）*
*　　　　 - 全角スペース行頭除去（　　テキスト→テキスト）*
*　　　　 - でしょうか重複→2回目以降を断言に変換*
*　　　② 主役ペア「今日一番動いている」禁止（プロンプト＋後処理）*
*　　　③ RULE系プロンプトに根拠のない数値禁止・架空統計禁止を追加*
*　　　④ リプライ誘発質問をGemini自由生成方式に変更（固定プール廃止）*
*　　　⑤ WEEKLY_LEARNING 架空失敗談禁止を厳守事項に追加*
*　　　⑥ importFromRawSheet 新形式対応（A列に時刻・B列に国名・C列に指標名）*
*　　　⑦ 承認WebApp 複数Googleアカウント問題: authuser付与は不採用。スマホで運用*
*　　　⑧ 設計書・投稿プロンプト一覧を v2026-03-15 に更新*

*バージョン: v7.0*
*v7.0: 品質強化バッチ（2026-03-14）*
*　　　① LONDONプロンプト強化: 発表済み/未発表区別ルール明記、断言指示強化、→使い方ルール明文化、曖昧表現禁止ワード追加*
*　　　② GOLDENプロンプト修正: 「正直疲れた」等スキャルパー前提の表現を削除*
*　　　③ リスクセンチメント後処理チェック追加（geminiApi.gs）: 「リスクオフ＋円売り」同時出現で強制リトライ*
*　　　④ 絵文字行末→行頭 後処理追加（geminiApi.gs enforceLineBreaks_）: 「テキスト絵文字」→「絵文字 テキスト」に自動変換*
*　　　⑤ buildFormatRules_に絵文字位置ルール追加: 「絵文字は必ず行頭。行末に絵文字を置くな」明記*
*　　　⑥ RULE_3プロンプト構造修正（v2）: エッセイ構造→絵文字ブロック形式に合わせて再設計（フォーマットルール競合を解消）*
*　　　⑦ プロンプト4点改善（TCAX_投稿プロンプト一覧 v2026-03-13v2）:*
*　　　　 RULE_1〜4のTC導線に「時短」OK例追加*
*　　　　 RULE_1〜4+KNOWLEDGEのトーンに伴走者スタンス追加（「一緒に上手になろう」）*
*　　　　 LUNCH+GOLDENのトーンに「検証日和・休む勇気」概念追加*
*　　　　 KNOWLEDGEの絶対NGに情報商材NG追加*
*　　　⑧ リプライ誘発質問機能追加（buildFormatRules_ / geminiApi.gs）:*
*　　　　 約30%の確率で末尾に質問文を自動挿入（投稿タイプ別質問プール）*
*　　　　 質問注入時は本文中の疑問形を断言に置換して重複回避*
*　　　⑨ 米10年債利回り修正:*
*　　　　 config.gs: TNXの範囲チェックを min:1→min:10, max:7→max:70 に修正（GOOGLEFINANCE("TNX")は10倍返し）*
*　　　　 geminiApi.gs: 読み取り値を÷10して実際の%値（例: 42.43→4.243%）に正規化して保存*
*v5.1: 後処理5段階化、レートサマリー導入*
*v5.2: 8段階後処理チェーン、承認フロー改善、POST_MODE切替*
*v5.3: Twelve Data API導入、7通貨ペア対応、5年分OHLC、13期間サマリー*
*v5.4: Phase 7 AI画像生成（Gemini画像生成、12アーキタイプ、TC透かし合成、3ボタン承認メール、画像再生成、main.gs統合）*
*v5.5: 月曜MORNING強化（fetchMarketNews_週末世界情勢検索、buildPrompt_月曜専用コンテキスト、「昨日」誤用防止）*
*v5.6: 通貨強弱ランキング注入、レート方向性プロンプト注入、仮説自動検証*
*v5.7: 経済指標結果自動取得（三層活用アーキテクチャ: Layer1直前振り返り、Layer2学びログ連携、Layer3 INDICATOR強化）*
*v5.8: フォーマット最適化+シャドウバン回避（空行自動制御、3部構成、結論バリエーション8種、絵文字2〜3個制限、URL時ハッシュタグ1個制限、投稿間隔15分チェック）*
*v5.9: ノート形式フォーマット導入（3部構成→事実→分析の繰り返し構造、締めの→自動除去、結論バリエーション→除去）*
*v6.2: 完全自動学習型システム Phase 2〜4実装（仮説的中率自動集計、学びスコアベース選択、エンゲージメントフィードバック、X API metricsバッチ取得、品質スコア計算、プロンプト注入）*
*v6.3: Phase 8 指標連動投稿実装（重要指標30分前に動的トリガー、1日最大2件）+ validateモードメニュー追加*
*v6.4: 画像再生成バグ修正（2026-03-10）*
*　　　① doGet 30秒タイムアウト対策: regenerateアクションを非同期化（フラグ立て即返す→トリガー内で画像生成）*
*　　　　 processPendingRegenRequests_()をprocessApprovedDrafts冒頭で呼び出し*
*　　　② getDraftById_ 列インデックスずれ修正（仕様書v1.1準拠）*
*　　　　 postType: data[i][1]→data[i][3]（D列）、scheduledTime: data[i][3]→data[i][2]（C列）*
*　　　③ DRAFT_EXPIRY_MINUTES: 60→90に延長*
*v6.5: 通貨強弱の表現修正（2026-03-10）*
*　　　「最強・最弱」→「買われている・売られている・軟調」に変更（5通貨7ペア簡易計算の語弊を回避）*
*　　　geminiApi.gs 3箇所修正: ランキング表示・指示セクション・整合チェック文*
*v6.7: 経済カレンダーインポート機能強化（2026-03-12）*
*　　　importFromRawSheet() を外為どっとコムの実際のデータ形式に完全対応*
*　　　行構造: セパレータ行（B=時刻Date型, C=[国名]）+ 指標行（B=指標名, D=前回, E=予想, F=結果）*
*　　　I列（結果）・J列（判定）を書き込み対象に追加（judgeDeviation_で上振れ/下振れ/一致を自動計算）*
*　　　継続行（修正前回値）の正確な処理: セパレータ切り替わり時にリセット*
*　　　J1ヘッダー「判定」の上書き問題を修正（最終更新日時をH1に変更）*
*v6.8: 指標結果取得の品質強化・定期トリガー化・INDICATOR自動再設定（2026-03-13）*
*　　　① 投稿品質強化*
*　　　　 主語消え対策: プロンプトに「→で始まる文には必ず主語を入れろ」追加*
*　　　　 小数点後処理強化: 整数丸め修正ループ追加（11350→113.50等の誤記を自動修正）*
*　　　　 H1「最終更新」フォントカラーを白に変更（青背景に合わせる）*
*　　　② 経済カレンダー結果をプロンプトに注入*
*　　　　 getEconomicCalendar_() の読み込みを8列→10列に拡張*
*　　　　 result（I列）・judgment（J列）を line 文字列に追加してGeminiに渡す*
*　　　③ 指標結果取得の定期トリガー化（投稿生成と切り離し）*
*　　　　 fetchTodayAnnouncedResults_() の公開ラッパー refreshTodayIndicatorResults() を追加*
*　　　　 buildPrompt_() からの呼び出しを削除（投稿生成時の負荷軽減）*
*　　　　 scheduleResultFetchTriggers_() を scheduler.gs に追加*
*　　　　 経済カレンダーのB列（発表時刻）+5分で動的設定 → サマータイム自動対応*
*　　　④ 深夜帯（0:00〜5:59）に前日分も取得対象にする*
*　　　　 isLateNight フラグ導入・前日分は isAnnounced チェックをスキップ*
*　　　⑤ 指標結果に単位を付与（writeIndicatorResults_で unit フィールドを活用）*
*　　　⑥ importFromRawSheet末尾にトリガー自動再設定を追加*
*　　　　 5:00以降にインポートした場合でもINDICATOR・結果取得トリガーが確実に設定される*
*　　　⑦ 指標データシートにGAS読み取り日時列（F列）を追加（setupIndicatorSheet更新）*
*v6.9: 経済カレンダーB列Date型対応（2026-03-13）*
*　　　根本原因: B列（時間）はDate型で保存されているため String().split(':') → parseInt() がNaNになっていた*
*　　　結果: scheduleIndicatorTriggers_ / scheduleResultFetchTriggers_ のトリガーが常に0件だった*
*　　　　　  fetchTodayAnnouncedResults_ も同様にisAnnounced判定が全てfalseになっていた*
*　　　修正: rawTime instanceof Date の場合は getHours() / getMinutes() で取得するよう変更*
*　　　対象: geminiApi.gs（fetchTodayAnnouncedResults_）/ scheduler.gs（両トリガー関数）の3箇所*
*v6.6: 商品データ4銘柄対応（2026-03-11）*
*　　　BTC/USD + XAU/USD（GOLD）をTwelve Dataで1時間ごと同時取得*
*　　　WTI・天然ガスをAlpha Vantage APIで日次取得（23時間キャッシュ）*
*　　　Alpha Vantage APIキー取得・Script Propertiesに登録（ALPHA_VANTAGE_API_KEY）*
*　　　レートキャッシュ列: I(WTI) J(BTC) K(GOLD) L(NATGAS) M(取得元) N(ステータス)*
*　　　プロンプト注入にGrounding検索指示追加（APIデータ基準値+リアルタイム確認の二重チェック）*
