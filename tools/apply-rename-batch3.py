#!/usr/bin/env python3
"""第三批研究重命名：灵修线 44 个里的 24 个（另 20 个保留原名）。
中式密教风·简洁版——不堆砌、不拘字数、去教科书后缀（术/学/法/基础）。
保留原名 20：丝织/铭刻/净心/谱析/灵酿/净念/辉映/念阵/深共鸣/万物谱/
            净辉/辉视/星感/超感/灵网/幽理/元驱/镜锻/灵驱/净寂"""
import re

RENAMES = {
    # 初感
    'spiritSense': '触灵',
    'leylineLore': '寻脉',
    'beadCraft': '念珠',
    # 共鸣
    'resonArt': '共鸣',
    'shapeBasic': '塑形',
    'sageWay': '聆灵',
    'oracleArt': '通灵',
    'leyExpand': '拓脉',
    # 化形
    'crystalize': '结晶',
    'coreCraft': '凝灵核',
    'formStudy': '形魄',
    'chartDraw': '绘脉',
    'coreFusion': '融灵核',
    # 深寂
    'primordialism': '元念',
    'silenceCryst': '凝寂',
    'mirrorArt': '磨镜',
    'silenceResonance': '寂弦',
    'deepLeyline': '渊脉',
    'voidCodexLore': '幽典',
    'silenceField': '寂界',
    'spiritPactLore': '灵契',
    'primordialForging': '炼念',
    'mirrorSpiritFocus': '叠镜',
    'voidCodexCompile': '续典',
}

text = open('js/data.js', encoding='utf-8').read()

def rename(text, eid, newname):
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
        print(f'[FAIL] {eid}')

with open('js/data.js', 'w', encoding='utf-8') as f:
    f.write(text)

print(f'[done] 重命名 {applied}/{len(RENAMES)}')
