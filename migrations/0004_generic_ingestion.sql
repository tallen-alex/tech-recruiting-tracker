ALTER TABLE companies ADD COLUMN last_scrape_status TEXT;
ALTER TABLE companies ADD COLUMN last_scrape_error TEXT;
ALTER TABLE companies ADD COLUMN last_jobs_found INTEGER;
ALTER TABLE companies ADD COLUMN last_pages_visited INTEGER;

ALTER TABLE jobs ADD COLUMN external_id TEXT;
ALTER TABLE jobs ADD COLUMN department TEXT;
ALTER TABLE jobs ADD COLUMN employment_type TEXT;
ALTER TABLE jobs ADD COLUMN apply_url TEXT;
ALTER TABLE jobs ADD COLUMN first_seen_at TEXT;
ALTER TABLE jobs ADD COLUMN last_seen_at TEXT;
ALTER TABLE jobs ADD COLUMN last_seen_run_id TEXT;
ALTER TABLE jobs ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE jobs ADD COLUMN ranking_score REAL;
ALTER TABLE jobs ADD COLUMN ranking_reason TEXT;

UPDATE jobs
SET first_seen_at = COALESCE(created_at, scraped_at, datetime('now')),
    last_seen_at = COALESCE(scraped_at, created_at, datetime('now'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_external
  ON jobs(company_id, source, external_id)
  WHERE company_id IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_active_rank
  ON jobs(is_active, ranking_score DESC, scraped_at DESC);

ALTER TABLE profile ADD COLUMN targeting_generated_json TEXT;
ALTER TABLE profile ADD COLUMN targeting_effective_json TEXT;
ALTER TABLE profile ADD COLUMN targeting_is_edited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile ADD COLUMN targeting_candidate_json TEXT;
ALTER TABLE profile ADD COLUMN targeting_updated_at TEXT;

CREATE TABLE scrape_runs (
  id TEXT PRIMARY KEY,
  apify_run_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  companies_total INTEGER NOT NULL DEFAULT 0,
  companies_completed INTEGER NOT NULL DEFAULT 0,
  jobs_found INTEGER NOT NULL DEFAULT 0,
  jobs_new INTEGER NOT NULL DEFAULT 0,
  jobs_ranked INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE scrape_run_companies (
  run_id TEXT NOT NULL REFERENCES scrape_runs(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  detected_source TEXT,
  pages_visited INTEGER NOT NULL DEFAULT 0,
  jobs_found INTEGER NOT NULL DEFAULT 0,
  jobs_new INTEGER NOT NULL DEFAULT 0,
  stop_reason TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  PRIMARY KEY (run_id, company_id)
);

CREATE INDEX idx_scrape_runs_created ON scrape_runs(created_at DESC);
