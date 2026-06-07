'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Plus } from 'lucide-react'
import { fetchCoachProfileCached, fetchSportsListCached, fetchCoachSportsCached, clearCoachSportsCache } from '@/lib/onboarding-cache'

interface Sport {
  id: string
  name: string
  slug: string
}

interface CoachSportResponse {
  id: string
  sport_id: string
  sport_name: string
  sport_slug: string
  session_types: string[]
  skill_levels: string[]
  age_groups?: string[]
  price_individual_pence: number | null
  price_group_pence: number | null
  max_group_size: number | null
  session_duration_minutes: number
  currency: string
  is_active: boolean
}

// C-Pricing-02: per-sport pricing data structure
interface PricingRow {
  id: string
  duration: string
  price: string
}

interface SportPricing {
  sessionTypes: { individual: boolean; group: boolean }
  skillLevels: string[]
  ageGroups: string[]
  pricingRows: PricingRow[]
}

const DURATION_OPTIONS = ['30 min', '45 min', '60 min', '90 min', '120 min'] as const

const UI_TO_API_AGE: Record<string, string> = {
  'Under 8': 'under_8',
  'Under 10': 'under_10',
  'Under 12': 'under_12',
  'Under 14': 'under_14',
  'Under 16': 'under_16',
  'Adults (17+)': 'adults',
}

const API_TO_UI_AGE: Record<string, string> = {
  'under_8': 'Under 8',
  'under_10': 'Under 10',
  'under_12': 'Under 12',
  'under_14': 'Under 14',
  'under_16': 'Under 16',
  'adults': 'Adults (17+)',
}

const defaultSportPricing: SportPricing = {
  sessionTypes: { individual: true, group: false },
  skillLevels: [],
  ageGroups: [],
  pricingRows: [{ id: '1', duration: '60 min', price: '' }],
}

