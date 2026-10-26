import { describe, expect, it } from 'vitest'
import { isPinned } from './frontmatter'

describe('isPinned', () => {
  it.each(['pinned: true\n', 'pinned: "true"\n', 'type: note\npinned: TRUE\n'])('pins %j', fm => {
    expect(isPinned(fm)).toBe(true)
  })

  it.each([undefined, '', 'type: note\n', 'pinned: false\n', 'pinned: "yes"\n', 'pinned: "false"\n', 'pinned: [true]\n', 'pinned: true\n  bad: [\n'])(
    'does not pin %j',
    fm => expect(isPinned(fm)).toBe(false),
  )
})
