// js/part2/TradeValidator.js
// トレードデータのバリデーション機能

(function() {
    'use strict';
    
    class TradeValidator {
        constructor() {
            console.log('TradeValidator初期化完了');
        }
        
        // 価格矛盾チェック
        validatePriceLogic(direction, entryPrice, stopLoss, takeProfit) {
            const errors = [];
            
            // 数値変換
            const entry = parseFloat(entryPrice);
            const sl = parseFloat(stopLoss);
            const tp = parseFloat(takeProfit);
            
            if (isNaN(entry) || isNaN(sl) || isNaN(tp)) {
                errors.push('価格は数値で入力してください');
                return errors;
            }
            
            if (direction === 'long') {
                if (entry <= sl) {
                    errors.push('ロングの場合、ストップロスはエントリー価格より低く設定してください');
                }
                if (entry >= tp) {
                    errors.push('ロングの場合、テイクプロフィットはエントリー価格より高く設定してください');
                }
            } else if (direction === 'short') {
                if (entry >= sl) {
                    errors.push('ショートの場合、ストップロスはエントリー価格より高く設定してください');
                }
                if (entry <= tp) {
                    errors.push('ショートの場合、テイクプロフィットはエントリー価格より低く設定してください');
                }
            }
            
            return errors;
        }
        
        // 決済日時の矛盾チェック
        validateExitDateTime(entryTime, exitTime) {
            const result = {
                isValid: true,
                message: '',
                details: '',
                holdingTime: ''
            };
            
            if (!entryTime || !exitTime) {
                result.isValid = false;
                result.message = '日時を入力してください';
                return result;
            }
            
            const entryDate = new Date(entryTime);
            const exitDate = new Date(exitTime);
            
            if (exitDate <= entryDate) {
                result.isValid = false;
                result.message = '決済日時はエントリー日時より後に設定してください';
                result.details = `エントリー: ${this.formatDateTime(entryDate)}\n決済: ${this.formatDateTime(exitDate)}`;
            } else {
                // 保有時間を計算
                const diffMs = exitDate - entryDate;
                const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                
                if (days > 0) {
                    result.holdingTime = `${days}日${hours}時間${minutes}分`;
                } else if (hours > 0) {
                    result.holdingTime = `${hours}時間${minutes}分`;
                } else {
                    result.holdingTime = `${minutes}分`;
                }
            }
            
            return result;
        }
        
        // トレード全体のバリデーション
        validateTrade(trade) {
            const errors = [];
            
            // 必須項目チェック
            if (!trade.pair || trade.pair.trim() === '') {
                errors.push('通貨ペアを入力してください');
            }
            
            if (!trade.direction) {
                errors.push('売買方向を選択してください');
            }
            
            if (!trade.entryPrice || parseFloat(trade.entryPrice) <= 0) {
                errors.push('有効なエントリー価格を入力してください');
            }
            
            if (!trade.lotSize || parseFloat(trade.lotSize) <= 0) {
                errors.push('有効なロット数を入力してください');
            }
            
            // ロット数の範囲チェック
            const lot = parseFloat(trade.lotSize);
            if (lot < 0.01) {
                errors.push('ロット数は0.01以上で入力してください');
            }
            if (lot > 100) {
                errors.push('ロット数は100以下で入力してください');
            }
            
            // 価格ロジックチェック
            if (trade.stopLoss && trade.takeProfit) {
                const priceErrors = this.validatePriceLogic(
                    trade.direction,
                    trade.entryPrice,
                    trade.stopLoss,
                    trade.takeProfit
                );
                errors.push(...priceErrors);
            }
            
            return {
                isValid: errors.length === 0,
                errors: errors
            };
        }
        
        // 決済情報のバリデーション
        validateExit(exit, entryPrice, direction) {
            const errors = [];
            
            if (!exit.price || parseFloat(exit.price) <= 0) {
                errors.push('有効な決済価格を入力してください');
            }
            
            if (!exit.lot || parseFloat(exit.lot) <= 0) {
                errors.push('有効な決済ロット数を入力してください');
            }
            
            return {
                isValid: errors.length === 0,
                errors: errors
            };
        }
        
        // ユーティリティ：日時フォーマット
        formatDateTime(date) {
            const d = new Date(date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hour = String(d.getHours()).padStart(2, '0');
            const minute = String(d.getMinutes()).padStart(2, '0');
            
            return `${year}/${month}/${day} ${hour}:${minute}`;
        }
    }
    
    // グローバルに公開
    window.TradeValidator = TradeValidator;
    window.tradeValidator = new TradeValidator();
    
})();