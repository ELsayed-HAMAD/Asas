import { describe, expect, it } from 'vitest'
import {
  generateNachaFile,
  isValidAbaRoutingNumber,
  type NachaFileOptions,
} from './nacha.js'
import {
  generateSepaXml,
  isValidBic,
  isValidIban,
  type SepaFileOptions,
} from './sepa.js'

describe('ABA Routing Number validation', () => {
  it('validates genuine Federal Reserve ABA routing transit numbers', () => {
    // 011000015 (Federal Reserve Bank of Boston)
    expect(isValidAbaRoutingNumber('011000015')).toBe(true)
    // 121000358 (Bank of America San Francisco)
    expect(isValidAbaRoutingNumber('121000358')).toBe(true)
    // 021000021 (JPMorgan Chase New York)
    expect(isValidAbaRoutingNumber('021000021')).toBe(true)
  })

  it('rejects invalid ABA routing numbers or wrong lengths', () => {
    expect(isValidAbaRoutingNumber('123456789')).toBe(false)
    expect(isValidAbaRoutingNumber('011000014')).toBe(false)
    expect(isValidAbaRoutingNumber('01100001')).toBe(false)
    expect(isValidAbaRoutingNumber('not-a-number')).toBe(false)
  })
})

describe('NACHA Direct Deposit (.ach) Generation', () => {
  const sampleNachaOptions: NachaFileOptions = {
    company: {
      name: 'Asas Inc',
      identification: '1234567890',
      originatingRoutingNumber: '021000021', // Chase NY
      originatingBankName: 'JPMorgan Chase',
      destinationBankName: 'FedACH Operator',
    },
    effectiveDate: '2026-10-15',
    creationDate: new Date('2026-10-12T14:30:00Z'),
    fileIdModifier: 'A',
    entries: [
      {
        employeeId: 'EMP-001',
        employeeName: 'Alice Morgan',
        routingNumber: '121000358', // BofA
        accountNumber: '987654321',
        amountCents: 450000n, // $4,500.00
        accountType: 'CHECKING',
      },
      {
        employeeId: 'EMP-002',
        employeeName: 'Bob Martinez',
        routingNumber: '011000015', // Boston Fed
        accountNumber: '1122334455',
        amountCents: 375050n, // $3,750.50
        accountType: 'SAVINGS',
      },
    ],
  }

  it('generates a file where every record is strictly 94 characters', () => {
    const result = generateNachaFile(sampleNachaOptions)
    const lines = result.fileContent.split('\r\n').filter(Boolean)

    expect(lines.length).toBeGreaterThan(0)
    for (const [index, line] of lines.entries()) {
      expect(line.length, `Line ${index + 1} length`).toBe(94)
    }
  })

  it('guarantees blocking factor of 10 with 9-padded block lines', () => {
    const result = generateNachaFile(sampleNachaOptions)
    const lines = result.fileContent.split('\r\n').filter(Boolean)

    expect(lines.length % 10).toBe(0)
    expect(result.recordCount).toBe(lines.length)
    expect(result.blockCount).toBe(lines.length / 10)

    // The remaining lines up to the multiple of 10 must be all 9s
    const paddingLines = lines.slice(result.entryCount + 4)
    for (const pad of paddingLines) {
      expect(pad).toBe('9'.repeat(94))
    }
  })

  it('computes correct batch control and file control entry totals and hash', () => {
    const result = generateNachaFile(sampleNachaOptions)
    expect(result.entryCount).toBe(2)
    expect(result.totalAmountCents).toBe(825050n) // 450000 + 375050

    // Sum of first 8 digits of routings: 12100035 + 01100001 = 13200036
    expect(result.entryHash).toBe('0013200036')

    const lines = result.fileContent.split('\r\n').filter(Boolean)
    const batchControl = lines.find(l => l.startsWith('8'))
    expect(batchControl).toBeDefined()
    expect(batchControl).toContain('0013200036')
    expect(batchControl).toContain('000000825050')

    const fileControl = lines.find(l => l.startsWith('9') && !l.startsWith('9999999999'))
    expect(fileControl).toBeDefined()
    expect(fileControl).toContain('0013200036')
    expect(fileControl).toContain('000000825050')
  })

  it('rejects entries with non-positive amounts or invalid routing numbers', () => {
    expect(() => {
      generateNachaFile({
        ...sampleNachaOptions,
        entries: [{ ...sampleNachaOptions.entries[0]!, amountCents: 0n }],
      })
    }).toThrow(/positive/)

    expect(() => {
      generateNachaFile({
        ...sampleNachaOptions,
        entries: [{ ...sampleNachaOptions.entries[0]!, routingNumber: '123' }],
      })
    }).toThrow(/routing number/)
  })
})

