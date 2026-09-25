# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Backend: Cloudflare Workers + Hono (API layer, to be built) + D1 (SQLite), deployed as a single Worker serving both API and static frontend assets. Frontend: React + Vite + TypeScript + Tailwind v4 (scaffolded, default template not yet replaced). Scraping: Apify actors (Greenhouse/Lever/Workday ATS APIs, LinkedIn job and people search). Decided by the existing codebase, not asked during this init.

## Users

Primary user is Tallen, running his own tech job search. He shares the tool with one collaborator who also uses it during the search (their exact role — co-viewer vs. co-editor — is undecided; record as open rather than invented). Currently in the early-research stage of the search: mapping target companies and roles rather than actively applying, so the job feed and relevance scoring matter more right now than the application pipeline.

## Product Purpose

An end-to-end personal tool for a tech job search: a scraped, relevance-ranked job feed; a pipeline to track applications through to outcome; and a networking/hiring-manager finder tied to each job and company. Success is fewer missed follow-ups, less time manually tracking spreadsheet rows, and faster triage of which jobs are worth pursuing.

## Positioning

Personal-use tool built for exactly how Tallen (and his collaborator) work, not a commercial product competing for a market — no external positioning claim applies.

## Operating Context

Used primarily at a desktop, in day-to-day/weekly sessions: reviewing newly scraped jobs, updating application statuses, and logging outreach to contacts. Data lives in a live Cloudflare D1 database (`tech-recruiting-tracker`) with four tables — `jobs`, `applications`, `contacts`, `companies` (see `schema.sql`). Job data is meant to arrive via Apify scraping; that integration and its API key are not yet set up.

## Capabilities and Constraints

- Jobs feed: scraped postings with `match_score`/`match_reason` for relevance ranking (LLM-scored against Tallen's resume/target-role criteria — not yet supplied, so scoring isn't built yet).
- Applications: pipeline tracker linked to jobs, open-ended `status` field (defaults to "Applied").
- Contacts: hiring managers / networking targets linked to jobs, with `outreach_status`.
- Companies: lookup table for ATS type per company, to drive scraping.
- Backend (Hono API/CRUD routes) is not yet built.
- Frontend still shows the default Vite template — the three-tab dashboard (Jobs / Applications / Networking) is not yet built.
- Apify scraping and relevance scoring are not yet wired up.
- Deploy target: `wrangler deploy` as a single Worker.

## Brand Commitments

None. No established name beyond the working title "Tech Recruiting Tracker," no existing visual identity.

## Evidence on Hand

Live D1 schema already applied in Cloudflare (see `schema.sql`, `README.md`). No resume or target-role criteria captured yet — required before relevance scoring can be built; do not fabricate target roles, seniority, or company lists in the meantime.

## Product Principles

1. Functional over decorative — explicit user directive: this should read as a usable working tool, not a "vibe-coded" showpiece. Minimal ornamentation.
2. Scan speed over visual flourish — it's used to make real triage/follow-up decisions quickly, at a desktop, often against a list of many rows.
3. Data trustworthiness — application and contact status must always be accurate and current, since real job-search decisions ride on it.
4. Built for its two actual users — optimize for exactly how Tallen and his collaborator work, not a general audience.
