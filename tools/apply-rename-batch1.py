#!/usr/bin/env python3
"""第一批研究重命名：启蒙习俗治理 21 个里的 15 个（另 6 个保留原名）。
只改 data.js 里 UD 对应条目的 n 字段。"""
import re

RENAMES = {
    'stoneTools': '石器之始',
    'carpentry': '斫木成材',
    'masonry': '琢石成砖',
    'forestLore': '熟谙林木',
    'ironWorking': '百炼成铁',
    'foxFolklore': '狐灵旧闻',
    'spiritShelter': '灵荫御寒',
    'ancestorEye': '先祖训俭',
    'craftMastery': '匠艺天成',
    'longJourney': '跋涉致远',
    'calendar': '月令酿歌',
    'councilLore': '群策共治',
    'polityLore': '治世经纬',
    'policyLore': '分曹议政',
    'branchLore': '分野定途',
}

text = open('js/data.js', encoding='utf-8').read()

def rename(text, eid, newname):
    """找到顶层 'eid: { ... }' 条目，替换块内第一个 n: '...'。"""
    m = re.search(r'^  ' + re.escape(eid) + r':\s*\{', text, re.MULTILINE)
    if not m:
        return text, False, None
    open_brace = m.end() - 1
    depth = 1
    i = open_brace + 1
    while i < len(text) and depth > 0:
        if text[i] == '{': depth += 1
        elif text[i] == '}': depth -= 1
        i += 1
    close_brace = i - 1
    block = text[open_brace:close_brace]
    mn = re.search(r"n: '([^']*)'", block)
    oldname = mn.group(1) if mn else None
    new_block, cnt = re.subn(r"n: '[^']*'", "n: '" + newname + "'", block, count=1)
    if cnt == 0:
        return text, False, oldname
    return text[:open_brace] + new_block + text[close_brace:], True, oldname

applied = 0
for eid, newname in RENAMES.items():
    text, ok, oldname = rename(text, eid, newname)
    if ok:
        applied += 1
        print(f'  {eid}: {oldname} -> {newname}')
    else:
        print(f'[FAIL] {eid} (找不到条目或无 n 字段)')

with open('js/data.js', 'w', encoding='utf-8') as f:
    f.write(text)

print(f'[done] 重命名 {applied}/{len(RENAMES)}')
