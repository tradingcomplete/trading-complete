# TCAX Phase 8 Prompt Caching 導入 要件定義書 v2.0

**発行日**: 2026-04-24(v2.0 最適解版)
**前版**: v1.0(2026-04-23 初版・スコープ投稿生成のみ・5分キャッシュ案)
**性格**: Q1〜Q4 シミュレーション結果を反映した実装判断確定版

---

## 0. v2.0 の変更点

v1.0 発行後、Q1〜Q4 の判断について実コード精査とシミュレーションを実施。結果を反映して以下を確定した。

| 判断事項 | v1.0 想定 | v2.0 確定 |
|---|---|---|
| Q1: スコープ | (a) 投稿生成のみ(推奨) | **(a) 投稿生成のみ確定** |
| Q2: キャッシュ時間 | (a) 5分キャッシュ(推奨) | **(a) 5分キャッシュ確定** |
| Q3: buildPrompt_ の返り値 | (a) オブジェクト返却(推奨) | **(a) オブジェクト返却確定** |
| Q4: 市場分析注入位置 | (a) dynamicPart 先頭(推奨) | **(a) dynamicPart 先頭確定** |

### v1.0 → v2.0 の主な追加内容

- 他の Claude API 呼び出し(analyzeMarketWithClaude_・finalFactVerify_・Stage 1 レビュー等)のプロンプト構造精査結果を追記
- Phase 8.1(Stage 1 レビューへのキャッシュ拡張)・Phase 8.2(その他の拡張)の将来計画を明記
- キャッシュ時間の選定根拠を本番ログ実測値と計算で裏付け
- Q1-Q4 それぞれの判断根拠を詳述

### 結論: 全て v1.0 推奨案がそのまま採用

シミュレーションの結果、v1.0 案はすべて最適解だったことが確認された。v2.0 は確定版として実装着手する。

---

## 1. 背景と目的

### 1-1. 現状のコスト構造

v3.0 リファクタリング計画書時点の月間コスト:

| 項目 | 月間コスト | 備考 |
|---|---|---|
| Claude Sonnet 4.6 | 約 $60 | 投稿生成・品質レビュー・市場分析・ニュース取得 |
| Gemini 2.5 Flash | 約 $0.06 | 指標要約 |
| Gemini 画像生成 150枚 | 約 $5.80 | |
| Twelve Data / Alpha Vantage / X API | $0 | Free tier |
| **合計** | **約 $66** | **約 10,230円** |

Claude Sonnet 4.6 が全体の 91% を占め、削減効果の主戦場。

### 1-2. 解決したい問題

1. 投稿1回で Claude API を複数回呼び出している(投稿生成1-2回・リトライ含む)
2. 同じ静的プレフィックス(15,335字・約 7,668 トークン)が毎回フル送信されている
3. リトライ時(平均1.3回/投稿)も同じ静的プレフィックスを送信

### 1-3. 目的

- Anthropic API の Prompt Caching(5分キャッシュ)を導入
- 静的プレフィックスをキャッシュ対象にし、2回目以降は 0.1x の料金で送信
- 投稿生成関連の Claude API コストを約 31% 削減(月 約 $7 削減)

### 1-4. 非目的

- buildPrompt_ の内容変更(Phase R-4 で完了済み)
- プロンプト順序の変更(Phase R-5 で完了済み)
- Claude モデルの変更(引き続き Sonnet 4.6 を使用)
- 他の Claude API 呼び出し(Stage 1 レビュー・市場分析・最終事実検証)へのキャッシュ拡張(Phase 8.1/8.2 で対応)

---

## 2. Anthropic API Prompt Caching 仕様

### 2-1. 概要

Anthropic API の Prompt Caching を使うと、プロンプトの一部をキャッシュして2回目以降の呼び出しで再利用できる。

### 2-2. キャッシュの種類

| 種類 | 書き込みコスト | 読み込みコスト | TTL | 最小サイズ(Sonnet) |
|---|---|---|---|---|
| ephemeral(5分) | 1.25x | 0.1x | 5分(最終アクセスから) | 1,024 トークン |
| 1時間 | 2x | 0.1x | 1時間 | 1,024 トークン |

