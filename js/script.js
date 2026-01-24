// ========== Script.js Part 1: 基盤・初期化部門 ==========
// Trading Complete v1.0
// 開発日: 2025年
// 想定利用期間: 30年以上

// ============================
// 1. ストレージ処理
// ============================

const storage = {
    isAvailable: false,
    memoryStorage: {},
    
    init() {
        try {
            const testKey = '__test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this.isAvailable = true;
        } catch (e) {
            this.isAvailable = false;
        }
    },
    
    getItem(key) {
        if (this.isAvailable) {
            return localStorage.getItem(key);
        }
        return this.memoryStorage[key] || null;
    },
    
    setItem(key, value) {
        if (this.isAvailable) {
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                console.error('Storage quota exceeded, clearing old data');
                this.clearOldData();
                try {
                    localStorage.setItem(key, value);
                } catch (e2) {
                    this.memoryStorage[key] = value;
                }
            }
        } else {
            this.memoryStorage[key] = value;
        }
    },
    
    removeItem(key) {
        if (this.isAvailable) {
            localStorage.removeItem(key);
        } else {
            delete this.memoryStorage[key];
        }
    },
    
    clear() {
        if (this.isAvailable) {
            localStorage.clear();
        } else {
            this.memoryStorage = {};
        }
    },
    
    clearOldData() {
        if (!this.isAvailable) return;
        
        try {
            // 3ヶ月以上前のトレードの画像を削除
            const trades = JSON.parse(localStorage.getItem('trades') || '[]');
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            
            let cleaned = 0;
            trades.forEach(trade => {
                const tradeDate = new Date(trade.timestamp || trade.entryTime);
                if (tradeDate < threeMonthsAgo) {
                    if (trade.chartImage && trade.chartImage.startsWith('data:')) {
                        delete trade.chartImage;
                        cleaned++;
                    }
                    if (trade.tradeChartImage) {
                        delete trade.tradeChartImage;
                        cleaned++;
                    }
                    if (trade.chartImages) {
                        delete trade.chartImages;
                        cleaned++;
                    }
                }
            });
            
            if (cleaned > 0) {
                localStorage.setItem('trades', JSON.stringify(trades));
            }
            
            // 相場ノートの画像は保持
            
        } catch (e) {
            // データクリーンアップ中のエラーは静かに処理
        }
    }
};

// ============================
// 2. グローバル変数定義
// ============================

// 基本データ
let trades = [];
let notes = {};
let goalsData = {
    goals: [
        { id: 1, text: "", deadline: "", achieved: false },
        { id: 2, text: "", deadline: "", achieved: false },
        { id: 3, text: "", deadline: "", achieved: false }
    ]
};

// 円建て損益管理
let yenProfitLossManager = null;

// UI状態管理
let currentCalendarDate = new Date();
let selectedDate = null;
window.selectedTradeForEdit = null;
let selectedNoteForEdit = null;
let currentReportType = 'monthly';
let currentReportDate = new Date();
let currentWeekStart = new Date();
let selectedNoteDate = null;
let pendingImageData = null;
let pendingHeadingNumber = null;
window.pendingImageType = null;
let pendingImageSrc = null;  // Step2用：一時保存する画像データ

// 説明編集用
let captionEditContext = null;  // { type: 'trade'|'note', id, index }
let captionEditMode = 'edit';   // 'edit' または 'add'
let pendingImageForAdd = null;  // 追加モード用の一時画像データ
let currentNoteId = null;

// タイマー用
let timerInterval = null;
let elapsedSeconds = 0;

