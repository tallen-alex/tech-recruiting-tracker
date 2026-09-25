import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { api } from '../lib/api'
import { useResource, type ResourceState } from '../lib/useResource'
import { StateBoundary } from '../components/StateBoundary'
import { EmptyState } from '../components/EmptyState'
import { ExternalLinkIcon, PlusIcon, SpinnerIcon } from '../components/icons'
import { formatDate } from '../lib/format'
import type { AtsType, Company, Profile, ScrapeRun, TargetingProfile } from '../types'

const inputClass =
  'rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent'
const primaryButtonClass =
  'rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-surface hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2'
const ghostButtonClass =
  'inline-flex items-center gap-1.5 rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 text-sm text-text hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent'

export function ProfileView() {
  const profileFetcher = useCallback(() => api.profile.get(), [])
  const { state: profileState, setState: setProfileState } = useResource(profileFetcher)

  const companiesFetcher = useCallback(() => api.companies.list(), [])
  const {
    state: companiesState,
    reload: reloadCompanies,
    setState: setCompaniesState,
  } = useResource(companiesFetcher)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text">Profile</h1>
        <p className="mt-1 text-sm text-text-secondary">Your resume, preferences, and tracked companies — used to find and rank jobs.</p>
      </div>

      {profileState.status === 'error' && <p className="text-sm text-danger">Couldn't load your profile — {profileState.message}</p>}

      {profileState.status === 'ready' && (
        <>
          <ResumeSection profile={profileState.data} onUpdated={(p) => setProfileState({ status: 'ready', data: p })} />
          <PreferencesSection profile={profileState.data} onUpdated={(p) => setProfileState({ status: 'ready', data: p })} />
          <TargetingSection profile={profileState.data} onUpdated={(p) => setProfileState({ status: 'ready', data: p })} />
        </>
      )}

      <CompaniesSection state={companiesState} reload={reloadCompanies} setState={setCompaniesState} />

      {profileState.status === 'ready' && (
        <ScrapeSection maxCompanies={profileState.data.max_companies_per_scrape} onScraped={reloadCompanies} />
      )}
    </div>
  )
}

function ResumeSection({ profile, onUpdated }: { profile: Profile; onUpdated: (p: Profile) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const updated = await api.profile.uploadResume(file)
      onUpdated(updated)
      setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Resume</h2>
      <div className="mt-2 rounded-md border border-border-strong bg-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-text-secondary file:mr-2 file:rounded-sm file:border file:border-border-strong file:bg-surface file:px-2 file:py-1 file:text-sm file:text-text"
          />
          <button type="button" disabled={!file || uploading} onClick={upload} className={primaryButtonClass}>
            {uploading ? 'Parsing…' : 'Upload & parse'}
          </button>
          {profile.resume_file_key && <span className="text-sm text-text-faint">Current: {profile.resume_file_key}</span>}
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {profile.role_fit_summary ? (
          <p className="mt-3 text-sm text-text">{profile.role_fit_summary}</p>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">No resume parsed yet — upload a PDF to get a role-fit summary.</p>
        )}
      </div>
    </section>
  )
}

function PreferencesSection({ profile, onUpdated }: { profile: Profile; onUpdated: (p: Profile) => void }) {
  const [rolePrefs, setRolePrefs] = useState(profile.role_preferences ?? '')
  const [companyPrefs, setCompanyPrefs] = useState(profile.company_preferences ?? '')
  const [locationKeywords, setLocationKeywords] = useState(profile.location_keywords ?? '')
  const [maxCompanies, setMaxCompanies] = useState(profile.max_companies_per_scrape)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const updated = await api.profile.update({
        role_preferences: rolePrefs || null,
        company_preferences: companyPrefs || null,
        location_keywords: locationKeywords || null,
        max_companies_per_scrape: maxCompanies,
      })
      onUpdated(updated)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Preferences</h2>
      <div className="mt-2 space-y-3 rounded-md border border-border-strong bg-panel p-3">
        <label className="block">
          <span className="text-sm text-text-secondary">Role preferences</span>
          <textarea
            value={rolePrefs}
            onChange={(e) => setRolePrefs(e.target.value)}
            rows={2}
            placeholder="e.g. senior backend/infra roles, remote-friendly, IC track"
            className={`mt-1 block w-full ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-sm text-text-secondary">Company preferences</span>
          <textarea
            value={companyPrefs}
            onChange={(e) => setCompanyPrefs(e.target.value)}
            rows={2}
            placeholder="e.g. prefer smaller, mission-driven teams over big tech"
            className={`mt-1 block w-full ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-sm text-text-secondary">Location filter (comma-separated, optional)</span>
          <input
            value={locationKeywords}
            onChange={(e) => setLocationKeywords(e.target.value)}
            placeholder="e.g. United States, Remote, San Francisco"
            className={`mt-1 block w-full ${inputClass}`}
          />
          <span className="mt-1 block text-xs text-text-faint">
            Used as a ranking signal. Every discovered posting is retained, even when its location differs.
          </span>
        </label>
        <label className="block max-w-[14rem]">
          <span className="text-sm text-text-secondary">Max companies per scrape</span>
          <input
            type="number"
            min={1}
            value={maxCompanies}
            onChange={(e) => setMaxCompanies(Number(e.target.value))}
            className={`mt-1 block w-full ${inputClass}`}
          />
        </label>
        <div className="flex items-center gap-2">
          <button type="button" disabled={saving} onClick={save} className={primaryButtonClass}>
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
          {saved && <span className="text-sm text-success">Saved</span>}
        </div>
      </div>
    </section>
  )
}

