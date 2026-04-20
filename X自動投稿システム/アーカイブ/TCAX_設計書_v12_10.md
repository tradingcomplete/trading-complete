# T-CAX 設計書 v12.10

**方針**: プロンプト公開 + 学び自動蓄積 + 7通貨ペア市場データ + 完全自動学習 + Phase A→B→C 全モード稼働 + 確定データ優先の事実検証 + Claude主導の検証チェーン
**関連**: スプレッドシート仕様書 v2.0（シート詳細・23シート）/ 全体設計図 v12.10（システム全体）/ TCAX_REFERENCE.md（事件簿・ベストプラクティス）
**v12.10 変更点(投稿品質総合改善・2026-04-18)**:
  - ★factCheck 無効化フラグ導入: ScriptProperties `DISABLE_FACTCHECK=true` で Gemini factCheck/autoFix をスキップ。Claude品質レビュー + 最終事実検証 + 対話型検証の3段構成に簡素化
  - ★Q6.5 論理整合性チェック追加: qualityReview.gs に「事実は正しいが論理が矛盾」パターンの独立判定を追加。「外れた vs 合っていた」等を検出
  - ★優先度付き修正プロンプト: Q6.5 > Q6 > Q5/Q7 > Q1/Q2/Q3 > Q4 の順に並べ替え、Claude が致命的矛盾から修正するように誘導
  - ★finalFactVerify 過剰修正防止: 時間軸を含む主張(週中高値・〜年以来・急落率)はスナップショット値で反証しない
  - ★ニュース取得を Gemini → Claude web_search に切替: marketAnalysis.gs の fetchMarketNews_ を全面改修。Gemini Grounding の検索スキップ問題を根絶。ソース0件時はキャッシュ保存せず再取得を試みる
  - ★プロンプト肥大化対策: キャラクターシート末尾再注入廃止・TC関連ヘッダ統合・buildMarketTypePolicy_ 内の【最重要】ラベル削減・【経済イベントの日付・時制】統合等。92→68セクション・29,686→22,677字
  - ★キャラクターシート改善: 【共感】5セクションを1つに統合・【軽さと勢い(感嘆符・行動促し・疑問形)】追加・【禁止事項】に「具体エピソード詰め込み禁止」追加
**v12.9 変更点**: 
  - ★Q6 確定データ強化: qualityReview.gs で collectAnchorData_ を再利用し、政策金利・通貨強弱・継続中重大事象を注入。Claude時系列バイアスによる誤判定を根絶
  - ★GOLDEN 夜の材料ヒント注入: promptBuilder.gs に buildEveningMaterialHint_ を新設。経済カレンダーから GOLDEN 投稿以降の材料を動的抽出
  - ★SCHEDULE 整合性修正: config.gs の月〜金 times 配列から 22:XX を削除。runMorning 異常発火事件の根本対策
  - ★testFunctions.gs Lv2 拡充: verifyScheduleIntegrity / 3シート確認 / Q6シナリオ別等、15関数追加
  - ★TCAX_REFERENCE.md 新設: 事件簿4件 + ベストプラクティス10項目
**v12.8 変更点**: タスク5-a/b/c 完了反映。全モード(manual/validate/auto)で Phase A→B→C 非同期パイプライン稼働。対話型検証 Step 4 が本番フロー内で初稼働成功。

---

## 1. 設計思想

```
「魚ではなく、釣り方を」

AI自動投稿であることを公開。プロンプトを見せて信頼と期待感を生む。

【公開するもの（スプレッドシート）】
  キャラクター / トレードスタイル / 投稿プロンプト / 参照ソース / TC概要
  → 「何をAIに聞いているか」が見える

【非公開のもの（コード内）】
  フォーマットルール / 後処理チェーン / 文字数制限
  → 見せても意味がない＆見栄えが悪い

【使うほど賢くなる仕組み】
  投稿成功時にGeminiが学びを自動抽出 → 学びログに蓄積
  6カテゴリ: 相場心理 / テクニカル / ファンダメンタルズ / リスク管理 / 指標分析 / 市場構造

★v12.0: 3段防御アーキテクチャ
  Groundingの用途を「リサーチ」「検証」に限定。「ライティング」では不使用。
  チェック1: Geminiファクトチェック（確定データ + Grounding検索）
  チェック2: Claude事実検証（Q6: 確定データとの矛盾検出 + 定性的主張検証）
  チェック3: Claude品質チェック（Q1〜Q5 + Q7絵文字行）
  → チェック2と3は同一API呼び出しで実行（追加コストなし）

★v12.1: 3段階生成アーキテクチャ（v12.0を発展）
  Geminiに「分析もライティングも全部やれ」は方向性矛盾の原因。
  Stage 1: Claude が市場データを分析（通貨強弱・方向性・背景を正しく読む）
  Stage 2: Gemini がClaude分析に従って投稿を書く
  Stage 3: Claude が品質レビュー（Q1〜Q7）
  各AIの得意分野に仕事を割り当てる。人間のチームと同じ考え方。
  BTC/ゴールドは事前取得（scheduledFetchRates）で60秒短縮。

★v12.1追加: 通貨強弱シート + ダウ理論
  毎時scheduledFetchRatesで通貨強弱・勢い・初動・ダウ理論を蓄積。
  通貨強弱 + ダウ理論はT-CAXの「データ」「投稿スタイル」「運用」全てに適合する唯一の組み合わせ。
  RSI/MACD/ボリンジャー等はデータ粒度・投稿スタイルで不適合。これ以上足さない。

★v12.2: 4層安全網 + Claudeフォールバック
  チェック1: Geminiファクトチェック（確定データ + Grounding検索）
  チェック2: Claude品質レビュー + Web検索（要人発言・政策決定をリアルタイム検証）
  チェック3: ファクトチェック失敗時の自動ブロック（強制manualモード）
  チェック4: validateモード（問題時のみ承認メール）
  フォールバック: Gemini Pro 503時 → Claudeで代替生成（Flashは品質不足のため不採用）

★v12.2追加: ストーリー主導への転換
  Before: データ主導（通貨強弱の数字が起点→ニュースが補足）
  After:  ストーリー主導（ホットなニュースが起点→データは裏付け証拠）
  コンパナのスタイル = ファンダ・地政学で大枠の流れを読む順張りトレーダー。
  投稿の骨格 = 因果チェーン: 原因（何が起きた）→経路（なぜ・どう波及）→為替への影響
  まわりくどい説明は禁止。1文で事実を言い切り、→行で「なぜ」を補足。

★v12.4: Claude主導アーキテクチャ
  v12.1〜v12.3の「3段階生成（Claude分析→Gemini生成→Claude検証）」を発展。
  Geminiが方向を無視する問題（AUD+2.95%なのに「豪ドル売り」と書く）が頻発。
  修正ステップでもGeminiが品質レビューの誤った指摘を鵜呑みにして正しい投稿を壊す事故。
  → 投稿生成・ファクトチェック修正・品質修正の全てをClaude化。
  → 確定データガード: 通貨強弱・レートを修正プロンプトに注入し方向矛盾を防止。
  学び: クロスチェック（異モデル検証）より、正しいデータを持っていることが重要。
  学び: 絵文字行の体言止め + プロンプト末尾の口調リマインダーでキャラクターが際立つ。
```

