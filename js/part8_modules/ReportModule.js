/**
 * @module ReportModule
 * @description トレードレポートの生成を管理するモジュール
 * @author AI Assistant / コンパナ
 * @version 1.0.0
 * @important UIの変更は原則禁止。見た目は既存のまま維持すること。
 */
class ReportModule {
    // プライベートフィールド
    #tradeManager = null;
    #eventBus = null;
    #initialized = false;
    
    // ページネーション状態管理
    #pagination = {
        pairAnalysis: { currentPage: 1, perPage: 10 },
        tradeHistory: { currentPage: 1, perPage: 10 },
        reflectionList: { currentPage: 1, perPage: 10 }
    };
    
    // アコーディオン状態管理
    #accordionStates = {
        pairAnalysis: false,
        dayAnalysis: false,
        sessionAnalysis: false,  // セッション別分析（v2.0追加）
        tradeHistory: false,  // 初期状態は閉じている
        ruleRiskAnalysis: false,  // ルール遵守・リスク分析（Phase 5追加）
        reflectionList: false
    };
    
    constructor() {
        // 依存の注入
        this.#tradeManager = window.TradeManager?.getInstance();
        this.#eventBus = window.eventBus;
        
        // 初期化
        this.#initialize();
    }
    
    // ==================== セッション判定（DST自動対応） ====================
    
    /**
     * 米国DST（夏時間）判定
     * ルール: 3月第2日曜日〜11月第1日曜日（2007年〜 Energy Policy Act準拠）
     * @private
     * @param {Date} date - 判定する日付
     * @returns {boolean} true = 夏時間期間中
     */
    #isUSDaylightSaving(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // 1-12

        // 4月〜10月は確実に夏時間
        if (month >= 4 && month <= 10) return true;
        // 12月〜2月は確実に冬時間
        if (month === 12 || month <= 2) return false;

        // 3月: 第2日曜日以降が夏時間
        if (month === 3) {
            const firstDay = new Date(year, 2, 1).getDay();
            const secondSunday = firstDay === 0 ? 8 : (7 - firstDay) + 8;
            return date.getDate() >= secondSunday;
        }

        // 11月: 第1日曜日より前が夏時間
        if (month === 11) {
            const firstDay = new Date(year, 10, 1).getDay();
            const firstSunday = firstDay === 0 ? 1 : (7 - firstDay) + 1;
            return date.getDate() < firstSunday;
        }

        return false;
    }

    /**
     * エントリー時間からセッション名を取得（DST自動対応）
     *
     * 夏時間: オセアニア 3-9時 / 東京 9-15時 / ロンドン 15-21時 / NY 21-3時
     * 冬時間: オセアニア 3-9時 / 東京 9-16時 / ロンドン 16-22時 / NY 22-3時
     *
     * @param {Date} date - エントリー日時（JST）
     * @returns {string} 'oceania' | 'tokyo' | 'london' | 'ny'
     */
    getTradeSession(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            return 'tokyo';
        }

        const hour = date.getHours();
        const isDST = this.#isUSDaylightSaving(date);

        if (isDST) {
            if (hour >= 3 && hour < 9)  return 'oceania';
            if (hour >= 9 && hour < 15) return 'tokyo';
            if (hour >= 15 && hour < 21) return 'london';
            return 'ny';
        } else {
            if (hour >= 3 && hour < 9)  return 'oceania';
            if (hour >= 9 && hour < 16) return 'tokyo';
            if (hour >= 16 && hour < 22) return 'london';
            return 'ny';
        }
    }

    /**
     * セッションキーから日本語表示名を取得
     * @param {string} sessionKey - 'oceania' | 'tokyo' | 'london' | 'ny'
     * @returns {string} 日本語表示名
     */
    getSessionDisplayName(sessionKey) {
        const names = {
            oceania: 'オセアニア',
            tokyo: '東京',
            london: 'ロンドン',
            ny: 'ニューヨーク'
        };
        return names[sessionKey] || sessionKey;
    }
    
    // ================
    // Public API（外部公開）
    // ================
    
    /**
     * メインレポート生成関数
     * @public
     * @param {string} type - レポートタイプ（weekly/monthly/quarterly/yearly）
     * @param {number} year - 年（オプション）
     * @param {number} month - 月（オプション、1-12）
     * @returns {void}
     */
    generateReport(type, year, month) {
        try {
            window.currentReportType = type;
            
            // 引数で year が渡されていない場合は reportMonth から取得
            // ※ yearly の場合は month が null でも正常
            if (!year) {
                const reportDate = document.getElementById('reportMonth')?.value;
                
                if (reportDate) {
                    [year, month] = reportDate.split('-').map(Number);
                } else {
                    // デフォルト値：現在の年月
                    const now = new Date();
                    year = now.getFullYear();
                    month = now.getMonth() + 1;
                }
            }
            
            // currentReportDateを設定
            // weekly: 週番号が渡されるので年の1月1日を設定 + currentWeekNumber更新
            // yearly: monthがnullなので1月1日を設定
            // monthly/quarterly: monthを使用
            if (type === 'weekly') {
                window.currentReportDate = new Date(year, 0); // 1月1日
                window.currentWeekNumber = month || 1; // 週番号を設定
                window.currentWeekMode = 'isoWeek'; // ISO週モードを使用
            } else if (type === 'yearly') {
                window.currentReportDate = new Date(year, 0); // 1月1日
            } else {
                window.currentReportDate = new Date(year, (month || 1) - 1);
            }
            
            let reportData;
            switch (type) {
                case 'weekly':
                    reportData = this.generateWeeklyReport();
                    break;
                case 'monthly':
                    reportData = this.generateMonthlyReport();
                    break;
                case 'quarterly':
                    reportData = this.generateQuarterlyReport();
                    break;
                case 'yearly':
                    reportData = this.generateYearlyReport();
                    break;
            }
            
            // ReportModule内のdisplayReportを使用
            this.#displayReport(reportData);
            
            // レポート表示後にグラフも更新
            setTimeout(() => {
                if (typeof window.updateMonthlyPerformanceChart === 'function') {
                    window.updateMonthlyPerformanceChart();
                }
            }, 100);
            
            // イベント発火
            this.#eventBus?.emit('report:generated', { type, data: reportData });
            
        } catch (error) {
            console.error('ReportModule.generateReport error:', error);
        }
    }
    
    /**
     * 月次レポート生成
     * @public
     * @returns {Object} レポートデータ
     */
    generateMonthlyReport() {
        const month = window.currentReportDate.getMonth();
        const year = window.currentReportDate.getFullYear();
        
        // TradeManagerから最新データを取得
        const allTrades = this.#tradeManager?.getAllTrades() || [];
        
        // 決済日時ベースでフィルタリング
        const monthlyTrades = allTrades.filter(t => {
            if (t.exits && t.exits.length > 0) {
                const exitDate = new Date(t.exits[t.exits.length - 1].time);
                return exitDate.getMonth() === month && exitDate.getFullYear() === year;
            }
            return false;
        });
        
        return this.#calculateReportData(monthlyTrades, `${year}年${month + 1}月`);
    }
    
    /**
     * 四半期レポート生成
     * @public
     * @returns {Object} レポートデータ
     */
    generateQuarterlyReport() {
        const month = window.currentReportDate.getMonth();
        const year = window.currentReportDate.getFullYear();
        const quarter = Math.floor(month / 3);
        const startMonth = quarter * 3;
        const endMonth = startMonth + 2;
        
        // TradeManagerから最新データを取得
        const allTrades = this.#tradeManager?.getAllTrades() || [];
        
        // 決済日時ベースでフィルタリング
        const quarterlyTrades = allTrades.filter(t => {
            if (t.exits && t.exits.length > 0) {
                const exitDate = new Date(t.exits[t.exits.length - 1].time);
                const tMonth = exitDate.getMonth();
                return tMonth >= startMonth && tMonth <= endMonth && exitDate.getFullYear() === year;
            }
            return false;
        });
        
        return this.#calculateReportData(quarterlyTrades, `${year}年 第${quarter + 1}四半期`);
    }
    
    /**
     * 年次レポート生成
     * @public
     * @returns {Object} レポートデータ
     */
    generateYearlyReport() {
        const year = window.currentReportDate.getFullYear();
        
        // TradeManagerから最新データを取得
        const allTrades = this.#tradeManager?.getAllTrades() || [];
        
        // 決済日時ベースでフィルタリング
        const yearlyTrades = allTrades.filter(t => {
            if (t.exits && t.exits.length > 0) {
                const exitDate = new Date(t.exits[t.exits.length - 1].time);
                return exitDate.getFullYear() === year;
            }
            return false;
        });
        
        return this.#calculateReportData(yearlyTrades, `${year}年`);
    }
    
    /**
     * 月次レポートを印刷用HTMLとして生成
     * @public
     * @returns {void}
     */
    printMonthlyReport() {
        try {
            const month = window.currentReportDate.getMonth();
            const year = window.currentReportDate.getFullYear();
            
            // TradeManagerからトレードデータ取得
            const allTrades = this.#tradeManager?.getAllTrades() || window.trades || [];
            
            // 対象月のトレードを取得（決済日時ベース）
            const monthlyTrades = allTrades.filter(t => {
                if (t.exits && t.exits.length > 0) {
                    const exitDate = new Date(t.exits[t.exits.length - 1].time);
                    return exitDate.getFullYear() === year && 
                           exitDate.getMonth() === month;
                }
                return false;
            });
            
            // 統計計算
            const stats = this.#calculateMonthlyStats(monthlyTrades);
            const bestTrades = this.#getBestTradesWithReflection(monthlyTrades, 3);
            const worstTrades = this.#getWorstTradesWithReflection(monthlyTrades, 3);
            const bestPractices = this.#extractBestPractices(monthlyTrades);
            const monthEndNote = this.#getMonthEndNote(year, month + 1);
            
            // 印刷用HTML
            const printHTML = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>${year}年${month + 1}月 トレードレポート</title>
    <style>
        body {
            font-family: 'Helvetica Neue', Arial, 'Hiragino Sans', sans-serif;
            max-width: 210mm;
            margin: 0 auto;
            padding: 12mm 15mm;
            color: #333;
            line-height: 1.4;
        }
        
        /* 統計グリッド（3カラム対応） */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .stats-grid-2col {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .stats-grid-4col {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 15px;
        }
        
        /* セクション区切り */
        .stats-divider {
            border-top: 1px solid #ddd;
            margin: 15px 0;
            padding-top: 15px;
        }
        
        .stats-subsection {
            margin-bottom: 20px;
        }
        
        .stats-subsection h3 {
            font-size: 16px;
            color: #2c3e50;
            margin: 0 0 10px 0;
            padding-bottom: 5px;
            border-bottom: 2px solid #3498db;
        }
        h1 {
            text-align: center;
            font-size: 20px;
            margin-bottom: 4px;
        }
        .date {
            text-align: center;
            color: #666;
            margin-bottom: 12px;
        }
        
        /* 月間サマリー */
        .summary-section {
            background: #f0f4f8;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .summary-section h2 {
            font-size: 20px;
            margin: 0 0 15px 0;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .summary-item {
            background: white;
            padding: 15px;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary-label {
            color: #666;
            font-size: 14px;
            margin-bottom: 5px;
        }
        .summary-value {
            font-size: 24px;
            font-weight: bold;
        }
        
        /* トレード一覧 */
        .trades-section {
            margin-bottom: 10px;
        }
        .trades-section h2 {
            font-size: 15px;
            padding-bottom: 4px;
            border-bottom: 2px solid #333;
            margin-bottom: 6px;
        }
        .trade-item {
            margin-bottom: 8px;
            padding: 8px 10px;
            background: #f9f9f9;
            border-radius: 5px;
            border-left: 4px solid #3498db;
        }
        .trade-header {
            display: flex;
            align-items: center;
            margin-bottom: 2px;
            font-size: 13px;
        }
        .trade-rank {
            font-size: 16px;
            margin-right: 10px;
        }
        .trade-date {
            margin-right: 15px;
            color: #666;
        }
        .trade-pair {
            font-weight: bold;
            margin-right: 15px;
        }
        .trade-pips {
            font-size: 14px;
            font-weight: bold;
        }
        .trade-reflection {
            color: #555;
            font-style: italic;
            padding-left: 30px;
            font-size: 10px;
            line-height: 1.4;
            word-break: break-all;
        }
        
        /* 色分け */
        .positive { color: #00ff88; }
        .negative { color: #ff4466; }
        .worst-trade { border-left-color: #ff4466; }
        
        /* ベストプラクティス */
        .practices-section {
            background: #f0f9ff;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        .practices-section h2 {
            font-size: 18px;
            margin-bottom: 15px;
            color: #2c3e50;
        }
        
        /* 月間総括 */
        .summary-memo {
            background: #fffdf0;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #f0e68c;
        }
        .summary-memo h2 {
            font-size: 18px;
            margin-bottom: 15px;
            color: #2c3e50;
        }
        
        /* 新しい統計セクション */
        .stats-section {
            margin-bottom: 10px;
            background: #f8f9fa;
            padding: 10px 14px;
            border-radius: 8px;
        }
        
        .stats-section h2 {
            font-size: 15px;
            margin: 0 0 6px 0;
            padding-bottom: 4px;
            border-bottom: 2px solid #3498db;
        }
        
        /* 6列グリッド */
        .stats-grid-6col {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 6px;
            margin-bottom: 6px;
        }
        
        .stat-item {
            background: white;
            padding: 5px 4px;
            border-radius: 5px;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .stat-label {
            font-size: 10px;
            color: #666;
            margin-bottom: 2px;
        }
        
        .stat-value {
            font-size: 14px;
            font-weight: bold;
            color: #333;
        }
        
        /* 色分け */
        .stat-value.positive {
            color: #00ff88;
        }
        
        .stat-value.negative {
            color: #ff4466;
        }
        
        /* トレードテーブル */
        .trades-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        
        .trades-table th,
        .trades-table td {
            padding: 8px;
            border: 1px solid #ddd;
            text-align: left;
        }
        
        .trades-table th {
            background: #f0f4f8;
            font-weight: bold;
        }
        
        .trades-table tr:nth-child(even) {
            background: #f9f9f9;
        }
        
        @media print {
            body { padding: 10mm; }
            
            /* ページ区切り制御 */
            
            /* Pips統計と円建て統計はベスト・ワーストと同じページ */
            .yen-stats {
                /* page-break-after: 削除（1ページに統合） */
            }
            
            /* ベスト・ワーストトレードを統計と同じページに */
            .best-worst-combined-section {
                page-break-after: always;
            }
            
            .best-trades-section {
                page-break-inside: avoid;
            }
            
            .worst-trades-section {
                page-break-inside: avoid;
            }
            
            /* ルール遵守・リスク分析セクション */
            .rule-risk-analysis-section {
                page-break-before: always;
                page-break-after: always;
            }
            
            /* 通貨ペア+曜日別は同じページに */
            .pair-day-analysis-section {
                page-break-before: always;
                page-break-inside: avoid;
            }
            
            /* トレード履歴の前で改ページ */
            .trade-history-section {
                page-break-before: always;
            }
            
            /* 月間総括メモの前で改ページ */
            .month-summary-note {
                page-break-before: always;
            }
            
            /* セクション内での改ページを防止 */
            .stats-section { page-break-inside: avoid; }
            .trades-section { page-break-inside: avoid; }
            .analysis-section { page-break-inside: avoid; }
            .trade-item { page-break-inside: avoid; }
            .summary-memo { page-break-inside: avoid; }
            
            /* タイトルの後の余白調整 */
            h1 {
                margin-bottom: 4px;
            }
        }
    </style>
</head>
<body>
    <h1>${year}年${month + 1}月 トレードレポート（決済日時ベース）</h1>
    <div class="date">作成日: ${new Date().toLocaleDateString('ja-JP')}</div>
    
    <!-- Pips統計（6列×2段） -->
    <div class="stats-section pips-stats">
        <h2>📊 Pips統計</h2>
        <div class="stats-grid-6col">
            <div class="stat-item">
                <div class="stat-label">総トレード</div>
                <div class="stat-value">${stats.totalTrades}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">勝敗</div>
                <div class="stat-value">${stats.wins}勝${stats.losses}敗</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">勝率</div>
                <div class="stat-value">${(stats.wins / stats.totalTrades * 100).toFixed(1)}%</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">総獲得Pips</div>
                <div class="stat-value ${stats.totalPips >= 0 ? 'positive' : 'negative'}">
                    ${stats.totalPips >= 0 ? '+' : ''}${stats.totalPips.toFixed(1)}
                </div>
            </div>
            <div class="stat-item">
                <div class="stat-label">平均保有時間</div>
                <div class="stat-value">${stats.avgHoldTime}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">R:R</div>
                <div class="stat-value">${stats.riskReward.toFixed(2)}</div>
            </div>
        </div>
        <div class="stats-grid-6col">
            <div class="stat-item">
                <div class="stat-label">最大連勝</div>
                <div class="stat-value">${stats.maxWinStreak}回</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">最大連敗</div>
                <div class="stat-value">${stats.maxLoseStreak}回</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">平均利益pips</div>
                <div class="stat-value positive">+${stats.avgWinPips.toFixed(1)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">平均損失pips</div>
                <div class="stat-value negative">${stats.avgLossPips.toFixed(1)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">最大獲得pips</div>
                <div class="stat-value positive">+${stats.maxWinPips.toFixed(1)}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">最大損失pips</div>
                <div class="stat-value negative">${stats.maxLossPips.toFixed(1)}</div>
            </div>
        </div>
    </div>
    
    <!-- 円建て統計（6列×2段） -->
    <div class="stats-section yen-stats">
        <h2>💰 円建て統計</h2>
        <div class="stats-grid-6col">
            <div class="stat-item">
                <div class="stat-label">円建て登録済</div>
                <div class="stat-value">
                    ${stats.yenRegistered}/${stats.totalTrades}
                    <span style="color: ${stats.yenRegistered === stats.totalTrades ? '#00ff88' : '#fbbf24'}">
                        ${stats.yenRegistered === stats.totalTrades ? '🟢' : '🟡'}
                    </span>
                </div>
            </div>
            <div class="stat-item">
                <div class="stat-label">勝率（純損益）</div>
                <div class="stat-value">${(stats.yenWins / stats.totalTrades * 100).toFixed(1)}%</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">総損益</div>
                <div class="stat-value ${stats.netProfit >= 0 ? 'positive' : 'negative'}">
                    ${stats.netProfit >= 0 ? '+' : ''}¥${Math.round(stats.netProfit).toLocaleString()}
                </div>
            </div>
            <div class="stat-item">
                <div class="stat-label">PF</div>
                <div class="stat-value">${stats.profitFactor}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">期待値</div>
                <div class="stat-value ${stats.expectancy >= 0 ? 'positive' : 'negative'}">
                    ${stats.expectancy >= 0 ? '+' : ''}¥${Math.round(stats.expectancy).toLocaleString()}
                </div>
            </div>
            <div class="stat-item">
                <div class="stat-label">平均利益</div>
                <div class="stat-value positive">+¥${Math.round(stats.avgProfit).toLocaleString()}</div>
            </div>
        </div>
        <div class="stats-grid-6col">
            <div class="stat-item">
                <div class="stat-label">平均損失</div>
                <div class="stat-value negative">¥${Math.round(Math.abs(stats.avgLoss)).toLocaleString()}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">最大利益</div>
                <div class="stat-value positive">+¥${Math.round(stats.maxProfit).toLocaleString()}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">最大損失</div>
                <div class="stat-value negative">¥${Math.round(Math.abs(stats.maxLoss)).toLocaleString()}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">最大DD</div>
                <div class="stat-value negative">¥${Math.round(Math.abs(stats.maxDrawdown)).toLocaleString()}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">スワップ損益</div>
                <div class="stat-value ${stats.totalSwap >= 0 ? 'positive' : 'negative'}">
                    ${stats.totalSwap >= 0 ? '+' : ''}¥${Math.round(stats.totalSwap).toLocaleString()}
                </div>
            </div>
            <div class="stat-item">
                <div class="stat-label">手数料合計</div>
                <div class="stat-value negative">¥${Math.round(Math.abs(stats.totalCommission)).toLocaleString()}</div>
            </div>
        </div>
    </div>
    
    <!-- ベスト・ワーストトレード（同一ページ） -->
    <div class="best-worst-combined-section">
        <div class="trades-section best-trades-section">
            <h2>🏆 ベストトレード TOP3</h2>
            ${bestTrades}
        </div>
        
        <div class="trades-section worst-trades-section" style="margin-top: 8px;">
            <h2>📉 ワーストトレード TOP3</h2>
            ${worstTrades}
        </div>
    </div>
    
    <!-- 通貨ペア + 曜日別分析（同一ページ） -->
    <div class="pair-day-analysis-section">
        <div style="margin-bottom: 30px;">
            <h4 style="color: #00ff88; margin-bottom: 15px;">💱 通貨ペア / 商品</h4>
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>通貨ペア</th>
                        <th>トレード数</th>
                        <th>勝敗</th>
                        <th>勝率</th>
                        <th>獲得Pips</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(stats.pairStats || {}).map(([pair, pairData]) => `
                        <tr>
                            <td>${pair}</td>
                            <td>${pairData.trades}</td>
                            <td>${pairData.wins}勝${pairData.losses}敗</td>
                            <td>${pairData.trades > 0 ? (pairData.wins / pairData.trades * 100).toFixed(1) : 0}%</td>
                            <td style="color: ${pairData.pips >= 0 ? '#00ff88' : '#ff4466'}">
                                ${pairData.pips >= 0 ? '+' : ''}${pairData.pips.toFixed(1)}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div>
            <h4 style="color: #00ff88; margin-bottom: 15px;">📅 曜日別分析（エントリー日時ベース）</h4>
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>曜日</th>
                        <th>トレード数</th>
                        <th>獲得Pips</th>
                        <th>平均Pips</th>
                    </tr>
                </thead>
                <tbody>
                    ${['日', '月', '火', '水', '木', '金', '土'].map((day, i) => {
                        const dayData = stats.dayStats[i] || { trades: 0, pips: 0 };
                        const avgPips = dayData.trades > 0 ? dayData.pips / dayData.trades : 0;
                        return `
                            <tr>
                                <td>${day}曜日</td>
                                <td>${dayData.trades}</td>
                                <td style="color: ${dayData.pips >= 0 ? '#00ff88' : '#ff4466'}">
                                    ${dayData.pips >= 0 ? '+' : ''}${dayData.pips.toFixed(1)}
                                </td>
                                <td style="color: ${avgPips >= 0 ? '#00ff88' : '#ff4466'}">
                                    ${avgPips >= 0 ? '+' : ''}${avgPips.toFixed(1)}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    </div>
    
    <div>
        <h4 style="color: #00ff88; margin-bottom: 15px;">🕐 セッション別分析</h4>
        <table class="trades-table">
            <thead>
                <tr>
                    <th>セッション</th>
                    <th>トレード数</th>
                    <th>勝敗</th>
                    <th>勝率</th>
                    <th>獲得Pips</th>
                </tr>
            </thead>
            <tbody>
                ${['tokyo', 'london', 'ny', 'oceania'].map(key => {
                    const s = stats.sessionStats?.[key] || { trades: 0, wins: 0, losses: 0, pips: 0 };
                    const winRate = s.trades > 0 ? (s.wins / s.trades * 100).toFixed(1) : '0.0';
                    return `
                        <tr>
                            <td>${window.getSessionDisplayName(key)}</td>
                            <td>${s.trades}</td>
                            <td>${s.wins}勝${s.losses}敗</td>
                            <td>${winRate}%</td>
                            <td style="color: ${s.pips >= 0 ? '#00ff88' : '#ff4466'}">
                                ${s.pips >= 0 ? '+' : ''}${s.pips.toFixed(1)}
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    </div>
    
    <!-- ルール遵守・リスク分析（Phase 5） -->
    <div class="rule-risk-analysis-section">
        <h2>⭕ ルール遵守・リスク分析</h2>
        ${this.#generatePrintRuleRiskAnalysis(monthlyTrades)}
    </div>
    
    <div class="recent-trades trade-history-section">
        <h4 style="color: #00ff88; margin-bottom: 15px;">📈 トレード履歴</h4>
        <table class="trades-table">
            <thead>
                <tr>
                    <th>決済日時</th>
                    <th>通貨ペア</th>
                    <th>結果</th>
                    <th>保有時間</th>
                </tr>
            </thead>
            <tbody>
                ${monthlyTrades.slice(0, 10).map(trade => {
                    const pips = this.#calculateTradePips(trade);
                    const entryDate = new Date(trade.entryTime || trade.entryDatetime || trade.date);
                    const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
                    const holdTime = exitDate - entryDate;
                    const hours = Math.floor(holdTime / (1000 * 60 * 60));
                    const days = Math.floor(hours / 24);
                    const remainingHours = hours % 24;
                    const holdTimeStr = days > 0 ? `${days}日${remainingHours}時間` : `${remainingHours}時間`;
                    
                    return `
                        <tr>
                            <td>${exitDate.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                            <td>${trade.pair}</td>
                            <td style="color: ${pips >= 0 ? '#00ff88' : '#ff4466'}; font-weight: bold;">
                                ${pips >= 0 ? '+' : ''}${pips.toFixed(1)} pips
                            </td>
                            <td>${holdTimeStr}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    </div>
    
    <!-- 月間総括メモ（手動） -->
    ${monthEndNote ? `
    <div class="summary-memo month-summary-note">
        <h2>📝 月間総括メモ</h2>
        ${monthEndNote}
    </div>
    ` : ''}
    
</body>
</html>`;
            
            // 新しいウィンドウで開く
            const printWindow = window.open('', '_blank', 'width=900,height=1200');
            printWindow.document.write(printHTML);
            printWindow.document.close();
            
            setTimeout(() => {
                printWindow.print();
            }, 500);
            
        } catch (error) {
            console.error('❌ ReportModule.printMonthlyReport error:', error);
        }
    }
    
    /**
     * 週次レポート生成
     * @public
     * @returns {Object} レポートデータ
     */
    generateWeeklyReport() {
        const month = window.currentReportDate.getMonth();
        const year = window.currentReportDate.getFullYear();
        
        let weekDates;
        let periodText;
        
        // TradeManagerから最新データを取得
        const allTrades = this.#tradeManager?.getAllTrades() || [];
        
        switch (window.currentWeekMode) {
            case 'monthWeek':
                // 既存の月内週処理
                weekDates = this.#getWeekDates(year, month, window.currentWeekNumber);
                periodText = `${year}年${month + 1}月 第${window.currentWeekNumber}週`;
                break;
                
            case 'fullWeek':
                // 完全週処理
                const fullWeeks = this.#getFullWeeksInMonth(year, month);
                if (window.currentWeekNumber <= fullWeeks.length) {
                    weekDates = fullWeeks[window.currentWeekNumber - 1];
                    periodText = `${year}年${month + 1}月 第${window.currentWeekNumber}週（完全週）`;
                }
                break;
                
            case 'isoWeek':
                // ISO週処理 - currentWeekNumberを直接ISO週番号として使用
                const isoWeekNumber = window.currentWeekNumber;
                
                // ISO週番号から週の開始日を計算
                const jan4 = new Date(year, 0, 4);
                const dayOfWeek = jan4.getDay() || 7;
                const firstMondayOfYear = new Date(jan4);
                firstMondayOfYear.setDate(jan4.getDate() - dayOfWeek + 1);
                
                const isoWeekStart = new Date(firstMondayOfYear);
                isoWeekStart.setDate(firstMondayOfYear.getDate() + (isoWeekNumber - 1) * 7);
                
                const isoWeekEnd = new Date(isoWeekStart);
                isoWeekEnd.setDate(isoWeekStart.getDate() + 6);
                isoWeekEnd.setHours(23, 59, 59, 999);
                
                weekDates = {
                    start: isoWeekStart,
                    end: isoWeekEnd
                };
                
                // 日付範囲をテキストで表示
                const startMonth = isoWeekStart.getMonth() + 1;
                const startDay = isoWeekStart.getDate();
                const endMonth = isoWeekEnd.getMonth() + 1;
                const endDay = isoWeekEnd.getDate();
                periodText = `${year}年第${isoWeekNumber}週（${startMonth}/${startDay}-${endMonth}/${endDay}）`;
                
                console.log('ReportModule isoWeek:', {
                    weekNumber: isoWeekNumber,
                    start: isoWeekStart.toISOString().split('T')[0],
                    end: isoWeekEnd.toISOString().split('T')[0]
                });
                break;
        }
        
        if (!weekDates) {
            return this.#calculateReportData([], periodText || '週次レポート');
        }
        
        // 決済日時ベースでフィルタリング
        const weeklyTrades = allTrades.filter(t => {
            if (t.exits && t.exits.length > 0) {
                const exitDate = new Date(t.exits[t.exits.length - 1].time);
                return exitDate >= weekDates.start && exitDate <= weekDates.end;
            }
            return false;
        });
        
        return this.#calculateReportData(weeklyTrades, periodText);
    }
    
    /**
     * レポート期間を更新
     * @public
     * @returns {void}
     */
    updateReportPeriod() {
        // 週次レポートの場合、週オプションも更新
        if (window.currentReportType === 'weekly') {
            this.#updateWeekOptions();
        }
        this.generateReport(window.currentReportType);
    }
    
    /**
     * 週選択の更新（HTML onchangeから呼ばれる）
     * @public
     * @returns {void}
     */
    updateWeekSelection() {
        this.#updateWeekSelection();
    }
    
    /**
     * 週モードの更新（HTML onchangeから呼ばれる）
     * @public
     * @returns {void}
     */
    updateWeekMode() {
        this.#updateWeekMode();
    }
    
    /**
     * トレード履歴のソート順切り替え（エントリー/決済）
     * @public
     * @returns {void}
     */
    toggleTradeSort() {
        window.currentTradeSort = window.currentTradeSort === 'entry' ? 'exit' : 'entry';
        this.generateReport(window.currentReportType);
    }
    
    /**
     * トレード履歴の並び順切り替え（昇順/降順）
     * @public
     * @returns {void}
     */
    toggleSortOrder() {
        window.currentSortOrder = window.currentSortOrder === 'desc' ? 'asc' : 'desc';
        this.generateReport(window.currentReportType);
    }
    
    /**
     * 期間変更時のレポート更新（index.htmlのchangePeriodから呼ばれる）
     * @public
     * @param {string} periodType - 期間タイプ（'weekly'/'monthly'/'quarterly'/'yearly'）
     * @param {number} year - 年
     * @param {number} period - 期間（週番号/月/四半期）
     * @returns {void}
     */
    handlePeriodChange(periodType, year, period) {
        try {
            let reportMonth = period;
            
            // 四半期の場合は最初の月を計算（Q1→1月, Q2→4月, Q3→7月, Q4→10月）
            if (periodType === 'quarterly') {
                reportMonth = (period - 1) * 3 + 1;
            }
            
            // 週次の場合は週番号とcurrentReportDateを正しく設定
            if (periodType === 'weekly') {
                window.currentWeekNumber = period;
                window.currentWeekMode = 'isoWeek';
                
                // ISO週から月を計算（週の木曜日が属する月）
                const jan4 = new Date(year, 0, 4);
                const dayOfWeek = jan4.getDay() || 7;
                const firstMonday = new Date(jan4);
                firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);
                
                const weekStart = new Date(firstMonday);
                weekStart.setDate(firstMonday.getDate() + (period - 1) * 7);
                
                // 週の木曜日で月を決定（ISO週の定義）
                const thursday = new Date(weekStart);
                thursday.setDate(weekStart.getDate() + 3);
                reportMonth = thursday.getMonth() + 1;
                
                console.log('ReportModule.handlePeriodChange 週次設定:', {
                    weekNumber: period,
                    weekStart: weekStart.toISOString().split('T')[0],
                    reportMonth: reportMonth
                });
            }
            
            console.log('ReportModule.handlePeriodChange:', {
                type: periodType,
                year: year,
                month: reportMonth,
                weekNumber: window.currentWeekNumber
            });
            
            this.generateReport(periodType, year, reportMonth);
            
        } catch (error) {
            console.error('ReportModule.handlePeriodChange error:', error);
        }
    }
    
    /**
     * アコーディオンの開閉トグル
     * @public
     * @param {string} sectionId - セクションID
     * @returns {void}
     */
    toggleAccordion(sectionId) {
        const content = document.getElementById(`${sectionId}-content`);
        const iconLeft = document.getElementById(`${sectionId}-icon`);
        const iconRight = document.getElementById(`${sectionId}-icon-right`);
        
        if (content && iconLeft) {
            if (content.style.display === 'none' || content.style.display === '') {
                // 開く
                content.style.display = 'block';
                iconLeft.textContent = '▲';
                if (iconRight) iconRight.textContent = '▲';
                this.#accordionStates[sectionId] = true;  // 状態を保存
            } else {
                // 閉じる
                content.style.display = 'none';
                iconLeft.textContent = '▼';
                if (iconRight) iconRight.textContent = '▼';
                this.#accordionStates[sectionId] = false;  // 状態を保存
            }
        }
    }
    
    /**
     * アコーディオン状態を復元
     * @private
     * @returns {void}
     */
    #restoreAccordionStates() {
        Object.keys(this.#accordionStates).forEach(sectionId => {
            const isOpen = this.#accordionStates[sectionId];
            const content = document.getElementById(`${sectionId}-content`);
            const iconLeft = document.getElementById(`${sectionId}-icon`);
            const iconRight = document.getElementById(`${sectionId}-icon-right`);
            
            if (content && iconLeft) {
                if (isOpen) {
                    content.style.display = 'block';
                    iconLeft.textContent = '▲';
                    if (iconRight) iconRight.textContent = '▲';
                } else {
                    content.style.display = 'none';
                    iconLeft.textContent = '▼';
                    if (iconRight) iconRight.textContent = '▼';
                }
            }
        });
    }
    
    /**
     * ページネーション変更
     * @public
     * @param {string} sectionId - セクションID
     * @param {string} action - アクション（'prev'/'next'/'perPage'）
     * @param {number} [value] - perPage変更時の値
     * @returns {void}
     */
    changePagination(sectionId, action, value) {
        const state = this.#pagination[sectionId];
        
        if (action === 'prev') {
            if (state.currentPage > 1) {
                state.currentPage--;
            }
        } else if (action === 'next') {
            state.currentPage++;
        } else if (action === 'perPage') {
            state.perPage = parseInt(value);
            state.currentPage = 1; // ページ数変更時は1ページ目に戻る
        }
        
        // レポートを再生成
        this.generateReport(window.currentReportType);
    }
    
    /**
     * 振り返りの展開/折りたたみ機能
     * @param {string} reflectionId - 振り返り要素のID
     * @param {Event} event - イベントオブジェクト
     */
    toggleReflection(reflectionId, event) {
        // 親要素へのイベント伝播を防ぐ
        if (event) {
            event.stopPropagation();
        }
        
        // 要素を取得
        const previewElement = document.getElementById(`${reflectionId}_preview`);
        const fullElement = document.getElementById(`${reflectionId}_full`);
        const arrowElement = document.getElementById(`${reflectionId}_arrow`);
        const textElement = document.getElementById(`${reflectionId}_text`);
        const toggleElement = document.getElementById(`${reflectionId}_toggle`);
        
        if (!previewElement || !fullElement) return;
        
        // 現在の状態を確認
        const isExpanded = fullElement.style.display !== 'none';
        
        if (isExpanded) {
            // 折りたたむ
            fullElement.style.opacity = '0';
            fullElement.style.maxHeight = '0';
            
            setTimeout(() => {
                fullElement.style.display = 'none';
                previewElement.style.display = 'block';
                
                // アニメーション付きで表示
                previewElement.style.opacity = '0';
                setTimeout(() => {
                    previewElement.style.transition = 'opacity 0.3s ease';
                    previewElement.style.opacity = '1';
                }, 10);
            }, 300);
            
            // アイコンとテキストを更新
            if (arrowElement) {
                arrowElement.style.transform = 'rotate(0deg)';
                arrowElement.textContent = '▼';
            }
            if (textElement) {
                textElement.textContent = ' 続きを読む...';
            }
            
        } else {
            // 展開する
            previewElement.style.opacity = '0';
            
            setTimeout(() => {
                previewElement.style.display = 'none';
                fullElement.style.display = 'block';
                
                // アニメーション付きで展開
                setTimeout(() => {
                    fullElement.style.opacity = '1';
                    fullElement.style.maxHeight = '2000px'; // 十分な高さ
                }, 10);
            }, 200);
            
            // アイコンを変更
            if (arrowElement) {
                arrowElement.style.transform = 'rotate(0deg)';
                arrowElement.textContent = '▲';
            }
            if (textElement) {
                textElement.textContent = ' 折りたたむ';
            }
        }
    }
    
    /**
     * レポートタイプを切り替え
     * @public
     * @param {string} type - レポートタイプ
     * @returns {void}
     */
    switchReport(type) {
        window.currentReportType = type;
        
        // アクティブボタンの更新（イベントオブジェクトに依存しない方法）
        document.querySelectorAll('.report-btn').forEach(btn => {
            btn.classList.remove('active');
            
            // クリックされたボタンに対応するレポートタイプをチェック
            const btnOnclick = btn.getAttribute('onclick');
            if (btnOnclick && btnOnclick.includes(`'${type}'`)) {
                btn.classList.add('active');
            }
        });
        
        // 週選択の表示/非表示
        const weekSelector = document.getElementById('weekSelector');
        if (weekSelector) {
            weekSelector.style.display = type === 'weekly' ? 'inline-block' : 'none';
        }
        
        // 週次レポートの場合、週オプションを更新
        if (type === 'weekly') {
            this.#updateWeekOptions();
        }
        
        this.generateReport(type);
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
            tradeCount: this.#tradeManager?.getAllTrades()?.length || 0
        };
    }
    
    // ================
    // Private Methods（内部のみ）
    // ================
    
    /**
     * トレードのPipsを計算
     * @private
     * @param {Object} trade - トレードデータ
     * @returns {number} Pips値
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
     * 初期化
     * @private
     */
    #initialize() {
        // EventBusにリスナー登録
        this.#bindEvents();
        
        // グローバル関数の置き換え
        this.#replaceGlobalFunctions();
        
        console.log('ReportModule initialized');
        this.#initialized = true;
    }
    
    /**
     * イベントバインド
     * @private
     */
    #bindEvents() {
        if (this.#eventBus) {
            // トレード追加/編集/削除時にレポートを自動更新
            this.#eventBus.on('trade:added', () => {
                if (window.currentReportType) {
                    this.generateReport(window.currentReportType);
                }
            });
            this.#eventBus.on('trade:updated', () => {
                if (window.currentReportType) {
                    this.generateReport(window.currentReportType);
                }
            });
            this.#eventBus.on('trade:deleted', () => {
                if (window.currentReportType) {
                    this.generateReport(window.currentReportType);
                }
            });
            this.#eventBus.on('bulk:imported', () => {
                if (window.currentReportType) {
                    this.generateReport(window.currentReportType);
                }
            });
        }
    }
    
    /**
     * グローバル関数の置き換え
     * @private
     */
    #replaceGlobalFunctions() {
        // 既存の関数を保存
        if (typeof window.generateReport === 'function') {
            window.generateReport_original = window.generateReport;
        }
        if (typeof window.generateMonthlyReport === 'function') {
            window.generateMonthlyReport_original = window.generateMonthlyReport;
        }
        if (typeof window.generateQuarterlyReport === 'function') {
            window.generateQuarterlyReport_original = window.generateQuarterlyReport;
        }
        if (typeof window.generateYearlyReport === 'function') {
            window.generateYearlyReport_original = window.generateYearlyReport;
        }
        if (typeof window.generateWeeklyReport === 'function') {
            window.generateWeeklyReport_original = window.generateWeeklyReport;
        }
        if (typeof window.switchReport === 'function') {
            window.switchReport_original = window.switchReport;
        }
        if (typeof window.updateReportPeriod === 'function') {
            window.updateReportPeriod_original = window.updateReportPeriod;
        }
        
        // 新しい関数で置き換え
        window.generateReport = (type, year, month) => this.generateReport(type, year, month);
        window.generateMonthlyReport = () => this.generateMonthlyReport();
        window.generateQuarterlyReport = () => this.generateQuarterlyReport();
        window.generateYearlyReport = () => this.generateYearlyReport();
        window.generateWeeklyReport = () => this.generateWeeklyReport();
        window.switchReport = (type) => this.switchReport(type);
        window.updateReportPeriod = () => this.updateReportPeriod();
    }
    
    /**
     * レポートデータを計算（完全実装版）
     * @private
     * @param {Array} targetTrades - 対象トレード配列
     * @param {string} period - 期間テキスト
     * @returns {Object} レポートデータ
     */
    #calculateReportData(targetTrades, period) {
        const closedTrades = targetTrades.filter(t => t.exits && t.exits.length > 0);
        const openTrades = targetTrades.filter(t => !t.exits || t.exits.length === 0);
        
        let totalPips = 0;
        let wins = 0;
        let losses = 0;
        let maxWin = 0;
        let maxLoss = 0;
        let consecutiveWins = 0;
        let consecutiveLosses = 0;
        let currentWinStreak = 0;
        let currentLossStreak = 0;
        let totalRR = 0;
        
        const pairStats = {};
        const dayStats = {
            0: { trades: 0, pips: 0 }, // 日曜
            1: { trades: 0, pips: 0 }, // 月曜
            2: { trades: 0, pips: 0 }, // 火曜
            3: { trades: 0, pips: 0 }, // 水曜
            4: { trades: 0, pips: 0 }, // 木曜
            5: { trades: 0, pips: 0 }, // 金曜
            6: { trades: 0, pips: 0 }  // 土曜
        };
        
        // セッション別統計（DST自動対応）
        const sessionStats = {
            oceania: { trades: 0, wins: 0, losses: 0, pips: 0 },
            tokyo:   { trades: 0, wins: 0, losses: 0, pips: 0 },
            london:  { trades: 0, wins: 0, losses: 0, pips: 0 },
            ny:      { trades: 0, wins: 0, losses: 0, pips: 0 }
        };
        
        closedTrades.forEach(trade => {
            const pips = this.#calculateTradePips(trade);
            totalPips += pips;
            
            if (pips > 0) {
                wins++;
                maxWin = Math.max(maxWin, pips);
                currentWinStreak++;
                currentLossStreak = 0;
                consecutiveWins = Math.max(consecutiveWins, currentWinStreak);
            } else if (pips < 0) {
                losses++;
                maxLoss = Math.min(maxLoss, pips);
                currentLossStreak++;
                currentWinStreak = 0;
                consecutiveLosses = Math.max(consecutiveLosses, currentLossStreak);
            }
            
            // R:R計算
            const rr = window.calculateTradeRR(trade);
            if (rr !== null) {
                totalRR += rr;
            }
            
            // ペア別統計
            if (!pairStats[trade.pair]) {
                pairStats[trade.pair] = { trades: 0, wins: 0, losses: 0, pips: 0 };
            }
            pairStats[trade.pair].trades++;
            pairStats[trade.pair].pips += pips;
            if (pips > 0) pairStats[trade.pair].wins++;
            else if (pips < 0) pairStats[trade.pair].losses++;
            
            // 曜日別統計（エントリー日時ベース）
            const entryDate = new Date(trade.entryTime || trade.entryDatetime || trade.date);
            if (!isNaN(entryDate.getTime())) {
                const dayOfWeek = entryDate.getDay();
                dayStats[dayOfWeek].trades++;
                dayStats[dayOfWeek].pips += pips;
            }
            
            // セッション別統計（DST自動対応）
            if (!isNaN(entryDate.getTime())) {
                const session = this.getTradeSession(entryDate);
                sessionStats[session].trades++;
                sessionStats[session].pips += pips;
                if (pips > 0) sessionStats[session].wins++;
                else if (pips < 0) sessionStats[session].losses++;
            }
        });
        
        const winRate = closedTrades.length > 0 ? (wins / closedTrades.length * 100) : 0;
        const avgWin = wins > 0 ? (closedTrades.filter(t => this.#calculateTradePips(t) > 0).reduce((sum, t) => sum + this.#calculateTradePips(t), 0) / wins) : 0;
        const avgLoss = losses > 0 ? (closedTrades.filter(t => this.#calculateTradePips(t) < 0).reduce((sum, t) => sum + this.#calculateTradePips(t), 0) / losses) : 0;
        const avgRR = closedTrades.length > 0 ? (totalRR / closedTrades.length) : 0;
        
        return {
            period,
            totalTrades: targetTrades.length,
            closedTrades: closedTrades.length,
            openTrades: openTrades.length,
            wins,
            losses,
            winRate,
            totalPips,
            avgWin,
            avgLoss,
            maxWin,
            maxLoss,
            avgRR,
            consecutiveWins,
            consecutiveLosses,
            pairStats,
            dayStats,
            sessionStats,
            trades: closedTrades
        };
    }
    
    /**
     * レポート表示
     * @private
     * @param {Object} data - レポートデータ
     * @returns {void}
     */
    #displayReport(data) {
        const content = document.getElementById('reportContent');
        
        // トレード履歴のソート
        let sortedTrades = [...data.trades];
        if (window.currentTradeSort === 'exit') {
            sortedTrades.sort((a, b) => {
                const exitA = new Date(a.exits[a.exits.length - 1].time);
                const exitB = new Date(b.exits[b.exits.length - 1].time);
                return window.currentSortOrder === 'desc' ? exitB - exitA : exitA - exitB;
            });
        } else {
            sortedTrades.sort((a, b) => {
                const entryA = new Date(a.entryTime || a.entryDatetime || a.date);
                const entryB = new Date(b.entryTime || b.entryDatetime || b.date);
                return window.currentSortOrder === 'desc' ? entryB - entryA : entryA - entryB;
            });
        }
        
        content.innerHTML = `
            
            <div class="report-accordion" style="margin-top: 30px;">
                <div class="accordion-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 255, 136, 0.1); border-radius: 5px; margin-bottom: 10px;">
                    <h4 style="color: #00ff88; margin: 0;">
                        <span id="pairAnalysis-icon" 
                              onclick="window.ReportModule.toggleAccordion('pairAnalysis')" 
                              style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease;"
                              onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                              onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                        💱 通貨ペア / 商品分析
                    </h4>
                    <span id="pairAnalysis-icon-right"
                          onclick="window.ReportModule.toggleAccordion('pairAnalysis')" 
                          style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease; color: #00ff88; font-size: 16px;"
                          onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                          onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                </div>
                <div id="pairAnalysis-content" style="display: none;">
                <table class="trades-table">
                    <thead>
                        <tr>
                            <th>通貨ペア</th>
                            <th>トレード数</th>
                            <th>勝敗</th>
                            <th>勝率</th>
                            <th>獲得Pips</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(() => {
                            const pairEntries = Object.entries(data.pairStats);
                            const state = this.#pagination.pairAnalysis;
                            const startIndex = (state.currentPage - 1) * state.perPage;
                            const endIndex = state.perPage === 999999 ? pairEntries.length : startIndex + state.perPage;
                            const paginatedPairs = pairEntries.slice(startIndex, endIndex);
                            
                            return paginatedPairs.map(([pair, stats]) => `
                            <tr>
                                <td>${pair}</td>
                                <td>${stats.trades}</td>
                                <td>${stats.wins}勝${stats.losses}敗</td>
                                <td>${stats.trades > 0 ? (stats.wins / stats.trades * 100).toFixed(1) : 0}%</td>
                                <td style="color: ${stats.pips >= 0 ? '#00ff88' : '#ff4466'}">
                                    ${stats.pips >= 0 ? '+' : ''}${stats.pips.toFixed(1)}
                                </td>
                            </tr>
                        `).join('');
                        })()}
                    </tbody>
                </table>
                ${this.#generatePaginationUI('pairAnalysis', Object.keys(data.pairStats).length)}
                </div>
            </div>
            
            <div class="report-accordion" style="margin-top: 30px;">
                <div class="accordion-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 255, 136, 0.1); border-radius: 5px; margin-bottom: 10px;">
                    <h4 style="color: #00ff88; margin: 0;">
                        <span id="dayAnalysis-icon" 
                              onclick="window.ReportModule.toggleAccordion('dayAnalysis')" 
                              style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease;"
                              onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                              onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                        📅 曜日別分析（エントリー日時ベース）
                    </h4>
                    <span id="dayAnalysis-icon-right"
                          onclick="window.ReportModule.toggleAccordion('dayAnalysis')" 
                          style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease; color: #00ff88; font-size: 16px;"
                          onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                          onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                </div>
                <div id="dayAnalysis-content" style="display: none;">
                <table class="trades-table">
                    <thead>
                        <tr>
                            <th>曜日</th>
                            <th>トレード数</th>
                            <th>獲得Pips</th>
                            <th>平均Pips</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${['日', '月', '火', '水', '木', '金', '土'].map((day, i) => {
                            const dayData = data.dayStats[i];
                            const avgPips = dayData.trades > 0 ? dayData.pips / dayData.trades : 0;
                            return `
                                <tr>
                                    <td>${day}曜日</td>
                                    <td>${dayData.trades}</td>
                                    <td style="color: ${dayData.pips >= 0 ? '#00ff88' : '#ff4466'}">
                                        ${dayData.pips >= 0 ? '+' : ''}${dayData.pips.toFixed(1)}
                                    </td>
                                    <td style="color: ${avgPips >= 0 ? '#00ff88' : '#ff4466'}">
                                        ${avgPips >= 0 ? '+' : ''}${avgPips.toFixed(1)}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                </div>
            </div>
            
            <div class="report-accordion" style="margin-top: 30px;">
                <div class="accordion-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 255, 136, 0.1); border-radius: 5px; margin-bottom: 10px;">
                    <h4 style="color: #00ff88; margin: 0;">
                        <span id="sessionAnalysis-icon" 
                              onclick="window.ReportModule.toggleAccordion('sessionAnalysis')" 
                              style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease;"
                              onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                              onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                        🕐 セッション別分析
                    </h4>
                    <span id="sessionAnalysis-icon-right"
                          onclick="window.ReportModule.toggleAccordion('sessionAnalysis')" 
                          style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease; color: #00ff88; font-size: 16px;"
                          onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                          onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                </div>
                <div id="sessionAnalysis-content" style="display: none;">
                <table class="trades-table">
                    <thead>
                        <tr>
                            <th>セッション</th>
                            <th>トレード数</th>
                            <th>勝敗</th>
                            <th>勝率</th>
                            <th>獲得Pips</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${['tokyo', 'london', 'ny', 'oceania'].map(key => {
                            const s = data.sessionStats[key];
                            const winRate = s.trades > 0 ? (s.wins / s.trades * 100).toFixed(1) : '0.0';
                            return `
                            <tr>
                                <td>${window.getSessionDisplayName(key)}</td>
                                <td>${s.trades}</td>
                                <td>${s.wins}勝${s.losses}敗</td>
                                <td>${winRate}%</td>
                                <td style="color: ${s.pips >= 0 ? '#00ff88' : '#ff4466'}">
                                    ${s.pips >= 0 ? '+' : ''}${s.pips.toFixed(1)}
                                </td>
                            </tr>
                        `;
                        }).join('')}
                    </tbody>
                </table>
                </div>
            </div>
            
            <div class="report-accordion recent-trades" style="margin-top: 30px;">
                <div class="accordion-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 255, 136, 0.1); border-radius: 5px; margin-bottom: 10px;">
                <h4 style="color: #00ff88; margin: 0; display: flex; align-items: center; width: 100%;">
                    <span id="tradeHistory-icon" 
                          onclick="window.ReportModule.toggleAccordion('tradeHistory')" 
                          style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease;"
                          onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                          onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                    <span style="margin-left: 2px;">📈 トレード履歴</span>
                    <div style="margin-left: auto; display: flex; gap: 14px; margin-right: 15px;">
                        <button onclick="event.stopPropagation(); window.ReportModule.toggleTradeSort()" style="background: rgba(255, 255, 255, 0.1); border: 1px solid #00ff88; color: #00ff88; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">
                            ${window.currentTradeSort === 'entry' ? '決済日時' : 'エントリー日時'}
                        </button>
                        <button onclick="event.stopPropagation(); window.ReportModule.toggleSortOrder()" style="background: rgba(255, 255, 255, 0.1); border: 1px solid #00ff88; color: #00ff88; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">
                            ${window.currentSortOrder === 'desc' ? '古い順 ↓' : '新しい順 ↓'}
                        </button>
                    </div>
                </h4>
                <span id="tradeHistory-icon-right"
                      onclick="window.ReportModule.toggleAccordion('tradeHistory')" 
                      style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease; color: #00ff88; font-size: 16px;"
                      onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                      onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                </div>
                <div id="tradeHistory-content" style="display: none;">
                <table class="trades-table">
                    <thead>
                        <tr>
                            <th>${window.currentTradeSort === 'entry' ? 'エントリー日時' : '決済日時'} ${window.currentSortOrder === 'desc' ? '(新しい順)' : '(古い順)'}</th>
                            <th>通貨ペア</th>
                            <th>結果</th>
                            <th>保有時間</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(() => {
                            const state = this.#pagination.tradeHistory;
                            const startIndex = (state.currentPage - 1) * state.perPage;
                            const endIndex = state.perPage === 999999 ? sortedTrades.length : startIndex + state.perPage;
                            const paginatedTrades = sortedTrades.slice(startIndex, endIndex);
                            
                            return paginatedTrades.map(trade => {
                            const pips = this.#calculateTradePips(trade);
                            const entryDate = new Date(trade.entryTime || trade.entryDatetime || trade.date);
                            const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
                            const holdTime = exitDate - entryDate;
                            const hours = Math.floor(holdTime / (1000 * 60 * 60));
                            const days = Math.floor(hours / 24);
                            const displayHours = hours % 24;
                            const displayDate = window.currentTradeSort === 'entry' ? entryDate : exitDate;
                            
                            return `
                                <tr style="cursor: pointer; transition: background 0.2s;"
                                    onmouseover="this.style.background='rgba(255, 255, 255, 0.05)'"
                                    onmouseout="this.style.background='transparent'"
                                    onclick="showTradeDetail(window.TradeManager.getInstance().getAllTrades().find(t => t.id === '${trade.id}'))">
                                    <td>${window.formatDateTimeForDisplay(displayDate)}</td>
                                    <td>${trade.pair}</td>
                                    <td>
                                        <span class="${pips >= 0 ? 'win' : 'loss'}" style="color: ${pips >= 0 ? '#00ff88' : '#ff4466'}">
                                            ${pips >= 0 ? '+' : ''}${pips.toFixed(1)} pips
                                        </span>
                                    </td>
                                    <td>${days > 0 ? `${days}日${displayHours}時間` : `${hours}時間`}</td>
                                </tr>
                            `;
                        }).join('');
                        })()}
                    </tbody>
                </table>
                ${this.#generatePaginationUI('tradeHistory', sortedTrades.length)}
                </div>
            </div>
        `;
        
        // ルール遵守・リスク分析セクションを追加（Phase 5）
        const ruleRiskAnalysisHTML = this.#generateRuleRiskAnalysis(sortedTrades);
        content.innerHTML += ruleRiskAnalysisHTML;
        
        // 振り返り一覧を追加（アコーディオン化）
        const reflectionHTML = this.#generateReflectionList(data);
        const accordionReflection = `
            <div class="report-accordion" style="margin-top: 30px;">
                <div class="accordion-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 255, 136, 0.1); border-radius: 5px; margin-bottom: 10px;">
                    <h4 style="color: #00ff88; margin: 0;">
                        <span id="reflectionList-icon" 
                              onclick="window.ReportModule.toggleAccordion('reflectionList')" 
                              style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease;"
                              onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                              onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                        📝 振り返り一覧
                    </h4>
                    <span id="reflectionList-icon-right"
                          onclick="window.ReportModule.toggleAccordion('reflectionList')" 
                          style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease; color: #00ff88; font-size: 16px;"
                          onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                          onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                </div>
                <div id="reflectionList-content" style="display: none;">
                    ${reflectionHTML}
                </div>
            </div>
        `;
        content.innerHTML += accordionReflection;
        
        // 月間総括メモを追加（月次レポートの場合のみ）
        if (window.currentReportType === 'monthly') {
            const month = window.currentReportDate.getMonth();
            const year = window.currentReportDate.getFullYear();
            const monthEndNote = this.#getMonthEndNote(year, month + 1);
            
            if (monthEndNote) {
                content.innerHTML += `
                    <div style="margin-top: 30px; background: rgba(255, 253, 240, 0.05); padding: 20px; border-radius: 8px; border: 1px solid rgba(240, 230, 140, 0.3);">
                        <h4 style="color: #00ff88; margin-bottom: 15px;">📝 月間総括メモ</h4>
                        <div style="color: #ccc; line-height: 1.8;">
                            ${monthEndNote}
                        </div>
                    </div>
                `;
            }
        }
        
        // 印刷ボタンを追加（月次レポートの場合のみ）
        if (window.currentReportType === 'monthly') {
            content.innerHTML += `
                <div class="report-actions" style="margin-top: 30px; text-align: center;">
                    <button onclick="printMonthlyReport()" class="btn btn-primary">
                        📄 月次レポートをPDF保存
                    </button>
                    <p class="report-hint-text" style="margin-top: 15px; font-size: 0.85em; color: #7a8599;">
                        💡 相場ノートの月末日の【メモ欄】に<br class="mobile-break">「月間総括」or「月末まとめ」と書いて<br class="mobile-break">コメント入力するとレポートに反映されます。
                    </p>
                </div>
            `;
        }
        
        // アコーディオン状態を復元
        setTimeout(() => {
            this.#restoreAccordionStates();
        }, 50);
    }
    
    /**
     * 振り返り一覧生成（3行表示拡張版・インライン展開機能付き）
     * @private
     * @param {Object} reportData - レポートデータ
     * @returns {string} HTML文字列
     */
    #generateReflectionList(reportData) {
        // reportDataから対象期間のトレードのみを使用
        const targetTrades = reportData.trades || [];
        
        // ページネーション状態を取得
        const state = this.#pagination.reflectionList;
        
        // 決済日時順でソート（並び順切替対応）
        const sortedTrades = [...targetTrades].sort((a, b) => {
            const exitA = new Date(a.exits[a.exits.length - 1].time);
            const exitB = new Date(b.exits[b.exits.length - 1].time);
            return window.currentSortOrder === 'desc' ? exitB - exitA : exitA - exitB;
        });
        
        const winTrades = [];
        const lossTrades = [];
        
        // すべての決済済みトレードを対象にする
        sortedTrades.forEach(trade => {
            const pips = this.#calculateTradePips(trade);
            
            // reflection互換性対応（文字列/オブジェクト両対応）
            let reflectionText = '';
            if (trade.reflection) {
                if (typeof trade.reflection === 'string') {
                    reflectionText = trade.reflection.trim();
                } else if (typeof trade.reflection === 'object' && trade.reflection.text) {
                    reflectionText = trade.reflection.text.trim();
                }
            }
            const hasReflection = reflectionText.length > 0;
            
            // 最初の3行と全文を両方保持
            const allLines = hasReflection ? 
                reflectionText.split('\n').filter(line => line.trim()) : [];
            const previewLines = allLines.slice(0, 3);
            const hasMore = allLines.length > 3;
            
            const tradeInfo = {
                trade,
                pips,
                hasReflection,
                previewLines,  // 最初の3行
                allLines,      // 全ての行
                hasMore,
                fullTrade: trade
            };
            
            if (pips > 0) {
                winTrades.push(tradeInfo);
            } else if (pips < 0) {
                lossTrades.push(tradeInfo);
            }
        });
        
        // 振り返りがあるものと無いものを分ける
        const winWithReflection = winTrades.filter(t => t.hasReflection);
        const winWithoutReflection = winTrades.filter(t => !t.hasReflection);
        const lossWithReflection = lossTrades.filter(t => t.hasReflection);
        const lossWithoutReflection = lossTrades.filter(t => !t.hasReflection);
        
        // 振り返り未記入のトレード数
        const tradesWithoutReflection = [...winWithoutReflection, ...lossWithoutReflection];
        
        const sortOrderText = window.currentSortOrder === 'desc' ? '新しい順' : '古い順';
        
        // ページネーション適用
        const allReflections = [...winWithReflection, ...lossWithReflection];
        const startIndex = (state.currentPage - 1) * state.perPage;
        const endIndex = state.perPage === 999999 ? allReflections.length : startIndex + state.perPage;
        
        // ページング適用後のデータを勝ち・負けに再分類
        const paginatedReflections = allReflections.slice(startIndex, endIndex);
        const paginatedWins = paginatedReflections.filter(r => r.pips > 0);
        const paginatedLosses = paginatedReflections.filter(r => r.pips < 0);
        
        // 勝ちトレード・負けトレードのセクションを生成
        let html = `
            <div class="reflection-section" style="margin-top: 0;">
                
                ${paginatedWins.length > 0 ? `
                <div class="reflection-win-section" style="margin-bottom: 30px;">
                    <h4 style="color: #00ff88; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">▲</span>
                        勝ちトレード (${winWithReflection.length}件)
                    </h4>
                    ${paginatedWins.map(item => this.#generateReflectionItem(item, 'win')).join('')}
                </div>
                ` : ''}
                
                ${paginatedLosses.length > 0 ? `
                <div class="reflection-loss-section">
                    <h4 style="color: #ff4466; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">▼</span>
                        負けトレード (${lossWithReflection.length}件)
                    </h4>
                    ${paginatedLosses.map(item => this.#generateReflectionItem(item, 'loss')).join('')}
                </div>
                ` : ''}
                
                ${paginatedWins.length === 0 && paginatedLosses.length === 0 ? `
                    <p style="color: #7a8599; text-align: center; padding: 20px;">
                        振り返りが記入されたトレードはありません
                    </p>
                ` : ''}
                
                ${this.#generatePaginationUI('reflectionList', allReflections.length)}
            </div>
        `;
        
        return html;
    }
    
    /**
     * 振り返りアイテムのHTML生成
     * @private
     * @param {Object} item - トレード情報オブジェクト
     * @param {string} type - タイプ（'win' または 'loss'）
     * @returns {string} HTML文字列
     */
    #generateReflectionItem(item, type) {
        const { trade, pips, previewLines, allLines, hasMore } = item;
        const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
        const month = exitDate.getMonth() + 1;
        const day = exitDate.getDate();
        
        // ユニークなIDを生成
        const reflectionId = `reflection_${type}_${trade.id}`;
        
        // 色設定
        const isWin = type === 'win';
        const color = isWin ? '#00ff88' : '#ff4466';
        const bgColor = isWin ? 'rgba(0, 255, 136, 0.08)' : 'rgba(248, 113, 113, 0.08)';
        const borderColor = isWin ? 'rgba(0, 255, 136, 0.2)' : 'rgba(248, 113, 113, 0.2)';
        const hoverBg = isWin ? 'rgba(0, 255, 136, 0.1)' : 'rgba(248, 113, 113, 0.1)';
        const badgeBg = isWin ? 'rgba(0, 255, 136, 0.3)' : 'rgba(248, 113, 113, 0.3)';
        
        return `
            <div style="background: ${bgColor}; 
                 padding: 15px; margin: 12px 0; border-radius: 8px; 
                 border-left: 3px solid ${color}; 
                 transition: all 0.3s ease;">
                
                <!-- ヘッダー部分（クリックで詳細表示） -->
                <div style="display: flex; justify-content: space-between; 
                     align-items: center; margin-bottom: 10px; 
                     padding-bottom: 8px; border-bottom: 1px solid ${borderColor};
                     cursor: pointer; transition: background 0.2s;"
                     onmouseover="this.style.background='${hoverBg}'"
                     onmouseout="this.style.background='transparent'"
                     onclick="window.showTradeDetail(window.trades.find(t => t.id === '${trade.id}'))">
                    <span style="color: ${color}; font-weight: bold; font-size: 0.95em;">
                        📅 ${month}月${day}日 | ${trade.pair}
                    </span>
                    <span style="background: ${badgeBg}; 
                         color: ${color}; padding: 3px 10px; 
                         border-radius: 12px; font-weight: bold;">
                        ${isWin ? '+' : ''}${pips.toFixed(1)} pips
                    </span>
                </div>
                
                <!-- 振り返り本文（展開可能） -->
                <div id="${reflectionId}" style="color: #fff; line-height: 1.7; font-size: 0.95em;">
                    <div id="${reflectionId}_preview">
                        ${previewLines.length > 0 ? 
                            previewLines.map((line, lineIndex) => `
                                <div style="margin: 4px 0; 
                                     color: ${lineIndex === 0 ? '#fff' : 'rgba(255,255,255,0.85)'};">
                                    ${window.escapeHtml(line)}
                                </div>
                            `).join('') : 
                            '<span style="color: #7a8599; font-style: italic;">振り返り未記入</span>'
                        }
                    </div>
                    
                    <!-- 展開された全文（初期非表示） -->
                    <div id="${reflectionId}_full" style="display: none; 
                         opacity: 0; max-height: 0; overflow: hidden; 
                         transition: all 0.3s ease;">
                        ${allLines.length > 0 ? 
                            allLines.map((line, lineIndex) => `
                                <div style="margin: 4px 0; 
                                     color: ${lineIndex === 0 ? '#fff' : 'rgba(255,255,255,0.85)'};">
                                    ${window.escapeHtml(line)}
                                </div>
                            `).join('') : ''
                        }
                    </div>
                    
                    ${hasMore ? `
                        <div id="${reflectionId}_toggle" 
                             style="color: ${color}; font-size: 0.85em; 
                             margin-top: 8px; text-align: right; cursor: pointer; 
                             transition: all 0.3s ease;"
                             onclick="window.ReportModule.toggleReflection('${reflectionId}', event)"
                             onmouseover="this.style.opacity='0.8'"
                             onmouseout="this.style.opacity='1'">
                            <span id="${reflectionId}_arrow" style="display: inline-block; transition: transform 0.3s ease;">▼</span>
                            <span id="${reflectionId}_text"> 続きを読む...</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * ページネーションUIを生成
     * @private
     * @param {string} sectionId - セクションID（pairAnalysis/tradeHistory/reflectionList）
     * @param {number} totalItems - 総アイテム数
     * @returns {string} ページネーションHTML
     */
    #generatePaginationUI(sectionId, totalItems) {
        const state = this.#pagination[sectionId];
        const totalPages = state.perPage === 999999 ? 1 : Math.ceil(totalItems / state.perPage);
        const currentPage = Math.min(state.currentPage, totalPages);
        
        // 現在のページが範囲外の場合は修正
        if (currentPage < 1) {
            state.currentPage = 1;
        }
        
        return `
            <div class="pagination-controls" style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 255, 136, 0.05); border-radius: 5px;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <label style="color: #aaa; font-size: 14px;">表示件数:</label>
                    <select onchange="window.ReportModule.changePagination('${sectionId}', 'perPage', this.value)" style="background: rgba(255, 255, 255, 0.1); border: 1px solid #00ff88; color: #00ff88; padding: 5px 10px; border-radius: 5px; cursor: pointer;">
                        <option value="10" ${state.perPage === 10 ? 'selected' : ''}>10件</option>
                        <option value="20" ${state.perPage === 20 ? 'selected' : ''}>20件</option>
                        <option value="50" ${state.perPage === 50 ? 'selected' : ''}>50件</option>
                        <option value="100" ${state.perPage === 100 ? 'selected' : ''}>100件</option>
                        <option value="999999" ${state.perPage === 999999 ? 'selected' : ''}>全件</option>
                    </select>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <button onclick="window.ReportModule.changePagination('${sectionId}', 'prev')" 
                            ${currentPage <= 1 ? 'disabled' : ''}
                            style="background: rgba(255, 255, 255, 0.1); border: 1px solid #00ff88; color: #00ff88; padding: 5px 15px; border-radius: 5px; cursor: pointer; ${currentPage <= 1 ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                        ◀ 前へ
                    </button>
                    <span style="color: #00ff88; font-size: 14px;">
                        ${currentPage} / ${totalPages} ページ
                    </span>
                    <button onclick="window.ReportModule.changePagination('${sectionId}', 'next')" 
                            ${currentPage >= totalPages ? 'disabled' : ''}
                            style="background: rgba(255, 255, 255, 0.1); border: 1px solid #00ff88; color: #00ff88; padding: 5px 15px; border-radius: 5px; cursor: pointer; ${currentPage >= totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                        次へ ▶
                    </button>
                </div>
                <div style="color: #7a8599; font-size: 12px;">
                    全${totalItems}件中 ${Math.min((currentPage - 1) * state.perPage + 1, totalItems)}-${Math.min(currentPage * state.perPage, totalItems)}件を表示
                </div>
            </div>
        `;
    }
    
    /**
     * 月次統計計算（拡張版：Pips + 円建て統計）
     * @private
     * @param {Array} monthlyTrades - 月次トレードデータ
     * @returns {Object} 統計データ
     */
    #calculateMonthlyStats(monthlyTrades) {
        if (!monthlyTrades || monthlyTrades.length === 0) {
            return {
                totalTrades: 0,
                wins: 0,
                losses: 0,
                winRate: '0.0',
                totalPips: 0,
                avgPips: 0,
                avgWinPips: 0,
                avgLossPips: 0,
                maxWinPips: 0,
                maxLossPips: 0,
                riskReward: 0,
                maxConsecutiveWins: 0,
                maxConsecutiveLosses: 0,
                maxWinStreak: 0,
                maxLoseStreak: 0,
                totalProfit: 0,
                totalLoss: 0,
                netProfit: 0,
                profitRate: '0.0',
                avgProfit: 0,
                avgLoss: 0,
                maxDrawdown: 0,
                maxDrawdownPercent: '0.0',
                profitFactor: '0.00',
                expectancy: 0,
                yenRegistered: 0,
                yenWins: 0,
                yenLosses: 0,
                totalSwap: 0,
                totalCommission: 0,
                maxProfit: 0,
                maxLoss: 0,
                avgHoldTime: '0時間0分',
                pairStats: {},
                dayStats: Array(7).fill(null).map(() => ({ trades: 0, pips: 0 })),
                sessionStats: {
                    oceania: { trades: 0, wins: 0, losses: 0, pips: 0 },
                    tokyo:   { trades: 0, wins: 0, losses: 0, pips: 0 },
                    london:  { trades: 0, wins: 0, losses: 0, pips: 0 },
                    ny:      { trades: 0, wins: 0, losses: 0, pips: 0 }
                }
            };
        }
        
        // 時系列でソート（決済日時ベース）- 連勝・連敗計算に必要
        const sortedTrades = [...monthlyTrades].sort((a, b) => {
            const dateA = new Date(a.exits?.[a.exits.length - 1]?.time || a.date);
            const dateB = new Date(b.exits?.[b.exits.length - 1]?.time || b.date);
            return dateA - dateB;
        });
        
        // 基本統計
        const totalTrades = sortedTrades.length;
        
        // Pips統計（修正: 10で割らない）
        let totalPips = 0;
        let wins = 0;
        let losses = 0;
        let winPips = 0;
        let lossPips = 0;
        let maxWinPips = 0;
        let maxLossPips = 0;
        let maxWinStreak = 0;
        let maxLoseStreak = 0;
        let currentWinStreak = 0;
        let currentLoseStreak = 0;
        
        // 修正: 時系列順でループ
        sortedTrades.forEach(trade => {
            const pips = this.#calculateTradePips(trade);
            totalPips += pips;
            
            if (pips > 0) {
                wins++;
                winPips += pips;
                maxWinPips = Math.max(maxWinPips, pips);
                
                // 連勝カウント
                currentWinStreak++;
                currentLoseStreak = 0;
                maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
                
            } else if (pips < 0) {
                losses++;
                lossPips += pips;
                maxLossPips = Math.min(maxLossPips, pips);
                
                // 連敗カウント
                currentLoseStreak++;
                currentWinStreak = 0;
                maxLoseStreak = Math.max(maxLoseStreak, currentLoseStreak);
                
            } else {
                // pips === 0 の場合（引き分け）
                // 連勝・連敗をリセット
                currentWinStreak = 0;
                currentLoseStreak = 0;
            }
        });
        
        const winRate = totalTrades > 0 ? (wins / totalTrades * 100).toFixed(1) : '0.0';
        const avgPips = totalTrades > 0 ? totalPips / totalTrades : 0;
        const avgWinPips = wins > 0 ? winPips / wins : 0;
        const avgLossPips = losses > 0 ? lossPips / losses : 0;
        const riskReward = losses > 0 && avgLossPips !== 0 ? Math.abs(avgWinPips / avgLossPips) : 0;
        
        // 平均保有時間
        let totalHoldTime = 0;
        let validHoldTrades = 0;
        monthlyTrades.forEach(trade => {
            if (trade.exits && trade.exits.length > 0) {
                const entryDate = new Date(trade.entryTime || trade.entryDatetime || trade.date);
                const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
                const holdTime = exitDate - entryDate;
                if (holdTime > 0) {
                    totalHoldTime += holdTime;
                    validHoldTrades++;
                }
            }
        });
        const avgHoldTimeMs = validHoldTrades > 0 ? totalHoldTime / validHoldTrades : 0;
        const avgHoldHours = Math.floor(avgHoldTimeMs / (1000 * 60 * 60));
        const avgHoldDays = Math.floor(avgHoldHours / 24);
        const remainingHours = avgHoldHours % 24;
        const avgHoldMinutes = Math.floor((avgHoldTimeMs % (1000 * 60 * 60)) / (1000 * 60));
        const avgHoldTime = avgHoldDays > 0 
            ? `${avgHoldDays}日${remainingHours}時間${avgHoldMinutes}分`
            : `${remainingHours}時間${avgHoldMinutes}分`;
        
        // 円建て統計（修正: 正しく集計）
        const yenRegistered = monthlyTrades.filter(t => t.yenProfitLoss).length;
        
        let yenWins = 0;
        let yenLosses = 0;
        let totalProfit = 0;
        let totalLoss = 0;
        let netProfit = 0;
        let maxProfit = 0;
        let maxLoss = 0;
        let totalSwap = 0;
        let totalCommission = 0;
        
        monthlyTrades.forEach(trade => {
            if (trade.yenProfitLoss) {
                const yen = trade.yenProfitLoss.netProfit || 0;
                netProfit += yen;
                
                if (yen > 0) {
                    yenWins++;
                    totalProfit += yen;
                    maxProfit = Math.max(maxProfit, yen);
                } else if (yen < 0) {
                    yenLosses++;
                    totalLoss += Math.abs(yen);
                    maxLoss = Math.min(maxLoss, yen);
                }
                
                // ✅ スワップはそのまま使用（符号反転しない）
                totalSwap += (trade.yenProfitLoss.swap || 0);
                totalCommission += (trade.yenProfitLoss.commission || 0);
            }
        });
        
        const profitFactor = totalLoss > 0 ? (totalProfit / totalLoss).toFixed(2) : '0.00';
        const profitRate = totalProfit > 0 ? ((netProfit / totalProfit) * 100).toFixed(1) : '0.0';
        const expectancy = totalTrades > 0 ? netProfit / totalTrades : 0;
        const avgProfit = yenWins > 0 ? totalProfit / yenWins : 0;
        const avgLoss = yenLosses > 0 ? totalLoss / yenLosses : 0;
        
        // 最大DD計算（修正: 既にソート済みのsortedTradesを使用）
        let peak = 0;
        let maxDrawdown = 0;
        let cumulative = 0;
        
        sortedTrades.forEach(trade => {
            if (trade.yenProfitLoss) {
                cumulative += (trade.yenProfitLoss.netProfit || 0);
                peak = Math.max(peak, cumulative);
                const drawdown = peak - cumulative;
                maxDrawdown = Math.max(maxDrawdown, drawdown);
            }
        });
        
        const maxDrawdownPercent = peak > 0 ? ((maxDrawdown / peak) * 100).toFixed(1) : '0.0';
        
        // 通貨ペア別統計
        const pairStats = {};
        monthlyTrades.forEach(trade => {
            const pair = trade.pair;
            if (!pairStats[pair]) {
                pairStats[pair] = { trades: 0, wins: 0, losses: 0, pips: 0 };
            }
            pairStats[pair].trades++;
            const pips = this.#calculateTradePips(trade);
            pairStats[pair].pips += pips;
            if (pips > 0) pairStats[pair].wins++;
            else if (pips < 0) pairStats[pair].losses++;
        });
        
        // 曜日別統計
        const dayStats = Array(7).fill(null).map(() => ({ trades: 0, pips: 0 }));
        
        // セッション別統計（DST自動対応）
        const sessionStats = {
            oceania: { trades: 0, wins: 0, losses: 0, pips: 0 },
            tokyo:   { trades: 0, wins: 0, losses: 0, pips: 0 },
            london:  { trades: 0, wins: 0, losses: 0, pips: 0 },
            ny:      { trades: 0, wins: 0, losses: 0, pips: 0 }
        };
        
        monthlyTrades.forEach(trade => {
            const entryDate = new Date(trade.entryTime || trade.entryDatetime || trade.date);
            const dayOfWeek = entryDate.getDay();
            const pips = this.#calculateTradePips(trade);
            dayStats[dayOfWeek].trades++;
            dayStats[dayOfWeek].pips += pips;
            
            // セッション別統計（DST自動対応）
            const session = this.getTradeSession(entryDate);
            sessionStats[session].trades++;
            sessionStats[session].pips += pips;
            if (pips > 0) sessionStats[session].wins++;
            else if (pips < 0) sessionStats[session].losses++;
        });
        
        return {
            // 基本情報
            totalTrades,
            wins,
            losses,
            winRate,
            
            // Pips統計
            totalPips,
            avgPips,
            avgWinPips,
            avgLossPips,
            maxWinPips,
            maxLossPips,
            riskReward,
            maxConsecutiveWins: maxWinStreak,  // エイリアス
            maxConsecutiveLosses: maxLoseStreak,  // エイリアス
            maxWinStreak,
            maxLoseStreak,
            avgHoldTime,
            
            // 円建て統計
            yenRegistered,
            yenWins,
            yenLosses,
            netProfit,
            totalProfit,
            totalLoss,
            profitFactor,
            profitRate,
            expectancy,
            avgProfit,
            avgLoss,
            maxProfit,
            maxLoss,
            maxDrawdown,
            maxDrawdownPercent,
            totalSwap,
            totalCommission,
            
            // 詳細分析
            pairStats,
            dayStats,
            sessionStats
        };
    }
    
    /**
     * ベストトレード取得（振り返り付き）
     * @private
     * @param {Array} monthlyTrades - 月次トレードデータ
     * @param {number} count - 取得件数
     * @returns {string} HTML文字列
     */
    #getBestTradesWithReflection(monthlyTrades, count) {
        const sorted = [...monthlyTrades]
            .sort((a, b) => (b.pips || 0) - (a.pips || 0))
            .slice(0, count);
        
        if (sorted.length === 0) {
            return '<p style="color: #999;">今月のトレードはまだありません</p>';
        }
        
        return sorted.map((trade, index) => {
            const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
            const pips = this.#calculateTradePips(trade);
            const emoji = index === 0 ? '1️⃣' : index === 1 ? '2️⃣' : '3️⃣';
            const month = exitDate.getMonth() + 1;
            
            return `
                <div class="trade-item">
                    <div class="trade-header">
                        <span class="trade-rank">${emoji}</span>
                        <span class="trade-date">${month}/${exitDate.getDate()}</span>
                        <span class="trade-pair">${trade.pair}</span>
                        <span class="trade-pips ${pips >= 0 ? 'positive' : 'negative'}">
                            ${pips >= 0 ? '+' : ''}${pips.toFixed(1)}pips 💭
                        </span>
                    </div>
                    <div class="trade-reflection">
                        「${typeof trade.reflection === 'string' ? trade.reflection : (trade.reflection?.text || '振り返りを記入してください')}」
                    </div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * ワーストトレード取得（振り返り付き）
     * @private
     * @param {Array} monthlyTrades - 月次トレードデータ
     * @param {number} count - 取得件数
     * @returns {string} HTML文字列
     */
    #getWorstTradesWithReflection(monthlyTrades, count) {
        const sorted = [...monthlyTrades]
            .sort((a, b) => (a.pips || 0) - (b.pips || 0))
            .slice(0, count);
        
        if (sorted.length === 0) {
            return '<p style="color: #999;">今月のトレードはまだありません</p>';
        }
        
        return sorted.map((trade, index) => {
            const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
            const pips = this.#calculateTradePips(trade);
            const emoji = index === 0 ? '1️⃣' : index === 1 ? '2️⃣' : '3️⃣';
            const month = exitDate.getMonth() + 1;
            
            return `
                <div class="trade-item worst-trade">
                    <div class="trade-header">
                        <span class="trade-rank">${emoji}</span>
                        <span class="trade-date">${month}/${exitDate.getDate()}</span>
                        <span class="trade-pair">${trade.pair}</span>
                        <span class="trade-pips ${pips >= 0 ? 'positive' : 'negative'}">
                            ${pips >= 0 ? '+' : ''}${pips.toFixed(1)}pips 💭
                        </span>
                    </div>
                    <div class="trade-reflection">
                        「${typeof trade.reflection === 'string' ? trade.reflection : (trade.reflection?.text || '振り返りを記入してください')}」
                    </div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * ベストプラクティス自動抽出
     * @private
     * @param {Array} monthlyTrades - 月次トレードデータ
     * @returns {string} HTML文字列
     */
    #extractBestPractices(monthlyTrades) {
        // reflection互換性対応（文字列/オブジェクト両対応）
        const reflections = monthlyTrades
            .filter(t => t.reflection)
            .map(t => {
                if (typeof t.reflection === 'string') {
                    return t.reflection;
                } else if (typeof t.reflection === 'object' && t.reflection.text) {
                    return t.reflection.text;
                }
                return '';
            })
            .filter(text => text.trim().length > 0);
        
        if (reflections.length === 0) {
            return '<p style="color: #999;">振り返りデータがありません</p>';
        }
        
        // 拡張版キーワードリスト
        const keywords = {
            // 基本用語
            'サポート': 0,
            'レジスタンス': 0,
            '2番底': 0,
            'トレンド': 0,
            '指標': 0,
            'エントリー': 0,
            '利確': 0,
            '損切り': 0,
            
            // テクニカル分析
            'エリオット波動': 0,
            'フィボナッチ': 0,
            'ボリンジャーバンド': 0,
            'BB': 0,
            'MACD': 0,
            'RSI': 0,
            'ピボット': 0,
            '移動平均線': 0,
            
            // ファンダメンタル
            'ファンダ': 0,
            'ファンダメンタル': 0,
            '通貨強弱': 0,
            
            // プライスアクション
            '戻り高値': 0,
            '押し安値': 0,
            '高値更新': 0,
            '安値更新': 0,
            
            // チャートパターン
            '三尊': 0,
            '逆三尊': 0,
            'ダブルトップ': 0,
            'ダブルボトム': 0,
            
            // その他重要用語
            'ブレイク': 0,
            'レンジ': 0,
            'ストップ': 0,
            'リスクリワード': 0,
            'RR': 0
        };
        
        // 各振り返りをチェック
        reflections.forEach(reflection => {
            const upperReflection = reflection.toUpperCase();
            
            Object.keys(keywords).forEach(keyword => {
                if (upperReflection.includes(keyword.toUpperCase())) {
                    keywords[keyword]++;
                }
            });
        });
        
        // 類似キーワードをまとめる
        const mergedKeywords = {};
        
        // ファンダ系をまとめる
        if (keywords['ファンダ'] > 0 || keywords['ファンダメンタル'] > 0) {
            mergedKeywords['ファンダメンタル'] = keywords['ファンダ'] + keywords['ファンダメンタル'];
        }
        
        // ボリンジャーバンド系をまとめる
        if (keywords['ボリンジャーバンド'] > 0 || keywords['BB'] > 0) {
            mergedKeywords['ボリンジャーバンド(BB)'] = keywords['ボリンジャーバンド'] + keywords['BB'];
        }
        
        // その他のキーワードはそのまま
        Object.entries(keywords).forEach(([key, count]) => {
            if (count > 0 && 
                !['ファンダ', 'ファンダメンタル', 'ボリンジャーバンド', 'BB'].includes(key) &&
                !mergedKeywords[key]) {
                mergedKeywords[key] = count;
            }
        });
        
        // 頻度順にソート
        const sortedKeywords = Object.entries(mergedKeywords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        if (sortedKeywords.length === 0) {
            return '<p style="color: #999;">キーワードが検出されませんでした</p>';
        }
        
        // カテゴリ分け
        const categories = {
            'テクニカル分析': [],
            'プライスアクション': [],
            'その他': []
        };
        
        sortedKeywords.forEach(([keyword, count]) => {
            if (['エリオット波動', 'フィボナッチ', 'ボリンジャーバンド(BB)', 'MACD', 'RSI', 'ピボット', '移動平均線'].includes(keyword)) {
                categories['テクニカル分析'].push(`${keyword}(${count}回)`);
            } else if (['サポート', 'レジスタンス', '2番底', 'トレンド', '戻り高値', '押し安値', '高値更新', '安値更新', '三尊', '逆三尊', 'ダブルトップ', 'ダブルボトム', 'ブレイク', 'レンジ'].includes(keyword)) {
                categories['プライスアクション'].push(`${keyword}(${count}回)`);
            } else {
                categories['その他'].push(`${keyword}(${count}回)`);
            }
        });
        
        // HTML生成
        let categoryHTML = '';
        Object.entries(categories).forEach(([category, items]) => {
            if (items.length > 0) {
                categoryHTML += `
                    <div style="margin-bottom: 15px;">
                        <strong>${category}:</strong><br>
                        ${items.join(' / ')}
                    </div>
                `;
            }
        });
        
        return categoryHTML || '<p style="color: #999;">キーワードが検出されませんでした</p>';
    }
    
    /**
     * 月末総括メモ取得
     * @private
     * @param {number} year - 年
     * @param {number} month - 月
     * @returns {string|null} メモ文字列またはnull
     */
    #getMonthEndNote(year, month) {
        // 月末の日付を計算
        const lastDay = new Date(year, month, 0).getDate();
        const monthEndDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
        
        // 月末のノートから総括を探す
        const notes = window.notes || {};
        const monthEndNote = notes[monthEndDate];
        if (monthEndNote && monthEndNote.memo) {
            // 「月間総括」や「月末まとめ」を含む部分を抽出
            const memo = monthEndNote.memo;
            if (memo.includes('月間総括') || memo.includes('月末まとめ')) {
                return memo;
            }
        }
        
        return null;
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
    
    // ================
    // 週次処理関連のプライベートメソッド（Phase 2-C追加）
    // ================
    
    /**
     * 週の開始日と終了日を取得
     * @private
     * @param {number} year - 年
     * @param {number} month - 月（0-11）
     * @param {number} weekNumber - 週番号
     * @returns {Object|null} {start: Date, end: Date} または null
     */
    #getWeekDates(year, month, weekNumber) {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        // 月の最初の月曜日を見つける
        let firstMonday = new Date(firstDay);
        const dayOfWeek = firstDay.getDay();
        if (dayOfWeek !== 1) {
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            firstMonday.setDate(firstDay.getDate() + diff);
        }
        
        // 指定された週の開始日と終了日を計算
        const weekStart = new Date(firstMonday);
        weekStart.setDate(firstMonday.getDate() + (weekNumber - 1) * 7);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        // 月の範囲を超えないように調整
        if (weekStart < firstDay) {
            weekStart.setTime(firstDay.getTime());
        }
        if (weekEnd > lastDay) {
            weekEnd.setTime(lastDay.getTime());
        }
        
        // 週が月の範囲外の場合はnullを返す
        if (weekStart > lastDay || weekEnd < firstDay) {
            return null;
        }
        
        return { start: weekStart, end: weekEnd };
    }
    
    /**
     * 週選択の更新
     * @private
     * @returns {void}
     */
    #updateWeekSelection() {
        const weekSelect = document.getElementById('weekSelect');
        if (weekSelect) {
            window.currentWeekNumber = parseInt(weekSelect.value);
            this.generateReport(window.currentReportType);
        }
    }
    
    /**
     * 週モードの更新
     * @private
     * @returns {void}
     */
    #updateWeekMode() {
        const weekModeSelect = document.getElementById('weekMode');
        if (weekModeSelect) {
            window.currentWeekMode = weekModeSelect.value;
            this.#updateWeekOptions();
            this.generateReport('weekly');
        }
    }
    
    /**
     * 週オプションの更新
     * @private
     * @returns {void}
     */
    #updateWeekOptions() {
        const weekSelect = document.getElementById('weekSelect');
        if (!weekSelect) return;
        
        weekSelect.innerHTML = '';
        const year = window.currentReportDate.getFullYear();
        const month = window.currentReportDate.getMonth();
        
        switch (window.currentWeekMode) {
            case 'monthWeek':
                // 月内週（第1〜5週）
                for (let i = 1; i <= 5; i++) {
                    const weekDates = this.#getWeekDates(year, month, i);
                    if (weekDates) {
                        const option = document.createElement('option');
                        option.value = i;
                        const days = Math.ceil((weekDates.end - weekDates.start) / (1000 * 60 * 60 * 24)) + 1;
                        option.textContent = `第${i}週（${window.formatDateForDisplay(weekDates.start)}〜${window.formatDateForDisplay(weekDates.end)}）${days < 7 ? ` ※${days}日間` : ''}`;
                        if (i === window.currentWeekNumber) option.selected = true;
                        weekSelect.appendChild(option);
                    }
                }
                break;
                
            case 'fullWeek':
                // 完全週（月曜〜日曜）
                const weeksInMonth = this.#getFullWeeksInMonth(year, month);
                weeksInMonth.forEach((week, index) => {
                    const option = document.createElement('option');
                    option.value = index + 1;
                    option.textContent = `第${index + 1}週（${window.formatDateForDisplay(week.start)}〜${window.formatDateForDisplay(week.end)}）`;
                    if (index + 1 === window.currentWeekNumber) option.selected = true;
                    weekSelect.appendChild(option);
                });
                break;
                
            case 'isoWeek':
                // ISO週番号
                const isoWeeks = this.#getISOWeeksInMonth(year, month);
                isoWeeks.forEach(week => {
                    const option = document.createElement('option');
                    option.value = week.weekNumber;
                    option.textContent = `第${week.weekNumber}週（${window.formatDateForDisplay(week.start)}〜${window.formatDateForDisplay(week.end)}）`;
                    if (week.weekNumber === window.currentWeekNumber) option.selected = true;
                    weekSelect.appendChild(option);
                });
                break;
        }
    }
    
    /**
     * 完全週（月曜〜日曜）の取得
     * @private
     * @param {number} year - 年
     * @param {number} month - 月（0-11）
     * @returns {Array} 完全週の配列
     */
    #getFullWeeksInMonth(year, month) {
        const weeks = [];
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        // 月の最初の月曜日を見つける
        let currentMonday = new Date(firstDay);
        const firstDayOfWeek = firstDay.getDay();
        if (firstDayOfWeek !== 1) {
            const diff = firstDayOfWeek === 0 ? 1 : 8 - firstDayOfWeek;
            currentMonday.setDate(firstDay.getDate() - firstDayOfWeek + 1);
        }
        
        // 月に関わる全ての完全週を収集
        while (currentMonday <= lastDay || currentMonday.getMonth() === month) {
            const weekEnd = new Date(currentMonday);
            weekEnd.setDate(currentMonday.getDate() + 6);
            
            // この週が対象月と関わりがあるかチェック
            if ((currentMonday <= lastDay && currentMonday.getMonth() === month) ||
                (weekEnd >= firstDay && weekEnd.getMonth() === month) ||
                (currentMonday < firstDay && weekEnd > lastDay)) {
                weeks.push({
                    start: new Date(currentMonday),
                    end: new Date(weekEnd)
                });
            }
            
            currentMonday.setDate(currentMonday.getDate() + 7);
            
            // 翌月に完全に移った場合は終了
            if (currentMonday.getMonth() > month || 
                (currentMonday.getMonth() === 0 && month === 11)) {
                break;
            }
        }
        
        return weeks;
    }
    
    /**
     * ISO週番号の週を取得
     * @private
     * @param {number} year - 年
     * @param {number} month - 月（0-11）
     * @returns {Array} ISO週の配列
     */
    #getISOWeeksInMonth(year, month) {
        const weeks = [];
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        // 月初のISO週番号を取得
        let current = new Date(firstDay);
        
        while (current <= lastDay) {
            const weekNumber = this.#getISOWeekNumber(current);
            const weekStart = this.#getISOWeekStart(current);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            // この週がまだ追加されていない場合のみ追加
            if (!weeks.some(w => w.weekNumber === weekNumber)) {
                weeks.push({
                    weekNumber: weekNumber,
                    start: weekStart,
                    end: weekEnd
                });
            }
            
            current.setDate(current.getDate() + 7);
        }
        
        return weeks;
    }
    
    /**
     * ISO週番号を取得
     * @private
     * @param {Date} date - 日付
     * @returns {number} ISO週番号
     */
    #getISOWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
    
    /**
     * ISO週の開始日（月曜日）を取得
     * @private
     * @param {Date} date - 日付
     * @returns {Date} ISO週の開始日
     */
    #getISOWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    /**
     * ルール遵守・リスク分析セクションを生成（Phase 5）
     * @private
     */
    #generateRuleRiskAnalysis(trades) {
        // 1. ルール遵守別成績を計算
        const ruleStats = { 
            yes: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 }, 
            no: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 } 
        };
        
        // 2. 許容損失別成績を計算
        const riskStats = { 
            normal: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 }, 
            warning: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 }, 
            danger: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 } 
        };
        
        // 3. 手法別成績を計算
        const methodStats = {};
        
        trades.forEach(trade => {
            const pips = this.#calculateTradePips(trade);
            const isWin = pips > 0;
            
            // 円建て損益を取得
            const yenProfit = trade.yenProfitLoss?.netProfit || 0;
            const hasYen = trade.yenProfitLoss?.netProfit !== undefined;
            
            // ルール遵守別
            const reflection = typeof trade.reflection === 'object' ? trade.reflection : null;
            if (reflection && reflection.ruleFollowed) {
                const key = reflection.ruleFollowed;
                if (ruleStats[key]) {
                    ruleStats[key].count++;
                    ruleStats[key].pips += pips;
                    if (hasYen) {
                        ruleStats[key].yen += yenProfit;
                        ruleStats[key].yenCount++;
                    }
                    if (isWin) ruleStats[key].wins++;
                    else if (pips < 0) ruleStats[key].losses++;
                }
            }
            
            // 許容損失別
            if (trade.riskStatus && riskStats[trade.riskStatus]) {
                riskStats[trade.riskStatus].count++;
                riskStats[trade.riskStatus].pips += pips;
                if (hasYen) {
                    riskStats[trade.riskStatus].yen += yenProfit;
                    riskStats[trade.riskStatus].yenCount++;
                }
                if (isWin) riskStats[trade.riskStatus].wins++;
                else if (pips < 0) riskStats[trade.riskStatus].losses++;
            }
            
            // 手法別
            const methodId = trade.methodId || 'none';
            if (!methodStats[methodId]) {
                methodStats[methodId] = { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 };
            }
            methodStats[methodId].count++;
            methodStats[methodId].pips += pips;
            if (hasYen) {
                methodStats[methodId].yen += yenProfit;
                methodStats[methodId].yenCount++;
            }
            if (isWin) methodStats[methodId].wins++;
            else if (pips < 0) methodStats[methodId].losses++;
        });
        
        // ヘルパー関数
        const calcWinRate = (wins, losses) => {
            const total = wins + losses;
            return total > 0 ? ((wins / total) * 100).toFixed(1) : '-';
        };
        
        const formatWinLoss = (wins, losses) => {
            if (wins === 0 && losses === 0) return '-';
            return `${wins}勝${losses}敗`;
        };
        
        const calcExpectedPips = (pips, count) => {
            if (count === 0) return '-';
            const ev = pips / count;
            return `${ev >= 0 ? '+' : ''}${ev.toFixed(1)}p`;
        };
        
        const calcExpectedYen = (yen, yenCount) => {
            if (yenCount === 0) return '-';
            const ev = yen / yenCount;
            return `${ev >= 0 ? '+' : ''}¥${Math.round(ev).toLocaleString()}`;
        };
        
        const getMethodName = (methodId) => {
            if (methodId === 'none') return '未設定';
            const method = window.SettingsModule?.getMethodById(methodId);
            return method ? (method.shortName || method.name) : '不明';
        };
        
        // テーブル行生成ヘルパー
        const generateRow = (badge, stats) => {
            if (stats.count === 0) {
                return `<tr>
                    <td style="text-align: center;">${badge}</td>
                    <td style="text-align: center;">0件</td>
                    <td style="text-align: center;">-</td>
                    <td style="text-align: center;">-</td>
                    <td style="text-align: center;">-</td>
                    <td style="text-align: center;">-</td>
                    <td style="text-align: center;">-</td>
                </tr>`;
            }
            const pipsColor = stats.pips >= 0 ? '#00ff88' : '#ff4466';
            const evPips = stats.pips / stats.count;
            const evPipsColor = evPips >= 0 ? '#00ff88' : '#ff4466';
            const evYen = stats.yenCount > 0 ? stats.yen / stats.yenCount : 0;
            const evYenColor = evYen >= 0 ? '#00ff88' : '#ff4466';
            return `<tr>
                <td style="text-align: center;">${badge}</td>
                <td style="text-align: center;">${stats.count}件</td>
                <td style="text-align: center;">${formatWinLoss(stats.wins, stats.losses)}</td>
                <td style="text-align: center;">${calcWinRate(stats.wins, stats.losses)}%</td>
                <td style="text-align: center; color: ${pipsColor};">${stats.pips >= 0 ? '+' : ''}${stats.pips.toFixed(1)}</td>
                <td style="text-align: center; color: ${evPipsColor};">${calcExpectedPips(stats.pips, stats.count)}</td>
                <td style="text-align: center; color: ${evYenColor};">${calcExpectedYen(stats.yen, stats.yenCount)}</td>
            </tr>`;
        };
        
        // 手法別テーブル行生成
        const methodRows = Object.entries(methodStats)
            .sort((a, b) => b[1].pips - a[1].pips)  // Pips降順
            .map(([methodId, stats]) => {
                const name = getMethodName(methodId);
                const pipsColor = stats.pips >= 0 ? '#00ff88' : '#ff4466';
                const evPips = stats.count > 0 ? stats.pips / stats.count : 0;
                const evPipsColor = evPips >= 0 ? '#00ff88' : '#ff4466';
                const evYen = stats.yenCount > 0 ? stats.yen / stats.yenCount : 0;
                const evYenColor = evYen >= 0 ? '#00ff88' : '#ff4466';
                return `<tr>
                    <td style="text-align: left; padding-left: 10px;">${name}</td>
                    <td style="text-align: center;">${stats.count}件</td>
                    <td style="text-align: center;">${formatWinLoss(stats.wins, stats.losses)}</td>
                    <td style="text-align: center;">${calcWinRate(stats.wins, stats.losses)}%</td>
                    <td style="text-align: center; color: ${pipsColor};">${stats.pips >= 0 ? '+' : ''}${stats.pips.toFixed(1)}</td>
                    <td style="text-align: center; color: ${evPipsColor};">${calcExpectedPips(stats.pips, stats.count)}</td>
                    <td style="text-align: center; color: ${evYenColor};">${calcExpectedYen(stats.yen, stats.yenCount)}</td>
                </tr>`;
            }).join('');
        
        // テーブル共通スタイル
        const tableStyle = `
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            font-size: 0.9rem;
        `;
        const thStyle = `
            background: rgba(0, 255, 136, 0.1);
            color: #00ff88;
            padding: 10px 5px;
            text-align: center;
            border-bottom: 1px solid rgba(0, 255, 136, 0.3);
        `;
        
        return `
            <div class="report-accordion" style="margin-top: 30px;">
                <div class="accordion-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0, 255, 136, 0.1); border-radius: 5px; margin-bottom: 10px;">
                    <h4 style="color: #00ff88; margin: 0;">
                        <span id="ruleRiskAnalysis-icon" 
                              onclick="window.ReportModule.toggleAccordion('ruleRiskAnalysis')" 
                              style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease;"
                              onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                              onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                        ⭕ ルール遵守・リスク分析
                    </h4>
                    <span id="ruleRiskAnalysis-icon-right"
                          onclick="window.ReportModule.toggleAccordion('ruleRiskAnalysis')" 
                          style="cursor: pointer; display: inline-block; padding: 6px 10px; background: rgba(0, 255, 136, 0.15); border-radius: 50%; box-shadow: 0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15); transition: all 0.3s ease; color: #00ff88; font-size: 16px;"
                          onmouseover="this.style.boxShadow='0 0 12px rgba(0, 255, 136, 0.5), 0 0 24px rgba(0, 255, 136, 0.35), 0 0 36px rgba(0, 255, 136, 0.2)'; this.style.transform='scale(1.1)';"
                          onmouseout="this.style.boxShadow='0 0 8px rgba(0, 255, 136, 0.4), 0 0 16px rgba(0, 255, 136, 0.25), 0 0 24px rgba(0, 255, 136, 0.15)'; this.style.transform='scale(1)';">▼</span>
                </div>
                <div id="ruleRiskAnalysis-content" style="display: none;">
                    
                    <!-- ルール遵守別成績 -->
                    <h5 style="color: #9ca3af; margin: 15px 0 10px 0; font-size: 0.85rem;">📋 ルール遵守別成績</h5>
                    <table style="${tableStyle}">
                        <thead>
                            <tr>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}">件数</th>
                                <th style="${thStyle}">勝敗</th>
                                <th style="${thStyle}">勝率</th>
                                <th style="${thStyle}">Pips</th>
                                <th style="${thStyle}">期待値(p)</th>
                                <th style="${thStyle}">期待値(¥)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${generateRow('⭕', ruleStats.yes)}
                            ${generateRow('❌', ruleStats.no)}
                        </tbody>
                    </table>
                    
                    <!-- 許容損失別成績 -->
                    <h5 style="color: #9ca3af; margin: 20px 0 10px 0; font-size: 0.85rem;">📋 許容損失別成績</h5>
                    <table style="${tableStyle}">
                        <thead>
                            <tr>
                                <th style="${thStyle}"></th>
                                <th style="${thStyle}">件数</th>
                                <th style="${thStyle}">勝敗</th>
                                <th style="${thStyle}">勝率</th>
                                <th style="${thStyle}">Pips</th>
                                <th style="${thStyle}">期待値(p)</th>
                                <th style="${thStyle}">期待値(¥)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${generateRow('✅', riskStats.normal)}
                            ${generateRow('⚠️', riskStats.warning)}
                            ${generateRow('🚨', riskStats.danger)}
                        </tbody>
                    </table>
                    
                    <!-- 手法別成績 -->
                    <h5 style="color: #9ca3af; margin: 20px 0 10px 0; font-size: 0.85rem;">📋 手法別成績</h5>
                    <table style="${tableStyle}">
                        <thead>
                            <tr>
                                <th style="${thStyle}">手法</th>
                                <th style="${thStyle}">件数</th>
                                <th style="${thStyle}">勝敗</th>
                                <th style="${thStyle}">勝率</th>
                                <th style="${thStyle}">Pips</th>
                                <th style="${thStyle}">期待値(p)</th>
                                <th style="${thStyle}">期待値(¥)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${methodRows || '<tr><td colspan="7" style="text-align: center; color: #9ca3af; padding: 20px;">データがありません</td></tr>'}
                        </tbody>
                    </table>
                    
                </div>
            </div>
        `;
    }

    /**
     * 印刷用ルール遵守・リスク分析HTMLを生成（Phase 5）
     * @private
     */
    #generatePrintRuleRiskAnalysis(trades) {
        // 1. ルール遵守別成績を計算
        const ruleStats = { 
            yes: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 }, 
            no: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 } 
        };
        
        // 2. 許容損失別成績を計算
        const riskStats = { 
            normal: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 }, 
            warning: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 }, 
            danger: { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 } 
        };
        
        // 3. 手法別成績を計算
        const methodStats = {};
        
        trades.forEach(trade => {
            const pips = this.#calculateTradePips(trade);
            const isWin = pips > 0;
            
            // 円建て損益を取得
            const yenProfit = trade.yenProfitLoss?.netProfit || 0;
            const hasYen = trade.yenProfitLoss?.netProfit !== undefined;
            
            // ルール遵守別
            const reflection = typeof trade.reflection === 'object' ? trade.reflection : null;
            if (reflection && reflection.ruleFollowed) {
                const key = reflection.ruleFollowed;
                if (ruleStats[key]) {
                    ruleStats[key].count++;
                    ruleStats[key].pips += pips;
                    if (hasYen) {
                        ruleStats[key].yen += yenProfit;
                        ruleStats[key].yenCount++;
                    }
                    if (isWin) ruleStats[key].wins++;
                    else if (pips < 0) ruleStats[key].losses++;
                }
            }
            
            // 許容損失別
            if (trade.riskStatus && riskStats[trade.riskStatus]) {
                riskStats[trade.riskStatus].count++;
                riskStats[trade.riskStatus].pips += pips;
                if (hasYen) {
                    riskStats[trade.riskStatus].yen += yenProfit;
                    riskStats[trade.riskStatus].yenCount++;
                }
                if (isWin) riskStats[trade.riskStatus].wins++;
                else if (pips < 0) riskStats[trade.riskStatus].losses++;
            }
            
            // 手法別
            const methodId = trade.methodId || 'none';
            if (!methodStats[methodId]) {
                methodStats[methodId] = { count: 0, wins: 0, losses: 0, pips: 0, yen: 0, yenCount: 0 };
            }
            methodStats[methodId].count++;
            methodStats[methodId].pips += pips;
            if (hasYen) {
                methodStats[methodId].yen += yenProfit;
                methodStats[methodId].yenCount++;
            }
            if (isWin) methodStats[methodId].wins++;
            else if (pips < 0) methodStats[methodId].losses++;
        });
        
        // ヘルパー関数
        const calcWinRate = (wins, losses) => {
            const total = wins + losses;
            return total > 0 ? ((wins / total) * 100).toFixed(1) : '-';
        };
        
        const formatWinLoss = (wins, losses) => {
            if (wins === 0 && losses === 0) return '-';
            return `${wins}勝${losses}敗`;
        };
        
        const calcExpectedPips = (pips, count) => {
            if (count === 0) return '-';
            const ev = pips / count;
            return `${ev >= 0 ? '+' : ''}${ev.toFixed(1)}p`;
        };
        
        const calcExpectedYen = (yen, yenCount) => {
            if (yenCount === 0) return '-';
            const ev = yen / yenCount;
            return `${ev >= 0 ? '+' : ''}¥${Math.round(ev).toLocaleString()}`;
        };
        
        const getMethodName = (methodId) => {
            if (methodId === 'none') return '未設定';
            const method = window.SettingsModule?.getMethodById(methodId);
            return method ? (method.shortName || method.name) : '不明';
        };
        
        const generateRow = (badge, stats) => {
            if (stats.count === 0) {
                return `<tr>
                    <td style="text-align: center;">${badge}</td>
                    <td style="text-align: center;">0件</td>
                    <td style="text-align: center;">-</td>
                    <td style="text-align: center;">-</td>
                    <td style="text-align: center;">-</td>
                    <td style="text-align: center;">-</td>
                    <td style="text-align: center;">-</td>
                </tr>`;
            }
            const pipsColor = stats.pips >= 0 ? '#00ff88' : '#ff4466';
            const evPips = stats.pips / stats.count;
            const evPipsColor = evPips >= 0 ? '#00ff88' : '#ff4466';
            const evYen = stats.yenCount > 0 ? stats.yen / stats.yenCount : 0;
            const evYenColor = evYen >= 0 ? '#00ff88' : '#ff4466';
            return `<tr>
                <td style="text-align: center;">${badge}</td>
                <td style="text-align: center;">${stats.count}件</td>
                <td style="text-align: center;">${formatWinLoss(stats.wins, stats.losses)}</td>
                <td style="text-align: center;">${calcWinRate(stats.wins, stats.losses)}%</td>
                <td style="text-align: center; color: ${pipsColor};">${stats.pips >= 0 ? '+' : ''}${stats.pips.toFixed(1)}</td>
                <td style="text-align: center; color: ${evPipsColor};">${calcExpectedPips(stats.pips, stats.count)}</td>
                <td style="text-align: center; color: ${evYenColor};">${calcExpectedYen(stats.yen, stats.yenCount)}</td>
            </tr>`;
        };
        
        // 手法別テーブル行生成
        const methodRows = Object.entries(methodStats)
            .sort((a, b) => b[1].pips - a[1].pips)
            .map(([methodId, stats]) => {
                const name = getMethodName(methodId);
                const pipsColor = stats.pips >= 0 ? '#00ff88' : '#ff4466';
                const evPips = stats.count > 0 ? stats.pips / stats.count : 0;
                const evPipsColor = evPips >= 0 ? '#00ff88' : '#ff4466';
                const evYen = stats.yenCount > 0 ? stats.yen / stats.yenCount : 0;
                const evYenColor = evYen >= 0 ? '#00ff88' : '#ff4466';
                return `<tr>
                    <td style="text-align: left;">${name}</td>
                    <td style="text-align: center;">${stats.count}件</td>
                    <td style="text-align: center;">${formatWinLoss(stats.wins, stats.losses)}</td>
                    <td style="text-align: center;">${calcWinRate(stats.wins, stats.losses)}%</td>
                    <td style="text-align: center; color: ${pipsColor};">${stats.pips >= 0 ? '+' : ''}${stats.pips.toFixed(1)}</td>
                    <td style="text-align: center; color: ${evPipsColor};">${calcExpectedPips(stats.pips, stats.count)}</td>
                    <td style="text-align: center; color: ${evYenColor};">${calcExpectedYen(stats.yen, stats.yenCount)}</td>
                </tr>`;
            }).join('');
        
        return `
            <!-- ルール遵守別成績 -->
            <div style="margin-bottom: 25px;">
                <h4 style="color: #7a8599; margin-bottom: 10px; font-size: 14px;">📋 ルール遵守別成績</h4>
                <table class="trades-table" style="font-size: 12px;">
                    <thead>
                        <tr>
                            <th style="width: 40px;"></th>
                            <th>件数</th>
                            <th>勝敗</th>
                            <th>勝率</th>
                            <th>Pips</th>
                            <th>期待値(p)</th>
                            <th>期待値(¥)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateRow('⭕', ruleStats.yes)}
                        ${generateRow('❌', ruleStats.no)}
                    </tbody>
                </table>
            </div>
            
            <!-- 許容損失別成績 -->
            <div style="margin-bottom: 25px;">
                <h4 style="color: #7a8599; margin-bottom: 10px; font-size: 14px;">📋 許容損失別成績</h4>
                <table class="trades-table" style="font-size: 12px;">
                    <thead>
                        <tr>
                            <th style="width: 40px;"></th>
                            <th>件数</th>
                            <th>勝敗</th>
                            <th>勝率</th>
                            <th>Pips</th>
                            <th>期待値(p)</th>
                            <th>期待値(¥)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${generateRow('✅', riskStats.normal)}
                        ${generateRow('⚠️', riskStats.warning)}
                        ${generateRow('🚨', riskStats.danger)}
                    </tbody>
                </table>
            </div>
            
            <!-- 手法別成績 -->
            <div>
                <h4 style="color: #7a8599; margin-bottom: 10px; font-size: 14px;">📋 手法別成績</h4>
                <table class="trades-table" style="font-size: 12px;">
                    <thead>
                        <tr>
                            <th>手法</th>
                            <th>件数</th>
                            <th>勝敗</th>
                            <th>勝率</th>
                            <th>Pips</th>
                            <th>期待値(p)</th>
                            <th>期待値(¥)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${methodRows || '<tr><td colspan="7" style="text-align: center; color: #999;">データがありません</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    }
}

// 即座に初期化（シングルトン）
window.ReportModule = new ReportModule();

// セッション判定のグローバル公開（橋渡しのみ・ロジックはクラス内）
window.getTradeSession = function(date) {
    return window.ReportModule.getTradeSession(date);
};
window.getSessionDisplayName = function(key) {
    return window.ReportModule.getSessionDisplayName(key);
};

// アコーディオン用のグローバル関数を追加
if (!window.ReportModule.toggleAccordion) {
    const reportModuleInstance = window.ReportModule;
    window.ReportModule.toggleAccordion = function(sectionId) {
        reportModuleInstance.toggleAccordion(sectionId);
    };
}

// changePagination用のグローバル関数を追加
if (!window.ReportModule.changePagination) {
    const reportModuleInstance = window.ReportModule;
    window.ReportModule.changePagination = function(sectionId, action, value) {
        reportModuleInstance.changePagination(sectionId, action, value);
    };
}

// デバッグ出力
console.log('ReportModule loaded:', window.ReportModule.getStatus());