const emptyTargeting: TargetingProfile = {
  target_titles: [], adjacent_titles: [], seniority: [], skills: [], excluded_titles: [], locations: [],
}

const targetingFields: Array<{ key: keyof TargetingProfile; label: string; placeholder: string }> = [
  { key: 'target_titles', label: 'Target titles', placeholder: 'Product Manager, Technical Product Manager' },
  { key: 'adjacent_titles', label: 'Adjacent titles', placeholder: 'Product Operations, Program Manager' },
  { key: 'seniority', label: 'Seniority', placeholder: 'Senior, Lead, Principal' },
  { key: 'skills', label: 'Skills', placeholder: 'Roadmapping, analytics, APIs' },
  { key: 'excluded_titles', label: 'Exclude titles', placeholder: 'Intern, retail' },
  { key: 'locations', label: 'Preferred locations', placeholder: 'Remote, United States, Austin' },
]

type TargetingDraft = Record<keyof TargetingProfile, string>

const targetingToDraft = (targeting: TargetingProfile): TargetingDraft => ({
  target_titles: targeting.target_titles.join(', '),
  adjacent_titles: targeting.adjacent_titles.join(', '),
  seniority: targeting.seniority.join(', '),
  skills: targeting.skills.join(', '),
  excluded_titles: targeting.excluded_titles.join(', '),
  locations: targeting.locations.join(', '),
})

const draftToTargeting = (draft: TargetingDraft): TargetingProfile => ({
  target_titles: draft.target_titles.split(',').map((item) => item.trim()).filter(Boolean),
  adjacent_titles: draft.adjacent_titles.split(',').map((item) => item.trim()).filter(Boolean),
  seniority: draft.seniority.split(',').map((item) => item.trim()).filter(Boolean),
  skills: draft.skills.split(',').map((item) => item.trim()).filter(Boolean),
  excluded_titles: draft.excluded_titles.split(',').map((item) => item.trim()).filter(Boolean),
  locations: draft.locations.split(',').map((item) => item.trim()).filter(Boolean),
})

function TargetingSection({ profile, onUpdated }: { profile: Profile; onUpdated: (profile: Profile) => void }) {
  const [draft, setDraft] = useState<TargetingDraft>(() => targetingToDraft(profile.targeting_effective ?? emptyTargeting))
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraft(targetingToDraft(profile.targeting_effective ?? emptyTargeting)), [profile.targeting_effective])

  const save = async () => {
    setSaving(true)
    setError(null)
    try { onUpdated(await api.profile.updateTargeting(draftToTargeting(draft))) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSaving(false) }
  }

  const regenerate = async () => {
    setRegenerating(true)
    setError(null)
    try { onUpdated(await api.profile.regenerateTargeting()) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setRegenerating(false) }
  }

  const adopt = async () => {
    setRegenerating(true)
    setError(null)
    try { onUpdated(await api.profile.adoptTargeting()) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setRegenerating(false) }
  }

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-text">Ranking profile</h2>
          <p className="mt-1 text-sm text-text-secondary">Generated from your resume and preferences, then editable.</p>
        </div>
        <button type="button" disabled={regenerating} onClick={regenerate} className={ghostButtonClass}>
          {regenerating ? 'Generating…' : 'Regenerate'}
        </button>
      </div>
      <div className="mt-2 rounded-md border border-border-strong bg-panel p-3">
        {profile.targeting_candidate && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 text-sm">
            <span className="text-text">Your inputs changed. A newly generated ranking profile is available.</span>
            <button type="button" disabled={regenerating} onClick={adopt} className={ghostButtonClass}>Use regenerated profile</button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {targetingFields.map((field) => (
            <label key={field.key} className="min-w-0">
              <span className="text-sm text-text-secondary">{field.label}</span>
              <textarea
                rows={2}
                value={draft[field.key]}
                onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
                placeholder={field.placeholder}
                className={`mt-1 block w-full ${inputClass}`}
              />
            </label>
          ))}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-3 flex items-center gap-2">
          <button type="button" disabled={saving} onClick={save} className={primaryButtonClass}>{saving ? 'Saving…' : 'Save ranking profile'}</button>
          {profile.targeting_is_edited === 1 && <span className="text-xs text-text-faint">Custom edits active</span>}
        </div>
      </div>
    </section>
  )
}

