import re
from pathlib import Path

root = Path(r"d:/WEP PROJECTS/Asas/asas/src")
pat = re.compile(
    r"\s*<div className=\"absolute right-[^\"]*\">\s*\n\s*<span className=\"[^\"]+\">⌘K</span>\s*\n\s*</div>",
)
count = 0
for p in root.rglob("*.jsx"):
    t = p.read_text(encoding="utf-8")
    nt, n = pat.subn("", t)
    if n:
        p.write_text(nt, encoding="utf-8")
        print(f"{p}: {n}")
        count += n
print("total", count)
