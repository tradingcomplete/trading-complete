/**
 * ============================================================
 * interactiveVerify.gs - 対話型検証システム(v1.9/v12.7 タスク17-b)
 * ============================================================
 *
 * 目的: 「人間の手動検証プロセス」をシステムに落とし込む
 *
 * 背景:
 *   2026-04-17の2事故(INDICATOR「関税ショック前」/ MORNING「RBA副総裁発言」)は、
 *   既存3段検証(factCheckPost_ / qualityReviewPost_ / finalFactVerify_)を
 *   全て通過または検出漏れで発生。
 *   一方、コンパナさんが手動でやる検証は毎回見抜いてきた。
 *   この「人間の視点」をClaudeに学習させた対話型検証を導入する。
 *
 * 3ステップ構造(要件定義v1.9 セクション7より):
 *   Step 1: 検証質問抽出      (Claude API 1回、Web検索なし)
 *   Step 2: 一括Web検証       (Claude API 1回、Web検索あり)
 *   Step 3: 修正              (Claude API 0-1回、❌/⚠️がある場合のみ)
 *
 * 方針B(並行実装):
 *   本ファイルは完全独立。executeQualityReviewChain_への配線はタスク19以降で実施。
 *   タスク17-b完了時点では testInteractiveVerify.gs 経由でのみ呼ばれる。
 *
 * 依存関数:
 *   - callClaudeApi_()           (geminiApi.gs) - Claude API呼び出し
 *   - collectAnchorData_()       (geminiApi.gs) - 確定データ収集(タスク17-a)
 *   - getCharacterPrompt()       (sheetsManager.gs) - キャラクター注入
 *   - getApiKeys()               (config.gs)
 *
 * 依存定数:
 *   - POST_TYPES                 (config.gs) - 投稿タイプ別のcharMin/charMax
 *
 * 作成日: 2026-04-18
 * ============================================================
 */


// ===== 定数 =====

/**
 * 対話型検証の各ステップでのタイムアウト(秒)
 * Phase B全体で300秒枠のうち、対話型検証で最大180秒を使う想定
 */
var INTERACTIVE_VERIFY_TIMEOUT_SEC = 180;

/**
 * Step 1で抽出する主張の最大数
 * 多すぎるとStep 2のWeb検索が重くなる。5個が実用的な上限
 */
var MAX_CLAIMS_PER_POST = 5;


// ========================================
// メインエントリー: 3ステップの統合実行
// ========================================

/**
 * 対話型検証を実行する(3ステップ統合)
 *
 * 使い方:
 *   var result = executeInteractiveVerify_(postText, 'MORNING', rates, keys);
 *   if (result.fixApplied) {
 *     // 修正された本文を使う
 *     cleanedText = result.fixedText;
 *   }
 *
 * @param {string} postText - 検証対象の投稿本文
 * @param {string} postType - 'MORNING', 'INDICATOR' 等
 * @param {Object} rates - 現在レート(collectAnchorData_に渡す)
 * @param {Object} keys - getApiKeys()の戻り値
 * @return {Object} 検証結果
 *   {
 *     extractedCount: 抽出されたclaim数,
 *     ngCount: ❌判定数,
 *     warnCount: ⚠️判定数,
 *     okCount: ✅判定数,
 *     fixApplied: 修正が実行されたか,
 *     originalText: 修正前テキスト,
 *     fixedText: 修正後テキスト(修正なしの場合はoriginalTextと同じ),
 *     claims: 抽出されたclaimの配列,
 *     verifyResults: 検証結果の配列,
 *     stepsExecuted: 実行したステップ数(1-3),
 *     skippedReason: スキップ理由(スキップ時のみ),
 *     error: エラーメッセージ(エラー時のみ)
 *   }
 */