---

## 2. スプレッドシート構成（23シート）

```
【プロンプト素材（7シート）】
①キャラクター ②TC概要 ③投稿プロンプト（v5）④トレードスタイル
⑤参照ソース ⑥心得テーマ ⑦経済カレンダー

【データ蓄積（9シート）】
⑧投稿履歴 ⑨レートキャッシュ ⑩レートサマリー ⑪指標データ
⑫学びログ ⑬仮説検証ログ ⑭エンゲージメントログ ⑮確定データ ⑯通貨強弱

【レート分析（2シート）】
⑰日次レート ⑱週足

【運用（2シート）】
⑲下書き ⑳アノマリー（マスターデータ20行）

【★v12.7 Phase 3分割関連（3シート）】
㉑継続中重大事象（ハルシネーション対策・手動更新）
㉒対話型検証ログ（Step 4 実行記録・12列）
㉓未来日付ガードログ（削除発動記録・3列）

※ 各シートの列定義はスプレッドシート仕様書 v1.9を参照
```

---

## 3. 主要シートの構造

```
【キャラクター】2列（A:セクション B:内容）。コンパナの人格・口調・信念・相場観。全投稿に注入。
  ★v11.0: 相場観 + ネガティブ感情禁止
  ★v12.0（v11.0設計書）: 生活との接点の出し方（スケール感指示）追加
【投稿プロンプト】3列（A:タイプID B:投稿名 C:プロンプト内容）。16行。★v5に更新。
【トレードスタイル】2列（A:項目 B:内容）。18行。
【経済カレンダー】5列（A:日付 B:時刻 C:国 D:指標名 E:重要度）。週次手動更新。
【投稿履歴】12列（A:日時〜L:エラーログ）。H列=仮説、I列=学び。
【レートキャッシュ】14列（A:日時 B〜H:7通貨ペア I〜L:商品4銘柄 M:取得元 N:ステータス）。
【アノマリー】9列。20行。

※ 全列定義の詳細はスプレッドシート仕様書 v1.7を参照
```

---

## 4. フォーマットルール概要（非公開・コード内）

```
【後処理チェーン（postProcessor.gs・12段階）で制御する項目】
  外国語除去 / AI前置き除去 / 改行+空行制御 / 絵文字制限（2〜3個）
  Markdown除去 / 禁止表現置換 / 月曜「昨日」修正 / 重複ブロック除去
  孤立短文除去 / 壊れ句点修復 / ハッシュタグ処理 / レート検証

【絵文字ルール】
  許可: ☕📕📝📋💡⚠️✅（行頭専用。文中は使用禁止）
  各投稿2〜3個。0〜1個は視認性低下、4個以上はシャドウバン回避違反

【→行のルール】
  絵文字行 = 事実のメモ（短く言い切り。感想は入れるな）
  ★v12.4: 絵文字行は体言止め・動詞止めで速報ヘッドライン調
    OK: 「📝米イラン交渉が決裂。」「🛢原油、100ドル突破。」
    NG: 「📝米イラン交渉が決裂しました。」「〜しています。」
  →行 = 意見・背景・人間味（「〜かなと。」「〜感じですね。」等）
  →の前後で同じことを言い換えるな
  ★v12.0: Q7でClaudeが絵文字行の感想混入を検出・修正
  ★v12.4: Q7に体言止め判定追加

【文字数制御】
  charMin〜charMax（config.gs POST_TYPES定義）
  品質レビュー（Claude）でQ4チェック → Gemini修正 → trimToCharMax_で最終保証

【禁止事項】
  アスタリスク(*) / 「トレードした」「エントリーした」 / レートの羅列
  「今日一番動いている」（7ペアしか見ていない）/ 一方向の賭け仮説
  ネガティブ感情禁止（疲れた・胃が痛い・怖い・辛い）
```

---

## 5. プロンプト組み立て

```
最終プロンプト =
  ① キャラクター（人格・口調・相場観・生活接点のスケール感）
  ② 確定レート（7ペア + 商品4銘柄 + 株価指数）
  ③ レート方向性 + 通貨強弱 + 本日始値比
  ④ レートサマリー（高値/安値/意識される水準）
  ⑤ 市場ニュースTOP5（Gemini+Grounding自動取得。背景+生活影響フィールド）
  ⑥ 経済カレンダー（スコープ別: today/this_week/next_week）
  ⑦ アノマリー情報（該当日のみ注入）
  ⑧ 投稿プロンプトv5（タイプ別指示。役割+文字数のみ）
  ⑨ トレードスタイル
  ⑩ フォーマットルール（タイプ別・非公開）
  ⑪ 品質フィードバック（ER平均値）
  ⑫ 的中率サマリー（直近5件・全市場投稿に注入）
  ⑬ 学びログ（スコア上位+ランダム選出）
  ⑭ 仮説コンテキスト（前回仮説+レート差分）
  ⑮ 問いかけ指示（1日2回上限・確率50%で注入）
  ★⑯ キャラクター口調リマインダー（★v12.4新設・プロンプト最末尾に配置）
    LLMは最初と最後の指示を最も重視。24,000文字のデータ処理で口調が薄まるため末尾に念押し
    NG/OK例付き: 「市場では〇〇が後退。」←NG / 「正直ちょっと遠のいた感じですね。」←OK

プロンプト総文字数: 約19,000〜25,000文字（タイプにより変動）

★v12.0: テキスト生成はGrounding OFFで実行。
  プロンプトに注入済みの検証データだけで書く。
  Groundingで未検証情報を拾うとハルシネーションの原因になるため。

★v12.2: ストーリー主導の題材選定
  ニュースTOP5から最もホットな地政学・ファンダのネタ1つを選び、因果チェーンで展開。
  通貨強弱・レート・ダウ理論は「実際にこう動いている」の裏付け証拠。主役にするな。
```

---

## 6. 注入ルール

