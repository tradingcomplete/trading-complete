# T-CAX 設計書 v8.0

**方針**: プロンプト公開 + トレードスタイル定義 + 学び自動蓄積 + 7通貨ペア市場データ + 完全自動学習
**関連ドキュメント**: スプレッドシート仕様書 v1.0（全15シートの列定義・読み書き関数・データフローの詳細）

---

## 1. 設計思想

### コンセプト

```
「魚ではなく、釣り方を」

AI自動投稿であることを最初から公開。
プロンプトを見せることで信頼と期待感を生む。
やり方を知りたければ参考にどうぞ。
めんどくさければ、この投稿を見てくれればOK。
```

### 公開/非公開の分離

```
【公開するもの（スプレッドシート）】
  → 「何の情報をAIに聞いているか」
  → 「どんなトレードスタイルで判断しているか」
  → フォロワーが学べる＆真似できる

【非公開のもの（各分割ファイルにハードコード。★v8.5でファイル分割済み）】
  → 文字数、改行、絵文字、禁止事項などのフォーマットルール
  → 12段階後処理チェーン
  → 見せても意味がない＆見栄えが悪い
```

### 使うほど賢くなる仕組み ★v4.0で自動蓄積化

```
Week 1:  学びログ 0件  → 一般的な投稿
Week 4:  学びログ 10件 → 過去の失敗を踏まえた投稿
Week 12: 学びログ 30件 → 豊富な引き出しから具体例を交えた投稿
Week 52: 学びログ 100件 → 1年分の実体験に基づく深い投稿

※ v3.0では手動追記のみ → v4.0で投稿成功時にGeminiが自動抽出・蓄積
※ RULE系/KNOWLEDGE投稿はスキップ（教訓から教訓を抽出しても循環するだけ）
※ 6カテゴリ自動判定: 相場心理/テクニカル/ファンダメンタルズ/リスク管理/指標分析/市場構造
```

---

## 2. スプレッドシート構成（17シート）

### 2-1. プロンプト素材シート（7シート）

```
#   シート名          役割                              注入先          公開
①  キャラクター       コンパナの人格・口調・信念         全投稿          可
②  TC概要            Trading Completeとは何か           TC導線7タイプ    可
③  投稿プロンプト     各投稿タイプで何をAIに聞くか       該当タイプ      可
④  トレードスタイル   コンパナの売買ルール・判断基準     全投稿          可
⑤  参照ソース        情報取得先URL一覧                  全投稿          可
⑥  学びログ          過去のトレードで得た学び・気づき   対象10タイプ    蓄積型
⑦  経済カレンダー    経済指標スケジュール               市場系11タイプ   ★v4.0追加
```

### 2-2. 運用管理シート（4シート）

```
#   シート名          役割                              用途
⑧  投稿履歴          投稿の記録・追跡                  savePost()で自動書き込み
⑨  心得テーマ        RULE系投稿のテーマローテーション   getNextTheme()で選択
⑩  下書き            投稿前の確認・承認管理             Gemini生成→下書き→Gmail承認
```

### 2-3. レートデータシート（4シート） ★v4.2で⑭追加

```
#   シート名          役割                              用途
⑪  レートキャッシュ   7通貨ペアの生データ（直近7日分）  1時間ごとTwelve Data APIで取得
⑫  日次レート        7ペア x OHLC集約（5年分蓄積）     毎朝5:00に前日分を集約
⑬  レートサマリー    13期間 x 7ペアの高値/安値          プロンプトに注入（意識される価格帯）
⑭  指標データ        株価指数・債券利回り・VIX等        GOOGLEFINANCE関数で自動更新 ★v4.2追加
```

### 2-4. 自動学習シート（2シート） ★v5.2追加

```
#   シート名            カテゴリ        読み書き        作成方法
⑯  仮説検証ログ         自動学習        読み書き        setupPhase2And3()
⑰  エンゲージメントログ  自動学習        読み書き        setupPhase4()
```

### 2-5. ユーティリティシート（1シート） ★v4.2追加

```
#   シート名            役割                              用途
⑮  経済指標_貼り付け    外為どっとコムの生データ一時保持   importFromRawSheet()でパース
```

### シート変更履歴

```
v3.0: 9シート（①〜⑥プロンプト素材 + ⑦⑧⑨運用管理）
v4.0: 14シート（⑦経済カレンダー追加 + ⑪⑫⑬レートデータ3シート追加、番号振り直し）
v4.2: 15シート（⑭指標データ + ⑮経済指標_貼り付け追加）
v5.2: 17シート（⑯仮説検証ログ + ⑰エンゲージメントログ追加）
```

---

## 3. 各シートの詳細

### シート① キャラクター（既存）

```
2列構成（A: セクション、B: 内容）。既存のまま変更なし。
```

### シート② TC概要（22行）

```
2列構成（A: セクション、B: 内容）。

カテゴリ     行数  内容
─────────────────────────────────────────
基本情報      7行  サービス名、コンセプト、課題、ターゲット、核心の価値、URL
6タブ機能紹介 6行  各タブの具体的な機能
差別化        5行  開発背景、差別化、変化の階段、開発者の想い、投稿での扱い
ビジネス情報  3行  価格帯、リリース予定、技術特徴
```

### シート③ 投稿プロンプト（16行） ★v4.0で1行追加

```
3列構成（A: 投稿タイプID、B: 投稿名、C: プロンプト内容）。

#   投稿タイプID       投稿名                追加要素
──────────────────────────────────────────────────────────────
1   MORNING           朝の市場チェック       大衆心理、過去事例
2   TOKYO             東京オープン前         大衆心理
3   LUNCH             ランチタイム           用語補足（実践レベル）
4   LONDON            ロンドンレポート       大衆心理、過去事例
5   GOLDEN            ゴールデンタイム       大衆心理
6   NY                ニューヨーク前         大衆心理、過去事例
7   INDICATOR         指標アラート           指標の本質補足、大衆心理
8   WEEKLY_REVIEW     週間振り返り           大衆心理、過去事例
9   RULE_1            心得（知識・原則）     実戦で気づいた原則
10  RULE_2            心得（習慣・メンタル） 群集心理の観点
11  RULE_3            心得（実践テクニック） テクニックの本質
12  RULE_4            心得（失敗談・本音）   負けてる時の群集心理
13  WEEKLY_LEARNING   今週の学び             本音ベース
14  NEXT_WEEK         来週の注目             指標の重要性補足
15  WEEKLY_HYPOTHESIS 来週の仮説             大衆心理、過去事例
16  KNOWLEDGE         知識解説               経済指標やFX用語の解説  ★v4.0追加
```

### シート④ トレードスタイル（18行）

```
2列構成（A: 項目、B: 内容）。v3.0と同じ。

項目                       内容の要約
─────────────────────────────────────────────────────
手法名                     ダウ理論×フィボナッチ 順張りデイスイング
基本スタイル               日足エリオット第3波・第5波の中の4時間足初動を捉える
主な時間軸                 日足（環境認識）/ 4時間足（執行）
主な通貨ペア               USD/JPY、EUR/USD、GBP/USD ★実際は7ペア監視
トレード時間帯             欧州〜NY時間（16:00〜25:00）
エントリー基準（ロング）   日足上昇トレンド確認→フィボ38.2-61.8%待ち→4h高値ブレイク
エントリー基準（ショート） 日足下降トレンド確認→フィボ38.2-61.8%待ち→4h安値ブレイク
損切りルール               直近高値/安値の少し外。許容損失額以内のロット調整
利確の考え方               RR 1:1.5以上。N値・E値、水平線抵抗帯を目安
重視する指標               US10Y、US02Y、FedWatch。金利方向と通貨強弱の一致
重視するテクニカル         ダウ理論、フィボナッチ、水平線。プライスアクション重視
メンタルの原則             「待つのも仕事」。機会損失より規律違反を恐れる
相場観の傾向               ファンダ順張り。FRBの方向性に逆らわない
得意なパターン             トレンド相場の押し目・戻り目（ファンダ+テクニカル一致時）
苦手なパターン             レンジ・イベント前。方向感なければノートレード徹底
チェックリスト1            日足トレンド方向は合っているか？
チェックリスト2            フィボ38.2-61.8%まで引きつけたか？
チェックリスト3            4時間足確定でブレイクしたか？
```

### シート⑤ 参照ソース（10行）

```
4列構成（A: カテゴリ、B: ソース名、C: URL、D: 用途）。

カテゴリ       ソース名                    用途
────────────────────────────────────────────────────
為替レート     みんかぶFX                  ドル円・ユーロドル・ポンドドルの最新レート
為替レート     外為どっとコム              リアルタイムチャート
米国債利回り   Investing.com 米10年債      US10Y 米国債10年利回り
米国債利回り   Investing.com 米2年債       US02Y 米国債2年利回り
金利見通し     CME FedWatch               FRBの利下げ/利上げ確率
経済指標       みんかぶ 経済指標カレンダー  今週・来週の経済指標スケジュール
経済指標       外為どっとコム 経済指標      経済指標の予想・結果
市場概況       Bloomberg Japan            市場ニュース・分析
市場概況       ロイター Japan             市場ニュース速報
ポジション動向 外為どっとコム ポジション比率 個人投資家のポジション偏り

※ v4.0ではレートはTwelve Data APIから正確に取得。
   Geminiはテキスト生成のみに使用（Grounding廃止）。
   参照ソースはGeminiへの文脈提供として引き続き有効。
```

### シート⑥ 学びログ（蓄積型） ★v4.0で自動蓄積化

```
8列構成（A: 日付、B: カテゴリ、C: 学びの内容、D: ソース、E: 使用回数、F: 有効度スコア、G: 最終使用日、H: ステータス）。
★v5.2追加: E〜H列は完全自動学習Phase 3で追加。setupPhase2And3()で初期化。

【v3.0】コンパナが手動で追記
【v4.0】投稿成功時にGeminiが自動抽出 + 手動追記も可能

蓄積の流れ:
  投稿テキスト → Geminiで学びを1行抽出 → カテゴリ自動判定 → シートに追記
  → 次回以降の投稿でgetLearningLog_()が直近の学びをプロンプトに注入

カテゴリ（6種・自動判定）:
  相場心理 / テクニカル / ファンダメンタルズ / リスク管理 / 指標分析 / 市場構造

スキップ対象: RULE_1〜4、KNOWLEDGE（教訓投稿から教訓を抽出しても循環するだけ）
重複チェック: 直近20件と完全一致する場合はスキップ
安全設計: 学びログ抽出のエラーで投稿フロー全体は止まらない
```

### シート⑦ 経済カレンダー ★v4.0追加

```
8列構成（A: 日付、B: 時間(JST)、C: 国/地域、D: 指標名、E: 前回、F: 予想、G: 重要度、H: 備考）。

対象国: 米国、日本、ユーロ圏、英国（それ以外はフィルタで除外）
更新: 外為どっとコム → コピペ → importFromRawSheet()でパース、または手動入力
注入: getEconomicCalendar_(scope)でスコープ別に取得

スコープ別注入ルール:
  today     → MORNING, TOKYO, LUNCH, LONDON, GOLDEN, NY, INDICATOR
  this_week → WEEKLY_REVIEW, WEEKLY_LEARNING
  next_week → NEXT_WEEK, WEEKLY_HYPOTHESIS
  注入なし  → RULE_1〜4, KNOWLEDGE

※ Gemini Groundingの「ハルシネーション指標」問題を根本解決
   （存在しない指標名や間違った発表時刻を防止）
```

### シート⑧ 投稿履歴（運用管理）

