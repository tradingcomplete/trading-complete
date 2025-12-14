// js/part2/TradeEntry.js
// Part 2 モジュール化 第3段階 - 新規エントリー機能の分離
// 作成日: 2025/09/15

/**
 * TradeEntry クラス
 * トレード新規エントリー機能を管理
 */
class TradeEntry {
    #tradeManager;
    #validator;
    #calculator;
    #isProcessing;
    
    constructor() {
        // 依存関係の注入
        this.#tradeManager = window.tradeManager || TradeManager.getInstance();
        this.#validator = window.tradeValidator;
        this.#calculator = window.tradeCalculator;
        this.#isProcessing = false;
    }
    
    /**
     * トレード記録を保存
     * @param {Object} formData - フォームデータ（省略時は自動収集）
     * @returns {boolean} 保存成功/失敗
     */
    saveTradeRecord(formData = null) {
        // 処理中フラグチェック
        if (this.#isProcessing) {
            console.log('保存処理中です...');
            return false;
        }
        
        this.#isProcessing = true;
        
        try {
            // フォームデータの収集
            const data = formData || this.#collectFormData();
            
            // バリデーション
            if (!this.#validateTradeData(data)) {
                this.#isProcessing = false;
                return false;
            }
            
            // トレードデータの準備
            const tradeData = this.#prepareTradeData(data);
            
            // 保存処理（TradeManager経由のみ - 正規化・保存・同期を自動実行）
            const savedTrade = this.#tradeManager.addTrade(tradeData);
            
            // TradeManagerが自動的に以下を行う：
            // - 正規化
            // - localStorage保存
            // - window.trades更新（互換性のため）
            
            // UI更新
            this.#updateUIAfterSave(savedTrade);
            
            // フォームクリア
            this.clearForm();
            
            // 成功メッセージ
            this.#showSuccessMessage();
            
            return true;
            
        } catch (error) {
            console.error('トレード保存エラー:', error);
            alert('保存に失敗しました: ' + error.message);
            return false;
            
        } finally {
            this.#isProcessing = false;
        }
    }
    
