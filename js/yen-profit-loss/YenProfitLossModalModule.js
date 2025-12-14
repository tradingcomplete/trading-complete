/**
 * @file YenProfitLossModalModule.js
 * @description 円建て損益編集モーダル（MODULES.md準拠）
 * @version 1.0.0
 */

class YenProfitLossModalModule {
    #modal = null;
    #manager = null;
    #tradeManager = null;
    #currentTradeId = null;
    #eventBus = null;
    
    constructor() {
        this.#eventBus = window.eventBus;
        this.#manager = window.YenProfitLossManager.getInstance();
        this.#tradeManager = window.TradeManager.getInstance();
        this.#initialize();
    }
    
    #initialize() {
        console.log('YenProfitLossModalModule: 初期化開始');
        this.#createModal();
        this.#setupEventListeners();
        this.#bindGlobalFunctions();
    }
    
    #createModal() {
        const existing = document.getElementById('yenProfitLossModal');
        if (existing) existing.remove();
        
        const modalHTML = `
            <div id="yenProfitLossModal" class="modal" style="display: none;">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h2>円建て損益編集</h2>
                        <button class="modal-close" id="yenModalClose">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="trade-info" style="background: #1a1a1a; padding: 10px; border-radius: 8px; margin-bottom: 20px;">
                            <div id="yenModalTradeInfo"></div>
                        </div>
                        <!-- 縦一列レイアウト（ブローカー削除） -->
                        <div style="display: flex; flex-direction: column; gap: 15px;">
                            <div class="input-group">
                                <label>損益（円）</label>
                                <input type="number" id="yenProfitLoss" step="1">
                            </div>
                            <div class="input-group">
                                <label>スワップ（円）</label>
                                <input type="number" id="yenSwap" step="1">
                            </div>
                            <div class="input-group">
                                <label>手数料（円）</label>
                                <input type="number" id="yenCommission" step="1">
                            </div>
                            <div class="input-group">
                                <label>実損益（円）</label>
                                <input type="number" id="yenNetProfit" readonly style="background: #2a2a2a; font-weight: bold;">
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="yenModalCancel">キャンセル</button>
                        <button class="btn btn-primary" id="yenModalSave">保存</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.#modal = document.getElementById('yenProfitLossModal');
    }
    
    #setupEventListeners() {
        document.getElementById('yenModalClose').addEventListener('click', () => this.close());
        document.getElementById('yenModalCancel').addEventListener('click', () => this.close());
        document.getElementById('yenModalSave').addEventListener('click', () => this.save());
        
        const inputs = ['yenProfitLoss', 'yenSwap', 'yenCommission'];
        inputs.forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.#calculateNetProfit());
        });
        
        // ✅ モーダル外クリックを無効化
        // this.#modal.onclick = (event) => {
        //     if (event.target === this.#modal) {
        //         this.close();
        //     }
        // };
        
        this.#eventBus.on('yenProfitLoss:edit', data => this.edit(data.tradeId));
    }
    
    #calculateNetProfit() {
        const profit = parseFloat(document.getElementById('yenProfitLoss').value) || 0;
        const swap = parseFloat(document.getElementById('yenSwap').value) || 0;
        const commission = parseFloat(document.getElementById('yenCommission').value) || 0;
        const netProfit = profit + swap + commission;
        
        const netProfitInput = document.getElementById('yenNetProfit');
        netProfitInput.value = netProfit;
        netProfitInput.style.color = netProfit >= 0 ? '#4ade80' : '#f87171';
    }
    
    #bindGlobalFunctions() {
        window.editYenProfitLoss = (tradeId) => this.edit(tradeId);
        window.addYenProfitLoss = (tradeId) => this.edit(tradeId);
        window.closeYenProfitLossModal = () => this.close();
    }
    
    edit(tradeId) {
        const trade = this.#tradeManager.getTradeById(tradeId);
        if (!trade) return;
        
        this.#currentTradeId = tradeId;
        
        const tradeInfo = document.getElementById('yenModalTradeInfo');
        tradeInfo.innerHTML = `
            <p><strong>${trade.pair} ${trade.direction === 'long' ? 'LONG' : 'SHORT'}</strong></p>
            <p>エントリー: ${this.#formatDate(trade.entryTime || trade.date)}</p>
        `;
        
        const yenData = trade.yenProfitLoss || {};
        document.getElementById('yenProfitLoss').value = yenData.profitLoss || 0;
        document.getElementById('yenSwap').value = yenData.swap || 0;
        document.getElementById('yenCommission').value = yenData.commission || 0;
        document.getElementById('yenNetProfit').value = yenData.netProfit || 0;
        
        this.#calculateNetProfit();
        this.#modal.style.display = 'flex';
    }
    
    save() {
        if (!this.#currentTradeId) return;
        
        const data = {
            profitLoss: parseFloat(document.getElementById('yenProfitLoss').value) || 0,
            swap: parseFloat(document.getElementById('yenSwap').value) || 0,
            commission: parseFloat(document.getElementById('yenCommission').value) || 0,
            netProfit: parseFloat(document.getElementById('yenNetProfit').value) || 0
        };
        
        this.#manager.setYenProfitLoss(this.#currentTradeId, data);
        
        const trade = this.#tradeManager.getTradeById(this.#currentTradeId);
        trade.yenProfitLoss = data;
        this.#tradeManager.updateTrade(this.#currentTradeId, trade);
        
        this.#eventBus.emit('yenProfitLoss:updated', {
            tradeId: this.#currentTradeId,
            data
        });
        
        this.#refreshDisplays();
        this.close();
        this.#showToast('円建て損益を保存しました', 'success');
    }
    
    close() {
        if (this.#modal) {
            this.#modal.style.display = 'none';
        }
        this.#currentTradeId = null;
    }
    
    #refreshDisplays() {
        if (window.showTradeDetail && this.#currentTradeId) {
            const detailModal = document.getElementById('tradeDetailModal');
            if (detailModal && detailModal.style.display === 'flex') {
                window.showTradeDetail(this.#currentTradeId);
            }
        }
        
        if (window.displayAllTrades) {
            window.displayAllTrades();
        }
        
        if (window.updateQuickStats) {
            window.updateQuickStats();
        }
    }
    
    #formatDate(date) {
        if (!date) return '-';
        const d = new Date(date);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    }
    
    #showToast(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
        }
    }
    
    getStatus() {
        return {
            modalExists: !!this.#modal,
            currentTradeId: this.#currentTradeId,
            managerConnected: !!this.#manager,
            eventBusConnected: !!this.#eventBus
        };
    }
}

// ファイルの最後（クラス定義の後）

// 初期化（script.jsの後に実行されるように遅延）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            window.yenProfitLossModal = new YenProfitLossModalModule();
            // script.jsの古い関数を上書き
            window.editYenProfitLoss = (tradeId) => window.yenProfitLossModal.edit(tradeId);
            window.addYenProfitLoss = (tradeId) => window.yenProfitLossModal.edit(tradeId);
            window.closeYenProfitLossModal = () => window.yenProfitLossModal.close();
            console.log('YenProfitLossModalModule: 初期化完了');
        }, 100);
    });
} else {
    setTimeout(() => {
        window.yenProfitLossModal = new YenProfitLossModalModule();
        window.editYenProfitLoss = (tradeId) => window.yenProfitLossModal.edit(tradeId);
        window.addYenProfitLoss = (tradeId) => window.yenProfitLossModal.edit(tradeId);
        window.closeYenProfitLossModal = () => window.yenProfitLossModal.close();
        console.log('YenProfitLossModalModule: 初期化完了');
    }, 100);
}