// js/part2/bridge.js
// Part 2モジュール化 - 互換性維持層（更新版）
// 最終更新: 2025/09/15 - TradeEntry追加

// ==================== TradeValidator Bridge ====================
// 第1段階で実装済み
window.validatePriceLogic = function(entryPrice, exitPrice, stopLoss, takeProfit, direction) {
    if (!window.tradeValidator) {
        console.warn('TradeValidator not loaded');
        return { isValid: true, errors: [] };
    }
    return window.tradeValidator.validatePriceLogic(entryPrice, exitPrice, stopLoss, takeProfit, direction);
};

// 新規エントリー時の価格バリデーション（exitPriceなし）
window.validateEntryPrices = function(entryPrice, stopLoss, takeProfit, direction) {
    const errors = [];
    
    // 数値チェック
    if (!entryPrice || !stopLoss || !takeProfit || !direction) {
        return errors; // 空配列を返す（必須チェックは別で行う）
    }
    
    // 数値型に変換
    const entry = parseFloat(entryPrice);
    const stop = parseFloat(stopLoss);
    const target = parseFloat(takeProfit);
    
    // NaNチェック
    if (isNaN(entry) || isNaN(stop) || isNaN(target)) {
        errors.push('価格は数値で入力してください');
        return errors;
    }
    
    // ロングの場合
    if (direction === 'long') {
        // 利確目標価格はエントリー価格より高くなければならない
        if (target <= entry) {
            errors.push('買いの場合、利確目標価格はエントリー価格より高く設定してください');
        }
        
        // 損切り価格はエントリー価格より低くなければならない
        if (stop >= entry) {
            errors.push('買いの場合、損切り価格はエントリー価格より低く設定してください');
        }
    }
    
    // ショートの場合
    if (direction === 'short') {
        // 利確目標価格はエントリー価格より低くなければならない
        if (target >= entry) {
            errors.push('売りの場合、利確目標価格はエントリー価格より低く設定してください');
        }
        
        // 損切り価格はエントリー価格より高くなければならない
        if (stop <= entry) {
            errors.push('売りの場合、損切り価格はエントリー価格より高く設定してください');
        }
    }
    
    return errors;
};


window.validateExitDateTime = function(entryDatetime, exitDatetime) {
    if (!window.tradeValidator) {
        console.warn('TradeValidator not loaded');
        return { isValid: true, error: null };
    }
    return window.tradeValidator.validateExitDateTime(entryDatetime, exitDatetime);
};

// ==================== TradeCalculator Bridge ====================
// 第2段階で実装済み
window.calculatePips = function(entryPrice, exitPrice, direction, symbol) {
    if (!window.tradeCalculator) {
        console.warn('TradeCalculator not loaded');
        return 0;
    }
    return window.tradeCalculator.calculatePips(entryPrice, exitPrice, stopLoss, direction);
};

window.calculateTradePips = function(trade) {
    if (!window.tradeCalculator) {
        console.warn('TradeCalculator not loaded');
        return 0;
    }
    return window.tradeCalculator.calculateTradePips(trade);
};

window.calculateRiskReward = function(entryPrice, exitPrice, stopLoss, direction) {
    if (!window.tradeCalculator) {
        console.warn('TradeCalculator not loaded');
        return 0;
    }
    return window.tradeCalculator.calculateRiskReward(entryPrice, exitPrice, stopLoss, direction);
};

window.calculateInitialRR = function(entryPrice, takeProfit, stopLoss, direction) {
    if (!window.tradeCalculator) {
        console.warn('TradeCalculator not loaded');
        return 0;
    }
    return window.tradeCalculator.calculateInitialRR(entryPrice, takeProfit, stopLoss, direction);
};

window.calculateTradeRR = function(trade) {
    if (!window.tradeCalculator) {
        console.warn('TradeCalculator not loaded');
        return 0;
    }
    return window.tradeCalculator.calculateTradeRR(trade);
};

