/**
 * @module PaymentModule
 * @description 決済・サブスクリプション管理モジュール（PAY.JP + PayPal + Square 多層決済対応）
 * @version 3.1.1
 * @date 2026-04-28
 * @important MODULES.md準拠
 * @changelog
 * - v3.1.1 (2026-04-28): 改善項目#3 解約処理ローディング表示追加 + 改善項目#4 .single() → .maybeSingle()
 * - v3.1.0 (2026-04-28): Square Web Payments SDK 対応・E2Eテスト合格
 *
 * 【責務】
 * - 現在のプラン状態管理
 * - プラン制限チェック（トレード件数、クラウド同期、AI機能）
 * - PAY.JP Checkout公式ポップアップ起動（index.htmlのscriptタグ必須）
 * - PayPal JS SDKによるサブスクリプション作成（index.htmlのscriptタグ必須）
 * - Square Web Payments SDKによるカード情報トークン化（index.htmlのscriptタグ必須）[v3.1.0]
 * - Edge Function (create-checkout-session) 呼び出し（PAY.JP用）
 * - Edge Function (paypal-activate-subscription) 呼び出し（PayPal用）
 * - Edge Function (square-create-subscription) 呼び出し（Square用・3段階処理）[v3.1.0]
 * - サブスクリプション解約（provider別にEdge Function分岐：paypal / payjp / square）
 * - サブスクリプション情報の取得・更新
 *
 * 【依存関係】
 * - supabaseClient.js（必須）getSupabase()
 * - EventBus.js（必須）
 * - PAY.JP Checkout（index.htmlにscriptタグ必須）
 *   <script class="payjp-button" src="https://checkout.pay.jp/"
 *     data-key="pk_test_xxx" data-on-created="payjpTokenCallback" data-lang="ja">
 *   </script>
 * - PayPal JS SDK（index.htmlにscriptタグ必須）
 *   <script src="https://www.paypal.com/sdk/js?client-id=xxx&vault=true&intent=subscription&currency=JPY">
 *   </script>
 * - Square Web Payments SDK（index.htmlにscriptタグ必須）[v3.1.0]
 *   <script src="https://sandbox.web.squarecdn.com/v1/square.js"></script>
 *
 * 【EventBus】
 * - 発火: payment:initialized, payment:planChanged
 */
class PaymentModule {
    // ================
    // Private Fields
    // ================
    #supabase = null;
    #eventBus = null;
    #currentPlan = 'free';
    #subscription = null;
    #initialized = false;
    #pendingPlanId = null;       // Checkoutポップアップ中のプランID

    // ================
    // Static: PAY.JP 公開鍵
    // 本番切替時にここを差替え
    // ================
    static PAYJP_PUBLIC_KEY = 'pk_test_bfa24c122f461caf9c9edf7b';

    // ================
    // Static: PAY.JP プランID
    // 本番切替時にここを差替え
    // ================
    static PLAN_IDS = {
        pro_monthly: 'pro_monthly',
        pro_yearly: 'pro_yearly',
    };

    // ================
    // Static: PayPal Client ID（Sandbox）
    // 本番切替時にClient IDを差替え
    // ================
    static PAYPAL_CLIENT_ID = 'ATf3cbiPiYlvHmCDHcEwc1R_6kQ1D1kDlgkFrvDFX5ifPI8jtZn3jHUDL4rIFhUmT4VZAWkwBpPkVz0X';

    // ================
    // Static: PayPal Plan IDs（Sandbox）
    // 本番切替時にPlan IDsを差替え
    // ================
    static PAYPAL_PLAN_IDS = {
        pro_monthly: 'P-8H109475V37223216NHPRNQQ',
        pro_yearly: 'P-04D84309HK327863FNHPRNQQ',
    };

    // ================
    // Static: Square Application ID / Location ID（Sandbox）[v3.1.0]
    // 本番切替時にここを差替え（本番URL: https://web.squarecdn.com/v1/square.js）
    // ⚠️【重要】コンパナさん個人メモから値を貼り付けてください
    // ================
    static SQUARE_APPLICATION_ID = 'sandbox-sq0idb-7aRB3LPsW4LNrMaSnyWYUA';
    static SQUARE_LOCATION_ID = 'LP4KHQ9W8Q6AJ';

