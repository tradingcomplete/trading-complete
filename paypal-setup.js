/**
 * PayPal Subscription Setup Script
 * Trading Complete - Sandbox用
 * 
 * 使い方:
 *   node paypal-setup.js
 * 
 * このスクリプトが作るもの:
 *   1. Product（商品）: Trading Complete Pro
 *   2. Plan（月額プラン）: ¥1,980/月
 *   3. Plan（年額プラン）: ¥19,800/年
 */

const PAYPAL_CLIENT_ID = 'ATf3cbiPiYlvHmCDHcEwc1R_6kQ1D1kDlgkFrvDFX5ifPI8jtZn3jHUDL4rIFhUmT4VZAWkwBpPkVz0X';
const PAYPAL_SECRET = 'EAhKXah3Kcq0PC6j5KN2y8s1gVZ9MICcf-AELOLk4bci_8i4nRHwuxFqZ1MjPHd3oZj4CZI80sAGDfLV';
const BASE_URL = 'https://api-m.sandbox.paypal.com';

// --- アクセストークン取得 ---
async function getAccessToken() {
    const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
    
    const response = await fetch(`${BASE_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    
    const data = await response.json();
    if (!data.access_token) {
        console.error('アクセストークン取得失敗:', data);
        process.exit(1);
    }
    console.log('--- アクセストークン取得成功 ---\n');
    return data.access_token;
}

// --- Product作成 ---
async function createProduct(accessToken) {
    console.log('--- Product（商品）を作成中... ---');
    
    const response = await fetch(`${BASE_URL}/v1/catalogs/products`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `TC-PRODUCT-${Date.now()}`,
        },
        body: JSON.stringify({
            name: 'Trading Complete Pro',
            description: 'Trade journal and performance analytics SaaS',
            type: 'SERVICE',
            category: 'SOFTWARE',
            home_url: 'https://tradingcomplete.com',
        }),
    });
    
    const data = await response.json();
    if (data.id) {
        console.log('Product作成成功!');
        console.log(`  Product ID: ${data.id}`);
        console.log(`  Name: ${data.name}\n`);
    } else {
        console.error('Product作成失敗:', JSON.stringify(data, null, 2));
        process.exit(1);
    }
    return data.id;
}

// --- Plan作成 ---
async function createPlan(accessToken, productId, planName, amount, intervalUnit, intervalCount) {
    console.log(`--- Plan（${planName}）を作成中... ---`);
    
    const response = await fetch(`${BASE_URL}/v1/billing/plans`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `TC-PLAN-${intervalUnit}-${Date.now()}`,
        },
        body: JSON.stringify({
            product_id: productId,
            name: planName,
            description: `Trading Complete ${planName}`,
            billing_cycles: [
                {
                    frequency: {
                        interval_unit: intervalUnit,
                        interval_count: intervalCount,
                    },
                    tenure_type: 'REGULAR',
                    sequence: 1,
                    total_cycles: 0, // 0 = 無期限（解約するまで継続）
                    pricing_scheme: {
                        fixed_price: {
                            value: amount,
                            currency_code: 'JPY',
                        },
                    },
                },
            ],
            payment_preferences: {
                auto_bill_outstanding: true,
                payment_failure_threshold: 3,
                setup_fee: {
                    value: '0',
                    currency_code: 'JPY',
                },
                setup_fee_failure_action: 'CONTINUE',
            },
        }),
    });
    
    const data = await response.json();
    if (data.id) {
        console.log(`Plan作成成功!`);
        console.log(`  Plan ID: ${data.id}`);
        console.log(`  Name: ${data.name}`);
        console.log(`  Status: ${data.status}\n`);
    } else {
        console.error('Plan作成失敗:', JSON.stringify(data, null, 2));
    }
    return data.id;
}

// --- メイン実行 ---
async function main() {
    console.log('========================================');
    console.log('  PayPal Subscription Setup');
    console.log('  Trading Complete - Sandbox');
    console.log('========================================\n');
    
    // 1. アクセストークン取得
    const accessToken = await getAccessToken();
    
    // 2. Product作成
    const productId = await createProduct(accessToken);
    
    // 3. 月額プラン作成（¥1,980/月）
    const monthlyPlanId = await createPlan(
        accessToken,
        productId,
        'Pro Monthly',
        '1980',
        'MONTH',
        1
    );
    
    // 4. 年額プラン作成（¥19,800/年）
    const yearlyPlanId = await createPlan(
        accessToken,
        productId,
        'Pro Yearly',
        '19800',
        'YEAR',
        1
    );
    
    // 5. 結果まとめ
    console.log('========================================');
    console.log('  セットアップ完了!');
    console.log('========================================');
    console.log('');
    console.log('以下のIDをメモしてください（実装で使います）:');
    console.log('');
    console.log(`  Product ID:      ${productId}`);
    console.log(`  Monthly Plan ID: ${monthlyPlanId}`);
    console.log(`  Yearly Plan ID:  ${yearlyPlanId}`);
    console.log(`  Client ID:       ${PAYPAL_CLIENT_ID}`);
    console.log('');
    console.log('次のステップ: PaymentModule.jsにPayPal対応を追加します');
    console.log('========================================');
}

main().catch(console.error);
