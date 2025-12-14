/**
 * @file entry-form-enhancement.js
 * @description 新規エントリーフォーム強化機能
 * @author AI Assistant / コンパナ
 * @version 1.0.5
 * @date 2025-12-14
 * 
 * 【責務】
 * - 通貨ペアオートコンプリート
 * - お気に入りからのワンクリック選択
 * - ブローカープルダウン連携
 * - ロット単位自動表示
 * - デフォルトロット自動入力
 * 
 * 【依存関係】
 * - PRESET_CURRENCY_PAIRS.js（必須）
 * - SettingsModule.js（必須）
 * - EventBus.js（推奨）
 * 
 * 【変更履歴】
 * - v1.0.1: SettingsModule初期化タイミング問題を修正
 * - v1.0.2: お気に入り検索ロジックを修正（ID形式と表示名形式の両方に対応）
 * - v1.0.3: selectAutocompleteItem関数でID形式・表示名形式の両方に対応
 * - v1.0.4: EventBus統合強化（brokerUpdated, favoritePairDeletedリスナー追加）
 * - v1.0.5: モバイル対応（PC用・モバイル用両方の要素を対象）
 */

// ================
// グローバル変数
// ================

let autocompleteTimeout = null;
let selectedAutocompleteIndex = -1;

// PC用とモバイル用の要素ID対応表
const ELEMENT_IDS = {
    // 通貨ペア入力
    pairInput: ['currencyPair', 'pair'],
    // オートコンプリートドロップダウン
    autocompleteDropdown: ['pairAutocomplete', 'pairAutocompleteDropdown'],
    // お気に入りボタン
    favoriteButton: ['showFavoritePairs', 'favoritePairSelectBtn'],
    // お気に入りドロップダウン
    favoriteDropdown: ['favoritePairsDropdown', 'favoritePairDropdown'],
    // お気に入りリスト
    favoriteList: ['favoritePairsList', 'favoritePairDropdownList'],
    // ブローカー選択
    brokerSelect: ['broker']
};

// ================
// ユーティリティ関数
// ================

/**
 * 複数のIDから最初に見つかった要素を取得
 * @param {string[]} ids - 要素IDの配列
 * @returns {HTMLElement|null}
 */
function getElementByIds(ids) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) return el;
    }
    return null;
}

/**
 * 複数のIDから全ての存在する要素を取得
 * @param {string[]} ids - 要素IDの配列
 * @returns {HTMLElement[]}
 */
function getElementsByIds(ids) {
    return ids.map(id => document.getElementById(id)).filter(el => el);
}

// ================
// 初期化
// ================

document.addEventListener('DOMContentLoaded', () => {
    console.log('entry-form-enhancement.js: Initializing...');
    
    // 通貨ペアオートコンプリートは先に初期化（PRESET_CURRENCY_PAIRSのみ使用）
    initPairAutocomplete();
    
    // SettingsModule依存の初期化は遅延実行
    // SettingsModuleの初期化完了を待つ
    if (window.eventBus) {
        window.eventBus.on('settings:initialized', () => {
            console.log('entry-form-enhancement: SettingsModule ready, initializing broker dropdown');
            initBrokerDropdown();
        });
    }
    
    // フォールバック: 1秒後に再試行
    setTimeout(() => {
        if (window.SettingsModule && typeof window.SettingsModule.getAllBrokers === 'function') {
            const brokers = window.SettingsModule.getAllBrokers();
            if (brokers && brokers.length > 0) {
                const brokerSelect = getElementByIds(ELEMENT_IDS.brokerSelect);
                // まだ初期化されていない場合のみ実行
                if (brokerSelect && brokerSelect.options.length <= 2) {
                    console.log('entry-form-enhancement: Fallback broker initialization');
                    initBrokerDropdown();
                }
            }
        }
    }, 1000);
    
    console.log('entry-form-enhancement.js: Initialization complete');
});

// ================
// 通貨ペアオートコンプリート
// ================

/**
 * 通貨ペアオートコンプリートの初期化
 */
