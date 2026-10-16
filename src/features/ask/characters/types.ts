export type Mood = 'idle' | 'thinking' | 'talking' | 'happy' | 'error'
export type Viseme = 'smile' | 'A' | 'E' | 'O' | 'M' | 'hmm' | 'sad' | 'grin'

export interface CharacterProps {
  mood?: Mood
  /** Pixel number or any CSS length, e.g. "100%". */
  size?: number | string
  /** Follow the cursor with eyes/head. Off for tiny sidebar instances. */
  track?: boolean
}
