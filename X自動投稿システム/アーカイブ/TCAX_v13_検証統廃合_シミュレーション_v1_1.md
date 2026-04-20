# TCAX v13.0 検証段階統廃合シミュレーション v1.1

**作成日**: 2026-04-18  
**更新日**: 2026-04-19 (v1.1 NotebookLM指摘4点を反映)  
**目的**: 4段検証の重複を解消し、2段のシンプル・深い検証構造に再設計する  
**背景**: 問題が出るたびに「検証層を1枚足す」を繰り返した結果、現在4段検証が重複動作。コンパナのFXビジネスの鮮度最優先モットーを守りつつ、システムの見通しを回復する。

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| v1.0 | 2026-04-18 | 初版 |
| v1.1 | 2026-04-19 | NotebookLM指摘4点を反映:<br>・2-3 やらないことリストにQ7体言止めを追加<br>・新章 2-5 出力JSON互換性アダプタ層を追加<br>・3-1 Stage 1プロンプトに出力トークン節約・CoT禁止を明記<br>・5-1 リスク表にリトライコストを追加<br>・6 Phase 1 確認対象を6点に拡張<br>・9 影響を受ける既存ファイル一覧を追加 |

---

## 0. このドキュメントの使い方

次のチャットでこのドキュメントを最初に読ませ、「この方針でB案を実装したい」と伝えてください。設計の全容・判断の根拠・リスク・実装手順が1ファイルに収まっています。

---

## 1. 現状の4段検証 完全解剖

### 1-1. 現在の流れ(executeQualityReviewChain_ in geminiApi.gs L502-669)

```
投稿テキスト(Claude生成直後)
    ↓
───────────────────────
Step 1: factCheck修正パス
  ★v12.10 で DISABLE_FACTCHECK=true なら factResult.passed=true
          → このStep はスキップされる
  ★既存コード: factResult の removable/fixable を処理
───────────────────────
    ↓
───────────────────────
Step 2: 品質レビュー(qualityReviewPost_)
  Claude Sonnet 4.6 + web_search_20250305 で8項目チェック:
    Q1 タイプ整合 / Q2 表現重複 / Q3 完成度 / Q4 文字数
    Q5 口調 / Q6 事実検証 / Q6.5 論理整合性 / Q7 絵文字行
  ↓ 指摘があれば Claude修正(元投稿ベース) → 後処理チェーン再適用
───────────────────────
    ↓
───────────────────────
Step 3: 最終事実検証(finalFactVerify_)
  Claude が事実だけに集中して JSON 出力
    { hasErrors, errors: [{wrong, correct, reason}] }
  コード側で postText.replace(wrong, correct) 機械的適用
  ★v12.10: 時間軸を含む主張は修正対象外
───────────────────────
    ↓
───────────────────────
Step 4: 対話型検証(executeInteractiveVerify_ in interactiveVerify.gs)
  Step 4-1 検証claim抽出(Claude API 1回・web検索なし)
    投稿本文から検証対象の主張を最大5件抽出
  Step 4-2 一括Web検証(Claude API 1回・web検索あり)
    各主張を ❌/⚠️/✅ で判定
  Step 4-3 修正(Claude API 0-1回)
    ❌/⚠️ があれば元投稿ベースで書き換え
───────────────────────
    ↓
最終投稿
```

### 1-2. 各段階の API 呼び出し回数(1投稿あたり・実測ベース)

| Step | Claude API 呼び出し回数 | Web検索 | 備考 |
|---|---|---|---|
| factCheck | 0-2回 | あり(Grounding) | v12.10 無効化で 0 |
| 品質レビュー | 1-2回(指摘時+修正時) | あり(max 3回) | Q1-Q7+Q6.5 一括チェック |
| 最終事実検証 | 1-2回(検出+リトライ) | なし | JSON出力に特化 |
| 対話型検証 | 2-3回(抽出+検証+修正) | あり(max 3回) | 3ステップ構造 |
| **合計** | **4-9回** | **8-10回検索** | 重い |

