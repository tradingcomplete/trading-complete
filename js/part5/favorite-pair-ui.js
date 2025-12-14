/**
 * @file favorite-pair-ui.js
 * @description お気に入り通貨ペア管理のUI制御（Phase 3.5 検索機能対応版）
 * @author AI Assistant / コンパナ
 * @version 2.1.0
 * @date 2025-11-22
 * 
 * 【責務】
 * - お気に入り通貨ペア一覧の表示
 * - 通貨ペアの追加・削除（プリセット選択 + 検索機能）
 * - リアルタイム検索・カテゴリフィルター
 * - SettingsModuleとの連携
 * - EventBus統合
 * 
 * 【依存関係】
 * - SettingsModule.js（必須）
 * - PRESET_CURRENCY_PAIRS.js（必須）
 * - EventBus.js（必須）
 * 
 * 【Phase 3.5 Step 2-3 変更点】
 * - リアルタイム検索機能の追加
 * - カテゴリフィルター機能の追加
 * - 検索 + カテゴリの組み合わせ対応
 * - UI/UXの改善
 */

// ================
// グローバル変数（Phase 3.5）
// ================

let currentCategory = 'all';  // 現在選択中のカテゴリ
let currentSearchQuery = '';  // 現在の検索クエリ

// ================
// 初期化
// ================

/**
 * ページロード時の初期化
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('favorite-pair-ui.js: Initializing...');
    
    // お気に入り一覧を描画
    renderFavoritePairList();
    
    // EventBusリスナー設定
    setupEventListeners();
    
    console.log('favorite-pair-ui.js: Initialization complete');
});

// ================
// EventBusリスナー
// ================

function setupEventListeners() {
    if (!window.eventBus) {
        console.warn('favorite-pair-ui: EventBus not found');
        return;
    }
    
    // お気に入り追加時
    window.eventBus.on('settings:favoritePairAdded', (data) => {
        console.log('favorite-pair-ui: Favorite pair added', data);
        renderFavoritePairList();
    });
    
    // お気に入り削除時
    window.eventBus.on('settings:favoritePairDeleted', (data) => {
        console.log('favorite-pair-ui: Favorite pair deleted', data);
        renderFavoritePairList();
    });
}

// ================
// お気に入り一覧表示
// ================

/**
 * お気に入り通貨ペア一覧を描画
 */
function renderFavoritePairList() {
    const container = document.getElementById('favorite-pairs-list');
    if (!container) {
        console.warn('favorite-pair-ui: favorite-pairs-list container not found');
        return;
    }
    
    if (!window.SettingsModule) {
        container.innerHTML = '<p style="color: #f44;">❌ SettingsModuleが読み込まれていません</p>';
        return;
    }
    
    const pairs = window.SettingsModule.getAllFavoritePairs();
    
    if (pairs.length === 0) {
        container.innerHTML = `
            <div style="padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; text-align: center;">
                <p style="color: #aaa; margin: 0; font-size: 0.95em;">まだお気に入りが登録されていません</p>
            </div>
        `;
        return;
    }
    
    // タグ形式で表示
    const tags = pairs.map(pair => createFavoritePairTag(pair)).join('');
    const count = pairs.length;
    const maxCount = 10;  // SettingsModule.CONSTANTS.MAX_FAVORITE_PAIRS
    
    container.innerHTML = `
        <div style="margin-bottom: 10px;">
            <span style="color: #aaa; font-size: 0.9em;">登録数: ${count} / ${maxCount}</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 10px;">
            ${tags}
        </div>
    `;
}

/**
 * お気に入り通貨ペアのタグHTMLを生成
 * @param {string} pair - 通貨ペア（例: "USD/JPY"）
 * @returns {string} HTML文字列
 */
function createFavoritePairTag(pair) {
    return `
        <div class="favorite-pair-tag">
            <span class="favorite-pair-name">${escapeHtml(pair)}</span>
            <button class="favorite-pair-delete" onclick="deleteFavoritePair('${pair}')" title="削除">
                ✕
            </button>
        </div>
    `;
}

/**
 * HTMLエスケープ
 * @param {string} text - エスケープするテキスト
 * @returns {string} エスケープ済みテキスト
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================
// プリセット選択モーダル（Phase 3.5 検索機能）
// ================

/**
 * お気に入り通貨ペア追加モーダルを開く（Phase 3.5）
 */
