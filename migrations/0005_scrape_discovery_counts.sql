ALTER TABLE companies ADD COLUMN last_jobs_discovered INTEGER;
ALTER TABLE scrape_run_companies ADD COLUMN jobs_discovered INTEGER NOT NULL DEFAULT 0;
