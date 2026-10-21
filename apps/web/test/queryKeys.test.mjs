import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { queryKeys, setQueryScope, scopeServerPrefix } from '../src/lib/queryKeys.js'

afterEach(() => setQueryScope(null))

test('switching workspaces cannot reuse another workspace cached data', () => {
  const client = new QueryClient()
  setQueryScope('org_a')
  const original = queryKeys.hr.employees.list()
  client.setQueryData(original, { items: [{ name: 'Private employee' }] })
  setQueryScope('org_b')
  assert.equal(client.getQueryData(queryKeys.hr.employees.list()), undefined)
  assert.deepEqual(original.slice(0, 2), ['asas', 'org_a'])
  client.clear()
})

test('notification cache keys are scoped to both the workspace and user', () => {
  setQueryScope('org_a')
  const firstUser = queryKeys.notifications.user('user_1')
  const secondUser = queryKeys.notifications.user('user_2')
  assert.deepEqual(firstUser, ['asas', 'org_a', 'notifications', 'user', 'user_1'])
  assert.notDeepEqual(firstUser, secondUser)

  setQueryScope('org_b')
  assert.deepEqual(queryKeys.notifications.user('user_1'), ['asas', 'org_b', 'notifications', 'user', 'user_1'])
})

test('all resource and module prefixes read the current scope lazily', () => {
  for (const scope of ['org_a', 'org_b']) {
    setQueryScope(scope)
    for (const module of Object.values(queryKeys)) {
      if (typeof module === 'function') continue
      assert.deepEqual(module.all().slice(0, 2), ['asas', scope])
    }
    assert.deepEqual(queryKeys.exports.jobs.list().slice(0, 3), ['asas', scope, 'exports'])
    assert.deepEqual(queryKeys.settings.integrations.detail('id').slice(0, 3), ['asas', scope, 'settings'])
  }
})

test('server SSE invalidation prefixes match only the current tenant', () => {
  setQueryScope('org_a')
  assert.deepEqual(scopeServerPrefix(['asas', 'finance']), ['asas', 'org_a', 'finance'])
  assert.deepEqual(scopeServerPrefix(['asas', 'notifications']), queryKeys.notifications.all())
  setQueryScope('org_b')
  assert.deepEqual(scopeServerPrefix(['asas', 'finance']), ['asas', 'org_b', 'finance'])
  assert.deepEqual(scopeServerPrefix(['asas', 'notifications']), queryKeys.notifications.all())
})

test('signed-out scope and export module invalidation remain valid', () => {
  setQueryScope(null)
  assert.deepEqual(queryKeys.all(), ['asas', 'none'])
  assert.deepEqual(queryKeys.exports.all(), ['asas', 'none', 'exports'])
})
