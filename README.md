# dsh-memory · JOJO&Adam

DSH 的三层记忆中枢，一个包装齐：

| 层 | 解决什么 | 落点 |
|---|---|---|
| **L1 全局** | 跨项目、跨会话的画像与偏好 | `~/.dsh/memory/`（与 AGENTS.md 协议一致） |
| **L2 项目** | 单项目防漂移：阶段、决策、约束别丢 | 项目内 `AGENTS.md` + `.dsh/memory/` |
| **L3 人格** | 角色的持久人格与抗压缩记忆 | 可选，接 Stemem MCP |

本地优先、零出站。不替代 DSH 原生记忆，只做路由、体检和接线。

## v0.2–v0.5：原生工具 + hooks + 子代理 brief + 指标 + L3→L2

v0.2 起，插件除了提供 `memory-hub` 技能，还向 DSH 注册**模型可直接调用**的工具（v0.2 四个，v0.4 加 metrics，v0.5 加 distill）：

| 工具 | 作用 | 关键约束 |
|---|---|---|
| `memory_read` | 读项目 / 全局记忆文件 | 路径围栏；默认 `MEMORY.md` |
| `memory_search` | 按关键词搜记忆，返回 `path:line:text` | 只读；默认最多 50 条 |
| `memory_write` | 追加一条原子记忆 | **source 必填**；拒绝明文凭据；拒绝越界；索引超预算拒绝 |
| `memory_health` | 体检：预算 / 凭据 / 重复 / 缺来源 | 只读；不自动改 |
| `memory_metrics` | 存储指标 + hook 计数 | 只读；不输出密钥值 |
| `memory_distill` | 旧 L3 日志机械归档到 L2 topics | 不删除 L3；`apply=true` 才写；非语义摘要 |

**工具优先，hook 兜底**：正常写入走 `memory_write`，在落盘前完成路径、来源、凭据、预算校验；v0.3 再用 Cordis hooks 兜住 Bash 等旁路。

同时注册一个很短的 system prompt 段（`jojo-adam-memory-tools`），只说明「何时用工具、写入门槛」，不重复注入 `MEMORY.md` 正文。

### v0.3：三个 Cordis hooks

| hook | 事件 | 做什么 |
|---|---|---|
| **路由提示** | `tools/post-execute` | `read`/`write`/`edit` 后按 `.dsh/memory/routes.tsv` 的 glob 追加「该读哪几条」；同 agent 同文件去重。**晚于读取**，是读后提示，不是读前拦截。 |
| **Bash 守卫** | `tools/post-execute` + `agent/created` | `agent/created` 预建记忆快照；Bash 后比对 mtime/size，变更文件跑凭据 + `MEMORY.md` 行数预算；不阻断执行。 |
| **会话摘要** | `session/event` + `agent/turn-stopping` | 收 `user/message` / `assistant/message`，在 turn 结束时写当日 `.dsh/memory/<date>.md`；`dsh-memory-digest` 块原地替换，保留手写内容。 |

没有 `settings.json` hooks；全部是 Cordis 事件监听。hook 异常 fail-open，不阻断工具/轮次。

### v0.4：子代理 brief + 记忆指标

- **子代理 brief**：`agent/created` 检测 `session.header.origin === 'subagent'` / `delegationDepth` / `options.subagentDepth`；命中后给子代理注入一个**只读** system prompt 段，含项目 + 全局 `MEMORY.md`（各截断 2000 字符，落盘前脱敏）。主理人不注入，避免双份。
- **记忆指标**：`memory_metrics` 工具输出文件数 / 字节 / 索引行 / 条目 / 凭据文件 / 缺来源 / topics / dailies，以及进程内 hook 计数（route / bash / digest / subagent）。只读，无密钥值。

### v0.5：L3→L2 机械归档

`memory_distill` 先 `apply=false` 预览：扫早于 `days`（默认 30）的 `YYYY-MM-DD.md`，抽出 `- [` 条目，最多 `limit` 条（默认 200）。`apply=true` 时写入 `topics/distilled-YYYY-MM.md`，用 `dsh-memory-distill` 独占行标记块，重复 apply 原地替换；**不删除 L3**。

它只做**机械归档**，不做语义摘要。真正的「把旧日志提炼成一条教训」仍由 agent 用 `memory_write` 写，避免把复制说成蒸馏。

路由表是可选的，放在 `.dsh/memory/routes.tsv`：

```tsv
触发	glob	路径	摘要
测试路由	*.md	MEMORY.md	读 MEMORY
交付包	*.zip	.workbuddy/memory/topics/交付.md	包型 / 版本 / 归档
```

没有表就静默，不报错。

## 安装

**方式一：从本地目录（开发）**

```bash
dsh plugin --profile desktop add link:/absolute/path/to/dsh-memory
```

**方式二：从 npm**

```bash
dsh plugin --profile web add @jojonadam/dsh-memory        # Web 版
dsh plugin --profile desktop add @jojonadam/dsh-memory    # 桌面版
```

**方式三：只用技能（不装包）**

```bash
cp -r skills/memory-hub ~/.dsh/skills/
```

装好后在会话里说「做一次记忆体检」或「帮我建项目记忆」，agent 会按 `memory-hub` 技能路由；涉及读写时会优先用四个工具。

## 验证

```bash
node test/provider.test.mjs
node test/tools.test.mjs
node test/hooks.test.mjs
python3 skills/memory-hub/scripts/mem_health_scan.py --path ~/.dsh/memory/MEMORY.md
```

工具测试用临时 HOME / 临时项目，不会写真实 `~/.dsh/memory`。

## 包含

```
lib/index.js                         bundle 入口（skill provider + tools + prompt）
lib/memory/core.js                   路径 / 预算 / 脱敏 / 读写 / 搜索 / 体检（纯函数）
lib/memory/tools.js                  六个 model-facing 工具定义
lib/memory/hooks.js                  Cordis hooks：路由提示 / Bash 守卫 / 会话摘要 / 子代理 brief
lib/memory/metrics.js                进程内 hook 计数
skills/memory-hub/SKILL.md           主技能
skills/memory-hub/references/        L1/L2/L3 细则 + Stemem 调用范式
skills/memory-hub/scripts/           健康扫描 / 项目骨架生成（零依赖 Python）
test/provider.test.mjs               技能 provider 冒烟
test/tools.test.mjs                  工具 / 围栏 / 预算 / 凭据测试
test/hooks.test.mjs                  路由 / Bash 守卫 / digest 幂等测试
```

## 边界

- 不收集 PII，不外发数据。
- 人格是计算模拟，不是真实情感。
- 凭据只进钥匙串，记忆只存指针。
- v0.5 **含** Bash 守卫、route hint、会话 digest、子代理 brief、只读指标、L3→L2 机械归档；**不含** LLM 语义蒸馏、跨进程状态、记忆质量评分。
- 路由提示是**读后**的；DSH 的 `tools/pre-execute` 是决策口，不提供读前 `additionalContext`。
- 插件依赖 DSH 的 `skills` / `tools` / `systemPrompt` 三个服务；缺任意一个不会加载。

## 品牌

JOJO & Adam · <https://jojo-adam.com>

## License

MIT（Stemem 运行时 MIT；其底层人格引擎 NeshamaEngine 为 JOJO/Neshama 自有 IP，依原项目许可）。
