/**
 * @file bulk-form-enhancement.js
 * @description 一括入力フォーム強化機能
 * @author AI Assistant / コンパナ
 * @version 1.0.1
 * @date 2025-11-28
 * 
 * 【責務】
 * - 一括入力の通貨ペアオートコンプリート
 * - お気に入りからのワンクリック選択
 * 
 * 【依存関係】
 * - PRESET_CURRENCY_PAIRS.js（必須）
 * - SettingsModule.js（推奨）
 * - EventBus.js（推奨）
 * 
 * 【変更履歴】
 * - v1.0.1 (2025-11-28): 初期化タイミング修正（タブ切り替え対応）
 * - v1.0.0 (2025-11-28): 初版
 */

// ================
// グローバル変数
// ================

let bulkAutocompleteTimeout = null;
let bulkSelectedAutocompleteIndex = -1;
let bulkCurrentInputElement = null;
let bulkEnhancementInitialized = false;

// ================
// 初期化
// ================

document.addEventListener('DOMContentLoaded', () => {
    console.log('bulk-form-enhancement.js: Initializing...');
    
    // 初期化を複数回試行
    setTimeout(() => tryInitBulkFormEnhancements(), 500);
    setTimeout(() => tryInitBulkFormEnhancements(), 1500);
    setTimeout(() => tryInitBulkFormEnhancements(), 3000);
    
    // タブ切り替え時に初期化（収支管理タブ）
    setupTabChangeListener();
    
    // 行追加を監視（MutationObserver）
    setupMutationObserver();
    
    // ドキュメントクリックでドロップダウンを閉じる
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.bulk-autocomplete-dropdown') && 
            !e.target.closest('.bulk-symbol') &&
            !e.target.closest('.bulk-favorite-btn')) {
            hideBulkAutocompleteDropdown();
            hideBulkFavoriteDropdown();
        }
    });
    
    console.log('bulk-form-enhancement.js: Initialization complete');
});

/**
 * タブ切り替えリスナーを設定
 */
function setupTabChangeListener() {
    // EventBusがあれば使用
    if (window.eventBus) {
        window.eventBus.on('tab:changed', (data) => {
            if (data && (data.tab === 'incomeExpense' || data.tab === 'revenue' || data.tabIndex === 4)) {
                setTimeout(() => tryInitBulkFormEnhancements(), 100);
            }
        });
    }
    
    // タブボタンのクリックを監視
    document.querySelectorAll('.tab-btn, [data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            // 収支管理タブの場合
            setTimeout(() => tryInitBulkFormEnhancements(), 300);
        });
    });
    
    // switchTab関数をラップ
    if (typeof window.switchTab === 'function') {
        const originalSwitchTab = window.switchTab;
        window.switchTab = function(tabIndex) {
            const result = originalSwitchTab.apply(this, arguments);
            // 収支管理タブ（index 4）の場合
            if (tabIndex === 4) {
                setTimeout(() => tryInitBulkFormEnhancements(), 300);
            }
            return result;
        };
    }
}

/**
 * MutationObserverを設定
 */
function setupMutationObserver() {
    const bulkInputBody = document.getElementById('bulkInputBody');
    if (bulkInputBody) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === 'TR') {
                            initBulkRowEnhancements(node);
                        }
                    });
                }
            });
        });
        
        observer.observe(bulkInputBody, { childList: true });
        console.log('bulk-form-enhancement: MutationObserver started');
    }
}

/**
 * 初期化を試行（既に初期化済みの行はスキップ）
 */
function tryInitBulkFormEnhancements() {
    const bulkInputBody = document.getElementById('bulkInputBody');
    if (!bulkInputBody) {
        return false;
    }
    
    const rows = bulkInputBody.querySelectorAll('tr');
    let initializedCount = 0;
    
    rows.forEach(row => {
        const symbolInput = row.querySelector('.bulk-symbol');
        if (symbolInput && symbolInput.dataset.enhanced !== 'true') {
            initBulkRowEnhancements(row);
            initializedCount++;
        }
    });
    
    if (initializedCount > 0) {
        console.log(`bulk-form-enhancement: Initialized ${initializedCount} rows`);
    }
    
    return initializedCount > 0;
}

/**
 * 一括入力フォーム強化の初期化（全行）
 */
function initBulkFormEnhancements() {
    return tryInitBulkFormEnhancements();
}

/**
 * 個別の行を初期化
 * @param {HTMLElement} row - テーブル行
 */
