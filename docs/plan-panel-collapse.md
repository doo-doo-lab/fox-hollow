# 面板折叠功能方案（v0.12.0）

> 状态：已实施并验收通过（v0.12.0）。方案先行核对代码确认后实施，验收结果见文末。
> 需求：每一栏（资源面板 / 中栏各页签内容 / 谷中见闻）可点击折叠。
> 手机端折叠后下方内容自动上移（解决资源太多时看谷中见闻要一直下拉的问题）；
> 电脑端面板可折叠，但三栏位置不动。

## 一、现状分析（已核对代码）

1. 布局：`#game` 为 flex 行容器；`#left-panel` 固定 200px、`#center-panel` flex:1、`#log-panel` 固定 230px。
   窄屏（≤860px）媒体查询改为 flex 列方向，左/右栏 width:100%、max-height:160px 内部滚动。
2. 渲染架构：`rRes()`/`rLog()` 每秒重写 `#res-list`/`#fox-info`/`#log-list` 的 innerHTML；
   `rTabs()`/`rTC()` 每秒重写 `#tabs`/`#tc`。**面板外壳（index.html 静态节点）不被重写**。
   → 折叠状态必须存于 JS 状态并在每次渲染时读取，不能只靠 DOM class（会被重建冲掉的是内容区，外壳 class 可保留）。
3. 中栏页签：TABS = 营火/村落/工坊/研究/山外（共 5 个，山外需研究解锁）。`curTab` 切换时 `rTC()` 全量重建。
4. ⚠️ 手机端关键陷阱：`#center-panel{flex:1}` 在 flex **列**方向下会参与高度分配，
   即使内容清空，中栏仍可能撑满剩余视口高度，导致折叠后谷中见闻**不上移**。
   → 窄屏媒体查询中必须加 `#center-panel{flex:none;}`，让中栏高度完全由内容决定。
5. `#exp-strip`（远行进度常驻条，v0.11.4）位于 `#tabs` 与 `#tc` 之间，独立于页签内容渲染。
6. 悬浮面板 `.hp` 都在内容区内部，内容隐藏时随之隐藏，无残留风险。
7. 存档：`G` 每 30 秒序列化。折叠是纯 UI 偏好，**不进 G**（不污染存档码/重置逻辑），
   单独存 localStorage `fhUiPrefs`，try/catch 保护，读写失败不影响游戏。

## 二、交互设计

| 栏 | 折叠入口 | 折叠后 |
|----|----------|--------|
| 资源面板（左栏） | 新增栏头「▾ 资源」，点击切换 | 只剩栏头，狐狸信息+资源列表隐藏 |
| 中栏页签内容 | **点击当前激活页签**切换折叠/展开（页签名旁显示 ▾/▸ 指示） | 页签栏保留，内容区清空 |
| 谷中见闻（右栏） | 现有 h3 标题改为可点击「▾ 谷中见闻」 | 只剩标题，日志列表隐藏 |

- 每个页签独立记忆折叠状态（折叠营火→切村落→切回营火仍折叠）。
- 点击**非激活**页签 = 正常切换（不改变目标页签自身的折叠状态）。
- 远行进度常驻条不受页签折叠影响（保持可见、继续推进）。
- 折叠状态持久化到 localStorage，刷新后保持；「重置」只清游戏存档，不清 UI 偏好。
- 箭头指示：展开 ▾ / 折叠 ▸；栏头 hover 变色提示可点击；激活页签加 title 提示「点击折叠/展开」。

## 三、实现清单

### index.html
- 左栏：`#fox-info` 前插入静态栏头 `<div class="panel-hdr" id="res-hdr" onclick="togglePanel('res')">…</div>`；
  `#fox-info` + `#res-list` 包进 `<div id="res-body">`。
- 右栏：h3 加 `class="panel-hdr" onclick="togglePanel('log')"` 与箭头 span；`#log-list` 包进 `<div id="log-body">`。
- 中栏：结构不变（页签箭头由 rTabs 渲染）。

### ui.js
- 新增状态 `uiCollapse = { res:false, log:false, tabs:{} }`；启动时从 `fhUiPrefs` 读取（try/catch）。
- `togglePanel(key)`：翻转 res/log 状态 → `applyCollapse()` → 存偏好。
- `toggleTabCollapse()`：翻转 `tabs[curTab]` → rTabs()+rTC() → 存偏好。
- `applyCollapse()`：按状态给 `#left-panel`/`#log-panel` 加/去 `collapsed` class，更新两个栏头箭头。
- `rTabs()`：激活页签 onclick 改为 `toggleTabCollapse()`；非激活页签 onclick 保持切换；
  激活页签名后渲染 ▾/▸ 箭头（读状态）。
