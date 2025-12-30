/**
 * ClosingManagerModule - 月次・四半期・年次締め処理
 * @description MODULES.md準拠の締め処理モジュール
 * @author AI Assistant / コンパナ
 * @version 1.0.0
 */
class ClosingManagerModule {
    // ========== Private Fields ==========
    #closedPeriods = [];
    #eventBus = null;
    #tradeManager = null;
    #expenseManager = null;
    #initialized = false;
    
    constructor() {
        this.#eventBus = window.eventBus;
        this.#tradeManager = window.TradeManager?.getInstance();
        this.#expenseManager = window.ExpenseManagerModule;
        
        console.log('ClosingManagerModule: 初期化開始');
        this.#initialize();
    }
    
    // ========== Public API ==========
    
    /**
     * 月次締め処理
     * @param {number} year - 年
     * @param {number} month - 月（1-12）
     * @returns {Object} {success: boolean, message: string, data?: Object}
     */
    performMonthlyClosing(year, month) {
        try {
            const periodKey = `${year}-${String(month).padStart(2, '0')}`;
            
            // すでに締め済みかチェック
            if (this.isMonthClosed(year, month)) {
                return {
                    success: false,
                    message: `${year}年${month}月は既に締め済みです`
                };
            }
            
            // トレードデータの集計
            const trades = this.#getMonthlyTrades(year, month);
            const expenses = this.#getMonthlyExpenses(year, month);
            
            // 締め情報を作成
            const closingData = {
                type: 'monthly',
                period: periodKey,
                year: year,
                month: month,
                closedAt: new Date().toISOString(),
                summary: {
                    tradeCount: trades.length,
                    totalProfit: trades.reduce((sum, t) => sum + (t.netProfit || 0), 0),
                    totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
                    netIncome: 0
                }
            };
            
            closingData.summary.netIncome = closingData.summary.totalProfit - closingData.summary.totalExpenses;
            
            this.#closedPeriods.push(closingData);
            this.#saveClosedPeriods();
            
            // EventBus発火
            this.#eventBus?.emit('closing:monthly', {
                year: year,
                month: month,
                data: closingData
            });
            
            console.log(`ClosingManagerModule: 月次締め完了 - ${periodKey}`, closingData);
            