```
12列構成。savePost()で投稿ごとに自動書き込み。

列  項目              内容
───────────────────────────────────────
A   日時              投稿日時（自動）
B   曜日              曜日（自動）
C   投稿番号          通し番号（自動）
D   タイプ名          MORNING, TOKYOなど16タイプ
E   投稿テキスト      生成されたテキスト全文
F   画像有無          あり/なし
G   使用アーキタイプ  12アーキタイプのいずれか ★Phase 7追加
H   仮説              その投稿に含まれる仮説（あれば）
I   学び              その投稿に含まれる学び（あれば）
J   ツイートID        X投稿後のID
K   ステータス        成功/エラー
L   エラーログ        エラー時の詳細

主な読み込みパターン:
  getLastHypothesis()    → H列を最終行から遡って最初の非空値
  getLastLearning()      → I列を最終行から遡って最初の非空値
  getRecentArchetypes(n) → G列を最終行からn件分の非空値を配列で返す
  getTodayPostCount()    → A列が今日の日付の行数をカウント

仮説検証（v5.5.2）:
  verifyPreviousHypothesis_()でH列の未検証仮説を
  レートデータと照合し、検証結果（○/△/×）を追記する
```

### シート⑨ 心得テーマ（運用管理）

```
7列構成。RULE_1〜4のテーマローテーション管理。

列  項目            内容
───────────────────────────────────────
A   ID             テーマID
B   カテゴリ       RULE_1〜4のいずれか
C   テーマ名       「損切りの技術」「エントリーの規律」など
D   キーメッセージ テーマの核となるメッセージ
E   TC導線パターン そのテーマでのTC紹介方法
F   最終使用日     最後に使用した日付
G   使用回数       累積使用回数

getNextTheme()が「最終使用日が最も古いテーマ」を選択し、
使用後に最終使用日と使用回数を自動更新する。
24件をローテーション管理。
```

### シート⑩ 下書き（運用管理）

```
8列構成。Gemini生成テキストの投稿前確認・承認管理用。

列  項目              内容
───────────────────────────────────────
A   投稿ID           一意のID（自動）
B   生成日時         Geminiがテキスト生成した日時
C   投稿予定時刻     スケジュール上の投稿時刻
D   投稿タイプ       MORNING, TOKYOなど16タイプ
E   生成テキスト     Geminiが生成したテキスト全文 ★手動編集可能
F   バリデーション結果 チェック合否
G   ステータス       pending → approved / rejected / expired
H   承認日時         承認ボタンをタップした日時

★v4.0改善: E列を手動で編集 → 承認すると編集後テキストが投稿される
  Gmail通知に編集手順を記載

画像メタデータ（imageFileId, archetype, regenCount）:
  → シート列ではなくScriptPropertiesに保存（キー: img_meta_{postId}）

承認フロー（POST_MODEで制御）:
  manual（現在）: 全件下書き保存 → AI画像生成 → Gmail通知（3ボタン + 画像プレビュー）→ 承認で投稿 ★v4.1
  validate: バリデOK→AI画像生成→自動投稿 / NG→下書き保存+Gmail通知（3ボタン）
  auto: AI画像生成→全件即投稿（完全自動化）
```

### シート⑪ レートキャッシュ（直近7日分） ★v4.0追加

```
10列構成。Twelve Data APIから1時間ごとに自動取得。

列  項目
───────────────────────────────────────
A   取得日時
B   USD/JPY    C: EUR/USD    D: GBP/USD
E   EUR/JPY    F: GBP/JPY    G: AUD/JPY    H: AUD/USD
I   取得元（Twelve Data）
J   ステータス

→ 1時間ごとTwelve Data APIで7ペア同時取得（24行/日）
→ 7日超の古いデータは日次集約後に自動削除
→ ペアごとにmin/max範囲でバリデーション
   USD/JPY: 100〜200 / EUR/USD: 0.90〜1.25 等
```

### シート⑫ 日次レート（5年分蓄積） ★v4.0追加

```
30列構成。7ペア x 4値（始値/高値/安値/終値）+ 日付 + データ件数。

A: 日付
B〜E: USD/JPY（O/H/L/C）  F〜I: EUR/USD  J〜M: GBP/USD
N〜Q: EUR/JPY  R〜U: GBP/JPY  V〜Y: AUD/JPY  Z〜AC: AUD/USD
AD: データ件数

→ 毎朝5:00にレートキャッシュから前日分を集約
→ IQR外れ値フィルタリングでスパイクデータ除去
→ Twelve Data APIから5年分の履歴データ取得済み
```

### シート⑬ レートサマリー ★v4.0追加

```
17列構成。13期間 x 7ペアの高値/安値。

A: 期間名
B〜O: 7ペア x 2（高値/安値）
P: データ件数  Q: 更新日時

13期間: 昨日/今週/先週/2週前/今月/先月/過去3ヶ月/
        過去半年/今年/過去1年/過去2年/過去3年/過去5年

→ 日付比較はYYYY-MM-DD文字列ベース（タイムゾーンずれ防止）
→ プロンプトに「意識される価格帯」として注入
```

### シート⑭ 指標データ ★v4.2追加

```
5列構成。GOOGLEFINANCE関数で株価指数・債券利回り・VIX等を自動取得。

列  項目
───────────────────────────────────────
A   指標名      日経225、NYダウ、S&P500、米10年債利回り、VIX、ゴールド
B   現在値      GOOGLEFINANCE関数の自動更新値（15〜20分遅延）
C   単位        円、ドル、%、など
D   シンボル    INDEXNIKKEI:NI225、INDEXDJX:.DJI、など
E   更新状態    ✅ OK / ❌ 要確認（数式）

読み込み: getMarketIndicators_()（geminiApi.gs v5.5.3）
作成: setupIndicatorSheet()
対応定数: config.gs MARKET_INDICATORS（6指標、labelはA列と一致必須）
注入先: 市場系投稿（プロンプトの市場データとして補足注入）
```

### シート⑮ 経済指標_貼り付け ★v4.2追加

```
自由形式の一時作業用シート。

A1: 使い方説明（赤太字）
A2: 実行手順説明（グレー）
A3〜: 外為どっとコムからコピペしたデータ

使用手順:
  ① setupRawImportSheet() → シート作成
  ② 外為どっとコム（gaitame.com/markets/calendar/）を開く
  ③ 表の部分を選択してコピー → A3セルに貼り付け
  ④ importFromRawSheet() → 「経済カレンダー」に変換・書き込み
  ⑤ インポート完了後、シートは削除可能
```

---

## 4. プロンプト組み立ての全体像

```
最終プロンプト =
  ① キャラクターシート（人格・口調）           ← 公開可能
  ＋ ①-b レートサマリー（7ペアの高値/安値）    ← ★v4.0追加（Twelve Data）
  ＋ ①-c 指標データ（日経/NYダウ/VIX等）       ← ★v4.2追加（GOOGLEFINANCE）
  ＋ ①-d 市場ニュースTOP5                      ← ★v4.3追加（Gemini+Grounding）
  ＋ ②   日時情報                               ← 自動生成
  ＋ ②-b 参照ソース（情報取得先URL一覧）       ← 公開可能
  ＋ ②-c 経済カレンダー（指標スケジュール）    ← ★v4.0追加（シートから正確注入）
  ＋ ②-d 月曜MORNING専用コンテキスト            ← ★v4.3追加（月曜のみ条件注入）
  ＋ ③   投稿プロンプトシート（何を取得するか）  ← 公開可能
  ＋ ③-b トレードスタイル（売買の脳）           ← 公開可能
  ＋ ④   テーマシート（RULE系のみ）             ← ⑨心得テーマから取得
  ＋ ⑤   TC概要シート（TC導線7タイプのみ）      ← 公開可能
  ＋ ⑤-b 学びログ（過去の引き出し）             ← 蓄積型（手動＋自動蓄積）
  ＋ ⑥   フォーマットルール                     ← 非公開（コード内）
  ＋ ⑦   コンテキスト（前回仮説・学び）         ← ⑧投稿履歴から自動生成

v3.0→v4.0の変更:
  ★ ①-b レートサマリーを追加（正確なレートデータ）
  ★ ②-c 経済カレンダーを追加（ハルシネーション防止）
  ★ Geminiはテキスト生成のみ（Grounding廃止）

v4.3の変更:
  ★ ①-d 市場ニュースTOP5を追加（月曜日は週末60時間分を重点検索）
  ★ ②-d 月曜MORNING専用コンテキスト追加（金曜NY振り返り/窓開け/「昨日」誤用防止）
```

---

## 5. 注入ルール一覧

### 5-1. シートごとの注入先

```
シート          注入先
─────────────────────────────────────────
キャラクター    全16タイプ
トレードスタイル 全16タイプ
参照ソース      全16タイプ
投稿プロンプト  該当タイプ（1対1）
心得テーマ      RULE_1〜4のみ（getNextTheme()経由）
TC概要          RULE_1〜4、WEEKLY_REVIEW、WEEKLY_LEARNING、WEEKLY_HYPOTHESIS
学びログ        下記10タイプ（件数別）
経済カレンダー  市場系11タイプ（スコープ別）   ★v4.0追加
レートサマリー  市場系投稿（距離タグ付き）      ★v4.0追加
指標データ      市場系投稿（株価指数・VIX等）   ★v4.2追加
フォーマットルール 全16タイプ
投稿履歴        全16タイプ（コンテキスト: 前回仮説・学び）
```

### 5-2. 学びログの注入件数

```
投稿タイプ                    最大件数  理由
──────────────────────────────────────────────────────
MORNING                       2        朝の見通しに直近の学びを反映
GOLDEN                        2        一日の振り返りに活用
WEEKLY_REVIEW                 5        週間振り返りに厚みを出す
WEEKLY_LEARNING               5        学びの蓄積を活かした深い振り返り
WEEKLY_HYPOTHESIS             3        過去の仮説検証を次の仮説に反映
RULE_1〜4                     各3      カテゴリの合う学びを引き出しに
TOKYO,LUNCH,LONDON,NY,INDICATOR なし   速報系は不要
NEXT_WEEK                     なし     イベント整理のため不要
KNOWLEDGE                     なし     知識解説のため不要  ★v4.0追加
```

### 5-3. 経済カレンダーの注入スコープ ★v4.0追加

```
スコープ     対象タイプ
──────────────────────────────────────────────────────
today       MORNING, TOKYO, LUNCH, LONDON, GOLDEN, NY, INDICATOR
this_week   WEEKLY_REVIEW, WEEKLY_LEARNING
next_week   NEXT_WEEK, WEEKLY_HYPOTHESIS
注入なし     RULE_1〜4, KNOWLEDGE
```

---

## 6. フォーマットルール（非公開・コード内）

### 投稿の構造（ノート形式）★v5.0で全投稿統一

```
■ 全投稿が同じ「ノート形式」。投稿タイプごとに構造を変えない。

■ 基本単位 = 「絵文字ブロック」:
  絵文字行: 絵文字+事実や題名（1行で短く）
  →行: 背景・分析・感想。1ブロックに→は1つだけ。
  補足行: →なしの通常テキスト。同じ話題の補足。

■ ルール:
  ・1投稿 = 3〜4ブロック（絵文字3個が基本。0個は絶対禁止）
  ・→は1ブロックに1つだけ。2つ以上の→は禁止
  ・カレンダーや日付の羅列に→を使うな（→は分析・感想専用）
  ・話題が変わったら空行 → 次の絵文字
  ・最後は絵文字なし・→なしでコンパナの感想1〜2行
  ・通貨ペアは日本語名で書け: ドル円、ユーロドル、ポンドドル、
    ユーロ円、ポンド円、豪ドル円、豪ドル米ドル
  ・改行: 「。」「？」の後で改行
```

### フォーマット ★v4.0で文字数タイプ別制御

```
・レートはTwelve Data APIの正確なデータを使用（Grounding廃止）
・レートに確信がない場合は「上昇」「下落」等で表現
・文字数: 投稿タイプ別に制御（v3.0の一律200〜250文字から変更）
    MORNING / LONDON: 400〜500文字
    TOKYO: 300〜400文字
    LUNCH: 350〜450文字
    GOLDEN / NY: 350〜450文字
    INDICATOR / KNOWLEDGE: 300〜400文字
    RULE_1〜4: 300〜400文字
    WEEKLY系: 350〜450文字
・改行は「。」「？」の文末で入れる
・話題が変わるところで空行
・ハッシュタグは最後に最大2個
```

