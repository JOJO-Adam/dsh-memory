---
name: memory-hub
description: "DSH 三层记忆中枢：全局（~/.dsh/memory 用户画像/偏好/决策/教训）、项目（AGENTS.md + .dsh/memory 防漂移）、人格（Stemem MCP 持久人格）。当用户说 AI 记不住、跨会话漂移、要建或修项目记忆、要接人格记忆、要做记忆体检查时使用。本地优先、零出站；含 memory_read/search/write/health 原生工具。By JOJO&Adam。"
whenToUse: "记忆 / 忘 / 漂移 / drift / 跨会话 / 项目记忆 / MEMORY.md / 人格 / persona / Stemem / 压缩失忆 / compaction 时"
license: MIT
---

# 记忆中枢 · DSH 版

> 一个 Skill 管三层记忆：**你是谁**（全局）、**这个项目别漂**（项目）、**你的 AI 角色有自己的人格和记忆**（人格）。
> 本地优先、零出站；不替代 DSH 原生记忆，只做路由、体检和接线。

## 0. 一句话

AI 协作的记忆有三件事要管：**跨项目的你是谁**、**单个项目别漂**、**角色的人格与记忆**。本 Skill 是这三层的统一入口——先体检，再按层路由，不重复造轮子。

## 0.1 原生工具（v0.2 起）

本插件已注册四个 model-facing 工具，**优先用工具，不要用通用 read/write 手改记忆**：

- `memory_read`：读项目 / 全局记忆文件，路径围栏；
- `memory_search`：按关键词搜，回答「上次 / 之前 / 决定」前先搜；
- `memory_write`：追加一条原子记忆，**source 必填**，拒绝明文凭据 / 越界 / 超预算；
- `memory_health`：只读体检（预算 / 凭据 / 重复 / 缺来源）。

正常写入走 `memory_write`；v0.3 已接 Cordis hooks：Bash 变更守卫、`tools/post-execute` 路由提示（读后）、`agent/turn-stopping` 当日摘要。路由提示按 `.dsh/memory/routes.tsv` 的 glob 匹配，没有表就静默。

## 1. 何时调用

- **全局层**：出现新的跨项目偏好 / 身份澄清 / 长期约定，需要写进 `~/.dsh/memory/`。
- **项目层**：新开或接手一个项目要先建记忆体系；`MEMORY.md` 开始膨胀、自相矛盾；旧决策仍被当铁律导致事故。
- **人格层**：要给 agent / 角色装配持久人格 + 抗压缩记忆；或要接入 Stemem MCP。
- **不知道用哪个**：直接调用本 Skill，按第 2 节路由。

触发关键词：记忆 / memory / 忘 / 漂移 / drift / 人格 / persona / SoulSpec / 跨会话 / 项目记忆 / 全局偏好 / 压缩失忆 / compaction。

## 2. 三层路由

| 层 | 能力 | 权威实现 | 本 Skill 的动作 |
|---|---|---|---|
| **L1 全局** | 跨项目、跨会话的画像与偏好 | `~/.dsh/memory/` + `~/.dsh/AGENTS.md`（用户级基线） | 归纳方法论 → `references/layer1-global.md` |
| **L2 项目** | 单项目防漂移架构 | 项目根 `AGENTS.md` + `.dsh/memory/` | 生成骨架、跑体检 → `references/layer2-project.md` |
| **L3 人格** | 角色持久人格 + 记忆 runtime | **Stemem MCP**（自研，本地 stdio） | 接线 + 调用范式 → `references/layer3-persona.md`、`references/stemem-calls.md` |

**边界**：不替代 DSH 原生记忆；不把项目正文塞进全局索引；不内置任何云端/出站。

## 3. L1 全局记忆（`~/.dsh/memory/`）

布局与 `~/.dsh/AGENTS.md` 保持一致，**以 AGENTS.md 为准**，本 Skill 不另立一套：

```
~/.dsh/memory/
  MEMORY.md       索引：一条一行，≤120 行
  profile.md      type: user        身份与长期背景
  preferences.md  type: preference  工具 / 流程 / 沟通偏好
  projects.md     type: project     项目、路径、约定
  decisions.md    type: decision    技术决策 + 理由
  lessons.md      type: lesson      踩过的坑
  inbox.md        type: reference   未核实观察
```

写入门槛（满足任一条才写）：稳定偏好 → `preferences.md`；被纠正/踩坑 → `lessons.md`；影响后续的技术决策 → `decisions.md`；持久事实 → `profile.md` / `projects.md`。

格式：`- [YYYY-MM-DD] 原子事实（来源：<session-id 或 url>；范围：全局|项目）`。

冲突用**取代不覆盖**：追加新条，旧条行尾标 `→ 已由 [日期] 取代`。

体检与回忆：

```bash
node ~/.dsh/memory/bin/memory-lint.mjs          # 预算 / 来源 / 投毒形状
node ~/.dsh/memory/bin/recall.mjs grep "<关键词>"  # 翻历史会话原文
```

