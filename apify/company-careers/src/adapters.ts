import { PlaywrightCrawler, RequestQueue } from 'crawlee'
import { load } from 'cheerio'
import type { AdapterOptions, AdapterResult, CompanyInput, NormalizedJob, SourceType } from './types.js'
import { absoluteUrl, asIsoDate, dedupeJobs, fetchJson, text } from './utils.js'
import { appleLocationFilters, titleMayMatch } from './eligibility.js'

const STRUCTURED_LIMIT = 10_000

function result(source: SourceType, sourceKey: string | null, careersUrl: string, jobs: NormalizedJob[], pagesVisited: number, limitReached = false): AdapterResult {
  const deduped = dedupeJobs(jobs).slice(0, STRUCTURED_LIMIT)
  const partial = limitReached || jobs.length > STRUCTURED_LIMIT
  return {
    status: partial ? 'partial' : 'succeeded',
    detectedSource: source,
    detectedSourceKey: sourceKey,
    careersUrl,
    pagesVisited,
    jobsDiscovered: deduped.length,
    jobsFound: deduped.length,
    stopReason: limitReached ? 'structured page limit reached' : jobs.length > STRUCTURED_LIMIT ? 'structured job limit reached' : 'complete',
    error: null,
    jobs: deduped,
  }
}

