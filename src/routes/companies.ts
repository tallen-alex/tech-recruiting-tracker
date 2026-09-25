import { Hono } from 'hono'
import type { Bindings } from '../types'
import { autoDetectAtsFree, greenhouseSlugValid, leverSlugValid } from '../scrape/autodetect'
import { discoverCompanyCareersInfo } from '../llm/anthropic'

const companies = new Hono<{ Bindings: Bindings }>()

/** Free guess first; LLM+search fallback only if that fails, and even then the result is re-verified against the real API before being trusted (search grounding reduces hallucination, doesn't eliminate it). */
async function detectAts(
  companyName: string,
  anthropicKey: string | undefined,
): Promise<{ ats_type: string | null; ats_slug: string | null; careers_url: string | null }> {
  const free = await autoDetectAtsFree(companyName)
  if (free) return { ats_type: free.ats_type, ats_slug: free.ats_slug, careers_url: null }

  if (!anthropicKey) return { ats_type: null, ats_slug: null, careers_url: null }

  const found = await discoverCompanyCareersInfo({ apiKey: anthropicKey, companyName })
  if (!found?.ats_type) return { ats_type: null, ats_slug: null, careers_url: null }

  if (found.ats_type === 'custom') {
    return found.careers_url
      ? { ats_type: 'custom', ats_slug: null, careers_url: found.careers_url }
      : { ats_type: null, ats_slug: null, careers_url: null }
  }

  if (!found.ats_slug) return { ats_type: null, ats_slug: null, careers_url: null }
  const verified =
    found.ats_type === 'greenhouse' ? await greenhouseSlugValid(found.ats_slug) : await leverSlugValid(found.ats_slug)
  return verified ? { ats_type: found.ats_type, ats_slug: found.ats_slug, careers_url: null } : { ats_type: null, ats_slug: null, careers_url: null }
}

companies.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM companies ORDER BY name ASC').all()
  return c.json(results)
})

companies.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(c.req.param('id')).first()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

companies.post('/', async (c) => {
  const body = await c.req.json()
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'name is required' }, 400)

  let ats_type: string | null = typeof body.ats_type === 'string' ? body.ats_type : null
  let ats_slug: string | null = typeof body.ats_slug === 'string' ? body.ats_slug : null
  let careers_url: string | null = typeof body.careers_url === 'string' ? body.careers_url : null

  // Only auto-detect when the caller didn't already supply a source — manual entry always wins.
  if (!ats_type && !careers_url) {
    const detected = await detectAts(name, c.env.ANTHROPIC_API_KEY)
    ats_type = detected.ats_type
    ats_slug = detected.ats_slug
    careers_url = detected.careers_url
  }

  try {
    const row = await c.env.DB.prepare('INSERT INTO companies (name, ats_type, ats_slug, careers_url) VALUES (?, ?, ?, ?) RETURNING *')
      .bind(name, ats_type, ats_slug, careers_url)
      .first()
    return c.json(row, 201)
  } catch (err) {
    return c.json({ error: `Couldn't add "${name}" — ${err instanceof Error ? err.message : String(err)}` }, 409)
  }
})

companies.patch('/:id', async (c) => {
  const body = await c.req.json()
  const writableColumns = ['name', 'domain', 'ats_type', 'ats_slug', 'careers_url', 'notes']
  const columns = writableColumns.filter((col) => col in body)
  if (columns.length === 0) return c.json({ error: 'no writable fields provided' }, 400)
  const sql = `UPDATE companies SET ${columns.map((col) => `${col} = ?`).join(', ')} WHERE id = ? RETURNING *`
  const row = await c.env.DB.prepare(sql)
    .bind(...columns.map((col) => body[col]), c.req.param('id'))
    .first()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

companies.delete('/:id', async (c) => {
  const id = c.req.param('id')

  // A tracked company may already have historical jobs. Keep those jobs, but
  // detach them so the company can be removed from the future scrape list.
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE jobs SET company_id = NULL WHERE company_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM companies WHERE id = ?').bind(id),
  ])
  return c.body(null, 204)
})

export default companies
