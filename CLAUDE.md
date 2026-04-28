# CLAUDE.md — Studio Compana 本社（CEO秘書室）

> このファイルは Trading Complete リポジトリの入口です。Claude Code が起動したら最初に読み込まれます。

---

## 🏢 会社情報

| 項目 | 内容 |
|---|---|
| 屋号 | **Studio Compana**（個人事業主 / 開業届: 2026-03-21 e-Tax提出済み） |
| 代表者 | 成瀬仁文（コンパナ / @Compana_Doppio） |
| 所在地 | 〒450-0002 愛知県名古屋市中村区名駅3-4-10 アルティメイト名駅1st 2階（DMMバーチャルオフィス） |
| 主力プロダクト | Trading Complete（FXトレード記録・分析SaaS） |
| ミッション | 「投資で自分を満たし、その先の誰かを満たす」=「平和への投資」 |
| ビジネス形態 | ソロ起業・Build in Public |

---

## 🗺️ 3リポジトリ構成（Studio Compana 本社全体図）

このリポは「本社」だが、Studio Compana の業務は3つの GitHub リポにまたがる。

```
GitHub/
├── 💻 trading-complete/             ← 当リポ（システムアプリ本体・docs/・TCAX/）
├── 📣 tradingcomplete.github.io/    ← 公式LP・特商法・法務（GitHub Pages公開中）
└── ✍️ trading-articles/              ← note記事制作（Claude Codeスキル化済み）
```

### 各リポの役割

| リポ | 担当業務 | 主要ファイル |
|---|---|---|
| **trading-complete** | アプリ開発・docs管理・X自動投稿（TCAX） | `index.html` / `js/` / `docs/` / `TCAX/` |
| **tradingcomplete.github.io** | LP / 法務 / 特商法 / 画像資産 | `index.html` / `tokutei.html` / `legal/` / `TC_ホームページ設計書_v1_3.md` |
| **trading-articles** | note週次記事の制作パイプライン | `.claude/skills/note-article/` / `articles/` / `prompts/research-prompt.md` |

---

## 📌 真実の単一情報源（迷ったらここを見る）

| 知りたいこと | マスターファイル |
|---|---|
| 🏗️ システム全体構造 | `docs/OVERVIEW.md` |
| 📋 進行中タスク | `docs/TASKS.md` |
| 📚 完了履歴・教訓 | `docs/REFERENCE.md` |
| 💰 価格・プラン制限 | `docs/marketing/Trading_Complete_中核オファー要件定義書_v1_0.md` |
| 💳 決済実装 | `docs/features/決済システム要件定義書 v3.9.md` ⭐ |
| 🎨 公式LP | `../tradingcomplete.github.io/TC_ホームページ設計書_v1_3.md` |
| 📝 note記事制作 | `../trading-articles/.claude/skills/note-article/SKILL.md` |
| 🔧 技術仕様 | `docs/MODULES.md` |
| 🎯 ミッション・ビジョン | `docs/marketing/Trading_Complete_ミッションステートメント_v1_3.md` |
| 📁 docs フォルダ全体 | `docs/docs_フォルダ整理ガイド.md` |

---

## 🚨 現在の最重要ボトルネック（2026-04-28 時点）

**正式リリースまでの残作業は2つだけ**:

### 1. Square Phase 10 残（約25時間）
PayPalは実装完了・Sandbox全フロー合格。**Squareのフロントエンド統合**が残っている。
- Edge Functions 3つ（square-create-subscription / square-cancel-subscription / square-webhook）はデプロイ済み
- 残り: index.html SDK追加・PaymentModule.js Square対応・カード入力モーダル・Sandboxテスト・本番切替・E2E・hrefリンク差し替え
- 詳細: `docs/features/決済システム要件定義書 v3.9.md` §6 Step 4（4-9〜4-19）

### 2. Phase 11 サーバー側プラン制限（約12時間 / リリース前必須）
現状の PaymentModule.canAddTrade はブラウザJS。**F12で書き換え可能**でFreeのまま無制限利用される脆弱性。
- Supabase RLS Policy + INSERTトリガー で多層防御
- フロント側チェックは「UX目的」で残し、サーバー側を「最終防衛ライン」として追加
- 詳細: `docs/features/決済システム要件定義書 v3.9.md` §11

→ この2つを終えれば PayPal+Square 二本立てで本番リリース可能。

