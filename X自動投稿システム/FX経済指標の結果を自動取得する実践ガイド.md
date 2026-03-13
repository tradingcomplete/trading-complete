# FX経済指標の結果を自動取得する実践ガイド

**Gemini API + Google Search Groundingで前日の指標結果を高精度に取得し、朝の振り返り投稿を自動化する最適解は「みんかぶFXスクレイピング＋Gemini構造化出力」の二段構成である。** 単一の完璧な手段は存在しないが、無料枠の範囲で信頼性の高いパイプラインを構築できる。Gemini 3シリーズでは Google Search Groundingと構造化出力（JSON Schema）の同時利用が可能になり、1回のAPIコールで検索→数値抽出→JSON整形まで完結する。ただしGoogle検索インデックスの反映には発表後5〜30分のラグがあり、翌朝6:50のMORNING投稿なら十分な精度が見込める。

---

## Gemini + Groundingで指標結果を取る検索クエリの設計

Gemini APIのGoogle Search Groundingは、プロンプトを受け取るとモデルが自動的に検索クエリを生成・実行し、検索結果を統合して回答を返す仕組みである。ユーザーが検索クエリそのものを書くのではなく、**プロンプトの書き方で検索精度を制御する**点が重要だ。

**英語クエリが圧倒的に有利**である。米雇用統計（NFP）、CPI、ISMなど米国指標はReuters、Bloomberg、Trading Economicsなど英語圏の金融サイトが一次情報源であり、Googleのインデックス量・速度ともに英語が勝る。具体的には「US Non-Farm Payrolls March 2026 actual result」のように**指標の正式英語名＋月年＋actual**を含めると高精度になる。一方、日銀政策決定会合や日本CPI など日本固有の指標は「日銀 金融政策決定会合 2026年3月 結果」のように日本語で検索する方がNHK・日経ソースにヒットしやすい。

### 指標タイプ別の推奨クエリパターン

| 指標 | 推奨プロンプト（英語） | 備考 |
|------|----------------------|------|
| 米雇用統計 | "US Non-Farm Payrolls [month year] actual result" | BLS発表直後はbls.govが最速 |
| 米CPI | "US CPI [month year] actual year-over-year" | YoY/MoM両方を明示 |
| ISM製造業 | "ISM Manufacturing PMI [month year] actual" | ISMは民間データ |
| FOMC | "Federal Reserve interest rate decision [month year]" | 金利据置/変更を明示させる |
| 日銀 | "日銀 金融政策決定会合 [year年month月] 結果" or "BOJ rate decision [month year]" | 日英併用が最善 |
| ECB | "ECB interest rate decision [month year]" | ECBプレスリリースがソース |

検索精度を上げる追加テクニックとして、**URL Contextツールとの併用**が非常に効果的である。Gemini 3ではgoogle_searchとurl_contextを同一リクエストで同時使用でき、Trading Economicsの該当指標ページURLを明示的に渡しつつ、Google検索でも裏取りさせるハイブリッド戦略が取れる。`exclude_domains`パラメータで信頼性の低いサイトを除外することも可能だが、**`include_domains`（特定サイトのみに限定）は存在しない**ため、プロンプト内で「Search Reuters, Trading Economics, and BLS for the data」と指示する形になる。

---

## みんかぶFXスクレイピングが最も確実な無料手段

無料APIの調査結果は厳しい。**Trading Economics APIは経済カレンダーデータが有料**（月額推定$400〜）、Alpha Vantageは25回/日の制限に加え米国指標のみで予想値なし、FRED APIは完全無料だが予想値（コンセンサス）を提供しない。Finnhub APIは無料枠60回/分と寛大だが、経済カレンダーのactual/forecast値が無料で取れるかは要検証である。

そこで最も実用的なのが**みんかぶFX（`fx.minkabu.jp/indicators`）のHTMLスクレイピング**だ。サーバーサイドレンダリングのためGASの`UrlFetchApp`で直接HTML取得が可能で、複数の開発者がGASでの実装実績を公開している。日付・重要度パラメータ付きURLが使え、前回値・予想値・結果・前回変動幅（pips）まで取れる。

