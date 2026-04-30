# REFERENCE.md - Trading Complete 参考資料・運用ガイド
*更新日: 2026-04-30 | 用途: 開発ガイドライン・完了履歴・ベストプラクティス*

> **運営**: Studio Compana (屋号 / 個人事業主) — 代表: 成瀬仁文(コンパナ)

---

## 🚨 Part I: 開発ガイドライン

| ガイドライン | 重要度 | 主な内容 |
|------------|--------|---------|
| HTMLテンプレート移行 | ⚠️ HIGH | 元コード一字一句コピー、書き直さない（displayReport移行で失敗例あり） |
| デバッグフロー | 🔴 CRITICAL | デバッグコード先行→原因特定→修正。リロードは1回のみ |
| 修正指示DL形式 | 🔴 CRITICAL | .txtファイルで提供。チャット内長文直接記載禁止 |
| 別チャット管理 | 🔴 CRITICAL | 各ファイルは専用チャット。小修正は指示のみ（最大25倍節約） |
| 即時関数パターン | 🔴 CRITICAL | `(function(){...})()` で変数再宣言エラー回避 |
| モジュール化判断 | ⚠️ MEDIUM | グローバル変数操作あり→置換必要、なし→不要 |
| UIデザイン | ⚠️ MEDIUM | カード型、グラデーション、グラスモーフィズム |
| ドキュメント配置 | ⚠️ HIGH | タスク→TASKS.md、技術仕様→MODULES.md(100行以内)、完了→REFERENCE.md |
| 制御構造調査 | ⚠️ HIGH | 4ステップ: 特定→デバッグ確認→分析→フォーム制御.md更新 |

### デバッグフローテンプレート
```javascript
// Phase 1: データ層確認
window.eventBus.on('statistics:updated', (data) => console.log('データ:', data));
// Phase 2: DOM確認
document.getElementById('xxx')
// Phase 3: 手動更新
document.getElementById('xxx').textContent = 'テスト';
```

### 即時関数テンプレート
```javascript
(function() {
    const tm = TradeManager.getInstance();
    console.log('データ:', tm.getAllTrades());
})();
```

### 新モジュール作成テンプレート
```javascript
class XxxModule {
    #privateData = [];
    #eventBus = null;
    constructor() { this.#eventBus = window.eventBus; }
    // Public API / Private methods
}
window.XxxModule = new XxxModule();
```

---

## 📚 Part II: 完了履歴

### 2026年4月