window.updateRiskReward = function() {
    // 入力値を取得
    const entryPrice = parseFloat(document.getElementById('entryPrice')?.value);
    const stopLoss = parseFloat(document.getElementById('stopLoss')?.value);
    const takeProfit = parseFloat(document.getElementById('takeProfit')?.value);
    const direction = document.getElementById('direction')?.value;
    
    // 表示要素を取得
    const riskPipsEl = document.getElementById('riskPips');
    const rewardPipsEl = document.getElementById('rewardPips');
    const rrRatioEl = document.getElementById('rrRatio');
    
    // 値が不足している場合は "-:-" を表示
    if (!entryPrice || !stopLoss || !takeProfit || !direction) {
        if (riskPipsEl) riskPipsEl.textContent = '- Pips';
        if (rewardPipsEl) rewardPipsEl.textContent = '- Pips';
        if (rrRatioEl) rrRatioEl.textContent = '-:-';
        return;
    }
    
    // tradeCalculatorが存在しない場合
    if (!window.tradeCalculator) {
        console.warn('TradeCalculator not loaded');
        return;
    }
    
    try {
        // リスクリワード計算（正しい引数順序: entryPrice, stopLoss, takeProfit, direction）
        const result = window.tradeCalculator.calculateRiskReward(
            entryPrice,
            stopLoss,
            takeProfit,
            direction
        );
        
        // 通貨ペアがJPYペアかどうかを判定
        const pair = document.getElementById('pair')?.value || '';
        const isJPY = pair.includes('JPY');
        const pipMultiplier = isJPY ? 100 : 10000;
        
        // Pips計算
        const riskPips = Math.abs(result.risk * pipMultiplier);
        const rewardPips = Math.abs(result.reward * pipMultiplier);
        const rrRatio = result.ratio;
        
        // DOM更新
        if (riskPipsEl) riskPipsEl.textContent = `${riskPips.toFixed(1)} Pips`;
        if (rewardPipsEl) rewardPipsEl.textContent = `${rewardPips.toFixed(1)} Pips`;
        if (rrRatioEl) rrRatioEl.textContent = `1:${rrRatio.toFixed(2)}`;
        
    } catch (error) {
        console.error('updateRiskReward error:', error);
        // エラー時は "-:-" を表示
        if (riskPipsEl) riskPipsEl.textContent = '- Pips';
        if (rewardPipsEl) rewardPipsEl.textContent = '- Pips';
        if (rrRatioEl) rrRatioEl.textContent = '-:-';
    }
};

// チェックリスト（トレードプラン）の表示を更新
window.updateConditionStatus = function() {
    // TradeEntryが存在しない場合
    if (!window.tradeEntry) {
        console.warn('TradeEntry not loaded');
        return;
    }
    
    try {
        // checkEntryConditions()を呼び出してカウント
        const result = window.tradeEntry.checkEntryConditions();
        
        // conditionStatus要素を取得
        const statusEl = document.getElementById('conditionStatus');
        
        if (!statusEl) {
            console.warn('conditionStatus element not found');
            return;
        }
        
        // テキスト更新
        statusEl.textContent = `トレードプラン：${result.metConditions}/3`;
        
        // スタイル更新
        if (result.isValid) {
            // 3つすべて入力済み
            statusEl.classList.remove('not-ready');
            statusEl.classList.add('ready');
        } else {
            // まだ入力が不足
            statusEl.classList.remove('ready');
            statusEl.classList.add('not-ready');
        }
        
    } catch (error) {
        console.error('updateConditionStatus error:', error);
    }
};


window.calculateRemainingLot = function(trade) {
    if (!window.tradeCalculator) {
        console.warn('TradeCalculator not loaded');
        return 0;  // 数値を返すように変更
    }
    const result = window.tradeCalculator.calculateRemainingLot(trade);
    // 結果がオブジェクトの場合は remaining の値を返す
    return typeof result === 'object' ? (result.remaining || 0) : result;
};

window.calculateHoldingTime = function(entryDatetime, exitDatetime) {
    if (!window.tradeCalculator) {
        console.warn('TradeCalculator not loaded');
        return null;
    }
    return window.tradeCalculator.calculateHoldingTime(entryDatetime, exitDatetime);
};

