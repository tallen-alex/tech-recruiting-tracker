import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apple, ashby, classifyCareerLink, extractJobsFromHtml, greenhouse, jsonLdToJob, lever, smartRecruiters, workday } from '../src/adapters.js'
import type { CompanyInput } from '../src/types.js'

const fixture = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)), 'utf8'))
const company: CompanyInput = { id: 1, name: 'Acme', sourceType: null, sourceKey: null, careersUrl: null }

afterEach(() => vi.unstubAllGlobals())

describe('structured adapters', () => {
  it.each([
    ['greenhouse', () => greenhouse(company, 'acme', 'https://boards.greenhouse.io/acme'), 'greenhouse.json', 'Product Manager'],
    ['lever', () => lever(company, 'acme', 'https://jobs.lever.co/acme'), 'lever.json', 'Technical Product Manager'],
    ['ashby', () => ashby(company, 'acme', 'https://jobs.ashbyhq.com/acme'), 'ashby.json', 'Senior Product Manager'],
    ['smartrecruiters', () => smartRecruiters(company, 'acme', 'https://careers.smartrecruiters.com/acme'), 'smartrecruiters.json', 'Platform Product Manager'],
    ['workday', () => workday(company, 'acme:Careers', 'https://acme.wd5.myworkdayjobs.com/Careers'), 'workday.json', 'Product Manager, Platform'],
  ])('normalizes %s responses', async (_provider, execute, file, title) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture(file)), { status: 200 })))
    const response = await execute()
    expect(response.status).toBe('succeeded')
    expect(response.jobs).toHaveLength(1)
    expect(response.jobs[0].title).toBe(title)
  })

  it('paginates Apple until a Product Manager result is found', async () => {
    const pageOne = { res: { searchResults: Array.from({ length: 20 }, (_, index) => ({ id: `PIPE-${index}`, positionId: String(index), postingTitle: `Other role ${index}` })), totalRecords: 21 } }
    const pageTwo = fixture('apple-page-2.json')
    const mocked = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/CSRFToken')) return new Response('{}', { headers: { 'X-Apple-CSRF-Token': 'token' } })
      const page = JSON.parse(String(init?.body)).page
      return new Response(JSON.stringify(page === 1 ? pageOne : pageTwo), { status: 200 })
    })
    vi.stubGlobal('fetch', mocked)
    const response = await apple(company, 'https://jobs.apple.com/en-us/search')
    expect(response.pagesVisited).toBe(2)
    expect(response.jobs.some((job) => job.title === 'Product Manager, Internet Apps')).toBe(true)
    const searchRequest = mocked.mock.calls.find(([url]) => String(url).endsWith('/search'))
    expect(new Headers(searchRequest?.[1]?.headers).get('locale')).toBe('en_US')
  })

  it('uses relevance sorting for profile-targeted Apple searches', async () => {
    const mocked = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/CSRFToken')) return new Response('{}', { headers: { 'X-Apple-CSRF-Token': 'token' } })
      return new Response(JSON.stringify({ res: { searchResults: [], totalRecords: 0 } }))
    })
    vi.stubGlobal('fetch', mocked)
    await apple(company, 'https://jobs.apple.com/en-us/search', { targetingProfile: { target_titles: ['Product Manager'], adjacent_titles: [], seniority: [], skills: [], excluded_titles: [], locations: ['United States'] },
      policy: { maxAgeDays: 90, maxStoredJobsPerCompany: 250, structuredMaxPages: 5, genericMaxListingPages: 20, genericMaxJobs: 200, genericMaxSeconds: 180 } })
    const request = mocked.mock.calls.find(([url]) => String(url).endsWith('/search'))
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ query: 'Product Manager', sort: 'relevance', filters: { locations: ['postLocation-USA'] } })
  })

  it('marks structured inventories partial when the 10,000-job cap is exceeded', async () => {
    const jobs = Array.from({ length: 10_001 }, (_, id) => ({
      id,
      title: `Role ${id}`,
      absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`,
    }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ jobs }), { status: 200 })))
    const response = await greenhouse(company, 'acme', 'https://boards.greenhouse.io/acme')
    expect(response).toMatchObject({ status: 'partial', jobsFound: 10_000, stopReason: 'structured job limit reached' })
  })

  it('paginates Workday inventories', async () => {
    const mocked = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const offset = JSON.parse(String(init?.body)).offset
      const jobPostings = offset === 0
        ? [{ title: 'Product Manager', externalPath: '/job/pm-1' }]
        : [{ title: 'Technical Product Manager', externalPath: '/job/pm-2' }]
      return new Response(JSON.stringify({ jobPostings, total: 2 }), { status: 200 })
    })
    vi.stubGlobal('fetch', mocked)
    const response = await workday(company, 'acme:Careers', 'https://acme.wd5.myworkdayjobs.com/Careers')
    expect(response.pagesVisited).toBe(2)
    expect(response.jobs.map((job) => job.externalId)).toEqual(['pm-1', 'pm-2'])
  })
})

describe('generic JSON-LD', () => {
  it('normalizes a public JobPosting without an LLM', () => {
    const job = jsonLdToJob({ '@type': 'JobPosting', identifier: { value: 'job-7' }, title: 'Product Manager',
      url: '/jobs/7', datePosted: '2026-08-01', jobLocation: { address: { addressLocality: 'Austin', addressRegion: 'TX' } } }, 'https://example.com/careers')
    expect(job).toMatchObject({ externalId: 'job-7', title: 'Product Manager', location: 'Austin, TX', jobUrl: 'https://example.com/jobs/7' })
  })

  it('follows generic search navigation without requiring its label to match a target title', () => {
    const profile = { target_titles: ['Product Manager'], adjacent_titles: [], seniority: [], skills: [], excluded_titles: [], locations: ['United States'] }
    expect(classifyCareerLink('/en/search', 'Search for jobs', '', profile)).toBe('listing')
    expect(classifyCareerLink('/en/jobs/10490981/product-manager', '2027 ALA - Product Manager', '', profile)).toBe('job')
    expect(classifyCareerLink('/en/jobs/123/software-engineer', 'Software Engineer', '', profile)).toBeNull()
  })

  it('extracts a non-JSON-LD job detail using its heading and metadata', () => {
    const [job] = extractJobsFromHtml('<html><head><meta property="og:description" content="Build products"></head><body><h1>Product Manager</h1></body></html>', 'https://example.com/jobs/7')
    expect(job).toMatchObject({ title: 'Product Manager', description: 'Build products', jobUrl: 'https://example.com/jobs/7' })
  })
})
