/**
 * CompanaFXAutoPost - marketAnalysis.gs
 * 市場分析（通貨強弱・トレンド・ニュース）
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 5）
 * 
 * 通貨強弱計算、トレンド検出、注目ペア選定、市場ニュース取得を担当。
 * buildPrompt_から呼び出され、投稿の主役ペア選定とデータ注入に使われる。
 * 
 * 主要な関数:
 *   detectHotPair_: 通貨強弱+トレンド+始値比から主役ペアを選定
 *   fetchMarketNews_: Gemini+GroundingでニュースTOP5を取得（1時間キャッシュ）
 *   calculateRateDirection_: 前回比をプロンプトに注入
 */


function calcCurrencyStrength_(pairChanges) {
  var scores = { USD: [], EUR: [], GBP: [], AUD: [], JPY: [] };
  var pairMap = {
    usdjpy: { base: 'USD', quote: 'JPY' },
    eurusd: { base: 'EUR', quote: 'USD' },
    gbpusd: { base: 'GBP', quote: 'USD' },
    eurjpy: { base: 'EUR', quote: 'JPY' },
    gbpjpy: { base: 'GBP', quote: 'JPY' },
    audjpy: { base: 'AUD', quote: 'JPY' },
    audusd: { base: 'AUD', quote: 'USD' }
  };
  var jpNames = { USD: '米ドル', EUR: 'ユーロ', GBP: 'ポンド', AUD: '豪ドル', JPY: '円' };
  
  for (var i = 0; i < pairChanges.length; i++) {
    var m = pairMap[pairChanges[i].key];
    if (!m) continue;
    scores[m.base].push(pairChanges[i].changePercent);
    scores[m.quote].push(-pairChanges[i].changePercent);
  }
  
  var result = [];
  var currencies = ['USD', 'EUR', 'GBP', 'AUD', 'JPY'];
  for (var c = 0; c < currencies.length; c++) {
    var arr = scores[currencies[c]];
    var avg = 0;
    if (arr.length > 0) {
      var sum = 0;
      for (var s = 0; s < arr.length; s++) sum += arr[s];
      avg = sum / arr.length;
    }
    result.push({
      currency: currencies[c],
      jpName: jpNames[currencies[c]],
      score: avg,
      direction: avg > 0.05 ? '強' : avg < -0.05 ? '弱' : '中立'
    });
  }
  
  result.sort(function(a, b) { return b.score - a.score; });
  return result;
}

/**
 * レートキャッシュから本日の始値（最初のレート）を取得する ★v5.5.1
 * 毎朝5:00のscheduleTodayPosts実行後、最初に取得されたレートを「本日始値」とする
 * @param {Spreadsheet} ss - スプレッドシートオブジェクト
 * @return {Object|null} {usdjpy: 156.20, eurusd: 1.0880, ...}
 */

/**
 * レートキャッシュから本日の始値（最初のレート）を取得する ★v5.5.1
 * 毎朝5:00のscheduleTodayPosts実行後、最初に取得されたレートを「本日始値」とする
 * @param {Spreadsheet} ss - スプレッドシートオブジェクト
 * @return {Object|null} {usdjpy: 156.20, eurusd: 1.0880, ...}
 */
function getTodayOpenRates_(ss) {
  try {
    var cacheSheet = ss.getSheetByName('レートキャッシュ');
    if (!cacheSheet || cacheSheet.getLastRow() < 2) return null;
    
    var numCols = 1 + CURRENCY_PAIRS.length + 2;
    var todayStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
    
    // 直近48行から今日の最初の行を探す（最大2日分）
    var lastRow = cacheSheet.getLastRow();
    var readRows = Math.min(48, lastRow - 1);
    var startRow = lastRow - readRows + 1;
    var data = cacheSheet.getRange(startRow, 1, readRows, numCols).getValues();
    
    var todayFirstRow = null;
    for (var i = 0; i < data.length; i++) {
      var dateVal = data[i][0];
      if (!dateVal) continue;
      
      var dateStr;
      if (dateVal instanceof Date) {
        dateStr = Utilities.formatDate(dateVal, 'Asia/Tokyo', 'yyyy/MM/dd');
      } else {
        dateStr = dateVal.toString().substring(0, 10);
      }
      
      if (dateStr === todayStr) {
        todayFirstRow = data[i];
        break; // 最初の1件を取得
      }
    }
    
    if (!todayFirstRow) {
      console.log('📌 本日始値: キャッシュに今日のデータなし');
      return null;
    }
    
    var openRates = {};
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var val = Number(todayFirstRow[1 + p]);
      if (val > CURRENCY_PAIRS[p].min && val < CURRENCY_PAIRS[p].max) {
        openRates[CURRENCY_PAIRS[p].key] = val;
      }
    }
    
    console.log('📌 本日始値取得成功: USD/JPY=' + (openRates.usdjpy || 'N/A'));
    return openRates;
    
  } catch (e) {
    console.log('⚠️ 本日始値取得エラー: ' + e.message);
    return null;
  }
}

