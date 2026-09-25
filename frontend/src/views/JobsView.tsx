import { useCallback, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { EmptyState } from '../components/EmptyState'
import { ExternalLinkIcon } from '../components/icons'
import { StatusDot, type Tone } from '../components/StatusBadge'
import { formatDate } from '../lib/format'
import { CMS_SOURCE } from '../lib/constants'
import type { Job } from '../types'

const STATUS_TONE: Record<string, Tone> = { new: 'info', reviewing: 'warning', applied: 'success', skipped: 'neutral' }
const controlClass = 'rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus-visible:outline-2 focus-visible:outline-accent'

function toneFor(status: string): Tone { return STATUS_TONE[status] ?? 'neutral' }

function formatSalary(job: Job) {
  if (!job.salary_min && !job.salary_max) return '—'
  const fmt = (value: number) => `$${Math.round(value / 1000)}k`
  if (job.salary_min && job.salary_max) return `${fmt(job.salary_min)}–${fmt(job.salary_max)}`
  return fmt(job.salary_min ?? job.salary_max!)
}

type SortBy = 'recent' | 'relevance'
type ActiveFilter = 'true' | 'false' | 'all'

export function JobsView() {
  const [sortBy, setSortBy] = useState<SortBy>('relevance')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('true')
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  // CMS board postings live in their own tab; thousands of them would bury the tracked-company feed.
  const fetcher = useCallback(() => api.jobs.list({ active: activeFilter, sort: sortBy, search: query, page, pageSize: 50, excludeSource: CMS_SOURCE }), [activeFilter, sortBy, query, page])
  const { state, reload, setState } = useResource(fetcher)

  const setStatus = async (job: Job, status: string) => {
    setState((previous) => previous.status === 'ready'
      ? { status: 'ready', data: { ...previous.data, items: previous.data.items.map((item) => item.id === job.id ? { ...item, status } : item) } }
      : previous)
    try { await api.jobs.update(job.id, { status }) }
    catch { reload() }
  }

  const totalPages = state.status === 'ready' ? Math.max(1, Math.ceil(state.data.total / state.data.pageSize)) : 1

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Jobs feed</h1>
          <p className="mt-1 text-sm text-text-secondary">Every discovered posting, ranked by fit.</p>
        </div>
        <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryDraft.trim()) }}>
          <input value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="Search jobs or companies" aria-label="Search jobs or companies" className={`${controlClass} min-w-[15rem]`} />
          <button type="submit" className="rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 text-sm text-text hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">Search</button>
          {query && <button type="button" onClick={() => { setQueryDraft(''); setQuery(''); setPage(1) }} className="text-sm text-text-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-accent">Clear</button>}
        </form>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          Posting state
          <select value={activeFilter} onChange={(event) => { setActiveFilter(event.target.value as ActiveFilter); setPage(1) }} className={controlClass}>
            <option value="true">Active</option><option value="all">All</option><option value="false">Inactive</option>
          </select>
        </label>
        <div className="flex items-center gap-1 rounded-sm border border-border-strong p-0.5">
          {(['relevance', 'recent'] as const).map((option) => (
            <button key={option} type="button" onClick={() => { setSortBy(option); setPage(1) }} aria-pressed={sortBy === option}
              className={`rounded-sm px-2 py-1 text-xs capitalize focus-visible:outline-2 focus-visible:outline-accent ${sortBy === option ? 'bg-accent text-surface' : 'text-text-secondary hover:text-text'}`}>
              {option}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && <div className="animate-pulse space-y-1.5" role="status" aria-label="Loading jobs">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-10 rounded-sm bg-panel" />)}</div>}
      {state.status === 'error' && <div className="rounded-md border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-text"><p>Couldn't load jobs — {state.message}</p><button type="button" onClick={reload} className="mt-2 text-danger underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent">Try again</button></div>}
      {state.status === 'ready' && state.data.items.length === 0 && <EmptyState title="No jobs match these filters" description="Try another search or posting-state filter. Scraping retains every discovered posting." />}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[1280px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[28%]" />
                <col className="w-[20%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[3%]" />
              </colgroup>
              <thead><tr className="border-b border-border bg-panel text-xs uppercase tracking-wide text-text-faint">
                <th className="px-3 py-2 font-medium">Company</th><th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Location</th><th className="px-3 py-2 font-medium">Compensation</th>
                <th className="px-3 py-2 text-right font-medium">Match</th><th className="px-3 py-2 font-medium">Posted</th>
                <th className="px-3 py-2 font-medium">Pipeline</th><th className="px-3 py-2 font-medium"><span className="sr-only">Open posting</span></th>
              </tr></thead>
              <tbody>{state.data.items.map((job) => {
                const score = job.match_score ?? job.ranking_score
                const reason = job.match_reason ?? job.ranking_reason
                return (
                  <tr key={job.id} className="border-b border-border align-top transition-colors last:border-0 hover:bg-panel">
                    <td className="truncate px-3 py-3 font-medium text-text" title={job.company_name}>{job.company_name}</td>
                    <td className="px-3 py-3 text-text"><span className="line-clamp-2 font-medium leading-5" title={job.title}>{job.title}</span>{job.department && <span className="mt-1 block truncate text-xs text-text-faint">{job.department}</span>}</td>
                    <td className="px-3 py-3 leading-5 text-text-secondary"><span className="line-clamp-2" title={[job.location, job.remote].filter(Boolean).join(' · ')}>{job.location ?? '—'}{job.remote ? ` · ${job.remote}` : ''}</span></td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-text-secondary">{formatSalary(job)}</td>
                    <td className="px-3 py-2.5 text-right" title={reason ?? undefined}>
                      <span className="block font-mono text-text">{score != null ? `${Math.round(score)}%` : '—'}</span>
                      {score != null && <span className="text-xs text-text-faint">{job.match_score != null ? 'Detailed' : 'Estimated'}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-text-secondary"><span className="font-mono">{formatDate(job.posted_at)}</span><span className="mt-1 block text-xs text-text-faint">{job.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><StatusDot tone={toneFor(job.status)} /><select aria-label={`Pipeline status for ${job.title}`} value={job.status} onChange={(event) => setStatus(job, event.target.value)} className="min-w-0 rounded-sm border border-border-strong bg-panel px-1.5 py-1 text-xs text-text focus-visible:outline-2 focus-visible:outline-accent">{['new', 'reviewing', 'applied', 'skipped'].map((status) => <option key={status} value={status}>{status}</option>)}</select></div></td>
                    <td className="px-2 py-2.5 text-right">{job.url && <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-sm text-text-faint hover:bg-accent-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Open posting for ${job.title} at ${job.company_name}`}><ExternalLinkIcon /></a>}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary">
            <span>{state.data.total.toLocaleString()} posting{state.data.total === 1 ? '' : 's'} · Page {state.data.page} of {totalPages}</span>
            <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent">Previous</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent">Next</button></div>
          </div>
        </>
      )}
    </div>
  )
}
