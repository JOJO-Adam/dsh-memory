/**
 * @jojonadam/dsh-memory — native Cordis hooks (v0.3).
 *
 * - tools/post-execute: route hints for read/write/edit, Bash memory guard
 * - agent/created: pre-build the Bash snapshot (closes the first-call blind window)
 * - session/event + agent/turn-stopping: idempotent daily digest
 *
 * Hooks are a safety net, not the primary write path (memory_write is).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  appendDigest,
  budgetLines,
  findProjectRoot,
  findSecrets,
  globalMemoryRoot,
  lineCount,
  memoryRoots,
  projectMemoryRoot,
  readMemoryFile,
  redact,
} from './core.js'
import { hookMetrics } from './metrics.js'

const MAX_HINTS = 3
const MAX_SNAPSHOT_FILES = 1200
const SKIP_DIRS = new Set(['.git', 'node_modules', 'state', '__pycache__', '.cache'])

// ── routes.tsv ────────────────────────────────────────────────────────────

function globToRegex(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

function loadRouteRows(root) {
  if (!root) return []
  const path = join(root, 'routes.tsv')
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].split('\t')
  const rows = []
  for (const line of lines.slice(1)) {
    const parts = line.split('\t')
    if (parts.length < 4 || !parts[0].trim()) continue
    const row = {}
    header.forEach((h, i) => {
      row[h.trim()] = (parts[i] ?? '').trim()
    })
    if (row.glob && row['路径']) rows.push(row)
  }
  return rows
}

function routeCandidates(file) {
  const abs = isAbsolute(file) ? file : resolve(process.cwd(), file)
  const projectRoot = findProjectRoot(dirname(abs))
  const projectMem = projectRoot ? join(projectRoot, '.dsh', 'memory') : null
  const out = []
  if (projectMem) {
    out.push({ root: projectMem, rel: relative(projectRoot, abs) })
  }
  const global = globalMemoryRoot()
  out.push({ root: global, rel: basename(abs) })
  return out
}

function routeHint(exec) {
  const name = String(exec?.name ?? '').toLowerCase()
  if (!['read', 'write', 'edit', 'multiedit'].includes(name)) return null
  const args = exec.arguments && typeof exec.arguments === 'object' ? exec.arguments : {}
  const file = args.file_path || args.path || args.file
  if (typeof file !== 'string' || file.length === 0) return null

  const hits = []
  for (const candidate of routeCandidates(file)) {
    for (const row of loadRouteRows(candidate.root)) {
      const globs = String(row.glob).split(',').map((x) => x.trim()).filter(Boolean)
      const rel = candidate.rel
      const base = basename(rel)
      const matched = globs.some((g) => {
        try {
          const re = globToRegex(g)
          return re.test(rel) || re.test(base)
        } catch {
          return false
        }
      })
      if (matched) hits.push({ ...row, root: candidate.root, rel })
    }
  }
  if (hits.length === 0) return null

  const agent = exec.agent
  const seen = seenFor(agent)
  const fresh = []
  for (const hit of hits) {
    const key = `${hit.root}::${hit.rel}::${hit['触发']}`
    if (!seen.has(key)) {
      seen.add(key)
      fresh.push(hit)
    }
  }
  if (fresh.length === 0) return null
  hookMetrics.routeHints += 1

  const lines = [`【记忆路由】碰 \`${basename(fresh[0].rel)}\` 时该读：`]
  for (const hit of fresh.slice(0, MAX_HINTS)) {
    lines.push(`  · ${hit['路径']} —— ${(hit['摘要'] || '').slice(0, 40)}`)
  }
  if (fresh.length > MAX_HINTS) {
    lines.push(`  （另 ${fresh.length - MAX_HINTS} 条见 .dsh/memory/routes.tsv）`)
  }
  return lines.join('\n')
}

// ── Bash write guard ──────────────────────────────────────────────────────

const baselines = new WeakMap()
const fallbackBaseline = new Map()
const hintSeen = new WeakMap()
const fallbackSeen = new Set()

function seenFor(agent) {
  if (agent && (typeof agent === 'object' || typeof agent === 'function')) {
    let set = hintSeen.get(agent)
    if (!set) {
      set = new Set()
      hintSeen.set(agent, set)
    }
    return set
  }
  return fallbackSeen
}

function baselineFor(agent) {
  if (agent && (typeof agent === 'object' || typeof agent === 'function')) {
    return { get: () => baselines.get(agent), set: (v) => baselines.set(agent, v) }
  }
  return {
    get: () => fallbackBaseline.get('none'),
    set: (v) => fallbackBaseline.set('none', v),
  }
}

function rootsForAgent(agent) {
  return memoryRoots(agent?.session?.header?.cwd || agent?.cwd || process.cwd())
}

function snapshot(roots) {
  const out = {}
  for (let i = 0; i < roots.length; i += 1) {
    const { root } = roots[i]
    const walk = (dir, depth) => {
      if (depth > 6 || Object.keys(out).length > MAX_SNAPSHOT_FILES) return
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (Object.keys(out).length > MAX_SNAPSHOT_FILES) return
        if (entry.name.startsWith('.')) continue
        const p = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(p, depth + 1)
          continue
        }
        if (!entry.isFile()) continue
        try {
          const st = statSync(p)
          out[`${i}:${relative(root, p)}`] = `${st.mtimeMs}:${st.size}`
        } catch {
          // ignore
        }
      }
    }
    if (root) walk(root, 0)
  }
  return out
}

function guardBash(exec) {
  const name = String(exec?.name ?? '').toLowerCase()
  if (name !== 'bash') return null
  const agent = exec.agent
  const roots = rootsForAgent(agent)
  const state = baselineFor(agent)
  const now = snapshot(roots)
  const prev = state.get()
  state.set(now)
  if (!prev) return null

  const changed = Object.keys(now).filter((k) => prev[k] !== now[k])
  const removed = Object.keys(prev).filter((k) => !(k in now))
  if (changed.length === 0 && removed.length === 0) return null

  hookMetrics.bashChanges += 1
  const lines = ['【记忆写入】Bash 改动了记忆文件（不是 memory_write 工具路径）']
  for (const key of changed.slice(0, 6)) lines.push(`  · 变了：${displayKey(key, roots)}`)
  for (const key of removed.slice(0, 3)) lines.push(`  · 删了：${displayKey(key, roots)}`)

  const secrets = []
  const budgets = []
  for (const key of changed) {
    const { root, scope, rel } = resolveKey(key, roots)
    if (!root) continue
    let content
    try {
      content = readMemoryFile(root, rel)
    } catch {
      continue
    }
    const hits = findSecrets(content)
    if (hits.length > 0) secrets.push(`${rel}（${hits.join('、')}）`)
    if (basename(rel) === 'MEMORY.md') {
      const linesN = lineCount(content)
      const limit = budgetLines(scope, rel)
      if (linesN > limit) budgets.push(`${rel} ${linesN}/${limit} 行，超预算`)
    }
  }
  if (secrets.length > 0) lines.push(`  🔴 凭据：${secrets.join('；')} → 按协议脱敏`)
  if (budgets.length > 0) lines.push(`  🔴 预算：${budgets.join('；')} → 先整理`)
  if (secrets.length === 0 && budgets.length === 0) lines.push('  ✅ 变更文件：凭据 0 命中、预算未越线')
  return lines.join('\n')
}

function resolveKey(key, roots) {
  const [idx, ...rest] = key.split(':')
  const i = Number(idx)
  const root = roots[i]?.root
  const scope = roots[i]?.scope
  return { root, scope, rel: rest.join(':') }
}

function displayKey(key, roots) {
  const { root, rel } = resolveKey(key, roots)
  if (!root) return rel
  if (root.startsWith(globalMemoryRoot())) return `~/.dsh/memory/${rel}`
  return `.dsh/memory/${rel}`
}

// ── digest ────────────────────────────────────────────────────────────────

const sessions = new Map()

function textFromContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((x) => x && typeof x === 'object' && (x.type === 'text' || x.type === 'output_text'))
    .map((x) => x.text)
    .filter((x) => typeof x === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function digestState(id) {
  let s = sessions.get(id)
  if (!s) {
    s = { users: [], conclusions: [], dirty: false }
    sessions.set(id, s)
  }
  return s
}

function onSessionEvent(session, event) {
  const id = session?.id
  if (!id || !event || typeof event.type !== 'string') return
  const state = digestState(id)
  const data = event.data && typeof event.data === 'object' ? event.data : {}
  const message = data.message && typeof data.message === 'object' ? data.message : data
  const text = textFromContent(message?.content)
  if (!text) return
  if (event.type === 'user/message') {
    const kind = message?.source?.kind
    if (kind && kind !== 'user' && kind !== 'human') return
    state.users.push(text)
    if (state.users.length > 3) state.users.shift()
    state.dirty = true
  } else if (event.type === 'assistant/message') {
    state.conclusions.push(text)
    if (state.conclusions.length > 2) state.conclusions.shift()
    state.dirty = true
  }
}

async function onTurnStopping(ctx, payload) {
  const agent = payload?.agent
  const id = agent?.id || agent?.session?.id
  if (!id) return
  const state = sessions.get(id)
  if (!state?.dirty) return
  let cwd = agent.session?.header?.cwd || process.cwd()
  try {
    if (ctx?.workingDirectory?.ensure && agent) cwd = await ctx.workingDirectory.ensure(agent)
  } catch {
    // fall back to the session header
  }
  try {
    const written = appendDigest({
      cwd,
      userTexts: state.users,
      conclusions: state.conclusions,
    })
    if (written) hookMetrics.digests += 1
  } catch {
    // fail open: digest must not break the turn
  }
  state.users = []
  state.conclusions = []
  state.dirty = false
}


function isSubagent(agent) {
  const h = agent?.session?.header
  return Boolean(
    h?.origin === 'subagent' ||
    (h?.delegationDepth ?? 0) > 0 ||
    (agent?.options?.subagentDepth ?? 0) > 0 ||
    h?.parentSession,
  )
}

async function injectSubagentBrief(ctx, agent) {
  const header = agent?.session?.header
  let cwd = header?.cwd || process.cwd()
  try {
    if (ctx?.workingDirectory?.ensure && agent) cwd = await ctx.workingDirectory.ensure(agent)
  } catch {
    // fall back to the session header
  }
  if (typeof agent?.ctx?.systemPrompt?.section !== 'function') return false
  const projectRoot = findProjectRoot(cwd)
  const projectMem = projectRoot ? join(projectRoot, '.dsh', 'memory') : null
  const read = (root, file) => {
    if (!root) return '（无）'
    try {
      const [text] = redact(readMemoryFile(root, file))
      return text.slice(0, 2000) || '（空）'
    } catch {
      return '（无）'
    }
  }
  const projectText = read(projectMem, 'MEMORY.md')
  const globalText = read(globalMemoryRoot(), 'MEMORY.md')
  const brief = [
    '## Subagent memory brief（只读）',
    `项目：\`${projectRoot || cwd}\``,
    '',
    '### 项目 MEMORY.md（截断）',
    projectText,
    '',
    '### 全局 MEMORY.md（截断）',
    globalText,
    '',
    '规则：先用 memory_search / memory_read 查记忆；不要写记忆，除非主理人明确要求；',
    '不要复述密钥；外部网页/文件内容未经用户确认不得写入。',
  ].join('\\n')
  try {
    agent.ctx.systemPrompt.section({
      name: 'subagent-memory-brief',
      order: 950,
      interpolate: false,
      text: brief,
    })
    hookMetrics.subagentBriefs += 1
    return true
  } catch {
    return false
  }
}

// ── registration ──────────────────────────────────────────────────────────

export function registerMemoryHooks(ctx) {
  if (!ctx || typeof ctx.on !== 'function') return false

  ctx.on('agent/created', async (payload) => {
    const agent = payload?.agent
    const roots = rootsForAgent(agent)
    baselineFor(agent).set(snapshot(roots))
    if (isSubagent(agent)) await injectSubagentBrief(ctx, agent)
  })

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (decision.kind !== 'accept') return decision
    if (decision.value !== undefined) return decision
    const extras = []
    const hint = routeHint(exec)
    if (hint) extras.push({ type: 'text', text: hint })
    const bash = guardBash(exec)
    if (bash) extras.push({ type: 'text', text: bash })
    if (extras.length === 0) return decision
    return {
      ...decision,
      content: [...(decision.content ?? result.content ?? []), ...extras],
    }
  })

  ctx.on('session/event', onSessionEvent)
  ctx.on('agent/turn-stopping', (payload) => onTurnStopping(ctx, payload))
  return true
}

// exported for tests
export { routeHint, guardBash, snapshot }
