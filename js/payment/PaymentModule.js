/**
 * @module PaymentModule
 * @description 決済・サブスクリプション管理モジュール
 * @version 2.0.0
 * @date 2026-03-25
 * @important MODULES.md準拠
 *
 * 【責務】
 * - 現在のプラン状態管理
 * - プラン制限チェック（トレード件数、クラウド同期、AI機能）
 * - PAY.JP Checkout起動（トークン取得 → Edge Function呼び出し）
 * - サブスクリプション解約（cancel-subscription呼び出し）
 * - サブスクリプション情報の取得・更新
 *
 * 【依存関係】
 * - supabaseClient.js（必須）getSupabase()
 * - EventBus.js（必須）
 * - PAY.JP Checkout.js（動的ロード）
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
    // Static: プラン表示情報（Checkout表示用）
    // ================
    static PLAN_INFO = {
        pro_monthly: { name: 'Proプラン（月額）', amount: 1980 },
        pro_yearly:  { name: 'Proプラン（年額）', amount: 19800 },
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

            // PAY.JP Checkout.js を事前ロード
            await this.#loadPayjpScript();

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
     * PAY.JP Checkoutを開始
     * @param {string} planId - PAY.JP プランID（例: 'pro_monthly'）
     */
    async startCheckout(planId) {
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

            // PAY.JP Checkout.js が読み込まれているか確認
            await this.#loadPayjpScript();

            const planInfo = PaymentModule.PLAN_INFO[planId];
            if (!planInfo) {
                throw new Error('不明なプランIDです: ' + planId);
            }

            // PAY.JP Checkout モーダルを開いてトークンを取得
            const token = await this.#openPayjpCheckout(planInfo);
            if (!token) {
                // ユーザーがキャンセルした場合は何もしない
                return;
            }

            window.showToast?.('決済処理中...', 'info');

            // トークン + プランID を Edge Function に送信
            const response = await fetch(
                `${this.#supabase.supabaseUrl}/functions/v1/create-checkout-session`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ token, planId }),
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
            console.error('PaymentModule: Checkout error', error);
            window.showToast?.('決済処理でエラーが発生しました', 'error');
        }
    }

    /**
     * サブスクリプションを解約する
     * （期間終了時に自動解約。即時解約ではない）
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

            const response = await fetch(
                `${this.#supabase.supabaseUrl}/functions/v1/cancel-subscription`,
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
     * PAY.JP Checkout.js を動的ロード
     */
    async #loadPayjpScript() {
        if (window.Payjp) return;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.pay.jp/';
            script.onload = resolve;
            script.onerror = () => reject(new Error('PAY.JP スクリプトの読み込みに失敗しました'));
            document.head.appendChild(script);
        });
    }

    /**
     * PAY.JP Checkout モーダルを開いてトークンを取得
     * @param {{ name: string, amount: number }} planInfo
     * @returns {Promise<string|null>} トークンID または null（キャンセル時）
     */
    #openPayjpCheckout(planInfo) {
        return new Promise((resolve) => {
            const handler = window.Payjp.Checkout.configure({
                key: PaymentModule.PAYJP_PUBLIC_KEY,
                callback: function(response) {
                    if (response.error) {
                        console.error('PaymentModule: PAY.JP token error', response.error);
                        resolve(null);
                        return;
                    }
                    resolve(response.id);
                },
            });

            handler.open({
                name: 'Trading Complete',
                description: planInfo.name,
                amount: planInfo.amount,
                currency: 'jpy',
            });

            // モーダルが閉じられた（キャンセル）場合の検知
            window.addEventListener('payjp:close', () => resolve(null), { once: true });
        });
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