```
（v10.0から変更なし。省略せず記載）

【シート→タイプ】
キャラクター / トレードスタイル / 参照ソース / フォーマットルール → 全16タイプ
投稿プロンプト → 該当タイプ（1対1）
心得テーマ → RULE_1〜4のみ
TC概要 → RULE系 + WEEKLY系（TC導線7タイプ）
レート → 市場系のみ（RULE/KNOWLEDGEには注入しない）

【経済カレンダー スコープ】
today     → MORNING〜NY, INDICATOR
this_week → WEEKLY_REVIEW, WEEKLY_LEARNING
next_week → NEXT_WEEK, WEEKLY_HYPOTHESIS
なし      → RULE_1〜4, KNOWLEDGE

【学びログ件数】
5件: WEEKLY_REVIEW, WEEKLY_LEARNING
3件: WEEKLY_HYPOTHESIS, RULE_1〜4
2件: MORNING, GOLDEN
1件: TOKYO, LUNCH, LONDON, NY, INDICATOR
なし: NEXT_WEEK, KNOWLEDGE

【仮説振り返り】
MORNINGのみ: 前回仮説+レート差分を注入（通常の答え合わせ）
TOKYO以降: 「振り返り済み。繰り返すな」指示を注入（重複防止）
WEEKLY系: 毎回振り返りOK（1日1本なので重複しない）

【問いかけ】
対象12タイプ: MORNING/LUNCH/GOLDEN/WEEKLY系/RULE系/KNOWLEDGE
非対象4タイプ: TOKYO/LONDON/NY/INDICATOR
1日2回上限・確率50% → ScriptProperties 'TODAY_QUESTION_COUNT'で管理

【アノマリー】
市場系+WEEKLY系: 今日のアノマリーを注入（該当0件なら注入しない）
NEXT_WEEK/WEEKLY_HYPOTHESIS: 来週のアノマリーを先読み注入
RULE系/KNOWLEDGE: 注入しない
```

---

## 7. 品質管理システム（★v12.9: 4段防御 + Phase B内再実行 + Q6確定データ強化）

```
★v12.9 全体アーキテクチャ:
  Phase A 内: チェック1(ファクトチェック) + チェック2-3(品質レビュー) + チェック4(最終事実検証)
  Phase B 内: 品質レビュー + 最終事実検証 再実行 + チェック5(対話型検証 Step 4)
  Phase C 内: factCheckSkipped=true / Phase Bエラー → manual強制降格
  ★v12.9: Q6 に collectAnchorData_ 注入で確定データ完全化(RBA誤判定事件の根本対策)
  タスク18 で Phase A 内の検証層を削除予定(対話型検証の実運用評価完了後)

【ファクトチェック（factCheck.gs）— チェック1 ★v12.10で無効化デフォルト】
  ScriptProperties `DISABLE_FACTCHECK='true'` で Phase A の factCheckPost_ / autoFixPost_ をスキップ
  デフォルト動作は無効化(DISABLE_FACTCHECK 未設定でも無効扱い)
  緊急時は DISABLE_FACTCHECK='false' で再有効化可能
  
  ★無効化の理由(v12.10):
    Gemini factCheck が内部知識の古い情報で誤修正するケースが発生。
    例: 2026-04-18 WEEKLY_REVIEW で「ホルムズ海峡開放」情報を偽情報として採用し拡散。
    Claude品質レビュー(Q6)+最終事実検証+対話型検証の3段でも事実検証は十分機能する。

  ※既存ロジックは温存(緊急ロールバック用):
    Layer 1: システム確定データと照合
      ・為替レート（7ペア）: 3%超の乖離で❌
      ・商品価格（WTI/BTC/ゴールド/天然ガス）: 5%超の乖離で❌
      ・政策金利・カレンダー・要人・アノマリー
      ・継続中重大事象シート注入
    Layer 2: Grounding検索で事実確認
    RULE系はスキップ

【品質レビュー（qualityReview.gs）— チェック2+3 ★v12.10でQ6.5追加】
  Claude Sonnet 4.6 が v12.10で **8項目(Q1-Q7 + Q6.5)** をチェック:
    Q1. タイプ整合（TYPE_DESCRIPTIONSベース）
    Q2. 表現重複（今日の過去投稿とフレーズ重複）
    Q3. 文の完成度（体言止め・文脈飛躍・孤立短文）
    Q4. 文字数（charMin〜charMax。超過時はtrimToCharMax_で圧縮）
    Q5. 口調一貫性（コンパナ口調 vs アナリスト調）
    Q6. 事実の信憑性（確定データ二重チェック + Web検索でリアルタイム検証）
    ★NEW Q6.5. 論理整合性（事実は正しいが論理が矛盾するパターンを検出）
    Q7. 絵文字行の書き分け（事実のみ・感想混入禁止 + 体言止め必須）
  
  ★★★v12.10 Q6.5 論理整合性(2026-04-18 WEEKLY_REVIEW 論理矛盾事件の根本対策):
    Q6.5 は Q6(事実検証)と別観点で独立判定。例:
      ・「仮説は外れた」と「着地点は合っていた」の自己矛盾
      ・「円安進行」と「円高方向」の同時記述
      ・「リスクオフで円売り」等の因果関係誤認
      ・「上昇トレンド継続中」と「日足下降」の同一投稿内矛盾
    事実が正しくても論理矛盾する投稿は多く、これを Q6 で検出できないため独立追加。
    
    ★事件の背景: 2026-04-18 朝8:22 WEEKLY_REVIEW で
      「先週の仮説は外れました」と冒頭で書いた直後に
      「着地点は合っていた」と書く論理矛盾が発生。
      Q6は事実(レート・ニュース)のみ見るため検出できず、修正後も残存。
      Q6.5 追加後、同じ状況で論理矛盾を自動検出・修正成功。

  ★★★v12.10 優先度付き修正プロンプト:
    修正指示を以下の順序でソートし、Claude に最優先で修正させる:
      1. Q6.5 論理矛盾(★最優先)
      2. Q6 事実誤り(★次点)
      3. Q5/Q7 表現・口調
      4. Q1/Q2/Q3 構造
      5. Q4 文字数圧縮
    Q6.5 と Q6 に「★最優先」「★次点」ラベルを付与して明示。

  ★v12.9 Q6確定データ強化（2026-04-17 RBA誤判定事件の根本対策）:
    qualityReview.gs の Q6 プロンプト作成時に collectAnchorData_(postType) を呼び出し、
    以下を追加注入:
      ・政策金利（RBA/FRB/ECB/BOE/BOJ）
      ・通貨強弱（AUD/GBP/EUR/JPY/USD の日次変動率）
      ・継続中重大事象（米国関税措置/米イラン対立/ホルムズ海峡関連等）
    
    Q6 プロンプトに判定優先順位を明示:
      1) 経済カレンダー確定データ
      2) 追加の確定データ(政策金利等)
      3) 本文内の数値データ
      4) Web検索（SEO影響で古い記事が上位に出やすい）
      5) Claudeの内部知識（カットオフ以前の情報）
    
    ★テスト: testQReviewRBA() / testQReviewFOMC() / testQReviewOngoingEvents()
      (testFunctions.gs Lv2 拡充で追加)

【最終事実検証（finalFactVerify_・geminiApi.gs）— チェック4 ★v12.10で過剰修正防止】
  Claude JSON検出 + コード側置換で事実誤りを機械的修正
  検出はClaude、修正はコード置換。AI修正ステップの副作用を排除
  確定データ: レート7ペア + 本日始値 + 通貨強弱 + カレンダー + 政策金利 + 要人
  継続中重大事象シート注入(「〜ショック前」等のハルシネーション防止)
  collectAnchorData_ の成果物を qualityReview.gs と共通化(Q6 と判定整合)
  
  ★★★v12.10 過剰修正防止(2026-04-18 週中高値更新誤修正事件の根本対策):
    時間軸を含む主張はスナップショット値で反証しない。以下は errors に入れない:
      ・「週中に高値更新」「数ヶ月ぶりの高値」「〇〇年以来の水準」
      ・「今週は円高方向」「今日は円安で推移」等の期間を伴う流れ
      ・「急落」「急騰」「〜%急落」等の変化率
    判定基準: 現在のスナップショットレートと「明確に」「論理的に」矛盾する場合のみ
    検証対象にする。週間推移・日中ピーク・時間軸を含む主張は検証不能なので保持。
    
    ★事件の背景: WEEKLY_REVIEW で「豪ドル円が1990年以来の高値更新」を
      現在レート113円で反論し「高値圏での推移」に過剰修正。
      週中に114円台を付けていた可能性があり、情報解像度が大きく劣化した。

【v12.7 Phase 3分割: 対話型検証（interactiveVerify.gs）— チェック5】
  Phase B 内の executeQualityReviewChain_ 末尾で実行
  Claude + Web検索による「人間の検証プロセス」の模倣
  3ステップ構造:
    Step 1: 検証質問抽出（Claude API 1回、Web検索なし）
            投稿本文から検証対象の主張を最大5件抽出
    Step 2: 一括Web検証（Claude API 1回、Web検索あり）
            各主張を ❌/⚠️/✅ で判定
    Step 3: 修正（Claude API 0-1回、❌/⚠️がある場合のみ）
            元投稿ベースで指摘箇所を書き換え
  有効化制御: ScriptProperties 'INTERACTIVE_VERIFY_ENABLED'
    'false' = 停止 / 未設定 or 'true' = 有効
  時間制限: 最終検証完了後、残り180秒以上ある場合のみ実行
  ログ: 対話型検証ログシート(12列)に実行ごとに1行追加

【後処理チェーン（postProcessor.gs・14段階）】
  生成→リトライ→ファクトチェック修正後→品質修正後→対話型検証修正後 の5回適用
  新しい後処理 → applyPostProcessingChain_内に追加するだけ
  fixHallucinatedRates_は「最近傍キーワード割り当て方式」

【リグレッション防止（testPostProcessor.gs）】
  後処理チェーンの変更前後に testPostProcessorChain() を実行（32テストケース、API不要）
  レート桁数は formatRate_(value, pairKey, purpose) で一元管理（toFixed直書き禁止）
```