// ==================== TradeEntry Bridge ====================
// 第3段階で新規追加 - ID差異を吸収する修正版
window.saveTradeRecord = function(formData = null) {
    // フォームデータの準備（IDの差異を吸収）
    if (!formData) {
        formData = {
            symbol: document.getElementById('pair')?.value || '',
            direction: document.getElementById('direction')?.value || 'long',
            broker: document.getElementById('broker')?.value?.trim() || '',
            entryDatetime: document.getElementById('entryTime')?.value || '',  // entryTimeからentryDatetimeに変更
            entryPrice: document.getElementById('entryPrice')?.value || '',
            lot: document.getElementById('lotSize')?.value || '1.0',
            stopLoss: document.getElementById('stopLoss')?.value || '',
            takeProfit: document.getElementById('takeProfit')?.value || '',
            reason1: document.getElementById('reason1')?.value || '',
            reason2: document.getElementById('reason2')?.value || '',
            reason3: document.getElementById('reason3')?.value || '',
            scenario: document.getElementById('scenario')?.value || '',
            entryEmotion: document.getElementById('entryEmotion')?.value || ''
        };
        
        // チャート画像を収集（3枚対応）- 題名・説明も含む
        const chartImages = [];
        for (let i = 1; i <= 3; i++) {
            // tempChartImageを優先（題名・説明を含むオブジェクト）
            const tempData = window[`tempChartImage${i}`];
            
            if (tempData && tempData.src && tempData.src.startsWith('data:')) {
                // 新形式: オブジェクト {src, title, description}
                chartImages.push({
                    src: tempData.src,
                    title: tempData.title || '',
                    description: tempData.description || ''
                });
            } else {
                // フォールバック: プレビューから取得（題名なし）
                const preview = document.getElementById('tradeChartImagePreview' + i);
                const img = preview?.querySelector('img');
                if (img && img.src && img.src.startsWith('data:image')) {
                    chartImages.push({
                        src: img.src,
                        title: '',
                        description: ''
                    });
                } else {
                    chartImages.push(null);
                }
            }
        }
        formData.chartImages = chartImages;
    }
    
    // TradeEntryが存在する場合は使用、そうでなければ直接保存
    if (window.tradeEntry && window.tradeEntry.saveTradeRecord) {
        const result = window.tradeEntry.saveTradeRecord(formData);
        // 保存成功時に一覧を更新
        if (result && typeof window.displayAllTrades === 'function') {
            setTimeout(() => window.displayAllTrades(), 100);
        }
        return result;
    } else {
        // TradeEntryがない場合は直接保存
        // バリデーション
        if (!formData.symbol) {
            alert('通貨ペアを入力してください');
            return false;
        }
        
        // トレードレコードの作成
        const trade = {
            id: 'trade_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            date: formData.entryDatetime || new Date().toISOString(),  // entryTimeからentryDatetimeに変更
            pair: formData.symbol,
            symbol: formData.symbol,
            direction: formData.direction,
            entryPrice: parseFloat(formData.entryPrice) || 0,
            lot: parseFloat(formData.lot) || 1.0,
            stopLoss: parseFloat(formData.stopLoss) || 0,
            takeProfit: parseFloat(formData.takeProfit) || 0,
            reason: [formData.reason1, formData.reason2, formData.reason3].filter(r => r).join(' / '),
            scenario: formData.scenario,
            emotion: formData.entryEmotion,
            entryTime: formData.entryDatetime,  // entryTimeからentryDatetimeに変更
            status: 'open'
        };
        
        // 保存
        try {
            const trades = JSON.parse(localStorage.getItem('trades') || '[]');
            trades.unshift(trade);
            localStorage.setItem('trades', JSON.stringify(trades));
            
            alert('トレードを保存しました');
            
            // フォームをクリア
            if (typeof window.clearForm === 'function') {
                window.clearForm();
            }
            
            // 一覧を更新
            if (typeof window.displayAllTrades === 'function') {
                setTimeout(() => window.displayAllTrades(), 100);
            }
            
            return true;
        } catch(e) {
            alert('保存に失敗しました: ' + e.message);
            return false;
        }
    }
};

window.clearForm = function() {
    if (window.tradeEntry && window.tradeEntry.clearForm) {
        return window.tradeEntry.clearForm();
    }
    
    // TradeEntryがない場合は直接クリア
    // フォーム要素をクリア（実際のIDを使用）
    const clearIds = ['pair', 'entryPrice', 'stopLoss', 'takeProfit', 'reason1', 'reason2', 'reason3', 'scenario', 'entryEmotion'];
    clearIds.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.value = '';
    });
    
    // デフォルト値を設定
    const directionElem = document.getElementById('direction');
    if (directionElem) directionElem.value = 'long';
    
    const lotElem = document.getElementById('lotSize');
    if (lotElem) lotElem.value = '1.0';
    
    // 現在時刻を設定
    const entryTimeElem = document.getElementById('entryTime');
    if (entryTimeElem) {
        const now = new Date();
        const localISOTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString();
        entryTimeElem.value = localISOTime.slice(0, 16);
    }
    
    console.log('フォームをクリアしました');
};

