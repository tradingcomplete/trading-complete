/**
 * PRESET_BROKERS.js
 * 
 * プリセットブローカーデータ定義
 * 
 * 📝 設計方針:
 * - スペルミス防止のため、主要ブローカーをプリセットで用意
 * - 略称（shortName）をバッジ表示用に定義
 * - モジュール化により、ブローカーの追加・修正が容易
 * - ユーザーはプリセットから選ぶか、カスタム追加可能
 * 
 * 💡 使用方法:
 * import PRESET_BROKERS from './PRESET_BROKERS.js';
 * 
 * 📋 lotUnit（1ロット単位）の調査結果:
 * - LINE FX: 1ロット = 10,000通貨（1,000通貨から取引可能 = 0.1ロット）
 * - 楽天FX: 1ロット = 10,000通貨（0.1ロット = 1,000通貨から取引可能）
 * - みんなのFX / LIGHT FX: 1ロット = 10,000通貨
 * - DMM FX / GMOクリック証券: 1ロット = 10,000通貨
 * - 外為どっとコム / ヒロセ通商: 1ロット = 1,000通貨
 * - SBI FXトレード / 松井証券: 1通貨から取引可能
 * - 海外FX（XM, AXIORY等）: 1ロット = 100,000通貨
 * 
 * @version 1.1.0
 * @date 2025-11-26
 * @changelog
 * - v1.1.0: LINE FX, 楽天FX, みんなのFX, LIGHT FXのlotUnitを1000→10000に修正
 */

const PRESET_BROKERS = [
  // ==========================================
  // 国内主要ブローカー (20社)
  // ==========================================
  
  { 
    id: 'dmm_fx', 
    name: 'DMM FX', 
    shortName: 'DMM',
    lotUnit: 10000, 
    country: 'jp',
    category: 'domestic',
    description: 'DMM.com証券が提供するFXサービス'
  },
  
  { 
    id: 'gmo_click', 
    name: 'GMOクリック証券', 
    shortName: 'GMO',
    lotUnit: 10000, 
    country: 'jp',
    category: 'domestic',
    description: 'GMOインターネットグループのFXサービス'
  },
  
  { 
    id: 'line_fx', 
    name: 'LINE FX', 
    shortName: 'LINE',
    lotUnit: 10000,  // ★修正: 1000→10000（1ロット=10,000通貨、最低取引単位は1,000通貨=0.1ロット）
    country: 'jp',
    category: 'domestic',
    description: 'LINE証券が提供するFXサービス'
  },
  
  { 
    id: 'rakuten_fx', 
    name: '楽天証券（楽天FX）', 
    shortName: '楽天',
    lotUnit: 10000,  // ★修正: 1000→10000（1ロット=10,000通貨、0.1ロット=1,000通貨から取引可能）
    country: 'jp',
    category: 'domestic',
    description: '楽天グループの大手ネット証券'
  },
  
  { 
    id: 'gaitame_com', 
    name: '外為どっとコム', 
    shortName: '外為.com',
    lotUnit: 1000,  // 正しい: 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: '老舗のFX専業会社'
  },
  
  { 
    id: 'sbi_fx', 
    name: 'SBI FXトレード', 
    shortName: 'SBI',
    lotUnit: 1,  // 正しい: 1通貨から取引可能
    country: 'jp',
    category: 'domestic',
    description: 'SBIグループのFXサービス、1通貨から取引可能'
  },
  
  { 
    id: 'hirose_lion', 
    name: 'ヒロセ通商（LION FX）', 
    shortName: 'LION',
    lotUnit: 1000,  // 正しい: 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: '豊富な通貨ペアと高約定力が特徴'
  },
  
  { 
    id: 'gaitame_online', 
    name: '外為オンライン', 
    shortName: '外為OL',
    lotUnit: 1000,  // 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: '自動売買ツールが充実'
  },
  
  { 
    id: 'yjfx', 
    name: 'YJFX!（外貨ex）', 
    shortName: 'YJFX',
    lotUnit: 1000,  // 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: 'ヤフーグループのFXサービス'
  },
  
  { 
    id: 'money_partners', 
    name: 'マネーパートナーズ', 
    shortName: 'マネパ',
    lotUnit: 10000,  // 正しい: パートナーズFXは1万通貨単位
    country: 'jp',
    category: 'domestic',
    description: '約定力の高さに定評'
  },
  
  { 
    id: 'minnano_fx', 
    name: 'みんなのFX', 
    shortName: 'みんなのFX',
    lotUnit: 10000,  // ★修正: 1000→10000（1ロット=10,000通貨）
    country: 'jp',
    category: 'domestic',
    description: 'トレイダーズ証券が提供、スワップポイントが高水準'
  },
  
  { 
    id: 'light_fx', 
    name: 'LIGHT FX', 
    shortName: 'LIGHT',
    lotUnit: 10000,  // ★修正: 1000→10000（1ロット=10,000通貨）
    country: 'jp',
    category: 'domestic',
    description: 'トレイダーズ証券の低コストFXサービス'
  },
  
  { 
    id: 'oanda_japan', 
    name: 'OANDA Japan', 
    shortName: 'OANDA',
    lotUnit: 1000,  // 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: 'グローバル展開のFX会社の日本法人'
  },
  
  { 
    id: 'matsui_fx', 
    name: '松井証券 MATSUI FX', 
    shortName: '松井',
    lotUnit: 1,  // 正しい: 1通貨から取引可能
    country: 'jp',
    category: 'domestic',
    description: '老舗証券会社のFXサービス、1通貨から取引可能'
  },
  
  { 
    id: 'au_kabucom', 
    name: 'auカブコム証券', 
    shortName: 'auカブコム',
    lotUnit: 1000,  // 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: 'au系列の大手ネット証券'
  },
  
  { 
    id: 'central_tanshi', 
    name: 'セントラル短資FX', 
    shortName: 'セントラル',
    lotUnit: 1000,  // 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: '短資会社系の老舗FX会社'
  },
  
  { 
    id: 'invast', 
    name: 'インヴァスト証券（トライオートFX）', 
    shortName: 'インヴァスト',
    lotUnit: 1000,  // 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: '自動売買ツールで有名'
  },
  
  { 
    id: 'fx_prime', 
    name: 'FXプライムbyGMO', 
    shortName: 'FXプライム',
    lotUnit: 1000,  // 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: 'GMOグループのFXサービス、約定力に定評'
  },
  
  { 
    id: 'inet_sec', 
    name: 'アイネット証券（ループイフダン）', 
    shortName: 'アイネット',
    lotUnit: 1000,  // 1ロット=1,000通貨
    country: 'jp',
    category: 'domestic',
    description: '自動売買「ループイフダン」で人気'
  },
  
  { 
    id: 'jfx', 
    name: 'JFX（MATRIX TRADER）', 
    shortName: 'JFX',
    lotUnit: 1000,  // 1ロット=1,000通貨（ヒロセ通商の姉妹会社）
    country: 'jp',
    category: 'domestic',
    description: 'ヒロセ通商の姉妹会社、スキャルピング可能'
  },
  
  // ==========================================
  // 海外主要ブローカー (5社)
  // ==========================================
  
  { 
    id: 'xm_trading', 
    name: 'XM Trading', 
    shortName: 'XM',
    lotUnit: 100000,  // 正しい: 海外FXは1ロット=100,000通貨
    country: 'global',
    category: 'overseas',
    description: '世界的に人気の高レバレッジブローカー'
  },
  
  { 
    id: 'axiory', 
    name: 'AXIORY', 
    shortName: 'AXIORY',
    lotUnit: 100000,  // 正しい: 海外FXは1ロット=100,000通貨
    country: 'global',
    category: 'overseas',
    description: '透明性の高い取引環境を提供'
  },
  
  { 
    id: 'titanfx', 
    name: 'TitanFX', 
    shortName: 'Titan',
    lotUnit: 100000,  // 正しい: 海外FXは1ロット=100,000通貨
    country: 'global',
    category: 'overseas',
    description: '狭いスプレッドと高速約定が特徴'
  },
  
  { 
    id: 'exness', 
    name: 'Exness', 
    shortName: 'Exness',
    lotUnit: 100000,  // 正しい: 海外FXは1ロット=100,000通貨
    country: 'global',
    category: 'overseas',
    description: '無制限レバレッジが利用可能'
  },
  
  { 
    id: 'fxgt', 
    name: 'FXGT', 
    shortName: 'FXGT',
    lotUnit: 100000,  // 正しい: 海外FXは1ロット=100,000通貨
    country: 'global',
    category: 'overseas',
    description: 'FXと仮想通貨のハイブリッドブローカー'
  }
];

