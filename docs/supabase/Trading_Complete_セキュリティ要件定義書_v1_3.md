# Trading Complete セキュリティ要件定義書 v1.3

**作成日**: 2025-12-19  
**更新日**: 2026-01-04  
**対象**: Trading Complete（金融系トレード記録システム）  
**目的**: ユーザーの金融データを安全に保護するためのセキュリティ設計

---

## 📋 目次

1. [セキュリティ方針](#1-セキュリティ方針)
2. [現状分析](#2-現状分析)
3. [セキュリティ要件一覧](#3-セキュリティ要件一覧)
4. [認証・セッション管理](#4-認証セッション管理)
5. [データアクセス制御](#5-データアクセス制御)
6. [入力値検証・XSS対策](#6-入力値検証xss対策)
7. [localStorageデータ検証](#7-localstorageデータ検証)
8. [Supabase Storage セキュリティ](#8-supabase-storage-セキュリティ) 🆕
9. [通信セキュリティ](#9-通信セキュリティ)
10. [エラーハンドリング](#10-エラーハンドリング)
11. [監査・ログ](#11-監査ログ)
12. [将来のセキュリティ拡張](#12-将来のセキュリティ拡張)
13. [実装スケジュール](#13-実装スケジュール)
14. [セキュリティテスト項目](#14-セキュリティテスト項目)
15. [実装済みコンポーネント詳細](#15-実装済みコンポーネント詳細)

---

## 1. セキュリティ方針

### 基本原則

| 原則 | 説明 |
|------|------|
| **最小権限** | ユーザーは自分のデータのみアクセス可能 |
| **多層防御** | 複数のセキュリティ層で保護 |
| **デフォルト拒否** | 明示的に許可されない限りアクセス拒否 |
| **安全な失敗** | エラー時は安全側に倒す |

### 金融データとしての特別な配慮

```
Trading Completeが扱うデータ:
├── トレード履歴（損益情報）
├── 入出金記録（口座残高）
├── 経費データ（確定申告関連）
├── 個人設定（ブローカー情報）
└── チャート画像（トレード分析）🆕

→ すべて「個人の金融情報」として厳重に保護
```

---

## 2. 現状分析

### ✅ 実装済みセキュリティ（Phase 4まで完了）

| 項目 | 状態 | 実装Phase | 完了日 |
|------|------|-----------|--------|
| HTTPS通信 | ✅ 完了 | GitHub Pages標準 | - |
| パスワード強度検証 | ✅ 完了 | Phase 3 | 2025-12-18 |
| メール確認 | ✅ 完了 | Phase 3 | 2025-12-18 |
| RLS（行レベルセキュリティ） | ✅ 完了 | Phase 2 | 2025-12-17 |
| anon keyのみ使用 | ✅ 完了 | Phase 1 | 2025-12-17 |
| セッションタイムアウト（24h） | ✅ 完了 | Phase 3.6 | 2025-12-30 |
| XSS対策（SecurityUtils） | ✅ 完了 | Phase 3.6 | 2025-12-30 |
| 入力値サニタイズ（InputValidator） | ✅ 完了 | Phase 3.6 | 2025-12-30 |
| localStorageデータ検証（StorageValidator） | ✅ 完了 | Phase 3.6 | 2025-12-30 |
| セキュアエラーメッセージ（SecureError） | ✅ 完了 | Phase 3.6 | 2025-12-30 |
| **データ同期（5テーブル）** | ✅ 完了 | Phase 4.1-4.3 | 2026-01-04 |

### 🔄 実装中

| 項目 | 優先度 | 対応Phase |
|------|--------|-----------|
| **Supabase Storage RLS** | 高 | Phase 4.5 |
| 入力フォームへのサニタイズ適用 | 高 | Phase 4.6 |

### ⚠️ 未実装・要強化

| 項目 | 優先度 | 対応Phase |
|------|--------|-----------|
| CSRFトークン | 低 | Supabase対応済み |
| 2段階認証 | 低 | 将来 |

---

## 3. セキュリティ要件一覧

### 必須要件（Must Have）- ✅ Phase 3.6で実装完了

| ID | 要件 | 説明 | 状態 |
|----|------|------|------|
| SEC-001 | セッションタイムアウト | 24時間で自動ログアウト | ✅ 完了 |
| SEC-002 | XSS対策 | ユーザー入力のサニタイズ | ✅ 完了 |
| SEC-003 | 入力値検証 | 数値・日付・テキストの検証 | ✅ 完了 |
| SEC-004 | セキュアエラー | 詳細エラーを非表示 | ✅ 完了 |
| SEC-005 | RLS確認 | 全テーブルのRLS動作確認 | ✅ 完了 |
| SEC-006 | ログアウト完全性 | セッション・キャッシュのクリア | ✅ 完了 |
| SEC-007 | localStorageデータ検証 | 読み込み時のデータ形式検証 | ✅ 完了 |
| **SEC-008** | **Storage RLS** | **画像ファイルのアクセス制御** | **🔄 Phase 4.5** |

### 推奨要件（Should Have）- リリース後

| ID | 要件 | 説明 | 状態 |
|----|------|------|------|
| SEC-009 | ログイン試行制限 | 5回失敗で15分ロック | ⬜ |
| SEC-010 | パスワードリセット | メール経由のリセット機能 | ⬜ |
| SEC-011 | セッション管理 | 他端末ログアウト機能 | ⬜ |

### 将来要件（Could Have）- v2.0以降

| ID | 要件 | 説明 | 状態 |
|----|------|------|------|
| SEC-012 | 2段階認証 | TOTP対応 | ⬜ |
| SEC-013 | ログイン履歴 | 不審アクセス検知 | ⬜ |
| SEC-014 | データ暗号化 | localStorage暗号化 | ⬜ |
| SEC-015 | エクスポート暗号化 | パスワード付きバックアップ | ⬜ |

---

## 4. 認証・セッション管理

### SEC-001: セッションタイムアウト ✅ 実装完了

**設定値**: 24時間（86400秒）

**実装**: AuthModule.js v1.1.0

```javascript
// AuthModule.js - セッション監視
#startSessionMonitor() {
    // 5分ごとにセッション有効期限をチェック
    this.#sessionCheckInterval = setInterval(() => {
        this.#checkSessionExpiry();
    }, 5 * 60 * 1000);
}

#checkSessionExpiry() {
    const session = this.#session;
    if (!session?.expires_at) return;
    
    const expiresAt = new Date(session.expires_at * 1000);
    const now = new Date();
    
    if (now >= expiresAt) {
        this.#showSessionExpiredModal();
    }
}
```

**UI**: セッション切れ時にモーダル表示（index.html #sessionExpiredModal）

---

## 5. データアクセス制御

### SEC-005: RLS（Row Level Security）✅ 全テーブル確認済み

| テーブル | ポリシー | 確認状態 | 同期状態 |
|---------|---------|---------|---------|
| trades | `auth.uid() = user_id` | ✅ | ✅ 同期完了 |
| notes | `auth.uid() = user_id` | ✅ | ✅ 同期完了 |
| expenses | `auth.uid() = user_id` | ✅ | ✅ 同期完了 |
| capital_records | `auth.uid() = user_id` | ✅ | ✅ 同期完了 |
| user_settings | `auth.uid() = user_id` | ✅ | ✅ 同期完了 |

---

## 6. 入力値検証・XSS対策

### SEC-002: XSS対策 ✅ 実装完了

**ファイル**: `js/core/security.js`

```javascript
const SecurityUtils = {
    escapeHtml(text) {
        if (typeof text !== 'string') return text;
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, char => map[char]);
    },
    
    sanitizeNumber(value, defaultValue = 0) { ... },
    sanitizePositiveNumber(value, defaultValue = 0) { ... },
    sanitizeDate(value) { ... },
    sanitizePair(value) { ... },
    truncateText(text, maxLength = 1000) { ... },
    sanitizeUrl(url) { ... },
    sanitizeDirection(value) { ... }
};
```

### SEC-003: 入力値検証 ✅ 実装完了

（内容は前バージョンと同じ - 省略）

---

## 7. localStorageデータ検証

### SEC-007: localStorageデータ検証 ✅ 実装完了

（内容は前バージョンと同じ - 省略）

### 適用済みモジュール一覧

| モジュール | データキー | 検証関数 | 状態 |
|-----------|-----------|---------|------|
| SettingsModule.js | `brokers` | `isBrokersFormat` | ✅ |
| SettingsModule.js | `favoritePairs` | `isFavoritePairsFormat` | ✅ |
| SettingsModule.js | `goalsData` | `isGoalsFormat` | ✅ |
| TradeManager-nomodule.js | `trades` | `isTradesFormat` | ✅ |
| NoteManagerModule.js | `notes` | `isObject` | ✅ |
| NoteManagerModule.js | `monthlyMemos` | `isMonthlyMemosFormat` | ✅ |
| NoteManagerModule.js | `collapseState` | `isObject` | ✅ |
| ExpenseManagerModule.js | `expenses` | `isArray` | ✅ |
| ExpenseManagerModule.js | `accordion state` | `isObject` | ✅ |
| CapitalManagerModule.js | `depositWithdrawals` | `isArray` | ✅ |
| ClosingManagerModule.js | `tc_closed_periods` | `isClosedPeriodsFormat` | ✅ |

---

## 8. Supabase Storage セキュリティ 🆕

### SEC-008: Storage RLS（Phase 4.5で実装予定）

**バケット名**: `trade-images`

**フォルダ構造**:
```
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

### RLSポリシー設計

```sql
-- バケット作成（private）
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

### セキュリティポイント

| ポイント | 説明 |
|---------|------|
| **非公開バケット** | `public: false` で外部アクセス不可 |
| **ユーザー分離** | user_idフォルダでデータ分離 |
| **RLSポリシー** | 自分のフォルダのみCRUD可能 |
| **署名付きURL** | 画像表示時は署名付きURLを生成 |

### 画像アップロード時の検証

```javascript
// ImageHandler.uploadToCloud() で実装予定
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async uploadToCloud(file, path) {
    // ファイルタイプ検証
    if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error('許可されていないファイル形式です');
    }
    
    // ファイルサイズ検証
    if (file.size > MAX_FILE_SIZE) {
        throw new Error('ファイルサイズが5MBを超えています');
    }
    
    // アップロード実行
    const { data, error } = await supabase.storage
        .from('trade-images')
        .upload(path, file);
    
    if (error) throw error;
    
    // 署名付きURLを返す（1時間有効）
    const { data: urlData } = await supabase.storage
        .from('trade-images')
        .createSignedUrl(path, 3600);
    
    return urlData.signedUrl;
}
```

---

## 9. 通信セキュリティ

### 現状（✅ 対応済み）

| 項目 | 状態 | 説明 |
|------|------|------|
| HTTPS | ✅ | GitHub Pages標準 |
| API通信 | ✅ | Supabaseは全てHTTPS |
| APIキー | ✅ | anon keyのみ（公開可） |
| **Storage通信** | ✅ | **HTTPS + 署名付きURL** 🆕 |

---

## 10. エラーハンドリング

### SEC-004: セキュアなエラーメッセージ ✅ 実装完了

（内容は前バージョンと同じ - 省略）

---

## 11. 監査・ログ

（変更なし - v1.2と同じ）

---

## 12. 将来のセキュリティ拡張

（変更なし - v1.2と同じ）

---

## 13. 実装スケジュール

### Phase 3.6（セキュリティ基盤）✅ 完了

| 項目 | 状態 | 完了日 |
|------|------|--------|
| security.js 作成 | ✅ | 2025-12-30 |
| SecurityUtils 実装 | ✅ | 2025-12-30 |
| InputValidator 実装 | ✅ | 2025-12-30 |
| SecureError 実装 | ✅ | 2025-12-30 |
| StorageValidator 実装 | ✅ | 2025-12-30 |
| セッションタイムアウト設定 | ✅ | 2025-12-30 |
| 各モジュールのlocalStorage読み込み修正 | ✅ | 2025-12-30 |

### Phase 4（データ同期）✅ 一部完了

| 項目 | 状態 | 完了日 |
|------|------|--------|
| trades 同期 | ✅ | 2025-12-30 |
| notes 同期 | ✅ | 2026-01-03 |
| expenses 同期 | ✅ | 2026-01-04 |
| capital_records 同期 | ✅ | 2026-01-04 |
| user_settings 同期 | ✅ | 2026-01-04 |

### Phase 4.5（Supabase Storage）🔄 進行中

| 項目 | 状態 |
|------|------|
| Storageバケット作成 | ⬜ |
| Storage RLSポリシー設定 | ⬜ |
| ImageHandler.uploadToCloud() 実装 | ⬜ |
| 画像アップロード時の検証 | ⬜ |

### Phase 4.6（サニタイズ適用）⬜ 未着手

| 項目 | 状態 |
|------|------|
| TradeEntry.js にサニタイズ適用 | ⬜ |
| TradeEdit.js にサニタイズ適用 | ⬜ |
| NoteManagerModule にサニタイズ適用 | ⬜ |
| ExpenseManagerModule にサニタイズ適用 | ⬜ |
| SyncModule エラーハンドリング適用 | ⬜ |

---

## 14. セキュリティテスト項目

### 認証テスト ✅ 一部実施済み

（内容は前バージョンと同じ - 省略）

### XSSテスト ✅ テスト済み（2025-12-30）

（内容は前バージョンと同じ - 省略）

### 入力値検証テスト ✅ テスト済み（2025-12-30）

（内容は前バージョンと同じ - 省略）

### Storageテスト ⬜ Phase 4.5で実施予定 🆕

| # | テスト項目 | 期待結果 | 状態 |
|---|-----------|---------|------|
| 30 | 自分の画像をアップロード | 成功 | ⬜ |
| 31 | 自分の画像を取得 | 成功 | ⬜ |
| 32 | 他人の画像にアクセス | 失敗（403） | ⬜ |
| 33 | 許可されていないファイル形式 | 失敗 | ⬜ |
| 34 | 5MBを超えるファイル | 失敗 | ⬜ |

---

## 15. 実装済みコンポーネント詳細

### security.js v1.0.1

（内容は前バージョンと同じ - 省略）

### AuthModule.js v1.1.0

（内容は前バージョンと同じ - 省略）

### SyncModule.js v1.4.0 🆕

**ファイルパス**: `js/sync/SyncModule.js`
**バージョン**: 1.4.0
**更新日**: 2026-01-04

**変更履歴**:
- v1.0.1 (2025-12-30): trades同期実装
- v1.1.1 (2026-01-03): notes同期追加
- v1.2.0 (2026-01-04): expenses同期追加
- v1.3.0 (2026-01-04): capital_records同期追加
- v1.4.0 (2026-01-04): user_settings同期追加（一括保存方式）

**セキュリティ機能**:
- ログイン必須チェック（`#userId`がなければ拒否）
- RLSによるユーザーデータ分離
- EventBus連携（同期状態の通知）

---

## 📋 チェックリスト（Phase 4完了確認）

### Supabase設定

- [x] セッション有効期限を24時間に設定
- [x] 全テーブルのRLSが有効
- [x] 全テーブルのポリシーが正しい
- [ ] Storageバケット作成 → Phase 4.5
- [ ] Storage RLSポリシー設定 → Phase 4.5

### ファイル作成

- [x] js/core/security.js 作成
- [x] js/sync/SyncModule.js 作成（v1.4.0）
- [ ] ImageHandler.uploadToCloud() 実装 → Phase 4.5

### データ同期

- [x] trades 同期完了
- [x] notes 同期完了
- [x] expenses 同期完了
- [x] capital_records 同期完了
- [x] user_settings 同期完了
- [ ] 画像（Supabase Storage）→ Phase 4.5

---

## 更新履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.0 | 2025-12-19 | 初版作成 |
| v1.1 | 2025-12-19 | SEC-007 localStorageデータ検証を追加 |
| v1.2 | 2025-12-30 | Phase 3.6完了を反映、テスト結果追記 |
| **v1.3** | **2026-01-04** | **Phase 4データ同期完了を反映、SEC-008 Supabase Storage RLS追加、SyncModule v1.4.0追記** |

---

*このドキュメントは、Trading Completeのセキュリティ実装の指針として使用してください。*
