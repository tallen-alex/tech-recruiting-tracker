export type SourceType = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'smartrecruiters' | 'apple' | 'custom'

export type CompanyInput = {
  id: number
  name: string
  sourceType: SourceType | null
  sourceKey: string | null
  careersUrl: string | null
}

export type ActorInput = {
  runId: string
  callbackBaseUrl: string
  callbackToken: string
  companies: CompanyInput[]
  targetingProfile: TargetingProfile
  policy?: Partial<ScanPolicy>
}

export type TargetingProfile = {
  target_titles: string[]
  adjacent_titles: string[]
  seniority: string[]
  skills: string[]
  excluded_titles: string[]
  locations: string[]
}

export type ScanPolicy = {
  maxAgeDays: number
  maxStoredJobsPerCompany: number
  structuredMaxPages: number
  genericMaxListingPages: number
  genericMaxJobs: number
  genericMaxSeconds: number
}

export type NormalizedJob = {
  externalId: string | null
  title: string
  location: string | null
  workplaceType: string | null
  department: string | null
  employmentType: string | null
  description: string | null
  postedAt: string | null
  deadline: string | null
  salaryMin: number | null
  salaryMax: number | null
  jobUrl: string
  applyUrl: string | null
  source: SourceType
}

export type CompanyResult = {
  companyId: number
  status: 'succeeded' | 'partial' | 'failed'
  detectedSource: SourceType | null
  detectedSourceKey: string | null
  careersUrl: string | null
  pagesVisited: number
  jobsDiscovered: number
  jobsFound: number
  stopReason: string
  error: string | null
}

export type AdapterResult = Omit<CompanyResult, 'companyId'> & { jobs: NormalizedJob[] }

export type AdapterOptions = { targetingProfile: TargetingProfile; policy: ScanPolicy }
