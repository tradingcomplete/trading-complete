/**
 * @module ImageAddModalModule
 * @description 画像追加モーダルの管理モジュール（MODULES.md準拠）
 * @author Claude / コンパナ
 * @version 1.0.2
 * @changelog
 *   v1.0.0 - 初版
 *   v1.0.1 - URL追加後にモーダルを閉じる修正
 *   v1.0.2 - showImageUploadOptions引数対応修正
 */
class ImageAddModalModule {
    // ========== Private Fields ==========
    #modal = null;
    #dropZone = null;
    #fileInput = null;
    #urlInput = null;
    #eventBus = null;
    #initialized = false;
    
    // 設定
    #config = {
        maxFileSize: 5 * 1024 * 1024, // 5MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    };
    
    constructor() {
        this.#eventBus = window.eventBus;
        console.log('ImageAddModalModule: コンストラクタ実行');
    }
    
    // ========== Public API ==========
    
    /**
     * モジュール初期化
     * @public
     */
    initialize() {
        if (this.#initialized) {
            console.log('ImageAddModalModule: 既に初期化済み');
            return;
        }
        
        try {
            this.#cacheElements();
            this.#bindEvents();
            this.#initialized = true;
            console.log('ImageAddModalModule: 初期化完了');
        } catch (error) {
            console.error('ImageAddModalModule: 初期化エラー', error);
        }
    }
    
    /**
     * モーダルを開く
     * @param {string} imageType - 画像タイプ（例: 'tradeChart1'）
     * @param {string} [tradeId] - トレードID（編集時）
     * @public
     */
    open(imageType, tradeId = null) {
        if (!this.#modal) {
            console.error('ImageAddModalModule: モーダル要素が見つかりません');
            return;
        }
        
        // グローバル変数設定（既存コードとの互換性）
        window.pendingImageType = imageType;
        window.selectedTradeForEdit = tradeId;
        
        // モーダル表示
        this.#modal.style.display = 'flex';
        this.#resetForm();
        
        console.log('ImageAddModalModule: モーダルを開く', { imageType, tradeId });
        this.#eventBus?.emit('imageModal:opened', { imageType, tradeId });
    }
    
    /**
     * モーダルを閉じる
     * @public
     */
    close() {
        if (!this.#modal) return;
        
        this.#modal.style.display = 'none';
        this.#resetForm();
        
        // グローバル変数クリア
        window.pendingImageType = null;
        
        console.log('ImageAddModalModule: モーダルを閉じる');
        this.#eventBus?.emit('imageModal:closed');
    }
    
    /**
     * ステータス取得（デバッグ用）
     * @returns {Object} ステータス情報
     * @public
     */
    getStatus() {
        return {
            initialized: this.#initialized,
            modalExists: !!this.#modal,
            dropZoneExists: !!this.#dropZone,
            config: this.#config
        };
    }
    
    // ========== Private Methods ==========
    
    /**
     * DOM要素をキャッシュ
     * @private
     */
    #cacheElements() {
        this.#modal = document.getElementById('imageAddModal');
        this.#dropZone = document.getElementById('imageDropZone');
        this.#fileInput = document.getElementById('imageFileInput');
        this.#urlInput = document.getElementById('externalImageUrl');
        
        if (!this.#modal) {
            throw new Error('imageAddModal要素が見つかりません');
        }
    }
    
    /**
     * イベントバインド
     * @private
     */
    #bindEvents() {
        // 閉じるボタン
        const closeBtn = document.getElementById('imageAddModalClose');
        closeBtn?.addEventListener('click', () => this.close());
        
