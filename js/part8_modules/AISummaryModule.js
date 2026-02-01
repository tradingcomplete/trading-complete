/**
 * @module AISummaryModule
 * @description AI参照用のトレードサマリーを生成するモジュール
 * 将来のAIアシスタント機能のためのデータ集計基盤
 * @author AI Assistant / コンパナ
 * @version 1.0.0
 * @created 2026-01-31
 * @important UIは持たない。計算とデータ生成のみ。
 */
class AISummaryModule {
    // ================
    // Private Fields
    // ================
    #tradeManager = null;
    #eventBus = null;
    // settingsModuleは遅延取得のためフィールド不要
    #initialized = false;
    
    constructor() {
        // 依存の注入
        this.#tradeManager = window.TradeManager?.getInstance();
        this.#eventBus = window.eventBus;
        // settingsModuleは使用時に取得（遅延取得パターン）
        
        // 初期化
        this.#initialize();
    }
    
    // ================
    // Private Methods
    // ================
    
    /**
     * 初期化処理
     * @private
     */
    #initialize() {
        if (this.#initialized) return;
        
        console.log('AISummaryModule 初期化:', {
            hasTradeManager: !!this.#tradeManager,
            hasEventBus: !!this.#eventBus,
            hasSettingsModule: !!window.SettingsModule
        });
        
        this.#initialized = true;
    }
    