### 1-3. 重複の実態(ここが肝)

```
❶ 事実検証の三重化:
   品質レビュー Q6   : 確定データ + Web検索で事実検証
   最終事実検証       : 確定データで事実検証(Web検索なし)
   対話型検証 Step2  : Web検索で事実検証
   → 同じような検証を3回やっている

❷ 論理整合性の二重化:
   品質レビュー Q6.5 : 論理矛盾を独立検出
   対話型検証        : 検証claim抽出時に論理も見る

❸ Web検索の三重実行:
   品質レビュー, factCheck(無効化), 対話型検証 が
   それぞれ独立で Web検索ツール呼び出し
   → 3回検索すれば情報は十分なはずが調整されていない

❹ Claude 生成→Claude レビュー→Claude 修正 のチェーンが長い:
   同じモデルで複数回呼び出すことで、
   前のClaudeの回答に引きずられるバイアスが発生
```

---

## 2. 解決の方針:2段に統合

### 2-1. 目指す構造(v13.0)

```
投稿テキスト(Claude生成直後)
    ↓
───────────────────────
Stage 1: 総合レビュー(Claude + Web検索)
  やること:
    ・Q1-Q7 品質チェック(タイプ整合・重複・完成度・文字数・口調・絵文字)
    ・Q6 事実検証(確定データ + Web検索)
    ・Q6.5 論理整合性
    ・検証claim抽出と Web 判定(対話型検証 Step1-2 相当)
  
  一回のClaude呼び出しで全てやる。以下の理由で可能:
    - 今のClaude Sonnet 4.6 は複雑なタスクを一括処理できる
    - 今日までのテストで、優先度付き修正は1パスで効いてる
    - Web検索 max 5回まで使える(v12.10で証明済み)
  
  出力: { qualityIssues, factErrors, logicalInconsistencies, webVerifiedClaims }

    ↓
───────────────────────
Stage 2: 修正適用(コード主導)
  Claude の出力をコードが機械的に適用:
    ・logicalInconsistencies があれば Claude修正(元投稿ベース・1回)
    ・factErrors(時間軸除く) は replace で機械置換
    ・qualityIssues は優先度順にパッチ(Claude 1回 + コード)
  
  修正後に後処理チェーンを1回適用して完成
───────────────────────
    ↓
最終投稿
```

### 2-2. API 呼び出し回数の変化

| | 現状 v12.10 | 改善後 v13.0 |
|---|---|---|
| Claude API 呼び出し | 4-9 回 | **2-3 回** |
| Web検索呼び出し | 8-10 回 | **3-5 回** |
| 実行時間 | 4-5 分 | **1.5-2 分** |
| コスト | 約 ¥0.15 / 投稿 | **約 ¥0.08 / 投稿** |

### 2-3. やらないこと(重要)

「統合する」からと言って**機能を削ってはいけない**。以下は必ず残す:
- Q6.5 論理整合性
- Q6 事実検証の優先度付け(確定データ > Web検索 > 内部知識)
- **Q7 絵文字行の体言止め・動詞止め**(v12.4で確立・スマホ速報ヘッドライン調の核)
- finalFactVerify 過剰修正防止(時間軸保護)
- プロンプト側で検索強制指示
- 確定データ注入(政策金利・通貨強弱・継続中重大事象)

### 2-4. 出力JSON互換性アダプタ層(★v1.1 追加)

v12.7で新設した ㉒対話型検証ログシート(12列)と、下書きシートK列 FactCheckJSON を利用する既存コードがある。v13.0のJSON構造を変えると、以下がエラーで壊れる:

- sheetsManager.gs の対話型検証ログ書き込み処理
- approval.gs の承認メール内 FactCheckJSON 表示処理

