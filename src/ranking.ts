import type { TargetingProfile } from './types'

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim()
const includesAny = (haystack: string, needles: string[]) => needles.some((needle) => haystack.includes(clean(needle)))
const phraseMatch = (value: string, phrase: string) => {
  const normalized = clean(phrase)
  return normalized.length > 1 && ` ${clean(value)} `.includes(` ${normalized} `)
}
const phraseMatchesAny = (value: string, phrases: string[]) => phrases.some((phrase) => phraseMatch(value, phrase))

const LOCATION_ALIASES: Record<string, string[]> = {
  'united states': ['united states', 'usa', 'u s', 'us'],
  'united kingdom': ['united kingdom', 'uk', 'great britain'],
  canada: ['canada', 'can'],
  australia: ['australia', 'aus'],
}

export function emptyTargetingProfile(): TargetingProfile {
  return { target_titles: [], adjacent_titles: [], seniority: [], skills: [], excluded_titles: [], locations: [] }
}

export function parseTargetingProfile(value: unknown): TargetingProfile {
  if (!value || typeof value !== 'object') return emptyTargetingProfile()
  const input = value as Record<string, unknown>
  const strings = (key: string) =>
    Array.isArray(input[key])
      ? input[key].filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : []
  return {
    target_titles: strings('target_titles'),
    adjacent_titles: strings('adjacent_titles'),
    seniority: strings('seniority'),
    skills: strings('skills'),
    excluded_titles: strings('excluded_titles'),
    locations: strings('locations'),
  }
}

export function isTargetingProfileReady(profile: TargetingProfile): boolean {
  return profile.target_titles.length + profile.adjacent_titles.length > 0 && profile.locations.length > 0
}

export function isJobEligible(
  profile: TargetingProfile,
  job: { title: string; location: string | null; remote: string | null; postedAt: string | null },
  maxAgeDays = 90,
): { eligible: boolean; reason: string } {
  if (phraseMatchesAny(job.title, profile.excluded_titles)) return { eligible: false, reason: 'excluded title' }
  const target = phraseMatchesAny(job.title, profile.target_titles)
  const adjacent = phraseMatchesAny(job.title, profile.adjacent_titles)
  if (!target && !adjacent) return { eligible: false, reason: 'title outside targeting profile' }
  if (job.postedAt) {
    const posted = new Date(job.postedAt).getTime()
    if (Number.isFinite(posted) && posted < Date.now() - maxAgeDays * 86_400_000) return { eligible: false, reason: `older than ${maxAgeDays} days` }
  }
  const location = `${job.location ?? ''} ${job.remote ?? ''}`.trim()
  const locationMatches = profile.locations.some((preference) => {
    const normalized = clean(preference)
    return (LOCATION_ALIASES[normalized] ?? [normalized]).some((alias) => phraseMatch(location, alias))
  })
  if (location && !locationMatches) return { eligible: false, reason: 'location outside targeting profile' }
  if (!location && !target) return { eligible: false, reason: 'missing location on adjacent title' }
  return { eligible: true, reason: target ? 'target title and location eligible' : 'adjacent title and location eligible' }
}

export function scoreDeterministicJob(
  profile: TargetingProfile,
  job: { title: string; location: string | null; description: string | null; remote: string | null },
  /**
   * `ignoreLocation` skips location scoring entirely. Used for the school CMS board, where every
   * posting is already somewhere the user can apply, so a location penalty is pure noise.
   */
  options: { ignoreLocation?: boolean } = {},
): { score: number; reason: string } {
  const title = clean(job.title)
  const location = clean(`${job.location ?? ''} ${job.remote ?? ''}`)
  const content = clean(`${job.title} ${job.description ?? ''}`)
  let score = 5
  const reasons: string[] = []

  if (includesAny(title, profile.excluded_titles)) {
    score -= 50
    reasons.push('excluded title')
  }
  if (includesAny(title, profile.target_titles)) {
    score += 50
    reasons.push('target title')
  } else if (includesAny(title, profile.adjacent_titles)) {
    score += 30
    reasons.push('adjacent title')
  }

  const matchingSkills = profile.skills.filter((skill) => content.includes(clean(skill)))
  if (matchingSkills.length > 0) {
    score += Math.min(20, matchingSkills.length * 4)
    reasons.push(`${matchingSkills.length} skill match${matchingSkills.length === 1 ? '' : 'es'}`)
  }
  if (profile.seniority.length > 0 && includesAny(title, profile.seniority)) {
    score += 15
    reasons.push('seniority match')
  }
  if (profile.locations.length > 0 && !options.ignoreLocation) {
    if (includesAny(location, profile.locations)) {
      score += 10
      reasons.push('location match')
    } else {
      score -= 15
      reasons.push('location differs')
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reason: reasons.length > 0 ? reasons.join(' · ') : 'No strong targeting signals',
  }
}
