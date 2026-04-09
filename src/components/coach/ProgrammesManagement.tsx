'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Calendar, Users, Tag, Plus, BookOpen } from 'lucide-react'

type Tab = 'Active' | 'Draft'
interface Programme { id: string; name: string; schedule: string; spotsFilled: number; spotsTotal: number; price: string; status: 'Active' | 'Full' | 'Draft' }

export function ProgrammesManagement() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Active')
  const activeProgrammes: Programme[] = [
    { id: '1', name: 'Junior Cricket Foundations', schedule: 'Every Sat · 10:00 – 11:30', spotsFilled: 4, spotsTotal: 6, price: '£25 per session', status: 'Active' },
    { id: '2', name: 'Advanced Batting Masterclass', schedule: 'Every Sun · 09:00 – 10:30', spotsFilled: 6, spotsTotal: 6, price: '£240 for 6 sessions', status: 'Full' },
    { id: '3', name: 'Open Net Session', schedule: 'Every Wed · 18:00 – 19:00', spotsFilled: 2, spotsTotal: 8, price: '£15 per session', status: 'Active' }
  ]
  const draftProgrammes: Programme[] = [
    { id: '4', name: 'Holiday Cricket Camp', schedule: 'Mon–Fri · 09:00 – 12:00 (5 days)', spotsFilled: 0, spotsTotal: 12, price: '£60 per day', status: 'Draft' }
  ]
  const getStatusStyles = (status: Programme['status']) => {
    switch (status) {
      case 'Active': return 'bg-[#DCFCE7] text-[#15803D]'
      case 'Full': return 'bg-[#E0F6F8] text-[#0099AA]'
      case 'Draft': return 'bg-[#F3F4F6] text-[#6B7280]'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
  const currentProgrammes = activeTab === 'Active' ? activeProgrammes : draftProgrammes

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-md bg-gray-50 min-h-screen relative flex flex-col pb-12">
        <div className="px-5 pt-8 pb-2 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Programmes</h1>
            <button className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-3.5 py-2 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"><Plus size={16} />New Programme</button>
          </div>
          <div className="flex items-center gap-6 border-b border-gray-100">
            {(['Active', 'Draft'] as Tab[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 text-[15px] font-bold transition-colors relative whitespace-nowrap ${activeTab === tab ? 'text-[#0077CC]' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab}
                {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#0077CC]" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 px-5 py-5 space-y-3.5 bg-gray-50/30">
          {currentProgrammes.length > 0 ? currentProgrammes.map(programme => {
            const fillPercentage = (programme.spotsFilled / programme.spotsTotal) * 100
            const isDraft = programme.status === 'Draft'
            return (
              <div key={programme.id} className={`bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm cursor-pointer hover:border-[#0077CC]/30 transition-colors ${isDraft ? 'opacity-80' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-3.5 pr-2">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="text-[16px] font-bold text-gray-900 leading-tight">{programme.name}</h3>
                      <div className={`px-2.5 py-1 rounded-full text-[12px] font-bold shrink-0 ${getStatusStyles(programme.status)}`}>{programme.status}</div>
                    </div>
                    <div className="flex items-center gap-2.5 text-gray-600"><Calendar size={16} className="text-gray-400 shrink-0" /><span className="text-[14px] font-medium">{programme.schedule}</span></div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5 text-gray-600"><Users size={16} className="text-gray-400 shrink-0" /><span className="text-[14px] font-medium">{programme.spotsFilled} / {programme.spotsTotal} spots filled</span></div>
                      <div className="ml-6 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#0077CC]" style={{ width: `${fillPercentage}%` }} /></div>
                    </div>
                    <div className="flex items-center gap-2.5 text-gray-600 pt-0.5"><Tag size={16} className="text-gray-400 shrink-0" /><span className="text-[14px] font-medium">{programme.price}</span></div>
                  </div>
                  <div className="shrink-0 text-gray-300"><ChevronRight size={20} /></div>
                </div>
                {isDraft && (
                  <div className="mt-5 pt-4 border-t border-gray-100 flex gap-3">
                    <button className="flex-1 py-2.5 flex items-center justify-center border border-[#0077CC] text-[#0077CC] rounded-xl text-[14px] font-bold hover:bg-[#E6F3FB] transition-colors bg-white">Edit</button>
                    <button className="flex-1 py-2.5 flex items-center justify-center bg-[#0077CC] text-white rounded-xl text-[14px] font-bold hover:bg-[#0066AA] transition-colors">Publish</button>
                  </div>
                )}
              </div>
            )
          }) : (
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-[#E6F3FB] text-[#0077CC] rounded-full flex items-center justify-center mb-4"><BookOpen size={28} /></div>
              <h3 className="text-[18px] font-bold text-gray-900 mb-2">No programmes yet</h3>
              <p className="text-[14px] text-gray-500 font-medium mb-6 max-w-[260px] leading-relaxed">Create your first programme to start accepting group bookings</p>
              <button className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-6 py-3 rounded-xl text-[15px] font-bold flex items-center gap-2 transition-colors shadow-sm w-full max-w-[200px] justify-center"><Plus size={18} />Create Programme</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
