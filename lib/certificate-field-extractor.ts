// Pure, design-independent extraction of certificate fields from OCR text.
//
// Nothing here is tied to a certificate template. Labels are derived from the
// live column names, and values are validated against what existing records
// already contain (vocabulary, value shapes, casing and date style).

export type FieldKnowledge = {
  /** Every existing non-empty value per column, duplicates included. */
  values: Record<string, string[]>
}

export type ExtractedField = {
  value: string
  /** 0..1. Callers should only auto-fill high values and show the rest as suggestions. */
  confidence: number
  source: 'label' | 'vocabulary' | 'pattern'
  evidence: string
}

export type ExtractionResult = {
  fields: Record<string, ExtractedField>
}

export const AUTOFILL_CONFIDENCE = 0.8

const SKIPPED_COLUMNS = new Set(['Certificate_photograph'])
const EMPTY_VALUES = new Set(['n/a', 'na', 'nil', 'none', '-', '--', '—', 'not applicable', 'not available'])
const MAX_VOCABULARY = 80
const IDENTIFIER_COLUMN = /(^|_)(NO|NUMBER|ID)$/i

type ColumnProfile = {
  key: string
  words: string[]
  joined: string
  canonical: Map<string, string>
  frequency: Map<string, number>
  wordFrequency: Map<string, number>
  knownWords: Set<string>
  vocabulary: string[]
  upperStyle: boolean
  /** A value used by >= 85% of existing rows, e.g. a standard treatment statement. */
  dominant: string | null
}

type LabelMatch = { column: string; score: number }

export function extractCertificateFields(
  ocrText: string,
  columns: string[],
  knowledge: FieldKnowledge
): ExtractionResult {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/[|_~]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const profiles = buildProfiles(columns, knowledge)
  const fields: Record<string, ExtractedField> = {}

  const offer = (column: string, candidate: ExtractedField) => {
    const current = fields[column]
    if (!current || candidate.confidence > current.confidence) fields[column] = candidate
  }

  for (const pair of readLabelPairs(lines, profiles)) {
    const resolved = resolvePair(pair, profiles)
    if (!resolved) continue
    offer(resolved.column, {
      value: resolved.value,
      confidence: round(Math.min(0.99, resolved.confidence * (0.6 + 0.4 * pair.labelScore))),
      source: 'label',
      evidence: pair.evidence,
    })
  }

  const text = lines.join('\n')
  for (const profile of profiles.values()) {
    if (fields[profile.key]) continue
    const found = findVocabularyValue(text, profile)
    if (found) offer(profile.key, found)
  }

  if (profiles.has('CERTIFICATE_NO')) {
    const found = findCertificateNumber(text, knowledge.values.CERTIFICATE_NO ?? [])
    if (found) offer('CERTIFICATE_NO', found)
  }
  if (profiles.has('CERTIFICATE_DATE')) {
    const found = findCertificateDate(text, knowledge.values.CERTIFICATE_DATE ?? [])
    if (found) offer('CERTIFICATE_DATE', found)
  }

  return { fields }
}

// ---------- profiles ----------

