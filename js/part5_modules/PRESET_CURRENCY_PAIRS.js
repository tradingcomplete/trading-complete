/**
 * @file PRESET_CURRENCY_PAIRS.js
 * @description プリセット通貨ペアデータ（53通貨ペア）
 * @author AI Assistant / コンパナ
 * @version 2.1.0
 * @date 2025-11-26
 * 
 * 【カテゴリ構成】
 * - usd: 🇺🇸 米ドル絡み（7通貨ペア）
 * - jpy: 🇯🇵 日本円絡み（11通貨ペア）※USD/JPY除く
 * - cross: 🌐 その他クロス通貨（15通貨ペア）
 * - commodity: 🏅 コモディティ（8銘柄）
 * - crypto: ₿ 仮想通貨（12銘柄）
 * 
 * 【重複なし】
 * USD/JPYは「米ドル絡み」のみに含まれる
 * 
 * 【v2.1.0 変更点】
 * pipValueを0.1pips単位（1 point）に統一
 */

const PRESET_CURRENCY_PAIRS = [
    // ====================================
    // 🇺🇸 米ドル絡み（7通貨ペア）
    // ====================================
    {
        id: 'eurusd',
        name: 'EUR/USD',
        displayName: 'ユーロ/米ドル',
        pipValue: 0.00001,
        category: 'usd',
        description: '世界最大の流動性'
    },
    {
        id: 'gbpusd',
        name: 'GBP/USD',
        displayName: 'ポンド/米ドル',
        pipValue: 0.00001,
        category: 'usd',
        description: 'ボラティリティ高'
    },
    {
        id: 'audusd',
        name: 'AUD/USD',
        displayName: '豪ドル/米ドル',
        pipValue: 0.00001,
        category: 'usd',
        description: '資源国通貨'
    },
    {
        id: 'nzdusd',
        name: 'NZD/USD',
        displayName: 'NZドル/米ドル',
        pipValue: 0.00001,
        category: 'usd',
        description: '高金利通貨'
    },
    {
        id: 'usdjpy',
        name: 'USD/JPY',
        displayName: '米ドル/円',
        pipValue: 0.001,
        category: 'usd',
        description: '日本人に最人気'
    },
    {
        id: 'usdchf',
        name: 'USD/CHF',
        displayName: '米ドル/スイスフラン',
        pipValue: 0.00001,
        category: 'usd',
        description: '安全通貨'
    },
    {
        id: 'usdcad',
        name: 'USD/CAD',
        displayName: '米ドル/カナダドル',
        pipValue: 0.00001,
        category: 'usd',
        description: '資源連動'
    },

    // ====================================
    // 🇯🇵 日本円絡み（11通貨ペア）
    // ====================================
    {
        id: 'eurjpy',
        name: 'EUR/JPY',
        displayName: 'ユーロ/円',
        pipValue: 0.001,
        category: 'jpy',
        description: '人気のクロス円'
    },
    {
        id: 'gbpjpy',
        name: 'GBP/JPY',
        displayName: 'ポンド/円',
        pipValue: 0.001,
        category: 'jpy',
        description: 'ボラティリティ高'
    },
    {
        id: 'audjpy',
        name: 'AUD/JPY',
        displayName: '豪ドル/円',
        pipValue: 0.001,
        category: 'jpy',
        description: '資源国通貨'
    },
    {
        id: 'nzdjpy',
        name: 'NZD/JPY',
        displayName: 'NZドル/円',
        pipValue: 0.001,
        category: 'jpy',
        description: '高金利通貨'
    },
    {
        id: 'cadjpy',
        name: 'CAD/JPY',
        displayName: 'カナダドル/円',
        pipValue: 0.001,
        category: 'jpy',
        description: '資源国通貨'
    },
    {
        id: 'chfjpy',
        name: 'CHF/JPY',
        displayName: 'スイスフラン/円',
        pipValue: 0.001,
        category: 'jpy',
        description: '安全通貨'
    },
    {
        id: 'sgdjpy',
        name: 'SGD/JPY',
        displayName: 'シンガポールドル/円',
        pipValue: 0.001,
        category: 'jpy',
        description: 'アジア通貨'
    },
    {
        id: 'hkdjpy',
        name: 'HKD/JPY',
        displayName: '香港ドル/円',
        pipValue: 0.001,
        category: 'jpy',
        description: 'アジア通貨'
    },
    {
        id: 'zarjpy',
        name: 'ZAR/JPY',
        displayName: '南アフリカランド/円',
        pipValue: 0.001,
        category: 'jpy',
        description: '高金利通貨'
    },
    {
        id: 'tryjpy',
        name: 'TRY/JPY',
        displayName: 'トルコリラ/円',
        pipValue: 0.001,
        category: 'jpy',
        description: '高金利通貨'
    },
    {
        id: 'mxnjpy',
        name: 'MXN/JPY',
        displayName: 'メキシコペソ/円',
        pipValue: 0.001,
        category: 'jpy',
        description: '高金利通貨'
    },

    // ====================================
    // 🌐 その他クロス通貨（15通貨ペア）
    // ====================================
    {
        id: 'eurgbp',
        name: 'EUR/GBP',
        displayName: 'ユーロ/ポンド',
        pipValue: 0.00001,
        category: 'cross',
        description: '欧州主要通貨'
    },
    {
        id: 'euraud',
        name: 'EUR/AUD',
        displayName: 'ユーロ/豪ドル',
        pipValue: 0.00001,
        category: 'cross',
        description: '欧州vs資源国'
    },
    {
        id: 'eurnzd',
        name: 'EUR/NZD',
        displayName: 'ユーロ/NZドル',
        pipValue: 0.00001,
        category: 'cross',
        description: '欧州vs資源国'
    },
    {
        id: 'eurcad',
        name: 'EUR/CAD',
        displayName: 'ユーロ/カナダドル',
        pipValue: 0.00001,
        category: 'cross',
        description: '欧州vs資源国'
    },
    {
        id: 'eurchf',
        name: 'EUR/CHF',
        displayName: 'ユーロ/スイスフラン',
        pipValue: 0.00001,
        category: 'cross',
        description: '欧州通貨'
    },
    {
        id: 'gbpaud',
        name: 'GBP/AUD',
        displayName: 'ポンド/豪ドル',
        pipValue: 0.00001,
        category: 'cross',
        description: 'ボラティリティ高'
    },
    {
        id: 'gbpnzd',
        name: 'GBP/NZD',
        displayName: 'ポンド/NZドル',
        pipValue: 0.00001,
        category: 'cross',
        description: 'ボラティリティ高'
    },
    {
        id: 'gbpcad',
        name: 'GBP/CAD',
        displayName: 'ポンド/カナダドル',
        pipValue: 0.00001,
        category: 'cross',
        description: 'ボラティリティ高'
    },
    {
        id: 'gbpchf',
        name: 'GBP/CHF',
        displayName: 'ポンド/スイスフラン',
        pipValue: 0.00001,
        category: 'cross',
        description: 'ボラティリティ高'
    },
    {
        id: 'audnzd',
        name: 'AUD/NZD',
        displayName: '豪ドル/NZドル',
        pipValue: 0.00001,
        category: 'cross',
        description: 'オセアニア通貨'
    },
    {
        id: 'audcad',
        name: 'AUD/CAD',
        displayName: '豪ドル/カナダドル',
        pipValue: 0.00001,
        category: 'cross',
        description: '資源国通貨'
    },
    {
        id: 'audchf',
        name: 'AUD/CHF',
        displayName: '豪ドル/スイスフラン',
        pipValue: 0.00001,
        category: 'cross',
        description: 'リスクオン/オフ'
    },
    {
        id: 'nzdcad',
        name: 'NZD/CAD',
        displayName: 'NZドル/カナダドル',
        pipValue: 0.00001,
        category: 'cross',
        description: '資源国通貨'
    },
    {
        id: 'nzdchf',
        name: 'NZD/CHF',
        displayName: 'NZドル/スイスフラン',
        pipValue: 0.00001,
        category: 'cross',
        description: 'リスクオン/オフ'
    },
    {
        id: 'cadchf',
        name: 'CAD/CHF',
        displayName: 'カナダドル/スイスフラン',
        pipValue: 0.00001,
        category: 'cross',
        description: '資源vs安全通貨'
    },

    // ====================================
    // 🏅 コモディティ（8銘柄）
    // ====================================
    {
        id: 'xauusd',
        name: 'XAU/USD',
        displayName: '金（ゴールド）',
        pipValue: 0.01,
        category: 'commodity',
        description: '安全資産の代表'
    },
    {
        id: 'xagusd',
        name: 'XAG/USD',
        displayName: '銀（シルバー）',
        pipValue: 0.001,
        category: 'commodity',
        description: '工業用金属'
    },
    {
        id: 'wti',
        name: 'WTI',
        displayName: '原油（WTI）',
        pipValue: 0.001,
        category: 'commodity',
        description: '米国原油指標'
    },
    {
        id: 'brent',
        name: 'BRENT',
        displayName: '原油（ブレント）',
        pipValue: 0.001,
        category: 'commodity',
        description: '欧州原油指標'
    },
    {
        id: 'copper',
        name: 'COPPER',
        displayName: '銅',
        pipValue: 0.00001,
        category: 'commodity',
        description: '景気先行指標'
    },
    {
        id: 'platinum',
        name: 'PLATINUM',
        displayName: 'プラチナ',
        pipValue: 0.01,
        category: 'commodity',
        description: '貴金属'
    },
    {
        id: 'palladium',
        name: 'PALLADIUM',
        displayName: 'パラジウム',
        pipValue: 0.01,
        category: 'commodity',
        description: '自動車触媒'
    },
    {
        id: 'natgas',
        name: 'NATGAS',
        displayName: '天然ガス',
        pipValue: 0.001,
        category: 'commodity',
        description: 'エネルギー'
    },

    // ====================================
    // ₿ 仮想通貨（12銘柄）
    // ====================================
    {
        id: 'btcusd',
        name: 'BTC/USD',
        displayName: 'ビットコイン',
        pipValue: 0.1,
        category: 'crypto',
        description: '仮想通貨の王様'
    },
    {
        id: 'ethusd',
        name: 'ETH/USD',
        displayName: 'イーサリアム',
        pipValue: 0.01,
        category: 'crypto',
        description: 'スマートコントラクト'
    },
    {
        id: 'xrpusd',
        name: 'XRP/USD',
        displayName: 'リップル',
        pipValue: 0.00001,
        category: 'crypto',
        description: '国際送金'
    },
    {
        id: 'ltcusd',
        name: 'LTC/USD',
        displayName: 'ライトコイン',
        pipValue: 0.001,
        category: 'crypto',
        description: 'ビットコインの弟'
    },
    {
        id: 'bchusd',
        name: 'BCH/USD',
        displayName: 'ビットコインキャッシュ',
        pipValue: 0.01,
        category: 'crypto',
        description: 'ビットコイン分岐'
    },
    {
        id: 'adausd',
        name: 'ADA/USD',
        displayName: 'カルダノ',
        pipValue: 0.00001,
        category: 'crypto',
        description: '第3世代ブロックチェーン'
    },
    {
        id: 'dotusd',
        name: 'DOT/USD',
        displayName: 'ポルカドット',
        pipValue: 0.001,
        category: 'crypto',
        description: '相互運用性'
    },
    {
        id: 'linkusd',
        name: 'LINK/USD',
        displayName: 'チェーンリンク',
        pipValue: 0.001,
        category: 'crypto',
        description: 'オラクルサービス'
    },
    {
        id: 'bnbusd',
        name: 'BNB/USD',
        displayName: 'バイナンスコイン',
        pipValue: 0.01,
        category: 'crypto',
        description: 'バイナンス取引所'
    },
    {
        id: 'solusd',
        name: 'SOL/USD',
        displayName: 'ソラナ',
        pipValue: 0.001,
        category: 'crypto',
        description: '高速ブロックチェーン'
    },
    {
        id: 'maticusd',
        name: 'MATIC/USD',
        displayName: 'ポリゴン',
        pipValue: 0.00001,
        category: 'crypto',
        description: 'イーサリアムL2'
    },
    {
        id: 'avaxusd',
        name: 'AVAX/USD',
        displayName: 'アバランチ',
        pipValue: 0.001,
        category: 'crypto',
        description: 'DeFiプラットフォーム'
    }
];

