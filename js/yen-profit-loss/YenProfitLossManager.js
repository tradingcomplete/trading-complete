/**
 * @file YenProfitLossManager.js
 * @description 円建て損益管理モジュール - Trading Completeの核心機能
 * @author コンパナ
 * @version 1.0.0
 * @date 2025-08-27
 */

// Logger クラス（既存のLoggerがない場合の簡易版）
class Logger {
    constructor(module) {
        this.module = module;
        this.isDevelopment = true; // 本番環境では false に設定
    }
    
    info(message, data = {}) {
        if (this.isDevelopment) {
            console.log(`[${this.module}] INFO:`, message, data);
        }
    }
    
    warn(message, data = {}) {
        console.warn(`[${this.module}] WARN:`, message, data);
    }
    
    error(message, data = {}) {
        console.error(`[${this.module}] ERROR:`, message, data);
    }
}

// カスタムエラークラス
class YenProfitLossError extends Error {
    constructor(message, originalError = null) {
        super(message);
        this.name = 'YenProfitLossError';
        this.originalError = originalError;
    }
}

/**
 * @class YenValidator
 * @description 円建て損益データの検証クラス
 */
class YenValidator {
    /**
     * 円建て損益データの検証
     * @param {Object} data - 検証対象データ
     * @throws {YenProfitLossError} 検証エラー
     */
    validateYenData(data) {
        if (!data || typeof data !== 'object') {
            throw new YenProfitLossError('データが無効です');
        }
        
        // 数値検証
        const fields = ['profitLoss', 'swap', 'commission'];
        for (const field of fields) {
            if (data[field] !== undefined && data[field] !== null) {
                const value = Number(data[field]);
                if (isNaN(value)) {
                    throw new YenProfitLossError(`${field}は数値である必要があります`);
                }
                // 極端な値のチェック（1億円を超える場合は警告）
                if (Math.abs(value) > 100000000) {
                    console.warn(`警告: ${field}の値が極端です: ${value}`);
                }
            }
        }
    }
    
    /**
     * トレードIDの検証
     * @param {string} tradeId - トレードID
     * @throws {YenProfitLossError} 検証エラー
     */
    validateTradeId(tradeId) {
        if (!tradeId || typeof tradeId !== 'string') {
            throw new YenProfitLossError('トレードIDが無効です');
        }
    }
}

/**
 * @class YenCalculator
 * @description 円建て損益の計算ロジック
 */
