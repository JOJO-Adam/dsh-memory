/**
 * Memory tool smoke tests — no DSH runtime required.
 *   node test/tools.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

const tools = new Map()
let section = null
const ctx = {
  skills: { registerProvider() {} },
  tools: {
    register(definition) {
      assert.ok(!tools.has(definition.name), `duplicate tool: ${definition.name}`)
      tools.set(definition.name, definition)
    },
  },
  systemPrompt: {
    section(value) {
      section = value
    },
  },
}

apply(ctx)
assert.deepEqual([...tools.keys()].sort(), [
  'memory_health',
  'memory_read',
  'memory_search',
  'memory_write',
])
assert.ok(section, 'prompt section was not registered')
assert.ok(section.text.includes('memory_write'), 'prompt section should mention memory_write')

const root = mkdtempSync(join(tmpdir(), 'dsh-memory-tools-'))
const globalRoot = join(root, 'global')
const project = join(root, 'project')
mkdirSync(globalRoot, { recursive: true })
mkdirSync(join(project, '.dsh', 'memory'), { recursive: true })
writeFileSync(join(globalRoot, 'MEMORY.md'), '# Global\n\n- [2026-01-01] 全局偏好中文（来源：test；范围：global）\n')
writeFileSync(join(project, '.dsh', 'memory', 'MEMORY.md'), '---\ntype: memory\nmodified: 2026-01-01\n---\n\n# Project\n\n')

const oldCwd = process.cwd()
const oldHome = process.env.DSH_MEMORY_HOME
process.env.DSH_MEMORY_HOME = globalRoot
process.chdir(project)

const signal = new AbortController().signal
const call = (name, args) => tools.get(name).execute(args, { signal })

try {
  const written = await call('memory_write', {
    text: '用户偏好结论先行',
    source: 'test-session',
    scope: 'project',
  })
  assert.match(written.text, /已写入 project\/MEMORY\.md/)
  const projectMemory = readFileSync(join(project, '.dsh', 'memory', 'MEMORY.md'), 'utf8')
  assert.match(projectMemory, /用户偏好结论先行/)
  assert.match(projectMemory, /来源：test-session/)
  assert.match(projectMemory, /modified: \d{4}-\d{2}-\d{2}/)

  const read = await call('memory_read', { scope: 'project' })
  assert.match(read.text, /用户偏好结论先行/)
  assert.ok(read.path.endsWith('MEMORY.md'))

  const globalRead = await call('memory_read', { scope: 'global' })
  assert.match(globalRead.text, /全局偏好中文/)

  const found = await call('memory_search', { query: '结论先行', scope: 'project' })
  assert.ok(found.count >= 1)
  assert.match(found.text, /project\/MEMORY\.md:\d+/)

  const health = await call('memory_health', { scope: 'project' })
  assert.match(health.text, /记忆体检/)

  assert.throws(
    () => call('memory_write', {
      text: `key sk-${'a'.repeat(16)}`,
      source: 'test-session',
      scope: 'project',
    }),
    /疑似凭据/,
  )
  assert.doesNotMatch(
    readFileSync(join(project, '.dsh', 'memory', 'MEMORY.md'), 'utf8'),
    /sk-aaaaaaaaaaaaaaaa/,
  )

  assert.throws(
    () => call('memory_read', { file: '../outside.md', scope: 'project' }),
    /路径越出记忆根/,
  )

  // No project memory root → default scope falls back to global.
  const globalOnly = join(root, 'global-only')
  mkdirSync(globalOnly, { recursive: true })
  process.chdir(globalOnly)
  const fallbackRead = await call('memory_read', {})
  assert.match(fallbackRead.text, /全局偏好中文/)
  process.chdir(project)

  // Budget: a 200-line MEMORY.md is at the project limit; one more line must be rejected.
  const fullProject = join(root, 'full')
  mkdirSync(join(fullProject, '.dsh', 'memory'), { recursive: true })
  writeFileSync(
    join(fullProject, '.dsh', 'memory', 'MEMORY.md'),
    Array.from({ length: 200 }, (_, i) => `- line ${i + 1}（来源：seed；范围：project）`).join('\n') + '\n',
  )
  process.chdir(fullProject)
  assert.throws(
    () => call('memory_write', { text: 'one too many', source: 'test-session', scope: 'project' }),
    /超过预算 200 行/,
  )
  process.chdir(project)

  console.log(`ok — ${tools.size} tools, write/read/search/health + fences + budget`)
} finally {
  process.chdir(oldCwd)
  if (oldHome === undefined) delete process.env.DSH_MEMORY_HOME
  else process.env.DSH_MEMORY_HOME = oldHome
  rmSync(root, { recursive: true, force: true })
}
