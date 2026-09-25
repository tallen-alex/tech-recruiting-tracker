import type { CompanyResult, NormalizedJob } from './types.js'

async function postWithRetry(url: string, token: string, body: unknown): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (response.ok) return
      throw new Error(`${response.status} ${await response.text()}`)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function sendJobs(baseUrl: string, runId: string, token: string, companyId: number, jobs: NormalizedJob[]): Promise<void> {
  for (let index = 0; index < jobs.length; index += 100) {
    await postWithRetry(`${baseUrl}/api/scrape/runs/${runId}/batches`, token, { companyId, jobs: jobs.slice(index, index + 100) })
  }
}

export function sendCompanyResult(baseUrl: string, runId: string, token: string, result: CompanyResult): Promise<void> {
  return postWithRetry(`${baseUrl}/api/scrape/runs/${runId}/companies/${result.companyId}/complete`, token, result)
}

export function sendRunComplete(baseUrl: string, runId: string, token: string): Promise<void> {
  return postWithRetry(`${baseUrl}/api/scrape/runs/${runId}/complete`, token, {})
}
