import type { Application } from '../types'

/** SQLite dates are "YYYY-MM-DD" (local calendar date) or "YYYY-MM-DD HH:MM:SS" (naive UTC); see formatDate. */
function toDate(value: string | null): Date | null {
  if (!value) return null
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(`${value.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Downloads the given applications as an .xlsx file. The writer is loaded on demand to keep it out of the main bundle. */
export async function exportApplicationsXlsx(applications: Application[], fileName: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const headers = ['Company', 'Title', 'Status', 'Applied', 'Email', 'Referral', 'Last update', 'Notes']
  const date = (value: string | null) => {
    const d = toDate(value)
    return d ? { value: d, type: Date, format: 'mmm d, yyyy' } : null
  }
  const data = [
    headers.map((h) => ({ value: h, fontWeight: 'bold' as const })),
    ...applications.map((a) => [
      a.company_name,
      a.title,
      a.status,
      date(a.applied_date),
      a.applied_email || null,
      a.referral || null,
      date(a.last_update),
      a.notes || null,
    ]),
  ]
  await writeExcelFile(data, {
    sheet: 'Applications',
    columns: [{ width: 22 }, { width: 30 }, { width: 14 }, { width: 13 }, { width: 12 }, { width: 18 }, { width: 13 }, { width: 50 }],
    stickyRowsCount: 1,
  }).toFile(fileName)
}
