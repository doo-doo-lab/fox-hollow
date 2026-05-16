#!/usr/bin/env python3
"""灵修 D 阶段合并：18→11（减 7）
4 个合并组（LD4 中间节点先做，影响其他依赖）：
  LD4: voidLore+primordialDrive → mirrorForging（中间节点 3 并 1）
  LD1: silenceField+spiritPactLore → spiritDrive
  LD2: silentPurity+mirrorSpiritFocus → primordialForging
  LD3: voidCodexCompile → deepLeyline
"""
import re

MERGES = [
    {'rep':'mirrorForging','eaten':['voidLore','primordialDrive'],
     'n':'镜锻','d':'灵核倒进镜里——驱动元念，亦藏幽冥之理；规则从不出声。',
     'p':"[{ r: 'lore', a: 4500 }, { r: 'spiritCore', a: 30 }, { r: 'primordial', a: 35 }, { r: 'spectrum', a: 20 }]",
     'e':"{}",
     'uq':"{ u: { primordialism: 1, cosmicSpec: 1, coreFusion: 1 } }"},
    {'rep':'spiritDrive','eaten':['silenceField','spiritPactLore'],
     'n':'灵驱','d':'念阵转起，寂界辟开，与冥立契——一念之中，万象俱动。',
     'p':"[{ r: 'lore', a: 6200 }, { r: 'spiritCore', a: 38 }, { r: 'silenceStone', a: 31 }, { r: 'mirrorSpirit', a: 5 }, { r: 'primordial', a: 15 }]",
     'e':"{}",
     'uq':"{ u: { coreFusion: 1, primordialism: 1, silenceResonance: 1, mirrorForging: 1, spiritWeb: 1, voidCodexLore: 1 } }"},
    {'rep':'primordialForging','eaten':['silentPurity','mirrorSpiritFocus'],
     'n':'炼念','d':'三镜聚念，归于澄寂——元念入炉，出来不再是念，是发烫的真。',
     'p':"[{ r: 'lore', a: 5400 }, { r: 'primordial', a: 45 }, { r: 'spiritCore', a: 15 }, { r: 'mirrorSpirit', a: 5 }, { r: 'silenceStone', a: 12 }, { r: 'elixir', a: 8 }]",
     'e':"{}",
     'uq':"{ u: { primordialDrive: 1, mirrorForging: 1, hyperSense: 1, voidLore: 1, radiantVision: 1 }, b: { primordialPool: 1 } }"},
    {'rep':'deepLeyline','eaten':['voidCodexCompile'],
     'n':'渊脉','d':'灵脉之下还有灵脉，幽典续写不止——更深处不流，却通往任何地方。',
     'p':"[{ r: 'lore', a: 4200 }, { r: 'silenceStone', a: 15 }, { r: 'primordial', a: 20 }, { r: 'voidCodex', a: 5 }, { r: 'insight', a: 25 }]",
     'e':"{}",
     'uq':"{ u: { silenceResonance: 1, voidCodexLore: 1, spiritWeb: 1 } }"},
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
    parts = []
    for k in ['sb', 'br']:
        m = re.search(r'\b' + k + r':\s*[\x27"]([^\x27"]*)[\x27"]', block)
        if m: parts.append(f"{k}: '{m.group(1)}'")
    m = re.search(r'\bphase:\s*(\d+)', block)
    if m: parts.append(f"phase: {m.group(1)}")
    return ', '.join(parts)

# 改写代表
for g in MERGES:
    s,e = find_entry(text, g['rep'])
    orig = text[s:e]; tail = get_tail(orig)
    new = (f"  {g['rep']}: {{\n"
           f"    n: '{g['n']}', d: '{g['d']}',\n"
           f"    p: {g['p']},\n"
           f"    e: {g['e']},\n"
           f"    uq: {g['uq']}, {tail},\n"
           f"  }},\n")
    text = text[:s] + new + text[e:]
    print(f'  改写 {g["rep"]}')

# 删消失
deleted = []
for g in MERGES:
    for eid in g['eaten']:
        s,e = find_entry(text, eid)
        if s is None: print(f'[FAIL] {eid}'); continue
        text = text[:s] + text[e:]
        deleted.append(eid)
        print(f'  删除 {eid}')

# 重定向：u: { 单引用 → 代表 }
for g in MERGES:
    for eid in g['eaten']:
        old = 'u: { ' + eid + ': 1 }'
        new = 'u: { ' + g['rep'] + ': 1 }'
        cnt = text.count(old)
        if cnt>0:
            text = text.replace(old, new)
            print(f'  重定向 {eid}→{g["rep"]}: {cnt}')
        # 多键
        def repl(m, eid=eid, rep=g['rep']):
            inner = m.group(1)
            ni = re.sub(r'\b'+re.escape(eid)+r':\s*\d+', rep+': 1', inner)
            return 'u: {'+ni+'}'
        text2,n = re.subn(r'u:\s*\{([^}]*)\}', repl, text)
        if text2 != text and n:
            text = text2
            print(f'  多键 {eid}→{g["rep"]}')

open('js/data.js','w',encoding='utf-8').write(text)

ujs = open('js/ui.js', encoding='utf-8').read()
for eid in deleted:
    ujs = re.sub(r"'" + re.escape(eid) + r"',?", '', ujs)
ujs = re.sub(r",,+", ",", ujs)
ujs = re.sub(r",\s*\]", "]", ujs)
ujs = re.sub(r"\[\s*,", "[", ujs)
open('js/ui.js','w',encoding='utf-8').write(ujs)
print(f'[done] 灵修 D 减 {len(deleted)}')
