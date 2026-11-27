# 面板折叠方案（v0.11.5 / v0.12.0）

> 状态：已实施（v0.12.0）。方案经下列实测核查确认后按本方案实施，23 项验收全过（另 13 项远行进度回归全过），桌面/手机展开与折叠截图已核验。
> 需求：每一栏可点击折叠（资源面板、谷中见闻、各页签内容）；手机端折叠后下方内容自动上移（资源太多时不用一直下拉就能看到谷中见闻）；桌面端面板可折叠但三栏位置不动。

## 一、现状核查（2026-11-26 playwright 实测）

1. **桌面**：`#game` 横向 flex，左栏 200px / 中栏 flex:1 / 右栏 230px，左右栏 `flex-shrink:0`。隐藏左栏内容后三栏 x/width 实测不变（0/200、200/850、1050/230）→ 桌面只需 `display:none` 栏内内容，列位置天然不动。
2. **手机（<860px）**：`#game` 纵向 flex + `min-height:calc(100vh - 32px)`，`#center-panel{flex:1}` 会撑满剩余高度。实测：仅隐藏资源内容时中栏从 593px 拉伸到 736px，日志 top 保持 806px **不上移** → 必须同时给 `#center-panel{flex:none}`，日志才上移（实测 806→282，上移 524px）。**这是本功能的关键修复点。**
3. **渲染机制**：`rRes()/rLog()/rTabs()/rTC()` 每秒重建 innerHTML → 折叠态必须存在 JS 状态里（状态驱动渲染），不能只改 DOM class，否则下一次渲染即丢失。
4. `#fox-info/#res-list/#log-list` 是渲染目标容器；栏头必须是新增的**静态元素**（不被渲染覆盖）。

## 二、设计

### 2.1 状态与持久化
- `uiCollapse = { res:false, log:false, tabs:{} }`（ui.js 模块级）。
- 纯 UI 偏好，独立存 localStorage `fhUiPrefs`，**不进 G / 存档码** → 无需 `migrate()`，不影响存档兼容与跨设备迁移。
- 读写均 try/catch（隐私模式等场景降级为会话内有效）。

### 2.2 左栏（资源）
- index.html：`#left-panel` 内新增静态栏头 `<div class="panel-hdr" id="res-hdr" onclick="togglePanel('res')">▾资源</div>`；`#fox-info` + `#res-list` 包进 `#res-body`。
- CSS：`#left-panel.collapsed #res-body{display:none}`。
- `togglePanel('res')`：切 class + 箭头 ▾/▸ + 存偏好，立即生效不等渲染周期。

### 2.3 右栏（谷中见闻）
- `h3` 改为可点击栏头 `#log-hdr`，`#log-list` 包进 `#log-body`；机制同左栏。

### 2.4 中栏（各页签内容）
- **点击当前激活页签 = 折叠/展开该页签内容**（激活页签原本点击无行为，复用安全，无需新增按钮，符合纯文字极简风格）；点击其他页签 = 正常切换。
- 激活页签显示箭头 ▾/▸；每页签独立折叠态 `uiCollapse.tabs[id]`（营火/村落/工坊/研究/山外）。
- `rTC()` 开头检查折叠态 → 置空并跳过渲染；`rTabs()` 每次从状态重建箭头（状态驱动，重建不丢）。
- 远行常驻条 `#exp-strip` 在 `#tc` 之外 → 山外内容折叠时进度条照常显示/推进；点击常驻条跳转山外时自动展开（`uiCollapse.tabs.w=false`）。

### 2.5 手机端上移（关键修复）
- `@media(max-width:860px)` 内新增 `#center-panel{flex:none}` → 各栏按自然高度排布，折叠即上移。
- 加大点击区域：`.panel-hdr{padding:6px 0}`、`.tab{padding:7px 12px}`。

### 2.6 桌面端
- 不改横向 flex 布局；折叠仅 `display:none` 栏内内容 → 三栏位置宽度不变（第一节已实测）。

## 三、影响面

| 文件 | 改动 |
|------|------|
| index.html | 左/右栏结构包裹 + 静态栏头 |
| js/ui.js | uiCollapse/saveUiPrefs/applyCollapse/togglePanel/toggleTabCollapse；rTabs 箭头与点击；rTC 折叠短路；startGame 启动 applyCollapse；exp-strip 点击自动展开 |
| css/style.css | .panel-hdr/.panel-arrow/.collapsed 规则；手机端 flex:none 与点击区域 |
| js/engine.js、js/data.js | 不动（纯 UI 功能） |
| 存档 | 不动（UI 偏好独立存储） |

## 四、风险与对策

1. 渲染重建丢折叠态 → 状态驱动（uiCollapse），渲染只读状态。
2. 手机折叠不上移 → `#center-panel{flex:none}`（已实测验证）。
3. 折叠后悬浮面板残留 → 内容 display:none，hp 不可触发。
4. 山外折叠时看不到远行进度 → 常驻条独立于 #tc，不受页签折叠影响。
5. localStorage 异常 → try/catch 降级。
6. 抉择/存档弹窗 → 独立 overlay，不受折叠影响。
7. 折叠态下游戏逻辑 → 引擎与 UI 解耦，tick 照常（资源增长/远行/事件均不受影响）。

## 五、验收清单（playwright）

桌面 1280×900：
1. 点资源栏头 → 内容隐藏，三栏 x/width 不变；再点恢复。
2. 点激活页签 → 内容清空；再点恢复；各页签折叠态独立。
3. 折叠态刷新后保持（fhUiPrefs）。
4. 山外内容折叠时远行常驻条仍推进；点常驻条跳转并自动展开。
5. 谷中见闻栏头折叠/展开。
6. 折叠期间游戏照常 tick。

手机 390×844：
7. 折叠资源栏 → 谷中见闻 top 上移（资源栏手机端 max-height:160px 封顶，折叠约省 130px）；且未折叠时日志已在视口内（flex:none 使布局紧凑，无需下拉）。
8. 再折叠页签内容 → 日志继续上移。
9. 折叠日志栏 → 只剩栏头。
10. 栏头/页签点击区域高度 ≥30px。
11. 全程无 page error。
