import { Hono } from 'hono'
import type { Bindings } from './types'
import { crudRouter } from './crud'
import profileRoutes from './routes/profile'
import scrapeRoutes from './routes/scrape'
import companiesRoutes from './routes/companies'
import jobsRoutes from './routes/jobs'

const app = new Hono<{ Bindings: Bindings }>()

app.route('/api/jobs', jobsRoutes)

app.route(
  '/api/applications',
  crudRouter({
    table: 'applications',
    orderBy: 'last_update DESC',
    touchColumn: 'last_update',
    writableColumns: ['job_id', 'company_name', 'title', 'status', 'applied_date', 'resume_version', 'referral', 'notes'],
  }),
)

app.route(
  '/api/contacts',
  crudRouter({
    table: 'contacts',
    orderBy: 'created_at DESC',
    writableColumns: [
      'job_id',
      'company_name',
      'name',
      'title',
      'team',
      'linkedin_url',
      'email',
      'outreach_status',
      'last_contacted',
      'notes',
    ],
  }),
)

app.route('/api/companies', companiesRoutes)

app.route('/api/profile', profileRoutes)
app.route('/api/scrape', scrapeRoutes)

app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