export async function greenhouse(company: CompanyInput, key: string, careersUrl: string): Promise<AdapterResult> {
  type GreenhouseJob = { id: number; title: string; absolute_url: string; updated_at?: string; content?: string; location?: { name?: string }; departments?: Array<{ name: string }> }
  const data = await fetchJson<{ jobs: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${key}/jobs?content=true`)
  const jobs = data.jobs.map((job): NormalizedJob => ({
    externalId: String(job.id), title: job.title, location: job.location?.name ?? null, workplaceType: null,
    department: job.departments?.map((item) => item.name).join(', ') || null, employmentType: null,
    description: text(job.content), postedAt: asIsoDate(job.updated_at), deadline: null, salaryMin: null, salaryMax: null,
    jobUrl: job.absolute_url, applyUrl: job.absolute_url, source: 'greenhouse',
  }))
  return result('greenhouse', key, careersUrl, jobs, 1)
}

export async function lever(company: CompanyInput, key: string, careersUrl: string): Promise<AdapterResult> {
  type LeverJob = { id: string; text: string; hostedUrl: string; applyUrl?: string; descriptionPlain?: string; categories?: { location?: string; team?: string; commitment?: string }; workplaceType?: string; createdAt?: number }
  const data = await fetchJson<LeverJob[]>(`https://api.lever.co/v0/postings/${key}?mode=json`)
  const jobs = data.map((job): NormalizedJob => ({
    externalId: job.id, title: job.text, location: job.categories?.location ?? null, workplaceType: job.workplaceType ?? null,
    department: job.categories?.team ?? null, employmentType: job.categories?.commitment ?? null, description: job.descriptionPlain ?? null,
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null, deadline: null, salaryMin: null, salaryMax: null,
    jobUrl: job.hostedUrl, applyUrl: job.applyUrl ?? job.hostedUrl, source: 'lever',
  }))
  return result('lever', key, careersUrl, jobs, 1)
}

export async function ashby(company: CompanyInput, key: string, careersUrl: string): Promise<AdapterResult> {
  type AshbyJob = { id: string; title: string; location?: string; workplaceType?: string; department?: string; employmentType?: string; descriptionPlain?: string; publishedAt?: string; jobUrl: string; applyUrl?: string; compensation?: { minValue?: number; maxValue?: number } }
  const data = await fetchJson<{ jobs: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${key}?includeCompensation=true`)
  const jobs = data.jobs.map((job): NormalizedJob => ({
    externalId: job.id, title: job.title, location: job.location ?? null, workplaceType: job.workplaceType ?? null,
    department: job.department ?? null, employmentType: job.employmentType ?? null, description: job.descriptionPlain ?? null,
    postedAt: asIsoDate(job.publishedAt), deadline: null, salaryMin: job.compensation?.minValue ?? null,
    salaryMax: job.compensation?.maxValue ?? null, jobUrl: job.jobUrl, applyUrl: job.applyUrl ?? job.jobUrl, source: 'ashby',
  }))
  return result('ashby', key, careersUrl, jobs, 1)
}

export async function smartRecruiters(company: CompanyInput, key: string, careersUrl: string, options?: AdapterOptions): Promise<AdapterResult> {
  type SmartJob = { id: string; name: string; ref?: string; releasedDate?: string; location?: { city?: string; region?: string; country?: string; remote?: boolean }; department?: { label?: string }; typeOfEmployment?: { label?: string } }
  const jobs: NormalizedJob[] = []
  let offset = 0
  let pages = 0
  const maxPages = options?.policy.structuredMaxPages ?? 100
  let totalFound = 0
  while (jobs.length < STRUCTURED_LIMIT && pages < maxPages) {
    const data = await fetchJson<{ content: SmartJob[]; totalFound: number }>(`https://api.smartrecruiters.com/v1/companies/${key}/postings?limit=100&offset=${offset}`)
    pages++
    totalFound = data.totalFound
    for (const job of data.content) {
      const location = [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(', ') || null
      const url = `https://jobs.smartrecruiters.com/${key}/${job.id}`
      jobs.push({ externalId: job.id, title: job.name, location, workplaceType: job.location?.remote ? 'remote' : null,
        department: job.department?.label ?? null, employmentType: job.typeOfEmployment?.label ?? null, description: null,
        postedAt: asIsoDate(job.releasedDate), deadline: null, salaryMin: null, salaryMax: null, jobUrl: url, applyUrl: url, source: 'smartrecruiters' })
    }
    offset += data.content.length
    if (data.content.length === 0 || offset >= data.totalFound) break
  }
  return result('smartrecruiters', key, careersUrl, jobs, pages, pages >= maxPages && jobs.length < totalFound)
}

export async function workday(company: CompanyInput, key: string, careersUrl: string, options?: AdapterOptions): Promise<AdapterResult> {
  const [tenant, site] = key.split(':')
  if (!tenant || !site) throw new Error('Workday source key must be tenant:site')
  const origin = new URL(careersUrl).origin
  type WorkdayJob = { title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[] }
  const jobs: NormalizedJob[] = []
  let offset = 0
  let pages = 0
  const maxPages = options?.policy.structuredMaxPages ?? 100
  let totalFound = 0
  while (jobs.length < STRUCTURED_LIMIT && pages < maxPages) {
    const data = await fetchJson<{ jobPostings: WorkdayJob[]; total: number }>(`${origin}/wday/cxs/${tenant}/${site}/jobs`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: '' }),
    })
    pages++
    totalFound = data.total
    for (const job of data.jobPostings) {
      const url = absoluteUrl(job.externalPath, origin)!
      jobs.push({ externalId: job.externalPath.split('/').filter(Boolean).at(-1) ?? job.externalPath, title: job.title,
        location: job.locationsText ?? job.bulletFields?.[0] ?? null, workplaceType: null, department: null,
        employmentType: null, description: null, postedAt: asIsoDate(job.postedOn), deadline: null, salaryMin: null,
        salaryMax: null, jobUrl: url, applyUrl: url, source: 'workday' })
    }
    offset += data.jobPostings.length
    if (data.jobPostings.length === 0 || offset >= data.total) break
  }
  return result('workday', key, careersUrl, jobs, pages, pages >= maxPages && jobs.length < totalFound)
}

