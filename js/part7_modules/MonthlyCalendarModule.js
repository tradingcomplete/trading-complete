/**
 * @module MonthlyCalendarModule
 * @description 月次カレンダー表示機能 - MODULES.md準拠
 * @author コンパナ / Claude
 * @version 1.0.0
 * @important UIの変更は原則禁止。見た目は既存のまま維持すること。
 */
class MonthlyCalendarModule {
    // ========== Private Fields ==========
    #currentYear = null;
    #currentMonth = null;
    #eventBus = null;
    #tradeManager = null;
    #initialized = false;
    
    constructor() {
        this.#eventBus = window.eventBus;
        this.#tradeManager = window.TradeManager?.getInstance();
        
        // 現在の年月を初期値として設定
        const today = new Date();
        this.#currentYear = today.getFullYear();
        this.#currentMonth = today.getMonth() + 1; // 1-12
        
        console.log('MonthlyCalendarModule: 初期化開始');
        console.log(`  - 初期年月: ${this.#currentYear}年${this.#currentMonth}月`);
        console.log(`  - EventBus: ${this.#eventBus ? '✅' : '❌'}`);
        console.log(`  - TradeManager: ${this.#tradeManager ? '✅' : '❌'}`);
    }
    
    // ========== Public API ==========
    
    /**
     * カレンダー初期化
     * @public
     */
    initialize() {
        console.log('MonthlyCalendarModule.initialize: 開始');
        
        try {
            this.#generateYearOptions();
            this.updateCalendar();
            this.#setupEventListeners();
            this.#initialized = true;
            
            console.log('MonthlyCalendarModule.initialize: 完了 ✅');
        } catch (error) {
            console.error('MonthlyCalendarModule.initialize: エラー', error);
        }
    }
    
    /**
     * カレンダー更新
     * @public
     */
    updateCalendar() {
        console.log('MonthlyCalendarModule.updateCalendar: 開始');
        
        try {
            // 年選択ドロップダウンから年を取得
            const yearSelect = document.getElementById('calendarYear');
            if (yearSelect) {
                this.#currentYear = parseInt(yearSelect.value);
            }
            
            // カレンダー生成
            this.#generateCalendar(this.#currentYear, this.#currentMonth);
            
            // 月間サマリー更新
            this.#updateMonthSummary(this.#currentYear, this.#currentMonth);
            
            console.log(`  - 表示: ${this.#currentYear}年${this.#currentMonth}月`);
        } catch (error) {
            console.error('MonthlyCalendarModule.updateCalendar: エラー', error);
        }
    }
    
    /**
     * 前月へ移動
     * @public
     */
    previousMonth() {
        console.log('MonthlyCalendarModule.previousMonth: 実行');
        
        this.#currentMonth--;
        if (this.#currentMonth < 1) {
            this.#currentMonth = 12;
            this.#currentYear--;
        }
        
        this.#updateYearSelect();
        this.updateCalendar();
        this.#emitEvent('calendar:monthChanged');
    }
    
    /**
     * 次月へ移動
     * @public
     */
    nextMonth() {
        console.log('MonthlyCalendarModule.nextMonth: 実行');
        
        this.#currentMonth++;
        if (this.#currentMonth > 12) {
            this.#currentMonth = 1;
            this.#currentYear++;
        }
        
        this.#updateYearSelect();
        this.updateCalendar();
        this.#emitEvent('calendar:monthChanged');
    }
    
    /**
     * 今月に戻る
     * @public
     */
    goToCurrentMonth() {
        console.log('MonthlyCalendarModule.goToCurrentMonth: 実行');
        
        const today = new Date();
        this.#currentYear = today.getFullYear();
        this.#currentMonth = today.getMonth() + 1;
        
        this.#updateYearSelect();
        this.updateCalendar();
        this.#emitEvent('calendar:monthChanged');
    }
    
    /**
     * ツールチップ表示
     * @public
     * @param {Event} event - クリックイベント
     * @param {string} date - 日付（YYYY-MM-DD）
     * @param {number} profit - 損益
     * @param {number} count - トレード数
     */
    showDayTooltip(event, date, profit, count) {
        // 既に表示中の場合は一旦非表示にする
        this.hideDayTooltip();
        
        // 少し遅延させてから表示（非表示→表示のアニメーション用）
        setTimeout(() => {
            this.#displayTooltip(event, date, profit, count);
        }, 10);
    }
    