function executeInteractiveVerify_(postText, postType, rates, keys) {
  var startTime = new Date();

  // 結果オブジェクトの初期化(fail-safe: どこで失敗しても最低限の情報は返す)
  var result = {
    extractedCount: 0,
    ngCount: 0,
    warnCount: 0,
    okCount: 0,
    fixApplied: false,
    originalText: postText,
    fixedText: postText,  // デフォルトは原文そのまま
    claims: [],
    verifyResults: [],
    stepsExecuted: 0,
    skippedReason: null,
    error: null
  };

  console.log('');
  console.log('========================================');
  console.log('🔍 対話型検証開始: ' + postType);
  console.log('========================================');

  try {
    // ===== 前提チェック =====
    if (!postText || postText.trim().length === 0) {
      result.skippedReason = '投稿本文が空';
      console.log('⚠️ ' + result.skippedReason + ' → スキップ');
      return result;
    }

    if (!keys) {
      keys = getApiKeys();
    }
    // CLAUDE_API_KEYを取得（getApiKeys()には含まれないため、ScriptPropertiesから直接取得）
    // 既存パターンと同じ: keys.CLAUDE_API_KEY が無ければ ScriptProperties から取得
    var claudeApiKey = (keys && keys.CLAUDE_API_KEY) || PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!claudeApiKey) {
      result.error = 'CLAUDE_API_KEY 未設定';
      console.log('❌ ' + result.error);
      return result;
    }
    // 以降の関数で使えるように keys オブジェクトを拡張
    if (keys && !keys.CLAUDE_API_KEY) {
      keys.CLAUDE_API_KEY = claudeApiKey;
    }

    // ===== 確定データ収集(タスク17-aの成果を活用) =====
    var anchorData = null;
    try {
      anchorData = collectAnchorData_(rates, keys, { includeCalendar: true, includeOngoingEvents: true });
      console.log('📌 確定データ収集完了: toFactString=' + anchorData.toFactString().length + '文字');
    } catch (anchorErr) {
      console.log('⚠️ 確定データ収集失敗(Step 2/3が精度低下するが続行): ' + anchorErr.message);
    }

    // ===== Step 1: 検証質問抽出 =====
    console.log('');
    console.log('📝 Step 1: 検証質問抽出');
    var claims = extractVerificationClaims_(postText, postType, keys, anchorData);
    result.stepsExecuted = 1;

    if (!claims || claims.length === 0) {
      result.skippedReason = '検証対象のclaim抽出ゼロ(相場観・感想のみの投稿)';
      console.log('ℹ️ ' + result.skippedReason + ' → Step 2/3スキップ');
      return result;
    }

    result.claims = claims;
    result.extractedCount = claims.length;
    console.log('✅ Step 1完了: ' + claims.length + '件のclaim抽出');
    for (var ci = 0; ci < claims.length; ci++) {
      console.log('   [' + claims[ci].id + '] ' + claims[ci].text.substring(0, 60));
    }

    // 時間制限チェック
    if (hasTimedOut_(startTime)) {
      result.skippedReason = 'Step 1完了時点で時間切れ';
      console.log('⏱️ ' + result.skippedReason);
      return result;
    }

    // ===== Step 2: 一括Web検証 =====
    console.log('');
    console.log('🌐 Step 2: 一括Web検証');
    var verifyResults = batchWebVerify_(claims, anchorData, keys);
    result.stepsExecuted = 2;

    if (!verifyResults || verifyResults.length === 0) {
      result.skippedReason = 'Step 2で検証結果取得失敗';
      console.log('⚠️ ' + result.skippedReason + ' → Step 3スキップ');
      return result;
    }

    result.verifyResults = verifyResults;

    // 判定集計
    for (var vi = 0; vi < verifyResults.length; vi++) {
      var v = verifyResults[vi];
      if (v.verdict === '❌') result.ngCount++;
      else if (v.verdict === '⚠️') result.warnCount++;
      else if (v.verdict === '✅') result.okCount++;
    }

    console.log('✅ Step 2完了: ❌' + result.ngCount + '件 / ⚠️' + result.warnCount + '件 / ✅' + result.okCount + '件');

    // 修正が必要ない場合はStep 3スキップ
    if (result.ngCount === 0 && result.warnCount === 0) {
      console.log('ℹ️ 全claim ✅ 判定 → Step 3スキップ(修正不要)');
      return result;
    }

    // 時間制限チェック
    if (hasTimedOut_(startTime)) {
      result.skippedReason = 'Step 2完了時点で時間切れ';
      console.log('⏱️ ' + result.skippedReason + ' → Step 3スキップ');
      return result;
    }

    // ===== Step 3: 修正 =====
    console.log('');
    console.log('🔧 Step 3: 修正');
    var fixedText = fixPostWithVerification_(postText, verifyResults, postType, anchorData, keys);
    result.stepsExecuted = 3;

    if (fixedText && fixedText.trim().length > 0 && fixedText !== postText) {
      result.fixedText = fixedText;
      result.fixApplied = true;
      console.log('✅ Step 3完了: 修正適用');
      console.log('   原文文字数: ' + postText.length);
      console.log('   修正後: ' + fixedText.length);
    } else {
      console.log('⚠️ Step 3: 修正結果が原文と同じか空 → 原文維持');
    }

    return result;

  } catch (e) {
    result.error = e.message;
    console.log('❌ 対話型検証エラー: ' + e.message);
    console.log('   Stack: ' + (e.stack || 'なし'));
    return result;
  } finally {
    var elapsedSec = Math.round((new Date() - startTime) / 1000);
    console.log('');
    console.log('⏱️ 対話型検証 経過時間: ' + elapsedSec + '秒');

    // ★v1.9 タスク17-d: ログシート書き込み
    // 早期return/エラー/正常終了、いずれの経路でも必ずログを残す
    // sheetsManager.gs に logInteractiveVerify_ が存在する場合のみ実行(fail-safe)
    try {
      if (typeof logInteractiveVerify_ === 'function') {
        // logId: VL_yyyyMMdd_HHmmss_0000 形式(GAS ES5互換のゼロ埋め)
        var randomSuffix = ('0000' + Math.floor(Math.random() * 10000)).slice(-4);
        var logId = 'VL_' +
          Utilities.formatDate(startTime, 'Asia/Tokyo', 'yyyyMMdd_HHmmss') + '_' +
          randomSuffix;
        logInteractiveVerify_({
          logId: logId,
          executedAt: startTime.toISOString(),
          postId: '',   // Phase B統合時に設定される(現時点では空)
          postType: postType || '',
          extractedCount: result.extractedCount,
          ngCount: result.ngCount,
          warnCount: result.warnCount,
          okCount: result.okCount,
          fixApplied: result.fixApplied,
          originalText: result.originalText || '',
          fixedText: result.fixedText || '',
          resultJson: JSON.stringify({
            stepsExecuted: result.stepsExecuted,
            claims: result.claims,
            verifyResults: result.verifyResults,
            skippedReason: result.skippedReason,
            error: result.error,
            elapsedSec: elapsedSec
          })
        });
      } else {
        console.log('ℹ️ logInteractiveVerify_ 未定義 → ログ書き込みスキップ(sheetsManager.gs未更新)');
      }
    } catch (logErr) {
      console.log('⚠️ ログ書き込みエラー(続行): ' + logErr.message);
    }

    console.log('========================================');
  }
}


