# T-CAX v12.5 コード品質改善 要件定義書 v1.1（精査版）

作成日: 2026-04-14
対象: v12.4の技術的負債解消（Issue 1-3のみ実装。Issue 4-5は記録のみ）

---

## 精査で判明した重要事実

### callGemini_ は削除しない

callGemini_ は11箇所で呼ばれており、全てGrounding依存（Google検索）が必要:

| ファイル | 行 | 用途 | Grounding |
|---------|---|------|-----------|
| factCheck.gs | 174 | ファクトチェック検出 | ON |
| indicatorManager.gs | 137 | 指標結果取得 | ON |
| indicatorManager.gs | 183 | 指標結果取得 | ON |
| learningManager.gs | 154 | 仮説検証 | OFF |
| learningManager.gs | 462 | 仮説検証 | OFF |
| learningManager.gs | 543 | 学び抽出 | OFF |
| learningManager.gs | 798 | 仮説サマリー | OFF |
| marketAnalysis.gs | 531 | ニュース取得 | ON |
| testFunctions.gs | 30,46 | テスト | ON |
| geminiApi.gs | 469 | executeRetry_ | 混在 |

→ callGemini_ 自体は温存。Claude化するのは executeRetry_ の1箇所のみ。

### factCheck.gs内のcallGemini_ 2箇所は削除される

factCheck.gs 590行と640行のcallGemini_呼び出しは、qualityCheckPost_（レガシー関数）の内部。
qualityCheckPost_ を丸ごと削除するため、自動的に消える。

---

## Issue 1: Claude API呼び出しコードの統合

### 3つの実装の差分（精査結果）

| 項目 | callClaudeGenerate_ | callClaude_ | callGemini_内fallback |
|------|---------------------|-------------|----------------------|
| ファイル | geminiApi.gs | qualityReview.gs | geminiApi.gs |
| 行範囲 | 653-729（77行） | 286-369（84行） | 797-844（48行） |
| 戻り値 | {text, raw} / null | string / null | {text, raw} / null |
| Web検索 | なし | あり（オプション） | なし |
| systemプロンプト | なし | Web検索時のみ | なし |
| MAX_RETRIES | 3 | 3 | 1（リトライなし） |
| textの結合 | join('') | join('\n') | join('') |
| APIキー取得 | keys引数 or ScriptProperties | 引数 | ScriptProperties |
| 特殊処理 | なし | なし | FLASH_FALLBACK_USED設定 |

### 設計: callClaudeApi_ の仕様

```javascript
/**
 * Claude API共通呼び出し関数
 * 
 * @param {string} prompt - プロンプト
 * @param {string} apiKey - Anthropic APIキー
 * @param {Object} [options] - オプション
 * @param {boolean} [options.useWebSearch=false] - Web検索ツール使用
 * @param {string} [options.systemPrompt=null] - systemプロンプト
 * @param {number} [options.maxRetries=3] - リトライ回数
 * @param {string} [options.logPrefix='Claude API'] - ログ表示名
 * @return {{ text: string, raw: Object }|null}
 */
function callClaudeApi_(prompt, apiKey, options) { ... }
```

### 各ラッパーの変更

**callClaudeGenerate_(prompt, keys):**
```javascript
// 変更前: 77行のClaude API呼び出しロジック
// 変更後: 5行のラッパー
function callClaudeGenerate_(prompt, keys) {
  var apiKey = keys.CLAUDE_API_KEY || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) { console.log('❌ CLAUDE_API_KEYが未設定です'); return null; }
  return callClaudeApi_(prompt, apiKey, { logPrefix: 'Claude投稿生成' });
}
```

**callClaude_(prompt, apiKey, useWebSearch):**
```javascript
// 変更前: 84行のClaude API呼び出しロジック
// 変更後: 10行のラッパー
function callClaude_(prompt, apiKey, useWebSearch) {
  var options = { logPrefix: 'Claude API' };
  if (useWebSearch) {
    options.useWebSearch = true;
    options.systemPrompt = 'You are a quality reviewer. You MUST respond with ONLY a valid JSON object...';
  }
  var result = callClaudeApi_(prompt, apiKey, options);
  return result ? result.text : null;  // 後方互換: string返却
}
```

