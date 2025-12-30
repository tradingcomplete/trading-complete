/**
 * AuthModule - 認証管理モジュール
 * 
 * Supabaseを使用したユーザー認証を管理
 * - ログイン / 登録 / ログアウト
 * - 認証状態の監視
 * - 認証モーダルの制御
 * - セッションタイムアウト監視（24時間）
 * 
 * @version 1.1.0
 * @date 2025-12-29
 * @changelog
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
    let sessionExpiredModal = null;
    let isInitialized = false;
    
    // セッション監視用
    let sessionCheckInterval = null;
    let loginTimestamp = null;
    const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24時間（ミリ秒）
    const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5分ごとにチェック
    const SESSION_STORAGE_KEY = 'tc_session_login_time';

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
        sessionExpiredModal = document.getElementById('sessionExpiredModal');
        
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
        
        // セッション切れモーダルのログインボタン
        const sessionExpiredLoginBtn = document.getElementById('sessionExpiredLoginBtn');
        if (sessionExpiredLoginBtn) {
            sessionExpiredLoginBtn.addEventListener('click', () => {
                hideSessionExpiredModal();
                showAuthModal();
            });
        }
    }

    /**
     * 認証状態の変更を監視
     */
    function setupAuthStateListener() {
        const supabase = getSupabase();
        if (!supabase) return;

        supabase.auth.onAuthStateChange((event, session) => {
            console.log('[Auth] 認証状態変更:', event);
            
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
    // セッション監視
    // ============================================

    /**
     * セッション監視を開始
     */
    function startSessionMonitor() {
        // 既存のインターバルをクリア
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
        }
        
        // ログイン時刻を記録
        loginTimestamp = Date.now();
        localStorage.setItem(SESSION_STORAGE_KEY, loginTimestamp.toString());
        
        console.log('[Auth] セッション監視開始（24時間タイムアウト）');
        
        // 定期的にセッションをチェック
        sessionCheckInterval = setInterval(checkSessionTimeout, SESSION_CHECK_INTERVAL_MS);
    }

    /**
     * セッション監視を停止
     */
    function stopSessionMonitor() {
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
            sessionCheckInterval = null;
        }
        loginTimestamp = null;
        localStorage.removeItem(SESSION_STORAGE_KEY);
        console.log('[Auth] セッション監視停止');
    }

    /**
     * セッションタイムアウトをチェック
     */
    function checkSessionTimeout() {
        // ログイン時刻を取得（メモリまたはlocalStorageから）
        const storedTimestamp = loginTimestamp || parseInt(localStorage.getItem(SESSION_STORAGE_KEY), 10);
        
        if (!storedTimestamp) {
            console.log('[Auth] ログイン時刻が不明です');
            return;
        }
        
        const elapsedMs = Date.now() - storedTimestamp;
        const remainingMs = SESSION_TIMEOUT_MS - elapsedMs;
        
        // デバッグログ（開発環境のみ）
        if (isDevelopment()) {
            const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
            const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
            console.log(`[Auth] セッション残り時間: ${remainingHours}時間${remainingMinutes}分`);
        }
        
        // タイムアウト
        if (elapsedMs >= SESSION_TIMEOUT_MS) {
            console.log('[Auth] セッションタイムアウト（24時間経過）');
            handleSessionExpired();
        }
        // 残り30分で警告（オプション - 将来実装用）
        // else if (remainingMs <= 30 * 60 * 1000 && remainingMs > 29 * 60 * 1000) {
        //     console.log('[Auth] セッション残り30分');
        // }
    }

    /**
     * セッション切れ時の処理
     */
    async function handleSessionExpired() {
        // 監視を停止
        stopSessionMonitor();
        
        // ログアウト処理
        const supabase = getSupabase();
        if (supabase) {
            try {
                await supabase.auth.signOut();
            } catch (err) {
                logError(err, 'セッション切れログアウト');
            }
        }
        
        currentUser = null;
        
        // セッション切れモーダルを表示
        showSessionExpiredModal();
        
        // EventBusで通知
        if (window.eventBus) {
            window.eventBus.emit('auth:sessionExpired');
        }
    }

    /**
     * 開発環境かどうかをチェック
     */
    function isDevelopment() {
        return location.hostname === 'localhost' || 
               location.hostname === '127.0.0.1' ||
               location.hostname.includes('192.168.');
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
                logError(error, 'セッション確認');
                return;
            }

            if (session) {
                currentUser = session.user;
                console.log('[Auth] ログイン中:', currentUser.email);
                
                // 既存のログイン時刻を復元、またはセッション開始時刻を使用
                const storedTimestamp = localStorage.getItem(SESSION_STORAGE_KEY);
                if (storedTimestamp) {
                    loginTimestamp = parseInt(storedTimestamp, 10);
                    // タイムアウトチェック
                    if (Date.now() - loginTimestamp >= SESSION_TIMEOUT_MS) {
                        console.log('[Auth] 保存されたセッションがタイムアウト');
                        handleSessionExpired();
                        return;
                    }
                } else {
                    // セッション作成時刻を使用
                    loginTimestamp = new Date(session.created_at || Date.now()).getTime();
                    localStorage.setItem(SESSION_STORAGE_KEY, loginTimestamp.toString());
                }
                
                onLoginSuccess();
            } else {
                console.log('[Auth] 未ログイン');
                showAuthModal();
            }
        } catch (err) {
            logError(err, 'セッション確認');
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
                logError(error, 'ログイン');
                showError(errorDiv, getErrorMessage(error));
                submitBtn.disabled = false;
                submitBtn.textContent = 'ログイン';
                return;
            }

            console.log('[Auth] ログイン成功:', data.user.email);
            // onAuthStateChangeで処理される

        } catch (err) {
            logError(err, 'ログイン');
            showError(errorDiv, getSecureErrorMessage(err));
            submitBtn.disabled = false;
            submitBtn.textContent = 'ログイン';
        }
    }

    /**
     * 新規登録処理
     */
    async function handleRegister(e) {
        e.preventDefault();
        
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
                password: password
            });

            if (error) {
                logError(error, '登録');
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
            logError(err, '登録');
            showError(errorDiv, getSecureErrorMessage(err));
            submitBtn.disabled = false;
            submitBtn.textContent = '新規登録';
        }
    }

    /**
     * ログアウト処理
     */
    async function handleLogout() {
        const supabase = getSupabase();
        if (!supabase) return;

        try {
            // セッション監視を停止
            stopSessionMonitor();
            
            const { error } = await supabase.auth.signOut();
            
            if (error) {
                logError(error, 'ログアウト');
                return;
            }

            console.log('[Auth] ログアウト成功');
            // onAuthStateChangeで処理される

        } catch (err) {
            logError(err, 'ログアウト');
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
     * セッション切れモーダルを表示
     */
    function showSessionExpiredModal() {
        if (sessionExpiredModal) {
            sessionExpiredModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        } else {
            // モーダルがない場合は認証モーダルを表示
            showAuthModal();
            // トースト通知
            if (typeof showToast === 'function') {
                showToast('セッションが切れました。再度ログインしてください。', 'warning');
            }
        }
    }

    /**
     * セッション切れモーダルを非表示
     */
    function hideSessionExpiredModal() {
        if (sessionExpiredModal) {
            sessionExpiredModal.style.display = 'none';
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
        hideSessionExpiredModal();
        updateUserDisplay();
        
        // セッション監視を開始
        startSessionMonitor();
        
        // EventBusで通知
        if (window.eventBus) {
            window.eventBus.emit('auth:login', { user: currentUser });
        }
    }

    /**
     * ログアウト時の処理
     */
    function onLogout() {
        // セッション監視を停止
        stopSessionMonitor();
        
        showAuthModal();
        updateUserDisplay();
        
        // EventBusで通知
        if (window.eventBus) {
            window.eventBus.emit('auth:logout');
        }
    }

    /**
     * ユーザー表示を更新
     */
    function updateUserDisplay() {
        const userEmail = document.getElementById('user-email');
        const logoutBtn = document.getElementById('logout-btn');

        if (currentUser) {
            if (userEmail) userEmail.textContent = currentUser.email;
            if (logoutBtn) logoutBtn.style.display = 'block';
        } else {
            if (userEmail) userEmail.textContent = '';
            if (logoutBtn) logoutBtn.style.display = 'none';
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
     * SecureErrorを使用してエラーメッセージを取得
     */
    function getSecureErrorMessage(error) {
        if (typeof SecureError !== 'undefined') {
            return SecureError.toUserMessage(error);
        }
        return 'エラーが発生しました';
    }

    /**
     * エラーをログ出力（SecureError統合）
     */
    function logError(error, context) {
        if (typeof SecureError !== 'undefined') {
            SecureError.log(error, `Auth:${context}`);
        } else {
            console.error(`[Auth:${context}]`, error);
        }
    }

    // ============================================
    // Public API
    // ============================================

    return {
        init: init,
        getCurrentUser: function() { return currentUser; },
        isLoggedIn: function() { return currentUser !== null; },
        showAuthModal: showAuthModal,
        hideAuthModal: hideAuthModal,
        showLoginModal: function() {
            hideSessionExpiredModal();
            showAuthModal();
        },
        logout: handleLogout,
        // セッション関連（デバッグ用）
        getSessionInfo: function() {
            return {
                loginTimestamp: loginTimestamp,
                remainingMs: loginTimestamp ? SESSION_TIMEOUT_MS - (Date.now() - loginTimestamp) : null
            };
        }
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