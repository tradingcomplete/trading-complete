/**
 * CompanaFXAutoPost - factCheck.gs
 * ファクトチェック + 自動修正
 * 
 * v8.5: geminiApi.gsからファイル分割（Phase 3）
 * ★v12.5: qualityCheckPost_ 削除（v8.6でqualityReview.gsのqualityReviewPost_に置き換え済み）
 * 
 * 4層品質保証の中核（Layer 1-3）:
 *   factCheckPost_ L1: システム確定データ照合（Grounding不要）
 *     ★v12.3.1: 通貨強弱の方向チェック追加（「強」の通貨を「下落」と書く矛盾を検出）
 *   factCheckPost_ L2: Geminiの知識+Google検索（Grounding ON）
 *   autoFixPost_: 誤りのみ修正（★v12.4: Gemini→Claude化。確定データガード付き）
 * 
 * 設計の鉄則:
 *   - factCheckPost_ は Grounding ON（検出に使う）
 *   - autoFixPost_ は Grounding OFF（修正には使わない）
 *     v8.2でGroundingの古い検索結果が正しいRBA利上げ投稿を
 *     「据え置き」に書き換えた事故から
 *   - factCheckPost_ のカレンダースコープは postType 別
 */


function factCheckPost_(postText, postType, apiKey, rates, csData) {
  try {
    // RULE系は個人の経験談が主体なのでスキップ
    var skipTypes = ['RULE_1', 'RULE_2', 'RULE_3', 'RULE_4'];
    if (skipTypes.indexOf(postType) !== -1) {
      return { passed: true, summary: 'スキップ（心得投稿）', details: '', issues: [] };
    }
    
    var now = new Date();
    var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年M月d日（E）HH:mm');
    var yearStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy');
    
    var prompt = 'あなたはFX投稿の事実検証の専門家です。\n';
    prompt += '現在の日時: ' + dateStr + '（日本時間）。現在は' + yearStr + '年です。\n';
    prompt += '以下の投稿テキストに含まれる「事実の主張」を、2段階で検証してください。\n\n';
    prompt += '【検証対象の投稿テキスト】\n';
    prompt += postText + '\n\n';
    
    // システムが持つ確定データを全て渡す
    prompt += '=== Layer 1: システム確定データ（最も信頼性が高い。この投稿を生成する際にAIに渡された正確なデータ）===\n\n';
    
    // 経済カレンダー（★v8.3: postTypeに応じたスコープで取得。buildPrompt_と同じロジック）
    try {
      var calScope = 'today';
      if (postType === 'NEXT_WEEK' || postType === 'WEEKLY_HYPOTHESIS') {
        var todayDow = new Date().getDay();
        calScope = (todayDow === 0) ? 'this_week_as_next' : 'next_week';
      } else if (postType === 'WEEKLY_REVIEW' || postType === 'WEEKLY_LEARNING') {
        calScope = 'this_week';
      }
      var calForCheck = getEconomicCalendar_(calScope);
      if (calForCheck) {
        var calLabel = (postType === 'NEXT_WEEK' || postType === 'WEEKLY_HYPOTHESIS')
          ? '来週の経済カレンダー' : '経済カレンダー';
        prompt += '【確定データ1: ' + calLabel + '】\n';
        prompt += calForCheck + '\n';
        prompt += '※このカレンダーに載っていない指標の日付・名称を投稿に書いていたら❌。\n\n';
      }
    } catch (calErr) { /* カレンダー取得失敗は無視 */ }
    
    // 確定レート
    if (rates) {
      prompt += '【確定データ2: リアルタイムレート（Twelve Data API）】\n';
      if (rates.usdjpy) prompt += '  USD/JPY（ドル円）: ' + formatRate_(rates.usdjpy, 'usdjpy', 'verify') + '円\n';
      if (rates.eurjpy) prompt += '  EUR/JPY（ユーロ円）: ' + formatRate_(rates.eurjpy, 'eurjpy', 'verify') + '円\n';
      if (rates.gbpjpy) prompt += '  GBP/JPY（ポンド円）: ' + formatRate_(rates.gbpjpy, 'gbpjpy', 'verify') + '円\n';
      if (rates.audjpy) prompt += '  AUD/JPY（豪ドル円）: ' + formatRate_(rates.audjpy, 'audjpy', 'verify') + '円\n';
      if (rates.eurusd) prompt += '  EUR/USD（ユーロドル）: ' + formatRate_(rates.eurusd, 'eurusd', 'verify') + 'ドル\n';
      if (rates.gbpusd) prompt += '  GBP/USD（ポンドドル）: ' + formatRate_(rates.gbpusd, 'gbpusd', 'verify') + 'ドル\n';
      if (rates.audusd) prompt += '  AUD/USD（豪ドル米ドル）: ' + formatRate_(rates.audusd, 'audusd', 'verify') + 'ドル\n';
      prompt += '\n';
    }
    
    // ★v12.1.1: 商品価格（BTC/GOLDのみ。WTI/天然ガスはAlpha Vantageデータが古いため停止）
    try {
      var btcCom = fetchCommodityPrices_();
      var comData = [];
      if (btcCom && btcCom.btc) comData.push('  ビットコイン: ' + btcCom.btc.toFixed(0) + 'ドル');
      if (btcCom && btcCom.gold) comData.push('  ゴールド: ' + btcCom.gold.toFixed(2) + 'ドル');
      if (comData.length > 0) {
        prompt += '【確定データ5: 商品価格（API取得）】\n';
        prompt += comData.join('\n') + '\n';
        prompt += '※投稿内の商品価格がこの確定値と5%以上乖離していたら❌。\n\n';
      }
    } catch (comErr) { /* 商品価格取得失敗は無視（続行） */ }
    
    // ★v8.7: 政策金利+要人リストを「確定データ」シートから取得
    prompt += '【確定データ3: 主要中銀の政策金利】\n';
    prompt += getPolicyRatesText_() + '\n';
    
    prompt += '【確定データ4: 主要国の首脳・要人（現職）】\n';
    prompt += getWorldLeadersText_();
    prompt += '※投稿内の要人の役職がこのリストと矛盾していたら❌。\n';
    prompt += '※例: 「バイデン大統領」→❌（現大統領はトランプ）。「石破首相」→❌（現首相は高市早苗）。\n\n';
    
    // ★v8.15: アノマリー（カレンダー要因）を確定データに追加
    try {
      var anomalies = getTodayAnomalies_();
      var anomalyFactText = formatAnomalyForFactCheck_(anomalies);
      if (anomalyFactText) {
        prompt += anomalyFactText;
      }
    } catch (anomalyErr) {
      // アノマリー取得失敗は無視（続行）
    }
    
    // ★v12.3.1: 通貨強弱データ（方向チェック用）
    if (csData && csData.length > 0) {
      prompt += '【確定データ6: 通貨強弱ランキング（前日比・実測値）】\n';
      for (var ci = 0; ci < csData.length; ci++) {
        var cs = csData[ci];
        prompt += '  ' + cs.jpName + '(' + cs.currency + '): ' + (cs.score >= 0 ? '+' : '') + cs.score.toFixed(2) + '% → ' + cs.direction + '\n';
      }
      prompt += '\n';
      prompt += '※これは実測されたレートから計算した事実。投稿本文の方向描写がこの強弱と矛盾していたら❌。\n';
      prompt += '  例: AUDが+2.95%（強）なのに「豪ドルが大きく売られている」「豪ドル下落」→ ❌\n';
      prompt += '  例: JPYが-1.70%（弱）なのに「円が大幅に買われている」→ ❌\n';
      prompt += '  例: USDが-1.89%（弱）なのに「ドル高が進行」→ ❌\n\n';
    }
    
    prompt += '=== チェックルール（2層構造） ===\n\n';
    prompt += '【Layer 1: システム確定データとの照合（最優先）】\n';
    prompt += '1. 為替レート: 確定データ2と3%以内の乖離なら✅。3%超なら❌（correctionに確定値を記載）\n';
    prompt += '1b. 商品価格（WTI・BTC・ゴールド等）: 確定データ5と5%以内の乖離なら✅。5%超なら❌（correctionに確定値を記載）\n';
    prompt += '1c. 通貨の方向: 確定データ6の強弱と投稿内の方向描写が矛盾していたら❌。「強」の通貨を「売られている」「下落」と書くのは致命的な誤り\n';
    prompt += '2. 政策金利・利上げ/利下げ/据え置き: 確定データ3と一致すれば✅。矛盾すれば❌\n';
    prompt += '3. 経済指標の名称・時刻: 確定データ1のカレンダーと一致すれば✅。カレンダーにない指標を「今日発表」と書いていたら❌\n';
    prompt += '4. 経済指標の名称混同: CPI（消費者物価指数）とPPI（卸売物価指数）、HICP（統合CPI）を混同していたら❌\n';
    prompt += '5. 発表済み/未発表の整合: カレンダーの【発表済み】【未発表】ラベルと投稿内の時制が一致するか\n\n';
    prompt += '【Layer 2: お前の知識による検証（Layer 1で判定できない項目に適用）】\n';
    prompt += '以下をお前の知識とGoogle検索で検証せよ:\n';
    prompt += '6. 要人発言（パウエル議長、植田総裁、ラガルド総裁等）: 実際にそういう発言があったか？内容は正確か？\n';
    prompt += '7. 経済指標の結果・数値: 投稿で言及している指標の結果（PPI上振れ等）は事実か？数値は正確か？\n';
    prompt += '8. 因果関係の論理: 「原油高→インフレ懸念→ドル買い」等のロジックは正しいか？因果の方向が逆転していないか？\n';
    prompt += '9. 時系列の正確性: 「今週の指標」「昨晩のNY」等の時制は正しいか？先週の出来事を今週と混同していないか？\n';
    prompt += '10. 架空のデータ: 投稿に含まれる具体的な数値（株価、利回り、指標結果等）が実在するか？\n\n';
    prompt += '【Layer 2の判定ルール】\n';
    prompt += '・知識やGoogle検索で明確に誤りと判断できる → ❌（correctionに正しい情報を記載）\n';
    prompt += '・知識やGoogle検索で正確と確認できた → ✅\n';
    prompt += '・どうしても確認できない → ⚠️（reason欄に「検証不可」と記載）\n';
    prompt += '・重要: ⚠️は「本当にどうしても確認できない場合」の最終手段。安易に⚠️にするな。まず知識で判断を試みよ。\n\n';
    prompt += '【要人の役職・地位に関する特別ルール（最重要）】\n';
    prompt += '各国の大統領・首相・中央銀行総裁等の役職は、選挙や人事で変わる。\n';
    prompt += 'お前の内部知識が古い場合、現在の役職者を誤認する可能性がある。\n';
    prompt += '以下のルールを厳守せよ:\n';
    prompt += '1. 確定データ4に載っている人物の役職は100%正しい。矛盾する知識は無視しろ。\n';
    prompt += '2. 確定データ4は主要首脳・中銀総裁のみ。全要人を網羅しているわけではない。\n';
    prompt += '3. 確定データ4に載っていない要人（FRB理事、各国副総裁、審議委員等）が投稿に出てきても、「リストにいない」だけで❌や⚠️にするな。\n';
    prompt += '4. 確定データ4にない要人は、Google検索で「実在する人物か」「役職は正しいか」を確認せよ。検索で実在が確認できれば✅。\n';
    prompt += '5. 特に注意: お前が「バイデンが大統領」と思っていても、確定データに「トランプが大統領」とあればトランプが正しい。\n\n';
    prompt += '【検証不要（スキップせよ）】\n';
    prompt += '・個人の感想（「マジで注目」「面白い」等）\n';
    prompt += '・相場観（「上がりそう」「下がるかも」等）\n';
    prompt += '・一般的なFX知識の説明\n';
    prompt += '・「〜かなと」「〜かもしれません」等の推測表現\n\n';
    prompt += '【出力形式（厳守）】JSON形式で出力せよ。それ以外のテキストは不要。\n';
    prompt += '{\n';
    prompt += '  "overall": "✅全て正確" or "⚠️要確認あり" or "❌誤りあり",\n';
    prompt += '  "items": [\n';
    prompt += '    {\n';
    prompt += '      "claim": "検証した事実の主張",\n';
    prompt += '      "verdict": "✅" or "⚠️" or "❌",\n';
    prompt += '      "layer": "L1" or "L2",\n';
    prompt += '      "reason": "判定理由（L1: どの確定データと照合したか。L2: どの知識・検索結果に基づくか）",\n';
    prompt += '      "correction": "❌の場合: 正しい情報"\n';
    prompt += '    }\n';
    prompt += '  ]\n';
    prompt += '}\n';
    
    // ★v8.3: Grounding復活（Layer 2の知識検証用）
    // v8.2でOFFにした理由: 検索結果を盲目的にautoFixで適用して正しい投稿を壊していた
    // v8.3の方針: factCheckPost_では検出にGroundingを使う。autoFixPost_では使わない（システムデータのみ）
    var result = callGemini_(prompt, apiKey, true);
    
    if (result && result.text) {
      var checkText = result.text.trim();
      // JSON部分を抽出（```json ... ``` の場合も対応）
      checkText = checkText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      try {
        var parsed = JSON.parse(checkText);
        var issues = [];
        
        if (parsed.items) {
          for (var i = 0; i < parsed.items.length; i++) {
            var item = parsed.items[i];
            if (item.verdict !== '✅') {
              issues.push(item);
            }
          }
        }
        
        // ★v8.1根本改修: ⚠️は「システムデータで検証不可」なのでautoFix不要
        // ❌のみが実際のデータ不整合 → autoFix対象
        // ★v8.6: ❌をさらに「修正可能」と「検証不能（削除対象）」に分類
        var hasFailItem = false;
        var hasWarnItem = false;
        var autoFixIssues = []; // ❌のみ（autoFix対象）
        
        // 検証不能を示すパターン（correctionやreasonにこれが含まれていたら削除対象）
        var unverifiablePatterns = [
          '確認できません', '確認できていません', '検証できません', '検証不可',
          '情報が不足', '情報不足', '見つかりません', '見つかりませんでした',
          '確認が取れません', '裏付けが取れません', '特定できません'
        ];
        
        for (var ii = 0; ii < issues.length; ii++) {
          var v = issues[ii].verdict || '';
          var hasCorrectionText = issues[ii].correction && issues[ii].correction.trim().length > 0;
          if (v.indexOf('❌') !== -1) {
            hasFailItem = true;
            
            // ★v8.6: correctionまたはreasonに「検証不能」パターンがあるか判定
            var corrText = (issues[ii].correction || '').trim();
            var reasonText = (issues[ii].reason || '').trim();
            var isUnverifiable = false;
            
            // correctionが空 or 検証不能パターンを含む → 削除対象
            if (!corrText || corrText.length === 0) {
              isUnverifiable = true;
            } else {
              for (var up = 0; up < unverifiablePatterns.length; up++) {
                if (corrText.indexOf(unverifiablePatterns[up]) !== -1 ||
                    reasonText.indexOf(unverifiablePatterns[up]) !== -1) {
                  isUnverifiable = true;
                  break;
                }
              }
            }
            
            issues[ii].removable = isUnverifiable;
            autoFixIssues.push(issues[ii]);
            
            if (isUnverifiable) {
              console.log('  🗑️ 検証不能→削除対象: ' + (issues[ii].claim || '').substring(0, 50));
            }
          } else if (v.indexOf('⚠') !== -1) {
            hasWarnItem = true;
            // ⚠️はログに記録するがautoFixには渡さない
          } else if (hasCorrectionText) {
            // verdictが空でcorrectionがあれば❌相当
            hasFailItem = true;
            issues[ii].removable = false;
            autoFixIssues.push(issues[ii]);
          }
        }
        
        var recalcOverall = hasFailItem ? '❌誤りあり' : hasWarnItem ? '⚠️要確認あり（問題' + issues.length + '件）' : '✅全て正確';
        // ★v8.1: passedは❌がない場合にtrue（⚠️はautoFixを発動しない）
        var passed = !hasFailItem;
        
        console.log('📋 ファクトチェック結果: ' + recalcOverall + '（問題' + issues.length + '件、autoFix対象' + autoFixIssues.length + '件）');
        
        // 読みやすいテキスト形式も生成
        var detailText = '総合判定: ' + recalcOverall + '\n';
        if (parsed.items) {
          for (var j = 0; j < parsed.items.length; j++) {
            var it = parsed.items[j];
            detailText += (j + 1) + '. ' + it.claim + ' → ' + it.verdict + ' ' + it.reason + '\n';
            if (it.correction) {
              detailText += '   正: ' + it.correction + '\n';
            }
          }
        }
        
        return {
          passed: passed,
          summary: recalcOverall,
          details: detailText,
          issues: autoFixIssues  // ★v8.1: ❌のみ（⚠️はautoFix不要）
        };
        
      } catch (parseErr) {
        // JSONパース失敗 → テキストベースで判定
        console.log('⚠️ ファクトチェックJSON解析失敗。テキスト判定に切替');
        var hasFail = checkText.indexOf('❌') !== -1;
        var hasWarn = checkText.indexOf('⚠') !== -1;
        return {
          passed: !hasFail,  // ★v8.1: ⚠️はautoFix不要なのでpassedに影響しない
          summary: hasFail ? '❌誤りあり' : hasWarn ? '⚠️要確認あり' : '✅全て正確',
          details: checkText,
          issues: []
        };
      }
    }
    
    console.log('⚠️ ファクトチェック失敗（スキップ）');
    return { passed: true, summary: 'チェック失敗（スキップ）', details: '', issues: [] };
    
  } catch (e) {
    console.log('⚠️ ファクトチェックエラー（スキップ）: ' + e.message);
    return { passed: true, summary: 'エラー（スキップ）', details: '', issues: [] };
  }
}

