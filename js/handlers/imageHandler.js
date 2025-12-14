/**
 * Trading Complete - Image Handler Module
 * 画像処理関連の機能を統合管理
 * Part 2, Part 3, その他から画像処理機能を集約
 * 
 * @module ImageHandler
 * @version 1.1.0
 * @changelog
 * - v1.1.0: PNG対応追加、高画質化（chart/note）
 *   - chart: JPEG 1000×750 → PNG 1600×900
 *   - note: JPEG 800×600 → PNG 1600×1200
 *   - icon: JPEG 200×200 のまま（品質向上 0.7→0.85）
 */

class ImageHandler {
    /**
     * 画像圧縮設定（デフォルト値）
     */
    static CONFIG = {
        compression: {
            maxWidth: 1600,
            maxHeight: 1200,
            quality: 0.92,
            format: 'png'  // デフォルトをPNGに変更
        },
        // 用途別の設定
        presets: {
            icon: {
                maxWidth: 200,
                maxHeight: 200,
                quality: 0.85,
                format: 'jpeg'  // アイコンはJPEGでOK（小さいため）
            },
            chart: {
                maxWidth: 1600,   // 1000 → 1600
                maxHeight: 900,   // 750 → 900
                quality: 1.0,     // PNG は品質100%
                format: 'png'     // JPEG → PNG（文字がくっきり）
            },
            note: {
                maxWidth: 1600,   // 800 → 1600
                maxHeight: 1200,  // 600 → 1200
                quality: 1.0,     // PNG は品質100%
                format: 'png'     // JPEG → PNG（文字がくっきり）
            },
            thumbnail: {
                maxWidth: 300,
                maxHeight: 300,
                quality: 0.7,
                format: 'jpeg'    // サムネイルはJPEGでOK
            }
        },
        // ファイルサイズ制限
        limits: {
            maxFileSize: 10 * 1024 * 1024,      // 5MB → 10MB に拡大
            maxCompressedSize: 3 * 1024 * 1024  // 1MB → 3MB に拡大
        }
    };

