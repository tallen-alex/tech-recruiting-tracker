import type { NormalizedJob } from './types'

type LeverPosting = {
  text: string
  hostedUrl: string
  categories?: { location?: string }
  workplaceType?: string
  createdAt?: number
  descriptionPlain?: string
}

export async function fetchLeverJobs(companyId: number, companyName: string, slug: string): Promise<NormalizedJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`)
  if (!res.ok) throw new Error(`Lever fetch failed for "${slug}" (${res.status})`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`Lever board not found for "${slug}"`)
  return (data as LeverPosting[]).map((job) => ({
    company_id: companyId,
    company_name: companyName,
    title: job.text,
    location: job.categories?.location ?? null,
    remote: job.workplaceType ?? null,
    url: job.hostedUrl,
    source: 'lever',
    description: job.descriptionPlain || null,
    salary_min: null,
    salary_max: null,
    posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    deadline: null,
  }))
}
