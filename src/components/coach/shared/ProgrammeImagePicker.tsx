'use client'

// CF-PROGRAMMES-IMAGE-PICKER: image picker for group programmes.
//
// Two tabs:
//   1. "Choose a photo" — grid of 6 curated Unsplash images filtered by
//      sport. Selecting one calls onChange with its URL. Always available.
//   2. "Upload your own" — drag/drop or file-input upload to Supabase
//      Storage bucket `programme-images`. Path is
//      `{coach_profile_id}/{uuid}.{ext}`. Public URL is written back via
//      onChange. Validates type + 5MB size client-side. Degrades
//      gracefully if the bucket doesn't exist or RLS denies the write —
//      shows "Upload unavailable" rather than throwing.
//
// Phase 1 bucket creation is out of scope here. Filed as
// INFRA-PROGRAMME-IMAGES-BUCKET in BUILD_PLAN.

import { useEffect, useMemo, useState } from 'react'
import { Upload, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getImagesForSport } from '@/lib/programme-images'
import { fetchCoachProfileCached } from '@/lib/onboarding-cache'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// Derive storage extension from validated MIME type rather than from the
// user-supplied filename — a renamed `.webp` that's really PNG would land at
// a misleading path otherwise. MIME is already gated by ACCEPTED_TYPES above.
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

type Tab = 'curated' | 'upload'

export function ProgrammeImagePicker({
  value,
  sportName,
  onChange,
}: {
  value: string | null
  sportName: string
  onChange: (url: string) => void
}) {
  const [tab, setTab] = useState<Tab>('curated')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [coachProfileId, setCoachProfileId] = useState<string | null>(null)

  const curatedImages = useMemo(() => getImagesForSport(sportName), [sportName])

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
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {curatedImages.map((img) => {
              const isSelected = value === img.url
              return (
                <button
                  key={img.url}
                  type="button"
                  onClick={() => onChange(img.url)}
                  className={
                    isSelected
                      ? 'relative aspect-video rounded-xl overflow-hidden ring-2 ring-[#0077CC] cursor-pointer'
                      : 'relative aspect-video rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#CBD5E1] transition-all'
                  }
                  aria-label={`Select photo: ${img.alt}`}
                  aria-pressed={isSelected}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt} className="absolute inset-0 w-full h-full object-cover" />
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-[#94A3B8] mt-3 text-center">Photos from Unsplash</p>
        </>
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
          {value && !curatedImages.some((c) => c.url === value) && !uploadError && (
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