window.checkEntryConditions = function() {
    if (window.tradeEntry && window.tradeEntry.checkEntryConditions) {
        return window.tradeEntry.checkEntryConditions();
    }
    
    // TradeEntryがない場合は直接チェック
    // エントリー根拠のテキスト入力をチェック
    const reasons = [
        document.getElementById('reason1')?.value,
        document.getElementById('reason2')?.value,
        document.getElementById('reason3')?.value
    ];
    
    const filledReasons = reasons.filter(r => r && r.trim().length > 0).length;
    
    const conditions = {
        reason1: reasons[0] && reasons[0].trim().length > 0,
        reason2: reasons[1] && reasons[1].trim().length > 0,
        reason3: reasons[2] && reasons[2].trim().length > 0
    };
    
    return {
        conditions: conditions,
        metConditions: filledReasons,
        totalConditions: 3,
        percentage: Math.round((filledReasons / 3) * 100),
        isValid: filledReasons >= 1  // 最低1つは入力が必要
    };
};

// ==================== 画像処理 Bridge ====================
// 第3段階で追加（画像処理機能）
window.handlePaste = function(e) {
    if (!window.tradeEntry) {
        console.error('TradeEntry not loaded');
        return;
    }
    return window.tradeEntry.handlePaste(e);
};

window.processImageFile = function(file, type) {
    if (!window.tradeEntry) {
        console.error('TradeEntry not loaded');
        return;
    }
    return window.tradeEntry.processImageFile(file, type);
};

window.clearChartImage = function(event) {
    if (!window.tradeEntry) {
        console.error('TradeEntry not loaded');
        return;
    }
    return window.tradeEntry.clearChartImage(event);
};

window.clearTradeChartImage = function(index, event) {
    if (!window.tradeEntry) {
        console.error('TradeEntry not loaded');
        return;
    }
    return window.tradeEntry.clearTradeChartImage(index, event);
};

// ==================== 確認用ログ ====================
console.log('Bridge.js updated with TradeEntry and image processing functions');

// ========== TradeList.js 関連の追加 ==========
// TradeListインスタンスの作成
const tradeList = new window.TradeList(window.tradeManager);
// 初期化
tradeList.initialize();
// グローバル関数として公開（互換性維持）
// 古い実装を確実に上書き
window.displayAllTrades = function() {
    console.log('displayAllTrades called via bridge (FIXED)');
    if (window.tradeList) {
        window.tradeList.displayAllTrades('tradeRecordsList');
    } else {
        console.error('TradeList instance not found');
    }
};
window.displayAllTradesComplete = function() {
    console.log('displayAllTradesComplete called via bridge');
    if (window.tradeList) {
        window.tradeList.displayAllTradesComplete('tradeRecordsList');
    } else {
        console.error('TradeList instance not found');
    }
};
window.createTradeCard = function(trade, showActions) {
    console.log('createTradeCard called via bridge');
    if (window.tradeList) {
        return window.tradeList.createTradeCard(trade, showActions);
    } else {
        console.error('TradeList instance not found');
        return null;
    }
};
// TradeListインスタンスもグローバルに公開
window.tradeList = tradeList;
console.log('✅ TradeList bridge connections established');

// ==================== 円建て損益編集の修正 ====================
// 既存のeditYenProfitLoss関数を正しく呼び出す修正
console.log('=== 既存デザインを使用する修正 ===');

// 1. 作成したカスタムモーダルを削除
const customModal = document.getElementById('yenProfitLossModal');
if (customModal && !customModal.querySelector('.yen-profit-modal')) {
    customModal.remove();
    console.log('カスタムモーダルを削除');
}

// 2. script.jsのオリジナル関数を探して保存
if (!window.originalEditYenProfitLoss && window.editYenProfitLoss) {
    window.originalEditYenProfitLoss = window.editYenProfitLoss;
}

