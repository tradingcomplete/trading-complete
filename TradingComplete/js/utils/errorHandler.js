/**
 * errorHandler.js
 * Trading Complete - 統一エラーハンドリング
 * Version: 1.0
 * 
 * アプリケーション全体のエラー処理を統一管理
 */

class ErrorHandler {
    /**
     * エラー処理の中心メソッド
     * @param {Error} error - エラーオブジェクト
     * @param {string} context - エラーが発生したコンテキスト
     * @param {Object} options - オプション設定
     */
    static handle(error, context = 'Unknown', options = {}) {
        const {
            showToast = true,
            logToConsole = true,
            sendToServer = false,
            silent = false
        } = options;
        
        // エラー情報の構築（nullチェック追加）
        const errorInfo = {
            message: (error && error.message) || 'Unknown error',
            code: (error && error.code) || 'UNKNOWN',
            context: context,
            timestamp: new Date().toISOString(),
            stack: (error && error.stack) || '',
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        // コンソールログ出力
        if (logToConsole && CONFIG.APP.DEBUG_MODE) {
            console.error(`[${context}]`, errorInfo);
            if (error.stack) {
                console.trace();
            }
        }
        
        // ユーザー向けメッセージの生成
        const userMessage = this.getUserMessage(error);
        
        // トースト通知の表示
        if (showToast && !silent && typeof window.showToast === 'function') {
            window.showToast(userMessage, 'error');
        }
        
        // サーバーへのエラー送信（将来実装）
        if (sendToServer && CONFIG.API.BASE_URL) {
            this.sendToServer(errorInfo);
        }
        
        // エラーの種類に応じた追加処理
        this.handleSpecificError(error, context);
        
        return errorInfo;
    }
    
    /**
     * ユーザー向けメッセージの生成
     * @param {Error} error - エラーオブジェクト
     * @returns {string} ユーザー向けメッセージ
     */
    static getUserMessage(error) {
        // nullチェック
        if (!error) {
            return 'エラーが発生しました。';
        }
        
        // エラーコードに基づくメッセージマッピング
        const errorMessages = {
            'QUOTA_EXCEEDED': CONSTANTS.MESSAGES.STORAGE_FULL,
            'QUOTA_EXCEEDED_ERR': CONSTANTS.MESSAGES.STORAGE_FULL,
            'QuotaExceededError': CONSTANTS.MESSAGES.STORAGE_FULL,
            'NETWORK_ERROR': CONSTANTS.MESSAGES.NETWORK_ERROR,
            'CSV_ERROR': CONSTANTS.MESSAGES.CSV_FORMAT_ERROR,
            'CSV_PARSE_ERROR': CONSTANTS.MESSAGES.CSV_FORMAT_ERROR,
            'IMAGE_TOO_LARGE': CONSTANTS.MESSAGES.IMAGE_TOO_LARGE,
            'INVALID_DATE': CONSTANTS.MESSAGES.INVALID_DATE,
            'INVALID_PRICE': CONSTANTS.MESSAGES.INVALID_PRICE,
            'INVALID_PAIR': CONSTANTS.MESSAGES.INVALID_PAIR,
            'TRADE_LIMIT': CONSTANTS.MESSAGES.TRADE_LIMIT_EXCEEDED,
            'AUTH_ERROR': '認証エラーが発生しました。再度ログインしてください。',
            'PERMISSION_DENIED': 'この操作を実行する権限がありません。',
            'VALIDATION_ERROR': '入力内容に誤りがあります。確認してください。',
            'FILE_NOT_FOUND': 'ファイルが見つかりません。',
            'TIMEOUT': '処理がタイムアウトしました。再度お試しください。',
            'DUPLICATE_ENTRY': '既に同じデータが存在します。',
            'UNSUPPORTED_FORMAT': 'サポートされていないファイル形式です。'
        };
        
        // エラーコードでメッセージを検索
        if (error.code && errorMessages[error.code]) {
            return errorMessages[error.code];
        }
        
        // エラー名でメッセージを検索
        if (error.name && errorMessages[error.name]) {
            return errorMessages[error.name];
        }
        
        // エラーメッセージに特定のキーワードが含まれる場合
        const message = error.message || '';
        if (message.includes('quota') || message.includes('storage')) {
            return CONSTANTS.MESSAGES.STORAGE_FULL;
        }
        if (message.includes('network') || message.includes('fetch')) {
            return CONSTANTS.MESSAGES.NETWORK_ERROR;
        }
        if (message.includes('CSV') || message.includes('parse')) {
            return CONSTANTS.MESSAGES.CSV_FORMAT_ERROR;
        }
        
        // デフォルトメッセージ
        return 'エラーが発生しました。しばらくしてから再度お試しください。';
    }
    
    /**
     * 特定のエラーに対する追加処理
     * @param {Error} error - エラーオブジェクト
     * @param {string} context - エラーコンテキスト
     */
    static handleSpecificError(error, context) {
        // ストレージ容量超過エラー
        if (error.name === 'QuotaExceededError' || error.code === 'QUOTA_EXCEEDED') {
            this.handleStorageError();
        }
        
        // ネットワークエラー
        if (error.code === 'NETWORK_ERROR' || error.message.includes('fetch')) {
            this.handleNetworkError();
        }
        
        // 認証エラー
        if (error.code === 'AUTH_ERROR' || error.code === 'PERMISSION_DENIED') {
            this.handleAuthError();
        }
        
        // CSVパースエラー
        if (context === 'CSV_IMPORT' || error.code === 'CSV_ERROR') {
            this.handleCSVError(error);
        }
    }
    
    /**
     * ストレージエラーの処理
     */
    static handleStorageError() {
        // ストレージ使用量を確認
        if (typeof window.checkStorageUsage === 'function') {
            const usage = window.checkStorageUsage();
            console.warn(`Storage usage: ${usage.usedMB}MB / ${usage.maxMB}MB (${usage.usagePercent}%)`);
        }
        
        // クリーンアップの提案
        if (typeof window.showToast === 'function') {
            setTimeout(() => {
                window.showToast('古いデータを削除することで容量を確保できます。設定タブから実行してください。', 'info');
            }, 3000);
        }
    }
    
    /**
     * ネットワークエラーの処理
     */
    static handleNetworkError() {
        // オフライン状態の確認
        if (!navigator.onLine) {
            if (typeof window.showToast === 'function') {
                window.showToast('インターネット接続が切断されています。', 'warning');
            }
        }
        
        // リトライの提案
        console.info('Network error detected. Consider implementing retry logic.');
    }
    
    /**
     * 認証エラーの処理
     */
    static handleAuthError() {
        // 将来実装: ログイン画面へのリダイレクト
        console.warn('Authentication error. User may need to re-login.');
    }
    
    /**
     * CSVエラーの処理
     */
    static handleCSVError(error) {
        // 詳細なエラー情報をログ
        console.error('CSV Parse Error Details:', {
            line: error.line || 'unknown',
            column: error.column || 'unknown',
            value: error.value || 'unknown'
        });
    }
    
    /**
     * サーバーへエラー情報を送信（将来実装）
     * @param {Object} errorInfo - エラー情報
     */
    static async sendToServer(errorInfo) {
        if (!CONFIG.API.BASE_URL) return;
        
        try {
            // エラーログAPIへの送信
            const response = await fetch(`${CONFIG.API.BASE_URL}/api/errors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(errorInfo)
            });
            
            if (!response.ok) {
                console.warn('Failed to send error to server');
            }
        } catch (err) {
            // エラー送信自体が失敗した場合は静かに処理
            console.warn('Error reporting failed:', err);
        }
    }
    
    /**
     * 複数のエラーをバッチ処理
     * @param {Array} errors - エラーの配列
     * @param {string} context - コンテキスト
     */
    static handleBatch(errors, context = 'Batch') {
        const results = [];
        
        errors.forEach((error, index) => {
            try {
                results.push(this.handle(error, `${context}[${index}]`, {
                    showToast: index === 0,  // 最初のエラーのみトースト表示
                    logToConsole: true
                }));
            } catch (e) {
                console.error('Error in batch processing:', e);
            }
        });
        
        // サマリーメッセージの表示
        if (errors.length > 1 && typeof window.showToast === 'function') {
            window.showToast(`${errors.length}件のエラーが発生しました。詳細はコンソールを確認してください。`, 'error');
        }
        
        return results;
    }
    
    /**
     * Try-Catchラッパー関数
     * @param {Function} fn - 実行する関数
     * @param {string} context - コンテキスト
     * @param {*} defaultValue - エラー時のデフォルト値
     */
    static async tryAsync(fn, context = 'AsyncOperation', defaultValue = null) {
        try {
            return await fn();
        } catch (error) {
            this.handle(error, context);
            return defaultValue;
        }
    }
    
    /**
     * 同期処理用のTry-Catchラッパー
     * @param {Function} fn - 実行する関数
     * @param {string} context - コンテキスト
     * @param {*} defaultValue - エラー時のデフォルト値
     */
    static try(fn, context = 'Operation', defaultValue = null) {
        try {
            return fn();
        } catch (error) {
            this.handle(error, context);
            return defaultValue;
        }
    }
    
    /**
     * カスタムエラークラスの作成
     * @param {string} message - エラーメッセージ
     * @param {string} code - エラーコード
     * @param {Object} details - 追加の詳細情報
     */
    static createError(message, code = 'CUSTOM_ERROR', details = {}) {
        const error = new Error(message);
        error.code = code;
        error.details = details;
        error.timestamp = new Date().toISOString();
        return error;
    }
}

// グローバルエラーハンドラーの設定
window.addEventListener('error', function(event) {
    // nullチェック
    if (event && event.error) {
        ErrorHandler.handle(event.error, 'GlobalError', {
            showToast: false,
            logToConsole: true
        });
    }
});

// Promise rejectionハンドラー
window.addEventListener('unhandledrejection', function(event) {
    ErrorHandler.handle(
        new Error(event.reason?.message || event.reason || 'Unhandled Promise Rejection'),
        'UnhandledPromise',
        {
            showToast: false,
            logToConsole: CONFIG.APP.DEBUG_MODE
        }
    );
});

// グローバルに公開
window.ErrorHandler = ErrorHandler;

// CommonJS/ES6モジュール対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}