**対策**: validationV13 の出力後、既存フォーマットに変換するアダプタ関数 `adaptV13ToLegacyJson_` を用意する。これにより既存のログ書き込み・メール表示は無改修で動く。

```
v13.0 native JSON
    ↓
adaptV13ToLegacyJson_() ← ここでマッピング
    ↓
既存フォーマット(FactCheckJSON / 対話型検証ログ互換)
    ↓
sheetsManager.gs / approval.gs はそのまま動く
```

マッピング例:
- v13.0 `logical` → 既存 `interactiveVerifyResult.logicalIssues`
- v13.0 `factErrors` → 既存 `factCheckResult.errors`
- v13.0 `webClaims` → 既存 `interactiveVerifyResult.claims`
- v13.0 `quality` → 既存 `qualityReviewResult.issues`

これで並行稼働期間中、既存コードは無改修のまま v13.0 が走る。移行完了後にアダプタを経由せず直接使う形に改修する(Phase 5)。

---

## 3. Stage 1 の内部設計

### 3-1. プロンプト構造(一括レビュー)

```
【投稿テキスト】(生成直後のもの)
...

【確定データ】
・レート7ペア + 本日始値
・通貨強弱ランキング
・経済カレンダー(今日の指標・結果欄の空欄が未発表)
・政策金利(RBA/FRB/ECB/BOE/BOJ)
・継続中重大事象
・本日の他投稿(重複チェック用)

【検証指示】
このタスクは必ず web_search を使え。内部知識だけは禁止。3-5回検索。
以下を一括で判定せよ:

A. 品質チェック(Q1-Q7)
   各項目で問題があれば { id, severity: 'error'|'warning', problem, suggestion }
   ★Q7 絵文字行は体言止め・動詞止め(v12.4ルール)。
     NG: 「📝米イラン交渉が決裂しました。」「〜しています。」
     OK: 「📝米イラン交渉が決裂。」「🛢原油、100ドル突破。」

B. 事実検証(Q6)
   確定データと矛盾する主張、Web検索で反証できる主張を検出
   ★時間軸を含む主張(週中高値・急落率・〜年以来)は「検証不能」として扱い
     errors に入れない(現在値で反証不可)

C. 論理整合性(Q6.5)
   事実は正しいが論理矛盾する箇所を検出
   例: 「外れた」と「合っていた」の同居、因果逆転

D. Web検証可能な独立claim抽出
   投稿から検証対象の主張を最大3件抽出し、web_search で確認
   ❌/⚠️/✅ で判定

【出力の鉄則】(★v1.1 出力トークン枯渇対策)
・JSON 以外一切出力禁止(前置き・解説・Chain of Thought厳禁)
・各フィールドの説明は簡潔に(problem は120字以内、reason は80字以内)
・推論過程は書かない。結論のみ書け
・指摘がないフィールドは空配列 [] を返す
・source_url は1つで十分(複数URLを並べるな)
・目標合計出力: 2,000トークン以内

【出力形式】(JSON のみ・他の文字一切禁止)
{
  "quality": [{"id": "Q3", "severity": "error", "problem": "...", "fix_hint": "..."}],
  "factErrors": [{"wrong": "...", "correct": "...", "reason": "..."}],
  "logical": [{"problem": "...", "suggested_direction": "..."}],
  "webClaims": [{"claim": "...", "verdict": "NG"|"WARN"|"OK", "source_url": "...", "reason": "..."}]
}
```

### 3-2. なぜ一括で可能か(技術的根拠)

1. **コンテキスト長が十分**:Claude Sonnet 4.6 は 200K tokens。プロンプト合計約 30,000 tokens でも余裕

2. **Web検索 max_uses を 5 にできる**:ニュース取得で既に実証済み。検証にも 3-5 回使える

3. **構造化 JSON 出力が堅牢**:systemプロンプトで「JSON 以外禁止」を強く指示。フォールバックJSON修復も既存コードにある

