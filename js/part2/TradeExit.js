// js/part2/TradeExit.js
// Part 2 モジュール化 - トレード決済機能
// 作成日: 2025/09/17

/**
 * TradeExit クラス
 * トレード決済機能を管理
 */
class TradeExit {
    #tradeManager;
    #calculator;
    
    constructor() {
        this.#tradeManager = window.tradeManager || TradeManager.getInstance();
        this.#calculator = window.tradeCalculator || new TradeCalculator();
        console.log('TradeExit initialized');
    }
    
    /**
     * 決済モーダルを開く
     * @param {string|number} tradeId - トレードID
     */
    openExitModal(tradeId) {
        console.log('openExitModal called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) {
            console.error('Trade not found:', tradeId);
            return;
        }
        
        const modal = document.getElementById('exitModal');
        const content = document.getElementById('exitModalContent');
        
        if (!modal || !content) {
            console.error('Modal elements not found');
            return;
        }
        
        // モーダルにtradeIdを保存
        modal.dataset.tradeId = tradeId;
        
        // remainingLotの安全な計算（デバッグログ付き）
        let remainingLot = 0;
        
        console.log('Trade data:', {
            lotSize: trade.lotSize,
            exits: trade.exits,
            hasCalculator: !!this.#calculator,
            hasMethod: this.#calculator && typeof this.#calculator.calculateRemainingLot === 'function'
        });
        
        if (this.#calculator && typeof this.#calculator.calculateRemainingLot === 'function') {
            const result = this.#calculator.calculateRemainingLot(trade);
            // resultが数値の場合とオブジェクトの場合の両方に対応
            remainingLot = typeof result === 'number' ? result : (result?.remaining || 0);
            console.log('Calculator result:', result, '→ remaining:', remainingLot);
        } else {
            // フォールバック：手動計算
            const exitedLot = (trade.exits || []).reduce((sum, exit) => sum + parseFloat(exit.lot || 0), 0);
            remainingLot = parseFloat(trade.lotSize || 0) - exitedLot;
            console.log('Fallback calculation:', {
                lotSize: parseFloat(trade.lotSize || 0),
                exitedLot: exitedLot,
                remainingLot: remainingLot
            });
        }
        
        // 数値として確実に処理
        remainingLot = Math.max(0, parseFloat(remainingLot) || parseFloat(trade.lotSize) || 0);
        console.log('Final remainingLot:', remainingLot);
        
        content.innerHTML = `
            <div class="reference-info" style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px 15px; margin-bottom: 15px;">
                <h4 style="color: #60a5fa; margin: 0 0 10px 0; font-size: 0.85rem; font-weight: 600;">📊 参考情報（エントリー）</h4>
                <div style="display: grid; grid-template-columns: 1fr auto; gap: 4px 15px;">
                    <div style="font-size: 1rem; font-weight: 600; color: #e5e7eb;">${trade.pair}</div>
                    <div style="font-size: 0.85rem; color: #9ca3af; text-align: right;">
                        未決済: <span style="color: #60a5fa; font-weight: 600;">${remainingLot.toFixed(1)} Lot</span>
                    </div>
                    <div style="font-size: 0.9rem; color: ${trade.direction === 'long' ? '#4ade80' : '#f87171'}; font-weight: 500;">
                        ${trade.direction === 'long' ? '買い (LONG)' : '売り (SHORT)'}
                    </div>
                    <div style="font-size: 0.9rem; color: #e5e7eb; text-align: right;">${trade.entryPrice}</div>
                </div>
            </div>
            
            <div class="exit-entries" id="exitEntries">
                <div class="exit-entry">
                    <input type="datetime-local" class="exit-time" value="${this.#formatDateTimeForInput(new Date())}" />
                    <input type="number" class="exit-price" placeholder="価格" step="0.00001" />
                    <input type="number" class="exit-lot" placeholder="Lot" step="0.1" value="${remainingLot.toFixed(1)}" max="${remainingLot}" />
                </div>
            </div>
            
            <button class="btn btn-small btn-secondary" onclick="addExitEntry()">決済追加</button>
            
            <div id="reflectionSection" class="reflection-section" style="margin-top: 20px; padding: 15px; background: rgba(59, 130, 246, 0.05); border-radius: 8px;">
                <h4 style="color: #60a5fa; margin: 0 0 15px 0; font-size: 0.9rem;">📊 振り返り（決済後に記入）</h4>
                
                <div class="input-group" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; color: #e5e7eb; font-size: 0.85rem;">ルールを守れましたか？</label>
                    <div style="display: flex; gap: 20px;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #9ca3af;">
                            <input type="radio" name="ruleFollowed" value="yes" style="accent-color: #4ade80;">
                            <span>はい</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #9ca3af;">
                            <input type="radio" name="ruleFollowed" value="no" style="accent-color: #f87171;">
                            <span>いいえ</span>
                        </label>
                    </div>
                </div>
                
                <div class="input-group">
                    <label style="display: block; margin-bottom: 8px; color: #e5e7eb; font-size: 0.85rem;">メモ・気づき（任意）</label>
                    <textarea id="exitReflection" placeholder="トレードの振り返りを記入" style="min-height: 80px;"></textarea>
                </div>
            </div>
            
            <div class="button-group">
                <button class="btn btn-primary" onclick="saveExitRecord('${tradeId}')">決済を保存</button>
                <button class="btn btn-secondary" onclick="closeExitModal()">キャンセル</button>
            </div>
        `;
        
        // 初期表示の決済エントリーにもバリデーションを追加
        const initialDateTimeInput = content.querySelector('.exit-time');
        if (initialDateTimeInput) {
            initialDateTimeInput.addEventListener('change', () => {
                this.#validateExitDateTime(trade, initialDateTimeInput);
            });
        }
        
        modal.style.display = 'flex';
        modal.style.zIndex = '10000';  // 確実に前面に表示
        
        // 全決済判定：振り返りセクションの表示/非表示を動的に切り替え
        const updateReflectionVisibility = () => {
            const reflectionSection = document.getElementById('reflectionSection');
            if (!reflectionSection) return;
            
            const lotInputs = document.querySelectorAll('.exit-lot');
            let totalExitLot = 0;
            lotInputs.forEach(input => {
                totalExitLot += parseFloat(input.value) || 0;
            });
            
            const isFullExit = Math.abs(totalExitLot - remainingLot) < 0.01;
            reflectionSection.style.display = isFullExit ? 'block' : 'none';
        };
        
        // 初期表示時に実行
        updateReflectionVisibility();
        
        // Lot入力欄の変更を監視
        content.querySelector('.exit-lot')?.addEventListener('input', updateReflectionVisibility);
        
        // モーダル外クリックで閉じる（無効化）
        // modal.onclick = (event) => {
        //     if (event.target === modal) {
        //         this.closeExitModal();
        //     }
        // };
    }
    
