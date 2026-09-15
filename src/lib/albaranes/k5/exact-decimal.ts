/**
 * Aritmética decimal/racional exacta para K5.
 *
 * No usa Number para producir magnitudes económicas. Una división cuyo
 * resultado decimal no termina no se redondea silenciosamente: el llamador
 * debe detener la propuesta o aplicar una regla de redondeo explícita.
 */

export type ExactRatio = Readonly<{
  numerator: bigint
  denominator: bigint
}>

const BI_ZERO = BigInt(0)
const BI_ONE = BigInt(1)
const BI_TWO = BigInt(2)
const BI_FIVE = BigInt(5)
const BI_TEN = BigInt(10)

function absBigInt(value: bigint): bigint {
  return value < BI_ZERO ? -value : value
}

function gcd(a: bigint, b: bigint): bigint {
  let x = absBigInt(a)
  let y = absBigInt(b)
  while (y !== BI_ZERO) {
    const next = x % y
    x = y
    y = next
  }
  return x === BI_ZERO ? BI_ONE : x
}

export function ratio(numerator: bigint, denominator: bigint = BI_ONE): ExactRatio {
  if (denominator === BI_ZERO) throw new Error('División por cero')
  const sign = denominator < BI_ZERO ? -BI_ONE : BI_ONE
  const n = numerator * sign
  const d = absBigInt(denominator)
  const common = gcd(n, d)
  return { numerator: n / common, denominator: d / common }
}

function powBigInt(base: bigint, exponent: number): bigint {
  let result = BI_ONE
  for (let index = 0; index < exponent; index += 1) result *= base
  return result
}

function pow10(scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 60) {
    throw new Error('Escala decimal inválida')
  }
  return powBigInt(BI_TEN, scale)
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

  // Capturamos ambos separadores dentro del mismo token. El patrón anterior
  // cortaba `1,234.56` en `1,234`, perdiendo la parte decimal antes de poder
  // decidir cuál de los dos separadores era el decimal.
  const token = raw.match(/[-+]?\d[\d\s.,'’]*/)?.[0]
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
  const n = BigInt(digits) * (negative ? -BI_ONE : BI_ONE)
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
  if (b.numerator === BI_ZERO) return null
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
  return value != null && value.numerator > BI_ZERO
}

/** Devuelve null si el racional no tiene representación decimal finita. */
export function toFiniteDecimalString(value: ExactRatio): string | null {
  let denominator = value.denominator
  let twos = 0
  let fives = 0
  while (denominator % BI_TWO === BI_ZERO) {
    denominator /= BI_TWO
    twos += 1
  }
  while (denominator % BI_FIVE === BI_ZERO) {
    denominator /= BI_FIVE
    fives += 1
  }
  if (denominator !== BI_ONE) return null

  const scale = Math.max(twos, fives)
  const multiplier = powBigInt(BI_TWO, scale - twos) * powBigInt(BI_FIVE, scale - fives)
  const scaled = value.numerator * multiplier
  const negative = scaled < BI_ZERO
  const digits = absBigInt(scaled).toString().padStart(scale + 1, '0')
  if (scale === 0) return `${negative ? '-' : ''}${digits}`

  const whole = digits.slice(0, -scale) || '0'
  const fraction = digits.slice(-scale).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/**
 * Redondeo decimal explícito, mitades alejándose de cero, igual que
 * `round(numeric, scale)` de PostgreSQL. Se usa solo en fronteras cuyo esquema
 * declara una escala concreta; nunca como fallback implícito del parser.
 */
export function roundExactToScale(value: ExactRatio, scale: number): string {
  const factor = pow10(scale)
  const negative = value.numerator < BI_ZERO
  const scaledNumerator = absBigInt(value.numerator) * factor
  let whole = scaledNumerator / value.denominator
  const remainder = scaledNumerator % value.denominator
  if (remainder * BI_TWO >= value.denominator) whole += BI_ONE
  const rounded = ratio(whole * (negative ? -BI_ONE : BI_ONE), factor)
  const result = toFiniteDecimalString(rounded)
  if (result == null) throw new Error('El redondeo explícito debe producir un decimal finito')
  return result
}

export function exactDecimalString(value: string | bigint | null | undefined): string | null {
  const parsed = parseExactDecimal(value)
  return parsed ? toFiniteDecimalString(parsed) : null
}

export function percentageMultiplier(discountPercent: ExactRatio): ExactRatio | null {
  const hundred = ratio(BigInt(100))
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
