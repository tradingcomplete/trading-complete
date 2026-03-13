/**
 * CompanaFXAutoPost - xApi.gs
 * X API v2 への投稿機能
 * OAuth 1.0a 認証（HMAC-SHA1）
 */

// ===== テキストのみ投稿 =====
function postTweet(text) {
  const url = X_API_BASE + '/tweets';
  const keys = getApiKeys();
  
  const payload = {
    text: text
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      Authorization: buildOAuthHeader_('POST', url, keys)
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const body = JSON.parse(response.getContentText());
  
  if (code === 201) {
    console.log('✅ 投稿成功！ Tweet ID: ' + body.data.id);
    return { success: true, tweetId: body.data.id };
  } else {
    console.log('❌ 投稿失敗 (' + code + '): ' + JSON.stringify(body));
    return { success: false, error: body, statusCode: code };
  }
}

// ===== 画像付き投稿 =====
function postTweetWithMedia(text, mediaId) {
  const url = X_API_BASE + '/tweets';
  const keys = getApiKeys();
  
  const payload = {
    text: text,
    media: {
      media_ids: [mediaId]
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      Authorization: buildOAuthHeader_('POST', url, keys)
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const body = JSON.parse(response.getContentText());
  
  if (code === 201) {
    console.log('✅ 画像付き投稿成功！ Tweet ID: ' + body.data.id);
    return { success: true, tweetId: body.data.id };
  } else {
    console.log('❌ 画像付き投稿失敗 (' + code + '): ' + JSON.stringify(body));
    return { success: false, error: body, statusCode: code };
  }
}

// ===== 画像アップロード（v1.1 media/upload） =====
function uploadMedia(imageBlob) {
  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  const keys = getApiKeys();
  
  // multipart/form-data で送信（Blobを直接渡す）
  // OAuth署名にはPOSTパラメータを含めない（multipartの仕様）
  const options = {
    method: 'post',
    headers: {
      Authorization: buildOAuthHeader_('POST', url, keys)
    },
    payload: {
      media: imageBlob
    },
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const body = JSON.parse(response.getContentText());
  
  if (code === 200) {
    console.log('✅ 画像アップロード成功！ Media ID: ' + body.media_id_string);
    return { success: true, mediaId: body.media_id_string };
  } else {
    console.log('❌ 画像アップロード失敗 (' + code + '): ' + JSON.stringify(body));
    return { success: false, error: body, statusCode: code };
  }
}

// ===== OAuth 1.0a ヘッダー生成（内部関数） =====
function buildOAuthHeader_(method, url, keys) {
  var timestamp = Math.floor(Date.now() / 1000).toString();
  var nonce = Utilities.getUuid().replace(/-/g, '');
  
  // OAuth パラメータ
  var params = {
    oauth_consumer_key: keys.X_API_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: keys.X_ACCESS_TOKEN,
    oauth_version: '1.0'
  };
  
  // パラメータをソートして結合
  var sortedKeys = Object.keys(params).sort();
  var paramPairs = [];
  for (var i = 0; i < sortedKeys.length; i++) {
    paramPairs.push(
      percentEncode_(sortedKeys[i]) + '=' + percentEncode_(params[sortedKeys[i]])
    );
  }
  var paramString = paramPairs.join('&');
  
  // 署名ベース文字列
  var signatureBase = method.toUpperCase() + '&' +
    percentEncode_(url) + '&' +
    percentEncode_(paramString);
  
  // 署名キー
  var signingKey = percentEncode_(keys.X_API_SECRET) + '&' +
    percentEncode_(keys.X_ACCESS_SECRET);
  
  // HMAC-SHA1 で署名（GAS標準のcomputeHmacSignatureを使用）
  var signatureBytes = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    signatureBase,
    signingKey
  );
  var signature = Utilities.base64Encode(signatureBytes);
  
  // oauth_signature を追加
  params.oauth_signature = signature;
  
  // Authorization ヘッダーを組み立て
  var headerParts = [];
  var allKeys = Object.keys(params).sort();
  for (var j = 0; j < allKeys.length; j++) {
    headerParts.push(
      percentEncode_(allKeys[j]) + '="' + percentEncode_(params[allKeys[j]]) + '"'
    );
  }
  
  return 'OAuth ' + headerParts.join(', ');
}

// ===== RFC 3986 パーセントエンコード =====
function percentEncode_(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

// ===== テスト投稿（動作確認用） =====
function testPost() {
  var now = new Date();
  var timeStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  
  var text = '🔧 CompanaFXAutoPost テスト\n' +
    timeStr + '\n' +
    '自動投稿システムの動作確認です。';
  
  console.log('=== テスト投稿 ===');
  console.log('テキスト: ' + text);
  console.log('文字数: ' + text.length);
  console.log('送信中...');
  
  var result = postTweet(text);
  
  if (result.success) {
    console.log('');
    console.log('🎉 テスト投稿成功！');
    console.log('URL: https://x.com/Compana_Doppio/status/' + result.tweetId);
  } else {
    console.log('');
    console.log('テスト投稿失敗。エラー内容を確認してください。');
    if (result.statusCode === 401) {
      console.log('→ 認証エラー: APIキーまたはアクセストークンを確認');
    } else if (result.statusCode === 403) {
      console.log('→ 権限エラー: アプリの権限が「読み取りと書き込み」か確認');
    } else if (result.statusCode === 402) {
      console.log('→ クレジット不足: console.x.com でクレジットを購入してください');
    } else if (result.statusCode === 429) {
      console.log('→ レート制限: しばらく待ってから再試行');
    }
  }
  
  return result;
}

// ===== テスト: 画像付き投稿（Xに実際に投稿される！） =====
function testPostWithImage() {
  console.log('=== 画像付き投稿テスト ===');
  console.log('⚠️ 実際にXに投稿されます');
  console.log('');
  
  // Step 1: Driveから画像を取得
  console.log('Step 1: Drive画像取得...');
  var testText = 'チェックリスト機能でエントリー前に根拠を確認';
  var imageResult = getMatchedDriveImage_(testText);
  
  if (!imageResult) {
    console.log('❌ 画像取得失敗。testDriveImages()でフォルダを確認してください');
    return;
  }
  
  console.log('✅ 画像取得: [' + imageResult.folder + '] ' + imageResult.name);
  var sizeKB = (imageResult.blob.getBytes().length / 1024).toFixed(1);
  console.log('   サイズ: ' + sizeKB + ' KB');
  console.log('');
  
  // Step 2: X APIに画像アップロード
  console.log('Step 2: X APIに画像アップロード...');
  var mediaResult = uploadMedia(imageResult.blob);
  
  if (!mediaResult.success) {
    console.log('❌ 画像アップロード失敗');
    if (mediaResult.statusCode === 401) {
      console.log('→ 認証エラー: media/uploadはv1.1 APIです。アプリの権限を確認');
    } else if (mediaResult.statusCode === 413) {
      console.log('→ ファイルサイズ超過: 5MB以下の画像を使用してください');
    }
    return;
  }
  
  console.log('✅ アップロード成功: mediaId=' + mediaResult.mediaId);
  console.log('');
  
  // Step 3: 画像付きで投稿
  console.log('Step 3: 画像付き投稿...');
  var now = new Date();
  var timeStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  
  var text = '🔧 画像付き投稿テスト\n' +
    timeStr + '\n' +
    'Drive画像マッチシステムの動作確認です。\n' +
    '画像: ' + imageResult.name;
  
  var postResult = postTweetWithMedia(text, mediaResult.mediaId);
  
  console.log('');
  console.log('========================================');
  if (postResult.success) {
    console.log('🎉 画像付き投稿成功！');
    console.log('URL: https://x.com/Compana_Doppio/status/' + postResult.tweetId);
    console.log('画像: [' + imageResult.folder + '] ' + imageResult.name);
  } else {
    console.log('❌ 画像付き投稿失敗');
    if (postResult.statusCode === 400) {
      console.log('→ mediaIdが無効な可能性。アップロード直後に投稿してください');
    }
  }
  console.log('========================================');
  
  return postResult;
}

// ===== テスト: 画像アップロードのみ（投稿しない。安全） =====
function testUploadOnly() {
  console.log('=== 画像アップロードテスト（投稿しない） ===');
  console.log('');
  
  var testText = 'リスク自動判定で許容損失額を超えた時に赤警告が出る';
  var imageResult = getMatchedDriveImage_(testText);
  
  if (!imageResult) {
    console.log('❌ 画像取得失敗');
    return;
  }
  
  console.log('画像: [' + imageResult.folder + '] ' + imageResult.name);
  var sizeKB = (imageResult.blob.getBytes().length / 1024).toFixed(1);
  console.log('サイズ: ' + sizeKB + ' KB');
  console.log('MIME: ' + imageResult.blob.getContentType());
  console.log('');
  
  console.log('X APIにアップロード中...');
  var mediaResult = uploadMedia(imageResult.blob);
  
  console.log('');
  if (mediaResult.success) {
    console.log('✅ アップロード成功！');
    console.log('Media ID: ' + mediaResult.mediaId);
    console.log('');
    console.log('→ このmediaIdを使えば画像付き投稿ができます');
    console.log('→ testPostWithImage() で実際に投稿できます');
  } else {
    console.log('❌ アップロード失敗');
    console.log('レスポンス: ' + JSON.stringify(mediaResult.error));
  }
}
/**
 * Phase 4 テスト: ツイートのpublic_metricsを取得できるか確認
 * 安全: 読み取りのみ。投稿しない。
 * 実行後、console.x.com でクレジット消費量を確認
 */
function testGetTweetMetrics() {
  console.log('=== Phase 4 テスト: ツイートメトリクス取得 ===');
  console.log('');

  // 投稿履歴シートから最新のツイートIDを1つ取得
  var keys = getApiKeys();
  var ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('投稿履歴');

  if (!sheet || sheet.getLastRow() < 2) {
    console.log('❌ 投稿履歴にデータがありません');
    return;
  }

  var tweetId = null;
  for (var i = sheet.getLastRow(); i >= 2; i--) {
    var val = sheet.getRange(i, 10).getValue(); // J列
    if (val && val.toString().trim() !== '') {
      tweetId = val.toString().trim();
      break;
    }
  }

  if (!tweetId) {
    console.log('❌ ツイートIDが見つかりません');
    return;
  }

  console.log('テスト対象ツイートID: ' + tweetId);
  console.log('');

  // GET /2/tweets でpublic_metricsを取得
  var url = 'https://api.x.com/2/tweets?ids=' + tweetId + '&tweet.fields=public_metrics,created_at';

  var options = {
    method: 'get',
    headers: {
      Authorization: buildOAuthHeader_('GET', url.split('?')[0], keys)
    },
    muteHttpExceptions: true
  };

  // 注意: OAuth署名にはクエリパラメータを含める必要がある
  // GETリクエストの場合、署名ベース文字列にパラメータを含める
  // buildOAuthHeader_はPOST用なので、GETパラメータ対応版を使う
  var baseUrl = 'https://api.x.com/2/tweets';
  var params = {
    ids: tweetId,
    'tweet.fields': 'public_metrics,created_at'
  };

  var oauthHeader = buildOAuthHeaderWithParams_('GET', baseUrl, keys, params);

  var fullUrl = baseUrl + '?ids=' + tweetId + '&tweet.fields=public_metrics,created_at';
  var getOptions = {
    method: 'get',
    headers: {
      Authorization: oauthHeader
    },
    muteHttpExceptions: true
  };

  console.log('API呼び出し中...');
  var response = UrlFetchApp.fetch(fullUrl, getOptions);
  var code = response.getResponseCode();
  var body = response.getContentText();

  console.log('ステータスコード: ' + code);
  console.log('');

  if (code === 200) {
    var data = JSON.parse(body);
    console.log('✅ メトリクス取得成功');
    console.log('');

    if (data.data && data.data.length > 0) {
      var tweet = data.data[0];
      console.log('ツイートID: ' + tweet.id);
      console.log('作成日時: ' + (tweet.created_at || '不明'));

      if (tweet.public_metrics) {
        var m = tweet.public_metrics;
        console.log('');
        console.log('--- public_metrics ---');
        console.log('  インプレッション: ' + (m.impression_count || 0));
        console.log('  いいね: ' + (m.like_count || 0));
        console.log('  RT: ' + (m.retweet_count || 0));
        console.log('  返信: ' + (m.reply_count || 0));
        console.log('  引用: ' + (m.quote_count || 0));
        console.log('  ブックマーク: ' + (m.bookmark_count || 0));
      } else {
        console.log('⚠️ public_metricsフィールドが含まれていません');
      }
    }
  } else {
    console.log('❌ API失敗');
    console.log('レスポンス: ' + body);

    if (code === 401) {
      console.log('→ 認証エラー: OAuth署名を確認');
    } else if (code === 403) {
      console.log('→ 権限エラー: pay-per-useでこのエンドポイントが使えない可能性');
    } else if (code === 429) {
      console.log('→ レート制限: しばらく待ってから再試行');
    }
  }

  console.log('');
  console.log('=== テスト完了 ===');
  console.log('→ console.x.com のクレジット残高を確認してください');
}


/**
 * GETリクエスト用OAuth署名（クエリパラメータを署名に含める）
 */
function buildOAuthHeaderWithParams_(method, url, keys, queryParams) {
  var timestamp = Math.floor(Date.now() / 1000).toString();
  var nonce = Utilities.getUuid().replace(/-/g, '');

  var params = {
    oauth_consumer_key: keys.X_API_KEY,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: keys.X_ACCESS_TOKEN,
    oauth_version: '1.0'
  };

  // クエリパラメータも署名対象に含める
  if (queryParams) {
    var qKeys = Object.keys(queryParams);
    for (var i = 0; i < qKeys.length; i++) {
      params[qKeys[i]] = queryParams[qKeys[i]];
    }
  }

  var sortedKeys = Object.keys(params).sort();
  var paramPairs = [];
  for (var j = 0; j < sortedKeys.length; j++) {
    paramPairs.push(
      percentEncode_(sortedKeys[j]) + '=' + percentEncode_(params[sortedKeys[j]])
    );
  }
  var paramString = paramPairs.join('&');

  var signatureBase = method.toUpperCase() + '&' +
    percentEncode_(url) + '&' +
    percentEncode_(paramString);

  var signingKey = percentEncode_(keys.X_API_SECRET) + '&' +
    percentEncode_(keys.X_ACCESS_SECRET);

  var signatureBytes = Utilities.computeHmacSignature(
    Utilities.MacAlgorithm.HMAC_SHA_1,
    signatureBase,
    signingKey
  );
  var signature = Utilities.base64Encode(signatureBytes);

  params.oauth_signature = signature;

  // Authorizationヘッダーにはoauth_パラメータのみ含める
  var headerParts = [];
  var allKeys = Object.keys(params).sort();
  for (var k = 0; k < allKeys.length; k++) {
    if (allKeys[k].indexOf('oauth_') === 0) {
      headerParts.push(
        percentEncode_(allKeys[k]) + '="' + percentEncode_(params[allKeys[k]]) + '"'
      );
    }
  }

  return 'OAuth ' + headerParts.join(', ');
}

// ========================================
// Phase 4: ツイートメトリクス取得
// ========================================

/**
 * ツイートIDの配列からpublic_metricsをバッチ取得
 * X API v2: GET /2/tweets?ids=id1,id2,...&tweet.fields=public_metrics,created_at
 * 最大100件まて1リクエストで取得可能
 * 
 * @param {Array} tweetIds - ツイートIDの配列（最大100件）
 * @return {Object} キーがツイートID、値がメトリクスのオブジェクト。失敗時はnull
 */
function fetchTweetMetrics_(tweetIds) {
  if (!tweetIds || tweetIds.length === 0) return null;

  // 最大100件に制限
  var ids = tweetIds.slice(0, 100);
  var keys = getApiKeys();

  var baseUrl = 'https://api.x.com/2/tweets';
  var params = {
    ids: ids.join(','),
    'tweet.fields': 'public_metrics,created_at'
  };

  var oauthHeader = buildOAuthHeaderWithParams_('GET', baseUrl, keys, params);
  var fullUrl = baseUrl + '?ids=' + encodeURIComponent(ids.join(',')) + '&tweet.fields=public_metrics,created_at';

  var options = {
    method: 'get',
    headers: {
      Authorization: oauthHeader
    },
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(fullUrl, options);
    var code = response.getResponseCode();

    if (code === 200) {
      var body = JSON.parse(response.getContentText());
      var result = {};

      if (body.data && body.data.length > 0) {
        for (var i = 0; i < body.data.length; i++) {
          var tweet = body.data[i];
          if (tweet.public_metrics) {
            result[tweet.id] = {
              impressions: tweet.public_metrics.impression_count || 0,
              likes: tweet.public_metrics.like_count || 0,
              retweets: tweet.public_metrics.retweet_count || 0,
              replies: tweet.public_metrics.reply_count || 0,
              quotes: tweet.public_metrics.quote_count || 0,
              bookmarks: tweet.public_metrics.bookmark_count || 0,
              createdAt: tweet.created_at || ''
            };
          }
        }
      }

      console.log('✅ メトリクス取得成功: ' + Object.keys(result).length + '/' + ids.length + '件');
      return result;

    } else if (code === 429) {
      console.log('⚠️ メトリクス取得: レート制限（429）→ スキップ');
      return null;
    } else {
      console.log('❌ メトリクス取得失敗 (' + code + '): ' + response.getContentText().substring(0, 300));
      return null;
    }
  } catch (e) {
    console.log('❌ メトリクス取得エラー: ' + e.message);
    return null;
  }
}


/**
 * 投稿履歴から未取得ツイートを収集し、メトリクスを取得してエンゲージメントログに保存
 * scheduler.gsから毎朝呼ばれる
 */
function collectAndSaveMetrics_() {
  try {
    console.log('📊 エンゲージメント収集開始');

    // 未取得ツイートを取得（sheetsManager.gsの関数）
    var uncollected = getUncollectedTweets();

    if (uncollected.length === 0) {
      console.log('📊 未取得ツイートなし');
      return;
    }

    console.log('📊 未取得ツイート: ' + uncollected.length + '件');

    // ツイートIDの配列を作成
    var tweetIds = [];
    var tweetMap = {}; // ID → uncollectedデータのマッピング
    for (var i = 0; i < uncollected.length; i++) {
      tweetIds.push(uncollected[i].tweetId);
      tweetMap[uncollected[i].tweetId] = uncollected[i];
    }

    // バッチでメトリクス取得
    var metrics = fetchTweetMetrics_(tweetIds);
    if (!metrics) {
      console.log('📊 メトリクス取得失敗 → スキップ');
      return;
    }

    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    var savedCount = 0;

    // 各ツイートのメトリクスを保存
    var ids = Object.keys(metrics);
    for (var j = 0; j < ids.length; j++) {
      var tweetId = ids[j];
      var m = metrics[tweetId];
      var tweetInfo = tweetMap[tweetId];

      if (!tweetInfo) continue;

      // エンゲージメント率を計算
      var engagements = m.likes + m.retweets + m.replies;
      var er = m.impressions > 0 ? (engagements / m.impressions * 100) : 0;
      er = Math.round(er * 100) / 100; // 小数点2桁

      // 品質スコアを計算（sheetsManager.gsの関数）
      var qualityScore = calculateQualityScore(er, tweetInfo.postType);

      // エンゲージメントログに保存（sheetsManager.gsの関数）
      saveEngagementData({
        postId: tweetInfo.postId,
        tweetId: tweetId,
        fetchedAt: now,
        impressions: m.impressions,
        likes: m.likes,
        retweets: m.retweets,
        replies: m.replies,
        engagementRate: er,
        qualityScore: qualityScore,
        postType: tweetInfo.postType
      });

      var emoji = qualityScore >= 60 ? '🟢' : qualityScore >= 40 ? '🟡' : '🔴';
      console.log('  ' + emoji + ' ' + tweetInfo.postType + ': 印象' + m.impressions +
                  ' いいね' + m.likes + ' ER' + er + '% スコア' + qualityScore);
      savedCount++;
    }

    console.log('📊 エンゲージメント収集完了: ' + savedCount + '件保存');

  } catch (e) {
    console.log('📊 エンゲージメント収集エラー（続行）: ' + e.message);
  }
}

/**
 * Phase 4 テスト: エンゲージメント一括収集
 * GASエディタから手動実行用
 */
function testCollectMetrics() {
  collectAndSaveMetrics_();
}