// ==========================================
// ユーティリティ関数
// ==========================================

/**
 * IDからプリセットブローカーを取得
 * @param {string} id - ブローカーID
 * @returns {Object|null} ブローカーデータ
 */
function getPresetBrokerById(id) {
  return PRESET_BROKERS.find(broker => broker.id === id) || null;
}

/**
 * 名前からプリセットブローカーを検索
 * @param {string} name - ブローカー名
 * @returns {Object|null} ブローカーデータ
 */
function findPresetBrokerByName(name) {
  const searchName = name.toLowerCase().trim();
  return PRESET_BROKERS.find(broker => 
    broker.name.toLowerCase().includes(searchName) ||
    broker.shortName.toLowerCase().includes(searchName)
  ) || null;
}

/**
 * カテゴリでフィルタリング
 * @param {string} category - 'domestic' または 'overseas'
 * @returns {Array} フィルタリングされたブローカーリスト
 */
function getPresetBrokersByCategory(category) {
  return PRESET_BROKERS.filter(broker => broker.category === category);
}

/**
 * 国内ブローカーを取得
 * @returns {Array} 国内ブローカーリスト
 */
function getDomesticBrokers() {
  return getPresetBrokersByCategory('domestic');
}

/**
 * 海外ブローカーを取得
 * @returns {Array} 海外ブローカーリスト
 */
function getOverseasBrokers() {
  return getPresetBrokersByCategory('overseas');
}

/**
 * すべてのプリセットブローカーを取得
 * @returns {Array} 全ブローカーリスト
 */
function getAllPresetBrokers() {
  return [...PRESET_BROKERS];
}

// ==========================================
// デフォルトエクスポート
// ==========================================

// ================
// グローバル登録（モジュールシステム非対応環境用）
// ================
if (typeof window !== 'undefined') {
    window.PRESET_BROKERS = PRESET_BROKERS;
    window.getPresetBrokerById = getPresetBrokerById;
    window.findPresetBrokerByName = findPresetBrokerByName;
    window.getPresetBrokersByCategory = getPresetBrokersByCategory;
    window.getDomesticBrokers = getDomesticBrokers;
    window.getOverseasBrokers = getOverseasBrokers;
    window.getAllPresetBrokers = getAllPresetBrokers;
    
    console.log('📋 PRESET_BROKERS loaded globally:', PRESET_BROKERS.length, 'brokers');
}

// モジュールシステム対応（将来用）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PRESET_BROKERS;
}