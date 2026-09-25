import { useHashTab } from './lib/useHashTab'
import { JobsView } from './views/JobsView'
import { ApplicationsView } from './views/ApplicationsView'
import { NetworkingView } from './views/NetworkingView'
import { ProfileView } from './views/ProfileView'
import { CmsView } from './views/CmsView'

const TABS = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'cms', label: 'CMS' },
  { id: 'applications', label: 'Applications' },
  { id: 'networking', label: 'Networking' },
  { id: 'profile', label: 'Profile' },
] as const

type TabId = (typeof TABS)[number]['id']

function App() {
  const [tab, setTab] = useHashTab<TabId>(
    TABS.map((t) => t.id),
    'jobs',
  )

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-10 border-b border-border bg-panel">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-3 sm:gap-8 sm:px-6">
          <span className="select-none font-mono text-sm text-accent">
            tracker<span className="text-text-faint">_</span>
          </span>
          <nav className="flex h-full gap-1" aria-label="Sections">
            {TABS.map((t) => {
              const active = t.id === tab
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex h-full items-center px-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent sm:px-2 sm:text-sm ${
                    active ? 'text-text' : 'text-text-secondary hover:text-text'
                  }`}
                >
                  {t.label}
                  {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className={`mx-auto px-4 py-6 sm:px-6 ${tab === 'jobs' || tab === 'cms' ? 'max-w-[90rem]' : 'max-w-6xl'}`}>
        {tab === 'jobs' && <JobsView />}
        {tab === 'cms' && <CmsView />}
        {tab === 'applications' && <ApplicationsView />}
        {tab === 'networking' && <NetworkingView />}
        {tab === 'profile' && <ProfileView />}
      </main>
    </div>
  )
}

export default App