describe('SEPA ISO 20022 (pain.001.001.03) Generation', () => {
  it('validates IBANs using Mod-97', () => {
    // Valid sample IBANs
    expect(isValidIban('GB82WEST12345698765432')).toBe(true)
    expect(isValidIban('FR1420041010050500013M02606')).toBe(true)
    expect(isValidIban('DE89370400440532013000')).toBe(true)

    // Invalid IBANs
    expect(isValidIban('GB82WEST12345698765430')).toBe(false)
    expect(isValidIban('invalid-iban')).toBe(false)
    expect(isValidIban('12345')).toBe(false)
  })

  it('validates BICs', () => {
    expect(isValidBic('DEUTDEFF')).toBe(true)
    expect(isValidBic('DEUTDEFF500')).toBe(true)
    expect(isValidBic('BNPAFRPPXXX')).toBe(true)
    expect(isValidBic('SHORT')).toBe(false)
    expect(isValidBic('INVALID-BIC-CODE')).toBe(false)
  })

  const sampleSepaOptions: SepaFileOptions = {
    initiator: {
      name: 'Asas Europe BV',
      iban: 'DE89370400440532013000',
      bic: 'DEUTDEFF',
    },
    requestedExecutionDate: '2026-10-16',
    creationDateTime: new Date('2026-10-12T14:30:00Z'),
    messageId: 'MSG-ASAS-2026-001',
    entries: [
      {
        endToEndId: 'SALARY-2026-01',
        employeeName: 'Jean & Co Dupont <Director>',
        iban: 'FR1420041010050500013M02606',
        bic: 'BNPAFRPPXXX',
        amountCents: 520050n, // 5200.50 EUR
        remittanceInfo: 'October Salary & Bonus',
      },
      {
        endToEndId: 'SALARY-2026-02',
        employeeName: 'Hans Schmidt',
        iban: 'DE89370400440532013000',
        amountCents: 380000n, // 3800.00 EUR
        remittanceInfo: 'October Salary',
      },
    ],
  }

  it('generates well-formed XML with escaped characters and correct control sums', () => {
    const result = generateSepaXml(sampleSepaOptions)

    expect(result.transactionCount).toBe(2)
    expect(result.controlSum).toBe('9000.50') // 5200.50 + 3800.00
    expect(result.messageId).toBe('MSG-ASAS-2026-001')

    const xml = result.xmlContent
    expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"')
    expect(xml).toContain('<NbOfTxs>2</NbOfTxs>')
    expect(xml).toContain('<CtrlSum>9000.50</CtrlSum>')
    expect(xml).toContain('<InstdAmt Ccy="EUR">5200.50</InstdAmt>')
    expect(xml).toContain('<InstdAmt Ccy="EUR">3800.00</InstdAmt>')

    // Verify XML escaping of special characters: & and < and >
    expect(xml).toContain('Jean &amp; Co Dupont &lt;Director&gt;')
    expect(xml).toContain('October Salary &amp; Bonus')
    expect(xml).not.toContain('Jean & Co Dupont <Director>')

    // Verify debtor IBAN and execution date
    expect(xml).toContain('<ReqdExctnDt>2026-10-16</ReqdExctnDt>')
    expect(xml).toContain('<IBAN>DE89370400440532013000</IBAN>')
  })

  it('rejects invalid initiator or creditor IBANs', () => {
    expect(() => {
      generateSepaXml({
        ...sampleSepaOptions,
        initiator: { ...sampleSepaOptions.initiator, iban: 'INVALID-IBAN' },
      })
    }).toThrow(/Invalid initiator IBAN/)

    expect(() => {
      generateSepaXml({
        ...sampleSepaOptions,
        entries: [{ ...sampleSepaOptions.entries[0]!, iban: 'INVALID-IBAN' }],
      })
    }).toThrow(/Invalid creditor IBAN/)
  })
})