### 後処理チェーン + バリデーション + ファクトチェック ★v5.1 / ★v8.8共通関数化

```
★v8.8: applyPostProcessingChain_(text, postType, rates) 共通関数化
  geminiApi.gsの7箇所（初回生成後/主役ペアリトライ後/リスクセンチメントリトライ後/
  絵文字リトライ後/→ブロックリトライ後/ファクトチェック修正後/品質レビュー修正後）を
  postProcessor.gsの1関数に統合。新しい後処理を追加する場合はこの関数内のみ変更すればOK。
  TC除去（removeTCMention_）はタイプ別判定があるため呼び出し側で個別に実行。

★v8.8: GAS 6分タイムガード
  generatePost冒頭にstartTimeタイマーを設置。4つのリトライ（主役ペア/リスクセンチメント/
  絵文字/→ブロック）の前に経過時間をチェック。4分（240秒）超過でリトライをスキップし
  現在のテキストで続行。タイムアウトを確実に防止しつつ、通常時は品質を犠牲にしない。

★v8.8: INDICATOR投稿は🔥主役ペアバリデーション対象外
  指標の通貨ペアが主役であるべきで、通貨強弱の主役ペアとは一致しないことが多いため除外。

12段階後処理 + 2つのバリデーション・リトライ + ファクトチェック自動修正:

【処理の順序】
  後処理（12段階） → リトライ（主役ペア・絵文字）
    → ファクトチェック → 自動修正（必要時のみ）→ 再度後処理
      → 承認メール送信（修正済みテキスト + 検証結果）

【バリデーション・リトライ（後処理後に実行）】

  🔥主役ペアリトライ（市場系のみ）★v5.0変更: 強制→推奨
    → 通貨強弱で算出した主役ペアが本文に未含ならリトライ
    → 「主役候補として推奨」するプロンプトに変更

  絵文字最低3個リトライ（全タイプ共通）★v5.0追加
    → サロゲートペア対応のindexOfでカウント
    → 3個未満ならGeminiに「ノート形式に調整して」とリトライ
    → リトライ版が3個以上なら採用、なければ元テキスト使用

【12段階後処理チェーン】

① 外国語テキスト除去（removeForeignText_）★v5.0拡張
   英語フレーズ、キリル文字等を除去
   ★v5.0: ラテン拡張文字（é, ñ等）の除去を追加

② AI前置き除去（stripAIPreamble_）★v5.0大幅強化
   既存: 「はい承知」「コンパナとして」等
   ★v5.0追加: 「Trading FX〜開発」「投資で自分を満たし」
   「ペルソナ」「昼休み挨拶」「【修正案】」「X投稿」
   「キャラクター設定/指示に従って」

③ 改行+空行制御（enforceLineBreaks_）★v5.0拡張
   「。」「？」後に自動改行
   →の前に自動改行（行中→を行頭に移動）★v5.0追加
   絵文字行の前に空行確保（ノート形式）
   締めの→自動除去
   行末絵文字→行頭移動（「テキスト絵文字」→「絵文字 テキスト」）★v5.9追加

④ 絵文字: 種類制限+個数制限（removeDisallowedEmoji_）
   許可7種: 📕📝📋☕💡⚠️✅ / 最大3個

④b 孤立variation selector修復（fixOrphanedVariationSelector_）★v8.14
   ⚠️のベース文字(U+26A0)が欠落しU+FE0Fだけ残るパターンを修復
   行頭の孤立U+FE0F→⚠️に復元。文中の孤立U+FE0F→除去

⑤ Markdown除去（removeMarkdown_）

⑥ 禁止表現置換（replaceProhibitedPhrases_）★v5.0大幅強化
   既存: 二重表記除去、丁寧すぎ→カジュアル化
   ★v5.0追加:
     - 通貨ペア英語→日本語変換（USD/JPY→ドル円 等9ペア）
     - →半角スペース除去
     - 半角ピリオド文中対応（「ですよ. 世界」→「ですよ。\n世界」）
     - 0.XXXX小数点脱落修正
     - アスタリスク(*)全除去
     - 孤立全角カッコ（）除去

⑦ 月曜日「昨日」修正（fixMondayYesterday_）

⑧ 重複ブロック除去（removeDuplicateBlocks_）

⑨ 孤立短文除去（removeOrphanedLines_）★v8.12
   品質修正で壊れた10文字以下の孤立行を除去（絵文字行・→行・ハッシュタグ行は除く）

⑩ 壊れた句点修復（fixBrokenSentenceEndings_）★v8.14
   品質修正（Gemini）で「。ですね。」「。です。」等の壊れた句点パターンを修復
   不要な「。」を除去して文末表現を接続（例: 「しっかり。ですね。」→「しっかりですね。」）

⑪ ハッシュタグ自動生成（generateDynamicHashtags_）
   URL検出時は#FXの1個のみ（シャドウバン回避）

※ 投稿間隔チェック（handleAutoMode_内・postProcessorの外）

【ファクトチェック + 自動修正（後処理・リトライの後に実行）】★v5.1追加 ★v8.3: 2層構造化

  factCheckPost_（2層構造・Grounding ON）:
    Layer 1: システム確定データ（レート・金利・カレンダー）との照合
    Layer 2: Geminiの知識+Google検索で要人発言・指標結果・因果関係・架空データを検証
    → ✅正確 / ⚠️検証不可 / ❌誤り で判定（layerフィールドでL1/L2を明示）
    → RULE系はスキップ（個人の経験談が主体）

  autoFixPost_（❌のみ実行・Grounding OFF）:
    → factCheckPost_のcorrection情報+システムデータのみで修正（Grounding不使用）
    → ⚠️はautoFix対象外（メール表示のみ）
    → ファクトチェック用語混入を検出したら修正棄却
    → 修正後に問題表現が残っていたらリトライ（最大2回）、ダメなら強制削除
    → 結果をScriptPropertiesに保存（承認メール用）

  承認メールへの反映:
    → ファクトチェック結果（各事実の判定）を表示
    → 自動修正があればBefore/Afterを表示
    → エラー時はスキップして従来通りメール送信（投稿を失わない）
```

### 禁止事項

```
・挨拶（おはようございます等）
・自己紹介・投稿タイプ名
・締め文（コーヒー飲んで〜、頑張りましょう、戦略練ります等）
・人間らしさを演出する日常描写
・URL・リンク・マークダウン記法・アスタリスク(*)
・外国語（英語・ロシア語・中国語等。検索結果も日本語に翻訳）
・通貨ペアは日本語名で表記（後処理で自動変換: USD/JPY→ドル円 等）
・免責表現（「投資助言ではない」「NFA」「DYOR」等）
・存在しない経済指標名のハルシネーション（シートから正確注入で防止）
```

### 絵文字ルール ★v5.0更新

```
・許可: 📕📝📋☕💡⚠️✅（7種のみ）
・1投稿に3個が基本（0個は絶対禁止）
・最大3個（4個目以降は自動除去）
・3個未満の場合は自動リトライで補完 ★v5.0追加
・絵文字は必ず行頭に配置。行末・文中に置くな ★v5.9強化（buildFormatRules_に明記）
・行末絵文字は後処理で自動的に行頭へ移動 ★v5.9追加（enforceLineBreaks_）
```

### 結論バリエーション ★v4.5追加（設計図v5.8準拠）

```
buildFormatRules_()で注入。→は使わずに締める:
  A. 資金管理系（ロットを落として慎重に）
  B. 具体的レベル提示（156.50割るなら売り目線）
  C. 時間軸の提案（来週の雇用統計まで待つ）
  D. 逆張り目線（みんなが売りたがってる時こそ反転かも）
  E. 経験からの教訓（前に似た局面で負けた）
  F. 通貨ペア切り替え（ドル円が難しいなら豪ドル円）
  G. リスクリワード（損切り20pips、利確60pips）
  H. 感情の正直な吐露（ぶっちゃけ怖い）
  ★ 「静観」は1日最大1回まで。同じ結論パターンの2回使用禁止
```

### コンパナの経歴ファクト ★v4.5追加

```
プロンプトに注入し、不正確な発言を防止:
  FX歴7年だが「〜に7年かかった」は不正確 → 禁止
  正確: 1年目にどん底 → そこから3年かけて収支安定
  後処理でも「7年かかった」→「3年かかった」に自動置換（保険）
```

### 出力フォーマット例

```
📕原油価格の高騰で、WTI原油が1バレル77ドルまで急騰。
→インフレ懸念から、安全資産としてのドルが買われる展開になる。

💡欧州株が下げ幅を拡大し、独は2.8%安。
→ユーロが売られ、相対的にドルが買われやすい地合いか？

地政学リスクと原油高、この組み合わせは正直、タチが悪い。
しばらくはドルが強い相場が続くかもしれないですね。

#FX #ドル円
```

### 6-5. v8.6 プロンプト最適化

```
■ キャラクターシート統合（9行→5行）
  変更前: 9行・約20サブセクション（【】）・約8,000文字
  変更後: 5行・約5サブセクション・約3,500文字
  統合内容:
    ペルソナ + 人間味の出し方 → 「ペルソナ」
    発信の原則 + 口調と語尾 + 専門用語の扱い → 「発信の原則と口調」
    禁止表現 → 「禁止事項」（サブセクション廃止）
    TC導線のトーン → 「TC導線」（大幅圧縮）
    ネガティブ情報 → 「ネガティブ情報の伝え方」（3行に圧縮）
    根底にある思想 → 削除（投稿生成に不要。核心はペルソナのモットーに統合）

■ buildFormatRules_ タイプ別条件分岐
  needsMarketRules変数で市場データ注入タイプとそうでないタイプを分離。
  市場データが注入されないタイプ（RULE系・KNOWLEDGE）では以下を除外:
    結論のバリエーション / 題材選定ルール / 投稿の構造 / 論理の一貫性
    WTI原油因果関係 / 経済指標方向性ルール / リスクセンチメント
    通貨ペア日本語名ルール
  重複削除: レート桁数ルール（buildPrompt_の505行目に一本化）
  効果: RULE系 71→58セクション（-13）、約-2,200文字

■ TC導線フィルタリング（buildPrompt_）
  TC言及禁止タイプ（MORNING/TOKYO/LONDON/NY/INDICATOR/KNOWLEDGE）では
  キャラクターシートのTC導線セクションを正規表現で自動除外

■ RULE系ニュース参照矛盾の解消（buildPrompt_）
  RULE系にはfetchMarketNews_が注入されないのに
  「📰市場ニュースから引用せよ」という指示があった矛盾を修正

■ 簡潔さルール追加（buildFormatRules_）
  最優先ルール6: 「簡潔に書け。読者が推測できる補足は省略」
  フォーマット構造: 「→行は1〜2文で完結」「補足行は最大1行」

■ 効果実測値
  MORNING: セクション 92→68、文字数 23,007→18,137（-21%）
  TOKYO:   セクション 94→69、文字数 23,385→18,109（-23%）
  LUNCH:   セクション 96→73、文字数 24,944→20,338（-18%）
  RULE_1:  セクション 71→59、文字数 16,585→14,475（-13%）
  投稿文字数: TOKYO 477→368文字、LUNCH 590→354文字（charMax内に収まった）
```

### 6-6. v8.6 品質レビューシステム（Claude API）