| タスク | 完了日 |
|--------|--------|
| **🌟 Premium AI機能 要件定義書 v1.3 確定**（v1.2 → v1.3 大幅改訂）: 確定申告AIを Phase 1 主役化（v1.2では Phase 2・12月だったが9月へ前倒し）/ コンセプトを「AIコーチ」→「副業FXトレーダーの業務OS」に再定義 / 投資効果ダッシュボード新規（節税額・時間節約・回避損失・プレイブック資産の4数値で「コスト→自己投資」を可視化）/ KPI を MRR→月次チャーン率（5%以下）/ 文章スタイルガイドライン新規（Losada比3:1・Tiny Habit・CBT）/ リリース前ヒアリング廃止→リリース後行動データ駆動へ。CLAUDE.md / TASKS.md / 整理ガイド / 計算ロジック検証 / NotebookLM ソース管理 5ファイルの参照を v1.3 に同期。v1.2 は archive へ移動 | 2026-04-30 |
| **🧮 計算ロジック検証・修正フェーズ 完全完了** リリース前最終監査でCRITICAL12件+WARNING10件発見 → 全17 FIX完了（false positive 1件 / v1.1延期 1件 / 完全実装 15件）。本番URLでcalcLogicVerification 9/9合格（直接合計4,528,315円とSummaryCalc全年合計が円単位完全一致）。仕様変更3点（利益率分母をgetTotalDeposit化・期間exit_date統一・締め月編集ガード）。詳細: 計算ロジック検証_要件定義書 v1.4 | 2026-04-30 |
| **🛡️ Phase 11 サーバー側プラン制限 完全実装+テスト全合格** v3.10 §11全項目完了。get_user_active_plan / trades INSERT トリガー / Storage Policy / 5テーブルRLS Policy / SyncModule v1.9.0 / Phase 11.5 多層防御（bridge.js + script.js起動時チェック）/ 攻撃テスト合格 | 2026-04-28 |
| **改善#2 UPSERT化 完全クリア** square-create-subscription v1.1.0 + paypal-activate-subscription v1.1.0 でDB保存を `.upsert()` + `onConflict: 'user_id'` + `cancelled_at: null` に統一。プロバイダ乗換シナリオに完全対応 | 2026-04-28 |
| **Square Webhook検証完了（4-13d）** Sandboxで `subscription.created` Test event 200 OK 取得・署名検証成功。Phase 10 Sandbox E2Eテスト全項目合格 | 2026-04-28 |
| **square-webhook URLバグ修正** `req.url` が内部localhost URL を返す問題を発見・`Deno.env.get("SUPABASE_URL")` から動的組立に修正・即デプロイ | 2026-04-28 |
| **Square Webhook Subscription 登録** Square Sandbox Dashboard に4イベント購読Webhook作成（subscription.created/updated, invoice.payment_made, invoice.scheduled_charge_failed）・Signature KeyをSupabase Secretsに登録 | 2026-04-28 |
| **Square フロントエンド統合 4-9〜4-12 完了**（PaymentModule v3.1.0 / index.html SDK追加 / upgradeModalラジオ+2ボタン / Card.attach()モーダル） | 2026-04-28 |
| **Square Sandbox E2Eテスト 購入フロー全14ステップ合格**: nonce取得 → Customer作成 → Card保存 → Subscription作成 → DB INSERT → Pro反映まで全自動 | 2026-04-28 |
| **Square Sandbox E2Eテスト 解約フロー全9ステップ合格**: provider='square'自動判定 → Edge Function呼出 → DB UPDATE（cancelled）→ トースト表示 | 2026-04-28 |
| **決済システム要件定義書 v3.10 公開**（旧 v3.9 を archive へ・§9-A E2Eテスト結果と改善項目6つを追加） | 2026-04-28 |
| **Square Edge Functions 3つデプロイ完了**: square-create-subscription（3段階処理+ロールバック）/ square-cancel-subscription / square-webhook（--no-verify-jwt付き） | 2026-04-25 |
| **Square Subscription Plan作成**: PowerShell経由でCatalog API叩き、SUBSCRIPTION_PLAN + Monthly Variation（¥1,980）+ Yearly Variation（¥19,800）の3つ作成 | 2026-04-25 |
| **Square Sandbox Credentials取得**: Application ID / Access Token / Location ID 取得・Supabase Secrets 5つ登録 | 2026-04-25 |
| **Square Subscriptions API 仕様調査**: 日本対応・JPY対応・3段階処理（Customer→Card→Subscription）確認 | 2026-04-24 |
| **多層決済戦略 確定**: PayPal + Square 二本立てでリリース方針確定 | 2026-04-22 |
| **Square 審査通過**: VISA/MC/AMEX/UnionPay 承認・即日決済可能 | 2026-04-19 |
| **PayPal Sandboxテスト完了**: 購入・解約フロー全合格・PaymentModule.js v3.0.0 完成 | 2026-04-15 |
| **PayPalビジネスアカウント審査通過**: 即日通過（FX禁止業種に該当しない） | 2026-04-15 |
| **ホームページ画像10枚審査対策版差し替え**: 金融取引連想を排除・NotebookLM デザインスライド+アプリスクショのハイブリッド | 2026-04-09 |
| **tokutei.html 屋号Studio Compana・住所更新**: DMMバーチャルオフィス契約後 | 2026-04-09 |
| **PAY.JP本番利用 全カード否決**: 理由非開示。多層決済戦略への転換を決断 | 2026-04-03 |
| 感情記録 選択式化（8種類の単一選択 + 自由メモ）: index.html, TradeEntry.js, TradeEdit.js, TradeDetail.js, TradeManager-nomodule.js, SyncModule.js, AISummaryModule.js, 4_features.css（8ファイル修正） | 2026-04-01 |
| 感情選択 必須バリデーション: TradeEntry.js #validateTradeData, TradeEdit.js saveBasicInfo | 2026-04-02 |
| 感情別分析アコーディオン: ReportModule.js #generateEmotionAnalysis（ポジティブ vs ネガティブ サマリー + 8感情詳細テーブル） | 2026-04-02 |
| 印刷用PDF 感情別分析: ReportModule.js #generatePrintEmotionAnalysis | 2026-04-02 |
| トレード記録 感情バッジ: TradeList.js createTradeCard（絵文字バッジ、ポジティブ=緑/ネガティブ=赤） | 2026-04-02 |

**多層決済戦略への転換（2026-03-17 → 2026-04-22 / 詳細は決済システム要件定義書_v3_10）**:
- 2026-03-17: Stripeから「禁止業種（FX関連）」として閉鎖通知。Phase 1-5の実装成果は破棄
- 2026-03-17〜28: PAY.JPに移行・実装・テスト完了
- 2026-03-21: 開業届 e-Tax電子提出完了（屋号: Studio Compana）
- 2026-03-27: DMMバーチャルオフィス審査通過・住所確定（〒450-0002 名古屋市中村区名駅3-4-10）
- 2026-04-03: PAY.JP本番利用 全カード否決
- 2026-04-09: ホームページ文言修正8箇所・画像10枚差し替え（FX/金融用語の徹底排除）
- 2026-04-15: PayPalビジネスアカウント開設・即日通過・Sandboxテスト合格
- 2026-04-16〜22: 7社並行申請の結果集約 — Lemon Squeezy❌ / KOMOJU❌ / fincode❌ / Square✅
- 2026-04-22: PayPal + Square二本立てリリース方針確定
- 2026-04-25: Square実装着手・Edge Functions 3つデプロイ完了・フロントエンド統合フェーズへ

