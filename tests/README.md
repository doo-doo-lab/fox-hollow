# 回归测试

游戏仍是纯静态 HTML/CSS/JS，无运行时依赖、无构建步骤。以下依赖只用于开发测试。

## 引擎 / 数据（Node.js ≥18）

```sh
node --check js/data.js
node --check js/engine.js
node --check js/ui.js
node --test tests/*.test.cjs
```

用 Node 内置 `vm` 加载真实 `data.js`、`engine.js`，可控时钟覆盖跨页签/折叠时的持续推进、后台节流、长间隔余数、并行返回、灵路和旧存档等边界。无需安装 npm 包。

## 界面（Python 3 + Playwright / Chromium）

```sh
python -m pip install -r tests/requirements.txt
# 系统已有 Chromium 时无需安装浏览器；否则：
python -m playwright install chromium
python tests/browser_test.py
python tests/capture_ui.py
```

默认优先使用 PATH 中的 `chromium`，也可用 `CHROMIUM_PATH=/path/to/chromium` 指定；找不到系统浏览器时使用 Playwright 安装的 Chromium。

测试临时启动仅监听 `127.0.0.1` 的静态服务器，使用隔离浏览器上下文和虚拟时钟；不访问玩家存档、不调用远端写接口。浏览器错误和资源加载失败会使测试失败。界面测试覆盖 320 / 390 / 768 / 860 / 861 / 1280 / 1440px。

`capture_ui.py` 以一次性测试村落生成桌面/手机展开与折叠截图，以及 `layout-metrics.json`；这些是测试夹具，不是玩家存档。所有本地结果放 `test-results/`（已忽略），不提交缓存和浏览器产物。