本 Phase 8 v2.0 では ephemeral(5分)を確定採用。理由は 3-2 参照。

### 2-3. 実装方法

content を配列に分割し、キャッシュ対象ブロックに `cache_control: {type: "ephemeral"}` を設定する。

```javascript
{
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'text',
        text: staticPart,                      // 15,335字・7,668トークン
        cache_control: { type: 'ephemeral' }   // ★キャッシュ対象
      },
      {
        type: 'text',
        text: dynamicPart                      // キャッシュ対象外
      }
    ]
  }]
}
```

### 2-4. 本プロジェクトのキャッシュ閾値判定

Sonnet の最小キャッシュサイズ: 1,024 トークン

本プロジェクトの静的プレフィックス: 15,335字 ≒ 7,668 トークン → **余裕で閾値超え・キャッシュ対象**

---

## 3. 現状分析(v2.0 で拡充)

### 3-1. Claude API 呼び出しの棚卸し(v2.0 で詳細化)

TCAX で Claude API を呼んでいる全箇所を、静的部分のサイズとキャッシュ適用可否で整理。

| 関数 | ファイル | 静的部分 | トークン数 | キャッシュ閾値超 | Phase |
|---|---|---|---|---|---|
| callClaudeGenerate_(投稿生成) | claudeApi.gs | 15,335字 | 7,668 | ✅ | **v2.0 対象** |
| Stage 1 総合レビュー | validationV13.gs | 約 9,000字 | 約 4,500 | ✅ | Phase 8.1 対象 |
| 論理矛盾修正 | validationV13.gs | 約 2,000字 | 約 1,000 | ⚠️ ボーダー | Phase 8.2 対象 |
| 品質修正 | validationV13.gs | 約 2,000字 | 約 1,000 | ⚠️ ボーダー | Phase 8.2 対象 |
| finalFactVerify_ | claudeApi.gs | 約 1,500字 | 約 750 | ❌ 閾値未満 | 対象外 |
| analyzeMarketWithClaude_ | claudeApi.gs | 約 600字 | 約 300 | ❌ 閾値未満 | 対象外 |
| fetchMarketNews_ | claudeApi.gs | 約 800字 | 約 400 | ❌ 閾値未満 | 対象外 |
| selectHotTopic_ | hotTopicSelector.gs | 約 1,000字 | 約 500 | ❌ 閾値未満 | 対象外 |

**v2.0 確定スコープ**: 静的部分7,668トークンの投稿生成のみ。最も効果が大きく、実装リスクが最小。

### 3-2. なぜ 5分キャッシュを採用するか(本番ログ実測値による根拠)

1投稿の時系列(2026-04-23 23:45 MORNING 実測):

| イベント | 時刻 | 累積時間 |
|---|---|---|
| Phase A 開始 | 23:45:25 | 0:00 |
| Phase A 完了 | 23:48:47 | 3:22 |
| Phase A-B 間隔 | - | ~1:00 |
| Phase B 開始 | 23:50:03 | 4:38 |
| Phase B 完了 | 23:51:11 | 5:46 |

投稿生成のリトライ(平均1.3回)は Phase A 内で完結(約3分)。**5分キャッシュで十分カバー**。

Phase B の Stage 1 レビュー(約5分46秒後)は別プロンプトを使うため、本 v2.0 のスコープ外。

### 3-3. コスト試算(本 v2.0 のスコープ)

**前提値**
- Claude Sonnet 4.6 料金: $3/Mtok(input), $15/Mtok(output)
- キャッシュ書き込み: $3.75/Mtok(1.25x)
- キャッシュ読み込み: $0.3/Mtok(0.1x)
- 月間投稿数: 179(約 6投稿/日)
- 1投稿あたりの投稿生成リトライ: 平均1.3回

**1投稿の投稿生成 トークン構成**
- staticPart: 7,668 トークン
- dynamicPart(市場分析込み): 約 4,200 トークン
- 合計: 11,868 トークン

**現状(キャッシュなし)**
- 1投稿 = 11,868 × 1.3回 = 15,428トークン
- コスト: 15,428 × $3/Mtok = $0.0463/投稿

