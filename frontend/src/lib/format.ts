/** SQLite stores dates as "YYYY-MM-DD" (date-only) or "YYYY-MM-DD HH:MM:SS" (naive UTC). */
export function formatDate(value: string | null): string {
  if (!value) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  // Date-only: treat as a local calendar date so it never shifts a day back/forward.
  // Timestamped: SQLite's datetime('now') is UTC with no offset marker — say so explicitly.
  const d = dateOnly ? new Date(`${value}T00:00:00`) : new Date(`${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th'
  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

/**
 * Rich display for values that already carry real timezone info (ISO with offset/Z, e.g. posted/deadline
 * dates from Greenhouse/Lever) or are a plain date. e.g. "27th Aug '26, 7:00 AM CT", or just "27th Aug '26"
 * when there's no time component (most deadlines are date-only).
 */
export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const hasOffset = /T.*(Z|[+-]\d{2}:?\d{2})$/.test(value)
  const d = dateOnly ? new Date(`${value}T00:00:00`) : hasOffset ? new Date(value) : new Date(`${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return value

  const day = d.getDate()
  const dayLabel = `${day}${ordinalSuffix(day)}`
  const month = d.toLocaleDateString(undefined, { month: 'short' })
  const year = `'${String(d.getFullYear()).slice(-2)}`
  if (dateOnly) return `${dayLabel} ${month} ${year}`

  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const tzName = d.toLocaleTimeString(undefined, { timeZoneName: 'short' }).split(' ').pop()
  return `${dayLabel} ${month} ${year}, ${time}${tzName ? ` ${tzName}` : ''}`
}
