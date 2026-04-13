'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, MapPin, ChevronDown, Check } from 'lucide-react'

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

  const languages = [
    'English', 'Sinhala', 'Tamil', 'Urdu', 'Hindi',
    'Punjabi', 'Bengali', 'Arabic', 'French', 'Spanish'
  ]

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
    try {
      await fetch('/api/coaches/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          bio,
          base_location: baseLocation,
          travel_radius: travelRadius,
          years_experience: selectedExperience,
          gender,
          languages: selectedLanguages,
        })
      })
      router.push('/coach/onboarding/sport')
    } finally {
      setSaving(false)
    }
  }

  const profileCompleteness = 35 // TODO: Calculate based on filled fields
  
  return (
    <div className="min-h-full bg-white font-sans text-gray-900 flex pb-32">
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-[640px] px-6 pt-10">

        {/* TOP */}
        <div className="mb-10">
          <button
            onClick={() => router.push('/coach/dashboard')}
            className="flex items-center gap-2 text-[#0077CC] hover:text-blue-800 font-bold text-[15px] mb-6 transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Dashboard</span>
          </button>
          
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
        <div className="flex flex-col gap-3.5">

          {/* CF-D11b CHANGE 2: Prominent photo upload */}
          <div className="bg-white shadow-sm rounded-xl p-5">
            <h2 className="text-[13px] font-medium text-gray-900 mb-4">
              <span className="text-[11px] text-gray-400 mr-1.5">1 ·</span>
              Profile photo
            </h2>
            <div className="flex items-center gap-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`w-20 h-20 rounded-full flex items-center justify-center shrink-0 overflow-hidden cursor-pointer transition-colors ${
                  photoPreview 
                    ? '' 
                    : 'border-2 border-dashed border-[#B5D4F4] bg-[#F0F7FF] hover:bg-[#E6F1FB]'
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

          {/* CF-D11b CHANGE 3: Basic info with section number */}
          <div className="bg-white shadow-sm rounded-xl p-5">
            <h2 className="text-[13px] font-medium text-gray-900 mb-4">
              <span className="text-[11px] text-gray-400 mr-1.5">2 ·</span>
              Basic info
            </h2>
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

          {/* CF-D11b CHANGE 3: Location with section number */}
          <div className="bg-white shadow-sm rounded-xl p-5">
            <h2 className="text-[13px] font-medium text-gray-900 mb-4">
              <span className="text-[11px] text-gray-400 mr-1.5">3 ·</span>
              Location
            </h2>
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

          {/* CF-D11b CHANGE 4: About you with lighter treatment */}
          <div className="bg-[#FAFAFA] shadow-sm rounded-xl p-5">
            <h2 className="text-[13px] font-medium text-gray-900 mb-4">
              <span className="text-[11px] text-gray-400 mr-1.5">4 ·</span>
              About you <span className="text-[11px] text-gray-400 font-normal">(optional)</span>
            </h2>
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
        
        {/* CF-D11b CHANGE 6: Right-aligned save bar - scoped to content column */}
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t-[0.5px] border-gray-100 px-6 py-3 flex justify-center z-10 mt-8" style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.04)' }}>
          <div className="w-full max-w-[640px] flex items-center justify-end gap-4">
            <button
              onClick={() => router.push('/coach/dashboard')}
              className="text-gray-500 hover:text-gray-900 text-[12px] font-medium transition-colors"
            >
              Save & go back to dashboard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-7 py-2.5 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-full text-[13px] font-medium transition-colors"
            >
              {saving ? 'Saving...' : 'Save & continue →'}
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* CF-D11b CHANGE 5: Right panel with parent preview */}
      <aside className="hidden xl:flex w-96 shrink-0 flex-col gap-6 bg-white p-8 sticky top-0 h-screen overflow-y-auto border-l border-gray-100">
        <div>
          <p className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-2">WHAT PARENTS SEE</p>
          
          {/* Preview card */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            {/* Avatar with ring */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-[#E6F1FB] flex items-center justify-center text-[#0077CC] font-bold text-[18px]" style={{ boxShadow: '0 0 0 2px #E6F1FB' }}>
                {displayName ? displayName.charAt(0).toUpperCase() : 'R'}
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-medium text-gray-900">
                  {displayName || 'Your name'}
                </h3>
                <p className="text-[12px] text-gray-400">Cricket Coach</p>
              </div>
            </div>
            
            {/* Rating */}
            <div className="flex items-center gap-1 mb-3">
              {[1,2,3,4,5].map(i => (
                <span key={i} className="text-amber-400 text-[11px]">★</span>
              ))}
            </div>
            
            {/* Price */}
            <p className="text-[15px] font-medium text-gray-900 mb-3">from £50 / session</p>
            
            {/* DBS badge */}
            <div className="inline-flex items-center gap-1 px-2 py-1 bg-[#E0F6F8] text-[#006677] text-[11px] font-medium rounded mb-3">
              <Check size={12} />
              DBS checked
            </div>
            
            {/* Book button */}
            <button className="w-full py-2.5 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full text-[12px] font-medium transition-colors">
              Book a session
            </button>
          </div>
          
          {/* Completion notice */}
          {profileCompleteness < 100 && (
            <div className="bg-[#FFFBEB] border-l-[3px] border-[#F59E0B] rounded-r-lg px-3 py-2.5 mt-4">
              <p className="text-[11px] text-[#78350F]">Complete all steps to appear in search</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
