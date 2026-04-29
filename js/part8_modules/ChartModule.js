/**
 * @module ChartModule
 * @description グラフ描画を管理するモジュール
 * @author AI Assistant / コンパナ
 * @version 1.0.0
 * @important UIの変更は原則禁止。見た目は既存のまま維持すること。
 */
class ChartModule {
    // プライベートフィールド
    #tradeManager = null;
    #eventBus = null;
    #initialized = false;
    
    constructor() {
        // 依存の注入
        this.#tradeManager = window.TradeManager?.getInstance();
        this.#eventBus = window.eventBus;
        
        // 初期化
        this.#initialize();
    }
    
    // ================
    // Public API（外部公開）
    // ================
    
    /**
     * 月次パフォーマンスチャートを更新
     * @public
     * @returns {void}
     */
    updateMonthlyPerformanceChart() {
        try {
            const canvas = document.getElementById('monthlyChart');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const container = canvas.parentElement;
            
            // キャンバスサイズの確実な設定
            requestAnimationFrame(() => {
                // Canvas設定（親要素の幅に合わせる）
                const parentWidth = canvas.parentElement.clientWidth;
                
                // 高さは固定値を使用（親要素の高さを使うとタブ切り替え時に拡大する問題を回避）
                const CHART_HEIGHT = 500;

                // CSSで表示サイズを設定
                canvas.style.width = parentWidth + 'px';
                
                // 全期間表示でモバイルの場合は高さを拡大
                const isMobileView = parentWidth < 500;
                const requiredHeight = (isMobileView && window.currentChartView === 'allTime') ? 500 : CHART_HEIGHT;
                canvas.style.height = requiredHeight + 'px';

                // 内部解像度設定
                // TODO: 計算ロジック検証_要件定義書 WARNING W7 (高DPI対応) は
                //       canvas.width/height の参照箇所が多数あり、安全に DPR 対応するには
                //       全描画コードのリファクタが必要。リリース後 v1.1 にて対応予定。
                //       現状は CSS pixel = 内部 pixel で動作（Retina 等で若干ぼやけるが機能影響なし）。
                canvas.width = parentWidth;
                canvas.height = requiredHeight;
                
                // TradeManagerから最新データを取得
                const tradesData = this.#tradeManager?.getAllTrades() || [];
                
                // データが存在しない場合の処理
                if (!tradesData || tradesData.length === 0) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#7a8599';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('トレードデータがありません', canvas.width / 2, canvas.height / 2);
                    return;
                }
                
                // 現在のビューに応じて描画
                switch(window.currentChartView) {
                    case 'yearly':
                        this.drawYearlyChart(tradesData);
                        break;
                    case 'allTime':
                        this.drawAllTimeSummary(tradesData);
                        break;
                    default:
                        this.drawMonthlyChartOriginal(tradesData);
                }
            });
            
        } catch (error) {
            console.error('ChartModule.updateMonthlyPerformanceChart error:', error);
        }
    }
    
    /**
     * 月次チャートを描画（オリジナル）
     * @public
     * @param {Array} tradesData - トレードデータ配列（オプション）
     * @returns {void}
     */
    drawMonthlyChartOriginal(tradesData) {
        try {
            // 引数がない場合はTradeManagerから取得
            const trades = tradesData || this.#tradeManager?.getAllTrades() || [];
            
            // 元のグラフ描画ロジック（決済日時ベース）
            const canvas = document.getElementById('monthlyChart');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            
            // ライトモードかどうかの判定
            const isLightMode = document.body.classList.contains('light-mode');
            
            // データ集計（過去12ヶ月、決済日時ベース）
            const now = new Date();
            const monthlyData = [];
            const monthLabels = [];
            
            for (let i = 11; i >= 0; i--) {
                const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const year = targetDate.getFullYear();
                const month = targetDate.getMonth();
                
                const monthTrades = trades.filter(t => {
                    if (t.exits && t.exits.length > 0) {
                        const exitDate = new Date(t.exits[t.exits.length - 1].time);
                        return exitDate.getFullYear() === year && 
                               exitDate.getMonth() === month;
                    }
                    return false;
                });
                
                let monthPips = 0;
                monthTrades.forEach(t => {
                    monthPips += window.calculateTradePips(t);
                });
                
                monthlyData.push(monthPips);
                monthLabels.push(`${year}/${month + 1}`);
            }
            
            // クリア
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // レスポンシブ設定（実際の表示サイズで判定）
            const displayWidth = canvas.clientWidth || canvas.width;
            const isMobileChart = displayWidth < 500;
            
            // 累積Pips計算（スケール決定用に先に計算）
            let tempCumulative = 0;
            const cumulativeData = monthlyData.map(pips => {
                tempCumulative += pips;
                return tempCumulative;
            });
            
            // 月間Pipsと累積Pipsの両方を考慮してスケールを決定
            const maxMonthly = Math.max(...monthlyData.map(Math.abs), 100);
            const maxCumulative = Math.max(...cumulativeData.map(Math.abs), 100);
            const maxValue = Math.max(maxMonthly, maxCumulative);
            
            // グラフ描画（モバイルは余白を減らす）
            const padding = isMobileChart ? 35 : 60;
            const pointSpacing = (canvas.width - padding * 2) / (monthlyData.length - 1);
            const scale = (canvas.height - padding * 2) / (maxValue * 2);
            const centerY = canvas.height / 2;
            
            // 軸描画
            ctx.strokeStyle = isLightMode ? '#999' : 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding, padding);
            ctx.lineTo(padding, canvas.height - padding);
            ctx.lineTo(canvas.width - padding, canvas.height - padding);
            ctx.stroke();
            
            // 中心線
            ctx.strokeStyle = isLightMode ? '#aaa' : '#666';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(padding, centerY);
            ctx.lineTo(canvas.width - padding, centerY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // 月別バー（モバイルはバー幅を調整）
            monthlyData.forEach((pips, i) => {
                const x = padding + i * pointSpacing;
                const barHeight = Math.abs(pips) * scale;
                const barWidth = Math.min(pointSpacing * 0.6, isMobileChart ? 20 : 30);
                
                // ライトモード時は濃い緑を使用
                if (isLightMode) {
                    ctx.fillStyle = pips >= 0 ? 'rgba(0, 153, 90, 0.7)' : 'rgba(221, 51, 51, 0.7)';
                } else {
                    ctx.fillStyle = pips >= 0 ? 'rgba(0, 255, 136, 0.6)' : 'rgba(255, 68, 68, 0.6)';
                }
                
                if (pips >= 0) {
                    ctx.fillRect(x - barWidth / 2, centerY - barHeight, barWidth, barHeight);
                } else {
                    ctx.fillRect(x - barWidth / 2, centerY, barWidth, barHeight);
                }
                
                // 値表示（モバイル対応）
                if (pips !== 0) {
                    if (isLightMode) {
                        ctx.fillStyle = pips >= 0 ? '#00995a' : '#dd3333';
                    } else {
                        ctx.fillStyle = pips >= 0 ? '#00ff88' : '#ff4444';
                    }
                    ctx.font = isMobileChart ? '8px Arial' : '10px Arial';
                    ctx.textAlign = 'center';
                    const textY = pips >= 0 ? centerY - barHeight - (isMobileChart ? 3 : 5) : centerY + barHeight + (isMobileChart ? 12 : 15);
                    ctx.fillText(`${pips.toFixed(0)}`, x, textY);
                }
            });
            
            // 累積ライン描画（ライトモード時はオレンジ）
            ctx.strokeStyle = isLightMode ? '#ffa500' : '#ffd700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            cumulativeData.forEach((cumPips, i) => {
                const x = padding + i * pointSpacing;
                const y = centerY - (cumPips * scale);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            
            // 累積ポイント
            cumulativeData.forEach((cumPips, i) => {
                const x = padding + i * pointSpacing;
                const y = centerY - (cumPips * scale);
                
                ctx.fillStyle = isLightMode ? '#ffa500' : '#ffd700';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            });
            
            // ラベル（3ヶ月ごと）- モバイル対応
            ctx.fillStyle = isLightMode ? '#000' : '#fff';
            ctx.font = isMobileChart ? '9px Arial' : '11px Arial';
            ctx.textAlign = 'center';
            monthLabels.forEach((label, i) => {
                if (i % 3 === 0 || i === monthLabels.length - 1) {
                    const x = padding + i * pointSpacing;
                    ctx.fillText(label, x, canvas.height - padding + (isMobileChart ? 15 : 20));
                }
            });
            
            // Y軸ラベル - モバイル対応
            ctx.font = isMobileChart ? '9px Arial' : '11px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`+${maxValue.toFixed(0)}`, padding - (isMobileChart ? 5 : 10), padding);
            ctx.fillText('0', padding - (isMobileChart ? 5 : 10), centerY);
            ctx.fillText(`-${maxValue.toFixed(0)}`, padding - (isMobileChart ? 5 : 10), canvas.height - padding);
            
            // 凡例（レスポンシブ対応）
            ctx.textAlign = 'left';
            const legendFontSize = isMobileChart ? 10 : 12;
            const legendX = isMobileChart ? canvas.width - 100 : canvas.width - 150;
            const legendTextX = isMobileChart ? canvas.width - 85 : canvas.width - 130;
            ctx.font = `${legendFontSize}px Arial`;
            
            // 月間Pipsの凡例（濃い緑）
            if (isLightMode) {
                ctx.fillStyle = 'rgba(0, 153, 90, 0.7)';
            } else {
                ctx.fillStyle = 'rgba(0, 255, 136, 0.6)';
            }
            ctx.fillRect(legendX, 20, isMobileChart ? 12 : 15, isMobileChart ? 12 : 15);
            ctx.fillStyle = isLightMode ? '#00995a' : '#fff';
            ctx.fillText(isMobileChart ? '月間Pips' : '月間Pips（決済日ベース）', legendTextX, 30);
            
            // 累積Pipsの凡例（オレンジ）
            ctx.strokeStyle = isLightMode ? '#ffa500' : '#ffd700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(legendX, isMobileChart ? 42 : 47);
            ctx.lineTo(legendX + 15, isMobileChart ? 42 : 47);
            ctx.stroke();
            ctx.fillStyle = isLightMode ? '#ffa500' : '#ffd700';
            ctx.fillText('累積Pips', legendTextX, isMobileChart ? 46 : 52);
            
        } catch (error) {
            console.error('ChartModule.drawMonthlyChartOriginal error:', error);
        }
    }
    
    /**
     * 年次チャートを描画
     * @public
     * @param {Array} tradesData - トレードデータ配列（オプション）
     * @returns {void}
     */
    drawYearlyChart(tradesData) {
        try {
            // 引数がない場合はTradeManagerから取得
            const trades = tradesData || this.#tradeManager?.getAllTrades() || [];
            
            // 内部メソッドを呼び出し
            this.#drawYearlyChartInternal(trades);
            
        } catch (error) {
            console.error('ChartModule.drawYearlyChart error:', error);
        }
    }
    
    /**
     * 全期間サマリーを描画
     * @public
     * @param {Array} tradesData - トレードデータ配列（オプション）
     * @returns {void}
     */
    drawAllTimeSummary(tradesData) {
        try {
            const canvas = document.getElementById('monthlyChart');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            
            // ※ Canvas設定は削除（updateMonthlyPerformanceChartで設定済み）
            
            // 引数がない場合はTradeManagerから取得
            const trades = tradesData || this.#tradeManager?.getAllTrades() || [];
            
            // 全期間の統計を計算
            const stats = this.#calculateAllTimeStats(trades);
            
            // サマリー描画
            this.#drawAllTimeSummaryContent(ctx, canvas, stats);
            
        } catch (error) {
            console.error('ChartModule.drawAllTimeSummary error:', error);
        }
    }
    
    /**
     * チャートビューを切り替え
     * @public
     * @param {string} view - ビュー名（monthly/yearly/allTime）
     * @returns {void}
     */
    switchChartView(view) {
        try {
            window.currentChartView = view;
            
            // ボタンのアクティブ状態を更新
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            if (event && event.target) {
                event.target.classList.add('active');
            }
            
            // グラフを再描画
            this.updateMonthlyPerformanceChart();
            
            // イベント発火
            this.#eventBus?.emit('chart:viewChanged', { view });
            
        } catch (error) {
            console.error('ChartModule.switchChartView error:', error);
        }
    }
    
    /**
     * チャートを強制的に再描画
     * @public
     * @returns {void}
     */
    refresh() {
        this.updateMonthlyPerformanceChart();
    }
    
    /**
     * デバッグ用：モジュールの状態を取得
     * @public
     * @returns {Object} モジュールの状態
     */
    getStatus() {
        return {
            initialized: this.#initialized,
            hasTradeManager: !!this.#tradeManager,
            hasEventBus: !!this.#eventBus,
            tradeCount: this.#tradeManager?.getAllTrades()?.length || 0,
            currentView: window.currentChartView || 'monthly'
        };
    }
    
    // ================
    // Private Methods（内部のみ）
    // ================
    
    /**
     * 初期化
     * @private
     */
    #initialize() {
        // EventBusにリスナー登録
        this.#bindEvents();
        
        // グローバル関数の置き換え
        this.#replaceGlobalFunctions();
        
        console.log('ChartModule initialized');
        this.#initialized = true;
    }
    
    /**
     * イベントバインド
     * @private
     */
    #bindEvents() {
        if (this.#eventBus) {
            // トレード追加/編集/削除時にチャートを自動更新
            this.#eventBus.on('trade:added', () => this.updateMonthlyPerformanceChart());
            this.#eventBus.on('trade:updated', () => this.updateMonthlyPerformanceChart());
            this.#eventBus.on('trade:deleted', () => this.updateMonthlyPerformanceChart());
            this.#eventBus.on('bulk:imported', () => this.updateMonthlyPerformanceChart());
            
            // レポート生成時にもチャートを更新
            this.#eventBus.on('report:generated', () => this.updateMonthlyPerformanceChart());
        }
    }
    
    /**
     * グローバル関数の置き換え
     * @private
     */
    #replaceGlobalFunctions() {
        // 既存の関数を保存
        if (typeof window.updateMonthlyPerformanceChart === 'function') {
            window.updateMonthlyPerformanceChart_original = window.updateMonthlyPerformanceChart;
        }
        if (typeof window.drawMonthlyChartOriginal === 'function') {
            window.drawMonthlyChartOriginal_actual = window.drawMonthlyChartOriginal;
        }
        if (typeof window.switchChartView === 'function') {
            window.switchChartView_original = window.switchChartView;
        }
        if (typeof window.drawYearlyChart === 'function') {
            window.drawYearlyChart_original = window.drawYearlyChart;
        }
        if (typeof window.drawAllTimeSummary === 'function') {
            window.drawAllTimeSummary_original = window.drawAllTimeSummary;
        }
        
        // 新しい関数で置き換え
        window.updateMonthlyPerformanceChart = () => this.updateMonthlyPerformanceChart();
        window.drawMonthlyChartOriginal = (trades) => this.drawMonthlyChartOriginal(trades);
        window.switchChartView = (view) => this.switchChartView(view);
        window.drawYearlyChart = (trades) => this.drawYearlyChart(trades);
        window.drawAllTimeSummary = (trades) => this.drawAllTimeSummary(trades);
    }
    
    /**
     * 年次チャートの内部実装（データ準備 + 描画）
     * @private
     * @param {Array} trades - トレードデータ配列
     */
    #drawYearlyChartInternal(trades) {
        const canvas = document.getElementById('monthlyChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;
        
        // Canvas設定
        const rect = container.getBoundingClientRect();
        canvas.width = Math.max(rect.width || 800, 800) - 40;
        canvas.height = 400;
        
        // 過去5年分のデータを集計（決済日時ベース）
        const now = new Date();
        const yearlyData = [];
        const yearLabels = [];
        
        for (let i = 4; i >= 0; i--) {
            const year = now.getFullYear() - i;
            const yearTrades = trades.filter(t => {
                if (t.exits && t.exits.length > 0) {
                    const exitDate = new Date(t.exits[t.exits.length - 1].time);
                    return exitDate.getFullYear() === year;
                }
                return false;
            });
            
            let yearPips = 0;
            yearTrades.forEach(t => {
                yearPips += this.#calculateTradePips(t);
            });
            
            yearlyData.push(yearPips);
            yearLabels.push(year.toString());
        }
        
        // グラフ描画処理
        this.#drawYearlyChartContent(ctx, canvas, yearlyData, yearLabels);
    }
    
    /**
     * 年次チャートの描画処理
     * @private
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {HTMLCanvasElement} canvas - Canvas要素
     * @param {Array<number>} yearlyData - 年別Pipsデータ
     * @param {Array<string>} yearLabels - 年ラベル
     */
    #drawYearlyChartContent(ctx, canvas, yearlyData, yearLabels) {
        const isLightMode = document.body.classList.contains('light-mode');
        // 実際の表示サイズで判定（canvas.widthではなくclientWidth）
        const displayWidth = canvas.clientWidth || canvas.width;
        const isMobile = displayWidth < 500;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // タイトル（レスポンシブ）
        ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
        ctx.font = isMobile ? 'bold 16px Arial' : 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(isMobile ? '年次パフォーマンス（過去5年）' : '年次パフォーマンス（過去5年・決済日ベース）', canvas.width / 2, 30);
        
        // グラフ描画設定（モバイルは余白を減らす）
        const padding = isMobile ? 45 : 60;
        const maxValue = Math.max(...yearlyData.map(Math.abs), 100);
        const barWidth = (canvas.width - padding * 2) / yearlyData.length * (isMobile ? 0.6 : 0.6);
        const scale = (canvas.height - padding * 2) / (maxValue * 2);
        const centerY = canvas.height / 2;
        
        // 軸描画
        ctx.strokeStyle = isLightMode ? '#999' : '#666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();
        
        // 中心線
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, centerY);
        ctx.lineTo(canvas.width - padding, centerY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 年別バー
        yearlyData.forEach((pips, i) => {
            const x = padding + (i + 0.5) * ((canvas.width - padding * 2) / yearlyData.length);
            const barHeight = Math.abs(pips) * scale;
            
            // ライトモード時は濃い緑を使用
            if (isLightMode) {
                ctx.fillStyle = pips >= 0 ? 'rgba(0, 153, 90, 0.7)' : 'rgba(221, 51, 51, 0.7)';
            } else {
                ctx.fillStyle = pips >= 0 ? 'rgba(0, 255, 136, 0.7)' : 'rgba(255, 68, 68, 0.7)';
            }
            
            if (pips >= 0) {
                ctx.fillRect(x - barWidth / 2, centerY - barHeight, barWidth, barHeight);
            } else {
                ctx.fillRect(x - barWidth / 2, centerY, barWidth, barHeight);
            }
            
            // 年ラベル（レスポンシブ）- 大きく太字で見やすく
            ctx.fillStyle = isLightMode ? '#000' : '#fff';
            ctx.font = isMobile ? 'bold 16px Arial' : '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(yearLabels[i], x, canvas.height - 10);
            
            // pips表示（レスポンシブ）- 太字で見やすく
            if (isLightMode) {
                ctx.fillStyle = pips >= 0 ? '#00995a' : '#dd3333';
            } else {
                ctx.fillStyle = pips >= 0 ? '#00ff88' : '#ff4444';
            }
            ctx.font = isMobile ? 'bold 15px Arial' : 'bold 12px Arial';
            const textY = pips >= 0 ? centerY - barHeight - 8 : centerY + barHeight + 18;
            ctx.fillText(`${pips.toFixed(0)}`, x, textY);
        });
        
        // Y軸ラベル（レスポンシブ）- 太字で見やすく
        ctx.fillStyle = isLightMode ? '#000' : '#fff';
        ctx.font = isMobile ? 'bold 12px Arial' : '11px Arial';
        ctx.textAlign = 'right';
        const yLabelOffset = isMobile ? 5 : 10;
        ctx.fillText(`+${maxValue.toFixed(0)}`, padding - yLabelOffset, padding + 5);
        ctx.fillText('0', padding - yLabelOffset, centerY + 4);
        ctx.fillText(`-${maxValue.toFixed(0)}`, padding - yLabelOffset, canvas.height - padding);
    }
    
    /**
     * トレードのPipsを計算
     * @private
     * @param {Object} trade - トレードオブジェクト
     * @returns {number} Pips
     */
    #calculateTradePips(trade) {
        if (!window.tradeCalculator) {
            console.warn('TradeCalculator not loaded');
            return 0;
        }
        return window.tradeCalculator.calculateTradePips(trade);
    }
    
    /**
     * 全期間統計の計算（拡張版）
     * @private
     * @param {Array} trades - トレードデータ配列
     * @returns {Object} 統計データ
     */
    #calculateAllTimeStats(trades) {
        if (!trades || trades.length === 0) {
            return {
                totalTrades: 0,
                totalPips: 0,
                startDate: null,
                yearlyAverage: 0,
                bestYear: null,
                worstYear: null,
                winRate: 0,
                profitFactor: 0,
                maxDrawdown: 0,
                avgTradesPerMonth: 0,
                avgHoldTime: 0,
                maxWinTrade: null,
                maxLossTrade: null,
                maxWinStreak: 0,
                maxLossStreak: 0,
                bestMonth: null,
                worstMonth: null,
                bestPair: null,
                bestWinRatePair: null
            };
        }
        
        const sortedTrades = trades.filter(t => t.exits && t.exits.length > 0)
                                   .sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
        
        if (sortedTrades.length === 0) {
            return {
                totalTrades: 0,
                totalPips: 0,
                startDate: null,
                yearlyAverage: 0,
                bestYear: null,
                worstYear: null,
                winRate: 0,
                profitFactor: 0,
                maxDrawdown: 0,
                avgTradesPerMonth: 0,
                avgHoldTime: 0,
                maxWinTrade: null,
                maxLossTrade: null,
                maxWinStreak: 0,
                maxLossStreak: 0,
                bestMonth: null,
                worstMonth: null,
                bestPair: null,
                bestWinRatePair: null
            };
        }
        
        const startDate = new Date(sortedTrades[0].entryTime);
        const endDate = new Date();
        const years = Math.max(1, endDate.getFullYear() - startDate.getFullYear() + 1);
        const months = Math.max(1, (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                                (endDate.getMonth() - startDate.getMonth()) + 1);
        
        let totalPips = 0;
        let totalWinPips = 0;
        let totalLossPips = 0;
        let wins = 0;
        let losses = 0;
        let currentWinStreak = 0;
        let currentLossStreak = 0;
        let maxWinStreak = 0;
        let maxLossStreak = 0;
        let maxWinTrade = null;
        let maxLossTrade = null;
        let totalHoldTime = 0;
        let maxDrawdown = 0;
        let peak = 0;
        let runningPips = 0;
        
        const yearlyPips = {};
        const monthlyPips = {};
        const pairStats = {};
        
        // 各トレードを処理
        sortedTrades.forEach(trade => {
            const pips = this.#calculateTradePips(trade);
            totalPips += pips;
            runningPips += pips;
            
            // ドローダウン計算
            if (runningPips > peak) {
                peak = runningPips;
            }
            const drawdown = peak - runningPips;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
            
            // 勝敗統計
            if (pips > 0) {
                wins++;
                totalWinPips += pips;
                currentWinStreak++;
                currentLossStreak = 0;
                maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
                
                if (!maxWinTrade || pips > maxWinTrade.pips) {
                    maxWinTrade = { trade, pips };
                }
            } else if (pips < 0) {
                losses++;
                totalLossPips += Math.abs(pips);
                currentLossStreak++;
                currentWinStreak = 0;
                maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
                
                if (!maxLossTrade || pips < maxLossTrade.pips) {
                    maxLossTrade = { trade, pips };
                }
            }
            
            // 保有時間
            const entryDate = new Date(trade.entryTime);
            const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
            totalHoldTime += (exitDate - entryDate);
            
            // 年別集計
            const year = entryDate.getFullYear();
            if (!yearlyPips[year]) {
                yearlyPips[year] = 0;
            }
            yearlyPips[year] += pips;
            
            // 月別集計
            const monthKey = `${year}-${entryDate.getMonth() + 1}`;
            if (!monthlyPips[monthKey]) {
                monthlyPips[monthKey] = 0;
            }
            monthlyPips[monthKey] += pips;
            
            // 通貨ペア統計
            if (!pairStats[trade.pair]) {
                pairStats[trade.pair] = { trades: 0, pips: 0, wins: 0 };
            }
            pairStats[trade.pair].trades++;
            pairStats[trade.pair].pips += pips;
            if (pips > 0) {
                pairStats[trade.pair].wins++;
            }
        });
        
        // 最高年・最低年を検出
        let bestYear = null;
        let worstYear = null;
        
        Object.entries(yearlyPips).forEach(([year, pips]) => {
            if (!bestYear || pips > bestYear.pips) {
                bestYear = { year: parseInt(year), pips: pips };
            }
            if (!worstYear || pips < worstYear.pips) {
                worstYear = { year: parseInt(year), pips: pips };
            }
        });
        
        // 最高月・最低月を検出
        let bestMonth = null;
        let worstMonth = null;
        
        Object.entries(monthlyPips).forEach(([monthKey, pips]) => {
            if (!bestMonth || pips > bestMonth.pips) {
                bestMonth = { month: monthKey, pips: pips };
            }
            if (!worstMonth || pips < worstMonth.pips) {
                worstMonth = { month: monthKey, pips: pips };
            }
        });
        
        // 最高通貨ペア（Pips基準）
        let bestPair = null;
        Object.entries(pairStats).forEach(([pair, stats]) => {
            if (!bestPair || stats.pips > bestPair.pips) {
                bestPair = { pair, ...stats };
            }
        });
        
        // 最高勝率通貨ペア
        let bestWinRatePair = null;
        Object.entries(pairStats).forEach(([pair, stats]) => {
            const winRate = stats.trades > 0 ? stats.wins / stats.trades : 0;
            if (!bestWinRatePair || winRate > bestWinRatePair.winRate) {
                bestWinRatePair = { pair, winRate, ...stats };
            }
        });
        
        const winRate = sortedTrades.length > 0 ? (wins / sortedTrades.length * 100) : 0;
        const profitFactor = totalLossPips > 0 ? totalWinPips / totalLossPips : totalWinPips > 0 ? 999 : 0;
        const avgHoldTime = sortedTrades.length > 0 ? totalHoldTime / sortedTrades.length : 0;
        const avgTradesPerMonth = months > 0 ? sortedTrades.length / months : 0;
        
        // 新規追加: 平均利益・損失pips
        const avgWinPips = wins > 0 ? totalWinPips / wins : 0;
        const avgLossPips = losses > 0 ? totalLossPips / losses : 0;
        
        // 新規追加: リスクリワード
        const riskReward = avgLossPips > 0 ? avgWinPips / avgLossPips : avgWinPips > 0 ? 999 : 0;
        
        // 新規追加: 期待値(pips)
        const lossRate = sortedTrades.length > 0 ? (losses / sortedTrades.length * 100) : 0;
        const expectancyPips = (avgWinPips * winRate / 100) - (avgLossPips * lossRate / 100);
        
        // 円建て統計の取得
        let yenStats = {
            totalProfit: 0,
            avgWinAmount: 0,
            avgLossAmount: 0,
            maxWinAmount: 0,
            maxLossAmount: 0,
            profitRate: 0,
            expectancyYen: 0
        };
        
        // trade.yenProfitLoss から直接取得（MODULES.md準拠）
        let totalWinAmount = 0;
        let totalLossAmount = 0;
        let maxWinAmount = 0;
        let maxLossAmount = 0;
        let yenWinCount = 0;
        let yenLossCount = 0;
        
        sortedTrades.forEach(trade => {
            const yenData = trade.yenProfitLoss;
            if (yenData && yenData.netProfit !== null && yenData.netProfit !== undefined) {
                const netProfit = parseFloat(yenData.netProfit) || 0;
                yenStats.totalProfit += netProfit;
                
                if (netProfit > 0) {
                    totalWinAmount += netProfit;
                    yenWinCount++;
                    if (netProfit > maxWinAmount) maxWinAmount = netProfit;
                } else if (netProfit < 0) {
                    totalLossAmount += Math.abs(netProfit);
                    yenLossCount++;
                    if (Math.abs(netProfit) > maxLossAmount) maxLossAmount = Math.abs(netProfit);
                }
            }
        });
        
        yenStats.avgWinAmount = yenWinCount > 0 ? totalWinAmount / yenWinCount : 0;
        yenStats.avgLossAmount = yenLossCount > 0 ? totalLossAmount / yenLossCount : 0;
        yenStats.maxWinAmount = maxWinAmount;
        yenStats.maxLossAmount = maxLossAmount;
        yenStats.profitRate = totalWinAmount > 0 ? (yenStats.totalProfit / totalWinAmount * 100) : 0;
        yenStats.expectancyYen = (yenStats.avgWinAmount * winRate / 100) - (yenStats.avgLossAmount * lossRate / 100);
        
        return {
            totalTrades: sortedTrades.length,
            totalPips: totalPips,
            startDate: startDate,
            yearlyAverage: totalPips / years,
            bestYear: bestYear,
            worstYear: worstYear,
            winRate: winRate,
            profitFactor: profitFactor,
            maxDrawdown: maxDrawdown,
            avgTradesPerMonth: avgTradesPerMonth,
            avgHoldTime: avgHoldTime,
            maxWinTrade: maxWinTrade,
            maxLossTrade: maxLossTrade,
            maxWinStreak: maxWinStreak,
            maxLossStreak: maxLossStreak,
            bestMonth: bestMonth,
            worstMonth: worstMonth,
            bestPair: bestPair,
            bestWinRatePair: bestWinRatePair,
            // 新規追加項目
            winsCount: wins,
            lossesCount: losses,
            avgWinPips: avgWinPips,
            avgLossPips: avgLossPips,
            riskReward: riskReward,
            expectancyPips: expectancyPips,
            // 円建て統計
            yenStats: yenStats
        };
    }
    
    /**
     * 全期間サマリーの描画（拡張版・4列レイアウト）
     * @private
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {HTMLCanvasElement} canvas - Canvas要素
     * @param {Object} stats - 統計データ
     * @returns {void}
     */
    #drawAllTimeSummaryContent(ctx, canvas, stats) {
        const isLightMode = document.body.classList.contains('light-mode');
        // 実際の表示サイズで判定（canvas.widthではなくclientWidth）
        const displayWidth = canvas.clientWidth || canvas.width;
        const isMobile = displayWidth < 500;
        const isSmallMobile = displayWidth < 360;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (stats.totalTrades === 0) {
            ctx.fillStyle = isLightMode ? '#666' : '#7a8599';
            ctx.font = isMobile ? '14px Arial' : '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('トレードデータがありません', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        // タイトル（レスポンシブ）
        ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
        ctx.font = isMobile ? 'bold 20px Arial' : 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(isMobile ? '全期間トレーディングサマリー' : '全期間トレーディングサマリー（完全版）', canvas.width / 2, isMobile ? 20 : 40);
        
        // 期間表示（レスポンシブ）
        ctx.font = isMobile ? '11px Arial' : '16px Arial';
        ctx.fillStyle = isLightMode ? '#666' : '#aaa';
        const endDate = new Date();
        const tradingDays = Math.floor((endDate - stats.startDate) / (1000 * 60 * 60 * 24));
        
        const startDateStr = typeof window.formatDateForDisplay === 'function' 
            ? window.formatDateForDisplay(stats.startDate)
            : stats.startDate.toLocaleDateString('ja-JP');
        const endDateStr = typeof window.formatDateForDisplay === 'function'
            ? window.formatDateForDisplay(endDate)
            : endDate.toLocaleDateString('ja-JP');
        
        ctx.fillText(`${startDateStr} ～ ${endDateStr} (${tradingDays}日間)`, canvas.width / 2, isMobile ? 36 : 68);
        
        // 累積成績（レスポンシブ）
        const pipsColor = stats.totalPips >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
        ctx.fillStyle = pipsColor;
        ctx.font = isMobile ? 'bold 28px Arial' : 'bold 36px Arial';
        ctx.fillText(`${stats.totalPips >= 0 ? '+' : ''}${stats.totalPips.toFixed(1)} pips`, canvas.width / 2, isMobile ? 62 : 110);
        
        ctx.fillStyle = isLightMode ? '#000' : '#fff';
        ctx.font = isMobile ? '10px Arial' : '14px Arial';
        ctx.fillText(`(年平均: ${stats.yearlyAverage >= 0 ? '+' : ''}${stats.yearlyAverage.toFixed(1)} pips)`, canvas.width / 2, isMobile ? 76 : 132);
        
        // ========== モバイル用2列レイアウト（全項目表示） ==========
        if (isMobile) {
            const col1X = canvas.width * 0.03;
            const col2X = canvas.width * 0.52;
            let startY = 105;  // ヘッダーとの余白を追加（95→105）
            const lineHeight = isSmallMobile ? 21 : 23;  // 項目間
            const sectionGap = isSmallMobile ? 38 : 44;  // セクション間（lineHeightの約2倍）
            
            ctx.textAlign = 'left';
            
            // ========== 第1列：基本統計 + Pips統計 ==========
            let y1 = startY;
            ctx.font = isSmallMobile ? 'bold 14px Arial' : 'bold 15px Arial';
            ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
            ctx.fillText('📊 基本統計', col1X, y1);
            y1 += lineHeight;
            
            this.#drawStatItemMobile(ctx, col1X, y1, '総トレード:', `${stats.totalTrades}回`, isLightMode, isSmallMobile);
            y1 += lineHeight;
            this.#drawStatItemMobile(ctx, col1X, y1, '勝ちトレード:', `${stats.winsCount}回`, isLightMode, isSmallMobile, isLightMode ? '#00995a' : '#00ff88');
            y1 += lineHeight;
            this.#drawStatItemMobile(ctx, col1X, y1, '負けトレード:', `${stats.lossesCount}回`, isLightMode, isSmallMobile, isLightMode ? '#dd3333' : '#ff4444');
            y1 += lineHeight;
            const wrColorMobile = stats.winRate >= 50 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItemMobile(ctx, col1X, y1, '勝率:', `${stats.winRate.toFixed(1)}%`, isLightMode, isSmallMobile, wrColorMobile);
            y1 += lineHeight;
            const pfColorMobile = stats.profitFactor >= 2.0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItemMobile(ctx, col1X, y1, 'PF:', stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2), isLightMode, isSmallMobile, pfColorMobile);
            y1 += lineHeight;
            const expColorMobile = stats.expectancyPips >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItemMobile(ctx, col1X, y1, '期待値:', `${stats.expectancyPips >= 0 ? '+' : ''}${stats.expectancyPips.toFixed(1)}p`, isLightMode, isSmallMobile, expColorMobile);
            
            y1 += sectionGap;  // セクション間の余白
            ctx.font = isSmallMobile ? 'bold 14px Arial' : 'bold 15px Arial';
            ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
            ctx.fillText('📈 Pips統計', col1X, y1);
            y1 += lineHeight;
            
            const totalPipsColorMobile = stats.totalPips >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItemMobile(ctx, col1X, y1, '総獲得:', `${stats.totalPips >= 0 ? '+' : ''}${stats.totalPips.toFixed(1)}p`, isLightMode, isSmallMobile, totalPipsColorMobile);
            y1 += lineHeight;
            this.#drawStatItemMobile(ctx, col1X, y1, '平均利益:', `+${stats.avgWinPips.toFixed(1)}p`, isLightMode, isSmallMobile, isLightMode ? '#00995a' : '#00ff88');
            y1 += lineHeight;
            this.#drawStatItemMobile(ctx, col1X, y1, '平均損失:', `-${stats.avgLossPips.toFixed(1)}p`, isLightMode, isSmallMobile, isLightMode ? '#dd3333' : '#ff4444');
            y1 += lineHeight;
            const rrColorMobile = stats.riskReward >= 2.0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            const rrTextMobile = stats.riskReward >= 999 ? '∞' : stats.riskReward.toFixed(2);
            this.#drawStatItemMobile(ctx, col1X, y1, 'RR:', rrTextMobile, isLightMode, isSmallMobile, rrColorMobile);
            y1 += lineHeight;
            if (stats.maxWinTrade) {
                this.#drawStatItemMobile(ctx, col1X, y1, '最大利益:', `+${stats.maxWinTrade.pips.toFixed(1)}p`, isLightMode, isSmallMobile, isLightMode ? '#00995a' : '#00ff88');
            }
            y1 += lineHeight;
            if (stats.maxLossTrade) {
                this.#drawStatItemMobile(ctx, col1X, y1, '最大損失:', `${stats.maxLossTrade.pips.toFixed(1)}p`, isLightMode, isSmallMobile, isLightMode ? '#dd3333' : '#ff4444');
            }
            y1 += lineHeight;
            this.#drawStatItemMobile(ctx, col1X, y1, '最大DD:', `${stats.maxDrawdown.toFixed(1)}p`, isLightMode, isSmallMobile, isLightMode ? '#dd3333' : '#ff4444');
            
            // ========== 第2列：パフォーマンス + 円建て ==========
            let y2 = startY;
            ctx.font = isSmallMobile ? 'bold 14px Arial' : 'bold 15px Arial';
            ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
            ctx.fillText('⚡ パフォーマンス', col2X, y2);
            y2 += lineHeight;
            
            this.#drawStatItemMobile(ctx, col2X, y2, '最大連勝:', `${stats.maxWinStreak}回`, isLightMode, isSmallMobile, isLightMode ? '#00995a' : '#00ff88');
            y2 += lineHeight;
            this.#drawStatItemMobile(ctx, col2X, y2, '最大連敗:', `${stats.maxLossStreak}回`, isLightMode, isSmallMobile, isLightMode ? '#dd3333' : '#ff4444');
            y2 += lineHeight;
            const avgHoursMobile = stats.avgHoldTime ? Math.floor(stats.avgHoldTime / (1000 * 60 * 60)) : 0;
            const avgDaysMobile = Math.floor(avgHoursMobile / 24);
            const displayHoursMobile = avgHoursMobile % 24;
            const avgHoldTimeStrMobile = avgDaysMobile > 0 ? `${avgDaysMobile}日${displayHoursMobile}h` : `${avgHoursMobile}h`;
            this.#drawStatItemMobile(ctx, col2X, y2, '平均保有:', avgHoldTimeStrMobile, isLightMode, isSmallMobile);
            y2 += lineHeight;
            if (stats.bestYear) {
                this.#drawStatItemMobile(ctx, col2X, y2, '最高年:', `${stats.bestYear.year}年(+${stats.bestYear.pips.toFixed(0)}p)`, isLightMode, isSmallMobile, isLightMode ? '#00995a' : '#00ff88');
                y2 += lineHeight;
            }
            if (stats.worstYear && stats.bestYear && !isNaN(stats.worstYear.year) && !isNaN(stats.bestYear.year) && stats.worstYear.year !== stats.bestYear.year) {
                this.#drawStatItemMobile(ctx, col2X, y2, '最低年:', `${stats.worstYear.year}年(${stats.worstYear.pips.toFixed(0)}p)`, isLightMode, isSmallMobile, isLightMode ? '#dd3333' : '#ff4444');
                y2 += lineHeight;
            }
            if (stats.bestPair) {
                const pairShortMobile = stats.bestPair.pair.replace('/', '');
                this.#drawStatItemMobile(ctx, col2X, y2, '最高ペア:', `${pairShortMobile}(+${stats.bestPair.pips.toFixed(0)}p)`, isLightMode, isSmallMobile, isLightMode ? '#00995a' : '#00ff88');
                y2 += lineHeight;
            }
            
            y2 += sectionGap;  // セクション間の余白
            ctx.font = isSmallMobile ? 'bold 14px Arial' : 'bold 15px Arial';
            ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
            ctx.fillText('💰 円建て統計', col2X, y2);
            y2 += lineHeight;
            
            const yenColorMobile = stats.yenStats.totalProfit >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItemMobile(ctx, col2X, y2, '総利益:', `${stats.yenStats.totalProfit >= 0 ? '+' : ''}${stats.yenStats.totalProfit.toLocaleString()}円`, isLightMode, isSmallMobile, yenColorMobile);
            y2 += lineHeight;
            this.#drawStatItemMobile(ctx, col2X, y2, '平均利益:', `+${stats.yenStats.avgWinAmount.toLocaleString()}円`, isLightMode, isSmallMobile, isLightMode ? '#00995a' : '#00ff88');
            y2 += lineHeight;
            this.#drawStatItemMobile(ctx, col2X, y2, '平均損失:', `-${stats.yenStats.avgLossAmount.toLocaleString()}円`, isLightMode, isSmallMobile, isLightMode ? '#dd3333' : '#ff4444');
            y2 += lineHeight;
            const profitRateColorMobile = stats.yenStats.profitRate >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItemMobile(ctx, col2X, y2, '利益率:', `${stats.yenStats.profitRate.toFixed(1)}%`, isLightMode, isSmallMobile, profitRateColorMobile);
            y2 += lineHeight;
            this.#drawStatItemMobile(ctx, col2X, y2, '最大利益:', `+${stats.yenStats.maxWinAmount.toLocaleString()}円`, isLightMode, isSmallMobile, isLightMode ? '#00995a' : '#00ff88');
            y2 += lineHeight;
            this.#drawStatItemMobile(ctx, col2X, y2, '最大損失:', `-${stats.yenStats.maxLossAmount.toLocaleString()}円`, isLightMode, isSmallMobile, isLightMode ? '#dd3333' : '#ff4444');
            y2 += lineHeight;
            const expYenColorMobile = stats.yenStats.expectancyYen >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItemMobile(ctx, col2X, y2, '期待値:', `${stats.yenStats.expectancyYen >= 0 ? '+' : ''}${stats.yenStats.expectancyYen.toLocaleString()}円`, isLightMode, isSmallMobile, expYenColorMobile);
            
        } else {
            // ========== デスクトップ用4列レイアウト ==========
            const col1X = canvas.width * 0.08;
            const col2X = canvas.width * 0.31;
            const col3X = canvas.width * 0.54;
            const col4X = canvas.width * 0.77;
            let startY = 200;
            
            ctx.textAlign = 'left';
            
            // ========== 第1列：基本統計 ==========
            let y1 = startY;
            ctx.font = 'bold 30px Arial';
            ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
            ctx.fillText('📊 基本統計', col1X, y1);
            y1 += 50;
            
            this.#drawStatItem(ctx, col1X, y1, '総トレード数:', `${stats.totalTrades}回`, isLightMode);
            y1 += 45;
            this.#drawStatItem(ctx, col1X, y1, '勝ちトレード:', `${stats.winsCount}回`, isLightMode, '#00995a', '#00ff88');
            y1 += 45;
            this.#drawStatItem(ctx, col1X, y1, '負けトレード:', `${stats.lossesCount}回`, isLightMode, '#dd3333', '#ff4444');
            y1 += 45;
            const wrColor = stats.winRate >= 50 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItem(ctx, col1X, y1, '勝率:', `${stats.winRate.toFixed(1)}%`, isLightMode, wrColor, wrColor);
            y1 += 45;
            const pfColor = stats.profitFactor >= 2.0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            const pfText = stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2);
            this.#drawStatItem(ctx, col1X, y1, 'PF:', pfText, isLightMode, pfColor, pfColor);
            y1 += 45;
            const expColor = stats.expectancyPips >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItem(ctx, col1X, y1, '期待値:', `${stats.expectancyPips >= 0 ? '+' : ''}${stats.expectancyPips.toFixed(1)}p`, isLightMode, expColor, expColor);
            
            // ========== 第2列：Pips統計 ==========
            let y2 = startY;
            ctx.font = 'bold 30px Arial';
            ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
            ctx.fillText('📈 Pips統計', col2X, y2);
            y2 += 50;
            
            const totalPipsColor = stats.totalPips >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItem(ctx, col2X, y2, '総獲得:', `${stats.totalPips >= 0 ? '+' : ''}${stats.totalPips.toFixed(1)}p`, isLightMode, totalPipsColor, totalPipsColor);
            y2 += 45;
            this.#drawStatItem(ctx, col2X, y2, '平均利益:', `+${stats.avgWinPips.toFixed(1)}p`, isLightMode, '#00995a', '#00ff88');
            y2 += 45;
            this.#drawStatItem(ctx, col2X, y2, '平均損失:', `-${stats.avgLossPips.toFixed(1)}p`, isLightMode, '#dd3333', '#ff4444');
            y2 += 45;
            const rrColor = stats.riskReward >= 2.0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            const rrText = stats.riskReward >= 999 ? '∞' : stats.riskReward.toFixed(2);
            this.#drawStatItem(ctx, col2X, y2, 'RR:', rrText, isLightMode, rrColor, rrColor);
            y2 += 45;
            if (stats.maxWinTrade) {
                this.#drawStatItem(ctx, col2X, y2, '最大利益:', `+${stats.maxWinTrade.pips.toFixed(1)}p`, isLightMode, '#00995a', '#00ff88');
            }
            y2 += 45;
            if (stats.maxLossTrade) {
                this.#drawStatItem(ctx, col2X, y2, '最大損失:', `${stats.maxLossTrade.pips.toFixed(1)}p`, isLightMode, '#dd3333', '#ff4444');
            }
            y2 += 45;
            this.#drawStatItem(ctx, col2X, y2, '最大DD:', `${stats.maxDrawdown.toFixed(1)}p`, isLightMode, '#dd3333', '#ff4444');
            
            // ========== 第3列：パフォーマンス ==========
            let y3 = startY;
            ctx.font = 'bold 30px Arial';
            ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
            ctx.fillText('⚡ パフォーマンス', col3X, y3);
            y3 += 50;
            
            this.#drawStatItem(ctx, col3X, y3, '最大連勝:', `${stats.maxWinStreak}回`, isLightMode, '#00995a', '#00ff88');
            y3 += 45;
            this.#drawStatItem(ctx, col3X, y3, '最大連敗:', `${stats.maxLossStreak}回`, isLightMode, '#dd3333', '#ff4444');
            y3 += 45;
            const avgHours = stats.avgHoldTime ? Math.floor(stats.avgHoldTime / (1000 * 60 * 60)) : 0;
            const avgDays = Math.floor(avgHours / 24);
            const displayHours = avgHours % 24;
            const avgHoldTimeStr = avgDays > 0 ? `${avgDays}日${displayHours}h` : `${avgHours}h`;
            this.#drawStatItem(ctx, col3X, y3, '平均保有:', avgHoldTimeStr, isLightMode);
            y3 += 45;
            if (stats.bestYear) {
                this.#drawStatItem(ctx, col3X, y3, '最高年:', `${stats.bestYear.year}年 (+${stats.bestYear.pips.toFixed(0)}p)`, isLightMode, '#00995a', '#00ff88');
                y3 += 45;
            }
            if (stats.worstYear && stats.bestYear && !isNaN(stats.worstYear.year) && !isNaN(stats.bestYear.year) && stats.worstYear.year !== stats.bestYear.year) {
                this.#drawStatItem(ctx, col3X, y3, '最低年:', `${stats.worstYear.year}年 (${stats.worstYear.pips.toFixed(0)}p)`, isLightMode, '#dd3333', '#ff4444');
                y3 += 45;
            }
            if (stats.bestPair) {
                const pairShort = stats.bestPair.pair.replace('/', '');
                this.#drawStatItem(ctx, col3X, y3, '最高ペア:', `${pairShort} (+${stats.bestPair.pips.toFixed(0)}p/${stats.bestPair.trades}回)`, isLightMode, '#00995a', '#00ff88');
            }
            
            // ========== 第4列：円建て統計 ==========
            let y4 = startY;
            ctx.font = 'bold 30px Arial';
            ctx.fillStyle = isLightMode ? '#00995a' : '#00ff88';
            ctx.fillText('💰 円建て統計', col4X, y4);
            y4 += 50;
            
            const yenColor = stats.yenStats.totalProfit >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItem(ctx, col4X, y4, '総利益:', `${stats.yenStats.totalProfit >= 0 ? '+' : ''}${stats.yenStats.totalProfit.toLocaleString()}円`, isLightMode, yenColor, yenColor);
            y4 += 45;
            this.#drawStatItem(ctx, col4X, y4, '平均利益:', `+${stats.yenStats.avgWinAmount.toLocaleString()}円`, isLightMode, '#00995a', '#00ff88');
            y4 += 45;
            this.#drawStatItem(ctx, col4X, y4, '平均損失:', `-${stats.yenStats.avgLossAmount.toLocaleString()}円`, isLightMode, '#dd3333', '#ff4444');
            y4 += 45;
            const profitRateColor = stats.yenStats.profitRate >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItem(ctx, col4X, y4, '利益率:', `${stats.yenStats.profitRate.toFixed(1)}%`, isLightMode, profitRateColor, profitRateColor);
            y4 += 45;
            this.#drawStatItem(ctx, col4X, y4, '最大利益:', `+${stats.yenStats.maxWinAmount.toLocaleString()}円`, isLightMode, '#00995a', '#00ff88');
            y4 += 45;
            this.#drawStatItem(ctx, col4X, y4, '最大損失:', `-${stats.yenStats.maxLossAmount.toLocaleString()}円`, isLightMode, '#dd3333', '#ff4444');
            y4 += 45;
            const expYenColor = stats.yenStats.expectancyYen >= 0 ? (isLightMode ? '#00995a' : '#00ff88') : (isLightMode ? '#dd3333' : '#ff4444');
            this.#drawStatItem(ctx, col4X, y4, '期待値:', `${stats.yenStats.expectancyYen >= 0 ? '+' : ''}${stats.yenStats.expectancyYen.toLocaleString()}円`, isLightMode, expYenColor, expYenColor);
        }
    }
    
    /**
     * モバイル用の統計項目描画ヘルパー
     * @private
     */
    #drawStatItemMobile(ctx, x, y, label, value, isLightMode, isSmallMobile, valueColor = null) {
        const fontSize = isSmallMobile ? 12 : 13;
        ctx.font = `${fontSize}px Arial`;
        ctx.fillStyle = isLightMode ? '#666' : '#aaa';
        ctx.fillText(label, x, y);
        
        ctx.fillStyle = valueColor || (isLightMode ? '#000' : '#fff');
        ctx.fillText(value, x + (isSmallMobile ? 62 : 75), y);
    }
    
    /**
     * 統計項目を描画するヘルパー
     * @private
     */
    #drawStatItem(ctx, x, y, label, value, isLightMode, valueColorLight = null, valueColorDark = null) {
        ctx.font = '20px Arial';  // ラベル（26px → 20px）
        ctx.fillStyle = isLightMode ? '#000' : '#fff';
        ctx.fillText(label, x, y);
        
        ctx.font = 'bold 20px Arial';  // 数値（26px → 20px）
        if (valueColorLight && valueColorDark) {
            ctx.fillStyle = isLightMode ? valueColorLight : valueColorDark;
        } else {
            ctx.fillStyle = isLightMode ? '#000' : '#fff';
        }
        const labelWidth = ctx.measureText(label).width;
        ctx.fillText(` ${value}`, x + labelWidth, y);
    }
}

// 即座に初期化（シングルトン）
window.ChartModule = new ChartModule();

// デバッグ出力
console.log('ChartModule loaded:', window.ChartModule.getStatus());