# 协作规则

## 仓库结构

```
/workspace/
├── .git/               # Git 元数据（根目录）
├── reference/          # 参考资料（仅本地，不纳入版本控制）
├── uploads/            # 原始上传文件（不纳入版本控制）
└── output/             # Git 工作树 / 项目交付目录
    ├── index.html      # 入口页面
    ├── README.md
    ├── .gitignore
    ├── css/style.css
    ├── js/
    │   ├── data.js     # 数据定义
    │   ├── engine.js   # 游戏引擎
    │   └── ui.js       # 界面渲染
    ├── tests/          # 回归测试（不参与游戏加载）
    └── docs/
        ├── RULES.md
        ├── design.md
        ├── changelog.md
        └── panel-collapse-plan.md
```

此工作区的 `.git/config` 设置 `core.worktree=../output`，其余配置保留。提交路径相对于 `output/`，因此远端和 GitHub Pages 的入口仍为仓库根部 `index.html`；不能把本地目录包装误当作线上路径迁移。普通克隆仍使用 Git 默认目录结构。

## 不推送的内容

以下目录/文件仅保留在本地，**不得推送到远程仓库**：

- `reference/` — 猫国建设者中文 wiki 参考资料，体积大且为第三方内容，仅供开发时查阅。已写入 `.gitignore`。
- `uploads/`、本地测试临时产物和 `.git/config` 中的身份/凭据 — 不属于交付内容。

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
