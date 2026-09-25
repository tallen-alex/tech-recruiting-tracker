-- Cloudflare D1 schema for tech-recruiting-tracker
-- Database already created: name "tech-recruiting-tracker", uuid 5e3aaf0e-1f6e-4044-890c-1bafde722310
-- (Already applied live — this file is for reference / local dev / re-provisioning.)

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  domain TEXT,
  ats_type TEXT,
  ats_slug TEXT,
  careers_url TEXT,
  last_scraped_at TEXT,
  last_scrape_status TEXT,
  last_scrape_error TEXT,
  last_jobs_discovered INTEGER,
  last_jobs_found INTEGER,
  last_pages_visited INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Singleton row (id fixed to 1): the one shared resume/preferences record.
CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  resume_text TEXT,
  resume_file_key TEXT,
  role_fit_summary TEXT,
  role_preferences TEXT,
  company_preferences TEXT,
  location_keywords TEXT,
  max_companies_per_scrape INTEGER NOT NULL DEFAULT 10,
  targeting_generated_json TEXT,
  targeting_effective_json TEXT,
  targeting_is_edited INTEGER NOT NULL DEFAULT 0,
  targeting_candidate_json TEXT,
  targeting_updated_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  company_name TEXT NOT NULL,
  company_logo_url TEXT,
  title TEXT NOT NULL,
  location TEXT,
  remote TEXT,
  url TEXT UNIQUE,
  source TEXT,
  external_id TEXT,
  description TEXT,
  department TEXT,
  employment_type TEXT,
  apply_url TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  posted_at TEXT,
  deadline TEXT,
  scraped_at TEXT DEFAULT (datetime('now')),
  match_score REAL,
  match_reason TEXT,
  ranking_score REAL,
  ranking_reason TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  last_seen_run_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id),
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Applied',
  applied_date TEXT,
  last_update TEXT DEFAULT (datetime('now')),
  resume_version TEXT,
  referral TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id),
  company_name TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  team TEXT,
  linkedin_url TEXT,
  email TEXT,
  outreach_status TEXT DEFAULT 'Not Contacted',
  last_contacted TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_company ON jobs(company_name);
CREATE UNIQUE INDEX idx_jobs_source_external ON jobs(company_id, source, external_id)
  WHERE company_id IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX idx_jobs_active_rank ON jobs(is_active, ranking_score DESC, scraped_at DESC);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_job ON applications(job_id);
CREATE INDEX idx_contacts_company ON contacts(company_name);
CREATE INDEX idx_contacts_job ON contacts(job_id);

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
  jobs_discovered INTEGER NOT NULL DEFAULT 0,
  jobs_found INTEGER NOT NULL DEFAULT 0,
  jobs_new INTEGER NOT NULL DEFAULT 0,
  stop_reason TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  PRIMARY KEY (run_id, company_id)
);

CREATE INDEX idx_scrape_runs_created ON scrape_runs(created_at DESC);
