import assert from 'node:assert/strict'
import { test } from 'node:test'
import { csvCell, csvRows, downloadCsv, inferCsvColumnMapping, parseCsvImport } from '../src/lib/csv.js'

test('parses bounded CSV rows, escaped quotes, and employee migration limits', () => {
  const parsed = parseCsvImport('\uFEFFSource ID,Company Name,Tier\r\n"legacy-1","North, Inc.",Gold\r\nlegacy-2,"A ""quoted"" name",Silver', { recordLabel: 'companies' })
  assert.deepEqual(parsed.headers, ['Source ID', 'Company Name', 'Tier'])
  assert.deepEqual(parsed.rows, [['legacy-1', 'North, Inc.', 'Gold'], ['legacy-2', 'A "quoted" name', 'Silver']])
  assert.throws(() => parseCsvImport('Name\nA\nB', { maxRows: 1, recordLabel: 'employees', limitPrefix: 'This onboarding import' }), /This onboarding import supports up to 1 employees/)
  assert.throws(() => parseCsvImport('Name\n"unfinished'), /unfinished quoted value/)
})

test('infers mappings from normalized source headers without reusing positional assumptions', () => {
  const fields = [
    { key: 'sourceId', aliases: ['source id', 'legacy id'] },
    { key: 'name', aliases: ['company name', 'account name'] },
  ]
  assert.deepEqual(inferCsvColumnMapping(['Legacy_ID', 'Account Name', 'Unused'], fields), { sourceId: '0', name: '1' })
})

test('quotes commas and quotes while preserving ordinary numeric values', () => {
  assert.equal(csvCell('Sales, East'), '"Sales, East"')
  assert.equal(csvCell('A "quoted" name'), '"A ""quoted"" name"')
  assert.equal(csvCell(1250), '"1250"')
  assert.equal(csvCell(-1250), '"-1250"')
})

test('neutralizes formula prefixes and control characters in CRM report cells', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1', '\tformula', '\rformula', '\nformula']) {
    assert.equal(csvCell(value), `"'${value}"`)
  }
  assert.equal(csvRows([['Rep', '=HYPERLINK("x")']]), '"Rep","\'=HYPERLINK(""x"")"\r\n')
})

test('downloads the safe CSV and delays blob cleanup until the browser can read it', () => {
  const originals = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timeout: globalThis.setTimeout }
  let clicked = false
  let removed = false
  let cleanup
  let blob
  let revoked = null
  const link = { click() { clicked = true }, remove() { removed = true } }
  try {
    globalThis.document = { createElement: () => link, body: { appendChild() {} } }
    URL.createObjectURL = value => { blob = value; return 'blob:payroll-csv' }
    URL.revokeObjectURL = value => { revoked = value }
    globalThis.setTimeout = (callback, delay) => { cleanup = callback; assert.equal(delay, 1000) }
    downloadCsv([['Employee'], ['=1+1']], 'payroll.csv')
    assert.equal(link.href, 'blob:payroll-csv')
    assert.equal(link.download, 'payroll.csv')
    assert.equal(blob.type, 'text/csv;charset=utf-8')
    assert.ok(clicked && removed)
    assert.equal(revoked, null)
    cleanup()
    assert.equal(revoked, 'blob:payroll-csv')
  } finally {
    globalThis.document = originals.document
    URL.createObjectURL = originals.create
    URL.revokeObjectURL = originals.revoke
    globalThis.setTimeout = originals.timeout
  }
})