**審査落ちの根本原因（リサーチ結果）**:
3層構造の問題による：
1. カードブランドのMCC分類で「FX＝高リスク業種」として自動判定
2. PAY.JPは「投資関連サービス（ツールやコンサルティング等）」を審査困難商材として明記
3. FX情報商材への取り締まり強化の余波で「FX」キーワードが一括拒否される構造

→ TCは法的には金融商品取引法の規制対象外（記録・分析ツール / 投資助言ではない）。
   しかしこの法的事実は自動審査では考慮されない。
**教訓**: 1つの決済会社に全部賭けない。多層構造で構築する。

**感情機能の実装ポイント**:
- `window.EMOTION_OPTIONS`（8感情定数）と `window.normalizeEmotion()`（新旧形式正規化）は TradeEntry.js 先頭で定義、グローバル公開
- ReportModule のアコーディオン順序: pairAnalysis → dayAnalysis → sessionAnalysis → tradeHistory → ruleRiskAnalysis → **emotionAnalysis** → reflectionList
- 印刷用PDF版は `#generatePrintEmotionAnalysis()` で別途生成（`#generatePrintRuleRiskAnalysis()` と同パターン）
- AISummaryModule の emotionStats パターン（byEmotion, positiveTotal, negativeTotal）に準拠

---

### 2026年3月

| タスク | 完了日 |
|--------|--------|
| SyncModule v1.8.0: オフライン復帰時の差分マージ（5メソッド追加、`window.addEventListener('online')`） | 2026-03-09 |
| Stripe決済 Phase 1-5全完了（9テスト合格） | 2026-03-08 |

**Stripe実装トラブル記録**:

| # | エラー | 原因 | 解決 |
|---|--------|------|------|
| 1 | success_url 404 | app.tradingcomplete.comが存在しない | URLをtradingcomplete.com/trading-complete/に修正 |
| 2 | Webhook 401 | JWT認証が有効 | デプロイ時--no-verify-jwtを追加 |
| 3 | Webhook 400 Invalid signature | STRIPE_WEBHOOK_SECRETが古い | Supabaseで新しいwhsec_値に更新・再デプロイ |
| 4 | RangeError: Invalid time value | constructEvent（同期版）使用 | constructEventAsync（非同期版）+nullチェック |

Stripe教訓: stripe-webhookは必ず`--no-verify-jwt`でデプロイ。Webhookシークレットは新エンドポイント作成時に更新。Deno環境では`constructEventAsync()`を使う。

**オフライン差分マージ実装概要**:
- trades/notes: `updated_at`比較によるLast Write Wins
- expenses/capital_records: IDユニオン方式（`updated_at`カラムなし）
- 既存コードへの変更ゼロ（純粋な追加のみ）
- テストシナリオ3件全合格

---

### 2026年1-2月

| 日付 | タスク | 優先度 | 工数 | 主な成果 |
|------|--------|--------|------|---------|
| 01/14 | Supabase画像URL自動更新・クラウド同期 | CRITICAL | 6h | 署名付きURL期限自動更新、ログイン時クラウド同期 |
| 01/15 | Phase 5: 統合テスト・本番準備完了 | CRITICAL | 4h | 機能・セキュリティ・エッジケース全テスト合格 |
| 01/15 | レスポンシブ改善（ヘッダー・週間プレビュー等） | MEDIUM | 4h | 横並び維持、max-height増加、フィールド幅統一 |
| 01/15 | Pull-to-Refresh実装 | LOW | 1h | ページ最上部スワイプでリロード、iOS対応 |
| 01/17-23 | 画像説明欄追加機能（Phase 1-8完了） | MEDIUM | 7日 | 画像に題名・説明追加、全画面表示、モーダル統合 |
| 01/22 | imageUtils.js v1.3.0 | HIGH | 1h | v1.1.0+v1.2.0統合、URL期限切れ自動更新対応 |
| 01/24-25 | 6_responsive.css 画像モーダル・iOS対応 | MEDIUM | 3h | 拡大モーダル編集ボタン、iOS自動ズーム防止 |
| 01/29-02/01 | トレード分析強化（全6Phase完了） | CRITICAL | 17日 | 許容損失・手法管理・振り返り・バッジ・分析・AIサマリー基盤 |
| 02/02 | 利益率機能 | MEDIUM | 4h | 年度別・全期間利益率表示、年初口座残高設定UI |
| 02/12 | Premium Redesign v5カラー統一（全16ファイル） | HIGH | 6h | 旧カラー180箇所→新テーマ統一、CSSクラス化 |
| 02/25 | ヘッダーシマーアニメーション（JS実装） | LOW | 1h | CSSアニメーションChrome非互換→requestAnimationFrame+EventBus |
| 02/25 | セルフイメージ保存バグ修正 + 同期後表示更新 | MEDIUM | 2h | saveGoals()トースト・同期トリガー追加 |

