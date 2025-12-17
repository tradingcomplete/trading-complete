/**
 * Supabase Client - Trading Complete
 * 
 * Supabaseへの接続を管理するクライアントファイル
 * 
 * 【設定方法】
 * 1. SUPABASE_URL と SUPABASE_ANON_KEY を自分の値に置き換えてください
 * 2. 値は Supabase Dashboard > Settings > API で確認できます
 * 
 * @version 1.0.0
 * @date 2025-12-17
 */

// ============================================
// ⚠️ 以下の2つの値を自分のSupabaseプロジェクトの値に置き換えてください
// ============================================

const SUPABASE_URL = 'https://apqerhksogpscdtktjwd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwcW1yaGtzb2dwc2NkdGt0andkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NjI3NTQsImV4cCI6MjA4MTUzODc1NH0.qiOpIYA-IZEOhZmn1z6v7YvlUK8QxIWAezbD7XiPU-4';

// ============================================
// Supabase Client 初期化
// ============================================

// Supabaseクライアントのインスタンス（グローバル）
let supabaseClient = null;

/**
 * Supabaseクライアントを初期化する
 * CDNから読み込んだsupabase-jsを使用
 */
function initSupabase() {
    // supabase-js がロードされているか確認
    if (typeof supabase === 'undefined') {
        console.error('[Supabase] supabase-js ライブラリが読み込まれていません');
        return null;
    }
    
    // API Keyが設定されているか確認
    if (SUPABASE_ANON_KEY === 'ここにAPI Key (anon public)を貼り付けてください') {
        console.error('[Supabase] SUPABASE_ANON_KEY が設定されていません');
        console.error('[Supabase] supabaseClient.js を開いて、API Keyを設定してください');
        return null;
    }
    
    // クライアント作成
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    console.log('[Supabase] クライアント初期化完了');
    console.log('[Supabase] Project URL:', SUPABASE_URL);
    
    return supabaseClient;
}

/**
 * Supabaseクライアントを取得する
 * @returns {Object} Supabaseクライアントインスタンス
 */
function getSupabase() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

/**
 * Supabase接続テスト
 * コンソールから testSupabaseConnection() で実行可能
 */
async function testSupabaseConnection() {
    console.log('[Supabase] 接続テスト開始...');
    
    const client = getSupabase();
    if (!client) {
        console.error('[Supabase] クライアントが初期化されていません');
        return false;
    }
    
    try {
        // 認証状態を確認（接続テスト）
        const { data, error } = await client.auth.getSession();
        
        if (error) {
            console.error('[Supabase] 接続エラー:', error.message);
            return false;
        }
        
        console.log('[Supabase] ✅ 接続成功！');
        console.log('[Supabase] セッション状態:', data.session ? 'ログイン中' : '未ログイン');
        return true;
        
    } catch (err) {
        console.error('[Supabase] 接続テスト失敗:', err);
        return false;
    }
}

// ============================================
// 自動初期化（DOMContentLoaded後）
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // 少し遅延させてsupabase-jsの読み込みを待つ
    setTimeout(() => {
        initSupabase();
    }, 100);
});

// ============================================
// グローバルに公開（デバッグ用）
// ============================================

window.getSupabase = getSupabase;
window.testSupabaseConnection = testSupabaseConnection;
