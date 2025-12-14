/**
 * @module SummaryCalculatorModule
 * @description サマリー計算機能を提供するモジュール
 * 年次・月次・四半期・期間別のトレード集計と経費を含めた損益計算を行う
 * @author AI Assistant / コンパナ
 * @version 1.0.0
 * @important UIの変更は原則禁止。見た目は既存のまま維持すること。
 */
class SummaryCalculatorModule {
    // ================
    // Private Fields
    // ================
    #trades = [];
    #expenses = [];
    #eventBus = null;
    #tradeManager = null;
    #expenseManager = null;
    #initialized = false;

    constructor() {
        // 依存の注入
        this.#eventBus = window.eventBus;
        this.#tradeManager = window.TradeManager?.getInstance();
        this.#expenseManager = window.ExpenseManagerModule;
        
        // 初期化
        this.#initialize();
    }

    // ================
    // Public API(外部公開)
    // ================

    /**
     * 年次サマリーを計算
     * @param {number} year - 対象年
     * @returns {Object} 年次サマリーデータ
     */
    calculateYearlySummary(year) {
        // ExpenseManagerModuleから最新の経費データを強制取得
        if (window.ExpenseManagerModule) {
            window.ExpenseManagerModule.loadExpenses();
        }
        
        // 最新データを再読み込み
        this.#loadData();
        
        const summary = {
            year: year,
            trades: {
                count: 0,
                winCount: 0,
                lossCount: 0,
                totalProfit: 0,
                totalLoss: 0,
                netProfit: 0,
                winRate: 0,
                averageWin: 0,
                averageLoss: 0,
                profitFactor: 0
            },
            expenses: {
                total: 0,
                byCategory: {},
                byMonth: {}
            },
            netIncome: 0,
            taxableIncome: 0
        };

        // トレード集計(フォールバック付き日付取得)
        const yearTrades = this.#trades.filter(trade => {
            // 決済済みチェック追加（未決済トレードを除外）
            if (!trade.exits || trade.exits.length === 0) {
                return false;
            }
            
            const dateStr = trade.date || trade.entryTime || trade.timestamp;
            if (!dateStr) return false;
            const tradeDate = new Date(dateStr);
            return tradeDate.getFullYear() === year;
        });

        yearTrades.forEach(trade => {
            const profit = trade.yenProfitLoss ? 
                parseFloat(trade.yenProfitLoss.netProfit || 0) : 0;
            summary.trades.count++;
            
            if (profit > 0) {
                summary.trades.winCount++;
                summary.trades.totalProfit += profit;
            } else if (profit < 0) {
                summary.trades.lossCount++;
                summary.trades.totalLoss += Math.abs(profit);
            }
        });

        // トレード統計の計算
        summary.trades.netProfit = summary.trades.totalProfit - summary.trades.totalLoss;
        summary.trades.winRate = summary.trades.count > 0 
            ? ((summary.trades.winCount / summary.trades.count) * 100).toFixed(1)
            : '0.0';
        summary.trades.averageWin = summary.trades.winCount > 0 
            ? (summary.trades.totalProfit / summary.trades.winCount).toFixed(0)
            : '0';
        summary.trades.averageLoss = summary.trades.lossCount > 0 
            ? (summary.trades.totalLoss / summary.trades.lossCount).toFixed(0)
            : '0';
        summary.trades.profitFactor = summary.trades.totalLoss > 0 
            ? (summary.trades.totalProfit / summary.trades.totalLoss).toFixed(2)
            : '0.00';

        // 経費集計(フォールバック付き日付取得)
        const yearExpenses = this.#expenses.filter(expense => {
            const dateStr = expense.date || expense.entryTime || expense.timestamp;
            if (!dateStr) return false;
            const expenseDate = new Date(dateStr);
            return expenseDate.getFullYear() === year;
        });

        yearExpenses.forEach(expense => {
            const amount = parseFloat(expense.amount || 0);
            summary.expenses.total += amount;
            
            // カテゴリ別集計
            if (!summary.expenses.byCategory[expense.category]) {
                summary.expenses.byCategory[expense.category] = 0;
            }
            summary.expenses.byCategory[expense.category] += amount;
            
            // 月別集計
            const dateStr = expense.date || expense.entryTime || expense.timestamp;
            const month = new Date(dateStr).getMonth() + 1;
            if (!summary.expenses.byMonth[month]) {
                summary.expenses.byMonth[month] = 0;
            }
            summary.expenses.byMonth[month] += amount;
        });

        // 収支計算
        summary.netIncome = summary.trades.netProfit - summary.expenses.total;
        summary.taxableIncome = Math.max(0, summary.netIncome);

        // EventBus発火(return の直前)
        this.#eventBus?.emit('summary:calculated', {
            type: 'yearly',
            year: year,
            result: summary
        });

        return summary;
    }

    /**
     * 月次サマリーを計算
     * @param {number} year - 対象年
     * @param {number} month - 対象月(1-12)
     * @returns {Object} 月次サマリーデータ
     */
    calculateMonthlySummary(year, month) {
        const summary = {
            year: year,
            month: month,
            trades: {
                count: 0,
                winCount: 0,
                lossCount: 0,
                totalProfit: 0,
                totalLoss: 0,
                netProfit: 0,
                winRate: 0,
                averageWin: 0,
                averageLoss: 0,
                profitFactor: 0
            },
            expenses: {
                total: 0,
                byCategory: {}
            },
            netIncome: 0
        };

        // トレード集計(フォールバック付き日付取得)
        const monthTrades = this.#trades.filter(trade => {
            // 決済済みチェック追加（未決済トレードを除外）
            if (!trade.exits || trade.exits.length === 0) {
                return false;
            }
            
            const dateStr = trade.date || trade.entryTime || trade.timestamp;
            if (!dateStr) return false;
            const tradeDate = new Date(dateStr);
            return tradeDate.getFullYear() === year && 
                   tradeDate.getMonth() + 1 === month;
        });

        monthTrades.forEach(trade => {
            const profit = trade.yenProfitLoss ? 
                parseFloat(trade.yenProfitLoss.netProfit || 0) : 0;
            summary.trades.count++;
            
            if (profit > 0) {
                summary.trades.winCount++;
                summary.trades.totalProfit += profit;
            } else if (profit < 0) {
                summary.trades.lossCount++;
                summary.trades.totalLoss += Math.abs(profit);
            }
        });

        // トレード統計の計算
        summary.trades.netProfit = summary.trades.totalProfit - summary.trades.totalLoss;
        summary.trades.winRate = summary.trades.count > 0 
            ? ((summary.trades.winCount / summary.trades.count) * 100).toFixed(1)
            : '0.0';
        summary.trades.averageWin = summary.trades.winCount > 0 
            ? (summary.trades.totalProfit / summary.trades.winCount).toFixed(0)
            : '0';
        summary.trades.averageLoss = summary.trades.lossCount > 0 
            ? (summary.trades.totalLoss / summary.trades.lossCount).toFixed(0)
            : '0';
        summary.trades.profitFactor = summary.trades.totalLoss > 0 
            ? (summary.trades.totalProfit / summary.trades.totalLoss).toFixed(2)
            : '0.00';

        // 経費集計(フォールバック付き日付取得)
        const monthExpenses = this.#expenses.filter(expense => {
            const dateStr = expense.date || expense.entryTime || expense.timestamp;
            if (!dateStr) return false;
            const expenseDate = new Date(dateStr);
            return expenseDate.getFullYear() === year && 
                   expenseDate.getMonth() + 1 === month;
        });

        monthExpenses.forEach(expense => {
            const amount = parseFloat(expense.amount || 0);
            summary.expenses.total += amount;
            
            if (!summary.expenses.byCategory[expense.category]) {
                summary.expenses.byCategory[expense.category] = 0;
            }
            summary.expenses.byCategory[expense.category] += amount;
        });

        // 月次収支
        summary.netIncome = summary.trades.netProfit - summary.expenses.total;

        // EventBus発火(return の直前)
        this.#eventBus?.emit('summary:calculated', {
            type: 'monthly',
            year: year,
            month: month,
            result: summary
        });

        return summary;
    }

    /**
     * 四半期サマリーを計算
     * @param {number} year - 対象年
     * @param {number} quarter - 四半期(1-4)
     * @returns {Object} 四半期サマリーデータ
     */
    calculateQuarterlySummary(year, quarter) {
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;

        const summary = {
            year: year,
            quarter: quarter,
            trades: {
                count: 0,
                winCount: 0,
                lossCount: 0,
                totalProfit: 0,
                totalLoss: 0,
                netProfit: 0,
                winRate: 0,
                averageWin: 0,
                averageLoss: 0,
                profitFactor: 0
            },
            expenses: {
                total: 0,
                byCategory: {},
                byMonth: {}
            },
            netIncome: 0
        };

        // トレード集計(フォールバック付き日付取得)
        const quarterTrades = this.#trades.filter(trade => {
            // 決済済みチェック追加（未決済トレードを除外）
            if (!trade.exits || trade.exits.length === 0) {
                return false;
            }
            
            const dateStr = trade.date || trade.entryTime || trade.timestamp;
            if (!dateStr) return false;
            const tradeDate = new Date(dateStr);
            const tradeMonth = tradeDate.getMonth() + 1;
            return tradeDate.getFullYear() === year && 
                   tradeMonth >= startMonth && 
                   tradeMonth <= endMonth;
        });

        quarterTrades.forEach(trade => {
            const profit = trade.yenProfitLoss ? 
                parseFloat(trade.yenProfitLoss.netProfit || 0) : 0;
            summary.trades.count++;
            
            if (profit > 0) {
                summary.trades.winCount++;
                summary.trades.totalProfit += profit;
            } else if (profit < 0) {
                summary.trades.lossCount++;
                summary.trades.totalLoss += Math.abs(profit);
            }
        });

        // トレード統計の計算
        summary.trades.netProfit = summary.trades.totalProfit - summary.trades.totalLoss;
        summary.trades.winRate = summary.trades.count > 0 
            ? ((summary.trades.winCount / summary.trades.count) * 100).toFixed(1)
            : '0.0';
        summary.trades.averageWin = summary.trades.winCount > 0 
            ? (summary.trades.totalProfit / summary.trades.winCount).toFixed(0)
            : '0';
        summary.trades.averageLoss = summary.trades.lossCount > 0 
            ? (summary.trades.totalLoss / summary.trades.lossCount).toFixed(0)
            : '0';
        summary.trades.profitFactor = summary.trades.totalLoss > 0 
            ? (summary.trades.totalProfit / summary.trades.totalLoss).toFixed(2)
            : '0.00';

        // 経費集計(フォールバック付き日付取得)
        const quarterExpenses = this.#expenses.filter(expense => {
            const dateStr = expense.date || expense.entryTime || expense.timestamp;
            if (!dateStr) return false;
            const expenseDate = new Date(dateStr);
            const expenseMonth = expenseDate.getMonth() + 1;
            return expenseDate.getFullYear() === year && 
                   expenseMonth >= startMonth && 
                   expenseMonth <= endMonth;
        });

        quarterExpenses.forEach(expense => {
            const amount = parseFloat(expense.amount || 0);
            summary.expenses.total += amount;
            
            // カテゴリ別集計
            if (!summary.expenses.byCategory[expense.category]) {
                summary.expenses.byCategory[expense.category] = 0;
            }
            summary.expenses.byCategory[expense.category] += amount;
            
            // 月別集計
            const dateStr = expense.date || expense.entryTime || expense.timestamp;
            const month = new Date(dateStr).getMonth() + 1;
            if (!summary.expenses.byMonth[month]) {
                summary.expenses.byMonth[month] = 0;
            }
            summary.expenses.byMonth[month] += amount;
        });

        // 四半期収支
        summary.netIncome = summary.trades.netProfit - summary.expenses.total;

        // EventBus発火(return の直前)
        this.#eventBus?.emit('summary:calculated', {
            type: 'quarterly',
            year: year,
            quarter: quarter,
            result: summary
        });

        return summary;
    }

    /**
     * 期間指定サマリーを計算
     * @param {string} startDate - 開始日(YYYY-MM-DD)
     * @param {string} endDate - 終了日(YYYY-MM-DD)
     * @returns {Object} 期間サマリーデータ
     */
    calculatePeriodSummary(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        const summary = {
            startDate: startDate,
            endDate: endDate,
            trades: {
                count: 0,
                winCount: 0,
                lossCount: 0,
                totalProfit: 0,
                totalLoss: 0,
                netProfit: 0,
                winRate: 0,
                averageWin: 0,
                averageLoss: 0,
                profitFactor: 0
            },
            expenses: {
                total: 0,
                byCategory: {}
            },
            netIncome: 0
        };

        // トレード集計(フォールバック付き日付取得)
        const periodTrades = this.#trades.filter(trade => {
            // 決済済みチェック追加（未決済トレードを除外）
            if (!trade.exits || trade.exits.length === 0) {
                return false;
            }
            
            const dateStr = trade.date || trade.entryTime || trade.timestamp;
            if (!dateStr) return false;
            const tradeDate = new Date(dateStr);
            return tradeDate >= start && tradeDate <= end;
        });

        periodTrades.forEach(trade => {
            const profit = trade.yenProfitLoss ? 
                parseFloat(trade.yenProfitLoss.netProfit || 0) : 0;
            summary.trades.count++;
            
            if (profit > 0) {
                summary.trades.winCount++;
                summary.trades.totalProfit += profit;
            } else if (profit < 0) {
                summary.trades.lossCount++;
                summary.trades.totalLoss += Math.abs(profit);
            }
        });

        // トレード統計の計算
        summary.trades.netProfit = summary.trades.totalProfit - summary.trades.totalLoss;
        summary.trades.winRate = summary.trades.count > 0 
            ? ((summary.trades.winCount / summary.trades.count) * 100).toFixed(1)
            : '0.0';
        summary.trades.averageWin = summary.trades.winCount > 0 
            ? (summary.trades.totalProfit / summary.trades.winCount).toFixed(0)
            : '0';
        summary.trades.averageLoss = summary.trades.lossCount > 0 
            ? (summary.trades.totalLoss / summary.trades.lossCount).toFixed(0)
            : '0';
        summary.trades.profitFactor = summary.trades.totalLoss > 0 
            ? (summary.trades.totalProfit / summary.trades.totalLoss).toFixed(2)
            : '0.00';

        // 経費集計(フォールバック付き日付取得)
        const periodExpenses = this.#expenses.filter(expense => {
            const dateStr = expense.date || expense.entryTime || expense.timestamp;
            if (!dateStr) return false;
            const expenseDate = new Date(dateStr);
            return expenseDate >= start && expenseDate <= end;
        });

        periodExpenses.forEach(expense => {
            const amount = parseFloat(expense.amount || 0);
            summary.expenses.total += amount;
            
            if (!summary.expenses.byCategory[expense.category]) {
                summary.expenses.byCategory[expense.category] = 0;
            }
            summary.expenses.byCategory[expense.category] += amount;
        });

        // 期間収支
        summary.netIncome = summary.trades.netProfit - summary.expenses.total;

        // EventBus発火(return の直前)
        this.#eventBus?.emit('summary:calculated', {
            type: 'period',
            startDate: startDate,
            endDate: endDate,
            result: summary
        });

        return summary;
    }

    /**
     * トレンド分析を計算
     * @param {number} year - 対象年
     * @returns {Object} トレンドデータ
     */
    calculateTrend(year) {
        const trend = {
            year: year,
            monthly: [],
            movingAverage3: [],
            movingAverage6: []
        };

        // 月別データ収集
        for (let month = 1; month <= 12; month++) {
            const monthlySummary = this.calculateMonthlySummary(year, month);
            trend.monthly.push({
                month: month,
                netIncome: monthlySummary.netIncome,
                trades: monthlySummary.trades.netProfit,
                expenses: monthlySummary.expenses.total
            });
        }

        // 3ヶ月移動平均
        for (let i = 2; i < 12; i++) {
            const avg = (
                trend.monthly[i-2].netIncome +
                trend.monthly[i-1].netIncome +
                trend.monthly[i].netIncome
            ) / 3;
            trend.movingAverage3.push({
                month: i + 1,
                average: avg.toFixed(0)
            });
        }

        // 6ヶ月移動平均
        for (let i = 5; i < 12; i++) {
            let sum = 0;
            for (let j = 0; j < 6; j++) {
                sum += trend.monthly[i-j].netIncome;
            }
            trend.movingAverage6.push({
                month: i + 1,
                average: (sum / 6).toFixed(0)
            });
        }

        // EventBus発火(return の直前)
        this.#eventBus?.emit('summary:calculated', {
            type: 'trend',
            year: year,
            result: trend
        });

        return trend;
    }

    // ================
    // Private Methods(内部のみ)
    // ================

    /**
     * 初期化処理
     * @private
     */
    #initialize() {
        this.#loadData();
        console.log('SummaryCalculatorModule initialized');
        this.#initialized = true;
    }

    /**
     * データ読み込み
     * @private
     */
    #loadData() {
        try {
            // トレードデータの取得(TradeManager優先)
            if (this.#tradeManager) {
                this.#trades = this.#tradeManager.getAllTrades() || [];
            } else {
                // フォールバック: LocalStorageから直接取得
                const stored = localStorage.getItem('trades');
                this.#trades = stored ? JSON.parse(stored) : [];
            }

            // 経費データの取得
            const stored = localStorage.getItem('tc_expenses');
            this.#expenses = stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('SummaryCalculatorModule.#loadData error:', error);
            this.#trades = [];
            this.#expenses = [];
        }
    }

    // ================
    // Debug Methods(開発用)
    // ================

    /**
     * モジュールの状態を取得(デバッグ用)
     * @returns {Object} モジュールの状態
     */
    getStatus() {
        return {
            initialized: this.#initialized,
            tradesCount: this.#trades.length,
            expensesCount: this.#expenses.length,
            hasEventBus: !!this.#eventBus,
            hasTradeManager: !!this.#tradeManager,
            hasExpenseManager: !!this.#expenseManager,
            version: '1.0.0'
        };
    }
}

// ================
// グローバル登録
// ================
window.SummaryCalculatorModule = new SummaryCalculatorModule();
console.log('✅ SummaryCalculatorModule initialized');
console.log('SummaryCalculatorModule loaded:', window.SummaryCalculatorModule.getStatus());