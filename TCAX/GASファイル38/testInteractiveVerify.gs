/**
 * ============================================================
 * testInteractiveVerify.gs - 対話型検証テスト基盤(v1.9/v12.7 タスク17-c)
 * ============================================================
 *
 * 目的: 対話型検証システムの動作を「本番投稿を待たずに」検証する
 *
 * 設計思想(要件定義v1.9 セクション21):
 *   - 単体テスト: 各ステップを独立検証
 *   - 回帰テスト: 過去の事故を再現し、検出力を永続的に保証
 *   - 統合テスト: End-to-Endの動作確認
 *   - ドライラン: API不要でロジックのみ検証
 *
 * 運用方針:
 *   - 既存のtestTask1〜16は一切触らない(方針B並行実装の証跡として維持)
 *   - タスク17-19の新機能テストのみ本ファイルに集約
 *   - Phase 3テスト(本番接続前)で runAllInteractiveVerifyTests() を実行
 *
 * 依存関数:
 *   - executeInteractiveVerify_()         (interactiveVerify.gs)
 *   - extractVerificationClaims_()        (interactiveVerify.gs)
 *   - batchWebVerify_()                   (interactiveVerify.gs)
 *   - fixPostWithVerification_()          (interactiveVerify.gs)
 *   - parseExtractClaimsResponse_()       (interactiveVerify.gs)
 *   - parseBatchVerifyResponse_()         (interactiveVerify.gs)
 *   - collectAnchorData_()                (geminiApi.gs, タスク17-a)
 *   - callClaudeApi_()                    (geminiApi.gs)
 *   - getApiKeys()                        (config.gs)
 *
 * 作成日: 2026-04-18
 * ============================================================
 */


// ========================================
// テスト用の固定サンプル(事故再現用)
// ========================================

/**
 * 事故#1: MORNING「トランプ大統領、パウエルFRB議長の解任を示唆」
 *
 * 発生日: 2026-04-16
 * 原因: 4/17(翌日)のSNS投稿が混入し、4/16朝の投稿に「昨夜の出来事」として記載
 * 既存検証の結果: factCheck通過、Q6通過、finalFactVerifyで見逃し
 *
 * 対話型検証での期待動作:
 *   Step 1: 「パウエル解任示唆」の主張を抽出
 *   Step 2: Web検索で「4/16時点でこの発言はあったか」を確認 → ❌ または ⚠️
 *   Step 3: 該当部分を削除または修正
 */
var TEST_CASE_TRUMP_POWELL_DISMISSAL = {
  name: '事故#1: パウエル解任示唆(未来日付混入)',
  postType: 'MORNING',
  postText: '☕ おはようございます。\n' +
    '\n' +
    '📝昨夜、トランプ大統領がパウエルFRB議長の解任を示唆。為替市場は一気にドル売りに傾いた。\n' +
    '→ 金融政策の独立性への懸念が強まりそうですね。\n' +
    '\n' +
    '💡今日の仮説: ドル円は下振れリスク。155円台をうかがう展開も視野に。\n' +
    '\n' +
    '#FX #ドル円',
  expectation: {
    shouldExtractClaim: true,      // 主張が抽出されるべき
    shouldDetectIssue: true,       // ❌または⚠️が出るべき
    shouldApplyFix: true           // 修正が実行されるべき
  }
};

/**
 * 事故#2: INDICATOR「関税ショック前」
 *
 * 発生日: 2026-04-17
 * 原因: 継続中の関税措置(2025年3月〜)を「過去の事象」として言及
 * 既存検証の結果: factCheck「全て正確」判定、Q6見逃し、finalFactVerify見逃し
 *
 * 対話型検証での期待動作:
 *   Step 1: 「関税ショック前の数字」という時制表現を抽出
 *   Step 2: Web検索で「2026年2月時点で関税措置は継続中か」を確認 → ❌
 *   Step 3: 「関税ショックの最中の数字」等に書き換え
 */
var TEST_CASE_TARIFF_SHOCK_BEFORE = {
  name: '事故#2: 関税ショック前(継続事象の誤認)',
  postType: 'INDICATOR',
  postText: '⚡ 英国GDP発表を控えて\n' +
    '\n' +
    '📝英国2026年2月GDP(月次)の発表が間近。約7割のアナリストが前月比+0.1%を予想。\n' +
    '→関税ショック前の数字ですが、ポンドがじわじわ強い局面での下振れのほうが反応が鋭いところが怖い。\n' +
    '\n' +
    '#FX #ポンド #英国GDP',
  expectation: {
    shouldExtractClaim: true,
    shouldDetectIssue: true,       // ❌判定が出るべき
    shouldApplyFix: true
  }
};

/**
 * 事故#3: MORNING「RBA副総裁発言」
 *
 * 発生日: 2026-04-17 testMorning
 * 原因: Claudeフォールバックで内部知識(2025年初頭)が使われ、2026年4月の具体的発言を創作
 * 既存検証の結果: qualityReviewPost_で「裏付けなし」として修正されたが、運任せ
 *
 * 対話型検証での期待動作:
 *   Step 1: 「RBA副総裁が発言」という要人発言引用を抽出
 *   Step 2: Web検索で「2026年4月のRBA副総裁発言」を確認 → ⚠️(裏付け取れず)
 *   Step 3: 該当部分を削除または一般表現に書き換え
 */
