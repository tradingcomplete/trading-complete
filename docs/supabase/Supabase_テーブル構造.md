# Supabase テーブル構造（Phase 7.2 tags対応版）

**作成日**: 2025-12-30  
**更新日**: 2026-03-08  
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
| `subscriptions` | （なし・サーバー管理） | サブスクリプション課金状態 | ✅ | ✅ Webhook自動更新 |

---

## 💳 subscriptions テーブル（Stripe連携 / 2026-03-08追加）

### 概要

| 項目 | 内容 |
|------|------|
| 用途 | サブスクリプション・プラン管理 |
| 更新方法 | Stripe Webhook経由（stripe-webhook Edge Function） |
| RLS | ✅ SELECT: 本人のみ / INSERT・UPDATE・DELETE: service_roleのみ |
| localStorageキー | なし（サーバー管理） |

### カラム定義

| カラム | 型 | 説明 | デフォルト |
|--------|-----|------|-----------|
| `id` | UUID | PK | gen_random_uuid() |
| `user_id` | UUID | Supabase auth.users 外部キー（UNIQUE） | - |
| `stripe_customer_id` | TEXT | StripeのCustomer ID | null |
| `stripe_subscription_id` | TEXT | StripeのSubscription ID | null |
| `stripe_price_id` | TEXT | StripeのPrice ID | null |
| `plan` | TEXT | 'free' / 'pro' / 'premium' | 'free' |
| `billing_period` | TEXT | 'monthly' / 'yearly' | 'monthly' |
| `status` | TEXT | 'active' / 'past_due' / 'canceled' 等 | 'active' |
| `current_period_start` | TIMESTAMPTZ | 現在の契約期間開始日 | null |
| `current_period_end` | TIMESTAMPTZ | 現在の契約期間終了日 | null |
| `cancel_at_period_end` | BOOLEAN | 期間終了時に解約するか | false |
| `created_at` | TIMESTAMPTZ | 作成日時 | NOW() |
| `updated_at` | TIMESTAMPTZ | 更新日時 | NOW() |

### 作成SQL ✅ 適用済み

```sql
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  billing_period TEXT DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLSポリシー
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のレコードのみSELECT可能
CREATE POLICY "Users can view own subscription"
ON subscriptions FOR SELECT
USING (auth.uid() = user_id);
```

### Webhookによる更新フロー

```
Stripe決済イベント
  ↓
stripe-webhook Edge Function（--no-verify-jwt必須）
  ↓
customer.subscription.created/updated → upsert（plan, status, billing_period等を更新）
customer.subscription.deleted         → plan='free', status='canceled'
invoice.payment_failed                → status='past_due'
```

### テスト環境 Price ID（本番切替時に要更新）

| 商品 | Price ID |
|------|----------|
| Pro 月額 | price_1T8MBRGRDglt4xkODaqhswBT |
| Pro 年額 | price_1T8MDKGRDglt4xkO4YnLbeiV |
| Premium 月額 | price_1T8MGTGRDglt4xkOWis6kg3p |
| Premium 年額 | price_1T8MHrGRDglt4xkOLqvHG7K4 |

---

## 📁 Supabase Storage ✅ 実装完了

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

### 作成SQL ✅ 適用済み

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
| **Supabase Storage** | **1GB** | **約5,000枚** | **✅ 採用** |

---

## 🖼️ 画像データ構造（v1.3.0 - 2026-01-22更新）

### ⚠️ 重要: pathフィールドは必須

`path`フィールドがないと、署名付きURL期限切れ時に画像を復元できません。

| フィールド | 必須 | 用途 |
|-----------|------|------|
| url | ✅ | 署名付きURL（表示用、期限あり） |
| **path** | ⚠️**必須** | Storage内パス（復元用） |
| title | - | 画像の題名（最大30文字） |
| description | - | 画像の説明（最大100文字） |

### tradesテーブル - chart_images