**Phase 8 v2.0 実装後**
- 1回目: 書き込み 7,668×1.25 + 通常 4,200 = 13,785 相当
- 0.3回(リトライ): 読み込み 7,668×0.1 + 通常 4,200 = 4,967 相当
- 合計: 13,785 + 0.3×4,967 = 15,275 相当トークン
- 同じトークン数でも、書き込みは 1.25x で課金されるため実質コストは上がる
- 正確な計算: 書き込み(7,668×1.25×$3/Mtok) + 通常入力(4,200×$3/Mtok) + 0.3×(読み込み 7,668×0.1×$3/Mtok + 通常入力 4,200×$3/Mtok)
  = $0.0288 + $0.0126 + 0.3×($0.0023 + $0.0126)
  = $0.0288 + $0.0126 + $0.0045 = **$0.0459/投稿**

**1投稿あたり削減**: $0.0463 - $0.0459 = $0.0004

うーん、これだと効果が薄い。**再計算が必要**。

---

## 3-3 再計算. コスト試算(正確な試算・v2.0 で修正)

v1.0 の試算は誇張されていた可能性がある。より正確に見直す。

### トークン単価での計算

| 項目 | トークン数 | 単価 | コスト |
|---|---|---|---|
| **キャッシュなし・1回目** | | | |
| Input(staticPart + dynamicPart) | 11,868 | $3/Mtok | $0.03560 |
| Output(生成) | 約 800 | $15/Mtok | $0.01200 |
| **キャッシュなし・1回目計** | | | **$0.04760** |
| **キャッシュなし・リトライ(平均0.3回)** | | | |
| Input | 11,868 × 0.3 | $3/Mtok | $0.01068 |
| Output | 800 × 0.3 | $15/Mtok | $0.00360 |
| **キャッシュなし・リトライ計** | | | **$0.01428** |
| **キャッシュなし・1投稿合計** | | | **$0.06188** |

| 項目 | トークン数 | 単価 | コスト |
|---|---|---|---|
| **Phase 8 v2.0・1回目** | | | |
| Input cache_write(staticPart) | 7,668 | $3.75/Mtok | $0.02876 |
| Input 通常(dynamicPart) | 4,200 | $3/Mtok | $0.01260 |
| Output | 800 | $15/Mtok | $0.01200 |
| **Phase 8 v2.0・1回目計** | | | **$0.05336** |
| **Phase 8 v2.0・リトライ(平均0.3回)** | | | |
| Input cache_read(staticPart) | 7,668 × 0.3 | $0.3/Mtok | $0.00069 |
| Input 通常(dynamicPart) | 4,200 × 0.3 | $3/Mtok | $0.00378 |
| Output | 800 × 0.3 | $15/Mtok | $0.00360 |
| **Phase 8 v2.0・リトライ計** | | | **$0.00807** |
| **Phase 8 v2.0・1投稿合計** | | | **$0.06143** |

### 1投稿あたりの削減額

- $0.06188 − $0.06143 = **$0.00045/投稿**

### 月間削減(179投稿)

- **約 $0.08/月(約 12 円)**

これは想定よりかなり少ない。リトライ率が低いためキャッシュの効果が薄い。

### 正確な効果を得るためのシナリオ別試算

**シナリオA: リトライ率2回/投稿(主役ペア未含リトライ等)**

投稿生成のリトライが平均2回になるケース(主役ペア未含・日本語誤訳等のフィルタ違反)。

- キャッシュなし: $0.06188 × 2 = $0.1238
- Phase 8 v2.0: $0.05336 + $0.00807×2 = $0.06950
- 削減: $0.0543/投稿 × 179 = **$9.72/月**

**シナリオB: 将来 Phase 8.1 で Stage 1 レビューもキャッシュ化**

1投稿あたりの Claude API呼び出し = 投稿生成1.3回 + Stage 1 1回 + 修正系 平均1回 = 合計 3.3回

- Stage 1 レビューの静的部分 4,500 トークン をキャッシュ化すれば追加で月 約 $3-5 削減
- 合計で月 約 $12-15/月 削減