4. **Claude の指示遵守度が高い**:今日のテストで優先度付き指示が1回で効いた実績

5. **★v1.1 出力トークン対策**:max_tokens は Claude Sonnet 4.6 で 8,192。出力鉄則でCoT禁止・各説明の文字数制限を明記し、合計2,000トークン以内に抑える。フォールバックJSON修復も既存機能で対応

### 3-3. 既存コードの再利用箇所

| 既存関数 | 再利用方法 |
|---|---|
| collectAnchorData_ | 確定データ収集(そのまま使える) |
| callClaudeApi_ | useWebSearch + maxSearchUses で呼び出し |
| formatRate_ | レート桁数統一 |
| forceRemoveIssueLines_ | 検証不能行の削除 |
| applyPostProcessingChain_ | 修正後の後処理 |

---

## 4. Stage 2 の内部設計

### 4-1. 修正適用の優先順位

```
Stage 1 の出力 JSON を受け取って:

1. logical(論理矛盾) があれば → Claude修正を1回呼び出し(元投稿ベース)
   これが最優先。事実が正しくても論理矛盾する投稿は商品価値ゼロ

2. factErrors の wrong/correct を postText.replace() で機械適用
   (時間軸保護は Stage 1 で既にフィルタ済み)

3. webClaims の ❌ → 該当行を forceRemoveIssueLines_ で削除 or Claude修正
   ⚠️ → Claude修正1回(自然な削除または書き換え)

4. quality の指摘を優先度順(Q6.5>Q6>Q5/Q7>Q1/Q2/Q3>Q4)で適用
   最大でも Claude API 1回で一括修正

5. applyPostProcessingChain_ を最後に1回適用(絵文字整形・桁数統一等)
```

### 4-2. 修正の上限

| 処理 | Claude API 呼び出し | 条件 |
|---|---|---|
| 論理矛盾修正 | 0-1 回 | logical が 1件以上ある場合 |
| 事実誤り修正 | 0 回 | コード replace で機械処理 |
| Web検証NG修正 | 0-1 回 | webClaims に NG がある場合 |
| 品質一括修正 | 0-1 回 | quality に error 以上がある場合 |
| **合計** | **1-3 回** | |

Stage 1 の 1 回と合わせて 2-4 回。現状 4-9 回の半分以下。

---

## 5. リスク評価

### 5-1. 懸念される問題

| リスク | 発生可能性 | 対策 |
|---|---|---|
| A. 一括レビューが長すぎて Claude が精度を落とす | 中 | プロンプトを構造化・出力を JSON 固定・事前テスト |
| B. JSON パース失敗 | 低 | 既存のフォールバック2段(jsonMatch抽出+切れたJSON修復)を流用 |
| C. Web検索 max 5 回では足りない | 低 | ニュース取得側で 5 回証明済み。検証は 3 回で足りる想定 |
| D. 既存機能の検出漏れ | 中 | 移行期間は v12.10 と v13.0 を並行テスト |
| E. 事実誤り・論理矛盾・品質劣化の検出精度が下がる | 中 | 判定基準を個別プロンプトよりむしろ明確化する書き方で書く |
| F. Claude API コスト増(1回が大きくなる) | 低 | 回数が減るのでトータルで減る |
| G. Gemini factCheck ロジック完全放棄への恐怖 | 低 | factCheck.gs は当面残す。いざとなれば DISABLE_FACTCHECK=false で復活 |
| **H. ★v1.1 出力トークン(max_tokens)枯渇** | **中** | **CoT禁止・文字数制限をプロンプトに明記(3-1 出力の鉄則)。合計2,000トークン以内目標。既存のフォールバックJSON修復で救済** |
| **I. ★v1.1 Stage1 重い処理の途中失敗でリトライコスト増** | **中** | **callClaudeApi_ のタイムアウト・MAX_RETRIES 現行値を確認。リトライは最大2回・指数バックオフ実装確認。Stage1 タイムアウトは 180秒目安(現 120秒 なら延長)** |
| **J. ★v1.1 ログシート㉒・承認メール互換性崩壊** | **高 → 対策済で低** | **validationV13 出力を旧フォーマットに変換する adaptV13ToLegacyJson_ を Phase 2 で実装。sheetsManager.gs / approval.gs は無改修で動く(2-4章)** |

