/**
 * validation.js
 * Trading Complete - データ検証ユーティリティ
 * Version: 1.0
 * 
 * 各種データの検証処理を統一管理
 */

class Validator {
    // ========== 日付関連の検証 ==========
    
    /**
     * 有効な日付かチェック
     * @param {string|Date} dateStr - 検証する日付
     * @returns {boolean} 有効な日付の場合true
     */
    static isValidDate(dateStr) {
        if (!dateStr) return false;
        
        const date = new Date(dateStr);
        
        // Invalid Dateのチェック
        if (!(date instanceof Date) || isNaN(date)) {
            return false;
        }
        
        // 範囲チェック（2000年〜2099年）
        const year = date.getFullYear();
        if (year < 2000 || year > 2099) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 日付が未来かチェック
     * @param {string|Date} dateStr - 検証する日付
     * @returns {boolean} 未来の日付の場合true
     */
    static isFutureDate(dateStr) {
        if (!this.isValidDate(dateStr)) return false;
        
        const date = new Date(dateStr);
        const now = new Date();
        return date > now;
    }
    
    /**
     * 日付範囲の検証
     * @param {string|Date} startDate - 開始日
     * @param {string|Date} endDate - 終了日
     * @returns {boolean} 有効な範囲の場合true
     */
    static isValidDateRange(startDate, endDate) {
        if (!this.isValidDate(startDate) || !this.isValidDate(endDate)) {
            return false;
        }
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        return start <= end;
    }
    
    // ========== 価格・数値関連の検証 ==========
    
    /**
     * 有効な価格かチェック
     * @param {number|string} price - 検証する価格
     * @returns {boolean} 有効な価格の場合true
     */
    static isValidPrice(price) {
        const numPrice = Number(price);
        
        if (isNaN(numPrice) || !isFinite(numPrice)) {
            return false;
        }
        
        // 範囲チェック
        if (numPrice <= CONFIG.VALIDATION.PRICE.MIN || numPrice > CONFIG.VALIDATION.PRICE.MAX) {
            return false;
        }
        
        // 小数点以下の桁数チェック
        const decimalPlaces = (numPrice.toString().split('.')[1] || '').length;
        if (decimalPlaces > CONFIG.VALIDATION.PRICE.DECIMALS) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 有効なロットサイズかチェック
     * @param {number|string} lot - 検証するロットサイズ
     * @returns {boolean} 有効なロットサイズの場合true
     */
    static isValidLotSize(lot) {
        const numLot = Number(lot);
        
        if (isNaN(numLot) || !isFinite(numLot)) {
            return false;
        }
        
        // 範囲チェック
        if (numLot < CONFIG.VALIDATION.LOT.MIN || numLot > CONFIG.VALIDATION.LOT.MAX) {
            return false;
        }
        
        // ステップ値チェック（0.01単位）
        const step = CONFIG.VALIDATION.LOT.STEP;
        if (Math.round(numLot / step) * step !== numLot) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 有効なpips値かチェック
     * @param {number|string} pips - 検証するpips値
     * @returns {boolean} 有効なpips値の場合true
     */
    static isValidPips(pips) {
        const numPips = Number(pips);
        
        if (isNaN(numPips) || !isFinite(numPips)) {
            return false;
        }
        
        // 範囲チェック
        if (numPips < CONFIG.VALIDATION.PIPS.MIN || numPips > CONFIG.VALIDATION.PIPS.MAX) {
            return false;
        }
        
        // 整数チェック
        if (!Number.isInteger(numPips)) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 有効な金額かチェック
     * @param {number|string} amount - 検証する金額
     * @returns {boolean} 有効な金額の場合true
     */
    static isValidAmount(amount) {
        const numAmount = Number(amount);
        
        if (isNaN(numAmount) || !isFinite(numAmount)) {
            return false;
        }
        
        // 小数点以下2桁まで（円の場合）
        const decimalPlaces = (numAmount.toString().split('.')[1] || '').length;
        if (decimalPlaces > 2) {
            return false;
        }
        
        return true;
    }
    
    // ========== 通貨ペア関連の検証 ==========
    
    /**
     * 有効な通貨ペアかチェック
     * @param {string} pair - 検証する通貨ペア
     * @returns {boolean} 有効な通貨ペアの場合true
     */
    static isValidPair(pair) {
        if (!pair || typeof pair !== 'string') {
            return false;
        }
        
        // 基本形式チェック（XXX/YYY）
        const pattern = /^[A-Z]{3}\/[A-Z]{3}$/;
        if (!pattern.test(pair)) {
            return false;
        }
        
        // 既知の通貨ペアリストでチェック（オプション）
        const allPairs = [
            ...CONSTANTS.CURRENCY_PAIRS.MAJOR,
            ...CONSTANTS.CURRENCY_PAIRS.CROSS,
            ...CONSTANTS.CURRENCY_PAIRS.EXOTIC
        ];
        
        return allPairs.includes(pair);
    }
    
    /**
     * 通貨ペアの正規化
     * @param {string} pair - 正規化する通貨ペア
     * @returns {string|null} 正規化された通貨ペア
     */
    static normalizePair(pair) {
        if (!pair) return null;
        
        // 大文字変換
        let normalized = pair.toUpperCase();
        
        // スペース除去
        normalized = normalized.replace(/\s/g, '');
        
        // スラッシュなし形式をスラッシュあり形式に変換
        if (normalized.length === 6 && !normalized.includes('/')) {
            normalized = normalized.slice(0, 3) + '/' + normalized.slice(3);
        }
        
        // 日本語形式の変換
        const jpMap = {
            'ドル円': 'USD/JPY',
            'ユーロドル': 'EUR/USD',
            'ポンドドル': 'GBP/USD',
            'ユーロ円': 'EUR/JPY',
            'ポンド円': 'GBP/JPY',
            '豪ドル円': 'AUD/JPY'
        };
        
        if (jpMap[pair]) {
            normalized = jpMap[pair];
        }
        
        // 検証
        if (this.isValidPair(normalized)) {
            return normalized;
        }
        
        return null;
    }
    
    // ========== トレードデータの検証 ==========
    
    /**
     * トレードデータの検証
     * @param {Object} trade - 検証するトレードデータ
     * @returns {Object} 検証結果 {valid: boolean, errors: array}
     */
    static validateTrade(trade) {
        const errors = [];
        
        if (!trade) {
            errors.push('トレードデータが存在しません');
            return { valid: false, errors };
        }
        
        // 必須フィールドのチェック
        if (!trade.entryTime || !this.isValidDate(trade.entryTime)) {
            errors.push('有効なエントリー日時を入力してください');
        }
        
        if (!trade.pair || !this.isValidPair(trade.pair)) {
            errors.push('有効な通貨ペアを選択してください');
        }
        
        if (!trade.entryPrice || !this.isValidPrice(trade.entryPrice)) {
            errors.push('有効なエントリー価格を入力してください');
        }
        
        if (trade.lotSize !== undefined && !this.isValidLotSize(trade.lotSize)) {
            errors.push('有効なロットサイズを入力してください');
        }
        
        // 決済済みの場合の追加チェック
        if (trade.exitTime) {
            if (!this.isValidDate(trade.exitTime)) {
                errors.push('有効な決済日時を入力してください');
            }
            
            if (!this.isValidDateRange(trade.entryTime, trade.exitTime)) {
                errors.push('決済日時はエントリー日時より後である必要があります');
            }
            
            if (trade.exitPrice && !this.isValidPrice(trade.exitPrice)) {
                errors.push('有効な決済価格を入力してください');
            }
            
            if (trade.pips !== undefined && !this.isValidPips(trade.pips)) {
                errors.push('有効なpips値を入力してください');
            }
        }
        
        // 画像データのチェック
        if (trade.images && Array.isArray(trade.images)) {
            if (trade.images.length > CONSTANTS.LIMITS.MAX_IMAGES_PER_TRADE) {
                errors.push(`画像は最大${CONSTANTS.LIMITS.MAX_IMAGES_PER_TRADE}枚までです`);
            }
            
            trade.images.forEach((image, index) => {
                if (image && image.length > CONSTANTS.LIMITS.MAX_IMAGE_SIZE) {
                    errors.push(`画像${index + 1}のサイズが大きすぎます`);
                }
            });
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    // ========== CSVデータの検証 ==========
    
    /**
     * CSVデータの検証
     * @param {Array} data - 検証するCSVデータ
     * @param {Object} config - 業者設定
     * @returns {Object} 検証結果
     */
    static validateCSV(data, config) {
        const errors = [];
        const warnings = [];
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            errors.push('CSVデータが空です');
            return { valid: false, errors, warnings };
        }
        
        // ヘッダーの検証
        if (config.hasHeader) {
            const header = data[0];
            const requiredColumns = ['date', 'pair', 'side', 'price', 'lot'];
            
            requiredColumns.forEach(col => {
                if (config.columns && !config.columns[col]) {
                    warnings.push(`必須カラム「${col}」が設定に存在しません`);
                }
            });
        }
        
        // 各行のデータ検証（サンプリング）
        const sampleSize = Math.min(10, data.length);
        const startIndex = config.hasHeader ? 1 : 0;
        
        for (let i = startIndex; i < startIndex + sampleSize && i < data.length; i++) {
            const row = data[i];
            
            // 空行チェック
            if (!row || row.every(cell => !cell || cell.trim() === '')) {
                warnings.push(`行${i + 1}が空です`);
                continue;
            }
            
            // カラム数チェック
            const expectedColumns = Object.keys(config.columns || {}).length;
            if (expectedColumns > 0 && row.length !== expectedColumns) {
                warnings.push(`行${i + 1}のカラム数が不正です（期待: ${expectedColumns}, 実際: ${row.length}）`);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings,
            rowCount: data.length - (config.hasHeader ? 1 : 0)
        };
    }
    
    // ========== テキスト関連の検証 ==========
    
    /**
     * 文字列の長さ検証
     * @param {string} text - 検証する文字列
     * @param {number} maxLength - 最大文字数
     * @param {number} minLength - 最小文字数
     * @returns {boolean} 有効な長さの場合true
     */
    static isValidLength(text, maxLength = CONFIG.VALIDATION.TEXT.MAX_LENGTH, minLength = 0) {
        if (typeof text !== 'string') {
            return false;
        }
        
        const length = text.length;
        return length >= minLength && length <= maxLength;
    }
    
    /**
     * メールアドレスの検証
     * @param {string} email - 検証するメールアドレス
     * @returns {boolean} 有効なメールアドレスの場合true
     */
    static isValidEmail(email) {
        if (!email || typeof email !== 'string') {
            return false;
        }
        
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return pattern.test(email);
    }
    
    /**
     * URLの検証
     * @param {string} url - 検証するURL
     * @returns {boolean} 有効なURLの場合true
     */
    static isValidURL(url) {
        if (!url || typeof url !== 'string') {
            return false;
        }
        
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    }
    
    // ========== ファイル関連の検証 ==========
    
    /**
     * 画像ファイルの検証
     * @param {File} file - 検証するファイル
     * @returns {Object} 検証結果
     */
    static validateImageFile(file) {
        const errors = [];
        
        if (!file) {
            errors.push('ファイルが選択されていません');
            return { valid: false, errors };
        }
        
        // ファイルタイプチェック
        if (!CONSTANTS.IMAGE.ALLOWED_TYPES.includes(file.type)) {
            errors.push('サポートされていない画像形式です');
        }
        
        // ファイルサイズチェック
        if (file.size > CONSTANTS.LIMITS.MAX_IMAGE_SIZE) {
            const maxSizeMB = CONSTANTS.LIMITS.MAX_IMAGE_SIZE / 1024 / 1024;
            errors.push(`画像サイズは${maxSizeMB}MB以下にしてください`);
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            fileInfo: {
                name: file.name,
                size: file.size,
                type: file.type
            }
        };
    }
    
    /**
     * CSVファイルの検証
     * @param {File} file - 検証するファイル
     * @returns {Object} 検証結果
     */
    static validateCSVFile(file) {
        const errors = [];
        
        if (!file) {
            errors.push('ファイルが選択されていません');
            return { valid: false, errors };
        }
        
        // ファイル拡張子チェック
        const validExtensions = ['.csv', '.txt'];
        const fileName = file.name.toLowerCase();
        const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
        
        if (!hasValidExtension) {
            errors.push('CSVファイルを選択してください');
        }
        
        // ファイルサイズチェック（10MB以下）
        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
            errors.push('ファイルサイズは10MB以下にしてください');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            fileInfo: {
                name: file.name,
                size: file.size,
                type: file.type
            }
        };
    }
}

// グローバルに公開
window.Validator = Validator;

// CommonJS/ES6モジュール対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Validator;
}