```javascript
// chart_images カラム（JSONB配列）
[
    {
        type: "chart1",                              // 画像タイプ
        url: "https://xxx.supabase.co/storage/v1/object/sign/...",  // 署名付きURL
        path: "userId/trades/tradeId/chart1.jpg",   // ⚠️ Storage内パス（必須）
        title: "エントリー時の日足",                  // 題名（最大30文字）
        description: "サポートラインブレイク後",      // 説明（最大100文字）
        timestamp: "2026-01-22T10:30:00.000Z"       // 追加日時
    },
    {
        type: "chart2",
        url: "https://xxx.supabase.co/storage/v1/object/sign/...",
        path: "userId/trades/tradeId/chart2.jpg",
        title: "決済時の4時間足",
        description: "目標達成で利確",
        timestamp: "2026-01-22T15:00:00.000Z"
    }
]
```

### notesテーブル - content.images

```javascript
// content カラム（JSON文字列）
{
    "memo": "ドル円は上昇トレンド継続中",
    "marketView": "米雇用統計後の動きに注目",
    "images": [
        {
            "type": "image1",
            "url": "https://xxx.supabase.co/storage/v1/object/sign/...",
            "path": "userId/notes/2026-01-22/image1.jpg",  // ⚠️ 必須
            "title": "週足の状況",
            "description": "上昇トレンド継続中、押し目待ち",
            "timestamp": "2026-01-22T08:00:00.000Z"
        }
    ]
}
```

### 署名付きURLの有効期限

| 設定 | 値 |
|------|-----|
| デフォルト有効期間 | 7日間（604800秒） |
| 期限切れ判定 | 1時間前から期限切れとみなす |
| 自動更新 | imageUtils.js `getValidImageSrc()` で対応 |

### URL期限切れ時の自動更新フロー

```
1. 画像表示時に isUrlExpired(img) で期限切れ判定
2. 期限切れの場合、img.path から新しい署名付きURLを生成
3. 元のオブジェクトの url を更新
4. 新しいURLで画像を表示
```

---

## 1. trades テーブル（最終構成：30カラム）✅ 同期完了

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
  
  -- 画像（URL配列）
  chart_images JSONB DEFAULT '[]',
  
  -- 追加カラム
  scenario TEXT,
  status TEXT DEFAULT 'open',
  reasons JSONB DEFAULT '[]',
  entry_emotion TEXT,
  
  -- タグ（Phase 7.2で追加）
  tags JSONB DEFAULT '[]',
  
  -- リスク管理（Phase 7で追加）
  method_id TEXT,
  risk_tolerance DECIMAL,
  stop_loss_pips DECIMAL,
  quote_currency_rate DECIMAL,
  calculated_lot DECIMAL,
  risk_status TEXT,
  is_over_risk BOOLEAN,
  
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

### 1.2 全カラム一覧（30カラム）

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
| 16 | chart_images | jsonb | チャート画像（URL配列）※詳細は上記参照 |
| 17 | scenario | text | シナリオ |
| 18 | status | text | ステータス |
| 19 | reasons | jsonb | エントリー理由配列 |
| 20 | entry_emotion | text | エントリー時感情 |
| 21 | created_at | timestamp | 作成日時 |
| 22 | updated_at | timestamp | 更新日時 |
| 23 | method_id | text | 手法ID |
| 24 | risk_tolerance | numeric | 許容損失額（円）※エントリー時点 |
| 25 | stop_loss_pips | numeric | 損切り幅（pips） |
| 26 | quote_currency_rate | numeric | 決済通貨レート |
| 27 | calculated_lot | numeric | 計算された適正ロット |
| 28 | risk_status | text | リスク状態（normal/warning/danger） |
| 29 | is_over_risk | boolean | 許容損失超過フラグ |
| 30 | tags | jsonb | タグ配列（セッション・曜日等） |

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
| chartImages | chart_images | jsonb | 配列形式（URL+path+title+description） |
| scenario | scenario | text | |
| status / holdingStatus | status | text | 'open' / 'closed' |
| reasons | reasons | jsonb | 配列形式 |
| entryEmotion | entry_emotion | text | |
| createdAt / timestamp | created_at | timestamp | |
| updatedAt | updated_at | timestamp | |
| methodId | method_id | text | 手法ID |
| riskTolerance | risk_tolerance | numeric | 許容損失額（エントリー時点） |
| stopLossPips | stop_loss_pips | numeric | 損切り幅(pips) |
| quoteCurrencyRate | quote_currency_rate | numeric | 決済通貨レート |
| calculatedLot | calculated_lot | numeric | 適正ロット |
| riskStatus | risk_status | text | リスク状態 |
| isOverRisk | is_over_risk | boolean | 超過フラグ |
| tags | tags | jsonb | 配列形式 ["東京時間", "月曜", "ロング"] |

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
    images: [{ url: "...", path: "...", title: "...", description: "...", timestamp: "..." }] 
  }
}
```

**Supabase保存形式**: contentカラムにJSON文字列
```javascript
content: '{"memo":"...","marketView":"...","images":[{"url":"...","path":"...","title":"...","description":"..."}]}'
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

