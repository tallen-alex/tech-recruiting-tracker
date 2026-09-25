# Tech Recruiting Tracker

End-to-end app for the job search: scraped job feed, application tracker, and networking/hiring-manager finder.

## Stack

- **Backend:** Cloudflare Workers, Hono, and D1
- **Frontend:** React, Vite, TypeScript, and Tailwind CSS
- **Scraping:** A project-owned TypeScript Apify Actor
- **Ranking:** deterministic targeting-profile scoring with bounded Claude enrichment
- **Deploy:** one Worker serving the API and compiled frontend assets

## Current capabilities

- Persistent asynchronous scrape runs with per-company progress and coverage
- Structured adapters for Greenhouse, Lever, Ashby, Workday, SmartRecruiters, and Apple
- Bounded JSON-LD/job-link browser fallback for other public careers sites
- Idempotent job ingestion, first/last-seen lifecycle tracking, and safe closure detection
- Editable targeting profiles and deterministic relevance ranking for every posting
- Paginated active/all/inactive job feeds with Detailed and Estimated score labels
- Application and contact history retained independently of tracked-company removal

## Generic company-careers ingestion

The production scraper is the project-owned Actor in `apify/company-careers`. It detects and paginates Greenhouse, Lever, Ashby, Workday, SmartRecruiters, and Apple, then falls back to a bounded JSON-LD/job-link browser crawl for custom sites. The Worker starts runs asynchronously and receives HMAC-authenticated result batches, so large company inventories do not hold an HTTP request open.

### One-time setup

1. Apply `migrations/0004_generic_ingestion.sql` to the production D1 database with `npx wrangler d1 execute tech-recruiting-tracker --remote --file=migrations/0004_generic_ingestion.sql`.
2. In `apify/company-careers`, run `npm install`, `npm test`, and `apify push` (or connect that subdirectory through Apify's Git source configuration).
3. Configure the Worker:
   - `wrangler secret put APIFY_TOKEN`
   - `wrangler secret put APIFY_ACTOR_ID` using `account-name/tech-recruiting-company-careers`
   - `wrangler secret put SCRAPE_CALLBACK_SECRET` using a long random value
   - Set `PUBLIC_BASE_URL` as a Worker variable to the deployed HTTPS origin. For local development it may be omitted, in which case the request origin is used.
4. Deploy the Worker and frontend with `npm run deploy`.

No schedule is configured. Use **Scrape now** in Profile; progress and per-company coverage persist across navigation and reloads.

## Verification

Run `npm test`, `npx tsc --noEmit`, `npm --prefix frontend run lint`, `npm --prefix frontend run build`, and `npm --prefix apify/company-careers run build` before deployment. Actor fixtures include a multi-page Apple response with a Product Manager posting.
