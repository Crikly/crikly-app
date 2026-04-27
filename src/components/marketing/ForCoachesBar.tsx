'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { InterestForm } from './InterestForm'

export function ForCoachesBar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <InterestForm
          mode="modal"
          onClose={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      )}
      <div
        className="flex items-center justify-between"
        style={{
          background: '#F8FAFC',
          borderTop: '1px solid #F1F5F9',
          padding: '20px 40px',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="font-medium" style={{ fontSize: '14px', color: '#0F172A' }}>
            Are you a coach?
          </div>
          <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
            Free to list. We bring the bookings. You focus on coaching.
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center font-medium flex-shrink-0"
          style={{
            height: '44px',
            padding: '0 20px',
            background: '#0077CC',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            cursor: 'pointer',
            gap: '6px',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#005EA3')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '#0077CC')}
        >
          Register your interest
          <ArrowRight size={14} strokeWidth={2.4} />
        </button>
      </div>
    </>
  )
}
