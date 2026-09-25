import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings, TargetingProfile } from '../types'
import { parseTargetingProfile, scoreDeterministicJob } from '../ranking'
import { classifySponsorship } from '../sponsorship'
import { scoreJobsRelevanceBatch } from '../llm/anthropic'

/**
 * Import endpoints for the school CMS job board (12twenty).
 *
 * That board is session-gated, so the Worker can never fetch it directly — a bookmarklet running in
 * the user's already-logged-in browser does the fetching and posts results here. Two phases, because
 * job descriptions are only available one-request-per-posting: phase 1 takes the cheap list data for
 * everything and ranks it for free, phase 2 pulls descriptions for just the top slice.
 */
const importCms = new Hono<{ Bindings: Bindings }>()

export const CMS_SOURCE = 'cms-12twenty'
/** Descriptions cost one board request each, so only the strongest candidates earn one. */
const DETAIL_BUDGET = 60
const LLM_BATCH_SIZE = 10
const MAX_LLM_BATCHES = 6

const ALLOWED_ORIGIN = /^https:\/\/[a-z0-9-]+\.12twenty\.com$/i

importCms.use(
  '/*',
  cors({
    origin: (origin) => (origin && ALLOWED_ORIGIN.test(origin) ? origin : undefined),
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  }),
)

type IncomingListing = {
  externalId: string
  title: string
  companyName: string
  location: string | null
  url: string
  postedAt: string | null
  deadline: string | null
  status: string | null
  /** Public blob URL built by the sync script; roughly half of postings have one. */
  logoUrl: string | null
}

/** Logos are hotlinked from the board's public blob container, so only accept that shape. */
function safeLogoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.blob.core.windows.net') ? parsed.toString() : null
  } catch {
    return null
  }
}

async function effectiveTargeting(db: D1Database): Promise<TargetingProfile> {
  const row = await db.prepare('SELECT targeting_effective_json FROM profile WHERE id = 1').first<{
    targeting_effective_json: string | null
  }>()
  if (!row?.targeting_effective_json) return parseTargetingProfile(null)
  try {
    return parseTargetingProfile(JSON.parse(row.targeting_effective_json))
  } catch {
    return parseTargetingProfile(null)
  }
}

/**
 * Rescored on every touch: phase 1 ranks on title alone, phase 2 re-ranks once the description lands.
 * Location is ignored — everything on the school board is already somewhere the user can apply.
 */
async function rankAndPersist(
  db: D1Database,
  targeting: TargetingProfile,
  jobId: number,
  job: { title: string; location: string | null; description: string | null; remote: string | null },
) {
  const { score, reason } = scoreDeterministicJob(targeting, job, { ignoreLocation: true })
  await db.prepare('UPDATE jobs SET ranking_score = ?, ranking_reason = ? WHERE id = ?').bind(score, reason, jobId).run()
  return score
}

