#!/usr/bin/env python3
"""把 batch 2 的 35 条 BD tip 加到 data.js 对应的条目里。"""
import re

# id → tip 文本（不含数组包裹和引号）
TIPS = {
    'mine': '往下挖，光线短得只剩一截。',
    'blastFurnace': '炉口的热风，吹乱了它的胡须。',
    'chimney': '云朵吓得翻跟头。',
    'purifier': '泡儿咕嘟咕嘟往上冒。',
    'steelVault': '钢一摞，齐齐喊"立正"。',
    'oilWell': '黑油涌上来，面上映着天光。',
    'oilTank': '凑近闻，鼻子先黑半圈。',
    'steamEngine': '屋顶下雨，地上发烫。',
    'combustEngine': '一动起来，连凳子都坐不稳。',
    'factory': '一个动作做了一千遍。',
    'railroad': '把铜钱放轨上，等车碾扁。',
    'windTower': '风大了，尾巴跟着转。',
    'calcFurnace': '炉火越烫，寒钛越冷。',
    'refinery': '它对炉子念了一句：合！',
    'observatory': '它对着夜空，夜空也回望。',
    'cleanForest': '新栽的树，叶子上落了一层灰。',
    'titanVault': '刚开库门，毛全立起来。',
    'accelerator': '绕了七百圈，吐出一颗光。',
    'furnace': '炉火一舔，它胡须卷了边。',
    'radianceBox': '匣子掀开，光跳出来糊它一脸。',
    'resonTower': '绕塔三圈，耳根开始发痒。',
    'elixirBrewery': '酒香引来了不认识的昆虫。',
    'shapeHall': '灵流聚成人形，站了一息，又散开。',
    'oracleHall': '听见谁说话，转头又只有自己。',
    'calmGrove': '落叶堆得很厚，踩上去没有声音。',
    'crystalCave': '黑暗里，有东西在缓慢地凝结。',
    'radianceDais': '嘀嘀嗒嗒闪起小亮灯。',
    'coreForge': '炉心微微发光，它不敢眨眼。',
    'radiantGrove': '林子里光在跑。',
    'chartHall': '一墙的牛皮，山脉在上面活着。',
    'primordialPool': '水底慢慢起了一个想法。',
    'silenceCave': '喊一声，连回声都没追上来。',
    'spiritVault': '一收一开，东西换了位置。',
    'divineAltar': '香在烧，它的影子也跪着。',
    'scriptureHall': '整夜读经，月光走过三页。',
}

text = open('js/data.js', encoding='utf-8').read()

def insert_tip(text, eid, tip):
    """找到顶层 'eid: { ... }' 条目，在结尾 } 之前插 tip:[...]"""
    m = re.search(r'^  ' + re.escape(eid) + r':\s*\{', text, re.MULTILINE)
    if not m:
        return text, False
    open_brace = m.end() - 1
    depth = 1
    i = open_brace + 1
    while i < len(text) and depth > 0:
        if text[i] == '{': depth += 1
        elif text[i] == '}': depth -= 1
        i += 1
    close_brace = i - 1
    body = text[open_brace+1:close_brace]
    if re.search(r'(?:^|[\s,])tip\s*:\s*[\[\'"]', body):
        return text, False
    body_stripped = body.rstrip()
    needs_comma = bool(body_stripped) and not body_stripped.endswith(',')
    # 注意：steelVault 的 tip 含半角引号 "立正"，需用单引号包外层并把内部双引号原样保留
    insertion = (',' if needs_comma else '') + " tip: ['" + tip + "']"
    new_text = text[:close_brace] + insertion + text[close_brace:]
    return new_text, True

applied = 0
skipped = 0
for eid, tip in TIPS.items():
    text, ok = insert_tip(text, eid, tip)
    if ok:
        applied += 1
    else:
        print(f'[skip] {eid} (找不到 或 已有 tip)')
        skipped += 1

with open('js/data.js', 'w', encoding='utf-8') as f:
    f.write(text)

print(f'[done] 应用 {applied}，跳过 {skipped}')
