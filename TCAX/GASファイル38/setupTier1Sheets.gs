/**
 * CompanaFXAutoPost - setupTier1Sheets.gs
 *
 * 事故率低減 Tier 1 用のスプレッドシート 4 枚を一括作成する。
 *
 * 作成対象:
 *   1. エラー隠蔽ログ        - T1-B handleError_ の書込先(5 列)
 *   2. 修正パターンログ      - T1-C Stage 2 修正の記録先(11 列)
 *   3. 修正パターン週次サマリ - T1-C 週次集計の出力先(8 列)
 *   4. 却下理由ログ          - T1-D 承認メール却下時の記録(7 列)
 *
 * 冪等性: 既存シートがあれば作成をスキップ(ヘッダー上書きはしない)。安全に何度でも実行可能。
 *
 * 使い方:
 *   1. Apps Script エディタでこの関数 setupTier1Sheets を選択
 *   2. 実行ボタンをクリック
 *   3. 初回のみ権限承認が必要(Sheets アクセス)
 *   4. 実行ログで「✅ 新規作成」「ℹ️ スキップ」を確認
 *
 * 関連: 事故率低減_Phase5準備_要件定義書_v1_1.md
 *
 * 履歴:
 *   v14.2(2026-04-24): Tier 1 シート一括作成関数として新規追加
 */
function setupTier1Sheets() {
  var keys;
  try {
    keys = getApiKeys();
  } catch (e) {
    console.log('❌ getApiKeys() 呼び出し失敗: ' + e.message);
    return { success: false, error: 'API キー取得失敗' };
  }

  if (!keys.SPREADSHEET_ID) {
    console.log('❌ ScriptProperties に SPREADSHEET_ID が未設定です');
    return { success: false, error: 'SPREADSHEET_ID 未設定' };
  }

  var ss;
  try {
    ss = SpreadsheetApp.openById(keys.SPREADSHEET_ID);
  } catch (e) {
    console.log('❌ スプレッドシートを開けません: ' + e.message);
    return { success: false, error: 'スプレッドシート open 失敗' };
  }

  // ===== シート仕様定義 =====
  var specs = [
    {
      name: 'エラー隠蔽ログ',
      headers: ['日時', 'レベル', '発生箇所', 'エラーメッセージ', 'メタ情報(JSON)'],
      widths: [180, 90, 220, 400, 300],
      note: 'T1-B handleError_ の書込先。warning レベルのエラーがここに記録される。レベルは critical / warning / info の 3 種類'
    },
    {
      name: '修正パターンログ',
      headers: [
        '発生日時', '投稿ID', '投稿タイプ', '誤りタイプ', '修正方式',
        '誤り原文', '修正後', '検出層', '修正理由', '関連キーワード',
        'Compana 後確認'
      ],
      widths: [180, 180, 120, 140, 110, 300, 300, 110, 300, 200, 180],
      note: 'T1-C Stage 2 修正の記録先。誤りタイプ: 論理矛盾 / 事実誤り / Web検証NG / 品質error / 時間軸違反 / メタ情報混入 など。K 列は週次レビュー時に Compana さんが記入(空欄=未確認 / 誤判定 / 正当)'
    },
    {
      name: '修正パターン週次サマリ',
      headers: [
        '集計実行日', '対象期間開始', '対象期間終了',
        '投稿タイプ', '誤りタイプ', '件数', '全投稿数', '発生率(%)'
      ],
      widths: [140, 140, 140, 120, 140, 80, 100, 100],
      note: 'T1-C 週次集計の出力先。毎週金曜 18:00 のトリガーで summarizeCorrectionPatternsWeekly_ が自動実行される(T1-C 実装後に有効化)'
    },
    {
      name: '却下理由ログ',
      headers: [
        '却下日時', '投稿ID', '投稿タイプ', '却下理由タグ',
        '投稿本文', '投稿時の修正件数', '自由記述'
      ],
      widths: [180, 180, 120, 160, 400, 140, 300],
      note: 'T1-D 承認メール却下時の記録。タグは 9 種類: 数値誤り / 固有名詞誤り / 論理矛盾 / 事実誤り(その他) / トーン不適 / タイミング不適 / 重複 / 内容薄い / その他'
    }
  ];

  // ===== 実行 =====
  var results = [];
  specs.forEach(function(spec) {
    var existing = ss.getSheetByName(spec.name);
    if (existing) {
      results.push({ name: spec.name, status: 'skipped', reason: '既存シートあり' });
      return;
    }

    try {
      var sheet = ss.insertSheet(spec.name);

      // ヘッダー書込
      sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);

      // ヘッダー書式
      var headerRange = sheet.getRange(1, 1, 1, spec.headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#e8f0fe');
      headerRange.setHorizontalAlignment('center');
      headerRange.setBorder(true, true, true, true, false, false);

      // 1 行目を固定
      sheet.setFrozenRows(1);

      // 列幅
      if (spec.widths) {
        spec.widths.forEach(function(w, i) {
          sheet.setColumnWidth(i + 1, w);
        });
      }

      // A1 にシート用途メモ
      sheet.getRange(1, 1).setNote(spec.note);

      results.push({
        name: spec.name,
        status: 'created',
        cols: spec.headers.length
      });
    } catch (e) {
      results.push({
        name: spec.name,
        status: 'failed',
        error: e.message
      });
    }
  });

  // ===== 結果レポート =====
  console.log('========================================');
  console.log('📋 setupTier1Sheets 実行結果');
  console.log('========================================');
  results.forEach(function(r) {
    if (r.status === 'created') {
      console.log('✅ ' + r.name + ': 新規作成(' + r.cols + '列)');
    } else if (r.status === 'skipped') {
      console.log('ℹ️ ' + r.name + ': スキップ(' + r.reason + ')');
    } else {
      console.log('❌ ' + r.name + ': 失敗(' + r.error + ')');
    }
  });

  var createdCount = results.filter(function(r) { return r.status === 'created'; }).length;
  var skippedCount = results.filter(function(r) { return r.status === 'skipped'; }).length;
  var failedCount  = results.filter(function(r) { return r.status === 'failed';  }).length;

  console.log('----------------------------------------');
  console.log('📊 サマリ: 新規作成 ' + createdCount + ' 枚 / スキップ ' + skippedCount + ' 枚 / 失敗 ' + failedCount + ' 枚');
  console.log('========================================');

  if (failedCount > 0) {
    console.log('⚠️ 失敗したシートがあります。エラーメッセージを確認してください。');
  } else if (createdCount > 0) {
    console.log('✅ Day 0 準備完了。次のステップ: T1-B/C/D の実装を Apps Script に反映してください。');
  } else {
    console.log('ℹ️ 全てのシートが既に存在します。再実行の必要はありません。');
  }

  return {
    success: failedCount === 0,
    created: createdCount,
    skipped: skippedCount,
    failed: failedCount,
    results: results
  };
}


