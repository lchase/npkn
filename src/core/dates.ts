const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Turn a chip word (today, fri, 2026-10-15, 10-15, oct-15) into an ISO date, or null if it's a category. */
export function parseDate(word: string, now = new Date()): string | null {
  const w = word.toLowerCase()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (w === 'today') return toISO(today)
  if (w === 'tomorrow' || w === 'tmrw') return toISO(addDays(today, 1))

  const dayIdx = DAYS.findIndex(d => w === d || w === d + 'day' || w === d + 's')
  if (dayIdx >= 0 || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(w)) {
    const idx = dayIdx >= 0 ? dayIdx : DAYS.findIndex(d => w.startsWith(d))
    let diff = (idx - today.getDay() + 7) % 7
    if (diff === 0) diff = 7
    return toISO(addDays(today, diff))
  }

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w)
  if (m) return validISO(+m[1], +m[2], +m[3])

  m = /^(\d{1,2})-(\d{1,2})$/.exec(w)
  if (m) return rollForward(+m[1], +m[2], today)

  m = /^([a-z]{3})-(\d{1,2})$/.exec(w)
  if (m && MONTHS.includes(m[1])) return rollForward(MONTHS.indexOf(m[1]) + 1, +m[2], today)

  return null
}

function validISO(y: number, mo: number, d: number): string | null {
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return toISO(dt)
}

/** Month/day with no year: pick this year, or next year if already past. */
function rollForward(mo: number, d: number, today: Date): string | null {
  let iso = validISO(today.getFullYear(), mo, d)
  if (!iso) return null
  if (iso < toISO(today)) iso = validISO(today.getFullYear() + 1, mo, d)
  return iso
}

export function relativeLabel(iso: string, now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = fromISO(iso)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export function isOverdue(iso: string, now = new Date()): boolean {
  return iso < toISO(now)
}
