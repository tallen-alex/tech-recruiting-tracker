/**
 * Visa-sponsorship classification.
 *
 * The CMS board has a structured work-authorization field, but it is frequently blank or generic while
 * the real answer sits in the job description. So description text is the primary signal and the
 * structured field is a fallback.
 *
 * Deliberately conservative. A wrong "sponsored" costs a wasted application; a wrong "not sponsored"
 * costs a missed opportunity. Anything that is not an unambiguous statement stays `unclear`, and every
 * verdict carries the exact phrase that produced it so the user can check it themselves.
 */

export type Sponsorship = 'sponsored' | 'not_sponsored' | 'unclear'

export type SponsorshipVerdict = {
  sponsorship: Sponsorship
  /** The matched phrase, so the UI can show why — never present it as fact without this. */
  evidence: string | null
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Unambiguous refusals only. Phrases like "must be legally authorized to work in the US" are
 * excluded on purpose: students on OPT/CPT often *are* authorized, so that wording says nothing
 * about sponsorship and would produce false negatives.
 */
const NOT_SPONSORED_PATTERNS: string[] = [
  'will not sponsor',
  'will not be sponsoring',
  'will not provide sponsorship',
  'will not provide visa sponsorship',
  'does not sponsor',
  'do not sponsor',
  'does not offer sponsorship',
  'do not offer sponsorship',
  'does not provide sponsorship',
  'unable to sponsor',
  'unable to provide sponsorship',
  'not able to sponsor',
  'cannot sponsor',
  'can not sponsor',
  'no visa sponsorship',
  'visa sponsorship is not available',
  'visa sponsorship not available',
  'sponsorship is not available',
  'sponsorship not available',
  'not eligible for sponsorship',
  'without the need for sponsorship',
  'without need for sponsorship',
  'without requiring sponsorship',
  'without sponsorship now or in the future',
  'now or in the future',
  'not offer visa sponsorship',
  'ineligible for visa sponsorship',
]

const SPONSORED_PATTERNS: string[] = [
  'will sponsor',
  'visa sponsorship is available',
  'visa sponsorship available',
  'sponsorship is available',
  'sponsorship available',
  'we sponsor',
  'we do sponsor',
  'able to sponsor',
  'offer visa sponsorship',
  'offers visa sponsorship',
  'provide visa sponsorship',
  'provides visa sponsorship',
  'open to candidates requiring sponsorship',
  'h 1b sponsorship',
  'h1b sponsorship',
  'sponsorship provided',
  'will consider sponsorship',
  'eligible for visa sponsorship',
]

function findPhrase(haystack: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (haystack.includes(pattern)) return pattern
  }
  return null
}

/** Pulls a short readable snippet around the match so the user sees real context, not just the keyword. */
function snippetAround(original: string, normalizedPhrase: string): string {
  const normalized = normalize(original)
  const index = normalized.indexOf(normalizedPhrase)
  if (index === -1) return normalizedPhrase
  const start = Math.max(0, index - 60)
  const end = Math.min(normalized.length, index + normalizedPhrase.length + 60)
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end).trim()}${end < normalized.length ? '…' : ''}`
}

export function classifySponsorship(input: {
  description: string | null
  workAuthRaw: string | null
}): SponsorshipVerdict {
  const description = input.description ?? ''
  const normalizedDescription = normalize(description)

  // Refusals win over offers: a posting that says both is almost always listing a general
  // policy alongside a specific exclusion, and the exclusion is the operative part.
  const negative = findPhrase(normalizedDescription, NOT_SPONSORED_PATTERNS)
  if (negative) return { sponsorship: 'not_sponsored', evidence: snippetAround(description, negative) }

  const positive = findPhrase(normalizedDescription, SPONSORED_PATTERNS)
  if (positive) return { sponsorship: 'sponsored', evidence: snippetAround(description, positive) }

  // Structured field only when the description said nothing either way.
  const workAuth = normalize(input.workAuthRaw ?? '')
  if (workAuth) {
    const fieldNegative = findPhrase(workAuth, NOT_SPONSORED_PATTERNS)
    if (fieldNegative) return { sponsorship: 'not_sponsored', evidence: `board field: ${workAuth.slice(0, 120)}` }
    const fieldPositive = findPhrase(workAuth, SPONSORED_PATTERNS)
    if (fieldPositive) return { sponsorship: 'sponsored', evidence: `board field: ${workAuth.slice(0, 120)}` }
  }

  return { sponsorship: 'unclear', evidence: null }
}
