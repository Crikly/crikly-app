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
  const [qualifications, setQualifications] = useState<Qualification[]>([])
  const [loading, setLoading] = useState(true)
  const [coachName, setCoachName] = useState<string>('Your name')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [confirmRemoveName, setConfirmRemoveName] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Fix-17e: Extract fetchQualifications into reusable function
  const fetchQualifications = async () => {
    try {
      const qualsResponse = await fetch('/api/coaches/qualifications')
      if (qualsResponse.ok) {
        const data = await qualsResponse.json()
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
    }
  }
  
  // Fix-16c: Fetch saved qualifications on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch qualifications
        await fetchQualifications()
        
        // Fix-16e: Fetch coach profile for name
        const profileResponse = await fetch('/api/coaches/profile')
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          setCoachName(profileData.full_name || 'Your name')
        }
      } catch (error) {
        console.error('[QualificationsStep] Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const hasDBS = qualifications.some(q => q.category === 'dbs')

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setFileName(file.name)
  }

  const handleEdit = (qual: Qualification) => {
    setQualTitle(qual.name)
    setProvider(qual.provider || '')
    setYear(qual.year || '')
    setEditingId(qual.id)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setQualTitle('')
    setProvider('')
    setYear('')
    setFileName(null)
  }

  const handleAddQualification = async () => {
    // CD-03: wired - Add qualification to coach_qualifications table
    // Maps to: custom_name, issuing_body, issued_date (coach_qualifications)
    if (!qualTitle.trim()) return
    
    try {
      if (editingId) {
        // Fix-17g: Update existing qualification (DELETE + POST since PATCH doesn't allow custom_name change)
        await fetch(`/api/coaches/qualifications/${editingId}`, {
          method: 'DELETE',
        })
        
        const response = await fetch('/api/coaches/qualifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            custom_name: qualTitle,
            issuing_body: provider || null,
            issued_date: year ? `${year}-01-01` : null,
          })
        })
        
        if (response.ok) {
          await fetchQualifications()
          setEditingId(null)
        }
      } else {
        // Add new qualification
        const response = await fetch('/api/coaches/qualifications', {
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
        
        // Fix-17e: Refetch qualifications to update state
        if (response.ok) {
          await fetchQualifications()
        }
      }
      
      // Reset form
      setQualTitle('')
      setProvider('')
      setYear('')
      setFileName(null)
    } catch (error) {
      console.error('Failed to add qualification:', error)
    }
  }

  // Fix-33: Confirmation handlers
  const handleRemoveWithConfirm = (qualId: string, qualName: string) => {
    setConfirmRemoveId(qualId)
    setConfirmRemoveName(qualName)
  }

  const handleConfirmRemove = async () => {
    if (!confirmRemoveId) return
    await handleRemove(confirmRemoveId)
    setConfirmRemoveId(null)
    setConfirmRemoveName('')
  }

  // Fix-16e: Add handleRemove function to delete qualification and update local state
  const handleRemove = async (qualId: string) => {
    try {
      const response = await fetch(`/api/coaches/qualifications/${qualId}`, {
        method: 'DELETE',
      })
      
      // Fix-16e: Remove from local state immediately after successful deletion
      if (response.ok) {
        setQualifications(prev => prev.filter(q => q.id !== qualId))
      }
    } catch (error) {
      console.error('[QualificationsStep] Failed to remove qualification:', error)
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
    <div className="flex-1 overflow-y-auto bg-transparent font-sans text-gray-900 flex">
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
          
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Your qualifications</h1>
          <p className="text-[16px] text-gray-500 font-medium">Add credentials that build parent trust and increase your bookings</p>
          
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

          <div className="flex gap-2 ml-auto">
            {editingId && (
              <button
                onClick={handleCancelEdit}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-[12px] font-medium transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleAddQualification}
              className="px-5 py-2 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full text-[12px] font-medium transition-colors"
            >
              {editingId ? 'Update qualification' : 'Add qualification'}
            </button>
          </div>
        </div>

          {/* Fix-16c: Loading state */}
          {loading ? (
            <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div className="py-16 flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-3 border-gray-200 border-t-[#0077CC] rounded-full animate-spin mb-3" />
                <p className="text-[14px] text-gray-500">Loading your qualifications...</p>
              </div>
            </div>
          ) : (
          <div className="page-content-enter">
          {/* CF-D13 CHANGE 4: Qualification cards (v1.1: shadow, no border) */}
          {qualifications.length > 0 && (
            <div className="flex flex-col gap-4">
              {qualifications.map((qual) => (
                <div key={qual.id}
                  className="qual-card-enter bg-white rounded-xl p-4 border border-gray-100"
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                >
                  <div className="flex items-start gap-3">
                    {/* Status icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[16px] ${
                      qual.status === 'uploaded'
                        ? 'bg-[#DCFCE7] text-[#166534]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}>
                      {qual.status === 'uploaded' ? '✓' : '⏱'}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[14px] font-bold text-gray-900 leading-tight">
                          {qual.name}
                        </p>
                        <div className="flex gap-3 shrink-0">
                          <button
                            onClick={() => handleEdit(qual)}
                            className="text-[11px] font-medium text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRemoveWithConfirm(qual.id, qual.name)}
                            className="text-[11px] font-medium text-red-400 hover:text-red-600 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {/* Meta row */}
                      <p className="text-[12px] text-gray-500 mt-1">
                        {[qual.provider, qual.year].filter(Boolean).join(' · ')}
                      </p>

                      {/* Status badge */}
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium mt-2 ${
                        qual.status === 'uploaded'
                          ? 'bg-[#DCFCE7] text-[#166534]'
                          : 'bg-[#FEF3C7] text-[#92400E]'
                      }`}>
                        {qual.status === 'uploaded' ? '✓ Uploaded' : '⏱ Pending review'}
                      </div>
                    </div>
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
          </div>
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
        coachName={coachName}
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

      {/* Fix-33: Confirmation modal */}
      {confirmRemoveId && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4"
          onClick={() => setConfirmRemoveId(null)}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-[360px] shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-[17px] font-bold text-gray-900 mb-2">
              Remove qualification?
            </h3>
            <p className="text-[14px] text-gray-500 mb-6">
              "{confirmRemoveName}" will be permanently removed from your profile.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#0077CC] hover:bg-[#0066AA] text-white text-[14px] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemove}
                className="flex-1 py-2.5 rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-50 text-[14px] font-medium transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
