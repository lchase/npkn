import { Extension, type ChainedCommands } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { suggestPopup } from './suggestPopup'

export type SlashCommand = { title: string; keys: string; run: (chain: ChainedCommands) => ChainedCommands }

export const SLASH_COMMANDS: SlashCommand[] = [
  { title: 'Heading 1', keys: 'h1 title', run: c => c.setHeading({ level: 1 }) },
  { title: 'Heading 2', keys: 'h2 subtitle', run: c => c.setHeading({ level: 2 }) },
  { title: 'Heading 3', keys: 'h3', run: c => c.setHeading({ level: 3 }) },
  { title: 'Todo list', keys: 'task checkbox checklist', run: c => c.toggleTaskList() },
  { title: 'Bullet list', keys: 'ul unordered', run: c => c.toggleBulletList() },
  { title: 'Numbered list', keys: 'ol ordered', run: c => c.toggleOrderedList() },
  { title: 'Quote', keys: 'blockquote', run: c => c.toggleBlockquote() },
  { title: 'Code block', keys: 'pre', run: c => c.setCodeBlock() },
  { title: 'Table', keys: 'grid', run: c => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { title: 'Divider', keys: 'hr rule line separator', run: c => c.setHorizontalRule() },
  // Hands over to the `[[` picker (pageLinks.ts), which opens on the inserted brackets.
  { title: 'Link to page', keys: 'page wiki', run: c => c.insertContent('[[') },
]

/** Commands whose title or a keyword starts with the query, or whose title contains it. */
export function matchSlash(query: string, commands = SLASH_COMMANDS): SlashCommand[] {
  const q = query.trim().toLowerCase()
  return commands.filter(c => {
    const title = c.title.toLowerCase()
    return title.includes(q) || `${title} ${c.keys}`.split(' ').some(w => w.startsWith(q))
  })
}

/**
 * `/` at the start of a block or after a space opens a block menu. Not mid-word (`a/b`, `1/2`: the
 * suggestion's default prefix rule) and not inside a code block.
 */
export const SlashMenu = Extension.create({
  name: 'slashMenu',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        pluginKey: new PluginKey('slashMenu'),
        char: '/',
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => matchSlash(query),
        command: ({ editor, range, props }) => void props.run(editor.chain().focus().deleteRange(range)).run(),
        render: suggestPopup<SlashCommand>({ label: c => c.title }),
      }),
    ]
  },
})
