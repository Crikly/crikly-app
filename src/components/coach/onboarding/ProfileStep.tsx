'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, MapPin, Calendar, ChevronDown, Check } from 'lucide-react'
import { OnboardingPreviewPanel } from '../OnboardingPreviewPanel'

// CD-10: API response type
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
  created_at: string
  updated_at: string
}

export function ProfileStep() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [baseLocation, setBaseLocation] = useState('')
  const [travelRadius, setTravelRadius] = useState('No travel (I coach at fixed venues)')
  const [selectedExperience, setSelectedExperience] = useState('3–5 yrs')
  const [gender, setGender] = useState('')
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['English'])
  const [saving, setSaving] = useState(false)
  
  // CD-10: Loading and error states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const languages = [
    'English', 'Sinhala', 'Tamil', 'Urdu', 'Hindi',
    'Punjabi', 'Bengali', 'Arabic', 'French', 'Spanish'
  ]

  // CD-10: Fetch profile data on mount
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
        
        // Populate form fields with real data
        setDisplayName(data.full_name || '')
        setBio(data.bio || '')
        setBaseLocation(data.location_city || '')
        
        // Map years_experience to experience range
        if (data.years_experience !== null) {
          if (data.years_experience <= 2) setSelectedExperience('0–2 yrs')
          else if (data.years_experience <= 5) setSelectedExperience('3–5 yrs')
          else if (data.years_experience <= 10) setSelectedExperience('6–10 yrs')
          else setSelectedExperience('10+ yrs')
        }
        
        // Map gender
        if (data.gender) {
          const genderMap: Record<string, string> = {
            'male': 'Male',
            'female': 'Female',
            'other': 'Other',
            'prefer_not_to_say': 'Prefer not to say'
          }
          setGender(genderMap[data.gender] || '')
        }
        
        // Set avatar preview if exists
        if (data.avatar_url) {
          setPhotoPreview(data.avatar_url)
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

  const toggleLanguage = (lang: string) => {
    if (selectedLanguages.includes(lang)) {
      if (selectedLanguages.length > 1) {
        setSelectedLanguages(selectedLanguages.filter(l => l !== lang))
      }
    } else {
      setSelectedLanguages([...selectedLanguages, lang])
    }
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be under 5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveSuccess(false)
    setError(null)
    
    try {
      // CD-10: Map form values to API format
      const yearsExp = selectedExperience.includes('0–2') ? 1 : 
                       selectedExperience.includes('3–5') ? 4 :
                       selectedExperience.includes('6–10') ? 8 : 10
      
      const response = await fetch('/api/coaches/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: displayName,
          bio,
          location_city: baseLocation,
          years_experience: yearsExp,
          gender: gender.toLowerCase().replace(' ', '_'),
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to save profile')
      }
      
      // CD-10: Show success state
      setSaveSuccess(true)
      
      // Navigate after short delay to show success message
      setTimeout(() => {
        router.push('/coach/onboarding/sport')
      }, 1000)
    } catch (err) {
      console.error('Failed to save profile:', err)
      setError('Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const profileCompleteness = 35 // TODO: Calculate based on filled fields
  
  return (
    <div className="min-h-full bg-transparent font-sans text-gray-900 flex">
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-3xl px-8 pt-10">
        
        {/* CD-10: Loading state */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-[#0077CC] rounded-full animate-spin mb-3" />
            <p className="text-[14px] text-gray-500">Loading profile...</p>
          </div>
        ) : error ? (
          // CD-10: Error state
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
        ) : (
          <>

        {/* TOP */}
        <div className="mb-10">
          {/* CF-D11b CHANGE 1: Step indicator */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-6 h-2 rounded-full bg-[#0077CC]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
            </div>
            <p className="text-[11px] text-gray-400">Step 1 of 5</p>
          </div>
          
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Your profile</h1>
          <p className="text-[16px] text-gray-500 font-medium">This is how parents will see you</p>
        </div>

        {/* CONTENT */}
        <div className="flex flex-col gap-3">

          {/* CF-D11e CHANGE 3: Prominent photo upload */}
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 className="text-[13px] font-medium text-gray-900 mb-3.5">Profile photo</h2>
            <div className="flex items-center gap-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`w-20 h-20 rounded-full flex items-center justify-center shrink-0 overflow-hidden cursor-pointer transition-all ${
                  photoPreview 
                    ? '' 
                    : 'border-2 border-dashed border-[#B5D4F4] bg-[#F0F7FF] hover:bg-[#E6F1FB] hover:border-solid'
                }`}
              >
                {photoPreview
                  ? <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                  : <Camera size={24} className="text-[#378ADD]" />
                }
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-medium text-gray-900 mb-1">Add your profile photo</h3>
                <p className="text-[12px] text-[#0077CC] font-medium mb-2.5">Coaches with a photo get 3× more bookings</p>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" onChange={handlePhotoSelect} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-1.5 rounded-full bg-[#0077CC] hover:bg-[#0066AA] text-white text-[12px] font-medium transition-colors"
                >
                  Upload photo
                </button>
                <p className="text-[10px] text-gray-400 mt-1.5">JPG or PNG · max 5MB</p>
              </div>
            </div>
          </div>

          {/* CF-D11e CHANGE 2: Basic info without section number */}
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 className="text-[13px] font-medium text-gray-900 mb-3.5">Basic info</h2>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-900">Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="How you'll appear to parents"
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-900">Bio</label>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={e => setBio(e.target.value.slice(0, 500))}
                  placeholder="Tell parents about your coaching style and what to expect from a session with you"
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all resize-none"
                />
                <div className="text-right text-[12px] font-bold text-gray-400 mt-1">
                  {bio.length} / 500
                </div>
              </div>
            </div>
          </div>

          {/* CF-D11e CHANGE 2: Location without section number */}
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 className="text-[13px] font-medium text-gray-900 mb-3.5">Location</h2>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-900">Base location</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <MapPin size={18} className="text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={baseLocation}
                    onChange={e => setBaseLocation(e.target.value)}
                    placeholder="Town, city or postcode"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
                  />
                </div>
                <p className="text-[13px] text-gray-500 font-medium mt-0.5">Used so parents nearby can find you</p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-900">Travel radius</label>
                <div className="relative">
                  <select
                    value={travelRadius}
                    onChange={e => setTravelRadius(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white appearance-none focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all cursor-pointer"
                  >
                    <option>No travel (I coach at fixed venues)</option>
                    <option>Up to 5 miles</option>
                    <option>Up to 10 miles</option>
                    <option>Up to 20 miles</option>
                    <option>30 miles+</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <ChevronDown size={18} className="text-gray-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CF-D11e CHANGE 4: About you with subtle tint */}
          <div className="bg-[#FAFAFA] rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 className="text-[13px] font-medium text-gray-900 mb-3.5">About you <span className="text-[11px] text-gray-400 font-normal">(optional)</span></h2>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <label className="text-[14px] font-bold text-gray-900">Years of experience</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs'].map((exp) => (
                    <button
                      key={exp}
                      onClick={() => setSelectedExperience(exp)}
                      className={`py-3 px-2 rounded-xl text-[14px] font-bold transition-all border ${
                        selectedExperience === exp
                          ? 'bg-[#0077CC] border-[#0077CC] text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {exp}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-900">
                  Gender <span className="text-gray-400 font-normal ml-1">(optional)</span>
                </label>
                <div className="relative">
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white appearance-none focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all cursor-pointer"
                  >
                    <option value="" disabled>Select gender</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                    <option>Prefer not to say</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <ChevronDown size={18} className="text-gray-400" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <label className="text-[14px] font-bold text-gray-900">Languages spoken</label>
                <div className="flex flex-wrap gap-2.5">
                  {languages.map((lang) => {
                    const isSelected = selectedLanguages.includes(lang)
                    return (
                      <button
                        key={lang}
                        onClick={() => toggleLanguage(lang)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-bold transition-all border ${
                          isSelected
                            ? 'bg-blue-50 border-blue-200 text-[#0077CC]'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {isSelected && <Check size={14} className="text-[#0077CC]" />}
                        {lang}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

        </div>
        
        {/* CD-10: Save bar with success/error states */}
        <div className="flex justify-end items-center py-3 mt-6">
          {/* CD-10: Success message */}
          {saveSuccess && (
            <div className="flex items-center gap-2 mr-4 text-green-700 text-[13px] font-medium">
              <Check size={16} />
              Profile saved successfully!
            </div>
          )}
          
          {/* CD-10: Error message */}
          {error && !loading && (
            <div className="flex items-center gap-2 mr-4 text-red-600 text-[13px] font-medium">
              ⚠ {error}
            </div>
          )}
          
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-7 py-2.5 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-full text-[13px] font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
        </div>
        </>
        )}
        </div>
      </div>

      {/* Right panel - What parents see */}
      <OnboardingPreviewPanel
        coachName={displayName || 'Your name'}
        sport="Cricket"
        location={baseLocation || undefined}
        availabilityDays={['Mon', 'Wed', 'Fri']}
        priceFromPence={5000}
        isDbs={true}
      />
    </div>
  )
}