    /**
     * フォームをクリア
     */
    clearForm() {
        // メインフォームのクリア
        const mainFields = [
            'entryDatetime', 'exitDatetime', 'symbol', 'pair', 'broker',  // ← 'pair'追加
            'entryPrice', 'exitPrice', 'quantity', 'profitLoss', 
            'swap', 'commission', 'netProfit', 'pips', 'rr', 
            'stopLoss', 'takeProfit', 'reasons', 'insights', 
            'improvements', 'exitReason',
            'reason1', 'reason2', 'reason3', 'scenario', 'entryEmotion'  // ← 右側フィールド追加
        ];
        
        mainFields.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = false;
                } else if (element.tagName === 'SELECT') {
                    element.selectedIndex = 0;
                } else {
                    element.value = '';
                }
            }
        });
        
        // ラジオボタンのクリア
        const radioGroups = ['direction', 'result'];
        radioGroups.forEach(name => {
            const radios = document.getElementsByName(name);
            radios.forEach(radio => radio.checked = false);
        });
        
        // チェックボックスのクリア
        const checkboxes = document.querySelectorAll('.setup-checkboxes input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        
        // 画像プレビューのクリア
        this.#clearImagePreviews();
        
        // 保存ボタンの有効化
        const saveButton = document.getElementById('saveButton');
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = '保存';
        }
        
        // デフォルト値を設定
        this.#setDefaultValues();
        
        console.log('フォームをクリアしました');
    }
    
    /**
     * デフォルト値を設定
     * @private
     */
    #setDefaultValues() {
        // 売買方向: long（買い）をデフォルトに（セレクトボックス）
        const directionSelect = document.getElementById('direction');
        if (directionSelect) {
            directionSelect.value = 'long';
        }
        
        // ロットサイズ: 1.0をデフォルトに
        const lotSizeInput = document.getElementById('lotSize');
        if (lotSizeInput) {
            lotSizeInput.value = '1.0';
        }
        
        // エントリー日時: 現在時刻をデフォルトに
        const entryTimeInput = document.getElementById('entryTime');
        if (entryTimeInput) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            entryTimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
        
        console.log('デフォルト値を設定しました');
    }
    
    /**
     * エントリー条件をチェック
     * @returns {Object} チェック結果
     */
    checkEntryConditions() {
        // テキスト入力のチェックリストをチェック
        const reasons = [
            document.getElementById('reason1')?.value || '',
            document.getElementById('reason2')?.value || '',
            document.getElementById('reason3')?.value || ''
        ];
        
        const filledReasons = reasons.filter(r => r.trim().length > 0).length;
        
        const conditions = {
            reason1: reasons[0].trim().length > 0,
            reason2: reasons[1].trim().length > 0,
            reason3: reasons[2].trim().length > 0
        };
        
        return {
            conditions: conditions,
            metConditions: filledReasons,
            totalConditions: 3,
            percentage: Math.round((filledReasons / 3) * 100),
            isValid: filledReasons >= 3  // 3つすべて入力が必要（ポチポチ病防止）
        };
    }
    
    // ==================== プライベートメソッド ====================
    
    /**
     * フォームデータを収集
     * @private
     */
    #collectFormData() {
        const formData = {};
        
        // 基本情報
        formData.entryDatetime = document.getElementById('entryTime')?.value || '';
        formData.exitDatetime = document.getElementById('exitTime')?.value || '';
        formData.symbol = document.getElementById('pair')?.value || '';
        formData.broker = document.getElementById('broker')?.value?.trim() || '';  // ← 追加
        
        // 方向（BUY/SELL）
        const directionRadio = document.querySelector('input[name="direction"]:checked');
        formData.direction = directionRadio?.value || '';
        
        // 価格情報
        formData.entryPrice = parseFloat(document.getElementById('entryPrice')?.value) || 0;
        formData.exitPrice = parseFloat(document.getElementById('exitPrice')?.value) || 0;
        formData.quantity = parseFloat(document.getElementById('quantity')?.value) || 0;
        formData.stopLoss = parseFloat(document.getElementById('stopLoss')?.value) || 0;
        formData.takeProfit = parseFloat(document.getElementById('takeProfit')?.value) || 0;
        
        // 損益情報
        formData.profitLoss = parseFloat(document.getElementById('profitLoss')?.value) || 0;
        formData.swap = parseFloat(document.getElementById('swap')?.value) || 0;
        formData.commission = parseFloat(document.getElementById('commission')?.value) || 0;
        formData.netProfit = parseFloat(document.getElementById('netProfit')?.value) || 0;
        
        // 分析情報
        formData.pips = parseFloat(document.getElementById('pips')?.value) || 0;
        formData.rr = parseFloat(document.getElementById('rr')?.value) || 0;
        
        // テキスト情報
        formData.reasons = document.getElementById('reasons')?.value || '';
        formData.insights = document.getElementById('insights')?.value || '';
        formData.improvements = document.getElementById('improvements')?.value || '';
        formData.exitReason = document.getElementById('exitReason')?.value || '';
        
        // 結果（WIN/LOSS）
        const resultRadio = document.querySelector('input[name="result"]:checked');
        formData.result = resultRadio?.value || (formData.netProfit >= 0 ? 'WIN' : 'LOSS');
        
        // エントリー条件
        formData.entryConditions = this.checkEntryConditions();
        
        // 画像
        formData.chartImages = this.#collectChartImages();
        
        return formData;
    }
    
    /**
     * トレードデータのバリデーション
     * @private
     */
    #validateTradeData(data) {
        // 必須フィールドのチェック
        if (!data.symbol) {
            alert('通貨ペアを入力してください');
            return false;
        }
        
        if (!data.direction) {
            alert('売買方向を選択してください');
            return false;
        }
        
        if (!data.entryDatetime) {
            alert('エントリー日時を入力してください');
            return false;
        }
        
        // 価格バリデーション（新規エントリー時）
        if (data.entryPrice && data.stopLoss && data.takeProfit && data.direction) {
            // validateEntryPrices関数を使用（bridge.jsで定義）
            if (window.validateEntryPrices) {
                const priceErrors = window.validateEntryPrices(
                    data.entryPrice,
                    data.stopLoss,
                    data.takeProfit,
                    data.direction
                );
                
                if (priceErrors.length > 0) {
                    alert('価格設定エラー:\n' + priceErrors.join('\n'));
                    return false;
                }
            }
        }
        
        // チェックリストバリデーション（3つの根拠が必須）
        const entryConditions = this.checkEntryConditions();
        if (!entryConditions.isValid) {
            alert(`トレードプランが不完全です。\n3つの根拠をすべて入力してください。\n\n現在：${entryConditions.metConditions}/3`);
            return false;
        }
        
        // TradeValidatorを使用した詳細バリデーション
        // if (this.#validator) {
        //     const validationResult = this.#validator.validateTrade(data);
        //     if (!validationResult.isValid) {
        //         alert('バリデーションエラー:\n' + validationResult.errors.join('\n'));
        //         return false;
        //     }
        // }
        
        return true;
    }
    
    /**
     * トレードデータの準備
     * @private
     */
    #prepareTradeData(formData) {
        // TradeManagerが正規化するので、最小限のデータ準備のみ
        const tradeData = {
            ...formData,
            id: formData.id || null,  // TradeManagerが自動生成
            
            // フォームから取得したデータをそのまま渡す
            // TradeManagerの_normalizeTradeDataが処理する
            
            // タグのみここで生成
            tags: this.#generateTags(formData),
            
            // エントリー方法の記録
            entryMethod: 'manual',
            isBulkEntry: false
        };
        
        // pipsとRRの計算は削除（TradeCalculatorに任せる）
        
        return tradeData;
    }
    
    /**
     * 保存後のUI更新
     * @private
     */
    #updateUIAfterSave(tradeData) {
        // 統計の更新
        if (typeof updateStatistics === 'function') {
            updateStatistics();
        }
        
        // トレードリストの更新
        if (typeof window.displayAllTrades === 'function') {
            window.displayAllTrades();
        }
        
        // タブの切り替え（タブ名を修正）
        if (typeof switchTab === 'function') {
            setTimeout(() => switchTab('records'), 1000);  // 'trading' → 'records'
        }
        
        console.log('トレード保存完了:', tradeData.id);
    }
    
    /**
     * 画像プレビューのクリア
     * @private
     */
    #clearImagePreviews() {
        // チャート画像1, 2, 3のクリア
        for (let i = 1; i <= 3; i++) {
            const preview = document.getElementById(`tradeChartImagePreview${i}`);
            const clearBtn = document.getElementById(`clearTradeChart${i}Btn`);
            if (preview) preview.innerHTML = '';
            if (clearBtn) clearBtn.style.display = 'none';
        }
        
        // ファイル入力のクリア
        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            input.value = '';
        });
    }
    
    /**
     * チャート画像の収集
     * @private
     */
    #collectChartImages() {
        const images = [];
        
        // チャート画像1, 2, 3を収集
        for (let i = 1; i <= 3; i++) {
            const preview = document.getElementById(`tradeChartImagePreview${i}`);
            const img = preview?.querySelector('img');
            if (img && img.src && img.src.startsWith('data:')) {
                images.push({
                    type: `chart${i}`,
                    data: img.src,
                    timestamp: new Date().toISOString()
                });
            } else {
                // 画像がない場合はnull（配列のインデックスを維持）
                images.push(null);
            }
        }
        
        return images;
    }
    
    /**
     * タグの自動生成
     * @private
     */
    #generateTags(formData) {
        const tags = [];
        
        // 通貨ペアタグ
        if (formData.symbol) {
            tags.push(formData.symbol);
        }
        
        // 結果タグ
        if (formData.result) {
            tags.push(formData.result);
        }
        
        // 曜日タグ
        if (formData.entryDatetime) {
            const date = new Date(formData.entryDatetime);
            const days = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
            tags.push(days[date.getDay()]);
        }
        
        // 時間帯タグ
        if (formData.entryDatetime) {
            const hour = new Date(formData.entryDatetime).getHours();
            if (hour >= 9 && hour < 15) {
                tags.push('東京時間');
            } else if (hour >= 15 && hour < 21) {
                tags.push('ロンドン時間');
            } else if (hour >= 21 || hour < 3) {
                tags.push('ニューヨーク時間');
            }
        }
        
        // pips範囲タグ
        if (Math.abs(formData.pips) > 50) {
            tags.push('大幅値動き');
        } else if (Math.abs(formData.pips) > 20) {
            tags.push('中程度値動き');
        } else {
            tags.push('小幅値動き');
        }
        
        return tags;
    }
    
    /**
     * 成功メッセージの表示
     * @private
     */
    #showSuccessMessage() {
        // 既存のメッセージがあれば削除
        const existingMsg = document.querySelector('.save-success-message');
        if (existingMsg) {
            existingMsg.remove();
        }
        
        // 新しいメッセージを作成
        const message = document.createElement('div');
        message.className = 'save-success-message';
        message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        message.textContent = '✅ トレード記録を保存しました';
        
        document.body.appendChild(message);
        
        // 3秒後に自動削除
        setTimeout(() => {
            message.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => message.remove(), 300);
        }, 3000);
    }

