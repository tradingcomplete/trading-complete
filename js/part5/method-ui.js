/**
 * @file method-ui.js
 * @description 手法管理のUI
 * @version 1.0.0
 */

// ================
// 初期化
// ================

document.addEventListener('DOMContentLoaded', () => {
    initializeMethodUI();
    
    // EventBusリスナー
    if (window.eventBus) {
        window.eventBus.on('settings:methodAdded', () => renderMethodList());
        window.eventBus.on('settings:methodDeleted', () => renderMethodList());
    }
});

/**
 * 手法UIを初期化
 */
function initializeMethodUI() {
    renderMethodList();
    console.log('method-ui: initialized');
}

// ================
// 手法一覧表示
// ================

/**
 * 手法一覧を描画
 */
function renderMethodList() {
    const container = document.getElementById('method-list');
    if (!container) return;
    
    const methods = window.SettingsModule?.getAllMethods() || [];
    
    if (methods.length === 0) {
        container.innerHTML = `
            <div style="color: #888; padding: 20px; text-align: center; border: 1px dashed #444; border-radius: 8px;">
                登録された手法はありません
            </div>
        `;
        return;
    }
    
    container.innerHTML = methods.map(method => `
        <div class="method-item" style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            margin-bottom: 10px;
        ">
            <div>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                    <span style="
                        background: #4ecdc4;
                        color: #1a1a2e;
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: bold;
                    ">${escapeHtml(method.shortName)}</span>
                    <span style="font-weight: bold;">${escapeHtml(method.name)}</span>
                </div>
                ${method.memo ? `<div style="color: #888; font-size: 12px;">${escapeHtml(method.memo)}</div>` : ''}
            </div>
            <button class="btn btn-danger" 
                    onclick="confirmDeleteMethod('${method.id}')"
                    style="padding: 5px 10px; font-size: 12px;">
                削除
            </button>
        </div>
    `).join('');
}

// ================
// 手法追加モーダル
// ================

/**
 * 手法追加モーダルを開く
 */
function openAddMethodModal() {
    const modal = document.getElementById('add-method-modal');
    if (modal) {
        // 入力をクリア
        document.getElementById('method-name').value = '';
        document.getElementById('method-shortname').value = '';
        document.getElementById('method-memo').value = '';
        
        modal.style.display = 'flex';
    }
}

/**
 * 手法追加モーダルを閉じる
 */
function closeAddMethodModal() {
    const modal = document.getElementById('add-method-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 新しい手法を保存
 */
function saveNewMethod() {
    const name = document.getElementById('method-name').value.trim();
    const shortName = document.getElementById('method-shortname').value.trim();
    const memo = document.getElementById('method-memo').value.trim();
    
    // バリデーション
    if (!name) {
        alert('手法名を入力してください');
        return;
    }
    if (!shortName) {
        alert('略称を入力してください');
        return;
    }
    
    const result = window.SettingsModule?.addMethod(name, shortName, memo);
    
    if (result) {
        closeAddMethodModal();
        // renderMethodList() はEventBusで自動的に呼ばれる
    } else {
        alert('手法の追加に失敗しました。入力内容を確認してください。');
    }
}

// ================
// 手法削除
// ================

/**
 * 手法削除の確認
 * @param {string} methodId - 手法ID
 */
function confirmDeleteMethod(methodId) {
    const method = window.SettingsModule?.getMethodById(methodId);
    if (!method) return;
    
    const confirmed = confirm(
        `「${method.name}」を削除しますか？\n\n` +
        `⚠️ この手法を使用したトレードは分析から除外されます。\n` +
        `この操作は取り消せません。`
    );
    
    if (confirmed) {
        window.SettingsModule?.deleteMethod(methodId);
    }
}

// ================
// ユーティリティ
// ================

/**
 * HTMLエスケープ
 * @param {string} str - 文字列
 * @returns {string} エスケープ済み文字列
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ================
// グローバル登録
// ================

window.openAddMethodModal = openAddMethodModal;
window.closeAddMethodModal = closeAddMethodModal;
window.saveNewMethod = saveNewMethod;
window.confirmDeleteMethod = confirmDeleteMethod;
window.renderMethodList = renderMethodList;
window.initializeMethodUI = initializeMethodUI;