    /**
     * 決済エントリーを追加
     */
    addExitEntry() {
        console.log('addExitEntry called');
        
        const container = document.getElementById('exitEntries');
        if (!container) return;
        
        const entry = document.createElement('div');
        entry.className = 'exit-entry';
        entry.innerHTML = `
            <input type="datetime-local" class="exit-time" value="${this.#formatDateTimeForInput(new Date())}" />
            <input type="number" class="exit-price" placeholder="価格" step="0.00001" />
            <input type="number" class="exit-lot" placeholder="Lot" step="0.1" />
            <button class="remove-exit" onclick="removeExitEntry(this)">削除</button>
        `;
        container.appendChild(entry);
        
        // Lot変更で振り返りセクションの表示を更新
        entry.querySelector('.exit-lot')?.addEventListener('input', () => {
            const reflectionSection = document.getElementById('reflectionSection');
            const modal = document.getElementById('exitModal');
            const tradeId = modal?.dataset.tradeId;
            if (!reflectionSection || !tradeId) return;
            
            const trade = this.#tradeManager.getTradeById(tradeId);
            if (!trade) return;
            
            // 残りLotを計算
            const exitedLot = (trade.exits || []).reduce((sum, exit) => sum + parseFloat(exit.lot || 0), 0);
            const remainingLot = Math.max(0, parseFloat(trade.lotSize || 0) - exitedLot);
            
            // 入力Lotの合計
            let totalExitLot = 0;
            document.querySelectorAll('.exit-lot').forEach(input => {
                totalExitLot += parseFloat(input.value) || 0;
            });
            
            const isFullExit = Math.abs(totalExitLot - remainingLot) < 0.01;
            reflectionSection.style.display = isFullExit ? 'block' : 'none';
        });
        
        // リアルタイムバリデーション追加
        const modal = document.getElementById('exitModal');
        const tradeId = modal?.dataset.tradeId;
        
        if (tradeId) {
            const trade = this.#tradeManager.getTradeById(tradeId);
            if (trade) {
                const dateTimeInput = entry.querySelector('.exit-time');
                if (dateTimeInput) {
                    dateTimeInput.addEventListener('change', () => {
                        this.#validateExitDateTime(trade, dateTimeInput);
                    });
                }
            }
        }
    }
    
