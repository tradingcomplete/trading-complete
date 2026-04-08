# ダウ理論改善（スイングハイ/ロー方式） 要件定義書 v1.1

**作成日**: 2026-04-07
**更新日**: 2026-04-07（v1.1 既存影響分析+列定義関数化+仮説/学び連携詳細）
**対象**: T-CAX v12.1.1 ダウ理論判定の精度向上
**状態**: 要件定義完了・実装未着手

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.0 | 2026-04-07 | 初版作成 |
| v1.1 | 2026-04-07 | 既存コード全22ファイル影響分析完了。列定義をconfig.gsに関数化。forceRebuildDailyRates対策追加。learningManager連携詳細化。通貨強弱シート互換性確認 |

---

## 1. なぜ変えるのか

### 1-1. 現在の問題

v12.1のcalcDowTheory_は直近5日の高値/安値の「60%以上が同方向」でトレンド判定。

```
問題1: 5日間は短すぎる
  → ノイズに振り回される。月曜〜金曜の1週間だけでは方向感が出にくい
  → スイングトレードの時間軸（数日〜数週間）に合っていない

問題2: 押し安値/戻り高値の概念がない
  → 「高値更新」「安値更新」の判定が曖昧
  → 60%ルールは恣意的で、実際のチャートの節目を捉えていない

問題3: 週足の視点がない
  → 日足の短期ノイズだけで判定している
  → 「日足は上だが週足ではレンジ」という重要な情報が欠落
```

### 1-2. 解決方針

スイングハイ/ロー（前後4日）でチャートの節目を客観的に特定し、その並びでダウ理論を判定する。日足+週足の2軸でトレンドを把握する。

```
旧: 5日のOHLC → 60%ルール → 上昇/下降/レンジ
新: 20日+のOHLC → SH/SL特定 → 直近2組のSH/SLの並びで判定
    + 週足も同じロジックで判定

コンパナのトレードスタイル（スイング）に合致。
投稿の仮説精度が向上。
```

---

## 2. スイングハイ/ロー（SH/SL）の定義

### 2-1. スイングハイ（SH）

```
当日の高値が、前後4日間の全ての高値より高い場合に確定。

条件:
  High[i] > High[i-1]
  High[i] > High[i-2]
  High[i] > High[i-3]
  High[i] > High[i-4]
  High[i] > High[i+1]
  High[i] > High[i+2]
  High[i] > High[i+3]
  High[i] > High[i+4]

確定タイミング: 当日+4日後のデータが揃った時点（4日遅れで確定）
値: その日の高値（OHLCのH）
```

### 2-2. スイングロー（SL）

```
当日の安値が、前後4日間の全ての安値より低い場合に確定。

条件:
  Low[i] < Low[i-1]
  Low[i] < Low[i-2]
  Low[i] < Low[i-3]
  Low[i] < Low[i-4]
  Low[i] < Low[i+1]
  Low[i] < Low[i+2]
  Low[i] < Low[i+3]
  Low[i] < Low[i+4]

確定タイミング: 当日+4日後のデータが揃った時点（4日遅れで確定）
値: その日の安値（OHLCのL）
```

### 2-3. 重要な性質

```
- SH/SLは同じ日に同時に成立することがある（大きく上下した日）
- 連続する日にSHが出ることはない（前後4日の条件で排除される）
- 最新のSH/SLは常に4日前のもの（後4日のデータ待ち）
- T-CAXは1日1回（aggregateDailyRates実行時）に判定
  → 毎日1日分の新しいSH/SLが確定する可能性がある
```

---

## 3. ダウ理論判定ルール

### 3-1. 日足判定（直近2組のSH + 直近2組のSL）

```
上昇トレンド:
  最新SH > 前回SH（高値切り上げ）AND 最新SL > 前回SL（安値切り上げ）

下降トレンド:
  最新SH < 前回SH（高値切り下げ）AND 最新SL < 前回SL（安値切り下げ）

トレンド転換（上昇→下降）:
  上昇トレンド中に、終値が前回SLを下回った

トレンド転換（下降→上昇）:
  下降トレンド中に、終値が前回SHを上回った

レンジ:
  SHとSLの方向が一致しない
  例: SH切り上げ + SL切り下げ（拡大型）
  例: SH切り下げ + SL切り上げ（収束型）

データ不足:
  SHが2個未満 or SLが2個未満
```

