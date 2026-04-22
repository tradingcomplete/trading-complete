/**
 * ========================================
 * validationV13.gs
 * ★v13.0 検証段階統廃合(2026-04-19 新規追加)
 * ========================================
 *
 * 目的:
 *   4段検証(factCheck / qualityReview / finalFactVerify / interactiveVerify)を
 *   2段(総合レビュー + 修正適用)に統合し、API呼び出しを4-9回→2-3回に削減する。
 *
 * 構造:
 *   Stage 1: runComprehensiveReview_  (Claude + Web検索を1回・全観点を一括JSON出力)
 *   Stage 2: applyFixesV13_           (優先度順に修正を適用・必要に応じて Claude 1-2回)
 *
 * 並行稼働:
 *   ScriptProperties 'USE_V13_VALIDATION' = 'true' の場合のみ有効
 *   geminiApi.gs の executeQualityReviewChain_ 冒頭で分岐される
 *   既存 sheetsManager / approval は adaptV13ToLegacyJson_ 経由で無改修のまま動く
 *
 * 参照:
 *   - TCAX_v13_検証統廃合_シミュレーション_v1_1.md
 *   - TCAX_設計書_v12_10.md
 */


// ========================================
// 定数
// ========================================

var V13_STAGE1_MAX_TOKENS = 8192;          // Stage 1 総合レビュー用(通常は4096)
var V13_STAGE1_MAX_WEB_SEARCHES = 5;       // Web検索最大回数(ニュース取得と同等)
var V13_FIX_MAX_TOKENS = 4096;             // Stage 2 修正用


// ========================================
// ★v13.0.2 キャラクター口調セクション抽出(品質修正時のみ・末尾注入)
// ========================================

/**
 * キャラクターシートから【ペルソナ】【発信の原則と口調】を抽出する
 *
 * 設計方針(v13.0.1失敗の反省):
 *   - SSOT(単一の真実の源): スプレッドシート【キャラクター】シートが唯一の基準
 *   - コードに固定文字列を書かない(シート変更時に同期が取れなくなるため)
 *   - 切り詰めない(欠損すると口調の核が失われる)
 *   - applyQualityFix_ のみに注入(論理矛盾・WARN修正は最小限変更に留める)
 *   - プロンプト末尾に配置(attention最強位置)
 *
 * @return {string} 【ペルソナ】+【発信の原則と口調】全文。失敗時は空文字
 */
function _getCharacterSectionsFromSheet_() {
  try {
    if (typeof getCharacterPrompt !== 'function') return '';
    var fullSheet = getCharacterPrompt();
    if (!fullSheet) return '';

    var result = '';
    var targetSections = ['ペルソナ', '発信の原則と口調'];

    for (var i = 0; i < targetSections.length; i++) {
      var secName = targetSections[i];
      var pattern = new RegExp('【' + secName + '】([\\s\\S]*?)(?=\\n【|$)', 'm');
      var match = fullSheet.match(pattern);
      if (match && match[1]) {
        result += '【' + secName + '】\n' + match[1].trim() + '\n\n';
      }
    }
    return result.trim();
  } catch (e) {
    console.log('⚠️ _getCharacterSectionsFromSheet_ 失敗(口調注入スキップ): ' + e.message);
    return '';
  }
}


// ========================================
// ★v13.0.5 Stage 1失敗時のフォールバック: 文字数保証のみ実行
// ========================================

/**
 * Stage 1 失敗時でも最低限の品質ガードとして文字数保証を走らせる
 * 通常フローでは executeValidationV13_ の末尾で文字数チェックが走るが、
 * Stage 1 失敗時は即 return するため文字数オーバーが放置されていた。
 * この関数で最低限の文字数保証だけは確実に実行する。
 *
 * @return {Object} { text, fixLog, wasFixed }
 */
