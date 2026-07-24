# 协作规则

## 仓库结构

```
fox-hollow/
├── index.html          # 入口页面
├── css/
│   └── style.css       # 样式
├── js/
│   ├── data.js         # 数据定义（资源/建筑/职业/研究/工坊/灵术/事件）
│   ├── engine.js       # 游戏引擎（状态/计算/tick/存档/事件触发）
│   └── ui.js           # 界面渲染（日志/面板/Tab/悬浮面板）
├── docs/
│   ├── RULES.md        # 本文件
│   └── design.md       # 策划文档
└── reference/          # 参考资料（仅本地，不纳入版本控制）
```

## 不推送的内容

以下目录/文件仅保留在本地，**不得推送到远程仓库**：

- `reference/` — 猫国建设者中文 wiki 参考资料，体积大且为第三方内容，仅供开发时查阅。已写入 `.gitignore`。

## 快捷指令

- **用户说「git push」时**：立即执行 `git add` + `git commit` + `git push origin main`，将当前所有改动推送到远程仓库。不需要额外确认。
- **线上地址**：https://akira17189-create.github.io/fox-hollow/ （GitHub Pages，推送后自动更新）
- **GitHub PAT**：（已移除，请勿提交到仓库）

## 开发约定

1. **纯前端项目**：HTML + CSS + JS，不引入框架和构建工具。
2. **文件分工明确**：数据改 `data.js`，逻辑改 `engine.js`，界面改 `ui.js`，不跨文件混写。
3. **叙事文本风格**：冷幽默、有哲思、克制、口语化。短句（tip）不超过两句，不用感叹号。
4. **存档兼容**：任何新增状态字段必须在 `migrate()` 中补齐默认值，保证旧存档不崩。
5. **提交信息**：中文，简明扼要，说清改了什么、为什么改。
