import { describe, expect, it } from 'vitest'
import { employeeSchema, employeeUpdateSchema, employeeWriteSchema } from './employee.js'

const employee = {
  id: 'c123456789012345678901234',
  name: 'Ada Lovelace',
  title: 'Engineer',
  status: 'ACTIVE',
  departmentId: null,
  department: null,
  managerId: null,
  manager: null,
  directReports: 0,
  avatarUrl: null,
  hiredAt: '2026-01-01T00:00:00.000Z',
  employmentEndDate: '2026-10-16',
  salary: '120000.00',
  salaryBasis: 'ANNUAL',
  salaryEffectiveFrom: '2026-01-01',
  salaryHistory: [{ salary: '120000.00', salaryBasis: 'ANNUAL', currency: 'USD', effectiveFrom: '2026-01-01' }],
  equityOptions: null,
  band: null,
  location: null,
  employeeNumber: null,
  email: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('employee employment dates', () => {
  it('accepts and requires a calendar employment end date in employee responses', () => {
    expect(employeeSchema.safeParse(employee).success).toBe(true)
    const { employmentEndDate: _endDate, ...withoutEndDate } = employee
    expect(employeeSchema.safeParse(withoutEndDate).success).toBe(false)
  })

  it('accepts clearing or setting the employment end date in updates', () => {
    expect(employeeUpdateSchema.safeParse({ employmentEndDate: '2026-10-16' }).success).toBe(true)
    expect(employeeUpdateSchema.safeParse({ employmentEndDate: null }).success).toBe(true)
    expect(employeeUpdateSchema.safeParse({ employmentEndDate: '2026-02-31' }).success).toBe(false)
  })

  it('requires an effective date when creating a salary-bearing employee', () => {
    expect(employeeWriteSchema.safeParse({ name: 'Ada', title: 'Engineer', salary: '120000.00' }).success).toBe(false)
    expect(employeeWriteSchema.safeParse({ name: 'Ada', title: 'Engineer', salary: '120000.00', salaryEffectiveFrom: '2026-01-01' }).success).toBe(true)
  })
})
