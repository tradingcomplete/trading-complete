# 決済システム 要件定義書・ロードマップ v2.0

**プロジェクト**: Trading Complete  
**対象**: 課金・サブスクリプション管理  
**作成日**: 2026-03-17  
**更新日**: 2026-04-03  
**ステータス**: 🔄 決済手段を並行申請中（KOMOJU最優先）

---

## 実装進捗サマリー

| Phase | 内容 | 状態 | 完了日 |
|-------|------|------|--------|
| Phase 1〜5 | Stripe版実装・テスト | ✅ 完了（アーカイブ） | 2026-03-08 |
| Phase 6 | Stripe本番切替 | ❌ Stripe禁止業種により閉鎖 | 2026-03-17 |
| Phase 7 | PAY.JP移行・テスト | ✅ テスト完了 | 2026-03-28 |
| Phase 7.5 | PAY.JP本番利用申請 | ❌ 全カード種類否決 | 2026-04-03 |
| Phase 8 | 並行申請・ホームページ修正 | 🔄 進行中 | - |

---

## 1. 背景・経緯（時系列）

| 日付 | 出来事 |
|------|--------|
| 2026-03-08 | Stripe Phase 1〜5 実装・テスト完了 |
| 2026-03-17 | Stripeから「禁止業種（FX関連）」として閉鎖通知 |
| 2026-03-17〜 | PAY.JPに移行・実装・テスト完了 |
| 2026-03-21 | 開業届 e-Tax電子提出完了 |
| 2026-03-27 | DMMバーチャルオフィス審査通過・住所確定 |
| 2026-03-27 | tokutei.html更新完了 |
| 2026-03-28 | PAY.JP本番利用申請完了 |
| 2026-04-03 | PAY.JP審査結果受信：全カード種類 否決（理由非開示） |
| 2026-04-03 | 原因分析・ホームページ修正完了・並行申請作戦を決定 |

### 審査落ちの根本原因

「FX＝金融業」と審査AIおよび審査官に自動判定されたため。
TCは記録ツール（SaaS）だが、ホームページの文言・画像が金融取引業に見えていた。

Stripeは閉鎖済み（再申請不可）。
PAY.JPは理由非開示の否決。「再申請不可」とは書かれていないため再申請は可能。
PayPayは別途審査中（結果待ち）。

---

## 2. プラン設計（変更なし）

### プラン一覧

| プラン | 月額 | 年額 | 対象 |
|--------|------|------|------|
| Free | 0円 | 0円 | お試し・ライトユーザー |
| Pro | 1,980円 | 19,800円（2ヶ月無料） | アクティブトレーダー |
| Premium | 2,980円 | 29,800円（2ヶ月無料） | 将来提供予定 |

### 早期割引（ローンチキャンペーン）

```
最初の100人限定:
  Pro:     1,480円/月（25%オフ）→ 終身価格
  Premium: 2,480円/月（17%オフ）→ 終身価格
```

### 制限ポリシー

```
常に使える（全プラン共通）:
  ログイン・データ閲覧・全分析機能・CSV出力・設定変更

制限される（Freeの壁）:
  新規トレード記録 → 累計50件超でブロック
  クラウド同期 → Pro以上のみ

解約後:
  期間終了日までPro機能を維持
  期間終了後 → Freeに降格
  データは引き続き利用可能
  再契約すればすぐ復活
```

---

## 3. 技術構成（PAY.JP版・実装済み）

```
[ユーザー（ブラウザ）]
      |
      +-- PAY.JP Checkout（公式ポップアップ）
      |     postMessageでトークンを親ウィンドウに送信
      |
      +-- [フロントエンド] PaymentModule.js v2.3.0
      |     +-- プラン表示
      |     +-- PAY.JP Checkout公式ポップアップ起動（隠しボタン方式）
      |     +-- postMessageイベントでトークン受信
      |     +-- create-checkout-session呼び出し
      |     +-- プラン制限UI
      |     +-- cancelSubscription()で解約
      |
      +-- [サーバーサイド] Supabase Edge Functions
      |     +-- create-checkout-session ✅ デプロイ済み
      |     +-- payjp-webhook ✅ デプロイ済み（--no-verify-jwt）
      |     +-- cancel-subscription ✅ デプロイ済み
      |
      +-- [データベース] Supabase
            +-- subscriptions テーブル（既存流用）
```

### PAY.JP Checkoutの仕組み（重要）

PAY.JPのCheckoutはpostMessageでトークンを送信する仕様。
data-on-createdやform submitは発火しない。

```javascript
window.addEventListener('message', async (e) => {
    if (e.origin !== 'https://checkout.pay.jp') return;
    const data = JSON.parse(e.data);
    if (data.action !== 'applyResponse') return;
    // data.response.id がトークンID
});
```

### index.htmlへの追加（実装済み）

