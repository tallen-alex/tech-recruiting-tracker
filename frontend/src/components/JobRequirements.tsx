import { ChevronDownIcon } from './icons'
import type { ExperienceRequirement, Job } from '../types'

function formatExperience(experience: ExperienceRequirement | null): string {
  if (!experience) return '—'
  return experience.max ? `${experience.min}–${experience.max} yrs` : `${experience.min}+ yrs`
}

/** Years of experience, with the posting's own wording on hover so the number can be checked. */
export function ExperienceCell({ experience }: { experience: ExperienceRequirement | null }) {
  return (
    <span
      className={`whitespace-nowrap font-mono ${experience ? 'text-text' : 'text-text-faint'}`}
      title={experience ? `“${experience.evidence}”` : 'The posting does not state years of experience.'}
    >
      {formatExperience(experience)}
    </span>
  )
}

/** Disclosure under the job title. Hidden when there is no description to show at all. */
export function RequirementsToggle({ job, open, onToggle }: { job: Job; open: boolean; onToggle: () => void }) {
  if (!job.description) return null
  const count = job.requirements.length
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`job-requirements-${job.id}`}
      className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs text-accent hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent"
    >
      <ChevronDownIcon width={12} height={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
      {count > 0 ? `Requirements (${count})` : 'Description'}
    </button>
  )
}

/** Full-width row rendered directly under a job's row while its disclosure is open. */
export function RequirementsRow({ job, colSpan }: { job: Job; colSpan: number }) {
  return (
    <tr id={`job-requirements-${job.id}`} className="border-b border-border bg-panel last:border-0">
      <td colSpan={colSpan} className="px-3 pb-4 pt-1">
        <div className="max-w-3xl pl-1">
          {job.experience && (
            <p className="mb-2 text-sm text-text-secondary">
              <span className="font-medium text-text">Experience:</span> {formatExperience(job.experience)}
              <span className="text-text-faint"> — “{job.experience.evidence}”</span>
            </p>
          )}
          {job.requirements.length > 0 ? (
            <>
              <p className="mb-1 text-xs uppercase tracking-wide text-text-faint">What they're asking for</p>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-5 text-text-secondary">
                {job.requirements.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="mb-1 text-xs text-text-faint">No qualifications list found in this posting — here's how it starts.</p>
              <p className="line-clamp-6 whitespace-pre-line text-sm leading-5 text-text-secondary">{job.description}</p>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