// ====================================
// ヘルパー関数
// ====================================

/**
 * カテゴリ別に通貨ペアを取得
 * @param {string} category - カテゴリ名
 * @returns {Array} 通貨ペア配列
 */
function getPresetPairsByCategory(category) {
    if (category === 'all') {
        return PRESET_CURRENCY_PAIRS;
    }
    return PRESET_CURRENCY_PAIRS.filter(pair => pair.category === category);
}

/**
 * IDで通貨ペアを検索
 * @param {string} id - 通貨ペアID
 * @returns {Object|null} 通貨ペアオブジェクト
 */
function getPresetPairById(id) {
    return PRESET_CURRENCY_PAIRS.find(pair => pair.id === id) || null;
}

/**
 * 名前で通貨ペアを検索（部分一致）
 * @param {string} query - 検索クエリ
 * @returns {Array} 通貨ペア配列
 */
function searchPresetPairsByName(query) {
    const q = query.toLowerCase();
    return PRESET_CURRENCY_PAIRS.filter(pair => 
        pair.name.toLowerCase().includes(q) ||
        pair.displayName.toLowerCase().includes(q)
    );
}

/**
 * カテゴリ情報を取得
 * @returns {Object} カテゴリ情報
 */
function getCategories() {
    return {
        all: { name: 'すべて', icon: '', count: PRESET_CURRENCY_PAIRS.length },
        usd: { name: 'ドル絡み', icon: '🇺🇸', count: getPresetPairsByCategory('usd').length },
        jpy: { name: '円絡み', icon: '🇯🇵', count: getPresetPairsByCategory('jpy').length },
        cross: { name: 'クロス', icon: '🌐', count: getPresetPairsByCategory('cross').length },
        commodity: { name: 'コモディティ', icon: '🏅', count: getPresetPairsByCategory('commodity').length },
        crypto: { name: '仮想通貨', icon: '₿', count: getPresetPairsByCategory('crypto').length }
    };
}

// ====================================
// グローバル登録
// ====================================

if (typeof window !== 'undefined') {
    window.PRESET_CURRENCY_PAIRS = PRESET_CURRENCY_PAIRS;
    window.getPresetPairsByCategory = getPresetPairsByCategory;
    window.getPresetPairById = getPresetPairById;
    window.searchPresetPairsByName = searchPresetPairsByName;
    window.getCategories = getCategories;
    
    console.log('✅ PRESET_CURRENCY_PAIRS loaded:', PRESET_CURRENCY_PAIRS.length, 'pairs (v2.1.0 - 0.1pips単位)');
    console.log('📊 Categories:', getCategories());
}

// Node.js環境用（将来的な拡張）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PRESET_CURRENCY_PAIRS,
        getPresetPairsByCategory,
        getPresetPairById,
        searchPresetPairsByName,
        getCategories
    };
}