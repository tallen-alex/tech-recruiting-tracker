ALTER TABLE jobs ADD COLUMN work_auth_raw TEXT;
ALTER TABLE jobs ADD COLUMN sponsorship TEXT;
ALTER TABLE jobs ADD COLUMN sponsorship_evidence TEXT;
CREATE INDEX idx_jobs_sponsorship ON jobs(sponsorship);
