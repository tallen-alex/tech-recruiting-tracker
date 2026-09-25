import { useCallback, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { formatDateTime } from '../lib/format'
import { CMS_SOURCE } from '../lib/constants'
import { ExternalLinkIcon } from './icons'
import { ExperienceCell } from './JobRequirements'
import type { Job } from '../types'

const WINDOW_DAYS = 7
const COLLAPSED_COUNT = 5
const STATUSES = ['new', 'reviewing', 'applied', 'skipped'] as const
/** Marking a posting as either of these takes it off the alert list — it no longer needs action. */
const RESOLVED = new Set<string>(['applied', 'skipped'])

/**
 * Deadlines are naive UTC ("2026-09-30T05:00:00") or date-only. A date-only deadline is treated as the
 * end of that local day, since "due Sep 30" means you can still apply on the 30th.
 */
function dueAt(deadline: string): Date | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(deadline)
  const hasOffset = /T.*(Z|[+-]\d{2}:?\d{2})$/.test(deadline)
  const d = dateOnly ? new Date(`${deadline}T23:59:59`) : hasOffset ? new Date(deadline) : new Date(`${deadline.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Whole local calendar days from today to the due date: 0 = today, 1 = tomorrow. */
function daysUntil(due: Date, now: Date): number {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOf(due) - startOf(now)) / 86_400_000)
}

function dueLabel(due: Date, days: number, dateOnly: boolean): string {
  const time = dateOnly ? '' : `, ${due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  if (days <= 0) return `Today${time}`
  if (days === 1) return `Tomorrow${time}`
  return `${days} days · ${due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
}

function urgencyClass(days: number): string {
  if (days <= 1) return 'border-danger/30 bg-danger-muted text-danger'
  if (days <= 3) return 'border-warning/30 bg-warning-muted text-warning'
  return 'border-border-strong bg-panel-raised text-text-secondary'
}

/**
 * "Closing soon" list across every source: active postings whose deadline falls in the next week and
 * that haven't been marked applied or skipped. `onJobUpdated` lets the page's own table mirror a status
 * change made here.
 */
export function DeadlineAlerts({ onJobUpdated }: { onJobUpdated?: (job: Job) => void }) {
  const fetcher = useCallback(() => api.jobs.deadlines(WINDOW_DAYS), [])
  const { state, reload, setState } = useResource(fetcher)
  const [showAll, setShowAll] = useState(false)

  if (state.status === 'loading') return <div className="mb-4 h-12 animate-pulse rounded-md bg-panel" role="status" aria-label="Loading deadlines" />
  if (state.status === 'error') {
    return (
      <p className="mb-4 text-sm text-text-secondary">
        Couldn't load upcoming deadlines.{' '}
        <button type="button" onClick={reload} className="text-accent underline underline-offset-2 hover:text-accent-strong">
          Try again
        </button>
      </p>
    )
  }

  const now = new Date()
  const upcoming = state.data.items
    .map((job) => ({ job, due: job.deadline ? dueAt(job.deadline) : null }))
    .filter((entry): entry is { job: Job; due: Date } => entry.due !== null && entry.due.getTime() >= now.getTime())
    .map((entry) => ({ ...entry, days: daysUntil(entry.due, now) }))
    .filter((entry) => entry.days <= WINDOW_DAYS && !RESOLVED.has(entry.job.status))

  const setStatus = async (job: Job, status: string) => {
    setState((prev) =>
      prev.status === 'ready' ? { status: 'ready', data: { ...prev.data, items: prev.data.items.map((item) => (item.id === job.id ? { ...item, status } : item)) } } : prev,
    )
    onJobUpdated?.({ ...job, status })
    try {
      await api.jobs.update(job.id, { status })
    } catch {
      reload()
    }
  }

  if (upcoming.length === 0) {
    return <p className="mb-4 rounded-md border border-border px-3 py-2 text-sm text-text-secondary">Nothing you haven't acted on closes in the next {WINDOW_DAYS} days.</p>
  }

  const urgent = upcoming.filter((entry) => entry.days <= 1).length
  const shown = showAll ? upcoming : upcoming.slice(0, COLLAPSED_COUNT)

  return (
    <section className="mb-4 rounded-md border border-border" aria-labelledby="deadline-alerts-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-panel px-3 py-2">
        <h2 id="deadline-alerts-heading" className="text-sm font-semibold text-text">
          Closing in the next {WINDOW_DAYS} days
          <span className="ml-2 font-mono font-normal text-text-secondary">{upcoming.length}</span>
        </h2>
        {urgent > 0 && <span className="text-xs text-danger">{urgent} due today or tomorrow</span>}
      </div>
      <ul>
        {shown.map(({ job, due, days }) => {
          const score = job.match_score ?? job.ranking_score
          return (
            <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 last:border-0">
              <span
                className={`inline-flex w-44 shrink-0 items-center rounded-sm border px-1.5 py-0.5 text-xs ${urgencyClass(days)}`}
                title={`Deadline: ${formatDateTime(job.deadline)}`}
              >
                {dueLabel(due, days, /^\d{4}-\d{2}-\d{2}$/.test(job.deadline ?? ''))}
              </span>
              <span className="min-w-0 flex-1 basis-64">
                <span className="block truncate text-sm font-medium text-text" title={job.title}>
                  {job.title}
                </span>
                <span className="block truncate text-xs text-text-secondary">
                  {job.company_name}
                  {job.source === CMS_SOURCE && <span className="text-text-faint"> · CMS board</span>}
                </span>
              </span>
              <span className="w-16 text-sm">
                <ExperienceCell experience={job.experience} />
              </span>
              <span className="w-12 text-right font-mono text-sm text-text" title={(job.match_reason ?? job.ranking_reason) ?? undefined}>
                {score != null ? `${Math.round(score)}%` : '—'}
              </span>
              <select
                aria-label={`Pipeline status for ${job.title}`}
                value={job.status}
                onChange={(event) => setStatus(job, event.target.value)}
                className="rounded-sm border border-border-strong bg-panel px-1.5 py-1 text-xs text-text focus-visible:outline-2 focus-visible:outline-accent"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              {job.url ? (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm text-text-faint hover:bg-accent-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                  aria-label={`Open ${job.title} at ${job.company_name}`}
                >
                  <ExternalLinkIcon />
                </a>
              ) : (
                <span className="min-w-8" />
              )}
            </li>
          )
        })}
      </ul>
      {upcoming.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="w-full border-t border-border px-3 py-1.5 text-left text-xs text-accent hover:bg-panel hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent"
        >
          {showAll ? 'Show fewer' : `Show all ${upcoming.length}`}
        </button>
      )}
    </section>
  )
}
