#!/usr/bin/env python3
"""灵修 C 阶段合并：12→8（减 4）
3 个合并组：
  LC1: spiritGrid+starSense → coreFusion（白名单作代表）
  LC2: deepReson → cosmicSpec（相邻可合，cosmicSpec 解锁 0）
  LC3: pureRadiance → radiantVision
"""
import re

MERGES = [
    {'rep':'coreFusion','eaten':['spiritGrid','starSense'],
     'n':'融灵核','d':'灵核相融——晶丝、共振子、灵核与念阵尽汇于此。',
     'p':"[{ r: 'lore', a: 2400 }, { r: 'spiritCore', a: 18 }, { r: 'radiance', a: 8 }, { r: 'spectrum', a: 12 }, { r: 'formSoul', a: 3 }, { r: 'spiritChart', a: 30 }]",
     'e':"{}",
     'uq':"{ u: { chartDraw: 1, coreCraft: 1 }, b: { chartHall: 1 } }"},
    {'rep':'cosmicSpec','eaten':['deepReson'],
     'n':'万物谱','d':'共振深处那一波连灵魂都抖——谱石记录万物共振的频率。',
     'p':"[{ r: 'lore', a: 1600 }, { r: 'spectrum', a: 15 }, { r: 'insight', a: 12 }, { r: 'resonance', a: 25 }, { r: 'crystalSilk', a: 5 }]",
     'e':"{}",
     'uq':"{ u: { resonArt: 1, radiant: 1 }, b: { resonTower: 1 } }"},
    {'rep':'radiantVision','eaten':['pureRadiance'],
     'n':'辉视','d':'辉芒浸透林子——看远不靠眼睛，靠辉芒在脑袋里画的那张图。',
     'p':"[{ r: 'lore', a: 1250 }, { r: 'radiance', a: 5 }, { r: 'insight', a: 8 }, { r: 'crystalSilk', a: 3 }, { r: 'elixir', a: 2 }]",
     'e':"{}",
     'uq':"{ u: { radiant: 1 }, b: { oracleHall: 1, shapeHall: 1 } }"},
]

text = open('js/data.js', encoding='utf-8').read()

def find_entry(text, eid):
    m = re.search(r'^  ' + re.escape(eid) + r':\s*\{', text, re.MULTILINE)
    if not m: return None, None
    s = m.start(); i = m.end()-1; depth=1; j=i+1
    while j < len(text) and depth>0:
        if text[j]=='{': depth+=1
        elif text[j]=='}': depth-=1
        j+=1
    if j<len(text) and text[j]==',': j+=1
    if j<len(text) and text[j]=='\n': j+=1
    return s, j

def get_tail(block):
    m = re.search(r'\bsb:\s*[\x27"]([^\x27"]*)[\x27"]', block)
    sb = m.group(1) if m else None
    m = re.search(r'\bbr:\s*[\x27"]([^\x27"]*)[\x27"]', block)
    br = m.group(1) if m else None
    m = re.search(r'\bphase:\s*(\d+)', block)
    phase = m.group(1) if m else None
    parts = []
    if sb: parts.append(f"sb: '{sb}'")
    if br: parts.append(f"br: '{br}'")
    if phase: parts.append(f"phase: {phase}")
    return ', '.join(parts)

for g in MERGES:
    s,e = find_entry(text, g['rep'])
    orig = text[s:e]
    tail = get_tail(orig)
    new = (f"  {g['rep']}: {{\n"
           f"    n: '{g['n']}', d: '{g['d']}',\n"
           f"    p: {g['p']},\n"
           f"    e: {g['e']},\n"
           f"    uq: {g['uq']}, {tail},\n"
           f"  }},\n")
    text = text[:s] + new + text[e:]
    print(f'  改写 {g["rep"]}')

deleted = []
for g in MERGES:
    for eid in g['eaten']:
        s,e = find_entry(text, eid)
        if s is None:
            print(f'[FAIL] {eid} 找不到')
            continue
        text = text[:s] + text[e:]
        deleted.append(eid)
        print(f'  删除 {eid}')

for g in MERGES:
    for eid in g['eaten']:
        old = 'u: { ' + eid + ': 1 }'
        new = 'u: { ' + g['rep'] + ': 1 }'
        cnt = text.count(old)
        if cnt>0:
            text = text.replace(old, new)
            print(f'  重定向 {eid}→{g["rep"]}: {cnt} 处')
        # 多键
        def repl(m):
            inner = m.group(1)
            ni = re.sub(r'\b'+re.escape(eid)+r':\s*\d+', g['rep']+': 1', inner)
            return 'u: {'+ni+'}'
        text2,n = re.subn(r'u:\s*\{([^}]*)\}', repl, text)
        if text2 != text and n:
            text = text2
            print(f'  多键重定向 {eid}→{g["rep"]}')

open('js/data.js','w',encoding='utf-8').write(text)

# ui.js
ujs = open('js/ui.js', encoding='utf-8').read()
for eid in deleted:
    ujs = re.sub(r"'" + re.escape(eid) + r"',?", '', ujs)
ujs = re.sub(r",,+", ",", ujs)
ujs = re.sub(r",\s*\]", "]", ujs)
ujs = re.sub(r"\[\s*,", "[", ujs)
open('js/ui.js','w',encoding='utf-8').write(ujs)
print(f'[done] 灵修 C 减 {len(deleted)}')