function initPairAutocomplete() {
    // PC用とモバイル用の両方の入力欄を取得
    const pairInputs = getElementsByIds(ELEMENT_IDS.pairInput);
    
    if (pairInputs.length === 0) {
        console.warn('entry-form-enhancement: No pair input found');
        return;
    }
    
    // 各入力欄にイベントリスナーを設定
    pairInputs.forEach(pairInput => {
        // 入力イベント
        pairInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            
            // タイマークリア（debounce）
            if (autocompleteTimeout) {
                clearTimeout(autocompleteTimeout);
            }
            
            // 入力がない場合はドロップダウンを閉じる
            if (!value) {
                hideAutocompleteDropdown();
                return;
            }
            
            // 300ms後に検索実行
            autocompleteTimeout = setTimeout(() => {
                searchPairs(value, pairInput);
            }, 300);
        });
        
        // フォーカスアウト時にドロップダウンを閉じる
        pairInput.addEventListener('blur', (e) => {
            // ドロップダウンクリック時は閉じない
            setTimeout(() => {
                hideAutocompleteDropdown();
            }, 200);
        });
        
        // キーボード操作
        pairInput.addEventListener('keydown', (e) => {
            handleAutocompleteKeydown(e, pairInput);
        });
        
        console.log(`entry-form-enhancement: Pair autocomplete initialized for #${pairInput.id}`);
    });
}

/**
 * 通貨ペアを検索
 * @param {string} query - 検索クエリ
 * @param {HTMLElement} sourceInput - 入力元の要素
 */
function searchPairs(query, sourceInput) {
    // プリセット通貨ペアを取得
    const presetPairs = window.PRESET_CURRENCY_PAIRS || [];
    if (presetPairs.length === 0) {
        console.warn('entry-form-enhancement: PRESET_CURRENCY_PAIRS not found');
        return;
    }
    
    // 検索クエリを正規化
    const normalizedQuery = query.toLowerCase().replace('/', '');
    
    // 検索実行
    const results = presetPairs.filter(pair => {
        const matchId = pair.id.includes(normalizedQuery);
        const matchName = pair.name.toLowerCase().includes(normalizedQuery);
        const matchDisplayName = pair.displayName.toLowerCase().includes(normalizedQuery);
        return matchId || matchName || matchDisplayName;
    });
    
    // 検索結果を表示
    showAutocompleteDropdown(results, sourceInput);
}

/**
 * オートコンプリートドロップダウンを表示
 * @param {Array} results - 検索結果
 * @param {HTMLElement} sourceInput - 入力元の要素
 */
function showAutocompleteDropdown(results, sourceInput) {
    // 入力欄に対応するドロップダウンを取得
    const dropdown = findAssociatedDropdown(sourceInput, ELEMENT_IDS.autocompleteDropdown);
    if (!dropdown) {
        console.warn('entry-form-enhancement: Autocomplete dropdown not found for', sourceInput?.id);
        return;
    }
    
    // 結果がない場合
    if (results.length === 0) {
        dropdown.innerHTML = `
            <div class="autocomplete-no-results">
                該当する通貨ペアがありません
            </div>
        `;
        dropdown.style.display = 'block';
        return;
    }
    
    // 最大10件まで表示
    const displayResults = results.slice(0, 10);
    
    // HTML生成
    dropdown.innerHTML = displayResults.map((pair, index) => `
        <div class="autocomplete-item" 
             data-pair-id="${pair.id}" 
             data-index="${index}"
             onclick="selectAutocompleteItem('${pair.id}')">
            <div class="pair-info">
                <span class="pair-name">${pair.name}</span>
                <span class="pair-display-name">${pair.displayName}</span>
            </div>
            <span class="pair-pips">1pips=${pair.pipValue}</span>
        </div>
    `).join('');
    
    dropdown.style.display = 'block';
    selectedAutocompleteIndex = -1;
}

/**
 * 入力欄に関連するドロップダウンを取得
 * @param {HTMLElement} input - 入力要素
 * @param {string[]} dropdownIds - ドロップダウンIDの配列
 * @returns {HTMLElement|null}
 */
function findAssociatedDropdown(input, dropdownIds) {
    if (!input) return getElementByIds(dropdownIds);
    
    // 入力欄のIDに基づいてドロップダウンを選択
    const inputId = input.id;
    
    // PC用入力欄 → PC用ドロップダウン
    if (inputId === 'currencyPair') {
        return document.getElementById('pairAutocomplete') || getElementByIds(dropdownIds);
    }
    // モバイル用入力欄 → モバイル用ドロップダウン
    if (inputId === 'pair') {
        return document.getElementById('pairAutocompleteDropdown') || getElementByIds(dropdownIds);
    }
    
    return getElementByIds(dropdownIds);
}

/**
 * オートコンプリートドロップダウンを非表示
 */
function hideAutocompleteDropdown() {
    // 全てのオートコンプリートドロップダウンを非表示
    const dropdowns = getElementsByIds(ELEMENT_IDS.autocompleteDropdown);
    dropdowns.forEach(dropdown => {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    });
    selectedAutocompleteIndex = -1;
}