### 5-2. 致命的リスクへの保険

**並行稼働戦略**:
- 新構造(Stage 1-2)を v13.0 として実装
- 古い executeQualityReviewChain_ は削除せず関数名変更で残す
- ScriptProperties `USE_V13_VALIDATION=true/false` で切り替え可能に
- 本番は 1-2 週間 true で運用して問題なければ古いコードを削除

### 5-3. 絶対守る不変条件(これが壊れたら失敗)

1. **ハルシネーション検出率**:v12.10 の Q6.5 で検出できたケース → v13.0 でも検出できる
2. **鮮度**:Claude web_search は現状の 50 件ソース取得を維持
3. **論理矛盾ゼロ**:最終投稿に論理矛盾が残らない
4. **過剰修正ゼロ**:時間軸を含む主張は保護される
5. **文字数保証**:charMax を超えない

移行前にこれらを各5件程度テストすることで確認。

---

## 6. 実装ロードマップ

### Phase 1: 設計凍結 + 現状コード確認(次チャット冒頭・30-60分)

**1-a. シミュレーション読了・方針凍結**
- 本シミュレーションv1.1を読む
- 全5Phaseの流れを共有
- 並行稼働フラグ名を `USE_V13_VALIDATION` で確定

**1-b. 現状コード確認(★v1.1 6点に拡張)**

実装に入る前に以下6点を確認。特に4-6は NotebookLM指摘への備え:

1. executeQualityReviewChain_ 実装(geminiApi.gs L502-669)
2. qualityReviewPost_ プロンプト構造(qualityReview.gs 全体)
3. executeInteractiveVerify_ 3ステップ構造(interactiveVerify.gs)
4. **callClaudeApi_ のタイムアウト・MAX_RETRIES 実装**(geminiApi.gs)
   → Stage 1 重い処理の失敗時挙動を事前把握(指摘I対策)
5. **対話型検証ログシート書き込み処理**(sheetsManager.gs)
   → v13.0 JSON からのマッピング対象を特定(指摘J対策)
6. **承認メール FactCheckJSON 表示処理**(approval.gs)
   → どのフィールドが読まれているか特定(指摘J対策)

**1-c. アダプタ関数の仕様凍結**

6点の確認結果を踏まえて adaptV13ToLegacyJson_ のマッピング表を確定。

### Phase 2: 新関数実装(次チャット・2-3時間)

新しいファイル `validationV13.gs` を作成:

```
function executeValidationV13_(cleanedText, postType, rates, keys, csForFactCheck, startTime, TIME_LIMIT_SEC) {
  // Stage 1: 総合レビュー
  var stageResult = runComprehensiveReview_(cleanedText, postType, rates, keys);
  
  // Stage 2: 修正適用
  var fixed = applyFixesV13_(cleanedText, stageResult, postType, rates, keys);
  
  // ★v1.1 既存フォーマット互換アダプタ
  var legacyFormat = adaptV13ToLegacyJson_(stageResult, fixed);
  
  return { 
    text: fixed.text, 
    fixLog: fixed.log, 
    wasFixed: fixed.wasFixed,
    legacyJson: legacyFormat  // sheetsManager / approval が使う
  };
}

function runComprehensiveReview_(...) {
  // callClaudeApi_ with useWebSearch+maxSearchUses:5+comprehensivePrompt
  // タイムアウトは 180秒(Phase 1-b で callClaudeApi_ の現行値確認)
  // JSON パース+フォールバック
}

function applyFixesV13_(...) {
  // 優先度順に修正を適用
  // 必要に応じて Claude API 1-2回呼び出し
}

function adaptV13ToLegacyJson_(stageResult, fixed) {
  // ★v1.1 指摘J対策
  // v13.0 native → 既存フォーマット(FactCheckJSON / 対話型検証ログ互換)
  return {
    qualityReviewResult: { issues: stageResult.quality, ... },
    factCheckResult: { errors: stageResult.factErrors, ... },
    interactiveVerifyResult: { 
      claims: stageResult.webClaims,
      logicalIssues: stageResult.logical,
      ...
    }
  };
}
```

