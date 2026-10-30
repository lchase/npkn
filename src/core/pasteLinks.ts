export type Inline = { type: 'text'; text: string; marks?: { type: 'link'; attrs: { href: string } }[] }

const URL_RE = /https?:\/\/[^\s<>]+/g
const JIRA_RE = /^https?:\/\/[\w.-]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)(?:[/?#]|$)/
const PR_RE = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)(?:[/?#]|$)/

/** Short display text for a Jira issue or GitHub PR URL, else null. */
export function linkLabel(url: string): string | null {
  const jira = JIRA_RE.exec(url)
  if (jira) return jira[1]
  const pr = PR_RE.exec(url)
  return pr ? `PR #${pr[1]}` : null
}

/**
 * Pasted plain text as lines of inline nodes, with each Jira/PR URL turned into a link labelled by
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