export async function apple(company: CompanyInput, careersUrl: string, options?: AdapterOptions): Promise<AdapterResult> {
  type AppleJob = { id: string; positionId?: string; postingTitle: string; jobSummary?: string; postingDate?: string; transformedPostingTitle?: string; locations?: Array<{ name?: string }>; team?: { teamName?: string }; type?: string }
  const base = 'https://jobs.apple.com'
  const browserHeaders = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    origin: base,
    referer: `${base}/en-us/search`,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  }
  const csrfResponse = await fetch(`${base}/api/v1/CSRFToken`, { headers: browserHeaders })
  if (!csrfResponse.ok) throw new Error(`${csrfResponse.status} ${csrfResponse.statusText} from Apple CSRF endpoint`)
  const csrf = csrfResponse.headers.get('X-Apple-CSRF-Token') ?? ''
  const cookie = csrfResponse.headers.get('set-cookie')?.split(';')[0] ?? ''
  const jobs: NormalizedJob[] = []
  let pages = 0
  const maxPages = options?.policy.structuredMaxPages ?? 100
  const locationFilters = options ? appleLocationFilters(options.targetingProfile.locations) : []
  const profileQueries = options
    ? [...new Set([...options.targetingProfile.target_titles, ...options.targetingProfile.adjacent_titles].map((value) => value.trim()).filter(Boolean))]
    : []
  const queries = profileQueries.length > 0 ? profileQueries : ['']
  let limitReached = false
  for (let queryIndex = 0; queryIndex < queries.length && jobs.length < STRUCTURED_LIMIT; queryIndex++) {
    let page = 1
    let fetched = 0
    let total = Number.POSITIVE_INFINITY
    while (fetched < total && jobs.length < STRUCTURED_LIMIT && pages < maxPages) {
      const response = await fetchJson<{ res?: { searchResults: AppleJob[]; totalRecords: number }; searchResults?: AppleJob[]; totalRecords?: number }>(`${base}/api/v1/search`, {
        method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json', locale: 'en_US', browserlocale: 'en_US', cookie, 'X-Apple-CSRF-Token': csrf },
        body: JSON.stringify({ query: queries[queryIndex], filters: locationFilters.length > 0 ? { locations: locationFilters } : {}, page, locale: 'en-us',
          sort: queries[queryIndex] ? 'relevance' : 'newest', format: { longDate: 'MMMM D, YYYY', mediumDate: 'MMM D, YYYY' } }),
      })
      const data = response.res ?? response
      const found = data.searchResults ?? []
      total = data.totalRecords ?? found.length
      fetched += found.length
      pages++
      for (const job of found) {
        const id = job.positionId ?? job.id.replace(/^PIPE-/, '')
        const slug = job.transformedPostingTitle ?? job.postingTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const url = `${base}/en-us/details/${id}/${slug}`
        jobs.push({ externalId: id, title: job.postingTitle, location: job.locations?.map((item) => item.name).filter(Boolean).join(', ') || null,
          workplaceType: null, department: job.team?.teamName ?? null, employmentType: job.type ?? null, description: job.jobSummary ?? null,
          postedAt: asIsoDate(job.postingDate), deadline: null, salaryMin: null, salaryMax: null, jobUrl: url, applyUrl: url, source: 'apple' })
      }
      if (found.length === 0) break
      page++
    }
    if (pages >= maxPages && (fetched < total || queryIndex < queries.length - 1)) limitReached = true
  }
  return result('apple', 'apple', careersUrl, jobs, pages, limitReached)
}

type JsonLd = Record<string, unknown>

export function jsonLdToJob(data: JsonLd, base: string): NormalizedJob | null {
  const type = data['@type']
  if (type !== 'JobPosting') return null
  const title = text(data.title)
  const url = absoluteUrl(typeof data.url === 'string' ? data.url : base, base)
  if (!title || !url) return null
  const locationData = data.jobLocation as { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } } | Array<{ address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } }> | undefined
  const locationItems = Array.isArray(locationData) ? locationData : locationData ? [locationData] : []
  const location = locationItems.map((item) => [item.address?.addressLocality, item.address?.addressRegion, item.address?.addressCountry].filter(Boolean).join(', ')).filter(Boolean).join(' · ') || null
  const identifier = data.identifier as { value?: unknown } | undefined
  return { externalId: text(identifier?.value) ?? text(data['@id']), title, location, workplaceType: text(data.jobLocationType),
    department: text(data.industry), employmentType: Array.isArray(data.employmentType) ? data.employmentType.join(', ') : text(data.employmentType),
    description: text(data.description), postedAt: asIsoDate(data.datePosted), deadline: asIsoDate(data.validThrough), salaryMin: null,
    salaryMax: null, jobUrl: url, applyUrl: url, source: 'custom' }
}

