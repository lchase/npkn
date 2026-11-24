/**
 * Small local models sometimes get stuck and repeat one line (a table row, a URL) until something stops
 * them. A reply is "looping" once its last WINDOW characters have already appeared REPEATS times, which
 * ordinary prose, lists and tables with varied rows never do. Provider-independent: checked on the text.
 */
const WINDOW = 100
const REPEATS = 4

export function isLooping(text: string): boolean {
  if (text.length < WINDOW * REPEATS) return false
  return text.split(text.slice(-WINDOW)).length - 1 >= REPEATS
}

/** Keep everything up to and including the first copy of the repeated stretch. */
export function trimLoop(text: string): string {
  return text.slice(0, text.indexOf(text.slice(-WINDOW)) + WINDOW)
}
