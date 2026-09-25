import { useCallback, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { StateBoundary } from '../components/StateBoundary'
import { EmptyState } from '../components/EmptyState'
import { PlusIcon } from '../components/icons'
import { StatusDot, type Tone } from '../components/StatusBadge'
import { formatDate } from '../lib/format'
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

export function ApplicationsView() {
  const fetcher = useCallback(() => api.applications.list(), [])
  const { state, reload, setState } = useResource(fetcher)
  const [adding, setAdding] = useState(false)

  const setStatus = async (app: Application, status: string) => {
    setState((prev) =>
      prev.status === 'ready' ? { status: 'ready', data: prev.data.map((a) => (a.id === app.id ? { ...a, status } : a)) } : prev,
    )
    try {
      await api.applications.update(app.id, { status })
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
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 text-sm text-text hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <PlusIcon /> Log application
        </button>
      </div>

      {adding && (
        <AddApplicationForm
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
        {(applications) => (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-panel text-xs uppercase tracking-wide text-text-faint">
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Applied</th>
                  <th className="px-3 py-2 font-medium">Last update</th>
                  <th className="px-3 py-2 font-medium">Referral</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className="border-b border-border last:border-0 hover:bg-panel">
                    <td className="px-3 py-2.5 text-text">{app.company_name}</td>
                    <td className="px-3 py-2.5 text-text">{app.title}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <StatusDot tone={toneFor(app.status)} />
                        <select
                          value={app.status}
                          onChange={(e) => setStatus(app, e.target.value)}
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
                    <td className="px-3 py-2.5 font-mono text-text-secondary">{formatDate(app.last_update)}</td>
                    <td className="px-3 py-2.5 text-text-secondary">{app.referral ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StateBoundary>
    </div>
  )
}

function AddApplicationForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: (app: Application) => void }) {
  const [companyName, setCompanyName] = useState('')
  const [title, setTitle] = useState('')
  const [appliedDate, setAppliedDate] = useState('')
  const [referral, setReferral] = useState('')
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
