/**
 * @file broker-ui.js
 * @description ブローカー管理のUI制御
 * @author AI Assistant / コンパナ
 * @version 1.0.4
 * @date 2025-11-20
 * 
 * 【責務】
 * - ブローカー一覧の表示
 * - ブローカー追加モーダルの制御
 * - ブローカー編集モーダルの制御
 * - SettingsModuleとの連携
 * - EventBus統合
 * 
 * 【依存関係】
 * - SettingsModule.js（必須）
 * - EventBus.js（必須）
 */

// ================
// グローバル変数
// ================

let currentEditingBrokerId = null;  // 編集中のブローカーID

// ================
// 初期化
// ================

/**
 * ページロード時の初期化
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('broker-ui.js: Initializing...');
    
    // ブローカー一覧を描画
    renderBrokerList();
    
    // EventBusリスナー設定
    setupEventListeners();
    
    console.log('broker-ui.js: Initialization complete');
});

// ================
// EventBusリスナー
// ================

function setupEventListeners() {
    if (!window.eventBus) {
        console.warn('broker-ui: EventBus not found');
        return;
    }
    
    // ブローカー追加時
    window.eventBus.on('settings:brokerAdded', (broker) => {
        console.log('broker-ui: Broker added', broker);
        renderBrokerList();
    });
    
    // ブローカー編集時
    window.eventBus.on('settings:brokerEdited', (data) => {
        console.log('broker-ui: Broker edited', data);
        renderBrokerList();
    });
    
    // ブローカー削除時
    window.eventBus.on('settings:brokerDeleted', (broker) => {
        console.log('broker-ui: Broker deleted', broker);
        renderBrokerList();
    });
}

// ================
// ブローカー一覧表示
// ================

/**
 * ブローカー一覧を描画
 */
