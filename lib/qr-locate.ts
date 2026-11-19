// Deterministic QR locator: Otsu binarisation + 1:1:3:1:1 finder-pattern scan.
// Pure arithmetic on a grayscale buffer; no decoding, no ML, no randomness.
// Locating does not need a decodable QR, so a "gibberish" code is still found.

export type GrayImage = { data: Uint8Array; width: number; height: number }

export type QrRegion = {
  x: number
  y: number
  /** Side length in pixels of the square that covers the whole QR (modules only). */
  size: number
  /** Estimated pixel size of one unit. */
  moduleSize: number
}

export type LocateFailure = 'not_found' | 'multiple' | 'rotated' | 'inconsistent'

export class QrLocateError extends Error {
  constructor(readonly code: LocateFailure, message: string) {
    super(message)
    this.name = 'QrLocateError'
  }
}

type Candidate = { x: number; y: number; module: number; count: number }

export function otsuThreshold(data: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0)
  for (let i = 0; i < data.length; i++) histogram[data[i]]++
  const total = data.length
  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i]
  let sumBackground = 0
  let weightBackground = 0
  let best = 0
  let bestVariance = -1
  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t]
    if (weightBackground === 0) continue
    const weightForeground = total - weightBackground
    if (weightForeground === 0) break
    sumBackground += t * histogram[t]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sumAll - sumBackground) / weightForeground
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      best = t
    }
  }
  return best
}

/** Returns 1 for dark pixels, 0 for light. Pixels <= threshold are dark. */
export function binarize(image: GrayImage, threshold = otsuThreshold(image.data)): Uint8Array {
  const out = new Uint8Array(image.data.length)
  for (let i = 0; i < image.data.length; i++) out[i] = image.data[i] <= threshold ? 1 : 0
  return out
}

function matchesFinderRatio(runs: number[]): number {
  // runs = [dark, light, dark(3x), light, dark]; returns unit size or 0.
  const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4]
  if (total < 7) return 0
  const unit = total / 7
  const tolerance = unit / 2
  const ok =
    Math.abs(unit - runs[0]) < tolerance &&
    Math.abs(unit - runs[1]) < tolerance &&
    Math.abs(3 * unit - runs[2]) < 3 * tolerance &&
    Math.abs(unit - runs[3]) < tolerance &&
    Math.abs(unit - runs[4]) < tolerance
  return ok ? unit : 0
}

function crossCheckVertical(bin: Uint8Array, width: number, height: number, x: number, y: number, expectedTotal: number) {
  const at = (yy: number) => bin[yy * width + x]
  const counts = [0, 0, 0, 0, 0]
  let yy = y
  while (yy >= 0 && at(yy) === 1) { counts[2]++; yy-- }
  if (yy < 0) return null
  while (yy >= 0 && at(yy) === 0) { counts[1]++; yy-- }
  if (yy < 0) return null
  while (yy >= 0 && at(yy) === 1) { counts[0]++; yy-- }
  yy = y + 1
  while (yy < height && at(yy) === 1) { counts[2]++; yy++ }
  if (yy >= height) return null
  while (yy < height && at(yy) === 0) { counts[3]++; yy++ }
  if (yy >= height) return null
  while (yy < height && at(yy) === 1) { counts[4]++; yy++ }
  const total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4]
  if (Math.abs(total - expectedTotal) * 5 >= expectedTotal * 2) return null
  const unit = matchesFinderRatio(counts)
  if (!unit) return null
  // centre of the middle run
  let start = y
  while (start - 1 >= 0 && at(start - 1) === 1) start--
  let end = y
  while (end + 1 < height && at(end + 1) === 1) end++
  return { module: unit, centerY: (start + end + 1) / 2 }
}

export function findFinderCandidates(image: GrayImage, bin = binarize(image)): Candidate[] {
  const { width, height } = image
  const found: Candidate[] = []

  for (let y = 0; y < height; y++) {
    const row = y * width
    // Run-length encode the row.
    const starts: number[] = []
    const lengths: number[] = []
    const values: number[] = []
    let runStart = 0
    for (let x = 1; x <= width; x++) {
      if (x === width || bin[row + x] !== bin[row + runStart]) {
        starts.push(runStart)
        lengths.push(x - runStart)
        values.push(bin[row + runStart])
        runStart = x
      }
    }
    for (let i = 0; i + 4 < lengths.length; i++) {
      if (values[i] !== 1) continue
      const runs = lengths.slice(i, i + 5)
      const unit = matchesFinderRatio(runs)
      if (!unit) continue
      const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4]
      const centerX = starts[i + 2] + runs[2] / 2
      const vertical = crossCheckVertical(bin, width, height, Math.floor(centerX), y, total)
      if (!vertical) continue
      merge(found, { x: centerX, y: vertical.centerY, module: (unit + vertical.module) / 2, count: 1 })
    }
  }
  return found.filter((candidate) => candidate.count >= 2)
}

