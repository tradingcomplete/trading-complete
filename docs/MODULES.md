# MODULES.md - Trading Complete モジュール技術仕様書

## 🚨 HTMLテンプレート関数（100行以上）の実装ルール

1. **元コードを直接確認**（プロジェクトナレッジは参考程度）
2. **一字一句コピー**（書き直し禁止）
3. **グローバル参照にwindow.追加**
4. **スクリーンショット比較で確認**

該当: TradeList.render(), TradeDetail.render(), ReportModule.displayReport(), StatisticsModule更新系

---

## 標準モジュールパターン

```javascript
class XxxModule {
    #data = [];
    #eventBus = null;
    
    constructor() {
        this.#eventBus = window.eventBus;
        this.#load();
    }
    
    // Public API
    add(item) { /* validate → save → emit */ }
    get(id) { return this.#data.find(x => x.id === id); }
    getAll() { return [...this.#data]; }
    getStatus() { return { count: this.#data.length }; }
    
    // Private
    #load() { /* localStorage読込 */ }
    #save() { /* localStorage保存 */ }
}
window.XxxModule = new XxxModule();
```

**必須**: プライベートフィールド(#)、EventBus統合、getStatus()、UIは変更しない

---

## Part 2（トレード管理）- 完成

| モジュール | 責任 | 主要API |
|-----------|------|---------|
| TradeManager | データ管理 | getInstance(), addTrade(), getAllTrades() |
| TradeValidator | 検証 | validate(trade) |
| TradeCalculator | 計算 | calculatePips(), calculateRR() |
| TradeEntry | 新規保存 | saveTradeRecord(formData) |
| TradeList | 一覧表示 | render(trades) |
| TradeEdit | 編集 | edit(id), save() |
| TradeExit | 決済 | addExit(tradeId) |
| TradeDetail | 詳細表示 | show(trade) |
| bridge.js | 互換性層 | グローバル関数→モジュール橋渡し |

### YenProfitLossManager
- API: setYenProfitLoss(), getYenProfitLoss(), calculateTotal()
- データ: trade.yenProfitLoss = {profitLoss, swap, commission, netProfit}

### 感情記録（グローバル定数・関数）

TradeEntry.js の先頭で定義、window に公開:

| 定数/関数 | 説明 |
|----------|------|
| EMOTION_OPTIONS | 8感情カテゴリ定数（calm/confident/focused/cautious/rushed/anxious/excited/uncertain） |
| normalizeEmotion(raw) | 新旧形式の感情データを正規化。戻り値: { selection, memo } |
| toggleEmotion(btn) | 感情ボタンの単一選択トグル |
| getEmotionFromSelector(selectorId, memoId) | セレクターから選択状態を取得 |
| setEmotionToSelector(selectorId, memoId, data) | セレクターに既存データを反映 |

データ形式:
- 新形式: `{ selection: "calm", memo: "補足テキスト" }`
- 旧形式: `"冷静に分析できていた"`（プレーンテキスト、normalizeEmotionで変換）

バリデーション:
- 感情選択は **必須**（TradeEntry.js #validateTradeData / TradeEdit.js saveBasicInfo で検証）
- 未選択でのエントリー・編集保存は不可

---

## Part 3（相場ノート）- 完成 (2025-11-27)

**ファイル**: js/part3_modules/NoteManagerModule.js

### NoteManagerModule API

```javascript
// ノート基本操作
getAllNotes()                    // 全ノート取得
getNoteByDate(dateStr)           // 日付でノート取得
saveNote()                       // ノート保存
saveOrUpdateNote()               // 保存または更新
deleteNote(dateStr)              // 削除
loadNoteForDate(dateStr)         // UIに読み込み
selectNoteDate(dateStr)          // 日付選択

// 日付操作
setToday()                       // 今日に移動
changeDate(days)                 // 日付変更（◀▶）
changeWeek(direction)            // 週変更

// 週間プレビュー
initializeWeekView()             // 初期化
updateWeeklyPreview()            // 更新

// 検索機能
searchNotes(keyword)             // キーワード検索
openNoteSearchModal()            // 検索モーダル開く
closeNoteSearchModal()           // 閉じる
executeNoteSearch()              // 検索実行
jumpToNoteFromSearch(dateStr)    // 結果からジャンプ

// 月メモ機能
getCurrentMonthInfo()            // { month, year, yearMonth }
getAnomalyMemo(month)            // アノマリーメモ取得（1-12）
getMonthlyMemo(yearMonth)        // 月次メモ取得（YYYY-MM）
saveAnomalyMemo(month, text)     // アノマリー保存
saveMonthlyMemo(yearMonth, text) // 月次保存
toggleMonthlyMemoSection(type)   // 折りたたみ切替
openMonthlyMemoEditModal(type)   // 編集モーダル
saveMonthlyMemoFromModal()       // モーダルから保存

getStatus()                      // デバッグ用
```

### Private Methods（画像自動更新対応）

| メソッド | 説明 |
|---------|------|
| `#saveNoteToStorageAndCloud(dateStr, note)` | ノートをlocalStorageとSupabaseに保存（URL更新時用） |
| `#restoreImagesAsync(imageArray)` | 画像を非同期で復元（期限切れURL自動更新対応） |

### 変更メソッド（画像自動更新対応）

| メソッド | 変更内容 |
|---------|---------|
| `showNoteDetail()` | 画像を非同期表示、期限切れURL自動更新対応 |
| `restoreNoteImages()` | 非同期処理に変更、`#restoreImagesAsync`を呼び出し |

**EventBus**:
- `note:saved`, `note:selected`, `note:deleted`
- `monthlyMemo:anomalySaved`, `monthlyMemo:monthlySaved`

**データ永続化**:
| キー | 内容 |
|-----|------|
| `notes` | ノートデータ（日付キー） |
| `monthlyMemos` | { anomaly: {}, monthly: {} } |
| `monthlyMemoCollapseState` | 折りたたみ状態 |

**注意**:
- `#save()`内で`window.saveNotes()`を呼ばない（上書き防止）
- 日付変更は`selectNoteDate()`使用（週間プレビュー連動）

**詳細**: 相場ノート機能改善_要件定義書_v2_0.md

## Part 5（設定タブ）- 完成 (2025-11-26)

**ファイル**: js/part5/*.js (UI), js/part5_modules/*.js (モジュール)

### SettingsModule API
```javascript
// ブローカー（プリセット25社）
getPresetBrokers(), getAllBrokers(), getBrokerById(id), addBroker(), deleteBroker()

// お気に入り通貨ペア（最大10件）
getFavoritePairs(), addFavoritePair(), removeFavoritePair()

// プリセット通貨ペア（53ペア）
getPresetCurrencyPairs(), searchCurrencyPairs(query)

// サイト設定
getSiteName(), setSiteName(), getSubtitle(), setSubtitle()

// 許容損失設定（トレード分析強化 Phase 1）
getLossTolerance()                    // 許容損失設定を取得
saveLossTolerance(settings)           // 許容損失設定を保存
// settings = { enabled, mode, percentage, fixedAmount }

// 手法管理（トレード分析強化 Phase 1）
getMethods()                          // 全手法を取得
getMethodById(id)                     // IDで手法取得
addMethod(method)                     // 手法追加
updateMethod(id, updates)             // 手法更新
deleteMethod(id)                      // 手法削除（論理削除）
// method = { id, name, shortName, description, createdAt, deletedAt }
```

**EventBus**: settings:brokerAdded/Updated/Deleted, settings:favoritePairAdded/Removed

---

## Part 7（収支管理）- 完成

| モジュール | 責任 | 主要API |
|-----------|------|---------|
| MonthlyCalendarModule | 月次カレンダー | initialize(), updateCalendar(), showDayTradesModal(date), closeDayTradesModal() |
| ExpenseManagerModule | 経費管理 | addExpense(), deleteExpense() |
| ClosingManagerModule | 締め処理 | performMonthlyClosing() |
| CapitalManagerModule | 入出金 | addRecord(), getCurrentBalance(), calculateProfitRate() |
| capital-ui.js | 入出金UI | addCapitalRecord(), updateCapitalHistory() |
| year-start-balance-ui.js | 年初残高UI | initYearStartBalanceUI(), updateYearStartBalance() |

**EventBus**: expense:added/deleted, closing:monthly, capital:recordAdded/Deleted, calendar:monthChanged

---

## Part 8（統計・レポート）- 完成 (2025-10-20, 拡張 2026-02-01)

**実績**: 3,021行削減（目標137%達成）

| モジュール | 責任 | 主要API |
|-----------|------|---------|
| StatisticsModule | 統計計算 | updateStatistics(), updateYenStatistics(), switchStatisticsView('pips'\|'yen') |
| ReportModule | レポート | displayReport(), generateReflectionList(), generateEmotionAnalysis(), handlePeriodChange(periodType, year, period) |
| ChartModule | チャート | render() |
| **AISummaryModule** | **AIサマリー** | **generateSummary(), generateTextSummary(), getStatus()** |

**円建て統計**: PF、期待値、総損益、平均利益/損失、RR比、最大DD
**ルール遵守・リスク分析**: 遵守率、遵守/非遵守別成績、許容損失別成績、手法別成績
**感情別分析**: ポジティブ/ネガティブ別成績、8感情別成績（アコーディオン + 印刷用PDF対応）

アコーディオンセクション順序:
pairAnalysis → dayAnalysis → sessionAnalysis → tradeHistory → ruleRiskAnalysis → **emotionAnalysis** → reflectionList

トレード記録タブ:
- 感情バッジ（emotion-badge）: EMOTION_OPTIONS の絵文字を表示、ポジティブ=緑系/ネガティブ=赤系
**EventBus**: statistics:updated/yenUpdated/viewChanged, capital:recordAdded連携, **aiSummary:generated**

### AISummaryModule（トレード分析強化 Phase 6）

**ファイル**: `js/part8_modules/AISummaryModule.js`  
**目的**: 将来のAIアシスタント機能のためのデータサマリー生成

```javascript
// 使用例
const summary = AISummaryModule.generateSummary('monthly', 2026, 1);
// → { period, basic, ruleCompliance, riskManagement, methodStats }

const text = AISummaryModule.generateTextSummary('monthly', 2026, 1);
// → AI向けテキスト形式のサマリー
```

**出力データ**:
- basic: 総トレード数、勝率、総Pips、円建て損益、PF
- ruleCompliance: 遵守率、遵守時/非遵守時の成績
- riskManagement: 許容内率、ステータス別成績
- methodStats: 手法別の成績
- emotionStats: 感情別の成績（byEmotion, positiveTotal, negativeTotal, untagged）

---

## EventBus

```javascript
// 命名: part:action
'trade:added', 'trade:updated', 'trade:deleted'
'expense:added', 'closing:monthly'
'statistics:updated', 'capital:recordAdded'
'settings:brokerAdded', 'settings:favoritePairAdded'
'settings:lossToleranceUpdated', 'settings:methodAdded'  // トレード分析強化
'aiSummary:generated'                                     // AIサマリー生成時
```

---

## 共通モジュール

### ImageAddModalModule（画像追加モーダル）

**ファイル**: `js/modules/ImageAddModalModule.js`  
**バージョン**: 1.0.1  
**完了日**: 2025-12-11

#### Public API

| メソッド | 引数 | 説明 |
|----------|------|------|
| `initialize()` | - | モジュール初期化 |
| `open(imageType, tradeId?)` | string, string? | モーダルを開く |
| `close()` | - | モーダルを閉じる |
| `getStatus()` | - | デバッグ用ステータス |

#### Private Fields

```javascript
#modal, #dropZone, #fileInput, #urlInput, #eventBus
#config = {
    maxFileSize: 5MB,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
}
```

#### EventBus

| イベント | タイミング | データ |
|---------|-----------|--------|
| `imageModal:opened` | 表示時 | `{ imageType, tradeId }` |
| `imageModal:closed` | 閉じた時 | - |

#### 依存（script.js）

- `processLocalImage(file)` - ファイル処理
- `handleProcessedImage(url)` - URL処理

#### 機能

ファイル選択、D&D、外部URL、バリデーション、ESC/背景クリックで閉じる

---

### ImageHandler v1.1.0（画像処理・Storage対応）

**ファイル**: `js/modules/ImageHandler.js`  
**バージョン**: 1.1.0  
**更新日**: 2026-01-04

画像処理関連の機能を統合管理。圧縮、リサイズ、フォーマット変換、**Supabase Storageアップロード**に対応。

#### Public API

| メソッド | 引数 | 説明 |
|---------|------|------|
| `compress(source, maxWidth?, quality?)` | File/Base64, number, number | 画像圧縮 |
| `compressWithPreset(source, preset)` | File/Base64, string | プリセット圧縮 |
| `toBase64(file)` | File | Base64変換 |
| `resize(base64, maxWidth, maxHeight)` | string, number, number | リサイズ |
| `createThumbnail(base64, size?)` | string, number | サムネイル生成 |
| `convertFormat(base64, format?, quality?)` | string, string, number | フォーマット変換 |
| `getImageInfo(base64)` | string | サイズ等の情報取得 |
| `validate(source)` | File/Base64 | 検証 |
| `compressMultiple(sources, preset?)` | Array, string | 一括圧縮 |
| `uploadToCloud(source, options)` | File/Base64, Object | Storageアップロード 🆕 |
| `getSignedUrl(path)` | string | 署名付きURL取得 🆕 |
| `deleteFromCloud(path)` | string | Storage削除 🆕 |
| `base64ToBlob(base64)` | string | Blob変換 🆕 |
| `getStatus()` | - | ステータス取得 |

#### CONFIG（設定）

```javascript
static CONFIG = {
    compression: {
        maxWidth: 1200,
        maxHeight: 900,
        quality: 0.85,
        format: 'jpeg'
    },
    storage: {
        bucketName: 'trade-images',
        signedUrlExpiry: 3600, // 1時間
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    },
    presets: {
        icon: { maxWidth: 200, maxHeight: 200, quality: 0.7 },
        chart: { maxWidth: 1000, maxHeight: 750, quality: 0.8 },
        note: { maxWidth: 800, maxHeight: 600, quality: 0.75 },
        thumbnail: { maxWidth: 300, maxHeight: 300, quality: 0.6 }
    },
    limits: {
        maxFileSize: 5 * 1024 * 1024,    // 5MB
        maxCompressedSize: 1 * 1024 * 1024 // 1MB
    }
};
```

#### uploadToCloud オプション

```javascript
await ImageHandler.uploadToCloud(source, {
    userId: 'xxx-xxx-xxx',     // 必須: ユーザーID
    path: 'trades/xxx/chart1.jpg', // 必須: 保存パス
    compress: true             // オプション: 圧縮するか（デフォルト: true）
});

// 戻り値
{ url: '署名付きURL', path: 'userId/trades/xxx/chart1.jpg' }
```

#### 依存関係

- `getSupabase()` - Supabaseクライアント取得

---

### 🖼️ imageUtils.js（画像ヘルパー）

**ファイル**: `js/utils/imageUtils.js`  
**バージョン**: 1.3.0（v1.1.0 + v1.2.0統合）  
**更新日**: 2026-01-23

Base64文字列とSupabase Storage URLの両形式に対応した画像ヘルパー関数。
署名付きURL期限管理 + 画像説明欄（title/description）機能を統合。

#### グローバル関数

**基本関数**:

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `getImageSrc(img)` | any | string\|null | 画像ソースを取得（両形式対応） |
| `hasValidImage(img)` | any | boolean | 有効な画像データか確認 |
| `isUrlImage(img)` | any | boolean | URL形式か確認 |
| `isBase64Image(img)` | any | boolean | Base64形式か確認 |

**説明欄機能（v1.2.0）**:

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `normalizeImageData(img)` | any | Object | 画像データを正規化（src/title/description構造に） |
| `getImageTitle(img)` | any | string\|null | 題名を取得（最大30文字） |
| `getImageDescription(img)` | any | string\|null | 説明を取得（最大100文字） |
| `createImageData(src, title, desc)` | string, string?, string? | Object | 画像データオブジェクトを作成 |
| `updateImageCaption(img, title, desc)` | any, string?, string? | Object | 題名・説明を更新 |
| `hasImageCaption(img)` | any | boolean | 題名または説明があるか判定 |

**URL期限切れ処理（v1.1.0）**:

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `getUrlExpiration(url)` | string | Date\|null | 署名付きURLの有効期限を取得 |
| `isUrlExpired(img)` | any | boolean | URLが期限切れか（1時間前から切れと判定） |
| `getValidImageSrc(img)` | any | Promise<string\|null> | 期限切れなら自動更新してURLを返す（async） |
| `refreshNoteImageUrls(note)` | Object | Promise<Object> | ノートの全画像URLを検証・更新 |
| `refreshTradeImageUrls(trade)` | Object | Promise<Object> | トレードの全画像URLを検証・更新 |

#### 署名付きURL自動更新フロー

```
画像表示リクエスト
    ↓
isUrlExpired() で期限チェック
    ↓
期限切れ？ → Yes → pathから新URL取得 → 保存
    ↓ No
画像表示
```

#### 使用例

```javascript
// 基本的な画像表示
const imgData = chartImages[i];
const imgSrc = window.getImageSrc ? window.getImageSrc(imgData) : null;
if (imgSrc) {
    imgEl.src = imgSrc;
}

// 期限切れURL自動更新（非同期）
const validSrc = await window.getValidImageSrc(imgData);
if (validSrc) {
    imgEl.src = validSrc;
}

// 画像データの作成（説明欄付き）
const imageData = window.createImageData(
    'data:image/jpeg;base64,...',
    'エントリー時の日足',
    'サポートラインブレイク'
);

// 題名・説明の取得
const title = window.getImageTitle(imgData);       // 'エントリー時の日足'
const desc = window.getImageDescription(imgData); // 'サポートラインブレイク'

// 題名・説明の更新
const updated = window.updateImageCaption(imgData, '新しい題名', '新しい説明');
```

#### 対応形式

| 形式 | 例 | getImageSrcの戻り値 |
|------|-----|---------------------|
| Base64文字列 | `'data:image/jpeg;base64,...'` | そのまま返す |
| URL文字列 | `'https://...'` | そのまま返す |
| URLオブジェクト | `{ url: 'https://...', path: '...' }` | `url`プロパティを返す |
| Base64オブジェクト | `{ data: 'data:image/...' }` | `data`プロパティを返す |
| 説明欄付きオブジェクト | `{ src: '...', title: '...', description: '...' }` | `src`プロパティを返す |
| null/undefined | - | `null` |

#### 画像データ構造（完全形）

```javascript
{
    src: 'data:image/jpeg;base64,...',  // または 'https://...'
    url: 'https://...',                  // Supabase署名付きURL
    path: 'userId/trades/xxx/chart1.jpg', // Storage復元用パス
    title: 'エントリー時の日足',          // 題名（最大30文字）
    description: 'サポートラインブレイク'  // 説明（最大100文字）
}
```

#### index.html への追加

```html
<!-- validation.jsの後に追加 -->
<script src="js/utils/imageUtils.js"></script>
```

---

## フォーム制御（新規トレード）

```
index.html [onclick="saveTradeRecord()"]
  → bridge.js [フォーム値取得、formData作成]
  → TradeEntry.js [検証・整形]
  → TradeManager.js [localStorage保存]
```

**価格入力step**: 円絡み=0.01, ドルストレート=0.0001, GOLD=0.1, BTC=1.0

---

## 削除された機能 (2025-10-28)

- **Part4（AI/SNS）**: 全削除（約2,500行）
- **Part6（学習）**: タブ削除（約500行）
- **トレードアイコン**: 削除（約200行）

**合計削減**: 744行、将来v2.0で復活予定

---

## デバッグ

```javascript
window.XxxModule.getStatus()
TradeManager.getInstance().getAllTrades()
Object.keys(window).filter(k => k.includes('Module'))
```

---

## 🔐 StorageModeModule（Phase 2: クラウド実装時）

### 概要
データ保存方式をユーザーが選択できる機能。

| モード | 保存先 | スマホ同期 |
|--------|-------|-----------|
| `local` | LocalStorageのみ | ❌ |
| `cloud` | Supabase + LocalStorage | ✅ |

### LocalStorageキー
`tc_storage_mode`: `'local'` or `'cloud'`（デフォルト: `'local'`）

### 実装イメージ
```javascript
class StorageModeModule {
    #mode = 'local';  // 'local' | 'cloud'
    
    getMode() { return this.#mode; }
    setMode(mode) { /* 変更 → emit('storageMode:changed') */ }
    isLocalOnly() { return this.#mode === 'local'; }
    isCloudSync() { return this.#mode === 'cloud'; }
}
```

### SyncModuleとの連携
```javascript
async addTrade(trade) {
    if (storageMode === 'local' || !this.#userId) {
        return this.#addTradeLocal(trade);  // ローカルのみ
    }
    // クラウド同期...
}
```

**EventBus**: `storageMode:changed`

---

## 🔄 SyncModule v1.8.0（クラウド同期）

**ファイル**: `js/sync/SyncModule.js`  
**バージョン**: 1.8.0  
**更新日**: 2026-03-09

localStorage ↔ Supabase 双方向同期。**トレード・ノート保存時に画像を自動でSupabase Storageにアップロード**。

### Public API

| メソッド | 引数 | 説明 |
|---------|------|------|
| `initialize()` | - | 初期化（ログイン必須） |
| `isInitialized()` | - | 初期化状態確認 |
| `isSyncing()` | - | 同期中かどうか |
| `saveTrade(trade)` | Object | トレード保存 + 画像アップロード |
| `deleteTrade(id)` | string | トレード削除 |
| `fetchAllTrades()` | - | 全トレード取得 |
| `migrateTradesFromLocal()` | - | ローカル→クラウド一括移行 |
| `syncTradesToLocal()` | - | クラウド→ローカル同期 |
| `saveNote(date, data)` | string, Object | ノート保存 + 画像アップロード 🆕 |
| `deleteNote(date)` | string | ノート削除 |
| `fetchAllNotes()` | - | 全ノート取得 |
| `saveExpense(expense)` | Object | 経費保存 |
| `deleteExpense(id)` | string | 経費削除 |
| `fetchAllExpenses()` | - | 全経費取得 |
| `saveCapitalRecord(record)` | Object | 入出金保存 |
| `deleteCapitalRecord(id)` | string | 入出金削除 |
| `fetchAllCapitalRecords()` | - | 全入出金取得 |
| `saveSettings(settings)` | Object | 設定一括保存 |
| `fetchSettings()` | - | 設定取得 |
| `getStatus()` | - | デバッグ用状態確認 |
| `mergeAllWithCloud()` | - | オフライン復帰時の全テーブル差分マージ 🆕 |
| `mergeTradesWithCloud()` | - | トレードのマージ（Last Write Wins by updatedAt） 🆕 |
| `mergeNotesWithCloud()` | - | ノートのマージ（Last Write Wins by updatedAt） 🆕 |
| `mergeExpensesWithCloud()` | - | 経費のマージ（IDユニオン方式） 🆕 |
| `mergeCapitalRecordsWithCloud()` | - | 入出金のマージ（IDユニオン方式） 🆕 |

### Private Methods

| メソッド | 説明 |
|---------|------|
| `#uploadTradeImages(trade)` | トレード画像をStorageにアップロード、Base64→URL変換 |
| `#uploadNoteImages(date, data)` | ノート画像をStorageにアップロード、Base64→URL変換 🆕 |
| `#localTradeToSupabase(local)` | localStorage→Supabase形式変換 |
| `#supabaseTradeToLocal(supa)` | Supabase→localStorage形式変換 |
| `#localNoteToSupabase(date, data)` | ノート変換 |
| `#supabaseNotesToLocal(notes)` | ノート変換 |
| `#localExpenseToSupabase(local)` | 経費変換 |
| `#supabaseExpenseToLocal(supa)` | 経費変換 |
| `#localCapitalToSupabase(local)` | 入出金変換 |
| `#supabaseCapitalToLocal(supa)` | 入出金変換 |
| `#getCurrentUserId()` | ユーザーID取得 |
| `#setupEventListeners()` | イベントリスナー設定 |

### EventBus イベント

| イベント | タイミング | データ |
|---------|-----------|--------|
| `sync:trade:saved` | トレード保存成功時 | `{ tradeId }` |
| `sync:trade:deleted` | トレード削除成功時 | `{ tradeId }` |
| `sync:note:saved` | ノート保存成功時 | `{ date }` |
| `sync:note:deleted` | ノート削除成功時 | `{ date }` |
| `sync:expense:saved` | 経費保存成功時 | `{ expenseId }` |
| `sync:expense:deleted` | 経費削除成功時 | `{ expenseId }` |
| `sync:capital:saved` | 入出金保存成功時 | `{ recordId }` |
| `sync:capital:deleted` | 入出金削除成功時 | `{ recordId }` |
| `sync:settings:saved` | 設定保存成功時 | - |
| `sync:migration:start` | 移行開始時 | `{ total }` |
| `sync:migration:progress` | 移行進捗時 | `{ current, total }` |
| `sync:migration:complete` | 移行完了時 | `{ count, errors }` |
| `sync:merge:start` | マージ開始時 | `{}` 🆕 |
| `sync:merge:complete` | マージ完了時 | `{ results, success }` 🆕 |
| `sync:merge:error` | マージエラー時 | `{ error }` 🆕 |

### 画像アップロードフロー

```
saveTrade(trade)
  ↓
#uploadTradeImages(trade)
  ├── chartImages配列をループ
  ├── Base64の場合 → ImageHandler.uploadToCloud()
  ├── 既にURLの場合 → そのまま
  └── nullの場合 → そのまま
  ↓
tradeWithUrls（chartImagesがURL形式に変換済み）
  ↓
#localTradeToSupabase(tradeWithUrls)
  ↓
Supabase保存（chart_imagesにURLが格納）
```

### 依存関係

- `getSupabase()` - Supabaseクライアント
- `AuthModule` - ユーザーID取得
- `ImageHandler` - 画像アップロード
- `StorageValidator` - データ検証
- `SecureError` - エラー処理
- `EventBus` - イベント通知

### バージョン履歴

| バージョン | 日付 | 内容 |
|-----------|------|------|
| v1.0.1 | 2025-12-30 | trades同期実装 |
| v1.1.0 | 2026-01-03 | notes同期追加 |
| v1.1.1 | 2026-01-03 | notes変換処理修正 |
| v1.2.0 | 2026-01-04 | expenses同期追加 |
| v1.3.0 | 2026-01-04 | capital_records同期追加 |
| v1.4.0 | 2026-01-04 | user_settings同期追加 |
| v1.5.0 | 2026-01-05 | 画像アップロード統合（#uploadTradeImages） |
| v1.5.1 | 2026-01-05 | 文字列形式Base64対応 |
| v1.5.2 | 2026-01-05 | #uploadNoteImages追加（ノート画像対応） |
| v1.5.3 | 2026-01-09 | goals/icon同期追加 |
| v1.6.0 | 2026-01-14 | セキュリティ強化（#toUserMessage フォールバック） |
| v1.7.0 | 2026-01-15 | siteTitle/siteSubtitle同期追加 |
| v1.8.0 | 2026-03-09 | オフライン復帰マージ機能追加（mergeAllWithCloud等5メソッド、window.addEventListener('online')による自動検知） |

---

## 💳 PaymentModule（決済・プラン管理）

**ファイル**: `js/payment/PaymentModule.js`  
**バージョン**: 1.0.0  
**完了日**: 2026-03-08

### Public API

| メソッド | 引数 | 説明 |
|---------|------|------|
| `initialize()` | - | 初期化（Supabaseからプラン取得） |
| `getCurrentPlan()` | - | 現在のプラン取得（'free'/'pro'/'premium'） |
| `getStatus()` | - | 初期化状態・プラン・制限情報取得 |
| `canAddTrade(currentCount)` | number | トレード追加可否（Free=50件上限） |
| `canUseCloudSync()` | - | クラウド同期利用可否（Pro以上） |
| `createCheckoutSession(priceId)` | string | Stripe Checkout起動 |
| `openCustomerPortal()` | - | Stripe Customer Portal起動 |

### プラン別制限

| 制限項目 | Free | Pro | Premium |
|---------|------|-----|---------|
| トレード記録 | 累計50件まで | 無制限 | 無制限 |
| クラウド同期 | ❌ | ✅ | ✅ |

### bridge.js との統合（Phase 4）

```javascript
// bridge.js: saveTradeRecord()先頭に追加済み
if (window.PaymentModule && typeof window.PaymentModule.canAddTrade === 'function') {
    const trades = JSON.parse(localStorage.getItem('trades') || '[]');
    if (!window.PaymentModule.canAddTrade(trades.length)) {
        if (typeof window.showUpgradeModal === 'function') {
            window.showUpgradeModal('trades');
        }
        return false;
    }
}
```

### SyncModule との統合（Phase 4）

```javascript
// SyncModule.js: initialize()内に追加済み
if (window.PaymentModule && typeof window.PaymentModule.canUseCloudSync === 'function') {
    if (!window.PaymentModule.canUseCloudSync()) {
        console.warn('[SyncModule] Freeプランのためクラウド同期は利用できません');
        return false;
    }
}
```

### EventBus

| イベント | タイミング |
|---------|-----------|
| `payment:planChanged` | プラン変更時 |
| `payment:upgradeRequired` | 制限到達時 |

### Supabase Edge Functions

| 関数名 | 役割 | ファイル |
|--------|------|---------|
| `create-checkout-session` | Checkout Session作成 | supabase/functions/create-checkout-session/index.ts |
| `stripe-webhook` | 決済イベント受信・DB更新 | supabase/functions/stripe-webhook/index.ts |
| `customer-portal` | プラン管理画面URL発行 | supabase/functions/customer-portal/index.ts |

**重要**: stripe-webhookはデプロイ時に `--no-verify-jwt` オプションが必須

```bash
npx supabase functions deploy stripe-webhook --project-ref apqmrhksogpscdtktjwd --no-verify-jwt
```

**詳細**: Stripe決済システム_要件定義書_ロードマップ_v1_4.md

---

*技術的真実の源泉。実装時は必ずこの仕様に従う。*
