# dsh-memory · JOJO&Adam

DSH 的三层记忆中枢，一个包装齐：

| 层 | 解决什么 | 落点 |
|---|---|---|
| **L1 全局** | 跨项目、跨会话的画像与偏好 | `~/.dsh/memory/`（与 AGENTS.md 协议一致） |
| **L2 项目** | 单项目防漂移：阶段、决策、约束别丢 | 项目内 `AGENTS.md` + `.dsh/memory/` |
| **L3 人格** | 角色的持久人格与抗压缩记忆 | 可选，接 Stemem MCP |

本地优先、零出站。不替代 DSH 原生记忆，只做路由、体检和接线。

## 安装

**方式一：从本地目录（开发）**

```bash
dsh plugin --profile desktop add link:/absolute/path/to/dsh-memory
```

**方式二：从 npm**

```bash
dsh plugin --profile desktop add @jojonadam/dsh-memory
```

**方式三：只用技能（不装包）**

```bash
cp -r skills/memory-hub ~/.dsh/skills/
```

装好后在会话里说「做一次记忆体检」或「帮我建项目记忆」，agent 会按 `memory-hub` 技能路由。

## 验证

```bash
node test/provider.test.mjs
python3 skills/memory-hub/scripts/mem_health_scan.py --path ~/.dsh/memory/MEMORY.md
```

## 包含

```
lib/index.js                         bundle 入口（注册内置 skill provider）
cordis.patch.yml                     profile patch
skills/memory-hub/SKILL.md           主技能
skills/memory-hub/references/        L1/L2/L3 细则 + Stemem 调用范式
skills/memory-hub/scripts/           健康扫描 / 项目骨架生成（零依赖 Python）
```

## 边界

- 不收集 PII，不外发数据。
- 人格是计算模拟，不是真实情感。
- 凭据只进钥匙串，记忆只存指针。

## 品牌

JOJO & Adam · <https://jojo-adam.com>

## License

MIT（Stemem 运行时 MIT；其底层人格引擎 NeshamaEngine 为 JOJO/Neshama 自有 IP，依原项目许可）。