function renderBrokerList() {
    const container = document.getElementById('broker-list');
    if (!container) {
        console.warn('broker-ui: broker-list container not found');
        return;
    }
    
    if (!window.SettingsModule) {
        container.innerHTML = '<p style="color: #f44;">❌ SettingsModuleが読み込まれていません</p>';
        return;
    }
    
    const brokers = window.SettingsModule.getAllBrokers();
    
    if (brokers.length === 0) {
        container.innerHTML = `
            <div style="padding: 20px; background: rgba(255,255,255,0.05); border-radius: 8px; text-align: center;">
                <p style="color: #aaa; margin: 0;">まだブローカーが登録されていません</p>
                <p style="color: #888; font-size: 0.9em; margin: 10px 0 0 0;">「ブローカーを追加」ボタンから登録してください</p>
            </div>
        `;
        return;
    }
    
    // ブローカーカードを生成
    const cards = brokers.map(broker => createBrokerCard(broker)).join('');
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
            ${cards}
        </div>
    `;
}

/**
 * ブローカーカードのHTMLを生成
 * @param {Object} broker - ブローカーデータ
 * @returns {string} HTML文字列
 */
function createBrokerCard(broker) {
    const categoryBadge = broker.isCustom 
        ? '<span class="broker-badge broker-badge-custom">カスタム</span>'
        : '<span class="broker-badge broker-badge-preset">プリセット</span>';
    
    const lotUnitText = formatLotUnit(broker.lotUnit);
    
    return `
        <div class="broker-card">
            <div class="broker-card-header">
                <div>
                    <span class="broker-shortname">${escapeHtml(broker.shortName)}</span>
                    <h4 class="broker-name">${escapeHtml(broker.name)}</h4>
                </div>
                ${categoryBadge}
            </div>
            <div class="broker-card-body">
                <div class="broker-info">
                    <span class="broker-info-label">1ロット単位:</span>
                    <span class="broker-info-value">${lotUnitText}</span>
                </div>
                <div class="broker-info">
                    <span class="broker-info-label">デフォルトロット:</span>
                    <span class="broker-info-value">${broker.defaultLot}</span>
                </div>
            </div>
            <div class="broker-card-footer">
                <button class="btn-icon" onclick="openEditBrokerModal(${broker.id})" title="編集">
                    ✏️
                </button>
                <button class="btn-icon" onclick="confirmDeleteBroker(${broker.id})" title="削除">
                    🗑️
                </button>
            </div>
        </div>
    `;
}

/**
 * ロット単位をフォーマット
 * @param {number} lotUnit - ロット単位
 * @returns {string} フォーマット済み文字列
 */
function formatLotUnit(lotUnit) {
    if (lotUnit >= 10000) {
        return `${(lotUnit / 10000).toFixed(0)}万通貨`;
    } else if (lotUnit >= 1000) {
        return `${(lotUnit / 1000).toFixed(0)}千通貨`;
    }
    return `${lotUnit}通貨`;
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
// ブローカー追加モーダル
// ================

/**
 * ブローカー追加モーダルを開く
 */
function openAddBrokerModal() {
    const modal = document.getElementById('add-broker-modal');
    if (!modal) {
        console.error('broker-ui: add-broker-modal not found');
        return;
    }
    
    // モーダルを表示
    modal.style.display = 'flex';
    
    // プリセットタブを表示
    switchAddBrokerTab('preset');
    
    // プリセット一覧を描画
    renderPresetBrokers();
}

/**
 * ブローカー追加モーダルを閉じる
 */
function closeAddBrokerModal() {
    const modal = document.getElementById('add-broker-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // フォームをリセット
    resetAddBrokerForm();
}

/**
 * 追加モーダルのタブを切り替え
 * @param {string} tab - 'preset' または 'custom'
 */
function switchAddBrokerTab(tab) {
    // タブボタンのアクティブ状態を切り替え
    const presetBtn = document.getElementById('preset-tab-btn');
    const customBtn = document.getElementById('custom-tab-btn');
    
    if (presetBtn && customBtn) {
        if (tab === 'preset') {
            presetBtn.classList.add('active');
            customBtn.classList.remove('active');
        } else {
            presetBtn.classList.remove('active');
            customBtn.classList.add('active');
        }
    }
    
    // タブコンテンツの表示を切り替え
    const presetContent = document.getElementById('preset-tab-content');
    const customContent = document.getElementById('custom-tab-content');
    
    if (presetContent && customContent) {
        if (tab === 'preset') {
            presetContent.style.display = 'block';
            customContent.style.display = 'none';
        } else {
            presetContent.style.display = 'none';
            customContent.style.display = 'block';
        }
    }
}

/**
 * プリセットブローカー一覧を描画
 */
function renderPresetBrokers() {
    const container = document.getElementById('preset-broker-list');
    if (!container) return;
    
    const presets = window.SettingsModule.getPresetBrokers();
    
    // 国内・海外で分類
    const domestic = presets.filter(b => b.category === 'domestic');
    const overseas = presets.filter(b => b.category === 'overseas');
    
    let html = '';
    
    // 国内ブローカー
    if (domestic.length > 0) {
        html += '<h4 style="margin: 0 0 10px 0;" class="broker-section-title">🇯🇵 国内ブローカー</h4>';
        html += '<div class="preset-broker-grid">';
        domestic.forEach(broker => {
            html += createPresetBrokerButton(broker);
        });
        html += '</div>';
    }
    
    // 海外ブローカー
    if (overseas.length > 0) {
        html += '<h4 style="margin: 20px 0 10px 0;" class="broker-section-title">🌏 海外ブローカー</h4>';
        html += '<div class="preset-broker-grid">';
        overseas.forEach(broker => {
            html += createPresetBrokerButton(broker);
        });
        html += '</div>';
    }
    
    container.innerHTML = html;
}

/**
 * プリセットブローカーボタンのHTMLを生成
 * @param {Object} broker - プリセットブローカーデータ
 * @returns {string} HTML文字列
 */
function createPresetBrokerButton(broker) {
    const lotUnitText = formatLotUnit(broker.lotUnit);
    return `
        <button class="preset-broker-btn" onclick="selectPresetBroker('${broker.id}')">
            <div class="preset-broker-name">${escapeHtml(broker.name)}</div>
            <div class="preset-broker-info">${lotUnitText}</div>
        </button>
    `;
}

/**
 * プリセットブローカーを選択
 * @param {string} presetId - プリセットID
 */
function selectPresetBroker(presetId) {
    // プリセットデータを取得
    const presets = window.SettingsModule.getPresetBrokers();
    const preset = presets.find(p => p.id === presetId);
    
    if (!preset) {
        alert('❌ エラー: プリセットが見つかりません');
        return;
    }
    
    // デフォルトロットを入力
    const defaultLot = parseFloat(document.getElementById('preset-default-lot')?.value) || 1.0;
    
    // 完全なデータを作成してブローカーを追加
    const result = window.SettingsModule.addBroker({
        presetId: preset.id,
        name: preset.name,
        shortName: preset.shortName,
        lotUnit: preset.lotUnit,
        defaultLot: defaultLot,
        isCustom: false
    });
    
    if (result.success) {
        alert('✅ ブローカーを追加しました');
        closeAddBrokerModal();
        renderBrokerList();  // 一覧を更新
    } else {
        alert('❌ エラー: ' + result.error);
    }
}

/**
 * カスタムブローカーを追加
 */
function addCustomBroker() {
    const name = document.getElementById('custom-broker-name')?.value.trim();
    const shortName = document.getElementById('custom-broker-shortname')?.value.trim();
    const lotUnit = parseInt(document.getElementById('custom-broker-lotunit')?.value);
    const defaultLot = parseFloat(document.getElementById('custom-default-lot')?.value) || 1.0;
    
    // バリデーション
    if (!name) {
        alert('❌ ブローカー名を入力してください');
        return;
    }
    
    if (!shortName) {
        alert('❌ 略称を入力してください');
        return;
    }
    
    if (!lotUnit || lotUnit <= 0) {
        alert('❌ 有効なロット単位を入力してください');
        return;
    }
    
    // ブローカーを追加
    const result = window.SettingsModule.addBroker({
        name: name,
        shortName: shortName,
        lotUnit: lotUnit,
        defaultLot: defaultLot,
        isCustom: true
    });
    
    if (result.success) {
        alert('✅ カスタムブローカーを追加しました');
        closeAddBrokerModal();
        renderBrokerList();  // 一覧を更新
    } else {
        alert('❌ エラー: ' + result.error);
    }
}

/**
 * 追加フォームをリセット
 */
function resetAddBrokerForm() {
    // プリセットタブ
    const presetDefaultLot = document.getElementById('preset-default-lot');
    if (presetDefaultLot) presetDefaultLot.value = '1.0';
    
    // カスタムタブ
    const customName = document.getElementById('custom-broker-name');
    const customShortName = document.getElementById('custom-broker-shortname');
    const customLotUnit = document.getElementById('custom-broker-lotunit');
    const customDefaultLot = document.getElementById('custom-default-lot');
    
    if (customName) customName.value = '';
    if (customShortName) customShortName.value = '';
    if (customLotUnit) customLotUnit.value = '100000';
    if (customDefaultLot) customDefaultLot.value = '1.0';
}

// ================
// ブローカー編集モーダル
// ================

/**
 * ブローカー編集モーダルを開く
 * @param {number} brokerId - ブローカーID
 */
function openEditBrokerModal(brokerId) {
    const broker = window.SettingsModule.getBrokerById(brokerId);
    if (!broker) {
        alert('❌ ブローカーが見つかりません');
        return;
    }
    
    currentEditingBrokerId = brokerId;
    
    // フォームに値を設定
    document.getElementById('edit-broker-name').value = broker.name;
    document.getElementById('edit-broker-shortname').value = broker.shortName;
    document.getElementById('edit-broker-lotunit').value = broker.lotUnit;
    document.getElementById('edit-broker-defaultlot').value = broker.defaultLot;
    
    // プリセット情報を表示
    const presetInfo = document.getElementById('edit-preset-info');
    if (presetInfo) {
        if (broker.isCustom) {
            presetInfo.style.display = 'none';
        } else {
            presetInfo.style.display = 'block';
            presetInfo.innerHTML = `
                <p style="color: #4a9eff; font-size: 0.9em; margin: 0;">
                    ℹ️ このブローカーはプリセットから追加されました
                </p>
            `;
        }
    }
    
    // モーダルを表示
    const modal = document.getElementById('edit-broker-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * ブローカー編集モーダルを閉じる
 */
function closeEditBrokerModal() {
    const modal = document.getElementById('edit-broker-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentEditingBrokerId = null;
}

/**
 * ブローカーを更新
 */
function updateBroker() {
    if (!currentEditingBrokerId) {
        alert('❌ エラー: ブローカーIDが不正です');
        return;
    }
    
    const name = document.getElementById('edit-broker-name')?.value.trim();
    const shortName = document.getElementById('edit-broker-shortname')?.value.trim();
    const lotUnit = parseInt(document.getElementById('edit-broker-lotunit')?.value);
    const defaultLot = parseFloat(document.getElementById('edit-broker-defaultlot')?.value);
    
    // バリデーション
    if (!name) {
        alert('❌ ブローカー名を入力してください');
        return;
    }
    
    if (!shortName) {
        alert('❌ 略称を入力してください');
        return;
    }
    
    if (!lotUnit || lotUnit <= 0) {
        alert('❌ 有効なロット単位を入力してください');
        return;
    }
    
    if (!defaultLot || defaultLot <= 0) {
        alert('❌ 有効なデフォルトロットを入力してください');
        return;
    }
    
    // ブローカーを更新
    const result = window.SettingsModule.updateBroker(currentEditingBrokerId, {
        name: name,
        shortName: shortName,
        lotUnit: lotUnit,
        defaultLot: defaultLot
    });
    
    if (result.success) {
        alert('✅ ブローカーを更新しました');
        closeEditBrokerModal();
        renderBrokerList();  // 一覧を更新
    } else {
        alert('❌ エラー: ' + result.error);
    }
}

// ================
// ブローカー削除
// ================

/**
 * ブローカー削除の確認
 * @param {number} brokerId - ブローカーID
 */
function confirmDeleteBroker(brokerId) {
    const broker = window.SettingsModule.getBrokerById(brokerId);
    if (!broker) {
        alert('❌ ブローカーが見つかりません');
        return;
    }
    
    const confirmed = confirm(`本当に「${broker.name}」を削除しますか？\n\nこの操作は取り消せません。`);
    
    if (confirmed) {
        const result = window.SettingsModule.deleteBroker(brokerId);
        
        if (result.success) {
            alert('✅ ブローカーを削除しました');
            renderBrokerList();  // 一覧を更新
        } else {
            alert('❌ エラー: ' + result.error);
        }
    }
}

// ================
// デバッグ用
// ================

/**
 * デバッグ情報を出力
 */
function debugBrokerUI() {
    console.log('=== Broker UI Debug ===');
    console.log('SettingsModule:', window.SettingsModule);
    console.log('EventBus:', window.eventBus);
    console.log('Brokers:', window.SettingsModule?.getAllBrokers());
    console.log('Presets:', window.SettingsModule?.getPresetBrokers().length);
}

console.log('✅ broker-ui.js loaded (v1.0.4 - CSS class適用)');