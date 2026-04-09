'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Target, Trophy, Circle, Waves, Medal, Feather, Activity, Flag, Dumbbell, Plus } from 'lucide-react'

export function SportStep() {
  const router = useRouter()
  const [selectedSports, setSelectedSports] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

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
    // Store selected sports in sessionStorage for pricing step
    sessionStorage.setItem('selectedSports', JSON.stringify(selectedSports))
    router.push('/coach/onboarding/pricing')
    setSaving(false)
  }

  return (
    <div className="min-h-full bg-white font-sans text-gray-900 flex flex-col items-center pb-32">
      <div className="w-full max-w-[640px] px-6 pt-10">

        {/* TOP */}
        <div className="mb-10">
          <button
            onClick={() => router.push('/coach/dashboard')}
            className="flex items-center gap-2 text-[#0077CC] hover:text-blue-800 font-bold text-[15px] mb-8 transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Dashboard</span>
          </button>
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Sports you coach</h1>
          <p className="text-[16px] text-gray-500 font-medium">Select all the sports you coach — you can add more later</p>
        </div>

        {/* CONTENT */}
        <div className="flex flex-col gap-6">
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sports.map((sport) => {
                const isSelected = selectedSports.includes(sport.name)
                const Icon = sport.Icon
                return (
                  <button
                    key={sport.name}
                    onClick={() => toggleSport(sport.name)}
                    className={`flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-[15px] font-bold transition-all border ${
                      isSelected
                        ? 'bg-[#0077CC] border-[#0077CC] text-white shadow-sm'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={18} className={isSelected ? 'text-white' : 'text-gray-400'} strokeWidth={2.5} />
                    {sport.name}
                  </button>
                )
              })}
              <button className="flex items-center justify-center sm:justify-start gap-2.5 px-4 py-3.5 rounded-xl text-[15px] font-bold transition-all border bg-gray-50/50 border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-100">
                <Plus size={18} className="text-gray-500" strokeWidth={2.5} />
                More
              </button>
            </div>
            <div className="mt-8 pt-6 border-t border-gray-100">
              <p className="text-[14px] text-gray-500 font-medium">
                You'll set your availability and pricing for each sport in the next step
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* STICKY BOTTOM */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-100 p-6 flex justify-center z-50">
        <div className="w-full max-w-[640px] flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={selectedSports.length === 0 || saving}
            className="w-full py-4 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-50 text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            Save & continue →
          </button>
          <button
            onClick={() => router.push('/coach/dashboard')}
            className="w-full py-3 text-gray-500 hover:text-gray-900 font-bold text-[14px] transition-colors"
          >
            Save & go back to dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