importCms.post('/listings', async (c) => {
  const body = await c.req.json().catch(() => null)
  const listings: IncomingListing[] = Array.isArray(body?.listings) ? body.listings : []
  if (listings.length === 0) return c.json({ error: 'expected a non-empty "listings" array' }, 400)

  const targeting = await effectiveTargeting(c.env.DB)
  let created = 0
  let updated = 0

  for (const listing of listings) {
    const title = typeof listing.title === 'string' ? listing.title.trim() : ''
    const url = typeof listing.url === 'string' ? listing.url.trim() : ''
    const externalId = typeof listing.externalId === 'string' ? listing.externalId : String(listing.externalId ?? '')
    if (!title || !url || !externalId) continue

    const companyName = (listing.companyName ?? '').trim() || 'Unknown'
    const logoUrl = safeLogoUrl(listing.logoUrl)
    const existing = await c.env.DB.prepare(
      'SELECT id FROM jobs WHERE (source = ? AND external_id = ?) OR url = ? LIMIT 1',
    )
      .bind(CMS_SOURCE, externalId, url)
      .first<{ id: number }>()

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE jobs SET company_name = ?, title = ?, location = ?, url = ?, posted_at = ?, deadline = ?,
         company_logo_url = COALESCE(?, company_logo_url), last_seen_at = datetime('now'), is_active = 1 WHERE id = ?`,
      )
        .bind(companyName, title, listing.location ?? null, url, listing.postedAt ?? null, listing.deadline ?? null, logoUrl, existing.id)
        .run()
      updated++
      await rankAndPersist(c.env.DB, targeting, existing.id, {
        title,
        location: listing.location ?? null,
        description: null,
        remote: null,
      })
      continue
    }

    const inserted = await c.env.DB.prepare(
      `INSERT INTO jobs (company_name, company_logo_url, title, location, url, source, external_id, posted_at, deadline,
       first_seen_at, last_seen_at, is_active, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 1, 'new') RETURNING id`,
    )
      .bind(companyName, logoUrl, title, listing.location ?? null, url, CMS_SOURCE, externalId, listing.postedAt ?? null, listing.deadline ?? null)
      .first<{ id: number }>()
    if (!inserted) continue
    created++
    await rankAndPersist(c.env.DB, targeting, inserted.id, {
      title,
      location: listing.location ?? null,
      description: null,
      remote: null,
    })
  }

  // Only the best-ranked postings still missing a description earn a detail fetch.
  const { results: needDetail } = await c.env.DB.prepare(
    `SELECT external_id FROM jobs
     WHERE source = ? AND is_active = 1 AND (description IS NULL OR description = '')
     ORDER BY ranking_score DESC LIMIT ?`,
  )
    .bind(CMS_SOURCE, DETAIL_BUDGET)
    .all<{ external_id: string }>()

  return c.json({
    received: listings.length,
    created,
    updated,
    needDetail: needDetail.map((row) => row.external_id),
  })
})

async function scoreCmsJobsInBackground(env: Bindings, jobIds: number[]) {
  const profile = await env.DB.prepare(
    'SELECT resume_text, role_preferences, company_preferences FROM profile WHERE id = 1',
  ).first<{ resume_text: string | null; role_preferences: string | null; company_preferences: string | null }>()
  if (!env.ANTHROPIC_API_KEY || !profile?.resume_text || jobIds.length === 0) return

  const placeholders = jobIds.map(() => '?').join(', ')
  const { results } = await env.DB.prepare(
    `SELECT id, title, company_name, location, description FROM jobs WHERE id IN (${placeholders}) ORDER BY ranking_score DESC`,
  )
    .bind(...jobIds)
    .all<{ id: number; title: string; company_name: string; location: string | null; description: string | null }>()

  for (let index = 0; index < results.length && index < LLM_BATCH_SIZE * MAX_LLM_BATCHES; index += LLM_BATCH_SIZE) {
    try {
      const scores = await scoreJobsRelevanceBatch({
        apiKey: env.ANTHROPIC_API_KEY,
        resumeText: profile.resume_text,
        rolePreferences: profile.role_preferences,
        companyPreferences: profile.company_preferences,
        jobs: results.slice(index, index + LLM_BATCH_SIZE),
      })
      for (const score of scores) {
        await env.DB.prepare('UPDATE jobs SET match_score = ?, match_reason = ? WHERE id = ?')
          .bind(Math.max(0, Math.min(100, score.score)), score.reason, score.id)
          .run()
      }
    } catch {
      // Deterministic ranking_score still stands in when a batch fails.
    }
  }
}

importCms.post('/details', async (c) => {
  const body = await c.req.json().catch(() => null)
  const details: Array<{
    externalId: string
    description: string | null
    salaryMin: number | null
    salaryMax: number | null
    applyUrl: string | null
    department: string | null
    employmentType: string | null
    /** Whatever work-authorization text the sync script found on the posting; often blank. */
    workAuthRaw: string | null
  }> = Array.isArray(body?.details) ? body.details : []
  if (details.length === 0) return c.json({ error: 'expected a non-empty "details" array' }, 400)

  const targeting = await effectiveTargeting(c.env.DB)
  const touchedIds: number[] = []

  for (const detail of details) {
    const externalId = typeof detail.externalId === 'string' ? detail.externalId : String(detail.externalId ?? '')
    if (!externalId) continue
    const row = await c.env.DB.prepare('SELECT id, title, location FROM jobs WHERE source = ? AND external_id = ?')
      .bind(CMS_SOURCE, externalId)
      .first<{ id: number; title: string; location: string | null }>()
    if (!row) continue

    const verdict = classifySponsorship({
      description: detail.description ?? null,
      workAuthRaw: detail.workAuthRaw ?? null,
    })

    await c.env.DB.prepare(
      `UPDATE jobs SET description = ?, salary_min = ?, salary_max = ?, apply_url = ?, department = ?, employment_type = ?,
       work_auth_raw = ?, sponsorship = ?, sponsorship_evidence = ? WHERE id = ?`,
    )
      .bind(
        detail.description ?? null,
        detail.salaryMin ?? null,
        detail.salaryMax ?? null,
        detail.applyUrl ?? null,
        detail.department ?? null,
        detail.employmentType ?? null,
        detail.workAuthRaw ?? null,
        verdict.sponsorship,
        verdict.evidence,
        row.id,
      )
      .run()

    await rankAndPersist(c.env.DB, targeting, row.id, {
      title: row.title,
      location: row.location,
      description: detail.description ?? null,
      remote: null,
    })
    touchedIds.push(row.id)
  }

  const willScore = Boolean(c.env.ANTHROPIC_API_KEY) && touchedIds.length > 0
  if (willScore) c.executionCtx.waitUntil(scoreCmsJobsInBackground(c.env, touchedIds))

  return c.json({ updated: touchedIds.length, scoringQueued: willScore ? touchedIds.length : 0 })
})

export default importCms