/**
 * ファクトチェックで発見された誤りを自動修正
 * ★v12.4: Claude + 確定データガードで修正（Gemini Groundingの古い情報で正しい投稿を壊す事故を根絶）
 * 
 * @param {string} postText - 修正対象の投稿テキスト
 * @param {Array} issues - factCheckPost_が返したissues配列
 * @param {string} postType - 投稿タイプ
 * @param {string} apiKey - Gemini APIキー
 * @return {Object} { text: string, fixed: boolean, fixLog: string }
 */
function autoFixPost_(postText, issues, postType, apiKey, rates, csData) {
  try {
    if (!issues || issues.length === 0) {
      return { text: postText, fixed: false, fixLog: '' };
    }
    
    var now = new Date();
    var dateStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年M月d日');
    
    var prompt = '以下のFX関連X投稿に事実の誤り/不確かな情報が見つかりました。\n';
    prompt += '現在の日時: ' + dateStr + '。\n';
    prompt += '各項目の「正しい情報」に基づいて修正してください。Google検索は不要です。修正に必要な情報は全て以下に記載されています。\n\n';
    prompt += '【元の投稿テキスト】\n';
    prompt += postText + '\n\n';
    prompt += '【修正が必要な箇所】\n';
    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      prompt += (i + 1) + '. ' + issue.verdict + ' ' + issue.claim + '\n';
      prompt += '   理由: ' + issue.reason + '\n';
      if (issue.correction) {
        prompt += '   正しい情報: ' + issue.correction + '\n';
      }
    }
    // ★v8.1: システム確定レートをautoFixにも渡す（ハルシネーション防止）
    if (rates) {
      prompt += '\n【システム確定レート（Twelve Data API - この値を正として使え）】\n';
      prompt += 'レートの修正が必要な場合、Google検索の値ではなく以下のAPI確定値を使え。\n';
      if (rates.usdjpy) prompt += '  USD/JPY: ' + formatRate_(rates.usdjpy, 'usdjpy', 'verify') + '円\n';
      if (rates.eurjpy) prompt += '  EUR/JPY: ' + formatRate_(rates.eurjpy, 'eurjpy', 'verify') + '円\n';
      if (rates.gbpjpy) prompt += '  GBP/JPY: ' + formatRate_(rates.gbpjpy, 'gbpjpy', 'verify') + '円\n';
      if (rates.audjpy) prompt += '  AUD/JPY: ' + formatRate_(rates.audjpy, 'audjpy', 'verify') + '円\n';
      if (rates.eurusd) prompt += '  EUR/USD: ' + formatRate_(rates.eurusd, 'eurusd', 'verify') + 'ドル\n';
      if (rates.gbpusd) prompt += '  GBP/USD: ' + formatRate_(rates.gbpusd, 'gbpusd', 'verify') + 'ドル\n';
      if (rates.audusd) prompt += '  AUD/USD: ' + formatRate_(rates.audusd, 'audusd', 'verify') + 'ドル\n';
    }
    // ★v8.7: 政策金利+要人リストを「確定データ」シートから取得
    prompt += '\n【主要中銀の政策金利（システム確定値 - この値を正として使え）】\n';
    prompt += getPolicyRatesText_();
    prompt += '\n【主要国の首脳・要人（システム確定値 - この名前と役職を正として使え）】\n';
    prompt += getWorldLeadersText_();
    prompt += '\n【修正ルール】\n';
    prompt += '・誤りのある部分だけを正確な情報に修正せよ。\n';
    prompt += '・口調・フォーマット・文字数は変えるな。コンパナの口調を維持せよ。\n';
    prompt += '・事実が確認できない場合は、その部分を削除して別の確認済み事実に差し替えろ。\n';
    prompt += '・レートの修正が必要な場合は、上記のシステム確定レートを使え。Google検索で別の値が見つかっても確定レートを優先せよ。\n';
    prompt += '・政策金利に関する修正が必要な場合は、上記のシステム確定金利を使え。Google検索で古い金利が出ても確定値を優先せよ。\n';
    prompt += '・投稿内容がシステム確定データ（レート・金利）と整合している場合は、その部分を修正するな。\n';
    prompt += '・修正後の投稿テキストのみ出力。説明文は不要。\n';
    
    // ★v12.4: 通貨強弱データを修正プロンプトに注入（方向の矛盾防止）
    if (csData && csData.length > 0) {
      prompt += '\n【通貨強弱ランキング（前日比・実測値 - 方向の真実）】\n';
      for (var csi = 0; csi < csData.length; csi++) {
        var cs = csData[csi];
        prompt += '  ' + cs.jpName + '(' + cs.currency + '): ' + (cs.score >= 0 ? '+' : '') + cs.score.toFixed(2) + '% → ' + cs.direction + '\n';
      }
      prompt += '※この方向と矛盾する修正は絶対にするな。「強」の通貨を「下落」に書き換えるのは致命的な誤り。\n';
    }
    
    // ★v7.8: 投稿タイプ別トーン・構造の保持
    var typeContextMap = {
      'MORNING': '朝6〜7時台の市場チェック投稿。昨夜のNY市場を受けた今日の展望。寝起きのトレーダーに向けた緊張感ある書き出し。',
      // ★2026-04-29: TOKYO削除(平日5投稿→4投稿)
      'LUNCH': '昼12時台の午前振り返り。ランチしながら3分で読めるトーン。欧州勢参入前の午後への橋渡し。',
      'LONDON': '夕方17時台のロンドンオープンレポート。「ここからが本番」という緊張感。東京とロンドンの温度差を描写。朝のMORNING投稿のような内容に書き換えるな。',
      'GOLDEN': '夜20〜21時台のゴールデンタイム。1日を振り返る共感重視のトーン。居酒屋で隣のトレーダーが語る感覚。',
      'NY': '夜22時台のNY市場オープン前。「今夜の勝負所」という緊張感。仮説を立てて記録に残すスタンス。',
      'INDICATOR': '指標発表30分前の速報感重視の投稿。「あと〇分で〇〇発表」という緊張感。先輩が後輩に直前に教える感覚。'
    };
    var typeContext = typeContextMap[postType];
    if (typeContext) {
      prompt += '\n【投稿タイプ「' + postType + '」のトーンと構造を厳守せよ】\n';
      prompt += typeContext + '\n';
      prompt += '・修正後もこのトーン・時間帯感を維持せよ。別タイプの投稿に変質させるな。\n';
    }
    
    // ★v12.4: Gemini→Claude化（確定データガード付きで方向の矛盾を防止）
    var result = callClaudeGenerate_(prompt, getApiKeys());
    
    if (result && result.text) {
      var fixedText = result.text.trim();
      
      // ★v8.1→v12.4: ファクトチェック用語が混入していないかチェック
      // autoFixPost_がClaude（旧Gemini）に修正を依頼した際、「修正後テキスト」ではなく
      // 「ファクトチェック結果の説明文」を返してしまうケースへの対策
      var contaminationPatterns = [
        '記述は正確です',
        '検証できません',
        '確認できません',
        '予定はないようです',
        '一致しています',
        '一致します',
        '正確です。',
        'は正しいです',
        '乖離しています',
        '情報源によると',
        '検索結果では',
        '検索結果によると',
        '提供された情報',
        '確認されました',
        'N/A'
      ];
      var isContaminated = false;
      for (var ci = 0; ci < contaminationPatterns.length; ci++) {
        if (fixedText.indexOf(contaminationPatterns[ci]) !== -1) {
          console.log('⚠️ 自動修正テキストにファクトチェック用語混入: 「' + contaminationPatterns[ci] + '」→ 修正を棄却');
          isContaminated = true;
          break;
        }
      }
      if (isContaminated) {
        return { text: postText, fixed: false, fixLog: '修正棄却（ファクトチェック用語混入）' };
      }
      
      // 修正ログ生成
      var fixLog = '【自動修正 ' + issues.length + '件】\n';
      for (var j = 0; j < issues.length; j++) {
        fixLog += '  ' + issues[j].verdict + ' ' + issues[j].claim + ' → 修正済み\n';
      }
      
      console.log('✅ 自動修正完了（' + issues.length + '件修正）');
      
      return {
        text: fixedText,
        fixed: true,
        fixLog: fixLog
      };
    }
    
    console.log('⚠️ 自動修正失敗。元テキストを使用');
    return { text: postText, fixed: false, fixLog: '自動修正失敗' };
    
  } catch (e) {
    console.log('⚠️ 自動修正エラー: ' + e.message);
    return { text: postText, fixed: false, fixLog: 'エラー: ' + e.message };
  }
}