    /**
     * 画像圧縮メインメソッド
     * @param {string|File} source - Base64文字列またはFileオブジェクト
     * @param {number} maxWidth - 最大幅（省略時はデフォルト値）
     * @param {number} quality - 圧縮品質（0-1）
     * @param {string} format - 出力形式（'jpeg', 'png', 'webp'）
     * @returns {Promise<string>} 圧縮後のBase64文字列
     */
    static async compress(source, maxWidth = null, quality = null, format = null) {
        return new Promise(async (resolve, reject) => {
            try {
                // Fileオブジェクトの場合はBase64に変換
                let base64String;
                if (source instanceof File) {
                    base64String = await this.toBase64(source);
                } else {
                    base64String = source;
                }

                // 画像でない場合はそのまま返す
                if (!base64String || !base64String.startsWith('data:image')) {
                    resolve(base64String);
                    return;
                }

                const img = new Image();
                
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 設定値の決定
                    const outputFormat = format || this.CONFIG.compression.format;
                    const config = {
                        maxWidth: maxWidth || this.CONFIG.compression.maxWidth,
                        maxHeight: this.CONFIG.compression.maxHeight,
                        quality: quality !== null ? quality : this.CONFIG.compression.quality,
                        format: outputFormat
                    };
                    
                    // アスペクト比を保持しながらリサイズ
                    const { width, height } = this.calculateDimensions(
                        img.width, 
                        img.height, 
                        config.maxWidth, 
                        config.maxHeight
                    );
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    // 高品質レンダリング設定
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    // JPEG用の白背景設定（PNGは透明背景を維持）
                    if (config.format === 'jpeg') {
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, width, height);
                    }
                    
                    // 画像を描画
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 圧縮されたBase64を取得
                    const mimeType = `image/${config.format}`;
                    const compressedBase64 = canvas.toDataURL(mimeType, config.quality);
                    
                    // 元の画像より大きくなった場合は元の画像を返す
                    // （ただしフォーマット変換が必要な場合は除く）
                    if (compressedBase64.length > base64String.length && !format) {
                        resolve(base64String);
                    } else {
                        resolve(compressedBase64);
                    }
                };
                
                img.onerror = () => {
                    console.error('ImageHandler: 画像の読み込みに失敗しました');
                    resolve(source);
                };
                
                img.src = base64String;
                
            } catch (error) {
                console.error('ImageHandler.compress error:', error);
                reject(error);
            }
        });
    }

    /**
     * プリセットを使用した圧縮
     * @param {string|File} source - 画像ソース
     * @param {string} preset - プリセット名（'icon', 'chart', 'note', 'thumbnail'）
     * @returns {Promise<string>} 圧縮後のBase64文字列
     */
    static async compressWithPreset(source, preset) {
        const config = this.CONFIG.presets[preset];
        if (!config) {
            console.warn(`ImageHandler: プリセット '${preset}' が見つかりません`);
            return this.compress(source);
        }
        
        // プリセットの format を使用
        return this.compress(source, config.maxWidth, config.quality, config.format);
    }

    /**
     * FileオブジェクトをBase64に変換
     * @param {File} file - ファイルオブジェクト
     * @returns {Promise<string>} Base64文字列
     */
    static toBase64(file) {
        return new Promise((resolve, reject) => {
            // ファイルサイズチェック
            if (file.size > this.CONFIG.limits.maxFileSize) {
                reject(new Error(`ファイルサイズが大きすぎます（最大${this.CONFIG.limits.maxFileSize / 1024 / 1024}MB）`));
                return;
            }

            const reader = new FileReader();
            
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = (error) => {
                console.error('ImageHandler.toBase64 error:', error);
                reject(error);
            };
            
            reader.readAsDataURL(file);
        });
    }

    /**
     * 画像のリサイズ（アスペクト比保持）
     * @param {string} base64String - Base64文字列
     * @param {number} maxWidth - 最大幅
     * @param {number} maxHeight - 最大高さ
     * @returns {Promise<string>} リサイズ後のBase64文字列
     */
    static async resize(base64String, maxWidth, maxHeight) {
        return new Promise((resolve, reject) => {
            if (!base64String || !base64String.startsWith('data:image')) {
                resolve(base64String);
                return;
            }

            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // リサイズ後のサイズを計算
                const { width, height } = this.calculateDimensions(
                    img.width,
                    img.height,
                    maxWidth,
                    maxHeight
                );
                
                canvas.width = width;
                canvas.height = height;
                
                // 高品質設定
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                // 画像を描画
                ctx.drawImage(img, 0, 0, width, height);
                
                // 元の形式を維持してリサイズ後のBase64を返す
                const mimeMatch = base64String.match(/data:image\/(\w+);/);
                const mimeType = mimeMatch ? `image/${mimeMatch[1]}` : 'image/png';
                resolve(canvas.toDataURL(mimeType));
            };
            
            img.onerror = () => {
                console.error('ImageHandler.resize: 画像の読み込みに失敗しました');
                resolve(base64String);
            };
            
            img.src = base64String;
        });
    }

    /**
     * アスペクト比を保持したサイズ計算
     * @private
     * @param {number} originalWidth - 元の幅
     * @param {number} originalHeight - 元の高さ
     * @param {number} maxWidth - 最大幅
     * @param {number} maxHeight - 最大高さ
     * @returns {{width: number, height: number}} 計算後のサイズ
     */
    static calculateDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
        let width = originalWidth;
        let height = originalHeight;
        
        // 既に最大サイズ以下の場合はそのまま
        if (width <= maxWidth && height <= maxHeight) {
            return { width, height };
        }
        
        // アスペクト比を計算
        const aspectRatio = width / height;
        
        // 幅基準でリサイズ
        if (width > maxWidth) {
            width = maxWidth;
            height = width / aspectRatio;
        }
        
        // 高さ基準でリサイズ（必要な場合）
        if (height > maxHeight) {
            height = maxHeight;
            width = height * aspectRatio;
        }
        
        return { 
            width: Math.round(width), 
            height: Math.round(height) 
        };
    }

    /**
     * 画像のサムネイル生成
     * @param {string} base64String - Base64文字列
     * @param {number} size - サムネイルサイズ（正方形）
     * @returns {Promise<string>} サムネイルのBase64文字列
     */
    static async createThumbnail(base64String, size = 150) {
        return new Promise((resolve, reject) => {
            if (!base64String || !base64String.startsWith('data:image')) {
                resolve(base64String);
                return;
            }

            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = size;
                canvas.height = size;
                
                // 中央でクロップ
                const scale = Math.max(size / img.width, size / img.height);
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                const x = (size - scaledWidth) / 2;
                const y = (size - scaledHeight) / 2;
                
                ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
                
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            
            img.onerror = () => {
                console.error('ImageHandler.createThumbnail: 画像の読み込みに失敗しました');
                resolve(base64String);
            };
            
            img.src = base64String;
        });
    }

    /**
     * 画像フォーマットの変換
     * @param {string} base64String - Base64文字列
     * @param {string} targetFormat - 変換先フォーマット（'jpeg', 'png', 'webp'）
     * @param {number} quality - 品質（0-1）
     * @returns {Promise<string>} 変換後のBase64文字列
     */
    static async convertFormat(base64String, targetFormat = 'png', quality = 0.92) {
        return new Promise((resolve, reject) => {
            if (!base64String || !base64String.startsWith('data:image')) {
                resolve(base64String);
                return;
            }

            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = img.width;
                canvas.height = img.height;
                
                // JPEG形式の場合は白背景を設定
                if (targetFormat === 'jpeg') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                
                ctx.drawImage(img, 0, 0);
                
                const mimeType = `image/${targetFormat}`;
                resolve(canvas.toDataURL(mimeType, quality));
            };
            
            img.onerror = () => {
                console.error('ImageHandler.convertFormat: 画像の読み込みに失敗しました');
                resolve(base64String);
            };
            
            img.src = base64String;
        });
    }

    /**
     * 画像サイズの取得
     * @param {string} base64String - Base64文字列
     * @returns {Promise<{width: number, height: number, size: number}>} 画像情報
     */
    static async getImageInfo(base64String) {
        return new Promise((resolve, reject) => {
            if (!base64String || !base64String.startsWith('data:image')) {
                reject(new Error('有効な画像データではありません'));
                return;
            }

            const img = new Image();
            
            img.onload = () => {
                // Base64のサイズを計算（ヘッダー部分を除く）
                const base64Data = base64String.split(',')[1];
                const sizeInBytes = Math.round(base64Data.length * 0.75);
                
                // フォーマットを検出
                const formatMatch = base64String.match(/data:image\/(\w+);/);
                const format = formatMatch ? formatMatch[1] : 'unknown';
                
                resolve({
                    width: img.width,
                    height: img.height,
                    size: sizeInBytes,
                    sizeKB: Math.round(sizeInBytes / 1024),
                    sizeMB: (sizeInBytes / 1024 / 1024).toFixed(2),
                    format: format
                });
            };
            
            img.onerror = () => {
                reject(new Error('画像情報の取得に失敗しました'));
            };
            
            img.src = base64String;
        });
    }

    /**
     * 複数画像の一括圧縮
     * @param {Array<string|File>} sources - 画像配列
     * @param {string} preset - プリセット名
     * @returns {Promise<Array<string>>} 圧縮後のBase64配列
     */
    static async compressMultiple(sources, preset = null) {
        const promises = sources.map(source => {
            if (preset) {
                return this.compressWithPreset(source, preset);
            }
            return this.compress(source);
        });
        
        return Promise.all(promises);
    }

    /**
     * 画像の検証
     * @param {File|string} source - 検証対象
     * @returns {Promise<{valid: boolean, error: string|null}>} 検証結果
     */
    static async validate(source) {
        try {
            // Fileオブジェクトの場合
            if (source instanceof File) {
                // MIMEタイプチェック
                if (!source.type.startsWith('image/')) {
                    return { valid: false, error: '画像ファイルではありません' };
                }
                
                // ファイルサイズチェック
                if (source.size > this.CONFIG.limits.maxFileSize) {
                    const maxMB = this.CONFIG.limits.maxFileSize / 1024 / 1024;
                    return { valid: false, error: `ファイルサイズが${maxMB}MBを超えています` };
                }
            }
            
            // Base64文字列の場合
            if (typeof source === 'string') {
                if (!source.startsWith('data:image')) {
                    return { valid: false, error: '有効な画像データではありません' };
                }
                
                // サイズチェック
                const info = await this.getImageInfo(source);
                if (info.size > this.CONFIG.limits.maxFileSize) {
                    const maxMB = this.CONFIG.limits.maxFileSize / 1024 / 1024;
                    return { valid: false, error: `画像サイズが${maxMB}MBを超えています` };
                }
            }
            
            return { valid: true, error: null };
            
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * 将来実装: クラウドアップロード
     * @param {string|File} source - アップロード対象
     * @param {Object} options - アップロードオプション
     * @returns {Promise<string>} アップロードされた画像のURL
     */
    static async uploadToCloud(source, options = {}) {
        // Supabase実装予定
        console.warn('ImageHandler.uploadToCloud: この機能は将来実装予定です');
        
        // 現在はBase64を返す（LocalStorage保存用）
        if (source instanceof File) {
            return this.toBase64(source);
        }
        return source;
    }

    /**
     * 画像処理のステータスを取得
     * @returns {Object} 設定情報とステータス
     */
    static getStatus() {
        return {
            version: '1.1.0',
            config: this.CONFIG,
            presets: Object.keys(this.CONFIG.presets),
            limits: {
                maxFileSizeMB: this.CONFIG.limits.maxFileSize / 1024 / 1024,
                maxCompressedSizeMB: this.CONFIG.limits.maxCompressedSize / 1024 / 1024
            },
            cloudEnabled: false // 将来的にtrue
        };
    }
}

// グローバルスコープに公開（後方互換性のため）
if (typeof window !== 'undefined') {
    window.ImageHandler = ImageHandler;
    
    // 既存の関数名での互換性提供（非推奨）
    window.compressImage = function(source, maxWidth, quality) {
        console.warn('compressImage()は非推奨です。ImageHandler.compress()を使用してください。');
        return ImageHandler.compress(source, maxWidth, quality);
    };
    
    window.toBase64 = function(file) {
        console.warn('toBase64()は非推奨です。ImageHandler.toBase64()を使用してください。');
        return ImageHandler.toBase64(file);
    };
    
    window.resizeImage = function(base64String, maxWidth, maxHeight) {
        console.warn('resizeImage()は非推奨です。ImageHandler.resize()を使用してください。');
        return ImageHandler.resize(base64String, maxWidth, maxHeight);
    };
}