'use client'

import React from 'react'
import { MapPin, Calendar } from 'lucide-react'

interface PublicProfilePreviewProps {
  displayName?: string
  role?: string
  baseLocation?: string
  availability?: string
  price?: string
  hasDBS?: boolean
}

export function PublicProfilePreview({
  displayName = '',
  role = 'Cricket Coach',
  baseLocation = 'London',
  availability = 'Mon, Wed, Fri',
  price = '50',
  hasDBS = true
}: PublicProfilePreviewProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      {/* Avatar row - horizontal layout */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 bg-[#E6F1FB] rounded-full flex items-center justify-center text-[14px] font-medium text-[#0C447C] shrink-0" style={{ boxShadow: '0 0 0 2px #E6F1FB' }}>
          {displayName ? displayName.substring(0, 2).toUpperCase() : 'AJ'}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium text-gray-900 truncate">
            {displayName || <span className="text-gray-300">Your name</span>}
          </h3>
          <p className="text-[12px] text-gray-400 mt-0.5">{role}</p>
        </div>
      </div>
      
      {/* Stars + rating */}
      <div className="flex items-center gap-1 mb-2">
        {[1,2,3,4,5].map(i => (
          <span key={i} className="text-amber-500 text-[11px]">★</span>
        ))}
        <span className="text-[11px] text-gray-400 ml-0.5">New coach</span>
      </div>
      
      {/* Meta rows */}
      <div className="space-y-1.5 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <MapPin size={12} className="shrink-0" />
          <span>{baseLocation}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <Calendar size={12} className="shrink-0" />
          <span>{availability}</span>
        </div>
      </div>
      
      {/* Price */}
      <p className="text-[16px] font-medium text-gray-900 mb-2">from £{price} / session</p>
      
      {/* DBS badge */}
      {hasDBS && (
        <div className="inline-block px-2 py-0.5 bg-[#E0F6F8] text-[#006677] text-[10px] font-medium rounded-full mb-2.5">
          ✓ DBS checked
        </div>
      )}
      
      {/* Book button */}
      <button className="w-full bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full py-2.5 text-[12px] font-medium transition-colors">
        Book a session
      </button>
    </div>
  )
}
