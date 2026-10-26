import type { Prisma } from '@prisma/client'
import type { OpeningBalanceWriteInput } from '@asas/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ledger = vi.hoisted(() => ({ postOpeningBalance: vi.fn() }))
vi.mock('../src/modules/finance/ledger.service.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/modules/finance/ledger.service.js')>(),
  postOpeningBalance: ledger.postOpeningBalance,
}))

import { postOpeningBalance } from '../src/modules/finance/finance.service.js'

const tenantId = 'tenant_1'
const actorId = 'admin_1'

function setup(inventoryMapping: { inventoryAssetAccountCode: string } | null) {
  const tx = {
    tenant: { findUnique: vi.fn().mockResolvedValue({ currency: 'USD' }) },
    inventoryValuationAccountMapping: { findUnique: vi.fn().mockResolvedValue(inventoryMapping) },
  }
  return tx as unknown as Prisma.TransactionClient
}

const allowedInput: OpeningBalanceWriteInput = {
  asOf: '2026-09-30',
  description: 'Opening balances',
  lines: [
    { code: 'CASH', name: 'Cash', kind: 'ASSET', side: 'DEBIT', amount: '100.00' },
    { code: 'OPENING_EQUITY', name: 'Opening equity', kind: 'EQUITY', side: 'CREDIT', amount: '100.00' },
  ],
}

describe('manual Finance opening balances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ledger.postOpeningBalance.mockResolvedValue({ id: 'journal_1' })
  })

  it('blocks the mapped inventory asset account before the ledger is written', async () => {
    const tx = setup({ inventoryAssetAccountCode: 'INVENTORY_ASSET' })
    const input: OpeningBalanceWriteInput = {
      ...allowedInput,
      lines: [
        { code: 'INVENTORY_ASSET', name: 'Inventory', kind: 'ASSET', side: 'DEBIT', amount: '100.00' },
        { code: 'OPENING_EQUITY', name: 'Opening equity', kind: 'EQUITY', side: 'CREDIT', amount: '100.00' },
      ],
    }

    await expect(postOpeningBalance(tx, tenantId, actorId, input)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('INVENTORY_ASSET'),
    })
    expect(ledger.postOpeningBalance).not.toHaveBeenCalled()
  })

  it('always blocks inventory opening equity, even without a valuation mapping', async () => {
    const tx = setup(null)
    const input: OpeningBalanceWriteInput = {
      ...allowedInput,
      lines: [
        { code: 'CASH', name: 'Cash', kind: 'ASSET', side: 'DEBIT', amount: '100.00' },
        { code: 'INVENTORY_OPENING_EQUITY', name: 'Inventory opening equity', kind: 'EQUITY', side: 'CREDIT', amount: '100.00' },
      ],
    }

    await expect(postOpeningBalance(tx, tenantId, actorId, input)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('INVENTORY_OPENING_EQUITY'),
    })
    expect(ledger.postOpeningBalance).not.toHaveBeenCalled()
  })

  it('passes an ordinary opening balance to the ledger writer', async () => {
    const tx = setup({ inventoryAssetAccountCode: 'INVENTORY_ASSET' })
    await expect(postOpeningBalance(tx, tenantId, actorId, allowedInput)).resolves.toEqual({ id: 'journal_1' })
    expect(ledger.postOpeningBalance).toHaveBeenCalledWith(tx, tenantId, actorId, allowedInput)
  })
})
