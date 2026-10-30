# 面板折叠功能方案（v0.13.6 核对版）

> 状态：方案已确认，当前基线已按本方案实现；本文档在 zip(5) 基线合并时丢失，现恢复并与实际实现逐项核对、补充实测验证。
> 需求来源：手机端资源/内容太多时，想看「谷中见闻」要一直往下拉；希望各栏可折叠，折叠后下方内容自动上移。电脑端面板可折叠，但三栏位置不动。

## 一、折叠项清单（点击标题行切换 ▼︎/▶︎）

| 位置 | 折叠范围 | key | 标题行 |
|------|----------|-----|--------|
| 左栏 | 资源面板（资源列表；狐狸信息常显） | `res` | 「▼︎ 资源 / ▶︎ 资源」 |
| 中栏 | 当前页签内容（营火/村落/工坊/研究/山外共用一个开关，标题随页签切换） | `tc` | 「▼︎ 营火 / ▶︎ 营火」等 |
| 右栏 | 谷中见闻（日志列表） | `log` | h3「▼︎ 谷中见闻 / ▶︎ 谷中见闻」 |

说明：中栏四个页签（及山外）的内容都可以折叠；折叠状态为栏级共享——在营火折叠后切到村落，中栏保持折叠（标题随之变为「▶︎ 村落」），再点一下即展开。这符合「每一栏可折叠」的栏目级需求，实现最简单、状态最少。

## 二、技术方案（与现实现一致）

1. **状态存储**：`collapsed = { res:false, tc:false, log:false }`（ui.js 模块级变量），持久化到 `localStorage.fhCollapsed`。
   - 属 UI 偏好，独立于存档：不进 `fhSave`、不进存档码，跨存档共享。
   - `localStorage` 不可用时 try/catch 退化为会话级折叠，不影响游戏。
   - `startGame()` 启动时读取并 `Object.assign(collapsed, saved)` 恢复。
2. **交互函数**：`toggleCollapse(key)`（ui.js 顶层 function 声明，供内联 onclick 调用）：翻转状态 → 写 localStorage → `rAll()` 立即重渲染。
3. **渲染改造**：
   - `rRes()`：`#left-panel` 按 `collapsed.res` 挂 `.collapsed` 类；`#res-list` 头部输出标题行，折叠时只渲染标题行（狐狸信息保留）。
   - `rTC()`：`#center-panel` 按 `collapsed.tc` 挂 `.collapsed` 类；`#tc` 头部输出带当前页签名的标题行，折叠时跳过整个页签 body 的拼接（body 不进 DOM，下方内容自动上移，且省去每秒重建开销）。
   - `rLog()`：`#log-panel` 按 `collapsed.log` 挂 `.collapsed` 类；h3 即标题行，折叠时不渲染日志列表（`logs` 数组照常维护，展开即恢复全部记录）。
4. **style.css**：
   ```css
   .collapse-toggle{cursor:pointer;user-select:none;font-size:12px;color:#999;...}
   @media(max-width:860px){
     #left-panel.collapsed,#log-panel.collapsed{max-height:none;height:auto;overflow:hidden;}
     #center-panel.collapsed{flex:0 0 auto;}
   }
   ```
   箭头使用 `▶︎`/`▼︎`（U+FE0E 变体选择符），iOS Safari 不渲染成蓝色播放按钮（v0.13.1）。

## 三、桌面端「栏位不动」与手机端「内容上移」的保证

- **桌面端**：三栏 flex 横排，左栏 `width:200px;flex-shrink:0`，右栏 `width:230px;flex-shrink:0`，中栏 `flex:1`。折叠只隐藏栏**内部**内容，栏宽与位置由 flex 规则固定，折叠任何面板其余两栏 x 坐标不变。
- **手机端（≤860px）**：`#game` 纵向排列。折叠块不渲染后下方内容上移。关键点：中栏 `flex:1`（flex-grow）会拉伸填满 `#game` 的 `min-height:calc(100vh - 32px)`，若折叠后内容总高度小于最小高度，省出的空间会被中栏吸收，「谷中见闻」不会上移；因此窄屏下 `#center-panel.collapsed{flex:0 0 auto}`，折叠后下方内容真正自动上移。左右栏展开时 `max-height:160px` 内滚动，折叠时 `max-height:none` 收起到标题行高度。

## 四、风险点与对策

| 风险 | 对策 |
|------|------|
| `rTC()`/`rRes()` 每秒重建 innerHTML，DOM 上的展开状态会丢失 | 折叠状态存 JS 变量 + localStorage，渲染时读取，不依赖 DOM |
| 标题行含动态内容（当前页签名） | 每次渲染从 TABS 取当前页签名重新生成 |
| 内联 onclick 找不到函数 | `toggleCollapse` 在 ui.js 顶层以 function 声明（全局） |
| 悬浮信息面板残影 | hp 面板在栏 body 内，随 body 一起不渲染，无孤儿弹层 |
| 远行常驻进度条被误折叠 | `#exp-status` 在 `#tc` 之外、独立于折叠组，中栏折叠时进度条仍显示并推进 |
| 折叠时日志丢失 | `logs` 数组照常维护，仅渲染跳过；展开后完整恢复 |
| 点击谷中见闻标题不立即生效（实测发现） | `rAll()` 不含 `rLog()`，日志面板只在 `log()` 时重渲染；`toggleCollapse` 末尾补调 `rLog()`，点击立即折叠/展开（v0.13.6 修复） |
| 折叠时游戏逻辑受影响 | 折叠仅跳过 body 拼接，不改变任何状态/事件/tick 逻辑；展开后按钮照常可用 |
| 旧存档兼容 | 不触碰 `fhSave` 与 `migrate()`，零存档风险 |
| iOS 箭头渲染成 emoji | U+FE0E 变体选择符（v0.13.1 已修复） |

## 五、验证清单（playwright 实测，2026-10-30）

- [x] 三处标题点击后 body 隐藏/恢复、箭头 ▼︎/▶︎ 翻转
- [x] 折叠状态刷新页面后保留（localStorage.fhCollapsed）
- [x] 手机视口 390×844：折叠资源面板+中栏后，谷中见闻显著上移
- [x] 桌面视口 1280×800：折叠前后三栏 x 坐标不变
- [x] 无 JS 报错；远行常驻进度条不受中栏折叠影响（折叠时仍持续推进）
- [x] 折叠状态下切页签、展开后建造/研究等功能正常
- [x] 遗光日志暗金变色与折叠同版回归：日志染色不影响折叠渲染
