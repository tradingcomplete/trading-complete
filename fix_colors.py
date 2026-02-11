#!/usr/bin/env python3
"""
Trading Complete - カラー置換スクリプト
index.htmlと同じフォルダに置いて実行してください。

使い方:
  python fix_colors.py

※ 元ファイルは .bak として自動バックアップされます。
"""

import os
import shutil

def fix_file(filepath):
    """ファイルのカラーコードを新テーマに置換"""
    
    if not os.path.exists(filepath):
        print(f"  ⚠ ファイルが見つかりません: {filepath}")
        return False
    
    # バックアップ
    backup = filepath + '.bak'
    if not os.path.exists(backup):
        shutil.copy2(filepath, backup)
        print(f"  📦 バックアップ: {backup}")
    
    # バイナリモードで読み書き（エンコーディング破壊を防止）
    with open(filepath, 'rb') as f:
        content = f.read()
    
    original_size = len(content)
    total_replacements = 0
    
    return content, original_size, total_replacements

def apply_replacements(content, replacements):
    """バイト列置換を実行"""
    total = 0
    for old, new in replacements:
        old_b = old.encode('utf-8') if isinstance(old, str) else old
        new_b = new.encode('utf-8') if isinstance(new, str) else new
        count = content.count(old_b)
        if count > 0:
            content = content.replace(old_b, new_b)
            total += count
    return content, total