```javascript
// GASでのみんかぶFXデータ取得例
var url = 'https://fx.minkabu.jp/indicators?date=2026-03-01&importance=4';
var html = UrlFetchApp.fetch(url).getContentText('utf-8');
// Parser ライブラリで<table>内データを抽出
```

**リスクは構造変更**である。2017年にJSON構造が突然変わりスクリプトが壊れた前例がある。エラーハンドリングとSlack通知を組み込み、スクレイピング失敗時はGemini Groundingにフォールバックする設計が望ましい。

### 推奨アーキテクチャ：三段フォールバック

1. **一次取得：みんかぶFXスクレイピング**（最も正確、予想/結果/前回値が揃う）
2. **二次取得：FRED API**（米国指標の実績値を公式ソースで検証、完全無料・無制限）
3. **三次取得：Gemini + Google Search Grounding**（上記が失敗した場合のバックアップ、かつ市場反応の解説生成に活用）

FRED APIは予想値は無いが**公式の実績値を無料で確実に取得できる**ため、クロスチェック用として極めて有用だ。主要シリーズIDは`PAYEMS`（雇用統計）、`CPIAUCSL`（CPI）、`UNRATE`（失業率）、`FEDFUNDS`（FF金利）など。

---

## Gemini構造化出力で数値をJSON形式で返させる方法

Gemini 3シリーズの最大の武器は、**Google Search Grounding＋構造化出力（JSON Schema）の同時利用**である。これにより「リアルタイム検索→数値抽出→JSON整形」を1回のAPIコールで完結できる。

### 本番用プロンプト＋スキーマ設計

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class Indicator(BaseModel):
    name_en: str = Field(description="Indicator name in English")
    name_ja: str = Field(description="指標名（日本語）")
    country: str = Field(description="国コード: US, JP, EU, GB")
    actual: Optional[float] = Field(description="発表値（数値）")
    forecast: Optional[float] = Field(description="市場予想（数値）")
    previous: Optional[float] = Field(description="前回値（数値）")
    previous_revised: Optional[float] = Field(description="前回修正値")
    unit: str = Field(description="単位: %, K, index等")
    deviation: Optional[Literal["beat","miss","inline"]] = Field(
        description="予想対比: beat=上振れ, miss=下振れ, inline=一致"
    )

class DailyResults(BaseModel):
    date: str
    indicators: List[Indicator]
    market_summary: str = Field(description="市場反応の要約（日本語）")
    usdjpy_move: Optional[str]
```

**システム指示のポイント**は4つある。第一に「確認できない値はnullを返し、絶対に値を捏造しない」と明示する。第二に「小数点表記で返す（3.5%ではなく3.5）」と単位フォーマットを指定する。第三に「速報値と確定値を区別する」よう求める。第四に「前回値の修正があれば必ず報告する」と指示する。description フィールドの記述がモデルの抽出精度に直結するため、各フィールドに具体的な説明を入れることが重要だ。

### バッチ処理 vs 個別クエリ

**複数指標を1プロンプトにまとめるのが推奨**である。Gemini 2.5以降のモデルは長文出力に強く、1回のGrounding検索で複数データを取得した方がコスト効率が良い。Gemini 2.5 Flashなら**Grounding料金は$35/1,000プロンプト（約$0.035/回）**で、毎朝1回の呼び出しなら月額約$1で済む。Gemini 3 Flashでは検索クエリ単位の課金（$14/1,000クエリ）に変わるため、複数検索が走ると割高になる可能性がある点に注意。

### Groundingの検証とリトライロジック

レスポンスの`groundingMetadata`を必ずチェックする。`groundingChunks`にソースURLが含まれていれば検索結果に基づいた回答であり、含まれていなければモデルが学習データから回答した（＝古いデータの可能性）ことを意味する。後者の場合はクエリを変えてリトライすべきだ。信頼できるドメイン（`tradingeconomics.com`、`reuters.com`、`bls.gov`）がソースに含まれているかの自動判定も組み込むと精度が安定する。

---

## GASでの実装フロー全体像

翌朝6:50のMORNING投稿に間に合わせるため、**データ取得は朝5:00〜6:00にトリガー実行**し、6:50の投稿トリガーまでにシートに結果を書き込む設計が合理的である。

```
[05:00] トリガー起動
  ├─ ステップ1: Google Sheetsから当日・前日の指標一覧を取得
  ├─ ステップ2: みんかぶFXから結果をスクレイピング
  │    └─ 失敗時 → FRED APIで米国指標の実績値を取得
  │    └─ それも失敗時 → Gemini Groundingで検索
  ├─ ステップ3: 取得した結果をシートの「結果」列に書き込み
  ├─ ステップ4: Twelve Data APIでUSD/JPY等の前日変動幅を取得（既存）
  └─ ステップ5: Gemini APIに指標結果＋為替変動を渡して
             MORNING投稿テキストを生成

