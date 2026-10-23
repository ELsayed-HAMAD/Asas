import { PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { decryptBankDetail, encryptBankDetail, isBankEncrypted } from '../src/services/crypto.js'

const BATCH_SIZE = 200
const BANK_FIELDS = [
  ['bankRoutingNumber', 'routingNumber'],
  ['bankAccountNumber', 'accountNumber'],
  ['bankIban', 'iban'],
  ['bankBic', 'bic'],
] as const

type EmployeeBankRow = {
  id: string
  tenantId: string
  bankRoutingNumber: string | null
  bankAccountNumber: string | null
  bankIban: string | null
  bankBic: string | null
}

type EmployeeBankStore = Pick<PrismaClient, 'employee'>

/** Idempotently encrypt legacy plaintext bank fields, using compare-and-set writes per employee. */
export async function encryptLegacyEmployeeBankDetails(prisma: EmployeeBankStore): Promise<{ scanned: number; encryptedFields: number }> {
  let cursor: string | undefined
  let scanned = 0
  let encryptedFields = 0
  for (;;) {
    const rows: EmployeeBankRow[] = await prisma.employee.findMany({
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take: BATCH_SIZE,
      orderBy: { id: 'asc' },
      select: {
        id: true, tenantId: true,
        bankRoutingNumber: true, bankAccountNumber: true, bankIban: true, bankBic: true,
      },
    })
    if (rows.length === 0) break
    for (const row of rows) {
      scanned++
      const data: Record<string, string | null> = {}
      for (const [property, aadField] of BANK_FIELDS) {
        const value = row[property]
        if (!value) continue
        if (isBankEncrypted(value)) {
          // Validate key/AAD before declaring this row migrated; fail closed on corruption.
          decryptBankDetail(value, row.tenantId, aadField)
          continue
        }
        data[property] = encryptBankDetail(value, row.tenantId, aadField)
      }
      const fields = Object.keys(data)
      if (fields.length === 0) continue
      const where = Object.fromEntries([
        ['id', row.id], ['tenantId', row.tenantId],
        ...BANK_FIELDS.map(([field]) => [field, row[field]]),
      ])
      const updated = await prisma.employee.updateMany({ where, data })
      if (updated.count !== 1) {
        throw new Error(`Employee ${row.id} changed during bank-data encryption; rerun the migration after resolving concurrent edits`)
      }
      encryptedFields += fields.length
    }
    cursor = rows.at(-1)!.id
    if (rows.length < BATCH_SIZE) break
  }
  return { scanned, encryptedFields }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && (process.env.BANK_DATA_ENCRYPTION_KEY?.trim().length ?? 0) < 32) {
    throw new Error('Set BANK_DATA_ENCRYPTION_KEY (at least 32 characters) before migrating production employee bank details')
  }
  const prisma = new PrismaClient()
  try {
    const result = await encryptLegacyEmployeeBankDetails(prisma)
    process.stdout.write(`Scanned ${result.scanned} employees; encrypted ${result.encryptedFields} bank fields.\n`)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
