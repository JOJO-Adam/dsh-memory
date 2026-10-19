# Stemem MCP · 9 工具调用范式卡

> 给 L3 人格层的实操速查。调用走 stdio MCP（`stemem`），参数为说明性，实际以工具 schema 为准。
> 在 DSH 中工具名形如 `mcp__stemem__init`，以会话里实际显示为准。

## 标准生命周期

```
init  →  event*  →  tick  →  snapshot  →  generate_soul
（建 SoulSpec）（喂事件演化）（跨会话恢复）（取注入串）（导出灵魂档案）
```

## 工具清单

### 1. `init` — 装配人格基底
建一个新 SoulSpec（OCEAN 预设或随机 baseline），定人格边界。
- 入参：`{ name, ocean_preset?, baseline? }`
- 出参：`soul_id` + 初始 SoulSpec
- 触发：开始塑造一个新角色时第一个跑。

### 2. `event` — 喂记忆事件
把一次经历 / 见闻作为事件喂入，驱动情绪与驱力演化。
- 入参：`{ text, emotion_tags?, drive_deltas?, importance? }`
- 出参：`active_emotions`、`voiceHint`（情绪驱动的声调）、`logicHint`
- 触发：角色经历任何事（对话、发现、决策）后。

### 3. `tick` — 时间流逝 / 跨会话恢复
推进时间：驱力紧迫度 + 漂移衰减；**跨会话确定性恢复人格态**（压缩失忆的解药）。
- 触发：每轮会话开始，或长时间间隔后。

### 4. `satisfy` — 满足驱力闭环
标记某驱力被满足。
- 入参：`{ drive, amount }`
- 触发：角色达成目标 / 满足渴望后。

### 5. `snapshot` — 取注入串
返回 `inject_prompt`：当前 OCEAN / 主导情绪 / 高光 / Me Memory 钩子。
- 触发：**每次 LLM 调用前**注入，保证压缩或重启后仍是同一个角色。

### 6. `autostep` — 自主行为推进
让角色按当前人格自主推进一步（无需显式指令）。
- 触发：角色需主动行动 / 生成自有举措时。

### 7. `intervene` — 人工干预
外部（用户 / 编排者）覆盖或纠正人格态。
- 入参：`{ override }`
- 触发：人格跑偏、需手动校正时。

### 8. `status` — 完整状态检视
返回完整人格态 + 驱力 + 冲突 + 漂移报告（调试用）。
- 触发：体检 / 排查人格是否塌方。

### 9. `generate_soul` — 导出灵魂档案
导出 SoulSpec v0.5：`soul.json` + `SOUL.md` + `IDENTITY.md`，可分发 / 备份 / 跨宿主迁移。
- 触发：角色定型、要存档或迁移时。

## 防 OOC

`checkChoiceLock`（经 `intervene` / `status` 暴露）校验人格下限，低于则锁住谄媚类输出并返回重写指令。

## 最小演示（验收用）

```
init   → 建角色「毒舌评测员」
event  → 喂「今天测到一个离谱的 AI 骗案」
tick   → 恢复 / 推进
snapshot → 取 inject_prompt，注入下一条 LLM 调用
generate_soul → 导出 SOUL.md 存档
```

跑通即证明 Stemem 实驱动可用，满足 memory-hub 的 L3 验收项。
