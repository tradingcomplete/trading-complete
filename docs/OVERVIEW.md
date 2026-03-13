# OVERVIEW.md - Trading Complete 全体構造図
*このファイルは変更禁止 - 全体の地図として固定*
*最終更新: 2026-03-08 - PaymentModule追加（Stripe Phase 5完了）*

## 🗺️ システム全体図
```
Trading Complete（約60,000行）
├── index.html（6タブUI）
├── styles/（CSS 8ファイル）
├── js/
│   ├── script.js（5,217行 → 4,994行 -223行削減 ✅一括入力機能削除完了）
│   ├── constants.js（定数定義）
│   ├── core/（基盤モジュール ✅）
│   │   ├── EventBus.js（イベント管理）
│   │   ├── supabaseClient.js（Supabase接続 ✅Phase 1）
│   │   └── security.js（セキュリティユーティリティ ✅Phase 3.6）
│   ├── auth/（認証モジュール ✅Phase 3完了）
│   │   └── AuthModule.js（認証管理 v1.4.0 - マイページ変更・パスワードリセット対応）
│   ├── sync/（同期モジュール ✅）
│   │   └── SyncModule.js ✅（クラウド同期 v1.7.0）
│   ├── payment/（決済モジュール ✅Phase 5完了）
│   │   └── PaymentModule.js ✅（プラン管理・Stripe連携 v1.0.0）
│   ├── part2/（10モジュール - 完成✅）
│   │   ├── TradeCalculator.js
│   │   ├── TradeDetail.js
│   │   ├── TradeEdit.js
│   │   ├── TradeEntry.js
│   │   ├── TradeExit.js
│   │   ├── TradeList.js
│   │   ├── TradeManager-nomodule.js（データ管理中核）
│   │   ├── TradeValidator.js
│   │   ├── bridge.js（互換性維持層）
│   │   └── entry-form-enhancement.js ✅完成（エントリーフォーム強化）
│   ├── part3_modules/（相場ノートモジュール ✅完成）
│   │   └── NoteManagerModule.js ✅完成（相場ノート機能）
│   ├── part5/（収支管理UI + 設定タブUI）
│   │   ├── capital-ui.js ✅完成
│   │   ├── broker-ui.js ✅完成（Phase 2）
│   │   └── favorite-pair-ui.js ✅完成（Phase 3.5）
│   ├── part5_modules/（設定タブモジュール ✅Phase 3.5完了）
│   │   ├── SettingsModule.js ✅完成（Phase 3: お気に入り通貨ペア対応）
│   │   ├── PRESET_BROKERS.js ✅完成（25社プリセット）
│   │   └── PRESET_CURRENCY_PAIRS.js ✅完成（通貨ペアプリセット）
│   ├── part7_modules/（新形式モジュール ✅）
│   │   ├── CapitalManagerModule.js ✅完成
│   │   ├── ExpenseManagerModule.js ✅完成
│   │   ├── ClosingManagerModule.js ✅完成
│   │   ├── CSVExporterModule.js ✅完成
│   │   ├── SummaryCalculatorModule.js ✅完成
│   │   └── MonthlyCalendarModule.js ✅完成
│   ├── part8_modules/（新形式モジュール ✅完成）
│   │   ├── StatisticsModule.js ✅完成
│   │   ├── ReportModule.js ✅完成
│   │   ├── ChartModule.js ✅完成
│   │   └── AISummaryModule.js ✅完成（AI参照用サマリー基盤）
│   ├── modules/（共通モジュール ✅）
│   │   └── ImageAddModalModule.js ✅完成（画像追加モーダル管理）
│   ├── handlers/（画像処理）
│   │   └── imageHandler.js ✅（v1.1.0 + Supabase Storage対応）
│   ├── utils/（ユーティリティ）
│   │   ├── errorHandler.js
│   │   └── validation.js ✅完成（バリデーション共通処理）
│   ├── yen-profit-loss/（円建て損益）
│   │   ├── YenProfitLossManager.js ✅完成
│   │   ├── YenProfitLossManager.test.js ✅完成（テストファイル）
│   │   └── YenProfitLossModalModule.js ✅完成
│   └── 将来: part1,5/（未着手）
├── styles/（9ファイル）
│   ├── 1_base.css〜6_responsive.css（既存8ファイル）
│   └── 7_auth.css（認証モーダル ✅Phase 3追加）
└── images/
    └── logo.png（TCロゴ ✅Phase 3追加）
```