function buildProfiles(columns: string[], knowledge: FieldKnowledge) {
  const profiles = new Map<string, ColumnProfile>()
  for (const key of columns) {
    if (SKIPPED_COLUMNS.has(key)) continue
    const words = key.toLowerCase().split(/[_\s]+/).filter(Boolean)
    const known = (knowledge.values[key] ?? []).map((v) => v.trim()).filter(Boolean)

    const counts = new Map<string, Map<string, number>>()
    const knownWords = new Set<string>()
    const wordFrequency = new Map<string, number>()
    for (const value of known) {
      const norm = normalize(value)
      norm.split(' ').forEach((w) => wordFrequency.set(w, (wordFrequency.get(w) ?? 0) + 1))
      const variants = counts.get(norm) ?? new Map<string, number>()
      variants.set(value, (variants.get(value) ?? 0) + 1)
      counts.set(norm, variants)
      norm.split(' ').forEach((w) => knownWords.add(w))
    }
    const canonical = new Map<string, string>()
    const frequency = new Map<string, number>()
    const identifier = IDENTIFIER_COLUMN.test(key)
    for (const [norm, variants] of counts) {
      frequency.set(norm, [...variants.values()].reduce((a, b) => a + b, 0))
      canonical.set(norm, [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0])
    }

    const withLetters = known.filter((v) => /[A-Za-z]/.test(v))
    const upperStyle =
      withLetters.length >= 5 &&
      withLetters.filter((v) => v === v.toUpperCase()).length / withLetters.length >= 0.7

    const dominantEntry = [...counts.entries()]
      .map(([norm, variants]) => [norm, [...variants.values()].reduce((a, b) => a + b, 0)] as const)
      .sort((a, b) => b[1] - a[1])[0]
    const dominant =
      dominantEntry && known.length >= 20 && dominantEntry[1] / known.length >= 0.85
        ? canonical.get(dominantEntry[0]) ?? null
        : null

    profiles.set(key, {
      key,
      words,
      joined: words.join(' '),
      // Identifiers (certificate/batch numbers) are unique: they are never matched as vocabulary.
      canonical: identifier ? new Map() : canonical,
      frequency,
      wordFrequency,
      knownWords,
      vocabulary: !identifier && canonical.size <= MAX_VOCABULARY ? [...canonical.keys()] : [],
      upperStyle,
      dominant,
    })
  }
  return profiles
}

// ---------- label / value pairs ----------

type LabelPair = { column: string; value: string; labelScore: number; evidence: string }

function readLabelPairs(lines: string[], profiles: Map<string, ColumnProfile>): LabelPair[] {
  const pairs: LabelPair[] = []

  for (const line of lines) {
    const colons = [...line.matchAll(/:/g)].map((m) => m.index ?? 0)
    if (colons.length === 0) continue

    // Decide where each label starts: the longest trailing run of words before
    // the colon that maps to a column, otherwise a trailing run of Title Case words.
    const segments: { start: number; colon: number; matches: LabelMatch[]; label: string }[] = []
    let previousColon = -1
    for (const colon of colons) {
      const before = line.slice(previousColon + 1, colon)
      const tokens = [...before.matchAll(/\S+/g)].map((m) => ({ text: m[0], index: (m.index ?? 0) + previousColon + 1 }))
      let chosen: { start: number; matches: LabelMatch[]; label: string } | null = null
      for (let take = Math.min(4, tokens.length); take >= 1 && !chosen; take--) {
        const slice = tokens.slice(tokens.length - take)
        const label = slice.map((t) => t.text).join(' ')
        const matches = matchLabel(label, profiles)
        if (matches.length > 0) chosen = { start: slice[0].index, matches, label }
      }
      if (!chosen && tokens.length > 0) {
        let take = 0
        while (take < Math.min(3, tokens.length) && /^[A-Z][A-Za-z/&.]*$/.test(tokens[tokens.length - 1 - take].text)) take++
        const slice = tokens.slice(tokens.length - Math.max(take, 1))
        chosen = { start: slice[0].index, matches: [], label: slice.map((t) => t.text).join(' ') }
      }
      segments.push({ start: chosen?.start ?? colon, colon, matches: chosen?.matches ?? [], label: chosen?.label ?? '' })
      previousColon = colon
    }

    segments.forEach((segment, index) => {
      if (segment.matches.length === 0) return
      const end = index + 1 < segments.length ? segments[index + 1].start : line.length
      const rawValue = line.slice(segment.colon + 1, end).trim()
      if (!rawValue) return

      if (segment.matches.length === 1) {
        pairs.push({
          column: segment.matches[0].column,
          value: rawValue,
          labelScore: segment.matches[0].score,
          evidence: `${segment.label}: ${rawValue}`,
        })
        return
      }

      // "Origin & Botanical: Indonesian & Elaeocarpus ganitrus" — one label, several columns.
      const parts = rawValue.split(/\s*(?:&|\/|\band\b|\+)\s*/i).filter(Boolean)
      if (parts.length === segment.matches.length) {
        segment.matches.forEach((match, i) => {
          pairs.push({ column: match.column, value: parts[i], labelScore: match.score * 0.9, evidence: `${segment.label}: ${rawValue}` })
        })
      }
    })
  }

  return pairs
}

