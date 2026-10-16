import { LABELS_PAGE_ID, type Registry } from '../core/labels'
import { setYamlBlock } from '../core/notefile'
import type { Page } from '../core/types'
import { putPage, updatePage } from './pages'

const BASE_FRONT = 'type: config\ntitle: "Labels"\n'

/**
 * Persist label overrides. They live in a normal page ("Labels") in the notebook, so they sync with the
 * folder, export in a bundle, and are readable by anything that reads the notebook. The page is only
 * created the first time something is customised; until then the built-in defaults apply.
 */
export async function saveLabelOverrides(pages: Pick<Page, 'id' | 'frontmatter'>[], overrides: Registry): Promise<void> {
  const existing = pages.find(p => p.id === LABELS_PAGE_ID)
  const frontmatter = setYamlBlock(existing?.frontmatter?.trim() ? existing.frontmatter : BASE_FRONT, 'labels', overrides)
  if (existing) {
    await updatePage(LABELS_PAGE_ID, { frontmatter })
    return
  }
  const now = Date.now()
  await putPage({
    id: LABELS_PAGE_ID,
    parentId: null,
    title: 'Labels',
    frontmatter,
    createdAt: now,
    updatedAt: now,
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Colors and statuses for your @labels. Edit them in Settings, or change the labels block in this page’s properties.',
            },
          ],
        },
      ],
    },
  })
}
