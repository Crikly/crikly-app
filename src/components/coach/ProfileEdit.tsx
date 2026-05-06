'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, User, Tag, Award, Calendar, ShieldCheck, CreditCard, CheckCircle2, Star, Share2, ExternalLink, Circle, Camera, LayoutGrid, X, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// CD-10b: API response type
interface CoachProfileResponse {
  id: string
  user_profile_id: string
  full_name: string
  avatar_url: string | null
  location_city: string | null
  location_postcode: string | null
  bio: string | null
  years_experience: number | null
  dbs_status: 'none' | 'pending' | 'verified' | 'expired'
  is_profile_live: boolean
  stripe_onboarding_complete: boolean
  cancellation_window_hours: number
  min_advance_hours: number
  max_advance_days: number
  rating_avg: number | null
  rating_count: number
  sessions_completed: number
  gender: string | null
  slug: string | null
  created_at: string
  updated_at: string
}

interface ProfileSection { id: string; icon: React.ReactNode; title: string; subtitle: string; isComplete: boolean; isPartial?: boolean }

export function ProfileEdit() {
  const router = useRouter()
  
  // CD-10b: State for profile data
  const [profile, setProfile] = useState<CoachProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasSports, setHasSports] = useState(false)
  const [hasQualifications, setHasQualifications] = useState(false)
  // Fix-45: Real Stripe Connect status from CG-03 endpoint
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState(false)
  const [stripePayoutsEnabled, setStripePayoutsEnabled] = useState(false)
  const [stripeConnected, setStripeConnected] = useState(false)

  // Fix-42: Photo upload state
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fix-42b: Gallery modal state
  const [galleryOpen, setGalleryOpen] = useState(false)

  // CD-10b: Fetch profile data on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/coaches/profile')
        if (!response.ok) {
          throw new Error('Failed to fetch profile')
        }

        const data: CoachProfileResponse = await response.json()
        setProfile(data)

        // Fix-17m: Fetch sports count
        const sportsRes = await fetch('/api/coaches/sports')
        if (sportsRes.ok) {
          const sportsData = await sportsRes.json()
          setHasSports(sportsData.sports && sportsData.sports.length > 0)
        }

        // Fix-17m: Fetch qualifications count
        const qualsRes = await fetch('/api/coaches/qualifications')
        if (qualsRes.ok) {
          const qualsData = await qualsRes.json()
          setHasQualifications(qualsData.qualifications && qualsData.qualifications.length > 0)
        }

        // Fix-45: Fetch real Stripe Connect status
        const stripeRes = await fetch('/api/payments/connect/onboard')
        if (stripeRes.ok) {
          const stripeData = await stripeRes.json() as {
            connected: boolean
            charges_enabled?: boolean
            payouts_enabled?: boolean
          }
          setStripeConnected(stripeData.connected)
          setStripeChargesEnabled(stripeData.charges_enabled ?? false)
          setStripePayoutsEnabled(stripeData.payouts_enabled ?? false)
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err)
        setError('Failed to load profile. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])
  
  // CD-10b: Calculate profile completeness
  const calculateCompleteness = (): number => {
    if (!profile) return 0
    
    let completed = 0
    const total = 6
    
    // Personal Info (full_name, bio, location_city)
    if (profile.full_name && profile.bio && profile.location_city) completed++
    
    // Sports & Pricing (has at least one sport)
    if (hasSports) completed++
    
    // Qualifications (has at least one qualification)
    if (hasQualifications) completed++
    
    // Availability (assume complete - would need availability API check)
    completed++ // TODO: Check actual availability data
    
    // Booking Policy (cancellation_window_hours set)
    if (profile.cancellation_window_hours > 0) completed++

    // Fix-45: Payment Setup — fully live means charges + payouts enabled
    if (stripeChargesEnabled && stripePayoutsEnabled) completed++
    
    return Math.round((completed / total) * 100)
  }
  
  const profileCompleteness = calculateCompleteness()
  
  // CD-10b: Generate section data from profile
  const getSections = (): ProfileSection[] => {
    if (!profile) return []
    
    const personalComplete = !!(profile.full_name && profile.bio && profile.location_city)
    const sportsComplete = hasSports
    const qualificationsComplete = hasQualifications
    const availabilityComplete = true // TODO: Check actual availability
    const policyComplete = profile.cancellation_window_hours > 0
    // Fix-45: fully live = charges + payouts both enabled; partial = connected but not complete
    const paymentFullyComplete = stripeChargesEnabled && stripePayoutsEnabled
    const paymentPartial = stripeConnected && !paymentFullyComplete
    const paymentComplete = paymentFullyComplete
    
    return [
      { 
        id: 'personal', 
        icon: <User size={18} className={personalComplete ? "text-[#0077CC]" : "text-[#F59E0B]"} />, 
        title: 'Personal Info', 
        subtitle: personalComplete 
          ? `${profile.full_name}${profile.location_city ? ' · ' + profile.location_city : ''}` 
          : 'Add your name, bio, and location', 
        isComplete: personalComplete 
      },
      { 
        id: 'sports', 
        icon: <Tag size={18} className={sportsComplete ? "text-[#0077CC]" : "text-[#F59E0B]"} />, 
        title: 'Sports & Pricing', 
        subtitle: sportsComplete 
          ? `${profile.years_experience} years experience` 
          : 'Add your sports and pricing', 
        isComplete: sportsComplete 
      },
      { 
        id: 'qualifications', 
        icon: <Award size={18} className={qualificationsComplete ? "text-[#0077CC]" : "text-[#F59E0B]"} />, 
        title: 'Qualifications', 
        subtitle: qualificationsComplete 
          ? 'DBS verified' 
          : 'Add your coaching badge and DBS certificate', 
        isComplete: qualificationsComplete 
      },
      { 
        id: 'availability', 
        icon: <Calendar size={18} className={availabilityComplete ? "text-[#0077CC]" : "text-[#F59E0B]"} />, 
        title: 'Availability', 
        subtitle: availabilityComplete 
          ? 'Weekly schedule set' 
          : 'Set your weekly availability', 
        isComplete: availabilityComplete 
      },
      { 
        id: 'policy', 
        icon: <ShieldCheck size={18} className={policyComplete ? "text-[#0077CC]" : "text-[#F59E0B]"} />, 
        title: 'Booking Policy', 
        subtitle: policyComplete 
          ? `${profile.cancellation_window_hours}hr cancellation window` 
          : 'Set your booking policy', 
        isComplete: policyComplete 
      },
      {
        id: 'payment',
        icon: <CreditCard size={18} className={paymentFullyComplete ? "text-[#0077CC]" : paymentPartial ? "text-[#F59E0B]" : "text-gray-400"} />,
        title: 'Payment Setup',
        subtitle: paymentFullyComplete
          ? 'Stripe connected — ready to receive payouts'
          : paymentPartial
            ? 'Stripe connected — finish setup to receive payouts'
            : 'Connect your bank account',
        isComplete: paymentComplete,
        isPartial: paymentPartial,
      }
    ]
  }
  
  const sections = getSections()
  const sectionRoutes: Record<string, string> = {
    personal: '/coach/onboarding/profile',
    sports: '/coach/onboarding/sport',
    qualifications: '/coach/onboarding/qualifications',
    availability: '/coach/availability',
    policy: '/coach/onboarding/policy',
    payment: '/coach/get-paid'
  }

  // CD-10b: Get initials from full name
  const getInitials = (name: string): string => {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  
  // Fix-42: Profile photo upload handler
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    e.target.value = ''

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Photo must be under 5MB.')
      return
    }

    setPhotoError(null)
    setPhotoUploading(true)

    try {
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

      const publicUrl = urlData.publicUrl

      const res = await fetch('/api/coaches/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: publicUrl }),
      })

      if (!res.ok) throw new Error('Failed to update profile')

      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : prev)
    } catch (err) {
      console.error('[Fix-42] Photo upload error:', err)
      setPhotoError('Upload failed. Please try again.')
    } finally {
      setPhotoUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="w-full max-w-2xl mx-auto bg-white min-h-screen relative flex flex-col pb-12">
        <div className="px-5 pt-8 pb-4 bg-white sticky top-0 z-10">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Profile</h1>
        </div>
        <div className="px-5 space-y-4">
          {/* CD-10b: Loading state */}
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-gray-200 border-t-[#0077CC] rounded-full animate-spin mb-3" />
              <p className="text-[14px] text-gray-500">Loading profile...</p>
            </div>
          )}
          
          {/* CD-10b: Error state */}
          {error && !loading && (
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">⚠</span>
              </div>
              <h3 className="text-[18px] font-bold text-gray-900 mb-2">Failed to load profile</h3>
              <p className="text-[14px] text-gray-500 mb-6">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-6 py-3 rounded-xl text-[15px] font-bold transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
          
          {/* CD-10b: Profile content */}
          {!loading && !error && profile && (
          <>
          {/* CF-D07 CHANGE 1: Identity hero with stronger presence */}
          {/* CF-D07b POLISH 1: Increased padding to 24px */}
          <div className="bg-white rounded-[14px] p-6 shadow-sm">
            {/* Top row */}
            {/* CF-D07b POLISH 1: Increased gap to 16px */}
            <div className="flex gap-4 items-start mb-3.5">
              {/* Avatar with upload — Fix-42 */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`relative w-16 h-16 rounded-full overflow-hidden group ${photoUploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  onClick={() => !photoUploading && fileInputRef.current?.click()}
                >
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#E6F1FB] flex items-center justify-center text-[20px] font-medium text-[#0C447C]">
                      {getInitials(profile.full_name)}
                    </div>
                  )}

                  {/* Hover overlay */}
                  {!photoUploading && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex flex-col items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <Camera size={14} className="text-white" />
                      <span className="text-[9px] font-medium text-white leading-none">Change</span>
                    </div>
                  )}

                  {/* Upload spinner overlay */}
                  {photoUploading && (
                    <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <p className="text-[9px] text-gray-400 text-center mt-1 leading-snug w-[68px]">
                  JPG, PNG or WebP · Max 5MB
                </p>
                {photoError && (
                  <p className="text-[9px] text-red-500 text-center mt-0.5 w-[72px] leading-snug">{photoError}</p>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </div>
              
              {/* Coach info */}
              <div className="flex-1 min-w-0">
                {/* CD-10b: Real coach name */}
                <h2 className="text-[20px] font-medium text-gray-900 truncate">{profile.full_name}</h2>
                <div className="text-[13px] text-gray-500 mt-0.5 truncate">
                  {profile.years_experience ? `${profile.years_experience} years experience` : 'Coach'}
                  {profile.location_city && ` · ${profile.location_city}`}
                </div>
                
                {/* Trust row */}
                <div className="flex items-center gap-3 mt-1.5">
                  {/* CD-10b: Real rating data */}
                  {profile.rating_avg !== null && profile.rating_count > 0 && (
                    <div className="flex items-center gap-1">
                      <Star size={13} className="text-amber-500 fill-amber-500" />
                      <span className="text-[13px] font-medium text-gray-900">{profile.rating_avg.toFixed(1)}</span>
                      <span className="text-[11px] text-gray-400">({profile.rating_count} {profile.rating_count === 1 ? 'review' : 'reviews'})</span>
                    </div>
                  )}
                  {/* CD-10b: Real DBS status */}
                  {profile.dbs_status === 'verified' && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#E0F6F8] text-[#006677] text-[10px] font-medium rounded-full">
                      <ShieldCheck size={11} /> DBS checked
                    </div>
                  )}
                </div>
              </div>
              
              {/* Action buttons */}
              {/* CF-D07b POLISH 1: Added margin-left auto to push buttons to far right */}
              <div className="flex gap-2 shrink-0 ml-auto">
                <button
                  onClick={() => profile && window.open(`/coaches/${profile.slug || profile.id}`, '_blank')}
                  disabled={!profile}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-medium rounded-full hover:bg-gray-50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="preview-profile-btn"
                >
                  Preview <ExternalLink size={10} />
                </button>
                <button
                  // AF-H-43: dispatch the global share-modal event (listener in CoachLayoutClient.tsx:84)
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('crikly:open-share-modal'))
                  }}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-medium rounded-full hover:bg-gray-50 transition-colors flex items-center gap-1"
                >
                  <Share2 size={10} /> Share
                </button>
                <button
                  onClick={() => setGalleryOpen(true)}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-medium rounded-full hover:bg-gray-50 transition-colors flex items-center gap-1"
                >
                  <LayoutGrid size={10} /> Gallery
                </button>
              </div>
            </div>
            
            {/* Progress section */}
            {/* CF-D07b POLISH 1: Increased padding-top to 16px */}
            <div className="pt-4 border-t-[0.5px] border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-gray-900">Profile completeness</span>
                <span className="text-[12px] font-medium text-[#0077CC]">{profileCompleteness}%</span>
              </div>
              <div className="h-1.5 bg-[#E6F1FB] rounded-full overflow-hidden">
                <div className="h-full bg-[#0077CC] rounded-full transition-all" style={{ width: `${profileCompleteness}%` }} />
              </div>
              {/* CF-D07b POLISH 2: More outcome-oriented motivational copy */}
              <p className="text-[11px] font-medium text-[#0077CC] mt-1">
                {profileCompleteness < 100 
                  ? 'Almost there — add your qualifications to build trust with parents'
                  : 'Your profile is live — parents can find and book you'
                }
              </p>
            </div>
          </div>
          {/* CF-D07 CHANGE 2: Section rows with complete/incomplete hierarchy */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {sections.map((section, index) => {
              const isLast = index === sections.length - 1
              return (
                <button 
                  key={section.id} 
                  onClick={() => router.push(sectionRoutes[section.id])} 
                  className={`w-full flex items-center gap-3 text-left transition-colors group ${
                    !section.isComplete 
                      ? 'bg-[#FFFBEB] hover:bg-[#FEF9EE] px-4 py-[15px]' 
                      : 'bg-white hover:bg-gray-50/50 px-4 py-3.5'
                  } ${!isLast ? 'border-b-[0.5px] border-gray-100' : ''}`}
                >
                  {/* Icon container */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    !section.isComplete ? 'bg-[#FEF3C7]' : 'bg-[#F0FDF4]'
                  }`}>
                    {section.icon}
                  </div>
                  
                  {/* Section content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {/* CF-D07b POLISH 3: Complete rows more muted (gray-500 weight 400), incomplete sharper (gray-900 weight 500) */}
                      <span className={`text-[13px] truncate ${
                        !section.isComplete 
                          ? 'font-medium text-gray-900' 
                          : 'font-normal text-gray-500'
                      }`}>
                        {section.title}
                      </span>
                      {/* CF-D07b POLISH 3: Refined "Do next" badge */}
                      {!section.isComplete && (
                        <span className="px-1.5 py-0.5 bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium rounded shrink-0 ml-2">
                          Do next
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] mt-0.5 truncate ${
                      !section.isComplete ? 'text-[#92400E]' : 'text-gray-400'
                    }`}>
                      {section.subtitle}
                    </div>
                  </div>
                  
                  {/* Right indicators */}
                  {/* CF-D07b POLISH 3: Reduced tick to 16px circle, empty circle to 16px */}
                  <div className="flex items-center gap-2 shrink-0">
                    {section.isComplete ? (
                      <div className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 size={11} className="text-green-700" strokeWidth={2.5} />
                      </div>
                    ) : section.isPartial ? (
                      <Circle size={16} className="text-[#FCD34D]" strokeWidth={1.5} />
                    ) : (
                      <Circle size={16} className="text-gray-300" strokeWidth={1.5} />
                    )}
                    <ChevronRight size={18} className={!section.isComplete ? 'text-gray-400' : 'text-gray-300'} />
                  </div>
                </button>
              )
            })}
          </div>
          {/* Fix-42b: Gallery modal */}
          {galleryOpen && (
            <GalleryModal
              coachProfileId={profile.id}
              onClose={() => setGalleryOpen(false)}
            />
          )}

          {/* CF-D07 CHANGE 3: Account section with calmer tone */}
          {/* CF-D07b POLISH 5: Increased margin-top to 24px for more separation */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-6">
            <div className="px-4 pt-3 pb-1.5">
              <h3 className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">ACCOUNT</h3>
            </div>
            
            {/* Pause profile row — AF-M-BATCH-01: disabled until persistence wired */}
            <div className="px-4 py-3.5 flex items-center justify-between border-t-[0.5px] border-gray-100">
              <div className="flex-1">
                <div className="text-[13px] font-medium text-gray-900">Pause profile</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Temporarily hide from search · Coming soon</div>
              </div>
              <button
                disabled
                aria-disabled="true"
                className="w-11 h-6 rounded-full relative bg-gray-200 opacity-40 cursor-not-allowed"
              >
                <div className="absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-sm translate-x-0" />
              </button>
            </div>

            {/* Delete account row — AF-M-BATCH-01: disabled until endpoint exists */}
            <button
              disabled
              aria-disabled="true"
              className="w-full px-4 py-3.5 flex items-center justify-between text-left border-t-[0.5px] border-gray-100 opacity-50 cursor-not-allowed"
            >
              <div>
                <span className="text-[13px] font-medium text-[#B91C1C]">Delete account</span>
                <div className="text-[11px] text-gray-400 mt-0.5">Coming soon</div>
              </div>
              <ChevronRight size={18} className="text-red-300" />
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Gallery Modal (Fix-42b) ──────────────────────────────────────────────────

interface GalleryPhoto {
  id: string
  photo_url: string
  sort_order: number
  is_primary: boolean
}

const MAX_GALLERY_PHOTOS = 10

function GalleryModal({
  coachProfileId,
  onClose,
}: {
  coachProfileId: string
  onClose: () => void
}) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const galleryFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingPhotos(true)
        const res = await fetch('/api/coaches/photos')
        if (!res.ok) throw new Error()
        const data = await res.json()
        setPhotos(data.photos || [])
      } catch {
        setLoadError('Failed to load photos.')
      } finally {
        setLoadingPhotos(false)
      }
    }
    load()
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = ''

    const oversized = files.find(f => f.size > 5 * 1024 * 1024)
    if (oversized) {
      setUploadError(`"${oversized.name}" exceeds 5MB. Please choose smaller files.`)
      return
    }

    setUploadError(null)
    setUploading(true)

    try {
      const supabase = createClient()
      let failed = false

      // Fetch current count once to respect the 10-photo cap
      const countRes = await fetch('/api/coaches/photos')
      let currentCount = photos.length
      if (countRes.ok) {
        const countData = await countRes.json()
        currentCount = (countData.photos || []).length
      }

      // Upload sequentially to avoid sort_order race conditions
      for (const file of files) {
        if (currentCount >= 10) break

        const ext = file.name.split('.').pop() ?? 'jpg'
        // Small delay between timestamps to guarantee unique paths
        const path = `gallery/${coachProfileId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('coach-photos')
          .upload(path, file, { upsert: false, contentType: file.type })

        if (uploadErr) { failed = true; break }

        const { data: urlData } = supabase.storage
          .from('coach-photos')
          .getPublicUrl(path)

        const res = await fetch('/api/coaches/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_url: urlData.publicUrl, is_primary: false }),
        })

        if (!res.ok) { failed = true; break }

        currentCount++
      }

      if (failed) throw new Error('One or more uploads failed')

      const refreshRes = await fetch('/api/coaches/photos')
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        setPhotos(data.photos || [])
      }
    } catch (err) {
      console.error('[GalleryModal] upload error:', err)
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (photoId: string) => {
    setDeleting(photoId)
    try {
      const res = await fetch('/api/coaches/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_id: photoId }),
      })
      if (!res.ok) throw new Error()
      setPhotos(prev => prev.filter(p => p.id !== photoId))
      setDeleteConfirmId(null)
    } catch {
      setUploadError('Failed to delete photo. Please try again.')
      setDeleteConfirmId(null)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-lg max-h-[85vh] bg-white rounded-2xl flex flex-col shadow-2xl mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[18px] font-bold text-gray-900">Gallery</h2>
              <span className="text-[14px] text-gray-400 font-medium">{photos.length} / {MAX_GALLERY_PHOTOS}</span>
            </div>
            <p className="text-[12px] text-gray-400 mt-0.5">These photos appear on your public profile</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadingPhotos ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-7 h-7 border-2 border-gray-200 border-t-[#0077CC] rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <p className="text-[13px] text-red-500 text-center py-8">{loadError}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map(photo => (
                <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                  <img src={photo.photo_url} alt="" className="w-full h-full object-cover" />
                  {deleteConfirmId === photo.id ? (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 p-2">
                      <p className="text-[10px] text-white font-medium text-center">Remove this photo?</p>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-1 text-[10px] font-medium text-white border border-white/50 rounded-md hover:bg-white/20 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(photo.id)}
                          disabled={deleting === photo.id}
                          className="px-2 py-1 text-[10px] font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          {deleting === photo.id ? '…' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(photo.id)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                    >
                      <X size={11} className="text-white" />
                    </button>
                  )}
                </div>
              ))}

              {photos.length < MAX_GALLERY_PHOTOS && (
                <button
                  onClick={() => !uploading && galleryFileRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 hover:border-[#0077CC] hover:bg-blue-50/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-[#0077CC] rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus size={20} className="text-gray-400" />
                      <span className="text-[11px] text-gray-400 font-medium">Add photo</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {uploadError && (
            <p className="text-[12px] text-red-500 mt-3 text-center">{uploadError}</p>
          )}

          <input
            ref={galleryFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </div>

        {/* Sticky footer */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 text-center">Photos appear randomly on your public profile</p>
        </div>
      </div>
    </div>
  )
}
