import { describe, expect, it } from 'vitest'
import { queryKeys } from './queryKeys.js'

describe('queryKeys', () => {
  it('nests every module key under the shared root', () => {
    expect(queryKeys.all()).toEqual(['asas'])
    expect(queryKeys.hr.all()).toEqual(['asas', 'hr'])
    expect(queryKeys.hr.employees.all()).toEqual(['asas', 'hr', 'employees'])
  })

  it('derives list and detail keys from the same resource base', () => {
    expect(queryKeys.hr.employees.list()).toEqual(['asas', 'hr', 'employees', 'list', {}])
    expect(queryKeys.hr.employees.list({ status: 'ACTIVE' })).toEqual([
      'asas',
      'hr',
      'employees',
      'list',
      { status: 'ACTIVE' },
    ])
    expect(queryKeys.hr.employees.detail('emp_1')).toEqual(['asas', 'hr', 'employees', 'detail', 'emp_1'])
  })

  it('keeps every module scoped so invalidating one cannot collide with another', () => {
    expect(queryKeys.finance.payables.all()).toEqual(['asas', 'finance', 'payables'])
    expect(queryKeys.crm.deals.all()).toEqual(['asas', 'crm', 'deals'])
    expect(queryKeys.hr.employees.all()).not.toEqual(queryKeys.finance.payables.all())
  })

  it('gives non-resource endpoints their own leaf key under the module', () => {
    expect(queryKeys.auth.me()).toEqual(['asas', 'auth', 'me'])
    expect(queryKeys.tenant.current()).toEqual(['asas', 'tenant', 'current'])
    expect(queryKeys.dashboard.overview()).toEqual(['asas', 'dashboard', 'overview'])
  })
})
