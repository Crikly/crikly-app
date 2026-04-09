'use client'

import React, { useState } from 'react'
import { Trophy, Circle, Waves, Zap, Wind, Flag, Shield, Plus } from 'lucide-react'

const SPORTS = [
  { id: 'cricket', name: 'Cricket', icon: Trophy },
  { id: 'football', name: 'Football', icon: Circle },
  { id: 'tennis', name: 'Tennis', icon: Circle },
  { id: 'swimming', name: 'Swimming', icon: Waves },
  { id: 'basketball', name: 'Basketball', icon: Circle },
  { id: 'rugby', name: 'Rugby', icon: Circle },
  { id: 'athletics', name: 'Athletics', icon: Zap },
  { id: 'badminton', name: 'Badminton', icon: Wind },
  { id: 'hockey', name: 'Hockey', icon: Trophy },
  { id: 'netball', name: 'Netball', icon: Circle },
  { id: 'golf', name: 'Golf', icon: Flag },
  { id: 'boxing', name: 'Boxing', icon: Shield },
]

interface SportStepProps {
  onContinue: (sportIds: string[]) => void
  onSaveDraft: () => void
}

export function SportStep({ onContinue, onSaveDraft }: SportStepProps): React.ReactElement {
  const [selectedSports, setSelectedSports] = useState<string[]>([])

  const toggleSport = (sportId: string): void => {
    setSelectedSports(prev =>
      prev.includes(sportId)
        ? prev.filter(id => id !== sportId)
        : [...prev, sportId]
    )
  }

  const handleContinue = (): void => {
    if (selectedSports.length > 0) {
      onContinue(selectedSports)
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
          Sports you coach
        </h1>
        <p className="text-base text-neutral-600 mb-6">
          Select all the sports you coach — you can add more later
        </p>

        {/* Sports grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {SPORTS.map(sport => {
            const Icon = sport.icon
            const isSelected = selectedSports.includes(sport.id)
            
            return (
              <button
                key={sport.id}
                onClick={() => toggleSport(sport.id)}
                className={`p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors ${
                  isSelected
                    ? 'bg-brand-600 border border-brand-600 text-white'
                    : 'bg-white border border-neutral-100 text-neutral-900 hover:border-brand-600'
                }`}
              >
                <Icon className={`w-6 h-6 ${isSelected ? 'text-white' : 'text-neutral-600'}`} />
                <span className="text-sm font-medium">{sport.name}</span>
              </button>
            )
          })}

          {/* More button */}
          <button
            className="p-4 rounded-xl bg-white border border-neutral-100 text-neutral-900 flex flex-col items-center justify-center gap-2 hover:border-brand-600"
          >
            <Plus className="w-6 h-6 text-neutral-600" />
            <span className="text-sm font-medium">More</span>
          </button>
        </div>

        <p className="text-sm text-neutral-400">
          You'll set your availability and pricing for each sport in the next step
        </p>
      </div>

      {/* Sticky bottom */}
      <button
        onClick={onSaveDraft}
        className="fixed bottom-[60px] left-0 right-0 text-center text-sm text-neutral-400 hover:text-neutral-600 z-50"
      >
        Save & go back to dashboard
      </button>
      <button
        onClick={handleContinue}
        disabled={selectedSports.length === 0}
        className="fixed bottom-0 left-0 right-0 h-[52px] bg-brand-600 text-white text-base font-medium z-50 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Save & continue →
      </button>
    </div>
  )
}
