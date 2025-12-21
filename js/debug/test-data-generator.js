/**
 * Trading Complete テストデータ生成スクリプト
 * 2025年1年分のお手本データ
 * 
 * 【使い方】
 * 1. Trading Completeを開く
 * 2. 開発者ツール（F12）のConsoleを開く
 * 3. このスクリプトをコピー＆ペーストして実行
 */

(function() {
    'use strict';
    
    console.log('🚀 テストデータ生成を開始します...');
    
    // ========================================
    // ヘルパー関数
    // ========================================
    
    function generateId() {
        return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    function randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }
    
    function randomInt(min, max) {
        return Math.floor(randomBetween(min, max + 1));
    }
    
    function formatDateTimeISO(date) {
        return date.toISOString().slice(0, 16);
    }
    
    function formatDateISO(date) {
        return date.toISOString().slice(0, 10);
    }
    
    // ========================================
    // 通貨ペア設定
    // ========================================
    
    const currencyPairs = [
        { pair: 'USD/JPY', pipValue: 0.01, avgRange: 50 },
        { pair: 'EUR/JPY', pipValue: 0.01, avgRange: 60 },
        { pair: 'GBP/JPY', pipValue: 0.01, avgRange: 80 },
        { pair: 'EUR/USD', pipValue: 0.0001, avgRange: 40 },
        { pair: 'GBP/USD', pipValue: 0.0001, avgRange: 60 },
        { pair: 'AUD/JPY', pipValue: 0.01, avgRange: 45 },
        { pair: 'AUD/USD', pipValue: 0.0001, avgRange: 35 },
        { pair: 'NZD/JPY', pipValue: 0.01, avgRange: 40 },
        { pair: 'CAD/JPY', pipValue: 0.01, avgRange: 45 },
        { pair: 'CHF/JPY', pipValue: 0.01, avgRange: 50 }
    ];
    
    // 上級者レベルの振り返りテンプレート
    const winReflections = [
        "週足レベルのサポートゾーンからの反発を4時間足で確認。1時間足でダブルボトム形成後、ネックライン抜けでエントリー。リスクリワード1:2.5を達成。環境認識→マルチタイムフレーム分析→エントリートリガーの3ステップを忠実に実行できた。",
        "日足の上昇トレンド中、4時間足での押し目形成を待機。フィボナッチ61.8%と200EMAが重なるゾーンで反発の兆候を確認。ピンバー形成後のエントリーで、ストップを直近安値下に設定。利確は前回高値手前で正確に実行。計画通りのトレード。",
        "ロンドンセッション開始前の値動きを観察。アジア時間のレンジを確認し、ブレイクアウト方向を予測。上位足のトレンド方向と一致するブレイクでエントリー。ボラティリティ拡大を活用し、R:R 1:3を達成。セッション特性を活かした好トレード。",
        "米雇用統計発表後の値動きを分析。初動の急騰後、リトレースを待ってからトレンドフォロー。感情的なエントリーを避け、プライスアクションの確認を徹底。結果として大きな波に乗ることができた。忍耐が報われたトレード。",
        "週初めの流動性が低い時間帯を避け、ロンドン・NY重複時間でのトレードに集中。4時間足のスイングハイ/ローを基準にした戦略が機能。エントリー根拠、損切り位置、利確目標の全てが明確だった。",
        "日足レベルの強いレジスタンスゾーンでの反転パターンを確認。4時間足でのダブルトップ形成後、ネックライン割れでショートエントリー。上位足の構造を理解した上でのトレードで、自信を持ってポジションを保持できた。",
        "マクロ経済環境（金利差拡大期待）と技術的分析の両面からエントリー判断。ファンダメンタルズがテクニカルを後押しする理想的な状況。ポジションサイズも適切に管理し、リスク1%ルールを厳守。",
        "VIX上昇局面でのリスクオフ相場を予測。JPYクロスの下落を狙ったトレード。市場全体のセンチメントを読み取り、相関関係を活用。複数の根拠が重なった高確率トレードとなった。",
        "前日の急落後、オーバーシュートからの反発を狙ったカウンタートレード。RSIダイバージェンスと価格帯別出来高の分析を組み合わせ。リスク管理を徹底しつつ、短期的な反発で利益確定。",
        "週足レベルでのトレンドライン+水平線の重複ゾーンを事前に特定。このレベルへの到達を待ち、4時間足でのリバーサルパターン形成後にエントリー。準備と忍耐の重要性を再確認。",
        "FOMC前のポジション調整を予測し、ドル安方向へのポジション構築。イベント通過後のボラティリティを活用して利確。経済指標カレンダーの管理が奏功。",
        "複数通貨ペアの相関分析から、EUR/USDとGBP/USDの乖離を発見。GBP/USDの相対的な弱さを利用したショート戦略。クロスカレンシー分析の重要性を実感。",
        "日足の長期移動平均線（200EMA）がサポートとして機能する局面。テクニカル指標とプライスアクションの整合性を確認してからエントリー。複数の根拠が揃うまで待つ姿勢が功を奏した。",
        "アジア時間のレンジ相場からロンドン時間でのブレイクを狙った。事前にブレイクアウトレベルとストップ位置を設定。感情に左右されない機械的なエントリーを実行できた。",
        "週足のサポートゾーンへの2回目の接触を確認。過去の反発履歴と現在の値動きを照合し、高確率の反転ポイントと判断。歴史は完全には繰り返さないが、韻を踏むことを再確認。"
    ];
    
    const lossReflections = [
        "エントリー根拠は正しかったが、損切り位置が近すぎた。ボラティリティを考慮したATRベースのストップ設定が必要だった。同じセットアップでも、相場環境に応じて損切り幅を調整すべき。次回は1.5ATRを基準に設定する。",
        "上位足の環境認識を怠り、下位足のシグナルだけでエントリー。4時間足では明確な下降トレンドだったにもかかわらず、1時間足の反発サインだけで逆張りロング。マルチタイムフレーム分析の基本に立ち返る必要がある。",
        "経済指標発表前にポジションを保持していた判断ミス。NFP発表でストップを刈られた。重要指標前はポジション縮小またはノーポジが原則。カレンダーの確認を毎朝のルーティンに組み込む。",
        "利確を欲張りすぎた。当初の目標レベルで半分利確し、残りをトレールする予定だったが、全ポジション保持で結局損切り。計画は必ず実行する。途中変更は禁止とルールを再設定。",
        "感情的なリベンジトレード。前のトレードの損失を取り返そうとして、根拠の薄いエントリーを実行。結果は二重の損失。損失後は必ず30分のクールダウンタイムを設ける。",
        "レンジ相場でトレンドフォロー戦略を適用した判断ミス。相場環境の認識が不十分だった。トレード前に「今はトレンド相場か、レンジ相場か」を明確にするチェックリストを作成する。",
        "ポジションサイズが大きすぎた。損切りになった時の金額が精神的に許容できず、途中でストップを動かしてしまった。リスク1%ルールを厳守し、感情に影響されないサイズ管理を徹底する。",
        "週末を跨いでポジションを保持した結果、月曜のギャップで損切り。週末リスクを軽視していた。金曜日の市場終了前には必ずポジションを確認し、必要に応じてクローズする習慣をつける。",
        "テクニカル分析は正しかったが、ファンダメンタルズの急変（突発的なニュース）に対応できず。完全にコントロール外の要因だが、ポジションサイズを小さくしていれば影響は最小限だった。",
        "エントリータイミングが早すぎた。確認のローソク足を待たずに飛び乗りエントリー。FOMO（取り残される恐怖）に負けた。「待つ」こともトレードの一部。次のチャンスは必ず来る。",
        "複数の根拠を確認したつもりだったが、後から見返すと希望的観測が入っていた。自分に都合の良い解釈をしていた。トレードジャーナルでの振り返り時に第三者視点を意識する。",
        "ボラティリティが極端に低い相場でのトレード。スプレッドコストに見合わない小さな値動きで損切りになった。ATRが一定以下の相場ではトレードを見送るルールを追加する。",
        "損切りラインを決めていたにもかかわらず、「もう少しで反転するかも」と期待して損切りを遅らせた。結果、損失が2倍に拡大。ストップロスは必ず成行で即実行。例外なし。",
        "同時に複数ポジションを持ちすぎて、相関によるリスク集中が発生。EUR/USD、GBP/USD、AUD/USDの全てでロングポジションを持っていたため、USD急騰で全て損切り。ドルエクスポージャーの管理を強化する。",
        "深夜の薄商い時間帯でのトレード。スプレッド拡大と流動性低下に対応できず。東京・ロンドン・NY の3大セッション以外のトレードは原則禁止とする。"
    ];
    
    const brokers = ['DMM FX', 'GMOクリック証券', 'SBI FXトレード'];
    
    // ========================================
    // トレードデータ生成
    // ========================================
    
    function generateTrades() {
        const trades = [];
        const targetProfit = 3000000; // 300万円
        const winCount = 30;
        const lossCount = 20;
        const totalTrades = winCount + lossCount;
        
        // 利益配分を計算（勝ちトレードと負けトレードのバランス）
        const avgWinProfit = 150000; // 平均勝ち15万円
        const avgLossAmount = 60000;  // 平均負け6万円
        
        // 2025年の各月にトレードを分散
        const months2025 = [];
        for (let m = 0; m < 12; m++) {
            const tradesInMonth = Math.floor(totalTrades / 12) + (m < totalTrades % 12 ? 1 : 0);
            for (let i = 0; i < tradesInMonth; i++) {
                months2025.push(m);
            }
        }
        
        // シャッフル
        for (let i = months2025.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [months2025[i], months2025[j]] = [months2025[j], months2025[i]];
        }
        
        // 勝ち負けをランダムに配置
        const outcomes = [];
        for (let i = 0; i < winCount; i++) outcomes.push('win');
        for (let i = 0; i < lossCount; i++) outcomes.push('loss');
        
        // シャッフル
        for (let i = outcomes.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
        }
        
        let usedWinReflections = 0;
        let usedLossReflections = 0;
        
        for (let i = 0; i < totalTrades; i++) {
            const month = months2025[i];
            const isWin = outcomes[i] === 'win';
            
            // 日付生成
            const day = randomInt(1, 28);
            const hour = randomInt(9, 22);
            const minute = Math.floor(randomInt(0, 3)) * 15;
            
            const entryDate = new Date(2025, month, day, hour, minute);
            
            // 決済日（エントリーから数時間〜数日後）
            const holdingHours = isWin ? randomInt(2, 48) : randomInt(1, 24);
            const exitDate = new Date(entryDate.getTime() + holdingHours * 60 * 60 * 1000);
            
            // 通貨ペア選択
            const pairInfo = currencyPairs[randomInt(0, currencyPairs.length - 1)];
            
            // 方向
            const direction = Math.random() > 0.5 ? 'long' : 'short';
            
            // 価格設定
            let entryPrice, exitPrice, stopLoss, takeProfit;
            
            if (pairInfo.pair.includes('JPY')) {
                // JPYペア
                entryPrice = randomBetween(100, 180).toFixed(3);
                const pips = randomBetween(20, 80);
                
                if (direction === 'long') {
                    stopLoss = (parseFloat(entryPrice) - randomBetween(20, 40) * 0.01).toFixed(3);
                    takeProfit = (parseFloat(entryPrice) + randomBetween(40, 100) * 0.01).toFixed(3);
                    exitPrice = isWin 
                        ? (parseFloat(entryPrice) + randomBetween(30, 80) * 0.01).toFixed(3)
                        : (parseFloat(entryPrice) - randomBetween(15, 35) * 0.01).toFixed(3);
                } else {
                    stopLoss = (parseFloat(entryPrice) + randomBetween(20, 40) * 0.01).toFixed(3);
                    takeProfit = (parseFloat(entryPrice) - randomBetween(40, 100) * 0.01).toFixed(3);
                    exitPrice = isWin 
                        ? (parseFloat(entryPrice) - randomBetween(30, 80) * 0.01).toFixed(3)
                        : (parseFloat(entryPrice) + randomBetween(15, 35) * 0.01).toFixed(3);
                }
            } else {
                // 非JPYペア
                entryPrice = randomBetween(1.0, 1.5).toFixed(5);
                
                if (direction === 'long') {
                    stopLoss = (parseFloat(entryPrice) - randomBetween(20, 40) * 0.0001).toFixed(5);
                    takeProfit = (parseFloat(entryPrice) + randomBetween(40, 100) * 0.0001).toFixed(5);
                    exitPrice = isWin 
                        ? (parseFloat(entryPrice) + randomBetween(30, 80) * 0.0001).toFixed(5)
                        : (parseFloat(entryPrice) - randomBetween(15, 35) * 0.0001).toFixed(5);
                } else {
                    stopLoss = (parseFloat(entryPrice) + randomBetween(20, 40) * 0.0001).toFixed(5);
                    takeProfit = (parseFloat(entryPrice) - randomBetween(40, 100) * 0.0001).toFixed(5);
                    exitPrice = isWin 
                        ? (parseFloat(entryPrice) - randomBetween(30, 80) * 0.0001).toFixed(5)
                        : (parseFloat(entryPrice) + randomBetween(15, 35) * 0.0001).toFixed(5);
                }
            }
            
            // ロットサイズ
            const lotSize = [0.1, 0.2, 0.3, 0.5, 1.0][randomInt(0, 4)];
            
            // 損益計算
            let profitLoss;
            if (isWin) {
                profitLoss = randomBetween(avgWinProfit * 0.5, avgWinProfit * 1.8);
            } else {
                profitLoss = -randomBetween(avgLossAmount * 0.5, avgLossAmount * 1.5);
            }
            profitLoss = Math.round(profitLoss);
            
            const swap = randomInt(-500, 200);
            const commission = -Math.round(lotSize * randomBetween(50, 150));
            const netProfit = profitLoss + swap + commission;
            
            // 振り返り選択
            let reflection;
            if (isWin) {
                reflection = winReflections[usedWinReflections % winReflections.length];
                usedWinReflections++;
            } else {
                reflection = lossReflections[usedLossReflections % lossReflections.length];
                usedLossReflections++;
            }
            
            // シナリオ生成
            const scenarios = [
                `${pairInfo.pair}の4時間足で${direction === 'long' ? '上昇' : '下降'}トレンドを確認。押し目/戻りを待ってエントリー。`,
                `日足のサポート/レジスタンスレベルからの反発を狙ったトレード。マルチタイムフレーム分析で方向性を確認。`,
                `ロンドンセッション開始時のブレイクアウト戦略。アジアレンジを基準にエントリーポイントを設定。`,
                `週足レベルの重要なフィボナッチレベルでの反転を期待。複数の根拠が重なるポイントでエントリー。`,
                `経済指標発表後の方向性確認。初動を見送り、リトレース後にトレンド方向へエントリー。`
            ];
            
            // pips計算
            let exitPips;
            if (pairInfo.pair.includes('JPY')) {
                exitPips = direction === 'long' 
                    ? (parseFloat(exitPrice) - parseFloat(entryPrice)) * 100
                    : (parseFloat(entryPrice) - parseFloat(exitPrice)) * 100;
            } else {
                exitPips = direction === 'long' 
                    ? (parseFloat(exitPrice) - parseFloat(entryPrice)) * 10000
                    : (parseFloat(entryPrice) - parseFloat(exitPrice)) * 10000;
            }
            exitPips = Math.round(exitPips * 10) / 10;
            
            // エントリー根拠のテンプレート
            const entryReasons = [
                "4時間足で明確なトレンドを確認。1時間足のプルバック後、15分足でエントリーシグナル発生。",
                "日足のサポートライン+200EMAの重複ゾーン。4時間足でピンバー形成を確認。",
                "週足レベルのフィボナッチ61.8%リトレースメント。複数時間軸での収束を確認。",
                "ロンドンセッション開始時のブレイクアウト。アジアレンジの高値/安値を基準に設定。",
                "経済指標発表後の方向性確認。初動を見送り、リトレース後にエントリー。"
            ];
            
            const slReasons = [
                "直近スイングロー/ハイの下/上に設定。1.5ATR分のバッファを確保。",
                "明確な構造転換ポイントの外側。ここを抜けたらシナリオ崩壊と判断。",
                "フィボナッチ78.6%の外側。これ以上の逆行は想定シナリオの否定。",
                "レンジの反対側端。ブレイクが失敗した場合の最大損失を限定。",
                "ボラティリティ考慮のATRベース。通常の値動きでは刈られない位置。"
            ];
            
            const tpReasons = [
                "次の主要レジスタンス/サポートレベル。過去に複数回反応した実績あり。",
                "リスクリワード1:2.5を確保。フィボナッチエクステンション161.8%と一致。",
                "週足レベルの構造的なターゲット。複数の根拠が重なるゾーン。",
                "前回高値/安値付近。利食いが入りやすいレベルとして認識。",
                "移動平均線の収束ゾーン。ここで一旦の利確が妥当と判断。"
            ];
            
            const trade = {
                id: generateId(),
                pair: pairInfo.pair,
                direction: direction,
                entryTime: formatDateTimeISO(entryDate),
                entryPrice: parseFloat(entryPrice),
                lotSize: lotSize,
                stopLoss: parseFloat(stopLoss),
                takeProfit: parseFloat(takeProfit),
                scenario: scenarios[randomInt(0, scenarios.length - 1)],
                status: 'closed',
                holdingStatus: 'closed',
                broker: brokers[randomInt(0, brokers.length - 1)],
                timestamp: entryDate.toISOString(),
                reasons: [
                    entryReasons[randomInt(0, entryReasons.length - 1)],
                    slReasons[randomInt(0, slReasons.length - 1)],
                    tpReasons[randomInt(0, tpReasons.length - 1)]
                ],
                exits: [
                    {
                        time: formatDateTimeISO(exitDate),
                        price: parseFloat(exitPrice),
                        lot: lotSize,
                        pips: exitPips
                    }
                ],
                yenProfitLoss: {
                    profitLoss: profitLoss,
                    swap: swap,
                    commission: commission,
                    netProfit: netProfit
                },
                reflection: reflection,
                date: formatDateISO(entryDate),
                chartImages: [],
                entryEmotion: ['😊 落ち着いている', '😐 普通', '😰 少し不安', '🔥 やる気満々'][randomInt(0, 3)]
            };
            
            trades.push(trade);
        }
        
        // 日付順にソート
        trades.sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
        
        return trades;
    }
    
    // ========================================
    // 経費データ生成
    // ========================================
    
    function generateExpenses() {
        const expenses = [];
        const targetTotal = 400000; // 40万円
        
        // カテゴリごとの配分
        const categoryAllocations = [
            { category: "通信費（ネット代）", monthly: 5000, months: 12 },
            { category: "VPS・クラウドサービス", monthly: 3000, months: 12 },
            { category: "電気代（按分）", monthly: 2500, months: 12 },
            { category: "PC・モニター", oneTime: 80000, count: 1 },
            { category: "PC周辺機器", oneTime: 15000, count: 2 },
            { category: "デスク・チェア", oneTime: 35000, count: 1 },
            { category: "事務用品", oneTime: 3000, count: 4 },
            { category: "書籍・教材費", oneTime: 2500, count: 8 },
            { category: "セミナー参加費", oneTime: 15000, count: 2 },
            { category: "オンラインサロン", monthly: 5000, months: 6 },
            { category: "情報配信サービス", monthly: 3000, months: 8 },
            { category: "新聞・雑誌", monthly: 2000, months: 6 },
            { category: "取引ツール", monthly: 2000, months: 10 },
            { category: "EA・インジケーター", oneTime: 8000, count: 2 },
            { category: "セキュリティソフト", oneTime: 5000, count: 1 },
            { category: "税理士報酬", oneTime: 30000, count: 1 }
        ];
        
        categoryAllocations.forEach(alloc => {
            if (alloc.monthly) {
                // 月額固定費
                for (let m = 0; m < alloc.months; m++) {
                    const randomMonth = randomInt(0, 11);
                    const randomDay = randomInt(1, 28);
                    const date = new Date(2025, randomMonth, randomDay);
                    
                    expenses.push({
                        id: generateId(),
                        date: formatDateISO(date),
                        category: alloc.category,
                        amount: alloc.monthly + randomInt(-500, 500),
                        description: `${alloc.category} ${randomMonth + 1}月分`,
                        taxYear: 2025
                    });
                }
            } else if (alloc.oneTime) {
                // 一回払い
                for (let i = 0; i < alloc.count; i++) {
                    const randomMonth = randomInt(0, 11);
                    const randomDay = randomInt(1, 28);
                    const date = new Date(2025, randomMonth, randomDay);
                    
                    const descriptions = {
                        "PC・モニター": ["MacBook Pro 購入", "27インチ4Kモニター購入", "トレーディング用ワークステーション"],
                        "PC周辺機器": ["ワイヤレスマウス購入", "メカニカルキーボード購入", "USB-Cハブ購入", "外付けSSD購入"],
                        "デスク・チェア": ["エルゴノミクスチェア購入", "昇降デスク購入", "モニターアーム購入"],
                        "事務用品": ["文房具購入", "プリンター用紙", "ファイル・バインダー"],
                        "書籍・教材費": ["「ゾーン相場心理学入門」購入", "テクニカル分析の書籍", "マーケットの魔術師", "ファンダメンタル分析入門", "FXトレード実践マニュアル"],
                        "セミナー参加費": ["オンライントレードセミナー参加", "投資戦略ワークショップ参加"],
                        "EA・インジケーター": ["MT4カスタムインジケーター購入", "自動売買EA購入"],
                        "セキュリティソフト": ["ウイルス対策ソフト年間ライセンス"],
                        "税理士報酬": ["確定申告相談料", "税務アドバイス費用"]
                    };
                    
                    const descList = descriptions[alloc.category] || [`${alloc.category}関連支出`];
                    
                    expenses.push({
                        id: generateId(),
                        date: formatDateISO(date),
                        category: alloc.category,
                        amount: Math.round(alloc.oneTime * randomBetween(0.8, 1.2)),
                        description: descList[i % descList.length],
                        taxYear: 2025
                    });
                }
            }
        });
        
        // 日付順にソート
        expenses.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        return expenses;
    }
    
    // ========================================
    // データ保存実行
    // ========================================
    
    // 既存データのバックアップ
    const existingTrades = localStorage.getItem('trades');
    const existingExpenses = localStorage.getItem('tc_expenses');
    
    if (existingTrades || existingExpenses) {
        const confirmOverwrite = confirm(
            '⚠️ 既存のデータが見つかりました。\n\n' +
            '「OK」: 既存データを上書きしてテストデータを投入\n' +
            '「キャンセル」: 操作を中止\n\n' +
            '※ 既存データはバックアップされます'
        );
        
        if (!confirmOverwrite) {
            console.log('❌ 操作がキャンセルされました');
            return;
        }
        
        // バックアップ
        if (existingTrades) {
            localStorage.setItem('trades_backup_' + Date.now(), existingTrades);
            console.log('📦 既存トレードデータをバックアップしました');
        }
        if (existingExpenses) {
            localStorage.setItem('tc_expenses_backup_' + Date.now(), existingExpenses);
            console.log('📦 既存経費データをバックアップしました');
        }
    }
    
    // データ生成
    const trades = generateTrades();
    const expenses = generateExpenses();
    
    // 統計計算
    let totalProfit = 0;
    let winCount = 0;
    let lossCount = 0;
    
    trades.forEach(t => {
        if (t.yenProfitLoss && t.yenProfitLoss.netProfit) {
            totalProfit += t.yenProfitLoss.netProfit;
            if (t.yenProfitLoss.netProfit > 0) winCount++;
            else lossCount++;
        }
    });
    
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    
    // 保存
    localStorage.setItem('trades', JSON.stringify(trades));
    localStorage.setItem('tc_expenses', JSON.stringify(expenses));
    
    // グローバル変数も更新
    if (window.trades !== undefined) {
        window.trades = trades;
    }
    if (window.TradeManager) {
        window.TradeManager.getInstance()._trades = trades;
    }
    
    // 結果表示
    console.log('');
    console.log('✅ テストデータの投入が完了しました！');
    console.log('');
    console.log('📊 トレードデータ統計:');
    console.log(`   総トレード数: ${trades.length}件`);
    console.log(`   勝ちトレード: ${winCount}件`);
    console.log(`   負けトレード: ${lossCount}件`);
    console.log(`   勝率: ${((winCount / trades.length) * 100).toFixed(1)}%`);
    console.log(`   年間純損益: ¥${totalProfit.toLocaleString()}`);
    console.log('');
    console.log('💰 経費データ統計:');
    console.log(`   経費件数: ${expenses.length}件`);
    console.log(`   経費合計: ¥${totalExpenses.toLocaleString()}`);
    console.log('');
    console.log('📈 課税対象所得（概算）:');
    console.log(`   ¥${(totalProfit - totalExpenses).toLocaleString()}`);
    console.log('');
    console.log('🔄 ページを再読み込みしてデータを反映してください');
    console.log('');
    
    // UI更新のイベント発火
    if (window.eventBus) {
        window.eventBus.emit('trades:updated');
        window.eventBus.emit('expenses:updated');
    }
    
    alert(
        '✅ テストデータの投入が完了しました！\n\n' +
        '【トレード】\n' +
        `・総数: ${trades.length}件\n` +
        `・勝率: ${((winCount / trades.length) * 100).toFixed(1)}%\n` +
        `・純損益: ¥${totalProfit.toLocaleString()}\n\n` +
        '【経費】\n' +
        `・件数: ${expenses.length}件\n` +
        `・合計: ¥${totalExpenses.toLocaleString()}\n\n` +
        'ページを再読み込みしてください。'
    );
    
})();