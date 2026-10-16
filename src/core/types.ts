/** ProseMirror/TipTap document JSON. Kept loose on purpose: the editor schema owns the real shape. */
export interface Doc {
  type: string
  attrs?: Record<string, any>
  content?: Doc[]
  text?: string
  marks?: { type: string; attrs?: Record<string, any> }[]
}

export interface Page {
  id: string
  parentId: string | null
  title: string
  content: Doc | null
  /** Raw YAML front matter (Open Knowledge Format). Kept as text so comments and key order survive. */
  frontmatter?: string
  /** Stable sort key for the sidebar. Never changes after creation (unlike updatedAt). */
  createdAt?: number
  updatedAt: number
}