// トレードオプション用
let accountCurrencies = ['JPY', 'USD'];
let tradingPairs = ['USD/JPY', 'EUR/USD', 'GBP/USD', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY'];


// チャートビュー管理
let currentChartView = 'monthly'; // 'monthly', 'yearly', 'all'



// ストレージ情報管理
let storageInfo = {
    serverUsed: 0,
    serverLimit: 100 * 1024 * 1024,
    localImages: [],
    serverImages: [],
    externalImages: []
};

// TradeListRenderer（プレースホルダー - Part 2で定義）
let TradeListRenderer = {};

// ============================
// 3. エラーハンドリング（改善版）
// ============================

window.addEventListener('error', function(event) {
    // 初期化前アクセスのエラーは無視
    const ignoredErrors = [
        'goalsData',
        'TradeListRenderer'
    ];
    
    const shouldIgnore = ignoredErrors.some(err => 
        event.message && event.message.includes(err)
    );
    
    if (shouldIgnore) {
        event.preventDefault();
        return true;
    }
    
    // goalsData関連のエラーの場合は初期化
    if (event.message && event.message.includes('goalsData')) {
        // グローバル変数を初期化
        goalsData = {
            goals: [
                { id: 1, text: "", deadline: "", achieved: false },
                { id: 2, text: "", deadline: "", achieved: false },
                { id: 3, text: "", deadline: "", achieved: false }
            ]
        };
        
        // windowオブジェクトにも設定
        window.goalsData = goalsData;
        
        // updateGoalsDisplayが存在すれば再実行
        if (typeof updateGoalsDisplay === 'function') {
            updateGoalsDisplay();
        }
    }
    
    // TradeListRendererのエラーは無視（Part 2が読み込まれるまで）
    if (event.message && event.message.includes('TradeListRenderer')) {
        event.preventDefault();
        return true;
    }
    
    // 重要なエラーのみユーザーに通知
    if (event.error && event.error.message && event.error.message.includes('storage')) {
        if (typeof showToast === 'function') {
            showToast('ストレージエラーが発生しました。データを確認してください。', 'error');
        }
    }
});

// Promise rejection ハンドリング
window.addEventListener('unhandledrejection', function(event) {
    // エラーを静かに処理
});

// アンロード時の警告
window.addEventListener('beforeunload', function(e) {
    // 未保存の変更がある場合のみ警告
    const unsavedChanges = document.querySelector('#new-entry input:not(:placeholder-shown), #new-entry textarea:not(:placeholder-shown)');
    if (unsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ============================
// 4. 基本ユーティリティ関数
// ============================

// デバウンス関数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// トースト通知
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) {
        // トースト要素が存在しない場合は動的に作成
        const newToast = document.createElement('div');
        newToast.id = 'toast';
        newToast.className = `toast ${type}`;
        newToast.textContent = message;
        document.body.appendChild(newToast);
        
        setTimeout(() => {
            newToast.style.display = 'block';
            newToast.style.opacity = '1';
            newToast.style.visibility = 'visible';
        }, 10);
        
        setTimeout(() => {
            newToast.style.display = 'none';
            newToast.style.opacity = '0';
            newToast.style.visibility = 'hidden';
            setTimeout(() => {
                document.body.removeChild(newToast);
            }, 300);
        }, 3000);
        
        return;
    }
    
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    toast.style.visibility = 'visible';
    
    setTimeout(() => {
        toast.style.display = 'none';
        toast.style.opacity = '0';
        toast.style.visibility = 'hidden';
    }, 3000);
}

// HTMLエスケープ
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 安全な要素取得
function safeGetElement(id) {
    const element = document.getElementById(id);
    return element;
}

// 日付フォーマット関数
function formatDateForDisplay(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

function formatDateForCalendar(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForInput(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateTimeForDisplay(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

function formatDateTimeForInput(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 15分単位に丸める関数
function roundToQuarterHour(datetime) {
    const date = new Date(datetime);
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    date.setMinutes(roundedMinutes);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
}

// 現在日時を設定
function setCurrentDateTime() {
    const entryTimeElement = document.getElementById('entryTime');
    if (entryTimeElement) {
        const now = roundToQuarterHour(new Date());
        entryTimeElement.value = formatDateTimeForInput(now);
    }
}

// ============================
// 5. データ保存・読み込み関数
// ============================

// トレードデータ保存
function saveTrades() {
    storage.setItem('trades', JSON.stringify(trades));
}

// ノートデータ保存
function saveNotes() {
    storage.setItem('notes', JSON.stringify(notes));
}

// データ読み込み
function loadAllData() {
    try {
        const savedTrades = storage.getItem('trades');
        if (savedTrades) {
            trades = JSON.parse(savedTrades);
            // グローバル変数として確実に設定
            window.trades = trades;
            
            // 既存データの修復処理
            repairTradeData();
        } else {
            trades = [];
            window.trades = [];
        }
        
        const savedNotes = storage.getItem('notes');
        if (savedNotes) {
            notes = typeof savedNotes === 'string' ? JSON.parse(savedNotes) : savedNotes;
            window.notes = notes;
            migrateNotesData();
        } else {
            notes = {};
            window.notes = {};
        }
        
        // 目標データの読み込み
        const savedGoals = storage.getItem('goalsData');
        if (savedGoals) {
            const parsed = JSON.parse(savedGoals);
            if (parsed.goals && Array.isArray(parsed.goals)) {
                goalsData = parsed;
                window.goalsData = goalsData;
            }
        } else {
            // 旧形式から移行
            for (let i = 1; i <= 3; i++) {
                const text = storage.getItem(`goalText${i}`) || '';
                const deadline = storage.getItem(`goalDeadline${i}`) || '';
                const achieved = storage.getItem(`goalAchieved${i}`) === 'true';
                goalsData.goals[i-1] = {
                    id: i,
                    text: text,
                    deadline: deadline,
                    achieved: achieved
                };
            }
            window.goalsData = goalsData;
        }
        
        // ストレージ情報の読み込み
        const savedStorageInfo = storage.getItem('storageInfo');
        if (savedStorageInfo) {
            storageInfo = JSON.parse(savedStorageInfo);
            window.storageInfo = storageInfo;
        }
        
    } catch (e) {
        // データの読み込みエラーは静かに処理
        trades = [];
        notes = {};
        window.trades = [];
        window.notes = {};
    }
}

// トレードデータの修復処理
function repairTradeData() {
    if (!trades || !Array.isArray(trades)) return;
    
    let repaired = 0;
    
    trades.forEach(trade => {
        let needsRepair = false;
        
        // 必須フィールドの修復
        if (!trade.exits) {
            trade.exits = [];
            needsRepair = true;
        }
        if (!trade.chartImages) {
            trade.chartImages = [];
            needsRepair = true;
        }
        
        // ステータスフィールドの追加
        if (trade.status === undefined) {
            // exitsがあれば決済済み、なければオープン
            trade.status = trade.exits && trade.exits.length > 0 ? 'CLOSED' : 'OPEN';
            needsRepair = true;
        }
        
        // 決済関連フィールドの追加
        if (trade.exitDate === undefined) {
            trade.exitDate = trade.exits && trade.exits.length > 0 ? 
                trade.exits[trade.exits.length - 1].time : null;
            needsRepair = true;
        }
        if (trade.exitPrice === undefined) {
            trade.exitPrice = trade.exits && trade.exits.length > 0 ? 
                trade.exits[trade.exits.length - 1].price : null;
            needsRepair = true;
        }
        
        // 円建て損益フィールドの追加（YenProfitLossとは別管理）
        if (trade.tradePL === undefined) {
            trade.tradePL = null;
            needsRepair = true;
        }
        if (trade.swap === undefined) {
            trade.swap = null;
            needsRepair = true;
        }
        if (trade.commission === undefined) {
            trade.commission = null;
            needsRepair = true;
        }
        if (trade.netProfit === undefined) {
            trade.netProfit = null;
            needsRepair = true;
        }
        
        // IDがない場合は生成
        if (!trade.id) {
            trade.id = trade.timestamp || `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            needsRepair = true;
        }
        
        // タイムスタンプがない場合は生成
        if (!trade.timestamp) {
            trade.timestamp = trade.entryTime || new Date().toISOString();
            needsRepair = true;
        }
        
        if (needsRepair) {
            repaired++;
        }
    });
    
    if (repaired > 0) {
        saveTrades();
        console.log(`✅ ${repaired}件のトレードデータを修復しました`);
    }
}

// ノートデータ移行
function migrateNotesData() {
    let migrated = false;
    
    Object.keys(notes).forEach(date => {
        const note = notes[date];
        
        if (typeof note === 'string') {
            // 旧形式（文字列）を新形式に変換
            const newNote = {
                date: date,
                memo: note,
                marketView: '',
                images: note.image ? [note.image] : [],
                createdAt: note.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            notes[date] = newNote;
            migrated = true;
        }
    });
    
    if (migrated) {
        saveNotes();
    }
}

// 円建て損益データ移行（既存トレードへのフィールド追加）
function migrateYenProfitLossData() {
    const trades = JSON.parse(storage.getItem('trades') || '[]');
    let migrated = 0;
    
    trades.forEach(trade => {
        if (!trade.yenProfitLoss) {
            // デフォルト値を設定（後で手動修正可能）
            trade.yenProfitLoss = {
                profitLoss: 0,
                swap: 0,
                commission: 0,
                netProfit: 0,
                timestamp: new Date().toISOString()
            };
            migrated++;
        }
    });
    
    if (migrated > 0) {
        storage.setItem('trades', JSON.stringify(trades));
        console.log(`✅ ${migrated}件のトレードデータを円建て損益対応に移行しました`);
        
        // 移行完了メッセージ（初回のみ表示）
        if (!storage.getItem('yen_migration_notice_shown')) {
            setTimeout(() => {
                if (typeof showToast === 'function') {
                    showToast(`${migrated}件の既存トレードに円建て損益フィールドを追加しました`, 'info');
                } else {
                    alert(`${migrated}件の既存トレードに円建て損益フィールドを追加しました。\n各トレードの編集画面から正しい値を入力してください。`);
                }
            }, 2000);
            storage.setItem('yen_migration_notice_shown', 'true');
        }
    }
    
    return migrated;
}

// ============================
// 6. 初期化関数
// ============================

function initializeApp() {
    const savedTitle = storage.getItem('siteTitle');
    const savedSubtitle = storage.getItem('siteSubtitle');
    const savedIcon = storage.getItem('userIcon');
    
    const headerTitleElement = document.getElementById('headerTitle');
    const headerSubtitleElement = document.getElementById('headerSubtitle');
    const siteTitleElement = document.getElementById('siteTitle');
    const siteSubtitleElement = document.getElementById('siteSubtitle');
    const userIconElement = document.getElementById('userIcon');
    
    if (savedTitle) {
        if (headerTitleElement) headerTitleElement.textContent = savedTitle;
        if (siteTitleElement) siteTitleElement.value = savedTitle;
        document.title = savedTitle;
    }
    
    if (savedSubtitle) {
        if (headerSubtitleElement) headerSubtitleElement.textContent = savedSubtitle;
        if (siteSubtitleElement) siteSubtitleElement.value = savedSubtitle;
    }
    
    if (savedIcon && userIconElement) {
        userIconElement.src = savedIcon;
    }
    
    // 目標データの初期化（個別キーから読み込み）
    for (let i = 1; i <= 3; i++) {
        const goal = goalsData.goals[i-1];
        const textElement = document.getElementById(`goalText${i}`);
        const deadlineElement = document.getElementById(`goalDeadline${i}`);
        
        if (textElement) textElement.value = goal.text || storage.getItem(`goalText${i}`) || '';
        if (deadlineElement) deadlineElement.value = goal.deadline || storage.getItem(`goalDeadline${i}`) || '';
    }
}

// ============================
// 7. イベントリスナー設定
// ============================

function setupEventListeners() {
    // タブ切り替え
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const tabName = this.getAttribute('data-tab');
            if (tabName) {
                switchTab(tabName, e);
            }
        });
    });
    
    // テーマ切り替え
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const theme = this.textContent.includes('ライト') ? 'light' : 'dark';
            setTheme(theme);
        });
    });
    
    // ペーストイベント
    document.addEventListener('paste', handlePaste);
    
    // 画像アップロードハンドラー
    setupImageUploadHandlers();
    
    // 目標達成クリック（v6では無効化）
    document.querySelectorAll('.goal-item').forEach(item => {
        item.addEventListener('click', function() {
            const goalNumber = parseInt(this.getAttribute('data-goal'));
            if (typeof toggleGoalAchieved === 'function') {
                toggleGoalAchieved(goalNumber);
            }
        });
    });
    
    // 自動保存（ノート入力時）
    setupAutoSave();
    
    // setupGoalEventListenersの呼び出しを削除（未定義のため）
    
    // エントリー条件リスナーの設定
    setupEntryConditionsListeners();
    
    // キーボードショートカットを設定
    setupKeyboardShortcuts();
    
    // 注意: Step2は削除され、imageCaptionEditModalに統合されました
    // backToStep1Btn, confirmAddImageBtn, changeImageBtn, imageTitleInput, imageDescInput
    // これらのイベントリスナーは不要になりました
    
    // Step2の×ボタン（キャンセル）- 後方互換用
    const cancelAddImageBtn = document.getElementById('cancelAddImageBtn');
    if (cancelAddImageBtn) {
        cancelAddImageBtn.addEventListener('click', function() {
            backToImageAddStep1();
        });
    }
    
    // 外部URL「次へ」ボタンの処理
    const addUrlBtn = document.getElementById('addUrlBtn');
    if (addUrlBtn) {
        addUrlBtn.addEventListener('click', function() {
            const urlInput = document.getElementById('externalImageUrl');
            if (urlInput && urlInput.value.trim()) {
                showImageAddStep2(urlInput.value.trim());
            } else {
                showToast('URLを入力してください', 'error');
            }
        });
    }
    
    // 説明編集モーダルの文字数カウンター
    const captionEditTitle = document.getElementById('captionEditTitle');
    const captionEditDesc = document.getElementById('captionEditDesc');
    
    if (captionEditTitle) {
        captionEditTitle.addEventListener('input', function() {
            const count = document.getElementById('captionEditTitleCount');
            if (count) count.textContent = this.value.length;
        });
    }
    if (captionEditDesc) {
        captionEditDesc.addEventListener('input', function() {
            const count = document.getElementById('captionEditDescCount');
            if (count) count.textContent = this.value.length;
        });
    }
}

// 画像アップロードハンドラーの設定
function setupImageUploadHandlers() {
    // チャート画像1
    const tradeChartImageUpload1 = document.getElementById('tradeChartImageUpload1');
    const tradeChartImageInput1 = document.getElementById('tradeChartImage1');
    if (tradeChartImageUpload1 && tradeChartImageInput1) {
        tradeChartImageUpload1.addEventListener('drop', (e) => handleTradeChartImageDrop(e, 1));
        tradeChartImageUpload1.addEventListener('dragover', handleImageDragOver);
        tradeChartImageInput1.addEventListener('change', (e) => handleTradeChartImageUpload(e, 1));
    }
    
    // チャート画像2
    const tradeChartImageUpload2 = document.getElementById('tradeChartImageUpload2');
    const tradeChartImageInput2 = document.getElementById('tradeChartImage2');
    if (tradeChartImageUpload2 && tradeChartImageInput2) {
        tradeChartImageUpload2.addEventListener('drop', (e) => handleTradeChartImageDrop(e, 2));
        tradeChartImageUpload2.addEventListener('dragover', handleImageDragOver);
        tradeChartImageInput2.addEventListener('change', (e) => handleTradeChartImageUpload(e, 2));
    }
    
    // チャート画像3
    const tradeChartImageUpload3 = document.getElementById('tradeChartImageUpload3');
    const tradeChartImageInput3 = document.getElementById('tradeChartImage3');
    if (tradeChartImageUpload3 && tradeChartImageInput3) {
        tradeChartImageUpload3.addEventListener('drop', (e) => handleTradeChartImageDrop(e, 3));
        tradeChartImageUpload3.addEventListener('dragover', handleImageDragOver);
        tradeChartImageInput3.addEventListener('change', (e) => handleTradeChartImageUpload(e, 3));
    }
}

// 自動保存の設定
function setupAutoSave() {
    let autoSaveTimer = null;
    
    // 見出し内容の自動保存
    document.querySelectorAll('.heading-content').forEach(textarea => {
        textarea.addEventListener('input', () => {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(() => {
                saveNoteTemporary();
            }, 3000); // 3秒後に自動保存
        });
    });
}

// ノートの一時保存
function saveNoteTemporary() {
    const currentDate = document.getElementById('noteDate')?.value;
    if (!currentDate) return;
    
    const note = {
        date: currentDate,
        memo: document.getElementById('noteMemo')?.innerHTML || '',
        marketView: document.getElementById('noteMarketView')?.innerHTML || '',
        images: collectNoteImages(),
        createdAt: notes[currentDate]?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    notes[currentDate] = note;
    saveNotes();
}

// 画像収集（ノート用）
function collectNoteImages() {
    const images = [];
    const imagesContainer = document.getElementById('noteImages');
    if (imagesContainer) {
        const imageElements = imagesContainer.querySelectorAll('img');
        imageElements.forEach(img => {
            images.push(img.src);
        });
    }
    return images;
}

// ============================
// 8. タブ切り替え実装
// ============================

// タブIDマッピング定義（統一管理）
const TAB_ID_MAPPING = {
    'new-entry': 'new-entry',       // そのまま
    'records': 'records',           // そのまま
    'notes': 'notes',               // そのまま
    'analysis': 'analysis',         // そのまま
    'sns': 'sns-post',              // マッピング維持
    'sns-post': 'sns-post',         // そのまま
    'learning': 'learning',         // 追加
    'tax': 'tax',                   // 追加
    'settings': 'settings'          // そのまま
};

// タブ切り替え関数
window.switchTab = function(tabName, evt) {
    // すべてのタブコンテンツを非表示（display: none）
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';  // 明示的に非表示
    });
    
    // すべてのタブボタンから active クラスを削除
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // タブIDマッピングから実際のIDを取得
    const actualTabId = TAB_ID_MAPPING[tabName] || tabName;
    
    // 選択されたタブを表示（display: block）
    const selectedTab = document.getElementById(actualTabId);
    if (selectedTab) {
        selectedTab.classList.add('active');
        selectedTab.style.display = 'block';  // 明示的に表示
        console.log(`タブ表示: ${tabName} → ${actualTabId}`);
    } else {
        console.warn(`Tab content not found: ${actualTabId} (from ${tabName})`);
    }
    
    // イベントが渡された場合は、そのボタンをアクティブに
    if (evt && evt.target) {
        evt.target.classList.add('active');
    } else {
        // イベントがない場合は、data-tab属性で該当するボタンを探す
        const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
    }
    
    // タブ別の初期化処理（8タブ対応）
    switch(tabName) {
        case 'new-entry':      // 新規エントリー
            if (typeof displayNewEntryTab === 'function') {
                displayNewEntryTab();
            }
            // 現在日時を設定
            setCurrentDateTime();
            // リスクリワード計算の初期化
            if (typeof updateRiskReward === 'function') {
                updateRiskReward();
            }
            break;
            
        case 'records':        // トレード記録
            if (typeof displayRecordsTab === 'function') {
                displayRecordsTab();
            }
            // トレード一覧を表示
            if (typeof displayAllTrades === 'function') {
                displayAllTrades();
            }
            break;
            
        case 'notes':          // 相場ノート
            if (typeof displayNotesTab === 'function') {
                displayNotesTab();
            }
            // 相場ノートタブの初期化
            const noteDateElement = document.getElementById('noteDate');
            if (noteDateElement && !noteDateElement.value) {
                const today = formatDateForInput(new Date());
                noteDateElement.value = today;
                if (typeof loadNoteForDate === 'function') loadNoteForDate(today);
            }
            // 週間プレビューの初期化
            if (typeof initializeWeekView === 'function') {
                initializeWeekView();
            }
            break;
            
        case 'analysis':       // 分析
            if (typeof displayAnalysisTab === 'function') {
                displayAnalysisTab();
            }
            if (window.StatisticsModule) {
                window.StatisticsModule.updateStatistics();
            }
            // カレンダー要素が存在する場合のみ更新
            if (document.getElementById('calendarDates')) {
                if (typeof updateCalendar === 'function') updateCalendar();
            }
            // レポートを生成（保存された期間があればそれを使用、なければ現在月）
            if (typeof generateReport === 'function') {
                setTimeout(() => {
                    // 保存された期間選択状態を使用（なければデフォルト値）
                    const periodType = window.currentPeriodType || 'monthly';
                    const year = window.currentYear || new Date().getFullYear();
                    const period = window.currentPeriod || new Date().getMonth() + 1;
                    
                    // 期間タイプに応じてレポート生成
                    if (periodType === 'quarterly') {
                        // 四半期の場合、月に変換（Q1→1, Q2→4, Q3→7, Q4→10）
                        const month = (period - 1) * 3 + 1;
                        generateReport(periodType, year, month);
                    } else if (periodType === 'yearly') {
                        generateReport(periodType, year, null);
                    } else {
                        // monthly または weekly
                        generateReport(periodType, year, period);
                    }
                    
                    console.log('分析タブ: 期間復元', { periodType, year, period });
                }, 100);
            }
            break;
            
        case 'settings':      // 設定
            if (typeof displaySettingsTab === 'function') {
                displaySettingsTab();
            }
            // 設定タブを開いた時に目標表示を更新
            if (typeof updateGoalsDisplay === 'function') {
                setTimeout(() => {
                    updateGoalsDisplay();
                }, 100);
            }
            break;
            
        case 'tax':          // 収支管理（Part 7）
            // Part 7の初期化関数を呼び出し（初回のみ実行される内部ロジック）
            if (typeof initExpenseTab === 'function') {
                initExpenseTab();
            }
            // Part 7の表示関数を呼び出し（タブを開くたびに実行）
            if (typeof displayExpenseTab === 'function') {
                displayExpenseTab();
            }
            break;
            
        default:
            console.error('Unknown tab:', tabName);
    }
};

// ============================
// 9. 画像処理関数
// ============================

// 画像追加モーダルを閉じる
window.closeImageAddModal = function() {
    const modal = document.getElementById('imageAddModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // Step1に戻す
    const step1 = document.getElementById('imageAddStep1');
    const step2 = document.getElementById('imageAddStep2');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    // 入力欄をクリア
    const titleInput = document.getElementById('imageTitleInput');
    const descInput = document.getElementById('imageDescInput');
    const urlInput = document.getElementById('externalImageUrl');
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    if (urlInput) urlInput.value = '';
    // カウンターリセット
    const titleCount = document.getElementById('titleCharCount');
    const descCount = document.getElementById('descCharCount');
    if (titleCount) titleCount.textContent = '0';
    if (descCount) descCount.textContent = '0';
    // 注意: pendingImageType, pendingImageSrcは
    // handleProcessedImage完了後にリセットするため、ここではリセットしない
};

// ローカル画像処理
window.processLocalImage = async function(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        let compressedImage;
        
        if (pendingImageType && pendingImageType.startsWith('tradeChart')) {
            // チャート用：バランス重視
            compressedImage = await ImageHandler.compressWithPreset(e.target.result, 'chart');
        } else {
            // その他（相場ノート画像など）
            compressedImage = await ImageHandler.compressWithPreset(e.target.result, 'note');
        }
        
        // Step2に進む（プレビュー表示）
        showImageAddStep2(compressedImage);
    };
    reader.readAsDataURL(file);
};

// Step2を表示（プレビュー＆説明入力）
window.showImageAddStep2 = function(imageSrc) {
    // 追加モード用の一時データを保存
    pendingImageSrc = imageSrc;
    pendingImageForAdd = imageSrc;
    captionEditMode = 'add';
    
    // imageAddModalを閉じる
    closeImageAddModal();
    
    // プレビュー画像設定
    const previewImg = document.getElementById('captionEditPreviewImg');
    if (previewImg) previewImg.src = imageSrc;
    
    // 入力欄を設定（一時保存があれば復元）
    const titleInput = document.getElementById('captionEditTitle');
    const descInput = document.getElementById('captionEditDesc');
    const titleCount = document.getElementById('captionEditTitleCount');
    const descCount = document.getElementById('captionEditDescCount');
    
    if (titleInput) {
        titleInput.value = window.tempCaptionTitle || '';
        if (titleCount) titleCount.textContent = titleInput.value.length;
    }
    if (descInput) {
        descInput.value = window.tempCaptionDesc || '';
        if (descCount) descCount.textContent = descInput.value.length;
    }
    
    // 一時保存をクリア
    window.tempCaptionTitle = null;
    window.tempCaptionDesc = null;
    
    // タイトル変更
    const modalTitle = document.getElementById('captionEditModalTitle');
    if (modalTitle) modalTitle.textContent = '📷 画像を追加';
    
    // ボタンテキスト変更
    const saveBtn = document.getElementById('captionEditSaveBtn');
    if (saveBtn) saveBtn.textContent = '追加する';
    
    // 「画像を変更」ボタンを表示
    const changeBtn = document.getElementById('changeImageInEditBtn');
    if (changeBtn) changeBtn.style.display = 'block';
    
    // モーダル表示
    const modal = document.getElementById('imageCaptionEditModal');
    if (modal) modal.style.display = 'flex';
};

/**
 * Step1に戻る（画像追加キャンセル）
 */
window.backToImageAddStep1 = function() {
    pendingImageSrc = null;
    
    const step1 = document.getElementById('imageAddStep1');
    const step2 = document.getElementById('imageAddStep2');
    
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    
    // 入力欄をクリア（旧Step2用、後方互換）
    const titleInput = document.getElementById('imageTitleInput');
    const descInput = document.getElementById('imageDescInput');
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
};

/**
 * 画像を変更（編集モーダルからStep1に戻る）
 */
window.changeImageInEdit = function() {
    // 現在の入力値を保持
    const titleInput = document.getElementById('captionEditTitle');
    const descInput = document.getElementById('captionEditDesc');
    window.tempCaptionTitle = titleInput ? titleInput.value : '';
    window.tempCaptionDesc = descInput ? descInput.value : '';
    
    // 既存画像の置換用にコンテキストを保存
    if (captionEditContext) {
        window.pendingReplaceContext = { ...captionEditContext };
        // pendingImageTypeを設定（tradeChart1, tradeChart2, tradeChart3 等）
        if (captionEditContext.type === 'trade') {
            pendingImageType = 'tradeChart' + (captionEditContext.index + 1);
        } else if (captionEditContext.type === 'note') {
            pendingImageType = 'noteImage';
        }
        // 追加モードに変更（新しい画像を受け取るため）
        captionEditMode = 'add';
    }
    
    // 編集モーダルを閉じる
    document.getElementById('imageCaptionEditModal').style.display = 'none';
    
    // Step1を表示
    const modal = document.getElementById('imageAddModal');
    const step1 = document.getElementById('imageAddStep1');
    
    if (modal) modal.style.display = 'flex';
    if (step1) step1.style.display = 'block';
};

/**
 * 画像を削除（編集モーダルから）
 */
window.deleteImageInEdit = function() {
    // 編集モードでのみ動作
    if (!captionEditContext) {
        showToast('削除対象が不明です', 'error');
        return;
    }
    
    if (!confirm('この画像を削除しますか？')) {
        return;
    }
    
    const { type, id, index } = captionEditContext;
    
    if (type === 'trade') {
        const trade = window.tradeManager ? window.tradeManager.getTradeById(id) : null;
        if (trade && trade.chartImages) {
            const chartImages = [...trade.chartImages];
            chartImages.splice(index, 1);  // 該当画像を削除
            
            window.tradeManager.updateTrade(id, { chartImages });
            showToast('画像を削除しました', 'success');
            
            // トレード詳細を再表示
            if (window.tradeDetail && typeof window.tradeDetail.showTradeDetail === 'function') {
                const updatedTrade = window.tradeManager.getTradeById(id);
                window.tradeDetail.showTradeDetail(updatedTrade);
            }
        }
    } else if (type === 'note') {
        if (window.NoteManagerModule && typeof window.NoteManagerModule.deleteImage === 'function') {
            const success = window.NoteManagerModule.deleteImage(id, index);
            if (success) {
                showToast('画像を削除しました', 'success');
            } else {
                showToast('削除に失敗しました', 'error');
            }
        }
    }
    
    closeImageCaptionEditModal();
};

// 処理済み画像のハンドリング
window.handleProcessedImage = function(imageData) {
    // 新形式（オブジェクト）の場合は画像ソースを取得
    const imageSrc = window.getImageSrc ? window.getImageSrc(imageData) : 
                     (typeof imageData === 'string' ? imageData : imageData?.src || imageData);
    
    if (!pendingImageType) {
        // 相場ノートの画像追加（後方互換性）
        if (typeof displayNoteImage === 'function') {
            displayNoteImage(imageData);
        }
        return;
    }

    // 相場ノートの画像追加（新方式）
    if (pendingImageType === 'noteImage') {
        if (typeof displayNoteImage === 'function') {
            displayNoteImage(imageData);
        } else if (window.NoteManagerModule?.displayNoteImage) {
            window.NoteManagerModule.displayNoteImage(imageData);
        }
        return;
    }
    
    // トレード関連の画像処理
    if (pendingImageType === 'tradeChart1') {
        const preview = document.getElementById('tradeChartImagePreview1');
        const uploadArea = document.getElementById('tradeChartImageUpload1');
        const captionEl = document.getElementById('tradeChartCaption1');
        if (preview) {
            const title = window.getImageTitle ? window.getImageTitle(imageData) : '';
            preview.innerHTML = `<img src="${imageSrc}" style="width: 100%; height: auto; border-radius: 8px;" alt="チャート画像1" onclick="showImageModalWithCaption(window.tempChartImage1, {type: 'newEntry', id: null, index: 0}); event.stopPropagation();">`;
            window.tempChartImage1 = imageData;
            // 枠外に題名を表示
            if (captionEl) {
                captionEl.textContent = title;
                captionEl.style.display = title ? 'block' : 'none';
            }
            preview.style.cssText = 'width: 100%;';
            // 親要素の高さを自動調整、プレースホルダーを非表示
            if (uploadArea) {
                uploadArea.classList.add('has-image');
                uploadArea.querySelectorAll('p').forEach(p => p.style.display = 'none');
            }
            const clearBtn = document.getElementById('clearTradeChart1Btn');
            if (clearBtn) clearBtn.style.display = 'block';
        }
    } else if (pendingImageType === 'tradeChart2') {
        const preview = document.getElementById('tradeChartImagePreview2');
        const uploadArea = document.getElementById('tradeChartImageUpload2');
        const captionEl = document.getElementById('tradeChartCaption2');
        if (preview) {
            const title = window.getImageTitle ? window.getImageTitle(imageData) : '';
            preview.innerHTML = `<img src="${imageSrc}" style="width: 100%; height: auto; border-radius: 8px;" alt="チャート画像2" onclick="showImageModalWithCaption(window.tempChartImage2, {type: 'newEntry', id: null, index: 1}); event.stopPropagation();">`;
            window.tempChartImage2 = imageData;
            // 枠外に題名を表示
            if (captionEl) {
                captionEl.textContent = title;
                captionEl.style.display = title ? 'block' : 'none';
            }
            preview.style.cssText = 'width: 100%;';
            // 親要素の高さを自動調整、プレースホルダーを非表示
            if (uploadArea) {
                uploadArea.classList.add('has-image');
                uploadArea.querySelectorAll('p').forEach(p => p.style.display = 'none');
            }
            const clearBtn = document.getElementById('clearTradeChart2Btn');
            if (clearBtn) clearBtn.style.display = 'block';
        }
    } else if (pendingImageType === 'tradeChart3') {
        const preview = document.getElementById('tradeChartImagePreview3');
        const uploadArea = document.getElementById('tradeChartImageUpload3');
        const captionEl = document.getElementById('tradeChartCaption3');
        if (preview) {
            const title = window.getImageTitle ? window.getImageTitle(imageData) : '';
            preview.innerHTML = `<img src="${imageSrc}" style="width: 100%; height: auto; border-radius: 8px;" alt="チャート画像3" onclick="showImageModalWithCaption(window.tempChartImage3, {type: 'newEntry', id: null, index: 2}); event.stopPropagation();">`;
            window.tempChartImage3 = imageData;
            // 枠外に題名を表示
            if (captionEl) {
                captionEl.textContent = title;
                captionEl.style.display = title ? 'block' : 'none';
            }
            preview.style.cssText = 'width: 100%;';
            // 親要素の高さを自動調整、プレースホルダーを非表示
            if (uploadArea) {
                uploadArea.classList.add('has-image');
                uploadArea.querySelectorAll('p').forEach(p => p.style.display = 'none');
            }
            const clearBtn = document.getElementById('clearTradeChart3Btn');
            if (clearBtn) clearBtn.style.display = 'block';
        }
    }
    
    // トレード編集時の画像更新
    if (window.pendingImageType === 'tradeIcon' || window.pendingImageType.startsWith('tradeChart')) {
        const tradeManager = window.TradeManager.getInstance();
        const trade = tradeManager.getTradeById(window.selectedTradeForEdit);
        
        if (trade) {
            let updateData = {};
            
            if (window.pendingImageType === 'tradeIcon') {
                updateData.chartImage = imageData;
            } else {
                const index = parseInt(window.pendingImageType.replace('tradeChart', ''));
                const chartImages = [...(trade.chartImages || [])];
                chartImages[index - 1] = imageData;
                updateData.chartImages = chartImages;
            }
            
            // TradeManagerで更新（MODULES.md準拠）
            tradeManager.updateTrade(window.selectedTradeForEdit, updateData);
            
            // 更新後のtradeを再取得
            const updatedTrade = tradeManager.getTradeById(window.selectedTradeForEdit);
            
            // UI更新
            if (typeof window.showTradeDetail === 'function') {
                window.showTradeDetail(updatedTrade);
            }
            if (typeof window.displayAllTrades === 'function') {
                window.displayAllTrades();
            }
        }
    }
    
    // 画像処理完了後に状態をリセット（MODULES.md準拠：責任の分離）
    // pendingImageType = null;  // 新規エントリーでは維持が必要なため、ここではリセットしない
};

// [削除済み - TradeEntry.jsに移行]
// handlePaste, processImageFile, clearTradeChartImage - TradeEntry.jsで管理

// ドラッグ&ドロップハンドラー
function handleImageDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

function handleTradeChartImageDrop(e, index) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        processImageFile(files[0], `tradeChart${index}`);
    }
}

function handleTradeChartImageUpload(e, index) {
    const file = e.target.files[0];
    if (file) {
        processImageFile(file, `tradeChart${index}`);
    }
}

// [削除済み - TradeEntry.jsに移行]
// handlePaste, processImageFile, clearTradeChartImage - TradeEntry.jsで管理

// [削除済み - TradeEntry.jsに移行]
// handlePaste() - TradeEntry.jsで管理

// 画像圧縮関数（ImageHandlerが読み込まれていない場合のフォールバック）
function compressImage(dataURL, maxWidth = 800, quality = 0.7) {
    // ImageHandlerが利用可能な場合は委譲
    if (typeof ImageHandler !== 'undefined' && ImageHandler.compress) {
        return ImageHandler.compress(dataURL, maxWidth, quality);
    }
    
    // フォールバック実装
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            let width = img.width;
            let height = img.height;
            
            // アスペクト比を保持しながらリサイズ
            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            ctx.drawImage(img, 0, 0, width, height);
            
            // 圧縮した画像をBase64で返す
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataURL;
    });
}

// ============================
// 10. テーマ管理
// ============================

// テーマ設定関数
function setTheme(theme) {
    const body = document.body;
    const buttons = document.querySelectorAll('.theme-btn');
    
    if (theme === 'light') {
        body.classList.add('light-mode');
    } else {
        body.classList.remove('light-mode');
    }
    
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if ((theme === 'light' && btn.textContent.includes('ライト')) ||
            (theme === 'dark' && btn.textContent.includes('ダーク'))) {
            btn.classList.add('active');
        }
    });
    
    storage.setItem('theme', theme);
    showToast(`${theme === 'light' ? 'ライト' : 'ダーク'}モードに切り替えました`, 'success');
}

function loadTheme() {
    const savedTheme = storage.getItem('theme') || 'dark';
    setTheme(savedTheme);
}

// ============================
// 11. その他のユーティリティ関数
// ============================

// 画像モーダル表示（従来版 - 互換性維持）
function showImageModal(src) {
    showImageModalWithCaption({ src: src, title: '', description: '' });
}

// 画像モーダル表示（題名・説明付き）
// context: { type: 'trade'|'note', id: string, index: number }
window.showImageModalWithCaption = function(imgData, context) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const captionArea = document.getElementById('modalImageCaption');
    const captionContent = document.getElementById('captionContent');
    const captionCollapsed = document.getElementById('captionCollapsed');
    const titleEl = document.getElementById('modalCaptionTitle');
    const descEl = document.getElementById('modalCaptionDesc');
    const editBtn = document.getElementById('modalCaptionEditBtn');
    
    if (!modal || !modalImage) return;
    
    // 画像データを正規化
    const normalized = window.normalizeImageData ? window.normalizeImageData(imgData) : 
                       (typeof imgData === 'string' ? { src: imgData, title: '', description: '' } : imgData);
    
    if (!normalized || !normalized.src) return;
    
    // 画像を設定
    modalImage.src = normalized.src;
    
    // 現在表示中の画像コンテキストを保存（編集用）
    window.currentModalImageContext = context || null;
    
    // 説明エリアの表示/非表示
    const hasCaption = normalized.title || normalized.description;
    
    if (captionArea) {
        if (hasCaption) {
            captionArea.style.display = 'block';
            if (titleEl) titleEl.textContent = normalized.title || '';
            if (descEl) descEl.textContent = normalized.description || '';
            // 表示状態にリセット
            if (captionContent) captionContent.style.display = 'block';
            if (captionCollapsed) captionCollapsed.style.display = 'none';
            window.captionVisible = true;
            // 編集ボタンの表示（コンテキストがある場合のみ）
            if (editBtn) {
                editBtn.style.display = context ? 'inline-block' : 'none';
            }
        } else {
            // 題名・説明がなくても編集ボタン表示のためエリアは表示
            if (titleEl) titleEl.textContent = '';
            if (descEl) descEl.textContent = '';
            if (captionContent) captionContent.style.display = 'block';
            if (captionCollapsed) captionCollapsed.style.display = 'none';
            window.captionVisible = true;
            if (editBtn) {
                editBtn.style.display = context ? 'inline-block' : 'none';
            }
        }
    }
    
    modal.style.display = 'flex';
};

// 説明の表示/非表示切り替え
window.toggleImageCaption = function() {
    const captionArea = document.getElementById('modalImageCaption');
    
    if (!captionArea) return;
    
    window.captionVisible = !window.captionVisible;
    
    if (window.captionVisible) {
        captionArea.style.display = 'block';
    } else {
        captionArea.style.display = 'none';
    }
};

// 説明表示状態の初期値
window.captionVisible = true;

// 現在表示中の画像コンテキスト
window.currentModalImageContext = null;

// 拡大モーダルから編集モーダルを開く
window.openModalImageEdit = function() {
    const context = window.currentModalImageContext;
    
    // 新規エントリーの場合の処理
    if (context && context.type === 'newEntry') {
        const index = context.index;
        const tempImages = [window.tempChartImage1, window.tempChartImage2, window.tempChartImage3];
        const imgData = tempImages[index];
        
        if (!imgData) {
            showToast('画像が見つかりません', 'error');
            return;
        }
        
        pendingImageType = 'tradeChart' + (index + 1);
        pendingImageForAdd = imgData;
        captionEditMode = 'add';
        
        const previewImg = document.getElementById('captionEditPreviewImg');
        const imageSrc = window.getImageSrc ? window.getImageSrc(imgData) : imgData;
        if (previewImg) previewImg.src = imageSrc;
        
        const titleInput = document.getElementById('captionEditTitle');
        const descInput = document.getElementById('captionEditDesc');
        const titleCount = document.getElementById('captionEditTitleCount');
        const descCount = document.getElementById('captionEditDescCount');
        
        const currentTitle = window.getImageTitle ? window.getImageTitle(imgData) : '';
        const currentDesc = window.getImageDescription ? window.getImageDescription(imgData) : '';
        
        if (titleInput) {
            titleInput.value = currentTitle;
            if (titleCount) titleCount.textContent = currentTitle.length;
        }
        if (descInput) {
            descInput.value = currentDesc;
            if (descCount) descCount.textContent = currentDesc.length;
        }
        
        const modalTitle = document.getElementById('captionEditModalTitle');
        if (modalTitle) modalTitle.textContent = '📝 画像の説明を編集';
        
        const saveBtn = document.getElementById('captionEditSaveBtn');
        if (saveBtn) saveBtn.textContent = '保存する';
        
        const changeBtn = document.getElementById('changeImageInEditBtn');
        if (changeBtn) changeBtn.style.display = 'block';
        
        closeImageModal();
        
        const modal = document.getElementById('imageCaptionEditModal');
        if (modal) modal.style.display = 'flex';
        
        return;
    }
    
    if (!context || !context.type || !context.id || context.index === undefined) {
        showToast('編集情報がありません', 'error');
        return;
    }
    
    // 拡大モーダルを閉じる
    closeImageModal();
    
    // 少し遅延させて編集モーダルを開く（source='modal'を指定）
    setTimeout(() => {
        openImageCaptionEdit(context.type, context.id, context.index, 'modal');
    }, 100);
};

// ========================================
// 画像説明編集機能
// ========================================

/**
 * 画像説明編集モーダルを開く
 * @param {string} type - 'trade' または 'note'
 * @param {string} id - トレードID または 日付文字列
 * @param {number} index - 画像インデックス（0始まり）
 * @param {string} source - 'modal'=拡大モーダルから, 'detail'=詳細から（デフォルト）
 */
window.openImageCaptionEdit = function(type, id, index, source = 'detail') {
    // 編集モードに設定
    captionEditMode = 'edit';
    pendingImageForAdd = null;
    
    let imgData = null;
    
    if (type === 'trade') {
        // トレードの画像
        const trade = window.tradeManager ? window.tradeManager.getTradeById(id) : null;
        if (trade && trade.chartImages && trade.chartImages[index]) {
            imgData = trade.chartImages[index];
        }
    } else if (type === 'note') {
        // 相場ノートの画像
        // まずtempNoteEditImagesから取得を試みる（編集中の最新データ）
        const tempKey = 'noteEdit_' + (index + 1);
        if (window.tempNoteEditImages && window.tempNoteEditImages[tempKey]) {
            imgData = window.tempNoteEditImages[tempKey];
        } else if (window.NoteManagerModule) {
            // tempNoteEditImagesにない場合はNoteManagerModuleから取得
            const note = window.NoteManagerModule.getNote(id);
            if (note && note.images && note.images[index]) {
                imgData = note.images[index];
            }
        }
    }
    
    if (!imgData) {
        showToast('画像が見つかりません', 'error');
        return;
    }
    
    // 画像データを正規化
    const normalized = window.normalizeImageData ? window.normalizeImageData(imgData) : 
                       { src: imgData, title: '', description: '' };
    
    // コンテキストを保存（sourceを含める）
    captionEditContext = { type, id, index, source };
    
    // モーダルに値をセット
    const previewImg = document.getElementById('captionEditPreviewImg');
    const titleInput = document.getElementById('captionEditTitle');
    const descInput = document.getElementById('captionEditDesc');
    const titleCount = document.getElementById('captionEditTitleCount');
    const descCount = document.getElementById('captionEditDescCount');
    
    if (previewImg) previewImg.src = normalized.src;
    if (titleInput) {
        titleInput.value = normalized.title || '';
        if (titleCount) titleCount.textContent = titleInput.value.length;
    }
    if (descInput) {
        descInput.value = normalized.description || '';
        if (descCount) descCount.textContent = descInput.value.length;
    }
    
    // タイトル設定（編集モード）
    const modalTitle = document.getElementById('captionEditModalTitle');
    if (modalTitle) modalTitle.textContent = '📝 画像の説明を編集';
    
    // ボタンテキスト設定（編集モード）
    const saveBtn = document.getElementById('captionEditSaveBtn');
    if (saveBtn) saveBtn.textContent = '保存';
    
    // 「画像を変更」ボタンを表示
    const changeBtn = document.getElementById('changeImageInEditBtn');
    if (changeBtn) changeBtn.style.display = 'block';
    
    // モーダルを表示
    const modal = document.getElementById('imageCaptionEditModal');
    if (modal) modal.style.display = 'flex';
};

/**
 * 画像説明編集モーダルを閉じる
 */
window.closeImageCaptionEditModal = function() {
    const modal = document.getElementById('imageCaptionEditModal');
    if (modal) modal.style.display = 'none';
    captionEditContext = null;
    captionEditMode = 'edit';
    pendingImageForAdd = null;
    pendingImageSrc = null;
    // 置換コンテキストをクリア
    window.pendingReplaceContext = null;
    // 注意: pendingImageTypeは新規エントリーで維持が必要なため、ここではリセットしない
};

/**
 * 画像説明を保存（追加モード/編集モード両対応）
 */
window.saveImageCaptionEdit = function() {
    const titleInput = document.getElementById('captionEditTitle');
    const descInput = document.getElementById('captionEditDesc');
    
    const title = titleInput ? titleInput.value.trim() : '';
    const description = descInput ? descInput.value.trim() : '';
    
    // 追加モードの場合
    if (captionEditMode === 'add') {
        if (!pendingImageSrc && !pendingImageForAdd) {
            showToast('画像が選択されていません', 'error');
            return;
        }
        
        const imageSrc = pendingImageForAdd || pendingImageSrc;
        
        // オブジェクトの場合は実際のsrcを取り出す（二重ネスト防止）
        const actualSrc = window.getImageSrc ? window.getImageSrc(imageSrc) : imageSrc;
        
        // 新形式の画像データを作成
        const imageData = window.createImageData 
            ? window.createImageData(actualSrc, title, description) 
            : { src: actualSrc, title, description };
        
        // 既存画像の置換の場合
        if (window.pendingReplaceContext) {
            const ctx = window.pendingReplaceContext;
            
            if (ctx.type === 'trade') {
                // トレードの画像を置換
                const trade = window.tradeManager ? window.tradeManager.getTradeById(ctx.id) : null;
                if (trade && trade.chartImages) {
                    const chartImages = [...trade.chartImages];
                    chartImages[ctx.index] = imageData;
                    
                    // TradeManager経由で更新（MODULES.md準拠）
                    window.tradeManager.updateTrade(ctx.id, { chartImages });
                    showToast('画像を変更しました', 'success');
                    
                    // UI更新：トレード一覧を再描画
                    if (window.tradeList && typeof window.tradeList.displayAllTrades === 'function') {
                        window.tradeList.displayAllTrades('tradeRecordsList');
                    }
                    
                    // 詳細モーダルが開いていれば更新
                    const updatedTrade = window.tradeManager.getTradeById(ctx.id);
                    if (ctx.source === 'modal') {
                        closeImageCaptionEditModal();
                        setTimeout(() => {
                            showImageModalWithCaption(imageData, { type: 'trade', id: ctx.id, index: ctx.index });
                        }, 150);
                    } else if (window.tradeDetail && typeof window.tradeDetail.showTradeDetail === 'function') {
                        window.tradeDetail.showTradeDetail(updatedTrade);
                    }
                }
            } else if (ctx.type === 'note') {
                // 相場ノートの画像を置換（NoteManagerModule経由）
                if (window.NoteManagerModule && typeof window.NoteManagerModule.replaceNoteImage === 'function') {
                    const success = window.NoteManagerModule.replaceNoteImage(ctx.id, ctx.index, imageData);
                    if (success) {
                        showToast('画像を変更しました', 'success');
                        
                        if (ctx.source === 'modal') {
                            closeImageCaptionEditModal();
                            setTimeout(() => {
                                showImageModalWithCaption(imageData, { type: 'note', id: ctx.id, index: ctx.index });
                            }, 150);
                            window.pendingReplaceContext = null;
                            return;
                        }
                    } else {
                        showToast('画像の変更に失敗しました', 'error');
                    }
                }
            }
            
            // コンテキストをクリア
            window.pendingReplaceContext = null;
            closeImageCaptionEditModal();
            return;
        }
        
        // 新規追加の場合（従来の処理）
        handleProcessedImage(imageData);
        closeImageCaptionEditModal();
        return;
    }
    
    // 編集モードの場合
    if (!captionEditContext) {
        showToast('編集対象が不明です', 'error');
        return;
    }
    
    const { type, id, index, source } = captionEditContext;
    let updatedImgData = null;
    
    if (type === 'trade') {
        // トレードの画像を更新
        const trade = window.tradeManager ? window.tradeManager.getTradeById(id) : null;
        if (trade && trade.chartImages) {
            const chartImages = [...trade.chartImages];
            const currentImg = chartImages[index];
            
            // 新形式に更新
            chartImages[index] = window.updateImageCaption 
                ? window.updateImageCaption(currentImg, title, description)
                : { src: window.getImageSrc(currentImg), title, description };
            
            // 保存
            window.tradeManager.updateTrade(id, { chartImages });
            showToast('画像の説明を更新しました', 'success');
            
            // 更新後の画像データを取得
            const updatedTrade = window.tradeManager.getTradeById(id);
            if (updatedTrade && updatedTrade.chartImages) {
                updatedImgData = updatedTrade.chartImages[index];
            }
            
            // UI更新：トレード一覧を再描画
            if (window.tradeList && typeof window.tradeList.displayAllTrades === 'function') {
                window.tradeList.displayAllTrades('tradeRecordsList');
            }
            
            // 戻り先に応じて処理を分岐
            if (source === 'modal') {
                // 拡大モーダルから来た場合 → 拡大モーダルに戻る
                closeImageCaptionEditModal();
                setTimeout(() => {
                    showImageModalWithCaption(updatedImgData, { type, id, index });
                }, 150);
                return;
            } else {
                // 詳細モーダルから来た場合 → 詳細モーダルを再表示
                if (window.tradeDetail && typeof window.tradeDetail.showTradeDetail === 'function') {
                    window.tradeDetail.showTradeDetail(updatedTrade);
                }
            }
        }
    } else if (type === 'note') {
        // 相場ノートの画像を更新
        if (window.NoteManagerModule) {
            const success = window.NoteManagerModule.updateImageCaption(id, index, title, description);
            if (success) {
                showToast('画像の説明を更新しました', 'success');
                
                // 更新後の画像データを取得
                const note = window.NoteManagerModule.getNote(id);
                if (note && note.images) {
                    updatedImgData = note.images[index];
                }
                
                // 戻り先に応じて処理を分岐
                if (source === 'modal') {
                    // 拡大モーダルから来た場合 → 拡大モーダルに戻る
                    closeImageCaptionEditModal();
                    setTimeout(() => {
                        showImageModalWithCaption(updatedImgData, { type, id, index });
                    }, 150);
                    return;
                }
                // 詳細から来た場合は特に何もしない（ノート一覧は自動更新される）
            } else {
                showToast('更新に失敗しました', 'error');
            }
        }
    }
    
    closeImageCaptionEditModal();
};

// 画像モーダルを閉じる
function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 遅延読み込み初期化
function initLazyLoading() {
    const images = document.querySelectorAll('img[loading="lazy"]');
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const image = entry.target;
                    image.src = image.dataset.src || image.src;
                    image.classList.remove('lazy');
                    imageObserver.unobserve(image);
                }
            });
        });

        images.forEach(img => imageObserver.observe(img));
    }
}

// ストレージ情報更新
function updateStorageInfo() {
    const remainingElement = document.getElementById('remainingStorage');
    if (remainingElement && storageInfo) {
        const used = storageInfo.serverUsed || 0;
        const limit = storageInfo.serverLimit || 100 * 1024 * 1024;
        const remaining = limit - used;
        const remainingMB = (remaining / 1024 / 1024).toFixed(1);
        const limitMB = (limit / 1024 / 1024).toFixed(0);
        remainingElement.textContent = `${remainingMB}MB/${limitMB}MB`;
    }
}

// 目標達成状態の切り替え
function toggleGoalAchieved(goalNumber) {
    const goalItem = document.querySelector(`.goal-item[data-goal="${goalNumber}"]`);
    if (!goalItem) return;
    
    const goal = goalsData.goals[goalNumber - 1];
    goal.achieved = !goal.achieved;
    
    if (goal.achieved) {
        goalItem.classList.add('achieved');
        showToast(`目標${goalNumber}を達成しました！`, 'success');
    } else {
        goalItem.classList.remove('achieved');
    }
    
    // データを保存
    storage.setItem('goalsData', JSON.stringify(goalsData));
}

// ユーザーアイコン変更関数
function changeUserIcon() {
    // 既存のイベントリスナーを削除
    const userIconElement = document.getElementById('userIcon');
    if (!userIconElement) return;
    
    // 新しいinput要素を作成
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none'; // 非表示にする
    
    // bodyに一時的に追加
    document.body.appendChild(input);
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
            // ファイルが選択されなかった場合もinputを削除
            document.body.removeChild(input);
            return;
        }
        
        // ファイルサイズチェック（5MB以下）
        if (file.size > 5 * 1024 * 1024) {
            showToast('画像サイズは5MB以下にしてください', 'error');
            document.body.removeChild(input);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let iconData = e.target.result;
                
                // 画像を自動圧縮（ImageHandlerを使用）
                if (typeof ImageHandler !== 'undefined' && ImageHandler.compressWithPreset) {
                    iconData = await ImageHandler.compressWithPreset(iconData, 'icon');
                }
                
                // アイコンを更新
                userIconElement.src = iconData;
                storage.setItem('userIcon', iconData);
                showToast('アイコンを変更しました', 'success');
            } catch (error) {
                showToast('アイコンの変更に失敗しました', 'error');
            }
        };
        reader.readAsDataURL(file);
        
        // inputを削除
        document.body.removeChild(input);
    };
    
    // クリックイベントを発火
    input.click();
}

// タイトル編集
function editTitle() {
    const headerTitleElement = document.getElementById('headerTitle');
    if (!headerTitleElement) return;
    
    const currentTitle = headerTitleElement.textContent;
    const newTitle = prompt('新しいタイトルを入力してください:', currentTitle);
    
    if (newTitle && newTitle !== currentTitle) {
        headerTitleElement.textContent = newTitle;
        const siteTitleElement = document.getElementById('siteTitle');
        if (siteTitleElement) siteTitleElement.value = newTitle;
        document.title = newTitle;
        storage.setItem('siteTitle', newTitle);
        showToast('タイトルを変更しました', 'success');
    }
}

// サブタイトル編集
function editSubtitle() {
    const headerSubtitleElement = document.getElementById('headerSubtitle');
    if (!headerSubtitleElement) return;
    
    const currentSubtitle = headerSubtitleElement.textContent;
    const newSubtitle = prompt('新しいサブタイトルを入力してください:', currentSubtitle);
    
    if (newSubtitle && newSubtitle !== currentSubtitle) {
        headerSubtitleElement.textContent = newSubtitle;
        const siteSubtitleElement = document.getElementById('siteSubtitle');
        if (siteSubtitleElement) siteSubtitleElement.value = newSubtitle;
        storage.setItem('siteSubtitle', newSubtitle);
        showToast('サブタイトルを変更しました', 'success');
    }
}

// エントリー条件チェックのリスナー設定
function setupEntryConditionsListeners() {
    // チェックリスト入力時の自動更新
    for (let i = 1; i <= 3; i++) {
        const reasonInput = document.getElementById(`reason${i}`);
        if (reasonInput) {
            reasonInput.addEventListener('input', checkEntryConditions);
            reasonInput.addEventListener('change', checkEntryConditions);
        }
    }
    
    // 初期状態をチェック
    checkEntryConditions();
}

// 新規追加：キーボードショートカット設定
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+S: 保存
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab) {
                const tabName = activeTab.dataset.tab;
                
                if (tabName === 'new-entry' && window.saveTradeRecord) {
                    window.saveTradeRecord();
                } else if (tabName === 'notes' && window.saveNote) {
                    window.saveNote();
                }
            }
            return;
        }
        
        // Ctrl+1〜6: タブ切り替え（6タブ対応・新配置）
        if (e.ctrlKey && e.key >= '1' && e.key <= '6') {
            e.preventDefault();
            const TAB_SHORTCUT_MAPPING = {
                '1': 'new-entry',
                '2': 'records',
                '3': 'notes',
                '4': 'analysis',
                '5': 'tax',
                '6': 'settings'
            };
            
            const tabName = TAB_SHORTCUT_MAPPING[e.key];
            if (tabName) {
                switchTab(tabName);
            }
            return;
        }
        
        // F1: ヘルプ表示
        if (e.key === 'F1') {
            e.preventDefault();
            showKeyboardHelp();
            return;
        }
        
        // Esc: モーダルを閉じる
        if (e.key === 'Escape') {
            closeAllModals();
            return;
        }
    });
}

// 新規追加：ヘルプ表示
function showKeyboardHelp() {
    const helpText = `
⌨️ キーボードショートカット一覧
━━━━━━━━━━━━━━━━━━━━━
Ctrl + S    : 保存（エントリー/ノート）
Ctrl + 1〜6 : 各タブへ移動
  1: 新規エントリー
  2: トレード記録
  3: 相場ノート
  4: 分析
  5: 収支管理
  6: 設定
F1         : このヘルプを表示
Esc        : ダイアログを閉じる
━━━━━━━━━━━━━━━━━━━━━`;
    
    alert(helpText);
}

// 新規追加：全モーダルを閉じる
function closeAllModals() {
    // 各モーダルのクローズ関数を試行
    const modalCloseFunctions = [
        'closeExitModal',
        'closeTradeEditModal', 
        'closeTradeDetailModal',
        'closeReflectionEditModal',
        'closeNoteEditModal',
        'closeImageAddModal',
        'closeImageModal'
    ];
    
    modalCloseFunctions.forEach(funcName => {
        if (window[funcName]) {
            try {
                window[funcName]();
            } catch (e) {
                // エラーは無視
            }
        }
    });
}

// タブ切り替え確認関数（デバッグ用）
function verifyTabSystem() {
    console.clear();
    console.log('%c🔧 TAB_ID_MAPPING修正確認', 'background: #4169e1; color: #fff; padding: 10px; font-size: 16px; font-weight: bold;');
    console.log('='.repeat(60));
    
    // 実際のタブコンテンツを確認
    console.log('\n📋 実際のタブコンテンツ:');
    document.querySelectorAll('.tab-content').forEach(tab => {
        console.log(`  ID: "${tab.id}"`);
    });
    
    // マッピングテスト
    console.log('\n🔄 マッピング動作確認:');
    const tabs = ['new-entry', 'records', 'notes', 'analysis', 'sns-post', 'learning', 'expense', 'settings'];
    let success = 0;
    
    tabs.forEach(tabId => {
        const element = document.getElementById(tabId);
        if (element) {
            console.log(`  ✅ ${tabId}: 存在`);
            success++;
        } else {
            console.log(`  ❌ ${tabId}: 見つかりません`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log(`結果: ${success}/${tabs.length} タブが正常に動作`);
    
    if (success === tabs.length) {
        console.log('%c✅ 完璧！すべてのタブが正常です', 'color: #00ff88; font-size: 14px; font-weight: bold;');
    }
    
    return success === tabs.length;
}

// タブナビゲーション表示関数（新規追加）
function displayTabNavigation() {
    // タブボタンの表示状態を管理
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        const tabName = btn.getAttribute('data-tab');
        const tabId = TAB_ID_MAPPING[tabName] || tabName;
        const tabContent = document.getElementById(tabId);
        
        // タブコンテンツが存在しない場合はボタンを無効化または非表示
        if (!tabContent) {
            btn.classList.add('disabled');
            btn.title = '準備中';
        }
    });
}

// 円建て損益の自動計算機能
function setupYenProfitLossListeners() {
    const inputs = ['trade-pl', 'swap-points', 'commission'];
    
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', calculateNetProfit);
            element.addEventListener('change', calculateNetProfit);
        }
    });
}

// 純損益の計算
function calculateNetProfit() {
    const tradePL = Number(document.getElementById('trade-pl')?.value) || 0;
    const swapPoints = Number(document.getElementById('swap-points')?.value) || 0;
    const commission = Number(document.getElementById('commission')?.value) || 0;
    
    const netProfit = tradePL + swapPoints - Math.abs(commission);
    
    const display = document.getElementById('net-profit-loss');
    if (display) {
        display.textContent = `¥${netProfit.toLocaleString('ja-JP')}`;
        
        // 色分け表示
        if (netProfit > 0) {
            display.style.color = '#4ade80';  // 緑
            display.classList.remove('loss');
            display.classList.add('profit');
        } else if (netProfit < 0) {
            display.style.color = '#f87171';  // 赤
            display.classList.remove('profit');
            display.classList.add('loss');
        } else {
            display.style.color = 'inherit';
            display.classList.remove('profit', 'loss');
        }
    }
    
    return netProfit;
}

// トレードID生成
function generateTradeId() {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// フォームリセット（円建て損益対応）
function resetTradeForm() {
    // 円建て損益フィールドのリセット
    const yenFields = ['trade-pl', 'swap-points', 'commission'];
    yenFields.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
    
    // 純損益表示のリセット
    const display = document.getElementById('net-profit-loss');
    if (display) {
        display.textContent = '¥0';
        display.style.color = 'inherit';
        display.classList.remove('profit', 'loss');
    }
    
    // 既存のフォームフィールドもリセット（必要に応じて追加）
    const form = document.querySelector('#new-entry form');
    if (form) form.reset();
}

// ============================
// 12. Window関数の登録
// ============================

// タブIDマッピングをグローバルに公開
window.TAB_ID_MAPPING = TAB_ID_MAPPING;
window.displayTabNavigation = displayTabNavigation;
window.verifyTabSystem = verifyTabSystem;

// 円建て損益関連関数の登録
window.setupYenProfitLossListeners = setupYenProfitLossListeners;
window.calculateNetProfit = calculateNetProfit;
window.generateTradeId = generateTradeId;
window.resetTradeForm = resetTradeForm;

// Window関数の登録
window.showToast = showToast;
window.escapeHtml = escapeHtml;
window.safeGetElement = safeGetElement;
window.showImageModal = showImageModal;
window.closeImageModal = closeImageModal;
window.formatDateForDisplay = formatDateForDisplay;
window.formatDateForCalendar = formatDateForCalendar;
window.formatDateForInput = formatDateForInput;
window.formatDateTimeForDisplay = formatDateTimeForDisplay;
window.formatDateTimeForInput = formatDateTimeForInput;
window.formatDateTimeForDisplay = formatDateTimeForDisplay;
window.roundToQuarterHour = roundToQuarterHour;
window.setCurrentDateTime = setCurrentDateTime;
window.saveTrades = saveTrades;
window.saveNotes = saveNotes;
window.loadAllData = loadAllData;
window.migrateNotesData = migrateNotesData;
window.migrateYenProfitLossData = migrateYenProfitLossData;
window.repairTradeData = repairTradeData;
window.initializeApp = initializeApp;
window.setupEventListeners = setupEventListeners;
window.setupImageUploadHandlers = setupImageUploadHandlers;
window.setupAutoSave = setupAutoSave;
window.debounce = debounce;
window.closeImageAddModal = closeImageAddModal;
window.processLocalImage = processLocalImage;
window.handleProcessedImage = handleProcessedImage;
window.handleImageDragOver = handleImageDragOver;
window.handleTradeChartImageDrop = handleTradeChartImageDrop;
window.handleTradeChartImageUpload = handleTradeChartImageUpload;
window.initLazyLoading = initLazyLoading;
window.updateStorageInfo = updateStorageInfo;
window.compressImage = compressImage;
window.changeUserIcon = changeUserIcon;
window.editTitle = editTitle;
window.editSubtitle = editSubtitle;
window.setTheme = setTheme;
window.loadTheme = loadTheme;
window.switchTab = switchTab;
window.toggleGoalAchieved = toggleGoalAchieved;
window.setupEntryConditionsListeners = setupEntryConditionsListeners;
window.setupKeyboardShortcuts = setupKeyboardShortcuts;
window.showKeyboardHelp = showKeyboardHelp;
window.closeAllModals = closeAllModals;

// グローバルデータのwindow登録
window.goalsData = goalsData;
window.storageInfo = storageInfo;
window.trades = trades;
window.notes = notes;
window.TradeListRenderer = TradeListRenderer;
window.currentChartView = currentChartView;
window.yenProfitLossManager = yenProfitLossManager;

// ============================
// 13. 初期化処理
// ============================

// DOMContentLoaded イベント
document.addEventListener('DOMContentLoaded', function() {
    // ストレージ初期化
    storage.init();
    
    // グローバル変数の再初期化（念のため）
    if (!currentWeekStart || !(currentWeekStart instanceof Date)) {
        currentWeekStart = new Date();
        const day = currentWeekStart.getDay();
        const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
        currentWeekStart.setDate(diff);
    }
    
    // データ読み込み（順序重要）
    loadAllData();
    initializeApp();
    
    // データ移行チェック（円建て損益対応）
    if (!storage.getItem('yen_profit_loss_migrated')) {
        const migratedCount = migrateYenProfitLossData();
        if (migratedCount > 0) {
            storage.setItem('yen_profit_loss_migrated', 'true');
            console.log('円建て損益データ移行完了');
        }
    }
    
    // タブナビゲーションの初期化
    if (typeof displayTabNavigation === 'function') {
        displayTabNavigation();
    }
    
    // タブシステムの動作確認（開発時のみ）
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        setTimeout(() => {
            if (typeof verifyTabSystem === 'function') {
                verifyTabSystem();
            }
        }, 500);
    }
    
    // 円建て損益管理の初期化
    if (typeof YenProfitLossManager !== 'undefined') {
        yenProfitLossManager = new YenProfitLossManager();
        window.yenProfitLossManager = yenProfitLossManager;
        console.log('✅ YenProfitLossManager初期化完了');
        
        // 自動計算のイベントリスナー設定
        setupYenProfitLossListeners();
    } else {
        console.log('⚠️ YenProfitLossManagerは後で読み込まれます');
    }
    
    // イベントリスナーの設定
    setupEventListeners();
    
    // 100ms後に他の初期化処理を実行（他のPartが読み込まれるのを待つ）
    setTimeout(() => {
        // DOM要素が存在し、関数が定義されている場合のみ実行
        if (typeof updateQuickStats === 'function') {
            updateQuickStats();
        }
        
        if (typeof displayAllTrades === 'function') {
            displayAllTrades();
        }
        
        if (typeof updateWeeklyPreview === 'function') {
            updateWeeklyPreview();
        }
        
        if (typeof loadSNSTradeOptions === 'function') {
            loadSNSTradeOptions();
        }
        
        if (typeof updateGoalsDisplay === 'function') {
            updateGoalsDisplay();
        }
        
        // 目標折りたたみ初期化（モバイル用）
        if (typeof initGoalsToggle === 'function') {
            initGoalsToggle();
        }
        
        updateStorageInfo();
        
        if (document.getElementById('calendarDates') && typeof updateCalendar === 'function') {
            updateCalendar();
        }
        
        // 現在日時を設定
        setCurrentDateTime();
        
        // ノート関連の初期化
        const noteDateElement = document.getElementById('noteDate');
        if (noteDateElement) {
            const today = formatDateForInput(new Date());
            noteDateElement.value = today;
            
            if (typeof loadNoteForDate === 'function') {
                loadNoteForDate(today);
            }
        }
        
        // レポート関連の初期化
        const now = new Date();
        const reportMonthElement = document.getElementById('reportMonth');
        if (reportMonthElement) {
            reportMonthElement.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        
        // リスクリワード計算
        if (typeof updateRiskReward === 'function') {
            updateRiskReward();
        }
    }, 100);
});

// 定期的な自動保存（メモリストレージの場合は無効）
if (storage.isAvailable) {
    setInterval(() => {
        // 現在の状態を保存
        saveTrades();
        saveNotes();
    }, 300000); // 5分ごと
}

// storageオブジェクトをwindowにエクスポート
window.storage = storage;

// ========== Part 1 終了 ==========
// ========== Script.js Part 2: トレード記部門 ==========

// TradeManager参照を追加（Part 2内で使用）
const tradeManager = TradeManager.getInstance();

// TradeListRenderer を最初に定義
window.TradeListRenderer = {
    fragment: null,
    
    render(trades, container, showActions = true) {
        this.fragment = document.createDocumentFragment();
        
        if (trades.length === 0) {
            const p = document.createElement('p');
            p.style.textAlign = 'center';
            p.style.color = '#888';
            p.textContent = 'トレード記録がありません';
            this.fragment.appendChild(p);
        } else {
            trades.forEach(trade => {
                this.fragment.appendChild(createTradeCard(trade, showActions));
            });
        }
        
        container.innerHTML = '';
        container.appendChild(this.fragment);
        
        // メモリリーク対策
        this.fragment = null;
    }
};

// 保有時間計算（TradeCalculatorに移行済み）

// バリデーションエラー表示関数（新規追加）
function showValidationError(inputElement, message, details = "") {
    // 既存のエラー表示をクリア
    clearValidationErrors();
    
    // エラースタイルを適用
    inputElement.style.border = "2px solid #ff4444";
    inputElement.style.backgroundColor = "rgba(255, 68, 68, 0.05)";
    
    // エラーメッセージを表示
    const errorDiv = document.createElement('div');
    errorDiv.className = 'validation-error-message';
    errorDiv.style.cssText = `
        color: #ff4444;
        font-size: 13px;
        margin-top: 8px;
        padding: 10px;
        background: rgba(255, 68, 68, 0.1);
        border-radius: 6px;
        border: 1px solid #ff4444;
        font-weight: 500;
        animation: shake 0.5s ease-in-out;
    `;
    
    // メッセージ構築
    let errorContent = message;
    if (details) {
        errorContent += `<br><small style="opacity: 0.8; font-size: 11px; white-space: pre-line;">${details}</small>`;
    }
    errorDiv.innerHTML = errorContent;
    
    // エラーメッセージを入力欄の後に挿入
    inputElement.parentElement.appendChild(errorDiv);
    
    // 入力欄にフォーカス
    inputElement.focus();
    
    // 7秒後に自動的にエラーを消す
    setTimeout(() => {
        clearValidationErrors();
    }, 7000);
}

// バリデーションエラークリア関数（新規追加）
function clearValidationErrors() {
    // エラーメッセージを削除
    document.querySelectorAll('.validation-error-message').forEach(el => el.remove());
    
    // エラースタイルをリセット
    document.querySelectorAll('.exit-time').forEach(el => {
        el.style.border = "";
        el.style.backgroundColor = "";
    });
}

// ============================
// 1. トレード新規エントリー機能
// ============================

// [削除済み - TradeEntry.jsに移行]
// saveTradeRecord() - TradeEntry.jsで管理

// [削除済み - TradeEntry.jsに移行]
// clearForm() - TradeEntry.jsで管理

// [削除済み - TradeEntry.jsに移行]
// checkEntryConditions() - TradeEntry.jsで管理

// ============================
// 2. リスクリワード計算
// ============================

// ============================
// TradeCalculatorモジュールに移行済み
// - calculateRiskReward() → js/part2/TradeCalculator.js
// - updateRiskReward() → js/part2/TradeCalculator.js
// - calculateTradePips() → js/part2/TradeCalculator.js
// - calculateRemainingLot() → js/part2/TradeCalculator.js
// - calculateInitialRR() → js/part2/TradeCalculator.js
// - calculateTradeRR() → js/part2/TradeCalculator.js
// - calculateHoldingTime() → js/part2/TradeCalculator.js
// bridge.jsで既存コードとの互換性を維持
// ============================

// ============================
// 3. トレード決済機能
// ============================

// ============================
// 4. トレード編集・削除機能
// ============================

// 編集画面での決済追加
function addExitInEdit() {
    const container = document.getElementById('editExitsList');
    if (!container) return;
    
    const trade = tradeManager.getTradeById(window.selectedTradeForEdit);
    if (!trade) return;
    
    // 既存の決済ロットを計算
    let exitedLot = 0;
    const exitLotInputs = container.querySelectorAll('.exit-lot');
    exitLotInputs.forEach(input => {
        exitedLot += parseFloat(input.value || 0);
    });
    const remainingLot = trade.lotSize - exitedLot;
    
    const entry = document.createElement('div');
    entry.className = 'exit-entry-edit';
    entry.innerHTML = `
        <input type="datetime-local" class="exit-time" value="${formatDateTimeForInput(new Date())}" />
        <input type="number" class="exit-price" placeholder="決済価格" step="0.00001" />
        <input type="number" class="exit-lot" placeholder="決済ロット" step="0.1" value="${remainingLot > 0 ? remainingLot.toFixed(2) : ''}" />
        <button class="remove-exit" onclick="this.parentElement.remove()">削除</button>
    `;
    container.appendChild(entry);
    
    // リアルタイムバリデーション追加
    const dateTimeInput = entry.querySelector('.exit-time');
    dateTimeInput.addEventListener('change', function() {
        const currentEntryTime = document.getElementById('editEntryTime').value;
        if (currentEntryTime && this.value) {
            const validation = validateExitDateTime(currentEntryTime, this.value);
            if (!validation.isValid) {
                showValidationError(this, validation.message, validation.details);
            } else {
                clearValidationErrors();
            }
        }
    });
}

// ============================
// 5. トレード表示・フィルター機能
// ============================

// クイック統計更新
function updateQuickStats() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // 今月のトレードを抽出
    const monthlyTrades = tradeManager.getAllTrades().filter(trade => {
        const tradeDate = new Date(trade.entryTime);
        return tradeDate.getMonth() === currentMonth && tradeDate.getFullYear() === currentYear;
    });
    
    // 決済済みトレードのみで計算
    const closedTrades = monthlyTrades.filter(t => t.exits.length > 0);
    
    let monthlyPips = 0;
    let wins = 0;
    let losses = 0;
    let totalClosedTrades = 0;
    let totalRR = 0;
    let monthlyYenPL = 0; // 円建て損益の合計
    
    closedTrades.forEach(trade => {
        const pips = typeof calculateTradePips === 'function' ? calculateTradePips(trade) : 0;
        monthlyPips += pips;
        
        if (pips > 0) {
            wins++;
        } else if (pips < 0) {
            losses++;
        }
        
        // R:R計算
        const risk = Math.abs(trade.entryPrice - trade.stopLoss);
        if (risk > 0) {
            const reward = Math.abs(pips / 100 * (trade.pair.includes('JPY') ? 1 : 0.0001));
            totalRR += reward / risk;
            totalClosedTrades++;
        }
        
        // 円建て損益の集計
        if (trade.yenProfitLoss && trade.yenProfitLoss.netProfit) {
            monthlyYenPL += trade.yenProfitLoss.netProfit;
        }
    });
    
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses) * 100) : 0;
    const avgRR = totalClosedTrades > 0 ? totalRR / totalClosedTrades : 0;
    
    // UI更新
    document.getElementById('monthlyPipsValue').textContent = `${monthlyPips >= 0 ? '+' : ''}${monthlyPips.toFixed(1)}`;
    document.getElementById('monthlyWinLoss').textContent = `${wins}勝${losses}敗`;
    document.getElementById('winRateValue').textContent = `${winRate.toFixed(1)}%`;
    document.getElementById('avgRRValue').textContent = avgRR > 0 ? avgRR.toFixed(2) : '-';
    
    // 円建て損益の表示（要素が存在する場合）
    const yenPLElement = document.getElementById('monthlyYenPL');
    if (yenPLElement) {
        yenPLElement.textContent = `¥${monthlyYenPL.toLocaleString('ja-JP')}`;
        yenPLElement.style.color = monthlyYenPL >= 0 ? '#4ade80' : '#f87171';
    }
}

// TradeListRendererは既にPart 2の先頭で定義済み

// 全トレード表示
function displayAllTrades() {
    const container = document.getElementById('tradeRecordsList');
    if (!container) return;
    
    const sortedTrades = [...tradeManager.getAllTrades()].sort((a, b) => {
        const dateA = new Date(a.entryTime || a.entryDatetime || a.date);
        const dateB = new Date(b.entryTime || b.entryDatetime || b.date);
        return dateB - dateA; // 新しい順
    });
    
    const maxDisplay = 50;
    const displayTrades = sortedTrades.slice(0, maxDisplay);
    
    window.TradeListRenderer.render(displayTrades, container, true);
    
    if (sortedTrades.length > maxDisplay) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'btn btn-secondary';
        loadMoreBtn.style.width = '100%';
        loadMoreBtn.style.marginTop = '20px';
        loadMoreBtn.textContent = `さらに表示 (${sortedTrades.length - maxDisplay}件)`;
        loadMoreBtn.onclick = () => displayAllTradesComplete();
        container.appendChild(loadMoreBtn);
    }
    
    updateFilterOptions();
}

// 全トレード完全表示
function displayAllTradesComplete() {
    const container = document.getElementById('tradeRecordsList');
    if (!container) return;
    
    const sortedTrades = [...tradeManager.getAllTrades()].sort((a, b) => {
        const dateA = new Date(a.entryTime || a.entryDatetime || a.date);
        const dateB = new Date(b.entryTime || b.entryDatetime || b.date);
        return dateB - dateA; // 新しい順
    });
    
    window.TradeListRenderer.render(sortedTrades, container, true);
}

// createTradeCard関数
function createTradeCard(trade, showActions = false) {
    // TradeList.jsのcreateTradeCardを呼ぶか、直接実装
    if (window.tradeList && window.tradeList.createTradeCard) {
        return window.tradeList.createTradeCard(trade, showActions);
    }
    
    // フォールバック実装
    const card = document.createElement('div');
    card.className = 'trade-card';
    card.innerHTML = `
        <div class="trade-header">
            <span class="trade-pair">${trade.pair}</span>
            <span class="trade-direction">${trade.direction}</span>
            <span class="trade-date">${formatDateTimeForDisplay(trade.entryTime || trade.entryDatetime || trade.date)}</span>
        </div>
    `;
    return card;
}

// フィルターオプション更新
function updateFilterOptions() {
    // 年フィルター
    const yearFilter = document.getElementById('yearFilter');
    if (yearFilter) {
        const years = [...new Set(tradeManager.getAllTrades().map(t => {
            return new Date(t.entryTime || t.entryDatetime || t.date).getFullYear();
        }))].sort((a, b) => b - a);
        
        yearFilter.innerHTML = '<option value="">全て</option>';
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `${year}年`;
            yearFilter.appendChild(option);
        });
    }
    
    // ペアフィルター
    const pairFilter = document.getElementById('pairFilter');
    if (pairFilter) {
        const pairs = [...new Set(tradeManager.getAllTrades().map(t => t.pair))].sort();
        pairFilter.innerHTML = '<option value="">全て</option>';
        pairs.forEach(pair => {
            const option = document.createElement('option');
            option.value = pair;
            option.textContent = pair;
            pairFilter.appendChild(option);
        });
    }
}

// フィルタートレード
function filterTrades() {
    const yearFilter = document.getElementById('yearFilter') ? document.getElementById('yearFilter').value : '';
    const monthFilter = document.getElementById('monthFilter') ? document.getElementById('monthFilter').value : '';
    const pairFilter = document.getElementById('pairFilter') ? document.getElementById('pairFilter').value : '';
    const statusFilter = document.getElementById('statusFilter') ? document.getElementById('statusFilter').value : '';
    
    let filteredTrades = [...tradeManager.getAllTrades()];
    
    // 年フィルター
    if (yearFilter) {
        filteredTrades = filteredTrades.filter(t => {
            return new Date(t.entryTime || t.entryDatetime || t.date).getFullYear() == yearFilter;
        });
    }
    
    // 月フィルター
    if (monthFilter) {
        filteredTrades = filteredTrades.filter(t => {
            return new Date(t.entryTime || t.entryDatetime || t.date).getMonth() + 1 == monthFilter;
        });
    }
    
    // ペアフィルター
    if (pairFilter) {
        filteredTrades = filteredTrades.filter(t => t.pair === pairFilter);
    }
    
    // ステータスフィルター
    if (statusFilter) {
        if (statusFilter === 'active') {
            filteredTrades = filteredTrades.filter(t => !t.exits || t.exits.length === 0);
        } else if (statusFilter === 'closed') {
            filteredTrades = filteredTrades.filter(t => t.exits && t.exits.length > 0);
        }
    }
    
    // 表示（新しい順にソート）
    const container = document.getElementById('tradeRecordsList');
    if (container) {
        filteredTrades = filteredTrades.sort((a, b) => {
            const dateA = new Date(a.entryTime || a.entryDatetime || a.date);
            const dateB = new Date(b.entryTime || b.entryDatetime || b.date);
            return dateB - dateA; // 新しい順
        });
        window.TradeListRenderer.render(filteredTrades, container, true);
    }
}

// ============================
// エントリー情報編集機能
// ============================


// モーダルを閉じる共通関数
function closeEditModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
}

// 既存のexit関連の補助関数（既存の場合は重複を避ける）
function addNewExit() {
    // 決済追加のコード
}

function removeExit(index) {
    // 決済削除のコード
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP');
}

// ============================
// 円建て損益管理機能
// ============================

// 円建て損益の追加
function addYenProfitLoss(tradeId) {
    const trade = tradeManager.getTradeById(tradeId);
    if (!trade) return;
    
    // 初期値として pips から概算値を計算（参考値）
    const pips = calculateTradePips(trade);
    const estimatedValue = Math.round(pips * trade.lotSize * 100); // 概算値
    
    // モーダル作成
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'yenProfitLossModal';
    modal.style.display = 'flex';
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.maxWidth = '500px';
    
    content.innerHTML = `
        <div class="modal-header">
            <h2>💴 円建て損益入力</h2>
            <button class="modal-close" onclick="closeYenProfitLossModal()">×</button>
        </div>
        <div style="padding: 20px;">
            <h3>${trade.pair} ${trade.direction === 'long' ? 'LONG' : 'SHORT'}</h3>
            <p style="color: #888; margin-bottom: 20px;">
                ${formatDateTimeForDisplay(trade.entryTime)} → 
                ${trade.exits.length > 0 ? formatDateTimeForDisplay(trade.exits[trade.exits.length - 1].time) : '未決済'}
            </p>
            
            <div class="input-grid" style="gap: 15px;">
                <div class="input-group">
                    <label>トレード損益（必須）</label>
                    <input type="number" id="yenTradePL" value="${estimatedValue}" step="1">
                    <small style="color: #666;">pips (${pips.toFixed(1)}) × ロット (${trade.lotSize}) からの概算値</small>
                </div>
                
                <div class="input-group">
                    <label>スワップポイント</label>
                    <input type="number" id="yenSwapPoints" value="0" step="1">
                    <small style="color: #666;">マイナスの場合は負の値を入力</small>
                </div>
                
                <div class="input-group">
                    <label>手数料</label>
                    <input type="number" id="yenCommission" value="0" step="1" min="0">
                    <small style="color: #666;">常に正の値で入力（自動で減算されます）</small>
                </div>
                
                <div class="input-group">
                    <label>ブローカー</label>
                    <select id="yenBroker">
                        <option value="">選択してください</option>
                        <option value="DMM FX">DMM FX</option>
                        <option value="GMOクリック証券">GMOクリック証券</option>
                        <option value="みんなのFX">みんなのFX</option>
                        <option value="SBI FXトレード">SBI FXトレード</option>
                        <option value="楽天FX">楽天FX</option>
                        <option value="ヒロセ通商">ヒロセ通商</option>
                        <option value="その他">その他</option>
                    </select>
                </div>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
                <h4 style="margin-bottom: 10px;">計算結果</h4>
                <div id="yenCalculationResult"></div>
            </div>
            
            <div class="button-group" style="margin-top: 20px;">
                <button class="btn btn-primary" onclick="saveYenProfitLoss(${tradeId})">保存</button>
                <button class="btn btn-secondary" onclick="closeYenProfitLossModal()">キャンセル</button>
            </div>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // リアルタイム計算
    const updateCalculation = () => {
        const tradePL = parseFloat(document.getElementById('yenTradePL').value) || 0;
        const swapPoints = parseFloat(document.getElementById('yenSwapPoints').value) || 0;
        const commission = parseFloat(document.getElementById('yenCommission').value) || 0;
        const netProfitLoss = tradePL + swapPoints - commission;
        
        document.getElementById('yenCalculationResult').innerHTML = `
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center;">
                <span>トレード損益:</span>
                <span style="text-align: right;">¥${tradePL.toLocaleString('ja-JP')}</span>
                
                <span>スワップ:</span>
                <span style="text-align: right;">${swapPoints >= 0 ? '+' : ''}¥${swapPoints.toLocaleString('ja-JP')}</span>
                
                <span>手数料:</span>
                <span style="text-align: right; color: #f87171;">-¥${commission.toLocaleString('ja-JP')}</span>
                
                <span class="net-profit-label" style="font-weight: bold; padding-top: 10px;">純損益:</span>
                <span class="net-profit-value" style="text-align: right; font-weight: bold; padding-top: 10px; color: ${netProfitLoss >= 0 ? '#4ade80' : '#f87171'};">
                    ¥${netProfitLoss.toLocaleString('ja-JP')}
                </span>
            </div>
        `;
    };
    
    // イベントリスナー設定
    ['yenTradePL', 'yenSwapPoints', 'yenCommission'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateCalculation);
    });
    
    // 初期計算
    updateCalculation();
}

// 円建て損益の編集
function editYenProfitLoss(tradeId) {
    const trade = tradeManager.getTradeById(tradeId);
    if (!trade || !trade.yenProfitLoss) return;
    
    const yenPL = trade.yenProfitLoss;
    
    // モーダル作成（addと同様の構造）
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'yenProfitLossModal';
    modal.style.display = 'flex';
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    content.style.maxWidth = '500px';
    
    content.innerHTML = `
        <div class="modal-header">
            <h2>💴 円建て損益編集</h2>
            <button class="modal-close" onclick="closeYenProfitLossModal()">×</button>
        </div>
        <div style="padding: 20px;">
            <h3>${trade.pair} ${trade.direction === 'long' ? 'LONG' : 'SHORT'}</h3>
            <p style="color: #888; margin-bottom: 20px;">
                ${formatDateTimeForDisplay(trade.entryTime)} → 
                ${trade.exits.length > 0 ? formatDateTimeForDisplay(trade.exits[trade.exits.length - 1].time) : '未決済'}
            </p>
            
            <div class="input-grid" style="gap: 15px;">
                <div class="input-group">
                    <label>トレード損益（必須）</label>
                    <input type="number" id="yenTradePL" value="${yenPL.profitLoss || 0}" step="1">
                </div>
                
                <div class="input-group">
                    <label>スワップポイント</label>
                    <input type="number" id="yenSwapPoints" value="${yenPL.swap || 0}" step="1">
                </div>
                
                <div class="input-group">
                    <label>手数料</label>
                    <input type="number" id="yenCommission" value="${yenPL.commission || 0}" step="1" min="0">
                </div>
                
                <div class="input-group">
                    <label>ブローカー</label>
                    <select id="yenBroker">
                        <option value="">選択してください</option>
                        <option value="DMM FX" ${yenPL.broker === 'DMM FX' ? 'selected' : ''}>DMM FX</option>
                        <option value="GMOクリック証券" ${yenPL.broker === 'GMOクリック証券' ? 'selected' : ''}>GMOクリック証券</option>
                        <option value="みんなのFX" ${yenPL.broker === 'みんなのFX' ? 'selected' : ''}>みんなのFX</option>
                        <option value="SBI FXトレード" ${yenPL.broker === 'SBI FXトレード' ? 'selected' : ''}>SBI FXトレード</option>
                        <option value="楽天FX" ${yenPL.broker === '楽天FX' ? 'selected' : ''}>楽天FX</option>
                        <option value="ヒロセ通商" ${yenPL.broker === 'ヒロセ通商' ? 'selected' : ''}>ヒロセ通商</option>
                        <option value="その他" ${yenPL.broker === 'その他' ? 'selected' : ''}>その他</option>
                    </select>
                </div>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 8px;">
                <h4 style="margin-bottom: 10px;">計算結果</h4>
                <div id="yenCalculationResult"></div>
            </div>
            
            <div class="button-group" style="margin-top: 20px;">
                <button class="btn btn-primary" onclick="saveYenProfitLoss(${tradeId})">更新</button>
                <button class="btn btn-danger" onclick="deleteYenProfitLoss(${tradeId})">削除</button>
                <button class="btn btn-secondary" onclick="closeYenProfitLossModal()">キャンセル</button>
            </div>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // リアルタイム計算（addと同じ）
    const updateCalculation = () => {
        const tradePL = parseFloat(document.getElementById('yenTradePL').value) || 0;
        const swapPoints = parseFloat(document.getElementById('yenSwapPoints').value) || 0;
        const commission = parseFloat(document.getElementById('yenCommission').value) || 0;
        const netProfitLoss = tradePL + swapPoints - commission;
        
        document.getElementById('yenCalculationResult').innerHTML = `
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center;">
                <span>トレード損益:</span>
                <span style="text-align: right;">¥${tradePL.toLocaleString('ja-JP')}</span>
                
                <span>スワップ:</span>
                <span style="text-align: right;">${swapPoints >= 0 ? '+' : ''}¥${swapPoints.toLocaleString('ja-JP')}</span>
                
                <span>手数料:</span>
                <span style="text-align: right; color: #f87171;">-¥${commission.toLocaleString('ja-JP')}</span>
                
                <span class="net-profit-label" style="font-weight: bold; padding-top: 10px;">純損益:</span>
                <span class="net-profit-value" style="text-align: right; font-weight: bold; padding-top: 10px; color: ${netProfitLoss >= 0 ? '#4ade80' : '#f87171'};">
                    ¥${netProfitLoss.toLocaleString('ja-JP')}
                </span>
            </div>
        `;
    };
    
    // イベントリスナー設定
    ['yenTradePL', 'yenSwapPoints', 'yenCommission'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateCalculation);
    });
    
    // 初期計算
    updateCalculation();
}

// 円建て損益の保存
function saveYenProfitLoss(tradeId) {
    const trade = tradeManager.getTradeById(tradeId);
    if (!trade) return;
    
    const tradePL = parseFloat(document.getElementById('yenTradePL').value) || 0;
    const swapPoints = parseFloat(document.getElementById('yenSwapPoints').value) || 0;
    const commission = parseFloat(document.getElementById('yenCommission').value) || 0;
    const broker = document.getElementById('yenBroker').value;
    
    // 保存
    trade.yenProfitLoss = {
        profitLoss: tradePL,
        swap: swapPoints,
        commission,
        netProfit: tradePL + swapPoints + commission,
        broker,
        lastModified: new Date().toISOString()
    };
    
    displayAllTrades();
    updateQuickStats();
    
    // 詳細モーダルが開いている場合は更新
    if (document.getElementById('tradeDetailModal').style.display === 'flex') {
        showTradeDetail(trade);
    }
    
    closeYenProfitLossModal();
    showToast('円建て損益を保存しました', 'success');
}

// 円建て損益の削除
function deleteYenProfitLoss(tradeId) {
    if (!confirm('円建て損益データを削除しますか？')) return;
    
    const trade = tradeManager.getTradeById(tradeId);
    if (!trade) return;
    
    delete trade.yenProfitLoss;
    
    displayAllTrades();
    updateQuickStats();
    
    // 詳細モーダルが開いている場合は更新
    if (document.getElementById('tradeDetailModal').style.display === 'flex') {
        showTradeDetail(trade);
    }
    
    closeYenProfitLossModal();
    showToast('円建て損益データを削除しました', 'success');
}

// モーダルを閉じる
function closeYenProfitLossModal() {
    const modal = document.getElementById('yenProfitLossModal');
    if (modal) modal.remove();
}

// ============================
// 保有中ステータス確認関数
// ============================
function checkHoldingStatus(trade) {
    // 保有中フラグが明示的にtrueの場合
    if (trade.isHolding === true) {
        return true;
    }
    
    // exitがない場合も保有中とみなす
    if (!trade.exits || trade.exits.length === 0) {
        return true;
    }
    
    // 勝敗がnullまたは未定義の場合も保有中とみなす
    if (trade.isWin === null || trade.isWin === undefined) {
        return true;
    }
    
    return false;
}

// ============================
// データ修復関数
// ============================
function fixExistingTradeData() {
    let modified = false;
    tradeManager.getAllTrades().forEach(trade => {
        // exitsが存在しない場合は初期化
        if (!trade.exits) {
            trade.exits = [];
            modified = true;
        }
        // chartImagesが存在しない場合は初期化
        if (!trade.chartImages) {
            trade.chartImages = [];
            modified = true;
        }
    });
    
    if (modified) {
        console.log('✅ トレードデータを修復しました');
    }
    return modified;
}

// Window関数登録
// [削除済み - TradeEntry.jsに移行]
// window.saveTradeRecord, window.clearForm, window.checkEntryConditions
window.calculateRiskReward = calculateRiskReward;
window.updateRiskReward = updateRiskReward;
window.calculateInitialRR = calculateInitialRR;
window.openExitModal = openExitModal;
window.addExitEntry = addExitEntry;
window.saveExit = saveExit;
window.closeExitModal = closeExitModal;
window.editTrade = editTrade;
window.updateTrade = updateTrade;
window.closeTradeEditModal = closeTradeEditModal;
window.deleteTrade = deleteTrade;
window.removeExitInEdit = removeExitInEdit;
window.addExitInEdit = addExitInEdit;
window.updateQuickStats = updateQuickStats;
window.showTradeDetail = showTradeDetail;
window.closeTradeDetailModal = closeTradeDetailModal;
window.editReflection = editReflection;
window.saveReflectionEdit = saveReflectionEdit;
window.closeReflectionEditModal = closeReflectionEditModal;
window.checkHoldingStatus = checkHoldingStatus;
window.showValidationError = showValidationError;
window.clearValidationErrors = clearValidationErrors;
window.addYenProfitLoss = addYenProfitLoss;
window.editYenProfitLoss = editYenProfitLoss;
window.saveYenProfitLoss = saveYenProfitLoss;
window.deleteYenProfitLoss = deleteYenProfitLoss;
window.closeYenProfitLossModal = closeYenProfitLossModal;
window.saveExit = saveExit;

// 恒久的修正で追加された関数
window.closeEditModal = closeEditModal;
window.addNewExit = addNewExit;
window.removeExit = removeExit;
window.formatDate = formatDate;
window.editTradeBasicInfo = editTradeBasicInfo;
window.editTradeReasons = editTradeReasons;
window.editExitInfo = editExitInfo;
window.saveBasicInfo = saveBasicInfo;
window.saveReasons = saveReasons;

// 表示・フィルター関数（復活）
window.displayAllTrades = displayAllTrades;
window.displayAllTradesComplete = displayAllTradesComplete;
window.createTradeCard = createTradeCard;
window.updateFilterOptions = updateFilterOptions;
window.filterTrades = filterTrades;

// ============================
// ID統一処理（起動時に自動実行）
// ============================
(function() {
    let trades = [];
    let modified = false;
    
    trades = tradeManager.getAllTrades().map(trade => {
        // 数値IDを文字列に統一
        if (typeof trade.id === 'number') {
            trade.id = String(trade.id);
            modified = true;
        }
        
        // 必須フィールドの初期化
        if (!trade.exits) {
            trade.exits = [];
            modified = true;
        }
        if (!trade.chartImages) {
            trade.chartImages = [];
            modified = true;
        }
        
        return trade;
    });
    
    if (modified) {
        console.log('✅ トレードデータのIDを文字列に統一し、必須フィールドを初期化しました');
    }
})();

// ============================
// エントリー条件カウンター更新
// ============================
function updateConditionDisplay() {
    const result = window.checkEntryConditions();
    const element = document.getElementById('conditionStatus');
    if (element) {
        element.textContent = `チェックリスト：${result.metConditions}/3`;
        element.className = result.isValid ? 'condition-status ready' : 'condition-status not-ready';
    }
}

// ページ読み込み時にイベントリスナーを設定
document.addEventListener('DOMContentLoaded', function() {
    ['reason1', 'reason2', 'reason3'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', updateConditionDisplay);
        }
    });
    // 初回実行
    updateConditionDisplay();
});

// Window関数登録
window.updateConditionDisplay = updateConditionDisplay;

// ========== Part 2 終了 ==========

// ========== Part 3（相場ノート機能）は NoteManagerModule.js にモジュール化されました ==========

// ========================================
// Trading Complete - Part 5B: 設定管理機能
// ========================================
(function() {
    'use strict';

    // ============================
    // 1. SNS設定関連
    // ============================

    // トレード詳細フォーマット
    window.formatTradeDetails = function(trade) {
        const entryDate = new Date(trade.entryTime);
        const exitDate = trade.exits.length > 0 ? new Date(trade.exits[trade.exits.length - 1].time) : null;
        
        let details = `エントリー: ${trade.entryPrice}`;
        
        if (exitDate) {
            const duration = exitDate - entryDate;
            const hours = Math.floor(duration / (1000 * 60 * 60));
            details += `\nエグジット: ${trade.exits[0].price}\n保有時間: ${hours}時間`;
        }
        
        return details;
    };

    // 月間統計取得
    window.getMonthlyStats = function() {
        const now = new Date();
        const monthlyTrades = window.trades.filter(t => {
            const tradeDate = new Date(t.entryTime);
            return tradeDate.getMonth() === now.getMonth() && 
                   tradeDate.getFullYear() === now.getFullYear() &&
                   t.exits.length > 0;
        });
        
        let wins = 0;
        let losses = 0;
        let totalPips = 0;
        
        monthlyTrades.forEach(t => {
            const pips = window.calculateTradePips(t);
            totalPips += pips;
            if (pips > 0) wins++;
            else if (pips < 0) losses++;
        });
        
        return `${wins}勝${losses}敗 ${totalPips >= 0 ? '+' : ''}${totalPips.toFixed(1)}pips`;
    };

    // 初期R:R計算
    window.calculateInitialRR = function(trade) {
        if (!trade.stopLoss || !trade.takeProfit || !trade.entryPrice) {
            return '1:---';
        }
        
        const risk = Math.abs(trade.entryPrice - trade.stopLoss);
        const reward = Math.abs(trade.takeProfit - trade.entryPrice);
        
        if (risk === 0) {
            return '1:---';
        }
        
        return `1:${(reward / risk).toFixed(2)}`;
    };

    // ============================
    // 2. サイト設定関連
    // ============================

    // ユーザーアイコン変更
    window.changeUserIcon = function() {
        const userIconElement = document.getElementById('userIcon');
        if (!userIconElement) return;
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > 5 * 1024 * 1024) {
                if (window.showToast) {
                    window.showToast('画像サイズは5MB以下にしてください', 'error');
                }
                return;
            }
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    let iconData = e.target.result;
                    
                    if (window.ImageHandler && window.ImageHandler.compressWithPreset) {
                        iconData = await window.ImageHandler.compressWithPreset(iconData, 'icon');
                    }
                    
                    userIconElement.src = iconData;
                    
                    window.storage.setItem('userIcon', iconData);
                    if (window.showToast) {
                        window.showToast('アイコンを変更しました', 'success');
                    }
                    
                } catch (error) {
                    if (window.showToast) {
                        window.showToast('アイコンの変更に失敗しました', 'error');
                    }
                }
            };
            reader.readAsDataURL(file);
            
            input.remove();
        };
        
        input.click();
    };

    // タイトル編集
    window.editTitle = function() {
        const currentTitle = document.getElementById('headerTitle').textContent;
        const newTitle = prompt('新しいタイトルを入力してください:', currentTitle);
        
        if (newTitle && newTitle !== currentTitle) {
            document.getElementById('headerTitle').textContent = newTitle;
            document.getElementById('siteTitle').value = newTitle;
            document.title = newTitle;
            window.storage.setItem('siteTitle', newTitle);
            if (window.showToast) {
                window.showToast('タイトルを変更しました', 'success');
            }
        }
    };

    // サブタイトル編集
    window.editSubtitle = function() {
        const currentSubtitle = document.getElementById('headerSubtitle').textContent;
        const newSubtitle = prompt('新しいサブタイトルを入力してください:', currentSubtitle);
        
        if (newSubtitle && newSubtitle !== currentSubtitle) {
            document.getElementById('headerSubtitle').textContent = newSubtitle;
            document.getElementById('siteSubtitle').value = newSubtitle;
            window.storage.setItem('siteSubtitle', newSubtitle);
            if (window.showToast) {
                window.showToast('サブタイトルを変更しました', 'success');
            }
        }
    };

    // サイトタイトル更新
    window.updateSiteTitle = function() {
        const siteTitleElement = document.getElementById('siteTitle');
        const headerTitleElement = document.getElementById('headerTitle');
        
        if (siteTitleElement) {
            const newTitle = siteTitleElement.value;
            if (newTitle) {
                if (headerTitleElement) headerTitleElement.textContent = newTitle;
                document.title = newTitle;
                window.storage.setItem('siteTitle', newTitle);
            }
        }
    };

    // サイトサブタイトル更新
    window.updateSiteSubtitle = function() {
        const siteSubtitleElement = document.getElementById('siteSubtitle');
        const headerSubtitleElement = document.getElementById('headerSubtitle');
        
        if (siteSubtitleElement) {
            const newSubtitle = siteSubtitleElement.value;
            if (newSubtitle && headerSubtitleElement) {
                headerSubtitleElement.textContent = newSubtitle;
                window.storage.setItem('siteSubtitle', newSubtitle);
            }
        }
    };

    // ============================
    // 3. データ管理
    // ============================

    // データエクスポート
    window.exportAllData = function() {
        // 経費データを取得
        let expenses = [];
        const expensesRaw = window.storage.getItem('tc_expenses');
        if (expensesRaw) {
            try {
                expenses = JSON.parse(expensesRaw);
            } catch(e) {
                console.error('経費データのパースエラー:', e);
            }
        }
        
        // 入出金データを取得
        let depositWithdrawals = [];
        const dwRaw = window.storage.getItem('depositWithdrawals');
        if (dwRaw) {
            try {
                depositWithdrawals = JSON.parse(dwRaw);
            } catch(e) {
                console.error('入出金データのパースエラー:', e);
            }
        }
        
        // 月間メモを取得
        let monthlyMemos = {};
        const memosRaw = window.storage.getItem('monthlyMemos');
        if (memosRaw) {
            try {
                monthlyMemos = JSON.parse(memosRaw);
            } catch(e) {
                console.error('月間メモのパースエラー:', e);
            }
        }
        
        // お気に入りペアを取得
        let favoritePairs = [];
        const pairsRaw = window.storage.getItem('favoritePairs');
        if (pairsRaw) {
            try {
                favoritePairs = JSON.parse(pairsRaw);
            } catch(e) {
                console.error('お気に入りペアのパースエラー:', e);
            }
        }
        
        // ブローカーを取得
        let brokers = [];
        const brokersRaw = window.storage.getItem('brokers');
        if (brokersRaw) {
            try {
                brokers = JSON.parse(brokersRaw);
            } catch(e) {
                console.error('ブローカーのパースエラー:', e);
            }
        }
        
        const exportData = {
            version: 'v7.0-complete',
            exportDate: new Date().toISOString(),
            trades: window.trades,
            notes: window.notes,
            expenses: expenses,
            depositWithdrawals: depositWithdrawals,
            monthlyMemos: monthlyMemos,
            favoritePairs: favoritePairs,
            brokers: brokers,
            theme: window.storage.getItem('theme') || 'dark',
            userIcon: window.storage.getItem('userIcon') || window.defaultUserIcon,
            siteTitle: window.storage.getItem('siteTitle') || '',
            siteSubtitle: window.storage.getItem('siteSubtitle') || '',
            goals: (function() {
                // goalsDataから取得（新形式）
                const goalsDataRaw = window.storage.getItem('goalsData');
                if (goalsDataRaw) {
                    try {
                        const goalsData = JSON.parse(goalsDataRaw);
                        if (goalsData.goals && Array.isArray(goalsData.goals)) {
                            return {
                                text1: goalsData.goals[0]?.text || '',
                                text2: goalsData.goals[1]?.text || '',
                                text3: goalsData.goals[2]?.text || '',
                                deadline1: goalsData.goals[0]?.deadline || '',
                                deadline2: goalsData.goals[1]?.deadline || '',
                                deadline3: goalsData.goals[2]?.deadline || '',
                                achieved1: goalsData.goals[0]?.achieved || false,
                                achieved2: goalsData.goals[1]?.achieved || false,
                                achieved3: goalsData.goals[2]?.achieved || false
                            };
                        }
                    } catch(e) {
                        console.error('goalsDataパースエラー:', e);
                    }
                }
                // フォールバック（旧形式）
                return {
                    text1: window.storage.getItem('goalText1') || '',
                    text2: window.storage.getItem('goalText2') || '',
                    text3: window.storage.getItem('goalText3') || '',
                    deadline1: window.storage.getItem('goalDeadline1') || '',
                    deadline2: window.storage.getItem('goalDeadline2') || '',
                    deadline3: window.storage.getItem('goalDeadline3') || '',
                    achieved1: window.storage.getItem('goalAchieved1') === 'true',
                    achieved2: window.storage.getItem('goalAchieved2') === 'true',
                    achieved3: window.storage.getItem('goalAchieved3') === 'true'
                };
            })()
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `trade-records-${window.formatDateForInput ? window.formatDateForInput(new Date()) : new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        if (window.showToast) {
            window.showToast('データをエクスポートしました', 'success');
        }
    };

    // データインポート
    window.importAllData = function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importData = JSON.parse(e.target.result);
                    
                    if (!importData.trades || !Array.isArray(importData.trades)) {
                        throw new Error('Invalid data format');
                    }
                    
                    window.trades = importData.trades;
                    window.storage.setItem('trades', JSON.stringify(window.trades));
                    
                    if (importData.notes) {
                        window.notes = importData.notes;
                        window.storage.setItem('notes', JSON.stringify(window.notes));
                    }
                    
                    if (importData.goals) {
                        if (importData.goals.text1 !== undefined) {
                            window.goalsData = {
                                goals: [
                                    { 
                                        id: 1, 
                                        text: importData.goals.text1 || '', 
                                        deadline: importData.goals.deadline1 || '', 
                                        achieved: importData.goals.achieved1 || false 
                                    },
                                    { 
                                        id: 2, 
                                        text: importData.goals.text2 || '', 
                                        deadline: importData.goals.deadline2 || '', 
                                        achieved: importData.goals.achieved2 || false 
                                    },
                                    { 
                                        id: 3, 
                                        text: importData.goals.text3 || '', 
                                        deadline: importData.goals.deadline3 || '', 
                                        achieved: importData.goals.achieved3 || false 
                                    }
                                ]
                            };
                            
                            window.storage.setItem('goalText1', importData.goals.text1 || '');
                            window.storage.setItem('goalText2', importData.goals.text2 || '');
                            window.storage.setItem('goalText3', importData.goals.text3 || '');
                            
                            window.storage.setItem('goalDeadline1', importData.goals.deadline1 || '');
                            window.storage.setItem('goalDeadline2', importData.goals.deadline2 || '');
                            window.storage.setItem('goalDeadline3', importData.goals.deadline3 || '');
                            
                            window.storage.setItem('goalAchieved1', importData.goals.achieved1 ? 'true' : 'false');
                            window.storage.setItem('goalAchieved2', importData.goals.achieved2 ? 'true' : 'false');
                            window.storage.setItem('goalAchieved3', importData.goals.achieved3 ? 'true' : 'false');
                        } else if (Array.isArray(importData.goals.goals)) {
                            window.goalsData = importData.goals;
                            window.storage.setItem('goals', JSON.stringify(window.goalsData));
                        }
                    } else {
                        window.goalsData = {
                            goals: [
                                { id: 1, text: "", deadline: "", achieved: false },
                                { id: 2, text: "", deadline: "", achieved: false },
                                { id: 3, text: "", deadline: "", achieved: false }
                            ]
                        };
                    }
                    
                    if (importData.storageInfo) {
                        window.storageInfo = importData.storageInfo;
                        window.storage.setItem('storageInfo', JSON.stringify(window.storageInfo));
                    }
                    
                    if (importData.siteTitle) {
                        window.storage.setItem('siteTitle', importData.siteTitle);
                        document.getElementById('headerTitle').textContent = importData.siteTitle;
                        document.getElementById('siteTitle').value = importData.siteTitle;
                        document.title = importData.siteTitle;
                    }
                    
                    if (importData.siteSubtitle) {
                        window.storage.setItem('siteSubtitle', importData.siteSubtitle);
                        document.getElementById('headerSubtitle').textContent = importData.siteSubtitle;
                        document.getElementById('siteSubtitle').value = importData.siteSubtitle;
                    }
                    
                    if (importData.userIcon) {
                        window.storage.setItem('userIcon', importData.userIcon);
                        document.getElementById('userIcon').src = importData.userIcon;
                    }
                    
                    // 経費データのインポート
                    if (importData.expenses && Array.isArray(importData.expenses)) {
                        window.storage.setItem('tc_expenses', JSON.stringify(importData.expenses));
                        console.log('経費データをインポート:', importData.expenses.length, '件');
                    }
                    
                    // 入出金データのインポート
                    if (importData.depositWithdrawals && Array.isArray(importData.depositWithdrawals)) {
                        window.storage.setItem('depositWithdrawals', JSON.stringify(importData.depositWithdrawals));
                        console.log('入出金データをインポート:', importData.depositWithdrawals.length, '件');
                    }
                    
                    // 月間メモのインポート
                    if (importData.monthlyMemos) {
                        window.storage.setItem('monthlyMemos', JSON.stringify(importData.monthlyMemos));
                        console.log('月間メモをインポート');
                    }
                    
                    // お気に入りペアのインポート
                    if (importData.favoritePairs && Array.isArray(importData.favoritePairs)) {
                        window.storage.setItem('favoritePairs', JSON.stringify(importData.favoritePairs));
                        console.log('お気に入りペアをインポート:', importData.favoritePairs.length, '件');
                    }
                    
                    // ブローカーのインポート
                    if (importData.brokers && Array.isArray(importData.brokers)) {
                        window.storage.setItem('brokers', JSON.stringify(importData.brokers));
                        console.log('ブローカーをインポート:', importData.brokers.length, '件');
                    }
                    
                    // テーマのインポート
                    if (importData.theme) {
                        window.storage.setItem('theme', importData.theme);
                        if (typeof window.applyTheme === 'function') {
                            window.applyTheme(importData.theme);
                        }
                        console.log('テーマをインポート:', importData.theme);
                    }
                    
                    if (window.updateQuickStats) window.updateQuickStats();
                    if (window.displayAllTrades) window.displayAllTrades();
                    if (window.updateWeeklyPreview) window.updateWeeklyPreview();
                    
                    if (typeof window.updateGoalsDisplay === 'function') {
                        window.updateGoalsDisplay();
                    }
                    
                    if (window.updateStorageInfo) window.updateStorageInfo();
                    
                    setTimeout(() => {
                        const activeTab = document.querySelector('.tab-content.active');
                        if (activeTab && activeTab.id === 'settings') {
                            if (window.updateGoalsDisplay) window.updateGoalsDisplay();
                        }
                    }, 500);
                    
                    if (typeof window.initializeApp === 'function') {
                        window.initializeApp();
                    }
                    
                    if (window.showToast) {
                        window.showToast('データをインポートしました。ページをリロードします...', 'success');
                    }
                    
                    // インポート完了後にページをリロード（トースト表示のため少し遅延）
                    setTimeout(() => {
                        location.reload();
                    }, 1500);
                } catch (error) {
                    if (window.showToast) {
                        window.showToast('インポートに失敗しました。ファイルを確認してください。', 'error');
                    }
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    };

    // 全データ削除
    window.deleteAllData = function() {
        if (!confirm('⚠️ 警告: すべてのトレード記録、相場ノート、設定が完全に削除されます。\n\nこの操作は取り消すことができません。\n本当に削除しますか？')) {
            return;
        }
        
        if (!confirm('最終確認: 本当にすべてのデータを削除してよろしいですか？')) {
            return;
        }
        
        window.trades = [];
        window.notes = {};
        window.goalsData = {
            goals: [
                { id: 1, text: "", achieved: false },
                { id: 2, text: "", achieved: false },
                { id: 3, text: "", achieved: false }
            ]
        };
        window.storageInfo = {
            serverUsed: 0,
            serverLimit: 100 * 1024 * 1024,
            localImages: [],
            serverImages: [],
            externalImages: []
        };
        
        window.storage.clear();
        
        
        if (window.showToast) {
            window.showToast('すべてのデータを削除しました。ページを再読み込みします...', 'success');
        }
        setTimeout(() => {
            location.reload();
        }, 1500);
    };

    // ストレージ使用量の確認
    window.checkStorageUsage = function() {
        let totalSize = 0;
        
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length + key.length;
            }
        }
        
        const usedMB = (totalSize / 1024 / 1024).toFixed(2);
        const maxMB = 5;
        const usagePercent = (totalSize / (maxMB * 1024 * 1024) * 100).toFixed(1);
        
        if (usagePercent >= 80) {
            if (window.showToast) {
                window.showToast(`⚠️ ストレージ使用量が${usagePercent}%に達しています`, 'warning');
            }
        }
        
        return {
            usedMB: parseFloat(usedMB),
            maxMB: maxMB,
            usagePercent: parseFloat(usagePercent)
        };
    };

    // ============================
    // 4. Part 5全体の初期化処理
    // ============================
    
    document.addEventListener('DOMContentLoaded', function() {
        // タブ切り替え時の処理を拡張
        if (window.switchTab) {
            const originalSwitchTab = window.switchTab;
            window.switchTab = function(tabName, evt) {
                originalSwitchTab(tabName, evt);
                

            };
        }

        // アンロード時の警告
        window.addEventListener('beforeunload', function(e) {
            const unsavedChanges = document.querySelector('#new-entry input:not(:placeholder-shown), #new-entry textarea:not(:placeholder-shown)');
            if (unsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // 定期的な自動保存（5分ごと）
        if (window.storage && window.storage.isAvailable) {
            setInterval(() => {
                if (window.saveTrades) window.saveTrades();
                if (window.saveNotes) window.saveNotes();
                
                
            }, 300000);
        }
    });

})();

// ========== Part5B終了 ==========
// ========== Part 7: 収支管理 ==========
console.log('Part 7: 収支管理機能を初期化');

// 収支管理タブの初期化（新モジュール対応）
function initExpenseTab() {
    console.log('収支管理タブを初期化中...');
    
    // 新モジュールの存在確認
    if (!window.ExpenseManagerModule || 
        !window.ClosingManagerModule || 
        !window.CSVExporterModule || 
        !window.SummaryCalculatorModule) {
        console.error('Part 7モジュールが見つかりません');
        showToast('収支管理機能の読み込みに失敗しました', 'error');
        return;
    }
    
    console.log('✓ 全モジュール読み込み完了');
    
    // 初期表示
    displayExpenseTab();
    console.log('✓ 収支管理タブ表示完了');
}

// 収支管理タブの表示
function displayExpenseTab() {
    const expenseTab = document.getElementById('tax');
    if (!expenseTab) {
        console.error('収支管理タブ要素が見つかりません');
        return;
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    // 年間サマリーを計算
    const yearlySummary = window.SummaryCalculatorModule ? 
        window.SummaryCalculatorModule.calculateYearlySummary(currentYear) : 
        { trades: { netProfit: 0 }, expenses: { total: 0 }, taxableIncome: 0 };
    
    // HTMLを生成
    expenseTab.innerHTML = `
        <div class="section">
            <h2>💰 収支管理</h2>
            <p style="color: #888; margin-bottom: 20px;">月次締め・経費管理・申告準備</p>
            
            <!-- 免責事項 -->
            <div class="warning-box" style="background: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
                <strong>⚠️ 重要</strong><br>
                このツールは記録管理用です。確定申告には必ずFX業者の「年間取引報告書」を使用してください。
                税務相談は税理士等の専門家にご相談ください。
            </div>
            
            <!-- サマリー表示 -->
            <div class="summary-section">
                <h3>📊 ${currentYear}年 収支サマリー</h3>
                <div class="summary-grid">
                    <div class="summary-item">
                        <div class="summary-label">トレード損益</div>
                        <div class="summary-value ${yearlySummary.trades.netProfit >= 0 ? 'positive' : 'negative'}">
                            ¥${yearlySummary.trades.netProfit.toLocaleString()}
                        </div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">経費合計</div>
                        <div class="summary-value">
                            ¥${yearlySummary.expenses.total.toLocaleString()}
                        </div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">課税対象所得</div>
                        <div class="summary-value ${yearlySummary.taxableIncome >= 0 ? 'positive' : 'negative'}">
                            ¥${yearlySummary.taxableIncome.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- タブメニュー -->
            <div class="expense-tabs" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #dee2e6;">
                <button onclick="showExpenseSection('calendar')" id="expense-tab-calendar" class="expense-tab-btn" 
                    style="padding: 10px 20px; background: none; border: none; cursor: pointer; border-bottom: 3px solid #007bff; font-weight: bold;">
                    📅 月次カレンダー
                </button>
                <button onclick="showExpenseSection('input')" id="expense-tab-input" class="expense-tab-btn" 
                    style="padding: 10px 20px; background: none; border: none; cursor: pointer;">
                    📝 経費入力
                </button>
                <button onclick="showExpenseSection('list')" id="expense-tab-list" class="expense-tab-btn"
                    style="padding: 10px 20px; background: none; border: none; cursor: pointer;">
                    📋 経費一覧
                </button>
                <button onclick="showExpenseSection('closing')" id="expense-tab-closing" class="expense-tab-btn"
                    style="padding: 10px 20px; background: none; border: none; cursor: pointer;">
                    📅 締め処理
                </button>
                <button onclick="showExpenseSection('export')" id="expense-tab-export" class="expense-tab-btn"
                    style="padding: 10px 20px; background: none; border: none; cursor: pointer;">
                    📊 データ出力
                </button>
                <button onclick="showExpenseSection('capital')" id="expense-tab-capital" class="expense-tab-btn"
                    style="padding: 10px 20px; background: none; border: none; cursor: pointer;">
                    💰 入出金管理
                </button>
            </div>
            
            <!-- 月次カレンダーセクション -->
            <div id="expense-section-calendar" class="expense-section" style="display: block;">
                <h3>📅 月次カレンダー</h3>
                
                <!-- カレンダーコントロール -->
                <div class="calendar-controls">
                    <label style="font-weight: bold; color: #495057;">年:</label>
                    <select id="calendarYear" onchange="window.updateCalendar()" 
                        style="padding: 8px 12px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px; cursor: pointer;">
                        <!-- MonthlyCalendarModuleで動的生成 -->
                    </select>
                    
                    <button onclick="window.previousMonth()" 
                        style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                        ◀ 前月
                    </button>
                    
                    <span id="currentMonthLabel" style="font-size: 18px; font-weight: bold; color: #007bff; min-width: 80px; text-align: center;">
                        <!-- JavaScriptで動的生成 -->
                    </span>
                    
                    <button onclick="window.nextMonth()" 
                        style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                        次月 ▶
                    </button>
                    
                    <button onclick="window.goToCurrentMonth()" 
                        style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-left: auto;">
                        📅 今月
                    </button>
                </div>
                
                <!-- カレンダーグリッド -->
                <div id="calendarGrid" class="calendar-grid">
                    <!-- MonthlyCalendarModuleで動的生成 -->
                </div>
                
                <!-- 月間サマリー -->
                <div id="monthSummary" class="month-summary">
                    <!-- MonthlyCalendarModuleで動的生成 -->
                </div>
                
                <!-- ツールチップ -->
                <div id="dayTooltip" class="day-tooltip">
                    <!-- MonthlyCalendarModuleで動的生成 -->
                </div>
            </div>
            
            <!-- 経費入力セクション -->
            <div id="expense-section-input" class="expense-section" style="display: none;">
                <h3>📝 経費入力</h3>
                <div class="expense-form" style="background: white; padding: 15px; border-radius: 5px; border: 2px solid #dee2e6;">
                    <div style="display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 15px; margin-bottom: 12px;">
                        <input type="date" id="expenseDate" value="${new Date().toISOString().split('T')[0]}" 
                            style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                        <select id="expenseCategory" style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                            <optgroup label="通信・インフラ">
                                <option value="通信費（ネット代）">通信費（ネット代）</option>
                                <option value="VPS・クラウドサービス">VPS・クラウドサービス</option>
                                <option value="電気代（按分）">電気代（按分）</option>
                                <option value="家賃（按分）">家賃（按分）</option>
                            </optgroup>
                            <optgroup label="機器・設備">
                                <option value="PC・モニター">PC・モニター（10万円未満）</option>
                                <option value="PC周辺機器">PC周辺機器</option>
                                <option value="デスク・チェア">デスク・チェア</option>
                                <option value="事務用品">事務用品</option>
                            </optgroup>
                            <optgroup label="情報・学習">
                                <option value="書籍・教材費">書籍・教材費</option>
                                <option value="セミナー参加費">セミナー参加費</option>
                                <option value="オンラインサロン">オンラインサロン会費</option>
                                <option value="情報配信サービス">有料情報配信サービス</option>
                                <option value="新聞・雑誌">経済新聞・雑誌購読料</option>
                            </optgroup>
                            <optgroup label="ツール・ソフト">
                                <option value="取引ツール">取引ツール・ソフト</option>
                                <option value="EA・インジケーター">EA・インジケーター</option>
                                <option value="セキュリティソフト">セキュリティソフト</option>
                            </optgroup>
                            <optgroup label="手数料・その他">
                                <option value="取引手数料">取引手数料</option>
                                <option value="振込手数料">振込手数料</option>
                                <option value="税理士報酬">税理士・会計士報酬</option>
                                <option value="交通費">FX関連交通費</option>
                                <option value="会議費">会議費（情報交換）</option>
                                <option value="その他">その他</option>
                            </optgroup>
                        </select>
                        <input type="number" id="expenseAmount" placeholder="金額（円）" min="0"
                            style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                    </div>
                    <div style="display: grid; grid-template-columns: 0.8fr 2fr 2fr 1fr; gap: 15px;">
                        <select id="expenseFrequency" style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                            <option value="once">単発</option>
                            <option value="monthly">月払い</option>
                            <option value="quarterly">四半期払い</option>
                            <option value="semiannual">半年払い</option>
                            <option value="annual">年払い</option>
                        </select>
                        <input type="text" id="expenseDescription" placeholder="説明（例：2025年度VPS年間契約）"
                            style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                        <input type="text" id="expenseMemo" placeholder="メモ（任意）"
                            style="padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
                        <button onclick="addExpense()" class="btn btn-primary">経費を追加</button>
                    </div>
                    
                    <!-- 按分計算ヘルパー -->
                    <div id="allocateHelper" style="display: none; margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                        <small style="color: #6c757d;">
                            💡 按分が必要な経費は、FX専用使用割合を掛けて計算してください。
                            例：電気代月1万円 × FX使用30% = 3,000円
                        </small>
                    </div>
                </div>
                
                <!-- 使い方ガイド -->
                <div style="margin-top: 15px;">
                    <button onclick="toggleExpenseGuide()" class="btn btn-info" style="padding: 8px 20px;">
                        📖 使い方ガイド
                    </button>
                    <div id="expenseGuide" style="display: none; margin-top: 10px; padding: 15px; background: #e8f4fd; border-radius: 5px;">
                        <h4>経費入力の使い方</h4>
                        
                        <div style="margin-bottom: 10px;">
                            <strong>🔸 基本的な入力方法</strong>
                            <ol style="margin: 5px 0; padding-left: 20px;">
                                <li>日付を選択（支払日または購入日）</li>
                                <li>カテゴリを選択</li>
                                <li>金額を入力（按分済みの金額）</li>
                                <li>支払頻度を選択</li>
                                <li>説明を入力して「経費を追加」をクリック</li>
                            </ol>
                        </div>
                        
                        <div style="margin-bottom: 10px;">
                            <strong>🔸 年払い経費の処理</strong>
                            <ul style="margin: 5px 0; padding-left: 20px;">
                                <li>支払頻度で「年払い」を選択</li>
                                <li>システムが自動的に月割り計算（÷12）して各月に配分</li>
                                <li>例：年間12,000円 → 月1,000円として計上</li>
                            </ul>
                        </div>
                        
                        <div style="margin-bottom: 10px;">
                            <strong>🔸 按分が必要な経費</strong>
                            <ul style="margin: 5px 0; padding-left: 20px;">
                                <li>家賃・電気代など：FX専用スペースの割合で計算</li>
                                <li>通信費：FX使用時間の割合で計算</li>
                                <li>目安：専用部屋なら30-50%、リビング共用なら10-20%</li>
                            </ul>
                        </div>
                        
                        <div style="background: #fff3cd; padding: 10px; border-radius: 4px;">
                            <strong>⚠️ 注意事項</strong>
                            <ul style="margin: 5px 0; padding-left: 20px;">
                                <li>領収書・レシートは必ず保管</li>
                                <li>FX取引に直接関係する支出のみ計上</li>
                                <li>10万円以上のPCは減価償却が必要（税理士に相談）</li>
                                <li>按分率は合理的な根拠を用意</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                <!-- 最近の経費（簡易表示） -->
                <div id="recentExpenses" style="margin-top: 20px;"></div>
            </div>
            
            <!-- 経費一覧セクション -->
            <div id="expense-section-list" class="expense-section" style="display: none;">
                <h3>📋 経費一覧</h3>
                
                <!-- フィルターUI -->
                <div style="background: rgba(255,255,255,0.08); padding: 15px; border-radius: 10px; margin-bottom: 20px; border: 2px solid rgba(255,255,255,0.15);">
                    <div style="display: flex; align-items: center; margin-bottom: 10px;">
                        <span style="font-size: 16px; font-weight: 500; margin-right: 10px;">🔍 フィルター</span>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                        <!-- 年度選択 -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">年度</label>
                            <select id="filterYear" onchange="window.ExpenseManagerModule.updateExpenseListFull()" 
                                style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; background: white; color: #333;">
                                <option value="all">全年度</option>
                            </select>
                        </div>
                        
                        <!-- 月選択 -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">月</label>
                            <select id="filterMonth" onchange="window.ExpenseManagerModule.updateExpenseListFull()" 
                                style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; background: white; color: #333;">
                                <option value="all">全月</option>
                                <option value="1">1月</option>
                                <option value="2">2月</option>
                                <option value="3">3月</option>
                                <option value="4">4月</option>
                                <option value="5">5月</option>
                                <option value="6">6月</option>
                                <option value="7">7月</option>
                                <option value="8">8月</option>
                                <option value="9">9月</option>
                                <option value="10">10月</option>
                                <option value="11">11月</option>
                                <option value="12">12月</option>
                            </select>
                        </div>
                        
                        <!-- カテゴリ選択 -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">カテゴリ</label>
                            <select id="filterCategory" onchange="window.ExpenseManagerModule.updateExpenseListFull()" 
                                style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; background: white; color: #333;">
                                <option value="all">全カテゴリ</option>
                                <optgroup label="通信・インフラ">
                                    <option value="通信費（ネット代）">通信費（ネット代）</option>
                                    <option value="VPS・クラウドサービス">VPS・クラウドサービス</option>
                                    <option value="電気代（按分）">電気代（按分）</option>
                                    <option value="家賃（按分）">家賃（按分）</option>
                                </optgroup>
                                <optgroup label="機器・設備">
                                    <option value="PC・モニター">PC・モニター</option>
                                    <option value="PC周辺機器">PC周辺機器</option>
                                    <option value="デスク・チェア">デスク・チェア</option>
                                    <option value="事務用品">事務用品</option>
                                </optgroup>
                                <optgroup label="情報・学習">
                                    <option value="書籍・教材費">書籍・教材費</option>
                                    <option value="セミナー参加費">セミナー参加費</option>
                                    <option value="オンラインサロン">オンラインサロン</option>
                                    <option value="情報配信サービス">情報配信サービス</option>
                                    <option value="新聞・雑誌">新聞・雑誌</option>
                                </optgroup>
                                <optgroup label="ツール・ソフト">
                                    <option value="取引ツール">取引ツール</option>
                                    <option value="EA・インジケーター">EA・インジケーター</option>
                                    <option value="セキュリティソフト">セキュリティソフト</option>
                                </optgroup>
                                <optgroup label="手数料・その他">
                                    <option value="取引手数料">取引手数料</option>
                                    <option value="振込手数料">振込手数料</option>
                                    <option value="税理士報酬">税理士報酬</option>
                                    <option value="交通費">交通費</option>
                                    <option value="会議費">会議費</option>
                                    <option value="その他">その他</option>
                                </optgroup>
                            </select>
                        </div>
                        
                        <!-- 並替選択 -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #aaa;">並替</label>
                            <select id="filterSort" onchange="window.ExpenseManagerModule.updateExpenseListFull()" 
                                style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; background: white; color: #333;">
                                <option value="date-desc">日付降順（新しい順）</option>
                                <option value="date-asc">日付昇順（古い順）</option>
                                <option value="amount-desc">金額降順（高い順）</option>
                                <option value="amount-asc">金額昇順（安い順）</option>
                                <option value="category-asc">カテゴリ昇順（A-Z）</option>
                                <option value="category-desc">カテゴリ降順（Z-A）</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- フィルターリセットボタン -->
                    <div style="margin-top: 10px; text-align: right;">
                        <button onclick="resetExpenseFilters()" 
                            style="padding: 6px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
                            🔄 フィルターリセット
                        </button>
                    </div>
                </div>
                
                <!-- 経費一覧表示エリア -->
                <div id="expenseListFull"></div>
            </div>
            
            <!-- 締め処理セクション -->
            <div id="expense-section-closing" class="expense-section" style="display: none;">
                <h3 style="margin-bottom: 20px;">📅 締め処理</h3>
                <p style="margin-bottom: 20px; color: #888;">月次・四半期・年次の締め処理を実行します。締めた期間のデータは確定され、集計に使用されます。</p>
                
                <!-- 月次締め処理カード -->
                <div style="background: rgba(255,255,255,0.08); padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 2px solid rgba(255,255,255,0.15);">
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                        <span style="font-size: 24px; margin-right: 10px;">📅</span>
                        <h4 style="margin: 0; font-size: 18px;">月次締め処理</h4>
                    </div>
                    <p style="color: #888; margin-bottom: 15px; font-size: 14px;">
                        選択した月のトレード記録と経費を締めます。一度締めた月は再度締められません。
                    </p>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap;">
                        <label style="font-weight: 500; color: #aaa;">年:</label>
                        <select id="closingMonthYear" style="padding: 8px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 14px; min-width: 100px; color: inherit;">
                            <!-- JavaScriptで動的生成 -->
                        </select>
                        <label style="font-weight: 500; color: #aaa;">月:</label>
                        <select id="closingMonth" style="padding: 8px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 14px; min-width: 100px; color: inherit;">
                            <option value="1">1月</option>
                            <option value="2">2月</option>
                            <option value="3">3月</option>
                            <option value="4">4月</option>
                            <option value="5">5月</option>
                            <option value="6">6月</option>
                            <option value="7">7月</option>
                            <option value="8">8月</option>
                            <option value="9">9月</option>
                            <option value="10">10月</option>
                            <option value="11">11月</option>
                            <option value="12">12月</option>
                        </select>
                        <button onclick="performMonthlyClosingUI()" style="position: relative; padding: 10px 24px; background: rgba(255,255,255,0.08); border: 1px solid rgba(79,172,254,0.5); border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; transition: all 0.3s; color: inherit;" onmouseover="this.style.background='rgba(79,172,254,0.15)'; this.style.borderColor='rgba(79,172,254,0.8)'; this.style.boxShadow='0 0 20px rgba(79,172,254,0.4), 0 0 40px rgba(79,172,254,0.2)';" onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(79,172,254,0.5)'; this.style.boxShadow='none';">
                            📊 月次締め実行
                        </button>
                    </div>
                </div>
                
                <!-- 四半期締め処理カード -->
                <div style="background: rgba(255,255,255,0.08); padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 2px solid rgba(255,255,255,0.15);">
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                        <span style="font-size: 24px; margin-right: 10px;">📈</span>
                        <h4 style="margin: 0; font-size: 18px;">四半期締め処理</h4>
                    </div>
                    <p style="color: #888; margin-bottom: 15px; font-size: 14px;">
                        選択した四半期のトレード記録と経費を締めます。対象月がすべて締まっている必要があります。
                    </p>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap;">
                        <label style="font-weight: 500; color: #aaa;">年:</label>
                        <select id="closingQuarterYear" style="padding: 8px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 14px; min-width: 100px; color: inherit;">
                            <!-- JavaScriptで動的生成 -->
                        </select>
                        <label style="font-weight: 500; color: #aaa;">四半期:</label>
                        <select id="closingQuarter" style="padding: 8px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 14px; min-width: 100px; color: inherit;">
                            <option value="1">Q1（1-3月）</option>
                            <option value="2">Q2（4-6月）</option>
                            <option value="3">Q3（7-9月）</option>
                            <option value="4">Q4（10-12月）</option>
                        </select>
                        <button onclick="performQuarterlyClosingUI()" style="position: relative; padding: 10px 24px; background: rgba(255,255,255,0.08); border: 1px solid rgba(102,126,234,0.5); border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; transition: all 0.3s; color: inherit;" onmouseover="this.style.background='rgba(102,126,234,0.15)'; this.style.borderColor='rgba(102,126,234,0.8)'; this.style.boxShadow='0 0 20px rgba(102,126,234,0.4), 0 0 40px rgba(102,126,234,0.2)';" onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(102,126,234,0.5)'; this.style.boxShadow='none';">
                            📊 四半期締め実行
                        </button>
                    </div>
                </div>
                
                <!-- 年次締め処理カード -->
                <div style="background: rgba(255,255,255,0.08); padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 2px solid rgba(255,255,255,0.15);">
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                        <span style="font-size: 24px; margin-right: 10px;">💰</span>
                        <h4 style="margin: 0; font-size: 18px;">年次締め処理</h4>
                    </div>
                    <p style="color: #888; margin-bottom: 15px; font-size: 14px;">
                        選択した年のトレード記録と経費を締めます。全12ヶ月が締まっている必要があります。
                    </p>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap;">
                        <label style="font-weight: 500; color: #aaa;">年:</label>
                        <select id="closingYear" style="padding: 8px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 14px; min-width: 100px; color: inherit;">
                            <!-- JavaScriptで動的生成 -->
                        </select>
                        <button onclick="performYearlyClosingUI()" style="position: relative; padding: 10px 24px; background: rgba(255,255,255,0.08); border: 1px solid rgba(17,153,142,0.5); border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; transition: all 0.3s; color: inherit;" onmouseover="this.style.background='rgba(17,153,142,0.15)'; this.style.borderColor='rgba(17,153,142,0.8)'; this.style.boxShadow='0 0 20px rgba(17,153,142,0.4), 0 0 40px rgba(17,153,142,0.2)';" onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(17,153,142,0.5)'; this.style.boxShadow='none';">
                            📊 年次締め実行
                        </button>
                    </div>
                </div>
                
                <!-- 締め済み期間一覧 -->
                <div style="background: rgba(255,255,255,0.08); padding: 20px; border-radius: 10px; border: 2px solid rgba(255,255,255,0.15);">
                    <h4 style="margin-bottom: 15px;">📋 締め済み期間一覧</h4>
                    <div id="closingHistoryList" style="max-height: 400px; overflow-y: auto;">
                        <!-- JavaScriptで動的生成 -->
                        <p style="color: #888; text-align: center; padding: 20px;">締め処理を実行すると、ここに履歴が表示されます。</p>
                    </div>
                </div>
            </div>
            
            <!-- データ出力セクション -->
            <div id="expense-section-export" class="expense-section" style="display: none;">
                <h3 style="margin-bottom: 20px;">📊 データ出力</h3>
                <p style="margin-bottom: 20px; color: #888;">確定申告用のデータをCSV形式で出力します。</p>
                
                <!-- 月別CSV出力カード -->
                <div style="background: rgba(255,255,255,0.08); padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 2px solid rgba(255,255,255,0.15);">
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                        <span style="font-size: 24px; margin-right: 10px;">📅</span>
                        <h4 style="margin: 0; font-size: 18px;">月別CSV出力</h4>
                    </div>
                    <p style="color: #888; margin-bottom: 15px; font-size: 14px;">
                        選択した月のトレード記録と経費をまとめて出力します
                    </p>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <label style="font-weight: 500; color: #aaa;">年:</label>
                        <select id="csvExportYear" style="padding: 8px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 14px; min-width: 100px; color: inherit;">
                            <!-- JavaScriptで動的生成 -->
                        </select>
                        <label style="font-weight: 500; color: #aaa;">月:</label>
                        <select id="csvExportMonth" style="padding: 8px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 14px; min-width: 100px; color: inherit;">
                            <option value="1">1月</option>
                            <option value="2">2月</option>
                            <option value="3">3月</option>
                            <option value="4">4月</option>
                            <option value="5">5月</option>
                            <option value="6">6月</option>
                            <option value="7">7月</option>
                            <option value="8">8月</option>
                            <option value="9">9月</option>
                            <option value="10">10月</option>
                            <option value="11">11月</option>
                            <option value="12">12月</option>
                        </select>
                        <button onclick="exportMonthlyCSV()" style="position: relative; padding: 10px 24px; background: rgba(255,255,255,0.08); border: 1px solid rgba(102,126,234,0.5); border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; transition: all 0.3s; color: inherit;" onmouseover="this.style.background='rgba(102,126,234,0.15)'; this.style.borderColor='rgba(102,126,234,0.8)'; this.style.boxShadow='0 0 20px rgba(102,126,234,0.4), 0 0 40px rgba(102,126,234,0.2)';" onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(102,126,234,0.5)'; this.style.boxShadow='none';">
                            📊 月別CSV出力
                        </button>
                    </div>
                </div>
                
                <!-- 年次CSV出力カード -->
                <div style="background: rgba(255,255,255,0.08); padding: 20px; border-radius: 10px; border: 2px solid rgba(255,255,255,0.15);">
                    <div style="display: flex; align-items: center; margin-bottom: 15px;">
                        <span style="font-size: 24px; margin-right: 10px;">📈</span>
                        <h4 style="margin: 0; font-size: 18px;">年次CSV出力</h4>
                    </div>
                    <p style="color: #888; margin-bottom: 15px; font-size: 14px;">
                        年間のトレード記録、経費、収支サマリーを出力します
                    </p>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 15px;">
                        <label style="font-weight: 500; color: #aaa;">対象年:</label>
                        <select id="csvExportYearAnnual" style="padding: 8px 12px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 14px; min-width: 100px; color: inherit;">
                            <!-- JavaScriptで動的生成 -->
                        </select>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="exportTrades()" style="position: relative; padding: 10px 20px; background: rgba(255,255,255,0.08); border: 1px solid rgba(17,153,142,0.5); border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; transition: all 0.3s; flex: 1; min-width: 150px; color: inherit;" onmouseover="this.style.background='rgba(17,153,142,0.15)'; this.style.borderColor='rgba(17,153,142,0.8)'; this.style.boxShadow='0 0 20px rgba(17,153,142,0.4), 0 0 40px rgba(17,153,142,0.2)';" onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(17,153,142,0.5)'; this.style.boxShadow='none';">
                            📋 トレード記録CSV
                        </button>
                        <button onclick="exportExpenses()" style="position: relative; padding: 10px 20px; background: rgba(255,255,255,0.08); border: 1px solid rgba(17,153,142,0.5); border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; transition: all 0.3s; flex: 1; min-width: 150px; color: inherit;" onmouseover="this.style.background='rgba(17,153,142,0.15)'; this.style.borderColor='rgba(17,153,142,0.8)'; this.style.boxShadow='0 0 20px rgba(17,153,142,0.4), 0 0 40px rgba(17,153,142,0.2)';" onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(17,153,142,0.5)'; this.style.boxShadow='none';">
                            💰 経費一覧CSV
                        </button>
                        <button onclick="exportYearlySummary()" style="position: relative; padding: 10px 20px; background: rgba(255,255,255,0.08); border: 1px solid rgba(17,153,142,0.5); border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; transition: all 0.3s; flex: 1; min-width: 150px; color: inherit;" onmouseover="this.style.background='rgba(17,153,142,0.15)'; this.style.borderColor='rgba(17,153,142,0.8)'; this.style.boxShadow='0 0 20px rgba(17,153,142,0.4), 0 0 40px rgba(17,153,142,0.2)';" onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(17,153,142,0.5)'; this.style.boxShadow='none';">
                            📊 年間収支サマリーCSV
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- 💰 入出金管理セクション -->
            <div id="expense-section-capital" class="expense-section" style="display: none;">
                <div style="
                    background: transparent;
                    color: inherit;
                    padding: 0;
                    border-radius: 0;
                    margin: 20px 0 0 0;
                    box-shadow: none;">
                
                <!-- タイトル -->
                <h3 style="margin: 0 0 20px 0; font-size: 1.2em; color: #e0e0e0;">
                    💰 入出金管理
                </h3>
                
                <!-- 現在の投入資金表示 -->
                <div class="current-balance-display" style="
                    background: rgba(255,255,255,0.05);
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border: 2px solid rgba(255,255,255,0.3);">
                    
                    <div style="text-align: center;">
                        <div style="font-size: 0.9em; opacity: 0.9;">現在の投入資金</div>
                        <div id="currentCapitalDisplay" style="font-size: 2em; font-weight: bold; margin-top: 5px;">
                            ¥0
                        </div>
                    </div>
                </div>
                
                <!-- 新規入出金追加フォーム -->
                <div class="add-capital-record" style="
                    background: rgba(255,255,255,0.05);
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border: 2px solid rgba(255,255,255,0.3);">
                    
                    <h4 style="margin: 0 0 15px 0;">新規 入出金</h4>
                    
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px;">
                        
                        <!-- 種別 -->
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-size: 0.9em;">種別</label>
                            <div style="display: flex; gap: 10px;">
                                <label style="cursor: pointer;">
                                    <input type="radio" id="capitalRecordType" name="capitalType" value="deposit" checked>
                                    <span style="margin-left: 5px;">入金</span>
                                </label>
                                <label style="cursor: pointer;">
                                    <input type="radio" name="capitalType" value="withdrawal">
                                    <span style="margin-left: 5px;">出金</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- 日付 -->
                        <div>
                            <label for="capitalRecordDate" style="display: block; margin-bottom: 5px; font-size: 0.9em;">日付</label>
                            <input type="date" id="capitalRecordDate" style="
                                width: 100%;
                                padding: 8px;
                                border: none;
                                border-radius: 5px;
                                font-size: 1em;">
                        </div>
                        
                        <!-- 金額 -->
                        <div>
                            <label for="capitalRecordAmount" style="display: block; margin-bottom: 5px; font-size: 0.9em;">金額（円）</label>
                            <input type="number" id="capitalRecordAmount" min="1" step="1" placeholder="1000000" style="
                                width: 100%;
                                padding: 8px;
                                border: none;
                                border-radius: 5px;
                                font-size: 1em;">
                        </div>
                        
                        <!-- メモ -->
                        <div>
                            <label for="capitalRecordNote" style="display: block; margin-bottom: 5px; font-size: 0.9em;">メモ（任意）</label>
                            <input type="text" id="capitalRecordNote" placeholder="初期資金、追加入金、利益出金など" style="
                                width: 100%;
                                padding: 8px;
                                border: none;
                                border-radius: 5px;
                                font-size: 1em;">
                        </div>
                    </div>
                    
                    <!-- 追加ボタン -->
                    <button id="btnAddCapitalRecord" style="
                        width: 100%;
                        padding: 12px;
                        background: #4ade80;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        font-size: 1em;
                        font-weight: bold;
                        cursor: pointer;
                        transition: all 0.3s;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);"
                        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.3)'"
                        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.2)'">
                        ➕ 入出金を追加
                    </button>
                </div>
                
                <!-- 入出金履歴一覧 -->
                <div class="capital-records-list" style="
                    background: rgba(255,255,255,0.05);
                    padding: 20px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.3);">
                    
                    <h4 style="margin: 0 0 15px 0;">入出金履歴</h4>
                    
                    <!-- 並び替えボタン -->
                    <div style="margin-bottom: 10px;">
                        <button onclick="toggleCapitalSort()" id="capitalSortButton" style="
                            padding: 6px 12px;
                            background: rgba(255,255,255,0.08);
                            color: #e0e0e0;
                            border: 1px solid rgba(255,255,255,0.2);
                            border-radius: 5px;
                            font-size: 0.9em;
                            cursor: pointer;">
                            📅 新しい順
                        </button>
                    </div>
                    
                    <!-- 履歴テーブル -->
                    <div style="
                        max-height: 400px;
                        overflow-y: auto;
                        background: rgba(0,0,0,0.2);
                        border-radius: 8px;
                        padding: 10px;">
                        <table id="capitalHistoryTable" style="
                            width: 100%;
                            border-collapse: collapse;">
                            <thead>
                                <tr style="background: rgba(255,255,255,0.08);">
                                    <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.2); text-align: left;">種別</th>
                                    <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.2); text-align: left;">日付</th>
                                    <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.2); text-align: right;">金額</th>
                                    <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.2); text-align: right;">残高</th>
                                    <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.2); text-align: center;">操作</th>
                                </tr>
                            </thead>
                            <tbody id="capitalHistoryBody">
                                <tr>
                                    <td colspan="5" style="text-align: center; padding: 20px; opacity: 0.7;">入出金履歴がありません</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                </div>
            </div>
        </div>
    `;
    
    // 初期データ表示
    updateRecentExpenses();
    
    // 年度フィルター初期化
    setTimeout(() => {
        if (typeof initExpenseYearFilter === 'function') {
            initExpenseYearFilter();
        }
    }, 100);
    
    // 投入資金表示を更新
    setTimeout(() => {
        if (typeof updateCapitalDisplay === 'function') {
            updateCapitalDisplay();
        }
    }, 100);
    
    // 年セレクトボックスを初期化
    setTimeout(() => {
        const yearSelect = document.getElementById('csvExportYear');
        const yearSelectAnnual = document.getElementById('csvExportYearAnnual');
        const monthSelect = document.getElementById('csvExportMonth');
        
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        
        // 月別CSV出力の年選択
        if (yearSelect) {
            yearSelect.innerHTML = '';
            for (let year = currentYear; year >= currentYear - 5; year--) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year + '年';
                if (year === currentYear) option.selected = true;
                yearSelect.appendChild(option);
            }
        }
        
        // 年次CSV出力の年選択
        if (yearSelectAnnual) {
            yearSelectAnnual.innerHTML = '';
            for (let year = currentYear; year >= currentYear - 5; year--) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year + '年';
                if (year === currentYear) option.selected = true;
                yearSelectAnnual.appendChild(option);
            }
        }
        
        // 月選択
        if (monthSelect) {
            monthSelect.value = currentMonth;
        }
    }, 100);
    
    // 締め処理の年セレクトボックスを初期化
    setTimeout(() => {
        const closingMonthYear = document.getElementById('closingMonthYear');
        const closingQuarterYear = document.getElementById('closingQuarterYear');
        const closingYear = document.getElementById('closingYear');
        const closingMonth = document.getElementById('closingMonth');
        
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        
        // 月次締め: 年選択（2020年〜現在年）
        if (closingMonthYear) {
            closingMonthYear.innerHTML = '';
            for (let year = 2020; year <= currentYear; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year + '年';
                if (year === currentYear) option.selected = true;
                closingMonthYear.appendChild(option);
            }
        }
        
        // 月次締め: 月選択（当月を初期選択）
        if (closingMonth) {
            closingMonth.value = currentMonth;
        }
        
        // 四半期締め: 年選択（2020年〜現在年）
        if (closingQuarterYear) {
            closingQuarterYear.innerHTML = '';
            for (let year = 2020; year <= currentYear; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year + '年';
                if (year === currentYear) option.selected = true;
                closingQuarterYear.appendChild(option);
            }
        }
        
        // 年次締め: 年選択（2020年〜現在年）
        if (closingYear) {
            closingYear.innerHTML = '';
            for (let year = 2020; year <= currentYear; year++) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year + '年';
                if (year === currentYear) option.selected = true;
                closingYear.appendChild(option);
            }
        }
        
        console.log('✓ 締め処理の年月選択ボックス初期化完了');
    }, 100);
    
    // EventBusリスナー登録（重複登録を防ぐ）
    if (window.eventBus && !window._expenseSummaryListenerRegistered) {
        window.eventBus.on('expense:added', () => {
            console.log('📊 経費追加検知 → サマリー更新');
            updateExpenseSummary();
        });
        
        window.eventBus.on('expense:deleted', () => {
            console.log('📊 経費削除検知 → サマリー更新');
            updateExpenseSummary();
        });
        
        // 重複登録防止フラグ
        window._expenseSummaryListenerRegistered = true;
        console.log('✓ EventBusリスナー登録完了（経費サマリー自動更新）');
    }
    
    // 月次カレンダーの初期化（初回表示時）
    if (window.MonthlyCalendarModule && typeof window.MonthlyCalendarModule.initialize === 'function') {
        // まだ初期化されていない場合のみ初期化
        if (!window.MonthlyCalendarModule._initialized) {
            console.log('月次カレンダー: 初回初期化');
            window.MonthlyCalendarModule.initialize();
            window.MonthlyCalendarModule._initialized = true;
        }
    }
    
    // デフォルトで月次カレンダータブを表示
    showExpenseSection('calendar');
}

// 収支サマリーのみを更新する軽量関数
function updateExpenseSummary() {
    const summarySection = document.querySelector('.summary-section');
    if (!summarySection) return;
    
    const currentYear = new Date().getFullYear();
    const yearlySummary = window.SummaryCalculatorModule ? 
        window.SummaryCalculatorModule.calculateYearlySummary(currentYear) : 
        { trades: { netProfit: 0 }, expenses: { total: 0 }, taxableIncome: 0 };
    
    // サマリー項目を更新
    const summaryItems = summarySection.querySelectorAll('.summary-item');
    if (summaryItems.length >= 3) {
        // トレード損益
        const tradeValue = summaryItems[0].querySelector('.summary-value');
        if (tradeValue) {
            tradeValue.className = `summary-value ${yearlySummary.trades.netProfit >= 0 ? 'positive' : 'negative'}`;
            tradeValue.textContent = `¥${yearlySummary.trades.netProfit.toLocaleString()}`;
        }
        
        // 経費合計
        const expenseValue = summaryItems[1].querySelector('.summary-value');
        if (expenseValue) {
            expenseValue.textContent = `¥${yearlySummary.expenses.total.toLocaleString()}`;
        }
        
        // 課税対象所得
        const taxValue = summaryItems[2].querySelector('.summary-value');
        if (taxValue) {
            taxValue.className = `summary-value ${yearlySummary.taxableIncome >= 0 ? 'positive' : 'negative'}`;
            taxValue.textContent = `¥${yearlySummary.taxableIncome.toLocaleString()}`;
        }
    }
    
    console.log('✅ サマリー更新完了:', {
        トレード損益: yearlySummary.trades.netProfit,
        経費合計: yearlySummary.expenses.total,
        課税対象所得: yearlySummary.taxableIncome
    });
}

// セクション切り替え
function showExpenseSection(section) {
    // 全セクションを非表示
    document.querySelectorAll('.expense-section').forEach(el => {
        el.style.display = 'none';
    });
    
    // 全タブボタンのスタイルをリセット
    document.querySelectorAll('.expense-tab-btn').forEach(btn => {
        btn.style.borderBottom = 'none';
        btn.style.fontWeight = 'normal';
    });
    
    // 選択されたセクションを表示
    const targetSection = document.getElementById(`expense-section-${section}`);
    if (targetSection) {
        targetSection.style.display = 'block';
    }
    
    // 選択されたタブボタンをアクティブに
    const targetBtn = document.getElementById(`expense-tab-${section}`);
    if (targetBtn) {
        targetBtn.style.borderBottom = '3px solid #007bff';
        targetBtn.style.fontWeight = 'bold';
    }
    
    // セクション別の追加処理
    switch(section) {
        case 'calendar':
            // 月次カレンダータブの初期化
            console.log('月次カレンダータブ: 初期化開始');
            
            if (window.MonthlyCalendarModule) {
                // カレンダーモジュールを初期化
                window.MonthlyCalendarModule.initialize();
                
                // 現在の年月をラベルに表示
                const status = window.MonthlyCalendarModule.getStatus();
                const monthLabel = document.getElementById('currentMonthLabel');
                if (monthLabel && status) {
                    monthLabel.textContent = `${status.currentMonth}月`;
                }
                
                console.log('月次カレンダータブ: 初期化完了 ✅');
            } else {
                console.error('MonthlyCalendarModule が見つかりません ❌');
            }
            break;
            
        case 'list':
            // 経費一覧タブの初期化処理（フィルターのデフォルト値設定）
            if (window.ExpenseManagerModule) {
                window.ExpenseManagerModule.initExpenseListTab();
            }
            updateExpenseListFull();
            break;
        case 'closing':
            updateClosingHistoryList();
            break;
        case 'capital':
            // 入出金管理タブが開かれたら初期化（DOM生成後に実行）
            setTimeout(() => {
                if (typeof initCapitalUI === 'function') {
                    initCapitalUI();
                }
            }, 200);
            break;
    }
}

// 締め履歴を更新
function updateClosingHistory() {
    const container = document.getElementById('closingHistory');
    if (!container || !window.closingManager) return;
    
    const closedPeriods = window.closingManager.closedPeriods;
    
    if (closedPeriods.length === 0) {
        container.innerHTML = '<p style="color: #6c757d; margin-top: 20px;">締め処理の履歴はありません</p>';
        return;
    }
    
    container.innerHTML = `
        <h4 style="margin-top: 20px;">締め処理履歴</h4>
        <div style="background: white; border: 1px solid #dee2e6; border-radius: 5px;">
            ${closedPeriods.reverse().map(period => `
                <div style="padding: 10px; border-bottom: 1px solid #f8f9fa;">
                    <div style="display: flex; justify-content: space-between;">
                        <strong>${period.period} (${period.type === 'monthly' ? '月次' : period.type === 'quarterly' ? '四半期' : '年次'})</strong>
                        <span style="color: #6c757d;">${new Date(period.closedAt).toLocaleDateString()}</span>
                    </div>
                    ${period.summary ? `
                        <div style="margin-top: 5px; font-size: 0.9em;">
                            収益: ¥${(period.summary.totalProfit || 0).toLocaleString()} | 
                            経費: ¥${(period.summary.totalExpenses || 0).toLocaleString()} | 
                            純利益: ¥${(period.summary.netIncome || 0).toLocaleString()}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * 締め済み期間一覧を更新（新UI用）
 */
function updateClosingHistoryList() {
    const container = document.getElementById('closingHistoryList');
    if (!container) return;
    
    if (!window.ClosingManagerModule) {
        container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">締め処理機能が利用できません</p>';
        return;
    }
    
    const closedPeriods = window.ClosingManagerModule.getClosedPeriods();
    
    if (!closedPeriods || closedPeriods.length === 0) {
        container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">締め処理を実行すると、ここに履歴が表示されます。</p>';
        return;
    }
    
    container.innerHTML = closedPeriods.reverse().map(period => `
        <div style="padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong style="font-size: 16px;">${period.period}</strong>
                <span style="color: #888; font-size: 14px;">${new Date(period.closedAt).toLocaleDateString('ja-JP')}</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span style="padding: 4px 8px; background: rgba(79,172,254,0.2); border: 1px solid rgba(79,172,254,0.5); border-radius: 4px; font-size: 12px; color: #4facfe;">
                    ${period.type === 'monthly' ? '月次' : period.type === 'quarterly' ? '四半期' : '年次'}
                </span>
                ${period.summary ? `
                    <span style="font-size: 13px; color: #aaa;">
                        収益: ¥${(period.summary.totalProfit || 0).toLocaleString()} | 
                        経費: ¥${(period.summary.totalExpenses || 0).toLocaleString()}
                    </span>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// 月次締め処理
function performMonthlyClosing() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    if (confirm(`${currentYear}年${currentMonth}月の締め処理を実行しますか？\n締めた後はデータの変更ができません。`)) {
        if (window.closingManager) {
            const result = window.closingManager.performMonthlyClosing(currentYear, currentMonth);
            
            if (result.success) {
                showToast(result.message, 'success');
                updateClosingHistory();
            } else {
                alert(result.message);
            }
        }
    }
}

/**
 * 月次締め処理（UI用）
 */
function performMonthlyClosingUI() {
    const yearSelect = document.getElementById('closingMonthYear');
    const monthSelect = document.getElementById('closingMonth');
    
    if (!yearSelect || !monthSelect) {
        showToast('年月の選択に失敗しました', 'error');
        return;
    }
    
    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);
    
    if (confirm(`${year}年${month}月の締め処理を実行しますか？\n締めた後はデータの変更ができません。`)) {
        if (window.ClosingManagerModule) {
            const result = window.ClosingManagerModule.performMonthlyClosing(year, month);
            
            if (result.success) {
                showToast(result.message, 'success');
                updateClosingHistoryList();
            } else {
                showToast(result.message, 'error');
            }
        } else {
            console.error('ClosingManagerModuleが見つかりません');
            showToast('締め処理機能が利用できません', 'error');
        }
    }
}

// 四半期締め処理
function performQuarterlyClosing() {
    const currentMonth = new Date().getMonth() + 1;
    const currentQuarter = Math.ceil(currentMonth / 3);
    const currentYear = new Date().getFullYear();
    
    if (confirm(`${currentYear}年第${currentQuarter}四半期の締め処理を実行しますか？`)) {
        if (window.closingManager) {
            const result = window.closingManager.performQuarterlyClosing(currentYear, currentQuarter);
            
            if (result.success) {
                showToast(result.message, 'success');
                updateClosingHistory();
            } else {
                alert(result.message);
            }
        }
    }
}

/**
 * 四半期締め処理（UI用）
 */
function performQuarterlyClosingUI() {
    const yearSelect = document.getElementById('closingQuarterYear');
    const quarterSelect = document.getElementById('closingQuarter');
    
    if (!yearSelect || !quarterSelect) {
        showToast('年四半期の選択に失敗しました', 'error');
        return;
    }
    
    const year = parseInt(yearSelect.value);
    const quarter = parseInt(quarterSelect.value);
    
    if (confirm(`${year}年第${quarter}四半期の締め処理を実行しますか？\n対象月がすべて締まっている必要があります。`)) {
        if (window.ClosingManagerModule) {
            const result = window.ClosingManagerModule.performQuarterlyClosing(year, quarter);
            
            if (result.success) {
                showToast(result.message, 'success');
                updateClosingHistoryList();
            } else {
                showToast(result.message, 'error');
            }
        } else {
            console.error('ClosingManagerModuleが見つかりません');
            showToast('締め処理機能が利用できません', 'error');
        }
    }
}

// 年次締め処理
function performYearlyClosing() {
    const currentYear = new Date().getFullYear();
    
    if (confirm(`${currentYear}年の年次締め処理を実行しますか？\nこれは確定申告の準備となります。`)) {
        if (window.closingManager) {
            const result = window.closingManager.performYearlyClosing(currentYear);
            
            if (result.success) {
                showToast(result.message, 'success');
                updateClosingHistory();
            } else {
                alert(result.message);
            }
        }
    }
}

/**
 * 年次締め処理（UI用）
 */
function performYearlyClosingUI() {
    const yearSelect = document.getElementById('closingYear');
    
    if (!yearSelect) {
        showToast('年の選択に失敗しました', 'error');
        return;
    }
    
    const year = parseInt(yearSelect.value);
    
    if (confirm(`${year}年の年次締め処理を実行しますか？\n全12ヶ月が締まっている必要があります。\nこれは確定申告の準備となります。`)) {
        if (window.ClosingManagerModule) {
            const result = window.ClosingManagerModule.performYearlyClosing(year);
            
            if (result.success) {
                showToast(result.message, 'success');
                updateClosingHistoryList();
            } else {
                showToast(result.message, 'error');
            }
        } else {
            console.error('ClosingManagerModuleが見つかりません');
            showToast('締め処理機能が利用できません', 'error');
        }
    }
}

// CSV出力関数
function exportTrades() {
    const yearSelect = document.getElementById('csvExportYearAnnual');
    const year = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();
    
    if (window.CSVExporterModule) {
        const result = window.CSVExporterModule.exportTrades(year);
        if (result && result.success) {
            showToast(`${year}年のトレード記録をCSV出力しました（${result.rowCount}件）`, 'success');
        } else {
            showToast('CSV出力に失敗しました', 'error');
        }
    } else {
        console.error('CSVExporterModuleが見つかりません');
        showToast('CSV出力機能が利用できません', 'error');
    }
}

function exportExpenses() {
    const yearSelect = document.getElementById('csvExportYearAnnual');
    const year = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();
    
    if (window.CSVExporterModule) {
        const result = window.CSVExporterModule.exportExpenses(year);
        if (result && result.success) {
            showToast(`${year}年の経費一覧をCSV出力しました（${result.rowCount}件）`, 'success');
        } else {
            showToast('CSV出力に失敗しました', 'error');
        }
    } else {
        console.error('CSVExporterModuleが見つかりません');
        showToast('CSV出力機能が利用できません', 'error');
    }
}

function exportYearlySummary() {
    const yearSelect = document.getElementById('csvExportYearAnnual');
    const year = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();
    
    if (window.CSVExporterModule) {
        const result = window.CSVExporterModule.exportYearlySummary(year);
        if (result && result.success) {
            showToast(`${year}年の年間収支サマリーをCSV出力しました`, 'success');
        } else {
            showToast('CSV出力に失敗しました', 'error');
        }
    } else {
        console.error('CSVExporterModuleが見つかりません');
        showToast('CSV出力機能が利用できません', 'error');
    }
}

/**
 * 月別CSV出力（トレード＋経費の月次レポート）
 */
function exportMonthlyCSV() {
    const yearSelect = document.getElementById('csvExportYear');
    const monthSelect = document.getElementById('csvExportMonth');
    
    if (!yearSelect || !monthSelect) {
        console.error('年月選択要素が見つかりません');
        showToast('CSV出力機能が利用できません', 'error');
        return;
    }
    
    const year = parseInt(yearSelect.value);
    const month = parseInt(monthSelect.value);
    
    if (!year || !month) {
        showToast('年月を選択してください', 'error');
        return;
    }
    
    if (window.CSVExporterModule) {
        const result = window.CSVExporterModule.exportMonthly(year, month);
        if (result && result.success) {
            showToast(`${year}年${month}月の月別レポートをCSV出力しました`, 'success');
        } else {
            showToast('CSV出力に失敗しました', 'error');
        }
    } else {
        console.error('CSVExporterModuleが見つかりません');
        showToast('CSV出力機能が利用できません', 'error');
    }
}

// 使い方ガイドの表示切り替え
function toggleExpenseGuide() {
    const guide = document.getElementById('expenseGuide');
    if (guide) {
        guide.style.display = guide.style.display === 'none' ? 'block' : 'none';
    }
}

// ========== Part 7: 収支管理タブの拡張 ==========
// switchTab関数を拡張して収支管理タブの処理を追加（即座に実行）
if (typeof window.switchTab !== 'undefined') {
    const originalSwitchTab = window.switchTab;
    window.switchTab = function(tabName, evt) {
        // 元の処理を実行
        originalSwitchTab(tabName, evt);
        
        // 収支管理タブ専用の処理
        if (tabName === 'tax') {
            console.log('✓ 収支管理タブが選択されました');
            
            // 初期化処理（初回のみ）
            if (typeof initExpenseTab === 'function' && !window.expenseTabInitialized) {
                console.log('→ initExpenseTab実行中...');
                initExpenseTab();
                window.expenseTabInitialized = true;
                console.log('✓ 初期化完了');
            }
            
            // 表示処理（毎回実行）
            if (typeof displayExpenseTab === 'function') {
                console.log('→ displayExpenseTab実行中...');
                displayExpenseTab();
                console.log('✓ 表示完了');
            } else {
                console.error('❌ displayExpenseTab関数が見つかりません');
            }
        }
    };
    console.log('✓ switchTab関数に収支管理タブの処理を追加しました');
}

// カテゴリ選択時の按分ヘルパー表示（DOM読み込み後）
document.addEventListener('DOMContentLoaded', function() {
    // 保存されたアクティブタブがあれば復元
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab) {
        switchTab(savedTab);
        localStorage.removeItem('activeTab');
    }
    
    // カテゴリ選択時のイベント
    const categorySelect = document.getElementById('expenseCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', function() {
            const allocateHelper = document.getElementById('allocateHelper');
            if (allocateHelper) {
                const needsAllocation = ['電気代（按分）', '家賃（按分）', '通信費（ネット代）'].includes(this.value);
                allocateHelper.style.display = needsAllocation ? 'block' : 'none';
            }
        });
    }
});

// ========== フィルターUI用の補助関数 ==========

/**
 * 年度フィルターの初期化
 */
function initExpenseYearFilter() {
    const filterYear = document.getElementById('filterYear');
    if (!filterYear) return;
    
    // 既存のオプションをクリア（"全年度"以外）
    while (filterYear.options.length > 1) {
        filterYear.remove(1);
    }
    
    const currentYear = new Date().getFullYear();
    
    // 2020年から現在年までの年度を追加
    for (let year = currentYear; year >= 2020; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}年`;
        filterYear.appendChild(option);
    }
    
    console.log('Year filter initialized:', 2020, '-', currentYear);
}

/**
 * フィルターリセット
 */
function resetExpenseFilters() {
    const filterYear = document.getElementById('filterYear');
    const filterMonth = document.getElementById('filterMonth');
    const filterCategory = document.getElementById('filterCategory');
    const filterSort = document.getElementById('filterSort');
    
    if (filterYear) filterYear.value = 'all';
    if (filterMonth) filterMonth.value = 'all';
    if (filterCategory) filterCategory.value = 'all';
    if (filterSort) filterSort.value = 'date-desc';
    
    // 表示更新
    window.ExpenseManagerModule.updateExpenseListFull();
    
    console.log('Expense filters reset');
}

// グローバル関数として登録
window.initExpenseYearFilter = initExpenseYearFilter;
window.resetExpenseFilters = resetExpenseFilters;

// ========== 月次カレンダー用グローバル互換関数 ==========

/**
 * カレンダー更新（HTML側から呼び出し可能）
 * @global
 */
window.updateCalendar = function() {
    if (window.MonthlyCalendarModule) {
        window.MonthlyCalendarModule.updateCalendar();
        
        // 現在の年月をラベルに表示
        const status = window.MonthlyCalendarModule.getStatus();
        const monthLabel = document.getElementById('currentMonthLabel');
        if (monthLabel && status) {
            monthLabel.textContent = `${status.currentMonth}月`;
        }
    } else {
        console.error('MonthlyCalendarModule が見つかりません');
    }
};

/**
 * 前月へ移動（HTML側から呼び出し可能）
 * @global
 */
window.previousMonth = function() {
    if (window.MonthlyCalendarModule) {
        window.MonthlyCalendarModule.previousMonth();
        
        // 現在の年月をラベルに表示
        const status = window.MonthlyCalendarModule.getStatus();
        const monthLabel = document.getElementById('currentMonthLabel');
        if (monthLabel && status) {
            monthLabel.textContent = `${status.currentMonth}月`;
        }
    } else {
        console.error('MonthlyCalendarModule が見つかりません');
    }
};

/**
 * 次月へ移動（HTML側から呼び出し可能）
 * @global
 */
window.nextMonth = function() {
    if (window.MonthlyCalendarModule) {
        window.MonthlyCalendarModule.nextMonth();
        
        // 現在の年月をラベルに表示
        const status = window.MonthlyCalendarModule.getStatus();
        const monthLabel = document.getElementById('currentMonthLabel');
        if (monthLabel && status) {
            monthLabel.textContent = `${status.currentMonth}月`;
        }
    } else {
        console.error('MonthlyCalendarModule が見つかりません');
    }
};

/**
 * 今月に戻る（HTML側から呼び出し可能）
 * @global
 */
window.goToCurrentMonth = function() {
    if (window.MonthlyCalendarModule) {
        window.MonthlyCalendarModule.goToCurrentMonth();
        
        // 現在の年月をラベルに表示
        const status = window.MonthlyCalendarModule.getStatus();
        const monthLabel = document.getElementById('currentMonthLabel');
        if (monthLabel && status) {
            monthLabel.textContent = `${status.currentMonth}月`;
        }
    } else {
        console.error('MonthlyCalendarModule が見つかりません');
    }
};

console.log('✅ 月次カレンダー用グローバル関数登録完了');
console.log('  - window.updateCalendar()');
console.log('  - window.previousMonth()');
console.log('  - window.nextMonth()');
console.log('  - window.goToCurrentMonth()');

// ========== Part 7終了 ==========
// ========== Script.js Part 8: 統計・レポート機能 ==========
// 分析タブの全機能（統計、レポート、振り返り、グラフ表示）

// 週次レポート用の変数
let currentWeekNumber = 1;  // 現在選択中の週番号
let currentWeekMode = 'monthWeek';  // 現在の週表示モード
let currentDateType = 'exit';  // レポート集計の日付タイプ（entry/exit）
let currentTradeSort = 'entry';  // トレード履歴のソート順（entry/exit）
let currentSortOrder = 'desc';  // ソート順序（asc: 古い順, desc: 新しい順）

// window登録（互換性のため）
window.currentWeekNumber = currentWeekNumber;
window.currentWeekMode = currentWeekMode;
window.currentDateType = currentDateType;
window.currentTradeSort = currentTradeSort;
window.currentSortOrder = currentSortOrder;

// ========== 月別推移グラフの3段階ビュー機能 ==========

// ========== 分析・レポート生成機能 ==========

// ============================
// StatisticsModuleに移行済み
// - updateStatistics() → js/part8_modules/StatisticsModule.js
// window.StatisticsModule.updateStatistics() で使用
// ============================

// トレード履歴のソート順切り替え
function toggleTradeSort() {
    currentTradeSort = currentTradeSort === 'entry' ? 'exit' : 'entry';
    generateReport(currentReportType);
}

// ============================
// ReportModuleに移行済み
// - generateReport() → js/part8_modules/ReportModule.js
// window.ReportModule.generateReport() で使用
// ============================

// ============================
// ReportModuleに移行済み
// - generateMonthlyReport() → js/part8_modules/ReportModule.js
// window.ReportModule.generateMonthlyReport() で使用
// ============================

// ============================
// ReportModuleに移行済み
// - generateQuarterlyReport() → js/part8_modules/ReportModule.js
// ============================

// ============================
// ReportModuleに移行済み
// - generateYearlyReport() → js/part8_modules/ReportModule.js
// ============================

// ============================
// ReportModuleに移行済み
// - generateWeeklyReport() → js/part8_modules/ReportModule.js
// ============================

// レポート表示（ソート切り替え対応）
function displayReport(data) {
    const content = document.getElementById('reportContent');
    
    // トレード履歴のソート
    let sortedTrades = [...data.trades];
    if (currentTradeSort === 'exit') {
        sortedTrades.sort((a, b) => {
            const exitA = new Date(a.exits[a.exits.length - 1].time);
            const exitB = new Date(b.exits[b.exits.length - 1].time);
            return currentSortOrder === 'desc' ? exitB - exitA : exitA - exitB;
        });
    } else {
        sortedTrades.sort((a, b) => {
            const entryA = new Date(a.entryTime || a.entryDatetime || a.date);
            const entryB = new Date(b.entryTime || b.entryDatetime || b.date);
            return currentSortOrder === 'desc' ? entryB - entryA : entryA - entryB;
        });
    }
    
    content.innerHTML = `
        <div class="report-header">
            <h3 class="report-title">${data.period} トレードレポート</h3>
        </div>
        
        <div class="report-summary">
            <div class="summary-card">
                <div class="value">${data.totalTrades}</div>
                <div class="label">総トレード数</div>
            </div>
            <div class="summary-card">
                <div class="value" style="color: ${data.totalPips >= 0 ? '#00ff88' : '#ff4444'}">
                    ${data.totalPips >= 0 ? '+' : ''}${data.totalPips.toFixed(1)} Pips
                </div>
                <div class="label">獲得Pips</div>
            </div>
            <div class="summary-card">
                <div class="value">${data.winRate.toFixed(1)}%</div>
                <div class="label">勝率</div>
            </div>
            <div class="summary-card">
                <div class="value">${data.avgRR.toFixed(2)}</div>
                <div class="label">平均リスクリワード</div>
            </div>
        </div>
        
        <div style="margin-top: 30px;">
            <h4 style="color: #00ff88; margin-bottom: 15px;">📊 詳細統計</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
                <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 10px;">
                    <h5 style="color: #fff; margin-bottom: 10px;">勝敗統計</h5>
                    <p>勝ちトレード: ${data.wins}回</p>
                    <p>負けトレード: ${data.losses}回</p>
                    <p>平均勝ち: +${data.avgWin.toFixed(1)} pips</p>
                    <p>平均負け: ${data.avgLoss.toFixed(1)} pips</p>
                    <p>最大勝ち: +${data.maxWin.toFixed(1)} pips</p>
                    <p>最大負け: ${data.maxLoss.toFixed(1)} pips</p>
                </div>
                <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 10px;">
                    <h5 style="color: #fff; margin-bottom: 10px;">連続記録</h5>
                    <p>最大連勝: ${data.consecutiveWins}回</p>
                    <p>最大連敗: ${data.consecutiveLosses}回</p>
                    <p>平均リスクリワード: ${data.avgRR.toFixed(2)}</p>
                    <p>保有中: ${data.openTrades}ポジション</p>
                </div>
            </div>
        </div>
        
        <div style="margin-top: 30px;">
            <h4 style="color: #00ff88; margin-bottom: 15px;">💱 通貨ペア / 商品分析</h4>
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>通貨ペア</th>
                        <th>トレード数</th>
                        <th>勝敗</th>
                        <th>勝率</th>
                        <th>獲得Pips</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(data.pairStats).map(([pair, stats]) => `
                        <tr>
                            <td>${pair}</td>
                            <td>${stats.trades}</td>
                            <td>${stats.wins}勝${stats.losses}敗</td>
                            <td>${stats.trades > 0 ? (stats.wins / stats.trades * 100).toFixed(1) : 0}%</td>
                            <td style="color: ${stats.pips >= 0 ? '#00ff88' : '#ff4444'}">
                                ${stats.pips >= 0 ? '+' : ''}${stats.pips.toFixed(1)}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div style="margin-top: 30px;">
            <h4 style="color: #00ff88; margin-bottom: 15px;">📅 曜日別分析（エントリー日時ベース）</h4>
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>曜日</th>
                        <th>トレード数</th>
                        <th>獲得Pips</th>
                        <th>平均Pips</th>
                    </tr>
                </thead>
                <tbody>
                    ${['日', '月', '火', '水', '木', '金', '土'].map((day, i) => {
                        const dayData = data.dayStats[i];
                        const avgPips = dayData.trades > 0 ? dayData.pips / dayData.trades : 0;
                        return `
                            <tr>
                                <td>${day}曜日</td>
                                <td>${dayData.trades}</td>
                                <td style="color: ${dayData.pips >= 0 ? '#00ff88' : '#ff4444'}">
                                    ${dayData.pips >= 0 ? '+' : ''}${dayData.pips.toFixed(1)}
                                </td>
                                <td style="color: ${avgPips >= 0 ? '#00ff88' : '#ff4444'}">
                                    ${avgPips >= 0 ? '+' : ''}${avgPips.toFixed(1)}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="recent-trades" style="margin-top: 30px;">
            <h4 style="color: #00ff88; margin-bottom: 15px;">
                📈 トレード履歴 
                <span style="font-size: 12px; color: #888;">(クリックで詳細表示)</span>
                <div style="float: right;">
                    <button onclick="toggleTradeSort()" style="background: rgba(255, 255, 255, 0.1); border: 1px solid #00ff88; color: #00ff88; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; margin-left: 5px;">
                        ${currentTradeSort === 'entry' ? '決済日時に切替' : 'エントリー日時に切替'}
                    </button>
                    <button onclick="toggleSortOrder()" style="background: rgba(255, 255, 255, 0.1); border: 1px solid #00ff88; color: #00ff88; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; margin-left: 5px;">
                        ${currentSortOrder === 'desc' ? '新しい順 ↓' : '古い順 ↑'}
                    </button>
                </div>
            </h4>
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>${currentTradeSort === 'entry' ? 'エントリー日時' : '決済日時'} ${currentSortOrder === 'desc' ? '(新しい順)' : '(古い順)'}</th>
                        <th>通貨ペア</th>
                        <th>結果</th>
                        <th>保有時間</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedTrades.slice(0, 10).map(trade => {
                        const pips = calculateTradePips(trade);
                        const entryDate = new Date(trade.entryTime || trade.entryDatetime || trade.date);
                        const exitDate = new Date(trade.exits[trade.exits.length - 1].time);
                        const holdTime = exitDate - entryDate;
                        const hours = Math.floor(holdTime / (1000 * 60 * 60));
                        const days = Math.floor(hours / 24);
                        const displayHours = hours % 24;
                        const displayDate = currentTradeSort === 'entry' ? entryDate : exitDate;
                        
                        return `
                            <tr style="cursor: pointer; transition: background 0.2s;"
                                onmouseover="this.style.background='rgba(255, 255, 255, 0.05)'"
                                onmouseout="this.style.background='transparent'"
                                onclick="showTradeDetail(trades.find(t => t.id === ${trade.id}))">
                                <td>${formatDateTimeForDisplay(displayDate)}</td>
                                <td>${trade.pair}</td>
                                <td>
                                    <span class="${pips >= 0 ? 'win' : 'loss'}">
                                        ${pips >= 0 ? '+' : ''}${pips.toFixed(1)} pips
                                    </span>
                                </td>
                                <td>${days > 0 ? `${days}日${displayHours}時間` : `${hours}時間`}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    // 振り返り一覧を追加
    content.innerHTML += generateReflectionList(data);
    
    // 印刷ボタンを追加（月次レポートの場合のみ）
    if (currentReportType === 'monthly') {
        content.innerHTML += `
            <div class="report-actions" style="margin-top: 30px; text-align: center;">
                <button onclick="printMonthlyReport()" class="btn btn-primary">
                    📄 月次レポートをPDF保存
                </button>
            </div>
        `;
    }
}

// ========== グラフ描画機能 ==========

// 月別パフォーマンスグラフ
function updateMonthlyPerformanceChart() {
    const canvas = document.getElementById('monthlyChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const container = canvas.parentElement;
    
    // キャンバスサイズの確実な設定
    requestAnimationFrame(() => {
        // コンテナの実際のサイズを取得
        const rect = container.getBoundingClientRect();
        const width = Math.max(rect.width || 800, 800);
        
        canvas.width = width - 40;
        canvas.height = 400;
        
        // データが存在しない場合の処理
        if (!trades || trades.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('トレードデータがありません', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        // 現在のビューに応じて描画
        switch(currentChartView) {
            case 'yearly':
                drawYearlyChart();
                break;
            case 'all':
                drawAllTimeSummary();
                break;
            default:
                drawMonthlyChartOriginal();
        }
    });
}

// ========== 目標管理機能 ==========

// 目標の保存
function saveGoals() {
    for (let i = 1; i <= 3; i++) {
        const text = document.getElementById(`goalText${i}`).value.trim();
        const deadline = document.getElementById(`goalDeadline${i}`).value;
        
        // 個別のストレージ項目として保存
        storage.setItem(`goalText${i}`, text);
        storage.setItem(`goalDeadline${i}`, deadline);
        storage.setItem(`goalAchieved${i}`, 'false'); // チェック機能は無効化
    }
    
    updateGoalsDisplay();
    showToast('セルフイメージを保存しました', 'success');
}

// 目標表示の更新 - SettingsModuleに委譲
function updateGoalsDisplay() {
    // SettingsModuleが存在する場合は委譲（何もしない）
    if (window.SettingsModule) {
        // SettingsModuleのupdateGoalsDisplay()に任せる
        // SettingsModuleは初期化時とsaveGoals()時に自動実行される
        return;
    }
    
    // ========================================
    // 以下、SettingsModuleがない場合のフォールバック
    // （後方互換性のため残す）
    // ========================================
    
    // goalsDataが未定義の場合は初期化
    if (typeof goalsData === 'undefined' || !goalsData) {
        window.goalsData = {
            goals: [
                { id: 1, text: "", deadline: "", achieved: false },
                { id: 2, text: "", deadline: "", achieved: false },
                { id: 3, text: "", deadline: "", achieved: false }
            ]
        };
    }
    
    for (let i = 1; i <= 3; i++) {
        // 個別キーから読み取り
        const text = storage.getItem(`goalText${i}`) || '';
        const deadline = storage.getItem(`goalDeadline${i}`) || '';
        
        // 設定画面の入力欄を更新
        const inputElement = document.getElementById(`goalText${i}`);
        const deadlineElement = document.getElementById(`goalDeadline${i}`);
        
        if (inputElement) inputElement.value = text;
        if (deadlineElement) deadlineElement.value = deadline;
        
        // goalsDataも更新
        if (goalsData && goalsData.goals && goalsData.goals[i - 1]) {
            goalsData.goals[i - 1].text = text;
            goalsData.goals[i - 1].deadline = deadline;
        }
    }
}

// toggleGoalAchieved を無効化
function toggleGoalAchieved(goalNumber) {
    // クリックしても何もしない
    return;
}

// デフォルト見出しをリセット（v6互換性のため）
function resetDefaultHeadings() {
    // v6では見出し機能は廃止されているため、空の関数として定義
}

// ========== windowへの関数登録（Part 8: モジュール化済み） ==========
// Phase 1-4完了：StatisticsModule, ReportModule, ChartModuleへ移行済み
// 以下は互換性維持のための転送関数

// 目標表示（まだ移行していない関数）
window.updateGoalsDisplay = updateGoalsDisplay;
window.saveGoals = saveGoals;
window.toggleGoalAchieved = toggleGoalAchieved;
window.resetDefaultHeadings = resetDefaultHeadings;

// 統計・レポート・チャート（StatisticsModule, ReportModule, ChartModuleへの転送）
window.updateStatistics = function() {
    window.StatisticsModule?.updateStatistics();
};

window.toggleTradeSort = function() {
    window.ReportModule?.toggleTradeSort();
};

window.generateReport = function(type, year, month) {
    window.ReportModule?.generateReport(type, year, month);
};

window.generateMonthlyReport = function() {
    window.ReportModule?.generateMonthlyReport();
};

window.generateQuarterlyReport = function() {
    window.ReportModule?.generateQuarterlyReport();
};

window.generateYearlyReport = function() {
    window.ReportModule?.generateYearlyReport();
};

window.displayReport = function(data, type) {
    window.ReportModule?.displayReport(data, type);
};

window.updateMonthlyPerformanceChart = function() {
    window.ChartModule?.updateMonthlyPerformanceChart();
};

// 印刷・分析系（ReportModuleへの転送）
window.printMonthlyReport = function() {
    window.ReportModule?.printMonthlyReport();
};

// ========================================
// 目標折りたたみ機能（モバイル用）
// 追加日: 2025-12-02
// ========================================

/**
 * 目標表示トグルボタンを初期化
 */
function initGoalsToggle() {
    const headerContent = document.querySelector('.header-content');
    const goalsDisplay = document.getElementById('goalsDisplay');
    
    if (!headerContent || !goalsDisplay) return;
    
    // トグルボタンが既に存在する場合はスキップ
    if (document.querySelector('.goals-toggle-btn')) return;
    
    // トグルボタンを作成
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'goals-toggle-btn';
    toggleBtn.innerHTML = '<span class="toggle-arrow">▼</span> 目標を見る';
    toggleBtn.onclick = toggleGoalsDisplay;
    
    // header-contentの最後に追加
    headerContent.appendChild(toggleBtn);
}

/**
 * 目標表示の開閉を切り替え
 */
function toggleGoalsDisplay() {
    const goalsDisplay = document.getElementById('goalsDisplay');
    const toggleBtn = document.querySelector('.goals-toggle-btn');
    
    if (!goalsDisplay || !toggleBtn) return;
    
    const isExpanded = goalsDisplay.classList.contains('expanded');
    
    if (isExpanded) {
        goalsDisplay.classList.remove('expanded');
        toggleBtn.classList.remove('expanded');
        toggleBtn.innerHTML = '<span class="toggle-arrow">▼</span> 目標を見る';
    } else {
        goalsDisplay.classList.add('expanded');
        toggleBtn.classList.add('expanded');
        toggleBtn.innerHTML = '<span class="toggle-arrow">▼</span> 目標を隠す';
    }
}

// グローバル公開
window.initGoalsToggle = initGoalsToggle;
window.toggleGoalsDisplay = toggleGoalsDisplay;

// ========== Part 8 終了 ==========

// =====================================================
// Pull-to-Refresh（ホーム画面追加時用）- iOS対応版
// =====================================================
(function initPullToRefresh() {
    let startY = 0;
    let isPulling = false;
    const threshold = 80;
    
    // スクロール位置を取得（iOS対応）
    function getScrollTop() {
        return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    
    // インジケーター要素を取得または作成
    let indicator = document.getElementById('pullToRefreshIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'pullToRefreshIndicator';
        document.body.appendChild(indicator);
    }
    
    // スタイル設定
    indicator.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 0;
        background: linear-gradient(180deg, rgba(0,255,136,0.2) 0%, transparent 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #00ff88;
        font-size: 0.9rem;
        font-weight: 600;
        overflow: hidden;
        transition: height 0.1s ease;
        z-index: 99999;
        pointer-events: none;
    `;

    document.addEventListener('touchstart', function(e) {
        // iOS対応: 5px以下なら最上部とみなす
        if (getScrollTop() <= 5) {
            startY = e.touches[0].pageY;
            isPulling = true;
        }
    }, { passive: true });

    document.addEventListener('touchmove', function(e) {
        if (!isPulling || getScrollTop() > 5) {
            isPulling = false;
            indicator.style.height = '0';
            return;
        }
        
        const currentY = e.touches[0].pageY;
        const pullDistance = currentY - startY;
        
        if (pullDistance > 0) {
            const height = Math.min(pullDistance * 0.5, 60);
            indicator.style.height = height + 'px';
            
            if (pullDistance > threshold) {
                indicator.textContent = '↓ 離すとリロード';
            } else {
                indicator.textContent = '↓ 引っ張ってリロード';
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', function(e) {
        if (!isPulling) return;
        
        const endY = e.changedTouches[0].pageY;
        const pullDistance = endY - startY;
        
        indicator.style.height = '0';
        isPulling = false;
        
        if (getScrollTop() <= 5 && pullDistance > threshold) {
            // 画面暗転オーバーレイを作成
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 999999;
                color: #00ff88;
                font-size: 1.2rem;
                font-weight: 600;
            `;
            overlay.innerHTML = `
                <div style="font-size: 2rem; margin-bottom: 15px;">🔄</div>
                <div>更新中...</div>
            `;
            document.body.appendChild(overlay);
            
            // リロード実行（PWA対応：複数の方法を試行）
            setTimeout(() => {
                // 方法1: 通常のリロード
                location.reload();
                
                // 方法2: 1.5秒後にまだ残っていたらURLリダイレクト
                setTimeout(() => {
                    window.location.href = window.location.pathname + '?t=' + Date.now();
                }, 1500);
            }, 500);
        }
    }, { passive: true });
    
    console.log('Pull-to-Refresh 初期化完了（iOS対応版）');
})();