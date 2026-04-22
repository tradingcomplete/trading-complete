/**
 * @module PaymentModule
 * @description 決済・サブスクリプション管理モジュール（PAY.JP + PayPal 多層決済対応）
 * @version 3.0.0
 * @date 2026-04-15
 * @important MODULES.md準拠
 *
 * 【責務】
 * - 現在のプラン状態管理
 * - プラン制限チェック（トレード件数、クラウド同期、AI機能）
 * - PAY.JP Checkout公式ポップアップ起動（index.htmlのscriptタグ必須）
 * - PayPal JS SDKによるサブスクリプション作成（index.htmlのscriptタグ必須）
 * - Edge Function (create-checkout-session) 呼び出し（PAY.JP用）
 * - Edge Function (paypal-activate-subscription) 呼び出し（PayPal用）
 * - サブスクリプション解約（provider別にEdge Function分岐）
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
     * @param {string} provider - 決済プロバイダ ('paypal' or 'payjp')
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
     */
    async cancelSubscription() {
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

            // providerに応じてEdge Functionを分岐
            const provider = this.#subscription?.provider || 'payjp';
            const functionName = provider === 'paypal'
                ? 'paypal-cancel-subscription'
                : 'cancel-subscription';

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
        }
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
                .single();

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
