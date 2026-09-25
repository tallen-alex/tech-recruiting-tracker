import { Hono, type Context } from 'hono'
import type { Bindings, TargetingProfile } from '../types'
import { isJobEligible, isTargetingProfileReady, parseTargetingProfile, scoreDeterministicJob } from '../ranking'
import { scoreJobsRelevanceBatch } from '../llm/anthropic'

const scrape = new Hono<{ Bindings: Bindings }>()
const TERMINAL_COMPANY_STATUSES = ['succeeded', 'partial', 'failed']
const SCAN_POLICY = { maxAgeDays: 90, maxStoredJobsPerCompany: 250, structuredMaxPages: 100,
  genericMaxListingPages: 20, genericMaxJobs: 200, genericMaxSeconds: 180 }

type CompanyRow = {
  id: number
  name: string
  ats_type: string | null
  ats_slug: string | null
  careers_url: string | null
}

type IncomingJob = {
  externalId: string | null
  title: string
  location: string | null
  workplaceType: string | null
  department: string | null
  employmentType: string | null
  description: string | null
  postedAt: string | null
  deadline: string | null
  salaryMin: number | null
  salaryMax: number | null
  jobUrl: string
  applyUrl: string | null
  source: string
}

const encoder = new TextEncoder()

export async function callbackToken(secret: string, runId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(runId)))
  return btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function shouldDeactivateMissing(status: string, stopReason: string): boolean {
  return status === 'succeeded' && stopReason === 'complete'
}

async function authorizeCallback(c: Context<{ Bindings: Bindings }>, runId: string): Promise<Response | null> {
  const run = await c.env.DB.prepare("SELECT id FROM scrape_runs WHERE id = ? AND created_at >= datetime('now', '-24 hours')")
    .bind(runId).first()
  if (!run) return c.json({ error: 'unknown or expired run' }, 404)
  const supplied = c.req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const expected = await callbackToken(c.env.SCRAPE_CALLBACK_SECRET, runId)
  if (!supplied || supplied !== expected) return c.json({ error: 'invalid callback token' }, 401)
  return null
}

function actorId(value: string): string {
  return value.replace('/', '~')
}

async function readRun(db: D1Database, runId: string) {
  const run = await db.prepare('SELECT * FROM scrape_runs WHERE id = ?').bind(runId).first()
  if (!run) return null
  const { results: companies } = await db.prepare(
    'SELECT src.*, c.name AS company_name FROM scrape_run_companies src JOIN companies c ON c.id = src.company_id WHERE src.run_id = ? ORDER BY c.name',
  ).bind(runId).all()
  return { ...run, companies }
}

async function effectiveTargeting(db: D1Database): Promise<TargetingProfile> {
  const row = await db.prepare('SELECT targeting_effective_json FROM profile WHERE id = 1').first<{ targeting_effective_json: string | null }>()
  if (!row?.targeting_effective_json) return parseTargetingProfile(null)
  try { return parseTargetingProfile(JSON.parse(row.targeting_effective_json)) } catch { return parseTargetingProfile(null) }
}

