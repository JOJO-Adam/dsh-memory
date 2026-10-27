/**
 * Native hook smoke tests — route hints, Bash guard, daily digest.
 *   node test/hooks.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'
import { getHookMetrics } from '../lib/memory/metrics.js'

const handlers = new Map()
const ctx = {
  skills: { registerProvider() {} },
  tools: { register() {} },
  systemPrompt: { section() {} },
  on(event, handler) {
    handlers.set(event, handler)
  },
}

apply(ctx)
for (const event of ['agent/created', 'tools/post-execute', 'session/event', 'agent/turn-stopping']) {
  assert.ok(handlers.has(event), `missing hook: ${event}`)
}

const root = mkdtempSync(join(tmpdir(), 'dsh-memory-hooks-'))
const project = join(root, 'project')
const globalRoot = join(root, 'global')
const memoryDir = join(project, '.dsh', 'memory')
mkdirSync(memoryDir, { recursive: true })
mkdirSync(globalRoot, { recursive: true })
writeFileSync(join(globalRoot, 'MEMORY.md'), '# Global\n')
writeFileSync(
  join(memoryDir, 'MEMORY.md'),
  '---\ntype: memory\nmodified: 2026-01-01\n---\n\n# Project\n\n- [2026-01-01] 原有条目（来源：seed；范围：project）\n',
)
writeFileSync(
  join(memoryDir, 'routes.tsv'),
  '触发\tglob\t路径\t摘要\n测试路由\t*.md\tMEMORY.md\t读 MEMORY\n',
)

const oldCwd = process.cwd()
const oldHome = process.env.DSH_MEMORY_HOME
process.env.DSH_MEMORY_HOME = globalRoot
process.chdir(project)

const agent = { id: 'session-1', cwd: project }
const signal = new AbortController().signal
const post = handlers.get('tools/post-execute')
const nextAccept = async () => ({ kind: 'accept' })

const runPost = async (exec) => {
  const result = { isError: false, content: [{ type: 'text', text: 'tool result' }] }
  return post(exec, result, nextAccept)
}

try {
  // Route hint after a matching read, then dedup on the same agent/file.
  const readExec = {
    name: 'read',
    arguments: { file_path: join(project, 'README.md') },
    agent,
  }
  const first = await runPost(readExec)
  assert.equal(first.kind, 'accept')
  assert.ok(first.content.some((x) => x.text.includes('【记忆路由】')), 'route hint missing')
  assert.ok(first.content.some((x) => x.text.includes('读 MEMORY')))

  const second = await runPost(readExec)
  assert.ok(!(second.content ?? []).some((x) => x.text.includes('【记忆路由】')), 'route hint should dedup')

  // Bash guard: agent/created establishes the snapshot; a later change is reported.
  handlers.get('agent/created')({ agent, source: 'test' })
  writeFileSync(
    join(memoryDir, 'MEMORY.md'),
    readFileSync(join(memoryDir, 'MEMORY.md'), 'utf8') + '\n- [2026-01-01] bash 新增（来源：bash；范围：project）\n',
  )
  const bash = await runPost({ name: 'bash', arguments: { command: 'echo' }, agent })
  assert.ok(bash.content.some((x) => x.text.includes('【记忆写入】')), 'bash change missing')
  assert.ok(bash.content.some((x) => x.text.includes('变了：')), 'changed file missing')

  // Secret scan on a Bash-side write.
  writeFileSync(
    join(memoryDir, 'MEMORY.md'),
    readFileSync(join(memoryDir, 'MEMORY.md'), 'utf8') + `\nkey sk-${'a'.repeat(16)}\n`,
  )
  const secret = await runPost({ name: 'bash', arguments: { command: 'echo' }, agent })
  assert.ok(secret.content.some((x) => x.text.includes('凭据：')), 'secret warning missing')
  assert.ok(!secret.content.some((x) => x.text.includes('sk-aaaaaaaaaaaaaaaa')), 'secret must not echo')

  // Budget: Bash pushing a 200-line index over the project limit.
  const budgetProject = join(root, 'budget-project')
  const budgetMem = join(budgetProject, '.dsh', 'memory')
  mkdirSync(budgetMem, { recursive: true })
  writeFileSync(
    join(budgetMem, 'MEMORY.md'),
    Array.from({ length: 200 }, (_, i) => `- line ${i + 1}（来源：seed；范围：project）`).join('\n') + '\n',
  )
  const budgetAgent = { id: 'session-2', cwd: budgetProject }
  handlers.get('agent/created')({ agent: budgetAgent, source: 'test' })
  writeFileSync(join(budgetMem, 'MEMORY.md'), readFileSync(join(budgetMem, 'MEMORY.md'), 'utf8') + '- one too many\n')
  const budget = await runPost({ name: 'bash', arguments: { command: 'echo' }, agent: budgetAgent })
  assert.ok(budget.content.some((x) => x.text.includes('预算：')), 'bash budget warning missing')

  // Digest: session events -> turn-stopping -> idempotent block.
  const today = (() => {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  })()
  const daily = join(memoryDir, `${today}.md`)
  writeFileSync(daily, `# ${today}\n\n手写：原有内容\n`)

  const session = { id: 'session-1' }
  handlers.get('session/event')(session, {
    type: 'user/message',
    data: { message: { role: 'user', content: [{ type: 'text', text: '请总结这次改动' }] } },
  })
  handlers.get('session/event')(session, {
    type: 'assistant/message',
    data: { message: { role: 'assistant', content: [{ type: 'text', text: '结论：这是超过十个字的摘要。' }] } },
  })
  handlers.get('agent/turn-stopping')({ agent, turn: 1, signal })

  let text = readFileSync(daily, 'utf8')
  assert.match(text, /手写：原有内容/)
  assert.match(text, /dsh-memory-digest:start/)
  assert.match(text, /请总结这次改动/)
  assert.match(text, /结论：这是超过十个字的摘要/)
  assert.equal((text.match(/dsh-memory-digest:start/g) ?? []).length, 1)

  handlers.get('session/event')(session, {
    type: 'user/message',
    data: { message: { role: 'user', content: [{ type: 'text', text: '第二次' }] } },
  })
  handlers.get('agent/turn-stopping')({ agent, turn: 2, signal })
  text = readFileSync(daily, 'utf8')
  assert.equal((text.match(/dsh-memory-digest:start/g) ?? []).length, 1, 'digest must stay one block')
  assert.match(text, /手写：原有内容/)

  // Subagent brief: only subagents get a read-only project/global brief.
  let subSection = null
  const subAgent = {
    id: 'sub-1',
    options: { subagentDepth: 1 },
    session: { header: { origin: 'subagent', cwd: project } },
    ctx: { systemPrompt: { section(value) { subSection = value } } },
  }
  handlers.get('agent/created')({ agent: subAgent, source: 'test' })
  assert.ok(subSection, 'subagent brief section missing')
  assert.match(subSection.text, /Subagent memory brief/)
  assert.match(subSection.text, /原有条目/)
  assert.ok(!subSection.text.includes('sk-aaaaaaaaaaaaaaaa'), 'subagent brief must not leak secrets')
  assert.match(subSection.text, /已脱敏/)
  assert.equal(getHookMetrics().subagentBriefs >= 1, true)

  let leadSection = null
  const leadAgent = {
    id: 'lead-1',
    session: { header: { cwd: project } },
    ctx: { systemPrompt: { section(value) { leadSection = value } } },
  }
  handlers.get('agent/created')({ agent: leadAgent, source: 'test' })
  assert.equal(leadSection, null, 'lead should not get subagent brief')

  const metrics = getHookMetrics()
  assert.ok(metrics.routeHints >= 1, 'route metric missing')
  assert.ok(metrics.bashChanges >= 1, 'bash metric missing')
  assert.ok(metrics.digests >= 1, 'digest metric missing')
  assert.ok(metrics.subagentBriefs >= 1, 'subagent metric missing')

  console.log('ok — route hint + dedup, Bash guard, digest idempotence, subagent brief, metrics')
} finally {
  process.chdir(oldCwd)
  if (oldHome === undefined) delete process.env.DSH_MEMORY_HOME
  else process.env.DSH_MEMORY_HOME = oldHome
  rmSync(root, { recursive: true, force: true })
}
