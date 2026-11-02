import type { CircleCandidate } from './vision'
import type { StackPosition } from './assisted-scan'

export type ImagePoint = { x: number; y: number }
export type ImageQuad = readonly [ImagePoint, ImagePoint, ImagePoint, ImagePoint]

const WIDTH = 320
const HEIGHT = 240

export function validImageQuad(points: readonly ImagePoint[]): points is ImageQuad {
  if (points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      p.x < 8 || p.x > WIDTH - 8 || p.y < 8 || p.y > HEIGHT - 8)) return false
  const cross = points.map((p, i) => {
    const q = points[(i + 1) % 4]
    const r = points[(i + 2) % 4]
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)
  })
  const signedArea = points.reduce((sum, p, i) => {
    const next = points[(i + 1) % 4]
    return sum + p.x * next.y - next.x * p.y
  }, 0) / 2
  return cross.every(c => c > 0) && signedArea > 3600
}

/** Projective transform from the known 7x7 shelf plane to four corner touches. */
export function projectImagePoint(quad: ImageQuad, u: number, v: number): ImagePoint | null {
  // Solve 8 unknowns for h33 = 1; reject singular and ill-conditioned layouts.
  const rows: number[][] = []
  for (let i = 0; i < 4; i++) {
    const [a, b] = [[0, 0], [1, 0], [1, 1], [0, 1]][i]
    const { x, y } = quad[i]
    rows.push([a, b, 1, 0, 0, 0, -a * x, -b * x, x])
    rows.push([0, 0, 0, a, b, 1, -a * y, -b * y, y])
  }
  for (let k = 0; k < 8; k++) {
    let pivot = k
    for (let i = k + 1; i < 8; i++) if (Math.abs(rows[i][k]) > Math.abs(rows[pivot][k])) pivot = i
    if (Math.abs(rows[pivot][k]) < 1e-9) return null
    ;[rows[pivot], rows[k]] = [rows[k], rows[pivot]]
    const div = rows[k][k]
    for (let j = k; j < 9; j++) rows[k][j] /= div
    for (let i = 0; i < 8; i++) {
      if (i === k) continue
      const mul = rows[i][k]
      for (let j = k; j < 9; j++) rows[i][j] -= mul * rows[k][j]
    }
  }
  const h = rows.map(r => r[8])
  const denominator = h[6] * u + h[7] * v + 1
  if (Math.abs(denominator) < 1e-9) return null
  const x = (h[0] * u + h[1] * v + h[2]) / denominator
  const y = (h[3] * u + h[4] * v + h[5]) / denominator
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

export function stackImagePoint(quad: ImageQuad, position: StackPosition): ImagePoint | null {
  return projectImagePoint(quad, (position.column - 0.5) / 7, (position.row - 0.5) / 7)
}

function distance(a: ImagePoint, b: ImagePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Assign only clearly centered circle candidates. Visible ≠ physically counted. */
export function observedPositions(
  quad: ImageQuad, positions: readonly StackPosition[], circles: readonly CircleCandidate[],
): string[] {
  const centers = positions.map(pos => ({ pos, center: stackImagePoint(quad, pos) }))
    .filter((entry): entry is { pos: StackPosition; center: ImagePoint } => entry.center !== null)
  const result = new Set<string>()
  for (const circle of circles) {
    if (circle.confidence < 0.68) continue
    const ranked = centers.map(entry => ({ id: entry.pos.id, center: entry.center,
      dist: distance(entry.center, circle) })).sort((a, b) => a.dist - b.dist)
    if (ranked.length < 2) continue
    const first = ranked[0]
    const second = ranked[1]
    const nearestSpacing = Math.min(...centers.filter(p => p.pos.id !== first.id)
      .map(p => distance(p.center, first.center)))
    if (first.dist < nearestSpacing * 0.32 && second.dist > first.dist * 1.4) result.add(first.id)
  }
  return [...result]
}

export function nearestStackAt(
  quad: ImageQuad, positions: readonly StackPosition[], tap: ImagePoint,
): string | null {
  const candidates = positions.flatMap(pos => {
    const projected = stackImagePoint(quad, pos)
    return projected ? [{ id: pos.id, dist: distance(projected, tap) }] : []
  }).sort((a, b) => a.dist - b.dist)
  if (candidates.length < 2) return null
  const threshold = Math.min(19, candidates[1].dist * 0.8)
  return candidates[0].dist <= threshold ? candidates[0].id : null
}

export function grayFrame(image: ImageData | { data: Uint8ClampedArray; width: number; height: number }): Uint8Array {
  const gray = new Uint8Array(image.width * image.height)
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4
    gray[i] = (image.data[j] * 77 + image.data[j + 1] * 150 + image.data[j + 2] * 29) >>> 8
  }
  return gray
}

/** Sparse block tracking; only a consistent small translation is supported.
 * Rejects textureless or contradictory matches rather than moving the map blindly.
 */
export function trackImageQuad(
  previous: Uint8Array, current: Uint8Array, quad: ImageQuad,
  width = WIDTH, height = HEIGHT,
): ImageQuad | null {
  if (previous.length !== width * height || current.length !== width * height) return null
  const sampleUV = [0.17, 0.5, 0.83]
  const displacements: ImagePoint[] = []
  const patch = 4
  const search = 12
  for (const v of sampleUV) for (const u of sampleUV) {
    const point = projectImagePoint(quad, u, v)
    if (!point) continue
    const cx = Math.round(point.x), cy = Math.round(point.y)
    if (cx < patch + search || cy < patch + search ||
        cx >= width - patch - search || cy >= height - patch - search) continue
    let oldSum = 0, oldSquared = 0
    for (let dy = -patch; dy <= patch; dy++) for (let dx = -patch; dx <= patch; dx++) {
      const val = previous[(cy + dy) * width + cx + dx]
      oldSum += val
      oldSquared += val * val
    }
    const count = (2 * patch + 1) ** 2
    const variance = oldSquared / count - (oldSum / count) ** 2
    if (variance < 190) continue // not enough visual features to track
    let best = Number.POSITIVE_INFINITY, distant = Number.POSITIVE_INFINITY
    let bestX = 0, bestY = 0
    const matches: { dx: number; dy: number; err: number }[] = []
    for (let sy = -search; sy <= search; sy++) {
      for (let sx = -search; sx <= search; sx++) {
        let diffSum = 0, diffSquared = 0
        for (let dy = -patch; dy <= patch; dy++) for (let dx = -patch; dx <= patch; dx++) {
          const index = (cy + dy) * width + cx + dx
          const delta = previous[index] - current[(cy + sy + dy) * width + cx + sx + dx]
          diffSum += delta
          diffSquared += delta * delta
        }
        const err = diffSquared / count - (diffSum / count) ** 2
        matches.push({ dx: sx, dy: sy, err })
        if (err < best) { best = err; bestX = sx; bestY = sy }
      }
    }
    for (const candidate of matches) {
      if (Math.hypot(candidate.dx - bestX, candidate.dy - bestY) > 3) {
        distant = Math.min(distant, candidate.err)
      }
    }
    if (best < 180 && distant > best * 1.35 + 18) {
      displacements.push({ x: bestX, y: bestY })
    }
  }
  if (displacements.length < 4) return null
  const sortedX = displacements.map(p => p.x).sort((a, b) => a - b)
  const sortedY = displacements.map(p => p.y).sort((a, b) => a - b)
  const delta = { x: sortedX[Math.floor(sortedX.length / 2)], y: sortedY[Math.floor(sortedY.length / 2)] }
  const inliers = displacements.filter(p => distance(p, delta) <= 2.5)
  if (inliers.length < 4 || inliers.length / displacements.length < 0.7) return null
  const moved = quad.map(p => ({ x: p.x + delta.x, y: p.y + delta.y }))
  return validImageQuad(moved) ? moved : null
}