### 3-2. 週足判定（同じロジック）

```
週足OHLCに対して前後4週のSH/SL判定を行い、同じルールで判定。
週足は日足より信頼度が高く、大局観を把握するために使う。
```

### 3-3. 日足×週足の複合判定

```
日足と週足の結果をClaude市場分析に渡し、Claudeが文脈に応じて解釈する。
コード側で複合ラベルは作らない（投稿タイプによって重みが変わるため）。
```

---

## 4. 列定義の関数化（config.gsに追加）

### 4-1. 設計方針

```
現状の問題:
  各ファイルが「1 + CURRENCY_PAIRS.length * 4 + 1」で列数を計算。
  SH/SL列を追加すると、この計算式が散在する全箇所に影響する可能性。

解決:
  config.gsに列定義ヘルパーを追加。
  日次レートの列構造を1箇所で管理し、全ファイルから参照する。
```

### 4-2. config.gsに追加する定数/関数

```javascript
// ===== 日次レートシート列定義 ★v12.1.1 =====
var DAILY_RATE_COLS = {
  DATE: 0,           // A列: 日付
  OHLC_START: 1,     // B列: 最初のペアの始値
  OHLC_PER_PAIR: 4,  // 始値/高値/安値/終値
  // 列番号を動的に算出する関数群
  getOhlcCols: function(pairIndex) {
    var base = this.OHLC_START + pairIndex * this.OHLC_PER_PAIR;
    return { open: base, high: base + 1, low: base + 2, close: base + 3 };
  },
  getCountCol: function() {
    return this.OHLC_START + CURRENCY_PAIRS.length * this.OHLC_PER_PAIR; // AD列
  },
  getShCol: function(pairIndex) {
    return this.getCountCol() + 1 + pairIndex * 2;     // AE列〜
  },
  getSlCol: function(pairIndex) {
    return this.getCountCol() + 1 + pairIndex * 2 + 1;  // AF列〜
  },
  getTotalCols: function() {
    // 日付(1) + OHLC(7*4) + 件数(1) + SH/SL(7*2) = 44
    return 1 + CURRENCY_PAIRS.length * this.OHLC_PER_PAIR + 1 + CURRENCY_PAIRS.length * 2;
  },
  getOhlcOnlyCols: function() {
    // SH/SL列を含まない列数（既存コードの互換性用）
    return 1 + CURRENCY_PAIRS.length * this.OHLC_PER_PAIR + 1; // 30列
  }
};

// ===== 週足シート列定義 ★v12.1.1 =====
var WEEKLY_RATE_COLS = {
  DATE: 0,
  COLS_PER_PAIR: 6,  // OHLC(4) + SH(1) + SL(1)
  getPairCols: function(pairIndex) {
    var base = 1 + pairIndex * this.COLS_PER_PAIR;
    return {
      open: base, high: base + 1, low: base + 2, close: base + 3,
      sh: base + 4, sl: base + 5
    };
  },
  getTotalCols: function() {
    return 1 + CURRENCY_PAIRS.length * this.COLS_PER_PAIR; // 43列
  }
};
```

### 4-3. 既存コードの互換性

```
既存の全ファイルは以下の2パターンで日次レート列数を参照:

  パターンA: 1 + CURRENCY_PAIRS.length * 4 + 1  （= 30列）
  パターンB: 1 + 7 * 4 + 1                       （= 30列、ハードコード）

SH/SL列（31〜44列目）は既存の30列の「後ろ」に追加するため、
既存コードの読み書き範囲には一切影響しない。

ただし将来の安全性のため、新規コードでは DAILY_RATE_COLS を使用する。
既存コードは動作に問題がないため、今回は変更しない（リスク最小化）。
```

---

## 5. シート設計

### 5-1. 日次レートシート（既存を拡張）

```
現在の構成（30列）:
  A: 日付
  B-E: USD/JPY（始値/高値/安値/終値）
  F-I: EUR/USD（始値/高値/安値/終値）
  J-M: GBP/USD（始値/高値/安値/終値）
  N-Q: EUR/JPY（始値/高値/安値/終値）
  R-U: GBP/JPY（始値/高値/安値/終値）
  V-Y: AUD/JPY（始値/高値/安値/終値）
  Z-AC: AUD/USD（始値/高値/安値/終値）
  AD: データ件数

追加する列（14列 = 7ペア × SH/SL各1列）:
  AE: USD/JPY_SH    AF: USD/JPY_SL
  AG: EUR/USD_SH    AH: EUR/USD_SL
  AI: GBP/USD_SH    AJ: GBP/USD_SL
  AK: EUR/JPY_SH    AL: EUR/JPY_SL
  AM: GBP/JPY_SH    AN: GBP/JPY_SL
  AO: AUD/JPY_SH    AP: AUD/JPY_SL
  AQ: AUD/USD_SH    AR: AUD/USD_SL

合計: 44列
SH/SL列は該当しない日は空欄（多くの日が空欄になる）
```