function _enforceCharLimitFallback_(cleanedText, postType, rates, originalBeforeFix) {
  try {
    var typeConfig = (typeof POST_TYPES !== 'undefined' && POST_TYPES[postType]) ? POST_TYPES[postType] : {};
    var charMax = typeConfig.charMax || 420;
    var hashtagMatch = cleanedText.match(/\n*[ \t]*(#\S+(?:[ \t]+#\S+)*)\s*$/);
    var bodyText = hashtagMatch ? cleanedText.slice(0, hashtagMatch.index).trim() : cleanedText.trim();
    var bodyLength = bodyText.length;

    if (bodyLength > charMax && typeof trimToCharMax_ === 'function') {
      console.log('⚠️ Stage 1失敗時フォールバック: 文字数超過(' + bodyLength + '/' + charMax + ') → 圧縮実行');
      var trimmed = trimToCharMax_(cleanedText, charMax);
      if (typeof applyPostProcessingChain_ === 'function') {
        trimmed = applyPostProcessingChain_(trimmed, postType, rates);
      }
      return {
        text: trimmed,
        fixLog: '【Stage 1失敗フォールバック: 文字数圧縮】' + bodyLength + '→' + charMax + '文字以内\n',
        wasFixed: true
      };
    }
    return { text: cleanedText, fixLog: '', wasFixed: false };
  } catch (e) {
    console.log('⚠️ _enforceCharLimitFallback_ 失敗(続行): ' + e.message);
    return { text: cleanedText, fixLog: '', wasFixed: false };
  }
}


// ========================================
// メインエントリ
// ========================================

/**
 * v13.0 検証フロー本体
 *
 * 既存 executeQualityReviewChain_ の代替として呼ばれる。
 * 戻り値の形式は既存と互換(text / fixLog / wasFixed / originalBeforeFix)。
 *
 * @param {string} cleanedText - 投稿テキスト(生成直後・後処理適用済み)
 * @param {Object} factResult - factCheck結果(v13.0では未使用・互換性のため受け取る)
 * @param {string} postType - 投稿タイプ
 * @param {Object} rates - レートデータ
 * @param {Object} keys - APIキー
 * @param {Object} csForFactCheck - 通貨強弱データ(互換性のため受け取る)
 * @param {Date} startTime - generatePost開始時刻
 * @param {number} TIME_LIMIT_SEC - 時間制限(秒)
 * @return {Object} { text, fixLog, wasFixed, originalBeforeFix }
 */
function executeValidationV13_(cleanedText, factResult, postType, rates, keys, csForFactCheck, startTime, TIME_LIMIT_SEC) {
  var originalBeforeFix = cleanedText;
  var fixLog = '';
  var wasFixed = false;

  console.log('');
  console.log('========================================');
  console.log('🚀 v13.0 総合検証フロー開始: ' + postType);
  console.log('========================================');

  // ========================================
  // ★v13.0.4 二重実行防止ガード(Phase A → Phase B 再実行を回避)
  // Phase A(generatePost)で v13.0 実行済みの場合、
  // Phase B(executeQualityReviewChain_)からの再呼び出しをスキップする
  //
  // 判定ロジック: ScriptProperties の V13_LAST_EXECUTED_{postType} に
  // 最終実行時刻を記録し、180秒以内の再実行はスキップする
  // ========================================
  var props = PropertiesService.getScriptProperties();
  var lastExecKey = 'V13_LAST_EXECUTED_' + postType;
  var lastExecStr = props.getProperty(lastExecKey);
  if (lastExecStr) {
    var lastExec = parseInt(lastExecStr, 10);
    var elapsedSinceLastExec = (new Date().getTime() - lastExec) / 1000;
    if (elapsedSinceLastExec < 180) {
      console.log('⏭️ v13.0 重複実行防止: ' + Math.round(elapsedSinceLastExec) + '秒前にPhase Aで実行済み → スキップ');
      console.log('========================================');
      // Phase A で保存済みの LAST_FACT_CHECK は上書きしない(Phase A の結果を維持)
      return { text: cleanedText, fixLog: '', wasFixed: false, originalBeforeFix: originalBeforeFix };
    }
  }

  // SKIP_FACT_CHECK 互換(テスト用全スキップ)
  var skipFactCheck = props.getProperty('SKIP_FACT_CHECK') === 'true';
  if (skipFactCheck) {
    console.log('⚠️ SKIP_FACT_CHECK=true → v13.0全処理スキップ');
    _saveV13LegacyJson_(postType, { stageResult: null, wasFixed: false, originalText: originalBeforeFix, fixedText: cleanedText, fixLog: '' });
    return { text: cleanedText, fixLog: fixLog, wasFixed: false, originalBeforeFix: originalBeforeFix };
  }

  // 時間制限チェック(残り60秒未満ならスキップ)
  var elapsed = (new Date() - startTime) / 1000;
  if (elapsed > TIME_LIMIT_SEC - 60) {
    console.log('⏱️ 経過' + Math.round(elapsed) + '秒 → v13.0スキップ(時間制限)');
    _saveV13LegacyJson_(postType, { stageResult: null, wasFixed: false, originalText: originalBeforeFix, fixedText: cleanedText, fixLog: '' });
    return { text: cleanedText, fixLog: fixLog, wasFixed: false, originalBeforeFix: originalBeforeFix };
  }

  // ★v13.0.4 実行開始時刻を記録(次回180秒以内の再実行をブロックするため)
  props.setProperty(lastExecKey, new Date().getTime().toString());

  // ========================================
  // Stage 1: 総合レビュー(Claude + Web検索1回)
  // ========================================
  var stageResult;
  try {
    stageResult = runComprehensiveReview_(cleanedText, postType, rates, keys);
  } catch (e) {
    console.log('❌ Stage 1 例外 → 検証スキップ・文字数保証のみ実行: ' + e.message);
    // ★v13.0.5 Stage 1失敗時でも文字数保証は必ず走らせる(最低限の品質ガード)
    var fallbackResultEx = _enforceCharLimitFallback_(cleanedText, postType, rates, originalBeforeFix);
    _saveV13LegacyJson_(postType, { stageResult: null, wasFixed: fallbackResultEx.wasFixed, originalText: originalBeforeFix, fixedText: fallbackResultEx.text, fixLog: fallbackResultEx.fixLog });
    return { text: fallbackResultEx.text, fixLog: fallbackResultEx.fixLog, wasFixed: fallbackResultEx.wasFixed, originalBeforeFix: originalBeforeFix };
  }

  if (!stageResult) {
    console.log('⚠️ Stage 1 失敗 → 修正なしで続行・文字数保証のみ実行');
    // ★v13.0.5 Stage 1失敗時でも文字数保証は必ず走らせる
    var fallbackResult = _enforceCharLimitFallback_(cleanedText, postType, rates, originalBeforeFix);
    _saveV13LegacyJson_(postType, { stageResult: null, wasFixed: fallbackResult.wasFixed, originalText: originalBeforeFix, fixedText: fallbackResult.text, fixLog: fallbackResult.fixLog });
    return { text: fallbackResult.text, fixLog: fallbackResult.fixLog, wasFixed: fallbackResult.wasFixed, originalBeforeFix: originalBeforeFix };
  }

  // Stage 1 ログ出力
  console.log('📊 Stage 1 結果: quality=' + (stageResult.quality || []).length +
              ' / factErrors=' + (stageResult.factErrors || []).length +
              ' / logical=' + (stageResult.logical || []).length +
              ' / webClaims=' + (stageResult.webClaims || []).length);

  // 問題がなければ Stage 2 スキップ
  var hasAnyIssue = (stageResult.quality || []).length > 0 ||
                    (stageResult.factErrors || []).length > 0 ||
                    (stageResult.logical || []).length > 0 ||
                    (stageResult.webClaims || []).filter(function(c) { return c.verdict === 'NG' || c.verdict === 'WARN'; }).length > 0;

  if (!hasAnyIssue) {
    console.log('✅ Stage 1: 問題検出ゼロ → Stage 2スキップ');
    _saveV13LegacyJson_(postType, { stageResult: stageResult, wasFixed: false, originalText: originalBeforeFix, fixedText: cleanedText, fixLog: '' });
    _writeInteractiveVerifyLogFromV13_(postType, stageResult, cleanedText, cleanedText, false);
    cacheTodayPost_(postType, cleanedText);
    return { text: cleanedText, fixLog: fixLog, wasFixed: false, originalBeforeFix: originalBeforeFix };
  }

  // ========================================
  // Stage 2: 修正適用(優先度順)
  // ========================================
  var fixed;
  try {
    fixed = applyFixesV13_(cleanedText, stageResult, postType, rates, keys);
  } catch (e) {
    console.log('❌ Stage 2 例外 → 修正なしで続行: ' + e.message);
    _saveV13LegacyJson_(postType, { stageResult: stageResult, wasFixed: false, originalText: originalBeforeFix, fixedText: cleanedText, fixLog: '' });
    return { text: cleanedText, fixLog: fixLog, wasFixed: false, originalBeforeFix: originalBeforeFix };
  }

  cleanedText = fixed.text;
  fixLog = fixed.fixLog;
  wasFixed = fixed.wasFixed;

  // 後処理チェーンを最後に1回適用
  if (wasFixed) {
    cleanedText = applyPostProcessingChain_(cleanedText, postType, rates);
    console.log('✅ v13.0 修正完了 → 後処理チェーン適用');
  }

  // ========================================
  // ★v13.0 文字数保証(qualityReview.gs の trimToCharMax_ を流用)
  // v12.10 の qualityReviewPost_ Step 3 と同等の処理
  // 修正後テキストが charMax を超える場合、末尾から文単位で削って範囲内に収める
  // ========================================
  try {
    var typeConfigForLimit = (typeof POST_TYPES !== 'undefined' && POST_TYPES[postType]) ? POST_TYPES[postType] : {};
    var charMax = typeConfigForLimit.charMax || 420;
    var hashtagMatch = cleanedText.match(/\n*[ \t]*(#\S+(?:[ \t]+#\S+)*)\s*$/);
    var bodyTextForLimit = hashtagMatch ? cleanedText.slice(0, hashtagMatch.index).trim() : cleanedText.trim();
    var bodyLength = bodyTextForLimit.length;
    console.log('📏 v13.0 最終本文: ' + bodyLength + '文字(ハッシュタグ' + (hashtagMatch ? 'あり' : 'なし') + ')');

    if (bodyLength > charMax && typeof trimToCharMax_ === 'function') {
      console.log('⚠️ v13.0 最終本文が文字数超過(' + bodyLength + '/' + charMax + ') → コード側で圧縮');
      cleanedText = trimToCharMax_(cleanedText, charMax);
      // 後処理チェーン再適用(圧縮後の整形)
      cleanedText = applyPostProcessingChain_(cleanedText, postType, rates);
      fixLog += '【文字数圧縮】' + bodyLength + '→' + charMax + '文字以内\n';
      wasFixed = true;
    }

    // ★v13.0.8 段階2補強: 構造整合性の最終チェック(機械的)
    //   Stage 1 が Q8 で検出できなかった場合の最後の砦
    //   鉤括弧の破綻を検出してログ警告(ここでは破壊的修正はしない)
    var structureIssues = detectStructureBreaks_(cleanedText);
    if (structureIssues.length > 0) {
      console.log('⚠️ v13.0 構造整合性の警告: ' + structureIssues.join(' / '));
      fixLog += '【構造警告】' + structureIssues.join(' / ') + '\n';
    }
  } catch (trimErr) {
    console.log('⚠️ v13.0 文字数保証処理で例外(続行): ' + trimErr.message);
  }

  // キャッシュ保存(既存互換)
  cacheTodayPost_(postType, cleanedText);

  // ========================================
  // アダプタ層: 既存フォーマット互換のJSONを保存
  // ========================================
  _saveV13LegacyJson_(postType, {
    stageResult: stageResult,
    wasFixed: wasFixed,
    originalText: originalBeforeFix,
    fixedText: cleanedText,
    fixLog: fixLog
  });

  // 対話型検証ログシートへ書き込み(アダプタ層経由で既存スキーマと互換)
  _writeInteractiveVerifyLogFromV13_(postType, stageResult, originalBeforeFix, cleanedText, wasFixed);

  console.log('========================================');
  console.log('🏁 v13.0 検証フロー完了: wasFixed=' + wasFixed);
  console.log('========================================');

  return {
    text: cleanedText,
    fixLog: fixLog,
    wasFixed: wasFixed,
    originalBeforeFix: originalBeforeFix
  };
}


// ========================================
// Stage 1: 総合レビュー
// ========================================

/**
 * Stage 1: Claude + Web検索で全観点を1回で判定する
 *
 * @param {string} cleanedText - 投稿テキスト
 * @param {string} postType - 投稿タイプ
 * @param {Object} rates - レートデータ
 * @param {Object} keys - APIキー
 * @return {Object|null} { quality, factErrors, logical, webClaims } または null
 */
function runComprehensiveReview_(cleanedText, postType, rates, keys) {
  var claudeKey = (keys && keys.CLAUDE_API_KEY) || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!claudeKey) {
    console.log('⚠️ CLAUDE_API_KEY未設定 → Stage 1スキップ');
    return null;
  }

  // 確定データ収集(既存関数を再利用)
  var anchorData;
  try {
    anchorData = collectAnchorData_(rates, keys, { includeCalendar: true, includeOngoingEvents: true, calendarScope: 'today' });
  } catch (e) {
    console.log('⚠️ collectAnchorData_失敗: ' + e.message);
    return null;
  }

  // 今日の過去投稿(重複チェック用)
  var previousPosts = [];
  try {
    previousPosts = getTodayPreviousPosts_();
  } catch (e) {
    console.log('⚠️ getTodayPreviousPosts_失敗(続行): ' + e.message);
  }

  // 投稿タイプ設定
  var typeConfig = (typeof POST_TYPES !== 'undefined' && POST_TYPES[postType]) ? POST_TYPES[postType] : {};
  var charMin = typeConfig.charMin || 200;
  var charMax = typeConfig.charMax || 420;

  // プロンプト組立
  var prompt = buildComprehensiveReviewPrompt_(cleanedText, postType, typeConfig, charMin, charMax, anchorData, previousPosts);

  // Claude API呼び出し(Web検索有効・max_tokens 8192)
  console.log('🔎 Stage 1: Claude総合レビュー呼び出し(Web検索最大' + V13_STAGE1_MAX_WEB_SEARCHES + '回・max_tokens ' + V13_STAGE1_MAX_TOKENS + ')');

  var systemPrompt = 'あなたはFX関連X投稿の総合レビュアーです。品質・事実・論理・Web検証の4観点を1度に判定し、JSON形式のみで出力してください。JSON以外の文字(前置き・解説・Chain of Thought・マークダウン)を一切出力してはいけません。';

  var apiResult = callClaudeApi_(prompt, claudeKey, {
    useWebSearch: true,
    maxSearchUses: V13_STAGE1_MAX_WEB_SEARCHES,
    maxTokens: V13_STAGE1_MAX_TOKENS,
    systemPrompt: systemPrompt,
    logPrefix: 'v13.0 Stage 1',
    maxRetries: 2
  });

  if (!apiResult || !apiResult.text) {
    console.log('❌ Stage 1 API呼び出し失敗');
    return null;
  }

  // JSONパース(フォールバック付き)
  var parsed = parseComprehensiveReviewResponse_(apiResult.text);
  if (!parsed) {
    console.log('❌ Stage 1 JSONパース失敗 → スキップ');
    return null;
  }

  // 正規化(空配列の補填)
  parsed.quality = parsed.quality || [];
  parsed.factErrors = parsed.factErrors || [];
  parsed.logical = parsed.logical || [];
  parsed.webClaims = parsed.webClaims || [];

  return parsed;
}


/**
 * Stage 1 プロンプト組立
 */
function buildComprehensiveReviewPrompt_(postText, postType, typeConfig, charMin, charMax, anchorData, previousPosts) {
  var p = '';

  // ★v14.0 Phase 5(2026-04-22): 確定データを冒頭の最優先位置に配置
  //   背景: 2026-04-22 LONDON 事件で、確定データの「備考」列に「連続利上げ」と明記されていたが、
  //         30,000字のプロンプト内で埋もれて Stage 1 Claude が見落とし、投稿の「連続利上げ」を
  //         論理矛盾として誤検出した。
  //   対処: 確定データを冒頭に★★★マーカー付きで配置し、Claude の attention を最初に確実に当てる。
  if (anchorData && typeof anchorData.toVerifyPrompt === 'function') {
    p += '★★★━━━━━━━━━━━━━━━━━━━━━━━★★★\n';
    p += '★★★   最優先参照情報: 確定データ       ★★★\n';
    p += '★★★━━━━━━━━━━━━━━━━━━━━━━━★★★\n';
    p += '以下の確定データは Twelve Data API とコンパナ手動管理のスプレッドシートから取得された、\n';
    p += '本投稿評価における最も信頼できる情報源。\n';
    p += '★★★ 投稿の記述が以下の確定データと一致する場合、絶対に「事実誤り」「論理矛盾」と判定するな ★★★\n';
    p += '★★★ 特に【備考】列の記述は文脈を含む事実。例: 「連続利上げ」「据え置き中」等の時系列表現は絶対優先 ★★★\n\n';
    p += anchorData.toVerifyPrompt() + '\n';
    p += '★★★━━━━━━━━━━━━━━━━━━━━━━━★★★\n\n';
  }

  p += '【タスク】\n';
  p += '以下のFX関連X投稿について、4観点を一括判定してJSON形式で出力せよ。\n';
  p += '検証には必ず web_search を使え。内部知識のみでの判定は禁止。\n';
  p += '3〜5回の検索を活用して事実・最新性を確認せよ。\n\n';

  p += '【投稿タイプ】' + postType + '(' + (typeConfig.label || '') + ')\n';
  p += '【文字数制限】' + charMin + '〜' + charMax + '文字\n\n';

  p += '【投稿テキスト】\n';
  p += postText + '\n\n';

  // 今日の既存投稿(重複チェック用)
  if (previousPosts && previousPosts.length > 0) {
    p += '【今日の既存投稿(重複チェック用・最大5件)】\n';
    var limit = Math.min(previousPosts.length, 5);
    for (var i = 0; i < limit; i++) {
      var pp = previousPosts[i];
      p += '- [' + (pp.type || '') + '] ' + (pp.text || '').substring(0, 80) + '...\n';
    }
    p += '\n';
  }

  // 判定観点
  p += '【判定観点(A〜D)】\n\n';

  p += 'A. 品質チェック(Q1-Q7):\n';
  p += '   Q1 投稿タイプの役割・時間帯と本文が整合しているか\n';
  p += '   Q2 今日の既存投稿と表現・切り口が過剰に重複していないか\n';
  p += '   Q3 投稿として完成度が高いか(論旨・結論が明瞭か)\n';
  p += '   Q4 文字数が ' + charMin + '〜' + charMax + ' の範囲内か\n';
  p += '   Q5 コンパナらしい口調か(★v13.0.6 厳格化・AI感/アナリスト調を徹底検出):\n';
  p += '     ■ severity=error(即修正必須)の NG パターン:\n';
  p += '       - アナリストレポート調の体言止め連発: 「〜を確認。」「〜が示された。」「〜の局面。」\n';
  p += '       - 冗長な報告調の連続: 「〜構図です。」「〜地合いです。」「〜展開ですね。」が3回以上\n';
  p += '       - 二重硬文末: 「〜ではあるが〜という状況で〜という展開」のような過度な複文\n';
  p += '       - AI翻訳調: 「〜という点で興味深い」「〜と言える」「〜と考えられます」\n';
  p += '       - 同じ語尾が2回以上連続(「〜です。〜です。」「〜ますね。〜ますね。」)\n';
  p += '       - 絵文字行以外が全て「〜です/ます/でした」で終わっている(硬さの象徴)\n';
  p += '       - 「見てください」「ご覧ください」等の敬体過剰\n';
  p += '     ■ severity=warning の気になるパターン:\n';
  p += '       - 生きた実感が欠ける抽象描写: 「上昇優位」「堅調な推移」「拡大の構図」\n';
  p += '       - 硬すぎる接続詞: 「〜に対し」「〜一方で」「〜を踏まえると」の多用\n';
  p += '     ■ OK パターン(コンパナらしい口調):\n';
  p += '       - 「〜ですね」「〜ってわけです」「〜なんですよね」「〜と感じてます」\n';
  p += '       - 「正直」「マジで」「ぶっちゃけ」「ちょっと」の自然な挿入\n';
  p += '       - 「〜かなと思います」「〜って感じです」「〜かもしれないですね」等、動詞で完結\n';
  p += '       - 短文の体感的描写: 「0.71台まで来てますね」「ここは見送るのが鉄則です」\n';
  p += '     ■ ★文末の未完結(v13.0.7 追加):\n';
  p += '       - NG(error): 「〜かなと。」「〜とこ。」「〜感じ。」など助詞で切る終わり方\n';
  p += '       - OK: 「〜かなと思います。」「〜とこですね。」「〜感じです。」で動詞完結\n';
  p += '     ■ 判定の鉄則: 1文でも「人間が書いたと思えない」硬い文があれば severity=error で拾え。\n';
  p += '     ■ 修正方針は「その文を崩した話し言葉に置き換えよ」と fix_hint に具体的に書け。\n';
  p += '   Q6 事実検証(下記Bで詳細)\n';
  p += '   Q7 絵文字行(☕📕📝📋💡⚠️✅)は体言止め・動詞止めか(★v12.4確立)\n';
  p += '      OK: 「📝米イラン交渉が決裂。」「🛢原油、100ドル突破。」\n';
  p += '      NG: 「📝米イラン交渉が決裂しました。」「〜しています。」\n';
  p += '   Q8 ★構造整合性(★v13.0.8 新設):\n';
  p += '      (a) 鉤括弧「」『』の対応チェック:\n';
  p += '          ・開いた鉤括弧は必ず閉じられているか(数の対応・位置の対応)\n';
  p += '          ・鉤括弧の中で改行していないか\n';
  p += '          ・鉤括弧の中に「→」が入っていないか\n';
  p += '          ・鉤括弧の中に絵文字(☕📕📝📋💡⚠️✅)が入っていないか\n';
  p += '      (b) →行の文脈継承チェック:\n';
  p += '          ・→で始まる行が、直前の行の内容から意味的に自然につながっているか\n';
  p += '          ・直前の行が鉤括弧の途中で終わっていないか(鉤括弧が途中で切れて→が出てくるのは破綻)\n';
  p += '      (c) 破綻の判定:\n';
  p += '          ・上記のいずれかに違反していれば severity=error で quality に追加\n';
  p += '          ・fix_hint には「鉤括弧を1行で閉じる」「→を鉤括弧の外に移動」等、具体的な修正指示を書け\n';
  p += '      (d) 例:\n';
  p += '          NG: 「原油下落\\n→反落」(鉤括弧の中で改行・→が入っている)\n';
  p += '          OK: 「原油下落で豪ドル反落」(鉤括弧内で完結)\n\n';

  p += 'B. 事実検証(Q6):\n';
  p += '   ■ ★★★ Step 0: 確定データとの照合(最初に必ず実行せよ) ★★★\n';
  p += '     (1) 投稿の各主張を、冒頭の【確定データ】と1つずつ照合せよ\n';
  p += '     (2) 確定データに一致する記述は「正しい」と判定し、factErrors/logical に入れるな\n';
  p += '     (3) 特に【主要中銀の政策金利】の「備考」列(括弧内)に書かれた時系列表現は事実として扱え\n';
  p += '         例: 投稿「RBAの連続利上げ」+ 確定データ「RBA 4.10%(2026年3月17日に利上げ。連続利上げ)」\n';
  p += '             → この投稿は確定データと一致。絶対に「連続利上げは不正確」と判定するな\n';
  p += '         例: 投稿「日銀利上げ路線」+ 確定データ「日銀 0.75%(2025年12月利上げ。緩やかな引き締め路線)」\n';
  p += '             → 確定データと一致。誤り判定するな\n';
  p += '   ■ Step 1(Step 0で問題なかった主張のみ対象):\n';
  p += '     判定優先順位: (1)確定データ > (2)Web検索 > (3)本文内数値 > (4)内部知識\n';
  p += '   ■ 確定データと矛盾する主張、Web検索で反証できる主張を検出せよ\n';
  p += '   ■ 時間軸を含む主張(「週中高値」「急落率」「〜年以来」「何時頃」等)は\n';
  p += '     現在値では反証不能なので factErrors に入れるな(「検証不能」として扱う)\n';
  p += '   ■ 未発表イベントを過去形で書いている場合は最優先で検出\n\n';

  p += 'C. 論理整合性(Q6.5):\n';
  p += '   事実は正しくても論理矛盾する投稿を検出せよ。\n';
  p += '   例: 「予想は外れた」と「着地点は合っていた」が同居 → 矛盾\n';
  p += '   例: 「リスクオン」と「円高進行」が同居 → 矛盾\n';
  p += '   例: 因果が逆転した記述(原油下落でドル高 等)\n';
  p += '   ★この項目は最優先で修正すべき(事実が正しくても論理破綻投稿は価値ゼロ)\n\n';

  p += 'D. Web検証可能なclaim抽出(最大5件・★v14.0 Phase 5 で3件→5件に拡張):\n';
  p += '   ★★★ 抽出優先順位(この順で主張を拾え) ★★★\n';
  p += '   優先1: 中央銀行の政策・金利・会合日程に関する主張(最重要)\n';
  p += '          例: 「日銀4月会合で利上げ見送り」「FRB据え置き決定」「ECB次回会合」\n';
  p += '   優先2: 要人発言の内容・日付に関する主張\n';
  p += '          例: 「ウォーシュ公聴会でタカ派発言」「ラガルド総裁発言」\n';
  p += '   優先3: 経済指標の発表・結果に関する主張\n';
  p += '          例: 「米3月小売売上高が上振れ」「CPI発表で市場反応」\n';
  p += '   優先4: 特定通貨・ペアの価格・変動率の主張\n';
  p += '          例: 「ドル円159円台で膠着」「豪ドル3.8%急騰」\n';
  p += '   優先5: 地政学イベント(停戦・合意等)に関する主張\n';
  p += '          例: 「米イラン停戦期限が延長」「ホルムズ海峡閉鎖」\n';
  p += '\n';
  p += '   ★★★ 各 claim を独立して web_search で裏付け確認 ★★★\n';
  p += '   1 claim につき 1 回の web_search を使うのが理想。5回枠を効率的に使え。\n';
  p += '   ❌(NG・明確に反証): 投稿の主張が事実と明確に矛盾(Web検索で別事実が確認された)\n';
  p += '   ⚠️(WARN・裏付け不十分): 検索しても裏付けが見つからない/弱い\n';
  p += '   ✅(OK・確認済み): 検索結果で裏付けあり\n';
  p += '\n';
  p += '   ★★★ Step 0 で確定データと一致した主張は、webClaims に入れるな(検索枠の無駄) ★★★\n\n';

  p += '【出力の鉄則(絶対厳守)】\n';
  p += '- JSON 以外一切出力禁止(前置き・解説・Chain of Thought禁止)\n';
  p += '- 各フィールドの説明は簡潔に(problem は120字以内、reason は80字以内)\n';
  p += '- 推論過程は書かない。結論のみ書け\n';
  p += '- 指摘がないフィールドは空配列 [] を返せ\n';
  p += '- source_url は最も信頼できるもの1つで十分(複数URLを並べるな)\n';
  p += '- 目標合計出力: 2,000トークン以内\n';
  p += '- ★v13.0.5 JSON文字列値の内部では英語ダブルクォート(")を絶対に使うな。引用したい時は日本語鉤括弧「」を使え。\n';
  p += '  例1 NG: "problem": "「ここは"過去記録から改善"という同一テーマ」" ← 内部の"がJSON破壊\n';
  p += '  例1 OK: "problem": "「ここは『過去記録から改善』という同一テーマ」"\n';
  p += '  例2 NG: "claim": "トランプ氏が "停戦延長" と発言"\n';
  p += '  例2 OK: "claim": "トランプ氏が「停戦延長」と発言"\n';
  p += '- マークダウンコードブロック(```json ... ```)で囲まず、生のJSONのみ出力せよ\n\n';

  p += '【出力形式(JSON のみ)】\n';
  p += '{\n';
  p += '  "quality": [{"id": "Q3", "severity": "error"|"warning", "problem": "...", "fix_hint": "..."}],\n';
  p += '  "factErrors": [{"wrong": "...", "correct": "...", "reason": "..."}],\n';
  p += '  "logical": [{"problem": "...", "suggested_direction": "..."}],\n';
  p += '  "webClaims": [{"claim": "...", "verdict": "NG"|"WARN"|"OK", "source_url": "...", "reason": "..."}]\n';
  p += '}\n\n';

  // ★v14.0 Phase 3(2026-04-22): factErrors.correct の厳格ルール
  //   背景: LUNCH 本番で correct に解説文「ただし確定データでは0.041と一致する。数値自体は正しい。」が混入し、
  //         投稿本文に直接置換されて意味不明な投稿になった事件への対応
  p += '【★factErrors の書式(絶対厳守・2026-04-22 追加)】\n';
  p += '事実誤りは機械置換(text.split(wrong).join(correct))で適用されるため、以下を絶対に守れ:\n';
  p += '\n';
  p += '1. wrong: 本文中に そのまま 存在する誤り部分だけを抜き出す(コピペで検索可能な文字列)\n';
  p += '2. correct: wrong をそのまま置き換える完成テキストのみ(短く、投稿として自然)\n';
  p += '3. reason: 修正理由は reason フィールドにのみ書く(correct には絶対混入させるな)\n';
  p += '\n';
  p += '★correct に入れてはいけないもの(絶対禁止):\n';
  p += '  - 「ただし」「なお」「ちなみに」等の補足接続詞から始まる文\n';
  p += '  - 「数値自体は正しい」「一致する」等のメタ判定\n';
  p += '  - 「確定データでは〜と表記されており」等の検証プロセス説明\n';
  p += '  - 「reason」相当の修正理由文\n';
  p += '  - 2文以上の長い説明(置換後の投稿が破綻する)\n';
  p += '\n';
  p += '★OK例:\n';
  p += '  wrong: "RBA利上げ(現在4.10%)"\n';
  p += '  correct: "RBAが4.10%で据え置き中"\n';
  p += '  reason: "RBAは2026年3月17日に4.10%へ利上げ済み。現在は据え置き中で、『利上げ』は不正確"\n';
  p += '\n';
  p += '★NG例(絶対にこう書くな):\n';
  p += '  correct: "RBAの現在の政策金利は4.10%(2026年3月17日に3.85%→4.10%へ利上げ)。ただし確定データでは0.041 (=4.10%)と表記されており一致する。数値自体は正しい。"\n';
  p += '  → correct は wrong を置き換える短いテキストだけ。解説は reason へ。\n';
  p += '\n';
  p += '★テスト: correct を wrong の位置に入れて読み返し、投稿として自然か確認せよ。\n';
  p += '  不自然なら correct が長すぎるか、解説が混入している。\n';

  return p;
}


/**
 * Stage 1 JSON パース(フォールバック付き)
 */
function parseComprehensiveReviewResponse_(text) {
  if (!text) return null;

  // 試行1: そのままパース
  try {
    return JSON.parse(text);
  } catch (e1) {
    // 続行
  }

  // 試行2: ```json ... ``` マークダウンブロック除去
  var cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e2) {
    // 続行
  }

  // 試行3: 最初の { から最後の } までを抽出
  var firstBrace = text.indexOf('{');
  var lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    var extracted = text.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(extracted);
    } catch (e3) {
      // 続行
    }

    // 試行4: 切れたJSONの修復(末尾に閉じ括弧を追加)
    try {
      var repaired = _repairTruncatedJson_(extracted);
      if (repaired) {
        return JSON.parse(repaired);
      }
    } catch (e4) {
      // 続行
    }
  }

  console.log('⚠️ JSONパース全試行失敗。先頭200文字: ' + text.substring(0, 200));
  return null;
}


