/**
 * CompanaFXAutoPost - anchorDataCollector.gs
 * 確定データ収集の一元化(Twelve Data API + スプレッドシート + 計算値)
 *
 * 提供する関数:
 *   - computeRateDirection_: 現在レートと始値から方向(up/down)を算出
 *   - collectAnchorData_: 確定データを構造化オブジェクトとして返す
 *     - toFactString(): 汎用「確定データ」文字列形式
 *     - toVerifyPrompt(): 対話型検証 Step2 用
 *     - toFixPrompt(): 対話型検証 Step3 用
 *   - testTask17aCollectAnchorData: 動作確認テスト
 *
 * 履歴:
 *   v12.7 タスク17-a: 確定データ収集の一元化として新設
 *   v14.0 Phase R-1(2026-04-23): geminiApi.gs から独立ファイルへ分離
 */


// ========================================

/**
 * 現在レートと始値から、各通貨ペアの方向(up/down)を算出
 * @param {Object} currentRates - 現在レート（rates.usdjpy 等）
 * @param {Object} openRates - 始値（openRates.usdjpy 等）
 * @return {Object} { usdjpy: 'up'|'down', eurjpy: 'up'|'down', ... }
 */
function computeRateDirection_(currentRates, openRates) {
  var direction = {};
  if (!currentRates || !openRates) return direction;

  for (var key in openRates) {
    if (openRates.hasOwnProperty(key) && currentRates[key] && openRates[key]) {
      var current = Number(currentRates[key]);
      var open = Number(openRates[key]);
      if (!isNaN(current) && !isNaN(open)) {
        direction[key] = current > open ? 'up' : 'down';
      }
    }
  }
  return direction;
}


/**
 * 確定データ(Anchor Data)を構造化オブジェクトとして収集する共通関数
 *
 * 対話型検証 Step2・Step3、finalFactVerify_、将来的にbuildPrompt_から呼ばれる
 * 「真実のアンカー」を返す唯一の関数。
 *
 * 設計思想(v1.9):
 *   - 確定データの取得ロジックを1箇所に集約
 *   - 構造化オブジェクト + フォーマッターで、用途別のテキスト変換が可能
 *   - モック注入がしやすく、単体テストに優しい
 *   - 新しい確定データ(VIX等)を追加する時、この関数だけ修正すればよい
 *
 * @param {Object} rates - Twelve Data APIから取得した現在レート
 * @param {Object} keys - getApiKeys()の戻り値
 * @param {Object} [options] - オプション
 * @param {boolean} [options.includeCalendar=true] - 経済カレンダーを含めるか
 * @param {boolean} [options.includeOngoingEvents=true] - 継続中事象を含めるか
 * @param {string} [options.calendarScope='today'] - 'today'|'this_week'|'next_week'
 * @return {Object} 構造化された確定データオブジェクト + フォーマッターメソッド
 */
