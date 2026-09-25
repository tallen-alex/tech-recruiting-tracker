import { useCallback, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { StateBoundary } from '../components/StateBoundary'
import { EmptyState } from '../components/EmptyState'
import { PlusIcon } from '../components/icons'
import { StatusDot, type Tone } from '../components/StatusBadge'
import { formatDate } from '../lib/format'
import { exportApplicationsXlsx } from '../lib/exportApplications'
import type { Application } from '../types'

const STAGES = ['Applied', 'Phone Screen', 'Interviewing', 'Onsite', 'Offer', 'Rejected', 'Withdrawn'] as const

const STAGE_TONE: Record<string, Tone> = {
  Applied: 'info',
  'Phone Screen': 'warning',
  Interviewing: 'warning',
  Onsite: 'warning',
  Offer: 'success',
  Rejected: 'danger',
  Withdrawn: 'neutral',
}

function toneFor(status: string): Tone {
  return STAGE_TONE[status] ?? 'neutral'
}

const CLOSED_STAGES = new Set<string>(['Rejected', 'Withdrawn'])

function applyFilter(applications: Application[], filter: string | null): Application[] {
  if (filter === null) return applications
  if (filter === 'active') return applications.filter((a) => !CLOSED_STAGES.has(a.status))
  return applications.filter((a) => a.status === filter)
}

/** Which inbox an application went out from — stored as a label, never the address itself. */
const EMAIL_LABELS = ['Gmail', 'Kellogg'] as const

export function ApplicationsView() {
  const fetcher = useCallback(() => api.applications.list(), [])
  const { state, reload, setState } = useResource(fetcher)
  const [adding, setAdding] = useState(false)
  // A stage name filters the table to that stage; 'active' hides closed ones; null shows everything.
  const [filter, setFilter] = useState<string | null>(null)
  const applications = useMemo(() => (state.status === 'ready' ? state.data : []), [state])
  // Most recent application (list is last_update DESC) sets the default for the next one logged.
  const lastEmailLabel =
    applications.map((a) => a.applied_email).find((e) => (EMAIL_LABELS as readonly (string | null)[]).includes(e)) ?? EMAIL_LABELS[0]

  const updateApplication = async (app: Application, patch: Partial<Application>) => {
    setState((prev) =>
      prev.status === 'ready' ? { status: 'ready', data: prev.data.map((a) => (a.id === app.id ? { ...a, ...patch } : a)) } : prev,
    )
    try {
      await api.applications.update(app.id, patch)
    } catch {
      reload()
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Applications</h1>
          <p className="mt-1 text-sm text-text-secondary">Every application in flight, and where it stands.</p>
        </div>
        <div className="flex items-center gap-2">
        <ExportButton applications={applications} filter={filter} />
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 text-sm text-text hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <PlusIcon /> Log application
        </button>
        </div>
      </div>

      {adding && (
        <AddApplicationForm
          defaultEmailLabel={lastEmailLabel}
          onCancel={() => setAdding(false)}
          onSaved={(app) => {
            setAdding(false)
            setState((prev) => (prev.status === 'ready' ? { status: 'ready', data: [app, ...prev.data] } : prev))
          }}
        />
      )}

      <StateBoundary
        state={state}
        onRetry={reload}
        empty={
          <EmptyState
            title="No applications logged"
            description="Track an application as soon as you send it — status, dates, and follow-ups all live here."
          />
        }
      >
        {(applications) => {
          const visible = applyFilter(applications, filter)
          return (
          <>
          <StatusSummary applications={applications} filter={filter} onFilter={setFilter} />
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-panel text-xs uppercase tracking-wide text-text-faint">
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Applied</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Referral</th>
                  <th className="px-3 py-2 font-medium">Last update</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-text-secondary">
                      No applications in this stage.
                    </td>
                  </tr>
                )}
                {visible.map((app) => (
                  <tr key={app.id} className="border-b border-border last:border-0 hover:bg-panel">
                    <td className="px-3 py-2.5 text-text">{app.company_name}</td>
                    <td className="px-3 py-2.5 text-text">{app.title}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <StatusDot tone={toneFor(app.status)} />
                        <select
                          value={app.status}
                          onChange={(e) => updateApplication(app, { status: e.target.value })}
                          className="rounded-sm border border-border-strong bg-panel px-1.5 py-1 text-xs text-text focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-text-secondary">{formatDate(app.applied_date)}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={app.applied_email ?? ''}
                        onChange={(e) => updateApplication(app, { applied_email: e.target.value || null })}
                        aria-label={`Email used for ${app.company_name}`}
                        className="rounded-sm border border-border-strong bg-panel px-1.5 py-1 text-xs text-text focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <option value="">—</option>
                        {EMAIL_LABELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                        {/* Keep any older free-text value visible instead of silently blanking it. */}
                        {app.applied_email && !(EMAIL_LABELS as readonly string[]).includes(app.applied_email) && (
                          <option value={app.applied_email}>{app.applied_email}</option>
                        )}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary">{app.referral || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-text-secondary">{formatDate(app.last_update)}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2.5 text-text-secondary" title={app.notes ?? undefined}>
                      {app.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
          )
        }}
      </StateBoundary>
    </div>
  )
}

function StatusSummary({
  applications,
  filter,
  onFilter,
}: {
  applications: Application[]
  filter: string | null
  onFilter: (next: string | null) => void
}) {
  const counts = new Map<string, number>()
  for (const a of applications) counts.set(a.status, (counts.get(a.status) ?? 0) + 1)
  const active = applications.filter((a) => !CLOSED_STAGES.has(a.status)).length
  // Legacy or hand-entered statuses outside STAGES still get counted rather than silently vanishing.
  const stages = [...STAGES, ...[...counts.keys()].filter((s) => !(STAGES as readonly string[]).includes(s))]

  const tile = (key: string | null, label: string, value: number, tone: Tone | undefined, hint: string) => {
    const selected = filter === key
    return (
      <button
        key={label}
        type="button"
        title={hint}
        onClick={() => onFilter(selected || key === null ? null : key)}
        aria-pressed={selected}
        className={`flex min-w-[6.5rem] flex-col items-start gap-0.5 rounded-sm border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
          selected ? 'border-accent bg-panel' : 'border-border bg-surface hover:border-border-strong'
        }`}
      >
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-text-faint">
          {tone && <StatusDot tone={tone} />}
          {label}
        </span>
        <span className={`font-mono text-lg leading-tight ${value === 0 ? 'text-text-faint' : 'text-text'}`}>{value}</span>
      </button>
    )
  }

  // Empty stages are hidden to keep the strip compact — except the one being filtered on, so it can be cleared.
  const shownStages = stages.filter((s) => (counts.get(s) ?? 0) > 0 || filter === s)

  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div role="group" aria-labelledby="summary-overall">
        <p id="summary-overall" className="mb-1 text-xs text-text-faint">
          All applications
        </p>
        <div className="flex flex-wrap gap-2">
          {tile(null, 'Total', applications.length, undefined, 'Every application you have logged')}
          {tile('active', 'Active', active, undefined, 'Still in play — everything except Rejected and Withdrawn')}
        </div>
      </div>
      {shownStages.length > 0 && (
        <div role="group" aria-labelledby="summary-stage">
          <p id="summary-stage" className="mb-1 text-xs text-text-faint">
            By current stage
          </p>
          <div className="flex flex-wrap gap-2">
            {shownStages.map((s) =>
              tile(s, s, counts.get(s) ?? 0, toneFor(s), s === 'Applied' ? 'Submitted, no response yet' : `Currently at ${s}`),
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ExportButton({ applications, filter }: { applications: Application[]; filter: string | null }) {
  const [busy, setBusy] = useState(false)
  const rows = applyFilter(applications, filter)
  const scope = filter === null ? 'all' : filter === 'active' ? 'active' : filter.toLowerCase().replace(/\s+/g, '-')

  const run = async () => {
    setBusy(true)
    try {
      const today = new Date().toLocaleDateString('en-CA')
      await exportApplicationsXlsx(rows, `applications-${scope}-${today}.xlsx`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy || rows.length === 0}
      title={filter === null ? 'Download all applications as Excel' : 'Download the filtered applications as Excel'}
      className="rounded-sm border border-border bg-surface px-2.5 py-1.5 text-sm text-text-secondary hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {busy ? 'Exporting…' : 'Export .xlsx'}
    </button>
  )
}

function AddApplicationForm({
  defaultEmailLabel,
  onCancel,
  onSaved,
}: {
  defaultEmailLabel: string
  onCancel: () => void
  onSaved: (app: Application) => void
}) {
  const [companyName, setCompanyName] = useState('')
  const [title, setTitle] = useState('')
  const [appliedDate, setAppliedDate] = useState('')
  const [referral, setReferral] = useState('')
  const [appliedEmail, setAppliedEmail] = useState(defaultEmailLabel)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = companyName.trim().length > 0 && title.trim().length > 0 && !saving

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const app = await api.applications.create({
        company_name: companyName.trim(),
        title: title.trim(),
        applied_date: appliedDate || undefined,
        referral: referral.trim() || undefined,
        applied_email: appliedEmail || undefined,
      })
      onSaved(app)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4 rounded-md border border-border-strong bg-panel p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <input
          autoFocus
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company"
          className="rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Role title"
          className="rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
        />
        <input
          type="date"
          value={appliedDate}
          onChange={(e) => setAppliedDate(e.target.value)}
          className="rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus-visible:outline-2 focus-visible:outline-accent"
        />
        <input
          value={referral}
          onChange={(e) => setReferral(e.target.value)}
          placeholder="Referral (optional)"
          className="rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
        />
        <select
          value={appliedEmail}
          onChange={(e) => setAppliedEmail(e.target.value)}
          aria-label="Email used to apply"
          className="rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          <option value="">Email used…</option>
          {EMAIL_LABELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm px-2.5 py-1.5 text-sm text-text-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={submit}
          className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-surface hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
