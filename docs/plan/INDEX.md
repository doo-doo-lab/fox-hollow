# 计划文档导航

> 开发任何任务前，先读 [roadmap-v3.md](roadmap-v3.md)（2026-10-13 整合版，唯一路线图主入口），再读相关 branch-*.md 详细设计。
> 已废弃/已完成文档归档在 [archived/](archived/)，仅供历史参考。

## 2026-10-13 设计决议（最新结论，必读）

见 [roadmap-v3.md §〇](roadmap-v3.md)。要点速览：

1. 「谷声」恢复：累积进度指标 + 治理页签名 + 经济模型命名（详案 roadmap-v3 §三）
2. 页签定名七内容页签：**营火、村落、研究、造物、山外、风俗、谷声**（+成就）；宗教/玄学归属待裁决（roadmap-v3 §一 1.4）
3. Tier 1 内守/外拓砍掉；政体按「靠什么活」六分类重审（靠地/学/工/商/路/灵），正面效果必须改变玩法（roadmap-v3 §四）
4. 分支模型改为**方案 B：4 条平行分支**（工业/灵修/神启/通达，无主线/副线、不互斥），不限 25 小时（roadmap-v3 §二）
5. 玩家侧三大阶段：山谷（现状）→ 远望 → 轮回，猫国式渐进解锁（roadmap-v3 §二 2.1-2.2）
6. 由此产生的代码返工批次 R1-R6 + 待裁决清单 P1-P12（roadmap-v3 §五 5.5 / §九 9.4）

## 文档总览

| 文件 | 用途 |
|------|------|
| [roadmap-v3.md](roadmap-v3.md) | **主路线图**（2026-10-13 整合版）：决议记录 / 页签架构与方向系统 / 阶段与分支模型 / 谷声经济详案 / 政体审视 / 剩余任务（Phase 5 收尾 + Phase 6-7 + R 返工批次）/ 决策变更记录 |
| [branch-industry.md](branch-industry.md) | 工业分支详细设计（5 阶段，资源/建筑/研究/职业/配方/升级 + 终局 hook）。**内容设计表权威** |
| [branch-mystic.md](branch-mystic.md) | 灵修分支详细设计（5 阶段 + 灵术/灵契/寂石冥想 + 终局 hook） |
| [branch-divine.md](branch-divine.md) | 神启分支总览（4 阶段 A-D + 神恩系统 + 仪式/占卜/6 神 设计） |
| [branch-divine-doctrine.md](branch-divine-doctrine.md) | 神启-教团路（教令系统、圣堂圣战、神佑终局） |
| [branch-divine-mystery.md](branch-divine-mystery.md) | 神启-秘仪路（飞升阶梯、化神、飞升终局） |
| [branch-diplomat.md](branch-diplomat.md) | 通达分支（4 阶段 A-D + 声望/邦交系统 + 结局叙事） |

> ⚠ branch 文档中的「主线/副线」措辞按 2026-10-13 决议映射为**平行分支**（roadmap-v3 §二 2.3）；内容设计表（资源链/建筑/研究/职业/配方/升级数值）不受影响，仍为权威数据源。

## 开发流程文档

| 文件 | 用途 |
|------|------|
| [DEV_SOP.md](DEV_SOP.md) | 开发执行 SOP（每次开发前必读）：纪律、读取顺序、任务卡检查、commit 规则 |
| [DEV_PROMPTS.md](DEV_PROMPTS.md) | 开发循环 prompt 模板（复制粘贴给 AI agent）：Prompt A 执行 / Prompt B 检查 + 内容创作 / 阶段合规检查附录 |
| [../RULES.md](../RULES.md) | 协作规则：核心纪律 + UI 约定 + 资源 ID 规范 + 文档维护 + 常见错误 |

## 审计报告

| 文件 | 范围 | 工具 |
|------|------|------|
| [audit-pre-branch.md](audit-pre-branch.md) | branchLore 完成前所有 BD/UD/JD/CD 解锁链审计（历史） | [tools/audit-prelock.js](../../tools/audit-prelock.js) |

## AI 读取建议

文档体量较大但不拆分，原因：
1. AI 读取靠 `Grep ^##` 摸大纲 + `Read offset/limit` 精读章节即可
2. 拆分会引入"主+分"多文件同步负担，反而增加交叉一致性风险
3. 单任务开发只需读对应章节，不需要全文

**推荐读取流程**：
1. `Grep "^##" roadmap-v3.md` 摸大纲；先读 §〇 决议 + §九 9.4 待裁决清单
2. 找任务：`Read roadmap-v3.md §五`（Phase 5 剩余 / Phase 6-7 / R 返工批次）
3. 按需 `Read branch-*.md offset=... limit=...` 读详细设计
4. 已完成阶段的历史任务卡/勘误全文：[archived/roadmap-v2.md](archived/roadmap-v2.md)（只读）

## 任务索引（当前可开发项）

> roadmap-v3 §五 为唯一进度表。各 branch 文档**不按 Phase 分章**，而是按内容类型分章（资源/建筑/研究/职业/配方/升级各表内有 `### A 阶段` / `### B 阶段` 子节）。开发某任务时用 `Grep "### C 阶段"` 或 `Grep "Phase C"` 定位即可。

| 任务 | 内容 | roadmap-v3 章节 | 必读 branch 文档 |
|------|------|----------------|----------------|
| **Phase 5 收尾** | 5.3e ⏳ 秘仪研究+配方 → 5.3f 秘仪升级+飞升 3-4 门 → 5.3g 验收 → 5.4 通达深盟 → 5.5 阶段验收 | §五 5.2 | branch-divine-mystery（C 阶段）/ branch-diplomat（Phase C） |
| **R 返工批次**（待排期，建议 Phase 5.5） | R1 页签改造 / R2 谷声恢复 / R3 Tier 1 移除 / R4 政体改造 / R5 平行分支化 / R6 门控对齐 | §五 5.5 | —（依赖 §一/§三/§四 及 P1-P12 裁决） |
| Phase 6 远望 | 太空/灵途任务 1-4 + 神启 D + 通达共谷 | §五 5.3 | branch-industry / branch-mystic（E 前半）+ branch-divine(-doctrine/-mystery)（D）+ branch-diplomat（D） |
| Phase 7 终局与轮回 | 任务 5-8 + 5 终局 + 轮回 + hook 实装 | §五 5.4 | 各 branch 终局/hook 章节（industry §十一 / mystic §十八 / diplomat §十二） |

## 开发阻塞项（启动前必须先解决）

| 任务 | 必须先解决 |
|------|----------|
| **R 批次全部** | roadmap-v3 §九 9.4 待裁决清单中对应项（R1←P1 宗教归属；R4←P2/P3/P4/P5；R5←P6/P7 + 存档兼容策略） |
| **Phase 6** | R 批次完成（终局 UI 依赖最终页签结构）+ P1/P8 裁决 + E53 循环防护验证（§五 5.2） |
| Phase 7 | P6/P7 裁决（共谷终局地位、多终局抉择机制） |

## 与代码的关系

| 模块 | 主要数据来源 |
|------|-------------|
| `js/data.js` RD/BD/JD/UD/CD/UPGD | 各 branch-*.md 资源/建筑/职业/研究/配方/升级表 |
| `js/engine.js` 系统计算 | roadmap-v3 §三（谷声）/ §四（政体）/ §五 5.5（R 批次改动清单） |
| `js/ui.js` 页签结构 | roadmap-v3 §一 页签架构 v3 |
