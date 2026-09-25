import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { api } from './api'
import { announceJobStatus, onJobStatus } from './jobs'
import type { ResourceState } from './useResource'
import type { Job, PaginatedJobs } from '../types'

/**
 * Selection and optimistic status edits for a paged job list shown in a master–detail layout.
 * The selection may be a posting that isn't on the current page (opened from the deadline alerts),
 * so the picked Job is kept as an object and refreshed from the page whenever it is on it.
 */
export function useJobSelection(
  state: ResourceState<PaginatedJobs>,
  setState: Dispatch<SetStateAction<ResourceState<PaginatedJobs>>>,
  reload: () => void,
) {
  const [picked, setPicked] = useState<Job | null>(null)
  const items = state.status === 'ready' ? state.data.items : []
  const selected = (picked && (items.find((item) => item.id === picked.id) ?? picked)) ?? items[0] ?? null

  const patchJob = useCallback((id: number, patch: Partial<Job>) => {
    setState((previous) =>
      previous.status === 'ready'
        ? { status: 'ready', data: { ...previous.data, items: previous.data.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) } }
        : previous,
    )
    setPicked((current) => (current && current.id === id ? { ...current, ...patch } : current))
  }, [setState])

  // Mirror status changes made elsewhere on the page, e.g. in the deadline alerts.
  useEffect(() => onJobStatus((id, status) => patchJob(id, { status })), [patchJob])

  const setStatus = async (job: Job, status: string) => {
    announceJobStatus(job.id, status)
    try {
      await api.jobs.update(job.id, { status })
    } catch {
      reload()
    }
  }

  return { selected, select: setPicked, setStatus }
}
