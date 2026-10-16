import type { Doc } from '../core/types'
import { addDays, toISO } from '../core/dates'

// --- tiny doc builders -------------------------------------------------------
type Inline = Doc
const t = (text: string, ...marks: string[]): Inline => ({
  type: 'text',
  text,
  ...(marks.length ? { marks: marks.map(type => ({ type })) } : {}),
})
const code = (text: string) => t(text, 'code')
const link = (text: string, href: string): Inline => ({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] })
const category = (value: string): Inline => ({ type: 'chip', attrs: { kind: 'category', value, iso: null } })
const date = (value: string, offsetDays: number): Inline => ({
  type: 'chip',
  attrs: { kind: 'date', value, iso: toISO(addDays(new Date(), offsetDays)) },
})

const p = (...c: Inline[]): Doc => ({ type: 'paragraph', content: c })
const h = (level: 1 | 2 | 3, text: string): Doc => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const quote = (...c: Inline[]): Doc => ({ type: 'blockquote', content: [p(...c)] })
const hr = (): Doc => ({ type: 'horizontalRule' })
const li = (c: Inline[], ...nested: Doc[]): Doc => ({ type: 'listItem', content: [p(...c), ...nested] })
const ul = (...items: Doc[]): Doc => ({ type: 'bulletList', content: items })
const ol = (...items: Doc[]): Doc => ({ type: 'orderedList', content: items })
const todo = (checked: boolean, c: Inline[], ...nested: Doc[]): Doc => ({
  type: 'taskItem',
  attrs: { checked },
  content: [p(...c), ...nested],
})
const todos = (...items: Doc[]): Doc => ({ type: 'taskList', content: items })
const codeBlock = (language: string | null, src: string): Doc => ({
  type: 'codeBlock',
  attrs: { language },
  content: [{ type: 'text', text: src }],
})

