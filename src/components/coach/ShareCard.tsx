'use client'
// CF-PROG-SHARE-CARD: visual share card rendered to PNG via html-to-image.
//
// INLINE STYLES ONLY — html-to-image traverses the live DOM, and external
// stylesheets (Tailwind) sometimes fail to inline cleanly into the captured
// SVG/canvas. Inline styles make the captured image pixel-stable across
// browsers and across the modal preview vs. downloaded PNG. The design
// system token rule is explicitly carved out for this file.
//
// All hex colours below trace back to the design system tokens:
//   #0077CC = brand-600, #004A80 ≈ deep brand, #BFDBFE = brand-100,
//   #0F172A = neutral-900, #4ADE80 = success green (Tailwind built-in).
import React, { forwardRef } from 'react'
import { Calendar, Clock } from 'lucide-react'

export interface ShareCardProps {
  title: string
  imageUrl: string | null
  sportName: string
  schedule: string          // e.g. "Every Sat · 10:00 – 11:00"
  startDate: string         // e.g. "Starting Sat 7 Jun 2026" or '' to omit
  priceLabel: string        // e.g. "£80 per session"
  coachName: string
  spotsLeft: number
  maxSpots: number
  displayShareUrl: string   // shorthand visual, e.g. "crikly.app/lasith"
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  {
    title,
    imageUrl,
    sportName,
    schedule,
    startDate,
    priceLabel,
    coachName,
    spotsLeft,
    maxSpots,
    displayShareUrl,
  },
  ref,
) {
  const hasPhoto = !!imageUrl

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        aspectRatio: '13 / 16',
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: '#FFFFFF',
        backgroundColor: '#0F172A',
      }}
    >
      {hasPhoto ? (
        <img
          src={imageUrl as string}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #0077CC 0%, #004A80 100%)',
          }}
        />
      )}

      {/* Overlay — darker bottom on photo, gentler on gradient fallback */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: hasPhoto
            ? 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.75) 100%)'
            : 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.35) 100%)',
        }}
      />

      {/* Content layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          color: '#FFFFFF',
        }}
      >
        {/* Top row — wordmark + sport badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: '#FFFFFF',
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }}
          >
            crik
            <span style={{ color: '#BFDBFE' }}>ly</span>
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.85)',
              color: '#0F172A',
              padding: '4px 11px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            {sportName}
          </div>
        </div>

        {/* Bottom column — title + meta + footer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h3
            style={{
              margin: '0 0 4px',
              fontSize: 22,
              lineHeight: 1.15,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              maxWidth: 320,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textShadow: '0 1px 6px rgba(0,0,0,0.35)',
            }}
          >
            {title}
          </h3>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            <Calendar size={13} strokeWidth={2} />
            <span>{schedule}</span>
          </div>

          {startDate && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              <Clock size={13} strokeWidth={2} />
              <span>{startDate}</span>
            </div>
          )}

          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#FFFFFF',
              marginTop: 2,
            }}
          >
            {priceLabel}
          </div>

          <div
            style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 6,
            }}
          >
            by {coachName}
          </div>

          {/* Foot row — spots pill + url */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(255,255,255,0.18)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.25)',
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                color: '#FFFFFF',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: '#4ADE80',
                }}
              />
              {spotsLeft} of {maxSpots} spots left
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.65)',
                fontWeight: 500,
              }}
            >
              {displayShareUrl}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})