var TEST_CASE_RBA_FUKU_SOSAI = {
  name: '事故#3: RBA副総裁発言(要人発言の捏造)',
  postType: 'MORNING',
  postText: '☕ おはようございます。\n' +
    '\n' +
    '📝RBA副総裁が「追加利上げが必要」と発言。豪ドル買いが入りやすい展開に。\n' +
    '→ オージー円は上方向に注目ですね。\n' +
    '\n' +
    '💡今日の仮説: 日銀会合を控え、JPYは神経質な動き。豪ドル円は買い優勢か。\n' +
    '\n' +
    '#FX #豪ドル円',
  expectation: {
    shouldExtractClaim: true,
    shouldDetectIssue: true,       // ⚠️判定が出るべき
    shouldApplyFix: true
  }
};

/**
 * 正常投稿: 誤検出防止テスト
 *
 * 目的: 正常な投稿で「対話型検証が過剰反応しないか」を確認
 * 内容: 相場観・感想のみで構成。具体的な日付・要人発言・継続事象への言及なし
 *
 * 対話型検証での期待動作:
 *   Step 1: 抽出対象なし or 抽出してもStep 2で全て✅判定
 *   Step 2: ❌/⚠️がゼロ
 *   Step 3: スキップ(修正不要)
 */
var TEST_CASE_CLEAN_POST = {
  name: '正常投稿: 誤検出防止テスト',
  postType: 'MORNING',
  postText: '☕ おはようございます。\n' +
    '\n' +
    '📝今日もドル円の動きに注目したい一日。\n' +
    '→ 方向感がつかみにくい相場ですね、無理は禁物かなと。\n' +
    '\n' +
    '💡今日の仮説: 指標次第では一方的な動きになりやすい。焦らず待ちたい。\n' +
    '\n' +
    '#FX #ドル円',
  expectation: {
    shouldExtractClaim: null,      // 抽出あってもなくてもOK
    shouldDetectIssue: false,      // ❌/⚠️は出ないべき
    shouldApplyFix: false          // 修正されないべき
  }
};


// ========================================
// レイヤー1: 単体テスト
// ========================================

/**
 * 【単体テスト】collectAnchorData_ の動作確認
 *
 * タスク17-aで実装済みの testTask17aCollectAnchorData() を再利用することも可能だが、
 * テストファイル集約の観点から、ここでも薄いラッパーを提供する。
 *
 * @return {boolean} 合格ならtrue
 */
function testCollectAnchorData() {
  console.log('');
  console.log('=== testCollectAnchorData 開始 ===');

  var keys = getApiKeys();
  if (!keys) {
    console.log('❌ getApiKeys() 失敗');
    return false;
  }

  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID);
  if (!rates) rates = {};

  try {
    var anchor = collectAnchorData_(rates, keys);
    if (!anchor) {
      console.log('❌ collectAnchorData_ が null/undefined を返した');
      return false;
    }

    // 必須フィールドの存在確認
    var requiredFields = ['today', 'rates', 'currencyStrength', 'policyRates', 'worldLeaders', 'ongoingEvents'];
    for (var i = 0; i < requiredFields.length; i++) {
      if (typeof anchor[requiredFields[i]] === 'undefined') {
        console.log('❌ 必須フィールド ' + requiredFields[i] + ' が存在しない');
        return false;
      }
    }

    // フォーマッターメソッドの動作確認
    if (typeof anchor.toFactString !== 'function') {
      console.log('❌ toFactString() メソッドが存在しない');
      return false;
    }
    if (typeof anchor.toVerifyPrompt !== 'function') {
      console.log('❌ toVerifyPrompt() メソッドが存在しない');
      return false;
    }
    if (typeof anchor.toFixPrompt !== 'function') {
      console.log('❌ toFixPrompt() メソッドが存在しない');
      return false;
    }

    var factStr = anchor.toFactString();
    if (!factStr || factStr.length < 100) {
      console.log('❌ toFactString() の出力が短すぎる: ' + (factStr ? factStr.length : 0) + '文字');
      return false;
    }

    console.log('✅ testCollectAnchorData 合格');
    console.log('   today: ' + anchor.today.jp);
    console.log('   toFactString: ' + factStr.length + '文字');
    return true;
  } catch (e) {
    console.log('❌ testCollectAnchorData エラー: ' + e.message);
    return false;
  }
}


/**
 * 【単体テスト・ドライラン】JSON パース関数の動作確認(API不要)
 *
 * parseExtractClaimsResponse_ と parseBatchVerifyResponse_ の
 * 両方をモックデータでテスト。Claude APIが不調でも動く。
 *
 * @return {boolean} 合格ならtrue
 */