---

## 8. 市場データ収集

```
【3層アーキテクチャ】
  Layer 1: Twelve Data API（7通貨ペア + BTC + Gold、1時間ごと）
  Layer 2: GOOGLEFINANCE（日経/NYダウ/S&P/VIX/米10年債）
  Layer 3: Alpha Vantage（WTI原油 + 天然ガス、日次）

【通貨強弱】（rateManager.gs + marketAnalysis.gs）
  7ペアのレートから5通貨の強弱を計算 → 最も動いたペアを「主役」として注入
  ★v12.1: 「通貨強弱」シートに毎時蓄積（24列）
    勢い5段階: ↑↑急加速 / ↑加速 / →維持 / ↓減速 / ↓↓急減速
    ★初動検出: 2時間横ばいから動き始めた通貨をフラグ
    3hトレンド: 独歩高 / 優位 / 混戦
    ダウ理論: 日次OHLC直近5日の高値安値パターン（7ペア）
  通貨強弱+ダウ理論 = T-CAXに最適な唯一の組み合わせ（他インジケーターは不適合）

【ニュース取得】（marketAnalysis.gs・fetchMarketNews_）★v12.10でClaudeに切替
  Claude Sonnet 4.6 + web_search_20250305 で市場ニュースTOP5を取得
  各ニュースに「背景」「生活影響」フィールドを付与
  キャッシュキー: market_news_v3（1時間キャッシュ）
  プロンプトで検索強制: 「内部知識だけは禁止・3〜5回web_search推奨」
  max_uses: 5(ニュース取得は複数回の検索を許可)
  
  ★v12.10 切替理由(2026-04-18 偽ニュース拡散事件の根本対策):
    Gemini Grounding はモデルが「検索不要」と判断するとスキップする仕様。
    ソース0件のまま内部知識で回答し、古い情報(ホルムズ海峡開放等)を
    最新ニュースとして生成するケースが頻発。
    1時間キャッシュで偽ニュースが全投稿タイプに拡散する構造問題。
  
  ★v12.10 改善:
    - Gemini → Claude web_search に全面切替
    - Claude は Gemini より指示に忠実で、プロンプトで「必ず検索せよ」と
      指示すれば実用レベルで検索を実行する
    - ソース0件時はキャッシュ保存せず、次回呼び出しで再取得を試みる
    - 検索クエリ・取得ソースURLをログ出力(デバッグ・透明性確保)
    - CLAUDE_API_KEY は keys.CLAUDE_API_KEY にフォールバックで ScriptProperties 直接取得
  
  ★実測効果:
    2026-04-18 18:51 実測: 5クエリ自動生成・50件のソース取得
      1. Bloomberg 金融市場 FX 株式 金利 最新ニュース 2026年4月18日
      2. Reuters financial markets news April 18 2026 forex stocks
      3. Iran war ceasefire peace deal oil gold market April 17 18 2026
      4. 日本市場 円相場 日銀 金利 株式 4月17日 18日 2026
      5. gold price record high S&P500 record Fed Powell April 17 18 2026 market
```

---

## 9. 仮説システム

