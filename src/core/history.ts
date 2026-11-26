/**
 * In-memory back/forward history, like a browser's. `stack[at]` is the current entry. `recent` is
 * every visited entry, most recent first and unique by key, kept separately because going back
 * reorders what was "last seen" without changing the stack.
 */
export interface Nav<T> {
  stack: T[]
  at: number
  recent: T[]
}

// ponytail: fixed caps, nobody pages back 200 views; raise if someone asks.
const MAX = 200

export const startNav = <T>(v: T): Nav<T> => ({ stack: [v], at: 0, recent: [v] })

const touch = <T>(recent: T[], v: T, key: (v: T) => string) => [v, ...recent.filter(r => key(r) !== key(v))].slice(0, MAX)

/** Go somewhere new: drops any forward entries. Re-opening the current entry is a no-op. */
export function push<T>(n: Nav<T>, v: T, key: (v: T) => string): Nav<T> {
  if (key(n.stack[n.at]) === key(v)) return n
  const stack = [...n.stack.slice(0, n.at + 1), v].slice(-MAX)
  return { stack, at: stack.length - 1, recent: touch(n.recent, v, key) }
}

/** Move back (-1) or forward (1), skipping entries that no longer exist (deleted pages). */
export function step<T>(n: Nav<T>, dir: -1 | 1, ok: (v: T) => boolean, key: (v: T) => string): Nav<T> {
  for (let i = n.at + dir; i >= 0 && i < n.stack.length; i += dir) {
    if (ok(n.stack[i])) return { ...n, at: i, recent: touch(n.recent, n.stack[i], key) }
  }
  return n
}