/**
 * 経過時間がタイムアウトを超えたか判定
 */
function hasTimedOut_(startTime) {
  var elapsed = (new Date() - startTime) / 1000;
  return elapsed > INTERACTIVE_VERIFY_TIMEOUT_SEC;
}


// ========================================
// Step 1: 検証質問抽出
// ========================================

/**
 * 投稿本文を読ませ、事実確認が必要な主張を抽出する
 *
 * Claude APIを1回呼ぶ(Web検索なし、軽量)
 * JSON応答をパースして配列として返す
 *
 * @param {string} postText - 投稿本文
 * @param {string} postType - 投稿タイプ
 * @param {Object} keys - getApiKeys()の戻り値
 * @param {Object} [anchorData] - collectAnchorData_の戻り値(継続中事象ガイド用。★v1.9改善)
 * @return {Array} [{ id: 1, text: '主張の原文', question: '検証質問' }, ...]
 *                 抽出ゼロ/エラー時は空配列
 */
function extractVerificationClaims_(postText, postType, keys, anchorData) {
  var prompt = buildExtractClaimsPrompt_(postText, postType, anchorData);

  console.log('🔎 Claude API呼び出し(Step 1: 質問抽出)');
  var claudeResult = callClaudeApi_(prompt, keys.CLAUDE_API_KEY, {
    logPrefix: '対話型検証Step1',
    maxRetries: 2
  });

  if (!claudeResult || !claudeResult.text) {
    console.log('⚠️ Step 1: Claude応答取得失敗');
    return [];
  }

  var parsed = parseExtractClaimsResponse_(claudeResult.text);
  if (!parsed) {
    console.log('⚠️ Step 1: JSON パース失敗');
    return [];
  }

  // MAX_CLAIMS_PER_POST 上限でクリップ(念のため)
  if (parsed.length > MAX_CLAIMS_PER_POST) {
    console.log('ℹ️ claim抽出数' + parsed.length + '件 → 上限' + MAX_CLAIMS_PER_POST + '件にクリップ');
    parsed = parsed.slice(0, MAX_CLAIMS_PER_POST);
  }

  return parsed;
}