---

### 2025年11-12月

| 日付 | タスク | 優先度 | 工数 |
|------|--------|--------|------|
| 12/23 | エントリー情報「編集」ボタン問題（localStorageデータ形式不整合修正） | HIGH | 3h |
| 12/22 | 週次分析 上部・下部不一致修正（handlePeriodChange追加、isoWeek修正） | CRITICAL | 2h |
| 12/22 | MODULES.md準拠 全モジュール統一（yenProfitLossフィールド名7ファイル） | HIGH | 2h |
| 12/21 | 相場ノート エディタ機能強化（空行保持、装飾拡張） | MEDIUM | 4h |
| 12/17 | Week 7: 分析タブ期間保持、エクスポート拡張、Chart改善、コード43%削減 | MEDIUM | 6h |
| 12/14 | GitHub Pages公開（tradingcomplete.com） | HIGH | 4h |
| 12/12-14 | ライトモードCSS完全対応（統一カラーシステム、約1,780行） | MEDIUM | 6h |
| 12/11-13 | レスポンシブ対応（全6タブ、5ブレークポイント、約3,040行） | MEDIUM | 14h |
| 11/29 | 一括入力機能削除（223行削減、統計整合性確保） | CRITICAL | 2h |
| 11/27 | 相場ノート機能改善（検索・月メモ）＋Part 3 NoteManagerModule化（1,400行削減） | MEDIUM | 9h |
| 11/27 | Part 4削除（2,266行削減、25.5%） | CRITICAL | 1h |
| 11/26 | 設定タブ改善全Phase完了（26テスト項目100%合格、EventBus統合） | HIGH | 22h |
| 11/21 | 全タブ数字統一（17,557円ズレ解消） | CRITICAL | 2h |
| 11/16 | 月次カレンダー機能実装（日別損益の視覚化） | MEDIUM | 10h |
| 11/14 | 新規エントリーフォーム全問題完了（6問題解決） | CRITICAL-HIGH | 6.75h |
| 11/10-11 | 円建て損益保存バグ完全解決（150円ズレ解消）、経費フィルター修正、レポートバグ修正 | CRITICAL | 2日 |

---

## 🎓 Part V: ベストプラクティス集

### UIファイル配置ルール
設定タブ関連UIは `js/part5/` に配置: broker-ui.js, favorite-pair-ui.js, capital-ui.js, year-start-balance-ui.js

---

### 教訓15: CSSデバッグの体系的アプローチ
`getComputedStyle(el)` で計算値確認→インラインスタイル確認→親要素チェーン→`setProperty('x','y','important')`で強制テスト。感覚で数値を変えず、必ずデバッグで値を計算する。

---

### 教訓16: データ形式の不一致
同じフィールドでも保存形式が異なる場合がある（例: メモは`<br>`、相場観は`\n`）。両方の形式に対応する処理を実装する。

---

### 教訓17: Canvas レスポンシブ判定（clientWidth使用）
`canvas.width`は内部解像度、`canvas.clientWidth`が実際の表示サイズ。レスポンシブ判定は必ず`clientWidth`で行う。

---

### 教訓18: CSS詳細度の競合確認
スタイルが効かない時は「ファイル更新・キャッシュ」より先にCSS詳細度の競合を確認。同じ詳細度は後勝ち。`!important`は最終手段。

---

### 教訓19: 標準化したら古いファイルも全て更新する
MODULES.mdでフィールド名を標準化したら、`grep -r "oldFieldName" *.js` で全ファイルを一括確認・更新する。

---

### 教訓20: Supabase無料プランの1週間停止
1週間非アクティブでプロジェクトが自動停止。症状: `ERR_NAME_NOT_RESOLVED`。対処: ダッシュボードで「Restore/Resume」。予防: 週1回アクセス。

---

### 教訓21: 署名付きURL（Signed URL）の有効期限切れ
Supabase Storage署名付きURLは1時間〜7日で期限切れ→403エラー。`getValidImageSrc(img)` で自動更新。localStorageのURL更新だけでなく**Supabase側も同時更新**が必要。

---

