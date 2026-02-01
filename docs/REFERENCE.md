# REFERENCE.md - Trading Complete 参考資料・運用ガイド
*更新日: 2026-02-01 | 用途: 開発ガイドライン・完了履歴・ベストプラクティス*

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
| **01/17-23** | **画像説明欄追加機能（Phase 1-8完了）** | **MEDIUM** | **7日間** | **画像に題名・説明追加、全画面表示、モーダル統合** | [詳細](#画像説明欄追加機能) |
| **01/22** | **imageUtils.js v1.3.0リリース** | **HIGH** | **1h** | **v1.1.0+v1.2.0統合、URL期限切れ自動更新対応** | [詳細](#教訓24-imageutilsjsバージョン管理と画像データ構造) |
| **01/24** | **6_responsive.css 画像モーダル・iOS自動ズーム対応** | **MEDIUM** | **2h** | **拡大モーダル編集ボタン、詳細モーダル題名表示、iOS自動ズーム防止** | [詳細](#6_responsivecss-修正2026-01-24) |
| **01/25** | **画像コメント改行・横幅問題修正** | **LOW** | **1h** | **スマホ表示時のキャプション幅をvw単位で修正（129px→387px）** | [詳細](#画像コメント改行横幅問題修正2026-01-25) |
| **01/29-02/01** | **トレード分析強化（全6Phase完了）** | **CRITICAL** | **17日間** | **許容損失・手法管理・振り返り強化・バッジ表示・分析拡張・AIサマリー基盤** | [詳細](#トレード分析強化全phase完了) |

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
- 🖼️ **画像説明欄追加機能（01/17-23）: 題名・説明追加、全画面表示、Supabase同期対応**
- 📦 **imageUtils.js v1.3.0: v1.1.0+v1.2.0統合、URL期限切れ自動更新対応**
- 📱 **6_responsive.css修正（01/24）: 拡大モーダル編集ボタン、題名表示、iOS自動ズーム防止**
- 📱 **画像コメント改行・横幅問題修正（01/25）: スマホ表示時のキャプション幅をvw単位で修正**
- 🎯 **トレード分析強化（01/29-02/01）: 許容損失・手法管理・振り返り強化・バッジ表示・分析拡張・AIサマリー基盤**

---

### 完了タスク詳細

#### ✅ 画像コメント改行・横幅問題修正（2026-01-25）

**日付**: 2026-01-25 | **工数**: 1h | **優先度**: LOW

**問題**:
- スマホ表示時に画像コメント（説明欄）の幅が129pxと狭い
- コメント枠の折り返しが多く段が増える

**原因**:
- `%`単位は親要素（画像幅257px）基準のため、画像が小さいとキャプションも縮小

**解決策**:
- `vw`単位（ビューポート幅基準）に変更

**修正ファイル**: 6_responsive.css（4545〜4550行目付近）

| 修正前 | 修正後 |
|--------|--------|
| `max-width: 95%` | `max-width: 95vw` |
| `width: 90%` | `width: 90vw` |

**効果**: キャプション幅 129px → 387px に改善

**関連**: 画像説明欄追加_要件定義書_v2_1.md

---

### トレード分析強化（全Phase完了）

**完了日**: 2026-02-01  
**工数**: 17日間（2026-01-16 〜 2026-02-01）  
**優先度**: CRITICAL  
**詳細**: トレード分析強化_要件定義書_ロードマップ_v1_16_最終版.md

**コンセプト**: 「記録するだけ」→「成長できるシステム」への進化

**実装した6機能**:

| 機能 | Phase | 内容 |
|------|-------|------|
| 許容損失管理 | 1 | 1トレードあたりの許容損失を設定、リスク管理の習慣化 |
| 手法管理 | 1 | 手法を登録・選択、手法別の成績分析が可能に |
| 振り返り強化 | 3 | 「ルールを守れたか」の記録、規律の可視化 |
| バッジ表示 | 4 | トレード一覧に手法・リスク・ルール遵守のバッジ表示 |
| 分析タブ拡張 | 5 | ルール遵守別・許容損失別・手法別の成績分析セクション |
| AIサマリー基盤 | 6 | 将来のAIアシスタント機能のためのデータ集計基盤 |

**Phase別完了状況**:

| Phase | 内容 | タスク数 | 完了日 |
|-------|------|---------|--------|
| 1 | 設定機能（許容損失・手法） | 10 | 01/29 |
| 2 | エントリー画面（リスク管理・手法選択） | 8 | 01/29 |
| 3 | 決済・振り返り | 4 | 01/29 |
| 4 | 一覧・分析（バッジ・フィルター） | 6 | 01/30 |
| 5 | 分析タブ拡張 | 3 | 01/30 |
| 6 | AI参照用サマリー基盤 | 4 | 02/01 |

**進捗**: 100% (34/34タスク) 🎊

**修正ファイル**:

| ファイル | 主な変更 |
|----------|----------|
| SettingsModule.js | 許容損失・手法管理API追加 |
| entry-form-enhancement.js | リスク管理セクションUI |
| TradeEntry.js | 新フィールド保存（methodId, toleranceAmount等） |
| TradeExit.js | 振り返り（ルール遵守）保存 |
| TradeList.js | バッジ表示（手法・リスク・ルール） |
| ReportModule.js | ルール遵守・リスク分析セクション |
| 6_responsive.css | スマホ横スクロール対応 |
| **AISummaryModule.js** | **新規作成（AI参照用サマリー基盤）** |

**追加バグ修正**:
- 期間適用バグ修正（ReportModule.js 3箇所）
- ブローカーバッジon/off修正（script.js, TradeList.js）
- imageUtils.js警告レベル修正

**教訓**:
- 遅延取得パターン: constructor時点で他モジュールが未初期化の場合、使用時に`window.XxxModule`で取得
- MODULES.md準拠の徹底: プライベートフィールド(#)、EventBus統合、getStatus()実装
- 段階的実装: Phase分割で確実に進捗、各Phase完了後に動作確認

---

#### ✅ 6_responsive.css 修正（2026-01-24）

**日付**: 2026-01-24 | **工数**: 2h | **優先度**: MEDIUM

**ファイルサイズ**: 4,628行 → 4,743行（+115行）

**修正内容**:

| # | 対象 | 内容 |
|---|------|------|
| 1 | 拡大モーダル編集ボタン | `.modal-caption-edit` 鉛筆ボタン、丸型半透明背景 |
| 2 | トレード詳細モーダル | `.detail-image-item` flexbox化、題名ellipsis対応 |
| 3 | ノート編集画面 | `.note-image-item .note-image-title` オーバーレイ表示 |
| 4 | 画像編集モーダル | `#changeImageInEditBtn` 画像変更ボタン |
| 5 | 画像モーダル統一 | `.preview-image-container`, `.delete-image-btn` |
| 6 | iOS自動ズーム防止 | 設定タブ入力フィールド font-size: 16px |

**iOS自動ズーム防止の詳細**:

| ブレークポイント | 対象 | 修正前 | 修正後 |
|-----------------|------|--------|--------|
| 768px以下 | 設定タブ input | 0.9rem | 16px |
| 480px以下 | 設定タブ input | 0.85rem | 16px |
| 480px以下 | セルフイメージ input | 0.8rem | 16px |
| 480px以下 | セルフイメージ date | 0.65rem | 16px |
| 360px以下 | 設定タブ input | 0.8rem | 16px |
| 360px以下 | セルフイメージ input | 0.75rem | 16px |
| 360px以下 | セルフイメージ date | 0.6rem | 16px |

**効果**: 自動ズーム❌ / ピンチズーム✅

---

#### ✅ 画像説明欄追加機能（2026-01-17〜23）

**完了日**: 2026-01-17〜2026-01-23（7日間）  
**優先度**: MEDIUM  
**成果物**: 要件定義書 v1.8

**実装内容（Phase 1-8）**:

| Phase | 内容 | 状態 |
|-------|------|------|
| 1 | 基盤実装（imageUtils.js拡張） | ✅ 完了 |
| 2 | 新規エントリータブUI | ✅ 完了 |
| 3 | トレード記録一覧での題名表示 | ✅ 完了 |
| 4 | 詳細モーダルでの表示 | ✅ 完了 |
| 5 | 拡大モーダルでの編集機能 | ✅ 完了 |
| 6 | 相場ノート対応 | ✅ 完了 |
| 7 | Supabase同期・URL期限切れ対応 | ✅ 完了 |
| 8 | 画像モーダル統合・デザイン統一 | ✅ 完了 |

**修正ファイル**:
- imageUtils.js v1.3.0（v1.1.0+v1.2.0統合）
- TradeEntry.js, TradeDetail.js, TradeList.js
- NoteManagerModule.js
- SyncModule.js
- 6_responsive.css

---

#### ✅ Phase 5: 統合テスト・本番準備（2026-01-15）

**完了日**: 2026-01-15

| Step | 内容 | 結果 |
|------|------|------|
| 5.1 | 機能テスト（12項目） | ✅ 合格 |
| 5.2 | セキュリティテスト（3項目） | ✅ 合格 |
| 5.3 | エッジケーステスト（3項目） | ✅ 合格（1件制限あり） |
| 5.4 | 本番環境準備確認 | ✅ 合格 |

**既知の制限（リリースノート記載）**:
1. オフライン中の保存はリロードで消失（v1.1対応予定）
2. iOS Safari goalsボタン問題（調査中）

---

#### ✅ レスポンシブ改善（2026-01-15）

**日付**: 2026-01-15 | **工数**: 4h | **優先度**: MEDIUM

**修正ファイル**: 6_responsive.css, 1_base.css, NoteManagerModule.js, TradeExit.js

**主な修正内容**:
- ヘッダーレイアウト横並び維持
- 週間プレビュー max-height 85px→120px
- 決済入力フィールド幅統一
- 画像サムネイルサイズ固定

**教訓**:
- CSS優先度: インラインスタイル > 外部CSS。`!important`で強制適用が必要な場合がある
- iOS対応: `window.scrollY === 0`が完全に0にならない場合がある。`<= 5`で判定

---

#### ✅ Pull-to-Refresh実装（2026-01-15）

**日付**: 2026-01-15 | **工数**: 1h | **優先度**: LOW

**機能**: ページ最上部で下スワイプでリロード、緑色インジケーター表示、iOS対応

**実装ファイル**: script.js - `initPullToRefresh()`関数追加

---

#### ✅ 決済記録モーダル改善（2026-01-15）

**日付**: 2026-01-15 | **工数**: 1h | **優先度**: MEDIUM

**修正内容**:
- 参考情報を2列レイアウトに変更
- プレースホルダーテキストを短縮

**修正ファイル**: TradeExit.js

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

### 2025年11-12月 アーカイブ（詳細サマリー）

以下は2025年11-12月の主要完了タスクのサマリーです。

#### デプロイ・インフラ
- **GitHub Pages公開（12/14）**: tradingcomplete.com本番公開、Netlifyから移行（無制限デプロイ）
- **エクスポート/インポートv7.0（12/17）**: 経費・入出金・月間メモ・ブローカー・テーマ追加

#### UI/UX改善
- **ライトモードCSS完全対応（12/12-14）**: 統一カラーシステム、全タブ対応、約1,780行
- **レスポンシブ対応（12/11-13）**: 全6タブ、5ブレークポイント（1024/768/480/360/横向き）、約3,040行
- **相場ノート エディタ機能強化（12/21）**: 空行保持、取消線・緑・サイズ追加、CSS変数化

#### データ整合性・バグ修正
- **全タブ数字統一（11/21）**: 17,557円ズレ解消、未決済トレード除外
- **円建て損益保存バグ完全解決（11/10）**: 150円ズレ解消、2日間の調査
- **MODULES.md準拠 全モジュール統一（12/22）**: yenProfitLossフィールド名7ファイル修正
- **週次分析 上部・下部不一致修正（12/22）**: handlePeriodChange追加、isoWeek修正
- **エントリー情報「編集」ボタン問題解決（12/23）**: localStorageデータ形式不整合修正

#### モジュール化・コード削減
- **Part 3 NoteManagerModule化（11/27）**: 1,400行削減、37関数カプセル化
- **Part 4削除（11/27）**: script.js 2,266行削減（25.5%）
- **一括入力機能削除（11/29）**: 223行削減、統計整合性確保
- **Week 7 コード最適化（12/17）**: script.js 8,883行→5,029行（43%削減）

#### 機能追加
- **設定タブ改善全Phase完了（11/26）**: 全26テスト項目100%合格、EventBus統合
- **月次カレンダー機能（11/16）**: 日別損益の視覚化、テスト100%合格
- **相場ノート機能改善（11/27）**: 検索機能、月メモ機能追加
- **画像表示統一（12/11）**: 詳細モーダル・相場ノートで統一UI

**2025年の主な教訓**:
- 標準化したら古いファイルも全て更新する
- index.htmlにロジックを追加せず、モジュールに集約する
- localStorageデータは形式検証と自動マイグレーションを実装する
- CSS詳細度の理解：同じ`!important`でもセレクタの強さで勝敗が決まる
- Canvas判定は`clientWidth`（表示サイズ）を使用する

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

### 教訓24: imageUtils.jsバージョン管理と画像データ構造

**問題**: v1.2.0作成時にv1.1.0の機能（URL期限切れ処理）を含めなかったため、画像が消える問題が発生。

**現行バージョン**: v1.3.0（2026-01-22）  
**配置**: js/utils/imageUtils.js

**重要なルール**:
- バージョンアップ時は前バージョンの全機能を含めること
- 単一ファイルで全機能を管理
- 機能マージ漏れに注意

**画像データ必須フィールド**:

```javascript
{
    url: "署名付きURL",                    // 表示用（期限あり）
    path: "userId/trades/xxx/chart1.jpg",  // 復元用（必須）
    title: "エントリー時の日足",            // 題名（最大30文字）
    description: "サポートラインブレイク"   // 説明（最大100文字）
}
```

**pathフィールドの重要性**: `path`がないと期限切れ時に復元不可能（画像消失）。

**URL期限切れ対応**: Supabase署名付きURLはデフォルト1時間で期限切れ。`getValidImageSrc()`で自動更新。

---

### 教訓25: 関数の単一責任原則

**問題**: `closeImageAddModal`が「モーダルを閉じる」と「状態リセット」の2つの責任を持っていたため、予期しない副作用が発生。

**解決策**: 関数は単一の責任のみを持つべき。複数の処理が必要な場合は、それぞれ別の関数に分離する。

---

### 教訓26: データ形式の一貫性

**問題**: `createImageData`に渡すデータ形式が一貫していなかったため、二重ネスト問題が発生。

**解決策**: 関数に渡す前にデータ形式を正規化する。入力データの検証を必ず行う。

---

### 教訓27: データ取得元の優先順位

**問題**: NoteManagerModuleが旧形式を返す一方、tempNoteEditImagesには新形式が保存されていた。

**解決策**: 編集中のデータは一時変数（temp〜）から優先取得する。データソースの優先順位を明確にドキュメント化する。

---

### 教訓28: iOS自動ズーム防止（font-size: 16px）

**問題**: iOSのSafariで入力フィールドをタップすると、自動的にズームされてしまう。

**原因**: iOSは`font-size`が16px未満の入力フィールドをタップすると、ユーザビリティのために自動ズームする。

**解決策**:
```css
/* iOSで入力時の自動ズームを防ぐ */
input[type="text"],
input[type="date"],
textarea,
select {
    font-size: 16px !important;
}
```

**注意点**:
- `rem`や`em`ではなく、明示的に`16px`を指定
- ピンチズーム（ユーザー操作）は引き続き可能

---

### 教訓29: 遅延取得パターン（モジュール間依存）

**問題**: constructor内で他モジュールを参照すると、初期化順序によってはnullになる。

```javascript
// ❌ 問題: SettingsModuleがまだ初期化されていない可能性
constructor() {
    this.#settingsModule = window.SettingsModule; // null!
}
```

**解決策**: 使用時に取得する（遅延取得）。

```javascript
// ✅ 解決: 使用する時点で取得
generateSummary() {
    const settingsModule = window.SettingsModule; // この時点では初期化済み
    const method = settingsModule?.getMethodById(methodId);
}
```

**適用場面**: 
- AISummaryModule → SettingsModule参照
- 初期化順序が不明確なモジュール間の依存

---

### 教訓30: 段階的Phase実装の効果

**問題**: 大規模機能を一度に実装すると、問題発生時の原因特定が困難。

**解決策**: Phase分割で段階的に実装。

```
Phase 1: 設定機能    → 動作確認 ✅
Phase 2: エントリー  → 動作確認 ✅
Phase 3: 決済・振り返り → 動作確認 ✅
...
```

**効果**:
- 各Phaseで動作確認 → バグの早期発見
- 進捗が可視化される → モチベーション維持
- 問題発生時の切り分けが容易

**実績**: トレード分析強化（34タスク、6Phase、17日間）を100%完了

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
| 2026-01-22 | imageUtils.js v1.3.0 | v1.1.0+v1.2.0統合、画像説明欄対応 |
| 2026-01-24 | 6_responsive.css | 画像モーダル・iOS自動ズーム対応（+115行） |
| 2026-01-25 | 6_responsive.css | 画像コメント改行・横幅問題修正（vw単位に変更） |

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
- Part 8: Statistics, Report, Chart, **AISummary**

**未実装**:
- Part 1: ヘッダー・基本UI
- Part 3: 相場ノート
- Part 4: 削除済み(AI/SNS)
- Part 5: 設定
- Part 6: 削除済み(学習)

### タブ構成(最終形)

1. **📝 新規エントリー** - トレード入力フォーム、**リスク管理セクション、手法選択**
2. **📄 トレード記録** - 一覧、詳細表示・編集・削除、**バッジ表示（手法・リスク・ルール）**
3. **📓 相場ノート** - ノート作成、カレンダー表示
4. **📊 分析** - Pips/円建て統計、レポート、チャート、**ルール遵守・リスク分析**
5. **💰 収支管理** - 経費管理、締め処理
6. **⚙️ 設定** - テーマ切替、データ管理、**許容損失設定、手法管理**

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

**発見日**: 2025-12-23 | **解決日**: 2025-12-23

**問題**: エントリー情報の編集ボタンがiPhone Safariで動作しない  
**原因**: localStorageのbrokersデータが古い形式（配列のみ）  
**解決**: SettingsModule.jsの`#loadBrokers()`にデータ形式検証と自動マイグレーション処理を追加

→ 詳細は [エントリー情報「編集」ボタン問題解決](#エントリー情報編集ボタン問題解決) を参照

---

*最終更新: 2026-02-01 | ドキュメントバージョン: 5.3.0（トレード分析強化全Phase完了）*
