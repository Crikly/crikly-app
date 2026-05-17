// CF-PROGRAMMES-IMAGE-PICKER: programme cover photos via Unsplash Source.
//
// Was a hardcoded array of 6 curated Cricket URLs. Now generates URLs
// dynamically using the seed-based `source.unsplash.com` endpoint — no API
// key, no rate-limit, royalty-free. Each `sig=N` returns a different image
// from Unsplash's cricket pool, so the picker can show a fresh random set
// every time it opens (see ProgrammeImagePicker's `seeds` state + Refresh
// button).
//
// Phase 1 ships Cricket only — when other sports launch, branch in
// getImagesForSport and add their own URL template.

export interface ProgrammeImage {
  url: string
  alt: string
  credit: string
}

/**
 * Seed pool for Cricket — 18 distinct seeds gives the picker enough variety
 * that the 6-image grid + a Refresh tap rarely repeats. Extend if needed.
 */
export const CRICKET_SEEDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  10, 11, 12, 13, 14, 15, 16, 17, 18,
]

/**
 * Map a list of seeds to ProgrammeImage records. The Unsplash Source URL
 * pattern returns a different image for each `sig` query string value.
 */
export function getCricketImages(seeds: number[]): ProgrammeImage[] {
  return seeds.map((seed) => ({
    url: `https://source.unsplash.com/featured/800x600/?cricket&sig=${seed}`,
    alt: 'Cricket coaching session',
    credit: 'Unsplash',
  }))
}

/**
 * Default cover photo for programmes with no image_url set — uses seed=1
 * so existing programmes always render the same fallback (no per-render
 * randomisation that would shuffle the GroupCard hero on every refresh).
 */
export const DEFAULT_PROGRAMME_IMAGE =
  'https://source.unsplash.com/featured/800x600/?cricket&sig=1'

/**
 * Returns 6 (or user-specified) curated images for a sport. Phase 1 only
 * Cricket has its own pool — other sports fall back to the Cricket pool so
 * the picker is never empty. When seeds are omitted, returns a fixed first
 * 6 (deterministic) — the picker passes a shuffled subset for randomness.
 */
export function getImagesForSport(sportName: string, seeds?: number[]): ProgrammeImage[] {
  const activeSports = ['cricket']
  const effectiveSeeds = seeds ?? [1, 2, 3, 4, 5, 6]
  if (activeSports.includes(sportName.toLowerCase())) {
    return getCricketImages(effectiveSeeds)
  }
  // Fallback: Cricket for any unsupported sport so the picker stays usable.
  return getCricketImages(effectiveSeeds)
}
