'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Target, Trophy, Circle, Waves, Medal, Feather, Activity, Flag, Dumbbell, Check, MapPin, Calendar } from 'lucide-react'

export function SportStep() {
  const router = useRouter()
  const [selectedSports, setSelectedSports] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [displayName] = useState('Alex Johnson') // TODO: Get from profile state

  const sports = [
    { name: 'Cricket', Icon: Target },
    { name: 'Football', Icon: Trophy },
    { name: 'Tennis', Icon: Circle },
    { name: 'Swimming', Icon: Waves },
    { name: 'Basketball', Icon: Circle },
    { name: 'Rugby', Icon: Target },
    { name: 'Athletics', Icon: Medal },
    { name: 'Badminton', Icon: Feather },
    { name: 'Hockey', Icon: Activity },
    { name: 'Netball', Icon: Circle },
    { name: 'Golf', Icon: Flag },
    { name: 'Boxing', Icon: Dumbbell },
  ]

  const toggleSport = (sport: string) => {
    if (selectedSports.includes(sport)) {
      setSelectedSports(selectedSports.filter(s => s !== sport))
    } else {
      setSelectedSports([...selectedSports, sport])
    }
  }

  const handleSave = async () => {
    setSaving(true)
    sessionStorage.setItem('selectedSports', JSON.stringify(selectedSports))
    router.push('/coach/onboarding/pricing')
    setSaving(false)
  }

  return (
    <div className="min-h-full bg-transparent font-sans text-gray-900 flex">
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-3xl px-8 pt-10">

        {/* TOP */}
        <div className="mb-10">
          {/* CF-D12 CHANGE 2A: Step indicator - Step 2 of 5 */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-6 h-2 rounded-full bg-[#0077CC]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
            </div>
            <p className="text-[11px] text-gray-400">Step 2 of 5</p>
          </div>
          
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Sports you coach</h1>
          <p className="text-[16px] text-gray-500 font-medium">Select all the sports you coach — you can add more later</p>
        </div>

        {/* CONTENT */}
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sports.map((sport) => {
                const isSelected = selectedSports.includes(sport.name)
                const Icon = sport.Icon
                return (
                  <button
                    key={sport.name}
                    onClick={() => toggleSport(sport.name)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-[14px] transition-all ${
                      isSelected
                        ? 'bg-[#EFF7FF] border-[1.5px] border-[#0077CC] text-[#0C447C] font-medium'
                        : 'bg-white border border-[#E2E8F0] text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={16} className={isSelected ? 'text-[#0077CC]' : 'text-gray-400'} strokeWidth={2.5} />
                    <span className="flex-1 text-left">{sport.name}</span>
                    {isSelected && (
                      <div className="w-3.5 h-3.5 rounded-full bg-[#0077CC] flex items-center justify-center shrink-0">
                        <Check size={10} className="text-white" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            
            {/* CF-D12 CHANGE 1D: More link below grid */}
            <button className="mt-4 text-[11px] text-[#0077CC] font-medium hover:text-blue-800 transition-colors">
              + More sports
            </button>
            
            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-[13px] text-gray-500">
                You'll set your availability and pricing for each sport in the next step
              </p>
            </div>
          </div>
        </div>

        {/* CF-D12 CHANGE 2B: Save bar - SAVE BAR PATTERN (step 2+: back left, save right) */}
        <div className="flex justify-between items-center py-3 mt-6">
          <button
            onClick={() => router.push('/coach/onboarding/profile')}
            className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleSave}
            disabled={selectedSports.length === 0 || saving}
            className="px-7 py-2.5 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-full text-[13px] font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
        </div>
        </div>
      </div>

      {/* CF-D12 CHANGE 1F: Right panel - What parents see preview */}
      <aside className="hidden xl:flex w-80 shrink-0 flex-col bg-white p-6 h-screen overflow-y-auto border-l border-gray-100">
        <div className="sticky top-6">
          <p className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-2" style={{ letterSpacing: '0.05em' }}>WHAT PARENTS SEE</p>
          
          <div className="bg-white rounded-xl p-4 shadow-sm">
            {/* Avatar row - horizontal layout */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-12 h-12 bg-[#E6F1FB] rounded-full flex items-center justify-center text-[14px] font-medium text-[#0C447C] shrink-0" style={{ boxShadow: '0 0 0 2px #E6F1FB' }}>
                {displayName ? displayName.substring(0, 2).toUpperCase() : 'AJ'}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-medium text-gray-900 truncate">
                  {displayName || <span className="text-gray-300">Your name</span>}
                </h3>
                <p className="text-[12px] text-gray-400 mt-0.5">Cricket Coach</p>
              </div>
            </div>
            
            {/* Stars + rating */}
            <div className="flex items-center gap-1 mb-2">
              {[1,2,3,4,5].map(i => (
                <span key={i} className="text-amber-500 text-[11px]">★</span>
              ))}
              <span className="text-[11px] text-gray-400 ml-0.5">New coach</span>
            </div>
            
            {/* Meta rows */}
            <div className="space-y-1.5 mb-2">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <MapPin size={12} className="shrink-0" />
                <span>London</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <Calendar size={12} className="shrink-0" />
                <span>Mon, Wed, Fri</span>
              </div>
            </div>
            
            {/* Price */}
            <p className="text-[16px] font-medium text-gray-900 mb-2">from £50 / session</p>
            
            {/* DBS badge */}
            <div className="inline-block px-2 py-0.5 bg-[#E0F6F8] text-[#006677] text-[10px] font-medium rounded-full mb-2.5">
              ✓ DBS checked
            </div>
            
            {/* Book button */}
            <button className="w-full bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full py-2.5 text-[12px] font-medium transition-colors">
              Book a session
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