// ==================== 画像処理メソッド（追加） ====================
    
    /**
     * ペースト処理
     * @param {ClipboardEvent} e - クリップボードイベント
     */
    handlePaste(e) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const activeElement = document.activeElement;
                    if (activeElement && activeElement.closest('#new-entry')) {
                        this.processImageFile(blob, 'chart');
                    }
                }
            }
        }
    }
    
    /**
     * 画像ファイル処理
     * @param {File} file - 画像ファイル
     * @param {string} type - 画像タイプ
     */
    processImageFile(file, type) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            let compressedImage;
            
            if (type === 'chart') {
                compressedImage = await ImageHandler.compressWithPreset(e.target.result, 'icon');
            } else if (type.startsWith('tradeChart')) {
                compressedImage = await ImageHandler.compressWithPreset(e.target.result, 'chart');
            } else {
                compressedImage = await ImageHandler.compressWithPreset(e.target.result, 'note');
            }
            
            if (type === 'chart') {
                const preview = document.getElementById('chartImagePreview');
                if (preview) {
                    preview.innerHTML = `<img src="${compressedImage}" class="uploaded-image circle" alt="アップロード画像">`;
                    const clearBtn = document.getElementById('clearChartImageBtn');
                    if (clearBtn) clearBtn.style.display = 'block';
                }
            } else if (type.startsWith('tradeChart')) {
                const index = type.replace('tradeChart', '');
                const preview = document.getElementById(`tradeChartImagePreview${index}`);
                if (preview) {
                    preview.innerHTML = `<img src="${compressedImage}" style="width: 100%; height: auto; border-radius: 8px;" alt="チャート画像${index}">`;
                    const clearBtn = document.getElementById(`clearTradeChart${index}Btn`);
                    if (clearBtn) clearBtn.style.display = 'block';
                }
            }
        };
        reader.readAsDataURL(file);
    }
    
    /**
     * チャート画像クリア
     * @param {Event} event - イベント
     */
    clearChartImage(event) {
        event.stopPropagation();
        const preview = document.getElementById('chartImagePreview');
        if (preview) preview.innerHTML = '';
        const clearBtn = document.getElementById('clearChartImageBtn');
        if (clearBtn) clearBtn.style.display = 'none';
    }
    
    /**
     * トレードチャート画像クリア
     * @param {number} index - インデックス
     * @param {Event} event - イベント
     */
    clearTradeChartImage(index, event) {
        event.stopPropagation();
        const preview = document.getElementById(`tradeChartImagePreview${index}`);
        if (preview) preview.innerHTML = '';
        const clearBtn = document.getElementById(`clearTradeChart${index}Btn`);
        if (clearBtn) clearBtn.style.display = 'none';
    }
}

// インスタンスの作成と登録
window.tradeEntry = new TradeEntry();

console.log('TradeEntry.js loaded successfully');