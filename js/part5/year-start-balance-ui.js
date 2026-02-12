// ========================================
// year-start-balance-ui.js - 年初口座残高設定UI制御
// Part 5: 設定タブUI
// MODULES.md準拠
// ========================================

/**
 * 年初口座残高設定UIを初期化
 */
function initYearStartBalanceUI() {
    const container = document.getElementById('yearStartBalanceList');
    if (!container) return;
    
    const balances = window.SettingsModule?.getAllYearStartBalances() || {};
    container.innerHTML = '';
    
    const years = Object.keys(balances).sort();
    if (years.length > 0) {
        years.forEach(year => {
            addYearStartBalanceRowUI(parseInt(year), balances[year]);
        });
    } else {
        const currentYear = new Date().getFullYear();
        addYearStartBalanceRowUI(currentYear, 0);
    }
    
    console.log('[YearStartBalanceUI] UI初期化完了');
}

/**
 * 年初口座残高の行をUIに追加
 * @param {number} year - 年度
 * @param {number} amount - 金額
 */
function addYearStartBalanceRowUI(year, amount) {
    const container = document.getElementById('yearStartBalanceList');
    if (!container) return;
    
    const row = document.createElement('div');
    row.className = 'year-balance-row';
    row.style.cssText = 'display: flex; align-items: center; gap: 10px; flex-wrap: wrap;';
    row.dataset.year = year;
    
    row.innerHTML = `
        <span style="min-width: 60px; color: #e0e0e0;">${year}年:</span>
        <input type="number" 
               value="${amount}" 
               onchange="saveYearStartBalance(${year}, this.value)"
               style="flex: 1; max-width: 200px; padding: 8px; background: #374151; color: white; border: 1px solid #4b5563; border-radius: 4px; text-align: right;">
        <span style="color: #7a8599;">円</span>
        <button onclick="calculateFromPrevYear(${year}, this.parentElement)"
                style="padding: 6px 10px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8em;"
                title="前年末残高から自動計算">
            前年末から計算
        </button>
        <button onclick="removeYearStartBalanceRow(${year}, this.parentElement)"
                style="padding: 6px 10px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8em;">
            削除
        </button>
    `;
    
    container.appendChild(row);
}

/**
 * 年度を追加
 */
function addYearStartBalanceRow() {
    const container = document.getElementById('yearStartBalanceList');
    if (!container) return;
    
    const existingYears = Array.from(container.querySelectorAll('.year-balance-row'))
        .map(row => parseInt(row.dataset.year));
    
    const currentYear = new Date().getFullYear();
    let newYear = currentYear;
    
    if (existingYears.length > 0) {
        const maxYear = Math.max(...existingYears);
        newYear = maxYear + 1;
    }
    
    if (existingYears.includes(newYear)) {
        alert(`${newYear}年は既に追加されています`);
        return;
    }
    
    addYearStartBalanceRowUI(newYear, 0);
    saveYearStartBalance(newYear, 0);
}

/**
 * 年初口座残高を保存
 * @param {number} year - 年度
 * @param {string|number} value - 金額
 */
function saveYearStartBalance(year, value) {
    const amount = parseInt(value) || 0;
    if (window.SettingsModule?.setYearStartBalance) {
        window.SettingsModule.setYearStartBalance(year, amount);
    }
}

/**
 * 前年末残高から自動計算
 * @param {number} year - 年度
 * @param {HTMLElement} rowElement - 行要素
 */
function calculateFromPrevYear(year, rowElement) {
    if (!window.SettingsModule?.calculatePreviousYearEndBalance) {
        alert('計算機能が利用できません');
        return;
    }
    
    const prevYearEnd = window.SettingsModule.calculatePreviousYearEndBalance(year);
    
    if (prevYearEnd === null) {
        alert(`${year - 1}年の年初口座残高が設定されていません`);
        return;
    }
    
    const input = rowElement.querySelector('input');
    if (input) {
        input.value = prevYearEnd;
    }
    
    saveYearStartBalance(year, prevYearEnd);
    alert(`${year}年の年初口座残高を¥${prevYearEnd.toLocaleString()}に設定しました`);
}

/**
 * 年度行を削除
 * @param {number} year - 年度
 * @param {HTMLElement} rowElement - 行要素
 */
function removeYearStartBalanceRow(year, rowElement) {
    if (!confirm(`${year}年の年初口座残高を削除しますか？`)) {
        return;
    }
    
    rowElement.remove();
    
    const balances = window.SettingsModule?.getAllYearStartBalances() || {};
    delete balances[String(year)];
    localStorage.setItem('yearStartBalances', JSON.stringify(balances));
    
    // EventBus通知
    if (window.eventBus) {
        window.eventBus.emit('settings:yearStartBalanceChanged', { year, amount: null, deleted: true });
    }
}

// ページロード時に初期化（SettingsModule初期化後）
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
            if (typeof initYearStartBalanceUI === 'function') {
                initYearStartBalanceUI();
            }
        }, 100);
    });
} else {
    setTimeout(function() {
        if (typeof initYearStartBalanceUI === 'function') {
            initYearStartBalanceUI();
        }
    }, 100);
}

console.log('✅ year-start-balance-ui.js 読み込み完了');