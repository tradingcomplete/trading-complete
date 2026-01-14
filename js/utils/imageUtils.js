/**
 * imageUtils.js - 画像ユーティリティ
 * 
 * chartImagesの両形式（Base64文字列 / URLオブジェクト）に対応
 * v1.1.0: 署名付きURL期限チェック＆自動更新機能追加
 * 
 * @version 1.1.0
 * @date 2026-01-14
 */
(function() {
    'use strict';
    
    /**
     * 画像データからソースURLを取得
     * Base64文字列とURLオブジェクトの両方に対応
     * 
     * @param {string|Object|null} img - 画像データ
     * @returns {string|null} 画像のsrc（URLまたはBase64）
     */
    function getImageSrc(img) {
        if (!img) return null;
        if (typeof img === 'string') return img;
        if (typeof img === 'object') {
            if (img.url) return img.url;
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
        if (typeof img === 'object' && img.url) return true;
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
        if (typeof img === 'object' && img.data && img.data.startsWith('data:')) return true;
        if (typeof img === 'string' && img.startsWith('data:')) return true;
        return false;
    }
    
    // ================
    // v1.1.0 新機能: 署名付きURL期限チェック＆自動更新
    // ================
    
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
        
        const url = typeof img === 'object' ? img.url : img;
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
            if (isUrlExpired(img) && img.path) {
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
            if (isUrlExpired(img) && img.path) {
                const newUrl = await getValidImageSrc(img);
                if (newUrl && newUrl !== getImageSrc(trade.chartImages[i])) {
                    updated = true;
                }
            }
        }
        
        return updated;
    }
    
    // グローバルに公開
    window.getImageSrc = getImageSrc;
    window.hasValidImage = hasValidImage;
    window.isUrlImage = isUrlImage;
    window.isBase64Image = isBase64Image;
    
    // v1.1.0 新機能
    window.getUrlExpiration = getUrlExpiration;
    window.isUrlExpired = isUrlExpired;
    window.getValidImageSrc = getValidImageSrc;
    window.refreshNoteImageUrls = refreshNoteImageUrls;
    window.refreshTradeImageUrls = refreshTradeImageUrls;
    
    console.log('[imageUtils] 画像ユーティリティ読み込み完了 v1.1.0');
    
})();