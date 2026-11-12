"""Build a reproducible desktop-browser bundle from the generated single-file app."""
from pathlib import Path
from sys import argv
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parents[1]
if len(argv) != 2:
    raise SystemExit("Usage: python3 scripts/pack-offline.py OUTPUT.zip")

readme = """简体中文
先解压，再用电脑浏览器打开 agent-bugcard.html。即使断网也能试用、解析本地日志和导出。
右上角可以切换语言；分享选项中的卡片语言可以单独设置。群聊可用纯文本或 PNG，Issue 可用 Markdown。
转发本工具时发送此压缩包。你选择的日志不会打包进去。

繁體中文
請先解壓縮，再用電腦瀏覽器開啟 agent-bugcard.html。範例、記錄檔解析與匯出皆可離線使用。
右上角可切換介面語言，卡片語言可獨立設定。群組聊天可用純文字或 PNG，Issue 可用 Markdown。
分享工具時轉傳此壓縮檔即可，其中不含你選過的記錄檔。

English
Extract the files and open agent-bugcard.html in a desktop browser. Works offline.
Choose your interface language at the top and your card language in Sharing options.
Project: https://github.com/vighzhen/agent-bugcard
"""
with ZipFile(argv[1], 'w') as archive:
    for name, data in [('agent-bugcard.html', (root/'docs/index.html').read_bytes()),
                       ('README.txt', readme.encode('utf-8-sig')), ('LICENSE', (root/'LICENSE').read_bytes())]:
        entry = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, data)
