# 狐狸谷物语 - 面板折叠功能设计方案

为了在手机端（窄屏）提供更好的交互体验，防止资源面板和操作面板内容过多时用户需要长时间下滑才能看到“谷中见闻”日志，我们设计了本套**无损折叠方案**。

本方案在保持电脑端三栏布局稳定的前提下，完美适配手机端的内容自动上顶。

---

## 一、核心设计思路

1. **持久化状态**：折叠状态保存在全局 `G.collapsed` 状态中，并写入自动/手动存档。用户刷新或跨设备迁移时，折叠状态依然保留。
2. **纯文字复古风**：折叠和展开的指示器采用符合项目极简风格的纯文字标识：
   - 展开状态：显示 `[－]`
   - 折叠状态：显示 `[＋]`
3. **两端自适应行为**：
   - **手机端**（屏宽 ≤ 860px）：折叠任意面板后，下方的内容会自动往上移动（顶上来），大幅缩短纵向滚动距离。
   - **电脑端**（屏宽 > 860px）：各面板宽度、列位置依然保持固定不变（各列位置不动），仅内容垂直折叠。

---

## 二、折叠区域与交互设计

我们为以下三个主要区域提供独立的折叠开关：

### 2.1 资源面板（左栏）
- **触发入口**：点击左侧栏顶部的“资源”标题栏。
- **指示器**：标题栏右侧显示 `[－]` 或 `[＋]`。
- **折叠效果**：隐藏 `#fox-info`（狐狸村民信息）和 `#res-list`（资源列表）。面板高度自动收缩。

### 2.2 营火/村落/工坊/研究/山外页签（中栏）
- **触发入口**：点击**当前已处于激活状态**的 Tab 页签按钮（例如：当前在“营火”页，再次点击“营火”页签）。
- **指示器**：激活态页签的右侧追加显示 `[－]` 或 `[＋]`。未激活的页签不显示，切换到新页签时默认保持展开。
- **折叠效果**：隐藏 `#tc`（Tab 内容展示区）。

### 2.3 谷中见闻日志（右栏）
- **触发入口**：点击日志栏顶部的“谷中见闻”标题。
- **指示器**：标题右侧显示 `[－]` 或 `[＋]`。
- **折叠效果**：隐藏 `#log-list`（日志信息流列表）。

---

## 三、代码具体改动方案

### 3.1 `index.html` 结构微调
为标题栏增加 `onclick` 点击事件和 `id` 标识，以便更新折叠状态文本。
```html
<!-- 资源面板头部 -->
<div id="left-panel">
  <div id="res-header" onclick="toggleCollapse('res')" style="cursor:pointer; font-size:12px; color:#999; margin-bottom:4px; text-transform:uppercase; letter-spacing:1px; font-weight:bold;">
    资源 <span id="res-header-toggle">[－]</span>
  </div>
  <div id="fox-info"></div>
  <div id="res-list"></div>
</div>

<!-- 日志面板头部 -->
<div id="log-panel">
  <h3 onclick="toggleCollapse('log')" style="cursor:pointer; user-select:none;">
    谷中见闻 <span id="log-header-toggle">[－]</span>
  </h3>
  <div id="log-list"></div>
</div>
```

### 3.2 `js/engine.js` 存档与逻辑更新
1. 在 `migrate()` 函数中，补齐 `G.collapsed` 默认状态：
   ```js
   G.collapsed = G.collapsed || { res: false, tc: false, log: false };
   ```
2. 新增全局辅助函数：
   ```js
   function toggleCollapse(type) {
     G.collapsed[type] = !G.collapsed[type];
     rAll();
   }
   ```

### 3.3 `js/ui.js` 渲染逻辑适配
1. **资源渲染 (`rRes`)**：根据 `G.collapsed.res` 隐藏/显示内部元素并更新指示符。
   ```js
   var infoEl = document.getElementById('fox-info');
   var listEl = document.getElementById('res-list');
   var toggleEl = document.getElementById('res-header-toggle');
   if (G.collapsed.res) {
     infoEl.style.display = 'none';
     listEl.style.display = 'none';
     if (toggleEl) toggleEl.textContent = '[＋]';
   } else {
     infoEl.style.display = 'block';
     listEl.style.display = 'block';
     if (toggleEl) toggleEl.textContent = '[－]';
   }
   ```
2. **Tab 栏渲染 (`rTabs` 和点击处理)**：
   点击激活状态下的 Tab 时触发 `#tc` 的折叠切换：
   ```js
   function rTabs() {
     document.getElementById('tabs').innerHTML = TABS.filter(function(t) {
       return !t.uq || chk(t.uq);
     }).map(function(t) {
       var suffix = '';
       if (t.id === curTab) {
         suffix = G.collapsed.tc ? ' [＋]' : ' [－]';
       }
       return '<div class="tab' + (t.id === curTab ? ' on' : '') +
         '" onclick="clickTab(\'' + t.id + '\')">' + t.n + suffix + '</div>';
     }).join('');
   }

   function clickTab(id) {
     if (id === curTab) {
       G.collapsed.tc = !G.collapsed.tc;
     } else {
       curTab = id;
       G.collapsed.tc = false; // 切换页签时，新页签默认展开
     }
     rTabs();
     rTC();
   }
   ```
3. **Tab 内容渲染 (`rTC`)**：
   ```js
   var el = document.getElementById('tc');
   if (G.collapsed.tc) {
     el.style.display = 'none';
     return;
   }
   el.style.display = 'block';
   // ...后续正常渲染
   ```
4. **日志渲染 (`rLog`)**：根据 `G.collapsed.log` 隐藏/显示列表并更新指示符。
   ```js
   var el = document.getElementById('log-list');
   var toggleEl = document.getElementById('log-header-toggle');
   if (G.collapsed.log) {
     el.style.display = 'none';
     if (toggleEl) toggleEl.textContent = '[＋]';
   } else {
     el.style.display = 'block';
     if (toggleEl) toggleEl.textContent = '[－]';
   }
   ```

---

## 四、安全与兼容性验证

- **自适应兼容**：手机端的 `max-height: 160px` 属于最大高度限制，当内容折叠收缩后，由于 `display: none`，外部容器会自动收缩至头部高度，下方兄弟节点随之自动上顶，完全符合设计目标。
- **无框架兼容**：仅使用原生 JS DOM 操作（`style.display` 切换），不依赖任何第三方 UI 库，体积为零，性能优异。
- **存档向后兼容**：已将默认值补齐纳入 `migrate()` 流程，任何历史版本的玩家存档均能无缝加载，不受任何影响。
