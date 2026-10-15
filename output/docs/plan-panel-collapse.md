# 面板折叠功能方案（v0.12.0）

> 状态：已确认，按此方案实施。
> 需求来源：手机端资源/内容太多时，想看「谷中见闻」要一直往下拉；希望各栏可折叠，折叠后下方内容自动上移。电脑端面板可折叠，但三栏位置不动。

## 一、折叠项清单（点击标题行切换 ▾/▸）

| 位置 | 分组 | key | 标题来源 |
|------|------|-----|----------|
| 左栏 | 资源面板（狐狸信息+资源列表） | `res` | 新增「资源」标题行 |
| 右栏 | 谷中见闻（日志列表） | `log` | 现有 h3，改为可点击 |
| 营火 | 采集 | `b_gather` | 新增「采集」标题行 |
| 营火 | 建筑 | `b_build` | 新增「建筑」标题行 |
| 营火 | 灵术 | `b_spell` | 复用现有「灵术」res-cat |
| 村落 | 职业 | `v_job` | 新增「职业」标题行（满意度头行常显） |
| 工坊 | 制作配方 | `c_craft` | 新增「制作配方」标题行 |
| 研究 | 可研究 | `r_avail` | 新增「可研究」标题行 |
| 研究 | 已完成 | `r_done` | 复用现有「已完成」res-cat |
| 山外 | 进行中的远行 | `w_active` | 复用现有 res-cat |
| 山外 | 远行目的地 | `w_dest` | 复用现有 res-cat（保留「队伍 x/y」计数） |
| 山外 | 商队 | `w_caravan` | 复用现有 res-cat |
| 山外 | 山外拾遗 | `w_narr` | 复用现有 res-cat |

## 二、技术方案

1. **状态存储**：`collapsed = {}`（ui.js 模块级变量），持久化到 `localStorage.fhCollapse`。
   - 属 UI 偏好，独立于存档：不进 `fhSave`、不进存档码，跨存档共享。
   - `localStorage` 不可用时 try/catch 退化为会话级折叠，不影响游戏。
2. **交互函数**（ui.js 顶层声明，供内联 onclick 调用）：
   - `toggleSec(key)`：翻转状态 → 写 localStorage → `rAll(); rLog();` 立即重渲染。
   - `secHdr(key, label, extra)`：生成统一标题行
     `<div class="res-cat sec-hdr" onclick="toggleSec('key')"><span class="sec-caret">▾/▸</span> label extra</div>`。
3. **渲染改造**：
   - `rTC()`：各组先输出 `secHdr(...)`，`collapsed[key]` 为真时跳过组 body 的拼接（body 不进 DOM，下方内容自动上移）。
   - `rRes()`：按 `collapsed.res` 设置 `#res-body` 的 display 与 `#res-caret` 字符。
   - `rLog()`：按 `collapsed.log` 设置 `#log-list` 的 display 与 `#log-caret` 字符（日志数据照常维护，仅不显示）。
4. **index.html**：
   - 左栏：新增「资源」标题行，`#fox-info` 与 `#res-list` 包进 `#res-body`。
   - 右栏：h3 内加 `#log-caret`，h3 加 onclick。
5. **style.css**：
   ```css
   .sec-hdr{cursor:pointer;user-select:none;-webkit-user-select:none;}
   .sec-caret{display:inline-block;width:10px;color:#aaa;font-size:10px;}
   #log-panel h3 .sec-caret{color:#bbb;}
   ```

## 三、桌面端「栏位不动」的保证

三栏为 flex 布局：左栏 `width:200px; flex-shrink:0`，右栏 `width:230px; flex-shrink:0`，中栏 `flex:1`。折叠只隐藏栏**内部**内容，栏宽与位置由 flex 规则固定，因此桌面端折叠任何面板，其余两栏的 x 坐标都不变。手机端（≤860px）为纵向排列，折叠块从文档流移除后，下方内容自然上移。

## 四、风险点与对策

| 风险 | 对策 |
|------|------|
| `rTC()` 每秒重建 innerHTML，DOM 上的展开状态会丢失 | 折叠状态存 JS 变量 + localStorage，渲染时读取，不依赖 DOM |
| 标题行含动态内容（远行目的地「队伍 x/y」） | `secHdr` 的 `extra` 参数原样保留 |
| 条件渲染的组（灵术/已完成/进行中的远行等可能整组不出现） | 组不渲染时其 key 无副作用，状态静默保留 |
| 内联 onclick 找不到函数 | `toggleSec` 在 ui.js 顶层以 function 声明（全局） |
| 悬浮信息面板残影 | hp 面板在组 body 内，随 body 一起不渲染，无孤儿弹层 |
| 远行常驻进度条被误折叠 | `#exp-strip` 在 `#tc` 之外、独立于任何折叠组，不受影响 |
| 旧存档兼容 | 不触碰 `fhSave` 与 `migrate()`，零存档风险 |

## 五、验证清单（playwright 实测）

- [ ] 各分组标题点击后 body 隐藏/恢复、caret ▾/▸ 翻转
- [ ] 折叠状态刷新页面后保留（localStorage）
- [ ] 手机视口 390×844：折叠资源面板+营火各组后，谷中见闻显著上移
- [ ] 桌面视口 1280：折叠前后三栏 x 坐标不变
- [ ] 无 JS 报错；远行常驻进度条不受折叠影响
- [ ] 折叠状态下建造/研究/施法等功能正常（展开后按钮可用）