/**
 * Step 1のプロンプトを構築
 *
 * @param {string} postText - 投稿本文
 * @param {string} postType - 投稿タイプ
 * @param {Object} [anchorData] - collectAnchorData_の戻り値(継続中事象ガイド用)
 */
function buildExtractClaimsPrompt_(postText, postType, anchorData) {
  var prompt = '';
  prompt += 'あなたは事実確認の専門家です。以下のFX/金融関連の投稿本文から、「事実確認が必要な主張」を抽出してください。\n';
  prompt += '\n';
  prompt += '【投稿本文】\n';
  prompt += postText + '\n';
  prompt += '\n';
  prompt += '【投稿タイプ】\n';
  prompt += postType + '\n';
  prompt += '\n';
  prompt += '【抽出対象】以下のいずれかを含む主張を抽出:\n';
  prompt += '1. 日付・時刻を含む主張(例: 「本日15:00発表」「昨夜」「明日」)\n';
  prompt += '2. 具体的な数値・パーセンテージ(例: 「約8割」「4.10%」「159円台」)\n';
  prompt += '3. 要人発言の引用(例: 「パウエル議長が〇〇と発言」「RBA副総裁が〇〇と述べた」)\n';
  prompt += '4. 継続的事象への時制付き言及(例: 「関税ショック前」「〇〇危機後」)\n';
  prompt += '5. 時系列の因果(例: 「昨夜の流れを受けて」「〇〇を受け、ドル買い」)\n';
  prompt += '6. イベント・出来事の完了形記述(例: 「〇〇が発表された」「〇〇合意が成立した」)\n';
  prompt += '\n';
  prompt += '【抽出しない対象】\n';
  prompt += '- 相場観・感想(「注目ですね」「〜が怖い」「〜が楽しみ」)\n';
  prompt += '- 一般的なトレード知識(「損切りは大事」「リスク管理が重要」)\n';
  prompt += '- 投稿タイプの役割記述(MORNING/INDICATOR等の導線挨拶)\n';
  prompt += '- 仮説や推測(「〇〇かもしれない」「〇〇と読んでいる」)\n';
  prompt += '\n';
  prompt += '【抽出数の上限】\n';
  prompt += '最大' + MAX_CLAIMS_PER_POST + '個まで。重要度が高いものを優先。\n';
  prompt += '抽出対象がゼロなら空配列を返してください。\n';
  prompt += '\n';

  // ★v1.9改善: 継続中事象ガイドを注入
  // 「関税ショック前」等の継続事象+時制修飾の見落とし対策
  if (anchorData && anchorData.ongoingEvents && anchorData.ongoingEvents.length > 0) {
    prompt += '【★最重要・特別ルール: 現在継続中の重大事象】\n';
    prompt += '以下の事象は現在も継続中である。これらへの「前」「後」「以前」「以後」「終了後」「収束後」等の時制付き言及は、過去形・完了形・未発生扱いのいずれの場合も必ず抽出すること。\n';
    prompt += '継続中の事象を「既に終わった」「これから起きる」と誤認する記述は、最優先で検出すべきハルシネーションである。\n';
    prompt += '\n';
    for (var oei = 0; oei < anchorData.ongoingEvents.length; oei++) {
      var oe = anchorData.ongoingEvents[oei];
      prompt += '- ' + oe.name;
      if (oe.startDate) prompt += '(' + oe.startDate + '〜継続中)';
      prompt += '\n';
      if (oe.summary) {
        prompt += '  概要: ' + oe.summary + '\n';
      }
      if (oe.cautionKeywords) {
        prompt += '  誤用パターン例: ' + oe.cautionKeywords + '\n';
      }
    }
    prompt += '\n';
    prompt += '上記事象への言及を見つけたら、時制表現(「前」「後」等)の有無にかかわらず、claims に含めて検証対象とせよ。\n';
    prompt += '\n';
  }

  prompt += '【出力形式】JSON形式のみ。説明文・Markdown記法は一切不要。\n';
  prompt += '```\n';
  prompt += '{\n';
  prompt += '  "claims": [\n';
  prompt += '    { "id": 1, "text": "主張の原文", "question": "検証質問(Web検索で確認できる形式)" },\n';
  prompt += '    { "id": 2, "text": "...", "question": "..." }\n';
  prompt += '  ]\n';
  prompt += '}\n';
  prompt += '```\n';
  prompt += '\n';
  prompt += '出力は上記のJSONのみ。前後に何も書かないでください。\n';

  return prompt;
}


