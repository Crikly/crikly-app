'use client'

import React, { useState, useRef } from 'react'
import { Camera, MapPin, Check } from 'lucide-react'

const LANGUAGES = [
  'English', 'Sinhala', 'Tamil', 'Urdu', 'Hindi',
  'Punjabi', 'Bengali', 'Arabic', 'French', 'Spanish'
]

const EXPERIENCE_OPTIONS = ['0–2 yrs', '3–5 yrs', '6–10 yrs', '10+ yrs']

const TRAVEL_RADIUS_OPTIONS = [
  'No travel (I coach at fixed venues)',
  'Up to 5 miles',
  'Up to 10 miles',
  'Up to 20 miles',
  'Up to 50 miles',
  'Anywhere in the UK'
]

interface ProfileStepProps {
  onSave: (data: ProfileData) => Promise<void>
  onSaveDraft: () => void
}

export interface ProfileData {
  photo?: File
  displayName: string
  bio: string
  baseLocation: string
  travelRadius: string
  yearsExperience: string
  gender?: string
  languages: string[]
}

export function ProfileStep({ onSave, onSaveDraft }: ProfileStepProps): React.ReactElement {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [baseLocation, setBaseLocation] = useState('')
  const [travelRadius, setTravelRadius] = useState(TRAVEL_RADIUS_OPTIONS[0])
  const [yearsExperience, setYearsExperience] = useState('')
  const [gender, setGender] = useState('')
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Please upload a JPG or PNG file')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB')
      return
    }

    setError(null)
    setPhotoFile(file)

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const toggleLanguage = (language: string): void => {
    setSelectedLanguages(prev =>
      prev.includes(language)
        ? prev.filter(l => l !== language)
        : [...prev, language]
    )
  }

  const handleSubmit = async (): Promise<void> => {
    setIsLoading(true)
    setError(null)

    try {
      await onSave({
        photo: photoFile || undefined,
        displayName,
        bio,
        baseLocation,
        travelRadius,
        yearsExperience,
        gender: gender || undefined,
        languages: selectedLanguages
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white pb-[120px]">
      <div className="max-w-[480px] mx-auto px-4 py-8">
        {/* Header */}
        <button
          onClick={onSaveDraft}
          className="text-brand-600 text-sm font-medium mb-6 flex items-center gap-1"
        >
          ← Dashboard
        </button>

        <h1 className="text-3xl font-semibold text-neutral-900 mb-1">
          Your profile
        </h1>
        <p className="text-base text-neutral-600 mb-6">
          This is how parents will see you
        </p>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 bg-danger/10 border border-danger rounded-md text-sm text-danger">
            {error}
          </div>
        )}

        {/* Profile photo card */}
        <div className="bg-white border border-neutral-100 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Profile photo
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden">
              {photoPreview ? (
                <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-neutral-400" />
              )}
            </div>
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mb-2 px-4 py-2 bg-white border-[1.5px] border-brand-600 text-brand-600 rounded-md text-base font-medium hover:bg-brand-50 cursor-pointer"
              >
                Upload photo
              </button>
              <p className="text-sm text-neutral-400">
                Required to go live · JPG or PNG · max 5MB
              </p>
            </div>
          </div>
        </div>

        {/* Basic info card */}
        <div className="bg-white border border-neutral-100 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Basic info
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Display name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you'll appear to parents"
                className="w-full h-[52px] px-4 bg-neutral-50 border border-neutral-100 rounded-md text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell parents about your coaching style and what to expect from a session with you"
                maxLength={500}
                rows={4}
                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-100 rounded-md text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25 resize-none"
              />
              <div className="text-right text-sm text-neutral-400 mt-1">
                {bio.length} / 500
              </div>
            </div>
          </div>
        </div>

        {/* Location card */}
        <div className="bg-white border border-neutral-100 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Location
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Base location
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                <input
                  value={baseLocation}
                  onChange={(e) => setBaseLocation(e.target.value)}
                  placeholder="Town, city or postcode"
                  className="w-full h-[52px] pl-10 pr-4 bg-neutral-50 border border-neutral-100 rounded-md text-base text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25"
                />
              </div>
              <p className="text-sm text-neutral-400 mt-2">
                Used so parents nearby can find you
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Travel radius
              </label>
              <select
                value={travelRadius}
                onChange={(e) => setTravelRadius(e.target.value)}
                className="w-full h-[52px] px-4 bg-neutral-50 border border-neutral-100 rounded-md text-base text-neutral-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25"
              >
                {TRAVEL_RADIUS_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* About you card */}
        <div className="bg-white border border-neutral-100 rounded-xl p-5 mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            About you
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Years of experience
              </label>
              <div className="grid grid-cols-4 gap-2">
                {EXPERIENCE_OPTIONS.map(option => (
                  <button
                    key={option}
                    onClick={() => setYearsExperience(option)}
                    className={`h-10 px-4 rounded-full text-sm font-medium transition-colors ${
                      yearsExperience === option
                        ? 'bg-brand-600 text-white border border-brand-600'
                        : 'bg-white border border-neutral-100 text-neutral-900 hover:border-brand-600'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Gender <span className="text-neutral-400">(optional)</span>
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full h-[52px] px-4 bg-neutral-50 border border-neutral-100 rounded-md text-base text-neutral-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25"
              >
                <option value="">Select gender</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Languages spoken
              </label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map(language => (
                  <button
                    key={language}
                    onClick={() => toggleLanguage(language)}
                    className={`h-9 px-3 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      selectedLanguages.includes(language)
                        ? 'border-[1.5px] border-brand-600 text-brand-600 bg-white'
                        : 'border border-neutral-100 text-neutral-900 bg-white hover:border-brand-600'
                    }`}
                  >
                    {selectedLanguages.includes(language) && (
                      <Check className="w-4 h-4" />
                    )}
                    {language}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky bottom */}
      <button
        onClick={onSaveDraft}
        className="fixed bottom-[60px] left-0 right-0 text-center text-sm text-neutral-400 hover:text-neutral-600 z-50"
      >
        Save & go back to dashboard
      </button>
      <button
        onClick={handleSubmit}
        disabled={isLoading || !displayName || !bio}
        className="fixed bottom-0 left-0 right-0 h-[52px] bg-brand-600 text-white text-base font-medium z-50 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Saving...' : 'Save & continue →'}
      </button>
    </div>
  )
}
