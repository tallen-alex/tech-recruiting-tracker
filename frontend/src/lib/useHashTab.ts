import { useEffect, useState } from 'react'

export function useHashTab<T extends string>(tabs: readonly T[], fallback: T): [T, (tab: T) => void] {
  const read = (): T => {
    const hash = window.location.hash.slice(1)
    return (tabs as readonly string[]).includes(hash) ? (hash as T) : fallback
  }

  const [tab, setTabState] = useState<T>(read)

  useEffect(() => {
    const onHashChange = () => setTabState(read())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setTab = (next: T) => {
    window.location.hash = next
    setTabState(next)
  }

  return [tab, setTab]
}