/**
 * Step 1のClaude応答をパース
 *
 * 既存の parseClaudeReviewResponse_ と同じフォールバック戦略:
 *   1. ```json ``` 除去してパース
 *   2. 失敗したら本文中のJSON部分を正規表現で抽出
 *
 * @param {string} text - Claude応答テキスト
 * @return {Array|null} claimの配列、失敗時null
 */
function parseExtractClaimsResponse_(text) {
  if (!text || typeof text !== 'string') return null;

  try {
    // ```json ... ``` を除去
    var cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var parsed = JSON.parse(cleaned);

    if (parsed && Array.isArray(parsed.claims)) {
      return normalizeClaimsArray_(parsed.claims);
    }

    // 配列のみが返されたパターン(稀)
    if (Array.isArray(parsed)) {
      return normalizeClaimsArray_(parsed);
    }

    console.log('⚠️ Step 1応答: claimsフィールドが配列ではない');
    return null;

  } catch (e) {
    // フォールバック: 本文中のJSON部分を抽出
    try {
      var jsonMatch = text.match(/\{[\s\S]*?"claims"[\s\S]*?\]\s*\}/);
      if (jsonMatch) {
        var extracted = JSON.parse(jsonMatch[0]);
        if (extracted && Array.isArray(extracted.claims)) {
          console.log('✅ Step 1フォールバック: 文章中からJSON抽出成功');
          return normalizeClaimsArray_(extracted.claims);
        }
      }
    } catch (e2) {
      // フォールバックも失敗
    }

    console.log('⚠️ Step 1応答JSON解析失敗: ' + e.message);
    console.log('  応答冒頭: ' + text.substring(0, 200));
    return null;
  }
}


/**
 * claims配列を正規化(必須フィールドがあるかチェック、idを振り直し)
 */
function normalizeClaimsArray_(claims) {
  var normalized = [];
  for (var i = 0; i < claims.length; i++) {
    var c = claims[i];
    if (c && typeof c === 'object' && c.text && c.question) {
      normalized.push({
        id: (typeof c.id === 'number') ? c.id : (i + 1),
        text: String(c.text).trim(),
        question: String(c.question).trim()
      });
    }
  }
  return normalized;
}


// ========================================
// Step 2: 一括Web検証
// ========================================

/**
 * 抽出したclaimをClaude + Web検索で一括検証する
 *
 * Claude APIを1回呼ぶ(Web検索あり)
 * N個のclaimを1回のAPI呼び出しで検証。効率的。
 *
 * @param {Array} claims - Step 1で抽出されたclaims
 * @param {Object|null} anchorData - collectAnchorData_の戻り値(nullの場合は確定データなしで検証)
 * @param {Object} keys - getApiKeys()の戻り値
 * @return {Array} [{ id, verdict, evidence, fix_suggestion }, ...]
 *                 失敗時は空配列
 */
function batchWebVerify_(claims, anchorData, keys) {
  if (!claims || claims.length === 0) return [];

  var prompt = buildBatchVerifyPrompt_(claims, anchorData);

  console.log('🔎 Claude API呼び出し(Step 2: Web検証, Web検索ツール有効)');
  var claudeResult = callClaudeApi_(prompt, keys.CLAUDE_API_KEY, {
    logPrefix: '対話型検証Step2',
    useWebSearch: true,
    maxRetries: 2
  });

  if (!claudeResult || !claudeResult.text) {
    console.log('⚠️ Step 2: Claude応答取得失敗');
    return [];
  }

  var parsed = parseBatchVerifyResponse_(claudeResult.text);
  if (!parsed) {
    console.log('⚠️ Step 2: JSON パース失敗');
    return [];
  }

  return parsed;
}


