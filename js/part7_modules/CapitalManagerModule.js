/**
 * @module CapitalManagerModule
 * @description 入出金管理モジュール - 追加入金・出金を記録し、投入資金と利益率を計算
 * @author AI Assistant / コンパナ
 * @version 1.0.1
 */
class CapitalManagerModule {
    // プライベートフィールド
    #records = [];
    #eventBus = null;
    #initialized = false;
    
    constructor() {
        this.#eventBus = window.eventBus;
        this.#initialize();
    }
    
    // ================
    // Public API
    // ================
    
    /**
     * 入出金レコードを追加
     * @param {string} type - "deposit" | "withdrawal"
     * @param {string} date - YYYY-MM-DD形式
     * @param {number} amount - 正の数値（円）
     * @param {string} note - メモ（省略可）
     * @returns {Object|null} 追加されたレコード or null
     */
    addRecord(type, date, amount, note = '') {
        try {
            // バリデーション
            if (!this.#validate(type, date, amount)) {
                console.error('CapitalManagerModule: バリデーションエラー');
                return null;
            }
            
            // 出金の場合、残高チェック
            if (type === 'withdrawal') {
                const currentBalance = this.getCurrentBalance();
                if (amount > currentBalance) {
                    console.error('CapitalManagerModule: 出金額が残高を超えています');
                    return null;
                }
            }
            
            // レコード作成
            const record = {
                id: this.#generateId(),
                date: date,
                type: type,
                amount: Number(amount),
                balance: 0,  // 後で再計算
                note: note,
                createdAt: new Date().toISOString()
            };
            
            // 追加
            this.#records.push(record);
            
            // 残高再計算
            this.#recalculateBalances();
            
            // 保存
            this.#save();
            
            // イベント発火
            this.#eventBus?.emit('capital:recordAdded', {
                record: record,
                balance: this.getCurrentBalance()
            });
            
            console.log('CapitalManagerModule: レコード追加成功', record);
            
            // Supabase同期（バックグラウンド）
            this.#syncRecordToCloud(record);
            
