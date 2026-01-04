/**
 * SyncModule.js - データ同期モジュール
 * 
 * localStorage ↔ Supabase 双方向同期
 * 
 * @version 1.1.1
 * @date 2025-01-04
 * @changelog
 *   v1.0.1 - trades同期実装
 *   v1.1.0 - notes同期追加
 *   v1.1.1 - notes変換処理修正（memo/marketView/images対応）
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
        
        // ========== Notes 同期 ==========
        
        /**
         * ノートをSupabaseに保存（upsert）
         * @param {string} dateStr - 日付文字列（YYYY-MM-DD）
         * @param {Object} noteData - ノートデータ { memo, marketView, images, ... }
         * @returns {Promise<Object>} { success, data, error }
         */
        async saveNote(dateStr, noteData) {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const supabaseData = this.#localNoteToSupabase(dateStr, noteData);
                
                // user_id + date でupsert（UNIQUE制約を利用）
                const { data, error } = await this.#supabase
                    .from('notes')
                    .upsert(supabaseData, { 
                        onConflict: 'user_id,date',
                        ignoreDuplicates: false 
                    })
                    .select()
                    .single();
                
                if (error) {
                    console.error('[SyncModule] ノート保存エラー:', error);
                    return { success: false, error: SecureError.toUserMessage(error) };
                }
                
                console.log('[SyncModule] ノート保存成功:', dateStr);
                this.#eventBus?.emit('sync:note:saved', { date: dateStr });
                
                return { success: true, data };
                
            } catch (error) {
                console.error('[SyncModule] saveNote例外:', error);
                return { success: false, error: SecureError.toUserMessage(error) };
            }
        }
        
        /**
         * ノートを削除
         * @param {string} dateStr - 日付文字列（YYYY-MM-DD）
         * @returns {Promise<Object>} { success, error }
         */
        async deleteNote(dateStr) {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const userId = this.#getCurrentUserId();
                if (!userId) {
                    return { success: false, error: 'ユーザーIDが取得できません' };
                }
                
                const { error } = await this.#supabase
                    .from('notes')
                    .delete()
                    .eq('user_id', userId)
                    .eq('date', dateStr);
                
                if (error) {
                    console.error('[SyncModule] ノート削除エラー:', error);
                    return { success: false, error: SecureError.toUserMessage(error) };
                }
                
                console.log('[SyncModule] ノート削除成功:', dateStr);
                this.#eventBus?.emit('sync:note:deleted', { date: dateStr });
                
                return { success: true };
                
            } catch (error) {
                console.error('[SyncModule] deleteNote例外:', error);
                return { success: false, error: SecureError.toUserMessage(error) };
            }
        }
        
        /**
         * Supabaseから全ノートを取得
         * @returns {Promise<Object>} { success, data, error }
         *   data は localStorage形式（日付キーのオブジェクト）
         */
        async fetchAllNotes() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化', data: {} };
            }
            
            try {
                const { data, error } = await this.#supabase
                    .from('notes')
                    .select('*')
                    .order('date', { ascending: false });
                
                if (error) {
                    console.error('[SyncModule] ノート取得エラー:', error);
                    return { success: false, error: SecureError.toUserMessage(error), data: {} };
                }
                
                // Supabase形式 → localStorage形式に変換
                const localNotes = this.#supabaseNotesToLocal(data);
                
                console.log(`[SyncModule] ${data.length}件のノートを取得`);
                
                return { success: true, data: localNotes };
                
            } catch (error) {
                console.error('[SyncModule] fetchAllNotes例外:', error);
                return { success: false, error: SecureError.toUserMessage(error), data: {} };
            }
        }
        
        /**
         * localStorageの全ノートをSupabaseに移行
         * @returns {Promise<Object>} { success, count, errors }
         */
        async migrateNotesFromLocal() {
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
                // localStorageからノート取得
                const localNotes = StorageValidator.safeLoad('notes', {}, StorageValidator.isObject);
                
                const dateKeys = Object.keys(localNotes);
                if (dateKeys.length === 0) {
                    console.log('[SyncModule] 移行するノートがありません');
                    return { success: true, count: 0, errors: [] };
                }
                
                console.log(`[SyncModule] ${dateKeys.length}件のノートを移行開始`);
                this.#eventBus?.emit('sync:notes:migration:start', { total: dateKeys.length });
                
                // 一括upsert用に変換
                const supabaseData = dateKeys.map(dateStr => 
                    this.#localNoteToSupabase(dateStr, localNotes[dateStr])
                );
                
                // バッチ処理（50件ずつ）
                const batchSize = 50;
                for (let i = 0; i < supabaseData.length; i += batchSize) {
                    const batch = supabaseData.slice(i, i + batchSize);
                    
                    const { error } = await this.#supabase
                        .from('notes')
                        .upsert(batch, { onConflict: 'user_id,date' });
                    
                    if (error) {
                        console.error(`[SyncModule] ノートバッチ${i / batchSize + 1}エラー:`, error);
                        errors.push({ batch: i / batchSize + 1, error: error.message });
                    } else {
                        successCount += batch.length;
                    }
                    
                    // 進捗通知
                    this.#eventBus?.emit('sync:notes:migration:progress', {
                        current: Math.min(i + batchSize, supabaseData.length),
                        total: supabaseData.length
                    });
                }
                
                console.log(`[SyncModule] ノート移行完了: ${successCount}/${dateKeys.length}件`);
                this.#eventBus?.emit('sync:notes:migration:complete', { count: successCount, errors });
                
                return { success: errors.length === 0, count: successCount, errors };
                
            } catch (error) {
                console.error('[SyncModule] migrateNotesFromLocal例外:', error);
                return { success: false, error: SecureError.toUserMessage(error), errors };
                
            } finally {
                this.#syncInProgress = false;
            }
        }
        
        /**
         * Supabaseから全ノートをlocalStorageに同期
         * @returns {Promise<Object>} { success, count, error }
         */
        async syncNotesToLocal() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const result = await this.fetchAllNotes();
                
                if (!result.success) {
                    return result;
                }
                
                // localStorageに保存
                localStorage.setItem('notes', JSON.stringify(result.data));
                
                // グローバル変数も更新
                if (window.notes !== undefined) {
                    window.notes = result.data;
                }
                
                // NoteManagerModule更新（存在する場合）
                // NoteManagerModuleはプライベートフィールドを使用しているため、
                // reload()メソッドがあればそれを呼び出す
                if (window.NoteManagerModule?.reload) {
                    window.NoteManagerModule.reload();
                }
                
                const count = Object.keys(result.data).length;
                console.log(`[SyncModule] ${count}件のノートをlocalStorageに同期`);
                this.#eventBus?.emit('sync:notes:synced', { count });
                
                return { success: true, count };
                
            } catch (error) {
                console.error('[SyncModule] syncNotesToLocal例外:', error);
                return { success: false, error: SecureError.toUserMessage(error) };
            }
        }
        
        // ========== Private Methods: データ変換（Trades） ==========
        
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
        
        // ========== Private Methods: データ変換（Notes） ==========
        
        /**
         * localStorage形式 → Supabase形式（Notes）
         * memo, marketView, images を JSON文字列として content に保存
         * @param {string} dateStr - 日付文字列（YYYY-MM-DD）
         * @param {Object} noteData - ノートデータ { memo, marketView, images, ... }
         * @returns {Object} Supabase用データ
         */
        #localNoteToSupabase(dateStr, noteData) {
            const userId = this.#getCurrentUserId();
            
            // memo, marketView, images を content にまとめる
            const contentObj = {
                memo: noteData.memo || '',
                marketView: noteData.marketView || '',
                images: noteData.images || []
            };
            
            return {
                user_id: userId,
                date: dateStr,
                content: JSON.stringify(contentObj),
                updated_at: new Date().toISOString()
                // id, created_at はSupabase側で自動生成
            };
        }
        
        /**
         * Supabase形式 → localStorage形式（Notes）
         * 複数レコードを日付キーのオブジェクトに変換
         * @param {Array} supabaseNotes - Supabaseのノート配列
         * @returns {Object} localStorage形式（日付キーのオブジェクト）
         */
        #supabaseNotesToLocal(supabaseNotes) {
            const localNotes = {};
            
            for (const note of supabaseNotes) {
                // content をパース
                let contentObj = { memo: '', marketView: '', images: [] };
                
                if (note.content) {
                    try {
                        // JSON形式の場合
                        contentObj = JSON.parse(note.content);
                    } catch {
                        // プレーンテキストの場合（後方互換性）
                        contentObj = { 
                            memo: note.content, 
                            marketView: '', 
                            images: [] 
                        };
                    }
                }
                
                localNotes[note.date] = {
                    date: note.date,
                    memo: contentObj.memo || '',
                    marketView: contentObj.marketView || '',
                    images: contentObj.images || [],
                    createdAt: note.created_at,
                    updatedAt: note.updated_at
                };
            }
            
            return localNotes;
        }
        
        // ========== Private Methods: 共通 ==========
        
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
    
    console.log('[SyncModule] モジュール読み込み完了 v1.1.1');
    
})();