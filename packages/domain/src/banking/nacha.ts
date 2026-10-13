/**
 * Pure NACHA ACH file generator.
 *
 * Implements the 94-character fixed-width standard for automated clearing house (ACH)
 * direct deposit payroll files (Standard Entry Class: PPD).
 *
 * Reference: National Automated Clearing House Association (NACHA) Operating Rules.
 */

export interface NachaCompanyInfo {
  name: string
  identification: string // 10 chars (e.g. 9-digit EIN prefixed with 1)
  originatingRoutingNumber: string // 9-digit ABA routing transit number
  originatingBankName?: string
  destinationBankName?: string
  immediateDestination?: string // 9-10 chars (defaults to space + 9-digit routing)
}

export interface NachaPaymentEntry {
  employeeId: string
  employeeName: string
  routingNumber: string // 9 digits
  accountNumber: string // up to 17 alphanumeric characters
  amountCents: number | bigint
  accountType?: 'CHECKING' | 'SAVINGS'
  discretionaryData?: string
}

export interface NachaFileOptions {
  company: NachaCompanyInfo
  effectiveDate: string // YYYY-MM-DD or YYMMDD
  creationDate?: Date
  fileIdModifier?: string
  entries: NachaPaymentEntry[]
}

export interface NachaGenerationResult {
  fileContent: string
  recordCount: number
  blockCount: number
  entryCount: number
  totalAmountCents: bigint
  entryHash: string
}

/** Validates ABA 9-digit routing transit number checksum: 3*(d1+d4+d7) + 7*(d2+d5+d8) + 1*(d3+d6+d9) mod 10 == 0 */
export function isValidAbaRoutingNumber(routing: string): boolean {
  const digits = routing.trim()
  if (!/^\d{9}$/.test(digits)) return false
  const d = digits.split('').map(Number)
  const checksum = (
    3 * (d[0]! + d[3]! + d[6]!) +
    7 * (d[1]! + d[4]! + d[7]!) +
    1 * (d[2]! + d[5]! + d[8]!)
  ) % 10
  return checksum === 0
}

function padRight(value: string, length: number, fillChar = ' '): string {
  const sanitized = value.replace(/[\r\n]/g, '').trim()
  if (sanitized.length >= length) return sanitized.slice(0, length).toUpperCase()
  return (sanitized + fillChar.repeat(length - sanitized.length)).toUpperCase()
}

function padLeft(value: string | number | bigint, length: number, fillChar = '0'): string {
  const str = String(value).trim()
  if (str.length >= length) return str.slice(-length)
  return fillChar.repeat(length - str.length) + str
}

function formatYYMMDD(dateStrOrObj: string | Date): string {
  if (dateStrOrObj instanceof Date) {
    const yy = String(dateStrOrObj.getUTCFullYear()).slice(-2)
    const mm = padLeft(dateStrOrObj.getUTCMonth() + 1, 2)
    const dd = padLeft(dateStrOrObj.getUTCDate(), 2)
    return `${yy}${mm}${dd}`
  }
  const clean = dateStrOrObj.replace(/-/g, '').trim()
  if (clean.length === 8) return clean.slice(2) // YYYYMMDD -> YYMMDD
  if (clean.length === 6) return clean
  throw new Error(`Invalid date format for NACHA: ${dateStrOrObj}`)
}

function formatHHMM(date: Date): string {
  const hh = padLeft(date.getUTCHours(), 2)
  const mm = padLeft(date.getUTCMinutes(), 2)
  return `${hh}${mm}`
}

function sanitizeAlphaNumeric(str: string): string {
  return str.replace(/[^A-Za-z0-9 ]/g, '').trim()
}

/**
 * Generates an RFC-compliant 94-character fixed-width NACHA Direct Deposit file.
 */
