/**
 * config.js
 * Trading Complete - 設定管理ファイル
 * Version: 1.0
 * 
 * アプリケーション設定とFX業者設定を管理
 */

const CONFIG = {
    // ========== FX業者設定 ==========
    BROKERS: {
        DMM: {
            name: 'DMM FX',
            encoding: 'Shift-JIS',
            hasHeader: true,
            dateFormat: 'YYYY/MM/DD HH:mm:ss',
            columns: {
                date: '約定日時',
                pair: '通貨ペア',
                side: '売買',
                price: '約定レート',
                lot: '数量',
                profit: '損益',
                swap: 'スワップ',
                commission: '手数料'
            },
            pairFormat: 'USD/JPY',  // 通貨ペアの形式
            delimiter: ',',
            quotation: '"'
        },
        
        GMO: {
            name: 'GMOクリック証券',
            encoding: 'UTF-8',
            hasHeader: true,
            dateFormat: 'YYYY-MM-DD HH:mm:ss',
            columns: {
                date: '約定日時',
                pair: '通貨ペア',
                side: '売買区分',
                price: '約定価格',
                lot: '取引数量',
                profit: '決済損益',
                swap: 'スワップ損益',
                commission: '取引手数料'
            },
            pairFormat: 'USDJPY',  // スラッシュなし形式
            delimiter: ',',
            quotation: '"'
        },
        
        MINNANO: {
            name: 'みんなのFX',
            encoding: 'UTF-8',
            hasHeader: false,
            dateFormat: 'YYYY/MM/DD',
            columnOrder: ['date', 'time', 'pair', 'side', 'lot', 'price', 'profit'],
            pairFormat: 'ドル/円',  // 日本語形式
            delimiter: ',',
            quotation: null,
            
            // 通貨ペア変換マップ
            pairMap: {
                'ドル/円': 'USD/JPY',
                'ユーロ/ドル': 'EUR/USD',
                'ポンド/ドル': 'GBP/USD',
                'ユーロ/円': 'EUR/JPY',
                'ポンド/円': 'GBP/JPY',
                '豪ドル/円': 'AUD/JPY',
                'NZドル/円': 'NZD/JPY',
                'カナダドル/円': 'CAD/JPY',
                'スイスフラン/円': 'CHF/JPY'
            }
        },
        
        SBI: {
            name: 'SBI FXトレード',
            encoding: 'UTF-8',
            hasHeader: true,
            dateFormat: 'YYYY/MM/DD HH:mm:ss',
            fileType: 'excel',  // Excel形式
            columns: {
                date: '約定日時',
                pair: '通貨ペア',
                side: '売買',
                price: '約定価格',
                lot: '数量',
                profit: '実現損益',
                swap: 'スワップ',
                commission: '手数料'
            },
            pairFormat: 'USD/JPY'
        },
        
        RAKUTEN: {
            name: '楽天FX',
            encoding: 'UTF-8',
            hasHeader: true,
            dateFormat: 'YYYY/MM/DD HH:mm',
            columns: {
                date: '取引日時',
                pair: '通貨ペア',
                side: '売買',
                price: 'レート',
                lot: '取引数量',
                profit: '損益',
                swap: 'スワップポイント',
                commission: '手数料'
            },
            pairFormat: 'USD/JPY'
        },
        
        HIROSE: {
            name: 'ヒロセ通商',
            encoding: 'Shift-JIS',
            hasHeader: true,
            dateFormat: 'YYYY年MM月DD日 HH:mm:ss',
            fileType: 'pdf',  // PDF形式（将来対応）
            columns: {
                date: '約定日時',
                pair: '通貨ペア',
                side: '売買',
                price: '約定価格',
                lot: 'Lot数',
                profit: '決済損益',
                swap: 'スワップ',
                commission: '手数料'
            },
            pairFormat: 'USD/JPY'
        }
    },
    
    // ========== API設定（将来用）==========
    API: {
        SUPABASE_URL: '',  // 環境変数から設定
        SUPABASE_KEY: '',  // 環境変数から設定
        STRIPE_PUBLIC_KEY: '',  // 環境変数から設定
        OPENAI_KEY: '',  // 環境変数から設定（AI分析用）
        
        // エンドポイント
        ENDPOINTS: {
            TRADES: '/api/trades',
            NOTES: '/api/notes',
            USERS: '/api/users',
            SUBSCRIPTION: '/api/subscription',
            ANALYTICS: '/api/analytics'
        }
    },
    
    // ========== アプリケーション設定 ==========
    APP: {
        // デバッグモード
        DEBUG_MODE: false,
        
        // ログレベル
        LOG_LEVEL: 'error',  // 'debug', 'info', 'warn', 'error'
        
        // 機能フラグ
        FEATURES: {
            CSV_IMPORT: true,
            CLOUD_SYNC: false,  // 将来実装
            AI_ANALYSIS: false,  // 将来実装
            MULTI_BROKER: true,
            TAX_CALCULATION: true,
            LEARNING_TAB: false,  // 将来実装
            PREMIUM_FEATURES: false,
            DEMO_MODE: false
        },
        
        // パフォーマンス設定
        PERFORMANCE: {
            LAZY_LOAD_IMAGES: true,
            VIRTUAL_SCROLL: false,
            CACHE_DURATION: 86400000,  // 24時間（ミリ秒）
            DEBOUNCE_SEARCH: 500,
            BATCH_SIZE: 50,
            MAX_UNDO_HISTORY: 20
        },
        
        // UI設定
        UI: {
            ANIMATION_ENABLED: true,
            SHOW_TOOLTIPS: true,
            AUTO_SAVE: true,
            AUTO_SAVE_INTERVAL: 30000,  // 30秒
            CONFIRM_DELETE: true,
            SHOW_WELCOME: true,
            DATE_FORMAT: 'YYYY/MM/DD',
            TIME_FORMAT: 'HH:mm:ss',
            NUMBER_FORMAT: 'ja-JP'
        }
    },
    
    // ========== チャート設定 ==========
    CHART: {
        DEFAULT_PERIOD: 30,  // デフォルト表示期間（日）
        MAX_DATA_POINTS: 100,
        COLORS: {
            PROFIT: '#00ff88',
            LOSS: '#ff4444',
            NEUTRAL: '#888888',
            GRID: 'rgba(255, 255, 255, 0.1)',
            TEXT: '#ffffff'
        },
        OPTIONS: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 500
            },
            scales: {
                x: {
                    grid: {
                        display: true,
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#ffffff'
                    }
                },
                y: {
                    grid: {
                        display: true,
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#ffffff'
                    }
                }
            }
        }
    },
    
    // ========== 検証ルール ==========
    VALIDATION: {
        PRICE: {
            MIN: 0.00001,
            MAX: 999999.99999,
            DECIMALS: 5
        },
        LOT: {
            MIN: 0.01,
            MAX: 100,
            STEP: 0.01
        },
        PIPS: {
            MIN: -9999,
            MAX: 9999
        },
        DATE: {
            MIN: '2000-01-01',
            MAX: '2099-12-31'
        },
        TEXT: {
            MAX_LENGTH: 10000,
            MIN_LENGTH: 0
        }
    },
    
    // ========== セキュリティ設定 ==========
    SECURITY: {
        SESSION_TIMEOUT: 3600000,  // 1時間
        MAX_LOGIN_ATTEMPTS: 5,
        PASSWORD_MIN_LENGTH: 8,
        REQUIRE_2FA: false,
        ENCRYPT_LOCAL_STORAGE: false,
        ALLOWED_ORIGINS: ['http://localhost', 'https://trading-complete.com'],
        CSP_POLICY: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    },
    
    // ========== 環境設定 ==========
    ENV: {
        MODE: 'development',  // 'development', 'staging', 'production'
        BASE_URL: window.location.origin,
        API_URL: '',  // 将来設定
        CDN_URL: '',  // 将来設定
        VERSION: '1.0.0'
    }
};

// デバッグモードの設定（URLパラメータで制御）
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('debug') === 'true') {
    CONFIG.APP.DEBUG_MODE = true;
    CONFIG.APP.LOG_LEVEL = 'debug';
}

// 環境変数から設定を上書き（もし存在すれば）
if (typeof process !== 'undefined' && process.env) {
    CONFIG.API.SUPABASE_URL = process.env.SUPABASE_URL || CONFIG.API.SUPABASE_URL;
    CONFIG.API.SUPABASE_KEY = process.env.SUPABASE_KEY || CONFIG.API.SUPABASE_KEY;
    CONFIG.API.STRIPE_PUBLIC_KEY = process.env.STRIPE_PUBLIC_KEY || CONFIG.API.STRIPE_PUBLIC_KEY;
    CONFIG.ENV.MODE = process.env.NODE_ENV || CONFIG.ENV.MODE;
}

// グローバルに公開
window.CONFIG = CONFIG;

// CommonJS/ES6モジュール対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}