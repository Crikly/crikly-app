'use client'
// CF-PROG-SHARE-CARD: bottom-sheet modal that shows the ShareCard preview
// and offers WhatsApp + PNG download. Coach profile (slug + full_name) is
// fetched lazily on first open and cached in sessionStorage with a 5min TTL
// so subsequent shares within a session don't refetch.
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { X, Download, Loader2 } from 'lucide-react'
import { ShareCard } from './ShareCard'

// ── Types ──

export interface ShareCardModalProgramme {
  id: string
  title: string
  imageUrl: string | null
  sportName: string
  schedule: string          // pre-formatted display string
  startsAt: string | null   // 'YYYY-MM-DD' or null
  priceLabel: string        // pre-formatted display string
  spotsLeft: number
  maxSpots: number
}

export interface ShareCardModalProps {
  isOpen: boolean
  onClose: () => void
  programme: ShareCardModalProgramme
}

interface CoachShareMeta {
  id: string
  slug: string | null
  fullName: string
}

interface CoachShareMetaCacheEntry {
  value: CoachShareMeta
  storedAt: number
}

// ── Coach meta fetch + sessionStorage cache (5min TTL) ──

const COACH_META_KEY = 'crikly:coach-share-meta'
const COACH_META_TTL_MS = 5 * 60 * 1000

function readCoachMetaCache(): CoachShareMeta | null {
  try {
    const raw = sessionStorage.getItem(COACH_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CoachShareMetaCacheEntry
    if (!Number.isFinite(parsed.storedAt)) return null
    if (Date.now() - parsed.storedAt > COACH_META_TTL_MS) return null
    return parsed.value
  } catch {
    return null
  }
}

function writeCoachMetaCache(value: CoachShareMeta): void {
  try {
    const entry: CoachShareMetaCacheEntry = { value, storedAt: Date.now() }
    sessionStorage.setItem(COACH_META_KEY, JSON.stringify(entry))
  } catch {
    // non-critical
  }
}

async function fetchCoachMeta(): Promise<CoachShareMeta> {
  const res = await fetch('/api/coaches/profile')
  if (!res.ok) throw new Error('Failed to fetch coach profile')
  const data: { id: string; slug: string | null; full_name: string } = await res.json()
  return { id: data.id, slug: data.slug, fullName: data.full_name }
}

// ── Display helpers ──

function buildDisplaySlug(meta: CoachShareMeta): string {
  return meta.slug ?? meta.id.slice(0, 8)
}

function buildFullShareUrl(meta: CoachShareMeta, programmeId: string): string {
  return `https://crikly.app/coaches/${buildDisplaySlug(meta)}/programmes/${programmeId}`
}

function buildDisplayShareUrl(meta: CoachShareMeta): string {
  return `crikly.app/${buildDisplaySlug(meta)}`
}

function formatStartDateLabel(yyyymmdd: string | null): string {
  if (!yyyymmdd) return ''
  const d = new Date(yyyymmdd + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  const formatted = d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `Starting ${formatted}`
}

function slugifyForFilename(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'programme'
}

function buildWhatsAppMessage(
  programme: ShareCardModalProgramme,
  shareUrl: string,
): string {
  return `${programme.title}\n${programme.schedule}\n${programme.priceLabel}\n\n${shareUrl}`
}

// ── Component ──

export function ShareCardModal({ isOpen, onClose, programme }: ShareCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [meta, setMeta] = useState<CoachShareMeta | null>(null)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // ── Lazy coach meta fetch on open ──
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const cached = readCoachMetaCache()
    if (cached) {
      setMeta(cached)
      return
    }
    setMetaLoading(true)
    setMetaError(null)
    fetchCoachMeta()
      .then((m) => {
        if (cancelled) return
        setMeta(m)
        writeCoachMetaCache(m)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setMetaError(err instanceof Error ? err.message : 'Failed to load coach profile')
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen])

  // ── ESC closes ──
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // ── Body scroll lock ──
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  const handleWhatsApp = useCallback(() => {
    if (!meta) return
    const shareUrl = buildFullShareUrl(meta, programme.id)
    const text = buildWhatsAppMessage(programme, shareUrl)
    const intent = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(intent, '_blank', 'noopener,noreferrer')
  }, [meta, programme])

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || downloading) return
    setDownloading(true)
    setDownloadError(null)
    try {
      // Code-split: lib only loads when the coach actually triggers a download.
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        cacheBust: true,
      })
      const link = document.createElement('a')
      link.download = `crikly-${slugifyForFilename(programme.title)}-share.png`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('[ShareCardModal] PNG download failed:', err)
      setDownloadError('Download failed. Please try again.')
    } finally {
      setDownloading(false)
    }
  }, [downloading, programme.title])

  if (!isOpen) return null

  const displayShareUrl = meta ? buildDisplayShareUrl(meta) : 'crikly.app/…'
  const coachName = meta?.fullName ?? 'Crikly coach'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-card-modal-title"
      className="fixed inset-0 z-[60]"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0 bg-[rgba(15,23,42,0.55)] backdrop-blur-sm"
      />

      {/* Sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-4 top-1/2 -translate-y-1/2 left-0 right-0 mx-auto bg-white rounded-[20px] pt-3.5 px-5 pb-7 shadow-[0_-12px_32px_-8px_rgba(15,23,42,0.25)] max-h-[92vh] overflow-y-auto max-w-[480px]"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-[18px]">
          <h2
            id="share-card-modal-title"
            className="text-[18px] font-bold tracking-tight text-neutral-900 m-0"
          >
            Share programme
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share programme"
            className="w-8 h-8 rounded-md bg-neutral-50 text-slate-500 hover:bg-neutral-100 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Share card preview */}
        {metaLoading && !meta ? (
          <div
            aria-hidden="true"
            className="w-full aspect-[13/16] rounded-2xl animate-pulse bg-gradient-to-br from-neutral-100 to-neutral-50"
          />
        ) : (
          <ShareCard
            ref={cardRef}
            title={programme.title}
            imageUrl={programme.imageUrl}
            sportName={programme.sportName}
            schedule={programme.schedule}
            startDate={formatStartDateLabel(programme.startsAt)}
            priceLabel={programme.priceLabel}
            coachName={coachName}
            spotsLeft={programme.spotsLeft}
            maxSpots={programme.maxSpots}
            displayShareUrl={displayShareUrl}
          />
        )}

        {metaError && !meta && (
          <p className="text-[12px] text-red-600 mt-2">
            Couldn&apos;t load your coach profile. Sharing will use a temporary link.
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2.5 mt-5">
          <button
            type="button"
            onClick={handleWhatsApp}
            disabled={!meta || downloading}
            className="h-[52px] rounded-[12px] bg-[#25D366] hover:bg-[#1ebd5d] text-white text-[15px] font-bold flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* WhatsApp glyph (no Lucide equivalent) */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-1 3.648 3.979-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
            Share on WhatsApp
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || metaLoading}
            className="h-[52px] rounded-[12px] bg-brand-600 hover:bg-brand-800 text-white text-[15px] font-bold flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            {downloading ? 'Preparing…' : 'Download image'}
          </button>

          {downloadError && (
            <p className="text-[12px] text-red-600 text-center">{downloadError}</p>
          )}
        </div>

        <p className="text-[11px] text-neutral-400 text-center mt-3">
          Opens WhatsApp with your programme link pre-filled.
        </p>
      </div>
    </div>
  )
}
