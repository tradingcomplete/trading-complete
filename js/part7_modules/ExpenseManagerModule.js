/**
 * @module ExpenseManagerModule
 * @description 経費管理機能 - 経費の追加、削除、集計、表示を管理
 * @author AI Assistant / コンパナ
 * @version 1.0.2
 * @updated 2026-01-14 - セキュリティ適用（サニタイズ追加）
 */
class ExpenseManagerModule {
    // ================
    // プライベートフィールド（カプセル化）
    // ================
    #expenses = [];
    #categories = [
        "通信費（ネット代）",
        "VPS・クラウドサービス",
        "電気代（按分）",
        "家賃（按分）",
        "PC・モニター",
        "PC周辺機器",
        "デスク・チェア",
        "事務用品",
        "書籍・教材費",
        "セミナー参加費",
        "オンラインサロン",
        "情報配信サービス",
        "新聞・雑誌",
        "取引ツール",
        "EA・インジケーター",
        "セキュリティソフト",
        "取引手数料",
        "振込手数料",
        "税理士報酬",
        "交通費",
        "会議費",
        "その他"
    ];
    #eventBus = null;
    #initialized = false;
    #storageKey = 'tc_expenses';
    
    // ================
    // セキュリティ: サニタイズ
    // ================
    
    /**
     * テキストをサニタイズ（XSS対策）
     * @private
     * @param {*} text - 入力テキスト
     * @returns {string} サニタイズ済みテキスト
     */
    #sanitize(text) {
        if (!text) return '';
        // window.escapeHtml() を使用（script.jsで定義済み）
        return window.escapeHtml(String(text).trim());
    }
    
    constructor() {
        // 依存の注入
        this.#eventBus = window.eventBus;
        
        // 初期化
        this.#initialize();
    }
    
    // ================
    // Public API（外部公開メソッド）
    // ================
    
    /**
     * LocalStorageから経費データを読み込む
     * @returns {Array} 経費配列
     */
    loadExpenses() {
        // StorageValidatorで安全に読み込み
        this.#expenses = StorageValidator.safeLoad(
            this.#storageKey,
            [],
            StorageValidator.isArray
        );
        console.log(`ExpenseManagerModule: ${this.#expenses.length}件の経費を読み込み`);
        return this.#expenses;
    }
    
    /**
     * 経費データをLocalStorageに保存
     * @returns {boolean} 保存成功/失敗
     */
    saveExpenses() {
        try {
            localStorage.setItem(this.#storageKey, JSON.stringify(this.#expenses));
            console.log(`Saved ${this.#expenses.length} expenses to storage`);
            return true;
        } catch (error) {
            console.error('ExpenseManagerModule.saveExpenses error:', error);
            return false;
        }
    }
    
    /**
     * 計算ロジック検証_要件定義書 CRITICAL #7 対応（FIX-11）
     * 締め月チェック - 締め済み月の経費は編集不可（Q4=B 解除機能あり）
     * @private
     */
    #checkClosedGuard(expense, action, forceUnlocked) {
        if (forceUnlocked === true) return null;
        if (!window.ClosingManagerModule || typeof window.ClosingManagerModule.isExpenseInClosedMonth !== 'function') {
            return null;
        }
        if (window.ClosingManagerModule.isExpenseInClosedMonth(expense)) {
            const dateStr = expense.date || expense.entryTime || expense.timestamp;
            const expDate = new Date(dateStr);
            const year = (expense.taxYear !== undefined && expense.taxYear !== null)
                ? parseInt(expense.taxYear, 10)
                : expDate.getFullYear();
            const month = expDate.getMonth() + 1;
            const msg = `${year}年${month}月は締め済みです。\n編集するには先に締めを解除してください。`;
            console.warn(`[ExpenseManager] ${action}拒否（締め済み月）:`, expense.id, msg);
            if (typeof alert === 'function') {
                try { alert('⚠ ' + msg); } catch (e) { /* alert使用不可環境 */ }
            }
            return msg;
        }
        return null;
    }

    /**
     * 経費を追加
     * @param {Object} expense - 経費オブジェクト
     * @param {Object} [options] - { forceUnlocked: boolean }
     * @returns {boolean} 追加成功/失敗
     */
    addExpense(expense, options = {}) {
        try {
            // デバッグログ：受け取ったデータを確認
            console.log('addExpense called with:', expense);

            if (!this.#validateExpense(expense)) {
                console.error('Validation failed for expense:', expense);
                throw new Error('Invalid expense data');
            }

            // 締め月ガード（FIX-11）
            const blocked = this.#checkClosedGuard(expense, '追加', options.forceUnlocked);
            if (blocked) return false;

            // ID生成（タイムスタンプ）
            expense.id = Date.now().toString();
            expense.createdAt = new Date().toISOString();

            // 配列に追加
            this.#expenses.push(expense);

            // 保存
            this.saveExpenses();

            // イベント発火
            this.#eventBus?.emit('expense:added', expense);

            // Supabase同期（バックグラウンド）
            this.#syncExpenseToCloud(expense);

            console.log('Expense added:', expense);
            return true;
        } catch (error) {
            console.error('ExpenseManagerModule.addExpense error:', error);
            return false;
        }
    }

    /**
     * 経費を削除
     * @param {string} id - 経費ID
     * @param {Object} [options] - { forceUnlocked: boolean }
     * @returns {boolean} 削除成功/失敗
     */
    deleteExpense(id, options = {}) {
        try {
            const index = this.#expenses.findIndex(exp => exp.id === id);
            if (index === -1) {
                throw new Error(`Expense not found: ${id}`);
            }

            // 締め月ガード（FIX-11）
            const blocked = this.#checkClosedGuard(this.#expenses[index], '削除', options.forceUnlocked);
            if (blocked) return false;

            const deleted = this.#expenses.splice(index, 1)[0];

            // 保存
            this.saveExpenses();

            // イベント発火
            this.#eventBus?.emit('expense:deleted', { id, expense: deleted });

            // Supabase同期（バックグラウンド）
            this.#deleteExpenseFromCloud(id);

            console.log('Expense deleted:', id);
            return true;
        } catch (error) {
            console.error('ExpenseManagerModule.deleteExpense error:', error);
            return false;
        }
    }
    
    // ================
    // Supabase同期（プライベート）
    // ================
    
    /**
     * 経費をSupabaseに同期（バックグラウンド）
     * @param {Object} expense - 経費データ
     */
    #syncExpenseToCloud(expense) {
        if (window.SyncModule?.isInitialized?.()) {
            window.SyncModule.saveExpense(expense)
                .then(result => {
                    if (result.success) {
                        console.log('[ExpenseManager] Supabase同期成功:', expense.id);
                    } else {
                        console.warn('[ExpenseManager] Supabase同期失敗:', result.error);
                    }
                })
                .catch(err => {
                    console.error('[ExpenseManager] Supabase同期エラー:', err);
                });
        }
    }
    
    /**
     * 経費をSupabaseから削除（バックグラウンド）
     * @param {string} expenseId - 経費ID
     */
    #deleteExpenseFromCloud(expenseId) {
        if (window.SyncModule?.isInitialized?.()) {
            window.SyncModule.deleteExpense(expenseId)
                .then(result => {
                    if (result.success) {
                        console.log('[ExpenseManager] Supabase削除成功:', expenseId);
                    } else {
                        console.warn('[ExpenseManager] Supabase削除失敗:', result.error);
                    }
                })
                .catch(err => {
                    console.error('[ExpenseManager] Supabase削除エラー:', err);
                });
        }
    }
    
    /**
     * 指定年度の経費を取得
     * @param {number} year - 年度
     * @returns {Array} 経費配列
     */
    getExpensesByYear(year) {
        return this.#expenses.filter(exp => exp.taxYear === year);
    }
    
    /**
     * 指定年度のカテゴリ別集計
     * @param {number} year - 年度
     * @returns {Object} カテゴリ別集計オブジェクト
     */
    getExpensesByCategory(year) {
        const yearExpenses = this.getExpensesByYear(year);
        const result = {};
        
        this.#categories.forEach(cat => {
            result[cat] = yearExpenses
                .filter(exp => exp.category === cat)
                .reduce((sum, exp) => sum + exp.amount, 0);
        });
        
        return result;
    }
    
    /**
     * 指定年度の月別集計
     * @param {number} year - 年度
     * @returns {Object} 月別集計オブジェクト（1-12月）
     */
    getMonthlyExpenses(year) {
        const yearExpenses = this.getExpensesByYear(year);
        const result = {};
        
        for (let month = 1; month <= 12; month++) {
            result[month] = yearExpenses
                .filter(exp => {
                    const expMonth = parseInt(exp.date.split('-')[1]);
                    return expMonth === month;
                })
                .reduce((sum, exp) => sum + exp.amount, 0);
        }
        
        return result;
    }
    
    /**
     * 全経費を取得（コピーを返す）
     * @returns {Array} 経費配列のコピー
     */
    getAllExpenses() {
        return [...this.#expenses];
    }
    
    /**
     * 複合フィルタリング（年度・月・カテゴリ）
     * @param {string|number} year - 年度（'all' または数値）
     * @param {string|number} month - 月（'all' または 1-12）
     * @param {string} category - カテゴリ（'all' または具体的なカテゴリ名）
     * @returns {Array} フィルタリングされた経費配列
     */
    getExpensesByFilter(year, month, category) {
        try {
            let filtered = [...this.#expenses];
            
            // 年度フィルター（支払日基準）
            if (year && year !== 'all') {
                const targetYear = parseInt(year);
                filtered = filtered.filter(exp => {
                    const expYear = parseInt(exp.date.split('-')[0]);
                    return expYear === targetYear;
                });
            }
            
            // 月フィルター
            if (month && month !== 'all') {
                const targetMonth = parseInt(month);
                filtered = filtered.filter(exp => {
                    const expMonth = parseInt(exp.date.split('-')[1]);
                    return expMonth === targetMonth;
                });
            }
            
            // カテゴリフィルター
            if (category && category !== 'all') {
                filtered = filtered.filter(exp => exp.category === category);
            }
            
            console.log(`Filtered: year=${year}, month=${month}, category=${category}, results=${filtered.length}`);
            return filtered;
        } catch (error) {
            console.error('ExpenseManagerModule.getExpensesByFilter error:', error);
            return [];
        }
    }
    
    /**
     * 経費配列をソート
     * @param {Array} expenses - 経費配列
     * @param {string} sortBy - ソート基準（'date', 'amount', 'category'）
     * @param {string} order - ソート順（'asc' または 'desc'）
     * @returns {Array} ソートされた経費配列
     */
    sortExpenses(expenses, sortBy = 'date', order = 'desc') {
        try {
            if (!Array.isArray(expenses) || expenses.length === 0) {
                return expenses;
            }
            
            const sorted = [...expenses];
            
            switch (sortBy) {
                case 'date':
                    sorted.sort((a, b) => {
                        const dateA = new Date(a.date);
                        const dateB = new Date(b.date);
                        return order === 'asc' ? dateA - dateB : dateB - dateA;
                    });
                    break;
                    
                case 'amount':
                    sorted.sort((a, b) => {
                        return order === 'asc' ? a.amount - b.amount : b.amount - a.amount;
                    });
                    break;
                    
                case 'category':
                    sorted.sort((a, b) => {
                        const catA = a.category.toLowerCase();
                        const catB = b.category.toLowerCase();
                        if (order === 'asc') {
                            return catA.localeCompare(catB, 'ja');
                        } else {
                            return catB.localeCompare(catA, 'ja');
                        }
                    });
                    break;
                    
                default:
                    console.warn(`Unknown sort type: ${sortBy}`);
            }
            
            console.log(`Sorted: sortBy=${sortBy}, order=${order}, count=${sorted.length}`);
            return sorted;
        } catch (error) {
            console.error('ExpenseManagerModule.sortExpenses error:', error);
            return expenses;
        }
    }
    
    /**
     * カテゴリ一覧を取得
     * @returns {Array} カテゴリ配列
     */
    getCategories() {
        return [...this.#categories];
    }
    
    // ================
    // DOM操作メソッド（グローバル関数を統合）
    // ================
    
    /**
     * フォームから経費を追加
     */
    addExpenseFromForm() {
        try {
            // フォーム要素取得
            const dateInput = document.getElementById('expenseDate');
            const categoryInput = document.getElementById('expenseCategory');
            const amountInput = document.getElementById('expenseAmount');
            const descriptionInput = document.getElementById('expenseDescription');
            const memoInput = document.getElementById('expenseMemo');
            
            // バリデーション
            if (!dateInput?.value || !categoryInput?.value || !amountInput?.value) {
                if (typeof window.showToast === 'function') {
                    window.showToast('日付、カテゴリ、金額は必須です', 'error');
                } else {
                    alert('日付、カテゴリ、金額は必須です');
                }
                return;
            }
            
            const amount = parseFloat(amountInput.value);
            if (isNaN(amount) || amount <= 0) {
                if (typeof window.showToast === 'function') {
                    window.showToast('有効な金額を入力してください', 'error');
                } else {
                    alert('有効な金額を入力してください');
                }
                return;
            }
            
            // 年度計算（日本の会計年度: 1-3月は前年度）
            const date = new Date(dateInput.value);
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const taxYear = month >= 1 && month <= 3 ? year - 1 : year;
            
            // === セキュリティ: テキストフィールドをサニタイズ ===
            const expense = {
                date: dateInput.value,
                category: this.#sanitize(categoryInput.value),
                amount: amount,
                description: this.#sanitize(descriptionInput?.value || ''),
                memo: this.#sanitize(memoInput?.value || ''),
                taxYear: taxYear
            };
            
            console.log('[ExpenseManagerModule] サニタイズ適用完了');
            
            // 追加
            if (this.addExpense(expense)) {
                // フォームクリア（日付は保持）
                // dateInput.value = '';  // ← 日付を保持（連続入力時の利便性向上）
                if (categoryInput) categoryInput.selectedIndex = 0;
                amountInput.value = '';
                if (descriptionInput) descriptionInput.value = '';
                if (memoInput) memoInput.value = '';
                
                // UI更新
                this.updateRecentExpenses();
                this.updateExpenseListFull();
                
                // 成功メッセージ
                if (typeof window.showToast === 'function') {
                    window.showToast('経費を追加しました', 'success');
                }
            } else {
                throw new Error('Failed to add expense');
            }
        } catch (error) {
            console.error('ExpenseManagerModule.addExpenseFromForm error:', error);
            if (typeof window.showToast === 'function') {
                window.showToast('経費の追加に失敗しました', 'error');
            } else {
                alert('経費の追加に失敗しました');
            }
        }
    }
    
    /**
     * 削除確認付き経費削除
     * @param {string} id - 経費ID
     */
    deleteExpenseWithConfirm(id) {
        try {
            if (!confirm('この経費を削除してもよろしいですか？')) {
                return;
            }
            
            if (this.deleteExpense(id)) {
                // UI更新
                this.updateRecentExpenses();
                this.updateExpenseListFull();
                
                // 成功メッセージ
                if (typeof window.showToast === 'function') {
                    window.showToast('経費を削除しました', 'success');
                }
            } else {
                throw new Error('Failed to delete expense');
            }
        } catch (error) {
            console.error('ExpenseManagerModule.deleteExpenseWithConfirm error:', error);
            if (typeof window.showToast === 'function') {
                window.showToast('経費の削除に失敗しました', 'error');
            } else {
                alert('経費の削除に失敗しました');
            }
        }
    }
    
    /**
     * カテゴリアコーディオンの開閉切り替え
     * @param {string} categoryName - カテゴリ名
     */
    toggleCategory(categoryName) {
        try {
            const content = document.querySelector(`.category-content[data-category="${categoryName}"]`);
            const header = content?.previousElementSibling;
            
            if (!content || !header) return;
            
            // 展開/折りたたみ切り替え
            const isExpanded = content.classList.contains('expanded');
            content.classList.toggle('expanded');
            header.setAttribute('aria-expanded', !isExpanded);
            
            // アイコン切り替え
            const icon = header.querySelector('.toggle-icon');
            if (icon) {
                icon.textContent = isExpanded ? '▶' : '▼';
            }
            
            // 状態を保存
            const state = this.#loadAccordionState();
            state[categoryName] = !isExpanded;
            this.#saveAccordionState(state);
            
            console.log(`Category "${categoryName}" toggled:`, !isExpanded);
        } catch (error) {
            console.error('ExpenseManagerModule.toggleCategory error:', error);
        }
    }
    
    /**
     * 最近の経費表示を更新
     */
    updateRecentExpenses() {
        try {
            const container = document.getElementById('recentExpenses');
            if (!container) return;
            
            // CSSスタイルを<head>に挿入（初回のみ）
            this.#insertExpenseListStyles();
            
            // 最新5件を取得（降順）
            const recent = [...this.#expenses]
                .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
                .slice(0, 5);
            
            if (recent.length === 0) {
                container.innerHTML = '<p class="no-data">経費データがありません</p>';
                return;
            }
            
            // HTML生成
            let html = '<div class="expense-list">';
            recent.forEach(exp => {
                html += `
                    <div class="expense-item">
                        <div class="expense-date">${exp.date}</div>
                        <div class="expense-category">${exp.category}</div>
                        <div class="expense-amount">¥${exp.amount.toLocaleString()}</div>
                        <div class="expense-description">${exp.description || '-'}</div>
                        <button class="btn-delete" onclick="window.deleteExpense('${exp.id}')">削除</button>
                    </div>
                `;
            });
            html += '</div>';
            
            container.innerHTML = html;
        } catch (error) {
            console.error('ExpenseManagerModule.updateRecentExpenses error:', error);
        }
    }
    
    // ================
    // カテゴリアコーディオン機能（Private Methods）
    // ================
    
    /**
     * 経費リスト用CSSを<head>に挿入
     * @private
     */
    #insertExpenseListStyles() {
        // 既に存在する場合は何もしない
        if (document.getElementById('expense-list-styles')) {
            return;
        }
        
        // <style>要素を作成
        const style = document.createElement('style');
        style.id = 'expense-list-styles';
        style.textContent = `
            /* 経費リストコンテナ */
            .expense-list {
                width: 100%;
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 8px;
                overflow: hidden;
            }
            
            /* 経費アイテム（1行） - 5列グリッド */
            .expense-item {
                display: grid;
                grid-template-columns: 1fr 1.5fr 1fr 2fr 0.8fr;
                gap: 10px;
                align-items: center;
                padding: 12px 15px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                background: #0c1018;
                transition: background 0.2s;
            }
            
            .expense-item:last-child {
                border-bottom: none;
            }
            
            .expense-item:hover {
                background: #0f1320;
            }
            
            /* 日付 */
            .expense-date {
                font-size: 14px;
                color: #aaa;
                white-space: nowrap;
            }
            
            /* カテゴリ */
            .expense-category {
                display: inline-block;
                padding: 4px 10px;
                background: rgba(0, 150, 136, 0.2);
                border: 1px solid #009688;
                border-radius: 15px;
                font-size: 12px;
                color: #4DB6AC;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 180px;
            }
            
            /* 金額 */
            .expense-amount {
                font-size: 15px;
                font-weight: bold;
                color: #f44336;
                text-align: right;
                white-space: nowrap;
            }
            
            /* 説明 */
            .expense-description {
                font-size: 14px;
                color: #ccc;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            /* 削除ボタン */
            .expense-item .btn-delete {
                padding: 6px 12px;
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
                white-space: nowrap;
            }
            
            .expense-item .btn-delete:hover {
                background: #c82333;
            }
        `;
        
        // <head>に追加
        document.head.appendChild(style);
        
        console.log('✅ Expense list CSS inserted to <head>');
    }
    
    /**
     * アコーディオン用CSSを<head>に挿入（確実に保持）
     * @private
     */
    #insertAccordionStyles() {
        // 既に存在する場合は何もしない
        if (document.getElementById('expense-accordion-styles')) {
            return;
        }
        
        // <style>要素を作成
        const style = document.createElement('style');
        style.id = 'expense-accordion-styles';
        style.textContent = `
            /* カテゴリグループ */
            .expense-category-group {
                margin-bottom: 20px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 8px;
                overflow: hidden;
                background: #0c1018;
            }
            
            /* カテゴリヘッダー */
            .category-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 15px;
                background: #101420;
                cursor: pointer;
                transition: background 0.2s;
                user-select: none;
            }
            
            .category-header:hover {
                background: #151a28;
            }
            
            /* カテゴリ情報 */
            .category-info {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .category-icon {
                font-size: 18px;
            }
            
            .category-name {
                font-size: 16px;
                font-weight: 500;
                color: #fff;
            }
            
            /* カテゴリサマリー */
            .category-summary {
                display: flex;
                align-items: center;
                gap: 15px;
            }
            
            .category-count {
                color: #aaa;
                font-size: 14px;
            }
            
            .category-total {
                font-weight: bold;
                font-size: 16px;
                color: #4CAF50;
            }
            
            .toggle-icon {
                font-size: 12px;
                transition: transform 0.3s;
                color: #aaa;
            }
            
            /* カテゴリコンテンツ */
            .category-content {
                padding: 0;
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.3s ease-out, padding 0.3s ease-out;
            }
            
            .category-content.expanded {
                padding: 15px;
                max-height: 10000px;
            }
            
            /* 経費カード */
            .expense-card {
                background: #101420;
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 10px;
                transition: all 0.2s;
            }
            
            .expense-card:last-child {
                margin-bottom: 0;
            }
            
            .expense-card:hover {
                background: #151a28;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                transform: translateY(-1px);
            }
            
            .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .card-date {
                color: #aaa;
                font-size: 14px;
            }
            
            .card-amount {
                font-weight: bold;
                font-size: 16px;
                color: #4CAF50;
            }
            
            .card-body {
                margin-bottom: 8px;
                color: #ccc;
                font-size: 14px;
            }
            
            .card-description {
                color: #ccc;
            }
            
            .card-footer {
                display: flex;
                justify-content: flex-end;
            }
            
            .btn-delete {
                padding: 6px 12px;
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
            }
            
            .btn-delete:hover {
                background: #c82333;
            }
            
            /* メモ表示 */
            .card-memo {
                margin-top: 8px;
                padding: 8px 10px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                border-left: 3px solid #60a5fa;
                font-size: 0.85em;
                color: #a0a0a0;
            }
            
            .memo-label {
                margin-right: 6px;
            }
            
            .memo-text {
                font-style: italic;
            }
            
            /* 全体サマリー */
            .expense-total-summary {
                margin-top: 30px;
                padding: 15px;
                text-align: center;
                font-size: 16px;
                font-weight: bold;
                border-top: 2px solid rgba(255, 255, 255, 0.06);
                color: #ccc;
            }
            
            /* レスポンシブ */
            @media (max-width: 768px) {
                .category-header {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 10px;
                }
                
                .category-summary {
                    width: 100%;
                    justify-content: space-between;
                }
                
                .card-header {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 5px;
                }
            }
        `;
        
        // <head>に追加
        document.head.appendChild(style);
        
        console.log('✅ Accordion CSS inserted to <head>');
    }
    
    /**
     * 経費をカテゴリごとにグループ化
     * @param {Array} expenses - 経費配列
     * @returns {Object} カテゴリごとにグループ化されたオブジェクト
     * @private
     */
    #groupExpensesByCategory(expenses) {
        const grouped = {};
        
        // #categories配列の順序でグループ化（固定順）
        this.#categories.forEach(category => {
            grouped[category] = [];
        });
        
        // 経費を該当カテゴリに振り分け
        expenses.forEach(expense => {
            if (grouped[expense.category]) {
                grouped[expense.category].push(expense);
            }
        });
        
        // 経費0件のカテゴリは除外
        Object.keys(grouped).forEach(category => {
            if (grouped[category].length === 0) {
                delete grouped[category];
            }
        });
        
        return grouped;
    }
    
    /**
     * カテゴリセクションのHTML生成
     * @param {string} category - カテゴリ名
     * @param {Array} expenses - そのカテゴリの経費配列
     * @param {boolean} isExpanded - 展開状態
     * @returns {string} HTML文字列
     * @private
     */
    #generateCategoryHTML(category, expenses, isExpanded) {
        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const count = expenses.length;
        const toggleIcon = isExpanded ? '▼' : '▶';
        const expandedClass = isExpanded ? 'expanded' : '';
        
        let html = `
            <div class="expense-category-group">
                <div class="category-header" 
                     onclick="window.ExpenseManagerModule.toggleCategory('${category}')"
                     aria-expanded="${isExpanded}"
                     role="button"
                     tabindex="0">
                    <div class="category-info">
                        <span class="category-icon">📂</span>
                        <span class="category-name">${category}</span>
                    </div>
                    <div class="category-summary">
                        <span class="category-count">${count}件</span>
                        <span class="category-total">¥${total.toLocaleString()}</span>
                        <span class="toggle-icon">${toggleIcon}</span>
                    </div>
                </div>
                <div class="category-content ${expandedClass}" data-category="${category}">
        `;
        
        // 各経費のカードHTML生成
        expenses.forEach(expense => {
            html += this.#generateExpenseCardHTML(expense);
        });
        
        html += `
                </div>
            </div>
        `;
        
        return html;
    }
    
    /**
     * 経費カードのHTML生成
     * @param {Object} expense - 経費オブジェクト
     * @returns {string} HTML文字列
     * @private
     */
    #generateExpenseCardHTML(expense) {
        // メモがある場合のみ表示
        const memoHtml = expense.memo ? `
            <div class="card-memo">
                <span class="memo-label">💬</span>
                <span class="memo-text">${expense.memo}</span>
            </div>
        ` : '';
        
        return `
            <div class="expense-card">
                <div class="card-header">
                    <span class="card-date">📅 ${expense.date}</span>
                    <span class="card-amount">💰 ¥${expense.amount.toLocaleString()}</span>
                </div>
                <div class="card-body">
                    <span class="card-description">📝 ${expense.description || '-'}</span>
                    ${memoHtml}
                </div>
                <div class="card-footer">
                    <button class="btn-delete" 
                            onclick="window.ExpenseManagerModule.deleteExpenseWithConfirm('${expense.id}')">
                        🗑️ 削除
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * アコーディオンの展開状態をLocalStorageから読み込み
     * @returns {Object} カテゴリ名: true/false のオブジェクト
     * @private
     */
    #loadAccordionState() {
        // StorageValidatorで安全に読み込み
        return StorageValidator.safeLoad(
            'tc_expense_accordion_state',
            {},
            StorageValidator.isObject
        );
    }
    
    /**
     * アコーディオンの展開状態をLocalStorageに保存
     * @param {Object} state - カテゴリ名: true/false のオブジェクト
     * @private
     */
    #saveAccordionState(state) {
        try {
            localStorage.setItem('tc_expense_accordion_state', JSON.stringify(state));
        } catch (error) {
            console.error('Failed to save accordion state:', error);
        }
    }
    
    /**
     * 経費一覧の完全更新（カテゴリアコーディオン形式）
     */
    updateExpenseListFull() {
        try {
            const container = document.getElementById('expenseListFull');
            if (!container) {
                console.warn('expenseListFull container not found');
                return;
            }
            
            // フィルター値取得（存在しない場合はデフォルト）
            const year = document.getElementById('filterYear')?.value || 'all';
            const month = document.getElementById('filterMonth')?.value || 'all';
            const category = document.getElementById('filterCategory')?.value || 'all';
            const sortBy = document.getElementById('filterSort')?.value || 'date-desc';
            
            // ソート基準と順序を分解
            const [sortField, sortOrder] = sortBy.split('-');
            
            // フィルタリング
            let expenses = this.getExpensesByFilter(year, month, category);
            
            // ソート
            expenses = this.sortExpenses(expenses, sortField, sortOrder);
            
            console.log('Filtered:', { year, month, category, results: expenses.length });
            console.log('Sorted:', { sortBy: sortField, order: sortOrder, count: expenses.length });
            
            // 経費0件の場合
            if (expenses.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #7a8599;">
                        <p style="font-size: 18px; margin-bottom: 10px;">📭</p>
                        <p>経費データがありません</p>
                    </div>
                `;
                return;
            }
            
            // カテゴリごとにグループ化
            const grouped = this.#groupExpensesByCategory(expenses);
            
            // アコーディオン状態を読み込み
            const accordionState = this.#loadAccordionState();
            
            // HTML生成
            let html = '';
            
            // CSSスタイルを<head>に挿入（初回のみ・確実に保持）
            if (!document.getElementById('expense-accordion-styles')) {
                this.#insertAccordionStyles();
            }
            
            // 各カテゴリのHTML生成
            Object.keys(grouped).forEach(categoryName => {
                const categoryExpenses = grouped[categoryName];
                const isExpanded = accordionState[categoryName] || false;
                html += this.#generateCategoryHTML(categoryName, categoryExpenses, isExpanded);
            });
            
            // 全体サマリー
            const totalCount = expenses.length;
            const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
            
            html += `
                <div class="expense-total-summary">
                    総件数: ${totalCount}件 / 総額: ¥${totalAmount.toLocaleString()}
                </div>
            `;
            
            container.innerHTML = html;
            
            // EventBus発火
            this.#eventBus?.emit('expenses:filtered', {
                year,
                month,
                category,
                sortBy: sortField,
                order: sortOrder,
                count: expenses.length
            });
            
        } catch (error) {
            console.error('ExpenseManagerModule.updateExpenseListFull error:', error);
        }
    }
    
    /**
     * 経費タブの初期化
     */
    initExpenseTab() {
        try {
            console.log('Initializing expense tab...');
            
            // 経費読み込み
            this.loadExpenses();
            
            // UI更新
            this.updateRecentExpenses();
            this.updateExpenseListFull();
            
            // フォーム送信イベント
            const form = document.getElementById('expenseForm');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.addExpenseFromForm();
                });
            }
            
            // 追加ボタン
            const addBtn = document.getElementById('addExpenseBtn');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    this.addExpenseFromForm();
                });
            }
            
            console.log('Expense tab initialized');
        } catch (error) {
            console.error('ExpenseManagerModule.initExpenseTab error:', error);
        }
    }
    
    /**
     * 経費一覧タブの初期化（経費一覧タブが開かれた時に呼ばれる）
     */
    initExpenseListTab() {
        try {
            console.log('Initializing expense list tab...');
            
            // フィルターのデフォルト値を設定（現在の年月）
            this.#setDefaultFilters();
            
            // 一覧を更新
            this.updateExpenseListFull();
            
            console.log('Expense list tab initialized');
        } catch (error) {
            console.error('ExpenseManagerModule.initExpenseListTab error:', error);
        }
    }
    
    /**
     * フィルターのデフォルト値を設定（現在の年月）
     * @private
     */
    #setDefaultFilters() {
        try {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1; // 0-11 → 1-12
            
            // 年度フィルターを現在の年に設定
            const filterYear = document.getElementById('filterYear');
            if (filterYear) {
                filterYear.value = currentYear.toString();
                console.log(`Filter year set to: ${currentYear}`);
            }
            
            // 月フィルターを現在の月に設定
            const filterMonth = document.getElementById('filterMonth');
            if (filterMonth) {
                filterMonth.value = currentMonth.toString();
                console.log(`Filter month set to: ${currentMonth}`);
            }
            
            // カテゴリと並替はデフォルト値のまま（all, date-desc）
            console.log('Default filters applied: current year and month');
            
        } catch (error) {
            console.error('ExpenseManagerModule.#setDefaultFilters error:', error);
        }
    }
    
    // ================
    // Private Methods（内部のみ）
    // ================
    
    #initialize() {
        try {
            // データ読み込み
            this.loadExpenses();
            
            // グローバル関数の置き換え
            this.#replaceGlobalFunctions();
            
            console.log(`${this.constructor.name} initialized with ${this.#expenses.length} expenses`);
            this.#initialized = true;
        } catch (error) {
            console.error('ExpenseManagerModule.#initialize error:', error);
        }
    }
    
    #validateExpense(expense) {
        // デバッグログ：各バリデーションステップを確認
        console.log('Validating expense:', expense);
        
        if (!expense) {
            console.error('Validation failed: expense is null/undefined');
            return false;
        }
        if (!expense.date) {
            console.error('Validation failed: date is missing');
            return false;
        }
        if (!expense.category) {
            console.error('Validation failed: category is missing');
            return false;
        }
        if (!expense.amount || isNaN(expense.amount) || expense.amount <= 0) {
            console.error('Validation failed: invalid amount', expense.amount);
            return false;
        }
        if (!this.#categories.includes(expense.category)) {
            console.error('Validation failed: category not in allowed list', {
                provided: expense.category,
                allowed: this.#categories
            });
            return false;
        }
        
        console.log('Validation passed ✅');
        return true;
    }
    
    #replaceGlobalFunctions() {
        try {
            // グローバル関数を新しいメソッドに置き換え
            window.addExpense = () => this.addExpenseFromForm();
            window.deleteExpense = (id) => this.deleteExpenseWithConfirm(id);
            window.updateRecentExpenses = () => this.updateRecentExpenses();
            window.updateExpenseListFull = () => this.updateExpenseListFull();
            window.initExpenseTab = () => this.initExpenseTab();
            
            // インスタンスをグローバルに公開
            window.expenseManager = this;
            
            console.log('Global functions replaced with ExpenseManagerModule methods');
        } catch (error) {
            console.error('ExpenseManagerModule.#replaceGlobalFunctions error:', error);
        }
    }
    
    // ================
    // Debug Methods（開発用）
    // ================
    
    getStatus() {
        return {
            expenseCount: this.#expenses.length,
            initialized: this.#initialized,
            hasEventBus: !!this.#eventBus,
            categories: this.#categories.length,
            storageKey: this.#storageKey,
            latestExpense: this.#expenses.length > 0 
                ? this.#expenses[this.#expenses.length - 1] 
                : null
        };
    }
}

// ================
// 即座に初期化（シングルトン）
// ================
window.ExpenseManagerModule = new ExpenseManagerModule();

// デバッグ出力
console.log('ExpenseManagerModule loaded:', window.ExpenseManagerModule.getStatus());