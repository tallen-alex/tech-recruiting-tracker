import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendJobs, sendRunComplete } from '../src/callback.js'
import type { NormalizedJob } from '../src/types.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const job = (id: number): NormalizedJob => ({
  externalId: String(id), title: `Role ${id}`, location: null, workplaceType: null, department: null,
  employmentType: null, description: null, postedAt: null, deadline: null, salaryMin: null, salaryMax: null,
  jobUrl: `https://example.com/jobs/${id}`, applyUrl: null, source: 'custom',
})

describe('callback delivery', () => {
  it('sends jobs in idempotent-sized batches of at most 100', async () => {
    const mocked = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', mocked)
    await sendJobs('https://worker.example', 'run-1', 'secret', 7, Array.from({ length: 201 }, (_, id) => job(id)))
    expect(mocked).toHaveBeenCalledTimes(3)
    expect(mocked.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).jobs.length)).toEqual([100, 100, 1])
    expect(mocked.mock.calls[0][1]?.headers).toMatchObject({ authorization: 'Bearer secret' })
  })

  it('retries a callback three times with backoff', async () => {
    vi.useFakeTimers()
    const mocked = vi.fn()
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response('temporary', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', mocked)
    const delivery = sendRunComplete('https://worker.example', 'run-1', 'secret')
    await vi.runAllTimersAsync()
    await delivery
    expect(mocked).toHaveBeenCalledTimes(3)
  })
})
