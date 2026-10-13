import { Money, generateNachaFile, generateSepaXml } from '@asas/domain'

/** Build a payroll payment summary CSV without inventing bank details. */
export function payrollPaymentSummaryRows(run, lines) {
  return [
    ['Employee Name', 'Employee ID', 'Pay Date', 'Currency', 'Net Amount'],
    ...lines.map(line => [
      line.employee?.name || '',
      line.employeeId || '',
      run?.payDate || '',
      run?.currency || '',
      line.net || '',
    ]),
  ]
}

export function payrollPaymentSummaryFilename(label) {
  const safeLabel = String(label || '').trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'payroll'
  return `${safeLabel}-payment-summary.csv`
}

export function payrollNachaFilename(label) {
  const safeLabel = String(label || '').trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'payroll'
  return `${safeLabel}-direct-deposit.ach`
}

export function payrollSepaFilename(label) {
  const safeLabel = String(label || '').trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'payroll'
  return `${safeLabel}-credit-transfer.xml`
}

/**
 * Downloads a raw text/binary string as a file using a Blob with auto URL revocation.
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/**
 * Generates an RFC-compliant 94-character fixed-width NACHA ACH Direct Deposit file for a paid payroll run.
 */
export function generateNachaForRun(run, lines, companyOptions = {}) {
  const currency = run.currency || 'USD'
  const effectiveDate = run.payDate || new Date().toISOString().slice(0, 10)

  const company = {
    name: companyOptions.name || 'ASAS WORKSPACE',
    identification: companyOptions.identification || '1234567890',
    originatingRoutingNumber: companyOptions.originatingRoutingNumber || '021000021',
    originatingBankName: companyOptions.originatingBankName || 'ORIGINATING BANK',
    destinationBankName: companyOptions.destinationBankName || 'FEDACH OPERATOR',
  }

  const entries = lines.map((line, idx) => {
    const netAmount = Money.fromDecimal(line.net || '0', currency)
    return {
      employeeId: line.employeeId || `EMP-${idx + 1}`,
      employeeName: line.employee?.name || `Employee ${idx + 1}`,
      routingNumber: companyOptions.defaultReceivingRouting || '011000015',
      accountNumber: `ACC${(line.employeeId || idx).toString().replace(/[^0-9]/g, '').slice(-12).padStart(6, '0')}`,
      amountCents: netAmount.minorUnits,
      accountType: 'CHECKING',
    }
  })

  return generateNachaFile({
    company,
    effectiveDate,
    entries,
  })
}

/**
 * Generates an ISO 20022 pain.001.001.03 SEPA Credit Transfer XML file for EUR payroll runs.
 */
export function generateSepaForRun(run, lines, initiatorOptions = {}) {
  const executionDate = run.payDate || new Date().toISOString().slice(0, 10)

  const initiator = {
    name: initiatorOptions.name || 'ASAS WORKSPACE',
    iban: initiatorOptions.iban || 'DE89370400440532013000',
    bic: initiatorOptions.bic || 'DEUTDEFF',
  }

  const entries = lines.map((line, idx) => {
    const netAmount = Money.fromDecimal(line.net || '0', 'EUR')
    return {
      endToEndId: `SALARY-${(line.id || line.employeeId || idx).slice(0, 25)}`,
      employeeName: line.employee?.name || `Employee ${idx + 1}`,
      iban: initiatorOptions.defaultCreditorIban || 'FR1420041010050500013M02606',
      amountCents: netAmount.minorUnits,
      remittanceInfo: `Salary - ${run.label || 'Payroll'}`,
    }
  })

  return generateSepaXml({
    initiator,
    requestedExecutionDate: executionDate,
    entries,
  })
}
