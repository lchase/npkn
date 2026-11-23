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
