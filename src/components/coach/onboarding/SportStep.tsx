'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Target, Trophy, Circle, Waves, Medal, Feather, Activity, Flag, Dumbbell, Check } from 'lucide-react'
import { OnboardingPreviewPanel } from '../OnboardingPreviewPanel'
import { fetchCoachProfileCached, fetchSportsListCached, fetchCoachSportsCached } from '@/lib/onboarding-cache'

interface CoachSportResponse {
  id: string
  sport_id: string
  sport_name: string
  sport_slug: string
  session_types: string[]
  skill_levels: string[]
  price_individual_pence: number | null
  price_group_pence: number | null
  max_group_size: number | null
  session_duration_minutes: number
  currency: string
  is_active: boolean
}

interface Sport {
  id: string
  name: string
  slug: string
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
}

export function SportStep() {
  const router = useRouter()
  const [selectedSports, setSelectedSports] = useState<string[]>([])
  const [sports, setSports] = useState<Sport[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [coachName, setCoachName] = useState<string>('Your name')

  // Icon mapping for sports
  const iconMap: Record<string, React.ComponentType<any>> = {
    'cricket': Target,
    'football': Trophy,
    'tennis': Circle,
    'swimming': Waves,
    'basketball': Circle,
    'rugby': Target,
    'athletics': Medal,
    'badminton': Feather,
    'hockey': Activity,
    'netball': Circle,
    'golf': Flag,
    'boxing': Dumbbell,
  }

  // Fix-17c: Fetch available sports from API and saved coach sports
  // AF-P-07: parallelise three independent fetches; sports list + profile use shared caches
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rawSports, coachSportsData, profileData] = await Promise.all([
          fetchSportsListCached() as Promise<{ id: string; name: string; slug: string }[]>,
          fetchCoachSportsCached(),
          fetchCoachProfileCached(),
        ])

        // Always apply icon mapping after loading (never cache components)
        const sportsWithIcons = rawSports.map((sport) => ({
          ...sport,
          Icon: iconMap[sport.slug] || Target
        }))
        setSports(sportsWithIcons)

        const savedSportNames = (coachSportsData.sports ?? []).map((s: CoachSportResponse) => s.sport_name)
        setSelectedSports(savedSportNames)

        setCoachName(profileData.full_name || 'Your name')
      } catch (error) {
        console.error('[SportStep] Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const toggleSport = (sport: string) => {
    if (selectedSports.includes(sport)) {
      setSelectedSports(selectedSports.filter(s => s !== sport))
    } else {
      setSelectedSports([...selectedSports, sport])
    }
  }

  const handleSave = async () => {
    setSaving(true)
    // CD-03: verified - SportStep stores to sessionStorage only
    // Actual coach_sports rows created in PricingStep after user configures pricing/skill levels
    // This is intentional - sport selection alone doesn't create DB rows
    sessionStorage.setItem('selectedSports', JSON.stringify(selectedSports))
    router.push('/coach/onboarding/pricing')
    setSaving(false)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-transparent font-sans text-gray-900 flex">
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-3xl px-8 pt-10 page-content-enter">

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
          {loading ? (
            <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div className="flex flex-wrap gap-3 p-6">
                {Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    className="h-11 rounded-full bg-gray-100 animate-pulse"
                    style={{ width: `${90 + (i % 3) * 20}px` }}
                  />
                ))}
              </div>
            </div>
          ) : (
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
          )}
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

      {/* Right panel - What parents see */}
      <OnboardingPreviewPanel
        coachName={coachName}
        sport={selectedSports[0] || undefined}
        location={undefined}
        availabilityDays={undefined}
        priceFromPence={undefined}
        isDbs={false}
      />
    </div>
  )
}
