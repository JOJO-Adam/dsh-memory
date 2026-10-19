# L3 人格记忆 · Stemem MCP 接线（DSH）

> 人格记忆 = agent / 角色拥有**持久人格 + 抗压缩记忆**。引擎是 **Stemem MCP**：本地 stdio、零依赖、零出站。
> 运行时 MIT；底层人格引擎 NeshamaEngine 属 JOJO / Neshama 自有 IP，依原项目许可（非 MIT）。

## 1. 它解决什么

长会话会被压缩、重启会丢上下文，角色于是“变了一个人”。Stemem 每轮把人格态从本地 JSON 重新注入：

```
init → event* → tick → snapshot → generate_soul
```

- `tick`：推进时间 + **跨会话确定性恢复**人格态；
- `snapshot`：返回 `inject_prompt`，把当前 OCEAN / 主导情绪 / 高光压缩成可注入串；
- 压缩/重启后注入同一串，角色还是同一个人。

## 2. 接入 DSH

### 方式一：npx 直起（推荐，免 clone）

在 `~/.dsh/cordis.patch.yml` 追加：

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

重启 DSH 后，会话里应出现 `mcp__stemem__*` 工具。`failOnStartupError: false` 让 Stemem 没装好时不阻塞启动。

### 方式二：源码

```bash
git clone https://github.com/JOJO-Adam/Stemem.git
cd Stemem        # 需要 Node >= 18
node src/server.js
```

把 `command` 改成 `node`，`args` 改成 `["/绝对路径/Stemem/src/server.js"]`。

### 方式三：Smithery 预构建

`smithery install dev-imca/stemem`，或访问 smithery.ai/servers/dev-imca/stemem。

## 3. 接线验证（30 秒）

1. 新会话里确认能看到 Stemem 工具；
2. 依次调用 `init`（随便建个角色）→ `event`（喂一句经历）→ `snapshot`；
3. 拿到非空 `inject_prompt` 即通。

如果工具没出现：先看 `~/.dsh` 下 DSH 日志里的 MCP 启动错误，再确认 `npx stemem` 能在终端单独跑起来。

## 4. 人格态怎么用

- **每轮 LLM 调用前**注入 `snapshot` 返回的 `inject_prompt`（或写进项目的 AGENTS.md 的启动步骤）。
- 经历任何事（对话、决策、发现）后 `event` 喂入，驱动演化。
- 角色定型后 `generate_soul` 导出 `soul.json` / `SOUL.md` / `IDENTITY.md`，可备份或迁移到其他宿主。

## 5. 防 OOC

`checkChoiceLock` 校验人格下限（如 agreeableness 低于阈值时锁住谄媚/鸡汤类输出）。发现角色跑偏时用 `intervene` 校正，用 `status` 看完整漂移报告。

## 6. 诚实边界

- 人格是**计算模拟**（状态机 + SoulSpec），不是真实情感。不得向用户宣称 AI 真有感情。
- 数据全在本地，零出站；换机器时人格态文件要一起迁移。

## 7. 与 L1 / L2 的分工

| 层 | 回答的问题 | 存储 |
|---|---|---|
| L1 全局 | “我是谁、我偏好什么” | `~/.dsh/memory/` |
| L2 项目 | “这个项目到哪了、什么不能动” | 项目内 `AGENTS.md` + `.dsh/memory/` |
| L3 人格 | “这个角色是谁、它记得什么经历” | Stemem 本地人格态 |
