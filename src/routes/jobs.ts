import { Hono } from 'hono'
import type { Bindings } from '../types'
import { extractJobRequirements } from '../requirements'

const jobs = new Hono<{ Bindings: Bindings }>()

/** Requirements are derived on read so every source — and every existing row — gets them without a backfill. */
function withRequirements<T extends { description?: unknown }>(row: T) {
  return { ...row, ...extractJobRequirements(typeof row.description === 'string' ? row.description : null) }
}

/**
 * Active postings closing within the window, soonest first. Anything already marked applied or skipped
 * is left out — the point is what still needs action.
 * Deadlines are stored as naive UTC ("2026-09-30T05:00:00") or date-only; datetime() normalizes both for
 * comparison. The window starts a day back so a date-only deadline stays listed through its whole day —
 * the client does the exact local-time cut.
 */
jobs.get('/deadlines', async (c) => {
  const days = Math.min(30, Math.max(1, Number(c.req.query('days')) || 7))
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM jobs
     WHERE is_active = 1 AND deadline IS NOT NULL AND COALESCE(status, 'new') NOT IN ('applied', 'skipped')
       AND datetime(deadline) >= datetime('now', '-1 day') AND datetime(deadline) <= datetime('now', ?)
     ORDER BY datetime(deadline) ASC, COALESCE(match_score, ranking_score, -1) DESC
     LIMIT 100`,
  )
    .bind(`+${days} days`)
    .all<Record<string, unknown>>()
  return c.json({ days, items: results.map(withRequirements) })
})

jobs.get('/', async (c) => {
  const active = c.req.query('active') ?? 'true'
  const sort = c.req.query('sort') === 'recent' ? 'recent' : 'relevance'
  const search = (c.req.query('search') ?? '').trim()
  const companyId = Number(c.req.query('companyId'))
  const minScore = Number(c.req.query('minScore'))
  const page = Math.max(1, Number(c.req.query('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 50))
  const where: string[] = []
  const params: unknown[] = []

  if (active === 'true') where.push('is_active = 1')
  else if (active === 'false') where.push('is_active = 0')
  if (search) {
    where.push('(title LIKE ? OR company_name LIKE ? OR COALESCE(description, \'\') LIKE ?)')
    const pattern = `%${search}%`
    params.push(pattern, pattern, pattern)
  }
  if (Number.isInteger(companyId) && companyId > 0) {
    where.push('company_id = ?')
    params.push(companyId)
  }
  if (Number.isFinite(minScore)) {
    where.push('COALESCE(match_score, ranking_score, 0) >= ?')
    params.push(minScore)
  }
  // The CMS board carries thousands of postings, so it lives in its own view rather than
  // drowning the tracked-company feed. Callers opt in with `source` or opt out with `excludeSource`.
  const source = (c.req.query('source') ?? '').trim()
  if (source) {
    where.push('source = ?')
    params.push(source)
  }
  const excludeSource = (c.req.query('excludeSource') ?? '').trim()
  if (excludeSource) {
    where.push("COALESCE(source, '') != ?")
    params.push(excludeSource)
  }
  // Sponsorship is a best-effort read of the posting text, so filtering is opt-in and never a default.
  // 'open' means "not an explicit refusal" — it keeps `unclear` rows, which is the honest grouping
  // when most postings simply never mention sponsorship.
  const sponsorship = (c.req.query('sponsorship') ?? '').trim()
  if (sponsorship === 'open') where.push("COALESCE(sponsorship, 'unclear') != 'not_sponsored'")
  else if (sponsorship === 'sponsored' || sponsorship === 'not_sponsored' || sponsorship === 'unclear') {
    where.push("COALESCE(sponsorship, 'unclear') = ?")
    params.push(sponsorship)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const orderSql = sort === 'recent'
    ? 'ORDER BY COALESCE(posted_at, scraped_at) DESC'
    : 'ORDER BY COALESCE(match_score, ranking_score, -1) DESC, COALESCE(posted_at, scraped_at) DESC'
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM jobs ${whereSql}`).bind(...params).first<{ total: number }>()
  const { results } = await c.env.DB.prepare(`SELECT * FROM jobs ${whereSql} ${orderSql} LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, (page - 1) * pageSize).all<Record<string, unknown>>()
  return c.json({ items: results.map(withRequirements), page, pageSize, total: count?.total ?? 0 })
})

jobs.patch('/:id', async (c) => {
  const body = await c.req.json<Record<string, unknown>>()
  const writable = ['status']
  const columns = writable.filter((column) => column in body)
  if (columns.length === 0) return c.json({ error: 'no writable fields provided' }, 400)
  const row = await c.env.DB.prepare(`UPDATE jobs SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? RETURNING *`)
    .bind(...columns.map((column) => body[column]), c.req.param('id')).first()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

export default jobs
