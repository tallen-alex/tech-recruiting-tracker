/**
 * Candidate-requirements extraction from free-text job descriptions.
 *
 * Postings rarely share a structure: some have clean "Qualifications" bullet lists, others (notably the
 * CMS board, whose older syncs flattened descriptions to one line) run everything together. So this is
 * heuristic and conservative — it only reports what it can point to in the text, and returns nothing
 * rather than guessing. Experience always carries the matched phrase so the UI can show the evidence.
 */

export type ExperienceRequirement = {
  min: number
  max: number | null
  /** The phrase the number came from, e.g. "3+ years of experience in product management". */
  evidence: string
}

export type JobRequirements = {
  requirements: string[]
  experience: ExperienceRequirement | null
}

const MAX_ITEMS = 8
const MAX_ITEM_LENGTH = 220
const MAX_SECTION_LENGTH = 2500

const APOS = "['’]"

/** Section headings whose content is what the candidate must bring. Longest first so "basic qualifications" wins over "qualifications". */
const REQUIREMENT_HEADINGS = [
  'basic qualifications',
  'minimum qualifications',
  'required qualifications',
  'preferred qualifications',
  'desired qualifications',
  'qualifications',
  'requirements',
  `what you${APOS}ll need`,
  'what you need',
  `what you${APOS}ll bring`,
  'what you bring',
  `what we${APOS}re looking for`,
  'what we are looking for',
  'who you are',
  'about you',
  `you${APOS}ll have`,
  'you have',
  'skills and experience',
  'experience and skills',
  'required skills',
  'must haves?',
  'your profile',
  'the ideal candidate',
  'ideal candidate',
]

/** Headings that end a requirements section. "Preferred"/"nice to have" deliberately continue it. */
const STOP_HEADINGS = [
  'responsibilities',
  'key responsibilities',
  `what you${APOS}ll do`,
  'what you will do',
  'the role',
  'about the role',
  'about the team',
  'about the company',
  'about us',
  'who we are',
  'benefits',
  'perks',
  'compensation',
  'salary',
  'pay range',
  'base pay',
  'what we offer',
  `what${APOS}s in it for you`,
  'why join',
  'why you',
  'equal opportunity',
  'eeo',
  'how to apply',
  'application process',
  'additional information',
  'location',
]

const headingRegex = (headings: string[]) =>
  // A heading is only trusted where the text marks it as one: followed by a colon, alone on its line,
  // or written in capitals. Otherwise "requirements" in a sentence would start a bogus section.
  new RegExp(`(?:^|\\s|[•·▪●])(${headings.join('|')})\\b\\s*(:|\\n|(?=\\s))`, 'gi')

const REQUIREMENT_RE = headingRegex(REQUIREMENT_HEADINGS)
const STOP_RE = headingRegex(STOP_HEADINGS)

type HeadingMatch = { start: number; end: number }

/**
 * `titleCaseEnds` also trusts a Title-case heading inside flattened text ("…skills About us We are…").
 * Only used for stop headings: ending a section early loses a line, but starting one on a stray
 * capitalized word would show a paragraph of prose as requirements.
 */
function trustedHeadings(text: string, re: RegExp, titleCaseEnds = false): HeadingMatch[] {
  const found: HeadingMatch[] = []
  re.lastIndex = 0
  for (let match = re.exec(text); match; match = re.exec(text)) {
    const heading = match[1]
    const terminator = match[2]
    const headingStart = match.index + match[0].indexOf(heading)
    const lineStart = text.lastIndexOf('\n', headingStart - 1) + 1
    const lineEnd = text.indexOf('\n', headingStart)
    const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim()
    const shortLine = line.length <= 60 && text.includes('\n')
    const capitals = heading === heading.toUpperCase()
    const titleCase = titleCaseEnds && !text.includes('\n') && /^[A-Z]/.test(heading)
    if (terminator === ':' || terminator === '\n' || shortLine || capitals || titleCase) {
      found.push({ start: headingStart, end: match.index + match[0].length })
    }
  }
  return found
}

const BULLET_PREFIX = /^\s*(?:[-–—*•·▪◦●]|\d{1,2}[.)])\s*/

function clip(item: string): string {
  const clean = item.replace(BULLET_PREFIX, '').replace(/\s+/g, ' ').trim().replace(/[;,]$/, '')
  return clean.length > MAX_ITEM_LENGTH ? `${clean.slice(0, MAX_ITEM_LENGTH - 1).trimEnd()}…` : clean
}

