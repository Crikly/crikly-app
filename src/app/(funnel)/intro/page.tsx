'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, Volume2, VolumeX, RotateCcw, ArrowRight } from 'lucide-react'

function fmt(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const CTRL_BTN = {
  width: '32px',
  height: '32px',
  background: 'transparent',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  borderRadius: '8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const

export default function ParentPlayerIntroPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoError, setVideoError] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showEndCta, setShowEndCta] = useState(false)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const showPlayPulse = !isPlaying && currentTime === 0 && !showEndCta

  // Auto-play muted ~600ms after mount
  useEffect(() => {
    if (videoError) return
    const t = setTimeout(() => {
      videoRef.current?.play().catch(() => {})
    }, 600)
    return () => clearTimeout(t)
  }, [videoError])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (showEndCta) setShowEndCta(false)
    v.paused ? v.play().catch(() => {}) : v.pause()
  }

  function toggleMute() {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setIsMuted(v.muted)
  }

  function handleRestart() {
    const v = videoRef.current
    if (!v) return
    setShowEndCta(false)
    v.currentTime = 0
    v.play().catch(() => {})
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const v = videoRef.current
    if (!v || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    v.currentTime = Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration))
    setShowEndCta(false)
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#0F172A', color: '#fff' }}>

      {/* Logo */}
      <header className="absolute top-0 left-0 right-0 z-10" style={{ padding: '24px 32px' }}>
        <span
          className="font-bold select-none leading-none"
          style={{ fontSize: '22px', letterSpacing: '-0.035em', color: '#fff' }}
        >
          crikl<span style={{ color: '#378ADD' }}>y</span>
        </span>
      </header>

      {/* Stage */}
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ padding: '96px 24px 64px' }}
      >
        <div className="w-full flex flex-col" style={{ maxWidth: '800px', gap: '18px' }}>

          {/* Video frame */}
          <div
            className="relative w-full overflow-hidden"
            style={{
              aspectRatio: '16 / 9',
              background: '#000',
              borderRadius: '14px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Gradient bg — teal/brand reversed vs coach screen */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse at 70% 30%, rgba(0,153,170,0.22), transparent 60%),' +
                  'radial-gradient(ellipse at 25% 75%, rgba(0,119,204,0.20), transparent 60%),' +
                  '#0a0f18',
              }}
            />

            {/* Video element */}
            {!videoError && (
              <video
                ref={videoRef}
                src="/videos/parent-intro.mp4"
                className="absolute inset-0 w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                onError={() => setVideoError(true)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setShowEndCta(true)}
              />
            )}

            {/* Placeholder label */}
            {videoError && (
              <div
                className="absolute left-0 right-0 text-center font-medium"
                style={{
                  bottom: '64px',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '12px',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Parent / player intro · video placeholder
              </div>
            )}

            {/* Skip button */}
            <button
              onClick={() => router.push('/home')}
              className="absolute z-20 inline-flex items-center font-medium"
              style={{
                top: '16px',
                right: '16px',
                gap: '6px',
                height: '34px',
                padding: '0 14px',
                background: 'rgba(15,23,42,0.55)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                borderRadius: '999px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Skip intro
              <ArrowRight size={12} strokeWidth={2.4} />
            </button>

            {/* Play pulse */}
            {(showPlayPulse || videoError) && (
              <div
                className="absolute inset-0 flex items-center justify-center z-10"
                onClick={videoError ? undefined : togglePlay}
                style={{ cursor: videoError ? 'default' : 'pointer' }}
              >
                <div
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: '88px',
                    height: '88px',
                    background: 'rgba(255,255,255,0.95)',
                    color: '#0F172A',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
                  }}
                >
                  <Play size={32} fill="currentColor" stroke="none" />
                </div>
              </div>
            )}

            {/* End-of-video CTA overlay — fades in when video ends */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center"
              style={{
                gap: '18px',
                padding: '24px',
                background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.75))',
                opacity: showEndCta ? 1 : 0,
                pointerEvents: showEndCta ? 'auto' : 'none',
                transition: 'opacity 350ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <h3
                className="font-medium m-0"
                style={{
                  color: '#fff',
                  fontSize: 'clamp(18px, 3vw, 22px)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.3,
                  maxWidth: '380px',
                }}
              >
                Ready to find a coach near you?
              </h3>
              <button
                onClick={() => router.push('/home')}
                className="inline-flex items-center font-medium"
                style={{
                  gap: '8px',
                  height: '52px',
                  padding: '0 28px',
                  background: '#0077CC',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '15px',
                  cursor: 'pointer',
                }}
              >
                Explore Crikly
                <ArrowRight size={14} strokeWidth={2.4} />
              </button>
            </div>

            {/* Controls bar */}
            {!videoError && (
              <div
                className="absolute left-0 right-0 bottom-0 z-10 flex flex-col"
                style={{
                  padding: '14px 18px 16px',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0))',
                  gap: '8px',
                }}
              >
                <div
                  className="rounded-full overflow-hidden cursor-pointer"
                  style={{ height: '4px', background: 'rgba(255,255,255,0.2)' }}
                  onClick={handleSeek}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: '#0077CC',
                      transition: 'width 100ms linear',
                    }}
                  />
                </div>

                <div className="flex items-center" style={{ gap: '14px' }}>
                  <button
                    style={CTRL_BTN}
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying
                      ? <Pause size={18} fill="currentColor" stroke="none" />
                      : <Play size={18} fill="currentColor" stroke="none" />}
                  </button>

                  <button
                    style={CTRL_BTN}
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>

                  <span
                    className="tabular-nums"
                    style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}
                  >
                    {fmt(currentTime)} / {duration > 0 ? fmt(duration) : '0:30'}
                  </span>

                  <div style={{ flex: 1 }} />

                  <button
                    style={CTRL_BTN}
                    onClick={handleRestart}
                    aria-label="Restart"
                  >
                    <RotateCcw size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Progress note */}
          <p className="text-center m-0" style={{ color: '#94A3B8', fontSize: '12px' }}>
            Discover how Crikly works for you.
          </p>
        </div>
      </main>
    </div>
  )
}