### 5-2. 週足シート（新規作成）

```
シート名: 「週足」
更新タイミング: 毎週月曜のaggregateDailyRates実行時に前週分を追加
保持期間: 52週（1年分）。超過分は自動削除

列定義（43列 = 1 + 7ペア × 6列）:
  A: 週開始日（月曜の日付）
  各ペア6列: 始値 / 高値 / 安値 / 終値 / SH / SL

週足OHLC算出ルール:
  始値 = 月曜の日足始値
  高値 = 月〜金の最高値
  安値 = 月〜金の最安値
  終値 = 金曜の日足終値（金曜が祝日の場合は最終営業日）
```

---

## 6. 既存コード影響分析（全22ファイル精査結果）

### 6-1. 影響なし（16ファイル）

| ファイル | 理由 |
|---------|------|
| anomalyManager.gs | 日次レートシートを参照しない |
| approval.gs | 日次レートシートを参照しない |
| calendarManager.gs | 日次レートシートを参照しない |
| factCheck.gs | 日次レートシートを参照しない |
| imageGenerator.gs | 日次レートシートを参照しない |
| main.gs | メニューからrebuildDailyRatesを呼ぶだけ |
| postProcessor.gs | 日次レートシートを参照しない |
| promptBuilder.gs | 日次レートシートを参照しない |
| qualityReview.gs | 日次レートシートを参照しない |
| scheduler.gs | aggregateDailyRatesを呼ぶだけ |
| sheetsManager.gs | 日次レートシートを参照しない |
| testFunctions.gs | テスト関数のみ |
| utils.gs | ユーティリティのみ |
| xApi.gs | X API投稿のみ |
| config.gs | 列定義を追加する側（壊れない） |
| marketAnalysis.gs | 日次レート読み込みは30列指定。SH/SL列より手前だけ読むため影響なし |

### 6-2. 影響あり・修正が必要（6ファイル）

| ファイル | 箇所 | 影響 | 対策 |
|---------|------|------|------|
| **priceSummary.gs** | aggregateDailyRates | 新規行をappendRow（30列）→ SH/SL列は空 | SH/SL判定ステップを追加。4日前の行のSH/SLを埋める |
| **priceSummary.gs** | aggregateDailyRatesヘッダー作成 | 新規シート作成時にSH/SLヘッダーがない | ヘッダーにSH/SL列を追加 |
| **priceSummary.gs** | forceRebuildDailyRates | 30列でsetValues → SH/SL列は消えない（範囲外）が、再構築後SH/SLが空になる | 再構築後にbackfillSwingHighLow()を自動呼び出し |
| **priceSummary.gs** | 週足シート作成+更新 | 新機能 | 新規追加（aggregateDailyRates内で月曜に前週分を追加） |
| **rateManager.gs** | calcDowTheory_ | 現在の5日60%ルールをSH/SLベースに置換 | 日次レートシートのSH/SL列から直近2組を読み取り |
| **rateManager.gs** | getCurrencyStrengthHistory_ | ダウ理論の出力フォーマットを変更 | SH/SLの実数値+日足/週足の2軸出力 |
| **rateManager.gs** | updateCurrencyStrengthSheet_ | ダウ理論結果を通貨強弱シートR-X列に書き込み | 新しいcalcDowTheory_の結果を書き込む（列は変更なし） |
| **rateManager.gs** | backfillCurrencyStrength | バックフィル時のダウ理論判定 | SH/SLベースに変更 |
| **geminiApi.gs** | analyzeMarketWithClaude_ | Claude分析プロンプト項目5 | 日足+週足SH/SLの2軸出力に変更 |
| **learningManager.gs** | extractPostInsights_ | 仮説生成の例文 | SH/SL値を含む例文に更新 |
| **learningManager.gs** | verifyPreviousHypothesis_ | 仮説検証の例文 | SH/SL値を含む例文に更新 |
| **applyPairColors.gs** | applyDailyRateColors_ | 日次レートの色設定が30列分だけ | SH/SL列にも色設定を追加 |