/**
 * 切れたJSONの簡易修復
 * max_tokens到達で末尾が切れたケースを想定
 */
function _repairTruncatedJson_(text) {
  if (!text) return null;

  // 閉じていない括弧・引用符を推定して閉じる
  var openBraces = (text.match(/\{/g) || []).length;
  var closeBraces = (text.match(/\}/g) || []).length;
  var openBrackets = (text.match(/\[/g) || []).length;
  var closeBrackets = (text.match(/\]/g) || []).length;

  var repaired = text;

  // 末尾がカンマで終わっていれば除去
  repaired = repaired.replace(/,\s*$/, '');

  // 引用符が奇数個なら末尾に追加
  var quoteCount = (repaired.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    repaired += '"';
  }

  // 配列の閉じ括弧を補う
  while (closeBrackets < openBrackets) {
    repaired += ']';
    closeBrackets++;
  }

  // オブジェクトの閉じ括弧を補う
  while (closeBraces < openBraces) {
    repaired += '}';
    closeBraces++;
  }

  return repaired;
}


// ========================================
// Stage 2: 修正適用(優先度順)
// ========================================

/**
 * Stage 2: Stage 1 の検出結果に基づいて修正を適用する
 *
 * 優先度:
 *   1. 論理矛盾(logical)    → Claude 1回呼び出し(元投稿ベース)
 *   2. 事実誤り(factErrors) → コード replace で機械置換
 *   3. WebClaim NG          → 該当行削除
 *   4. WebClaim WARN        → Claude 1回呼び出し(自然な削除/書き換え)
 *   5. 品質一括(quality)    → Claude 1回呼び出し(最後にまとめて)
 *
 * @return {Object} { text, fixLog, wasFixed }
 */