```
■ 背景
  Geminiが生成した投稿をGeminiがチェックする構造は
  「自分の宿題を自分で採点する」のと同じ。同一モデルバイアスが存在。
  別モデル（Claude）によるクロスチェックで客観性を確保。

■ モデル使い分け
  Gemini担当: テキスト生成・ファクトチェック・自動修正（Grounding必要）
  Claude担当: 品質レビュー（Grounding不要。クロスチェック）
  
■ レビュー項目（5項目）
  Q1. タイプ整合: 投稿の冒頭・トーンがpostTypeの時間帯と合っているか
  Q2. 表現重複: 今日の過去投稿と同じ締め文・フレーズが使われていないか
  Q3. 文の完成度: 体言止め・文脈の飛躍・途中で切れた文がないか
  Q4. 文字数: charMin〜charMax内に収まっているか
  Q5. 口調の一貫性: コンパナの口調が維持されているか

■ パイプライン挿入位置
  ファクトチェック+autoFix（Gemini）の後、結果保存の前。
  「正確な投稿」にした後に「良い投稿か」をレビューする順序。

■ 過去投稿キャッシュ
  キー: TODAY_POST_{postType}（ScriptProperties）
  保存: generatePost成功時にcacheTodayPost_()
  クリア: scheduleTodayPosts()冒頭でclearTodayPostCache_()

■ コスト
  Claude Sonnet 4.6: $3/$15 per MTok
  1投稿あたり約2円、月179件で約358円/月

■ 必要なスクリプトプロパティ
  CLAUDE_API_KEY: Anthropic APIキー

■ スキップ条件
  SKIP_FACT_CHECK=true（testAll時）→ スキップ
  CLAUDE_API_KEY未設定 → スキップ（フェイルセーフ）
  Claude API失敗 → スキップ（投稿は生成される）
```

### 6-7. v8.6 その他の改善

```
■ normalizeRateDecimals_（postProcessor.gs）
  Geminiが確定レートのAPI生値（5桁）をそのまま書くケースを後処理で修正。
  JPYペア: 小数3桁以上→2桁に丸め（例: 159.217円→159.22円）
  USDペア: 小数5桁以上→4桁に丸め（例: 1.15374ドル→1.1537ドル）

■ 「皆さん」呼びかけ除去（postProcessor.gs）
  「皆さん、」「皆さんは」「フォロワーの皆様」等を自動除去。
  1対1の語りかけスタンスを維持。共感を求める文自体は残す。

■ factCheckPost_ / autoFixPost_に日時注入（factCheck.gs）
  「現在の日時」「現在はXXXX年」をプロンプトに動的注入。
  Geminiが時制を見失う問題（「トランプは民間人」等の誤判定）を防止。

■ 要人の役職・地位に関する特別ルール（factCheck.gs）★v8.7で根本改修
  旧（v8.6）: 「Google検索結果を最優先。内部知識だけで❌にするな」→ Geminiが検索しないため機能せず
  新（v8.7）: スプレッドシート「確定データ」シートから要人リストをLayer 1確定データとして注入
  「確定データ4に載っている人物の役職は100%正しい。矛盾する知識は無視しろ」と明示
  → Geminiの古い学習データ（バイデン大統領、石破首相等）による誤判定を完全に防止

■ 確定データシート（config.gs）★v8.7新設
  スプレッドシート「確定データ」シートに金利5件+要人12人を一元管理
  setupReferenceDataSheet()でシートを自動作成（カスタムメニューから実行）
  金利変更・要人交代時はスプレッドシートのセルを書き換えるだけでOK（コード修正不要）
  旧POLICY_RATESハードコードを完全廃止

■ Bloomberg最優先検索（marketAnalysis.gs）
  fetchMarketNews_の検索ソースにbloomberg.com/bloomberg.co.jpを最優先指定。
  出力形式に「ソース」欄を追加（Bloomberg / Reuters等）。

■ 参照ソース注入バグ修正（promptBuilder.gs）
  getReferenceSources_でdata[i][3]（D列・存在しない）→data[i][2]（C列・用途）に修正。
  投稿にソース元がある場合「Bloombergの報道によると〜」と自然に1回言及するルール追加。

■ scheduler.gs処理分離（★重要）
  変更前: scheduleTodayPosts 1つで全処理 → サマリー更新タイムアウトで投稿全滅
  変更後: 2つのトリガーに分離
    5:00 scheduleTodayPosts（トリガー設定のみ。10秒で完了）
    5:15 scheduleDailyMaintenance（サマリー更新・エンゲージメント収集等。最大6分）
  メンテナンスがタイムアウトしても投稿トリガーには影響なし。
  INDICATORが投稿されなかった根本原因（毎朝のタイムアウト）を解消。

■ imageGenerator.gs透かしログ改善
  再生成時のcompositeWithWatermark_の成功/失敗をconsole.logで出力。
  Logger.log→console.logに変更（トリガー実行時に実行ログに表示されるように）。
```

---

## 7. 市場データ収集（3層アーキテクチャ） ★v4.0で全面刷新

```
【v3.0】Gemini Grounding（Google検索経由でレート取得）
  → 不正確なレート問題（Trading Economics等の混在で±0.3円の誤差）

【v4.0】Twelve Data API（専用FXデータプロバイダー）
  → 正確なレート（取引所直結データ）
  → Geminiはテキスト生成のみ

【3層データフロー（為替）】
  Twelve Data API（1時間ごと、7ペア同時取得）
    → レートキャッシュ（直近7日分の生データ）
      → 日次レート（OHLC集約、5年分蓄積）
        → レートサマリー（13期間の高値/安値）

【補助データ（株価指数等）】★v4.2追加
  GOOGLEFINANCE関数（15〜20分遅延で自動更新）
    → 指標データシート（日経225/NYダウ/S&P500/米10年債/VIX/ゴールド）
      → getMarketIndicators_()でプロンプトに注入

【7通貨ペア】
  USD/JPY  ドル円     min:100 max:200 小数3桁
  EUR/USD  ユーロドル min:0.90 max:1.25 小数5桁
  GBP/USD  ポンドドル min:1.10 max:1.50 小数5桁
  EUR/JPY  ユーロ円   min:110 max:200 小数3桁
  GBP/JPY  ポンド円   min:130 max:250 小数3桁
  AUD/JPY  豪ドル円   min:60 max:120 小数3桁
  AUD/USD  豪ドル     min:0.55 max:0.85 小数5桁

  ※ CURRENCY_PAIRS定数で一元管理（config.gs）
  ※ ペア追加/削除は配列編集のみで全関数が自動適応

【SHEET_NAMES定数マッピング】★v4.2追加
  config.gsの定数:      HISTORY='投稿履歴'  THEMES='心得テーマ'
                        CHARACTER='キャラクター'  DRAFTS='下書き'
  geminiApi.gs直接参照:  レートキャッシュ/日次レート/レートサマリー/投稿プロンプト
                        TC概要/トレードスタイル/参照ソース/経済カレンダー
                        学びログ/指標データ/経済指標_貼り付け
  ※ 詳細はスプレッドシート仕様書 v1.0 セクション4を参照

【API使用量】
  無料枠: 800クレジット/日、8リクエスト/分
  毎時取得: 7ペア x 1リクエスト x 24時間 = 168クレジット/日（21%）
  5年再構築: 7ペア x 1リクエスト = 7クレジット（一回限り）

【X API v2 メトリクス取得】★v5.2追加
  pay-per-use: $0.01/リクエスト
  毎朝1回: 前日の全投稿メトリクスをバッチ取得（最大100件/リクエスト）
  月額: 約$0.30（1リクエスト/日 x 30日）
```

---

## 8. GASコード構成

### 8-1. 分割後のファイル構成 ★v8.5でファイル分割

```
★v8.5: geminiApi.gsを11ファイルに分割（9,398行→567行）
★v8.7: POLICY_RATESハードコード廃止→スプレッドシート「確定データ」シートに一元管理
★v8.8: 後処理チェーン共通関数化、GAS 6分タイムガード、プロンプトセクション削減
詳細は「geminiApi_ファイル分割_要件定義書_ロードマップ_v1_2_完了版.md」
　　　「TCAX_品質改善_要件定義書_v1_4.md」を参照

ファイル名                行数    関数数  役割
──────────────────────────────────────────────────────────────
geminiApi.gs              566     6      核: generatePost + executeRetry_ + countEmojis_ + checkMultiArrowBlocks_ + callGemini_ + extractTextFromResponse_ ★v8.8.1: リトライ共通化+Pro変更
                                         ★v8.8: 後処理7箇所→applyPostProcessingChain_共通化、INDICATOR主役除外、4分タイムガード
promptBuilder.gs          1,776   18     プロンプト構築: ★v9.0: アノマリー注入+ニュース主軸
postProcessor.gs          1,977   24     後処理チェーン: ★v9.0: fixBrokenSentenceEndings_+fixOrphanedVariationSelector_新設
factCheck.gs              672     5      ファクトチェック: ★v9.0: Layer 1にアノマリー確定データ追加
qualityReview.gs          427     7      品質レビュー: ★v9.0: callClaude_指数バックオフ+リトライ3回+エラー詳細ログ
anomalyManager.gs         965     22     ★v9.0新規: アノマリー自動判定（8カテゴリ・20種類）+シートセットアップ
config.gs                 582     7      設定値+定数: ★v9.0: JAPAN_HOLIDAYS祝日配列追加
imageGenerator.gs         889     15     AI画像生成: ★v8.6: 再生成時の透かしログ改善
scheduler.gs              552     13     トリガー管理: ★v8.6: 処理分離（scheduleTodayPosts 5:00 + scheduleDailyMaintenance 5:15）
marketAnalysis.gs         799     7      市場分析: ★v8.8: ニュース参照【】除去。Bloomberg最優先検索+ソース欄
main.gs                   605     -      カスタムメニュー: ★v8.7: 「確定データシート作成」追加
rateManager.gs            811     12     レート管理: fetchLatestRates_ + saveRatesToSheet_ + scheduledFetchRates 等
indicatorManager.gs       1,191   20     経済指標: fetchIndicatorResults_ + formatIndicatorReview_ 等
learningManager.gs        877     8      学び・仮説: ★v9.0: 仮説抽出にアノマリー文脈追加
priceSummary.gs           642     5      価格集計: updatePriceSummary + aggregateDailyRates 等
calendarManager.gs        802     7      経済カレンダー: fetchEconomicCalendar + importFromRawSheet 等
testFunctions.gs          225     19     テスト: testPro_*12個 + testRULE/testWEEK + testBatch_ 等 ★v8.8.1再構成

改善時の対象ファイル早見表:
  禁止表現の追加          → postProcessor.gs（replaceProhibitedPhrases_）
  後処理ルールの追加      → postProcessor.gs（applyPostProcessingChain_内に自動反映）★v8.8
  ファクトチェック改善     → factCheck.gs（factCheckPost_ / autoFixPost_）
  プロンプトへのデータ注入 → promptBuilder.gs（buildPrompt_）
  プロンプト文字数削減     → promptBuilder.gs（buildPrompt_ + buildFormatRules_）
  市場系投稿の方針変更     → promptBuilder.gs（buildMarketTypePolicy_）★v8.10
  KNOWLEDGE方針変更        → promptBuilder.gs（buildKnowledgePolicy_）★v8.10
  INDICATOR方針変更        → promptBuilder.gs（buildIndicatorPolicy_）★v8.10
  週末系投稿の方針変更     → promptBuilder.gs（buildWeekendPolicy_）★v8.10
  RULE系方針変更           → promptBuilder.gs（buildRulePolicy_）★v8.10
  未発表指標の判定変更     → promptBuilder.gs（getUnreleasedIndicatorNames_）★v8.9
  キャラクター定義の変更   → スプレッドシート「キャラクター」シート（5行構成・v8.6統合版）
  プロンプトセクション数削減 → キャラクターシート + buildFormatRules_のタイプ別条件分岐
  政策金利の更新           → スプレッドシート「確定データ」シート（コード修正不要）★v8.7
  要人の交代               → スプレッドシート「確定データ」シート（コード修正不要）★v8.7
  品質レビューの改善       → qualityReview.gs（レビュー項目・プロンプト）
  品質レビューのタイプ定義 → qualityReview.gs（TYPE_DESCRIPTIONS）
  仮説・学びの改善         → learningManager.gs
  新しい後処理ルール追加   → postProcessor.gs（applyPostProcessingChain_に自動反映）★v8.8
```

