# Supabase_テーブル構造 差分 - 2026-01-14

**変更内容**: user_settingsテーブルに`goals`と`user_icon`カラムを追加

---

## 📝 user_settings テーブル更新

### 変更前（4カラム + メタデータ）

```sql
CREATE TABLE user_settings (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  brokers JSONB DEFAULT '[]',
  favorite_pairs JSONB DEFAULT '[]',
  monthly_memos JSONB DEFAULT '{}',
  closed_periods JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 変更後（6カラム + メタデータ）

```sql
CREATE TABLE user_settings (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  brokers JSONB DEFAULT '[]',
  favorite_pairs JSONB DEFAULT '[]',
  monthly_memos JSONB DEFAULT '{}',
  closed_periods JSONB DEFAULT '[]',
  goals JSONB,           -- 🆕 追加
  user_icon TEXT,        -- 🆕 追加
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 📊 新カラム詳細

### goals カラム

| 項目 | 値 |
|------|-----|
| 型 | JSONB |
| デフォルト | NULL |
| 用途 | セルフイメージ（目標3つ）|

**データ構造**:
```json
{
  "goal1": {
    "text": "場所に縛られない生活",
    "deadline": "2026-02-23",
    "achieved": false
  },
  "goal2": {
    "text": "家族や地域への貢献",
    "deadline": "2035-02-08",
    "achieved": false
  },
  "goal3": {
    "text": "自己実現とスキルの追及を死ぬまで",
    "deadline": "",
    "achieved": false
  }
}
```

### user_icon カラム

| 項目 | 値 |
|------|-----|
| 型 | TEXT |
| デフォルト | NULL |
| 用途 | ユーザーアイコン（Base64画像）|

**データ例**:
```
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...
```

---

## 📋 localStorageキー対応（更新版）

| Supabase カラム | localStorage キー | 管理モジュール |
|----------------|------------------|---------------|
| brokers | `brokers` | SettingsModule |
| favorite_pairs | `favoritePairs` | SettingsModule |
| monthly_memos | `monthlyMemos` | NoteManagerModule |
| closed_periods | `tc_closed_periods` | ClosingManagerModule |
| **goals** | `goalText1-3`, `goalDeadline1-3`, `goalAchieved1-3` | **SyncModule** |
| **user_icon** | `userIcon` | **SyncModule** |

---

## ✅ 適用方法

### Supabaseダッシュボードで実施済み

1. Table Editor → user_settings → Edit table
2. Add column: `goals` (jsonb)
3. Add column: `user_icon` (text)
4. Save

### SyncModule修正済み

- `saveUserSettings()`: goals, user_icon を含めて保存
- `syncUserSettingsToLocal()`: goals, user_icon をlocalStorageに展開
