/**
 * @module SettingsModule
 * @description 設定タブの完全管理（既存機能+新機能）
 * @author AI Assistant / コンパナ
 * @version 1.0.2
 * @important MODULES.md準拠 - 6点セット実装
 */
class SettingsModule {
    // ================
    // プライベートフィールド
    // ================
    
    // 既存機能のデータ
    #siteTitle = '';
    #siteSubtitle = '';
    #userIcon = '';
    #theme = 'dark';
    #goals = {
        goals: [
            { text: '', deadline: '', achieved: false },
            { text: '', deadline: '', achieved: false },
            { text: '', deadline: '', achieved: false }
        ]
    };
    
    // 新機能のデータ
    #brokers = { list: [], nextId: 1 };
    #favoritePairs = [];
    #currentSubtab = 'basic';
    #presetBrokers = [];  // プリセットブローカーデータ
    #presetPairs = [];    // プリセット通貨ペア
    
    // NEW: 許容損失管理
    #riskTolerance = null;
    
    // NEW: 手法管理
    #methods = [];
    
    // システム
    #eventBus = null;
    #initialized = false;
    
    // localStorage キー定義
    static STORAGE_KEYS = {
        // 既存キー
        SITE_TITLE: 'siteTitle',
        SITE_SUBTITLE: 'siteSubtitle',
        USER_ICON: 'userIcon',
        THEME: 'theme',
        GOALS: 'goalsData',
        GOAL_TEXT_1: 'goalText1',
        GOAL_TEXT_2: 'goalText2',
        GOAL_TEXT_3: 'goalText3',
        GOAL_DEADLINE_1: 'goalDeadline1',
        GOAL_DEADLINE_2: 'goalDeadline2',
        GOAL_DEADLINE_3: 'goalDeadline3',
        // 新規キー
        BROKERS: 'brokers',
        FAVORITE_PAIRS: 'favoritePairs',
        LAST_SUBTAB: 'lastSettingsSubtab',
        // NEW: トレード分析強化
        RISK_TOLERANCE: 'tc_risk_tolerance',
        METHODS: 'tc_methods',
        SHOW_BROKER_BADGE: 'tc_show_broker_badge'
    };
    
    // 定数
    static CONSTANTS = {
        MAX_FAVORITE_PAIRS: 10,
        LOT_UNITS: {
            STANDARD: 100000,    // 標準ロット
            MINI: 10000,         // ミニロット
            MICRO: 1000,         // マイクロロット
            CUSTOM: 0            // カスタム
        }
    };
    
    constructor() {
        console.log('SettingsModule: Initializing...');
        this.#eventBus = window.eventBus;
        this.#initialize();
    }
    
    // ================
    // 初期化
    // ================
    
    #initialize() {
        try {
            // データ読み込み
            this.#loadAll();
            
            // テーマを適用
            this.setTheme(this.#theme);
            
            // プリセットブローカー読み込み
            this.#loadPresetBrokers();
            
            // プリセット通貨ペア読み込み
            this.#loadPresetPairs();
            
            // グローバル関数の置き換え
            this.#replaceGlobalFunctions();
            
            // イベントリスナー設定
            this.#bindEvents();
            
            // ヘッダーの目標表示を更新
            this.updateGoalsDisplay();
            
            // テーマボタンの状態を更新
            this.#updateThemeButtons();
            
            this.#initialized = true;
            console.log('SettingsModule: Initialization complete');
            
            // EventBus通知
            this.#eventBus?.emit('settings:initialized', {
                brokersCount: this.#brokers.list.length,
                favoritePairsCount: this.#favoritePairs.length,
                presetBrokersCount: this.#presetBrokers.length
            });
            
        } catch (error) {
            console.error('SettingsModule: Initialization failed', error);
        }
    }
    
    #loadAll() {
        // 既存データの読み込み
        this.#siteTitle = localStorage.getItem(SettingsModule.STORAGE_KEYS.SITE_TITLE) || 'トレード記録システム';
        this.#siteSubtitle = localStorage.getItem(SettingsModule.STORAGE_KEYS.SITE_SUBTITLE) || '完全な記録で、成長を加速する';
        this.#userIcon = localStorage.getItem(SettingsModule.STORAGE_KEYS.USER_ICON) || '';
        this.#theme = localStorage.getItem(SettingsModule.STORAGE_KEYS.THEME) || 'dark';
        
        // 目標データの読み込み
        // StorageValidatorで安全に読み込み
        const loadedGoals = StorageValidator.safeLoad(
            SettingsModule.STORAGE_KEYS.GOALS,
            null,
            StorageValidator.isGoalsFormat
        );
        if (loadedGoals) {
            this.#goals = loadedGoals;
        }
        
        // 個別キーからも読み込み（後方互換性）
        for (let i = 1; i <= 3; i++) {
            const textKey = `GOAL_TEXT_${i}`;
            const deadlineKey = `GOAL_DEADLINE_${i}`;
            const text = localStorage.getItem(SettingsModule.STORAGE_KEYS[textKey]);
            const deadline = localStorage.getItem(SettingsModule.STORAGE_KEYS[deadlineKey]);
            
            if (text) this.#goals.goals[i-1].text = text;
            if (deadline) this.#goals.goals[i-1].deadline = deadline;
        }
        
        // 新規データの読み込み
        this.#loadBrokers();
        this.#loadFavoritePairs();
        this.#loadCurrentSubtab();
        
        // NEW: 許容損失・手法の読み込み
        this.#loadRiskTolerance();
        this.#loadMethods();
    }
    
    #loadBrokers() {
        // StorageValidatorで安全に読み込み
        const parsed = StorageValidator.safeLoad(
            SettingsModule.STORAGE_KEYS.BROKERS,
            null,
            StorageValidator.isBrokersFormat
        );
        
        if (parsed) {
            // 新形式: { list: [], nextId: number }
            if (parsed.list && Array.isArray(parsed.list)) {
                this.#brokers = parsed;
            }
            // 旧形式: 配列のみ（互換性維持）
            else if (Array.isArray(parsed)) {
                this.#brokers = {
                    list: parsed,
                    nextId: parsed.length > 0 ? Math.max(...parsed.map(b => b.id || 0)) + 1 : 1
                };
                // 新形式で保存し直す
                this.#saveBrokers();
            }
        }
        console.log(`SettingsModule: ${this.#brokers.list.length}件のブローカーを読み込み`);
    }
    
    #loadFavoritePairs() {
        // StorageValidatorで安全に読み込み
        this.#favoritePairs = StorageValidator.safeLoad(
            SettingsModule.STORAGE_KEYS.FAVORITE_PAIRS,
            [],
            StorageValidator.isFavoritePairsFormat
        );
        console.log(`SettingsModule: ${this.#favoritePairs.length}件のお気に入り通貨ペアを読み込み`);
    }
    
    #loadCurrentSubtab() {
        const stored = localStorage.getItem(SettingsModule.STORAGE_KEYS.LAST_SUBTAB);
        if (stored) {
            this.#currentSubtab = stored;
        }
    }
    
    // NEW: 許容損失の読み込み
    #loadRiskTolerance() {
        const saved = localStorage.getItem(SettingsModule.STORAGE_KEYS.RISK_TOLERANCE);
        this.#riskTolerance = saved ? parseInt(saved, 10) : null;
        console.log('SettingsModule: Risk tolerance loaded', this.#riskTolerance);
    }
    
    // NEW: 手法の読み込み
    #loadMethods() {
        const saved = localStorage.getItem(SettingsModule.STORAGE_KEYS.METHODS);
        this.#methods = saved ? JSON.parse(saved) : [];
        console.log(`SettingsModule: ${this.#methods.length}件の手法を読み込み`);
    }
    
    #loadPresetBrokers() {
        // グローバル変数から読み込み
        if (window.PRESET_BROKERS && Array.isArray(window.PRESET_BROKERS)) {
            this.#presetBrokers = window.PRESET_BROKERS;
            console.log('SettingsModule: Preset brokers loaded', this.#presetBrokers.length);
        } else {
            console.warn('SettingsModule: PRESET_BROKERS not found');
            this.#presetBrokers = [];
        }
    }
    
    /**
     * プリセット通貨ペアを読み込み
     * @private
     */
    #loadPresetPairs() {
        if (window.PRESET_CURRENCY_PAIRS) {
            this.#presetPairs = window.PRESET_CURRENCY_PAIRS;
            console.log('SettingsModule: Loaded', this.#presetPairs.length, 'preset pairs');
        } else {
            console.warn('SettingsModule: PRESET_CURRENCY_PAIRS not found');
            this.#presetPairs = [];
        }
    }
    
    // ================
    // Public API - サイトタイトル・サブタイトル
    // ================
    
    /**
     * サイトタイトルを更新
     * @param {string} title - 新しいタイトル
     * @returns {boolean} 成功/失敗
     */
    updateSiteTitle(title) {
        try {
            if (!title || typeof title !== 'string') {
                throw new Error('Invalid title');
            }
            
            const trimmedTitle = title.trim();
            if (!trimmedTitle) {
                throw new Error('Title cannot be empty');
            }
            
            this.#siteTitle = trimmedTitle;
            localStorage.setItem(SettingsModule.STORAGE_KEYS.SITE_TITLE, trimmedTitle);
            
            // UI更新
            const headerTitle = document.getElementById('headerTitle');
            if (headerTitle) headerTitle.textContent = trimmedTitle;
            document.title = trimmedTitle;
            
            // EventBus通知
            this.#eventBus?.emit('settings:titleUpdated', { title: trimmedTitle });
            this.#eventBus?.emit('settings:changed', { source: 'siteTitle' });
            
            console.log('SettingsModule: Title updated:', trimmedTitle);
            return true;
            
        } catch (error) {
            console.error('SettingsModule.updateSiteTitle error:', error);
            return false;
        }
    }
    
    /**
     * サイトサブタイトルを更新
     * @param {string} subtitle - 新しいサブタイトル
     * @returns {boolean} 成功/失敗
     */
    updateSiteSubtitle(subtitle) {
        try {
            if (!subtitle || typeof subtitle !== 'string') {
                throw new Error('Invalid subtitle');
            }
            
            const trimmedSubtitle = subtitle.trim();
            if (!trimmedSubtitle) {
                throw new Error('Subtitle cannot be empty');
            }
            
            this.#siteSubtitle = trimmedSubtitle;
            localStorage.setItem(SettingsModule.STORAGE_KEYS.SITE_SUBTITLE, trimmedSubtitle);
            
            // UI更新
            const headerSubtitle = document.getElementById('headerSubtitle');
            if (headerSubtitle) headerSubtitle.textContent = trimmedSubtitle;
            
            // EventBus通知
            this.#eventBus?.emit('settings:subtitleUpdated', { subtitle: trimmedSubtitle });
            this.#eventBus?.emit('settings:changed', { source: 'subtitle' });
            
            console.log('SettingsModule: Subtitle updated:', trimmedSubtitle);
            return true;
            
        } catch (error) {
            console.error('SettingsModule.updateSiteSubtitle error:', error);
            return false;
        }
    }
    
    /**
     * サイトタイトルを取得
     * @returns {string} サイトタイトル
     */
    getSiteTitle() {
        return this.#siteTitle;
    }
    
    /**
     * サイトサブタイトルを取得
     * @returns {string} サイトサブタイトル
     */
    getSiteSubtitle() {
        return this.#siteSubtitle;
    }
    
    // ================
    // Public API - ユーザーアイコン
    // ================
    
    /**
     * ユーザーアイコンを更新
     * @param {string} iconUrl - 新しいアイコンURL（Base64可）
     * @returns {boolean} 成功/失敗
     */
    updateUserIcon(iconUrl) {
        try {
            if (!iconUrl || typeof iconUrl !== 'string') {
                throw new Error('Invalid icon URL');
            }
            
            this.#userIcon = iconUrl;
            localStorage.setItem(SettingsModule.STORAGE_KEYS.USER_ICON, iconUrl);
            
            // UI更新
            const iconImg = document.getElementById('userIcon');
            if (iconImg) iconImg.src = iconUrl;
            
            // EventBus通知
            this.#eventBus?.emit('settings:iconUpdated', { iconUrl });
            
            console.log('SettingsModule: Icon updated');
            return true;
            
        } catch (error) {
            console.error('SettingsModule.updateUserIcon error:', error);
            return false;
        }
    }
    
    /**
     * ユーザーアイコンをクリア
     * @returns {boolean} 成功/失敗
     */
    clearUserIcon() {
        try {
            this.#userIcon = '';
            localStorage.removeItem(SettingsModule.STORAGE_KEYS.USER_ICON);
            
            // UI更新
            const iconImg = document.getElementById('userIcon');
            if (iconImg) iconImg.src = 'images/default-icon.png';
            
            // EventBus通知
            this.#eventBus?.emit('settings:iconCleared');
            
            console.log('SettingsModule: Icon cleared');
            return true;
            
        } catch (error) {
            console.error('SettingsModule.clearUserIcon error:', error);
            return false;
        }
    }
    
    /**
     * ユーザーアイコンを取得
     * @returns {string} アイコンURL
     */
    getUserIcon() {
        return this.#userIcon;
    }
    
    // ================
    // Public API - テーマ
    // ================
    
    /**
     * テーマを設定
     * @param {string} theme - 'light' | 'dark'
     * @returns {boolean} 成功/失敗
     */
    setTheme(theme) {
        try {
            if (!['light', 'dark'].includes(theme)) {
                throw new Error('Invalid theme');
            }
            
            this.#theme = theme;
            localStorage.setItem(SettingsModule.STORAGE_KEYS.THEME, theme);
            
            // UI更新
            const body = document.body;
            if (theme === 'light') {
                // ライトモードの場合、light-modeクラスを追加
                body.classList.add('light-mode');
            } else {
                // ダークモードの場合、light-modeクラスを削除
                body.classList.remove('light-mode');
            }
            
            console.log('SettingsModule: Theme applied', theme, 'body classes:', body.className);
            
            // テーマボタンのアクティブ状態を更新
            this.#updateThemeButtons();
            
            // EventBus通知
            this.#eventBus?.emit('settings:themeChanged', { theme });
            
            console.log('SettingsModule: Theme changed to', theme);
            return true;
            
        } catch (error) {
            console.error('SettingsModule.setTheme error:', error);
            return false;
        }
    }
    
    /**
     * 現在のテーマを取得
     * @returns {string} 'light' | 'dark'
     */
    getTheme() {
        return this.#theme;
    }
    
    /**
     * テーマをトグル切り替え（ショートカット用）
     * @returns {boolean} 成功/失敗
     */
    toggleTheme() {
        const newTheme = this.#theme === 'dark' ? 'light' : 'dark';
        console.log('SettingsModule: Toggle theme from', this.#theme, 'to', newTheme);
        return this.setTheme(newTheme);
    }
    
    /**
     * テーマボタンのアクティブ状態を更新
     * @private
     */
    #updateThemeButtons() {
        try {
            const themeButtons = document.querySelectorAll('.theme-btn');
            
            themeButtons.forEach(button => {
                const onclick = button.getAttribute('onclick');
                
                // onclickから対象テーマを判定
                if (onclick && onclick.includes('dark')) {
                    // ダークモードボタン
                    if (this.#theme === 'dark') {
                        button.classList.add('active');
                    } else {
                        button.classList.remove('active');
                    }
                } else if (onclick && onclick.includes('light')) {
                    // ライトモードボタン
                    if (this.#theme === 'light') {
                        button.classList.add('active');
                    } else {
                        button.classList.remove('active');
                    }
                }
            });
            
            console.log('SettingsModule: Theme buttons updated, current theme:', this.#theme);
            
        } catch (error) {
            console.error('SettingsModule.#updateThemeButtons error:', error);
        }
    }
    
    // ================
    // Public API - 目標
    // ================
    
    /**
     * 目標を保存
     * @returns {boolean} 成功/失敗
     */
    saveGoals() {
        try {
            // 入力フィールドから目標を取得
            for (let i = 1; i <= 3; i++) {
                const textInput = document.getElementById(`goalText${i}`);
                const deadlineInput = document.getElementById(`goalDeadline${i}`);
                
                if (textInput && deadlineInput) {
                    this.#goals.goals[i-1].text = textInput.value;
                    this.#goals.goals[i-1].deadline = deadlineInput.value;
                }
            }
            
            // 保存
            localStorage.setItem(SettingsModule.STORAGE_KEYS.GOALS, JSON.stringify(this.#goals));
            
            // ヘッダー表示を更新
            this.updateGoalsDisplay();
            
            // EventBus通知
            this.#eventBus?.emit('settings:goalsSaved', { goals: this.#goals });
            
            console.log('SettingsModule: Goals saved');
            return true;
            
        } catch (error) {
            console.error('SettingsModule.saveGoals error:', error);
            return false;
        }
    }
    
    /**
     * 特定の目標を達成済みにする
     * @param {number} goalIndex - 目標番号（1-3）
     * @returns {boolean} 成功/失敗
     */
    achieveGoal(goalIndex) {
        try {
            if (goalIndex < 1 || goalIndex > 3) {
                throw new Error('Invalid goal index');
            }
            
            const index = goalIndex - 1;
            this.#goals.goals[index].achieved = true;
            localStorage.setItem(SettingsModule.STORAGE_KEYS.GOALS, JSON.stringify(this.#goals));
            
            // ヘッダー表示を更新
            this.updateGoalsDisplay();
            
            // EventBus通知
            this.#eventBus?.emit('settings:goalAchieved', { goalIndex });
            
            console.log('SettingsModule: Goal', goalIndex, 'achieved');
            return true;
            
        } catch (error) {
            console.error('SettingsModule.achieveGoal error:', error);
            return false;
        }
    }
    
    /**
     * すべての目標を取得
     * @returns {Object} 目標データ
     */
    getAllGoals() {
        return { ...this.#goals };
    }
    
    /**
     * セルフイメージ表示を更新
     */
    /**
     * セルフイメージ表示を更新
     */
    updateGoalsDisplay() {
        try {
            const goalsDisplay = document.getElementById('goalsDisplay');
            if (!goalsDisplay) {
                console.warn('SettingsModule: goalsDisplay element not found');
                return;
            }

            const goals = this.#goals.goals;
            let html = '';

            for (let i = 0; i < 3; i++) {
                const goal = goals[i];
                const hasGoal = goal && goal.text;
                const displayText = hasGoal ? goal.text : '目標を設定';
                const achievedClass = goal.achieved ? 'achieved' : '';
                
                // 期限の表示（日付がある場合のみ、下の行に表示）
                let deadlineHtml = '';
                if (hasGoal && goal.deadline) {
                    // 日付をフォーマット（YYYY-MM-DD → YYYY/M/D）
                    const date = new Date(goal.deadline + 'T00:00:00');
                    const year = date.getFullYear();
                    const month = date.getMonth() + 1;
                    const day = date.getDate();
                    const formattedDate = `${year}/${month}/${day}`;
                    
                    deadlineHtml = `<div style="font-size: 0.75em; opacity: 0.7; margin-top: 2px;">期限: ${formattedDate}</div>`;
                }

                html += `
                    <div class="goal-item ${achievedClass}" data-goal="${i + 1}">
                        <span class="goal-text">
                            <div>${displayText}</div>
                            ${deadlineHtml}
                        </span>
                    </div>
                `;
            }

            goalsDisplay.innerHTML = html;
            console.log('SettingsModule: Goals display updated (no checkmark)');

        } catch (error) {
            console.error('SettingsModule.updateGoalsDisplay error:', error);
        }
    }
    
    // ================
    // Public API - サブタブ
    // ================
    
    /**
     * サブタブを切り替える
     * @param {string} subtabName - サブタブ名（'basic' | 'trading' | 'data' | 'mypage'）
     * @returns {boolean} 成功/失敗
     */
    switchSubtab(subtabName) {
        try {
            const validSubtabs = ['basic', 'trading', 'data', 'mypage'];
            if (!validSubtabs.includes(subtabName)) {
                throw new Error(`Invalid subtab: ${subtabName}`);
            }
            
            // すべてのサブタブコンテンツを非表示
            document.querySelectorAll('.settings-subtab-content').forEach(content => {
                content.classList.remove('active');
                content.style.display = 'none';
            });
            
            // すべてのサブタブボタンから active を削除
            document.querySelectorAll('.settings-subtab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // 選択されたサブタブを表示
            const targetContent = document.getElementById(`settings-${subtabName}`);
            const targetBtn = document.querySelector(`.settings-subtab-btn[data-subtab="${subtabName}"]`);
            
            if (targetContent) {
                targetContent.classList.add('active');
                targetContent.style.display = 'block';
            }
            
            if (targetBtn) {
                targetBtn.classList.add('active');
            }
            
            // 状態保存
            this.#currentSubtab = subtabName;
            localStorage.setItem(SettingsModule.STORAGE_KEYS.LAST_SUBTAB, subtabName);
            
            // EventBus通知
            this.#eventBus?.emit('settings:subtabChanged', { subtab: subtabName });
            
            console.log('SettingsModule: Switched to subtab', subtabName);
            return true;
            
        } catch (error) {
            console.error('SettingsModule.switchSubtab error:', error);
            return false;
        }
    }
    
    /**
     * 現在のサブタブを取得
     * @returns {string} サブタブ名
     */
    getCurrentSubtab() {
        return this.#currentSubtab;
    }
    
    // ================
    // Public API - ブローカー管理
    // ================
    
    /**
     * ブローカーを追加
     * @param {Object} brokerData - ブローカーデータ
     * @returns {Object} 結果
     */
    addBroker(brokerData) {
        try {
            if (!this.#validateBroker(brokerData)) {
                throw new Error('Invalid broker data');
            }
            
            // 重複チェック
            if (this.#isDuplicateBroker(brokerData.name)) {
                throw new Error('このブローカーは既に登録されています');
            }
            
            const newBroker = {
                id: this.#brokers.nextId++,
                name: brokerData.name.trim(),
                shortName: brokerData.shortName ? brokerData.shortName.trim() : brokerData.name.trim(),
                lotUnit: parseInt(brokerData.lotUnit),
                defaultLot: brokerData.defaultLot ? parseFloat(brokerData.defaultLot) : null,
                isCustom: brokerData.isCustom || false,
                createdAt: new Date().toISOString()
            };
            
            this.#brokers.list.push(newBroker);
            this.#saveBrokers();
            
            // EventBus通知
            this.#eventBus?.emit('settings:brokerAdded', { broker: newBroker });
            
            console.log('SettingsModule: Broker added', newBroker.name);
            return { success: true, data: newBroker };
            
        } catch (error) {
            console.error('SettingsModule.addBroker error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * ブローカーを更新
     * @param {number} brokerId - ブローカーID
     * @param {Object} brokerData - 更新データ
     * @returns {Object} 結果
     */
    updateBroker(brokerId, brokerData) {
        try {
            const broker = this.#brokers.list.find(b => b.id === brokerId);
            if (!broker) {
                throw new Error('Broker not found');
            }
            
            if (!this.#validateBroker(brokerData)) {
                throw new Error('Invalid broker data');
            }
            
            // 名前が変更された場合は重複チェック
            if (brokerData.name !== broker.name && this.#isDuplicateBroker(brokerData.name)) {
                throw new Error('このブローカー名は既に使用されています');
            }
            
            broker.name = brokerData.name.trim();
            broker.shortName = brokerData.shortName ? brokerData.shortName.trim() : brokerData.name.trim();
            broker.lotUnit = parseInt(brokerData.lotUnit);
            broker.defaultLot = brokerData.defaultLot ? parseFloat(brokerData.defaultLot) : null;
            broker.updatedAt = new Date().toISOString();
            
            this.#saveBrokers();
            
            // EventBus通知
            this.#eventBus?.emit('settings:brokerUpdated', { broker });
            
            console.log('SettingsModule: Broker updated', broker.name);
            return { success: true, data: broker };
            
        } catch (error) {
            console.error('SettingsModule.updateBroker error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * ブローカーを削除
     * @param {number} brokerId - ブローカーID
     * @returns {Object} 結果
     */
    deleteBroker(brokerId) {
        try {
            const index = this.#brokers.list.findIndex(b => b.id === brokerId);
            if (index === -1) {
                throw new Error('Broker not found');
            }
            
            const deletedBroker = this.#brokers.list[index];
            this.#brokers.list.splice(index, 1);
            this.#saveBrokers();
            
            // EventBus通知
            this.#eventBus?.emit('settings:brokerDeleted', { broker: deletedBroker });
            
            console.log('SettingsModule: Broker deleted', deletedBroker.name);
            return { success: true, data: deletedBroker };
            
        } catch (error) {
            console.error('SettingsModule.deleteBroker error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * すべてのブローカーを取得
     * @returns {Array} ブローカー配列
     */
    getAllBrokers() {
        // 安全対策: listが配列でない場合は空配列を返す
        if (!this.#brokers || !Array.isArray(this.#brokers.list)) {
            console.warn('SettingsModule: #brokers.list is not valid, returning empty array');
            return [];
        }
        return [...this.#brokers.list];
    }
    
    /**
     * ブローカーをIDで取得
     * @param {number} brokerId - ブローカーID
     * @returns {Object|null} ブローカーまたはnull
     */
    getBrokerById(brokerId) {
        return this.#brokers.list.find(b => b.id === brokerId) || null;
    }
    
    /**
     * プリセットブローカーを取得
     * @returns {Array} プリセットブローカー配列
     */
    getPresetBrokers() {
        return [...this.#presetBrokers];
    }
    
    /**
     * プリセットブローカーからブローカーを追加
     * @param {string} presetId - プリセットID
     * @returns {Object} 結果
     */
    addBrokerFromPreset(presetId) {
        try {
            const preset = this.#presetBrokers.find(b => b.id === presetId);
            if (!preset) {
                throw new Error('Preset broker not found');
            }
            
            return this.addBroker({
                name: preset.name,
                shortName: preset.shortName,
                lotUnit: preset.lotUnit,
                defaultLot: preset.defaultLot,
                isCustom: false
            });
            
        } catch (error) {
            console.error('SettingsModule.addBrokerFromPreset error:', error);
            return { success: false, error: error.message };
        }
    }
    
    #validateBroker(brokerData) {
        if (!brokerData) return false;
        if (!brokerData.name || typeof brokerData.name !== 'string') return false;
        if (brokerData.name.trim().length === 0) return false;
        
        // lotUnitのチェック
        if (brokerData.lotUnit === undefined || brokerData.lotUnit === null) return false;
        const lotUnit = parseInt(brokerData.lotUnit);
        if (isNaN(lotUnit) || lotUnit <= 0) return false;
        
        // defaultLotのチェック（オプション）
        if (brokerData.defaultLot !== undefined && brokerData.defaultLot !== null) {
            const defaultLot = parseFloat(brokerData.defaultLot);
            if (isNaN(defaultLot) || defaultLot <= 0) return false;
        }
        
        // shortNameのチェック（カスタム追加時は必須）
        if (brokerData.isCustom && (!brokerData.shortName || brokerData.shortName.trim().length === 0)) {
            return false;
        }
        
        return true;
    }
    
    #isDuplicateBroker(name) {
        return this.#brokers.list.some(b => 
            b.name.toLowerCase() === name.toLowerCase()
        );
    }
    
    #saveBrokers() {
        localStorage.setItem(
            SettingsModule.STORAGE_KEYS.BROKERS,
            JSON.stringify(this.#brokers)
        );
        
        // Supabase自動同期トリガー
        this.#eventBus?.emit('settings:changed', { source: 'brokers' });
    }
    
    // ================
    // Public API - プリセット通貨ペア
    // ================
    
    /**
     * プリセット通貨ペア一覧を取得
     * @returns {Array} プリセット通貨ペア配列
     */
    getPresetPairs() {
        return [...this.#presetPairs];
    }
    
    /**
     * 通貨ペア情報を取得（1pips値含む）
     * @param {string} pairName - 通貨ペア名（例: "USD/JPY"）またはID（例: "usdjpy"）
     * @returns {Object|null} 通貨ペア情報またはnull
     */
    getPairInfo(pairName) {
        if (!pairName) return null;
        
        const normalized = pairName.trim().toUpperCase();
        const lowerId = pairName.trim().toLowerCase();
        
        return this.#presetPairs.find(p => 
            p.name === normalized || p.id === lowerId
        ) || null;
    }
    
    // ================
    // Public API - お気に入り通貨ペア
    // ================
    
    /**
     * お気に入り通貨ペアを追加（プリセットID検証付き）
     * @param {string|Object} pair - 通貨ペア名またはプリセットID、またはオブジェクト
     * @returns {Object} 結果
     */
    addFavoritePair(pair) {
        try {
            let pairName;
            let presetId;
            
            // プリセットIDから追加の場合
            if (typeof pair === 'object' && pair.presetId) {
                const preset = this.#presetPairs.find(p => p.id === pair.presetId);
                if (!preset) {
                    throw new Error('プリセット通貨ペアが見つかりません');
                }
                pairName = preset.name;
                presetId = preset.id;
            } else {
                // 通貨ペア名から追加の場合
                pairName = (typeof pair === 'string' ? pair : pair.name).trim().toUpperCase();
                
                // プリセットに存在するか確認
                const preset = this.getPairInfo(pairName);
                if (preset) {
                    presetId = preset.id;
                }
            }
            
            // 重複チェック
            if (this.#favoritePairs.includes(pairName)) {
                throw new Error('この通貨ペアは既に登録されています');
            }
            
            // 最大数チェック
            if (this.#favoritePairs.length >= SettingsModule.CONSTANTS.MAX_FAVORITE_PAIRS) {
                throw new Error(`お気に入りは最大${SettingsModule.CONSTANTS.MAX_FAVORITE_PAIRS}個までです`);
            }
            
            this.#favoritePairs.push(pairName);
            this.#saveFavoritePairs();
            
            // EventBus通知
            this.#eventBus?.emit('settings:favoritePairAdded', { 
                pair: pairName,
                presetId: presetId
            });
            
            console.log('SettingsModule: Favorite pair added', pairName);
            return { success: true, data: pairName };
            
        } catch (error) {
            console.error('SettingsModule.addFavoritePair error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * お気に入り通貨ペアを削除
     * @param {string} pair - 通貨ペア
     * @returns {Object} 結果
     */
    deleteFavoritePair(pair) {
        try {
            const index = this.#favoritePairs.indexOf(pair);
            if (index === -1) {
                throw new Error('Pair not found');
            }
            
            this.#favoritePairs.splice(index, 1);
            this.#saveFavoritePairs();
            
            // EventBus通知
            this.#eventBus?.emit('settings:favoritePairDeleted', { pair });
            
            console.log('SettingsModule: Favorite pair deleted', pair);
            return { success: true, data: pair };
            
        } catch (error) {
            console.error('SettingsModule.deleteFavoritePair error:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * すべてのお気に入り通貨ペアを取得
     * @returns {Array} 通貨ペア配列
     */
    getAllFavoritePairs() {
        return [...this.#favoritePairs];
    }
    
    #saveFavoritePairs() {
        localStorage.setItem(
            SettingsModule.STORAGE_KEYS.FAVORITE_PAIRS,
            JSON.stringify(this.#favoritePairs)
        );
        
        // Supabase自動同期トリガー
        this.#eventBus?.emit('settings:changed', { source: 'favoritePairs' });
    }
    
    // ================
    // Public API - 許容損失管理（NEW）
    // ================
    
    /**
     * 許容損失を取得
     * @returns {number|null} 許容損失額（円）、未設定ならnull
     */
    getRiskTolerance() {
        return this.#riskTolerance;
    }
    
    /**
     * 許容損失を設定
     * @param {number} amount - 許容損失額（円）
     * @returns {boolean} 成功/失敗
     */
    setRiskTolerance(amount) {
        if (typeof amount !== 'number' || amount < 0) {
            console.error('SettingsModule: 無効な許容損失額');
            return false;
        }
        
        this.#riskTolerance = amount;
        localStorage.setItem(SettingsModule.STORAGE_KEYS.RISK_TOLERANCE, amount.toString());
        
        // EventBus通知
        this.#eventBus?.emit('settings:riskToleranceUpdated', { amount });
        
        console.log('SettingsModule: 許容損失を更新', amount);
        return true;
    }
    
    // ================
    // Public API - 手法管理（NEW）
    // ================
    
    /**
     * 全手法を取得（削除済み除く）
     * @returns {Array} 手法配列
     */
    getAllMethods() {
        return this.#methods.filter(m => m.deletedAt === null);
    }
    
    /**
     * 全手法を取得（削除済み含む）
     * @returns {Array} 手法配列
     */
    getAllMethodsIncludingDeleted() {
        return [...this.#methods];
    }
    
    /**
     * IDで手法を取得
     * @param {string} id - 手法ID
     * @returns {Object|null} 手法オブジェクト
     */
    getMethodById(id) {
        return this.#methods.find(m => m.id === id) || null;
    }
    
    /**
     * 手法を追加
     * @param {string} name - 正式名（最大30文字）
     * @param {string} shortName - 略称（最大10文字）
     * @param {string} memo - メモ（最大200文字、任意）
     * @returns {Object|null} 追加された手法、失敗時null
     */
    addMethod(name, shortName, memo = '') {
        // バリデーション
        if (!name || name.trim().length === 0 || name.length > 30) {
            console.error('SettingsModule: 手法名が無効（1-30文字）');
            return null;
        }
        if (!shortName || shortName.trim().length === 0 || shortName.length > 10) {
            console.error('SettingsModule: 略称が無効（1-10文字）');
            return null;
        }
        if (memo && memo.length > 200) {
            console.error('SettingsModule: メモが長すぎます（最大200文字）');
            return null;
        }
        
        // 上限チェック（有効な手法のみカウント）
        const activeMethods = this.getAllMethods();
        if (activeMethods.length >= 10) {
            console.error('SettingsModule: 手法は最大10個まで');
            return null;
        }
        
        const method = {
            id: 'mtd_' + Date.now(),
            name: name.trim(),
            shortName: shortName.trim(),
            memo: (memo || '').trim(),
            order: this.#methods.length + 1,
            createdAt: new Date().toISOString(),
            deletedAt: null
        };
        
        this.#methods.push(method);
        this.#saveMethods();
        
        // EventBus通知
        this.#eventBus?.emit('settings:methodAdded', { method });
        
        console.log('SettingsModule: 手法を追加', method.name);
        return method;
    }
    
    /**
     * 手法を削除（論理削除）
     * @param {string} id - 手法ID
     * @returns {boolean} 成功/失敗
     */
    deleteMethod(id) {
        const method = this.#methods.find(m => m.id === id);
        if (!method) {
            console.error('SettingsModule: 手法が見つかりません', id);
            return false;
        }
        
        if (method.deletedAt !== null) {
            console.error('SettingsModule: 既に削除されています', id);
            return false;
        }
        
        method.deletedAt = new Date().toISOString();
        this.#saveMethods();
        
        // EventBus通知
        this.#eventBus?.emit('settings:methodDeleted', { methodId: id, methodName: method.name });
        
        console.log('SettingsModule: 手法を削除', method.name);
        return true;
    }
    
    #saveMethods() {
        localStorage.setItem(
            SettingsModule.STORAGE_KEYS.METHODS,
            JSON.stringify(this.#methods)
        );
    }
    
    // ================
    // Public API - ブローカーバッジ表示設定（NEW）
    // ================
    
    /**
     * ブローカーバッジ表示設定を取得
     * @returns {boolean} 表示するならtrue
     */
    getShowBrokerBadge() {
        const saved = localStorage.getItem(SettingsModule.STORAGE_KEYS.SHOW_BROKER_BADGE);
        return saved === null ? true : saved === 'true';  // デフォルトはtrue
    }
    
    /**
     * ブローカーバッジ表示設定を変更
     * @param {boolean} show - 表示するならtrue
     */
    setShowBrokerBadge(show) {
        localStorage.setItem(SettingsModule.STORAGE_KEYS.SHOW_BROKER_BADGE, show.toString());
        this.#eventBus?.emit('settings:brokerBadgeChanged', { show });
        console.log('SettingsModule: ブローカーバッジ表示設定', show);
    }
    
    // ================
    // Public API - データ管理（既存機能）
    // ================
    
    /**
     * データエクスポート用の設定データを取得
     * @returns {Object} 設定データ
     */
    getExportData() {
        return {
            siteTitle: this.#siteTitle,
            siteSubtitle: this.#siteSubtitle,
            userIcon: this.#userIcon,
            theme: this.#theme,
            goals: this.#goals,
            brokers: this.#brokers,
            favoritePairs: this.#favoritePairs,
            // NEW: トレード分析強化
            riskTolerance: this.#riskTolerance,
            methods: this.#methods,
            showBrokerBadge: this.getShowBrokerBadge()
        };
    }
    
    /**
     * データインポート（設定のみ）
     * @param {Object} data - インポートデータ
     * @returns {boolean} 成功/失敗
     */
    importData(data) {
        try {
            if (data.siteTitle) this.updateSiteTitle(data.siteTitle);
            if (data.siteSubtitle) this.updateSiteSubtitle(data.siteSubtitle);
            if (data.theme) this.setTheme(data.theme);
            if (data.goals) {
                this.#goals = data.goals;
                localStorage.setItem(SettingsModule.STORAGE_KEYS.GOALS, JSON.stringify(data.goals));
            }
            if (data.brokers) {
                this.#brokers = data.brokers;
                this.#saveBrokers();
            }
            if (data.favoritePairs) {
                this.#favoritePairs = data.favoritePairs;
                this.#saveFavoritePairs();
            }
            
            // NEW: トレード分析強化
            if (data.riskTolerance !== undefined) {
                this.setRiskTolerance(data.riskTolerance);
            }
            if (data.methods) {
                this.#methods = data.methods;
                this.#saveMethods();
            }
            if (data.showBrokerBadge !== undefined) {
                this.setShowBrokerBadge(data.showBrokerBadge);
            }
            
            console.log('SettingsModule: Data imported successfully');
            return true;
            
        } catch (error) {
            console.error('SettingsModule.importData error:', error);
            return false;
        }
    }
    
    // ================
    // グローバル関数の置き換え
    // ================
    
    #replaceGlobalFunctions() {
        // 既存のグローバル関数をモジュールメソッドに置き換え
        
        // サイトタイトル
        window.updateSiteTitle = () => {
            const input = document.getElementById('siteTitle');
            if (input && input.value) {
                this.updateSiteTitle(input.value);
            }
        };
        
        // サイトサブタイトル
        window.updateSiteSubtitle = () => {
            const input = document.getElementById('siteSubtitle');
            if (input && input.value) {
                this.updateSiteSubtitle(input.value);
            }
        };
        
        // テーマ
        window.setTheme = (theme) => {
            this.setTheme(theme);
        };
        
        // テーマトグル（ショートカット用）
        window.toggleTheme = () => {
            this.toggleTheme();
        };
        
        // 目標保存
        window.saveGoals = () => {
            this.saveGoals();
        };
        
        console.log('SettingsModule: Global functions replaced');
    }
    
    // ================
    // イベントバインディング
    // ================
    
    #bindEvents() {
        // キーボードショートカット: Ctrl + Shift + D でテーマ切り替え
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.toggleTheme();
                console.log('SettingsModule: Theme toggled via shortcut');
            }
        });
        
        console.log('SettingsModule: Events bound (including keyboard shortcuts)');
    }
    
    // ================
    // Debug Methods（デバッグ用）
    // ================
    
    /**
     * モジュールの状態を取得（デバッグ用）
     * @returns {Object} 状態情報
     */
    getStatus() {
        return {
            initialized: this.#initialized,
            hasEventBus: !!this.#eventBus,
            currentSubtab: this.#currentSubtab,
            brokersCount: this.#brokers.list.length,
            presetBrokersCount: this.#presetBrokers.length,
            presetPairsCount: this.#presetPairs.length,
            favoritePairsCount: this.#favoritePairs.length,
            siteTitle: this.#siteTitle,
            theme: this.#theme,
            goalsSet: this.#goals.goals.filter(g => g.text).length,
            // NEW: トレード分析強化
            riskTolerance: this.#riskTolerance,
            methodCount: this.getAllMethods().length,
            totalMethods: this.#methods.length,
            showBrokerBadge: this.getShowBrokerBadge()
        };
    }
}

// ================
// グローバル登録
// ================

// DOMContentLoaded後に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.SettingsModule = new SettingsModule();
        console.log('SettingsModule: Registered globally');
    });
} else {
    window.SettingsModule = new SettingsModule();
    console.log('SettingsModule: Registered globally');
}