ALTER TABLE companies ADD COLUMN careers_url TEXT;
ALTER TABLE companies ADD COLUMN last_scraped_at TEXT;

CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  resume_text TEXT,
  resume_file_key TEXT,
  role_fit_summary TEXT,
  role_preferences TEXT,
  company_preferences TEXT,
  max_companies_per_scrape INTEGER NOT NULL DEFAULT 10,
  updated_at TEXT DEFAULT (datetime('now'))
);
