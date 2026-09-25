export type NormalizedJob = {
  company_id: number
  company_name: string
  title: string
  location: string | null
  remote: string | null
  url: string
  source: string
  description: string | null
  salary_min: number | null
  salary_max: number | null
  posted_at: string | null
  deadline: string | null
}
