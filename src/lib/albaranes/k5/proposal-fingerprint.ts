import { createHash } from 'node:crypto'

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
