'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Plus } from 'lucide-react'

export function PricingStep() {
  const router = useRouter()
  const [selectedSports, setSelectedSports] = useState<string[]>([])
  const [sessionTypes, setSessionTypes] = useState({ individual: true, group: false })
  const [skillLevels, setSkillLevels] = useState<string[]>(['Beginner', 'Intermediate'])
  const [ageGroups, setAgeGroups] = useState<string[]>([])
  const [pricingRows, setPricingRows] = useState([
    { id: '1', duration: '30 min', price: '45' },
    { id: '2', duration: '60 min', price: '75' },
    { id: '3', duration: '90 min', price: '100' },
  ])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Get selected sports from sessionStorage
    const stored = sessionStorage.getItem('selectedSports')
    if (stored) {
      setSelectedSports(JSON.parse(stored))
    }
  }, [])

  const toggleSkillLevel = (level: string) => {
    setSkillLevels(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    )
  }

  const toggleAgeGroup = (group: string) => {
    setAgeGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    )
  }

  const removePricingRow = (id: string) => {
    setPricingRows(prev => prev.filter(row => row.id !== id))
  }

  const addPricingRow = () => {
    setPricingRows(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      duration: '120 min',
      price: ''
    }])
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // CD-03: wired - PricingStep saves to coach_sports table
      // Maps to: sport_id, session_types[], skill_levels[], price_individual_pence, price_group_pence
      // Note: Currently only handles individual pricing. Group pricing needs UI extension.
      
      // Get sport_id from sports table (TODO: fetch actual sport_id from selected sport name)
      // For now, using placeholder - needs sports lookup API
      const sportId = 'placeholder-sport-id' // TODO: lookup sport_id by name
      
      // Convert session types to array format
      const sessionTypesArray = []
      if (sessionTypes.individual) sessionTypesArray.push('individual')
      if (sessionTypes.group) sessionTypesArray.push('group')
      
      // Convert skill levels to lowercase array
      const skillLevelsArray = skillLevels.map(l => l.toLowerCase())
      
      // Get lowest price as individual price (pence)
      const lowestPricePence = pricingRows.length > 0
        ? Math.round(Math.min(...pricingRows.map(r => parseFloat(r.price || '0'))) * 100)
        : 0
      
      await fetch('/api/coaches/sports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport_id: sportId, // CD-03: coach_sports.sport_id (FK to sports table)
          session_types: sessionTypesArray, // CD-03: coach_sports.session_types (text[])
          skill_levels: skillLevelsArray, // CD-03: coach_sports.skill_levels (text[])
          price_individual_pence: lowestPricePence, // CD-03: coach_sports.price_individual_pence (integer)
          price_group_pence: null, // CD-03: coach_sports.price_group_pence (not configured in UI yet)
          max_group_size: null, // CD-03: coach_sports.max_group_size (not configured in UI yet)
          session_duration_minutes: 60, // CD-03: default duration
          // Note: age_groups not in coach_sports schema - skipped
        })
      })
      router.push('/coach/onboarding/qualifications')
    } finally {
      setSaving(false)
    }
  }

  // Calculate minimum price for summary
  const minPrice = pricingRows.length > 0 
    ? Math.min(...pricingRows.map(r => parseFloat(r.price || '0')).filter(p => p > 0))
    : 0

  return (
    <div className="min-h-full bg-transparent font-sans text-gray-900 flex">
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

        <div className="flex flex-col gap-3">

          {/* CF-D12 CHANGE 2C: Sport context display */}
          {selectedSports.length === 1 ? (
            <p className="text-[13px] text-gray-500 mb-4">Setting up: {selectedSports[0]}</p>
          ) : selectedSports.length > 1 ? (
            <div className="mb-4">
              <div className="flex items-center gap-4 mb-2">
                {selectedSports.map((sport, idx) => (
                  <button
                    key={sport}
                    className={idx === 0 ? 'text-[13px] font-medium text-[#0077CC] border-b-2 border-[#0077CC] pb-1' : 'text-[13px] text-gray-500 pb-1'}
                  >
                    {sport}
                    <span className="ml-2">
                      {idx === 0 ? (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#DCFCE7] text-[#166534]">✓</span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border-[1.5px] border-[#E2E8F0]"></span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-400">1 of {selectedSports.length} sports configured</p>
            </div>
          ) : (
            <p className="text-[13px] text-gray-500 mb-4">Setting up: Cricket</p>
          )}

          {/* CF-D12 CHANGE 2D: Session types */}
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Session types</h2>
            <div className="flex flex-col gap-4">
              {(['individual', 'group'] as const).map((type) => (
                <div
                  key={type}
                  className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-blue-100 hover:bg-blue-50/30 transition-colors cursor-pointer"
                  onClick={() => setSessionTypes(prev => ({ ...prev, [type]: !prev[type] }))}
                >
                  <div className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 border transition-colors ${sessionTypes[type] ? 'bg-[#0077CC] border-[#0077CC]' : 'bg-white border-gray-300'}`}>
                    {sessionTypes[type] && <Check size={16} className="text-white" />}
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
                    skillLevels.includes(level)
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
                    ageGroups.includes(group)
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
              {pricingRows.map((row) => (
                <div key={row.id} className="flex items-center gap-4">
                  <div className="w-[80px] text-[15px] font-bold text-gray-900 shrink-0">{row.duration}</div>
                  <div className="flex-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-gray-500 font-bold">£</span>
                    </div>
                    <input
                      type="number"
                      value={row.price}
                      onChange={(e) => setPricingRows(prev => prev.map(r => r.id === row.id ? { ...r, price: e.target.value } : r))}
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200 text-[15px] font-medium text-gray-900 placeholder:text-gray-300 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
                    />
                  </div>
                  <div className="text-[15px] text-gray-500 font-medium whitespace-nowrap hidden sm:block w-[80px]">per session</div>
                  <button onClick={() => removePricingRow(row.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
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
            disabled={saving}
            className="px-7 py-2.5 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-full text-[13px] font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
        </div>
        </div>
      </div>

      {/* CF-D12 CHANGE 2E: Right panel - Your offer summary */}
      <aside className="hidden xl:flex w-80 shrink-0 flex-col bg-white p-6 h-screen overflow-y-auto border-l border-gray-100">
        <div className="sticky top-6">
          <p className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-2" style={{ letterSpacing: '0.05em' }}>YOUR OFFER</p>
          
          <div className="bg-gray-50 rounded-[10px] p-3">
            <h3 className="text-[13px] font-semibold text-gray-900 mb-2">
              {selectedSports.length > 0 ? selectedSports[0] : 'Cricket'}
            </h3>
            
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Session types</span>
                <span className="text-gray-900">
                  {sessionTypes.individual && sessionTypes.group ? 'Individual · Group' : 
                   sessionTypes.individual ? 'Individual' : 
                   sessionTypes.group ? 'Group' : 'None'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-500">Skill levels</span>
                <span className="text-gray-900">
                  {skillLevels.length > 0 ? skillLevels.join(', ') : 'None'}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-500">Age groups</span>
                <span className="text-gray-900">
                  {ageGroups.length > 0 ? `U${ageGroups[0].replace('Under ', '')} – U${ageGroups[ageGroups.length - 1].replace('Under ', '')}` : 'None'}
                </span>
              </div>
            </div>
            
            {minPrice > 0 && (
              <p className="text-[14px] font-semibold text-[#0077CC] mt-2">
                from £{minPrice} / session
              </p>
            )}
          </div>
          
          {/* TODO CF-D12: Show if more sports need setup */}
          {selectedSports.length > 1 && (
            <div className="bg-[#FFFBEB] border-l-[3px] border-[#F59E0B] rounded-r-lg px-3 py-2 mt-2">
              <p className="text-[11px] text-[#78350F]">{selectedSports[1]} still needs setup</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