以下は分割前の関数詳細（参考として残す）:

```
関数名                      役割
──────────────────────────────────────────────────────────────
【geminiApi.gs - 核（566行・6関数）★v8.8.1: リトライ共通化+Pro変更】
generatePost()              メイン: 投稿テキスト生成（司令塔。全モジュールを呼び出す）
callGemini_()               Gemini API呼び出し（リトライ3回）
extractTextFromResponse_()  レスポンスからテキスト抽出

【promptBuilder.gs - プロンプト構築（1,709行・17関数）★v8.10: buildPrompt_分割（5ヘルパー関数）】
buildPrompt_()              プロンプト組み立て（メイン・★v8.10: 636行→391行に縮小）
buildMarketTypePolicy_()    市場系方針（MORNING〜INDICATOR+月曜コンテキスト）★v8.10新設
buildKnowledgePolicy_()     KNOWLEDGE方針 ★v8.10新設
buildIndicatorPolicy_()     INDICATOR方針+データ注入 ★v8.10新設
buildWeekendPolicy_()       週末系方針（WEEKLY_*+NEXT_WEEK）★v8.10新設
buildRulePolicy_()          RULE系方針 ★v8.10新設
getUnreleasedIndicatorNames_() 未発表指標名取得（仮説答え合わせ防止）★v8.9新設
getHypothesisContext_()     仮説コンテキスト取得（★v8.9: 未発表指標チェック追加）
buildFormatRules_()         フォーマットルール（ノート形式 ★v5.0更新）

【市場ニュース取得】★v5.0強化
fetchMarketNews_()          Gemini+Groundingで市場ニュースTOP5を自動取得（1時間キャッシュ）
                            ★v5.0: 各ニュースに日付必須化 / 3日以上前のニュース除外
                            ★v5.0: GroundingソースURL（最大10件）をログ出力

【ファクトチェック + 自動修正】★v5.1追加 ★v8.1強化
factCheckPost_()            2層構造ファクトチェック（L1:データ照合+L2:知識+Grounding検証） ★v8.3改修
                            → 各事実を ✅正確 / ⚠️要確認 / ❌誤り で判定
                            → JSON形式で構造化された検証結果を返す
                            → RULE系はスキップ（個人の経験談が主体）
                            → ★v8.1: システム確定レート注入（レート系誤検出防止）
                            → ★v8.6: ❌をremovable（検証不能→即削除）とfixable（修正可能→autoFix）に分類
autoFixPost_()              ❌の自動修正（Grounding OFF・correction+システムデータのみ） ★v8.3変更
                            → ファクトチェック用語混入検出→修正棄却
                            → 修正後テキストに再度後処理を適用
                            → 結果をScriptPropertiesに保存（承認メール用）
verifyAutoFix_()            ★v8.1追加: 自動修正後に問題フレーズが残っているか検証
extractKeyPhrases_()        ★v8.1追加: claimからキーフレーズ抽出（残留チェック用）
forceRemoveIssueLines_()    ★v8.1追加: リトライでもダメな場合の問題行強制削除
removeDuplicateBlocks_()    ★v8.1追加: Gemini応答の重複テキストブロック除去
fixHallucinatedRates_()     ★v8.1追加: 確定レートとの乖離3%超を後処理で修正
                            ★v8.6修正: 「豪ドル円」内の「ドル円」部分一致バグを修正（独立判定に変更）
validateFinalFormat_()      ★v8.3追加: 後処理チェーン最終安全網（二重小数点をレート/パーセントで検出・修正）
findCorrectRate_()          ★v8.3追加: 二重小数点から確定レートを特定する補助関数

【後処理チェーン + バリデーション】★v5.0で大幅強化
postProcessText_()          後処理メイン
  主役ペアリトライ            市場系投稿で主役ペア未含時にリトライ（★v5.0: 強制→推奨）
  絵文字リトライ              3個未満の時にリトライ（★v5.0追加）
  リスクセンチメントリトライ  「リスクオフ+円売り」同時出現で強制リトライ（★v5.9追加、最大3回）
removeForeignText_()        外国語テキスト除去（★v5.0: ラテン拡張文字追加）
stripAIPreamble_()          AI前置き文除去（★v5.0: 7パターン追加）
enforceLineBreaks_()        改行+空行制御（★v5.0: →前改行追加 / ★v5.9: 行末絵文字→行頭移動追加）
removeDisallowedEmoji_()    絵文字種類制限+個数3個制限
removeMarkdown_()           Markdown除去
replaceProhibitedPhrases_() 禁止表現置換（★v5.0: 通貨ペア日本語化、アスタリスク除去、
                            孤立カッコ除去、半角ピリオド文中対応、小数点脱落修正を追加）
fixMondayYesterday_()       月曜日「昨日」修正
generateDynamicHashtags_()  ハッシュタグ自動生成（URL時1個制限）

【通貨強弱・方向性】
analyzeCurrencyStrength_()  7通貨の強弱ランキング算出・プロンプト注入
buildTrendContext_()        レート方向性をプロンプトに注入
verifyPreviousHypothesis_() 過去仮説をレートデータと照合し検証結果を追記

【経済指標結果取得】
getIndicatorResults_()      経済指標の発表結果を自動取得（三層活用）

【Sheets読み込み】
getPostPrompt_()            投稿プロンプトシートから読み込み
getTCOverview()             TC概要シートから読み込み
getTradeStyle_()            トレードスタイルシートから読み込み
getLearningLog_()           学びログシートから読み込み
getReferenceSources_()      参照ソースシートから読み込み
getEconomicCalendar_()      経済カレンダーシートから読み込み
getMarketIndicators_()      指標データシートから読み込み
getNextTheme()              心得テーマから次のテーマ選択
getLastHypothesis()         投稿履歴から直近の仮説取得
getLastLearning()           投稿履歴から直近の学び取得

【学びログ自動蓄積】
extractAndSaveLearning_()   投稿テキストから学びを抽出・保存

【完全自動学習 Phase 2〜4】★v5.2追加
parseHypothesisDetails_()   仮説テキストから対象ペア・方向を自動パース
verifyWeeklyHypotheses_()   未検証仮説をレートデータで自動判定
generateVerificationReason_() 的中理由をGeminiで1行自動生成
getHypothesisVerificationSummary_() 直近5件の的中率サマリーをプロンプト用に生成
getQualityFeedback_()       投稿タイプ別の品質フィードバックテキストを生成
getLearningLog_()           ★v5.2でスコアベース選択に変更（70%上位+30%ランダム）

【レート管理】
fetchLatestRates_()         Twelve Data APIからレート取得（7ペア）
saveRatesToSheet_()         レートキャッシュに保存（動的ヘッダー）
analyzePriceHistory_()      距離タグ生成（JPYペアのみ）
updatePriceSummary()        13期間レートサマリー更新
aggregateDailyRates()       日次OHLC集約 + 7日超削除
rebuildDailyRates()         5年分OHLC再構築（Twelve Data API）
calcOHLC_()                 IQR外れ値フィルタリング付きOHLC計算

★v5.0削除:
  getMatchedDriveImage_()   Drive画像マッチ → TC画像方式廃止のため削除
  selectBestImage_()        ファイル名スコアリング → 同上
  setupImageFolders()       Driveサブフォルダ自動作成 → 同上

【Sheets書き込み】
savePost()                  投稿履歴に結果を書き込み
saveDraft_()                下書きシートに生成テキスト保存

【承認フロー】★v4.1で3ボタン化
sendDraftNotification()     Gmail通知（3ボタン: 承認/画像再生成/中止 + 画像プレビュー）
doGet()                     WebApp: 承認/再生成/中止の3アクション処理
handleRegenerate_()         画像再生成処理（最大3回、異なるアーキタイプ）
processApprovedDrafts()     承認済み下書きを画像付きでX投稿
saveImageMeta_()            画像メタデータ管理（ScriptProperties）
saveImageToDrive_()         画像Blob→Drive保存
getImageFromDrive_()        DriveファイルID→Blob取得

【テスト関数】
testGemini()                API接続テスト
testGenerateMorning()〜     各タイプ個別テスト（16個）
testGenerateAll()           全16タイプ一括テスト
testGenerate_()             共通テスト関数
testSheetLoading()          全シート読み込みテスト
testFetchRates()            レート取得+キャッシュ保存

【セットアップ関数】★v4.2追加
setupEconomicCalendarSheet() 経済カレンダーシート作成
setupIndicatorSheet()       指標データシート作成（GOOGLEFINANCE数式付き）
setupRawImportSheet()       経済指標_貼り付けシート作成
importFromRawSheet()        コピペデータ→経済カレンダーにパース
testHypothesisLogging()     仮説検証ログ保存テスト ★v5.2追加

【sheetsManager.gs Phase 2〜4関数】★v5.2追加
saveHypothesisToLog()       仮説を検証ログに保存
getUnverifiedHypotheses()   未検証仮説を取得
updateHypothesisVerification() 検証結果を書き込み
getRecentHypothesisResults() 直近N件の検証済み結果を取得
setupLearningLogExtension() 学びログE〜H列追加
incrementLearningUsage()    学び使用回数インクリメント
getLearningLogWithScores()  スコア付き学びログ全件取得
saveEngagementData()        エンゲージメントデータを保存
getEngagementStats()        タイプ別統計を取得
calculateQualityScore()     品質スコアを計算
getUncollectedTweets()      未取得ツイートを検索
setupPhase2And3()           Phase 2+3 初期化
setupPhase4()               Phase 4 初期化

【xApi.gs Phase 4関数】★v5.2追加
fetchTweetMetrics_()        ツイートメトリクスをバッチ取得
collectAndSaveMetrics_()    未取得ツイートの一括収集オーケストレーション
buildOAuthHeaderWithParams_() GETリクエスト用OAuth署名
testGetTweetMetrics()       メトリクス取得テスト
testCollectMetrics()        一括収集テスト

【scheduler.gs Phase 8関数】★v5.3追加
scheduleIndicatorTriggers_() 重要指標30分前にrunIndicatorトリガー設定（平日のみ、最大2件/日）

【main.gs v5.3追加】
setModeValidate()           検証モード切替（カスタムメニューから実行）
```

### 8-2. imageGenerator.gs の関数構成 ★v4.1追加

```
関数名                      役割
──────────────────────────────────────────────────────────────
【画像生成】
generatePostImage()         メイン: テキスト→AI画像→透かし合成
regeneratePostImage()       再生成: 前回と異なるアーキタイプで生成
selectImageArchetype_()     投稿タイプに適したアーキタイプ選定（マンネリ防止）
buildImagePrompt_()         画像生成プロンプト構築（サイバーパンク+アーキタイプ指定）
callGeminiImageApi_()       Gemini 3 Pro画像API呼び出し（3回リトライ）
compositeWithWatermark_()   Google Slides APIで画像+TC透かしロゴ合成→PNG出力
isImageGenerationType()     市場系タイプ判定（6タイプ）

【定数】
IMAGE_TYPE_COLORS           投稿タイプ別アクセントカラー（6タイプ）
IMAGE_ARCHETYPES            12アーキタイプ定義（bestFor属性付き）

【テスト関数】
testImageGeneration()       1タイプ画像生成テスト（Drive保存のみ）
testImageAllTypes()         全6タイプ画像生成テスト

画像生成の流れ:
  投稿テキスト
  → 核心20%を抽出（Geminiプロンプトで指示）
  → サイバーパンク風ダークテーマで画像生成（1024x1024）
  → Google Slides APIでTC透かしロゴを合成
  → 最終PNG出力（約1000〜1800KB）
```

---

## 9. フォロワーから見える全体像

