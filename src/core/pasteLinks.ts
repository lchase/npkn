export type Inline = { type: 'text'; text: string; marks?: { type: 'link'; attrs: { href: string } }[] }

const URL_RE = /https?:\/\/[^\s<>]+/g
const END = '(?:[/?#]|$)'
const HOST = '[\\w.-]+'

// First match wins. A label comes from the URL alone: nothing here may fetch.
const RULES: [RegExp, (m: RegExpExecArray) => string][] = [
  [new RegExp(`^https?://${HOST}\\.atlassian\\.net/browse/([A-Z][A-Z0-9]+-\\d+)${END}`), m => m[1]],
  [new RegExp(`^https?://${HOST}\\.atlassian\\.net/wiki/spaces/[^/]+/pages/\\d+/([^/?#]+)`), m => slugTitle(m[1])],
  [new RegExp(`^https?://linear\\.app/[^/]+/issue/([A-Z][A-Z0-9]+-\\d+)${END}`), m => m[1]],
  [new RegExp(`^https?://github\\.com/${HOST}/${HOST}/pull/(\\d+)${END}`), m => `PR #${m[1]}`],
  [new RegExp(`^https?://github\\.com/${HOST}/${HOST}/issues/(\\d+)${END}`), m => `Issue #${m[1]}`],
  [new RegExp(`^https?://github\\.com/${HOST}/${HOST}/commit/([0-9a-f]{7,40})${END}`), m => m[1].slice(0, 7)],
  [new RegExp(`^https?://github\\.com/(${HOST}/${HOST})/?(?:[?#]|$)`), m => m[1]],
  [new RegExp(`^https?://(?:www\\.)?(?:x|twitter)\\.com/(\\w+)/status/\\d+${END}`), m => `@${m[1]} post`],
]

/** Confluence page slug ("My_Page+Title") back to readable words. */
function slugTitle(slug: string): string {
  try {
    return decodeURIComponent(slug.replace(/\+/g, ' ')).replace(/_/g, ' ')
  } catch {
    return slug
  }
}

/** Short display text for a recognised URL, else null. */
export function linkLabel(url: string): string | null {
  for (const [re, label] of RULES) {
    const m = re.exec(url)
    if (m) return label(m)
  }
  return null
}

/**
 * Pasted plain text as lines of inline nodes, with each recognised URL turned into a link labelled by
 * `linkLabel`. Null when the paste has none, so ordinary pastes keep the editor's default handling.
 */
export function pastedLinkLines(text: string): Inline[][] | null {
  let found = false
  const lines = text
    .split(/\r?\n/)
    .filter(l => l.trim())
    .map(line => {
      const out: Inline[] = []
      let last = 0
      const plain = (to: number) => to > last && out.push({ type: 'text', text: line.slice(last, to) })
      for (const m of line.matchAll(URL_RE)) {
        // Trailing punctuation belongs to the sentence ("(pr: <url> )", "see <url>."), not the URL.
        const url = m[0].replace(/[).,;:!?'"]+$/, '')
        const label = linkLabel(url)
        if (!label) continue
        found = true
        plain(m.index!)
        out.push({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }] })
        last = m.index! + url.length
      }
      plain(line.length)
      return out
    })
  return found ? lines : null
}