def main():
    print("=" * 50)
    print("Trading Complete カラー置換スクリプト")
    print("=" * 50)
    print()
    
    # ===== index.html =====
    print("📄 index.html")
    if os.path.exists('index.html'):
        with open('index.html', 'rb') as f:
            content = f.read()
        backup = 'index.html.bak'
        if not os.path.exists(backup):
            shutil.copy2('index.html', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ('background: #2a2a2a;', 'background: #101420;'),
            ('background-color: #2a2a2a;', 'background-color: #101420;'),
            ('background: #1a1a1a;', 'background: #0c1018;'),
            ('border-bottom: 1px solid #444;', 'border-bottom: 1px solid rgba(255, 255, 255, 0.06);'),
            ('border-top: 1px solid #444;', 'border-top: 1px solid rgba(255, 255, 255, 0.06);'),
            ('border: 1px solid #444;', 'border: 1px solid rgba(255, 255, 255, 0.06);'),
            ('color: #4ade80;', 'color: #00ff88;'),
            ('background: #4ade80;', 'background: #00ff88;'),
            ('border-color: #4ade80;', 'border-color: #00ff88;'),
            ('border: 1px solid #4ade80;', 'border: 1px solid #00ff88;'),
            ('background: #22c55e;', 'background: #00dd77;'),
            ('color: #888;', 'color: #7a8599;'),
            ('color: #aaa; margin-bottom', 'color: #8a94a6; margin-bottom'),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('index.html', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== script.js =====
    print("\n📄 script.js")
    if os.path.exists('script.js'):
        with open('script.js', 'rb') as f:
            content = f.read()
        backup = 'script.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('script.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ("color: #888;", "color: #7a8599;"),
            ("color = '#888';", "color = '#7a8599';"),
            ("fillStyle = '#888';", "fillStyle = '#7a8599';"),
            ("'#4ade80'", "'#00ff88'"),
            ("#4ade80", "#00ff88"),
            ("#f87171", "#ff4466"),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('script.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== TradeDetail.js =====
    print("\n📄 TradeDetail.js")
    if os.path.exists('TradeDetail.js'):
        with open('TradeDetail.js', 'rb') as f:
            content = f.read()
        backup = 'TradeDetail.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('TradeDetail.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            # インラインstyle → CSSクラス化
            ('class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;"',
             'class="trade-detail-section subsection-box"'),
            ('style="color: #888;">', 'class="text-hint">'),
            ("'#4ade80'", "'#00ff88'"),
            ("'#f87171'", "'#ff4466'"),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        # yenSection.style.cssText の置換
        old_yen = b"yenSection.style.cssText = 'background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;';"
        new_yen = b"yenSection.className = 'subsection-box';"
        if old_yen in content:
            content = content.replace(old_yen, new_yen)
            count += 1
        
        with open('TradeDetail.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== TradeEdit.js =====
    print("\n📄 TradeEdit.js")
    if os.path.exists('TradeEdit.js'):
        with open('TradeEdit.js', 'rb') as f:
            content = f.read()
        backup = 'TradeEdit.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('TradeEdit.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ("color: #888;", "color: #7a8599;"),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('TradeEdit.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== TradeList.js =====
    print("\n📄 TradeList.js")
    if os.path.exists('TradeList.js'):
        with open('TradeList.js', 'rb') as f:
            content = f.read()
        backup = 'TradeList.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('TradeList.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ("color: #888;", "color: #7a8599;"),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('TradeList.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== ExpenseManagerModule.js =====
    print("\n📄 ExpenseManagerModule.js")
    if os.path.exists('ExpenseManagerModule.js'):
        with open('ExpenseManagerModule.js', 'rb') as f:
            content = f.read()
        backup = 'ExpenseManagerModule.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('ExpenseManagerModule.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ('border: 1px solid #444;', 'border: 1px solid rgba(255, 255, 255, 0.06);'),
            ('border-bottom: 1px solid #333;', 'border-bottom: 1px solid rgba(255, 255, 255, 0.06);'),
            ('border-top: 2px solid #444;', 'border-top: 2px solid rgba(255, 255, 255, 0.06);'),
            ('background: #1a1a1a;', 'background: #0c1018;'),
            ('background: #2a2a2a;', 'background: #101420;'),
            ('background: #252525;', 'background: #0f1320;'),
            ('background: #3a3a3a;', 'background: #151a28;'),
            ('color: #888;', 'color: #7a8599;'),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('ExpenseManagerModule.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== NoteManagerModule.js =====
    print("\n📄 NoteManagerModule.js")
    if os.path.exists('NoteManagerModule.js'):
        with open('NoteManagerModule.js', 'rb') as f:
            content = f.read()
        backup = 'NoteManagerModule.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('NoteManagerModule.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ("emptyDiv.style.color = '#888';", "emptyDiv.style.color = '#7a8599';"),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('NoteManagerModule.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== YenProfitLossModalModule.js =====
    print("\n📄 YenProfitLossModalModule.js")
    if os.path.exists('YenProfitLossModalModule.js'):
        with open('YenProfitLossModalModule.js', 'rb') as f:
            content = f.read()
        backup = 'YenProfitLossModalModule.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('YenProfitLossModalModule.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ('background: #1a1a1a;', 'background: #0c1018;'),
            ('background: #2a2a2a;', 'background: #101420;'),
            ("'#4ade80'", "'#00ff88'"),
            ("'#f87171'", "'#ff4466'"),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('YenProfitLossModalModule.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== broker-ui.js =====
    print("\n📄 broker-ui.js")
    if os.path.exists('broker-ui.js'):
        with open('broker-ui.js', 'rb') as f:
            content = f.read()
        backup = 'broker-ui.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('broker-ui.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ("color: #888;", "color: #7a8599;"),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('broker-ui.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== StatisticsModule.js =====
    print("\n📄 StatisticsModule.js")
    if os.path.exists('StatisticsModule.js'):
        with open('StatisticsModule.js', 'rb') as f:
            content = f.read()
        backup = 'StatisticsModule.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('StatisticsModule.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ("#4ade80", "#00ff88"),
            ("#f87171", "#ff4466"),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('StatisticsModule.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== ChartModule.js =====
    print("\n📄 ChartModule.js")
    if os.path.exists('ChartModule.js'):
        with open('ChartModule.js', 'rb') as f:
            content = f.read()
        backup = 'ChartModule.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('ChartModule.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            ("'#888'", "'#7a8599'"),
            ("'#444'", "'rgba(255, 255, 255, 0.06)'"),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('ChartModule.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    # ===== ReportModule.js =====
    print("\n📄 ReportModule.js")
    if os.path.exists('ReportModule.js'):
        with open('ReportModule.js', 'rb') as f:
            content = f.read()
        backup = 'ReportModule.js.bak'
        if not os.path.exists(backup):
            shutil.copy2('ReportModule.js', backup)
            print(f"  📦 バックアップ: {backup}")
        
        replacements = [
            # #888 → #7a8599
            ('color: #888;', 'color: #7a8599;'),
            # #4ade80 → #00ff88 (全箇所)
            ('#4ade80', '#00ff88'),
            # #f87171 → #ff4466
            ('#f87171', '#ff4466'),
            # rgba(74, 222, 128, → rgba(0, 255, 136,
            ('rgba(74, 222, 128,', 'rgba(0, 255, 136,'),
            # レポート内の#333ヘッダー
            ('style="color: #333; margin-bottom: 10px; font-size: 14px;"',
             'style="color: #7a8599; margin-bottom: 10px; font-size: 14px;"'),
        ]
        
        content, count = apply_replacements(content, replacements)
        
        with open('ReportModule.js', 'wb') as f:
            f.write(content)
        print(f"  ✅ {count} 箇所置換完了")
    else:
        print("  ⚠ ファイルが見つかりません")
    
    print()
    print("=" * 50)
    print("✅ 全ファイルの処理が完了しました！")
    print()
    print("📌 CSSファイル（1_base.css, 5_themes.css）は")
    print("   別途ダウンロードしたファイルで置き換えてください。")
    print()
    print("📌 元に戻したい場合は .bak ファイルをリネームしてください。")
    print("=" * 50)

if __name__ == '__main__':
    main()
