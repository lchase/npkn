import { useEffect } from 'react'

/** Floating bottom bar: ← label → . Dev only; the caller must not render it in production. */
export function PrototypeSwitcher({ variants, current, onChange }: { variants: { id: string; label: string }[]; current: string; onChange: (id: string) => void }) {
  const i = Math.max(0, variants.findIndex(v => v.id === current))
  const go = (d: number) => onChange(variants[(i + d + variants.length) % variants.length].id)

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  return (
    <div className="pv-switcher" role="group" aria-label="Prototype variant">
      <button onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span>
        {variants[i].id} <em>({variants[i].label})</em>
      </span>
      <button onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  )
}