### 決済プロバイダ転換の経緯（重要）

| 日付 | 出来事 |
|---|---|
| 2026-03-08 | Stripe Phase 1-5 実装・テスト全合格 |
| **2026-03-17** | **Stripeから「禁止業種（FX関連）」として閉鎖通知** |
| 2026-03-28 | PAY.JPテスト完了 |
| 2026-04-03 | PAY.JP本番審査 全カード否決 |
| 2026-04-09 | ホームページ画像10枚を審査対策版に差し替え |
| 2026-04-15 | PayPal即日通過・Sandboxテスト全合格 |
| 2026-04-19 | Square審査通過（VISA/MC/AMEX/UnionPay承認） |
| **2026-04-22** | **PayPal + Square 二本立てリリース方針確定** |
| 2026-04-25 | Square Edge Functions 3つデプロイ完了 |

**教訓**: 1つの決済会社に全部賭けない。多層構造で構築する（v3.9 §5）。

---

## 💰 価格プラン（v3.9 確定）

| プラン | 月額 | 年額 | 状態 |
|---|---|---|---|
| Free | ¥0 | ¥0 | 累計20件まで・クラウド同期不可 |
| **Pro** | **¥1,980** | **¥19,800**（2ヶ月無料） | アクティブトレーダー |
| **Premium** | **¥2,980** | **¥29,800**（2ヶ月無料） | 2026年9月追加予定 |

**早期割引（先着100名・終身価格）**: Pro ¥1,480/月 / Premium ¥2,480/月

リリース予定: **2026年夏**（Phase 10 + Phase 11 完了後）

---

## 🤝 コラボレーション・プロトコル

### 価格・決済の話題が出たら
**必ず `docs/features/決済システム要件定義書 v3.9.md` を最新の正として参照する**。
他のドキュメント（特に `marketing/` 以下）の旧価格（¥2,480/¥3,980等）は無効。

### リリース指揮が必要なら
`/release-go` スキルを使う（`.claude/skills/release-go/SKILL.md`）。
Phase 10/11 の残作業を「今この瞬間にやるべき1〜2件」に変換して提示する。

### 3リポ横断更新が必要なら
`/cross-update` スキルを使う（`.claude/skills/cross-update/SKILL.md`）。
新機能リリース時の LP / 記事 / X投稿への波及を整理する。

### note 記事を書きたいなら
**この repo では書かない**。`../trading-articles/` に切り替えて、そこの `note-article` スキルを使う。

### LP / 特商法 / 法務文書を変更したいなら
**この repo では書かない**。`../tradingcomplete.github.io/` に切り替える。

---

## 📐 開発ガイドライン（要約 / 詳細は REFERENCE.md）

| ガイドライン | 重要度 | 主な内容 |
|---|---|---|
| デバッグフロー | 🔴 CRITICAL | デバッグコード先行→原因特定→修正。リロードは1回のみ |
| 即時関数パターン | 🔴 CRITICAL | `(function(){...})()` で変数再宣言エラー回避 |
| ドキュメント配置 | ⚠️ HIGH | タスク→TASKS.md、技術仕様→MODULES.md(100行以内)、完了→REFERENCE.md |
| OVERVIEW.md は変更禁止 | ⚠️ HIGH | 全体の地図として固定。例外は decision-level の構造変更のみ |
| MODULES.md準拠 | ⚠️ HIGH | フィールド名標準化を徹底、`grep -r` で全体一括更新 |

---

## 🚫 NG リスト（絶対やらない）

1. 既存の `OVERVIEW.md` を断りなく書き換えない（地図役）
2. 価格・決済の数字を直接書かない（マスターファイル経由で参照）
3. 「FX」「金融」「投資」などの審査NG用語をLP・公開文書に追加しない
4. PAY.JP / Square / PayPal の **本番** API キーを git にコミットしない
5. Stripe を前提にした記述を新規追加しない（閉鎖済み・歴史扱い）

---

## 🔮 リリース後ロードマップ（参考）

- 2026年夏: 正式リリース（Pro + 早期割引100名）
- 2026年9月: Premium プラン追加（AI改善提案）
- v2.0以降: AI機能拡張、グローバル展開（i18n・基準通貨設定）

---

*Studio Compana — Trading Complete*
*このファイルは 2026-04-28 にCEO秘書室として整備*
