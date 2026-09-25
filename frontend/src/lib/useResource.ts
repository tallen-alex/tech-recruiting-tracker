import { useCallback, useEffect, useState } from 'react'

export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }

export function useResource<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' })

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    fetcher()
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }))
  }, [fetcher])

  useEffect(reload, [reload])

  return { state, reload, setState }
}
