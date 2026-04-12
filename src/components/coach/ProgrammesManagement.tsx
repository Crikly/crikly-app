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
      case 'Full': return 'bg-[#0077CC] text-white'
      case 'Draft': return 'bg-[#F3F4F6] text-[#6B7280]'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
  const currentProgrammes = activeTab === 'Active' ? activeProgrammes : draftProgrammes
  
  // CF-D05 CHANGE 1: Calculate subtitle stats
  const activeCount = activeProgrammes.filter(p => p.status === 'Active').length
  const fullCount = activeProgrammes.filter(p => p.status === 'Full').length
  const leastFullProgramme = activeProgrammes
    .filter(p => p.status === 'Active')
    .sort((a, b) => (a.spotsFilled / a.spotsTotal) - (b.spotsFilled / b.spotsTotal))[0]
  const spotsRemaining = leastFullProgramme ? leastFullProgramme.spotsTotal - leastFullProgramme.spotsFilled : 0

  return (
    <div className="min-h-screen bg-white font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto bg-white min-h-screen relative flex flex-col pb-12">
        <div className="px-5 pt-8 pb-2 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Programmes</h1>
            <button className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-3.5 py-2 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"><Plus size={16} />New Programme</button>
          </div>
          {/* CF-D05 CHANGE 1: State-aware subtitle */}
          <p className="text-[13px] text-gray-500 mt-1 mb-4">
            {activeCount} active · {fullCount} full{spotsRemaining > 0 && leastFullProgramme ? ` · ${spotsRemaining} spots available in ${leastFullProgramme.name}` : ''}
          </p>
          <div className="flex items-center gap-6 border-b border-gray-100">
            {(['Active', 'Draft'] as Tab[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 text-[15px] font-bold transition-colors relative whitespace-nowrap ${activeTab === tab ? 'text-[#0077CC]' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab}
                {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#0077CC]" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 px-5 py-5 space-y-3" style={{ background: 'transparent' }}>
          {currentProgrammes.length > 0 ? currentProgrammes.map(programme => {
            const fillPercentage = (programme.spotsFilled / programme.spotsTotal) * 100
            const isDraft = programme.status === 'Draft'
            const isFull = programme.status === 'Full'
            const spotsRemaining = programme.spotsTotal - programme.spotsFilled
            
            // CF-D05 CHANGE 2: Fill rate colors
            const getFillValueColor = () => {
              if (fillPercentage < 25) return '#92400E'
              return '#1F2937'
            }
            const getBarColor = () => {
              if (fillPercentage < 25) return '#F59E0B'
              return '#0077CC'
            }
            const getSpotsTextColor = () => {
              if (fillPercentage < 25) return '#92400E'
              return '#6B7280'
            }
            
            return (
              <div 
                key={programme.id} 
                className={`rounded-xl cursor-pointer overflow-hidden ${isDraft ? 'opacity-80' : ''}`}
                style={{ 
                  background: isFull ? '#F0F7FF' : '#FFFFFF',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  transition: 'all 150ms ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
                  e.currentTarget.style.transform = 'scale(1.005)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
                onClick={() => router.push(`/coach/programmes/${programme.id}`)}
              >
                <div className="p-4">
                  {/* CF-D05 CHANGE 2: Restructured card */}
                  {/* 1. Programme name + status badge */}
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className="text-[14px] font-medium text-gray-900 leading-tight">{programme.name}</h3>
                    <div className={`px-2.5 py-1 rounded-full text-[12px] font-bold shrink-0 ${getStatusStyles(programme.status)}`}>{programme.status}</div>
                  </div>
                  
                  {/* 2. Schedule meta */}
                  <div className="flex items-center gap-2 text-gray-500 mb-2">
                    <Calendar size={14} className="text-gray-400 shrink-0" />
                    <span className="text-[12px]">{programme.schedule}</span>
                  </div>
                  
                  {/* 3. Price meta */}
                  <div className="flex items-center gap-2 text-gray-500 mb-3">
                    <Tag size={14} className="text-gray-400 shrink-0" />
                    <span className="text-[12px]">{programme.price}</span>
                  </div>
                  
                  {/* 4. Fill rate section */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-gray-400">Fill rate</span>
                      <span 
                        className="text-[13px] font-medium"
                        style={{ color: isFull ? '#0077CC' : getFillValueColor() }}
                      >
                        {isFull ? '100% full' : `${Math.round(fillPercentage)}% full`}
                      </span>
                    </div>
                    <div className="h-[6px] bg-gray-100 rounded-full overflow-hidden mb-1.5">
                      <div 
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${fillPercentage}%`,
                          backgroundColor: isFull ? '#0077CC' : getBarColor()
                        }}
                      />
                    </div>
                    <p 
                      className="text-[11px]"
                      style={{ color: isFull ? '#0077CC' : getSpotsTextColor() }}
                    >
                      {isFull 
                        ? `All ${programme.spotsTotal} spots filled · open a new cohort?`
                        : `${programme.spotsFilled} / ${programme.spotsTotal} spots filled · ${spotsRemaining} remaining`
                      }
                    </p>
                  </div>
                  
                  {/* 5. Price + chevron row */}
                  <div className="flex items-center justify-between pt-2 border-t-[0.5px] border-gray-100">
                    <span className="text-[16px] font-bold text-gray-900">{programme.price.split(' ')[0]}</span>
                    <ChevronRight size={20} className="text-gray-400" />
                  </div>
                </div>
                
                {/* CF-D05 CHANGE 4: Quick action row */}
                <div className="border-t-[0.5px] border-gray-100 px-4 py-2 flex gap-2 bg-white">
                  {isDraft ? (
                    // Draft programme actions
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Publish action
                        }}
                        className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center hover:bg-[#0066AA] transition-all duration-150"
                      >
                        Publish
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Edit action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Delete action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-red-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
                      >
                        Delete
                      </button>
                    </>
                  ) : isFull ? (
                    // Full programme actions
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Open new cohort action
                        }}
                        className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center hover:bg-[#0066AA] transition-all duration-150"
                      >
                        Open new cohort ↗
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Duplicate action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Duplicate
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Manage action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Manage →
                      </button>
                    </>
                  ) : (
                    // Active (not full) programme actions
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Promote action
                        }}
                        className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center hover:bg-[#0066AA] transition-all duration-150"
                      >
                        Promote ↗
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Duplicate action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Duplicate
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Manage action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Manage →
                      </button>
                    </>
                  )}
                </div>
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
