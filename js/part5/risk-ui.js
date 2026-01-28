/**
 * @file risk-ui.js
 * @description 許容損失管理のUI
 * @version 1.0.0
 */

// ================
// 初期化
// ================

document.addEventListener('DOMContentLoaded', () => {
    initializeRiskToleranceUI();
});

/**
 * 許容損失UIを初期化
 */
function initializeRiskToleranceUI() {
    const input = document.getElementById('risk-tolerance-input');
    if (!input) return;
    
    // 現在の値を読み込み
    const currentValue = window.SettingsModule?.getRiskTolerance();
    if (currentValue !== null) {
        input.value = currentValue;
    }
    
    // ブローカーバッジ設定を読み込み
    const checkbox = document.getElementById('show-broker-badge');
    if (checkbox && window.SettingsModule) {
        checkbox.checked = window.SettingsModule.getShowBrokerBadge();
    }
    
    console.log('risk-ui: initialized, current value:', currentValue);
}

// ================
// 許容損失
// ================

/**
 * 許容損失を保存
 */
function saveRiskTolerance() {
    const input = document.getElementById('risk-tolerance-input');
    const status = document.getElementById('risk-tolerance-status');
    
    if (!input) return;
    
    const value = parseInt(input.value, 10);
    
    if (isNaN(value) || value < 0) {
        alert('有効な金額を入力してください');
        return;
    }
    
    const success = window.SettingsModule?.setRiskTolerance(value);
    
    if (success && status) {
        status.style.display = 'block';
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }
}

// ================
// ブローカーバッジ表示設定
// ================

/**
 * ブローカーバッジ表示を切り替え
 */
function toggleBrokerBadge() {
    const checkbox = document.getElementById('show-broker-badge');
    if (!checkbox) return;
    
    window.SettingsModule?.setShowBrokerBadge(checkbox.checked);
}


// ================
// リスク管理計算（エントリー画面用）
// ================

/**
 * リスク管理セクションを初期化
 */
function initializeRiskManagement() {
    // 許容損失の表示を更新
    updateRiskToleranceDisplay();
    
    // 手法プルダウンを初期化
    initMethodDropdown();
    
    // 通貨ペア変更時のイベント
    const pairInput = document.getElementById('pair');
    if (pairInput) {
        pairInput.addEventListener('change', onPairChanged);
        pairInput.addEventListener('blur', onPairChanged);
    }
    
    // 損切り価格変更時のイベント
    const stopLossInput = document.getElementById('stopLoss');
    const entryPriceInput = document.getElementById('entryPrice');
    if (stopLossInput) {
        stopLossInput.addEventListener('input', updateStopLossPips);
    }
    if (entryPriceInput) {
        entryPriceInput.addEventListener('input', updateStopLossPips);
    }
    
    console.log('risk-ui: Risk management initialized');
}

/**
 * 許容損失の表示を更新
 */
function updateRiskToleranceDisplay() {
    const display = document.getElementById('risk-tolerance-display');
    if (!display) return;
    
    const tolerance = window.SettingsModule?.getRiskTolerance();
    if (tolerance !== null && tolerance > 0) {
        display.textContent = `（許容損失: ${tolerance.toLocaleString()}円）`;
        display.style.color = '#4ecdc4';
    } else {
        display.textContent = '（許容損失: 未設定）';
        display.style.color = '#888';
    }
}

/**
 * 通貨ペア変更時の処理
 */
function onPairChanged() {
    const pairInput = document.getElementById('pair');
    const rateInput = document.getElementById('quote-currency-rate');
    const rateLabel = document.getElementById('quote-currency-label');
    
    if (!pairInput || !rateInput) return;
    
    const pairValue = pairInput.value.toUpperCase();
    
    // 決済通貨を判定
    const quoteCurrency = getQuoteCurrency(pairValue);
    
    if (quoteCurrency === 'JPY') {
        // クロス円の場合は自動で1.00
        rateInput.value = '1.00';
        rateInput.disabled = true;
        rateInput.style.backgroundColor = 'rgba(255,255,255,0.05)';
        if (rateLabel) rateLabel.textContent = '（円建て）';
    } else {
        // それ以外は手動入力
        rateInput.disabled = false;
        rateInput.style.backgroundColor = '';
        rateInput.value = '';
        if (rateLabel) rateLabel.textContent = `（${quoteCurrency}/JPY）`;
    }
    
    // 適正ロット再計算
    calculateOptimalLot();
}

/**
 * 決済通貨を取得
 * @param {string} pair - 通貨ペア（例: USD/JPY, EUR/USD）
 * @returns {string} 決済通貨
 */