    /**
     * ツールチップ非表示
     * @public
     */
    hideDayTooltip() {
        const tooltip = document.getElementById('dayTooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }
    
    /**
     * モジュール状態取得（デバッグ用）
     * @public
     * @returns {Object} モジュールの状態
     */
    getStatus() {
        return {
            currentYear: this.#currentYear,
            currentMonth: this.#currentMonth,
            initialized: this.#initialized,
            hasEventBus: !!this.#eventBus,
            hasTradeManager: !!this.#tradeManager
        };
    }
    
    // ========== Private Methods ==========
    
    /**
     * 年選択ドロップダウンの生成
     * @private
     */
    #generateYearOptions() {
        console.log('MonthlyCalendarModule.#generateYearOptions: 実行');
        
        const yearSelect = document.getElementById('calendarYear');
        if (!yearSelect) {
            console.warn('  - calendarYear要素が見つかりません');
            return;
        }
        
        // 現在の年から前後3年分の選択肢を生成
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - 3;
        const endYear = currentYear + 1;
        
        let options = '';
        for (let year = startYear; year <= endYear; year++) {
            const selected = (year === this.#currentYear) ? 'selected' : '';
            options += `<option value="${year}" ${selected}>${year}年</option>`;
        }
        
        yearSelect.innerHTML = options;
        console.log(`  - 年選択生成: ${startYear}年〜${endYear}年`);
    }
    
    /**
     * カレンダー生成
     * @private
     * @param {number} year - 年
     * @param {number} month - 月（1-12）
     */
    #generateCalendar(year, month) {
        console.log(`MonthlyCalendarModule.#generateCalendar: ${year}年${month}月`);
        
        const calendarGrid = document.getElementById('calendarGrid');
        if (!calendarGrid) {
            console.warn('  - calendarGrid要素が見つかりません');
            return;
        }
        
        try {
            // 日別損益を計算
            const dailyProfits = this.#calculateDailyProfits(year, month);
            
            // カレンダーHTMLを生成
            const calendarHTML = this.#buildCalendarHTML(year, month, dailyProfits);
            
            // DOMに反映
            calendarGrid.innerHTML = calendarHTML;
            
            console.log(`  - カレンダー生成完了: ${Object.keys(dailyProfits).length}日分のデータ`);
        } catch (error) {
            console.error('  - カレンダー生成エラー:', error);
            calendarGrid.innerHTML = '<div class="error-message">カレンダーの生成に失敗しました</div>';
        }
    }
    
    /**
     * 日別損益を計算
     * @private
     * @param {number} year - 年
     * @param {number} month - 月（1-12）
     * @returns {Object} 日別損益データ { "2025-02-01": { total: -16000, count: 3 }, ... }
     */
    #calculateDailyProfits(year, month) {
        console.log(`MonthlyCalendarModule.#calculateDailyProfits: ${year}年${month}月`);
        
        if (!this.#tradeManager) {
            console.warn('  - TradeManager未設定');
            return {};
        }
        
        // 全トレードを取得
        const allTrades = this.#tradeManager.getAllTrades();
        console.log(`  - 全トレード数: ${allTrades.length}`);
        
        // 決済済みトレードのみフィルター
        const settledTrades = allTrades.filter(trade => 
            trade.exits && trade.exits.length > 0
        );
        console.log(`  - 決済済みトレード数: ${settledTrades.length}`);
        
        // 対象月のトレードのみ抽出し、日別に集計
        const dailyProfits = {};
        const targetYearMonth = `${year}-${String(month).padStart(2, '0')}`;
        
        settledTrades.forEach(trade => {
            // 最終決済日を取得
            const lastExit = trade.exits[trade.exits.length - 1];
            const exitDate = lastExit.time.split('T')[0]; // "2025-02-01"
            
            // 対象月かチェック
            if (!exitDate.startsWith(targetYearMonth)) {
                return;
            }
            
            // 円建て損益を取得（MODULES.md準拠）
            const profit = trade.yenProfitLoss?.netProfit || 0;
            
            // 日別に集計
            if (!dailyProfits[exitDate]) {
                dailyProfits[exitDate] = {
                    total: 0,
                    count: 0
                };
            }
            
            dailyProfits[exitDate].total += profit;
            dailyProfits[exitDate].count += 1;
        });
        
        console.log(`  - 集計結果: ${Object.keys(dailyProfits).length}日分`);
        return dailyProfits;
    }
    
    /**
     * カレンダーHTMLを生成
     * @private
     * @param {number} year - 年
     * @param {number} month - 月（1-12）
     * @param {Object} dailyProfits - 日別損益データ
     * @returns {string} カレンダーHTML
     */
    #buildCalendarHTML(year, month, dailyProfits) {
        let html = '';
        
        // 曜日ヘッダー（直接追加）
        html += '<div class="calendar-header-cell sunday">日</div>';
        html += '<div class="calendar-header-cell">月</div>';
        html += '<div class="calendar-header-cell">火</div>';
        html += '<div class="calendar-header-cell">水</div>';
        html += '<div class="calendar-header-cell">木</div>';
        html += '<div class="calendar-header-cell">金</div>';
        html += '<div class="calendar-header-cell saturday">土</div>';
        