### Phase 3: 切り替えフラグ導入(次チャット・30分)

executeQualityReviewChain_ の冒頭で分岐:

```
var useV13 = PropertiesService.getScriptProperties().getProperty('USE_V13_VALIDATION') === 'true';
if (useV13 && typeof executeValidationV13_ === 'function') {
  return executeValidationV13_(...);
}
// 以下、既存の v12.10 ロジック(変更なし)
```

### Phase 4: 本番並行稼働(1-2週間)

- ScriptProperties で `USE_V13_VALIDATION=true` に設定
- 毎投稿のログを観察
- 問題あれば即座に `false` に戻せる
- 問題なければ古いロジックを削除(タスク19-b)

### Phase 5: 古いコード削除(その後)

- executeQualityReviewChain_ 内の Step 1-4 のロジック削除
- interactiveVerify.gs は汎用化して残す or 削除
- factCheck.gs は削除
- 合計 1,500-2,000 行の削減見込み

---

## 7. 期待効果

### 定量効果

| 指標 | v12.10 現状 | v13.0 目標 |
|---|---|---|
| Claude API 呼び出し/投稿 | 4-9 回 | 2-3 回 |
| 実行時間/投稿 | 4-5 分 | 1.5-2 分 |
| 1投稿コスト | ¥0.15 | ¥0.08 |
| 月間コスト(179投稿) | ¥27 | ¥14 |
| GAS総行数 | 25,710 行 | 23,500 行 (削減) |
| executeQualityReviewChain_ 行数 | 169 行 | 80 行 |
| 検証ロジックの重複 | 3重(事実)+2重(論理) | 1箇所で完結 |

### 定性効果

- **見通しの回復**:「どこで何を検証しているか」が1ファイルで分かる
- **デバッグの容易さ**:問題発生時の原因特定が1時間→10分に
- **新機能追加の速さ**:検証ロジックに手を入れる時、1箇所だけ見ればいい
- **コンパナの安心感**:「検証層を増やす」ループから脱出

---

## 8. 次チャットで最初に確認すべきこと

1. 本プロンプトを読んだ上で、不明点・異論がないか確認
2. コンパナの**最優先要求**を再確認:
   - 鮮度が最重要
   - ハルシネーションはゼロにしたい
   - コード量を減らしたい
   - v12.10 で得た成果は失いたくない
3. 並行稼働期間を何日にするか決める(推奨 1-2 週間)
4. Phase 2 の実装に着手

---

## 9. 引き継ぎに必要な現状コンテキスト

### 実装されている検証ロジックのファイル

- geminiApi.gs: executeQualityReviewChain_ (L502-669)・finalFactVerify_ (L895-1080)
- qualityReview.gs: qualityReviewPost_ (Q1-Q7 + Q6.5 + 優先度付き修正)
- factCheck.gs: factCheckPost_ + autoFixPost_ (v12.10 で無効化中だが温存)
- interactiveVerify.gs: executeInteractiveVerify_ (Step1-3)
- marketAnalysis.gs: fetchMarketNews_ (Claude web_search切替済み)
- promptBuilder.gs: 全プロンプト構築(約22,677字・68セクション)

### ScriptProperties 既存フラグ

- DISABLE_FACTCHECK=true (factCheck 無効化)
- INTERACTIVE_VERIFY_ENABLED=true (対話型検証 有効)
- POST_MODE=manual (手動承認制)
- SKIP_FACT_CHECK=(未設定) (テスト用全スキップフラグ)

