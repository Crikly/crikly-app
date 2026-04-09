'use client'
import { useEffect, useState } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose?: () => void
}

const toastClasses: Record<ToastType, string> = {
  success: 'bg-white border-l-4 border-success',
  error:   'bg-white border-l-4 border-danger',
  info:    'bg-white border-l-4 border-brand-600',
  warning: 'bg-white border-l-4 border-warning',
}

const iconClasses: Record<ToastType, string> = {
  success: 'text-success',
  error:   'text-danger',
  info:    'text-brand-600',
  warning: 'text-warning',
}

export function Toast({ message, type = 'info', duration = 4000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onClose?.()
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  if (!visible) return null

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 px-4 py-3 rounded-lg shadow-md',
        'text-neutral-900 text-sm min-w-[280px] max-w-sm',
        toastClasses[type],
      ].join(' ')}
    >
      <span className={['font-semibold', iconClasses[type]].join(' ')}>
        {type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ'}
      </span>
      <p className="flex-1 leading-snug">{message}</p>
      <button
        onClick={() => { setVisible(false); onClose?.() }}
        className="text-neutral-400 hover:text-neutral-600 transition-colors"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
