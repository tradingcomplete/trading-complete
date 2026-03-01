/**
 * TradeList.js - トレード一覧表示モジュール
 * Trading Complete Part 2 モジュール化
 * 元の実装を正確に再現
 */

console.log('TradeList.js loading...');

class TradeList {
    /**
     * コンストラクタ
     * @param {Object} tradeManager - TradeManagerインスタンス
     */
    constructor(tradeManager) {
        this.tradeManager = tradeManager;
        
        // ページネーション設定
        this.currentPage = 1;
        this.itemsPerPage = 10;
        
        // フィルタ設定
        this.filters = {
            pair: '',
            status: '',
            dateFrom: '',
            dateTo: '',
            profitType: '' // profit, loss, all
        };
        
        // ソート設定
        this.sortOrder = 'desc';
        this.sortBy = 'entryDate';
        
        // キャッシュ
        this.filteredTrades = [];
        this.displayedTrades = [];
    }

    /**
     * 初期化処理
     */
    initialize() {
        console.log('TradeList module initialized');
        this.setupEventListeners();
        this.loadSettings();
    }

    /**
     * イベントリスナーの設定
     */
    setupEventListeners() {
        // フィルタ関連のイベントリスナー設定
        // ページネーション関連のイベントリスナー設定
        // ソート関連のイベントリスナー設定
    }

    /**
     * 設定の読み込み
     */
    loadSettings() {
        // LocalStorageから表示設定を読み込み
        const settings = localStorage.getItem('tradeListSettings');
        if (settings) {
            const parsed = JSON.parse(settings);
            this.itemsPerPage = parsed.itemsPerPage || 10;
            this.sortBy = parsed.sortBy || 'entryDate';
            this.sortOrder = parsed.sortOrder || 'desc';
        }
    }

    /**
     * 設定の保存
     */
    saveSettings() {
        const settings = {
            itemsPerPage: this.itemsPerPage,
            sortBy: this.sortBy,
            sortOrder: this.sortOrder
        };
        localStorage.setItem('tradeListSettings', JSON.stringify(settings));
    }

    /**
     * トレードデータの取得
     * @returns {Array} トレードデータ配列
     */
    getAllTrades() {
        // TradeManagerから取得、またはグローバル変数から取得
        if (this.tradeManager && typeof this.tradeManager.getAllTrades === 'function') {
            return this.tradeManager.getAllTrades();
        }
        
        // window.tradesから取得
        if (window.trades && Array.isArray(window.trades)) {
            return window.trades;
        }
        
        // フォールバック：localStorageから直接取得
        const trades = localStorage.getItem('trades');
        return trades ? JSON.parse(trades) : [];
    }

    /**
     * メイン表示メソッド（元の実装を再現）
     * @param {string} containerId - 表示先のコンテナID
     */
    displayAllTrades(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // トレードデータを取得して日付でソート（新しい順）
        const sortedTrades = [...this.getAllTrades()].sort((a, b) => {
            const dateA = new Date(a.entryTime || a.entryDatetime || a.date);
            const dateB = new Date(b.entryTime || b.entryDatetime || b.date);
            return dateB - dateA; // 新しい順（降順）
        });
        const maxDisplay = 50; // 初期表示を50件に制限
        const displayTrades = sortedTrades.slice(0, maxDisplay);
        
        // TradeListRendererを使用
        if (window.TradeListRenderer) {
            window.TradeListRenderer.render(displayTrades, container, true);
        } else {
            // フォールバック
            container.innerHTML = '';
            displayTrades.forEach(trade => {
                container.appendChild(this.createTradeCard(trade, true));
            });
        }
        
        // 残りがある場合は「さらに表示」ボタンを追加
        if (sortedTrades.length > maxDisplay) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.className = 'btn btn-secondary';
            loadMoreBtn.style.width = '100%';
            loadMoreBtn.style.marginTop = '20px';
            loadMoreBtn.textContent = `さらに表示 (${sortedTrades.length - maxDisplay}件)`;
            loadMoreBtn.onclick = () => this.displayAllTradesComplete(containerId);
            container.appendChild(loadMoreBtn);
        }
        