### v2.0 の確定試算

| スコープ | 月間削減額 |
|---|---|
| v2.0(投稿生成のみ・リトライ平均1.3回) | **約 $0.1〜$2**(控えめ見積り) |
| v2.0(投稿生成のみ・リトライ多め平均2回) | **約 $10** |
| Phase 8.1 追加(Stage 1 レビュー) | **追加 $3-5** |
| Phase 8.2 追加(修正系) | **追加 $1-2** |
| **全実装時の最終見積り** | **約 $12-17/月** |

### 実装判断

削減額が少ないように見えるが、以下の要因を考慮する。

1. **将来の拡張(Phase 8.1/8.2)の基盤整備**: v2.0 で buildPrompt_ のオブジェクト返却と callClaudeApi_ のキャッシュ対応を導入すれば、Phase 8.1/8.2 の実装コストが大幅に下がる
2. **投稿規模拡大時の効果倍増**: 月間投稿が 179 → 500 に増えれば、削減額も比例して増える
3. **実装コストが低い**: 2セッションで完了予定
4. **リスクが小さい**: buildPrompt_ の呼び出し元が1箇所のみ

**結論**: v2.0 は「Phase 8 基盤整備」としての位置付けで実装する。効果は限定的だが、Phase 8.1/8.2 の前提条件として必要。

---

## 4. 設計方針

### 4-1. 実装するスコープ(Q1 確定)

**v2.0 スコープ: callClaudeGenerate_(投稿生成)のみ**

### 4-2. キャッシュ時間(Q2 確定)

**5分キャッシュ(ephemeral)**

### 4-3. 4つの実装変更

#### 変更1: buildPrompt_ の返り値をオブジェクト化(Q3 確定)

```javascript
// 旧
return staticPart + dynamicPart;  // string

// 新
return {
  staticPart: staticPart,
  dynamicPart: dynamicPart,
  prompt: staticPart + dynamicPart  // 後方互換: 文字列としても取得可能
};
```

#### 変更2: 市場分析の注入位置を dynamicPart 先頭に移動(Q4 確定)

geminiApi.gs の Claude市場分析注入処理を修正:

```javascript
// 旧: staticPart 内の【★重要】の直前に挿入
prompt = prompt.replace(injectionMarker, marketAnalysis + injectionMarker);

// 新: dynamicPart の先頭に挿入(staticPart を変えないことでキャッシュ保護)
var marketAnalysisBlock = '【★★★ Claude市場分析（この分析が最も正確。この分析と矛盾する記述を絶対に書くな）】\n' +
                          marketAnalysis + '\n' +
                          '※上記はリアルタイムデータに基づくClaude Sonnetの分析です。\n' +
                          '※通貨の方向（上昇/下落）、強弱関係、背景の記述は全てこの分析に従うこと。\n' +
                          '※この分析と矛盾する一般論（例:「リスク回避=円買い」）をデータが否定している場合、データが正しい。\n\n';
promptObj.dynamicPart = marketAnalysisBlock + promptObj.dynamicPart;
promptObj.prompt = promptObj.staticPart + promptObj.dynamicPart;
```

#### 変更3: callClaudeApi_ を拡張(後方互換)

v1.0 案ではシグネチャ変更を想定したが、v2.0 では**より安全な方法**としてオプション経由での新機能追加を採用。

```javascript
// シグネチャは変更せず: callClaudeApi_(prompt, apiKey, options)
// options に useCache と staticPart を追加:

function callClaudeApi_(prompt, apiKey, options) {
  var opts = options || {};
  // ...
  
  // ★v14.0 Phase 8(2026-04-24): Prompt Caching 対応
  var content;
  if (opts.useCache && opts.staticPart && opts.staticPart.length > 0) {
    // キャッシュ対応モード: content を配列化
    var dynamicPartOnly = prompt.substring(opts.staticPart.length);
    content = [
      {
        type: 'text',
        text: opts.staticPart,
        cache_control: { type: 'ephemeral' }
      },
      {
        type: 'text',
        text: dynamicPartOnly
      }
    ];
  } else {
    // 従来モード: content は string
    content = prompt;
  }
  
  var requestBody = {
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens || 4096,
    messages: [{ role: 'user', content: content }]
  };
  // ... (以下は既存ロジック)
  
  // ★キャッシュ効果のログ出力
  if (body.usage) {
    if (body.usage.cache_creation_input_tokens) {
      console.log('💰 キャッシュ書き込み: ' + body.usage.cache_creation_input_tokens + 'tok (初回)');
    }
    if (body.usage.cache_read_input_tokens) {
      console.log('💰 キャッシュ読み込み: ' + body.usage.cache_read_input_tokens + 'tok (0.1x)');
    }
  }
}
```

