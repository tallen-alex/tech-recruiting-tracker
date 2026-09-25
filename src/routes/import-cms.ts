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
/** Postings per lookup query — each binds two params, and D1 allows 100 bound params per statement. */
const LOOKUP_CHUNK = 45
/** Statements per D1 batch call. */
const WRITE_BATCH = 100

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

  // A Worker request may make at most 1,000 D1 calls, and the board lists hundreds of postings, so this
  // must not do per-posting round trips: rows are ranked in memory, looked up in chunks, and written in batches.
  // Keyed by URL (the jobs table's unique column) so duplicates within one sync collapse to the last copy.
  const rows = new Map<string, {
    externalId: string
    title: string
    url: string
    companyName: string
    logoUrl: string | null
    location: string | null
    postedAt: string | null
    deadline: string | null
  }>()
  for (const listing of listings) {
    const title = typeof listing.title === 'string' ? listing.title.trim() : ''
    const url = typeof listing.url === 'string' ? listing.url.trim() : ''
    const externalId = typeof listing.externalId === 'string' ? listing.externalId : String(listing.externalId ?? '')
    if (!title || !url || !externalId) continue
    rows.set(url, {
      externalId,
      title,
      url,
      companyName: (listing.companyName ?? '').trim() || 'Unknown',
      logoUrl: safeLogoUrl(listing.logoUrl),
      location: listing.location ?? null,
      postedAt: listing.postedAt ?? null,
      deadline: listing.deadline ?? null,
    })
  }
  const incoming = [...rows.values()]

  const existingByExternalId = new Map<string, number>()
  const existingByUrl = new Map<string, number>()
  for (let index = 0; index < incoming.length; index += LOOKUP_CHUNK) {
    const chunk = incoming.slice(index, index + LOOKUP_CHUNK)
    const placeholders = chunk.map(() => '?').join(', ')
    const { results } = await c.env.DB.prepare(
      `SELECT id, external_id, url FROM jobs WHERE (source = ? AND external_id IN (${placeholders})) OR url IN (${placeholders})`,
    )
      .bind(CMS_SOURCE, ...chunk.map((row) => row.externalId), ...chunk.map((row) => row.url))
      .all<{ id: number; external_id: string | null; url: string | null }>()
    for (const row of results) {
      if (row.external_id) existingByExternalId.set(row.external_id, row.id)
      if (row.url) existingByUrl.set(row.url, row.id)
    }
  }

  const targeting = await effectiveTargeting(c.env.DB)
  const statements: D1PreparedStatement[] = []
  let created = 0
  let updated = 0

  for (const row of incoming) {
    // Phase 1 ranks on title alone; /details re-ranks once the description lands.
    const { score, reason } = scoreDeterministicJob(
      targeting,
      { title: row.title, location: row.location, description: null, remote: null },
      { ignoreLocation: true },
    )
    const existingId = existingByExternalId.get(row.externalId) ?? existingByUrl.get(row.url)
    if (existingId !== undefined) {
      statements.push(
        c.env.DB.prepare(
          `UPDATE jobs SET company_name = ?, title = ?, location = ?, url = ?, posted_at = ?, deadline = ?,
           company_logo_url = COALESCE(?, company_logo_url), last_seen_at = datetime('now'), is_active = 1,
           ranking_score = ?, ranking_reason = ? WHERE id = ?`,
        ).bind(row.companyName, row.title, row.location, row.url, row.postedAt, row.deadline, row.logoUrl, score, reason, existingId),
      )
      updated++
    } else {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO jobs (company_name, company_logo_url, title, location, url, source, external_id, posted_at, deadline,
           first_seen_at, last_seen_at, is_active, status, ranking_score, ranking_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 1, 'new', ?, ?)`,
        ).bind(row.companyName, row.logoUrl, row.title, row.location, row.url, CMS_SOURCE, row.externalId, row.postedAt, row.deadline, score, reason),
      )
      created++
    }
  }

  for (let index = 0; index < statements.length; index += WRITE_BATCH) {
    await c.env.DB.batch(statements.slice(index, index + WRITE_BATCH))
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