### 6-3. 要注意: forceRebuildDailyRates

```
forceRebuildDailyRatesは日次レートを全削除→30列で再書き込みする。
SH/SL列（31〜44列目）は書き込み範囲外のため上書きされないが、
行数が変わると既存のSH/SLデータと日付がズレる可能性がある。

対策:
  forceRebuildDailyRates実行後に必ずbackfillSwingHighLow()を自動呼び出し。
  「再構築→SH/SLバックフィル」をセットで実行する。
  forceRebuildDailyRatesの末尾にbackfillSwingHighLow()呼び出しを追加。
```

### 6-4. 要注意: 既存の読み込みパターン

```
全既存コードの日次レート読み込みは以下の2パターン:

  パターンA: getRange(row, 1, count, 1 + CURRENCY_PAIRS.length * 4 + 1)  → 30列読み
  パターンB: getRange(row, 1, count, 1 + 7 * 4 + 1)                      → 30列読み

SH/SL列（31〜44列目）は読み込み範囲外。
→ 既存コードは一切変更不要（壊れない）
```

---

## 7. 仮説・学びへの連携（詳細）

### 7-1. データの流れ

```
【蓄積】
  aggregateDailyRates（毎日）
    → 日次レートにOHLC書き込み
    → 4日前のSH/SLを判定して書き込み
    → 月曜なら前週の週足を作成+週足SH/SLも判定

  updateCurrencyStrengthSheet_（毎時）
    → calcDowTheory_（SH/SLベース）を呼び出し
    → 結果を通貨強弱シートR-X列に書き込み

【読み取り → 投稿】
  getCurrencyStrengthHistory_（Claude市場分析+仮説生成+仮説検証から呼ばれる）
    → 通貨強弱シートR-X列を読み取り
    → ダウ理論セクションを出力

  getDowTheorySummary_（★新規。Claude市場分析から呼ばれる）
    → 日次レートシートのSH/SL列から直近2組を読み取り
    → 週足シートのSH/SL列から直近2組を読み取り
    → SH/SLの実数値を含む詳細フォーマットを出力
```

### 7-2. learningManager.gsへの影響

```
【extractPostInsights_（仮説生成）】
  現在: getCurrencyStrengthHistory_を呼び出し → ダウ理論テキストが含まれる
  変更後: 同じ関数を呼ぶが、出力にSH/SL実数値が含まれるようになる
  → learningManager.gsのコード変更は例文テキストの更新のみ

  旧例文:
    「EUR3日連続最強+ダウ理論上昇トレンド → EUR/USD 1.16台へ続伸」
  新例文:
    「EUR3日連続最強+日足SH切上(1.1520→1.1580)+週足も上昇 → EUR/USD 1.16台へ続伸。
     週足SL 1.1380が下値サポート」

【verifyPreviousHypothesis_（仮説検証）】
  現在: getCurrencyStrengthHistory_を呼び出し → ダウ理論テキストが含まれる
  変更後: 同じ関数を呼ぶが、出力にSH/SL実数値が含まれるようになる
  → learningManager.gsのコード変更は例文テキストの更新のみ

  旧例文:
    「仮説「ドル高」→ USDの強弱スコアが上昇+USD/JPYダウ理論が上昇トレンドなら追加根拠」
  新例文:
    「仮説「ドル高」→ USD強弱+0.3%に回復+日足SH切上(159.20→160.50)+週足も上昇なら強い追加根拠。
     ただし週足SH(161.20)を超えなければ本格転換とは言えない」
```

### 7-3. 投稿品質への影響

```
【改善される点】
  - 仮説に具体的な価格水準が入る（「SH 160.50を超えたら上昇トレンド転換」）
  - 検証が客観的になる（「SH/SLの並びが変わったか」で判定）
  - 日足と週足の矛盾を検出できる（「日足上昇だが週足はレンジ→過信注意」）

【注意点】
  - SH/SLの数値をそのまま投稿に書く必要はない
  - あくまでClaude分析と仮説の「裏の根拠」として使う
  - 投稿タイプによる使い分け:
    MORNING/NY/WEEKLY_HYPOTHESIS: 仮説の根拠としてフル活用
    TOKYO/LUNCH: 概要のみ（「日足は上昇トレンド継続中」程度）
    RULE/KNOWLEDGE: 使わない
```

