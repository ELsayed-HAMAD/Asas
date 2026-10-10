import { describe, expect, it } from 'vitest'
import { renderCandidateCsv } from '../src/modules/hr/candidateExport.js'

describe('candidate CSV export', () => {
  it('quotes columns and neutralizes spreadsheet formulas in exported personal data', () => {
    const csv = renderCandidateCsv([{
      name: '=HYPERLINK("https://bad.test")', email: '  @SUM(A1:A2)', role: 'Engineer, "Platform"',
      stage: 'APPLIED', appliedAt: new Date('2026-10-01T09:00:00.000Z'), location: null, source: '+import',
    }])
    expect(csv.startsWith('\uFEFF"Name","Email","Role"')).toBe(true)
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://bad.test\"\")\"")
    expect(csv).toContain("\"'  @SUM(A1:A2)\"")
    expect(csv).toContain('"Engineer, ""Platform"""')
    expect(csv).toContain("\"'+import\"")
    expect(csv).toContain('2026-10-01T09:00:00.000Z')
  })
})
