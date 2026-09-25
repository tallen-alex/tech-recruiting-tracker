import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectCompanySource, detectFromUrl, discoverStructuredSource, sourceKeyFromUrl } from '../src/detect.js'

afterEach(() => vi.unstubAllGlobals())

describe('source detection', () => {
  it.each([
    ['https://boards.greenhouse.io/stripe', 'greenhouse'], ['https://jobs.lever.co/netflix', 'lever'],
    ['https://jobs.ashbyhq.com/notion', 'ashby'], ['https://acme.wd5.myworkdayjobs.com/Careers', 'workday'],
    ['https://careers.smartrecruiters.com/Visa', 'smartrecruiters'], ['https://jobs.apple.com/en-us/search', 'apple'],
  ])('detects %s', (url, expected) => expect(detectFromUrl(url)).toBe(expected))

  it('extracts a Workday tenant and site', () => {
    expect(sourceKeyFromUrl('workday', 'https://acme.wd5.myworkdayjobs.com/en-US/Careers')).toBe('acme:Careers')
  })

  it('discovers an Ashby board for a name-only company', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const jobs = String(url).includes('ashbyhq.com/posting-api/job-board/strava') ? [{ id: 'job-1' }] : []
      return new Response(JSON.stringify(String(url).includes('lever.co') ? jobs : { jobs }), { status: 200 })
    }))
    await expect(detectCompanySource({ id: 1, name: 'Strava', sourceType: null, sourceKey: null, careersUrl: null }))
      .resolves.toEqual({ source: 'ashby', sourceKey: 'strava', careersUrl: 'https://jobs.ashbyhq.com/strava' })
  })

  it('can exclude a stale saved source while looking for a replacement', async () => {
    const mocked = vi.fn(async (url: string | URL | Request) => {
      const jobs = String(url).includes('ashbyhq.com/posting-api/job-board/whoop') ? [{ id: 'job-1' }] : []
      return new Response(JSON.stringify({ jobs }), { status: 200 })
    })
    vi.stubGlobal('fetch', mocked)
    await expect(discoverStructuredSource({ id: 2, name: 'WHOOP', sourceType: 'lever', sourceKey: 'whoop', careersUrl: null }, new Set(['lever'])))
      .resolves.toMatchObject({ source: 'ashby', sourceKey: 'whoop' })
    expect(mocked.mock.calls.some(([url]) => String(url).includes('lever.co'))).toBe(false)
  })
})