### 教訓22: クラウド同期のデータフロー理解
「保存」と「読込」は別問題。別デバイスでログイン後にデータが空→ログイン後の自動同期処理が必要（AuthModule.syncAllDataFromCloud()）。

---

### 教訓23: フィールド名の不一致問題（entryDatetime vs entryTime）
モジュール間でフィールド名が統一されていないとNULL保存が発生。TradeManager-nomodule.jsの`_normalizeTradeData`にエイリアス変換を追加。SyncModuleに渡す前のデータをフックで確認する習慣をつける。

---

### 教訓24: imageUtils.jsバージョン管理と画像データ構造
バージョンアップ時は前バージョンの全機能を含める（v1.2.0作成時にv1.1.0の機能を漏らして画像消失）。画像データ必須フィールド: `url`（表示用）、`path`（復元用・必須）、`title`、`description`。

---

### 教訓25: 決済プロバイダは「単一障害点」にしない
1社の審査落ちでリリースが止まる体制は危険。Stripe閉鎖（2026-03-17）→PAY.JP否決（2026-04-03）の連鎖で、約1ヶ月リリースが止まった。PayPal+Square二本立てに転換してから安定。**多層決済戦略**を初めから設計すべき（v3.10 §5）。

---

### 教訓26: フロント側プラン制限はUX、サーバー側はセキュリティ
PaymentModule.canAddTrade等のフロント側制限はF12で書き換え可能。技術力のあるユーザーがFreeのまま無制限利用できる脆弱性がある。Supabase RLS Policy + INSERTトリガーで多層防御を構築する（Phase 11 / v3.10 §11）。フロント側は「保存ボタン押す前のフィードバック」、サーバー側は「最終防衛ライン」と役割分担。

---

### 教訓27: 審査対策のホームページ表現
「FX」「金融」「投資」のキーワードは決済審査の自動判定で減点。「トレード記録」「データ分析」「規律を身につける」等の表現に統一。NotebookLMで作る審査対策画像は、金額表示を排除し「件数のみ」「統計サマリー」等の中立的なスクショに差し替えると通りやすい（v3.10 §4）。

---

### 教訓28: Edge Function内の req.url は内部localhost URLを返す（Square Webhook 署名検証バグ）
Square Webhook の HMAC 署名検証では「通知URL + リクエストボディ」を連結して計算する。しかし Supabase Edge Function 内で `req.url` を取得すると、Squareが送った公開URLではなく、内部の Deno serve が listen している localhost URL（`http://localhost:9999/...`）が返ってくる。署名計算が不一致になり「Invalid signature」(401)エラー発生。

**修正方法**: `Deno.env.get("SUPABASE_URL")` から公開URLを動的に組み立てる:
```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const notificationUrl = `${supabaseUrl}/functions/v1/square-webhook`;
```
発見経緯: 2026-04-28 のSandbox Webhook検証で連続401。Signature Key値は正しかったが、HMAC入力URLが不一致していた。修正後 即200 OK。

---

### 教訓29: Square Webhookイベント名「invoice.scheduled_charge_failed」（payment_made_failed ではない）
v3.9 まで `invoice.payment_made_failed` と記載していたが、Square Sandbox Dashboard の購読可能イベント一覧には存在しない。サブスクリプション自動課金失敗を捉える正しいイベントは **`invoice.scheduled_charge_failed`**（"Published when an automatic scheduled payment for an Invoice has failed"）。v3.10 §9-A で訂正。

---

### 教訓30: SQL Editor では auth.uid() がNULL（postgres roleで動くため）
Supabase Dashboard の SQL Editor は `postgres` 役割で実行されるため、`auth.uid()` を使うクエリが NULL マッチで0行になる。テスト時は user_id を直接指定する必要あり。本番アプリやEdge Functionからの実行では `auth.uid()` が認証ユーザーIDを正しく返す。

---

### 教訓31: subscriptions.user_id は auth.users への外部キー（架空IDでテスト不可）
Phase 11 のテストで架空のテスト user_id（`00000000-...-099`）を subscriptions に INSERT しようとして 23503 FK制約違反。テストは実ユーザーで「Free切替→保存試行→Pro復帰」のSQLサイクルで実施するのが現実解。テスト trade ID は固定文字列（例: `phase11-test-trade`）にして最後に確実に DELETE する。

---

### 教訓32: フロントエンドのプラン制限は「無料保存」攻撃には完全防御できない（Phase 11.5）
Supabase RLS とトリガーは「クラウド同期」側を完全に守るが、**localStorage への保存だけならクライアント突破で無制限可能**になる盲点があった（テスト2で発見）。対策として bridge.js に独立3チェック（canAddTrade / getCurrentPlan+count / 異常値）の多層防御 + script.js 起動時整合性チェック（毎回トースト+モーダル）を追加。100%防御は技術的不可能だが、Pro価値（クラウド同期・マルチデバイス）は守れているので「無料利用の脱法」の実利益は無し、と割り切る。

