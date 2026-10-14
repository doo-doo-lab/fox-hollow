# 面板折叠功能 · 实施方案（v0.12.0）

> 状态：已自查确认，按此实施
> 需求来源：手机端资源太多时，想看「谷中见闻」要一直往下拉；希望各栏可折叠，折叠后下面内容自动上移。电脑端面板可折叠，但各列位置不动。

## 一、折叠对象（每一栏）

| # | 对象 | 点击热区 | 折叠后效果 |
|---|------|----------|-----------|
| 1 | 资源面板（左栏） | 新增「资源 ▾」标题行 | 隐藏 #fox-info 与 #res-list，仅剩标题行 |
| 2 | 各页签内容区（中栏，营火/村落/工坊/研究/山外 逐个独立记忆） | 页签栏右端新增「▾/▸」折叠开关 | 隐藏 #tc 内容，页签栏保留（可切页签、可再展开） |
| 3 | 谷中见闻（右栏） | 现有「谷中见闻」h3 标题 | 隐藏 #log-list，仅剩标题行 |

## 二、布局行为

- **手机端（≤860px，竖排 flex-column）**：折叠即 `display:none` 内容，面板高度收缩为标题行高度，下方内容自动上移（flex 自然回流，无需 JS 计算）。原 `max-height:160px` 只是上限，不阻碍收缩；仍在 media query 中对折叠态补 `max-height:none` 兜底。
- **桌面端（三栏横排）**：折叠只隐藏栏内内容，`#left-panel`（200px）/`#center-panel`（flex:1）/`#log-panel`（230px）宽度与位置全部不变——满足「各列的位置不动」。

## 三、实现改动

### index.html
- `#left-panel` 顶部加 `<div class="panel-hd" onclick="togglePanel('res')">资源 <span class="caret" id="res-caret">▾</span></div>`
- `#log-panel` 的 h3 加 `class="panel-hd"`、`onclick="togglePanel('log')"` 与 caret span

### ui.js
- 新增 `uiPref` 状态：`{ resCollapsed, logCollapsed, tcCollapsed: {b,v,c,r,w} }`，存 **localStorage 独立键 `fhUI`**，不进游戏存档 G（不影响存档码/migrate，符合 RULES 第 4 条）
- `togglePanel(which)` / `toggleTabContent()`：翻转状态 → 切换容器 `collapsed` class → 更新 caret（▾/▸）→ 持久化
- `applyPanelCollapse()` / `applyTcCollapse()`：启动与切页签时按状态恢复 class
- `rTabs()` 末尾追加折叠开关；页签 onclick 追加 `applyTcCollapse()`（每页签独立记忆折叠态）
- `startGame()` 初始化时调用两个 apply 函数

### style.css
- `.panel-hd`（可点击标题样式）、`.tab-collapse`（页签栏右端开关，`margin-left:auto`）
- `#left-panel.collapsed #fox-info, #left-panel.collapsed #res-list {display:none}`
- `#log-panel.collapsed #log-list {display:none}`
- `#tc.collapsed {display:none}`
- media query 内折叠态 `max-height:none` 兜底

## 四、风险自查（已逐项核对代码）

1. **每 5 tick 全量重建 DOM 会不会冲掉折叠态？** `rRes/rLog/rTC` 只重写容器 `innerHTML`（子节点），class 挂在容器自身（#left-panel/#log-panel/#tc），不受影响；页签栏折叠开关由 `rTabs()` 从 `uiPref` 读取状态渲染，重建后一致。✅
2. **切页签后折叠态错乱？** 每页签独立 key（tcCollapsed[curTab]），页签 onclick 链 `curTab=…;rTabs();rTC();applyTcCollapse()` 同步 class。✅
3. **悬浮面板（hp）定位代码受影响？** 折叠内容 `display:none` 不触发 mouseover，`position:fixed` 面板不依赖父级布局。✅
4. **日志继续写入被折叠的面板？** `log()→rLog()` 照常更新隐藏 DOM，展开即见，无副作用。✅
5. **抉择事件弹窗 / 存档码弹窗？** modal 为 fixed 覆盖层，与折叠无交互。✅
6. **caret 字符 ▾/▸ iOS 渲染？** 几何形状字符（非 emoji），各平台字体均有字形；避免使用 emoji。✅
7. **存档兼容？** 不新增 G 字段，`migrate()` 无需改动；`fhUI` 读取失败时 try/catch 回退空对象。✅
8. **桌面端「各列位置不动」？** 三栏宽度均由 CSS 固定/flex 分配，折叠不改宽度属性。✅

## 五、验收标准

- 手机端：折叠资源面板 + 当前页签内容后，谷中见闻无需长距离滚动即可看到
- 桌面端：折叠任一栏，其余两栏位置/宽度不变
- 刷新页面后折叠状态保持
- 游戏逻辑（tick、远行、日志、存档）行为与改动前一致