    /**
     * 決済エントリーを削除
     * @param {HTMLElement} button - 削除ボタン
     */
    removeExitEntry(button) {
        console.log('removeExitEntry called');
        
        if (button && button.parentElement) {
            button.parentElement.remove();
        }
    }
    
    /**
     * 決済を保存
     * @param {string|number} tradeId - トレードID
     */
    saveExitRecord(tradeId) {
        console.log('saveExitRecord called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) {
            console.error('Trade not found:', tradeId);
            return;
        }
        
        const exitEntries = document.querySelectorAll('.exit-entry');
        
        // NEW: 振り返りデータの構造化
        const ruleFollowedRadio = document.querySelector('input[name="ruleFollowed"]:checked');
        const reflectionText = document.getElementById('exitReflection')?.value || '';
        
        const reflection = {
            ruleFollowed: ruleFollowedRadio?.value || null,
            text: reflectionText,
            updatedAt: new Date().toISOString()
        };
        
        let totalExitLot = 0;
        const newExits = [];
        
        exitEntries.forEach(entry => {
            const time = entry.querySelector('.exit-time')?.value;
            const price = entry.querySelector('.exit-price')?.value;
            const lot = parseFloat(entry.querySelector('.exit-lot')?.value);
            
            if (time && price && lot) {
                // 各決済のpips計算
                const exitPips = trade.direction === 'long' 
                    ? (parseFloat(price) - trade.entryPrice) * (trade.pair.includes('JPY') ? 100 : 10000)
                    : (trade.entryPrice - parseFloat(price)) * (trade.pair.includes('JPY') ? 100 : 10000);
                
                newExits.push({
                    time: time,
                    price: parseFloat(price),
                    lot: lot,
                    pips: exitPips
                });
                totalExitLot += lot;
            }
        });
        
        // バリデーション
        if (newExits.length === 0) {
            alert('決済情報を入力してください');
            return;
        }
        
        // 既存の決済と合わせて確認
        const existingExitLot = trade.exits ? 
            trade.exits.reduce((sum, exit) => sum + parseFloat(exit.lot), 0) : 0;
        
        if (existingExitLot + totalExitLot > trade.lotSize) {
            alert(`決済ロットの合計がエントリーロット(${trade.lotSize} Lot)を超えています`);
            return;
        }
        
        // 既存の決済に追加
        const allExits = [...(trade.exits || []), ...newExits];
        
        // 全決済かどうか判定
        const isFullExit = Math.abs((existingExitLot + totalExitLot) - trade.lotSize) < 0.01;
        
        // トレード更新
        // 全決済時のみreflectionを更新、分割決済時は既存を維持
        let mergedReflection = trade.reflection;
        
        if (isFullExit) {
            // 既存のreflectionが文字列の場合はtextとしてマージ
            mergedReflection = reflection;
            if (trade.reflection && typeof trade.reflection === 'string') {
                // 既存の文字列reflectionがあり、新しいtextが空の場合は既存を維持
                if (!reflection.text && trade.reflection) {
                    mergedReflection.text = trade.reflection;
                }
            } else if (trade.reflection && typeof trade.reflection === 'object') {
                // 既存がオブジェクトの場合、新しい値がなければ既存を維持
                mergedReflection = {
                    ruleFollowed: reflection.ruleFollowed || trade.reflection.ruleFollowed,
                    text: reflection.text || trade.reflection.text || '',
                    updatedAt: new Date().toISOString()
                };
            }
        } // isFullExit の閉じ括弧
        
        const updates = {
            exits: allExits,
            reflection: mergedReflection
        };
        
        const updatedTrade = this.#tradeManager.updateTrade(tradeId, updates);
        
        if (updatedTrade) {
            this.closeExitModal();
            
            // UI更新
            if (typeof window.displayAllTrades === 'function') {
                window.displayAllTrades();
            }
            if (typeof window.updateQuickStats === 'function') {
                window.updateQuickStats();
            }
            if (typeof window.showTradeDetail === 'function') {
                window.showTradeDetail(updatedTrade);
            }
            
            // トーストメッセージ
            this.#showToast('決済を保存しました', 'success');
        }
    }
    
