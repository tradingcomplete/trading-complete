/**
 * security.js - セキュリティユーティリティモジュール
 * 
 * Trading Completeのセキュリティ基盤
 * - SecurityUtils: サニタイズ関数
 * - InputValidator: 入力検証
 * - SecureError: エラーメッセージ変換
 * - StorageValidator: localStorage検証
 * 
 * @version 1.0.1
 * @date 2025-12-30
 * @changelog
 *   v1.0.1 (2025-12-30) - Validator→InputValidatorにリネーム、thisコンテキスト問題修正
 *   v1.0.0 (2025-12-29) - 初版
 * @see Trading_Complete_セキュリティ要件定義書_v1_1.md
 */

// ============================================
// SecurityUtils - サニタイズ関数
// ============================================

const SecurityUtils = {
    /**
     * HTMLタグをエスケープ（XSS対策）
     * @param {string} text - エスケープする文字列
     * @returns {string} エスケープ後の文字列
     */
    escapeHtml(text) {
        if (typeof text !== 'string') return text;
        
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        
        return text.replace(/[&<>"']/g, char => map[char]);
    },
    
    /**
     * 数値のみを許可
     * @param {*} value - 検証する値
     * @param {number} defaultValue - 無効な場合のデフォルト値
     * @returns {number} 数値
     */
    sanitizeNumber(value, defaultValue = 0) {
        const num = parseFloat(value);
        return isNaN(num) ? defaultValue : num;
    },
    
    /**
     * 正の数値のみを許可
     * @param {*} value - 検証する値
     * @param {number} defaultValue - 無効な場合のデフォルト値
     * @returns {number} 正の数値
     */
    sanitizePositiveNumber(value, defaultValue = 0) {
        const num = parseFloat(value);
        return (isNaN(num) || num < 0) ? defaultValue : num;
    },
    
    /**
     * 日付形式を検証
     * @param {string} value - 検証する日付文字列
     * @returns {string|null} 有効な日付文字列またはnull
     */
    sanitizeDate(value) {
        if (!value) return null;
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : value;
    },
    
    /**
     * 通貨ペア形式を検証（例: USD/JPY, XAUUSD）
     * @param {string} value - 検証する通貨ペア
     * @returns {string} サニタイズ後の通貨ペア
     */
    sanitizePair(value) {
        if (typeof value !== 'string') return '';
        // 英字、数字、スラッシュのみ許可
        return value.replace(/[^A-Za-z0-9\/]/g, '').toUpperCase();
    },
    
    /**
     * テキストの最大長を制限
     * @param {string} text - 制限するテキスト
     * @param {number} maxLength - 最大文字数
     * @returns {string} 制限後のテキスト
     */
    truncateText(text, maxLength = 1000) {
        if (typeof text !== 'string') return '';
        return text.substring(0, maxLength);
    },
    
    /**
     * URLを検証（httpsのみ許可）
     * @param {string} url - 検証するURL
     * @returns {string} 有効なURLまたは空文字
     */
    sanitizeUrl(url) {
        if (typeof url !== 'string') return '';
        
        try {
            const parsed = new URL(url);
            // httpsのみ許可（data:は画像用に許可）
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'data:') {
                return '';
            }
            return url;
        } catch {
            return '';
        }
    },
    
    /**
     * 方向（long/short）を検証
     * @param {string} value - 検証する方向
     * @returns {string} 有効な方向またはデフォルト値
     */
    sanitizeDirection(value) {
        const valid = ['long', 'short'];
        return valid.includes(value) ? value : 'long';
    }
};

// ============================================
// InputValidator - 入力検証
// ※ 既存のValidatorと競合を避けるためリネーム
// ============================================

const InputValidator = {
    /**
     * トレードデータの検証
     * @param {Object} data - トレードデータ
     * @returns {Object} { isValid: boolean, errors: string[] }
     */
    trade(data) {
        const errors = [];
        
        // 通貨ペア（必須、3-10文字）
        if (!data.pair || data.pair.length < 2 || data.pair.length > 15) {
            errors.push('通貨ペアが不正です');
        }
        
        // 方向（long/shortのみ）
        if (!['long', 'short'].includes(data.direction)) {
            errors.push('売買方向が不正です');
        }
        
        // エントリー価格（正の数値）
        if (data.entryPrice !== undefined && data.entryPrice !== null && data.entryPrice !== '') {
            if (typeof data.entryPrice !== 'number' || data.entryPrice <= 0) {
                errors.push('エントリー価格は正の数値で入力してください');
            }
        }
        
        // ロット（0.01〜1000の範囲）
        if (data.lot !== undefined && data.lot !== null && data.lot !== '') {
            if (typeof data.lot !== 'number' || data.lot < 0.01 || data.lot > 1000) {
                errors.push('ロットサイズは0.01〜1000の範囲で入力してください');
            }
        }
        
        // 日付（有効な日付形式）
        if (!data.entryDate) {
            errors.push('エントリー日付が不正です');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    },
    
    /**
     * 経費データの検証
     * @param {Object} data - 経費データ
     * @returns {Object} { isValid: boolean, errors: string[] }
     */
    expense(data) {
        const errors = [];
        
        // 金額（正の数値）
        if (!data.amount || data.amount <= 0) {
            errors.push('金額は正の数値で入力してください');
        }
        
        // カテゴリ（必須）
        if (!data.category) {
            errors.push('カテゴリを選択してください');
        }
        
        // 日付（有効な日付形式）
        if (!data.date) {
            errors.push('日付が不正です');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    },
    
    /**
     * ノートデータの検証
     * @param {Object} data - ノートデータ
     * @returns {Object} { isValid: boolean, errors: string[] }
     */
    note(data) {
        const errors = [];
        
        // 日付（必須）
        if (!data.date) {
            errors.push('日付が不正です');
        }
        
        // 内容（最大10000文字）
        if (data.content && data.content.length > 10000) {
            errors.push('ノート内容は10000文字以内で入力してください');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    },
    
    /**
     * 入出金データの検証
     * @param {Object} data - 入出金データ
     * @returns {Object} { isValid: boolean, errors: string[] }
     */
    capitalRecord(data) {
        const errors = [];
        
        // 金額（数値）
        if (data.amount === undefined || data.amount === null || isNaN(data.amount)) {
            errors.push('金額を入力してください');
        }
        
        // タイプ（deposit/withdrawal）
        if (!['deposit', 'withdrawal'].includes(data.type)) {
            errors.push('入出金タイプが不正です');
        }
        
        // 日付（有効な日付形式）
        if (!data.date) {
            errors.push('日付が不正です');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
};

// 互換性のため Validator も公開（既存がなければ）
if (typeof window.Validator === 'undefined') {
    window.Validator = InputValidator;
}

// ============================================
// SecureError - エラーメッセージ変換
// ============================================

const SecureError = {
    /**
     * エラーメッセージのマッピング
     * 詳細なエラーをユーザー向けの曖昧なメッセージに変換
     */
    messages: {
        // 認証系
        'Invalid login credentials': 'メールアドレスまたはパスワードが正しくありません',
        'Email not confirmed': 'メールアドレスの確認が完了していません',
        'User already registered': 'このメールアドレスは既に登録されています',
        'invalid_credentials': 'メールアドレスまたはパスワードが正しくありません',
        'email_not_confirmed': 'メールアドレスの確認が完了していません',
        
        // データベース系
        'duplicate key value': 'データが重複しています',
        'foreign key violation': 'データの整合性エラーが発生しました',
        'row-level security': 'アクセス権限がありません',
        
        // ネットワーク系
        'Failed to fetch': 'ネットワークエラーが発生しました',
        'NetworkError': 'インターネット接続を確認してください',
        'TypeError: Failed to fetch': 'ネットワークエラーが発生しました',
        
        // localStorage系
        'QuotaExceededError': 'ストレージ容量が不足しています',
        
        // セッション系
        'JWT expired': 'セッションが切れました。再度ログインしてください',
        'invalid JWT': 'セッションが無効です。再度ログインしてください',
        
        // デフォルト
        'default': 'エラーが発生しました'
    },
    
    /**
     * エラーメッセージをユーザー向けに変換
     * @param {Error|string} error - エラーオブジェクトまたは文字列
     * @returns {string} ユーザー向けメッセージ
     */
    toUserMessage(error) {
        const errorStr = error?.message || error?.toString() || '';
        
        for (const [key, message] of Object.entries(this.messages)) {
            if (key !== 'default' && errorStr.includes(key)) {
                return message;
            }
        }
        
        return this.messages.default;
    },
    
    /**
     * 開発環境でのみ詳細ログを出力
     * @param {Error} error - エラーオブジェクト
     * @param {string} context - エラーの発生箇所
     */
    log(error, context = '') {
        const isDevelopment = location.hostname === 'localhost' || 
                              location.hostname === '127.0.0.1' ||
                              location.hostname.includes('192.168.');
        
        if (isDevelopment) {
            console.error(`[${context}]`, error);
        } else {
            // 本番環境では詳細を出力しない
            console.error(`[${context}] エラーが発生しました`);
        }
    }
};

// ============================================
// StorageValidator - localStorage検証
// ============================================

const StorageValidator = {
    /**
     * localStorageから安全にデータを読み込む
     * @param {string} key - localStorageのキー
     * @param {*} defaultValue - デフォルト値
     * @param {Function} validator - 検証関数
     * @returns {*} 検証済みデータまたはデフォルト値
     */
    safeLoad(key, defaultValue, validator = null) {
        try {
            const stored = localStorage.getItem(key);
            
            // データがない場合
            if (stored === null || stored === undefined) {
                return defaultValue;
            }
            
            // JSONパース
            const parsed = JSON.parse(stored);
            
            // バリデーター関数がある場合は検証
            if (validator && typeof validator === 'function') {
                if (!validator(parsed)) {
                    console.warn(`[StorageValidator] ${key}: データ形式が不正です。デフォルト値を使用します。`);
                    return defaultValue;
                }
            }
            
            return parsed;
            
        } catch (error) {
            console.warn(`[StorageValidator] ${key}: 読み込みエラー。デフォルト値を使用します。`, error);
            return defaultValue;
        }
    },
    
    /**
     * 配列かどうかをチェック
     * @param {*} data - チェックするデータ
     * @returns {boolean}
     */
    isArray(data) {
        return Array.isArray(data);
    },
    
    /**
     * オブジェクトかどうかをチェック（nullや配列は除外）
     * @param {*} data - チェックするデータ
     * @returns {boolean}
     */
    isObject(data) {
        return data !== null && typeof data === 'object' && !Array.isArray(data);
    },
    
    /**
     * ブローカー設定の形式をチェック
     * 期待形式: { list: [...], nextId: number }
     * @param {*} data - チェックするデータ
     * @returns {boolean}
     */
    isBrokersFormat(data) {
        // 新形式: { list: [], nextId: number }
        if (data !== null && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.list)) {
            return true;
        }
        // 旧形式: 配列のみ（互換性のため許可）
        if (Array.isArray(data)) {
            return true;
        }
        return false;
    },
    
    /**
     * お気に入り通貨ペアの形式をチェック
     * 期待形式: 文字列の配列
     * @param {*} data - チェックするデータ
     * @returns {boolean}
     */
    isFavoritePairsFormat(data) {
        if (!Array.isArray(data)) return false;
        // 全て文字列かチェック
        return data.every(item => typeof item === 'string');
    },
    
    /**
     * トレードデータの形式をチェック
     * 期待形式: オブジェクトの配列
     * @param {*} data - チェックするデータ
     * @returns {boolean}
     */
    isTradesFormat(data) {
        if (!Array.isArray(data)) return false;
        // 空配列はOK
        if (data.length === 0) return true;
        // 各要素がオブジェクトかチェック（thisを使わない）
        return data.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));
    },
    
    /**
     * 月メモの形式をチェック
     * 期待形式: { anomaly: {}, monthly: {} }
     * @param {*} data - チェックするデータ
     * @returns {boolean}
     */
    isMonthlyMemosFormat(data) {
        // オブジェクトかチェック（thisを使わない）
        if (data === null || typeof data !== 'object' || Array.isArray(data)) return false;
        // anomalyとmonthlyがオブジェクトであること
        if (data.anomaly !== undefined && (data.anomaly === null || typeof data.anomaly !== 'object' || Array.isArray(data.anomaly))) return false;
        if (data.monthly !== undefined && (data.monthly === null || typeof data.monthly !== 'object' || Array.isArray(data.monthly))) return false;
        return true;
    },
    
    /**
     * 締め期間の形式をチェック
     * 期待形式: オブジェクトの配列
     * @param {*} data - チェックするデータ
     * @returns {boolean}
     */
    isClosedPeriodsFormat(data) {
        if (!Array.isArray(data)) return false;
        if (data.length === 0) return true;
        return data.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));
    },
    
    /**
     * 目標データの形式をチェック
     * @param {*} data - チェックするデータ
     * @returns {boolean}
     */
    isGoalsFormat(data) {
        return data !== null && typeof data === 'object' && !Array.isArray(data);
    }
};

// ============================================
// グローバルに公開
// ============================================

window.SecurityUtils = SecurityUtils;
window.InputValidator = InputValidator;
window.SecureError = SecureError;
window.StorageValidator = StorageValidator;

console.log('[Security] セキュリティモジュール読み込み完了');