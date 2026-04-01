/**
 * AuthModule - 認証管理モジュール
 * 
 * Supabaseを使用したユーザー認証を管理
 * - ログイン / 登録 / ログアウト
 * - 認証状態の監視
 * - 認証モーダルの制御
 * - ユーザー名の管理
 * - アカウント情報変更（ユーザーネーム、メールアドレス、パスワード）
 * 
 * @version 1.4.0
 * @date 2026-01-14
 * @changelog
 *   v1.4.0 (2026-01-14) - パスワードリセット機能追加
 *   v1.3.0 (2026-01-14) - マイページ変更機能追加（ユーザーネーム、メール、パスワード）
 *   v1.2.0 (2026-01-05) - ログイン時のクラウド同期追加（syncAllDataFromCloud）
 *   v1.1.1 (2025-01-04) - SyncModule自動初期化追加
 *   v1.1.0 (2025-12-29) - セッション監視機能追加、SecureError統合
 *   v1.0.0 (2025-12-17) - 初版
 */

const AuthModule = (function() {
    'use strict';

    // ============================================
    // プライベート変数
    // ============================================
    
    let currentUser = null;
    let authModal = null;
    let isInitialized = false;

    // ============================================
    // 初期化
    // ============================================

    /**
     * AuthModuleを初期化
     */
    async function init() {
        if (isInitialized) {
            console.log('[Auth] 既に初期化済み');
            return;
        }

        console.log('[Auth] 初期化開始...');

        // モーダル要素を取得
        authModal = document.getElementById('auth-modal');
        
        if (!authModal) {
            console.error('[Auth] auth-modal要素が見つかりません');
            return;
        }

        // イベントリスナー設定
        setupEventListeners();

        // 認証状態の監視を開始
        setupAuthStateListener();

        // 現在のセッションを確認
        await checkCurrentSession();

        isInitialized = true;
        console.log('[Auth] 初期化完了');
    }

    // ============================================
    // イベントリスナー
    // ============================================

    /**
     * イベントリスナーを設定
     */
    function setupEventListeners() {
        // タブ切り替え
        const loginTab = document.getElementById('login-tab');
        const registerTab = document.getElementById('register-tab');
        
        if (loginTab) {
            loginTab.addEventListener('click', () => switchTab('login'));
        }
        if (registerTab) {
            registerTab.addEventListener('click', () => switchTab('register'));
        }

        // フォーム送信
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
        if (registerForm) {
            registerForm.addEventListener('submit', handleRegister);
        }

        // ログアウトボタン
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        // パスワード表示切り替え
        const togglePasswordBtns = document.querySelectorAll('.toggle-password');
        togglePasswordBtns.forEach(btn => {
            btn.addEventListener('click', togglePasswordVisibility);
        });
    }

    /**
     * 認証状態の変更を監視
     */
    function setupAuthStateListener() {
        const supabase = getSupabase();
        if (!supabase) return;

        supabase.auth.onAuthStateChange((event, session) => {
            console.log('[Auth] 認証状態変更:', event);
            
            // パスワードリカバリー検知
            if (event === 'PASSWORD_RECOVERY') {
                console.log('[Auth] パスワードリカバリー検知');
                currentUser = session.user;
                onLoginSuccess();
                
                // 少し待ってからモーダルを開く（UI描画完了を待つ）
                setTimeout(() => {
                    // 警告バナーを表示
                    const warning = document.getElementById('passwordRecoveryWarning');
                    if (warning) warning.style.display = 'block';
                    
                    openChangePasswordModal();
                }, 500);
                return;
            }
            
            if (session) {
                currentUser = session.user;
                onLoginSuccess();
            } else {
                currentUser = null;
                onLogout();
            }
        });
    }

    // ============================================
    // 認証処理
    // ============================================

    /**
     * 現在のセッションを確認
     */
    async function checkCurrentSession() {
        const supabase = getSupabase();
        if (!supabase) return;

        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) {
                console.error('[Auth] セッション確認エラー:', error.message);
                return;
            }

            if (session) {
                currentUser = session.user;
                console.log('[Auth] ログイン中:', currentUser.email);
                onLoginSuccess();
            } else {
                console.log('[Auth] 未ログイン');
                showAuthModal();
            }
        } catch (err) {
            console.error('[Auth] セッション確認失敗:', err);
        }
    }

    /**
     * ログイン処理
     */
    async function handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        // バリデーション
        if (!email || !password) {
            showError(errorDiv, 'メールアドレスとパスワードを入力してください');
            return;
        }

        // ボタンを無効化
        submitBtn.disabled = true;
        submitBtn.textContent = 'ログイン中...';
        hideError(errorDiv);

        const supabase = getSupabase();
        if (!supabase) {
            showError(errorDiv, 'Supabaseに接続できません');
            submitBtn.disabled = false;
            submitBtn.textContent = 'ログイン';
            return;
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                console.error('[Auth] ログインエラー:', error.message);
                showError(errorDiv, getErrorMessage(error));
                submitBtn.disabled = false;
                submitBtn.textContent = 'ログイン';
                return;
            }

            console.log('[Auth] ログイン成功:', data.user.email);
            // onAuthStateChangeで処理される

        } catch (err) {
            console.error('[Auth] ログイン失敗:', err);
            showError(errorDiv, '予期しないエラーが発生しました');
            submitBtn.disabled = false;
            submitBtn.textContent = 'ログイン';
        }
    }

    /**
     * 新規登録処理
     */
    async function handleRegister(e) {
        e.preventDefault();
        
        const username = document.getElementById('register-username')?.value.trim() || '';
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const passwordConfirm = document.getElementById('register-password-confirm').value;
        const errorDiv = document.getElementById('register-error');
        const successDiv = document.getElementById('register-success');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        // バリデーション
        if (!email || !password || !passwordConfirm) {
            showError(errorDiv, 'すべての項目を入力してください');
            return;
        }

        // ユーザー名のバリデーション（任意入力だが、入力された場合はチェック）
        if (username && username.length < 2) {
            showError(errorDiv, 'ユーザー名は2文字以上で入力してください');
            return;
        }

        if (username && username.length > 20) {
            showError(errorDiv, 'ユーザー名は20文字以内で入力してください');
            return;
        }

        if (password !== passwordConfirm) {
            showError(errorDiv, 'パスワードが一致しません');
            return;
        }

        // パスワード強度チェック
        const passwordError = validatePassword(password);
        if (passwordError) {
            showError(errorDiv, passwordError);
            return;
        }

        // ボタンを無効化
        submitBtn.disabled = true;
        submitBtn.textContent = '登録中...';
        hideError(errorDiv);
        hideSuccess(successDiv);

        const supabase = getSupabase();
        if (!supabase) {
            showError(errorDiv, 'Supabaseに接続できません');
            submitBtn.disabled = false;
            submitBtn.textContent = '新規登録';
            return;
        }

        try {
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: username || null,
                        display_name: username || email.split('@')[0]
                    },
                    emailRedirectTo: 'https://tradingcomplete.com/trading-complete/'
                }
            });

            if (error) {
                console.error('[Auth] 登録エラー:', error.message);
                showError(errorDiv, getErrorMessage(error));
                submitBtn.disabled = false;
                submitBtn.textContent = '新規登録';
                return;
            }

            console.log('[Auth] 登録成功:', data);
            
            // メール確認が必要な場合
            if (data.user && !data.session) {
                showSuccess(successDiv, '確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。');
                submitBtn.disabled = false;
                submitBtn.textContent = '新規登録';
            }
            // 自動ログインの場合
            else if (data.session) {
                // onAuthStateChangeで処理される
            }

        } catch (err) {
            console.error('[Auth] 登録失敗:', err);
            showError(errorDiv, '予期しないエラーが発生しました');
            submitBtn.disabled = false;
            submitBtn.textContent = '新規登録';
        }
    }

    /**
     * ログアウト処理
     */
    async function handleLogout() {
        // 確認ダイアログ
        if (!confirm('ログアウトしますか？')) {
            return;
        }
        
        const supabase = getSupabase();
        if (!supabase) return;

        try {
            const { error } = await supabase.auth.signOut();
            
            if (error) {
                console.error('[Auth] ログアウトエラー:', error.message);
                return;
            }

            console.log('[Auth] ログアウト成功');
            // onAuthStateChangeで処理される

        } catch (err) {
            console.error('[Auth] ログアウト失敗:', err);
        }
    }

    /**
     * 確認ダイアログ付きログアウト
     */
    async function logoutWithConfirm() {
        if (confirm('ログアウトしますか？\n\n再度ログインが必要になります。')) {
            await handleLogout();
        }
    }

    // ============================================
    // UI制御
    // ============================================

    /**
     * 認証モーダルを表示
     */
    function showAuthModal() {
        if (authModal) {
            authModal.classList.add('show');
            document.body.style.overflow = 'hidden';
            
            // ボタンの状態をリセット
            const loginBtn = authModal.querySelector('#login-form button[type="submit"]');
            const registerBtn = authModal.querySelector('#register-form button[type="submit"]');
            
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.textContent = 'ログイン';
            }
            if (registerBtn) {
                registerBtn.disabled = false;
                registerBtn.textContent = '新規登録';
            }
        }
    }

    /**
     * 認証モーダルを非表示
     */
    function hideAuthModal() {
        if (authModal) {
            authModal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    /**
     * タブを切り替え
     */
    function switchTab(tab) {
        const loginTab = document.getElementById('login-tab');
        const registerTab = document.getElementById('register-tab');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');

        if (tab === 'login') {
            loginTab.classList.add('active');
            registerTab.classList.remove('active');
            loginForm.classList.add('active');
            registerForm.classList.remove('active');
        } else {
            loginTab.classList.remove('active');
            registerTab.classList.add('active');
            loginForm.classList.remove('active');
            registerForm.classList.add('active');
        }

        // エラーメッセージをクリア
        hideError(document.getElementById('login-error'));
        hideError(document.getElementById('register-error'));
        hideSuccess(document.getElementById('register-success'));
    }

    /**
     * パスワード表示切り替え
     */
    function togglePasswordVisibility(e) {
        const btn = e.currentTarget;
        const input = btn.previousElementSibling;
        
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '🙈';
        } else {
            input.type = 'password';
            btn.textContent = '👁';
        }
    }

    /**
     * ログイン成功時の処理
     */
    function onLoginSuccess() {
        hideAuthModal();
        updateUserDisplay();
        updateMyPageDisplay();
        
        // EventBusで通知（存在する場合のみ）
        if (typeof EventBus !== 'undefined' && typeof EventBus.emit === 'function') {
            EventBus.emit('auth:login', { user: currentUser });
        }
        
        // SyncModule初期化（PaymentModule初期化完了後に実行）
        // PaymentModuleが先に初期化されないとFreeプランと誤判定される
        initializeSyncAfterPayment();
    }

    /**
     * PaymentModule初期化完了後にSyncModuleを初期化
     * PaymentModuleが未初期化の場合、payment:initialized イベントを待つ
     */
    function initializeSyncAfterPayment() {
        // 既にPaymentModuleが初期化済みかチェック
        if (window.PaymentModule && window.PaymentModule.getCurrentPlan() !== 'free') {
            console.log('[Auth] PaymentModule初期化済み（plan:', window.PaymentModule.getCurrentPlan(), '）→ SyncModule初期化');
            initializeSyncModule();
            return;
        }
        
        // PaymentModule未初期化 → payment:initialized イベントを待つ
        console.log('[Auth] PaymentModule未初期化 → payment:initialized を待機');
        let handled = false;
        
        if (typeof EventBus !== 'undefined' && typeof EventBus.on === 'function') {
            EventBus.on('payment:initialized', function onPaymentReady(data) {
                if (handled) return;  // 一度だけ実行
                handled = true;
                console.log('[Auth] payment:initialized 受信（plan:', data?.plan, '）→ SyncModule初期化');
                initializeSyncModule();
            });
        }
        
        // フォールバック: 5秒待ってもイベントが来なければ強制実行
        setTimeout(() => {
            if (handled) return;
            handled = true;
            console.warn('[Auth] payment:initialized タイムアウト → SyncModule強制初期化');
            initializeSyncModule();
        }, 5000);
    }

    /**
     * SyncModuleを初期化し、Supabaseからデータを同期
     */
    function initializeSyncModule() {
        if (window.SyncModule) {
            window.SyncModule.initialize()
                .then(success => {
                    if (success) {
                        console.log('[Auth] SyncModule初期化成功');
                        // Supabase → localStorage にデータを同期
                        syncAllDataFromCloud();
                    } else {
                        console.warn('[Auth] SyncModule初期化失敗');
                    }
                })
                .catch(err => {
                    console.error('[Auth] SyncModule初期化エラー:', err);
                });
        } else {
            console.log('[Auth] SyncModuleが見つかりません（スキップ）');
        }
    }

    /**
     * Supabaseから全データをlocalStorageに同期
     */
    async function syncAllDataFromCloud() {
        console.log('[Auth] クラウドからデータ同期開始...');
        
        try {
            const results = {
                trades: false,
                notes: false,
                expenses: false,
                capitalRecords: false,
                settings: false
            };
            
            // 1. トレード同期
            try {
                const tradesResult = await window.SyncModule.syncTradesToLocal();
                results.trades = tradesResult?.success || false;
                console.log('[Auth] トレード同期:', results.trades ? '成功' : '失敗');
            } catch (e) {
                console.warn('[Auth] トレード同期エラー:', e);
            }
            
            // 2. ノート同期
            try {
                const notesResult = await window.SyncModule.syncNotesToLocal();
                results.notes = notesResult?.success || false;
                console.log('[Auth] ノート同期:', results.notes ? '成功' : '失敗');
            } catch (e) {
                console.warn('[Auth] ノート同期エラー:', e);
            }
            
            // 3. 経費同期
            try {
                const expensesResult = await window.SyncModule.syncExpensesToLocal();
                results.expenses = expensesResult?.success || false;
                console.log('[Auth] 経費同期:', results.expenses ? '成功' : '失敗');
            } catch (e) {
                console.warn('[Auth] 経費同期エラー:', e);
            }
            
            // 4. 入出金同期
            try {
                const capitalResult = await window.SyncModule.syncCapitalRecordsToLocal();
                results.capitalRecords = capitalResult?.success || false;
                console.log('[Auth] 入出金同期:', results.capitalRecords ? '成功' : '失敗');
            } catch (e) {
                console.warn('[Auth] 入出金同期エラー:', e);
            }
            
            // 5. 設定同期
            try {
                const settingsResult = await window.SyncModule.syncUserSettingsToLocal();
                results.settings = settingsResult?.success || false;
                console.log('[Auth] 設定同期:', results.settings ? '成功' : '失敗');
            } catch (e) {
                console.warn('[Auth] 設定同期エラー:', e);
            }
            
            console.log('[Auth] クラウド同期完了:', results);
            
            // UIを更新するためページリロードを促す（または直接更新）
            if (window.eventBus) {
                window.eventBus.emit('sync:complete', results);
            }
            
        } catch (err) {
            console.error('[Auth] クラウド同期エラー:', err);
        }
    }

    /**
     * ログアウト時の処理
     */
    function onLogout() {
        showAuthModal();
        updateUserDisplay();
        
        // EventBusで通知（存在する場合のみ）
        if (typeof EventBus !== 'undefined' && typeof EventBus.emit === 'function') {
            EventBus.emit('auth:logout');
        }
    }

    /**
     * ユーザー表示を更新
     */
    function updateUserDisplay() {
        const userDisplayName = document.getElementById('user-display-name');
        const userEmail = document.getElementById('user-email');
        const logoutBtn = document.getElementById('logout-btn');
        const userInfoContainer = document.getElementById('user-info');

        if (currentUser) {
            // 表示名を取得（ユーザー名 > display_name > メールアドレスの@前）
            const displayName = currentUser.user_metadata?.username 
                || currentUser.user_metadata?.display_name 
                || currentUser.email?.split('@')[0] 
                || 'ユーザー';
            
            if (userDisplayName) userDisplayName.textContent = displayName;
            if (userEmail) userEmail.textContent = currentUser.email;
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            if (userInfoContainer) userInfoContainer.style.display = 'flex';
        } else {
            if (userDisplayName) userDisplayName.textContent = '';
            if (userEmail) userEmail.textContent = '';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (userInfoContainer) userInfoContainer.style.display = 'none';
        }
    }

    /**
     * マイページのユーザー情報を更新
     */
    function updateMyPageDisplay() {
        const usernameEl = document.getElementById('mypage-username');
        const emailEl = document.getElementById('mypage-email');

        if (currentUser) {
            // ユーザーネーム（未設定の場合は「(未設定)」）
            if (usernameEl) {
                const username = currentUser.user_metadata?.username;
                usernameEl.textContent = username || '(未設定)';
            }
            
            // メールアドレス
            if (emailEl) {
                emailEl.textContent = currentUser.email || '-';
            }
            
            console.log('[Auth] マイページ表示を更新しました');
        } else {
            // 未ログイン時
            if (usernameEl) usernameEl.textContent = '-';
            if (emailEl) emailEl.textContent = '-';
        }
    }

    // ============================================
    // アカウント情報変更
    // ============================================

    /**
     * ユーザーネーム変更モーダルを開く
     */
    function openChangeUsernameModal() {
        const modal = document.getElementById('changeUsernameModal');
        if (!modal) {
            console.error('[Auth] changeUsernameModal が見つかりません');
            return;
        }
        
        // 現在のユーザーネームをセット
        const input = document.getElementById('newUsername');
        if (input && currentUser) {
            input.value = currentUser.user_metadata?.username || '';
        }
        
        // エラーメッセージをクリア
        const errorDiv = document.getElementById('changeUsernameError');
        if (errorDiv) errorDiv.style.display = 'none';
        
        modal.style.display = 'flex';
    }

    /**
     * ユーザーネーム変更モーダルを閉じる
     */
    function closeChangeUsernameModal() {
        const modal = document.getElementById('changeUsernameModal');
        if (modal) modal.style.display = 'none';
    }

    /**
     * ユーザーネームを変更
     */
    async function changeUsername() {
        const input = document.getElementById('newUsername');
        const errorDiv = document.getElementById('changeUsernameError');
        const submitBtn = document.querySelector('#changeUsernameModal .btn-primary');
        
        const newUsername = input?.value.trim();
        
        // バリデーション
        if (!newUsername) {
            showError(errorDiv, 'ユーザーネームを入力してください');
            return;
        }
        
        if (newUsername.length < 2) {
            showError(errorDiv, 'ユーザーネームは2文字以上で入力してください');
            return;
        }
        
        if (newUsername.length > 20) {
            showError(errorDiv, 'ユーザーネームは20文字以内で入力してください');
            return;
        }
        
        // ボタン無効化
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '変更中...';
        }
        hideError(errorDiv);
        
        const supabase = getSupabase();
        if (!supabase) {
            showError(errorDiv, 'Supabaseに接続できません');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '変更する';
            }
            return;
        }
        
        try {
            const { data, error } = await supabase.auth.updateUser({
                data: { username: newUsername }
            });
            
            if (error) {
                console.error('[Auth] ユーザーネーム変更エラー:', error);
                showError(errorDiv, 'ユーザーネームの変更に失敗しました');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '変更する';
                }
                return;
            }
            
            // currentUserを更新
            currentUser = data.user;
            
            // 表示を更新
            updateUserDisplay();
            updateMyPageDisplay();
            
            // モーダルを閉じる
            closeChangeUsernameModal();
            
            // 成功通知
            if (typeof showToast === 'function') {
                showToast('ユーザーネームを変更しました', 'success');
            }
            
            console.log('[Auth] ユーザーネーム変更完了:', newUsername);
            
        } catch (err) {
            console.error('[Auth] ユーザーネーム変更失敗:', err);
            showError(errorDiv, '予期しないエラーが発生しました');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '変更する';
            }
        }
    }

    /**
     * メールアドレス変更モーダルを開く
     */
    function openChangeEmailModal() {
        const modal = document.getElementById('changeEmailModal');
        if (!modal) {
            console.error('[Auth] changeEmailModal が見つかりません');
            return;
        }
        
        // 現在のメールアドレスを表示
        const currentEmailSpan = document.getElementById('currentEmailDisplay');
        if (currentEmailSpan && currentUser) {
            currentEmailSpan.textContent = currentUser.email || '-';
        }
        
        // 入力欄をクリア
        const input = document.getElementById('newEmail');
        if (input) input.value = '';
        
        // エラーメッセージをクリア
        const errorDiv = document.getElementById('changeEmailError');
        if (errorDiv) errorDiv.style.display = 'none';
        
        modal.style.display = 'flex';
    }

    /**
     * メールアドレス変更モーダルを閉じる
     */
    function closeChangeEmailModal() {
        const modal = document.getElementById('changeEmailModal');
        if (modal) modal.style.display = 'none';
    }

    /**
     * メールアドレスを変更
     */
    async function changeEmail() {
        const input = document.getElementById('newEmail');
        const errorDiv = document.getElementById('changeEmailError');
        const submitBtn = document.querySelector('#changeEmailModal .btn-primary');
        
        const newEmail = input?.value.trim();
        
        // バリデーション
        if (!newEmail) {
            showError(errorDiv, '新しいメールアドレスを入力してください');
            return;
        }
        
        // 簡易的なメール形式チェック
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            showError(errorDiv, 'メールアドレスの形式が正しくありません');
            return;
        }
        
        // ボタン無効化
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '変更中...';
        }
        hideError(errorDiv);
        
        const supabase = getSupabase();
        if (!supabase) {
            showError(errorDiv, 'Supabaseに接続できません');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '変更する';
            }
            return;
        }
        
        try {
            const { data, error } = await supabase.auth.updateUser(
                { email: newEmail },
                { emailRedirectTo: 'https://tradingcomplete.com/trading-complete/' }
            );
            
            if (error) {
                console.error('[Auth] メールアドレス変更エラー:', error);
                showError(errorDiv, getErrorMessage(error));
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '変更する';
                }
                return;
            }
            
            // モーダルを閉じる
            closeChangeEmailModal();
            
            // 確認メール送信のお知らせ
            if (typeof showToast === 'function') {
                showToast('確認メールを送信しました。メール内のリンクをクリックして変更を完了してください。', 'info', 8000);
            } else {
                alert('確認メールを送信しました。メール内のリンクをクリックして変更を完了してください。');
            }
            
            console.log('[Auth] メールアドレス変更リクエスト送信:', newEmail);
            
        } catch (err) {
            console.error('[Auth] メールアドレス変更失敗:', err);
            showError(errorDiv, '予期しないエラーが発生しました');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '変更する';
            }
        }
    }

    /**
     * パスワード変更モーダルを開く
     */
    function openChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (!modal) {
            console.error('[Auth] changePasswordModal が見つかりません');
            return;
        }
        
        // 入力欄をクリア
        const newPasswordInput = document.getElementById('newPassword');
        const confirmPasswordInput = document.getElementById('confirmNewPassword');
        if (newPasswordInput) newPasswordInput.value = '';
        if (confirmPasswordInput) confirmPasswordInput.value = '';
        
        // エラーメッセージをクリア
        const errorDiv = document.getElementById('changePasswordError');
        if (errorDiv) errorDiv.style.display = 'none';
        
        // 警告バナーは通常時は非表示（リカバリー時のみsetupAuthStateListenerで表示）
        // ここでは何もしない（リカバリー検知時に表示される）
        
        modal.style.display = 'flex';
    }

    /**
     * パスワード変更モーダルを閉じる
     */
    function closeChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (modal) modal.style.display = 'none';
        
        // 警告バナーを非表示（次回に備えてリセット）
        const warning = document.getElementById('passwordRecoveryWarning');
        if (warning) warning.style.display = 'none';
    }

    /**
     * パスワードを変更
     */
    async function changePassword() {
        const newPasswordInput = document.getElementById('newPassword');
        const confirmPasswordInput = document.getElementById('confirmNewPassword');
        const errorDiv = document.getElementById('changePasswordError');
        const submitBtn = document.querySelector('#changePasswordModal .btn-primary');
        
        const newPassword = newPasswordInput?.value;
        const confirmPassword = confirmPasswordInput?.value;
        
        // バリデーション
        if (!newPassword || !confirmPassword) {
            showError(errorDiv, 'すべての項目を入力してください');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showError(errorDiv, '新しいパスワードが一致しません');
            return;
        }
        
        // パスワード強度チェック
        const passwordError = validatePassword(newPassword);
        if (passwordError) {
            showError(errorDiv, passwordError);
            return;
        }
        
        // ボタン無効化
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '変更中...';
        }
        hideError(errorDiv);
        
        const supabase = getSupabase();
        if (!supabase) {
            showError(errorDiv, 'Supabaseに接続できません');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '変更する';
            }
            return;
        }
        
        try {
            const { data, error } = await supabase.auth.updateUser({
                password: newPassword
            });
            
            if (error) {
                console.error('[Auth] パスワード変更エラー:', error);
                showError(errorDiv, getErrorMessage(error));
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '変更する';
                }
                return;
            }
            
            // モーダルを閉じる
            closeChangePasswordModal();
            
            // 成功通知
            if (typeof showToast === 'function') {
                showToast('パスワードを変更しました', 'success');
            }
            
            console.log('[Auth] パスワード変更完了');
            
        } catch (err) {
            console.error('[Auth] パスワード変更失敗:', err);
            showError(errorDiv, '予期しないエラーが発生しました');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '変更する';
            }
        }
    }

    // ============================================
    // パスワードリセット
    // ============================================

    /**
     * パスワードリセットモーダルを開く
     */
    function openResetPasswordModal() {
        const modal = document.getElementById('resetPasswordModal');
        if (!modal) {
            console.error('[Auth] resetPasswordModal が見つかりません');
            return;
        }
        
        // 入力欄をクリア
        const emailInput = document.getElementById('resetEmail');
        if (emailInput) emailInput.value = '';
        
        // エラー・成功メッセージをクリア
        const errorDiv = document.getElementById('resetPasswordError');
        const successDiv = document.getElementById('resetPasswordSuccess');
        if (errorDiv) errorDiv.style.display = 'none';
        if (successDiv) successDiv.style.display = 'none';
        
        modal.style.display = 'flex';
    }

    /**
     * パスワードリセットモーダルを閉じる
     */
    function closeResetPasswordModal() {
        const modal = document.getElementById('resetPasswordModal');
        if (modal) modal.style.display = 'none';
    }

    /**
     * パスワードリセットメールを送信
     */
    async function sendResetPasswordEmail() {
        const emailInput = document.getElementById('resetEmail');
        const errorDiv = document.getElementById('resetPasswordError');
        const successDiv = document.getElementById('resetPasswordSuccess');
        const submitBtn = document.querySelector('#resetPasswordModal .btn-primary');
        
        const email = emailInput?.value.trim();
        
        // バリデーション
        if (!email) {
            showError(errorDiv, 'メールアドレスを入力してください');
            return;
        }
        
        // メールアドレス形式チェック
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError(errorDiv, 'メールアドレスの形式が正しくありません');
            return;
        }
        
        // ボタン無効化
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '送信中...';
        }
        hideError(errorDiv);
        hideSuccess(successDiv);
        
        const supabase = getSupabase();
        if (!supabase) {
            showError(errorDiv, 'Supabaseに接続できません');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'リセットメールを送信';
            }
            return;
        }
        
        try {
            const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: 'https://tradingcomplete.com/trading-complete/'
            });
            
            if (error) {
                console.error('[Auth] パスワードリセットエラー:', error);
                showError(errorDiv, getErrorMessage(error));
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'リセットメールを送信';
                }
                return;
            }
            
            // 成功メッセージ表示
            showSuccess(successDiv, 'パスワードリセットメールを送信しました。メールをご確認ください。');
            
            // 入力欄をクリア
            if (emailInput) emailInput.value = '';
            
            console.log('[Auth] パスワードリセットメール送信:', email);
            
            // 3秒後にモーダルを閉じる
            setTimeout(() => {
                closeResetPasswordModal();
            }, 3000);
            
        } catch (err) {
            console.error('[Auth] パスワードリセット失敗:', err);
            showError(errorDiv, '予期しないエラーが発生しました');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'リセットメールを送信';
            }
        }
    }

    // ============================================
    // ヘルパー関数
    // ============================================

    /**
     * パスワード強度をチェック
     * @param {string} password - チェックするパスワード
     * @returns {string|null} エラーメッセージまたはnull
     */
    function validatePassword(password) {
        // 8文字以上
        if (password.length < 8) {
            return 'パスワードは8文字以上で入力してください';
        }
        
        // 大文字を含む
        if (!/[A-Z]/.test(password)) {
            return 'パスワードには大文字（A-Z）を含めてください';
        }
        
        // 小文字を含む
        if (!/[a-z]/.test(password)) {
            return 'パスワードには小文字（a-z）を含めてください';
        }
        
        // 数字を含む
        if (!/[0-9]/.test(password)) {
            return 'パスワードには数字（0-9）を含めてください';
        }
        
        return null; // バリデーション通過
    }

    /**
     * エラーメッセージを表示
     */
    function showError(element, message) {
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
        }
    }

    /**
     * エラーメッセージを非表示
     */
    function hideError(element) {
        if (element) {
            element.textContent = '';
            element.style.display = 'none';
        }
    }

    /**
     * 成功メッセージを表示
     */
    function showSuccess(element, message) {
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
        }
    }

    /**
     * 成功メッセージを非表示
     */
    function hideSuccess(element) {
        if (element) {
            element.textContent = '';
            element.style.display = 'none';
        }
    }

    /**
     * エラーメッセージを日本語に変換
     */
    function getErrorMessage(error) {
        const messages = {
            'Invalid login credentials': 'メールアドレスまたはパスワードが正しくありません',
            'Email not confirmed': 'メールアドレスが確認されていません。確認メールをご確認ください',
            'User already registered': 'このメールアドレスは既に登録されています',
            'Password should be at least 6 characters': 'パスワードは6文字以上で入力してください',
            'Unable to validate email address: invalid format': 'メールアドレスの形式が正しくありません',
            'Email rate limit exceeded': 'しばらく時間をおいてから再度お試しください'
        };

        return messages[error.message] || error.message || '認証エラーが発生しました';
    }

    /**
     * 現在のユーザー名を取得
     */
    function getUsername() {
        if (!currentUser) return null;
        return currentUser.user_metadata?.username 
            || currentUser.user_metadata?.display_name 
            || currentUser.email?.split('@')[0];
    }

    // ============================================
    // Public API
    // ============================================

    return {
        init: init,
        getCurrentUser: function() { return currentUser; },
        getUsername: getUsername,
        isLoggedIn: function() { return currentUser !== null; },
        showAuthModal: showAuthModal,
        hideAuthModal: hideAuthModal,
        logout: handleLogout,
        logoutWithConfirm: logoutWithConfirm,
        updateMyPageDisplay: updateMyPageDisplay,
        // アカウント情報変更
        openChangeUsernameModal: openChangeUsernameModal,
        closeChangeUsernameModal: closeChangeUsernameModal,
        changeUsername: changeUsername,
        openChangeEmailModal: openChangeEmailModal,
        closeChangeEmailModal: closeChangeEmailModal,
        changeEmail: changeEmail,
        openChangePasswordModal: openChangePasswordModal,
        closeChangePasswordModal: closeChangePasswordModal,
        changePassword: changePassword,
        // パスワードリセット
        openResetPasswordModal: openResetPasswordModal,
        closeResetPasswordModal: closeResetPasswordModal,
        sendResetPasswordEmail: sendResetPasswordEmail
    };

})();

// ============================================
// 自動初期化
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // supabaseClient.jsの初期化を待つ
    setTimeout(() => {
        AuthModule.init();
    }, 200);
});

// グローバルに公開
window.AuthModule = AuthModule;