// js/part2/TradeCalculator.js
// トレード関連の計算機能

(function() {
    'use strict';
    
    class TradeCalculator {
        constructor() {
            console.log('TradeCalculator初期化完了');
        }
        
        // pips計算
        calculatePips(pair, direction, entryPrice, exitPrice) {
            const entry = parseFloat(entryPrice);
            const exit = parseFloat(exitPrice);
            
            if (isNaN(entry) || isNaN(exit)) {
                return 0;
            }
            
            // JPY絡みの通貨ペアは100倍、それ以外は10000倍
            const multiplier = pair.includes('JPY') ? 100 : 10000;
            
            let pips;
            if (direction === 'long') {
                pips = (exit - entry) * multiplier;
            } else {
                pips = (entry - exit) * multiplier;
            }
            
            return Math.round(pips * 10) / 10; // 小数点1位まで
        }
        
        // リスクリワード計算
        calculateRiskReward(entryPrice, stopLoss, takeProfit, direction) {
            const entry = parseFloat(entryPrice);
            const sl = parseFloat(stopLoss);
            const tp = parseFloat(takeProfit);
            
            if (isNaN(entry) || isNaN(sl) || isNaN(tp)) {
                return { risk: 0, reward: 0, ratio: 0 };
            }
            
            let risk, reward;
            
            if (direction === 'long') {
                risk = Math.abs(entry - sl);
                reward = Math.abs(tp - entry);
            } else {
                risk = Math.abs(sl - entry);
                reward = Math.abs(entry - tp);
            }
            
            const ratio = risk > 0 ? (reward / risk) : 0;
            
            return {
                risk: Math.round(risk * 100000) / 100000,
                reward: Math.round(reward * 100000) / 100000,
                ratio: Math.round(ratio * 100) / 100
            };
        }
        
        // 初期RR計算（エントリー時）
        calculateInitialRR(trade) {
            if (!trade.stopLoss || !trade.takeProfit) {
                return 0;
            }
            
            const result = this.calculateRiskReward(
                trade.entryPrice,
                trade.stopLoss,
                trade.takeProfit,
                trade.direction
            );
            
            return result.ratio;
        }
        
        // 実際のRR計算（決済後）
        calculateTradeRR(trade) {
            if (!trade.exits || trade.exits.length === 0) {
                return 0;
            }
            
            // 加重平均価格を計算
            let totalLot = 0;
            let weightedPrice = 0;
            
            trade.exits.forEach(exit => {
                const lot = parseFloat(exit.lot) || 0;
                const price = parseFloat(exit.price) || 0;
                weightedPrice += price * lot;
                totalLot += lot;
            });
            
            if (totalLot === 0) return 0;
            
            const avgExitPrice = weightedPrice / totalLot;
            
            // RR計算
            const entry = parseFloat(trade.entryPrice);
            const sl = parseFloat(trade.stopLoss);
            
            let actualReward, risk;
            
            if (trade.direction === 'long') {
                actualReward = avgExitPrice - entry;
                risk = entry - sl;
            } else {
                actualReward = entry - avgExitPrice;
                risk = sl - entry;
            }
            
            if (risk <= 0) return 0;
            
            return Math.round((actualReward / risk) * 100) / 100;
        }
        
        // トレードのpips計算（決済込み）
        calculateTradePips(trade) {
            if (!trade.exits || trade.exits.length === 0) {
                return 0;
            }
            
            let totalPips = 0;
            let totalLot = 0;
            
            trade.exits.forEach(exit => {
                const pips = this.calculatePips(
                    trade.pair,
                    trade.direction,
                    trade.entryPrice,
                    exit.price
                );
                const lot = parseFloat(exit.lot) || 0;
                totalPips += pips * lot;
                totalLot += lot;
            });
            
            if (totalLot === 0) return 0;
            
            return Math.round((totalPips / totalLot) * 10) / 10;
        }
        
        /**
         * 未決済ロットを計算
         * @param {Object} trade - トレードオブジェクト
         * @returns {number} 未決済ロット数
         */
        calculateRemainingLot(trade) {
            // tradeが未定義の場合
            if (!trade) {
                return 0;
            }
    
            // 決済情報がない場合
            if (!trade.exits || trade.exits.length === 0) {
                return parseFloat(trade.lotSize) || 0;
            }
    
            // 決済済みロットを計算
            const entryLot = parseFloat(trade.lotSize) || 0;
            const exitedLot = trade.exits.reduce((sum, exit) => 
                sum + parseFloat(exit.lot || 0), 0);
    
            // 未決済ロットを返す（0未満にならないようにする）
            return Math.max(0, entryLot - exitedLot);
        }
        
        // 保有時間計算
        calculateHoldingTime(entryTime, exitTime) {
            const entry = new Date(entryTime);
            const exit = new Date(exitTime);
            
            const diffMs = exit - entry;
            
            if (diffMs < 0) return '計算エラー';
            
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            
            if (days > 0) {
                return `${days}日${hours}時間${minutes}分`;
            } else if (hours > 0) {
                return `${hours}時間${minutes}分`;
            } else {
                return `${minutes}分`;
            }
        }
    }
    
    // グローバルに公開
    window.TradeCalculator = TradeCalculator;
    window.tradeCalculator = new TradeCalculator();
    
})();