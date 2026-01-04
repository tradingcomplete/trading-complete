/**
 * imageUtils.js - 画像ユーティリティ
 * 
 * chartImagesの両形式（Base64文字列 / URLオブジェクト）に対応
 * 
 * @version 1.0.0
 * @date 2026-01-04
 */

(function() {
    'use strict';
    
    /**
     * 画像データからソースURLを取得
     * Base64文字列とURLオブジェクトの両方に対応
     * 
     * @param {string|Object|null} img - 画像データ
     * @returns {string|null} 画像のsrc（URLまたはBase64）
     * 
     * @example
     * // 文字列の場合
     * getImageSrc('data:image/jpeg;base64,...') // → 'data:image/jpeg;base64,...'
     * 
     * // オブジェクトの場合（新形式）
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
            // URL優先（新形式 - Supabase Storage）
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
        
        // オブジェクトでdataプロパティがある場合
        if (typeof img === 'object' && img.data && img.data.startsWith('data:')) return true;
        
        // 文字列でdata:で始まる場合
        if (typeof img === 'string' && img.startsWith('data:')) return true;
        
        return false;
    }
    
    // グローバルに公開
    window.getImageSrc = getImageSrc;
    window.hasValidImage = hasValidImage;
    window.isUrlImage = isUrlImage;
    window.isBase64Image = isBase64Image;
    
    console.log('[imageUtils] 画像ユーティリティ読み込み完了 v1.0.0');
    
})();
