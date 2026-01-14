// js/part2/TradeDetail.js
// Part 2 モジュール化 - トレード詳細表示機能
// 作成日: 2025/09/17

/**
 * TradeDetail クラス
 * トレード詳細表示機能を管理
 */
class TradeDetail {
    /**
     * 円建て損益のフォーマット
     * @private
     */
    #formatYenProfitLoss(yenProfitLoss) {
        if (!yenProfitLoss || !yenProfitLoss.length) {
            return '<p style="color: #888;">円建て損益が未設定です</p>';
        }
        
        const totalYen = yenProfitLoss.reduce((sum, pl) => sum + pl.amount, 0);
        
        return `
            ${yenProfitLoss.map((pl, index) => `
                <div class="yen-pl-item">
                    <span>${pl.date ? this.#formatDateForDisplay(pl.date) : '日付なし'}: 
                    <strong class="${pl.amount >= 0 ? 'profit' : 'loss'}">
                        ${pl.amount >= 0 ? '+' : ''}${pl.amount.toLocaleString()}円
                    </strong></span>
                </div>
            `).join('')}
            <p><strong>合計: <span class="${totalYen >= 0 ? 'profit' : 'loss'}">
                ${totalYen >= 0 ? '+' : ''}${totalYen.toLocaleString()}円
            </span></strong></p>
        `;
    }

    /**
     * 円建て損益セクションの描画メソッド
     * @param {Object} trade - トレードオブジェクト
     * @param {HTMLElement} container - コンテナ要素
     */
    renderYenProfitLossSection(trade, container) {
        // 決済済みトレードのみ表示（修正版）
        if (!trade) {
            return;
        }
        
        // トレードの状態を判定
        const hasExits = trade.exits && trade.exits.length > 0;
        const isClosed = trade.holdingStatus === 'closed';
        const isSettled = hasExits || isClosed;
        
        // 決済済みでない場合はリターン
        if (!isSettled) {
            return;
        }
        
        // 既存の円建て損益セクションを削除（重複防止）
        const existingSections = container.querySelectorAll('.yen-profit-loss-section');
        existingSections.forEach(section => section.remove());
        
        // 新しいセクションを作成
        const yenSection = document.createElement('div');
        yenSection.className = 'trade-detail-section yen-profit-loss-section';
        yenSection.style.cssText = 'background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;';
        
        // 円建て損益の内容を条件分岐で生成
        let yenContent = '';
        
        if (trade.yenProfitLoss && trade.yenProfitLoss.length > 0) {
            // 配列形式の詳細データがある場合
            yenContent = this.formatYenProfitLoss(trade.yenProfitLoss);
        } else if (trade.yenProfitLoss && (trade.yenProfitLoss.profitLoss !== undefined || trade.yenProfitLoss.netProfit !== undefined)) {
            // 簡易データがある場合（一括入力など）
            yenContent = `
                ${trade.broker ? `<p>ブローカー: <span style="display: inline-block; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 8px; border-radius: 4px; font-size: 0.9rem;">${trade.broker}</span></p>` : ''}
                <p>損益: ¥${(trade.yenProfitLoss.profitLoss || 0).toLocaleString()}</p>
                <p>スワップ: ¥${(trade.yenProfitLoss.swap || 0).toLocaleString()}</p>
                <p>手数料: ¥${(trade.yenProfitLoss.commission || 0).toLocaleString()}</p>
                <p class="net-profit"><strong>実損益: 
                    <span class="${(trade.yenProfitLoss.netProfit || 0) >= 0 ? 'profit' : 'loss'}" style="color: ${(trade.yenProfitLoss.netProfit || 0) >= 0 ? '#4ade80' : '#f87171'};">
                        ${(trade.yenProfitLoss.netProfit || 0) >= 0 ? '+' : ''}¥${(trade.yenProfitLoss.netProfit || 0).toLocaleString()}
                    </span>
                </strong></p>
            `;
        } else {
            // データがない場合
            yenContent = '<p style="color: #888;">円建て損益が未設定です</p>';
        }
        
        yenSection.innerHTML = `
            <h4 class="detail-section-header">
                💴 円建て損益
                <button class="btn btn-small btn-secondary detail-edit-btn" onclick="window.${trade.yenProfitLoss ? 'editYenProfitLoss' : 'addYenProfitLoss'}('${trade.id}')">
                    ${trade.yenProfitLoss ? '編集' : '追加'}
                </button>
            </h4>
            <div class="section-content">
                ${yenContent}
            </div>
        `;
        
        // 決済情報セクションの後に挿入
        const sections = container.querySelectorAll('.trade-detail-section');
        let insertAfterElement = null;
        
        // 決済情報セクションを探す
        sections.forEach(section => {
            const header = section.querySelector('h4');
            if (header && header.textContent.includes('決済情報')) {
                insertAfterElement = section;
            }
        });
        
        if (insertAfterElement) {
            // 決済情報の次に挿入
            insertAfterElement.parentNode.insertBefore(yenSection, insertAfterElement.nextSibling);
        } else {
            // 見つからない場合は最後に追加（フォールバック）
            container.appendChild(yenSection);
        }
    }

