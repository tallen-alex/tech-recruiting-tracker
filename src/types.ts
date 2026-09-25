export type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
  APIFY_TOKEN: string
  APIFY_ACTOR_ID: string
  ANTHROPIC_API_KEY: string
  PUBLIC_BASE_URL: string
  SCRAPE_CALLBACK_SECRET: string
  RESUMES: R2Bucket
}

export type AtsType = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'smartrecruiters' | 'apple' | 'custom'

export type TargetingProfile = {
  target_titles: string[]
  adjacent_titles: string[]
  seniority: string[]
  skills: string[]
  excluded_titles: string[]
  locations: string[]
}
