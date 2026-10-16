import { useId } from 'react'
import type { CharacterProps, Viseme } from './types'
import { cls, useAvatar } from './useAvatar'

export type ShapeKind = 'pebble' | 'bean' | 'flower' | 'gumdrop' | 'drop' | 'pillow' | 'capsule'
export type Look = 'flat' | 'soft' | 'plush'

export interface DotPreset {
  id: string
  label: string
  blurb: string
  color: string
  shape: ShapeKind
  /** Eye geometry in the 200x200 viewBox. `round` swaps pills for dots. */
  eyes: { dx: number; y: number; w: number; h: number; tilt: number; round?: boolean }
  /** Rotates the whole face with a tilted body so the eyes stay level with it. */
  faceRotate?: number
  /** Top-left gloss position. */
  gloss: { x: number; y: number; rx: number; ry: number; rot: number }
  /** Little stalk with a glowing tip, poking out of the top. */
  antenna?: boolean
  /** Y of the ground shadow (default 188) and of the bounce light inside the body (default 166). */
  ground?: number
  bounce?: number
}

/** Silhouettes: soft, asymmetric, deliberately not a copy of any existing mascot set. */
function Shape({ kind, ...p }: { kind: ShapeKind } & React.SVGProps<SVGElement>) {
  const a = p as any
  switch (kind) {
    case 'pebble':
      return <path d="M100 30 C134 30 168 82 170 128 C172 162 140 176 100 176 C60 176 28 162 30 128 C32 82 66 30 100 30 Z" {...a} />
    case 'bean':
      return <rect x="46" y="32" width="108" height="146" rx="54" transform="rotate(14 100 105)" {...a} />
    case 'flower':
      return (
        <>
          {[0, 60, 120, 180, 240, 300].map(d => {
            const r = (d * Math.PI) / 180
            return <circle key={d} cx={100 + Math.sin(r) * 46} cy={104 - Math.cos(r) * 46} r="30" {...a} />
          })}
          <circle cx="100" cy="104" r="48" {...a} />
        </>
      )
    case 'gumdrop':
      return <path d="M28 168 V112 C28 64 60 34 100 34 C140 34 172 64 172 112 V168 Q172 176 164 176 H36 Q28 176 28 168 Z" {...a} />
    case 'drop':
      return <path d="M100 26 C118 58 162 90 162 126 C162 156 136 176 100 176 C64 176 38 156 38 126 C38 90 82 58 100 26 Z" {...a} />
    case 'capsule':
      return <rect x="22" y="80" width="156" height="82" rx="41" {...a} />
    case 'pillow':
      return (
        <path
          d="M46 42 Q100 54 154 42 Q146 104 154 166 Q100 154 46 166 Q54 104 46 42 Z"
          strokeLinejoin="round"
          strokeWidth="16"
          stroke={a.fill ?? 'none'}
          {...a}
        />
      )
  }
}

export const PRESETS: DotPreset[] = [
  { id: 'pip', label: 'Pip', blurb: 'Horizontal pill with an antenna', color: '#35c06f', shape: 'capsule', antenna: true, ground: 176, bounce: 150, eyes: { dx: 27, y: 119, w: 13, h: 28, tilt: -6 }, gloss: { x: 62, y: 98, rx: 28, ry: 9, rot: -6 } },
  { id: 'coral', label: 'Coral', blurb: 'Pebble, slanted eyes', color: '#ff6b4a', shape: 'pebble', eyes: { dx: 23, y: 106, w: 14, h: 32, tilt: -14 }, gloss: { x: 70, y: 66, rx: 26, ry: 12, rot: -35 } },
  { id: 'lagoon', label: 'Lagoon', blurb: 'Leaning bean', color: '#10b5b0', shape: 'bean', eyes: { dx: 20, y: 98, w: 13, h: 34, tilt: 2 }, faceRotate: 14, gloss: { x: 74, y: 56, rx: 24, ry: 11, rot: -20 } },
  { id: 'iris', label: 'Iris', blurb: 'Soft flower', color: '#7c5cff', shape: 'flower', eyes: { dx: 20, y: 102, w: 18, h: 26, tilt: 0, round: true }, gloss: { x: 66, y: 66, rx: 24, ry: 11, rot: -35 } },
  { id: 'sun', label: 'Sun', blurb: 'Gumdrop', color: '#ffb020', shape: 'gumdrop', eyes: { dx: 24, y: 112, w: 13, h: 30, tilt: 8 }, gloss: { x: 66, y: 66, rx: 24, ry: 11, rot: -30 } },
  { id: 'berry', label: 'Berry', blurb: 'Teardrop', color: '#e63e8b', shape: 'drop', eyes: { dx: 18, y: 122, w: 12, h: 26, tilt: -10 }, gloss: { x: 78, y: 78, rx: 20, ry: 10, rot: -45 } },
  { id: 'sky', label: 'Sky', blurb: 'Puffy pillow', color: '#2f8bff', shape: 'pillow', eyes: { dx: 23, y: 104, w: 14, h: 28, tilt: 10 }, gloss: { x: 68, y: 64, rx: 24, ry: 10, rot: -12 } },
]

/** Dark eyes on light bodies, white eyes on dark ones, so any user colour stays readable. */
function eyeColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.42 ? '#1b1b22' : '#ffffff'
}

const MOUTH: Record<Viseme, { w: number; h: number } | null> = {
  A: { w: 17, h: 15 },
  E: { w: 26, h: 8 },
  O: { w: 11, h: 13 },
  M: { w: 15, h: 4 },
  grin: { w: 20, h: 12 },
  smile: null,
  hmm: null,
  sad: null,
}