        // 月初の曜日
        const firstDay = new Date(year, month - 1, 1).getDay();
        const daysInMonth = new Date(year, month, 0).getDate();
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        // 空白セル
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-day-cell empty"></div>';
        }
        
        // 日付セル
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayData = dailyProfits[dateKey] || null;
            const isToday = (dateKey === todayStr);
            
            html += this.#buildDayCellHTML(day, dateKey, dayData, isToday);
        }
        
        return html;
    }
    
    /**
     * 日付セルHTMLを生成
     * @private
     * @param {number} day - 日
     * @param {string} dateKey - 日付キー（YYYY-MM-DD）
     * @param {Object|null} dayData - 日別データ { total: number, count: number }
     * @param {boolean} isToday - 今日かどうか
     * @returns {string} 日付セルHTML
     */
    #buildDayCellHTML(day, dateKey, dayData, isToday) {
        let classes = 'calendar-day-cell';
        if (isToday) classes += ' today';
        
        let content = `<div class="calendar-day-number">${day}</div>`;
        
        if (dayData) {
            const profit = dayData.total;
            const count = dayData.count;
            const profitK = this.#formatProfitK(profit);
            const profitClass = profit > 0 ? 'positive' : profit < 0 ? 'negative' : 'zero';
            
            content += `
                <div class="calendar-day-profit ${profitClass}">${profitK}</div>
                <div class="calendar-day-count">${count}件</div>
            `;
            
            // クリックイベントを設定
            const onclick = `window.MonthlyCalendarModule.showDayTooltip(event, '${dateKey}', ${profit}, ${count})`;
            
            return `<div class="${classes}" onclick="${onclick}">${content}</div>`;
        }
        
        return `<div class="${classes}">${content}</div>`;
    }
    
    /**
     * 損益をk表記にフォーマット
     * @private
     * @param {number} profit - 損益（円）
     * @returns {string} k表記の文字列（例: -16k, +52k）
     */
    #formatProfitK(profit) {
        const sign = profit >= 0 ? '+' : '';
        const k = Math.round(profit / 1000);
        return `${sign}${k}k`;
    }
    
    /**
     * 損益を円表記にフォーマット
     * @private
     * @param {number} profit - 損益（円）
     * @returns {string} 円表記の文字列（例: -16,000円, +52,000円）
     */
    #formatYen(profit) {
        const sign = profit >= 0 ? '+' : '';
        return `${sign}${profit.toLocaleString()}円`;
    }
    
    /**
     * 月間サマリー更新
     * @private
     * @param {number} year - 年
     * @param {number} month - 月（1-12）
     */
    #updateMonthSummary(year, month) {
        console.log(`MonthlyCalendarModule.#updateMonthSummary: ${year}年${month}月`);
        
        const summaryElement = document.getElementById('monthSummary');
        if (!summaryElement) {
            console.warn('  - monthSummary要素が見つかりません');
            return;
        }
        
        try {
            // 日別損益を計算
            const dailyProfits = this.#calculateDailyProfits(year, month);
            
            // 月間合計を計算
            let totalProfit = 0;
            let totalTrades = 0;
            
            Object.values(dailyProfits).forEach(dayData => {
                totalProfit += dayData.total;
                totalTrades += dayData.count;
            });
            
            // サマリーHTML生成
            const profitFormatted = this.#formatYen(totalProfit);
            const profitClass = totalProfit >= 0 ? 'profit-positive' : 'profit-negative';
            
            summaryElement.innerHTML = `
                <div class="month-summary-content">
                    <div class="summary-item">
                        <span class="summary-label">今月の損益:</span>
                        <span class="summary-value ${profitClass}">${profitFormatted}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">（決済済みトレード: ${totalTrades}件）</span>
                    </div>
                </div>
            `;
            
            console.log(`  - 月間サマリー更新完了: ${profitFormatted} (${totalTrades}件)`);
        } catch (error) {
            console.error('  - 月間サマリー更新エラー:', error);
            summaryElement.innerHTML = '<div class="error-message">サマリーの表示に失敗しました</div>';
        }
    }
    
    /**
     * 年選択ドロップダウンの値を更新
     * @private
     */
    #updateYearSelect() {
        const yearSelect = document.getElementById('calendarYear');
        if (yearSelect) {
            yearSelect.value = this.#currentYear;
        }
    }
    
    /**
     * ツールチップ表示
     * @private
     * @param {Event} event - クリックイベント
     * @param {string} date - 日付（YYYY-MM-DD）
     * @param {number} profit - 損益
     * @param {number} count - トレード数
     */
    #displayTooltip(event, date, profit, count) {
        const tooltip = document.getElementById('dayTooltip');
        if (!tooltip) {
            console.warn('MonthlyCalendarModule.#displayTooltip: dayTooltip要素が見つかりません');
            return;
        }
        
        // 日付をフォーマット（2025-02-01 → 2月1日）
        const [year, month, day] = date.split('-');
        const dateFormatted = `${parseInt(month)}月${parseInt(day)}日`;
        
        // 損益をフォーマット
        const profitFormatted = this.#formatYen(profit);
        const profitClass = profit >= 0 ? 'profit-positive' : 'profit-negative';
        
        // ツールチップHTML
        tooltip.innerHTML = `
            <div class="tooltip-header">${dateFormatted}</div>
            <div class="tooltip-body">
                <div class="tooltip-row">
                    <span class="tooltip-label">損益:</span>
                    <span class="tooltip-value ${profitClass}">${profitFormatted}</span>
                </div>
                <div class="tooltip-row">
                    <span class="tooltip-label">トレード数:</span>
                    <span class="tooltip-value">${count}件</span>
                </div>
            </div>
        `;
        
        // ツールチップの位置を設定（画面端で切れないように調整）
        tooltip.style.display = 'block';  // 先に表示してサイズを取得
        
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let x = event.clientX + 10;
        let y = event.clientY + 10;
        
        // 右端で切れる場合は左側に表示
        if (x + tooltipWidth > viewportWidth - 10) {
            x = event.clientX - tooltipWidth - 10;
        }
        
        // 下端で切れる場合は上側に表示
        if (y + tooltipHeight > viewportHeight - 10) {
            y = event.clientY - tooltipHeight - 10;
        }
        
        // 左端・上端のガード（負の値にならないように）
        x = Math.max(10, x);
        y = Math.max(10, y);
        
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        
        // 他の場所をクリックしたら閉じる
        const closeTooltip = (e) => {
            if (!tooltip.contains(e.target)) {
                this.hideDayTooltip();
                document.removeEventListener('click', closeTooltip);
            }
        };
        
        // 少し遅延させてイベントリスナーを登録（同じクリックで閉じないように）
        setTimeout(() => {
            document.addEventListener('click', closeTooltip);
        }, 100);
        
        console.log(`MonthlyCalendarModule.#displayTooltip: ${dateFormatted} - ${profitFormatted} (${count}件)`);
    }
    
    /**
     * EventBusリスナー設定
     * @private
     */
    #setupEventListeners() {
        console.log('MonthlyCalendarModule.#setupEventListeners: 実行');
        
        if (!this.#eventBus) {
            console.warn('  - EventBus未設定のためスキップ');
            return;
        }
        
        // リスナー重複登録を防ぐ（REFERENCE.mdの教訓より）
        if (window.calendarListenersRegistered) {
            console.log('  - EventBusリスナー既に登録済み');
            return;
        }
        
        // trade:added - トレード追加時
        this.#eventBus.on('trade:added', () => {
            console.log('MonthlyCalendarModule: trade:added イベント受信');
            this.updateCalendar();
        });
        
        // trade:updated - トレード更新時
        this.#eventBus.on('trade:updated', () => {
            console.log('MonthlyCalendarModule: trade:updated イベント受信');
            this.updateCalendar();
        });
        
        // trade:deleted - トレード削除時
        this.#eventBus.on('trade:deleted', () => {
            console.log('MonthlyCalendarModule: trade:deleted イベント受信');
            this.updateCalendar();
        });
        
        // yenProfitLoss:saved - 円建て損益保存時
        this.#eventBus.on('yenProfitLoss:saved', () => {
            console.log('MonthlyCalendarModule: yenProfitLoss:saved イベント受信');
            this.updateCalendar();
        });
        
        // exit:added - 決済追加時
        this.#eventBus.on('exit:added', () => {
            console.log('MonthlyCalendarModule: exit:added イベント受信');
            this.updateCalendar();
        });
        
        // 登録完了フラグを設定
        window.calendarListenersRegistered = true;
        
        console.log('  - EventBusリスナー登録完了 ✅');
        console.log('    - trade:added');
        console.log('    - trade:updated');
        console.log('    - trade:deleted');
        console.log('    - yenProfitLoss:saved');
        console.log('    - exit:added');
    }
    
    /**
     * EventBus経由でイベント発火
     * @private
     * @param {string} eventName - イベント名
     * @param {*} data - イベントデータ
     */
    #emitEvent(eventName, data = null) {
        if (this.#eventBus) {
            this.#eventBus.emit(eventName, data);
            console.log(`MonthlyCalendarModule: イベント発火 - ${eventName}`);
        }
    }
}

// ========== グローバル登録 ==========
window.MonthlyCalendarModule = new MonthlyCalendarModule();

// デバッグ出力
console.log('MonthlyCalendarModule: ロード完了');
console.log('  - ステータス:', window.MonthlyCalendarModule.getStatus());