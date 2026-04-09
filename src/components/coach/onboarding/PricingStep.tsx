'use client'

import React, { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Elite']
const AGE_GROUPS = ['Under 8', 'Under 10', 'Under 12', 'Under 14', 'Under 16', 'Adults (17+)']
const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 120]

interface PricingRow {
  id: string
  duration: number
  price: string
}

interface PricingStepProps {
  selectedSports: string[]
  onSave: (data: SportPricingData) => Promise<void>
  onSaveDraft: () => void
}

export interface SportPricingData {
  sportId: string
  sessionTypes: string[]
  skillLevels: string[]
  ageGroups: string[]
  pricingRows: Array<{ duration: number; price: number }>
}

export function PricingStep({ selectedSports, onSave, onSaveDraft }: PricingStepProps): React.ReactElement {
  const [selectedSport, setSelectedSport] = useState('')
  const [sessionTypes, setSessionTypes] = useState<string[]>(['individual', 'group'])
  const [skillLevels, setSkillLevels] = useState<string[]>([])
  const [ageGroups, setAgeGroups] = useState<string[]>([])
  const [pricingRows, setPricingRows] = useState<PricingRow[]>([
    { id: '1', duration: 30, price: '' },
    { id: '2', duration: 60, price: '' },
    { id: '3', duration: 90, price: '' },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleSessionType = (type: string): void => {
    setSessionTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  const toggleSkillLevel = (level: string): void => {
    setSkillLevels(prev =>
      prev.includes(level)
        ? prev.filter(l => l !== level)
        : [...prev, level]
    )
  }

  const toggleAgeGroup = (group: string): void => {
    setAgeGroups(prev =>
      prev.includes(group)
        ? prev.filter(g => g !== group)
        : [...prev, group]
    )
  }

  const updatePrice = (id: string, price: string): void => {
    setPricingRows(prev =>
      prev.map(row => row.id === id ? { ...row, price } : row)
    )
  }

  const removeRow = (id: string): void => {
    setPricingRows(prev => prev.filter(row => row.id !== id))
  }

  const addRow = (): void => {
    const newId = String(Date.now())
    setPricingRows(prev => [...prev, { id: newId, duration: 30, price: '' }])
  }

  const updateDuration = (id: string, duration: number): void => {
    setPricingRows(prev =>
      prev.map(row => row.id === id ? { ...row, duration } : row)
    )
  }

  const handleSubmit = async (): Promise<void> => {
    if (!selectedSport) {
      setError('Please select a sport')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const validPricingRows = pricingRows
        .filter(row => row.price && parseFloat(row.price) > 0)
        .map(row => ({
          duration: row.duration,
          price: Math.round(parseFloat(row.price) * 100) // Convert to pence
        }))

      await onSave({
        sportId: selectedSport,
        sessionTypes,
        skillLevels,
        ageGroups,
        pricingRows: validPricingRows
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pricing')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-0 pb-32">
      <div className="max-w-[480px] mx-auto px-4 py-8">
        {/* Header */}
        <button
          onClick={onSaveDraft}
          className="text-brand-600 text-base font-medium mb-6 flex items-center gap-2"
        >
          ← Dashboard
        </button>

        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
          Sport & pricing
        </h1>
        <p className="text-base text-neutral-600 mb-6">
          Set up the sport you coach and your session prices
        </p>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-4 bg-danger/10 border border-danger rounded-md text-sm text-danger">
            {error}
          </div>
        )}

        {/* Sport card */}
        <Card className="mb-4">
          <h2 className="text-base font-semibold text-neutral-900 mb-4">
            Sport
          </h2>
          <select
            value={selectedSport}
            onChange={(e) => setSelectedSport(e.target.value)}
            className="w-full h-input-mobile px-4 bg-neutral-50 border border-neutral-100 rounded-md text-base text-neutral-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/25"
          >
            <option value="">Select a sport</option>
            {selectedSports.map(sport => (
              <option key={sport} value={sport}>{sport}</option>
            ))}
          </select>
          <p className="text-sm text-neutral-400 mt-2">
            You can add more sports later
          </p>
        </Card>

        {/* Session types card */}
        <Card className="mb-4">
          <h2 className="text-base font-semibold text-neutral-900 mb-4">
            Session types
          </h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sessionTypes.includes('individual')}
                onChange={() => toggleSessionType('individual')}
                className="mt-0.5 w-5 h-5 rounded border-neutral-100 text-brand-600 focus:ring-brand-600"
              />
              <div>
                <div className="text-base font-medium text-neutral-900">Individual</div>
                <div className="text-sm text-neutral-400">1-on-1 sessions with a single player</div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sessionTypes.includes('group')}
                onChange={() => toggleSessionType('group')}
                className="mt-0.5 w-5 h-5 rounded border-neutral-100 text-brand-600 focus:ring-brand-600"
              />
              <div>
                <div className="text-base font-medium text-neutral-900">Group</div>
                <div className="text-sm text-neutral-400">Sessions with multiple players</div>
              </div>
            </label>
          </div>
        </Card>

        {/* Skill levels card */}
        <Card className="mb-4">
          <h2 className="text-base font-semibold text-neutral-900 mb-4">
            Skill levels you coach
          </h2>
          <div className="flex flex-wrap gap-2">
            {SKILL_LEVELS.map(level => (
              <button
                key={level}
                onClick={() => toggleSkillLevel(level)}
                className={`h-10 px-4 rounded-md text-sm font-medium transition-colors ${
                  skillLevels.includes(level)
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-neutral-100 text-neutral-900 hover:border-brand-600'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </Card>

        {/* Age groups card */}
        <Card className="mb-4">
          <h2 className="text-base font-semibold text-neutral-900 mb-4">
            Age groups
          </h2>
          <div className="flex flex-wrap gap-2">
            {AGE_GROUPS.map(group => (
              <button
                key={group}
                onClick={() => toggleAgeGroup(group)}
                className={`h-10 px-4 rounded-md text-sm font-medium transition-colors ${
                  ageGroups.includes(group)
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-neutral-100 text-neutral-900 hover:border-brand-600'
                }`}
              >
                {group}
              </button>
            ))}
          </div>
        </Card>

        {/* 1-on-1 session pricing card */}
        <Card className="mb-4">
          <h2 className="text-base font-semibold text-neutral-900 mb-2">
            1-on-1 session pricing
          </h2>
          <p className="text-sm text-neutral-400 mb-4">
            Set your price for each session length
          </p>
          <div className="space-y-3">
            {pricingRows.map(row => (
              <div key={row.id} className="flex items-center gap-3">
                <select
                  value={row.duration}
                  onChange={(e) => updateDuration(row.id, Number(e.target.value))}
                  className="w-24 h-10 px-3 bg-neutral-50 border border-neutral-100 rounded-md text-sm text-neutral-900 focus:outline-none focus:border-brand-600"
                >
                  {DURATION_OPTIONS.map(duration => (
                    <option key={duration} value={duration}>{duration} min</option>
                  ))}
                </select>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-neutral-400">£</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.price}
                    onChange={(e) => updatePrice(row.id, e.target.value)}
                    placeholder="0.00"
                    className="flex-1 h-10 px-3 bg-neutral-50 border border-neutral-100 rounded-md text-base text-neutral-900 focus:outline-none focus:border-brand-600"
                  />
                  <span className="text-sm text-neutral-400">per session</span>
                </div>
                <button
                  onClick={() => removeRow(row.id)}
                  className="w-10 h-10 flex items-center justify-center text-neutral-400 hover:text-danger"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addRow}
            className="mt-4 text-brand-600 text-base font-medium hover:text-brand-800"
          >
            + Add another duration
          </button>
        </Card>
      </div>

      {/* Sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-100 p-4">
        <div className="max-w-[480px] mx-auto">
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !selectedSport}
            className="w-full mb-3"
          >
            {isLoading ? 'Saving...' : 'Save & continue →'}
          </Button>
          <button
            onClick={onSaveDraft}
            className="w-full text-center text-base text-neutral-400 hover:text-neutral-600"
          >
            Save & go back to dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