- `rTC()`：开头检查 `uiCollapse.tabs[curTab]`，折叠则 `#tc` 置空直接返回（省渲染开销）。
- `startGame()`：调用 `applyCollapse()`。

### css/style.css
- `.panel-hdr{cursor:pointer;user-select:none;}` + hover 变色；箭头小号灰色。
- `#left-panel.collapsed #res-body{display:none;}`
- `#log-panel.collapsed #log-body{display:none;}`
- 桌面端：三栏宽度定义不变 → 折叠只隐藏内容，**列位置不动**（无需额外规则）。
- 窄屏媒体查询追加：`#center-panel{flex:none;}`（关键，见现状分析 4）；
  折叠后的左/右栏高度收缩为栏头高度（max-height 不阻止收缩，无需额外规则）。

## 四、影响面核对（防回归）

| 检查项 | 结论 |
|--------|------|
| rRes/rLog 重写的是内容区 innerHTML，外壳 class 不受影响 | ✅ 折叠态稳定 |
| rTabs/rTC 每秒重建 → 箭头/内容折叠全部状态驱动 | ✅ 不会被渲染冲掉 |
| gather()/toggleAutoCraft() 直接调 rTC | ✅ 开头统一检查折叠态 |
| 悬浮面板 .hp 在内容区内 | ✅ 随内容隐藏 |
| 抉择/存档弹窗独立于三栏 | ✅ 不受影响 |
| 折叠态不入 G | ✅ 存档码/导入/重置/migrate 零改动 |
| exp-strip 独立渲染 | ✅ 折叠中栏时远行进度照常推进 |
| 手机端 flex:1 陷阱 | ✅ 已列入实现清单（flex:none） |
| localStorage 不可用（隐私模式等） | ✅ try/catch 降级为不持久化 |

## 五、验收标准

1. 桌面 1280px：折叠资源栏/日志栏/页签内容后，三栏的 x 坐标与宽度不变；内容隐藏、栏头保留。
2. 手机 390px：折叠资源栏+中栏页签后，谷中见闻的 y 坐标显著上移（无需长滚动即可见）。
3. 页签折叠状态各自独立、切换不串；刷新页面后保持。
4. 中栏折叠时远行进度条仍可见且持续前进。
5. 展开后所有原有交互（建造/采集/授业/派遣/购买/悬浮面板）正常。
6. 引擎逻辑与存档兼容测试全过。

## 六、验收结果（实测）

- 桌面 1280px：折叠资源栏/日志栏/页签内容后，三栏 x 坐标与宽度均不变 ✅
- 手机 390px：折叠资源栏+页签后，谷中见闻 y 坐标 856 → 147，上移约 710px，无需滚动即可见 ✅
- 页签折叠状态独立、切换不串；刷新后保持（localStorage fhUiPrefs）✅
- 中栏折叠时远行进度条仍可见且持续前进 ✅
- 展开后采集/建造/悬浮面板等交互正常 ✅
- 回归：引擎 21 项 + 遗光 14 项 + 远行 UI 13 项 + 折叠 30 项 + 悬浮复查 3 项全过 ✅

## 七、复核记录（2026-11-21，v0.12.1）

方案与现网代码逐条重新核对，结论：实现与本方案一致，无偏离项。

| 方案条目 | 代码位置 | 复核 |
|----------|----------|------|
| 栏头静态节点 + 内容包裹 | `index.html` `#res-hdr`/`#res-body`、`#log-hdr`/`#log-body` | ✅ |
| 折叠状态与持久化 | `ui.js` `uiCollapse`/`saveUiPrefs`/`applyCollapse` | ✅ 存 `fhUiPrefs`，不入 G |
| 激活页签点击折叠 | `ui.js` `rTabs()`/`toggleTabCollapse()` | ✅ 非激活页签仍是切换 |
| 折叠时跳过内容渲染 | `ui.js` `rTC()` 开头早退 | ✅ |
| 手机中栏高度陷阱 | `style.css` 窄屏 `#center-panel{flex:none}` | ✅ |
| 桌面三栏位置不动 | 宽度定义未改，仅隐藏内容 | ✅ 实测 x/宽度一致 |
| 远行进度不受折叠影响 | `#exp-strip` 独立于 `#tc` | ✅ 折叠时仍推进 |

本轮补充（不改变方案结构）：窄屏下 `.panel-hdr` padding 6px、`.tab` padding 7px，
把折叠入口的点击区域从约 18px 提到约 30px（页签 36px），桌面端不受影响。

复核实测：浏览器 58 项全过（含手机 390px 折叠后谷中见闻 y 552 → 165，上移 387px）；
后台限流对照 4 项全过（1Hz 限流下 10 秒推进 50 tick，旧逻辑对照组仅 10 tick）。
