'use client'
import React, { useState, useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'

// CF-D08: Register Chart.js components
Chart.register(...registerables)

type Period = 'This week' | 'This month' | 'All time'
// CF-D08 CHANGE 4: Enhanced transaction interface
interface Transaction { 
  id: string; 
  date: string; 
  name: string; 
  amount: string;
  type: 'solo' | 'group';
  meta: string;
  sport: string;
}

export function Earnings() {
  const [period, setPeriod] = useState<Period>('This month')
  // CF-D08 CHANGE 4: Enhanced transaction data with type and meta
  const transactions: Transaction[] = [
    { id: '1', date: 'Tue 8 Apr', name: 'James Okafor', amount: '+£45.00', type: 'solo', meta: 'Tue 8 Apr · Cricket · 1-on-1', sport: 'Cricket' },
    { id: '2', date: 'Sat 5 Apr', name: 'Junior Cricket Foundations', amount: '+£95.00', type: 'group', meta: 'Sat 5 Apr · Group · 6 players', sport: 'Cricket' },
    { id: '3', date: 'Thu 3 Apr', name: 'Marcus Trent', amount: '+£49.50', type: 'solo', meta: 'Thu 3 Apr · Cricket · 1-on-1', sport: 'Cricket' },
    { id: '4', date: 'Sun 30 Mar', name: 'Advanced Batting Masterclass', amount: '+£228.00', type: 'group', meta: 'Sun 30 Mar · Group · 8 players', sport: 'Cricket' }
  ]
  const periods: Period[] = ['This week', 'This month', 'All time']
  
  // CF-D08 CHANGE 2: Chart.js ref and setup
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstanceRef = useRef<Chart | null>(null)
  
  useEffect(() => {
    if (!chartRef.current) return
    
    // Destroy existing chart instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy()
    }
    
    const ctx = chartRef.current.getContext('2d')
    if (!ctx) return
    
    // CF-D08 CHANGE 2: 7-day earnings chart
    const chartData = [49.5, 95, 45, 90, 228, 120, 0]
    const peakIndex = chartData.indexOf(Math.max(...chartData))
    
    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['1 Apr', '5 Apr', '8 Apr', '10 Apr', '12 Apr', '15 Apr', '18 Apr'],
        datasets: [{
          data: chartData,
          backgroundColor: chartData.map((_, i) => i === peakIndex ? '#0077CC' : '#B5D4F4'),
          borderRadius: 3,
          barThickness: 24
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `£${context.parsed.y}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#F1F5F9' },
            ticks: {
              font: { size: 10 },
              color: '#9CA3AF',
              callback: (value) => `£${value}`
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10 },
              color: '#9CA3AF'
            }
          }
        }
      }
    })
    
    // Cleanup on unmount
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
      }
    }
  }, [period])

  return (
    <div className="min-h-screen font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto min-h-screen relative flex flex-col pb-12">
        <div className="px-5 pt-8 pb-4 sticky top-0 z-10">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Earnings</h1>
        </div>
        <div className="px-5 space-y-8">
          <div className="flex items-center gap-2">
            {periods.map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 rounded-full text-[14px] font-bold transition-colors ${period === p ? 'bg-[#0077CC] text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>{p}</button>
            ))}
          </div>
          {/* CF-D08 CHANGE 1: Hero card with trend badge */}
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden">
            <div className="p-8 pb-6 flex flex-col items-center justify-center text-center relative">
              {/* CF-D08 CHANGE 1A: Trend badge top-right */}
              <div className="absolute top-6 right-6 px-2.5 py-1 bg-[#DCFCE7] text-[#166534] text-[11px] font-medium rounded-full">
                ▲ +12% vs last month
              </div>
              <div className="text-[36px] font-bold text-[#0077CC] tracking-tight leading-none">£1,240.00</div>
              <div className="text-[13px] text-gray-500 font-medium mt-2">Total earned · April 2026</div>
            </div>
            {/* CF-D08 CHANGE 1B & 1C: Stats strip with emphasized avg and dividers */}
            <div className="border-t border-gray-100 flex">
              <div className="flex-1 py-4 text-center px-2">
                <div className="text-[18px] font-bold text-gray-900">18</div>
                <div className="text-[12px] text-gray-500 font-medium mt-0.5">Sessions</div>
              </div>
              {/* CF-D08 CHANGE 1C: Vertical divider */}
              <div className="w-[0.5px] bg-gray-100" style={{ height: '80%', alignSelf: 'center' }} />
              <div className="flex-1 py-4 text-center px-2">
                {/* CF-D08 CHANGE 1B: Emphasized avg per session */}
                <div className="text-[22px] font-bold text-[#0077CC]">£68.89</div>
                <div className="text-[12px] text-gray-500 font-medium mt-0.5">Avg per session</div>
                <div className="text-[10px] text-[#0077CC] font-medium mt-1">↑ vs £62 last month</div>
              </div>
              {/* CF-D08 CHANGE 1C: Vertical divider */}
              <div className="w-[0.5px] bg-gray-100" style={{ height: '80%', alignSelf: 'center' }} />
              <div className="flex-1 py-4 text-center px-2">
                <div className="text-[18px] font-bold text-gray-900">2</div>
                <div className="text-[12px] text-gray-500 font-medium mt-0.5">Pending payout</div>
              </div>
            </div>
          </div>
          
          {/* CF-D08 CHANGE 2: 7-day earnings chart */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-medium text-gray-900">Earnings this month</h3>
              <span className="text-[11px] font-medium text-[#0077CC]">Best day: Saturday</span>
            </div>
            <div style={{ height: '120px' }}>
              <canvas ref={chartRef} />
            </div>
          </div>
          {/* CF-D08 CHANGE 3: Payout card with 3-step timeline */}
          <div className="space-y-3">
            <h2 className="text-[16px] font-bold text-gray-900 px-1">Upcoming payout</h2>
            <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[18px] font-bold text-[#0077CC]">£90.00</span>
                <span className="text-[14px] text-gray-500 font-medium">Released 10 Apr</span>
              </div>
              
              {/* CF-D08 CHANGE 3: 3-step horizontal timeline */}
              <div className="flex items-center w-full">
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
            </div>
          </div>
          {/* CF-D08 CHANGE 4: Transactions with type icon + richer meta */}
          <div className="space-y-3">
            <h2 className="text-[16px] font-bold text-gray-900 px-1">Recent transactions</h2>
            <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden">
              <div className="flex flex-col divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <div key={tx.id} className="p-4 px-5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                    {/* CF-D08 CHANGE 4: Type icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-medium ${
                      tx.type === 'solo' 
                        ? 'bg-[#E6F1FB] text-[#0C447C]' 
                        : 'bg-[#EDE9FE] text-[#4C1D95]'
                    }`}>
                      {tx.type === 'solo' ? '1:1' : 'GRP'}
                    </div>
                    
                    {/* CF-D08 CHANGE 4: Content with richer meta */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-gray-900 truncate">{tx.name}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5 truncate">{tx.meta}</div>
                    </div>
                    
                    {/* Amount */}
                    <div className="text-[12px] font-medium text-[#166534] shrink-0">{tx.amount}</div>
                  </div>
                ))}
              </div>
              
              {/* CF-D08 CHANGE 4: View all link at bottom */}
              <div className="border-t-[0.5px] border-gray-100 py-2.5 px-4 text-center">
                <button className="text-[11px] font-medium text-[#0077CC] hover:text-[#0066AA] transition-colors">
                  View all transactions →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
