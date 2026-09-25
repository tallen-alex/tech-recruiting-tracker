import { useCallback, useState } from 'react'
import { api } from '../lib/api'
import { useResource } from '../lib/useResource'
import { StateBoundary } from '../components/StateBoundary'
import { EmptyState } from '../components/EmptyState'
import { ExternalLinkIcon, PlusIcon } from '../components/icons'
import { StatusDot, type Tone } from '../components/StatusBadge'
import { formatDate } from '../lib/format'
import type { Contact } from '../types'

const OUTREACH_STAGES = ['Not Contacted', 'Messaged', 'Replied', 'Meeting Scheduled', 'No Response'] as const

const OUTREACH_TONE: Record<string, Tone> = {
  'Not Contacted': 'neutral',
  Messaged: 'info',
  Replied: 'warning',
  'Meeting Scheduled': 'success',
  'No Response': 'danger',
}

function toneFor(status: string): Tone {
  return OUTREACH_TONE[status] ?? 'neutral'
}

export function NetworkingView() {
  const fetcher = useCallback(() => api.contacts.list(), [])
  const { state, reload, setState } = useResource(fetcher)
  const [adding, setAdding] = useState(false)

  const setOutreach = async (contact: Contact, outreach_status: string) => {
    setState((prev) =>
      prev.status === 'ready'
        ? { status: 'ready', data: prev.data.map((c) => (c.id === contact.id ? { ...c, outreach_status } : c)) }
        : prev,
    )
    try {
      await api.contacts.update(contact.id, { outreach_status })
    } catch {
      reload()
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Networking</h1>
          <p className="mt-1 text-sm text-text-secondary">Hiring managers and contacts worth reaching out to.</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border-strong bg-panel px-2.5 py-1.5 text-sm text-text hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <PlusIcon /> Add contact
        </button>
      </div>

      {adding && (
        <AddContactForm
          onCancel={() => setAdding(false)}
          onSaved={(contact) => {
            setAdding(false)
            setState((prev) => (prev.status === 'ready' ? { status: 'ready', data: [contact, ...prev.data] } : prev))
          }}
        />
      )}

      <StateBoundary
        state={state}
        onRetry={reload}
        empty={
          <EmptyState
            title="No contacts yet"
            description="Once hiring-manager search is wired up, likely contacts per job will show here. Add anyone you meet in the meantime."
          />
        }
      >
        {(contacts) => (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-panel text-xs uppercase tracking-wide text-text-faint">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Outreach</th>
                  <th className="px-3 py-2 font-medium">Last contacted</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-border last:border-0 hover:bg-panel">
                    <td className="px-3 py-2.5 text-text">{contact.name}</td>
                    <td className="px-3 py-2.5 text-text-secondary">
                      {contact.title ?? '—'}
                      {contact.team ? ` · ${contact.team}` : ''}
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary">{contact.company_name}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <StatusDot tone={toneFor(contact.outreach_status)} />
                        <select
                          value={contact.outreach_status}
                          onChange={(e) => setOutreach(contact, e.target.value)}
                          className="rounded-sm border border-border-strong bg-panel px-1.5 py-1 text-xs text-text focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {OUTREACH_STAGES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-text-secondary">{formatDate(contact.last_contacted)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {contact.linkedin_url && (
                        <a
                          href={contact.linkedin_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-text-faint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                          aria-label={`Open ${contact.name}'s LinkedIn profile`}
                        >
                          <ExternalLinkIcon />
                        </a>
                      )}
                    </td>
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

function AddContactForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: (contact: Contact) => void }) {
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [title, setTitle] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = name.trim().length > 0 && companyName.trim().length > 0 && !saving

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const contact = await api.contacts.create({
        name: name.trim(),
        company_name: companyName.trim(),
        title: title.trim() || undefined,
        linkedin_url: linkedinUrl.trim() || undefined,
      })
      onSaved(contact)
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
        />
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company"
          className="rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="rounded-sm border border-border-strong bg-surface px-2 py-1.5 text-sm text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
        />
        <input
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="LinkedIn URL (optional)"
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
