import test from 'node:test'
import assert from 'node:assert/strict'
import { getMemberRoleName } from '../src/lib/memberRole.js'

test('normalizes a role string', () => {
  assert.equal(getMemberRoleName('ADMIN'), 'ADMIN')
})

test('normalizes an active member role result object', () => {
  assert.equal(getMemberRoleName({ role: 'OWNER' }), 'OWNER')
})

test('normalizes role casing and handles missing or malformed results', () => {
  assert.equal(getMemberRoleName({ role: 'admin' }), 'ADMIN')
  assert.equal(getMemberRoleName(null), '')
  assert.equal(getMemberRoleName({ role: null }), '')
})