/**
 * オートコンプリート項目を選択
 * @param {string} pairIdOrName - 通貨ペアID または 表示名
 */
function selectAutocompleteItem(pairIdOrName) {
    const presetPairs = window.PRESET_CURRENCY_PAIRS || [];
    
    // ID形式または表示名形式でマッチを試みる
    const normalizedValue = pairIdOrName.toLowerCase().replace('/', '');
    const pair = presetPairs.find(p => 
        p.id === pairIdOrName ||                              // ID形式（usdjpy）
        p.id === normalizedValue ||                           // 正規化したID（usdjpy）
        p.name === pairIdOrName ||                            // 表示名形式（USD/JPY）
        p.name.toLowerCase() === pairIdOrName.toLowerCase()   // 大文字小文字無視
    );
    
    if (!pair) {
        console.warn('entry-form-enhancement: Pair not found for:', pairIdOrName);
        return;
    }
    
    // 全ての通貨ペア入力欄に値を設定（表示中のものに反映される）
    const pairInputs = getElementsByIds(ELEMENT_IDS.pairInput);
    pairInputs.forEach(input => {
        input.value = pair.name;
    });
    
    // 価格入力欄のstep属性を更新
    updatePriceInputSteps(pair.pipValue);
    console.log(`entry-form-enhancement: Price step updated to ${pair.pipValue}`);
    
    // ドロップダウンを閉じる
    hideAutocompleteDropdown();
    
    console.log(`entry-form-enhancement: Selected pair ${pair.name} (pipValue: ${pair.pipValue})`);
}

/**
 * キーボード操作処理
 * @param {KeyboardEvent} e - キーイベント
 * @param {HTMLElement} sourceInput - 入力元の要素
 */
function handleAutocompleteKeydown(e, sourceInput) {
    const dropdown = findAssociatedDropdown(sourceInput, ELEMENT_IDS.autocompleteDropdown);
    if (!dropdown || dropdown.style.display === 'none') return;
    
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;
    
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
            updateSelectedItem(items);
            break;
            
        case 'ArrowUp':
            e.preventDefault();
            selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, 0);
            updateSelectedItem(items);
            break;
            
        case 'Enter':
            e.preventDefault();
            if (selectedAutocompleteIndex >= 0 && items[selectedAutocompleteIndex]) {
                const pairId = items[selectedAutocompleteIndex].dataset.pairId;
                selectAutocompleteItem(pairId);
            }
            break;
            
        case 'Escape':
            hideAutocompleteDropdown();
            break;
    }
}

/**
 * 選択中の項目を更新
 * @param {NodeList} items - 項目リスト
 */