---

### 教訓33: 計算ロジックの「期間判定基準」はモジュール横断で必ず統一する（FIX-6）
ReportModule・AISummaryModule・StatisticsModule・SummaryCalculator・CSVExporter で、期間（年・月・四半期）でトレードを絞り込む基準が **trade.date / entry_time / exit_time で混在** していた。月跨ぎトレード（3/31 entry, 4/2 exit）が、あるタブでは3月、別のタブでは4月に計上されて「タブ間で数字が合わない」現象が再発。**仕様判断 Q2=B（exit_date = 損益確定日 基準）に全モジュールで統一**することで解決。

**横断ルール**: 期間絞り込みコードを書くときは必ず `trade.exits[trade.exits.length - 1].time` でフィルタ。未決済トレード（exits 配列が空）は明示的に除外。セッション分析（NY/TOKYO/LDN）は性質上 entry_time のままで OK（決済時刻ではなく取引時刻を見る）。

---

### 教訓34: 同じ計算は1つのモジュールに集約・他は委譲（FIX-9）
利益率計算が CapitalManagerModule / capital-ui.js / SummaryCalculator の3箇所で別実装されていて、同じデータでもタブによって違う値が出ていた。**SummaryCalculator.calculateProfitRate(year=null) を「単一の真実」**として、CapitalManager と capital-ui からはそこに委譲する形に統一。検証結果: SummaryCalc 4116.65% / CapitalMgr 4116.65% / 差: 0.000000。

**横断ルール**: 「タブによって数字が違う」現象が出たら、まず計算式が複数箇所に散ってないかを確認する。フォールバック実装は残してOK（モジュールロード順依存への保険）が、本流は1モジュールに集約する。

---

### 教訓35: 監査の「false positive 判定」は実コード再確認が最優先（FIX-13 / 元 CRITICAL #11）
4並列エージェントによる監査で、CRITICAL #11（emotionStats 未実装）と WARNING W3（手数料符号二重）の2件が発見されたが、実コード再確認の結果どちらも **既に正しく実装済み**だった。監査エージェントは「ありそうなバグ」を推測ベースで指摘することがある。**修正フェーズに入る前に必ず実コードで再現確認**する。再現できないものは false positive として記録し、原因（仕様書と実装の乖離など）を明記して教訓化する。

**横断ルール**: 監査結果のうち修正に着手する前に「これは本当に再現するか?」を 1ファイル必ず確認。盲信せず、自分の目で確かめてから修正する。社長コンパナの「本当に間違えられない」を最優先するなら、誤検出を見逃さないことも同じく重要。

---

### 教訓36: 締め後編集ガードはユーザー直接操作のみブロック（FIX-11）
TradeManager.addTrade/updateTrade/deleteTrade と ExpenseManager.addExpense/deleteExpense にガードを追加（締め月のデータは編集拒否＋アラート）。一方で **SyncModule は localStorage を直接書き込むため、ガード対象外**。これは正しい設計: クラウドから同期で降ってきたデータは「事実」なので拒否してはいけない。ガードはあくまで「ユーザーが今この瞬間に手動で編集しようとした操作」のみブロックする。Q4=B 確定で締め解除 API（reopenMonthlyClosing）も提供しているので、編集が必要な場合は解除→編集→再締めのフローで対応可能。

---

### 教訓37: ブラウザコンソール検証スクリプトはリリース前監査の決定打になる（FIX-17）
17件の修正を実装後、本番URLでブラウザのコンソールから `await window.runCalcLogicVerification()` を1コマンド実行 → V1〜V7 + 統合検証 2件 = 9項目が一発で検証できた。実データ191件でも数秒で結果が出る。**SaaS の信用は一度でなくなる**ので、リリース前にこの種の自動検証スクリプトを書いて9/9合格を確認するのは投資対効果が極めて高い（実装30分で全 17 FIX の正しさを保証）。スクリプトは `js/utils/calcLogicVerification.js` として残してあるので、今後の機能追加時にも再実行可能。

---

### 教訓38: SaaSは「コスト」ではなく「自己投資」と認識される設計が継続率を決める（Premium v1.3）
Premium 要件定義書 v1.2 → v1.3 の戦略転換で、「機能の足し算」ではなく「**毎月の投資効果を金額で見せる**」発想に切り替えた。NetflixやSpotifyは典型的な「コスト」（払って消える）。freeeやマネーフォワードは「投資寄り」（節税額が残る）。TCはこの「投資効果ダッシュボード」を毎月可視化することで、月¥2,980 を「安い」と感じさせる。具体的には①節税額（年間累計）②時間節約 ③回避損失見込み ④プレイブック資産 の4数値を表示し、解約画面でも「失う効果」を事実として提示する。**「敵に回すと困るサービス」の正体は、ユーザーが切ろうとしたとき過去のデータを失うコストが乗り換えコストを超える状態**を構造で作ること。

