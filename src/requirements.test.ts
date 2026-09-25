import { describe, expect, it } from 'vitest'
import { extractExperience, extractJobRequirements, extractRequirementItems } from './requirements'

const BULLETED = `At WHOOP, we're on a mission to unlock human performance.

RESPONSIBILITIES:

 - Own the strategy and roadmap for key monetization experiences.
 - Partner with Engineering and Design.

QUALIFICATIONS:

 - 4+ years of product management experience, ideally in consumer subscription businesses.
 - Strong quantitative skills; comfortable with SQL.
 - MBA or equivalent experience preferred.

Preferred Qualifications:
 - Experience with mobile apps.

WHAT WE OFFER:
 - Competitive salary and equity.`

describe('requirement items', () => {
  it('takes the bullets under a qualifications heading and stops at the next section', () => {
    expect(extractRequirementItems(BULLETED)).toEqual([
      '4+ years of product management experience, ideally in consumer subscription businesses.',
      'Strong quantitative skills; comfortable with SQL.',
      'MBA or equivalent experience preferred.',
      'Experience with mobile apps.',
    ])
  })

  it('skips responsibilities that come before the requirements', () => {
    expect(extractRequirementItems(BULLETED).join(' ')).not.toContain('monetization experiences')
  })

  it('handles descriptions flattened to one line with inline bullets', () => {
    const flat =
      'About the role You will lead strategy projects. Requirements: • MBA candidate graduating in 2027 • 3-5 years of consulting or strategy experience • Excellent communication skills Benefits: • Health insurance'
    expect(extractRequirementItems(flat)).toEqual([
      'MBA candidate graduating in 2027',
      '3-5 years of consulting or strategy experience',
      'Excellent communication skills',
    ])
  })

  it('falls back to sentences when a flattened section has no bullets', () => {
    const flat = "What you'll need: A current MBA student. Prior experience in finance or consulting. About us We are a bank."
    expect(extractRequirementItems(flat)).toEqual(['A current MBA student.', 'Prior experience in finance or consulting.'])
  })

  it('ignores the word "requirements" used mid-sentence', () => {
    expect(extractRequirementItems('You will gather business requirements from stakeholders and ship features.')).toEqual([])
  })

  it('returns nothing when there is no recognizable section', () => {
    expect(extractRequirementItems('Join our team and build great things together.')).toEqual([])
  })
})

describe('years of experience', () => {
  it('reads "N+ years of experience"', () => {
    expect(extractExperience('You have 3+ years of experience in product.')).toMatchObject({ min: 3, max: null })
  })

  it('reads ranges and spelled-out numbers', () => {
    expect(extractExperience('Ideally 2-4 years of work experience.')).toMatchObject({ min: 2, max: 4 })
    expect(extractExperience('At least five years in a client-facing role.')).toMatchObject({ min: 5, max: null })
  })

  it('takes the headline requirement, not a narrower sub-ask after it', () => {
    expect(extractExperience('5+ years of product management experience, with at least 2+ years focused on health.')).toMatchObject({ min: 5 })
  })

  it('skips asks marked preferred when a required one is stated', () => {
    expect(extractExperience('7+ years preferred, but 5 years of relevant experience required.')).toMatchObject({ min: 5 })
    expect(extractExperience('Ideally 3+ years of consulting experience.')).toMatchObject({ min: 3 })
  })

  it('ignores years that describe the company', () => {
    expect(extractExperience('Founded 30 years ago, we are a 10 years old company with 5 years of growth.')).toBeNull()
    expect(extractExperience('Our team builds great customer experiences. Over the last 12 years, we have built 4.0+ star rated products.')).toBeNull()
  })

  it('keeps a listed field of experience whole in the evidence', () => {
    expect(extractExperience('3+ years of consulting, strategy, or finance experience before business school.')?.evidence).toBe(
      '3+ years of consulting, strategy, or finance experience before business school',
    )
  })

  it('keeps the matched phrase as evidence', () => {
    expect(extractExperience('Requires 4+ years of product management experience.')?.evidence).toBe(
      '4+ years of product management experience',
    )
  })
})

describe('extractJobRequirements', () => {
  it('handles a missing description', () => {
    expect(extractJobRequirements(null)).toEqual({ requirements: [], experience: null })
  })

  it('combines both extractions', () => {
    const result = extractJobRequirements(BULLETED)
    expect(result.experience).toMatchObject({ min: 4 })
    expect(result.requirements).toHaveLength(4)
  })
})
