import type { NormalizedJob } from './types'

export async function upsertJob(db: D1Database, job: NormalizedJob): Promise<{ id: number; isNew: boolean }> {
  const existing = await db.prepare('SELECT id FROM jobs WHERE url = ?').bind(job.url).first<{ id: number }>()

  if (existing) {
    await db
      .prepare(
        `UPDATE jobs SET company_id = ?, company_name = ?, title = ?, location = ?, remote = ?, source = ?, description = ?, salary_min = ?, salary_max = ?, posted_at = ?, deadline = ? WHERE id = ?`,
      )
      .bind(
        job.company_id,
        job.company_name,
        job.title,
        job.location,
        job.remote,
        job.source,
        job.description,
        job.salary_min,
        job.salary_max,
        job.posted_at,
        job.deadline,
        existing.id,
      )
      .run()
    return { id: existing.id, isNew: false }
  }

  const inserted = await db
    .prepare(
      `INSERT INTO jobs (company_id, company_name, title, location, remote, url, source, description, salary_min, salary_max, posted_at, deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      job.company_id,
      job.company_name,
      job.title,
      job.location,
      job.remote,
      job.url,
      job.source,
      job.description,
      job.salary_min,
      job.salary_max,
      job.posted_at,
      job.deadline,
    )
    .first<{ id: number }>()

  return { id: inserted!.id, isNew: true }
}
