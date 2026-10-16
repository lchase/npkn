import { useEffect, useRef, useState } from 'react'
import type { Mood, Viseme } from './types'

const TALK_CYCLE: Viseme[] = ['A', 'M', 'E', 'O', 'A', 'E', 'M', 'O', 'A']

/**
 * Behaviour shared by every character: cursor tracking (writes --lx/--ly on the svg, no re-render),
 * random blinking, occasional ear/limb twitch, and a mouth viseme that cycles while talking.
 */
export function useAvatar(mood: Mood, track: boolean) {
  const root = useRef<SVGSVGElement>(null)
  const [blink, setBlink] = useState(false)
  const [twitch, setTwitch] = useState<'' | 'l' | 'r'>('')
  const [viseme, setViseme] = useState<Viseme>('smile')

  useEffect(() => {
    if (!track) return
    let raf = 0
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = root.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(240, window.innerWidth / 2)
        const dy = (e.clientY - (r.top + r.height * 0.5)) / Math.max(240, window.innerHeight / 2)
        el.style.setProperty('--lx', String(Math.max(-1, Math.min(1, dx))))
        el.style.setProperty('--ly', String(Math.max(-1, Math.min(1, dy))))
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [track])

  useEffect(() => {
    let t1: number
    let t2: number
    const doBlink = () => {
      setBlink(true)
      window.setTimeout(() => setBlink(false), 120)
      t1 = window.setTimeout(doBlink, 1800 + Math.random() * 3800)
    }
    const doTwitch = () => {
      setTwitch(Math.random() < 0.5 ? 'l' : 'r')
      window.setTimeout(() => setTwitch(''), 260)
      t2 = window.setTimeout(doTwitch, 5000 + Math.random() * 7000)
    }
    t1 = window.setTimeout(doBlink, 1500)
    t2 = window.setTimeout(doTwitch, 4000)
    return () => (window.clearTimeout(t1), window.clearTimeout(t2))
  }, [])

  useEffect(() => {
    if (mood === 'talking') {
      let i = 0
      setViseme('A')
      const id = window.setInterval(() => {
        i = (i + 1 + Math.floor(Math.random() * 2)) % TALK_CYCLE.length
        setViseme(TALK_CYCLE[i])
      }, 105)
      return () => window.clearInterval(id)
    }
    setViseme(mood === 'thinking' ? 'hmm' : mood === 'error' ? 'sad' : mood === 'happy' ? 'grin' : 'smile')
  }, [mood])

  return { root, blink, twitch, viseme }
}

export const cls = (id: string, mood: Mood, blink: boolean, twitch = '') =>
  ['avatar', id, mood, blink ? 'blink' : '', twitch ? 'twitch-' + twitch : ''].filter(Boolean).join(' ')