function matchLabel(label: string, profiles: Map<string, ColumnProfile>): LabelMatch[] {
  const parts = label
    .split(/\s*(?:&|\/|\band\b)\s*/i)
    .map((p) => normalize(p))
    .filter(Boolean)
  if (parts.length === 0) return []

  const results: LabelMatch[] = []
  for (const part of parts) {
    const best = bestColumnForLabel(part, profiles)
    if (best && !results.some((r) => r.column === best.column)) results.push(best)
  }
  return results.length === parts.length ? results : []
}

function bestColumnForLabel(label: string, profiles: Map<string, ColumnProfile>): LabelMatch | null {
  const labelWords = label.split(' ')
  let best: LabelMatch | null = null
  for (const profile of profiles.values()) {
    let score = 0
    if (label === profile.joined) {
      score = 1
    } else {
      const similarity = similarityRatio(label, profile.joined)
      if (similarity >= 0.82) score = similarity
      else if (profile.words.every((w) => labelWords.includes(w))) score = 0.85 - 0.05 * (labelWords.length - profile.words.length)
      // "Origin & Botanical" names BOTANICAL_NAME by its distinctive word only.
      else if (labelWords.every((w) => w.length >= 5 && profile.words.includes(w))) score = 0.75
    }
    if (score >= 0.7 && (!best || score > best.score)) best = { column: profile.key, score }
  }
  return best
}

// ---------- value resolution ----------

// Resolve one "label: value" pair. The label only nominates a column: when the
// column has a closed vocabulary the value must agree with it, otherwise the
// value is tried against every other closed column (designs name the same
// field differently, e.g. "Rudraksha Type" printing a mukhi count).
function resolvePair(
  pair: LabelPair,
  profiles: Map<string, ColumnProfile>
): { column: string; value: string; confidence: number } | null {
  const own = profiles.get(pair.column)
  if (!own) return null
  const cleaned = cleanValue(pair.value)
  if (!cleaned || EMPTY_VALUES.has(cleaned.toLowerCase())) return null
  const value = canonicalizeWords(cleaned, own)

  const known = matchKnown(value, own)
  if (known) return { column: own.key, ...known }

  if (isClosed(own)) {
    let best: { column: string; value: string; confidence: number } | null = null
    for (const other of profiles.values()) {
      if (other.key === own.key || !isClosed(other)) continue
      const hit = matchKnown(value, other)
      if (hit && hit.confidence >= 0.85 && (!best || hit.confidence > best.confidence)) {
        best = { column: other.key, value: hit.value, confidence: hit.confidence * 0.9 }
      }
    }
    if (best) return best

    // The certificate words this field differently from the database ("No chemical or
    // artificial treatment" -> "No Treatment"). Only offer the dominant value as a suggestion.
    if (own.dominant) return { column: own.key, value: own.dominant, confidence: 0.55 }
    return { column: own.key, value: applyStyle(value, own), confidence: 0.35 }
  }

  return { column: own.key, value: applyStyle(value, own), confidence: isNumericColumn(own) ? 0.82 : 0.7 }
}

function matchKnown(value: string, profile: ColumnProfile): { value: string; confidence: number } | null {
  if (profile.canonical.size === 0) return null
  const norm = normalize(value)
  const found =
    (profile.canonical.has(norm) ? { key: norm, confidence: 0.98 } : null) ??
    ((): { key: string; confidence: number } | null => {
      const prefix = longestKnownPrefix(norm, profile)
      return prefix ? { key: prefix, confidence: 0.88 } : null
    })() ??
    ((): { key: string; confidence: number } | null => {
      const fuzzy = closestKnown(norm, profile)
      return fuzzy ? { key: fuzzy.key, confidence: 0.6 + 0.3 * fuzzy.ratio } : null
    })()
  if (!found) return null
  const key = preferFrequentVariant(found.key, profile)
  return { value: profile.canonical.get(key) ?? key, confidence: found.confidence }
}