// 3. editYenProfitLoss関数の修正（既存機能を呼び出す）
window.editYenProfitLoss = function(tradeId) {
    const trade = trades.find(t => t.id === String(tradeId));
    if (!trade) {
        console.error('トレードが見つかりません:', tradeId);
        return;
    }
    
    // 通常トレードでもyenProfitLossを初期化（エラー回避）
    if (!trade.yenProfitLoss) {
        trade.yenProfitLoss = {
            profitLoss: 0,
            swap: 0,
            commission: 0,
            netProfit: 0
        };
        console.log('yenProfitLossを初期化');
        
        // データを保存（重要）
        saveTrades();
    }
    
    // script.jsの元の処理を実行
    if (typeof window.originalEditYenProfitLoss === 'function') {
        console.log('既存のeditYenProfitLoss関数を呼び出し');
        return window.originalEditYenProfitLoss.call(this, tradeId);
    } else {
        console.error('オリジナルのeditYenProfitLoss関数が見つかりません');
    }
};

// 4. saveYenProfitLoss関数も同様に修正
if (!window.originalSaveYenProfitLoss && window.saveYenProfitLoss) {
    window.originalSaveYenProfitLoss = window.saveYenProfitLoss;
}

window.saveYenProfitLoss = function(tradeId) {
    // 文字列に変換
    if (typeof tradeId !== 'string') {
        tradeId = String(tradeId);
    }
    
    // 元の関数を呼び出し
    if (typeof window.originalSaveYenProfitLoss === 'function') {
        return window.originalSaveYenProfitLoss.call(this, tradeId);
    }
};

// 5. グローバル変数定義（onclick属性エラー対策）
if (window.trades) {
    trades.forEach(trade => {
        if (trade.id) {
            window[trade.id] = trade.id;
        }
    });
}

console.log('✅ 既存デザインを使用する修正完了');
console.log('通常トレードの円建て損益編集ボタンをクリックしてください');

// ========== TradeEdit.js 関連 ==========
// TradeEditインスタンスの作成
const tradeEdit = new window.TradeEdit();

// グローバル関数として公開（互換性維持）
window.editTrade = function(tradeId) {
    console.log('editTrade called via bridge');
    tradeEdit.editTrade(tradeId);
};

window.updateTrade = function() {
    console.log('updateTrade called via bridge');
    tradeEdit.updateTrade();
};

window.deleteTrade = function(tradeId) {
    console.log('deleteTrade called via bridge');
    tradeEdit.deleteTrade(tradeId);
};

window.saveBasicInfo = function(tradeId) {
    console.log('saveBasicInfo called via bridge');
    tradeEdit.saveBasicInfo(tradeId);
};

window.saveReasons = function(tradeId) {
    console.log('saveReasons called via bridge');
    tradeEdit.saveReasons(tradeId);
};

window.saveExitInfo = function(tradeId) {
    console.log('saveExitInfo called via bridge');
    tradeEdit.saveExitInfo(tradeId);
};

window.closeTradeEditModal = function() {
    console.log('closeTradeEditModal called via bridge');
    tradeEdit.closeTradeEditModal();
};

window.removeExitInEdit = function(button) {
    console.log('removeExitInEdit called via bridge');
    tradeEdit.removeExitInEdit(button);
};

window.addExitEntryInEdit = function() {
    console.log('addExitEntryInEdit called via bridge');
    tradeEdit.addExitEntryInEdit();
};

window.editTradeReasons = function(tradeId) {
    console.log('editTradeReasons called via bridge');
    tradeEdit.editTradeReasons(tradeId);
};

window.editBasicInfo = function(tradeId) {
    console.log('editBasicInfo called via bridge');
    tradeEdit.editBasicInfo(tradeId);
};

window.editExitInfo = function(tradeId) {
    console.log('editExitInfo called via bridge');
    tradeEdit.editExitInfo(tradeId);
};

// TradeEditインスタンスもグローバルに公開
window.tradeEdit = tradeEdit;
console.log('✅ TradeEdit bridge connections established');

// エイリアス関数（互換性維持）
window.editTradeBasicInfo = function(tradeId) {
    console.log('editTradeBasicInfo called via bridge');
    tradeEdit.editBasicInfo(tradeId);
};

window.editTradeExitInfo = function(tradeId) {
    console.log('editTradeExitInfo called via bridge');
    tradeEdit.editExitInfo(tradeId);
};

console.log('✅ TradeEdit エイリアス関数追加');