function collectAnchorData_(rates, keys, options) {
  var opts = options || {};
  var includeCalendar = opts.includeCalendar !== false;
  var includeOngoingEvents = opts.includeOngoingEvents !== false;
  var calendarScope = opts.calendarScope || 'today';

  // === 1. 基本情報（本日の日付） ===
  var now = new Date();
  var today = {
    iso: Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd'),
    jp: Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年M月d日（E）'),
    timestamp: now.getTime()
  };

  // === 2. 確定レート（現在レート + 始値 + 方向） ===
  var rateData = {
    current: rates || {},
    open: null,
    direction: null
  };

  try {
    if (keys && keys.SPREADSHEET_ID) {
      var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
      var openRates = getTodayOpenRates_(ss);
      if (openRates) {
        rateData.open = openRates;
        rateData.direction = computeRateDirection_(rates, openRates);
      }
    }
  } catch (e) {
    handleError_('warning', 'anchorDataCollector.gs:collectAnchorData_(始値取得)', e);
  }

  // === 3. 通貨強弱ランキング ===
  var currencyStrength = [];
  try {
    if (keys && keys.SPREADSHEET_ID) {
      var hotPairResult = detectHotPair_(rates, keys.SPREADSHEET_ID);
      if (hotPairResult && hotPairResult.csRanking) {
        currencyStrength = hotPairResult.csRanking;
      }
    }
  } catch (e) {
    handleError_('warning', 'anchorDataCollector.gs:collectAnchorData_(通貨強弱取得)', e);
  }

  // === 4. 政策金利（テキスト形式、既存関数流用） ===
  var policyRates = '';
  try {
    policyRates = getPolicyRatesText_();
  } catch (e) {
    handleError_('warning', 'anchorDataCollector.gs:collectAnchorData_(政策金利取得)', e);
  }

  // === 5. 要人リスト（テキスト形式、既存関数流用） ===
  var worldLeaders = '';
  try {
    worldLeaders = getWorldLeadersText_();
  } catch (e) {
    handleError_('warning', 'anchorDataCollector.gs:collectAnchorData_(要人リスト取得)', e);
  }

  // === 6. 経済カレンダー（optional） ===
  var calendar = null;
  if (includeCalendar) {
    try {
      calendar = getEconomicCalendar_(calendarScope);
    } catch (e) {
      handleError_('warning', 'anchorDataCollector.gs:collectAnchorData_(経済カレンダー取得)', e);
    }
  }

  // === 7. 継続中事象（v12.7タスク13-15で実装済み） ===
  var ongoingEvents = [];
  if (includeOngoingEvents) {
    try {
      // getOngoingEvents_ は sheetsManager.gs にある
      // 戻り値: [{ name, startDate, lastUpdated, status, summary, affectedTypes, cautionKeywords }, ...]
      if (typeof getOngoingEvents_ === 'function') {
        ongoingEvents = getOngoingEvents_() || [];
      }
    } catch (e) {
      handleError_('warning', 'anchorDataCollector.gs:collectAnchorData_(継続中事象取得)', e);
    }
  }

  // === 8. 構造化オブジェクトを返却（フォーマッター付き） ===
  var anchorData = {
    today: today,
    rates: rateData,
    currencyStrength: currencyStrength,
    policyRates: policyRates,
    worldLeaders: worldLeaders,
    calendar: calendar,
    ongoingEvents: ongoingEvents,

    // ===== フォーマッターメソッド =====

    /**
     * 汎用の「確定データ」文字列形式
     * finalFactVerify_, factCheckPost_ スタイル
     */
    toFactString: function() {
      var txt = '';

      // 本日の日付（最優先）
      txt += '【本日の日付（最重要の基準）】\n';
      txt += this.today.jp + '（ISO: ' + this.today.iso + '）\n';
      txt += '→ この日付より後の日付の出来事を「起きた」「発言した」等の過去形・完了形で書いていたらハルシネーション（誤り）。\n';
      txt += '→ ただし「〜発表予定」「〜に注目」「〜を控える」等の未来予定は正しい記述。\n\n';

      // 確定レート
      if (this.rates.current && Object.keys(this.rates.current).length > 0) {
        txt += '【確定レート（APIリアルタイム値）】\n';
        if (typeof CURRENCY_PAIRS !== 'undefined' && CURRENCY_PAIRS && CURRENCY_PAIRS.length > 0) {
          for (var i = 0; i < CURRENCY_PAIRS.length; i++) {
            var p = CURRENCY_PAIRS[i];
            if (this.rates.current[p.key]) {
              txt += p.symbol + '（' + p.label + '）: ' + formatRate_(this.rates.current[p.key], p.key, 'verify') + '\n';
            }
          }
        }
        txt += '\n';
      }

      // 本日始値（方向判定）
      if (this.rates.open && this.rates.direction && this.rates.open.usdjpy) {
        txt += '【本日始値（方向判定の基準）】\n';
        txt += 'USD/JPY始値: ' + formatRate_(this.rates.open.usdjpy, 'usdjpy', 'verify') + '\n';
        if (this.rates.direction.usdjpy === 'up') {
          txt += '→ 本日のドル円は始値より上昇（= 円安方向）。「円高」と書いたら誤り\n';
        } else {
          txt += '→ 本日のドル円は始値より下落（= 円高方向）。「円安」と書いたら誤り\n';
        }
        txt += '\n';
      }

      // 通貨強弱(★v14.0 Phase 7: 時間軸ラベル明示・事件13対策)
      if (this.currencyStrength.length > 0) {
        txt += '【通貨強弱（実測値・直近24時間の複数ペア総合スコア）】\n';
        txt += '※この数値は特定ペアの本日変動率ではない。\n';
        txt += '※投稿で「今日だけで○%」「本日○%の急騰」と書く根拠にしてはならない。\n';
        txt += '※「今日/本日」と書く場合の根拠は下の【本日変動】セクションのみ。\n';
        for (var ci = 0; ci < this.currencyStrength.length; ci++) {
          var cs = this.currencyStrength[ci];
          txt += cs.currency + ': ' + (cs.score >= 0 ? '+' : '') + cs.score.toFixed(2) + '% ' + cs.direction + '\n';
        }
        txt += '\n';
      }

      // ★v14.0 Phase 7(2026-04-23): 本日変動セクション(事件13対策)
      // 事件13: LONDON で「今日だけで4円17銭超の急騰」という捏造が発生
      // 原因: 日次(直近24時間)の+3.8%と本日始値比を混同。本日変動は+0.03円だった
      // 対処: 本日始値と現在値の差分を全ペアで計算済みで明示する
      if (this.rates.open && this.rates.current) {
        var pairsForDelta = (typeof CURRENCY_PAIRS !== 'undefined') ? CURRENCY_PAIRS : [];
        var hasAnyDelta = false;
        var deltaLines = '';
        for (var pi = 0; pi < pairsForDelta.length; pi++) {
          var pp = pairsForDelta[pi];
          var openVal = this.rates.open[pp.key];
          var curVal = this.rates.current[pp.key];
          if (openVal && curVal) {
            var diff = curVal - openVal;
            var pctDiff = (diff / openVal) * 100;
            var diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(pp.decimals);
            var pctStr = (pctDiff >= 0 ? '+' : '') + pctDiff.toFixed(2);
            deltaLines += pp.symbol + '(' + pp.label + '): ' 
                       + formatRate_(openVal, pp.key, 'verify') + ' → ' 
                       + formatRate_(curVal, pp.key, 'verify')
                       + ' (本日' + diffStr + ', ' + pctStr + '%)\n';
            hasAnyDelta = true;
          }
        }
        if (hasAnyDelta) {
          txt += '【本日変動（始値比・本日限定の数値・★事件13対策の最重要基準）】\n';
          txt += '※投稿で「今日」「本日」「今日だけで」「本日ここまで」「今朝から」と\n';
          txt += '  書く場合、ここの数値のみを根拠にせよ。\n';
          txt += '※「直近24時間」「日次」「ここ数日」は上の【通貨強弱】が該当する別概念。\n';
          txt += '※本日変動と直近24時間変動を絶対に混同するな。\n';
          txt += deltaLines;
          txt += '\n';
        }
      }

      // 政策金利
      if (this.policyRates) {
        txt += '【主要中銀の政策金利】\n' + this.policyRates + '\n';
      }

      // 要人
      if (this.worldLeaders) {
        txt += '【主要国の首脳・要人】\n' + this.worldLeaders + '\n';
      }

      // 経済カレンダー
      if (this.calendar) {
        txt += '【経済カレンダー】\n' + this.calendar + '\n';
      }

      // 継続中事象
      if (this.ongoingEvents.length > 0) {
        txt += '【継続中の重大事象（誤った時制で書かないこと）】\n';
        for (var oi = 0; oi < this.ongoingEvents.length; oi++) {
          var ev = this.ongoingEvents[oi];
          txt += '- ' + ev.name;
          if (ev.startDate) txt += '（' + ev.startDate + '〜継続中）';
          if (ev.summary) txt += ': ' + ev.summary;
          txt += '\n';
          if (ev.cautionKeywords) {
            txt += '  ⚠️ 誤用注意: ' + ev.cautionKeywords + '\n';
          }
        }
        txt += '\n';
      }

      return txt;
    },

    /**
     * 対話型検証 Step2（Web検証）に最適化した文字列
     * 「これを基準に主張を検証せよ」の指示に使う
     */
    toVerifyPrompt: function() {
      var txt = '【検証の基準となる確定データ】\n';
      txt += 'Web検索結果がこの確定データと矛盾する場合は、確定データを優先せよ。\n';
      txt += '確定データはTwelve Data APIやスプレッドシートの人間管理データで、最も信頼できる情報源。\n\n';
      txt += this.toFactString();
      return txt;
    },

    /**
     * 対話型検証 Step3（修正）に最適化した文字列
     * 「この確定データを守って修正せよ」の指示に使う
     */
    toFixPrompt: function() {
      var txt = '【修正時に守るべき確定データ】\n';
      txt += 'この数値・方向・日付を変えてはならない。\n';
      txt += '修正の結果、これらと矛盾する記述になった場合はその修正自体が誤り。\n\n';
      txt += this.toFactString();
      return txt;
    }
  };

  return anchorData;
}


