/**
 * Case-insensitive plain-text matches of `query` in `text`, as [from, to) offsets into `text`.
 * Non-overlapping, left to right. A regex with the `i` flag folds case without changing string length
 * (unlike toLowerCase, where e.g. "İ" grows), so offsets stay valid for the original text.
 */
export function findMatches(text: string, query: string): [number, number][] {
  if (!query) return []
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  return [...text.matchAll(re)].map(m => [m.index!, m.index! + m[0].length])
}