---

## 8. Claude市場分析への注入

### 8-1. 注入フォーマット

```
【ダウ理論（日足 SH/SL・前後4日確定）】
USD/JPY: 上昇トレンド（SH: 159.20→160.85↑ / SL: 157.30→158.10↑）
EUR/USD: 下降トレンド（SH: 1.1580→1.1520↓ / SL: 1.1430→1.1380↓）
GBP/USD: レンジ（SH: 1.3350→1.3280↓ / SL: 1.3150→1.3200↑）
EUR/JPY: 上昇トレンド（SH: 184.50→185.20↑ / SL: 183.10→183.80↑）
GBP/JPY: 転換↓（前回SL 210.30を終値が下回り）
AUD/JPY: 上昇トレンド（SH: 109.80→110.50↑ / SL: 108.90→109.40↑）
AUD/USD: データ不足（SHが1個のみ）

【ダウ理論（週足 SH/SL・前後4週確定）】
USD/JPY: レンジ（SH: 161.20→160.50↓ / SL: 156.80→158.90↑）
EUR/USD: 上昇トレンド（SH: 1.1450→1.1580↑ / SL: 1.1280→1.1380↑）
...
```

### 8-2. 注入先

```
geminiApi.gsのanalyzeMarketWithClaude_内:
  getCurrencyStrengthHistory_（通貨強弱+勢い）
  + getDowTheorySummary_（★新規: 日足/週足SH/SLの詳細）

Claude分析プロンプトの項目5を変更:
  旧: 「5. ダウ理論との整合: 短期の勢いと中期トレンドが一致か矛盾か」
  新: 「5. ダウ理論との整合:
       日足SH/SLトレンドと週足SH/SLトレンドが一致しているか。
       通貨強弱の勢いと日足トレンドが矛盾していないか。
       週足が日足と逆方向の場合は特に注意して言及せよ。」
```

### 8-3. 通貨強弱シートR-X列との関係

```
通貨強弱シートのR-X列（ダウ理論）は維持。
calcDowTheory_の中身がSH/SLベースに変わるだけで、出力形式は同じ:
  「上昇トレンド」「下降トレンド」「レンジ」「転換↓」「転換↑」「データ不足」

getCurrencyStrengthHistory_のダウ理論セクションも出力形式は同じ。
→ learningManager.gsは例文テキスト更新のみでOK。コード構造の変更なし。

詳細なSH/SL数値はgetDowTheorySummary_（新規関数）が別途出力。
→ 責務分離: 簡易版（通貨強弱シート経由）と詳細版（日次レート直読み）
```

---

## 9. 実装計画

### 9-1. 変更ファイルと変更量

| ファイル | 変更内容 | 変更量 |
|---------|---------|-------|
| config.gs | DAILY_RATE_COLS, WEEKLY_RATE_COLS定数追加 | +約40行 |
| priceSummary.gs | aggregateDailyRatesにSH/SL+週足追加。forceRebuild対策 | +約150行 |
| rateManager.gs | calcDowTheory_書き換え+getDowTheorySummary_新規+backfillSwingHighLow新規 | +約200行 / 既存80行書き換え |
| geminiApi.gs | Claude分析プロンプト項目5更新+getDowTheorySummary_呼び出し | +約10行 |
| learningManager.gs | 例文テキスト更新（2箇所） | 各3行変更 |
| applyPairColors.gs | SH/SL列+週足シートの色設定追加 | +約30行 |

### 9-2. 実装ステップ