/**
 * レートキャッシュから直近のトレンドを検出（1時間ごとのデータ）
 * @param {string} spreadsheetId
 * @return {Object|null} {pairs: {usdjpy: {direction, momentum, ...}}, hoursAnalyzed}
 */

/**
 * レートキャッシュから直近のトレンドを検出（1時間ごとのデータ）
 * @param {string} spreadsheetId
 * @return {Object|null} {pairs: {usdjpy: {direction, momentum, ...}}, hoursAnalyzed}
 */
function detectTrendFromCache_(spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var cacheSheet = ss.getSheetByName('レートキャッシュ');
    if (!cacheSheet || cacheSheet.getLastRow() < 4) return null;
    
    var numCacheCols = 1 + CURRENCY_PAIRS.length + 2;
    var lastRow = cacheSheet.getLastRow();
    var readRows = Math.min(8, lastRow - 1);
    var startRow = lastRow - readRows + 1;
    var data = cacheSheet.getRange(startRow, 1, readRows, numCacheCols).getValues();
    
    if (data.length < 3) return null;
    
    var jpNames = {
      usdjpy: 'ドル円', eurusd: 'ユーロドル', gbpusd: 'ポンドドル',
      eurjpy: 'ユーロ円', gbpjpy: 'ポンド円', audjpy: '豪ドル円', audusd: '豪ドル米ドル'
    };
    var trends = {};
    
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      var pair = CURRENCY_PAIRS[p];
      var colIndex = 1 + p;
      
      var entries = [];
      for (var i = 0; i < data.length; i++) {
        var val = Number(data[i][colIndex]);
        if (val > pair.min && val < pair.max) {
          entries.push({ time: data[i][0], rate: val });
        }
      }
      
      if (entries.length < 3) {
        trends[pair.key] = { direction: '不明', momentum: '', jpName: jpNames[pair.key] || pair.symbol };
        continue;
      }
      
      var oldest = entries[0].rate;
      var mid = entries[Math.floor(entries.length / 2)].rate;
      var latest = entries[entries.length - 1].rate;
      var totalChange = latest - oldest;
      var totalPct = (totalChange / oldest) * 100;
      
      // 方向の一貫性カウント
      var upCount = 0, downCount = 0;
      for (var j = 1; j < entries.length; j++) {
        if (entries[j].rate > entries[j - 1].rate) upCount++;
        else if (entries[j].rate < entries[j - 1].rate) downCount++;
      }
      var steps = entries.length - 1;
      
      var direction, momentum = '';
      if (Math.abs(totalPct) < 0.03) {
        direction = 'レンジ';
      } else if (totalChange > 0 && upCount > steps * 0.55) {
        direction = '上昇トレンド';
      } else if (totalChange < 0 && downCount > steps * 0.55) {
        direction = '下落トレンド';
      } else {
        direction = '方向感なし';
      }
      
      // 加速・減速判定
      if (direction.indexOf('トレンド') >= 0) {
        var firstHalf = Math.abs(mid - oldest);
        var secondHalf = Math.abs(latest - mid);
        if (secondHalf > firstHalf * 1.5) momentum = '加速中';
        else if (secondHalf < firstHalf * 0.5) momentum = '減速中';
        else momentum = '安定';
      }
      
      trends[pair.key] = {
        direction: direction,
        momentum: momentum,
        changePct: totalPct,
        oldest: oldest,
        latest: latest,
        hours: entries.length,
        jpName: jpNames[pair.key] || pair.symbol
      };
    }
    
    return { pairs: trends, hoursAnalyzed: data.length };
  } catch (e) {
    console.log('⚠️ トレンド検出エラー: ' + e.message);
    return null;
  }
}

/**
 * 市場分析（通貨強弱 + ペア変動率 + トレンド）を統合してプロンプト注入テキストを生成
 * @param {Object} rates - 現在のレート
 * @param {string} spreadsheetId - スプレッドシートID
 * @return {Object|null} {text, logSummary, hotPair, ...}
 */

/**
 * 市場分析（通貨強弱 + ペア変動率 + トレンド）を統合してプロンプト注入テキストを生成
 * @param {Object} rates - 現在のレート
 * @param {string} spreadsheetId - スプレッドシートID
 * @return {Object|null} {text, logSummary, hotPair, ...}
 */