            return {
                success: true,
                message: `${year}年${month}月の締め処理が完了しました`,
                data: closingData
            };
            
        } catch (error) {
            console.error('ClosingManagerModule.performMonthlyClosing error:', error);
            return {
                success: false,
                message: 'エラーが発生しました'
            };
        }
    }
    
    /**
     * 四半期締め処理
     * @param {number} year - 年
     * @param {number} quarter - 四半期（1-4）
     * @returns {Object} {success: boolean, message: string, data?: Object}
     */
    performQuarterlyClosing(year, quarter) {
        try {
            const periodKey = `${year}-Q${quarter}`;
            
            // 四半期の月を計算
            const months = [
                (quarter - 1) * 3 + 1,
                (quarter - 1) * 3 + 2,
                (quarter - 1) * 3 + 3
            ];
            
            // すでに締め済みかチェック
            const alreadyClosed = this.#closedPeriods.some(
                p => p.type === 'quarterly' && p.year === year && p.quarter === quarter
            );
            
            if (alreadyClosed) {
                return {
                    success: false,
                    message: `${year}年第${quarter}四半期は既に締め済みです`
                };
            }
            
            // 全ての月が締まっているかチェック
            const allMonthsClosed = months.every(month => this.isMonthClosed(year, month));
            if (!allMonthsClosed) {
                const unclosedMonths = months.filter(month => !this.isMonthClosed(year, month));
                return {
                    success: false,
                    message: `${year}年第${quarter}四半期の全ての月が締まっていません（未締め: ${unclosedMonths.join('、')}月）`
                };
            }
            
            // 各月のデータを集計
            let totalTrades = [];
            let totalExpenses = [];
            
            months.forEach(month => {
                totalTrades = totalTrades.concat(this.#getMonthlyTrades(year, month));
                totalExpenses = totalExpenses.concat(this.#getMonthlyExpenses(year, month));
            });
            
            // 締め情報を作成
            const closingData = {
                type: 'quarterly',
                period: periodKey,
                year: year,
                quarter: quarter,
                closedAt: new Date().toISOString(),
                summary: {
                    tradeCount: totalTrades.length,
                    totalProfit: totalTrades.reduce((sum, t) => sum + (t.netProfit || 0), 0),
                    totalExpenses: totalExpenses.reduce((sum, e) => sum + e.amount, 0),
                    netIncome: 0
                }
            };
            
            closingData.summary.netIncome = closingData.summary.totalProfit - closingData.summary.totalExpenses;
            
            this.#closedPeriods.push(closingData);
            this.#saveClosedPeriods();
            
            // EventBus発火
            this.#eventBus?.emit('closing:quarterly', {
                year: year,
                quarter: quarter,
                data: closingData
            });
            
            console.log(`ClosingManagerModule: 四半期締め完了 - ${periodKey}`, closingData);
            
            return {
                success: true,
                message: `${year}年第${quarter}四半期の締め処理が完了しました`,
                data: closingData
            };
            
        } catch (error) {
            console.error('ClosingManagerModule.performQuarterlyClosing error:', error);
            return {
                success: false,
                message: 'エラーが発生しました'
            };
        }
    }
    
    /**
     * 年次締め処理
     * @param {number} year - 年
     * @returns {Object} {success: boolean, message: string, data?: Object}
     */
    performYearlyClosing(year) {
        try {
            const periodKey = `${year}`;
            
            // すでに締め済みかチェック
            const alreadyClosed = this.#closedPeriods.some(
                p => p.type === 'yearly' && p.year === year
            );
            
            if (alreadyClosed) {
                return {
                    success: false,
                    message: `${year}年は既に締め済みです`
                };
            }
            
            // 全12ヶ月が締まっているかチェック
            const allMonthsClosed = Array.from({ length: 12 }, (_, i) => i + 1)
                .every(month => this.isMonthClosed(year, month));
            
            if (!allMonthsClosed) {
                const unclosedMonths = Array.from({ length: 12 }, (_, i) => i + 1)
                    .filter(month => !this.isMonthClosed(year, month));
                return {
                    success: false,
                    message: `${year}年の全12ヶ月が締まっていません（未締め: ${unclosedMonths.length}ヶ月）`
                };
            }
            
            // 全月のデータを集計
            let totalTrades = [];
            let totalExpenses = [];
            
            for (let month = 1; month <= 12; month++) {
                totalTrades = totalTrades.concat(this.#getMonthlyTrades(year, month));
                totalExpenses = totalExpenses.concat(this.#getMonthlyExpenses(year, month));
            }
            
            // 締め情報を作成
            const closingData = {
                type: 'yearly',
                period: periodKey,
                year: year,
                closedAt: new Date().toISOString(),
                summary: {
                    tradeCount: totalTrades.length,
                    totalProfit: totalTrades.reduce((sum, t) => sum + (t.netProfit || 0), 0),
                    totalExpenses: totalExpenses.reduce((sum, e) => sum + e.amount, 0),
                    netIncome: 0
                }
            };
            
            closingData.summary.netIncome = closingData.summary.totalProfit - closingData.summary.totalExpenses;
            
            this.#closedPeriods.push(closingData);
            this.#saveClosedPeriods();
            
            // EventBus発火
            this.#eventBus?.emit('closing:yearly', {
                year: year,
                data: closingData
            });
            
            console.log(`ClosingManagerModule: 年次締め完了 - ${periodKey}`, closingData);
            
            return {
                success: true,
                message: `${year}年の年次締め処理が完了しました`,
                data: closingData
            };
            
        } catch (error) {
            console.error('ClosingManagerModule.performYearlyClosing error:', error);
            return {
                success: false,
                message: 'エラーが発生しました'
            };
        }
    }
    
    /**
     * 月次締め済み確認
     * @param {number} year - 年
     * @param {number} month - 月
     * @returns {boolean} 締め済みならtrue
     */
    isMonthClosed(year, month) {
        return this.#closedPeriods.some(
            p => p.type === 'monthly' && p.year === year && p.month === month
        );
    }
    
    /**
     * 全締め期間取得
     * @returns {Array} 締め期間配列のコピー
     */
    getClosedPeriods() {
        return [...this.#closedPeriods];
    }
    
    /**
     * デバッグ用状態取得
     * @returns {Object} モジュール状態
     */
    getStatus() {
        return {
            initialized: this.#initialized,
            closedPeriodsCount: this.#closedPeriods.length,
            hasEventBus: !!this.#eventBus,
            hasTradeManager: !!this.#tradeManager,
            hasExpenseManager: !!this.#expenseManager
        };
    }
    
    // ========== Private Methods ==========
    
    #initialize() {
        this.#loadClosedPeriods();
        this.#replaceGlobalFunctions();
        console.log('ClosingManagerModule: 初期化完了');
        this.#initialized = true;
    }
    
    #loadClosedPeriods() {
        // StorageValidatorで安全に読み込み
        this.#closedPeriods = StorageValidator.safeLoad(
            'tc_closed_periods',
            [],
            StorageValidator.isClosedPeriodsFormat
        );
        console.log(`ClosingManagerModule: ${this.#closedPeriods.length}件の締めデータを読み込み`);
    }
    
    #saveClosedPeriods() {
        try {
            localStorage.setItem('tc_closed_periods', JSON.stringify(this.#closedPeriods));
        } catch (error) {
            console.error('ClosingManagerModule.#saveClosedPeriods error:', error);
        }
    }
    
    #getMonthlyTrades(year, month) {
        if (!this.#tradeManager) {
            console.warn('TradeManager not available');
            return [];
        }
        
        const allTrades = this.#tradeManager.getAllTrades();
        return allTrades.filter(trade => {
            const tradeDate = new Date(trade.date);
            return tradeDate.getFullYear() === year && 
                   tradeDate.getMonth() + 1 === month;
        });
    }
    
    #getMonthlyExpenses(year, month) {
        if (!this.#expenseManager) {
            console.warn('ExpenseManagerModule not available');
            return [];
        }
        
        // getExpensesByYearで年間の経費配列を取得し、月でフィルタリング
        const yearExpenses = this.#expenseManager.getExpensesByYear(year) || [];
        
        return yearExpenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getMonth() + 1 === month;
        });
    }
    
    #replaceGlobalFunctions() {
        // 旧グローバル関数を新モジュールメソッドで置き換え
        if (typeof window.performMonthlyClosing === 'function') {
            window.performMonthlyClosing_original = window.performMonthlyClosing;
        }
        if (typeof window.performQuarterlyClosing === 'function') {
            window.performQuarterlyClosing_original = window.performQuarterlyClosing;
        }
        if (typeof window.performYearlyClosing === 'function') {
            window.performYearlyClosing_original = window.performYearlyClosing;
        }
        
        console.log('ClosingManagerModule: グローバル関数の置き換え準備完了');
    }
}

// グローバル登録
window.ClosingManagerModule = new ClosingManagerModule();
// デバッグ出力
console.log('ClosingManagerModule initialized');
console.log('ClosingManagerModule loaded:', window.ClosingManagerModule.getStatus());