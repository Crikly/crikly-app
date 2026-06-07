// CF-PROGRAMMES-IMAGE-PICKER: shared type + default cover image.
//
// History:
//   - Initial cut shipped a hardcoded 6-URL array.
//   - Mid-revision moved to seed-based source.unsplash.com URLs — those
//     have been deprecated upstream and now redirect to a blank/fallback
//     image, so the picker switched to calling the live Unsplash search API
//     directly (see ProgrammeImagePicker). The previous CRICKET_SEEDS,
//     getCricketImages, and getImagesForSport helpers were removed —
//     nothing in the app calls them anymore.
//
// This module now exists for two reasons:
//   1. ProgrammeImage type shared across picker + storage helpers.
//   2. DEFAULT_PROGRAMME_IMAGE — a single stable Unsplash CDN URL used by
//      GroupCard (dashboard) and any other surface that needs to render
//      a fallback when a programme has no image_url set. Stable URL
//      (not a search query) so the fallback doesn't shuffle on every render.

export interface ProgrammeImage {
  /** Full image URL — either an Unsplash CDN URL or a Supabase Storage URL. */
  url: string
  /** Alt text for accessibility. */
  alt: string
  /** Photographer / source credit, surfaced at the picker level. */
  credit: string
}

/**
 * Fallback cover image for programmes with no `image_url` set. Stable
 * Unsplash CDN URL — the same image renders every time, so the dashboard
 * GroupCard hero stays consistent across page loads.
 */
export const DEFAULT_PROGRAMME_IMAGE =
  'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80'
