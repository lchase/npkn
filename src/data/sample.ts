import { deletePageTree, getPage, addPage } from './pages'
import { buildSamplePages, sampleId } from './sampleData'

export const SAMPLE_ROOT_ID = sampleId('root')

/** Create (or refresh) the sample notebook. Returns the root page id. */
export async function loadSampleNotebook(): Promise<string> {
  if (await getPage(SAMPLE_ROOT_ID)) await deletePageTree(SAMPLE_ROOT_ID)
  // The sidebar orders alphabetically now, so createdAt only matters as a stable tiebreak.
  for (const page of buildSamplePages()) await addPage(page)
  return SAMPLE_ROOT_ID
}
