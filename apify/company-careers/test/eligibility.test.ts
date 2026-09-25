import { describe, expect, it } from 'vitest'
import { DEFAULT_SCAN_POLICY, appleLocationFilters, evaluateEligibility, titleMayMatch } from '../src/eligibility.js'
import type { NormalizedJob, TargetingProfile } from '../src/types.js'

const profile: TargetingProfile = {
  target_titles: ['Product Manager'], adjacent_titles: ['Product Owner'], seniority: [], skills: [],
  excluded_titles: ['Product Marketing'], locations: ['United States', 'Remote'],
}
const job = (overrides: Partial<NormalizedJob> = {}): NormalizedJob => ({
  externalId: '1', title: 'Product Manager', location: 'Austin, United States', workplaceType: null,
  department: null, employmentType: null, description: null, postedAt: new Date().toISOString(), deadline: null,
  salaryMin: null, salaryMax: null, jobUrl: 'https://example.com/1', applyUrl: null, source: 'custom', ...overrides,
})

describe('generic pre-storage eligibility', () => {
  it('requires a target or adjacent title and an allowed location', () => {
    expect(evaluateEligibility(job(), profile, DEFAULT_SCAN_POLICY).eligible).toBe(true)
    expect(evaluateEligibility(job({ title: 'Software Engineer' }), profile, DEFAULT_SCAN_POLICY).eligible).toBe(false)
    expect(evaluateEligibility(job({ location: 'Paris, France' }), profile, DEFAULT_SCAN_POLICY).eligible).toBe(false)
  })

  it('applies exclusions and age limits before storage', () => {
    expect(evaluateEligibility(job({ title: 'Product Marketing Manager' }), profile, DEFAULT_SCAN_POLICY).eligible).toBe(false)
    expect(evaluateEligibility(job({ postedAt: '2020-01-01' }), profile, DEFAULT_SCAN_POLICY).eligible).toBe(false)
  })

  it('uses the same title gate for generic detail-page discovery', () => {
    expect(titleMayMatch('Senior Product Manager, Platform', profile)).toBe(true)
    expect(titleMayMatch('Product Marketing Manager', profile)).toBe(false)
  })

  it('maps common preferred countries to Apple source filters', () => {
    expect(appleLocationFilters(['United States', 'Canada', 'Remote'])).toEqual(['postLocation-USA', 'postLocation-CAN'])
  })
})
