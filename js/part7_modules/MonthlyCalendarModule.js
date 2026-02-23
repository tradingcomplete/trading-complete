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
            this.#injectCalendarStyles();
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
     * 日別トレード一覧モーダル表示
     * @public
     * @param {string} date - 日付（YYYY-MM-DD）
     */
    showDayTradesModal(date) {
        console.log('MonthlyCalendarModule.showDayTradesModal:', date);
        this.#renderDayTradesModal(date);
    }
    
    /**
     * 日別トレード一覧モーダルを閉じる
     * @public
     */
    closeDayTradesModal() {
        const modal = document.getElementById('dayTradesModal');
        if (modal) {
            modal.remove();
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
     * カレンダーv5スタイルを注入
     * @private
     */
    #injectCalendarStyles() {
        if (document.getElementById('calendarV5Styles')) return;
        
        const style = document.createElement('style');
        style.id = 'calendarV5Styles';
        style.textContent = `
            /* ==========================================
               カレンダーセル背景色（Green/Red + Cyber FX）
               ========================================== */
            
            /* セル共通 */
            .calendar-day-cell {
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }
            
            /* 勝ち日 - Green */
            .calendar-day-cell.cal-win {
                background: linear-gradient(
                    135deg,
                    rgba(0, 255, 136, 0.30) 0%,
                    rgba(0, 255, 136, 0.15) 100%
                ) !important;
                border-color: rgba(0, 255, 136, 0.45) !important;
            }
            
            /* 負け日 - Red */
            .calendar-day-cell.cal-loss {
                background: linear-gradient(
                    135deg,
                    rgba(255, 68, 102, 0.35) 0%,
                    rgba(255, 68, 102, 0.18) 100%
                ) !important;
                border-color: rgba(255, 68, 102, 0.50) !important;
            }
            
            /* ホバー: ゴールドグロー */
            .calendar-day-cell.cal-win:hover,
            .calendar-day-cell.cal-loss:hover {
                box-shadow: 0 0 15px var(--gold-glow);
                border-color: var(--gold) !important;
                transform: translateY(-2px);
            }
            
            /* 上辺サイバーライン（常時表示） */
            .calendar-day-cell.cal-win::before,
            .calendar-day-cell.cal-loss::before {
                content: '';
                position: absolute;
                top: 0;
                left: 10%;
                right: 10%;
                height: 2px;
                opacity: 0.6;
            }
            
            .calendar-day-cell.cal-win::before {
                background: linear-gradient(90deg, transparent, #00ff88, transparent);
            }
            
            .calendar-day-cell.cal-loss::before {
                background: linear-gradient(90deg, transparent, #ff4466, transparent);
            }
            
            /* ゴールドシマー（常時アニメーション） */
            .calendar-day-cell.cal-win::after,
            .calendar-day-cell.cal-loss::after {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 60%;
                height: 2px;
                background: linear-gradient(90deg, transparent, var(--gold-bright), var(--gold), transparent);
                animation: calGoldShimmer 6s ease-in-out infinite;
                opacity: 0;
            }
            
            /* セルごとにアニメーションをずらす */
            .calendar-day-cell.cal-win::after { animation-delay: 0s; }
            .calendar-day-cell.cal-loss::after { animation-delay: 3s; }
            
            @keyframes calGoldShimmer {
                0% { left: -60%; opacity: 0; }
                8% { opacity: 0.9; }
                35% { left: 100%; opacity: 0.9; }
                45% { left: 100%; opacity: 0; }
                100% { left: 100%; opacity: 0; }
            }
            
            /* 損益テキスト色 */
            .calendar-day-profit.positive {
                color: #00ff88 !important;
            }
            
            .calendar-day-profit.negative {
                color: #ff4466 !important;
            }
            
            /* ==========================================
               日別トレードモーダル
               ========================================== */
            
            /* サマリーボックス */
            .day-trades-summary {
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
                padding: 12px 16px;
                margin-bottom: 16px;
                text-align: center;
            }
            
            .day-trades-summary-label {
                color: #7a8599;
                font-size: 13px;
                margin-bottom: 4px;
            }
            
            .day-trades-summary-value {
                font-size: 22px;
                font-weight: bold;
            }
            
            /* トレードカード */
            .day-trade-card {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 12px 16px;
                margin-bottom: 8px;
                cursor: pointer;
                transition: background 0.2s;
            }
            
            .day-trade-card:hover {
                background: rgba(255, 255, 255, 0.07);
            }
            
            .day-trade-pair {
                font-weight: bold;
                font-size: 15px;
                color: #e0e0e0;
            }
            
            .day-trade-direction {
                font-size: 13px;
                margin-left: 8px;
            }
            
            .day-trade-lot {
                color: #7a8599;
                font-size: 12px;
                margin-left: 8px;
            }
            
            .day-trade-profit {
                font-weight: bold;
                font-size: 15px;
            }
            
            .day-trade-pips {
                color: #7a8599;
                font-size: 12px;
            }
            
            .day-trades-empty {
                text-align: center;
                padding: 40px 20px;
                color: #7a8599;
            }
            
            /* ==========================================
               ライトモード対応
               ========================================== */
            
            body.light-mode .day-trades-summary {
                background: rgba(0, 0, 0, 0.04);
            }
            
            body.light-mode .day-trades-summary-label {
                color: #666666;
            }
            
            body.light-mode .day-trade-card {
                background: rgba(0, 0, 0, 0.03);
                border-color: rgba(0, 0, 0, 0.12);
            }
            
            body.light-mode .day-trade-card:hover {
                background: rgba(0, 0, 0, 0.07);
            }
            
            body.light-mode .day-trade-pair {
                color: #333333;
            }
            
            body.light-mode .day-trade-lot {
                color: #666666;
            }
            
            body.light-mode .day-trade-pips {
                color: #666666;
            }
            
            body.light-mode .day-trades-empty {
                color: #888888;
            }
        `;
        document.head.appendChild(style);
        
        console.log('MonthlyCalendarModule: v5カレンダースタイル注入完了');
    }
    
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
            
            // v5カラーシステム: Win=Blue / Loss=Red
            if (profit > 0) {
                classes += ' cal-win';
            } else if (profit < 0) {
                classes += ' cal-loss';
            }
            
            content += `
                <div class="calendar-day-profit ${profitClass}">${profitK}</div>
                <div class="calendar-day-count">${count}件</div>
            `;
            
            // クリックイベントを設定
            const onclick = `window.MonthlyCalendarModule.showDayTradesModal('${dateKey}')`;
            
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
     * 日別トレード一覧モーダルを描画
     * @private
     * @param {string} date - 日付（YYYY-MM-DD）
     */
    #renderDayTradesModal(date) {
        // 既存モーダルがあれば削除
        this.closeDayTradesModal();
        
        if (!this.#tradeManager) {
            console.warn('MonthlyCalendarModule: TradeManager未設定');
            return;
        }
        
        // 該当日の決済済みトレードを取得
        const allTrades = this.#tradeManager.getAllTrades();
        const dayTrades = allTrades.filter(trade => {
            if (!trade.exits || trade.exits.length === 0) return false;
            const lastExit = trade.exits[trade.exits.length - 1];
            const exitDate = lastExit.time.split('T')[0];
            return exitDate === date;
        });
        
        // 日付フォーマット
        const [year, month, day] = date.split('-');
        const dateFormatted = `${parseInt(year)}年${parseInt(month)}月${parseInt(day)}日`;
        
        // 合計損益を計算
        let totalProfit = 0;
        dayTrades.forEach(trade => {
            totalProfit += trade.yenProfitLoss?.netProfit || 0;
        });
        
        const profitFormatted = this.#formatYen(totalProfit);
        const profitColor = totalProfit >= 0 ? '#00ff88' : '#ff4466';
        
        // トレードカードHTMLを生成
        let tradesHTML = '';
        
        if (dayTrades.length === 0) {
            tradesHTML = `
                <div class="day-trades-empty">
                    この日に決済したトレードはありません
                </div>
            `;
        } else {
            dayTrades.forEach(trade => {
                const netProfit = trade.yenProfitLoss?.netProfit || 0;
                const pips = this.#calculateTradePipsForModal(trade);
                const cardColor = netProfit >= 0 ? '#00ff88' : '#ff4466';
                const directionLabel = (trade.direction === 'buy' || trade.direction === 'long') ? 'LONG' : 'SHORT';
                const directionColor = (trade.direction === 'buy' || trade.direction === 'long') ? '#00ff88' : '#ff4466';
                
                tradesHTML += `
                    <div class="day-trade-card" 
                         onclick="window.showTradeDetail('${trade.id}')"
                         style="border-left: 3px solid ${cardColor};">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span class="day-trade-pair">${trade.pair}</span>
                                <span class="day-trade-direction" style="color: ${directionColor};">${directionLabel}</span>
                                <span class="day-trade-lot">${trade.lotSize}L</span>
                            </div>
                            <div style="text-align: right;">
                                <div class="day-trade-profit" style="color: ${cardColor};">${this.#formatYen(netProfit)}</div>
                                <div class="day-trade-pips">${pips >= 0 ? '+' : ''}${pips.toFixed(1)} pips</div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        // モーダルを動的生成
        const modal = document.createElement('div');
        modal.id = 'dayTradesModal';
        modal.className = 'modal';
        modal.style.display = 'flex';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>${dateFormatted} のトレード</h2>
                    <button class="modal-close" onclick="window.closeDayTradesModal()">×</button>
                </div>
                <div style="padding: 0 5px;">
                    <!-- 日次サマリー -->
                    <div class="day-trades-summary">
                        <div class="day-trades-summary-label">日次損益（${dayTrades.length}件）</div>
                        <div class="day-trades-summary-value" style="color: ${profitColor};">${profitFormatted}</div>
                    </div>
                    
                    <!-- トレード一覧 -->
                    <div style="max-height: 400px; overflow-y: auto;">
                        ${tradesHTML}
                    </div>
                </div>
            </div>
        `;
        
        // モーダル背景クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeDayTradesModal();
            }
        });
        
        document.body.appendChild(modal);
        
        console.log(`  - モーダル表示: ${dateFormatted} (${dayTrades.length}件)`);
    }
    
    /**
     * モーダル用Pips計算（簡易版）
     * @private
     * @param {Object} trade - トレードオブジェクト
     * @returns {number} Pips
     */
    #calculateTradePipsForModal(trade) {
        try {
            if (typeof window.calculateTradePips === 'function') {
                return window.calculateTradePips(trade);
            }
            // フォールバック: exits から計算
            if (!trade.exits || trade.exits.length === 0) return 0;
            let totalPips = 0;
            trade.exits.forEach(exit => {
                totalPips += exit.pips || 0;
            });
            return totalPips;
        } catch (e) {
            return 0;
        }
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

// 日別トレードモーダル用グローバル関数
window.closeDayTradesModal = function() {
    window.MonthlyCalendarModule?.closeDayTradesModal();
};

// デバッグ出力
console.log('MonthlyCalendarModule: ロード完了');
console.log('  - ステータス:', window.MonthlyCalendarModule.getStatus());