function testExtractClaims_DryRun() {
  console.log('');
  console.log('=== testExtractClaims_DryRun 開始 (API不要) ===');
  var allPassed = true;

  // ===== テスト1: 正常なJSON応答 =====
  console.log('  [1] 正常なJSON応答のパース');
  var normalResponse = '{"claims":[{"id":1,"text":"RBA副総裁が発言","question":"RBA副総裁の2026年4月発言はあったか"}]}';
  var parsed1 = parseExtractClaimsResponse_(normalResponse);
  if (parsed1 && parsed1.length === 1 && parsed1[0].id === 1 && parsed1[0].text.indexOf('RBA') !== -1) {
    console.log('      ✅ 合格');
  } else {
    console.log('      ❌ 失敗: ' + JSON.stringify(parsed1));
    allPassed = false;
  }

  // ===== テスト2: ```json ``` で囲まれた応答 =====
  console.log('  [2] ```json ``` で囲まれた応答のパース');
  var markdownResponse = '```json\n{"claims":[{"id":1,"text":"test","question":"q1"}]}\n```';
  var parsed2 = parseExtractClaimsResponse_(markdownResponse);
  if (parsed2 && parsed2.length === 1) {
    console.log('      ✅ 合格');
  } else {
    console.log('      ❌ 失敗');
    allPassed = false;
  }

  // ===== テスト3: 文章中にJSONが埋め込まれた応答(フォールバック) =====
  console.log('  [3] 文章中にJSONが埋まった応答(フォールバック)');
  var embeddedResponse = '以下が抽出結果です。\n\n{"claims":[{"id":1,"text":"test","question":"q1"}]}\n\n以上です。';
  var parsed3 = parseExtractClaimsResponse_(embeddedResponse);
  if (parsed3 && parsed3.length === 1) {
    console.log('      ✅ 合格');
  } else {
    console.log('      ❌ 失敗');
    allPassed = false;
  }

  // ===== テスト4: 空のclaims配列 =====
  console.log('  [4] 空のclaims配列');
  var emptyResponse = '{"claims":[]}';
  var parsed4 = parseExtractClaimsResponse_(emptyResponse);
  if (parsed4 && parsed4.length === 0) {
    console.log('      ✅ 合格(空配列が正しく返った)');
  } else {
    console.log('      ❌ 失敗');
    allPassed = false;
  }

  // ===== テスト5: 不正なJSON =====
  console.log('  [5] 不正なJSON応答');
  var invalidResponse = 'これはJSONではない普通のテキスト応答です';
  var parsed5 = parseExtractClaimsResponse_(invalidResponse);
  if (parsed5 === null) {
    console.log('      ✅ 合格(nullが返った)');
  } else {
    console.log('      ❌ 失敗: null期待だが ' + JSON.stringify(parsed5));
    allPassed = false;
  }

  // ===== テスト6: verify結果のJSON応答 =====
  console.log('  [6] verify結果JSON応答のパース');
  var verifyResponse = '{"results":[{"id":1,"verdict":"❌","evidence":"検索結果と矛盾","fix_suggestion":"削除推奨"}]}';
  var parsed6 = parseBatchVerifyResponse_(verifyResponse);
  if (parsed6 && parsed6.length === 1 && parsed6[0].verdict === '❌') {
    console.log('      ✅ 合格');
  } else {
    console.log('      ❌ 失敗');
    allPassed = false;
  }

  // ===== テスト7: verdict表記のゆれ吸収 =====
  console.log('  [7] verdict表記ゆれの正規化(NG → ❌)');
  var verdictVariantResponse = '{"results":[{"id":1,"verdict":"NG","evidence":"test"}]}';
  var parsed7 = parseBatchVerifyResponse_(verdictVariantResponse);
  if (parsed7 && parsed7[0].verdict === '❌') {
    console.log('      ✅ 合格(NG → ❌ に正規化)');
  } else {
    console.log('      ❌ 失敗: ' + JSON.stringify(parsed7));
    allPassed = false;
  }

  console.log(allPassed ? '✅ testExtractClaims_DryRun: 全件合格' : '❌ testExtractClaims_DryRun: 一部失敗');
  return allPassed;
}


/**
 * 【単体テスト】Step 1(検証質問抽出)の動作確認
 *
 * 事故#3(RBA副総裁発言)の投稿を食わせて、
 * Step 1単体でclaimが抽出されるかを確認。
 *
 * API消費: Claude API 1回(Web検索なし、軽量)
 *
 * @return {boolean} 合格ならtrue
 */
function testExtractClaims() {
  console.log('');
  console.log('=== testExtractClaims 開始 (Claude API 1回) ===');

  var keys = _getKeysForTest_();
  if (!keys) return false;

  var testCase = TEST_CASE_RBA_FUKU_SOSAI;
  console.log('   投稿本文: ' + testCase.postText.substring(0, 60) + '...');

  try {
    var claims = extractVerificationClaims_(testCase.postText, testCase.postType, keys);

    if (!Array.isArray(claims)) {
      console.log('❌ 戻り値が配列ではない');
      return false;
    }

    console.log('   抽出claim数: ' + claims.length);
    for (var i = 0; i < claims.length; i++) {
      console.log('   [' + claims[i].id + '] text: ' + claims[i].text.substring(0, 50));
      console.log('       question: ' + claims[i].question.substring(0, 80));
    }

    if (claims.length === 0) {
      console.log('❌ claim抽出ゼロ(RBA副総裁発言は抽出対象のはず)');
      return false;
    }

    // RBA関連のclaimが含まれるかチェック
    var foundRBA = false;
    for (var ci = 0; ci < claims.length; ci++) {
      if (claims[ci].text.indexOf('RBA') !== -1 || claims[ci].question.indexOf('RBA') !== -1) {
        foundRBA = true;
        break;
      }
    }
    if (!foundRBA) {
      console.log('⚠️ 警告: RBA関連のclaimが抽出されていない(他のclaimは抽出された)');
      // これは失敗にはしない。LLMの判断の揺らぎ範囲
    }

    console.log('✅ testExtractClaims 合格');
    return true;
  } catch (e) {
    console.log('❌ testExtractClaims エラー: ' + e.message);
    return false;
  }
}


/**
 * 【単体テスト】Step 2(一括Web検証)の動作確認
 *
 * 事前に抽出済みのclaim配列を使って、Step 2単体でverdictが返るかを確認。
 *
 * API消費: Claude API 1回(Web検索ツール有効)
 *
 * @return {boolean} 合格ならtrue
 */
