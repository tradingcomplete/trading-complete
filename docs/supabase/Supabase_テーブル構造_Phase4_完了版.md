# Supabase テーブル構造（Phase 4 対応版）

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

## 📁 Supabase Storage（Phase 4.5 追加予定）🆕

### バケット設計

```
バケット名: trade-images

構造:
{user_id}/
├── trades/
│   └── {trade_id}/
│       ├── chart1.jpg
│       ├── chart2.jpg
│       └── chart3.jpg
└── notes/
    └── {date}/
        └── image1.jpg
```

### 作成SQL

```sql
-- バケット作成（Supabase Dashboard または SQL）
INSERT INTO storage.buckets (id, name, public)
VALUES ('trade-images', 'trade-images', false);

-- RLSポリシー: 自分のフォルダのみアクセス可能
CREATE POLICY "Users can access own folder"
ON storage.objects FOR ALL
USING (
  bucket_id = 'trade-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'trade-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

### 容量比較

| 保存先 | 無料枠 | 画像枚数目安 | 備考 |
|--------|--------|-------------|------|
| localStorage | 5MB | 約25枚 | 3ヶ月で自動削除 |
| Supabase Database（Base64） | 500MB | 約2,500枚 | JSONBカラム圧迫 |
| **Supabase Storage** | **1GB** | **約5,000枚** | **推奨** |

### データ形式の変更

```javascript
// 現状（Base64）
trade.chartImages = [
  { type: 'chart1', data: 'data:image/jpeg;base64,...', timestamp: '...' }
]