function updateSelectedItem(items) {
    items.forEach((item, index) => {
        if (index === selectedAutocompleteIndex) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

/**
 * 価格入力欄のstep属性を更新
 * @param {number} pipValue - pips値
 */
function updatePriceInputSteps(pipValue) {
    const stepValue = pipValue || 0.00001;
    
    // PC用・モバイル用両方の価格入力欄を更新
    const priceInputIds = [
        'entryPrice', 'stopLoss', 'takeProfit',  // モバイル用
        'entry-price', 'stop-loss', 'take-profit' // PC用（存在する場合）
    ];
    
    priceInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.step = stepValue;
    });
    
    console.log(`entry-form-enhancement: Price step updated to ${stepValue}`);
}

// ================
// お気に入りドロップダウン
// ================

/**
 * お気に入りドロップダウンを切り替え
 */
window.toggleFavoritePairDropdown = function() {
    // 全てのお気に入りドロップダウンを取得
    const dropdowns = getElementsByIds(ELEMENT_IDS.favoriteDropdown);
    
    if (dropdowns.length === 0) {
        console.warn('entry-form-enhancement: Favorite dropdown not found');
        return;
    }
    
    // 現在表示中のものがあるかチェック
    const visibleDropdown = dropdowns.find(d => d.style.display === 'block');
    
    if (visibleDropdown) {
        // 表示中なら閉じる
        dropdowns.forEach(d => d.style.display = 'none');
    } else {
        // 非表示なら開く（全てのドロップダウンに描画）
        renderFavoritePairDropdown();
        dropdowns.forEach(d => d.style.display = 'block');
    }
};

/**
 * お気に入りドロップダウンを描画
 */
function renderFavoritePairDropdown() {
    // 全てのリストコンテナを取得
    const listContainers = getElementsByIds(ELEMENT_IDS.favoriteList);
    
    if (listContainers.length === 0) {
        console.warn('entry-form-enhancement: Favorite list container not found');
        return;
    }
    
    // SettingsModuleからお気に入りを取得（複数の方法を試行）
    let favoritePairs = [];
    
    // 方法1: SettingsModule.getFavoritePairs()
    if (window.SettingsModule && typeof window.SettingsModule.getFavoritePairs === 'function') {
        favoritePairs = window.SettingsModule.getFavoritePairs() || [];
    }
    
    // 方法2: LocalStorageから直接取得（フォールバック）
    if (favoritePairs.length === 0) {
        try {
            const stored = localStorage.getItem('favoritePairs');
            if (stored) {
                favoritePairs = JSON.parse(stored);
                console.log('entry-form-enhancement: Loaded favorites from localStorage:', favoritePairs);
            }
        } catch (e) {
            console.warn('entry-form-enhancement: Failed to load favorites from localStorage');
        }
    }
    
    console.log('entry-form-enhancement: Favorite pairs:', favoritePairs);
    
    // HTMLを生成
    let html = '';
    
    // お気に入りがない場合
    if (favoritePairs.length === 0) {
        html = `
            <div class="favorite-dropdown-empty">
                お気に入りが登録されていません<br>
                <small>設定タブから追加できます</small>
            </div>
        `;
    } else {
        // プリセットから詳細情報を取得
        const presetPairs = window.PRESET_CURRENCY_PAIRS || [];
        
        // HTML生成（ID形式と表示名形式の両方に対応）
        html = favoritePairs.map(pairValue => {
            // ID形式または表示名形式でマッチを試みる
            const normalizedValue = pairValue.toLowerCase().replace('/', '');
            const preset = presetPairs.find(p => 
                p.id === pairValue ||                           // ID形式（usdjpy）
                p.id === normalizedValue ||                     // 正規化したID（usdjpy）
                p.name === pairValue ||                         // 表示名形式（USD/JPY）
                p.name.toLowerCase() === pairValue.toLowerCase() // 大文字小文字無視
            );
            
            if (!preset) {
                console.warn('entry-form-enhancement: Preset not found for:', pairValue);
                return '';
            }
            
            return `
                <div class="favorite-dropdown-item" onclick="selectFavoritePair('${preset.id}')">
                    <span class="pair-name">${preset.name}</span>
                    <span class="pair-display-name">${preset.displayName}</span>
                </div>
            `;
        }).join('');
    }
    
    // 全てのリストコンテナに同じ内容を設定
    listContainers.forEach(container => {
        container.innerHTML = html;
    });
}

/**
 * お気に入りから通貨ペアを選択
 * @param {string} pairId - 通貨ペアID
 */
window.selectFavoritePair = function(pairId) {
    // オートコンプリートと同じ処理
    selectAutocompleteItem(pairId);
    
    // 全てのお気に入りドロップダウンを閉じる
    const dropdowns = getElementsByIds(ELEMENT_IDS.favoriteDropdown);
    dropdowns.forEach(d => d.style.display = 'none');
};

// ================
// ブローカープルダウン
// ================

/**
 * ブローカープルダウンの初期化
 */
function initBrokerDropdown() {
    const brokerSelect = getElementByIds(ELEMENT_IDS.brokerSelect);
    if (!brokerSelect || brokerSelect.tagName !== 'SELECT') {
        console.warn('entry-form-enhancement: broker select not found');
        return;
    }
    
    // SettingsModuleからブローカー一覧を取得
    let brokers = [];
    if (window.SettingsModule && typeof window.SettingsModule.getAllBrokers === 'function') {
        brokers = window.SettingsModule.getAllBrokers() || [];
    }
    
    // オプション生成
    brokerSelect.innerHTML = '<option value="">ブローカーを選択</option>';
    
    if (brokers.length === 0) {
        brokerSelect.innerHTML += '<option value="" disabled>ブローカーが登録されていません</option>';
        return;
    }
    
    brokers.forEach(broker => {
        const option = document.createElement('option');
        option.value = broker.name || broker.shortName || '';
        option.textContent = broker.name || broker.shortName || 'Unknown';
        option.dataset.brokerId = broker.id;
        option.dataset.lotUnit = broker.lotUnit || 10000;
        option.dataset.defaultLot = broker.defaultLot || 1.0;
        brokerSelect.appendChild(option);
    });
    
    console.log(`entry-form-enhancement: Broker dropdown initialized with ${brokers.length} brokers`);
}

/**
 * ブローカー選択時の処理
 */
window.onBrokerSelected = function() {
    const brokerSelect = getElementByIds(ELEMENT_IDS.brokerSelect);
    if (!brokerSelect) return;
    
    const selectedOption = brokerSelect.options[brokerSelect.selectedIndex];
    if (!selectedOption || !selectedOption.value) {
        // 未選択の場合
        hideLotUnitDisplay();
        return;
    }
    
    // ロット単位を表示
    const lotUnit = selectedOption.dataset.lotUnit || 10000;
    showLotUnitDisplay(lotUnit);
    
    // デフォルトロットを設定
    const defaultLot = selectedOption.dataset.defaultLot || 1.0;
    setDefaultLot(defaultLot);
    
    console.log(`entry-form-enhancement: Broker selected - lotUnit: ${lotUnit}, defaultLot: ${defaultLot}`);
};

/**
 * ロット単位表示を表示
 * @param {number} lotUnit - ロット単位
 */
function showLotUnitDisplay(lotUnit) {
    const display = document.getElementById('lotUnitDisplay');
    const valueEl = document.getElementById('lotUnitValue');
    
    if (display && valueEl) {
        valueEl.textContent = lotUnit.toLocaleString();
        display.style.display = 'flex';
    }
}

/**
 * ロット単位表示を非表示
 */
function hideLotUnitDisplay() {
    const display = document.getElementById('lotUnitDisplay');
    if (display) {
        display.style.display = 'none';
    }
}

/**
 * デフォルトロットを設定
 * @param {number} defaultLot - デフォルトロット
 */
function setDefaultLot(defaultLot) {
    const lotInput = document.getElementById('lotSize');
    const hint = document.getElementById('defaultLotHint');
    
    if (lotInput) {
        lotInput.value = defaultLot;
    }
    
    if (hint) {
        hint.textContent = `(デフォルト: ${defaultLot})`;
        hint.style.display = 'inline';
    }
}

// ================
// EventBus連携
// ================

/**
 * EventBusリスナーの設定
 */
function setupEventBusListeners() {
    if (!window.eventBus) {
        console.warn('entry-form-enhancement: EventBus not found');
        return;
    }
    
    // ブローカー追加時にプルダウンを更新
    window.eventBus.on('settings:brokerAdded', () => {
        console.log('🔧 entry-form-enhancement: Broker added, updating dropdown');
        initBrokerDropdown();
    });
    
    // ブローカー編集時にプルダウンを更新
    window.eventBus.on('settings:brokerUpdated', () => {
        console.log('🔧 entry-form-enhancement: Broker updated, updating dropdown');
        initBrokerDropdown();
    });
    
    // ブローカー削除時にプルダウンを更新
    window.eventBus.on('settings:brokerDeleted', () => {
        console.log('🔧 entry-form-enhancement: Broker deleted, updating dropdown');
        initBrokerDropdown();
    });
    
    // お気に入り追加時（ドロップダウンは開くたびに再描画されるため、ログのみ）
    window.eventBus.on('settings:favoritePairAdded', (data) => {
        console.log('🔧 entry-form-enhancement: Favorite pair added', data?.pair || '');
    });
    
    // お気に入り削除時
    window.eventBus.on('settings:favoritePairDeleted', (data) => {
        console.log('🔧 entry-form-enhancement: Favorite pair deleted', data?.pair || '');
    });
    
    console.log('🔧 entry-form-enhancement: EventBus listeners registered');
}

// EventBusリスナーを設定
document.addEventListener('DOMContentLoaded', () => {
    setupEventBusListeners();
});

// ================
// デバッグ用
// ================

/**
 * デバッグ情報を取得
 */
window.getEntryFormEnhancementStatus = function() {
    const pairInputs = getElementsByIds(ELEMENT_IDS.pairInput);
    const brokerSelect = getElementByIds(ELEMENT_IDS.brokerSelect);
    
    return {
        pairInputIds: pairInputs.map(el => el.id),
        pairValues: pairInputs.map(el => el.value),
        brokerValue: brokerSelect?.value || '',
        presetPairsCount: (window.PRESET_CURRENCY_PAIRS || []).length,
        brokersCount: window.SettingsModule?.getAllBrokers?.()?.length || 0,
        favoritesCount: window.SettingsModule?.getFavoritePairs?.()?.length || 0
    };
};

console.log('entry-form-enhancement.js: Script loaded (v1.0.5 - Mobile support)');