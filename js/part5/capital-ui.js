// ========================================
// capital-ui.js - 入出金管理UI制御
// Phase 2: タスク2-2
// ========================================

// ソート状態を保持する変数
let capitalSortAscending = false; // false=新しい順（降順）, true=古い順（昇順）

/**
 * 入出金記録を追加
 */
function addCapitalRecord() {
    console.log('addCapitalRecord() 呼び出し');
    
    // フォーム要素を取得
    const typeRadios = document.getElementsByName('capitalType');
    const dateInput = document.getElementById('capitalRecordDate');
    const amountInput = document.getElementById('capitalRecordAmount');
    const noteInput = document.getElementById('capitalRecordNote');
    
    // 選択された種別を取得
    let selectedType = '';
    for (const radio of typeRadios) {
        if (radio.checked) {
            selectedType = radio.value;
            break;
        }
    }
    
    // 入力値を取得
    const date = dateInput ? dateInput.value : '';
    const amount = amountInput ? parseFloat(amountInput.value) : 0;
    const note = noteInput ? noteInput.value.trim() : '';
    
    // バリデーション
    if (!selectedType) {
        alert('❌ 種別（入金/出金）を選択してください');
        return;
    }
    
    if (!date) {
        alert('❌ 日付を入力してください');
        return;
    }
    
    if (!amount || amount <= 0) {
        alert('❌ 金額は正の数値を入力してください');
        return;
    }
    
    // 出金の場合、残高チェック
    if (selectedType === 'withdrawal') {
        const currentBalance = window.CapitalManagerModule.getCurrentBalance();
        if (amount > currentBalance) {
            alert(`❌ 出金額が残高を超えています\n現在の残高: ¥${currentBalance.toLocaleString()}`);
            return;
        }
    }
    
    // CapitalManagerModuleを使用して記録追加
    try {
        const record = window.CapitalManagerModule.addRecord(selectedType, date, amount, note);
        
        if (record) {
            console.log('✅ 入出金記録追加成功:', record);
            alert(`✅ ${selectedType === 'deposit' ? '入金' : '出金'}を記録しました\n金額: ¥${amount.toLocaleString()}`);
            
            // フォームをリセット
            if (amountInput) amountInput.value = '';
            if (noteInput) noteInput.value = '';
            
            // 入出金履歴を更新
            updateCapitalHistory();
            
            // 投入資金表示を更新
            updateCurrentBalance();
        }
    } catch (error) {
        console.error('❌ 入出金記録追加エラー:', error);
        alert('❌ 記録の追加に失敗しました: ' + error.message);
    }
}

/**
 * 入出金履歴の並び替えを切り替える
 */
function toggleCapitalSort() {
    console.log('toggleCapitalSort() 呼び出し');
    
    // ソート状態を反転
    capitalSortAscending = !capitalSortAscending;
    
    // ボタンのテキストを更新
    const button = document.getElementById('capitalSortButton');
    if (button) {
        button.textContent = capitalSortAscending ? '📅 古い順' : '📅 新しい順';
        console.log(`ソート切り替え: ${capitalSortAscending ? '古い順（昇順）' : '新しい順（降順）'}`);
    }
    
    // 履歴を再表示
    updateCapitalHistory();
}

/**
 * 入出金履歴を更新
 */
function updateCapitalHistory() {
    console.log('updateCapitalHistory() 呼び出し');
    
    const historyBody = document.getElementById('capitalHistoryBody');
    if (!historyBody) {
        console.warn('⚠️ 入出金履歴テーブルが見つかりません');
        return;
    }
    
    // 親要素にスクロールコンテナクラスを追加（iOS対応）
    const table = document.getElementById('capitalHistoryTable');
    if (table && table.parentElement) {
        table.parentElement.classList.add('capital-table-scroll-container');
    }
    
    // 全記録を取得
    const records = window.CapitalManagerModule.getAllRecords();
    
    // テーブルをクリア
    historyBody.innerHTML = '';
    
    if (records.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">記録がありません</td></tr>';
        return;
    }
    
    // ソート状態に応じて並び替え
    records.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        
        if (capitalSortAscending) {
            // 昇順（古い順）
            return dateA - dateB;
        } else {
            // 降順（新しい順）
            return dateB - dateA;
        }
    });
    
    // 各記録を表示
    records.forEach(record => {
        const row = document.createElement('tr');
        
        // 種別
        const typeCell = document.createElement('td');
        const typeLabel = record.type === 'deposit' ? '入金' : '出金';
        const typeColor = record.type === 'deposit' ? '#10b981' : '#ef4444';
        typeCell.innerHTML = `<span style="color: ${typeColor}; font-weight: bold;">${typeLabel}</span>`;
        
        // 日付
        const dateCell = document.createElement('td');
        dateCell.textContent = record.date;
        
        // 金額
        const amountCell = document.createElement('td');
        const amountSign = record.type === 'deposit' ? '+' : '-';
        const amountColor = record.type === 'deposit' ? '#10b981' : '#ef4444';
        amountCell.innerHTML = `<span style="color: ${amountColor}; font-weight: bold;">${amountSign}¥${record.amount.toLocaleString()}</span>`;
        
        // 残高
        const balanceCell = document.createElement('td');
        balanceCell.textContent = `¥${record.balance.toLocaleString()}`;
        
        // 操作
        const actionCell = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️ 削除';
        deleteBtn.className = 'btn-danger';
        deleteBtn.style.cssText = 'padding: 5px 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;';
        deleteBtn.onclick = () => deleteCapitalRecord(record.id);
        actionCell.appendChild(deleteBtn);
        
        row.appendChild(typeCell);
        row.appendChild(dateCell);
        row.appendChild(amountCell);
        row.appendChild(balanceCell);
        row.appendChild(actionCell);
        
        historyBody.appendChild(row);
    });
    
    console.log(`✅ 入出金履歴表示完了: ${records.length}件 (${capitalSortAscending ? '古い順' : '新しい順'})`);
}