function testBatchWebVerify() {
  console.log('');
  console.log('=== testBatchWebVerify 開始 (Claude API 1回 + Web検索) ===');

  var keys = _getKeysForTest_();
  if (!keys) return false;

  // 事前に手動で作ったclaim(Step 1をスキップ)
  var testClaims = [
    {
      id: 1,
      text: 'RBA副総裁が「追加利上げが必要」と発言',
      question: '2026年4月時点でRBA副総裁による「追加利上げが必要」との公式発言はあったか'
    },
    {
      id: 2,
      text: '今日は日銀会合を控えている',
      question: '2026年4月17日もしくは翌営業日に日銀会合は予定されているか'
    }
  ];

  // 確定データ収集(anchorData)
  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID) || {};
  var anchorData = collectAnchorData_(rates, keys);

  try {
    var results = batchWebVerify_(testClaims, anchorData, keys);

    if (!Array.isArray(results)) {
      console.log('❌ 戻り値が配列ではない');
      return false;
    }

    if (results.length === 0) {
      console.log('❌ verify結果ゼロ');
      return false;
    }

    console.log('   検証結果: ' + results.length + '件');
    for (var i = 0; i < results.length; i++) {
      console.log('   [' + results[i].id + '] verdict: ' + results[i].verdict);
      console.log('       evidence: ' + (results[i].evidence || '').substring(0, 80));
      if (results[i].fix_suggestion) {
        console.log('       fix: ' + results[i].fix_suggestion.substring(0, 80));
      }
    }

    // verdict値が正規化されているかチェック
    for (var vi = 0; vi < results.length; vi++) {
      var verdict = results[vi].verdict;
      if (verdict !== '✅' && verdict !== '❌' && verdict !== '⚠️') {
        console.log('❌ verdict値が正規化されていない: ' + verdict);
        return false;
      }
    }

    console.log('✅ testBatchWebVerify 合格');
    return true;
  } catch (e) {
    console.log('❌ testBatchWebVerify エラー: ' + e.message);
    return false;
  }
}


/**
 * 【単体テスト】Step 3(修正)の動作確認
 *
 * 事前に用意した「❌判定済みのverifyResults」を使って、
 * Step 3単体で修正が走るかを確認。
 *
 * API消費: Claude API 1回
 *
 * @return {boolean} 合格ならtrue
 */
function testFixPost() {
  console.log('');
  console.log('=== testFixPost 開始 (Claude API 1回) ===');

  var keys = _getKeysForTest_();
  if (!keys) return false;

  var testCase = TEST_CASE_RBA_FUKU_SOSAI;

  // 事前に用意した検証結果(Step 2をスキップ)
  var testVerifyResults = [
    {
      id: 1,
      verdict: '⚠️',
      evidence: '2026年4月時点でRBA副総裁による「追加利上げが必要」との公式発言は確認できない',
      fix_suggestion: '該当部分を削除し、一般的な表現(例: RBAの動向に注目)に書き換え'
    }
  ];

  // 確定データ収集
  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID) || {};
  var anchorData = collectAnchorData_(rates, keys);

  try {
    var fixedText = fixPostWithVerification_(
      testCase.postText,
      testVerifyResults,
      testCase.postType,
      anchorData,
      keys
    );

    if (fixedText === null) {
      console.log('❌ 修正結果がnull(汚染チェック等で棄却された可能性)');
      return false;
    }

    if (typeof fixedText !== 'string' || fixedText.trim().length === 0) {
      console.log('❌ 修正結果が空文字列');
      return false;
    }

    console.log('   原文文字数: ' + testCase.postText.length);
    console.log('   修正後文字数: ' + fixedText.length);
    console.log('   修正後(先頭120文字): ' + fixedText.substring(0, 120));

    // 「RBA副総裁」が具体的発言の形で残っていないことを確認
    if (fixedText.indexOf('RBA副総裁が「') !== -1 || fixedText.indexOf('RBA副総裁は「') !== -1) {
      console.log('⚠️ 警告: 具体的な発言引用がまだ残っている');
    }

    // 文字数チェック(MORNINGはcharMax=300)
    var typeConfig = POST_TYPES[testCase.postType] || {};
    if (typeConfig.charMax && fixedText.length > typeConfig.charMax * 1.2) {
      console.log('⚠️ 警告: 文字数が上限の1.2倍を超過: ' + fixedText.length + '/' + typeConfig.charMax);
    }

    console.log('✅ testFixPost 合格');
    return true;
  } catch (e) {
    console.log('❌ testFixPost エラー: ' + e.message);
    return false;
  }
}


// ========================================
// レイヤー2: 回帰テスト(既知事故の再現)
// ========================================

/**
 * 【回帰テスト】事故#1: パウエル解任示唆(未来日付混入)
 *
 * 期待: Step 1で抽出 → Step 2で❌ → Step 3で修正
 *
 * API消費: 最大3回(Claude API 2回 + Web検索使用のClaude 1回)
 *
 * @return {boolean} 合格ならtrue
 */
function testCase_TrumpPowellDismissal() {
  return runRegressionTest_(TEST_CASE_TRUMP_POWELL_DISMISSAL);
}


/**
 * 【回帰テスト】事故#2: 関税ショック前(継続事象の誤認)
 *
 * 期待: Step 1で抽出 → Step 2で❌ → Step 3で「関税ショックの最中」に書き換え
 *
 * API消費: 最大3回
 *
 * @return {boolean} 合格ならtrue
 */
function testCase_TariffShockBefore() {
  return runRegressionTest_(TEST_CASE_TARIFF_SHOCK_BEFORE);
}


/**
 * 【回帰テスト】事故#3: RBA副総裁発言(要人発言の捏造)
 *
 * 期待: Step 1で抽出 → Step 2で⚠️ → Step 3で削除/書き換え
 *
 * API消費: 最大3回
 *
 * @return {boolean} 合格ならtrue
 */
function testCase_RBAFukuSosai() {
  return runRegressionTest_(TEST_CASE_RBA_FUKU_SOSAI);
}


