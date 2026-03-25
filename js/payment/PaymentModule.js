/**
 * @module PaymentModule
 * @description 決済・サブスクリプション管理モジュール
 * @version 2.1.0
 * @date 2026-03-25
 * @important MODULES.md準拠
 *
 * 【責務】
 * - 現在のプラン状態管理
 * - プラン制限チェック（トレード件数、クラウド同期、AI機能）
 * - PAY.JP Elements によるカード入力モーダル表示・トークン取得
 * - Edge Function (create-checkout-session) 呼び出し
 * - サブスクリプション解約（cancel-subscription呼び出し）
 * - サブスクリプション情報の取得・更新
 *
 * 【依存関係】
 * - supabaseClient.js（必須）getSupabase()
 * - EventBus.js（必須）
 * - PAY.JP JS v2（動的ロード: https://js.pay.jp/v2/pay.js）
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
     * PAY.JP Checkoutを開始（Elements版）
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

            const planInfo = PaymentModule.PLAN_INFO[planId];
            if (!planInfo) {
                throw new Error('不明なプランIDです: ' + planId);
            }

            // PAY.JP JS v2 をロード
            await this.#loadPayjpScript();

            // カード入力モーダルを表示してトークンを取得
            const token = await this.#showCardModal(planInfo);
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
     * PAY.JP JS v2 を動的ロード
     */
    async #loadPayjpScript() {
        if (window.Payjp) return;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://js.pay.jp/v2/pay.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('PAY.JP スクリプトの読み込みに失敗しました'));
            document.head.appendChild(script);
        });
    }

    /**
     * カード入力モーダルを表示してPAY.JPトークンを取得
     * @param {{ name: string, amount: number }} planInfo
     * @returns {Promise<string|null>} トークンID または null（キャンセル時）
     */
    #showCardModal(planInfo) {
        return new Promise((resolve) => {
            // 既存モーダルがあれば削除
            const existing = document.getElementById('payjp-card-modal');
            if (existing) existing.remove();

            // PAY.JP Elements 初期化
            const payjp = window.Payjp(PaymentModule.PAYJP_PUBLIC_KEY);
            const elements = payjp.elements();
            const cardElement = elements.create('card', {
                style: {
                    base: {
                        color: '#ffffff',
                        fontSize: '16px',
                        '::placeholder': { color: '#888888' },
                    },
                },
            });

            // モーダルHTML作成
            const modal = document.createElement('div');
            modal.id = 'payjp-card-modal';
            modal.style.cssText = [
                'position:fixed',
                'inset:0',
                'z-index:99999',
                'background:rgba(0,0,0,0.7)',
                'display:flex',
                'align-items:center',
                'justify-content:center',
            ].join(';');

            const inner = document.createElement('div');
            inner.style.cssText = [
                'background:#1a1a2e',
                'border:1px solid #333',
                'border-radius:12px',
                'padding:32px',
                'width:400px',
                'max-width:90vw',
                'box-shadow:0 20px 60px rgba(0,0,0,0.5)',
            ].join(';');

            const title = document.createElement('h3');
            title.textContent = 'クレジットカード情報の入力';
            title.style.cssText = 'color:#fff;margin:0 0 8px;font-size:18px;';

            const subtitle = document.createElement('p');
            subtitle.textContent = planInfo.name + '（¥' + planInfo.amount.toLocaleString() + '）';
            subtitle.style.cssText = 'color:#aaa;margin:0 0 24px;font-size:14px;';

            const cardWrap = document.createElement('div');
            cardWrap.id = 'payjp-card-element';
            cardWrap.style.cssText = [
                'background:#0d0d1a',
                'border:1px solid #444',
                'border-radius:8px',
                'padding:14px',
                'margin-bottom:8px',
            ].join(';');

            const errEl = document.createElement('div');
            errEl.id = 'payjp-card-errors';
            errEl.style.cssText = 'color:#ff6b6b;font-size:13px;min-height:20px;margin-bottom:16px;';

            const submitBtn = document.createElement('button');
            submitBtn.id = 'payjp-submit-btn';
            submitBtn.textContent = '決済する';
            submitBtn.style.cssText = [
                'width:100%',
                'padding:14px',
                'border:none',
                'border-radius:8px',
                'background:linear-gradient(135deg,#00ff88,#00cc6a)',
                'color:#000',
                'font-size:16px',
                'font-weight:bold',
                'cursor:pointer',
            ].join(';');

            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'payjp-cancel-btn';
            cancelBtn.textContent = 'キャンセル';
            cancelBtn.style.cssText = [
                'width:100%',
                'padding:10px',
                'border:1px solid #444',
                'border-radius:8px',
                'background:transparent',
                'color:#aaa',
                'font-size:14px',
                'cursor:pointer',
                'margin-top:8px',
            ].join(';');

            inner.appendChild(title);
            inner.appendChild(subtitle);
            inner.appendChild(cardWrap);
            inner.appendChild(errEl);
            inner.appendChild(submitBtn);
            inner.appendChild(cancelBtn);
            modal.appendChild(inner);
            document.body.appendChild(modal);

            // カード入力欄をマウント
            cardElement.mount('#payjp-card-element');

            // エラー表示
            cardElement.on('change', (event) => {
                errEl.textContent = event.error ? event.error.message : '';
            });

            // キャンセルボタン
            cancelBtn.addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });

            // 背景クリックでキャンセル
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(null);
                }
            });

            // 決済ボタン
            submitBtn.addEventListener('click', async () => {
                submitBtn.disabled = true;
                submitBtn.textContent = '処理中...';
                errEl.textContent = '';

                try {
                    const result = await payjp.createToken(cardElement);

                    if (result.error) {
                        errEl.textContent = result.error.message;
                        submitBtn.disabled = false;
                        submitBtn.textContent = '決済する';
                        return;
                    }

                    modal.remove();
                    resolve(result.id);

                } catch (err) {
                    errEl.textContent = 'エラーが発生しました。もう一度お試しください。';
                    submitBtn.disabled = false;
                    submitBtn.textContent = '決済する';
                }
            });
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