/**
 * ★v12.7 タスク17-a テスト: collectAnchorData_ の動作確認
 *
 * GASエディタで testTask17aCollectAnchorData() を実行することで、
 * 確定データ収集が正しく動作するかを検証できる。
 *
 * 期待結果:
 *   - rates / currencyStrength / policyRates / worldLeaders が取得できる
 *   - toFactString() / toVerifyPrompt() / toFixPrompt() が文字列を返す
 *   - エラーが出ても致命的にならず、他のフィールドは取得される（fail-safe）
 */
function testTask17aCollectAnchorData() {
  console.log('========================================');
  console.log('🧪 タスク17-a: collectAnchorData_ 動作テスト');
  console.log('========================================');

  var keys = getApiKeys();
  if (!keys) {
    console.log('❌ getApiKeys() 失敗');
    return false;
  }

  // 1. レート取得（キャッシュから）
  console.log('');
  console.log('1. レート取得');
  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
  if (!rates) {
    console.log('⚠️ レートキャッシュが空。レートなしでテスト続行');
    rates = {};
  } else {
    console.log('   ✅ レート取得成功: USD/JPY=' + rates.usdjpy);
  }

  // 2. collectAnchorData_ 実行
  console.log('');
  console.log('2. collectAnchorData_ 実行');
  var anchor;
  try {
    anchor = collectAnchorData_(rates, keys);
  } catch (e) {
    console.log('❌ collectAnchorData_ 実行エラー: ' + e.message);
    console.log('   Stack: ' + e.stack);
    return false;
  }

  if (!anchor) {
    console.log('❌ collectAnchorData_ が null/undefined を返した');
    return false;
  }
  console.log('   ✅ 構造化オブジェクト取得成功');

  // 3. 各フィールドの検証
  console.log('');
  console.log('3. 各フィールド検証');
  var passed = true;

  // today
  if (anchor.today && anchor.today.iso && anchor.today.jp) {
    console.log('   ✅ today: ' + anchor.today.jp + ' (ISO: ' + anchor.today.iso + ')');
  } else {
    console.log('   ❌ today フィールド不正');
    passed = false;
  }

  // rates
  if (anchor.rates && anchor.rates.current) {
    var rateKeys = Object.keys(anchor.rates.current);
    console.log('   ✅ rates.current: ' + rateKeys.length + '通貨ペア');
    if (anchor.rates.open) {
      console.log('   ✅ rates.open: 取得済み (USD/JPY始値=' + (anchor.rates.open.usdjpy || 'なし') + ')');
    } else {
      console.log('   ⚠️ rates.open: 未取得（始値データなしの可能性）');
    }
    if (anchor.rates.direction) {
      console.log('   ✅ rates.direction: ' + JSON.stringify(anchor.rates.direction));
    } else {
      console.log('   ⚠️ rates.direction: 未計算（始値がないため）');
    }
  } else {
    console.log('   ❌ rates フィールド不正');
    passed = false;
  }

  // currencyStrength
  if (Array.isArray(anchor.currencyStrength)) {
    console.log('   ✅ currencyStrength: ' + anchor.currencyStrength.length + '通貨');
  } else {
    console.log('   ❌ currencyStrength が配列ではない');
    passed = false;
  }

  // policyRates
  if (typeof anchor.policyRates === 'string') {
    console.log('   ✅ policyRates: 文字列（' + anchor.policyRates.length + '文字）');
  } else {
    console.log('   ❌ policyRates が文字列ではない');
    passed = false;
  }

  // worldLeaders
  if (typeof anchor.worldLeaders === 'string') {
    console.log('   ✅ worldLeaders: 文字列（' + anchor.worldLeaders.length + '文字）');
  } else {
    console.log('   ❌ worldLeaders が文字列ではない');
    passed = false;
  }

  // calendar
  if (anchor.calendar === null || typeof anchor.calendar === 'string') {
    console.log('   ✅ calendar: ' + (anchor.calendar ? '文字列（' + anchor.calendar.length + '文字）' : 'null'));
  } else {
    console.log('   ⚠️ calendar が予期しない型');
  }

  // ongoingEvents
  if (Array.isArray(anchor.ongoingEvents)) {
    console.log('   ✅ ongoingEvents: ' + anchor.ongoingEvents.length + '件');
    if (anchor.ongoingEvents.length > 0) {
      console.log('      最初の事象: ' + anchor.ongoingEvents[0].name);
    }
  } else {
    console.log('   ❌ ongoingEvents が配列ではない');
    passed = false;
  }

  // 4. フォーマッターメソッドの動作確認
  console.log('');
  console.log('4. フォーマッターメソッド動作確認');

  try {
    var factStr = anchor.toFactString();
    if (typeof factStr === 'string' && factStr.length > 0) {
      console.log('   ✅ toFactString(): ' + factStr.length + '文字');
    } else {
      console.log('   ❌ toFactString() が空文字列');
      passed = false;
    }
  } catch (e) {
    console.log('   ❌ toFactString() エラー: ' + e.message);
    passed = false;
  }

  try {
    var verifyStr = anchor.toVerifyPrompt();
    if (typeof verifyStr === 'string' && verifyStr.length > 0) {
      console.log('   ✅ toVerifyPrompt(): ' + verifyStr.length + '文字');
    } else {
      console.log('   ❌ toVerifyPrompt() が空文字列');
      passed = false;
    }
  } catch (e) {
    console.log('   ❌ toVerifyPrompt() エラー: ' + e.message);
    passed = false;
  }

  try {
    var fixStr = anchor.toFixPrompt();
    if (typeof fixStr === 'string' && fixStr.length > 0) {
      console.log('   ✅ toFixPrompt(): ' + fixStr.length + '文字');
    } else {
      console.log('   ❌ toFixPrompt() が空文字列');
      passed = false;
    }
  } catch (e) {
    console.log('   ❌ toFixPrompt() エラー: ' + e.message);
    passed = false;
  }

  // 5. サンプル出力（toFactStringの先頭500文字）
  console.log('');
  console.log('5. サンプル出力: toFactString() 先頭500文字');
  console.log('------------------------------');
  try {
    console.log(anchor.toFactString().substring(0, 500));
  } catch (e) {
    console.log('出力エラー: ' + e.message);
  }
  console.log('------------------------------');

  console.log('');
  console.log('========================================');
  if (passed) {
    console.log('🎉 タスク17-a テスト: 全項目合格');
  } else {
    console.log('⚠️ タスク17-a テスト: 一部失敗');
  }
  console.log('========================================');

  return passed;
}