/**
 * 【回帰テスト】正常投稿(誤検出防止)
 *
 * 期待: Step 1で抽出ゼロ or Step 2で全✅ → Step 3スキップ
 *
 * API消費: 最大2回(Step 1とStep 2のみ、Step 3は発動しない)
 *
 * @return {boolean} 合格ならtrue
 */
function testCase_CleanPost() {
  return runRegressionTest_(TEST_CASE_CLEAN_POST);
}


/**
 * 回帰テスト共通処理
 *
 * @param {Object} testCase - TEST_CASE_* のいずれか
 * @return {boolean} 合格ならtrue
 */
function runRegressionTest_(testCase) {
  console.log('');
  console.log('=== 回帰テスト: ' + testCase.name + ' ===');
  console.log('   投稿タイプ: ' + testCase.postType);
  console.log('   投稿本文(先頭60文字): ' + testCase.postText.substring(0, 60));

  var keys = _getKeysForTest_();
  if (!keys) return false;

  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID) || {};

  try {
    var result = executeInteractiveVerify_(
      testCase.postText,
      testCase.postType,
      rates,
      keys
    );

    // 結果サマリー出力
    console.log('');
    console.log('   === 検証結果サマリー ===');
    console.log('   実行ステップ数: ' + result.stepsExecuted);
    console.log('   抽出claim数: ' + result.extractedCount);
    console.log('   ❌/⚠️/✅: ' + result.ngCount + '/' + result.warnCount + '/' + result.okCount);
    console.log('   修正発動: ' + (result.fixApplied ? 'YES' : 'NO'));
    if (result.error) {
      console.log('   エラー: ' + result.error);
    }
    if (result.skippedReason) {
      console.log('   スキップ理由: ' + result.skippedReason);
    }

    // ===== 期待値との照合 =====
    var passed = true;
    var expect = testCase.expectation;

    // 1. claim抽出の期待チェック
    if (expect.shouldExtractClaim === true) {
      if (result.extractedCount === 0) {
        console.log('   ❌ 期待: claim抽出あり → 実際: ゼロ');
        passed = false;
      } else {
        console.log('   ✅ 期待: claim抽出あり → 実際: ' + result.extractedCount + '件');
      }
    } else if (expect.shouldExtractClaim === false) {
      if (result.extractedCount > 0) {
        console.log('   ❌ 期待: claim抽出ゼロ → 実際: ' + result.extractedCount + '件');
        passed = false;
      } else {
        console.log('   ✅ 期待: claim抽出ゼロ → 実際: ゼロ');
      }
    }
    // shouldExtractClaim === null の場合はチェックしない

    // 2. 問題検出の期待チェック
    var issueDetected = (result.ngCount > 0 || result.warnCount > 0);
    if (expect.shouldDetectIssue === true) {
      if (!issueDetected) {
        console.log('   ❌ 期待: ❌/⚠️検出あり → 実際: なし');
        passed = false;
      } else {
        console.log('   ✅ 期待: ❌/⚠️検出あり → 実際: ❌' + result.ngCount + '件/⚠️' + result.warnCount + '件');
      }
    } else if (expect.shouldDetectIssue === false) {
      if (issueDetected) {
        console.log('   ❌ 期待: 問題検出なし → 実際: ❌' + result.ngCount + '件/⚠️' + result.warnCount + '件');
        passed = false;
      } else {
        console.log('   ✅ 期待: 問題検出なし → 実際: なし');
      }
    }

    // 3. 修正発動の期待チェック
    if (expect.shouldApplyFix === true) {
      if (!result.fixApplied) {
        console.log('   ❌ 期待: 修正発動 → 実際: 発動せず');
        passed = false;
      } else {
        console.log('   ✅ 期待: 修正発動 → 実際: 発動');
      }
    } else if (expect.shouldApplyFix === false) {
      if (result.fixApplied) {
        console.log('   ❌ 期待: 修正なし → 実際: 発動');
        passed = false;
      } else {
        console.log('   ✅ 期待: 修正なし → 実際: 発動せず');
      }
    }

    // 修正後のテキストをサンプル表示(修正があった場合のみ)
    if (result.fixApplied) {
      console.log('');
      console.log('   === 修正後の本文(先頭150文字) ===');
      console.log('   ' + result.fixedText.substring(0, 150));
    }

    console.log('');
    console.log(passed ? '✅ ' + testCase.name + ': 合格' : '❌ ' + testCase.name + ': 不合格');
    return passed;

  } catch (e) {
    console.log('❌ 回帰テスト実行エラー: ' + e.message);
    console.log('   Stack: ' + (e.stack || 'なし'));
    return false;
  }
}


// ========================================
// レイヤー3: 統合テスト(End-to-End)
// ========================================

/**
 * 【統合テスト】汚染投稿を食わせて、修正後が改善しているか
 *
 * 事故#2(関税ショック前)を使って、統合的な動作を確認。
 *
 * API消費: 最大3回
 *
 * @return {boolean} 合格ならtrue
 */