        // モーダル背景クリックで閉じる
        this.#modal?.addEventListener('click', (e) => {
            if (e.target === this.#modal) {
                this.close();
            }
        });
        
        // ファイル選択ボタン
        const selectFileBtn = document.getElementById('selectFileBtn');
        selectFileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.#fileInput?.click();
        });
        
        // ドロップゾーンクリック
        this.#dropZone?.addEventListener('click', (e) => {
            // ボタンクリックは除外
            if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
                this.#fileInput?.click();
            }
        });
        
        // ファイル選択
        this.#fileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.#handleFile(file);
            }
        });
        
        // ドラッグ＆ドロップ
        this.#setupDragAndDrop();
        
        // URL追加ボタン
        const addUrlBtn = document.getElementById('addUrlBtn');
        addUrlBtn?.addEventListener('click', () => this.#handleUrlAdd());
        
        // URL入力でEnterキー
        this.#urlInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.#handleUrlAdd();
            }
        });
        
        // ESCキーで閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.#modal?.style.display === 'flex') {
                this.close();
            }
        });
        
        console.log('ImageAddModalModule: イベントバインド完了');
    }
    
    /**
     * ドラッグ＆ドロップ設定
     * @private
     */
    #setupDragAndDrop() {
        if (!this.#dropZone) return;
        
        // ドラッグオーバー
        this.#dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.#dropZone.classList.add('drag-over');
        });
        
        // ドラッグリーブ
        this.#dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.#dropZone.classList.remove('drag-over');
        });
        
        // ドロップ
        this.#dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.#dropZone.classList.remove('drag-over');
            
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                this.#handleFile(files[0]);
            }
        });
    }
    
    /**
     * ファイル処理
     * @param {File} file - 選択されたファイル
     * @private
     */
    #handleFile(file) {
        console.log('ImageAddModalModule: ファイル処理開始', file.name);
        
        // バリデーション
        const validation = this.#validateFile(file);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }
        
        // 既存のprocessLocalImage関数を呼び出し
        if (typeof window.processLocalImage === 'function') {
            window.processLocalImage(file);
        } else {
            console.error('processLocalImage関数が見つかりません');
            alert('画像処理機能が利用できません');
        }
    }
    
    /**
     * ファイルバリデーション
     * @param {File} file - ファイル
     * @returns {Object} {valid: boolean, error?: string}
     * @private
     */
    #validateFile(file) {
        // ファイルサイズチェック
        if (file.size > this.#config.maxFileSize) {
            const maxMB = this.#config.maxFileSize / 1024 / 1024;
            return { 
                valid: false, 
                error: `ファイルサイズが${maxMB}MBを超えています` 
            };
        }
        
        // ファイルタイプチェック
        if (!this.#config.allowedTypes.includes(file.type)) {
            return { 
                valid: false, 
                error: '対応していないファイル形式です（PNG, JPG, GIF, WebPのみ）' 
            };
        }
        
        return { valid: true };
    }
    
    /**
     * URL追加処理
     * @private
     */
    #handleUrlAdd() {
        const url = this.#urlInput?.value?.trim();
        
        if (!url) {
            alert('URLを入力してください');
            return;
        }
        
        // URL形式チェック
        if (!this.#isValidUrl(url)) {
            alert('有効なURLを入力してください');
            return;
        }
        
        // 画像URLチェック（簡易）
        if (!this.#isImageUrl(url)) {
            const proceed = confirm('画像ファイルではない可能性があります。続行しますか？');
            if (!proceed) return;
        }
        
        console.log('ImageAddModalModule: URL追加', url);
        
        // 既存のhandleProcessedImage関数を呼び出し
        if (typeof window.handleProcessedImage === 'function') {
            window.handleProcessedImage(url);
            this.close();  // モーダルを閉じる
        } else {
            console.error('handleProcessedImage関数が見つかりません');
            alert('画像処理機能が利用できません');
        }
    }
    
    /**
     * URL形式チェック
     * @param {string} url - URL
     * @returns {boolean}
     * @private
     */
    #isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * 画像URLチェック（簡易）
     * @param {string} url - URL
     * @returns {boolean}
     * @private
     */
    #isImageUrl(url) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
        const lowerUrl = url.toLowerCase();
        return imageExtensions.some(ext => lowerUrl.includes(ext));
    }
    
    /**
     * フォームリセット
     * @private
     */
    #resetForm() {
        if (this.#urlInput) {
            this.#urlInput.value = '';
        }
        if (this.#fileInput) {
            this.#fileInput.value = '';
        }
        this.#dropZone?.classList.remove('drag-over');
    }
}

// ========================================
// グローバル公開・互換性維持
// ========================================

// シングルトンインスタンス
window.ImageAddModalModule = new ImageAddModalModule();

// 既存関数の置き換え（互換性維持）
window.closeImageAddModal = function() {
    window.ImageAddModalModule.close();
};

// showImageUploadOptionsの置き換え（引数対応 v1.0.2）
window.showImageUploadOptions = function(type) {
    if (window.ImageAddModalModule) {
        // type引数を直接渡す（新規エントリー画面からの呼び出し対応）
        window.ImageAddModalModule.open(type, null);
    }
};

// DOMContentLoaded後に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            window.ImageAddModalModule.initialize();
        }, 100);
    });
} else {
    // 既にDOMが読み込まれている場合
    setTimeout(() => {
        window.ImageAddModalModule.initialize();
    }, 100);
}

console.log('ImageAddModalModule.js loaded');