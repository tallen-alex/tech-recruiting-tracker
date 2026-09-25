import type { NormalizedJob } from './types'

type GreenhouseJob = {
  absolute_url: string
  title: string
  location?: { name?: string }
  updated_at?: string
  first_published?: string
  application_deadline?: string
  content?: string
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/** Greenhouse's `content` field arrives double-entity-encoded (literal "&amp;lt;h2&amp;gt;"), so decode repeatedly before stripping tags. */
function stripHtml(html: string): string {
  let text = html
  for (let i = 0; i < 3; i++) {
    const decoded = decodeEntities(text)
    if (decoded === text) break
    text = decoded
  }
  text = decodeEntities(text.replace(/<[^>]*>/g, ' '))
  return text.replace(/\s+/g, ' ').trim()
}

export async function fetchGreenhouseJobs(companyId: number, companyName: string, slug: string): Promise<NormalizedJob[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`)
  if (!res.ok) throw new Error(`Greenhouse fetch failed for "${slug}" (${res.status})`)
  const data = (await res.json()) as { jobs: GreenhouseJob[] }
  return data.jobs.map((job) => ({
    company_id: companyId,
    company_name: companyName,
    title: job.title,
    location: job.location?.name ?? null,
    remote: null,
    url: job.absolute_url,
    source: 'greenhouse',
    description: job.content ? stripHtml(job.content) : null,
    salary_min: null,
    salary_max: null,
    posted_at: job.first_published ?? job.updated_at ?? null,
    deadline: job.application_deadline ?? null,
  }))
}