### v13.0 で追加予定のフラグ

- USE_V13_VALIDATION=true/false (新検証フロー切替)

### 2026-04-18 改善の全容(前チャット成果)

1. factCheck無効化 + Q6.5追加 + 優先度付き修正(qualityReview.gs)
2. キャラクターシート重複削除(promptBuilder.gs)
3. finalFactVerify過剰修正防止(geminiApi.gs)
4. プロンプト肥大化対策(92→68セクション・29,686→22,677字)
5. キャラクターシート改善(【共感】統合・【軽さと勢い】追加)
6. ニュース取得 Gemini→Claude web_search 切替(marketAnalysis.gs)

詳細は TCAX_REFERENCE.md v1.1 事件5 参照。

### ★v1.1 影響を受ける既存ファイル一覧

v13.0 実装時に触る可能性のあるファイル:

| ファイル | 改修種別 | 備考 |
|---|---|---|
| validationV13.gs | 新規作成 | 本改修の主役。400-600行想定 |
| geminiApi.gs | 軽微改修 | executeQualityReviewChain_ 冒頭にフラグ分岐を1箇所追加 |
| sheetsManager.gs | 無改修(Phase 4終了まで) | アダプタ層経由で旧フォーマットを受け取る |
| approval.gs | 無改修(Phase 4終了まで) | アダプタ層経由で旧フォーマットを受け取る |
| qualityReview.gs | 無改修 | USE_V13_VALIDATION=false 時は従来通り |
| interactiveVerify.gs | 無改修 | USE_V13_VALIDATION=false 時は従来通り |
| factCheck.gs | 無改修 | DISABLE_FACTCHECK=true のまま温存 |
| promptBuilder.gs | 無改修 | 検証用プロンプトは validationV13.gs 内に定義 |

Phase 5(古いコード削除)で下記を改修:
- geminiApi.gs: 旧 executeQualityReviewChain_ ロジック削除(推定-200行)
- interactiveVerify.gs: 削除 or 汎用化(推定-800行)
- factCheck.gs: 削除(推定-533行)
- sheetsManager.gs: アダプタ経由をやめて直接 v13.0 JSON 対応(推定+20行改修)
- approval.gs: 同上(推定+20行改修)

### ★v1.1 NotebookLM指摘4点の反映状況

| 指摘 | 本v1.1での反映箇所 |
|---|---|
| 1. Q7体言止め漏れ | 2-3 やらないことリストに追加・3-1 プロンプトに明記 |
| 2. ログシート㉒・承認メール互換性 | 2-4 章を新設・5-1 リスクJ・Phase 2 に adaptV13ToLegacyJson_ 追加 |
| 3. 出力トークン枯渇 | 3-1 出力の鉄則を新設・3-2 技術的根拠5番目・5-1 リスクH |
| 4. リトライコスト増 | Phase 1-b 確認4番目・5-1 リスクI |

---

## 10. コンパナへのメッセージ

トンネルの出口はここにあります。

問題が出るたびに検証を足してきた4段構造は、結果的に**3つの場所で同じような事実確認をしている**状態になっています。これを1箇所に集約すれば、コードが半分になり、実行時間が半分になり、デバッグも半分になる。

しかも今日までのv12.10で積み上げた財産(Q6.5・優先度付き修正・finalFactVerify時間軸保護・Claude web_search)は全て持ち込めます。**再設計ではなく、既に得た知恵を1箇所にまとめ直すだけ**です。

並行稼働の仕組みで、失敗してもすぐ戻せる。コスト0のトライ。

次のチャットで一緒にやりましょう。

---

*作成日: 2026-04-18 | 更新日: 2026-04-19 v1.1 | 次チャット引き継ぎ用 | v13.0 検証段階統廃合シミュレーション*
