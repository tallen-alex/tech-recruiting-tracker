import type { Application, Company, Contact, Job, PaginatedJobs, Profile, ScrapeRun, TargetingProfile } from '../types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${path} failed (${res.status})${body ? `: ${body}` : ''}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  jobs: {
    list: (params: { active?: 'true' | 'false' | 'all'; sort?: 'recent' | 'relevance'; search?: string; companyId?: number; minScore?: number; page?: number; pageSize?: number; source?: string; excludeSource?: string; sponsorship?: string } = {}) => {
      const query = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '' && value !== 'all') query.set(key, String(value)) })
      return request<PaginatedJobs>(`/jobs?${query}`)
    },
    update: (id: number, patch: Partial<Job>) =>
      request<Job>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  },
  applications: {
    list: () => request<Application[]>('/applications'),
    create: (input: Partial<Application>) =>
      request<Application>('/applications', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, patch: Partial<Application>) =>
      request<Application>(`/applications/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  },
  contacts: {
    list: () => request<Contact[]>('/contacts'),
    create: (input: Partial<Contact>) =>
      request<Contact>('/contacts', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, patch: Partial<Contact>) =>
      request<Contact>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  },
  companies: {
    list: () => request<Company[]>('/companies'),
    create: (input: Partial<Company>) =>
      request<Company>('/companies', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, patch: Partial<Company>) =>
      request<Company>(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    delete: (id: number) => request<void>(`/companies/${id}`, { method: 'DELETE' }),
  },
  profile: {
    get: () => request<Profile>('/profile'),
    update: (patch: Partial<Profile>) => request<Profile>('/profile', { method: 'PATCH', body: JSON.stringify(patch) }),
    updateTargeting: (targeting: TargetingProfile) => request<Profile>('/profile/targeting', { method: 'PUT', body: JSON.stringify(targeting) }),
    regenerateTargeting: () => request<Profile>('/profile/targeting/regenerate', { method: 'POST' }),
    adoptTargeting: () => request<Profile>('/profile/targeting/adopt', { method: 'POST' }),
    uploadResume: async (file: File) => {
      const form = new FormData()
      form.append('resume', file)
      const res = await fetch('/api/profile/resume', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`POST /profile/resume failed (${res.status})${body ? `: ${body}` : ''}`)
      }
      return (await res.json()) as Profile
    },
  },
  scrape: {
    start: () => request<ScrapeRun>('/scrape/runs', { method: 'POST', body: '{}' }),
    get: (id: string) => request<ScrapeRun>(`/scrape/runs/${id}`),
    latest: () => request<ScrapeRun | null>('/scrape/runs/latest'),
  },
}
