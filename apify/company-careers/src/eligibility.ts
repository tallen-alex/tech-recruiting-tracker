import type { NormalizedJob, ScanPolicy, TargetingProfile } from './types.js'

export const DEFAULT_SCAN_POLICY: ScanPolicy = {
  maxAgeDays: 90,
  maxStoredJobsPerCompany: 250,
  structuredMaxPages: 100,
  genericMaxListingPages: 20,
  genericMaxJobs: 200,
  genericMaxSeconds: 180,
}

const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').replace(/\s+/g, ' ').trim()
const phraseMatch = (value: string, phrase: string) => {
  const normalized = clean(phrase)
  return normalized.length > 1 && ` ${clean(value)} `.includes(` ${normalized} `)
}
const matchesAny = (value: string, phrases: string[]) => phrases.some((phrase) => phraseMatch(value, phrase))

const LOCATION_ALIASES: Record<string, string[]> = {
  'united states': ['united states', 'usa', 'u s', 'us'],
  'united kingdom': ['united kingdom', 'uk', 'great britain'],
  canada: ['canada', 'can'],
  australia: ['australia', 'aus'],
}

function locationMatches(value: string, preferences: string[]): boolean {
  return preferences.some((preference) => {
    const normalized = clean(preference)
    const aliases = LOCATION_ALIASES[normalized] ?? [normalized]
    return aliases.some((alias) => phraseMatch(value, alias))
  })
}

export function titleMayMatch(title: string, profile: TargetingProfile): boolean {
  if (matchesAny(title, profile.excluded_titles)) return false
  return matchesAny(title, [...profile.target_titles, ...profile.adjacent_titles])
}

export function evaluateEligibility(job: NormalizedJob, profile: TargetingProfile, policy: ScanPolicy): { eligible: boolean; reason: string } {
  if (matchesAny(job.title, profile.excluded_titles)) return { eligible: false, reason: 'excluded title' }
  const exactTarget = matchesAny(job.title, profile.target_titles)
  const adjacentTarget = matchesAny(job.title, profile.adjacent_titles)
  if (!exactTarget && !adjacentTarget) return { eligible: false, reason: 'title outside targeting profile' }

  if (job.postedAt) {
    const posted = new Date(job.postedAt).getTime()
    if (Number.isFinite(posted) && posted < Date.now() - policy.maxAgeDays * 86_400_000) {
      return { eligible: false, reason: `older than ${policy.maxAgeDays} days` }
    }
  }

  const location = `${job.location ?? ''} ${job.workplaceType ?? ''}`.trim()
  if (profile.locations.length > 0 && location && !locationMatches(location, profile.locations)) {
    return { eligible: false, reason: 'location outside targeting profile' }
  }
  if (profile.locations.length > 0 && !location && !exactTarget) {
    return { eligible: false, reason: 'missing location on adjacent title' }
  }
  return { eligible: true, reason: exactTarget ? 'target title and location eligible' : 'adjacent title and location eligible' }
}

export function appleLocationFilters(locations: string[]): string[] {
  const codes: Record<string, string> = {
    'united states': 'postLocation-USA', canada: 'postLocation-CAN', 'united kingdom': 'postLocation-GBR',
    ireland: 'postLocation-IRL', germany: 'postLocation-DEU', france: 'postLocation-FRA', india: 'postLocation-IND',
    singapore: 'postLocation-SGP', china: 'postLocation-CHN', japan: 'postLocation-JPN', australia: 'postLocation-AUS',
  }
  return [...new Set(locations.map((location) => codes[clean(location)]).filter((value): value is string => Boolean(value)))]
}
