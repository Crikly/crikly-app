'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileText, X } from 'lucide-react'
import { PublicProfilePreview } from './PublicProfilePreview'

interface Qualification {
  id: string
  category: string
  name: string
  provider: string
  year: string
  status: 'uploaded' | 'pending'
}

type CategoryType = 'coaching' | 'dbs' | 'firstaid' | 'safeguarding' | null

export function QualificationsStep() {
  const router = useRouter()
  const [activeCategory, setActiveCategory] = useState<CategoryType>(null)
  const [qualTitle, setQualTitle] = useState('')
  const [provider, setProvider] = useState('')
  const [year, setYear] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  
  // CF-D13 CHANGE 4: Stub qualification cards to show pattern
  const [qualifications] = useState<Qualification[]>([
    {
      id: '1',
      category: 'coaching',
      name: 'ECB Level 2 Coaching',
      provider: 'England & Wales Cricket Board',
      year: '2022',
      status: 'uploaded'
    },
    {
      id: '2',
      category: 'dbs',
      name: 'DBS Enhanced Check',
      provider: 'Disclosure & Barring Service',
      year: '2023',
      status: 'pending'
    }
  ])
  
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const hasDBS = qualifications.some(q => q.category === 'dbs')

  const categories = [
    { id: 'coaching' as CategoryType, icon: '🏅', name: 'Coaching qualification', desc: 'ECB, UEFA, LTA etc.' },
    { id: 'dbs' as CategoryType, icon: '🛡', name: 'DBS check', desc: 'Background check' },
    { id: 'firstaid' as CategoryType, icon: '❤️', name: 'First aid', desc: 'Valid certificate' },
    { id: 'safeguarding' as CategoryType, icon: '👶', name: 'Safeguarding', desc: 'Child protection' }
  ]

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setFileName(file.name)
  }

  const handleAddQualification = () => {
    // TODO CF-D13: wire form submission to save qualification
    setQualTitle('')
    setProvider('')
    setYear('')
    setFileName(null)
    setActiveCategory(null)
  }

  const handleSave = async () => {
    setSaving(true)
    // TODO CF-D13: save qualifications
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
          {/* CF-D13 CHANGE 1: Step indicator - Step 4 of 5 */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-[#22C55E]"></div>
              <div className="w-2 h-2 rounded-full bg-[#22C55E]"></div>
              <div className="w-2 h-2 rounded-full bg-[#22C55E]"></div>
              <div className="w-6 h-2 rounded-full bg-[#0077CC]"></div>
              <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
            </div>
            <p className="text-[11px] text-[#94A3B8]">Step 4 of 5</p>
          </div>
          
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Your qualifications</h1>
          <p className="text-[16px] text-gray-500 font-medium mb-4">Add your coaching qualifications and certificates</p>
          
          {/* CF-D13 CHANGE 2: Trust motivator banner */}
          <div className="bg-[#E6F1FB] rounded-lg px-3.5 py-2.5">
            <p className="text-[12px] text-[#0C447C] font-medium">
              Coaches with a DBS check and qualification get 2× more parent enquiries
            </p>
          </div>
        </div>

        {/* CF-D13 CHANGE 3: Category tiles */}
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-xl p-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                  className={`flex flex-col items-start p-3.5 rounded-[10px] transition-all cursor-pointer ${
                    activeCategory === cat.id
                      ? 'border-[1.5px] border-[#0077CC] bg-[#F0F7FF]'
                      : 'border border-[#E2E8F0] bg-white hover:border-[#0077CC] hover:bg-[#F8FBFF]'
                  }`}
                >
                  <div className="w-7 h-7 bg-[#F1F5F9] rounded-[7px] flex items-center justify-center mb-2 text-[16px]">
                    {cat.icon}
                  </div>
                  <p className="text-[12px] font-medium text-[#0F172A]">{cat.name}</p>
                  <p className="text-[10px] text-[#94A3B8] mt-0.5">{cat.desc}</p>
                </button>
              ))}
            </div>

            {/* CF-D13 CHANGE 3: Inline form when category selected */}
            {activeCategory && (
              <div className="border-t border-gray-100 pt-4 flex flex-col gap-3">
                <input
                  type="text"
                  value={qualTitle}
                  onChange={(e) => setQualTitle(e.target.value)}
                  placeholder={`${categories.find(c => c.id === activeCategory)?.name} title`}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#E2E8F0] text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
                />
                <input
                  type="text"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder="Provider/Issuer (optional)"
                  className="w-full px-3 py-2.5 rounded-lg border border-[#E2E8F0] text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
                />
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="Year (optional)"
                  className="w-full px-3 py-2.5 rounded-lg border border-[#E2E8F0] text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
                />
                
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.png" onChange={handleFileSelect} className="hidden" />
                {fileName ? (
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-[#E2E8F0] bg-gray-50">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-[#0077CC]" />
                      <span className="text-[12px] font-medium text-gray-900">{fileName}</span>
                    </div>
                    <button onClick={() => setFileName(null)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-3 py-2.5 rounded-lg border-2 border-dashed border-[#E2E8F0] text-[10px] text-gray-400 hover:border-gray-300 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Upload size={12} />
                    Upload certificate (optional)
                  </button>
                )}
                
                <button
                  onClick={handleAddQualification}
                  className="px-4 py-1.5 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full text-[12px] font-medium transition-colors w-fit"
                >
                  Add qualification
                </button>
              </div>
            )}
          </div>

          {/* CF-D13 CHANGE 4: Qualification cards (stub data) */}
          {qualifications.length > 0 && (
            <div className="flex flex-col gap-2">
              {qualifications.map((qual) => (
                <div key={qual.id} className="bg-white rounded-[10px] border border-[#E2E8F0] p-3.5 flex gap-2.5 items-start">
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

          {/* CF-D13 CHANGE 5: Empty state (hidden when qualifications exist) */}
          {qualifications.length === 0 && (
            <div className="border-[1.5px] border-dashed border-[#E2E8F0] rounded-[10px] px-4 py-7 text-center">
              <div className="w-9 h-9 bg-[#F1F5F9] rounded-full flex items-center justify-center mx-auto mb-2.5 text-[18px]">
                📋
              </div>
              <p className="text-[13px] font-medium text-[#0F172A] mb-1">No qualifications added yet</p>
              <p className="text-[11px] text-[#94A3B8] mb-3">You can skip this step and add credentials later</p>
              <button onClick={handleSkip} className="text-[11px] text-[#0077CC] font-medium hover:text-blue-800 transition-colors">
                Skip for now →
              </button>
            </div>
          )}
        </div>

        {/* CF-D13 CHANGE 7: Save bar - three items, no border-top */}
        <div className="flex justify-between items-center py-4 mt-4">
          <button
            onClick={() => router.push('/coach/onboarding/pricing')}
            className="text-[13px] text-[#64748B] hover:text-[#0F172A] transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleSkip}
            className="text-[13px] text-[#94A3B8] hover:text-gray-900 transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5.5 py-2.5 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-full text-[12px] font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
        </div>
        </div>
      </div>

      {/* CF-D13 CHANGE 8: Right panel - PublicProfilePreview + DBS notice */}
      <aside className="hidden xl:flex w-80 shrink-0 flex-col bg-white p-6 h-screen overflow-y-auto border-l border-gray-100">
        <div className="sticky top-6">
          <p className="text-[9px] font-medium text-[#94A3B8] uppercase tracking-wider mb-2" style={{ letterSpacing: '0.05em' }}>WHAT PARENTS SEE</p>
          
          <PublicProfilePreview
            displayName="Alex Johnson"
            role="Cricket Coach"
            baseLocation="London"
            availability="Mon, Wed, Fri"
            price="50"
            hasDBS={hasDBS}
          />
          
          {/* CF-D13 CHANGE 8: DBS notice */}
          {hasDBS ? (
            <div className="bg-[#F0FDF4] rounded-lg px-3 py-2.5 mt-2">
              <p className="text-[11px] font-medium text-[#166534] mb-0.5">✓ DBS badge now visible to parents</p>
              <p className="text-[10px] text-[#166534]">Parents can see your credentials in search results</p>
            </div>
          ) : (
            <div className="bg-[#FFFBEB] border-l-[3px] border-[#F59E0B] rounded-r-lg px-3 py-2.5 mt-2">
              <p className="text-[11px] text-[#78350F]">Add a DBS check to build more trust</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
