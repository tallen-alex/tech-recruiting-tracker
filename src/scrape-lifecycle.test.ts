import { describe, expect, it } from 'vitest'
import { callbackToken, shouldDeactivateMissing } from './routes/scrape'

describe('scrape callback and lifecycle rules', () => {
  it('binds callback credentials to both the secret and run id', async () => {
    const token = await callbackToken('secret-a', 'run-1')
    expect(token).toBe(await callbackToken('secret-a', 'run-1'))
    expect(token).not.toBe(await callbackToken('secret-a', 'run-2'))
    expect(token).not.toBe(await callbackToken('secret-b', 'run-1'))
  })

  it.each([
    ['partial', 'generic crawl safety limit reached'],
    ['failed', 'failed'],
    ['succeeded', 'structured job limit reached'],
  ])('does not deactivate missing jobs after a %s scan', (status, stopReason) => {
    expect(shouldDeactivateMissing(status, stopReason)).toBe(false)
  })

  it('deactivates missing jobs only for a complete successful inventory', () => {
    expect(shouldDeactivateMissing('succeeded', 'complete')).toBe(true)
  })
})