function applyFixesV13_(cleanedText, stageResult, postType, rates, keys) {
  var fixLog = '';
  var wasFixed = false;
  var text = cleanedText;

  var claudeKey = (keys && keys.CLAUDE_API_KEY) || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');

  // ---- 1. 論理矛盾修正 ----
  if (stageResult.logical && stageResult.logical.length > 0) {
    console.log('🔧 修正1: 論理矛盾 ' + stageResult.logical.length + '件');
    var logicalResult = applyLogicalFix_(text, stageResult.logical, postType, rates, keys, claudeKey);
    if (logicalResult && logicalResult !== text) {
      text = logicalResult;
      fixLog += '【論理矛盾修正(Claude)】' + stageResult.logical.length + '件\n';
      for (var li = 0; li < stageResult.logical.length; li++) {
        fixLog += '  ' + (stageResult.logical[li].problem || '').substring(0, 80) + '\n';
      }
      wasFixed = true;
    }
  }

  // ---- 2. 事実誤り機械置換 ----
  if (stageResult.factErrors && stageResult.factErrors.length > 0) {
    console.log('🔧 修正2: 事実誤り ' + stageResult.factErrors.length + '件');
    var factFixResult = applyFactErrorFix_(text, stageResult.factErrors);
    if (factFixResult.text !== text) {
      text = factFixResult.text;
      fixLog += '【事実誤り機械置換】' + factFixResult.appliedCount + '件適用';
      // ★v14.0 Phase 3: サニタイズ件数を表示
      if (factFixResult.sanitizedCount && factFixResult.sanitizedCount > 0) {
        fixLog += '(correct解説混入ガード発動: ' + factFixResult.sanitizedCount + '件)';
      }
      fixLog += '\n';
      for (var fi = 0; fi < factFixResult.appliedList.length; fi++) {
        fixLog += '  ' + factFixResult.appliedList[fi] + '\n';
      }
      wasFixed = true;
    }
  }

  // ---- 3. WebClaim NG は該当行削除 ----
  var ngClaims = (stageResult.webClaims || []).filter(function(c) { return c.verdict === 'NG'; });
  if (ngClaims.length > 0) {
    console.log('🔧 修正3: Web検証NG ' + ngClaims.length + '件 → 該当行削除');
    var ngIssues = ngClaims.map(function(c) { return { claim: c.claim, removable: true }; });
    var ngRemoved = forceRemoveIssueLines_(text, ngIssues);
    if (ngRemoved !== text) {
      text = ngRemoved;
      fixLog += '【Web検証NG削除】' + ngClaims.length + '件\n';
      for (var ni = 0; ni < ngClaims.length; ni++) {
        fixLog += '  ❌ ' + (ngClaims[ni].claim || '').substring(0, 60) + '\n';
      }
      wasFixed = true;
    }
  }

  // ---- 4. WebClaim WARN は Claude で自然修正 ----
  var warnClaims = (stageResult.webClaims || []).filter(function(c) { return c.verdict === 'WARN'; });
  if (warnClaims.length > 0 && claudeKey) {
    console.log('🔧 修正4: Web検証WARN ' + warnClaims.length + '件 → Claude修正');
    var warnResult = applyWebClaimWarnFix_(text, warnClaims, postType, rates, keys, claudeKey);
    if (warnResult && warnResult !== text) {
      text = warnResult;
      fixLog += '【Web検証WARN修正(Claude)】' + warnClaims.length + '件\n';
      for (var wi = 0; wi < warnClaims.length; wi++) {
        fixLog += '  ⚠️ ' + (warnClaims[wi].claim || '').substring(0, 60) + '\n';
      }
      wasFixed = true;
    }
  }

  // ---- 5. 品質一括修正(Claude) ----
  // error severity のみ対象。warning は参考として記録するだけ
  var qualityErrors = (stageResult.quality || []).filter(function(q) { return q.severity === 'error'; });
  if (qualityErrors.length > 0 && claudeKey) {
    console.log('🔧 修正5: 品質 error ' + qualityErrors.length + '件 → Claude一括修正');
    var qualityResult = applyQualityFix_(text, qualityErrors, postType, rates, keys, claudeKey);
    if (qualityResult && qualityResult !== text) {
      text = qualityResult;
      fixLog += '【品質一括修正(Claude)】' + qualityErrors.length + '件\n';
      for (var qi = 0; qi < qualityErrors.length; qi++) {
        fixLog += '  ' + qualityErrors[qi].id + ': ' + (qualityErrors[qi].problem || '').substring(0, 60) + '\n';
      }
      wasFixed = true;
    }
  }

  return { text: text, fixLog: fixLog, wasFixed: wasFixed };
}