function openAddFavoritePairModal() {
    const modal = document.getElementById('add-favorite-pair-modal');
    if (!modal) {
        console.error('favorite-pair-ui: add-favorite-pair-modal not found');
        return;
    }
    
    // 検索状態をリセット
    currentCategory = 'all';
    currentSearchQuery = '';
    
    // 検索バーをクリア
    const searchInput = document.getElementById('preset-pair-search-input');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // カテゴリタブをリセット
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const allTab = document.querySelector('.category-tab[data-category="all"]');
    if (allTab) {
        allTab.classList.add('active');
    }
    
    // モーダルを表示
    modal.style.display = 'flex';
    
    // すべての通貨ペアを描画
    renderFilteredPairs();
}

/**
 * お気に入り通貨ペア追加モーダルを閉じる
 */
function closeAddFavoritePairModal() {
    const modal = document.getElementById('add-favorite-pair-modal');
    if (!modal) {
        console.error('favorite-pair-ui: add-favorite-pair-modal not found');
        return;
    }
    
    modal.style.display = 'none';
}

/**
 * 検索バー入力時の処理（リアルタイム検索）
 */
function searchPresetPairs() {
    const searchInput = document.getElementById('preset-pair-search-input');
    if (!searchInput) return;
    
    currentSearchQuery = searchInput.value.trim();
    renderFilteredPairs();
}

/**
 * カテゴリタブクリック時の処理
 * @param {string} category - カテゴリ名（all/major/cross/commodity/crypto）
 */
function filterByCategory(category) {
    currentCategory = category;
    
    // タブのアクティブ状態を更新
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const activeTab = document.querySelector(`.category-tab[data-category="${category}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // 検索結果を再描画
    renderFilteredPairs();
}

/**
 * フィルター済み通貨ペアを描画
 */
function renderFilteredPairs() {
    const container = document.getElementById('preset-pair-results');
    if (!container) {
        console.error('favorite-pair-ui: preset-pair-results not found');
        return;
    }
    
    if (!window.PRESET_CURRENCY_PAIRS) {
        container.innerHTML = '<p style="color: #f44;">❌ プリセットデータが読み込まれていません</p>';
        return;
    }
    
    // カテゴリでフィルター
    let pairs = currentCategory === 'all' 
        ? window.PRESET_CURRENCY_PAIRS 
        : window.PRESET_CURRENCY_PAIRS.filter(pair => pair.category === currentCategory);
    
    // 検索クエリでフィルター
    if (currentSearchQuery) {
        const query = currentSearchQuery.toLowerCase();
        pairs = pairs.filter(pair => 
            pair.name.toLowerCase().includes(query) ||
            pair.displayName.toLowerCase().includes(query) ||
            pair.id.toLowerCase().includes(query)
        );
    }
    
    // 結果が0件の場合
    if (pairs.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">🔍</div>
                <div class="no-results-text">該当する通貨ペアが見つかりません</div>
                <div class="no-results-hint">検索条件を変更してみてください</div>
            </div>
        `;
        return;
    }
    
    // 通貨ペア一覧を描画
    const html = pairs.map(pair => createPresetPairItem(pair)).join('');
    container.innerHTML = html;
}

/**
 * プリセット通貨ペアアイテムのHTMLを生成
 * @param {Object} pair - 通貨ペアオブジェクト
 * @returns {string} HTML文字列
 */
function createPresetPairItem(pair) {
    return `
        <button class="preset-pair-item" onclick="selectPresetPair('${pair.id}')">
            <div class="pair-info">
                <span class="pair-name">${escapeHtml(pair.name)}</span>
                <span class="pair-display">${escapeHtml(pair.displayName)}</span>
            </div>
            <span class="pair-pip">1pips = ${pair.pipValue}</span>
        </button>
    `;
}

/**
 * プリセット通貨ペアを選択（お気に入りに追加）
 * @param {string} pairId - 通貨ペアID
 */