// ★v8.0: 自動修正後の残留チェック
// ファクトチェックで指摘されたclaimがまだテキストに残っているか検証
function verifyAutoFix_(fixedText, issues) {
  var remaining = [];
  for (var i = 0; i < issues.length; i++) {
    var claim = issues[i].claim || '';
    if (!claim) continue;
    
    // claimからキーワードを抽出（10文字以上の連続するフレーズを使用）
    // 短すぎると誤検出するため、ある程度の長さで判定
    var keywords = extractKeyPhrases_(claim);
    var found = false;
    for (var k = 0; k < keywords.length; k++) {
      if (fixedText.indexOf(keywords[k]) !== -1) {
        found = true;
        break;
      }
    }
    if (found) {
      remaining.push(issues[i]);
    }
  }
  return remaining;
}

// ★v8.0: claimからキーフレーズを抽出
// 「パウエル議長、利上げも協議した」→ 「利上げも協議した」等の特徴的フレーズ
function extractKeyPhrases_(claim) {
  var phrases = [];
  // claim全体が短い場合はそのまま使う
  if (claim.length <= 15) {
    phrases.push(claim);
    return phrases;
  }
  // 読点・句点で分割して、8文字以上のフレーズを抽出
  var parts = claim.split(/[、。,.\s]+/);
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.length >= 8) {
      phrases.push(part);
    }
  }
  // フレーズが取れなかった場合はclaim全体を使う
  if (phrases.length === 0) {
    phrases.push(claim);
  }
  return phrases;
}