    /**
     * 期間でトレードをフィルタリング
     * @private
     * @param {Array} trades - 全トレード
     * @param {string} periodType - 'monthly' | 'quarterly' | 'yearly'
     * @param {number} year - 年
     * @param {number} [month] - 月（monthlyの場合）
     * @returns {Array} フィルタリングされたトレード
     */
    #filterTradesByPeriod(trades, periodType, year, month) {
        return trades.filter(trade => {
            // 決済済みのみ
            if (!trade.exits || trade.exits.length === 0) return false;
            
            const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
            const exitYear = exitDate.getFullYear();
            const exitMonth = exitDate.getMonth() + 1;
            
            switch (periodType) {
                case 'monthly':
                    return exitYear === year && exitMonth === month;
                case 'quarterly':
                    const quarter = Math.ceil(month / 3);
                    const startMonth = (quarter - 1) * 3 + 1;
                    const endMonth = quarter * 3;
                    return exitYear === year && exitMonth >= startMonth && exitMonth <= endMonth;
                case 'yearly':
                    return exitYear === year;
                default:
                    return true;
            }
        });
    }
    
    /**
     * 基本統計を計算
     * @private
     * @param {Array} trades - トレード配列
     * @returns {Object} 基本統計
     */
    #calculateBasicStats(trades) {
        const stats = {
            totalTrades: 0,
            winCount: 0,
            lossCount: 0,
            winRate: 0,
            totalPips: 0,
            averagePips: 0,
            totalYenProfit: 0,
            averageYenProfit: 0,
            maxWin: 0,
            maxLoss: 0,
            profitFactor: 0
        };
        
        if (trades.length === 0) return stats;
        
        let totalProfit = 0;
        let totalLoss = 0;
        let yenCount = 0;
        
        trades.forEach(trade => {
            stats.totalTrades++;
            
            // Pips計算
            const pips = parseFloat(trade.pips) || 0;
            stats.totalPips += pips;
            
            if (pips > 0) {
                stats.winCount++;
                totalProfit += pips;
                if (pips > stats.maxWin) stats.maxWin = pips;
            } else if (pips < 0) {
                stats.lossCount++;
                totalLoss += Math.abs(pips);
                if (Math.abs(pips) > stats.maxLoss) stats.maxLoss = Math.abs(pips);
            }
            
            // 円建て損益
            const yenProfit = trade.yenProfitLoss?.netProfit;
            if (yenProfit !== undefined && yenProfit !== null) {
                stats.totalYenProfit += parseFloat(yenProfit) || 0;
                yenCount++;
            }
        });
        
        // 平均・率の計算
        stats.winRate = stats.totalTrades > 0 
            ? Math.round((stats.winCount / stats.totalTrades) * 1000) / 10 
            : 0;
        stats.averagePips = stats.totalTrades > 0 
            ? Math.round((stats.totalPips / stats.totalTrades) * 10) / 10 
            : 0;
        stats.averageYenProfit = yenCount > 0 
            ? Math.round(stats.totalYenProfit / yenCount) 
            : 0;
        stats.profitFactor = totalLoss > 0 
            ? Math.round((totalProfit / totalLoss) * 100) / 100 
            : totalProfit > 0 ? 999 : 0;
        
        // 数値の丸め
        stats.totalPips = Math.round(stats.totalPips * 10) / 10;
        stats.maxWin = Math.round(stats.maxWin * 10) / 10;
        stats.maxLoss = Math.round(stats.maxLoss * 10) / 10;
        stats.totalYenProfit = Math.round(stats.totalYenProfit);
        
        return stats;
    }
    
    /**
     * ルール遵守統計を計算
     * @private
     * @param {Array} trades - トレード配列
     * @returns {Object} ルール遵守統計
     */
    #calculateRuleCompliance(trades) {
        const stats = {
            totalWithReflection: 0,
            followedCount: 0,
            notFollowedCount: 0,
            followedRate: 0,
            followedStats: { count: 0, wins: 0, winRate: 0, totalPips: 0, avgPips: 0 },
            notFollowedStats: { count: 0, wins: 0, winRate: 0, totalPips: 0, avgPips: 0 }
        };
        
        const followed = [];
        const notFollowed = [];
        
        trades.forEach(trade => {
            // reflection.ruleFollowed または ruleFollowed を確認
            const ruleFollowed = trade.reflection?.ruleFollowed ?? trade.ruleFollowed;
            
            if (ruleFollowed === undefined || ruleFollowed === null) return;
            
            stats.totalWithReflection++;
            
            if (ruleFollowed === true || ruleFollowed === 'yes') {
                stats.followedCount++;
                followed.push(trade);
            } else if (ruleFollowed === false || ruleFollowed === 'no') {
                stats.notFollowedCount++;
                notFollowed.push(trade);
            }
        });
        
        // 遵守率
        stats.followedRate = stats.totalWithReflection > 0
            ? Math.round((stats.followedCount / stats.totalWithReflection) * 1000) / 10
            : 0;
        
        // 遵守時の統計
        if (followed.length > 0) {
            const wins = followed.filter(t => parseFloat(t.pips) > 0).length;
            const totalPips = followed.reduce((sum, t) => sum + (parseFloat(t.pips) || 0), 0);
            stats.followedStats = {
                count: followed.length,
                wins: wins,
                winRate: Math.round((wins / followed.length) * 1000) / 10,
                totalPips: Math.round(totalPips * 10) / 10,
                avgPips: Math.round((totalPips / followed.length) * 10) / 10
            };
        }
        
        // 非遵守時の統計
        if (notFollowed.length > 0) {
            const wins = notFollowed.filter(t => parseFloat(t.pips) > 0).length;
            const totalPips = notFollowed.reduce((sum, t) => sum + (parseFloat(t.pips) || 0), 0);
            stats.notFollowedStats = {
                count: notFollowed.length,
                wins: wins,
                winRate: Math.round((wins / notFollowed.length) * 1000) / 10,
                totalPips: Math.round(totalPips * 10) / 10,
                avgPips: Math.round((totalPips / notFollowed.length) * 10) / 10
            };
        }
        
        return stats;
    }
    
    /**
     * リスク管理統計を計算
     * @private
     * @param {Array} trades - トレード配列
     * @returns {Object} リスク管理統計
     */
    #calculateRiskManagement(trades) {
        const stats = {
            totalWithRiskStatus: 0,
            normalCount: 0,
            warningCount: 0,
            dangerCount: 0,
            withinToleranceRate: 0,
            normalStats: { count: 0, wins: 0, winRate: 0, totalPips: 0, avgPips: 0 },
            warningStats: { count: 0, wins: 0, winRate: 0, totalPips: 0, avgPips: 0 },
            dangerStats: { count: 0, wins: 0, winRate: 0, totalPips: 0, avgPips: 0 }
        };
        
        const normal = [];
        const warning = [];
        const danger = [];
        
        trades.forEach(trade => {
            const riskStatus = trade.riskStatus;
            
            if (!riskStatus) return;
            
            stats.totalWithRiskStatus++;
            
            switch (riskStatus) {
                case 'normal':
                    stats.normalCount++;
                    normal.push(trade);
                    break;
                case 'warning':
                    stats.warningCount++;
                    warning.push(trade);
                    break;
                case 'danger':
                    stats.dangerCount++;
                    danger.push(trade);
                    break;
            }
        });
        
        // 許容内率（normal）
        stats.withinToleranceRate = stats.totalWithRiskStatus > 0
            ? Math.round((stats.normalCount / stats.totalWithRiskStatus) * 1000) / 10
            : 0;
        
        // 各ステータスの統計を計算するヘルパー
        const calcGroupStats = (group) => {
            if (group.length === 0) return { count: 0, wins: 0, winRate: 0, totalPips: 0, avgPips: 0 };
            const wins = group.filter(t => parseFloat(t.pips) > 0).length;
            const totalPips = group.reduce((sum, t) => sum + (parseFloat(t.pips) || 0), 0);
            return {
                count: group.length,
                wins: wins,
                winRate: Math.round((wins / group.length) * 1000) / 10,
                totalPips: Math.round(totalPips * 10) / 10,
                avgPips: Math.round((totalPips / group.length) * 10) / 10
            };
        };
        
        stats.normalStats = calcGroupStats(normal);
        stats.warningStats = calcGroupStats(warning);
        stats.dangerStats = calcGroupStats(danger);
        
        return stats;
    }
    
    /**
     * 手法別統計を計算
     * @private
     * @param {Array} trades - トレード配列
     * @returns {Object} 手法別統計
     */
    #calculateMethodStats(trades) {
        const methodMap = new Map();
        
        trades.forEach(trade => {
            const methodId = trade.methodId || 'none';
            
            if (!methodMap.has(methodId)) {
                methodMap.set(methodId, []);
            }
            methodMap.get(methodId).push(trade);
        });
        
        const stats = {};
        
        methodMap.forEach((methodTrades, methodId) => {
            // 手法名を取得
            let methodName = '未設定';
            if (methodId !== 'none') {
                const settingsModule = window.SettingsModule;
                if (settingsModule) {
                    const method = settingsModule.getMethodById(methodId);
                    if (method) {
                        methodName = method.shortName || method.name || '未設定';
                    }
                }
            }
            
            const wins = methodTrades.filter(t => parseFloat(t.pips) > 0).length;
            const totalPips = methodTrades.reduce((sum, t) => sum + (parseFloat(t.pips) || 0), 0);
            const totalYen = methodTrades.reduce((sum, t) => {
                const yen = t.yenProfitLoss?.netProfit;
                return sum + (yen !== undefined && yen !== null ? parseFloat(yen) : 0);
            }, 0);
            
            stats[methodId] = {
                methodId: methodId,
                methodName: methodName,
                count: methodTrades.length,
                wins: wins,
                losses: methodTrades.length - wins,
                winRate: Math.round((wins / methodTrades.length) * 1000) / 10,
                totalPips: Math.round(totalPips * 10) / 10,
                avgPips: Math.round((totalPips / methodTrades.length) * 10) / 10,
                totalYen: Math.round(totalYen),
                avgYen: Math.round(totalYen / methodTrades.length)
            };
        });
        
        return stats;
    }
    
    // ================
    // Public API
    // ================
    
    /**
     * 指定期間のサマリーを生成
     * @public
     * @param {string} periodType - 'monthly' | 'quarterly' | 'yearly'
     * @param {number} year - 年
     * @param {number} [month] - 月（monthlyの場合は1-12、quarterlyの場合は四半期1-4）
     * @returns {Object} サマリーデータ
     */
    generateSummary(periodType = 'monthly', year, month) {
        try {
            // デフォルト値
            if (!year) {
                const now = new Date();
                year = now.getFullYear();
                month = month || now.getMonth() + 1;
            }
            
            // 全トレード取得
            const allTrades = this.#tradeManager?.getAllTrades() || [];
            
            // 期間でフィルタリング
            const trades = this.#filterTradesByPeriod(allTrades, periodType, year, month);
            
            // 期間テキスト生成
            let periodText = '';
            switch (periodType) {
                case 'monthly':
                    periodText = `${year}年${month}月`;
                    break;
                case 'quarterly':
                    periodText = `${year}年Q${month}`;
                    break;
                case 'yearly':
                    periodText = `${year}年`;
                    break;
            }
            
            // サマリー生成
            const summary = {
                period: periodText,
                periodType: periodType,
                year: year,
                month: month,
                generatedAt: new Date().toISOString(),
                basic: this.#calculateBasicStats(trades),
                ruleCompliance: this.#calculateRuleCompliance(trades),
                riskManagement: this.#calculateRiskManagement(trades),
                methodStats: this.#calculateMethodStats(trades)
            };
            
            console.log('AISummaryModule.generateSummary:', summary);
            
            // イベント発火
            this.#eventBus?.emit('aiSummary:generated', summary);
            
            return summary;
            
        } catch (error) {
            console.error('AISummaryModule.generateSummary error:', error);
            return null;
        }
    }
    
    /**
     * AI向けのテキストサマリーを生成
     * @public
     * @param {string} periodType - 'monthly' | 'quarterly' | 'yearly'
     * @param {number} year - 年
     * @param {number} [month] - 月
     * @returns {string} テキスト形式のサマリー
     */
    generateTextSummary(periodType = 'monthly', year, month) {
        const summary = this.generateSummary(periodType, year, month);
        if (!summary) return '';
        
        const { basic, ruleCompliance, riskManagement, methodStats } = summary;
        
        let text = `## ${summary.period} トレードサマリー\n\n`;
        
        // 基本統計
        text += `### 基本統計\n`;
        text += `- 総トレード数: ${basic.totalTrades}件\n`;
        text += `- 勝率: ${basic.winRate}% (${basic.winCount}勝${basic.lossCount}敗)\n`;
        text += `- 総Pips: ${basic.totalPips > 0 ? '+' : ''}${basic.totalPips}pips\n`;
        text += `- 平均Pips: ${basic.averagePips > 0 ? '+' : ''}${basic.averagePips}pips\n`;
        text += `- 円建て総損益: ${basic.totalYenProfit > 0 ? '+' : ''}¥${basic.totalYenProfit.toLocaleString()}\n`;
        text += `- プロフィットファクター: ${basic.profitFactor}\n\n`;
        
        // ルール遵守
        if (ruleCompliance.totalWithReflection > 0) {
            text += `### ルール遵守分析\n`;
            text += `- ルール遵守率: ${ruleCompliance.followedRate}%\n`;
            text += `- 遵守時の勝率: ${ruleCompliance.followedStats.winRate}% (${ruleCompliance.followedStats.count}件)\n`;
            text += `- 非遵守時の勝率: ${ruleCompliance.notFollowedStats.winRate}% (${ruleCompliance.notFollowedStats.count}件)\n\n`;
        }
        
        // リスク管理
        if (riskManagement.totalWithRiskStatus > 0) {
            text += `### リスク管理分析\n`;
            text += `- 許容損失内率: ${riskManagement.withinToleranceRate}%\n`;
            text += `- 許容内(✅)の勝率: ${riskManagement.normalStats.winRate}% (${riskManagement.normalStats.count}件)\n`;
            text += `- 注意(⚠️)の勝率: ${riskManagement.warningStats.winRate}% (${riskManagement.warningStats.count}件)\n`;
            text += `- 超過(🚨)の勝率: ${riskManagement.dangerStats.winRate}% (${riskManagement.dangerStats.count}件)\n\n`;
        }
        
        // 手法別
        const methodKeys = Object.keys(methodStats);
        if (methodKeys.length > 0) {
            text += `### 手法別分析\n`;
            methodKeys.forEach(key => {
                const m = methodStats[key];
                text += `- ${m.methodName}: ${m.winRate}% (${m.count}件, ${m.totalPips > 0 ? '+' : ''}${m.totalPips}pips)\n`;
            });
        }
        
        return text;
    }
    
    /**
     * モジュールの状態を取得
     * @public
     * @returns {Object} ステータス
     */
    getStatus() {
        return {
            initialized: this.#initialized,
            hasTradeManager: !!this.#tradeManager,
            hasEventBus: !!this.#eventBus,
            hasSettingsModule: !!window.SettingsModule
        };
    }
}

// グローバル登録
window.AISummaryModule = new AISummaryModule();