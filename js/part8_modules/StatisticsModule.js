/**
 * @module StatisticsModule
 * @description トレード統計の計算と表示を管理するモジュール
 * @author AI Assistant / コンパナ
 * @version 1.0.0
 * @important UIの変更は原則禁止。見た目は既存のまま維持すること。
 */
class StatisticsModule {
    // プライベートフィールド
    #tradeManager = null;
    #eventBus = null;
    #yenProfitLossManager = null;
    #initialized = false;
    #yenStats = null;
    #ruleComplianceStats = null;  // ルール遵守統計
    #riskManagementStats = null;  // リスク管理統計
    
    constructor() {
        // 依存の注入
        this.#tradeManager = window.TradeManager?.getInstance();
        this.#eventBus = window.eventBus;
        
        // YenProfitLossManager の参照（小文字・大文字両方をチェック）
        this.#yenProfitLossManager = window.yenProfitLossManager || 
                                      window.YenProfitLossManager ||
                                      null;
        
        // デバッグ出力
        console.log('StatisticsModule 初期化:', {
            hasTradeManager: !!this.#tradeManager,
            hasEventBus: !!this.#eventBus,
            hasYenManager: !!this.#yenProfitLossManager
        });
        
        // 初期化
        this.#initialize();
    }
    
    // ================
    // Public API（外部公開）
    // ================
    
    /**
     * 統計を更新
     * @public
     * @returns {void}
     */
    updateStatistics() {
        try {
            // TradeManagerから最新データを取得
            const trades = this.#tradeManager?.getAllTrades() || [];
            
            // 統計計算
            const stats = this.#calculateStatistics(trades);
            
            // UI更新
            this.#updateUI(stats);
            
            // 円建て損益の集計
            this.#updateYenStatistics(trades);
            
            // グラフ更新
            if (typeof window.updateMonthlyPerformanceChart === 'function') {
                window.updateMonthlyPerformanceChart();
            }
            
            // イベント発火
            this.#eventBus?.emit('statistics:updated', stats);
            
        } catch (error) {
            console.error('StatisticsModule.updateStatistics error:', error);
        }
    }
    
    /**
     * 統計を強制的に再計算
     * @public
     * @returns {void}
     */
    refresh() {
        this.updateStatistics();
    }
    
    /**
     * ルール遵守統計を取得
     * @public
     * @returns {Object} { yes, no, total, rate }
     */
    getRuleComplianceStats() {
        if (!this.#ruleComplianceStats) {
            this.updateStatistics();
        }
        return this.#ruleComplianceStats || { yes: 0, no: 0, total: 0, rate: 0 };
    }
    
    /**
     * リスク管理統計を取得
     * @public
     * @returns {Object} { normal, warning, danger, total, rate }
     */
    getRiskManagementStats() {
        if (!this.#riskManagementStats) {
            this.updateStatistics();
        }
        return this.#riskManagementStats || { normal: 0, warning: 0, danger: 0, total: 0, rate: 0 };
    }
    
