import { describe, expect, it } from 'vitest'
import { parsePrKey, parsePrUrl, pollInterval, prKey, prStateOf } from './pullRequests'

describe('parsePrUrl', () => {
  const ref = { owner: 'acme', repo: 'web.app', number: 42 }
  it.each([
    'https://github.com/acme/web.app/pull/42',
    'https://github.com/acme/web.app/pull/42/',
    'https://github.com/acme/web.app/pull/42/files',
    'https://github.com/acme/web.app/pull/42/commits',
    'https://github.com/acme/web.app/pull/42/commits/abc123',
    'https://github.com/acme/web.app/pull/42?w=1',
    'https://github.com/acme/web.app/pull/42#issuecomment-1',
    'https://github.com/acme/web.app/pull/42/files#diff-1',
  ])('accepts %s', url => expect(parsePrUrl(url)).toEqual(ref))

  it.each([
    'https://github.com/acme/web/issues/42',
    'https://github.com/acme/web',
    'https://github.com/acme/web/pulls',
    'https://github.com/acme/web/pull/abc',
    'https://github.com/acme/web/pull/42/checks',
    'https://github.com/acme/web/pull/42x',
    'http://github.com/acme/web/pull/42',
    'https://github.example.com/acme/web/pull/42',
    'https://evilgithub.com/acme/web/pull/42',
    'https://github.com.evil.io/acme/web/pull/42',
    'npkn:abc',
  ])('rejects %s', url => expect(parsePrUrl(url)).toBeNull())

  it('round-trips a key, case-folded', () => {
    expect(prKey({ owner: 'Acme', repo: 'Web', number: 7 })).toBe('acme/web/7')
    expect(parsePrKey('acme/web/7')).toEqual({ owner: 'acme', repo: 'web', number: 7 })
  })
})

describe('prStateOf', () => {
  it('maps the REST body: merged > closed > draft > open', () => {
    expect(prStateOf({ state: 'closed', merged: true, draft: true })).toBe('merged')
    expect(prStateOf({ state: 'closed', merged: false, draft: true })).toBe('closed')
    expect(prStateOf({ state: 'open', merged: false, draft: true })).toBe('draft')
    expect(prStateOf({ state: 'open', merged: false, draft: false })).toBe('open')
  })
})

describe('pollInterval', () => {
  const MIN = 60_000
  it('is 5 minutes with a token, however many PRs', () => {
    expect(pollInterval(true, 1)).toBe(5 * MIN)
    expect(pollInterval(true, 40)).toBe(5 * MIN)
  })
  it('without a token spaces PRs 2 minutes apart, never under 5 minutes', () => {
    expect(pollInterval(false, 1)).toBe(5 * MIN)
    expect(pollInterval(false, 2)).toBe(5 * MIN)
    expect(pollInterval(false, 3)).toBe(6 * MIN)
    expect(pollInterval(false, 10)).toBe(20 * MIN)
  })
})
