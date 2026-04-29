/**
 * CompanaFXAutoPost - postProcessor.gs
 * 後処理チェーンのオーケストレーター(applyPostProcessingChain_)
 *
 * 提供する関数:
 *   - applyPostProcessingChain_: 生成テキストに対して順番に後処理を適用する
 *
 * 呼び出し順(★事件10 の教訓により絶対変更禁止):
 *   removeForeignText_ → stripAIPreamble_ → enforceLineBreaks_
 *   → removeDisallowedEmoji_ → fixOrphanedVariationSelector_
 *   → removeMarkdown_ → replaceProhibitedPhrases_
 *   → fixIncompleteVerbEnding_
 *   → fixMondayYesterday_(月曜のみ)
 *   → removeFutureDateLines_
 *   → removeDuplicateBlocks_ → removeOrphanedLines_
 *   → fixBrokenSentenceEndings_
 *   → truncateAfterHashtag_ → generateDynamicHashtags_
 *   → [rates有の場合のみ以下5段階]
 *   → fixMissingDecimalPoint_ → fixHallucinatedRates_
 *   → normalizeRateDecimals_
 *   → convertExactRatesToRange_(LUNCHのレート台変換・★2026-04-29: TOKYO削除)
 *   → validateFinalFormat_(安全網)
 *
 * 依存する関数(他ファイル):
 *   - textCleanup.gs: 13関数
 *   - rateSanitizer.gs: 6関数
 *   - postFinalizer.gs: 6関数
 *
 * 設計の鉄則:
 *   - 正規表現で \b は使わない(二重小数点バグの原因)
 *   - \s は改行を含む → 行頭処理は [ \t]+ を使う
 *   - 新しい後処理を追加する前に既存チェーンへの影響を検証すること
 *
 * 履歴:
 *   v8.5: geminiApi.gs から分離(Phase 2)
 *   v14.0 Phase R-3(2026-04-23): 2,188行から applyPostProcessingChain_ のみに切り出し
 *     - テキスト清掃系13関数 → textCleanup.gs
 *     - レート検証系6関数 → rateSanitizer.gs
 *     - 最終化系6関数 → postFinalizer.gs
 */


// 新しい後処理を追加する場合はここだけ変更すればOK
// TC除去（removeTCMention_）はタイプ別判定があるため呼び出し側で個別に実行すること
/**
 * @param {string} text - 後処理対象のテキスト
 * @param {string} postType - 投稿タイプ
 * @param {Object|null} rates - レートオブジェクト（nullならレート修正をスキップ）
 * @return {string} 後処理済みテキスト
 */
function applyPostProcessingChain_(text, postType, rates) {
  text = removeForeignText_(text);
  text = stripAIPreamble_(text);
  text = enforceLineBreaks_(text);
  text = removeDisallowedEmoji_(text);
  text = fixOrphanedVariationSelector_(text);  // ★v8.14: 孤立U+FE0F修復
  text = removeMarkdown_(text);
  text = replaceProhibitedPhrases_(text);
  text = fixIncompleteVerbEnding_(text);  // ★v13.0.10: 文末未完結「〜かなと。」「〜とこ。」「〜感じ。」を動詞完結形に
  
  // 月曜日の「昨日」「昨夜」を機械的に修正
  var todayDow = new Date().getDay();
  if (todayDow === 1) {
    text = fixMondayYesterday_(text);
  }
  
  text = removeFutureDateLines_(text);  // ★v12.7: 未来日付＋過去形文脈を検出して該当行を削除
  text = removeDuplicateBlocks_(text);
  text = removeOrphanedLines_(text);  // ★v8.12: 品質修正で壊れた孤立短文を除去
  text = fixBrokenSentenceEndings_(text);  // ★v8.14: 壊れた句点パターン修復
  text = truncateAfterHashtag_(text);
  text = generateDynamicHashtags_(text, postType);
  
  if (rates) {
    text = fixMissingDecimalPoint_(text, rates);
    text = fixHallucinatedRates_(text, rates);
    text = normalizeRateDecimals_(text);
    text = convertExactRatesToRange_(text, postType);  // ★v12.6: LUNCHのレート台変換(★2026-04-29: TOKYO削除)
    text = validateFinalFormat_(text, rates);
  }
  
  return text;
}