## 📊 Part構成と責任範囲
| Part | 名称 | 責任範囲 | 行数 | 状態 | ファイル位置 | リリース計画 |
|------|------|----------|------|------|-------------|------------|
| **Part 1** | 基盤 | 初期化・共通関数・テーマ・EventBus | 1,778 | ⚠️30%実装（EventBus完了） | script.js内 + js/core/ | ✅リリース時使用 |
| **Part 2** | トレード記録 | CRUD・表示・フィルター・円建て損益・エントリーフォーム強化 | 953 | ✅完成+円建てモーダル | js/part2/*（10ファイル）+ yen-profit-loss/* | ✅リリース時使用 |
| **Part 3** | 相場ノート | ノート・カレンダー・週表示 | 1,400 | ✅NoteManagerModule完成 | js/part3_modules/ | ✅リリース時使用 |
| **Part 4** | AI/SNS | プロンプト生成・SNS投稿 | - | ✅**削除完了（2025-11-27）** | - | ❌**削除済み** |
| **Part 5** | 分析 + 設定 | フィルター・分析表示 + 設定タブモジュール（Phase 3.5完了） | 465 | ⚠️分析未分離 + ✅設定モジュール（Phase 3.5完了） | script.js内 + js/part5_modules/ + js/part5/ | ✅リリース時使用 |
| **Part 5A** | SNS/AI補助 | AI画像生成・SNS投稿補助 | - | ❌削除完了（2025-10-28） | - | ❌**削除済み** |
| **Part 6** | 学習 | URL管理・メモ | - | ❌削除完了（2025-10-28） | - | ❌**削除済み** |
| **Part 7** | 収支管理 | 経費・締め・CSV・集計・入出金・月次カレンダー | 1,603 | ✅基本機能 + ✅モジュール6/6 | js/part7/ + js/part7_modules/ + js/part5/ | ✅リリース時使用 |
| **Part 8** | 統計 | 統計計算・レポート・グラフ・AIサマリー | 423 | ✅完成 | js/part8_modules/*（4ファイル） | ✅リリース時使用 |
| **Cloud** | クラウド連携 | 認証・データ同期・画像Storage | - | ✅完成 | js/auth/ + js/sync/ + js/core/ | ✅リリース時使用 |
| **Payment** | 決済管理 | プラン判定・Stripe連携・制限制御 | - | ✅完成（Phase 5テスト済み） | js/payment/ | ✅リリース時使用 |

**削減実績合計**: 
- Part4等（2025-10-28）: 744行
- Part4 script.js（2025-11-27）: 2,266行
- Part3 NoteManagerModule（2025-11-27）: 1,400行
- **一括入力機能削除（2025-11-29）: 223行** ← NEW
- **合計: 4,633行削減**

---

## 🚀 リリース計画（2ヶ月・6タブ構成）

### Phase 1: リリース時（Week 8完了時）

**✅ Part 4完全削除（2025-11-27）**: script.jsから2,266行削減
- AIプロンプト生成部門全削除
- レアリティシステム削除
- 関連グローバル変数・関数削除
- エラー0個で完了

**6タブ構成**:
```
1. 📝 新規エントリー
2. 📄 トレード記録
3. 📓 相場ノート
4. 📊 分析（円建て統計追加）
5. 💰 収支管理
6. ⚙️ 設定
```

**✅ 削除完了の機能**:
```
❌ Part4（AI/SNS）- 完全削除（2025-11-27）
   - AIプロンプト生成
   - SNS投稿機能
   - トレードアイコン生成
   - レアリティシステム
   
❌ Part5A（SNS/AI補助）- ファイル削除（2025-10-28）
   - Part5A_SNS_AI.js削除
   
❌ Part6（学習）- タブ削除（2025-10-28）
   - 学習タブ
   - URL管理機能（未実装）
```

**保持される機能**:
```
✅ Part1（基盤）- そのまま使用
✅ Part2（トレード記録）- 完全モジュール化済み
✅ Part3（相場ノート）- そのまま使用
✅ Part5（分析）- フィルター機能のみ保持
✅ Part7（収支管理）- 完全モジュール化済み
✅ Part8（統計）- 完全モジュール化済み + 円建て統計追加
```

**Supabase導入（Phase 3〜4）**:
```
✅ Phase 1: 環境構築（supabaseClient.js）
✅ Phase 2: データベース設計（RLS設定）
✅ Phase 3: 認証実装（AuthModule.js）
✅ Phase 3.5: マイページUI
✅ Phase 3.6: セキュリティ基盤（security.js）
✅ Phase 4: データ同期（SyncModule.js v1.7.0）✅ 完了
✅ Phase 5: 統合テスト・リリース（テスト完了）
```

**✅ クラウド同期実装完了（2026-01-15 Phase 5テスト完了）**:
```
✅ Supabase連携
   - 認証（AuthModule v1.4.0）
   - データ同期（SyncModule v1.7.0）
   - 画像Storage（ImageHandler v1.1.0）
   - RLSによるデータ分離
   - セキュリティ基盤（security.js）

✅ 同期対象テーブル
   - trades（トレード記録）
   - notes（相場ノート）
   - expenses（経費）
   - capital_records（入出金）
   - user_settings（設定）

✅ 画像保存
   - Supabase Storage（trade-images バケット）
   - Base64 → URL自動変換
   - 署名付きURL（1時間有効）
```

**ドメイン構成（確定）**:
```
tradingcomplete.com     → ランディングページ ✅稼働中
app.tradingcomplete.com → アプリ本体 🔜リリース時
```

---

### Phase 2: 将来の拡張（v2.0）

**AI機能追加時の構成変更**:
```
統合: 新規エントリー + トレード記録 → トレード記録（サブタブ方式）
追加: AIアシスタントタブ

6タブ構成（変わらず）:
1. 📝 トレード記録（統合・サブタブ）
2. 📓 相場ノート
3. 📊 分析
4. 💰 収支管理
5. 🤖 AI アシスタント（新規）
6. ⚙️ 設定
```

**リリース後のモジュール化**:
```
□ Part1（基盤）のモジュール化
□ Part5（分析）のモジュール化
```

---

## 🔐 データ保存方式 ✅ 実装完了

### 現在の構成

| 保存先 | 用途 | 状態 |
|--------|------|------|
| **localStorage** | ローカルキャッシュ | ✅ 従来通り |
| **Supabase Database** | trades, notes, expenses, capital_records, user_settings | ✅ 同期完了 |
| **Supabase Storage** | 画像ファイル（trade-images バケット） | ✅ 基本実装完了 |

### データ同期フロー

```
[ユーザー操作]
      ↓
[各モジュール（TradeManager, NoteManager等）]
      ↓
[localStorage保存] ──→ [SyncModule] ──→ [Supabase]
      │                    │
      │                    ├── trades テーブル
      │                    ├── notes テーブル
      │                    ├── expenses テーブル
      │                    ├── capital_records テーブル
      │                    ├── user_settings テーブル
      │                    └── trade-images バケット（Storage）
      │
      ↓
[画像の場合]
      ↓
[ImageHandler.uploadToCloud()] ──→ [Supabase Storage]
      ↓
[Base64 → URL変換]
```

### 認証フロー

```
[アプリ起動]
      ↓
[AuthModule.init()]
      ↓
[ログイン済み？] ──No──→ [ログインモーダル表示]
      │                         ↓
      Yes                 [メール/パスワード入力]
      ↓                         ↓
[SyncModule.initialize()]   [Supabase Auth]
      ↓                         ↓
[クラウドデータ取得]          [セッション作成]
      ↓
[アプリ使用可能]
```

### セキュリティ

| 機能 | 実装 |
|------|------|
| 認証 | Supabase Auth（メール/パスワード） |
| データ分離 | Row Level Security（RLS） |
| 画像アクセス制御 | Storage RLS（自分のフォルダのみ） |
| セッション管理 | 24時間タイムアウト |
| XSS対策 | security.js サニタイズ |
| 入力検証 | StorageValidator |

---

## 🔄 データフローと依存関係
```
[ユーザー操作]
      ↓
[Part 1: イベントハンドラー]
      ↓
[EventBus] ← イベント駆動（✅実装済み）
      ↓
[Part 2/7: データ書込] → [TradeManager] → [SyncModule] → [Supabase]
     ✅完全モジュール化        ↓                ↓
                        [LocalStorage]    [クラウド同期]
                                              ↓
                                         [画像の場合]
                                              ↓
                                         [ImageHandler]
                                              ↓
                                         [Supabase Storage]
```

## 🎯 主要クラス・関数マップ
```javascript
// Part 1（基盤）- script.js 1-1778行
initializeApp()           // エントリーポイント
switchTab(tabIndex)       // タブ切替
loadAllData()            // データ初期化
setTheme(theme)          // テーマ管理

// 基盤（クラウド）- js/core/
supabaseClient.js        // Supabase初期化
  getSupabase()           // クライアント取得
security.js              // セキュリティユーティリティ
  Sanitizer.text()        // テキストサニタイズ
  Sanitizer.html()        // HTMLサニタイズ
  SecureError.toUserMessage() // 安全なエラーメッセージ
  StorageValidator.safeLoad() // localStorage安全読込

// 認証 - js/auth/
AuthModule               // js/auth/AuthModule.js（v1.4.0）
  .init()                 // 初期化
  .getCurrentUser()       // 現在のユーザー取得
  .getUsername()          // ユーザー名取得
  .isLoggedIn()          // ログイン状態確認
  .showAuthModal()        // ログインモーダル表示
  .logout()              // ログアウト

// 同期 - js/sync/
SyncModule               // js/sync/SyncModule.js（v1.7.0）
  .initialize()           // 初期化
  .isInitialized()        // 初期化状態確認
  .saveTrade(trade)       // トレード保存（+ 画像アップロード）
  .deleteTrade(id)        // トレード削除
  .fetchAllTrades()       // 全トレード取得
  .saveNote(date, data)   // ノート保存
  .saveExpense(expense)   // 経費保存
  .saveCapitalRecord(record) // 入出金保存
  .saveSettings(settings) // 設定保存
  .getStatus()           // デバッグ用

// 決済 - js/payment/
PaymentModule            // js/payment/PaymentModule.js（v1.0.0）
  .initialize()           // 初期化
  .getCurrentPlan()       // プラン取得（'free'/'pro'/'premium'）
  .canAddTrade(count)     // トレード追加可否
  .canUseCloudSync()      // クラウド同期利用可否
  .createCheckoutSession(priceId) // Stripe Checkout起動
  .openCustomerPortal()   // プラン管理画面
  .getStatus()            // デバッグ用

// 画像処理 - js/handlers/
ImageHandler             // js/handlers/imageHandler.js（v1.1.0）
  .compress()             // 画像圧縮
  .compressWithPreset()   // プリセット圧縮
  .toBase64()             // Base64変換
  .resize()               // リサイズ
  .uploadToCloud()        // Supabase Storageアップロード
  .getSignedUrl()         // 署名付きURL取得
  .deleteFromCloud()      // Storage削除
  .getStatus()            // ステータス取得

// Part 2（トレード）- js/part2/配下
TradeManager.getInstance()  // データ管理中核（TradeManager-nomodule.js）
TradeValidator.validate()   // 検証（TradeValidator.js）
TradeCalculator.calculate() // 計算（TradeCalculator.js）
TradeList.render()          // 一覧表示（TradeList.js）
TradeEdit.edit()           // 編集（TradeEdit.js）
TradeDetail.show()         // 詳細表示（TradeDetail.js）
TradeEntry.save()          // 新規入力（TradeEntry.js）
TradeExit.addExit()        // 決済処理（TradeExit.js）
// bridge.js              // 互換性維持層

// entry-form-enhancement.js（エントリーフォーム強化）
initEntryFormEnhancement()  // エントリーフォーム強化初期化
updateBrokerSelect()       // ブローカー選択更新
updateCurrencyPairSelect() // 通貨ペア選択更新

// utils/（ユーティリティ）- js/utils/配下
errorHandler              // js/utils/errorHandler.js（エラーハンドリング）
validation                // js/utils/validation.js（バリデーション共通処理）

// Part 3（相場ノート）- js/part3_modules/配下 ✅100%
NoteManagerModule        // js/part3_modules/NoteManagerModule.js（✅完成）
  .saveNote()              // ノート保存
  .editNote(dateStr)       // 編集開始
  .deleteNote(dateStr)     // 削除
  .getNote(dateStr)        // 指定日付のノート取得
  .getAllNotes()           // 全ノート取得
  .updateWeeklyPreview()   // 週間プレビュー更新
  .updateCalendar()        // カレンダー更新
  .getStatus()             // デバッグ用

// Part 7（収支）- 新形式モジュール完成（6/6）✅100%
ExpenseManagerModule     // js/part7_modules/ExpenseManagerModule.js（✅完成）
ClosingManagerModule     // js/part7_modules/ClosingManagerModule.js（✅完成）
CSVExporterModule        // js/part7_modules/CSVExporterModule.js（✅完成）
SummaryCalculatorModule  // js/part7_modules/SummaryCalculatorModule.js（✅完成）
CapitalManagerModule     // js/part7_modules/CapitalManagerModule.js（✅完成）
MonthlyCalendarModule    // js/part7_modules/MonthlyCalendarModule.js（✅完成）

// Part 5（収支管理UI + 設定タブUI）- js/part5/配下
capital-ui.js            // js/part5/capital-ui.js（✅完成）
broker-ui.js             // js/part5/broker-ui.js（✅Phase 2完了）
favorite-pair-ui.js      // js/part5/favorite-pair-ui.js（✅Phase 3.5完了）

// Part 8（統計）- 新形式モジュール完成（4/4）✅100%
StatisticsModule         // js/part8_modules/StatisticsModule.js（✅完成）
ReportModule             // js/part8_modules/ReportModule.js（✅完成）
ChartModule              // js/part8_modules/ChartModule.js（✅完成）
AISummaryModule          // js/part8_modules/AISummaryModule.js（✅完成）
  .generateSummary()      // 期間サマリー生成（Object形式）
  .generateTextSummary()  // テキストサマリー生成（AI向け）
  .getStatus()           // デバッグ用

// 共通モジュール - js/modules/配下
ImageAddModalModule      // js/modules/ImageAddModalModule.js（✅完成）
  .openModal()             // モーダルを開く
  .closeModal()            // モーダルを閉じる
  .handleFileSelect()      // ファイル選択処理
  .handleDragAndDrop()     // ドラッグ&ドロップ処理
```

---

## 🎯 リリース時の最終構成

**6タブ構成**:
1. 新規エントリー（チャート3枚、レスポンシブ対応）
2. トレード記録
3. 相場ノート
4. 分析（円建て統計追加）
5. 収支管理
6. 設定

**コア機能（20機能）**:
- トレード記録・編集・削除
- 決済追加
- 振り返り編集
- 円建て損益管理
- 相場ノート
- カレンダー表示
- 統計表示（Pips + 円建て）
- レポート生成
- チャート表示
- 経費管理
- 締め処理
- CSV出力
- フィルター
- テーマ切替
- データ管理
- レスポンシブ対応
- (将来: AI機能)

**削除された機能（10機能）**:
- AIプロンプト生成
- SNS投稿機能
- AI画像生成
- トレードアイコン
- 学習URL管理
- 学習メモ
- フォルダ管理
- タグ管理
- 学習コンテンツ
- 学習検索

---

## 📈 script.js行数推移

| 時期 | 行数 | 変化 | 内容 |
|------|------|------|------|
| 開始時 | ~50,000 | - | 全機能含む |
| Part 8モジュール化後 | ~47,500 | -2,500 | 統計・レポート・チャート分離 |
| 不要機能削除後（10/28） | ~46,800 | -700 | Part4/6/アイコン削除 |
| **Part 4完全削除後（11/27）** | **6,617** | **-2,266** | **AIプロンプト生成部門完全削除** |

---
*このファイルは全体の地図です。迷ったらここに戻ってください。*
