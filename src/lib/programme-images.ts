// CF-PROGRAMMES-IMAGE-PICKER: curated programme cover photos by sport.
//
// Coaches pick one of these in CreateProgramme / EditProgramme via the
// "Choose a photo" tab of ProgrammeImagePicker. The "Upload your own" tab
// pushes to Supabase Storage instead and writes that URL back. Either way
// the chosen URL lands on group_programmes.image_url (migration 030).
//
// Phase 1 ships Cricket only — when other sports launch, add a new array
// + SPORT_IMAGES entry keyed on the lowercase sport name. The fallback
// keeps the picker functional for any sport not yet curated.

export interface ProgrammeImage {
  /** Full Unsplash photo URL (already includes ?w=800&q=80 sizing). */
  url: string
  /** Descriptive alt text for screen readers. */
  alt: string
  /** Photographer name — surfaced once at the picker level, not per-photo. */
  credit: string
}

const CRICKET_IMAGES: ProgrammeImage[] = [
  {
    url: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80',
    alt: 'Cricket batting practice',
    credit: 'Patrick Case',
  },
  {
    url: 'https://images.unsplash.com/photo-1624280157150-4d1ed8632989?w=800&q=80',
    alt: 'Cricket coaching session',
    credit: 'Abhishek Chandra',
  },
  {
    url: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=800&q=80',
    alt: 'Cricket match in progress',
    credit: 'Stefan Grage',
  },
  {
    url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80',
    alt: 'Cricket training drills',
    credit: 'Baylee Gramling',
  },
  {
    url: 'https://images.unsplash.com/photo-1593766788306-28561086694e?w=800&q=80',
    alt: 'Cricket fielding practice',
    credit: 'Patrick Case',
  },
  {
    url: 'https://images.unsplash.com/photo-1624537996736-a79e84b1c7b3?w=800&q=80',
    alt: 'Young cricketers playing',
    credit: 'Rohit Shrivastava',
  },
]

export const SPORT_IMAGES: Record<string, ProgrammeImage[]> = {
  cricket: CRICKET_IMAGES,
}

/**
 * Returns the curated image set for a given sport name (case-insensitive).
 * Falls back to Cricket images for sports not yet curated, so the picker
 * is always populated and the UX is never empty.
 */
export function getImagesForSport(sportName: string): ProgrammeImage[] {
  return SPORT_IMAGES[sportName.toLowerCase()] ?? CRICKET_IMAGES
}

/**
 * Default cover photo when a programme has no `image_url` set. Used by
 * GroupCard on the dashboard + the programme list cards so existing
 * programmes (created before this feature) have a sensible visual.
 */
export const DEFAULT_PROGRAMME_IMAGE = CRICKET_IMAGES[0].url
