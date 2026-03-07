/**
 * @module PaymentModule
 * @description 決済・サブスクリプション管理モジュール
 * @version 1.0.0
 * @date 2026-03-08
 * @important MODULES.md準拠
 * 
 * 【責務】
 * - 現在のプラン状態管理
 * - プラン制限チェック（トレード件数、クラウド同期、AI機能）
 * - Stripe Checkout起動
 * - Customer Portal起動
 * - サブスクリプション情報の取得・更新
 * 
 * 【依存関係】
 * - supabaseClient.js（必須）getSupabase()
 * - EventBus.js（必須）
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

    // ================
    // Static: Stripe Price IDs（テスト環境）
    // 本番切替時にここを差替え
    // ================
    static PRICE_IDS = {
        pro_monthly: 'price_1T8MBRGRDglt4xkODaqhswBT',
        pro_yearly: 'price_1T8MDKGRDglt4xkO4YnLbeiV',
        premium_monthly: 'price_1T8MGTGRDglt4xkOWis6kg3p',   // 将来提供予定（UIで非表示）
        premium_yearly: 'price_1T8MHrGRDglt4xkOLqvHG7K4',    // 将来提供予定（UIで非表示）
    };

    // ================
    // Static: プラン制限定義（定数1行で変更可能）
    // ================
    static PLAN_LIMITS = {
        free: {
            totalTrades: 50,         // 累計50件まで
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
     * Stripe Checkoutを開始
     * @param {string} priceId - Stripe Price ID
     */
    async startCheckout(priceId) {
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

            const response = await fetch(
                `${this.#supabase.supabaseUrl}/functions/v1/create-checkout-session`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ priceId }),
                }
            );

            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Checkout作成に失敗しました');
            }

        } catch (error) {
            console.error('PaymentModule: Checkout error', error);
            window.showToast?.('決済処理でエラーが発生しました', 'error');
        }
    }

    /**
     * Customer Portal（プラン管理画面）を開く
     */
    async openCustomerPortal() {
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

            const response = await fetch(
                `${this.#supabase.supabaseUrl}/functions/v1/customer-portal`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                }
            );

            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error(data.error || 'Portal作成に失敗しました');
            }

        } catch (error) {
            console.error('PaymentModule: Portal error', error);
            window.showToast?.('プラン管理画面を開けませんでした', 'error');
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