// When a near-identical known value is far more common, use the common one. Digits must agree.
// Certificates often print a spelling the database normalises ("Rudraksh" vs "Rudraksha").
// A word that is one edit away from a much more common word in this column is replaced by it.
function canonicalizeWords(value: string, profile: ColumnProfile): string {
  if (profile.wordFrequency.size === 0) return value
  return value
    .split(/(\s+)/)
    .map((part) => {
      const lower = part.toLowerCase()
      if (!/^[a-z]{5,}$/.test(lower)) return part
      const own = profile.wordFrequency.get(lower) ?? 0
      let best = ''
      let bestCount = Math.max(3, own * 3 - 1)
      for (const [word, count] of profile.wordFrequency) {
        if (count <= bestCount || Math.abs(word.length - lower.length) > 1 || !/^[a-z]+$/.test(word)) continue
        if (editDistance(word, lower) === 1) {
          best = word
          bestCount = count
        }
      }
      if (!best) return part
      if (part === part.toUpperCase()) return best.toUpperCase()
      return part[0] === part[0].toUpperCase() ? best[0].toUpperCase() + best.slice(1) : best
    })
    .join('')
}

function preferFrequentVariant(key: string, profile: ColumnProfile): string {
  const own = profile.frequency.get(key) ?? 0
  let best = key
  let bestCount = own
  for (const [other, count] of profile.frequency) {
    if (other === key || count < 3 || count < own * 3 || count <= bestCount) continue
    if (digitsOf(other) !== digitsOf(key) || similarityRatio(other, key) < 0.9) continue
    best = other
    bestCount = count
  }
  return best
}

function isClosed(profile: ColumnProfile) {
  return profile.canonical.size > 0 && profile.canonical.size <= MAX_VOCABULARY && !isNumericColumn(profile)
}

function isNumericColumn(profile: ColumnProfile) {
  const keys = [...profile.canonical.keys()]
  return keys.length > 0 && keys.filter((k) => /\d/.test(k)).length / keys.length > 0.6
}

function longestKnownPrefix(norm: string, profile: ColumnProfile): string | null {
  let best: string | null = null
  for (const known of profile.canonical.keys()) {
    if ((best && known.length <= best.length) || !norm.startsWith(known + ' ')) continue
    const tail = norm.slice(known.length).trim().split(' ')
    if (tail.every((token) => isDebris(token, profile))) best = known
  }
  return best
}

function isDebris(token: string, profile: ColumnProfile) {
  return token.length <= 2 || (token.length <= 3 && !profile.knownWords.has(token))
}

function closestKnown(norm: string, profile: ColumnProfile): { key: string; ratio: number } | null {
  let best: { key: string; ratio: number } | null = null
  const consider = (candidate: string, known: string, minimum: number, scale: number) => {
    // Digits are identifying ("5 Mukhi" is not "1 Mukhi"), so they must agree exactly.
    if (digitsOf(known) !== digitsOf(candidate)) return
    const ratio = similarityRatio(candidate, known)
    if (ratio >= minimum && (!best || ratio * scale > best.ratio)) best = { key: known, ratio: ratio * scale }
  }

  for (const known of profile.canonical.keys()) consider(norm, known, 0.85, 1)
  if (best) return best

  // Known value followed by one or two OCR-debris tokens ("5 Mukhi Rudraksh SABES").
  const tokens = norm.split(' ')
  for (let take = tokens.length - 1; take >= Math.max(1, tokens.length - 2); take--) {
    const prefix = tokens.slice(0, take).join(' ')
    if (!tokens.slice(take).every((t) => t.length <= 5 && !profile.knownWords.has(t))) continue
    for (const known of profile.canonical.keys()) consider(prefix, known, 0.9, 0.95)
  }
  return best
}

function digitsOf(value: string): string {
  return value.replace(/\D+/g, ' ').trim()
}

function cleanValue(raw: string): string {
  const unquoted = raw.replace(/[“”"]/g, '').trim()
  const tokens = unquoted.replace(/(\([^)]*\)).*$/, '$1').split(/\s+/)
  // Strip trailing OCR debris from decorative artwork ("Natural Brown od g").
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]
    const isDebris = /^[^A-Za-z0-9]+$/.test(last) || (/^[a-z]{1,2}$/.test(last) && !/^(of|in|mm|ct|cm)$/.test(last))
    if (!isDebris) break
    tokens.pop()
  }
  return tokens.join(' ').replace(/[\s,;:.\-–]+$/, '').trim()
}

