'use client'

// CF-PROGRAMMES-IMAGE-PICKER: image picker for group programmes.
//
// Two tabs:
//   1. "Choose a photo" — grid of 6 cricket images pulled from the Unsplash
//      search API. The picker fetches 18 photos on mount (cached 24h in
//      sessionStorage to stay under rate limits), then displays a random 6.
//      "Refresh photos" re-slices to a different random 6 from the same
//      cached 18 — no extra API call. Sport_name is Phase-1 unused (only
//      Cricket today); the query string is hardcoded so future sports will
//      need a switch on sportName.
//   2. "Upload your own" — drag/drop or file-input upload to Supabase
//      Storage bucket `programme-images`. Path is
//      `{coach_profile_id}/{uuid}.{ext}`. Public URL is written back via
//      onChange. Validates type + 5MB size client-side. Degrades
//      gracefully if the bucket doesn't exist or RLS denies the write.
//
// Phase 1 bucket creation is out of scope here. Filed as
// INFRA-PROGRAMME-IMAGES-BUCKET in BUILD_PLAN.

import { useEffect, useRef, useState } from 'react'
import { Upload, Image as ImageIcon, Loader2, AlertCircle, RotateCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { ProgrammeImage } from '@/lib/programme-images'
import { fetchCoachProfileCached } from '@/lib/onboarding-cache'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const CURATED_GRID_SIZE = 6

/**
 * Fisher-Yates shuffle — picks `n` unique random elements from a pool. Used
 * to seed the curated grid with a fresh random selection on each mount and
 * on each Refresh click.
 */
function pickRandom<T>(pool: readonly T[], n: number): T[] {
  const copy = [...pool]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, Math.min(n, copy.length))
}
// Derive storage extension from validated MIME type rather than from the
// user-supplied filename — a renamed `.webp` that's really PNG would land at
// a misleading path otherwise. MIME is already gated by ACCEPTED_TYPES above.
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// ─── Unsplash search-API integration ─────────────────────────────────────────
// Fix-55: on each fresh fetch we pick a random Unsplash page (1–10) so the
// underlying 18-photo pool varies — previously the URL had no `page` param,
// so every coach saw the same 18 results regardless of refresh. Cache key now
// includes the page so different pages don't collide; TTL shortened to 30 min
// so accidental remounts dedupe but real revisits surface fresh photos.
// "Refresh photos" advances to a new random page (re-fetch), no longer just
// re-slicing the same pool.

const UNSPLASH_CACHE_KEY_PREFIX = 'crikly:unsplash:cricket:p'
const UNSPLASH_TTL_MS = 30 * 60 * 1000
const UNSPLASH_PAGE_RANGE = 10 // pages 1..10 — Unsplash search supports far more

function unsplashCacheKey(page: number): string {
  return `${UNSPLASH_CACHE_KEY_PREFIX}${page}`
}

function pickRandomUnsplashPage(): number {
  return Math.floor(Math.random() * UNSPLASH_PAGE_RANGE) + 1
}

interface UnsplashPhoto {
  urls: { regular: string }
  alt_description: string | null
  user: { name: string }
}

interface UnsplashSearchResponse {
  results: UnsplashPhoto[]
}

interface UnsplashCacheEntry {
  value: ProgrammeImage[]
  storedAt: number
}

function readUnsplashCache(page: number): ProgrammeImage[] | null {
  try {
    const raw = sessionStorage.getItem(unsplashCacheKey(page))
    if (!raw) return null
    const parsed = JSON.parse(raw) as UnsplashCacheEntry
    if (!Number.isFinite(parsed.storedAt)) return null
    if (Date.now() - parsed.storedAt > UNSPLASH_TTL_MS) return null
    if (!Array.isArray(parsed.value)) return null
    return parsed.value
  } catch {
    return null
  }
}

function writeUnsplashCache(page: number, value: ProgrammeImage[]): void {
  try {
    const entry: UnsplashCacheEntry = { value, storedAt: Date.now() }
    sessionStorage.setItem(unsplashCacheKey(page), JSON.stringify(entry))
  } catch {
    // non-critical — cache write failure just means we'll refetch next mount
  }
}

function clearUnsplashCache(page?: number): void {
  try {
    if (typeof page === 'number') {
      sessionStorage.removeItem(unsplashCacheKey(page))
      return
    }
    // Wipe every per-page entry (used by the retry path).
    const toRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(UNSPLASH_CACHE_KEY_PREFIX)) toRemove.push(k)
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    // non-critical
  }
}

type Tab = 'curated' | 'upload'