async function upsertIncomingJob(db: D1Database, runId: string, company: CompanyRow, job: IncomingJob, targeting: TargetingProfile): Promise<boolean> {
  const title = typeof job.title === 'string' ? job.title.trim() : ''
  const jobUrl = typeof job.jobUrl === 'string' ? job.jobUrl.trim() : ''
  if (!title || !jobUrl || typeof job.source !== 'string') throw new Error('job title, jobUrl, and source are required')
  const ranking = scoreDeterministicJob(targeting, {
    title,
    location: job.location ?? null,
    description: job.description ?? null,
    remote: job.workplaceType ?? null,
  })
  const existing = job.externalId
    ? await db.prepare('SELECT id FROM jobs WHERE company_id = ? AND source = ? AND external_id = ? UNION SELECT id FROM jobs WHERE url = ? LIMIT 1')
      .bind(company.id, job.source, job.externalId, jobUrl).first<{ id: number }>()
    : await db.prepare('SELECT id FROM jobs WHERE url = ?').bind(jobUrl).first<{ id: number }>()

  if (existing) {
    await db.prepare(`UPDATE jobs SET company_id = ?, company_name = ?, title = ?, location = ?, remote = ?, url = ?, apply_url = ?, source = ?, external_id = ?, description = ?, department = ?, employment_type = ?, salary_min = ?, salary_max = ?, posted_at = ?, deadline = ?, last_seen_at = datetime('now'), last_seen_run_id = ?, is_active = 1, ranking_score = ?, ranking_reason = ? WHERE id = ?`)
      .bind(company.id, company.name, title, job.location ?? null, job.workplaceType ?? null, jobUrl, job.applyUrl ?? null,
        job.source, job.externalId ?? null, job.description ?? null, job.department ?? null, job.employmentType ?? null,
        job.salaryMin ?? null, job.salaryMax ?? null, job.postedAt ?? null, job.deadline ?? null, runId,
        ranking.score, ranking.reason, existing.id).run()
    return false
  }

  await db.prepare(`INSERT INTO jobs (company_id, company_name, title, location, remote, url, apply_url, source, external_id, description, department, employment_type, salary_min, salary_max, posted_at, deadline, first_seen_at, last_seen_at, last_seen_run_id, is_active, ranking_score, ranking_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, 1, ?, ?)`)
    .bind(company.id, company.name, title, job.location ?? null, job.workplaceType ?? null, jobUrl, job.applyUrl ?? null,
      job.source, job.externalId ?? null, job.description ?? null, job.department ?? null, job.employmentType ?? null,
      job.salaryMin ?? null, job.salaryMax ?? null, job.postedAt ?? null, job.deadline ?? null, runId,
      ranking.score, ranking.reason).run()
  return true
}

async function scoreRunInBackground(env: Bindings, runId: string): Promise<void> {
  const profile = await env.DB.prepare('SELECT resume_text, role_preferences, company_preferences FROM profile WHERE id = 1')
    .first<{ resume_text: string | null; role_preferences: string | null; company_preferences: string | null }>()
  if (!env.ANTHROPIC_API_KEY || !profile?.resume_text) {
    await env.DB.prepare("UPDATE scrape_runs SET status = 'completed', completed_at = datetime('now') WHERE id = ?").bind(runId).run()
    return
  }
  const { results } = await env.DB.prepare(`SELECT id, title, company_name, location, description FROM (
    SELECT id, title, company_name, location, description,
      ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY ranking_score DESC) AS company_rank
    FROM jobs WHERE last_seen_run_id = ? AND is_active = 1 AND ranking_score >= 40 AND match_score IS NULL
  ) WHERE company_rank <= 25 LIMIT 100`).bind(runId).all<{ id: number; title: string; company_name: string; location: string | null; description: string | null }>()
  let ranked = 0
  for (let index = 0; index < results.length; index += 10) {
    try {
      const scores = await scoreJobsRelevanceBatch({ apiKey: env.ANTHROPIC_API_KEY, resumeText: profile.resume_text,
        rolePreferences: profile.role_preferences, companyPreferences: profile.company_preferences, jobs: results.slice(index, index + 10) })
      for (const score of scores) {
        await env.DB.prepare('UPDATE jobs SET match_score = ?, match_reason = ? WHERE id = ?').bind(
          Math.max(0, Math.min(100, score.score)), score.reason, score.id,
        ).run()
        ranked++
      }
      await env.DB.prepare('UPDATE scrape_runs SET jobs_ranked = ? WHERE id = ?').bind(ranked, runId).run()
    } catch {
      // Estimated scores remain usable when one LLM batch fails.
    }
  }
  await env.DB.prepare("UPDATE scrape_runs SET status = 'completed', jobs_ranked = ?, completed_at = datetime('now') WHERE id = ?")
    .bind(ranked, runId).run()
}