// ========================================
// TradeEdit.js エイリアス関数（名前の不一致を解決）
// TradeDetail.jsが期待する関数名との互換性維持
// 作成日: 2025-09-28
// ========================================

// 📍 editEntryInfo → editBasicInfo のエイリアス
window.editEntryInfo = function(tradeId) {
    console.log('editEntryInfo called via bridge (alias for editBasicInfo)');
    
    // トレードIDの自動解決
    if (!tradeId) {
        tradeId = window.currentEditingTradeId || window.currentTradeId;
        // TradeDetailモーダルから取得を試みる
        const modal = document.getElementById('tradeDetailModal');
        if (modal && modal.dataset && modal.dataset.tradeId) {
            tradeId = modal.dataset.tradeId;
        }
    }
    
    // 実際の関数（editBasicInfo）を呼び出し
    if (typeof window.editBasicInfo === 'function') {
        window.editBasicInfo(tradeId);
    } else if (window.tradeEdit && typeof window.tradeEdit.editBasicInfo === 'function') {
        window.tradeEdit.editBasicInfo(tradeId);
    } else {
        console.error('editBasicInfo function not found');
        showToast('エラー: 編集機能が見つかりません', 'error');
    }
};

// 🎯 editEntryReason → editTradeReasons のエイリアス
window.editEntryReason = function(tradeId) {
    console.log('editEntryReason called via bridge (alias for editTradeReasons)');
    
    // トレードIDの自動解決
    if (!tradeId) {
        tradeId = window.currentEditingTradeId || window.currentTradeId;
        // TradeDetailモーダルから取得を試みる
        const modal = document.getElementById('tradeDetailModal');
        if (modal && modal.dataset && modal.dataset.tradeId) {
            tradeId = modal.dataset.tradeId;
        }
    }
    
    // 実際の関数（editTradeReasons）を呼び出し
    if (typeof window.editTradeReasons === 'function') {
        window.editTradeReasons(tradeId);
    } else if (window.tradeEdit && typeof window.tradeEdit.editTradeReasons === 'function') {
        window.tradeEdit.editTradeReasons(tradeId);
    } else {
        console.error('editTradeReasons function not found');
        showToast('エラー: 編集機能が見つかりません', 'error');
    }
};

console.log('✅ TradeDetail-TradeEdit 互換性エイリアス追加完了');

// ========== TradeExit.js 関連 ==========
// TradeExitインスタンスの作成
const tradeExit = new window.TradeExit();

// グローバル関数として公開（互換性維持）
window.openExitModal = function(tradeId) {
    console.log('openExitModal called via bridge:', tradeId);
    tradeExit.openExitModal(tradeId);
};

window.addExitEntry = function() {
    console.log('addExitEntry called via bridge');
    tradeExit.addExitEntry();
};

window.removeExitEntry = function(button) {
    console.log('removeExitEntry called via bridge');
    tradeExit.removeExitEntry(button);
};

window.saveExitRecord = function(tradeId) {
    console.log('saveExitRecord called via bridge:', tradeId);
    tradeExit.saveExitRecord(tradeId);
};

window.closeExitModal = function() {
    console.log('closeExitModal called via bridge');
    tradeExit.closeExitModal();
};

// saveExitのエイリアス（互換性維持）
window.saveExit = function(tradeId) {
    console.log('saveExit called via bridge (alias):', tradeId);
    tradeExit.saveExitRecord(tradeId);
};

// TradeExitインスタンスもグローバルに公開
window.tradeExit = tradeExit;
console.log('✅ TradeExit bridge connections established');

// ========== TradeDetail.js 関連 ==========
// TradeDetailインスタンスの作成
const tradeDetail = new window.TradeDetail();
// グローバル関数として公開（互換性維持）
window.showTradeDetail = function(tradeOrId) {
    console.log('showTradeDetail called via bridge');
    tradeDetail.showTradeDetail(tradeOrId);
};
window.closeTradeDetailModal = function() {
    console.log('closeTradeDetailModal called via bridge');
    tradeDetail.closeTradeDetailModal();
};
window.editReflection = function(tradeId) {
    console.log('editReflection called via bridge');
    tradeDetail.editReflection(tradeId);
};
window.saveReflectionEdit = function() {
    console.log('saveReflectionEdit called via bridge');
    tradeDetail.saveReflectionEdit();
};
window.closeReflectionEditModal = function() {
    console.log('closeReflectionEditModal called via bridge');
    tradeDetail.closeReflectionEditModal();
};
// TradeDetailインスタンスもグローバルに公開
window.tradeDetail = tradeDetail;
console.log('✅ TradeDetail bridge connections established');