export function classifyCareerLink(pathname: string, label: string, rel: string, profile: AdapterOptions['targetingProfile']): 'listing' | 'job' | null {
  const signal = `${pathname} ${label}`.toLowerCase()
  if (rel === 'next' || /next|load more|show more|page \d+/.test(signal)) return 'listing'
  if (/\/(?:search|careers?|jobs?|openings?|opportunities)\/?$/.test(pathname.toLowerCase()) ||
      /^(?:search|find|view|browse|explore|see|all|open)\b.*\b(?:jobs?|roles?|positions?|openings?|opportunities)\b/i.test(label.trim())) return 'listing'
  const looksLikeDetail = /\/(?:jobs?|positions?|openings?|roles?)\/[^/]+/i.test(pathname) || /job|career|position|opening|vacanc|role/.test(signal)
  return looksLikeDetail && label.trim().length > 2 && titleMayMatch(label, profile) ? 'job' : null
}

export function extractJobsFromHtml(html: string, url: string, fallbackTitle?: string): NormalizedJob[] {
  const $ = load(html)
  const jobs: NormalizedJob[] = []
  $('script[type="application/ld+json"]').each((_index, node) => {
    try {
      const parsed = JSON.parse($(node).text()) as JsonLd | JsonLd[] | { '@graph'?: JsonLd[] }
      const values = Array.isArray(parsed) ? parsed : Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]
      for (const value of values) {
        const job = jsonLdToJob(value, url)
        if (job) jobs.push(job)
      }
    } catch { /* Invalid third-party JSON-LD is ignored. */ }
  })
  if (jobs.length > 0) return jobs
  const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || fallbackTitle?.trim()
  if (!title) return []
  const description = $('meta[property="og:description"]').attr('content')?.trim() || $('meta[name="description"]').attr('content')?.trim() || $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20_000) || null
  return [{ externalId: url, title, location: null, workplaceType: null, department: null, employmentType: null,
    description, postedAt: null, deadline: null, salaryMin: null, salaryMax: null, jobUrl: url, applyUrl: url, source: 'custom' }]
}