        // フィルターオプションを更新
        this.updateFilterOptions();
    }

    /**
     * 完全版表示メソッド（全件表示）
     * @param {string} containerId - 表示先のコンテナID
     */
    displayAllTradesComplete(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // トレードデータを取得して日付でソート（新しい順）
        const sortedTrades = [...this.getAllTrades()].sort((a, b) => {
            const dateA = new Date(a.entryTime || a.entryDatetime || a.date);
            const dateB = new Date(b.entryTime || b.entryDatetime || b.date);
            return dateB - dateA; // 新しい順（降順）
        });
        
        if (window.TradeListRenderer) {
            window.TradeListRenderer.render(sortedTrades, container, true);
        } else {
            container.innerHTML = '';
            sortedTrades.forEach(trade => {
                container.appendChild(this.createTradeCard(trade, true));
            });
        }
    }

    /**
     * トレードカードの生成（元の実装を完全再現）
     * @param {Object} trade - トレードデータ
     * @param {boolean} showActions - アクションボタンを表示するか
     * @returns {HTMLElement} トレードカード要素
     */
    createTradeCard(trade, showActions = false) {
        // exitsの初期化
        if (!trade.exits) {
            trade.exits = [];
        }
        
        // pips計算
        let pips = 0;
        if (typeof window.calculateTradePips === 'function') {
            pips = window.calculateTradePips(trade);
        } else if (trade.exits && trade.exits.length > 0) {
            let totalPips = 0;
            trade.exits.forEach(exit => {
                if (exit.pips) totalPips += exit.pips;
            });
            pips = totalPips;
        }
        
        const isOpen = trade.exits.length === 0;
        
        // remainingLot計算
        let remainingLot = 0;
        if (typeof window.calculateRemainingLot === 'function') {
            const result = window.calculateRemainingLot(trade);
            remainingLot = typeof result === 'object' ? result.remaining : result;
        }
        
        // 結果表示の判定
        let resultClass, resultText;
        if (isOpen) {
            resultClass = 'open-position';
            resultText = '保有中';
        } else {
            resultClass = pips > 0 ? 'profit' : (pips < 0 ? 'loss' : 'draw');
            resultText = `${pips >= 0 ? '+' : ''}${pips.toFixed(1)} Pips`;
        }
        
        const entryDate = new Date(trade.entryTime || trade.entryDatetime || trade.date || new Date());
        
        const card = document.createElement('div');
        card.className = 'trade-card';
        card.style.position = 'relative';
        card.style.background = '#1e1e23';
        card.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        card.style.borderRadius = '12px';
        card.style.marginBottom = '15px';
        card.style.padding = '20px';
        card.style.transition = 'all 0.3s ease';
        card.style.cursor = 'pointer';
        
        card.onmouseenter = function() {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
        };
        card.onmouseleave = function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        };
        
        card.onclick = (e) => {
            if (!e.target.classList.contains('btn')) {
                if (typeof window.showTradeDetail === 'function') {
                    window.showTradeDetail(trade);
                }
            }
        };
        
        // 未決済ロット表示バッジ
        if (remainingLot > 0) {
            const badge = document.createElement('div');
            badge.className = 'remaining-lot-badge';
            // remainingLotは既に数値なのでtoFixedが安全に使える
            badge.textContent = `未決済: ${remainingLot.toFixed(1)}Lot`;
            badge.style.cssText = 'position: absolute; top: 10px; right: 10px; background: rgba(255, 193, 7, 0.2); color: #ffd700; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; z-index: 10;';
            card.appendChild(badge);
        }
        
        // ヘッダー部分
        const header = document.createElement('div');
        header.className = 'trade-header';
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';
        
        const headerLeft = document.createElement('div');
        headerLeft.className = 'trade-header-left';
        headerLeft.style.cssText = 'display: flex; align-items: center; gap: 15px;';
        
        // アイコン画像（円形・大きめ）
        if (trade.chartImage) {
            const img = document.createElement('img');
            img.src = trade.chartImage;
            img.className = 'trade-image';
            img.alt = 'アイコン';
            img.loading = 'lazy';
            img.style.cssText = 'width: 110px; height: 110px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.15);';
            img.onerror = function() {
                // エラー時は画像を非表示にして、デフォルトアイコンも表示しない
                this.style.display = 'none';
            };
            img.onclick = (e) => {
                e.stopPropagation();
                if (typeof window.showImageModal === 'function') window.showImageModal(img.src);
            };
            headerLeft.appendChild(img);
        }
        // chartImageがない場合はアイコンを表示しない
        
        // 通貨ペアとポジション
        const pairContainer = document.createElement('div');
        pairContainer.style.cssText = 'display: flex; align-items: center; flex-wrap: wrap; gap: 6px;';
        const pairSpan = document.createElement('span');
        pairSpan.className = 'trade-pair';
        pairSpan.textContent = trade.pair || trade.symbol || 'N/A';
        pairSpan.style.cssText = 'font-size: 1.5rem; font-weight: bold; color: white;';
        
        const directionBadge = document.createElement('span');
        const isLong = trade.direction === 'long' || trade.direction === 'BUY';
        directionBadge.className = `direction-badge ${isLong ? 'long' : 'short'}`;
        directionBadge.textContent = isLong ? 'LONG' : 'SHORT';
        directionBadge.style.cssText = `
            padding: 5px 12px;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: bold;
            background: ${isLong ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)'};
            color: ${isLong ? '#4caf50' : '#f44336'};
            border: 1px solid ${isLong ? '#4caf50' : '#f44336'};
        `;
        
        pairContainer.appendChild(pairSpan);
        pairContainer.appendChild(directionBadge);
        
        // セッションバッジを追加（常時表示）
        if (trade.entryTime && typeof window.getTradeSession === 'function') {
            const sessionKey = window.getTradeSession(new Date(trade.entryTime));
            if (sessionKey) {
                const sessionBadge = document.createElement('span');
                sessionBadge.className = 'session-badge';
                
                const sessionConfig = {
                    tokyo:   { text: '東京',       bg: 'rgba(255, 152, 0, 0.15)',  color: '#ffb74d', border: 'rgba(255, 152, 0, 0.3)' },
                    london:  { text: 'ロンドン',    bg: 'rgba(33, 150, 243, 0.15)', color: '#42a5f5', border: 'rgba(33, 150, 243, 0.3)' },
                    ny:      { text: 'NY',          bg: 'rgba(76, 175, 80, 0.15)',  color: '#66bb6a', border: 'rgba(76, 175, 80, 0.3)' },
                    oceania: { text: 'オセアニア',   bg: 'rgba(0, 188, 212, 0.15)',  color: '#4dd0e1', border: 'rgba(0, 188, 212, 0.3)' }
                };
                
                const cfg = sessionConfig[sessionKey] || sessionConfig.tokyo;
                sessionBadge.textContent = cfg.text;
                sessionBadge.title = window.getSessionDisplayName ? window.getSessionDisplayName(sessionKey) : cfg.text;
                sessionBadge.style.cssText = `
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 500;
                    background: ${cfg.bg};
                    color: ${cfg.color};
                    border: 1px solid ${cfg.border};
                `;
                pairContainer.appendChild(sessionBadge);
            }
        }
        
        // ブローカーバッジを追加（設定がONの場合のみ）
        const showBrokerBadge = typeof getShowBrokerBadge === 'function' ? getShowBrokerBadge() : true;
        if (trade.broker && showBrokerBadge) {
            const brokerBadge = document.createElement('span');
            brokerBadge.className = 'broker-badge';
            brokerBadge.textContent = trade.broker;
            brokerBadge.style.cssText = `
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 0.75rem;
                font-weight: 500;
                background: rgba(156, 39, 176, 0.15);
                color: #ce93d8;
                border: 1px solid rgba(156, 39, 176, 0.3);
            `;
            pairContainer.appendChild(brokerBadge);
        }
        
        // 手法バッジを追加（タスク22）
        if (trade.methodId && window.SettingsModule) {
            const method = window.SettingsModule.getMethodById(trade.methodId);
            if (method && !method.deletedAt) {
                const methodBadge = document.createElement('span');
                methodBadge.className = 'method-badge';
                methodBadge.textContent = method.shortName || method.name;
                methodBadge.title = method.name;
                methodBadge.style.cssText = `
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 500;
                    background: rgba(33, 150, 243, 0.15);
                    color: #64b5f6;
                    border: 1px solid rgba(33, 150, 243, 0.3);
                `;
                pairContainer.appendChild(methodBadge);
            }
        }
        
        // 許容損失バッジを追加（タスク23）
        if (trade.riskStatus) {
            const riskBadge = document.createElement('span');
            riskBadge.className = 'risk-badge';
            let riskText, riskBg, riskBorder;
            
            switch (trade.riskStatus) {
                case 'normal':
                    riskText = '✅';
                    riskBg = 'rgba(76, 175, 80, 0.15)';
                    riskBorder = 'rgba(76, 175, 80, 0.3)';
                    break;
                case 'warning':
                    riskText = '⚠️';
                    riskBg = 'rgba(255, 152, 0, 0.15)';
                    riskBorder = 'rgba(255, 152, 0, 0.3)';
                    break;
                case 'danger':
                    riskText = '🚨';
                    riskBg = 'rgba(244, 67, 54, 0.15)';
                    riskBorder = 'rgba(244, 67, 54, 0.3)';
                    break;
                default:
                    riskText = '';
            }
            
            if (riskText) {
                riskBadge.textContent = riskText;
                riskBadge.title = trade.riskStatus === 'normal' ? '許容損失内' : 
                                  trade.riskStatus === 'warning' ? '許容損失の1.5倍以内' : '許容損失超過';
                riskBadge.style.cssText = `
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 0.85rem;
                    background: ${riskBg};
                    border: 1px solid ${riskBorder};
                `;
                pairContainer.appendChild(riskBadge);
            }
        }
        
        // ルール遵守バッジを追加（タスク24）
        const reflectionObj = typeof trade.reflection === 'object' ? trade.reflection : null;
        if (reflectionObj && reflectionObj.ruleFollowed) {
            const ruleBadge = document.createElement('span');
            ruleBadge.className = 'rule-badge';
            const isFollowed = reflectionObj.ruleFollowed === 'yes';
            ruleBadge.textContent = isFollowed ? '⭕' : '❌';
            ruleBadge.title = isFollowed ? 'ルール遵守' : 'ルール違反';
            ruleBadge.style.cssText = `
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.85rem;
                background: ${isFollowed ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)'};
                border: 1px solid ${isFollowed ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'};
            `;
            pairContainer.appendChild(ruleBadge);
        }
        
        headerLeft.appendChild(pairContainer);
        
        // 右上（結果バッジと編集・削除ボタン）
        const headerRight = document.createElement('div');
        headerRight.style.cssText = 'display: flex; align-items: center; gap: 12px;';
        
        // 結果バッジ（参照用に先に定義）
        let resultDiv = null;
        
        // 決済・削除ボタン（ホバー時に表示、左側に配置）
        if (showActions) {
            let exitBtn = null;
            
            // 保有中または未決済ロットがある場合のみ決済ボタンを表示
            if (isOpen || remainingLot > 0) {
                exitBtn = document.createElement('button');
                exitBtn.className = 'btn btn-small exit-btn';
                exitBtn.textContent = '決済';
                exitBtn.style.cssText = `
                    padding: 6px 14px;
                    background: transparent;
                    color: rgba(33, 150, 243, 0.9);
                    border: 1px solid rgba(33, 150, 243, 0.4);
                    border-radius: 6px;
                    font-size: 0.85rem;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    opacity: 0;
                    visibility: hidden;
                `;
                exitBtn.onmouseenter = function(e) {
                    e.stopPropagation();
                    this.style.background = 'rgba(33, 150, 243, 0.15)';
                    this.style.color = '#42a5f5';
                };
                exitBtn.onmouseleave = function(e) {
                    e.stopPropagation();
                    this.style.background = 'transparent';
                    this.style.color = 'rgba(33, 150, 243, 0.9)';
                };
                exitBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (typeof window.openExitModal === 'function') {
                        window.openExitModal(trade.id);
                    }
                };
                headerRight.appendChild(exitBtn);
            }
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-small delete-btn';
            deleteBtn.textContent = '削除';
            deleteBtn.style.cssText = `
                padding: 6px 14px;
                background: transparent;
                color: rgba(244,67,54,0.9);
                border: 1px solid rgba(244,67,54,0.4);
                border-radius: 6px;
                font-size: 0.85rem;
                cursor: pointer;
                transition: all 0.3s ease;
                opacity: 0;
                visibility: hidden;
            `;
            deleteBtn.onmouseenter = function(e) {
                e.stopPropagation();
                this.style.background = 'rgba(244,67,54,0.15)';
                this.style.color = '#ff5252';
            };
            deleteBtn.onmouseleave = function(e) {
                e.stopPropagation();
                this.style.background = 'transparent';
                this.style.color = 'rgba(244,67,54,0.9)';
            };
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (typeof window.deleteTrade === 'function') window.deleteTrade(trade.id);
            };
            
            // ボタンを左側に配置
            headerRight.appendChild(deleteBtn);
            
            // カードホバー時にボタンを表示し、バッジを半透明に
            card.addEventListener('mouseenter', function() {
                // 決済ボタンを表示（存在する場合）
                if (exitBtn) {
                    exitBtn.style.opacity = '1';
                    exitBtn.style.visibility = 'visible';
                }
                // 削除ボタンを表示
                deleteBtn.style.opacity = '1';
                deleteBtn.style.visibility = 'visible';
                // バッジを半透明にする
                if (resultDiv) {
                    resultDiv.style.opacity = '0.4';
                }
            });
            
            card.addEventListener('mouseleave', function() {
                // 決済ボタンを非表示（存在する場合）
                if (exitBtn) {
                    exitBtn.style.opacity = '0';
                    exitBtn.style.visibility = 'hidden';
                }
                // 削除ボタンを非表示
                deleteBtn.style.opacity = '0';
                deleteBtn.style.visibility = 'hidden';
                // バッジを通常表示に戻す
                if (resultDiv) {
                    resultDiv.style.opacity = '1';
                }
            });
        }
        
        // 結果バッジ（保有中・Pips）を最後に追加（右端に配置）
        resultDiv = document.createElement('div');
        resultDiv.className = `trade-result ${resultClass}`;
        resultDiv.textContent = resultText;
        
        // スタイル設定
        if (isOpen) {
            resultDiv.style.cssText = 'background: rgba(33, 150, 243, 0.25); color: #2196f3; padding: 8px 18px; border-radius: 8px; font-weight: 700; font-size: 1.05rem; border: 1px solid rgba(33, 150, 243, 0.4); transition: opacity 0.3s ease; margin-left: auto;';
        } else if (pips > 0) {
            resultDiv.style.cssText = 'background: rgba(76, 175, 80, 0.25); color: #4caf50; padding: 8px 18px; border-radius: 8px; font-weight: 700; font-size: 1.05rem; border: 1px solid rgba(76, 175, 80, 0.4); transition: opacity 0.3s ease; margin-left: auto;';
        } else {
            resultDiv.style.cssText = 'background: rgba(244, 67, 54, 0.25); color: #f44336; padding: 8px 18px; border-radius: 8px; font-weight: 700; font-size: 1.05rem; border: 1px solid rgba(244, 67, 54, 0.4); transition: opacity 0.3s ease; margin-left: auto;';
        }
        
        headerRight.appendChild(resultDiv);
        
        header.appendChild(headerLeft);
        header.appendChild(headerRight);
        
        card.appendChild(header);
        
        // サブタイトル（エントリー・クローズ日時、保有期間）
        const subtitle = document.createElement('div');
        subtitle.className = 'trade-subtitle';
        subtitle.style.cssText = 'color: rgba(255,255,255,0.6); font-size: 0.95rem; margin-bottom: 16px; line-height: 1.5;';
        
        // ロット数を取得（型変換を追加）
        const safeLotSize = parseFloat(trade.lotSize) || parseFloat(trade.lot) || 0;
        
        // エントリー行
        const entryLine = `Entry: ${typeof window.formatDateTimeForDisplay === 'function' ? 
            window.formatDateTimeForDisplay(trade.entryTime || trade.entryDatetime || trade.date) : entryDate.toLocaleString('ja-JP')}`;
        
        // クローズ時刻の表示（決済済みの場合）
        if (!isOpen && trade.exits && trade.exits.length > 0) {
            const lastExit = trade.exits[trade.exits.length - 1];
            if (lastExit && lastExit.time) {
                const exitDate = new Date(lastExit.time);
                
                // 保有時間計算
                const duration = exitDate - entryDate;
                const days = Math.floor(duration / (1000 * 60 * 60 * 24));
                const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const durationText = days > 0 ? `${days}D ${hours}H` : `${hours}H`;
                
                const exitLine = `Exit: ${typeof window.formatDateTimeForDisplay === 'function' ? 
                    window.formatDateTimeForDisplay(exitDate) : exitDate.toLocaleString('ja-JP')} (${durationText}) ${safeLotSize.toFixed(1)}Lot`;
                
                // 2行で表示
                subtitle.innerHTML = `<div>${entryLine}</div><div>${exitLine}</div>`;
            }
        } else {
            // 保有中の場合は1行のみ
            subtitle.innerHTML = `<div>${entryLine}</div><div style="color: rgba(255,255,255,0.5);">${safeLotSize.toFixed(1)}Lot</div>`;
        }
        
        card.appendChild(subtitle);
        
        // 損益情報セクション（決済済みの場合）
        if (!isOpen) {
            // 円建て損益がない場合の警告表示
            if (!trade.yenProfitLoss || (!trade.yenProfitLoss.profitLoss && !trade.yenProfitLoss.netProfit)) {
                const warningDiv = document.createElement('div');
                warningDiv.style.cssText = `
                    background: rgba(251, 191, 36, 0.1);
                    border: 1px solid rgba(251, 191, 36, 0.3);
                    color: #fbbf24;
                    padding: 8px 12px;
                    margin: 12px 16px;
                    border-radius: 6px;
                    font-size: 0.9rem;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                warningDiv.innerHTML = `
                    <span style="font-size: 1.1rem;">⚠️</span>
                    <span>円建て損益が未入力です</span>
                `;
                card.appendChild(warningDiv);
            } else {
                const profitSection = document.createElement('div');
                profitSection.style.cssText = 'margin-bottom: 16px;';
                
                // 損益行（ブローカーバッジ付き）
                const plRow = document.createElement('div');
                plRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 1rem;';
                
                const plLeft = document.createElement('div');
                plLeft.style.cssText = 'display: flex; align-items: center; gap: 8px;';
                
                const plLabel = document.createElement('span');
                plLabel.className = 'yen-label';
                plLabel.textContent = '損益:';
                plLeft.appendChild(plLabel);
                
                const plValue = document.createElement('span');
                const yenPL = trade.yenProfitLoss ? (trade.yenProfitLoss.profitLoss || 0) : 0;
                plValue.className = yenPL >= 0 ? 'yen-value positive' : 'yen-value negative';
                plValue.textContent = `¥${yenPL.toLocaleString('ja-JP')}`;
                
                plRow.appendChild(plLeft);
                plRow.appendChild(plValue);
                profitSection.appendChild(plRow);
                
                // スワップ（値がある場合のみ）
                const swapValue = trade.yenProfitLoss ? (trade.yenProfitLoss.swap || 0) : 0;
                if (swapValue !== 0) {
                    const swapRow = document.createElement('div');
                    swapRow.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 1rem;';
                    swapRow.innerHTML = `
                        <span class="yen-label">スワップ:</span>
                        <span class="yen-value swap">¥${swapValue.toLocaleString('ja-JP')}</span>
                    `;
                    profitSection.appendChild(swapRow);
                }
                
                // 純損益（損益＋スワップ－手数料）
                const netPL = trade.yenProfitLoss ? 
                    (trade.yenProfitLoss.netProfit || 0) : 0;
                
                const netRow = document.createElement('div');
                netRow.className = 'net-profit-row';
                netRow.innerHTML = `
                    <span class="yen-label">純損益:</span>
                    <span class="yen-value ${netPL >= 0 ? 'positive' : 'negative'}">¥${netPL.toLocaleString('ja-JP')}</span>
                `;
                profitSection.appendChild(netRow);
                
                card.appendChild(profitSection);
            }
        }
        
        // チャート画像と振り返りの横並び表示
        const hasImages = (trade.chartImages && trade.chartImages.length > 0) || trade.tradeChartImage;
        // reflection互換性: 文字列またはオブジェクト両方に対応
        const reflectionText = typeof trade.reflection === 'string' 
            ? trade.reflection 
            : (trade.reflection?.text || '');
        const hasReflection = reflectionText && reflectionText.trim();
        
        if (hasImages || hasReflection) {
            const contentRow = document.createElement('div');
            contentRow.className = 'trade-content-row';
            contentRow.style.cssText = 'display: flex; gap: 16px; margin-top: 16px;';
            
            // 画像セクション（左側）
            if (hasImages) {
                const imagesSection = document.createElement('div');
                imagesSection.className = 'trade-images-section';
                imagesSection.style.cssText = 'display: flex; gap: 10px;';
                
                if (trade.chartImages && trade.chartImages.length > 0) {
                    // 新形式（複数画像）
                    trade.chartImages.slice(0, 3).forEach(img => {
                        if (img) {
                            // ラッパーdivを作成（画像+題名）
                            const wrapper = document.createElement('div');
                            wrapper.className = 'trade-image-wrapper';
                            wrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center;';
                            
                            const imgEl = document.createElement('img');
                            // まず同期的に取得（即座に表示）
                            let imgSrc = window.getImageSrc ? window.getImageSrc(img) : (typeof img === 'string' ? img : (img && img.url ? img.url : null));
                            if (!imgSrc) return;
                            imgEl.src = imgSrc;
                            imgEl.className = 'trade-chart-thumb';
                            imgEl.alt = 'チャート';
                            imgEl.loading = 'lazy';
                            imgEl.style.cssText = 'width: 160px; height: 120px; border-radius: 8px; object-fit: cover; cursor: pointer;';
                            
                            // 署名付きURL期限切れの場合は非同期で更新
                            if (window.isUrlExpired && window.isUrlExpired(img)) {
                                (async () => {
                                    try {
                                        const validSrc = await window.getValidImageSrc(img);
                                        if (validSrc) {
                                            imgEl.src = validSrc;
                                            imgSrc = validSrc; // クリック用にも更新
                                        }
                                    } catch (e) {
                                        console.warn('[TradeList] 画像URL更新失敗:', e);
                                    }
                                })();
                            }
                            
                            imgEl.onerror = function() {
                                this.parentElement.style.display = 'none';
                            };
                            
                            // 画像データをクロージャでキャプチャ（題名・説明用）
                            const capturedImgData = img;
                            const capturedTradeId = trade.id;
                            const capturedIndex = trade.chartImages.indexOf(img);
                            imgEl.onclick = (e) => {
                                e.stopPropagation();
                                // 題名・説明付きモーダルを使用（コンテキスト付き）
                                if (typeof window.showImageModalWithCaption === 'function') {
                                    window.showImageModalWithCaption(capturedImgData, {
                                        type: 'trade',
                                        id: capturedTradeId,
                                        index: capturedIndex
                                    });
                                } else if (typeof window.showImageModal === 'function') {
                                    window.showImageModal(imgEl.src);
                                }
                            };
                            
                            wrapper.appendChild(imgEl);
                            
                            // 題名を表示
                            const imgTitle = window.getImageTitle ? window.getImageTitle(img) : (img.title || '');
                            if (imgTitle) {
                                const titleEl = document.createElement('div');
                                titleEl.className = 'trade-image-title';
                                titleEl.textContent = imgTitle;
                                titleEl.style.cssText = 'font-size: 11px; color: #7a8599; text-align: center; margin-top: 4px; max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
                                wrapper.appendChild(titleEl);
                            }
                            
                            imagesSection.appendChild(wrapper);
                        }
                    });
                } else if (trade.tradeChartImage) {
                    // 旧形式（単一画像）の互換性維持
                    const imgEl = document.createElement('img');
                    imgEl.src = trade.tradeChartImage;
                    imgEl.className = 'trade-chart-thumb';
                    imgEl.alt = 'チャート';
                    imgEl.loading = 'lazy';
                    imgEl.style.cssText = 'width: 160px; height: 120px; border-radius: 8px; object-fit: cover; cursor: pointer;';
                    
                    imgEl.onerror = function() {
                        this.style.display = 'none';
                    };
                    
                    imgEl.onclick = (e) => {
                        e.stopPropagation();
                        if (typeof window.showImageModal === 'function') window.showImageModal(trade.tradeChartImage);
                    };
                    imagesSection.appendChild(imgEl);
                }
                
                contentRow.appendChild(imagesSection);
            }
            
            // 振り返りセクション（右側）
            if (hasReflection) {
                const reflectionSection = document.createElement('div');
                reflectionSection.className = 'trade-reflection-section';
                reflectionSection.style.cssText = 'flex: 1; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);';
                
                const header = document.createElement('div');
                header.className = 'reflection-header';
                header.innerHTML = '📝 振り返り:';
                header.style.cssText = 'color: rgba(255,255,255,0.7); font-size: 0.9rem; margin-bottom: 8px; font-weight: 500;';
                
                const text = document.createElement('div');
                text.className = 'reflection-text';
                text.style.cssText = 'color: rgba(255,255,255,0.9); font-size: 0.95rem; line-height: 1.5;';
                
                const lines = reflectionText.split('\n');
                const displayLines = lines.slice(0, 3);
                
                // 3行目が長い場合は省略
                if (lines.length > 3) {
                    const lastLine = displayLines[2];
                    if (lastLine && lastLine.length > 40) {
                        displayLines[2] = lastLine.substring(0, 40) + '...';
                    } else if (lastLine) {
                        displayLines[2] = lastLine + '...';
                    }
                } else if (displayLines.length > 0) {
                    const lastIndex = displayLines.length - 1;
                    if (displayLines[lastIndex] && displayLines[lastIndex].length > 40) {
                        displayLines[lastIndex] = displayLines[lastIndex].substring(0, 40) + '...';
                    }
                }
                
                // HTMLエスケープ処理
                const escapedLines = displayLines.map(line => {
                    const div = document.createElement('div');
                    div.textContent = line;
                    return div.innerHTML;
                });
                text.innerHTML = escapedLines.join('<br>');
                
                reflectionSection.appendChild(header);
                reflectionSection.appendChild(text);
                contentRow.appendChild(reflectionSection);
            }
            
            card.appendChild(contentRow);
        }
        
        return card;
    }

    /**
     * フィルターオプションの更新（元の実装を再現）
     */
    updateFilterOptions() {
        const trades = this.getAllTrades();
        
        // 年フィルター
        const yearFilter = document.getElementById('yearFilter');
        if (yearFilter) {
            const years = [...new Set(trades.map(t => new Date(t.entryTime || t.entryDatetime || t.date).getFullYear()))].sort((a, b) => b - a);
            yearFilter.innerHTML = '<option value="">全て</option>';
            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = `${year}年`;
                yearFilter.appendChild(option);
            });
        }
        
        // ペアフィルター
        const pairFilter = document.getElementById('pairFilter');
        if (pairFilter) {
            const pairs = [...new Set(trades.map(t => t.pair).filter(p => p))].sort();
            pairFilter.innerHTML = '<option value="">全て</option>';
            pairs.forEach(pair => {
                const option = document.createElement('option');
                option.value = pair;
                option.textContent = pair;
                pairFilter.appendChild(option);
            });
        }
    }

    /**
     * フィルタートレード（元の実装を再現）
     */
    filterTrades() {
        const periodFilter = document.getElementById('periodFilter')?.value || 'all';
        const yearFilter = document.getElementById('yearFilter')?.value || '';
        const monthFilter = document.getElementById('monthFilter')?.value || '';
        const pairFilter = document.getElementById('pairFilter')?.value || '';
        const statusFilter = document.getElementById('statusFilter')?.value || '';
        
        let filteredTrades = [...this.getAllTrades()];
        
        // 年フィルター
        if (yearFilter) {
            filteredTrades = filteredTrades.filter(t => {
                return new Date(t.entryTime || t.entryDatetime || t.date).getFullYear() == yearFilter;
            });
        }
        
        // 月フィルター
        if (monthFilter) {
            filteredTrades = filteredTrades.filter(t => {
                return new Date(t.entryTime || t.entryDatetime || t.date).getMonth() + 1 == monthFilter;
            });
        }
        
        // ペアフィルター
        if (pairFilter) {
            filteredTrades = filteredTrades.filter(t => t.pair === pairFilter);
        }
        
        // 手法フィルター（タスク26）
        const methodFilter = document.getElementById('methodFilter')?.value || '';
        if (methodFilter) {
            filteredTrades = filteredTrades.filter(t => t.methodId === methodFilter);
        }
        
        // セッションフィルター（DST自動判定対応）
        const sessionFilter = document.getElementById('sessionFilter')?.value || '';
        if (sessionFilter) {
            filteredTrades = filteredTrades.filter(t => {
                const entryDate = new Date(t.entryTime || t.entryDatetime || t.date);
                if (isNaN(entryDate.getTime())) return false;
                return window.getTradeSession(entryDate) === sessionFilter;
            });
        }
        
        // ステータスフィルター
        if (statusFilter) {
            if (statusFilter === 'active') {
                filteredTrades = filteredTrades.filter(t => !t.exits || t.exits.length === 0);
            } else if (statusFilter === 'closed') {
                filteredTrades = filteredTrades.filter(t => t.exits && t.exits.length > 0);
            }
        }
        
        // 表示
        const container = document.getElementById('tradeRecordsList');
        if (container) {
            // 日付でソート（新しい順）
            filteredTrades = filteredTrades.sort((a, b) => {
                const dateA = new Date(a.entryTime || a.entryDatetime || a.date);
                const dateB = new Date(b.entryTime || b.entryDatetime || b.date);
                return dateB - dateA; // 新しい順（降順）
            });
            if (window.TradeListRenderer) {
                window.TradeListRenderer.render(filteredTrades, container, true);
            } else {
                container.innerHTML = '';
                filteredTrades.forEach(trade => {
                    container.appendChild(this.createTradeCard(trade, true));
                });
            }
        }
    }

    /**
     * エラー表示
     * @param {string} message - エラーメッセージ
     */
    showError(message) {
        console.error(message);
        // UIにエラーメッセージを表示する処理
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}

// グローバルに公開（bridge.jsから参照可能にする）
window.TradeList = TradeList;
console.log('TradeList.js loaded, window.TradeList =', window.TradeList);