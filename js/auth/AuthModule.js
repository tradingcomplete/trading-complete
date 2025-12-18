/**
 * AuthModule - 認証管理モジュール
 * 
 * Supabaseを使用したユーザー認証を管理
 * - ログイン / 登録 / ログアウト
 * - 認証状態の監視
 * - 認証モーダルの制御
 * - ユーザー名の管理
 * 
 * @version 1.1.0
 * @date 2025-12-17
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
                    }
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
        updateMyPageDisplay: updateMyPageDisplay
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