export function generateNachaFile(options: NachaFileOptions): NachaGenerationResult {
  const { company, entries, effectiveDate } = options
  const creationDate = options.creationDate ?? new Date()
  const fileIdModifier = (options.fileIdModifier ?? 'A').slice(0, 1).toUpperCase()

  const origRouting = company.originatingRoutingNumber.replace(/\D/g, '')
  if (origRouting.length !== 9) {
    throw new Error(`Originating routing number must be 9 digits: ${company.originatingRoutingNumber}`)
  }
  const origDfi8 = origRouting.slice(0, 8)

  const immediateDest = (company.immediateDestination ?? ` ${origRouting}`).padEnd(10, ' ').slice(0, 10)
  const immediateOrigin = padRight(sanitizeAlphaNumeric(company.identification), 10)
  const destName = padRight(sanitizeAlphaNumeric(company.destinationBankName ?? 'ACH OPERATOR'), 23)
  const originName = padRight(sanitizeAlphaNumeric(company.originatingBankName ?? company.name), 23)

  const fileCreationDateYYMMDD = formatYYMMDD(creationDate)
  const fileCreationTimeHHMM = formatHHMM(creationDate)
  const effectiveDateYYMMDD = formatYYMMDD(effectiveDate)

  // 1. File Header Record (Type 1)
  const fileHeader = [
    '1',
    '01',
    immediateDest,
    immediateOrigin,
    fileCreationDateYYMMDD,
    fileCreationTimeHHMM,
    fileIdModifier,
    '094',
    '10',
    '1',
    destName,
    originName,
    padRight('', 8),
  ].join('')

  if (fileHeader.length !== 94) {
    throw new Error(`File Header record must be exactly 94 chars (got ${fileHeader.length})`)
  }

  // 2. Company / Batch Header Record (Type 5)
  const companyName = padRight(sanitizeAlphaNumeric(company.name), 16)
  const companyId = padRight(sanitizeAlphaNumeric(company.identification), 10)
  const batchNumber = 1
  const batchNumStr = padLeft(batchNumber, 7)

  const batchHeader = [
    '5',
    '220', // Automated Deposit Credits only
    companyName,
    padRight('', 20), // Discretionary data
    companyId,
    'PPD', // Standard Entry Class: Prearranged Payment and Deposit
    padRight('PAYROLL', 10),
    fileCreationDateYYMMDD, // Company descriptive date
    effectiveDateYYMMDD,   // Effective entry date
    '   ',                // 3 spaces settlement date
    '1',                  // Originator status code
    origDfi8,             // Originating DFI identification
    batchNumStr,
  ].join('')

  if (batchHeader.length !== 94) {
    throw new Error(`Batch Header record must be exactly 94 chars (got ${batchHeader.length})`)
  }

  // 3. Entry Detail Records (Type 6)
  const detailRecords: string[] = []
  let totalAmountCents = 0n
  let routingSum = 0n

  entries.forEach((entry, idx) => {
    const rawRouting = entry.routingNumber.replace(/\D/g, '')
    if (rawRouting.length !== 9) {
      throw new Error(`Invalid employee routing number (must be 9 digits) for ${entry.employeeName}: ${entry.routingNumber}`)
    }
    const receivingDfi8 = rawRouting.slice(0, 8)
    const checkDigit = rawRouting.slice(8, 9)

    const amount = BigInt(entry.amountCents)
    if (amount <= 0n) {
      throw new Error(`Payment amount must be positive for ${entry.employeeName}`)
    }
    totalAmountCents += amount
    routingSum += BigInt(receivingDfi8)

    // 22 = Checking Credit, 32 = Savings Credit
    const txCode = entry.accountType === 'SAVINGS' ? '32' : '22'
    const accountNumber = padRight(sanitizeAlphaNumeric(entry.accountNumber), 17)
    const amountStr = padLeft(amount, 10)
    const employeeId = padRight(sanitizeAlphaNumeric(entry.employeeId), 15)
    const employeeName = padRight(sanitizeAlphaNumeric(entry.employeeName), 22)
    const discretionary = padRight(entry.discretionaryData ?? '', 2)
    const traceNumber = `${origDfi8}${padLeft(idx + 1, 7)}`

    const detail = [
      '6',
      txCode,
      receivingDfi8,
      checkDigit,
      accountNumber,
      amountStr,
      employeeId,
      employeeName,
      discretionary,
      '0', // Addenda Record Indicator
      traceNumber,
    ].join('')

    if (detail.length !== 94) {
      throw new Error(`Detail record must be exactly 94 chars (got ${detail.length}) for employee ${entry.employeeName}`)
    }
    detailRecords.push(detail)
  })

  // Entry Hash is sum of 8-digit receiving routing numbers modulo 10,000,000,000
  const entryHashNum = routingSum % 10000000000n
  const entryHashStr = padLeft(entryHashNum, 10)
  const entryCount = detailRecords.length

  // 4. Company / Batch Control Record (Type 8)
  const batchControl = [
    '8',
    '220',
    padLeft(entryCount, 6),
    entryHashStr,
    padLeft(0, 12), // Total Debit dollar amount (cents)
    padLeft(totalAmountCents, 12), // Total Credit dollar amount (cents)
    companyId,
    padRight('', 19), // Message Authentication Code
    padRight('', 6),  // Reserved
    origDfi8,
    batchNumStr,
  ].join('')

  if (batchControl.length !== 94) {
    throw new Error(`Batch Control record must be exactly 94 chars (got ${batchControl.length})`)
  }

  // 5. File Control Record (Type 9)
  // Total records before padding: 1 (File Header) + 1 (Batch Header) + entries + 1 (Batch Control) + 1 (File Control) = entries + 4
  const unpaddedRecordCount = entryCount + 4
  const remainder = unpaddedRecordCount % 10
  const padLinesNeeded = remainder === 0 ? 0 : 10 - remainder
  const totalRecordCount = unpaddedRecordCount + padLinesNeeded
  const blockCount = totalRecordCount / 10

  const fileControl = [
    '9',
    padLeft(1, 6), // Batch count
    padLeft(blockCount, 6),
    padLeft(entryCount, 8),
    entryHashStr,
    padLeft(0, 12), // Total Debit
    padLeft(totalAmountCents, 12), // Total Credit
    padRight('', 39), // Reserved
  ].join('')

  if (fileControl.length !== 94) {
    throw new Error(`File Control record must be exactly 94 chars (got ${fileControl.length})`)
  }

  // 6. Block Padding Records (Type 9999...)
  const padLine = '9'.repeat(94)
  const padRecords = Array.from({ length: padLinesNeeded }, () => padLine)

  const allRecords = [
    fileHeader,
    batchHeader,
    ...detailRecords,
    batchControl,
    fileControl,
    ...padRecords,
  ]

  return {
    fileContent: allRecords.join('\r\n') + '\r\n',
    recordCount: allRecords.length,
    blockCount,
    entryCount,
    totalAmountCents,
    entryHash: entryHashStr,
  }
}
