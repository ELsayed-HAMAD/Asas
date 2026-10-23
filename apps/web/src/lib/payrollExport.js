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

function requireValue(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Payroll payment file requires configured ${label}`)
  }
  return value.trim()
}

function requirePaidRun(run, currency) {
  if (run?.status !== 'PAID') throw new Error('Payroll payment files can only be generated for a paid run')
  if (run.currency !== currency) throw new Error(`Payroll payment file requires a ${currency} payroll run`)
  return requireValue(run.payDate, 'pay date')
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
 * Generates a NACHA file from an explicitly configured company/bank profile and complete employee bank details.
 * This legacy client-side helper is not wired into Payroll; production generation belongs on the server.
 */
export function generateNachaForRun(run, lines, companyOptions = {}) {
  const effectiveDate = requirePaidRun(run, 'USD')

  const company = {
    name: requireValue(companyOptions.name, 'ACH originator name'),
    identification: requireValue(companyOptions.identification, 'ACH originator identification'),
    originatingRoutingNumber: requireValue(companyOptions.originatingRoutingNumber, 'ODFI routing number'),
    originatingBankName: requireValue(companyOptions.originatingBankName, 'ODFI name'),
    destinationBankName: requireValue(companyOptions.destinationBankName, 'ACH operator/destination name'),
  }

  if (!Array.isArray(lines) || lines.length === 0) throw new Error('ACH file requires at least one payroll line')
  const missing = lines.filter(line => !line.employee?.bankRoutingNumber || !line.employee?.bankAccountNumber || !line.employee?.bankAccountType)
  if (missing.length > 0) {
    throw new Error(`Direct deposit ACH file cannot be generated: employees are missing bank routing number, account number, or account type: ${missing.map(line => line.employee?.name || line.employeeId || 'unknown employee').join(', ')}`)
  }

  const entries = lines.map(line => {
    const netAmount = Money.fromDecimal(requireValue(line.net, `net pay for ${line.employee?.name || line.employeeId}`), 'USD')
    const emp = line.employee || {}
    const empName = requireValue(emp.name, 'employee name')
    const employeeId = requireValue(line.employeeId, `employee ID for ${empName}`)
    const routingNumber = requireValue(emp.bankRoutingNumber, `ACH routing number for ${empName}`)
    const accountNumber = requireValue(emp.bankAccountNumber, `ACH account number for ${empName}`)
    const accountType = requireValue(emp.bankAccountType, `ACH account type for ${empName}`).toUpperCase()
    if (accountType !== 'CHECKING' && accountType !== 'SAVINGS') {
      throw new Error(`Unsupported ACH account type for ${empName}: ${accountType}`)
    }

    return {
      employeeId,
      employeeName: empName,
      routingNumber,
      accountNumber,
      amountCents: netAmount.minorUnits,
      accountType,
    }
  })

  return generateNachaFile({
    company,
    effectiveDate,
    entries,
  })
}

/**
 * Generates a legacy SEPA file only from an explicitly configured debtor profile and complete IBAN data.
 * This legacy client-side helper is not wired into Payroll; production generation belongs on the server.
 */
export function generateSepaForRun(run, lines, initiatorOptions = {}) {
  const executionDate = requirePaidRun(run, 'EUR')

  const initiator = {
    name: requireValue(initiatorOptions.name, 'SEPA debtor name'),
    iban: requireValue(initiatorOptions.iban, 'SEPA debtor IBAN'),
    bic: requireValue(initiatorOptions.bic, 'SEPA debtor BIC'),
  }

  if (!Array.isArray(lines) || lines.length === 0) throw new Error('SEPA file requires at least one payroll line')
  const missing = lines.filter(line => !line.employee?.bankIban)
  if (missing.length > 0) {
    throw new Error(`SEPA credit transfer XML cannot be generated: employees are missing IBAN: ${missing.map(line => line.employee?.name || line.employeeId || 'unknown employee').join(', ')}`)
  }

  const entries = lines.map(line => {
    const netAmount = Money.fromDecimal(requireValue(line.net, `net pay for ${line.employee?.name || line.employeeId}`), 'EUR')
    const emp = line.employee || {}
    const empName = requireValue(emp.name, 'employee name')
    const iban = requireValue(emp.bankIban, `SEPA creditor IBAN for ${empName}`).replace(/\s+/g, '').toUpperCase()
    const bic = (emp.bankBic || '').replace(/\s+/g, '').toUpperCase()

    return {
      endToEndId: `SALARY-${requireValue(line.id || line.employeeId, `payroll line ID for ${empName}`).slice(0, 25)}`,
      employeeName: empName,
      iban,
      bic: bic || undefined,
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