            return record;
            
        } catch (error) {
            console.error('CapitalManagerModule.addRecord error:', error);
            return null;
        }
    }
    
    /**
     * レコードを削除
     * @param {string} id - レコードID
     * @returns {boolean} 成功/失敗
     */
    deleteRecord(id) {
        try {
            const index = this.#records.findIndex(r => r.id === id);
            if (index === -1) {
                console.error('CapitalManagerModule: レコードが見つかりません', id);
                return false;
            }
            
            this.#records.splice(index, 1);
            
            // 残高再計算
            this.#recalculateBalances();
            
            // 保存
            this.#save();
            
            // イベント発火
            this.#eventBus?.emit('capital:recordDeleted', {
                id: id,
                balance: this.getCurrentBalance()
            });
            
            console.log('CapitalManagerModule: レコード削除成功', id);
            
            // Supabase同期（バックグラウンド）
            this.#deleteRecordFromCloud(id);
            
            return true;
            
        } catch (error) {
            console.error('CapitalManagerModule.deleteRecord error:', error);
            return false;
        }
    }
    
    // ================
    // Supabase同期（プライベート）
    // ================
    
    /**
     * 入出金記録をSupabaseに同期（バックグラウンド）
     * @param {Object} record - 入出金データ
     */
    #syncRecordToCloud(record) {
        if (window.SyncModule?.isInitialized?.()) {
            window.SyncModule.saveCapitalRecord(record)
                .then(result => {
                    if (result.success) {
                        console.log('[CapitalManager] Supabase同期成功:', record.id);
                    } else {
                        console.warn('[CapitalManager] Supabase同期失敗:', result.error);
                    }
                })
                .catch(err => {
                    console.error('[CapitalManager] Supabase同期エラー:', err);
                });
        }
    }
    
    /**
     * 入出金記録をSupabaseから削除（バックグラウンド）
     * @param {string} recordId - 記録ID
     */
    #deleteRecordFromCloud(recordId) {
        if (window.SyncModule?.isInitialized?.()) {
            window.SyncModule.deleteCapitalRecord(recordId)
                .then(result => {
                    if (result.success) {
                        console.log('[CapitalManager] Supabase削除成功:', recordId);
                    } else {
                        console.warn('[CapitalManager] Supabase削除失敗:', result.error);
                    }
                })
                .catch(err => {
                    console.error('[CapitalManager] Supabase削除エラー:', err);
                });
        }
    }
    
    /**
     * 現在の投入資金を取得（残高ベース = 入金 - 出金 + 累積残高）
     * @returns {number} 残高（円）
     */
    getCurrentBalance() {
        if (this.#records.length === 0) return 0;

        // 最新レコードのbalanceを返す
        const sorted = [...this.#records].sort((a, b) =>
            new Date(a.date) - new Date(b.date)
        );
        return sorted[sorted.length - 1]?.balance || 0;
    }

    /**
     * 投入資金合計を取得（入金のみ合算・出金は除外）
     * 計算ロジック検証_要件定義書 CRITICAL #9 対応（Q3=A 確定）
     * 利益率の分母として使用される「自分が口座に入れた総額」
     * @returns {number} 入金合計（円）
     */
    getTotalDeposit() {
        if (this.#records.length === 0) return 0;
        return this.#records
            .filter(r => r.type === 'deposit')
            .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    }

    /**
     * 全レコードを取得（日付順）
     * @returns {Array} レコード配列のコピー
     */
    getAllRecords() {
        return [...this.#records].sort((a, b) =>
            new Date(a.date) - new Date(b.date)
        );
    }

    /**
     * 利益率を計算
     * 計算ロジック検証_要件定義書 CRITICAL #8 対応（FIX-9）
     * SummaryCalculator に一本化（Q3=A 入金合計を分母に使用）
     * @param {number|null} year - 対象年（null=全期間）
     * @returns {number} 利益率（%）
     */
    calculateProfitRate(year = null) {
        // SummaryCalculator が利用可能なら委譲（推奨パス・単一の真実）
        if (window.SummaryCalculatorModule && typeof window.SummaryCalculatorModule.calculateProfitRate === 'function') {
            return window.SummaryCalculatorModule.calculateProfitRate(year);
        }

        // フォールバック（SummaryCalculator 未ロード時）
        // ⚠️ 旧実装: 残高ベース → 仕様（Q3=A 入金合計）と不一致
        console.warn('[CapitalManager] SummaryCalculator 未ロード - フォールバック動作');
        const totalDeposit = this.getTotalDeposit();
        if (totalDeposit === 0) return 0;

        const trades = window.TradeManager?.getInstance()?.getAllTrades() || [];
        let netProfit = 0;
        trades.forEach(trade => {
            if (trade.exits && trade.exits.length > 0) {
                if (trade.yenProfitLoss && trade.yenProfitLoss.netProfit !== null) {
                    netProfit += parseFloat(trade.yenProfitLoss.netProfit);
                }
            }
        });

        return (netProfit / totalDeposit) * 100;
    }
    
    // ================
    // Private Methods
    // ================
    
    #initialize() {
        this.#load();
        console.log(`${this.constructor.name} initialized`);
        this.#initialized = true;
    }
    
    #load() {
        // StorageValidatorで安全に読み込み
        this.#records = StorageValidator.safeLoad(
            'depositWithdrawals',
            [],
            StorageValidator.isArray
        );
        console.log(`CapitalManagerModule: ${this.#records.length}件の入出金記録を読み込み`);
        
        // 残高を再計算（Supabase同期後はbalance:0なので必須）
        if (this.#records.length > 0) {
            this.#recalculateBalances();
            console.log(`CapitalManagerModule: 残高再計算完了 → ¥${this.getCurrentBalance().toLocaleString()}`);
        }
    }
    
    #save() {
        try {
            localStorage.setItem('depositWithdrawals', JSON.stringify(this.#records));
        } catch (error) {
            console.error('CapitalManagerModule.save error:', error);
        }
    }
    
    #validate(type, date, amount) {
        // type チェック
        if (type !== 'deposit' && type !== 'withdrawal') {
            console.error('CapitalManagerModule: 無効なtype', type);
            return false;
        }
        
        // date 形式チェック
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.error('CapitalManagerModule: 無効なdate形式', date);
            return false;
        }
        
        // amount チェック
        if (typeof amount !== 'number' || amount <= 0) {
            console.error('CapitalManagerModule: 無効なamount', amount);
            return false;
        }
        
        return true;
    }
    
    #recalculateBalances() {
        // 日付順にソート
        this.#records.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // 残高を累積計算
        let balance = 0;
        this.#records.forEach(record => {
            balance += (record.type === 'deposit' ? record.amount : -record.amount);
            record.balance = balance;
        });
    }
    
    #generateId() {
        return `dw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // ================
    // Debug Methods
    // ================
    
    getStatus() {
        return {
            recordCount: this.#records.length,
            currentBalance: this.getCurrentBalance(),
            profitRate: this.calculateProfitRate(),
            initialized: this.#initialized,
            hasEventBus: !!this.#eventBus
        };
    }
}

// 即座に初期化してグローバル登録
window.CapitalManagerModule = new CapitalManagerModule();
console.log('CapitalManagerModule registered globally');