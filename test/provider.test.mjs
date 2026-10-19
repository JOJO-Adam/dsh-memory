/**
 * Provider smoke test: run without DSH by faking `ctx.skills`.
 *   node test/provider.test.mjs
 */
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

let registered
const ctx = {
  skills: {
    registerProvider(factory) {
      registered = factory({})
    },
  },
}

apply(ctx)
assert.ok(registered, 'provider was not registered')

const list = await registered.list()
assert.ok(Array.isArray(list) && list.length > 0, 'no skills discovered')

const skill = list.find((item) => item.name === 'memory-hub')
assert.ok(skill, 'memory-hub not discovered')
assert.equal(skill.provider, 'jojo-adam-memory')
assert.ok(skill.description.length > 20, 'description too short')
assert.equal(skill.resourceBase.kind, 'directory')
assert.ok(skill.resourceBase.path.endsWith('skills/memory-hub'))

const loaded = await registered.get(skill)
assert.ok(loaded.content.includes('记忆中枢'), 'body missing')
assert.ok(loaded.content.length > 2000, 'body suspiciously short')

console.log(`ok — ${list.length} skill(s), memory-hub ${loaded.content.length} chars`)
