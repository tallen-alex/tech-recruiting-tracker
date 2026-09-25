import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ExternalLinkIcon } from './icons'
import { StatusDot } from './StatusBadge'
import { formatDate, formatDateTime } from '../lib/format'
import {
  JOB_STATUSES,
  SPONSORSHIP_LABEL,
  daysUntil,
  dueAt,
  dueLabel,
  formatExperience,
  formatSalary,
  isDateOnly,
  jobStatusTone,
  matchScore,
  urgencyClass,
} from '../lib/jobs'
import type { Job } from '../types'

type Props = {
  jobs: Job[]
  selected: Job | null
  onSelect: (job: Job) => void
  onStatusChange: (job: Job, status: string) => void
  /** Sponsorship is only read for CMS postings, so other feeds hide the row rather than show "Not stated" everywhere. */
  showSponsorship?: boolean
  /** Shown in the detail pane when a posting has no description yet, e.g. how the CMS sync fetches them. */
  missingDescriptionHint?: string
}

/**
 * Master–detail layout for job feeds: a compact list on the left, the selected posting's full details on
 * the right (sticky, so it stays in view while the list scrolls). Below the lg breakpoint the detail
 * opens inline under the selected item instead. Up/Down arrows move the selection.
 */
export function JobSplitView({ jobs, selected, onSelect, onStatusChange, showSponsorship = false, missingDescriptionHint }: Props) {
  const listRef = useRef<HTMLUListElement>(null)

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = jobs.findIndex((job) => job.id === selected?.id)
    const next = jobs[Math.min(jobs.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    onSelect(next)
    listRef.current?.querySelector<HTMLButtonElement>(`[data-job-id="${next.id}"]`)?.focus()
  }

  const detail = (job: Job) => (
    <JobDetail
      key={job.id}
      job={job}
      onStatusChange={onStatusChange}
      showSponsorship={showSponsorship}
      missingDescriptionHint={missingDescriptionHint}
    />
  )

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ul ref={listRef} onKeyDown={onKeyDown} aria-label="Postings" className="overflow-hidden rounded-md border border-border">
        {jobs.map((job) => {
          const isSelected = job.id === selected?.id
          return (
            <li key={job.id} className="border-b border-border last:border-0">
              <JobListItem job={job} selected={isSelected} onSelect={() => onSelect(job)} />
              {isSelected && <div className="border-t border-border lg:hidden">{detail(job)}</div>}
            </li>
          )
        })}
      </ul>
      <aside
        aria-label="Posting details"
        className="hidden rounded-md border border-border lg:sticky lg:top-16 lg:block lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto"
      >
        {selected ? detail(selected) : <p className="p-6 text-sm text-text-secondary">Select a posting to see its details.</p>}
      </aside>
    </div>
  )
}