```html
<!-- display:noneではなく画面外に配置すること（display:noneだとボタンが生成されない） -->
<div style="position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;">
    <form id="payjp-hidden-form" action="javascript:void(0);">
        <script type="text/javascript"
            src="https://checkout.pay.jp/"
            class="payjp-button"
            data-key="pk_test_bfa24c122f461caf9c9edf7b"
            data-on-created="payjpTokenCallback"
            data-lang="ja"
            data-submit-text="決済する"
            data-name="Trading Complete">
        </script>
    </form>
</div>
```

### Edge Functions URL一覧

| 関数名 | URL |
|--------|-----|
| create-checkout-session | https://apqmrhksogpscdtktjwd.supabase.co/functions/v1/create-checkout-session |
| payjp-webhook | https://apqmrhksogpscdtktjwd.supabase.co/functions/v1/payjp-webhook |
| cancel-subscription | https://apqmrhksogpscdtktjwd.supabase.co/functions/v1/cancel-subscription |

---

## 4. ホームページ修正（完了済み・2026-04-03）

### 修正した箇所（8箇所）

| # | 場所 | 修正前 | 修正後 |
|---|------|--------|--------|
| 1 | タイトルタグ | FXトレーダーのための統合管理システム | トレーダーのためのトレード記録・分析SaaS |
| 2 | ヒーロー説明文 | FXトレーダーのための成長支援システム | トレーダーのためのトレード記録・分析システム |
| 3 | 負けのループ Step1 | FXで早く稼げるらしい | 副業トレードを始める |
| 4 | 哲学フロー | 収入に変わる / ギャンブルから脱出 | 規律に変わる / 感覚から脱出 |
| 5 | Developer Storyタイトル | 500万円の絶望から生まれた6万行の執念 | 記録できなかった日々から生まれた6万行の執念 |
| 6 | Developer Story本文 | 500万円を溶かし・家庭崩壊・聖杯探し・感情トレード | ルールなき感覚トレードを繰り返し・大きな失敗 |
| 7 | プロフィール | FXトレーダー 7年 | トレード記録7年 |
| 8 | フッター | （免責事項なし） | 金融商品ではない・投資助言は行わない を明記 |

### 残っている問題（画像・未対応）

ホームページに掲載している画像も金融取引システムに見えるリスクがある。

| 画像 | リスク | 対応方針 |
|------|--------|---------|
| feature-risk.jpg（赤黄緑のリスク判定） | 最も危険・金融リスク管理に見える | feature-checklist.jpgに差し替え |
| チャート系スライド画像 | 金融取引画面に見える | 文字入力系の画面に差し替え |

---

## 5. 今後の作戦（並行申請）

### 基本方針

複数サービスに同時申請して、最も早く通ったものでリリースする。
申請は無料。落ちても失うものはない。

```
ホームページ文言修正（完了）
        ↓
┌──────────────────────────────────────┐
│  KOMOJU申請   PAY.JP再申請   Paddle申請  │
│  （最優先）   （タイミング）  （後回しOK） │
└──────────────────────────────────────┘
        ↓
一番早く通ったものでリリース 🎉
```

### KOMOJU（最優先）

| 項目 | 内容 |
|------|------|
| 公式サイト | https://ja.komoju.com |
| 特徴 | 日本製・日本語完結・個人事業主実績多数 |
| 手数料 | クレカ 3.6%（Stripeと同等） |
| 審査期間 | 数日〜10日 |
| 必要書類 | 本人確認書類・開業届・特商法ページ |
| 状態 | ⬜ 未申請 |

申請時の注意: 業種は「SaaS」「ソフトウェア」「情報サービス」を選ぶ。「FX」「金融」には絶対に関連付けない。

### PAY.JP再申請

| 項目 | 内容 |
|------|------|
| 状態 | ⬜ ホームページ修正完了・タイミングを見て実施 |
| タイミング | 画像差し替えも完了してから申請が望ましい |
| PayPay | 🔄 別途審査結果待ち（メールで連絡予定） |

### Paddle

| 項目 | 内容 |
|------|------|
| 特徴 | Merchant of Record方式（Paddleが販売者として引き受ける） |
| 手数料 | 5% + 約80円 |
| 状態 | ⬜ KOMOJUが落ちた場合の選択肢 |
| 注意 | 実績3ヶ月必要の報告あり・英語対応 |

---

## 6. リリース前の残作業一覧

### 決済が通り次第、即実施する作業

| # | 作業 | 内容 |
|---|------|------|
| 1 | hrefリンク差し替え | index.htmlの href="#" 3箇所を正しいURLに変更 |
| 2 | console.log無効化 | index.htmlの head先頭に追加 |
| 3 | ホームページ画像差し替え | feature-risk.jpgなど金融系に見える画像を差し替え |
| 4 | 本番APIキー切り替え | 通過したサービスの本番キーに変更 |
| 5 | 本番リリース | 🎉 |

### console.log無効化コード

