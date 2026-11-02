import { describe, expect, it } from 'vitest'
import { linkLabel, pastedLinkLines } from './pasteLinks'

const JIRA = 'https://talkdesk.atlassian.net/browse/AIAGP-4205'
const PR = 'https://github.com/Talkdesk/ai-agent-platform-ui/pull/1239'

describe('linkLabel', () => {
  it('labels Jira issues and GitHub PRs', () => {
    expect(linkLabel(JIRA)).toBe('AIAGP-4205')
    expect(linkLabel(PR)).toBe('PR #1239')
    expect(linkLabel(PR + '/files')).toBe('PR #1239')
  })
  it('labels the other offline rules', () => {
    const gh = 'https://github.com/Talkdesk/x'
    expect(linkLabel(`${gh}/issues/3`)).toBe('Issue #3')
    expect(linkLabel(`${gh}/commit/0123456789abcdef`)).toBe('0123456')
    expect(linkLabel(gh)).toBe('Talkdesk/x')
    expect(linkLabel(`${gh}/`)).toBe('Talkdesk/x')
    expect(linkLabel('https://x.com/jack/status/20?s=20')).toBe('@jack post')
    expect(linkLabel('https://twitter.com/jack/status/20')).toBe('@jack post')
    expect(linkLabel('https://linear.app/acme/issue/ENG-123/fix-it')).toBe('ENG-123')
    expect(linkLabel('https://talkdesk.atlassian.net/wiki/spaces/ENG/pages/123/Release_Plan+Q4')).toBe('Release Plan Q4')
    expect(linkLabel('https://talkdesk.atlassian.net/wiki/spaces/ENG/pages/123/100%25_done')).toBe('100% done')
  })
  it('ignores other urls', () => {
    expect(linkLabel('https://github.com/Talkdesk/x/tree/main')).toBeNull()
    expect(linkLabel('https://example.com/browse/AB-1')).toBeNull()
    expect(linkLabel('https://x.com/jack')).toBeNull()
  })
})

describe('pastedLinkLines', () => {
  it('relabels links inside prose and keeps the surrounding text', () => {
    const lines = pastedLinkLines(`${JIRA} tooltip bug (pr:  ${PR} )\n\n\nFollow up ${JIRA}.`)!
    expect(lines).toHaveLength(2)
    expect(lines[0].map(n => n.text)).toEqual(['AIAGP-4205', ' tooltip bug (pr:  ', 'PR #1239', ' )'])
    expect(lines[0][2].marks![0].attrs.href).toBe(PR)
    expect(lines[1].map(n => n.text)).toEqual(['Follow up ', 'AIAGP-4205', '.'])
  })
  it('is null when nothing matches', () => {
    expect(pastedLinkLines('hello https://example.com')).toBeNull()
  })
})
