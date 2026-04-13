'use client'

import React from 'react'
import { CheckCircle2, Building2, FileText, Info, ExternalLink, ChevronRight } from 'lucide-react'

export function GetPaid() {
  return (
    <div className="min-h-screen flex justify-center font-sans p-6 lg:p-10" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-3xl flex flex-col gap-8 pb-20">
        
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-tight">Get Paid</h1>
        </div>

        {/* CF-D09 CHANGE 1: Stripe hero card with next payout prominent */}
        <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-6 shadow-sm flex flex-col gap-6">
          {/* Top row: Stripe Connected status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-[#635BFF] flex items-center justify-center shrink-0 shadow-sm">
                <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.98 40C31.0257 40 40 31.0457 40 20C40 8.9543 31.0257 0 19.98 0C8.9343 0 0 8.9543 0 20C0 31.0457 8.9343 40 19.98 40Z" fill="#635BFF"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M19.7891 16.5183C18.2325 16.5183 17.2023 17.2141 17.2023 18.2715C17.2023 19.1764 18.0649 19.6437 19.5539 20.0163L20.8091 20.3168C23.2372 20.8988 24.5901 22.0298 24.5901 24.1687C24.5901 27.2415 22.1769 28.8471 18.4239 28.8471C15.4227 28.8471 13.0644 27.6749 11.5173 26.069L13.7845 23.3644C15.1118 24.7865 16.7171 25.5456 18.5367 25.5456C20.2524 25.5456 21.3653 24.8198 21.3653 23.6335C21.3653 22.6186 20.4776 22.1105 18.6657 21.6669L17.5815 21.3917C14.881 20.7303 13.9189 19.5348 13.9189 17.4385C13.9189 14.5368 16.3262 13.0901 19.6083 13.0901C22.1643 13.0901 24.1205 13.9669 25.6888 15.2639L23.5184 18.069C22.2536 17.0673 20.9324 16.5183 19.7891 16.5183Z" fill="white"/>
                </svg>
              </div>
              <div>
                {/* CF-D09 CHANGE 1: Green dot + Stripe Connected */}
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                  <span className="text-[13px] font-medium text-gray-900">Stripe Connected</span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">Payouts to ****4242 · Lloyds Bank</div>
              </div>
            </div>
          </div>

          {/* CF-D09 CHANGE 1: Main section with next payout prominent */}
          <div className="border-t-[0.5px] border-gray-100 pt-3.5">
            <div className="flex items-start gap-8 md:gap-12">
              {/* Left: Next payout (primary) */}
              <div className="flex-1">
                <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Next payout</div>
                <div className="text-[28px] font-medium text-[#0077CC] mb-1">£90.00</div>
                <div className="text-[12px] text-gray-500">Releasing 10 Apr · in 2 days</div>
              </div>
              
              {/* Right: Total earned (secondary) */}
              <div className="flex-1">
                <div className="text-[11px] text-gray-400 mb-1.5">Total earned</div>
                <div className="text-[20px] font-medium text-gray-900">£1,240.00</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* CF-D09 CHANGE 2: Payout timeline card */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="mb-3">
            <h3 className="text-[13px] font-medium text-gray-900">How payouts work</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Money moves automatically — here's the journey</p>
          </div>
          
          {/* 3-step timeline */}
          <div className="flex items-center w-full mb-3">
            {/* Step 1: Done */}
            <div className="flex flex-col items-center">
              <div className="w-[26px] h-[26px] rounded-full bg-[#DCFCE7] text-[#166534] flex items-center justify-center text-[14px] font-medium">
                ✓
              </div>
              <div className="text-[9px] text-gray-500 text-center mt-1.5 leading-tight" style={{ maxWidth: '70px' }}>
                Session completed
              </div>
            </div>
            
            {/* Connecting line 1 */}
            <div className="flex-1 h-[1.5px] bg-[#86EFAC] mx-2" />
            
            {/* Step 2: Active */}
            <div className="flex flex-col items-center">
              <div className="w-[26px] h-[26px] rounded-full bg-[#0077CC] text-white flex items-center justify-center text-[14px] font-medium">
                ⟳
              </div>
              <div className="text-[9px] text-[#0077CC] font-medium text-center mt-1.5 leading-tight" style={{ maxWidth: '70px' }}>
                48hr processing
              </div>
            </div>
            
            {/* Connecting line 2 */}
            <div className="flex-1 h-[1.5px] bg-[#E2E8F0] mx-2" />
            
            {/* Step 3: Future */}
            <div className="flex flex-col items-center">
              <div className="w-[26px] h-[26px] rounded-full bg-[#F1F5F9] text-[#94A3B8] flex items-center justify-center text-[14px] font-medium">
                £
              </div>
              <div className="text-[9px] text-gray-400 text-center mt-1.5 leading-tight" style={{ maxWidth: '70px' }}>
                Released to bank
              </div>
            </div>
          </div>
          
          {/* Reassurance note */}
          <div className="bg-[#F0F7FF] rounded-lg px-3 py-2.5">
            <p className="text-[11px] text-[#0C447C] leading-relaxed">
              The 48-hour delay protects both coaches and parents — it gives time to resolve any issues before money moves.
            </p>
          </div>
        </div>

        {/* CF-D09 CHANGE 3: Upcoming payouts list with cleaner rows */}
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-bold text-gray-900">Upcoming payouts</h2>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm flex flex-col">
            <div className="px-4 py-3 flex items-center justify-between border-b-[0.5px] border-gray-100 hover:bg-gray-50 transition-all duration-100">
              <div>
                <div className="text-[13px] font-medium text-gray-900">Thu 10 Apr</div>
                <div className="text-[11px] text-gray-400 mt-0.5">2 sessions · releasing in 2 days</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="text-[14px] font-medium text-gray-900">£90.00</div>
                <div className="px-2 py-0.5 bg-[#DCFCE7] text-[#166534] text-[10px] font-medium rounded-full">
                  Scheduled
                </div>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-all duration-100">
              <div>
                <div className="text-[13px] font-medium text-gray-900">Sat 12 Apr</div>
                <div className="text-[11px] text-gray-400 mt-0.5">1 session · releasing in 4 days</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="text-[14px] font-medium text-gray-900">£45.00</div>
                <div className="px-2 py-0.5 bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium rounded-full">
                  Pending
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CF-D09 CHANGE 4: Payout account card with balanced CTA */}
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-bold text-gray-900">Payout account</h2>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                  <Building2 size={20} className="text-gray-600" />
                </div>
                <div>
                  <div className="text-[16px] font-bold text-gray-900">Lloyds Bank</div>
                  <div className="text-[14px] text-gray-500 mt-0.5">Account ending ****4242</div>
                </div>
              </div>
              {/* CF-D09 CHANGE 4: Smaller, right-aligned secondary button */}
              <button className="px-4 py-1.5 rounded-full border border-gray-200 bg-white text-gray-700 text-[12px] font-medium hover:bg-gray-50 transition-colors outline-none shrink-0">
                Update bank account
              </button>
            </div>
          </div>
        </div>

        {/* CF-D09 CHANGE 5: Tax section with polish */}
        <div className="flex flex-col gap-4 mt-6">
          <h2 className="text-[18px] font-bold text-gray-900">Tax</h2>
          <div className="bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
            <button className="w-full px-4 py-3 flex items-center gap-3 border-b-[0.5px] border-gray-100 hover:bg-gray-50 transition-colors text-left group">
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                <FileText size={16} className="text-gray-600" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-gray-900">Annual earnings summary</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Download your tax summary for 2025–26</div>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-400 shrink-0" />
            </button>
            <button className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left group">
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                <Info size={16} className="text-gray-600" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-gray-900">Self-assessment guidance</div>
                <div className="text-[11px] text-gray-400 mt-0.5">HMRC resources for self-employed coaches</div>
              </div>
              <ChevronRight size={18} className="text-gray-300 group-hover:text-gray-400 shrink-0" />
            </button>
          </div>
        </div>

        <div className="mt-2">
          <button className="flex gap-4 p-4 items-start text-left hover:bg-white rounded-xl transition-colors group w-full max-w-lg">
            <div className="shrink-0 mt-0.5 text-[#0077CC]"><ExternalLink size={20} /></div>
            <div>
              <div className="text-[16px] font-bold text-[#0077CC] group-hover:underline">Manage Stripe account →</div>
              <div className="text-[13px] text-gray-500 mt-1">View detailed payouts, invoices and settings on Stripe</div>
            </div>
          </button>
        </div>

      </div>
    </div>
  )
}
