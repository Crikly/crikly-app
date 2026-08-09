'use client'

import { useSyncExternalStore } from 'react'

// P-04-A: every GSAP animation on the parent surfaces must be skipped when
// the OS-level reduced-motion preference is set. useSyncExternalStore
// keeps the media query as the single source of truth (no setState-in-
// effect), returns false during SSR, and tracks live preference changes.

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