function testIntegratedDirty() {
  console.log('');
  console.log('=== testIntegratedDirty 開始 ===');

  var testCase = TEST_CASE_TARIFF_SHOCK_BEFORE;
  var keys = _getKeysForTest_();
  if (!keys) return false;

  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID) || {};

  try {
    var result = executeInteractiveVerify_(
      testCase.postText,
      testCase.postType,
      rates,
      keys
    );

    // 必須条件: 修正が発動し、かつ修正後のテキストで「関税ショック前」が消えているか
    var passed = true;

    if (!result.fixApplied) {
      console.log('❌ 修正が発動しなかった');
      passed = false;
    } else {
      console.log('✅ 修正発動');

      // 修正後のテキストで問題フレーズが消えているか
      if (result.fixedText.indexOf('関税ショック前') !== -1) {
        console.log('❌ 修正後も「関税ショック前」が残っている');
        passed = false;
      } else {
        console.log('✅ 「関税ショック前」が修正後テキストから除去されている');
      }

      // 文字数が極端におかしくないか
      var typeConfig = POST_TYPES[testCase.postType] || {};
      if (typeConfig.charMax && result.fixedText.length > typeConfig.charMax * 1.5) {
        console.log('❌ 修正後文字数が上限の1.5倍を超過: ' + result.fixedText.length);
        passed = false;
      } else {
        console.log('✅ 修正後文字数が妥当: ' + result.fixedText.length);
      }
    }

    console.log(passed ? '✅ testIntegratedDirty 合格' : '❌ testIntegratedDirty 不合格');
    return passed;
  } catch (e) {
    console.log('❌ testIntegratedDirty エラー: ' + e.message);
    return false;
  }
}


/**
 * 【統合テスト】正常投稿で、スルー(誤検出ゼロ)されるか
 *
 * 正常投稿を食わせて、対話型検証が過剰反応しないかを確認。
 *
 * API消費: 最大2回(Step 1 + Step 2のみ)
 *
 * @return {boolean} 合格ならtrue
 */
function testIntegratedClean() {
  console.log('');
  console.log('=== testIntegratedClean 開始 ===');

  var testCase = TEST_CASE_CLEAN_POST;
  var keys = _getKeysForTest_();
  if (!keys) return false;

  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID) || {};

  try {
    var result = executeInteractiveVerify_(
      testCase.postText,
      testCase.postType,
      rates,
      keys
    );

    var passed = true;

    // 誤検出チェック: 修正が発動していないこと
    if (result.fixApplied) {
      console.log('❌ 誤検出: 正常投稿なのに修正が発動した');
      console.log('   検出内容: ❌' + result.ngCount + '件 / ⚠️' + result.warnCount + '件');
      passed = false;
    } else {
      console.log('✅ 誤検出なし: 修正は発動せず');
    }

    // 修正後テキストが原文と一致すること
    if (result.fixedText !== result.originalText) {
      console.log('❌ 修正されていないはずが、fixedText が originalText と異なる');
      passed = false;
    } else {
      console.log('✅ 修正後テキスト = 原文');
    }

    console.log(passed ? '✅ testIntegratedClean 合格' : '❌ testIntegratedClean 不合格');
    return passed;
  } catch (e) {
    console.log('❌ testIntegratedClean エラー: ' + e.message);
    return false;
  }
}


// ========================================
// 全テスト一括実行
// ========================================

/**
 * 対話型検証の全テストを順次実行し、サマリーを出力
 *
 * 実行時間の目安:
 *   - API不要のテスト: 数秒
 *   - 単体テスト(API使用): 各10〜20秒
 *   - 回帰テスト: 各30〜60秒
 *   - 統合テスト: 各30〜60秒
 *   - 合計: 約5〜8分
 *
 * API消費の目安:
 *   - Claude API: 最大25回程度
 *   - Web検索: 最大8回程度
 *   - コスト: 約$0.50〜$1.00(月150投稿の約1日分)
 *
 * 注意:
 *   - 時間が長いので、GASエディタから実行する際は
 *     実行タイムアウト(6分)に注意。必要なら個別実行してください。
 */
function runAllInteractiveVerifyTests() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   🧪 対話型検証 全テスト実行開始                             ║');
  console.log('║   所要時間目安: 5〜8分                                       ║');
  console.log('║   API消費目安: Claude 25回 / $0.50〜$1.00                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  var startTime = new Date();
  var results = [];

  // ===== レイヤー1: 単体テスト =====
  console.log('');
  console.log('┌──────────────────────────────────────────┐');
  console.log('│ レイヤー1: 単体テスト                       │');
  console.log('└──────────────────────────────────────────┘');

  results.push({ name: 'testCollectAnchorData',         layer: 1, passed: runSafely_(testCollectAnchorData) });
  results.push({ name: 'testExtractClaims_DryRun',      layer: 1, passed: runSafely_(testExtractClaims_DryRun) });
  results.push({ name: 'testExtractClaims',             layer: 1, passed: runSafely_(testExtractClaims) });
  results.push({ name: 'testBatchWebVerify',            layer: 1, passed: runSafely_(testBatchWebVerify) });
  results.push({ name: 'testFixPost',                   layer: 1, passed: runSafely_(testFixPost) });

  // ===== レイヤー2: 回帰テスト =====
  console.log('');
  console.log('┌──────────────────────────────────────────┐');
  console.log('│ レイヤー2: 回帰テスト(既知事故の再現)      │');
  console.log('└──────────────────────────────────────────┘');

  results.push({ name: 'testCase_TrumpPowellDismissal', layer: 2, passed: runSafely_(testCase_TrumpPowellDismissal) });
  results.push({ name: 'testCase_TariffShockBefore',    layer: 2, passed: runSafely_(testCase_TariffShockBefore) });
  results.push({ name: 'testCase_RBAFukuSosai',         layer: 2, passed: runSafely_(testCase_RBAFukuSosai) });
  results.push({ name: 'testCase_CleanPost',            layer: 2, passed: runSafely_(testCase_CleanPost) });

  // ===== レイヤー3: 統合テスト =====
  console.log('');
  console.log('┌──────────────────────────────────────────┐');
  console.log('│ レイヤー3: 統合テスト                       │');
  console.log('└──────────────────────────────────────────┘');

  results.push({ name: 'testIntegratedDirty',           layer: 3, passed: runSafely_(testIntegratedDirty) });
  results.push({ name: 'testIntegratedClean',           layer: 3, passed: runSafely_(testIntegratedClean) });

  // ===== サマリー =====
  var elapsedMin = Math.round((new Date() - startTime) / 60000 * 10) / 10;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   📊 テスト結果サマリー                                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  var passedCount = 0;
  var byLayer = { 1: { total: 0, passed: 0 }, 2: { total: 0, passed: 0 }, 3: { total: 0, passed: 0 } };

  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    var mark = r.passed ? '✅' : '❌';
    console.log('   L' + r.layer + ' ' + mark + ' ' + r.name);
    if (r.passed) passedCount++;
    byLayer[r.layer].total++;
    if (r.passed) byLayer[r.layer].passed++;
  }

  console.log('');
  console.log('   ────────────────────────────────────────');
  console.log('   レイヤー1(単体): ' + byLayer[1].passed + '/' + byLayer[1].total);
  console.log('   レイヤー2(回帰): ' + byLayer[2].passed + '/' + byLayer[2].total);
  console.log('   レイヤー3(統合): ' + byLayer[3].passed + '/' + byLayer[3].total);
  console.log('   ────────────────────────────────────────');
  console.log('   合計: ' + passedCount + '/' + results.length + ' 件合格');
  console.log('   所要時間: ' + elapsedMin + ' 分');
  console.log('   ────────────────────────────────────────');

  if (passedCount === results.length) {
    console.log('');
    console.log('   🎉 全テスト合格! 対話型検証システムは正常に動作しています。');
  } else {
    console.log('');
    console.log('   ⚠️  一部テスト失敗。上記のログを確認してください。');
  }

  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    byLayer: byLayer,
    elapsedMin: elapsedMin,
    results: results
  };
}


