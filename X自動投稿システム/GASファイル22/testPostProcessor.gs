/**
 * CompanaFXAutoPost - testPostProcessor.gs
 * 後処理チェーンの不変条件テスト
 * 
 * v12.6: 新規作成（リグレッション防止）
 * 
 * 目的: postProcessor.gsの変更前後にこのテストを実行し、
 *       「直したら別の箇所が壊れた」を変更直後に検出する。
 * 
 * 実行方法: カスタムメニュー「🧪 後処理チェーンテスト」
 *           または GASエディタから testPostProcessorChain() を手動実行
 * 
 * 設計の鉄則:
 *   - postProcessor.gsを変更する前に実行 → 全パス確認
 *   - postProcessor.gsを変更した後に実行 → 失敗箇所 = 影響範囲
 *   - 新しい後処理関数を追加したら、対応するテストケースも追加すること
 *   - API呼び出しなし。純粋関数テストのみ。実行時間は数秒
 */


// ===== アサート関数（GASにはテストフレームワークがないため自前） =====

/**
 * 値の一致を検証する
 * @param {string} testName - テスト名
 * @param {*} expected - 期待値
 * @param {*} actual - 実際の値
 * @return {boolean} パスしたか
 */
function assert_(testName, expected, actual) {
  if (expected === actual) {
    return true;
  }
  console.log('  ❌ ' + testName);
  console.log('    期待: ' + JSON.stringify(expected).substring(0, 100));
  console.log('    実際: ' + JSON.stringify(actual).substring(0, 100));
  return false;
}

/**
 * テキストに特定の文字列が含まれることを検証する
 * @param {string} testName - テスト名
 * @param {string} needle - 含まれるべき文字列
 * @param {string} haystack - 検索対象テキスト
 * @return {boolean}
 */
function assertContains_(testName, needle, haystack) {
  if (haystack.indexOf(needle) !== -1) {
    return true;
  }
  console.log('  ❌ ' + testName);
  console.log('    「' + needle + '」が見つからない');
  console.log('    対象: ' + haystack.substring(0, 120));
  return false;
}

/**
 * テキストに特定の文字列が含まれないことを検証する
 */
function assertNotContains_(testName, needle, haystack) {
  if (haystack.indexOf(needle) === -1) {
    return true;
  }
  console.log('  ❌ ' + testName);
  console.log('    「' + needle + '」が含まれている（含まれるべきでない）');
  console.log('    対象: ' + haystack.substring(0, 120));
  return false;
}


// ===== メイン: テスト実行 =====