/**
 * 論理矛盾の修正(Claude 1回呼び出し)
 */
function applyLogicalFix_(text, logicalIssues, postType, rates, keys, claudeKey) {
  if (!claudeKey) return text;

  var anchorData;
  try {
    anchorData = collectAnchorData_(rates, keys, { includeCalendar: false, includeOngoingEvents: true });
  } catch (e) {
    anchorData = null;
  }

  var prompt = '';
  prompt += '以下のFX関連X投稿に論理矛盾があります。修正版を出力してください。\n\n';
  prompt += '【現在の投稿】\n' + text + '\n\n';
  prompt += '【検出された論理矛盾】\n';
  for (var i = 0; i < logicalIssues.length; i++) {
    prompt += (i + 1) + '. ' + logicalIssues[i].problem + '\n';
    if (logicalIssues[i].suggested_direction) {
      prompt += '   修正方針: ' + logicalIssues[i].suggested_direction + '\n';
    }
  }
  prompt += '\n';

  if (anchorData && typeof anchorData.toFixPrompt === 'function') {
    prompt += anchorData.toFixPrompt() + '\n';
  }

  prompt += '【修正ルール】\n';
  prompt += '1. 論理矛盾を解消する最小限の書き換えのみ行う\n';
  prompt += '2. 絵文字・フォーマット・口調は維持する\n';
  prompt += '3. ハッシュタグ(#...)は削除せずそのまま残す\n';
  prompt += '4. 修正後の本文のみを出力する。前置き・解説・JSON出力は禁止\n';

  // ★v13.0.3 文字数制限を明示(Claude が長文化するのを防ぐ)
  var typeConfigForLogical = (typeof POST_TYPES !== 'undefined' && POST_TYPES[postType]) ? POST_TYPES[postType] : {};
  var charMinLogical = typeConfigForLogical.charMin || 150;
  var charMaxLogical = typeConfigForLogical.charMax || 300;
  prompt += '5. 【文字数制限】修正後の本文(ハッシュタグ除く)は ' + charMinLogical + '〜' + charMaxLogical + ' 文字以内に収めよ(厳守)。超過禁止。\n';

  var result = callClaudeApi_(prompt, claudeKey, {
    maxTokens: V13_FIX_MAX_TOKENS,
    logPrefix: 'v13.0 論理矛盾修正',
    maxRetries: 2
  });

  if (!result || !result.text) return text;

  // マークダウンブロックを除去
  var cleaned = result.text.replace(/```[\s\S]*?\n|```/g, '').trim();
  if (cleaned.length < 20) return text; // 短すぎる応答は無視

  return cleaned;
}