细则（三文件法、时间衰减、解决膨胀）见 `references/layer1-global.md`。

## 4. L2 项目记忆

最小骨架（一条命令生成，已存在不覆盖）：

```bash
python3 scripts/gen_project_memory.py \
  --project-path <项目目录> --project-name <名称> [--specs]
```

生成：

```
<项目>/AGENTS.md                     项目指令（存在则跳过，只补不覆盖）
<项目>/PROJECT_CONTEXT.md            路线图级锚点（真相源）
<项目>/.dsh/memory/MEMORY.md         指针层（≤200 行，只存锚点）
<项目>/.dsh/memory/YYYY-MM-DD.md     当日日志（append-only）
<项目>/SPECS/00-INDEX.md             可选：真相源索引
```

冷启动 5 步（写进锚点顶部，每次新会话照做）：读 `AGENTS.md` → 读 `PROJECT_CONTEXT.md` → 读 `.dsh/memory/MEMORY.md` → 读当日日志 → 规则 vs 记忆分离核对。

体检：

```bash
python3 scripts/mem_health_scan.py --path <项目>/.dsh/memory/MEMORY.md
```

若用户另装了 `project-memory-protocol` skill，L2 深化交给它，本 Skill 只做入口（见 `references/layer2-project.md`）。

## 5. L3 人格记忆（Stemem MCP）

> Stemem 是本地 stdio MCP：给 agent 一套会演化、跨会话确定性恢复的人格态 + SoulSpec 灵魂档案。9 个工具：`init / event / tick / satisfy / snapshot / autostep / intervene / status / generate_soul`。运行时 MIT；底层人格引擎 NeshamaEngine 为 JOJO/Neshama 自有 IP，非 MIT。

DSH 接线：在 `~/.dsh/cordis.patch.yml` 追加（按你现有 MCP 行的写法）：

```yaml
- insert:
    - id: mcp-stemem
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: stemem
        transport: stdio
        command: npx
        args: ["-y", "stemem"]
        env: {}
        toolCallTimeoutMs: 60000
        failOnStartupError: false
```

最小生命周期：

```
init → event* → tick → snapshot → generate_soul
（建人格）（喂事件）（跨会话恢复）（取注入串）（导出灵魂档案）
```

**诚实边界**：人格是计算模拟（状态机 + SoulSpec），不是真实情感；不得向用户宣称 AI 真有感情。数据全在本地，零出站。

详见 `references/layer3-persona.md` 与 `references/stemem-calls.md`。

## 6. 自含工具（零依赖，仅 Python 标准库）

- **`scripts/mem_health_scan.py`**：L1 体检——规模（行数/字符越阈值告警）、矛盾漂移（已废规则仍当 active 铁律）、明文凭据、重复结构化键。

  ```bash
  python3 scripts/mem_health_scan.py [--path ~/.dsh/memory/MEMORY.md] [--limit-chars 4000] [--limit-lines 200]
  ```

- **`scripts/gen_project_memory.py`**：L2 骨架生成器（见第 4 节）。

两个脚本不依赖下游 Skill 是否安装：先扫健康、再生成骨架，最后按需路由到 Stemem。

## 7. 验收 DoD

- **L1**：能对任一 `MEMORY.md` 跑出健康报告（规模 / 矛盾 / 凭据 / 重复键），`memory-lint.mjs` 无 error。
- **L2**：能一键生成项目记忆骨架，文件齐全、不覆盖已有；冷启动 5 步可执行。
- **L3**：能给出 Stemem 接线片段并完成一次 `init → event → snapshot` 冒烟。
- **边界**：不重写平台原生记忆，不把正文塞进索引，不产生任何外发请求。

## 8. Quickstart

1. **先体检**：`python3 scripts/mem_health_scan.py --path ~/.dsh/memory/MEMORY.md`
2. **新项目建骨架**：`python3 scripts/gen_project_memory.py --project-path <dir> --project-name <名> --specs`
3. **项目防漂移**：按 `references/layer2-project.md` 执行冷启动 5 步。
4. **人格记忆（可选）**：按 `references/layer3-persona.md` 接 Stemem。
5. **跨项目偏好**：按 `references/layer1-global.md` 写 `~/.dsh/memory/`。

## 9. 合规与边界

- 本地优先、零出站；不收集 PII，不把用户数据发往第三方。
- 凭据一律进钥匙串（`security find-generic-password`），记忆只存指针，禁止明文。
- 不伪造、不夸大：人格是模拟，不是真人。

## 10. 维护

- 本 Skill 与 `~/.dsh/AGENTS.md` 的记忆协议保持一致；AGENTS.md 改预算/布局时同步本文件与 `references/`。
- Stemem 9 工具签名变更须同步 `references/stemem-calls.md`。
- 版本：见 `package.json`。