/**
 * Step 2のプロンプトを構築
 */
function buildBatchVerifyPrompt_(claims, anchorData) {
  var prompt = '';
  prompt += 'あなたは事実確認の専門家です。以下のFX/金融関連の主張を、Web検索で確認してください。\n';
  prompt += '\n';

  // 確定データを検証の基準として注入(anchorDataがあれば)
  if (anchorData && typeof anchorData.toVerifyPrompt === 'function') {
    prompt += anchorData.toVerifyPrompt();
    prompt += '\n';
  }

  prompt += '【検証対象の主張】\n';
  for (var i = 0; i < claims.length; i++) {
    var c = claims[i];
    prompt += '\n';
    prompt += '主張' + c.id + ': ' + c.text + '\n';
    prompt += '  検証質問: ' + c.question + '\n';
  }
  prompt += '\n';

  prompt += '【判定ルール】\n';
  prompt += '各主張について、Web検索で確認した結果に基づき、以下のいずれかで判定してください:\n';
  prompt += '- ✅ (裏付けあり): Web検索で明確に裏付けが取れた\n';
  prompt += '- ❌ (矛盾): Web検索結果が主張と明確に矛盾する(事実誤認)\n';
  prompt += '- ⚠️ (裏付けなし): Web検索しても裏付けが取れない(削除推奨)\n';
  prompt += '\n';
  prompt += '重要なルール:\n';
  prompt += '1. 上記「確定データ」と矛盾するWeb検索結果が出た場合、確定データを優先してください。\n';
  prompt += '2. 一般論として「こういうことはよくある」ではなく、「その主張の具体的内容がWebで確認できたか」で判定してください。\n';
  prompt += '3. 要人発言は具体的な発言日時・媒体が確認できない限り ⚠️ または ❌ です。\n';
  prompt += '4. 本日の日付より未来の出来事を「起きた」と書いてあれば必ず ❌ です。\n';
  prompt += '\n';

  prompt += '【出力形式】JSON形式のみ。説明文・Markdown記法は一切不要。\n';
  prompt += '```\n';
  prompt += '{\n';
  prompt += '  "results": [\n';
  prompt += '    { "id": 1, "verdict": "❌", "evidence": "検索結果の根拠", "fix_suggestion": "どう直すべきか" },\n';
  prompt += '    { "id": 2, "verdict": "✅", "evidence": "...", "fix_suggestion": "" }\n';
  prompt += '  ]\n';
  prompt += '}\n';
  prompt += '```\n';
  prompt += '\n';
  prompt += '出力は上記のJSONのみ。前後に何も書かないでください。\n';

  return prompt;
}


/**
 * Step 2のClaude応答をパース
 *
 * @param {string} text - Claude応答テキスト(Web検索結果を含む)
 * @return {Array|null} resultsの配列、失敗時null
 */
function parseBatchVerifyResponse_(text) {
  if (!text || typeof text !== 'string') return null;

  try {
    var cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var parsed = JSON.parse(cleaned);

    if (parsed && Array.isArray(parsed.results)) {
      return normalizeVerifyResults_(parsed.results);
    }

    if (Array.isArray(parsed)) {
      return normalizeVerifyResults_(parsed);
    }

    console.log('⚠️ Step 2応答: resultsフィールドが配列ではない');
    return null;

  } catch (e) {
    // フォールバック: Web検索時の冒頭引用等を剥がす
    try {
      var jsonMatch = text.match(/\{[\s\S]*?"results"[\s\S]*?\]\s*\}/);
      if (jsonMatch) {
        var extracted = JSON.parse(jsonMatch[0]);
        if (extracted && Array.isArray(extracted.results)) {
          console.log('✅ Step 2フォールバック: 文章中からJSON抽出成功');
          return normalizeVerifyResults_(extracted.results);
        }
      }
    } catch (e2) { }

    console.log('⚠️ Step 2応答JSON解析失敗: ' + e.message);
    console.log('  応答冒頭: ' + text.substring(0, 200));
    return null;
  }
}