function CompaniesSection({
  state,
  reload,
  setState,
}: {
  state: ResourceState<Company[]>
  reload: () => void
  setState: Dispatch<SetStateAction<ResourceState<Company[]>>>
}) {
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const remove = async (company: Company) => {
    setRemovingId(company.id)
    setRemoveError(null)
    try {
      await api.companies.delete(company.id)
      setState((prev) =>
        prev.status === 'ready' ? { status: 'ready', data: prev.data.filter((c) => c.id !== company.id) } : prev,
      )
    } catch (err) {
      setRemoveError(
        `Couldn't remove ${company.name}. ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Tracked companies</h2>
          <p className="mt-1 text-sm text-text-secondary">Only these get scraped when you hit Refresh.</p>
        </div>
        <button type="button" onClick={() => setAdding((v) => !v)} className={ghostButtonClass}>
          <PlusIcon /> Add company
        </button>
      </div>

      {adding && (
        <AddCompanyForm
          onCancel={() => setAdding(false)}
          onSaved={(company) => {
            setAdding(false)
            setState((prev) => (prev.status === 'ready' ? { status: 'ready', data: [company, ...prev.data] } : prev))
          }}
        />
      )}

      {removeError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {removeError}
        </p>
      )}

      <div className="mt-2">
        <StateBoundary
          state={state}
          onRetry={reload}
          empty={
            <EmptyState
              title="No companies tracked"
              description="Add a company to discover its job source and start tracking every public posting."
            />
          }
        >
          {(companies) => (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-panel text-xs uppercase tracking-wide text-text-faint">
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Last scraped</th>
                    <th className="px-3 py-2 font-medium">Coverage</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id} className="border-b border-border last:border-0 hover:bg-panel">
                      <td className="px-3 py-2.5 text-text">{company.name}</td>
                      <td className="px-3 py-2.5 text-text-secondary">
                        {company.ats_type === 'custom' ? (
                          company.careers_url ? (
                            <a
                              href={company.careers_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                            >
                              careers page <ExternalLinkIcon />
                            </a>
                          ) : (
                            '—'
                          )
                        ) : company.ats_type ? (
                          <span className="font-mono text-xs">
                            {company.ats_type}: {company.ats_slug ?? '—'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-text-secondary">{formatDate(company.last_scraped_at)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-text-secondary">
                        {company.last_jobs_discovered == null
                          ? '—'
                          : `${company.last_jobs_discovered} seen · ${company.last_jobs_found ?? 0} matched · ${company.last_pages_visited ?? 0} pages`}
                      </td>
                      <td className="max-w-[16rem] px-3 py-2.5 text-text-secondary">
                        <span className={company.last_scrape_status === 'failed' ? 'text-danger' : company.last_scrape_status === 'partial' ? 'text-warning' : ''}>
                          {company.last_scrape_status ?? 'Not run'}
                        </span>
                        {company.last_scrape_error && <span className="mt-0.5 block truncate text-xs text-danger" title={company.last_scrape_error}>{company.last_scrape_error}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={removingId !== null}
                          onClick={() => remove(company)}
                          className="text-text-faint hover:text-danger disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {removingId === company.id ? 'Removing…' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </StateBoundary>
      </div>
    </section>
  )
}

function AddCompanyForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: (company: Company) => void }) {
  const [name, setName] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [atsType, setAtsType] = useState<AtsType>('greenhouse')
  const [atsSlug, setAtsSlug] = useState('')
  const [careersUrl, setCareersUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const sourceUsesUrl = ['custom', 'workday', 'apple'].includes(atsType)
  const canSave =
    name.trim().length > 0 &&
    !saving &&
    (!advanced || (sourceUsesUrl ? careersUrl.trim().length > 0 : atsSlug.trim().length > 0))

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      const input: Partial<Company> = { name: name.trim() }
      if (advanced) {
        input.ats_type = atsType
        input.ats_slug = sourceUsesUrl ? undefined : atsSlug.trim()
        input.careers_url = sourceUsesUrl ? careersUrl.trim() : undefined
      }
      const company = await api.companies.create(input)
      if (!advanced && !company.ats_type) {
        setNote(`Couldn't auto-detect where "${company.name}" posts jobs. Remove it and re-add with "I know the source" checked to set it manually.`)
      }
      onSaved(company)
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 rounded-md border border-border-strong bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          className={`min-w-[12rem] flex-1 ${inputClass}`}
        />
        <label className="flex items-center gap-1.5 text-sm text-text-secondary">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          I know the source
        </label>
      </div>
      {advanced ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select value={atsType} onChange={(e) => setAtsType(e.target.value as AtsType)} className={inputClass}>
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
            <option value="workday">Workday</option>
            <option value="smartrecruiters">SmartRecruiters</option>
            <option value="apple">Apple Jobs</option>
            <option value="custom">Custom career page</option>
          </select>
          {sourceUsesUrl ? (
            <input
              value={careersUrl}
              onChange={(e) => setCareersUrl(e.target.value)}
              placeholder={atsType === 'apple' ? 'https://jobs.apple.com/en-us/search' : 'https://company.com/careers'}
              className={`sm:col-span-2 ${inputClass}`}
            />
          ) : (
            <input
              value={atsSlug}
              onChange={(e) => setAtsSlug(e.target.value)}
              placeholder={atsType === 'greenhouse' ? 'Greenhouse board slug' : 'Lever slug'}
              className={`sm:col-span-2 ${inputClass}`}
            />
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-text-faint">
          We'll try to find where they post jobs automatically — free first, a quick search if needed.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {note && <p className="mt-2 text-sm text-warning">{note}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm px-2.5 py-1.5 text-sm text-text-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          Cancel
        </button>
        <button type="button" disabled={!canSave} onClick={submit} className={primaryButtonClass}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}

function ScrapeSection({ maxCompanies, onScraped }: { maxCompanies: number; onScraped: () => void }) {
  const [run, setRun] = useState<ScrapeRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const reportedRun = useRef<string | null>(null)
  const active = run && ['queued', 'running', 'scoring'].includes(run.status)

  useEffect(() => {
    let cancelled = false
    api.scrape.latest()
      .then((latest) => { if (!cancelled) setRun(latest) })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!run || !['queued', 'running', 'scoring'].includes(run.status)) {
      if (run && reportedRun.current !== run.id) {
        reportedRun.current = run.id
        onScraped()
      }
      return
    }
    const timer = window.setInterval(() => {
      api.scrape.get(run.id).then(setRun).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
    }, 2000)
    return () => window.clearInterval(timer)
  }, [run, onScraped])

  const start = async () => {
    setLoading(true)
    setError(null)
    try {
      setRun(await api.scrape.start())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-text">Refresh</h2>
      <div className="mt-2 rounded-md border border-border-strong bg-panel p-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={loading || Boolean(active)}
            onClick={start}
            className={`${primaryButtonClass} inline-flex items-center gap-1.5`}
          >
            {(loading || active) && <SpinnerIcon />}
            {loading ? 'Loading…' : active ? (run?.status === 'scoring' ? 'Ranking jobs…' : `Scraping ${run?.companies_completed ?? 0}/${run?.companies_total ?? 0}…`) : 'Scrape now'}
          </button>
          <span className="text-sm text-text-secondary">
            Scrapes up to {maxCompanies} companies, prioritizing the ones scraped longest ago. No automatic/scheduled scraping.
          </span>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-danger">Couldn't update the scrape run. {error}</p>}
        {run && (
          <div className="mt-3 border-t border-border pt-3" aria-live="polite">
            <p className="text-sm text-text">
              {run.status} · {run.jobs_found} matched · {run.jobs_new} new · {run.jobs_ranked} detailed scores
              {run.error && <span className="text-danger"> · {run.error}</span>}
            </p>
            <div className="mt-2 overflow-x-auto rounded-sm border border-border bg-surface">
              <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                <thead><tr className="border-b border-border bg-panel uppercase tracking-wide text-text-faint">
                  <th className="px-2 py-1.5 font-medium">Company</th><th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Source</th><th className="px-2 py-1.5 text-right font-medium">Pages</th>
                  <th className="px-2 py-1.5 text-right font-medium">Seen</th><th className="px-2 py-1.5 text-right font-medium">Matched</th><th className="px-2 py-1.5 font-medium">Result</th>
                </tr></thead>
                <tbody>{run.companies.map((company) => (
                  <tr key={company.company_id} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 text-text">{company.company_name}</td>
                    <td className={`px-2 py-1.5 ${company.status === 'failed' ? 'text-danger' : company.status === 'partial' ? 'text-warning' : 'text-text-secondary'}`}>{company.status}</td>
                    <td className="px-2 py-1.5 text-text-secondary">{company.detected_source ?? 'detecting'}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-text-secondary">{company.pages_visited}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-text-secondary">{company.jobs_discovered}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-text-secondary">{company.jobs_found}</td>
                    <td className="max-w-[18rem] truncate px-2 py-1.5 text-text-secondary" title={company.error ?? company.stop_reason ?? undefined}>{company.error ?? company.stop_reason ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