/**
 * 事実誤りの機械置換(postText.replace で適用)
 * ★v14.0 Phase 3(2026-04-22): correct サニタイズ層追加
 *   背景: 2026-04-22 LUNCH 本番で correct に検証解説文が混入した事件への対応
 */
function applyFactErrorFix_(text, factErrors) {
  var appliedCount = 0;
  var appliedList = [];
  var sanitizedCount = 0;
  var working = text;

  for (var i = 0; i < factErrors.length; i++) {
    var err = factErrors[i];
    if (!err.wrong || !err.correct) continue;
    if (err.wrong === err.correct) continue;

    // 時間軸保護: wrong に時間軸を含む表現があればスキップ
    if (_containsTimeAxis_(err.wrong)) {
      console.log('  ⏭️ 時間軸保護でスキップ: ' + err.wrong.substring(0, 40));
      continue;
    }

    // ★v14.0 Phase 3: correct を置換前にサニタイズ(解説混入ガード)
    var sanitizeResult = sanitizeFactCorrect_(err.correct, err.wrong);
    var finalCorrect = sanitizeResult.clean;
    if (sanitizeResult.wasSanitized) {
      sanitizedCount++;
      console.log('  🧹 correct サニタイズ: ' + sanitizeResult.reason);
      console.log('     Before: ' + err.correct.substring(0, 60) + (err.correct.length > 60 ? '...' : ''));
      console.log('     After : ' + finalCorrect);
    }

    if (finalCorrect === err.wrong) continue;
    if (working.indexOf(err.wrong) === -1) continue;

    working = working.split(err.wrong).join(finalCorrect);
    appliedCount++;
    appliedList.push(err.wrong.substring(0, 40) + ' → ' + finalCorrect.substring(0, 40));
  }

  return { text: working, appliedCount: appliedCount, appliedList: appliedList, sanitizedCount: sanitizedCount };
}


/**
 * correct テキストから解説混入をサニタイズ
 * ★v14.0 Phase 3(2026-04-22)
 * 
 * 戻り値: { clean: string, wasSanitized: boolean, reason: string }
 */
function sanitizeFactCorrect_(correct, wrong) {
  if (!correct) return { clean: correct, wasSanitized: false, reason: '' };

  var original = correct;
  var clean = correct.trim();

  // ルール1: 解説マーカーで始まる2文目以降をカット
  //   Claudeが「〜。ただし〜。数値自体は〜」のように続けて書いた場合、
  //   「。」で分割して最初の文だけを残す
  var explanationMarkers = [
    'ただし',
    'なお',
    'ちなみに',
    'なお、',
    'ただし、',
    '数値自体',
    '一致する',
    '確定データでは',
    'と表記されており',
    'reason',
    '補足すると',
    'つまり',
    'すなわち'
  ];

  var sentences = clean.split('。');
  if (sentences.length > 1) {
    // 2文目以降に解説マーカーが含まれていれば、1文目のみ採用
    var laterParts = sentences.slice(1).join('。');
    for (var i = 0; i < explanationMarkers.length; i++) {
      if (laterParts.indexOf(explanationMarkers[i]) !== -1) {
        var firstSentence = sentences[0];
        if (firstSentence.length > 0) {
          // 元が「〜。」で終わっていた場合は句点を残す
          firstSentence = firstSentence + (clean.indexOf(firstSentence + '。') !== -1 ? '。' : '');
        }
        return {
          clean: firstSentence.trim(),
          wasSanitized: true,
          reason: '2文目以降に解説マーカー「' + explanationMarkers[i] + '」を検出'
        };
      }
    }
  }

  // ルール2: 長さ比較。correct が wrong の 3倍を超えていれば疑わしい
  //   正当なケース(短い wrong を長い correct に置換)を除外するため、
  //   50文字以上の超過時のみ検出
  if (correct.length > wrong.length * 3 && correct.length > wrong.length + 50) {
    // さらに、内部に解説マーカーが含まれているか確認
    for (var j = 0; j < explanationMarkers.length; j++) {
      if (clean.indexOf(explanationMarkers[j]) !== -1) {
        // 解説マーカー直前までで切る
        var markerPos = clean.indexOf(explanationMarkers[j]);
        var truncated = clean.substring(0, markerPos).trim();
        // 末尾に句点または完結記号がなければ付ける
        if (truncated.length > 0 && !/[。、.」]$/.test(truncated)) {
          truncated = truncated.replace(/[、,]\s*$/, '') + (truncated.length > 0 ? '。' : '');
        }
        if (truncated.length >= 3) {
          return {
            clean: truncated,
            wasSanitized: true,
            reason: '長さが wrong の ' + Math.round(correct.length / wrong.length) + '倍 + 解説マーカー「' + explanationMarkers[j] + '」検出'
          };
        }
      }
    }
  }

  return { clean: clean, wasSanitized: false, reason: '' };
}


/**
 * 時間軸を含む表現の判定(finalFactVerify_ と同等ルール)
 */
function _containsTimeAxis_(str) {
  if (!str) return false;
  var patterns = [
    /\d{1,2}時\d{0,2}分?/,       // 21時30分 等
    /\d{1,2}時/,                  // 21時 等
    /週中高値|週中安値/,
    /月中高値|月中安値/,
    /急落率|急騰率/,
    /\d+年以来/,
    /\d+[日週月年]ぶり/,
    /何時頃|いつ頃/,
    /午前|午後/,
    /\d+\.\d+%の(?:下落|上昇|急落|急騰)/
  ];
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(str)) return true;
  }
  return false;
}


/**
 * WebClaim WARN(裏付け不十分)の Claude 修正
 */
function applyWebClaimWarnFix_(text, warnClaims, postType, rates, keys, claudeKey) {
  if (!claudeKey || warnClaims.length === 0) return text;

  var prompt = '';
  prompt += '以下のFX関連X投稿の中に、Web検索で裏付けが取れなかった主張があります。\n';
  prompt += '該当部分を自然に削除するか、一般論に書き換えてください。\n\n';
  prompt += '【現在の投稿】\n' + text + '\n\n';
  prompt += '【裏付け不十分な主張】\n';
  for (var i = 0; i < warnClaims.length; i++) {
    prompt += (i + 1) + '. ' + warnClaims[i].claim + '\n';
    if (warnClaims[i].reason) {
      prompt += '   理由: ' + warnClaims[i].reason + '\n';
    }
  }
  prompt += '\n';
  prompt += '【修正ルール】\n';
  prompt += '1. 裏付け不十分な主張は削除、または「〜とされる」等の断定回避表現に置換\n';
  prompt += '2. 絵文字・フォーマット・口調は維持\n';
  prompt += '3. ハッシュタグはそのまま残す\n';
  prompt += '4. 修正後の本文のみを出力。前置き・解説禁止\n';

  // ★v13.0.3 文字数制限を明示(Claude が長文化するのを防ぐ)
  var typeConfigForWarn = (typeof POST_TYPES !== 'undefined' && POST_TYPES[postType]) ? POST_TYPES[postType] : {};
  var charMinWarn = typeConfigForWarn.charMin || 150;
  var charMaxWarn = typeConfigForWarn.charMax || 300;
  prompt += '5. 【文字数制限】修正後の本文(ハッシュタグ除く)は ' + charMinWarn + '〜' + charMaxWarn + ' 文字以内に収めよ(厳守)。超過禁止。\n';

  var result = callClaudeApi_(prompt, claudeKey, {
    maxTokens: V13_FIX_MAX_TOKENS,
    logPrefix: 'v13.0 WARN修正',
    maxRetries: 2
  });

  if (!result || !result.text) return text;

  var cleaned = result.text.replace(/```[\s\S]*?\n|```/g, '').trim();
  if (cleaned.length < 20) return text;

  return cleaned;
}


/**
 * 品質 error の Claude 一括修正
 */
