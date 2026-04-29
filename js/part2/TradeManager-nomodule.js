// js/part2/TradeManager-nomodule.js
// トレードデータの中央管理クラス(非モジュール版)

(function() {
    'use strict';
    
    // TradeManagerクラス定義
    class TradeManager {
        constructor() {
            // プライベート風のプロパティ(_で始める)
            this._trades = [];
            this._listeners = new Set();
            
            this._loadFromStorage();
            console.log('TradeManager初期化完了:', this._trades.length, '件のトレード');
        }
        
        // デフォルトのトレード構造を取得
        _getDefaultTradeStructure() {
            return {
                // 識別情報
                id: null,
                
                // 基本情報
                date: new Date().toISOString(),
                entryTime: null,  // ← 追加: SyncModule用
                pair: '',
                symbol: '',
                direction: 'long',
                broker: '',  // ← 追加(オプショナルフィールド)
                
                // 価格情報
                entryPrice: 0,
                exitPrice: null,
                stopLoss: 0,
                takeProfit: 0,
                
                // ロット情報
                lotSize: 1.0,
                lot: 1.0,
                
                // 円建て損益(必須初期化)
                yenProfitLoss: {
                    profitLoss: 0,
                    swap: 0,
                    commission: 0,
                    netProfit: 0
                },
                profitLoss: 0,
                swap: 0,
                commission: 0,
                netProfitLoss: 0,
                
                // 配列フィールド
                exits: [],
                chartImages: [],
                reasons: ['', '', ''],
                
                // テキストフィールド
                scenario: '',
                entryEmotion: { selection: '', memo: '' },
                reflection: '',
                
                // メタ情報
                entryMethod: 'manual',
                isBulkEntry: false,
                status: 'open',
                
                // タイムスタンプ
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }
        
        // データ正規化
        _normalizeTradeData(trade) {
            const defaultStructure = this._getDefaultTradeStructure();
            const normalized = { ...defaultStructure, ...trade };
            
            // エイリアスの処理
            normalized.symbol = trade.symbol || trade.pair || '';
            normalized.pair = trade.pair || trade.symbol || '';
            // 数値に変換して設定
            const lotValue = parseFloat(trade.lot || trade.lotSize) || 1.0;
            normalized.lot = lotValue;
            normalized.lotSize = lotValue;
            
            // entryTime の正規化（entryDatetime → entryTime）
            // TradeEntry.js は entryDatetime、SyncModule は entryTime を使用
            if (!normalized.entryTime && trade.entryDatetime) {
                normalized.entryTime = trade.entryDatetime;
            }
            
            // すべての数値フィールドを確実に数値型に変換
            const numericFields = [
                'lotSize', 'lot', 'entryPrice', 'exitPrice', 
                'stopLoss', 'takeProfit', 'profitLoss', 
                'swap', 'commission', 'netProfitLoss'
            ];
            
            numericFields.forEach(field => {
                if (normalized[field] !== null && normalized[field] !== undefined) {
                    normalized[field] = parseFloat(normalized[field]) || 0;
                }
            });
            
            // 円建て損益の正規化
            if (!normalized.yenProfitLoss || typeof normalized.yenProfitLoss !== 'object') {
                normalized.yenProfitLoss = {
                    profitLoss: normalized.profitLoss || 0,
                    swap: normalized.swap || 0,
                    commission: normalized.commission || 0,
                    netProfit: normalized.netProfitLoss || normalized.netProfit || 0
                };
            }
            
            // 配列フィールドの確認
            normalized.exits = Array.isArray(normalized.exits) ? normalized.exits : [];
            normalized.chartImages = Array.isArray(normalized.chartImages) ? normalized.chartImages : [];
            normalized.reasons = Array.isArray(normalized.reasons) ? normalized.reasons : ['', '', ''];
            
            // タイムスタンプ更新
            normalized.updatedAt = new Date().toISOString();
            
            return normalized;
        }
        
        // シングルトンパターン
        static getInstance() {
            if (!TradeManager._instance) {
                TradeManager._instance = new TradeManager();
            }
            return TradeManager._instance;
        }
        
        // トレード取得(読み取り専用)
        getAllTrades() {
            return [...this._trades];
        }
        
        // 計算ロジック検証_要件定義書 CRITICAL #7 対応（FIX-11）
        // 締め月チェック - 締め済み月のトレードは編集不可（Q4=B 解除機能あり）
        // forceUnlocked=true でバイパス可能（締め解除フロー用）
        _checkClosedGuard(trade, action, forceUnlocked) {
            if (forceUnlocked === true) return null;
            if (!window.ClosingManagerModule || typeof window.ClosingManagerModule.isTradeInClosedMonth !== 'function') {
                return null; // ClosingManager 未ロード時はガードなし
            }
            if (window.ClosingManagerModule.isTradeInClosedMonth(trade)) {
                const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
                const msg = `${exitDate.getFullYear()}年${exitDate.getMonth() + 1}月は締め済みです。\n編集するには先に締めを解除してください。`;
                console.warn(`[TradeManager] ${action}拒否（締め済み月）:`, trade.id, msg);
                if (typeof alert === 'function') {
                    try { alert('⚠ ' + msg); } catch (e) { /* alert使用不可環境 */ }
                }
                return msg;
            }
            return null;
        }

        // トレード追加(正規化付き)
        addTrade(trade, options = {}) {
            const normalizedTrade = this._normalizeTradeData(trade);
            normalizedTrade.id = normalizedTrade.id || String(Date.now() + '_' + Math.random().toString(36).substr(2, 9));

            // 締め月ガード（FIX-11）
            const blocked = this._checkClosedGuard(normalizedTrade, '追加', options.forceUnlocked);
            if (blocked) return null;

            this._trades.push(normalizedTrade);
            this._saveToStorage();
            this._notifyListeners('add', normalizedTrade);

            // Supabase同期（バックグラウンド）
            this._syncToCloud(normalizedTrade);

            return normalizedTrade;
        }

        // トレード更新(正規化付き)
        updateTrade(id, updates, options = {}) {
            const index = this._trades.findIndex(t => t.id === id);
            if (index === -1) return null;

            // 締め月ガード（FIX-11）- 編集前後どちらかが締め月なら拒否
            const before = this._trades[index];
            const after = this._normalizeTradeData({ ...before, ...updates });
            const blockedBefore = this._checkClosedGuard(before, '編集', options.forceUnlocked);
            if (blockedBefore) return null;
            const blockedAfter = this._checkClosedGuard(after, '編集', options.forceUnlocked);
            if (blockedAfter) return null;

            this._trades[index] = after;
            this._saveToStorage();
            this._notifyListeners('update', this._trades[index]);

            // Supabase同期（バックグラウンド）
            this._syncToCloud(this._trades[index]);

            return this._trades[index];
        }

        // トレード削除
        deleteTrade(id, options = {}) {
            const index = this._trades.findIndex(t => t.id === id);
            if (index === -1) return false;

            // 締め月ガード（FIX-11）
            const blocked = this._checkClosedGuard(this._trades[index], '削除', options.forceUnlocked);
            if (blocked) return false;

            const deleted = this._trades.splice(index, 1)[0];
            this._saveToStorage();
            this._notifyListeners('delete', deleted);

            // Supabase同期（バックグラウンド）
            this._deleteFromCloud(id);

            return true;
        }
        
        // 一括トレード追加
        bulkAddTrades(trades, options = {}) {
            if (!Array.isArray(trades)) {
                throw new Error('引数は配列である必要があります');
            }

            const addedTrades = [];
            const skippedTrades = [];
            trades.forEach(trade => {
                const normalizedTrade = this._normalizeTradeData(trade);
                normalizedTrade.id = normalizedTrade.id || String(Date.now() + '_' + Math.random().toString(36).substr(2, 9));

                // 締め月ガード（FIX-11）- alertは出さずスキップ集計のみ（一括処理用）
                if (options.forceUnlocked !== true && window.ClosingManagerModule?.isTradeInClosedMonth?.(normalizedTrade)) {
                    skippedTrades.push(normalizedTrade);
                    console.warn('[TradeManager] bulkAddTrades: 締め済み月のためスキップ', normalizedTrade.id);
                    return;
                }

                this._trades.push(normalizedTrade);
                addedTrades.push(normalizedTrade);
            });

            this._saveToStorage();
            this._notifyListeners('bulk-add', addedTrades);

            // Supabase同期（バックグラウンド・一括）
            this._bulkSyncToCloud(addedTrades);

            if (skippedTrades.length > 0) {
                console.warn(`[TradeManager] bulkAddTrades: ${skippedTrades.length}件スキップ（締め済み月）`);
            }

            return addedTrades;
        }
        
        // IDでトレード取得
        getTradeById(id) {
            return this._trades.find(t => t.id === id);
        }
        
        // 変更通知の購読
        subscribe(callback) {
            this._listeners.add(callback);
            return () => this._listeners.delete(callback);
        }
        
        // プライベートメソッド
        _notifyListeners(action, data) {
            this._listeners.forEach(callback => {
                try {
                    callback(action, data);
                } catch (error) {
                    console.error('リスナーエラー:', error);
                }
            });
        }
        
        _saveToStorage() {
            try {
                localStorage.setItem('trades', JSON.stringify(this._trades));
                
                // グローバルのtrades配列も更新(既存コードとの互換性)
                if (window.trades) {
                    window.trades = [...this._trades];
                }
            } catch (error) {
                console.error('保存エラー:', error);
            }
        }
        
        // ========== Supabase同期メソッド ==========
        
        /**
         * トレードをSupabaseに同期（バックグラウンド）
         * @param {Object} trade - 同期するトレード
         */
        _syncToCloud(trade) {
            // SyncModuleが初期化されていれば同期
            if (window.SyncModule?.isInitialized?.()) {
                window.SyncModule.saveTrade(trade)
                    .then(result => {
                        if (!result.success) {
                            console.warn('[TradeManager] クラウド同期失敗:', result.error);
                        }
                    })
                    .catch(err => {
                        console.warn('[TradeManager] クラウド同期エラー:', err);
                    });
            }
        }
        
        /**
         * トレードをSupabaseから削除（バックグラウンド）
         * @param {string} tradeId - 削除するトレードID
         */
        _deleteFromCloud(tradeId) {
            // SyncModuleが初期化されていれば削除
            if (window.SyncModule?.isInitialized?.()) {
                window.SyncModule.deleteTrade(tradeId)
                    .then(result => {
                        if (!result.success) {
                            console.warn('[TradeManager] クラウド削除失敗:', result.error);
                        }
                    })
                    .catch(err => {
                        console.warn('[TradeManager] クラウド削除エラー:', err);
                    });
            }
        }
        
        /**
         * 複数トレードをSupabaseに同期（バックグラウンド）
         * @param {Array} trades - 同期するトレード配列
         */
        _bulkSyncToCloud(trades) {
            // SyncModuleが初期化されていれば同期
            if (window.SyncModule?.isInitialized?.()) {
                trades.forEach(trade => {
                    this._syncToCloud(trade);
                });
            }
        }
        
        _loadFromStorage() {
            // StorageValidatorで安全に読み込み
            this._trades = StorageValidator.safeLoad(
                'trades',
                [],
                StorageValidator.isTradesFormat
            );
            
            // グローバルのtrades配列も更新
            if (!window.trades) {
                window.trades = [...this._trades];
            }
            
            console.log(`TradeManager: ${this._trades.length}件のトレードを読み込み`);
        }
        
        // 既存コードとの互換性メソッド
        syncWithGlobalTrades() {
            if (window.trades && Array.isArray(window.trades)) {
                this._trades = [...window.trades];
                this._saveToStorage();
                console.log('グローバルtradesと同期しました');
            }
        }
    }
    
    // グローバルに公開
    window.TradeManager = TradeManager;
    window.tradeManager = TradeManager.getInstance();
    
    // デバッグ用
    console.log('TradeManager モジュール初期化完了');
    const trades = window.tradeManager.getAllTrades();
    console.log(`既存トレード数: ${trades.length}`);
    
})();