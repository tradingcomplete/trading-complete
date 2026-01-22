/**
 * imageUtils.js - 画像ユーティリティ
 * 
 * chartImagesの両形式（Base64文字列 / URLオブジェクト）に対応
 * v1.1.0: 署名付きURL期限切れ自動更新機能
 * v1.2.0: 画像説明（題名・説明）機能に対応
 * v1.3.0: v1.1.0とv1.2.0の機能をマージ
 * 
 * @version 1.3.0
 * @date 2026-01-22
 */

(function() {
    'use strict';
    
    // ========================================
    // 定数
    // ========================================
    const MAX_TITLE_LENGTH = 30;
    const MAX_DESCRIPTION_LENGTH = 100;
    
    // ========================================
    // 基本関数（既存）
    // ========================================
    
    /**
     * 画像データからソースURLを取得
     * Base64文字列とURLオブジェクトの両方に対応
     * 
     * @param {string|Object|null} img - 画像データ
     * @returns {string|null} 画像のsrc（URLまたはBase64）
     * 
     * @example
     * // 文字列の場合（旧形式）
     * getImageSrc('data:image/jpeg;base64,...') // → 'data:image/jpeg;base64,...'
     * 
     * // オブジェクトの場合（新形式 - 説明付き）
     * getImageSrc({ src: 'https://...', title: '日足' }) // → 'https://...'
     * 
     * // オブジェクトの場合（Supabase形式）
     * getImageSrc({ url: 'https://...', type: 'chart1' }) // → 'https://...'
     * 
     * // nullの場合
     * getImageSrc(null) // → null
     */
    function getImageSrc(img) {
        // null/undefinedの場合
        if (!img) return null;
        
        // 文字列の場合（Base64またはURL）
        if (typeof img === 'string') return img;
        
        // オブジェクトの場合
        if (typeof img === 'object') {
            // src優先（新形式 - 説明付き）
            if (img.src) return img.src;
            // URL（Supabase Storage形式）
            if (img.url) return img.url;
            // Base64（新形式でBase64保存の場合）
            if (img.data) return img.data;
        }
        
        return null;
    }
    
    /**
     * 画像データが有効かどうかを確認
     * 
     * @param {string|Object|null} img - 画像データ
     * @returns {boolean} 有効な画像データかどうか
     */
    function hasValidImage(img) {
        return getImageSrc(img) !== null;
    }
    
    /**
     * 画像がURL形式かどうかを確認
     * 
     * @param {string|Object|null} img - 画像データ
     * @returns {boolean} URL形式かどうか
     */
    function isUrlImage(img) {
        if (!img) return false;
        
        // オブジェクトでurlプロパティがある場合
        if (typeof img === 'object' && img.url) return true;
        
        // オブジェクトでsrcがhttpで始まる場合
        if (typeof img === 'object' && img.src && img.src.startsWith('http')) return true;
        
        // 文字列でhttpで始まる場合
        if (typeof img === 'string' && img.startsWith('http')) return true;
        
        return false;
    }
    
    /**
     * 画像がBase64形式かどうかを確認
     * 
     * @param {string|Object|null} img - 画像データ
     * @returns {boolean} Base64形式かどうか
     */
    function isBase64Image(img) {
        if (!img) return false;
        
        // オブジェクトでsrcがdata:で始まる場合
        if (typeof img === 'object' && img.src && img.src.startsWith('data:')) return true;
        
        // オブジェクトでdataプロパティがある場合
        if (typeof img === 'object' && img.data && img.data.startsWith('data:')) return true;
        
        // 文字列でdata:で始まる場合
        if (typeof img === 'string' && img.startsWith('data:')) return true;
        
        return false;
    }
    
    // ========================================
    // 説明機能（v1.2.0 新規追加）
    // ========================================
    
    /**
     * 画像データを正規化（後方互換対応）
     * 旧形式（文字列）→ 新形式（オブジェクト）に変換
     * 
     * @param {any} img - 画像データ（文字列 or オブジェクト or null）
     * @returns {Object|null} 正規化された画像データ { src, title, description }
     * 
     * @example
     * // 旧形式（文字列）
     * normalizeImageData('data:image/jpeg;base64,...')
     * // → { src: 'data:image/jpeg;base64,...', title: '', description: '' }
     * 
     * // 新形式（オブジェクト）
     * normalizeImageData({ src: 'https://...', title: '日足' })
     * // → { src: 'https://...', title: '日足', description: '' }
     * 
     * // null
     * normalizeImageData(null) // → null
     */
    function normalizeImageData(img) {
        if (!img) return null;
        
        // 既に新形式の場合（srcプロパティあり）
        if (typeof img === 'object' && img.src) {
            return {
                src: img.src,
                title: img.title || '',
                description: img.description || ''
            };
        }
        
        // Supabase形式（urlプロパティ）の場合
        if (typeof img === 'object' && img.url) {
            return {
                src: img.url,
                title: img.title || '',
                description: img.description || ''
            };
        }
        
        // オブジェクトでdataプロパティの場合
        if (typeof img === 'object' && img.data) {
            return {
                src: img.data,
                title: img.title || '',
                description: img.description || ''
            };
        }
        
        // 旧形式（文字列）の場合
        if (typeof img === 'string' && img.trim()) {
            return {
                src: img,
                title: '',
                description: ''
            };
        }
        
        return null;
    }
    
    /**
     * 画像に題名または説明があるか確認
     * 
     * @param {any} img - 画像データ
     * @returns {boolean} 題名または説明があるか
     */
    function hasImageCaption(img) {
        const data = normalizeImageData(img);
        if (!data) return false;
        return !!(data.title || data.description);
    }
    
    /**
     * 画像の題名を取得
     * 
     * @param {any} img - 画像データ
     * @returns {string} 題名（なければ空文字）
     */
    function getImageTitle(img) {
        const data = normalizeImageData(img);
        return data?.title || '';
    }
    
    /**
     * 画像の説明を取得
     * 
     * @param {any} img - 画像データ
     * @returns {string} 説明（なければ空文字）
     */
    function getImageDescription(img) {
        const data = normalizeImageData(img);
        return data?.description || '';
    }
    
    /**
     * 新形式の画像データオブジェクトを生成
     * 
     * @param {string} src - 画像ソース（Base64またはURL）
     * @param {string} [title=''] - 題名（最大30文字）
     * @param {string} [description=''] - 説明（最大100文字）
     * @returns {Object} 画像データオブジェクト { src, title, description }
     * 
     * @example
     * createImageData('data:image/jpeg;base64,...', 'エントリー時の日足', 'サポートラインブレイク')
     * // → { src: 'data:image/jpeg;base64,...', title: 'エントリー時の日足', description: 'サポートラインブレイク' }
     */
    function createImageData(src, title = '', description = '') {
        if (!src) return null;
        
        return {
            src: src,
            title: (title || '').slice(0, MAX_TITLE_LENGTH),
            description: (description || '').slice(0, MAX_DESCRIPTION_LENGTH)
        };
    }
    
    /**
     * 画像データの題名・説明を更新
     * 
     * @param {any} img - 既存の画像データ
     * @param {string} title - 新しい題名
     * @param {string} description - 新しい説明
     * @returns {Object|null} 更新された画像データ
     */
    function updateImageCaption(img, title, description) {
        const data = normalizeImageData(img);
        if (!data) return null;
        
        return {
            src: data.src,
            title: (title || '').slice(0, MAX_TITLE_LENGTH),
            description: (description || '').slice(0, MAX_DESCRIPTION_LENGTH)
        };
    }
    
    // ========================================
    // 署名付きURL期限チェック＆自動更新（v1.1.0）
    // ========================================
    
    /**
     * 署名付きURLの有効期限を取得
     * 
     * @param {string} url - 署名付きURL
     * @returns {Date|null} 有効期限（取得できない場合はnull）
     */
    function getUrlExpiration(url) {
        if (!url || typeof url !== 'string') return null;
        
        try {
            const tokenMatch = url.match(/token=([^&]+)/);
            if (!tokenMatch) return null;
            
            const token = tokenMatch[1];
            const payload = JSON.parse(atob(token.split('.')[1]));
            
            if (payload.exp) {
                return new Date(payload.exp * 1000);
            }
        } catch (e) {
            console.warn('[imageUtils] JWT解析エラー:', e);
        }
        
        return null;
    }
    
    /**
     * 署名付きURLが期限切れかどうかを確認
     * 余裕を持って1時間前から期限切れとみなす
     * 
     * @param {string|Object} img - 画像データ
     * @returns {boolean} 期限切れかどうか
     */
    function isUrlExpired(img) {
        // Base64は期限なし
        if (isBase64Image(img)) return false;
        
        const url = typeof img === 'object' ? (img.url || img.src) : img;
        if (!url || !url.includes('token=')) return false;
        
        const expiration = getUrlExpiration(url);
        if (!expiration) return false;
        
        // 1時間の余裕を持つ
        const now = new Date();
        const buffer = 60 * 60 * 1000; // 1時間
        
        return expiration.getTime() - buffer < now.getTime();
    }
    
    /**
     * 有効な画像URLを取得（期限切れなら自動更新）
     * 
     * @param {string|Object} img - 画像データ
     * @param {Object} options - オプション
     * @param {number} options.expiresIn - 新URLの有効期間（秒）デフォルト7日
     * @returns {Promise<string|null>} 有効な画像URL
     */
    async function getValidImageSrc(img, options = {}) {
        // null/undefinedの場合
        if (!img) return null;
        
        // Base64の場合はそのまま返す
        if (isBase64Image(img)) {
            return getImageSrc(img);
        }
        
        // URL形式でない場合
        if (!isUrlImage(img)) {
            return getImageSrc(img);
        }
        
        // 期限切れでない場合はそのまま返す
        if (!isUrlExpired(img)) {
            return getImageSrc(img);
        }
        
        // 期限切れの場合：pathから新しいURLを取得
        const path = typeof img === 'object' ? img.path : null;
        if (!path) {
            console.warn('[imageUtils] pathがないため更新できません');
            return getImageSrc(img);
        }
        
        // Supabaseが利用可能か確認
        if (typeof getSupabase !== 'function') {
            console.warn('[imageUtils] Supabaseが利用できません');
            return getImageSrc(img);
        }
        
        try {
            const expiresIn = options.expiresIn || 604800; // デフォルト7日
            const { data, error } = await getSupabase()
                .storage
                .from('trade-images')
                .createSignedUrl(path, expiresIn);
            
            if (error) {
                console.error('[imageUtils] URL更新エラー:', error);
                return getImageSrc(img);
            }
            
            if (data?.signedUrl) {
                console.log('[imageUtils] URL自動更新:', path);
                
                // 元のオブジェクトも更新（参照渡しなので反映される）
                if (typeof img === 'object') {
                    img.url = data.signedUrl;
                    if (img.src && img.src.startsWith('http')) {
                        img.src = data.signedUrl;
                    }
                }
                
                return data.signedUrl;
            }
        } catch (e) {
            console.error('[imageUtils] URL更新例外:', e);
        }
        
        return getImageSrc(img);
    }
    
    /**
     * ノートの全画像URLを検証・更新
     * 
     * @param {Object} note - ノートデータ
     * @returns {Promise<boolean>} 更新があったかどうか
     */
    async function refreshNoteImageUrls(note) {
        if (!note?.images || note.images.length === 0) return false;
        
        let updated = false;
        
        for (let i = 0; i < note.images.length; i++) {
            const img = note.images[i];
            if (isUrlExpired(img) && img?.path) {
                const newUrl = await getValidImageSrc(img);
                if (newUrl && newUrl !== getImageSrc(note.images[i])) {
                    updated = true;
                }
            }
        }
        
        return updated;
    }
    
    /**
     * トレードの全画像URLを検証・更新
     * 
     * @param {Object} trade - トレードデータ
     * @returns {Promise<boolean>} 更新があったかどうか
     */
    async function refreshTradeImageUrls(trade) {
        if (!trade?.chartImages || trade.chartImages.length === 0) return false;
        
        let updated = false;
        
        for (let i = 0; i < trade.chartImages.length; i++) {
            const img = trade.chartImages[i];
            if (isUrlExpired(img) && img?.path) {
                const newUrl = await getValidImageSrc(img);
                if (newUrl && newUrl !== getImageSrc(trade.chartImages[i])) {
                    updated = true;
                }
            }
        }
        
        return updated;
    }
    
    // ========================================
    // グローバルに公開
    // ========================================
    
    // 既存関数
    window.getImageSrc = getImageSrc;
    window.hasValidImage = hasValidImage;
    window.isUrlImage = isUrlImage;
    window.isBase64Image = isBase64Image;
    
    // 新規関数（v1.2.0 - 説明機能）
    window.normalizeImageData = normalizeImageData;
    window.hasImageCaption = hasImageCaption;
    window.getImageTitle = getImageTitle;
    window.getImageDescription = getImageDescription;
    window.createImageData = createImageData;
    window.updateImageCaption = updateImageCaption;
    
    // v1.1.0 機能（期限切れURL処理）
    window.getUrlExpiration = getUrlExpiration;
    window.isUrlExpired = isUrlExpired;
    window.getValidImageSrc = getValidImageSrc;
    window.refreshNoteImageUrls = refreshNoteImageUrls;
    window.refreshTradeImageUrls = refreshTradeImageUrls;
    
    // 定数も公開（他モジュールで参照可能に）
    window.IMAGE_CAPTION_LIMITS = {
        maxTitleLength: MAX_TITLE_LENGTH,
        maxDescriptionLength: MAX_DESCRIPTION_LENGTH
    };
    
    console.log('[imageUtils] 画像ユーティリティ読み込み完了 v1.3.0（説明機能+URL自動更新）');
    
})();