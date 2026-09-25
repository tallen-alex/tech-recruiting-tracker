export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

const dotClasses: Record<Tone, string> = {
  neutral: 'bg-text-faint',
  info: 'bg-info',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
}

/** Small color dot giving at-a-glance status color next to a plain select control. */
export function StatusDot({ tone }: { tone: Tone }) {
  return <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotClasses[tone]}`} />
}
