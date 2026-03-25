# PAY.JP決済システム 要件定義書・ロードマップ v1.4

**プロジェクト**: Trading Complete  
**対象**: 課金・サブスクリプション管理（PAY.JP版）  
**作成日**: 2026-03-17  
**更新日**: 2026-03-24  
**ステータス**: 🔄 Step 7.3 完了・Webhook登録待ち

---

## 実装進捗サマリー

| Phase | 内容 | 状態 | 完了日 |
|-------|------|------|--------|
| **Phase 1〜5** | Stripe版実装・テスト | ✅ 完了（アーカイブ） | 2026-03-08 |
| **Phase 6** | Stripe本番切替 | ❌ Stripe禁止業種により不可 | - |
| **Phase 7** | PAY.JP移行・本番リリース | 🔄 Step 7.3完了・次はWebhook登録 | - |

---

## 1. 背景・経緯

### なぜPAY.JPか

Stripe版（Phase 1〜5）は実装・テストまで完了済み。しかし本番切替直前にStripeから禁止業種（FX関連ツール）として正式拒否された。

PAY.JPは：
- 日本製・日本向けポリシー
- SaaSの利用料金を「審査スムーズな商材」として明示
- FX関連ツールの禁止業種記載なし
- 個人事業主・スタートアップ対応

### 将来の方針

| 市場 | 決済サービス |
|------|------------|
| 日本（現在） | PAY.JP |
| グローバル展開時 | Paddle または Lemon Squeezy（MoR方式・海外税務代行） |

---

## 2. プラン設計（Stripe版から継承・変更なし）

### プラン一覧

| プラン | 月額 | 年額 | 対象 |
|--------|------|------|------|
| **Free** | 0円 | 0円 | お試し・ライトユーザー |
| **Pro** | 1,980円 | 19,800円（2ヶ月無料） | アクティブトレーダー |
| **Premium** | 2,980円 | 29,800円（2ヶ月無料） | 将来提供予定 |

### 早期割引（ローンチキャンペーン）

```
最初の100人限定:
- Pro:     1,480円/月（25%オフ）→ 終身価格
- Premium: 2,480円/月（17%オフ）→ 終身価格
```

### 制限ポリシー

```
常に使える（全プラン共通）:
  - ログイン・データ閲覧
  - 全分析機能
  - CSV出力・設定変更

制限される（Freeの壁）:
  - 新規トレード記録 → 累計50件超でブロック
  - クラウド同期 → Pro以上のみ

解約後:
  - 期間終了日までPro機能を維持
  - 期間終了後 → Freeに降格
  - データは90日間保持
  - 再契約すればすぐ復活
```

---

## 3. 技術構成（PAY.JP版）

```
[ユーザー（ブラウザ）]
      |
      +-- PAY.JP（決済処理）
      |
      +-- [フロントエンド] PaymentModule.js
      |     +-- プラン表示、PAY.JP Checkout起動、プラン制限UI
      |
      +-- [サーバーサイド] Supabase Edge Functions
      |     +-- create-checkout-session（PAY.JPサブスク作成）✅ デプロイ済み
      |     +-- payjp-webhook（決済結果受取）✅ デプロイ済み
      |     +-- cancel-subscription（解約処理）✅ デプロイ済み
      |
      +-- [データベース] Supabase
            +-- subscriptions テーブル（既存流用）
```

### Edge Functions URL一覧

| 関数名 | URL |
|--------|-----|
| create-checkout-session | https://apqmrhksogpscdtktjwd.supabase.co/functions/v1/create-checkout-session |
| payjp-webhook | https://apqmrhksogpscdtktjwd.supabase.co/functions/v1/payjp-webhook |
| cancel-subscription | https://apqmrhksogpscdtktjwd.supabase.co/functions/v1/cancel-subscription |

### Stripe版との主な違い

| 項目 | Stripe版 | PAY.JP版 |
|------|---------|---------|
| 決済画面 | Stripe Checkout（外部遷移） | PAY.JP トークン + Edge Function |
| カスタマーポータル | Stripe提供 | なし → cancel-subscription で独自実装 |
| Webhook署名 | whsec_xxx | X-Payjp-Webhook-Token ヘッダー |
| プランID | Price ID | Plan ID |

---

## 4. データベース設計

### subscriptionsテーブル（既存流用・変更なし）

