/**
 * constants.js
 * Trading Complete - 定数管理ファイル
 * Version: 1.0
 * 
 * すべてのアプリケーション定数を集中管理
 */

const CONSTANTS = {
    // ========== 制限値 ==========
    LIMITS: {
        FREE_TRADES: 10,                      // 無料版の月間トレード制限
        MAX_FOLDERS: 15,                      // 最大フォルダ数
        MAX_IMAGE_SIZE: 5 * 1024 * 1024,      // 最大画像サイズ (5MB)
        STORAGE_LIMIT: 10 * 1024 * 1024,      // ストレージ上限 (10MB)
        MAX_IMAGES_PER_TRADE: 3,              // トレードあたりの最大画像数
        MAX_IMAGES_PER_NOTE: 3,               // ノートあたりの最大画像数
        MAX_NOTE_LENGTH: 10000,               // ノートの最大文字数
        MIN_PIPS: -999,                       // 最小pips値
        MAX_PIPS: 9999,                       // 最大pips値
        MIN_LOT_SIZE: 0.01,                   // 最小ロットサイズ
        MAX_LOT_SIZE: 100,                    // 最大ロットサイズ
        DEFAULT_FOLDERS: 5,                   // デフォルトフォルダ数
        CUSTOM_FOLDERS: 10                    // カスタムフォルダ数
    },
    
    // ========== メッセージ ==========
    MESSAGES: {
        // エラーメッセージ
        TRADE_LIMIT_EXCEEDED: '無料版は月10件までです。プレミアムプランにアップグレードしてください。',
        STORAGE_FULL: 'ストレージ容量が不足しています。不要なデータを削除してください。',
        CSV_FORMAT_ERROR: 'CSVフォーマットが正しくありません。ファイルを確認してください。',
        NETWORK_ERROR: 'ネットワークエラーが発生しました。接続を確認してください。',
        IMAGE_TOO_LARGE: '画像サイズが大きすぎます。5MB以下の画像を選択してください。',
        INVALID_DATE: '無効な日付です。正しい日付を入力してください。',
        INVALID_PRICE: '無効な価格です。正しい価格を入力してください。',
        INVALID_PAIR: '無効な通貨ペアです。正しい形式で入力してください。',
        
        // 成功メッセージ
        SAVE_SUCCESS: '保存しました',
        DELETE_SUCCESS: '削除しました',
        UPDATE_SUCCESS: '更新しました',
        IMPORT_SUCCESS: 'インポートが完了しました',
        EXPORT_SUCCESS: 'エクスポートが完了しました',
        COPY_SUCCESS: 'クリップボードにコピーしました',
        
        // 確認メッセージ
        DELETE_CONFIRM: '本当に削除しますか？この操作は取り消せません。',
        EXIT_CONFIRM: '未保存の変更があります。ページを離れますか？',
        IMPORT_CONFIRM: '既存のデータが上書きされる可能性があります。続行しますか？',
        
        // 警告メッセージ
        STORAGE_WARNING: 'ストレージ使用量が80%を超えています',
        DEMO_WARNING: 'デモモードで動作しています。データは保存されません。',
        BROWSER_WARNING: 'お使いのブラウザは一部の機能に対応していません。'
    },
    
    // ========== 税率・計算関連 ==========
    TAX: {
        DOMESTIC_RATE: 0.20315,               // 国内FX税率 (20.315%)
        THRESHOLD: 200000,                    // 非課税枠 (20万円)
        WITHHOLDING_RATE: 0.2042,            // 源泉徴収税率
        RECONSTRUCTION_TAX: 0.021,            // 復興特別所得税率
        INCOME_TAX_RATE: 0.20,                // 所得税率（分離課税）
        RESIDENT_TAX_RATE: 0.05               // 住民税率
    },
    
    // ========== 通貨ペア ==========
    CURRENCY_PAIRS: {
        MAJOR: [
            'USD/JPY', 'EUR/USD', 'GBP/USD', 'USD/CHF',
            'USD/CAD', 'AUD/USD', 'NZD/USD'
        ],
        CROSS: [
            'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'NZD/JPY',
            'EUR/GBP', 'EUR/AUD', 'GBP/AUD'
        ],
        EXOTIC: [
            'USD/TRY', 'USD/ZAR', 'USD/MXN', 'USD/SGD',
            'USD/HKD', 'USD/NOK', 'USD/SEK'
        ]
    },
    
    // ========== FX業者リスト ==========
    BROKERS: [
        'DMM FX',
        'GMOクリック証券',
        'みんなのFX',
        'SBI FXトレード',
        '楽天FX',
        'ヒロセ通商',
        '外為どっとコム',
        'YJFX!',
        'マネーパートナーズ',
        'その他'
    ],
    
    // ========== デフォルト値 ==========
    DEFAULTS: {
        LOT_SIZE: 1.0,                        // デフォルトロットサイズ
        LEVERAGE: 25,                          // デフォルトレバレッジ
        RISK_PERCENT: 2,                       // デフォルトリスク率
        RR_RATIO: 2.0,                        // デフォルトリスクリワード比
        CHART_PERIOD: 30,                     // デフォルトチャート期間（日）
        IMAGE_QUALITY: 0.8,                   // 画像圧縮品質
        IMAGE_MAX_WIDTH: 1920,                // 画像最大幅
        IMAGE_MAX_HEIGHT: 1080,               // 画像最大高さ
        ANIMATION_DURATION: 300,              // アニメーション時間（ミリ秒）
        TOAST_DURATION: 3000,                 // トースト表示時間（ミリ秒）
        DEBOUNCE_DELAY: 500                  // デバウンス遅延（ミリ秒）
    },
    
    // ========== 画像設定 ==========
    IMAGE: {
        COMPRESSION: {
            QUALITY: 0.8,                     // JPEG品質
            MAX_WIDTH: 1920,                  // 最大幅
            MAX_HEIGHT: 1080,                 // 最大高さ
            FORMAT: 'jpeg',                   // 出力フォーマット
            MIME_TYPE: 'image/jpeg'          // MIMEタイプ
        },
        ALLOWED_TYPES: [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp'
        ],
        THUMBNAIL: {
            WIDTH: 150,                       // サムネイル幅
            HEIGHT: 150,                      // サムネイル高さ
            QUALITY: 0.6                      // サムネイル品質
        }
    },
    
    // ========== 経費カテゴリ ==========
    EXPENSE_CATEGORIES: [
        '通信費',
        '書籍・教材費',
        'セミナー費',
        '機器・ソフトウェア',
        '手数料',
        '交通費',
        '会議費',
        'その他'
    ],
    
    // ========== セッション時間 ==========
    SESSIONS: {
        TOKYO: { start: '09:00', end: '15:00', name: '東京' },
        LONDON: { start: '16:00', end: '00:00', name: 'ロンドン' },
        NEWYORK: { start: '21:00', end: '06:00', name: 'ニューヨーク' },
        SYDNEY: { start: '06:00', end: '14:00', name: 'シドニー' }
    },
    
    // ========== ローカルストレージキー ==========
    STORAGE_KEYS: {
        TRADES: 'trades',
        NOTES: 'notes',
        GOALS: 'goalsData',
        SETTINGS: 'userSettings',
        THEME: 'theme',
        LEARNING: 'learningData',
        TAX: 'taxData',
        CHARACTER_CACHE: 'characterCache',
        SEVEN_HEROES: 'sevenHeroesCollection',
        SNS_TEMPLATES: 'snsTemplates',
        CHART_CONFIG: 'chartConfig'
    },
    
    // ========== API設定（将来用）==========
    API: {
        BASE_URL: '',                        // APIベースURL（将来設定）
        TIMEOUT: 30000,                       // タイムアウト（ミリ秒）
        RETRY_LIMIT: 3,                       // リトライ回数
        RETRY_DELAY: 1000                    // リトライ間隔（ミリ秒）
    },
    
    // ========== バージョン情報 ==========
    VERSION: {
        APP: '1.0.0',
        API: '1.0',
        DATA_SCHEMA: '1.0'
    }
};

// グローバルに公開
window.CONSTANTS = CONSTANTS;

// CommonJS/ES6モジュール対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONSTANTS;
}