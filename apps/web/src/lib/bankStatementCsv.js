const requiredHeaders = ['date', 'description', 'currency', 'amount']

function parseCsvMatrix(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let quoteClosed = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (char === '"') { quoted = false; quoteClosed = true }
      else cell += char
    } else if (quoteClosed && char !== ',' && char !== '\n' && char !== '\r') throw new Error('Unexpected characters after a quoted CSV value.')
    else if (char === '"' && cell.length === 0) quoted = true
    else if (char === '"') throw new Error('The CSV has an unexpected quote in an unquoted value.')
    else if (char === ',') { row.push(cell); cell = ''; quoteClosed = false }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      if (row.some(value => value.trim() !== '')) rows.push(row)
      row = []; quoteClosed = false
    } else cell += char
  }
  if (quoted) throw new Error('The CSV has an unclosed quoted value.')
  if (cell.length || row.length) { row.push(cell); if (row.some(value => value.trim() !== '')) rows.push(row) }
  return rows
}

function canonicalDate(value) {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00.000Z`)
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) throw new Error(`Invalid date "${value}".`)
    return trimmed
  }
  const match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(trimmed)
  if (!match) throw new Error(`Unsupported date "${value}". Use YYYY-MM-DD or MM/DD/YYYY.`)
  const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])))
  if (date.getUTCFullYear() !== Number(match[3]) || date.getUTCMonth() !== Number(match[1]) - 1 || date.getUTCDate() !== Number(match[2])) throw new Error(`Invalid date "${value}".`)
  return date.toISOString().slice(0, 10)
}

function canonicalAmount(value) {
  const trimmed = value.trim().replace(/\s/g, '')
  const amount = /^-?\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?$/.test(trimmed) ? trimmed.replace(/,/g, '') : trimmed
  if (!/^-?\d+(?:\.\d{1,4})?$/.test(amount) || !/[1-9]/.test(amount)) throw new Error(`Invalid signed amount "${value}".`)
  return amount
}

/** Parse the portable import format: Date, Description, Reference (optional), Currency, Amount. */
export function parseBankStatementCsv(text) {
  const matrix = parseCsvMatrix(String(text).replace(/^\uFEFF/, ''))
  if (matrix.length < 2) throw new Error('The CSV must include a header and at least one transaction.')
  const headers = matrix[0].map(value => value.trim().toLowerCase().replace(/\s+/g, ' '))
  const positions = Object.fromEntries(headers.map((value, index) => [value, index]))
  const missing = requiredHeaders.filter(header => !(header in positions))
  if (missing.length) throw new Error(`Missing required CSV columns: ${missing.join(', ')}.`)
  if (matrix.length - 1 > 500) throw new Error('A statement import is limited to 500 rows.')
  return matrix.slice(1).map((cells, index) => {
    const get = key => (cells[positions[key]] ?? '').trim()
    const description = get('description')
    const currency = get('currency').toUpperCase()
    if (!description) throw new Error(`Row ${index + 2} has no description.`)
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Row ${index + 2} needs a three-letter currency code.`)
    return {
      postedAt: canonicalDate(get('date')),
      description,
      reference: 'reference' in positions ? (get('reference') || null) : null,
      currency,
      amount: canonicalAmount(get('amount')),
    }
  })
}