    /**
     * 円建て損益のフォーマットメソッド
     * @param {Object|Array} yenProfitLoss - 円建て損益データ
     * @returns {string} フォーマット済みHTML
     */
    formatYenProfitLoss(yenProfitLoss) {
        // 配列の場合（現在の実装）
        if (Array.isArray(yenProfitLoss)) {
            if (!yenProfitLoss.length) {
                return '<p style="color: #888;">円建て損益が未設定です</p>';
            }
            
            const totalYen = yenProfitLoss.reduce((sum, pl) => sum + pl.amount, 0);
            
            return `
                ${yenProfitLoss.map((pl, index) => `
                    <div class="yen-pl-item">
                        <span>${pl.date ? this.#formatDateForDisplay(pl.date) : '日付なし'}: 
                        <strong class="${pl.amount >= 0 ? 'profit' : 'loss'}">
                            ${pl.amount >= 0 ? '+' : ''}${pl.amount.toLocaleString()}円
                        </strong></span>
                    </div>
                `).join('')}
                <p><strong>合計: <span class="${totalYen >= 0 ? 'profit' : 'loss'}">
                    ${totalYen >= 0 ? '+' : ''}${totalYen.toLocaleString()}円
                </span></strong></p>
            `;
        }
        
        // オブジェクトの場合（将来の実装用）
        if (!yenProfitLoss) {
            return '<p style="color: #888;">円建て損益が未設定です</p>';
        }
        
        return `
            <p>ブローカー: ${yenProfitLoss.broker || '未設定'}</p>
            <p>損益: ¥${(yenProfitLoss.profitLoss || 0).toLocaleString()}</p>
            <p>スワップ: ¥${(yenProfitLoss.swap || 0).toLocaleString()}</p>
            <p>手数料: ¥${(yenProfitLoss.commission || 0).toLocaleString()}</p>
            <p>決済時レート: ${yenProfitLoss.exchangeRate || '-'}</p>
            <p class="net-profit">実損益: ¥${(yenProfitLoss.netProfit || 0).toLocaleString()}</p>
        `;
    }

    /**
     * 基本情報の編集
     * @param {string} tradeId - トレードID
     */
    editBasicInfo(tradeId) {
        console.log('editBasicInfo called:', tradeId);
        
        if (typeof window.editTradeBasicInfo === 'function') {
            window.editTradeBasicInfo(tradeId);
        } else {
            this.#showToast('基本情報編集機能は準備中です', 'info');
        }
    }

    /**
     * エントリー根拠（チェックリスト）の編集
     * @param {string} tradeId - トレードID
     */
    editTradeReasons(tradeId) {
        console.log('editTradeReasons called:', tradeId);
        
        if (typeof window.editTradeReasons === 'function') {
            window.editTradeReasons(tradeId);
        } else {
            this.#showToast('チェックリスト編集機能は準備中です', 'info');
        }
    }

    /**
     * 決済情報の編集
     * @param {string} tradeId - トレードID
     */
    editExitInfo(tradeId) {
        console.log('editExitInfo called:', tradeId);
        
        if (typeof window.editExitInfo === 'function') {
            window.editExitInfo(tradeId);
        } else {
            this.#showToast('決済編集機能は準備中です', 'info');
        }
    }

    /**
     * 画像の変更
     * @param {string} tradeId - トレードID
     * @param {string} type - 画像タイプ（'icon' | 'chart'）
     * @param {number} index - 画像のインデックス
     */
    changeTradeImage(tradeId, type, index) {
        console.log('changeTradeImage called:', tradeId, type, index);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // 既存の画像アップロードシステムを使用
        window.selectedTradeForEdit = tradeId;
        
        if (type === 'icon') {
            window.pendingImageType = 'tradeIcon';
        } else if (type === 'chart') {
            window.pendingImageType = `tradeChart${index}`;
        }
        
        // 画像アップロードモーダルを表示
        if (typeof window.showImageUploadOptions === 'function') {
            window.showImageUploadOptions(window.pendingImageType);
        } else {
            this.#showToast('画像アップロード機能が見つかりません', 'error');
        }
    }

    /**
     * 画像の削除
     * @param {string} tradeId - トレードID
     * @param {string} type - 画像タイプ（'icon' | 'chart'）
     * @param {number} index - 画像のインデックス
     */
    deleteTradeImage(tradeId, type, index) {
        console.log('deleteTradeImage called:', tradeId, type, index);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        if (confirm('この画像を削除しますか？')) {
            let updateData = {};
            
            if (type === 'icon') {
                updateData.chartImage = null;
            } else if (type === 'chart') {
                const chartImages = [...(trade.chartImages || [])];
                chartImages[index - 1] = null;
                updateData.chartImages = chartImages;
            }
            
            const updatedTrade = this.#tradeManager.updateTrade(tradeId, updateData);
            if (updatedTrade) {
                this.showTradeDetail(updatedTrade);
                this.#showToast('画像を削除しました', 'success');
            }
        }
    }

    /**
     * 円建て損益の編集
     * @param {string} tradeId - トレードID
     */
    editYenProfitLoss(tradeId) {
        console.log('editYenProfitLoss called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // 編集機能の実装（モーダル表示など）
        if (typeof window.openYenProfitLossModal === 'function') {
            window.openYenProfitLossModal(tradeId);
        } else {
            this.#showToast('円建て損益編集機能は準備中です', 'info');
        }
    }

    /**
     * 円建て損益の追加
     * @param {string} tradeId - トレードID
     */
    addYenProfitLoss(tradeId) {
        console.log('addYenProfitLoss called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // 追加機能の実装（モーダル表示など）
        if (typeof window.openYenProfitLossModal === 'function') {
            window.openYenProfitLossModal(tradeId);
        } else {
            this.#showToast('円建て損益追加機能は準備中です', 'info');
        }
    }
    #tradeManager;
    #calculator;
    
    constructor() {
        this.#tradeManager = window.tradeManager || TradeManager.getInstance();
        this.#calculator = window.tradeCalculator || new TradeCalculator();
        console.log('TradeDetail initialized');
    }
    
    /**
     * トレード詳細を表示
     * @param {Object|string} tradeOrId - トレードオブジェクトまたはID
     */
    showTradeDetail(tradeOrId) {
        console.log('showTradeDetail called:', tradeOrId);
        
        // トレードオブジェクトまたはIDから取得
        let trade;
        if (typeof tradeOrId === 'object') {
            trade = tradeOrId;
        } else {
            trade = this.#tradeManager.getTradeById(tradeOrId);
        }
        
        if (!trade) {
            console.error('Trade not found:', tradeOrId);
            return;
        }
        
        const modal = document.getElementById('tradeDetailModal');
        const content = document.getElementById('tradeDetailContent');
        
        if (!modal || !content) {
            console.error('Modal elements not found');
            return;
        }
        
        const pips = this.#calculator.calculateTradePips(trade);
        const remainingLot = this.#calculator.calculateRemainingLot(trade);
        
        // トレードの状態を判定（修正版）
        const hasExits = trade.exits && trade.exits.length > 0;
        const isClosed = trade.holdingStatus === 'closed';
        
        // 保有中と判定する条件を明確化
        const isOpen = !hasExits && !isClosed;
        // 決済済みと判定（holdingStatus: 'closed'、exits存在のいずれか）
        const isSettled = hasExits || isClosed;
        
        // デバッグ用：トレード状態の確認
        console.log('Trade status check:', {
            id: trade.id,
            hasExits,
            isClosed,
            isOpen,
            isSettled,
            holdingStatus: trade.holdingStatus,
            exitsLength: trade.exits?.length || 0
        });
        
        let detailHTML = `
            <h3>${trade.pair} ${trade.direction === 'buy' || trade.direction === 'long' ? 'LONG' : 'SHORT'}</h3>
            
            <div class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;">
                <h4 class="detail-section-header">
                    📍 エントリー情報
                    <button class="btn btn-small btn-secondary detail-edit-btn" onclick="editBasicInfo('${trade.id}')">編集</button>
                </h4>
                <p>日時: ${this.#formatDateTimeForDisplay(trade.entryTime || trade.date)}</p>
                <p>価格: ${trade.entryPrice}</p>
                <p>ロット: ${trade.lotSize} Lot</p>
                <p>SL: ${trade.stopLoss || '-'} / TP: ${trade.takeProfit || '-'}</p>
                <p>シナリオ: ${trade.scenario || '-'}</p>
                <p>感情: ${trade.entryEmotion || '-'}</p>
            </div>
            
            <div class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;">
                <h4 class="detail-section-header">
                    🎯 チェックリスト
                    <button class="btn btn-small btn-secondary detail-edit-btn" onclick="editTradeReasons('${trade.id}')">編集</button>
                </h4>
                <p class="checklist-label">エントリー価格の根拠：</p>
                <p class="checklist-value">${trade.reasons?.[0] || '記入なし'}</p>
                <p class="checklist-label">損切り価格の根拠：</p>
                <p class="checklist-value">${trade.reasons?.[1] || '記入なし'}</p>
                <p class="checklist-label">利確目標価格の根拠：</p>
                <p class="checklist-value">${trade.reasons?.[2] || '記入なし'}</p>
            </div>
        `;
        
        // 決済情報がある場合、または決済済みトレードの場合
        if (isSettled) {
            // 通常の決済情報がある場合
            if (trade.exits && trade.exits.length > 0) {
                detailHTML += `
                    <div class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;">
                        <h4 class="detail-section-header">
                            📊 決済情報
                            <button class="btn btn-small btn-secondary detail-edit-btn" onclick="editExitInfo('${trade.id}')">編集</button>
                        </h4>
                        ${trade.exits.map((exit, i) => `
                            <div class="settlement-line">決済${i + 1}: ${this.#formatDateTimeForDisplay(exit.time)}</div>
                            <div class="settlement-line">@ ${exit.price} (${exit.lot} Lot) → ${exit.pips ? exit.pips.toFixed(1) : '-'} pips</div>
                        `).join('')}
                        <p><strong>合計: ${pips >= 0 ? '+' : ''}${pips.toFixed(1)} pips</strong></p>
                        ${remainingLot > 0 ? `<p>未決済: ${remainingLot.toFixed(2)} Lot</p>` : ''}
                    </div>
                `;
            }
        }
        
        // 振り返りセクション（改行対応）
        // 決済済みトレードの場合に表示
        if (isSettled || trade.reflection) {
            const reflectionHtml = trade.reflection 
                ? trade.reflection.replace(/\n/g, '<br>') 
                : '';
            
            detailHTML += `
                <div class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;">
                    <h4 class="detail-section-header">
                        📝 振り返り
                        <button class="btn btn-small btn-secondary detail-edit-btn" onclick="editReflection('${trade.id}')">編集</button>
                    </h4>
                    <div id="reflectionDisplay">${reflectionHtml || '記入なし'}</div>
                </div>
            `;
        }
        
        // 画像セクション
        detailHTML += `
            <div class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;">
                <h4 class="detail-section-header">📸 画像</h4>
                
                ${(() => {
                    const chartImages = trade.chartImages || [];
                    
                    // 常に3枠を表示
                    let imagesHtml = '';
                    for (let i = 0; i < 3; i++) {
                        const imgData = chartImages[i];
                        // Base64文字列とURLオブジェクト両方に対応
                        const imgSrc = window.getImageSrc ? window.getImageSrc(imgData) : (typeof imgData === 'string' ? imgData : (imgData && imgData.url ? imgData.url : null));
                        if (imgSrc) {
                            // 画像がある場合
                            // data-img-index を追加して後から更新できるようにする
                            imagesHtml += `
                                <div class="detail-image-item has-image" onclick="changeTradeImage('${trade.id}', ${i + 1})">
                                    <img src="${imgSrc}" alt="チャート画像${i + 1}" data-img-index="${i}" onerror="this.style.opacity='0.3'">
                                    <button class="detail-image-delete" onclick="event.stopPropagation(); deleteTradeImage('${trade.id}', ${i + 1})">×</button>
                                </div>
                            `;
                        } else {
                            // 画像がない場合（空枠）
                            imagesHtml += `
                                <div class="detail-image-item empty" onclick="changeTradeImage('${trade.id}', ${i + 1})">
                                    <span class="detail-image-placeholder">画像${i + 1}</span>
                                </div>
                            `;
                        }
                    }
                    
                    return `<div class="detail-images-container">${imagesHtml}</div>`;
                })()}
            </div>
        `;
        
        // 署名付きURL期限切れの画像を非同期で更新
        setTimeout(async () => {
            const chartImages = trade.chartImages || [];
            const imgElements = modal.querySelectorAll('.detail-image-item img[data-img-index]');
            
            for (const imgEl of imgElements) {
                const index = parseInt(imgEl.dataset.imgIndex, 10);
                const imgData = chartImages[index];
                
                if (imgData && window.isUrlExpired && window.isUrlExpired(imgData)) {
                    try {
                        const validSrc = await window.getValidImageSrc(imgData);
                        if (validSrc) {
                            imgEl.src = validSrc;
                            imgEl.style.opacity = '1';
                        }
                    } catch (e) {
                        console.warn('[TradeDetail] 画像URL更新失敗:', e);
                    }
                }
            }
        }, 100);
        
        // モーダルヘッダーに決済ボタンを動的に追加
        const modalHeader = modal.querySelector('.modal-header');
        if (modalHeader) {
            // 既存のh2と×ボタンを取得
            const h2 = modalHeader.querySelector('h2');
            const closeBtn = modalHeader.querySelector('.modal-close');
            
            // ヘッダーを再構築
            modalHeader.style.display = 'flex';
            modalHeader.style.alignItems = 'center';
            modalHeader.style.justifyContent = 'space-between';
            
            // 右側のボタングループを作成
            const buttonGroup = document.createElement('div');
            buttonGroup.style.display = 'flex';
            buttonGroup.style.alignItems = 'center';
            buttonGroup.style.gap = '10px';
            
            // 保有中の場合は決済ボタンを追加
            if (isOpen) {
                const exitBtn = document.createElement('button');
                exitBtn.className = 'btn btn-primary';
                exitBtn.textContent = '決済';
                exitBtn.onclick = () => window.openExitModal(trade.id);
                buttonGroup.appendChild(exitBtn);
            }
            
            // ×ボタンを追加
            if (closeBtn) {
                buttonGroup.appendChild(closeBtn);
            }
            
            // モーダルヘッダーをクリアして再構築
            modalHeader.innerHTML = '';
            modalHeader.appendChild(h2);
            modalHeader.appendChild(buttonGroup);
        }
        
        content.innerHTML = detailHTML;
        
        // 円建て損益セクションを追加（DOM要素として）
        this.renderYenProfitLossSection(trade, content);
        
        modal.style.display = 'flex';
        
        // モーダル外クリックで閉じる
        modal.onclick = (event) => {
            if (event.target === modal) {
                this.closeTradeDetailModal();
            }
        };
    }
    
    /**
     * トレード詳細モーダルを閉じる
     */
    closeTradeDetailModal() {
        console.log('closeTradeDetailModal called');
        
        const modal = document.getElementById('tradeDetailModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    /**
     * 振り返り編集モーダルを開く
     * @param {string} tradeId - トレードID
     */
    editReflection(tradeId) {
        console.log('editReflection called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // 既存のreflectionEditModalを削除（index.html版を置き換え）
        const existingModal = document.getElementById('reflectionEditModal');
        if (existingModal) existingModal.remove();
        
        // 動的にモーダルHTMLを生成
        const modalHTML = `
            <div id="reflectionEditModal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>振り返り編集</h2>
                        <button class="modal-close" id="reflectionModalClose">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>振り返り・反省</label>
                            <textarea id="reflectionEditText" class="form-control" rows="10" placeholder="このトレードから学んだこと、改善点などを記録">${trade.reflection || ''}</textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="reflectionModalCancel">キャンセル</button>
                        <button class="btn btn-primary" id="reflectionModalSave">保存</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('reflectionEditModal');
        
        // イベントリスナー設定
        document.getElementById('reflectionModalClose').onclick = () => this.closeReflectionEditModal();
        document.getElementById('reflectionModalCancel').onclick = () => this.closeReflectionEditModal();
        document.getElementById('reflectionModalSave').onclick = () => this.saveReflectionEdit();
        
        // ✅ モーダル外クリックを無効化（コメントアウト）
        // modal.onclick = (event) => {
        //     if (event.target === modal) {
        //         this.closeReflectionEditModal();
        //     }
        // };
        
        // モーダルにtradeIdを保存
        modal.dataset.tradeId = tradeId;
    }
    
    /**
     * 振り返りを保存
     */
    saveReflectionEdit() {
        console.log('saveReflectionEdit called');
        
        const modal = document.getElementById('reflectionEditModal');
        const textarea = document.getElementById('reflectionEditText');
        
        if (!modal || !textarea) return;
        
        const tradeId = modal.dataset.tradeId;
        const reflection = textarea.value;
        
        const updatedTrade = this.#tradeManager.updateTrade(tradeId, {
            reflection: reflection
        });
        
        if (updatedTrade) {
            this.closeReflectionEditModal();
            this.showTradeDetail(updatedTrade);
            this.#showToast('振り返りを更新しました', 'success');
            
            // ★ トレード一覧を更新（追加）
            if (window.displayAllTrades) {
                window.displayAllTrades();
            }
        }
    }
    
    /**
     * 振り返り編集モーダルを閉じる
     */
    closeReflectionEditModal() {
        console.log('closeReflectionEditModal called');
        
        const modal = document.getElementById('reflectionEditModal');
        if (modal) {
            modal.style.display = 'none';
            modal.dataset.tradeId = '';
        }
    }
    
    /**
     * 円建て損益の編集
     * @param {string} tradeId - トレードID
     */
    editYenProfitLoss(tradeId) {
        console.log('editYenProfitLoss called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // 編集機能の実装（モーダル表示など）
        if (typeof window.openYenProfitLossModal === 'function') {
            window.openYenProfitLossModal(tradeId);
        } else {
            this.#showToast('円建て損益編集機能は準備中です', 'info');
        }
    }

    /**
     * 円建て損益の追加
     * @param {string} tradeId - トレードID
     */
    addYenProfitLoss(tradeId) {
        console.log('addYenProfitLoss called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // 追加機能の実装（モーダル表示など）
        if (typeof window.openYenProfitLossModal === 'function') {
            window.openYenProfitLossModal(tradeId);
        } else {
            this.#showToast('円建て損益追加機能は準備中です', 'info');
        }
    }
    
    // ==================== プライベートメソッド ====================
    
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
     * 日付をフォーマット（表示用）
     * @private
     */
    #formatDateForDisplay(date) {
        if (!date) return '';
        
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        
        return `${year}/${month}/${day}`;
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
window.TradeDetail = TradeDetail;
console.log('TradeDetail.js loaded');

// グローバルインスタンスとして公開
if (!window.tradeDetailInstance) {
    window.tradeDetailInstance = new TradeDetail();
}

// グローバル関数として公開（互換性のため）
window.showTradeDetail = function(tradeOrId) {
    return window.tradeDetailInstance.showTradeDetail(tradeOrId);
};

window.closeTradeDetailModal = function() {
    return window.tradeDetailInstance.closeTradeDetailModal();
};

window.editReflection = function(tradeId) {
    return window.tradeDetailInstance.editReflection(tradeId);
};

window.saveReflectionEdit = function() {
    return window.tradeDetailInstance.saveReflectionEdit();
};

window.closeReflectionEditModal = function() {
    return window.tradeDetailInstance.closeReflectionEditModal();
};

// 円建て損益編集関数も公開
window.editYenProfitLoss = function(tradeId) {
    return window.tradeDetailInstance.editYenProfitLoss(tradeId);
};

window.addYenProfitLoss = function(tradeId) {
    return window.tradeDetailInstance.addYenProfitLoss(tradeId);
};

// 編集関数も公開
window.editBasicInfo = function(tradeId) {
    return window.tradeDetailInstance.editBasicInfo(tradeId);
};

window.editTradeReasons = function(tradeId) {
    return window.tradeDetailInstance.editTradeReasons(tradeId);
};

window.editExitInfo = function(tradeId) {
    return window.tradeDetailInstance.editExitInfo(tradeId);
};

// トレード削除関数も公開
window.deleteTrade = function(tradeId) {
    if (confirm('このトレードを削除しますか？')) {
        const success = window.tradeManager.deleteTrade(tradeId);
        if (success) {
            window.tradeDetailInstance.closeTradeDetailModal();
            // リストを更新
            if (window.displayAllTrades) {
                window.displayAllTrades();
            }
        }
    }
};

// 画像管理関数も公開（詳細モーダル用 - 新規エントリーと統一）
// 詳細モーダルから画像を変更（画像追加モーダルを経由）
window.changeTradeImage = function(tradeId, imageIndex) {
    // ImageAddModalModuleを直接呼び出し、tradeIdを渡す
    if (window.ImageAddModalModule) {
        window.ImageAddModalModule.open('tradeChart' + imageIndex, tradeId);
    } else if (typeof window.showImageUploadOptions === 'function') {
        // フォールバック
        window.selectedTradeForEdit = tradeId;
        window.pendingImageType = 'tradeChart' + imageIndex;
        window.showImageUploadOptions('tradeChart' + imageIndex);
    } else {
        console.error('画像追加モーダルが見つかりません');
    }
};


window.deleteTradeImage = function(tradeId, imageIndex) {
    if (!confirm('この画像を削除しますか？')) return;
    
    const tradeManager = window.tradeManager || window.TradeManager.getInstance();
    const trade = tradeManager.getTradeById(tradeId);
    if (trade) {
        const chartImages = [...(trade.chartImages || [null, null, null])];
        // 配列を3要素に拡張
        while (chartImages.length < 3) {
            chartImages.push(null);
        }
        chartImages[imageIndex - 1] = null;
        tradeManager.updateTrade(tradeId, { chartImages: chartImages });
        
        // 詳細モーダルを再表示
        const updatedTrade = tradeManager.getTradeById(tradeId);
        if (typeof window.showTradeDetail === 'function') {
            window.showTradeDetail(updatedTrade);
        }
        // トレード一覧も更新
        if (typeof window.displayAllTrades === 'function') {
            window.displayAllTrades();
        }
    }
};

// 決済モーダルを開く関数も公開
window.openExitModal = function(tradeId) {
    if (typeof window.openExitModalOriginal === 'function') {
        window.openExitModalOriginal(tradeId);
    } else if (window.tradeExit) {
        window.tradeExit.openExitModal(tradeId);
    } else {
        window.showToast('決済機能は準備中です', 'info');
    }
};