import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }))

describe('Markdown links', () => {
  it('links a bare URL and leaves trailing punctuation outside it', () => {
    const out = html('See https://example.com/a. Then more')
    expect(out).toContain('<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">https://example.com/a</a>. Then more')
  })

  it('links [text](url)', () => {
    expect(html('[docs](https://example.com/x)')).toContain('<a href="https://example.com/x"')
  })

  it('never emits a javascript: href, even when a second "](" hides in the URL', () => {
    for (const evil of ['[a](https://x](javascript:alert`1`)', '[a](javascript:alert(1))', '<a href="javascript:alert(1)">x</a>']) {
      expect(html(evil)).not.toMatch(/href="javascript:/i)
    }
  })
})

describe('Markdown blocks', () => {
  it('renders a GFM table with header, body and alignment', () => {
    const out = html('| Env | URL |\n|:--|--:|\n| QA | **x** |')
    expect(out).toContain('<table>')
    expect(out).toContain('<th style="text-align:left">Env</th>')
    expect(out).toContain('<td style="text-align:right"><strong>x</strong></td>')
  })

  it('renders nested and ordered lists and task items', () => {
    const out = html('1. one\n   - inner\n2. two\n\n- [x] done\n- [ ] open')
    expect(out).toMatch(/<ol>.*<li>.*one.*<ul>.*inner.*<\/ul>.*<\/li>.*two.*<\/ol>/)
    expect(out).toContain('☑')
    expect(out).toContain('☐')
  })

  it('renders code blocks and quotes literally', () => {
    expect(html('```ts\nlet a = 1 < 2 && "x"\n```')).toContain('<pre><code>let a = 1 &lt; 2 &amp;&amp; &quot;x&quot;</code></pre>')
    expect(html('> quoted')).toContain('<blockquote><p>quoted</p></blockquote>')
  })

  it('shows inline text and code spans with their real characters, escaped once', () => {
    const out = html('a < b & c `x<y`')
    expect(out).toContain('a &lt; b &amp; c ')
    expect(out).toContain('<code>x&lt;y</code>')
  })

  it('never produces raw HTML elements or images from model output', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> ![p](https://evil.test/p.png)')
    expect(out).not.toMatch(/<script|<img/i)
    expect(out).toContain('&lt;script&gt;')
  })
})
