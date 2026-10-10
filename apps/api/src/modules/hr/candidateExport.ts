type CandidateExportRow = {
  name: string
  email: string | null
  role: string
  stage: string
  appliedAt: Date
  location: string | null
  source: string | null
}

function csvCell(value: string): string {
  // Prefix formula-leading values (including after whitespace/control characters) so a CSV
  // opened in a spreadsheet cannot execute them. Quote/escape every cell per RFC 4180.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function renderCandidateCsv(rows: CandidateExportRow[]): string {
  const lines = [
    ['Name', 'Email', 'Role', 'Stage', 'Applied At', 'Location', 'Source'].map(csvCell).join(','),
    ...rows.map(row => [row.name, row.email ?? '', row.role, row.stage, row.appliedAt.toISOString(), row.location ?? '', row.source ?? ''].map(csvCell).join(',')),
  ]
  return `\uFEFF${lines.join('\r\n')}`
}