---

### 教訓39: 不景気耐性は「業務フローへの溶け込み」で作る（Premium v1.3）
Premium v1.3 の主役を「AIトレードコーチ」から「**確定申告AI**」に切り替えた根拠は、確定申告という業務が**景気に関係なく毎年発動する**こと。「今年の損失繰越」「来年の節税」というデータがTCにしかない状態を作れば、絶対に切れない。不景気で切られないSaaSの4条件:（1）失うコスト > 乗り換えコスト（2）業務フローに溶け込む（3）お金を生む/守るサービス（4）周囲を巻き込む（税理士に渡せるレポート）。これらを設計段階で全て入れ込む。日本特化の確定申告は海外SaaS（TraderSync, Edgewonk等）が構造的に手を出せない領域なので、最強の参入障壁になる。

---

### 教訓40: AIコーチの文章スタイルは行動変容理論で設計する（Losada比3:1 / Tiny Habit / CBT）
Premium v1.3 §10 で文章スタイルガイドラインを新規策定。**漫然と「優しい言い方」を心がけても再現性がない**ので、以下を強制ルール化:（A）肯定:否定 = 3:1〜5:1（Losada比、Gottman比）→ 多すぎると行動変容が起きない、少なすぎると価値を感じない（B）改善提案は5段構成（現状→数値→解釈→Tiny Habit→期待効果）→ Foggの Tiny Habits 思想で30秒完了の具体行動に落とす（C）行動を批判する、人格を批判しない（CBT原則）→「あなたはルールを守れていません」NG、「先週、3回ルール外のエントリーがありました」OK（D）期待効果は必ず金額換算する → 「金曜午後を見送るだけで年換算 +120,000円」のように。これらをシステムプロンプトに明示し、出力品質を一定化する。

---

### 教訓41: 「規律」を売るプロダクトが押し売りしたら筋が通らない（Premium UX 設計の禁忌）
Premium v1.3 §13.1 を最初に設計した際、コンバージョンファネル発想で「Free 段階での Premium ぼかし表示」「ティーザー CTA」「20件達成時の Premium 強調」を含めた。社長から「Pro でも十分収支は変われる。広告に感じると人は離れる」と指摘され、根本的に再設計。**「立ち止まれ・自己選別・押し売りしない」を哲学に掲げるプロダクトが、UX で押し売りしたら哲学に反する**。Studio Compana の自己選別マーケティングの本質は「来る者拒まず、去る者追わず」。Free 20件で離脱する人OK、Pro で満足する人OK、Premium に進む人OK。各段階で「ここで止まってもOK」を尊重する。

**横断ルール**: アップセル・コンバージョン施策を考える前に、それが哲学に反していないか確認する。マーケティング教科書の手法（ティーザー・カウントダウン・サンプル表示・優遇キャンペーン）が**他のプロダクトでは正解でも、TC では禁忌**。記録の癖をつけてもらう（Pro 中心）が最優先で、Premium は自分から探しに来た人だけが見つける設計。実装フローで詳細は v1.3 §13.6（アップグレード体験設計）参照。

---

### 教訓25: 関数の単一責任原則
1つの関数は1つの責任のみ。「閉じる」+「リセット」など複数処理は別関数に分離する。

---

### 教訓26: データ形式の一貫性
関数に渡す前にデータ形式を正規化する。入力データの検証を必ず行う。

---

### 教訓27: データ取得元の優先順位
編集中のデータは一時変数（temp〜）から優先取得する。データソースの優先順位を明確にドキュメント化する。

---

### 教訓28: iOS自動ズーム防止（font-size: 16px）
iOSは`font-size`が16px未満の入力フィールドで自動ズーム。`font-size: 16px !important` を明示的に指定（remではなくpx）。

---

### 教訓29: 遅延取得パターン（モジュール間依存）
constructor内で他モジュールを参照すると初期化順序によってnullになる。使用する時点で `window.XxxModule` から遅延取得する。

---

### 教訓30: 段階的Phase実装の効果
大規模機能はPhase分割で段階的実装。各Phaseで動作確認→バグ早期発見、進捗可視化、問題の切り分けが容易。

---

### 教訓31: CSSアニメーションのブラウザ互換性
`background-clip: text` + `background-position` のCSSアニメーションはChromeで非動作。`requestAnimationFrame` でJS制御に切替。`window.setTheme`はSettingsModuleが上書きするため、EventBusの`settings:themeChanged`を監視する（MODULES.md準拠）。

