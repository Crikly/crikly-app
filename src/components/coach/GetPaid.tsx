'use client'

import React from 'react'
import { CheckCircle2, Building2, FileText, Info, ExternalLink, ChevronRight } from 'lucide-react'

export function GetPaid() {
  return (
    <div className="min-h-screen bg-gray-50/50 flex justify-center font-sans p-6 lg:p-10" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-3xl flex flex-col gap-8 pb-20">
        
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-tight">Get Paid</h1>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-6 shadow-sm flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-[#635BFF] flex items-center justify-center shrink-0 shadow-sm">
                <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.98 40C31.0257 40 40 31.0457 40 20C40 8.9543 31.0257 0 19.98 0C8.9343 0 0 8.9543 0 20C0 31.0457 8.9343 40 19.98 40Z" fill="#635BFF"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M19.7891 16.5183C18.2325 16.5183 17.2023 17.2141 17.2023 18.2715C17.2023 19.1764 18.0649 19.6437 19.5539 20.0163L20.8091 20.3168C23.2372 20.8988 24.5901 22.0298 24.5901 24.1687C24.5901 27.2415 22.1769 28.8471 18.4239 28.8471C15.4227 28.8471 13.0644 27.6749 11.5173 26.069L13.7845 23.3644C15.1118 24.7865 16.7171 25.5456 18.5367 25.5456C20.2524 25.5456 21.3653 24.8198 21.3653 23.6335C21.3653 22.6186 20.4776 22.1105 18.6657 21.6669L17.5815 21.3917C14.881 20.7303 13.9189 19.5348 13.9189 17.4385C13.9189 14.5368 16.3262 13.0901 19.6083 13.0901C22.1643 13.0901 24.1205 13.9669 25.6888 15.2639L23.5184 18.069C22.2536 17.0673 20.9324 16.5183 19.7891 16.5183Z" fill="white"/>
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#15803D] font-bold text-[16px]">Stripe Connected</span>
                  <CheckCircle2 size={18} className="text-[#15803D]" />
                </div>
                <div className="text-[14px] text-gray-500 mt-0.5">Payouts to ****4242 · Lloyds Bank</div>
              </div>
            </div>
          </div>

          <hr className="border-[#E2E8F0]" />

          <div className="flex items-center gap-12 md:gap-16">
            <div>
              <div className="text-[24px] font-bold text-[#0077CC]">£1,240.00</div>
              <div className="text-[13px] text-gray-500 mt-0.5">Total earned</div>
            </div>
            <div>
              <div className="text-[24px] font-bold text-[#0077CC]">£90.00</div>
              <div className="text-[13px] text-gray-500 mt-0.5">Next payout · 10 Apr</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-bold text-gray-900">Upcoming payouts</h2>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm flex flex-col">
            <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#E2E8F0]">
              <div className="flex flex-col items-start">
                <div className="text-[16px] font-bold text-gray-900">Thu 10 Apr</div>
                <div className="text-[14px] text-gray-500 mt-0.5 mb-2">2 sessions · 48hr delay</div>
                <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#DCFCE7] text-[#15803D] text-[12px] font-bold tracking-wide">Scheduled</div>
              </div>
              <div className="text-[20px] font-bold text-[#0077CC] sm:text-right">£90.00</div>
            </div>
            <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex flex-col items-start">
                <div className="text-[16px] font-bold text-gray-900">Sat 12 Apr</div>
                <div className="text-[14px] text-gray-500 mt-0.5 mb-2">1 session · 48hr delay</div>
                <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#F3F4F6] text-[#6B7280] text-[12px] font-bold tracking-wide">Pending</div>
              </div>
              <div className="text-[20px] font-bold text-[#0077CC] sm:text-right">£45.00</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-bold text-gray-900">Payout account</h2>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                <Building2 size={20} className="text-gray-600" />
              </div>
              <div>
                <div className="text-[16px] font-bold text-gray-900">Lloyds Bank</div>
                <div className="text-[14px] text-gray-500 mt-0.5">Account ending ****4242</div>
              </div>
            </div>
            <button className="w-full py-3 rounded-full border-2 border-[#0077CC] text-[#0077CC] font-bold text-[15px] hover:bg-[#EFF6FF] transition-colors outline-none">
              Update bank account
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-bold text-gray-900">Tax</h2>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm flex flex-col overflow-hidden">
            <button className="w-full p-5 flex items-center gap-4 border-b border-[#E2E8F0] hover:bg-gray-50 transition-colors text-left group">
              <div className="w-10 h-10 rounded-full bg-[#EFF6FF] flex items-center justify-center shrink-0">
                <FileText size={20} className="text-[#0077CC]" />
              </div>
              <div className="flex-1">
                <div className="text-[16px] font-bold text-gray-900">Annual earnings summary</div>
                <div className="text-[13px] text-gray-500 mt-0.5">Download your tax summary for 2025–26</div>
              </div>
              <ChevronRight size={20} className="text-gray-400 group-hover:text-gray-600 shrink-0" />
            </button>
            <button className="w-full p-5 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left group">
              <div className="w-10 h-10 rounded-full bg-[#EFF6FF] flex items-center justify-center shrink-0">
                <Info size={20} className="text-[#0077CC]" />
              </div>
              <div className="flex-1">
                <div className="text-[16px] font-bold text-gray-900">Self-assessment guidance</div>
                <div className="text-[13px] text-gray-500 mt-0.5">HMRC resources for self-employed coaches</div>
              </div>
              <ChevronRight size={20} className="text-gray-400 group-hover:text-gray-600 shrink-0" />
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
