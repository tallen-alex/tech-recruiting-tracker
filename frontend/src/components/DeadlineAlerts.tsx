import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { formatDateTime } from '../lib/format'
import { CMS_SOURCE } from '../lib/constants'
import { ChevronDownIcon, ExternalLinkIcon } from './icons'
import { ExperienceCell } from './JobRequirements'
import { JOB_STATUSES, announceJobStatus, onJobStatus, daysUntil, dueAt, dueLabel, isDateOnly, urgencyClass } from '../lib/jobs'
import type { Job } from '../types'

const WINDOW_DAYS = 7
const COLLAPSED_COUNT = 5
/** Marking a posting as either of these takes it off the alert list — it no longer needs action. */
const RESOLVED = new Set<string>(['applied', 'skipped'])
/** Shared by the Jobs and CMS pages, so collapsing it on one collapses it on both. */
const COLLAPSED_KEY = 'deadlineAlerts.collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * "Closing soon" list across every source: active postings whose deadline falls in the next week and
 * that haven't been marked applied or skipped. Status edits are broadcast, so the page's own list and
 * this one stay in step; `onSelect` opens a posting in the page's detail pane.
 */
export function DeadlineAlerts({ onSelect }: { onSelect?: (job: Job) => void }) {
  const fetcher = useCallback(() => api.jobs.deadlines(WINDOW_DAYS), [])
  const { state, reload, setState } = useResource(fetcher)
  const [showAll, setShowAll] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  // Mirror status changes made elsewhere on the page (the list or the detail pane).
  useEffect(
    () =>
      onJobStatus((id, status) =>
        setState((prev) =>
          prev.status === 'ready' ? { status: 'ready', data: { ...prev.data, items: prev.data.items.map((item) => (item.id === id ? { ...item, status } : item)) } } : prev,
        ),
      ),
    [setState],
  )


  const toggleCollapsed = () =>
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // Private-mode storage failures shouldn't break the toggle.
      }
      return next
    })

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
    .map((job) => ({ job, due: dueAt(job.deadline) }))
    .filter((entry): entry is { job: Job; due: Date } => entry.due !== null && entry.due.getTime() >= now.getTime())
    .map((entry) => ({ ...entry, days: daysUntil(entry.due, now) }))
    .filter((entry) => entry.days <= WINDOW_DAYS && !RESOLVED.has(entry.job.status))

  const setStatus = async (job: Job, status: string) => {
    announceJobStatus(job.id, status)
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
      <div className={`flex flex-wrap items-center justify-between gap-2 bg-panel px-3 py-2 ${collapsed ? 'rounded-md' : 'border-b border-border'}`}>
        <h2 id="deadline-alerts-heading" className="text-sm font-semibold text-text">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="deadline-alerts-list"
            className="flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronDownIcon className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            Closing in the next {WINDOW_DAYS} days
            <span className="font-mono font-normal text-text-secondary">{upcoming.length}</span>
          </button>
        </h2>
        {/* Stays visible while collapsed, so an urgent deadline is never fully hidden. */}
        {urgent > 0 && <span className="text-xs text-danger">{urgent} due today or tomorrow</span>}
      </div>
      {!collapsed && (
      <>
      <ul id="deadline-alerts-list">
        {shown.map(({ job, due, days }) => {
          const score = job.match_score ?? job.ranking_score
          return (
            <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 last:border-0">
              <span
                className={`inline-flex w-44 shrink-0 items-center rounded-sm border px-1.5 py-0.5 text-xs ${urgencyClass(days)}`}
                title={`Deadline: ${formatDateTime(job.deadline)}`}
              >
                {dueLabel(due, days, isDateOnly(job.deadline))}
              </span>
              <span className="min-w-0 flex-1 basis-64">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(job)}
                    className="block max-w-full truncate rounded-sm text-left text-sm font-medium text-text hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                    title={`Show details for ${job.title}`}
                  >
                    {job.title}
                  </button>
                ) : (
                  <span className="block truncate text-sm font-medium text-text" title={job.title}>
                    {job.title}
                  </span>
                )}
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
                {JOB_STATUSES.map((status) => (
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
      </>
      )}
    </section>
  )
}