function applyQualityFix_(text, qualityErrors, postType, rates, keys, claudeKey) {
  if (!claudeKey || qualityErrors.length === 0) return text;

  var anchorData;
  try {
    anchorData = collectAnchorData_(rates, keys, { includeCalendar: false, includeOngoingEvents: true });
  } catch (e) {
    anchorData = null;
  }

  var prompt = '';
  prompt += '以下のFX関連X投稿に品質上の問題があります。修正版を出力してください。\n\n';
  prompt += '【現在の投稿】\n' + text + '\n\n';
  prompt += '【検出された問題(優先度: Q6.5 > Q6 > Q5/Q7 > Q1/Q2/Q3 > Q4)】\n';
  for (var i = 0; i < qualityErrors.length; i++) {
    prompt += (i + 1) + '. [' + qualityErrors[i].id + '] ' + qualityErrors[i].problem + '\n';
    if (qualityErrors[i].fix_hint) {
      prompt += '   修正方針: ' + qualityErrors[i].fix_hint + '\n';
    }
  }
  prompt += '\n';

  if (anchorData && typeof anchorData.toFixPrompt === 'function') {
    prompt += anchorData.toFixPrompt() + '\n';
  }

  prompt += '【修正ルール】\n';
  prompt += '1. 指摘された問題のみを修正する(それ以外は変更しない)\n';
  prompt += '2. 絵文字・フォーマット・口調は維持する\n';
  prompt += '3. 絵文字行(☕📕📝📋💡⚠️✅)は体言止め・動詞止めで書く(v12.4ルール)\n';
  prompt += '4. ハッシュタグはそのまま残す\n';
  prompt += '5. 修正後の本文のみを出力。前置き・解説・JSON禁止\n';

  // ★v13.0.3 文字数制限を明示(Claude が長文化するのを防ぐ)
  var typeConfigForQuality = (typeof POST_TYPES !== 'undefined' && POST_TYPES[postType]) ? POST_TYPES[postType] : {};
  var charMinQuality = typeConfigForQuality.charMin || 150;
  var charMaxQuality = typeConfigForQuality.charMax || 300;
  prompt += '6. 【文字数制限】修正後の本文(ハッシュタグ除く)は ' + charMinQuality + '〜' + charMaxQuality + ' 文字以内に収めよ(厳守)。超過禁止。\n';

  // ★v13.0.2 キャラクター口調をプロンプト末尾に注入(attention最強位置)
  // スプレッドシート【キャラクター】シートから【ペルソナ】【発信の原則と口調】を取得
  // 固定文字列は使わず、シートがSSOT(単一の真実の源)
  var characterSections = _getCharacterSectionsFromSheet_();
  if (characterSections) {
    prompt += '\n【★★★ コンパナの口調(この指示が全てに優先する)】\n';
    prompt += 'ここまでのルールを踏まえた上で、最も重要なのは「コンパナとして自然に話す」こと。\n';
    prompt += '以下のキャラクターシートに定義された口調で書け。元投稿の語尾パターンを踏襲せよ。\n\n';
    prompt += characterSections + '\n';
  }

  var result = callClaudeApi_(prompt, claudeKey, {
    maxTokens: V13_FIX_MAX_TOKENS,
    logPrefix: 'v13.0 品質修正',
    maxRetries: 2
  });

  if (!result || !result.text) return text;

  var cleaned = result.text.replace(/```[\s\S]*?\n|```/g, '').trim();
  if (cleaned.length < 20) return text;

  return cleaned;
}


// ========================================
// アダプタ層: 既存フォーマット互換
// ========================================

/**
 * v13.0 native出力を既存フォーマット(FactCheckJSON)に変換
 *
 * 既存 approval.gs は以下のフィールドを読む:
 *   summary / details / fixLog / wasFixed / originalText / timestamp
 *
 * @return {Object} 既存フォーマットのオブジェクト
 */
function adaptV13ToLegacyJson_(stageResult, ctx) {
  var wasFixed = ctx.wasFixed || false;
  var fixLog = ctx.fixLog || '';

  if (!stageResult) {
    // Stage 1 自体がスキップ・失敗した場合
    return {
      summary: 'v13.0: 検証スキップ',
      details: '',
      fixLog: fixLog,
      wasFixed: false,
      originalText: '',
      timestamp: new Date().toISOString()
    };
  }

  var qualityCount = (stageResult.quality || []).length;
  var factCount = (stageResult.factErrors || []).length;
  var logicalCount = (stageResult.logical || []).length;
  var claims = stageResult.webClaims || [];
  var ngCount = claims.filter(function(c) { return c.verdict === 'NG'; }).length;
  var warnCount = claims.filter(function(c) { return c.verdict === 'WARN'; }).length;
  var okCount = claims.filter(function(c) { return c.verdict === 'OK'; }).length;

  // summary 生成
  var totalIssues = qualityCount + factCount + logicalCount + ngCount + warnCount;
  var summary;
  if (totalIssues === 0 && !wasFixed) {
    summary = '✅ v13.0 全観点 問題なし(OK: ' + okCount + '件)';
  } else {
    var parts = [];
    if (logicalCount > 0) parts.push('論理矛盾' + logicalCount + '件');
    if (factCount > 0) parts.push('事実誤り' + factCount + '件');
    if (ngCount > 0) parts.push('❌' + ngCount + '件');
    if (warnCount > 0) parts.push('⚠️' + warnCount + '件');
    if (qualityCount > 0) parts.push('品質' + qualityCount + '件');
    summary = (wasFixed ? '🔧 ' : '⚠️ ') + 'v13.0 ' + parts.join(' / ');
  }

  // details 生成(既存approval.gsの表示ロジックが ❌ ⚠ マーカーを探すため、該当行に含める)
  var detailLines = [];
  if (logicalCount > 0) {
    detailLines.push('【論理矛盾 ' + logicalCount + '件】');
    for (var li = 0; li < stageResult.logical.length; li++) {
      detailLines.push('⚠️ ' + (stageResult.logical[li].problem || '').substring(0, 120));
    }
  }
  if (factCount > 0) {
    detailLines.push('【事実誤り ' + factCount + '件】');
    for (var fi = 0; fi < stageResult.factErrors.length; fi++) {
      var fe = stageResult.factErrors[fi];
      detailLines.push('❌ ' + (fe.wrong || '').substring(0, 50) + ' → ' + (fe.correct || '').substring(0, 50));
    }
  }
  if (claims.length > 0) {
    detailLines.push('【Web検証 ' + claims.length + '件 / NG:' + ngCount + ' WARN:' + warnCount + ' OK:' + okCount + '】');
    for (var ci = 0; ci < claims.length; ci++) {
      var c = claims[ci];
      var mark = (c.verdict === 'NG') ? '❌' : (c.verdict === 'WARN') ? '⚠️' : '✅';
      // approval.gs は ❌ ⚠ マーカーを含む行だけ抽出して表示するので、OK は参考
      detailLines.push(mark + ' ' + (c.claim || '').substring(0, 80));
    }
  }
  if (qualityCount > 0) {
    detailLines.push('【品質 ' + qualityCount + '件】');
    for (var qi = 0; qi < stageResult.quality.length; qi++) {
      var q = stageResult.quality[qi];
      var qmark = (q.severity === 'error') ? '❌' : '⚠️';
      detailLines.push(qmark + ' [' + (q.id || '') + '] ' + (q.problem || '').substring(0, 80));
    }
  }

  return {
    summary: summary,
    details: detailLines.join('\n'),
    fixLog: fixLog,
    wasFixed: wasFixed,
    originalText: wasFixed ? (ctx.originalText || '').split(/\n\n#/)[0] : '',
    timestamp: new Date().toISOString()
  };
}


/**
 * v13.0 結果を ScriptProperties と下書きシート(既存フォーマット)に保存
 * approval.gs の承認メール表示で利用される
 */
function _saveV13LegacyJson_(postType, ctx) {
  try {
    var legacy = adaptV13ToLegacyJson_(ctx.stageResult, {
      wasFixed: ctx.wasFixed,
      originalText: ctx.originalText,
      fixLog: ctx.fixLog
    });

    var props = PropertiesService.getScriptProperties();
    props.setProperty('LAST_FACT_CHECK_' + postType, JSON.stringify(legacy));
    console.log('📝 v13.0: LAST_FACT_CHECK_' + postType + ' を既存フォーマットで保存');
  } catch (e) {
    console.log('⚠️ _saveV13LegacyJson_失敗(続行): ' + e.message);
  }
}


/**
 * 対話型検証ログシート(12列)へ書き込み
 * アダプタ層経由で既存 logInteractiveVerify_ を呼ぶ(シート無改修)
 */
function _writeInteractiveVerifyLogFromV13_(postType, stageResult, originalText, fixedText, fixApplied) {
  try {
    if (typeof logInteractiveVerify_ !== 'function') return;
    if (!stageResult) return;

    var claims = stageResult.webClaims || [];
    var ngCount = claims.filter(function(c) { return c.verdict === 'NG'; }).length;
    var warnCount = claims.filter(function(c) { return c.verdict === 'WARN'; }).length;
    var okCount = claims.filter(function(c) { return c.verdict === 'OK'; }).length;

    var logId = 'V13_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss') + '_' + Math.floor(Math.random() * 10000);

    // 全情報を resultJson に格納(quality / factErrors / logical / webClaims)
    var resultJson = JSON.stringify({
      v: 'v13.0',
      quality: stageResult.quality || [],
      factErrors: stageResult.factErrors || [],
      logical: stageResult.logical || [],
      webClaims: claims
    });

    logInteractiveVerify_({
      logId: logId,
      executedAt: new Date().toISOString(),
      postType: postType,
      extractedCount: claims.length,
      ngCount: ngCount,
      warnCount: warnCount,
      okCount: okCount,
      fixApplied: fixApplied,
      originalText: originalText,
      fixedText: fixedText,
      resultJson: resultJson
    });
  } catch (e) {
    console.log('⚠️ _writeInteractiveVerifyLogFromV13_失敗(続行): ' + e.message);
  }
}


