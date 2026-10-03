import { describe, expect, it } from 'vitest'
import {
  generateEnumsModule,
  locateSchema,
  readGeneratedFile,
} from '../scripts/prisma-enums.js'
import {
  attendanceExceptionTypeSchema,
  dealStageSchema,
  expenseCategorySchema,
  leaveTypeSchema,
  payrollRunStatusSchema,
  prismaEnums,
  userRoleSchema,
} from './enums.generated.js'

describe('Generated Prisma Enums Contract', () => {
  it('matches the live Prisma schema exactly', () => {
    const schemaPath = locateSchema()
    const expected = generateEnumsModule(schemaPath)
    const actual = readGeneratedFile()

    // Normalize CRLF to LF for reliable cross-platform comparison
    expect(actual.replace(/\r\n/g, '\n')).toBe(expected.replace(/\r\n/g, '\n'))
  })

  it('contains all required ERP core enums with valid schema definitions', () => {
    expect(userRoleSchema.options).toEqual(['OWNER', 'ADMIN', 'MEMBER'])
    expect(dealStageSchema.options).toEqual([
      'LEADS',
      'PROPOSAL',
      'NEGOTIATION',
      'CLOSED_WON',
      'CLOSED_LOST',
    ])
    expect(attendanceExceptionTypeSchema.options).toEqual([
      'MISSING_IN',
      'MISSING_OUT',
      'OVERTIME',
    ])
    expect(payrollRunStatusSchema.options).toEqual([
      'DRAFT',
      'PENDING',
      'APPROVED',
      'PAID',
    ])
    expect(leaveTypeSchema.options).toEqual(['VACATION', 'SICK', 'PERSONAL'])
    expect(expenseCategorySchema.options).toContain('OFFICE_SUPPLIES')
    expect(expenseCategorySchema.options).toContain('FACILITIES_LEASE')
  })

  it('provides a complete registry object in prismaEnums', () => {
    expect(Object.keys(prismaEnums).length).toBe(25)
    expect(prismaEnums.UserRole).toEqual(['OWNER', 'ADMIN', 'MEMBER'])
  })
})
