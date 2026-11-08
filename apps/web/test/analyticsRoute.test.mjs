import test from 'node:test'
import assert from 'node:assert/strict'
import { toAnonymousRoute } from '../src/lib/analyticsRoute.js'

test('auth links lose their tokens, addresses, and invitation ids', () => {
  assert.equal(
    toAnonymousRoute('https://app.test/reset-password?token=secret-token#form'),
    'https://app.test/reset-password',
  )
  assert.equal(
    toAnonymousRoute('https://app.test/verify-email?email=person%40example.com'),
    'https://app.test/verify-email',
  )
  assert.equal(
    toAnonymousRoute('https://app.test/accept-invitation?invitationId=abc123&next=%2Fdashboard'),
    'https://app.test/accept-invitation',
  )
})

test('record ids are masked so a route cannot identify a workspace', () => {
  assert.equal(
    toAnonymousRoute('https://app.test/admin/workspaces/7f2c1e1a-9d34-4a5b-8e77-0b6a5c2d1f33'),
    'https://app.test/admin/workspaces/:id',
  )
})

test('plain marketing and dashboard routes keep their path', () => {
  assert.equal(toAnonymousRoute('https://app.test/#pricing'), 'https://app.test/')
  assert.equal(toAnonymousRoute('/dashboard/finance/invoices'), 'http://localhost/dashboard/finance/invoices')
})