function detectHotPair_(rates, spreadsheetId) {
  try {
    if (!rates) return null;
    
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var dailySheet = ss.getSheetByName('日次レート');
    if (!dailySheet || dailySheet.getLastRow() < 2) return null;
    
    var jpNames = {
      usdjpy: 'ドル円', eurusd: 'ユーロドル', gbpusd: 'ポンドドル',
      eurjpy: 'ユーロ円', gbpjpy: 'ポンド円', audjpy: '豪ドル円', audusd: '豪ドル米ドル'
    };
    
    // ===== Step 1: ペア変動率（昨日終値 vs 現在値）=====
    var numDailyCols = 1 + CURRENCY_PAIRS.length * 4 + 1;
    var lastRow = dailySheet.getLastRow();
    var lastData = dailySheet.getRange(lastRow, 1, 1, numDailyCols).getValues()[0];
    
    var pairChanges = [];
    for (var i = 0; i < CURRENCY_PAIRS.length; i++) {
      var pair = CURRENCY_PAIRS[i];
      var colBase = 1 + i * 4;
      var prevClose = Number(lastData[colBase + 3]);
      var current = Number(rates[pair.key]);
      if (!prevClose || !current || prevClose === 0) continue;
      
      var change = current - prevClose;
      var changePercent = (change / prevClose) * 100;
      var pips = pair.key.indexOf('jpy') >= 0 ? Math.abs(change) * 100 : Math.abs(change) * 10000;
      
      pairChanges.push({
        key: pair.key, symbol: pair.symbol, jpName: jpNames[pair.key] || pair.symbol,
        current: current, prevClose: prevClose, change: change,
        changePercent: changePercent, absPercent: Math.abs(changePercent), pips: pips,
        todayOpen: 0, todayChange: 0, todayChangePct: 0, todayPips: 0
      });
    }
    if (pairChanges.length === 0) return null;
    
    // ===== Step 1.5: 本日始値比（今日だけの値動き）★v5.5.1 =====
    var todayOpenRates = getTodayOpenRates_(ss);
    if (todayOpenRates) {
      for (var t = 0; t < pairChanges.length; t++) {
        var pc = pairChanges[t];
        var todayOpen = todayOpenRates[pc.key];
        if (todayOpen && todayOpen > 0) {
          pc.todayOpen = todayOpen;
          pc.todayChange = pc.current - todayOpen;
          pc.todayChangePct = (pc.todayChange / todayOpen) * 100;
          pc.todayPips = pc.key.indexOf('jpy') >= 0 ? Math.abs(pc.todayChange) * 100 : Math.abs(pc.todayChange) * 10000;
        }
      }
    }
    
    // ===== Step 2: 通貨強弱ランキング =====
    var csRanking = calcCurrencyStrength_(pairChanges);
    var strongest = csRanking[0];
    var weakest = csRanking[csRanking.length - 1];
    
    // 最強×最弱ペアを特定
    var bestPairKey = strongest.currency.toLowerCase() + weakest.currency.toLowerCase();
    // ペアキーの正引き・逆引き
    var bestPairKeyAlt = weakest.currency.toLowerCase() + strongest.currency.toLowerCase();
    var bestPair = null;
    for (var b = 0; b < pairChanges.length; b++) {
      if (pairChanges[b].key === bestPairKey || pairChanges[b].key === bestPairKeyAlt) {
        bestPair = pairChanges[b];
        break;
      }
    }
    
    // ===== Step 3: トレンド検出 =====
    var trendResult = detectTrendFromCache_(spreadsheetId);
    
    // ===== Step 4: ペア変動率ソート =====
    pairChanges.sort(function(a, b) { return b.absPercent - a.absPercent; });
    var hot = pairChanges[0];
    
    // ===== Step 5: 注入テキスト構築 =====
    var text = '【🔥市場分析（自動算出 - 投稿の主役選定に使え）】\n\n';
    
    // --- 通貨強弱 ---
    text += '■ 通貨の動き（昨日終値比・5通貨7ペアの簡易算出）\n';
    for (var r = 0; r < csRanking.length; r++) {
      var cs = csRanking[r];
      text += '  ' + (r + 1) + '位 ' + cs.currency + '（' + cs.jpName + '）';
      text += (cs.score >= 0 ? '+' : '') + cs.score.toFixed(2) + '%';
      text += '（' + cs.direction + '）\n';
    }
    text += '  → 買われている: ' + strongest.currency + '（' + strongest.jpName + '）';
    text += ' / 売られている: ' + weakest.currency + '（' + weakest.jpName + '）\n';
    var gapScore = strongest.score - weakest.score;
    if (bestPair) {
      text += '  → 注目ペア候補: ' + bestPair.symbol + '（強弱差 ' + gapScore.toFixed(2) + '%）\n';
    }
    text += '\n';
    
    // --- ペア変動率 + 本日値動き + トレンド統合 ---
    text += '■ ペア別状況\n';
    for (var p = 0; p < pairChanges.length; p++) {
      var pc = pairChanges[p];
      var dir = pc.change > 0 ? '↑' : pc.change < 0 ? '↓' : '→';
      text += '  ' + pc.symbol + '（' + pc.jpName + '）\n';
      text += '    昨日終値比: ' + dir;
      text += (pc.changePercent >= 0 ? '+' : '') + pc.changePercent.toFixed(2) + '%';
      text += ' / ' + pc.pips.toFixed(1) + 'pips\n';
      
      // ★v5.5.1: 本日始値比（今日だけの方向）
      if (pc.todayOpen > 0) {
        var todayDir = pc.todayChange > 0 ? '↑' : pc.todayChange < 0 ? '↓' : '→';
        text += '    ★本日の値動き: ' + todayDir;
        text += (pc.todayChangePct >= 0 ? '+' : '') + pc.todayChangePct.toFixed(2) + '%';
        text += ' / ' + pc.todayPips.toFixed(1) + 'pips';
        // 昨日と今日の方向が逆なら強調
        if ((pc.change > 0 && pc.todayChange < 0) || (pc.change < 0 && pc.todayChange > 0)) {
          text += ' ⚠️昨日と逆方向！';
        }
        text += '\n';
      }
      
      // トレンド情報を付加
      if (trendResult && trendResult.pairs[pc.key]) {
        var tr = trendResult.pairs[pc.key];
        if (tr.direction !== '不明') {
          text += '    短期トレンド（直近数時間）: ' + tr.direction;
          if (tr.momentum) text += '（' + tr.momentum + '）';
          text += '\n';
          
          // 日次変動と短期トレンドが矛盾する場合は注記
          var dailyUp = pc.change > 0;
          var trendUp = tr.direction === '上昇トレンド';
          var trendDown = tr.direction === '下落トレンド';
          if ((dailyUp && trendDown) || (!dailyUp && trendUp)) {
            text += '    ⚠️日次は' + (dailyUp ? '上昇' : '下落') + 'だが短期は' + tr.direction + '。';
            text += '転換の兆しか、一時的な調整か見極めが必要。\n';
          }
        }
      }
    }
    text += '\n';
    
    // --- 指示セクション ---
    text += '■ 投稿への指示\n';
    text += '・「本日の値動き」が投稿の基準。昨日終値比ではなく、今日どう動いているかを伝えること。\n';
    text += '  → 「昨日終値比+0.95%」でも「本日の値動き-0.30%」なら「今日は下がっている」が正しい。\n';
    text += '  → 昨日の上昇が今日も続いているように書くのはNG。\n';
    text += '・🔥注目ペア「' + hot.symbol + '（' + hot.jpName + '）」を主役候補として推奨。\n';
    text += '  → できるだけ「' + hot.jpName + '」を中心にストーリーを組み立てること。\n';
    text += '  → ただしニュースや相場状況的に他ペアが適切なら、そちらを主役にしてもよい。\n';
    text += '  → ★表現禁止★ 「今日一番動いている」「最も動いた」「一番注目すべき」は使うな。\n';
    text += '  → システムは7ペアしか見ていない。全市場の最強ペアであるかのように断言するな。\n';
    text += '  → OK: 「ユーロドルに注目しています」「ユーロドルがボラティリティのある展開」\n';
    text += '  → OK: 「今日はユーロドルが動いていますね」\n';
    text += '  → NG: 「今日一番動いているのはユーロドル」「最も注目すべきはユーロドル」\n';
    text += '・市場ニュースTOP5が注入されている場合、ニュースを題材にすること。\n';
    text += '  → 要人の名前、具体的な数字、政策内容を入れる。一般論は避ける。\n';
    text += '・「⚠️昨日と逆方向」のペアがある場合、転換を正確に伝えること。\n';
    if (trendResult) {
      var hotTrend = trendResult.pairs[hot.key];
      if (hotTrend && hotTrend.direction.indexOf('トレンド') >= 0) {
        text += '・' + hot.symbol + 'の短期トレンドは「' + hotTrend.direction + '」。日次変動方向もあわせて正確に伝えよ。\n';
      }
    }
    text += '・全ペア0.1%未満の低ボラ日はドル円でよい。3ペア以上のレート並べは禁止。\n';
    text += '・★絶対禁止★ 通貨の動きデータと矛盾する記述をするな。\n';
    text += '  → 売られている通貨を「買いの流れ」と書くのは事実に反する。\n';
    text += '  → 買われている通貨を「売られている」と書くのは事実に反する。\n';
    text += '  → ニュースの「見通し」とデータの「事実」が矛盾する場合、データが正しい。\n';
    text += '  → 例: USDが売られているのに「ドル買いの流れ」はNG。「ドルは軟調」「ドルは売られている」が適切。\n';
    text += '  → ニュースで利下げ否定があっても、実際にUSDが売られているなら「発言にもかかわらずドルは軟調」と書け。\n\n';
    
    // ===== ログ =====
    var logSummary = '💪通貨強弱: ' + csRanking.map(function(c) { 
      return c.currency + '(' + (c.score >= 0 ? '+' : '') + c.score.toFixed(2) + '%)'; 
    }).join(' > ');
    logSummary += ' | 🔥主役: ' + hot.symbol + '(' + hot.jpName + ') 日次';
    logSummary += (hot.change >= 0 ? '+' : '') + hot.changePercent.toFixed(2) + '%';
    if (hot.todayOpen > 0) {
      logSummary += ' / 本日';
      logSummary += (hot.todayChange >= 0 ? '+' : '') + hot.todayChangePct.toFixed(2) + '%';
    }
    if (trendResult && trendResult.pairs[hot.key]) {
      var hotTr = trendResult.pairs[hot.key];
      logSummary += ' / 短期:' + hotTr.direction;
      if (hotTr.momentum) logSummary += '(' + hotTr.momentum + ')';
    }
    
    console.log(logSummary);
    
    return {
      hotPair: hot,
      allPairs: pairChanges,
      csRanking: csRanking,
      strongest: strongest,
      weakest: weakest,
      trendResult: trendResult,
      text: text,
      logSummary: logSummary
    };
    
  } catch (e) {
    console.log('⚠️ 市場分析エラー（スキップ）: ' + e.message);
    return null;
  }
}