// ========== フィルター関数の公開 ==========
window.filterTrades = function() {
    console.log('filterTrades called via bridge');
    if (window.tradeList) {
        window.tradeList.filterTrades();
    } else {
        console.warn('TradeList instance not found');
    }
};

// updateFilterOptionsも公開（フィルター選択肢の更新用）
window.updateFilterOptions = function() {
    console.log('updateFilterOptions called via bridge');
    if (window.tradeList) {
        window.tradeList.updateFilterOptions();
    } else {
        console.warn('TradeList instance not found');
    }
};

// ページロード後に再度上書き（念のため）
document.addEventListener('DOMContentLoaded', function() {
    window.displayAllTrades = function() {
        console.log('displayAllTrades called via bridge (FIXED after DOM)');
        if (window.tradeList) {
            window.tradeList.displayAllTrades('tradeRecordsList');
        }
    };
});

// ===================================
// Step 3.5: 価格入力のstep属性最適化
// ===================================
// 追加日: 2025-11-22
// 目的: 通貨ペア選択時に価格入力欄のstep属性を自動で最適化

/**
 * 通貨ペア選択時に価格入力欄のstep属性を更新
 * @param {string} pairId - 通貨ペアID（例: 'usdjpy'）
 */
/**
 * 価格入力欄のstep属性を更新
 * @param {string|number} pairIdOrPipValue - 通貨ペアID（文字列）またはpipValue（数値）
 */
window.updatePriceInputSteps = function(pairIdOrPipValue) {
    try {
        let stepValue;
        
        // 引数が数値の場合は直接pipValueとして使用
        if (typeof pairIdOrPipValue === 'number') {
            stepValue = pairIdOrPipValue;
            console.log(`✅ Price step updated (direct): ${stepValue}`);
        } else {
            // 文字列の場合はpairIdとして検索
            const pairId = pairIdOrPipValue;
            
            // ID形式または表示名形式でマッチを試みる
            let preset = null;
            if (window.getPresetPairById) {
                preset = window.getPresetPairById(pairId);
            }
            
            // マッチしない場合は表示名形式で再検索
            if (!preset && window.PRESET_CURRENCY_PAIRS) {
                const normalizedValue = pairId.toLowerCase().replace('/', '');
                preset = window.PRESET_CURRENCY_PAIRS.find(p => 
                    p.id === pairId ||
                    p.id === normalizedValue ||
                    p.name === pairId ||
                    p.name.toLowerCase() === pairId.toLowerCase()
                );
            }
            
            stepValue = preset ? preset.pipValue : 0.00001;
            console.log(`✅ Price step updated: ${stepValue} for ${pairId}`);
        }
        
        // 価格入力欄のstep属性を更新
        const entryPrice = document.getElementById('entryPrice');
        const stopLoss = document.getElementById('stopLoss');
        const takeProfit = document.getElementById('takeProfit');
        
        if (entryPrice) entryPrice.step = stepValue;
        if (stopLoss) stopLoss.step = stepValue;
        if (takeProfit) takeProfit.step = stepValue;
        
    } catch (error) {
        console.error('updatePriceInputSteps error:', error);
    }
};

// ===================================
// イベントリスナーの追加
// ===================================
// ページロード時に通貨ペア入力欄にイベントリスナーを追加

document.addEventListener('DOMContentLoaded', function() {
    const pairInput = document.getElementById('pair');
    
    if (pairInput) {
        // 入力時（リアルタイム更新）
        pairInput.addEventListener('input', function(e) {
            const value = e.target.value.trim().toLowerCase().replace('/', '');
            if (value) {
                window.updatePriceInputSteps(value);
            }
        });
        
        // 変更時（フォーカス外れ時）
        pairInput.addEventListener('change', function(e) {
            const value = e.target.value.trim().toLowerCase().replace('/', '');
            if (value) {
                window.updatePriceInputSteps(value);
            }
        });
        
        console.log('✅ Price step event listeners added to #pair');
    } else {
        console.warn('⚠️ #pair element not found');
    }
});

console.log('✅ Step 3.5: Price step optimization loaded');