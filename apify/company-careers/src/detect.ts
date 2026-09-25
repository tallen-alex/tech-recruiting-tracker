import type { CompanyInput, SourceType } from './types.js'

const HOST_SOURCES: Array<[RegExp, SourceType]> = [
  [/greenhouse\.io$/i, 'greenhouse'],
  [/lever\.co$/i, 'lever'],
  [/ashbyhq\.com$/i, 'ashby'],
  [/myworkdayjobs\.com$/i, 'workday'],
  [/smartrecruiters\.com$/i, 'smartrecruiters'],
  [/jobs\.apple\.com$/i, 'apple'],
]

export function detectFromUrl(url: string): SourceType | null {
  try {
    const hostname = new URL(url).hostname
    return HOST_SOURCES.find(([pattern]) => pattern.test(hostname))?.[1] ?? null
  } catch {
    return null
  }
}

export function sourceKeyFromUrl(source: SourceType, url: string): string | null {
  const parsed = new URL(url)
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (source === 'greenhouse' || source === 'lever' || source === 'ashby') return parts[0] ?? null
  if (source === 'smartrecruiters') return parts[0] === 'careers' ? parts[1] ?? null : parts[0] ?? null
  if (source === 'workday') {
    const tenant = parsed.hostname.split('.')[0]
    const siteIndex = parts.indexOf('jobs')
    const site = siteIndex > 0 ? parts[siteIndex - 1] : parts.at(-1)
    return tenant && site ? `${tenant}:${site}` : null
  }
  if (source === 'apple') return 'apple'
  return null
}

type StructuredDiscovery = { source: 'greenhouse' | 'lever' | 'ashby'; sourceKey: string; careersUrl: string }

function sourceKeyCandidates(name: string): string[] {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return [...new Set([normalized, normalized.replace(/-/g, '')].filter(Boolean))]
}

/** Cheap public-API discovery for name-only companies and stale saved ATS configurations. */
export async function discoverStructuredSource(company: CompanyInput, excluded: ReadonlySet<SourceType> = new Set()): Promise<StructuredDiscovery | null> {
  const probes = sourceKeyCandidates(company.name).flatMap((sourceKey) => ([
    { source: 'greenhouse' as const, sourceKey, careersUrl: `https://boards.greenhouse.io/${sourceKey}`,
      apiUrl: `https://boards-api.greenhouse.io/v1/boards/${sourceKey}/jobs`, jobs: (value: unknown) => (value as { jobs?: unknown[] })?.jobs },
    { source: 'lever' as const, sourceKey, careersUrl: `https://jobs.lever.co/${sourceKey}`,
      apiUrl: `https://api.lever.co/v0/postings/${sourceKey}?mode=json`, jobs: (value: unknown) => value as unknown[] },
    { source: 'ashby' as const, sourceKey, careersUrl: `https://jobs.ashbyhq.com/${sourceKey}`,
      apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${sourceKey}`, jobs: (value: unknown) => (value as { jobs?: unknown[] })?.jobs },
  ]).filter((probe) => !excluded.has(probe.source)))

  const results = await Promise.all(probes.map(async (probe) => {
    try {
      const response = await fetch(probe.apiUrl)
      if (!response.ok) return null
      const jobs = probe.jobs(await response.json())
      return Array.isArray(jobs) && jobs.length > 0 ? probe : null
    } catch {
      return null
    }
  }))
  const match = results.find((result): result is NonNullable<typeof result> => result !== null)
  return match ? { source: match.source, sourceKey: match.sourceKey, careersUrl: match.careersUrl } : null
}

export async function detectCompanySource(company: CompanyInput): Promise<{ source: SourceType; sourceKey: string | null; careersUrl: string }> {
  if (company.sourceType && company.sourceType !== 'custom' && company.careersUrl) {
    return { source: company.sourceType, sourceKey: company.sourceKey, careersUrl: company.careersUrl }
  }
  if (company.sourceType && company.sourceKey) {
    const urls: Partial<Record<SourceType, string>> = {
      greenhouse: `https://boards.greenhouse.io/${company.sourceKey}`,
      lever: `https://jobs.lever.co/${company.sourceKey}`,
      ashby: `https://jobs.ashbyhq.com/${company.sourceKey}`,
      smartrecruiters: `https://careers.smartrecruiters.com/${company.sourceKey}`,
      apple: 'https://jobs.apple.com/en-us/search',
    }
    const careersUrl = urls[company.sourceType]
    if (careersUrl) return { source: company.sourceType, sourceKey: company.sourceKey, careersUrl }
  }
  if (!company.careersUrl) {
    const discovered = await discoverStructuredSource(company)
    if (discovered) return discovered
    throw new Error('Could not discover a public Greenhouse, Lever, or Ashby board from the company name; add a careers URL')
  }

  const configuredUrlSource = detectFromUrl(company.careersUrl)
  if (configuredUrlSource) {
    return { source: configuredUrlSource, sourceKey: sourceKeyFromUrl(configuredUrlSource, company.careersUrl), careersUrl: company.careersUrl }
  }

  const response = await fetch(company.careersUrl, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Careers page returned ${response.status}`)
  const finalUrl = response.url || company.careersUrl
  const html = await response.text()
  const urlSource = detectFromUrl(finalUrl)
  if (urlSource) return { source: urlSource, sourceKey: sourceKeyFromUrl(urlSource, finalUrl), careersUrl: finalUrl }

  const signatures: Array<[RegExp, SourceType]> = [
    [/greenhouse\.io/i, 'greenhouse'], [/lever\.co/i, 'lever'], [/ashbyhq\.com/i, 'ashby'],
    [/myworkdayjobs\.com|\/wday\/cxs\//i, 'workday'], [/smartrecruiters\.com/i, 'smartrecruiters'],
    [/jobs\.apple\.com/i, 'apple'],
  ]
  for (const [pattern, source] of signatures) {
    const match = html.match(new RegExp(`https?:[^"']*${pattern.source}[^"']*`, 'i'))
    if (match) {
      const detectedUrl = match[0].replace(/&amp;/g, '&')
      return { source, sourceKey: sourceKeyFromUrl(source, detectedUrl), careersUrl: detectedUrl }
    }
  }
  return { source: 'custom', sourceKey: null, careersUrl: finalUrl }
}
