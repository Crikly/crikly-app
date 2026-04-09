'use client'

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

export interface PopoverProps {
  isOpen: boolean
  onClose: () => void
  anchor: React.RefObject<HTMLElement>
  children: React.ReactNode
  topColour?: string
  className?: string
}

type PopoverPosition = {
  top: number
  left: number
  placement: 'top' | 'bottom'
}

function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }
}

/**
 * Popover
 *
 * Anchored popover that auto-positions above/below the anchor.
 */
export function Popover({ isOpen, onClose, anchor, children, topColour = '#0077CC', className = '' }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<PopoverPosition | null>(null)

  const borderStyle = useMemo(() => ({ borderTopColor: topColour }), [topColour])

  const updatePosition = () => {
    const anchorEl = anchor.current
    const panelEl = panelRef.current
    if (!anchorEl || !panelEl) return

    const rect = anchorEl.getBoundingClientRect()
    const viewport = getViewport()

    const panelRect = panelEl.getBoundingClientRect()
    const gap = 8

    const preferredBottomTop = rect.bottom + viewport.scrollY + gap
    const preferredTopTop = rect.top + viewport.scrollY - panelRect.height - gap

    const hasSpaceBelow = rect.bottom + gap + panelRect.height <= viewport.height
    const placement: 'top' | 'bottom' = hasSpaceBelow ? 'bottom' : 'top'
    const top = placement === 'bottom' ? preferredBottomTop : Math.max(8 + viewport.scrollY, preferredTopTop)

    const left = Math.min(
      Math.max(8 + viewport.scrollX, rect.left + viewport.scrollX + rect.width / 2 - panelRect.width / 2),
      viewport.scrollX + viewport.width - panelRect.width - 8,
    )

    setPosition({ top, left, placement })
  }

  useLayoutEffect(() => {
    if (!isOpen) return
    updatePosition()
    const raf = window.requestAnimationFrame(() => updatePosition())
    return () => window.cancelAnimationFrame(raf)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    const onClick = (e: MouseEvent) => {
      const panelEl = panelRef.current
      const anchorEl = anchor.current
      if (!panelEl) return

      const target = e.target
      if (!(target instanceof Node)) return

      if (panelEl.contains(target)) return
      if (anchorEl && anchorEl.contains(target)) return

      onClose()
    }

    const onReposition = () => updatePosition()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    document.addEventListener('mousedown', onClick)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
      document.removeEventListener('mousedown', onClick)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className={[
        'fixed z-50',
        'bg-white shadow-md rounded-[14px]',
        'border border-neutral-100',
        'min-w-[220px] max-w-[min(360px,calc(100vw-16px))]',
        className,
      ].join(' ')}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        borderTopWidth: 4,
        ...borderStyle,
      }}
      role="dialog"
      aria-label="Popover"
    >
      <button
        type="button"
        aria-label="Close popover"
        onClick={onClose}
        className="absolute top-2 right-2 text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        ✕
      </button>

      <div className="p-4 pt-8">{children}</div>
    </div>
  )
}
