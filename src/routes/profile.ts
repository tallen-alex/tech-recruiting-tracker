import { Hono } from 'hono'
import type { Bindings, TargetingProfile } from '../types'
import { generateTargetingProfile, parseResume } from '../llm/anthropic'
import { parseTargetingProfile } from '../ranking'

const profile = new Hono<{ Bindings: Bindings }>()

async function getOrCreateProfile(db: D1Database) {
  const existing = await db.prepare('SELECT * FROM profile WHERE id = 1').first()
  if (existing) return existing
  return db.prepare('INSERT INTO profile (id) VALUES (1) RETURNING *').first()
}

type ProfileRow = Record<string, unknown> & {
  resume_text: string | null
  role_fit_summary: string | null
  role_preferences: string | null
  location_keywords: string | null
  targeting_generated_json: string | null
  targeting_effective_json: string | null
  targeting_candidate_json: string | null
  targeting_is_edited: number
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try { return JSON.parse(value) } catch { return null }
}

function serializeProfile(row: Record<string, unknown>) {
  const typed = row as ProfileRow
  return {
    ...row,
    targeting_generated: parseJson(typed.targeting_generated_json),
    targeting_effective: parseJson(typed.targeting_effective_json),
    targeting_candidate: parseJson(typed.targeting_candidate_json),
  }
}

async function regenerateTargeting(db: D1Database, apiKey: string, row: ProfileRow): Promise<void> {
  if (!row.resume_text && !row.role_preferences) return
  const generated = parseTargetingProfile(await generateTargetingProfile({
    apiKey,
    resumeText: row.resume_text,
    roleFitSummary: row.role_fit_summary,
    rolePreferences: row.role_preferences,
    locationKeywords: row.location_keywords,
  }))
  const json = JSON.stringify(generated)
  if (row.targeting_is_edited) {
    await db.prepare("UPDATE profile SET targeting_generated_json = ?, targeting_candidate_json = ?, targeting_updated_at = datetime('now') WHERE id = 1")
      .bind(json, json).run()
  } else {
    await db.prepare("UPDATE profile SET targeting_generated_json = ?, targeting_effective_json = ?, targeting_candidate_json = NULL, targeting_updated_at = datetime('now') WHERE id = 1")
      .bind(json, json).run()
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

profile.get('/', async (c) => {
  const row = await getOrCreateProfile(c.env.DB)
  return c.json(serializeProfile(row as Record<string, unknown>))
})

profile.patch('/', async (c) => {
  const body = await c.req.json()
  const writableColumns = ['role_preferences', 'company_preferences', 'location_keywords', 'max_companies_per_scrape']
  const columns = writableColumns.filter((col) => col in body)
  if (columns.length === 0) return c.json({ error: 'no writable fields provided' }, 400)
  await getOrCreateProfile(c.env.DB)
  const sql = `UPDATE profile SET ${columns.map((col) => `${col} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = 1 RETURNING *`
  let row = await c.env.DB.prepare(sql)
    .bind(...columns.map((col) => body[col]))
    .first<ProfileRow>()
  if (c.env.ANTHROPIC_API_KEY && row) {
    await regenerateTargeting(c.env.DB, c.env.ANTHROPIC_API_KEY, row)
    row = await c.env.DB.prepare('SELECT * FROM profile WHERE id = 1').first<ProfileRow>()
  }
  return c.json(serializeProfile(row as ProfileRow))
})

profile.post('/resume', async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)

  const body = await c.req.parseBody()
  const file = body.resume
  if (!(file instanceof File)) return c.json({ error: 'expected a "resume" file field' }, 400)
  if (file.type !== 'application/pdf') return c.json({ error: 'resume must be a PDF' }, 400)

  const bytes = await file.arrayBuffer()
  await c.env.RESUMES.put('resume.pdf', bytes, { httpMetadata: { contentType: 'application/pdf' } })

  const { resumeText, roleFitSummary } = await parseResume({
    apiKey: c.env.ANTHROPIC_API_KEY,
    pdfBase64: arrayBufferToBase64(bytes),
  })

  await getOrCreateProfile(c.env.DB)
  let row = await c.env.DB.prepare(
    `UPDATE profile SET resume_text = ?, resume_file_key = ?, role_fit_summary = ?, updated_at = datetime('now') WHERE id = 1 RETURNING *`,
  )
    .bind(resumeText, 'resume.pdf', roleFitSummary)
    .first<ProfileRow>()

  if (row) {
    await regenerateTargeting(c.env.DB, c.env.ANTHROPIC_API_KEY, row)
    row = await c.env.DB.prepare('SELECT * FROM profile WHERE id = 1').first<ProfileRow>()
  }

  return c.json(serializeProfile(row as ProfileRow))
})

profile.put('/targeting', async (c) => {
  const targeting = parseTargetingProfile(await c.req.json<TargetingProfile>())
  await getOrCreateProfile(c.env.DB)
  const row = await c.env.DB.prepare(
    "UPDATE profile SET targeting_effective_json = ?, targeting_is_edited = 1, targeting_updated_at = datetime('now') WHERE id = 1 RETURNING *",
  ).bind(JSON.stringify(targeting)).first<ProfileRow>()
  return c.json(serializeProfile(row as ProfileRow))
})

profile.post('/targeting/regenerate', async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500)
  let row = await getOrCreateProfile(c.env.DB) as ProfileRow
  await regenerateTargeting(c.env.DB, c.env.ANTHROPIC_API_KEY, row)
  row = await c.env.DB.prepare('SELECT * FROM profile WHERE id = 1').first<ProfileRow>() as ProfileRow
  return c.json(serializeProfile(row))
})

profile.post('/targeting/adopt', async (c) => {
  const row = await getOrCreateProfile(c.env.DB) as ProfileRow
  const candidate = row.targeting_candidate_json ?? row.targeting_generated_json
  if (!candidate) return c.json({ error: 'no generated targeting profile available' }, 409)
  const updated = await c.env.DB.prepare(
    "UPDATE profile SET targeting_effective_json = ?, targeting_is_edited = 0, targeting_candidate_json = NULL, targeting_updated_at = datetime('now') WHERE id = 1 RETURNING *",
  ).bind(candidate).first<ProfileRow>()
  return c.json(serializeProfile(updated as ProfileRow))
})

export default profile
