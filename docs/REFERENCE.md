# REFERENCE.md - Trading Complete 参考資料・運用ガイド
*更新日: 2026-01-15 | 用途: 開発ガイドライン・完了履歴・ベストプラクティス*

---

## 📑 目次

### Part I: [開発ガイドライン](#part-i-開発ガイドライン)
- [HTMLテンプレート関数の移行手順](#htmlテンプレート関数の移行手順100行以上)
- [効率的なデバッグフロー標準化](#効率的なデバッグフロー標準化critical)
- [修正指示はダウンロード形式で提供](#修正指示はダウンロード形式で提供critical)
- [別チャット管理とトークン節約戦略](#別チャット管理とトークン節約戦略critical)
- [即時関数パターン](#即時関数パターンによるデバッグ効率化critical)
- [モジュール化における置換作業](#モジュール化における置換作業の判断)
- [UIデザインガイドライン](#uiデザインガイドライン)
- [ドキュメント配置ルール](#ドキュメント配置ルール)
- [制御構造調査フロー](#制御構造調査フロー)
- [フォーム制御](#フォーム制御エラー対処事例)

### Part II: [完了履歴](#part-ii-完了履歴)
- [完了タスク一覧表(2025年11-12月)](#2025年11-12月)
- [完了タスク詳細](#完了タスク詳細)

### Part III: [主要完了タスク一覧(2025年)](#part-iii-主要完了タスク一覧2025年)

### Part IV: [プロジェクト完了アーカイブ](#part-iv-プロジェクト完了アーカイブ)

### Part V: [ベストプラクティス集](#part-v-ベストプラクティス集)
- [設計面](#設計面) | [デバッグ面](#デバッグ面) | [テスト面](#テスト面)
- [UI/UX面](#uiux面) | [運用面](#運用面) | [開発プロセス面](#開発プロセス面)
- [開発の教訓(教訓1-14)](#開発の教訓)

### Part VI: [よくある問題と解決策](#part-vi-よくある問題と解決策)

### Part VII: [参考情報](#part-vii-参考情報)

### Part VIII: [未解決の問題](#part-viii-未解決の問題)

---

## 📖 このドキュメントについて

TASKS.mdから分離した参考資料の簡素版。完了タスク・教訓・ガイドラインを集約。

---

## 🚨 Part I: 開発ガイドライン

### クイックリファレンス

| ガイドライン | 適用場面 | 重要度 | 主な内容 |
|------------|---------|--------|---------|
| [HTMLテンプレート移行](#html-detail) | 100行以上の関数移行時 | ⚠️ HIGH | 元コード一字一句コピー、書き直さない |
| [デバッグフロー](#debug-detail) | すべてのバグ修正 | 🔴 CRITICAL | 15分で完了、3段階デバッグ |
| [修正指示DL形式](#instruction-detail) | すべての修正指示 | 🔴 CRITICAL | .txtファイルで提供、トークン節約 |
| [別チャット管理](#chat-token-detail) | すべてのファイル修正 | 🔴 CRITICAL | 小修正は指示のみ、最大25倍節約 |
| [即時関数パターン](#iife-detail) | すべてのデバッグ | 🔴 CRITICAL | 変数再宣言エラー回避 |
| [モジュール化判断](#module-detail) | モジュール化作業時 | ⚠️ MEDIUM | 置換必要性の判断基準 |
| [UIデザイン](#ui-detail) | 新規UI作成時 | ⚠️ MEDIUM | カード型、グラデーション |
| [ドキュメント配置](#ドキュメント配置ルール) | 情報追加時 | ⚠️ HIGH | MODULES.md vs docs/ の使い分け |
| [制御構造調査](#制御構造調査フロー) | 制御構造の理解時 | ⚠️ HIGH | 4ステップフロー、デバッグパターン |
| [フォーム制御](#form-control-detail) | フォーム関連エラー対処時 | ⚠️ HIGH | エラー事例・データフロー |

---

<details id="html-detail">
<summary><strong>📋 HTMLテンプレート関数の移行手順(100行以上)</strong></summary>

**チェックリスト:**
```
作業前: □ script.jsから元コード入手 □ 行数確認
実装時: □ 一字一句コピー □ window.追加
動作確認: □ スクリーンショット比較 □ レイアウト一致
```

**失敗例:** displayReport移行 → レイアウト崩れ  
**原因:** 自分で書き直した  
**詳細:** MODULES.md参照
</details>

<details id="debug-detail">
<summary><strong>🔍 効率的なデバッグフロー標準化(15分完了)</strong></summary>

**フロー:**
```
Step 1: リロード確認(1回のみ)
Step 2: 3段階デバッグ(データ層→DOM→手動更新)
Step 3: 原因特定→修正
Step 4: 動作確認
```

**テンプレート:**
```javascript
// Phase 1: データ層確認
window.eventBus.on('statistics:updated', (data) => {
    console.log('データ:', data);
});

// Phase 2: DOM確認
document.getElementById('xxx') // 存在確認

// Phase 3: 手動更新
document.getElementById('xxx').textContent = 'テスト';
```

**DO:** ✅ デバッグコード先行 ✅ リロード1回のみ  
**DON'T:** ❌ リロード繰り返し ❌ 推測で修正
</details>

<details id="instruction-detail">
<summary><strong>📁 修正指示はダウンロード形式で提供</strong></summary>

**ルール:**
- ✅ .txtファイルで提供
- ✅ computer://リンク
- ✅ ファイル命名: `修正指示_[ファイル名]_[内容].txt`

**メリット:**
- コンテキストウィンドウ節約(10,000→1,000トークン)
- ファイル管理しやすい
- 別チャットでも参照可能

**禁止:** ❌ チャット内に長文直接記載
</details>

<details id="chat-token-detail">
<summary><strong>🎯 別チャット管理とトークン節約戦略（CRITICAL）</strong></summary>

**ルール**:
- 各ファイルは専用チャットで管理
- 小さな修正（3-5箇所）→ 修正指示のみ（500-1,500トークン）
- 大規模修正（10箇所以上/100行以上）→ 完全版作成（10,000-15,000トークン）
- 修正指示は必ずDL形式（.md/.txt）
- デバッグはメインチャットで実施

**判断**: 迷ったら「修正指示→動作確認→必要なら完全版」の順

**教訓**: 小さな修正で完全版を作らない → 最大25倍のトークン節約
</details>

<details id="iife-detail">
<summary><strong>⚡ 即時関数パターン(変数再宣言エラー回避)</strong></summary>

**問題:**
```javascript
const trade = ... // 1回目
const trade = ... // ❌ エラー
```

**解決:**
```javascript
(function() {
    const trade = ...
    console.log(trade);
})();
// 何度でも実行可能
```

**テンプレート:**
```javascript
// データ確認
(function() {
    const tm = TradeManager.getInstance();
    console.log('データ:', tm.getAllTrades());
})();

// モニタリング
(function() {
    const original = Xxx.prototype.method;
    Xxx.prototype.method = function(data) {
        console.log('渡されたデータ:', data);
        return original.call(this, data);
    };
})();
```
</details>

<details id="module-detail">
<summary><strong>🔧 モジュール化における置換作業の判断</strong></summary>

**置換必要:**
- ✅ グローバル変数直接操作あり
- ✅ 保存関数呼び出しあり
- ✅ localStorage直接操作あり

**置換不要:**
- ✅ 最初から新モジュール使用
- ✅ グローバル変数操作なし

**例:** Part 2(置換必要)3,590行→878行、Part 7(置換不要)旧ファイル削除のみ
</details>

<details id="ui-detail">
<summary><strong>🎨 UIデザインガイドライン</strong></summary>

**カード型デザイン(2025-10-07導入):**
- グラデーション: `linear-gradient(135deg, #color1, #color2)`
- カラー: 紫(特別)、緑(標準)、青(分析)、赤(警告)
- グラスモーフィズム: `backdrop-filter: blur(10px)`

**優先順位:**
1. 新規UI: 必ずカード型
2. 既存UI: 移行検討
3. 過渡期: 混在OK
</details>

---

### 新モジュール作成テンプレート

```javascript
class XxxModule {
    #privateData = [];
    #eventBus = null;
    
    constructor() {
        this.#eventBus = window.eventBus;
    }
    
    // Public API
    // Private methods
}

window.XxxModule = new XxxModule();
```

---

## 📁 ドキュメント配置ルール

**構造**:
```
ルート/ TASKS.md, MODULES.md, OVERVIEW.md, REFERENCE.md, 機能一覧.md
docs/  フォーム制御.md（詳細情報）
```

**判断基準**:
- タスク関連 → TASKS.md
- 技術仕様（要約100行以内）→ MODULES.md、それ以上 → docs/
- ファイル構造変更 → OVERVIEW.md
- 完了・教訓 → REFERENCE.md

---

## 🔄 制御構造調査フロー

**4ステップ**: 調査対象特定 → デバッグコードで確認 → 結果分析 → docs/フォーム制御.md更新

**デバッグパターン**:
```javascript
// DOM要素確認
(function() {
    ['id1', 'id2'].forEach(id => {
        const el = document.getElementById(id);
        console.log(id + ':', el ? '✅' : '❌');
    });
})();
```

**結果はdocs/フォーム制御.mdに記録**

---

<details id="form-control-detail">
<summary><strong>📋 フォーム制御（エラー対処事例）</strong></summary>

フォーム関連のエラー対処事例は **`docs/フォーム制御.md`** を参照。

**参照タイミング**: フォーム関連エラー発生時、データフロー確認時

**デバッグ方法**: [デバッグフロー](#debug-detail) | [即時関数パターン](#iife-detail)
</details>

---

## 📚 Part II: 完了履歴

### 2026年1月

| 日付 | タスク | 優先度 | 工数 | 主な成果 | 詳細 |
|------|--------|--------|------|---------|------|
| **01/14** | **Supabase画像URL自動更新・クラウド同期実装** | **CRITICAL** | **6h** | **署名付きURL期限自動更新、ログイン時クラウド同期** | [詳細](#supabase画像url自動更新クラウド同期実装) |
| **01/15** | **Phase 5: 統合テスト・本番準備完了** | **CRITICAL** | **4h** | **機能・セキュリティ・エッジケース全テスト合格** | [詳細](#phase-5-統合テスト本番準備2026-01-15) |
| **01/15** | **レスポンシブ改善（ヘッダー・週間プレビュー・決済入力等）** | **MEDIUM** | **4h** | **横並び維持、max-height増加、フィールド幅統一、画像サイズ固定** | [詳細](#レスポンシブ改善2026-01-15) |
| **01/15** | **Pull-to-Refresh実装** | **LOW** | **1h** | **ページ最上部スワイプでリロード、iOS対応** | [詳細](#pull-to-refresh実装2026-01-15) |
| **01/15** | **決済記録モーダル改善** | **MEDIUM** | **1h** | **参考情報2列化、プレースホルダー短縮** | [詳細](#決済記録モーダル改善2026-01-15) |

---

### 2025年11-12月

| 日付 | タスク | 優先度 | 工数 | 主な成果 | 詳細 |
|------|--------|--------|------|---------|------|
| **12/23** | **エントリー情報「編集」ボタン問題解決** | **HIGH** | **3h** | **localStorageデータ形式不整合修正、後方互換性実装** | [詳細](#エントリー情報編集ボタン問題解決) |
| **12/23** | **月次カレンダー ツールチップ位置修正** | **LOW** | **30min** | **レスポンシブ対応、画面端で切れないように調整** | [詳細](#月次カレンダー-ツールチップ位置修正) |
| **12/22** | **週次分析 上部・下部不一致修正** | **CRITICAL** | **2h** | **handlePeriodChange追加、isoWeek修正、MODULES.md準拠** | [詳細](#週次分析-上部下部不一致修正) |
| **12/22** | **MODULES.md準拠 全モジュール統一** | **HIGH** | **2h** | **7ファイル修正、yenProfitLossフィールド名統一** | [詳細](#modulesmd準拠-全モジュール統一) |
| **12/21** | **相場ノート エディタ機能強化** | **MEDIUM** | **4h** | **空行保持、装飾拡張（取消線・緑・サイズ）、プレビュー改善** | [詳細](#相場ノート-エディタ機能強化) |
| **12/17** | **Week 7完了：品質改善4件** | **MEDIUM** | **6h** | **分析タブ期間保持、エクスポート拡張、Chart改善、コード削減43%** | [詳細](#week-7-デプロイ品質改善2025-12-1417) |
| **12/14** | **GitHub Pages公開（Week 7）** | **HIGH** | **4h** | **本番URL公開、tradingcomplete.com** | [詳細](#week-7-デプロイ品質改善2025-12-1417) |
| **12/14** | **ライトモードCSS追加修正（第2弾）** | **MEDIUM** | **2h** | **月次カレンダー・レスポンシブ対応** | [詳細](#ライトモードcss追加修正第2弾) |
| **12/14** | **ライトモードCSS追加修正** | **MEDIUM** | **2h** | **分析タブ・モーダル・トレード記録対応** | [詳細](#ライトモードcss追加修正) |
| **12/13** | **レスポンシブ微調整（iPhone実機テスト）** | **MEDIUM** | **4h** | **12問題修正、iOS対応完了** | [詳細](#レスポンシブ微調整iphone実機テスト) |
| **12/12** | **Netlify初回デプロイ（Week 7）** | **HIGH** | **2h** | **本番環境公開、tradingcomplete.netlify.app** | [詳細](#netlify初回デプロイweek-7) |
| **12/12** | **ライトモードCSS完全対応** | **MEDIUM** | **4h** | **全タブ統一カラーシステム、視認性大幅向上** | [詳細](#ライトモードcss完全対応) |
| **12/12** | **レスポンシブ対応（全6タブ完了）** | **MEDIUM** | **10h** | **全コンポーネント対応、5ブレークポイント** | [詳細](#レスポンシブ対応全6タブ完了) |
| **12/11** | **レスポンシブ週間プレビュー（アコーディオン機能）** | **MEDIUM** | **4h** | **7問題解決、体系的CSSデバッグ** | [詳細](#レスポンシブ週間プレビューアコーディオン機能) |
| **12/11** | **画像表示統一（詳細モーダル・相場ノート）** | **MEDIUM** | **3h** | **3箇所で統一UI、5バグ修正** | [詳細](#画像表示統一詳細モーダル相場ノート) |
| **11/29** | **一括入力機能削除** | **CRITICAL** | **2h** | **223行削減、統計整合性確保** | [詳細](#一括入力機能削除) |
| ~~11/28~~ | ~~一括入力機能改善~~ | ~~MEDIUM~~ | ~~3h~~ | ~~（11/29に機能削除のため無効）~~ | - |
| **11/27** | **相場ノート機能改善（検索・月メモ）** | **MEDIUM** | **7h** | **検索機能、月メモ機能、5件のバグ修正** | [詳細](#相場ノート機能改善検索月メモ) |
| **11/27** | **Part 3 NoteManagerModule化** | **MEDIUM** | **2h** | **1,400行削減、37関数カプセル化** | [詳細](#part-3-notemanagermodule化) |
| **11/27** | **Part 4削除（script.js完全版）** | **CRITICAL** | **1h** | **2,266行削減、エラー0件** | [詳細](#part-4削除script-js完全版) |
| 11/26 | 設定タブ改善プロジェクト全Phase完了 | HIGH | 22h | 全26テスト項目100%合格、EventBus統合完了 | [詳細](#設定タブ改善プロジェクト全phase完了) |
| 11/21 | 全タブ数字統一(17,557円ズレ解消) | CRITICAL | 2h | 未決済トレード除外、データ整合性完全確立 | [詳細](#全タブ数字統一17557円ズレ解消) |
| 11/20 | 設定タブのサブタブ化(Phase 1 - Step 4完了) | HIGH | 1.5h | 3サブタブ構造実装、情報の段階的開示 | [詳細](#設定タブのサブタブ化phase-1---step-4完了) |
| 11/16 | 分析タブ アコーディオンUI改善 | MEDIUM | 1h | グロー効果、ボタン問題解決、UI統一性向上 | [詳細](#分析タブ---アコーディオンui改善) |
| 11/16 | 月次カレンダー機能実装 | MEDIUM | 10h | 日別損益の視覚化、テスト100%合格 | [詳細](#月次カレンダー機能実装) |
| 11/14 | 新規エントリーフォーム問題1-6完了 | CRITICAL-HIGH | 6.75h | 全6問題解決、体系的デバッグ手法確立 | [詳細](#新規エントリーフォーム全問題完了) |
| 11/13 | 新規エントリーUI改善(チャート3枚化) | HIGH | 4h | チャート画像3枚対応、アイコン削除、統合テスト100% | [詳細](#新規エントリーui改善---チャート画像3枚対応とトレードアイコン削除) |
| 11/12 | 新規エントリーUI改善 Phase 1 | HIGH | 3h | brokerフィールド追加、2列グリッド化 | [詳細](#新規エントリーui改善---phase-1) |
| 11/11 | 経費一覧カテゴリアコーディオン | CRITICAL | 3h | 視認性大幅向上、検索効率50%改善 | [詳細](#経費一覧---カテゴリアコーディオン表示) |
| 11/11 | 経費サマリー自動更新 & 日付保持 | MEDIUM | 1h | リアルタイム更新、UX向上 | [詳細](#収支管理タブ---経費サマリー自動更新--日付保持機能) |
| 11/10 | 経費フィルター基準修正 | CRITICAL | 20分 | 21件差異解消、¥339,944一致 | [詳細](#経費フィルター基準修正) |
| 11/10 | 分析タブレポート0表示バグ修正 | CRITICAL | 2h | 全統計値正常表示 | [詳細](#分析タブのレポート詳細が0表示になる問題修正) |
| 11/10 | 円建て損益保存バグ完全解決 | CRITICAL | 2日 | 150円ズレ解消、全タブ一致 | [詳細](#円建て損益保存バグ完全解決) |

**11-12月の主な成果**:
- 🎯 CRITICAL問題6件完全解決（+1: Part 4削除）
- 📊 データ整合性: 100%達成
- 🎨 UX改善: 視認性50%向上、検索効率50%改善、アコーディオンUI統一、設定タブ構造化
- 💾 互換性: 既存データ100%保護
- ⚡ JavaScript エラー: 0件維持
- 🖼️ チャート画像: 3枚対応完了
- 🔧 体系的デバッグ手法: 確立・文書化
- 📅 月次カレンダー: 日別損益の視覚化(テスト100%合格)
- ⚙️ 設定タブ改善: 全6Phase完了、EventBus統合、26テスト項目100%合格
- 📓 **相場ノート機能改善: 検索機能、月メモ機能、日付連動完全修正**
- 📝 **Part 3モジュール化: NoteManagerModule完成、1,400行削減**
- 🗑️ **Part 4削除: script.js 2,266行削減（25.5%）**
- 🗑️ **一括入力機能削除: 統計整合性確保、223行削減**
- 🔧 **MODULES.md準拠統一: yenProfitLossフィールド名7ファイル修正、データ一貫性確保**
- 🖼️ **画像表示統一: 詳細モーダル・相場ノートで統一UI、5バグ修正**
- 📱 **レスポンシブ対応完了: 全6タブ対応、5ブレークポイント（1024/768/480/360/横向き）**
- 🎨 **ライトモードCSS完全対応: 統一カラーシステム、視認性大幅向上**
- 🚀 **Netlify初回デプロイ: 本番環境公開、tradingcomplete.netlify.app**
- 🌐 **GitHub Pages公開: 独自ドメインで本番公開、tradingcomplete.com**
- ✨ **Week 7完了: 分析タブ期間保持、エクスポート拡張、Chart改善、コード43%削減**
- ☁️ **Supabase画像URL自動更新: 署名付きURL期限自動更新、ログイン時クラウド同期実装**
- ✅ **Phase 5テスト完了: 機能12項目・セキュリティ3項目・エッジケース3項目全合格**
- 📱 **レスポンシブ改善（01/15）: ヘッダー横並び維持、週間プレビュー画像サムネイル、決済入力フィールド統一**
- 🔄 **Pull-to-Refresh実装: ページ最上部スワイプでリロード、iOS対応**

---

### 完了タスク詳細

#### ✅ Phase 5: 統合テスト・本番準備（2026-01-15）

**完了日**: 2026-01-15

| Step | 内容 | 結果 |
|------|------|------|
| 5.1 | 機能テスト（12項目） | ✅ 合格 |
| 5.2 | セキュリティテスト（3項目） | ✅ 合格 |
| 5.3 | エッジケーステスト（3項目） | ✅ 合格（1件制限あり） |
| 5.4 | 本番環境準備確認 | ✅ 合格 |

**セキュリティテスト詳細**:
- XSS攻撃テスト: escapeHtml/cleanupNoteHTMLで全入力サニタイズ確認
- RLSテスト: 全5テーブルで自分のデータのみアクセス可能を確認
- セッションタイムアウト: 24時間設定、AuthModuleで監視動作確認

**エッジケーステスト詳細**:
- オフライン時: ⚠️ localStorageに保存されるがリロードでクラウドに上書き
- 同時編集: ✅ Last Write Wins（後勝ち）で正常動作
- パフォーマンス: ✅ localStorage 2.6%使用、1年後推定でも問題なし

**既知の制限（リリースノート記載）**:
1. オフライン中の保存はリロードで消失（v1.1対応予定）
2. iOS Safari goalsボタン問題（調査中）

---

#### ✅ レスポンシブ改善（2026-01-15）

**日付**: 2026-01-15 | **工数**: 4h | **優先度**: MEDIUM

**修正内容**:

| ファイル | 修正内容 |
|---------|---------|
| 6_responsive.css | ヘッダー横並び維持（flex-wrap対応） |
| 6_responsive.css | 週間プレビューmax-height 85px→120px |
| 6_responsive.css | 決済入力フィールド幅統一（日付125px固定、価格flex、Lot50px） |
| 6_responsive.css | expense-tabsスクロールバー（ダークモード/ライトモード対応） |
| 6_responsive.css | 6タブグリッド余白修正（4行→3行） |
| 6_responsive.css | 経費メモレスポンシブ対応 |
| 1_base.css | 新規エントリー画像サイズ固定（180×120px、!important追加） |
| NoteManagerModule.js | 週間プレビュー画像サムネイル表示 |

**教訓**:
- **CSS優先度**: インラインスタイル > 外部CSS。`!important`で強制適用が必要な場合がある
- **iOS対応**: `window.scrollY === 0`が完全に0にならない場合がある。`<= 5`で判定

---

#### ✅ Pull-to-Refresh実装（2026-01-15）

**日付**: 2026-01-15 | **工数**: 1h | **優先度**: LOW

**機能**:
- ページ最上部で下スワイプでリロード
- 緑色インジケーター表示
- 画面暗転 + 「🔄 更新中...」メッセージ
- iOS（ホーム画面追加時）対応

**実装ファイル**:
- script.js: `initPullToRefresh()`関数追加

---

#### ✅ 決済記録モーダル改善（2026-01-15）

**日付**: 2026-01-15 | **工数**: 1h | **優先度**: MEDIUM

**修正内容**:

| 項目 | 変更前 | 変更後 |
|------|--------|--------|
| 参考情報 | 4段（縦並び） | 2段（グリッド2列） |
| プレースホルダー | 「決済価格」「決済ロット」 | 「価格」「Lot」 |
| 入力フィールド幅 | 可変 | 日付125px固定、Lot50px固定 |

**修正ファイル**:
- TradeExit.js

---

#### ✅ Supabase画像URL自動更新・クラウド同期実装

**日付**: 2026-01-14 | **工数**: 6h | **優先度**: CRITICAL

**問題**: 
1. Supabase無料プランで1週間非アクティブでプロジェクトが自動停止
2. 署名付きURLの有効期限切れで画像が表示されない
3. 別デバイスでログインしてもデータが同期されない

**症状**:
- 全画像が見えない + `ERR_NAME_NOT_RESOLVED` エラー
- 特定の画像が「壊れた画像」アイコン + 403エラー
- 別デバイスでログイン後、データが空

**原因**:
1. **プロジェクト停止**: 1週間アクセスがないと自動停止
2. **URL期限切れ**: 署名付きURLは1時間〜7日で期限切れ
3. **同期処理なし**: ログイン後にSupabaseからデータを取得する処理がなかった

**解決策**:

**1. imageUtils.js v1.1.0 - URL期限自動更新**:
```javascript
// 期限チェック
window.isUrlExpired(img)  // true = 期限切れ

// 自動更新付き画像URL取得
const url = await window.getValidImageSrc(img);
// 期限切れなら自動でpathから新URLを取得
```

**2. AuthModule v1.2.0 - ログイン時クラウド同期**:
```javascript
async syncAllDataFromCloud() {
    await SyncModule.syncTradesToLocal();
    await SyncModule.syncNotesToLocal();
    await SyncModule.syncExpensesToLocal();
    await SyncModule.syncCapitalRecordsToLocal();
    await SyncModule.syncUserSettingsToLocal();
}
```

**3. NoteManagerModule - 自動同期対応**:
- `sync:notes:synced` イベントで自動更新
- `getValidImageSrc()` で期限切れURL自動更新

**修正ファイル（3件）**:
- imageUtils.js v1.1.0
- AuthModule.js v1.2.0
- NoteManagerModule.js

**テスト結果**:
- プロジェクト再開後: ✅ 画像表示正常
- URL期限切れ時: ✅ 自動更新で表示
- 別デバイスログイン: ✅ データ同期正常

**教訓**:
- Supabase無料プランは週1回アクセス必須（教訓20）
- 署名付きURLは期限チェックと自動更新が必要（教訓21）
- クラウド同期は「保存」と「読込」の両方が必要（教訓22）

---

#### ✅ 月次カレンダー ツールチップ位置修正

**日付**: 2025-12-23 | **工数**: 30min | **優先度**: LOW

**問題**:
- 金曜・土曜のセルをクリックすると、ツールチップが画面右端で切れる
- レスポンシブ表示（モバイル）で顕著

**原因**:
- `#displayTooltip`メソッドで画面端チェックなしに右下に表示
- `const x = event.clientX + 10;` で固定オフセット

**修正内容**:
- 右端で切れる場合 → クリック位置の左側に表示
- 下端で切れる場合 → クリック位置の上側に表示
- 左端・上端のガード（負の値にならないように最小値10px）

**修正ファイル（1件）**:
- `MonthlyCalendarModule.js` - `#displayTooltip`メソッド（495-521行目）

**テスト結果**:
- デスクトップ: ✅ 正常動作
- モバイル（430px幅）: ✅ 左側に表示、画面内に収まる

**教訓**:
- ツールチップ等の動的要素は画面端チェックが必須
- レスポンシブ対応時は必ず狭い画面幅でテスト

---

#### ✅ MODULES.md準拠 全モジュール統一

**日付**: 2025-12-22 | **工数**: 2h | **優先度**: HIGH

**問題**:
- 開発初期と標準化後でyenProfitLossのフィールド名が不統一
- 古い命名: `tradePL`, `swapPoints`, `netProfitLoss`
- 新しい命名: `profitLoss`, `swap`, `netProfit`

**修正ファイル（7件）**:

| ファイル | 修正内容 |
|---------|---------|
| ChartModule.js | 累計Pipsスケール + 円建て統計フィールド名 |
| TradeDetail.js | フィールド名（swap, netProfit） |
| ReportModule.js | onclickクォート修正 |
| TradeEdit.js | フィールド名（profitLoss, swap, netProfit） |
| YenProfitLossManager.js | フィールド名（profitLoss, swap, netProfit） |
| script.js | フィールド名（profitLoss, swap, netProfit） |
| ClosingManagerModule.js | `t.yenProfitLoss?.netProfit` |

**MODULES.md準拠のデータ構造**:
```javascript
trade.yenProfitLoss = {
    profitLoss: 35000,    // トレード損益
    swap: -171,           // スワップ
    commission: -75,      // 手数料
    netProfit: 34754      // 純損益
}
```

**教訓**: 標準化したら、古いファイルも全て更新する

---

#### ✅ 週次分析 上部・下部不一致修正

**完了日**: 2025-12-22 | **優先度**: CRITICAL | **工数**: 2h

**問題**: 分析タブで週次期間を選択すると、上部統計は正しく表示されるが、下部レポート（通貨ペア分析、トレード履歴等）が空になる

**原因**:
1. `changePeriod()`で週番号(50)がそのまま月として`generateReport()`に渡される
2. `new Date(2025, 49)` → 2029年2月に計算される
3. `window.currentWeekNumber`が更新されていない
4. `generateWeeklyReport()`のisoWeekケースで配列インデックスとして週番号を使用していた

**修正内容（MODULES.md準拠）**:

**ReportModule.js**:
1. `handlePeriodChange(periodType, year, period)` Public API追加
   - 週次の場合: `currentWeekNumber`, `currentWeekMode`を設定
   - ISO週から正しい月を計算
2. `generateWeeklyReport()`のisoWeekケース修正
   - 週番号から直接日付範囲を計算するロジックに変更

**index.html**:
- `changePeriod()`内のロジックを削除
- `ReportModule.handlePeriodChange()`呼び出しに変更

**検証結果**:

| 期間タイプ | 上部 | 下部 | 結果 |
|-----------|------|------|------|
| 週次 | 3件 | ✅ | ✅ OK |
| 月次 | 4件 | ✅ | ✅ OK |
| 四半期 | 12件 | ✅ | ✅ OK |
| 年次 | 50件 | ✅ | ✅ OK |

**教訓**: 
- index.htmlにロジックを追加する提案は最初から避けるべき
- 常にMODULES.md準拠の設計を最初から提案する

---

#### ✅ エントリー情報「編集」ボタン問題解決

**完了日**: 2025-12-23 | **工数**: 3h | **優先度**: HIGH

**現象**:

トレード詳細モーダル内の「エントリー情報」セクションの編集ボタンをクリック/タップしても、編集モーダルが開かない。

- 最初はiPhone Safari特有の問題と思われた
- 他の編集ボタン（チェックリスト、決済情報、振り返り等）は正常動作
- ボタンは押された感覚はあるが、モーダルが開かない

**調査経緯**:

| 調査内容 | 結果 |
|---------|------|
| HTML構造の比較 | 全ボタン同じ構造 ✅ |
| CSS設定の確認 | 全ボタン同じ ✅ |
| JavaScript関数定義 | 正常 ✅ |
| PCでの動作 | 全ボタン正常と思っていた |
| PC Chromeモバイルエミュレーション | 正常 ✅ |
| iPhone Safari | エントリー情報のみ ❌ |

**最初の仮説（誤り）**:
- iPhone Safari特有のバグ
- CSSのtouch-action問題
- 見えない要素の重なり

**転機**: PCでもエラーが再現

```
SettingsModule.js:781 Uncaught TypeError: this[#brokers].list is not iterable
    at SettingsModule.getAllBrokers
    at #generateBrokerOptions (TradeEdit.js:469)
    at TradeEdit.editBasicInfo (TradeEdit.js:392)
```

**原因**:

**localStorageのbrokersデータが古い形式で保存されていた**

| 期待される形式 | 実際のデータ |
|--------------|-------------|
| `{ list: [], nextId: 1 }` | `[]`（配列のみ） |

SettingsModule.jsの`#loadBrokers()`でデータを読み込む際、形式を検証していなかったため、古い形式のデータがそのまま`#brokers`に代入され、`#brokers.list`が`undefined`になりエラーが発生。

**修正内容**:

**ファイル**: SettingsModule.js（#loadBrokers メソッド）

```javascript
// 変更前
#loadBrokers() {
    const stored = localStorage.getItem(SettingsModule.STORAGE_KEYS.BROKERS);
    if (stored) {
        try {
            this.#brokers = JSON.parse(stored);  // ← 形式検証なし
        } catch (e) {
            this.#brokers = { list: [], nextId: 1 };
        }
    }
}

// 変更後
#loadBrokers() {
    const stored = localStorage.getItem(SettingsModule.STORAGE_KEYS.BROKERS);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            // データ形式を検証
            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.list)) {
                this.#brokers = parsed;
            } else if (Array.isArray(parsed)) {
                // 古い形式（配列のみ）の場合は変換
                this.#brokers = { 
                    list: parsed, 
                    nextId: parsed.length > 0 ? Math.max(...parsed.map(b => b.id || 0)) + 1 : 1 
                };
                this.#saveBrokers(); // 新形式で保存し直す
            } else {
                this.#brokers = { list: [], nextId: 1 };
            }
        } catch (e) {
            this.#brokers = { list: [], nextId: 1 };
        }
    }
}
```

**教訓**:

1. **「特定環境だけの問題」と思い込まない**: 最初はiPhone Safari特有と思ったが、実際はデータ形式の問題。PCでも再現するか必ず確認する
2. **エラーメッセージが最重要**: `this[#brokers].list is not iterable` が決め手。コンソールエラーを見逃さない
3. **データ読み込み時は形式検証を行う**: localStorage等から読み込んだデータは信用しない。期待する形式かどうかを必ず検証
4. **後方互換性を考慮したデータマイグレーション**: 古い形式のデータも自動変換して対応。ユーザーのデータを壊さない
5. **デバッグの段階的アプローチ**: CSS → JavaScript → データと順に調査。仮説が外れたら次の可能性を検討

**関連ファイル**:
- SettingsModule.js: #loadBrokers()、getAllBrokers()
- TradeEdit.js: editBasicInfo()、#generateBrokerOptions()
- bridge.js: window.editBasicInfo()

**デバッグに有効だったコード**:
```javascript
// localStorageのデータ形式確認
console.log('brokers data:', localStorage.getItem('brokers'));
// 結果: [] ← これが原因だった
```

---

#### ✅ Week 7: デプロイ・品質改善（2025-12-14〜17）

**期間**: 2025-12-14〜17 | **合計工数**: 約10h | **優先度**: HIGH/MEDIUM

---

##### GitHub Pages公開

**完了日**: 2025-12-14 | **工数**: 約4h

| タスク | 状態 |
|--------|------|
| GitHubリポジトリ作成（Public） | ✅ |
| GitHub Desktop導入 | ✅ |
| GitHub Pages有効化 | ✅ |
| 独自ドメイン接続 | ✅ |

**公開情報**:
- 本番URL: https://tradingcomplete.com/trading-complete/
- リポジトリ: https://github.com/tradingcomplete/trading-complete

**更新フロー**:
1. ローカルでファイル編集
2. GitHub Desktopで変更確認
3. Commit → Push
4. 1〜2分で自動反映

---

##### 分析タブ期間保持

**完了日**: 2025-12-17 | **優先度**: MEDIUM

**問題**: 分析タブで期間変更後、他タブに移動して戻ると期間がリセットされる

**原因**: `switchTab()`関数で分析タブに切り替えるたびに現在月で再生成していた

**解決**: 
- `analysisInitialized`フラグ導入
- 初回のみ生成、2回目以降はスキップ
- 期間変更時に適切に更新

**修正ファイル**: index.html, script.js

---

##### エクスポート/インポート機能拡張（v7.0）

**完了日**: 2025-12-17 | **優先度**: MEDIUM

**追加したエクスポート/インポート対象**:

| データ | キー |
|--------|------|
| 経費 | tc_expenses |
| 入出金 | depositWithdrawals |
| 月間メモ | monthlyMemos |
| お気に入りペア | favoritePairs |
| ブローカー | brokers |
| テーマ | theme |

**その他の改善**:
- インポート後の自動リロード（1.5秒後）
- トーストメッセージ改善

**修正ファイル**: script.js

---

##### ChartModuleレスポンシブ改善

**完了日**: 2025-12-17 | **優先度**: MEDIUM

**問題**: モバイル表示でデスクトップ用スタイルが適用される

**原因**: `canvas.width`（内部解像度760px）で判定していた

**解決**: `canvas.clientWidth`（実際の表示サイズ）で判定

**その他の改善**:
- グラフ高さ500px固定
- セクション間の余白調整
- フォントサイズ最適化

**修正ファイル**: ChartModule.js

---

##### コード最適化

**完了日**: 2025-12-17

**script.js行数削減**:
- Before: 8,883行
- After: 5,029行
- 削減: 3,854行（43%）

---

**Week 7の教訓**:

1. **Netlifyの制限に注意**: 無料枠300クレジット = 約20デプロイ。GitHub Pagesは無制限
2. **モバイル判定はclientWidthを使う**: canvas.width（内部解像度）ではなく、canvas.clientWidth（実際の表示サイズ）で判定
3. **エクスポート/インポートは全データ対象に**: デバイス間移行で漏れがあると不便。テーマなどの設定も含める
4. **インポート後はリロード必須**: メモリ上のデータとlocalStorageの整合性を保つ

---

#### ✅ 相場ノート エディタ機能強化

**完了日**: 2025-12-21 | **工数**: 約4h | **優先度**: MEDIUM

**実装内容**:

| 機能 | 説明 |
|------|------|
| 空行保持 | 直接入力・コピペ両方で空行が保存・表示される |
| プレビュー更新タイミング | 手動保存時のみ週間プレビュー・ノート詳細を更新 |
| 削除時編集画面クリア | ノート削除後、入力欄もクリアされる |
| 取り消し線（S） | テキストに取り消し線を適用 |
| 緑文字 | 新しい色オプション |
| 文字サイズ（小/中/大） | プルダウンでサイズ変更 |
| CSS変数による色統一 | ダーク/ライトモード両対応 |
| 週間プレビュー装飾対応 | 色・サイズ・取消線がプレビューに反映 |

**修正ファイル**:

| ファイル | 変更内容 |
|----------|----------|
| NoteManagerModule.js | 空行保持（6箇所）、プレビュー更新、削除クリア、applyNoteFormat拡張、applyFontSize追加、#normalizeElementStyle追加 |
| 5_themes.css | CSS変数追加（--editor-color-red/blue/green, --editor-highlight-bg）、ボタン色スタイル |
| index.html | エディタツールバー更新（サイズプルダウン、S/緑ボタン追加） |

**MODULES.md準拠ポイント**:

| 項目 | 対応 |
|------|------|
| プライベートメソッド | `#normalizeElementStyle()` で `#` 使用 |
| 重複コード排除 | createDayPreview・formatNoteContent → 共通メソッド化 |
| CSS変数 | テーマ対応のため直接値ではなくvar()使用 |
| EventBus | `note:formatApplied`, `note:fontSizeApplied` イベント発火 |

**新しいエディタUI**:
```
[ サイズ▼ ] [ B ] [ U ] [ S ] [ 赤 ] [ 青 ] [ 緑 ] [ 黄 ] [ 元 ]
```

**運用ルール**:

| 注意事項 | 対応 |
|----------|------|
| 取り消し線のずれ | 取り消し線は**最後に適用**すると正しく表示される |

**理由**: `document.execCommand`でフォーマットを重ねるとspanが入れ子になり、取り消し線と文字サイズが別要素に適用されてしまうため。

**教訓**:

1. **CSS変数の活用**: テーマ切替対応には直接値ではなくCSS変数を使用
2. **重複コードの共通化**: MODULES.md準拠でプライベートメソッドに切り出し
3. **textDecorationLine**: ブラウザによっては`textDecoration`ではなく`textDecorationLine`にスタイルが設定される
4. **execCommandの限界**: リッチテキストエディタの複雑な書式には限界があり、運用でカバーが現実的な場合もある

---

#### ✅ GitHub Pages公開（Week 7）

**完了日**: 2025-12-14 | **工数**: 4h | **優先度**: HIGH

**実施内容**:

| タスク | 状態 |
|--------|------|
| GitHubリポジトリ作成 | ✅ |
| リポジトリをPublicに変更 | ✅ |
| GitHub Desktop導入 | ✅ |
| 初回コミット・プッシュ | ✅ |
| GitHub Pages有効化 | ✅ |
| ファイル構造修正（ルート配置） | ✅ |
| 独自ドメインで公開確認 | ✅ |

**成果**:

- **本番URL**: https://tradingcomplete.com/trading-complete/
- **リポジトリ**: https://github.com/tradingcomplete/trading-complete（Public）
- **ホスティング**: GitHub Pages（無料・デプロイ無制限）

**更新の流れ（今後）**:

```
1. ローカルでファイル編集
2. GitHub Desktop で変更確認
3. 「Summary」に変更内容入力
4. 「Commit to main」→「Push origin」
5. 1〜2分で自動反映
```

**Netlifyからの移行経緯**:

| 項目 | Netlify | GitHub Pages |
|------|---------|--------------|
| 無料枠 | 300クレジット/月 | 無制限 |
| 制限到達 | 20デプロイで停止 | なし |
| 費用 | 超過で有料 | 完全無料 |

**結論**: 静的サイトはGitHub Pagesが最適

**教訓**:

1. **Netlifyの制限を事前確認すべきだった**: 無料枠300クレジット = 約20デプロイ。手動デプロイを繰り返すと消費が早い
2. **GitHub Pagesは静的サイトに最適**: 無制限でデプロイ可能、pushするだけで自動反映、独自ドメインも無料で接続可能
3. **Publicリポジトリのメリット**: GitHub Pages無料利用、ポートフォリオとして活用、Build in Publicと相性良い
4. **ファイル構造に注意**: index.htmlはリポジトリ直下に必要。サブフォルダに入れると404エラー

---

#### ✅ Netlify初回デプロイ（Week 7）

**完了日**: 2025-12-12 | **工数**: 2h | **優先度**: HIGH

**実施内容**:

| タスク | 状態 |
|--------|------|
| Netlifyアカウント作成 | ✅ |
| 初回デプロイ（Netlify Drop） | ✅ |
| サイト名変更 | ✅ |
| タイトル・サブタイトル変更 | ✅ |
| 完成版情報コメント更新 | ✅ |
| PDF保存ヒント追加 | ✅ |
| レスポンシブ微調整 | ✅ |
| 再デプロイ | ✅ |

**成果**:

- **公開URL**: https://tradingcomplete.netlify.app
- **管理画面**: https://app.netlify.com/（GitHub連携でログイン）
- **デプロイ方式**: 手動（Netlify Drop）

**変更したファイル**:

| ファイル | 変更内容 |
|---------|---------|
| index.html | タイトル「Trading Complete」、サブタイトル変更 |
| index.html | 完成版情報コメント更新（32機能・6タブ構成） |
| ReportModule.js | PDF保存ボタン下に説明文追加 |
| 6_responsive.css | スマホ実機での表示崩れ修正 |

**技術メモ**:

- **Netlify Drop**: フォルダをドラッグ&ドロップでデプロイ
- **更新方法**: 同じ場所に再度ドロップで上書き
- **デプロイ履歴**: Deploys画面で確認可能、ロールバック可能
- **将来**: GitHub連携で自動デプロイ化予定

**教訓**:

1. **PCレスポンシブ ≠ 実機表示**: PCのレスポンシブモードでは検出できない問題がある。実機テストは必須
2. **独自ドメインは後回しでOK**: netlify.appでベータテスト、準備完了後に正式ドメイン切替
3. **LocalStorage版の制約**: 各デバイスのブラウザに独立して保存。クラウド同期はSupabase連携後

---

---

#### ✅ ライトモードCSS追加修正

**完了日**: 2025-12-14 | **工数**: 2h | **優先度**: MEDIUM

**対応内容**:

| 箇所 | 修正内容 |
|------|---------|
| 分析タブ | 月別推移グラフ、レポートコンテンツ、アコーディオンヘッダー、期間選択エリア、統計セル |
| モーダル | ブローカー追加、通貨ペア追加、円建て編集 |
| トレード記録 | カード内区切り線（純損益）、ヘッダー区切り線 |
| ヘッダー | 目標を見るボタン |

**修正ファイル**:

| ファイル | 変更内容 |
|---------|---------|
| 5_themes.css | ライトモードスタイル約80行追加 |
| TradeList.js | 551行目: net-profit-rowクラス追加 |
| broker-ui.js | 270, 280行目: broker-section-titleクラス追加 |

**教訓**:

1. **インラインスタイルはCSS !importantでも上書きできない場合がある**: JSで生成される要素はインラインスタイルではなくクラス名で制御
2. **JSで生成される要素はクラス名を追加してCSSで制御**: 保守性が高く、テーマ切り替えに対応しやすい
3. **rgba(255,255,255,0.1)などの白い半透明はライトモードで見えない**: ライトモードでは明示的な色指定が必要

---

#### ✅ ライトモードCSS追加修正（第2弾）

**完了日**: 2025-12-14 | **工数**: 2h | **優先度**: MEDIUM

**対応内容**:

| 箇所 | 修正内容 |
|------|---------|
| 分析タブ | 期間選択エリア（文字色・背景）、統計セル（背景・枠線） |
| モーダル | 円建て編集モーダルの黒塗りつぶし修正 |
| ヘッダー | 目標を見るボタンの視認性改善 |
| 月次カレンダー | 「今日」の青いハイライト追加 |
| レスポンシブ対応 | 月次カレンダーのUI崩れ修正（iPhone対応） |

**修正ファイル**:

| ファイル | 変更内容 |
|---------|---------|
| 5_themes.css | ライトモードスタイル追加・調整 |

**技術的な修正点**:

| 要素 | 変更内容 |
|------|---------|
| `.section` | border: 2px → none |
| `.expense-section` | border/padding削除（レスポンシブ対応） |
| `.calendar-controls` | padding/gap/ボタンサイズ縮小 |
| `.calendar-day-cell.today` | 青いハイライト追加 |
| `.goals-toggle-btn` | 背景・枠線追加 |
| 統計セル | 背景 #e8e8e8、枠線追加 |
| 期間選択ラベル | 文字色 #333333 |

**教訓**:

1. **ライトモードで追加したborder/paddingがレスポンシブ時に幅を消費しUI崩れの原因になる**: モード間の差は「見た目」だけでなく「レイアウト」にも影響
2. **iPhoneサイズ（390px）では数pxの差でflex-wrapが発動する**: モバイル実機での検証が重要
3. **モード間の差は「見た目」だけでなく「レイアウト」にも影響することを意識する**: border/paddingの追加は慎重に

**次回確認事項**:
- モバイルでトレードがある日のタップ反応（データ同期後に確認）

---

#### ✅ ライトモードCSS完全対応

**完了日**: 2025-12-12 | **工数**: 4h | **優先度**: MEDIUM

**概要**: ライトモード（☀️ライトモード）の全画面・全タブに対して、ダークモードと同等の視認性・デザイン品質を実現。

**統一カラーシステム**:

```
【背景色】
- Body: #f0f0f0（ライトグレー）
- Section: #fafafa（オフホワイト）
- Card/Input: #f8f8f8（ホワイトグレー）

【枠線色】
- 標準: #999999（グレー）
- 強調: #888888（濃いグレー）

【テキスト色】
- 本文: #000000（黒）
- 補助: #666666（ダークグレー）
- ラベル: #333333（ダークグレー）
- プレースホルダー: #999999（ライトグレー）

【アクセント色】
- 見出し/強調: #00995a（緑）
- ボタン: #00bb5f（ブライト緑）

【状態色】
- 利益/プラス: #00995a（緑）
- 損失/マイナス: #dd3333（赤）
- オープン/警告: #cc8800（ダークオレンジ）

【特殊用途】
- 削除ボタン: #cc0000（赤）
- 青ボタン: #0044cc（青）
- 黄ボタン: #996600（黄）
```

**修正対象タブ・要素**:

| タブ | 修正内容 |
|------|---------|
| トレード記録 | カード、フィルター、振り返りセクション、エディタツールバー |
| 相場ノート | エディタツールバー（ボタン配置修正） |
| 分析 | 統計コンテナ、期間ボタン、チャート |
| 収支管理 | 全サブタブ（月次カレンダー、経費入力、経費一覧、締め処理、データ出力、入出金管理） |
| 設定 | サブタブ、ブローカーカード、アイコンボタン、区切り線 |

**主要な修正ポイント**:

1. **白い半透明枠線の変換**
   - `rgba(255, 255, 255, 0.1〜0.3)` → `#999999` または `#888888`

2. **背景色の変換**
   - `rgba(255, 255, 255, 0.05)` → `#fafafa`
   - `rgba(0, 0, 0, 0.X)` → 可視化された背景

3. **セクション区切り線の追加**
   - `.expense-section`に枠線追加
   - `hr`要素のライトモード対応
   - `.current-balance-display`の下線強調

4. **インラインスタイル修正（script.js）**
   - `!important`削除（CSSファイル優先のため）
   - 対象: `.current-balance-display`

**修正ファイル**:

| ファイル | 変更内容 |
|---------|---------|
| styles/5_themes.css | 約150行追加（ライトモード専用スタイル）→ 約1,780行に拡張 |
| script.js | インラインスタイルの`!important`削除（1箇所） |

**教訓**:

1. **インラインスタイルの`!important`は避ける**: CSSファイルからの上書きが困難になり、テーマ切り替えに支障
2. **カラーシステムを最初に定義する**: 統一されたカラーパレットで一貫性を保ち、ドキュメント化して参照可能に
3. **デバッグファースト**: `window.getComputedStyle()`で実際の適用値を確認し、問題のある要素を特定してから修正
4. **ダークモードの色は透明度に依存しがち**: `rgba(255, 255, 255, 0.X)`はライトモードで見えない。明示的な色指定に変換が必要

**成果**:
- 🎨 ライトモード使用時の視認性が大幅向上
- 🖼️ 「新しいシステムになったよう」と評価
- ✅ 全タブで統一されたデザイン品質

---

#### ✅ レスポンシブ対応（全6タブ完了）

**完了日**: 2025-12-12 | **工数**: 10h（累計、週間プレビュー含む） | **優先度**: MEDIUM

**対応ブレークポイント**:

| ブレークポイント | 対象デバイス | 主な対応内容 |
|-----------------|-------------|-------------|
| 1024px以下 | タブレット | 全期間統計6列→3列、期間選択折り返し |
| 768px以下 | スマホ（メイン） | 1カラム化、タブ2×3、モーダル95% |
| 480px以下 | 小型スマホ | フォント縮小、余白削減 |
| 360px以下 | 最小サイズ | 最小フォント、期間ボタン縦積み |
| 横向きスマホ | landscape | 3列維持、4ボタン横並び |

**対応コンポーネント**:

| # | コンポーネント | 主な変更内容 |
|---|---------------|-------------|
| 1 | ヘッダー・タブナビ | ロゴ60px、セルフイメージ非表示、タブ2×3グリッド |
| 2 | 新規エントリーフォーム | 2カラム→1カラム、画像横スクロール、フル幅入力 |
| 3 | トレード記録 | カードフル幅、フィルターボタン縮小 |
| 4 | 相場ノート | 週間プレビュー単独表示、アコーディオン、右パネル非表示 |
| 5 | 分析タブ | 統計6列→3列→2列、期間選択折り返し、チャート調整 |
| 6 | 収支管理タブ | サマリーclamp、経費2行構造、入出金テーブル縮小 |
| 7 | 設定タブ | サブタブ均等、セルフイメージ横並び、日付縮小 |
| 8 | モーダル | 幅95%、余白調整 |

**技術的特徴**:

| 技術 | 使用箇所 | 効果 |
|------|---------|------|
| `clamp()` | 収支サマリー | ビューポート幅に応じた自動フォント調整 |
| `flex: 1` | サブタブ、テーマボタン | 均等幅配置 |
| `scroll-snap` | 画像エリア | スムーズな横スクロール |
| `grid-column: 1 / -1` | 経費説明 | フル幅の2行目 |

**修正ファイル**:

| ファイル | 変更内容 | 行数変化 |
|----------|----------|----------|
| styles/6_responsive.css | 全レスポンシブスタイル | 約200行 → 約3,040行 |

**発生した問題と解決策**:

1. **収支サマリーのフォントサイズが変わらない**
   - 原因: Part7_収支管理.jsのインラインスタイル（`style="font-size: 1.2em"`）
   - 解決: CSSクラスに変更（別途Part7チャットで対応必要）

2. **セルフイメージ日付が白背景で目立つ**
   - 原因: ダークモード用の色指定なし
   - 解決: `background: rgba(255,255,255,0.1)`, `color: #e0e0e0`

3. **日付入力幅が広すぎる**
   - 原因: `width: auto`でブラウザデフォルト幅
   - 解決: `width: 95px`で固定

**教訓**:

1. **インラインスタイルの優先度**: JSで生成されたインラインスタイルはCSS `!important`より優先される → ソースコード側の修正が必要
2. **clamp()の活用**: `clamp(min, preferred, max)`でビューポートに応じた自動調整が可能
3. **段階的テスト**: 768px → 480px → 360pxの順でテストし、各段階で動作確認

---

#### ✅ レスポンシブ週間プレビュー（アコーディオン機能）

**完了日**: 2025-12-11 | **工数**: 4h | **優先度**: MEDIUM

**実装内容**:

| 機能 | 説明 |
|------|------|
| 週間ナビゲーション2行レイアウト | Grid使用、ボタン配置最適化 |
| 右パネル非表示（モバイル） | 週間プレビューをフル幅表示 |
| アコーディオン展開/折りたたみ | ▼/▲アイコンで操作 |
| 編集ボタン | editNote()呼び出しで編集画面へ遷移 |
| 空行・改行の反映 | メモ・相場観の書式を保持 |
| 文字の自動折り返し | 長文が枠内で折り返し表示 |
| PCプレビュー空行対応 | white-space: pre-wrapで改行反映 |

**修正ファイル**:

| ファイル | 変更内容 |
|----------|----------|
| 6_responsive.css | 週間プレビューCSS、アコーディオン、折り返し |
| NoteManagerModule.js | createDayPreview、toggleDayAccordion、expandDayContent、formatNoteContent |

**発生した問題と解決策**:

1. **編集ボタンが巨大（幅296px）**
   - 原因: `.btn`クラスに`width: 100%`が設定
   - 解決: `width: auto !important; max-width: 40px !important;`

2. **PC表示でもモバイル用UIが表示**
   - 原因: JSでisMobile判定後もHTML要素が残る
   - 解決: CSSメディアクエリで481px以上では`display: none`

3. **アコーディオン展開時に文字が飛び出す**
   - 原因: カードの高さが固定されていた
   - 解決: `setProperty('height', 'auto', 'important')`で強制変更

4. **文字が右側で切れる**
   - 原因: `text-overflow: ellipsis`と`overflow: hidden`が設定
   - 解決: `text-overflow: clip !important; overflow: visible !important;`

5. **折り返し後に文字が重なる**
   - 原因: `height: 17px`が固定されていた
   - 解決: `height: auto !important; min-height: 0 !important;`

6. **空行が反映されない（モバイル）**
   - 原因: `filter(line => line.trim())`で空行を除外
   - 解決: 空行を`&nbsp;`に変換して保持

7. **空行が反映されない（PCプレビュー）**
   - 原因: `white-space: normal`で改行文字`\n`が無視される
   - 解決: `white-space: pre-wrap !important`を追加

**教訓**:

1. **体系的CSSデバッグ**: 計算値確認 → 強制変更テスト → 原因特定 → 修正
2. **データ形式の確認**: 表示問題の前に、元データの形式（改行`\n` vs `<br>`）を必ず確認
3. **!importantの使用**: 既存CSSの強い指定を上書きする際に必要

---

#### ✅ レスポンシブ微調整（iPhone実機テスト）

**完了日**: 2025-12-13 | **工数**: 4h | **優先度**: MEDIUM

**実装内容**:

| 問題 | 修正内容 | 結果 |
|------|----------|------|
| お気に入りドロップダウン非表示（モバイル） | 詳細度UP + overflow:visible | ✅ |
| ライトモードでドロップダウン非表示 | overflow:hidden削除（3箇所） | ✅ |
| ☆ボタンが入力枠外にはみ出し | padding-right:45px | ✅ |
| リワードの折り返し（iPhone） | font-size:0.9rem + nowrap | ✅ |
| トレード記録カードのバッジ散らばり | 2行整列レイアウト | ✅ |
| 損益Pipsバッジはみ出し | right:15px | ✅ |
| iOS日付入力欄の高さ不統一 | height:44px + -webkit-appearance:none | ✅ |
| 決済情報編集モーダル参考情報3行 | flex + nowrapで1行化 | ✅ |
| トレード履歴ヘッダー折り返し | フォントサイズ縮小 | ✅ |
| ボタンテキスト長すぎ | 「〇〇に切替」→「〇〇」に短縮 | ✅ |
| 相場ノート日付入力が潰れる（iPhone） | flexレイアウト調整 | ✅ |
| 検索＋日付を1行に | 480px以下のcolumn→rowに変更 | ✅ |

**修正ファイル**:

| ファイル | 変更内容 |
|----------|----------|
| 6_responsive.css | 上記全てのCSS修正 |
| ReportModule.js | ボタンテキスト短縮（1407行目） |

**発生した問題と解決策**:

1. **CSS詳細度の競合**
   - 原因: `#new-entry .input-group`（1-1-0）が`.pair-input-container`（0-1-0）より強い
   - 解決: `#new-entry .input-group.pair-input-container`（1-2-0）で上書き

2. **ライトモード専用ルールの存在**
   - 原因: 768px以下に`body.light-mode .section { overflow-x: hidden }`が別途存在
   - 解決: 該当ルールをコメントアウト

3. **iOSの日付入力欄サイズ**
   - 原因: iOSのデフォルトスタイルが適用
   - 解決: `-webkit-appearance: none`でリセット + height固定

4. **インラインスタイルのgrid上書き**
   - 原因: `style="display: grid; grid-template-columns: ..."`がHTML内に直接記述
   - 解決: `[style*="grid"]`属性セレクタで`display: flex !important`に上書き

5. **決済エントリー1行化は断念**
   - 原因: インラインスタイルで`display: grid`が強く設定
   - 判断: 2行のままで十分見やすいため現状維持

**教訓**:

1. **CSS詳細度の理解**: 同じ`!important`でもセレクタの強さで勝敗が決まる
2. **iOSの特殊性**: PCのレスポンシブ表示とiPhone実機は異なる場合がある
3. **試して判断する勇気**: 「無理」という結果を得ることも成果
4. **属性セレクタの活用**: `[style*="grid"]`でインラインスタイルを持つ要素を特定可能

---

#### ✅ ChartModule レスポンシブ対応

**完了日**: 2025-12-12 | **工数**: 3h | **優先度**: MEDIUM

**実装内容**:

| チャート | 対応内容 |
|---------|---------|
| 全期間サマリー | 2列レイアウト、全26項目表示、セクション間余白最適化 |
| 年次チャート | フォントサイズ拡大（16px bold） |
| 月次チャート | clientWidth判定適用 |

**修正ファイル**:

| ファイル | 変更内容 |
|----------|----------|
| ChartModule.js | isMobile判定をclientWidthで実施、レイアウト調整 |

**発生した問題と解決策**:

1. **モバイル用スタイルが適用されない**
   - 原因: `canvas.width`（内部解像度760px）と`canvas.clientWidth`（表示サイズ410px）が異なる
   - 解決: `const displayWidth = canvas.clientWidth || canvas.width` で実際の表示サイズを取得

2. **全期間サマリーの下余白が大きすぎる**
   - 原因: Canvas高さ580pxに対して使用高さ397px（余白103px）
   - 解決: 数学的に計算してlineHeight/sectionGapを最適化（余白21pxに）

3. **セクション間の境界が曖昧**
   - 原因: sectionGap(28px) < lineHeight(24px)の2倍未満
   - 解決: sectionGap = 44px（lineHeightの約2倍）で明確に分離

**教訓**:

1. **Canvas判定はclientWidthを使用**: `canvas.width`は内部解像度、`canvas.clientWidth`が実際の表示サイズ
2. **数学的アプローチ**: 余白計算はデバッグコードで実測 → 計算 → 最適値導出
3. **bold指定で視認性向上**: 小さい文字は太字にすることで潰れにくくなる

**最適化された設定値（モバイル全期間サマリー）**:

| 項目 | 値 | 説明 |
|------|-----|------|
| startY | 105px | ヘッダーとの余白 |
| lineHeight | 23px | 項目間 |
| sectionGap | 44px | セクション間（lineHeightの約2倍） |
| セクション見出し | 15px bold | 見出し |
| 統計項目 | 13px | 項目 |

---

#### ✅ 画像表示統一（詳細モーダル・相場ノート）

**完了日**: 2025-12-11 | **工数**: 3h | **優先度**: MEDIUM

**統一ルール**:

| 項目 | 仕様 |
|-----|------|
| 表示 | 常に3枠を横並びで表示 |
| 空枠 | 点線ボーダー + 「画像1/2/3」テキスト |
| 追加 | 枠クリックで画像追加モーダル |
| 削除 | 右上×ボタン + 確認ダイアログ |
| 画像 | 枠いっぱい（object-fit: cover） |

**対象箇所**:
1. ✅ 新規エントリーフォーム（既存）
2. ✅ トレード詳細モーダル（新規実装）
3. ✅ 相場ノートタブ（新規実装）

**修正ファイル**:

| ファイル | 変更内容 |
|---------|---------|
| 6_responsive.css | 詳細モーダル・相場ノート用スタイル追加 |
| TradeDetail.js | 画像セクションHTML生成、changeTradeImage/deleteTradeImage関数追加 |
| NoteManagerModule.js | addNoteImageAt/removeNoteImageAt/restoreNoteImages関数追加・修正 |
| script.js | handleProcessedImageにnoteImage処理追加 |
| index.html | 相場ノート画像エリアHTML変更 |

**解決したバグ**:

1. **詳細モーダルで画像が保存されない**
   - 原因: `showImageUploadOptions`が`tradeId`を渡していなかった
   - 解決: `ImageAddModalModule.open`を直接呼び、tradeIdを渡す

2. **相場ノートで画像枠が表示されない**
   - 原因: `restoreNoteImages`で枠が存在しない場合の処理がなかった
   - 解決: 枠が存在しない場合は動的に作成する処理を追加

3. **相場ノート画像選択後に表示されない**
   - 原因: `handleProcessedImage`に`noteImage`タイプの処理がなかった
   - 解決: `pendingImageType === 'noteImage'`の分岐を追加

4. **編集モードで画像枠が消える**
   - 原因: `editNote`内で`imagesContainer.innerHTML = ''`後に枠が再作成されなかった
   - 解決: `restoreNoteImages`を使用するように修正

5. **リロード時に確認ダイアログが出る**
   - 原因: `restoreNoteImages`から`removeNoteImageAt`呼び出し時にconfirmが実行された
   - 解決: `skipConfirm`引数を追加、内部呼び出し時は`true`を渡す

**教訓**:

1. **画像処理の統一パターン**: 枠を先に用意してから画像を配置する設計が堅牢
2. **pendingImageTypeの使い分け**: `tradeChart1/2/3`（新規エントリー・編集）、`noteImage`（相場ノート）、`null`（旧方式）
3. **確認ダイアログの設計**: ユーザー操作時のみ表示、内部処理（初期化・復元）ではスキップ、`skipConfirm`フラグで制御

---

#### ✅ 一括入力機能削除

**完了日**: 2025-11-29 | **工数**: 2h | **優先度**: CRITICAL

**削除理由**:
1. 統計の整合性問題（Pips情報欠落）
2. データ構造の複雑化（isBulkEntry判定）
3. Phase 1コンセプト（シンプル・初心者向け）

**影響範囲**:
- 削除ファイル: BulkImportModule.js
- 修正ファイル: 7ファイル（index.html, script.js, StatisticsModule.js, TradeDetail.js, TradeList.js, YenProfitLossModalModule.js, bridge.js）
- script.js: 223行削減
- 削除データ: 3件（トレード数53→50）

**教訓**:
1. **Phase 1ではシンプルさが最優先**: 機能削除は勇気がいるが、データ整合性の方が重要
2. **過去データ移行はPhase 2で**: 高度な機能として実装予定
3. **isBulkEntry判定の複雑化を回避**: 全コードで統一的な処理が可能に

---

#### ✅ 相場ノート機能改善（検索・月メモ）

**完了日**: 2025-11-27 | **工数**: 7h | **優先度**: MEDIUM

**実装内容**:
- キーワード検索機能（モーダル、ハイライト表示、結果からジャンプ）
- 月メモ機能（アノマリー：毎年共通、月次：年月別）
- 折りたたみ状態の永続化
- 日付選択⇔週間プレビュー完全連動

**修正ファイル**:
- NoteManagerModule.js（12メソッド追加）
- index.html（検索ボタン、月メモUI、モーダル追加）
- styles/3_notes.css（検索・月メモスタイル）
- styles/5_themes.css（ライトモード対応）
- styles/6_responsive.css（スマホ対応）

**新規LocalStorageキー**:
- `monthlyMemos` - 月メモデータ
- `monthlyMemoCollapseState` - 折りたたみ状態

**修正したバグ**:

| バグ | 原因 | 修正 |
|-----|------|------|
| 🔴 ノート保存がリロードで消える | `#save()`内で`window.saveNotes()`が古いデータで上書き | `window.saveNotes()`呼び出しを削除 |
| カレンダー⇔週間プレビュー連動しない | `noteDate`のonchangeで`loadNoteForDate()`のみ呼んでいた | `selectNoteDate()`に変更 |
| 週間プレビューがスクロール表示 | `.weekly-preview`にmax-height: 500px | max-height: noneに変更 |
| 折りたたみアイコン切替不具合 | CSSのtransformとJSが競合 | CSSのtransformを削除 |
| 日付変更時に月メモが更新されない | `setToday()`等に連動処理がない | `updateMonthlyMemoDisplay()`追加 |

**教訓**:
1. **保存処理の競合に注意**: モジュール化時に過渡期の互換性コードを残す場合、複数の保存関数が競合しないか確認
2. **UI連動は統合メソッドで**: 複数UIの連動は、統合的なメソッド（例: `selectNoteDate()`）を用意して一箇所で制御
3. **CSS vs JSの競合**: アイコン変更などはCSSかJSのどちらか一方に統一

**詳細**: 相場ノート機能改善_要件定義書_v2_0.md、docs/フォーム制御.md

---

#### ✅ Part 3 NoteManagerModule化

**完了日**: 2025-11-27 | **工数**: 2h | **優先度**: MEDIUM

**成果**:
- script.jsから1,400行削減
- 37関数をNoteManagerModuleにカプセル化
- EventBus 7イベント統合
- プライベートフィールドによるデータ保護

**実装パターン**:
- IIFE（即時実行関数式）でクラス定義をスコープ内に閉じ込め
- グローバル変数との同期（過渡期対応）
- window登録による既存コードとの互換性維持

**教訓**:
- script.jsに残ったコードがモジュールを上書きする問題
- IIFEパターンでクラス定義のグローバル漏れを防止
- 独立性の高いPartは一括削除が可能

---

#### ✅ Part 4削除（script.js完全版）

**完了日**: 2025-11-27 | **工数**: 1h | **優先度**: 🔴 CRITICAL

**実施内容**:
- script.jsからPart 4（AIプロンプト生成部門）を完全削除
- 関連するグローバル変数・関数・参照をすべて削除
- Part 4残骸（updateAIPromptFromPreview関数）も追加削除

**削除対象**:
| カテゴリ | 削除内容 |
|---------|---------|
| Part 4本体 | 4170-6294行（AIプロンプト生成部門全体） |
| Part 1変数 | postVariations, aiPromptVariations, rarityHistory, FEATURE_FLAGS, currentRarity, rarityLocked, promptSystemInitialized, promptElements |
| エラーハンドリング | FEATURE_FLAGS, rarityCache, RARITY_CONFIGの無視リスト |
| データエクスポート | raritySystem部分 |
| データインポート | raritySystem, rarityCache, sevenHeroesCache, sevenHeroesCollection, characterCache, featureFlags部分 |
| リセット処理 | キャッシュクリア処理 |
| SNS初期化 | initializePromptSystem呼び出し |
| 自動保存 | キャッシュ保存処理 |
| 残骸関数 | updateAIPromptFromPreview |

**結果**:
| 項目 | 値 |
|------|------|
| 元のファイル | 8,883行 |
| 削除後 | 6,617行 |
| 削減行数 | **2,266行（25.5%削減）** |
| エラー | 0件 |
| Part 4残骸 | 0件 |

**削除後のPart構成**:
```
Part 1: 基盤・初期化（1-1778行）
Part 2: トレード記録（1779-2731行）
Part 3: 相場ノート（2732-4126行）
Part 5B: 設定管理（4128-4592行）
Part 7: 収支管理（4593-6195行）
Part 8: 統計・レポート（6196-6618行）
```

**検証方法**:
```javascript
// Part 4削除 最終確認
(function() {
    console.log('=== Part 4削除 最終確認 ===');
    const deleted = ['updateAIPromptFromPreview', 'generateAIPromptsWithText', 'initializePromptSystem', 'RARITY_CONFIG'];
    let ok = true;
    deleted.forEach(name => {
        if (window[name]) { console.log(`❌ ${name} がまだ存在`); ok = false; }
    });
    const required = ['switchTab', 'showToast', 'TradeManager', 'eventBus', 'checkHoldingStatus'];
    required.forEach(name => {
        if (!window[name]) { console.log(`❌ ${name} が見つからない`); ok = false; }
    });
    if (ok) console.log('✅ Part 4削除完了！問題なし');
    return ok;
})();
```

**教訓**:
- 削除作業は包括的なデバッグコードで残骸を検出
- 関連するエクスポート/インポート/リセット処理も忘れずに削除
- checkHoldingStatusはPart 2の重要関数なので削除してはいけない

---

#### ✅ 設定タブ改善プロジェクト全Phase完了

**完了日**: 2025-11-26 | **工数**: 22h | **優先度**: HIGH

**実装内容**: 設定タブ3サブタブ化、ブローカー管理（25社プリセット）、お気に入り通貨ペア（53ペア対応）、新規エントリーフォーム強化（オートコンプリート）、EventBus統合

**ファイル**: SettingsModule.js, PRESET_BROKERS.js, PRESET_CURRENCY_PAIRS.js, broker-ui.js, favorite-pair-ui.js, entry-form-enhancement.js, TradeEdit.js

**テスト**: 26項目100%合格

**教訓**:
- Phase分割で複雑機能も着実に実装可能
- EventBusで疎結合リアルタイム同期
- SettingsModule依存はEventBus + setTimeoutフォールバック

---

#### ✅ 全タブ数字統一(17,557円ズレ解消)

| 項目 | 内容 |
|------|------|
| **完了日** | 2025-11-21 |
| **優先度** | 🔴 CRITICAL |
| **カテゴリ** | データ整合性・バグ修正 |
| **工数** | 実績2時間 |

**問題**: 各タブで円建て損益が17,557円ずれて表示される問題
- TradeManager(正しい値): 465,577円
- SummaryCalculatorModule: 448,020円
- StatisticsModule: 448,020円

**原因**: 未決済トレード4件(未決済なのに円建て損益が入っている)が計算に含まれていた
- 全トレード数: 48件(決済済み44件 + 未決済4件)
- SummaryCalculatorModuleとStatisticsModuleが全48件を対象にしていた
- 正しくは決済済み44件のみを計算すべき

---

## 🎓 Part V: ベストプラクティス集

### 教訓15: CSSデバッグの体系的アプローチ

**問題**: スタイルが効かない原因が分からない

**アプローチ**:
1. **計算値の確認**: `window.getComputedStyle(el)`で実際の値を確認
2. **インラインスタイル確認**: `el.getAttribute('style')`
3. **親要素チェーン**: 親要素のoverflow、heightを順に確認
4. **強制変更テスト**: `setProperty('height', '500px', 'important')`で効くか確認
5. **CSSルール検索**: `document.styleSheets`からマッチするルールを検索

**デバッグコード例**:
```javascript
// 高さが効かない原因を調査
const style = window.getComputedStyle(element);
console.log('計算済みheight:', style.height);
console.log('インラインstyle:', element.getAttribute('style'));

// 強制変更テスト
element.style.setProperty('height', 'auto', 'important');
console.log('変更後:', element.offsetHeight);
```

**重要**: 感覚で数値を変えるのではなく、まずデバッグで必要な値を計算する

---

### 教訓16: データ形式の不一致に注意

**問題**: 同じフィールドでも保存形式が異なる場合がある

**例**: ノートデータ
- メモ: `<br>`タグで改行
- 相場観: 改行文字`\n`で改行

**確認方法**:
```javascript
console.log('改行文字数:', (text.match(/\n/g) || []).length);
console.log('<br>の数:', (text.match(/<br>/gi) || []).length);
```

**対応**: 両方の形式に対応できる処理を実装
```javascript
// HTMLタグを改行文字に変換
text = text.replace(/<br\s*\/?>/gi, '\n');
// 改行文字で分割
const lines = text.split('\n');
```

---

### 教訓17: Canvas レスポンシブ判定（clientWidth使用）

**問題**: Canvasのレスポンシブ判定が正しく動作しない

**間違い**:
```javascript
// ❌ 内部解像度を見ている
const isMobile = canvas.width < 500;  // 760 < 500 = false
```

**正しい方法**:
```javascript
// ✅ 実際の表示サイズを見る
const displayWidth = canvas.clientWidth || canvas.width;
const isMobile = displayWidth < 500;  // 410 < 500 = true
```

**理由**: Canvasは高解像度ディスプレイ対応のため内部解像度（`canvas.width`）と表示サイズ（`canvas.clientWidth`）が異なる場合がある。レスポンシブ判定は必ず表示サイズで行う。

**重要**: 
- `canvas.width` / `canvas.height`: 内部解像度（描画用）
- `canvas.clientWidth` / `canvas.clientHeight`: 実際の表示サイズ（レスポンシブ判定用）

---

### 教訓18: CSS詳細度の競合確認

**問題**: CSSが適用されない、または意図しないスタイルが適用される

**よくある誤解**:
- ファイルが更新されていない
- キャッシュが原因
- ブラウザの問題

**実際の原因**: 同じファイル内でのCSS詳細度（specificity）の競合

**デバッグ手順**:
1. **計算値を確認**:
   ```javascript
   const style = window.getComputedStyle(element);
   console.log('実際の値:', style.backgroundColor);
   ```

2. **適用されているルールを確認**:
   - DevTools > Elements > Computed
   - どのCSSルールが勝っているか確認

3. **詳細度を理解**:
   ```
   優先順位（高い順）:
   1. !important
   2. インラインスタイル（style=""）
   3. ID (#id)
   4. クラス・属性・疑似クラス (.class, [attr], :hover)
   5. 要素・疑似要素 (div, ::before)
   ```

**よくあるパターン**:
```css
/* ファイル前半 - 詳細度: 10 */
.card {
    background: #fafafa;
}

/* ファイル後半 - 詳細度: 10（同じ） */
.card {
    background: rgba(255, 255, 255, 0.05);  /* こちらが勝つ（後勝ち） */
}
```

**解決方法**:
```css
/* より具体的なセレクタを使用 - 詳細度: 20 */
body.light-mode .card {
    background: #fafafa;  /* これが勝つ */
}
```

**重要**: 
- ファイル更新を疑う前に、まず詳細度の競合を確認
- 同じ詳細度の場合、後に書かれたルールが勝つ
- `!important`は最終手段（保守性が下がる）

---

### 教訓19: 標準化したら古いファイルも全て更新する

**問題**: データ構造を標準化しても、古いファイルが更新されず不整合が発生

**今回の事例**:
```
初期開発（script.js等）
    ↓ tradePL, swapPoints, netProfitLoss で実装

MODULES.md作成・標準化
    ↓ profitLoss, swap, netProfit に決定

新モジュール開発
    ↓ MODULES.md準拠で実装 ✅

古いファイルは更新されず... ❌
```

**混在していたファイル**:
- script.js - 古い命名
- YenProfitLossManager.js - 古い命名
- TradeEdit.js - 古い命名

**対策**:
1. **標準化時に全ファイル検索**: `grep -r "oldFieldName" *.js`
2. **一括更新**: 標準化と同時に全ファイルを更新
3. **MODULES.mdを唯一の真実として**: 新規実装時は必ず参照

**確認コマンド**:
```bash
# 古いフィールド名が残っていないか確認
grep -rn "tradePL\|swapPoints\|netProfitLoss" *.js | grep -v "yenProfitLoss"
```

---

### 教訓20: Supabase無料プランの1週間停止

**問題**: Supabase無料プランでは、**1週間非アクティブでプロジェクトが自動停止**される。

**症状**:
```
POST https://xxx.supabase.co/auth/v1/token net::ERR_NAME_NOT_RESOLVED
TypeError: Failed to fetch
```

**解決策**:
1. Supabaseダッシュボードにログイン
2. 該当プロジェクトを選択
3. 「Restore project」または「Resume」ボタンをクリック

**予防策**:
- 週1回はアクセスする
- リリース後はProプラン（$25/月）を検討

---

### 教訓21: 署名付きURL（Signed URL）の有効期限切れ

**問題**: Supabase Storageの署名付きURLには**有効期限**があり、期限切れで画像が見えなくなる。

**症状**:
- ノートや取引の画像が「壊れた画像」アイコンで表示
- コンソールで画像URLにアクセスすると403エラー

**原因**:
```javascript
// 署名付きURLの構造
https://xxx.supabase.co/storage/v1/object/sign/bucket/path?token=eyJ...

// tokenにはexp（有効期限）が含まれる
// デフォルトは1時間〜7日で期限切れ
```

**解決策**: imageUtils.js v1.1.0 で期限チェック＆自動更新機能を実装：

```javascript
// 期限チェック
window.isUrlExpired(img)  // true = 期限切れ

// 自動更新付き画像URL取得
const url = await window.getValidImageSrc(img);
// 期限切れなら自動でpathから新URLを取得
```

**重要**: 
- localStorageのURLを更新しても、**リロード時にSupabaseから古いURLで上書きされる**
- **Supabase側も同時に更新**する必要がある

---

### 教訓22: クラウド同期のデータフロー理解

**問題**: 「保存する」と「読み込む」は別問題。保存が動いていても、別デバイスで読み込めないケースがある。

**失敗例**:
```
【PC（データ作成元）】
ノート作成 → localStorage保存 → Supabaseに保存 ✅

【別デバイス】
ログイン ✅ → データが表示されない ❌
```

**原因**: AuthModuleにログイン後の**自動同期処理がなかった**。localStorageはデバイスごとに別なので、ログイン後にSupabaseからデータを取得する処理が必要。

**解決策**: AuthModule v1.2.0 で `syncAllDataFromCloud()` を追加：

```javascript
// ログイン後に自動実行
async syncAllDataFromCloud() {
    await SyncModule.syncTradesToLocal();
    await SyncModule.syncNotesToLocal();
    await SyncModule.syncExpensesToLocal();
    await SyncModule.syncCapitalRecordsToLocal();
    await SyncModule.syncUserSettingsToLocal();
}
```

---

### 教訓23: フィールド名の不一致問題（entryDatetime vs entryTime）

**問題**: 新規トレードの `entry_time` が Supabase に NULL で保存される。

**症状**:
- localStorageには時刻データがある
- Supabaseの `entry_time` が NULL
- トレード一覧のソート順がおかしくなる

**原因**: モジュール間でフィールド名が統一されていなかった。

| モジュール | 使用フィールド名 |
|-----------|----------------|
| TradeEntry.js | `entryDatetime` |
| SyncModule.js | `entryTime` |
| TradeManager | 変換処理なし ← 問題 |

**デバッグ方法**:
```javascript
// SyncModule.saveTradeをフックしてデータを確認
const originalSaveTrade = window.SyncModule.saveTrade.bind(window.SyncModule);
window.SyncModule.saveTrade = async function(localTrade) {
    console.log('=== saveTrade 呼び出し ===');
    console.log('entryTime:', localTrade.entryTime);
    console.log('entryDatetime:', localTrade.entryDatetime);
    return originalSaveTrade(localTrade);
};
```

**解決策**: TradeManager-nomodule.js の `_normalizeTradeData` に変換処理を追加：

```javascript
// entryTime の正規化（entryDatetime → entryTime）
if (!normalized.entryTime && trade.entryDatetime) {
    normalized.entryTime = trade.entryDatetime;
}
```

**教訓**:
- モジュール間のフィールド名マッピングを文書化する
- 正規化処理でエイリアス変換を確実に行う
- SyncModuleに渡す前のデータをフックで確認する習慣をつける

---

## 🔧 Part VI: よくある問題と解決策

### 問題: Supabase画像トラブルシューティング

**よくある画像表示トラブルと解決策**:

| 症状 | 原因 | 解決策 |
|------|------|--------|
| 全画像が見えない + コンソールに `ERR_NAME_NOT_RESOLVED` | プロジェクト停止 | Supabaseダッシュボードで再開 |
| 特定の画像が見えない + 403エラー | 署名付きURL期限切れ | `getValidImageSrc()` で再取得 |
| 別デバイスで画像が見えない | クラウド同期未実行 | ログイン後に `syncNotesToLocal()` |
| URL更新してもリロードで戻る | Supabase側が古いまま | Supabase側も更新が必要 |

**関連成果物**:

| 日付 | 成果物 | 内容 |
|------|--------|------|
| 2026-01-14 | imageUtils.js v1.1.0 | 署名付きURL期限自動更新 |
| 2026-01-14 | AuthModule v1.2.0 | ログイン時クラウド同期 |
| 2026-01-14 | NoteManagerModule | sync:notes:synced対応、getValidImageSrc使用 |

---

### 問題: Supabase同期のフィールド名トラブルシューティング

**データがSupabaseに正しく保存されない場合の診断**:

| 症状 | 確認方法 | 解決策 |
|------|---------|--------|
| 特定フィールドがNULL | SyncModule.saveTradeをフック | フィールド名マッピングを確認 |
| データが保存されない | コンソールでエラー確認 | SyncModule初期化状態を確認 |
| 古いデータで上書き | 複数環境の同時ログイン | 1環境だけでテスト |

**デバッグ用フックコード**:
```javascript
// SyncModule.saveTradeをフックしてデータを確認
const originalSaveTrade = window.SyncModule.saveTrade.bind(window.SyncModule);
window.SyncModule.saveTrade = async function(localTrade) {
    console.log('=== saveTrade 呼び出し ===');
    console.log('送信データ:', localTrade);
    return originalSaveTrade(localTrade);
};
```

**関連成果物**:

| 日付 | 成果物 | 内容 |
|------|--------|------|
| 2026-01-14 | TradeManager-nomodule.js | entryTime正規化追加 |

---

### 問題: text-overflow: ellipsis で文字が切れる

**症状**: 長いテキストが途中で切れて「...」になる

**原因**: 以下のCSS組み合わせ
```css
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap; /* または height固定 */
```

**解決**:
```css
.element {
    overflow: visible !important;
    text-overflow: clip !important;
    white-space: normal !important;
    height: auto !important;
}
```

---

### 問題: white-space で改行が効かない

**症状**: データには改行`\n`があるのに、表示では改行されない

**原因**: `white-space: normal`（デフォルト）は改行文字を無視

**解決**:
```css
.element {
    white-space: pre-wrap !important;  /* 改行を保持しつつ折り返し */
}
```

**white-spaceの値**:

| 値 | 改行文字 | 連続スペース | 自動折り返し |
|----|---------|-------------|-------------|
| normal | 無視 | 1つに | あり |
| nowrap | 無視 | 1つに | なし |
| pre | 保持 | 保持 | なし |
| pre-wrap | 保持 | 保持 | あり |
| pre-line | 保持 | 1つに | あり |

---

## 📚 Part VII: 参考情報

### モジュール構成(現在)

**完成済み**:
- Part 2: TradeManager, TradeEntry, TradeExit, TradeEdit, TradeDetail, TradeList, YenProfitLoss
- Part 7: BulkImport, ExpenseManager, ClosingManager, CSVExporter, SummaryCalculator
- Part 8: Statistics, Report, Chart

**未実装**:
- Part 1: ヘッダー・基本UI
- Part 3: 相場ノート
- Part 4: 削除済み(AI/SNS)
- Part 5: 設定
- Part 6: 削除済み(学習)

### タブ構成(最終形)

1. **📝 新規エントリー** - トレード入力フォーム
2. **📄 トレード記録** - 一覧、詳細表示・編集・削除
3. **📓 相場ノート** - ノート作成、カレンダー表示
4. **📊 分析** - Pips/円建て統計、レポート、チャート
5. **💰 収支管理** - 一括入力、経費管理、締め処理
6. **⚙️ 設定** - テーマ切替、データ管理

### 進捗サマリー

```
Part別モジュール化進捗:
Part 1: ────────── 対象外（基盤のため維持）
Part 2: ██████████ 100% ✅（bridge.js残存）
Part 3: ██████████ 100% ✅（NoteManagerModule完成）
Part 5: ██████████ 100% ✅（6ファイル完成）
Part 7: ██████████ 100% ✅（完全モジュール化）
Part 8: ██████████ 100% ✅（2,504行削減）

全体: █████████░ 90%（機能95%、構造90%）
```

**※ Part 1（基盤・初期化）について**:
- storage, showToast, switchTab等のグローバル基盤
- 全モジュールがグローバル関数として依存
- モジュール化リスク高、メリット少のため現状維持
- 一部EventBus統合済み、これ以上の変更は不要

**※ bridge.jsについて**:
- 47関数が依存する互換性レイヤー
- 旧グローバル関数→新モジュールへの橋渡し
- ファイルサイズ小（削除メリット少）、削除リスク高
- リリース後v1.1で検討（全コードがモジュール直接呼び出しに移行後）

### 次のステップ

**短期(1-2ヶ月)**:
- リリース準備
- パフォーマンス最適化
- レスポンシブ対応

**中期(3-6ヶ月)**:
- ユーザーフィードバック収集
- バグ修正、小機能追加
- Google Analytics分析

**長期(6ヶ月以上)**:
- AI機能開発開始
- 新規エントリー×トレード記録統合
- v2.0計画

---

## 🔶 Part VIII: 未解決の問題

### ✅ 解決済み: iPhone Safari編集ボタン問題

**発見日**: 2025-12-23  
**解決日**: 2025-12-23  
**ステータス**: ✅ 解決済み

**問題**: トレード詳細モーダル内の「エントリー情報」セクションの編集ボタン（`editBasicInfo`）のみ、iPhoneのSafariで動作しない。

**原因**: localStorageのbrokersデータが古い形式（配列のみ）で保存されていたため、SettingsModule.jsでデータ読み込み時にエラーが発生。

**解決方法**: SettingsModule.jsの`#loadBrokers()`にデータ形式検証と自動マイグレーション処理を追加。

→ **詳細は [エントリー情報「編集」ボタン問題解決](#エントリー情報編集ボタン問題解決) を参照**

---

### 調査記録（参考）

以下は解決前の調査記録です。

**現象**:

トレード詳細モーダル内の「エントリー情報」セクションの編集ボタン（`editBasicInfo`）のみ、iPhoneのSafariで動作しない。

| 項目 | 状況 |
|------|------|
| PC Chrome | ✅ 正常動作 |
| PC Chrome モバイルエミュレーション | ✅ 正常動作 |
| iPhone Safari - エントリー情報ボタン | ❌ 動作しない |
| iPhone Safari - 他の編集ボタン | ✅ 正常動作 |

**調査結果**:

| 確認項目 | 結果 |
|---------|------|
| HTML構造 | 全ボタン同じ構造 ✅ |
| CSS設定 | 全ボタン同じ ✅ |
| JavaScript関数定義 | 正常（`typeof editBasicInfo === 'function'`）✅ |
| onclick属性 | `onclick="editBasicInfo('...')"` ✅ |
| pointer-events | auto ✅ |
| z-index | 10 ✅ |
| display | block ✅ |
| visibility | visible ✅ |
| ボタンの反応 | 押された感覚はある（視覚的フィードバックあり）|

**試した対策（効果なし）**:

1. **CSSプロパティ追加**（6_responsive.css）
   - `touch-action: manipulation`
   - `-webkit-tap-highlight-color`
   - `cursor: pointer`
   - `-webkit-user-select: none`
   → 効果なし

2. **モーダルスクロール後にタップ**
   → 効果なし

3. **ボタン周辺をタップ**
   → 効果なし

**試していない対策**:

1. **MacBook + iPhone でSafari Web Inspectorを使用**
   - iPhoneのコンソールログを直接確認
   - タップイベントが発火しているか確認
   - 要素の重なりを確認

2. **onclick属性の変更**
   - `onclick="editBasicInfo(...)"` → `onclick="window.editBasicInfo(...)"`
   - TradeDetail.jsの修正が必要

3. **イベントリスナー方式への変更**
   - onclick属性 → addEventListener
   - 大規模な変更が必要

**HTMLの比較（全て同じ構造）**:
```html
<button class="edit-button" onclick="editBasicInfo('...')">
    📍 エントリー情報
    <span class="edit-icon">編集</span>
</button>

<button class="edit-button" onclick="editChecklistInfo('...')">
    🎯 チェックリスト
    <span class="edit-icon">編集</span>
</button>
```

**関連ファイル**:
- TradeDetail.js: showTradeDetail()メソッド（HTMLテンプレート生成）
- bridge.js: window.editBasicInfo関数定義
- 6_responsive.css: モバイル用スタイル

**仮説**:

1. **iPhoneのSafari特有のバグ**
   - 同じ構造なのに1番目だけ動かないのは不自然
   
2. **見えない要素の重なり**
   - PCでは問題ないがiPhoneでのみ発生
   - Safari Web Inspectorで確認が必要

3. **タイミング問題**
   - モーダル表示時のDOM更新タイミング
   - 1番目のボタンだけ何らかの理由でイベントが設定されない

**解決に必要なもの**:
- **MacBook + iPhone**（Safari Web Inspector）
- または、**同様の経験がある開発者**からの情報

**回避策**:
- PCから編集する（PCでは正常動作）

---

*最終更新: 2026-01-15 | ドキュメントバージョン: 5.0.3（Phase 5テスト完了追加）*
