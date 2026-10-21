import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { CodeBlock } from './CodeBlock'
import { Chip } from './chip'

/** The document schema. Shared by the editor and by markdown import, so both agree on node types. */
export const editorExtensions = [
  StarterKit.configure({ codeBlock: false }),
  CodeBlock,
  // npkn: is the app's private scheme for links to other pages (core/links.ts).
  Link.configure({ openOnClick: false, protocols: ['npkn'] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  // Not resizable: markdown has no column widths, so a dragged width would silently vanish on sync.
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Chip,
]