function merge(list: Candidate[], next: Candidate) {
  for (const existing of list) {
    const distance = Math.hypot(existing.x - next.x, existing.y - next.y)
    if (distance <= existing.module * 1.5 && Math.abs(existing.module - next.module) <= existing.module * 0.5) {
      const count = existing.count + 1
      existing.x = (existing.x * existing.count + next.x) / count
      existing.y = (existing.y * existing.count + next.y) / count
      existing.module = (existing.module * existing.count + next.module) / count
      existing.count = count
      return
    }
  }
  list.push(next)
}

type Triple = { corner: Candidate; a: Candidate; b: Candidate; score: number; indexes: number[] }

function findTriples(candidates: Candidate[]): Triple[] {
  const triples: Triple[] = []
  const pool = candidates.slice().sort((p, q) => q.count - p.count).slice(0, 24)
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let k = j + 1; k < pool.length; k++) {
        const items = [pool[i], pool[j], pool[k]]
        const modules = items.map((item) => item.module)
        if (Math.max(...modules) / Math.min(...modules) > 1.5) continue
        const d = [
          Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y),
          Math.hypot(items[0].x - items[2].x, items[0].y - items[2].y),
          Math.hypot(items[1].x - items[2].x, items[1].y - items[2].y),
        ]
        // opposite[n] = index of the vertex opposite the side d[n]
        const opposite = [2, 1, 0]
        const hypotenuseIndex = d.indexOf(Math.max(...d))
        const cornerIndex = opposite[hypotenuseIndex]
        const legs = d.filter((_, n) => n !== hypotenuseIndex)
        const legMean = (legs[0] + legs[1]) / 2
        const score = Math.abs(legs[0] - legs[1]) / legMean + Math.abs(d[hypotenuseIndex] / (Math.SQRT2 * legMean) - 1)
        const meanModule = (modules[0] + modules[1] + modules[2]) / 3
        const legModules = legMean / meanModule
        if (score > 0.12 || legModules < 12 || legModules > 190) continue
        const others = [0, 1, 2].filter((n) => n !== cornerIndex)
        triples.push({
          corner: items[cornerIndex],
          a: items[others[0]],
          b: items[others[1]],
          score,
          indexes: [i, j, k],
        })
      }
    }
  }
  return triples.sort((p, q) => p.score - q.score)
}

/**
 * Locates the single QR code in the image.
 * Throws QrLocateError('not_found' | 'multiple' | 'rotated' | 'inconsistent').
 */
export function locateQr(image: GrayImage): QrRegion {
  const bin = binarize(image)
  const candidates = findFinderCandidates(image, bin)
  if (candidates.length < 3) throw new QrLocateError('not_found', 'No QR code found in the image')

  const triples = findTriples(candidates)
  if (triples.length === 0) throw new QrLocateError('not_found', 'No QR code found in the image')

  const best = triples[0]
  const disjoint = triples.find((other) => other.indexes.every((index) => !best.indexes.includes(index)))
  if (disjoint) throw new QrLocateError('multiple', 'More than one QR code found; select the region manually')

  const angle = Math.atan2(best.a.y - best.corner.y, best.a.x - best.corner.x) * (180 / Math.PI)
  const fromAxis = Math.abs(((angle % 90) + 90) % 90)
  if (Math.min(fromAxis, 90 - fromAxis) > 3) {
    throw new QrLocateError('rotated', 'QR code is rotated; select the region manually')
  }

  const points = [best.corner, best.a, best.b]
  const moduleSize = (best.corner.module + best.a.module + best.b.module) / 3
  const minX = Math.min(...points.map((p) => p.x)) - 3.5 * moduleSize
  const maxX = Math.max(...points.map((p) => p.x)) + 3.5 * moduleSize
  const minY = Math.min(...points.map((p) => p.y)) - 3.5 * moduleSize
  const maxY = Math.max(...points.map((p) => p.y)) + 3.5 * moduleSize
  const spanX = maxX - minX
  const spanY = maxY - minY
  if (Math.abs(spanX - spanY) > Math.max(spanX, spanY) * 0.12) {
    throw new QrLocateError('inconsistent', 'Detected QR geometry is inconsistent; select the region manually')
  }

  const size = Math.round(Math.max(spanX, spanY))
  const x = Math.round(minX)
  const y = Math.round(minY)
  if (x < -2 || y < -2 || x + size > image.width + 2 || y + size > image.height + 2) {
    throw new QrLocateError('inconsistent', 'Detected QR extends outside the image; select the region manually')
  }
  return { x: Math.max(0, x), y: Math.max(0, y), size, moduleSize }
}
