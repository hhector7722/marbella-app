function parseOcrDate(raw) {
  if (typeof raw !== 'string') return null
  const str = raw.trim()
  if (!str) return null

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const esMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (esMatch) {
    const day = esMatch[1].padStart(2, '0')
    const month = esMatch[2].padStart(2, '0')
    const year = esMatch[3]
    return `${year}-${month}-${day}`
  }

  // If unknown, return raw string to let Postgres fail or parse it
  return str
}

const tests = [
  ["24/07/2026", "2026-07-24"],
  ["01/08/2026", "2026-08-01"],
  ["31/12/2025", "2025-12-31"],
  ["2026-07-24", "2026-07-24"],
  ["invalid", "invalid"],
  [null, null],
  ["", null]
]

for (const [input, expected] of tests) {
  const actual = parseOcrDate(input)
  if (actual !== expected) {
    console.error(`FAIL: ${input} -> expected ${expected}, got ${actual}`)
  } else {
    console.log(`PASS: ${input} -> ${actual}`)
  }
}