function Eye({ cx, cy, w, h, tilt, round, className }: { cx: number; cy: number; w: number; h: number; tilt: number; round?: boolean; className?: string }) {
  // Tilt lives on a wrapper: the eye itself gets a CSS transform (blink), and CSS transform-origin
  // would re-apply an SVG rotate(angle cx cy) around the wrong point.
  return (
    <g transform={`rotate(${tilt} ${cx} ${cy})`}>
      {round ? (
        <circle className={className} cx={cx} cy={cy} r={Math.min(w, h) / 2} />
      ) : (
        <rect className={className} x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={w / 2} />
      )}
    </g>
  )
}

/**
 * A "dot": a coloured soft shape whose only face is two eyes. Expression comes from eye tilt,
 * body squash-and-stretch and, while talking, a small mouth. `look` sets how much depth it has.
 */
export function Dot({ preset, mood = 'idle', size = 120, track = true, look = 'soft' }: CharacterProps & { preset: DotPreset; look?: Look }) {
  const uid = useId().replace(/:/g, '')
  const { root, blink, viseme } = useAvatar(mood, track)
  const { eyes: e } = preset
  const lx = 100 - e.dx
  const rx = 100 + e.dx

  const leftTilt = mood === 'error' ? 18 : mood === 'thinking' ? e.tilt + 14 : e.tilt
  const rightTilt = mood === 'error' ? -18 : mood === 'thinking' ? -e.tilt - 4 : -e.tilt
  const rightScale = mood === 'thinking' ? 0.8 : 1

  const mouth = mood === 'talking' ? MOUTH[viseme] : null
  const mouthY = e.y + e.h / 2 + 18
  const g = preset.gloss
  const deep = look !== 'flat'

  return (
    <svg
      ref={root}
      className={cls('dot', mood, blink) + ` look-${look}`}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Assistant"
      style={{ ['--dot' as string]: preset.color, ['--eye' as string]: eyeColor(preset.color) }}
    >
      <defs>
        <clipPath id={`${uid}-clip`}>
          <Shape kind={preset.shape} />
        </clipPath>
        <radialGradient id={`${uid}-shade`} cx="34%" cy="26%" r="90%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        {look === 'plush' && (
          <filter id={`${uid}-fuzz`} x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        )}
      </defs>

      <ellipse className="dot-shadow" cx="100" cy={preset.ground ?? 188} rx="62" ry="6" />

      <g className="dot-lean">
        <g className="dot-anim">
          {preset.antenna && (
            <g className="dot-antenna">
              <path className="dot-stalk" d="M116 90 Q108 60 124 42" />
              <circle className="dot-tip" cx="124" cy="35" r="9" />
              {deep && <circle className="dot-tip-gloss" cx="121" cy="32" r="3" />}
            </g>
          )}
          <g filter={look === 'plush' ? `url(#${uid}-fuzz)` : undefined}>
            {deep && (
              <g transform="translate(0 7)">
                <Shape kind={preset.shape} className="dot-base" />
              </g>
            )}
            <Shape kind={preset.shape} className="dot-fill" />
            {deep && (
              <g clipPath={`url(#${uid}-clip)`}>
                <Shape kind={preset.shape} fill={`url(#${uid}-shade)`} />
                <ellipse className="dot-bounce" cx="100" cy={preset.bounce ?? 166} rx="52" ry="12" filter={`url(#${uid}-soft)`} />
                <ellipse
                  className="dot-gloss"
                  cx={g.x}
                  cy={g.y}
                  rx={g.rx}
                  ry={g.ry}
                  transform={`rotate(${g.rot} ${g.x} ${g.y})`}
                  filter={`url(#${uid}-soft)`}
                />
              </g>
            )}
          </g>

          <g transform={preset.faceRotate ? `rotate(${preset.faceRotate} 100 105)` : undefined}>
            <g className="g-look">
              {mood === 'happy' ? (
                <g className="dot-happy">
                  <path d={`M${lx - 12} ${e.y + 6} Q${lx} ${e.y - 16} ${lx + 12} ${e.y + 6}`} />
                  <path d={`M${rx - 12} ${e.y + 6} Q${rx} ${e.y - 16} ${rx + 12} ${e.y + 6}`} />
                </g>
              ) : (
                <>
                  <Eye className="g-eye dot-eye" cx={lx} cy={e.y} w={e.w} h={e.h} tilt={leftTilt} round={e.round} />
                  <Eye className="g-eye dot-eye" cx={rx} cy={e.y} w={e.w * rightScale} h={e.h * rightScale} tilt={rightTilt} round={e.round} />
                </>
              )}
              {mouth && (
                <rect
                  className="dot-mouth"
                  x={100 - mouth.w / 2}
                  y={mouthY - mouth.h / 2}
                  width={mouth.w}
                  height={mouth.h}
                  rx={Math.min(mouth.w, mouth.h) / 2}
                />
              )}
            </g>
          </g>
        </g>
      </g>

      {mood === 'thinking' && (
        <g className="dot-thought">
          <circle cx="160" cy="54" r="5" />
          <circle cx="172" cy="40" r="7" />
          <circle cx="188" cy="22" r="10" />
        </g>
      )}
      {mood === 'error' && <path className="dot-sweat" d="M152 56 q9 13 0 21 q-9 -8 0 -21 Z" />}
      {mood === 'happy' && (
        <g className="dot-sparkles">
          <path d="M30 56 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" />
          <path d="M170 70 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 Z" />
        </g>
      )}
    </svg>
  )
}