```
【2層構造仮説】
  構造仮説: 週単位の大きなシナリオ（原因→経路→為替への影響の因果チェーン）
  今日の仮説: 構造仮説の枠内で、今日のイベントがどう作用するか

【仮説サイクル】
  NY投稿で仮説を提示 → 翌朝MORNINGで答え合わせ → 学びを抽出 → 学びログに蓄積
  検証: Geminiがレート差分データで○/△/×を自動判定
  的中率: 直近5件のサマリーを全市場投稿のプロンプトに注入

【条件分岐型】
  「もしAならB、もしCならD」の構造。一方向の賭けは禁止。
  外れても学びになる仮説が最上。
```

---

## 10. 承認フロー（★v12.8: Phase A→B→C 全モード稼働）

```
【v12.8フロー(全モード共通)】
  Phase A (generatePost): テキスト生成 + Phase A内3段検証 → saveDraft (下書き保存)
    → PHASE_B_POST_ID 設定 → 1分後 executePhaseBQualityReview トリガー
  
  Phase B (executePhaseBQualityReview): 品質レビュー + 最終事実検証 + ★対話型検証★
    → 下書きステータス「Phase B完了」 → PHASE_C_POST_ID 設定
    → 1分後 executePhaseCImageAndPost トリガー
  
  Phase C (executePhaseCImageAndPost): 画像生成 → モード分岐
    ├ manual   → 承認メール送信 → ステータス「承認待ち」
    ├ validate → validatePost → 通過→直接投稿 / NG→承認メール
    └ auto     → 直接投稿 (executePhaseCPost_)

【承認後処理】
  下書きシートE列編集 → 承認 → processApprovedDrafts
  → ★v12.0: E列を再読み込み → X API投稿
  [画像再生成] → processPendingRegenRequests_ → ★v12.0: E列から最新テキスト取得 → 新メール
  [中止] → ステータス更新

★v12.8 タスク5-a/b/c 完了:
  ・handleManualMode_ / handleValidateMode_ / handleAutoMode_ が対称形に統一
  ・3モードとも「saveDraft + Phase B トリガー」のみの実装 (各30-40行)
  ・モード固有の挙動は全て Phase C の currentMode 分岐に集約
  ・autoモードでも下書きが必ず作成される → 緊急中止ウィンドウ 約2分間

★v12.7 Phase 3分割の効果:
  ・GAS 6分制限対策: 各Phase 3-4分枠で確実に完走
  ・対話型検証(Step 4)は Phase B 末尾で実行 → Phase B完了時間 約40秒増加
  ・事故時の手動ロールバック: 下書きステータスを「中止」に変更で止められる
  ・factCheckSkipped=true / Phase Bエラー → Phase C で manual 強制降格

★v12.2追加:
  ・validateモード復活（メニューに「検証モード（問題時のみ承認）」追加）
  ・ファクトチェック失敗時の自動ブロック
    factCheckSkippedフラグ（503等でファクトチェック未実行）
    → Phase C で強制的にmanualモードへ降格
  ・Claudeフォールバック通知（Gemini 503時、メールにオレンジ枠）

★v12.0修正:
  ・投稿直前にgetDraftById_でスプレッドシートE列を再読み込み
  ・手動編集した場合、編集後のテキストが確実に投稿される
  ・imageGenerator.gsの重複関数はリネームで衝突回避
    saveImageToDrive_ → approval.gs版（文字列を返す）
    saveImageToTempDrive_ → imageGenerator.gs版（オブジェクトを返す）
```

---

## 11. バージョン履歴（直近のみ）

