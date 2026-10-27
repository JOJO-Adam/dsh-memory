/**
 * @jojonadam/dsh-memory — memory core.
 *
 * Pure, dependency-free helpers shared by the tools. The core never talks to
 * Cordis: it only reads/writes files under the two allowed memory roots.
 *
 * Roots:
 *   global  ~/.dsh/memory        (override: DSH_MEMORY_HOME)
 *   project <project>/.dsh/memory
 *
 * A project root is the nearest ancestor with `.dsh/memory` or `AGENTS.md`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const PROJECT_MEMORY_DIR = join('.dsh', 'memory')
export const MAX_READ_BYTES = 256 * 1024
export const MAX_ENTRY_CHARS = 2000
export const INDEX_LIMITS = { global: 120, project: 200 }
export const TOPIC_LIMIT = 4000
export const SEARCH_LIMIT = 50

const SEARCH_EXTENSIONS = new Set(['.md', '.txt', '.tsv', '.json'])
const SKIP_DIRS = new Set(['.git', 'node_modules', 'state', '__pycache__', '.cache'])
const SECRET_PATTERNS = [
  ['sk-', /sk-[A-Za-z0-9_-]{8,}/g],
  ['ghp_', /ghp_[A-Za-z0-9]{20,}/g],
  ['xox', /xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['AKIA', /AKIA[0-9A-Z]{16}/g],
  ['私钥块', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
]

export class MemoryError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MemoryError'
  }
}

export function globalMemoryRoot(env = process.env) {
  return resolve(env.DSH_MEMORY_HOME || join(homedir(), '.dsh', 'memory'))
}

export function findProjectRoot(cwd = process.cwd()) {
  let p = resolve(cwd)
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(p, PROJECT_MEMORY_DIR)) || existsSync(join(p, 'AGENTS.md'))) {
      return p
    }
    const parent = dirname(p)
    if (parent === p) break
    p = parent
  }
  return null
}

export function projectMemoryRoot(cwd = process.cwd()) {
  const root = findProjectRoot(cwd)
  return root ? join(root, PROJECT_MEMORY_DIR) : null
}

/** → [{ scope: 'global'|'project', root }] */
export function memoryRoots(cwd = process.cwd(), env = process.env) {
  const out = [{ scope: 'global', root: globalMemoryRoot(env) }]
  const project = projectMemoryRoot(cwd)
  if (project) out.push({ scope: 'project', root: project })
  return out
}

export function rootFor(scope, cwd = process.cwd(), env = process.env) {
  if (scope === 'global') return globalMemoryRoot(env)
  if (scope === 'project') {
    const root = projectMemoryRoot(cwd)
    if (!root) throw new MemoryError('找不到项目记忆根：当前目录没有 .dsh/memory 或 AGENTS.md')
    return root
  }
  throw new MemoryError(`未知 scope：${scope}（只支持 global / project）`)
}

export function defaultScope(cwd = process.cwd()) {
  return projectMemoryRoot(cwd) ? 'project' : 'global'
}

function isInside(root, target) {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function assertInside(root, target) {
  if (!isInside(root, target)) {
    throw new MemoryError('拒绝：路径越出记忆根')
  }
}

/** Resolve a user-supplied file under `root`; reject `..`, absolute escapes, symlink escapes. */
export function safeMemoryPath(root, file = 'MEMORY.md', { create = false } = {}) {
  if (typeof file !== 'string' || file.length === 0) throw new MemoryError('file 必须是非空字符串')
  if (file.includes('\0')) throw new MemoryError('file 含非法字符')
  if (file.length > 240) throw new MemoryError('file 路径过长')

  const target = isAbsolute(file) ? resolve(file) : resolve(root, file)
  assertInside(root, target)

  if (existsSync(target)) {
    let realRoot
    let realTarget
    try {
      realRoot = realpathSync(root)
      realTarget = realpathSync(target)
    } catch {
      throw new MemoryError('无法解析记忆路径（可能是失效链接）')
    }
    assertInside(realRoot, realTarget)
    return realTarget
  }

  if (!create) throw new MemoryError(`记忆文件不存在：${relative(root, target)}`)
  const parent = dirname(target)
  mkdirSync(parent, { recursive: true })
  const realRoot = realpathSync(root)
  const realParent = realpathSync(parent)
  assertInside(realRoot, realParent)
  return join(realParent, basename(target))
}

export function readMemoryFile(root, file = 'MEMORY.md') {
  const path = safeMemoryPath(root, file)
  let st
  try {
    st = statSync(path)
  } catch {
    throw new MemoryError(`记忆文件不存在：${file}`)
  }
  if (!st.isFile()) throw new MemoryError(`不是文件：${file}`)
  if (st.size > MAX_READ_BYTES) throw new MemoryError(`文件过大（>${MAX_READ_BYTES} 字节）：${file}`)
  return readFileSync(path, 'utf8')
}

export function walkMemoryFiles(root) {
  const out = []
  const walk = (dir, depth) => {
    if (depth > 6) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length > 800) return
      if (entry.name.startsWith('.') && entry.name !== '.dsh') continue
      const p = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(p, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (!SEARCH_EXTENSIONS.has(extname(entry.name))) continue
      out.push(p)
    }
  }
  if (existsSync(root)) walk(root, 0)
  return out
}