function selectPresetPair(pairId) {
    if (!window.PRESET_CURRENCY_PAIRS) {
        alert('❌ プリセートデータが読み込まれていません');
        return;
    }
    
    // プリセットから通貨ペア情報を取得
    const preset = window.PRESET_CURRENCY_PAIRS.find(p => p.id === pairId);
    if (!preset) {
        alert('❌ 通貨ペアが見つかりません');
        return;
    }
    
    if (!window.SettingsModule) {
        alert('❌ SettingsModuleが読み込まれていません');
        return;
    }
    
    // お気に入りに追加（プリセット情報を渡す）
    const result = window.SettingsModule.addFavoritePair({
        presetId: preset.id,
        name: preset.name,
        displayName: preset.displayName,
        pipValue: preset.pipValue
    });
    
    if (result.success) {
        // トースト通知（存在する場合）
        if (window.showToast) {
            window.showToast(`✅ ${preset.name}を追加しました`, 'success');
        }
        
        // モーダルを閉じる
        closeAddFavoritePairModal();
        
        // お気に入り一覧を更新
        renderFavoritePairList();
    } else {
        alert('❌ エラー: ' + result.error);
    }
}

// ================
// お気に入り削除
// ================

/**
 * お気に入り通貨ペアを削除
 * @param {string} pair - 削除する通貨ペア
 */
function deleteFavoritePair(pair) {
    const confirmed = confirm(`「${pair}」をお気に入りから削除しますか?`);
    
    if (!confirmed) return;
    
    if (!window.SettingsModule) {
        alert('❌ SettingsModuleが読み込まれていません');
        return;
    }
    
    const result = window.SettingsModule.deleteFavoritePair(pair);
    
    if (result.success) {
        // トースト通知（存在する場合）
        if (window.showToast) {
            window.showToast(`✅ ${pair}を削除しました`, 'success');
        }
        
        renderFavoritePairList();
    } else {
        alert('❌ エラー: ' + result.error);
    }
}

// ================
// フリー入力（非推奨 - 将来廃止予定）
// ================

/**
 * 入力フォームからお気に入り通貨ペアを追加
 * @deprecated Phase 4で廃止予定。プリセット選択（openAddFavoritePairModal）を使用してください。
 */
function addFavoritePairFromInput() {
    console.warn('addFavoritePairFromInput: この機能は将来廃止される予定です。プリセット選択を使用してください。');
    
    const input = document.getElementById('favorite-pair-input');
    if (!input) {
        console.error('favorite-pair-ui: favorite-pair-input not found');
        return;
    }
    
    const pair = input.value.trim().toUpperCase();
    
    // バリデーション
    if (!pair) {
        alert('❌ 通貨ペアを入力してください');
        return;
    }
    
    // 通貨ペアの簡易チェック（スラッシュまたは英数字のみ）
    if (!/^[A-Z0-9\/]+$/.test(pair)) {
        alert('❌ 通貨ペアは英字・数字・スラッシュのみで入力してください\n例: USD/JPY, GOLD, BTC/USD');
        return;
    }
    
    if (!window.SettingsModule) {
        alert('❌ SettingsModuleが読み込まれていません');
        return;
    }
    
    // 追加
    const result = window.SettingsModule.addFavoritePair(pair);
    
    if (result.success) {
        // 成功時は入力をクリア
        input.value = '';
        
        // トースト通知（存在する場合）
        if (window.showToast) {
            window.showToast(`✅ ${pair}を追加しました`, 'success');
        } else {
            alert(`✅ ${pair}を追加しました`);
        }
        
        renderFavoritePairList();
    } else {
        alert('❌ エラー: ' + result.error);
    }
}

// ================
// デバッグ用
// ================

/**
 * デバッグ情報を出力
 */
function debugFavoritePairUI() {
    console.log('=== Favorite Pair UI Debug ===');
    console.log('SettingsModule:', window.SettingsModule);
    console.log('EventBus:', window.eventBus);
    console.log('PRESET_CURRENCY_PAIRS:', window.PRESET_CURRENCY_PAIRS);
    console.log('Favorite Pairs:', window.SettingsModule?.getAllFavoritePairs());
    console.log('Current Category:', currentCategory);
    console.log('Current Search Query:', currentSearchQuery);
}

// ================
// グローバル関数として登録（Phase 3.5）
// ================

if (typeof window !== 'undefined') {
    window.searchPresetPairs = searchPresetPairs;
    window.filterByCategory = filterByCategory;
    window.selectPresetPair = selectPresetPair;
}

console.log('✅ favorite-pair-ui.js loaded (Phase 3.5 - Search & Filter Support)');