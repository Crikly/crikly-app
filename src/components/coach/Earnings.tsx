'use client'
import React, { useState } from 'react'

type Period = 'This week' | 'This month' | 'All time'
interface Transaction { id: string; date: string; name: string; amount: string }

export function Earnings() {
  const [period, setPeriod] = useState<Period>('This month')
  const transactions: Transaction[] = [
    { id: '1', date: 'Tue 8 Apr', name: 'James Okafor · 1-on-1', amount: '+£45.00' },
    { id: '2', date: 'Sat 5 Apr', name: 'Junior Cricket Foundations · Group', amount: '+£95.00' },
    { id: '3', date: 'Thu 3 Apr', name: 'Marcus Trent · 1-on-1', amount: '+£49.50' },
    { id: '4', date: 'Sun 30 Mar', name: 'Advanced Batting Masterclass · Group', amount: '+£228.00' }
  ]
  const periods: Period[] = ['This week', 'This month', 'All time']

  return (
    <div className="min-h-screen bg-gray-50 font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto bg-gray-50 min-h-screen relative flex flex-col pb-12">
        <div className="px-5 pt-8 pb-4 bg-gray-50 sticky top-0 z-10">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Earnings</h1>
        </div>
        <div className="px-5 space-y-8">
          <div className="flex items-center gap-2">
            {periods.map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-full text-[14px] font-bold transition-colors ${period === p ? 'bg-[#0077CC] text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>{p}</button>
            ))}
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden">
            <div className="p-8 pb-6 flex flex-col items-center justify-center text-center">
              <div className="text-[36px] font-bold text-[#0077CC] tracking-tight leading-none">£1,240.00</div>
              <div className="text-[13px] text-gray-500 font-medium mt-2">Total earned · April 2026</div>
            </div>
            <div className="border-t border-gray-100 flex">
              <div className="flex-1 py-4 text-center px-2"><div className="text-[18px] font-bold text-gray-900">18</div><div className="text-[12px] text-gray-500 font-medium mt-0.5">Sessions</div></div>
              <div className="w-px bg-gray-100 my-4" />
              <div className="flex-1 py-4 text-center px-2"><div className="text-[18px] font-bold text-gray-900">£68.89</div><div className="text-[12px] text-gray-500 font-medium mt-0.5">Avg per session</div></div>
              <div className="w-px bg-gray-100 my-4" />
              <div className="flex-1 py-4 text-center px-2"><div className="text-[18px] font-bold text-gray-900">2</div><div className="text-[12px] text-gray-500 font-medium mt-0.5">Pending payout</div></div>
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-[16px] font-bold text-gray-900 px-1">Upcoming payout</h2>
            <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
              <div className="flex items-center justify-between"><span className="text-[18px] font-bold text-[#0077CC]">£90.00</span><span className="text-[14px] text-gray-500 font-medium">Released 10 Apr</span></div>
            </div>
            <p className="text-[12px] text-gray-500 italic px-1">48-hour payout delay applies</p>
          </div>
          <div className="space-y-3">
            <h2 className="text-[16px] font-bold text-gray-900 px-1">Recent transactions</h2>
            <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden">
              <div className="flex flex-col divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <div key={tx.id} className="p-4 px-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="pr-4">
                      <div className="text-[12px] text-gray-500 font-medium mb-0.5">{tx.date}</div>
                      <div className="text-[14px] font-bold text-gray-900 leading-tight">{tx.name}</div>
                    </div>
                    <div className="text-[16px] font-bold text-[#15803D] shrink-0">{tx.amount}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-2 px-1"><button className="text-[14px] font-bold text-[#0077CC] hover:text-[#0066AA] transition-colors">View all transactions →</button></div>
          </div>
        </div>
      </div>
    </div>
  )
}
