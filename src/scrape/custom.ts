import type { NormalizedJob } from './types'
import { extractJobsFromCareerPage } from '../llm/anthropic'

type CrawledPage = { text?: string; markdown?: string; html?: string }

/** Apify's Website Content Crawler renders JS (career pages are often SPAs) and returns clean text/markdown — one page only, no site-wide crawl. */
async function fetchRenderedCareerPage(careersUrl: string, apifyToken: string): Promise<string> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${apifyToken}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: careersUrl }],
        maxCrawlDepth: 0,
        maxCrawlPages: 1,
        crawlerType: 'playwright:adaptive',
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Apify career-page render failed (${res.status}): ${body}`)
  }
  const items = (await res.json()) as CrawledPage[]
  const page = items[0]
  if (!page) throw new Error('Apify returned no content for this career page')
  const content = page.markdown ?? page.text ?? page.html
  if (!content) throw new Error('Apify returned an empty page')
  return content
}

export async function fetchCustomCareerPageJobs(opts: {
  companyId: number
  companyName: string
  careersUrl: string
  apifyToken: string
  anthropicKey: string
}): Promise<NormalizedJob[]> {
  const content = await fetchRenderedCareerPage(opts.careersUrl, opts.apifyToken)
  const extracted = await extractJobsFromCareerPage({
    apiKey: opts.anthropicKey,
    html: content,
    companyName: opts.companyName,
    pageUrl: opts.careersUrl,
  })
  return extracted.map((job) => ({
    company_id: opts.companyId,
    company_name: opts.companyName,
    title: job.title,
    location: job.location,
    remote: null,
    url: job.url,
    source: 'custom',
    description: null,
    salary_min: null,
    salary_max: null,
    posted_at: job.posted_at,
    deadline: job.deadline,
  }))
}