```
v12.10（2026-04-18 完成）= 設計書v12.10
  投稿品質総合改善セッション（8段階の改善を1日で実施）
  
  背景: コンパナから「毎投稿、正直おかしい文章が多く、承認時の判断負担が大きい」
    という報告。2026-04-18 朝の WEEKLY_REVIEW で以下が同時発生:
      ・論理矛盾: 「仮説は外れた」と「着地点は合っていた」が同居
      ・事実誤認: Gemini偽ニュース「ホルムズ海峡開放」情報の拡散
      ・finalFactVerify 過剰修正: 週中高値を現在レートで反論
      ・プロンプト肥大化: 29,686文字・92セクション
  
  成果:
    ★factCheck 無効化(診断書 水準1-1):
      ・ScriptProperties DISABLE_FACTCHECK=true
      ・Phase A の factCheckPost_ / autoFixPost_ をスキップ
      ・Claude品質レビュー+最終事実検証+対話型検証の3段に簡素化
      ・Gemini ハルシネーション経由の悪化ルート根絶
    
    ★Q6.5 論理整合性追加(診断書 水準1-2):
      ・qualityReview.gs に独立チェックを新設
      ・「事実は正しいが論理が矛盾」パターンを検出
      ・Q6 と別観点で判定
    
    ★優先度付き修正プロンプト(診断書 水準1-3):
      ・Q6.5 > Q6 > Q5/Q7 > Q1/Q2/Q3 > Q4 の順にソート
      ・Q6.5/Q6 に★ラベル付与
    
    ★キャラクターシート末尾再注入廃止(水準2-2):
      ・promptBuilder.gs 末尾の再注入を核心3行に圧縮
      ・12セクション重複を解消
    
    ★finalFactVerify 過剰修正防止(水準2-3):
      ・時間軸を含む主張(週中高値・〜年以来・急落率)は errors に入れない
      ・スナップショットと「明確に論理的に矛盾」する場合のみ修正対象
    
    ★プロンプト重複削除(水準2-4 Phase 1 + 追加):
      ・【コンパナの口調】削除(キャラクターシートと重複)
      ・【TCの主な機能】【TC導線の入れ方】ヘッダ削除
      ・buildMarketTypePolicy_ 【最重要】ラベル 14→11箇所
      ・【経済イベントの日付確認】【未発表過去形禁止】を1セクションに統合
      ・MORNING/TOKYO/GOLDEN 役割セクションのヘッダ簡潔化
    
    ★ニュース取得 Claude切替(水準3):
      ・marketAnalysis.gs fetchMarketNews_ を Gemini → Claude web_search へ
      ・プロンプト強化: 「内部知識だけは禁止・3〜5回検索推奨」
      ・max_uses: 5
      ・ソース0件時はキャッシュ保存せず再取得試行
      ・CLAUDE_API_KEY ScriptProperties フォールバック
      ・実測: 50件のソース自動取得成功
    
    ★キャラクターシート改善:
      ・【共感】5セクションを1つに統合
      ・【軽さと勢い(感嘆符・行動促し・疑問形)】追加
      ・【禁止事項】に「具体エピソード詰め込み禁止」追加
  
  実測効果(朝→夕方):
    ・プロンプト文字数: 29,686 → 22,677 字 (-24%)
    ・セクション数: 92 → 68個 (-26%)
    ・Q6.5 論理矛盾検出率: 該当投稿で100%検出・修正成功
    ・finalFactVerify 過剰修正: ゼロ化
    ・ニュース鮮度: Gemini偽情報混入 → Claude実在ソース50件
    ・最終投稿品質: 論理一貫・事実正確・鮮度良好
  
  ファイル変更:
    main.gs: 死体コード(executePhaseBImageAndEmail等)削除 1,440→1,349行
    geminiApi.gs: DISABLE_FACTCHECK フラグ・finalFactVerify 過剰修正防止 +16行
    qualityReview.gs: Q6.5 追加・優先度付き修正 +54行
    promptBuilder.gs: 末尾重複削除・buildMarketTypePolicy整理 -11行
    marketAnalysis.gs: fetchMarketNews_ Claude切替 +14行
    setupDisableFactCheck.gs: 新規(ScriptProperties 設定補助) 257行
  
  関連ドキュメント:
    TCAX_REFERENCE.md v1.1(事件5として詳細記録)
    TCAX_投稿品質問題_診断書_v1_1(作業完了後アーカイブ)
    キャラクターシート修正指示_v1_0(スプレッドシート変更指示)


v12.9（2026-04-17 完成）= 設計書v12.9
  Q6確定データ強化 + GOLDEN夜の材料ヒント + SCHEDULE整合性修正
  
  背景: 2026-04-17 の運用で発覚した2件の事件を根本解決したセッション
    事件1: runMorning 22:11異常発火(config.gs配列不整合)
    事件2: Phase B Q6 RBA利下げ誤判定(Claude時系列バイアス)
  
  成果:
    ★Q6確定データ強化:
      ・qualityReview.gs で collectAnchorData_(postType) を呼び出し追加
      ・政策金利・通貨強弱・継続中重大事象を Q6 プロンプトに注入
      ・判定優先順位を明示(カレンダー > 確定データ > 本文 > Web > 内部知識)
      ・testQReviewRBA でRBA利上げサイクル判定の正答を確認
    
    ★GOLDEN夜の材料ヒント:
      ・promptBuilder.gs に buildEveningMaterialHint_ 新設(約130行)
      ・経済カレンダーから GOLDEN投稿(20-21時台)以降の材料を動的抽出
      ・重要度別分類(高=軽く触れる/中=目線述べる/要人発言=別枠)
      ・INDICATOR投稿との重複回避設計
      ・スプレッドシートC列の「今夜の材料」セクションと連動
    
    ★SCHEDULE整合性修正:
      ・config.gs の月〜金 times 配列から 22:XX(NYスロット) を削除
      ・types/times が全曜日で要素数一致(不整合解消)
      ・runMorning 異常発火の根本対策
      ・verifyScheduleIntegrity() で自動検証可能
    
    ★testFunctions.gs Lv2拡充:
      ・260行 → 656行 (+396行)
      ・追加15関数: verifyScheduleIntegrity / checkTriggers / 3シート読込 /
        testInteractiveVerifyUnit / testCollectAnchorData /
        testQReviewRBA/FOMC/OngoingEvents / testShowPhaseStatus / testPhaseBOnly
      ・testPro_NY削除(NY廃止のため)
    
    ★ドキュメント新設:
      ・TCAX_REFERENCE.md v1.0: 事件簿4件 + ベストプラクティス10項目
      ・Trading Complete REFERENCE.md とは別管理(システムが異なるため)

v12.8（2026-04-17 完成）= 設計書v12.8
  タスク5-a/b/c 完了 + 対話型検証 Step 4 初稼働 + Phase A→B→C 全モード稼働
  
  成果:
    ・タスク5-a: handleManualMode_ + Phase C トリガー有効化(+3行)
    ・タスク5-b: handleValidateMode_ 88行→38行簡素化
    ・タスク5-c: handleAutoMode_ 63行→40行簡素化
    ・3モードハンドラーが対称形に統一
    ・Phase A→B→C 非同期パイプラインが全モードで稼働可能に
  
  対話型検証(Step 4)の初稼働実績(2026-04-17 16:00):
    ・runMorning 本番フロー内で Phase B → Step 4 発火
    ・claim5件抽出(植田総裁発言/RBA利上げ/通貨ペア数値/指標予告等)
    ・Web検証: ❌0件 / ⚠️1件(発言引用のニュアンス) / ✅4件
    ・修正発動 → 後処理チェーン適用 → Gmail 承認メール到着
    ・所要時間: 38秒、Claude API 3回
    ・対話型検証ログシートに初回レコード VL_20260417_160034_4012
  
  副次的効果:
    ・全モードで下書き必ず作成 → 緊急中止ウィンドウ 約2分間
    ・事後分析用のスナップショット残存
    ・autoモードでも事故投稿を途中で止められる設計に

v12.7（計画中・2026-04-17〜）= 設計図v12.7
  Phase 3分割 + 未来日付ガード（完全自動運用への最終章）
  
  背景: 2026-04-16本番MORNINGでのハルシネーション事故
    ・投稿本文に「4/17のトランプ解任示唆」を「4/16昨夜の出来事」として混入
    ・ファクトチェック「全て正確」で通過。品質レビューは事実検出したが修正失敗
    ・Gemini Pro 503 → Claudeフォールバックで時間余裕が消失
    ・承認メールまで到達。人間が止めなければ誤情報が発信されていた
    ・autoモード運用中なら完全自動で誤情報が世界に出ていた
  
  根本原因:
    ・Phase A（1トリガー=6分）に検証と修正を全詰め。障害時に品質保証の余裕が消える
    ・未来日付検証の専用ロジックが存在しない
    ・autoモードで下書きが作られないため事故時の中止手段ゼロ
  
  解決策:
    ・Phase 3分割（A=生成 / B=整形 / C=投稿）で検証と修正を独立Phase化
    ・未来日付ガード（ニュース収集+投稿本文の2段ガード）
    ・全モードで下書き必須化（autoでも緊急中止可能に）
  
  設計思想:
    Write-Then-Reviewパターン: 生成と検証を別Phaseに分離
    完全自動でも下書きは残す: 事後分析と緊急中止手段を確保
    「確定データ > AI推論」をPhase分割でも維持
    API呼び出し回数は増加ゼロ（月額コスト±0円）
  
  関連ドキュメント:
    Phase 3分割+未来日付ガード要件定義書 v1.2
      セクション4.4: autoモードでも下書きが必ず作られる仕様
      セクション5.4: False Positive防止（未来予定文脈のホワイトリスト）
      セクション6: 影響範囲分析（approval.gs等の実コード検証）
      セクション8.4: ハートビート監視（システム沈黙検知）
      セクション12: 移行手順（下書きクリア→段階デプロイ）

v12.6.1（2026-04-16）コード品質改善（4項目）
  ・config.gs: CLAUDE_MODEL定数追加（ハードコード廃止）
  ・config.gs: ScriptProperties全24キー一覧コメント追加
  ・config.gs: POST_TYPESからhasImageフィールド廃止
  ・geminiApi.gs: サイレントcatch 9箇所にログ追加
  ・qualityReview.gs: Q6「全文再生成→2回目レビュー→パッチ」を「元投稿ベース事実修正」に変更（API 3回→1回）
  ・qualityReview.gs: サイレントcatch 5箇所にログ追加
  ・scheduler.gs: ログ表示をisImageGenerationType()参照に変更
  ・設計思想: 完全自動運用では「静かに劣化する」ことが最大のリスク
    手動承認モード（人間の目がセーフティネット）と完全自動モードは別物
    完全自動を目指すなら、ログなしcatchは禁止

v12.6（2026-04-15/16）= 設計図v12.6
  リグレッション防止 + 最終事実検証(JSON検出+コード置換) + TOKYO/LUNCHレート台変換
  ・testPostProcessor.gs新設: 後処理チェーン不変条件テスト40ケース
  ・config.gs: formatRate_関数+RATE_DECIMALS定数（toFixed散在をDRY化）
  ・postProcessor.gs: fixHallucinatedRates_を最近傍キーワード割り当て方式に書き換え（クロス汚染修正）
  ・postProcessor.gs: convertExactRatesToRange_新設（TOKYO/LUNCHレート→「台」変換。スペース区切り対応）
  ・qualityReview.gs/geminiApi.gs/factCheck.gs/promptBuilder.gs: toFixed→formatRate_置換（計48箇所）
  ・geminiApi.gs: finalFactVerify_新設（JSON検出+コード置換。Claudeは検出だけ、修正はコード）
    確定データ: レート+始値+通貨強弱+カレンダー+政策金利+要人
    correctフィールド汚染検出+wrong===correctスキップ+切れたJSON修復
    ★本番NY投稿で「円高→円安」を自動修正（効果実証済み）
  ・geminiApi.gs: TIME_LIMIT_SEC 240→300秒（Phase B分離済みで安全）
  ・promptBuilder.gs: TOKYO/LUNCHに「レートは台で表現」ルール追加
  ・main.gs: 🧪テストメニュー追加
  ・設計思想: Claudeは検出だけ、修正はコード。promptBuilder.gsは2,500行まで分割しない

v12.5（2026-04-14/15）= 設計図v12.5
  コード品質改善 + 品質レビュー大幅強化
  ・geminiApi.gs: callClaudeApi_共通関数統合。executeRetry_ Claude化
  ・factCheck.gs: 死コード削除（qualityCheckPost_ -138行）
  ・qualityReview.gs: 経済カレンダー注入。Q6全文再生成→2回目品質レビュー。口調一元管理
  ・config.gs: サマータイム自動調整（isSummerTime_）
  ・promptBuilder.gs: 口調末尾リマインダーにキャラクターシート動的再注入
  ・postProcessor.gs: 数値変化→改行修正+fixHallucinatedRates_正規表現拡張

v12.4（2026-04-14）= 設計図v12.4
  Claude主導アーキテクチャ + 確定データガード
  ・geminiApi.gs: 投稿生成をGemini→Claude化（callClaudeGenerate_新設）
  ・geminiApi.gs: qualityReviewPost_にrates, csData引数追加
  ・factCheck.gs: 確定データ6（通貨強弱）+ルール1c（方向チェック）追加
  ・factCheck.gs: autoFixPost_ Claude化 + 通貨強弱データ注入
  ・qualityReview.gs: Q7体言止め判定追加。修正ステップGemini→Claude化。確定データガード
  ・promptBuilder.gs: 体言止めルール（OK/NG例）+キャラクター口調リマインダー（最末尾）
  ・promptBuilder.gs: buildIndicatorPolicy_でINDICATOR対象指標をScriptPropertiesから読み取り注入
  ・scheduler.gs: INDICATOR_TARGETをScriptPropertiesに保存（対象指標の伝達）
  ・config.gs: 月曜MORNING 07:28→08:03（原油先物開場+1h確保）
  ・imageGenerator.gs: 時間表現を原文から変えないルール
  ・設計思想: 確定データ > AI推論。クロスチェックより正しいデータを持つことが重要

v12.2（2026-04-10/12）= 設計図v12.3
  4層安全網 + Claudeフォールバック + Web検索品質レビュー + ストーリー主導
  ・qualityReview.gs: Claude品質レビューにWeb検索追加（web_search_20250305, max_uses:3）
  ・qualityReview.gs: systemパラメータでJSON出力強制 + JSONフォールバックパーサー
  ・qualityReview.gs: max_tokens 2000→4096 + MORNING TYPE_DESCRIPTIONS更新
  ・qualityReview.gs: TOKYO/LUNCH TYPE_DESCRIPTIONS文字数 60-150→100-180
  ・geminiApi.gs: 503リトライ段階的待機 + MAX_RETRIES 3→2
  ・geminiApi.gs: factCheckSkippedフラグ + Pro→Claude自動フォールバック
  ・main.gs: validateモード復活 + ファクトチェック失敗時の強制manualブロック
  ・imageGenerator.gs: 文字サイズ3層階層（フック優先）
  ・approval.gs: Claudeフォールバック通知をメールに表示
  ・config.gs: TOKYO/LUNCH charMin/charMax 60-150→100-180
  ・scheduler.gs: INDICATOR maxIndicators 2→1
  ・promptBuilder.gs: 題材選定ルール→ストーリー主導に改訂
  ・promptBuilder.gs: 投稿の構造→因果チェーン中心に再構成
  ・promptBuilder.gs: 市場系投稿の方針→ストーリー主導の鉄則+まわりくどい説明禁止

v12.1（2026-04-07）= 設計図v12.2
  SH/SLダウ理論+WTI/天然ガス停止
  ・rateManager.gs: calcDowTheory_をSH/SL（前後4日）ベースに刷新+getDowTheorySummary_+backfillSwingHighLow
  ・config.gs: DAILY_RATE_COLS/WEEKLY_RATE_COLS列定義追加
  ・priceSummary.gs: SH/SL判定+週足シート作成（⑳番目）
  ・geminiApi.gs/promptBuilder.gs/factCheck.gs/qualityReview.gs: WTI/天然ガス注入停止
  ・learningManager.gs: 仮説例文SH/SL対応
  ・日次レート: 30→44列。週足シート新規。20シート構成

v12.0（2026-04-06）= 設計図v12.1
  3段階生成アーキテクチャ
  ・geminiApi.gs: Claude市場分析ステップ新設（analyzeMarketWithClaude_）
  ・geminiApi.gs/imageGenerator.gs: MAX_RETRIES定数化
  ・rateManager.gs: BTC/ゴールド事前取得+キャッシュ75分延長
  ・rateManager.gs: 通貨強弱シート自動更新（勢い5段階+★初動検出+3hトレンド+ダウ理論）
  ・rateManager.gs: バックフィル機能（日次レートから過去164日分を遡及計算）
  ・geminiApi.gs: Claude市場分析に通貨強弱トレンド+ダウ理論を注入
  ・priceSummary.gs: GAS上の中身相違を発覚・復旧。日次レートをAPI再取得（1,341日分）
  ・learningManager.gs: 仮説生成に通貨強弱トレンド+ダウ理論を材料注入。仮説検証にも同データを判定材料追加
  ・qualityReview.gs: Q6定性的主張チェック+Gemini削除禁止+TOKYO/LUNCH更新+ゴールド誤警報修正
  ・投稿プロンプトv5: TOKYO/LUNCH C列更新（速報ヘッドライン許可）
  ・設計思想: 各AIの得意分野に仕事を割り当てる

v11.0（2026-04-05）= 設計図v12.0
  3段防御アーキテクチャ+承認フロー修正
  ・geminiApi.gs: テキスト生成Grounding OFF（ハルシネーション防止）
  ・factCheck.gs: Layer 1に商品価格追加（WTI/BTC/ゴールド/天然ガス）
  ・qualityReview.gs: Q6事実検証+Q7絵文字行チェック追加（5→7項目）
  ・approval.gs: 投稿直前にスプレッドシート再読み込み（手動編集反映）
  ・imageGenerator.gs: 重複関数リネーム（saveImageToTempDrive_）
  ・キャラクターシート: 生活との接点の出し方（スケール感）追加
  ・設計思想: Grounding用途を「リサーチ」「検証」に限定

v10.0（2026-04-04）= 設計図v11.0
  v5プロンプト整理+役割分担明確化

v9.0（2026-04-02）= 設計図v10.0
  投稿軽量化+仮説精度向上+問いかけシステム

v8.0（2026-04-01）= 設計図v9.0
  アノマリー自動判定+品質修正安定化
```

