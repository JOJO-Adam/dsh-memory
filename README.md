# dsh-memory · JOJO&Adam

DSH 的三层记忆中枢，一个包装齐：

| 层 | 解决什么 | 落点 |
|---|---|---|
| **L1 全局** | 跨项目、跨会话的画像与偏好 | `~/.dsh/memory/`（与 AGENTS.md 协议一致） |
| **L2 项目** | 单项目防漂移：阶段、决策、约束别丢 | 项目内 `AGENTS.md` + `.dsh/memory/` |
| **L3 人格** | 角色的持久人格与抗压缩记忆 | 可选，接 Stemem MCP |

本地优先、零出站。不替代 DSH 原生记忆，只做路由、体检和接线。

## v0.2：原生记忆工具

v0.2 起，插件除了提供 `memory-hub` 技能，还向 DSH 注册四个**模型可直接调用**的工具：

| 工具 | 作用 | 关键约束 |
|---|---|---|
| `memory_read` | 读项目 / 全局记忆文件 | 路径围栏；默认 `MEMORY.md` |
| `memory_search` | 按关键词搜记忆，返回 `path:line:text` | 只读；默认最多 50 条 |
| `memory_write` | 追加一条原子记忆 | **source 必填**；拒绝明文凭据；拒绝越界；索引超预算拒绝 |
| `memory_health` | 体检：预算 / 凭据 / 重复 / 缺来源 | 只读；不自动改 |

**工具优先，hook 兜底**：正常写入走 `memory_write`，在落盘前完成路径、来源、凭据、预算校验；Bash 等旁路写入是 v0.3 的 hook 兜底范围。

同时注册一个很短的 system prompt 段（`jojo-adam-memory-tools`），只说明「何时用工具、写入门槛」，不重复注入 `MEMORY.md` 正文。

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
python3 skills/memory-hub/scripts/mem_health_scan.py --path ~/.dsh/memory/MEMORY.md
```

工具测试用临时 HOME / 临时项目，不会写真实 `~/.dsh/memory`。

## 包含

```
lib/index.js                         bundle 入口（skill provider + tools + prompt）
lib/memory/core.js                   路径 / 预算 / 脱敏 / 读写 / 搜索 / 体检（纯函数）
lib/memory/tools.js                  四个 model-facing 工具定义
skills/memory-hub/SKILL.md           主技能
skills/memory-hub/references/        L1/L2/L3 细则 + Stemem 调用范式
skills/memory-hub/scripts/           健康扫描 / 项目骨架生成（零依赖 Python）
test/provider.test.mjs               技能 provider 冒烟
test/tools.test.mjs                  工具 / 围栏 / 预算 / 凭据测试
```

## 边界

- 不收集 PII，不外发数据。
- 人格是计算模拟，不是真实情感。
- 凭据只进钥匙串，记忆只存指针。
- v0.2 **不含** Bash 写入拦截、route hint、会话 digest；这些是 v0.3 的 hook 层，不会假装已经做了。
- 插件依赖 DSH 的 `skills` / `tools` / `systemPrompt` 三个服务；缺任意一个不会加载。

## 品牌

JOJO & Adam · <https://jojo-adam.com>

## License

MIT（Stemem 运行时 MIT；其底层人格引擎 NeshamaEngine 为 JOJO/Neshama 自有 IP，依原项目许可）。
