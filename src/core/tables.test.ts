import { describe, expect, it } from 'vitest'
import { docToMarkdown, markdownToPage, pastedTableMarkdown } from './markdown'

const MD = '| Name | Notes |\n| --- | --- |\n| a \\| b | **bold** and `code` |\n| x<br>y |  |'

describe('tables', () => {
  it('imports a GFM table as table/row/header/cell nodes', () => {
    const t = markdownToPage(MD, 'x.md').content.content![0]
    expect(t.type).toBe('table')
    expect(t.content).toHaveLength(3)
    expect(t.content![0].content![0].type).toBe('tableHeader')
    expect(t.content![1].content![0].type).toBe('tableCell')
  })

  it('round-trips through markdown', () => {
    const once = docToMarkdown(markdownToPage(MD, 'x.md').content)
    expect(once).toContain('| a \\| b | **bold** and `code` |')
    expect(once).toContain('| x<br>y |  |')
    expect(docToMarkdown(markdownToPage(once, 'x.md').content)).toBe(once)
  })
})

describe('pastedTableMarkdown', () => {
  it('converts tab-separated rows', () => {
    expect(pastedTableMarkdown('a\tb\n1\t2\n')).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })
  it('passes a markdown table through', () => {
    expect(pastedTableMarkdown(MD)).toBe(MD)
  })
  it.each(['one line\tonly', 'plain\nprose', 'a\tb\nc', 'a | b\nnot a separator'])('ignores %j', s => {
    expect(pastedTableMarkdown(s)).toBeNull()
  })
})
