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
