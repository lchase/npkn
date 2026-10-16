import { deletePageTree, listPages, putPage } from './pages'
import { buildWelcome } from './welcome'

const WELCOME_ID = 'welcome'
// Bump to push a new Welcome/style-guide page. It overwrites the existing one, edits included.
const WELCOME_VERSION = '6'
const WELCOME_KEY = 'npkn.welcome'

/**
 * Create or refresh the style-guide page. Returns its id only on the very first run, so the app can open
 * it once as an introduction. A refresh after a version bump returns null: it shouldn't pull anyone away
 * from their landing page.
 */
export async function ensureWelcome(): Promise<string | null> {
  let seen: string | null = null
  try {
    seen = localStorage.getItem(WELCOME_KEY)
  } catch {
    /* ignore */
  }
  // Only (re)seed on first run or a version bump. Not when the page is missing: someone deleted it.
  if (seen === WELCOME_VERSION) return null

  // Drop the random-id Welcome page the first prototype seeded.
  const legacy = (await listPages()).filter(p => p.id !== WELCOME_ID && p.parentId === null && p.title === 'Welcome')
  await Promise.all(legacy.map(p => deletePageTree(p.id)))
  await putPage({ id: WELCOME_ID, parentId: null, title: 'Welcome', content: buildWelcome(),
    frontmatter: [
      'type: guide',
      'title: Welcome',
      'description: Style sheet showing every element the editor can render, plus the shortcuts.',
      'tags: [style, reference]',
      'status: stable  # unknown keys are kept as written',
      '',
    ].join('\n'),
    createdAt: 0,
    updatedAt: Date.now(),
  })
  try {
    localStorage.setItem(WELCOME_KEY, WELCOME_VERSION)
  } catch {
    /* ignore */
  }
  return seen === null ? WELCOME_ID : null
}
