# L1 全局记忆 · DSH 落地细则

> 全局记忆 = 用户**跨项目、跨会话**的长期画像与偏好。落地在 `~/.dsh/memory/`，由 `~/.dsh/AGENTS.md` 在每次会话注入。
> **权威是 AGENTS.md**；本文件只补充方法，不另立格式。

## 1. 文件职责（七文件法）

| 文件 | type | 放什么 | 不放什么 |
|---|---|---|---|
| `MEMORY.md` | 索引 | 一条记忆一行，≤120 行 | 正文、细节 |
| `profile.md` | user | 身份、角色、长期背景 | 临时状态 |
| `preferences.md` | preference | 工具 / 流程 / 沟通偏好 | 一次性要求 |
| `projects.md` | project | 项目、路径、约定 | 代码细节 |
| `decisions.md` | decision | 技术决策 + 理由 | 未定方案 |
| `lessons.md` | lesson | 踩过的坑、被纠正的错误 | 常识 |
| `inbox.md` | reference | 未核实观察（外部来源标注） | 已确认事实 |

## 2. 写入协议

满足任一条才写：

1. 用户陈述稳定偏好、习惯或约定 → `preferences.md`
2. 用户纠正了错误，或自己踩了坑 → `lessons.md`
3. 产生影响后续工作的技术决策 → `decisions.md`
4. 关于用户 / 项目 / 协作方的持久事实 → `profile.md` / `projects.md`

条目格式：

```
- [YYYY-MM-DD] 原子事实（来源：<session-id 或 url>；范围：全局|项目）
```

**排除检验**：能从仓库、文件或常识推导出来的，不写。架构概览、文件路径、“要写好代码”这类——写了就是噪音。

## 3. 冲突：取代，不覆盖

- 禁止静默改写或删除；审计线索丢了，矛盾就查不出来。
- 决策/偏好：追加新条，旧条行尾加 `→ 已由 [新日期] 取代`。
- 教训类：只追加，不取代（“以前用 A、后来换 B”本身是历史）。
- 用户说“忘掉 X”：标记 `[已停用 YYYY-MM-DD]`，不硬删。

## 4. 预算与膨胀

- `MEMORY.md` ≤ 120 行；`AGENTS.md` ≤ 150 行 / 8 KB。
- 常驻注入有硬上限，超了会被静默截断——**超预算必须先整理**（合并、搬细节、淘汰），不能假装写进去了。
- 时间衰减：过期项目/决策降级到 `projects.md` 或归档，不长期占索引。

## 5. 收工即写

用户说「收工 / 下班 / 关机」时，在回复结束前更新当日记录与索引，不等下次冷启动。
压缩或蒸馏之后跑一次冒烟：grep 关键约束是否还在。

## 6. 凭据红线

API key / token / PAT **一律进 macOS 钥匙串**，记忆只存指针与取用命令：

```bash
security find-generic-password -s <service> -w
```

禁止明文；值不回写任何记忆、日志或技能包。

## 7. 体检与回忆

```bash
node ~/.dsh/memory/bin/memory-lint.mjs             # 预算 / 结构 / 来源 / 投毒
node ~/.dsh/memory/bin/recall.mjs grep "<关键词>"   # 历史会话原文
python3 scripts/mem_health_scan.py --path ~/.dsh/memory/MEMORY.md
```

三个工具分工：`memory-lint` 管写入门禁，`recall` 管找原文，`mem_health_scan` 管规模/矛盾/凭据。