// 改善後（URL）
trade.chartImages = [
  { type: 'chart1', url: 'https://xxx.supabase.co/storage/v1/object/...', timestamp: '...' }
]
```

---

## 1. trades テーブル（最終構成：22カラム）✅ 同期完了

### 1.1 テーブル定義

```sql
CREATE TABLE trades (
  -- 識別情報
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- 基本情報
  entry_date DATE NOT NULL,
  entry_time TIME,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  
  -- 数値データ
  lot DECIMAL,
  entry_price DECIMAL,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  
  -- 決済情報（配列）
  exits JSONB DEFAULT '[]',
  
  -- 円建て損益
  yen_profit_loss JSONB,
  
  -- ブローカー
  broker TEXT,
  
  -- チェックリスト
  checklist JSONB,
  
  -- 振り返り
  reflection JSONB,
  
  -- 画像（URL配列）→ Phase 4.5でURL形式に変更予定
  chart_images JSONB DEFAULT '[]',
  
  -- 追加カラム（Phase 4で追加）
  scenario TEXT,
  status TEXT DEFAULT 'open',
  reasons JSONB DEFAULT '[]',
  entry_emotion TEXT,
  
  -- メタデータ
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_trades_user_date ON trades(user_id, entry_date DESC);
CREATE INDEX idx_trades_user_symbol ON trades(user_id, symbol);

-- RLS有効化
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "Users can CRUD own trades"
  ON trades FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 1.2 全カラム一覧（22カラム）

| # | カラム名 | データ型 | 説明 |
|---|---------|---------|------|
| 1 | id | text | トレードID（localStorage互換） |
| 2 | user_id | uuid | ユーザーID（RLS用） |
| 3 | entry_date | date | エントリー日 |
| 4 | entry_time | time | エントリー時刻 |
| 5 | symbol | text | 通貨ペア |
| 6 | direction | text | long/short |
| 7 | lot | numeric | ロットサイズ |
| 8 | entry_price | numeric | エントリー価格 |
| 9 | stop_loss | numeric | ストップロス |
| 10 | take_profit | numeric | テイクプロフィット |
| 11 | exits | jsonb | 決済情報配列 |
| 12 | yen_profit_loss | jsonb | 円建て損益オブジェクト |
| 13 | broker | text | ブローカー名 |
| 14 | checklist | jsonb | チェックリスト |
| 15 | reflection | jsonb | 振り返り |
| 16 | chart_images | jsonb | チャート画像（URL配列予定） |
| 17 | scenario | text | シナリオ |
| 18 | status | text | ステータス |
| 19 | reasons | jsonb | エントリー理由配列 |
| 20 | entry_emotion | text | エントリー時感情 |
| 21 | created_at | timestamp | 作成日時 |
| 22 | updated_at | timestamp | 更新日時 |

---

## 2. localStorage ↔ Supabase マッピング

### 2.1 trades マッピング

| localStorage | Supabase | 型 | 備考 |
|-------------|----------|-----|------|
| id | id | text | そのまま |
| (自動付与) | user_id | uuid | Supabaseで付与 |
| date | entry_date | date | 日付部分のみ |
| entryTime | entry_time | time | 時刻部分のみ |
| pair / symbol | symbol | text | どちらも同じ値 |
| direction | direction | text | 'long' / 'short' |
| lotSize / lot | lot | numeric | どちらも同じ値 |
| entryPrice | entry_price | numeric | |
| stopLoss | stop_loss | numeric | |
| takeProfit | take_profit | numeric | |
| exits | exits | jsonb | 配列形式 |
| yenProfitLoss | yen_profit_loss | jsonb | オブジェクト形式 |
| broker | broker | text | |
| checklist | checklist | jsonb | |
| reflection | reflection | jsonb | |
| chartImages | chart_images | jsonb | 配列形式 |
| scenario | scenario | text | |
| status / holdingStatus | status | text | 'open' / 'closed' |
| reasons | reasons | jsonb | 配列形式 |
| entryEmotion | entry_emotion | text | |
| createdAt / timestamp | created_at | timestamp | |
| updatedAt | updated_at | timestamp | |

---

## 3. 他テーブル構造

### 3.1 notes テーブル ✅ 同期完了

```sql
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL,
  content TEXT,  -- JSON文字列で { memo, marketView, images } を保存
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, date)
);
```

**localStorage形式**: 日付をキーにしたオブジェクト
```javascript
{
  "2025-01-15": { 
    memo: "...", 
    marketView: "...", 
    images: [...] 
  }
}
```

**Supabase保存形式**: contentカラムにJSON文字列
```javascript
content: '{"memo":"...","marketView":"...","images":[...]}'
```

### 3.2 expenses テーブル ✅ 同期完了

```sql
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL NOT NULL,
  category TEXT NOT NULL,
  description TEXT,  -- JSON文字列で { text, memo, taxYear } を保存
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**localStorage キー**: `tc_expenses`

**変換ポイント**:
- localStorage の `description`, `memo`, `taxYear` を description(JSON) にまとめる

### 3.3 capital_records テーブル ✅ 同期完了

```sql
CREATE TABLE capital_records (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL,  -- 'deposit' or 'withdrawal'
  amount DECIMAL NOT NULL,
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**localStorage キー**: `depositWithdrawals`

**変換ポイント**:
- localStorage: `note` → Supabase: `memo`
- `balance` は保存しない（CapitalManagerModuleが再計算）

### 3.4 user_settings テーブル ✅ 同期完了

```sql
CREATE TABLE user_settings (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  brokers JSONB DEFAULT '[]',
  favorite_pairs JSONB DEFAULT '[]',
  monthly_memos JSONB DEFAULT '{}',
  closed_periods JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**localStorageキー対応**:

| Supabase カラム | localStorage キー | 管理モジュール |
|----------------|------------------|---------------|
| brokers | `brokers` | SettingsModule |
| favorite_pairs | `favoritePairs` | SettingsModule |
| monthly_memos | `monthlyMemos` | NoteManagerModule |
| closed_periods | `tc_closed_periods` | ClosingManagerModule |

**同期方式**: 一括保存（4つのlocalStorageを1レコードにまとめて保存）

---

## 4. SyncModule.js 実装状況

### 4.1 SyncModule.js v1.4.0 ✅ 完成

**ファイルパス**: `js/sync/SyncModule.js`

**Public API**:

| メソッド | テーブル | 説明 |
|---------|---------|------|
| `initialize()` | - | 初期化（ログイン必須） |
| `isInitialized()` | - | 初期化状態確認 |
| `isSyncing()` | - | 同期中かどうか |
| **trades** | | |
| `saveTrade(trade)` | trades | 1件保存 |
| `deleteTrade(id)` | trades | 1件削除 |
| `fetchAllTrades()` | trades | 全件取得 |
| `migrateTradesFromLocal()` | trades | ローカル→クラウド移行 |
| `syncTradesToLocal()` | trades | クラウド→ローカル同期 |
| **notes** | | |
| `saveNote(date, data)` | notes | 1件保存 |
| `deleteNote(date)` | notes | 1件削除 |
| `fetchAllNotes()` | notes | 全件取得 |
| `migrateNotesFromLocal()` | notes | ローカル→クラウド移行 |
| `syncNotesToLocal()` | notes | クラウド→ローカル同期 |
| **expenses** | | |
| `saveExpense(expense)` | expenses | 1件保存 |
| `deleteExpense(id)` | expenses | 1件削除 |
| `fetchAllExpenses()` | expenses | 全件取得 |
| `migrateExpensesFromLocal()` | expenses | ローカル→クラウド移行 |
| `syncExpensesToLocal()` | expenses | クラウド→ローカル同期 |
| **capital_records** | | |
| `saveCapitalRecord(record)` | capital_records | 1件保存 |
| `deleteCapitalRecord(id)` | capital_records | 1件削除 |
| `fetchAllCapitalRecords()` | capital_records | 全件取得 |
| `migrateCapitalRecordsFromLocal()` | capital_records | ローカル→クラウド移行 |
| `syncCapitalRecordsToLocal()` | capital_records | クラウド→ローカル同期 |
| **user_settings** | | |
| `saveUserSettings()` | user_settings | 4つのlocalStorage一括保存 |
| `fetchUserSettings()` | user_settings | 設定取得 |
| `syncUserSettingsToLocal()` | user_settings | クラウド→ローカル展開 |
| `migrateUserSettingsFromLocal()` | user_settings | ローカル→クラウド移行 |

### 4.2 各モジュール連携状況

| モジュール | 同期メソッド | EventBus | 状態 |
|-----------|------------|---------|------|
| TradeManager-nomodule.js | `_syncToCloud()`, `_deleteFromCloud()` | sync:trade:* | ✅ |
| NoteManagerModule.js | `#syncNoteToCloud()`, `#deleteNoteFromCloud()` | sync:note:* | ✅ |
| ExpenseManagerModule.js | `#syncExpenseToCloud()`, `#deleteExpenseFromCloud()` | sync:expense:* | ✅ |
| CapitalManagerModule.js | `#syncRecordToCloud()`, `#deleteRecordFromCloud()` | sync:capital:* | ✅ |
| SettingsModule.js | EventBus `settings:changed` 発火 | settings:changed | ✅ |
| NoteManagerModule.js | EventBus `settings:changed` 発火（monthlyMemos） | settings:changed | ✅ |
| ClosingManagerModule.js | EventBus `settings:changed` 発火 | settings:changed | ✅ |

### 4.3 移行・テスト実績

| 日時 | 内容 | 結果 |
|------|------|------|
| 2025-12-30 | trades 50件一括移行 | ✅ 成功 |
| 2025-12-30 | trades 自動同期テスト | ✅ 成功 |
| 2026-01-03 | notes 同期テスト | ✅ 成功 |
| 2026-01-04 | expenses 同期テスト | ✅ 成功 |
| 2026-01-04 | capital_records 同期テスト | ✅ 成功 |
| 2026-01-04 | user_settings 一括保存テスト | ✅ 成功 |
| 2026-01-04 | SettingsModule自動同期テスト（ブローカー追加） | ✅ 成功 |
| 2026-01-04 | NoteManagerModule自動同期テスト（月メモ） | ✅ 成功 |
| 2026-01-04 | ClosingManagerModule自動同期テスト（月次締め） | ✅ 成功 |

---

## 5. 次のステップ（Phase 4.5）

### Supabase Storage 実装

| Step | タスク | 状態 |
|------|--------|------|
| 5.1 | バケット `trade-images` 作成 | ⬜ |
| 5.2 | RLSポリシー設定 | ⬜ |
| 5.3 | ImageHandler.uploadToCloud() 実装 | ⬜ |
| 5.4 | SyncModule画像アップロード対応 | ⬜ |
| 5.5 | トレード保存時のURL変換 | ⬜ |
| 5.6 | ノート保存時のURL変換 | ⬜ |
| 5.7 | 既存Base64画像の移行 | ⬜ |

---

## 更新履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| Phase 2版 | 2025-12-17 | 初版（テーブル定義のみ） |
| Phase 4版 | 2025-12-30 | trades 4カラム追加、SyncModule実装、マッピング詳細追加 |
| **Phase 4完了版** | **2026-01-04** | **全5テーブル同期完了、SyncModule v1.4.0、Supabase Storage設計追加** |

---

*このドキュメントをPhase 4.5以降の開発で参照してください。*