scrape.post('/runs', async (c) => {
  if (!c.env.APIFY_TOKEN || !c.env.APIFY_ACTOR_ID || !c.env.SCRAPE_CALLBACK_SECRET) {
    return c.json({ error: 'APIFY_TOKEN, APIFY_ACTOR_ID, and SCRAPE_CALLBACK_SECRET must be configured' }, 500)
  }
  const profile = await c.env.DB.prepare('SELECT max_companies_per_scrape, targeting_effective_json FROM profile WHERE id = 1')
    .first<{ max_companies_per_scrape: number; targeting_effective_json: string | null }>()
  let targeting: TargetingProfile
  try { targeting = parseTargetingProfile(profile?.targeting_effective_json ? JSON.parse(profile.targeting_effective_json) : null) }
  catch { targeting = parseTargetingProfile(null) }
  if (!isTargetingProfileReady(targeting)) {
    return c.json({ error: 'Complete your targeting profile with at least one target title and one preferred location before scraping' }, 409)
  }
  const { results: companies } = await c.env.DB.prepare('SELECT id, name, ats_type, ats_slug, careers_url FROM companies ORDER BY last_scraped_at ASC NULLS FIRST LIMIT ?')
    .bind(profile?.max_companies_per_scrape ?? 10).all<CompanyRow>()
  if (companies.length === 0) return c.json({ error: 'add at least one company before scraping' }, 409)

  const runId = crypto.randomUUID()
  await c.env.DB.prepare("INSERT INTO scrape_runs (id, status, companies_total, started_at) VALUES (?, 'queued', ?, datetime('now'))")
    .bind(runId, companies.length).run()
  await c.env.DB.batch(companies.map((company) => c.env.DB.prepare(
    "INSERT INTO scrape_run_companies (run_id, company_id, status) VALUES (?, ?, 'queued')",
  ).bind(runId, company.id)))

  const baseUrl = (c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin).replace(/\/$/, '')
  const token = await callbackToken(c.env.SCRAPE_CALLBACK_SECRET, runId)
  const response = await fetch(`https://api.apify.com/v2/acts/${actorId(c.env.APIFY_ACTOR_ID)}/runs?token=${encodeURIComponent(c.env.APIFY_TOKEN)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId, callbackBaseUrl: baseUrl, callbackToken: token, targetingProfile: targeting, policy: SCAN_POLICY,
      companies: companies.map((company) => ({ id: company.id, name: company.name, sourceType: company.ats_type,
        sourceKey: company.ats_slug, careersUrl: company.careers_url })) }),
  })
  if (!response.ok) {
    const error = `Apify start failed (${response.status}): ${await response.text()}`
    await c.env.DB.prepare("UPDATE scrape_runs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?").bind(error, runId).run()
    return c.json({ error }, 502)
  }
  const payload = await response.json<{ data: { id: string } }>()
  await c.env.DB.prepare("UPDATE scrape_runs SET status = 'running', apify_run_id = ? WHERE id = ?").bind(payload.data.id, runId).run()
  return c.json(await readRun(c.env.DB, runId), 202)
})

scrape.post('/runs/:id/batches', async (c) => {
  const runId = c.req.param('id')
  const denied = await authorizeCallback(c, runId)
  if (denied) return denied
  const body = await c.req.json<{ companyId: number; jobs: IncomingJob[] }>()
  if (!Number.isInteger(body.companyId) || !Array.isArray(body.jobs) || body.jobs.length > 100) return c.json({ error: 'invalid batch' }, 400)
  const company = await c.env.DB.prepare('SELECT c.id, c.name, c.ats_type, c.ats_slug, c.careers_url FROM companies c JOIN scrape_run_companies src ON src.company_id = c.id WHERE src.run_id = ? AND c.id = ?')
    .bind(runId, body.companyId).first<CompanyRow>()
  if (!company) return c.json({ error: 'company is not part of this run' }, 404)
  const targeting = await effectiveTargeting(c.env.DB)
  let jobsNew = 0
  let rejected = 0
  for (const job of body.jobs) {
    const eligibility = isJobEligible(targeting, { title: job.title, location: job.location, remote: job.workplaceType, postedAt: job.postedAt }, SCAN_POLICY.maxAgeDays)
    if (!eligibility.eligible) { rejected++; continue }
    if (await upsertIncomingJob(c.env.DB, runId, company, job, targeting)) jobsNew++
  }
  if (jobsNew > 0) {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE scrape_run_companies SET jobs_new = jobs_new + ? WHERE run_id = ? AND company_id = ?').bind(jobsNew, runId, company.id),
      c.env.DB.prepare('UPDATE scrape_runs SET jobs_new = jobs_new + ? WHERE id = ?').bind(jobsNew, runId),
    ])
  }
  return c.json({ accepted: body.jobs.length - rejected, rejected, jobsNew })
})

scrape.post('/runs/:id/companies/:companyId/complete', async (c) => {
  const runId = c.req.param('id')
  const denied = await authorizeCallback(c, runId)
  if (denied) return denied
  const companyId = Number(c.req.param('companyId'))
  const body = await c.req.json<{ status: string; detectedSource: string | null; detectedSourceKey: string | null; careersUrl: string | null; pagesVisited: number; jobsDiscovered: number; jobsFound: number; stopReason: string; error: string | null }>()
  if (!TERMINAL_COMPANY_STATUSES.includes(body.status)) return c.json({ error: 'invalid company status' }, 400)
  const previous = await c.env.DB.prepare('SELECT status FROM scrape_run_companies WHERE run_id = ? AND company_id = ?').bind(runId, companyId).first<{ status: string }>()
  if (!previous) return c.json({ error: 'company is not part of this run' }, 404)
  if (shouldDeactivateMissing(body.status, body.stopReason)) {
    await c.env.DB.prepare("UPDATE jobs SET is_active = 0 WHERE company_id = ? AND COALESCE(last_seen_run_id, '') <> ?").bind(companyId, runId).run()
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE scrape_run_companies SET status = ?, detected_source = ?, pages_visited = ?, jobs_discovered = ?, jobs_found = ?, stop_reason = ?, error = ?, completed_at = datetime('now') WHERE run_id = ? AND company_id = ?")
      .bind(body.status, body.detectedSource, body.pagesVisited ?? 0, body.jobsDiscovered ?? 0, body.jobsFound ?? 0, body.stopReason, body.error, runId, companyId),
    c.env.DB.prepare("UPDATE companies SET ats_type = COALESCE(?, ats_type), ats_slug = COALESCE(?, ats_slug), careers_url = COALESCE(?, careers_url), last_scraped_at = datetime('now'), last_scrape_status = ?, last_scrape_error = ?, last_jobs_discovered = ?, last_jobs_found = ?, last_pages_visited = ? WHERE id = ?")
      .bind(body.detectedSource, body.detectedSourceKey, body.careersUrl, body.status, body.error, body.jobsDiscovered ?? 0, body.jobsFound ?? 0, body.pagesVisited ?? 0, companyId),
  ])
  const counts = await c.env.DB.prepare(`SELECT COUNT(*) AS completed, COALESCE(SUM(jobs_found), 0) AS found FROM scrape_run_companies WHERE run_id = ? AND status IN ('succeeded', 'partial', 'failed')`)
    .bind(runId).first<{ completed: number; found: number }>()
  await c.env.DB.prepare('UPDATE scrape_runs SET companies_completed = ?, jobs_found = ? WHERE id = ?').bind(counts?.completed ?? 0, counts?.found ?? 0, runId).run()
  return c.json({ ok: true })
})

scrape.post('/runs/:id/complete', async (c) => {
  const runId = c.req.param('id')
  const denied = await authorizeCallback(c, runId)
  if (denied) return denied
  const run = await c.env.DB.prepare('SELECT status FROM scrape_runs WHERE id = ?').bind(runId).first<{ status: string }>()
  if (!run) return c.json({ error: 'not found' }, 404)
  if (run.status === 'completed') return c.json({ ok: true })
  await c.env.DB.prepare("UPDATE scrape_runs SET status = 'scoring' WHERE id = ?").bind(runId).run()
  c.executionCtx.waitUntil(scoreRunInBackground(c.env, runId))
  return c.json({ ok: true })
})

scrape.get('/runs/latest', async (c) => {
  const latest = await c.env.DB.prepare('SELECT id FROM scrape_runs ORDER BY created_at DESC LIMIT 1').first<{ id: string }>()
  if (!latest) return c.json(null)
  return c.json(await readRun(c.env.DB, latest.id))
})

scrape.get('/runs/:id', async (c) => {
  const run = await readRun(c.env.DB, c.req.param('id'))
  if (!run) return c.json({ error: 'not found' }, 404)
  return c.json(run)
})

export default scrape
