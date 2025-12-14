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
                entryEmotion: '',
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
        
        // トレード追加(正規化付き)
        addTrade(trade) {
            const normalizedTrade = this._normalizeTradeData(trade);
            normalizedTrade.id = normalizedTrade.id || String(Date.now() + '_' + Math.random().toString(36).substr(2, 9));
            this._trades.push(normalizedTrade);
            this._saveToStorage();
            this._notifyListeners('add', normalizedTrade);
            return normalizedTrade;
        }
        
        // トレード更新(正規化付き)
        updateTrade(id, updates) {
            const index = this._trades.findIndex(t => t.id === id);
            if (index === -1) return null;
            
            const normalizedUpdates = this._normalizeTradeData({ ...this._trades[index], ...updates });
            this._trades[index] = normalizedUpdates;
            this._saveToStorage();
            this._notifyListeners('update', this._trades[index]);
            return this._trades[index];
        }
        
        // トレード削除
        deleteTrade(id) {
            const index = this._trades.findIndex(t => t.id === id);
            if (index === -1) return false;
            
            const deleted = this._trades.splice(index, 1)[0];
            this._saveToStorage();
            this._notifyListeners('delete', deleted);
            return true;
        }
        
        // 一括トレード追加
        bulkAddTrades(trades) {
            if (!Array.isArray(trades)) {
                throw new Error('引数は配列である必要があります');
            }
            
            const addedTrades = [];
            trades.forEach(trade => {
                const normalizedTrade = this._normalizeTradeData(trade);
                normalizedTrade.id = normalizedTrade.id || String(Date.now() + '_' + Math.random().toString(36).substr(2, 9));
                this._trades.push(normalizedTrade);
                addedTrades.push(normalizedTrade);
            });
            
            this._saveToStorage();
            this._notifyListeners('bulk-add', addedTrades);
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
        
        _loadFromStorage() {
            try {
                const saved = localStorage.getItem('trades');
                this._trades = saved ? JSON.parse(saved) : [];
                
                // グローバルのtrades配列も更新
                if (!window.trades) {
                    window.trades = [...this._trades];
                }
            } catch (error) {
                console.error('読み込みエラー:', error);
                this._trades = [];
            }
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