import type { Tone } from '../components/StatusBadge'
import type { ExperienceRequirement, Job } from '../types'

export const JOB_STATUSES = ['new', 'reviewing', 'applied', 'skipped'] as const

const STATUS_TONE: Record<string, Tone> = { new: 'info', reviewing: 'warning', applied: 'success', skipped: 'neutral' }

export function jobStatusTone(status: string): Tone {
  return STATUS_TONE[status] ?? 'neutral'
}

export function formatSalary(job: Pick<Job, 'salary_min' | 'salary_max'>): string | null {
  if (!job.salary_min && !job.salary_max) return null
  const fmt = (value: number) => `$${Math.round(value / 1000)}k`
  if (job.salary_min && job.salary_max) return `${fmt(job.salary_min)}–${fmt(job.salary_max)}`
  return fmt((job.salary_min ?? job.salary_max)!)
}

export function formatExperience(experience: ExperienceRequirement | null): string | null {
  if (!experience) return null
  return experience.max ? `${experience.min}–${experience.max} yrs` : `${experience.min}+ yrs`
}

export const SPONSORSHIP_LABEL: Record<string, { label: string; className: string }> = {
  sponsored: { label: 'Sponsors', className: 'border-success/30 bg-success-muted text-success' },
  not_sponsored: { label: 'No sponsorship', className: 'border-danger/30 bg-danger-muted text-danger' },
  unclear: { label: 'Not stated', className: 'border-border-strong bg-panel-raised text-text-secondary' },
}

export function matchScore(job: Job): { score: number | null; reason: string | null; detailed: boolean } {
  return {
    score: job.match_score ?? job.ranking_score,
    reason: job.match_reason ?? job.ranking_reason,
    detailed: job.match_score != null,
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function isDateOnly(value: string | null): boolean {
  return value !== null && DATE_ONLY.test(value)
}

/**
 * Deadlines are naive UTC ("2026-09-30T05:00:00") or date-only. A date-only deadline is treated as the
 * end of that local day, since "due Sep 30" means you can still apply on the 30th.
 */
export function dueAt(deadline: string | null): Date | null {
  if (!deadline) return null
  const hasOffset = /T.*(Z|[+-]\d{2}:?\d{2})$/.test(deadline)
  const d = DATE_ONLY.test(deadline)
    ? new Date(`${deadline}T23:59:59`)
    : hasOffset
      ? new Date(deadline)
      : new Date(`${deadline.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Whole local calendar days from today to the due date: 0 = today, 1 = tomorrow, negative = passed. */
export function daysUntil(due: Date, now = new Date()): number {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOf(due) - startOf(now)) / 86_400_000)
}

export function dueLabel(due: Date, days: number, dateOnly: boolean): string {
  const time = dateOnly ? '' : `, ${due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  if (days < 0) return `Closed ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  if (days === 0) return `Today${time}`
  if (days === 1) return `Tomorrow${time}`
  if (days <= 7) return `${days} days · ${due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function urgencyClass(days: number): string {
  if (days < 0) return 'border-border bg-panel text-text-faint'
  if (days <= 1) return 'border-danger/30 bg-danger-muted text-danger'
  if (days <= 3) return 'border-warning/30 bg-warning-muted text-warning'
  return 'border-border-strong bg-panel-raised text-text-secondary'
}

/**
 * Status edits are broadcast so separate lists of the same posting (the page's list and the deadline
 * alerts) stay in step without sharing state. Listeners should only patch local state — never re-save.
 */
const STATUS_EVENT = 'tracker:job-status'

export function announceJobStatus(id: number, status: string) {
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { id, status } }))
}

export function onJobStatus(listener: (id: number, status: string) => void): () => void {
  const handler = (event: Event) => {
    const { id, status } = (event as CustomEvent<{ id: number; status: string }>).detail
    listener(id, status)
  }
  window.addEventListener(STATUS_EVENT, handler)
  return () => window.removeEventListener(STATUS_EVENT, handler)
}
