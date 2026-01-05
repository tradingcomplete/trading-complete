# Supabase導入 ロードマップ・要件定義書 v1.9

**作成日**: 2025-12-17  
**更新日**: 2026-01-05  
**プロジェクト**: Trading Complete  
**目的**: ログイン機能・クラウドデータ同期の実装

---

## ⚠️ 重要原則: MODULES.md準拠

**すべての実装はMODULES.mdに沿って行うこと**

| 原則 | 説明 |
|------|------|
| モジュールパターン | クラス形式、プライベートフィールド(#)、EventBus統合 |
| 責任の集約 | 認証→AuthModule、設定→SettingsModule、同期→SyncModule |
| グローバル関数 | モジュールメソッドへの橋渡しのみ（ロジックは書かない） |
| UI/ロジック分離 | HTMLはUIのみ、ロジックはモジュール内 |

**禁止事項**:
- index.htmlの`<script>`タグ内にビジネスロジックを書く
- グローバル関数に直接ロジックを実装する
- モジュール外でlocalStorageを直接操作する

---

## 🔐 重要原則: セキュリティ

**金融データを扱うシステムとして、セキュリティを最優先する**

| 原則 | 説明 |
|------|------|
| 最小権限 | ユーザーは自分のデータのみアクセス可能（RLS） |
| 入力値検証 | すべての入力をサニタイズ・検証 |
| セキュアエラー | 攻撃者にヒントを与えない |
| セッション管理 | 24時間で自動ログアウト |

**詳細**: Trading_Complete_セキュリティ要件定義書_v1_3.md

---

## 🌐 ドメイン構成（確定）

| URL | 用途 | ホスティング | 状態 |
|-----|------|-------------|------|
| tradingcomplete.com | ランディングページ（製品紹介・LINE登録） | 現状維持 | ✅ 稼働中 |
| app.tradingcomplete.com | アプリ本体（トレード記録システム） | GitHub Pages | 🔜 リリース時 |

### メリット
- ランディングページとアプリを分離
- プロフェッショナルな印象
- マーケティングしやすい構成

---

## 📋 目次

1. [現状分析](#1-現状分析)
2. [導入目標](#2-導入目標)
3. [全体スケジュール](#3-全体スケジュール)
4. [Phase 1: 準備・環境構築](#phase-1-準備環境構築) ✅ 完了
5. [Phase 2: データベース設計](#phase-2-データベース設計) ✅ 完了
6. [Phase 3: 認証実装](#phase-3-認証実装) ✅ 完了
7. [Phase 3.5: マイページUI作成](#phase-35-マイページui作成) ✅ 完了
8. [Phase 3.6: セキュリティ基盤](#phase-36-セキュリティ基盤) ✅ 完了
9. [Phase 4: データ同期実装](#phase-4-データ同期実装) 🔄 進行中
10. [Phase 5: 統合テスト・本番準備・リリース](#phase-5-統合テスト本番準備リリース)
11. [ファイル構成](#ファイル構成)
12. [リスクと対策](#リスクと対策)

---

## 1. 現状分析

### 1.1 システム概要

| 項目 | 現状 |
|------|------|
| アプリ完成度 | 95-97%（ローカル版） |
| コード規模 | 約50,000行（HTML/CSS/JavaScript） |
| データ保存 | localStorage（ブラウザ内のみ） |
| ホスティング | GitHub Pages |
| ユーザー | なし（開発者のみ） |

### 1.2 既存データ構造（localStorage）

| キー | 内容 | 移行対象 | 同期状態 |
|------|------|---------|----------|
| `trades` | トレード記録 | ✅ 必須 | ✅ 完了 |
| `notes` | 相場ノート | ✅ 必須 | ✅ 完了 |
| `expenses` | 経費データ | ✅ 必須 | ✅ 完了 |
| `depositWithdrawals` | 入出金記録 | ✅ 必須 | ✅ 完了 |
| `tc_closed_periods` | 締め期間 | ✅ 必須 | ✅ 完了 |
| `brokers` | ブローカー設定 | ✅ 必須 | ✅ 完了 |
| `favoritePairs` | お気に入り通貨ペア | ✅ 必須 | ✅ 完了 |
| `monthlyMemos` | 月メモ | ✅ 必須 | ✅ 完了 |
| `theme` | テーマ設定 | ⚠️ ローカルのみ | - |
| `goalsData` | 目標設定 | ⚠️ ローカルのみ | - |

---

## 2. 導入目標

### 2.1 必須要件（Must Have）

| 要件 | 説明 | 状態 |
|------|------|------|
| ユーザー認証 | メール/パスワードでログイン | ✅ 完了 |
| アクセス制御 | 未ログインユーザーはアプリ使用不可 | ✅ 完了 |
| セキュリティ基盤 | XSS対策、入力検証、セッション管理 | ✅ 完了 |
| データ同期 | localStorage ↔ Supabase 双方向同期 | ✅ 完了 |
| データ分離 | ユーザーごとにデータを分離（RLS） | ✅ 完了 |
| マイページ | アカウント情報管理・ログアウト | ✅ 完了 |
| **画像ストレージ** | **Supabase Storageで画像保存** | **✅ 完了** |

### 2.2 推奨要件（Should Have）

| 要件 | 説明 | 状態 |
|------|------|------|
| Google OAuth | Googleアカウントでログイン | ⬜ 将来 |
| パスワードリセット | メールでリセットリンク送信 | ⬜ 将来 |
| 初回移行 | 既存localStorageデータをクラウドへ移行 | ⬜ Phase 4 |

### 2.3 将来要件（Could Have）

| 要件 | 説明 |
|------|------|
| 2段階認証 | TOTP対応 |
| 保存方式選択 | ローカルのみ / クラウド同期 を選択可能 |
| オフライン対応 | オフライン時はローカルに保存、復帰時に同期 |
| アカウント削除 | 退会機能（確認ダイアログ必須） |

---

## 3. 全体スケジュール

### 3.1 フェーズ一覧

| Phase | 内容 | 工数目安 | 状態 |
|-------|------|---------|------|
| **Phase 1** | 準備・環境構築 | 1日 | ✅ **完了** |
| **Phase 2** | データベース設計 | 2-3日 | ✅ **完了** |
| **Phase 3** | 認証実装 | 4-5日 | ✅ **完了** |
| **Phase 3.5** | マイページUI作成 | 1-2日 | ✅ **完了** |
| **Phase 3.6** | セキュリティ基盤 | 1-2日 | ✅ **完了** |
| **Phase 4** | データ同期実装 | 5-7日 | 🔄 **進行中** |
| **Phase 5** | 統合テスト・本番準備・リリース | 3-4日 | ⬜ 未着手 |

**合計工数**: 約3週間

### 3.2 マイルストーン

```
Week 1: Phase 1-2 完了（環境構築 + DB設計）✅ 完了！
Week 2: Phase 3-3.5 完了（認証 + マイページ）✅ 完了！
Week 3: Phase 3.6 完了（セキュリティ基盤）✅ 完了！
Week 4: Phase 4 完了（データ同期）← 現在進行中
Week 5: Phase 5 完了（テスト + 本番準備）
```

---

## Phase 1: 準備・環境構築 ✅ 完了

（内容は前バージョンと同じ - 省略）

**完了日**: 2025-12-17

---

## Phase 2: データベース設計 ✅ 完了

（内容は前バージョンと同じ - 省略）

**完了日**: 2025-12-17

---

## Phase 3: 認証実装 ✅ 完了

（内容は前バージョンと同じ - 省略）

**完了日**: 2025-12-18

---

## Phase 3.5: マイページUI作成 ✅ 完了

（内容は前バージョンと同じ - 省略）

**完了日**: 2025-12-19

---

## Phase 3.6: セキュリティ基盤 ✅ 完了

（内容は前バージョンと同じ - 省略）

**完了日**: 2025-12-30

---

## Phase 4: データ同期実装 🔄 進行中

### 4.1 SyncModule作成 ✅ 完了

| Step | タスク | 状態 | 完了日 |
|------|--------|------|--------|
| 4.1.1 | SyncModule.js新規作成 | ✅ | 2025-12-30 |
| 4.1.2 | initialize() 実装 | ✅ | 2025-12-30 |
| 4.1.3 | saveTrade() / deleteTrade() 実装 | ✅ | 2025-12-30 |
| 4.1.4 | fetchAllTrades() 実装 | ✅ | 2025-12-30 |
| 4.1.5 | migrateTradesFromLocal() 実装 | ✅ | 2025-12-30 |
| 4.1.6 | EventBus連携実装 | ✅ | 2025-12-30 |

### 4.2 TradeManager統合 ✅ 完了

| Step | タスク | 状態 | 完了日 |
|------|--------|------|--------|
| 4.2.1 | TradeManager修正方針決定 | ✅ | 2025-12-30 |
| 4.2.2 | _syncToCloud() 実装 | ✅ | 2025-12-30 |
| 4.2.3 | _deleteFromCloud() 実装 | ✅ | 2025-12-30 |
| 4.2.4 | 自動同期テスト | ✅ | 2025-12-30 |

### 4.3 他モジュール対応 ✅ 完了

| Step | タスク | テーブル | 状態 | 完了日 |
|------|--------|---------|------|--------|
| 4.3.1 | NoteManagerModule対応 | notes | ✅ | 2026-01-03 |
| 4.3.2 | ExpenseManagerModule対応 | expenses | ✅ | 2026-01-04 |
| 4.3.3 | CapitalManagerModule対応 | capital_records | ✅ | 2026-01-04 |
| 4.3.4 | user_settings一括同期 | user_settings | ✅ | 2026-01-04 |

### 4.4 マイページ変更機能

| Step | タスク | 状態 |
|------|--------|------|
| 4.4.1 | ユーザーネーム変更機能 | ⬜ |
| 4.4.2 | メールアドレス変更機能 | ⬜ |
| 4.4.3 | パスワード変更機能 | ⬜ |

### 4.5 Supabase Storage（画像保存）✅ 完了

| Step | タスク | 状態 |
|------|--------|------|
| 4.5.1 | Supabase Storageバケット作成（trade-images） | ✅ |
| 4.5.2 | RLSポリシー設定（ユーザー別アクセス制限） | ✅ |
| 4.5.3 | ImageHandler v1.1.0（uploadToCloud実装） | ✅ |
| 4.5.4 | SyncModule v1.5.0（画像アップロード統合） | ✅ |
| 4.5.5 | トレード画像保存時のURL変換 | ✅ |
| 4.5.6 | 画像表示対応（imageUtils.js, TradeDetail.js） | ✅ |
| 4.5.7 | ノート画像保存時のURL変換（SyncModule v1.5.2） | ✅ |
| 4.5.8 | 既存Base64画像の移行処理 | ⏭️ スキップ（テストデータのため不要） |

**完了日**: 2026-01-05

**実装成果**:
- ImageHandler v1.1.0: uploadToCloud, getSignedUrl, deleteFromCloud, base64ToBlob
- SyncModule v1.5.2: #uploadTradeImages, #uploadNoteImages（両形式対応）
- imageUtils.js: getImageSrc, hasValidImage, isUrlImage, isBase64Image
- TradeDetail.js: URL/Base64両形式の画像表示対応

**Supabase Storage設計**:

```
バケット名: trade-images
├── {user_id}/
│   ├── trades/
│   │   └── {trade_id}/
│   │       ├── chart1.jpg
│   │       ├── chart2.jpg
│   │       └── chart3.jpg
│   └── notes/
│       └── {date}/
│           └── image1.jpg
```

**容量比較**:
| 保存先 | 無料枠 | 画像枚数目安 |
|--------|--------|-------------|
| localStorage | 5MB | 約25枚 |
| Supabase Database（Base64） | 500MB | 約2,500枚 |
| **Supabase Storage** | **1GB** | **約5,000枚** |

### 4.6 セキュリティ適用 🆕 ← 次

| Step | タスク | 状態 |
|------|--------|------|
| 4.6.1 | TradeEntry.js にサニタイズ適用 | ⬜ |
| 4.6.2 | TradeEdit.js にサニタイズ適用 | ⬜ |
| 4.6.3 | NoteManagerModule にサニタイズ適用 | ⬜ |
| 4.6.4 | ExpenseManagerModule にサニタイズ適用 | ⬜ |
| 4.6.5 | SyncModule エラーハンドリング適用 | ⬜ |

### 4.7 初回移行フロー

```
1. ユーザーが初回ログイン
2. localStorageにデータあり？
   - Yes → 移行確認ダイアログ表示
   - No → スキップ
3. 「移行する」選択
4. サニタイズ処理 → Supabase一括アップロード
5. 画像があれば → Supabase Storageにアップロード
6. 完了通知
7. 以降はSupabase優先で動作
```

### 4.8 SyncModule バージョン履歴 🆕

| バージョン | 日付 | 内容 |
|-----------|------|------|
| v1.0.1 | 2025-12-30 | trades同期実装 |
| v1.1.0 | 2026-01-03 | notes同期追加 |
| v1.1.1 | 2026-01-03 | notes変換処理修正（memo/marketView/images対応） |
| v1.2.0 | 2026-01-04 | expenses同期追加 |
| v1.3.0 | 2026-01-04 | capital_records同期追加 |
| v1.4.0 | 2026-01-04 | user_settings同期追加（一括保存方式） |
| v1.5.0 | 2026-01-05 | 画像アップロード統合（Supabase Storage） |
| v1.5.1 | 2026-01-05 | #uploadTradeImages修正（文字列形式Base64対応） |
| **v1.5.2** | **2026-01-05** | **#uploadNoteImages追加（ノート画像Storage対応）** |

### 4.9 成果物

```
js/sync/SyncModule.js（v1.5.2）✅ 完成
js/utils/imageUtils.js（v1.0.0）✅ 新規作成
js/handlers/imageHandler.js（v1.1.0）✅ Storage対応
js/part2/TradeDetail.js ✅ 画像表示対応
js/part2/TradeManager-nomodule.js（_syncToCloud追加）✅ 完成
js/part3_modules/NoteManagerModule.js（#syncToCloud追加）✅ 完成
js/part7_modules/ExpenseManagerModule.js（#syncToCloud追加）✅ 完成
js/part7_modules/CapitalManagerModule.js（#syncToCloud追加）✅ 完成
js/part5_modules/SettingsModule.js（settings:changed発火追加）✅ 完成
js/part7_modules/ClosingManagerModule.js（settings:changed発火追加）✅ 完成
```

### 4.10 完了条件

- [x] 新規トレード追加 → Supabaseに保存される
- [x] 新規ノート追加 → Supabaseに保存される
- [x] 新規経費追加 → Supabaseに保存される
- [x] 新規入出金追加 → Supabaseに保存される
- [x] 設定変更 → Supabaseに保存される
- [x] Supabaseのデータ → localStorageに同期される
- [x] 別端末でログイン → 同じデータが表示される
- [x] 既存localStorageデータ → クラウドへ移行可能
- [ ] **画像がSupabase Storageに保存される** ✅ 完了（2026-01-05）
- [ ] ユーザーネーム変更が動作する
- [ ] メールアドレス変更が動作する（確認メール送信）
- [ ] パスワード変更が動作する
- [ ] **すべての入力がサニタイズされている**
- [ ] **不正データが拒否される**

---

## Phase 5: 統合テスト・本番準備・リリース

### 5.1 機能テスト

| # | シナリオ | 状態 |
|---|---------|------|
| 1 | 新規ユーザー登録 → メール確認 → ログイン | ⬜ |
| 2 | トレード追加 → 別端末で確認 | ⬜ |
| 3 | トレード編集 → 同期確認 | ⬜ |
| 4 | トレード削除 → 同期確認 | ⬜ |
| 5 | 相場ノート追加 → 同期確認 | ⬜ |
| 6 | 経費追加 → 同期確認 | ⬜ |
| 7 | 入出金追加 → 同期確認 | ⬜ |
| 8 | 設定変更 → 同期確認 | ⬜ |
| 9 | ログアウト → 再ログイン → データ確認 | ⬜ |
| 10 | 既存データ移行 → 確認 | ⬜ |
| 11 | マイページ → ユーザー情報表示確認 | ⬜ |
| 12 | マイページ → 各種変更機能確認 | ⬜ |
| 13 | **画像アップロード → Storage確認** | ✅ |

### 5.2 セキュリティテスト

（内容は前バージョンと同じ - 省略）

### 5.3 エッジケーステスト

（内容は前バージョンと同じ - 省略）

### 5.4 本番環境準備確認

（内容は前バージョンと同じ - 省略）

### 5.5 ドメイン設定

（内容は前バージョンと同じ - 省略）

### 5.6 ドキュメント更新

| Step | タスク | 状態 |
|------|--------|------|
| 5.6.1 | TASKS.md更新 | ⬜ |
| 5.6.2 | MODULES.md更新（SyncModule追加） | ⬜ |
| 5.6.3 | OVERVIEW.md更新 | ⬜ |
| 5.6.4 | REFERENCE.md更新 | ⬜ |

### 5.7 リリース作業

（内容は前バージョンと同じ - 省略）

---

## ファイル構成

### 新規作成ファイル

```
js/
├── core/
│   ├── supabaseClient.js    ← ✅ Phase 1 完了
│   └── security.js          ← ✅ Phase 3.6 完了
├── auth/
│   └── AuthModule.js        ← ✅ Phase 3 完了（v1.1.0）
└── sync/
    └── SyncModule.js        ← ✅ Phase 4 完了（v1.4.0）

styles/
└── 7_auth.css               ← ✅ Phase 3 完了

images/
└── logo.png                 ← ✅ Phase 3 完了

favicon.ico                  ← ✅ Phase 3 完了
```

### 修正ファイル

```
index.html                   ← ✅ セッション切れモーダル追加
js/auth/AuthModule.js        ← ✅ セッション監視追加（v1.1.0）
js/part2/TradeManager-nomodule.js   ← ✅ SyncModule連携追加
js/part3_modules/NoteManagerModule.js ← ✅ SyncModule連携追加（v1.0.3）
js/part7_modules/ExpenseManagerModule.js ← ✅ SyncModule連携追加（v1.0.2）
js/part7_modules/CapitalManagerModule.js ← ✅ SyncModule連携追加（v1.0.1）
js/part5_modules/SettingsModule.js ← ✅ settings:changed発火追加（v1.0.2）
js/part7_modules/ClosingManagerModule.js ← ✅ settings:changed発火追加（v1.0.1）
```

---

## リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Supabase無料枠超過 | 中 | 使用量モニタリング、アラート設定 |
| 同期競合（複数端末） | 中 | 最終更新優先（Last Write Wins） |
| 移行時データ損失 | 高 | 移行前バックアップ、確認ダイアログ |
| 認証トークン漏洩 | 高 | anon keyのみ使用、RLS徹底 |
| XSS攻撃 | 高 | **security.jsでサニタイズ** |
| セッションハイジャック | 中 | **24時間タイムアウト** |
| localStorageデータ破損 | 中 | **StorageValidatorで検証** |
| **画像容量不足** | **高** | **Supabase Storage実装** 🆕 |
| オフライン時の操作 | 低 | Phase 1ではオンライン必須、将来対応 |

---

## 参考ドキュメント

- [Supabase公式ドキュメント](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Storage](https://supabase.com/docs/guides/storage) 🆕
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- **Trading_Complete_セキュリティ要件定義書_v1_3.md**

---

## 更新履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.0 | 2025-12-17 | 初版作成 |
| v1.1 | 2025-12-17 | Phase 5に「本番環境準備確認」セクション追加 |
| v1.2 | 2025-12-17 | Phase 1 完了を反映 |
| v1.3 | 2025-12-18 | Phase 2, Phase 3 完了を反映 |
| v1.4 | 2025-12-18 | Phase 3.5（マイページUI）追加、favicon完了 |
| v1.5 | 2025-12-19 | Phase 3.5完了、MODULES.md準拠の原則追加 |
| v1.6 | 2025-12-19 | Phase 3.6（セキュリティ基盤）追加 |
| v1.7 | 2025-12-29 | ドメイン構成セクション追加、StorageValidator追加 |
| v1.7.1 | 2025-12-30 | Phase 3.6 完了 |
| v1.8 | 2026-01-04 | Phase 4.1〜4.3 完了（全5テーブル同期）、SyncModule v1.4.0、Phase 4.5 Supabase Storage追加 |
| **v1.9** | **2026-01-05** | **Phase 4.5 完了（Supabase Storage）、ImageHandler v1.1.0、SyncModule v1.5.2、imageUtils.js追加** |

---

## 📊 進捗サマリー

```
Phase 1   ██████████ 100% ✅ 完了（2025-12-17）
Phase 2   ██████████ 100% ✅ 完了（2025-12-17）
Phase 3   ██████████ 100% ✅ 完了（2025-12-18）
Phase 3.5 ██████████ 100% ✅ 完了（2025-12-19）
Phase 3.6 ██████████ 100% ✅ 完了（2025-12-30）
Phase 4   █████████░  95% 🔄 進行中（データ同期完了、Storage完了、セキュリティ適用中）
Phase 5   ░░░░░░░░░░   0%
```

**次のアクション**: Phase 4.6「セキュリティ適用」またはPhase 5「統合テスト・本番準備」

---

*このドキュメントは実装の進捗に合わせて更新してください。*
