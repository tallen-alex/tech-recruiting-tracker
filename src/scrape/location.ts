export function parseLocationKeywords(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** No keywords configured = no filtering (everything matches). Otherwise a plain case-insensitive substring match against the posting's location text — cheap and deterministic, no LLM call. */
export function locationMatches(jobLocation: string | null, keywords: string[]): boolean {
  if (keywords.length === 0) return true
  if (!jobLocation) return false
  const loc = jobLocation.toLowerCase()
  return keywords.some((kw) => loc.includes(kw))
}