```
Step 1: config.gsに列定義追加
  - DAILY_RATE_COLS, WEEKLY_RATE_COLS を追加
  - 既存コードは変更しない

Step 2: priceSummary.gs - 日次レートSH/SL判定
  - aggregateDailyRatesのヘッダー作成にSH/SL列を追加
  - aggregateDailyRates末尾にSH/SL判定ステップを追加
    → 4日前の行を対象に、前後4日のOHLCを参照してSH/SL判定
    → 該当すればSH/SL列に値を書き込み（該当しなければ空欄のまま）

Step 3: priceSummary.gs - 週足シート作成+更新
  - aggregateDailyRates内で、月曜なら前週の週足を計算して週足シートに追加
  - 週足のSH/SLも判定（前後4週のデータが揃った週のみ）

Step 4: rateManager.gs - calcDowTheory_書き換え
  - 日次レートシートのSH/SL列から直近2組を読み取り
  - 週足シートのSH/SL列から直近2組を読み取り
  - 両方の結果を返す
  - 通貨強弱シートR-X列への書き込みは出力形式そのまま

Step 5: rateManager.gs - getDowTheorySummary_新規
  - Claude市場分析に注入する詳細フォーマットテキストを生成
  - SHの数値（前回→最新）+ SLの数値（前回→最新）を含める
  - 日足+週足の2セクション

Step 6: rateManager.gs - backfillSwingHighLow新規
  - 既存1,341日分のOHLCに対してSH/SL判定を一括実行
  - 週足も過去52週分をバックフィル
  - GASエディタから手動で1回だけ実行

Step 7: geminiApi.gs - Claude分析プロンプト更新
  - getDowTheorySummary_を呼び出して注入
  - 項目5のテキスト更新

Step 8: learningManager.gs - 例文テキスト更新
  - extractPostInsights_: SH/SL値を含む仮説例
  - verifyPreviousHypothesis_: SH/SL値を含む検証例

Step 9: applyPairColors.gs - 色設定追加
  - 日次レートのSH/SL列に色設定
  - 週足シートの色設定

Step 10: forceRebuildDailyRates対策
  - forceRebuildDailyRatesの末尾にbackfillSwingHighLow()呼び出し追加
  - 再構築後にSH/SLが自動で再計算される

Step 11: 統合テスト
  - backfillSwingHighLow()を実行してSH/SLが正しく埋まることを確認
  - scheduledFetchRatesを実行して通貨強弱シートのダウ理論が更新されることを確認
  - testPro_MORNING()でClaude分析にSH/SLが表示されることを確認
  - 各ペアのSH/SLが実際のチャートと一致しているか目視検証
```

---

## 10. バックフィル手順

```
日足SH/SL:
  1. 日次レートの全行を読み込み（1,341日分）
  2. 先頭4日と末尾4日を除く各日について前後4日のOHLCを参照
  3. SH/SL条件を満たす日のみ値を書き込み
  4. 30列目（データ件数）の右に14列を書き込み

週足:
  1. 日次レートを週単位にグループ化（月曜基準）
  2. 各週のOHLCを算出
  3. 先頭4週と末尾4週を除く各週について前後4週のSH/SL判定
  4. 週足シートに書き込み

注意:
  - バックフィルはGAS 6分制限に注意。1,341日の読み込み+SH/SL判定は
    計算自体は軽量（ループのみ、API呼び出しなし）なので余裕あり
  - forceRebuildDailyRates実行後は必ずbackfillSwingHighLow()も実行
```

---

## 11. 設計の鉄則

```
- SH/SLは前後4日で確定。最新のSH/SLは常に4日前のもの
- SH/SLの値はシートに蓄積。毎回計算しない
- トレンド判定はSH/SLの「並び」で行う。列にはしない（毎回読み取って計算）
- 日足と週足は別シート。時間軸の混同を防ぐ
- Claude市場分析にはSH/SLの実数値を渡す。「上昇トレンド」だけでは根拠が見えない
- 週足は日足より信頼度が高い。矛盾する場合は週足優先と明記
- 列定義はconfig.gsのDAILY_RATE_COLSで管理。ハードコードしない（新規コードのみ）
- 既存コードの読み込み範囲（30列）は変更しない（リスク最小化）
- forceRebuildDailyRates後は必ずSH/SLバックフィルを実行
```

---

## 12. 未決事項

```
1. 通貨強弱シートR-X列のフォーマット
   → 出力文字列は変更なし（「上昇トレンド」等そのまま）。calcDowTheory_の中身だけ変わる
   → 解決済み

2. 週足更新タイミング
   → 月曜のaggregateDailyRates実行時に前週分を追加
   → MORNING投稿前に最新データが揃う
   → 解決済み

3. SH/SLが長期間出現しない場合の扱い
   → 「SH/SL未検出」として「方向感なし」を出力
   → getDowTheorySummary_にフォールバック処理を入れる

4. SH/SLの等価（同値）の扱い
   → High[i] = High[i+1]の場合はSHとしない（厳密な「より高い」のみ）
   → SL同様
```

---

*作成日: 2026-04-07 | v1.1（既存影響分析完了・列定義関数化・仮説/学び連携詳細化）*