export function PricingStep() {
  const router = useRouter()
  const [selectedSports, setSelectedSports] = useState<string[]>([])
  // C-Pricing-02: per-sport pricing keyed by sport name
  const [pricingBySport, setPricingBySport] = useState<Record<string, SportPricing>>({})
  const [activeSport, setActiveSport] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [sports, setSports] = useState<Sport[]>([])
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [coachName, setCoachName] = useState('')
  const [coachAvatarUrl, setCoachAvatarUrl] = useState<string | null>(null)

  // C-Pricing-02: derive active sport's pricing (with safe default)
  const activePricing: SportPricing = pricingBySport[activeSport] ?? defaultSportPricing

  // C-Pricing-02: write a partial update to the active sport
  const updateActiveSport = (update: Partial<SportPricing>) => {
    if (!activeSport) return
    setPricingBySport(prev => ({
      ...prev,
      [activeSport]: { ...(prev[activeSport] ?? defaultSportPricing), ...update },
    }))
  }

  // C-Pricing-02: a sport is "configured" when at least one priced row exists
  const isConfigured = (sport: string): boolean => {
    const p = pricingBySport[sport]
    return p?.pricingRows.some(r => r.price !== '') ?? false
  }

  useEffect(() => {
    // Fix-16c: Fetch sports list, selected sports, and saved pricing data
    // AF-P-08: parallelise three independent fetches; sports list + profile use shared caches
    const fetchData = async () => {
      try {
        const [rawSports, profileData, coachSportsData] = await Promise.all([
          fetchSportsListCached() as Promise<Sport[]>,
          fetchCoachProfileCached(),
          fetchCoachSportsCached(),
        ])

        setSports(rawSports)

        setCoachName(profileData.full_name || '')
        if (profileData.avatar_url) {
          setCoachAvatarUrl(profileData.avatar_url)
        }

        // Get selected sports from sessionStorage
        const stored = sessionStorage.getItem('selectedSports')
        let storedSports: string[] = []
        if (stored) {
          storedSports = JSON.parse(stored) as string[]
          setSelectedSports(storedSports)
        }

        // C-Pricing-02: pre-populate from ALL saved coach sports (was only sports[0])
        if (coachSportsData.sports && coachSportsData.sports.length > 0) {
          const initialPricing: Record<string, SportPricing> = {}

          coachSportsData.sports.forEach((savedSport: CoachSportResponse) => {
            const sportName = savedSport.sport_name
            initialPricing[sportName] = {
              sessionTypes: {
                individual: savedSport.session_types.includes('individual'),
                group: savedSport.session_types.includes('group'),
              },
              skillLevels: savedSport.skill_levels.map(l =>
                l.charAt(0).toUpperCase() + l.slice(1)
              ),
              ageGroups: (savedSport.age_groups ?? []).map(g => API_TO_UI_AGE[g] ?? g),
              pricingRows: savedSport.price_individual_pence
                ? [{
                    id: '1',
                    duration: `${savedSport.session_duration_minutes} min`,
                    price: (savedSport.price_individual_pence / 100).toFixed(0),
                  }]
                : [{ id: '1', duration: '60 min', price: '' }],
            }
          })

          setPricingBySport(initialPricing)
        }

        // C-Pricing-02: anchor activeSport to first selected sport
        if (storedSports.length > 0) {
          setActiveSport(storedSports[0])
        }
      } catch (error) {
        console.error('[PricingStep] Error fetching data:', error)
        setLoadingError('Failed to load data. Please refresh the page.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const toggleSkillLevel = (level: string) => {
    const next = activePricing.skillLevels.includes(level)
      ? activePricing.skillLevels.filter(l => l !== level)
      : [...activePricing.skillLevels, level]
    updateActiveSport({ skillLevels: next })
  }

  const toggleAgeGroup = (group: string) => {
    const next = activePricing.ageGroups.includes(group)
      ? activePricing.ageGroups.filter(g => g !== group)
      : [...activePricing.ageGroups, group]
    updateActiveSport({ ageGroups: next })
  }

  const removePricingRow = (id: string) => {
    if (activePricing.pricingRows.length === 1) return // guard: never remove last row
    updateActiveSport({
      pricingRows: activePricing.pricingRows.filter(row => row.id !== id),
    })
  }

  const addPricingRow = () => {
    const used = activePricing.pricingRows.map(r => r.duration)
    const nextDuration = DURATION_OPTIONS.find(d => !used.includes(d)) ?? '60 min'
    updateActiveSport({
      pricingRows: [
        ...activePricing.pricingRows,
        { id: Math.random().toString(36).substr(2, 9), duration: nextDuration, price: '' },
      ],
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (selectedSports.length === 0) {
        setLoadingError('No sport selected. Please go back and select a sport.')
        setSaving(false)
        return
      }

      // C-Pricing-02: every selected sport must have at least one priced row
      const unconfigured = selectedSports.filter(s => !isConfigured(s))
      if (unconfigured.length > 0) {
        setLoadingError(`Please set a price for: ${unconfigured.join(', ')}`)
        setSaving(false)
        return
      }

      const sportMatches = selectedSports.map(sportName => {
        const matchedSport = sports.find(s => s.name === sportName)
        if (!matchedSport) {
          setLoadingError(`Sport "${sportName}" not found. Please go back and select a valid sport.`)
          setSaving(false)
          return null
        }
        return { name: sportName, id: matchedSport.id }
      })
      if (sportMatches.some(match => match === null)) return

      // C-Pricing-02: each sport gets its own pricing payload from pricingBySport
      const savePromises = sportMatches.map(match => {
        const pricing = pricingBySport[match!.name] ?? defaultSportPricing

        const sessionTypesArray: string[] = []
        if (pricing.sessionTypes.individual) sessionTypesArray.push('individual')
        if (pricing.sessionTypes.group) sessionTypesArray.push('group')

        const skillLevelsArray = pricing.skillLevels.map(l => l.toLowerCase())

        const ageGroupsArray = pricing.ageGroups.map(g =>
          UI_TO_API_AGE[g] ?? g.toLowerCase().replace(' ', '_')
        )

        const lowestPricePence = pricing.pricingRows.length > 0
          ? Math.round(Math.min(...pricing.pricingRows.map(r => parseFloat(r.price || '0'))) * 100)
          : 0

        // C-Pricing-02: parse duration from first row's "60 min" → 60
        const durationMinutes = parseInt(
          pricing.pricingRows[0]?.duration?.split(' ')[0] ?? '60',
          10
        )

        return fetch('/api/coaches/sports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sport_id: match!.id,
            session_types: sessionTypesArray,
            skill_levels: skillLevelsArray,
            age_groups: ageGroupsArray,
            price_individual_pence: lowestPricePence,
            price_group_pence: null,
            max_group_size: null,
            session_duration_minutes: durationMinutes,
          })
        })
      })

      // AF-H-20: check each response.ok before invalidating cache + navigating
      const responses = await Promise.all(savePromises)
      const allOk = responses.every(r => r.ok)
      if (!allOk) {
        setLoadingError('Failed to save pricing for one or more sports. Please try again.')
        return
      }

      // PERF-Sports-01: invalidate cache — these POSTs mutate coach_sports
      clearCoachSportsCache()

      router.push('/coach/onboarding/qualifications')
    } catch (error) {
      // AF-H-20: top-level catch for network or unexpected errors
      console.error('[PricingStep] handleSave error:', error)
      setLoadingError('An error occurred. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // C-Pricing-02: Calculate minimum price from active sport's pricing rows
  const activePrices = activePricing.pricingRows
    .map(r => parseFloat(r.price || '0'))
    .filter(p => p > 0)
  const minPrice = activePrices.length > 0 ? Math.min(...activePrices) : 0

  // C-Pricing-02: first unconfigured sport (for the bottom warning)
  const firstUnconfigured = selectedSports.find(s => !isConfigured(s))

  return (
    <div className="flex-1 overflow-y-auto bg-transparent font-sans text-gray-900 flex">
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-3xl px-8 pt-10">

        {/* TOP */}
        <div className="mb-10">
          {/* CF-D12 CHANGE 3A: Step indicator - Step 3 of 5 */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-6 h-2 rounded-full bg-[#0077CC]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
            </div>
            <p className="text-[11px] text-gray-400">Step 3 of 5</p>
          </div>
          
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Sport & pricing</h1>
          <p className="text-[16px] text-gray-500 font-medium">Set up your session types and pricing</p>
        </div>

        {/* Fix-16c: Loading state */}
        {loading ? (
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="py-16 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-gray-200 border-t-[#0077CC] rounded-full animate-spin mb-3" />
              <p className="text-[14px] text-gray-500">Loading your pricing...</p>
            </div>
          </div>
        ) : (
          <div className="page-content-enter">
        {/* CD-04: Error display for sport lookup failures */}
        {loadingError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-[14px] font-medium text-red-700">{loadingError}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">

          {/* C-Pricing-02: Sport tabs with onClick + dynamic configured indicator */}
          {selectedSports.length === 1 ? (
            <p className="text-[13px] text-gray-500 mb-4">Setting up: {activeSport}</p>
          ) : selectedSports.length > 1 ? (
            <div className="mb-4">
              <div className="flex items-center gap-4 mb-2">
                {selectedSports.map((sport) => {
                  const isActive = sport === activeSport
                  const configured = isConfigured(sport)
                  return (
                    <button
                      key={sport}
                      onClick={() => setActiveSport(sport)}
                      className={isActive ? 'text-[13px] font-medium text-[#0077CC] border-b-2 border-[#0077CC] pb-1' : 'text-[13px] text-gray-500 pb-1 hover:text-gray-700 transition-colors'}
                    >
                      {sport}
                      <span className="ml-2">
                        {configured ? (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#DCFCE7] text-[#166534]"><Check size={10} strokeWidth={3} /></span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border-[1.5px] border-[#E2E8F0]"></span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400">
                {selectedSports.filter(isConfigured).length} of {selectedSports.length} sports configured
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-gray-500 mb-4">Setting up: {activeSport || 'Cricket'}</p>
          )}

          {/* CF-D12 CHANGE 2D: Session types */}
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Session types</h2>
            <div className="flex flex-col gap-4">
              {(['individual', 'group'] as const).map((type) => (
                <div
                  key={type}
                  className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-blue-100 hover:bg-blue-50/30 transition-colors cursor-pointer"
                  onClick={() => updateActiveSport({
                    sessionTypes: { ...activePricing.sessionTypes, [type]: !activePricing.sessionTypes[type] }
                  })}
                >
                  <div className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 border transition-colors ${activePricing.sessionTypes[type] ? 'bg-[#0077CC] border-[#0077CC]' : 'bg-white border-gray-300'}`}>
                    {activePricing.sessionTypes[type] && <Check size={16} className="text-white" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[15px] font-bold text-gray-900 capitalize">{type === 'individual' ? 'Individual' : 'Group'}</span>
                    <span className="text-[14px] text-gray-500 font-medium mt-0.5">
                      {type === 'individual' ? '1-on-1 sessions with a single player' : 'Sessions with multiple players'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Skill levels */}
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 className="text-[13px] font-medium text-gray-900 mb-3.5">Skill levels you coach</h2>
            <div className="flex flex-wrap gap-2.5">
              {['Beginner', 'Intermediate', 'Advanced', 'Elite'].map((level) => (
                <button
                  key={level}
                  onClick={() => toggleSkillLevel(level)}
                  className={`px-5 py-2.5 rounded-full text-[14px] font-bold transition-all border ${
                    activePricing.skillLevels.includes(level)
                      ? 'bg-[#0077CC] border-[#0077CC] text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Age groups */}
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 className="text-[13px] font-medium text-gray-900 mb-3.5">Age groups</h2>
            <div className="flex flex-wrap gap-2.5">
              {['Under 8', 'Under 10', 'Under 12', 'Under 14', 'Under 16', 'Adults (17+)'].map((group) => (
                <button
                  key={group}
                  onClick={() => toggleAgeGroup(group)}
                  className={`px-5 py-2.5 rounded-full text-[14px] font-bold transition-all border ${
                    activePricing.ageGroups.includes(group)
                      ? 'bg-[#0077CC] border-[#0077CC] text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>

          {/* 1-on-1 pricing */}
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="mb-4">
              <h2 className="text-[13px] font-medium text-gray-900">1-on-1 session pricing</h2>
              <p className="text-[12px] text-gray-500 mt-1">Set your price for each session length</p>
            </div>
            <div className="flex flex-col gap-4">
              {activePricing.pricingRows.map((row) => (
                <div key={row.id} className="flex items-center gap-4">
                  <select
                    value={row.duration}
                    onChange={(e) => updateActiveSport({
                      pricingRows: activePricing.pricingRows.map(r =>
                        r.id === row.id ? { ...r, duration: e.target.value } : r
                      )
                    })}
                    className="w-[90px] text-[14px] font-medium text-gray-900 border border-gray-200 rounded-lg px-2 py-2 bg-white focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none"
                  >
                    {DURATION_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <div className="flex-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-gray-500 font-bold">£</span>
                    </div>
                    <input
                      type="number"
                      value={row.price}
                      onChange={(e) => updateActiveSport({
                        pricingRows: activePricing.pricingRows.map(r =>
                          r.id === row.id ? { ...r, price: e.target.value } : r
                        )
                      })}
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 text-[15px] font-medium text-gray-900 placeholder:text-gray-300 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
                    />
                  </div>
                  <div className="text-[15px] text-gray-500 font-medium whitespace-nowrap hidden sm:block w-[80px]">per session</div>
                  <button
                    onClick={() => removePricingRow(row.id)}
                    disabled={activePricing.pricingRows.length === 1}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                  >
                    <X size={20} />
                  </button>
                </div>
              ))}
              <button onClick={addPricingRow} className="mt-2 flex items-center gap-1.5 text-[#0077CC] font-bold text-[14px] hover:text-blue-800 transition-colors w-fit">
                <Plus size={16} />
                Add another duration
              </button>
            </div>
          </div>

        </div>

        {/* CF-D12 CHANGE 3B: Save bar - SAVE BAR PATTERN (step 2+: back left, save right) */}
        <div className="flex justify-between items-center py-3 mt-6">
          <button
            onClick={() => router.push('/coach/onboarding/sport')}
            className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !!loadingError}
            className="px-7 py-2.5 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-full text-[13px] font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
        </div>
        </div>
        )}
        </div>
      </div>

      {/* Fix-23: Right panel - Coach preview + Your offer summary */}
      <aside className="hidden xl:flex w-80 shrink-0 flex-col bg-white p-6 h-screen overflow-y-auto border-l border-gray-100">
        <div className="sticky top-6">
          {/* SECTION 1: Coach preview card */}
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-4" style={{ letterSpacing: '0.05em' }}>
            WHAT PARENTS SEE
          </p>
          
          <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-5 mb-4">
            {/* Avatar + Name */}
            <div className="flex items-start gap-3 mb-4">
              {coachAvatarUrl ? (
                <img
                  src={coachAvatarUrl}
                  alt={coachName}
                  className="w-16 h-16 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-16 h-16 bg-[#E6F1FB] rounded-full flex items-center justify-center shrink-0">
                  <span className="text-[#0C447C] text-[20px] font-bold">
                    {coachName
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .toUpperCase()
                      .substring(0, 2) || 'C'}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-[16px] font-bold text-gray-900 mb-0.5">
                  {coachName || <span className="text-gray-300">Your name</span>}
                </h3>
                <p className="text-[13px] text-gray-500">
                  {activeSport ? `${activeSport} Coach` : 'Cricket Coach'}
                </p>
              </div>
            </div>
            
            {/* Star rating */}
            <div className="flex items-center gap-1 mb-3">
              <span className="text-amber-400 text-[15px]">★★★★★</span>
              <span className="text-[12px] text-gray-500 ml-1">New coach</span>
            </div>
            
            {/* Price */}
            <div className={`text-[15px] font-bold mb-4 ${minPrice > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
              from £{minPrice > 0 ? minPrice : '--'} / session
            </div>
            
            {/* Book button */}
            <button 
              className="w-full bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full py-3 text-[14px] font-bold transition-colors pointer-events-none"
              disabled
            >
              Book a session
            </button>
          </div>

          {/* SECTION 2: Your offer summary */}
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-4 mt-6" style={{ letterSpacing: '0.05em' }}>
            YOUR OFFER
          </p>
          
          <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 mb-3">
              {activeSport || 'Cricket'}
            </h3>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-[11px] text-gray-500">Session types</span>
                <span className="text-[11px] text-gray-900 font-medium text-right max-w-[140px]">
                  {activePricing.sessionTypes.individual && activePricing.sessionTypes.group ? 'Individual · Group' :
                   activePricing.sessionTypes.individual ? 'Individual' :
                   activePricing.sessionTypes.group ? 'Group' : 'None'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[11px] text-gray-500">Skill levels</span>
                <span className="text-[11px] text-gray-900 font-medium text-right max-w-[140px]">
                  {activePricing.skillLevels.length > 0 ? activePricing.skillLevels.join(', ') : 'None'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[11px] text-gray-500">Age groups</span>
                <span className="text-[11px] text-gray-900 font-medium text-right max-w-[140px]">
                  {activePricing.ageGroups.length > 0 ? `U${activePricing.ageGroups[0].replace('Under ', '')} – U${activePricing.ageGroups[activePricing.ageGroups.length - 1].replace('Under ', '')}` : 'None'}
                </span>
              </div>
            </div>
          </div>
          
          {/* C-Pricing-02: warning shows first unconfigured sport (was hardcoded selectedSports[1]) */}
          {firstUnconfigured && selectedSports.length > 1 && (
            <div className="bg-[#FFFBEB] border-l-[3px] border-[#F59E0B] rounded-r-lg px-3 py-2 mt-4">
              <p className="text-[11px] text-[#78350F]">{firstUnconfigured} still needs setup</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
