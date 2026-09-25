import { describe, expect, it } from 'vitest'
import { classifySponsorship } from './sponsorship'

const from = (description: string | null, workAuthRaw: string | null = null) =>
  classifySponsorship({ description, workAuthRaw })

describe('sponsorship classification', () => {
  it('flags unambiguous refusals in the description', () => {
    expect(from('We are unable to sponsor visas for this role.').sponsorship).toBe('not_sponsored')
    expect(from('The company will not sponsor applicants now or in the future.').sponsorship).toBe('not_sponsored')
    expect(from('Visa sponsorship is not available for this position.').sponsorship).toBe('not_sponsored')
    expect(from('Candidates must be able to work without the need for sponsorship.').sponsorship).toBe('not_sponsored')
  })

  it('flags explicit offers of sponsorship', () => {
    expect(from('Visa sponsorship is available for exceptional candidates.').sponsorship).toBe('sponsored')
    expect(from('We sponsor H-1B visas for this role.').sponsorship).toBe('sponsored')
    expect(from('We are open to candidates requiring sponsorship.').sponsorship).toBe('sponsored')
  })

  it('does not treat "must be authorized to work" as a refusal', () => {
    // Students on OPT/CPT are authorized, so this wording says nothing about sponsorship.
    // Reading it as a refusal would wrongly hide eligible roles.
    expect(from('Applicants must be legally authorized to work in the United States.').sponsorship).toBe('unclear')
    expect(from('You must have work authorization in the US.').sponsorship).toBe('unclear')
  })

  it('lets a refusal override an offer when a posting contains both', () => {
    const verdict = from('We sponsor visas across many teams. For this specific role we will not sponsor.')
    expect(verdict.sponsorship).toBe('not_sponsored')
  })

  it('falls back to the board field only when the description is silent', () => {
    expect(from(null, 'Visa sponsorship not available').sponsorship).toBe('not_sponsored')
    expect(from('A normal description with no mention.', 'sponsorship available').sponsorship).toBe('sponsored')
    // Description wins over a contradicting board field.
    expect(from('We will not sponsor for this role.', 'sponsorship available').sponsorship).toBe('not_sponsored')
  })

  it('returns unclear with no evidence when nothing is stated', () => {
    const verdict = from('Great role building products with a talented team.', null)
    expect(verdict.sponsorship).toBe('unclear')
    expect(verdict.evidence).toBeNull()
  })

  it('always attaches evidence to a non-unclear verdict', () => {
    const verdict = from('Please note: we are unable to sponsor employment visas at this time.')
    expect(verdict.sponsorship).toBe('not_sponsored')
    expect(verdict.evidence).toContain('unable to sponsor')
  })

  it('tolerates punctuation, casing, and smart quotes', () => {
    expect(from('WE WILL NOT SPONSOR — now or in the future!').sponsorship).toBe('not_sponsored')
    expect(from('Sponsorship  is   not available.').sponsorship).toBe('not_sponsored')
  })
})