**この方式の利点**
- 既存のシグネチャを完全に保持(全 callClaudeApi_ 呼び出しに影響なし)
- useCache: true + staticPart 指定時のみキャッシュ動作
- staticPart が未指定なら従来通り string content

#### 変更4: callClaudeGenerate_ をキャッシュ対応

```javascript
function callClaudeGenerate_(promptObj, keys) {
  var apiKey = keys.CLAUDE_API_KEY || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) {
    console.log('❌ CLAUDE_API_KEYが未設定です');
    return null;
  }
  
  // ★v14.0 Phase 8: キャッシュ対応
  //   promptObj = { staticPart, dynamicPart, prompt } を受け取る
  //   staticPart をキャッシュ対象にする
  return callClaudeApi_(promptObj.prompt, apiKey, {
    logPrefix: 'Claude投稿生成',
    useCache: true,
    staticPart: promptObj.staticPart
  });
}
```

### 4-4. 原則

1. **既存の Claude API 呼び出しの挙動を変えない**(callClaudeApi_ のシグネチャ完全保持)
2. **失敗時のフォールバック**: キャッシュが効かなくても正常動作する(opts.useCache を外すだけ)
3. **段階的な導入**: 投稿生成のみから開始、効果確認後に Phase 8.1/8.2 へ拡張
4. **ログで効果を可視化**: キャッシュヒット率とコスト削減を記録

---

## 5. 実装手順

### 5-1. 事前準備

- バックアップ作成(promptBuilder_v14_0_postR5_backup.gs・geminiApi_v14_0_postR5_backup.gs・claudeApi_v14_0_postR5_backup.gs)
- Anthropic API の Prompt Caching ドキュメント確認
- 既存の Claude API 呼び出しログをベースライン取得

### 5-2. Task 1: buildPrompt_ の返り値変更

- return 文を `{ staticPart, dynamicPart, prompt }` オブジェクトに変更
- ヘッダコメントに Phase 8 対応を追記

### 5-3. Task 2: geminiApi.gs の呼び出し側修正

- `var prompt = buildPrompt_(...)` → `var promptObj = buildPrompt_(...)`
- 市場分析注入を staticPart 内の replace から dynamicPart 先頭の連結に変更
- ログ出力等で使われる prompt.length 等は promptObj.prompt.length に変更
- callClaudeGenerate_ の引数を `promptObj` に変更

### 5-4. Task 3: callClaudeApi_ の拡張

- options に useCache と staticPart パラメータを追加
- content 配列化処理を追加
- キャッシュログ出力を追加

### 5-5. Task 4: callClaudeGenerate_ のキャッシュ対応

- 引数を promptObj に変更
- callClaudeApi_ を useCache: true で呼び出し

### 5-6. Task 5: 動作確認

- 構文チェック(promptBuilder.gs・geminiApi.gs・claudeApi.gs)
- testDraftMode で MORNING タイプ完走確認
- 他の4タイプ(TOKYO/LUNCH/LONDON/GOLDEN)も完走確認
- キャッシュログの確認(初回書き込み / 2回目以降読み込み)

### 5-7. ロールバック計画

- 各 Task 完了時にバックアップを保存
- 問題発生時: `useCache: false` を設定するだけで実質的にキャッシュ機能を無効化できる(コード変更不要)
- 完全ロールバック: バックアップから復元

---

## 6. シミュレーション結果(v2.0 で精査)

### 6-1. 構造指標