function initBulkRowEnhancements(row) {
    const symbolInput = row.querySelector('.bulk-symbol');
    if (!symbolInput) return;
    
    // 既に初期化済みかチェック
    if (symbolInput.dataset.enhanced === 'true') return;
    symbolInput.dataset.enhanced = 'true';
    
    // 親セルを取得
    const parentCell = symbolInput.parentElement;
    if (!parentCell) return;
    
    // セルをposition: relativeに
    parentCell.style.position = 'relative';
    
    // お気に入りボタンを追加
    addFavoriteButton(parentCell, symbolInput);
    
    // 入力欄のスタイル調整（お気に入りボタン分）
    symbolInput.style.width = 'calc(100% - 30px)';
    symbolInput.style.display = 'inline-block';
    
    // オートコンプリートイベント
    symbolInput.addEventListener('input', (e) => {
        bulkCurrentInputElement = e.target;
        const value = e.target.value.trim();
        
        if (bulkAutocompleteTimeout) {
            clearTimeout(bulkAutocompleteTimeout);
        }
        
        if (!value) {
            hideBulkAutocompleteDropdown();
            return;
        }
        
        bulkAutocompleteTimeout = setTimeout(() => {
            searchBulkPairs(value, e.target);
        }, 300);
    });
    
    // フォーカスアウト時
    symbolInput.addEventListener('blur', () => {
        setTimeout(() => {
            hideBulkAutocompleteDropdown();
        }, 200);
    });
    
    // キーボード操作
    symbolInput.addEventListener('keydown', (e) => {
        handleBulkAutocompleteKeydown(e);
    });
}

/**
 * お気に入りボタンを追加
 * @param {HTMLElement} parentCell - 親セル
 * @param {HTMLElement} symbolInput - 通貨ペア入力欄
 */
function addFavoriteButton(parentCell, symbolInput) {
    // 既にボタンがあれば追加しない
    if (parentCell.querySelector('.bulk-favorite-btn')) return;
    
    // ボタン作成
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'bulk-favorite-btn';
    favBtn.innerHTML = '⭐';
    favBtn.title = 'お気に入りから選択';
    favBtn.style.cssText = `
        width: 26px;
        height: 26px;
        padding: 0;
        margin-left: 4px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        background: #2d2d2d;
        color: #ffd700;
        cursor: pointer;
        font-size: 14px;
        vertical-align: middle;
    `;
    
    // クリックイベント
    favBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        bulkCurrentInputElement = symbolInput;
        toggleBulkFavoriteDropdown(parentCell);
    });
    
    // ボタンを追加
    parentCell.appendChild(favBtn);
}

// ================
// オートコンプリート機能
// ================

/**
 * 通貨ペアを検索
 * @param {string} query - 検索クエリ
 * @param {HTMLElement} inputElement - 入力要素
 */
function searchBulkPairs(query, inputElement) {
    const presetPairs = window.PRESET_CURRENCY_PAIRS || [];
    if (presetPairs.length === 0) {
        console.warn('bulk-form-enhancement: PRESET_CURRENCY_PAIRS not found');
        return;
    }
    
    const normalizedQuery = query.toLowerCase().replace('/', '');
    
    const results = presetPairs.filter(pair => {
        const matchId = pair.id.includes(normalizedQuery);
        const matchName = pair.name.toLowerCase().includes(normalizedQuery);
        const matchDisplayName = pair.displayName.toLowerCase().includes(normalizedQuery);
        return matchId || matchName || matchDisplayName;
    }).slice(0, 10); // 最大10件
    
    showBulkAutocompleteDropdown(results, inputElement);
}

/**
 * オートコンプリートドロップダウンを表示
 * @param {Array} results - 検索結果
 * @param {HTMLElement} inputElement - 入力要素
 */
function showBulkAutocompleteDropdown(results, inputElement) {
    // 既存のドロップダウンを削除
    hideBulkAutocompleteDropdown();
    
    if (results.length === 0) return;
    
    const parentCell = inputElement.parentElement;
    
    // ドロップダウン作成
    const dropdown = document.createElement('div');
    dropdown.className = 'bulk-autocomplete-dropdown';
    dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 200px;
        overflow-y: auto;
        background: #1e1e1e;
        border: 1px solid #444;
        border-radius: 4px;
        z-index: 1000;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;
    
    // 項目生成
    results.forEach((pair, index) => {
        const item = document.createElement('div');
        item.className = 'bulk-autocomplete-item';
        item.dataset.pairId = pair.id;
        item.dataset.pairName = pair.name;
        item.innerHTML = `
            <span style="font-weight: bold;">${pair.name}</span>
            <span style="color: #888; margin-left: 8px; font-size: 0.9em;">${pair.displayName}</span>
        `;
        item.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        
        item.addEventListener('mouseenter', () => {
            item.style.background = '#333';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });
        item.addEventListener('click', () => {
            selectBulkAutocompleteItem(pair.name, inputElement);
        });
        
        dropdown.appendChild(item);
    });
    
    parentCell.appendChild(dropdown);
    bulkSelectedAutocompleteIndex = -1;
}

/**
 * オートコンプリートドロップダウンを非表示
 */
function hideBulkAutocompleteDropdown() {
    const dropdowns = document.querySelectorAll('.bulk-autocomplete-dropdown');
    dropdowns.forEach(d => d.remove());
    bulkSelectedAutocompleteIndex = -1;
}

/**
 * オートコンプリート項目を選択
 * @param {string} pairName - 通貨ペア名
 * @param {HTMLElement} inputElement - 入力要素
 */
