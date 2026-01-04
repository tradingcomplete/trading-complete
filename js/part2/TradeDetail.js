// js/part2/TradeDetail.js
// Part 2 ãƒ¢ã‚¸ãƒ¥ãƒ¼ãƒ«åŒ– - ãƒˆãƒ¬ãƒ¼ãƒ‰è©³ç´°è¡¨ç¤ºæ©Ÿèƒ½
// ä½œæˆæ—¥: 2025/09/17

/**
 * TradeDetail ã‚¯ãƒ©ã‚¹
 * ãƒˆãƒ¬ãƒ¼ãƒ‰è©³ç´°è¡¨ç¤ºæ©Ÿèƒ½ã‚’ç®¡ç†
 */
class TradeDetail {
    /**
     * å††å»ºã¦æç›Šã®ãƒ•ã‚©ãƒ¼ãƒžãƒƒãƒˆ
     * @private
     */
    #formatYenProfitLoss(yenProfitLoss) {
        if (!yenProfitLoss || !yenProfitLoss.length) {
            return '<p style="color: #888;">å††å»ºã¦æç›ŠãŒæœªè¨­å®šã§ã™</p>';
        }
        
        const totalYen = yenProfitLoss.reduce((sum, pl) => sum + pl.amount, 0);
        
        return `
            ${yenProfitLoss.map((pl, index) => `
                <div class="yen-pl-item">
                    <span>${pl.date ? this.#formatDateForDisplay(pl.date) : 'æ—¥ä»˜ãªã—'}: 
                    <strong class="${pl.amount >= 0 ? 'profit' : 'loss'}">
                        ${pl.amount >= 0 ? '+' : ''}${pl.amount.toLocaleString()}å††
                    </strong></span>
                </div>
            `).join('')}
            <p><strong>åˆè¨ˆ: <span class="${totalYen >= 0 ? 'profit' : 'loss'}">
                ${totalYen >= 0 ? '+' : ''}${totalYen.toLocaleString()}å††
            </span></strong></p>
        `;
    }