function testPostProcessorChain() {
  console.log('=== 後処理チェーン 不変条件テスト ===');
  console.log('');
  
  var passed = 0;
  var failed = 0;
  
  function run(result) {
    if (result) { passed++; } else { failed++; }
  }
  
  // --- enforceLineBreaks_ ---
  console.log('--- enforceLineBreaks_ ---');
  
  // 1. 数値変化の→は改行しない（★v12.5.5で修正した箇所）
  var lb1 = enforceLineBreaks_('米10年債（4.35%→4.10%）の低下。');
  run(assertContains_('数値内→は改行しない', '4.35%→4.10%', lb1));
  
  // 2. 通常の→は改行する
  var lb2 = enforceLineBreaks_('☕テスト内容→分析です。');
  run(assertContains_('通常→は改行する', '\n→', lb2));
  
  // 3. 行頭の→はそのまま
  var lb3 = enforceLineBreaks_('→すでに行頭です。');
  run(assert_('行頭→は維持', '→すでに行頭です。', lb3.split('\n')[0]));
  
  // 4. 「。」の後に改行が入る
  var lb4 = enforceLineBreaks_('ドル円が上昇。ユーロは下落。');
  run(assertContains_('句点後に改行', '上昇。\n', lb4));
  
  // 5. 絵文字行の前に空行が入る
  var lb5 = enforceLineBreaks_('テスト行\n📝次のブロック');
  run(assertContains_('絵文字前に空行', '\n\n📝', lb5));
  
  console.log('');
  
  // --- fixHallucinatedRates_ ---
  console.log('--- fixHallucinatedRates_ ---');
  
  var mockRates = {
    usdjpy: 158.86,
    eurjpy: 163.42,
    gbpjpy: 195.20,
    audjpy: 97.50,
    eurusd: 1.15370,
    gbpusd: 1.29840,
    audusd: 0.71260
  };
  
  // 1. 「円」付きのハルシネーションを修正
  var hr1 = fixHallucinatedRates_('ドル円は142.82円まで下落', mockRates);
  run(assert_('円付きレート修正', 'ドル円は158.86円まで下落', hr1));
  
  // 2. 「円」なし「まで」パターンも検出（★v12.5.5修正箇所）
  var hr2 = fixHallucinatedRates_('ドル円は142.82まで下落', mockRates);
  run(assert_('円なしレート修正', 'ドル円は158.86まで下落', hr2));
  
  // 3. 正常なレートは触らない（3%以内）
  var hr3 = fixHallucinatedRates_('ドル円は158.50円付近で推移', mockRates);
  run(assertContains_('正常レートは維持', '158.50', hr3));
  
  // 4. 「豪ドル円」の中の「ドル円」をUSD/JPYとして誤検出しない
  var hr4 = fixHallucinatedRates_('豪ドル円は97.50円で安定', mockRates);
  run(assertNotContains_('豪ドル円の誤検出防止', '158.86', hr4));
  run(assertContains_('豪ドル円はそのまま', '97.50', hr4));
  
  // 5. USDペアの修正
  var hr5 = fixHallucinatedRates_('ユーロドルは0.9500ドルまで下落', mockRates);
  run(assertContains_('USDペア修正', '1.1537', hr5));
  
  // 6. レートがない行は触らない
  var hr6 = fixHallucinatedRates_('今日の相場は静かです。', mockRates);
  run(assert_('レートなし行は不変', '今日の相場は静かです。', hr6));
  
  // 7. ★v12.6: 同一行に2ペアある場合のクロス汚染防止（本番で発生した重大バグ）
  //    旧コード: USD/JPYチェックが豪ドル円の値も上書き → AUD/JPYチェックがドル円の値も上書き → 両方AUD/JPYの値に
  var crossRates = { usdjpy: 158.87, eurjpy: 163.42, gbpjpy: 195.20, audjpy: 97.50, eurusd: 1.15370, gbpusd: 1.29840, audusd: 0.71260 };
  var hr7 = fixHallucinatedRates_('ドル円は113.21、豪ドル円は113.21。', crossRates);
  run(assertContains_('同一行クロス汚染防止: ドル円→158.87', '158.87', hr7));
  run(assertContains_('同一行クロス汚染防止: 豪ドル円→97.50', '97.50', hr7));
  
  // 8. 同一行で両方正常な場合は触らない
  var hr8 = fixHallucinatedRates_('ドル円は158.50円、豪ドル円は97.30円。', crossRates);
  run(assertContains_('同一行正常: ドル円維持', '158.50', hr8));
  run(assertContains_('同一行正常: 豪ドル円維持', '97.30', hr8));
  
  console.log('');
  
  // --- normalizeRateDecimals_ ---
  console.log('--- normalizeRateDecimals_ ---');
  
  // 1. JPYペア: 3桁以上 → 2桁に丸め
  var nr1 = normalizeRateDecimals_('ドル円は158.864円付近。');
  run(assertContains_('JPY桁数正規化', '158.86円', nr1));
  
  // 2. USDペア: 5桁以上 → 4桁に丸め
  var nr2 = normalizeRateDecimals_('ユーロドルは1.15374ドルで推移。');
  run(assertContains_('USD桁数正規化', '1.1537ドル', nr2));
  
  // 3. 正常な桁数はそのまま
  var nr3 = normalizeRateDecimals_('ドル円は158.86円付近。');
  run(assertContains_('正常桁数は不変', '158.86円', nr3));
  
  console.log('');
  
  // --- replaceProhibitedPhrases_ ---
  console.log('--- replaceProhibitedPhrases_ ---');
  
  // 1. 二重表記「ドル円（ドル円）」除去
  var rp1 = replaceProhibitedPhrases_('ドル円（ドル円）が上昇。');
  run(assert_('二重表記除去', 'ドル円が上昇。', rp1));
  
  // 2. 「様子見」が除去される（静観→さらに後続の変換で最終形になる）
  var rp2 = replaceProhibitedPhrases_('今日は様子見ムードですね。');
  run(assertNotContains_('様子見が除去される', '様子見', rp2));
  
  // 3. 5桁ドルの小数点挿入（11538ドル → 1.1538ドル）
  var rp3 = replaceProhibitedPhrases_('ユーロドルは11538ドルで推移。');
  run(assertContains_('小数点挿入', '1.1538ドル', rp3));
  
  console.log('');
  
  // --- removeDisallowedEmoji_ ---
  console.log('--- removeDisallowedEmoji_ ---');
  
  // 1. 許可絵文字☕は残る
  var re1 = removeDisallowedEmoji_('☕朝のチェックです。');
  run(assertContains_('許可絵文字☕維持', '☕', re1));
  
  // 2. 許可絵文字📝は残る
  var re2 = removeDisallowedEmoji_('📝メモです。');
  run(assertContains_('許可絵文字📝維持', '📝', re2));
  
  // 3. 許可絵文字💡は残る
  var re3 = removeDisallowedEmoji_('💡ポイントです。');
  run(assertContains_('許可絵文字💡維持', '💡', re3));
  
  // 4. 4個目の許可絵文字は除去される（MAX_EMOJI=3）
  var re4 = removeDisallowedEmoji_('☕一つ\n📝二つ\n💡三つ\n📕四つ');
  var re4EmojiCount = 0;
  if (re4.indexOf('☕') !== -1) re4EmojiCount++;
  if (re4.indexOf('📝') !== -1) re4EmojiCount++;
  if (re4.indexOf('💡') !== -1) re4EmojiCount++;
  if (re4.indexOf('📕') !== -1) re4EmojiCount++;
  run(assert_('絵文字上限3個', 3, re4EmojiCount));
  
  console.log('');
  
  // --- convertExactRatesToRange_ ---
  console.log('--- convertExactRatesToRange_ ---');
  
  // 1. TOKYO: 「円」付きレート → 台変換
  var cr1 = convertExactRatesToRange_('ドル円は158.97円で推移。', 'TOKYO');
  run(assert_('TOKYO: 円付き→台', 'ドル円は158円台で推移。', cr1));
  
  // 2. TOKYO: 「円」なしレート → 台変換（本番で発生したパターン）
  var cr2 = convertExactRatesToRange_('ドル円158.97、豪ドル円113.26。', 'TOKYO');
  run(assertContains_('TOKYO: ドル円台変換', 'ドル円158円台', cr2));
  run(assertContains_('TOKYO: 豪ドル円台変換', '豪ドル円113円台', cr2));
  
  // 3. TOKYO: USDペア → ドル台変換
  var cr3 = convertExactRatesToRange_('豪ドル米ドルは0.7125ドルで推移。', 'TOKYO');
  run(assertContains_('TOKYO: USDドル台変換', '0.71ドル台', cr3));
  
  // 4. MORNING: 変換しない（TOKYO/LUNCH以外）
  var cr4 = convertExactRatesToRange_('ドル円は158.97円で推移。', 'MORNING');
  run(assertContains_('MORNING: 変換しない', '158.97', cr4));
  
  // 5. 既に「台」表現なら触らない
  var cr5 = convertExactRatesToRange_('ドル円は158円台で推移。', 'TOKYO');
  run(assert_('TOKYO: 台は二重変換しない', 'ドル円は158円台で推移。', cr5));
  
  // 6. スペース区切り「豪ドル円 113.39」も変換（本番で発生したパターン）
  var cr6 = convertExactRatesToRange_('豪ドル円 113.39と底堅い。', 'LUNCH');
  run(assertContains_('LUNCH: スペース区切り変換', '113円台', cr6));
  run(assertNotContains_('LUNCH: 小数点が消える', '113.39', cr6));
  
  console.log('');
  
  // --- enforceLineBreaks_ + fixHallucinatedRates_ 連鎖テスト ---
  console.log('--- 連鎖干渉テスト ---');
  
  // 1. 数値変化の→がチェーン全体で壊れないか
  //    enforceLineBreaks_ → ... → fixHallucinatedRates_ の順で適用
  var chain1Input = '📝米10年債利回り（4.35%→4.10%）の低下が材料。\n→利下げ期待が強まっていますね。';
  var chain1 = enforceLineBreaks_(chain1Input);
  chain1 = fixHallucinatedRates_(chain1, mockRates);
  run(assertContains_('連鎖: 数値→が壊れない', '4.35%→4.10%', chain1));
  
  // 2. レートを含む行が改行で分割されてもfixHallucinatedRatesがマッチするか
  var chain2Input = '📝ドル円は158.50円付近。\n→NY時間の動きに注目。';
  var chain2 = enforceLineBreaks_(chain2Input);
  chain2 = fixHallucinatedRates_(chain2, mockRates);
  run(assertContains_('連鎖: レートが保持される', '158.50', chain2));
  
  // 3. 正常な投稿テキストがチェーンで壊れないか（構造の不変条件）
  var chain3Input = '☕中東情勢の緊迫化。\n→リスクオフムードですね。\n\n📝ドル円、158.86円付近。\n→小動き継続ですね。';
  var chain3 = enforceLineBreaks_(chain3Input);
  chain3 = removeDisallowedEmoji_(chain3);
  chain3 = replaceProhibitedPhrases_(chain3);
  chain3 = fixHallucinatedRates_(chain3, mockRates);
  run(assertContains_('連鎖: ☕維持', '☕', chain3));
  run(assertContains_('連鎖: 📝維持', '📝', chain3));
  run(assertContains_('連鎖: →維持', '→', chain3));
  run(assertContains_('連鎖: レート維持', '158.86', chain3));
  
  console.log('');
  
  // === 結果サマリー ===
  console.log('========================================');
  console.log('後処理チェーンテスト結果');
  console.log('  ✅ 合格: ' + passed);
  console.log('  ❌ 失敗: ' + failed);
  console.log('  合計: ' + (passed + failed) + '件');
  console.log('========================================');
  
  if (failed > 0) {
    console.log('');
    console.log('⚠️ 失敗したテストがあります。postProcessor.gsの変更が他の処理に影響しています。');
  } else {
    console.log('');
    console.log('全テストパス。変更は安全です。');
  }
}