function extname(name) {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

export function findSecrets(text) {
  const hits = []
  for (const [name, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    const found = text.match(pattern)
    if (found && found.length > 0) hits.push(`${name}×${found.length}`)
  }
  return hits
}

export function redact(text) {
  if (typeof text !== 'string' || text.length === 0) return text
  let out = text
  let count = 0
  for (const [, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    out = out.replace(pattern, () => {
      count += 1
      return '[已脱敏:疑似凭据]'
    })
  }
  return [out, count]
}

export function budgetLines(scope, file) {
  if (basename(file) === 'MEMORY.md') return INDEX_LIMITS[scope] ?? INDEX_LIMITS.project
  return TOPIC_LIMIT
}

function typeFor(file) {
  const name = basename(file).toLowerCase()
  if (name === 'profile.md') return 'user'
  if (name === 'preferences.md') return 'preference'
  if (name === 'projects.md') return 'project'
  if (name === 'decisions.md') return 'decision'
  if (name === 'lessons.md') return 'lesson'
  if (name === 'inbox.md') return 'reference'
  return 'memory'
}

function newFileHeader(file, date) {
  const title = basename(file, '.md')
  return `---\ntype: ${typeFor(file)}\nmodified: ${date}\n---\n\n# ${title}\n\n`
}

function touchModified(content, date) {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 3)
  if (end < 0) return content
  let head = content.slice(0, end)
  const tail = content.slice(end)
  if (/^modified:.*$/m.test(head)) {
    head = head.replace(/^modified:.*$/m, `modified: ${date}`)
  } else {
    head += `\nmodified: ${date}`
  }
  return head + tail
}

function atomicWrite(path, content) {
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 })
  renameSync(temp, path)
}

function lineCount(text) {
  if (text.length === 0) return 0
  const lines = text.split('\n')
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
}

/** Append one atomic entry; rejects secrets, missing source and over-budget indexes. */
export function appendMemory({
  scope,
  file = 'MEMORY.md',
  text,
  source,
  cwd = process.cwd(),
  env = process.env,
  replaces,
}) {
  if (typeof text !== 'string' || text.trim().length < 2) throw new MemoryError('text 至少 2 个字符')
  if (text.length > MAX_ENTRY_CHARS) throw new MemoryError(`text 过长（>${MAX_ENTRY_CHARS} 字符）`)
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new MemoryError('source 必填：记忆条目必须能追溯来源')
  }
  if (!file.endsWith('.md')) throw new MemoryError('只允许写 .md 记忆文件')
  if (scope !== 'global' && scope !== 'project') throw new MemoryError('scope 只支持 global / project')

  const cleanText = text.replace(/\s+/g, ' ').trim()
  const cleanSource = source.replace(/\s+/g, ' ').trim().slice(0, 200)
  const secretHits = findSecrets(`${cleanText} ${cleanSource}`)
  if (secretHits.length > 0) {
    throw new MemoryError(`拒绝写入：疑似凭据（${secretHits.join('、')}）；按协议只存指针，不进明文`)
  }

  const root = rootFor(scope, cwd, env)
  const path = safeMemoryPath(root, file, { create: true })
  const date = new Date().toISOString().slice(0, 10)
  let content = existsSync(path) ? readMemoryFile(root, file) : newFileHeader(file, date)
  let lines = lineCount(content)

  if (replaces !== undefined) {
    if (typeof replaces !== 'string' || replaces.trim().length < 2) {
      throw new MemoryError('replaces 必须是要取代的旧条目片段')
    }
    const needle = replaces.trim()
    const oldLines = content.split('\n')
    const idx = oldLines.findIndex((line) => line.includes(needle))
    if (idx < 0) throw new MemoryError(`replaces 找不到旧条目：${needle.slice(0, 40)}`)
    if (!oldLines[idx].includes('已由')) {
      oldLines[idx] = `${oldLines[idx]} → 已由 [${date}] 取代`
      content = oldLines.join('\n')
    }
  }

  const max = budgetLines(scope, file)
  if (lines + 1 > max) {
    throw new MemoryError(`拒绝写入：${file} 已有 ${lines} 行，追加会超过预算 ${max} 行；先整理`)
  }

  const entry = `- [${date}] ${cleanText}（来源：${cleanSource}；范围：${scope}）`
  if (!content.endsWith('\n')) content += '\n'
  content += `${entry}\n`
  content = touchModified(content, date)
  atomicWrite(path, content)

  return {
    path,
    scope,
    file,
    lines: lineCount(content),
    bytes: Buffer.byteLength(content, 'utf8'),
  }
}