    // ================
    // Static: Square Plan Variation IDs（Sandbox）[v3.1.0]
    // 用途: planIdバリデーション用
    // 実際のVariation IDはSupabase Secrets（SQUARE_PLAN_VARIATION_ID_MONTHLY/YEARLY）で管理されており、
    // Edge Function側で参照されるため、フロント側はキー存在チェックのみに使用
    // ================
    static SQUARE_PLAN_VARIATION_IDS = {
        pro_monthly: 'PUJFOETWJHYMBNUGLZBJBMXH',
        pro_yearly: 'MQJEIPLXOVPHIQ2WO5QB2G7H',
    };

    // ================
    // Static: プラン制限定義（定数1行で変更可能）
    // ================
    static PLAN_LIMITS = {
        free: {
            totalTrades: 20,         // 累計20件まで
            cloudSync: false,        // クラウド同期なし
            hasAI: false,
        },
        pro: {
            totalTrades: Infinity,   // 無制限
            cloudSync: true,         // クラウド同期あり
            hasAI: false,
        },
        premium: {                   // 将来提供予定
            totalTrades: Infinity,
            cloudSync: true,
            hasAI: true,             // AI改善提案（v2.0〜）
        },
    };

    // ================
    // Constructor
    // ================
    constructor() {
        console.log('PaymentModule: インスタンス作成');
    }

    // ================
    // Public API
    // ================