function getQuoteCurrency(pair) {
    if (!pair) return '';
    const parts = pair.replace('/', '').match(/.{1,3}/g);
    if (parts && parts.length >= 2) {
        return parts[1].toUpperCase();
    }
    return '';
}

/**
 * 損切り幅（pips）を更新
 */
function updateStopLossPips() {
    const entryPrice = parseFloat(document.getElementById('entryPrice')?.value);
    const stopLoss = parseFloat(document.getElementById('stopLoss')?.value);
    const direction = document.getElementById('direction')?.value;
    const pairValue = document.getElementById('pair')?.value || '';
    
    const display = document.getElementById('stop-loss-pips-display');
    if (!display) return;
    
    if (isNaN(entryPrice) || isNaN(stopLoss) || entryPrice === 0) {
        display.textContent = '- pips';
        calculateOptimalLot();
        return;
    }
    
    // pips計算（通貨ペアによってpip値が異なる）
    const pipValue = getPipValue(pairValue);
    let pips = Math.abs(entryPrice - stopLoss) / pipValue;
    
    // 方向チェック（ロングなら損切りはエントリーより下、ショートなら上）
    const isValid = (direction === 'long' && stopLoss < entryPrice) ||
                   (direction === 'short' && stopLoss > entryPrice);
    
    if (!isValid) {
        display.textContent = '⚠️ 損切り方向エラー';
        display.style.color = '#ff6b6b';
        return;
    }
    
    display.textContent = `${pips.toFixed(1)} pips`;
    display.style.color = '#ff6b6b';
    
    // 適正ロット計算
    calculateOptimalLot();
}

/**
 * pip値を取得（通貨ペアに応じて）
 * @param {string} pair - 通貨ペア
 * @returns {number} pip値
 */
function getPipValue(pair) {
    if (!pair) return 0.01;
    const upperPair = pair.toUpperCase();
    
    // JPY絡みは0.01、それ以外は0.0001
    if (upperPair.includes('JPY')) {
        return 0.01;
    }
    return 0.0001;
}

/**
 * 適正ロットを計算
 */
function calculateOptimalLot() {
    const tolerance = window.SettingsModule?.getRiskTolerance();
    const entryPrice = parseFloat(document.getElementById('entryPrice')?.value);
    const stopLoss = parseFloat(document.getElementById('stopLoss')?.value);
    const quoteRate = parseFloat(document.getElementById('quote-currency-rate')?.value);
    const pairValue = document.getElementById('pair')?.value || '';
    const brokerSelect = document.getElementById('broker');
    
    const display = document.getElementById('optimal-lot-display');
    if (!display) return;
    
    // 必要な値がない場合
    if (!tolerance || tolerance <= 0) {
        display.textContent = '設定なし';
        display.style.color = '#888';
        return;
    }
    
    if (isNaN(entryPrice) || isNaN(stopLoss) || isNaN(quoteRate) || quoteRate <= 0) {
        display.textContent = '- ロット';
        display.style.color = '#4ecdc4';
        return;
    }
    
    // 損切り幅（pips）
    const pipValue = getPipValue(pairValue);
    const stopLossPips = Math.abs(entryPrice - stopLoss) / pipValue;
    
    if (stopLossPips <= 0) {
        display.textContent = '- ロット';
        return;
    }
    
    // ロット単位を取得
    let lotUnit = 10000; // デフォルト
    if (brokerSelect) {
        const selectedOption = brokerSelect.options[brokerSelect.selectedIndex];
        if (selectedOption && selectedOption.dataset.lotUnit) {
            lotUnit = parseInt(selectedOption.dataset.lotUnit, 10);
        }
    }
    
    // 適正ロット計算
    // 許容損失 = 損切りpips × ロット × ロット単位 × pip値（円換算）
    // JPY絡みの場合: pip値は0.01円
    // それ以外: pip値は0.0001 × quoteRate円
    
    let pipValueInYen;
    if (pairValue.toUpperCase().includes('JPY')) {
        pipValueInYen = 0.01;
    } else {
        pipValueInYen = 0.0001 * quoteRate;
    }
    
    const optimalLot = tolerance / (stopLossPips * lotUnit * pipValueInYen);
    
    display.textContent = `${optimalLot.toFixed(2)} ロット`;
    display.style.color = '#4ecdc4';
    
    // 現在のロットと比較して警告
    updateLotRiskStatus();
}

/**
 * ロットのリスク状態を更新
 */
