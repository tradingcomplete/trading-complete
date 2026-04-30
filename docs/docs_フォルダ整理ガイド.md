# Trading Complete docs フォルダ整理ガイド

**最終更新**: 2026-04-30（v3.1・Claude活用プロンプト集 追加）
**運営**: Studio Compana (屋号 / 個人事業主) — 代表: 成瀬仁文(コンパナ)
**目的**: docsフォルダの「正」を1ファイルで明示する。価格・決済・技術の3つのマスターを混乱させない。

---

## 🎯 真実の単一情報源（Single Source of Truth）

迷ったらここを見る。**他のドキュメントは時代遅れの可能性あり**。

| 何を知りたいか | マスターファイル |
|---|---|
| 🏛️ Studio Compana 経営全体 | `docs/business/Studio_Compana_運営要件定義書.md` |
| 🏗️ システム全体構造 | `docs/OVERVIEW.md` |
| 📋 進行中のタスク | `docs/TASKS.md` |
| 📚 完了履歴・教訓 | `docs/REFERENCE.md` |
| 💰 価格・プラン制限 | `docs/marketing/Trading_Complete_中核オファー要件定義書_v1_0.md` |
| 💳 決済実装・Phase | `docs/features/決済システム要件定義書_v3_10.md` |
| 📣 マーケ実行戦略 | `docs/marketing/Trading_Complete_マーケティング戦略.md` |
| 🎨 ホームページ | `tradingcomplete.github.io/TC_ホームページ設計書_v1_3.md`（別リポ） |
| 📝 note記事制作 | `trading-articles/.claude/skills/note-article/SKILL.md`（別リポ） |
| 🔧 技術仕様 | `docs/MODULES.md` |
| 🎯 ミッション・ビジョン | `docs/marketing/Trading_Complete_ミッションステートメント_v1_3.md` |
| 🤖 Claude活用プロンプト集 | `docs/Claude活用プロンプト集.md`（A〜F カテゴリ別 30本のテンプレ） |

---

## 📁 フォルダ構造（実態 / 2026-04-28）

```
docs/
├── 📄 MODULES.md            技術仕様・モジュール構成
├── 📄 OVERVIEW.md           全体構造図（変更禁止・地図役）
├── 📄 REFERENCE.md          完了履歴・教訓集
├── 📄 TASKS.md              タスク管理（Square Phase 10 本番切替）
├── 📄 Claude活用プロンプト集.md  🆕 A〜F カテゴリ別 30本のClaudeテンプレ集
├── 📄 フォーム制御.md         フォーム関連の挙動ガイド
├── 📄 機能一覧.md            UI 解説
├── 📄 docs_フォルダ整理ガイド.md     本ファイル
│
├── 📂 business/             🆕 経営文書（Studio Compana全社運営）
│   └── Studio_Compana_運営要件定義書.md  ← 経営レイヤーのSoT（v0.1骨子）
│
├── 📂 features/             機能別要件定義書
│   ├── ⭐ 決済システム要件定義書_v3_10.md  ← 決済の正
│   ├── TC_Premium_AI機能_要件定義書_v1_2.md
│   ├── トレード分析強化_要件定義書_v1_16_最終版.md
│   ├── 利益率機能_要件定義書_完全版_v2_1.md
│   ├── 設定タブ改善_要件定義書_v3_0.md
│   ├── 相場ノート機能改善_要件定義書_v2_0.md
│   ├── 月次カレンダー機能_要件定義書_v2_0.md
│   ├── セキュリティ要件定義書_v1_5.md
│   └── 他、機能別仕様書
│
├── 📂 marketing/            マーケティング・戦略
│   ├── ⭐ Trading_Complete_マーケティング戦略.md          ← 実行マスター（旧3本を統合）
│   ├── ⭐ Trading_Complete_中核オファー要件定義書_v1_0.md  ← 価格の正
│   ├── ⭐ Trading_Complete_ミッションステートメント_v1_3.md  ブランドの軸
│   ├── ⭐ Trading_Complete_ビジョン_ソロ起業の実践.md       思想の軸
│   ├── 📋 補助資料（深掘り用・残置）
│   │   ├── CompanaTrading開発物語_マーケティング.md         Build in Public素材
│   │   ├── コンパナがリスペクトするFX_YouTuber_v2.md        競合学習
│   │   ├── TC_広告戦略_要件定義書_v1_1.md                   広告施策の深掘り
│   │   ├── TC_競合分析レポート.md                           競合理解（バナー注記済）
│   │   └── Trading Complete構造的位置づけ検証.md            市場分析・リスク（注記済）
│
├── 📂 note/                 note記事関連
│   ├── note記事_ライティングスタイルガイド.md
│   └── noteでバズる記事の法則.md
│
├── 📂 supabase/             クラウド関連
│   ├── Supabase_テーブル構造.md
│   └── Supabase導入_ロードマップ_v3_0_完成版.md
│
├── 📂 ai-tools/             AI・自動投稿関連
│   ├── NotebookLM_ソース管理.md
│   └── docs_フォルダ整理ガイド_v2.md  ⚠️ 削除予定（本ファイルとの重複）
│
└── 📂 archive/              旧バージョン・廃止
    ├── PAY_JP_決済システム_要件定義書_v2_0.md（v3.10へ統合・PAY.JP否決）
    ├── Trading_Complete_マーケティング戦略50選.md（マーケティング戦略.mdに統合）
    ├── Trading_Complete_マーケティング戦略_2025-2027_v2_0.md（マーケティング戦略.mdに統合）
    ├── Trading_Complete_最終収益モデル戦略_v2_0.md（マーケティング戦略.mdに統合・旧価格）
    ├── Trading_Complete_最終収益モデル戦略_v1_0.md
    ├── Trading_Complete_ミッションステートメント_v1_2.md
    ├── Trading_Complete_マーケティング戦略_2025-2027_v1_旧価格版.md
    ├── トレード分析強化_要件定義書_ロードマップ_v1_8.md
    ├── セッション分析機能_要件定義書.md
    └── コンパナがリスペクトするFX_YouTuber_v1.md
```

