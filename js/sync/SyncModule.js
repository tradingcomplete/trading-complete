/**
 * SyncModule.js - データ同期モジュール
 * 
 * localStorage ↔ Supabase 双方向同期
 * 
 * @version 1.7.0
 * @date 2026-01-15
 * @changelog
 *   v1.0.1 - trades同期実装
 *   v1.1.0 - notes同期追加
 *   v1.1.1 - notes変換処理修正（memo/marketView/images対応）
 *   v1.2.0 - expenses同期追加
 *   v1.3.0 - capital_records同期追加
 *   v1.4.0 - user_settings同期追加（一括保存方式）
 *   v1.5.0 - 画像アップロード統合（Supabase Storage）
 *   v1.5.1 - #uploadTradeImages修正（文字列形式のBase64にも対応）
 *   v1.5.2 - #uploadNoteImages追加（ノート画像のStorage対応）
 *   v1.6.0 - goals/userIcon同期追加、セキュリティ強化（エラーハンドリング改善、SecureErrorフォールバック追加）
 *   v1.7.0 - siteTitle/subtitle同期追加
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
        
        // ========== セキュリティ: エラーハンドリング ==========
        
        /**
         * エラーメッセージをユーザーフレンドリーに変換
         * SecureErrorが存在しない場合のフォールバック
         * @private
         * @param {Error} error - エラーオブジェクト
         * @returns {string} ユーザー向けメッセージ
         */
        #toUserMessage(error) {
            // SecureErrorが存在する場合はそちらを使用
            if (typeof SecureError !== 'undefined' && SecureError.toUserMessage) {
                return this.#toUserMessage(error);
            }
            
            // フォールバック: 詳細なエラー情報を隠す
            console.error('[SyncModule] エラー詳細:', error);
            
            // ネットワークエラーの判定
            if (error.message?.includes('network') || error.message?.includes('fetch')) {
                return 'ネットワークエラーが発生しました。接続を確認してください。';
            }
            
            // 認証エラーの判定
            if (error.message?.includes('auth') || error.code === 'PGRST301') {
                return '認証エラーが発生しました。再ログインしてください。';
            }
            
            // 一般的なエラーメッセージ
            return '同期中にエラーが発生しました。しばらくしてから再試行してください。';
        }
        
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
                
                // settings:changed イベントをリッスン
                this.#setupEventListeners();
                
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
                // 画像をSupabase Storageにアップロード（Base64 → URL）
                const tradeWithUrls = await this.#uploadTradeImages(localTrade);
                
                const supabaseData = this.#localTradeToSupabase(tradeWithUrls);
                
                const { data, error } = await this.#supabase
                    .from('trades')
                    .upsert(supabaseData, { onConflict: 'id' })
                    .select()
                    .single();
                
                if (error) {
                    console.error('[SyncModule] トレード保存エラー:', error);
                    return { success: false, error: this.#toUserMessage(error) };
                }
                
                console.log('[SyncModule] トレード保存成功:', data.id);
                this.#eventBus?.emit('sync:trade:saved', { tradeId: data.id });
                
                return { success: true, data };
                
            } catch (error) {
                console.error('[SyncModule] saveTrade例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
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
                    return { success: false, error: this.#toUserMessage(error) };
                }
                
                console.log('[SyncModule] トレード削除成功:', tradeId);
                this.#eventBus?.emit('sync:trade:deleted', { tradeId });
                
                return { success: true };
                
            } catch (error) {
                console.error('[SyncModule] deleteTrade例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
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
                    return { success: false, error: this.#toUserMessage(error), data: [] };
                }
                
                // Supabase形式 → localStorage形式に変換
                const localTrades = data.map(t => this.#supabaseTradeToLocal(t));
                
                console.log(`[SyncModule] ${localTrades.length}件のトレードを取得`);
                
                return { success: true, data: localTrades };
                
            } catch (error) {
                console.error('[SyncModule] fetchAllTrades例外:', error);
                return { success: false, error: this.#toUserMessage(error), data: [] };
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
                return { success: false, error: this.#toUserMessage(error), errors };
                
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
                return { success: false, error: this.#toUserMessage(error) };
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
                // 画像をSupabase Storageにアップロード（Base64 → URL）
                const noteWithUrls = await this.#uploadNoteImages(dateStr, noteData);
                
                const supabaseData = this.#localNoteToSupabase(dateStr, noteWithUrls);
                
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
                    return { success: false, error: this.#toUserMessage(error) };
                }
                
                console.log('[SyncModule] ノート保存成功:', dateStr);
                this.#eventBus?.emit('sync:note:saved', { date: dateStr });
                
                return { success: true, data };
                
            } catch (error) {
                console.error('[SyncModule] saveNote例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
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
                    return { success: false, error: this.#toUserMessage(error) };
                }
                
                console.log('[SyncModule] ノート削除成功:', dateStr);
                this.#eventBus?.emit('sync:note:deleted', { date: dateStr });
                
                return { success: true };
                
            } catch (error) {
                console.error('[SyncModule] deleteNote例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
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
                    return { success: false, error: this.#toUserMessage(error), data: {} };
                }
                
                // Supabase形式 → localStorage形式に変換
                const localNotes = this.#supabaseNotesToLocal(data);
                
                console.log(`[SyncModule] ${data.length}件のノートを取得`);
                
                return { success: true, data: localNotes };
                
            } catch (error) {
                console.error('[SyncModule] fetchAllNotes例外:', error);
                return { success: false, error: this.#toUserMessage(error), data: {} };
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
                return { success: false, error: this.#toUserMessage(error), errors };
                
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
                if (window.NoteManagerModule?.reload) {
                    window.NoteManagerModule.reload();
                }
                
                const count = Object.keys(result.data).length;
                console.log(`[SyncModule] ${count}件のノートをlocalStorageに同期`);
                this.#eventBus?.emit('sync:notes:synced', { count });
                
                return { success: true, count };
                
            } catch (error) {
                console.error('[SyncModule] syncNotesToLocal例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
            }
        }
        
        // ========== Expenses 同期 ==========
        
        /**
         * 経費をSupabaseに保存（upsert）
         * @param {Object} expense - 経費データ
         * @returns {Promise<Object>} { success, data, error }
         */
        async saveExpense(expense) {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const supabaseData = this.#localExpenseToSupabase(expense);
                
                const { data, error } = await this.#supabase
                    .from('expenses')
                    .upsert(supabaseData, { onConflict: 'id' })
                    .select()
                    .single();
                
                if (error) {
                    console.error('[SyncModule] 経費保存エラー:', error);
                    return { success: false, error: this.#toUserMessage(error) };
                }
                
                console.log('[SyncModule] 経費保存成功:', data.id);
                this.#eventBus?.emit('sync:expense:saved', { expenseId: data.id });
                
                return { success: true, data };
                
            } catch (error) {
                console.error('[SyncModule] saveExpense例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
            }
        }
        
        /**
         * 経費を削除
         * @param {string} expenseId - 経費ID
         * @returns {Promise<Object>} { success, error }
         */
        async deleteExpense(expenseId) {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const { error } = await this.#supabase
                    .from('expenses')
                    .delete()
                    .eq('id', expenseId);
                
                if (error) {
                    console.error('[SyncModule] 経費削除エラー:', error);
                    return { success: false, error: this.#toUserMessage(error) };
                }
                
                console.log('[SyncModule] 経費削除成功:', expenseId);
                this.#eventBus?.emit('sync:expense:deleted', { expenseId });
                
                return { success: true };
                
            } catch (error) {
                console.error('[SyncModule] deleteExpense例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
            }
        }
        
        /**
         * Supabaseから全経費を取得
         * @returns {Promise<Object>} { success, data, error }
         */
        async fetchAllExpenses() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化', data: [] };
            }
            
            try {
                const { data, error } = await this.#supabase
                    .from('expenses')
                    .select('*')
                    .order('date', { ascending: false });
                
                if (error) {
                    console.error('[SyncModule] 経費取得エラー:', error);
                    return { success: false, error: this.#toUserMessage(error), data: [] };
                }
                
                // Supabase形式 → localStorage形式に変換
                const localExpenses = data.map(e => this.#supabaseExpenseToLocal(e));
                
                console.log(`[SyncModule] ${localExpenses.length}件の経費を取得`);
                
                return { success: true, data: localExpenses };
                
            } catch (error) {
                console.error('[SyncModule] fetchAllExpenses例外:', error);
                return { success: false, error: this.#toUserMessage(error), data: [] };
            }
        }
        
        /**
         * localStorageの全経費をSupabaseに移行
         * @returns {Promise<Object>} { success, count, errors }
         */
        async migrateExpensesFromLocal() {
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
                // localStorageから経費取得
                const localExpenses = StorageValidator.safeLoad('tc_expenses', [], StorageValidator.isArray);
                
                if (localExpenses.length === 0) {
                    console.log('[SyncModule] 移行する経費がありません');
                    return { success: true, count: 0, errors: [] };
                }
                
                console.log(`[SyncModule] ${localExpenses.length}件の経費を移行開始`);
                this.#eventBus?.emit('sync:expenses:migration:start', { total: localExpenses.length });
                
                // 一括upsert用に変換
                const supabaseData = localExpenses.map(e => this.#localExpenseToSupabase(e));
                
                // バッチ処理（50件ずつ）
                const batchSize = 50;
                for (let i = 0; i < supabaseData.length; i += batchSize) {
                    const batch = supabaseData.slice(i, i + batchSize);
                    
                    const { error } = await this.#supabase
                        .from('expenses')
                        .upsert(batch, { onConflict: 'id' });
                    
                    if (error) {
                        console.error(`[SyncModule] 経費バッチ${i / batchSize + 1}エラー:`, error);
                        errors.push({ batch: i / batchSize + 1, error: error.message });
                    } else {
                        successCount += batch.length;
                    }
                    
                    // 進捗通知
                    this.#eventBus?.emit('sync:expenses:migration:progress', {
                        current: Math.min(i + batchSize, supabaseData.length),
                        total: supabaseData.length
                    });
                }
                
                console.log(`[SyncModule] 経費移行完了: ${successCount}/${localExpenses.length}件`);
                this.#eventBus?.emit('sync:expenses:migration:complete', { count: successCount, errors });
                
                return { success: errors.length === 0, count: successCount, errors };
                
            } catch (error) {
                console.error('[SyncModule] migrateExpensesFromLocal例外:', error);
                return { success: false, error: this.#toUserMessage(error), errors };
                
            } finally {
                this.#syncInProgress = false;
            }
        }
        
        /**
         * Supabaseから全経費をlocalStorageに同期
         * @returns {Promise<Object>} { success, count, error }
         */
        async syncExpensesToLocal() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const result = await this.fetchAllExpenses();
                
                if (!result.success) {
                    return result;
                }
                
                // localStorageに保存
                localStorage.setItem('tc_expenses', JSON.stringify(result.data));
                
                // ExpenseManagerModule更新（存在する場合）
                if (window.ExpenseManagerModule?.loadExpenses) {
                    window.ExpenseManagerModule.loadExpenses();
                }
                
                console.log(`[SyncModule] ${result.data.length}件の経費をlocalStorageに同期`);
                this.#eventBus?.emit('sync:expenses:synced', { count: result.data.length });
                
                return { success: true, count: result.data.length };
                
            } catch (error) {
                console.error('[SyncModule] syncExpensesToLocal例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
            }
        }
        
        // ========== Capital Records 同期 ==========
        
        /**
         * 入出金記録をSupabaseに保存（upsert）
         * @param {Object} record - 入出金データ
         * @returns {Promise<Object>} { success, data, error }
         */
        async saveCapitalRecord(record) {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const supabaseData = this.#localCapitalToSupabase(record);
                
                const { data, error } = await this.#supabase
                    .from('capital_records')
                    .upsert(supabaseData, { onConflict: 'id' })
                    .select()
                    .single();
                
                if (error) {
                    console.error('[SyncModule] 入出金記録保存エラー:', error);
                    return { success: false, error: this.#toUserMessage(error) };
                }
                
                console.log('[SyncModule] 入出金記録保存成功:', data.id);
                this.#eventBus?.emit('sync:capital:saved', { recordId: data.id });
                
                return { success: true, data };
                
            } catch (error) {
                console.error('[SyncModule] saveCapitalRecord例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
            }
        }
        
        /**
         * 入出金記録を削除
         * @param {string} recordId - 記録ID
         * @returns {Promise<Object>} { success, error }
         */
        async deleteCapitalRecord(recordId) {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const { error } = await this.#supabase
                    .from('capital_records')
                    .delete()
                    .eq('id', recordId);
                
                if (error) {
                    console.error('[SyncModule] 入出金記録削除エラー:', error);
                    return { success: false, error: this.#toUserMessage(error) };
                }
                
                console.log('[SyncModule] 入出金記録削除成功:', recordId);
                this.#eventBus?.emit('sync:capital:deleted', { recordId });
                
                return { success: true };
                
            } catch (error) {
                console.error('[SyncModule] deleteCapitalRecord例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
            }
        }
        
        /**
         * Supabaseから全入出金記録を取得
         * @returns {Promise<Object>} { success, data, error }
         */
        async fetchAllCapitalRecords() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化', data: [] };
            }
            
            try {
                const { data, error } = await this.#supabase
                    .from('capital_records')
                    .select('*')
                    .order('date', { ascending: true });
                
                if (error) {
                    console.error('[SyncModule] 入出金記録取得エラー:', error);
                    return { success: false, error: this.#toUserMessage(error), data: [] };
                }
                
                // Supabase形式 → localStorage形式に変換
                const localRecords = data.map(r => this.#supabaseCapitalToLocal(r));
                
                console.log(`[SyncModule] ${localRecords.length}件の入出金記録を取得`);
                
                return { success: true, data: localRecords };
                
            } catch (error) {
                console.error('[SyncModule] fetchAllCapitalRecords例外:', error);
                return { success: false, error: this.#toUserMessage(error), data: [] };
            }
        }
        
        /**
         * localStorageの全入出金記録をSupabaseに移行
         * @returns {Promise<Object>} { success, count, errors }
         */
        async migrateCapitalRecordsFromLocal() {
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
                // localStorageから入出金記録取得
                const localRecords = StorageValidator.safeLoad('depositWithdrawals', [], StorageValidator.isArray);
                
                if (localRecords.length === 0) {
                    console.log('[SyncModule] 移行する入出金記録がありません');
                    return { success: true, count: 0, errors: [] };
                }
                
                console.log(`[SyncModule] ${localRecords.length}件の入出金記録を移行開始`);
                this.#eventBus?.emit('sync:capital:migration:start', { total: localRecords.length });
                
                // 一括upsert用に変換
                const supabaseData = localRecords.map(r => this.#localCapitalToSupabase(r));
                
                // バッチ処理（50件ずつ）
                const batchSize = 50;
                for (let i = 0; i < supabaseData.length; i += batchSize) {
                    const batch = supabaseData.slice(i, i + batchSize);
                    
                    const { error } = await this.#supabase
                        .from('capital_records')
                        .upsert(batch, { onConflict: 'id' });
                    
                    if (error) {
                        console.error(`[SyncModule] 入出金バッチ${i / batchSize + 1}エラー:`, error);
                        errors.push({ batch: i / batchSize + 1, error: error.message });
                    } else {
                        successCount += batch.length;
                    }
                    
                    // 進捗通知
                    this.#eventBus?.emit('sync:capital:migration:progress', {
                        current: Math.min(i + batchSize, supabaseData.length),
                        total: supabaseData.length
                    });
                }
                
                console.log(`[SyncModule] 入出金記録移行完了: ${successCount}/${localRecords.length}件`);
                this.#eventBus?.emit('sync:capital:migration:complete', { count: successCount, errors });
                
                return { success: errors.length === 0, count: successCount, errors };
                
            } catch (error) {
                console.error('[SyncModule] migrateCapitalRecordsFromLocal例外:', error);
                return { success: false, error: this.#toUserMessage(error), errors };
                
            } finally {
                this.#syncInProgress = false;
            }
        }
        
        /**
         * Supabaseから全入出金記録をlocalStorageに同期
         * @returns {Promise<Object>} { success, count, error }
         */
        async syncCapitalRecordsToLocal() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const result = await this.fetchAllCapitalRecords();
                
                if (!result.success) {
                    return result;
                }
                
                // localStorageに保存
                localStorage.setItem('depositWithdrawals', JSON.stringify(result.data));
                
                console.log(`[SyncModule] ${result.data.length}件の入出金記録をlocalStorageに同期`);
                this.#eventBus?.emit('sync:capital:synced', { count: result.data.length });
                
                return { success: true, count: result.data.length };
                
            } catch (error) {
                console.error('[SyncModule] syncCapitalRecordsToLocal例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
            }
        }
        
        // ========== User Settings 同期（一括保存方式） ==========
        
        /**
         * ユーザー設定をSupabaseに保存（4つのlocalStorageを一括）
         * @returns {Promise<Object>} { success, data, error }
         */
        async saveUserSettings() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const userId = this.#getCurrentUserId();
                if (!userId) {
                    return { success: false, error: 'ユーザーIDが取得できません' };
                }
                
                // 6つのlocalStorageから読み取り
                const brokers = StorageValidator.safeLoad('brokers', { list: [], nextId: 1 }, StorageValidator.isBrokersFormat);
                const favoritePairs = StorageValidator.safeLoad('favoritePairs', [], StorageValidator.isArray);
                const monthlyMemos = StorageValidator.safeLoad('monthlyMemos', { anomaly: {}, monthly: {} }, StorageValidator.isMonthlyMemosFormat);
                const closedPeriods = StorageValidator.safeLoad('tc_closed_periods', [], StorageValidator.isArray);
                
                // goals（セルフイメージ）を収集
                const goals = {
                    goal1: {
                        text: localStorage.getItem('goalText1') || '',
                        deadline: localStorage.getItem('goalDeadline1') || '',
                        achieved: localStorage.getItem('goalAchieved1') === 'true'
                    },
                    goal2: {
                        text: localStorage.getItem('goalText2') || '',
                        deadline: localStorage.getItem('goalDeadline2') || '',
                        achieved: localStorage.getItem('goalAchieved2') === 'true'
                    },
                    goal3: {
                        text: localStorage.getItem('goalText3') || '',
                        deadline: localStorage.getItem('goalDeadline3') || '',
                        achieved: localStorage.getItem('goalAchieved3') === 'true'
                    }
                };
                
                // userIcon（Base64）
                const userIcon = localStorage.getItem('userIcon') || null;
                
                // サイトカスタマイズ設定
                const siteTitle = localStorage.getItem('siteTitle') || null;
                const subtitle = localStorage.getItem('siteSubtitle') || null;
                
                // NEW: トレード分析強化設定
                const methods = StorageValidator.safeLoad('tc_methods', [], StorageValidator.isArray);
                const riskTolerance = localStorage.getItem('tc_risk_tolerance');
                const showBrokerBadge = localStorage.getItem('tc_show_broker_badge');
                
                // NEW: 年初口座残高
                let yearStartBalances = null;
                const yearStartBalancesRaw = localStorage.getItem('yearStartBalances');
                if (yearStartBalancesRaw) {
                    try {
                        yearStartBalances = JSON.parse(yearStartBalancesRaw);
                    } catch (e) {
                        console.warn('[SyncModule] yearStartBalances parse error:', e);
                    }
                }
                
                const supabaseData = {
                    user_id: userId,
                    brokers: brokers,
                    favorite_pairs: favoritePairs,
                    monthly_memos: monthlyMemos,
                    closed_periods: closedPeriods,
                    goals: goals,
                    user_icon: userIcon,
                    site_title: siteTitle,
                    subtitle: subtitle,
                    
                    // NEW: トレード分析強化設定
                    methods: methods,
                    risk_tolerance: riskTolerance ? parseInt(riskTolerance, 10) : null,
                    show_broker_badge: showBrokerBadge === 'true',
                    
                    // NEW: 年初口座残高
                    year_start_balances: yearStartBalances,
                    
                    updated_at: new Date().toISOString()
                };
                
                const { data, error } = await this.#supabase
                    .from('user_settings')
                    .upsert(supabaseData, { onConflict: 'user_id' })
                    .select()
                    .single();
                
                if (error) {
                    console.error('[SyncModule] ユーザー設定保存エラー:', error);
                    return { success: false, error: this.#toUserMessage(error) };
                }
                
                console.log('[SyncModule] ユーザー設定保存成功');
                this.#eventBus?.emit('sync:settings:saved', { userId });
                
                return { success: true, data };
                
            } catch (error) {
                console.error('[SyncModule] saveUserSettings例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
            }
        }
        
        /**
         * Supabaseからユーザー設定を取得
         * @returns {Promise<Object>} { success, data, error }
         */
        async fetchUserSettings() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化', data: null };
            }
            
            try {
                const userId = this.#getCurrentUserId();
                if (!userId) {
                    return { success: false, error: 'ユーザーIDが取得できません', data: null };
                }
                
                const { data, error } = await this.#supabase
                    .from('user_settings')
                    .select('*')
                    .eq('user_id', userId)
                    .single();
                
                if (error) {
                    // PGRST116 は「レコードが見つからない」エラー（初回ユーザー）
                    if (error.code === 'PGRST116') {
                        console.log('[SyncModule] ユーザー設定なし（初回ユーザー）');
                        return { success: true, data: null };
                    }
                    console.error('[SyncModule] ユーザー設定取得エラー:', error);
                    return { success: false, error: this.#toUserMessage(error), data: null };
                }
                
                console.log('[SyncModule] ユーザー設定取得成功');
                
                return { success: true, data };
                
            } catch (error) {
                console.error('[SyncModule] fetchUserSettings例外:', error);
                return { success: false, error: this.#toUserMessage(error), data: null };
            }
        }
        
        /**
         * Supabaseからユーザー設定を取得してlocalStorageに展開
         * @returns {Promise<Object>} { success, error }
         */
        async syncUserSettingsToLocal() {
            if (!this.#initialized) {
                return { success: false, error: '未初期化' };
            }
            
            try {
                const result = await this.fetchUserSettings();
                
                if (!result.success) {
                    return result;
                }
                
                // データがない場合（初回ユーザー）はスキップ
                if (!result.data) {
                    console.log('[SyncModule] ユーザー設定なし、ローカル設定を維持');
                    return { success: true };
                }
                
                const settings = result.data;
                
                // 6つのlocalStorageに展開
                if (settings.brokers) {
                    localStorage.setItem('brokers', JSON.stringify(settings.brokers));
                }
                if (settings.favorite_pairs) {
                    localStorage.setItem('favoritePairs', JSON.stringify(settings.favorite_pairs));
                }
                if (settings.monthly_memos) {
                    localStorage.setItem('monthlyMemos', JSON.stringify(settings.monthly_memos));
                }
                if (settings.closed_periods) {
                    localStorage.setItem('tc_closed_periods', JSON.stringify(settings.closed_periods));
                }
                
                // goals（セルフイメージ）を展開
                if (settings.goals) {
                    const goals = settings.goals;
                    if (goals.goal1) {
                        localStorage.setItem('goalText1', goals.goal1.text || '');
                        localStorage.setItem('goalDeadline1', goals.goal1.deadline || '');
                        localStorage.setItem('goalAchieved1', String(goals.goal1.achieved || false));
                    }
                    if (goals.goal2) {
                        localStorage.setItem('goalText2', goals.goal2.text || '');
                        localStorage.setItem('goalDeadline2', goals.goal2.deadline || '');
                        localStorage.setItem('goalAchieved2', String(goals.goal2.achieved || false));
                    }
                    if (goals.goal3) {
                        localStorage.setItem('goalText3', goals.goal3.text || '');
                        localStorage.setItem('goalDeadline3', goals.goal3.deadline || '');
                        localStorage.setItem('goalAchieved3', String(goals.goal3.achieved || false));
                    }
                }
                
                // userIcon を展開
                if (settings.user_icon) {
                    localStorage.setItem('userIcon', settings.user_icon);
                }
                
                // サイトカスタマイズ設定を展開
                if (settings.site_title) {
                    localStorage.setItem('siteTitle', settings.site_title);
                }
                if (settings.subtitle) {
                    localStorage.setItem('siteSubtitle', settings.subtitle);
                }
                
                // NEW: トレード分析強化設定を展開
                if (settings.methods) {
                    localStorage.setItem('tc_methods', JSON.stringify(settings.methods));
                }
                if (settings.risk_tolerance !== null && settings.risk_tolerance !== undefined) {
                    localStorage.setItem('tc_risk_tolerance', String(settings.risk_tolerance));
                }
                if (settings.show_broker_badge !== null && settings.show_broker_badge !== undefined) {
                    localStorage.setItem('tc_show_broker_badge', String(settings.show_broker_badge));
                }
                
                // NEW: 年初口座残高を展開
                if (settings.year_start_balances) {
                    localStorage.setItem('yearStartBalances', JSON.stringify(settings.year_start_balances));
                    console.log('[SyncModule] 年初口座残高を同期:', Object.keys(settings.year_start_balances).length, '年分');
                }
                
                console.log('[SyncModule] ユーザー設定をlocalStorageに同期完了');
                this.#eventBus?.emit('sync:settings:synced', {});
                
                return { success: true };
                
            } catch (error) {
                console.error('[SyncModule] syncUserSettingsToLocal例外:', error);
                return { success: false, error: this.#toUserMessage(error) };
            }
        }
        
        /**
         * localStorageのユーザー設定をSupabaseに移行
         * @returns {Promise<Object>} { success, error }
         */
        async migrateUserSettingsFromLocal() {
            // saveUserSettings と同じ処理
            return await this.saveUserSettings();
        }
        
        // ========== Private Methods: イベントリスナー ==========
        
        /**
         * EventBusリスナーを設定
         */
        #setupEventListeners() {
            if (!this.#eventBus) return;
            
            // settings:changed イベントを購読
            this.#eventBus.on('settings:changed', () => {
                console.log('[SyncModule] settings:changed イベント受信、設定を同期');
                this.saveUserSettings().catch(err => {
                    console.error('[SyncModule] 設定自動同期エラー:', err);
                });
            });
            
            // NEW: 手法管理イベントを購読
            this.#eventBus.on('settings:methodAdded', () => {
                console.log('[SyncModule] settings:methodAdded イベント受信、設定を同期');
                this.saveUserSettings().catch(err => {
                    console.error('[SyncModule] 手法追加同期エラー:', err);
                });
            });
            
            this.#eventBus.on('settings:methodDeleted', () => {
                console.log('[SyncModule] settings:methodDeleted イベント受信、設定を同期');
                this.saveUserSettings().catch(err => {
                    console.error('[SyncModule] 手法削除同期エラー:', err);
                });
            });
            
            // NEW: リスク設定イベントを購読
            this.#eventBus.on('settings:riskToleranceUpdated', () => {
                console.log('[SyncModule] settings:riskToleranceUpdated イベント受信、設定を同期');
                this.saveUserSettings().catch(err => {
                    console.error('[SyncModule] リスク設定同期エラー:', err);
                });
            });
            
            // NEW: ブローカーバッジ設定イベントを購読
            this.#eventBus.on('settings:showBrokerBadgeUpdated', () => {
                console.log('[SyncModule] settings:showBrokerBadgeUpdated イベント受信、設定を同期');
                this.saveUserSettings().catch(err => {
                    console.error('[SyncModule] ブローカーバッジ設定同期エラー:', err);
                });
            });
        }
        
        // ========== Private Methods: 画像アップロード ==========
        
        /**
         * トレードの画像をSupabase Storageにアップロード
         * Base64 → URL に変換
         * @param {Object} trade - トレードデータ
         * @returns {Promise<Object>} 画像URLに変換されたトレード
         */
        async #uploadTradeImages(trade) {
            // chartImagesがない、または空の場合はそのまま返す
            if (!trade.chartImages || trade.chartImages.length === 0) {
                return trade;
            }
            
            const userId = this.#getCurrentUserId();
            if (!userId) {
                console.warn('[SyncModule] userId がないため画像アップロードをスキップ');
                return trade;
            }
            
            // ImageHandlerが利用可能か確認
            if (typeof ImageHandler === 'undefined' || !ImageHandler.uploadToCloud) {
                console.warn('[SyncModule] ImageHandler が利用できないため画像アップロードをスキップ');
                return trade;
            }
            
            const updatedImages = [];
            
            for (let i = 0; i < trade.chartImages.length; i++) {
                const img = trade.chartImages[i];
                
                // nullの場合はそのまま
                if (!img) {
                    updatedImages.push(null);
                    continue;
                }
                
                // 画像データを抽出（文字列形式とオブジェクト形式の両方に対応）
                let base64Data = null;
                let imgType = `chart${i + 1}`;
                let imgTimestamp = new Date().toISOString();
                let imgTitle = '';
                let imgDescription = '';
                
                if (typeof img === 'string') {
                    // 文字列形式: 'data:image/...' または 'http://...'
                    if (img.startsWith('http')) {
                        // 既にURLの場合はそのまま
                        updatedImages.push({
                            type: imgType,
                            url: img,
                            path: null,
                            timestamp: imgTimestamp,
                            title: '',
                            description: ''
                        });
                        continue;
                    }
                    if (img.startsWith('data:image')) {
                        base64Data = img;
                    }
                } else if (typeof img === 'object') {
                    // オブジェクト形式: { data: '...', url: '...', type: '...', title: '...', description: '...' }
                    imgType = img.type || imgType;
                    imgTimestamp = img.timestamp || imgTimestamp;
                    imgTitle = img.title || '';
                    imgDescription = img.description || '';
                    
                    if (img.url && img.url.startsWith('http')) {
                        // 既にURLの場合はそのまま（title/descriptionを保持）
                        updatedImages.push({
                            ...img,
                            title: imgTitle,
                            description: imgDescription
                        });
                        continue;
                    }
                    // src形式にも対応
                    if (img.src && img.src.startsWith('http')) {
                        updatedImages.push({
                            type: imgType,
                            url: img.src,
                            path: img.path || null,
                            timestamp: imgTimestamp,
                            title: imgTitle,
                            description: imgDescription
                        });
                        continue;
                    }
                    if (img.data && img.data.startsWith('data:image')) {
                        base64Data = img.data;
                    }
                    // src形式のbase64にも対応
                    if (img.src && img.src.startsWith('data:image')) {
                        base64Data = img.src;
                    }
                }
                
                // Base64データがない場合はそのまま
                if (!base64Data) {
                    updatedImages.push(img);
                    continue;
                }
                
                // Base64をSupabase Storageにアップロード
                try {
                    const path = `trades/${trade.id}/${imgType}.jpg`;
                    
                    console.log(`[SyncModule] 画像アップロード中: ${path}`);
                    
                    const result = await ImageHandler.uploadToCloud(base64Data, {
                        userId: userId,
                        path: path,
                        compress: false // 既に圧縮済み
                    });
                    
                    // URL形式に変換（title/descriptionを保持）
                    updatedImages.push({
                        type: imgType,
                        url: result.url,
                        path: result.path,
                        timestamp: imgTimestamp,
                        title: imgTitle,
                        description: imgDescription
                    });
                    
                    console.log(`[SyncModule] 画像アップロード成功: ${path}`);
                    
                } catch (error) {
                    console.error(`[SyncModule] 画像アップロード失敗:`, error);
                    // エラー時はBase64のまま保持（フォールバック）
                    updatedImages.push(img);
                }
            }
            
            // 更新されたトレードを返す
            return {
                ...trade,
                chartImages: updatedImages
            };
        }
        
        /**
         * ノート画像をSupabase Storageにアップロード
         * @private
         * @param {string} dateStr - 日付文字列（YYYY-MM-DD）
         * @param {Object} noteData - ノートデータ
         * @returns {Promise<Object>} 画像URLに変換されたノートデータ
         */
        async #uploadNoteImages(dateStr, noteData) {
            // imagesがない、または空の場合はそのまま返す
            if (!noteData.images || noteData.images.length === 0) {
                return noteData;
            }
            
            const userId = this.#getCurrentUserId();
            if (!userId) {
                console.warn('[SyncModule] userId がないためノート画像アップロードをスキップ');
                return noteData;
            }
            
            // ImageHandlerが利用可能か確認
            if (typeof ImageHandler === 'undefined' || !ImageHandler.uploadToCloud) {
                console.warn('[SyncModule] ImageHandler が利用できないためノート画像アップロードをスキップ');
                return noteData;
            }
            
            const updatedImages = [];
            
            for (let i = 0; i < noteData.images.length; i++) {
                const img = noteData.images[i];
                
                // nullの場合はそのまま
                if (!img) {
                    updatedImages.push(null);
                    continue;
                }
                
                // 画像データを抽出（文字列形式とオブジェクト形式の両方に対応）
                let base64Data = null;
                let imgType = `image${i + 1}`;
                let imgTimestamp = new Date().toISOString();
                let imgTitle = '';
                let imgDescription = '';
                
                if (typeof img === 'string') {
                    // 文字列形式: 'data:image/...' または 'http://...'
                    if (img.startsWith('http')) {
                        // 既にURLの場合はそのまま
                        updatedImages.push({
                            type: imgType,
                            url: img,
                            path: null,
                            timestamp: imgTimestamp,
                            title: '',
                            description: ''
                        });
                        continue;
                    }
                    if (img.startsWith('data:image')) {
                        base64Data = img;
                    }
                } else if (typeof img === 'object') {
                    // オブジェクト形式: { data: '...', url: '...', type: '...', title: '...', description: '...' }
                    imgType = img.type || imgType;
                    imgTimestamp = img.timestamp || imgTimestamp;
                    imgTitle = img.title || '';
                    imgDescription = img.description || '';
                    
                    if (img.url && img.url.startsWith('http')) {
                        // 既にURLの場合はそのまま（title/descriptionを保持）
                        updatedImages.push({
                            ...img,
                            title: imgTitle,
                            description: imgDescription
                        });
                        continue;
                    }
                    // src形式にも対応
                    if (img.src && img.src.startsWith('http')) {
                        updatedImages.push({
                            type: imgType,
                            url: img.src,
                            path: img.path || null,
                            timestamp: imgTimestamp,
                            title: imgTitle,
                            description: imgDescription
                        });
                        continue;
                    }
                    if (img.data && img.data.startsWith('data:image')) {
                        base64Data = img.data;
                    }
                    // src形式のbase64にも対応
                    if (img.src && img.src.startsWith('data:image')) {
                        base64Data = img.src;
                    }
                }
                
                // Base64データがない場合はそのまま
                if (!base64Data) {
                    updatedImages.push(img);
                    continue;
                }
                
                // Base64をSupabase Storageにアップロード
                try {
                    const path = `notes/${dateStr}/${imgType}.jpg`;
                    
                    console.log(`[SyncModule] ノート画像アップロード中: ${path}`);
                    
                    const result = await ImageHandler.uploadToCloud(base64Data, {
                        userId: userId,
                        path: path,
                        compress: false // 既に圧縮済み
                    });
                    
                    // URL形式に変換（title/descriptionを保持）
                    updatedImages.push({
                        type: imgType,
                        url: result.url,
                        path: result.path,
                        timestamp: imgTimestamp,
                        title: imgTitle,
                        description: imgDescription
                    });
                    
                    console.log(`[SyncModule] ノート画像アップロード成功: ${path}`);
                    
                } catch (error) {
                    console.error(`[SyncModule] ノート画像アップロード失敗:`, error);
                    // エラー時はBase64のまま保持（フォールバック）
                    updatedImages.push(img);
                }
            }
            
            // 更新されたノートを返す
            return {
                ...noteData,
                images: updatedImages
            };
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
                
                // NEW: リスク管理フィールド
                method_id: local.methodId || null,
                risk_tolerance: local.riskTolerance || null,
                stop_loss_pips: local.stopLossPips || null,
                quote_currency_rate: local.quoteCurrencyRate || null,
                calculated_lot: local.calculatedLot || null,
                risk_status: local.riskStatus || null,
                is_over_risk: local.isOverRisk || false,
                
                // tags（セッションタグ等）
                tags: local.tags || [],
                
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
                
                // NEW: リスク管理フィールド
                methodId: supa.method_id || null,
                riskTolerance: supa.risk_tolerance ? parseFloat(supa.risk_tolerance) : null,
                stopLossPips: supa.stop_loss_pips ? parseFloat(supa.stop_loss_pips) : null,
                quoteCurrencyRate: supa.quote_currency_rate ? parseFloat(supa.quote_currency_rate) : null,
                calculatedLot: supa.calculated_lot ? parseFloat(supa.calculated_lot) : null,
                riskStatus: supa.risk_status || null,
                isOverRisk: supa.is_over_risk || false,
                
                // tags（セッションタグ等）
                tags: supa.tags || [],
                
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
        
        // ========== Private Methods: データ変換（Expenses） ==========
        
        /**
         * localStorage形式 → Supabase形式（Expenses）
         * memo, taxYear を description(JSON) に含める
         * @param {Object} local - localStorageの経費データ
         * @returns {Object} Supabase用データ
         */
        #localExpenseToSupabase(local) {
            const userId = this.#getCurrentUserId();
            
            // description に memo, taxYear を含める
            const descriptionObj = {
                text: local.description || '',
                memo: local.memo || '',
                taxYear: local.taxYear || null
            };
            
            return {
                id: local.id,
                user_id: userId,
                date: local.date,
                amount: local.amount,
                category: local.category,
                description: JSON.stringify(descriptionObj),
                created_at: local.createdAt || new Date().toISOString()
            };
        }
        
        /**
         * Supabase形式 → localStorage形式（Expenses）
         * @param {Object} supa - Supabaseの経費データ
         * @returns {Object} localStorage形式
         */
        #supabaseExpenseToLocal(supa) {
            // description をパース
            let descriptionObj = { text: '', memo: '', taxYear: null };
            
            if (supa.description) {
                try {
                    // JSON形式の場合
                    descriptionObj = JSON.parse(supa.description);
                } catch {
                    // プレーンテキストの場合（後方互換性）
                    descriptionObj = { 
                        text: supa.description, 
                        memo: '', 
                        taxYear: null 
                    };
                }
            }
            
            // taxYear が null の場合、日付から推定
            let taxYear = descriptionObj.taxYear;
            if (!taxYear && supa.date) {
                const dateObj = new Date(supa.date);
                const month = dateObj.getMonth() + 1;
                const year = dateObj.getFullYear();
                // 1-3月は前年度
                taxYear = month <= 3 ? year - 1 : year;
            }
            
            return {
                id: supa.id,
                date: supa.date,
                amount: supa.amount ? parseFloat(supa.amount) : 0,
                category: supa.category,
                description: descriptionObj.text || '',
                memo: descriptionObj.memo || '',
                taxYear: taxYear,
                createdAt: supa.created_at
            };
        }
        
        // ========== Private Methods: データ変換（Capital Records） ==========
        
        /**
         * localStorage形式 → Supabase形式（Capital Records）
         * @param {Object} local - localStorageの入出金データ
         * @returns {Object} Supabase用データ
         */
        #localCapitalToSupabase(local) {
            const userId = this.#getCurrentUserId();
            
            return {
                id: local.id,
                user_id: userId,
                date: local.date,
                type: local.type,           // 'deposit' or 'withdrawal'
                amount: local.amount,
                memo: local.note || '',     // localStorage: note → Supabase: memo
                created_at: local.createdAt || new Date().toISOString()
            };
        }
        
        /**
         * Supabase形式 → localStorage形式（Capital Records）
         * @param {Object} supa - Supabaseの入出金データ
         * @returns {Object} localStorage形式
         */
        #supabaseCapitalToLocal(supa) {
            return {
                id: supa.id,
                date: supa.date,
                type: supa.type,
                amount: supa.amount ? parseFloat(supa.amount) : 0,
                balance: 0,                  // 残高は後でCapitalManagerModuleが再計算
                note: supa.memo || '',       // Supabase: memo → localStorage: note
                createdAt: supa.created_at
            };
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
    
    console.log('[SyncModule] モジュール読み込み完了 v1.7.0');
    
})();