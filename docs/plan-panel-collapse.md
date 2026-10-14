# 面板折叠功能实施方案（v0.11.6）

> 状态：方案已检查确认，按此实施。实施完成后本文档保留作为设计记录。

## 一、需求

1. **每一栏都可折叠**：资源面板（左栏）、营火等页签的内容（中栏）、谷中见闻（右栏）。
2. **手机端**（≤860px，三段纵向堆叠）：折叠后该栏只剩一行标题，下方内容自动往上顶。
   主要场景：资源种类多时，资源面板很长，想看「谷中见闻」要一直往下拉；折叠资源面板后谷中见闻直接上移可见。
3. **桌面端**（三栏横排）：折叠只隐藏栏内内容，各栏宽度与位置不动。
4. 折叠状态刷新页面后保留（独立于游戏存档）。

## 二、现状分析（已核对代码，确认无冲突）

| 位置 | 现状 | 对方案的影响 |
|------|------|--------------|
| index.html | `#left-panel` 直接含 `#fox-info` + `#res-list`；`#log-panel` 含 `h3` + `#log-list`；`#center-panel` 含 `#tabs` + `#tc` | 需在左/右栏各加一个标题行，并把内容包进 wrapper |
| ui.js `rRes()` | 只重写 `#res-list`、`#fox-info` 的 innerHTML | wrapper 在外层，渲染不会覆盖折叠结构 ✓ |
| ui.js `rLog()` | 只重写 `#log-list` innerHTML | 同上 ✓ |
| ui.js `rTC()` | 只重写 `#tc` innerHTML | collapsed 类挂在 `#tc` 容器上，内容重渲染不丢状态 ✓ |
| ui.js `rTabs()` | 每 5 tick 重建页签 HTML，onclick 为内联 `curTab='x';rTabs();rTC()` | 折叠状态存 JS 变量，重建不影响；onclick 改为 `tabClick(id)` |
| style.css 桌面 | `#game` flex 横排：左 200px、右 230px 固定，中 `flex:1` | body 隐藏后列宽不变 → 「位置不动」天然满足 ✓ |
| style.css 移动 | `@media(max-width:860px)` 纵向堆叠，左右面板 `width:100%; max-height:160px`；**中栏 `flex:1` 会撑满剩余视口** | 实测（无头浏览器 400×800）：折叠资源栏后中栏长高、日志栏钉在底部不上移 ✗ —— 需在移动端把中栏改为 `flex:0 1 auto`（高度=内容高，页面自然流），折叠后下方内容才能上顶 |
| 悬浮面板 `.hp` | `position:fixed` + `pointer-events:none` | 与折叠互不影响 ✓ |
| 弹窗 | `#modal-overlay` 独立于三栏 | 抉择/存档码弹窗不受影响 ✓ |

## 三、改动方案

### 1. index.html
- `#left-panel`：顶部加 `<div class="panel-hdr" onclick="togglePanel('res')">资源 <span class="p-arrow" id="res-arrow">▾</span></div>`；原 `#fox-info`、`#res-list` 包进 `<div class="panel-body" id="res-body">`。
- `#log-panel`：`h3 谷中见闻` 改造成 `.panel-hdr`（onclick=`togglePanel('log')`，右侧箭头 `#log-arrow`）；`#log-list` 包进 `<div class="panel-body" id="log-body">`。
- `#center-panel`：**不加新元素**，页签栏本身就是折叠把手——
  - 点击非激活页签：切换到该页签（并强制展开）；
  - 再次点击当前激活页签：切换 `#tc` 折叠/展开；
  - 激活页签文字后附 `▾/▸` 指示当前折叠状态。
  - 这同时满足「营火的四个页签（营火/村落/工坊/研究，及解锁后的山外）都可折叠」：每个页签的内容区都可经此把手折叠。

### 2. ui.js
- 新增 UI 状态（**不进游戏存档 G**）：`const panelCollapsed = { res:false, tc:false, log:false };`
- `togglePanel(k)`：翻转状态 → `applyCollapse()` → `rTabs()`（刷新页签箭头）。
- `applyCollapse()`：给 `#res-body` / `#log-body` / `#tc` 切换 `collapsed` 类；更新 `#res-arrow` / `#log-arrow` 文本（▾ 展开 / ▸ 折叠）；状态写入 `localStorage.fhCollapse`（try/catch 包裹，与存档 `fhSave` 完全独立）。
- `tabClick(id)`：`id===curTab` → `togglePanel('tc')`；否则 `curTab=id`、`panelCollapsed.tc=false`、`applyCollapse()`、`rTabs()`、`rTC()`。
- `rTabs()`：onclick 改用 `tabClick`；激活页签追加 `.tab-arrow` 指示符。
- `startGame()`：启动时读取 `fhCollapse` 恢复折叠状态并 `applyCollapse()`。

### 3. style.css
```css
.panel-hdr{display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;margin-bottom:4px;}
.panel-hdr:hover{color:#333;}
#left-panel .panel-hdr{font-size:12px;color:#999;letter-spacing:1px;text-transform:uppercase;}
#log-panel .panel-hdr h3{margin-bottom:0;}
.p-arrow,.tab-arrow{font-size:10px;color:#bbb;}
.tab-arrow{margin-left:3px;}
.panel-body.collapsed,#tc.collapsed{display:none;}
```
- 移动端附加一条覆盖（实测后补充，见现状分析）：
```css
@media(max-width:860px){
  /* 中栏不再撑满剩余视口：高度=内容高，上方面板折叠后下方内容自动上顶 */
  #center-panel{flex:0 1 auto;}
}
```
- 折叠后左右面板高度自然收缩为标题行高（max-height 是上限非下限）。
- 桌面端列宽由既有固定宽度/flex 保证不动。

## 四、边界与风险清单

1. `#fox-info`（狐狸人口行）在 res-body 内，资源栏折叠时一并隐藏 —— 符合「整栏折叠」预期。
2. 切换到新页签时强制展开，避免「切过去却看不到内容」的困惑。
3. `rTC()` 每 5 tick 重建 `#tc` 内容，但 collapsed 类在 `#tc` 容器上，不会丢失。
4. 折叠状态存 `localStorage.fhCollapse`，重置游戏（清 fhSave）不影响折叠偏好；导入存档码也不影响。
5. 隐藏中的面板渲染照常进行（写入不可见节点），开销可忽略，逻辑零改动。
6. iOS 对 `▾/▸` 字符渲染正常（纯文本箭头，非 emoji）。

## 五、验证清单（实施后执行 — 2026-10-14 无头 Chromium 实测）

- [x] `node --check` 三个 js 文件语法通过
- [x] 桌面（1280×900）：折叠任一栏，其余两栏位置/宽度不变（左栏恒 200px、右栏恒 230px），27 项断言全过
- [x] 移动（400×800）：折叠资源面板后谷中见闻 top 402→281px；再折叠页签内容后 →124px，内容自动上顶 ✓
  - 实测发现并修正：`#center-panel{flex:1}` 会吸收折叠释放的空间导致日志栏钉在底部，需在移动端覆盖为 `flex:0 1 auto`（见 §二/§三）
- [x] 页签：点激活页签折叠内容（▸）、再点展开（▾）；切换页签自动展开；折叠状态在 rAll 重渲染后不丢失
- [x] 刷新后折叠状态恢复（localStorage fhCollapse，同 profile 二次加载验证通过）
- [x] 游戏功能回归：tick 运行、资源渲染、手动采集、日志、遗光日志样式（暗金 #9a7b4f 斜体 + 遗光 +1）全部正常