function updateLotRiskStatus() {
    const lotInput = document.getElementById('lotSize');
    const hint = document.getElementById('lot-risk-hint');
    const statusMessage = document.getElementById('risk-status-message');
    const optimalDisplay = document.getElementById('optimal-lot-display');
    
    if (!lotInput || !hint) return;
    
    const currentLot = parseFloat(lotInput.value);
    const optimalText = optimalDisplay?.textContent || '';
    const optimalMatch = optimalText.match(/([\d.]+)\s*ロット/);
    const optimalLot = optimalMatch ? parseFloat(optimalMatch[1]) : null;
    
    // リセット
    lotInput.style.borderColor = '';
    lotInput.style.backgroundColor = '';
    hint.style.display = 'none';
    if (statusMessage) statusMessage.style.display = 'none';
    
    if (!optimalLot || isNaN(currentLot) || currentLot <= 0) {
        return;
    }
    
    const ratio = currentLot / optimalLot;
    
    if (ratio <= 1.0) {
        // 適正以下（緑）
        lotInput.style.borderColor = '#4ecdc4';
        hint.textContent = '✅ 適正範囲内';
        hint.style.color = '#4ecdc4';
        hint.style.display = 'block';
    } else if (ratio <= 2.0) {
        // 1〜2倍（オレンジ）
        lotInput.style.borderColor = '#ff9f43';
        lotInput.style.backgroundColor = 'rgba(255, 159, 67, 0.1)';
        hint.textContent = `⚠️ 適正の${ratio.toFixed(1)}倍（許容損失超過の可能性）`;
        hint.style.color = '#ff9f43';
        hint.style.display = 'block';
        
        if (statusMessage) {
            statusMessage.textContent = '⚠️ ロットが適正値を超えています。リスク管理にご注意ください。';
            statusMessage.style.backgroundColor = 'rgba(255, 159, 67, 0.2)';
            statusMessage.style.color = '#ff9f43';
            statusMessage.style.display = 'block';
        }
    } else {
        // 2倍超（赤）
        lotInput.style.borderColor = '#ff6b6b';
        lotInput.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
        hint.textContent = `🚨 適正の${ratio.toFixed(1)}倍（大幅な許容損失超過）`;
        hint.style.color = '#ff6b6b';
        hint.style.display = 'block';
        
        if (statusMessage) {
            statusMessage.textContent = '🚨 ロットが適正値の2倍を超えています！損失が許容額を大きく超える可能性があります。';
            statusMessage.style.backgroundColor = 'rgba(255, 107, 107, 0.2)';
            statusMessage.style.color = '#ff6b6b';
            statusMessage.style.display = 'block';
        }
    }
}

// ================
// 手法プルダウン
// ================

/**
 * 手法プルダウンを初期化
 */
function initMethodDropdown() {
    renderMethodDropdown();
    
    // EventBusリスナー
    if (window.eventBus) {
        window.eventBus.on('settings:methodAdded', renderMethodDropdown);
        window.eventBus.on('settings:methodDeleted', renderMethodDropdown);
    }
}

/**
 * 手法プルダウンを描画
 */
function renderMethodDropdown() {
    const select = document.getElementById('tradeMethod');
    if (!select) return;
    
    const methods = window.SettingsModule?.getAllMethods() || [];
    
    // オプション生成
    select.innerHTML = '<option value="">未選択</option>';
    
    methods.forEach(method => {
        const option = document.createElement('option');
        option.value = method.id;
        option.textContent = method.name;
        option.dataset.shortName = method.shortName;
        select.appendChild(option);
    });
    
    console.log(`risk-ui: Method dropdown rendered with ${methods.length} methods`);
}

/**
 * 手法選択時の処理
 */
function onMethodSelected() {
    const select = document.getElementById('tradeMethod');
    if (!select) return;
    
    const selectedOption = select.options[select.selectedIndex];
    console.log('risk-ui: Method selected:', selectedOption?.value || 'none');
}

// ================
// DOMContentLoaded で初期化
// ================

document.addEventListener('DOMContentLoaded', () => {
    // 少し遅延させてSettingsModule初期化を待つ
    setTimeout(() => {
        initializeRiskManagement();
    }, 500);
});

// ================
// グローバル登録
// ================

window.saveRiskTolerance = saveRiskTolerance;
window.toggleBrokerBadge = toggleBrokerBadge;
window.initializeRiskToleranceUI = initializeRiskToleranceUI;

// NEW: エントリー画面用
window.calculateOptimalLot = calculateOptimalLot;
window.updateLotRiskStatus = updateLotRiskStatus;
window.updateStopLossPips = updateStopLossPips;
window.onMethodSelected = onMethodSelected;
window.renderMethodDropdown = renderMethodDropdown;
window.initializeRiskManagement = initializeRiskManagement;