'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, X } from 'lucide-react'
import { OnboardingPreviewPanel } from '../OnboardingPreviewPanel'

interface Qualification {
  id: string
  category: string
  name: string
  provider: string
  year: string
  status: 'uploaded' | 'pending'
}

interface QualificationResponse {
  id: string
  qualification_type_id: string | null
  type_name: string | null
  issuing_body: string | null
  custom_name: string | null
  issued_date: string | null
  expiry_date: string | null
  notes: string | null
  is_custom: boolean
  created_at: string
}

type CategoryType = 'coaching' | 'dbs' | 'firstaid' | 'safeguarding' | 'other' | ''

export function QualificationsStep() {
  const router = useRouter()
  const [category, setCategory] = useState<CategoryType>('')
  const [qualTitle, setQualTitle] = useState('')
  const [provider, setProvider] = useState('')
  const [year, setYear] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  
  // Fix-16c: Fetch saved qualifications on mount
  const [qualifications, setQualifications] = useState<Qualification[]>([])
  const [loading, setLoading] = useState(true)
  
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Fix-16c: Fetch saved qualifications on mount
  useEffect(() => {
    const fetchQualifications = async () => {
      try {
        const response = await fetch('/api/coaches/qualifications')
        if (response.ok) {
          const data = await response.json()
          const savedQuals = data.qualifications.map((q: QualificationResponse) => ({
            id: q.id,
            category: q.is_custom ? 'other' : 'coaching',
            name: q.custom_name || q.type_name || '',
            provider: q.issuing_body || '',
            year: q.issued_date ? new Date(q.issued_date).getFullYear().toString() : '',
            status: 'uploaded' as const
          }))
          setQualifications(savedQuals)
        }
      } catch (error) {
        console.error('[QualificationsStep] Failed to fetch qualifications:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchQualifications()
  }, [])

  const hasDBS = qualifications.some(q => q.category === 'dbs')

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setFileName(file.name)
  }

  const handleAddQualification = async () => {
    // CD-03: wired - Add qualification to coach_qualifications table
    // Maps to: custom_name, issuing_body, issued_date (coach_qualifications)
    if (!qualTitle.trim()) return
    
    try {
      await fetch('/api/coaches/qualifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_name: qualTitle, // CD-03: coach_qualifications.custom_name
          issuing_body: provider || null, // CD-03: coach_qualifications.issuing_body
          issued_date: year ? `${year}-01-01` : null, // CD-03: coach_qualifications.issued_date (ISO date)
          // Note: qualification_type_id null for custom qualifications
          // Note: file upload not implemented yet - skipped
        })
      })
      // Reset form after successful add
      setCategory('')
      setQualTitle('')
      setProvider('')
      setYear('')
      setFileName(null)
    } catch (error) {
      console.error('Failed to add qualification:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    // CD-03: verified - Qualifications already saved via handleAddQualification
    // This step just navigates to next step
    router.push('/coach/onboarding/availability')
    setSaving(false)
  }
  
  const handleSkip = () => {
    // TODO CF-D13: wire skip to next step route
    router.push('/coach/onboarding/availability')
  }

  return (
    <div className="min-h-full bg-transparent font-sans text-gray-900 flex">
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-3xl px-8 pt-10">

        {/* TOP */}
        <div className="mb-10">
          {/* CF-D13 CHANGE 1: Step indicator - Step 4 of 5 (v1.1: all non-active dots grey) */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
              <div className="w-6 h-2 rounded-full bg-[#0077CC]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
            </div>
            <p className="text-[11px] text-[#94A3B8]">Step 4 of 5</p>
          </div>
          
          <h1 className="text-[20px] font-medium text-[#0F172A] mb-2">Your qualifications</h1>
          <p className="text-[13px] text-[#64748B] mb-4">Add credentials that build parent trust and increase your bookings</p>
          
          {/* CF-D13 CHANGE 2: Trust motivator banner */}
          <div className="bg-[#E6F1FB] rounded-lg px-3.5 py-2.5">
            <p className="text-[12px] text-[#0C447C] font-medium">
              Coaches with a DBS check get 2× more parent enquiries
            </p>
          </div>
        </div>

        {/* CF-D13c: Simple form with dropdown (matches Sport & pricing pattern) */}
        <div className="bg-white rounded-xl p-4 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div>
            <label className="block text-[12px] font-medium text-[#0F172A] mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryType)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2E8F0] text-[13px] text-[#0F172A] focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
            >
              <option value="">Select a category</option>
              <option value="coaching">Coaching qualification</option>
              <option value="dbs">DBS check</option>
              <option value="firstaid">First aid</option>
              <option value="safeguarding">Safeguarding</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#0F172A] mb-1.5">Title</label>
            <input
              type="text"
              value={qualTitle}
              onChange={(e) => setQualTitle(e.target.value)}
              placeholder="e.g. ECB Level 2 Coaching"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2E8F0] text-[13px] text-[#0F172A] placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-[12px] text-[#94A3B8] mb-1.5">Issuer / Provider (optional)</label>
            <input
              type="text"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="e.g. England & Wales Cricket Board"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2E8F0] text-[13px] text-[#0F172A] placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-[12px] text-[#94A3B8] mb-1.5">Year (optional)</label>
            <input
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g. 2022"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#E2E8F0] text-[13px] text-[#0F172A] placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
            />
          </div>

          <button
            onClick={handleAddQualification}
            className="px-5 py-2 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full text-[12px] font-medium transition-colors w-fit ml-auto"
          >
            Add qualification
          </button>
        </div>

          {/* Fix-16c: Loading state */}
          {loading ? (
            <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div className="flex items-center justify-center py-8">
                <div className="text-[14px] text-gray-400">Loading your qualifications...</div>
              </div>
            </div>
          ) : (
          <>
          {/* CF-D13 CHANGE 4: Qualification cards (v1.1: shadow, no border) */}
          {qualifications.length > 0 && (
            <div className="flex flex-col gap-4">
              {qualifications.map((qual) => (
                <div key={qual.id} className="bg-white rounded-xl p-4 flex gap-3 items-start" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[14px] ${
                    qual.status === 'uploaded' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'
                  }`}>
                    {qual.status === 'uploaded' ? '✓' : '⏱'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[#0F172A]">{qual.name}</p>
                    <p className="text-[11px] text-[#64748B] mt-0.5">{qual.provider} · {qual.year}</p>
                    <div className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-medium mt-1 ${
                      qual.status === 'uploaded' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}>
                      {qual.status === 'uploaded' ? 'Uploaded' : 'Pending review'}
                    </div>
                  </div>
                  <div className="flex gap-2 items-start shrink-0">
                    <button className="text-[10px] text-[#94A3B8] hover:text-gray-900 transition-colors">Edit</button>
                    <button className="text-[10px] text-[#E24B4A] hover:text-red-700 transition-colors">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CF-D13 CHANGE 5: Empty state (v1.1: no Skip link inside, only in save bar) */}
          {qualifications.length === 0 && (
            <div className="border-[1.5px] border-dashed border-[#E2E8F0] rounded-xl px-4 py-7 text-center">
              <p className="text-[13px] font-medium text-[#0F172A] mb-1">No qualifications added yet</p>
              <p className="text-[11px] text-[#94A3B8]">You can add credentials later from your profile</p>
            </div>
          )}
          </>
          )}

        {/* CF-D13 CHANGE 7: Save bar (v1.1: per onboarding patterns) */}
        <div className="flex justify-between items-center py-4 mt-4">
          <button
            onClick={() => router.push('/coach/onboarding/pricing')}
            className="text-[13px] text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5.5 py-2.5 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-full text-[13px] font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
        </div>
        </div>
      </div>

      {/* Right panel - What parents see */}
      <OnboardingPreviewPanel
        coachName="Your name"
        sport={undefined}
        location={undefined}
        availabilityDays={undefined}
        priceFromPence={undefined}
        isDbs={hasDBS}
        infoBox={hasDBS ? {
          type: 'success',
          message: '✓ DBS badge now visible to parents',
          subMessage: 'Parents can see your credentials in search results'
        } : undefined}
      />
    </div>
  )
}
