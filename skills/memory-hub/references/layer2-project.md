# L2 项目记忆 · DSH 落地细则

> 项目记忆 = 单个项目的防漂移架构：让 AI 在长会话、多会话、压缩之后仍然知道“这个项目现在到哪了、什么不能动”。
> 本文件给最小可用骨架；深化可转交 `project-memory-protocol` skill（若已安装）。

## 1. 布局

```
<项目>/
  AGENTS.md                     项目指令：约定、边界、启动清单
  PROJECT_CONTEXT.md            路线图级锚点（真相源）：定位 / 阶段 / 决策 / 约束 / 开放问题
  .dsh/memory/MEMORY.md         指针层：≤200 行，只存锚点与指针
  .dsh/memory/YYYY-MM-DD.md     当日日志：append-only
  SPECS/00-INDEX.md             可选：规格真相源索引
```

原则：**正文在 `PROJECT_CONTEXT.md` 与日志，`MEMORY.md` 只放指针**。索引膨胀 = 漂移的前兆。

## 2. 冷启动 5 步

每次新会话（或压缩后）按顺序：

1. 读 `AGENTS.md`：项目指令与红线。
2. 读 `PROJECT_CONTEXT.md`：当前阶段、下一步、关键决策。
3. 读 `.dsh/memory/MEMORY.md`：锚点与指针。
4. 读当日日志：今天已经做过什么。
5. **规则 vs 记忆分离核对**：有没有“已废除但仍在被当铁律”的条目——这是最危险的漂移。

## 3. 何时写

- 每个实质性工作段落结束 → 追加当日日志（不覆盖）。
- 阶段变化 / 不可逆决策 → 更新 `PROJECT_CONTEXT.md` 的“阶段/决策”，并在 `MEMORY.md` 留一行指针。
- 发现旧规则失效 → 在原文标 `[已停用 YYYY-MM-DD]`，不删除。

## 4. 体检

```bash
python3 scripts/mem_health_scan.py --path <项目>/.dsh/memory/MEMORY.md
```

关注四类问题：规模超限、矛盾（已废规则仍 active）、明文凭据、重复结构化键。

## 5. 转交 project-memory-protocol（可选）

出现以下任一，调用它做深化，本 Skill 不再重复实现：

- 记忆文件反复膨胀、跨源矛盾多；
- 需要“记忆健康检查自动化 / 会话启动清单 / 人类记忆五层模型”；
- 记忆里躺着明文密钥、git remote 内嵌凭证。

转交时带上：项目锚点路径、当前阶段、已知漂移点、是否有凭据问题。

## 6. 边界

- 不把项目正文塞进全局 `MEMORY.md`（全局只索引）。
- 不替用户做项目判死 / 冻结决策。
- 不在项目里复制一份用户级偏好——偏好只有一份，在 `~/.dsh/memory/`。