class YenCalculator {
    /**
     * 純損益を計算
     * @param {Object} data - 損益データ
     * @returns {Object} 計算済みデータ
     */
    calculate(data) {
        const profitLoss = Number(data.profitLoss) || 0;
        const swap = Number(data.swap) || 0;
        const commission = Number(data.commission) || 0;
        
        // 手数料は通常負の値として扱う
        const normalizedCommission = commission > 0 ? -commission : commission;
        
        return {
            profitLoss,
            swap,
            commission: normalizedCommission,
            netProfit: profitLoss + swap + normalizedCommission,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * pipsから円への換算
     * @param {number} pips - pips値
     * @param {string} pair - 通貨ペア
     * @param {number} lotSize - ロットサイズ（1lot = 10万通貨）
     * @returns {number} 円換算値
     */
    convertPipsToYen(pips, pair, lotSize) {
        const pipValue = this.getPipValue(pair);
        return Math.round(pips * lotSize * pipValue);
    }
    
    /**
     * 通貨ペアごとのpip値を取得
     * @param {string} pair - 通貨ペア
     * @returns {number} pip値（円）
     */
    getPipValue(pair) {
        // クロス円の場合: 1pip = 1000円/lot
        if (pair.endsWith('/JPY')) {
            return 1000;
        }
        
        // ドルストレートの場合: レートによって変動（仮値）
        const pipValues = {
            'EUR/USD': 1500, // 1ドル150円として計算
            'GBP/USD': 1500,
            'AUD/USD': 1500,
            'NZD/USD': 1500,
            'USD/CHF': 1500,
            'USD/CAD': 1500
        };
        
        return pipValues[pair] || 1000;
    }
}

/**
 * @class YenFormatter
 * @description 円建て表示のフォーマッター
 */
class YenFormatter {
    /**
     * 円表示にフォーマット
     * @param {number} value - 金額
     * @param {boolean} showSign - 符号を表示するか
     * @returns {string} フォーマット済み文字列
     */
    formatYen(value, showSign = false) {
        if (value === null || value === undefined) {
            return '¥0';
        }
        
        const sign = showSign && value > 0 ? '+' : '';
        return `${sign}¥${value.toLocaleString('ja-JP')}`;
    }
    
    /**
     * 色クラスを決定
     * @param {number} value - 金額
     * @returns {string} CSSクラス名
     */
    getColorClass(value) {
        if (value > 0) return 'profit';
        if (value < 0) return 'loss';
        return 'neutral';
    }
    
    /**
     * 統計表示用のフォーマット
     * @param {Object} stats - 統計データ
     * @returns {Object} フォーマット済みデータ
     */
    formatStatistics(stats) {
        return {
            totalPL: this.formatYen(stats.profitLoss, true),
            totalSwap: this.formatYen(stats.swap, true),
            totalCommission: this.formatYen(stats.commission),
            netProfit: this.formatYen(stats.netProfit, true),
            tradeCount: stats.count,
            averageProfit: this.formatYen(
                stats.count > 0 ? Math.round(stats.netProfit / stats.count) : 0
            )
        };
    }
}

/**
 * @class YenProfitLossManager
 * @description 円建て損益を管理する中核モジュール
 * @implements {SixPointsStandard} 6点セット実装基準
 */
class YenProfitLossManager {
    // 1️⃣ カプセル化：プライベートフィールド
    #calculator;
    #formatter;
    #validator;
    #logger;
    #cache = new Map();
    #storagePrefix = 'yen_profit_loss_';
    
    constructor(dependencies = {}) {
        // 2️⃣ 依存性注入
        this.#calculator = dependencies.calculator || new YenCalculator();
        this.#formatter = dependencies.formatter || new YenFormatter();
        this.#validator = dependencies.validator || new YenValidator();
        this.#logger = dependencies.logger || new Logger('YenProfitLoss');
        
        this.#initialize();
    }
    
    /**
     * 円建て損益を設定
     * @param {string} tradeId - トレードID
     * @param {Object} yenData - 円建て損益データ
     * @returns {Object} 計算済み損益データ
     * @throws {YenProfitLossError} バリデーションエラー
     */
    setYenProfitLoss(tradeId, yenData) {
        // 3️⃣ エラーハンドリング
        try {
            // 4️⃣ 入力検証
            this.#validator.validateTradeId(tradeId);
            this.#validator.validateYenData(yenData);
            
            // 5️⃣ ロギング
            this.#logger.info('Setting yen profit/loss', { tradeId, yenData });
            
            // 計算処理
            const calculated = this.#calculator.calculate(yenData);
            
            // ⭐ broker フィールドを保持
            const dataToSave = {
                ...calculated,
                broker: yenData.broker || ''  // broker を追加
            };
            
            // キャッシュ更新
            this.#cache.set(tradeId, dataToSave);
            
            // 永続化
            this.#saveToStorage(tradeId, dataToSave);
            
            // イベント発火（他のモジュールへの通知）
            this.#dispatchUpdateEvent(tradeId, dataToSave);
            
            this.#logger.info('Successfully set yen profit/loss', { tradeId, calculated: dataToSave });
            return dataToSave;
            
        } catch (error) {
            this.#logger.error('Failed to set yen profit/loss', { tradeId, error: error.message });
            throw error instanceof YenProfitLossError ? 
                error : new YenProfitLossError('円建て損益の設定に失敗しました', error);
        }
    }
    
    /**
     * 円建て損益を取得
     * @param {string} tradeId - トレードID
     * @returns {Object|null} 円建て損益データ
     */
    getYenProfitLoss(tradeId) {
        try {
            this.#validator.validateTradeId(tradeId);
            
            // キャッシュから取得
            if (this.#cache.has(tradeId)) {
                return this.#cache.get(tradeId);
            }
            
            // ストレージから取得
            const data = this.#loadFromStorage(tradeId);
            if (data) {
                this.#cache.set(tradeId, data);
            }
            
            return data;
        } catch (error) {
            this.#logger.error('Failed to get yen profit/loss', { tradeId, error: error.message });
            return null;
        }
    }
    
    /**
     * 複数トレードの合計を計算
     * @param {Array<string>} tradeIds - トレードIDの配列
     * @returns {Object} 合計損益データ
     */
    calculateTotal(tradeIds = []) {
        const totals = {
            profitLoss: 0,
            swap: 0,
            commission: 0,
            netProfit: 0,
            count: 0,
            winCount: 0,
            lossCount: 0
        };
        
        for (const tradeId of tradeIds) {
            const data = this.getYenProfitLoss(tradeId);
            if (data) {
                totals.profitLoss += data.profitLoss || 0;
                totals.swap += data.swap || 0;
                totals.commission += data.commission || 0;
                totals.netProfit += data.netProfit || 0;
                totals.count++;
                
                if (data.netProfit > 0) {
                    totals.winCount++;
                } else if (data.netProfit < 0) {
                    totals.lossCount++;
                }
            }
        }
        
        // 勝率計算
        totals.winRate = totals.count > 0 ? 
            Math.round((totals.winCount / totals.count) * 100) : 0;
        
        return totals;
    }
    
    /**
     * 期間別の集計
     * @param {Date} startDate - 開始日
     * @param {Date} endDate - 終了日
     * @param {Array} allTrades - 全トレードデータ
     * @returns {Object} 期間別集計データ
     */
    calculatePeriodTotal(startDate, endDate, allTrades = []) {
        const filteredTrades = allTrades.filter(trade => {
            const tradeDate = new Date(trade.date);
            return tradeDate >= startDate && tradeDate <= endDate;
        });
        
        const tradeIds = filteredTrades.map(trade => trade.id);
        return this.calculateTotal(tradeIds);
    }
    
    /**
     * 円建て損益を削除
     * @param {string} tradeId - トレードID
     * @returns {boolean} 削除成功フラグ
     */
    deleteYenProfitLoss(tradeId) {
        try {
            this.#validator.validateTradeId(tradeId);
            
            // キャッシュから削除
            this.#cache.delete(tradeId);
            
            // ストレージから削除
            this.#deleteFromStorage(tradeId);
            
            this.#logger.info('Deleted yen profit/loss', { tradeId });
            return true;
        } catch (error) {
            this.#logger.error('Failed to delete yen profit/loss', { tradeId, error: error.message });
            return false;
        }
    }
    
    /**
     * すべてのデータをエクスポート
     * @returns {Object} エクスポートデータ
     */
    exportAll() {
        const exportData = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            data: {}
        };
        
        this.#cache.forEach((value, key) => {
            exportData.data[key] = value;
        });
        
