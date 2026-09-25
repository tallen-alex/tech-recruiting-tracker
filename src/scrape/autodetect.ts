function slugCandidates(companyName: string): string[] {
  const base = companyName.toLowerCase().trim()
  const noSeparators = base.replace(/[^a-z0-9]+/g, '')
  const hyphenated = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return Array.from(new Set([noSeparators, hyphenated].filter(Boolean)))
}

export async function greenhouseSlugValid(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`)
    if (!res.ok) return false
    const data = (await res.json()) as { jobs?: unknown }
    return Array.isArray(data.jobs)
  } catch {
    return false
  }
}

export async function leverSlugValid(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`)
    if (!res.ok) return false
    const data = await res.json()
    return Array.isArray(data)
  } catch {
    return false
  }
}

export type AtsDetection = { ats_type: 'greenhouse' | 'lever'; ats_slug: string }

/** Free, no LLM: many companies use their plain name as their board slug (confirmed live for Stripe, Vercel, Plaid). */
export async function autoDetectAtsFree(companyName: string): Promise<AtsDetection | null> {
  for (const slug of slugCandidates(companyName)) {
    if (await greenhouseSlugValid(slug)) return { ats_type: 'greenhouse', ats_slug: slug }
  }
  for (const slug of slugCandidates(companyName)) {
    if (await leverSlugValid(slug)) return { ats_type: 'lever', ats_slug: slug }
  }
  return null
}