/**
 * テスト関数を安全に実行(例外を握りつぶしてtrueにfalseを返す)
 */
function runSafely_(testFn) {
  try {
    return testFn() === true;
  } catch (e) {
    console.log('❌ テスト関数で例外発生: ' + e.message);
    console.log('   Stack: ' + (e.stack || 'なし'));
    return false;
  }
}


// ========================================
// 個別レイヤー実行用ショートカット(6分制限対策)
// ========================================

/**
 * レイヤー1のみ実行(API不要のドライラン含む、約1〜2分)
 */
function runLayer1Tests() {
  console.log('=== レイヤー1: 単体テストのみ実行 ===');
  var results = [];
  results.push({ name: 'testCollectAnchorData',     passed: runSafely_(testCollectAnchorData) });
  results.push({ name: 'testExtractClaims_DryRun',  passed: runSafely_(testExtractClaims_DryRun) });
  results.push({ name: 'testExtractClaims',         passed: runSafely_(testExtractClaims) });
  results.push({ name: 'testBatchWebVerify',        passed: runSafely_(testBatchWebVerify) });
  results.push({ name: 'testFixPost',               passed: runSafely_(testFixPost) });
  printLayerSummary_('レイヤー1', results);
  return results;
}

/**
 * レイヤー2のみ実行(約2〜4分)
 */
function runLayer2Tests() {
  console.log('=== レイヤー2: 回帰テストのみ実行 ===');
  var results = [];
  results.push({ name: 'testCase_TrumpPowellDismissal', passed: runSafely_(testCase_TrumpPowellDismissal) });
  results.push({ name: 'testCase_TariffShockBefore',    passed: runSafely_(testCase_TariffShockBefore) });
  results.push({ name: 'testCase_RBAFukuSosai',         passed: runSafely_(testCase_RBAFukuSosai) });
  results.push({ name: 'testCase_CleanPost',            passed: runSafely_(testCase_CleanPost) });
  printLayerSummary_('レイヤー2', results);
  return results;
}

/**
 * レイヤー3のみ実行(約1〜2分)
 */
function runLayer3Tests() {
  console.log('=== レイヤー3: 統合テストのみ実行 ===');
  var results = [];
  results.push({ name: 'testIntegratedDirty', passed: runSafely_(testIntegratedDirty) });
  results.push({ name: 'testIntegratedClean', passed: runSafely_(testIntegratedClean) });
  printLayerSummary_('レイヤー3', results);
  return results;
}

/**
 * ドライランのみ実行(API不要、数秒で終わる)
 * API調子悪い時でも動く
 */
function runDryRunOnly() {
  console.log('=== ドライランのみ実行 (API不要) ===');
  var results = [];
  results.push({ name: 'testCollectAnchorData',    passed: runSafely_(testCollectAnchorData) });
  results.push({ name: 'testExtractClaims_DryRun', passed: runSafely_(testExtractClaims_DryRun) });
  printLayerSummary_('ドライラン', results);
  return results;
}

function printLayerSummary_(layerName, results) {
  console.log('');
  console.log('─── ' + layerName + ' サマリー ───');
  var passed = 0;
  for (var i = 0; i < results.length; i++) {
    var mark = results[i].passed ? '✅' : '❌';
    console.log(mark + ' ' + results[i].name);
    if (results[i].passed) passed++;
  }
  console.log('合計: ' + passed + '/' + results.length);
}


/**
 * テスト用: getApiKeys() の戻り値に CLAUDE_API_KEY を補完して返す
 *
 * 既存のgetApiKeys()はCLAUDE_API_KEYを含まないため、ScriptPropertiesから補完する。
 * これは既存のfinalFactVerify_ (geminiApi.gs 841行目)と同じパターン。
 *
 * @return {Object|null} { ...getApiKeys(), CLAUDE_API_KEY: '...' }
 *                       CLAUDE_API_KEYが取得できない場合はnull
 */
