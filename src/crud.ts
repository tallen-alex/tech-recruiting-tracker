import { Hono } from 'hono'
import type { Bindings } from './types'

export function crudRouter(opts: {
  table: string
  writableColumns: string[]
  orderBy: string
  /** Column stamped with the current time server-side on every PATCH, e.g. "last_update". */
  touchColumn?: string
}) {
  const { table, writableColumns, orderBy, touchColumn } = opts
  const router = new Hono<{ Bindings: Bindings }>()

  router.get('/', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all()
    return c.json(results)
  })

  router.get('/:id', async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(c.req.param('id')).first()
    if (!row) return c.json({ error: 'not found' }, 404)
    return c.json(row)
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const columns = writableColumns.filter((col) => col in body)
    if (columns.length === 0) return c.json({ error: 'no writable fields provided' }, 400)
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) RETURNING *`
    const row = await c.env.DB.prepare(sql)
      .bind(...columns.map((col) => body[col]))
      .first()
    return c.json(row, 201)
  })

  router.patch('/:id', async (c) => {
    const body = await c.req.json()
    const columns = writableColumns.filter((col) => col in body)
    if (columns.length === 0) return c.json({ error: 'no writable fields provided' }, 400)
    const setClauses = columns.map((col) => `${col} = ?`)
    if (touchColumn) setClauses.push(`${touchColumn} = datetime('now')`)
    const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = ? RETURNING *`
    const row = await c.env.DB.prepare(sql)
      .bind(
        ...columns.map((col) => body[col]),
        c.req.param('id'),
      )
      .first()
    if (!row) return c.json({ error: 'not found' }, 404)
    return c.json(row)
  })

  router.delete('/:id', async (c) => {
    await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(c.req.param('id')).run()
    return c.body(null, 204)
  })

  return router
}