export async function custom(company: CompanyInput, careersUrl: string, options?: AdapterOptions): Promise<AdapterResult> {
  const queue = await RequestQueue.open(`company-${company.id}-${Date.now()}`)
  await queue.addRequest({ url: careersUrl, userData: { kind: 'listing' } })
  const jobs: NormalizedJob[] = []
  const jobCandidates = new Map<string, string>()
  const origin = new URL(careersUrl).origin
  const started = Date.now()
  let pagesVisited = 0
  let listingPages = 0
  let stoppedByLimit = false

  const crawler = new PlaywrightCrawler({
    requestQueue: queue,
    maxConcurrency: 3,
    maxRequestsPerCrawl: (options?.policy.genericMaxListingPages ?? 20) + (options?.policy.genericMaxJobs ?? 200),
    requestHandlerTimeoutSecs: 60,
    async requestHandler({ page, request }) {
      const policy = options?.policy
      if (Date.now() - started > (policy?.genericMaxSeconds ?? 180) * 1000 || jobs.length >= (policy?.genericMaxJobs ?? 200) || listingPages >= (policy?.genericMaxListingPages ?? 20)) {
        stoppedByLimit = true
        return
      }
      pagesVisited++
      if (request.userData.kind === 'listing') listingPages++

      if (request.userData.kind === 'listing' && options) {
        const query = options.targetingProfile.target_titles[0] ?? options.targetingProfile.adjacent_titles[0]
        if (query) {
          const searchInput = page.locator([
            'input[name="base_query"]', 'input[name*="keyword" i]', 'input[placeholder*="search for jobs" i]',
            'input[placeholder*="job title" i]', 'input[aria-label*="search jobs" i]', 'input[type="search"]',
          ].join(', ')).first()
          if (await searchInput.isVisible().catch(() => false)) {
            const current = await searchInput.inputValue().catch(() => '')
            if (!current.toLowerCase().includes(query.toLowerCase())) {
              await searchInput.fill(query)
              await searchInput.press('Enter').catch(() => undefined)
              await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined)
            }
          }
        }
        const currentUrl = new URL(page.url())
        const hasSearchQuery = ['base_query', 'query', 'q', 'keyword', 'search'].some((key) => currentUrl.searchParams.has(key))
        const hasSortUi = await page.getByText(/sort by/i).first().isVisible().catch(() => false)
        if (hasSearchQuery && hasSortUi && !currentUrl.searchParams.has('sort')) {
          currentUrl.searchParams.set('sort', 'recent')
          await page.goto(currentUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
        }
        await page.waitForSelector('a[href*="/job/"], a[href*="/jobs/"]', { timeout: 5_000 }).catch(() => undefined)
      }

      for (let i = 0; i < 5; i++) {
        const button = page.getByRole('button', { name: /load more|show more|more jobs/i }).first()
        if (await button.isVisible().catch(() => false)) await button.click().catch(() => undefined)
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await page.waitForTimeout(250)
      }

      const extracted = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((node) => node.textContent ?? '')
        const links = Array.from(document.querySelectorAll('a[href]')).map((node) => ({ href: (node as HTMLAnchorElement).href, text: node.textContent?.trim() ?? '', rel: node.getAttribute('rel') ?? '' }))
        return { scripts, links, h1: document.querySelector('h1')?.textContent?.trim() ?? '', body: document.body.innerText.slice(0, 20_000) }
      })
      let foundStructured = false
      for (const raw of extracted.scripts) {
        try {
          const parsed = JSON.parse(raw) as JsonLd | JsonLd[] | { '@graph'?: JsonLd[] }
          const values = Array.isArray(parsed) ? parsed : Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]
          for (const value of values) {
            const job = jsonLdToJob(value, request.url)
            if (job) { jobs.push(job); foundStructured = true }
          }
        } catch { /* Invalid third-party JSON-LD is ignored. */ }
      }
      if (!foundStructured && request.userData.kind === 'job' && extracted.h1) {
        jobs.push({ externalId: request.url, title: extracted.h1, location: null, workplaceType: null, department: null,
          employmentType: null, description: extracted.body, postedAt: null, deadline: null, salaryMin: null, salaryMax: null,
          jobUrl: request.url, applyUrl: request.url, source: 'custom' })
      }

      for (const link of extracted.links) {
        let parsed: URL
        try { parsed = new URL(link.href, request.url) } catch { continue }
        if (parsed.origin !== origin) continue
        const kind = options ? classifyCareerLink(parsed.pathname, link.text, link.rel, options.targetingProfile) : null
        if (kind === 'listing') {
          await queue.addRequest({ url: parsed.toString(), userData: { kind: 'listing' } })
        } else if (kind === 'job') {
          jobCandidates.set(parsed.toString(), link.text)
        }
      }
    },
  })
  await crawler.run()
  const maxJobs = options?.policy.genericMaxJobs ?? 200
  const candidates = [...jobCandidates.entries()].slice(0, maxJobs)
  if (jobCandidates.size > maxJobs) stoppedByLimit = true
  for (let index = 0; index < candidates.length; index += 10) {
    if (Date.now() - started > (options?.policy.genericMaxSeconds ?? 180) * 1000) { stoppedByLimit = true; break }
    const details = await Promise.all(candidates.slice(index, index + 10).map(async ([url, fallbackTitle]) => {
      try {
        const response = await fetch(url, { redirect: 'follow' })
        if (!response.ok) return []
        pagesVisited++
        return extractJobsFromHtml(await response.text(), response.url || url, fallbackTitle)
      } catch { return [] }
    }))
    jobs.push(...details.flat())
  }
  const deduped = dedupeJobs(jobs).slice(0, options?.policy.genericMaxJobs ?? 200)
  return { status: stoppedByLimit ? 'partial' : 'succeeded', detectedSource: 'custom', detectedSourceKey: null,
    careersUrl, pagesVisited, jobsDiscovered: deduped.length, jobsFound: deduped.length, stopReason: stoppedByLimit ? 'generic crawl safety limit reached' : 'complete',
    error: null, jobs: deduped }
}

export async function runAdapter(company: CompanyInput, source: SourceType, key: string | null, careersUrl: string, options: AdapterOptions): Promise<AdapterResult> {
  if (source === 'greenhouse' && key) return greenhouse(company, key, careersUrl)
  if (source === 'lever' && key) return lever(company, key, careersUrl)
  if (source === 'ashby' && key) return ashby(company, key, careersUrl)
  if (source === 'workday' && key) return workday(company, key, careersUrl, options)
  if (source === 'smartrecruiters' && key) return smartRecruiters(company, key, careersUrl, options)
  if (source === 'apple') return apple(company, careersUrl, options)
  if (source === 'custom') return custom(company, careersUrl, options)
  throw new Error(`${source} requires a source key`)
}
