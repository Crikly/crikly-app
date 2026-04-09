'use client'

import React, { useEffect, useState } from 'react'

export interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

/**
 * BottomSheet
 *
 * Mobile-first bottom sheet overlay with backdrop.
 */
export function BottomSheet({ isOpen, onClose, title, children, className = '' }: BottomSheetProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      return
    }

    const timer = window.setTimeout(() => setVisible(false), 320)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={[
          'absolute inset-0 bg-neutral-900/30 transition-opacity duration-[320ms]',
          isOpen ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />

      <div
        className={[
          'absolute inset-x-0 bottom-0',
          'bg-white shadow-lg',
          'rounded-t-[20px]',
          'transition-transform duration-[320ms] ease-out',
          isOpen ? 'translate-y-0' : 'translate-y-full',
          className,
        ].join(' ')}
      >
        <div className="relative px-4 pt-3 pb-4">
          <div className="flex justify-center">
            <div
              className="bg-neutral-100 rounded-full"
              style={{ width: 32, height: 4, marginTop: 8 }}
            />
          </div>

          {title ? (
            <div className="mt-4">
              <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
            </div>
          ) : null}

          <div className={title ? 'mt-3' : 'mt-4'}>{children}</div>
        </div>
      </div>
    </div>
  )
}
