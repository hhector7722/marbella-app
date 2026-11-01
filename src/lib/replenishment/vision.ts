/**
 * Detector local de candidatos circulares para fondos de latas.
 *
 * No identifica marcas ni estima unidades ocultas. Proporciona un recuento
 * orientativo del área delimitada; cada zona/nivel exige confirmación humana.
 * Hough por gradientes, con comprobación de borde radial y supresión de solapamiento.
 * Sin envío de vídeo o fotogramas al servidor.
 */
export type CircleCandidate = {
  x: number
  y: number
  radius: number
  confidence: number
}

type Edge = { x: number; y: number; nx: number; ny: number }
type Peak = { x: number; y: number; radius: number; votes: number; confidence: number }

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function detectCanEnds(
  image: ImageData | { data: Uint8ClampedArray; width: number; height: number },
): CircleCandidate[] {
  const { data, width: w, height: h } = image
  if (w < 60 || h < 60 || data.length !== w * h * 4) return []

  const gray = new Uint8Array(w * h)
  for (let i = 0; i < gray.length; i++) {
    const at = i * 4
    gray[i] = (data[at] * 77 + data[at + 1] * 150 + data[at + 2] * 29) >>> 8
  }
  const gx = new Int16Array(w * h)
  const gy = new Int16Array(w * h)
  const mag = new Uint16Array(w * h)
  const edges: Edge[] = []

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const a = gray[i - w - 1]
      const b = gray[i - w]
      const c = gray[i - w + 1]
      const d = gray[i - 1]
      const e = gray[i + 1]
      const f = gray[i + w - 1]
      const g = gray[i + w]
      const k = gray[i + w + 1]
      const dx = -a + c - 2 * d + 2 * e - f + k
      const dy = -a - 2 * b - c + f + 2 * g + k
      gx[i] = dx
      gy[i] = dy
      const magnitude = Math.round(Math.hypot(dx, dy))
      mag[i] = Math.min(65535, magnitude)
      if ((x & 1) === 0 && (y & 1) === 0 && magnitude >= 145) {
        edges.push({ x, y, nx: dx / magnitude, ny: dy / magnitude })
      }
    }
  }

  // Tamaños relativos al encuadre; se requiere aproximarse al producto.
  const rMin = clamp(Math.round(Math.min(w, h) / 32), 6, 14)
  const rMax = clamp(Math.round(Math.min(w, h) / 7), 19, 38)
  const radii: number[] = []
  for (let r = rMin; r <= rMax; r += 2) radii.push(r)
  // Votación a media resolución: consolida gradientes dispersos por reflejos.
  const step = 2
  const gridW = Math.ceil(w / step)
  const gridH = Math.ceil(h / step)
  const plane = gridW * gridH
  const votes = new Uint16Array(plane * radii.length)

  for (const edge of edges) {
    for (let ri = 0; ri < radii.length; ri++) {
      const r = radii[ri]
      for (const sign of [-1, 1]) {
        const cx = Math.round((edge.x + sign * edge.nx * r) / step)
        const cy = Math.round((edge.y + sign * edge.ny * r) / step)
        const margin = Math.ceil(r / step)
        if (cx < margin || cy < margin ||
            cx >= gridW - margin || cy >= gridH - margin) continue
        votes[ri * plane + cy * gridW + cx]++
      }
    }
  }

  const peaks: Peak[] = []
  for (let ri = 0; ri < radii.length; ri++) {
    const r = radii[ri]
    const threshold = 6
    const offset = ri * plane
    const margin = Math.ceil(r / step)
    for (let y = margin + 1; y < gridH - margin - 1; y++) {
      for (let x = margin + 1; x < gridW - margin - 1; x++) {
        const p = y * gridW + x
        const v = votes[offset + p]
        if (v < threshold) continue
        if (v < votes[offset + p - 1] || v < votes[offset + p + 1] ||
          v < votes[offset + p - gridW] || v < votes[offset + p + gridW]) continue
        peaks.push({ x: x * step, y: y * step, radius: r, votes: v, confidence: 0 })
      }
    }
  }
  peaks.sort((a, b) => b.votes - a.votes)

  const candidates: CircleCandidate[] = []
  const samples = 32
  // Comprobar la forma circular real antes de considerar un máximo Hough.
  for (const peak of peaks.slice(0, 200)) {
    const { x, y, radius: r } = peak
    if (candidates.some(c => Math.hypot(c.x - x, c.y - y) < Math.min(c.radius, r) * 0.95)) continue
    let ringEvidence = 0
    for (let s = 0; s < samples; s++) {
      const angle = s * 2 * Math.PI / samples
      const ux = Math.cos(angle)
      const uy = Math.sin(angle)
      let found = false
      for (const shift of [-2, 0, 2]) {
        const px = Math.round(x + ux * (r + shift))
        const py = Math.round(y + uy * (r + shift))
        if (px <= 0 || py <= 0 || px >= w - 1 || py >= h - 1) continue
        const i = py * w + px
        if (mag[i] < 115) continue
        const alignment = Math.abs((gx[i] * ux + gy[i] * uy) / Math.max(1, mag[i]))
        if (alignment > 0.57) { found = true; break }
      }
      if (found) ringEvidence++
    }
    const confidence = ringEvidence / samples
    if (confidence < 0.48) continue

    // Zona central de trabajo para excluir laterales, guías y otra mercancía.
    if (x - r < w * 0.09 || x + r > w * 0.91 ||
        y - r < h * 0.12 || y + r > h * 0.88) continue
    candidates.push({ x, y, radius: r, confidence })
    if (candidates.length >= 150) break
  }
  // En una zona de un único producto, los fondos tienen tamaño parecido.
  // Descartar diámetros aislados ayuda a excluir asas y círculos del mobiliario.
  const radiiFound = candidates.map(c => c.radius).sort((a, b) => a - b)
  const median = radiiFound[Math.floor(radiiFound.length / 2)]
  const sameSize = candidates.length >= 7 && median !== undefined
    ? candidates.filter(c => c.radius >= median * 0.7 && c.radius <= median * 1.45)
    : candidates
  return sameSize.sort((a, b) => a.y - b.y || a.x - b.x)
}

export function missingUnits(capacity: number, observed: number | null): number | null {
  if (observed === null || !Number.isInteger(observed) ||
      observed < 0 || observed > capacity) return null
  return capacity - observed
}

export function isStableCount(history: number[], capacity: number): number | null {
  if (history.length < 3) return null
  const recent = history.slice(-4)
  const count = recent[recent.length - 1]
  if (count > capacity || count < 0) return null
  return recent.filter(value => value === count).length >= 3 ? count : null
}