/**
 * 現在の投入資金を更新
 */
function updateCurrentBalance() {
    console.log('updateCurrentBalance() 呼び出し');
    
    const balanceDisplay = document.getElementById('currentCapitalDisplay');
    if (!balanceDisplay) {
        console.warn('⚠️ 投入資金表示エリアが見つかりません');
        return;
    }
    
    const balance = window.CapitalManagerModule.getCurrentBalance();
    balanceDisplay.innerHTML = `<strong style="font-size: 1.5em; color: #10b981;">¥${balance.toLocaleString()}</strong>`;
    
    // 全期間利益率も更新
    updateTotalProfitRate();
}

/**
 * 全期間利益率を計算して表示
 */
function updateTotalProfitRate() {
    console.log('updateTotalProfitRate() 呼び出し');
    
    // 表示要素を取得（なければ作成）
    let displayElem = document.getElementById('totalProfitRateDisplay');
    
    if (!displayElem) {
        // 要素がなければ動的に作成
        const capitalDisplay = document.getElementById('currentCapitalDisplay');
        if (!capitalDisplay) return;
        
        const container = capitalDisplay.parentElement;
        if (!container) return;
        
        // 全期間利益率のHTML要素を作成
        const profitRateDiv = document.createElement('div');
        profitRateDiv.style.cssText = 'text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.3);';
        profitRateDiv.innerHTML = `
            <p style="color: rgba(255,255,255,0.8); font-size: 0.9em; margin-bottom: 5px;">全期間利益率</p>
            <p id="totalProfitRateDisplay" style="font-size: 1.8em; font-weight: bold; color: white; margin: 0;">--%</p>
            <p style="color: rgba(255,255,255,0.6); font-size: 0.75em; margin-top: 5px;">（投入資金に対する利益の割合）</p>
        `;
        
        container.appendChild(profitRateDiv);
        displayElem = document.getElementById('totalProfitRateDisplay');
        console.log('✅ 全期間利益率表示エリアを動的に作成');
    }
    
    if (!displayElem) return;
    
    // 投入資金を取得
    const totalDeposit = window.CapitalManagerModule ? window.CapitalManagerModule.getCurrentBalance() : 0;
    
    if (!totalDeposit || totalDeposit === 0) {
        displayElem.textContent = '--%';
        displayElem.style.color = 'white';
        return;
    }
    
    // 全期間利益を計算
    let totalProfit = 0;
    if (window.TradeManager) {
        const allTrades = window.TradeManager.getInstance().getAllTrades() || [];
        const closedTrades = allTrades.filter(t => t.exits && t.exits.length > 0);
        
        totalProfit = closedTrades.reduce((sum, t) => {
            const yenProfit = t.yenProfitLoss ? t.yenProfitLoss.netProfit : 0;
            return sum + (yenProfit || 0);
        }, 0);
    }
    
    // 利益率計算
    const profitRate = (totalProfit / totalDeposit * 100).toFixed(1);
    displayElem.textContent = profitRate + '%';
    displayElem.style.color = parseFloat(profitRate) >= 0 ? '#90EE90' : '#ff6b6b';
    
    console.log(`✅ 全期間利益率更新: ${profitRate}% (利益: ¥${totalProfit.toLocaleString()} / 投入: ¥${totalDeposit.toLocaleString()})`);
}

/**
 * 入出金記録を削除
 */
function deleteCapitalRecord(id) {
    if (!confirm('この記録を削除しますか?\n削除後、残高が再計算されます。')) {
        return;
    }
    
    try {
        const result = window.CapitalManagerModule.deleteRecord(id);
        
        if (result) {
            console.log('✅ 入出金記録削除成功:', id);
            alert('✅ 記録を削除しました');
            
            // 表示を更新
            updateCapitalHistory();
            updateCurrentBalance();
        }
    } catch (error) {
        console.error('❌ 入出金記録削除エラー:', error);
        alert('❌ 記録の削除に失敗しました: ' + error.message);
    }
}

/**
 * 初期化（ページロード時）
 */
function initCapitalUI() {
    console.log('initCapitalUI() 呼び出し');
    
    // ボタンにイベントリスナーを設定
    const btn = document.getElementById('btnAddCapitalRecord');
    if (btn) {
        btn.addEventListener('click', addCapitalRecord);
        console.log('✅ ボタンにイベントリスナー設定完了');
    } else {
        console.warn('⚠️ btnAddCapitalRecordが見つかりません');
    }
    
    // 今日の日付をデフォルト設定
    const dateInput = document.getElementById('capitalRecordDate');
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    
    // 初期表示を更新
    updateCapitalHistory();
    updateCurrentBalance();
}

// ページロード時に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCapitalUI);
} else {
    initCapitalUI();
}

console.log('✅ capital-ui.js 読み込み完了');