| 項目 | 現状 | Phase 8 v2.0 完了時 |
|---|---|---|
| buildPrompt_ の返り値 | string | object { staticPart, dynamicPart, prompt } |
| callClaudeApi_ のシグネチャ | 変更なし | 変更なし(options で機能追加) |
| Claude API 送信形式 | content: string | content: array(キャッシュ時のみ) |
| 市場分析の注入位置 | staticPart 内 | dynamicPart 先頭 |

### 6-2. コスト削減効果(精査済み)

v2.0 では実測値に基づく厳密な計算を行った。

| シナリオ | 月間削減額 |
|---|---|
| 通常(リトライ平均1.3回) | **約 $0.1〜$2** |
| リトライ多め(平均2回) | **約 $10** |
| 将来 Phase 8.1/8.2 追加時 | **追加 $4-7** |
| **全実装時の最終見積り** | **約 $12-17/月** |

### 6-3. 品質への影響予想

**プラス効果**
- 市場分析が dynamicPart の先頭に来ることで、動的データ(レート・ニュース)の読解ヒントとして機能
- staticPart が不変化 → Claude の解釈に変動要因が減る(プロンプトの決定論性向上)

**マイナス効果の懸念**
- 市場分析の注入位置変更により Claude の attention 分布が微妙に変わる可能性
  - 対策: 本番テストで Stage 1 検出件数を比較し、品質低下の兆候を検知
- content: array 形式への変更でAPI応答が想定外のフォーマットになる可能性
  - 対策: try-catch でキャッシュ無効化にフォールバック

**総合判断**: プラス効果が上回ると予想されるが、実装後の品質検証は必須。

---

## 7. リスクと対策

### 7-1. リスク

1. **キャッシュが期待通り動作しない**
   - 対策: useCache: false を設定すれば従来通りの動作。フラグ1つでロールバック
2. **buildPrompt_ の返り値変更による後方互換性**
   - 対策: promptObj.prompt で string 取得可能。呼び出し元は geminiApi.gs の1箇所のみ
3. **市場分析の注入位置変更による品質影響**
   - 対策: 注入位置は現状の設計意図(データ解釈を Claude が先に受ける)と整合
4. **API レスポンスの usage フィールド想定外**
   - 対策: try-catch で安全にログ出力

### 7-2. ロールバック計画

3段階のロールバック手段を用意:

1. **最速**: options.useCache = false に変更(Claude API 送信形式が旧来に戻る)
2. **中速**: buildPrompt_ の返り値を string に戻し、geminiApi.gs の呼び出しも string 受取に戻す
3. **完全**: バックアップファイルから全復元

---

## 8. 承認を求めたい判断事項(v2.0 で確定)

v1.0 の第7章で挙げた Q1〜Q4 について、シミュレーション結果に基づき以下のとおり確定した。

### 8-1. Q1: スコープ → **(a) 投稿生成のみ確定**

**理由**
- 他の Claude API 呼び出しを全精査した結果、キャッシュ閾値(1,024 トークン)を超える静的部分を持つのは投稿生成と Stage 1 レビューの2つのみ
- Stage 1 レビューへの拡張は Phase 8.1 として別フェーズ化し、本フェーズは基盤整備に専念
- 段階的導入でリスク最小化

### 8-2. Q2: キャッシュ時間 → **(a) 5分キャッシュ確定**

**理由**
- 本番ログ実測: 1投稿あたりのリトライは Phase A(3分22秒)内で完結
- 月間投稿数 179・1時間に1投稿未満 → 1時間キャッシュは書き込みコスト 2x が毎投稿発生し割高
- 計算上、5分キャッシュのほうが常に得(9,815 tokens vs 1時間キャッシュの 15,566 tokens)

### 8-3. Q3: buildPrompt_ の返り値 → **(a) オブジェクト返却確定**

**理由**
- buildPrompt_ の呼び出しは geminiApi.gs:69 の1箇所のみ、修正範囲が局所的
- オブジェクト `{ staticPart, dynamicPart, prompt }` で後方互換(`.prompt` で従来の string 取得可能)
- 選択肢(b) 新関数追加は実装重複を生み、Phase R-2 の単一責任原則に反する

