/**
 * SyncModule.js - データ同期モジュール
 * 
 * localStorage ↔ Supabase 双方向同期
 * 
 * @version 1.0.1
 * @date 2025-12-30
 * @see Supabase導入_ロードマップ_v1_7.md Phase 4
 */

(function() {
    'use strict';
    
    class SyncModuleClass {
        // ========== Private Fields ==========
        #supabase = null;
        #eventBus = null;
        #initialized = false;
        #syncInProgress = false;
        
        // ========== Constructor ==========
        constructor() {
            console.log('[SyncModule] インスタンス作成');
        }
        
        // ========== Public API ==========
        
        /**
         * 初期化
         * @returns {Promise<boolean>} 成功/失敗
         */
        async initialize() {
            try {
                // Supabaseクライアント取得
                this.#supabase = getSupabase();
                if (!this.#supabase) {
                    console.error('[SyncModule] Supabaseクライアントが取得できません');
                    return false;
                }
                
                // EventBus取得
                this.#eventBus = window.eventBus;
                
                // 認証状態確認
                const { data: { user } } = await this.#supabase.auth.getUser();
                if (!user) {
                    console.warn('[SyncModule] 未ログイン状態です');
                    return false;
                }
                
                this.#initialized = true;
                console.log('[SyncModule] 初期化完了', { userId: user.id });
                
                return true;
                
            } catch (error) {
                console.error('[SyncModule] 初期化エラー:', error);
                return false;
            }
        }
        
        /**
         * 初期化状態を確認
         * @returns {boolean}
         */
        isInitialized() {
            return this.#initialized;
        }
        
        /**
         * 同期中かどうか
         * @returns {boolean}
         */
        isSyncing() {
            return this.#syncInProgress;
        }
        
        // ========== Trades 同期 ==========
        
        /**
         * トレードをSupabaseに保存（単一）
         * @param {Object} localTrade - localStorageのトレードデータ
         * @returns {Promise<Object>} { success, data, error }
         */
        async saveTrade(localTrade) {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const supabaseData = this.#localTradeToSupabase(localTrade);
                
                const { data, error } = await this.#supabase
                    .from('trades')
                    .upsert(supabaseData, { onConflict: 'id' })
                    .select()
                    .single();
                
                if (error) {
                    console.error('[SyncModule] トレード保存エラー:', error);
                    return { success: false, error: SecureError.toUserMessage(error) };
                }
                
                console.log('[SyncModule] トレード保存成功:', data.id);
                this.#eventBus?.emit('sync:trade:saved', { tradeId: data.id });
                
                return { success: true, data };
                
            } catch (error) {
                console.error('[SyncModule] saveTrade例外:', error);
                return { success: false, error: SecureError.toUserMessage(error) };
            }
        }
        
        /**
         * トレードを削除
         * @param {string} tradeId - トレードID
         * @returns {Promise<Object>} { success, error }
         */
        async deleteTrade(tradeId) {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const { error } = await this.#supabase
                    .from('trades')
                    .delete()
                    .eq('id', tradeId);
                
                if (error) {
                    console.error('[SyncModule] トレード削除エラー:', error);
                    return { success: false, error: SecureError.toUserMessage(error) };
                }
                
                console.log('[SyncModule] トレード削除成功:', tradeId);
                this.#eventBus?.emit('sync:trade:deleted', { tradeId });
                
                return { success: true };
                
            } catch (error) {
                console.error('[SyncModule] deleteTrade例外:', error);
                return { success: false, error: SecureError.toUserMessage(error) };
            }
        }
        
        /**
         * Supabaseから全トレードを取得
         * @returns {Promise<Object>} { success, data, error }
         */
        async fetchAllTrades() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化', data: [] };
            }
            
            try {
                const { data, error } = await this.#supabase
                    .from('trades')
                    .select('*')
                    .order('entry_date', { ascending: false });
                
                if (error) {
                    console.error('[SyncModule] トレード取得エラー:', error);
                    return { success: false, error: SecureError.toUserMessage(error), data: [] };
                }
                
                // Supabase形式 → localStorage形式に変換
                const localTrades = data.map(t => this.#supabaseTradeToLocal(t));
                
                console.log(`[SyncModule] ${localTrades.length}件のトレードを取得`);
                
                return { success: true, data: localTrades };
                
            } catch (error) {
                console.error('[SyncModule] fetchAllTrades例外:', error);
                return { success: false, error: SecureError.toUserMessage(error), data: [] };
            }
        }
        
        /**
         * localStorageの全トレードをSupabaseに移行
         * @returns {Promise<Object>} { success, count, errors }
         */
        async migrateTradesFromLocal() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            if (this.#syncInProgress) {
                return { success: false, error: '同期中です' };
            }
            
            this.#syncInProgress = true;
            const errors = [];
            let successCount = 0;
            
            try {
                // localStorageからトレード取得
                const localTrades = StorageValidator.safeLoad('trades', [], StorageValidator.isTradesFormat);
                
                if (localTrades.length === 0) {
                    console.log('[SyncModule] 移行するトレードがありません');
                    return { success: true, count: 0, errors: [] };
                }
                
                console.log(`[SyncModule] ${localTrades.length}件のトレードを移行開始`);
                this.#eventBus?.emit('sync:migration:start', { total: localTrades.length });
                
                // 一括upsert用に変換
                const supabaseData = localTrades.map(t => this.#localTradeToSupabase(t));
                
                // バッチ処理（50件ずつ）
                const batchSize = 50;
                for (let i = 0; i < supabaseData.length; i += batchSize) {
                    const batch = supabaseData.slice(i, i + batchSize);
                    
                    const { data, error } = await this.#supabase
                        .from('trades')
                        .upsert(batch, { onConflict: 'id' });
                    
                    if (error) {
                        console.error(`[SyncModule] バッチ${i / batchSize + 1}エラー:`, error);
                        errors.push({ batch: i / batchSize + 1, error: error.message });
                    } else {
                        successCount += batch.length;
                    }
                    
                    // 進捗通知
                    this.#eventBus?.emit('sync:migration:progress', {
                        current: Math.min(i + batchSize, supabaseData.length),
                        total: supabaseData.length
                    });
                }
                
                console.log(`[SyncModule] 移行完了: ${successCount}/${localTrades.length}件`);
                this.#eventBus?.emit('sync:migration:complete', { count: successCount, errors });
                
                return { success: errors.length === 0, count: successCount, errors };
                
            } catch (error) {
                console.error('[SyncModule] migrateTradesFromLocal例外:', error);
                return { success: false, error: SecureError.toUserMessage(error), errors };
                
            } finally {
                this.#syncInProgress = false;
            }
        }
        
        /**
         * SupabaseからlocalStorageに同期
         * @returns {Promise<Object>} { success, count, error }
         */
        async syncTradesToLocal() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const result = await this.fetchAllTrades();
                
                if (!result.success) {
                    return result;
                }
                
                // localStorageに保存
                localStorage.setItem('trades', JSON.stringify(result.data));
                
                // グローバル変数も更新
                if (window.trades) {
                    window.trades.length = 0;
                    window.trades.push(...result.data);
                }
                
                // TradeManager更新
                if (window.TradeManager) {
                    const tm = window.TradeManager.getInstance();
                    tm._trades = [...result.data];
                }
                
                console.log(`[SyncModule] ${result.data.length}件のトレードをlocalStorageに同期`);
                this.#eventBus?.emit('sync:trades:synced', { count: result.data.length });
                
                return { success: true, count: result.data.length };
                
            } catch (error) {
                console.error('[SyncModule] syncTradesToLocal例外:', error);
                return { success: false, error: SecureError.toUserMessage(error) };
            }
        }
        
        // ========== Private Methods: データ変換 ==========
        
        /**
         * localStorage形式 → Supabase形式
         * @param {Object} local - localStorageのトレードデータ
         * @returns {Object} Supabase用データ
         */
        #localTradeToSupabase(local) {
            // 現在のユーザーID取得
            const userId = this.#getCurrentUserId();
            
            // 日付と時刻を分離
            let entryDate = null;
            let entryTime = null;
            
            if (local.date) {
                entryDate = local.date.split('T')[0];
            }
            if (local.entryTime) {
                // entryTimeが "2025-01-08T07:15" 形式の場合
                const timePart = local.entryTime.includes('T') 
                    ? local.entryTime.split('T')[1] 
                    : local.entryTime;
                entryTime = timePart?.slice(0, 5) || null; // "07:15"
            }
            
            return {
                id: local.id,
                user_id: userId,
                entry_date: entryDate,
                entry_time: entryTime,
                symbol: local.symbol || local.pair,
                direction: local.direction,
                lot: local.lot || local.lotSize,
                entry_price: local.entryPrice,
                stop_loss: local.stopLoss,
                take_profit: local.takeProfit,
                exits: local.exits || [],
                yen_profit_loss: local.yenProfitLoss || null,
                broker: local.broker,
                checklist: local.checklist || null,
                reflection: local.reflection || null,
                chart_images: local.chartImages || [],
                scenario: local.scenario || null,
                status: local.status || local.holdingStatus || 'open',
                reasons: local.reasons || [],
                entry_emotion: local.entryEmotion || null,
                created_at: local.createdAt || local.timestamp || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
        }
        
        /**
         * Supabase形式 → localStorage形式
         * @param {Object} supa - Supabaseのトレードデータ
         * @returns {Object} localStorage用データ
         */
        #supabaseTradeToLocal(supa) {
            // 日付と時刻を結合
            let entryTime = null;
            if (supa.entry_date) {
                entryTime = supa.entry_time 
                    ? `${supa.entry_date}T${supa.entry_time}`
                    : `${supa.entry_date}T00:00`;
            }
            
            return {
                id: supa.id,
                pair: supa.symbol,
                symbol: supa.symbol,
                direction: supa.direction,
                date: supa.entry_date,
                entryTime: entryTime,
                entryPrice: supa.entry_price ? parseFloat(supa.entry_price) : null,
                lot: supa.lot ? parseFloat(supa.lot) : null,
                lotSize: supa.lot ? parseFloat(supa.lot) : null,
                stopLoss: supa.stop_loss ? parseFloat(supa.stop_loss) : null,
                takeProfit: supa.take_profit ? parseFloat(supa.take_profit) : null,
                exits: supa.exits || [],
                yenProfitLoss: supa.yen_profit_loss || null,
                broker: supa.broker,
                checklist: supa.checklist || null,
                reflection: supa.reflection,
                chartImages: supa.chart_images || [],
                scenario: supa.scenario,
                status: supa.status || 'open',
                holdingStatus: supa.status || 'open',
                reasons: supa.reasons || [],
                entryEmotion: supa.entry_emotion,
                timestamp: supa.created_at,
                createdAt: supa.created_at,
                updatedAt: supa.updated_at
            };
        }
        
        /**
         * 現在のユーザーIDを取得
         * @returns {string|null}
         */
        #getCurrentUserId() {
            try {
                // AuthModuleから取得を試みる
                if (window.AuthModule?.getCurrentUser) {
                    const user = window.AuthModule.getCurrentUser();
                    return user?.id || null;
                }
                return null;
            } catch {
                return null;
            }
        }
        
        // ========== デバッグ用 ==========
        
        /**
         * モジュール状態を取得
         * @returns {Object}
         */
        getStatus() {
            return {
                initialized: this.#initialized,
                syncInProgress: this.#syncInProgress,
                hasSupabase: !!this.#supabase,
                hasEventBus: !!this.#eventBus
            };
        }
    }
    
    // ========== グローバル公開 ==========
    window.SyncModule = new SyncModuleClass();
    
    console.log('[SyncModule] モジュール読み込み完了');
    
})();