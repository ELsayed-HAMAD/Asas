import { describe, expect, it } from 'vitest'
import { attendanceQuerySchema, leaveBalanceQuerySchema, leavePolicyWriteSchema } from './attendance.js'

describe('attendance range query', () => {
  it('defaults to the trailing 30 calendar days and accepts supported windows', () => {
    expect(attendanceQuerySchema.parse({})).toEqual({ rangeDays: 30 })
    expect(attendanceQuerySchema.parse({ rangeDays: '7' })).toEqual({ rangeDays: 7 })
    expect(attendanceQuerySchema.parse({ rangeDays: '90' })).toEqual({ rangeDays: 90 })
  })

  it('rejects unsupported range lengths', () => {
    expect(attendanceQuerySchema.safeParse({ rangeDays: '14' }).success).toBe(false)
  })
})

describe('leave balance policy contracts', () => {
  it('validates policy allowance bounds and weekday charging', () => {
    expect(leavePolicyWriteSchema.parse({ annualAllowanceDays: 20, weekdaysOnly: true })).toEqual({ annualAllowanceDays: 20, weekdaysOnly: true })
    expect(leavePolicyWriteSchema.safeParse({ annualAllowanceDays: 367, weekdaysOnly: false }).success).toBe(false)
    expect(leavePolicyWriteSchema.safeParse({ annualAllowanceDays: -1, weekdaysOnly: false }).success).toBe(false)
  })

  it('accepts an optional bounded balance year', () => {
    expect(leaveBalanceQuerySchema.parse({ year: '2026' })).toEqual({ year: 2026 })
    expect(leaveBalanceQuerySchema.parse({})).toEqual({})
    expect(leaveBalanceQuerySchema.safeParse({ year: '1999' }).success).toBe(false)
  })
})