```html
<script>
  if (location.hostname !== 'localhost') {
      console.log = () => {};
      console.info = () => {};
      console.debug = () => {};
  }
</script>
```

### KOMOJUが通った場合の追加作業

1. KOMOJUのAPIキー取得
2. PaymentModule.jsの改修（PAY.JPからKOMOJU対応に変更）
3. Edge Functionsの改修（3つ）
4. index.htmlの決済scriptタグ変更
5. テスト決済（全項目確認）

### PAY.JPが通った場合の追加作業

1. PaymentModule.js: PAYJP_PUBLIC_KEY → pk_live_xxx
2. index.html: data-key → pk_live_xxx
3. Edge Function Secrets: PAYJP_SECRET_KEY → sk_live_xxx
4. Edge Function Secrets: PAYJP_WEBHOOK_SECRET → 本番トークン
5. Edge Functions再デプロイ（3つ）
6. PAY.JP管理画面でライブモードのWebhookを登録

---

## 7. 重要な注意点

### お金に関わる処理の鉄則

1. カード情報を絶対に触らない → 決済サービスのCheckoutに任せる
2. 課金状態の判定はサーバーサイドで → WebhookからDBを更新
3. フロントエンドのプラン情報は信用しない → 表示用のみ
4. Webhookの署名検証は必ず行う → なりすまし防止
5. テストモードで十分検証してから本番切替

### PAY.JP固有の注意点（実装時のトラブルと解決策）

1. checkout.pay.jpは動的ロード不可 → 公式Checkoutポップアップ方式に変更
2. PAY.JP Checkoutは display:none の中だとボタンを生成しない → position:fixedで画面外に配置
3. data-on-created コールバックは呼ばれない → postMessageで受信する方式が正解
4. form.submitも発火しない → postMessageのみが正解
5. Supabase Vault ≠ Edge Function Secrets → Deno.env.get()で読むのはSecrets
6. 初回テスト時にStripe時代のcustomer IDが残っていた → subscriptionsテーブルを削除して解決

---

## 8. 環境情報

| 項目 | 値 |
|------|-----|
| Supabase Project ID | apqmrhksogpscdtktjwd |
| Edge Functions ソース | C:\Users\focus\supabase-functions\supabase\functions\ |
| デプロイコマンド | cd C:\Users\focus\supabase-functions && npx supabase functions deploy [name] --project-ref apqmrhksogpscdtktjwd |
| webhookデプロイ | 末尾に --no-verify-jwt を追加 |

### PAY.JPプラン情報（テストモード）

| 項目 | 値 |
|------|-----|
| Pro月額プランID | pro_monthly |
| Pro年額プランID | pro_yearly |
| テスト公開鍵 | pk_test_bfa24c122f461caf9c9edf7b |

---

## 9. 法務・事業者情報

| 項目 | 内容 | 状態 |
|------|------|------|
| 屋号 | Studio Compana | ✅ 確定 |
| 代表者 | 成瀬仁文（ナルセ マサフミ） | ✅ 確定 |
| 住所 | 〒450-0002 愛知県名古屋市中村区名駅3-4-10 アルティメイト名駅1st 2階 | ✅ 確定 |
| 開業届 | e-Tax電子提出（2026-03-21） | ✅ 受付完了 |
| 青色申告 | 承認申請済み | ✅ 提出済み |
| バーチャルオフィス | DMMバーチャルオフィス名古屋（660円/月） | ✅ 審査通過 |
| tokutei.html | 住所・屋号・支払方法・免責事項 更新済み | ✅ 完了 |

### 法務ページURL

| ページ | URL |
|--------|-----|
| 特定商取引法 | https://tradingcomplete.com/tokutei.html |
| 利用規約 | https://tradingcomplete.com/legal/#terms |
| プライバシーポリシー | https://tradingcomplete.com/legal/#privacy |

---

## 更新履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.0 | 2026-03-17 | 初版作成（Stripe版アーカイブ化・PAY.JP移行方針確定） |
| v1.1 | 2026-03-20 | 屋号をStudio Companaに確定・開業届作成 |
| v1.2 | 2026-03-21 | 開業届の電子提出完了 |
| v1.3 | 2026-03-24 | PAY.JPプラン作成・Edge Function Secrets登録完了 |
| v1.4 | 2026-03-24 | Edge Functions 3つデプロイ完了 |
| v1.5 | 2026-03-25 | Webhook登録・PaymentModule.js更新・テスト完了 |
| v1.6 | 2026-03-26 | DMMバーチャルオフィス申し込み完了 |
| v1.7 | 2026-03-27 | DMMバーチャルオフィス審査通過・tokutei.html更新完了 |
| v1.8 | 2026-03-28 | PAY.JP本番利用申請完了 |
| v1.9 | 2026-03-28 | 審査待ち状態を明記・次のアクションを整理 |
| v2.0 | 2026-04-03 | PAY.JP審査落ち・ホームページ修正完了・並行申請作戦に移行 |
