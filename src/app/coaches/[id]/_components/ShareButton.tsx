'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'

export function ShareButton({ coachName }: { coachName: string }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({
        title: `${coachName} · Crikly`,
        text: `Book a session with ${coachName} on Crikly`,
        url,
      })
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleShare}
      className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 flex items-center gap-1.5 hover:bg-gray-50 transition-colors"
      aria-label={`Share ${coachName}'s profile`}
    >
      <Share2 className="w-4 h-4" />
      {copied ? 'Copied!' : 'Share'}
    </button>
  )
}
