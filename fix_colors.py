#!/usr/bin/env python3
"""
Trading Complete - カラー置換スクリプト
プロジェクトのルートフォルダ（index.htmlと同じ場所）に置いて実行。

使い方:
  cd C:\\Users\\focus\\ドキュメント\\GitHub\\trading-complete
  python fix_colors.py
"""

import os
import shutil

def apply_replacements(content, replacements):
    total = 0
    for old, new in replacements:
        old_b = old.encode('utf-8') if isinstance(old, str) else old
        new_b = new.encode('utf-8') if isinstance(new, str) else new
        count = content.count(old_b)
        if count > 0:
            content = content.replace(old_b, new_b)
            total += count
    return content, total

def fix_file(filepath, replacements):
    if not os.path.exists(filepath):
        print(f"  -- スキップ（ファイルなし）: {filepath}")
        return
    
    backup = filepath + '.bak'
    if not os.path.exists(backup):
        shutil.copy2(filepath, backup)
    
    with open(filepath, 'rb') as f:
        content = f.read()
    
    content, count = apply_replacements(content, replacements)
    
    with open(filepath, 'wb') as f:
        f.write(content)
    
    print(f"  {count} 箇所置換")

def main():
    print("=" * 50)
    print("Trading Complete カラー置換スクリプト")
    print("=" * 50)
    print()
    
    # フォルダ構成: index.html はルート、JSは js/ 内
    js = 'js'
    
    # index.html が存在するか確認
    if not os.path.exists('index.html'):
        print("index.html が見つかりません！")
        print("プロジェクトのルートフォルダで実行してください。")
        print()
        print("例: cd C:\\Users\\focus\\ドキュメント\\GitHub\\trading-complete")
        print("    python fix_colors.py")
        input("\nEnterで終了...")
        return
    
    # ===== index.html =====
    print("index.html")
    fix_file('index.html', [
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
    ])
    
    # ===== script.js =====
    print(f"{js}/script.js")
    fix_file(os.path.join(js, 'script.js'), [
        ("color: #888;", "color: #7a8599;"),
        ("color = '#888';", "color = '#7a8599';"),
        ("fillStyle = '#888';", "fillStyle = '#7a8599';"),
        ("'#4ade80'", "'#00ff88'"),
        ("#4ade80", "#00ff88"),
        ("#f87171", "#ff4466"),
    ])
    
    # ===== TradeDetail.js =====
    print(f"{js}/TradeDetail.js")
    td_path = os.path.join(js, 'TradeDetail.js')
    if os.path.exists(td_path):
        backup = td_path + '.bak'
        if not os.path.exists(backup):
            shutil.copy2(td_path, backup)
        
        with open(td_path, 'rb') as f:
            content = f.read()
        
        content, count = apply_replacements(content, [
            ('class="trade-detail-section" style="background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;"',
             'class="trade-detail-section subsection-box"'),
            ('style="color: #888;">', 'class="text-hint">'),
            ("'#4ade80'", "'#00ff88'"),
            ("'#f87171'", "'#ff4466'"),
        ])
        
        # yenSection.style.cssText
        old_yen = b"yenSection.style.cssText = 'background: #1a1a1a; padding: 15px; margin: 10px 0; border-radius: 8px; border: 1px solid #333;';"
        new_yen = b"yenSection.className = 'subsection-box';"
        if old_yen in content:
            content = content.replace(old_yen, new_yen)
            count += 1
        
        with open(td_path, 'wb') as f:
            f.write(content)
        print(f"  {count} 箇所置換")
    else:
        print("  -- スキップ（ファイルなし）")
    
    # ===== TradeEdit.js =====
    print(f"{js}/TradeEdit.js")
    fix_file(os.path.join(js, 'TradeEdit.js'), [
        ("color: #888;", "color: #7a8599;"),
    ])
    
    # ===== TradeList.js =====
    print(f"{js}/TradeList.js")
    fix_file(os.path.join(js, 'TradeList.js'), [
        ("color: #888;", "color: #7a8599;"),
    ])
    
    # ===== ExpenseManagerModule.js =====
    print(f"{js}/ExpenseManagerModule.js")
    fix_file(os.path.join(js, 'ExpenseManagerModule.js'), [
        ('border: 1px solid #444;', 'border: 1px solid rgba(255, 255, 255, 0.06);'),
        ('border-bottom: 1px solid #333;', 'border-bottom: 1px solid rgba(255, 255, 255, 0.06);'),
        ('border-top: 2px solid #444;', 'border-top: 2px solid rgba(255, 255, 255, 0.06);'),
        ('background: #1a1a1a;', 'background: #0c1018;'),
        ('background: #2a2a2a;', 'background: #101420;'),
        ('background: #252525;', 'background: #0f1320;'),
        ('background: #3a3a3a;', 'background: #151a28;'),
        ('color: #888;', 'color: #7a8599;'),
    ])
    
    # ===== NoteManagerModule.js =====
    print(f"{js}/NoteManagerModule.js")
    fix_file(os.path.join(js, 'NoteManagerModule.js'), [
        ("emptyDiv.style.color = '#888';", "emptyDiv.style.color = '#7a8599';"),
    ])
    
    # ===== YenProfitLossModalModule.js =====
    print(f"{js}/YenProfitLossModalModule.js")
    fix_file(os.path.join(js, 'YenProfitLossModalModule.js'), [
        ('background: #1a1a1a;', 'background: #0c1018;'),
        ('background: #2a2a2a;', 'background: #101420;'),
        ("'#4ade80'", "'#00ff88'"),
        ("'#f87171'", "'#ff4466'"),
    ])
    
    # ===== broker-ui.js =====
    print(f"{js}/broker-ui.js")
    fix_file(os.path.join(js, 'broker-ui.js'), [
        ("color: #888;", "color: #7a8599;"),
    ])
    
    # ===== StatisticsModule.js =====
    print(f"{js}/StatisticsModule.js")
    fix_file(os.path.join(js, 'StatisticsModule.js'), [
        ("#4ade80", "#00ff88"),
        ("#f87171", "#ff4466"),
    ])
    
    # ===== ChartModule.js =====
    print(f"{js}/ChartModule.js")
    fix_file(os.path.join(js, 'ChartModule.js'), [
        ("'#888'", "'#7a8599'"),
        ("'#444'", "'rgba(255, 255, 255, 0.06)'"),
    ])
    
    # ===== ReportModule.js =====
    print(f"{js}/ReportModule.js")
    fix_file(os.path.join(js, 'ReportModule.js'), [
        ('color: #888;', 'color: #7a8599;'),
        ('#4ade80', '#00ff88'),
        ('#f87171', '#ff4466'),
        ('rgba(74, 222, 128,', 'rgba(0, 255, 136,'),
        ('style="color: #333; margin-bottom: 10px; font-size: 14px;"',
         'style="color: #7a8599; margin-bottom: 10px; font-size: 14px;"'),
    ])
    
    print()
    print("=" * 50)
    print("完了！ブラウザをリロードして確認してください。")
    print()
    print("元に戻す場合は .bak ファイルをリネーム。")
    print("=" * 50)
    input("\nEnterで終了...")

if __name__ == '__main__':
    main()