// --- the style sheet page ----------------------------------------------------
export function buildWelcome(): Doc {
  return {
    type: 'doc',
    content: [
      p(t('Every element the editor can render, in one place. Switch themes from the sidebar footer and compare.')),

      h(2, 'Headings'),
      h(1, 'Heading 1'),
      h(2, 'Heading 2'),
      h(3, 'Heading 3'),

      h(2, 'Text'),
      p(
        t('Body text with '),
        t('bold', 'bold'),
        t(', '),
        t('italic', 'italic'),
        t(', '),
        t('strikethrough', 'strike'),
        t(', '),
        code('inline code'),
        t(' and a '),
        link('link to somewhere', 'https://example.com'),
        t('. Combined: '),
        t('bold italic', 'bold', 'italic'),
        t('.'),
      ),
      p(t('A second paragraph, to show spacing between blocks. Long enough to wrap onto a second line so you can judge line height and measure against the column width.')),
      quote(t('A blockquote. Good for pulled-out thoughts or quoted text.')),

      h(2, 'Lists'),
      ul(
        li([t('Bullet one')]),
        li([t('Bullet two, with children')], ul(li([t('Nested bullet')]), li([t('Another nested bullet')], ul(li([t('Third level')]))))),
        li([t('Bullet three')]),
      ),
      ol(li([t('First step')]), li([t('Second step')], ol(li([t('Sub-step')]))), li([t('Third step')])),

      h(2, 'Todos'),
      p(
        t('Open, done, dated, categorized, nested. All of these roll up into the Todos view. A label can also be a '),
        t('status', 'bold'),
        t(': '),
        category('doing'),
        t(' '),
        category('blocked'),
        t(' '),
        category('in-review'),
        t(' sit in "In progress", '),
        category('done'),
        t(' finishes the todo. Colors and groups are in Settings.'),
      ),
      todos(
        todo(false, [t('Plain todo, no metadata')]),
        todo(false, [t('Categorized '), category('work'), t(' ')]),
        todo(false, [t('Overdue, two days ago '), category('work'), t(' '), date('2d-ago', -2), t(' ')]),
        todo(false, [t('Due today '), category('personal'), t(' '), date('today', 0), t(' ')]),
        todo(false, [t('Due tomorrow, long category '), category('client-acme-q4'), t(' '), date('tomorrow', 1), t(' ')]),
        todo(false, [t('Later this week '), date('fri', 3), t(' ')], todos(todo(false, [t('Nested sub-task')]), todo(true, [t('Nested sub-task, done')]))),
        todo(true, [t('Finished todo '), category('personal'), t(' '), date('yesterday', -1), t(' ')]),
      ),

      h(2, 'Chips'),
      p(
        t('Categories: '),
        category('work'),
        t(' '),
        category('personal'),
        t(' '),
        category('client-acme'),
        t(' '),
        category('side-project'),
        t(' '),
        category('reading'),
        t(' '),
        category('health'),
        t(' '),
      ),
      p(t('Dates: '), date('2d-ago', -2), t(' '), date('today', 0), t(' '), date('tomorrow', 1), t(' '), date('fri', 4), t(' '), date('next-month', 40), t(' ')),

      h(2, 'Code'),
      p(t('Fenced blocks highlight by language. Type '), code('```ts'), t(' then space, or use the picker on a block. New blocks are plain text; pick a language, or choose auto to let it guess.')),
      codeBlock(
        'typescript',
        `interface Todo {
  text: string
  due: Date | null
  done: boolean
}

// Overdue first, then by due date
export function sortTodos(todos: Todo[]): Todo[] {
  const now = Date.now()
  return [...todos].sort((a, b) => {
    const overdue = Number(!!b.due && +b.due < now) - Number(!!a.due && +a.due < now)
    return overdue || (+(a.due ?? Infinity) - +(b.due ?? Infinity))
  })
}`,
      ),
      codeBlock(
        'python',
        `from dataclasses import dataclass
from datetime import date

@dataclass
class Todo:
    text: str
    due: date | None = None
    done: bool = False

def overdue(todos: list[Todo]) -> list[Todo]:
    """Return open todos whose due date has passed."""
    return [t for t in todos if not t.done and t.due and t.due < date.today()]`,
      ),
      codeBlock(
        'json',
        `{
  "id": "paper",
  "name": "Paper",
  "scheme": "light",
  "vars": { "bg": "#ffffff", "accent": "#2f6fed" }
}`,
      ),
      codeBlock(
        'bash',
        `# build and deploy
npm run build && rsync -a dist/ server:/var/www/notes/
echo "deployed $(date +%F)"`,
      ),
      codeBlock(
        'css',
        `.chip-date.overdue {
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  color: var(--danger);
}`,
      ),
      codeBlock(
        'sql',
        `SELECT category, COUNT(*) AS open
FROM todos
WHERE done = false AND due < CURRENT_DATE
GROUP BY category
ORDER BY open DESC;`,
      ),
      codeBlock('plaintext', `Plain text: no highlighting.\nNothing here is a keyword, even if it looks like one.`),

      hr(),

      h(2, 'Properties'),
      p(
        t('The muted line under the title is this page\'s front matter, in '),
        link('Open Knowledge Format', 'https://wiki.enola.dev/computer/ai/format/okf.html'),
        t(' style: YAML at the top of the file. Click it to open the editor; the '),
        code('Add'),
        t(' chips insert the common keys and explain each one on hover. Other keys are kept as written.'),
      ),
      ul(
        li([code('type'), t('  what kind of page it is (note, meeting, decision, project…)')]),
        li([code('description'), t('  one line; helps search and Ask find the page')]),
        li([code('tags'), t('  labels, e.g. '), code('[work, q4]')]),
        li([code('private: true'), t('  keeps the page and everything under it away from cloud models')]),
        li([code('status'), t(', '), code('owner'), t(', '), code('date'), t(', '), code('stale_after'), t('  optional, for people and agents')]),
      ),
      p(t('A mistyped key such as '), code('privat'), t(' is flagged with a one-click fix, because a typo on '), code('private'), t(' would otherwise do nothing.')),

      h(2, 'Markdown shortcuts'),
      p(t('Typing these triggers formatting; the syntax disappears.')),
      ul(
        li([code('# '), t(' '), code('## '), t(' '), code('### '), t('  headings')]),
        li([code('- '), t(' or '), code('* '), t('  bullet list, '), code('1. '), t('  numbered list')]),
        li([code('[] '), t('  todo')]),
        li([code('> '), t('  quote, '), code('---'), t('  divider')]),
        li([code('**bold**'), t(' '), code('*italic*'), t(' '), code('~~strike~~'), t(' '), code('`code`')]),
        li([code('```lang '), t('  code block')]),
        li([code('@work '), t(' category chip, '), code('@fri '), t(' '), code('@oct-20 '), t(' '), code('@2026-12-01 '), t(' date chip')]),
      ),
    ],
  }
}