/**
 * verify結果を正規化
 * verdict 表記のゆれを吸収(絵文字表記 vs 文字列表記)
 */
function normalizeVerifyResults_(results) {
  var normalized = [];
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (!r || typeof r !== 'object') continue;

    // verdictの正規化
    var verdict = String(r.verdict || '').trim();
    // 絵文字以外の表記を絵文字に寄せる
    if (verdict === 'OK' || verdict.indexOf('裏付けあり') !== -1 || verdict === 'TRUE' || verdict === 'true') {
      verdict = '✅';
    } else if (verdict === 'NG' || verdict.indexOf('矛盾') !== -1 || verdict.indexOf('誤認') !== -1 || verdict === 'FALSE' || verdict === 'false') {
      verdict = '❌';
    } else if (verdict === 'WARN' || verdict.indexOf('裏付けなし') !== -1 || verdict.indexOf('取れず') !== -1 || verdict.indexOf('不明') !== -1) {
      verdict = '⚠️';
    }

    // 想定外の値はwarnに寄せる(fail-safe)
    if (verdict !== '✅' && verdict !== '❌' && verdict !== '⚠️') {
      console.log('⚠️ 想定外のverdict値「' + verdict + '」→ ⚠️ に正規化');
      verdict = '⚠️';
    }

    normalized.push({
      id: (typeof r.id === 'number') ? r.id : (i + 1),
      verdict: verdict,
      evidence: String(r.evidence || '').trim(),
      fix_suggestion: String(r.fix_suggestion || '').trim()
    });
  }
  return normalized;
}


// ========================================
// Step 3: 修正
// ========================================

/**
 * ❌/⚠️判定のclaimに基づいて投稿本文を修正する
 *
 * Claude APIを1回呼ぶ(Web検索なし、確定データガード付き)
 * 口調・文字数・構造を維持し、事実部分だけ書き換える
 *
 * @param {string} postText - 修正対象の本文
 * @param {Array} verifyResults - Step 2の検証結果
 * @param {string} postType - 投稿タイプ(文字数判定に使う)
 * @param {Object|null} anchorData - collectAnchorData_の戻り値
 * @param {Object} keys - getApiKeys()の戻り値
 * @return {string|null} 修正後本文。修正不可ならnull
 */
function fixPostWithVerification_(postText, verifyResults, postType, anchorData, keys) {
  // ❌と⚠️のみ抽出(✅は修正対象外)
  var issuesToFix = [];
  for (var i = 0; i < verifyResults.length; i++) {
    var v = verifyResults[i];
    if (v.verdict === '❌' || v.verdict === '⚠️') {
      issuesToFix.push(v);
    }
  }

  if (issuesToFix.length === 0) {
    console.log('ℹ️ 修正対象なし(すべて✅)');
    return null;
  }

  var prompt = buildFixPrompt_(postText, issuesToFix, postType, anchorData);

  console.log('🔎 Claude API呼び出し(Step 3: 修正)');
  var claudeResult = callClaudeApi_(prompt, keys.CLAUDE_API_KEY, {
    logPrefix: '対話型検証Step3',
    maxRetries: 2
  });

  if (!claudeResult || !claudeResult.text) {
    console.log('⚠️ Step 3: Claude応答取得失敗');
    return null;
  }

  var fixedText = claudeResult.text.trim();

  // ===== 汚染チェック(既存 factCheck.gs と同じ防御) =====
  // Claude修正で説明文が本文に混入するパターンを棄却
  var contaminationPatterns = [
    '以下が修正後',
    '修正後の投稿',
    '修正版です',
    '承知しました',
    '以下のように修正',
    'こちらが修正版',
    '修正いたしました'
  ];
  for (var ci = 0; ci < contaminationPatterns.length; ci++) {
    if (fixedText.indexOf(contaminationPatterns[ci]) !== -1) {
      console.log('⚠️ Step 3: 修正結果に説明文混入(「' + contaminationPatterns[ci] + '」) → 棄却');
      return null;
    }
  }

  // ===== サイズチェック =====
  // 極端に短い(原文の30%未満)または長い(原文の200%超)は異常とみなす
  if (fixedText.length < postText.length * 0.3) {
    console.log('⚠️ Step 3: 修正結果が短すぎる(' + fixedText.length + ' < ' + Math.floor(postText.length * 0.3) + ') → 棄却');
    return null;
  }
  if (fixedText.length > postText.length * 2.0) {
    console.log('⚠️ Step 3: 修正結果が長すぎる(' + fixedText.length + ' > ' + Math.floor(postText.length * 2.0) + ') → 棄却');
    return null;
  }

  return fixedText;
}


