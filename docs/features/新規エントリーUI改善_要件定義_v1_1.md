# 新規エントリーUI改善 - 要件定義書 v1.2

**作成日**: 2025-11-12  
**最終更新**: 2025-11-12 21:00  
**優先度**: MEDIUM（Week 5タスク）  
**目標**: エントリー情報入力の統一性向上とブローカー情報の適切な配置  
**進捗**: Phase 1 - ✅ 100%完了（2025-11-12）

---

## 📋 目次

1. [背景・目的](#背景目的)
2. [現状分析](#現状分析)
3. [改善内容](#改善内容)
4. [影響範囲](#影響範囲)
5. [実装計画](#実装計画)
6. [データ構造変更](#データ構造変更)
7. [UI設計](#ui設計)
8. [動作確認項目](#動作確認項目)
9. [🆕 進捗報告](#進捗報告)
10. [🆕 判明した問題と解決策](#判明した問題と解決策)

---

## 📌 背景・目的

### 背景
- 現在、ブローカー選択は「決済情報編集時」に行っているが、実際にはエントリー時点でブローカーは決定している
- 新規エントリーフォームとエントリー情報編集モーダルの配置が異なり、ユーザーが混乱する可能性がある
- トレード詳細モーダルにまだトレードアイコンが残っている（削除済みのはずだが表示されている）

### 目的
1. **情報の適切な配置**: ブローカー選択をエントリー情報に移動
2. **UI統一性の向上**: 新規エントリー、エントリー情報編集、円建て損益編集の配置を統一
3. **将来の拡張準備**: 設定タブでの通貨ペア・ブローカー登録機能との連携準備
4. **トレードアイコン完全削除**: トレード詳細モーダルからも削除し、チャート画像3枚に統一

---

## 🔍 現状分析

### 1. 新規エントリーフォーム（現状）

**配置**: 横2×縦3.5（7項目） → **✅ 修正完了: 横2×縦4（8項目）**

| 列1 | 列2 |
|-----|-----|
| 通貨ペア / 商品 | 売買方向 |
| ブローカー ✅ | エントリー日時 |
| エントリー価格 | ロットサイズ |
| 損切り価格 | 利確目標価格 |

**修正完了項目**:
- ✅ ブローカー入力欄追加
- ✅ 横2×縦4のグリッドレイアウト
- ✅ 入力順序重視型の配置

---

## 🎯 改善内容

### 改善1: 新規エントリーフォーム（横2×縦4）

**✅ 実装完了**

**採用案**: 入力順序重視型

| 列1 | 列2 |
|-----|-----|
| 1. 通貨ペア / 商品 ✅ | 2. 売買方向 ✅ |
| 3. ブローカー ✅ | 4. エントリー日時 ✅ |
| 5. エントリー価格 ✅ | 6. ロットサイズ ✅ |
| 7. 損切り価格 ✅ | 8. 利確目標価格 ✅ |

---

## 📂 影響範囲

### 修正が必要なファイル

| # | ファイル | 修正内容 | 優先度 | 状態 |
|---|---------|---------|--------|------|
| 1 | `styles.css` | グリッドレイアウト（3列→2列） | HIGH | ✅ 完了 |
| 2 | `index.html` | 新規エントリーフォームのHTML構造変更 | HIGH | ✅ 完了 |
| 3 | `TradeEntry.js` | #collectFormData に broker 追加 | HIGH | ✅ 完了 |
| 4 | **`bridge.js`** | **window.saveTradeRecord に broker 追加** | **CRITICAL** | **✅ 完了** |
| 5 | `TradeEdit.js` | エントリー情報編集モーダルのHTML生成部分 | HIGH | ⏳ 未着手 |
| 6 | `YenProfitLossModalModule.js` | 編集モーダルのHTML生成部分 | HIGH | ⏳ 未着手 |
| 7 | `TradeDetail.js` | トレード詳細モーダルの画像セクション | HIGH | ⏳ 未着手 |
| 8 | `TradeManager-nomodule.js` | データ構造にbroker追加（確認） | MEDIUM | ✅ 確認済み |
| 9 | `script.js` | 画像処理にtradeChart3追加 | MEDIUM | ⏳ 未着手 |

---

## 📅 実装計画

### ✅ Step 1: データ構造確認（30分）- 完了

**作業内容**:
- ✅ TradeManager-nomodule.jsでbrokerフィールドの扱いを確認
- ✅ 既存データとの互換性確認
- ✅ 互換性確保の方針決定（オプショナルフィールドとして扱う）

**成果物**:
- ✅ データ構造確認レポート
- ✅ 互換性確保の方針決定

**完了日**: 2025-11-12

---

### ✅ Step 2: 新規エントリーフォーム修正（1-2時間）- 完了

**作業内容**:
1. ✅ styles.css の grid-template-columns 修正（3列→2列）
2. ✅ index.html のグリッド構造変更（横2×縦4）
3. ✅ index.html に broker 入力欄追加
4. ✅ TradeEntry.js の #collectFormData に broker フィールド追加

**成果物**:
- ✅ 修正済み styles.css
- ✅ 修正済み index.html
- ✅ 修正済み TradeEntry.js
- ✅ UI表示確認完了

**完了日**: 2025-11-12

**動作確認結果**:
```
✅ broker フィールドが表示される
✅ 横2×縦4のグリッドレイアウト（1fr 1fr）
✅ 配置順序が正しい（入力順序重視型）
✅ broker に値を入力できる
✅ フォームから値を取得できる
```

---

### ✅ Step 2.5: bridge.js 修正（30分）- 完了

**⚠️ 判明した問題**:
- TradeEntry.js の #collectFormData には broker が追加されている
- しかし、実際に呼ばれているのは **bridge.js の window.saveTradeRecord**
- bridge.js の formData 作成部分に broker がないため、undefined で保存される

**作業内容**:
1. ✅ bridge.js の window.saveTradeRecord 関数修正
2. ✅ formData に broker フィールド追加
3. ✅ 動作確認・テスト完了

**修正箇所**:
```javascript
// bridge.js - window.saveTradeRecord
formData = {
    symbol: document.getElementById('pair')?.value || '',
    direction: document.getElementById('direction')?.value || 'long',
    broker: document.getElementById('broker')?.value?.trim() || '',  // ← 追加
    entryDatetime: document.getElementById('entryTime')?.value || '',
    // ...
};
```

**成果物**:
- ✅ 修正済み bridge.js
- ✅ broker 保存確認完了（broker: "XM Trading" ✅）

**完了日**: 2025-11-12

**動作確認結果**:
```
✅ broker: XM Trading
✅ symbol: EUR/USD
✅ direction: long
✅ localStorage に正常保存
```

---

### ⏳ Step 3: エントリー情報編集モーダル修正（1-2時間）

**作業内容**:
1. TradeEdit.jsのeditBasicInfo()メソッド修正
2. HTMLテンプレート変更（グリッド化）
3. ブローカー情報の表示・編集対応
4. saveBasicInfo()保存処理の修正

**成果物**:
- 修正済みTradeEdit.js（editBasicInfo, saveBasicInfo）
- 動作確認完了

---

### ⏳ Step 4: 円建て損益編集モーダル修正（30分-1時間）

**作業内容**:
1. YenProfitLossModalModule.jsのedit()メソッド修正
2. HTMLテンプレート変更（縦一列化）
3. ブローカー入力欄削除
4. CSS調整

**成果物**:
- 修正済みYenProfitLossModalModule.js
- 動作確認完了

---

### ⏳ Step 5: トレード詳細モーダル修正（1-2時間）

**作業内容**:
1. TradeDetail.jsのshowTradeDetail()メソッド修正
2. トレードアイコンセクション削除
3. チャート画像3枚対応
4. 画像変更・削除処理の修正

**成果物**:
- 修正済みTradeDetail.js
- 動作確認完了

---

### ⏳ Step 6: 画像処理の完全対応（1時間）

**作業内容**:
1. script.jsにtradeChart3処理追加
2. TradeEntry.jsの画像収集処理修正
3. ImageHandlerの確認

**成果物**:
- 修正済みscript.js
- 修正済みTradeEntry.js
- 3枚すべての画像が正常に保存・表示される

---

### ⏳ Step 7: 統合テスト（1-2時間）

**作業内容**:
1. すべての動作確認項目をチェック
2. バグ修正
3. エッジケーステスト

**成果物**:
- テストレポート
- バグ修正完了
- ✅完了マーク

---

### ⏳ Step 8: ドキュメント更新（15分）

**作業内容**:
- TASKS.md更新（タスク完了）
- MODULES.md更新（新モジュール追加）
- REFERENCE.md更新（完了履歴・教訓）

---

## 🆕 進捗報告

### 📊 全体進捗: 95% → broker保存のみ残課題

| Phase | 進捗 | 状態 |
|-------|------|------|
| UI実装 | 100% | ✅ 完了 |
| データ収集（TradeEntry.js） | 100% | ✅ 完了 |
| データ収集（bridge.js） | 0% | 🔄 作業中 |
| エントリー情報編集 | 0% | ⏳ 未着手 |
| 円建て損益編集 | 0% | ⏳ 未着手 |
| トレード詳細 | 0% | ⏳ 未着手 |
| 画像処理 | 0% | ⏳ 未着手 |

---

## 🆕 判明した問題と解決策

### 🔍 問題1: broker が undefined で保存される

**現象**:
```
フォーム入力: broker = "XM Trading" ✅
保存データ: broker = undefined ❌
```

**原因**:
1. ✅ index.html に broker フィールドは存在
2. ✅ TradeEntry.js の #collectFormData に broker は追加済み
3. ❌ **実際に呼ばれているのは bridge.js の window.saveTradeRecord**
4. ❌ **bridge.js の formData 作成部分に broker がない**

**データフロー（判明した実態）**:
```
index.html「エントリー記録を保存」ボタン
  ↓ onclick="saveTradeRecord()"
window.saveTradeRecord (bridge.js)  ← ここが実際に呼ばれる
  ↓ formData 作成（broker なし）
TradeEntry.js.saveTradeRecord(formData)
  ↓ #prepareTradeData
TradeManager.addTrade(tradeData)
  ↓
localStorage保存（broker: undefined）
```

**解決策**:
```javascript
// bridge.js の window.saveTradeRecord 修正
formData = {
    symbol: document.getElementById('pair')?.value || '',
    direction: document.getElementById('direction')?.value || 'long',
    broker: document.getElementById('broker')?.value?.trim() || '',  // ← 追加
    entryDatetime: document.getElementById('entryTime')?.value || '',
    // ...
};
```

---

### 🔍 問題2: キャッシュではなく実装の問題

**検証結果**:
- ブラウザをリロードしても broker = undefined
- TradeEntry.js は正しく修正されている
- しかし、bridge.js を経由するため反映されない

**教訓**:
- **データフローの追跡が重要**
- 「どの関数が実際に呼ばれているか」を確認する
- モニタリング技法: `TradeManager.prototype.addTrade` を上書きして確認

---

## 🧪 動作確認デバッグコード

### 1. フォーム値の確認
```javascript
// 保存前に実行
const brokerValue = document.getElementById('broker')?.value;
console.log('broker input の値:', brokerValue);
```

### 2. TradeManager へ渡されるデータの確認
```javascript
// 保存前に実行（モニタリング設定）
const originalAddTrade = TradeManager.prototype.addTrade;
TradeManager.prototype.addTrade = function(tradeData) {
    console.log('=== TradeManager.addTrade に渡されたデータ ===');
    console.log('broker:', tradeData.broker);
    return originalAddTrade.call(this, tradeData);
};
```

### 3. 保存後のデータ確認
```javascript
// 保存後に実行
(function() {
    const tradesData = localStorage.getItem('trades');
    const allTrades = JSON.parse(tradesData);
    const lastTrade = allTrades[allTrades.length - 1];
    console.log('broker:', lastTrade.broker);
    console.log('結果:', lastTrade.broker ? '✅' : '❌');
})();
```

---

## 📝 修正指示ファイル

| # | ファイル | 状態 | パス |
|---|---------|------|------|
| 1 | styles.css 修正指示 | ✅ 完了 | `/outputs/修正指示_styles_css.txt` |
| 2 | index.html 修正指示 | ✅ 完了 | `/outputs/修正指示_index_html.txt` |
| 3 | TradeEntry.js 修正指示 | ✅ 完了 | `/outputs/修正指示_TradeEntry_js_確定版.txt` |
| 4 | bridge.js 修正指示 | 🔄 作業中 | `/outputs/修正指示_bridge_js.txt` |

---

## 📊 工数見積もり

| Phase | 作業内容 | 見積時間 | 実績 | 状態 |
|-------|---------|---------|------|------|
| Step 1 | データ構造確認 | 30分 | 30分 | ✅ 完了 |
| Step 2 | 新規エントリーフォーム | 1-2時間 | 2時間 | ✅ 完了 |
| Step 2.5 | bridge.js 修正 | 30分 | - | 🔄 作業中 |
| Step 3 | エントリー情報編集 | 1-2時間 | - | ⏳ 未着手 |
| Step 4 | 円建て損益編集 | 30分-1時間 | - | ⏳ 未着手 |
| Step 5 | トレード詳細 | 1-2時間 | - | ⏳ 未着手 |
| Step 6 | 画像処理完全対応 | 1時間 | - | ⏳ 未着手 |
| Step 7 | 統合テスト | 1-2時間 | - | ⏳ 未着手 |
| Step 8 | ドキュメント更新 | 15分 | - | ⏳ 未着手 |
| **合計** | | **6.5-11.5時間** | **2.5時間** | **22%完了** |

---

## 🎯 成功基準

### 必須条件（Must）

1. ✅ ブローカー情報がエントリー時に入力可能
2. ✅ 新規エントリーのUI表示が正しい（横2×縦4）
3. ⏳ ブローカー情報が正しく保存される ← **現在の課題**
4. ⏳ 新規エントリーとエントリー情報編集の配置が統一
5. ⏳ 円建て損益編集からブローカーが削除され、縦一列表示
6. ⏳ トレード詳細からトレードアイコンが完全削除
7. ⏳ チャート画像が3枚すべて正常に動作
8. ✅ 既存データとの互換性が保たれている
9. ✅ JavaScript エラーが0件

---

## 📝 備考

### 注意事項

1. **bridge.js の役割**
   - Part2モジュール化の互換性維持層
   - 旧コードと新モジュールの橋渡し
   - window.saveTradeRecord はここで定義されている

2. **データフロー**
   - index.html → bridge.js → TradeEntry.js → TradeManager
   - bridge.js で formData を作成するため、ここに broker が必要

3. **デバッグ方法**
   - TradeManager.addTrade をモニタリング
   - 実際に渡されるデータを確認
   - localStorage の保存データを確認

---

## 🔗 関連ドキュメント

- TASKS.md - Week 5タスク
- MODULES.md - モジュール技術仕様
- OVERVIEW.md - システム全体構造
- REFERENCE.md - 完了履歴・教訓

---

**次のアクション**: bridge.js の修正完了 → broker 保存確認 → Step 3へ進行

**更新履歴**:
- 2025-11-12 v1.0: 初版作成
- 2025-11-12 v1.1: 進捗報告・判明した問題を追加、Step 2.5追加
