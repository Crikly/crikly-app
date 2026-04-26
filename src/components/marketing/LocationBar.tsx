'use client'

import { useState } from 'react'
import { MapPin, X } from 'lucide-react'

export function LocationBar() {
  const [dismissed, setDismissed] = useState(false)
  const [status, setStatus] = useState<'idle' | 'granted'>('idle')

  if (dismissed || status === 'granted') return null

  function handleEnable() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      () => setStatus('granted'),
      () => setDismissed(true),
    )
  }

  return (
    <div
      className="flex items-center justify-center relative"
      style={{
        padding: '8px 24px',
        background: '#F0FDFE',
        color: '#164E63',
        fontSize: '12px',
        borderBottom: '1px solid #d4eef0',
        gap: '10px',
      }}
    >
      <MapPin size={14} strokeWidth={2} />
      <span>Allow location access to find coaches near you</span>
      <button
        onClick={handleEnable}
        className="font-semibold"
        style={{
          marginLeft: '6px',
          color: '#164E63',
          textDecoration: 'underline',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '12px',
          padding: 0,
        }}
      >
        Enable
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute inline-flex items-center justify-center"
        style={{
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          color: '#164E63',
          cursor: 'pointer',
          opacity: 0.7,
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLButtonElement).style.opacity = '1'
          ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,119,121,0.08)'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.7'
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
        }}
      >
        <X size={12} strokeWidth={2.4} />
      </button>
    </div>
  )
}