// ★v8.0: 問題の表現を含む行を強制削除（最終手段）
// リトライでも修正されなかった場合、問題行を丸ごと削除する
function forceRemoveIssueLines_(text, issues) {
  var lines = text.split('\n');
  var removedLines = [];
  
  for (var i = 0; i < issues.length; i++) {
    var keywords = extractKeyPhrases_(issues[i].claim || '');
    for (var li = lines.length - 1; li >= 0; li--) {
      for (var k = 0; k < keywords.length; k++) {
        if (lines[li].indexOf(keywords[k]) !== -1) {
          console.log('  🗑️ 強制削除: ' + lines[li].substring(0, 50) + '...');
          removedLines.push(lines[li]);
          lines.splice(li, 1);
          break;
        }
      }
    }
  }
  
  // 空行の連続を整理
  var result = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  return result;
}

// ★v12.5: qualityCheckPost_ を削除（v8.6で qualityReview.gs の qualityReviewPost_ に置き換え済み。呼び出し元ゼロ）


// ========================================
// Phase 2: 仮説パース・検証・サマリー
// ========================================

/**
 * 仮説テキストから「対象ペア」と「仮説方向」を自動パース
 * @param {string} hypothesisText - 仮説テキスト（例: 「ドル円は156円台を維持」）
 * @return {Object} { pair, rateIndex, isJpy, direction }
 */

