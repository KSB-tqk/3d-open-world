import { useEffect, useState } from 'react'

// Even large phones in landscape stay within 1024 CSS pixels. A touchscreen
// laptop with a fine primary pointer, or any wide display, stays desktop.
export const INPUT_MODE_QUERY = '(max-width: 1024px) and (pointer: coarse)'

export function detectInputMode() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  return window.matchMedia(INPUT_MODE_QUERY).matches ? 'mobile' : 'desktop'
}

export default function useInputMode() {
  const [inputMode, setInputMode] = useState(detectInputMode)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia(INPUT_MODE_QUERY)
    const update = () => setInputMode(query.matches ? 'mobile' : 'desktop')
    update()
    query.addEventListener?.('change', update)
    // Keep resizing responsive even on browsers with incomplete MediaQueryList events.
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      query.removeEventListener?.('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return inputMode
}