    /**
     * 期間統計UIを更新
     * @public
     * @param {Object} pipsStats - Pips統計
     * @param {Object} yenStats - 円建て統計
     * @param {string} periodText - 期間テキスト
     * @returns {void}
     */
    updatePeriodStatsUI(pipsStats, yenStats, periodText) {
        // タイトル更新（モバイル用改行対応）
        document.getElementById('periodStatsTitle').innerHTML = `📊 ${periodText.replace('（', '<br class="mobile-break">（')}`;
        
        // Pips統計更新
        if (pipsStats) {
            document.getElementById('periodTotalTrades').textContent = pipsStats.totalTrades;
            document.getElementById('periodWinLoss').textContent = pipsStats.winLossRecord;
            document.getElementById('periodWinRate').textContent = pipsStats.winRate;
            
            // 総獲得Pips - 色付け追加
            const totalPipsElement = document.getElementById('periodTotalPips');
            totalPipsElement.textContent = Math.abs(parseFloat(pipsStats.totalPips)).toFixed(1);
            totalPipsElement.className = 'stat-value ' + (parseFloat(pipsStats.totalPips) >= 0 ? 'positive' : 'negative');
            
            document.getElementById('periodAvgHoldTime').textContent = pipsStats.avgHoldTime;
            document.getElementById('periodRR').textContent = pipsStats.rrRatio;
            document.getElementById('periodMaxWinStreak').textContent = pipsStats.maxWinStreak + '回';
            document.getElementById('periodMaxLoseStreak').textContent = pipsStats.maxLoseStreak + '回';
            
            // 平均利益pips - 色付け追加
            const periodAvgProfitPipsElem = document.getElementById('periodAvgProfitPips');
            const avgProfitPipsValue = parseFloat(pipsStats.avgProfitPips) || 0;
            periodAvgProfitPipsElem.textContent = Math.abs(avgProfitPipsValue).toFixed(1);
            periodAvgProfitPipsElem.className = 'stat-value ' + (avgProfitPipsValue >= 0 ? 'positive' : 'negative');
            
            // 平均損失pips - 色付け追加＋絶対値化
            const periodAvgLossPipsElem = document.getElementById('periodAvgLossPips');
            const avgLossPipsValue = parseFloat(pipsStats.avgLossPips) || 0;
            periodAvgLossPipsElem.textContent = Math.abs(avgLossPipsValue).toFixed(1);
            periodAvgLossPipsElem.className = 'stat-value negative';
            
            // 最大獲得pips - 色付け追加
            const periodMaxWinPipsElem = document.getElementById('periodMaxWinPips');
            const maxWinPipsValue = parseFloat(pipsStats.maxWinPips) || 0;
            periodMaxWinPipsElem.textContent = Math.abs(maxWinPipsValue).toFixed(1);
            periodMaxWinPipsElem.className = 'stat-value ' + (maxWinPipsValue >= 0 ? 'positive' : 'negative');
            
            // 最大損失pips - 色付け追加＋絶対値化
            const periodMaxLossPipsElem = document.getElementById('periodMaxLossPips');
            const maxLossPipsValue = parseFloat(pipsStats.maxLossPips) || 0;
            periodMaxLossPipsElem.textContent = Math.abs(maxLossPipsValue).toFixed(1);
            periodMaxLossPipsElem.className = 'stat-value negative';
        }
        
        // 円建て統計更新
        if (yenStats) {
            document.getElementById('periodYenRegistration').textContent = yenStats.registrationStatus;
            document.getElementById('periodYenWinRate').textContent = yenStats.winRate;
            
            // 総損益 - 符号削除
            document.getElementById('periodYenTotalPL').textContent = `¥${Math.abs(yenStats.totalProfitLoss).toLocaleString()}`;
            document.getElementById('periodYenTotalPL').className = 'stat-value ' + (yenStats.totalProfitLoss >= 0 ? 'positive' : 'negative');
            
            document.getElementById('periodYenPF').textContent = yenStats.profitFactor;
            
            // 期待値 - 符号削除
            document.getElementById('periodYenExpectedValue').textContent = `¥${Math.abs(yenStats.expectedValue).toLocaleString()}`;
            document.getElementById('periodYenExpectedValue').className = 'stat-value ' + (yenStats.expectedValue >= 0 ? 'positive' : 'negative');
            
            // 平均利益 - 色付け追加＋記号削除
            const periodYenAvgProfitElem = document.getElementById('periodYenAvgProfit');
            periodYenAvgProfitElem.textContent = `¥${Math.abs(yenStats.avgProfit).toLocaleString()}`;
            periodYenAvgProfitElem.className = 'stat-value ' + (yenStats.avgProfit >= 0 ? 'positive' : 'negative');
            
            // 平均損失 - 色付け追加＋記号削除
            const periodYenAvgLossElem = document.getElementById('periodYenAvgLoss');
            periodYenAvgLossElem.textContent = `¥${Math.abs(yenStats.avgLoss).toLocaleString()}`;
            periodYenAvgLossElem.className = 'stat-value negative';
            
            // 最大利益 - 色付け追加＋記号削除
            const periodYenMaxProfitElem = document.getElementById('periodYenMaxProfit');
            periodYenMaxProfitElem.textContent = `¥${Math.abs(yenStats.maxProfit).toLocaleString()}`;
            periodYenMaxProfitElem.className = 'stat-value ' + (yenStats.maxProfit >= 0 ? 'positive' : 'negative');
            
            // 最大損失 - 色付け追加＋記号削除
            const periodYenMaxLossElem = document.getElementById('periodYenMaxLoss');
            periodYenMaxLossElem.textContent = `¥${Math.abs(yenStats.maxLoss).toLocaleString()}`;
            periodYenMaxLossElem.className = 'stat-value negative';
            
            // 最大DD - 符号削除 + 赤色追加
            const maxDDElement = document.getElementById('periodYenMaxDD');
            maxDDElement.textContent = `¥${yenStats.maxDrawdown.toLocaleString()}`;
            maxDDElement.className = 'stat-value negative';
            
            // スワップ損益 - 符号削除
            document.getElementById('periodYenSwap').textContent = `¥${Math.abs(yenStats.swapTotal).toLocaleString()}`;
            document.getElementById('periodYenSwap').className = 'stat-value ' + (yenStats.swapTotal >= 0 ? 'positive' : 'negative');
            
            // 手数料合計 - 赤色追加
            const commissionElement = document.getElementById('periodYenCommission');
            commissionElement.textContent = `¥${Math.abs(yenStats.commissionTotal).toLocaleString()}`;
            commissionElement.className = 'stat-value negative';
        }
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
            hasYenProfitLossManager: !!this.#yenProfitLossManager,
            tradeCount: this.#tradeManager?.getAllTrades()?.length || 0
        };
    }
    
    /**
     * 円建て統計を更新
     * @public
     * @returns {void}
     */
    updateYenStatistics() {
        try {
            const allTrades = this.#tradeManager?.getAllTrades() || [];
            // 🔥 決済済みトレードのみをフィルタリング
            const settledTrades = allTrades.filter(t => t.exits && t.exits.length > 0);
            this.#yenStats = this.#calculateYenStatistics(settledTrades);
            this.#updateYenUI(this.#yenStats);
            this.#eventBus?.emit('statistics:yenUpdated', this.#yenStats);
        } catch (error) {
            console.error('StatisticsModule.updateYenStatistics error:', error);
        }
    }
    
    /**
     * 円建て統計データを取得
     * @public
     * @returns {Object} 円建て統計データ
     */
    getYenStatistics() {
        if (!this.#yenStats) {
            const allTrades = this.#tradeManager?.getAllTrades() || [];
            // 🔥 決済済みトレードのみをフィルタリング
            const settledTrades = allTrades.filter(t => t.exits && t.exits.length > 0);
            this.#yenStats = this.#calculateYenStatistics(settledTrades);
        }
        return this.#yenStats;
    }
    
    /**
     * 統計表示を切り替え（Pips ⇔ 円建て）
     * @public
     * @param {string} view - 'pips' | 'yen'
     * @returns {void}
     */
    switchStatisticsView(view) {
        const pipsView = document.getElementById('pipsStats');
        const yenView = document.getElementById('yenStats');
        const pipsBtn = document.getElementById('pipsViewBtn');
        const yenBtn = document.getElementById('yenViewBtn');
        
        if (view === 'yen') {
            // 円建て表示に切り替え
            if (pipsView) pipsView.style.display = 'none';
            if (yenView) yenView.style.display = 'grid';
            if (pipsBtn) pipsBtn.classList.remove('active');
            if (yenBtn) yenBtn.classList.add('active');
            
            // 最新データで更新
            this.updateYenStatistics();
        } else {
            // Pips表示に切り替え
            if (pipsView) pipsView.style.display = 'grid';
            if (yenView) yenView.style.display = 'none';
            if (pipsBtn) pipsBtn.classList.add('active');
            if (yenBtn) yenBtn.classList.remove('active');
        }
        
        this.#eventBus?.emit('statistics:viewChanged', { view });
    }
    
    /**
     * 期間統計を取得
     * @public
     * @param {string} periodType - 期間タイプ（'weekly'/'monthly'/'quarterly'/'yearly'）
     * @param {number} year - 年
     * @param {number} period - 期間（月、四半期、週番号など）
     * @param {string} statsType - 統計タイプ（'pips'/'yen'）
     * @returns {Object} 期間統計データ
     */
    getPeriodStats(periodType, year, period, statsType) {
        const allTrades = this.#tradeManager?.getAllTrades() || [];
        
        // 期間でフィルタリング
        const filteredTrades = allTrades.filter(trade => {
            if (!trade.exits || trade.exits.length === 0) return false;
            
            const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
            const tradeYear = exitDate.getFullYear();
            const tradeMonth = exitDate.getMonth() + 1;
            
            switch (periodType) {
                case 'weekly':
                    // 週次フィルタリング
                    const weekNum = this.#getWeekNumber(exitDate);
                    return tradeYear === year && weekNum === period;
                    
                case 'monthly':
                    // 月次フィルタリング
                    return tradeYear === year && tradeMonth === period;
                    
                case 'quarterly':
                    // 四半期フィルタリング（Q1=1-3月, Q2=4-6月, Q3=7-9月, Q4=10-12月）
                    const quarter = Math.floor((tradeMonth - 1) / 3) + 1;
                    return tradeYear === year && quarter === period;
                    
                case 'yearly':
                    // 年次フィルタリング
                    return tradeYear === year;
                    
                default:
                    return true;
            }
        });
        
        // 統計を計算
        if (statsType === 'pips') {
            return this.#calculatePipsStatsComplete(filteredTrades);
        } else if (statsType === 'yen') {
            return this.#calculateYenStatsComplete(filteredTrades);
        }
        
        return {};
    }
    
    /**
     * ISO週番号を取得
     * @private
     * @param {Date} date - 日付
     * @returns {number} 週番号（1-52）
     */
    #getWeekNumber(date) {
        const target = new Date(date.valueOf());
        const dayNum = (date.getDay() + 6) % 7; // 月曜=0, 日曜=6
        target.setDate(target.getDate() - dayNum + 3);
        const firstThursday = target.valueOf();
        target.setMonth(0, 1);
        if (target.getDay() !== 4) {
            target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
        }
        return 1 + Math.ceil((firstThursday - target) / 604800000);
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
        
        console.log('StatisticsModule initialized');
        this.#initialized = true;
    }
    
    /**
     * イベントバインド
     * @private
     */
    #bindEvents() {
        if (this.#eventBus) {
            // トレード追加/編集/削除時に統計を自動更新
            this.#eventBus.on('trade:added', () => this.updateStatistics());
            this.#eventBus.on('trade:updated', () => this.updateStatistics());
            this.#eventBus.on('trade:deleted', () => this.updateStatistics());
            // 入出金管理イベント（Phase 2-4）
            this.#eventBus.on('capital:recordAdded', () => this.updateStatistics());
            this.#eventBus.on('capital:recordDeleted', () => this.updateStatistics());
            
            // 年初口座残高連携（利益率機能）
            this.#eventBus.on('settings:initialized', () => {
                console.log('[StatisticsModule] settings:initialized 受信 → 総合統計更新');
                this.#updateOverallYearStats();
            });
            this.#eventBus.on('settings:yearStartBalanceChanged', () => {
                console.log('[StatisticsModule] settings:yearStartBalanceChanged 受信 → 総合統計更新');
                this.#updateOverallYearStats();
            });
            
            // DOMContentLoaded後に総合統計を更新（changeOverallYearが定義されるのを待つ）
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => this.#updateOverallYearStats(), 200);
                });
            } else {
                // 既にDOM読み込み完了している場合
                setTimeout(() => this.#updateOverallYearStats(), 200);
            }
        }
    }
    
    /**
     * 総合統計（年度別）UIを更新
     * @private
     */
    #updateOverallYearStats() {
        if (typeof window.changeOverallYear === 'function') {
            window.changeOverallYear();
        }
    }
    
    /**
     * グローバル関数の置き換え
     * @private
     */
    #replaceGlobalFunctions() {
        // 既存のupdateStatistics関数を保存
        if (typeof window.updateStatistics === 'function') {
            window.updateStatistics_original = window.updateStatistics;
        }
        
        // 新しい関数で置き換え
        window.updateStatistics = () => this.updateStatistics();
    }
    
    /**
    /**
     * 統計を計算
     * @private
     * @param {Array} trades - トレードデータ配列
     * @returns {Object} 統計データ
     */
    #calculateStatistics(trades) {
        // Pips統計用の変数
        let totalWins = 0;
        let totalLosses = 0;
        let totalPips = 0;
        let maxWinStreak = 0;
        let maxLoseStreak = 0;  // ⭐NEW: 最大連敗追加
        let currentWinStreak = 0;
        let currentLoseStreak = 0;  // ⭐NEW: 現在の連敗追加
        let totalHoldTime = 0;
        let totalRR = 0;
        let closedTradeCount = 0;
        
        // ⭐NEW: Pips配列追加
        let winPips = [];
        let losePips = [];
        
        // 円建て統計用の変数（追加）
        let yenTotalProfit = 0;
        let yenTotalLoss = 0;
        let yenWins = 0;
        let yenLosses = 0;
        let yenRegisteredCount = 0;
        
        // ⭐NEW: 円建て最大DD計算用
        let yenBalance = 0;
        let yenMaxBalance = 0;
        let yenMaxDrawdown = 0;
        
        // ⭐CRITICAL FIX: 最大DD計算のために決済日時順にソート
        // トレードを時系列順にソート（決済日時でソート）
        const sortedTrades = [...trades].sort((a, b) => {
            const dateA = a.exits && a.exits.length > 0 ? new Date(a.exits[a.exits.length - 1].time) : new Date(a.entryTime);
            const dateB = b.exits && b.exits.length > 0 ? new Date(b.exits[b.exits.length - 1].time) : new Date(b.entryTime);
            return dateA - dateB;
        });
        
        sortedTrades.forEach(trade => {
            const pips = this.#calculateTradePips(trade);
            
            if (trade.exits && trade.exits.length > 0) {
                // Pips統計
                if (pips > 0) {
                    totalWins++;
                    currentWinStreak++;
                    currentLoseStreak = 0;  // ⭐NEW: リセット
                    maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
                    winPips.push(pips);  // ⭐NEW: 配列に追加
                } else if (pips < 0) {
                    totalLosses++;
                    currentLoseStreak++;  // ⭐NEW: カウント
                    currentWinStreak = 0;
                    maxLoseStreak = Math.max(maxLoseStreak, currentLoseStreak);  // ⭐NEW: 更新
                    losePips.push(pips);  // ⭐NEW: 配列に追加
                }
                
                totalPips += pips;
                
                // 保有時間計算
                const entryDate = new Date(trade.entryTime);
                const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
                totalHoldTime += (exitDate - entryDate);
                
                // R:R計算
                const rr = this.#calculateTradeRR(trade);
                if (rr !== null) {
                    totalRR += rr;
                    closedTradeCount++;
                }
                
                // ========== 円建て統計の計算（追加部分）==========
                const yenData = trade.yenProfitLoss;
                if (yenData && yenData.netProfit !== null && yenData.netProfit !== undefined) {
                    yenRegisteredCount++;
                    
                    const netProfit = parseFloat(yenData.netProfit) || 0;
                    
                    // ⭐NEW: 残高とDDの計算
                    yenBalance += netProfit;
                    
                    if (netProfit > 0) {
                        yenTotalProfit += netProfit;
                        yenWins++;
                    } else if (netProfit < 0) {
                        yenTotalLoss += Math.abs(netProfit);
                        yenLosses++;
                    }
                    
                    // ⭐NEW: 最大残高更新
                    if (yenBalance > yenMaxBalance) {
                        yenMaxBalance = yenBalance;
                    }
                    
                    // ⭐NEW: ドローダウン計算
                    const drawdown = yenMaxBalance - yenBalance;
                    if (drawdown > yenMaxDrawdown) {
                        yenMaxDrawdown = drawdown;
                    }
                }
                // ================================================
            }
        });
        
        const totalTrades = totalWins + totalLosses;
        const winRate = totalTrades > 0 ? (totalWins / totalTrades * 100) : 0;
        const avgHoldTime = totalTrades > 0 ? totalHoldTime / totalTrades : 0;
        const avgRR = closedTradeCount > 0 ? totalRR / closedTradeCount : 0;
        
        // ⭐NEW: Pips統計の計算
        const avgWinPips = winPips.length > 0 ? winPips.reduce((a, b) => a + b, 0) / winPips.length : 0;
        const avgLosePips = losePips.length > 0 ? losePips.reduce((a, b) => a + b, 0) / losePips.length : 0;
        const maxWinPips = winPips.length > 0 ? Math.max(...winPips) : 0;
        const maxLosePips = losePips.length > 0 ? Math.min(...losePips) : 0;
        const rrPips = Math.abs(avgLosePips) > 0 ? (avgWinPips / Math.abs(avgLosePips)) : 0;
        
        // ========== 円建て統計の計算（追加部分）==========
        const yenTotalTrades = yenWins + yenLosses;
        const yenWinRate = yenTotalTrades > 0 ? ((yenWins / yenTotalTrades) * 100).toFixed(1) : '0.0';
        const yenNetProfit = yenTotalProfit - yenTotalLoss;
        const yenProfitFactor = yenTotalLoss > 0 ? (yenTotalProfit / yenTotalLoss).toFixed(2) : '0.00';
        const yenExpectedValue = yenTotalTrades > 0 ? Math.round(yenNetProfit / yenTotalTrades) : 0;
        const yenAvgProfit = yenWins > 0 ? Math.round(yenTotalProfit / yenWins) : 0;
        const yenAvgLoss = yenLosses > 0 ? Math.round(yenTotalLoss / yenLosses) : 0;
        // ================================================
        
        // ルール遵守統計の計算（タスク27）
        let ruleYes = 0;
        let ruleNo = 0;
        let riskNormal = 0;
        let riskWarning = 0;
        let riskDanger = 0;
        
        trades.forEach(trade => {
            // ルール遵守カウント
            const reflection = typeof trade.reflection === 'object' ? trade.reflection : null;
            if (reflection && reflection.ruleFollowed) {
                if (reflection.ruleFollowed === 'yes') ruleYes++;
                else if (reflection.ruleFollowed === 'no') ruleNo++;
            }
            
            // リスク管理カウント
            if (trade.riskStatus) {
                if (trade.riskStatus === 'normal') riskNormal++;
                else if (trade.riskStatus === 'warning') riskWarning++;
                else if (trade.riskStatus === 'danger') riskDanger++;
            }
        });
        
        const ruleTotal = ruleYes + ruleNo;
        const ruleComplianceRate = ruleTotal > 0 ? (ruleYes / ruleTotal * 100).toFixed(1) : 0;
        
        const riskTotal = riskNormal + riskWarning + riskDanger;
        const riskComplianceRate = riskTotal > 0 ? (riskNormal / riskTotal * 100).toFixed(1) : 0;
        
        this.#ruleComplianceStats = {
            yes: ruleYes,
            no: ruleNo,
            total: ruleTotal,
            rate: ruleComplianceRate
        };
        
        this.#riskManagementStats = {
            normal: riskNormal,
            warning: riskWarning,
            danger: riskDanger,
            total: riskTotal,
            rate: riskComplianceRate
        };
        
        return {
            // Pips統計
            totalTrades: trades.length,
            totalWins,
            totalLosses,
            totalPips,
            winRate,
            maxWinStreak,
            maxLoseStreak,  // ⭐NEW
            avgHoldTime,
            avgRR,
            closedTradeCount,
            
            // ⭐NEW: Pips詳細統計
            avgWinPips,
            avgLosePips,
            maxWinPips,
            maxLosePips,
            rrPips,
            
            // ========== 円建て統計（追加部分）==========
            yenRegisteredCount,
            yenWinRate,
            yenTotalProfit: Math.round(yenTotalProfit),
            yenTotalLoss: Math.round(yenTotalLoss),
            yenNetProfit: Math.round(yenNetProfit),
            yenProfitFactor,
            yenExpectedValue,
            yenAvgProfit,
            yenAvgLoss,
            yenWins,
            yenLosses,
            yenMaxDrawdown: Math.round(yenMaxDrawdown)  // ⭐NEW
            // ==========================================
        };
    }

    
    /**
     * UI更新（全期間統計18項目）
     * @private
     * @param {Object} stats - 統計データ
     */
    #updateUI(stats) {
        // 時間をわかりやすく表示
        const avgHours = Math.floor(stats.avgHoldTime / (1000 * 60 * 60));
        const avgDays = Math.floor(avgHours / 24);
        const displayHours = avgHours % 24;
        const avgHoldTimeStr = avgDays > 0 ? `${avgDays}日${displayHours}時間` : `${avgHours}時間`;
        
        // ========================================
        // 全期間統計18項目の更新
        // ========================================
        
        // 1段目（6項目）
        this.#safeUpdateElement('totalTradesCount', stats.totalTrades);
        this.#safeUpdateElement('overallWinLoss', `${stats.totalWins}勝${stats.totalLosses}敗`);
        this.#safeUpdateElement('overallWinRate', `${stats.yenWinRate}%`);
        this.#safeUpdateElement('maxWinStreak', `${stats.maxWinStreak}回`);  // ⭐NEW
        this.#safeUpdateElement('maxLoseStreak', `${stats.maxLoseStreak}回`);  // ⭐NEW
        
        // 利益額（円）
        const overallProfitElement = this.#safeGetElement('overallProfit');
        if (overallProfitElement) {
            overallProfitElement.textContent = `¥${this.#formatNumber(Math.abs(stats.yenNetProfit))}`;
            overallProfitElement.className = 'stat-value ' + (stats.yenNetProfit >= 0 ? 'positive' : 'negative');
        }
        
        // 2段目(6項目)
        // 利益率(Phase 2-4: CapitalManagerModuleと連携)
        if (window.CapitalManagerModule) {
            const currentBalance = window.CapitalManagerModule.getCurrentBalance();
            if (currentBalance > 0) {
                const profitRate = window.CapitalManagerModule.calculateProfitRate();
                const profitRateElement = this.#safeGetElement('profitRate');
                if (profitRateElement) {
                    profitRateElement.textContent = `${profitRate.toFixed(1)}%`;
                    // MODULES.md準拠: className設定
                    profitRateElement.className = 'stat-value ' + (profitRate >= 0 ? 'positive' : 'negative');
                }
            } else {
                // 投入資金がない場合
                this.#safeUpdateElement('profitRate', '--%');
            }
        } else {
            // CapitalManagerModuleがない場合
            this.#safeUpdateElement('profitRate', '--%');
        }
        
        // 平均利益（円）- 色付け追加
        const avgProfitYenElement = this.#safeGetElement('avgProfitYen');
        if (avgProfitYenElement) {
            avgProfitYenElement.textContent = `¥${this.#formatNumber(Math.abs(stats.yenAvgProfit))}`;
            avgProfitYenElement.className = 'stat-value ' + (stats.yenAvgProfit >= 0 ? 'positive' : 'negative');
        }
        
        // 平均損失（円）- 色付け追加
        const avgLossYenElement = this.#safeGetElement('avgLossYen');
        if (avgLossYenElement) {
            avgLossYenElement.textContent = `¥${this.#formatNumber(Math.abs(stats.yenAvgLoss))}`;
            avgLossYenElement.className = 'stat-value negative';  // 常に赤（損失なので）
        }
        
        // 最大DD（円）- 常に赤色
        const maxDrawdownElement = this.#safeGetElement('maxDrawdown');
        if (maxDrawdownElement) {
            maxDrawdownElement.textContent = `¥${this.#formatNumber(stats.yenMaxDrawdown)}`;
            // MODULES.md準拠: className設定（常にnegative）
            maxDrawdownElement.className = 'stat-value negative';
        }
        
        // 総獲得Pips
        const totalPipsElement = this.#safeGetElement('totalPipsEarned');
        if (totalPipsElement) {
            totalPipsElement.textContent = `${Math.abs(stats.totalPips).toFixed(1)}`;
            totalPipsElement.className = 'stat-value ' + (stats.totalPips >= 0 ? 'positive' : 'negative');
        }
        
        // 最大獲得Pips - 色付け追加
        const maxWinPipsElement = this.#safeGetElement('maxWinPips');
        if (maxWinPipsElement) {
            maxWinPipsElement.textContent = `${Math.abs(stats.maxWinPips).toFixed(1)}`;
            maxWinPipsElement.className = 'stat-value ' + (stats.maxWinPips >= 0 ? 'positive' : 'negative');
        }
        
        // 3段目（6項目）
        // 最大損失Pips - 色付け追加＋絶対値化
        const maxLosePipsElement = this.#safeGetElement('maxLosePips');
        if (maxLosePipsElement) {
            maxLosePipsElement.textContent = `${Math.abs(stats.maxLosePips).toFixed(1)}`;
            maxLosePipsElement.className = 'stat-value negative';  // 常に赤（損失なので）
        }
        
        // 平均利益Pips - 色付け追加
        const avgProfitPipsElement = this.#safeGetElement('avgProfitPips');
        if (avgProfitPipsElement) {
            avgProfitPipsElement.textContent = `${Math.abs(stats.avgWinPips).toFixed(1)}`;
            avgProfitPipsElement.className = 'stat-value ' + (stats.avgWinPips >= 0 ? 'positive' : 'negative');
        }
        
        // 平均損失Pips - 色付け追加＋絶対値化
        const avgLossPipsElement = this.#safeGetElement('avgLossPips');
        if (avgLossPipsElement) {
            avgLossPipsElement.textContent = `${Math.abs(stats.avgLosePips).toFixed(1)}`;
            avgLossPipsElement.className = 'stat-value negative';  // 常に赤（損失なので）
        }
        
        // R:R（Pips）
        this.#safeUpdateElement('riskRewardPips', stats.rrPips.toFixed(2));  // ⭐NEW
        
        // PF（円）
        this.#safeUpdateElement('profitFactorYen', stats.yenProfitFactor);
        
        // 期待値（円）
        const expectedValueElement = this.#safeGetElement('expectedValueYen');
        if (expectedValueElement) {
            expectedValueElement.textContent = `¥${this.#formatNumber(Math.abs(stats.yenExpectedValue))}`;
            expectedValueElement.className = 'stat-value ' + (stats.yenExpectedValue >= 0 ? 'positive' : 'negative');
        }
        
        // ========================================
        // 既存のPips統計UI（互換性維持）
        // ========================================
        const totalTradesElement = this.#safeGetElement('totalTradesCount');
        const overallWinRateElement = this.#safeGetElement('overallWinRate');
        const totalPipsEarnedElement = this.#safeGetElement('totalPipsEarned');
        const maxWinStreakElement = this.#safeGetElement('maxWinStreak');
        const avgHoldTimeElement = this.#safeGetElement('avgHoldTime');
        const avgRiskRewardElement = this.#safeGetElement('avgRiskReward');
        
        if (totalTradesElement) totalTradesElement.textContent = stats.totalTrades;
        if (overallWinRateElement) overallWinRateElement.textContent = `${stats.yenWinRate}%`;
        if (totalPipsEarnedElement) totalPipsEarnedElement.textContent = `${stats.totalPips >= 0 ? '+' : ''}${stats.totalPips.toFixed(1)}`;
        if (maxWinStreakElement) maxWinStreakElement.textContent = `${stats.maxWinStreak}回`;
        if (avgHoldTimeElement) avgHoldTimeElement.textContent = avgHoldTimeStr;
        if (avgRiskRewardElement) avgRiskRewardElement.textContent = stats.avgRR.toFixed(2);
    }

    
    /**
     * DOM要素を安全に更新
     * @private
     * @param {string} id - 要素ID
     * @param {string|number} value - 設定する値
     */
    #safeUpdateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }
    
    /**
     * 数値をカンマ区切りでフォーマット
     * @private
     * @param {number} num - 数値
     * @returns {string} フォーマットされた文字列
     */
    #formatNumber(num) {
        return Math.abs(num).toLocaleString('ja-JP');
    }
    
    /**
     * 円建て損益統計を更新
     * @private
     * @param {Array} trades - トレードデータ配列
     */
    #updateYenStatistics(trades) {
        if (this.#yenProfitLossManager) {
            // 円建て統計を計算
            const yenStats = this.#calculateYenStatistics(trades);
            
            // 統計データを表示用に変換
            const displayData = {
                tradePL: yenStats.totalProfitLoss,
                swapPoints: yenStats.swapTotal || 0,
                commission: yenStats.commissionTotal || 0,
                netProfitLoss: yenStats.totalProfitLoss,
                count: yenStats.totalTrades
            };
            
            // プライベートメソッドを呼び出し
            this.#updateYenStatisticsDisplay(displayData);
        }
    }
    
    /**
     * 円建て損益統計の表示
     * @private
     * @param {Object} yenStats - 円建て統計データ
     * @returns {void}
     */
    #updateYenStatisticsDisplay(yenStats) {
        // 円建て損益の統計表示
        const analysisTab = document.getElementById('analysis');
        if (!analysisTab) return;
        
        // 既存の円建て統計要素を探すか新規作成
        let yenStatsElement = document.getElementById('yen-statistics');
        
        // 新しい統計セクションのHTML
        const yenStatsHTML = `
            <div class="yen-statistics" style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;">
                
                <h3>💴 円建て損益統計</h3>
                
                <div class="stats-grid" style="
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                    margin-top: 15px;">
                    
                    <div class="stat-item">
                        <label>総損益</label>
                        <div class="stat-value" style="font-size: 1.5em; font-weight: bold;">
                            ¥${yenStats.tradePL.toLocaleString('ja-JP')}
                        </div>
                    </div>
                    
                    <div class="stat-item">
                        <label>総スワップ</label>
                        <div class="stat-value" style="font-size: 1.5em; font-weight: bold;">
                            ¥${yenStats.swapPoints.toLocaleString('ja-JP')}
                        </div>
                    </div>
                    
                    <div class="stat-item">
                        <label>総手数料</label>
                        <div class="stat-value" style="font-size: 1.5em; font-weight: bold;">
                            ¥${yenStats.commission.toLocaleString('ja-JP')}
                        </div>
                    </div>
                    
                    <div class="stat-item">
                        <label>純損益合計</label>
                        <div class="stat-value" style="
                            font-size: 1.8em; 
                            font-weight: bold;
                            color: ${yenStats.netProfitLoss >= 0 ? '#00ff88' : '#ff4466'}">
                            ¥${yenStats.netProfitLoss.toLocaleString('ja-JP')}
                        </div>
                    </div>
                    
                    <div class="stat-item">
                        <label>トレード数</label>
                        <div class="stat-value">${yenStats.count}回</div>
                    </div>
                    
                    <div class="stat-item">
                        <label>平均損益</label>
                        <div class="stat-value">
                            ¥${yenStats.count > 0 ? Math.round(yenStats.netProfitLoss / yenStats.count).toLocaleString('ja-JP') : 0}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        if (yenStatsElement) {
            yenStatsElement.outerHTML = yenStatsHTML;
        } else {
            // 統計サマリーの後に追加
            const statsContainer = analysisTab.querySelector('.section');
            if (statsContainer) {
                const reportButtons = statsContainer.querySelector('.report-buttons');
                if (reportButtons) {
                    reportButtons.insertAdjacentHTML('beforebegin', yenStatsHTML);
                }
            }
        }
    }
    
    /**
     * トレードのpipsを計算
     * @private
     * @param {Object} trade - トレードデータ
     * @returns {number} pips
     */
    #calculateTradePips(trade) {
        // trade.pipsフィールドを直接使用（最も信頼性が高い）
        if (trade.pips !== undefined && trade.pips !== null) {
            return parseFloat(trade.pips);
        }
        
        // フォールバック: window.calculateTradePipsを使用
        if (typeof window.calculateTradePips === 'function') {
            return window.calculateTradePips(trade);
        }
        
        return 0;
    }
    
    /**
     * トレードのR:Rを計算
     * @private
     * @param {Object} trade - トレードデータ
     * @returns {number|null} R:R値
     */
    #calculateTradeRR(trade) {
        // 既存のcalculateTradeRR関数を使用
        if (typeof window.calculateTradeRR === 'function') {
            return window.calculateTradeRR(trade);
        }
        return null;
    }
    
    /**
     * 安全にDOM要素を取得
     * @private
     * @param {string} id - 要素ID
     * @returns {HTMLElement|null} DOM要素
     */
    #safeGetElement(id) {
        // 既存のsafeGetElement関数を使用
        if (typeof window.safeGetElement === 'function') {
            return window.safeGetElement(id);
        }
        return document.getElementById(id);
    }
    
    /**
     * 円建て統計を計算
     * @private
     * @param {Array} trades - トレードデータ配列
     * @returns {Object} 円建て統計データ
     */
    #calculateYenStatistics(trades) {
        if (!trades || trades.length === 0) {
            return this.#getEmptyYenStats();
        }
        
        let totalProfit = 0;
        let totalLoss = 0;
        let wins = 0;
        let losses = 0;
        let balance = 0;
        let maxBalance = 0;
        let maxDrawdown = 0;
        
        trades.forEach(trade => {
            // 🔥 決済済みチェック追加（未決済トレードを除外）
            if (!trade.exits || trade.exits.length === 0) {
                return; // 未決済トレードはスキップ
            }
            
            // トレードオブジェクト内のyenProfitLossを使用
            const yenData = trade.yenProfitLoss;
            
            if (!yenData || yenData.netProfit === null || yenData.netProfit === undefined) {
                return; // データがないトレードはスキップ
            }
            
            const netProfit = parseFloat(yenData.netProfit) || 0;
            
            // 損益を累積
            balance += netProfit;
            
            if (netProfit > 0) {
                totalProfit += netProfit;
                wins++;
            } else if (netProfit < 0) {
                totalLoss += Math.abs(netProfit);
                losses++;
            }
            
            // 最大残高更新
            if (balance > maxBalance) {
                maxBalance = balance;
            }
            
            // ドローダウン計算
            const drawdown = maxBalance - balance;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        });
        
        // プロフィットファクター
        const profitFactor = totalLoss > 0
            ? (totalProfit / totalLoss).toFixed(2)
            : totalProfit > 0 ? '∞' : '0.00';
        
        // 期待値（円/トレード） - 計算ロジック検証_要件定義書 Q6=A 準拠
        // 仕様書 v1.16 の公式: 期待値 = 勝率 × 平均利益 - (1-勝率) × 平均損失
        // 下式 (totalProfit - totalLoss) / totalTrades は数学的に等価:
        //   = (wins × avgProfit - losses × avgLoss) / totalTrades
        //   = (wins/totalTrades) × avgProfit - (losses/totalTrades) × avgLoss
        //   = winRate × avgProfit - lossRate × avgLoss  ✅ 仕様書通り
        const totalTrades = wins + losses;
        const expectedValue = totalTrades > 0
            ? Math.round((totalProfit - totalLoss) / totalTrades)
            : 0;
        
        // 平均利益/損失
        const avgProfit = wins > 0 ? Math.round(totalProfit / wins) : 0;
        const avgLoss = losses > 0 ? Math.round(totalLoss / losses) : 0;
        
        // リスクリワード比
        const rrRatio = avgLoss > 0 
            ? (avgProfit / avgLoss).toFixed(2)
            : avgProfit > 0 ? '∞' : '0.00';
        
        // 勝率
        const winRate = totalTrades > 0 
            ? ((wins / totalTrades) * 100).toFixed(1)
            : '0.0';
        
        // 最大DD%
        const maxDrawdownPercent = maxBalance > 0
            ? ((maxDrawdown / maxBalance) * 100).toFixed(1)
            : '0.0';
        
        return {
            winRate,
            totalProfitLoss: Math.round(totalProfit - totalLoss),
            profitFactor,
            expectedValue,
            maxDrawdown: Math.round(maxDrawdown),
            maxDrawdownPercent,
            avgProfit,
            avgLoss,
            rrRatio,
            totalProfit: Math.round(totalProfit),
            totalLoss: Math.round(totalLoss),
            wins,
            losses,
            totalTrades
        };
    }
    
    /**
     * 空の円建て統計データを返す
     * @private
     * @returns {Object} 空の統計データ
     */
    #getEmptyYenStats() {
        return {
            winRate: '0.0',
            totalProfitLoss: 0,
            profitFactor: '0.00',
            expectedValue: 0,
            maxDrawdown: 0,
            maxDrawdownPercent: '0.0',
            avgProfit: 0,
            avgLoss: 0,
            rrRatio: '0.00',
            totalProfit: 0,
            totalLoss: 0,
            wins: 0,
            losses: 0,
            totalTrades: 0
        };
    }
    
    /**
     * 円建て統計UIを更新
     * @private
     * @param {Object} stats - 円建て統計データ
     */
    #updateYenUI(stats) {
        // DOM要素を取得
        const elements = {
            pfValue: document.getElementById('pfValue'),
            expectedValueYen: document.getElementById('expectedValueYen'),
            totalProfitYen: document.getElementById('totalProfitYen'),
            avgProfitLossYen: document.getElementById('avgProfitLossYen'),
            rrRatioYen: document.getElementById('rrRatioYen'),
            maxDrawdownYen: document.getElementById('maxDrawdownYen')
        };
        
        // プロフィットファクター
        if (elements.pfValue) {
            elements.pfValue.textContent = stats.profitFactor;
            const pf = parseFloat(stats.profitFactor);
            elements.pfValue.className = 'stat-value ' + 
                (pf >= 1.5 ? 'positive' : pf >= 1.0 ? '' : 'negative');
        }
        
        // 期待値
        if (elements.expectedValueYen) {
            const sign = stats.expectedValue >= 0 ? '+' : '';
            elements.expectedValueYen.textContent = `${sign}¥${this.#formatNumber(stats.expectedValue)}`;
            elements.expectedValueYen.className = 'stat-value ' + 
                (stats.expectedValue >= 0 ? 'positive' : 'negative');
        }
        
        // 総損益
        if (elements.totalProfitYen) {
            const sign = stats.totalProfitLoss >= 0 ? '+' : '';
            elements.totalProfitYen.textContent = `${sign}¥${this.#formatNumber(stats.totalProfitLoss)}`;
            elements.totalProfitYen.className = 'stat-value ' + 
                (stats.totalProfitLoss >= 0 ? 'positive' : 'negative');
        }
        
        // 平均利益/損失
        if (elements.avgProfitLossYen) {
            elements.avgProfitLossYen.textContent = 
                `¥${this.#formatNumber(stats.avgProfit)} / ¥${this.#formatNumber(stats.avgLoss)}`;
        }
        
        // リスクリワード比
        if (elements.rrRatioYen) {
            elements.rrRatioYen.textContent = stats.rrRatio;
            const rr = parseFloat(stats.rrRatio);
            elements.rrRatioYen.className = 'stat-value ' + 
                (rr >= 2.0 ? 'positive' : rr >= 1.0 ? '' : 'negative');
        }
        
        // 最大ドローダウン
        if (elements.maxDrawdownYen) {
            elements.maxDrawdownYen.textContent = 
                `¥${this.#formatNumber(stats.maxDrawdown)} (${stats.maxDrawdownPercent}%)`;
            elements.maxDrawdownYen.className = 'stat-value negative';
        }
    }
    
    /**
     * Pips統計を計算
     * @private
     * @param {Array} trades - トレードデータ配列
     * @returns {Object} Pips統計データ
     */
    #calculatePipsStats(trades) {
        const totalTrades = trades.length;
        const wins = trades.filter(t => this.#calculateTradePips(t) > 0).length;
        const losses = totalTrades - wins;
        const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
        const totalPips = trades.reduce((sum, t) => sum + this.#calculateTradePips(t), 0).toFixed(1);
        
        return {
            totalTrades,
            wins,
            losses,
            winRate,
            totalPips
        };
    }
    
    /**
     * 円建て統計を計算（期間用）
     * @private
     * @param {Array} trades - トレードデータ配列
     * @returns {Object} 円建て統計データ
     */
    #calculateYenStats(trades) {
        const tradesWithYen = trades.filter(t => t.yenProfitLoss);
        const totalTrades = tradesWithYen.length;
        const wins = tradesWithYen.filter(t => t.yenProfitLoss.netProfit > 0).length;
        const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
        const totalProfitLoss = tradesWithYen.reduce((sum, t) => sum + t.yenProfitLoss.netProfit, 0);
        
        return {
            totalTrades,
            wins,
            losses: totalTrades - wins,
            winRate,
            totalProfitLoss: Math.round(totalProfitLoss)
        };
    }
    
    /**
     * 平均保有時間を計算
     * @private
     * @param {Array} trades - トレードデータ配列
     * @returns {string} 平均保有時間の文字列（例: "2日21時間"）
     */
    #calculateAvgHoldTime(trades) {
        if (!trades || trades.length === 0) {
            return '--';
        }
        
        let totalHoldTime = 0;
        let validCount = 0;
        
        trades.forEach(trade => {
            // entryTimeとexitDateの両方が存在するか確認
            if (trade.entryTime && trade.exitDate) {
                try {
                    const entryDate = new Date(trade.entryTime);
                    const exitDate = new Date(trade.exitDate);
                    const holdTime = exitDate - entryDate;
                    
                    // 正の値のみを集計（エラー回避）
                    if (holdTime > 0) {
                        totalHoldTime += holdTime;
                        validCount++;
                    }
                } catch (error) {
                    // 日付パースエラーは無視
                    console.warn('平均保有時間計算エラー:', error);
                }
            }
        });
        
        // 有効なデータがない場合
        if (validCount === 0) {
            return '--';
        }
        
        // 平均保有時間を計算
        const avgHoldTime = totalHoldTime / validCount;
        
        // 日数と時間に変換
        const avgDays = Math.floor(avgHoldTime / (1000 * 60 * 60 * 24));
        const avgHours = Math.floor((avgHoldTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        // 表示形式を決定
        if (avgDays > 0) {
            return `${avgDays}日${avgHours}時間`;
        } else if (avgHours > 0) {
            return `${avgHours}時間`;
        } else {
            const avgMinutes = Math.floor(avgHoldTime / (1000 * 60));
            return `${avgMinutes}分`;
        }
    }
    
    /**
     * Pips統計を計算（完全版）
     * @private
     * @param {Array} trades - トレードデータ配列
     * @returns {Object} 完全なPips統計データ
     */
    #calculatePipsStatsComplete(trades) {
        const totalTrades = trades.length;
        const winTrades = trades.filter(t => this.#calculateTradePips(t) > 0);  // ✅ 既存メソッド使用
        const lossTrades = trades.filter(t => this.#calculateTradePips(t) < 0);  // ✅ 既存メソッド使用
        const wins = winTrades.length;
        const losses = lossTrades.length;
        
        const totalPips = trades.reduce((sum, t) => sum + this.#calculateTradePips(t), 0);
        const avgWinPips = wins > 0 ? winTrades.reduce((sum, t) => sum + this.#calculateTradePips(t), 0) / wins : 0;
        const avgLossPips = losses > 0 ? lossTrades.reduce((sum, t) => sum + this.#calculateTradePips(t), 0) / losses : 0;
        const maxWinPips = wins > 0 ? Math.max(...winTrades.map(t => this.#calculateTradePips(t))) : 0;
        const maxLossPips = losses > 0 ? Math.min(...lossTrades.map(t => this.#calculateTradePips(t))) : 0;
        
        // 最大連勝・連敗を計算
        let maxWinStreak = 0;
        let maxLoseStreak = 0;
        let currentWinStreak = 0;
        let currentLoseStreak = 0;
        
        // トレードを日付順にソート（exit.timeで）
        const sortedTrades = [...trades].sort((a, b) => {
            const dateA = new Date(a.exits[a.exits.length - 1].time);
            const dateB = new Date(b.exits[b.exits.length - 1].time);
            return dateA - dateB;
        });
        
        sortedTrades.forEach(trade => {
            const tradePips = this.#calculateTradePips(trade);  // ✅ 既存メソッド使用
            if (tradePips > 0) {
                // 勝ちトレード
                currentWinStreak++;
                currentLoseStreak = 0;
                maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
            } else if (tradePips < 0) {
                // 負けトレード
                currentLoseStreak++;
                currentWinStreak = 0;
                maxLoseStreak = Math.max(maxLoseStreak, currentLoseStreak);
            }
            // pips === 0 の場合は何もしない
        });
        
        return {
            totalTrades,
            winLossRecord: `${wins}勝${losses}敗`,
            wins,
            losses,
            winRate: (totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) + '%' : '0.0%'),
            totalPips: totalPips.toFixed(1),
            avgHoldTime: this.#calculateAvgHoldTime(trades),
            rrRatio: (avgLossPips !== 0 ? (avgWinPips / Math.abs(avgLossPips)).toFixed(2) : '0.00'),
            riskReward: (avgLossPips !== 0 ? (avgWinPips / Math.abs(avgLossPips)).toFixed(2) : '0.00'),
            maxWinStreak: maxWinStreak,
            maxLoseStreak: maxLoseStreak,
            avgProfitPips: avgWinPips.toFixed(1),
            avgLossPips: avgLossPips.toFixed(1),
            maxWinPips: maxWinPips.toFixed(1),
            maxLossPips: maxLossPips.toFixed(1)
        };
    }
    
    /**
     * 円建て統計を計算（完全版）
     * @private
     * @param {Array} trades - トレードデータ配列
     * @returns {Object} 完全な円建て統計データ
     */
    #calculateYenStatsComplete(trades) {
        const tradesWithYen = trades.filter(t => t.yenProfitLoss);
        const totalTrades = tradesWithYen.length;
        const registeredTrades = trades.length;
        
        const winTrades = tradesWithYen.filter(t => t.yenProfitLoss.netProfit > 0);
        const lossTrades = tradesWithYen.filter(t => t.yenProfitLoss.netProfit < 0);
        const wins = winTrades.length;
        const losses = lossTrades.length;
        
        const totalProfitLoss = tradesWithYen.reduce((sum, t) => sum + t.yenProfitLoss.netProfit, 0);
        const totalProfit = winTrades.reduce((sum, t) => sum + t.yenProfitLoss.netProfit, 0);
        const totalLoss = Math.abs(lossTrades.reduce((sum, t) => sum + t.yenProfitLoss.netProfit, 0));
        
        const avgProfit = wins > 0 ? totalProfit / wins : 0;
        const avgLoss = losses > 0 ? totalLoss / losses : 0;
        const maxProfit = wins > 0 ? Math.max(...winTrades.map(t => t.yenProfitLoss.netProfit)) : 0;
        const maxLoss = losses > 0 ? Math.abs(Math.min(...lossTrades.map(t => t.yenProfitLoss.netProfit))) : 0;
        
        const pf = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : '0.00';
        const expectedValue = totalTrades > 0 ? Math.round(totalProfitLoss / totalTrades) : 0;
        
        // スワップ合計の計算
        const swapTotal = tradesWithYen.reduce((sum, t) => sum + (t.yenProfitLoss.swap || 0), 0);
        
        // 手数料合計の計算
        const commissionTotal = tradesWithYen.reduce((sum, t) => sum + (t.yenProfitLoss.commission || 0), 0);
        
        // 最大DD（ドローダウン）の計算
        let balance = 0;
        let maxBalance = 0;
        let maxDrawdown = 0;
        
        // トレードを時系列順にソート（entryTime順）
        const sortedTrades = [...tradesWithYen].sort((a, b) => 
            new Date(a.entryTime) - new Date(b.entryTime)
        );
        
        // 各トレード後の累積損益と最大DDを計算
        sortedTrades.forEach(trade => {
            balance += trade.yenProfitLoss.netProfit;
            
            // 最大残高を更新
            if (balance > maxBalance) {
                maxBalance = balance;
            }
            
            // ドローダウン計算（最大残高 - 現在残高）
            const drawdown = maxBalance - balance;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        });
        
        // 最大DD%を計算
        const maxDrawdownPercent = maxBalance > 0
            ? ((maxDrawdown / maxBalance) * 100).toFixed(1)
            : '0.0';
        
        return {
            registeredCount: totalTrades,
            totalTrades: registeredTrades,
            registrationStatus: `${totalTrades}/${registeredTrades}`, // 追加: "50/50"形式
            registrationRate: registeredTrades > 0 ? ((totalTrades / registeredTrades) * 100).toFixed(0) : '0',
            winRate: (totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) + '%' : '0.0%'),
            totalProfitLoss: Math.round(totalProfitLoss),
            profitFactor: pf,
            expectedValue: expectedValue,
            avgProfit: Math.round(avgProfit),
            avgLoss: Math.round(avgLoss),
            maxProfit: Math.round(maxProfit),
            maxLoss: Math.round(maxLoss),
            maxDrawdown: Math.round(maxDrawdown),
            maxDrawdownPercent: maxDrawdownPercent,
            swapTotal: Math.round(swapTotal),
            commissionTotal: Math.round(commissionTotal)
        };
    }
}

// 即座に初期化（シングルトン）
window.StatisticsModule = new StatisticsModule();

// デバッグ出力
console.log('StatisticsModule loaded:', window.StatisticsModule.getStatus());