'use client'

import { useState } from 'react'
import { CHILD_IDENTITY_COLOURS } from '@/constants/childIdentity'

// P-04-A: the app-wide avatar. Three tiers in priority order:
//   1. photoUrl (Supabase Storage upload) when provided
//   2. DiceBear illustrated avatar — 'adventurer' tier for children (seed =
//      first name), 'personas' tier for adults/coaches (seed = full name)
//   3. coloured-initial circle — network-failure safety net only
// DiceBear is called via its free URL API (no package, no API key). A raw
// <img> is deliberate: api.dicebear.com is not in next.config.ts
// remotePatterns and that file requires explicit approval to change —
// same convention as ui/Avatar.tsx.
//
// Inline styles here are a documented exception (ui/progress-bar.tsx
// precedent): size and ringColor are dynamic per-instance values that
// cannot be expressed as static Tailwind classes.

const DICEBEAR_BASE = 'https://api.dicebear.com/7.x'

// UX-05 follow-up: the `style` prop is a semantic tier (adventurer =
// children, personas = adults), not the literal DiceBear collection — the
// rendered collection is mapped here so an app-wide avatar restyle is a
// one-line change with no call-site churn. Adults render 'shapes';
// children stay on 'adventurer' until the replacement style is chosen
// ('clay' was requested but 404s on every DiceBear version — verified).
const DICEBEAR_COLLECTION: Record<'adventurer' | 'personas', string> = {
  adventurer: 'adventurer',
  personas: 'shapes',
}

type AvatarTier = 'photo' | 'dicebear' | 'initial'

interface CriklyAvatarProps {
  seed: string
  style: 'adventurer' | 'personas'
  /** Diameter of the avatar circle in px (ring renders outside this). */
  size: number
  /** Child identity colour ring — an outer border on the circle. */
  ringColor?: string
  /** Ring thickness in px. Only applies when ringColor is set. */
  ringWidth?: number
  photoUrl?: string | null
  alt?: string
  className?: string
}

function fallbackColour(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % CHILD_IDENTITY_COLOURS.length
  return CHILD_IDENTITY_COLOURS[index] ?? CHILD_IDENTITY_COLOURS[0]
}

export function CriklyAvatar({
  seed,
  style,
  size,
  ringColor,
  ringWidth = 3,
  photoUrl,
  alt,
  className = '',
}: CriklyAvatarProps) {
  const [tier, setTier] = useState<AvatarTier>(photoUrl ? 'photo' : 'dicebear')

  // If photoUrl/seed change after mount (e.g. profile update event),
  // restart the tier cascade from the top. Render-time state adjustment —
  // the React-endorsed replacement for a setState-in-effect reset
  // (react.dev "adjusting state when props change").
  const sourceKey = `${photoUrl ?? ''}|${seed}`
  const [prevSourceKey, setPrevSourceKey] = useState(sourceKey)
  if (sourceKey !== prevSourceKey) {
    setPrevSourceKey(sourceKey)
    setTier(photoUrl ? 'photo' : 'dicebear')
  }

  const dicebearUrl = `${DICEBEAR_BASE}/${DICEBEAR_COLLECTION[style]}/svg?seed=${encodeURIComponent(seed)}`
  const src = tier === 'photo' && photoUrl ? photoUrl : dicebearUrl
  const label = alt ?? seed

  const handleError = () => {
    setTier((current) => (current === 'photo' ? 'dicebear' : 'initial'))
  }

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        boxSizing: 'content-box',
        border: ringColor ? `${ringWidth}px solid ${ringColor}` : undefined,
        padding: ringColor ? 2 : 0,
      }}
      data-testid="crikly-avatar"
    >
      {tier === 'initial' ? (
        <span
          aria-label={label}
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{
            backgroundColor: fallbackColour(seed),
            fontSize: Math.max(11, Math.round(size * 0.4)),
          }}
        >
          {seed.trim().charAt(0).toUpperCase() || '?'}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          width={size}
          height={size}
          onError={handleError}
          className="h-full w-full rounded-full object-cover"
        />
      )}
    </span>
  )
}
