# Supabase テーブル構造（Phase 4.5 進捗版）

**作成日**: 2025-12-30  
**更新日**: 2026-01-04  
**用途**: SyncModule.js データ変換・引き継ぎ資料

---

## 📊 テーブル一覧

| テーブル名 | localStorage キー | 用途 | RLS | 同期状態 |
|-----------|------------------|------|-----|---------|
| `trades` | `trades` | トレード記録 | ✅ | ✅ 完了 |
| `notes` | `notes` | 相場ノート | ✅ | ✅ 完了 |
| `expenses` | `tc_expenses` | 経費データ | ✅ | ✅ 完了 |
| `capital_records` | `depositWithdrawals` | 入出金記録 | ✅ | ✅ 完了 |
| `user_settings` | 複数キー | ユーザー設定 | ✅ | ✅ 完了 |

---

## 📁 Supabase Storage 🆕 ✅ 基本実装完了

### バケット設計

```
バケット名: trade-images ✅ 作成済み

構造:
{user_id}/
├── trades/
│   └── {trade_id}/
│       ├── chart1.jpg
│       ├── chart2.jpg
│       └── chart3.jpg
├── notes/
│   └── {date}/
│       └── image1.jpg
└── test/              ← テスト用（削除可）
    └── test-image.png
```

### RLSポリシー ✅ 設定済み

```sql
-- ポリシー名: "Users can access own folder"
-- 適用対象: ALL（SELECT, INSERT, UPDATE, DELETE）
-- 対象ロール: authenticated

bucket_id = 'trade-images' 
AND (storage.foldername(name))[1] = auth.uid()::text
```

**動作**: ユーザーは自分のuser_idフォルダ内のみアクセス可能

### 容量比較

| 保存先 | 無料枠 | 画像枚数目安 | 備考 |
|--------|--------|-------------|------|
| localStorage | 5MB | 約25枚 | ブラウザ依存 |
| Supabase Database（Base64） | 500MB | 約2,500枚 | JSONBカラム圧迫 |
| **Supabase Storage** | **1GB** | **約5,000枚** | **✅ 採用** |

### データ形式の変化

```javascript
// 変換前（localStorage / Base64）
trade.chartImages = [
  { type: 'chart1', data: 'data:image/jpeg;base64,/9j/4AAQ...', timestamp: '...' },
  null,
  null
]

// 変換後（Supabase / URL）✅ 動作確認済み
trade.chart_images = [
  { 
    type: 'chart1', 
    url: 'https://xxx.supabase.co/storage/v1/object/sign/trade-images/...', 
    path: '{user_id}/trades/{trade_id}/chart1.jpg',
    timestamp: '...' 
  },
  null,
  null
]
```

---

## 🔄 SyncModule v1.5.0 実装状況 🆕

### Public API

| メソッド | 説明 | 状態 |
|---------|------|------|
| `initialize()` | 初期化（ログイン必須） | ✅ |
| `isInitialized()` | 初期化状態確認 | ✅ |
| `isSyncing()` | 同期中かどうか | ✅ |
| `saveTrade(trade)` | 1件保存 **+ 画像アップロード** | ✅ 🆕 |
| `deleteTrade(id)` | 1件削除 | ✅ |
| `fetchAllTrades()` | 全件取得 | ✅ |
| `migrateTradesFromLocal()` | ローカル→クラウド一括移行 | ✅ |
| `syncTradesToLocal()` | クラウド→ローカル同期 | ✅ |
| `saveNote(date, data)` | ノート保存 | ✅ |
| `deleteNote(date)` | ノート削除 | ✅ |
| `fetchAllNotes()` | 全ノート取得 | ✅ |
| `saveExpense(expense)` | 経費保存 | ✅ |
| `deleteExpense(id)` | 経費削除 | ✅ |
| `fetchAllExpenses()` | 全経費取得 | ✅ |
| `saveCapitalRecord(record)` | 入出金保存 | ✅ |
| `deleteCapitalRecord(id)` | 入出金削除 | ✅ |
| `fetchAllCapitalRecords()` | 全入出金取得 | ✅ |
| `saveSettings(settings)` | 設定一括保存 | ✅ |
| `fetchSettings()` | 設定取得 | ✅ |
| `getStatus()` | デバッグ用状態確認 | ✅ |

### Private Methods（画像関連）🆕

| メソッド | 説明 |
|---------|------|
| `#uploadTradeImages(trade)` | トレード画像をStorageにアップロード、Base64→URL変換 |

---

## 🖼️ ImageHandler v1.1.0 実装状況 🆕

### Public API

| メソッド | 説明 | 状態 |
|---------|------|------|
| `compress(source, maxWidth, quality)` | 画像圧縮 | ✅ |
| `compressWithPreset(source, preset)` | プリセット圧縮 | ✅ |
| `toBase64(file)` | File→Base64変換 | ✅ |
| `resize(base64, maxWidth, maxHeight)` | リサイズ | ✅ |
| `createThumbnail(base64, size)` | サムネイル生成 | ✅ |
| `convertFormat(base64, format, quality)` | フォーマット変換 | ✅ |
| `getImageInfo(base64)` | 画像情報取得 | ✅ |
| `validate(source)` | 検証 | ✅ |
| **`uploadToCloud(source, options)`** | **Storageアップロード** | ✅ 🆕 |
| **`getSignedUrl(path)`** | **署名付きURL取得** | ✅ 🆕 |
| **`deleteFromCloud(path)`** | **Storage削除** | ✅ 🆕 |
| **`base64ToBlob(base64)`** | **Base64→Blob変換** | ✅ 🆕 |
| `getStatus()` | ステータス確認 | ✅ |

### CONFIG（Storage設定）🆕

```javascript
storage: {
    bucketName: 'trade-images',
    signedUrlExpiry: 3600, // 1時間（秒）
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
}
```

---

## 📋 次のステップ（Phase 4.5 残り）

| Step | タスク | 状態 |
|------|--------|------|
| 4.5.6 | 画像表示対応（URL→img src） | ⬜ |
| 4.5.7 | ノート画像のStorage対応 | ⬜ |
| 4.5.8 | 既存Base64画像の移行処理 | ⬜ |

### 画像表示対応の詳細

現在、`chart_images` に URL が保存されているが、表示側が対応していない：

```javascript
// 現在の表示コード（Base64前提）
if (img && img.src && img.src.startsWith('data:')) {
    // ...
}

// 修正後（URL対応）
if (img) {
    const src = img.url || img.data;  // URL優先、なければBase64
    // ...
}
```

対象ファイル:
- `script.js` - トレード一覧の画像表示
- `TradeDetail.js` - 詳細モーダルの画像表示
- `TradeEntry.js` - 編集時の画像表示

---

## 更新履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| Phase 2版 | 2025-12-17 | 初版（テーブル定義のみ） |
| Phase 4版 | 2025-12-30 | trades 4カラム追加、SyncModule実装 |
| Phase 4完了版 | 2026-01-04 | 全5テーブル同期完了、SyncModule v1.4.0 |
| **Phase 4.5進捗版** | **2026-01-04** | **Storage基本実装完了、SyncModule v1.5.0、ImageHandler v1.1.0** |

---

*このドキュメントをPhase 4.5完了後に更新してください。*
