// js/part2/TradeEdit.js
// Part 2 モジュール化 第5段階 - トレード編集機能の分離
// 作成日: 2025/09/17

/**
 * TradeEdit クラス
 * トレード編集・更新・削除機能を管理
 */
class TradeEdit {
    #tradeManager;
    #selectedTradeForEdit;
    #isProcessing;
    #eventBus;
    
    constructor() {
        this.#tradeManager = window.tradeManager || TradeManager.getInstance();
        this.#selectedTradeForEdit = null;
        this.#isProcessing = false;
        this.#eventBus = window.eventBus || null;
        
        // EventBusリスナーを設定
        this.#setupEventBusListeners();
    }
    
    // ==================== 公開メソッド ====================
    
    /**
     * トレード編集モーダルを開く
     * @param {string|number} tradeId - トレードID
     */
    editTrade(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) {
            console.error('Trade not found:', tradeId);
            return;
        }
        
        this.#selectedTradeForEdit = tradeId;
        
        // 基本情報をフォームに設定
        this.#populateEditForm(trade);
        
        // モーダル表示
        const modal = document.getElementById('tradeEditModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }
    
    /**
     * トレード更新
     */
    updateTrade() {
        if (this.#isProcessing) return;
        
        const trade = this.#tradeManager.getTradeById(this.#selectedTradeForEdit);
        if (!trade) return;
        
        this.#isProcessing = true;
        
        try {
            const updates = this.#collectUpdateData();
            
            // バリデーション
            if (!this.#validateUpdateData(updates, trade)) {
                this.#isProcessing = false;
                return;
            }
            
            // TradeManager経由で更新
            const updatedTrade = this.#tradeManager.updateTrade(trade.id, updates);
            
            if (updatedTrade) {
                // UI更新
                this.#refreshUI();
                
                // モーダルを閉じる
                this.closeTradeEditModal();
                
                // 成功通知
                this.#showToast('トレード情報を更新しました', 'success');
            }
            
        } catch (error) {
            console.error('Update error:', error);
            this.#showToast('更新エラーが発生しました', 'error');
        } finally {
            this.#isProcessing = false;
        }
    }
    
    /**
     * トレード削除
     * @param {string|number} tradeId - トレードID
     */
    deleteTrade(tradeId) {
        if (!confirm('このトレード記録を削除してもよろしいですか？')) return;
        
        const success = this.#tradeManager.deleteTrade(tradeId);
        
        if (success) {
            this.#refreshUI();
            this.#showToast('トレードを削除しました', 'success');
        } else {
            this.#showToast('削除に失敗しました', 'error');
        }
    }
    
    /**
     * 基本情報の保存
     * @param {string|number} tradeId - トレードID
     */
    saveBasicInfo(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        const entryTimeValue = this.#getFieldValue('editEntryTime');
        
        const updates = {
            pair: this.#getFieldValue('editPair') || trade.pair,
            direction: this.#getFieldValue('editDirection'),
            broker: this.#getFieldValue('editBroker') || trade.broker || '',
            entryTime: entryTimeValue || trade.entryTime,
            entryPrice: parseFloat(this.#getFieldValue('editEntryPrice')) || trade.entryPrice,
            lotSize: parseFloat(this.#getFieldValue('editLotSize')) || trade.lotSize,
            stopLoss: parseFloat(this.#getFieldValue('editStopLoss')) || trade.stopLoss,
            takeProfit: parseFloat(this.#getFieldValue('editTakeProfit')) || trade.takeProfit,
            scenario: this.#getFieldValue('editScenario') || trade.scenario,
            entryEmotion: (() => {
                const emotionData = window.getEmotionFromSelector('editEmotionSelector', 'editEmotionMemo');
                // 何も選択されず、メモも空なら既存値を維持
                if (!emotionData.selection && !emotionData.memo) {
                    return trade.entryEmotion;
                }
                return emotionData;
            })()
        };
        
        const updatedTrade = this.#tradeManager.updateTrade(tradeId, updates)
        
        if (updatedTrade) {
            this.#refreshUI();
            this.#closeModal('tradeEditModal');
            this.#showToast('エントリー情報を更新しました', 'success');
            
            // 詳細モーダルが開いている場合は更新
            if (this.#isModalOpen('tradeDetailModal')) {
                if (typeof window.showTradeDetail === 'function') {
                    window.showTradeDetail(updatedTrade);
                }
            }
        }
    }
    
    /**
     * エントリー根拠の保存
     * @param {string|number} tradeId - トレードID
     */
    saveReasons(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // reasonsが存在しない場合は初期化
        const reasons = [
            this.#getFieldValue('editReason1') || '',
            this.#getFieldValue('editReason2') || '',
            this.#getFieldValue('editReason3') || ''
        ];
        
        const updatedTrade = this.#tradeManager.updateTrade(tradeId, { reasons });
        
        if (updatedTrade) {
            this.#refreshUI();
            this.#closeModal('tradeEditModal');
            this.#showToast('チェックリストを更新しました', 'success');
            
            // 詳細モーダル更新
            if (this.#isModalOpen('tradeDetailModal')) {
                if (typeof window.showTradeDetail === 'function') {
                    window.showTradeDetail(updatedTrade);
                }
            }
        }
    }
    
    /**
     * 決済情報の保存
     * @param {string|number} tradeId - トレードID
     */
    saveExitInfo(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // 決済ロット合計の検証
        const entryLot = parseFloat(trade.lotSize) || parseFloat(trade.lot) || 0;
        const exitEntries = Array.from(document.querySelectorAll('.exit-entry-form'));
        const totalExitLot = exitEntries.reduce((sum, entry) => {
            const lot = parseFloat(entry.querySelector('.exit-lot').value) || 0;
            return sum + lot;
        }, 0);
        
        // エントリーロットを超える場合はエラー
        if (totalExitLot > entryLot) {
            const exceededLot = (totalExitLot - entryLot).toFixed(2);
            this.#showToast(
                `決済ロット合計(${totalExitLot})がエントリーロット(${entryLot})を${exceededLot}ロット超えています`, 
                'error'
            );
            return; // 保存を中断
        }
        
        // 警告:エントリーロット未満の場合
        if (totalExitLot < entryLot) {
            const remainingLot = (entryLot - totalExitLot).toFixed(2);
            console.warn(`未決済ロットが${remainingLot}ロット残っています`);
        }
        
        // try-catchを追加
        let exitData;
        try {
            exitData = this.#collectExitData();
        } catch (error) {
            // エラーメッセージは既に表示済み
            console.error('collectExitData error:', error);
            return; // 保存を中断
        }
        
        // バリデーション
        if (!this.#validateExitData(exitData, trade)) {
            return;
        }
        
        // トレード全体のpips計算（ロット加重平均）
        const weightedPipsSum = exitData.exits.reduce((sum, exit) => {
            const weightedPips = (parseFloat(exit.pips) || 0) * (parseFloat(exit.lot) || 0);
            return sum + weightedPips;
        }, 0);

        const totalExitLotForPips = exitData.exits.reduce((sum, exit) => {
            return sum + (parseFloat(exit.lot) || 0);
        }, 0);

        const averagePips = totalExitLotForPips > 0 ? weightedPipsSum / totalExitLotForPips : 0;

        // 決済ロット合計計算（ポジションステータス用）
        const totalExitLotFinal = exitData.exits.reduce((sum, exit) => {
            return sum + (parseFloat(exit.lot) || 0);
        }, 0);

        // ポジションステータスの判定
        let holdingStatus = 'open';

        if (totalExitLotFinal >= entryLot) {
            holdingStatus = 'closed';
        } else if (totalExitLotFinal > 0) {
            holdingStatus = 'partial';
        }

        const updates = {
            exits: exitData.exits,
            pips: averagePips,  // averagePipsを使用
            holdingStatus: holdingStatus
        };
        
        const updatedTrade = this.#tradeManager.updateTrade(tradeId, updates);
        
        if (updatedTrade) {
            this.#refreshUI();
            this.#closeModal('tradeEditModal');
            this.#showToast('決済情報を更新しました', 'success');
            
            // 詳細モーダル更新
            if (this.#isModalOpen('tradeDetailModal')) {
                if (typeof window.showTradeDetail === 'function') {
                    window.showTradeDetail(updatedTrade);
                }
            }
        }
    }
    
    /**
     * 編集モーダルを閉じる
     */
    closeTradeEditModal() {
        const modal = document.getElementById('tradeEditModal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.#selectedTradeForEdit = null;
    }
    
    /**
     * エントリー根拠編集モーダルを開く
     * @param {string|number} tradeId - トレードID
     */
    editTradeReasons(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        const modal = document.getElementById('tradeEditModal');
        if (!modal) return;
        
        // フォームHTMLを動的に生成
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>チェックリスト編集</h2>
                    <button class="modal-close" onclick="closeTradeEditModal()">×</button>
                </div>
                <div class="modal-body">
                    <form id="editReasonsForm">
                        <div class="form-group">
                            <label>エントリー価格の根拠</label>
                            <textarea id="editReason1" rows="3" style="resize: vertical; width: 100%;">${trade.reasons?.[0] || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>損切り価格の根拠</label>
                            <textarea id="editReason2" rows="3" style="resize: vertical; width: 100%;">${trade.reasons?.[1] || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>利確目標価格の根拠</label>
                            <textarea id="editReason3" rows="3" style="resize: vertical; width: 100%;">${trade.reasons?.[1] || ''}</textarea>
                        </div>
                    </form>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="saveReasons('${tradeId}')">保存</button>
                        <button class="btn btn-secondary" onclick="closeTradeEditModal()">キャンセル</button>
                    </div>
                </div>
            </div>
        `;
        
        // モーダルを表示
        modal.style.display = 'flex';
        modal.dataset.tradeId = tradeId;
        
        // ✅ モーダル外クリックを無効化
        // modal.onclick = (event) => {
        //     if (event.target === modal) {
        //         this.closeTradeEditModal();
        //     }
        // };
    }
    
    /**
     * 基本情報編集モーダルを開く
     * @param {string|number} tradeId - トレードID
     */
    editBasicInfo(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // モーダルを取得
        const modal = document.getElementById('tradeEditModal');
        if (!modal) return;
        
        // 日時フォーマット
        const entryTime = trade.entryTime || trade.date;
        const formattedTime = entryTime ? this.#formatDateTimeForInput(entryTime) : '';
        
        // フォーム HTMLを動的に生成
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>エントリー情報編集</h2>
                    <button class="modal-close" onclick="closeTradeEditModal()">×</button>
                </div>
                <div class="modal-body">
                    <form id="editBasicForm">
                        <!-- 横2×縦4グリッド -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                            <!-- 行1: 通貨ペア、売買方向 -->
                            <div class="form-group">
                                <label>通貨ペア / 商品</label>
                                <div style="display: flex; gap: 8px; align-items: flex-start; position: relative;">
                                    <div class="edit-pair-input-container" style="position: relative; flex: 1;">
                                        <input type="text" id="editPair" value="${trade.pair || ''}" autocomplete="off" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: rgb(255, 255, 255); border-radius: 5px;">
                                        <div id="editPairAutocomplete" class="edit-autocomplete-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: #1a1a2e; border: 1px solid rgba(0, 255, 136, 0.3); border-radius: 5px; max-height: 200px; overflow-y: auto; z-index: 1000;"></div>
                                    </div>
                                    <button type="button" id="editFavoritePairBtn" style="padding: 10px 12px; background: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.5); border-radius: 5px; cursor: pointer; font-size: 16px;" title="お気に入り通貨ペア">
                                        ⭐
                                    </button>
                                    <div id="editFavoritePairDropdown" style="display: none; position: absolute; top: 100%; right: 0; background: #1a1a2e; border: 1px solid rgba(255, 193, 7, 0.5); border-radius: 5px; min-width: 200px; max-height: 250px; overflow-y: auto; z-index: 1001;"></div>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>売買方向</label>
                                <select id="editDirection" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: rgb(255, 255, 255); border-radius: 5px;">
                                    <option value="long" ${trade.direction === 'long' || trade.direction === 'buy' ? 'selected' : ''}>ロング（買い）</option>
                                    <option value="short" ${trade.direction === 'short' || trade.direction === 'sell' ? 'selected' : ''}>ショート（売り）</option>
                                </select>
                            </div>
                            
                            <!-- 行2: ブローカー、エントリー日時 -->
                            <div class="form-group">
                                <label>ブローカー</label>
                                <select id="editBroker" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: #1a1a2e; color: rgb(255, 255, 255); border-radius: 5px;">
                                    <option value="" style="background: #1a1a2e; color: white;">ブローカーを選択</option>
                                    ${this.#generateBrokerOptions(trade.broker)}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>エントリー日時</label>
                                <input type="datetime-local" id="editEntryTime" value="${formattedTime}" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: rgb(255, 255, 255); border-radius: 5px;" />
                            </div>
                            
                            <!-- 行3: エントリー価格、ロットサイズ -->
                            <div class="form-group">
                                <label>エントリー価格</label>
                                <input type="number" id="editEntryPrice" value="${trade.entryPrice || ''}" step="${this.#getPipValueForPair(trade.pair)}" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: rgb(255, 255, 255); border-radius: 5px;" />
                            </div>
                            <div class="form-group">
                                <label>ロットサイズ</label>
                                <input type="number" id="editLotSize" value="${trade.lotSize || ''}" step="0.1" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: rgb(255, 255, 255); border-radius: 5px;" />
                            </div>
                            
                            <!-- 行4: 損切り価格、利確目標価格 -->
                            <div class="form-group">
                                <label>損切り価格</label>
                                <input type="number" id="editStopLoss" value="${trade.stopLoss || ''}" step="${this.#getPipValueForPair(trade.pair)}" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: rgb(255, 255, 255); border-radius: 5px;" />
                            </div>
                            <div class="form-group">
                                <label>利確目標価格</label>
                                <input type="number" id="editTakeProfit" value="${trade.takeProfit || ''}" step="${this.#getPipValueForPair(trade.pair)}" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: rgb(255, 255, 255); border-radius: 5px;" />
                            </div>
                        </div>
                        
                        <!-- トレードシナリオと感情（フルワイド） -->
                        <div class="form-group">
                            <label>トレードシナリオ</label>
                            <textarea id="editScenario" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: rgb(255, 255, 255); border-radius: 5px; min-height: 80px;">${trade.scenario || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>エントリー時の感情・心理状態</label>
                            <p class="emotion-hint">今、一番強い感情を選択</p>
                            <div id="editEmotionSelector" class="emotion-selector">
                                ${window.EMOTION_OPTIONS.map(opt => 
                                    '<button type="button" class="emotion-btn ' + opt.category + '" data-emotion="' + opt.key + '" onclick="toggleEmotion(this)">' + opt.emoji + ' ' + opt.label + '</button>'
                                ).join('')}
                            </div>
                            <textarea id="editEmotionMemo" style="width: 100%; padding: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: rgb(255, 255, 255); border-radius: 5px; min-height: 50px; resize: vertical; margin-top: 8px;" placeholder="補足メモ（任意）"></textarea>
                        </div>
                    </form>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="saveBasicInfo('${tradeId}')">保存</button>
                        <button class="btn btn-secondary" onclick="closeTradeEditModal()">キャンセル</button>
                    </div>
                </div>
            </div>
        `;
        
        // モーダルを表示
        modal.style.display = 'flex';
        modal.dataset.tradeId = tradeId;
        
        // 感情データを選択ボタンに反映
        window.setEmotionToSelector('editEmotionSelector', 'editEmotionMemo', trade.entryEmotion);
        
        // 少し遅延させて初期化（DOMが完全に描画されてから）
        setTimeout(() => {
            this.#initEditPairAutocomplete();
            this.#initFavoritePairButton();
        }, 100);
        
        // ✅ モーダル外クリックを無効化
        // modal.onclick = (event) => {
        //     if (event.target === modal) {
        //         this.closeTradeEditModal();
        //     }
        // };
    }
    
    /**
     * ブローカーオプションを生成
     * @param {string} currentBroker - 現在選択されているブローカー
     * @returns {string} オプションHTML
     */
    #generateBrokerOptions(currentBroker) {
        let options = '';
        const optionStyle = 'style="background: #1a1a2e; color: white;"';
        
        // SettingsModuleから登録済みブローカーを取得
        let brokers = [];
        if (window.SettingsModule && typeof window.SettingsModule.getAllBrokers === 'function') {
            brokers = window.SettingsModule.getAllBrokers() || [];
        }
        
        // ブローカーがない場合
        if (brokers.length === 0) {
            // 現在のブローカーがあれば選択肢に追加
            if (currentBroker) {
                return `<option value="${currentBroker}" selected ${optionStyle}>${currentBroker}</option>`;
            }
            return `<option value="" ${optionStyle}>ブローカーが登録されていません</option>`;
        }
        
        // 登録済みブローカーをオプションとして生成
        brokers.forEach(broker => {
            const brokerName = broker.name || broker;
            const isSelected = brokerName === currentBroker ? 'selected' : '';
            options += `<option value="${brokerName}" ${isSelected} ${optionStyle}>${brokerName}</option>`;
        });
        
        // 現在のブローカーがリストにない場合は追加
        if (currentBroker && !brokers.some(b => (b.name || b) === currentBroker)) {
            options = `<option value="${currentBroker}" selected ${optionStyle}>${currentBroker}</option>` + options;
        }
        
        return options;
    }
    
    // ================
    // EventBus連携
    // ================
    
    /**
     * EventBusリスナーの設定
     * @private
     */
    #setupEventBusListeners() {
        if (!this.#eventBus) {
            console.warn('TradeEdit: EventBus not found');
            return;
        }
        
        // ブローカー追加時にプルダウンを更新
        this.#eventBus.on('settings:brokerAdded', () => {
            console.log('🔧 TradeEdit: Broker added, updating dropdown');
            this.#updateBrokerDropdown();
        });
        
        // ブローカー編集時にプルダウンを更新
        this.#eventBus.on('settings:brokerUpdated', () => {
            console.log('🔧 TradeEdit: Broker updated, updating dropdown');
            this.#updateBrokerDropdown();
        });
        
        // ブローカー削除時にプルダウンを更新
        this.#eventBus.on('settings:brokerDeleted', () => {
            console.log('🔧 TradeEdit: Broker deleted, updating dropdown');
            this.#updateBrokerDropdown();
        });
        
        // お気に入り追加時（ログのみ）
        this.#eventBus.on('settings:favoritePairAdded', (data) => {
            console.log('🔧 TradeEdit: Favorite pair added', data?.pair || '');
        });
        
        // お気に入り削除時（ログのみ）
        this.#eventBus.on('settings:favoritePairDeleted', (data) => {
            console.log('🔧 TradeEdit: Favorite pair deleted', data?.pair || '');
        });
        
        console.log('🔧 TradeEdit: EventBus listeners registered');
    }
    
    /**
     * ブローカープルダウンを更新
     * @private
     */
    #updateBrokerDropdown() {
        const brokerSelect = document.getElementById('editBroker');
        if (!brokerSelect) {
            // モーダルが開いていない場合はスキップ
            return;
        }
        
        // 現在の選択値を保持
        const currentValue = brokerSelect.value;
        
        // オプションを再生成
        brokerSelect.innerHTML = this.#generateBrokerOptions(currentValue);
        
        console.log('🔧 TradeEdit: Broker dropdown updated');
    }
    
    /**
     * 通貨ペアからpipValueを取得
     * @param {string} pairName - 通貨ペア名（例: "USD/JPY"）
     * @returns {number} pipValue
     */
    #getPipValueForPair(pairName) {
        if (!pairName || !window.PRESET_CURRENCY_PAIRS) {
            return 0.00001; // デフォルト
        }
        
        const normalizedName = pairName.toLowerCase().replace('/', '');
        const preset = window.PRESET_CURRENCY_PAIRS.find(p => 
            p.id === pairName ||
            p.id === normalizedName ||
            p.name === pairName ||
            p.name.toLowerCase() === pairName.toLowerCase()
        );
        
        return preset ? preset.pipValue : 0.00001;
    }
    
    /**
     * 編集モーダル用の通貨ペアオートコンプリートを初期化
     */
    #initEditPairAutocomplete() {
        console.log('🔧 initEditPairAutocomplete called');
        
        const pairInput = document.getElementById('editPair');
        const dropdown = document.getElementById('editPairAutocomplete');
        
        console.log('🔧 pairInput:', pairInput);
        console.log('🔧 dropdown:', dropdown);
        
        if (!pairInput || !dropdown) {
            console.warn('🔧 editPair or dropdown not found');
            return;
        }
        
        // 既存のイベントリスナーを削除するため、新しい要素に置き換え
        const newInput = pairInput.cloneNode(true);
        pairInput.parentNode.replaceChild(newInput, pairInput);
        
        let debounceTimer = null;
        
        newInput.addEventListener('input', (e) => {
            console.log('🔧 Input event fired:', e.target.value);
            
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const query = e.target.value.trim();
                
                if (query.length < 1) {
                    dropdown.style.display = 'none';
                    return;
                }
                
                const results = this.#searchPairs(query);
                console.log('🔧 Search results:', results.length);
                
                this.#showEditAutocomplete(results, dropdown);
            }, 300);
        });
        
        // フォーカスが外れたら閉じる
        newInput.addEventListener('blur', () => {
            setTimeout(() => {
                dropdown.style.display = 'none';
            }, 200);
        });
        
        console.log('🔧 Pair autocomplete initialized successfully');
    }
    
    /**
     * お気に入りボタンの初期化
     */
    #initFavoritePairButton() {
        const btn = document.getElementById('editFavoritePairBtn');
        const dropdown = document.getElementById('editFavoritePairDropdown');
        
        if (!btn || !dropdown) {
            console.warn('🔧 Favorite button or dropdown not found');
            return;
        }
        
        btn.addEventListener('click', () => {
            if (dropdown.style.display === 'block') {
                dropdown.style.display = 'none';
            } else {
                this.#renderFavoritePairDropdown(dropdown);
                dropdown.style.display = 'block';
            }
        });
        
        // 外側クリックで閉じる
        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
        
        console.log('🔧 Favorite button initialized');
    }
    
    /**
     * お気に入り通貨ペアのドロップダウンを描画
     */
    #renderFavoritePairDropdown(dropdown) {
        // お気に入り通貨ペアを取得
        let favoritePairs = [];
        
        // SettingsModuleから取得を試みる
        if (window.SettingsModule && typeof window.SettingsModule.getFavoritePairs === 'function') {
            favoritePairs = window.SettingsModule.getFavoritePairs() || [];
        } else {
            // LocalStorageから直接取得
            try {
                const stored = localStorage.getItem('favoritePairs');
                favoritePairs = stored ? JSON.parse(stored) : [];
            } catch (e) {
                console.warn('Failed to load favorite pairs:', e);
            }
        }
        
        if (favoritePairs.length === 0) {
            dropdown.innerHTML = `
                <div style="padding: 15px; color: #7a8599; text-align: center;">
                    お気に入りが登録されていません<br>
                    <small>設定タブで追加してください</small>
                </div>
            `;
            return;
        }
        
        const presetPairs = window.PRESET_CURRENCY_PAIRS || [];
        
        dropdown.innerHTML = favoritePairs.map(pairValue => {
            // ID形式と表示名形式の両方でマッチ
            const normalizedValue = pairValue.toLowerCase().replace('/', '');
            const preset = presetPairs.find(p => 
                p.id === pairValue ||
                p.id === normalizedValue ||
                p.name === pairValue ||
                p.name.toLowerCase() === pairValue.toLowerCase()
            );
            
            const displayName = preset ? preset.name : pairValue;
            const pipInfo = preset ? `1pips=${preset.pipValue}` : '';
            const pairId = preset ? preset.id : pairValue.toLowerCase().replace('/', '');
            
            return `
                <div onclick="window.tradeEdit.selectEditPair('${pairId}')" 
                     style="padding: 12px 15px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; color: white;"
                     onmouseover="this.style.background='rgba(255, 193, 7, 0.1)'"
                     onmouseout="this.style.background='transparent'">
                    <span style="font-weight: bold;">⭐ ${displayName}</span>
                    <span style="color: #7a8599; font-size: 0.85em;">${pipInfo}</span>
                </div>
            `;
        }).join('');
    }
    
    /**
     * 通貨ペアを検索
     * @param {string} query - 検索クエリ
     * @returns {Array} マッチした通貨ペア
     */
    #searchPairs(query) {
        const presetPairs = window.PRESET_CURRENCY_PAIRS || [];
        console.log('🔧 PRESET_CURRENCY_PAIRS count:', presetPairs.length);
        
        const q = query.toLowerCase().replace('/', '');
        
        const results = presetPairs.filter(pair => {
            const idMatch = pair.id.includes(q);
            const nameMatch = pair.name.toLowerCase().replace('/', '').includes(q);
            const displayMatch = pair.displayName && pair.displayName.includes(query);
            return idMatch || nameMatch || displayMatch;
        }).slice(0, 10);
        
        console.log('🔧 Search results:', results.map(p => p.name));
        return results;
    }
    
    /**
     * オートコンプリートドロップダウンを表示
     * @param {Array} results - 検索結果
     * @param {HTMLElement} dropdown - ドロップダウン要素
     */
    #showEditAutocomplete(results, dropdown) {
        if (results.length === 0) {
            dropdown.style.display = 'none';
            return;
        }
        
        dropdown.innerHTML = results.map(pair => `
            <div class="edit-autocomplete-item" 
                style="padding: 10px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between;"
                onmouseover="this.style.background='rgba(0, 255, 136, 0.1)'"
                onmouseout="this.style.background='transparent'"
                onclick="window.tradeEdit.selectEditPair('${pair.id}')">
                <span style="font-weight: bold; color: #00ff88;">${pair.name}</span>
                <span style="color: #7a8599; font-size: 0.85em;">1pips=${pair.pipValue}</span>
            </div>
        `).join('');
        
        dropdown.style.display = 'block';
        console.log('🔧 Dropdown shown');
    }
    
    /**
     * 編集モーダルで通貨ペアを選択
     * @param {string} pairId - 通貨ペアID
     */
    selectEditPair(pairId) {
        const presetPairs = window.PRESET_CURRENCY_PAIRS || [];
        const pair = presetPairs.find(p => p.id === pairId);
        
        if (!pair) return;
        
        // 入力欄に値を設定
        const pairInput = document.getElementById('editPair');
        if (pairInput) {
            pairInput.value = pair.name;
        }
        
        // 価格入力欄のstep属性を更新
        this.#updateEditPriceSteps(pair.pipValue);
        
        // ドロップダウンを閉じる
        const dropdown = document.getElementById('editPairAutocomplete');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        
        // お気に入りドロップダウンも閉じる
        const favoriteDropdown = document.getElementById('editFavoritePairDropdown');
        if (favoriteDropdown) {
            favoriteDropdown.style.display = 'none';
        }
        
        console.log(`TradeEdit: Selected pair ${pair.name}, step=${pair.pipValue}`);
    }
    
    /**
     * 編集モーダルの価格入力欄のstep属性を更新
     * @param {number} pipValue - pips値
     */
    #updateEditPriceSteps(pipValue) {
        const stepValue = pipValue || 0.00001;
        
        const editEntryPrice = document.getElementById('editEntryPrice');
        const editStopLoss = document.getElementById('editStopLoss');
        const editTakeProfit = document.getElementById('editTakeProfit');
        
        if (editEntryPrice) editEntryPrice.step = stepValue;
        if (editStopLoss) editStopLoss.step = stepValue;
        if (editTakeProfit) editTakeProfit.step = stepValue;
        
        console.log(`TradeEdit: Price step updated to ${stepValue}`);
    }
    
    /**
     * 決済情報編集モーダルを開く
     * @param {string|number} tradeId - トレードID
     */
    editExitInfo(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        const modal = document.getElementById('tradeEditModal');
        if (!modal) return;
        
        // 売買方向の表示文字列
        const directionText = (trade.direction === 'buy' || trade.direction === 'long') ? '買い (LONG)' : '売り (SHORT)';
        
        // 決済エントリーのHTML生成
        let exitsHTML = '';
        if (trade.exits && trade.exits.length > 0) {
            trade.exits.forEach((exit, index) => {
                const exitTime = exit.time ? this.#formatDateTimeForInput(exit.time) : '';
                exitsHTML += `
                    <div class="exit-entry-form" style="display: grid; grid-template-columns: 2fr 1.5fr 1fr auto; gap: 10px; margin-bottom: 10px; align-items: center; max-width: 100%;">
                        <input type="datetime-local" class="exit-datetime" value="${exitTime}" style="padding: 8px; font-size: 14px; min-width: 0;" />
                        <input type="number" class="exit-price" value="${exit.price || ''}" step="0.00001" placeholder="決済価格" style="padding: 8px; font-size: 14px; min-width: 0;" />
                        <input type="number" class="exit-lot" value="${exit.lot || ''}" step="0.1" placeholder="ロット" style="padding: 8px; font-size: 14px; min-width: 0;" />
                        <button type="button" class="btn btn-danger" onclick="removeExitInEdit(this)" style="background-color: #ff4444; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">削除</button>
                    </div>
                `;
            });
        }
        
        // フォームHTMLを動的に生成
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>決済情報編集</h2>
                    <button class="modal-close" onclick="closeTradeEditModal()">×</button>
                </div>
                <div class="modal-body">
                    <!-- エントリー情報（参照用・読み取り専用） -->
                    <div class="form-group" style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 5px; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 10px 0; color: #00ff88; font-size: 14px;">📌 参考情報（エントリー）</h4>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                            <div>
                                <label style="font-size: 12px; color: #7a8599; display: block; margin-bottom: 3px;">通貨ペア</label>
                                <div style="padding: 8px; background: rgba(0, 0, 0, 0.2); border-radius: 4px; color: #fff;">${trade.pair || '-'}</div>
                            </div>
                            <div>
                                <label style="font-size: 12px; color: #7a8599; display: block; margin-bottom: 3px;">売買方向</label>
                                <div style="padding: 8px; background: rgba(0, 0, 0, 0.2); border-radius: 4px; color: ${(trade.direction === 'buy' || trade.direction === 'long') ? '#00ff88' : '#ff4444'};">${directionText}</div>
                            </div>
                            <div>
                                <label style="font-size: 12px; color: #7a8599; display: block; margin-bottom: 3px;">エントリー価格</label>
                                <div style="padding: 8px; background: rgba(0, 0, 0, 0.2); border-radius: 4px; color: #ffd700; font-weight: bold;">${trade.entryPrice || '-'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 決済情報編集フォーム -->
                    <form id="editExitForm">
                        <div class="form-group">
                            <label>決済エントリー</label>
                            <div id="exitEntriesEdit">
                                ${exitsHTML}
                            </div>
                            <button type="button" onclick="addExitEntryInEdit()">決済追加</button>
                        </div>
                    </form>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="saveExitInfo('${tradeId}')">保存</button>
                        <button class="btn btn-secondary" onclick="closeTradeEditModal()">キャンセル</button>
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
        modal.dataset.tradeId = tradeId;
        
        // ✅ モーダル外クリックを無効化
        // modal.onclick = (event) => {
        //     if (event.target === modal) {
        //         this.closeTradeEditModal();
        //     }
        // };
    }
    
    /**
     * 振り返り編集モーダルを開く
     * @param {string|number} tradeId - トレードID
     */
    editReflection(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        const modal = document.getElementById('tradeEditModal');
        if (!modal) return;
        
        // フォームHTMLを動的に生成
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>振り返り編集</h2>
                    <button class="modal-close" onclick="closeTradeEditModal()">×</button>
                </div>
                <div class="modal-body">
                    <form id="editReflectionForm">
                        <div class="form-group">
                            <label>振り返り・反省点</label>
                            <textarea id="editReflectionText" style="width: 100%; min-height: 200px;">${trade.reflection || ''}</textarea>
                        </div>
                    </form>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="saveReflection('${tradeId}')">保存</button>
                        <button class="btn btn-secondary" onclick="closeTradeEditModal()">キャンセル</button>
                    </div>
                </div>
            </div>
        `;
        
        // モーダルを表示
        modal.style.display = 'flex';
        modal.dataset.tradeId = tradeId;
        
        // ✅ モーダル外クリックを無効化
        // modal.onclick = (event) => {
        //     if (event.target === modal) {
        //         this.closeTradeEditModal();
        //     }
        // };
    }
    
    /**
     * 円建て損益追加モーダルを開く
     * @param {string|number} tradeId - トレードID
     */
    addYenProfitLoss(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        const modal = document.getElementById('tradeEditModal');
        if (!modal) return;
        
        // フォームHTMLを動的に生成
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>円建て損益追加</h2>
                    <button class="modal-close" onclick="closeTradeEditModal()">×</button>
                </div>
                <div class="modal-body">
                    <form id="yenProfitLossForm">
                        <div class="form-group">
                            <label>取引損益（円）</label>
                            <input type="number" id="yenTradePL" placeholder="例: 10000" step="1" />
                        </div>
                        <div class="form-group">
                            <label>スワップポイント（円）</label>
                            <input type="number" id="yenSwapPoints" placeholder="例: 500" step="1" value="0" />
                        </div>
                        <div class="form-group">
                            <label>手数料（円）</label>
                            <input type="number" id="yenCommission" placeholder="例: -300" step="1" value="0" />
                        </div>
                        <div class="form-group">
                            <label>純損益（円）</label>
                            <input type="number" id="yenNetProfitLoss" placeholder="自動計算されます" readonly />
                        </div>
                    </form>
                    <div class="modal-footer">
                        <button class="btn btn-primary" onclick="saveYenProfitLoss('${tradeId}')">保存</button>
                        <button class="btn btn-secondary" onclick="closeTradeEditModal()">キャンセル</button>
                    </div>
                </div>
            </div>
        `;
        
        // 自動計算の設定
        const tradePLInput = modal.querySelector('#yenTradePL');
        const swapInput = modal.querySelector('#yenSwapPoints');
        const commissionInput = modal.querySelector('#yenCommission');
        const netPLInput = modal.querySelector('#yenNetProfitLoss');
        
        const calculateNet = () => {
            const tradePL = parseFloat(tradePLInput.value) || 0;
            const swap = parseFloat(swapInput.value) || 0;
            const commission = parseFloat(commissionInput.value) || 0;
            netPLInput.value = tradePL + swap + commission;
        };
        
        tradePLInput.addEventListener('input', calculateNet);
        swapInput.addEventListener('input', calculateNet);
        commissionInput.addEventListener('input', calculateNet);
        
        // モーダルを表示
        modal.style.display = 'flex';
        modal.dataset.tradeId = tradeId;
        
        // ✅ モーダル外クリックを無効化
        // modal.onclick = (event) => {
        //     if (event.target === modal) {
        //         this.closeTradeEditModal();
        //     }
        // };
    }
    
    /**
     * 決済エントリーを削除（編集モード）
     * @param {HTMLElement} button - 削除ボタン
     */
    removeExitInEdit(button) {
        if (button && button.parentElement) {
            button.parentElement.remove();
        }
    }
    
    /**
     * 決済エントリーを追加（編集モード）
     */
    addExitEntryInEdit() {
        const container = document.getElementById('exitEntriesEdit');
        if (!container) return;
        
        const div = document.createElement('div');
        div.className = 'exit-entry-form';
        div.style.cssText = 'display: grid; grid-template-columns: 2fr 1.5fr 1fr auto; gap: 10px; margin-bottom: 10px; align-items: center; max-width: 100%;';
        div.innerHTML = `
            <input type="datetime-local" class="exit-datetime" placeholder="決済日時" style="padding: 8px; font-size: 14px; min-width: 0;">
            <input type="number" class="exit-price" placeholder="決済価格" step="0.00001" style="padding: 8px; font-size: 14px; min-width: 0;">
            <input type="number" class="exit-lot" placeholder="ロット" step="0.1" style="padding: 8px; font-size: 14px; min-width: 0;">
            <button type="button" class="btn btn-sm btn-danger" onclick="removeExitInEdit(this)" style="background-color: #ff4444; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">削除</button>
        `;
        container.appendChild(div);
    }
    
    /**
     * 振り返りを保存
     * @param {string|number} tradeId - トレードID
     */
    saveReflection(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        const reflectionText = this.#getFieldValue('editReflectionText');
        
        const updatedTrade = this.#tradeManager.updateTrade(tradeId, {
            reflection: reflectionText || ''
        });
        
        if (updatedTrade) {
            this.#refreshUI();
            this.closeTradeEditModal();
            this.#showToast('振り返りを更新しました', 'success');
            
            // 詳細モーダル更新
            if (this.#isModalOpen('tradeDetailModal')) {
                if (typeof window.showTradeDetail === 'function') {
                    window.showTradeDetail(updatedTrade);
                }
            }
        }
    }
    
    /**
     * 円建て損益を保存
     * @param {string|number} tradeId - トレードID
     */
    saveYenProfitLoss(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        const profitLoss = parseFloat(this.#getFieldValue('yenTradePL')) || 0;
        const swap = parseFloat(this.#getFieldValue('yenSwapPoints')) || 0;
        const commission = parseFloat(this.#getFieldValue('yenCommission')) || 0;
        const netProfit = profitLoss + swap + commission;
        
        const yenProfitLoss = {
            profitLoss,
            swap,
            commission,
            netProfit
        };
        
        const updatedTrade = this.#tradeManager.updateTrade(tradeId, {
            yenProfitLoss
        });
        
        if (updatedTrade) {
            this.#refreshUI();
            this.closeTradeEditModal();
            this.#showToast('円建て損益を追加しました', 'success');
            
            // 詳細モーダル更新
            if (this.#isModalOpen('tradeDetailModal')) {
                if (typeof window.showTradeDetail === 'function') {
                    window.showTradeDetail(updatedTrade);
                }
            }
        }
    }
    
    // ==================== プライベートメソッド ====================
    
    /**
     * 編集フォームにデータを設定
     * @private
     */
    #populateEditForm(trade) {
        // 基本情報
        this.#setFieldValue('editPair', trade.pair);
        this.#setFieldValue('editDirection', trade.direction);
        
        // 日時フォーマット修正
        const entryTime = trade.entryTime || trade.date;
        if (entryTime) {
            // ISO形式をdatetime-local形式に変換
            const formattedTime = this.#formatDateTimeForInput(entryTime);
            this.#setFieldValue('editEntryTime', formattedTime);
        }
        
        this.#setFieldValue('editEntryPrice', trade.entryPrice);
        this.#setFieldValue('editLotSize', trade.lotSize);
        this.#setFieldValue('editStopLoss', trade.stopLoss);
        this.#setFieldValue('editTakeProfit', trade.takeProfit);
        
        // 決済情報
        const exitContainer = document.getElementById('exitEntriesEdit');
        if (exitContainer && trade.exits) {
            exitContainer.innerHTML = '';
            trade.exits.forEach((exit, index) => {
                this.#addExitEntryToForm(exit, index);
            });
        }
    }
    
    /**
     * 更新データを収集
     * @private
     */
    #collectUpdateData() {
        const exitEntries = document.querySelectorAll('.exit-entry-edit');
        const exits = [];
        
        exitEntries.forEach(entry => {
            const time = entry.querySelector('.exit-time')?.value;
            const price = entry.querySelector('.exit-price')?.value;
            const lot = parseFloat(entry.querySelector('.exit-lot')?.value);
            
            if (time && price && lot) {
                exits.push({ time, price, lot });
            }
        });
        
        const entryTimeValue = this.#getFieldValue('editEntryTime');
        
        return {
            pair: this.#getFieldValue('editPair'),
            direction: this.#getFieldValue('editDirection'),
            entryTime: entryTimeValue,
            entryPrice: parseFloat(this.#getFieldValue('editEntryPrice')),
            lotSize: parseFloat(this.#getFieldValue('editLotSize')),
            stopLoss: parseFloat(this.#getFieldValue('editStopLoss')),
            takeProfit: parseFloat(this.#getFieldValue('editTakeProfit')),
            exits
        };
    }
    
    /**
     * 決済データを収集
     * @private
     */
    #collectExitData() {
        const exitElements = document.querySelectorAll('.exit-entry-form');
        const exits = [];
        
        // モーダルからトレードIDを取得
        const modal = document.getElementById('tradeEditModal');
        const tradeId = modal?.dataset?.tradeId;
        
        if (!tradeId) {
            this.#showToast('トレードIDが見つかりません', 'error');
            throw new Error('Trade ID not found');
        }
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) {
            this.#showToast('トレードが見つかりません', 'error');
            throw new Error('Trade not found');
        }
        
        exitElements.forEach((element, index) => {
            const datetime = element.querySelector('.exit-datetime')?.value;
            const price = element.querySelector('.exit-price')?.value;
            const lot = element.querySelector('.exit-lot')?.value;
            
            // 空白チェック：どれか1つでも入力があれば全て必須
            const hasAnyInput = datetime || price || lot;
            
            if (hasAnyInput) {
                // 1つでも入力があるのに他が空白ならエラー
                if (!datetime) {
                    this.#showToast(`決済${index + 1}の日時が入力されていません`, 'error');
                    throw new Error(`Exit ${index + 1}: datetime is required`);
                }
                if (!price) {
                    this.#showToast(`決済${index + 1}の価格が入力されていません`, 'error');
                    throw new Error(`Exit ${index + 1}: price is required`);
                }
                if (!lot) {
                    this.#showToast(`決済${index + 1}のロットが入力されていません`, 'error');
                    throw new Error(`Exit ${index + 1}: lot is required`);
                }
                
                // pips計算
                const exitPrice = parseFloat(price);
                const entryPrice = parseFloat(trade.entryPrice);
                const isJPY = trade.pair.includes('JPY');
                const multiplier = isJPY ? 100 : 10000;
                
                let pips;
                if (trade.direction === 'buy' || trade.direction === 'long') {
                    // ロング: 決済価格 - エントリー価格
                    pips = (exitPrice - entryPrice) * multiplier;
                } else {
                    // ショート: エントリー価格 - 決済価格
                    pips = (entryPrice - exitPrice) * multiplier;
                }
                
                exits.push({
                    time: datetime,
                    price: exitPrice,
                    lot: parseFloat(lot),
                    pips: pips  // pipsを追加
                });
            }
            // 完全に空白の行は無視（削除された行と同じ扱い）
        });
        
        return { exits };
    }
    
    /**
     * 更新データのバリデーション
     * @private
     */
    #validateUpdateData(updates, originalTrade) {
        // ロット数チェック
        const totalExitLot = updates.exits.reduce((sum, exit) => sum + exit.lot, 0);
        if (totalExitLot > updates.lotSize) {
            this.#showToast(`決済ロットがエントリーロット（${updates.lotSize}L）を超えています`, 'error');
            return false;
        }
        
        // 価格矛盾チェック（必要に応じて）
        if (window.validatePriceLogic) {
            const errors = window.validatePriceLogic(
                updates.direction,
                updates.entryPrice,
                updates.stopLoss,
                updates.takeProfit
            );
            if (errors.length > 0) {
                this.#showToast(errors.join('\n'), 'error');
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * 決済データのバリデーション
     * @private
     */
    #validateExitData(exitData, trade) {
        // 1. 必須項目チェック
        for (let i = 0; i < exitData.exits.length; i++) {
            const exit = exitData.exits[i];
            
            // 決済価格が空白
            if (!exit.price || exit.price === 0) {
                this.#showToast(
                    `決済${i + 1}の価格が入力されていません`, 
                    'error'
                );
                return false;
            }
            
            // 決済ロットが空白
            if (!exit.lot || exit.lot === 0) {
                this.#showToast(
                    `決済${i + 1}のロットが入力されていません`, 
                    'error'
                );
                return false;
            }
        }
        
        // 2. 決済ロット合計チェック
        const entryLot = parseFloat(trade.lotSize) || parseFloat(trade.lot) || 0;
        const totalExitLot = exitData.exits.reduce((sum, exit) => {
            return sum + (parseFloat(exit.lot) || 0);
        }, 0);
        
        // エントリーロットを超える場合はエラー
        if (totalExitLot > entryLot) {
            const exceededLot = (totalExitLot - entryLot).toFixed(2);
            this.#showToast(
                `決済ロット合計(${totalExitLot})がエントリーロット(${entryLot})を${exceededLot}ロット超えています`, 
                'error'
            );
            return false;
        }
        
        // 3. 警告：エントリーロット未満の場合
        if (totalExitLot < entryLot) {
            const remainingLot = (entryLot - totalExitLot).toFixed(2);
            console.warn(`未決済ロットが${remainingLot}ロット残っています`);
        }
        
        return true;
    }
    
    /**
     * UIのリフレッシュ
     * @private
     */
    #refreshUI() {
        // トレード一覧を更新
        if (typeof window.displayAllTrades === 'function') {
            window.displayAllTrades();
        }
        
        // 統計を更新
        if (typeof window.updateQuickStats === 'function') {
            window.updateQuickStats();
        }
        
        // 統計タブ更新
        if (typeof window.StatisticsModule?.updateStatistics === 'function') {
            window.StatisticsModule.updateStatistics();
        }
    }
    
    /**
     * フィールド値の取得
     * @private
     */
    #getFieldValue(fieldId) {
        const element = document.getElementById(fieldId);
        return element ? element.value : null;
    }
    
    /**
     * フィールド値の設定
     * @private
     */
    #setFieldValue(fieldId, value) {
        const element = document.getElementById(fieldId);
        if (element) {
            element.value = value || '';
        }
    }
    
    /**
     * モーダルの状態確認
     * @private
     */
    #isModalOpen(modalId) {
        const modal = document.getElementById(modalId);
        return modal && modal.style.display === 'flex';
    }
    
    /**
     * モーダルを閉じる
     * @private
     */
    #closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    /**
     * トースト通知
     * @private
     */
    #showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
    
    /**
     * 日時フォーマット変換（datetime-local用）
     * @private
     */
    #formatDateTimeForInput(datetime) {
        if (!datetime) return '';
        
        const date = new Date(datetime);
        if (isNaN(date.getTime())) return '';
        
        // yyyy-MM-ddTHH:mm形式に変換
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    
    /**
     * 決済エントリーをフォームに追加
     * @private
     */
    #addExitEntryToForm(exit, index) {
        const container = document.getElementById('exitEntriesEdit');
        if (!container) return;
        
        // 日時フォーマット
        const formattedTime = this.#formatDateTimeForInput(exit.time);
        
        const div = document.createElement('div');
        div.className = 'exit-entry-edit';
        div.innerHTML = `
            <input type="datetime-local" class="exit-time" value="${formattedTime}" />
            <input type="number" class="exit-price" value="${exit.price}" step="0.00001" />
            <input type="number" class="exit-lot" value="${exit.lot}" step="0.1" />
            <button onclick="this.parentElement.remove()">削除</button>
        `;
        container.appendChild(div);
    }
}