// ===== 市場ニュースTOP5自動取得 ★v5.5 Phase 7 =====
/**
 * Gemini + Google Search Grounding で今日の市場ニュースTOP5を取得
 * 1時間キャッシュ（16タイプ生成中は1回のAPI呼び出しで済む）
 * 
 * @param {Object} keys - APIキー群
 * @return {string} プロンプト注入用ニューステキスト（取得失敗時は空文字）
 */

// ===== 市場ニュースTOP5自動取得 ★v5.5 Phase 7 =====
/**
 * Gemini + Google Search Grounding で今日の市場ニュースTOP5を取得
 * 1時間キャッシュ（16タイプ生成中は1回のAPI呼び出しで済む）
 * 
 * @param {Object} keys - APIキー群
 * @return {string} プロンプト注入用ニューステキスト（取得失敗時は空文字）
 */
function fetchMarketNews_(keys) {
  try {
    // 1時間キャッシュ
    var cache = CacheService.getScriptCache();
    var cached = cache.get('market_news_v3');
    if (cached) {
      console.log('📰 ニュースキャッシュ使用');
      return cached;
    }
    
    var now = new Date();
    var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年M月d日');
    var isMonday = (now.getDay() === 1); // ★v5.6: 月曜日判定
    
    var prompt = '金融市場のニュースアナリストとして、' + dateStr + '現在のFX・株式・金利市場で\n';
    prompt += '最も注目されているニュースTOP5をGoogle検索で調べて報告してください。\n\n';
    
    // ★v5.6: 月曜日は週末の世界情勢を重点的に検索
    if (isMonday) {
      prompt += '【重要: 本日は月曜日（週明け）】\n';
      prompt += '土日は市場が閉まっていたが、世界情勢は動き続けている。\n';
      prompt += '金曜NYクローズ後〜月曜アジアオープンまでの約60時間に起きた出来事を重点的に検索せよ。\n';
      prompt += '特に以下を重点検索:\n';
      prompt += '・週末の要人発言（FRB理事、各国財務大臣、中央銀行総裁のインタビュー・講演）\n';
      prompt += '・地政学リスクの進展（戦争、制裁、テロ、外交交渉、選挙結果）\n';
      prompt += '・政策発表・関税発動（週末に発表されることがある）\n';
      prompt += '・中東/アジア市場の先行反応（日曜夕方〜月曜早朝のオセアニア・中東市場）\n';
      prompt += '・仮想通貨市場の大幅変動（24h市場のためセンチメント先行指標になる）\n';
      prompt += '・自然災害・パンデミック関連\n';
      prompt += '→ 週末に何も起きなかった場合は「大きなサプライズなし」と明記し、金曜の流れの延長を分析せよ。\n\n';
    }
    
    prompt += '【検索すべきソース（優先順）】\n';
    prompt += '・bloomberg.com / bloomberg.co.jp（国際金融ニュース。最優先で検索せよ）\n';
    prompt += '・Reuters / ロイター日本語版\n';
    prompt += '・日経新聞（nikkei.com）\n';
    prompt += '・各国中央銀行（FRB/日銀/ECB/BOE/RBA）の発言・声明\n';
    prompt += '・地政学リスク（戦争、制裁、関税）\n';
    prompt += '・株式市場（S&P500、日経平均、DAX）の急変動\n';
    prompt += '・金利市場（米10年債利回り、日本国債）\n';
    prompt += '・商品市場（原油、金）\n\n';
    
    prompt += '【出力形式】各項目を以下の形式で5件。余計な説明文は不要。\n';
    prompt += '番号. [カテゴリ] ヘッドライン\n';
    prompt += '   ソース: 情報元のメディア名（Bloomberg / Reuters / 日経 等。不明なら省略）\n';
    prompt += '   日付: YYYY/MM/DD（このニュースがいつのものか。検索結果の日付を正確に記載）\n';
    prompt += '   影響: FX市場への具体的影響（どの通貨が買われ/売られるか）\n';
    prompt += '   背景: このニュースが「なぜ今注目されているか」の文脈。過去の類似事例があれば「前回は〇〇年の〇〇以来」と記載。このまま進むとどうなるかのシナリオも1文で（冷静に・煽らず）。\n';
    prompt += '   生活影響: このニュースが日本の一般消費者にどう影響するか（旅行代、ガソリン代、食品価格、住宅ローン金利、電気代、輸入品の値段など）。影響がなければ省略。\n';
    prompt += '   織り込み度: 高/中/低（市場がどの程度反応済みか）\n';
    prompt += '   関連: 株価・金利・商品への波及効果\n\n';
    
    prompt += '【カテゴリ選択肢】\n';
    prompt += '要人発言 / 金融政策 / 地政学 / 経済指標結果 / 株式市場 / 商品市場 / 貿易・関税 / 政治\n\n';
    
    prompt += '【ルール】\n';
    if (isMonday) {
      prompt += '・金曜NYクローズ後〜現在までのニュースを重点的に検索。古くても金曜終盤のニュースはOK。\n';
    } else {
      prompt += '・直近24〜48時間以内のニュースのみ。古いネタは不要。\n';
    }
    prompt += '・検索結果で確認できた事実のみ。推測で作るな。\n';
    prompt += '・各ニュースの日付は検索結果から正確に取得せよ。日付不明なら「日付不明」と書け。\n';
    prompt += '・3日以上前のニュースは採用するな。' + dateStr + '時点で鮮度がないニュースは除外。\n';
    prompt += '・ヘッドラインは具体的に（NG:「米国の政策」→ OK:「パウエル議長、利下げ急がずと発言」）\n';
    prompt += '・「織り込み度」は市場の反応を見て判断（大きく動いた=高、まだ反応薄=低）\n';
    prompt += '・FXへの影響を最優先。株・金利・商品は「関連」として波及効果を書く。\n';
    prompt += '・日本語で出力。番号付きリストで簡潔に。\n';
    
    var result = callGemini_(prompt, keys.GEMINI_API_KEY, true);
    
    // ★v6.0.2: Grounding検索ソースをログ出力（ニュースの裏付け確認用）
    if (result && result.raw) {
      try {
        var candidate = result.raw.candidates && result.raw.candidates[0];
        if (candidate && candidate.groundingMetadata) {
          var gm = candidate.groundingMetadata;
          
          // 検索クエリをログ出力
          if (gm.webSearchQueries && gm.webSearchQueries.length > 0) {
            console.log('🔍 Grounding検索クエリ: ' + gm.webSearchQueries.join(' | '));
          }
          
          // ソースURLをログ出力（最大10件）
          if (gm.groundingChunks && gm.groundingChunks.length > 0) {
            var sources = [];
            for (var gi = 0; gi < Math.min(gm.groundingChunks.length, 10); gi++) {
              var chunk = gm.groundingChunks[gi];
              if (chunk.web) {
                sources.push((chunk.web.title || '不明') + ' → ' + chunk.web.uri);
              }
            }
            if (sources.length > 0) {
              console.log('📰 Groundingソース（' + sources.length + '件）:');
              for (var si = 0; si < sources.length; si++) {
                console.log('  ' + (si + 1) + '. ' + sources[si]);
              }
            }
          } else {
            console.log('⚠️ Groundingソースなし（Geminiの内部知識のみで回答した可能性）');
          }
        }
      } catch (gmErr) {
        console.log('⚠️ GroundingMetadata解析スキップ: ' + gmErr.message);
      }
    }
    
    if (result && result.text) {
      var newsText = '\n\n【📰 直近の市場ニュースTOP5（自動取得 - 投稿の題材として最優先で使え）】\n';
      newsText += result.text.trim();
      newsText += '\n\n';
      newsText += '■ ニュースの使い方（重要）\n';
      newsText += '・上記ニュースから投稿タイプに最も合うものを選び、投稿の「フック」（冒頭の掴み）に使え。\n';
      newsText += '・★数字の報告ではなく「文脈」を伝えろ。「原油104ドル」ではなく「原油104ドル、2022年のロシア制裁以来の水準」。\n';
      newsText += '・★「背景」欄の過去の類似事例や「このまま進むと」のシナリオを積極的に使え。読者が「知らなかった、そういう繋がりがあるのか」と思う情報が最も価値がある。\n';
      newsText += '・★「生活影響」欄があるニュースは最優先で採用せよ。為替の数字より「旅行代が上がる」「ガソリンがまた値上がり」の方が読者に刺さる。\n';
      newsText += '・みんなが何を思っているかを代弁しろ。「さすがにここまでは来ないとみんな思ってるけど...」「正直、嫌な既視感ありますよね」。\n';
      newsText += '・要人発言は具体的な人名と発言内容を入れろ。「関係者が〜」のような曖昧表現は禁止。\n';
      newsText += '・金利・株価・商品との連鎖を語ると投稿に厚みが出る。FXだけで閉じるな。\n';
      newsText += '・RULE系タイプでも、最近のニュースを「例」として引用すると説得力が増す。\n';
      
      // 1時間キャッシュ（3600秒）
      cache.put('market_news_v3', newsText, 3600);
      console.log('📰 市場ニュース取得成功（キャッシュ保存: 1時間）');
      return newsText;
    }
    
    console.log('⚠️ 市場ニュース取得失敗（スキップ）');
    return '';
    
  } catch (e) {
    console.log('⚠️ 市場ニュース取得エラー（スキップ）: ' + e.message);
    return '';
  }
}



