/**
 * The front matter keys the app understands, in one place, so the UI can teach them and catch typos.
 * Any other key is allowed and preserved (Open Knowledge Format requires that); this list only drives hints.
 */

export interface KeyInfo {
  key: string
  /** One line, plain words: what it does for the user. */
  help: string
  /** What gets inserted when the user picks it. */
  insert: string
  /** Shown as a quick-add chip. Reserved/managed keys are known but not offered. */
  offer: boolean
}

export const KNOWN_KEYS: KeyInfo[] = [
  { key: 'type', help: 'What kind of page this is: note, meeting, decision, project, person, runbook… Open Knowledge Format needs one.', insert: 'note', offer: true },
  { key: 'description', help: 'One-line summary. Shown on the properties line, and used by search and Ask to find this page.', insert: '', offer: true },
  { key: 'tags', help: 'Labels for filtering. Ask can answer "which notes are tagged work?".', insert: '[]', offer: true },
  { key: 'private', help: 'Keeps this page, and everything under it, out of what cloud models can see.', insert: 'true', offer: true },
  { key: 'status', help: 'Where it stands: draft, active, stable, superseded…', insert: 'active', offer: true },
  { key: 'owner', help: 'Who is responsible for this page.', insert: '', offer: true },
  { key: 'date', help: 'The date the page is about, e.g. 2026-10-14.', insert: '', offer: true },
  { key: 'stale_after', help: 'A date after which this page should be treated as out of date.', insert: '', offer: true },
  { key: 'resource', help: 'A link to what this page is about (a repo, a ticket, a document).', insert: '', offer: false },
  { key: 'sources', help: 'Where this information came from.', insert: '[]', offer: false },
  { key: 'supersedes', help: 'The page this one replaces.', insert: '', offer: false },
  { key: 'pinned', help: 'Shows this page in Pinned at the top of the sidebar.', insert: 'true', offer: false },
  { key: 'labels', help: 'Colors and statuses for @labels. Easiest to change in Settings.', insert: '', offer: false },
  // Managed by the app; known so they never trigger a typo hint.
  { key: 'title', help: 'Kept in step with the page title.', insert: '', offer: false },
  { key: 'id', help: 'Managed by the app.', insert: '', offer: false },
  { key: 'generated', help: '', insert: '', offer: false },
  { key: 'verified', help: '', insert: '', offer: false },
]

export const TYPE_IDEAS = ['note', 'meeting', 'decision', 'project', 'person', 'runbook', 'guide', 'list']

const KNOWN = new Set(KNOWN_KEYS.map(k => k.key))

export function keyHelp(key: string): string | undefined {
  return KNOWN_KEYS.find(k => k.key === key)?.help
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        // adjacent swap ("tpye")
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? dp[i - 2][j - 2] + 1 : Infinity,
      )
    }
  }
  return dp[a.length][b.length]
}

export interface KeyHint {
  key: string
  suggestion: string
  message: string
}

/**
 * Keys that look like a mistyped known key. Unknown-but-unrelated keys get no hint: custom keys are
 * legitimate. The case that matters most is a near-miss on `private`, which would otherwise fail silently.
 */
export function keyHints(keys: string[]): KeyHint[] {
  const out: KeyHint[] = []
  for (const key of keys) {
    if (KNOWN.has(key)) continue
    const lower = key.toLowerCase()
    if (KNOWN.has(lower)) {
      out.push({ key, suggestion: lower, message: `Keys are case-sensitive. Did you mean \`${lower}\`?` })
      continue
    }
    if (key.length < 3) continue
    let best: { k: string; d: number } | null = null
    for (const k of KNOWN) {
      const d = distance(lower, k)
      const limit = Math.min(k.length, lower.length) <= 5 ? 1 : 2
      if (d <= limit && (!best || d < best.d)) best = { k, d }
    }
    if (best) out.push({ key, suggestion: best.k, message: `\`${key}\` isn't a known property. Did you mean \`${best.k}\`?` })
  }
  return out
}
