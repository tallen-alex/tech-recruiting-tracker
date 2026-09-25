import { useCallback, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { EmptyState } from '../components/EmptyState'
import { DeadlineAlerts } from '../components/DeadlineAlerts'
import { JobSplitView } from '../components/JobSplitView'
import { useJobSelection } from '../lib/useJobSelection'
import { CMS_SOURCE } from '../lib/constants'

const controlClass = 'rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus-visible:outline-2 focus-visible:outline-accent'

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
  const { selected, select, setStatus } = useJobSelection(state, setState, reload)

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

      <DeadlineAlerts onSelect={select} />

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
          <JobSplitView jobs={state.data.items} selected={selected} onSelect={select} onStatusChange={setStatus} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary">
            <span>{state.data.total.toLocaleString()} posting{state.data.total === 1 ? '' : 's'} · Page {state.data.page} of {totalPages}</span>
            <div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent">Previous</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent">Next</button></div>
          </div>
        </>
      )}
    </div>
  )
}