function splitItems(section: string): string[] {
  const lines = section.split('\n').map((line) => line.trim()).filter(Boolean)
  let items = lines
  if (lines.length <= 2) {
    // Flattened text: fall back to inline bullets, then to sentences.
    const flat = lines.join(' ')
    const byBullet = flat.split(/\s[•·▪◦●]\s|\s[-–—*]\s(?=[A-Z0-9])/)
    items = byBullet.length >= 2 ? byBullet : flat.split(/(?<=[.;])\s+(?=[A-Z])/)
  }
  return items
    .map(clip)
    .filter((item) => item.length >= 8 && !new RegExp(`^(?:${REQUIREMENT_HEADINGS.join('|')})\\s*:?$`, 'i').test(item))
    .slice(0, MAX_ITEMS)
}

export function extractRequirementItems(description: string): string[] {
  const text = description.replace(/\r\n?/g, '\n')
  const starts = trustedHeadings(text, REQUIREMENT_RE)
  if (starts.length === 0) return []
  const first = starts[0]
  const stop = trustedHeadings(text, STOP_RE, true).find((heading) => heading.start > first.end)
  const section = text.slice(first.end, Math.min(stop?.start ?? text.length, first.end + MAX_SECTION_LENGTH))
  return splitItems(section)
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15,
}
const NUM = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`
const EXPERIENCE_RE = new RegExp(
  `\\b${NUM}\\s*(?:\\+|plus)?\\s*(?:(?:-|–|—|to)\\s*${NUM}\\s*\\+?\\s*)?(?:years?|yrs?)\\b(?=([^.;\\n]{0,90}))`,
  'gi',
)
/** Numbers of years that describe the company or product, not the candidate. */
const NOT_CANDIDATE_AFTER = /^\s*(?:old|ago|history|in business|running|since|of (?:growth|history|operation))|^\W*(?:we|our|the company)\b/i
const NOT_CANDIDATE_BEFORE = /(?:over|in|for|during|within) the (?:last|past|next)\s*$|for (?:over|more than|nearly)\s*$|founded\b.*$/i
/** Wording that ties the years to the candidate. Checked within the same clause only. */
const CANDIDATE_AFTER = /experience|work|professional|industry|relevant|\brole\b|position|leading|managing|building|focused|working|\bin (?:a|an)\s/i
const CANDIDATE_BEFORE = /experience|minimum|at least|requires?|required|you have|you bring/i
const PREFERRED = /preferred|ideally|nice to have|a plus|bonus/i

const toNumber = (value: string | undefined) =>
  value === undefined ? null : /^\d+$/.test(value) ? Number(value) : (NUMBER_WORDS[value.toLowerCase()] ?? null)

/**
 * The first stated requirement wins: postings lead with the bar ("5+ years of PM experience") and only
 * then qualify it ("with at least 2 years in health"), so a later, smaller number is usually a sub-ask.
 * Asks marked preferred are used only when nothing required is stated.
 */
export function extractExperience(description: string): ExperienceRequirement | null {
  let preferredFallback: ExperienceRequirement | null = null
  EXPERIENCE_RE.lastIndex = 0
  for (let match = EXPERIENCE_RE.exec(description); match; match = EXPERIENCE_RE.exec(description)) {
    const min = toNumber(match[1])
    const max = toNumber(match[2])
    const after = match[3] ?? ''
    const window = description.slice(Math.max(0, match.index - 60), match.index)
    const before = window.slice(Math.max(window.lastIndexOf('.'), window.lastIndexOf(';'), window.lastIndexOf('\n')) + 1)
    if (min === null || min > 20 || NOT_CANDIDATE_AFTER.test(after) || NOT_CANDIDATE_BEFORE.test(before)) continue
    if (!CANDIDATE_AFTER.test(after) && !CANDIDATE_BEFORE.test(before)) continue
    // Evidence runs to the next clause break so lists like "consulting, strategy, or finance" stay whole.
    const phrase = `${match[0]}${after.split(/ but |, (?:and|with|where|who) /)[0]}`.replace(/\s+/g, ' ').trim()
    const found = { min, max: max !== null && max > min ? max : null, evidence: phrase.length > 140 ? `${phrase.slice(0, 139)}…` : phrase }
    if (PREFERRED.test(after.split(/,| but /)[0]) || PREFERRED.test(before.split(/,| but /).pop() ?? '')) {
      preferredFallback ??= found
      continue
    }
    return found
  }
  return preferredFallback
}

export function extractJobRequirements(description: string | null | undefined): JobRequirements {
  if (!description || !description.trim()) return { requirements: [], experience: null }
  return { requirements: extractRequirementItems(description), experience: extractExperience(description) }
}
