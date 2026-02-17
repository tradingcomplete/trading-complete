// ========== NoteManagerModule.js ==========
// Part 3: 相場ノート機能のモジュール化
// Trading Complete v1.0
// 作成日: 2025-11-27
// 更新日: 2026-01-14 - セキュリティ適用（XSS対策追加）

/**
 * @module NoteManagerModule
 * @description 相場ノート機能の統合管理モジュール
 * @author AI Assistant / コンパナ
 * @version 1.0.3
 * @important UIの変更は原則禁止。見た目は既存のまま維持すること。
 */

// IIFEで囲んでクラス定義がグローバルに漏れないようにする
(function() {
'use strict';

class NoteManagerModule {
    // ================
    // プライベートフィールド
    // ================
    #notes = {};                    // ノートデータ
    #eventBus = null;               // EventBus参照
    #isEditingNote = false;         // 編集モード状態
    #editingNoteDate = null;        // 編集中のノート日付
    #autoSaveTimer = null;          // 自動保存タイマー
    #currentWeekStart = null;       // 週間表示開始日
    #selectedNoteDate = null;       // 選択中のノート日付
    #selectedDate = null;           // カレンダー選択日
    #currentCalendarDate = null;    // カレンダー表示月
    #initialized = false;           // 初期化状態
    #monthlyMemos = {               // 月メモデータ
        anomaly: {},                // アノマリー（月のみ: "1"〜"12"）
        monthly: {}                 // 月次メモ（年月: "2025-11"）
    };
    #monthlyMemoCollapseState = {   // 折りたたみ状態
        anomaly: false,             // false = 開いている（▲）
        monthly: false              // false = 開いている（▲）
    };
    #isShiftPressed = false;        // Shiftキー状態（スマートペースト用）
    #lastCopiedHTML = null;         // エディタからコピーしたHTML（装飾維持ペースト用）

    constructor() {
        this.#eventBus = window.eventBus;
        this.#initialize();
    }

    // ================
    // 初期化
    // ================
    
    #initialize() {
        this.#load();
        this.#bindEvents();
        this.#registerGlobalFunctions();
        this.#setupDOMContentLoaded();
        console.log('NoteManagerModule initialized', this.getStatus());
        this.#initialized = true;
    }

    #load() {
        // StorageValidatorで安全に読み込み - notes
        this.#notes = StorageValidator.safeLoad(
            'notes',
            {},
            StorageValidator.isObject
        );
        
        // グローバルにも反映（互換性）
        window.notes = this.#notes;
        
        // StorageValidatorで安全に読み込み - monthlyMemos
        this.#monthlyMemos = StorageValidator.safeLoad(
            'monthlyMemos',
            { anomaly: {}, monthly: {} },
            StorageValidator.isMonthlyMemosFormat
        );
        // 構造の保証
        if (!this.#monthlyMemos.anomaly) this.#monthlyMemos.anomaly = {};
        if (!this.#monthlyMemos.monthly) this.#monthlyMemos.monthly = {};
        
        // StorageValidatorで安全に読み込み - collapseState
        this.#monthlyMemoCollapseState = StorageValidator.safeLoad(
            'monthlyMemoCollapseState',
            { anomaly: false, monthly: false },
            StorageValidator.isObject
        );
        
        console.log(`NoteManagerModule: ${Object.keys(this.#notes).length}件のノートを読み込み`);
    }

    #save() {
        localStorage.setItem('notes', JSON.stringify(this.#notes));
        // グローバルにも反映（過渡期）
        window.notes = this.#notes;
    }

    /**
     * ノートをlocalStorageとSupabaseに保存（URL更新時用）
     * @param {string} dateStr - 日付
     * @param {Object} note - ノートデータ
     */
    async #saveNoteToStorageAndCloud(dateStr, note) {
        // localStorageに保存
        this.#notes[dateStr] = note;
        this.#save();
        
        // Supabaseにも保存（SyncModuleがあれば）
        if (window.SyncModule?.saveNote) {
            try {
                await window.SyncModule.saveNote(dateStr, note);
                console.log('[NoteManagerModule] 更新されたURLをクラウドに保存');
            } catch (e) {
                console.warn('[NoteManagerModule] クラウド保存エラー:', e);
            }
        }
    }

    /**
     * localStorageからデータを再読み込みしてUIを更新
     * クラウド同期後に呼び出される
     */
    #reloadFromLocalStorage() {
        // localStorageから再読み込み
        this.#notes = StorageValidator.safeLoad(
            'notes',
            {},
            StorageValidator.isObject
        );
        
        // グローバルにも反映
        window.notes = this.#notes;
        
        console.log(`[NoteManagerModule] 再読み込み完了: ${Object.keys(this.#notes).length}件`);
        
        // UIを更新
        this.updateWeeklyPreview();
        this.updateCalendar();
    }

    #saveMonthlyMemos() {
        localStorage.setItem('monthlyMemos', JSON.stringify(this.#monthlyMemos));
        
        // Supabase自動同期トリガー
        this.#eventBus?.emit('settings:changed', { source: 'monthlyMemos' });
    }

    #saveCollapseState() {
        localStorage.setItem('monthlyMemoCollapseState', JSON.stringify(this.#monthlyMemoCollapseState));
    }

    /**
     * 要素のスタイルを正規化（色・サイズ・取消線をCSS変数に統一）
     * @param {HTMLElement} el - 対象要素
     * @private
     */
    #normalizeElementStyle(el) {
        const color = el.style.color;
        const bgColor = el.style.backgroundColor;
        const fontSize = el.style.fontSize;
        const tagName = el.tagName;
        const textDeco = el.style.textDecoration || el.style.textDecorationLine;
        
        let newStyle = '';
        
        // 赤系（red, #EF5350, #F44336, rgb(239,83,80), rgb(244,67,54), rgb(255,0,0)）
        if (color === 'red' || 
            (color && (color.includes('239, 83, 80') || color.includes('244, 67, 54') || color.includes('255, 0, 0')))) {
            newStyle += 'color: var(--editor-color-red);';
        }
        // 青系（blue, #64B5F6, #1976D2, rgb(100,181,246), rgb(25,118,210), rgb(0,0,255)）
        else if (color === 'blue' || 
                 (color && (color.includes('100, 181, 246') || color.includes('25, 118, 210') || color.includes('0, 0, 255')))) {
            newStyle += 'color: var(--editor-color-blue);';
        }
        // 緑系（green, #81C784, #388E3C, rgb(129,199,132), rgb(56,142,60), rgb(0,128,0)）
        else if (color === 'green' || 
                 (color && (color.includes('129, 199, 132') || color.includes('56, 142, 60') || color.includes('0, 128, 0')))) {
            newStyle += 'color: var(--editor-color-green);';
        }
        
        // 黄マーカー（yellow, #FFD54F, #FFF59D, rgb(255,213,79), rgb(255,245,157)）
        if (bgColor && (bgColor.includes('yellow') || bgColor.includes('255, 213, 79') || bgColor.includes('255, 245, 157'))) {
            newStyle += 'background: var(--editor-highlight-bg); color: var(--editor-highlight-text);';
        }
        
        // フォントサイズ（0.9em, 1.1em, 1.3em）
        if (fontSize) {
            newStyle += `font-size: ${fontSize};`;
        }
        
        // 取り消し線（<s>, <strike>タグ、または text-decoration: line-through）
        if (tagName === 'S' || tagName === 'STRIKE' || (textDeco && textDeco.includes('line-through'))) {
            newStyle += 'text-decoration: line-through;';
        }
        
        if (newStyle) {
            el.setAttribute('style', newStyle);
        } else {
            el.removeAttribute('style');
        }
    }

    // ================
    // Public API - データアクセス
    // ================

    /**
     * 指定日付のノートを取得
     * @param {string} dateStr - 日付文字列 (YYYY-MM-DD)
     * @returns {Object|null} ノートデータまたはnull
     */
    getNote(dateStr) {
        return this.#notes[dateStr] || null;
    }

    /**
     * 全ノートを取得（コピーを返す）
     * @returns {Object} ノートオブジェクトのコピー
     */
    getAllNotes() {
        return { ...this.#notes };
    }

    /**
     * ノート数を取得
     * @returns {number} ノート数
     */
    getNoteCount() {
        return Object.keys(this.#notes).length;
    }

    /**
     * 画像の題名・説明を更新
     * @param {string} dateStr - 日付文字列
     * @param {number} index - 画像インデックス
     * @param {string} title - 新しい題名
     * @param {string} description - 新しい説明
     * @returns {boolean} 成功したかどうか
     */
    updateImageCaption(dateStr, index, title, description) {
        const note = this.getNote(dateStr);
        if (!note || !note.images || !note.images[index]) {
            return false;
        }
        
        const images = [...note.images];
        const currentImg = images[index];
        
        // 新形式に更新
        const updatedImg = window.updateImageCaption 
            ? window.updateImageCaption(currentImg, title, description)
            : { src: window.getImageSrc(currentImg), title, description };
        
        images[index] = updatedImg;
        note.images = images;
        
        // tempNoteEditImages も更新（編集画面のサムネイル用）
        const tempKey = 'noteEdit_' + (index + 1);
        if (window.tempNoteEditImages && window.tempNoteEditImages[tempKey]) {
            window.tempNoteEditImages[tempKey] = updatedImg;
        }
        
        // サムネイル下のキャプション表示を更新
        const noteImages = document.getElementById('noteImages');
        if (noteImages) {
            const items = noteImages.querySelectorAll('.note-image-item');
            if (items[index]) {
                let titleEl = items[index].querySelector('.note-image-title');
                if (titleEl) {
                    titleEl.textContent = title || '';
                }
            }
        }
        
        // 保存
        this.#saveNoteToStorageAndCloud(dateStr, note);
        
        // 詳細表示を更新
        this.displayNoteDetail(dateStr);
        
        return true;
    }

    /**
     * 画像を削除
     * @param {string} dateStr - ノートの日付キー
     * @param {number} index - 画像インデックス（0始まり）
     * @returns {boolean} 成功/失敗
     */
    deleteImage(dateStr, index) {
        const note = this.getNote(dateStr);
        if (!note || !note.images || !note.images[index]) {
            return false;
        }
        
        const images = [...note.images];
        images.splice(index, 1);  // 該当画像を削除
        
        note.images = images;
        
        // 保存
        this.#saveNoteToStorageAndCloud(dateStr, note);
        
        // 詳細表示を更新
        this.displayNoteDetail(dateStr);
        
        return true;
    }

    /**
     * ノートの画像を置換
     * @param {string} dateStr - 日付文字列
     * @param {number} index - 画像インデックス
     * @param {Object|string} newImageData - 新しい画像データ
     * @returns {boolean} 成功/失敗
     */
    replaceNoteImage(dateStr, index, newImageData) {
        const note = this.getNote(dateStr);
        if (!note) {
            console.error('[NoteManagerModule] ノートが見つかりません:', dateStr);
            return false;
        }
        
        // images配列を初期化（なければ空配列）
        const images = note.images ? [...note.images] : [];
        
        // 配列を必要なサイズまで拡張（nullで埋める）
        while (images.length <= index) {
            images.push(null);
        }
        
        // 画像を置換
        images[index] = newImageData;
        
        // ノートを更新
        note.images = images;
        note.updatedAt = new Date().toISOString();
        
        // tempNoteEditImages も更新（編集画面のサムネイル用）
        const tempKey = 'noteEdit_' + (index + 1);
        if (window.tempNoteEditImages) {
            window.tempNoteEditImages[tempKey] = newImageData;
        }
        
        // サムネイル下のキャプション表示を更新
        const title = newImageData?.title || '';
        const noteImages = document.getElementById('noteImages');
        if (noteImages) {
            const items = noteImages.querySelectorAll('.note-image-item');
            if (items[index]) {
                let titleEl = items[index].querySelector('.note-image-title');
                if (titleEl) {
                    titleEl.textContent = title;
                }
            }
        }
        
        // 保存（ストレージとクラウド）
        this.#saveNoteToStorageAndCloud(dateStr, note);
        
        // 週間プレビューを更新
        this.updateWeeklyPreview();
        
        // 詳細表示を更新（編集中でない場合）
        if (!this.#isEditingNote) {
            this.displayNoteDetail(dateStr);
        }
        
        console.log('[NoteManagerModule] 画像を置換しました:', dateStr, 'index:', index);
        return true;
    }

    /**
     * デバッグ用ステータス取得
     * @returns {Object} モジュール状態
     */
    getStatus() {
        return {
            noteCount: Object.keys(this.#notes).length,
            initialized: this.#initialized,
            isEditing: this.#isEditingNote,
            editingDate: this.#editingNoteDate,
            selectedNoteDate: this.#selectedNoteDate,
            selectedDate: this.#selectedDate,
            currentWeekStart: this.#currentWeekStart,
            hasEventBus: !!this.#eventBus,
            // 月メモ情報を追加
            monthlyMemos: {
                anomalyCount: Object.keys(this.#monthlyMemos.anomaly).length,
                monthlyCount: Object.keys(this.#monthlyMemos.monthly).length
            },
            collapseState: { ...this.#monthlyMemoCollapseState }
        };
    }

    // ================
    // Public API - 検索機能
    // ================

    /**
     * ノートをキーワードで検索
     * @param {string} keyword - 検索キーワード
     * @returns {Array} 検索結果の配列
     */
    searchNotes(keyword) {
        if (!keyword || keyword.trim() === '') {
            return [];
        }
        
        const searchTerm = keyword.trim().toLowerCase();
        const results = [];
        
        for (const [dateStr, note] of Object.entries(this.#notes)) {
            // HTMLタグを除去してプレーンテキストで検索
            const memoText = this.#stripHTML(note.memo || '').toLowerCase();
            const marketViewText = this.#stripHTML(note.marketView || '').toLowerCase();
            
            const memoMatch = memoText.includes(searchTerm);
            const marketViewMatch = marketViewText.includes(searchTerm);
            
            if (memoMatch || marketViewMatch) {
                results.push({
                    date: dateStr,
                    preview: this.#extractPreview(note, keyword),
                    matchIn: memoMatch ? 'memo' : 'marketView'
                });
            }
        }
        
        // 日付降順でソート（新しい順）
        return results.sort((a, b) => b.date.localeCompare(a.date));
    }

    /**
     * HTMLタグを除去
     * @param {string} html - HTML文字列
     * @returns {string} プレーンテキスト
     */
    #stripHTML(html) {
        if (!html) return '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        return tempDiv.textContent || tempDiv.innerText || '';
    }

    /**
     * プレビューテキストを抽出（キーワード前後20文字）
     * @param {Object} note - ノートオブジェクト
     * @param {string} keyword - 検索キーワード
     * @returns {string} プレビューテキスト
     */
    #extractPreview(note, keyword) {
        const text = this.#stripHTML((note.memo || '') + ' ' + (note.marketView || ''));
        const lowerText = text.toLowerCase();
        const lowerKeyword = keyword.toLowerCase();
        const index = lowerText.indexOf(lowerKeyword);
        
        if (index === -1) return '';
        
        const start = Math.max(0, index - 20);
        const end = Math.min(text.length, index + keyword.length + 20);
        
        let preview = '';
        if (start > 0) preview += '...';
        preview += text.slice(start, end);
        if (end < text.length) preview += '...';
        
        return preview;
    }

    // ================
    // Public API - 月メモ機能
    // ================

    /**
     * アノマリーメモを取得（毎年共通）
     * @param {number|string} month - 月（1〜12）
     * @returns {string} メモ内容
     */
    getAnomalyMemo(month) {
        const key = String(month);
        return this.#monthlyMemos.anomaly[key] || '';
    }

    /**
     * 月次メモを取得（年月別）
     * @param {string} yearMonth - 年月（"2025-11"形式）
     * @returns {string} メモ内容
     */
    getMonthlyMemo(yearMonth) {
        return this.#monthlyMemos.monthly[yearMonth] || '';
    }

    /**
     * アノマリーメモを保存
     * @param {number|string} month - 月（1〜12）
     * @param {string} text - メモ内容
     */
    saveAnomalyMemo(month, text) {
        const key = String(month);
        if (text && text.trim()) {
            this.#monthlyMemos.anomaly[key] = text.trim();
        } else {
            delete this.#monthlyMemos.anomaly[key];
        }
        this.#saveMonthlyMemos();
        
        // EventBus発火
        this.#eventBus?.emit('monthlyMemo:anomalySaved', { month: key, text: text });
    }

    /**
     * 月次メモを保存
     * @param {string} yearMonth - 年月（"2025-11"形式）
     * @param {string} text - メモ内容
     */
    saveMonthlyMemo(yearMonth, text) {
        if (text && text.trim()) {
            this.#monthlyMemos.monthly[yearMonth] = text.trim();
        } else {
            delete this.#monthlyMemos.monthly[yearMonth];
        }
        this.#saveMonthlyMemos();
        
        // EventBus発火
        this.#eventBus?.emit('monthlyMemo:monthlySaved', { yearMonth: yearMonth, text: text });
    }

    /**
     * 折りたたみ状態を取得
     * @param {string} type - 'anomaly' または 'monthly'
     * @returns {boolean} true = 閉じている, false = 開いている
     */
    getCollapseState(type) {
        return this.#monthlyMemoCollapseState[type] || false;
    }

    /**
     * 折りたたみ状態を設定
     * @param {string} type - 'anomaly' または 'monthly'
     * @param {boolean} collapsed - true = 閉じる, false = 開く
     */
    setCollapseState(type, collapsed) {
        this.#monthlyMemoCollapseState[type] = collapsed;
        this.#saveCollapseState();
    }

    /**
     * 折りたたみ状態をトグル
     * @param {string} type - 'anomaly' または 'monthly'
     * @returns {boolean} 新しい状態
     */
    toggleCollapseState(type) {
        const newState = !this.#monthlyMemoCollapseState[type];
        this.setCollapseState(type, newState);
        return newState;
    }

    /**
     * 現在の日付から月情報を取得
     * @returns {Object} { month: 数値, yearMonth: "YYYY-MM" }
     */
    getCurrentMonthInfo() {
        const noteDateElement = document.getElementById('noteDate');
        let date = new Date();
        
        if (noteDateElement && noteDateElement.value) {
            date = new Date(noteDateElement.value);
        }
        
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
        
        return { month, year, yearMonth };
    }

    // ================
    // Public API - 月メモUI操作
    // ================

    /**
     * 月メモ表示を更新
     */
    updateMonthlyMemoDisplay() {
        const { month, year, yearMonth } = this.getCurrentMonthInfo();
        
        // タイトル更新
        const titleElement = document.getElementById('monthlyMemoTitle');
        if (titleElement) {
            titleElement.textContent = `📅 ${month}月のメモ`;
        }
        
        // 月次メモのラベル更新
        const monthlyLabel = document.getElementById('monthlySectionLabel');
        if (monthlyLabel) {
            monthlyLabel.textContent = `${year}年${month}月`;
        }
        
        // アノマリーメモ表示
        const anomalyContent = document.getElementById('anomalyContent');
        if (anomalyContent) {
            const anomalyMemo = this.getAnomalyMemo(month);
            if (anomalyMemo) {
                anomalyContent.innerHTML = `<div class="memo-text">${this.#escapeHTML(anomalyMemo).replace(/\n/g, '<br>')}</div>`;
            } else {
                anomalyContent.innerHTML = `<div class="memo-placeholder" onclick="openMonthlyMemoEditModal('anomaly')">📝 メモを追加...</div>`;
            }
        }
        
        // 月次メモ表示
        const monthlyContent = document.getElementById('monthlyContent');
        if (monthlyContent) {
            const monthlyMemo = this.getMonthlyMemo(yearMonth);
            if (monthlyMemo) {
                monthlyContent.innerHTML = `<div class="memo-text">${this.#escapeHTML(monthlyMemo).replace(/\n/g, '<br>')}</div>`;
            } else {
                monthlyContent.innerHTML = `<div class="memo-placeholder" onclick="openMonthlyMemoEditModal('monthly')">📝 メモを追加...</div>`;
            }
        }
        
        // 折りたたみ状態を適用
        this.#applyCollapseState();
    }

    /**
     * HTMLエスケープ
     * @param {string} text - エスケープする文字列
     * @returns {string} エスケープ済み文字列
     */
    #escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 折りたたみ状態を適用
     */
    #applyCollapseState() {
        const anomalySection = document.getElementById('anomalySection');
        const monthlySection = document.getElementById('monthlySection');
        const anomalyIcon = document.getElementById('anomalyCollapseIcon');
        const monthlyIcon = document.getElementById('monthlyCollapseIcon');
        
        // アノマリー
        if (anomalySection && anomalyIcon) {
            if (this.getCollapseState('anomaly')) {
                anomalySection.classList.add('collapsed');
                anomalyIcon.textContent = '▼';
            } else {
                anomalySection.classList.remove('collapsed');
                anomalyIcon.textContent = '▲';
            }
        }
        
        // 月次
        if (monthlySection && monthlyIcon) {
            if (this.getCollapseState('monthly')) {
                monthlySection.classList.add('collapsed');
                monthlyIcon.textContent = '▼';
            } else {
                monthlySection.classList.remove('collapsed');
                monthlyIcon.textContent = '▲';
            }
        }
    }

    /**
     * 月メモセクションの折りたたみ切替
     * @param {string} type - 'anomaly' または 'monthly'
     */
    toggleMonthlyMemoSection(type) {
        const collapsed = this.toggleCollapseState(type);
        this.#applyCollapseState();
    }

    // ================
    // Public API - 検索モーダル操作
    // ================

    /**
     * 検索モーダルを開く
     */
    openNoteSearchModal() {
        const modal = document.getElementById('noteSearchModal');
        if (modal) {
            modal.style.display = 'flex';
            const input = document.getElementById('noteSearchInput');
            if (input) {
                input.value = '';
                input.focus();
            }
            // 結果をクリア
            const results = document.getElementById('noteSearchResults');
            if (results) {
                results.innerHTML = `
                    <div class="search-placeholder">
                        <p>🔍 キーワードを入力して検索</p>
                    </div>
                `;
            }
        }
    }

    /**
     * 検索モーダルを閉じる
     */
    closeNoteSearchModal() {
        const modal = document.getElementById('noteSearchModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * 検索を実行
     */
    executeNoteSearch() {
        const input = document.getElementById('noteSearchInput');
        const resultsContainer = document.getElementById('noteSearchResults');
        
        if (!input || !resultsContainer) return;
        
        const keyword = input.value.trim();
        
        if (!keyword) {
            resultsContainer.innerHTML = `
                <div class="search-placeholder">
                    <p>🔍 キーワードを入力して検索</p>
                </div>
            `;
            return;
        }
        
        const results = this.searchNotes(keyword);
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-no-results">
                    <p>🔍 「${this.#escapeHTML(keyword)}」に一致するノートが見つかりませんでした</p>
                </div>
            `;
            return;
        }
        
        // 結果を表示
        let html = `<div class="search-result-count">${results.length}件のノートが見つかりました</div>`;
        
        results.forEach(result => {
            // キーワードをハイライト
            const highlightedPreview = this.#highlightKeyword(result.preview, keyword);
            
            html += `
                <div class="search-result-item" onclick="jumpToNoteFromSearch('${result.date}')">
                    <div class="search-result-info">
                        <div class="search-result-date">${result.date}</div>
                        <div class="search-result-preview">${highlightedPreview}</div>
                    </div>
                    <span class="search-result-arrow">→</span>
                </div>
            `;
        });
        
        resultsContainer.innerHTML = html;
    }

    /**
     * キーワードをハイライト
     * @param {string} text - テキスト
     * @param {string} keyword - キーワード
     * @returns {string} ハイライト済みHTML
     */
    #highlightKeyword(text, keyword) {
        if (!text || !keyword) return text;
        
        const escapedText = this.#escapeHTML(text);
        const escapedKeyword = this.#escapeHTML(keyword);
        const regex = new RegExp(`(${escapedKeyword})`, 'gi');
        
        return escapedText.replace(regex, '<mark>$1</mark>');
    }

    /**
     * 検索結果からノートにジャンプ
     * @param {string} dateStr - 日付
     */
    jumpToNoteFromSearch(dateStr) {
        // モーダルを閉じる
        this.closeNoteSearchModal();
        
        // 日付を設定
        const noteDateElement = document.getElementById('noteDate');
        if (noteDateElement) {
            noteDateElement.value = dateStr;
        }
        
        // ノートを読み込み
        this.loadNoteForDate(dateStr);
        
        // 週間プレビューを更新
        this.selectNoteDate(dateStr);
        
        // 月メモも更新
        this.updateMonthlyMemoDisplay();
        
        // トースト表示
        if (typeof showToast === 'function') {
            showToast(`${dateStr} のノートを表示しました`, 'success');
        }
    }

    // ================
    // Public API - 月メモ編集モーダル操作
    // ================

    /**
     * 月メモ編集モーダルを開く
     * @param {string} type - 'anomaly' または 'monthly'
     */
    openMonthlyMemoEditModal(type) {
        const modal = document.getElementById('monthlyMemoEditModal');
        const title = document.getElementById('monthlyMemoEditTitle');
        const textarea = document.getElementById('monthlyMemoEditTextarea');
        
        if (!modal || !textarea) return;
        
        const { month, year, yearMonth } = this.getCurrentMonthInfo();
        
        // 編集中のタイプを保存
        modal.dataset.editType = type;
        modal.dataset.editKey = type === 'anomaly' ? String(month) : yearMonth;
        
        // タイトル設定
        if (title) {
            if (type === 'anomaly') {
                title.textContent = `🔄 ${month}月のアノマリー（毎年共通）`;
            } else {
                title.textContent = `📝 ${year}年${month}月のメモ`;
            }
        }
        
        // 既存の値を設定
        if (type === 'anomaly') {
            textarea.value = this.getAnomalyMemo(month);
        } else {
            textarea.value = this.getMonthlyMemo(yearMonth);
        }
        
        modal.style.display = 'flex';
        textarea.focus();
    }

    /**
     * 月メモ編集モーダルを閉じる
     */
    closeMonthlyMemoEditModal() {
        const modal = document.getElementById('monthlyMemoEditModal');
        if (modal) {
            modal.style.display = 'none';
            delete modal.dataset.editType;
            delete modal.dataset.editKey;
        }
    }

    /**
     * 月メモを保存（モーダルから）
     */
    saveMonthlyMemoFromModal() {
        const modal = document.getElementById('monthlyMemoEditModal');
        const textarea = document.getElementById('monthlyMemoEditTextarea');
        
        if (!modal || !textarea) return;
        
        const type = modal.dataset.editType;
        const key = modal.dataset.editKey;
        const text = textarea.value;
        
        if (type === 'anomaly') {
            this.saveAnomalyMemo(key, text);
        } else {
            this.saveMonthlyMemo(key, text);
        }
        
        // 表示を更新
        this.updateMonthlyMemoDisplay();
        
        // モーダルを閉じる
        this.closeMonthlyMemoEditModal();
        
        // トースト表示
        if (typeof showToast === 'function') {
            showToast('メモを保存しました', 'success');
        }
    }

    // ================
    // Public API - ヘルパー関数
    // ================

    /**
     * HTMLクリーンアップ
     * @param {string} html - クリーンアップするHTML
     * @returns {string} クリーンアップ済みHTML
     */
    cleanupNoteHTML(html) {
        if (!html) return '';
        
        // === セキュリティ: 危険なHTMLを除去（XSS対策） ===
        let cleaned = html
            // scriptタグを除去
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            // iframeタグを除去
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            // objectタグを除去
            .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
            // embedタグを除去
            .replace(/<embed\b[^>]*>/gi, '')
            // イベントハンドラ属性を除去（onerror, onclick等）
            .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
            // javascript:プロトコルを除去
            .replace(/javascript\s*:/gi, '');
        
        // 空のspan要素やタグを削除する正規表現
        cleaned = cleaned
            .replace(/<span><\/span>/gi, '') // 空のspan
            .replace(/<span\s*style=""[^>]*><\/span>/gi, '') // スタイルが空のspan
            .replace(/(<br\s*\/?>){3,}/gi, '<br><br>') // 3つ以上の連続BRは2つに統一（空行1つ保持）
            .replace(/^<br\s*\/?>|<br\s*\/?>$/gi, ''); // 先頭・末尾のBR
        
        return cleaned.trim();
    }

    // ================
    // Public API - 画像処理
    // ================

    /**
     * 画像追加モーダルを表示
     */
    addNoteImage() {
        window.pendingHeadingNumber = null;
        window.pendingImageType = null;
        window.selectedTradeForEdit = null;
        document.getElementById('imageAddModal').style.display = 'flex';
    }

    /**
     * 特定のインデックスに画像を追加
     * @param {number} index - 画像インデックス (1-3)
     */
    addNoteImageAt(index) {
        window.pendingNoteImageIndex = index;
        window.pendingImageType = 'noteImage';
        window.selectedTradeForEdit = null;
        
        // 画像追加モーダルを開く
        if (window.ImageAddModalModule) {
            window.ImageAddModalModule.open('noteImage', null);
        } else {
            document.getElementById('imageAddModal').style.display = 'flex';
        }
    }

    /**
     * 画像を表示
     * @param {string|Object} imageData - 画像ソースまたは画像データオブジェクト
     */
    displayNoteImage(imageData) {
        const container = document.getElementById('noteImages');
        if (!container) return;
        
        // 画像ソースを取得（Base64/URL/オブジェクト形式すべてに対応）
        const actualSrc = window.getImageSrc ? window.getImageSrc(imageData) : 
            (typeof imageData === 'string' ? imageData : (imageData?.url || imageData?.src || imageData?.data || null));
        
        if (!actualSrc) {
            console.log('[NoteManagerModule] 有効な画像ソースがありません');
            return;
        }
        
        // 題名を取得
        const imgTitle = window.getImageTitle ? window.getImageTitle(imageData) : (imageData?.title || '');
        
        // pendingNoteImageIndexがあればそのインデックスに、なければ最初の空枠に
        let targetIndex = window.pendingNoteImageIndex;
        
        if (!targetIndex) {
            // 最初の空枠を探す
            const emptySlot = container.querySelector('.note-image-item.empty');
            if (emptySlot) {
                targetIndex = parseInt(emptySlot.getAttribute('data-index'));
            } else {
                console.log('空き枠がありません');
                return;
            }
        }
        
        // 対象の枠を取得
        const targetSlot = container.querySelector(`.note-image-item[data-index="${targetIndex}"]`);
        if (!targetSlot) return;
        
        // 枠を画像ありの状態に変更
        targetSlot.classList.remove('empty');
        targetSlot.classList.add('has-image');
        
        // 現在の日付を取得（編集用コンテキスト）
        const currentDateStr = document.getElementById('noteDate')?.value || '';
        
        // 画像データを一時保存（拡大表示用）
        const tempKey = `noteEdit_${targetIndex}`;
        if (!window.tempNoteEditImages) window.tempNoteEditImages = {};
        window.tempNoteEditImages[tempKey] = imageData;
        
        targetSlot.innerHTML = `
            <img src="${actualSrc}" alt="ノート画像${targetIndex}" onclick="event.stopPropagation(); showImageModalWithCaption(window.tempNoteEditImages['${tempKey}'], {type: 'note', id: '${currentDateStr}', index: ${targetIndex - 1}})">
            <button class="note-image-delete" onclick="event.stopPropagation(); window.NoteManagerModule.removeNoteImageAt(${targetIndex})">×</button>
            ${imgTitle ? `<div class="note-image-title">${imgTitle}</div>` : ''}
        `;
        // 枠のクリックは何もしない（画像クリックで拡大、×で削除）
        targetSlot.onclick = null;
        
        // リセット
        window.pendingNoteImageIndex = null;
    }

    /**
     * 画像をフルスクリーン表示
     * @param {string|Object} imageData - 画像URL/Base64またはオブジェクト
     */
    showImageFullscreen(imageData) {
        // 画像ソースを取得
        const imageUrl = window.getImageSrc ? window.getImageSrc(imageData) : 
            (typeof imageData === 'string' ? imageData : (imageData?.url || imageData?.data || null));
        
        if (!imageUrl) {
            console.log('[NoteManagerModule] 有効な画像URLがありません');
            return;
        }
        
        // 既存のモーダルがあれば削除
        const existingModal = document.querySelector('.image-fullscreen-modal');
        if (existingModal) existingModal.remove();
        
        // モーダルを作成
        const modal = document.createElement('div');
        modal.className = 'image-fullscreen-modal';
        modal.innerHTML = `
            <div class="image-fullscreen-backdrop" onclick="this.parentElement.remove()"></div>
            <img src="${imageUrl}" class="image-fullscreen-img" onclick="event.stopPropagation()">
            <button class="image-fullscreen-close" onclick="this.parentElement.remove()">×</button>
        `;
        document.body.appendChild(modal);
    }

    /**
     * 画像を削除
     * @param {number} index - 画像インデックス
     */
    removeNoteImage(index) {
        const imagesContainer = document.getElementById('noteImages');
        if (!imagesContainer) return;
        
        const images = imagesContainer.querySelectorAll('.note-image-wrapper');
        if (images[index]) {
            images[index].remove();
            this.updateImageIndices();
        }
    }

    /**
     * 特定のインデックスの画像を削除
     * @param {number} index - 画像インデックス (1-3)
     * @param {boolean} skipConfirm - 確認ダイアログをスキップするか
     */
    removeNoteImageAt(index, skipConfirm = false) {
        // ユーザー操作の場合のみ確認ダイアログを表示
        if (!skipConfirm && !confirm('この画像を削除しますか？')) return;
        
        const container = document.getElementById('noteImages');
        if (!container) return;
        
        const targetSlot = container.querySelector(`.note-image-item[data-index="${index}"]`);
        if (!targetSlot) return;
        
        // 空枠に戻す
        targetSlot.classList.remove('has-image');
        targetSlot.classList.add('empty');
        targetSlot.innerHTML = `<span class="note-image-placeholder">画像${index}</span>`;
        targetSlot.onclick = () => this.addNoteImageAt(index);
    }

    /**
     * 画像を収集
     * @returns {Array} 画像ソースの配列
     */
    collectNoteImages() {
        const container = document.getElementById('noteImages');
        if (!container) return [];
        
        const images = [];
        const imageItems = container.querySelectorAll('.note-image-item.has-image');
        
        imageItems.forEach(item => {
            const img = item.querySelector('img');
            if (img && img.src) {
                // data-index属性からインデックスを取得（1,2,3）
                const dataIndex = item.getAttribute('data-index');
                const tempKey = 'noteEdit_' + dataIndex;
                
                // tempNoteEditImagesから画像オブジェクトを取得（title/description含む）
                if (window.tempNoteEditImages && window.tempNoteEditImages[tempKey]) {
                    images.push(window.tempNoteEditImages[tempKey]);
                } else {
                    // なければsrcのみ（後方互換性）
                    images.push(img.src);
                }
            }
        });
        
        return images;
    }

    /**
     * 画像インデックスを更新
     */
    updateImageIndices() {
        const imagesContainer = document.getElementById('noteImages');
        if (!imagesContainer) return;
        
        const images = imagesContainer.querySelectorAll('.note-image-wrapper');
        images.forEach((wrapper, index) => {
            wrapper.setAttribute('data-index', index);
        });
    }

    /**
     * 保存済みノートの画像を表示
     * @param {Array} imageArray - 画像ソースの配列
     */
    restoreNoteImages(imageArray) {
        const container = document.getElementById('noteImages');
        if (!container) return;
        
        // 枠が存在しない場合は作成
        if (container.children.length === 0) {
            container.innerHTML = `
                <div class="note-image-item empty" data-index="1">
                    <span class="note-image-placeholder">画像1</span>
                </div>
                <div class="note-image-item empty" data-index="2">
                    <span class="note-image-placeholder">画像2</span>
                </div>
                <div class="note-image-item empty" data-index="3">
                    <span class="note-image-placeholder">画像3</span>
                </div>
            `;
            // onclickを設定
            container.querySelectorAll('.note-image-item').forEach(item => {
                const index = item.getAttribute('data-index');
                item.onclick = () => this.addNoteImageAt(parseInt(index));
            });
        }
        
        // まず全枠を空に
        for (let i = 1; i <= 3; i++) {
            this.removeNoteImageAt(i, true);  // 内部呼び出しなので確認スキップ
        }
        
        // 画像を復元（期限切れURLは自動更新）
        if (imageArray && imageArray.length > 0) {
            this.#restoreImagesAsync(imageArray);
        }
    }
    
    /**
     * 画像を非同期で復元（期限切れURL自動更新対応）
     * @param {Array} imageArray - 画像配列
     */
    async #restoreImagesAsync(imageArray) {
        for (let idx = 0; idx < imageArray.length && idx < 3; idx++) {
            const img = imageArray[idx];
            if (!img) continue;
            
            // 期限切れURLは自動更新
            let imgSrc;
            if (window.getValidImageSrc && typeof img === 'object') {
                imgSrc = await window.getValidImageSrc(img);
            } else {
                imgSrc = window.getImageSrc ? window.getImageSrc(img) : img;
            }
            
            if (imgSrc) {
                window.pendingNoteImageIndex = idx + 1;
                // 画像データ全体を渡す（title/descriptionを含む）
                // URLが更新された場合はsrcを更新したオブジェクトを作成
                const imageDataWithUpdatedSrc = typeof img === 'object' 
                    ? { ...img, src: imgSrc, url: imgSrc }
                    : imgSrc;
                this.displayNoteImage(imageDataWithUpdatedSrc);
            }
        }
    }

    // ================
    // Public API - 日付操作
    // ================

    /**
     * 日付を変更
     * @param {number} days - 変更日数（正:未来、負:過去）
     */
    changeDate(days) {
        const currentDate = new Date(document.getElementById('noteDate').value || new Date());
        currentDate.setDate(currentDate.getDate() + days);
        document.getElementById('noteDate').value = formatDateForInput(currentDate);
        this.loadNoteForDate(formatDateForInput(currentDate));
        this.updateMonthlyMemoDisplay();
        this.selectNoteDate(formatDateForInput(currentDate));
    }

    /**
     * 今日の日付に設定
     */
    setToday() {
        const today = new Date();
        document.getElementById('noteDate').value = formatDateForInput(today);
        this.loadNoteForDate(formatDateForInput(today));
        this.updateMonthlyMemoDisplay();
        this.selectNoteDate(formatDateForInput(today));
    }

    // ================
    // Public API - ノート読み込み
    // ================

    /**
     * 指定日付のノートを読み込む
     * @param {string} dateStr - 日付文字列
     */
    loadNoteForDate(dateStr) {
        const note = this.#notes[dateStr];
        
        const memoElement = document.getElementById('noteMemo');
        const marketViewElement = document.getElementById('noteMarketView');
        const imagesContainer = document.getElementById('noteImages');
        
        if (memoElement) memoElement.innerHTML = '';
        if (marketViewElement) marketViewElement.innerHTML = '';
        if (imagesContainer) imagesContainer.innerHTML = '';
        
        if (note) {
            // HTMLをクリーンアップする内部関数
            const cleanupHTML = (html) => {
                if (!html) return '';
                
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                
                tempDiv.querySelectorAll('span').forEach(span => {
                    if (!span.textContent.trim() && !span.style.cssText) {
                        span.remove();
                    }
                });
                
                let cleanedHTML = tempDiv.innerHTML;
                cleanedHTML = cleanedHTML.replace(/(<br\s*\/?>){3,}/gi, '<br><br>');
                cleanedHTML = cleanedHTML.replace(/(<br\s*\/?>|<span><\/span>)+$/gi, '');
                
                return cleanedHTML;
            };
            
            // メモ表示
            if (memoElement && note.memo) {
                let displayMemo = cleanupHTML(note.memo);
                if (!displayMemo.includes('<br') && displayMemo.includes('\n')) {
                    displayMemo = displayMemo.replace(/\n/g, '<br>');
                }
                memoElement.innerHTML = displayMemo;
                
                // 高さを調整（5行分に制限）
                const lineHeight = 24;
                const maxLines = 5;
                const maxHeight = lineHeight * maxLines;
                
                setTimeout(() => {
                    if (memoElement.offsetHeight > maxHeight) {
                        const lines = displayMemo.split('<br>');
                        if (lines.length > maxLines) {
                            memoElement.innerHTML = lines.slice(0, maxLines).join('<br>');
                        }
                    }
                }, 0);
            }
            
            // 相場観表示
            if (marketViewElement && note.marketView) {
                let displayMarketView = cleanupHTML(note.marketView);
                if (!displayMarketView.includes('<br') && displayMarketView.includes('\n')) {
                    displayMarketView = displayMarketView.replace(/\n/g, '<br>');
                }
                marketViewElement.innerHTML = displayMarketView;
            }
            
            // 画像表示
            if (note.images && note.images.length > 0) {
                this.restoreNoteImages(note.images);
            } else {
                this.restoreNoteImages([]);
            }
        } else {
            // ノートがない場合も空枠を表示
            this.restoreNoteImages([]);
        }
    }

    // ================
    // Public API - ノート保存
    // ================

    /**
     * ノートを保存（新規/更新統合）
     */
    saveOrUpdateNote() {
        if (this.#isEditingNote && this.#editingNoteDate) {
            this.#updateNoteFromMainEditor();
        } else {
            this.saveNote();
        }
    }

    /**
     * ノートを新規保存
     */
    saveNote() {
        // 編集モードの場合は更新処理を行う
        if (this.#isEditingNote && this.#editingNoteDate) {
            this.#updateNoteFromMainEditor();
            return;
        }
        
        const noteDate = document.getElementById('noteDate').value;
        const memoElement = document.getElementById('noteMemo');
        const marketViewElement = document.getElementById('noteMarketView');
        
        let memo = '';
        let marketView = '';
        
        if (memoElement) {
            memo = memoElement.innerHTML
                .replace(/<div>/gi, '\n')
                .replace(/<\/div>/gi, '')
                .replace(/<p>/gi, '\n')
                .replace(/<\/p>/gi, '')
                .replace(/\n\n+/g, '\n')
                .replace(/\n/g, '<br>')
                .replace(/^<br>/i, '')
                .trim();
            
            memo = this.cleanupNoteHTML(memo);
        }
        
        if (marketViewElement) {
            marketView = marketViewElement.innerHTML
                .replace(/<div>/gi, '\n')
                .replace(/<\/div>/gi, '')
                .replace(/<p>/gi, '\n')
                .replace(/<\/p>/gi, '')
                .replace(/\n\n+/g, '\n')
                .replace(/\n/g, '<br>')
                .replace(/^<br>/i, '')
                .trim();
            
            marketView = this.cleanupNoteHTML(marketView);
        }
        
        if (!noteDate) {
            showToast('日付を選択してください', 'error');
            return;
        }
        
        // テキストが空かチェック
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = memo + marketView;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';
        
        if (!plainText.trim()) {
            showToast('内容を入力してください', 'error');
            return;
        }
        
        // ノートデータの構築
        const noteData = {
            date: noteDate,
            memo: memo,
            marketView: marketView,
            images: this.collectNoteImages(),
            createdAt: this.#notes[noteDate]?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.#notes[noteDate] = noteData;
        this.#save();
        this.updateWeeklyPreview();
        this.displayNoteDetail(noteDate);
        this.selectNoteDate(noteDate);
        
        const date = new Date(noteDate);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        showToast(`${month}/${day}の相場ノートを保存しました`, 'success');
        
        // EventBus発火
        this.#eventBus?.emit('note:saved', { date: noteDate, note: noteData });
        
        // Supabase同期（バックグラウンド）
        this.#syncNoteToCloud(noteDate, noteData);
    }

    /**
     * メインエディタからの更新処理
     */
    #updateNoteFromMainEditor() {
        if (!this.#editingNoteDate) return;
        
        const targetDate = this.#editingNoteDate;
        const note = this.#notes[targetDate] || {};
        
        const memoElement = document.getElementById('noteMemo');
        const marketViewElement = document.getElementById('noteMarketView');
        
        if (memoElement) {
            const memoHtml = memoElement.innerHTML
                .replace(/<div>/gi, '<br>')
                .replace(/<\/div>/gi, '')
                .replace(/<p>/gi, '<br>')
                .replace(/<\/p>/gi, '')
                .replace(/^<br>/i, '');
            note.memo = this.cleanupNoteHTML(memoHtml.trim());
        }
        
        if (marketViewElement) {
            const marketViewHtml = marketViewElement.innerHTML
                .replace(/<div>/gi, '<br>')
                .replace(/<\/div>/gi, '')
                .replace(/<p>/gi, '<br>')
                .replace(/<\/p>/gi, '')
                .replace(/^<br>/i, '');
            note.marketView = this.cleanupNoteHTML(marketViewHtml.trim());
        }
        
        note.images = this.collectNoteImages();
        note.updatedAt = new Date().toISOString();
        if (!note.createdAt) {
            note.createdAt = note.updatedAt;
        }
        
        this.#notes[targetDate] = note;
        this.#save();
        
        let month = '';
        let day = '';
        if (targetDate && targetDate.includes('-')) {
            const dateParts = targetDate.split('-');
            month = parseInt(dateParts[1]);
            day = parseInt(dateParts[2]);
        }
        
        this.cancelEdit();
        this.updateWeeklyPreview();
        this.displayNoteDetail(targetDate);
        this.selectNoteDate(targetDate);
        
        if (month && day) {
            showToast(`${month}/${day}のノートを更新しました`, 'success');
        } else {
            showToast('ノートを更新しました', 'success');
        }
        
        // EventBus発火
        this.#eventBus?.emit('note:updated', { date: targetDate, note: note });
        
        // Supabase同期（バックグラウンド）
        this.#syncNoteToCloud(targetDate, note);
    }

    // ================
    // Public API - 編集・削除
    // ================

    /**
     * ノート編集を開始
     * @param {string} dateStr - 編集する日付
     */
    editNote(dateStr) {
        const note = this.#notes[dateStr];
        
        this.#isEditingNote = true;
        this.#editingNoteDate = dateStr;
        
        const notesTab = document.getElementById('notes');
        const noteInputArea = document.querySelector('.note-input-area');
        
        const targetPosition = notesTab.offsetTop + 100;
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
        
        const indicator = document.getElementById('editingIndicator');
        const editingDateSpan = document.getElementById('editingDate');
        if (indicator) {
            indicator.style.display = 'flex';
            if (editingDateSpan) {
                editingDateSpan.textContent = note ? `${dateStr} のノートを編集中` : `${dateStr} のノートを新規作成中`;
            }
        }
        
        if (noteInputArea) {
            noteInputArea.classList.add('editing-mode');
        }
        
        const noteDateElement = document.getElementById('noteDate');
        if (noteDateElement) {
            noteDateElement.value = dateStr;
            noteDateElement.disabled = true;
        }
        
        const memoElement = document.getElementById('noteMemo');
        const marketViewElement = document.getElementById('noteMarketView');
        const imagesContainer = document.getElementById('noteImages');
        
        if (note) {
            if (memoElement) {
                memoElement.innerHTML = note.memo || '';
            }
            
            if (marketViewElement) {
                marketViewElement.innerHTML = note.marketView || '';
            }
            
            if (imagesContainer) {
                // restoreNoteImagesを使用（枠を再作成してから画像を表示）
                const images = note.images || [];
                this.restoreNoteImages(images);
            }
        } else {
            if (memoElement) memoElement.innerHTML = '';
            if (marketViewElement) marketViewElement.innerHTML = '';
            // 空の状態で枠を表示
            this.restoreNoteImages([]);
        }
        
        const saveBtn = document.getElementById('saveNoteBtn');
        if (saveBtn) {
            saveBtn.textContent = note ? 'ノートを更新' : 'ノートを作成';
            saveBtn.classList.add('btn-update');
        }
        
        setTimeout(() => {
            if (memoElement) {
                memoElement.focus();
            }
        }, 600);
        
        const message = note ? '編集モードに入りました。上部のエディタで編集してください。' : '新規作成モードに入りました。上部のエディタで内容を入力してください。';
        showToast(message, 'info');
        
        // EventBus発火
        this.#eventBus?.emit('note:editStarted', { date: dateStr });
    }

    /**
     * 編集をキャンセル
     */
    cancelEdit() {
        const prevDate = this.#editingNoteDate;
        
        this.#isEditingNote = false;
        this.#editingNoteDate = null;
        
        const indicator = document.getElementById('editingIndicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
        
        const noteInputArea = document.querySelector('.note-input-area');
        if (noteInputArea) {
            noteInputArea.classList.remove('editing-mode');
        }
        
        const noteDateElement = document.getElementById('noteDate');
        if (noteDateElement) {
            noteDateElement.disabled = false;
            noteDateElement.value = formatDateForInput(new Date());
        }
        
        this.clearNoteForm();
        
        const saveBtn = document.getElementById('saveNoteBtn');
        if (saveBtn) {
            saveBtn.textContent = 'ノートを保存';
            saveBtn.classList.remove('btn-update');
        }
        
        // EventBus発火
        if (prevDate) {
            this.#eventBus?.emit('note:editCanceled', { date: prevDate });
        }
    }

    /**
     * ノートフォームをクリア
     */
    clearNoteForm() {
        const noteDateElement = document.getElementById('noteDate');
        const memoElement = document.getElementById('noteMemo');
        const marketViewElement = document.getElementById('noteMarketView');
        const imagesContainer = document.getElementById('noteImages');
        
        if (this.#isEditingNote) {
            this.cancelEdit();
            return;
        }
        
        if (noteDateElement) {
            noteDateElement.value = formatDateForInput(new Date());
        }
        if (memoElement) memoElement.innerHTML = '';
        if (marketViewElement) marketViewElement.innerHTML = '';
        this.restoreNoteImages([]);
    }

    /**
     * ノートを削除
     * @param {string} dateStr - 削除する日付
     */
    deleteNote(dateStr) {
        if (!confirm('このノートを削除してもよろしいですか？')) return;
        
        const dateParts = dateStr.split('-');
        const month = parseInt(dateParts[1]);
        const day = parseInt(dateParts[2]);
        
        delete this.#notes[dateStr];
        this.#save();
        this.updateWeeklyPreview();
        
        // 編集画面（入力欄）もクリア
        const memoElement = document.getElementById('noteMemo');
        const marketViewElement = document.getElementById('noteMarketView');
        if (memoElement) memoElement.innerHTML = '';
        if (marketViewElement) marketViewElement.innerHTML = '';
        this.restoreNoteImages([]);
        
        document.getElementById('noteDetail').innerHTML = `
            <div class="detail-placeholder">
                <p>📝 日付を選択してノートを表示</p>
            </div>
        `;
        
        showToast(`${month}/${day}のノートを削除しました`, 'success');
        
        // EventBus発火
        this.#eventBus?.emit('note:deleted', { date: dateStr });
        
        // Supabase同期（バックグラウンド）
        this.#deleteNoteFromCloud(dateStr);
    }

    /**
     * 一時保存（簡略版）
     */
    saveNoteTemporary() {
        const noteDate = document.getElementById('noteDate').value;
        if (!noteDate) return;
        // 現在の入力内容を一時的に保存（実装は簡略化）
    }

    // ================
    // Supabase同期（プライベート）
    // ================
    
    /**
     * ノートをSupabaseに同期（バックグラウンド）
     * @param {string} dateStr - 日付
     * @param {Object} noteData - ノートデータ
     */
    #syncNoteToCloud(dateStr, noteData) {
        if (window.SyncModule?.isInitialized?.()) {
            window.SyncModule.saveNote(dateStr, noteData)
                .then(result => {
                    if (result.success) {
                        console.log('[NoteManager] Supabase同期成功:', dateStr);
                    } else {
                        console.warn('[NoteManager] Supabase同期失敗:', result.error);
                    }
                })
                .catch(err => {
                    console.error('[NoteManager] Supabase同期エラー:', err);
                });
        }
    }
    
    /**
     * ノートをSupabaseから削除（バックグラウンド）
     * @param {string} dateStr - 日付
     */
    #deleteNoteFromCloud(dateStr) {
        if (window.SyncModule?.isInitialized?.()) {
            window.SyncModule.deleteNote(dateStr)
                .then(result => {
                    if (result.success) {
                        console.log('[NoteManager] Supabase削除成功:', dateStr);
                    } else {
                        console.warn('[NoteManager] Supabase削除失敗:', result.error);
                    }
                })
                .catch(err => {
                    console.error('[NoteManager] Supabase削除エラー:', err);
                });
        }
    }

    // ================
    // Public API - フォーマット
    // ================

    /**
     * フォーマット適用
     * @param {string} editorId - エディタID
     * @param {string} format - フォーマット種類
     */
    applyNoteFormat(editorId, format) {
        let editorElementId;
        
        switch(editorId) {
            case 'memo':
                editorElementId = 'noteMemo';
                break;
            case 'marketView':
                editorElementId = 'noteMarketView';
                break;
            case 'editMemo':
                editorElementId = 'editNoteMemo';
                break;
            case 'editMarketView':
                editorElementId = 'editNoteMarketView';
                break;
            default:
                return;
        }
        
        const editor = document.getElementById(editorElementId);
        if (!editor) return;
        
        document.execCommand('styleWithCSS', false, true);
        
        // CSS変数から色を取得
        const styles = getComputedStyle(document.documentElement);
        
        switch(format) {
            case 'bold':
                document.execCommand('bold', false, null);
                break;
            case 'underline':
                document.execCommand('underline', false, null);
                break;
            case 'strikethrough':
                document.execCommand('strikeThrough', false, null);
                break;
            case 'red':
                const redColor = styles.getPropertyValue('--editor-color-red').trim() || '#EF5350';
                document.execCommand('foreColor', false, redColor);
                break;
            case 'blue':
                const blueColor = styles.getPropertyValue('--editor-color-blue').trim() || '#64B5F6';
                document.execCommand('foreColor', false, blueColor);
                break;
            case 'green':
                const greenColor = styles.getPropertyValue('--editor-color-green').trim() || '#81C784';
                document.execCommand('foreColor', false, greenColor);
                break;
            case 'highlight':
                const highlightColor = styles.getPropertyValue('--editor-highlight-bg').trim() || '#FFD54F';
                document.execCommand('hiliteColor', false, highlightColor);
                break;
            case 'default':
                document.execCommand('removeFormat', false, null);
                break;
        }
        
        editor.focus();
        
        // EventBus発火（デバッグ用）
        this.#eventBus?.emit('note:formatApplied', { editorId, format });
    }

    /**
     * applyNoteFormatのラッパー
     */
    applyFormatting(editorId, format) {
        this.applyNoteFormat(editorId, format);
    }

    /**
     * フォントサイズ適用（改善版）
     * @param {string} editorId - エディタID
     * @param {string} size - 'small'|'medium'|'large'
     */
    applyFontSize(editorId, size) {
        let editorElementId;
        
        switch(editorId) {
            case 'memo':
                editorElementId = 'noteMemo';
                break;
            case 'marketView':
                editorElementId = 'noteMarketView';
                break;
            case 'editMemo':
                editorElementId = 'editNoteMemo';
                break;
            case 'editMarketView':
                editorElementId = 'editNoteMarketView';
                break;
            default:
                return;
        }
        
        const editor = document.getElementById(editorElementId);
        if (!editor) return;
        
        const sizeMap = {
            'small': '0.9em',
            'medium': '1.1em',
            'large': '1.3em'
        };
        
        const fontSize = sizeMap[size] || '0.9em';
        
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        if (range.collapsed) return; // 選択範囲がない場合は何もしない
        
        // 選択範囲が指定エディタ内か確認
        if (!editor.contains(range.commonAncestorContainer)) return;
        
        // === 改善ポイント: 選択範囲内の既存font-sizeを解除 ===
        this.#removeFontSizeInRange(range, editor);
        
        // 選択範囲を再取得（DOM操作後に更新される場合があるため）
        const newSelection = window.getSelection();
        if (!newSelection.rangeCount) {
            editor.focus();
            return;
        }
        const newRange = newSelection.getRangeAt(0);
        if (newRange.collapsed) {
            editor.focus();
            return;
        }
        
        // 新しいフォントサイズを適用
        const span = document.createElement('span');
        span.style.fontSize = fontSize;
        
        try {
            // 選択範囲のコンテンツを抽出してspanに入れる
            const contents = newRange.extractContents();
            span.appendChild(contents);
            newRange.insertNode(span);
            
            // 選択範囲を更新（適用した部分を選択状態に維持）
            newSelection.removeAllRanges();
            const updatedRange = document.createRange();
            updatedRange.selectNodeContents(span);
            newSelection.addRange(updatedRange);
        } catch (e) {
            console.warn('[NoteManager] フォントサイズ適用でフォールバック使用:', e);
            // フォールバック: execCommandを使用
            document.execCommand('styleWithCSS', false, true);
            document.execCommand('fontSize', false, '7');
            
            // 適用された要素を探してfont-sizeを上書き
            const fontElements = editor.querySelectorAll('font[size="7"]');
            fontElements.forEach(el => {
                const newSpan = document.createElement('span');
                newSpan.style.fontSize = fontSize;
                newSpan.innerHTML = el.innerHTML;
                el.parentNode.replaceChild(newSpan, el);
            });
        }
        
        editor.focus();
        
        // EventBus発火
        this.#eventBus?.emit('note:fontSizeApplied', { editorId, size });
    }
    
    /**
     * 選択範囲内のfont-sizeスタイルを解除（プライベートメソッド）
     * v2.0: TreeWalker方式から親要素走査+querySelectorAll方式に変更
     * @private
     * @param {Range} range - 選択範囲
     * @param {HTMLElement} editor - エディタ要素
     */
    #removeFontSizeInRange(range, editor) {
        // font-size付きspanを解除するヘルパー関数
        const unwrapFontSize = (el) => {
            el.style.fontSize = '';
            if (!el.getAttribute('style')?.trim()) {
                el.removeAttribute('style');
            }
            // スタイルもクラスもないspanは中身を取り出して置換
            if (el.tagName === 'SPAN' && !el.hasAttribute('style') && !el.hasAttribute('class')) {
                const parent = el.parentNode;
                while (el.firstChild) {
                    parent.insertBefore(el.firstChild, el);
                }
                parent.removeChild(el);
            }
        };
        
        // 方法1: 選択範囲を含む親要素を辿ってfont-size付きspanを探す
        let ancestor = range.commonAncestorContainer;
        if (ancestor.nodeType === Node.TEXT_NODE) {
            ancestor = ancestor.parentElement;
        }
        
        let current = ancestor;
        while (current && current !== editor) {
            if (current.nodeType === Node.ELEMENT_NODE && current.style?.fontSize) {
                unwrapFontSize(current);
                break;
            }
            current = current.parentElement;
        }
        
        // 方法2: 選択範囲内の子要素にfont-size付きspanがあれば解除
        const searchRoot = (ancestor && ancestor.nodeType === Node.ELEMENT_NODE) ? ancestor : editor;
        const fontSizeElements = searchRoot.querySelectorAll('span[style*="font-size"]');
        fontSizeElements.forEach(el => {
            if (range.intersectsNode(el)) {
                unwrapFontSize(el);
            }
        });
    }

    // ================
    // Public API - 自動保存
    // ================

    /**
     * 自動保存の設定（スマートペースト対応）
     * - Ctrl+V: プレーンテキスト（外部サイトから）
     * - Ctrl+Shift+V: 装飾維持（エディタ内でコピーした場合）
     * v2.1: ブラウザがCtrl+Shift+VでHTMLを除去する問題を
     *       copyイベント保存 + keydownインターセプトで対応
     */
    setupNoteAutoSave() {
        const memoElement = document.getElementById('noteMemo');
        const marketViewElement = document.getElementById('noteMarketView');
        
        if (!memoElement || !marketViewElement) return;
        
        // Shiftキー状態をkeydown/keyupで追跡
        // （ClipboardEvent（paste）にはshiftKeyプロパティが存在しないため）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') this.#isShiftPressed = true;
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') this.#isShiftPressed = false;
        });
        
        // === エディタ内コピー時にHTMLを保存 ===
        // ブラウザのCtrl+Shift+VはHTMLデータを除去するため、
        // コピー時点でHTMLを自前保存しておく
        document.addEventListener('copy', () => {
            const selection = window.getSelection();
            if (!selection.rangeCount || selection.isCollapsed) {
                return; // 選択なしの場合は何もしない（前回の保存を維持）
            }
            
            const range = selection.getRangeAt(0);
            const ancestor = range.commonAncestorContainer;
            const element = (ancestor.nodeType === Node.TEXT_NODE)
                ? ancestor.parentElement
                : ancestor;
            
            // エディタ内からのコピーかチェック
            const isInEditor = element?.closest?.(
                '#noteMemo, #noteMarketView, #editNoteMemo, #editNoteMarketView'
            );
            
            if (isInEditor) {
                // 選択範囲のHTMLを保存
                const fragment = range.cloneContents();
                const tempDiv = document.createElement('div');
                tempDiv.appendChild(fragment);
                this.#lastCopiedHTML = tempDiv.innerHTML;
                console.log('[NoteManager] エディタHTMLを保存（装飾維持ペースト用）');
            } else {
                // 外部からのコピーは保存をクリア
                this.#lastCopiedHTML = null;
            }
        });
        
        // cutイベントでも同様にHTMLを保存
        document.addEventListener('cut', () => {
            const selection = window.getSelection();
            if (!selection.rangeCount || selection.isCollapsed) return;
            
            const range = selection.getRangeAt(0);
            const ancestor = range.commonAncestorContainer;
            const element = (ancestor.nodeType === Node.TEXT_NODE)
                ? ancestor.parentElement
                : ancestor;
            
            const isInEditor = element?.closest?.(
                '#noteMemo, #noteMarketView, #editNoteMemo, #editNoteMarketView'
            );
            
            if (isInEditor) {
                const fragment = range.cloneContents();
                const tempDiv = document.createElement('div');
                tempDiv.appendChild(fragment);
                this.#lastCopiedHTML = tempDiv.innerHTML;
            } else {
                this.#lastCopiedHTML = null;
            }
        });
        
        [memoElement, marketViewElement].forEach(element => {
            element.addEventListener('input', () => {
                clearTimeout(this.#autoSaveTimer);
                this.#autoSaveTimer = setTimeout(() => {
                    this.autoSaveNoteQuietly();
                }, 2000);
            });
            
            element.addEventListener('blur', () => {
                clearTimeout(this.#autoSaveTimer);
                this.autoSaveNoteQuietly();
            });
            
            // === Ctrl+Shift+V: keydownでインターセプト ===
            // ブラウザのCtrl+Shift+VはHTMLを除去するため、
            // keydownの時点で保存済みHTMLを挿入する
            element.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
                    if (this.#lastCopiedHTML) {
                        e.preventDefault();
                        
                        // 保存済みHTMLを挿入
                        document.execCommand('insertHTML', false, this.#lastCopiedHTML);
                        
                        console.log('[NoteManager] 装飾維持ペースト実行');
                        
                        // 自動保存トリガー
                        clearTimeout(this.#autoSaveTimer);
                        this.#autoSaveTimer = setTimeout(() => {
                            this.autoSaveNoteQuietly();
                        }, 2000);
                    }
                    // lastCopiedHTMLがない場合（外部コピー）
                    // → ブラウザデフォルト動作（プレーンテキスト貼付）
                }
            });
            
            // === Ctrl+V: プレーンテキストペースト ===
            element.addEventListener('paste', (e) => {
                // Shift押下中の場合はデフォルト動作に任せる
                // （keydownハンドラーで処理済み or ブラウザデフォルト）
                if (this.#isShiftPressed) {
                    clearTimeout(this.#autoSaveTimer);
                    this.#autoSaveTimer = setTimeout(() => {
                        this.autoSaveNoteQuietly();
                    }, 2000);
                    return;
                }
                
                // 通常のCtrl+V = プレーンテキストペースト
                e.preventDefault();
                
                // クリップボードからプレーンテキストを取得
                const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                
                // 選択範囲にテキストを挿入
                const selection = window.getSelection();
                if (!selection.rangeCount) return;
                
                const range = selection.getRangeAt(0);
                range.deleteContents();
                
                // 改行を<br>に変換してHTMLとして挿入
                const lines = text.split('\n');
                const fragment = document.createDocumentFragment();
                
                lines.forEach((line, index) => {
                    if (index > 0) {
                        fragment.appendChild(document.createElement('br'));
                    }
                    fragment.appendChild(document.createTextNode(line));
                });
                
                range.insertNode(fragment);
                
                // カーソルを挿入位置の後ろに移動
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                
                // 自動保存をトリガー
                clearTimeout(this.#autoSaveTimer);
                this.#autoSaveTimer = setTimeout(() => {
                    this.autoSaveNoteQuietly();
                }, 2000);
            });
        });
    }

    /**
     * 静かに自動保存
     */
    autoSaveNoteQuietly() {
        const noteDate = document.getElementById('noteDate').value;
        const memoElement = document.getElementById('noteMemo');
        const marketViewElement = document.getElementById('noteMarketView');
        
        if (!noteDate) return;
        
        let memo = '';
        let marketView = '';
        
        if (memoElement) {
            const memoHtml = memoElement.innerHTML
                .replace(/<div>/gi, '<br>')
                .replace(/<\/div>/gi, '')
                .replace(/<p>/gi, '<br>')
                .replace(/<\/p>/gi, '')
                .replace(/^<br>/i, '');
            memo = this.cleanupNoteHTML(memoHtml.trim());
        }
        
        if (marketViewElement) {
            const marketViewHtml = marketViewElement.innerHTML
                .replace(/<div>/gi, '<br>')
                .replace(/<\/div>/gi, '')
                .replace(/<p>/gi, '<br>')
                .replace(/<\/p>/gi, '')
                .replace(/^<br>/i, '');
            marketView = this.cleanupNoteHTML(marketViewHtml.trim());
        }
        
        if (!memo && !marketView) return;
        
        const noteData = {
            date: noteDate,
            memo: memo,
            marketView: marketView,
            images: this.collectNoteImages(),
            createdAt: this.#notes[noteDate]?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.#notes[noteDate] = noteData;
        this.#save();
        // 週間プレビューは手動保存時のみ更新（自動保存では更新しない）
    }

    // ================
    // Public API - 週間プレビュー
    // ================

    /**
     * 週間表示を初期化
     */
    initializeWeekView() {
        if (!this.#currentWeekStart) {
            this.#currentWeekStart = new Date();
        }
        
        const today = new Date();
        const monday = new Date(today);
        const day = monday.getDay();
        const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
        monday.setDate(diff);
        
        this.#currentWeekStart = monday;
        // グローバル変数との同期（過渡期）
        window.currentWeekStart = this.#currentWeekStart;
        
        this.updateWeeklyPreview();
        
        const detailContainer = document.getElementById('noteDetail');
        if (detailContainer) {
            if (!this.#selectedNoteDate) {
                detailContainer.innerHTML = `
                    <div class="detail-placeholder">
                        <p>📝 日付を選択してノートを表示</p>
                    </div>
                `;
            }
        }
        
        const noteDisplayContainer = document.querySelector('.note-display-container');
        if (noteDisplayContainer) {
            noteDisplayContainer.style.gridTemplateColumns = '';
            if (window.getComputedStyle(noteDisplayContainer).gridTemplateColumns.includes('px')) {
                noteDisplayContainer.style.gridTemplateColumns = '1fr 1fr';
            }
        }
    }

    /**
     * 週間プレビューを更新
     */
    updateWeeklyPreview() {
        if (!this.#currentWeekStart || !(this.#currentWeekStart instanceof Date)) {
            this.#currentWeekStart = new Date();
            const day = this.#currentWeekStart.getDay();
            const diff = this.#currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
            this.#currentWeekStart.setDate(diff);
        }
        // グローバル変数との同期
        window.currentWeekStart = this.#currentWeekStart;
        
        const weekEnd = new Date(this.#currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const rangeText = `${window.formatDateForDisplay(this.#currentWeekStart)} - ${window.formatDateForDisplay(weekEnd)}`;
        const weekRangeElement = document.getElementById('currentWeekRange');
        if (weekRangeElement) weekRangeElement.textContent = rangeText;
        
        const container = document.getElementById('weekDays');
        if (!container) return;
        
        container.innerHTML = '';
        
        const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(this.#currentWeekStart);
            date.setDate(date.getDate() + i);
            const dateStr = formatDateForInput(date);
            const note = this.#notes[dateStr];
            
            const dayPreview = this.createDayPreview(date, dateStr, note, weekdays[i]);
            container.appendChild(dayPreview);
        }
    }

    /**
     * 日別プレビューを作成
     * @param {Date} date - 日付
     * @param {string} dateStr - 日付文字列
     * @param {Object} note - ノートデータ
     * @param {string} weekday - 曜日
     * @returns {HTMLElement} プレビュー要素
     */
    createDayPreview(date, dateStr, note, weekday) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-preview';
        
        if (this.#selectedNoteDate === dateStr) {
            dayDiv.classList.add('selected');
        }
        
        // モバイル判定
        const isMobile = window.innerWidth <= 480;
        
        // ヘッダー部分を作成
        const headerDiv = document.createElement('div');
        headerDiv.className = 'day-preview-header';
        
        if (isMobile) {
            // モバイル: アコーディオン用アイコン + 編集ボタン（常時表示）
            headerDiv.innerHTML = `
                <span class="accordion-icon">▼</span>
                <span class="day-preview-date">${date.getMonth() + 1}/${date.getDate()}</span>
                <span class="day-preview-weekday">${weekday}曜日</span>
                <button class="btn btn-small btn-edit-note">編集</button>
            `;
        } else {
            // PC: 従来通り
            headerDiv.innerHTML = `
                <span class="day-preview-date">${date.getMonth() + 1}/${date.getDate()}</span>
                <span class="day-preview-weekday">${weekday}曜日</span>
            `;
        }
        
        // コンテンツ部分を作成
        const contentDiv = document.createElement('div');
        contentDiv.className = 'day-preview-content';
        
        // 5行を作成
        for (let i = 0; i < 5; i++) {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'day-preview-line';
            
            if (note && note.memo) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = this.cleanupNoteHTML(note.memo);
                
                let textContent = tempDiv.innerHTML
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/div><div>/gi, '\n')
                    .replace(/<\/div>/gi, '\n')
                    .replace(/<div>/gi, '')
                    .replace(/<\/p><p>/gi, '\n')
                    .replace(/<\/p>/gi, '\n')
                    .replace(/<p>/gi, '');
                
                const cleanDiv = document.createElement('div');
                cleanDiv.innerHTML = textContent;
                
                cleanDiv.querySelectorAll('*').forEach(el => this.#normalizeElementStyle(el));
                
                // 空行も保持（空行は &nbsp; に変換）
                const lines = cleanDiv.innerHTML.split('\n').map(line => line.trim() === '' ? '&nbsp;' : line);
                
                if (i < lines.length) {
                    lineDiv.innerHTML = lines[i];
                } else {
                    lineDiv.innerHTML = '&nbsp;';
                }
            } else {
                lineDiv.innerHTML = '&nbsp;';
            }
            
            contentDiv.appendChild(lineDiv);
        }
        
        dayDiv.appendChild(headerDiv);
        dayDiv.appendChild(contentDiv);
        
        // 画像サムネイルを追加（最大3枚）
        if (note && note.images && note.images.length > 0) {
            const imagesDiv = document.createElement('div');
            imagesDiv.className = 'day-preview-images';
            
            // 画像データを一時保存（拡大表示用）- 既存パターンと一貫性を保持
            if (!window.tempDayPreviewImages) window.tempDayPreviewImages = {};
            
            note.images.slice(0, 3).forEach((img, index) => {
                const imgSrc = window.getImageSrc ? window.getImageSrc(img) : 
                    (typeof img === 'string' ? img : (img?.url || img?.data || null));
                
                if (imgSrc) {
                    // 画像データを一時保存
                    const tempKey = `dayPreview_${dateStr}_${index}`;
                    window.tempDayPreviewImages[tempKey] = img;
                    
                    const thumb = document.createElement('img');
                    thumb.src = imgSrc;
                    thumb.alt = `画像${index + 1}`;
                    thumb.className = 'day-preview-thumb';
                    thumb.onclick = (e) => {
                        e.stopPropagation();
                        // 題名・説明付きモーダルを使用
                        if (typeof window.showImageModalWithCaption === 'function') {
                            window.showImageModalWithCaption(window.tempDayPreviewImages[tempKey], {
                                type: 'note',
                                id: dateStr,
                                index: index
                            });
                        } else {
                            this.showImageFullscreen(img);
                        }
                    };
                    imagesDiv.appendChild(thumb);
                }
            });
            
            if (imagesDiv.children.length > 0) {
                dayDiv.appendChild(imagesDiv);
            }
        }
        
        if (isMobile) {
            // モバイル: アコーディオン動作
            dayDiv.dataset.dateStr = dateStr;
            dayDiv.dataset.expanded = 'false';
            
            // アコーディオンアイコンクリックで展開/折りたたみ
            const accordionIcon = headerDiv.querySelector('.accordion-icon');
            if (accordionIcon) {
                accordionIcon.onclick = (e) => {
                    e.stopPropagation();
                    this.toggleDayAccordion(dayDiv, dateStr, note);
                };
            }
            
            // 編集ボタンのクリックイベント（editNote関数を呼ぶ）
            const editBtn = headerDiv.querySelector('.btn-edit-note');
            if (editBtn) {
                editBtn.onclick = (e) => {
                    e.stopPropagation();
                    // PC表示と同じeditNote関数を呼ぶ
                    if (typeof window.editNote === 'function') {
                        window.editNote(dateStr);
                    }
                };
            }
            
            // 日付カード本体のクリックも設定（選択のみ）
            dayDiv.onclick = () => this.selectNoteDate(dateStr);
        } else {
            // PC: 従来通り
            dayDiv.onclick = () => this.selectNoteDate(dateStr);
        }
        
        return dayDiv;
    }

    /**
     * モバイル用: 日付カードのアコーディオン展開/折りたたみ
     * @param {HTMLElement} dayDiv - 日付カード要素
     * @param {string} dateStr - 日付文字列
     * @param {Object} note - ノートデータ
     */
    toggleDayAccordion(dayDiv, dateStr, note) {
        const isExpanded = dayDiv.dataset.expanded === 'true';
        const accordionIcon = dayDiv.querySelector('.accordion-icon');
        const contentDiv = dayDiv.querySelector('.day-preview-content');
        
        if (isExpanded) {
            // 折りたたむ（▼で閉じた状態）
            dayDiv.dataset.expanded = 'false';
            dayDiv.classList.remove('expanded');
            if (accordionIcon) accordionIcon.textContent = '▼';
            
            // コンテンツを制限（テキスト2-3行 + 画像サムネイル用）
            if (contentDiv) {
                contentDiv.style.setProperty('height', '120px', 'important');
                contentDiv.style.setProperty('max-height', '120px', 'important');
                contentDiv.style.setProperty('overflow', 'hidden', 'important');
            }
            
            // カードの高さを元に戻す
            dayDiv.style.removeProperty('height');
            dayDiv.style.removeProperty('min-height');
            dayDiv.style.removeProperty('overflow');
        } else {
            // 展開する（▲で開いた状態）
            dayDiv.dataset.expanded = 'true';
            dayDiv.classList.add('expanded');
            if (accordionIcon) accordionIcon.textContent = '▲';
            
            // 全内容を表示（note.memoまたはnote.marketViewがある場合）
            if (note && (note.memo || note.marketView) && contentDiv) {
                this.expandDayContent(contentDiv, note);
            }
            
            // コンテンツを全表示（!importantで強制）
            if (contentDiv) {
                contentDiv.style.setProperty('height', 'auto', 'important');
                contentDiv.style.setProperty('max-height', 'none', 'important');
                contentDiv.style.setProperty('overflow', 'visible', 'important');
            }
            
            // カードの高さを自動に（!importantで強制）
            dayDiv.style.setProperty('height', 'auto', 'important');
            dayDiv.style.setProperty('min-height', 'auto', 'important');
            dayDiv.style.setProperty('overflow', 'visible', 'important');
        }
    }
    
    /**
     * モバイル用: 日付カードのコンテンツを全展開
     * @param {HTMLElement} contentDiv - コンテンツ要素
     * @param {Object} note - ノートデータ
     */
    expandDayContent(contentDiv, note) {
        if (!note) return;
        
        contentDiv.innerHTML = '';
        
        // メモの表示
        if (note.memo) {
            const memoLabel = document.createElement('div');
            memoLabel.className = 'day-preview-section-label';
            memoLabel.textContent = '【メモ】';
            memoLabel.style.cssText = 'color: #00ff88; font-size: 0.75rem; margin-bottom: 5px; font-weight: bold;';
            contentDiv.appendChild(memoLabel);
            
            const memoContent = this.formatNoteContent(note.memo);
            memoContent.forEach(line => {
                const lineDiv = document.createElement('div');
                lineDiv.className = 'day-preview-line';
                lineDiv.innerHTML = line;
                contentDiv.appendChild(lineDiv);
            });
        }
        
        // 今日の相場観の表示
        if (note.marketView) {
            const marketLabel = document.createElement('div');
            marketLabel.className = 'day-preview-section-label';
            marketLabel.textContent = '【今日の相場観】';
            marketLabel.style.cssText = 'color: #00ff88; font-size: 0.75rem; margin-top: 10px; margin-bottom: 5px; font-weight: bold;';
            contentDiv.appendChild(marketLabel);
            
            const marketContent = this.formatNoteContent(note.marketView);
            marketContent.forEach(line => {
                const lineDiv = document.createElement('div');
                lineDiv.className = 'day-preview-line';
                lineDiv.innerHTML = line;
                contentDiv.appendChild(lineDiv);
            });
        }
        
        // 内容がない場合
        if (!note.memo && !note.marketView) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'day-preview-line';
            emptyDiv.innerHTML = '（内容なし）';
            emptyDiv.style.color = '#7a8599';
            contentDiv.appendChild(emptyDiv);
        }
    }
    
    /**
     * ノート内容をフォーマット（HTML/テキスト→行配列）
     * @param {string} content - コンテンツ
     * @returns {Array} 行の配列
     */
    formatNoteContent(content) {
        if (!content) return [];
        
        // HTMLタグを処理
        let text = content
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/div><div>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<div>/gi, '')
            .replace(/<\/p><p>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<p>/gi, '');
        
        // HTMLタグを除去（スタイル付きタグは保持）
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        
        tempDiv.querySelectorAll('*').forEach(el => this.#normalizeElementStyle(el));
        
        text = tempDiv.innerHTML;
        
        // 改行で分割（空行も保持）
        const lines = text.split('\n');
        
        // 空行は &nbsp; に変換して保持
        return lines.map(line => {
            const trimmed = line.trim();
            return trimmed === '' ? '&nbsp;' : line;
        });
    }

    /**
     * ノート日付を選択
     * @param {string} dateStr - 日付文字列
     */
    selectNoteDate(dateStr) {
        this.#selectedNoteDate = dateStr;
        // グローバル変数との同期
        window.selectedNoteDate = this.#selectedNoteDate;
        
        document.getElementById('noteDate').value = dateStr;
        
        document.querySelectorAll('.day-preview').forEach(preview => {
            preview.classList.remove('selected');
        });
        
        this.displayNoteDetail(dateStr);
        this.loadNoteForDate(dateStr);
        
        // 選択した日付の週に移動
        const selectedDate = new Date(dateStr);
        const day = selectedDate.getDay();
        const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
        this.#currentWeekStart = new Date(selectedDate);
        this.#currentWeekStart.setDate(diff);
        
        this.updateWeeklyPreview();
        
        // EventBus発火
        this.#eventBus?.emit('note:selected', { date: dateStr });
    }

    /**
     * 週を変更
     * @param {number} direction - 方向（-1:前週, 1:翌週）
     */
    changeWeek(direction) {
        if (!this.#currentWeekStart) {
            this.#currentWeekStart = new Date();
            const day = this.#currentWeekStart.getDay();
            const diff = this.#currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
            this.#currentWeekStart.setDate(diff);
        }
        this.#currentWeekStart.setDate(this.#currentWeekStart.getDate() + (direction * 7));
        // グローバル変数との同期
        window.currentWeekStart = this.#currentWeekStart;
        
        this.updateWeeklyPreview();
        
        // EventBus発火
        this.#eventBus?.emit('note:weekChanged', { weekStart: this.#currentWeekStart });
    }

    // ================
    // Public API - ノート詳細表示
    // ================

    /**
     * ノート詳細を表示
     * @param {string} dateStr - 日付文字列
     */
    displayNoteDetail(dateStr) {
        const detailContainer = document.getElementById('noteDetail');
        const note = this.#notes[dateStr];
        
        if (!note) {
            detailContainer.innerHTML = `
                <div class="note-detail-header">
                    <h3>${dateStr}</h3>
                    <div class="note-detail-actions">
                        <button class="btn btn-small edit-btn" onclick="editNote('${dateStr}')">編集</button>
                    </div>
                </div>
                <div class="detail-placeholder">
                    <p>📝 このノートはまだありません</p>
                    <p style="font-size: 0.9em; opacity: 0.7;">編集ボタンをクリックして新規作成</p>
                </div>
            `;
            return;
        }
        
        let detailHTML = `
            <div class="note-detail-header">
                <h3>${dateStr}</h3>
                <div class="note-detail-actions">
                    <button class="btn btn-small edit-btn" onclick="editNote('${dateStr}')">編集</button>
                    <button class="btn btn-small delete-btn" onclick="deleteNote('${dateStr}')">削除</button>
                </div>
            </div>
            <div class="note-detail-content">
        `;
        
        // メモセクション
        if (note.memo) {
            detailHTML += `
                <div class="detail-section">
                    <h4>メモ</h4>
                    <div class="detail-text">${note.memo}</div>
                </div>
            `;
        }
        
        // 相場観セクション
        if (note.marketView) {
            detailHTML += `
                <div class="detail-section">
                    <h4>今日の相場観</h4>
                    <div class="detail-text">${note.marketView}</div>
                </div>
            `;
        }
        
        // 画像セクション
        if (note.images && note.images.length > 0) {
            // 画像を非同期で表示（期限切れURLは自動更新）
            const imagesContainer = `images-container-${Date.now()}`;
            detailHTML += `
                <div class="detail-section">
                    <h4>画像</h4>
                    <div id="${imagesContainer}" class="detail-images">
                        <span class="loading-images">画像読み込み中...</span>
                    </div>
                </div>
            `;
            
            // 詳細表示後に画像を非同期で読み込む
            setTimeout(async () => {
                const container = document.getElementById(imagesContainer);
                if (!container) return;
                
                let imagesHtml = '';
                // 画像データを一時保存用の配列を初期化
                if (!window.tempNoteImages) window.tempNoteImages = {};
                const noteKey = dateStr.replace(/\//g, '-');
                
                for (let idx = 0; idx < note.images.length; idx++) {
                    const img = note.images[idx];
                    // 期限切れURLは自動更新
                    const imgSrc = window.getValidImageSrc 
                        ? await window.getValidImageSrc(img)
                        : window.getImageSrc(img);
                    
                    if (imgSrc) {
                        const imgTitle = window.getImageTitle ? window.getImageTitle(img) : '';
                        // 画像データを一時保存（拡大表示用）
                        const normalized = window.normalizeImageData ? window.normalizeImageData(img) : { src: imgSrc, title: '', description: '' };
                        normalized.src = imgSrc; // 更新されたsrcを設定
                        window.tempNoteImages[`${noteKey}_${idx}`] = normalized;
                        
                        imagesHtml += `
                            <div class="note-detail-image-wrapper">
                                <img src="${imgSrc}" onclick="showImageModalWithCaption(window.tempNoteImages['${noteKey}_${idx}'], {type: 'note', id: '${dateStr}', index: ${idx}})" style="cursor: pointer; max-width: 200px; max-height: 150px; border-radius: 8px;">
                                <button class="note-image-edit-btn" onclick="openImageCaptionEdit('note', '${dateStr}', ${idx})">✏️</button>
                                ${imgTitle ? `<div class="image-caption-title">${imgTitle}</div>` : ''}
                            </div>
                        `;
                    }
                }
                
                container.innerHTML = imagesHtml || '<span class="no-images">画像なし</span>';
                
                // URLが更新されていたらlocalStorageとSupabaseに保存
                if (window.isUrlExpired) {
                    const anyExpired = note.images.some(img => window.isUrlExpired(img));
                    if (!anyExpired && imagesHtml) {
                        // 更新されたデータを保存
                        this.#saveNoteToStorageAndCloud(dateStr, note);
                    }
                }
            }, 0);
        }
        
        detailHTML += '</div>';
        detailContainer.innerHTML = detailHTML;
    }

    // ================
    // Public API - カレンダー（分析タブ用）
    // ================

    /**
     * カレンダーを更新
     */
    updateCalendar() {
        if (!this.#currentCalendarDate) {
            this.#currentCalendarDate = new Date();
        }
        // グローバル変数との同期
        window.currentCalendarDate = this.#currentCalendarDate;
        
        const monthElement = safeGetElement('currentMonth');
        const calendarElement = safeGetElement('calendarDates');
        
        if (!monthElement || !calendarElement) {
            return;
        }
        
        const year = this.#currentCalendarDate.getFullYear();
        const month = this.#currentCalendarDate.getMonth();
        
        monthElement.textContent = `${year}年${month + 1}月`;
        
        calendarElement.innerHTML = '';
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const firstDayOfWeek = firstDay.getDay();
        
        // 前月の日付を追加
        const prevMonthDays = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
        for (let i = prevMonthDays; i > 0; i--) {
            const date = new Date(year, month, 1 - i);
            const dateStr = formatDateForCalendar(date);
            const dayDiv = this.createCalendarDay(date, dateStr, false);
            calendarElement.appendChild(dayDiv);
        }
        
        // 当月の日付を追加
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month, day);
            const dateStr = formatDateForCalendar(date);
            const dayDiv = this.createCalendarDay(date, dateStr, true);
            calendarElement.appendChild(dayDiv);
        }
        
        // 次月の日付を追加
        const remainingDays = 42 - calendarElement.children.length;
        for (let day = 1; day <= remainingDays; day++) {
            const date = new Date(year, month + 1, day);
            const dateStr = formatDateForCalendar(date);
            const dayDiv = this.createCalendarDay(date, dateStr, false);
            calendarElement.appendChild(dayDiv);
        }
    }

    /**
     * カレンダーの日付要素を作成
     * @param {Date} date - 日付
     * @param {string} dateStr - 日付文字列
     * @param {boolean} isCurrentMonth - 当月かどうか
     * @returns {HTMLElement} 日付要素
     */
    createCalendarDay(date, dateStr, isCurrentMonth) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-date';
        
        if (!isCurrentMonth) {
            dayDiv.classList.add('other-month');
        }
        
        // 今日の日付
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            dayDiv.classList.add('today');
        }
        
        // 選択中の日付
        if (this.#selectedDate === dateStr) {
            dayDiv.classList.add('selected');
        }
        
        // トレードがある日
        const trades = window.trades || [];
        const dayTrades = trades.filter(t => {
            const tradeDate = formatDateForCalendar(new Date(t.entryTime));
            return tradeDate === dateStr;
        });
        
        if (dayTrades.length > 0) {
            dayDiv.classList.add('has-trades');
            const indicator = document.createElement('div');
            indicator.className = 'trade-indicator';
            indicator.textContent = dayTrades.length;
            dayDiv.appendChild(indicator);
        }
        
        // ノートがある日
        if (this.#notes[dateStr]) {
            dayDiv.classList.add('has-note');
        }
        
        // 日付表示
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = date.getDate();
        dayDiv.appendChild(dayNumber);
        
        // クリックイベント
        dayDiv.onclick = () => this.selectDate(dateStr);
        
        return dayDiv;
    }

    /**
     * 日付を選択（カレンダー用）
     * @param {string} dateStr - 日付文字列
     */
    selectDate(dateStr) {
        this.#selectedDate = dateStr;
        // グローバル変数との同期
        window.selectedDate = this.#selectedDate;
        
        this.updateCalendar();
        this.displayDateDetails(dateStr);
    }

    /**
     * 日付詳細を表示（カレンダー用）
     * @param {string} dateStr - 日付文字列
     */
    displayDateDetails(dateStr) {
        const detailContainer = document.getElementById('dateDetails');
        if (!detailContainer) return;
        
        const date = new Date(dateStr);
        const trades = window.trades || [];
        const dayTrades = trades.filter(t => {
            const tradeDate = formatDateForCalendar(new Date(t.entryTime));
            return tradeDate === dateStr;
        });
        const note = this.#notes[dateStr];
        
        let detailHTML = `
            <div class="date-detail-header">
                <h3>${date.getMonth() + 1}月${date.getDate()}日 ${['日', '月', '火', '水', '木', '金', '土'][date.getDay()]}曜日</h3>
            </div>
        `;
        
        // トレード情報
        if (dayTrades.length > 0) {
            detailHTML += `
                <div class="date-detail-section">
                    <h4>トレード記録（${dayTrades.length}件）</h4>
                    <div class="trade-summary-list">
            `;
            
            dayTrades.forEach(trade => {
                const pips = calculateTradePips(trade);
                const status = trade.exits.length > 0 ? '決済済み' : '保有中';
                const pipsClass = pips > 0 ? 'positive' : pips < 0 ? 'negative' : '';
                
                detailHTML += `
                    <div class="trade-summary-item">
                        <div>
                            <strong>${trade.pair}</strong>
                            <span class="trade-direction ${trade.direction}">${trade.direction.toUpperCase()}</span>
                        </div>
                        <div>
                            <span class="${pipsClass}">${pips > 0 ? '+' : ''}${pips.toFixed(1)} pips</span>
                            <span class="trade-status">${status}</span>
                        </div>
                    </div>
                `;
            });
            
            detailHTML += `
                    </div>
                    <button class="btn btn-small" onclick="switchTab('records')">
                        トレード記録を見る
                    </button>
                </div>
            `;
        }
        
        // ノート情報
        if (note) {
            detailHTML += `
                <div class="date-detail-section">
                    <h4>相場ノート</h4>
                    <div class="note-summary">
            `;
            
            const memoLines = note.memo ? note.memo.split('<br>').filter(line => line.trim()) : [];
            const marketViewLines = note.marketView ? note.marketView.split('<br>').filter(line => line.trim()) : [];
            const allLines = [...memoLines, ...marketViewLines];
            
            detailHTML += allLines.slice(0, 3).map(line => 
                `<p>${line.length > 50 ? line.substring(0, 50) + '...' : line}</p>`
            ).join('');
            
            detailHTML += `
                        <button class="btn btn-small" onclick="switchTab('notes'); selectNoteDate('${dateStr}')">
                            ノートを見る
                        </button>
                    </div>
                </div>
            `;
        }
        
        if (dayTrades.length === 0 && !note) {
            detailHTML += `
                <div class="detail-placeholder">
                    <p>この日の記録はありません</p>
                    <button class="btn btn-small" onclick="switchTab('new-entry')">
                        トレードを記録
                    </button>
                    <button class="btn btn-small" onclick="switchTab('notes'); document.getElementById('noteDate').value='${dateStr}';">
                        ノートを書く
                    </button>
                </div>
            `;
        }
        
        detailHTML += '</div>';
        detailContainer.innerHTML = detailHTML;
    }

    /**
     * 月を変更（カレンダー用）
     * @param {number} direction - 方向（-1:前月, 1:翌月）
     */
    changeMonth(direction) {
        if (!this.#currentCalendarDate) {
            this.#currentCalendarDate = new Date();
        }
        this.#currentCalendarDate.setMonth(this.#currentCalendarDate.getMonth() + direction);
        // グローバル変数との同期
        window.currentCalendarDate = this.#currentCalendarDate;
        
        this.updateCalendar();
    }

    // ================
    // Public API - 週カレンダーモーダル
    // ================

    /**
     * 週カレンダーモーダルを表示
     */
    showWeekCalendar() {
        if (!this.#currentCalendarDate) {
            this.#currentCalendarDate = new Date();
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'weekCalendarModal';
        modal.style.display = 'flex';
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxWidth = '600px';
        
        content.innerHTML = `
            <div class="modal-header">
                <h2>📅 週を選択</h2>
                <button class="modal-close" onclick="closeWeekCalendarModal()">×</button>
            </div>
            <div style="padding: 20px;">
                <div class="calendar-navigation" style="margin-bottom: 20px; text-align: center;">
                    <button class="btn btn-small btn-secondary" onclick="changeCalendarMonth(-1)">◀ 前月</button>
                    <span id="calendarMonthYear" style="font-size: 1.2rem; font-weight: bold; margin: 0 20px;"></span>
                    <button class="btn btn-small btn-secondary" onclick="changeCalendarMonth(1)">翌月 ▶</button>
                </div>
                <div id="weekCalendarGrid"></div>
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        this.updateWeekCalendar();
    }

    /**
     * 週カレンダーを更新
     */
    updateWeekCalendar() {
        if (!this.#currentCalendarDate) {
            this.#currentCalendarDate = new Date();
        }
        
        const monthYearElement = document.getElementById('calendarMonthYear');
        const gridElement = document.getElementById('weekCalendarGrid');
        
        if (!monthYearElement || !gridElement) return;
        
        const year = this.#currentCalendarDate.getFullYear();
        const month = this.#currentCalendarDate.getMonth();
        
        monthYearElement.textContent = `${year}年${month + 1}月`;
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const firstDayOfWeek = firstDay.getDay();
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - (firstDayOfWeek === 0 ? 6 : firstDayOfWeek));
        
        // 曜日ヘッダー
        let html = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-bottom: 10px;">';
        const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
        weekDays.forEach(day => {
            html += `<div style="text-align: center; font-weight: bold; padding: 5px;">${day}</div>`;
        });
        html += '</div>';
        
        // カレンダー日付
        html += '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">';
        
        const currentDate = new Date(startDate);
        for (let week = 0; week < 6; week++) {
            for (let day = 0; day < 7; day++) {
                const dateStr = formatDateForInput(currentDate);
                const isCurrentMonth = currentDate.getMonth() === month;
                const isToday = currentDate.toDateString() === new Date().toDateString();
                const hasNote = this.#notes[dateStr];
                
                html += `
                    <div 
                        onclick="selectWeekFromDate('${dateStr}')" 
                        style="padding: 10px; text-align: center; cursor: pointer; 
                               border-radius: 5px; 
                               opacity: ${isCurrentMonth ? '1' : '0.5'};
                               background: ${isToday ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 255, 255, 0.05)'}">
                        ${currentDate.getDate()}
                    </div>
                `;
                
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
        
        html += '</div>';
        gridElement.innerHTML = html;
    }

    /**
     * 日付から週を選択
     * @param {string} dateStr - 日付文字列
     */
    selectWeekFromDate(dateStr) {
        const selectedDate = new Date(dateStr);
        const day = selectedDate.getDay();
        const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
        
        this.#currentWeekStart = new Date(selectedDate);
        this.#currentWeekStart.setDate(diff);
        // グローバル変数との同期
        window.currentWeekStart = this.#currentWeekStart;
        
        this.updateWeeklyPreview();
        this.closeWeekCalendarModal();
        
        document.getElementById('noteDate').value = dateStr;
        this.loadNoteForDate(dateStr);
    }

    /**
     * カレンダーモーダルの月を変更
     * @param {number} direction - 方向（-1:前月, 1:翌月）
     */
    changeCalendarMonth(direction) {
        if (!this.#currentCalendarDate) {
            this.#currentCalendarDate = new Date();
        }
        this.#currentCalendarDate.setMonth(this.#currentCalendarDate.getMonth() + direction);
        this.updateWeekCalendar();
    }

    /**
     * 週カレンダーモーダルを閉じる
     */
    closeWeekCalendarModal() {
        const modal = document.getElementById('weekCalendarModal');
        if (modal) modal.remove();
    }

    // ================
    // Private Methods - イベントバインド
    // ================

    #bindEvents() {
        // TradeManagerからのイベントを購読
        this.#eventBus?.on('trade:added', () => {
            this.updateCalendar();
        });
        
        this.#eventBus?.on('trade:deleted', () => {
            this.updateCalendar();
        });
        
        // クラウド同期後にデータとUIを更新
        this.#eventBus?.on('sync:notes:synced', (data) => {
            console.log('[NoteManagerModule] クラウド同期検知、データ再読み込み');
            this.#reloadFromLocalStorage();
        });
    }

    // ================
    // Private Methods - グローバル関数登録
    // ================

    #registerGlobalFunctions() {
        // ノート操作
        window.saveNote = () => this.saveNote();
        window.saveOrUpdateNote = () => this.saveOrUpdateNote();
        window.editNote = (d) => this.editNote(d);
        window.deleteNote = (d) => this.deleteNote(d);
        window.cancelEdit = () => this.cancelEdit();
        window.loadNoteForDate = (d) => this.loadNoteForDate(d);
        window.clearNoteForm = () => this.clearNoteForm();
        window.saveNoteTemporary = () => this.saveNoteTemporary();
        
        // 画像処理
        window.addNoteImage = () => this.addNoteImage();
        window.addNoteImageAt = (i) => this.addNoteImageAt(i);
        window.displayNoteImage = (s) => this.displayNoteImage(s);
        window.showImageFullscreen = (s) => this.showImageFullscreen(s);
        window.removeNoteImage = (i) => this.removeNoteImage(i);
        window.removeNoteImageAt = (i) => this.removeNoteImageAt(i);
        window.collectNoteImages = () => this.collectNoteImages();
        window.updateImageIndices = () => this.updateImageIndices();
        window.restoreNoteImages = (arr) => this.restoreNoteImages(arr);
        
        // 日付操作
        window.changeDate = (d) => this.changeDate(d);
        window.setToday = () => this.setToday();
        
        // 週間プレビュー
        window.initializeWeekView = () => this.initializeWeekView();
        window.updateWeeklyPreview = () => this.updateWeeklyPreview();
        window.selectNoteDate = (d) => this.selectNoteDate(d);
        window.changeWeek = (d) => this.changeWeek(d);
        window.createDayPreview = (date, dateStr, note, weekday) => this.createDayPreview(date, dateStr, note, weekday);
        window.toggleDayAccordion = (dayDiv, dateStr, note) => this.toggleDayAccordion(dayDiv, dateStr, note);
        
        // ノート詳細
        window.displayNoteDetail = (d) => this.displayNoteDetail(d);
        
        // カレンダー
        window.updateCalendar = () => this.updateCalendar();
        window.createCalendarDay = (date, dateStr, isCurrentMonth) => this.createCalendarDay(date, dateStr, isCurrentMonth);
        window.selectDate = (d) => this.selectDate(d);
        window.displayDateDetails = (d) => this.displayDateDetails(d);
        window.changeMonth = (d) => this.changeMonth(d);
        
        // 週カレンダーモーダル
        window.showWeekCalendar = () => this.showWeekCalendar();
        window.updateWeekCalendar = () => this.updateWeekCalendar();
        window.selectWeekFromDate = (d) => this.selectWeekFromDate(d);
        window.changeCalendarMonth = (d) => this.changeCalendarMonth(d);
        window.closeWeekCalendarModal = () => this.closeWeekCalendarModal();
        
        // フォーマット
        window.applyNoteFormat = (e, f) => this.applyNoteFormat(e, f);
        window.applyFontSize = (e, s) => this.applyFontSize(e, s);
        window.applyFormatting = (e, f) => this.applyFormatting(e, f);
        window.setupNoteAutoSave = () => this.setupNoteAutoSave();
        window.autoSaveNoteQuietly = () => this.autoSaveNoteQuietly();
        
        // HTMLクリーンアップ
        window.cleanupNoteHTML = (h) => this.cleanupNoteHTML(h);
        
        // 検索機能
        window.searchNotes = (k) => this.searchNotes(k);
        
        // 月メモ機能
        window.getAnomalyMemo = (m) => this.getAnomalyMemo(m);
        window.getMonthlyMemo = (ym) => this.getMonthlyMemo(ym);
        window.saveAnomalyMemo = (m, t) => this.saveAnomalyMemo(m, t);
        window.saveMonthlyMemo = (ym, t) => this.saveMonthlyMemo(ym, t);
        window.getCollapseState = (t) => this.getCollapseState(t);
        window.setCollapseState = (t, c) => this.setCollapseState(t, c);
        window.toggleCollapseState = (t) => this.toggleCollapseState(t);
        window.getCurrentMonthInfo = () => this.getCurrentMonthInfo();
        
        // 月メモUI操作
        window.updateMonthlyMemoDisplay = () => this.updateMonthlyMemoDisplay();
        window.toggleMonthlyMemoSection = (t) => this.toggleMonthlyMemoSection(t);
        
        // 検索モーダル操作
        window.openNoteSearchModal = () => this.openNoteSearchModal();
        window.closeNoteSearchModal = () => this.closeNoteSearchModal();
        window.executeNoteSearch = () => this.executeNoteSearch();
        window.jumpToNoteFromSearch = (d) => this.jumpToNoteFromSearch(d);
        
        // 月メモ編集モーダル操作
        window.openMonthlyMemoEditModal = (t) => this.openMonthlyMemoEditModal(t);
        window.closeMonthlyMemoEditModal = () => this.closeMonthlyMemoEditModal();
        window.saveMonthlyMemoFromModal = () => this.saveMonthlyMemoFromModal();
    }

    // ================
    // Private Methods - DOM初期化
    // ================

    #setupDOMContentLoaded() {
        // DOMContentLoadedで自動実行
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.#onDOMReady());
        } else {
            // すでにDOMが読み込まれている場合
            setTimeout(() => this.#onDOMReady(), 100);
        }
    }

    #onDOMReady() {
        setTimeout(() => {
            // 週間プレビューの初期化
            this.initializeWeekView();
            
            // ノート日付の初期設定
            const noteDateElement = document.getElementById('noteDate');
            if (noteDateElement) {
                const today = formatDateForInput(new Date());
                noteDateElement.value = today;
                this.loadNoteForDate(today);
            }
            
            // 自動保存の設定
            this.setupNoteAutoSave();
            
            // 月メモ表示の初期化
            this.updateMonthlyMemoDisplay();
            
            // 詳細表示エリアの確実な初期化
            const detailContainer = document.getElementById('noteDetail');
            if (detailContainer && !detailContainer.querySelector('.detail-placeholder') && !detailContainer.querySelector('.note-detail-content')) {
                detailContainer.innerHTML = `
                    <div class="detail-placeholder">
                        <p>📝 日付を選択してノートを表示</p>
                    </div>
                `;
            }
            
            // 50:50レイアウトの確実な設定
            const noteDisplayContainer = document.querySelector('.note-display-container');
            if (noteDisplayContainer) {
                noteDisplayContainer.style.gridTemplateColumns = '';
                setTimeout(() => {
                    if (window.getComputedStyle(noteDisplayContainer).gridTemplateColumns.includes('px')) {
                        noteDisplayContainer.style.gridTemplateColumns = '1fr 1fr';
                    }
                }, 200);
            }
        }, 100);
    }
}

// ================
// グローバル登録
// ================
console.log('[NoteManagerModule] クラス定義完了、インスタンス化開始...');

try {
    const noteManagerInstance = new NoteManagerModule();
    window.NoteManagerModule = noteManagerInstance;
    console.log('[NoteManagerModule] ✅ インスタンス化完了 (with XSS protection)');
} catch (error) {
    console.error('[NoteManagerModule] ❌ インスタンス化エラー:', error);
}

})(); // IIFE終了

// ========== NoteManagerModule.js 終了 ==========