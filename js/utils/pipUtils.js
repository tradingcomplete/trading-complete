/**
 * pipUtils.js - 通貨ペア別 pip 計算ユーティリティ
 *
 * 役割:
 *   FX・金・銀の各通貨ペアに対する正しい pip 単位（multiplier / size）を提供する。
 *   従来 TradeCalculator / risk-ui / YenProfitLossManager で重複していた
 *   「JPY含むなら100倍、それ以外10000倍」のロジックを統一し、
 *   XAU/USD（金）等の特殊ペアにも正しく対応する。
 *
 * @version 1.0.0
 * @date 2026-04-29
 * @see docs/features/計算ロジック検証_要件定義書.md CRITICAL #1
 *
 * 通貨ペアごとの pip 仕様:
 *   - JPY 含む（USD/JPY、EUR/JPY 等）: pip = 0.01 → multiplier = 100
 *   - メタル（XAU/USD 金、XAG/USD 銀）  : pip = 0.01 → multiplier = 100
 *   - その他（EUR/USD、GBP/USD 等）     : pip = 0.0001 → multiplier = 10000
 *
 * 使用例:
 *   const multiplier = window.PipUtils.getPipMultiplier('USD/JPY'); // 100
 *   const multiplier = window.PipUtils.getPipMultiplier('XAU/USD'); // 100 (✅ 修正点)
 *   const multiplier = window.PipUtils.getPipMultiplier('EUR/USD'); // 10000
 *
 *   const pipSize = window.PipUtils.getPipSize('EUR/USD'); // 0.0001
 */

(function() {
    'use strict';

    /**
     * メタル通貨ペアの判定（金・銀・白金・パラジウム）
     * pip = 0.01（XAU 等は USD建てだが pip 単位は2桁）
     * @param {string} pair - 通貨ペア（例: 'XAU/USD'）
     * @returns {boolean}
     */
    function isMetalPair(pair) {
        if (!pair || typeof pair !== 'string') return false;
        const upper = pair.toUpperCase();
        return upper.startsWith('XAU') || upper.startsWith('XAG') ||
               upper.startsWith('XPT') || upper.startsWith('XPD');
    }

    /**
     * JPY を含む通貨ペアの判定（クロス円・ストレート円）
     * @param {string} pair
     * @returns {boolean}
     */
    function isJpyPair(pair) {
        if (!pair || typeof pair !== 'string') return false;
        return pair.toUpperCase().includes('JPY');
    }

    /**
     * pip 倍率を取得（pips 計算で使う乗算値）
     * pips = (price差分) × multiplier
     * @param {string} pair
     * @returns {number} 100 or 10000
     */
    function getPipMultiplier(pair) {
        if (isJpyPair(pair)) return 100;
        if (isMetalPair(pair)) return 100;
        return 10000;
    }

    /**
     * pip サイズを取得（小数値・通貨ペアの最小pip単位）
     * @param {string} pair
     * @returns {number} 0.01 or 0.0001
     */
    function getPipSize(pair) {
        return 1 / getPipMultiplier(pair);
    }

    /**
     * 価格差から pips を計算
     * @param {string} pair - 通貨ペア
     * @param {string} direction - 'long' または 'short'
     * @param {number|string} entryPrice
     * @param {number|string} exitPrice
     * @returns {number} pips（小数点1位丸め）
     */
    function calculatePips(pair, direction, entryPrice, exitPrice) {
        const entry = parseFloat(entryPrice);
        const exit = parseFloat(exitPrice);

        if (isNaN(entry) || isNaN(exit)) return 0;

        const multiplier = getPipMultiplier(pair);
        const diff = direction === 'long' ? (exit - entry) : (entry - exit);
        const pips = diff * multiplier;

        return Math.round(pips * 10) / 10;
    }

    /**
     * クォート通貨を取得（'/' 後ろの通貨）
     * 例: 'USD/JPY' → 'JPY' / 'EUR/USD' → 'USD' / 'XAU/USD' → 'USD'
     * @param {string} pair
     * @returns {string}
     */
    function getQuoteCurrency(pair) {
        if (!pair || typeof pair !== 'string') return '';
        const parts = pair.split('/');
        return parts[1] ? parts[1].toUpperCase() : '';
    }

    /**
     * 1 pip × 1 標準ロット（10万通貨 / 金は100オンス）あたりの円換算額
     *
     * @param {string} pair - 通貨ペア
     * @param {number} quoteCurrencyRate - クォート通貨/JPY レート（USD/JPY=150 など）
     *   - JPY ペアの場合は無視可（JPY/JPY=1）
     *   - ドルストレート（EUR/USD等）の場合は USD/JPY レートを渡す
     *   - クロスペア（EUR/GBP等）の場合は GBP/JPY レートを渡す（中継通貨処理は呼出側）
     * @param {number} lotSize - 1ロットあたりの通貨単位（通常 100000 = 10万通貨）
     * @returns {number} 1 pip あたりの円換算額（例: 1000円/pip for USD/JPY 1ロット）
     *
     * 計算式:
     *   - JPY ペア: pip × lotSize × 0.01 = lotSize × 0.01 円
     *     例: 1pip × 100000 × 0.01 = 1000円
     *   - その他: pip × lotSize × pipSize × quoteCurrencyRate
     *     例: 1pip × 100000 × 0.0001 × 150(USD/JPY) = 1500円（USD/JPYレート150時）
     *   - メタル（XAU/USD等）: pip × lotSize × 0.01 × quoteCurrencyRate
     *     例: 1pip × 100 × 0.01 × 150 = 150円（金1標準ロット=100オンス想定）
     */
    function getYenPerPipPerLot(pair, quoteCurrencyRate, lotSize) {
        if (typeof lotSize !== 'number' || lotSize <= 0) {
            lotSize = 100000; // デフォルト 10万通貨
        }
        const pipSize = getPipSize(pair);

        // JPY ペアは quote が JPY なので、レート=1（円そのもの）
        if (isJpyPair(pair) && getQuoteCurrency(pair) === 'JPY') {
            return lotSize * pipSize;
        }

        // それ以外は quote通貨/JPY レートが必要
        const rate = parseFloat(quoteCurrencyRate);
        if (isNaN(rate) || rate <= 0) return null; // レート不明 → 計算不能を明示

        return lotSize * pipSize * rate;
    }

    // グローバル公開
    window.PipUtils = {
        isJpyPair,
        isMetalPair,
        getPipMultiplier,
        getPipSize,
        calculatePips,
        getQuoteCurrency,
        getYenPerPipPerLot,
        // バージョン情報
        VERSION: '1.0.0'
    };

    console.log('[PipUtils] 初期化完了 v1.0.0');
})();