function analyzePriceHistory_(rates) {
  try {
    var keys = getApiKeys();
    var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('レートサマリー');
    
    if (!sheet) return null;
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    
    var numCols = 1 + CURRENCY_PAIRS.length * 2 + 2;
    var countCol = 1 + CURRENCY_PAIRS.length * 2;
    var data = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    
    // ★v5.9.3: 「近い」「やや遠い」のエントリのみ収集し、「遠い・参考のみ」は完全除外
    var nearEntries = []; // {period, pair, high, low, tagH, tagL} を収集
    
    for (var i = 0; i < data.length; i++) {
      var period = data[i][0];
      var count = Number(data[i][countCol]);
      if (!period || count < 2) continue;
      
      for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
        var pair = CURRENCY_PAIRS[p];
        var high = safeNumber_(data[i][1 + p * 2]);
        var low = safeNumber_(data[i][1 + p * 2 + 1]);
        
        if (!high || !low) continue;
        if (!rates || !rates[pair.key]) continue;
        
        var decimals = pair.decimals >= 5 ? 4 : 2;
        var current = Number(rates[pair.key]);
        
        // 円ペアのみ距離判定
        if (pair.key.indexOf('jpy') >= 0) {
          var distH = Math.abs(current - high);
          var distL = Math.abs(current - low);
          
          // ★v5.9.3: 「近い」（±1.0円以内）のみ収集。やや遠い・遠いは完全除外
          var isHighNear = distH <= 1.0;
          var isLowNear = distL <= 1.0;
          
          if (isHighNear || isLowNear) {
            nearEntries.push({
              period: period,
              symbol: pair.symbol,
              high: isHighNear ? high.toFixed(decimals) : null,
              low: isLowNear ? low.toFixed(decimals) : null
            });
          }
        } else {
          // 非円ペアは直近2期間のみ（昨日、今週）
          var shortPeriods = ['昨日', '今週'];
          if (shortPeriods.indexOf(String(period)) !== -1) {
            nearEntries.push({
              period: period,
              symbol: pair.symbol,
              high: high.toFixed(decimals),
              low: low.toFixed(decimals)
            });
          }
        }
      }
    }
    
    if (nearEntries.length === 0) return null;
    
    // 期間ごとにグルーピングして出力
    var result = '【意識される価格帯（実績データから自動算出。近い水準のみ抜粋）】\n';
    var currentPeriod = '';
    
    for (var j = 0; j < nearEntries.length; j++) {
      var entry = nearEntries[j];
      if (entry.period !== currentPeriod) {
        currentPeriod = entry.period;
        result += '■' + currentPeriod + '\n';
      }
      var line = '  ' + entry.symbol;
      if (entry.high) line += ' 高値: ' + entry.high;
      if (entry.high && entry.low) line += ' /';
      if (entry.low) line += ' 安値: ' + entry.low;
      result += line + '\n';
    }
    
    result += '\n※上記は現在レートから±1.0円以内の水準のみ。「〇〇円が意識される」と触れてよい。\n';
    result += '※毎回入れる必要はない。文脈に合う時だけ自然に。\n\n';
    
    return result;
  } catch (e) {
    console.log('⚠️ 価格分析エラー（投稿生成は続行）: ' + e.message);
    return null;
  }
}

