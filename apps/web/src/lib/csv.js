/** Quote CSV values and neutralize spreadsheet formulas after whitespace/control bytes. */
export function csvCell(value) {
  const text = String(value ?? '')
  const isFiniteNumber = typeof value === 'number' && Number.isFinite(value)
  const safe = !isFiniteNumber && (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function csvRows(rows, { bom = false } = {}) {
  const content = rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  return `${bom ? '\uFEFF' : ''}${content}`
}

export function downloadCsv(rows, filename, options) {
  const url = URL.createObjectURL(new Blob([csvRows(rows, options)], { type: 'text/csv;charset=utf-8' }))
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

/** Parse a bounded, header-based CSV import without coercing source values. */
export function parseCsvImport(text, { maxRows = 500, recordLabel = 'records', limitPrefix = 'This import' } = {}) {
  const records = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); records.push(row); row = []; cell = '' }
    else cell += char
  }
  if (quoted) throw new Error('This CSV has an unfinished quoted value. Check the file and try again.')
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); records.push(row) }
  const nonempty = records.filter(record => record.some(value => value.trim() !== ''))
  if (nonempty.length < 2) throw new Error(`The CSV needs a header row and at least one ${recordLabel.replace(/s$/, '')}.`)
  const headers = nonempty[0].map((value, index) => value.replace(/^\uFEFF/, '').trim() || `Column ${index + 1}`)
  const rows = nonempty.slice(1).map(record => headers.map((_, index) => record[index] ?? ''))
  if (rows.length > maxRows) throw new Error(`${limitPrefix} supports up to ${maxRows} ${recordLabel} at a time.`)
  return { headers, rows }
}

export function normalizeCsvHeader(value) {
  return String(value ?? '').trim().toLowerCase().replaceAll(/[_-]+/g, ' ').replaceAll(/\s+/g, ' ')
}

export function inferCsvColumnMapping(headers, fields) {
  return Object.fromEntries(fields.map(field => {
    const index = headers.findIndex(header => field.aliases.includes(normalizeCsvHeader(header)))
    return [field.key, index < 0 ? '' : String(index)]
  }))
}
