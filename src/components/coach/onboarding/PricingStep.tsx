'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, Check, X, Plus } from 'lucide-react'

export function PricingStep() {
  const router = useRouter()
  const [sessionTypes, setSessionTypes] = useState({ individual: true, group: true })
  const [skillLevels, setSkillLevels] = useState<string[]>(['Beginner', 'Intermediate'])
  const [ageGroups, setAgeGroups] = useState<string[]>([])
  const [pricingRows, setPricingRows] = useState([
    { id: '1', duration: '30 min', price: '' },
    { id: '2', duration: '60 min', price: '' },
    { id: '3', duration: '90 min', price: '' },
  ])
  const [saving, setSaving] = useState(false)

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
      await fetch('/api/coaches/sports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_types: sessionTypes,
          skill_levels: skillLevels,
          age_groups: ageGroups,
          pricing_rows: pricingRows.map(r => ({
            duration: r.duration,
            price_pence: Math.round(parseFloat(r.price || '0') * 100)
          }))
        })
      })
      router.push('/coach/onboarding/qualifications')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-white font-sans text-gray-900 flex flex-col items-center pb-32">
      <div className="w-full max-w-[640px] px-6 pt-10">

        {/* TOP */}
        <div className="mb-10">
          <button
            onClick={() => router.push('/coach/onboarding/sport')}
            className="flex items-center gap-2 text-[#0077CC] hover:text-blue-800 font-bold text-[15px] mb-8 transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Dashboard</span>
          </button>
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Sport & pricing</h1>
          <p className="text-[16px] text-gray-500 font-medium">Set up the sport you coach and your session prices</p>
        </div>

        <div className="flex flex-col gap-6">

          {/* Sport */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Sport</h2>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <select className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white appearance-none focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all cursor-pointer font-medium">
                  <option value="" disabled>Select a sport</option>
                  <option>Cricket</option>
                  <option>Football</option>
                  <option>Tennis</option>
                  <option>Swimming</option>
                  <option>Rugby</option>
                  <option>Basketball</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                  <ChevronDown size={18} className="text-gray-400" />
                </div>
              </div>
              <p className="text-[13px] text-gray-500 font-medium mt-1">You can add more sports later</p>
            </div>
          </div>

          {/* Session types */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
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
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Skill levels you coach</h2>
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
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Age groups</h2>
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
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <div className="mb-6">
              <h2 className="text-[18px] font-bold text-gray-900">1-on-1 session pricing</h2>
              <p className="text-[14px] text-gray-500 font-medium mt-1">Set your price for each session length</p>
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
      </div>

      {/* STICKY BOTTOM */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-100 p-6 flex justify-center z-50">
        <div className="w-full max-w-[640px] flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {saving ? 'Saving...' : 'Save & continue →'}
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
