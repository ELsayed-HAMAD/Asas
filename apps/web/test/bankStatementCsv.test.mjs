import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBankStatementCsv } from '../src/lib/bankStatementCsv.js'

test('parses quoted fields, optional reference and locale dates into normalized rows', () => {
  const rows = parseBankStatementCsv('\uFEFFDate,Description,Reference,Currency,Amount\r\n10/12/2026,"Transfer, payroll","ref ""42""",egp,"1,234.50"')
  assert.deepEqual(rows, [{
    postedAt: '2026-10-12',
    description: 'Transfer, payroll',
    reference: 'ref "42"',
    currency: 'EGP',
    amount: '1234.50',
  }])
})

test('preserves signed withdrawals and accepts ungrouped decimal values', () => {
  const rows = parseBankStatementCsv('Date,Description,Currency,Amount\n2026-10-12,Payment,USD,-45.75')
  assert.equal(rows[0].amount, '-45.75')
  assert.equal(rows[0].reference, null)
})

test('rejects invalid calendar dates, malformed grouping, zero amounts and invalid quotes', () => {
  for (const csv of [
    'Date,Description,Currency,Amount\n2026-02-31,Payment,USD,10',
    'Date,Description,Currency,Amount\n2026-10-12,Payment,USD,"1,2"',
    'Date,Description,Currency,Amount\n2026-10-12,Payment,USD,0.0000',
    'Date,Description,Currency,Amount\n2026-10-12,Pay"ment,USD,10',
    'Date,Description,Currency,Amount\n2026-10-12,"Payment"oops,USD,10',
    'Date,Description,Currency,Amount\n2026-10-12,"Payment,USD,10',
  ]) assert.throws(() => parseBankStatementCsv(csv))
})

test('rejects missing columns, empty transactions, and imports above the row limit', () => {
  assert.throws(() => parseBankStatementCsv('Date,Description\n2026-10-12,Payment'), /Missing required/)
  assert.throws(() => parseBankStatementCsv('Date,Description,Currency,Amount\n'), /header and at least one/)
  const rows = Array.from({ length: 501 }, (_, index) => `2026-10-12,Payment ${index},USD,1`).join('\n')
  assert.throws(() => parseBankStatementCsv(`Date,Description,Currency,Amount\n${rows}`), /limited to 500/)
})
