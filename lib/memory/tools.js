/**
 * @jojonadam/dsh-memory — model-facing tools.
 *
 * Tools are the primary write path: memory_write enforces the path fence,
 * source, secret scan and line budget before touching disk. Hooks (v0.3) are
 * only a safety net for Bash writes.
 */
import { getHookMetrics } from './metrics.js'
import {
  MemoryError,
  appendMemory,
  defaultScope,
  distillMemory,
  healthMemory,
  memoryMetrics,
  memoryPromptText,
  readMemory,
  searchMemory,
} from './core.js'

const TEXT_OUTPUT = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    path: { type: 'string' },
    count: { type: 'number' },
  },
  required: ['text'],
  additionalProperties: true,
}

function textOutput(args, value) {
  return [{ type: 'text', text: String(value?.text ?? '') }]
}

function params(properties, required = []) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}

function scopeParam() {
  return { type: 'string', enum: ['global', 'project'], description: '记忆层；省略时优先项目层' }
}

function cwdFor(exec) {
  return exec?.agent?.session?.header?.cwd || process.cwd()
}

function memoryReadTool() {
  return {
    name: 'memory_read',
    description:
      'Read a memory file from the project (.dsh/memory) or global (~/.dsh/memory) layer. ' +
      'Use before answering about past decisions, preferences or project context.',
    parameters: params(
      {
        file: { type: 'string', description: '相对记忆根的路径，默认 MEMORY.md' },
        scope: scopeParam(),
      },
      [],
    ),
    output: { schema: TEXT_OUTPUT, render: textOutput },
    execute(args, exec) {
      const cwd = cwdFor(exec)
      const scope = args.scope || defaultScope(cwd)
      const got = readMemory({ scope, file: args.file || 'MEMORY.md', cwd })
      const content = got.content.length > 20000
        ? `${got.content.slice(0, 20000)}\n\n（已截断，原文 ${got.content.length} 字符）`
        : got.content
      return {
        text: content.length > 0 ? content : `（${scope}/${args.file || 'MEMORY.md'} 为空）`,
        path: got.path,
      }
    },
  }
}

function memorySearchTool() {
  return {
    name: 'memory_search',
    description:
      'Search project and global memory files for a keyword. Returns path:line:text. ' +
      'Use it before reading whole files when the question is about something remembered.',
    parameters: params(
      {
        query: { type: 'string', description: '关键词，至少 2 个字符' },
        scope: scopeParam(),
        limit: { type: 'number', description: '最多返回条数，默认 50，最大 100' },
      },
      ['query'],
    ),
    output: { schema: TEXT_OUTPUT, render: textOutput },
    execute(args, exec) {
      const results = searchMemory({ query: args.query, scope: args.scope, limit: args.limit, cwd: cwdFor(exec) })
      const text =
        results.length === 0
          ? `未找到「${args.query}」`
          : results.map((r) => `${r.scope}/${r.path}:${r.line}  ${r.text}`).join('\n')
      return { text, count: results.length }
    },
  }
}

function memoryWriteTool() {
  return {
    name: 'memory_write',
    description:
      'Append one atomic memory entry. Requires source; rejects secrets, path escapes and over-budget indexes. ' +
      'Use only for stable preferences, decisions, lessons or project facts. Never store credentials.',
    parameters: params(
      {
        text: { type: 'string', description: '一条原子事实，不要写多段' },
        source: { type: 'string', description: '来源：session-id、url 或用户原话标识' },
        scope: scopeParam(),
        file: { type: 'string', description: '目标 .md 文件，默认 MEMORY.md' },
        replaces: { type: 'string', description: '可选：要标记为「已由新条目取代」的旧条目片段' },
      },
      ['text', 'source'],
    ),
    output: { schema: TEXT_OUTPUT, render: textOutput },
    execute(args, exec) {
      const cwd = cwdFor(exec)
      const scope = args.scope || defaultScope(cwd)
      const got = appendMemory({
        cwd,
        scope,
        file: args.file || 'MEMORY.md',
        text: args.text,
        source: args.source,
        replaces: args.replaces,
      })
      return {
        text: `已写入 ${got.scope}/${got.file}（${got.lines} 行，${got.bytes} 字节）`,
        path: got.path,
      }
    },
  }
}

function memoryHealthTool() {
  return {
    name: 'memory_health',
    description:
      'Report memory budget, plaintext-secret, duplicate-line and missing-source issues. ' +
      'Read-only; run after a batch of writes or when memory feels bloated.',
    parameters: params({ scope: scopeParam() }, []),
    output: { schema: TEXT_OUTPUT, render: textOutput },
    execute(args, exec) {
      const got = healthMemory({ scope: args.scope, cwd: cwdFor(exec) })
      return { text: got.text, count: got.issues.length }
    },
  }
}

function memoryMetricsTool() {
  return {
    name: 'memory_metrics',
    description:
      'Report storage metrics (files, bytes, index lines, entries, secrets, topics, dailies) ' +
      'and in-process hook counters. Read-only; no secret values.',
    parameters: params({ scope: scopeParam() }, []),
    output: { schema: TEXT_OUTPUT, render: textOutput },
    execute(args, exec) {
      const got = memoryMetrics({ scope: args.scope, cwd: cwdFor(exec) })
      const hooks = getHookMetrics()
      const hookText = `hooks: route=${hooks.routeHints} bash=${hooks.bashChanges} digest=${hooks.digests} subagent=${hooks.subagentBriefs}`
      return { text: `${got.text}\n${hookText}`, count: got.totalFiles }
    },
  }
}

function memoryDistillTool() {
  return {
    name: 'memory_distill',
    description:
      'Preview or archive old L3 daily logs (>days) into monthly L2 topic files. ' +
      'Mechanical copy only: it never deletes L3 and does not write semantic summaries; ' +
      'use memory_write for a real lesson/decision summary after previewing.',
    parameters: params(
      {
        days: { type: 'number', description: '只处理早于 N 天的日志，默认 30' },
        apply: { type: 'boolean', description: 'false=预览；true=写入 topics/distilled-YYYY-MM.md' },
        limit: { type: 'number', description: '最多归档条数，默认 200，最大 1000' },
      },
      [],
    ),
    output: { schema: TEXT_OUTPUT, render: textOutput },
    execute(args, exec) {
      const got = distillMemory({ days: args.days, apply: args.apply === true, limit: args.limit, cwd: cwdFor(exec) })
      return { text: got.text, count: got.entries }
    },
  }
}

export const MEMORY_TOOL_DEFINITIONS = [
  memoryReadTool(),
  memorySearchTool(),
  memoryWriteTool(),
  memoryHealthTool(),
  memoryMetricsTool(),
  memoryDistillTool(),
]

export const MEMORY_PROMPT_SECTION = {
  name: 'jojo-adam-memory-tools',
  order: 900,
  interpolate: false,
  text: memoryPromptText(),
}

/** Register the four tools on ctx.tools; returns the definitions for tests. */
export function registerMemoryTools(ctx) {
  if (!ctx?.tools || typeof ctx.tools.register !== 'function') {
    throw new MemoryError('ctx.tools.register 不可用：dsh-memory 需要 tools 服务')
  }
  for (const definition of MEMORY_TOOL_DEFINITIONS) {
    ctx.tools.register(definition)
  }
  return MEMORY_TOOL_DEFINITIONS
}