**関連リポジトリ**（同じGitHubフォルダ配下）:
- `../tradingcomplete.github.io/` — 公式LP・特商法・法務
- `../trading-articles/` — note記事制作（Claude Codeスキル化済み）

---

## 💰 価格・プラン制限の運用ルール

### ⭐ 真実の単一情報源（Single Source of Truth）

具体的な金額・制限値を**直接書いていい**ファイルは以下の2つだけ：

| マスターファイル | 役割 |
|---|---|
| `marketing/Trading_Complete_中核オファー要件定義書_v1_0.md` | プラン内容・価格・機能制限の最終定義 |
| `features/決済システム要件定義書_v3_10.md` | 決済実装上の価格・プランID・Edge Function仕様 |

### 他のドキュメントの書き方

> ❌ NG: 「Pro: ¥1,980/月」を直接記載
> ✅ OK: 「中核オファー要件定義書を参照」と参照リンクを書く

価格は変更されうる。**1ファイルだけ修正すれば全体に反映される状態**を保つ。

### 価格を変更する時の手順

1. `決済システム要件定義書_v3_10` で実装価格を更新
2. `中核オファー要件定義書 v1_0` でマーケ価格を更新
3. 他ドキュメントは「参照」のみなので連動して正しくなる
4. ホームページ（別リポ）の表記を更新

---

## 📦 アーカイブ運用ルール

**移動条件**:
- 後続バージョン（v2 → v3 等）が登場し、古いバージョンが参照不要になった場合
- 戦略の前提が崩れた場合（例: PAY_JP は申請否決のため archive 行き）

**残し方**:
- 削除はしない。`archive/` に移動して保管
- 必要に応じて当時のバナー注記を冒頭に追加
- ファイル名は変えない（履歴追跡のため）

---

## 🔁 直近の重要な変更履歴（2026-04-28 v3.0 改訂）

| 変更 | 理由 |
|---|---|
| Stripe決済要件定義書を「価格マスター」から外す | Stripe閉鎖により無効化、`決済システム要件定義書_v3_10` が新マスター |
| 中核オファー要件定義書 価格を ¥1,980/¥2,980 に更新 | v3.10 多層決済戦略に整合 |
| TASKS.md / OVERVIEW.md / REFERENCE.md の Stripe 記述を整理 | PayPal+Square 二本立てのリリース方針を反映 |
| 旧マーケドキュメントに「陳腐化バナー」を追加 | 修正コストを抑えつつ読み手が判断できる状態に |
| `PAY_JP_決済システム_要件定義書_v2_0.md` を archive へ | PAY.JP否決により役目終了 |
| `ai-tools/docs_フォルダ整理ガイド_v2.md` を削除（重複） | 本ファイルが正 |
| `PAY.JP_APIキーの情報.txt` を .gitignore + git untrack | テストキーであっても git に置かない |
| `Trading_Complete_マーケティング戦略.md` を新規作成（実行マスター） | 50選・3年計画・収益モデルの3本から「今やる」エッセンスを統合・1人リソースで回せる施策に絞り込み |
| 旧マーケ戦略3本（50選・2025-2027 v2_0・最終収益モデル v2_0）を archive へ | 新マスターに統合済み・参考のみで保管 |

---

## 📋 NotebookLM ソース管理

NotebookLM にアップロードする推奨ソースは `docs/ai-tools/NotebookLM_ソース管理.md` を参照。
本フォルダの構造変更時は、NotebookLMソース一覧も併せて更新する。

---

## ⚙️ シンプル管理の原則

1. **マスターは2つだけ**: 中核オファー要件定義書 + 決済システム要件定義書_v3_10
2. **既存を上書き**: 新バージョン .md を量産しない（archive 行きが必要なときだけ archive へ）
3. **バナーで警告**: 古い情報を残す場合は冒頭に「⚠️ 注記」を入れて読み手が判断できる状態にする
4. **真実は OVERVIEW / TASKS / REFERENCE**: 迷ったらこの3つに戻る

---

*Trading Complete - すべてのトレードを、この一つで*
*Studio Compana (屋号) - 2026-04-28 / v3.0*