/**
 * T1-C 週次集計トリガーをセットアップする。
 *
 * summarizeCorrectionPatternsWeekly_ が実装された後(T1-C 完了後)に実行する。
 * 毎週金曜 18:00 に自動実行されるトリガーを登録する。
 *
 * 冪等性: 既存トリガーがあれば上書きしない(重複登録を防ぐ)。
 *
 * 使い方:
 *   1. T1-C 実装が Apps Script に反映された後に実行
 *   2. トリガーメニューで「summarizeCorrectionPatternsWeekly_ 毎週金曜 18:00」を確認
 *
 * 関連: 事故率低減_Phase5準備_要件定義書_v1_1.md T1-C
 */
function setupTier1WeeklyTrigger() {
  var functionName = 'summarizeCorrectionPatternsWeekly_';

  // 既存トリガー確認
  var existingTriggers = ScriptApp.getProjectTriggers();
  var found = existingTriggers.some(function(t) {
    return t.getHandlerFunction() === functionName;
  });

  if (found) {
    console.log('ℹ️ 既に ' + functionName + ' のトリガーが登録されています。スキップ');
    return { success: true, status: 'skipped' };
  }

  // T1-C 関数が存在するか確認
  if (typeof summarizeCorrectionPatternsWeekly_ !== 'function') {
    console.log('❌ ' + functionName + ' 関数が未定義です。T1-C 実装を先に完了してから再実行してください');
    return { success: false, error: 'T1-C 未実装' };
  }

  try {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.FRIDAY)
      .atHour(18)
      .create();
    console.log('✅ トリガー登録成功: ' + functionName + '(毎週金曜 18:00)');
    return { success: true, status: 'created' };
  } catch (e) {
    console.log('❌ トリガー登録失敗: ' + e.message);
    return { success: false, error: e.message };
  }
}
