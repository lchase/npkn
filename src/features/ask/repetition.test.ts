import { describe, expect, it } from 'vitest'
import { isLooping, trimLoop } from './repetition'

const row = (env: string) => `| ${env} | https://support-dashboard.meza.talkdeskqaca.com/some/long/path | td-us-1 |\n`

describe('repetition guard', () => {
  it('flags a table row repeated over and over, and trims back to one copy', () => {
    const head = 'Here is the table:\n\n| Env | URL | Region |\n|---|---|---|\n'
    const stuck = head + row('QA').repeat(8)
    expect(isLooping(stuck)).toBe(true)
    const trimmed = trimLoop(stuck)
    expect(trimmed.startsWith(head)).toBe(true)
    expect(trimmed.split(row('QA')).length - 1).toBeLessThanOrEqual(2) // one copy plus the window's overlap
    expect(trimmed.length).toBeLessThan(stuck.length / 2)
  })

  it('does not flag a long table with different rows, or ordinary prose', () => {
    const envs = ['Staging', 'QA', 'Production', 'Dev', 'Sandbox', 'Canary', 'EU', 'CA', 'UK', 'AU']
    expect(isLooping(envs.map(row).join(''))).toBe(false)
    expect(isLooping('The quick brown fox jumps over the lazy dog. '.repeat(3))).toBe(false)
    expect(isLooping('short')).toBe(false)
  })

  it('does not flag the same line repeated only a few times', () => {
    expect(isLooping(row('QA').repeat(3))).toBe(false)
  })
})