/**
 * Step 3の修正プロンプトを構築
 */
function buildFixPrompt_(postText, issuesToFix, postType, anchorData) {
  var typeConfig = (typeof POST_TYPES !== 'undefined' && POST_TYPES[postType]) ? POST_TYPES[postType] : {};
  var charMin = typeConfig.charMin || 100;
  var charMax = typeConfig.charMax || 400;

  var prompt = '';
  prompt += 'あなたはFXトレーダー「コンパナ」の投稿編集者です。以下の投稿本文に事実誤認があります。これを修正してください。\n';
  prompt += '\n';

  // キャラクターシート注入(口調維持のため)
  try {
    if (typeof getCharacterPrompt === 'function') {
      var characterPrompt = getCharacterPrompt();
      if (characterPrompt) {
        prompt += '【キャラクター(口調維持のための基準)】\n';
        prompt += characterPrompt + '\n';
        prompt += '\n';
      }
    }
  } catch (e) {
    console.log('⚠️ キャラクター取得失敗(続行): ' + e.message);
  }

  // 確定データを修正の基準として注入
  if (anchorData && typeof anchorData.toFixPrompt === 'function') {
    prompt += anchorData.toFixPrompt();
    prompt += '\n';
  }

  prompt += '【原文】\n';
  prompt += postText + '\n';
  prompt += '\n';

  prompt += '【検出された事実誤り】\n';
  for (var i = 0; i < issuesToFix.length; i++) {
    var v = issuesToFix[i];
    prompt += '\n';
    prompt += (i + 1) + '. [' + v.verdict + '] claim ID: ' + v.id + '\n';
    if (v.evidence) {
      prompt += '   根拠: ' + v.evidence + '\n';
    }
    if (v.fix_suggestion) {
      prompt += '   修正案: ' + v.fix_suggestion + '\n';
    }
  }
  prompt += '\n';

  prompt += '【修正ルール(厳守)】\n';
  prompt += '1. ❌ のclaimは、確定データと整合する正しい内容に書き換えること(削除ではなく修正)\n';
  prompt += '2. ⚠️ のclaimは、裏付けが取れないため、該当部分を削除するか、具体的内容を一般的表現に書き換えること\n';
  prompt += '3. 口調はコンパナの口調を絶対に維持すること(「〜ですね」「〜かなと」「〜感じですね」等)\n';
  prompt += '4. 文字数は' + charMin + '〜' + charMax + '字の範囲内に収めること\n';
  prompt += '5. 絵文字行(☕📕📝💡⚠️✅)と → 行の構造を維持すること\n';
  prompt += '6. ハッシュタグ行(#で始まる行)はそのまま保持すること\n';
  prompt += '7. 修正対象外の部分は一字一句変えないこと\n';
  prompt += '8. 確定データ(レート・方向・日付)と矛盾する記述を生成しないこと\n';
  prompt += '\n';

  prompt += '【出力】\n';
  prompt += '修正後の投稿本文のみ。説明文・前置き・後書き・Markdown記法は一切出力しないこと。\n';
  prompt += '「以下が修正後の〜」「修正しました」のような前置きも禁止。本文のみ出力。\n';

  return prompt;
}


// ========================================
// テスト用のエクスポート
// ========================================

/**
 * テストから呼ばれるラッパー
 * testInteractiveVerify.gs から executeInteractiveVerify_ を呼び出すためのエントリー
 *
 * @deprecated testInteractiveVerify.gs から直接 executeInteractiveVerify_ を呼んでもOK
 */
function _exec_for_test_interactive_verify(postText, postType, rates, keys) {
  return executeInteractiveVerify_(postText, postType, rates, keys);
}
