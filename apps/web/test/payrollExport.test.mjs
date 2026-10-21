import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateNachaForRun,
  generateSepaForRun,
  payrollNachaFilename,
  payrollPaymentSummaryFilename,
  payrollPaymentSummaryRows,
  payrollSepaFilename,
} from '../src/lib/payrollExport.js'

test('payroll payment summary exports only recorded payroll values, never fabricated bank details', () => {
  const rows = payrollPaymentSummaryRows({ payDate: '2026-10-31', currency: 'EGP' }, [{
    employeeId: 'emp_123456',
    employee: { name: 'Example Employee' },
    net: '1234.50',
  }])

  assert.deepEqual(rows, [
    ['Employee Name', 'Employee ID', 'Pay Date', 'Currency', 'Net Amount'],
    ['Example Employee', 'emp_123456', '2026-10-31', 'EGP', '1234.50'],
  ])
  assert.equal(rows[0].some(column => /routing|account|bank/i.test(column)), false)
})

test('payroll payment summary leaves unknown date and currency blank instead of guessing', () => {
  assert.deepEqual(payrollPaymentSummaryRows({}, [{ employeeId: 'e1', net: '12.00' }]), [
    ['Employee Name', 'Employee ID', 'Pay Date', 'Currency', 'Net Amount'],
    ['', 'e1', '', '', '12.00'],
  ])
})

test('payroll payment summary filename cannot include path or special characters', () => {
  assert.equal(payrollPaymentSummaryFilename('../../October Payroll!'), 'October-Payroll-payment-summary.csv')
  assert.equal(payrollNachaFilename('../../October Payroll!'), 'October-Payroll-direct-deposit.ach')
  assert.equal(payrollSepaFilename('../../October Payroll!'), 'October-Payroll-credit-transfer.xml')
})

test('generateNachaForRun produces a valid 94-char fixed-width ACH file for a paid run', () => {
  const run = { label: 'October Run', payDate: '2026-10-31', currency: 'USD' }
  const lines = [
    { employeeId: 'emp_1', employee: { name: 'John Doe' }, net: '3500.00' },
    { employeeId: 'emp_2', employee: { name: 'Jane Smith' }, net: '4250.75' },
  ]

  const result = generateNachaForRun(run, lines, {
    name: 'Asas Corp',
    identification: '1234567890',
  })

  assert.equal(result.entryCount, 2)
  assert.equal(result.totalAmountCents, 775075n)
  assert.equal(result.recordCount % 10, 0)
  const fileLines = result.fileContent.split('\r\n').filter(Boolean)
  for (const line of fileLines) {
    assert.equal(line.length, 94)
  }
})

test('generateSepaForRun produces valid pain.001.001.03 XML with control sums', () => {
  const run = { label: 'Euro Run', payDate: '2026-10-31', currency: 'EUR' }
  const lines = [
    { id: 'line_1', employeeId: 'emp_1', employee: { name: 'Pierre & Marie' }, net: '2500.50' },
  ]

  const result = generateSepaForRun(run, lines, {
    name: 'Asas France',
    iban: 'FR1420041010050500013M02606',
    bic: 'BNPAFRPPXXX',
  })

  assert.equal(result.transactionCount, 1)
  assert.equal(result.controlSum, '2500.50')
  assert.ok(result.xmlContent.includes('Pierre &amp; Marie'))
  assert.ok(result.xmlContent.includes('pain.001.001.03'))
})

test('generateNachaForRun uses real employee bank credentials when present', () => {
  const run = { label: 'US Payroll', payDate: '2026-10-31', currency: 'USD' }
  const lines = [
    {
      employeeId: 'emp_1',
      employee: {
        name: 'Ada Lovelace',
        bankRoutingNumber: '021000021',
        bankAccountNumber: '987654321',
        bankAccountType: 'CHECKING',
      },
      net: '5000.00',
    },
  ]

  const result = generateNachaForRun(run, lines, { name: 'Acme Inc', requireBankDetails: true })
  assert.equal(result.entryCount, 1)
  assert.equal(result.totalAmountCents, 500000n)
  assert.ok(result.fileContent.includes('02100002'))
  assert.ok(result.fileContent.includes('987654321'))
})

test('generateNachaForRun enforces requireBankDetails and throws descriptive error if missing', () => {
  const run = { label: 'US Payroll', payDate: '2026-10-31', currency: 'USD' }
  const lines = [
    { employeeId: 'emp_1', employee: { name: 'Ada Lovelace' }, net: '5000.00' },
  ]

  assert.throws(
    () => generateNachaForRun(run, lines, { requireBankDetails: true }),
    /missing bank routing or account numbers: Ada Lovelace/,
  )
})

test('generateSepaForRun uses real employee IBAN when present', () => {
  const run = { label: 'Euro Payroll', payDate: '2026-10-31', currency: 'EUR' }
  const lines = [
    {
      id: 'line_1',
      employeeId: 'emp_1',
      employee: {
        name: 'Marie Curie',
        bankIban: 'DE89370400440532013000',
        bankBic: 'DEUTDEFF',
      },
      net: '4000.00',
    },
  ]

  const result = generateSepaForRun(run, lines, { name: 'Acme EU', requireBankDetails: true })
  assert.equal(result.transactionCount, 1)
  assert.ok(result.xmlContent.includes('DE89370400440532013000'))
  assert.ok(result.xmlContent.includes('DEUTDEFF'))
})

test('generateSepaForRun enforces requireBankDetails and throws descriptive error if missing', () => {
  const run = { label: 'Euro Payroll', payDate: '2026-10-31', currency: 'EUR' }
  const lines = [
    { id: 'line_1', employeeId: 'emp_1', employee: { name: 'Marie Curie' }, net: '4000.00' },
  ]

  assert.throws(
    () => generateSepaForRun(run, lines, { requireBankDetails: true }),
    /missing IBAN: Marie Curie/,
  )
})