---

### 教訓32: iOS横スクロール対応パターン
テーブルの`overflow-x: auto`がiOSで効かない場合、親要素にスクロールコンテナクラスを追加して対応。flexレイアウト内でボタンが縦書きになる場合は `white-space: nowrap !important; flex-shrink: 0` で防止。

---

### 教訓33: オフライン差分マージはテーブルごとに戦略を変える

| テーブル | 戦略 | 理由 |
|---------|------|------|
| trades / notes | Last Write Wins（`updated_at`比較） | `updated_at`カラムが存在する |
| expenses / capital_records | IDユニオン方式 | `updated_at`カラムがない |

IDユニオン方式: ローカルのみ→クラウドへ、クラウドのみ→ローカルへ、両方→クラウド優先。`initialize()`内（`#setupEventListeners()`直後）にオンライン復帰リスナーを登録。

---

## 🔧 Part VI: よくある問題と解決策

### Supabase画像トラブル

| 症状 | 原因 | 解決策 |
|------|------|--------|
| 全画像が見えない + `ERR_NAME_NOT_RESOLVED` | プロジェクト停止 | ダッシュボードで再開 |
| 特定の画像が見えない + 403エラー | 署名付きURL期限切れ | `getValidImageSrc()` で再取得 |
| 別デバイスで画像が見えない | クラウド同期未実行 | ログイン後に `syncNotesToLocal()` |
| URL更新してもリロードで戻る | Supabase側が古いまま | Supabase側も更新が必要 |

### Supabase同期フィールド名トラブル

| 症状 | 確認方法 | 解決策 |
|------|---------|--------|
| 特定フィールドがNULL | SyncModule.saveTradeをフック | フィールド名マッピングを確認 |
| データが保存されない | コンソールでエラー確認 | SyncModule初期化状態を確認 |
| 古いデータで上書き | 複数環境の同時ログイン | 1環境だけでテスト |

### CSS関連

**text-overflow: ellipsisで文字が切れる**: `overflow: visible !important; text-overflow: clip !important; white-space: normal !important; height: auto !important`

**white-spaceで改行が効かない**: `white-space: pre-wrap !important`（改行を保持しつつ折り返し）

| white-space値 | 改行文字 | 自動折り返し |
|--------------|---------|-------------|
| normal | 無視 | あり |
| nowrap | 無視 | なし |
| pre-wrap | 保持 | あり ← 推奨 |
| pre-line | 保持 | あり |

---

## 📚 Part VII: 参考情報

### モジュール構成（現在）

**完成済み**: Part 2（TradeManager, TradeEntry, TradeExit, TradeEdit, TradeDetail, TradeList, YenProfitLoss）、Part 3（NoteManagerModule）、Part 5（設定6ファイル）、Part 7（BulkImport, ExpenseManager, ClosingManager, CSVExporter, SummaryCalculator）、Part 8（Statistics, Report, Chart, AISummary）

**対象外**: Part 1（基盤・初期化。全モジュールがグローバル関数として依存、モジュール化リスク高）、bridge.js（47関数依存の互換性レイヤー、リリース後v1.1で検討）

### タブ構成
1. 📝 新規エントリー - 入力フォーム、リスク管理、手法選択
2. 📄 トレード記録 - 一覧・詳細・編集・削除、バッジ表示
3. 📓 相場ノート - ノート作成、カレンダー表示
4. 📊 分析 - Pips/円建て統計、レポート、チャート、ルール遵守・リスク分析
5. 💰 収支管理 - 経費管理、締め処理
6. ⚙️ 設定 - テーマ切替、データ管理、許容損失設定、手法管理

---

## 🔶 Part VIII: 未解決の問題

### ✅ 解決済み: オフライン保存データのリロード消失（2026-03-09）
SyncModule v1.8.0で差分マージ機能（5メソッド追加）を実装。`window.addEventListener('online',...)`で自動検知。既存コードへの変更ゼロ。

### ✅ 解決済み: iPhone Safari編集ボタン問題（2025-12-23）
localStorageのbrokersデータが古い形式（配列のみ）→SettingsModule.jsの`#loadBrokers()`にデータ形式検証と自動マイグレーション処理を追加。

### ✅ 解決済み: セルフイメージ保存バグ（2026-02-25）
4つの複合問題（saveGoalsにshowToastなし、settings:changed未発火、sync:settings:synced未受信、updateGoalsDisplay()が入力フィールドを更新しない）をSettingsModule.js 3箇所修正で解決。教訓: EventBusイベント名の不一致に注意、保存系処理には必ずトースト通知、表示更新関数は全表示箇所を網羅する。

---

*最終更新: 2026-03-09 | v5.8.0（SyncModule v1.8.0 オフライン差分マージ機能完了）*