[06:50] 投稿トリガー起動
  └─ 生成済みテキストをX APIで投稿
```

ステップ2のみんかぶFXスクレイピングでは、**Parserライブラリ**（スクリプトID: `1Mc8BthYthXx6CoIz90-JiSzSafVnT6U3t0z_W3hLTAX5ek4w0G_EIrNw`）を使うのが最も安定する。正規表現よりもタグベースの抽出が壊れにくい。`CacheService`で取得結果を6時間キャッシュすれば、リトライ時の無駄なリクエストも防げる。

---

## トレーダーが最も価値を感じる振り返りフォーマット

FXトレーダーにとって最重要なのは**「予想と結果の乖離」と「それによる値動き」のセット**である。数値だけでなく「なぜ動いたか」の一行解説があると投稿の価値が飛躍的に上がる。

### 推奨MORNING投稿テンプレート

```
☀️ おはようございます！昨夜の指標まとめ

【重要指標の結果】
🔴 米コアPCE(前年比) 2.8%(予想2.7%/前回2.6%)→ 上振れ
🟢 米ISM製造業 51.2(予想50.5/前回49.8)→ 上振れ
🟡 米個人所得 0.3%(予想0.4%/前回0.5%)→ 下振れ

【マーケットの反応】
📈 ドル円 149.50→150.20(+70pips)
📉 ユーロドル 1.0855→1.0820(-35pips)

💡 PCE上振れでFRB利下げ期待が後退、ドル全面高の展開
```

**カラーコード規約**として、🔴は予想より悪い（通貨にネガティブ）、🟢は予想より良い（ポジティブ）、🟡は予想通りまたは軽微な乖離とする。ただしCPIなどインフレ指標は「上振れ＝ドル買い（利上げ期待）」なので、通貨方向の判定ロジックが指標ごとに異なる点に注意が必要だ。

Geminiへの投稿生成プロンプトには、以下のようにデータを注入する：

```
以下の経済指標結果と為替変動データを基に、FXトレーダー向けの朝の振り返り投稿を生成してください。

## 昨日の指標結果
- 米コアPCE(前年比): 予想2.7% → 結果2.8%（上振れ）
- 米ISM製造業: 予想50.5 → 結果51.2（上振れ）
- 米個人所得: 予想0.4% → 結果0.3%（下振れ）

## 為替変動
- USD/JPY: 始値149.50 → 終値150.20（+70pips）
- EUR/USD: 始値1.0855 → 終値1.0820（-35pips）

## ルール
- 280文字×2ツイート以内
- 上振れ/下振れの方向性とドル円への影響を必ず言及
- トレーダー目線で「今日注目すべきポイント」を1つ付加
```

---

## まとめ：最小コストで最大精度を出す組み合わせ

最適な戦略は単一手法への依存を避け、**確実性の異なる3層を組み合わせる**ことだ。みんかぶFXスクレイピングが「予想・結果・前回値」のフルセットを日本語で提供してくれる最も実用的な一次ソースであり、FRED APIが米国指標の公式値による検証レイヤーとなり、Gemini Groundingがフォールバック兼・市場解説生成エンジンとして機能する。

この構成であれば**追加コストはGemini APIの検索Grounding料金（月額$1〜2程度）のみ**で、GASの実行時間制限（6分）内に十分収まる。最も重要な設計判断は、みんかぶFXの構造変更に備えたエラーハンドリングと、Gemini Groundingへの自動フォールバック機構を初期段階から組み込んでおくことである。指標名のマッチングにはシート上の指標名とみんかぶFXの表記の対応表（例：「米雇用統計」⇔「非農業部門雇用者数変化」）をあらかじめ用意しておくと、取得精度がさらに安定する。