// グローバルに登録
window.TradeEdit = TradeEdit;

// グローバル関数として登録（編集モードで使用）
window.removeExitInEdit = function(button) {
    const tradeEdit = new TradeEdit();
    tradeEdit.removeExitInEdit(button);
};

window.addExitEntryInEdit = function() {
    const tradeEdit = new TradeEdit();
    tradeEdit.addExitEntryInEdit();
};

window.editReflection = function(tradeId) {
    const tradeEdit = new TradeEdit();
    tradeEdit.editReflection(tradeId);
};

window.addYenProfitLoss = function(tradeId) {
    const tradeEdit = new TradeEdit();
    tradeEdit.addYenProfitLoss(tradeId);
};

window.saveReflection = function(tradeId) {
    const tradeEdit = new TradeEdit();
    tradeEdit.saveReflection(tradeId);
};

window.saveYenProfitLoss = function(tradeId) {
    const tradeEdit = new TradeEdit();
    tradeEdit.saveYenProfitLoss(tradeId);
};

// グローバル参照用（オートコンプリートのonclick用）
window.tradeEdit = new TradeEdit();

// selectEditPairをグローバルに公開（onclick用）
window.tradeEdit.selectEditPair = window.tradeEdit.selectEditPair.bind(window.tradeEdit);

console.log('TradeEdit.js loaded successfully');