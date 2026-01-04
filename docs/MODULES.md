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
```

**EventBus**: settings:brokerAdded/Updated/Deleted, settings:favoritePairAdded/Removed

---

## Part 7（収支管理）- 完成

| モジュール | 責任 | 主要API |
|-----------|------|---------|
| ExpenseManagerModule | 経費管理 | addExpense(), deleteExpense() |
| ClosingManagerModule | 締め処理 | performMonthlyClosing() |
| CapitalManagerModule | 入出金 | addRecord(), getCurrentBalance(), calculateProfitRate() |
| capital-ui.js | 入出金UI | addCapitalRecord(), updateCapitalHistory() |

**EventBus**: expense:added/deleted, closing:monthly, capital:recordAdded/Deleted

---

## Part 8（統計・レポート）- 完成 (2025-10-20)

**実績**: 3,021行削減（目標137%達成）

| モジュール | 責任 | 主要API |
|-----------|------|---------|
| StatisticsModule | 統計計算 | updateStatistics(), updateYenStatistics(), switchStatisticsView('pips'\|'yen') |
| ReportModule | レポート | displayReport(), generateReflectionList(), handlePeriodChange(periodType, year, period) |
| ChartModule | チャート | render() |

**円建て統計**: PF、期待値、総損益、平均利益/損失、RR比、最大DD
**EventBus**: statistics:updated/yenUpdated/viewChanged, capital:recordAdded連携

---

## EventBus

```javascript
// 命名: part:action
'trade:added', 'trade:updated', 'trade:deleted'
'expense:added', 'closing:monthly'
'statistics:updated', 'capital:recordAdded'
'settings:brokerAdded', 'settings:favoritePairAdded'
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

## 🔄 SyncModule v1.5.0（クラウド同期）

**ファイル**: `js/modules/SyncModule.js`  
**バージョン**: 1.5.0  
**更新日**: 2026-01-04

localStorage ↔ Supabase 双方向同期。**トレード保存時に画像を自動でSupabase Storageにアップロード**。

### Public API

| メソッド | 引数 | 説明 |
|---------|------|------|
| `initialize()` | - | 初期化（ログイン必須） |
| `isInitialized()` | - | 初期化状態確認 |
| `isSyncing()` | - | 同期中かどうか |
| `saveTrade(trade)` | Object | トレード保存 + 画像アップロード 🆕 |
| `deleteTrade(id)` | string | トレード削除 |
| `fetchAllTrades()` | - | 全トレード取得 |
| `migrateTradesFromLocal()` | - | ローカル→クラウド一括移行 |
| `syncTradesToLocal()` | - | クラウド→ローカル同期 |
| `saveNote(date, data)` | string, Object | ノート保存 |
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

### Private Methods

| メソッド | 説明 |
|---------|------|
| `#uploadTradeImages(trade)` | 画像をStorageにアップロード、Base64→URL変換 🆕 |
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
- `ImageHandler` - 画像アップロード 🆕
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
| v1.5.0 | 2026-01-04 | 画像アップロード統合 |

---

*技術的真実の源泉。実装時は必ずこの仕様に従う。*