```sql
-- Stripe版から流用。カラム名は将来リネーム可能だが今は流用する。
-- stripe_customer_id → PAY.JPのcustomer IDを格納
-- stripe_subscription_id → PAY.JPのsubscription IDを格納
-- stripe_price_id → PAY.JPのplan IDを格納
```

**セキュリティ**: RLS有効、SELECTのみユーザーに許可、INSERT/UPDATE/DELETEはEdge Functions（service_role）のみ

---

## 5. 実装ロードマップ

### Phase 7: PAY.JP移行・本番リリース 🔄 進行中

#### Step 7.1: PAY.JPアカウント準備 ✅ 完了

```
✅ PAY.JPアカウント作成
✅ セキュリティ対策実施状況の申告
✅ 開業届の電子提出（2026-03-21 e-Tax受付完了）
✅ GMOオフィスサポート 名古屋 申し込み（審査中・1〜2営業日）
🔄 PAY.JP本番利用申請（GMO審査完了・住所確定後に提出）
  - 販売業者: Studio Compana
  - サービス説明: 「FXトレード記録・管理SaaS（投資アドバイスなし）」
  - 商材種別: ソフトウェアの提供（SaaS月額・年額サブスクリプション）
  - 特定商取引法ページURL: https://tradingcomplete.com/tokutei/
  - 利用規約URL: https://tradingcomplete.com/legal/
  - プライバシーポリシーURL: https://tradingcomplete.com/legal/#privacy
  - 添付書類: 開業届の受付完了メール（freeeから届くもの）
⬜ 本番APIキー取得（PAY.JP審査後）
```

#### Step 7.2: PAY.JPプラン・環境変数設定 ✅ 完了

```
✅ Pro月額プラン作成（pro_monthly / ¥1,980/月）
✅ Pro年額プラン作成（pro_yearly / ¥19,800/年）
✅ Supabase Vaultに環境変数登録
  - PAYJP_SECRET_KEY（テスト秘密鍵）
  - PAYJP_WEBHOOK_SECRET（Webhookトークン）
  - PAYJP_PRO_MONTHLY_PLAN_ID（= pro_monthly）
  - PAYJP_PRO_YEARLY_PLAN_ID（= pro_yearly）
```

#### Step 7.3: Supabase Edge Functions 書き換え ✅ 完了

```
✅ create-checkout-session → PAY.JPサブスクリプション作成に書き換え・デプロイ済み
✅ payjp-webhook → 新規作成・デプロイ済み（--no-verify-jwt）
✅ cancel-subscription → 新規作成・デプロイ済み
```

#### Step 7.3.5: PAY.JP Webhook登録 ⬜ 次の作業

```
⬜ PAY.JP管理画面 → API設定 → Webhook → 「+ Webhookを追加」
  URL: https://apqmrhksogpscdtktjwd.supabase.co/functions/v1/payjp-webhook
  受信イベント:
    - subscription.created
    - subscription.updated
    - subscription.deleted
    - charge.failed
```

#### Step 7.4: PaymentModule.js 更新 ⬜ 未着手

```
⬜ PRICE_IDS定数をPAY.JPのプランIDに変更
⬜ startCheckout() → PAY.JP トークン取得 + create-checkout-session 呼び出しに書き換え
⬜ openCustomerPortal() → cancelSubscription()に変更（cancel-subscription呼び出し）
⬜ PAY.JP公開鍵（pk_test_xxxx）をフロントエンドに設定
```

#### Step 7.5: テスト・検証 ⬜ 未着手

| # | テスト項目 | 結果 |
|---|-----------|------|
| 1 | Checkout作成 | ⬜ |
| 2 | 決済完了 | ⬜ |
| 3 | Webhook受信 | ⬜ |
| 4 | プラン反映 | ⬜ |
| 5 | 累計制限 | ⬜ |
| 6 | クラウド同期制限 | ⬜ |
| 7 | 解約処理 | ⬜ |
| 8 | 解約後Freeに降格 | ⬜ |
| 9 | 支払い失敗 | ⬜ |

#### Step 7.6: リリース前最終作業 ⬜ 未着手

