'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { InterestForm } from './InterestForm'

export function MarketingNav() {
  const [showInterest, setShowInterest] = useState(false)

  return (
    <>
      {showInterest && (
        <InterestForm
          mode="modal"
          onClose={() => setShowInterest(false)}
        />
      )}

      <nav
        className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-100"
        style={{
          height: '60px',
          padding: '0 40px',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'saturate(140%) blur(8px)',
          WebkitBackdropFilter: 'saturate(140%) blur(8px)',
        }}
      >
        <div>
          <Link href="/home" style={{ textDecoration: 'none' }}>
            <Image
              src="/logo.png"
              alt="Crikly"
              height={44}
              width={120}
              priority
              style={{ display: 'block' }}
            />
          </Link>
        </div>

        <div className="flex items-center" style={{ gap: '8px' }}>
          <Link
            href="#how"
            className="hidden md:block font-medium"
            style={{
              color: '#475569',
              fontSize: '14px',
              textDecoration: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              transition: 'color 150ms, background 150ms',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.color = '#0F172A'
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#F8FAFC'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.color = '#475569'
              ;(e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
            }}
          >
            How it works
          </Link>
          <Link
            href="/for-coaches"
            className="hidden md:block font-medium"
            style={{
              color: '#475569',
              fontSize: '14px',
              textDecoration: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              transition: 'color 150ms, background 150ms',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.color = '#0F172A'
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#F8FAFC'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.color = '#475569'
              ;(e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
            }}
          >
            For coaches
          </Link>

          <button
            onClick={() => setShowInterest(true)}
            className="font-medium"
            style={{
              height: '40px',
              padding: '0 16px',
              fontSize: '14px',
              background: '#fff',
              color: '#0077CC',
              border: '1.5px solid #0077CC',
              borderRadius: '10px',
              cursor: 'pointer',
              marginLeft: '4px',
              transition: 'background 150ms',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#E6F3FB')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '#fff')}
          >
            Log in
          </button>
          <button
            onClick={() => setShowInterest(true)}
            className="font-medium"
            style={{
              height: '40px',
              padding: '0 18px',
              fontSize: '14px',
              background: '#0077CC',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              transition: 'background 150ms',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#005EA3')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '#0077CC')}
          >
            Register interest
          </button>
        </div>
      </nav>
    </>
  )
}