// ========================================
// テスト関数
// ========================================

/**
 * ★v13.0.4 二重実行防止フラグを全てクリア(テスト時に使う)
 * 通常運用では呼ぶ必要なし(180秒で自然失効するため)
 */
function resetV13ExecutionLocks() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var count = 0;
  for (var key in all) {
    if (key.indexOf('V13_LAST_EXECUTED_') === 0) {
      props.deleteProperty(key);
      count++;
      console.log('🗑️ 削除: ' + key);
    }
  }
  console.log('✅ v13.0 実行ロック ' + count + '件 を削除しました');
}


/**
 * GASエディタから手動実行する動作確認用
 * 1. 関数が定義されているかチェック
 * 2. 依存関数の存在確認
 * 3. Stage 1 プロンプト組立のサンプル出力
 */
function testValidationV13Exists() {
  console.log('=== v13.0 validationV13.gs 存在確認テスト ===');

  var checks = [
    'executeValidationV13_',
    'runComprehensiveReview_',
    'buildComprehensiveReviewPrompt_',
    'parseComprehensiveReviewResponse_',
    'applyFixesV13_',
    'applyLogicalFix_',
    'applyFactErrorFix_',
    'applyWebClaimWarnFix_',
    'applyQualityFix_',
    'adaptV13ToLegacyJson_'
  ];

  var allOk = true;
  for (var i = 0; i < checks.length; i++) {
    var fnName = checks[i];
    var exists = (typeof eval(fnName) === 'function');
    console.log((exists ? '✅' : '❌') + ' ' + fnName);
    if (!exists) allOk = false;
  }

  console.log('--- 依存関数(既存) ---');
  var deps = [
    'callClaudeApi_',
    'collectAnchorData_',
    'getTodayPreviousPosts_',
    'cacheTodayPost_',
    'applyPostProcessingChain_',
    'forceRemoveIssueLines_',
    'logInteractiveVerify_'
  ];
  for (var d = 0; d < deps.length; d++) {
    var depExists = (typeof eval(deps[d]) === 'function');
    console.log((depExists ? '✅' : '❌') + ' ' + deps[d]);
    if (!depExists) allOk = false;
  }

  if (allOk) {
    console.log('🎉 全ての関数が定義されています');
  } else {
    console.log('⚠️ 不足している関数があります');
  }

  return allOk;
}


/**
 * Stage 1 プロンプト組立のサンプル出力
 * 実際のAPI呼び出しは行わない(文字数確認用)
 */
function testV13PromptSize() {
  console.log('=== v13.0 Stage 1 プロンプトサイズ確認 ===');

  var sampleText = '☕パウエル、まだ利下げしない。\n→タカ派的な発言で市場の期待を冷ました感じですね。\n\n📝豪ドルは資源国通貨として原油高の恩恵。\n→豪ドル米ドルは上昇トレンドが加速中ですが、ボラが高まる可能性もありますね。\n\n原油価格と各国の金融政策、答え合わせは今夜ですね。\n\n#FX #為替';

  try {
    var keys = getApiKeys();
    var rates = getLatestRatesFromCache_(keys.SPREADSHEET_ID) || {};
    var anchorData = collectAnchorData_(rates, keys, { includeCalendar: true, includeOngoingEvents: true });
    var previousPosts = getTodayPreviousPosts_() || [];

    var typeConfig = (typeof POST_TYPES !== 'undefined' && POST_TYPES['MORNING']) ? POST_TYPES['MORNING'] : { charMin: 150, charMax: 300 };
    var prompt = buildComprehensiveReviewPrompt_(sampleText, 'MORNING', typeConfig, typeConfig.charMin, typeConfig.charMax, anchorData, previousPosts);

    console.log('プロンプト文字数: ' + prompt.length);
    console.log('推定入力トークン: ' + Math.ceil(prompt.length / 2));
    console.log('--- 先頭500文字 ---');
    console.log(prompt.substring(0, 500));
    console.log('--- 末尾500文字 ---');
    console.log(prompt.substring(prompt.length - 500));
  } catch (e) {
    console.log('❌ テスト実行失敗: ' + e.message);
  }
}


// ========================================
// ★v13.0.8 段階2補強: 構造整合性チェック
// ========================================
/**
 * 鉤括弧・→ の構造破綻を機械的に検出する
 * 
 * 検出項目:
 *   1. 鉤括弧「」『』の数の不一致
 *   2. 鉤括弧の中に改行が入っている
 *   3. 鉤括弧の中に「→」が入っている
 *   4. 鉤括弧の中に絵文字が入っている
 * 
 * 返り値: 問題の文字列配列(空配列なら問題なし)
 */
function detectStructureBreaks_(text) {
  var issues = [];
  if (!text || typeof text !== 'string') return issues;

  try {
    // ハッシュタグ部分を除外
    var hashtagMatch = text.match(/\n*[ \t]*(#\S+(?:[ \t]+#\S+)*)\s*$/);
    var body = hashtagMatch ? text.slice(0, hashtagMatch.index) : text;

    // 1. 鉤括弧の数の対応チェック
    var openKaku1 = (body.match(/「/g) || []).length;
    var closeKaku1 = (body.match(/」/g) || []).length;
    var openKaku2 = (body.match(/『/g) || []).length;
    var closeKaku2 = (body.match(/』/g) || []).length;

    if (openKaku1 !== closeKaku1) {
      issues.push('「」の数不一致(開:' + openKaku1 + '/閉:' + closeKaku1 + ')');
    }
    if (openKaku2 !== closeKaku2) {
      issues.push('『』の数不一致(開:' + openKaku2 + '/閉:' + closeKaku2 + ')');
    }

    // 2-4. 鉤括弧の中の内容チェック(改行・→・絵文字)
    // 「...」と『...』の中身を非貪欲で抽出
    var emojiPattern = /[☕📕📝📋💡⚠️✅]/;

    // 「」の中身チェック(改行を跨ぐ場合も含めてマッチ)
    var kaku1Pattern = /「([\s\S]*?)」/g;
    var match;
    while ((match = kaku1Pattern.exec(body)) !== null) {
      var content = match[1];
      if (content.indexOf('\n') !== -1) {
        issues.push('「」内に改行: 「' + content.substring(0, 20).replace(/\n/g, '\\n') + '...」');
      }
      if (content.indexOf('→') !== -1) {
        issues.push('「」内に→: 「' + content.substring(0, 30) + '」');
      }
      if (emojiPattern.test(content)) {
        issues.push('「」内に絵文字: 「' + content.substring(0, 30) + '」');
      }
    }

    // 『』の中身チェック
    var kaku2Pattern = /『([\s\S]*?)』/g;
    while ((match = kaku2Pattern.exec(body)) !== null) {
      var content = match[1];
      if (content.indexOf('\n') !== -1) {
        issues.push('『』内に改行: 『' + content.substring(0, 20).replace(/\n/g, '\\n') + '...』');
      }
      if (content.indexOf('→') !== -1) {
        issues.push('『』内に→: 『' + content.substring(0, 30) + '』');
      }
      if (emojiPattern.test(content)) {
        issues.push('『』内に絵文字: 『' + content.substring(0, 30) + '』');
      }
    }
  } catch (e) {
    console.log('⚠️ detectStructureBreaks_ 例外(続行): ' + e.message);
  }

  return issues;
}


/**
 * detectStructureBreaks_ の単体テスト
 * GASエディタで手動実行して挙動を確認
 */
function testDetectStructureBreaks() {
  var cases = [
    { label: 'OK: 鉤括弧が正しく閉じている', text: '「原油下落で反落」かなと思います。' },
    { label: 'NG: 鉤括弧の中に改行+→', text: '「停戦延長で買い継続」か「原油下落\n→反落」かの分岐点。' },
    { label: 'NG: 鉤括弧の数が不一致', text: '「原油下落で反落 かなと思います。' },
    { label: 'OK: 鉤括弧の外に→', text: '原油下落で豪ドル反落。\n→日足ではまだ下降トレンド。' },
    { label: 'NG: 鉤括弧内に絵文字', text: '「📝原油下落」と言える状況。' }
  ];
  cases.forEach(function(c) {
    console.log('--- ' + c.label + ' ---');
    console.log('入力: ' + c.text);
    var issues = detectStructureBreaks_(c.text);
    if (issues.length === 0) {
      console.log('結果: ✅ 問題なし');
    } else {
      console.log('結果: ⚠️ ' + issues.join(' / '));
    }
    console.log('');
  });
}