    /**
     * å††å»ºã¦æç›Šã‚»ã‚¯ã‚·ãƒ§ãƒ³ã®æç”»ãƒ¡ã‚½ãƒƒãƒ‰
     * @param {Object} trade - ãƒˆãƒ¬ãƒ¼ãƒ‰ã‚ªãƒ–ã‚¸ã‚§ã‚¯ãƒˆ
     * @param {HTMLElement} container - ã‚³ãƒ³ãƒ†ãƒŠè¦ç´ 
     */
    renderYenProfitLossSection(trade, container) {
        // æ±ºæ¸ˆæ¸ˆã¿ãƒˆãƒ¬ãƒ¼ãƒ‰ã®ã¿è¡¨ç¤ºï¼ˆä¿®æ­£ç‰ˆï¼‰
        if (!trade) {
            return;
        }
        
        // ãƒˆãƒ¬ãƒ¼ãƒ‰ã®çŠ¶æ…‹ã‚’åˆ¤å®š
        const hasExits = trade.exits && trade.exits.length > 0;
        const isClosed = trade.holdingStatus === 'closed';
        const isSettled = hasExits || isClosed;
        
        // æ±ºæ¸ˆæ¸ˆã¿ã§ãªã„å ´åˆã¯ãƒªã‚¿ãƒ¼ãƒ³
        if (!isSettled) {
            return;
        }
        
        // æ—¢å­˜ã®å††å»ºã¦æç›Šã‚»ã‚¯ã‚·ãƒ§ãƒ³ã‚’å‰Šé™¤ï¼ˆé‡è¤‡é˜²æ­¢ï¼‰
        const existingSections = container.querySelectorAll('.yen-profit-loss-section');
        existingSections.forEach(section => section.remove());
        
        // æ–°ã—ã„ã‚»ã‚¯ã‚·ãƒ§ãƒ³ã‚’ä½œæˆ
        const yenSection = document.createElement('div');
        yenSection.className = 'trade-detail-section yen-profit-loss-section';
        yenSection.style.cssText = 'background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;';
        
        const headerStyle = 'color: #00ff88; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;';
        const buttonStyle = 'font-size: 0.8rem; padding: 5px 10px;';
        
        // å††å»ºã¦æç›Šã®å†…å®¹ã‚’æ¡ä»¶åˆ†å²ã§ç”Ÿæˆ
        let yenContent = '';
        
        if (trade.yenProfitLoss && trade.yenProfitLoss.length > 0) {
            // é…åˆ—å½¢å¼ã®è©³ç´°ãƒ‡ãƒ¼ã‚¿ãŒã‚ã‚‹å ´åˆ
            yenContent = this.formatYenProfitLoss(trade.yenProfitLoss);
        } else if (trade.yenProfitLoss && (trade.yenProfitLoss.profitLoss !== undefined || trade.yenProfitLoss.netProfit !== undefined)) {
            // ç°¡æ˜“ãƒ‡ãƒ¼ã‚¿ãŒã‚ã‚‹å ´åˆï¼ˆä¸€æ‹¬å…¥åŠ›ãªã©ï¼‰
            yenContent = `
                ${trade.broker ? `<p>ãƒ–ãƒ­ãƒ¼ã‚«ãƒ¼: <span style="display: inline-block; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 8px; border-radius: 4px; font-size: 0.9rem;">${trade.broker}</span></p>` : ''}
                <p>æç›Š: Â¥${(trade.yenProfitLoss.profitLoss || 0).toLocaleString()}</p>
                <p>ã‚¹ãƒ¯ãƒƒãƒ—: Â¥${(trade.yenProfitLoss.swap || 0).toLocaleString()}</p>
                <p>æ‰‹æ•°æ–™: Â¥${(trade.yenProfitLoss.commission || 0).toLocaleString()}</p>
                <p class="net-profit"><strong>å®Ÿæç›Š: 
                    <span class="${(trade.yenProfitLoss.netProfit || 0) >= 0 ? 'profit' : 'loss'}" style="color: ${(trade.yenProfitLoss.netProfit || 0) >= 0 ? '#4ade80' : '#f87171'};">
                        ${(trade.yenProfitLoss.netProfit || 0) >= 0 ? '+' : ''}Â¥${(trade.yenProfitLoss.netProfit || 0).toLocaleString()}
                    </span>
                </strong></p>
            `;
        } else {
            // ãƒ‡ãƒ¼ã‚¿ãŒãªã„å ´åˆ
            yenContent = '<p style="color: #888;">å††å»ºã¦æç›ŠãŒæœªè¨­å®šã§ã™</p>';
        }
        
        yenSection.innerHTML = `
            <h4 style="${headerStyle}">
                ðŸ’´ å††å»ºã¦æç›Š
                <button class="btn btn-small btn-secondary" style="${buttonStyle}" onclick="window.${trade.yenProfitLoss ? 'editYenProfitLoss' : 'addYenProfitLoss'}('${trade.id}')">
                    ${trade.yenProfitLoss ? 'ç·¨é›†' : 'è¿½åŠ '}
                </button>
            </h4>
            <div class="section-content">
                ${yenContent}
            </div>
        `;
        
        // æ±ºæ¸ˆæƒ…å ±ã‚»ã‚¯ã‚·ãƒ§ãƒ³ã®å¾Œã«æŒ¿å…¥
        const sections = container.querySelectorAll('.trade-detail-section');
        let insertAfterElement = null;
        
        // æ±ºæ¸ˆæƒ…å ±ã‚»ã‚¯ã‚·ãƒ§ãƒ³ã‚’æŽ¢ã™
        sections.forEach(section => {
            const header = section.querySelector('h4');
            if (header && header.textContent.includes('æ±ºæ¸ˆæƒ…å ±')) {
                insertAfterElement = section;
            }
        });
        
        if (insertAfterElement) {
            // æ±ºæ¸ˆæƒ…å ±ã®æ¬¡ã«æŒ¿å…¥
            insertAfterElement.parentNode.insertBefore(yenSection, insertAfterElement.nextSibling);
        } else {
            // è¦‹ã¤ã‹ã‚‰ãªã„å ´åˆã¯æœ€å¾Œã«è¿½åŠ ï¼ˆãƒ•ã‚©ãƒ¼ãƒ«ãƒãƒƒã‚¯ï¼‰
            container.appendChild(yenSection);
        }
    }

