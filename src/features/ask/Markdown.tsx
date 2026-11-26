import { marked, type Token, type Tokens } from 'marked'
import type { ReactNode } from 'react'

// Chat replies: GFM markdown (tables, nested and task lists, quotes, code, links) from `marked`'s token tree,
// turned into React elements. No innerHTML anywhere, so model output can't inject markup; raw HTML in a reply is
// shown as text, images are never fetched (they'd send a request to a model-chosen URL), and only http(s) links
// get an href.

// marked escapes inline text and code spans for HTML; React escapes again, so undo it once.
const unescape = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

const safeHref = (href: string) => {
  try {
    const p = new URL(href).protocol
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}

function inline(tokens: Token[] | undefined): ReactNode[] {
  return (tokens ?? []).map((t, i): ReactNode => {
    switch (t.type) {
      case 'text':
        return (t as Tokens.Text).tokens ? inline((t as Tokens.Text).tokens) : unescape(t.text)
      case 'escape':
        return t.text
      case 'strong':
        return <strong key={i}>{inline((t as Tokens.Strong).tokens)}</strong>
      case 'em':
        return <em key={i}>{inline((t as Tokens.Em).tokens)}</em>
      case 'del':
        return <del key={i}>{inline((t as Tokens.Del).tokens)}</del>
      case 'codespan':
        return <code key={i}>{unescape(t.text)}</code>
      case 'br':
        return <br key={i} />
      case 'link': {
        const l = t as Tokens.Link
        const kids = inline(l.tokens)
        return safeHref(l.href) ? (
          <a key={i} href={l.href} target="_blank" rel="noopener noreferrer">{kids}</a>
        ) : (
          <span key={i}>{kids}</span>
        )
      }
      case 'image':
        return unescape((t as Tokens.Image).text)
      default:
        return t.raw // inline html and anything unknown: visible as plain text
    }
  })
}

function blocks(tokens: Token[]): ReactNode[] {
  return tokens.map((t, i): ReactNode => {
    switch (t.type) {
      case 'space':
        return null
      case 'heading':
        return <p key={i}><strong>{inline((t as Tokens.Heading).tokens)}</strong></p>
      case 'paragraph':
        return <p key={i}>{inline((t as Tokens.Paragraph).tokens)}</p>
      case 'text': // a tight list item's own text
        return <span key={i}>{(t as Tokens.Text).tokens ? inline((t as Tokens.Text).tokens) : unescape(t.text)}</span>
      case 'blockquote':
        return <blockquote key={i}>{blocks((t as Tokens.Blockquote).tokens)}</blockquote>
      case 'code':
        return <pre key={i}><code>{(t as Tokens.Code).text}</code></pre>
      case 'hr':
        return <hr key={i} />
      case 'list': {
        const l = t as Tokens.List
        const Tag = l.ordered ? 'ol' : 'ul'
        return (
          <Tag key={i} start={l.ordered && l.start !== 1 ? Number(l.start) || undefined : undefined}>
            {l.items.map((it, j) => (
              <li key={j}>
                {it.task && <span className="md-task">{it.checked ? '☑ ' : '☐ '}</span>}
                {blocks(it.tokens)}
              </li>
            ))}
          </Tag>
        )
      }
      case 'table': {
        const tb = t as Tokens.Table
        const align = (c: number) => (tb.align[c] ? { textAlign: tb.align[c] as 'left' | 'center' | 'right' } : undefined)
        return (
          <div className="md-table" key={i}>
            <table>
              <thead>
                <tr>{tb.header.map((h, c) => <th key={c} style={align(c)}>{inline(h.tokens)}</th>)}</tr>
              </thead>
              <tbody>
                {tb.rows.map((r, ri) => (
                  <tr key={ri}>{r.map((cell, c) => <td key={c} style={align(c)}>{inline(cell.tokens)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      default:
        return t.raw.trim() ? <p key={i}>{t.raw}</p> : null // block html etc.: shown as text
    }
  })
}

export function Markdown({ text }: { text: string }) {
  return <>{blocks(marked.lexer(text, { gfm: true }))}</>
}