export function ProgrammeImagePicker({
  value,
  sportName,
  onChange,
}: {
  value: string | null
  /** Phase 1 unused (Cricket-only API query). Kept for forward compatibility
   *  — when Tennis/Football launch, switch on this to vary the search term. */
  sportName: string
  onChange: (url: string) => void
}) {
  // Acknowledge intentional Phase-1 non-use of sportName so lint stays quiet.
  void sportName

  const [tab, setTab] = useState<Tab>('curated')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [coachProfileId, setCoachProfileId] = useState<string | null>(null)

  // Unsplash pool (18 photos for the current random page) + displayed slice
  // (random 6 of 18). Fix-55: the page itself is now randomised on every fresh
  // fetch; Refresh advances to a different page rather than re-slicing.
  const [photoPool, setPhotoPool] = useState<ProgrammeImage[] | null>(null)
  const [displayedImages, setDisplayedImages] = useState<ProgrammeImage[]>([])
  const [photoLoading, setPhotoLoading] = useState(true)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  // Fix-55: random Unsplash page held in a ref so the effect's cache read/write
  // both target the same key. First mount seeds a random page; Refresh + Retry
  // overwrite this before bumping retryToken.
  const pageRef = useRef<number>(pickRandomUnsplashPage())

  // Per-image load state — even with a CDN URL the network has a brief
  // window where the cell is blank. We track loaded URLs and fade the
  // <img> in once it paints; the parent button keeps bg-gray-100 underneath
  // as a placeholder.
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set())

  // Mount + retry — fetch 18 cricket photos from a random Unsplash page (cache-first).
  useEffect(() => {
    let cancelled = false
    const page = pageRef.current

    async function loadPhotos() {
      // Cache hit for this specific page (skipped on retry — retry path clears).
      const cached = readUnsplashCache(page)
      if (cached && cached.length > 0) {
        setPhotoPool(cached)
        setDisplayedImages(pickRandom(cached, CURATED_GRID_SIZE))
        setPhotoLoading(false)
        setPhotoError(null)
        return
      }

      setPhotoLoading(true)
      setPhotoError(null)

      const key = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY
      if (!key) {
        // Missing env var — surface a friendly error rather than crashing.
        console.error('[ProgrammeImagePicker] NEXT_PUBLIC_UNSPLASH_ACCESS_KEY is not set')
        if (!cancelled) {
          setPhotoError("Couldn't load photos. Check your connection.")
          setPhotoLoading(false)
        }
        return
      }

      try {
        const url = `https://api.unsplash.com/search/photos?query=cricket+coaching&page=${page}&per_page=18&orientation=landscape&client_id=${encodeURIComponent(key)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Unsplash search failed (${res.status})`)
        const data = (await res.json()) as UnsplashSearchResponse
        if (cancelled) return

        const mapped: ProgrammeImage[] = (data.results ?? []).map((p) => ({
          url: p.urls.regular,
          alt: p.alt_description ?? 'Cricket coaching session',
          credit: p.user.name,
        }))

        if (mapped.length === 0) {
          setPhotoError("Couldn't load photos. Check your connection.")
        } else {
          setPhotoPool(mapped)
          setDisplayedImages(pickRandom(mapped, CURATED_GRID_SIZE))
          writeUnsplashCache(page, mapped)
        }
      } catch (err) {
        if (cancelled) return
        console.error('[ProgrammeImagePicker] unsplash fetch failed:', err)
        setPhotoError("Couldn't load photos. Check your connection.")
      } finally {
        if (!cancelled) setPhotoLoading(false)
      }
    }

    loadPhotos()
    return () => { cancelled = true }
  }, [retryToken])

  function handleRefreshPhotos() {
    // Fix-55: Refresh now advances to a NEW random Unsplash page (re-fetch).
    // Previously it re-sliced the same 18-photo pool. Avoid landing on the
    // same page back-to-back when possible.
    const currentPage = pageRef.current
    let nextPage = pickRandomUnsplashPage()
    if (UNSPLASH_PAGE_RANGE > 1) {
      // One re-roll guard — at p=10 collision risk is 10%, this drops it to 1%.
      if (nextPage === currentPage) nextPage = pickRandomUnsplashPage()
    }
    pageRef.current = nextPage
    setPhotoPool(null)
    setDisplayedImages([])
    setLoadedUrls(new Set())
    setRetryToken((t) => t + 1)
  }

  function handleRetryFetch() {
    // Wipe every per-page cache entry and pick a fresh random page.
    clearUnsplashCache()
    pageRef.current = pickRandomUnsplashPage()
    setPhotoPool(null)
    setDisplayedImages([])
    setRetryToken((t) => t + 1)
  }

  function handleImageLoaded(url: string) {
    setLoadedUrls((prev) => {
      if (prev.has(url)) return prev
      const next = new Set(prev)
      next.add(url)
      return next
    })
  }

  // Coach profile ID needed for the storage path. Fetched via the cached
  // helper so we dedupe with the sidebar + other consumers.
  useEffect(() => {
    let cancelled = false
    fetchCoachProfileCached()
      .then((p: { id?: string } | null) => {
        if (cancelled || !p?.id) return
        setCoachProfileId(p.id)
      })
      .catch((err) => console.error('[ProgrammeImagePicker] profile fetch failed:', err))
    return () => { cancelled = true }
  }, [])

  async function handleFileSelected(file: File) {
    setUploadError(null)

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Please choose a JPG, PNG or WEBP image.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Image must be 5MB or smaller.')
      return
    }
    if (!coachProfileId) {
      setUploadError('Could not identify your account — please refresh.')
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()
      const ext = MIME_TO_EXT[file.type] ?? 'jpg'
      const path = `${coachProfileId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('programme-images')
        .upload(path, file, { contentType: file.type, upsert: false })

      if (uploadErr) {
        // INFRA-PROGRAMME-IMAGES-BUCKET (follow-up): bucket may not exist
        // yet on hosted dev. Treat any upload failure (missing bucket, RLS
        // denial, network) as "upload unavailable" rather than surfacing
        // raw Supabase error codes to the coach. Console.error keeps the
        // real reason visible for ops debugging.
        console.error('[ProgrammeImagePicker] upload error:', uploadErr)
        setUploadError('Upload unavailable right now. Try a curated photo, or try again later.')
        return
      }

      const { data } = supabase.storage.from('programme-images').getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (err) {
      console.error('[ProgrammeImagePicker] unexpected upload error:', err)
      setUploadError('Upload unavailable right now. Try a curated photo, or try again later.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border border-[#E2E8F0] rounded-[14px] p-4 bg-white">
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-[#F1F5F9] p-1 rounded-[10px]">
        <button
          type="button"
          onClick={() => setTab('curated')}
          className={
            tab === 'curated'
              ? 'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-semibold bg-white text-[#0F172A] shadow-sm cursor-pointer transition-colors'
              : 'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-semibold text-[#64748B] cursor-pointer hover:text-[#0F172A] transition-colors'
          }
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Choose a photo
        </button>
        <button
          type="button"
          onClick={() => setTab('upload')}
          className={
            tab === 'upload'
              ? 'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-semibold bg-white text-[#0F172A] shadow-sm cursor-pointer transition-colors'
              : 'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-semibold text-[#64748B] cursor-pointer hover:text-[#0F172A] transition-colors'
          }
        >
          <Upload className="w-3.5 h-3.5" />
          Upload your own
        </button>
      </div>

      {tab === 'curated' ? (
        photoError ? (
          <div className="text-center py-8">
            <p className="text-[13px] text-gray-700 mb-3">{photoError}</p>
            <button
              type="button"
              onClick={handleRetryFetch}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0077CC] hover:text-[#0066AA] cursor-pointer transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* Header row: Refresh button on the right re-rolls the 6-image set */}
            <div className="flex items-center justify-end mb-2">
              <button
                type="button"
                onClick={handleRefreshPhotos}
                disabled={photoLoading || !photoPool || photoPool.length === 0}
                className="inline-flex items-center gap-1 text-[11px] text-[#0077CC] hover:text-[#0066AA] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCw className="w-3 h-3" />
                Refresh photos
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {photoLoading || displayedImages.length === 0
                ? Array.from({ length: CURATED_GRID_SIZE }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-video rounded-xl bg-gray-100 animate-pulse"
                    />
                  ))
                : displayedImages.map((img) => {
                    const isSelected = value === img.url
                    const isLoaded = loadedUrls.has(img.url)
                    return (
                      <button
                        key={img.url}
                        type="button"
                        onClick={() => onChange(img.url)}
                        className={
                          isSelected
                            ? 'relative aspect-video rounded-xl overflow-hidden ring-2 ring-[#0077CC] cursor-pointer bg-gray-100'
                            : 'relative aspect-video rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#CBD5E1] transition-all bg-gray-100'
                        }
                        aria-label={`Select photo: ${img.alt}`}
                        aria-pressed={isSelected}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.alt}
                          onLoad={() => handleImageLoaded(img.url)}
                          className={
                            isLoaded
                              ? 'absolute inset-0 w-full h-full object-cover opacity-100 transition-opacity duration-200'
                              : 'absolute inset-0 w-full h-full object-cover opacity-0'
                          }
                        />
                      </button>
                    )
                  })}
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-3 text-center">Photos from Unsplash</p>
          </>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <label
            className={
              uploading
                ? 'flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-[#CBD5E1] rounded-xl bg-[#F8FAFC] cursor-wait'
                : 'flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-[#CBD5E1] rounded-xl bg-[#F8FAFC] cursor-pointer hover:border-[#0077CC] hover:bg-[#F0F7FF] transition-colors'
            }
          >
            <input
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileSelected(file)
                // Reset the input so selecting the same file twice re-fires the change.
                e.target.value = ''
              }}
              disabled={uploading}
              className="hidden"
            />
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 text-[#0077CC] animate-spin" />
                <p className="text-[13px] font-medium text-[#475569]">Uploading…</p>
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 text-[#94A3B8]" />
                <p className="text-[13px] font-medium text-[#475569]">Click to choose a photo</p>
                <p className="text-[11px] text-[#94A3B8]">JPG, PNG or WEBP — max 5MB</p>
              </>
            )}
          </label>

          {/* Preview of currently-uploaded image, if any */}
          {value && !displayedImages.some((c) => c.url === value) && !uploadError && (
            <div className="relative aspect-video rounded-xl overflow-hidden border border-[#E2E8F0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="Uploaded cover" className="absolute inset-0 w-full h-full object-cover" />
            </div>
          )}

          {uploadError && (
            <div className="flex items-start gap-2 p-3 rounded-[10px] bg-amber-50 border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-800 leading-snug">{uploadError}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
