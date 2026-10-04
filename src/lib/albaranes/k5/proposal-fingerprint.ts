import { createHash } from 'node:crypto'

// Las revisiones K5 históricas conservan su versión en los registros; las
// nuevas propuestas del flujo general se generan en pipeline/propose.ts.
export const K5_NORMALIZER_VERSION = 'k5-normalizer-v12' as const

export function proposalInputFingerprint(input: unknown): string {
  function sort(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sort)
    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>
      return Object.fromEntries(Object.keys(source).sort().map((key) => [key, sort(source[key])]))
    }
    return value
  }
  return createHash('sha256').update(JSON.stringify(sort(input)), 'utf8').digest('hex')
}