function DeadlineChip({ deadline, compact = false }: { deadline: string | null; compact?: boolean }) {
  const due = dueAt(deadline)
  if (!due) return null
  const days = daysUntil(due)
  // In the list only upcoming deadlines earn a chip; far-off dates are noise at that density.
  if (compact && (days < 0 || days > 7)) return null
  return (
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs leading-none ${urgencyClass(days)}`}>
      {dueLabel(due, days, isDateOnly(deadline))}
    </span>
  )
}

function JobListItem({ job, selected, onSelect }: { job: Job; selected: boolean; onSelect: () => void }) {
  const { score } = matchScore(job)
  const experience = formatExperience(job.experience)
  return (
    <button
      type="button"
      data-job-id={job.id}
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
        selected ? 'bg-accent-muted' : 'hover:bg-panel'
      }`}
    >
      {job.company_logo_url ? (
        <img
          src={job.company_logo_url}
          alt=""
          loading="lazy"
          decoding="async"
          className="mt-0.5 h-5 w-5 shrink-0 rounded-sm object-contain"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden'
          }}
        />
      ) : (
        <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium leading-5 text-text">{job.title}</span>
        <span className="mt-0.5 block truncate text-xs text-text-secondary">
          {job.company_name}
          {job.location ? ` · ${job.location}` : ''}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <DeadlineChip deadline={job.deadline} compact />
          {experience && <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs leading-none text-text-secondary">{experience}</span>}
          {job.status !== 'new' && (
            <span className="inline-flex items-center gap-1 text-xs text-text-faint">
              <StatusDot tone={jobStatusTone(job.status)} />
              {job.status}
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 font-mono text-sm text-text">{score != null ? `${Math.round(score)}%` : '—'}</span>
    </button>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{children}</dd>
    </div>
  )
}

function JobDetail({
  job,
  onStatusChange,
  showSponsorship,
  missingDescriptionHint,
}: {
  job: Job
  onStatusChange: (job: Job, status: string) => void
  showSponsorship: boolean
  missingDescriptionHint?: string
}) {
  const [fullDescription, setFullDescription] = useState(false)
  const { score, reason, detailed } = matchScore(job)
  const salary = formatSalary(job)
  const experience = formatExperience(job.experience)
  const sponsorship = SPONSORSHIP_LABEL[job.sponsorship ?? 'unclear'] ?? SPONSORSHIP_LABEL.unclear
  const meta = [job.location, job.remote, job.department, job.employment_type].filter(Boolean).join(' · ')
  const applyUrl = job.apply_url && job.apply_url !== job.url ? job.apply_url : null

  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {job.company_logo_url && (
          <img
            src={job.company_logo_url}
            alt=""
            className="h-9 w-9 shrink-0 rounded-sm object-contain"
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug text-text">{job.title}</h2>
          <p className="mt-0.5 text-sm text-text-secondary">{job.company_name}</p>
          {meta && <p className="mt-0.5 text-xs text-text-faint">{meta}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-text-secondary">
          <StatusDot tone={jobStatusTone(job.status)} />
          <span className="sr-only">Pipeline status</span>
          <select
            value={job.status}
            onChange={(event) => onStatusChange(job, event.target.value)}
            className="rounded-sm border border-border-strong bg-panel px-1.5 py-1 text-sm text-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 text-sm text-text hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            Open posting <ExternalLinkIcon />
          </a>
        )}
        {applyUrl && (
          <a
            href={applyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm text-accent hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent"
          >
            Apply page <ExternalLinkIcon />
          </a>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-3 sm:grid-cols-3">
        <Fact label="Match">
          <span className="font-mono">{score != null ? `${Math.round(score)}%` : '—'}</span>
          {score != null && <span className="ml-1.5 text-xs text-text-faint">{detailed ? 'Detailed' : 'Estimated'}</span>}
        </Fact>
        <Fact label="Experience">
          {experience ? (
            <span className="font-mono" title={job.experience ? `“${job.experience.evidence}”` : undefined}>
              {experience}
            </span>
          ) : (
            <span className="text-text-faint">Not stated</span>
          )}
        </Fact>
        <Fact label="Deadline">
          {job.deadline ? (
            <span className="flex flex-col items-start gap-1">
              <DeadlineChip deadline={job.deadline} />
              <span className="text-xs text-text-faint">{formatDateTime(job.deadline)}</span>
            </span>
          ) : (
            <span className="text-text-faint">None listed</span>
          )}
        </Fact>
        {showSponsorship && (
          <Fact label="Sponsorship">
            <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs leading-none ${sponsorship.className}`}>
              {sponsorship.label}
            </span>
          </Fact>
        )}
        {salary && (
          <Fact label="Compensation">
            <span className="font-mono">{salary}</span>
          </Fact>
        )}
        <Fact label="Posted">
          <span className="font-mono">{formatDate(job.posted_at)}</span>
        </Fact>
      </dl>

      {reason && <p className="mt-3 text-sm leading-5 text-text-secondary">{reason}</p>}
      {job.experience && (
        <p className="mt-2 text-xs text-text-faint">Experience from the posting: “{job.experience.evidence}”</p>
      )}
      {showSponsorship && job.sponsorship_evidence && (
        <p className="mt-1 text-xs text-text-faint">Sponsorship from the posting: “{job.sponsorship_evidence}”</p>
      )}

      <section className="mt-5">
        <h3 className="mb-1.5 text-xs uppercase tracking-wide text-text-faint">What they're asking for</h3>
        {job.requirements.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm leading-5 text-text">
            {job.requirements.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        ) : job.description ? (
          <p className="text-sm text-text-secondary">This posting doesn't have a qualifications list — see the description below.</p>
        ) : (
          <p className="text-sm text-text-secondary">{missingDescriptionHint ?? 'No description is available for this posting.'}</p>
        )}
      </section>

      {job.description && (
        <section className="mt-5">
          <h3 className="mb-1.5 text-xs uppercase tracking-wide text-text-faint">Description</h3>
          <p className={`whitespace-pre-line text-sm leading-6 text-text-secondary ${fullDescription ? '' : 'line-clamp-6'}`}>{job.description}</p>
          <button
            type="button"
            onClick={() => setFullDescription((value) => !value)}
            className="mt-1 rounded-sm text-sm text-accent hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent"
          >
            {fullDescription ? 'Show less' : 'Show full description'}
          </button>
        </section>
      )}
    </div>
  )
}
