import { useCallback, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { EmptyState } from '../components/EmptyState'
import { ChevronDownIcon, ExternalLinkIcon } from '../components/icons'
import { StatusDot, type Tone } from '../components/StatusBadge'
import { formatDate } from '../lib/format'
import { CMS_SOURCE } from '../lib/constants'
import type { Job } from '../types'

const STATUS_TONE: Record<string, Tone> = { new: 'info', reviewing: 'warning', applied: 'success', skipped: 'neutral' }
const controlClass =
  'rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus-visible:outline-2 focus-visible:outline-accent'

function toneFor(status: string): Tone {
  return STATUS_TONE[status] ?? 'neutral'
}

/**
 * The bookmarklet only bootstraps: it injects cms-sync.js from this origin, which holds the real logic.
 * That way sync behaviour can change without the user re-dragging the bookmark.
 */
function bookmarkletSource(origin: string): string {
  return `javascript:(function(){var s=document.createElement('script');s.src='${origin}/cms-sync.js?t='+Date.now();document.body.appendChild(s);})();`
}

type SortBy = 'relevance' | 'recent'
type SponsorshipFilter = 'all' | 'open' | 'sponsored' | 'not_sponsored' | 'unclear'

const SYNC_COLLAPSED_KEY = 'cms.syncCollapsed'

const SPONSORSHIP_LABEL: Record<string, { label: string; className: string }> = {
  sponsored: { label: 'Sponsors', className: 'border-success/30 bg-success-muted text-success' },
  not_sponsored: { label: 'No sponsorship', className: 'border-danger/30 bg-danger-muted text-danger' },
  unclear: { label: 'Not stated', className: 'border-border-strong bg-panel-raised text-text-secondary' },
}

export function CmsView() {
  const [sortBy, setSortBy] = useState<SortBy>('relevance')
  const [sponsorship, setSponsorship] = useState<SponsorshipFilter>('all')
  const [page, setPage] = useState(1)
  const [copied, setCopied] = useState(false)
  // Collapsed state persists: the setup steps only matter once, but the box would otherwise
  // push the actual job list below the fold on every visit.
  const [syncOpen, setSyncOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(SYNC_COLLAPSED_KEY) !== '1'
  })
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  const toggleSync = () => {
    setSyncOpen((open) => {
      const next = !open
      try {
        window.localStorage.setItem(SYNC_COLLAPSED_KEY, next ? '0' : '1')
      } catch {
        // Private-mode storage failures shouldn't break the toggle.
      }
      return next
    })
  }

  const fetcher = useCallback(
    () => api.jobs.list({ active: 'true', sort: sortBy, source: CMS_SOURCE, page, pageSize: 50, sponsorship }),
    [sortBy, page, sponsorship],
  )
  const { state, reload, setState } = useResource(fetcher)

  const setStatus = async (job: Job, status: string) => {
    setState((previous) =>
      previous.status === 'ready'
        ? {
            status: 'ready',
            data: { ...previous.data, items: previous.data.items.map((item) => (item.id === job.id ? { ...item, status } : item)) },
          }
        : previous,
    )
    try {
      await api.jobs.update(job.id, { status })
    } catch {
      reload()
    }
  }

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletSource(origin))
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      setCopied(false)
    }
  }

  const totalPages = state.status === 'ready' ? Math.max(1, Math.ceil(state.data.total / state.data.pageSize)) : 1

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">CMS board</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kellogg 12twenty postings, ranked against your resume. Approved and Application Open only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-text-secondary">
            Sponsorship
            <select
              value={sponsorship}
              onChange={(event) => {
                setSponsorship(event.target.value as SponsorshipFilter)
                setPage(1)
              }}
              className={controlClass}
            >
              <option value="all">All</option>
              <option value="open">Not ruled out</option>
              <option value="sponsored">Sponsors</option>
              <option value="unclear">Not stated</option>
              <option value="not_sponsored">No sponsorship</option>
            </select>
          </label>
        <div className="flex items-center gap-1 rounded-sm border border-border-strong p-0.5">
          {(['relevance', 'recent'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSortBy(option)
                setPage(1)
              }}
              aria-pressed={sortBy === option}
              className={`rounded-sm px-2 py-1 text-xs capitalize transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                sortBy === option ? 'bg-accent text-surface' : 'text-text-secondary hover:text-text'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        </div>
      </div>

      <section className="mb-6 rounded-md border border-border-strong bg-panel">
        <div className="flex items-center justify-between gap-3 p-3">
          <button
            type="button"
            onClick={toggleSync}
            aria-expanded={syncOpen}
            aria-controls="cms-sync-panel"
            className="flex items-center gap-1.5 rounded-sm text-sm font-semibold text-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronDownIcon className={`transition-transform ${syncOpen ? '' : '-rotate-90'}`} />
            Sync
          </button>
          <button type="button" onClick={reload} className={controlClass}>
            Refresh list
          </button>
        </div>
        {syncOpen && (
          <div id="cms-sync-panel" className="border-t border-border px-3 pb-3 pt-3">
            <p className="text-sm text-text-secondary">
              The board requires your login, so syncing runs in your browser rather than on the server. Nothing runs on a
              schedule and no credentials are stored anywhere.
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-text-secondary">
              <li>Copy the sync link below and save it as a bookmark (name it whatever you like).</li>
              <li>Open your 12twenty job board while signed in.</li>
              <li>Click that bookmark. Progress shows in the corner; postings land here when it finishes.</li>
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyBookmarklet}
                className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-surface hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              >
                Copy sync bookmark
              </button>
              {copied && <span className="text-sm text-success">Copied — paste it as a bookmark's URL</span>}
            </div>
          </div>
        )}
      </section>

      {state.status === 'loading' && (
        <div className="animate-pulse space-y-1.5" role="status" aria-label="Loading">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-9 rounded-sm bg-panel" />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="rounded-md border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-text">
          <p>Couldn't load CMS postings — {state.message}</p>
          <button type="button" onClick={reload} className="mt-2 rounded-sm text-danger underline underline-offset-2 hover:text-text">
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && state.data.items.length === 0 && (
        <EmptyState
          title="No CMS postings yet"
          description="Save the sync bookmark above, open your 12twenty board while signed in, and click it. Open postings will appear here ranked by fit."
        />
      )}

      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-panel text-xs uppercase tracking-wide text-text-faint">
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Sponsorship</th>
                  <th className="px-3 py-2 text-right font-medium">Match</th>
                  <th className="px-3 py-2 font-medium">Posted</th>
                  <th className="px-3 py-2 font-medium">Deadline</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((job) => {
                  const score = job.match_score ?? job.ranking_score
                  const reason = job.match_reason ?? job.ranking_reason
                  return (
                    <tr key={job.id} className="border-b border-border align-top transition-colors last:border-0 hover:bg-panel">
                      <td className="px-3 py-3 font-medium text-text">
                        <span className="flex items-center gap-2">
                          {job.company_logo_url && (
                            <img
                              src={job.company_logo_url}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              // Source files are full-resolution (some over 1700px square), so they are
                              // constrained hard here and lazy-loaded rather than proxied or resized.
                              className="h-5 w-5 shrink-0 rounded-sm object-contain"
                              onError={(event) => {
                                event.currentTarget.style.display = 'none'
                              }}
                            />
                          )}
                          <span className="truncate" title={job.company_name}>
                            {job.company_name}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-text">
                        <span className="line-clamp-2 font-medium leading-5" title={job.title}>
                          {job.title}
                        </span>
                      </td>
                      <td className="px-3 py-3 leading-5 text-text-secondary">
                        <span className="line-clamp-2">{job.location ?? '—'}</span>
                      </td>
                      <td className="px-3 py-3">
                        {(() => {
                          const key = job.sponsorship ?? 'unclear'
                          const badge = SPONSORSHIP_LABEL[key] ?? SPONSORSHIP_LABEL.unclear
                          return (
                            <span
                              className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs leading-none ${badge.className}`}
                              // Evidence is the matched wording from the posting, so a verdict is always checkable.
                              title={job.sponsorship_evidence ?? 'The posting does not mention sponsorship either way.'}
                            >
                              {badge.label}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-3 py-3 text-right" title={reason ?? undefined}>
                        <span className="block font-mono text-text">{score != null ? `${Math.round(score)}%` : '—'}</span>
                        {score != null && (
                          <span className="text-xs text-text-faint">{job.match_score != null ? 'Detailed' : 'Estimated'}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-text-secondary">{formatDate(job.posted_at)}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-text-secondary">{formatDate(job.deadline)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusDot tone={toneFor(job.status)} />
                          <select
                            aria-label={`Pipeline status for ${job.title}`}
                            value={job.status}
                            onChange={(event) => setStatus(job, event.target.value)}
                            className="min-w-0 rounded-sm border border-border-strong bg-panel px-1.5 py-1 text-xs text-text focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            {['new', 'reviewing', 'applied', 'skipped'].map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right">
                        {job.url && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm text-text-faint hover:bg-accent-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                            aria-label={`Open ${job.title} at ${job.company_name} on the CMS board`}
                          >
                            <ExternalLinkIcon />
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-text-secondary">
            <span>
              {state.data.total} open posting{state.data.total === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className={`${controlClass} disabled:opacity-50`}>
                Previous
              </button>
              <span className="font-mono text-xs">
                {page}/{totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
                className={`${controlClass} disabled:opacity-50`}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
