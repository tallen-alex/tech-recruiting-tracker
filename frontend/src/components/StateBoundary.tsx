import type { ReactNode } from 'react'
import type { ResourceState } from '../lib/useResource'

export function StateBoundary<T>({
  state,
  onRetry,
  empty,
  children,
}: {
  state: ResourceState<T[]>
  onRetry: () => void
  empty: ReactNode
  children: (data: T[]) => ReactNode
}) {
  if (state.status === 'loading') {
    return (
      <div className="animate-pulse space-y-1.5" role="status" aria-label="Loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 rounded-sm bg-panel" />
        ))}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-text">
        <p>Couldn't load this — {state.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-sm text-danger underline underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          Try again
        </button>
      </div>
    )
  }

  if (state.data.length === 0) return <>{empty}</>

  return <>{children(state.data)}</>
}