function applyStyle(value: string, profile: ColumnProfile): string {
  return profile.upperStyle ? value.toUpperCase() : value
}

// ---------- vocabulary scan (no usable label) ----------

function findVocabularyValue(text: string, profile: ColumnProfile): ExtractedField | null {
  if (profile.vocabulary.length === 0) return null
  const haystack = ` ${normalize(text)} `
  const hits = profile.vocabulary
    .filter((known) => known.length >= 4 && occursStandalone(haystack, known))
    .sort((a, b) => b.length - a.length)
  if (hits.length === 0) return null
  return {
    value: profile.canonical.get(hits[0]) ?? hits[0],
    confidence: hits.length === 1 ? 0.6 : 0.5,
    source: 'vocabulary',
    evidence: `Matched existing ${profile.key} value in text`,
  }
}

// A hit inside a longer expression ("1 to 9 Mukhi" containing "9 Mukhi") is not a match.
function occursStandalone(haystack: string, known: string): boolean {
  let from = 0
  for (;;) {
    const at = haystack.indexOf(` ${known} `, from)
    if (at === -1) return false
    const before = haystack.slice(0, at).trim().split(' ').pop() ?? ''
    if (!/^(\d+|to|and|or)$/.test(before)) return true
    from = at + 1
  }
}

// ---------- certificate number ----------

function collectCertificateNumbers(text: string, knownNumbers: string[]): Map<string, number> {
  const candidates = new Map<string, number>()
  const knownShapes = new Set(knownNumbers.map(shapeOf))
  if (knownShapes.size === 0) return candidates

  const patterns = [...new Set(knownNumbers.map(segmentClasses))].map((p) => p.split(''))
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    if (token.length < 5 || !/\d/.test(token)) continue
    const repaired = repairToKnownPattern(token, patterns) ?? repairConfusions(token)
    if (knownShapes.has(shapeOf(repaired))) candidates.set(repaired, (candidates.get(repaired) ?? 0) + 1)
  }
  return candidates
}

export type CertificateNumberCheck =
  | { status: 'match' }
  | { status: 'mismatch'; found: string }
  | { status: 'unreadable' }

/**
 * Confirms that the number printed on a certificate is the one a record already
 * holds. Used before a certificate is allowed to overwrite an existing row.
 */
