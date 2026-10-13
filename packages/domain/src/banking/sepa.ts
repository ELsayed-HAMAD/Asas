/**
 * Pure SEPA Credit Transfer (ISO 20022 pain.001.001.03) XML generator.
 *
 * Implements European EPC (European Payments Council) SEPA Rulebook standards for
 * single-currency EUR credit transfers.
 */

export interface SepaCompanyInfo {
  name: string
  iban: string
  bic: string
}

export interface SepaPaymentEntry {
  endToEndId: string
  employeeName: string
  iban: string
  bic?: string
  amountCents: number | bigint // in EUR cents (e.g. 250000 = 2500.00 EUR)
  remittanceInfo?: string
}

export interface SepaFileOptions {
  initiator: SepaCompanyInfo
  requestedExecutionDate: string // YYYY-MM-DD
  creationDateTime?: Date
  messageId?: string
  paymentInfoId?: string
  entries: SepaPaymentEntry[]
}

export interface SepaGenerationResult {
  xmlContent: string
  transactionCount: number
  controlSum: string
  messageId: string
}

/**
 * Validates an International Bank Account Number (IBAN) using the ISO 7064 Mod 97-10 checksum algorithm.
 */
export function isValidIban(rawIban: string): boolean {
  const clean = rawIban.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (clean.length < 15 || clean.length > 34) return false

  // Move the four initial characters to the end of the string
  const rearranged = clean.slice(4) + clean.slice(0, 4)

  // Replace letters with digits: A=10, B=11, ..., Z=35
  let numericString = ''
  for (const char of rearranged) {
    const code = char.charCodeAt(0)
    if (code >= 65 && code <= 90) {
      numericString += (code - 55).toString()
    } else if (code >= 48 && code <= 57) {
      numericString += char
    } else {
      return false
    }
  }

  // Compute modulo 97 using BigInt
  try {
    return BigInt(numericString) % 97n === 1n
  } catch {
    return false
  }
}

/**
 * Validates a BIC / SWIFT code (8 or 11 characters).
 */
export function isValidBic(rawBic: string): boolean {
  const clean = rawBic.replace(/\s+/g, '').toUpperCase()
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean)
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatAmountEur(cents: bigint | number): string {
  const c = BigInt(cents)
  const integerPart = (c / 100n).toString()
  const fractionPart = (c % 100n).toString().padStart(2, '0')
  return `${integerPart}.${fractionPart}`
}

function sanitizeXmlString(value: string, maxLength: number): string {
  const trimmed = value.trim()
  return xmlEscape(trimmed.slice(0, maxLength))
}

/**
 * Generates an EPC-compliant ISO 20022 pain.001.001.03 SEPA Credit Transfer XML document.
 */
export function generateSepaXml(options: SepaFileOptions): SepaGenerationResult {
  const { initiator, entries, requestedExecutionDate } = options
  const now = options.creationDateTime ?? new Date()
  const msgId = options.messageId ?? `MSG-${now.getTime()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  const pmtInfId = options.paymentInfoId ?? `PMTINF-${now.getTime()}`

  const cleanDebtorIban = initiator.iban.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const cleanDebtorBic = initiator.bic.replace(/\s+/g, '').toUpperCase()

  if (!isValidIban(cleanDebtorIban)) {
    throw new Error(`Invalid initiator IBAN: ${initiator.iban}`)
  }
  if (!isValidBic(cleanDebtorBic)) {
    throw new Error(`Invalid initiator BIC: ${initiator.bic}`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedExecutionDate)) {
    throw new Error(`Invalid requested execution date (expected YYYY-MM-DD): ${requestedExecutionDate}`)
  }

  let totalCents = 0n
  const txNodes: string[] = []

  entries.forEach((entry, index) => {
    const creditorIban = entry.iban.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (!isValidIban(creditorIban)) {
      throw new Error(`Invalid creditor IBAN for ${entry.employeeName}: ${entry.iban}`)
    }

    const amount = BigInt(entry.amountCents)
    if (amount <= 0n) {
      throw new Error(`Payment amount must be positive for ${entry.employeeName}`)
    }
    totalCents += amount

    const endToEndId = sanitizeXmlString(entry.endToEndId || `E2E-${index + 1}`, 35)
    const creditorName = sanitizeXmlString(entry.employeeName, 70)
    const formattedAmount = formatAmountEur(amount)
    const remittance = sanitizeXmlString(entry.remittanceInfo || 'SALARY', 140)

    const creditorBicNode = entry.bic && isValidBic(entry.bic)
      ? `\n          <CdtrAgt>\n            <FinInstnId>\n              <BIC>${sanitizeXmlString(entry.bic.toUpperCase(), 11)}</BIC>\n            </FinInstnId>\n          </CdtrAgt>`
      : ''

    txNodes.push(`      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${endToEndId}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${formattedAmount}</InstdAmt>
        </Amt>${creditorBicNode}
        <Cdtr>
          <Nm>${creditorName}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${creditorIban}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${remittance}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`)
  })

  const controlSumStr = formatAmountEur(totalCents)
  const creDtTmIso = now.toISOString()

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${sanitizeXmlString(msgId, 35)}</MsgId>
      <CreDtTm>${creDtTmIso}</CreDtTm>
      <NbOfTxs>${entries.length}</NbOfTxs>
      <CtrlSum>${controlSumStr}</CtrlSum>
      <InitgPty>
        <Nm>${sanitizeXmlString(initiator.name, 70)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${sanitizeXmlString(pmtInfId, 35)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BchBookg>true</BchBookg>
      <NbOfTxs>${entries.length}</NbOfTxs>
      <CtrlSum>${controlSumStr}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${requestedExecutionDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${sanitizeXmlString(initiator.name, 70)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${cleanDebtorIban}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${cleanDebtorBic}</BIC>
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${txNodes.join('\n')}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`

  return {
    xmlContent: xml,
    transactionCount: entries.length,
    controlSum: controlSumStr,
    messageId: msgId,
  }
}