function selectBulkAutocompleteItem(pairName, inputElement) {
    if (inputElement) {
        inputElement.value = pairName;
    } else if (bulkCurrentInputElement) {
        bulkCurrentInputElement.value = pairName;
    }
    hideBulkAutocompleteDropdown();
}

/**
 * キーボード操作ハンドラ
 * @param {KeyboardEvent} e - キーイベント
 */
function handleBulkAutocompleteKeydown(e) {
    const dropdown = document.querySelector('.bulk-autocomplete-dropdown');
    if (!dropdown) return;
    
    const items = dropdown.querySelectorAll('.bulk-autocomplete-item');
    if (items.length === 0) return;
    
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            bulkSelectedAutocompleteIndex = Math.min(bulkSelectedAutocompleteIndex + 1, items.length - 1);
            updateBulkSelectedItem(items);
            break;
            
        case 'ArrowUp':
            e.preventDefault();
            bulkSelectedAutocompleteIndex = Math.max(bulkSelectedAutocompleteIndex - 1, 0);
            updateBulkSelectedItem(items);
            break;
            
        case 'Enter':
            e.preventDefault();
            if (bulkSelectedAutocompleteIndex >= 0 && items[bulkSelectedAutocompleteIndex]) {
                const pairName = items[bulkSelectedAutocompleteIndex].dataset.pairName;
                selectBulkAutocompleteItem(pairName, e.target);
            }
            break;
            
        case 'Escape':
            hideBulkAutocompleteDropdown();
            break;
    }
}

/**
 * 選択中の項目を更新
 * @param {NodeList} items - 項目リスト
 */
function updateBulkSelectedItem(items) {
    items.forEach((item, index) => {
        if (index === bulkSelectedAutocompleteIndex) {
            item.style.background = '#333';
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.style.background = 'transparent';
        }
    });
}

// ================
// お気に入りドロップダウン
// ================

/**
 * お気に入りドロップダウンを切り替え
 * @param {HTMLElement} parentCell - 親セル
 */
function toggleBulkFavoriteDropdown(parentCell) {
    const existingDropdown = parentCell.querySelector('.bulk-favorite-dropdown');
    
    if (existingDropdown) {
        existingDropdown.remove();
        return;
    }
    
    // 他のドロップダウンを閉じる
    hideBulkFavoriteDropdown();
    hideBulkAutocompleteDropdown();
    
    // お気に入り一覧を取得
    let favoritePairs = [];
    
    if (window.SettingsModule && typeof window.SettingsModule.getFavoritePairs === 'function') {
        favoritePairs = window.SettingsModule.getFavoritePairs() || [];
    }
    
    if (favoritePairs.length === 0) {
        try {
            const stored = localStorage.getItem('favoritePairs');
            if (stored) {
                favoritePairs = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('bulk-form-enhancement: Failed to load favorites');
        }
    }
    
    // ドロップダウン作成
    const dropdown = document.createElement('div');
    dropdown.className = 'bulk-favorite-dropdown';
    dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 200px;
        overflow-y: auto;
        background: #1e1e1e;
        border: 1px solid #444;
        border-radius: 4px;
        z-index: 1000;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;
    
    if (favoritePairs.length === 0) {
        dropdown.innerHTML = `
            <div style="padding: 12px; color: #888; text-align: center;">
                お気に入りがありません<br>
                <small>設定タブから追加できます</small>
            </div>
        `;
    } else {
        const presetPairs = window.PRESET_CURRENCY_PAIRS || [];
        
        favoritePairs.forEach(pairValue => {
            const normalizedValue = pairValue.toLowerCase().replace('/', '');
            const preset = presetPairs.find(p => 
                p.id === pairValue ||
                p.id === normalizedValue ||
                p.name === pairValue ||
                p.name.toLowerCase() === pairValue.toLowerCase()
            );
            
            if (!preset) return;
            
            const item = document.createElement('div');
            item.className = 'bulk-favorite-item';
            item.innerHTML = `
                <span style="font-weight: bold;">${preset.name}</span>
                <span style="color: #888; margin-left: 8px; font-size: 0.9em;">${preset.displayName}</span>
            `;
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #333;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            
            item.addEventListener('mouseenter', () => {
                item.style.background = '#333';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
            });
            item.addEventListener('click', () => {
                if (bulkCurrentInputElement) {
                    bulkCurrentInputElement.value = preset.name;
                }
                dropdown.remove();
            });
            
            dropdown.appendChild(item);
        });
    }
    
    parentCell.appendChild(dropdown);
}

/**
 * お気に入りドロップダウンを非表示
 */
function hideBulkFavoriteDropdown() {
    const dropdowns = document.querySelectorAll('.bulk-favorite-dropdown');
    dropdowns.forEach(d => d.remove());
}

// ================
// グローバル公開
// ================

window.initBulkFormEnhancements = initBulkFormEnhancements;
window.initBulkRowEnhancements = initBulkRowEnhancements;
window.tryInitBulkFormEnhancements = tryInitBulkFormEnhancements;

console.log('bulk-form-enhancement.js loaded');