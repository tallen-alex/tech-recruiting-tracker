import type { NormalizedJob } from './types.js'

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let lastResponse: Response | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, init)
    lastResponse = response
    if (response.ok) return response.json() as Promise<T>
    if (response.status !== 429 && response.status < 500) break
    if (attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'))
      const delaySeconds = Number.isFinite(retryAfter) ? retryAfter : 2 ** attempt
      await new Promise((resolve) => setTimeout(resolve, Math.min(8, delaySeconds) * 1000))
    }
  }
  throw new Error(`${lastResponse?.status ?? 0} ${lastResponse?.statusText ?? 'Request failed'} from ${url}`)
}

export function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized || null
}

export function absoluteUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null
  try {
    return new URL(value, base).toString()
  } catch {
    return null
  }
}

export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Set<string>()
  return jobs.filter((job) => {
    const key = `${job.source}:${job.externalId ?? job.jobUrl}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.trim() : date.toISOString()
}
