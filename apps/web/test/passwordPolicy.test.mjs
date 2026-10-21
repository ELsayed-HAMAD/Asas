import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePasswordPolicy, getPasswordStrength } from '../src/lib/passwordPolicy.js'

test('passwordPolicy validation enforces length and character classes', () => {
  // Too short
  assert.match(validatePasswordPolicy('Abc!1'), /at least 12 characters/)
  assert.match(validatePasswordPolicy('Abcdefghijk!'), /at least one number/)
  assert.match(validatePasswordPolicy('Abcdefghijk1'), /at least one symbol/)
  assert.match(validatePasswordPolicy('abcdefghijk1!'), /uppercase/)
  assert.match(validatePasswordPolicy('ABCDEFGHIJK1!'), /lowercase/)

  // Valid password
  assert.equal(validatePasswordPolicy('ValidPass123!@#'), null)
})

test('passwordPolicy strength calculation evaluates composition', () => {
  assert.equal(getPasswordStrength('').score, 0)
  assert.equal(getPasswordStrength('weak').score, 0)
  assert.equal(getPasswordStrength('moderate12').score, 2)
  assert.equal(getPasswordStrength('ValidPass123!').score, 4)
  assert.equal(getPasswordStrength('ValidPass123!').label, 'Strong')
})

