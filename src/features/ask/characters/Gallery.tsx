import { useState } from 'react'
import { Avatar, CHARACTERS, setCharacter, setColor, setLook, useCharacter, type Look, type Mood } from './index'

const MOODS: Mood[] = ['idle', 'thinking', 'talking', 'happy', 'error']
const LOOKS: Look[] = ['flat', 'soft', 'plush']

/** Live side-by-side of every character, with a mood preview so you can judge the animations. */
export function Gallery({ onClose }: { onClose: () => void }) {
  const { id, look, colors } = useCharacter()
  const [mood, setMood] = useState<Mood>('idle')

  return (
    <div className="gallery">
      <div className="gallery-head">
        <div className="gallery-moods">
          <span>Preview</span>
          {MOODS.map(m => (
            <button key={m} className={m === mood ? 'on' : ''} onClick={() => setMood(m)}>
              {m}
            </button>
          ))}
        </div>
        <div className="gallery-opts">
          <span>Look</span>
          {LOOKS.map(l => (
            <button key={l} className={'chip-btn' + (l === look ? ' on' : '')} onClick={() => setLook(l)}>
              {l}
            </button>
          ))}
          <button className="linklike" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
      <div className="gallery-grid">
        {CHARACTERS.map(c => (
          <div key={c.id} className={'gallery-tile' + (c.id === id ? ' selected' : '')}>
            <button className="gallery-pick" onClick={() => setCharacter(c.id)}>
              <Avatar character={c.id} mood={mood} size="100%" />
              <strong>{c.label}</strong>
              <span>{c.blurb}</span>
            </button>
            <div className="gallery-color">
              <input
                type="color"
                aria-label={`${c.label} colour`}
                value={colors[c.id] ?? c.color}
                onChange={e => setColor(c.id, e.target.value)}
              />
              {colors[c.id] && (
                <button className="linklike" onClick={() => setColor(c.id, null)}>
                  Reset
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
