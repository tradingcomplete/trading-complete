/**
 * imageUtils.js - 画像ユーティリティ
 * 
 * chartImagesの両形式（Base64文字列 / URLオブジェクト）に対応
 * v1.2.0: 画像説明（題名・説明）機能に対応
 * 
 * @version 1.2.0
 * @date 2026-01-17
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
    // グローバルに公開
    // ========================================
    
    // 既存関数
    window.getImageSrc = getImageSrc;
    window.hasValidImage = hasValidImage;
    window.isUrlImage = isUrlImage;
    window.isBase64Image = isBase64Image;
    
    // 新規関数（v1.2.0）
    window.normalizeImageData = normalizeImageData;
    window.hasImageCaption = hasImageCaption;
    window.getImageTitle = getImageTitle;
    window.getImageDescription = getImageDescription;
    window.createImageData = createImageData;
    window.updateImageCaption = updateImageCaption;
    
    // 定数も公開（他モジュールで参照可能に）
    window.IMAGE_CAPTION_LIMITS = {
        maxTitleLength: MAX_TITLE_LENGTH,
        maxDescriptionLength: MAX_DESCRIPTION_LENGTH
    };
    
    console.log('[imageUtils] 画像ユーティリティ読み込み完了 v1.2.0（説明機能対応）');
    
})();