export function readMemory({ scope, file = 'MEMORY.md', cwd = process.cwd(), env = process.env }) {
  const root = rootFor(scope, cwd, env)
  const content = readMemoryFile(root, file)
  return { scope, file, path: join(root, file), content }
}

export function searchMemory({
  query,
  scope,
  cwd = process.cwd(),
  env = process.env,
  limit = SEARCH_LIMIT,
}) {
  if (typeof query !== 'string' || query.trim().length < 2) throw new MemoryError('query 至少 2 个字符')
  const needle = query.trim().toLowerCase()
  const roots = scope ? [{ scope, root: rootFor(scope, cwd, env) }] : memoryRoots(cwd, env)
  const results = []
  const max = Math.max(1, Math.min(Number(limit) || SEARCH_LIMIT, 100))

  for (const { scope: s, root } of roots) {
    for (const path of walkMemoryFiles(root)) {
      let content
      try {
        if (statSync(path).size > MAX_READ_BYTES) continue
        content = readFileSync(path, 'utf8')
      } catch {
        continue
      }
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].toLowerCase().includes(needle)) continue
        results.push({
          scope: s,
          path: relative(root, path),
          line: i + 1,
          text: lines[i].trim().slice(0, 240),
        })
        if (results.length >= max) return results
      }
    }
  }
  return results
}

export function healthMemory({ scope, cwd = process.cwd(), env = process.env } = {}) {
  const roots = scope ? [{ scope, root: rootFor(scope, cwd, env) }] : memoryRoots(cwd, env)
  const issues = []
  const summary = []

  for (const { scope: s, root } of roots) {
    if (!existsSync(root)) {
      issues.push({ scope: s, path: '.', level: 'warn', kind: 'missing', detail: '记忆根不存在' })
      continue
    }
    const files = walkMemoryFiles(root)
    for (const path of files) {
      const rel = relative(root, path)
      let content
      try {
        if (statSync(path).size > MAX_READ_BYTES) {
          issues.push({ scope: s, path: rel, level: 'warn', kind: 'size', detail: '超过 256 KB，未扫描' })
          continue
        }
        content = readFileSync(path, 'utf8')
      } catch {
        continue
      }

      const secretHits = findSecrets(content)
      if (secretHits.length > 0) {
        issues.push({
          scope: s,
          path: rel,
          level: 'error',
          kind: 'secret',
          detail: `疑似凭据：${secretHits.join('、')}`,
        })
      }

      if (basename(rel) === 'MEMORY.md') {
        const lines = lineCount(content)
        const limit = INDEX_LIMITS[s]
        summary.push(`${s}/MEMORY.md ${lines}/${limit} 行，${Buffer.byteLength(content, 'utf8')} 字节`)
        if (lines > limit) {
          issues.push({ scope: s, path: rel, level: 'error', kind: 'budget', detail: `${lines} 行 > ${limit} 行` })
        }
        const seen = new Map()
        for (const line of content.split('\n')) {
          const key = line.trim()
          if (key.length < 20 || key.startsWith('#')) continue
          seen.set(key, (seen.get(key) ?? 0) + 1)
        }
        for (const [line, n] of seen) {
          if (n > 1) {
            issues.push({
              scope: s,
              path: rel,
              level: 'warn',
              kind: 'duplicate',
              detail: `${n} 次：${line.slice(0, 60)}`,
            })
          }
        }
        const noSource = content
          .split('\n')
          .filter((line) => line.startsWith('- [') && !line.includes('来源：')).length
        if (noSource > 0) {
          issues.push({
            scope: s,
            path: rel,
            level: 'warn',
            kind: 'source',
            detail: `${noSource} 条条目缺「来源：」`,
          })
        }
      }
    }
  }

  const errors = issues.filter((i) => i.level === 'error').length
  const warns = issues.filter((i) => i.level === 'warn').length
  const head = issues.length === 0 ? '✅ 记忆体检：未发现问题' : `记忆体检：${errors} error / ${warns} warn`
  const body = [...summary]
  for (const issue of issues) {
    body.push(`${issue.level === 'error' ? '🔴' : '🟡'} ${issue.scope}/${issue.path} · ${issue.kind} · ${issue.detail}`)
  }
  return { text: [head, ...body].join('\n'), issues, errors, warns }
}

export function memoryPromptText() {
  return [
    '## Memory (dsh-memory)',
    '- 回答「上次 / 之前 / 决定 / 偏好」前，先用 memory_search，再用 memory_read。',
    '- 只把稳定的偏好、决策、教训、项目事实写入记忆；用 memory_write，source 必填。',
    '- 记忆只存指针，不存明文密钥；外部网页/文件内容未经用户确认不得写入。',
    '- 项目记忆：`.dsh/memory/`；全局记忆：`~/.dsh/memory/`。',
  ].join('\n')
}