### 3.4 user_settings テーブル ✅ 同期完了（v1.7.0で拡張）

```sql
CREATE TABLE user_settings (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  brokers JSONB DEFAULT '[]',
  favorite_pairs JSONB DEFAULT '[]',
  monthly_memos JSONB DEFAULT '{}',
  closed_periods JSONB DEFAULT '[]',
  goals JSONB DEFAULT '{}',           -- v1.5.3で追加
  user_icon TEXT DEFAULT NULL,         -- v1.5.3で追加
  site_title TEXT DEFAULT NULL,        -- v1.7.0で追加
  subtitle TEXT DEFAULT NULL,          -- v1.7.0で追加
  self_image TEXT DEFAULT NULL,        -- v1.7.0で追加（未使用）
  year_start_balances JSONB DEFAULT '{}',  -- v1.8.0で追加（年初口座残高）
  
  -- トレード分析強化（Phase 7で追加）
  methods JSONB DEFAULT '[]',          -- 手法管理
  risk_tolerance DECIMAL,              -- 許容損失設定（円）
  show_broker_badge BOOLEAN DEFAULT true,  -- ブローカーバッジ表示
  
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
| goals | `goalsData`, `goalText1`〜`goalAchieved3` | SettingsModule |
| user_icon | `userIcon` | SettingsModule |
| site_title | `siteTitle` | SettingsModule |
| subtitle | `siteSubtitle` | SettingsModule |
| self_image | （未使用） | - |
| year_start_balances | `yearStartBalances` | SettingsModule |
| methods | `tc_methods` | SettingsModule |
| risk_tolerance | `tc_risk_tolerance` | SettingsModule |
| show_broker_badge | `tc_show_broker_badge` | SettingsModule |

**同期方式**: 一括保存（12のlocalStorageを1レコードにまとめて保存）

---

## 4. SyncModule.js 実装状況

### 4.1 SyncModule.js v1.8.0 ✅ 完成

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
| `saveUserSettings()` | user_settings | 8つのlocalStorage一括保存 |
| `fetchUserSettings()` | user_settings | 設定取得 |
| `syncUserSettingsToLocal()` | user_settings | クラウド→ローカル展開 |
| `migrateUserSettingsFromLocal()` | user_settings | ローカル→クラウド移行 |
| **goals (v1.5.3)** | | |
| `syncGoalsToCloud()` | user_settings | goals同期（Cloud→） |
| `syncGoalsToLocal()` | user_settings | goals同期（→Local） |

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
| 2026-01-05 | Supabase Storage 画像アップロードテスト | ✅ 成功 |
| 2026-01-09 | goals/icon 同期テスト | ✅ 成功 |
| 2026-01-14 | セキュリティテスト（XSS対策） | ✅ 成功 |
| 2026-01-15 | siteTitle/subtitle 同期テスト | ✅ 成功 |
| **2026-01-22** | **画像 title/description/path 同期テスト** | **✅ 成功** |
| **2026-01-22** | **URL期限切れ自動更新テスト** | **✅ 成功** |
| **2026-02-02** | **year_start_balances 同期テスト** | **✅ 成功** |

---

## 5. Phase 完了サマリー

### Phase 4 完了

| Phase | 内容 | 完了日 |
|-------|------|--------|
| 4.1-4.3 | SyncModule + 全5テーブル同期 | 2026-01-04 |
| 4.4 | マイページ変更機能 | 2026-01-14 |
| 4.5 | Supabase Storage | 2026-01-05 |
| 4.6 | スマホ相場ノート | 2026-01-09 |
| 4.7 | goals/icon同期 | 2026-01-09 |
| 4.8 | セキュリティ適用 | 2026-01-14 |
| 4.9 | 初回移行フロー | スキップ |
| 4.10 | siteTitle/subtitle同期 | 2026-01-15 |

### Phase 5 テスト完了（2026-01-15）

| テーブル | RLSテスト | 結果 |
|---------|-----------|------|
| trades | 自分のデータのみ取得可能 | ✅ |
| notes | 自分のデータのみ取得可能 | ✅ |
| expenses | 自分のデータのみ取得可能 | ✅ |
| capital_records | 自分のデータのみ取得可能 | ✅ |
| user_settings | 自分のデータのみ取得可能 | ✅ |

### Phase 6 画像説明欄対応（2026-01-22）

| 項目 | 内容 | 結果 |
|------|------|------|
| 画像データ構造拡張 | title, description, path追加 | ✅ |
| SyncModule.js修正 | #uploadTradeImages, #uploadNoteImages | ✅ |
| imageUtils.js v1.3.0 | URL期限切れ自動更新 | ✅ |
| 既存データ復元 | 復元スクリプト実行 | ✅ |

---

## 6. 既知の制限

| 項目 | 状態 | 対応 |
|------|------|------|
| ~~オフライン保存~~ | ~~リロードでクラウドに上書き~~ | ✅ 対応済み（SyncModule v1.8.0 差分マージ機能 / 2026-03-09） |
| 同時編集 | Last Write Wins（後勝ち） | 現状維持 |
| 署名付きURL有効期限 | 7日間 | imageUtils.jsで自動更新 |

---

## 更新履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| Phase 2版 | 2025-12-17 | 初版（テーブル定義のみ） |
| Phase 4版 | 2025-12-30 | trades 4カラム追加、SyncModule実装、マッピング詳細追加 |
| Phase 4完了版 | 2026-01-04 | 全5テーブル同期完了、SyncModule v1.4.0、Supabase Storage設計追加 |
| Phase 4最終版 | 2026-01-14 | Phase 4全完了、Storage実装完了、goals/icon同期追加、SyncModule v1.6.0、user_settingsカラム追加 |
| Phase 4最終版+ | 2026-01-15 | site_title/subtitle/self_imageカラム追加、SyncModule v1.7.0 |
| Phase 5テスト完了版 | 2026-01-15 | Phase 5テスト完了、RLSテスト結果・パフォーマンス・既知の制限追記 |
| **Phase 6画像説明欄対応版** | **2026-01-22** | **画像データ構造詳細追加（title/description/path）、URL期限切れ対応、imageUtils.js v1.3.0** |
| **Phase 7リスク管理対応版** | **2026-01-29** | **tradesテーブル: リスク管理7カラム追加（22→29カラム）、user_settingsテーブル: methods/risk_tolerance/show_broker_badge追加、SyncModule.js対応** |
| **Phase 7.1利益率機能対応版** | **2026-02-02** | **year_start_balancesカラム追加、SyncModule v1.8.0** |
| **Phase 7.2 tags対応版** | **2026-02-17** | **tradesテーブル: tagsカラム追加（29→30カラム）、SyncModule.js双方向マッピング追加** |
| **オフライン差分マージ対応版** | **2026-03-09** | **SyncModule v1.8.0: オフライン復帰時の差分マージ機能実装。既知の制限「オフライン保存」解決済みに更新** |

---

*このドキュメントをPhase 7.2以降の開発で参照してください。*