```
「こうやって情報集めてるよ」（投稿プロンプト＋参照ソース公開）
  → 朝はNY市場の動きと大衆心理を取得
  → Twelve Data APIで7通貨ペアの正確なレートを監視
  → 経済カレンダーから今日の指標を把握
  → 指標発表前はシナリオ分析を取得
  → 週末は仮説と振り返りを取得

「こうやって判断してるよ」（トレードスタイル公開）
  → ダウ理論×フィボナッチの順張り
  → ファンダとテクニカルが一致した時のみエントリー
  → 3つのチェックリストで規律を守る

「こうやって記録してるよ」（Trading Complete）
  → 使うかどうかはその人の自由
  → 押し売りゼロ、自然な導線

「こうやって成長してるよ」（学びログ自動蓄積）  ★v4.0追加
  → 毎回の投稿から学びを自動抽出・蓄積
  → 蓄積された学びが次の投稿に自然に反映
  → 使うほど投稿の質が上がる仕組み

全部「やり方を見せる」だけ。売り込みではなく、ただの延長線。
```

---

## 10. Bot判定回避 + シャドウバン回避 ★v4.5追加（設計図v5.8準拠）

```
【Bot判定回避】
✅ 曜日ごとに1分単位で時刻が違う + ±0〜5分ランダム
✅ 画像ありとなしが混在（40:60）
✅ AI画像の構図が12アーキタイプで毎回違う
✅ 投稿数が日によって違う（平日6、土日4）
✅ いいね/フォロー/RTの自動化なし
✅ リプライは手動（週1回以上）
✅ POST_MODE=manualで承認フロー挟む

【シャドウバン回避】
✅ 絵文字2〜3個制限（0〜1個は視認性低下、4個以上はスパム判定リスク）
✅ 外部URL検出時はハッシュタグ1個に制限（URL+ハッシュタグ多数が主因）
✅ autoモード時、前回投稿から15分未満は自動スキップ
✅ 外部リンクは本文に書かず、リプライに投稿（本文スコア-15回避）
   → 本文: 「note書きました」（URLなし）
   → リプライ: URL投稿（本文スコアに影響なし + リプライ=+75スコア）
```

---

## 11. 実装状況

```
項目                             状態
─────────────────────────────────────────
geminiApi.gs（核）               ✅ 完成（567行）★v8.5で11ファイルに分割
promptBuilder.gs                 ✅ 完成（1,709行）★v8.10: buildPrompt_分割
postProcessor.gs                 ✅ 完成（1,832行）★v8.9: 重複コメント除去
factCheck.gs                     ✅ 完成（442行）★v8.5分割
rateManager.gs                   ✅ 完成（811行）★v8.5分割
marketAnalysis.gs                ✅ 完成（795行）★v8.5分割
indicatorManager.gs              ✅ 完成（1,191行）★v8.5分割
learningManager.gs               ✅ 完成（859行）★v8.5分割
priceSummary.gs                  ✅ 完成（642行）★v8.5分割
calendarManager.gs               ✅ 完成（802行）★v8.5分割
testFunctions.gs                 ✅ 完成（225行）★v8.8.1再構成
imageGenerator.gs                ✅ 完成（Phase 7）
キャラクターシート               ✅ 既存
TC概要シート                     ✅ 作成済み
投稿プロンプトシート（16タイプ）  ✅ 作成済み
トレードスタイルシート           ✅ インポート済み
参照ソースシート                 ✅ インポート済み
学びログシート                   ✅ 自動蓄積実装済み
経済カレンダーシート             ✅ インポート済み
投稿履歴シート                   ✅ 既存
心得テーマシート                 ✅ 既存
下書きシート                     ✅ 編集→承認フロー対応
レートキャッシュ（7ペア）        ✅ Twelve Data API連携
日次レート（5年分）              ✅ OHLC集約済み
レートサマリー（13期間）         ✅ 自動更新実装済み
指標データシート                  ✅ GOOGLEFINANCE自動更新
経済指標_貼り付けシート           ✅ インポートフロー実装済み
全タイプテスト関数               ✅ 16個＋一括テスト
後処理チェーン+リトライ          ✅ 実装済み（★v5.0で大幅強化）
外国語混入対策                   ✅ ルール強化済み（★v5.0: ラテン拡張追加）
文字数タイプ別制御               ✅ charMin/Max反映
絵文字後処理+最低3個リトライ     ✅ 7種のみ許可、3個未満でリトライ ★v5.0
通貨ペア日本語自動変換           ✅ USD/JPY→ドル円 等9ペア ★v5.0
TC言及20%制限                    ✅ 自動トリミング
ターゲットレベル                 ✅ 中級者（本気で人生を変えたい人）
IQR外れ値フィルタリング          ✅ スパイクデータ除去
タイムゾーンバグ修正             ✅ 文字列ベース日付比較
AI画像生成（市場系6タイプ）       ✅ Gemini 3 Pro
12アーキタイプ（マンネリ防止）    ✅ 投稿タイプ別適性
TC透かしロゴ合成                  ✅ Google Slides API
3ボタン承認メール                 ✅ 承認/画像再生成/中止
画像再生成（最大3回）             ✅ 異なるアーキタイプ自動選択
main.gs画像統合                   ✅ 3モード全てで画像対応
月曜MORNING専用コンテキスト        ✅ buildPrompt_に曜日判定追加
月曜ニュース検索強化               ✅ fetchMarketNews_週末60時間対応
通貨強弱ランキング注入             ✅ analyzeCurrencyStrength_
レート方向性プロンプト注入         ✅ buildTrendContext_
仮説自動検証                       ✅ verifyPreviousHypothesis_
経済指標結果自動取得               ✅ getIndicatorResults_三層活用
結論バリエーション8種              ✅ buildFormatRules_に注入
コンパナ経歴ファクト               ✅ 7年かかった→3年に自動置換
シャドウバン回避                   ✅ 絵文字制限/ハッシュタグ制限/投稿間隔
ノート構造統一                     ✅ →1ブロック1つ、絵文字3個基本 ★v5.0
AI前置き除去パターン強化           ✅ 合計20+パターン ★v5.0
ニュースGroundingソースURL出力      ✅ 日付必須+ソース最大10件 ★v5.0
半角ピリオド文中対応               ✅ 「ですよ. 世界」→句点+改行 ★v5.0
→前改行強制                       ✅ 行中→を行頭に移動 ★v5.0
アスタリスク全除去                 ✅ AI感防止 ★v5.0
孤立全角カッコ除去                 ✅ Geminiの（）癖を修正 ★v5.0
0.XXXX小数点脱落修正               ✅ AUD/USD等の0.7台レート ★v5.0
TC Drive画像マッチ                 ❌ 廃止（★v5.0: AI画像のみに統一）
ファクトチェック自動化              ✅ factCheckPost_（Gemini+Grounding） ★v5.1
自動修正（事実誤り）               ✅ autoFixPost_（Gemini+Grounding） ★v5.1
承認メールにファクトチェック結果    ✅ Before/After表示 ★v5.1
一括テスト時ファクトチェックスキップ ✅ SKIP_FACT_CHECKフラグ ★v5.1
仮説検証ログシート                  ✅ A〜K列、自動パース+判定 ★v5.2
仮説的中率プロンプト注入             ✅ WEEKLY_HYPOTHESIS生成時に直近5件 ★v5.2
学びログE〜H列（使用回数/スコア）    ✅ setupPhase2And3()で初期化 ★v5.2
学びスコアベース選択                 ✅ 70%上位+30%ランダム ★v5.2
エンゲージメントログシート           ✅ X API metricsバッチ取得 ★v5.2
品質スコア計算                       ✅ 同タイプ平均ERと比較 ★v5.2
品質フィードバックプロンプト注入     ✅ 5件以上蓄積後に自動注入 ★v5.2
毎朝エンゲージメント自動収集         ✅ scheduleTodayPostsに統合 ★v5.2
画像再生成タイムアウト修正（非同期化）       ✅ processPendingRegenRequests_() ★v5.4
getDraftById_ 列インデックス修正             ✅ D列postType、C列scheduledTime ★v5.4
DRAFT_EXPIRY_MINUTES 90分に延長             ✅ config.gs ★v5.4
通貨強弱「最強・最弱」表現修正              ✅ 「買われている・売られている・軟調」に変更 ★v5.5
指標連動トリガー自動設定             ✅ 重要指標30分前にrunIndicator ★v5.3
validateモードメニュー               ✅ カスタムメニューから3モード切替 ★v5.3
商品4銘柄データ取得                  ✅ BTC/GOLD=TwelveData、WTI/天然ガス=AlphaVantage ★v5.6
Grounding二重チェック                ✅ APIデータ基準値＋リアルタイム検索確認をプロンプトに注入 ★v5.6
主語消え対策                         ✅ 「→で始まる文には必ず主語を入れろ」プロンプト追加 ★v5.7
小数点後処理強化                     ✅ 整数丸め修正ループ（11350→113.50等の誤記を自動修正） ★v5.7
経済カレンダー結果列注入             ✅ getEconomicCalendar_()が I列(結果)・J列(判定)をプロンプトに渡す ★v5.7
指標結果取得の定期トリガー化         ✅ refreshTodayIndicatorResults()を発表時刻+10分で自動設定 ★v5.7→v8.1更新
サマータイム自動対応                 ✅ カレンダーB列の時刻を動的に読んでトリガー設定（固定時刻廃止） ★v5.7
深夜帯の前日分対応                   ✅ 0:00〜5:59は前日分も取得対象（isLateNightフラグ） ★v5.7
指標結果への単位付与                 ✅ writeIndicatorResults_() が unit フィールドを活用 ★v5.7
インポート後トリガー自動再設定       ✅ importFromRawSheet()末尾でINDICATOR・結果取得トリガーを再設定 ★v5.7
B列Date型対応（トリガー0件修正）     ✅ instanceof Dateでの分岐追加・getHours/getMinutes使用 ★v5.8
指標データシートF列追加              ✅ GAS読み取り日時をF1に書き込む（setupIndicatorSheet更新） ★v5.7
```

---

*バージョン: v7.4（= 全体設計図v8.8.1に対応）*

*v7.4: Gemini 2.5 Pro変更 + リトライ共通化 + テスト再構成（2026-03-26）*
*　　　① Geminiモデル変更: gemini-2.5-flash → gemini-2.5-pro（config.gs）*
*　　　　 Flash: 文字数2,069文字暴走、ハードカット発動、絵文字0個崩壊、リスクセンチメント誤記が頻発*
*　　　　 Pro: 文字数制限をほぼ遵守。Claudeが「文字数は問題なし」と判定するレベルに改善*
*　　　　 Free Tier（100RPD/5RPM）で運用可能。月額コスト変更なし*
*　　　② リトライ4パターン共通化（geminiApi.gs: 537→566行・3→6関数）*
*　　　　 executeRetry_(config, base): 経過時間チェック→API→後処理→TC除去→検証の共通処理*
*　　　　 countEmojis_(text, emojiList): 絵文字カウント重複コード解消*
*　　　　 checkMultiArrowBlocks_(text): →複数ブロック検出重複コード解消*
*　　　③ postProcessor.gs \b除去（1,836→1,837行）*
*　　　　 37行目の英単語除去正規表現の\bを明示的非英字境界に変更。設計の鉄則準拠*
*　　　④ testFunctions.gs再構成（819→225行）*
*　　　　 testAll1〜6廃止（Proの推論速度で3タイプ同時が6分超え）*
*　　　　 testPro_MORNING()等12個: 1タイプずつファクトチェック込み*
*　　　　 testRULE1_3()/testRULE4()/testWEEK(): RULE系・週間系まとめ*
*　　　　 不要テスト12個削除（testGenerateAll/testGenerateWeekend等）*
*　　　⑤ 投稿構造の根本改革（promptBuilder.gs 1,539→1,581行）*
*　　　　 ニュース要約型→「仮説の提示→答え合わせ→次の仮説」のサイクル型に全面変更*
*　　　　 【★仮説ベースの投稿構造】セクション新設: 非自明な仮説を要求、当たり前の仮説禁止*
*　　　　 【レートデータの使い方】セクション新設: 数字羅列禁止、方向感で語れ*
*　　　　 MORNING/TOKYO/GOLDEN/NY各構造指示を仮説ベースに書き換え*
*　　　　 仮説振り返り指示を「触れてよい」→「必ず1ブロック使え。省略禁止」に変更*
*　　　　 学び指示を「織り込んでもよい」→「根拠や反省材料として活用せよ」に変更*
*　　　　 禁止事項から「トレード判断示唆禁止」を撤廃、シナリオ分析OKに変更*
*　　　　 ただし「エントリーした」「利確した」は禁止（実際にトレードしていない）*
*　　　　 スプレッドシート投稿プロンプト市場系6タイプをv3に全面書き換え*
*　　　　 スプレッドシートの旧構造指示がコード側を上書きする問題を解消（上書き宣言追加）*

