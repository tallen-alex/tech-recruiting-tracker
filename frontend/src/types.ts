export interface Job {
  id: number
  company_id: number | null
  company_name: string
  company_logo_url: string | null
  title: string
  location: string | null
  remote: string | null
  url: string | null
  source: string | null
  external_id: string | null
  description: string | null
  department: string | null
  employment_type: string | null
  apply_url: string | null
  salary_min: number | null
  salary_max: number | null
  posted_at: string | null
  deadline: string | null
  scraped_at: string
  match_score: number | null
  match_reason: string | null
  ranking_score: number | null
  ranking_reason: string | null
  first_seen_at: string | null
  last_seen_at: string | null
  is_active: number
  work_auth_raw: string | null
  sponsorship: 'sponsored' | 'not_sponsored' | 'unclear' | null
  sponsorship_evidence: string | null
  status: string
  created_at: string
}

export interface Application {
  id: number
  job_id: number | null
  company_name: string
  title: string
  status: string
  applied_date: string | null
  last_update: string
  resume_version: string | null
  referral: string | null
  notes: string | null
  created_at: string
}

export interface Contact {
  id: number
  job_id: number | null
  company_name: string
  name: string
  title: string | null
  team: string | null
  linkedin_url: string | null
  email: string | null
  outreach_status: string
  last_contacted: string | null
  notes: string | null
  created_at: string
}

export type AtsType = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'smartrecruiters' | 'apple' | 'custom'

export interface Company {
  id: number
  name: string
  domain: string | null
  ats_type: AtsType | null
  ats_slug: string | null
  careers_url: string | null
  last_scraped_at: string | null
  last_scrape_status: string | null
  last_scrape_error: string | null
  last_jobs_discovered: number | null
  last_jobs_found: number | null
  last_pages_visited: number | null
  notes: string | null
  created_at: string
}

export interface Profile {
  id: number
  resume_text: string | null
  resume_file_key: string | null
  role_fit_summary: string | null
  role_preferences: string | null
  company_preferences: string | null
  location_keywords: string | null
  max_companies_per_scrape: number
  updated_at: string
  targeting_generated: TargetingProfile | null
  targeting_effective: TargetingProfile | null
  targeting_candidate: TargetingProfile | null
  targeting_is_edited: number
}

export type TargetingProfile = {
  target_titles: string[]
  adjacent_titles: string[]
  seniority: string[]
  skills: string[]
  excluded_titles: string[]
  locations: string[]
}

export type PaginatedJobs = { items: Job[]; page: number; pageSize: number; total: number }

export type ScrapeRunCompany = {
  company_id: number
  company_name: string
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed'
  detected_source: string | null
  pages_visited: number
  jobs_discovered: number
  jobs_found: number
  jobs_new: number
  stop_reason: string | null
  error: string | null
}

export type ScrapeRun = {
  id: string
  status: 'queued' | 'running' | 'scoring' | 'completed' | 'failed'
  companies_total: number
  companies_completed: number
  jobs_found: number
  jobs_new: number
  jobs_ranked: number
  error: string | null
  created_at: string
  completed_at: string | null
  companies: ScrapeRunCompany[]
}

export interface ScrapeSummary {
  companiesScraped: string[]
  companiesDiscovered: number
  jobsFound: number
  jobsMatchedLocation: number
  jobsNew: number
  scoringQueued: number
  errors: string[]
}
