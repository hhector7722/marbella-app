/**
 * Aritmética decimal/racional exacta para K5.
 *
 * No usa Number para producir magnitudes económicas. Una división cuyo
 * resultado decimal no termina no se redondea silenciosamente: el llamador
 * debe detener la propuesta en needs_review o aportar una regla explícita.
 */

export type ExactRatio = Readonly<{
  numerator: bigint
  denominator: bigint
}>

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value
}

function gcd(a: bigint, b: bigint): bigint {
  let x = absBigInt(a)
  let y = absBigInt(b)
  while (y !== 0n) {
    const next = x % y
    x = y
    y = next
  }
  return x === 0n ? 1n : x
}

export function ratio(numerator: bigint, denominator: bigint = 1n): ExactRatio {
  if (denominator === 0n) throw new Error('División por cero')
  const sign = denominator < 0n ? -1n : 1n
  const n = numerator * sign
  const d = absBigInt(denominator)
  const common = gcd(n, d)
  return { numerator: n / common, denominator: d / common }
}

function pow10(scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 60) {
    throw new Error('Escala decimal inválida')
  }
  return 10n ** BigInt(scale)
}

/**
 * Normaliza un token numérico observado. Para evidencia de proveedor se acepta
 * coma decimal y punto decimal; si aparecen ambos, el último separador es el
 * decimal y el otro se interpreta como agrupación de miles.
 */
export function parseExactDecimal(value: string | bigint | null | undefined): ExactRatio | null {
  if (value == null) return null
  if (typeof value === 'bigint') return ratio(value)

  const raw = String(value).trim()
  if (!raw) return null

  const token = raw.match(/[-+]?\d[\d\s.'’]*(?:[.,]\d+)?/)?.[0]
  if (!token) return null

  let normalized = token.replace(/[\s'’]/g, '')
  const comma = normalized.lastIndexOf(',')
  const dot = normalized.lastIndexOf('.')

  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? ',' : '.'
    const groupingSeparator = decimalSeparator === ',' ? '.' : ','
    normalized = normalized.split(groupingSeparator).join('')
    if (decimalSeparator === ',') normalized = normalized.replace(',', '.')
  } else if (comma >= 0) {
    normalized = normalized.replace(',', '.')
  }

  if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) return null

  const negative = normalized.startsWith('-')
  const unsigned = normalized.replace(/^[-+]/, '')
  const [whole, fraction = ''] = unsigned.split('.')
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0'
  const n = BigInt(digits) * (negative ? -1n : 1n)
  return ratio(n, pow10(fraction.length))
}

export function addExact(a: ExactRatio, b: ExactRatio): ExactRatio {
  return ratio(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator
  )
}

export function subtractExact(a: ExactRatio, b: ExactRatio): ExactRatio {
  return ratio(
    a.numerator * b.denominator - b.numerator * a.denominator,
    a.denominator * b.denominator
  )
}

export function multiplyExact(a: ExactRatio, b: ExactRatio): ExactRatio {
  return ratio(a.numerator * b.numerator, a.denominator * b.denominator)
}

export function divideExact(a: ExactRatio, b: ExactRatio): ExactRatio | null {
  if (b.numerator === 0n) return null
  return ratio(a.numerator * b.denominator, a.denominator * b.numerator)
}

export function compareExact(a: ExactRatio, b: ExactRatio): -1 | 0 | 1 {
  const left = a.numerator * b.denominator
  const right = b.numerator * a.denominator
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function isPositiveExact(value: ExactRatio | null | undefined): value is ExactRatio {
  return value != null && value.numerator > 0n
}

/** Devuelve null si el racional no tiene representación decimal finita. */
export function toFiniteDecimalString(value: ExactRatio): string | null {
  let denominator = value.denominator
  let twos = 0
  let fives = 0
  while (denominator % 2n === 0n) {
    denominator /= 2n
    twos += 1
  }
  while (denominator % 5n === 0n) {
    denominator /= 5n
    fives += 1
  }
  if (denominator !== 1n) return null

  const scale = Math.max(twos, fives)
  const multiplier = (2n ** BigInt(scale - twos)) * (5n ** BigInt(scale - fives))
  const scaled = value.numerator * multiplier
  const negative = scaled < 0n
  const digits = absBigInt(scaled).toString().padStart(scale + 1, '0')
  if (scale === 0) return `${negative ? '-' : ''}${digits}`

  const whole = digits.slice(0, -scale) || '0'
  const fraction = digits.slice(-scale).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

export function exactDecimalString(value: string | bigint | null | undefined): string | null {
  const parsed = parseExactDecimal(value)
  return parsed ? toFiniteDecimalString(parsed) : null
}

export function percentageMultiplier(discountPercent: ExactRatio): ExactRatio | null {
  const hundred = ratio(100n)
  return divideExact(subtractExact(hundred, discountPercent), hundred)
}

export function withinExactTolerance(
  actual: ExactRatio,
  expected: ExactRatio,
  tolerance: ExactRatio
): boolean {
  const delta = subtractExact(actual, expected)
  const absolute = ratio(absBigInt(delta.numerator), delta.denominator)
  return compareExact(absolute, tolerance) <= 0
}