---

*バージョン: v7.0（= 全体設計図v8.5に対応）*

*v7.0: geminiApi.gsファイル分割 + 政策金利一元管理（2026-03-23）*
*　　　① geminiApi.gsファイル分割（9,398行→567行・11ファイル分割）*
*　　　　 全116関数を機能別に11ファイルに分割（testGenerateOnly重複削除で-1関数）*
*　　　　 全16投稿タイプのtestAll1-6で全通過確認済み*
*　　　② 政策金利をconfig.gsのPOLICY_RATESに一元管理化（旧: 3箇所ハードコード）*
*　　　③ 関数構成セクション（8-1）をファイル別構成に更新*
*　　　④ 詳細は「geminiApi_ファイル分割_要件定義書_ロードマップ_v1_2_完了版.md」を参照*

*バージョン: v5.9*

*v5.11からの主要変更（v6.2 = 設計図v7.3準拠）:*
- *後処理チェーン追加強化（5項目）: あなたの→みなさんの / 「注目でしょうか」→ですね / 0XX%修正 / 全角スペース行頭除去 / でしょうか重複→断言*
- *主役ペア「今日一番動いている」禁止をプロンプト＋後処理の両方で対応*
- *RULE系に根拠のない数値禁止・架空統計禁止を追加（「研究によると判断力30%低下」等禁止）*
- *リプライ誘発質問をGemini自由生成方式に変更（固定プール80行→指示13行に削減）*
- *WEEKLY_LEARNING 架空失敗談禁止を厳守事項に追加（7年経験者が今週初歩的ミスをやったと書くのは禁止）*
- *importFromRawSheet 新形式対応: A列に時刻・B列に国名・C列に指標名のパターンを追加（旧形式と両方自動判別）*
- *承認WebApp 複数Googleアカウント問題: authuser付与はリダイレクトループを引き起こすため不採用。スマホ運用で解決*
- *投稿プロンプト一覧を v2026-03-15 に更新（WEEKLY_LEARNING構造に架空禁止明記）*

*v5.8からの主要変更（v5.9 = 設計図v7.0準拠）:*
- *LONDONプロンプト強化: 発表済み/未発表区別ルール明記・断言指示強化・→使い方ルール明文化・曖昧表現禁止ワード追加*
- *GOLDENプロンプト修正: 「正直疲れた」等スキャルパー前提の表現を削除*
- *リスクセンチメント後処理チェック追加（geminiApi.gs）: 「リスクオフ+円売り」同時出現で強制リトライ（最大3回）*
- *絵文字行末→行頭 後処理追加（enforceLineBreaks_）: 「テキスト絵文字」→「絵文字 テキスト」に自動変換*
- *buildFormatRules_に絵文字位置ルール追加: 「絵文字は必ず行頭。行末に絵文字を置くな」明記*
- *RULE_3プロンプト構造修正（v2）: エッセイ構造→絵文字ブロック形式に統一（フォーマットルール競合を解消）*
- *プロンプト4点改善（TCAX_投稿プロンプト一覧 v2026-03-13v2）:*
  - *RULE_1〜4のTC導線に「時短」OK例追加*
  - *RULE_1〜4+KNOWLEDGEのトーンに伴走者スタンス追加（「一緒に上手になろう」）*
  - *LUNCH+GOLDENのトーンに「検証日和・休む勇気」概念追加*
  - *KNOWLEDGEの絶対NGに情報商材NG追加*
- *リプライ誘発質問機能追加（buildFormatRules_）: 約30%の確率で末尾に質問文を自動挿入（タイプ別質問プール・二重疑問形防止）*
- *米10年債利回り（TNX）修正: config.gsの範囲チェックを10〜70に修正 / geminiApi.gsで÷10して実際の%値に正規化*

*v5.7からの主要変更（v5.8 = 設計図v6.9準拠）:*
- *経済カレンダーB列（時間）はDate型で保存されているためString().split(':')→parseInt()がNaNになっていた*
- *結果: scheduleIndicatorTriggers_ / scheduleResultFetchTriggers_ のトリガーが常に0件だった*
- *fetchTodayAnnouncedResults_ も同様にisAnnounced判定が全てfalseになり「対象なし」と誤判定していた*
- *修正: rawTime instanceof Date の場合は getHours() / getMinutes() で取得するよう変更*
- *対象3箇所: geminiApi.gs（fetchTodayAnnouncedResults_）/ scheduler.gs（scheduleIndicatorTriggers_ / scheduleResultFetchTriggers_）*

*v5.6からの主要変更（v5.7 = 設計図v6.8準拠）:*
- *主語消え対策: プロンプトに「→で始まる文には必ず主語を入れろ」1行追加*
- *小数点後処理強化: 整数丸め修正ループ追加（11350円→113.50円等の誤記を自動修正）*
- *経済カレンダー読み込みを8列→10列に拡張（I列:結果・J列:判定をGeminiに渡す）*
- *指標結果取得を投稿生成から切り離し定期トリガー化（refreshTodayIndicatorResults追加）*
- *scheduleResultFetchTriggers_(): カレンダーB列+5分で動的設定→サマータイム自動対応*
- *深夜帯（0:00〜5:59）は前日分の指標も取得対象（isLateNight + isAnnounced判定修正）*
- *writeIndicatorResults_(): unit フィールドを活用してI列に単位付きで書き込む*
- *importFromRawSheet()末尾にトリガー自動再設定を追加（5:00以降インポートでもINDICATOR確実に動作）*
- *setupIndicatorSheet()にF列（GAS読み取り日時）を追加*

*v6.5からの主要変更（v6.5 = 設計図v8.0準拠）:*
- *Geminiモデル移行: gemini-2.0-flash → gemini-2.5-flash（2.0は2026/06/01廃止予定）*
- *callGemini_: maxOutputTokens 1024→8192（2.5以降のthinkingトークン対応）+ thinkingConfig { thinkingBudget: 1024 }*
- *次期移行先: gemini-3-flash-preview（Stable昇格後。API形式同一、callGemini_に約15行追加で対応可）*
- *getEconomicCalendar_: 深夜イベント（0:00〜5:59）でI列空なら「未発表」扱い（FOMC誤判定修正）*
- *getEconomicCalendar_: 明日の重要度「高」イベントを「【明日】」ラベル付きで表示（日銀会合等）*
- *buildPrompt_: 主要5中銀の政策金利を常時注入（FRB/日銀/ECB/BOE/RBA。金利変更時は手動更新）*
- *buildFormatRules_: 指標名混同防止ルール追加（CPI≠PPI≠HICP）*
- *factCheckPost_: 経済カレンダーをファクトチェッカーに注入（指標名整合チェック）*
- *factCheckPost_: 指標名混同チェック + 中銀政策スタンスチェック追加*
- *fetchTodayAnnouncedResults_: 深夜ガード追加（0:00〜5:59イベントを日中に誤取得しない）*
- *replaceProhibitedPhrases_: 「要確認」→「注目」置換追加*
- *replaceProhibitedPhrases_: 「見極めたい」置換テキストに句点追加（文結合バグ防止）*
- *replaceProhibitedPhrases_: 二重句点「。。」→「。」安全弁追加*
- *scheduledFetchRates: 未取得指標結果の毎時リトライ追加*
- *scheduler.gs: scheduleResultFetchTriggers_ 発表+5分→+10分に延長*
- *getLatestIndicators_: F列書き込みバグ修正（Utilities.formatDate文字列分離 + flush追加）*
- *config.gs: GEMINI_MODEL = 'gemini-2.5-flash'*
- *config.gs: TNX range修正（min:10,max:70,tnxScale:0.1）適用確認*
- *main.gs: メニューに「📊 指標結果を取得」追加（refreshTodayIndicatorResults手動実行）*
- *replaceProhibitedPhrases_: 日本語名括弧付き二重表記除去（「豪ドル米ドル（豪ドル米ドル）」パターン）*
- *replaceProhibitedPhrases_: 「一番動いている」変形パターン2件追加*
- *factCheckPost_: 総合判定をGeminiのoverallに依存せず個別itemsから再計算（⚠️がoverallで無視されるバグ修正）*
- *factCheckPost_: ⚠️でもcorrectionを出力させるよう変更（旧は❌のみ）*
- *factCheckPost_: サプライズ判定チェック追加（「サプライズ」「予想外」が実態と一致するか検証）*
- *extractPostInsights_: 学び抽出プロンプト根本改善（一般論排除→具体的知見要求、NG/OK例明示）*
- *extractPostInsights_: 仮説抽出プロンプト強化（「市場系投稿で仮説なしは基本ありえない」、条件付き仮説OK、NG/OK例追加）*
- *getLearningLog_: 学びログ注入テキスト改善（「仮説を立てる際はこれらの学びを根拠に使え」追加）*
- *factCheckPost_: verdict空文字列対策（correctionフィールド有無で判定+issuesフィルタリング）*
- *buildIndicatorResultPrompt_: 現在時刻+発表時刻+未発表ガードをプロンプトに追加*
- *writeIndicatorResults_: Geminiがnull返却時は書き込みスキップ（次回リトライ対象に残す）*
- *fetchTodayAnnouncedResults_: isYesterday+深夜帯イベント(eventHour<6)は現在時刻と比較するガード追加*
- *testAll1〜4 → testAll1〜6に再分割（3タイプ×6グループ）、testBatch_からSKIP_FACT_CHECK削除（ファクトチェック込み）*
- *replaceProhibitedPhrases_: 日本語名括弧付き二重表記除去+「一番動いている」変形パターン2件追加*

*v6.5からの主要変更（v6.6 = 設計図v8.1準拠）:*
- *scheduler.gs: cleanupPostTriggers_の実行順序をINDICATOR/結果取得トリガー設定の前に移動（設定直後のトリガーが即削除されていたバグ修正）*
- *scheduler.gs: 指標結果取得タイミングを発表+5分→+10分に変更（Google検索未反映対策）*
- *scheduler.gs: scheduleIndicatorTriggers_の日付フォーマットバグ修正（yyyy/MM/dd+T→Invalid Date→即発火。todayStr yyyy-MM-dd追加でISO 8601準拠に）*
- *scheduler.gs: scheduleResultFetchTriggers_の対象を「高」+「中」→「高」のみに限定（GASトリガー数上限20件超過でGOLDEN/NYが設定不可になるバグ修正。「中」はscheduledFetchRatesの毎時リトライで取得）*
- *geminiApi.gs: 自動修正リトライ+強制削除（verifyAutoFix_/extractKeyPhrases_/forceRemoveIssueLines_追加）。autoFixPost_がGeminiから「修正済み」を受け取っても問題表現が残るケースに3段階セーフティネット*
- *geminiApi.gs: 重複テキストブロック除去（removeDuplicateBlocks_追加）。autoFixPost_のGemini応答に本文冒頭が重複出力されるケース対策。全6箇所の後処理チェーンに追加*
- *config.gs: MORNING投稿時刻を7:20〜7:50帯に変更（月07:28/火07:43/水07:35/木07:47/金07:22）*
- *config.gs: RANDOM_DELAY_MAX 2→3に拡大（トリガーゆらぎ拡大）*
- *utils.gs: addRandomDelay()の投稿処理sleepを最大60秒に独立制限（RANDOM_DELAY_MAX=3で最大180秒sleep→GAS 6分制限タイムアウト対策）*
- *geminiApi.gs: ハルシネーションレート修正（fixHallucinatedRates_追加）。投稿テキスト内のレートをTwelve Data API確定レートと照合し、乖離3%超なら確定値に置換*
- *geminiApi.gs: factCheckPost_/autoFixPost_にシステム確定レート注入。Grounding検索と確定レートの情報源矛盾によるレート系誤検出を解消*
- *geminiApi.gs: autoFixPost_にファクトチェック用語混入検出+修正棄却。Geminiが「修正後テキスト」ではなく「検証説明文」を返すケースを15パターンで検出し元テキストを使用*

