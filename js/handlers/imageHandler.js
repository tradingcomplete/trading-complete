/**
 * Trading Complete - Image Handler Module
 * 画像処理関連の機能を統合管理
 * Part 2, Part 3, その他から画像処理機能を集約
 * 
 * @module ImageHandler
 * @version 1.1.0
 * @updated 2026-01-04 - Supabase Storage対応追加
 */

class ImageHandler {
    /**
     * 画像圧縮設定（デフォルト値）
     */
    static CONFIG = {
        compression: {
            maxWidth: 1200,
            maxHeight: 900,
            quality: 0.85,
            format: 'jpeg'
        },
        // Supabase Storage設定
        storage: {
            bucketName: 'trade-images',
            signedUrlExpiry: 3600, // 1時間（秒）
            allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        },
        // 用途別の設定
        presets: {
            icon: {
                maxWidth: 200,
                maxHeight: 200,
                quality: 0.7
            },
            chart: {
                maxWidth: 1000,
                maxHeight: 750,
                quality: 0.8
            },
            note: {
                maxWidth: 800,
                maxHeight: 600,
                quality: 0.75
            },
            thumbnail: {
                maxWidth: 300,
                maxHeight: 300,
                quality: 0.6
            }
        },
        // ファイルサイズ制限
        limits: {
            maxFileSize: 5 * 1024 * 1024, // 5MB
            maxCompressedSize: 1 * 1024 * 1024 // 1MB
        }
    };

