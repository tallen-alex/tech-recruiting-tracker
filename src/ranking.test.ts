import { describe, expect, it } from 'vitest'
import { isJobEligible, isTargetingProfileReady, parseTargetingProfile, scoreDeterministicJob } from './ranking'

const targeting = parseTargetingProfile({
  target_titles: ['Product Manager'], adjacent_titles: ['Program Manager'], seniority: ['Senior'],
  skills: ['analytics', 'APIs'], excluded_titles: ['Intern'], locations: ['Remote', 'Austin'],
})

describe('deterministic relevance ranking', () => {
  it('ranks a target title with matching skills and location strongly', () => {
    const result = scoreDeterministicJob(targeting, { title: 'Senior Product Manager', location: 'Austin, TX', remote: null,
      description: 'Own API products and use analytics to shape the roadmap.' })
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.reason).toContain('target title')
  })

  it('keeps but down-ranks excluded and mismatched jobs', () => {
    const result = scoreDeterministicJob(targeting, { title: 'Retail Intern', location: 'Paris', remote: null, description: null })
    expect(result.score).toBe(0)
  })

  it('sanitizes malformed targeting payloads', () => {
    expect(parseTargetingProfile({ target_titles: ['Product Manager', 42], skills: 'APIs' })).toMatchObject({
      target_titles: ['Product Manager'], skills: [],
    })
  })

  it('skips location scoring for pre-vetted boards', () => {
    const job = { title: 'Product Manager', location: 'New York - NY', remote: null, description: null }
    const scored = scoreDeterministicJob(targeting, job)
    const ignored = scoreDeterministicJob(targeting, job, { ignoreLocation: true })
    // "New York - NY" never matches a "United States" preference, so the default path penalises it.
    expect(scored.reason).toContain('location differs')
    expect(ignored.reason).not.toContain('location')
    expect(ignored.score).toBeGreaterThan(scored.score)
  })

  it('requires titles and locations before a scrape can start', () => {
    expect(isTargetingProfileReady(targeting)).toBe(true)
    expect(isTargetingProfileReady(parseTargetingProfile({ target_titles: ['Product Manager'] }))).toBe(false)
  })

  it('rejects unrelated, excluded, old, and out-of-location jobs before storage', () => {
    expect(isJobEligible(targeting, { title: 'Product Manager', location: 'Austin, TX', remote: null, postedAt: new Date().toISOString() }).eligible).toBe(true)
    expect(isJobEligible(targeting, { title: 'Software Engineer', location: 'Austin, TX', remote: null, postedAt: null }).eligible).toBe(false)
    expect(isJobEligible(targeting, { title: 'Product Manager Intern', location: 'Austin, TX', remote: null, postedAt: null }).eligible).toBe(false)
    expect(isJobEligible(targeting, { title: 'Product Manager', location: 'Paris', remote: null, postedAt: null }).eligible).toBe(false)
    expect(isJobEligible(targeting, { title: 'Product Manager', location: 'Austin, TX', remote: null, postedAt: '2020-01-01' }).eligible).toBe(false)
  })
})