*v7.4からの主要変更（v7.5 = 設計図v8.9準拠）:*
- *未発表指標の仮説答え合わせ防止（二重防御）*
- *対策A: GOLDEN/NY構造指示に「仮説の条件に含まれる指標がまだ■未発表なら答え合わせ保留」ルール追加*
- *対策B: getUnreleasedIndicatorNames_()新設。経済カレンダーの未発表指標名を取得→仮説テキストと照合→マッチ時に警告注入*
- *getHypothesisContext_()内にチェックロジック追加（部分一致: 接頭辞除去して4文字以上でマッチ）*
- *重複コメント除去（postProcessor.gs 1箇所 + promptBuilder.gs 5箇所）*
- *postProcessor.gs: 1,837→1,832行、promptBuilder.gs: 1,581→1,650行*

*v7.5からの主要変更（v7.6 = 設計図v8.10準拠）:*
- *buildPrompt_分割リファクタリング（636行→391行）。promptBuilder.gs: 1,650→1,709行・17関数*
- *5つのヘルパー関数新設: buildMarketTypePolicy_/buildKnowledgePolicy_/buildIndicatorPolicy_/buildWeekendPolicy_/buildRulePolicy_*
- *ロジック変更なし（prompt += を text += に変えて return text するだけ）。テスト確認済み*
- *今後の投稿タイプ別方針変更はヘルパー関数内を修正するだけ（buildPrompt_本体を触らない）*

*v7.6からの主要変更（v7.7 = 設計図v8.11準拠）:*
- *条件分岐型仮説ルール追加（promptBuilder.gs: 1,709→1,722行）*
- *一方向の賭け仮説（「○○なら○○円割れ」）を禁止。「結果に対する市場の反応」を読む仮説を推奨*
- *buildMarketTypePolicy_: 条件分岐型仮説の詳細ルール+OK/NG例（10行追加）*
- *buildMarketTypePolicy_: MORNING「条件分岐型で」/ NY「条件分岐型で残せ」に変更*
- *buildFormatRules_: 基本の流れに「条件分岐型」明記 + NG例に「一方向の賭け禁止」追加*
- *getHypothesisContext_: 答え合わせOK例3追加（条件分岐パターン）*

*v7.8からの主要変更（v7.9 = 設計図v8.13準拠）:*
- *ニュース主軸ルール追加（promptBuilder.gs: 1,749→1,759行）*
- *buildMarketTypePolicy_: 「投稿の主軸はニュース。レートは裏付け」ルール+OK/NG例追加*
- *buildFormatRules_題材選定: 「ニュースTOP5から最もインパクトのある話題を核にしろ」に強化*
- *buildFormatRules_投稿構造: 「ニュース→為替への影響→仮説」の順に変更。「レートで始めるな」を明記*

*v7.7からの主要変更（v7.8 = 設計図v8.12準拠）:*
- *charMax緩和（config.gs）: 300→380 / 350→420 / 450→550（全16タイプ）。文字数上限が厳しすぎて修正時に文が壊れる問題を解消*
- *答え合わせ重複防止（promptBuilder.gs: 1,722→1,749行）: getHypothesisContext_内でgetTodayPreviousPosts_を照合。答え合わせ済みなら「状況の変化を1文で」に切り替え*
- *品質レビュー全面改修（qualityReview.gs: 332→411行）: Claude指摘のみ→Gemini修正→trimToCharMax_文字数保証の3段階に分離*
- *孤立短文除去（postProcessor.gs: 1,832→1,898行）: removeOrphanedLines_新設。10文字以下の孤立行を自動除去。後処理チェーンに組み込み*

*v6.8からの主要変更（v6.9 = 設計図v8.4準拠）:*
- *factCheckPost_のカレンダースコープをpostType別に修正。NEXT_WEEKに「today」しか渡しておらず来週の指標を検証できなかった*
- *仮説検証ログ登録対象をWEEKLY_HYPOTHESISのみ→RULE/KNOWLEDGE以外の全市場系に拡張（Phase 5データ蓄積、週1件→週20-30件）*
- *仮説抽出プロンプトを「条件(IF)→理由(BECAUSE)→結果(THEN+レート)」の3要素構造に強化。自明な仮説をNG例で明示的に禁止*

*v6.7からの主要変更（v6.8 = 設計図v8.3準拠）:*
- *replaceProhibitedPhrases_の\b→(^|[^0-9.])修正（レート/パーセントの二重小数点バグ解消、2箇所）*
- *validateFinalFormat_()新設（二重小数点の最終安全網、全6経路に組み込み）*
- *レート表記桁数ルール追加（JPY小数2桁/USD小数4桁、プロンプト2箇所）*
- *ECB政策金利: 預金金利2.00%→政策金利2.15%に統一（3箇所）。BOE据え置き日も追記*
- *仮説検証/学び抽出: callGemini_戻り値(.text)の取り出し漏れ修正（2箇所）*
- *ファクトチェック2層構造化: factCheckPost_にLayer 2（知識+Grounding検証）追加。autoFixPost_はGrounding OFF（correction+システムデータのみ）*

*v6.6からの主要変更（v6.7 = 設計図v8.2準拠）:*
- *geminiApi.gs: factCheckPost_をGrounding依存→システムデータ照合に根本改修。callGemini_第3引数をfalseに変更（Grounding OFF）。システム確定データ（レート・金利・カレンダー）との整合性チェックのみに限定*
- *geminiApi.gs: ⚠️はautoFix対象外に変更（❌のみautoFix発動）。⚠️は「システムデータで検証不可」の意味に変更*
- *geminiApi.gs: factCheckPost_/autoFixPost_に政策金利5中銀分を注入（buildPrompt_と同じデータ）*
- *approval.gs: 承認メール表示の簡潔化。✅なら緑の1行、問題ありなら❌/⚠️のみオレンジ枠表示、修正前テキスト廃止*

*v6.4からの主要変更（v6.4 = 設計図v7.9準拠）:*
- *v7.4: 伝聞表現の後処理追加（「という報道があります」→「ありました」等6パターン）・月曜「昨日終値比」→「金曜終値比」追加・buildFormatRules_に過去事実ルール追加*
- *v7.4b: プロンプト注入テキストの曜日分岐修正（月曜=「先週金曜終値比」/火〜金=「前日終値比」、isMonday_/prevDayLabel変数追加）*
- *v7.4c: aggregateDailyRates()の列ズレバグ修正（v6.6商品データ追加でキャッシュが14列→ステータス列誤認識→日次レートが3/9から停止。numCols動的取得・statusColヘッダー検索に変更）*
- *v7.5: fixMondayYesterday_に通貨ペア名パターン追加・Grounding痕跡除去（9パターン）・断言ルールを「絵文字行=事実言い切り/→行=人間味」の2層構造に刷新・通貨ペア混同禁止ルール追加*
- *v7.6: リトライチェーンのTC除去漏れ修正（主役ペア・リスクセンチメントのリトライ後処理にremoveTCMention_追加）*
- *v7.7: 冗長表現除去（「オセアニア通貨の豪ドル」等）・経済カレンダー日付確認ルール・WTI因果関係ルール強化・factCheckPost_に経済イベント日付チェック追加*
- *v7.8: autoFixPost_に投稿タイプ別トーン保持ルール追加（typeContextMap: 7タイプ分のトーン定義をpromptに注入）。自動修正でLONDONが朝の投稿に変質するバグを防止*

*v5.5からの主要変更（v6.2 = 設計図v7.3準拠）:*
- *商品データ4銘柄対応（BTC/USD + XAU/USD をTwelve Dataで1時間ごと同時取得）*
- *XAU/USD（ゴールド）: Alpha Vantageは全エンドポイント非対応のためTwelve Dataに変更*
- *Alpha Vantage APIキー取得・登録（WTI・天然ガスの日次取得用、ALPHA_VANTAGE_API_KEY）*
- *レートキャッシュ列順変更: I(WTI) J(BTC) K(GOLD) L(NATGAS) M(取得元) N(ステータス)*
- *fetchCommodityPrices_: BTC専用→BTC+GOLD対応（1リクエストで同時取得）*
- *プロンプト注入にGrounding検索指示追加（APIデータ基準値+リアルタイム確認の二重チェック）*

*v5.3からの主要変更（v5.4 = 設計図v6.4準拠）:*
- *画像再生成バグ修正（2つの複合バグ）*
  - *① doGet 30秒タイムアウト対策: regenerateアクションを非同期化。フラグ（REGEN_REQUEST_）を立てて即返す → processPendingRegenRequests_() がトリガー内で画像生成・メール送信*
  - *② getDraftById_ 列インデックスずれ修正: postType=data[i][3]（D列）、scheduledTime=data[i][2]（C列）。スプレッドシート仕様書v1.1準拠*
- *DRAFT_EXPIRY_MINUTES: 60→90に延長（再生成3回×最大5分の猶予確保）*

*v5.2からの主要変更（v5.3 = 設計図v6.3準拠）:*
- *Phase 8: 指標連動投稿実装（経済カレンダーから重要度「高」を自動検出、30分前にトリガー動的設定、最大2件/日）*
- *validateモードをカスタムメニューから切替可能に（手動/検証/自動の3モード）*
- *scheduler.gs: scheduleIndicatorTriggers_()追加*
- *main.gs: setModeValidate()追加*

*v5.1からの主要変更（v5.2 = 設計図v6.2準拠）:*
- *Phase 2: 仮説的中率自動集計（仮説パース、レート比較判定、Gemini理由生成、サマリー注入）*
- *Phase 3: 学びスコアベース選択（E〜H列追加、70%上位+30%ランダム、使用回数自動インクリメント）*
- *Phase 4: エンゲージメントフィードバック（X API metricsバッチ取得、品質スコア計算、プロンプト注入）*
- *シート2つ追加（仮説検証ログ、エンゲージメントログ）= 全17シート*
- *毎朝のscheduleTodayPostsに仮説検証（月曜）+エンゲージメント収集を追加*
- *Phase 5はデータ蓄積（1ヶ月程度）後に着手予定*

*v5.0からの主要変更（v5.1 = 設計図v6.1準拠）:*
- *ファクトチェック自動化（factCheckPost_: Gemini+Groundingで事実検証）*
- *自動修正（autoFixPost_: 誤りを検出→正確な情報に書き換え→再度後処理）*
- *承認メールにファクトチェック結果を表示（Before/After + 修正箇所）*
- *一括テスト時のファクトチェックスキップ（GAS 6分制限対策）*
- *AI前置き除去パターン追加（「【修正後】」「【元の投稿】」「コンパナとして作成」等）*
- *完全自動学習システムの土台として位置付け（正確な投稿のみが学習ループに入る）*
---

*更新日: 2026-04-01 | v8.0（アノマリー自動判定機能+品質修正安定化）*