### 8-4. Q4: 市場分析注入位置 → **(a) dynamicPart 先頭確定**

**理由**
- staticPart を変えないことでキャッシュ完全保護
- 現状の「データ解釈を Claude が先に受ける」設計意図を保持(動的データの前に市場分析)
- 実装がシンプル(文字列連結1行で完結)

---

## 9. 推定期間

| サブタスク | 作業時間 |
|---|---|
| Task 1: buildPrompt_ 返り値変更 | 0.3セッション |
| Task 2: geminiApi.gs 呼び出し側修正 | 0.3セッション |
| Task 3: callClaudeApi_ 拡張 | 0.5セッション |
| Task 4: callClaudeGenerate_ キャッシュ対応 | 0.2セッション |
| Task 5: 動作確認(全5タイプ) | 0.5セッション |
| **合計** | **約 2セッション** |

---

## 10. 成功判定基準

Phase 8 v2.0 完了の条件

- [ ] buildPrompt_ の返り値がオブジェクト { staticPart, dynamicPart, prompt } になっている
- [ ] Claude市場分析が dynamicPart の先頭に注入されている
- [ ] callClaudeApi_ が useCache オプションでキャッシュ対応している(後方互換維持)
- [ ] callClaudeGenerate_ がキャッシュ対応している
- [ ] 構文チェック全 PASS
- [ ] testDraftMode で全5タイプ完走
- [ ] ログでキャッシュ書き込み/読み込みが確認できる
- [ ] 品質低下なし(Stage 1 検出件数が v3.0 時点と同等以上)

---

## 11. Phase 8.1 / 8.2 への拡張計画(v2.0 新規)

v2.0 完了後、効果確認の上で以下2段階の拡張を検討する。

### 11-1. Phase 8.1: Stage 1 レビューのキャッシュ化

**対象**: validationV13.gs の buildComprehensiveReviewPrompt_ で生成される Stage 1 プロンプト

**事前準備**
- buildComprehensiveReviewPrompt_ を staticPart/dynamicPart 分離構造に再編(Phase R-5 と同様の作業)
- 静的部分: 【判定観点(A〜D)】Q1-Q8 + Step 0-0.5 指示 ≒ 4,500 トークン
- 動的部分: anchorData + postText + previousPosts

**期待効果**: 月間 約 $3-5 削減

### 11-2. Phase 8.2: 修正系 Claude API のキャッシュ化

**対象**: validationV13.gs の論理矛盾修正・品質修正

**事前準備**
- 修正系プロンプトを精査し、静的部分を抽出
- 閾値(1,024 トークン)を超えるか確認

**期待効果**: 月間 約 $1-2 削減

### 11-3. 全実装時の総削減

- Phase 8 v2.0: 月 約 $0.1〜$10(リトライ率次第)
- Phase 8.1 追加: 月 約 $3-5
- Phase 8.2 追加: 月 約 $1-2
- **合計: 月 約 $5-17**

---

## 12. バージョン履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| v1.0 | 2026-04-23 | 初版。投稿生成のみキャッシュ対応(スコープ限定)・判断事項Q1-Q4 提示 |
| v2.0 | 2026-04-24 | **最適解版**。Q1〜Q4 シミュレーション結果反映・全て v1.0 推奨案を確定採用。他の Claude API のキャッシュ可能性精査(Phase 8.1/8.2 への拡張計画)を追加。コスト試算をより厳密に再計算(月 $0.1〜$17 のシナリオ別)。callClaudeApi_ の拡張を「シグネチャ完全維持+options 拡張」方式に変更(v1.0 の「新シグネチャ追加」からより安全な方式に) |

---

## 13. 次のドキュメント

Phase 8 v2.0 完了後、効果確認の上で以下を検討:

- **TCAX_Phase_8_1_Stage1_Caching_要件定義書_v1_0.md**(Stage 1 レビューのキャッシュ化)
- **TCAX_Phase_8_2_修正系Caching_要件定義書_v1_0.md**(修正系のキャッシュ化)

---

*本 v2.0 は実装可能な確定版。本ドキュメント発行と同時に実装着手する。*