export function verifyCertificateNumber(text: string, expected: string, knownNumbers: string[]): CertificateNumberCheck {
  const compact = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const wanted = compact(expected)
  if (!wanted) return { status: 'unreadable' }

  const candidates = collectCertificateNumbers(text, [...knownNumbers, expected])
  if ([...candidates.keys()].some((candidate) => compact(candidate) === wanted)) return { status: 'match' }
  if (compact(text).includes(wanted)) return { status: 'match' }

  const found = [...candidates.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return found ? { status: 'mismatch', found } : { status: 'unreadable' }
}

function findCertificateNumber(text: string, knownNumbers: string[]): ExtractedField | null {
  const candidates = collectCertificateNumbers(text, knownNumbers)
  if (candidates.size === 0) return null

  const ranked = [...candidates.entries()].sort((a, b) => b[1] - a[1])
  const value = ranked[0][0]
  const existing = new Set(knownNumbers.map((n) => n.trim().toUpperCase()))
  if (existing.has(value.toUpperCase())) {
    // A new certificate cannot reuse a number: this is an OCR misread or a duplicate upload.
    return {
      value,
      confidence: 0.45,
      source: 'pattern',
      evidence: 'This certificate number already exists. Check for an OCR misread or a duplicate.',
    }
  }
  return {
    value,
    confidence: candidates.size === 1 ? 0.92 : 0.6,
    source: 'pattern',
    evidence: 'Matches the format of existing certificate numbers',
  }
}

// 'A' for an all-letter segment, '9' for all digits, 'M' for mixed: "AB-CD-0010-001" -> "AA99".
function segmentClasses(value: string): string {
  return value
    .trim()
    .split(/[-/]/)
    .map((segment) => (/^[A-Za-z]+$/.test(segment) ? 'A' : /^\d+$/.test(segment) ? '9' : 'M'))
    .join('')
}

const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2' }
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z' }

// Coerce each segment to the class existing numbers use there ("OO12" -> "0012"),
// choosing the known pattern that needs the fewest corrections.
function repairToKnownPattern(token: string, patterns: string[][]): string | null {
  const parts = token.split(/(-|\/)/)
  const segments = parts.filter((_, index) => index % 2 === 0)
  let best: { segments: string[]; changes: number } | null = null

  for (const pattern of patterns) {
    if (pattern.length !== segments.length) continue
    let changes = 0
    const fixed: string[] = []
    for (let i = 0; i < segments.length && fixed.length === i; i++) {
      const segment = segments[i]
      if (pattern[i] === 'M') {
        fixed.push(segment)
        continue
      }
      const map = pattern[i] === '9' ? TO_DIGIT : TO_LETTER
      const next = [...segment.toUpperCase()].map((ch) => map[ch] ?? ch).join('')
      const valid = pattern[i] === '9' ? /^\d+$/.test(next) : /^[A-Z]+$/.test(next)
      if (!valid) break
      if (next !== segment) changes += [...segment].filter((ch, k) => ch !== next[k]).length
      fixed.push(next)
    }
    if (fixed.length === segments.length && (!best || changes < best.changes)) best = { segments: fixed, changes }
  }
  if (!best) return null

  let index = 0
  return parts.map((part, i) => (i % 2 === 0 ? best.segments[index++] : part)).join('')
}

// Fallback: fix common OCR swaps inside each separator-delimited segment of a code.
function repairConfusions(token: string): string {
  return token
    .split(/(-|\/)/)
    .map((segment) => {
      if (segment === '-' || segment === '/') return segment
      const digits = (segment.match(/\d/g) ?? []).length
      const letters = (segment.match(/[A-Za-z]/g) ?? []).length
      if (digits > letters) {
        return segment.replace(/[OoQD]/g, '0').replace(/[IlL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8')
      }
      if (letters > digits) {
        return segment.toUpperCase().replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B')
      }
      return segment
    })
    .join('')
}

function shapeOf(value: string): string {
  return value.replace(/[A-Za-z]/g, 'A').replace(/\d/g, '9').replace(/(.)\1+/g, '$1')
}

// ---------- certificate date ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function findCertificateDate(text: string, knownDates: string[]): ExtractedField | null {
  const parsed = parseFirstDate(text)
  if (!parsed) return null
  const { year, month, day } = parsed
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null

  const style = dominantDateStyle(knownDates)
  const pad = (n: number) => String(n).padStart(2, '0')
  const value =
    style.order === 'ymd'
      ? [year, pad(month), pad(day)].join(style.separator)
      : [pad(day), pad(month), year].join(style.separator)
  return { value, confidence: 0.85, source: 'pattern', evidence: 'Date found in certificate text' }
}

function parseFirstDate(text: string): { year: number; month: number; day: number } | null {
  const numeric = text.match(/\b(\d{1,4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,4})\b/)
  if (numeric) {
    const [a, b, c] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])]
    return numeric[1].length === 4 ? { year: a, month: b, day: c } : { year: c, month: b, day: a }
  }
  const named = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/)
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1
    if (month > 0) return { year: Number(named[3]), month, day: Number(named[1]) }
  }
  return null
}

function dominantDateStyle(known: string[]): { order: 'ymd' | 'dmy'; separator: string } {
  const tally = new Map<string, number>()
  for (const value of known) {
    const m = value.trim().match(/^(\d{1,4})([-/.])(\d{1,2})[-/.](\d{1,4})$/)
    if (!m) continue
    const key = `${m[1].length === 4 ? 'ymd' : 'dmy'}${m[2]}`
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!top) return { order: 'dmy', separator: '-' }
  return { order: top.startsWith('ymd') ? 'ymd' : 'dmy', separator: top.slice(3) }
}

// ---------- text helpers ----------

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function similarityRatio(a: string, b: string): number {
  if (a === b) return 1
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - editDistance(a, b) / longest
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return previous[b.length]
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