        return exportData;
    }
    
    /**
     * データをインポート
     * @param {Object} importData - インポートデータ
     * @returns {Object} インポート結果
     */
    importData(importData) {
        const result = {
            success: 0,
            failed: 0,
            errors: []
        };
        
        try {
            if (!importData || !importData.data) {
                throw new YenProfitLossError('インポートデータが無効です');
            }
            
            for (const [tradeId, yenData] of Object.entries(importData.data)) {
                try {
                    this.setYenProfitLoss(tradeId, yenData);
                    result.success++;
                } catch (error) {
                    result.failed++;
                    result.errors.push({ tradeId, error: error.message });
                }
            }
        } catch (error) {
            this.#logger.error('Import failed', { error: error.message });
            result.errors.push({ general: error.message });
        }
        
        return result;
    }
    
    /**
     * フォーマッターを取得（UIで使用）
     * @returns {YenFormatter} フォーマッター
     */
    getFormatter() {
        return this.#formatter;
    }
    
    /**
     * 計算機を取得（UIで使用）
     * @returns {YenCalculator} 計算機
     */
    getCalculator() {
        return this.#calculator;
    }
    
    // === プライベートメソッド ===
    
    #initialize() {
        this.#logger.info('YenProfitLossManager initializing...');
        this.#loadAllFromStorage();
        this.#logger.info(`YenProfitLossManager initialized with ${this.#cache.size} records`);
    }
    
    #saveToStorage(tradeId, data) {
        const key = `${this.#storagePrefix}${tradeId}`;
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            // LocalStorage容量エラー対策
            if (error.name === 'QuotaExceededError') {
                this.#logger.error('LocalStorage quota exceeded', { tradeId });
                throw new YenProfitLossError('ストレージ容量が不足しています');
            }
            throw error;
        }
    }
    
    #loadFromStorage(tradeId) {
        const key = `${this.#storagePrefix}${tradeId}`;
        try {
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            this.#logger.error('Failed to load from storage', { tradeId, error: error.message });
            return null;
        }
    }
    
    #deleteFromStorage(tradeId) {
        const key = `${this.#storagePrefix}${tradeId}`;
        localStorage.removeItem(key);
    }
    
    #loadAllFromStorage() {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(this.#storagePrefix));
        
        for (const key of keys) {
            try {
                const tradeId = key.replace(this.#storagePrefix, '');
                const data = JSON.parse(localStorage.getItem(key));
                if (data) {
                    this.#cache.set(tradeId, data);
                }
            } catch (error) {
                this.#logger.warn('Failed to load record', { key, error: error.message });
            }
        }
    }
    
    #dispatchUpdateEvent(tradeId, data) {
        // カスタムイベントを発火（他のモジュールへの通知）
        const event = new CustomEvent('yenProfitLossUpdated', {
            detail: { tradeId, data }
        });
        window.dispatchEvent(event);
    }
}

// シングルトンインスタンス管理
let instance = null;

YenProfitLossManager.getInstance = function() {
    if (!instance) {
        instance = new YenProfitLossManager();
    }
    return instance;
};

// エクスポート（ES6モジュール形式）
// export default YenProfitLossManager;
// export { YenCalculator, YenFormatter, YenValidator, YenProfitLossError };

// グローバル変数として公開（既存システム用）
window.YenProfitLossManager = YenProfitLossManager;
window.yenProfitLossManager = YenProfitLossManager.getInstance();