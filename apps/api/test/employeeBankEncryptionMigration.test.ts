import { describe, expect, it, vi } from 'vitest'
import { decryptBankDetail, encryptBankDetail } from '../src/services/crypto.js'
import { encryptLegacyEmployeeBankDetails } from '../scripts/encrypt-employee-bank-details.js'

describe('employee bank-data encryption backfill', () => {
  it('encrypts legacy values idempotently with tenant- and field-bound ciphertext', async () => {
    const rows = [
      { id: 'emp_1', tenantId: 'tenant_1', bankRoutingNumber: '021000021', bankAccountNumber: '1234567890', bankIban: null, bankBic: null },
      { id: 'emp_2', tenantId: 'tenant_2', bankRoutingNumber: null, bankAccountNumber: null, bankIban: encryptBankDetail('DE89370400440532013000', 'tenant_2', 'iban'), bankBic: null },
    ]
    const findMany = vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([])
    const updateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, string> }) => {
      expect(where).toMatchObject({ id: 'emp_1', tenantId: 'tenant_1', bankRoutingNumber: '021000021' })
      expect(data.bankRoutingNumber).not.toBe('021000021')
      expect(data.bankAccountNumber).not.toBe('1234567890')
      return { count: 1 }
    })
    const result = await encryptLegacyEmployeeBankDetails({ employee: { findMany, updateMany } } as never)
    expect(result).toEqual({ scanned: 2, encryptedFields: 2 })
    expect(decryptBankDetail(updateMany.mock.calls[0]![0].data.bankRoutingNumber, 'tenant_1', 'routingNumber')).toBe('021000021')
    expect(decryptBankDetail(rows[1]!.bankIban, 'tenant_2', 'iban')).toBe('DE89370400440532013000')
  })

  it('stops when compare-and-set detects a concurrent employee edit', async () => {
    const prisma = {
      employee: {
        findMany: vi.fn().mockResolvedValue([{ id: 'emp_1', tenantId: 'tenant_1', bankRoutingNumber: '021000021', bankAccountNumber: null, bankIban: null, bankBic: null }]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }
    await expect(encryptLegacyEmployeeBankDetails(prisma as never)).rejects.toThrow(/changed during bank-data encryption/)
  })
})
