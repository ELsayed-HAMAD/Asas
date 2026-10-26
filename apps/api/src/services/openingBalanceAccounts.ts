import type { Prisma } from '@prisma/client'

/**
 * Accounts whose opening balances are owned by the Finance cutover or the inventory subledger.
 * A direct opening-balance flow must not post to them: AR/AP and migration equity are derived
 * from validated open items, and inventory asset/opening equity must come from the inventory
 * valuation ledger. Keeping this list in one place makes staging, manual opening, and the
 * Finance cutover backstop agree.
 */
export const FINANCE_OPENING_RESERVED_CODES = [
  'ACCOUNTS_PAYABLE',
  'ACCOUNTS_RECEIVABLE',
  'MIGRATION_OPENING_EQUITY',
] as const

export const INVENTORY_OPENING_EQUITY_ACCOUNT_CODE = 'INVENTORY_OPENING_EQUITY'

type MappingReader = Pick<Prisma.TransactionClient, 'inventoryValuationAccountMapping'>

export async function reservedInventoryOpeningCodes(reader: MappingReader, tenantId: string, currency: string): Promise<Set<string>> {
  const mapping = await reader.inventoryValuationAccountMapping.findUnique({
    where: { tenantId_currency: { tenantId, currency } },
    select: { inventoryAssetAccountCode: true },
  })
  return new Set<string>([
    INVENTORY_OPENING_EQUITY_ACCOUNT_CODE,
    ...(mapping?.inventoryAssetAccountCode ? [mapping.inventoryAssetAccountCode] : []),
  ])
}

export async function reservedFinanceOpeningCodes(reader: MappingReader, tenantId: string, currency: string): Promise<Set<string>> {
  const inventoryCodes = await reservedInventoryOpeningCodes(reader, tenantId, currency)
  return new Set<string>([...FINANCE_OPENING_RESERVED_CODES, ...inventoryCodes])
}

export function reservedOpeningMessage(codes: ReadonlySet<string>): string {
  return `Reserved control accounts (${[...codes].sort().join(', ')}) cannot be posted directly. Finance cutover and the inventory subledger own those balances.`
}