    /**
     * 初期化
     * @returns {boolean} 成功/失敗
     */
    async initialize() {
        try {
            // Supabase接続確認（遅延取得）
            if (typeof getSupabase === 'function') {
                this.#supabase = getSupabase();
            }
            this.#eventBus = window.eventBus;

            if (!this.#supabase) {
                console.warn('PaymentModule: Supabase未接続 → Freeプランで動作');
                this.#currentPlan = 'free';
                this.#initialized = true;
                this.#eventBus?.emit('payment:initialized', { plan: this.#currentPlan });
                return true;
            }

            // サブスクリプション情報を取得
            await this.#fetchSubscription();

            // PAY.JP Checkoutのグローバルコールバックを登録
            this.#setupCheckoutCallback();

            this.#initialized = true;
            console.log('PaymentModule: 初期化完了', { plan: this.#currentPlan });

            this.#eventBus?.emit('payment:initialized', { plan: this.#currentPlan });
            return true;

        } catch (error) {
            console.error('PaymentModule: 初期化エラー', error);
            this.#currentPlan = 'free';
            this.#initialized = true;
            return false;
        }
    }

    /**
     * 現在のプランを取得
     * @returns {string} 'free' | 'pro' | 'premium'
     */
    getCurrentPlan() {
        return this.#currentPlan;
    }

    /**
     * プラン制限を取得
     * @param {string|null} plan - 指定しない場合は現在のプラン
     * @returns {object} { totalTrades, cloudSync, hasAI }
     */
    getPlanLimits(plan = null) {
        return PaymentModule.PLAN_LIMITS[plan || this.#currentPlan];
    }

    /**
     * トレード追加可能かチェック（累計件数）
     * @param {number} totalTradeCount - 現在の累計トレード件数
     * @returns {boolean}
     */
    canAddTrade(totalTradeCount) {
        const limits = this.getPlanLimits();
        return totalTradeCount < limits.totalTrades;
    }

    /**
     * クラウド同期が使えるか
     * @returns {boolean}
     */
    canUseCloudSync() {
        return this.getPlanLimits().cloudSync;
    }

    /**
     * AI機能が使えるか
     * @returns {boolean}
     */
    canUseAI() {
        return this.getPlanLimits().hasAI;
    }

    /**
     * 残り記録可能件数
     * @param {number} totalTradeCount - 現在の累計トレード件数
     * @returns {number} Infinity or 残り件数
     */
    getRemainingTrades(totalTradeCount) {
        const limits = this.getPlanLimits();
        if (limits.totalTrades === Infinity) return Infinity;
        return Math.max(0, limits.totalTrades - totalTradeCount);
    }

    /**
     * チェックアウトを開始（provider別に分岐）
     * @param {string} planId - プランID（例: 'pro_monthly'）
     * @param {string} provider - 決済プロバイダ ('paypal' / 'square' / 'payjp')
     */
    async startCheckout(planId, provider = 'paypal') {
        if (!this.#supabase) {
            window.showToast?.('ログインが必要です', 'error');
            return;
        }

        const { data: { session } } = await this.#supabase.auth.getSession();
        if (!session) {
            window.showToast?.('ログインが必要です', 'error');
            return;
        }

        if (provider === 'paypal') {
            await this.#startPayPalCheckout(planId);
        } else if (provider === 'square') {
            await this.#startSquareCheckout(planId);
        } else {
            await this.#startPayjpCheckout(planId);
        }
    }

    /**
     * PAY.JP Checkoutポップアップを起動（既存フロー）
     * @param {string} planId - PAY.JP プランID（例: 'pro_monthly'）
     */
    async #startPayjpCheckout(planId) {
        try {
            if (!PaymentModule.PLAN_IDS[planId]) {
                throw new Error('不明なプランIDです: ' + planId);
            }

            // 決済完了後に使うプランIDを保存
            this.#pendingPlanId = planId;

            // アップグレードモーダルを閉じる（PAY.JPポップアップと重ならないように）
            const upgradeModal = document.getElementById('upgradeModal');
            if (upgradeModal) upgradeModal.style.display = 'none';

            // PAY.JP Checkoutボタンが生成されるまで最大5秒待つ
            const payjpBtn = await this.#waitForPayjpButton(5000);
            if (!payjpBtn) {
                throw new Error('PAY.JP Checkoutボタンの生成がタイムアウトしました。ページを再読み込みしてお試しください。');
            }

            console.log('PaymentModule: PAY.JP Checkoutボタンをクリック', payjpBtn);
            payjpBtn.click();

            // PAY.JP iframeが前面に来るようz-indexを強制設定
            setTimeout(() => {
                const iframe = document.getElementById('payjp-checkout-iframe');
                if (iframe) {
                    iframe.style.zIndex = '999999';
                    iframe.style.position = 'fixed';
                }
            }, 300);

        } catch (error) {
            console.error('PaymentModule: startPayjpCheckout error', error);
            window.showToast?.('決済処理でエラーが発生しました', 'error');
            this.#pendingPlanId = null;
        }
    }

    /**
     * サブスクリプションを解約する
     * （期間終了時に自動解約。即時解約ではない）
     * provider別にEdge Functionを分岐
     * [v3.1.1] 解約処理中ローディングオーバーレイ表示を追加（改善項目#3）
     */
    async cancelSubscription() {
        let loadingOverlay = null;  // [v3.1.1] finally で確実に削除するため外で宣言

        try {
            if (!this.#supabase) {
                window.showToast?.('ログインが必要です', 'error');
                return;
            }

            const { data: { session } } = await this.#supabase.auth.getSession();
            if (!session) {
                window.showToast?.('ログインが必要です', 'error');
                return;
            }

            // [v3.1.1] 解約処理中ローディングオーバーレイを表示（改善項目#3）
            // Square API のレイテンシで30秒程度かかることがあるため、UX 改善
            loadingOverlay = this.#showCancelLoading();

            // providerに応じてEdge Functionを分岐
            const provider = this.#subscription?.provider || 'payjp';
            let functionName;
            if (provider === 'paypal') {
                functionName = 'paypal-cancel-subscription';
            } else if (provider === 'square') {
                functionName = 'square-cancel-subscription';
            } else {
                functionName = 'cancel-subscription';
            }

            console.log('PaymentModule: 解約開始', { provider, functionName });

            const response = await fetch(
                `${this.#supabase.supabaseUrl}/functions/v1/${functionName}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                }
            );

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            window.showToast?.('解約手続きが完了しました。ご利用期間終了までProプランをお使いいただけます。', 'success');

        } catch (error) {
            console.error('PaymentModule: cancelSubscription error', error);
            window.showToast?.('解約処理でエラーが発生しました', 'error');
        } finally {
            // [v3.1.1] 成功・失敗どちらの場合もローディングを必ず削除
            if (loadingOverlay && loadingOverlay.parentNode) {
                loadingOverlay.parentNode.removeChild(loadingOverlay);
            }
        }
    }

    /**
     * 解約処理中のローディングオーバーレイを画面に表示
     * [v3.1.1] 改善項目#3 で新規追加
     * @returns {HTMLElement} 作成されたオーバーレイ要素（cleanup用に呼び出し元で保持）
     */
    #showCancelLoading() {
        // スピナーアニメーション用 CSS を <head> に挿入（既存があれば再利用）
        if (!document.getElementById('tcCancelSpinKeyframes')) {
            const style = document.createElement('style');
            style.id = 'tcCancelSpinKeyframes';
            style.textContent = '@keyframes tcCancelSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }

        // ローディングオーバーレイ作成
        const overlay = document.createElement('div');
        overlay.id = 'tc-cancel-loading-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:100001; display:flex; align-items:center; justify-content:center;';
        overlay.innerHTML = `
            <div style="background:#fff; padding:32px 48px; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.3); text-align:center; min-width:280px; max-width:90%;">
                <div style="width:48px; height:48px; border:4px solid #f3f3f3; border-top:4px solid #00ff88; border-radius:50%; margin:0 auto 16px; animation:tcCancelSpin 1s linear infinite;"></div>
                <p style="margin:0 0 8px; font-size:16px; font-weight:bold; color:#222;">解約処理中</p>
                <p style="margin:0; font-size:13px; color:#666; line-height:1.6;">最大30秒程度かかります<br>そのままお待ちください</p>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    /**
     * サブスクリプション情報を再取得
     * @returns {object} { plan, subscription }
     */
    async refreshSubscription() {
        const oldPlan = this.#currentPlan;
        await this.#fetchSubscription();

        if (oldPlan !== this.#currentPlan) {
            this.#eventBus?.emit('payment:planChanged', {
                oldPlan: oldPlan,
                newPlan: this.#currentPlan,
            });
        }

        return { plan: this.#currentPlan, subscription: this.#subscription };
    }

    /**
     * デバッグ用ステータス
     * @returns {object}
     */
    getStatus() {
        return {
            initialized: this.#initialized,
            currentPlan: this.#currentPlan,
            subscription: this.#subscription,
            limits: this.getPlanLimits(),
        };
    }

    // ================
    // Private Methods
    // ================

    /**
     * PayPal JS SDKでサブスクリプション作成フローを開始
     * @param {string} planId - 内部プランID（例: 'pro_monthly'）
     */
    async #startPayPalCheckout(planId) {
        try {
            const paypalPlanId = PaymentModule.PAYPAL_PLAN_IDS[planId];
            if (!paypalPlanId) {
                throw new Error('不明なプランIDです: ' + planId);
            }

            // PayPal JS SDKの読み込み確認
            if (typeof paypal === 'undefined') {
                throw new Error('PayPal JS SDKが読み込まれていません。ページを再読み込みしてお試しください。');
            }

            // アップグレードモーダルを閉じる
            const upgradeModal = document.getElementById('upgradeModal');
            if (upgradeModal) upgradeModal.style.display = 'none';

            // PayPalボタン用コンテナを作成（既存があれば再利用）
            let container = document.getElementById('paypal-button-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'paypal-button-container';
                document.body.appendChild(container);
            }

            // コンテナのスタイル設定（モーダル風に中央表示）
            container.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:100000; background:#fff; padding:32px; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.3); min-width:320px; max-width:420px;';
            container.innerHTML = '<p style="text-align:center; margin:0 0 16px; font-size:16px; font-weight:bold;">PayPalで決済</p><div id="paypal-buttons"></div><button id="paypal-cancel-btn" style="display:block; margin:16px auto 0; padding:8px 24px; border:1px solid #ccc; border-radius:6px; background:#f5f5f5; cursor:pointer;">キャンセル</button>';

            // オーバーレイ作成
            let overlay = document.getElementById('paypal-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'paypal-overlay';
                document.body.appendChild(overlay);
            }
            overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:99999;';

            // キャンセルボタン・オーバーレイのクリックで閉じる
            const cleanup = () => {
                container.style.display = 'none';
                overlay.style.display = 'none';
            };
            document.getElementById('paypal-cancel-btn').addEventListener('click', cleanup);
            overlay.addEventListener('click', cleanup);

            // PayPalボタンを描画
            paypal.Buttons({
                style: {
                    shape: 'rect',
                    color: 'gold',
                    layout: 'vertical',
                    label: 'subscribe',
                },
                createSubscription: (data, actions) => {
                    return actions.subscription.create({
                        plan_id: paypalPlanId,
                    });
                },
                onApprove: async (data) => {
                    cleanup();
                    console.log('PaymentModule: PayPal承認完了', data.subscriptionID);
                    await this.#handlePayPalApproval(data.subscriptionID, planId);
                },
                onError: (err) => {
                    cleanup();
                    console.error('PaymentModule: PayPalボタンエラー', err);
                    window.showToast?.('PayPal決済でエラーが発生しました', 'error');
                },
            }).render('#paypal-buttons');

        } catch (error) {
            console.error('PaymentModule: startPayPalCheckout error', error);
            window.showToast?.(error.message || '決済処理でエラーが発生しました', 'error');
        }
    }

    /**
     * PayPal承認後にEdge Functionでサブスクリプションを検証・保存
     * @param {string} subscriptionId - PayPalサブスクリプションID（例: 'I-XXXX'）
     * @param {string} planId - 内部プランID（例: 'pro_monthly'）
     */
    async #handlePayPalApproval(subscriptionId, planId) {
        try {
            window.showToast?.('決済処理中...', 'info');

            const { data: { session } } = await this.#supabase.auth.getSession();
            if (!session) {
                window.showToast?.('ログインが必要です', 'error');
                return;
            }

            const response = await fetch(
                `${this.#supabase.supabaseUrl}/functions/v1/paypal-activate-subscription`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        subscriptionId: subscriptionId,
                        planId: planId,
                    }),
                }
            );

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // 決済成功 → プラン情報を再取得してUIに反映
            await this.refreshSubscription();
            window.showToast?.('Proプランへのアップグレードが完了しました!', 'success');

        } catch (error) {
            console.error('PaymentModule: handlePayPalApproval error', error);
            window.showToast?.('決済処理でエラーが発生しました', 'error');
        }
    }

    // ================================================================
    // Square Web Payments SDK 関連メソッド [v3.1.0]
    // ================================================================

    /**
     * Square Web Payments SDKでカード入力モーダルを起動 [v3.1.0]
     * card.attach() でカードフォームを描画し、card.tokenize() でnonce取得
     * 生のカード番号はSquareサーバーに直接送信され、SaaS側には届かない（PCI-DSS対応）
     * @param {string} planId - 内部プランID（例: 'pro_monthly'）
     */
    async #startSquareCheckout(planId) {
        try {
            // バリデーション: planId
            if (!PaymentModule.SQUARE_PLAN_VARIATION_IDS[planId]) {
                throw new Error('不明なプランIDです: ' + planId);
            }

            // バリデーション: Square SDK読込確認
            if (typeof window.Square === 'undefined') {
                throw new Error('Square SDKが読み込まれていません。ページを再読み込みしてお試しください。');
            }

            // バリデーション: Application ID / Location ID 設定確認
            if (PaymentModule.SQUARE_APPLICATION_ID.startsWith('【') ||
                PaymentModule.SQUARE_LOCATION_ID.startsWith('【')) {
                throw new Error('Square Credentialsが未設定です。PaymentModule.jsの SQUARE_APPLICATION_ID / SQUARE_LOCATION_ID を確認してください。');
            }

            // アップグレードモーダルを閉じる
            const upgradeModal = document.getElementById('upgradeModal');
            if (upgradeModal) upgradeModal.style.display = 'none';

            // Squareカード入力モーダル作成（既存があれば再利用）
            let container = document.getElementById('square-checkout-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'square-checkout-container';
                document.body.appendChild(container);
            }
            container.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:100000; background:#fff; padding:32px; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.3); width:90%; max-width:440px; box-sizing:border-box;';
            container.style.display = 'block';

            // プラン名表示用ラベル
            const planLabel = planId === 'pro_monthly' ? 'Pro 月額 ¥1,980/月' : 'Pro 年額 ¥19,800/年';

            container.innerHTML = `
                <p style="text-align:center; margin:0 0 8px; font-size:18px; font-weight:bold; color:#222;">カード情報を入力</p>
                <p style="text-align:center; margin:0 0 20px; font-size:14px; color:#666;">${planLabel}</p>
                <div id="square-card-container" style="margin-bottom:16px;"></div>
                <div id="square-error-message" style="color:#e53935; font-size:13px; margin-bottom:12px; min-height:18px; text-align:center;"></div>
                <button id="square-submit-btn" style="display:block; width:100%; padding:12px; background:#0070f3; color:#fff; border:none; border-radius:8px; font-size:16px; font-weight:bold; cursor:pointer;">決済する</button>
                <button id="square-cancel-btn" style="display:block; width:100%; padding:10px; margin-top:12px; background:#f5f5f5; color:#666; border:1px solid #ccc; border-radius:8px; font-size:14px; cursor:pointer;">キャンセル</button>
            `;

            // オーバーレイ作成
            let overlay = document.getElementById('square-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'square-overlay';
                document.body.appendChild(overlay);
            }
            overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:99999;';
            overlay.style.display = 'block';

            // Square Payments初期化（Web Payments SDK）
            const payments = window.Square.payments(
                PaymentModule.SQUARE_APPLICATION_ID,
                PaymentModule.SQUARE_LOCATION_ID
            );
            const card = await payments.card();
            await card.attach('#square-card-container');

            // Cleanup関数（Card destroy + モーダル非表示）
            const cleanup = async () => {
                try {
                    await card.destroy();
                } catch (e) {
                    console.warn('PaymentModule: Square card destroy failed', e);
                }
                container.style.display = 'none';
                overlay.style.display = 'none';
            };

            // キャンセル/オーバーレイで閉じる
            document.getElementById('square-cancel-btn').addEventListener('click', cleanup);
            overlay.addEventListener('click', cleanup);

            // 決済ボタン
            const submitBtn = document.getElementById('square-submit-btn');
            const errorEl = document.getElementById('square-error-message');
            submitBtn.addEventListener('click', async () => {
                submitBtn.disabled = true;
                submitBtn.textContent = '処理中...';
                errorEl.textContent = '';

                try {
                    // カード情報をトークン化（生カード番号はSquareサーバーに直接送信される）
                    const result = await card.tokenize();
                    if (result.status === 'OK') {
                        await cleanup();
                        await this.#handleSquareNonce(result.token, planId);
                    } else {
                        let msg = 'カード情報を確認してください';
                        if (result.errors && result.errors.length > 0) {
                            msg = result.errors[0].message || msg;
                        }
                        errorEl.textContent = msg;
                        submitBtn.disabled = false;
                        submitBtn.textContent = '決済する';
                    }
                } catch (err) {
                    console.error('PaymentModule: Square tokenize error', err);
                    errorEl.textContent = 'カード情報の検証に失敗しました';
                    submitBtn.disabled = false;
                    submitBtn.textContent = '決済する';
                }
            });

        } catch (error) {
            console.error('PaymentModule: startSquareCheckout error', error);
            window.showToast?.(error.message || '決済処理でエラーが発生しました', 'error');
        }
    }

    /**
     * Square nonce受領後にEdge Functionで3段階処理を実行 [v3.1.0]
     * Edge Function内部:
     *   Step1. Customer作成 → Step2. Card保存 → Step3. Subscription作成 → Step4. DB保存
     *   失敗時は逆順にロールバックされる
     * @param {string} nonce - Square Web Payments SDKで生成されたnonce（card.tokenize()のtoken）
     * @param {string} planId - 内部プランID（例: 'pro_monthly'）
     */
    async #handleSquareNonce(nonce, planId) {
        try {
            window.showToast?.('決済処理中...', 'info');

            // セッション取得
            const { data: { session } } = await this.#supabase.auth.getSession();
            if (!session) {
                window.showToast?.('ログインが必要です', 'error');
                return;
            }

            // ユーザー情報取得（email・名前をEdge Functionに渡す）
            const { data: { user } } = await this.#supabase.auth.getUser();
            if (!user) {
                window.showToast?.('ログインが必要です', 'error');
                return;
            }

            // 内部planId → Edge Function用planType に変換
            // 'pro_monthly' → 'monthly', 'pro_yearly' → 'yearly'
            let planType = null;
            if (planId === 'pro_monthly') planType = 'monthly';
            else if (planId === 'pro_yearly') planType = 'yearly';
            if (!planType) throw new Error('不明なプランIDです: ' + planId);

            // Edge Function呼出（square-create-subscription）
            const response = await fetch(
                `${this.#supabase.supabaseUrl}/functions/v1/square-create-subscription`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        nonce: nonce,
                        planType: planType,
                        userEmail: user.email,
                        userName: user.user_metadata?.name || user.user_metadata?.full_name || '',
                    }),
                }
            );

            const data = await response.json();

            // Edge Function失敗時: { success: false, error: '...' }
            // Edge Function成功時: { success: true, subscription_id, plan, plan_type }
            if (data.error || !data.success) {
                throw new Error(data.error || '決済処理に失敗しました');
            }

            // 決済成功 → プラン情報を再取得してUIに反映
            await this.refreshSubscription();
            window.showToast?.('Proプランへのアップグレードが完了しました!', 'success');

        } catch (error) {
            console.error('PaymentModule: handleSquareNonce error', error);
            window.showToast?.(error.message || '決済処理でエラーが発生しました', 'error');
        }
    }

    /**
     * PAY.JP Checkoutボタンが生成されるまで待つ
     * @param {number} timeoutMs - タイムアウトミリ秒
     * @returns {Promise<Element|null>}
     */
    #waitForPayjpButton(timeoutMs) {
        return new Promise((resolve) => {
            const selector = '#payjp_checkout_box button, #payjp_checkout_box input[type="button"]';

            // すでに存在する場合は即返す
            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }

            // MutationObserverで生成を監視
            const observer = new MutationObserver(() => {
                const btn = document.querySelector(selector);
                if (btn) {
                    observer.disconnect();
                    clearTimeout(timer);
                    resolve(btn);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            // タイムアウト
            const timer = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeoutMs);
        });
    }

    /**
     * PAY.JP Checkoutのグローバルコールバックを登録
     * PAY.JPはpostMessageでトークンを送信するため、messageイベントで受け取る
     */
    #setupCheckoutCallback() {
        window.addEventListener('message', async (e) => {
            if (e.origin !== 'https://checkout.pay.jp') return;

            let data;
            try {
                data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            } catch {
                return;
            }

            if (data.action !== 'applyResponse') return;
            if (!data.response || !data.response.id) return;

            console.log('PaymentModule: postMessageからトークン取得', data.response.id);
            await this.#handlePayjpToken({ id: data.response.id });
        });
    }

    /**
     * PAY.JP Checkoutポップアップからトークンを受け取り、決済を実行
     * @param {{ id: string }} token - PAY.JPトークンオブジェクト
     */
    async #handlePayjpToken(token) {
        const planId = this.#pendingPlanId;
        this.#pendingPlanId = null;

        if (!planId) {
            console.error('PaymentModule: pendingPlanIdが未設定です');
            return;
        }

        try {
            window.showToast?.('決済処理中...', 'info');

            const { data: { session } } = await this.#supabase.auth.getSession();
            if (!session) {
                window.showToast?.('ログインが必要です', 'error');
                return;
            }

            // トークンID + プランID を Edge Function に送信
            const response = await fetch(
                `${this.#supabase.supabaseUrl}/functions/v1/create-checkout-session`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ token: token.id, planId }),
                }
            );

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // 決済成功 → プラン情報を再取得してUIに反映
            await this.refreshSubscription();
            window.showToast?.('Proプランへのアップグレードが完了しました！', 'success');

        } catch (error) {
            console.error('PaymentModule: handlePayjpToken error', error);
            window.showToast?.('決済処理でエラーが発生しました', 'error');
        }
    }

    /**
     * subscriptionsテーブルからサブスクリプション情報を取得
     */
    async #fetchSubscription() {
        try {
            const { data: { user } } = await this.#supabase.auth.getUser();
            if (!user) {
                this.#currentPlan = 'free';
                this.#subscription = null;
                return;
            }

            const { data, error } = await this.#supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();  // [v3.1.1] .single() から変更: 0件時に 406 エラーを返さない

            if (error || !data) {
                this.#currentPlan = 'free';
                this.#subscription = null;
                return;
            }

            this.#subscription = data;

            // ステータスが有効な場合のみプランを反映
            if (data.status === 'active' || data.status === 'trialing') {
                this.#currentPlan = data.plan;
            } else {
                this.#currentPlan = 'free';
            }

        } catch (error) {
            console.error('PaymentModule: fetchSubscription error', error);
            this.#currentPlan = 'free';
            this.#subscription = null;
        }
    }
}

// ================
// グローバル登録
// ================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.PaymentModule = new PaymentModule();
    });
} else {
    window.PaymentModule = new PaymentModule();
}
