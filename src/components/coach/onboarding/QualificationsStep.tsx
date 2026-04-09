'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, Upload, Award, FileText, Trash2, X } from 'lucide-react'

interface Qualification {
  id: string
  name: string
  body: string
  year: string
  file: string | null
}

export function QualificationsStep() {
  const router = useRouter()
  const [selectedQual, setSelectedQual] = useState('')
  const [body, setBody] = useState('')
  const [year, setYear] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [qualifications, setQualifications] = useState<Qualification[]>([])
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setFileName(file.name)
  }

  const handleAddQualification = () => {
    if (!selectedQual) return
    setQualifications([...qualifications, {
      id: Math.random().toString(36).substr(2, 9),
      name: selectedQual,
      body: body.trim(),
      year: year.trim(),
      file: fileName
    }])
    setSelectedQual('')
    setBody('')
    setYear('')
    setFileName(null)
  }

  const removeQualification = (id: string) => {
    setQualifications(qualifications.filter(q => q.id !== id))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/coaches/qualifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qualifications })
      })
      router.push('/coach/onboarding/availability')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-white font-sans text-gray-900 flex flex-col items-center pb-32">
      <div className="w-full max-w-[640px] px-6 pt-10">
        <div className="mb-10">
          <button onClick={() => router.push('/coach/onboarding/pricing')} className="flex items-center gap-2 text-[#0077CC] hover:text-blue-800 font-bold text-[15px] mb-8 transition-colors">
            <ArrowLeft size={18} /><span>Dashboard</span>
          </button>
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Your qualifications</h1>
          <p className="text-[16px] text-gray-500 font-medium">Add your coaching qualifications and certificates</p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Add a qualification</h2>
            <div className="flex flex-col gap-6">
              <div className="relative">
                <select value={selectedQual} onChange={(e) => setSelectedQual(e.target.value)} className={`w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[15px] bg-white appearance-none focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all cursor-pointer font-medium ${selectedQual ? 'text-gray-900' : 'text-gray-500'}`}>
                  <option value="" disabled hidden>Select a qualification</option>
                  <option value="ECB Level 1">ECB Level 1</option>
                  <option value="ECB Level 2">ECB Level 2</option>
                  <option value="FA Level 2">FA Level 2</option>
                  <option value="LTA Level 3">LTA Level 3</option>
                  <option value="First Aid">First Aid</option>
                  <option value="Safeguarding">Safeguarding</option>
                  <option value="Other...">Other...</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"><ChevronDown size={18} className="text-gray-400" /></div>
              </div>

              {selectedQual && (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-bold text-gray-900">Issuing body</label>
                    <input type="text" value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. ECB, FA, LTA" className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-bold text-gray-900">Year issued <span className="text-gray-400 font-normal ml-1">(optional)</span></label>
                    <input type="text" value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2021" className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[14px] font-bold text-gray-900">Upload certificate <span className="text-gray-400 font-normal ml-1">(optional)</span></label>
                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.png" onChange={handleFileSelect} className="hidden" />
                    {fileName ? (
                      <div className="flex items-center justify-between p-3.5 rounded-xl border border-gray-200 bg-gray-50/50">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><FileText size={16} className="text-[#0077CC]" /></div>
                          <span className="text-[14px] font-bold text-gray-900">{fileName}</span>
                        </div>
                        <button onClick={() => setFileName(null)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"><Trash2 size={16} /></button>
                      </div>
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()} className="w-fit px-5 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold text-[14px] hover:border-gray-300 hover:bg-gray-50 transition-colors flex items-center gap-2">
                        <Upload size={18} strokeWidth={2.5} className="text-gray-400" />Upload file
                      </button>
                    )}
                    <p className="text-[13px] text-gray-500 font-medium mt-1">Not shown publicly · admin review only</p>
                  </div>
                </div>
              )}

              <button onClick={handleAddQualification} disabled={!selectedQual} className={`mt-2 w-full py-4 rounded-xl border-2 font-bold text-[15px] transition-colors flex items-center justify-center gap-2 ${selectedQual ? 'border-[#0077CC] text-[#0077CC] hover:bg-blue-50' : 'border-gray-200 text-gray-400 cursor-not-allowed'}`}>
                Add qualification
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-20">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Your qualifications</h2>
            {qualifications.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4"><Award size={24} className="text-gray-300" /></div>
                <p className="text-[15px] font-bold text-gray-900 mb-1">No qualifications added yet.</p>
                <p className="text-[14px] text-gray-500 font-medium mb-6">You can skip this step and add<br/>qualifications later.</p>
                <button onClick={() => router.push('/coach/onboarding/availability')} className="text-[14px] font-bold text-[#475569] hover:text-gray-900 transition-colors flex items-center gap-1">Skip for now <ArrowLeft size={16} className="rotate-180" /></button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {qualifications.map((qual) => (
                  <div key={qual.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-gray-900 text-[15px]">{qual.name}</span>
                      <div className="flex items-center gap-2 text-[14px]">
                        {qual.body && <><span className="text-gray-600 font-medium">{qual.body}</span>{(qual.year || qual.file) && <span className="text-gray-300">•</span>}</>}
                        {qual.year && <><span className="text-gray-600 font-medium">{qual.year}</span>{qual.file && <span className="text-gray-300">•</span>}</>}
                        {qual.file && <span className="text-[#0077CC] font-bold flex items-center gap-1"><FileText size={14} /> File uploaded</span>}
                      </div>
                    </div>
                    <button onClick={() => removeQualification(qual.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 shrink-0 ml-2 self-start"><X size={18} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-100 p-6 flex justify-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        <div className="w-full max-w-[640px] flex flex-col gap-3">
          <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm flex items-center justify-center gap-2">
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
          <button onClick={() => router.push('/coach/dashboard')} className="w-full py-3 text-gray-500 hover:text-gray-900 font-bold text-[14px] transition-colors">Save & go back to dashboard</button>
        </div>
      </div>
    </div>
  )
}
