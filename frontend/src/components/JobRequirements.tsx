import { formatExperience } from '../lib/jobs'
import type { ExperienceRequirement } from '../types'

/** Years of experience, with the posting's own wording on hover so the number can be checked. */
export function ExperienceCell({ experience }: { experience: ExperienceRequirement | null }) {
  return (
    <span
      className={`whitespace-nowrap font-mono ${experience ? 'text-text' : 'text-text-faint'}`}
      title={experience ? `“${experience.evidence}”` : 'The posting does not state years of experience.'}
    >
      {formatExperience(experience) ?? '—'}
    </span>
  )
}