/**
 * 現在のレートとレートキャッシュの前回データを比較し、方向性テキストを生成 ★v5.6追加
 * 
 * Geminiにレート数値だけ渡しても「上がっているのか下がっているのか」が分からない。
 * 前回比と方向性を明示することで、ニュースとレートの矛盾を防ぐ。
 * 
 * @param {Object} rates - 現在のレート {usdjpy, eurusd, ...}
 * @param {string} spreadsheetId - スプレッドシートID
 * @return {string|null} 方向性テキスト
 */

/**
 * 現在のレートとレートキャッシュの前回データを比較し、方向性テキストを生成 ★v5.6追加
 * 
 * Geminiにレート数値だけ渡しても「上がっているのか下がっているのか」が分からない。
 * 前回比と方向性を明示することで、ニュースとレートの矛盾を防ぐ。
 * 
 * @param {Object} rates - 現在のレート {usdjpy, eurusd, ...}
 * @param {string} spreadsheetId - スプレッドシートID
 * @return {string|null} 方向性テキスト
 */
function calculateRateDirection_(rates, spreadsheetId) {
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName('レートキャッシュ');
    if (!sheet || sheet.getLastRow() < 3) return null; // 最低3行（ヘッダー+2データ）必要
    
    // 前回のレートを取得（最終行の1つ前 = 前回取得分）
    var lastRow = sheet.getLastRow();
    // 直近10行から、6時間以上前のデータを探す（同一セッション内の連続取得を避ける）
    var searchRows = Math.min(lastRow - 1, 10);
    var recentData = sheet.getRange(lastRow - searchRows, 1, searchRows + 1, 1 + CURRENCY_PAIRS.length).getValues();
    
    var now = new Date();
    var prevRow = null;
    
    // 最新行から遡って、4時間以上前のデータを見つける
    for (var i = recentData.length - 2; i >= 0; i--) {
      var rowDate = new Date(recentData[i][0]);
      var diffHours = (now.getTime() - rowDate.getTime()) / (1000 * 60 * 60);
      if (diffHours >= 4) {
        prevRow = recentData[i];
        break;
      }
    }
    
    if (!prevRow) return null;
    
    var prevRates = {};
    for (var p = 0; p < CURRENCY_PAIRS.length; p++) {
      prevRates[CURRENCY_PAIRS[p].key] = Number(prevRow[1 + p]);
    }
    
    var text = '【レートの方向性（前回比 - AIはこの方向を最優先で尊重せよ）】\n';
    var hasChange = false;
    
    for (var j = 0; j < CURRENCY_PAIRS.length; j++) {
      var pair = CURRENCY_PAIRS[j];
      var current = Number(rates[pair.key]);
      var prev = prevRates[pair.key];
      
      if (!current || !prev || prev === 0) continue;
      
      var diff = current - prev;
      var pctChange = ((diff / prev) * 100).toFixed(2);
      var decimals = pair.decimals >= 5 ? 4 : 2;
      var diffStr = diff >= 0 ? '+' + diff.toFixed(decimals) : diff.toFixed(decimals);
      
      var arrow = '';
      var direction = '';
      if (Math.abs(diff / prev) >= 0.005) {
        // 0.5%以上の変動 = 大きな動き
        arrow = diff > 0 ? '↑↑' : '↓↓';
        direction = diff > 0 ? '大幅上昇' : '大幅下落';
      } else if (Math.abs(diff / prev) >= 0.001) {
        // 0.1%以上 = 通常の動き
        arrow = diff > 0 ? '↑' : '↓';
        direction = diff > 0 ? '上昇' : '下落';
      } else {
        arrow = '→';
        direction = 'ほぼ横ばい';
      }
      
      text += '  ' + pair.symbol + ': ' + arrow + ' ' + direction + '（' + diffStr + '、' + pctChange + '%）\n';
      hasChange = true;
    }
    
    if (!hasChange) return null;
    
    text += '※上記の方向性が「今、相場で何が起きているか」の事実。\n';
    text += '※ニュースの解釈がこの方向性と矛盾する場合、方向性の方が正しい。\n\n';
    
    console.log('📈 レート方向性をプロンプトに注入');
    return text;
    
  } catch (e) {
    console.log('⚠️ レート方向性計算エラー（投稿生成は続行）: ' + e.message);
    return null;
  }
}

// ========================================
// ★v5.7: 前日の経済指標結果を自動取得
// Gemini+Groundingで検索→シートに記入→MORNING注入テキスト生成
// ========================================

// ===== 【公開】定期トリガーから呼び出す指標結果取得 ★v6.7追加 =====
// scheduler.gsのscheduleTodayPosts()で設定した定時トリガーから呼び出す

