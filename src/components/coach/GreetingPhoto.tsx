'use client'

import React, { useRef, useState } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import { fetchCoachProfileCached, clearCoachProfileCache } from '@/lib/onboarding-cache'

// UX-05: coach dashboard greeting photo — shows the exact photo parents see
// on public surfaces (user_profiles.avatar_url; same field the search cards
// and the public profile fallback read). Tapping opens a sheet to upload or
// remove it. Upload reuses the Fix-42 path exactly: coach-photos bucket →
// getPublicUrl → POST /api/coaches/profile { avatar_url } → cache clear +
// crikly:profile-updated event (the AppShell already listens and refreshes
// its own avatar — no shell change needed).
//
// Upload is fire-and-forget: a local object-URL preview shows immediately
// and the Storage round-trip happens in the background; failure reverts to
// the previous photo with inline error text (no dialogs, per UI standards).

const MAX_PHOTO_BYTES = 5 * 1024 * 1024

interface GreetingPhotoProps {
  coachName: string
  photoUrl: string | null
  /** Lifted to CoachHomeClient so the desktop and mobile mounts stay in sync. */
  onPhotoChange: (url: string | null) => void
  /** Avatar diameter in px — 72 desktop, 64 mobile (both ≥ 48px tap target). */
  size: number
}

export function GreetingPhoto({ coachName, photoUrl, onPhotoChange, size }: GreetingPhotoProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persistAvatarUrl = async (url: string | null): Promise<void> => {
    const res = await fetch('/api/coaches/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_url: url }),
    })
    if (!res.ok) throw new Error('Failed to update profile')
    clearCoachProfileCache()
    window.dispatchEvent(new CustomEvent('crikly:profile-updated'))
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || uploading) return

    if (file.size > MAX_PHOTO_BYTES) {
      setError('Photo must be under 5MB.')
      return
    }

    const previousUrl = photoUrl
    const previewUrl = URL.createObjectURL(file)
    onPhotoChange(previewUrl)
    setSheetOpen(false)
    setError(null)
    setUploading(true)

    try {
      // Storage path convention matches ProfileEdit (Fix-42):
      // profile/{coach_profile_id}/{timestamp}.{ext} in coach-photos.
      const profile = (await fetchCoachProfileCached()) as { id: string }
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `profile/${profile.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('coach-photos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('coach-photos')
        .getPublicUrl(path)

      await persistAvatarUrl(urlData.publicUrl)
      onPhotoChange(urlData.publicUrl)
    } catch (err) {
      console.error('[UX-05] Greeting photo upload failed:', err)
      onPhotoChange(previousUrl)
      setError('Upload failed. Please try again.')
    } finally {
      URL.revokeObjectURL(previewUrl)
      setUploading(false)
    }
  }

  const handleRemove = async (): Promise<void> => {
    if (uploading) return
    const previousUrl = photoUrl
    onPhotoChange(null)
    setSheetOpen(false)
    setError(null)
    try {
      await persistAvatarUrl(null)
    } catch (err) {
      console.error('[UX-05] Greeting photo removal failed:', err)
      onPhotoChange(previousUrl)
      setError('Could not remove photo. Please try again.')
    }
  }

  return (
    <div className="flex flex-col items-center shrink-0">
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        disabled={uploading}
        aria-label="Change your public photo"
        className="cursor-pointer rounded-full shadow-md focus:outline-none"
        data-testid="greeting-photo-button"
      >
        <CriklyAvatar
          seed={coachName || 'Coach'}
          style="personas"
          size={size}
          photoUrl={photoUrl}
          alt={`${coachName || 'Coach'} — your public photo`}
        />
      </button>
      <span className="mt-1.5 text-xs font-medium text-gray-400 whitespace-nowrap">
        {uploading ? 'Uploading…' : 'Your public photo'}
      </span>
      {error && (
        <span role="alert" className="mt-0.5 text-xs text-danger whitespace-nowrap">
          {error}
        </span>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="greeting-photo-input"
      />

      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Your public photo">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-3.5 text-left transition-colors hover:bg-neutral-50"
          >
            <Upload size={18} strokeWidth={1.8} className="shrink-0 text-brand-600" />
            <span className="text-base font-medium text-gray-900">Upload a photo</span>
          </button>
          {photoUrl && (
            <button
              type="button"
              onClick={handleRemove}
              className="flex w-full items-center gap-3 rounded-[10px] px-3 py-3.5 text-left transition-colors hover:bg-red-50"
            >
              <Trash2 size={18} strokeWidth={1.8} className="shrink-0 text-danger" />
              <span className="text-base font-medium text-danger">Remove photo</span>
            </button>
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