    /**
     * 画像圧縮メインメソッド
     * @param {string|File} source - Base64文字列またはFileオブジェクト
     * @param {number} maxWidth - 最大幅（省略時はデフォルト値）
     * @param {number} quality - 圧縮品質（0-1）
     * @returns {Promise<string>} 圧縮後のBase64文字列
     */
    static async compress(source, maxWidth = null, quality = null) {
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
                    const config = {
                        maxWidth: maxWidth || this.CONFIG.compression.maxWidth,
                        maxHeight: this.CONFIG.compression.maxHeight,
                        quality: quality || this.CONFIG.compression.quality
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
                    
                    // JPEG用の白背景設定
                    if (this.CONFIG.compression.format === 'jpeg') {
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, width, height);
                    }
                    
                    // 画像を描画
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 圧縮されたBase64を取得
                    const mimeType = `image/${this.CONFIG.compression.format}`;
                    const compressedBase64 = canvas.toDataURL(mimeType, config.quality);
                    
                    // 元の画像より大きくなった場合は元の画像を返す
                    if (compressedBase64.length > base64String.length) {
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
        
        return this.compress(source, config.maxWidth, config.quality);
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
                
                // リサイズ後のBase64を返す
                resolve(canvas.toDataURL());
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
        
        // 幅が最大値を超えている場合
        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }
        
        // 高さが最大値を超えている場合
        if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
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
    static async convertFormat(base64String, targetFormat = 'jpeg', quality = 0.85) {
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
                
                resolve({
                    width: img.width,
                    height: img.height,
                    size: sizeInBytes,
                    sizeKB: Math.round(sizeInBytes / 1024),
                    sizeMB: (sizeInBytes / 1024 / 1024).toFixed(2)
                });
            };
            
            img.onerror = () => {
                reject(new Error('画像情報の取得に失敗しました'));
            };
            
            img.src = base64String;
        });
    }

    /**
     * Base64文字列をBlobに変換
     * @param {string} base64String - Base64文字列
     * @returns {Blob} Blobオブジェクト
     */
    static base64ToBlob(base64String) {
        // データ部分を抽出
        const parts = base64String.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const base64Data = parts[1];
        
        // Base64をデコード
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
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
     * Supabase Storageに画像をアップロード
     * @param {string|File} source - アップロード対象（Base64またはFile）
     * @param {Object} options - アップロードオプション
     * @param {string} options.path - 保存パス（例: 'trades/xxx/chart1.jpg'）
     * @param {string} options.userId - ユーザーID（必須）
     * @param {boolean} options.compress - 圧縮するか（デフォルト: true）
     * @returns {Promise<{url: string, path: string}>} アップロード結果
     */
    static async uploadToCloud(source, options = {}) {
        const { path, userId, compress = true } = options;
        
        // 必須パラメータチェック
        if (!userId) {
            throw new Error('ImageHandler.uploadToCloud: userIdが必要です');
        }
        if (!path) {
            throw new Error('ImageHandler.uploadToCloud: pathが必要です');
        }
        
        // Supabaseクライアント確認
        if (typeof supabase === 'undefined') {
            console.warn('ImageHandler.uploadToCloud: Supabaseが初期化されていません。Base64を返します。');
            if (source instanceof File) {
                return { url: await this.toBase64(source), path: null };
            }
            return { url: source, path: null };
        }
        
        try {
            // 画像データの準備
            let imageData;
            if (source instanceof File) {
                // Fileの場合：圧縮してからBlobに
                if (compress) {
                    const base64 = await this.compress(source);
                    imageData = this.base64ToBlob(base64);
                } else {
                    imageData = source;
                }
            } else if (typeof source === 'string' && source.startsWith('data:image')) {
                // Base64の場合：圧縮してからBlobに
                if (compress) {
                    const compressed = await this.compress(source);
                    imageData = this.base64ToBlob(compressed);
                } else {
                    imageData = this.base64ToBlob(source);
                }
            } else {
                throw new Error('無効な画像データです');
            }
            
            // フルパスを構築（user_id/path）
            const fullPath = `${userId}/${path}`;
            
            // Supabase Storageにアップロード
            const { data, error } = await supabase.storage
                .from(this.CONFIG.storage.bucketName)
                .upload(fullPath, imageData, {
                    cacheControl: '3600',
                    upsert: true // 同名ファイルは上書き
                });
            
            if (error) {
                console.error('ImageHandler.uploadToCloud: アップロードエラー', error);
                throw error;
            }
            
            console.log(`[ImageHandler] アップロード成功: ${fullPath}`);
            
            // 署名付きURLを取得
            const signedUrl = await this.getSignedUrl(fullPath);
            
            return {
                url: signedUrl,
                path: fullPath
            };
            
        } catch (error) {
            console.error('ImageHandler.uploadToCloud error:', error);
            throw error;
        }
    }

    /**
     * 署名付きURLを取得
     * @param {string} path - ファイルパス（user_id/...を含む）
     * @returns {Promise<string>} 署名付きURL
     */
    static async getSignedUrl(path) {
        if (typeof supabase === 'undefined') {
            console.warn('ImageHandler.getSignedUrl: Supabaseが初期化されていません');
            return null;
        }
        
        try {
            const { data, error } = await supabase.storage
                .from(this.CONFIG.storage.bucketName)
                .createSignedUrl(path, this.CONFIG.storage.signedUrlExpiry);
            
            if (error) {
                console.error('ImageHandler.getSignedUrl: エラー', error);
                throw error;
            }
            
            return data.signedUrl;
            
        } catch (error) {
            console.error('ImageHandler.getSignedUrl error:', error);
            throw error;
        }
    }

    /**
     * Supabase Storageから画像を削除
     * @param {string} path - ファイルパス（user_id/...を含む）
     * @returns {Promise<boolean>} 削除成功したか
     */
    static async deleteFromCloud(path) {
        if (typeof supabase === 'undefined') {
            console.warn('ImageHandler.deleteFromCloud: Supabaseが初期化されていません');
            return false;
        }
        
        try {
            const { error } = await supabase.storage
                .from(this.CONFIG.storage.bucketName)
                .remove([path]);
            
            if (error) {
                console.error('ImageHandler.deleteFromCloud: エラー', error);
                throw error;
            }
            
            console.log(`[ImageHandler] 削除成功: ${path}`);
            return true;
            
        } catch (error) {
            console.error('ImageHandler.deleteFromCloud error:', error);
            throw error;
        }
    }

    /**
     * 画像処理のステータスを取得
     * @returns {Object} 設定情報とステータス
     */
    static getStatus() {
        const cloudEnabled = typeof supabase !== 'undefined';
        return {
            config: this.CONFIG,
            presets: Object.keys(this.CONFIG.presets),
            limits: {
                maxFileSizeMB: this.CONFIG.limits.maxFileSize / 1024 / 1024,
                maxCompressedSizeMB: this.CONFIG.limits.maxCompressedSize / 1024 / 1024
            },
            cloudEnabled: cloudEnabled,
            storageBucket: this.CONFIG.storage.bucketName
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