---

## 12. ★NEW: 完成への道のり（2026-04-17 v12.8時点）

```
T-CAXは「完成の一歩手前」に到達した。
タスク5-a/b/c 完了 + 対話型検証 Step 4 初稼働成功により、達成度は98%に。
残る2%は、実運用データを取得しタスク18(factCheck削除)と19(Claude統一)を判断する工程。

【現在地(2026-04-17 v12.8)】
  ・機能実装: ✅ 全機能実装完了
  ・手動承認モード: ✅ 安定運用中 + Phase A→B→C 非同期パイプライン稼働確認
  ・validateモード: ✅ コード実装完了(実運用検証待ち)
  ・autoモード: ✅ コード実装完了・下書き必須化済み(実運用検証待ち)
  ・対話型検証(Step 4): ✅ 本番フロー内で初稼働成功(2026-04-17 16:00)
  ・対話型検証ログシート: ✅ データ蓄積開始(VL_20260417_160034_4012 が1行目)

【完成定義】
  「人間が毎回目視確認しなくても、誤情報を発信せずに月179投稿が安定稼働する」
  
  これを達成すれば:
    ・毎朝PCを起動して承認する作業が不要になる
    ・月約27,000円相当（9時間/月）の人間工数が解放される
    ・その時間をTC本業・新機能企画・休養に回せる
    ・T-CAXは「FX情報発信の無人プラットフォーム」として完成する

【v12.8 達成済み課題】
  ✅ 課題1: 未来日付混入のハルシネーション
      → v12.7 Phase 1 + 未来日付ガードログシート(㉓)で止血・監視
  
  ✅ 課題2: Phase A過負荷による障害時の品質崩壊
      → v12.7 Phase 2 で A/B/C 3分割完成。各Phase 3-4分枠で余裕
  
  ✅ 課題3: autoモードで下書きが作られず事故時の中止手段ゼロ
      → v12.8 タスク5-c で autoモードも下書き必須化
      → 緊急中止ウィンドウ 約2分間(Phase A完了〜Phase C実行)を確保

【残課題(v12.8→v13.0)】
  課題4: 対話型検証の実効果測定
    症状: 初稼働は成功したが、1件のみのデータでは効果判断不能
    解決: 1-2週間の実運用で ❌/⚠️/✅ 分布を取得 → タスク18の判断材料
  
  課題5: 既存3段検証との重複コスト
    症状: Phase A の3段検証 + Phase B の品質レビュー二重実行で Claude API 11-12回/投稿
    解決: タスク18で Phase A 内の検証層削除 → 対話型検証で置換

【v12.8 以降のロードマップ】
  M3(今ここ): 手動承認モード + 対話型検証ON で1-2週間運用
            → 対話型検証ログに100件超のデータ蓄積
            → プロンプト改善の根拠データを取得
  
  M4: タスク18 (factCheck削除 + Q6削除)
      → Phase A の検証層を対話型検証に一本化
      → Claude API 回数削減 → 月額約5,000円→3,000円見込み
  
  M5: タスク19 (Claude統一)
      → Gemini 503 全滅時のフォールバック削除
      → 生成パスをClaude一本化
  
  M6: validateモード切替
      → 1週間運用 → バリデーション通過率を測定
  
  M7: autoモード切替(完全自動運用開始)
      → 連続7日間179投稿 × 事故ゼロ → 完成宣言
      → 以降は月次レビュー(継続中重大事象シートの更新のみ必須)

【心構え】
  焦らない: v12.8 到達は早かったが、タスク18以降は実運用データ待ち。
           「動いたから次」ではなく「動いた証拠を集めてから次」が事故を防ぐ。
  
  実運用を軽視しない: 1投稿で Step 4 が成功したからといって、全投稿で動く保証はない。
                   平日6投稿 × 2週間 = 約85件のデータ蓄積で分布を見る。
  
  完成させる: v12.8まで来たシステムを、ここで中途半端にしない。
             残り約3時間の実装(タスク18+19)で、完全自動運用の無人プラットフォームとして完成する。
             焦る必要はない。でも確実に前に進む。
```

---

*更新日: 2026-04-17 | v12.9（Q6確定データ強化 + GOLDEN夜の材料ヒント + SCHEDULE整合性修正 + testFunctions.gs Lv2拡充 + TCAX_REFERENCE.md 新設）*
*更新日: 2026-04-17 | v12.8（タスク5-a/b/c 完了 + 対話型検証 Step 4 初稼働成功 + Phase A→B→C 全モード稼働）*