    /**
     * 決済モーダルを閉じる
     */
    closeExitModal() {
        console.log('closeExitModal called');
        
        const modal = document.getElementById('exitModal');
        if (modal) {
            modal.style.display = 'none';
            modal.dataset.tradeId = '';
        }
    }
    
    // ==================== プライベートメソッド ====================
    
    /**
     * 日時をフォーマット（input用）
     * @private
     */
    #formatDateTimeForInput(date) {
        if (!date) return '';
        
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    /**
     * 決済日時のバリデーション
     * @private
     */
    #validateExitDateTime(trade, inputElement) {
        const entryTime = new Date(trade.entryTime || trade.date);
        const exitTime = new Date(inputElement.value);
        
        if (exitTime <= entryTime) {
            this.#showValidationError(
                inputElement,
                '決済日時はエントリー日時より後である必要があります',
                `エントリー: ${this.#formatDateTimeForDisplay(entryTime)}`
            );
            return false;
        }
        
        this.#clearValidationErrors();
        return true;
    }
    
    /**
     * 日時をフォーマット（表示用）
     * @private
     */
    #formatDateTimeForDisplay(date) {
        if (!date) return '';
        
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    }
    
    /**
     * バリデーションエラー表示
     * @private
     */
    #showValidationError(element, message, details) {
        // 既存のエラーメッセージを削除
        this.#clearValidationErrors();
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'validation-error';
        errorDiv.style.cssText = `
            background: rgba(255, 0, 0, 0.1);
            border: 1px solid #ff0000;
            color: #ff6b6b;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            font-size: 14px;
        `;
        errorDiv.innerHTML = `
            <strong>${message}</strong>
            ${details ? `<br><small>${details}</small>` : ''}
        `;
        
        if (element && element.parentElement) {
            element.parentElement.appendChild(errorDiv);
            element.style.borderColor = '#ff0000';
        }
    }
    
    /**
     * バリデーションエラーをクリア
     * @private
     */
    #clearValidationErrors() {
        const errors = document.querySelectorAll('.validation-error');
        errors.forEach(error => error.remove());
        
        const inputs = document.querySelectorAll('input[style*="border-color"]');
        inputs.forEach(input => {
            input.style.borderColor = '';
        });
    }
    
    /**
     * トーストメッセージ表示
     * @private
     */
    #showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
}

// グローバルに公開
window.TradeExit = TradeExit;
console.log('TradeExit.js loaded');