    /**
     * å††å»ºã¦æç›Šã®ãƒ•ã‚©ãƒ¼ãƒžãƒƒãƒˆãƒ¡ã‚½ãƒƒãƒ‰
     * @param {Object|Array} yenProfitLoss - å††å»ºã¦æç›Šãƒ‡ãƒ¼ã‚¿
     * @returns {string} ãƒ•ã‚©ãƒ¼ãƒžãƒƒãƒˆæ¸ˆã¿HTML
     */
    formatYenProfitLoss(yenProfitLoss) {
        // é…åˆ—ã®å ´åˆï¼ˆç¾åœ¨ã®å®Ÿè£…ï¼‰
        if (Array.isArray(yenProfitLoss)) {
            if (!yenProfitLoss.length) {
                return '<p style="color: #888;">å††å»ºã¦æç›ŠãŒæœªè¨­å®šã§ã™</p>';
            }
            
            const totalYen = yenProfitLoss.reduce((sum, pl) => sum + pl.amount, 0);
            
            return `
                ${yenProfitLoss.map((pl, index) => `
                    <div class="yen-pl-item">
                        <span>${pl.date ? this.#formatDateForDisplay(pl.date) : 'æ—¥ä»˜ãªã—'}: 
                        <strong class="${pl.amount >= 0 ? 'profit' : 'loss'}">
                            ${pl.amount >= 0 ? '+' : ''}${pl.amount.toLocaleString()}å††
                        </strong></span>
                    </div>
                `).join('')}
                <p><strong>åˆè¨ˆ: <span class="${totalYen >= 0 ? 'profit' : 'loss'}">
                    ${totalYen >= 0 ? '+' : ''}${totalYen.toLocaleString()}å††
                </span></strong></p>
            `;
        }
        
        // ã‚ªãƒ–ã‚¸ã‚§ã‚¯ãƒˆã®å ´åˆï¼ˆå°†æ¥ã®å®Ÿè£…ç”¨ï¼‰
        if (!yenProfitLoss) {
            return '<p style="color: #888;">å††å»ºã¦æç›ŠãŒæœªè¨­å®šã§ã™</p>';
        }
        
        return `
            <p>ãƒ–ãƒ­ãƒ¼ã‚«ãƒ¼: ${yenProfitLoss.broker || 'æœªè¨­å®š'}</p>
            <p>æç›Š: Â¥${(yenProfitLoss.profitLoss || 0).toLocaleString()}</p>
            <p>ã‚¹ãƒ¯ãƒƒãƒ—: Â¥${(yenProfitLoss.swapPoints || 0).toLocaleString()}</p>
            <p>æ‰‹æ•°æ–™: Â¥${(yenProfitLoss.commission || 0).toLocaleString()}</p>
            <p>æ±ºæ¸ˆæ™‚ãƒ¬ãƒ¼ãƒˆ: ${yenProfitLoss.exchangeRate || '-'}</p>
            <p class="net-profit">å®Ÿæç›Š: Â¥${(yenProfitLoss.netProfitLoss || 0).toLocaleString()}</p>
        `;
    }

    /**
     * åŸºæœ¬æƒ…å ±ã®ç·¨é›†
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     */
    editBasicInfo(tradeId) {
        console.log('editBasicInfo called:', tradeId);
        
        if (typeof window.editTradeBasicInfo === 'function') {
            window.editTradeBasicInfo(tradeId);
        } else {
            this.#showToast('åŸºæœ¬æƒ…å ±ç·¨é›†æ©Ÿèƒ½ã¯æº–å‚™ä¸­ã§ã™', 'info');
        }
    }

    /**
     * ã‚¨ãƒ³ãƒˆãƒªãƒ¼æ ¹æ‹ ï¼ˆãƒã‚§ãƒƒã‚¯ãƒªã‚¹ãƒˆï¼‰ã®ç·¨é›†
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     */
    editTradeReasons(tradeId) {
        console.log('editTradeReasons called:', tradeId);
        
        if (typeof window.editTradeReasons === 'function') {
            window.editTradeReasons(tradeId);
        } else {
            this.#showToast('ãƒã‚§ãƒƒã‚¯ãƒªã‚¹ãƒˆç·¨é›†æ©Ÿèƒ½ã¯æº–å‚™ä¸­ã§ã™', 'info');
        }
    }

    /**
     * æ±ºæ¸ˆæƒ…å ±ã®ç·¨é›†
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     */
    editExitInfo(tradeId) {
        console.log('editExitInfo called:', tradeId);
        
        if (typeof window.editExitInfo === 'function') {
            window.editExitInfo(tradeId);
        } else {
            this.#showToast('æ±ºæ¸ˆç·¨é›†æ©Ÿèƒ½ã¯æº–å‚™ä¸­ã§ã™', 'info');
        }
    }

    /**
     * ç”»åƒã®å¤‰æ›´
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     * @param {string} type - ç”»åƒã‚¿ã‚¤ãƒ—ï¼ˆ'icon' | 'chart'ï¼‰
     * @param {number} index - ç”»åƒã®ã‚¤ãƒ³ãƒ‡ãƒƒã‚¯ã‚¹
     */
    changeTradeImage(tradeId, type, index) {
        console.log('changeTradeImage called:', tradeId, type, index);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // æ—¢å­˜ã®ç”»åƒã‚¢ãƒƒãƒ—ãƒ­ãƒ¼ãƒ‰ã‚·ã‚¹ãƒ†ãƒ ã‚’ä½¿ç”¨
        window.selectedTradeForEdit = tradeId;
        
        if (type === 'icon') {
            window.pendingImageType = 'tradeIcon';
        } else if (type === 'chart') {
            window.pendingImageType = `tradeChart${index}`;
        }
        
        // ç”»åƒã‚¢ãƒƒãƒ—ãƒ­ãƒ¼ãƒ‰ãƒ¢ãƒ¼ãƒ€ãƒ«ã‚’è¡¨ç¤º
        if (typeof window.showImageUploadOptions === 'function') {
            window.showImageUploadOptions(window.pendingImageType);
        } else {
            this.#showToast('ç”»åƒã‚¢ãƒƒãƒ—ãƒ­ãƒ¼ãƒ‰æ©Ÿèƒ½ãŒè¦‹ã¤ã‹ã‚Šã¾ã›ã‚“', 'error');
        }
    }

    /**
     * ç”»åƒã®å‰Šé™¤
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     * @param {string} type - ç”»åƒã‚¿ã‚¤ãƒ—ï¼ˆ'icon' | 'chart'ï¼‰
     * @param {number} index - ç”»åƒã®ã‚¤ãƒ³ãƒ‡ãƒƒã‚¯ã‚¹
     */
    deleteTradeImage(tradeId, type, index) {
        console.log('deleteTradeImage called:', tradeId, type, index);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        if (confirm('ã“ã®ç”»åƒã‚’å‰Šé™¤ã—ã¾ã™ã‹ï¼Ÿ')) {
            let updateData = {};
            
            if (type === 'icon') {
                updateData.chartImage = null;
            } else if (type === 'chart') {
                const chartImages = [...(trade.chartImages || [])];
                chartImages[index] = null;
                updateData.chartImages = chartImages;
            }
            
            const updatedTrade = this.#tradeManager.updateTrade(tradeId, updateData);
            if (updatedTrade) {
                this.showTradeDetail(updatedTrade);
                this.#showToast('ç”»åƒã‚’å‰Šé™¤ã—ã¾ã—ãŸ', 'success');
            }
        }
    }

    /**
     * å††å»ºã¦æç›Šã®ç·¨é›†
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     */
    editYenProfitLoss(tradeId) {
        console.log('editYenProfitLoss called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // ç·¨é›†æ©Ÿèƒ½ã®å®Ÿè£…ï¼ˆãƒ¢ãƒ¼ãƒ€ãƒ«è¡¨ç¤ºãªã©ï¼‰
        if (typeof window.openYenProfitLossModal === 'function') {
            window.openYenProfitLossModal(tradeId);
        } else {
            this.#showToast('å††å»ºã¦æç›Šç·¨é›†æ©Ÿèƒ½ã¯æº–å‚™ä¸­ã§ã™', 'info');
        }
    }

    /**
     * å††å»ºã¦æç›Šã®è¿½åŠ 
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     */
    addYenProfitLoss(tradeId) {
        console.log('addYenProfitLoss called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // è¿½åŠ æ©Ÿèƒ½ã®å®Ÿè£…ï¼ˆãƒ¢ãƒ¼ãƒ€ãƒ«è¡¨ç¤ºãªã©ï¼‰
        if (typeof window.openYenProfitLossModal === 'function') {
            window.openYenProfitLossModal(tradeId);
        } else {
            this.#showToast('å††å»ºã¦æç›Šè¿½åŠ æ©Ÿèƒ½ã¯æº–å‚™ä¸­ã§ã™', 'info');
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
     * ãƒˆãƒ¬ãƒ¼ãƒ‰è©³ç´°ã‚’è¡¨ç¤º
     * @param {Object|string} tradeOrId - ãƒˆãƒ¬ãƒ¼ãƒ‰ã‚ªãƒ–ã‚¸ã‚§ã‚¯ãƒˆã¾ãŸã¯ID
     */
    showTradeDetail(tradeOrId) {
        console.log('showTradeDetail called:', tradeOrId);
        
        // ãƒˆãƒ¬ãƒ¼ãƒ‰ã‚ªãƒ–ã‚¸ã‚§ã‚¯ãƒˆã¾ãŸã¯IDã‹ã‚‰å–å¾—
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
        
        // ãƒˆãƒ¬ãƒ¼ãƒ‰ã®çŠ¶æ…‹ã‚’åˆ¤å®šï¼ˆä¿®æ­£ç‰ˆï¼‰
        const hasExits = trade.exits && trade.exits.length > 0;
        const isClosed = trade.holdingStatus === 'closed';
        
        // ä¿æœ‰ä¸­ã¨åˆ¤å®šã™ã‚‹æ¡ä»¶ã‚’æ˜Žç¢ºåŒ–
        const isOpen = !hasExits && !isClosed;
        // æ±ºæ¸ˆæ¸ˆã¿ã¨åˆ¤å®šï¼ˆholdingStatus: 'closed'ã€exitså­˜åœ¨ã®ã„ãšã‚Œã‹ï¼‰
        const isSettled = hasExits || isClosed;
        
        // ãƒ‡ãƒãƒƒã‚°ç”¨ï¼šãƒˆãƒ¬ãƒ¼ãƒ‰çŠ¶æ…‹ã®ç¢ºèª
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
                <h4 style="color: #00ff88; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                    ðŸ“ ã‚¨ãƒ³ãƒˆãƒªãƒ¼æƒ…å ±
                    <button class="btn btn-small btn-secondary" style="font-size: 0.8rem; padding: 5px 10px;" onclick="editBasicInfo('${trade.id}')">ç·¨é›†</button>
                </h4>
                <p>æ—¥æ™‚: ${this.#formatDateTimeForDisplay(trade.entryTime || trade.date)}</p>
                <p>ä¾¡æ ¼: ${trade.entryPrice}</p>
                <p>ãƒ­ãƒƒãƒˆ: ${trade.lotSize} Lot</p>
                <p>SL: ${trade.stopLoss || '-'} / TP: ${trade.takeProfit || '-'}</p>
                <p>ã‚·ãƒŠãƒªã‚ª: ${trade.scenario || '-'}</p>
                <p>æ„Ÿæƒ…: ${trade.entryEmotion || '-'}</p>
            </div>
            
            <div class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;">
                <h4 style="color: #00ff88; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                    ðŸŽ¯ ãƒã‚§ãƒƒã‚¯ãƒªã‚¹ãƒˆ
                    <button class="btn btn-small btn-secondary" style="font-size: 0.8rem; padding: 5px 10px;" onclick="editTradeReasons('${trade.id}')">ç·¨é›†</button>
                </h4>
                <p>ã‚¨ãƒ³ãƒˆãƒªãƒ¼ä¾¡æ ¼ã®æ ¹æ‹ ï¼š</p>
                <p style="padding-left: 20px;">${trade.reasons?.[0] || 'è¨˜å…¥ãªã—'}</p>
                <p>æåˆ‡ã‚Šä¾¡æ ¼ã®æ ¹æ‹ ï¼š</p>
                <p style="padding-left: 20px;">${trade.reasons?.[1] || 'è¨˜å…¥ãªã—'}</p>
                <p>åˆ©ç¢ºç›®æ¨™ä¾¡æ ¼ã®æ ¹æ‹ ï¼š</p>
                <p style="padding-left: 20px;">${trade.reasons?.[2] || 'è¨˜å…¥ãªã—'}</p>
            </div>
        `;
        
        // æ±ºæ¸ˆæƒ…å ±ãŒã‚ã‚‹å ´åˆã€ã¾ãŸã¯æ±ºæ¸ˆæ¸ˆã¿ãƒˆãƒ¬ãƒ¼ãƒ‰ã®å ´åˆ
        if (isSettled) {
            // é€šå¸¸ã®æ±ºæ¸ˆæƒ…å ±ãŒã‚ã‚‹å ´åˆ
            if (trade.exits && trade.exits.length > 0) {
                detailHTML += `
                    <div class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;">
                        <h4 style="color: #00ff88; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                            ðŸ“Š æ±ºæ¸ˆæƒ…å ±
                            <button class="btn btn-small btn-secondary" style="font-size: 0.8rem; padding: 5px 10px;" onclick="editExitInfo('${trade.id}')">ç·¨é›†</button>
                        </h4>
                        ${trade.exits.map((exit, i) => `
                            <p>æ±ºæ¸ˆ${i + 1}: ${this.#formatDateTimeForDisplay(exit.time)} @ ${exit.price} (${exit.lot} Lot) â†’ ${exit.pips ? exit.pips.toFixed(1) : '-'} pips</p>
                        `).join('')}
                        <p><strong>åˆè¨ˆ: ${pips >= 0 ? '+' : ''}${pips.toFixed(1)} pips</strong></p>
                        ${remainingLot > 0 ? `<p>æœªæ±ºæ¸ˆ: ${remainingLot.toFixed(2)} Lot</p>` : ''}
                    </div>
                `;
            }
        }
        
        // æŒ¯ã‚Šè¿”ã‚Šã‚»ã‚¯ã‚·ãƒ§ãƒ³ï¼ˆæ”¹è¡Œå¯¾å¿œï¼‰
        // æ±ºæ¸ˆæ¸ˆã¿ãƒˆãƒ¬ãƒ¼ãƒ‰ã®å ´åˆã«è¡¨ç¤º
        if (isSettled || trade.reflection) {
            const reflectionHtml = trade.reflection 
                ? trade.reflection.replace(/\n/g, '<br>') 
                : '';
            
            detailHTML += `
                <div class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;">
                    <h4 style="color: #00ff88; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                        ðŸ“ æŒ¯ã‚Šè¿”ã‚Š
                        <button class="btn btn-small btn-secondary" style="font-size: 0.8rem; padding: 5px 10px;" onclick="editReflection('${trade.id}')">ç·¨é›†</button>
                    </h4>
                    <div id="reflectionDisplay">${reflectionHtml || 'è¨˜å…¥ãªã—'}</div>
                </div>
            `;
        }
        
        // ç”»åƒã‚»ã‚¯ã‚·ãƒ§ãƒ³
        detailHTML += `
            <div class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;">
                <h4 style="color: #00ff88; margin-bottom: 15px;">ðŸ“¸ ç”»åƒ</h4>
                
                <!-- ãƒãƒ£ãƒ¼ãƒˆç”»åƒ -->
                <p style="color: #999; margin-bottom: 10px; font-size: 0.9em; text-align: center;">ãƒãƒ£ãƒ¼ãƒˆç”»åƒ</p>
                <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                    ${[0, 1, 2].map(index => {
                        const chartImg = trade.chartImages && trade.chartImages[index];
                        const imgSrc = window.getImageSrc ? window.getImageSrc(chartImg) : (typeof chartImg === 'string' ? chartImg : null);
                        return `
                            <div style="text-align: center;">
                                <div style="margin-bottom: 10px;">
                                    ${imgSrc ? 
                                        `<img src="${imgSrc}" style="width: 160px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #444;" alt="ãƒãƒ£ãƒ¼ãƒˆ${index + 1}">` :
                                        `<div style="width: 160px; height: 120px; background: #2a2a2a; border-radius: 8px; border: 1px dashed #444; display: flex; align-items: center; justify-content: center; color: #666;">
                                            <span style="font-size: 0.9em;">ãƒãƒ£ãƒ¼ãƒˆ${index + 1}</span>
                                        </div>`
                                    }
                                </div>
                                <div>
                                    <button onclick="changeTradeImage('${trade.id}', 'chart', ${index})" class="btn btn-small btn-secondary" style="margin-right: 5px;">å¤‰æ›´</button>
                                    <button onclick="deleteTradeImage('${trade.id}', 'chart', ${index})" class="btn btn-small btn-danger">å‰Šé™¤</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        
        // ãƒ¢ãƒ¼ãƒ€ãƒ«ãƒ˜ãƒƒãƒ€ãƒ¼ã«æ±ºæ¸ˆãƒœã‚¿ãƒ³ã‚’å‹•çš„ã«è¿½åŠ 
        const modalHeader = modal.querySelector('.modal-header');
        if (modalHeader) {
            // æ—¢å­˜ã®h2ã¨Ã—ãƒœã‚¿ãƒ³ã‚’å–å¾—
            const h2 = modalHeader.querySelector('h2');
            const closeBtn = modalHeader.querySelector('.modal-close');
            
            // ãƒ˜ãƒƒãƒ€ãƒ¼ã‚’å†æ§‹ç¯‰
            modalHeader.style.display = 'flex';
            modalHeader.style.alignItems = 'center';
            modalHeader.style.justifyContent = 'space-between';
            
            // å³å´ã®ãƒœã‚¿ãƒ³ã‚°ãƒ«ãƒ¼ãƒ—ã‚’ä½œæˆ
            const buttonGroup = document.createElement('div');
            buttonGroup.style.display = 'flex';
            buttonGroup.style.alignItems = 'center';
            buttonGroup.style.gap = '10px';
            
            // ä¿æœ‰ä¸­ã®å ´åˆã¯æ±ºæ¸ˆãƒœã‚¿ãƒ³ã‚’è¿½åŠ 
            if (isOpen) {
                const exitBtn = document.createElement('button');
                exitBtn.className = 'btn btn-primary';
                exitBtn.textContent = 'æ±ºæ¸ˆ';
                exitBtn.onclick = () => window.openExitModal(trade.id);
                buttonGroup.appendChild(exitBtn);
            }
            
            // Ã—ãƒœã‚¿ãƒ³ã‚’è¿½åŠ 
            if (closeBtn) {
                buttonGroup.appendChild(closeBtn);
            }
            
            // ãƒ¢ãƒ¼ãƒ€ãƒ«ãƒ˜ãƒƒãƒ€ãƒ¼ã‚’ã‚¯ãƒªã‚¢ã—ã¦å†æ§‹ç¯‰
            modalHeader.innerHTML = '';
            modalHeader.appendChild(h2);
            modalHeader.appendChild(buttonGroup);
        }
        
        content.innerHTML = detailHTML;
        
        // å††å»ºã¦æç›Šã‚»ã‚¯ã‚·ãƒ§ãƒ³ã‚’è¿½åŠ ï¼ˆDOMè¦ç´ ã¨ã—ã¦ï¼‰
        this.renderYenProfitLossSection(trade, content);
        
        modal.style.display = 'flex';
        
        // ãƒ¢ãƒ¼ãƒ€ãƒ«å¤–ã‚¯ãƒªãƒƒã‚¯ã§é–‰ã˜ã‚‹
        modal.onclick = (event) => {
            if (event.target === modal) {
                this.closeTradeDetailModal();
            }
        };
    }
    
    /**
     * ãƒˆãƒ¬ãƒ¼ãƒ‰è©³ç´°ãƒ¢ãƒ¼ãƒ€ãƒ«ã‚’é–‰ã˜ã‚‹
     */
    closeTradeDetailModal() {
        console.log('closeTradeDetailModal called');
        
        const modal = document.getElementById('tradeDetailModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    /**
     * æŒ¯ã‚Šè¿”ã‚Šç·¨é›†ãƒ¢ãƒ¼ãƒ€ãƒ«ã‚’é–‹ã
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     */
    editReflection(tradeId) {
        console.log('editReflection called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // æ—¢å­˜ã®reflectionEditModalã‚’å‰Šé™¤ï¼ˆindex.htmlç‰ˆã‚’ç½®ãæ›ãˆï¼‰
        const existingModal = document.getElementById('reflectionEditModal');
        if (existingModal) existingModal.remove();
        
        // å‹•çš„ã«ãƒ¢ãƒ¼ãƒ€ãƒ«HTMLã‚’ç”Ÿæˆ
        const modalHTML = `
            <div id="reflectionEditModal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>æŒ¯ã‚Šè¿”ã‚Šç·¨é›†</h2>
                        <button class="modal-close" id="reflectionModalClose">Ã—</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>æŒ¯ã‚Šè¿”ã‚Šãƒ»åçœ</label>
                            <textarea id="reflectionEditText" class="form-control" rows="10" placeholder="ã“ã®ãƒˆãƒ¬ãƒ¼ãƒ‰ã‹ã‚‰å­¦ã‚“ã ã“ã¨ã€æ”¹å–„ç‚¹ãªã©ã‚’è¨˜éŒ²">${trade.reflection || ''}</textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="reflectionModalCancel">ã‚­ãƒ£ãƒ³ã‚»ãƒ«</button>
                        <button class="btn btn-primary" id="reflectionModalSave">ä¿å­˜</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('reflectionEditModal');
        
        // ã‚¤ãƒ™ãƒ³ãƒˆãƒªã‚¹ãƒŠãƒ¼è¨­å®š
        document.getElementById('reflectionModalClose').onclick = () => this.closeReflectionEditModal();
        document.getElementById('reflectionModalCancel').onclick = () => this.closeReflectionEditModal();
        document.getElementById('reflectionModalSave').onclick = () => this.saveReflectionEdit();
        
        // âœ… ãƒ¢ãƒ¼ãƒ€ãƒ«å¤–ã‚¯ãƒªãƒƒã‚¯ã‚’ç„¡åŠ¹åŒ–ï¼ˆã‚³ãƒ¡ãƒ³ãƒˆã‚¢ã‚¦ãƒˆï¼‰
        // modal.onclick = (event) => {
        //     if (event.target === modal) {
        //         this.closeReflectionEditModal();
        //     }
        // };
        
        // ãƒ¢ãƒ¼ãƒ€ãƒ«ã«tradeIdã‚’ä¿å­˜
        modal.dataset.tradeId = tradeId;
    }
    
    /**
     * æŒ¯ã‚Šè¿”ã‚Šã‚’ä¿å­˜
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
            this.#showToast('æŒ¯ã‚Šè¿”ã‚Šã‚’æ›´æ–°ã—ã¾ã—ãŸ', 'success');
            
            // â˜… ãƒˆãƒ¬ãƒ¼ãƒ‰ä¸€è¦§ã‚’æ›´æ–°ï¼ˆè¿½åŠ ï¼‰
            if (window.displayAllTrades) {
                window.displayAllTrades();
            }
        }
    }
    
    /**
     * æŒ¯ã‚Šè¿”ã‚Šç·¨é›†ãƒ¢ãƒ¼ãƒ€ãƒ«ã‚’é–‰ã˜ã‚‹
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
     * å††å»ºã¦æç›Šã®ç·¨é›†
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     */
    editYenProfitLoss(tradeId) {
        console.log('editYenProfitLoss called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // ç·¨é›†æ©Ÿèƒ½ã®å®Ÿè£…ï¼ˆãƒ¢ãƒ¼ãƒ€ãƒ«è¡¨ç¤ºãªã©ï¼‰
        if (typeof window.openYenProfitLossModal === 'function') {
            window.openYenProfitLossModal(tradeId);
        } else {
            this.#showToast('å††å»ºã¦æç›Šç·¨é›†æ©Ÿèƒ½ã¯æº–å‚™ä¸­ã§ã™', 'info');
        }
    }

    /**
     * å††å»ºã¦æç›Šã®è¿½åŠ 
     * @param {string} tradeId - ãƒˆãƒ¬ãƒ¼ãƒ‰ID
     */
    addYenProfitLoss(tradeId) {
        console.log('addYenProfitLoss called:', tradeId);
        
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        // è¿½åŠ æ©Ÿèƒ½ã®å®Ÿè£…ï¼ˆãƒ¢ãƒ¼ãƒ€ãƒ«è¡¨ç¤ºãªã©ï¼‰
        if (typeof window.openYenProfitLossModal === 'function') {
            window.openYenProfitLossModal(tradeId);
        } else {
            this.#showToast('å††å»ºã¦æç›Šè¿½åŠ æ©Ÿèƒ½ã¯æº–å‚™ä¸­ã§ã™', 'info');
        }
    }
    
    // ==================== ãƒ—ãƒ©ã‚¤ãƒ™ãƒ¼ãƒˆãƒ¡ã‚½ãƒƒãƒ‰ ====================
    
    /**
     * æ—¥æ™‚ã‚’ãƒ•ã‚©ãƒ¼ãƒžãƒƒãƒˆï¼ˆè¡¨ç¤ºç”¨ï¼‰
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
     * æ—¥ä»˜ã‚’ãƒ•ã‚©ãƒ¼ãƒžãƒƒãƒˆï¼ˆè¡¨ç¤ºç”¨ï¼‰
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
     * ãƒˆãƒ¼ã‚¹ãƒˆãƒ¡ãƒƒã‚»ãƒ¼ã‚¸è¡¨ç¤º
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

// ã‚°ãƒ­ãƒ¼ãƒãƒ«ã«å…¬é–‹
window.TradeDetail = TradeDetail;
console.log('TradeDetail.js loaded');

// ã‚°ãƒ­ãƒ¼ãƒãƒ«ã‚¤ãƒ³ã‚¹ã‚¿ãƒ³ã‚¹ã¨ã—ã¦å…¬é–‹
if (!window.tradeDetailInstance) {
    window.tradeDetailInstance = new TradeDetail();
}

// ã‚°ãƒ­ãƒ¼ãƒãƒ«é–¢æ•°ã¨ã—ã¦å…¬é–‹ï¼ˆäº’æ›æ€§ã®ãŸã‚ï¼‰
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

// å††å»ºã¦æç›Šç·¨é›†é–¢æ•°ã‚‚å…¬é–‹
window.editYenProfitLoss = function(tradeId) {
    return window.tradeDetailInstance.editYenProfitLoss(tradeId);
};

window.addYenProfitLoss = function(tradeId) {
    return window.tradeDetailInstance.addYenProfitLoss(tradeId);
};

// ç·¨é›†é–¢æ•°ã‚‚å…¬é–‹
window.editBasicInfo = function(tradeId) {
    return window.tradeDetailInstance.editBasicInfo(tradeId);
};

window.editTradeReasons = function(tradeId) {
    return window.tradeDetailInstance.editTradeReasons(tradeId);
};

window.editExitInfo = function(tradeId) {
    return window.tradeDetailInstance.editExitInfo(tradeId);
};

// ãƒˆãƒ¬ãƒ¼ãƒ‰å‰Šé™¤é–¢æ•°ã‚‚å…¬é–‹
window.deleteTrade = function(tradeId) {
    if (confirm('ã“ã®ãƒˆãƒ¬ãƒ¼ãƒ‰ã‚’å‰Šé™¤ã—ã¾ã™ã‹ï¼Ÿ')) {
        const success = window.tradeManager.deleteTrade(tradeId);
        if (success) {
            window.tradeDetailInstance.closeTradeDetailModal();
            // ãƒªã‚¹ãƒˆã‚’æ›´æ–°
            if (window.displayAllTrades) {
                window.displayAllTrades();
            }
        }
    }
};

// ç”»åƒç®¡ç†é–¢æ•°ã‚‚å…¬é–‹ï¼ˆãƒãƒ£ãƒ¼ãƒˆç”»åƒç”¨ - Step 6ï¼‰
window.changeTradeImage = function(tradeId, type, index) {
    return window.tradeDetailInstance.changeTradeImage(tradeId, type, index);
};

window.deleteTradeImage = function(tradeId, type, index) {
    return window.tradeDetailInstance.deleteTradeImage(tradeId, type, index);
};

// æ±ºæ¸ˆãƒ¢ãƒ¼ãƒ€ãƒ«ã‚’é–‹ãé–¢æ•°ã‚‚å…¬é–‹
window.openExitModal = function(tradeId) {
    if (typeof window.openExitModalOriginal === 'function') {
        window.openExitModalOriginal(tradeId);
    } else if (window.tradeExit) {
        window.tradeExit.openExitModal(tradeId);
    } else {
        window.showToast('æ±ºæ¸ˆæ©Ÿèƒ½ã¯æº–å‚™ä¸­ã§ã™', 'info');
    }
};