**callGemini_内fallback:**
```javascript
// 変更前: 48行のClaude API呼び出しロジック
// 変更後: 10行
var claudeApiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
if (claudeApiKey) {
  console.log('🔄 Gemini Pro全滅 → Claude にフォールバック');
  var claudeResult = callClaudeApi_(prompt, claudeApiKey, { maxRetries: 1, logPrefix: 'Claudeフォールバック' });
  if (claudeResult) {
    PropertiesService.getScriptProperties().setProperty('FLASH_FALLBACK_USED', 'claude');
    return claudeResult;
  }
}
```

### 呼び出し元への影響: ゼロ

全てのラッパーが既存の関数シグネチャと戻り値を維持するため、
callClaudeGenerate_ / callClaude_ / callGemini_ を呼んでいる15箇所のコードは一切変更不要。

---

## Issue 2: qualityCheckPost_ レガシー関数の削除

### 削除範囲

factCheck.gs 520-678行目（159行）:
- 520-540行: コメントブロック（`★v8.6: 品質チェック` ヘッダー）
- 541-678行: qualityCheckPost_ 関数本体

### 呼び出し元の確認結果

```
grep -rn 'qualityCheckPost_' *.gs
→ factCheck.gs:541 のみ（定義のみ。呼び出しゼロ）
```

→ 安全に削除可能

### 変更後の行数

factCheck.gs: 690行 → 531行（-159行）

---

## Issue 3: executeRetry_ のClaude化

### 変更箇所（1行）

```javascript
// 旧（geminiApi.gs 469行目）
var retryResult = callGemini_(config.prompt, base.apiKey, config.useGrounding);

// 新
var retryResult = callClaudeGenerate_(config.prompt, getApiKeys());
```

### base.apiKey の扱い

現在の retryBase には `apiKey: keys.GEMINI_API_KEY` が入っている。
callClaudeGenerate_ は keys.CLAUDE_API_KEY を使うため、getApiKeys() を直接呼ぶ。
base.apiKey は executeRetry_ 以外では使われていないため、retryBase からの apiKey 削除は任意。

### config.useGrounding の扱い

callClaudeGenerate_ にはGrounding機能がないため、config.useGrounding は無視される。
4種のリトライ全てで、Groundingなしでも品質に影響しない（テキスト調整のみ）。

### コメント更新

```javascript
// 旧コメント
// 処理フロー: 経過時間チェック → Gemini API呼び出し → 後処理チェーン → TC言及除去 → 検証

// 新コメント  
// 処理フロー: 経過時間チェック → Claude API呼び出し → 後処理チェーン → TC言及除去 → 検証
// ★v12.5: Gemini→Claude化。メイン生成と同じモデルでリトライすることで口調・フォーマットの一貫性を確保
```

---

## Issue 4, 5（今回対象外）

### Issue 4: promptBuilder.gs の肥大化
→ コンテンツの取捨選択が必要。運用データ蓄積後に判断。

### Issue 5: 投稿タイプ16種の棚卸し
→ エンゲージメントデータに基づく判断が必要。

---

## 実装順序

| 順 | 作業 | ファイル | リスク |
|----|------|---------|--------|
| 1 | qualityCheckPost_ 削除 | factCheck.gs | 極低（死コード削除） |
| 2 | callClaudeApi_ 新設 + ラッパー化 | geminiApi.gs | 低（動作は同一） |
| 3 | callClaude_ ラッパー化 | qualityReview.gs | 低（動作は同一） |
| 4 | executeRetry_ Claude化 | geminiApi.gs | 低（既にClaude主導） |

---

## 変更対象ファイルの最終サマリー

| ファイル | 元行数 | 変更後行数 | 差分 |
|---------|--------|----------|------|
| factCheck.gs | 690 | 531 | -159 |
| geminiApi.gs | 866 | 約835 | 約-31 |
| qualityReview.gs | 551 | 約490 | 約-61 |
| **合計** | **2,107** | **約1,856** | **約-251** |

---

*v1.1（精査版） | 2026-04-14*
