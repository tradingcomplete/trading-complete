// ========================================
// CSVExporterModule - CSV出力機能
// ========================================
/**
 * @module CSVExporterModule
 * @description トレード記録・経費・収支サマリーをCSV形式でエクスポートする機能
 * @author AI Assistant / コンパナ
 * @version 2.0.0 (MODULES.md準拠リファクタリング版)
 * @important UIの変更は原則禁止。見た目は既存のまま維持すること。
 */
class CSVExporterModule {
    // ================
    // Private Fields（プライベートフィールド）
    // ================
    #delimiter = ',';
    #encoding = 'UTF-8';
    #eventBus = null;
    #tradeManager = null;
    #expenseManager = null;
    #initialized = false;
    
    constructor() {
        // 依存モジュール取得
        this.#eventBus = window.eventBus;
        this.#tradeManager = window.TradeManager?.getInstance();
        this.#expenseManager = window.ExpenseManagerModule;
        
        // 初期化
        this.#initialize();
    }
    
    // ================
    // Public API（外部公開メソッド）
    // ================
    
    /**
     * トレードデータをCSV形式でエクスポート
     * @param {number} year - 出力対象の年度
     * @returns {Object} エクスポート結果 {success, filename, rowCount}
     */
    exportTrades(year) {
        console.log('exportTrades開始');
        
        // TradeManager確認
        const tradeManager = this.#tradeManager || TradeManager.getInstance();
        console.log('TradeManager:', tradeManager);
        
        if (!tradeManager) {
            console.error('TradeManagerが取得できません');
            alert('TradeManagerが取得できません');
            return { success: false, error: 'TradeManager not found' };
        }
        
        // トレードデータ取得
        const trades = tradeManager.getAllTrades();
        console.log('取得したトレード数:', trades ? trades.length : 'undefined');
        
        if (!trades || !Array.isArray(trades)) {
            console.error('トレードデータが取得できません');
            alert('トレードデータが取得できません');
            return { success: false, error: 'No trades data' };
        }
        
        const headers = [
            '日付',
            '商品名',
            '売買区分',
            '数量',
            'エントリー価格',
            '決済価格',
            '決済損益（円）',
            'スワップ（円）',
            '手数料（円）',
            '純損益（円）',
            'メモ'
        ];

        const rows = [headers];

        // 年度でフィルタリング
        const yearTrades = trades.filter(trade => {
            const tradeDate = new Date(trade.date);
            return tradeDate.getFullYear() === year;
        });
        
        console.log(`${year}年のトレード数:`, yearTrades.length);

        // データ行を作成
        yearTrades.forEach(trade => {
            const row = [
                trade.date || '',
                trade.symbol || trade.pair || '',
                trade.direction || '',
                trade.quantity || trade.lots || '',
                trade.entryPrice || '',
                trade.exitPrice || '',
                trade.yenProfitLoss?.profitLoss || '0',
                trade.yenProfitLoss?.swap || '0',
                trade.yenProfitLoss?.commission || '0',
                trade.yenProfitLoss?.netProfit || '0',
                trade.memo || ''
            ];
            rows.push(row);
        });

        // 合計行を追加
        const totalProfit = yearTrades.reduce((sum, t) => sum + (parseFloat(t.yenProfitLoss?.profitLoss || 0)), 0);
        const totalSwap = yearTrades.reduce((sum, t) => sum + (parseFloat(t.yenProfitLoss?.swap || 0)), 0);
        const totalCommission = yearTrades.reduce((sum, t) => sum + (parseFloat(t.yenProfitLoss?.commission || 0)), 0);
        const totalNet = yearTrades.reduce((sum, t) => sum + (parseFloat(t.yenProfitLoss?.netProfit || 0)), 0);

        rows.push([]);  // 空行
        rows.push(['合計', '', '', '', '', '', totalProfit, totalSwap, totalCommission, totalNet, '']);

        const result = this.generateCSV(rows, `trades_${year}`);
        
        // EventBus発火
        if (result.success) {
            this.#eventBus?.emit('csv:exported', {
                type: 'trades',
                year: year,
                filename: result.filename,
                rowCount: result.rowCount
            });
        }
        
        return result;
    }

    /**
     * 経費データをCSV形式でエクスポート
     * @param {number} year - 出力対象の年度
     * @returns {Object} エクスポート結果 {success, filename, rowCount}
     */
    exportExpenses(year) {
        console.log('exportExpenses開始');
        
        // ExpenseManager確認
        const expenseManager = this.#expenseManager;
        console.log('ExpenseManager:', expenseManager);
        
        if (!expenseManager) {
            console.error('ExpenseManagerが取得できません');
            alert('ExpenseManagerが取得できません');
            return { success: false, error: 'ExpenseManager not found' };
        }
        
        // 経費データ取得
        const expenses = expenseManager.getAllExpenses();
        console.log('取得した経費数:', expenses ? expenses.length : 'undefined');
        
        if (!expenses || !Array.isArray(expenses)) {
            console.error('経費データが取得できません');
            alert('経費データが取得できません');
            return { success: false, error: 'No expenses data' };
        }
        
        const headers = [
            '日付',
            'カテゴリ',
            '金額（円）',
            '説明',
            'メモ'
        ];

        const rows = [headers];

        // 年度でフィルタリング
        const yearExpenses = expenses.filter(expense => {
            return expense.taxYear === year;
        });
        
        console.log(`${year}年の経費数:`, yearExpenses.length);

        // カテゴリごとにソート
        yearExpenses.sort((a, b) => {
            if (a.category === b.category) {
                return new Date(a.date) - new Date(b.date);
            }
            return a.category.localeCompare(b.category);
        });

        // データ行を作成
        yearExpenses.forEach(expense => {
            const row = [
                expense.date || '',
                expense.category || '',
                expense.amount || '0',
                expense.description || '',
                expense.memo || ''
            ];
            rows.push(row);
        });

        // カテゴリ別集計
        const categoryTotals = {};
        yearExpenses.forEach(expense => {
            if (!categoryTotals[expense.category]) {
                categoryTotals[expense.category] = 0;
            }
            categoryTotals[expense.category] += parseFloat(expense.amount || 0);
        });

        // 集計結果を追加
        rows.push([]);  // 空行
        rows.push(['カテゴリ別集計', '', '', '', '']);
        Object.entries(categoryTotals).forEach(([category, total]) => {
            rows.push([category, '', total, '', '']);
        });

        // 合計を追加
        const totalExpenses = yearExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
        rows.push([]);  // 空行
        rows.push(['経費合計', '', totalExpenses, '', '']);

        const result = this.generateCSV(rows, `expenses_${year}`);
        
        // EventBus発火
        if (result.success) {
            this.#eventBus?.emit('csv:exported', {
                type: 'expenses',
                year: year,
                filename: result.filename,
                rowCount: result.rowCount
            });
        }
        
        return result;
    }

    /**
     * 年間収支サマリーをCSV形式でエクスポート
     * @param {number} year - 出力対象の年度
     * @returns {Object} エクスポート結果 {success, filename, rowCount}
     */
    exportYearlySummary(year) {
        console.log('exportYearlySummary開始');
        
        // TradeManager確認
        const tradeManager = this.#tradeManager || TradeManager.getInstance();
        if (!tradeManager) {
            console.error('TradeManagerが取得できません');
            return { success: false, error: 'TradeManager not found' };
        }
        
        // ExpenseManager確認
        const expenseManager = this.#expenseManager;
        if (!expenseManager) {
            console.error('ExpenseManagerが取得できません');
            return { success: false, error: 'ExpenseManager not found' };
        }
        
        // データ取得
        const trades = tradeManager.getAllTrades();
        const expenses = expenseManager.getAllExpenses();
        
        console.log('トレード数:', trades ? trades.length : 0);
        console.log('経費数:', expenses ? expenses.length : 0);
        
        const headers = ['項目', '金額（円）'];
        const rows = [headers];

        // トレード集計
        const yearTrades = trades.filter(trade => {
            const tradeDate = new Date(trade.date);
            return tradeDate.getFullYear() === year;
        });

        const totalProfit = yearTrades.reduce((sum, t) => 
            sum + parseFloat(t.yenProfitLoss?.netProfit || 0), 0
        );

        // 経費集計
        const yearExpenses = expenses.filter(e => e.taxYear === year);
        const totalExpenses = yearExpenses.reduce((sum, e) => 
            sum + parseFloat(e.amount || 0), 0
        );

        // サマリー作成
        rows.push(['【収入】', '']);
        rows.push(['トレード損益', totalProfit]);
        rows.push([]);  // 空行
        
        rows.push(['【経費】', '']);
        
        // カテゴリ別経費
        const categoryTotals = {};
        yearExpenses.forEach(expense => {
            if (!categoryTotals[expense.category]) {
                categoryTotals[expense.category] = 0;
            }
            categoryTotals[expense.category] += parseFloat(expense.amount || 0);
        });

        Object.entries(categoryTotals).forEach(([category, total]) => {
            rows.push([category, total]);
        });
        
        rows.push(['経費合計', totalExpenses]);
        rows.push([]);  // 空行
        
        rows.push(['【収支】', '']);
        rows.push(['課税対象所得（収入−経費）', totalProfit - totalExpenses]);

        const result = this.generateCSV(rows, `summary_${year}`);
        
        // EventBus発火
        if (result.success) {
            this.#eventBus?.emit('csv:exported', {
                type: 'summary',
                year: year,
                filename: result.filename,
                rowCount: result.rowCount
            });
        }
        
        return result;
    }

    /**
     * CSV生成とダウンロード
     * @param {Array} rows - CSV行データの2次元配列
     * @param {string} filename - ファイル名（拡張子なし）
     * @returns {Object} 結果 {success: boolean, filename: string, rowCount: number}
     */
    generateCSV(rows, filename) {
        // CSVテキストを生成
        const csvContent = rows.map(row => 
            row.map(cell => {
                // セル内容をエスケープ
                const cellStr = String(cell || '');
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(this.#delimiter)
        ).join('\n');

        // BOM付きUTF-8でエンコード（Excelで文字化け防止）
        const bom = '\uFEFF';
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });

        // ダウンロード処理
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // メモリ解放
        setTimeout(() => URL.revokeObjectURL(url), 100);

        return {
            success: true,
            filename: `${filename}.csv`,
            rowCount: rows.length
        };
    }

    /**
     * 月別CSV出力
     * @param {number} year - 出力対象の年度
     * @param {number} month - 出力対象の月（1-12）
     * @returns {Object} エクスポート結果 {success, filename, rowCount}
     */
    exportMonthly(year, month) {
        console.log('exportMonthly開始');
        
        // TradeManager確認
        const tradeManager = this.#tradeManager || TradeManager.getInstance();
        if (!tradeManager) {
            console.error('TradeManagerが取得できません');
            return { success: false, error: 'TradeManager not found' };
        }
        
        // ExpenseManager確認
        const expenseManager = this.#expenseManager;
        if (!expenseManager) {
            console.error('ExpenseManagerが取得できません');
            return { success: false, error: 'ExpenseManager not found' };
        }
        
        // データ取得
        const trades = tradeManager.getAllTrades();
        const expenses = expenseManager.getAllExpenses();
        
        const monthStr = String(month).padStart(2, '0');
        const filename = `monthly_${year}_${monthStr}`;
        
        // 該当月のデータをフィルタリング
        const monthTrades = trades.filter(trade => {
            const tradeDate = new Date(trade.date);
            return tradeDate.getFullYear() === year && tradeDate.getMonth() + 1 === month;
        });

        const monthExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getFullYear() === year && expenseDate.getMonth() + 1 === month;
        });
        
        console.log(`${year}年${month}月のトレード数:`, monthTrades.length);
        console.log(`${year}年${month}月の経費数:`, monthExpenses.length);

        const headers = ['日付', 'タイプ', '詳細', '金額（円）'];
        const rows = [headers];
        
        // トレードと経費を統合して日付順にソート
        const allItems = [];
        
        monthTrades.forEach(trade => {
            allItems.push({
                date: trade.date,
                type: 'トレード',
                detail: `${trade.symbol || trade.pair} ${trade.direction}`,
                amount: parseFloat(trade.yenProfitLoss?.netProfit || 0)
            });
        });

        monthExpenses.forEach(expense => {
            allItems.push({
                date: expense.date,
                type: '経費',
                detail: `${expense.category}: ${expense.description}`,
                amount: -parseFloat(expense.amount || 0)
            });
        });

        // 日付順にソート
        allItems.sort((a, b) => new Date(a.date) - new Date(b.date));

        // データ行を作成
        allItems.forEach(item => {
            rows.push([item.date, item.type, item.detail, item.amount]);
        });

        // 月間集計
        const totalIncome = monthTrades.reduce((sum, t) => 
            sum + parseFloat(t.yenProfitLoss?.netProfit || 0), 0
        );
        const totalExpense = monthExpenses.reduce((sum, e) => 
            sum + parseFloat(e.amount || 0), 0
        );

        rows.push([]);  // 空行
        rows.push(['月間集計', '', '', '']);
        rows.push(['収入合計', '', '', totalIncome]);
        rows.push(['経費合計', '', '', totalExpense]);
        rows.push(['月間収支', '', '', totalIncome - totalExpense]);

        const result = this.generateCSV(rows, filename);
        
        // EventBus発火
        if (result.success) {
            this.#eventBus?.emit('csv:exported', {
                type: 'monthly',
                year: year,
                month: month,
                filename: result.filename,
                rowCount: result.rowCount
            });
        }
        
        return result;
    }

    // ================
    // Private Methods（内部メソッド）
    // ================
    
    /**
     * 初期化処理
     * @private
     */
    #initialize() {
        console.log('CSVExporterModule initialized');
        this.#initialized = true;
    }

    // ================
    // Debug Methods（デバッグ用）
    // ================
    
    /**
     * モジュールの状態を取得（デバッグ用）
     * @returns {Object} 状態情報
     */
    getStatus() {
        return {
            initialized: this.#initialized,
            hasEventBus: !!this.#eventBus,
            hasTradeManager: !!this.#tradeManager,
            hasExpenseManager: !!this.#expenseManager,
            delimiter: this.#delimiter,
            encoding: this.#encoding,
            version: '2.0.0'
        };
    }
}

// ================
// グローバル登録
// ================
window.CSVExporterModule = new CSVExporterModule();
console.log('✓ CSVExporterModule loaded:', window.CSVExporterModule.getStatus());