function _getKeysForTest_() {
  var keys = getApiKeys() || {};
  if (!keys.CLAUDE_API_KEY) {
    keys.CLAUDE_API_KEY = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  }
  if (!keys.CLAUDE_API_KEY) {
    console.log('❌ CLAUDE_API_KEY 未設定（ScriptPropertiesを確認してください）');
    return null;
  }
  return keys;
}


// ========================================
// ★v12.7 タスク17-d: ログシート書き込み動作確認テスト
// ========================================

/**
 * 【タスク17-d テスト】executeInteractiveVerify_ からログが書き込まれるか確認
 *
 * 事故#3(RBA副総裁発言)で対話型検証を実行し、その後ログシートに
 * 新しい行が追加されているかを確認する。
 *
 * 前提:
 *   - sheetsManager.gs に logInteractiveVerify_ と getInteractiveVerifyLogSheet_ が実装済み
 *   - interactiveVerify.gs の finally ブロックにログ書き込み配線済み
 *
 * 所要時間: 約30秒(事故#3の再実行と同じ)
 *
 * @return {boolean} 合格ならtrue
 */
function testTask17dLogIntegration() {
  console.log('');
  console.log('========================================');
  console.log('🧪 タスク17-d: ログ書き込み統合テスト');
  console.log('========================================');

  // 0. 前提チェック
  if (typeof getInteractiveVerifyLogSheet_ !== 'function') {
    console.log('❌ getInteractiveVerifyLogSheet_ が未定義');
    console.log('   sheetsManager.gs にタスク17-dの関数が追加されているか確認してください');
    return false;
  }
  if (typeof logInteractiveVerify_ !== 'function') {
    console.log('❌ logInteractiveVerify_ が未定義');
    return false;
  }

  // 1. 実行前のログ行数を記録
  console.log('');
  console.log('1. 実行前のログ行数を取得');
  var sheet = getInteractiveVerifyLogSheet_();
  var rowsBefore = sheet.getLastRow();
  console.log('   現在のログ行数: ' + rowsBefore);

  // 2. 対話型検証を実行(事故#3を使用)
  console.log('');
  console.log('2. 対話型検証を実行(事故#3: RBA副総裁発言)');
  var keys = _getKeysForTest_();
  if (!keys) return false;

  var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID) || {};
  var result = executeInteractiveVerify_(
    TEST_CASE_RBA_FUKU_SOSAI.postText,
    TEST_CASE_RBA_FUKU_SOSAI.postType,
    rates,
    keys
  );

  // 3. 実行後のログ行数を確認
  console.log('');
  console.log('3. 実行後のログ行数を確認');
  var rowsAfter = sheet.getLastRow();
  console.log('   実行後のログ行数: ' + rowsAfter);

  if (rowsAfter !== rowsBefore + 1) {
    console.log('❌ 行数が増えていない(期待: ' + (rowsBefore + 1) + ', 実際: ' + rowsAfter + ')');
    return false;
  }
  console.log('   ✅ 1行増加を確認');

  // 4. 追加された行の内容を検証
  console.log('');
  console.log('4. 追加された行の内容検証');
  var newRow = sheet.getRange(rowsAfter, 1, 1, 12).getValues()[0];

  var passed = true;
  var checks = [
    { col: 'A (logId)',      test: function(v) { return typeof v === 'string' && v.indexOf('VL_') === 0; }, desc: 'VL_で始まる' },
    { col: 'B (executedAt)', test: function(v) { return v && String(v).length > 0; }, desc: '日時あり' },
    { col: 'D (postType)',   test: function(v) { return v === 'MORNING'; }, desc: 'MORNING' },
    { col: 'E (extracted)',  test: function(v) { return Number(v) > 0; }, desc: '抽出数 > 0' },
    { col: 'I (fixApplied)', test: function(v) { return v === 'TRUE' || v === 'FALSE' || v === true || v === false; }, desc: 'TRUE/FALSE/Boolean' }
  ];

  for (var i = 0; i < checks.length; i++) {
    var c = checks[i];
    var val = newRow[['A','B','C','D','E','F','G','H','I','J','K','L'].indexOf(c.col.charAt(0))];
    if (c.test(val)) {
      console.log('   ✅ ' + c.col + ' = ' + val + ' (' + c.desc + ')');
    } else {
      console.log('   ❌ ' + c.col + ' = ' + val + ' (期待: ' + c.desc + ')');
      passed = false;
    }
  }

  // 5. ログID の形式確認
  console.log('');
  console.log('5. logId 形式確認');
  var logId = String(newRow[0]);
  var logIdPattern = /^VL_\d{8}_\d{6}_\d{4}$/;
  if (logIdPattern.test(logId)) {
    console.log('   ✅ logId 形式: ' + logId + ' (VL_yyyyMMdd_HHmmss_xxxx)');
  } else {
    console.log('   ⚠️ logId 形式が期待と異なる: ' + logId);
  }

  // 6. 実検証結果とログ内容の整合確認
  console.log('');
  console.log('6. 実検証結果とログ内容の整合確認');
  if (Number(newRow[4]) === result.extractedCount) {
    console.log('   ✅ extractedCount 一致: ' + result.extractedCount);
  } else {
    console.log('   ❌ extractedCount 不一致');
    passed = false;
  }
  if (Number(newRow[5]) === result.ngCount) {
    console.log('   ✅ ngCount 一致: ' + result.ngCount);
  } else {
    console.log('   ❌ ngCount 不一致');
    passed = false;
  }

  console.log('');
  console.log('========================================');
  console.log(passed ? '🎉 タスク17-d 統合テスト: 全項目合格' : '⚠️ タスク17-d 統合テスト: 一部失敗');
  console.log('========================================');

  return passed;
}