```
⬜ GMOオフィスサポート審査完了 → 名古屋の住所を確認
⬜ tokutei.htmlの住所をバーチャルオフィス住所に更新
⬜ tokutei.htmlの屋号を「Studio Compana」に更新
⬜ PAY.JP本番利用申請を完了・審査通過
⬜ ホームページのhrefリンク差し替え（3箇所）
⬜ 本番APIキーに切り替え（Vault更新）
⬜ 本番リリース 🎉
```

---

## 6. 法務・事業者情報

### 法務ページ（作成済み）

| ページ | URL | 状態 |
|--------|-----|------|
| 特定商取引法 | tradingcomplete.com/tokutei/ | ✅ 作成済み（住所・屋号は要更新） |
| 利用規約 | tradingcomplete.com/legal/ | ✅ 作成済み |
| プライバシーポリシー | tradingcomplete.com/legal/#privacy | ✅ 作成済み |

### 事業者情報（確定済み）

| 項目 | 内容 | 状態 |
|------|------|------|
| 屋号 | **Studio Compana** | ✅ 確定・開業届提出済み |
| 開業届 | e-Tax経由で電子提出済み（2026-03-21） | ✅ 受付完了 |
| 税務署 | 小牧税務署（愛知県） | ✅ 確定 |
| 確定申告種別 | 青色申告（55万円控除） | ✅ 承認申請済み |
| 事業開始日 | 2026年3月20日 | ✅ 確定 |
| バーチャルオフィス | GMOオフィスサポート 名古屋 転送なしプラン | 🔄 審査中（1〜2営業日） |

### リリース前に更新が必要な項目

| 項目 | 状態 |
|------|------|
| バーチャルオフィス住所（tokutei.html） | ⬜ GMO審査完了後に更新 |
| 販売業者の屋号（tokutei.html） | ⬜ Studio Companaに更新が必要 |
| ホームページのhrefリンク（3箇所） | ⬜ リリース時に差し替え |

---

## 7. 重要な注意点

### お金に関わる処理の鉄則

1. カード情報を絶対に触らない → PAY.JP トークン化に任せる
2. 課金状態の判定はサーバーサイドで → WebhookからDBを更新
3. フロントエンドのプラン情報は信用しない → 表示用のみ
4. Webhookの署名検証は必ず行う → なりすまし防止
5. テストモードで十分検証してから本番切替

### PAY.JP固有の注意点

- Webhook署名は `X-Payjp-Webhook-Token` ヘッダーで検証
- Webhookエンドポイントは `--no-verify-jwt` が必要
- PAY.JPにはカスタマーポータルがないため解約は独自実装（cancel-subscription）
- テストカード: `4242424242424242`（PAY.JPテスト用）
- フロントエンドでPAY.JPトークン取得 → Edge Functionに送信する実装が必要

---

## 8. 引継ぎ情報

### 環境情報

| 項目 | 値 |
|------|-----|
| Supabase Project ID | apqmrhksogpscdtktjwd |
| Supabase Region | Northeast Asia (Tokyo) |
| Edge Functions ソースコード | C:\Users\focus\supabase-functions\supabase\functions\ |
| デプロイコマンド（webhook） | npx supabase functions deploy payjp-webhook --project-ref apqmrhksogpscdtktjwd --no-verify-jwt |

### PAY.JP管理画面情報

| 項目 | 値 |
|------|-----|
| Pro月額プランID | pro_monthly |
| Pro年額プランID | pro_yearly |
| テストモード | 有効中 |
| 本番申請 | GMOオフィス審査完了後に提出予定 |

### 参照アーカイブ

- `Stripe決済システム_要件定義書_ロードマップ_v1_7.md` — Stripe版の詳細設計・トラブルシューティング記録

---

## 更新履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| **v1.0** | **2026-03-17** | **初版作成（Stripe版アーカイブ化・PAY.JP移行方針確定）** |
| **v1.1** | **2026-03-20** | **屋号をStudio Companaに確定・開業届作成・PAY.JPアカウント進捗更新** |
| **v1.2** | **2026-03-21** | **開業届の電子提出完了（e-Tax受付完了）・バーチャルオフィス名古屋市に確定** |
| **v1.3** | **2026-03-24** | **GMOオフィスサポート申し込み完了・PAY.JPプラン作成・Vault環境変数登録完了** |
| **v1.4** | **2026-03-24** | **Edge Functions 3つデプロイ完了（create-checkout-session・payjp-webhook・cancel-subscription）** |
